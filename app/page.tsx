// 文件: app/page.tsx
'use client' // 必须是客户端组件

import { useState, useEffect } from 'react'
import Link from 'next/link'
// 1. (修复) 导入 auth-helpers
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs' 
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js' 
import { Planner } from '@/components/Planner';

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  
  // 2. (修复) 
  //    不要在这里（顶层）创建客户端
  // const supabase = createClientComponentClient()

  useEffect(() => {
    // 3. (修复) 
    //    在 useEffect 内部创建客户端，这里只会在浏览器中运行
    const supabase = createClientComponentClient()
    
    // 检查 Session
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    checkUser()

    // 监听器
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => {
      authListener?.subscription.unsubscribe()
    }
  }, []) // 依赖项为空，只运行一次

  // 登出函数
  const handleLogout = async () => {
    // 4. (修复) 
    //    在事件处理器内部创建客户端
    const supabase = createClientComponentClient()
    
    await supabase.auth.signOut()
    setUser(null)
    window.location.reload() // 登出时重载页面
  }

  // 加载中...
  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <p>加载中...</p>
      </main>
    )
  }

  // 主 UI 渲染
  return (
    <main className="min-h-screen p-8 md:p-12">
      {user ? (
        // 已登录视图
        <div className="max-w-3xl mx-auto">
          <header className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 gap-4">
            <h1 className="text-3xl font-bold">AI 旅行规划师</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground truncate" title={user.email}>
                {user.email}
              </span>
              <Button asChild variant="ghost" size="sm">
                <Link href="/my-plans">我的行程</Link>
              </Button>
              <Button onClick={handleLogout} variant="outline" size="sm">
                登出
              </Button>
            </div>
          </header>
          <Planner />
        </div>
      ) : (
        // 未登录视图
        <div className="flex flex-col items-center justify-center pt-24 text-center">
          <h1 className="text-4xl font-bold mb-8">AI 旅行规划师</h1>
          <p className="mb-4 text-lg text-muted-foreground">
            请登录以保存和规划你的行程
          </p>
          <Button asChild size="lg">
            <Link href="/login">前往登录 / 注册</Link>
          </Button>
        </div>
      )}
    </main>
  )
}