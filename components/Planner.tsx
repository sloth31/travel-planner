// 文件: components/Planner.tsx
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Mic } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // 引入 Alert


export function Planner() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false); // 用于生成行程的 Loading
  const [sttStatus, setSttStatus] = useState<'idle' | 'recording' | 'processing_stt'>('idle');
  const [error, setError] = useState<string | null>(null);

  // 用于 MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]); // 存储音频数据块
  const streamRef = useRef<MediaStream | null>(null);

  // --- 核心函数 1: 提交行程规划请求 (保持不变) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Error: ${response.statusText}`);
      }

      const data = await response.json(); // data 现在是 { ..., id: '...' }

      if (data.id) {
        router.push(`/plan/${data.id}`); // 跳转到详情页
      } else {
        throw new Error('API did not return a valid plan ID.');
      }

    } catch (err: any) {
      setError(err.message || '生成行程失败');
    } finally {
      setIsLoading(false);
    }
  };

  // --- 核心函数 2: 发送音频到后端 STT API ---
  // (与 ExpenseLogger 基本相同，但成功回调不同)
const sendAudioToBackend = useCallback(async (audioBlob: Blob) => {
        console.log("Sending audio blob to /api/stt, size:", audioBlob.size, "type:", audioBlob.type);
        setSttStatus('processing_stt'); // 开始调用 STT API
        setError(null);

        const formData = new FormData();
        formData.append('audio', audioBlob, `recording.${audioBlob.type.split('/')[1] || 'webm'}`);

        try {
            const response = await fetch('/api/stt', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json();
                console.error("STT API Error Response:", errData);
                throw new Error(errData.error || '语音识别请求失败');
            }

            const result = await response.json();
            if (result.text && result.text.trim() !== "" && result.text !== "未识别到内容") {
                setPrompt(result.text); // 识别成功，设置到 prompt
                console.log("STT recognized text:", result.text);
            } else {
                 console.warn("STT returned empty or 'not recognized' result:", result.text);
                 // (修复!) 不设置 prompt，而是显示错误
                 setError("无法识别语音内容，请重试或手动输入。");
            }

        } catch (err: any) {
            console.error("Error sending audio or processing STT response:", err);
            setError(err.message || '语音识别过程中出错');
        } finally {
            setSttStatus('idle'); // STT API 调用结束
        }
    }, []); // 空依赖


  // --- MediaRecorder 录音控制 (与 ExpenseLogger 相同) ---
const startRecording = useCallback(async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setError('浏览器不支持录音功能'); setSttStatus('idle'); return;
        }
        setSttStatus('recording');
        setError(null);
        audioChunksRef.current = [];

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
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
                if (audioChunksRef.current.length === 0) {
                    console.warn("No audio chunks recorded.");
                    setSttStatus('idle'); return;
                }
                const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                sendAudioToBackend(audioBlob); // 发送给后端

                if (streamRef.current) {
                     streamRef.current.getTracks().forEach(track => track.stop());
                     streamRef.current = null;
                     console.log("Stopped media stream tracks after recording stopped.");
                }
            };

            recorder.start();
            console.log("MediaRecorder started");

        } catch (err) {
            console.error('获取麦克风权限或开始录音失败:', err); setError('无法访问麦克风或开始录音，请检查权限。'); setSttStatus('idle');
        }
    }, [sendAudioToBackend]); // 依赖 sendAudioToBackend

    // 停止录音和媒体流
    // (与 ExpenseLogger 完全相同)
    const stopRecordingAndStream = useCallback(() => {
        let stopped = false;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            console.log("[DEBUG stopRecordingAndStream] Calling mediaRecorder.stop()");
            mediaRecorderRef.current.stop(); // 触发 onstop
            stopped = true;
        } else {
            console.log("[DEBUG stopRecordingAndStream] MediaRecorder not recording or already stopped.");
        }
        if (stopped) { console.log("Requested MediaRecorder stop."); }
    }, []);

    // 语音按钮点击处理
    // (与 ExpenseLogger 完全相同)
    const handleMicClick = () => {
        if (sttStatus === 'recording') {
            console.log("[DEBUG handleMicClick] Stopping recording...");
            stopRecordingAndStream(); // 请求停止录音 (会触发 onstop)
        } else if (sttStatus === 'idle') {
            console.log("[DEBUG handleMicClick] Starting recording...");
            startRecording(); // 开始录音过程
        } else {
            console.log("[DEBUG handleMicClick] Clicked in status:", sttStatus, "- Action ignored.");
        }
    };

    // 文本输入框变化处理 (保持不变)
    const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => { setPrompt(e.target.value); };

    // 清理 Effect
    // (与 ExpenseLogger 完全相同)
    useEffect(() => {
        return () => {
            console.log("[DEBUG useEffect Cleanup - Planner] Component unmounting...");
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                mediaRecorderRef.current.stop();
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

return (
        <div className="space-y-6">
            <Card>
                <CardHeader><CardTitle>AI Travel Planner</CardTitle></CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative">
                            <Textarea
                                placeholder="例如：“我想去上海，3天，预算 3000 元” 或点击麦克风说话"
                                value={prompt}
                                onChange={handlePromptChange}
                                rows={3}
                                className="pr-12"
                                // 录音或 STT 处理时禁用
                                disabled={sttStatus === 'recording' || sttStatus === 'processing_stt' || isLoading}
                            />
                            <Button
                                type="button"
                                variant={sttStatus === 'recording' ? 'destructive' : 'ghost'}
                                size="icon"
                                className="absolute right-2 top-1/2 -translate-y-1/2"
                                onClick={handleMicClick}
                                // STT 处理或生成行程时禁用
                                disabled={sttStatus === 'processing_stt' || isLoading}
                                title={sttStatus === 'recording' ? "停止录音" : "开始录音"}
                            >
                                <Mic className="h-5 w-5" />
                            </Button>
                        </div>

                        <Button
                            type="submit"
                            // 录音、STT 处理、生成行程 或 prompt 为空时禁用
                            disabled={isLoading || sttStatus === 'recording' || sttStatus === 'processing_stt' || !prompt.trim()}
                        >
                            {isLoading ? '正在生成中...' : '生成行程'}
                        </Button>
                    </form>

                    {sttStatus === 'processing_stt' && <p className="text-sm text-muted-foreground mt-2">正在识别语音...</p>}
                </CardContent>
            </Card>

           {error && (<Alert variant="destructive"><AlertTitle>错误</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>)}

      {/* 生成行程的 Loading 状态 (保持不变) */}
      {isLoading && (
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      )}

    </div>
  );
}