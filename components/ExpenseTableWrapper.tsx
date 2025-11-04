// 文件: components/ExpenseTableWrapper.tsx
'use client';

import { useState, useMemo } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ExpenseTable } from './ExpenseTable'; // 导入原有的表格组件
import { ListFilter } from 'lucide-react'; // 导入筛选图标

// (复用) Expense 类型定义
interface IExpense {
  id: string;
  created_at: string;
  item: string;
  amount: number;
  currency: string;
  category: string;
}

interface ExpenseTableWrapperProps {
  expenses: IExpense[];
  planId: string;
}

// 定义所有可能的分类 (与后端 LLM Prompt 保持一致)
const ALL_CATEGORIES = [
  'All', 'Food', 'Transport', 'Accommodation', 
  'Activities', 'Shopping', 'Other'
];

export function ExpenseTableWrapper({ expenses, planId }: ExpenseTableWrapperProps) {
  const [selectedCategory, setSelectedCategory] = useState('All');

  // 1. (新!) 筛选逻辑：根据选中的分类筛选开销
  const filteredExpenses = useMemo(() => {
    if (selectedCategory === 'All') {
      return expenses;
    }
    // 强制转换为小写进行安全比较
    const normalizedSelected = selectedCategory.toLowerCase();
    return expenses.filter(
      (expense) => expense.category && expense.category.toLowerCase() === normalizedSelected
    );
  }, [expenses, selectedCategory]);

  // 2. (新!) 提取实际存在的分类（用于动态显示筛选选项）
  const uniqueCategories = useMemo(() => {
    const categories = new Set<string>();
    expenses.forEach(e => {
        if (e.category) categories.add(e.category);
    });
    // 返回所有分类 + All
    return ['All', ...Array.from(categories).sort()];
  }, [expenses]);


  return (
    <div className="space-y-3">
      {/* 筛选 UI */}
      <div className="flex items-center justify-between gap-4">
          <div className="flex items-center space-x-2 text-sm text-slate-600">
              <ListFilter className="h-4 w-4" />
              <span>筛选类别:</span>
          </div>
          
          <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={expenses.length === 0}>
              <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="所有类别" />
              </SelectTrigger>
              <SelectContent>
                  {/* 遍历实际存在的分类作为选项 */}
                  {uniqueCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                          {cat === 'All' ? '全部开销' : cat}
                      </SelectItem>
                  ))}
              </SelectContent>
          </Select>
      </div>

      {/* 表格主体 (添加最大高度和滚动条) */}
      <div className="max-h-[500px] overflow-y-auto border rounded-lg">
          <ExpenseTable expenses={filteredExpenses} planId={planId} />
      </div>

      {/* 底部显示筛选结果摘要 */}
      <p className="text-sm text-muted-foreground">
        显示 {filteredExpenses.length} 条记录 (共 {expenses.length} 条)
      </p>
    </div>
  );
}