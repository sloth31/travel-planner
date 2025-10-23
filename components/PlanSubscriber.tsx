// 文件: components/PlanSubscriber.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * 这是一个 "headless" 客户端组件，使用 "单一频道，多个监听器" 模式
 * 监听数据库变更。
 */
export function PlanSubscriber({ planId }: { planId: string }) {
  const router = useRouter();
  

  useEffect(() => {
    // (修复) 
    // 只在 useEffect 内部（即客户端）创建客户端
    const supabase = createClientComponentClient();
    
    console.log(`[Realtime] PlanSubscriber mounting for planId: ${planId}`);

    // (修复) 统一定义一个刷新处理器
    const handleRefresh = (payload: any) => {
      console.log('[Realtime] Change detected!', payload);
      console.log('[Realtime] Attempting router.refresh()...');
      router.refresh();
      console.log('[Realtime] router.refresh() call completed.');
    };

    // (修复) 定义一个*单一*的、唯一的频道名称
    const channelName = `plan-details-${planId}`;
    
    // (修复) 创建*单一*频道
    const channel = supabase
      .channel(channelName)
      
      // 监听器 1: 监听 'plans' 表的 'UPDATE'
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // 只关心更新
          schema: 'public',
          table: 'plans',
          filter: `id=eq=${planId}`, // 只监听这个 plan_id
        },
        (payload) => {
          console.log('[Realtime] "plans" table updated!');
          handleRefresh(payload); // 收到事件后调用刷新
        }
      )
      
      // 监听器 2: 监听 'expenses' 表的 'INSERT', 'UPDATE', 'DELETE'
      .on(
        'postgres_changes',
        {
          event: '*', // 监听所有事件
          schema: 'public',
          table: 'expenses',
          filter: `plan_id=eq=${planId}`, // 只监听这个 plan_id 的开销
        },
        (payload) => {
          console.log('[Realtime] "expenses" table changed!');
          handleRefresh(payload); // 收到事件后也调用刷新
        }
      )
      
      // (修复) 最后，对这个*单一*频道执行 .subscribe()
      .subscribe((status) => {
        // (DEBUG) 确认订阅状态
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] SUBSCRIBED to single channel: ${channelName}`);
        } else {
          console.log(`[Realtime] Channel status: ${status}`);
        }
      });

    // (关键) 组件卸载时的清理函数
    return () => {
      console.log(`[Realtime] Unsubscribing from channel: ${channelName}`);
      supabase.removeChannel(channel);
    };
    
    // (修复) 
    // 由于 supabase 是在 effect 内部创建的，
    // 它不再是外部依赖。
  }, [planId, router]); // 依赖项

  // 这个组件不渲染任何 UI
  return null;
}