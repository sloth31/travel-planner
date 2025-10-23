// 文件: components/ExpenseLogger.tsx
'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation'; // (关键) 导入 router
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; //  引入 Alert
import { Input } from "@/components/ui/input";

//  声明 Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function ExpenseLogger({ planId }: { planId: string }) {
  const router = useRouter(); // (关键) 用于刷新页面
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const recognitionRef = useRef<any>(null);

  //  核心记账函数
  const logExpense = async (transcript: string) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/log-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, plan_id: planId }),
      });

      if (!response.ok) {
        throw new Error('Failed to log expense.');
      }
      
      const result = await response.json();
      setSuccess(`记账成功: ${result.logged.item} - ${result.logged.amount} ${result.logged.currency}`);

      // (关键)
      // 刷新当前页面 (重新运行 Server Component)
      // 这将使下面的 "开销列表" 自动更新
      router.refresh(); 

    } catch (err: any) {
      setError(err.message || '记账失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  //  语音识别 Handler (从 Planner.tsx 几乎照搬)
  const handleVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('浏览器不支持语音识别');
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'zh-CN';
      recognitionRef.current.interimResults = false;
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onstart = () => {
        setIsRecording(true);
        setError(null);
        setSuccess(null);
      };

      // (关键) 识别成功后，立刻调用 logExpense
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        logExpense(transcript); // 识别到文本，立即发送
      };

      recognitionRef.current.onerror = (event: any) => {
        setError(`语音识别错误: ${event.error}`);
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
   const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // 阻止表单默认提交
    if (!textInput.trim()) return; // 忽略空输入

    await logExpense(textInput); // 复用已有的 logExpense
    setTextInput(''); // 成功后清空输入框
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>语音/文字记账</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">
          点击按钮，然后说出你的开销 (例如: "晚餐花了 50 元")
        </p>
        <Button
          type="button"
          variant={isRecording ? 'destructive' : 'outline'}
          size="icon"
          className="h-20 w-20 rounded-full"
          onClick={handleVoiceInput}
          disabled={isLoading}
        >
          <Mic className="h-10 w-10" />
           </Button>
           <p className="text-sm text-muted-foreground">或手动输入</p>
           <form onSubmit={handleTextSubmit} className="w-full flex gap-2">
          <Input
            type="text"
            placeholder="例如: 纪念品 3000 CNY"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            disabled={isLoading || !textInput.trim()}
          >
            {isLoading ? '...' : '保存'}
          </Button>
        </form>
        {isLoading && <p>正在处理...</p>}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>错误</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert variant="default" className="text-green-700">
            <AlertTitle>成功</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
