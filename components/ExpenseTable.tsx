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
   category: string;
}

interface ExpenseTableProps {
  expenses: IExpense[]; // 接收从服务器获取的开销数据
  planId: string; // (可选，如果未来有需要)
}
function getCategoryTag(category: string): React.ReactNode {
    const baseClasses = "inline-block text-xs font-semibold px-2 py-0.5 rounded-full capitalize";

    // --- (关键修复!) 规范化类别名称 ---
    const normalizedCategory = category.trim().toLowerCase(); // 清除空格并转为小写
    // --- 修复结束 ---

    let labelText = category || 'Other'; // 用于显示在标签上的文本
    let classes = `${baseClasses} bg-gray-100 text-gray-700`; // 默认值

    switch (normalizedCategory) {
        case 'food': 
            classes = `${baseClasses} bg-red-100 text-red-700`;
            labelText = 'Food';
            break;
        case 'transport': 
            classes = `${baseClasses} bg-blue-100 text-blue-700`;
            labelText = 'Transport';
            break;
        case 'accommodation': 
            classes = `${baseClasses} bg-yellow-100 text-yellow-700`;
            labelText = 'Accommodation';
            break;
        case 'activities': 
            classes = `${baseClasses} bg-green-100 text-green-700`;
            labelText = 'Activities';
            break;
        case 'shopping': 
            classes = `${baseClasses} bg-purple-100 text-purple-700`;
            labelText = 'Shopping';
            break;
        case 'other': 
             classes = `${baseClasses} bg-slate-100 text-slate-700`;
             labelText = 'Other';
             break;
        default: 
            // 如果 LLM 返回了无法识别的分类字符串，使用 'Unknown'
            classes = `${baseClasses} bg-gray-100 text-gray-700`;
            labelText = 'Unknown';
            break;
    }
    
    // (修复) 使用 labelText 作为标签内容，但保留 capitalize 样式
    return <span className={classes}>{labelText}</span>;
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

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">事项</TableHead>
              <TableHead className="w-[20%]">类别</TableHead> {/* (新!) 类别列 */}
              <TableHead className="w-[20%]">金额</TableHead>
              <TableHead className="w-[25%] text-right">时间 / 操作</TableHead> {/* (修改) 合并操作列 */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">
                  暂无开销记录
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="font-medium text-sm">{expense.item}</TableCell>
                  <TableCell>{getCategoryTag(expense.category)}</TableCell> {/* (新!) 显示类别标签 */}
                  <TableCell>{expense.amount} {expense.currency}</TableCell>
                  <TableCell className="text-right flex items-center justify-end space-x-2">
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(expense.created_at).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(expense.id)}
                      disabled={deletingId === expense.id}
                      aria-label="删除"
                      className="h-7 w-7 flex-shrink-0" // 调整按钮大小
                    >
                      {deletingId === expense.id ? (
                         <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></span>
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
   
  );
}