// 文件: app/login/page.tsx
'use client' 

import { useState } from 'react'
import { useRouter } from 'next/navigation'
// 1. (修复) 导入 auth-helpers
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
  
  // 2. (修复) 
  //    不要在这里（顶层）创建客户端
  // const supabase = createClientComponentClient()

  // 处理登录
  const handleLogin = async () => {
    // 3. (修复) 
    //    在事件处理器内部创建客户端
    const supabase = createClientComponentClient()
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert('登录失败: ' + error.message)
    } else {
      router.push('/')
      router.refresh() // 强制服务器重新渲染
      alert('登录成功!') 
    }
  }

  // 处理注册
  const handleSignUp = async () => {
    // 4. (修复) 
    //    在事件处理器内部创建客户端
    const supabase = createClientComponentClient()
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      alert('注册失败: ' + error.message)
    } else {
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