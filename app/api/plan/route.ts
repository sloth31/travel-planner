// 文件: app/api/plan/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// ... (OpenAI 客户端和 SYSTEM_PROMPT 保持不变) ...
const API_KEY = process.env.DASHSCOPE_API_KEY;
const openai = new OpenAI({
  apiKey: API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});
const SYSTEM_PROMPT = `
你是一个专业的旅行规划师。
根据用户的请求（目的地、天数、预算、偏好等），你必须只返回一个符合以下 TypeScript 接口的 JSON 对象，不要有任何其他解释或开场白。

interface IActivity {
  name: string;
  description: string;
  location: string; // 地点名称，例如 "秋叶原"
  lat: number;       // 纬度
  lng: number;       // 经度
}

interface IDailyPlan {
  day: number;
  theme: string; // 例如: "动漫与科技"
  activities: IActivity[];
  meals: {
    breakfast: string; // 推荐的餐厅或类型
    lunch: string;
    dinner: string;
  };
}

interface IPlan {
  title: string; // 例如: "东京5日美食动漫探索之旅"
  budget_overview: string; // 对预算的简短分析
  daily_plan: IDailyPlan[];
}

// 确保所有地点都有准确的 lat 和 lng。
// 再次强调：只返回 JSON 对象。
`;

export async function POST(request: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user_id = session.user.id;

    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // ... (调用 OpenAI/DashScope 的逻辑保持不变) ...
    const completion = await openai.chat.completions.create({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    });
    
    const messageContent = completion.choices[0].message.content;
    if (!messageContent) { throw new Error('Empty response from AI'); }
    const jsonResponse = messageContent.replace(/```json\n?|\n?```/g, '').trim();
    const planData = JSON.parse(jsonResponse);

    // 5. (Change!) 
    // 将 AI 结果存入数据库，并立即取回新生成的 'id'
    const { data: newPlan, error: insertError } = await supabase
      .from('plans')
      .insert({
        user_id: user_id,
        title: planData.title || 'Untitled Plan',
        original_prompt: prompt,
        plan_data: planData,
      })
      .select('id') // <-- (关键) 告诉 Supabase 返回 'id'
      .single();     // <-- (关键) 因为我们知道只插入了一行

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save plan after generation.' }, 
        { status: 500 }
      );
    }
    
    if (!newPlan) {
      return NextResponse.json(
        { error: 'Failed to get new plan ID after saving.' }, 
        { status: 500 }
      );
    }

    // 6. (Change!) 
    // 将 AI 数据和新 'id' 一起返回给前端
    return NextResponse.json({ ...planData, id: newPlan.id });

  } catch (error) {
    console.error('Error generating plan:', error);
    return NextResponse.json(
      { error: 'Failed to generate plan' },
      { status: 500 }
    );
  }
}