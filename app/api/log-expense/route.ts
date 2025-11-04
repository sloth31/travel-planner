// 文件: app/api/log-expense/route.ts
import { NextResponse, NextRequest } from 'next/server';
import OpenAI from 'openai';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// --- (修改!) LLM 实体提取 Prompt：新增分类 ---
const SYSTEM_PROMPT = `
你是一个专业的旅行记账助手。
根据用户的输入，你必须只返回一个符合以下 TypeScript 接口的 JSON 对象。
不要有任何其他解释或开场白。

enum ExpenseCategory {
    Food = 'Food', // 餐饮
    Transport = 'Transport', // 交通 (本地交通, 打车等)
    Accommodation = 'Accommodation', // 住宿
    Activities = 'Activities', // 门票, 活动
    Shopping = 'Shopping', // 购物, 纪念品
    Other = 'Other', // 其他杂项开销
}

interface IExpense {
  item: string; // 事项, 例如 "晚餐", "高铁票", "纪念品"
  amount: number; // 金额, 必须是数字
  currency: string; // 货币, 例如 "CNY", "JPY", "USD"。
  category: ExpenseCategory; // (新!) 必须是上面的枚举类型之一
}

请根据用户提供的 'item' 和 'amount' 来推断并分配一个最合适的 'category'。
`;
// --- Prompt 结束 ---


export async function POST(request: NextRequest) {
  console.log('--- [POST /api/log-expense] Received request for classification ---');
    
  // 1. 惰性初始化 OpenAI 客户端
  const API_KEY = process.env.DASHSCOPE_API_KEY;
  if (!API_KEY) {
    console.error('POST /api/log-expense: DASHSCOPE_API_KEY is not set');
    return NextResponse.json(
      { error: 'LLM API Key not configured' },
      { status: 500 }
    );
  }
  
  const openai = new OpenAI({
    apiKey: API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  });

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    // 2. 身份验证
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user_id = session.user.id;

    // 3. 获取前端传来的 识别文本 和 计划ID
    const { text, plan_id } = await request.json();
    if (!text || !plan_id) {
      return NextResponse.json(
        { error: 'Text and plan_id are required' },
        { status: 400 }
      );
    }
    console.log(`Received text: "${text}", Plan ID: ${plan_id}`);


    // 4. 调用 LLM 提取实体和分类
    const completion = await openai.chat.completions.create({
      model: 'qwen-turbo', // 使用更便宜的 turbo 模型
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    });

    const messageContent = completion.choices[0].message.content;
    if (!messageContent) { throw new Error('Empty response from AI'); }
    
    // 5. 清理并解析 JSON (新!) 包含 category
    const jsonResponse = messageContent.replace(/```json\n?|\n?```/g, '').trim();
    // 确保解析时能接收 item, amount, currency, category
    const { item, amount, currency, category } = JSON.parse(jsonResponse); 


    // 6. 存入数据库 (新!) 插入 category
    const { error: insertError } = await supabase.from('expenses').insert({
      user_id: user_id,
      plan_id: plan_id,
      item: item,
      amount: amount,
      currency: currency,
      category: category, // (新!) 插入 category
      original_text: text, // 存入原始文本
    });

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to log expense' },
        { status: 500 }
      );
    }

    // 7. 返回给前端 (新!) 返回 category
    return NextResponse.json({ success: true, logged: { item, amount, currency, category } });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error logging expense:', errorMessage);
    return NextResponse.json(
      { error: `Failed to process expense: ${errorMessage}` },
      { status: 500 }
    );
  }
}