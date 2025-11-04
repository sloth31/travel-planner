// 文件: app/plan/[id]/page.tsx
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PlanDashboardClient } from '@/components/PlanDashboardClient'; // 导入新的仪表盘组件
import { ArrowLeft } from 'lucide-react';
import { User } from '@supabase/supabase-js'; // 导入 User 类型

// --- 类型定义 ---
// (我们将在这里定义所有需要的类型，以便 PlanDashboardClient 可以导入它们)

export interface IActivity {
  name: string;
  description: string;
  location: string;
  lat: number;
  lng: number;
}

export interface IDailyPlan {
  day: number;
  theme: string;
  activities: IActivity[];
  meals: {
    breakfast: string;
    lunch: string;
    dinner: string;
  };
}

export interface ITransportDetail {
  method: 'Flight' | 'HSR' | 'Train' | 'Bus' | 'Self-Drive' | string; // 增加 string 以防 LLM 返回其他值
  estimated_cost: number;
  details: string;
}

export interface IPlanData {
  title: string;
  budget_overview: string;
  daily_plan: IDailyPlan[];
  estimated_budget: {
      total_cny: number;
      accommodation: number;
      flights_and_trains: number;
      local_transport: number;
      food_and_drink: number;
      activities_and_tickets: number;
  };
  initial_transport: {
      to_destination?: ITransportDetail; // 设为可选
      from_destination?: ITransportDetail; // 设为可选
  };
}

export interface IExpense {
  id: string;
  created_at: string;
  item: string;
  amount: number;
  currency: string;
  category: string;
}

// 原始 Plan 记录的类型 (来自数据库)
export interface IPlanFromDB {
    id: string;
    original_prompt: string | null;
    plan_data: IPlanData; // 嵌套 IPlanData
}

// 传递给客户端仪表盘的完整 Props
export interface PlanDashboardProps {
  plan: IPlanFromDB;
  expenses: IExpense[];
  user: User; // 传递用户信息
}
// --- 类型定义结束 ---


// --- 服务器端函数：获取行程数据 ---
async function getPlan(supabase: any, id: string): Promise<IPlanFromDB | null> {
  const { data: plan, error } = await supabase
    .from('plans')
    .select('id, title, original_prompt, plan_data') // RLS 会自动过滤
    .eq('id', id)
    .single(); // 我们只要一个

  if (error) {
    if (error.code !== 'PGRST116') {
        console.error('Error fetching plan:', error);
    } else {
         console.log(`Plan with ID ${id} not found.`);
    }
    return null;
  }
  
  // (重要!) 将 plan_data 从可能的 null/undefined 转换为 IPlanData 结构
  const planData: IPlanData = {
      title: plan.plan_data?.title || '未命名行程',
      budget_overview: plan.plan_data?.budget_overview || '无预算概述',
      daily_plan: Array.isArray(plan.plan_data?.daily_plan) ? plan.plan_data.daily_plan : [],
      estimated_budget: plan.plan_data?.estimated_budget || { total_cny: 0, accommodation: 0, flights_and_trains: 0, local_transport: 0, food_and_drink: 0, activities_and_tickets: 0 },
      initial_transport: plan.plan_data?.initial_transport || { to_destination: undefined, from_destination: undefined },
  };

  // 返回规范化的数据
  return {
      ...plan,
      plan_data: planData
  };
}

// --- 服务器端函数：获取开销数据 ---
async function getExpenses(supabase: any, planId: string): Promise<IExpense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, created_at, item, amount, currency, category')
    .eq('plan_id', planId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }
  
  // 确保 category 字段如果为 null，会被替换成 'Other' 字符串
  return (data || []).map((expense: any) => ({
      ...expense,
      category: expense.category || 'Other' 
  })) as IExpense[];
}

// --- 页面组件 (Server Component) ---
export default async function PlanDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  // 1. 获取 Session 和 User
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    console.warn("Session not found or error fetching session, redirecting to login.");
    redirect('/login');
  }
  const user = session.user;

  // 2. 并行获取数据
  console.log(`Fetching data for plan ID: ${params.id} for user ${user.id}`);
  const [plan, expenses] = await Promise.all([
    getPlan(supabase, params.id),
    getExpenses(supabase, params.id),
  ]);

  // 3. 处理行程未找到
  if (!plan) {
    console.warn(`Plan with ID ${params.id} not found for current user.`);
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold">行程未找到</h1>
        <p className="text-muted-foreground">
          你请求的行程不存在或不属于你。
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/my-plans">返回列表</Link>
        </Button>
      </div>
    );
  }
  
  console.log(`Plan data fetched successfully for ${params.id}.`);

  // 4. 渲染客户端仪表盘，传入所有数据
  return (
    <PlanDashboardClient 
      plan={plan}
      expenses={expenses}
      user={user} 
    />
  );
}

// 确保页面总是动态渲染
export const dynamic = 'force-dynamic';