// 文件: components/Planner.tsx
'use client';

import { useState, useRef } from 'react';
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
  const [isRecording, setIsRecording] = useState(false); // 录音状态
  const [isProcessingSTT, setIsProcessingSTT] = useState(false); // STT 处理状态
  const [error, setError] = useState<string | null>(null);

  // 用于 MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]); // 存储音频数据块

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
  const sendAudioToBackend = async (audioBlob: Blob) => {
    setIsProcessingSTT(true); // 开始调用 STT API
    setError(null);

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    try {
      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '语音识别请求失败');
      }

      const result = await response.json();
      if (result.text) {
        // (关键区别) 识别成功，将文本填充到输入框
        setPrompt(result.text);
      } else {
        throw new Error(result.error || '未识别到文本');
      }

    } catch (err: any) {
      setError(err.message || '语音识别过程中出错');
    } finally {
      setIsProcessingSTT(false); // STT API 调用结束
    }
  };


  // --- MediaRecorder 录音控制 (与 ExpenseLogger 相同) ---
  const startRecording = async () => {
    setError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('浏览器不支持录音功能');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/wav; codecs=MS_PCM' };
      let recorder: MediaRecorder;
      try {
         recorder = new MediaRecorder(stream, options);
      } catch (e) {
         console.warn("WAV mimeType not supported, trying default.");
         recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/wav' });
        sendAudioToBackend(audioBlob); // 发送给后端

        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);

    } catch (err) {
      console.error('获取麦克风权限或开始录音失败:', err);
      setError('无法访问麦克风或开始录音，请检查权限。');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop(); // 触发 onstop
      setIsRecording(false);
      // isProcessingSTT 由 sendAudioToBackend 控制
    }
  };

  // 语音按钮点击处理
  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // 文本输入框变化处理 (保持不变)
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Travel Planner</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 输入区域 */}
            <div className="relative">
              <Textarea
                placeholder="例如：“我想去上海，3天，预算 3000 元” 或点击麦克风说话"
                value={prompt}
                onChange={handlePromptChange}
                rows={3}
                className="pr-12" // 为麦克风留出空间
                disabled={isRecording || isProcessingSTT || isLoading} // 禁用条件
              />
              {/* 麦克风按钮 */}
              <Button
                type="button"
                variant={isRecording ? 'destructive' : 'ghost'} // 调整 variant
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={handleMicClick}
                disabled={isProcessingSTT || isLoading} // 处理时禁用
                title={isRecording ? "停止录音" : "开始录音"} // 添加 title
              >
                <Mic className="h-5 w-5" />
              </Button>
            </div>
            
            {/* 提交按钮 */}
            <Button 
              type="submit" 
              disabled={isLoading || isRecording || isProcessingSTT || !prompt.trim()} // 增加禁用条件
            >
              {isLoading ? '正在生成中...' : '生成行程'}
            </Button>
          </form>
          
          {/* STT 处理状态提示 */}
          {isProcessingSTT && <p className="text-sm text-muted-foreground mt-2">正在识别语音...</p>}

        </CardContent>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>错误</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

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