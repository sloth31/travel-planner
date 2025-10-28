// 文件: app/api/user/preferences/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// 定义偏好类型 (保持不变)
interface UserPreferences {
    styles?: string[];
    cuisines?: string[];
    transport?: string[];
}

// --- GET Handler: 获取当前用户的偏好 (从新表读取) ---
export async function GET(request: NextRequest) {
    console.log('--- [GET /api/user/preferences v2] Received request ---');
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    try {
        // 1. 获取当前用户 Session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            console.error('GET /api/user/preferences v2: Unauthorized');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        // 2. (修改!) 从 user_preferences 表查询
        const { data: preferenceData, error: selectError } = await supabase
            .from('user_preferences') // 查询新表
            .select('preferences')     // 只选择 preferences 字段
            .eq('user_id', userId)     // 匹配当前用户
            .single();                 // 预期只有一个或零个结果 (因为 user_id 是 unique)

        if (selectError && selectError.code !== 'PGRST116') { // PGRST116 = row not found, 这是预期情况
            console.error('GET /api/user/preferences v2: Supabase select error:', selectError);
            throw selectError;
        }

        // 3. 处理结果
        const preferences = preferenceData?.preferences || {}; // 如果没找到记录或 preferences 为 null，返回空对象
        console.log(`GET /api/user/preferences v2: Returning preferences for user ${userId}:`, preferences);
        return NextResponse.json(preferences);

    } catch (error: any) {
        console.error('GET /api/user/preferences v2: Error fetching preferences:', error.message);
        return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
    }
}


// --- POST Handler: 更新当前用户的偏好 (写入新表) ---
export async function POST(request: NextRequest) {
    console.log('--- [POST /api/user/preferences v2] Received request ---');
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    try {
        // 1. 获取当前用户 Session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            console.error('POST /api/user/preferences v2: Unauthorized');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        // 2. 从请求体中获取新的偏好设置 (验证逻辑保持不变)
        let newPreferences: UserPreferences;
        try {
            newPreferences = await request.json();
            console.log(`POST /api/user/preferences v2: Received preferences for user ${userId}:`, newPreferences);
            // ... (基本验证逻辑保持不变) ...
            if (typeof newPreferences !== 'object' || newPreferences === null) throw new Error("Invalid format.");
            if (newPreferences.styles && !Array.isArray(newPreferences.styles)) throw new Error("Invalid 'styles'.");
            if (newPreferences.cuisines && !Array.isArray(newPreferences.cuisines)) throw new Error("Invalid 'cuisines'.");
            if (newPreferences.transport && !Array.isArray(newPreferences.transport)) throw new Error("Invalid 'transport'.");
        } catch (jsonError: any) {
             console.error('POST /api/user/preferences v2: Invalid request body:', jsonError.message);
             return NextResponse.json({ error: `Invalid request body: ${jsonError.message}` }, { status: 400 });
        }


        // 3. (修改!) 使用 upsert 写入 user_preferences 表
        // upsert 会根据 unique 约束 (user_id) 自动判断是插入新行还是更新现有行
        const { data: upsertedData, error: upsertError } = await supabase
            .from('user_preferences')
            .upsert(
                {
                    user_id: userId,          // 必须提供 user_id
                    preferences: newPreferences, // 要更新/插入的偏好数据
                    // created_at 会自动设置
                    // updated_at 会通过触发器自动更新 (如果设置了) 或保持默认
                },
                {
                    onConflict: 'user_id', // 指定冲突列 (unique key)
                    // ignoreDuplicates: false (默认) - 更新现有行
                }
            )
            .select('preferences') // 操作完成后，返回 preferences 字段
            .single();            // 确认只影响了一行

        if (upsertError) {
            console.error('POST /api/user/preferences v2: Supabase upsert error:', upsertError);
            // 可以根据 upsertError.code 提供更具体的错误信息
            return NextResponse.json({ error: `Failed to save preferences: ${upsertError.message}` }, { status: 500 });
        }

        console.log('POST /api/user/preferences v2: Preferences saved successfully for user:', userId);
        // 4. 返回更新后的偏好
        const updatedPreferences = upsertedData?.preferences || {};
        return NextResponse.json(updatedPreferences);

    } catch (error: any) {
        console.error('POST /api/user/preferences v2: Error updating preferences:', error.message);
        return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
    }
}