import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, IChartApi, SeriesMarker, Time, LineStyle, ISeriesApi, SeriesType } from 'lightweight-charts';

export interface ChartSeriesData {
    name: string;
    data: { time: string; value: number }[];
    color: string;
    visible?: boolean;
}

interface ProfessionalChartProps {
    data?: { time: string; value: number; open?: number; high?: number; low?: number; close?: number }[];
    series?: ChartSeriesData[];
    height?: number;
    theme?: 'light' | 'dark';
    lineColor?: string;
    areaTopColor?: string;
    areaBottomColor?: string;
    isSparkline?: boolean;
    showHighLow?: boolean;
    chartStyle?: 'line' | 'area' | 'candlestick';
}

export const ProfessionalChart: React.FC<ProfessionalChartProps> = ({ 
    data, 
    series,
    height = 400, 
    theme = 'light',
    lineColor,
    areaTopColor,
    areaBottomColor,
    isSparkline = false,
    showHighLow = false,
    chartStyle = 'area'
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; date: string; price: string; seriesName?: string; color?: string } | null>(null);
    const [highLowLabels, setHighLowLabels] = useState<{ max?: { time: string; value: number }; min?: { time: string; value: number } } | null>(null);

    const isDark = theme === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';
    const backgroundColor = 'transparent';

    const formatPrice = (price: number) => {
        const val = Math.round(price);
        if (val <= 0) return ''; // 0 이하 값은 표시하지 않음
        if (val < 10000) return `${val.toLocaleString()}만원`;
        const eok = Math.floor(val / 10000);
        const man = val % 10000;
        if (eok > 0) return `${eok}억 ${man > 0 ? man.toLocaleString() : ''}`;
        return `${man.toLocaleString()}`;
    };
    
    // Y축 전용 포맷 (만원 제거)
    const formatPriceForYAxis = (price: number) => {
        const val = Math.round(price);
        if (val <= 0) return '';
        if (val < 10000) return `${val.toLocaleString()}`; // 만원 제거
        const eok = Math.floor(val / 10000);
        const man = val % 10000;
        if (eok > 0) return `${eok}억 ${man > 0 ? man.toLocaleString() : ''}`;
        return `${man.toLocaleString()}`;
    };
    
    // 마커용 짧은 가격 포맷 (3000 → 3,000 형식)
    const formatPriceShort = (price: number) => {
        const val = Math.round(price);
        if (val <= 0) return '';
        if (val < 10000) return `${val.toLocaleString()}`;
        const eok = Math.floor(val / 10000);
        const man = val % 10000;
        if (man > 0) return `${eok}억${man.toLocaleString()}`;
        return `${eok}억`;
    };
    
    const formatDateKorean = (dateStr: string) => {
        const date = new Date(dateStr);
        return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
    };

    // 정확한 너비 계산 함수
    const getContainerWidth = () => {
        if (!chartContainerRef.current) return 0;
        const rect = chartContainerRef.current.getBoundingClientRect();
        return Math.floor(rect.width);
    };

    // 차트 리사이즈 함수
    const handleResize = () => {
        if (chartRef.current && chartContainerRef.current) {
            const width = getContainerWidth();
            if (width > 0) {
                chartRef.current.applyOptions({ width });
            }
        }
    };

    useEffect(() => {
        if (!chartContainerRef.current) return;
        
        // 기존 차트 정리
        if (chartRef.current) {
            try { 
                chartRef.current.remove(); 
            } catch (e) {}
            chartRef.current = null;
        }

        // 컨테이너의 모든 자식 요소 제거 (중복 차트 방지)
        if (chartContainerRef.current) {
            while (chartContainerRef.current.firstChild) {
                chartContainerRef.current.removeChild(chartContainerRef.current.firstChild);
            }
        }

        // ResizeObserver 정리
        if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
            resizeObserverRef.current = null;
        }

        let isInitializing = false;
        let rafId: number | null = null;

        // 초기 렌더링을 requestAnimationFrame으로 지연시켜 레이아웃 완료 후 실행
        const initChart = () => {
            if (!chartContainerRef.current || isInitializing) return;
            
            // 이미 차트가 생성되어 있으면 중단
            if (chartRef.current) return;
            
            const containerWidth = getContainerWidth();
            if (containerWidth === 0) {
                // 아직 레이아웃이 계산되지 않았으면 다시 시도
                rafId = requestAnimationFrame(initChart);
                return;
            }

            isInitializing = true;

            const chart = createChart(chartContainerRef.current, {
                layout: {
                    background: { type: ColorType.Solid, color: backgroundColor },
                    textColor: textColor,
                    fontFamily: "'Pretendard Variable', sans-serif",
                    fontSize: 12,
                },
                width: containerWidth,
                height: height,
                grid: {
                    vertLines: { visible: !isSparkline, color: gridColor, style: LineStyle.Solid },
                    horzLines: { visible: !isSparkline, color: gridColor, style: LineStyle.Solid },
                },
                rightPriceScale: {
                    visible: !isSparkline,
                    borderColor: 'transparent',
                    scaleMargins: { top: 0.2, bottom: 0.2 }, // 마커가 잘리지 않도록 충분한 여유 공간 확보 (벽 역할)
                    borderVisible: false,
                    alignLabels: true,
                    autoScale: true,
                    entireTextOnly: false,
                },
                timeScale: {
                    visible: !isSparkline,
                    borderColor: 'transparent',
                    timeVisible: true,
                    borderVisible: false,
                    fixLeftEdge: false, // 마커가 잘리지 않도록 false로 설정
                    fixRightEdge: false, // 마커가 잘리지 않도록 false로 설정
                    rightOffset: 10, // 오른쪽 여유 공간
                    tickMarkFormatter: (time: number | string) => {
                        if (typeof time === 'string') {
                            const date = new Date(time);
                            return `${date.getFullYear().toString().slice(2)}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                        }
                        return '';
                    }
                },
                localization: { priceFormatter: formatPriceForYAxis }, // Y축에서는 만원 제거
                crosshair: {
                    mode: CrosshairMode.Normal,
                    vertLine: { visible: !isSparkline, color: isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1', style: LineStyle.Dashed, labelVisible: false },
                    horzLine: { visible: !isSparkline, color: isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1', style: LineStyle.Dashed, labelVisible: true }
                },
                handleScale: !isSparkline,
                handleScroll: !isSparkline,
            });

            chartRef.current = chart;
            
            // 모든 시리즈의 데이터를 저장하여 크로스헤어 이벤트에서 사용
            const allSeriesData: Map<ISeriesApi<SeriesType>, { time: string; value: number }[]> = new Map();

            if (series && series.length > 0) {
                series.forEach((s, seriesIndex) => {
                    if (!s.visible) return;
                    const seriesColor = s.color;
                    const lineSeries = chart.addLineSeries({
                        color: seriesColor,
                        lineWidth: 2,
                        crosshairMarkerVisible: true,
                        priceLineVisible: false,
                        title: '', // 아파트 이름 네모박스 제거
                        lastValueVisible: false,
                    });
                    const sortedData = [...s.data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
                    const uniqueData = sortedData.filter((item, index, self) => index === 0 || item.time !== self[index - 1].time);
                    
                    // 데이터가 너무 많으면 샘플링하여 성능 개선 및 꺾은선 유지
                    let sampledData = uniqueData;
                    if (uniqueData.length > 200) {
                        const step = Math.ceil(uniqueData.length / 200);
                        sampledData = uniqueData.filter((_, idx) => idx % step === 0 || idx === uniqueData.length - 1);
                    }
                    
                    if (sampledData.length > 0) {
                        lineSeries.setData(sampledData);
                        allSeriesData.set(lineSeries, sampledData);
                        
                        // 최고점, 최저점 마커 표시 (showHighLow가 true일 때만) - 그래프 색상과 동일
                        if (showHighLow && sampledData.length > 1) {
                            let maxPoint = sampledData[0];
                            let minPoint = sampledData[0];
                            
                            sampledData.forEach(point => {
                                if (point.value > maxPoint.value) maxPoint = point;
                                if (point.value < minPoint.value) minPoint = point;
                            });
                            
                            // 최고/최저점 정보 저장 (라벨 표시용)
                            setHighLowLabels({ max: maxPoint, min: minPoint });
                            
                            const markers: SeriesMarker<Time>[] = [];
                            
                            // 최고점 마커 (그래프 색상과 동일, 작은 화살표 + 금액)
                            markers.push({
                                time: maxPoint.time as Time,
                                position: 'aboveBar',
                                color: seriesColor,
                                shape: 'arrowDown',
                                size: 0.5,
                                text: `최고 ${formatPriceShort(maxPoint.value)}`,
                            });
                            
                            // 최저점 마커 (그래프 색상과 동일, 작은 화살표 + 금액)
                            markers.push({
                                time: minPoint.time as Time,
                                position: 'belowBar',
                                color: seriesColor,
                                shape: 'arrowUp',
                                size: 0.5,
                                text: `최저 ${formatPriceShort(minPoint.value)}`,
                            });
                            
                            // 마커를 시간순으로 정렬 (lightweight-charts 요구사항)
                            markers.sort((a, b) => {
                                const timeA = new Date(a.time as string).getTime();
                                const timeB = new Date(b.time as string).getTime();
                                return timeA - timeB;
                            });
                            
                            lineSeries.setMarkers(markers);
                        }
                    }
                });
            } else if (data && data.length > 0) {
                const mainColor = lineColor || '#3182F6'; 
                const topColor = areaTopColor || 'rgba(49, 130, 246, 0.2)';
                const bottomColor = areaBottomColor || 'rgba(49, 130, 246, 0.0)'; 

                const sortedData = [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
                const uniqueData = sortedData.filter((item, index, self) => index === 0 || item.time !== self[index - 1].time);

                if (uniqueData.length > 0) {
                    if (chartStyle === 'candlestick' && uniqueData.some(d => d.open !== undefined && d.high !== undefined && d.low !== undefined && d.close !== undefined)) {
                        // 캔들스틱 차트
                        const candleSeries = chart.addCandlestickSeries({
                            upColor: '#ef5350',
                            downColor: '#26a69a',
                            borderVisible: false,
                            wickUpColor: '#ef5350',
                            wickDownColor: '#26a69a',
                            priceFormat: { type: 'custom', formatter: formatPrice },
                        });

                        const candleData = uniqueData.map(d => ({
                            time: d.time as Time,
                            open: d.open || d.value,
                            high: d.high || d.value,
                            low: d.low || d.value,
                            close: d.close || d.value,
                        }));

                        candleSeries.setData(candleData);
                    } else if (chartStyle === 'line') {
                        // 라인 차트
                        const lineSeries = chart.addLineSeries({
                            color: mainColor,
                            lineWidth: 2,
                            priceFormat: { type: 'custom', formatter: formatPrice },
                            crosshairMarkerVisible: true,
                            priceLineVisible: false,
                        });

                        lineSeries.setData(uniqueData);
                        allSeriesData.set(lineSeries, uniqueData);

                        // 최고점, 최저점 마커 표시 - 작은 화살표 + 금액
                        if (showHighLow && uniqueData.length > 1) {
                            let maxPoint = uniqueData[0];
                            let minPoint = uniqueData[0];
                            
                            uniqueData.forEach(point => {
                                if (point.value > maxPoint.value) maxPoint = point;
                                if (point.value < minPoint.value) minPoint = point;
                            });
                            
                            setHighLowLabels({ max: maxPoint, min: minPoint });
                            
                            const markers: SeriesMarker<Time>[] = [
                                {
                                    time: maxPoint.time as Time,
                                    position: 'aboveBar',
                                    color: '#FF4B4B',
                                    shape: 'arrowDown',
                                    size: 0.5,
                                    text: formatPriceShort(maxPoint.value),
                                },
                                {
                                    time: minPoint.time as Time,
                                    position: 'belowBar',
                                    color: '#3182F6',
                                    shape: 'arrowUp',
                                    size: 0.5,
                                    text: formatPriceShort(minPoint.value),
                                }
                            ];
                            
                            markers.sort((a, b) => {
                                const timeA = new Date(a.time as string).getTime();
                                const timeB = new Date(b.time as string).getTime();
                                return timeA - timeB;
                            });
                            
                            lineSeries.setMarkers(markers);
                        }
                    } else {
                        // 영역 차트 (기본값)
                        const areaSeries = chart.addAreaSeries({
                            topColor: topColor,
                            bottomColor: bottomColor,
                            lineColor: mainColor,
                            lineWidth: 2,
                            priceFormat: { type: 'custom', formatter: formatPrice },
                            crosshairMarkerVisible: true,
                            priceLineVisible: false,
                        });

                        areaSeries.setData(uniqueData);
                        allSeriesData.set(areaSeries, uniqueData);
                        
                        // 최고점, 최저점 마커 표시 - 작은 화살표 + 금액
                        if (showHighLow && uniqueData.length > 1) {
                            let maxPoint = uniqueData[0];
                            let minPoint = uniqueData[0];
                            
                            uniqueData.forEach(point => {
                                if (point.value > maxPoint.value) maxPoint = point;
                                if (point.value < minPoint.value) minPoint = point;
                            });
                            
                            setHighLowLabels({ max: maxPoint, min: minPoint });
                            
                            const markers: SeriesMarker<Time>[] = [
                                {
                                    time: maxPoint.time as Time,
                                    position: 'aboveBar',
                                    color: '#FF4B4B',
                                    shape: 'arrowDown',
                                    size: 0.5,
                                    text: formatPriceShort(maxPoint.value),
                                },
                                {
                                    time: minPoint.time as Time,
                                    position: 'belowBar',
                                    color: '#3182F6',
                                    shape: 'arrowUp',
                                    size: 0.5,
                                    text: formatPriceShort(minPoint.value),
                                }
                            ];
                            
                            markers.sort((a, b) => {
                                const timeA = new Date(a.time as string).getTime();
                                const timeB = new Date(b.time as string).getTime();
                                return timeA - timeB;
                            });
                            
                            areaSeries.setMarkers(markers);
                        }
                    }
                }
            }

            chart.timeScale().fitContent();
            
            // 시리즈 이름과 색상 매핑 저장
            const seriesMetaMap = new Map<ISeriesApi<SeriesType>, { name: string; color: string }>();
            if (series && series.length > 0) {
                let seriesIdx = 0;
                series.forEach(s => {
                    if (!s.visible) return;
                    const seriesApi = Array.from(allSeriesData.keys())[seriesIdx];
                    if (seriesApi) {
                        seriesMetaMap.set(seriesApi, { name: s.name, color: s.color });
                        seriesIdx++;
                    }
                });
            }
            
            // 크로스헤어 이동 이벤트 - 마우스가 올려진 해당 그래프의 데이터만 표시
            chart.subscribeCrosshairMove((param) => {
                if (!param.time || !param.point || !chartContainerRef.current) {
                    setTooltip(null);
                    return;
                }
                
                // param.seriesData에서 마우스가 올려진 시리즈 찾기 (Y 좌표가 가장 가까운 것)
                let targetPrice: number | null = null;
                let targetSeriesName: string = '';
                let targetColor: string = '#3182F6';
                let minDistance = Infinity;
                
                // param.seriesData에 있는 시리즈들 중에서 마우스와 가장 가까운 것 찾기
                if (param.seriesData && param.seriesData.size > 0) {
                    param.seriesData.forEach((seriesValue, seriesApi) => {
                        if (seriesValue && typeof seriesValue === 'object' && 'value' in seriesValue) {
                            const seriesY = (seriesValue as any).y;
                            if (seriesY !== undefined) {
                                const distance = Math.abs(param.point.y - seriesY);
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    targetPrice = (seriesValue as any).value;
                                    const meta = seriesMetaMap.get(seriesApi);
                                    targetSeriesName = meta?.name || '';
                                    targetColor = meta?.color || '#3182F6';
                                }
                            }
                        }
                    });
                }
                
                // param.seriesData에 없으면 allSeriesData에서 찾기
                if (targetPrice === null) {
                    for (const [seriesApi, seriesData] of allSeriesData.entries()) {
                        const dataPoint = seriesData.find(d => d.time === param.time);
                        if (dataPoint) {
                            const meta = seriesMetaMap.get(seriesApi);
                            targetPrice = dataPoint.value;
                            targetSeriesName = meta?.name || '';
                            targetColor = meta?.color || '#3182F6';
                            break;
                        }
                    }
                }
                
                if (targetPrice !== null) {
                    const timeStr = param.time as string;
                    setTooltip({
                        visible: true,
                        x: param.point.x,
                        y: param.point.y,
                        date: formatDateKorean(timeStr),
                        price: formatPrice(targetPrice),
                        seriesName: targetSeriesName,
                        color: targetColor,
                    });
                } else {
                    setTooltip(null);
                }
            });

            // ResizeObserver로 부모 컨테이너 크기 변화 감지
            if (chartContainerRef.current && typeof ResizeObserver !== 'undefined') {
                resizeObserverRef.current = new ResizeObserver(() => {
                    handleResize();
                });
                resizeObserverRef.current.observe(chartContainerRef.current);
            }

            // window resize도 함께 처리 (fallback)
            window.addEventListener('resize', handleResize);
            
            isInitializing = false;
        };

        // 초기화 시작
        rafId = requestAnimationFrame(initChart);

        return () => {
            // requestAnimationFrame 취소
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
            
            window.removeEventListener('resize', handleResize);
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
                resizeObserverRef.current = null;
            }
            if (chartRef.current) {
                try {
                    chartRef.current.remove();
                } catch (e) {}
                chartRef.current = null;
            }
            // 컨테이너의 모든 자식 요소 제거
            if (chartContainerRef.current) {
                while (chartContainerRef.current.firstChild) {
                    chartContainerRef.current.removeChild(chartContainerRef.current.firstChild);
                }
            }
        };
    }, [data, series, height, theme, lineColor, areaTopColor, areaBottomColor, isSparkline, showHighLow, chartStyle]);

    return (
        <div className="relative w-full">
            <div 
                ref={chartContainerRef} 
                className="w-full relative overflow-hidden" 
                style={{ 
                    maxWidth: '100%',
                    display: 'block',
                    minWidth: 0
                }} 
            />
            {/* 커스텀 툴팁 - 마우스 위치의 데이터만 표시 */}
            {tooltip && tooltip.visible && (
                <div 
                    className="absolute pointer-events-none z-50 px-3 py-2.5 rounded-xl shadow-xl text-sm"
                    style={{
                        left: Math.min(tooltip.x + 15, (chartContainerRef.current?.clientWidth || 300) - 150),
                        top: Math.max(tooltip.y - 60, 10),
                        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                        border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)',
                        color: isDark ? '#fff' : '#1e293b',
                        backdropFilter: 'blur(12px)',
                        minWidth: '120px',
                    }}
                >
                    <div className="font-bold text-[13px] mb-1">{tooltip.date}</div>
                    <div className="flex items-center gap-2">
                        {tooltip.color && (
                            <div 
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: tooltip.color }}
                            />
                        )}
                        <div className="font-black text-[15px]">{tooltip.price}</div>
                    </div>
                    {tooltip.seriesName && (
                        <div className="text-[11px] opacity-70 mt-1 truncate max-w-[140px]">{tooltip.seriesName}</div>
                    )}
                </div>
            )}
        </div>
    );
};