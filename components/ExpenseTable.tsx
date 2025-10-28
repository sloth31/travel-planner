// 文件: components/ExpenseTable.tsx
'use client'; // 标记为客户端组件

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2 } from 'lucide-react'; // 引入删除图标
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// (复用) 从页面组件复制 Expense 类型定义
interface IExpense {
  id: string;
  created_at: string;
  item: string;
  amount: number;
  currency: string;
}

interface ExpenseTableProps {
  expenses: IExpense[]; // 接收从服务器获取的开销数据
  planId: string; // (可选，如果未来有需要)
}

export function ExpenseTable({ expenses, planId }: ExpenseTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null); // 记录正在删除的 ID
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (expenseId: string) => {
    // 1. 添加确认对话框 (防止误删)
    if (!window.confirm(`确定要删除这笔开销吗？`)) {
      return;
    }

    setDeletingId(expenseId); // 设置加载状态
    setError(null);

    try {
      // 2. 发送 DELETE 请求到后端 API
      const response = await fetch(`/api/expense/${expenseId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `删除失败 (状态: ${response.status})`);
      }

      console.log(`Expense ${expenseId} deleted successfully.`);
      // 3. 刷新页面数据
      // (注意: 如果之前 Realtime 正常工作，这里刷新后 Realtime 应该也会自动更新其他客户端)
      router.refresh();

    } catch (err: any) {
      console.error(`Failed to delete expense ${expenseId}:`, err);
      setError(`删除失败: ${err.message}`);
    } finally {
      setDeletingId(null); // 清除加载状态
    }
  };

  return (
    <div className="space-y-4">
      {/* (新) 添加错误提示区域 */}
      {error && (
          <Alert variant="destructive">
              <AlertTitle>删除错误</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
          </Alert>
      )}

      {/* 表格本身 */}
      <div className="border rounded-lg max-h-96 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>事项</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>时间</TableHead>
              <TableHead className="text-right">操作</TableHead> {/* (新) 添加操作列 */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center"> {/* (修改) colSpan 改为 4 */}
                  暂无开销记录
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell>{expense.item}</TableCell>
                  <TableCell>{expense.amount} {expense.currency}</TableCell>
                  <TableCell>
                    {new Date(expense.created_at).toLocaleString('zh-CN', {
                       hour: '2-digit', minute: '2-digit'
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* (新) 删除按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(expense.id)}
                      disabled={deletingId === expense.id} // 删除中禁用
                      aria-label="删除"
                    >
                      {deletingId === expense.id ? (
                         <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></span> // 简易 Loading
                      ) : (
                         <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}