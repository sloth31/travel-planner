// 文件: app/profile/page.tsx
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ProfileForm } from '@/components/ProfileForm'; // (稍后创建) 导入表单组件

// (复用) 定义偏好类型
interface UserPreferences {
    styles?: string[];
    cuisines?: string[];
    transport?: string[];
}

// 页面组件 (Server Component)
export default async function ProfilePage() {
    const cookieStore = cookies();
    const supabase = createServerComponentClient({ cookies: () => cookieStore });

    // 1. 获取用户 Session 和当前偏好
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
        redirect('/login'); // 未登录则重定向
    }
    const user = session.user;
    const currentPreferences = (user.user_metadata?.preferences as UserPreferences) || {}; // 获取当前偏好，不存在则为空对象

    // 2. 渲染页面结构
    return (
        <div className="max-w-2xl mx-auto p-8 md:p-12 space-y-6"> {/* 调整最大宽度 */}
            <header className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">个人偏好设置</h1>
                <Button asChild variant="outline">
                    <Link href="/">返回主页</Link>
                </Button>
            </header>

            <p className="text-muted-foreground">
                设置您的旅行偏好，AI 将在生成行程时优先考虑它们。
            </p>

            {/* 3. 渲染表单组件，并将当前偏好传递给它 */}
            <ProfileForm initialPreferences={currentPreferences} />

        </div>
    );
}

// 确保页面动态渲染以获取最新 Session 数据
export const dynamic = 'force-dynamic';