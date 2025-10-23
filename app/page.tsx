// 文件: app/page.tsx
'use client' // 必须是客户端组件

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs' 
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js' 
import { Planner } from '@/components/Planner';

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  
  // 2. 在组件内部创建 "Cookie 感知" 的客户端
  const supabase = createClientComponentClient()

  useEffect(() => {
    // 3.  使用新的客户端检查 Session
    // (它会先检查 Cookie，再检查 localStorage)
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    checkUser()

    // 4. 监听器现在也会与 Cookie 同步
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => {
      authListener?.subscription.unsubscribe()
    }
  }, [supabase]) //  把 supabase 加入依赖数组

  // 登出函数
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    // 登出后也需要刷新，以清除服务端的 Cookie 认知
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

  // 2. 主 UI 渲染
  return (
    <main className="min-h-screen p-8 md:p-12">
      {user ? (
        // ... (已登录视图，包含 <Planner />) ...
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
        // ... (未登录视图，保持不变) ...
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