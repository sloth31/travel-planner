// 文件: app/api/plan/route.ts
import { NextResponse, NextRequest } from 'next/server';
import OpenAI from 'openai';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// 定义偏好类型 (保持不变)
interface UserPreferences {
    styles?: string[];
    cuisines?: string[];
    transport?: string[];
}

// --- 核心 System Prompt (包含新的预算和交通结构) ---
const SYSTEM_PROMPT = `
你是一个专业的旅行规划师，你的首要任务是根据用户的请求和偏好，生成一个详细且经济合理的旅行计划。
你必须只返回一个符合以下 TypeScript 接口的 JSON 对象，不要有任何其他解释或开场白。

interface IActivity {
  name: string; //  景点的通用名称 (例如: "乌菲兹美术馆")
  description: string;
  location: string; //  景点的具体街道地址 (例如: "Piazzale degli Uffizi, 6, 50122 Firenze FI, Italy")
  lat: number;
  lng: number;
}
  // -------------------------------------------------------------------
// (重要!) 在你的 JSON 响应中:
// 'name' 必须是景点的通用名称。
// 'location' 必须是该景点的 *具体街道地址* (如果可能，包含城市和国家)。
// *不要* 在 'location' 字段中简单地重复 'name' 字段的内容！
// 'lat' 和 'lng' 必须是该街道地址的精确坐标。
// -------------------------------------------------------------------

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

//  定义交通结构
interface ITransportDetail {
    method: 'Flight' | 'HSR' | 'Train' | 'Bus' | 'Self-Drive'; // 交通方式
    estimated_cost: number; // 预估票价（不需严格精确，以人民币 CNY 计，请取整）
    details: string; // 具体的建议，如“建议预定最早的航班”
}

//  IPlan 接口包含新的预算和交通字段
interface IPlan {
  title: string;
  budget_overview: string; // 对预算的简短分析
  daily_plan: IDailyPlan[];
  
  //  总体预算预估
  estimated_budget: {
      total_cny: number; // 总体预估花费总计 (CNY, 请取整)
      accommodation: number; // 住宿费预估 (CNY, 请取整)
      flights_and_trains: number; // 往返交通费预估 (CNY, 请取整)
      local_transport: number; // 当地交通费预估 (CNY, 请取整)
      food_and_drink: number; // 餐饮费预估 (CNY, 请取整)
      activities_and_tickets: number; // 门票/活动费预估 (CNY, 请取整)
  };
  
  //  去程和回程交通规划
  initial_transport: {
      to_destination: ITransportDetail; // 去程细节
      from_destination: ITransportDetail; // 回程细节
  }
}

// 确保所有地点都有准确的 lat 和 lng。
// 再次强调：只返回 JSON 对象。
`;

// 辅助函数 formatPreferencesForLLM (略微修改，提醒交通规划)
function formatPreferencesForLLM(preferences: UserPreferences | null | undefined): string {
    if (!preferences || Object.keys(preferences).length === 0) {
        return "";
    }

    const sections: string[] = [];
    if (preferences.styles && preferences.styles.length > 0) {
        sections.push(`旅行风格偏好: ${preferences.styles.join(', ')}`);
    }
    if (preferences.cuisines && preferences.cuisines.length > 0) {
        sections.push(`餐饮偏好: ${preferences.cuisines.join(', ')}`);
    }
    if (preferences.transport && preferences.transport.length > 0) {
        sections.push(`当地交通偏好: ${preferences.transport.join(', ')}`);
    }

    if (sections.length > 0) {
        return "\n\n请在规划行程时务必仔细考虑并体现以下已保存的用户偏好：\n- " + sections.join('\n- ');
    }

    return "";
}


// --- API Route Handler ---
export async function POST(request: NextRequest) {
    console.log('--- [POST /api/plan v3] Received request ---');

    // 1. 惰性初始化 OpenAI 客户端 (保持不变)
    const API_KEY = process.env.DASHSCOPE_API_KEY;
    if (!API_KEY) {
        console.error('POST /api/plan: LLM API Key not set!');
        return NextResponse.json({ error: 'LLM API Key not configured' }, { status: 500 });
    }
    const openai = new OpenAI({
        apiKey: API_KEY,
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 2. 获取 Session, UserId (保持不变)
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    let session, userId;
    try {
        /* ... 认证逻辑 ... */
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) throw new Error('User not authenticated');
        session = data.session;
        userId = session.user.id;
        console.log(`POST /api/plan v3: User ${userId} authenticated.`);
    } catch (authError: any) {
        console.error('POST /api/plan v3: Authentication error:', authError.message);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let userPreferences: UserPreferences | undefined;
    let originalPrompt: string;
    let departureCity: string | undefined; //  出发城市变量

    try {
        // 3. 获取前端发送的原始 Prompt 和其他数据
        const body = await request.json();
        originalPrompt = body.prompt;
        departureCity = body.departureCity; //  从 body 中获取出发城市

        if (!originalPrompt || typeof originalPrompt !== 'string') {
             return NextResponse.json({ error: 'Prompt is missing or not a string.' }, { status: 400 });
        }
        if (!departureCity || typeof departureCity !== 'string') {
             // (重要!) 如果没有出发地，LLM 无法规划往返交通
             return NextResponse.json({ error: '请提供出发城市，以便规划往返交通。' }, { status: 400 });
        }
        console.log('POST /api/plan v3: Departure city:', departureCity);
        console.log('POST /api/plan v3: Original prompt:', originalPrompt);


        // 4. 读取用户偏好 (从 user_preferences 表读取，保持不变)
        const { data: preferenceData, error: preferenceError } = await supabase
            .from('user_preferences')
            .select('preferences')
            .eq('user_id', userId)
            .maybeSingle();

        userPreferences = preferenceData?.preferences || {};
        const preferenceString = formatPreferencesForLLM(userPreferences);


        // 5. 格式化并注入 Prompt
        const transportInstruction = `\n\n用户将从 ${departureCity} 出发前往目的地。请根据此信息在 JSON 的 'initial_transport' 字段中，为去程和回程提供合理的交通方式（航班/高铁等）和预估票价（CNY）。`;
        
        const finalUserPrompt = originalPrompt + preferenceString + transportInstruction; // 注入偏好和交通指令
        console.log("POST /api/plan v3: Final prompt being sent to LLM:\n", finalUserPrompt);


        // 6. 调用 LLM (保持不变)
        const completion = await openai.chat.completions.create({
            model: 'qwen-plus',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: finalUserPrompt },
            ],
        });


        // 7. 解析、保存和返回 (保持不变)
        /* ... 解析响应，获取 planData ... */
        const messageContent = completion.choices[0].message.content;
        if (!messageContent) { throw new Error('Empty response from LLM'); }
        const jsonResponse = messageContent.replace(/```json\n?|\n?```/g, '').trim();
        let planData;
        try {
            planData = JSON.parse(jsonResponse);
            // 简单验证关键结构是否存在
            if (!planData.title || !Array.isArray(planData.daily_plan) || !planData.estimated_budget || !planData.initial_transport) {
                 throw new Error("LLM response is missing required budget/transport fields.");
            }
        } catch (parseError: any) {
            console.error("POST /api/plan v3: Failed to parse LLM JSON response:", parseError.message);
            throw new Error("AI 返回了无效的 JSON 格式，请稍后重试或调整请求。");
        }


        // 8. 保存到数据库并返回 ID (保持不变)
        const { data: newPlan, error: insertError } = await supabase
            .from('plans')
            .insert({
                user_id: userId,
                title: planData.title || 'Untitled Plan',
                original_prompt: originalPrompt,
                plan_data: planData,
            })
            .select('id').single();

        if (insertError) { throw new Error(`Database error: ${insertError.message}`); }
        if (!newPlan) { throw new Error("Failed to retrieve new plan ID after saving."); }

        return NextResponse.json({ ...planData, id: newPlan.id });

    } catch (error: any) {
        console.error('POST /api/plan v3: Error during plan generation or saving:', error.message);
        return NextResponse.json({ error: `处理请求时发生错误: ${error.message}` }, { status: 500 });
    }
}