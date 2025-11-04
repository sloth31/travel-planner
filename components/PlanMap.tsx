// 文件: components/PlanMap.tsx
'use client';

import AMapLoader from '@amap/amap-jsapi-loader';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';

// --- 类型定义 ---
interface IActivity {
    name: string;
    description: string;
    location: string;
    lat: number;
    lng: number;
}
interface IDailyPlan {
    day: number;
    theme: string;
    activities: IActivity[];
}
interface IPlanData {
  daily_plan: IDailyPlan[];
}
// (新!) 定义 Props 类型
interface PlanMapProps {
    planData: IPlanData;
    selectedDay: number | null; // (新!) 接收选中的日期
    onDaySelect: (day: number | null) => void; // (新!) 回调函数
}
// --- 类型定义结束 ---

export default function PlanMap({ planData, selectedDay, onDaySelect }: PlanMapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const drivingRef = useRef<any>(null);
    const currentMarkersRef = useRef<any[]>([]);
    const infoWindowRef = useRef<any>(null);
    const [mapStatus, setMapStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
    const [routeStatus, setRouteStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [routeError, setRouteError] = useState<string | null>(null);
    // (移除!) selectedDay 状态已移到父组件

    // 环境变量
    const amapKey = process.env.NEXT_PUBLIC_AMAP_KEY;
    const amapSecurityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;

    // --- 路线计算逻辑 ---
    const calculateRouteForDay = useCallback((dayNumber: number | null) => {
        console.log(`[DEBUG calculateRouteForDay] Received request for dayNumber: ${dayNumber}`);
        
        setRouteStatus('idle');
        setRouteError(null);
        if (drivingRef.current) {
            drivingRef.current.clear();
        }

        const mapInstance = mapRef.current;
        const AMap = (window as any).AMap;

        if (dayNumber === null) {
            console.log("Clearing route display.");
             if (mapInstance && currentMarkersRef.current.length > 0) {
                 mapInstance.setFitView(currentMarkersRef.current);
             }
            return;
        }

        const drivingInstance = drivingRef.current;
        if (!mapInstance || !drivingInstance || !AMap) {
             console.warn("Map, Driving service, or AMap object not ready.");
             setRouteStatus('error');
             setRouteError('地图服务尚未准备就绪,无法规划路线');
            return;
        }

        console.log('[DEBUG calculateRouteForDay] Searching for plan data for day:', dayNumber);
        const selectedPlan = planData.daily_plan.find(day => day.day === dayNumber);
        
        const activities = selectedPlan?.activities || [];
        const points = activities.map(act => new AMap.LngLat(act.lng, act.lat));
        
        if (points.length > 0) {
            console.log(`[DEBUG calculateRouteForDay] Points for route calculation (Day ${dayNumber}):`, points.map(p => ({lng: p.getLng(), lat: p.getLat()})));
        } else {
             console.log(`[DEBUG calculateRouteForDay] No points found for Day ${dayNumber}.`);
        }
      
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
                } else { // status is 'error' or 'no_data'
                     console.warn(`Route calculation status not 'complete' for Day ${dayNumber}:`, status, result);
                     setRouteStatus('error');
                     const infoString = typeof result?.info === 'string' ? result.info : (typeof result === 'string' ? result : '');
                     console.log("Route calculation error info:", infoString);
                     if (infoString.includes('国外') || infoString.includes('境外') || infoString.toLowerCase().includes('out of china')) { 
                         setRouteError(`路线规划暂不支持中国大陆以外地区`);
                     }
                     else if (status === 'error' && infoString) {
                        setRouteError(`路线规划失败: ${infoString}`);
                     }
                     else {
                        setRouteError(`未能找到第 ${dayNumber} 天的路线。`);
                     }
                     if (mapInstance && currentMarkersRef.current.length > 0) {
                         mapInstance.setFitView(currentMarkersRef.current);
                     }
                }
            });
        } else if (points.length === 1) {
             console.warn(`Only one point for Day ${dayNumber}. Centering map.`);
             setRouteStatus('idle');
             setRouteError(`当天只有一个活动点。`);
             mapInstance.setZoomAndCenter(15, points[0]);
        } else {
             console.warn(`No points found for Day ${dayNumber}.`);
             setRouteStatus('idle');
             setRouteError(`第 ${dayNumber} 天没有活动点。`);
             if (mapInstance && currentMarkersRef.current.length > 0) {
                 mapInstance.setFitView(currentMarkersRef.current);
             }
        }
    }, [planData.daily_plan]);


    // --- (新!) 监听 selectedDay prop 的变化 ---
    useEffect(() => {
        // 确保地图加载完成后才执行
        if (mapStatus === 'loaded') { 
            console.log(`[Effect selectedDay] Prop changed to: ${selectedDay}. Calculating route.`);
            calculateRouteForDay(selectedDay);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDay, mapStatus]); // 依赖 selectedDay (来自 props) 和 mapStatus


    // --- 核心 useEffect (初始化) ---
    useEffect(() => {
        if (!amapKey) {
            console.error("Missing NEXT_PUBLIC_AMAP_KEY environment variable.");
            setMapStatus('error');
            setRouteError('地图 Key 未配置');
            return;
        }
        if (typeof window !== 'undefined') {
          (window as any)._AMapSecurityConfig = { securityJsCode: amapSecurityCode };
        }
        let mapInstance: any = null;
        let mapCompleteHandler: any = null;
        let isMounted = true;
        setMapStatus('loading');
        setRouteError(null);

        const timerId = setTimeout(() => {
            if (!isMounted) return;
            console.log("Starting AMapLoader.load() after delay...");
            AMapLoader.load({
                key: amapKey, version: '2.0',
                plugins: ['AMap.ToolBar', 'AMap.Scale', 'AMap.Driving', 'AMap.InfoWindow'],
            })
                .then((AMap) => {
                    if (!isMounted || !mapContainerRef.current) return;
                    (window as any).AMap = AMap;
                    mapInstance = new AMap.Map(mapContainerRef.current, { zoom: 11, center: [116.397428, 39.90923] });
                    mapRef.current = mapInstance;
                    console.log("Map instance created. Waiting for 'complete' event...");
                    mapCompleteHandler = () => {
                        if (!isMounted || !mapRef.current) return;
                        console.log("Map 'complete' event fired!");
                        setMapStatus('loaded'); // 标记地图已加载

                        // a. 添加控件
                        try {
                            mapRef.current.addControl(new AMap.ToolBar());
                            mapRef.current.addControl(new AMap.Scale());
                            console.log("Controls added.");
                        } catch (controlError: any) { console.error("Error adding controls:", controlError.message); }

                        // b. 初始化 InfoWindow
                        const infoWindow = new AMap.InfoWindow({
                            isCustom: true,
                            autoMove: true,
                            offset: new AMap.Pixel(0, -30),
                            closeWhenClickMap: true,
                        });
                        infoWindowRef.current = infoWindow;

                        // c. 添加标记点 (带编号和点击事件)
                        const markers: any[] = [];
                        currentMarkersRef.current = [];
                        planData.daily_plan.forEach((day) => {
                            if (day && Array.isArray(day.activities)) {
                                day.activities.forEach((activity, index) => {
                                    if (activity && typeof activity.lng === 'number' && typeof activity.lat === 'number') {
                                        const position: [number, number] = [activity.lng, activity.lat];
                                        const dayNum = day.day;
                                        const activityNum = index + 1;
                                        const markerContent = document.createElement('div');
                                        markerContent.style.cssText = `
                                            width: 28px; height: 28px; line-height: 28px; text-align: center;
                                            color: var(--primary-foreground, #FFF);
                                            background-color: var(--primary, #1d4ed8); /* 默认为靛蓝色 */
                                            border-radius: 50%; font-size: 11px; font-weight: 600;
                                            border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                                            cursor: pointer; transition: transform 0.1s ease;
                                        `;
                                        markerContent.innerHTML = `${dayNum}-${activityNum}`;
                                        markerContent.onmouseover = () => { markerContent.style.transform = 'scale(1.15)'; };
                                        markerContent.onmouseout = () => { markerContent.style.transform = 'scale(1.0)'; };
                                        
                                        try {
                                            const marker = new AMap.Marker({
                                                position: position,
                                                title: activity.name,
                                                content: markerContent,
                                                offset: new AMap.Pixel(-14, -14),
                                            });
                                            marker.on('click', () => {
                                                const infoWindowContent = `
                                                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 10px 14px; border-radius: 8px; background-color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid #e5e7eb; width: 240px;">
                                                        <h4 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #111827;">${activity.name || '未命名活动'}</h4>
                                                        <p style="margin: 0; font-size: 13px; color: #4b5563;">${activity.location || '未知地点'}</p>
                                                        <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280; border-top: 1px dashed #e5e7eb; padding-top: 8px;">
                                                            第 ${dayNum} 天 - 活动 ${activityNum}
                                                        </p>
                                                    </div>
                                                `;
                                                infoWindow.setContent(infoWindowContent);
                                                infoWindow.open(mapRef.current, marker.getPosition());
                                                console.log(`InfoWindow opened for: ${activity.name}`);
                                                // (新!) 点击标记点时，也更新父组件的 selectedDay
                                                onDaySelect(dayNum);
                                            });
                                            markers.push(marker);
                                        } catch (markerError: any) { console.error(`Error creating marker for ${activity.name}:`, markerError.message); }
                                    }
                                });
                            }
                        });
                        if (markers.length > 0) {
                            try { mapRef.current.add(markers); currentMarkersRef.current = markers; console.log("Markers added."); mapRef.current.setFitView(markers); }
                            catch (addMarkerError: any) { console.error("Error adding markers to map:", addMarkerError.message); }
                        } else { console.warn("No markers to add."); }
                        
                        // d. 初始化路线规划实例
                        const DrivingPlugin = AMap.Driving;
                        if (DrivingPlugin) {
                             try { const drivingInstance = new DrivingPlugin({ map: mapRef.current, policy: AMap.DrivingPolicy.LEAST_TIME, hideMarkers: true, showTraffic: false, autoFitView: true }); drivingRef.current = drivingInstance; console.log("Driving plugin instance created..."); setRouteStatus('idle'); }
                             catch (drivingInitError: any) {
                                  console.error("Error initializing AMap.Driving:", drivingInitError.message);
                                  setMapStatus('error'); setRouteStatus('error'); setRouteError('路线规划插件初始化失败');
                             }
                        } else {
                             console.error("AMap.Driving plugin not loaded correctly after map complete!");
                             setMapStatus('error'); setRouteStatus('error'); setRouteError('路线规划插件加载失败');
                        }
                    };
                    
                    mapInstance.on('complete', mapCompleteHandler);
                    mapInstance.on('click', () => { if (infoWindowRef.current) { infoWindowRef.current.close(); } });
                })
                .catch((e) => {
                     if (!isMounted) return;
                     console.error('高德地图 JSAPI 加载或初始化失败:', e);
                     setMapStatus('error'); setRouteStatus('error');
                     setRouteError(`地图加载失败: ${e.message}`);
                });
        }, 0);

        // --- 组件卸载时的清理函数 ---
        return () => {
             console.log('PlanMap unmounting: Cleaning up map resources...');
             isMounted = false; clearTimeout(timerId);
             if (mapRef.current && mapCompleteHandler) { try { mapRef.current.off('complete', mapCompleteHandler); } catch (offError: any) { console.warn("Error removing 'complete' listener:", offError.message); } }
             mapCompleteHandler = null;
             if (infoWindowRef.current) { infoWindowRef.current = null; }
             if (drivingRef.current) { drivingRef.current = null; }
             if (mapRef.current) { try { mapRef.current.destroy(); } catch (e: any) { console.error("Error occurred during map destruction:", e.message); } finally { mapRef.current = null; } }
             currentMarkersRef.current = [];
             console.log('Map resources cleanup function finished.');
        };
    // 依赖项
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData, amapKey, amapSecurityCode]);

    // --- (新!) 处理日期按钮点击 ---
    const handleDayButtonClick = (dayNumber: number | null) => {
        // 点击按钮时，关闭已打开的 InfoWindow
        if (infoWindowRef.current) {
             infoWindowRef.current.close();
        }
        // 调用父组件的回调函数
        onDaySelect(dayNumber === selectedDay ? null : dayNumber);
    };

    // --- JSX ---
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
        <div className="space-y-4">
            {/* 地图区域 */}
            <div className="relative">
                <div
                  ref={mapContainerRef}
                  className="h-96 w-full rounded-lg bg-gray-100"
                  style={{ height: '400px' }}
                >
                  {mapStatus === 'loading' && (
                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                       <p className="text-muted-foreground bg-white/70 p-2 rounded">地图加载中...</p>
                     </div>
                  )}
                  {mapStatus === 'error' && (
                       <div className="absolute inset-0 flex items-center justify-center p-4 text-center pointer-events-none">
                         <p className="text-red-600 font-medium bg-red-100/80 p-3 rounded">{routeError || '地图加载失败'}</p>
                       </div>
                  )}
                </div>
                {/* 路线状态提示 */}
                {mapStatus === 'loaded' && (routeStatus === 'loading' || routeError) && (
                    <div className="absolute top-2 left-2 bg-white p-2 rounded shadow text-sm z-10 pointer-events-none">
                        {routeStatus === 'loading' && '正在计算路线...'}
                        {routeError && (
                            <span className="text-red-600">路线提示: {routeError}</span>
                        )}
                    </div>
                )}
            </div>

            {/* 日期选择按钮区域 */}
            {mapStatus === 'loaded' && (
                <div className="flex flex-wrap gap-2 justify-center">
                     {planData.daily_plan.length > 0 && (
                        <Button
                            variant={selectedDay === null ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => handleDayButtonClick(null)}
                            disabled={routeStatus === 'loading'}
                        >
                            清除路线
                        </Button>
                     )}
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