// 文件: components/PlanDashboardClient.tsx
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExpenseLogger } from '@/components/ExpenseLogger';
import { ExpenseTableWrapper } from '@/components/ExpenseTableWrapper';
import { PlanSubscriber } from '@/components/PlanSubscriber';
import {
    ArrowLeft, MapPin, Utensils, CalendarDays, Wallet, ListChecks, Navigation,
    Landmark, Briefcase, ShoppingCart, Trees, Sun, ChefHat, Tv, Plane, DollarSign
} from 'lucide-react';

// 导入我们从 page.tsx 导出的类型
import type { PlanDashboardProps, IPlanData, IExpense, IDailyPlan, IActivity } from '@/app/plan/[id]/page';

// 动态导入 PlanMap
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

// 辅助函数：推断图标 (保持不变)
function getActivityIcon(activityName: string): React.ReactNode {
    const nameLower = activityName.toLowerCase();
    if (nameLower.includes('博物馆') || nameLower.includes('遗址') || nameLower.includes('教堂') || nameLower.includes('宫') || nameLower.includes('寺') || nameLower.includes('纪念') || nameLower.includes('陵') || nameLower.includes('广场'))
        return <Landmark className="h-4 w-4 mr-2 flex-shrink-0 text-sky-600" />;
    if (nameLower.includes('公园') || nameLower.includes('山') || nameLower.includes('湖') || nameLower.includes('花园') || nameLower.includes('森林') || nameLower.includes('自然') || nameLower.includes('植物园'))
        return <Trees className="h-4 w-4 mr-2 flex-shrink-0 text-emerald-600" />;
    if (nameLower.includes('购物') || nameLower.includes('市场') || nameLower.includes('百货') || nameLower.includes('商店') || nameLower.includes('奥莱') || nameLower.includes('步行街'))
        return <ShoppingCart className="h-4 w-4 mr-2 flex-shrink-0 text-amber-700" />;
    if (nameLower.includes('海滩') || nameLower.includes('温泉') || nameLower.includes('度假村') || nameLower.includes('沙滩') || nameLower.includes('泳池'))
        return <Sun className="h-4 w-4 mr-2 flex-shrink-0 text-yellow-500" />;
    if (nameLower.includes('餐厅') || nameLower.includes('咖啡') || nameLower.includes('美食') || nameLower.includes('料理') || nameLower.includes('居酒屋') || nameLower.includes('小吃') || nameLower.includes('餐馆'))
        return <ChefHat className="h-4 w-4 mr-2 flex-shrink-0 text-red-600" />;
    if (nameLower.includes('动漫') || nameLower.includes('游戏') || nameLower.includes('影城') || nameLower.includes('剧场') || nameLower.includes('乐园') || nameLower.includes('水族馆') || nameLower.includes('电影'))
        return <Tv className="h-4 w-4 mr-2 flex-shrink-0 text-purple-600" />;
     if (nameLower.includes('机场') || nameLower.includes('车站') || nameLower.includes('地铁') || nameLower.includes('交通') || nameLower.includes('站'))
         return <Plane className="h-4 w-4 mr-2 flex-shrink-0 text-indigo-600" />;
    if (nameLower.includes('中心') || nameLower.includes('大厦') || nameLower.includes('塔') || nameLower.includes('观景台') || nameLower.includes('金融'))
        return <Briefcase className="h-4 w-4 mr-2 flex-shrink-0 text-slate-600" />;
    return <MapPin className="h-4 w-4 mr-2 flex-shrink-0 text-gray-500" />;
}

// 创建一个 Ref 映射来存储对卡片 DOM 节点的引用
type DayCardRefs = {
  [key: number]: HTMLDivElement | null;
};


export function PlanDashboardClient({ plan, expenses, user }: PlanDashboardProps) {
    // 状态提升：在父组件管理 selectedDay，默认为 1 (第一天)
    const [selectedDay, setSelectedDay] = useState<number | null>(1);
    const dayCardRefs = useRef<DayCardRefs>({}); // 存储对卡片 DOM 节点的引用

    // 数据准备
    const planData = plan.plan_data;

    // 预算计算 (useMemo 保持不变)
    const { estimatedTotalCNY, spentTotalCNY, remainingBudget, totalSummary } = useMemo(() => {
        const spent = expenses.filter(e => e.currency === 'CNY').reduce((sum, e) => sum + e.amount, 0);
        const estimated = planData.estimated_budget.total_cny || 0;
        const remaining = estimated - spent;
        const summary = Object.entries(expenses.reduce((acc, expense) => {
            const currency = expense.currency || 'UNKNOWN';
            const amount = typeof expense.amount === 'number' ? expense.amount : 0;
            if (!acc[currency]) { acc[currency] = 0; }
            acc[currency] += amount;
            return acc;
        }, {} as { [key: string]: number }))
        .map(([currency, total]) => {
            const formattedAmount = ['JPY', 'KRW'].includes(currency.toUpperCase()) ? total : total.toFixed(2);
            return `${formattedAmount} ${currency}`;
        })
        .join(' | ');
        return { estimatedTotalCNY: estimated, spentTotalCNY: spent, remainingBudget: remaining, totalSummary: summary || '0.00' };
    }, [expenses, planData.estimated_budget.total_cny]);

    // 滚动到选中卡片的 Effect (保持不变)
    useEffect(() => {
        if (selectedDay !== null) {
            const element = dayCardRefs.current[selectedDay];
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [selectedDay]);

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

            {/* 交通和财务摘要 (保持不变) */}
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
                    {/* 去程 */}
                    <div>
                        <h4 className="font-semibold text-slate-600">去程 ({planData.initial_transport.to_destination?.method || 'N/A'})</h4>
                        <p className="text-muted-foreground">{planData.initial_transport.to_destination?.details || '未规划'}</p>
                        <p className="text-green-500 font-medium">预估费用: {planData.initial_transport.to_destination?.estimated_cost ? `${planData.initial_transport.to_destination.estimated_cost} CNY` : 'N/A'}</p>
                    </div>
                    {/* 回程 */}
                    <div>
                        <h4 className="font-semibold text-slate-600">回程 ({planData.initial_transport.from_destination?.method || 'N/A'})</h4>
                        <p className="text-muted-foreground">{planData.initial_transport.from_destination?.details || '未规划'}</p>
                        <p className="text-green-500 font-medium">预估费用: {planData.initial_transport.from_destination?.estimated_cost ? `${planData.initial_transport.from_destination.estimated_cost} CNY` : 'N/A'}</p>
                    </div>
                </CardContent>
            </Card>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 lg:gap-12">
             <div className="md:col-span-2 pt-4 border-t md:border-t-0">
                <div className="space-y-4">
                            <h2 className="text-xl font-semibold flex items-center text-slate-700 mb-2">
                                 <Wallet className="h-5 w-5 mr-2 text-red-500" />
                                 预算与记账
                            </h2>
                            <ExpenseLogger planId={plan.id} />
                </div>
                {/* --- (修改!) 3. 预算摘要 (移到地图下方) --- */}
                        <Card className={`shadow-md border-2 mt-8 ${remainingBudget < 0 ? "border-red-500 bg-red-50/50" : "border-green-500 bg-green-50/50"}`}>
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


             </div>
             <div className="md:col-span-3 space-y-8">
                
                {/* --- (修改!) 4. 开销列表 (移到底部) --- */}
                        <div className="space-y-4 mt-8">
                            <h2 className="text-2xl font-semibold flex items-center text-primary">
                                <ListChecks className="h-6 w-6 mr-2" />
                                开销详情
                            </h2>
                            <p className="text-lg font-medium">已记总开销: {totalSummary || '0.00'}</p>
                            <ExpenseTableWrapper expenses={expenses} planId={plan.id} />
                        </div>
             </div>
</div>
            {/* --- (修改!) 双栏布局容器: 2:3 比例 --- */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8 lg:gap-12">

                {/* --- 左侧栏: 每日行程 (改为 col-span-2) --- */}
                <div className="md:col-span-2 pt-4 border-t md:border-t-0">
                    <h2 className="text-2xl font-semibold mb-6 flex items-center text-primary">
                        <CalendarDays className="h-6 w-6 mr-2" />
                        每日行程
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4 -mt-4">
                        {selectedDay === null ? "点击下方卡片查看详情并定位" : `正在查看: 第 ${selectedDay} 天 (点击可取消)`}
                    </p>
                    <div className="space-y-6">
                        {/* (修改!) 过滤逻辑：只显示选中的卡片，或全部卡片 */}
                        {planData.daily_plan
                            .filter((day) => selectedDay === null || day.day === selectedDay) // 过滤
                            .map((day) => (
                            <Card 
                                key={day.day}
                                ref={(node) => { dayCardRefs.current[day.day] = node; }} 
                                className={`overflow-hidden shadow-sm cursor-pointer transition-all ${selectedDay === day.day ? 'ring-2 ring-primary ring-offset-2 scale-[1.01]' : 'hover:shadow-md'}`}
                                onClick={() => setSelectedDay(day.day === selectedDay ? null : day.day)}
                            >
                                <CardHeader className={`p-4 ${selectedDay === day.day ? 'bg-primary/10' : 'bg-primary/5'}`}>
                                    <CardTitle className="text-xl font-medium text-primary/90">
                                        Day {day.day}: {day.theme || '未命名主题'}
                                    </CardTitle>
                                </CardHeader>
                                {/* (修改!) 内容始终显示，不再依赖点击展开 */}
                                <CardContent className="p-4 space-y-5 border-t">
                                    {/* 活动列表 */}
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-lg mb-2 text-slate-700">活动安排:</h3>
                                        {day.activities && day.activities.length > 0 ? (
                                            day.activities.map((activity, index) => (
                                                activity ? (
                                                    <div key={index} className="pb-4 border-b last:border-b-0 border-dashed">
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
                        ))}
                    </div>
                </div>
                {/* --- 左侧栏结束 --- */}


                {/* --- 右侧栏: 地图 + 预算 (改为 col-span-3) --- */}
                <div className="md:col-span-3 space-y-8">
                    {/* 粘性定位包装器 */}
                    <div className="sticky top-24"> 
                        
                        
                        {/* --- (修改!) 2. 地图 (移到中间) --- */}
                        <div className="mt-8"> {/* 增加上边距 */}
                            <DynamicPlanMap 
                                planData={planData} 
                                selectedDay={selectedDay}
                                onDaySelect={setSelectedDay}
                            />
                        </div>

                        
                 
                    </div>
                </div>
                {/* --- 右侧栏结束 --- */}

            </div>
        </div>
    );
}