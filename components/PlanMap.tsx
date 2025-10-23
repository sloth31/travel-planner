// 文件: components/PlanMap.tsx
'use client';

// 1. (Fix) 我们只导入官方加载器 (注意：是默认导入)
import AMapLoader from '@amap/amap-jsapi-loader';
import { useEffect, useRef } from 'react';

// (类型定义保持不变)
interface IPlanData {
  daily_plan: {
    activities: {
      name: string;
      lat: number;
      lng: number;
    }[];
  }[];
}

export default function PlanMap({ planData }: { planData: IPlanData }) {
  // 2. (Raw) 创建一个 ref 来挂载地图
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // 创建一个 ref 来保存 map 实例，以便 unmount 时销毁
  const mapRef = useRef<any>(null);

  // 3. (Raw) 检查环境变量
  const amapKey = process.env.NEXT_PUBLIC_AMAP_KEY;
  const amapSecurityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;

  // 4. (修复) 
  //    补全之前省略的错误提示 UI
  if (!amapKey) {
    return (
      <div className="h-64 bg-red-100 rounded-lg flex items-center justify-center">
        <p className="text-red-600">
          错误: NEXT_PUBLIC_AMAP_KEY 未设置。
        </p>
      </div>
    );
  }

  // 5. (Raw) 这是使用原生 API 的核心
  useEffect(() => {
    // (修复) 
    // 安全密钥必须在 load() 之前设置在 window 对象上
    // 我们需要检查 window 是否存在 (因为 'use client' 仍可能在 SSR 预渲染)
    if (typeof window !== 'undefined') {
      (window as any)._AMapSecurityConfig = {
        securityJsCode: amapSecurityCode,
      };
    }

    let mapInstance: any = null; // 临时变量

    AMapLoader.load({
      key: amapKey,
      version: '2.0', // 默认版本
      plugins: ['AMap.ToolBar', 'AMap.Scale'], // 加载工具条和比例尺插件
      // (修复) 移除 securityJsCode 属性
    })
      .then((AMap) => {
        // (Check) 确保 DOM 元素存在
        if (!mapContainerRef.current) {
          return;
        }

        // 6. 初始化地图实例
        mapInstance = new AMap.Map(mapContainerRef.current, {
          zoom: 11,
          //  将中心点设为第一个活动的坐标
          center: [
            planData.daily_plan[0].activities[0].lng,
            planData.daily_plan[0].activities[0].lat,
          ],
        });
        
        // 7. 添加工具条和比例尺
        mapInstance.addControl(new AMap.ToolBar());
        mapInstance.addControl(new AMap.Scale());

        // 8. 遍历所有活动并创建 Marker
        const markers: any[] = [];
        planData.daily_plan.forEach((day) => {
          day.activities.forEach((activity) => {
            const marker = new AMap.Marker({
              position: [activity.lng, activity.lat] as [number, number],
              title: activity.name,
            });
            markers.push(marker);
          });
        });

        // 9. 将所有 marker 一次性添加到地图上
        mapInstance.add(markers);

        // 10. (优化) 自动缩放地图以适应所有点
        mapInstance.setFitView();
        
        // 11. 保存 map 实例到 ref
        mapRef.current = mapInstance;

      })
      .catch((e) => {
        console.error('高德地图加载失败:', e);
      });

    // 12. (Raw) 组件卸载时销毁地图
    return () => {
      if (mapRef.current) {
        console.log('销毁地图实例');
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
    
    // (VIBE) 依赖项保持不变
  }, [planData, amapKey, amapSecurityCode]);

  // 13. (Raw) JSX 只是一个简单的 div 容器
  return (
    <div
      ref={mapContainerRef}
      className="h-96 w-full rounded-lg"
      style={{ height: '400px' }} // 确保有高度
    >
      {/* 地图将由 AMapLoader.load() 异步挂载到这里 */}
    </div>
  );
}