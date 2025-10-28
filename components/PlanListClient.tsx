// 文件: components/PlanListClient.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card'; // 只导入 Card
import { Button } from '@/components/ui/button';
import { Trash2, MapPin } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Plan 类型定义
type Plan = {
  id: string;
  created_at: string;
  title: string;
};

interface PlanListClientProps {
  plans: Plan[];
}

export function PlanListClient({ plans }: PlanListClientProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (planId: string, planTitle: string) => {
    // 删除逻辑保持不变
    if (!window.confirm(`确定要删除行程 "${planTitle}" 吗？\n这将同时删除所有关联的开销记录！`)) { return; }
    setDeletingId(planId); setError(null);
    try {
      const response = await fetch(`/api/plan/${planId}`, { method: 'DELETE' });
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.error || `删除失败 (状态: ${response.status})`); }
      console.log(`Plan ${planId} deleted successfully.`); router.refresh();
    } catch (err: any) {
      console.error(`Failed to delete plan ${planId}:`, err); setError(`删除失败: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>删除错误</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 计划列表 */}
      {plans.length === 0 ? (
        <p className="text-muted-foreground text-center">
          你还没有创建任何行程。
        </p>
      ) : (
        plans.map((plan) => (
          // --- (最终布局 v2!) ---
          // 1. Card 作为容器，添加内边距
          <Card key={plan.id} className="hover:shadow-lg transition-shadow p-4">
            {/* 2. 内部创建一个 Flex 容器，垂直居中 */}
            <div className="flex items-center w-full">

              {/* 3. 左侧区域: 图标 + 文字链接 */}
              {/* 这个 div 包含图标和文字，并占据主要空间 */}
              <Link href={`/plan/${plan.id}`} legacyBehavior>
                <a className="flex items-center flex-grow overflow-hidden mr-4"> {/* Flex 布局, 垂直居中, 占据空间, 右边距, 防溢出 */}
                  {/* 图标 */}
                  <div className="pr-3 flex-shrink-0">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                  </div>
                  {/* 文字块 */}
                  <div className="overflow-hidden"> {/* 防止文字溢出 */}
                    <div className="text-sm md:text-base font-medium text-left truncate">{plan.title}</div>
                    <p className="text-xs text-muted-foreground text-left">
                      创建于: {new Date(plan.created_at).toLocaleString('zh-CN', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </a>
              </Link>

              {/* 4. 右侧区域: 删除按钮 */}
              {/* 这个 div 只包含按钮，flex-shrink-0 防止被压缩 */}
              <div className="flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(plan.id, plan.title);
                    }}
                    disabled={deletingId === plan.id}
                    aria-label="删除行程"
                  >
                    {deletingId === plan.id ? (
                      <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></span>
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
              </div>
            </div>
            {/* --- (布局结束) --- */}
          </Card>
        ))
      )}
    </div>
  );
}