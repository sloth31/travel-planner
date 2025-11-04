// 文件: app/page.tsx
'use client' // 必须是客户端组件

import { useState, useEffect } from 'react'
import Link from 'next/link'
// 1. (修复) 导入 auth-helpers
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs' 
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js' 
import { Planner } from '@/components/Planner';
// (新!) 导入图标
import { Settings, List, LogOut } from 'lucide-react';
import { ArrowRight, ArrowLeft } from 'lucide-react' // 导入图标

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  

  useEffect(() => {
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
   <main className="min-h-screen"> 
      {user ? (
        <div className="max-w-3xl mx-auto p-8 md:p-12">

          <header className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 gap-4 border-b pb-4">
            <h1 className="text-3xl font-bold text-primary">AI 旅行规划师</h1>

            <div className="flex items-center gap-2"> 
              <span className="text-sm text-muted-foreground truncate mr-2" title={user.email}>
                {user.email}
              </span>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:bg-indigo-50/50">
                <Link href="/profile" title="偏好设置"><Settings className="h-4 w-4 mr-1" /><span className="hidden sm:inline">偏好</span></Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:bg-indigo-50/50">
                <Link href="/my-plans" title="我的行程"><List className="h-4 w-4 mr-1" /><span className="hidden sm:inline">行程</span></Link>
              </Button>
              <Button onClick={handleLogout} variant="outline" size="sm" title="登出">
                 <LogOut className="text-destructive h-4 w-4 mr-1" /><span className="text-destructive hidden sm:inline">登出</span>
              </Button>
            </div>
          </header>
          <Planner />
        </div>
      ) : (
   
        <div 
          className="flex flex-col items-center justify-center w-screen h-screen text-center"
          style={{ backgroundImage: 'url(/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}
        >
          {/* 添加半透明覆盖层以提高文字可读性，并添加 padding */}
          <div className="p-10 rounded-xl bg-white/90 backdrop-blur-sm shadow-2xl max-w-xl">
             <h1 className="text-6xl font-extrabold mb-4 text-primary">
                AI 旅行规划师
             </h1>
             <h2 className="text-xl text-slate-700 font-medium mb-10">
                只需一句话，规划您的全球之旅。
             </h2>

             <p className="mb-6 text-lg text-slate-600 border-b border-slate-300 pb-4">
               请登录以保存和管理您的个性化行程计划。
             </p>
             
             <Button asChild size="lg" className="bg-indigo-500 hover:bg-indigo-600 shadow-lg transition-colors">
               <Link href="/login" className="flex items-center">
                   前往登录 / 注册
                   <ArrowRight className="h-5 w-5 ml-2" />
               </Link>
             </Button>
          </div>
        </div>
        // --- 未登录视图结束 ---
      )}
    </main>
  )
}