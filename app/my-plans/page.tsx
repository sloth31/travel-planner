// 文件: app/my-plans/page.tsx
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'; 
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// (类型定义) 我们可以从数据库中推断
type Plan = {
  id: string;
  created_at: string;
  title: string;
};

// 1. 服务端数据获取
async function getPlans(supabase: any) {
  const { data: plans, error } = await supabase
    .from('plans')
    .select('id, title, created_at') // 只选我们需要的数据
    .order('created_at', { ascending: false }); // 按时间倒序

  if (error) {
    console.error('Error fetching plans:', error);
    return [];
  }
  return plans;
}

// 2. 页面组件 (Server Component)
export default async function MyPlansPage() {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  // 2.1 检查用户
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    redirect('/login'); // 未登录用户，重定向到登录页
  }

  // 2.2 获取数据
  const plans: Plan[] = await getPlans(supabase);

  // 3. 渲染 UI
  return (
    <div className="max-w-3xl mx-auto p-8 md:p-12">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">我的行程</h1>
        <Button asChild variant="outline">
          <Link href="/">返回主页</Link>
        </Button>
      </header>
      
      <div className="space-y-4">
        {plans.length === 0 ? (
          <p className="text-muted-foreground">
            你还没有创建任何行程。
          </p>
        ) : (
          plans.map((plan) => (
            <Link href={`/plan/${plan.id}`} key={plan.id} legacyBehavior>
              <a className="block">
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle>{plan.title}</CardTitle>
                    <CardDescription>
                      创建于: {new Date(plan.created_at).toLocaleString('zh-CN')}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </a>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

// 关键: Next.js 14 (App Router) 默认是动态渲染的
// 我们添加这个确保页面总是获取最新数据
export const dynamic = 'force-dynamic';