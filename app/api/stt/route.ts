// 文件: app/api/stt/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import axios from 'axios';
import { Buffer } from 'buffer';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// --- 科大讯飞 Lfasr API 配置 ---
const IFLYTEK_HOST = 'raasr.xfyun.cn'; // 使用 https
const IFLYTEK_UPLOAD_PATH = '/v2/api/upload'; // POST
const IFLYTEK_GET_RESULT_PATH = '/v2/api/getResult'; // GET

const APP_ID = process.env.IFLYTEK_APPID;
const API_SECRET = process.env.IFLYTEK_API_SECRET; // 使用 Secret 进行签名
// --- 配置结束 ---

function generateSigna(appId: string, ts: string, apiSecret: string): string {
    const baseString = appId + ts;
    const md5Hash = crypto.createHash('md5').update(baseString).digest('hex');
    const signa = crypto.createHmac('sha1', apiSecret).update(md5Hash).digest('base64');
    return signa;
}

/**
 * 轮询检查任务进度
 */
async function pollForResultV2(orderId: string, appId: string, apiSecret: string, retries = 20): Promise<string | null> {
    if (retries <= 0) { console.error('Polling timed out for order:', orderId); return null; }
    const ts = Math.floor(Date.now() / 1000).toString();
    const signa = generateSigna(appId, ts, apiSecret);
    // (修复!) 所有参数都在 URL 查询参数中
    const queryParams = new URLSearchParams({
        appId: appId, // 注意文档示例用 appId，我们保持一致
        signa: signa,
        ts: ts,
        orderId: orderId, // 使用 orderId
        resultType: 'transfer', // 获取转写结果
    });
    const url = `https://${IFLYTEK_HOST}${IFLYTEK_GET_RESULT_PATH}?${queryParams.toString()}`;

    try {
        console.log(`Polling result with GET: ${url}`); // 调试 GET 请求
        // (修复!) 使用 GET 请求
        const response = await axios.get(url, { timeout: 10000 }); // 增加超时
        console.log('Polling response:', response.data);

        // (修复!) 根据新文档的返回结构判断
        if (response.data?.code === '000000' && response.data?.content) {
            const content = response.data.content;
            const orderInfo = content.orderInfo;
            const orderResultStr = content.orderResult; // 这是 JSON 字符串

            if (orderInfo?.status === 4) { // 4 表示已完成
                console.log('Task', orderId, 'finished successfully.');
                if (orderResultStr) {
                    try {
                        // 解析 orderResult JSON 字符串
                        const orderResult = JSON.parse(orderResultStr);
                        // 从 lattice 或 lattice2 提取结果 (与之前类似)
                        const lattices = orderResult.lattice2 || orderResult.lattice || [];
                        const fullResult = lattices.map((item: any) => {
                            try {
                                const json_1best = JSON.parse(item.json_1best);
                                return json_1best?.st?.rt?.map((rt: any) => rt.ws.map((w: any) => w.cw[0].w).join('')).join('') || '';
                            } catch { return ''; }
                        }).join('');

                        console.log("Recognized sentence:", fullResult);
                        return fullResult || "未识别到内容";
                    } catch (parseError) {
                        console.error("Error parsing orderResult:", parseError, orderResultStr);
                        return "结果解析错误";
                    }
                } else {
                    console.warn("Task finished but orderResult is empty.");
                    return "未识别到内容";
                }
            } else if (orderInfo?.status === -1) { // -1 表示失败
                console.error('iFlytek task failed:', orderInfo.failType);
                return null;
            } else { // 0, 3 表示处理中
                console.log('Task', orderId, 'still processing, status:', orderInfo?.status, ", retrying...");
                await new Promise(resolve => setTimeout(resolve, 5000));
                return await pollForResultV2(orderId, appId, apiSecret, retries - 1);
            }
        } else {
            // 处理 code 不是 "000000" 的情况
            console.error(`Error polling result: code=${response.data?.code}, descInfo=${response.data?.descInfo}`);
            // 可以根据 specific error codes 决定是否重试
            await new Promise(resolve => setTimeout(resolve, 5000));
            return await pollForResultV2(orderId, appId, apiSecret, retries - 1); // 暂时重试
        }
    } catch (error: any) {
        console.error('Axios error during polling:', error.message);
        if (axios.isAxiosError(error)) {
             console.error('Axios error details:', error.code, error.response?.status, error.response?.data);
        }
        // 网络错误等也重试
        await new Promise(resolve => setTimeout(resolve, 5000));
        return await pollForResultV2(orderId, appId, apiSecret, retries - 1); // 暂时重试
    }
}


// --- API Route Handler ---
export async function POST(request: NextRequest) {
    console.log('--- [/api/stt] Received POST request ---');

    // 0. 检查凭据
    const currentAppId = process.env.IFLYTEK_APPID;
    const currentApiSecret = process.env.IFLYTEK_API_SECRET;
    if (!currentAppId || !currentApiSecret) {
        console.error('Error: IFLYTEK_APPID or IFLYTEK_API_SECRET missing!');
        return NextResponse.json({ error: 'iFlytek credentials not set' }, { status: 500 });
    }

    // 1. 验证用户
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }


    let tempInputPath: string | null = null;
    let tempOutputPath: string | null = null;
    let orderId: string | null = null; // (新) 使用 orderId
    
    try {
        // 2. 获取、保存、转换音频
        const formData = await request.formData();
        const audioFile = formData.get('audio') as File | null;
        if (!audioFile) { return NextResponse.json({ error: 'No audio file' }, { status: 400 }); }
        console.log(`Received audio file: name=${audioFile.name}, size=${audioFile.size}, type=${audioFile.type}`);
        const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
        const uniqueSuffix = crypto.randomBytes(6).toString('hex');
        const inputFileName = `input-${uniqueSuffix}.${audioFile.type.split('/')[1] || 'tmp'}`;
        const outputFileName = `output-${uniqueSuffix}.wav`;
        tempInputPath = path.join(os.tmpdir(), inputFileName);
        tempOutputPath = path.join(os.tmpdir(), outputFileName);
        await fs.writeFile(tempInputPath, audioBuffer);
        const ffmpegCommand = `ffmpeg -i "${tempInputPath}" -vn -af "silenceremove=start_periods=1:start_duration=0.5:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_duration=0.5:start_threshold=-50dB,areverse" -acodec pcm_s16le -ar 16000 -ac 1 -y "${tempOutputPath}"`;
        console.log(`Executing ffmpeg command: ${ffmpegCommand}`);
        try {
            const { stdout, stderr } = await execAsync(ffmpegCommand);
            if (stderr) { console.error(`ffmpeg stderr: ${stderr}`); }
            console.log(`Successfully converted audio to: ${tempOutputPath}`);
        } catch (ffmpegError: any) {
            console.error(`ffmpeg execution failed: ${ffmpegError.message}`);
             if (ffmpegError.stderr) { console.error(`ffmpeg stderr on error: ${ffmpegError.stderr}`);}
            throw new Error(`Audio conversion failed: ${ffmpegError.message}`);
        }
        const convertedAudioBuffer = await fs.readFile(tempOutputPath);
        const convertedFileName = outputFileName;
        const fileLen = convertedAudioBuffer.length;
        if (fileLen === 0) { throw new Error("Converted audio file is empty."); }
        console.log(`Successfully converted audio to WAV, size: ${fileLen} bytes`);

        const duration = 200;
        
        // --- 调用 Upload 接口 ---
        console.log('Calling iFlytek Upload API (V2 Simplified)...');
        const tsUpload = Math.floor(Date.now() / 1000).toString();
        const signaUpload = generateSigna(currentAppId, tsUpload, currentApiSecret);
        const uploadQueryParams = new URLSearchParams({
            appId: currentAppId, // 使用 appId
            signa: signaUpload,
            ts: tsUpload,
            fileName: convertedFileName, // 传递文件名
            fileSize: fileLen.toString(), // 传递文件大小
            duration: duration.toString(), // 传递时长 (可随机)
            language: 'cn', // 默认中文
            // 可以添加其他参数如 hotWord 等
        });
       const uploadUrl = `https://${IFLYTEK_HOST}${IFLYTEK_UPLOAD_PATH}?${uploadQueryParams.toString()}`;
       const uploadHeaders = {
             'Content-Type': 'application/octet-stream'
             // Chunked: false (axios 默认或自动处理)
        };
       // --- DEBUG: 打印 Upload 请求详情 ---
        console.log('--- [DEBUG Upload Request V2 Simplified] ---');
        console.log('URL:', uploadUrl);
        console.log('Headers:', uploadHeaders);
        console.log('Body size:', convertedAudioBuffer.length);
        console.log('-------------------------------------------');
        // --- DEBUG END ---

        const uploadResponse = await axios.post(uploadUrl, convertedAudioBuffer, {
             headers: uploadHeaders,
             timeout: 120000, // 增加上传超时时间
             // (重要) 需要告诉 axios 不要转换请求体 (发送原始 Buffer)
             transformRequest: [(data, headers) => data],
             // (可选) 监听上传进度
             // onUploadProgress: (progressEvent) => {
             //    console.log(`Upload Progress: ${Math.round((progressEvent.loaded * 100) / progressEvent.total)}%`);
             // }
        });
        console.log('Upload response:', uploadResponse.data);
        // (修复!) 根据新文档的返回结构判断
        if (uploadResponse.data?.code === '000000' && uploadResponse.data?.content?.orderId) {
            orderId = uploadResponse.data.content.orderId; // 获取订单 ID
            console.log('Upload successful. Order ID:', orderId);

            // --- (新!) 开始轮询获取结果 (使用 GET) ---
            console.log('Starting polling for result (V2 Simplified)...');
            const recognizedText = await pollForResultV2(orderId, currentAppId, currentApiSecret);
            if (recognizedText !== null) {
                return NextResponse.json({ text: recognizedText });
            } else {
                return NextResponse.json({ error: 'Failed to get result after polling' }, { status: 500 });
            }
        } else {
             console.error('iFlytek upload failed:', uploadResponse.data);
             // 返回更详细的错误
             return NextResponse.json({ error: `Upload failed: ${uploadResponse.data?.code} - ${uploadResponse.data?.descInfo || 'Check API logs'}` }, { status: 500 });
        }

    } catch (error: any) {
        // 记录完整的错误信息
        console.error('Error in POST /api/stt:', error.message);
        // 如果是 Axios 错误，记录响应体
        if (axios.isAxiosError(error)) {
            console.error('Axios error details:', {
                code: error.code,
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
                // (新) 打印请求配置，帮助确认发送的内容
                config: {
                     url: error.config?.url,
                     method: error.config?.method,
                     headers: error.config?.headers,
                     data: error.config?.data // 对于 FormData 可能不完整
                }
            });
        } else {
             console.error('Non-Axios error details:', error); // 打印其他类型错误的细节
        }
        // 向客户端返回一个通用的错误消息
        return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
    } finally {
        // --- 清理临时文件 ---
        console.log("Cleaning up temporary files...");
        if (tempInputPath) {
            try {
                await fs.unlink(tempInputPath);
                console.log(`Deleted temp input file: ${tempInputPath}`);
            } catch (unlinkError: any) {
                console.error(`Error deleting temp input file ${tempInputPath}:`, unlinkError.message);
            }
        }
        if (tempOutputPath) {
            try {
                // (修复) 移除 readFile 检查，直接尝试删除
                await fs.unlink(tempOutputPath);
                console.log(`Deleted temp output file: ${tempOutputPath}`);
            } catch (unlinkError: any) {
                // 如果文件不存在 (e.g., ffmpeg 失败)，unlink 会报错，忽略这个特定错误
                if (unlinkError.code !== 'ENOENT') {
                    console.error(`Error deleting temp output file ${tempOutputPath}:`, unlinkError.message);
                }
            }
        }
        console.log("Cleanup finished.");
    }
}