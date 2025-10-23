// 文件: app/api/log-expense/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// 1.  初始化 OpenAI 客户端 (指向 DashScope)
const API_KEY = process.env.DASHSCOPE_API_KEY;
const openai = new OpenAI({
  apiKey: API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// 2. (关键) 实体提取 Prompt
const SYSTEM_PROMPT = `
你是一个记账助手。
根据用户的输入（例如：“晚餐花了3000日元”或“打车 50 块钱”），你必须只返回一个符合以下 TypeScript 接口的 JSON 对象。
不要有任何其他解释或开场白。

interface IExpense {
  item: string; // 事项, 例如 "晚餐", "打车", "纪念品"
  amount: number; // 金额, 必须是数字
  currency: string; // 货币, 例如 "CNY", "JPY", "USD"。如果是 "元" 或 "块", 默认为 "CNY"。
}

// 示例:
// User: "买了杯咖啡 35 元"
// Assistant: {"item": "咖啡", "amount": 35, "currency": "CNY"}
// User: "shibuya sky 门票 1800 jpy"
// Assistant: {"item": "Shibuya Sky 门票", "amount": 1800, "currency": "JPY"}

// 再次强调：只返回 JSON 对象。
`;

export async function POST(request: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    // 3.  身份验证
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user_id = session.user.id;

    // 4.  获取前端传来的 语音文本 和 计划ID
    const { text, plan_id } = await request.json();
    if (!text || !plan_id) {
      return NextResponse.json(
        { error: 'Text and plan_id are required' },
        { status: 400 }
      );
    }

    // 5.  调用 LLM 提取实体
    const completion = await openai.chat.completions.create({
      model: 'qwen-turbo', //  使用更便宜的 turbo 模型
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    });

    const messageContent = completion.choices[0].message.content;
    if (!messageContent) { throw new Error('Empty response from AI'); }
    
    // 6.  清理并解析 JSON
    const jsonResponse = messageContent.replace(/```json\n?|\n?```/g, '').trim();
    const { item, amount, currency } = JSON.parse(jsonResponse);

    // 7.  存入数据库
    const { error: insertError } = await supabase.from('expenses').insert({
      user_id: user_id,
      plan_id: plan_id,
      item: item,
      amount: amount,
      currency: currency,
      original_text: text, // 存入原始文本
    });

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to log expense' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, logged: { item, amount, currency } });

  } catch (error) {
    console.error('Error logging expense:', error);
    return NextResponse.json(
      { error: 'Failed to process expense' },
      { status: 500 }
    );
  }
}