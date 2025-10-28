// 文件: components/ProfileForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Palette, Utensils, Car } from 'lucide-react';

// (复用) 定义偏好类型
interface UserPreferences {
    styles?: string[];
    cuisines?: string[];
    transport?: string[];
}

// (新!) 定义可选的偏好项目
const preferenceOptions = {
    styles: [
        { id: 'history', label: '历史遗迹' },
        { id: 'nature', label: '自然风光' },
        { id: 'city', label: '城市探索/CBD' },
        { id: 'shopping', label: '购物' },
        { id: 'relax', label: '休闲度假' },
        { id: 'foodie', label: '美食探索' }, // 添加一个美食相关的风格
        { id: 'anime', label: '动漫文化' }, // 添加动漫相关的风格
    ],
    cuisines: [
        { id: 'local', label: '寻找本地特色' },
        { id: 'chinese', label: '中餐' },
        { id: 'japanese', label: '日料' },
        { id: 'western', label: '西餐' },
        { id: 'halal', label: '清真' },
        { id: 'vegetarian', label: '素食' },
    ],
    transport: [
        { id: 'public', label: '公共交通优先' },
        { id: 'walk', label: '步行' },
        { id: 'drive', label: '自驾' },
        { id: 'taxi', label: '出租车/网约车' },
    ],
    // 可以在此添加更多分类，例如 'other'
};

interface ProfileFormProps {
    initialPreferences: UserPreferences; // 从服务器接收初始偏好
}

export function ProfileForm({ initialPreferences }: ProfileFormProps) {
    // 使用状态管理选中的偏好
    const [selectedStyles, setSelectedStyles] = useState<string[]>(initialPreferences.styles || []);
    const [selectedCuisines, setSelectedCuisines] = useState<string[]>(initialPreferences.cuisines || []);
    const [selectedTransport, setSelectedTransport] = useState<string[]>(initialPreferences.transport || []);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // 当 initialPreferences 变化时更新状态 (虽然在这个页面可能只加载一次)
    useEffect(() => {
        setSelectedStyles(initialPreferences.styles || []);
        setSelectedCuisines(initialPreferences.cuisines || []);
        setSelectedTransport(initialPreferences.transport || []);
    }, [initialPreferences]);

    // 处理 Checkbox 变化的通用函数
    const handleCheckboxChange = (
        category: keyof typeof preferenceOptions, // 'styles', 'cuisines', 'transport'
        itemId: string,
        checked: boolean | 'indeterminate' // Checkbox 的 onCheckedChange 参数类型
    ) => {
        const updater = (prev: string[]) => {
            if (checked === true) {
                return [...prev, itemId]; // 添加
            } else {
                return prev.filter((id) => id !== itemId); // 移除
            }
        };

        switch (category) {
            case 'styles':
                setSelectedStyles(updater);
                break;
            case 'cuisines':
                setSelectedCuisines(updater);
                break;
            case 'transport':
                setSelectedTransport(updater);
                break;
        }
    };

    // 处理表单提交
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccess(null);

        const updatedPreferences: UserPreferences = {
            styles: selectedStyles,
            cuisines: selectedCuisines,
            transport: selectedTransport,
        };

        try {
            const response = await fetch('/api/user/preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedPreferences),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || '保存偏好失败');
            }

            const savedPreferences = await response.json();
            console.log("Preferences saved successfully:", savedPreferences);
            setSuccess("偏好设置已成功保存！");

            // 可选：可以更新本地状态以匹配服务器返回的值，虽然理论上应该一致
            // setSelectedStyles(savedPreferences.styles || []);
            // ...

        } catch (err: any) {
            console.error("Error saving preferences:", err);
            setError(`保存失败: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 渲染 Checkbox 组的辅助函数
    const renderCheckboxGroup = (
        category: keyof typeof preferenceOptions,
        selectedItems: string[]
    ) => {
        return (
            <div className="space-y-2">
                {preferenceOptions[category].map((item) => (
                    <div key={item.id} className="flex items-center space-x-2">
                        <Checkbox
                            id={`${category}-${item.id}`}
                            checked={selectedItems.includes(item.id)}
                            onCheckedChange={(checked) => handleCheckboxChange(category, item.id, checked)}
                            disabled={isLoading}
                        />
                        <Label htmlFor={`${category}-${item.id}`} className="text-sm font-normal">
                            {item.label}
                        </Label>
                    </div>
                ))}
            </div>
        );
    };


return (
        <Card>
            <CardHeader>
                <CardTitle>选择您的偏好</CardTitle>
                <CardDescription>选择越多，AI 生成的行程越贴合您的心意。</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
           
                    <div>
                        <Label className="text-base font-medium flex items-center mb-2"> {/* 使用 Flex 对齐图标和文字 */}
                            <Palette className="h-5 w-5 mr-2 text-primary" /> {/* 图标 */}
                            旅行风格
                        </Label>
                        {renderCheckboxGroup('styles', selectedStyles)}
                    </div>

      
                    <div>
                        <Label className="text-base font-medium flex items-center mb-2">
                            <Utensils className="h-5 w-5 mr-2 text-primary" /> {/* 图标 */}
                            餐饮偏好
                        </Label>
                        {renderCheckboxGroup('cuisines', selectedCuisines)}
                    </div>

          
                    <div>
                        <Label className="text-base font-medium flex items-center mb-2">
                            <Car className="h-5 w-5 mr-2 text-primary" /> {/* 图标 */}
                            交通偏好
                        </Label>
                        {renderCheckboxGroup('transport', selectedTransport)}
                    </div>
           

                    {/* 提交按钮 (保持不变) */}
                    <div className="flex justify-end">
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? '保存中...' : '保存偏好'}
                        </Button>
                    </div>
                </form>

                {/* 状态提示 */}
                 {error && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertTitle>错误</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                 )}
                 {success && (
                    <Alert variant="default" className="mt-4 text-green-700"> {/* 使用绿色提示成功 */}
                        <AlertTitle>成功</AlertTitle>
                        <AlertDescription>{success}</AlertDescription>
                    </Alert>
                 )}
            </CardContent>
        </Card>
    );
}