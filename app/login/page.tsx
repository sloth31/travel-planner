// 文件: app/login/page.tsx
'use client' // 必须是客户端组件

import { useState } from 'react'
import { useRouter } from 'next/navigation' // 用于跳转
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs' // 导入 auth-helpers
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowRight, ArrowLeft } from 'lucide-react' // 导入图标

// 定义模式状态的类型
type AuthMode = 'login' | 'register';

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login'); // 默认显示登录
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false); // 提交加载状态
  const router = useRouter()
  const supabase = createClientComponentClient() // 创建客户端实例

  // 辅助函数：切换模式并清理输入
  const handleModeToggle = (newMode: AuthMode) => {
    setEmail('');
    setPassword('');
    setMode(newMode);
    setIsLoading(false);
  }

  // 处理登录
  const handleLogin = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert('登录失败: ' + error.message)
    } else {
      // 登录成功后，auth-helpers 会自动设置 Cookie
      alert('登录成功!')
      router.push('/')
      router.refresh() // 强制服务器重新渲染
    }
    setIsLoading(false);
  }

  // 处理注册
  const handleSignUp = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      alert('注册失败: ' + error.message)
    } else {
      // 注册成功，切换到登录界面让用户输入凭证
      alert('注册成功！请现在登录。')
      handleModeToggle('login');
    }
    setIsLoading(false);
  }
  
  // 渲染不同的卡片内容
  const isLoginMode = mode === 'login';

  return (
    // 外层容器：增加主题色背景，并垂直居中
    <div className="flex items-center justify-center min-h-screen bg-slate-500/50 p-4"> 
      <Card className="w-[380px] shadow-2xl border-t-4 border-t-indigo-600 transition-all duration-300"> {/* 美化卡片 */}
        <CardHeader className="text-center bg-indigo-50/50"> {/* 头部添加背景色 */}
          <CardTitle className="text-2xl font-extrabold text-indigo-700">
            {isLoginMode ? '欢迎回来' : '创建新账户'}
          </CardTitle>
          <CardDescription className="text-gray-600">
             {isLoginMode ? '登录以规划您的旅行' : '加入我们，开始规划吧'}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="email" className="text-gray-700">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="password" className="text-gray-700">密码</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>
          </form>
        </CardContent>
        
        {/* Footer 区域：按钮和切换链接 */}
        <CardFooter className="flex flex-col gap-3 pt-0">
          <Button 
            onClick={isLoginMode ? handleLogin : handleSignUp} 
            disabled={isLoading || !email || !password}
            className="w-full bg-indigo-600 hover:bg-indigo-700 transition-colors" // 主题色按钮
          >
            {isLoading ? 
              (isLoginMode ? '登录中...' : '注册中...') 
              : 
              (isLoginMode ? '登录' : '注册')
            }
          </Button>

          {/* 切换模式的链接 */}
          {isLoginMode ? (
            <p className="text-sm text-center text-gray-500">
              还没有账户？
              <Button 
                variant="link" 
                onClick={() => handleModeToggle('register')}
                className="p-0 h-auto ml-1 text-primary hover:text-indigo-700"
              >
                立即注册 <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </p>
          ) : (
            <p className="text-sm text-center text-gray-500">
              已有账户？
              <Button 
                variant="link" 
                onClick={() => handleModeToggle('login')}
                className="p-0 h-auto ml-1 text-primary hover:text-indigo-700"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> 返回登录
              </Button>
            </p>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}