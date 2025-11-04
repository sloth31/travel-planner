// 文件: app/plan/[id]/page.tsx
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ExpenseLogger } from '@/components/ExpenseLogger';
import { ExpenseTableWrapper } from '@/components/ExpenseTableWrapper';
import { PlanSubscriber } from '@/components/PlanSubscriber'; // 或者 PlanRefresher
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; // 导入 Card 用于每日行程
// 导入所有需要的图标
import {
    ArrowLeft, MapPin, Utensils, CalendarDays, Wallet, ListChecks, Navigation,
    Landmark, Briefcase, ShoppingCart, Trees, Sun, ChefHat, Tv, Plane, DollarSign // 添加 Plane 图标
} from 'lucide-react';

// 动态导入 PlanMap，禁用 SSR 并添加加载状态
const DynamicPlanMap = dynamic(
    () => import('@/components/PlanMap'),
    {
        ssr: false,
        loading: () => (
            <div className="h-96 w-full rounded-lg bg-gray-200 flex items-center justify-center">
                <p className="text-muted-foreground">地图加载中...</p>
            </div>
        )
    }
);
// 类型定义：活动, 每日计划, 完整计划 (新增预算和交通类型)
interface ITransportDetail { method: 'Flight' | 'HSR' | 'Train' | 'Bus' | 'Self-Drive'; estimated_cost: number; details: string; }
interface IPlanData {
  title: string;
  budget_overview: string;
  daily_plan: IDailyPlan[];
  // (新!) 预算结构
  estimated_budget: {
      total_cny: number;
      accommodation: number;
      flights_and_trains: number;
      local_transport: number;
      food_and_drink: number;
      activities_and_tickets: number;
  };
  // (新!) 交通结构
  initial_transport: {
      to_destination: ITransportDetail;
      from_destination: ITransportDetail;
  }
}

// 类型定义：活动
interface IActivity {
  name: string;
  description: string;
  location: string;
  lat: number;
  lng: number;
  // 可选: type: string; // 如果 AI 能返回类型会更好
}
// 类型定义：每日计划
interface IDailyPlan {
  day: number;
  theme: string;
  activities: IActivity[];
  meals: {
    breakfast: string;
    lunch: string;
    dinner: string;
  };
}
// 类型定义：完整计划
interface IPlanData {
  title: string;
  budget_overview: string;
  daily_plan: IDailyPlan[];
}
// 类型定义：开销
interface IExpense {
  id: string;
  created_at: string;
  item: string;
  amount: number;
   currency: string;
   category: string;
}

// 服务器端函数：获取行程数据
async function getPlan(supabase: any, id: string): Promise<{
    id: string;
    title: string | null; // title 可能是 null
    original_prompt: string | null;
    plan_data: any; // plan_data 是 jsonb
} | null> {
  const { data: plan, error } = await supabase
    .from('plans')
    .select('id, title, original_prompt, plan_data') // RLS 会自动过滤
    .eq('id', id)
    .single(); // 我们只要一个

  if (error) {
    // 如果错误不是因为找不到行 (PGRST116)，则记录错误
    if (error.code !== 'PGRST116') {
        console.error('Error fetching plan:', error);
    } else {
         console.log(`Plan with ID ${id} not found.`);
    }
    return null; // 找不到或出错都返回 null
  }
  return plan;
}

// 服务器端函数：获取开销数据
async function getExpenses(supabase: any, planId: string): Promise<IExpense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, created_at, item, amount, currency,category')
    .eq('plan_id', planId) // 筛选出当前 plan 的
    .order('created_at', { ascending: false }); // 按时间倒序

  if (error) {
    console.error('Error fetching expenses:', error);
    return []; // 出错时返回空数组
  }
  // 如果 data 为 null 或 undefined (理论上 select 不会，但以防万一)，也返回空数组
  return (data || []).map((expense:any) => ({
      ...expense,
      // 如果从数据库中读取的 category 为 null 或 undefined，强制设置为 'Other'
      category: expense.category || 'Other' 
  })) as IExpense[];;
}

// 辅助函数：尝试根据活动名称推断图标 (启发式)
function getActivityIcon(activityName: string): React.ReactNode {
    const nameLower = activityName.toLowerCase();
    // 历史/文化/地标 - 蓝色系
    if (nameLower.includes('博物馆') || nameLower.includes('遗址') || nameLower.includes('教堂') || nameLower.includes('宫') || nameLower.includes('寺') || nameLower.includes('纪念') || nameLower.includes('陵') || nameLower.includes('广场'))
        return <Landmark className="h-4 w-4 mr-2 flex-shrink-0 text-sky-600" />;
    // 自然风光 - 绿色系
    if (nameLower.includes('公园') || nameLower.includes('山') || nameLower.includes('湖') || nameLower.includes('花园') || nameLower.includes('森林') || nameLower.includes('自然') || nameLower.includes('植物园'))
        return <Trees className="h-4 w-4 mr-2 flex-shrink-0 text-emerald-600" />;
    // 购物 - 橙色/棕色系
    if (nameLower.includes('购物') || nameLower.includes('市场') || nameLower.includes('百货') || nameLower.includes('商店') || nameLower.includes('奥莱') || nameLower.includes('步行街'))
        return <ShoppingCart className="h-4 w-4 mr-2 flex-shrink-0 text-amber-700" />;
    // 休闲/度假 - 黄色系
    if (nameLower.includes('海滩') || nameLower.includes('温泉') || nameLower.includes('度假村') || nameLower.includes('沙滩') || nameLower.includes('泳池'))
        return <Sun className="h-4 w-4 mr-2 flex-shrink-0 text-yellow-500" />;
    // 餐饮 - 红色系
    if (nameLower.includes('餐厅') || nameLower.includes('咖啡') || nameLower.includes('美食') || nameLower.includes('料理') || nameLower.includes('居酒屋') || nameLower.includes('小吃') || nameLower.includes('餐馆'))
        return <ChefHat className="h-4 w-4 mr-2 flex-shrink-0 text-red-600" />;
    // 娱乐/演艺/动漫 - 紫色系
    if (nameLower.includes('动漫') || nameLower.includes('游戏') || nameLower.includes('影城') || nameLower.includes('剧场') || nameLower.includes('乐园') || nameLower.includes('水族馆') || nameLower.includes('电影'))
        return <Tv className="h-4 w-4 mr-2 flex-shrink-0 text-purple-600" />;
     // 交通相关 - 靛蓝色系
     if (nameLower.includes('机场') || nameLower.includes('车站') || nameLower.includes('地铁') || nameLower.includes('交通') || nameLower.includes('站'))
         return <Plane className="h-4 w-4 mr-2 flex-shrink-0 text-primary" />;
    // 商务/建筑 - 灰色系
    if (nameLower.includes('中心') || nameLower.includes('大厦') || nameLower.includes('塔') || nameLower.includes('观景台') || nameLower.includes('金融'))
        return <Briefcase className="h-4 w-4 mr-2 flex-shrink-0 text-slate-600" />;
    // 默认图标 - 中性灰色
    return <MapPin className="h-4 w-4 mr-2 flex-shrink-0 text-gray-500" />;
}

// --- 页面组件 (Server Component) ---
export default async function PlanDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  // 获取 Session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    console.warn("Session not found or error fetching session, redirecting to login.");
    redirect('/login');
  }
  const user = session.user; // 获取 user 对象

  // 并行获取行程和开销数据
  console.log(`Fetching data for plan ID: ${params.id} for user ${user.id}`);
  const [plan, expenses] = await Promise.all([
    getPlan(supabase, params.id), // RLS in getPlan implicitly uses user id
    getExpenses(supabase, params.id), // RLS in getExpenses implicitly uses user id
  ]);

  // 处理行程未找到的情况
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

  // (安全地访问 plan_data) 确保 plan_data 是预期的结构，提供默认值
  const planData: IPlanData = {
      title: plan.plan_data?.title || '未命名行程',
      budget_overview: plan.plan_data?.budget_overview || '无预算概述',
     daily_plan: Array.isArray(plan.plan_data?.daily_plan) ? plan.plan_data.daily_plan : [],
     estimated_budget: plan.plan_data?.estimated_budget || { total_cny: 0, accommodation: 0, flights_and_trains: 0, local_transport: 0, food_and_drink: 0, activities_and_tickets: 0 },
      initial_transport: plan.plan_data?.initial_transport || { to_destination: {}, from_destination: {} },
  };
// 1. (新!) 计算总花费 (仅 CNY, 因为预算也是 CNY)
  const spentTotalCNY = expenses
    .filter(e => e.currency === 'CNY')
    .reduce((sum, e) => sum + e.amount, 0);

  // 2. (新!) 获取预估总预算 (CNY)
  const estimatedTotalCNY = planData.estimated_budget.total_cny || 0;

  // 3. (新!) 计算剩余预算
   const remainingBudget = estimatedTotalCNY - spentTotalCNY;
   
  // 按货币分组计算总开销
  const expensesByCurrency = expenses.reduce((acc, expense) => {
    const currency = expense.currency || 'UNKNOWN';
    const amount = typeof expense.amount === 'number' ? expense.amount : 0;
    if (!acc[currency]) { acc[currency] = 0; }
    acc[currency] += amount;
    return acc;
  }, {} as { [key: string]: number });
  const totalSummary = Object.entries(expensesByCurrency)
    .map(([currency, total]) => {
      const formattedAmount = ['JPY', 'KRW'].includes(currency.toUpperCase()) ? total : total.toFixed(2);
      return `${formattedAmount} ${currency}`;
    })
    .join(' | ');
  console.log("Calculated total expenses summary:", totalSummary);


  // --- 渲染 UI ---
return (
    <div className="max-w-6xl mx-auto p-8 md:p-12 space-y-8">
      
      <PlanSubscriber planId={plan.id} />

      {/* 页眉 (保持不变) */}
      <header className="mb-6 border-b pb-4">
        <Button asChild variant="outline" size="sm" className="mb-4">
          <Link href="/my-plans"><ArrowLeft className="h-4 w-4 mr-1" />返回列表</Link>
        </Button>
        <h1 className="text-4xl font-bold text-slate-800">{planData.title}</h1>
        <p className="text-lg text-muted-foreground mt-2">{planData.budget_overview}</p>
        <p className="text-sm text-gray-500 mt-4 italic">原始请求: "{plan.original_prompt || 'N/A'}"</p>
      </header>

      {/* 往返交通和预估预算摘要 (保持不变) */}
      <Card className="shadow-md bg-white/70">
          <CardHeader>
              <CardTitle className="text-xl font-semibold flex items-center text-sky-600">
                  <Plane className="h-5 w-5 mr-2" />
                  旅行交通与财务摘要
              </CardTitle>
              <CardDescription>
                  <div className="mt-2 text-lg font-medium text-slate-700 flex items-center">
                      <DollarSign className="h-5 w-5 mr-1 text-green-600" />
                      预估总预算: {estimatedTotalCNY.toLocaleString('zh-CN')} CNY
                  </div>
              </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                  <h4 className="font-semibold text-slate-600">去程 ({planData.initial_transport.to_destination?.method || 'N/A'})</h4>
                  <p className="text-muted-foreground">{planData.initial_transport.to_destination?.details || '未规划'}</p>
                  <p className="text-green-500 font-medium">预估费用: {planData.initial_transport.to_destination?.estimated_cost ? `${planData.initial_transport.to_destination.estimated_cost} CNY` : 'N/A'}</p>
              </div>
              <div>
                  <h4 className="font-semibold text-slate-600">回程 ({planData.initial_transport.from_destination?.method || 'N/A'})</h4>
                  <p className="text-muted-foreground">{planData.initial_transport.from_destination?.details || '未规划'}</p>
                  <p className="text-green-500 font-medium">预估费用: {planData.initial_transport.from_destination?.estimated_cost ? `${planData.initial_transport.from_destination.estimated_cost} CNY` : 'N/A'}</p>
              </div>
          </CardContent>
      </Card>


      {/* --- (新!) 双栏布局容器 --- */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-8 lg:gap-12">

          {/* --- (新!) 左侧栏: 每日行程 (可滚动) --- */}
          <div className="md:col-span-3 pt-4 border-t md:border-t-0">
            <h2 className="text-2xl font-semibold mb-6 flex items-center text-primary">
                <CalendarDays className="h-6 w-6 mr-2" />
                每日行程
            </h2>
            <div className="space-y-6">
              {planData.daily_plan && planData.daily_plan.length > 0 ? (
                planData.daily_plan.map((day) => (
                  day && day.day ? (
                    <Card key={day.day} className="overflow-hidden shadow-sm">
                      <CardHeader className="bg-primary/5 p-4">
                        <CardTitle className="text-xl font-medium text-primary/90">
                            Day {day.day}: {day.theme || '未命名主题'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-5">
                        {/* 活动列表 */}
                        <div className="space-y-4">
                          <h3 className="font-semibold text-lg mb-2 text-slate-700">活动安排:</h3>
                          {day.activities && day.activities.length > 0 ? (
                            day.activities.map((activity, index) => (
                              activity ? (
                                <div key={index} className="pb-4 border-b last:border-b-0 border-dashed">
                                  {/* ... (活动详情, 导航按钮等) ... */}
                                  <div className="flex justify-between items-start gap-2">
                                      <div className="flex items-start flex-grow mr-2 pt-1">
                                          {getActivityIcon(activity.name || '')}
                                          <h4 className="text-base font-medium text-slate-800">{activity.name || '未命名活动'}</h4>
                                      </div>
                                      {typeof activity.lng === 'number' && typeof activity.lat === 'number' ? (
                                          <Button asChild variant="outline" size="sm" className="flex-shrink-0">
                                              <Link href={`https://uri.amap.com/marker?position=${activity.lng},${activity.lat}&name=${encodeURIComponent(activity.name || '未知地点')}`} target="_blank" rel="noopener noreferrer">
                                                  <Navigation className="h-4 w-4 mr-1 text-blue-500"/>
                                                  导航
                                              </Link>
                                          </Button>
                                      ) : ( <Button variant="outline" size="sm" className="flex-shrink-0" disabled>导航 (无坐标)</Button> )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1 ml-6">{activity.description || '无描述'}</p>
                                  <p className="text-xs text-blue-600 mt-1 ml-6">📍 {activity.location || '未知位置'} (lat: {activity.lat ?? 'N/A'}, lng: {activity.lng ?? 'N/A'})</p>
                                </div>
                               ) : null
                            ))
                          ) : ( <p className="text-sm text-muted-foreground ml-6">当天无活动安排。</p> )}
                        </div>
                        {/* 餐饮建议 */}
                        <div className="pt-3 border-t border-dashed mt-4">
                          <h4 className="font-semibold flex items-center text-lg text-slate-700">
                               <Utensils className="h-5 w-5 mr-2 text-orange-500" />
                               餐饮建议:
                          </h4>
                          <ul className="list-disc list-inside text-sm text-muted-foreground pl-4 mt-2 space-y-1">
                            <li>早餐: {day.meals?.breakfast || '未推荐'}</li>
                            <li>午餐: {day.meals?.lunch || '未推荐'}</li>
                            <li>晚餐: {day.meals?.dinner || '未推荐'}</li>
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                   ) : null
                ))
              ) : (
                <p className="text-muted-foreground">未能加载每日行程详情。</p>
              )}
            </div>
          </div>
          {/* --- 左侧栏结束 --- */}


          {/* --- (新!) 右侧栏: 地图 + 预算 (粘性定位) --- */}
          <div className="md:col-span-2 space-y-8">
            {/* (新!) 添加粘性定位包装器，top-24 为顶部留白 (可调整) */}
            <div className="sticky top-24">
                
                {/* 1. 地图 */}
                <DynamicPlanMap planData={planData} />

                {/* 2. 记账器和开销列表 (移到这里) */}
                <div className="grid grid-cols-1 gap-8 pt-8"> {/* 统一使用 pt-8 */}
                    {/* 记账器区域 - 显示预算 */}
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold flex items-center text-slate-700 mb-2">
                           <Wallet className="h-5 w-5 mr-2 text-red-500" />
                           预算与记账
                      </h2>
                      <Card className={`shadow-md border-2 ${remainingBudget < 0 ? "border-red-500 bg-red-50/50" : "border-green-500 bg-green-50/50"}`}>
                         <CardContent className="p-4">
                             <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                                <p className="text-sm font-medium text-slate-600">预估总预算 (CNY)</p>
                                <p className="text-lg font-bold text-slate-800">{estimatedTotalCNY.toLocaleString('zh-CN')}</p>
                             </div>
                             <div className="flex justify-between items-center pt-2">
                                <p className="text-sm font-medium text-slate-600">剩余余额 (CNY)</p>
                                <p className="text-xl font-extrabold" style={{ color: remainingBudget < 0 ? '#dc2626' : '#10b981' }}>
                                    {remainingBudget.toLocaleString('zh-CN')}
                                </p>
                             </div>
                         </CardContent>
                      </Card>
                      <ExpenseLogger planId={plan.id} />
                    </div>
                    {/* 开销列表区域 */}
                    <div className="space-y-4">
                      <h2 className="text-2xl font-semibold flex items-center text-primary">
                          <ListChecks className="h-6 w-6 mr-2" />
                          开销详情
                      </h2>
                      <p className="text-lg font-medium">已记总开销: {totalSummary || '0.00'}</p>
                      <ExpenseTableWrapper expenses={expenses} planId={plan.id} />
                    </div>
                </div>
                {/* --- 右侧栏内容结束 --- */}
                
            </div>
          </div>
          {/* --- 右侧栏结束 --- */}

      </div>
      {/* --- (新!) 双栏布局容器结束 --- */}


      {/* (已移动!) 每日行程部分已被移到左侧栏 */}

    </div>
  );
}
