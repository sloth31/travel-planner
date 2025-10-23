// 文件: app/plan/[id]/page.tsx
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import dynamic from 'next/dynamic'; // 导入 dynamic
import { ExpenseLogger } from '@/components/ExpenseLogger';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// (修复) 动态导入 PlanMap，禁用 SSR
const DynamicPlanMap = dynamic(
  () => import('@/components/PlanMap'),
  { 
    ssr: false, // 关键！
    loading: () => (
      <div 
        className="h-96 w-full rounded-lg bg-gray-200 flex items-center justify-center"
      >
        <p className="text-muted-foreground">地图加载中...</p>
      </div>
    )
  }
);

// (类型定义) 这是 AI 生成的 JSON 的类型
interface IPlanData {
  title: string;
  budget_overview: string;
  daily_plan: {
    day: number;
    theme: string;
    activities: {
      name: string;
      description: string;
      location: string;
      lat: number;
      lng: number;
    }[];
    meals: {
      breakfast: string;
      lunch: string;
      dinner: string;
    };
  }[];
}

//  定义 Expense 类型
interface IExpense {
  id: string;
  created_at: string;
  item: string;
  amount: number;
  currency: string;
}

//  获取行程函数
async function getPlan(supabase: any, id: string) {
  const { data: plan, error } = await supabase
    .from('plans')
    .select('id, title, original_prompt, plan_data')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching plan:', error);
    return null;
  }
  return plan;
}

//  获取开销列表的函数
async function getExpenses(supabase: any, planId: string): Promise<IExpense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, created_at, item, amount, currency')
    .eq('plan_id', planId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }
  return data;
}

//  页面组件 (Server Component)
export default async function PlanDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    redirect('/login');
  }

  //  并行获取数据
  const [plan, expenses] = await Promise.all([
    getPlan(supabase, params.id),
    getExpenses(supabase, params.id),
  ]);

  //  行程未找到的错误处理
  if (!plan) {
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
  
  const planData: IPlanData = plan.plan_data;

  // 6. (修复) 
  //    按货币分组计算总开销
  const expensesByCurrency = expenses.reduce((acc, expense) => {
    const currency = expense.currency || 'UNKNOWN'; // 处理 null 或空字符串
    const amount = typeof expense.amount === 'number' ? expense.amount : 0; // 确保是数字

    if (!acc[currency]) {
      acc[currency] = 0;
    }
    acc[currency] += amount;
    return acc;
  }, {} as { [key: string]: number }); // 结果: { CNY: 150, JPY: 4000 }

  // 7. (修复) 
  //    将分组后的总计格式化为字符串
  const totalSummary = Object.entries(expensesByCurrency)
    .map(([currency, total]) => {
      //  JPY/KRW 等货币不显示小数
      const formattedAmount = ['JPY', 'KRW'].includes(currency.toUpperCase())
        ? total
        : total.toFixed(2); // CNY/USD 等显示两位小数
      return `${formattedAmount} ${currency}`;
    })
    .join(' | '); // 用 " | " 分隔, 例如: "150.00 CNY | 4000 JPY"

  // 8.  渲染 UI
  return (
    <div className="max-w-4xl mx-auto p-8 md:p-12 space-y-8">
      {/*  Header 部分 */}
      <header>
        <Button asChild variant="outline" size="sm" className="mb-4">
          <Link href="/my-plans">← 返回列表</Link>
        </Button>
        <h1 className="text-4xl font-bold">{planData.title}</h1>
        <p className="text-lg text-muted-foreground mt-2">
          {planData.budget_overview}
        </p>
        <p className="text-sm text-gray-500 mt-4 italic">
          原始请求: "{plan.original_prompt}"
        </p>
      </header>

      {/*  地图部分 (使用动态导入的组件) */}
      <DynamicPlanMap planData={planData} />

      {/*  渲染记账器和开销列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* 左侧：语音记账器 */}
        <div className="space-y-4">
          <ExpenseLogger planId={plan.id} />
        </div>

        {/* 右侧：开销列表 */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">开销详情</h2>
          
          {/* 9. (修复) 显示多货币总计 */}
          <p className="text-lg font-medium">
            总计: {totalSummary || '0.00'}
          </p>
          
          <div className="border rounded-lg max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>事项</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">
                      暂无开销记录
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{expense.item}</TableCell>
                      <TableCell>{expense.amount} {expense.currency}</TableCell>
                      <TableCell>
                        {new Date(expense.created_at).toLocaleString('zh-CN', {
                           hour: '2-digit', minute: '2-digit' 
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/*  详细行程列表部分 */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">每日行程</h2>
        <div className="space-y-6">
          {planData.daily_plan.map((day) => (
            <div key={day.day}>
              <h2 className="text-2xl font-semibold mb-3">
                Day {day.day}: {day.theme}
              </h2>
              <div className="space-y-4 pl-4 border-l-2">
                
                {day.activities.map((activity, index) => (
                  <div key={index} className="pb-2">
                    <div className="flex justify-between items-center mb-1">
                      <h3 className="text-lg font-medium">{activity.name}</h3>
                      
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`https://uri.amap.com/marker?position=${activity.lng},${activity.lat}&name=${encodeURIComponent(
                            activity.name
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          导航
                        </Link>
                      </Button>
                    </div>
                    
                    <p className="text-muted-foreground">{activity.description}</p>
                    <p className="text-sm text-blue-600">
                      📍 {activity.location} (lat: {activity.lat}, lng: {activity.lng})
                    </p>
                  </div>
                ))}
                
                <div className="pt-2">
                  <h4 className="font-medium">餐饮建议:</h4>
                  <ul className="list-disc list-inside text-sm text-muted-foreground">
                    <li>早餐: {day.meals.breakfast}</li>
                    <li>午餐: {day.meals.lunch}</li>
                    <li>晚餐: {day.meals.dinner}</li>
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

