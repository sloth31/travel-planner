// 文件: components/PlanMap.tsx
'use client';

import AMapLoader from '@amap/amap-jsapi-loader';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button'; // 引入 Button

// 类型定义
interface IActivity {
    name: string;
    lat: number;
    lng: number;
}
interface IDailyPlan {
    day: number;
    activities: IActivity[];
}
interface IPlanData {
  daily_plan: IDailyPlan[];
}

export default function PlanMap({ planData }: { planData: IPlanData }) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null); // AMap.Map 实例
    const drivingRef = useRef<any>(null); // AMap.Driving 实例
    const currentMarkersRef = useRef<any[]>([]); // 保存当前所有 Marker 实例
    const [mapStatus, setMapStatus] = useState<'loading' | 'loaded' | 'error'>('loading'); // 地图加载状态
    const [routeStatus, setRouteStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [routeError, setRouteError] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    // 环境变量
    const amapKey = process.env.NEXT_PUBLIC_AMAP_KEY;
    const amapSecurityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;

    // --- 封装路线计算逻辑 ---
   const calculateRouteForDay = useCallback((dayNumber: number | null) => {
       console.log(`[DEBUG calculateRouteForDay] Received request for dayNumber: ${dayNumber}`);
        setRouteStatus('idle');
        setRouteError(null);
        if (drivingRef.current) {
            drivingRef.current.clear(); // 清除旧路线
        }
        // 清除路线时恢复视野
        if (dayNumber === null) {
            console.log("Clearing route display.");
             if (mapRef.current && currentMarkersRef.current.length > 0) {
                 // 清除路线时，让视野重新适应所有标记点
                 mapRef.current.setFitView(currentMarkersRef.current);
             }
            return;
        }

        const mapInstance = mapRef.current;
        const drivingInstance = drivingRef.current; // 使用 Ref 中的实例
        const AMap = (window as any).AMap; // 获取全局 AMap 对象
        if (!mapInstance || !drivingInstance || !AMap) {
            console.warn("Map, Driving service, or AMap object not ready.");
            setRouteStatus('error');
            setRouteError('地图服务尚未准备就绪,无法规划路线'); // 提供更明确错误
            return;
        }
      // --- DEBUG: 查找对应天的数据 ---
        console.log('[DEBUG calculateRouteForDay] Searching for plan data for day:', dayNumber);
        const selectedPlan = planData.daily_plan.find(day => day.day === dayNumber);
        console.log('[DEBUG calculateRouteForDay] Found plan data:', selectedPlan ? `Day ${selectedPlan.day}` : 'Not Found');
        // --- DEBUG END ---
        const activities = selectedPlan?.activities || [];
        const points = activities.map(act => new AMap.LngLat(act.lng, act.lat)); // 使用 AMap.LngLat
// --- DEBUG: 打印将用于规划的点 ---
        if (points.length > 0) {
            console.log(`[DEBUG calculateRouteForDay] Points for route calculation (Day ${dayNumber}):`, points.map(p => ({lng: p.getLng(), lat: p.getLat()})));
        } else {
             console.log(`[DEBUG calculateRouteForDay] No points found for Day ${dayNumber}.`);
        }
      // --- DEBUG END ---
      
        if (points.length >= 2) {
            console.log(`Calculating driving route for Day ${dayNumber}...`);
            setRouteStatus('loading');
            const startPoint = points[0];
            const endPoint = points[points.length - 1];
            const wayPoints = points.slice(1, -1);

            drivingInstance.search(startPoint, endPoint, { waypoints: wayPoints }, (status: string, result: any) => {
                if (status === 'complete') {
                    console.log(`Route for Day ${dayNumber} calculated:`, result);
                    setRouteStatus('success');
                    // autoFitView: true 会自动调整视野，无需手动调用
                    // mapInstance.setFitView();
                } else if (status === 'error') {
                     console.error(`Route calculation failed for Day ${dayNumber}:`, result);
                   setRouteStatus('error');
                   const infoString = typeof result?.info === 'string' ? result.info : (typeof result === 'string' ? result : '');
                   if (infoString.includes('INSUFFICIENT_ABROAD_PRIVILEGES')) { 
                       setRouteError(`路线规划暂不支持中国大陆以外地区`);
                   }
                   else {
                      setRouteError(`路线规划失败: ${result?.info || result || '未知错误'}`);
                   }
                     // 失败时也恢复视野到标记点
                     if (mapRef.current && currentMarkersRef.current.length > 0) {
                         mapRef.current.setFitView(currentMarkersRef.current);
                     }
                } else { // status === 'no_data'
                     console.warn(`No route data found for Day ${dayNumber}:`, result);
                     setRouteStatus('error');
                     setRouteError(`未能找到第 ${dayNumber} 天的路线。`);
                     if (mapRef.current && currentMarkersRef.current.length > 0) {
                         mapRef.current.setFitView(currentMarkersRef.current);
                     }
                }
            });
        } else {
             console.warn(`Not enough points for Day ${dayNumber} to calculate route.`);
             setRouteStatus('idle');
             setRouteError(`第 ${dayNumber} 天活动点不足 (少于2个)，无法规划路线。`);
             if (mapRef.current && currentMarkersRef.current.length > 0) {
                 mapRef.current.setFitView(currentMarkersRef.current); // 恢复视野
             }
        }
    }, [planData.daily_plan]);


    // --- 核心 useEffect ---
    useEffect(() => {
        // 提前检查 Key
        if (!amapKey) {
            console.error("Missing NEXT_PUBLIC_AMAP_KEY environment variable.");
            setMapStatus('error');
            setRouteError('地图 Key 未配置');
            return; // 阻止后续执行
        }
        // 设置安全密钥
        if (typeof window !== 'undefined') {
          (window as any)._AMapSecurityConfig = { securityJsCode: amapSecurityCode };
        }

        let mapInstance: any = null; // 局部变量
        let mapCompleteHandler: any = null; // 事件处理器引用
        let isMounted = true; // 跟踪组件是否挂载

        setMapStatus('loading'); // 开始加载
        setRouteError(null); // 清除旧错误

        // 使用 setTimeout 延迟加载
        const timerId = setTimeout(() => {
            if (!isMounted) return; // 如果组件已卸载，则不执行加载

            console.log("Starting AMapLoader.load() after delay..."); // 调试日志

            AMapLoader.load({
                key: amapKey, version: '2.0',
                plugins: ['AMap.ToolBar', 'AMap.Scale', 'AMap.Driving'],
            })
                .then((AMap) => {
                    if (!isMounted || !mapContainerRef.current) {
                         console.warn("Component unmounted or map container gone before AMap loaded.");
                         return; // 再次检查
                    }
                    (window as any).AMap = AMap; // 挂载 AMap

                    // 1. 初始化地图实例
                    mapInstance = new AMap.Map(mapContainerRef.current, {
                         zoom: 11,
                         center: [116.397428, 39.90923] // 默认中心点
                    });
                    mapRef.current = mapInstance; // 保存实例
                    console.log("Map instance created. Waiting for 'complete' event...");

                    // 2. 定义 'complete' 事件处理器
                    mapCompleteHandler = () => {
                        if (!isMounted || !mapRef.current) {
                             console.warn("'complete' fired but component unmounted or map instance is gone.");
                             return; // 再次检查
                        }
                        console.log("Map 'complete' event fired!");
                        setMapStatus('loaded'); // 标记地图已加载

                        // a. 添加控件
                        try {
                            mapRef.current.addControl(new AMap.ToolBar());
                            mapRef.current.addControl(new AMap.Scale());
                            console.log("Controls added.");
                        } catch (controlError: any) {
                             console.error("Error adding controls:", controlError.message);
                        }


                        // b. 添加标记点
                        const markers: any[] = [];
                        currentMarkersRef.current = []; // 清空旧引用
                        planData.daily_plan.forEach((day) => {
                            day.activities.forEach((activity) => {
                                const position: [number, number] = [activity.lng, activity.lat];
                                try {
                                    const marker = new AMap.Marker({ position, title: activity.name });
                                    markers.push(marker);
                                } catch (markerError: any) {
                                     console.error(`Error creating marker for ${activity.name}:`, markerError.message);
                                }
                            });
                        });
                        if (markers.length > 0) {
                            try {
                                mapRef.current.add(markers);
                                currentMarkersRef.current = markers; // 保存新引用
                                console.log("Markers added.");
                                console.log("Setting initial view to fit markers...");
                                mapRef.current.setFitView(markers); // 调整视野适应标记点
                            } catch (addMarkerError: any) {
                                 console.error("Error adding markers to map:", addMarkerError.message);
                            }
                        } else {
                            console.warn("No markers to add.");
                        }

                        // c. 初始化路线规划实例 - 添加 autoFitView
                        const DrivingPlugin = AMap.Driving;
                        if (DrivingPlugin) {
                             try {
                                const drivingInstance = new DrivingPlugin({
                                    map: mapRef.current,
                                    policy: AMap.DrivingPolicy.LEAST_TIME,
                                    hideMarkers: true,
                                    showTraffic: false,
                                    autoFitView: true, // <--- 关键修改! 让插件自动调整视野
                                });
                                drivingRef.current = drivingInstance; // 保存实例
                                console.log("Driving plugin instance created with autoFitView.");
                                setRouteStatus('idle'); // 插件准备就绪
                             } catch (drivingInitError: any) {
                                  console.error("Error initializing AMap.Driving:", drivingInitError.message);
                                  setMapStatus('error'); // 插件初始化失败也算地图错误
                                  setRouteStatus('error');
                                  setRouteError('路线规划插件初始化失败');
                             }
                        } else {
                             console.error("AMap.Driving plugin not loaded correctly after map complete!");
                             setMapStatus('error');
                             setRouteStatus('error');
                             setRouteError('路线规划插件加载失败');
                        }
                    }; // --- 'complete' 事件处理结束 ---

                    // 3. 绑定 'complete' 事件监听器
                    mapInstance.on('complete', mapCompleteHandler);

                })
                .catch((e) => {
                    if (!isMounted) return; // 异步错误也检查挂载状态
                    console.error('高德地图 JSAPI 加载或初始化失败:', e);
                    setMapStatus('error');
                    setRouteStatus('error'); // 加载失败也影响路线
                    setRouteError(`地图加载失败: ${e.message}`);
                });

        }, 0); // 使用 0ms 延迟


        // --- 组件卸载时的清理函数 ---
        return () => {
             console.log('PlanMap unmounting: Cleaning up map resources...');
             isMounted = false; // 标记组件已卸载
             clearTimeout(timerId); // 清除可能未执行的 setTimeout

             // 移除 'complete' 事件监听器
             if (mapRef.current && mapCompleteHandler) {
                 try {
                      mapRef.current.off('complete', mapCompleteHandler);
                      console.log("Removed 'complete' event listener.");
                 } catch (offError: any) {
                      console.warn("Error removing 'complete' listener:", offError.message);
                 }
             }
             mapCompleteHandler = null; // 清理引用

            // 清理 Driving 实例引用
            if (drivingRef.current) {
                drivingRef.current = null;
                console.log("Cleared driving instance reference.");
            }

            // 销毁 Map 实例
            if (mapRef.current) {
                try {
                    console.log("Attempting to destroy map instance...");
                    mapRef.current.destroy();
                    console.log("Map instance destroyed successfully.");
                } catch (e: any) {
                    console.error("Error occurred during map destruction:", e.message);
                } finally {
                    mapRef.current = null; // 确保 ref 被清空
                }
            } else {
                console.log("Map instance reference already null.");
            }

            currentMarkersRef.current = []; // 清空 markers 引用
            console.log('Map resources cleanup function finished.');
        };

    // 依赖项
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData, amapKey, amapSecurityCode]);

    // --- 处理日期按钮点击 ---
    const handleDayButtonClick = (dayNumber: number | null) => {
        // 如果点击的是当前选中的日期，则取消选择 (清除路线)
        if (selectedDay === dayNumber) {
            setSelectedDay(null);
            calculateRouteForDay(null);
        } else {
            setSelectedDay(dayNumber); // 更新选中的日期
            calculateRouteForDay(dayNumber); // 计算新路线
        }
    };

    // --- JSX ---
    // Key 检查提前
    if (!amapKey) {
        return (
          <div className="h-96 w-full rounded-lg bg-red-100 flex items-center justify-center p-4 text-center">
            <p className="text-red-600 font-medium">
              错误: 高德地图 Key (NEXT_PUBLIC_AMAP_KEY) 未设置。请检查环境变量配置。
            </p>
          </div>
        );
    }

    return (
        <div className="space-y-4"> {/* 纵向布局容器 */}
            {/* 地图区域 */}
            <div className="relative">
                <div
                  ref={mapContainerRef}
                  className="h-96 w-full rounded-lg bg-gray-100" // 添加背景色
                  style={{ height: '400px' }}
                >
                  {/* 地图加载状态 */}
                  {mapStatus === 'loading' && (
                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                       <p className="text-muted-foreground bg-white/70 p-2 rounded">地图加载中...</p>
                     </div>
                  )}
                  {/* 地图加载错误状态 */}
                  {mapStatus === 'error' && (
                       <div className="absolute inset-0 flex items-center justify-center p-4 text-center pointer-events-none">
                         <p className="text-red-600 font-medium bg-red-100/80 p-3 rounded">{routeError || '地图加载失败'}</p>
                       </div>
                  )}
                </div>
                {/* 路线状态提示 (只有地图加载成功后才可能显示) */}
                {mapStatus === 'loaded' && (routeStatus === 'loading' || routeError) && (
                    <div className="absolute top-2 left-2 bg-white p-2 rounded shadow text-sm z-10 pointer-events-none">
                        {routeStatus === 'loading' && '正在计算路线...'}
                        {/* 只有在 routeError 有值时才显示 */}
                        {routeError && (
                            <span className="text-red-600">路线提示: {routeError}</span>
                        )}
                    </div>
                )}
            </div>

            {/* 日期选择按钮区域 (只有地图加载成功后才显示) */}
            {mapStatus === 'loaded' && (
                <div className="flex flex-wrap gap-2 justify-center">
                     {/* 清除路线按钮 */}
                     {planData.daily_plan.length > 0 && ( // 确保有数据才显示
                        <Button
                            variant={selectedDay === null ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => handleDayButtonClick(null)}
                            // 加载路线时禁用所有按钮
                            disabled={routeStatus === 'loading'}
                        >
                            清除路线
                        </Button>
                     )}
                     {/* 每日路线按钮 */}
                     {planData.daily_plan.map((day) => (
                        <Button
                            key={day.day}
                            variant={selectedDay === day.day ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleDayButtonClick(day.day)}
                            disabled={routeStatus === 'loading'}
                        >
                            第 {day.day} 天路线
                        </Button>
                     ))}
                </div>
            )}
        </div>
    );
}
