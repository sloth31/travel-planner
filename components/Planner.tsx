// 文件: components/Planner.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea'; // 用 Textarea 体验更好
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Mic } from 'lucide-react'; // 引入图标

// Web Speech API 可能会在 window 对象上
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}


export function Planner() {
  const router = useRouter(); // 3. ( 关键) 获取 router 实例
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // 4. ( Change) 我们不再需要在本地 state 中存储 plan
  // const [plan, setPlan] = useState<IPlan | null>(null); 
  
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // setPlan(null); // ( Change) 移除
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
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json(); // data 现在是 { ..., id: '...' }

      // 5. ( 关键) 检查 ID 并执行跳转
      if (data.id) {
        router.push(`/plan/${data.id}`); // <-- 跳转到详情页
      } else {
        throw new Error('API did not return a valid plan ID.');
      }
      
      // ( Change) 不再设置本地 plan
      // setPlan(data); 

    } catch (err: any) {
      setError(err.message || 'Failed to generate plan.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 语音识别 Handler
  const handleVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Your browser does not support Speech Recognition.');
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'zh-CN'; // 设置语言
      recognitionRef.current.interimResults = false; // 我们只要最终结果
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onstart = () => {
        setIsRecording(true);
      };

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setPrompt(transcript); // 将识别的文本填充到 Textarea
      };

      recognitionRef.current.onerror = (event: any) => {
        setError(`Speech recognition error: ${event.error}`);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Travel Planner</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Textarea
                placeholder="例如：“我想去上海，5天，预算 5000 元，喜欢美食和历史” 注：境外旅行规划可能只显示底图和坐标点"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="pr-12" // 给麦克风按钮留出空间
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={handleVoiceInput}
              >
                <Mic
                  className={`h-5 w-5 ${isRecording ? 'text-red-500' : ''}`}
                />
              </Button>
            </div>
            <Button type="submit" disabled={isLoading || !prompt}>
              {isLoading ? '正在生成中...' : '生成行程'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

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