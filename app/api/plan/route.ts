// 文件: app/api/plan/route.ts
import { NextResponse, NextRequest } from 'next/server'; // 使用 NextRequest
import OpenAI from 'openai';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// 定义偏好类型 (与 /api/user/preferences 共享)
interface UserPreferences {
    styles?: string[];
    cuisines?: string[];
    transport?: string[];
    // 可以根据需要添加其他偏好字段
}

// --- 核心 System Prompt (保持不变) ---
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

/**
 * 辅助函数：将用户偏好格式化为适合添加到 LLM Prompt 的字符串。
 * @param preferences - 从 Supabase 读取的用户偏好对象。
 * @returns 格式化后的字符串，如果无偏好则返回空字符串。
 */
function formatPreferencesForLLM(preferences: UserPreferences | null | undefined): string {
    if (!preferences || Object.keys(preferences).length === 0) {
        return ""; // 没有偏好或对象为空
    }

    const sections: string[] = []; // 用于存储各个偏好部分的字符串

    // 格式化旅行风格
    if (preferences.styles && preferences.styles.length > 0) {
        sections.push(`旅行风格偏好: ${preferences.styles.join(', ')}`);
    }
    // 格式化餐饮偏好
    if (preferences.cuisines && preferences.cuisines.length > 0) {
        sections.push(`餐饮偏好: ${preferences.cuisines.join(', ')}`);
    }
    // 格式化交通偏好
    if (preferences.transport && preferences.transport.length > 0) {
        sections.push(`交通偏好: ${preferences.transport.join(', ')}`);
    }
    // 在这里可以添加其他偏好字段的格式化，例如：
    // if (preferences.other && preferences.other.includes('with_kids')) {
    //     sections.push("同行者包含孩子，请安排适合亲子的活动");
    // }

    // 如果有任何偏好被格式化，则添加引导语句
    if (sections.length > 0) {
        return "\n\n请在规划行程时务必仔细考虑并体现以下已保存的用户偏好：\n- " + sections.join('\n- ');
    }

    return ""; // 没有有效的偏好内容
}


// --- API Route Handler ---
export async function POST(request: NextRequest) { // 使用 NextRequest
    console.log('--- [POST /api/plan] Received request ---');

    // 1. 惰性初始化 OpenAI 客户端
    const API_KEY = process.env.DASHSCOPE_API_KEY;
    if (!API_KEY) {
        console.error('POST /api/plan: DASHSCOPE_API_KEY not set!');
        return NextResponse.json({ error: 'LLM API Key not configured' }, { status: 500 });
    }
    const openai = new OpenAI({
        apiKey: API_KEY,
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 2. 获取 Supabase 客户端并验证用户 Session
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    let session, userId;
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) throw new Error('User not authenticated');
        session = data.session;
        userId = session.user.id;
        
        console.log(`POST /api/plan: User ${userId} authenticated.`);
    } catch (authError: any) {
        console.error('POST /api/plan: Authentication error:', authError.message);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let userPreferences: UserPreferences | undefined; // 声明变量用于存储偏好
   try {
       // --- (修改!) 从 user_preferences 表读取偏好 ---
        console.log(`POST /api/plan v2: Fetching preferences for user ${userId} from table...`);
        const { data: preferenceData, error: preferenceError } = await supabase
            .from('user_preferences')
            .select('preferences')
            .eq('user_id', userId)
            .maybeSingle(); // 使用 maybeSingle 允许没有找到记录 (返回 null)

        if (preferenceError) {
            // 如果查询出错，记录错误但继续执行（不使用偏好）
            console.error(`POST /api/plan v2: Error fetching preferences for user ${userId}:`, preferenceError.message);
            // 这里不抛出错误，允许在没有偏好的情况下继续
            userPreferences = {}; // 设为空对象
        } else {
            // 如果查询成功 (即使返回 null)，获取 preferences 字段
            userPreferences = preferenceData?.preferences || {}; // 获取数据或为空对象
            console.log(`POST /api/plan v2: Preferences found for user ${userId}:`, userPreferences);
        }
        // 3. 获取前端发送的原始 Prompt
        let originalPrompt: string;
        try {
             const body = await request.json();
             originalPrompt = body.prompt;
             if (!originalPrompt || typeof originalPrompt !== 'string') {
                 throw new Error('Prompt is missing or not a string.');
             }
             console.log('POST /api/plan: Received original prompt:', originalPrompt);
        } catch (parseError: any) {
             console.error('POST /api/plan: Failed to parse request body:', parseError.message);
             return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }


        // 4. (新!) 格式化偏好并注入 Prompt
        const preferenceString = formatPreferencesForLLM(userPreferences);
        const finalUserPrompt = originalPrompt + preferenceString; // 将偏好字符串追加到原始请求后
        console.log("POST /api/plan: Final prompt being sent to LLM:\n", finalUserPrompt); // 打印最终 Prompt


        // 5. 调用 LLM
        console.log("POST /api/plan: Calling LLM...");
        const completion = await openai.chat.completions.create({
            model: 'qwen-plus', // 或您选择的模型
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: finalUserPrompt }, // 使用包含偏好的 Prompt
            ],
            // temperature: 0.7, // 可以调整创造性
        });
        console.log("POST /api/plan: LLM call completed.");

        // 6. 解析和清理 LLM 响应
        const messageContent = completion.choices[0].message.content;
        if (!messageContent) { throw new Error('Empty response from LLM'); }
        const jsonResponse = messageContent.replace(/```json\n?|\n?```/g, '').trim();
        let planData;
        try {
            planData = JSON.parse(jsonResponse);
            // (可选) 在这里可以添加对 planData 结构的验证
            if (!planData.title || !Array.isArray(planData.daily_plan)) {
                 throw new Error("LLM response is missing required fields (title, daily_plan).");
            }
        } catch (parseError: any) {
            console.error("POST /api/plan: Failed to parse LLM JSON response:", parseError.message);
            console.error("Original LLM response content:", messageContent); // 记录原始响应以便调试
            throw new Error("AI 返回了无效的 JSON 格式，请稍后重试或调整请求。");
        }


        // 7. 保存到数据库
        console.log(`POST /api/plan: Saving plan "${planData.title}" to database for user ${userId}...`);
        const { data: newPlan, error: insertError } = await supabase
            .from('plans')
            .insert({
                user_id: userId,
                title: planData.title || 'Untitled Plan',
                original_prompt: originalPrompt, // 保存用户输入的原始 prompt
                plan_data: planData,
                // (可选) 记录当时使用的偏好快照
                // user_preferences_snapshot: userPreferences || {},
            })
            .select('id') // 获取新插入记录的 ID
            .single(); // 确认只插入了一条

        if (insertError) {
            console.error('POST /api/plan: Supabase insert error:', insertError);
            throw new Error(`Database error: ${insertError.message}`); // 抛出错误以便 catch 处理
        }
        if (!newPlan) {
            // 理论上 insert 成功后不会发生，但作为保险
            throw new Error("Failed to retrieve new plan ID after saving.");
        }
        console.log(`POST /api/plan: Plan saved successfully with ID: ${newPlan.id}`);

        // 8. 返回包含新 ID 的结果给前端
        return NextResponse.json({ ...planData, id: newPlan.id });

    } catch (error: any) {
        // 统一错误处理
        console.error('POST /api/plan: Error during plan generation or saving:', error.message);
        // 向客户端返回错误信息
        return NextResponse.json({ error: `处理请求时发生错误: ${error.message}` }, { status: 500 });
    }
}