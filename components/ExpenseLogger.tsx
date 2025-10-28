// 文件: components/ExpenseLogger.tsx
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import CryptoJS from 'crypto-js'; // 导入 CryptoJS

// --- 科大讯飞 WebSocket (iat) 配置 ---
const APPID = process.env.NEXT_PUBLIC_IFLYTEK_APPID || "";
const API_KEY = process.env.NEXT_PUBLIC_IFLYTEK_API_KEY || "";
const API_SECRET = process.env.NEXT_PUBLIC_IFLYTEK_API_SECRET || "";
const WEBSOCKET_URL = "wss://iat-api.xfyun.cn/v2/iat";
const HOST = "iat-api.xfyun.cn";
// --- 配置结束 ---

/**
 * 将 Float32 PCM 数据转换为 Int16 PCM 数据 ([-1, 1] -> [-32768, 32767])
 */
function float32ToInt16(buffer: Float32Array): Int16Array {
    let l = buffer.length;
    const buf = new Int16Array(l);
    while (l--) {
        buf[l] = Math.min(1, buffer[l]) * 0x7FFF; // 0x7FFF = 32767
    }
    return buf;
}

/**
 * (可选，如果需要重采样) 简单的线性插值重采样
 * @param inputData Int16 PCM 数据
 * @param inputSampleRate 输入采样率
 * @param outputSampleRate 目标采样率 (e.g., 16000)
 * @returns 重采样后的 Int16Array
 */
function resample(inputData: Int16Array, inputSampleRate: number, outputSampleRate: number): Int16Array {
    if (inputSampleRate === outputSampleRate) {
        return inputData;
    }
    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.floor(inputData.length / ratio);
    const outputData = new Int16Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
        const inputIndex = i * ratio;
        const index1 = Math.floor(inputIndex);
        const index2 = Math.min(index1 + 1, inputData.length - 1);
        const weight = inputIndex - index1;
        // 线性插值
        outputData[i] = Math.round(inputData[index1] * (1 - weight) + inputData[index2] * weight);
    }
    return outputData;
}

/** 获取 WebSocket URL */
function getWebSocketUrl(): string | null {
    if (!API_KEY || !API_SECRET) { console.error("讯飞 API Key 或 Secret 未配置!"); return null; }
    try {
        const date = new Date().toGMTString();
        const algorithm = "hmac-sha256";
        const headers = "host date request-line";
        const signatureOrigin = `host: ${HOST}\ndate: ${date}\nGET /v2/iat HTTP/1.1`;
        const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, API_SECRET);
        const signature = CryptoJS.enc.Base64.stringify(signatureSha);
        const authorizationOrigin = `api_key="${API_KEY}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`;
        const authorization = btoa(authorizationOrigin);
        const url = `${WEBSOCKET_URL}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(HOST)}`;
        // console.log("Generated WS URL:", url); // 调试
        return url;
    } catch (error) { console.error("生成 WebSocket URL 时出错:", error); return null; }
}

/** ArrayBuffer to Base64 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); }
    return window.btoa(binary);
}

// 定义讯飞返回的数据结构 (简化)
interface IatResultData {
    result?: { ws?: { cw?: { w?: string }[] }[] };
    status?: number; // 0: 开始, 1: 中间结果, 2: 最终结果
    pgs?: 'apd' | 'rpl'; // 动态修正
}
interface IatResponse {
    code: number;
    message: string;
    data?: IatResultData;
    sid?: string;
}

export function ExpenseLogger({ planId }: { planId: string }) {
    const router = useRouter();
    const [status, setStatus] = useState<'idle' | 'connecting' | 'recording' | 'processing' | 'finishing'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [textInput, setTextInput] = useState('');
    const [recognizedText, setRecognizedText] = useState('');
    const finalTranscriptRef = useRef('');

    const websocketRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
   const audioBufferRef = useRef<Int16Array[]>([]); // 存储 Int16 PCM 数据块
   const scriptProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null); // 保存 source 节点以便断开
   
    // --- 核心函数 1: 处理最终识别出的文本 (调用记账 API) ---
    const handleFinalTranscript = useCallback(async (transcript: string) => {
        if (!transcript.trim()) {
            setError("未识别到有效内容");
            setStatus('idle');
            return;
        }
        console.log("最终识别结果:", transcript);
        setStatus('processing');
        setError(null);
        setSuccess(null);
        try {
            const response = await fetch('/api/log-expense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: transcript, plan_id: planId }),
            });
            if (!response.ok) {
                const errData = await response.json(); throw new Error(errData.error || '记账失败');
            }
            const result = await response.json();
            setSuccess(`记账成功: ${result.logged.item} - ${result.logged.amount} ${result.logged.currency}`);
            router.refresh();
        } catch (err: any) {
            setError(err.message || '记账失败，请重试');
        } finally {
            setStatus('idle');
        }
    }, [planId, router]);

    // --- 核心函数 2: WebSocket 消息处理 ---
    const handleWebSocketMessage = useCallback((event: MessageEvent) => {
        console.log('[DEBUG handleWebSocketMessage] Received raw message:', event.data);
        try {
            const jsonData: IatResponse = JSON.parse(event.data);
            console.log("Parsed WS message:", jsonData);

            if (jsonData.code !== 0) {
                setError(`讯飞 API 错误 ${jsonData.code}: ${jsonData.message}`);
                if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
                    websocketRef.current.close();
                }
                setStatus('idle');
                return;
            }

            if (jsonData.data && jsonData.data.result) {
                let currentResult = "";
                const wsData = jsonData.data.result.ws || [];
                for (let i = 0; i < wsData.length; i++) {
                    currentResult += wsData[i].cw?.[0]?.w || "";
                }
                if (jsonData.data.pgs) {
                    if (jsonData.data.pgs === 'apd') {
                        finalTranscriptRef.current = recognizedText;
                    }
                    setRecognizedText(finalTranscriptRef.current + currentResult);
                } else {
                    finalTranscriptRef.current = finalTranscriptRef.current + currentResult;
                    setRecognizedText(finalTranscriptRef.current);
                }
            }

            if (jsonData.data && jsonData.data.status === 2) {
                console.log('[DEBUG handleWebSocketMessage] Status 2 detected! Processing final transcript.');
                const finalTranscript = recognizedText || finalTranscriptRef.current;
                setRecognizedText(""); finalTranscriptRef.current = "";
                if (websocketRef.current) websocketRef.current.close();
                handleFinalTranscript(finalTranscript);
                setStatus('finishing');
            }
        } catch (e) {
            console.error("解析 WebSocket 消息失败:", e);
            setError("无法处理识别结果");
            setStatus('idle');
        }
    }, [handleFinalTranscript, recognizedText]);

     // --- 核心函数 3: WebSocket 连接与断开 ---
    const connectWebSocket = useCallback(() => {
        const wsUrl = getWebSocketUrl();
        if (!wsUrl) { setError("无法生成 WebSocket URL，请检查讯飞凭据配置"); setStatus('idle'); return; }
        if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) { return; }

        console.log("Connecting to WebSocket...");
        setStatus('connecting');
        setError(null); setSuccess(null); setRecognizedText(""); finalTranscriptRef.current = "";

        const ws = new WebSocket(wsUrl);
        websocketRef.current = ws;

        ws.onopen = () => { console.log("WebSocket 连接成功"); startRecording(); }; // 连接成功后开始录音
        ws.onmessage = handleWebSocketMessage;
        ws.onerror = (event) => {
            console.error("[DEBUG ws.onerror] WebSocket 错误:", event);
            setError("WebSocket 连接错误"); setStatus('idle'); stopRecordingAndStream();
        };
        ws.onclose = (event) => {
            console.log(`[DEBUG ws.onclose] WebSocket 连接关闭: Code=${event.code}, Reason=${event.reason}, WasClean=${event.wasClean}`);
             // 只有在非 'finishing' 状态下的关闭才认为是意外中断
            if (status !== 'finishing') {
                 // setError("WebSocket 连接意外关闭"); // 避免在正常停止时也报错误
                 console.warn("WebSocket 连接意外关闭或无法连接");
                 setStatus('idle');
            } else {
                 console.log("WebSocket closed normally after finishing.");
                 // finishing 状态下的关闭是正常的，由 handleFinalTranscript 转为 idle
            }
            stopRecordingAndStream(); // 确保资源被释放
        };
    // 注意：这里移除 handleWebSocketMessage 的依赖，因为它内部依赖 recognizedText 状态，会导致每次 recognizedText 变化都重新创建 connectWebSocket 函数，可能引发问题。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]); // 依赖 status 以便在 onclose 中判断是否意外关闭

   // --- 音频处理核心: onaudioprocess 回调 ---
    // (注意: 这个回调会在主线程执行，可能导致 UI 卡顿)
    const handleAudioProcess = useCallback((event: AudioProcessingEvent) => {
        if (status !== 'recording') return; // 确保只在录音时处理

        // 获取原始 Float32 PCM 数据
        const inputData = event.inputBuffer.getChannelData(0);

        // 转换为 Int16 PCM
        const pcmData = float32ToInt16(inputData);

        // (重要!) 检查并进行重采样 (如果需要)
        let resampledPcmData = pcmData;
        const currentSampleRate = audioContextRef.current?.sampleRate;
        if (currentSampleRate && currentSampleRate !== 16000) {
            // console.log(`Resampling from ${currentSampleRate} to 16000`); // 调试
            resampledPcmData = resample(pcmData, currentSampleRate, 16000);
        }

        // 将处理后的 Int16 数据块存入缓冲区
        audioBufferRef.current.push(resampledPcmData);

        // --- 分块发送逻辑 ---
        const bytesPerSample = 2; // Int16 = 2 bytes
        const frameSizeInSamples = 1280 / bytesPerSample; // 640 samples per frame (40ms * 16kHz)
        let totalSamplesInBuffer = audioBufferRef.current.reduce((sum, arr) => sum + arr.length, 0);

        // 检查缓冲区是否有足够的数据来发送一帧或多帧
        while (totalSamplesInBuffer >= frameSizeInSamples) {
            const frameToSend = new Int16Array(frameSizeInSamples);
            let samplesCopied = 0;
            let buffersToRemove = 0;

            // 从缓冲区前面取出数据填充帧
            for (let i = 0; i < audioBufferRef.current.length; i++) {
                const buffer = audioBufferRef.current[i];
                const samplesToCopy = Math.min(buffer.length, frameSizeInSamples - samplesCopied);
                frameToSend.set(buffer.subarray(0, samplesToCopy), samplesCopied);
                samplesCopied += samplesToCopy;

                if (samplesToCopy === buffer.length) {
                    buffersToRemove++; // 这个 buffer 已经用完
                } else {
                    // 这个 buffer 只用了一部分，移除已复制的部分
                    audioBufferRef.current[i] = buffer.subarray(samplesToCopy);
                    break; // 帧已填满
                }
                if (samplesCopied === frameSizeInSamples) break; // 帧已填满
            }

            // 移除已完全使用的 buffer
            audioBufferRef.current.splice(0, buffersToRemove);

            // 更新缓冲区样本总数
            totalSamplesInBuffer = audioBufferRef.current.reduce((sum, arr) => sum + arr.length, 0);

            // Base64 编码并发送帧
            const audioBase64 = arrayBufferToBase64(frameToSend.buffer);
            if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
                const audioFrame = { data: { status: 1, format: "audio/L16;rate=16000", encoding: "raw", audio: audioBase64 } };
                try {
                    websocketRef.current.send(JSON.stringify(audioFrame));
                    // console.log("Sent audio frame (PCM), size:", frameToSend.byteLength); // 调试
                } catch (sendError) {
                    console.error("Error sending audio frame:", sendError);
                    // 可以考虑在这里停止录音并关闭连接
                }
            } else {
                 console.warn("WebSocket not open when trying to send audio frame.");
                 // 应该停止录音
                 stopRecordingAndStream();
                 break; // 停止发送循环
            }
        }
    }, [status]); // 依赖 status

    // --- MediaRecorder 录音控制 (现在使用 AudioContext) ---
    const startRecording = useCallback(async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { /* ... 错误处理 ... */ return; }
        if (!websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) { /* ... 错误处理 ... */ return; }

        console.log("Attempting to start recording using AudioContext...");
        setStatus('recording');
        audioBufferRef.current = []; // 清空缓冲区
        setError(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // 关闭旧的 AudioContext (如果存在)
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                await audioContextRef.current.close();
            }
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 16000 // 尝试请求 16kHz，但不一定成功
            });
            console.log("AudioContext created. Sample rate:", audioContextRef.current.sampleRate);

            mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(stream);

            // 创建 ScriptProcessorNode
            const bufferSize = 4096; // 缓冲区大小，可以调整
            // 参数: bufferSize, inputChannels, outputChannels
            scriptProcessorNodeRef.current = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1);

            // 绑定处理函数
            scriptProcessorNodeRef.current.onaudioprocess = handleAudioProcess;

            // 连接节点: source -> processor -> destination (必须连接到 destination 才能触发 onaudioprocess)
            mediaStreamSourceRef.current.connect(scriptProcessorNodeRef.current);
            scriptProcessorNodeRef.current.connect(audioContextRef.current.destination);

            // 发送第一帧参数
            const firstFrameParams = { common: { app_id: APPID }, business: { language: "zh_cn", domain: "iat", accent: "mandarin", vad_eos: 5000 }, data: { status: 0, format: "audio/L16;rate=16000", encoding: "raw" } };
            websocketRef.current.send(JSON.stringify(firstFrameParams));
            console.log("Sent first frame params");

        } catch (err) {
            console.error('获取麦克风权限或启动 AudioContext 失败:', err); setError('无法访问麦克风或启动录音，请检查权限。'); setStatus('idle');
        }
    // 移除 handleAudioProcess 依赖，因为它内部依赖 status，会导致循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
   
    // 停止录音、媒体流和 AudioContext (如果使用了)
    const stopRecordingAndStream = useCallback(() => {
        let stopped = false;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            console.log("[DEBUG stopRecordingAndStream] Calling mediaRecorder.stop()");
            mediaRecorderRef.current.stop(); // 触发 onstop
            stopped = true;
        } else {
            console.log("[DEBUG stopRecordingAndStream] MediaRecorder not recording or not initialized.");
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null;
            console.log("Stopped media stream tracks.");
            stopped = true;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().then(() => console.log("AudioContext closed."));
            audioContextRef.current = null;
            stopped = true;
        }
        if (stopped) {
            console.log("Stopped recording and streams.");
        }
         // 不再需要 audioProcessorNode 的清理
    }, []); // 空依赖数组，这个函数本身不依赖外部状态




    // 语音按钮点击处理
    const handleMicClick = () => {
        if (status === 'recording' || status === 'connecting') {
            console.log("[DEBUG handleMicClick] Stopping recording/connection...");
            stopRecordingAndStream(); // 请求停止录音 (会触发 onstop)
            // 在 onstop 发送最后一帧后，状态变为 finishing，等待 WS 关闭
        } else if (status === 'idle') {
            console.log("[DEBUG handleMicClick] Starting connection...");
            connectWebSocket(); // 开始连接过程
        } else if (status === 'finishing'){
             console.log("[DEBUG handleMicClick] Clicked while finishing, attempting to close WS...");
             // 如果在结束过程中点击，尝试强制关闭 WS 并回到 idle
             if (websocketRef.current && (websocketRef.current.readyState === WebSocket.OPEN || websocketRef.current.readyState === WebSocket.CONNECTING)) {
                websocketRef.current.close();
            }
            setStatus('idle');
        }
    };

    // 文本提交 Handler
    const handleTextSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // 只有在 idle 状态下才允许提交
        if (status !== 'idle' || !textInput.trim()) return;
        await handleFinalTranscript(textInput); // 直接调用记账函数
        setTextInput('');
    };

    // 添加清理 Effect
    useEffect(() => {
        return () => {
            console.log("[DEBUG useEffect Cleanup] Component unmounting...");
            stopRecordingAndStream();
            if (websocketRef.current) {
                console.log("[DEBUG useEffect Cleanup] Closing WebSocket.");
                websocketRef.current.close();
            }
        };
    }, [stopRecordingAndStream]);

    return (
        <Card>
            <CardHeader><CardTitle>语音 / 文字记账 (WebSocket)</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
                {/* 语音按钮 */}
                <p className="text-sm text-muted-foreground">
                    {status === 'connecting' ? "连接中..." :
                     status === 'recording' ? "正在录音... 点击停止" :
                     status === 'finishing' ? "处理结束信号..." :
                     status === 'processing' ? "正在保存记录..." :
                     "点击按钮说出开销"}
                </p>
                <Button
                    type="button"
                    variant={(status === 'recording' || status === 'connecting' || status === 'finishing') ? 'destructive' : 'outline'}
                    size="icon"
                    className="h-20 w-20 rounded-full"
                    onClick={handleMicClick}
                    disabled={status === 'processing'} // 只有在调用记账 API 时完全禁用
                    title={ (status === 'recording' || status === 'connecting' || status === 'finishing') ? "停止" : "开始录音"}
                >
                    <Mic className="h-10 w-10" />
                </Button>

                {/* 显示实时识别结果 */}
                {recognizedText && <p className="text-sm italic">正在识别: {recognizedText}</p>}

                <p className="text-sm text-muted-foreground">或手动输入</p>
                {/* 文本输入表单 */}
                <form onSubmit={handleTextSubmit} className="w-full flex gap-2">
                     <Input
                        type="text"
                        placeholder="例如: 纪念品 3000 JPY"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        // 只有在 idle 状态时才启用
                        disabled={status !== 'idle'}
                    />
                    <Button
                        type="submit"
                        // 只有在 idle 且有内容时才启用
                        disabled={status !== 'idle' || !textInput.trim()}
                    >
                         {/* 根据状态显示不同文本 */}
                         {status === 'processing' ? '保存中...' : '保存'}
                    </Button>
                </form>

                {/* 状态显示 */}
                {(status === 'processing') && <p>正在保存记录...</p>}
                {status === 'finishing' && <p>正在结束识别...</p>}

                {error && (<Alert variant="destructive"><AlertTitle>错误</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>)}
                {success && (<Alert variant="default" className="text-green-700"><AlertTitle>成功</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>)}
            </CardContent>
        </Card>
    );
}