// 文件: app/login/page.tsx
'use client' 

import { useState } from 'react'
import { useRouter } from 'next/navigation'
// 1. (Fix) 导入 auth-helpers 提供的客户端组件创建器
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs' 
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

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()
  
  // 2. (Fix) 在组件内部创建 "Cookie 感知" 的客户端
  const supabase = createClientComponentClient()

  // 3. (Fix) 更新 handleLogin 来正确处理 Cookie
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert('登录失败: ' + error.message)
    } else {
      // 登录成功, auth-helpers 会自动设置 Cookie
      // 我们需要刷新页面来确保
      // 1. 服务端组件能读到新 Cookie
      // 2. 根 layout 能重新加载
      router.push('/')
      router.refresh() // (关键) 强制服务器重新渲染
      alert('登录成功!') 
    }
  }

  // 4. (Fix) 更新 handleSignUp
  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      // (可选) 确保 Supabase 后台关闭了邮件验证
      // options: {
      //   emailRedirectTo: `${location.origin}/auth/callback`,
      // },
    })

    if (error) {
      alert('注册失败: ' + error.message)
    } else {
      // 注册成功, auth-helpers 也会设置 Cookie
      alert('注册成功！请现在登录。')
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>欢迎回来</CardTitle>
          <CardDescription>登录或注册以继续</CardDescription>
        </CardHeader>
        <CardContent>
          {/* ... 你的表单内容 (保持不变) ... */}
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={handleSignUp}>
            注册
          </Button>
          <Button onClick={handleLogin}>登录</Button>
        </CardFooter>
      </Card>
    </div>
  )
}