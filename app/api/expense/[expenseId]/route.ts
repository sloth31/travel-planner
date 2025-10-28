// 文件: app/api/expense/[expenseId]/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// DELETE 方法处理函数
export async function DELETE(
  request: Request,
  { params }: { params: { expenseId: string } } // 从 URL 动态参数获取 expenseId
) {
  const expenseId = params.expenseId;
  console.log(`--- [DELETE /api/expense/${expenseId}] Received request ---`);

  // 1. 验证用户身份
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    console.error('Unauthorized delete attempt.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
console.log(`[DEBUG DELETE API] Attempting delete for expenseId: ${expenseId} by userId: ${userId}`);
  // 2. 参数校验 (可选，但推荐)
  if (!expenseId || typeof expenseId !== 'string' || expenseId.length < 10) { // 简单检查 ID 格式
     console.error('Invalid expenseId provided:', expenseId);
     return NextResponse.json({ error: 'Invalid expense ID' }, { status: 400 });
  }

  try {
    // 3. 执行删除操作
    // RLS 策略会确保用户只能删除 user_id 匹配的记录
    const { error: deleteError, count } = await supabase
      .from('expenses')
      .delete()
      .match({ id: expenseId, user_id: userId }); // 同时匹配 id 和 user_id 作为双重保险

    if (deleteError) {
      console.error(`Supabase delete error for expense ${expenseId}:`, deleteError);
      throw deleteError; // 抛出错误以便 catch 块处理
    }

    // 4. 检查是否真的删除了记录
    if (count === 0) {
       console.warn(`Expense ${expenseId} not found or user ${userId} does not own it.`);
       // 可以返回 404 Not Found 或 403 Forbidden，这里用 404
       return NextResponse.json({ error: 'Expense not found or you do not have permission to delete it' }, { status: 404 });
    }

    console.log(`Successfully deleted expense ${expenseId} for user ${userId}. Count: ${count}`);
    // 5. 返回成功响应 (200 OK 或 204 No Content 都可以)
    // 使用 200 并返回一个消息
    return NextResponse.json({ message: 'Expense deleted successfully' }, { status: 200 });

  } catch (error: any) {
    console.error(`Error deleting expense ${expenseId}:`, error.message);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}