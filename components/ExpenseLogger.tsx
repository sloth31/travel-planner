// 文件: components/ExpenseLogger.tsx
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";

const MIN_RECORDING_DURATION_MS = 500; // 0.5 秒

export function ExpenseLogger({ planId }: { planId: string }) {
    const router = useRouter();
    // (简化) 使用 'idle', 'recording', 'processing' 状态
    const [status, setStatus] = useState<'idle' | 'recording' | 'processing'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [textInput, setTextInput] = useState('');
    const recordingStartTimeRef = useRef<number | null>(null);

    // MediaRecorder 相关
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    // --- 核心函数 1: 处理识别出的文本 (调用记账 API) ---
    const handleRecognizedText = useCallback(async (transcript: string) => {
        if (!transcript || transcript.trim() === "" || transcript === "未识别到内容") {
            console.warn("STT returned empty or 'not recognized' result:", transcript);
            setError("无法识别语音内容，请重试或手动输入。");
            setStatus('idle'); // 重置状态
            return; // 阻止后续记账调用
        }
        console.log("最终识别结果:", transcript);
        setStatus('processing'); // 开始调用记账 API
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
            setStatus('idle'); // 记账 API 调用结束
        }
    }, [planId, router]);

    // --- 核心函数 2: 发送音频到后端 STT API ---
    const sendAudioToBackend = useCallback(async (audioBlob: Blob) => {
        console.log("Sending audio blob to /api/stt, size:", audioBlob.size, "type:", audioBlob.type);
        setStatus('processing'); // 开始调用 STT API
        setError(null);
        setSuccess(null);

        const formData = new FormData();
        // 发送原始 Blob，让后端处理格式；文件名可以简单点
        formData.append('audio', audioBlob, `recording.${audioBlob.type.split('/')[1] || 'webm'}`);

        try {
            const response = await fetch('/api/stt', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json();
                console.error("STT API Error Response:", errData); // 打印详细错误
                throw new Error(errData.error || '语音识别请求失败');
            }

            const result = await response.json();
            if (result.hasOwnProperty('text')) { // 检查 text 字段是否存在
                await handleRecognizedText(result.text); // 调用统一处理函数
            } else {
                 console.error("STT API returned unexpected format:", result);
                 throw new Error(result.error || '语音识别结果格式错误');
            }

        } catch (err: any) {
            console.error("Error sending audio or processing STT response:", err);
            setError(err.message || '语音识别或记账过程中出错');
            setStatus('idle'); // 确保状态重置
        }
        // finally 由 handleRecognizedText 处理
    }, [handleRecognizedText]); // 依赖 handleRecognizedText


    // --- MediaRecorder 录音控制 ---
    const startRecording = useCallback(async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setError('浏览器不支持录音功能'); setStatus('idle'); return;
        }
        setStatus('recording'); // 设置录音状态
        setError(null);
        setSuccess(null);
        audioChunksRef.current = []; // 清空之前的块

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // (恢复) 使用 MediaRecorder，尝试 webm 格式
            const options = { mimeType: 'audio/webm;codecs=opus' };
            let recorder: MediaRecorder;
            try {
                 recorder = new MediaRecorder(stream, options);
                 console.log("Using mimeType:", recorder.mimeType);
            } catch (e) {
                 console.warn("Requested mimeType not supported, trying default.");
                 recorder = new MediaRecorder(stream);
                 console.log("Using default mimeType:", recorder.mimeType);
            }
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = () => {
               console.log("[DEBUG recorder.onstop] Triggered!");
               const recordingEndTime = Date.now(); // (新!) 记录结束时间
                const duration = recordingEndTime - (recordingStartTimeRef.current || recordingEndTime);
                recordingStartTimeRef.current = null; // 重置开始时间
                if (duration < MIN_RECORDING_DURATION_MS) {
                    console.warn(`Recording too short: ${duration}ms`);
                    setError(`录音时间太短 (至少 ${MIN_RECORDING_DURATION_MS / 1000} 秒)，请重试。`);
                    setStatus('idle'); // 回到空闲状态
                    // 清理 stream (如果在 startRecording 中获取)
                    if (streamRef.current) {
                         streamRef.current.getTracks().forEach(track => track.stop());
                         streamRef.current = null;
                         console.log("Stopped media stream tracks due to short duration.");
                    }
                    return; // 阻止发送
                }
         
                if (audioChunksRef.current.length === 0) {
                    console.warn("No audio chunks recorded.");
                    setStatus('idle'); // 没有录到内容，直接返回 idle
                    return;
                }
                // 使用正确的 MIME 类型创建 Blob
                const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                sendAudioToBackend(audioBlob); // 发送给后端

                // 清理 stream
                if (streamRef.current) {
                     streamRef.current.getTracks().forEach(track => track.stop());
                     streamRef.current = null;
                     console.log("Stopped media stream tracks after recording stopped.");
                }
            };

            recorder.start();
            console.log("MediaRecorder started");

        } catch (err) {
            console.error('获取麦克风权限或开始录音失败:', err); setError('无法访问麦克风或开始录音，请检查权限。'); setStatus('idle');
        }
    }, [sendAudioToBackend]); // 依赖 sendAudioToBackend

    // 停止录音和媒体流
    const stopRecordingAndStream = useCallback(() => {
        let stopped = false;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            console.log("[DEBUG stopRecordingAndStream] Calling mediaRecorder.stop()");
            mediaRecorderRef.current.stop(); // 触发 onstop
            stopped = true;
        } else {
            console.log("[DEBUG stopRecordingAndStream] MediaRecorder not recording or already stopped.");
        }

        if (stopped) {
            console.log("Requested MediaRecorder stop.");
        }
    }, []);

    // 语音按钮点击处理
    const handleMicClick = () => {
        if (status === 'recording') {
            console.log("[DEBUG handleMicClick] Stopping recording...");
            stopRecordingAndStream(); // 请求停止录音 (会触发 onstop)
        } else if (status === 'idle') {
            console.log("[DEBUG handleMicClick] Starting recording...");
            startRecording(); // 开始录音过程
        } else {
            console.log("[DEBUG handleMicClick] Clicked in status:", status, "- Action ignored.");
            // 在 processing 状态下忽略点击
        }
    };

    // 文本提交 Handler
    const handleTextSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (status !== 'idle' || !textInput.trim()) return;
        await handleRecognizedText(textInput); // 直接调用记账函数
        setTextInput('');
    };

    // 清理 Effect
    useEffect(() => {
        return () => {
            console.log("[DEBUG useEffect Cleanup] Component unmounting...");
            // 确保停止录音和流
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                mediaRecorderRef.current.stop();
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []); // 空依赖，只在卸载时执行

    return (
        <Card>
            <CardHeader><CardTitle>语音 / 文字记账 (HTTP)</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
                <p className="text-sm text-muted-foreground">
                    {status === 'recording' ? "正在录音... 点击停止" :
                     status === 'processing' ? "正在处理..." :
                     "点击按钮说出开销"}
                </p>
                <Button
                    type="button"
                    variant={status === 'recording' ? 'destructive' : 'outline'}
                    size="icon"
                    className="h-20 w-20 rounded-full"
                    onClick={handleMicClick}
                    disabled={status === 'processing'} // 只有在处理 API 时完全禁用
                    title={ status === 'recording' ? "停止录音" : "开始录音"}
                >
                    <Mic className="h-10 w-10" />
                </Button>

                {/* (移除) 不再需要显示实时识别结果 */}
                {/* {recognizedText && <p>...</p>} */}

                <p className="text-sm text-muted-foreground">或手动输入</p>
                <form onSubmit={handleTextSubmit} className="w-full flex gap-2">
                     <Input
                        type="text"
                        placeholder="例如: 纪念品 3000 JPY"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        disabled={status !== 'idle'} // 只在 idle 时启用
                    />
                    <Button
                        type="submit"
                        disabled={status !== 'idle' || !textInput.trim()} // 只在 idle 且有内容时启用
                    >
                         {status === 'processing' ? '处理中...' : '保存'}
                    </Button>
                </form>

                {(status === 'processing') && <p>正在处理...</p>}

                {error && (<Alert variant="destructive"><AlertTitle>错误</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>)}
                {success && (<Alert variant="default" className="text-green-700"><AlertTitle>成功</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>)}
            </CardContent>
        </Card>
    );
}