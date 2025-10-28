// 文件: app/api/plan/[planId]/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function DELETE(
  request: Request,
  { params }: { params: { planId: string } }
) {
  const planId = params.planId;
  console.log(`--- [DELETE /api/plan/${planId}] Received request ---`);

  // 1. 验证用户
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    console.error('Unauthorized delete attempt for plan.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // 2. 参数校验
  if (!planId || typeof planId !== 'string' || planId.length < 10) {
     console.error('Invalid planId provided:', planId);
     return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
  }

  try {
    // --- (关键!) 手动删除关联的 expenses ---
    // (如果数据库外键已设置 ON DELETE CASCADE，则此段代码可以省略)
    console.log(`Attempting to delete expenses associated with plan ${planId} for user ${userId}...`);
    const { error: deleteExpensesError, count: expensesDeletedCount } = await supabase
        .from('expenses')
        .delete()
        .match({ plan_id: planId, user_id: userId }); // 确保只删自己的

    if (deleteExpensesError) {
        console.error(`Supabase error deleting expenses for plan ${planId}:`, deleteExpensesError);
        // 决定是否因为删除 expenses 失败而中断：通常应该中断
        throw new Error(`Failed to delete associated expenses: ${deleteExpensesError.message}`);
    }
    console.log(`Deleted ${expensesDeletedCount} associated expenses.`);
    // --- 手动删除 expenses 结束 ---


    // 3. 删除 plan 本身
    console.log(`Attempting to delete plan ${planId} for user ${userId}...`);
    const { error: deletePlanError, count: planDeletedCount } = await supabase
      .from('plans')
      .delete()
      .match({ id: planId, user_id: userId }); // RLS 策略 + match 双重保险

    if (deletePlanError) {
      console.error(`Supabase error deleting plan ${planId}:`, deletePlanError);
      throw deletePlanError;
    }

    // 4. 检查 plan 是否被删除
    if (planDeletedCount === 0) {
       console.warn(`Plan ${planId} not found or user ${userId} does not own it.`);
       // 如果 expenses 被删除了但 plan 没找到，这可能是一个数据不一致的状态，但我们仍返回 404
       return NextResponse.json({ error: 'Plan not found or you do not have permission to delete it' }, { status: 404 });
    }

    console.log(`Successfully deleted plan ${planId} (and ${expensesDeletedCount} expenses) for user ${userId}.`);
    // 5. 返回成功响应
    return NextResponse.json({ message: 'Plan and associated expenses deleted successfully' }, { status: 200 });

  } catch (error: any) {
    console.error(`Error deleting plan ${planId}:`, error.message);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}