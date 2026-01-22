import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, IChartApi, SeriesMarker, Time, LineStyle } from 'lightweight-charts';

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

    const isDark = theme === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';
    const backgroundColor = 'transparent';

    const formatPrice = (price: number) => {
        const val = Math.round(price);
        if (val < 10000) return `${val.toLocaleString()}만원`;
        const eok = Math.floor(val / 10000);
        const man = val % 10000;
        if (eok > 0) return `${eok}억 ${man > 0 ? man.toLocaleString() : ''}`;
        return `${man.toLocaleString()}`;
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
                    scaleMargins: { top: 0.2, bottom: 0.2 },
                    borderVisible: false,
                    alignLabels: true,
                },
                timeScale: {
                    visible: !isSparkline,
                    borderColor: 'transparent',
                    timeVisible: true,
                    borderVisible: false,
                    fixLeftEdge: true,
                    fixRightEdge: true,
                    tickMarkFormatter: (time: number | string) => {
                        if (typeof time === 'string') {
                            const date = new Date(time);
                            return `${date.getFullYear().toString().slice(2)}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                        }
                        return '';
                    }
                },
                localization: { priceFormatter: formatPrice },
                crosshair: {
                    mode: CrosshairMode.Normal,
                    vertLine: { visible: !isSparkline, color: isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1', style: LineStyle.Dashed, labelVisible: false },
                    horzLine: { visible: !isSparkline, color: isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1', style: LineStyle.Dashed, labelVisible: true }
                },
                handleScale: !isSparkline,
                handleScroll: !isSparkline,
            });

            chartRef.current = chart;

            if (series && series.length > 0) {
                series.forEach(s => {
                    if (!s.visible) return;
                    const lineSeries = chart.addLineSeries({
                        color: s.color,
                        lineWidth: 2,
                        crosshairMarkerVisible: true,
                        priceLineVisible: false,
                        title: s.name,
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
                        
                        // 최고점, 최저점 마커 표시 (showHighLow가 true일 때만)
                        if (showHighLow && sampledData.length > 1) {
                            let maxPoint = sampledData[0];
                            let minPoint = sampledData[0];
                            
                            sampledData.forEach(point => {
                                if (point.value > maxPoint.value) maxPoint = point;
                                if (point.value < minPoint.value) minPoint = point;
                            });
                            
                            const markers: SeriesMarker<Time>[] = [];
                            
                            // 최고점 마커 (빨간색 점)
                            markers.push({
                                time: maxPoint.time as Time,
                                position: 'aboveBar',
                                color: '#FF4B4B',
                                shape: 'circle',
                                size: 0.8,
                            });
                            
                            // 최저점 마커 (파란색 점)
                            markers.push({
                                time: minPoint.time as Time,
                                position: 'belowBar',
                                color: '#3182F6',
                                shape: 'circle',
                                size: 0.8,
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

                        // 최고점, 최저점 마커 표시
                        if (showHighLow && uniqueData.length > 1) {
                            let maxPoint = uniqueData[0];
                            let minPoint = uniqueData[0];
                            
                            uniqueData.forEach(point => {
                                if (point.value > maxPoint.value) maxPoint = point;
                                if (point.value < minPoint.value) minPoint = point;
                            });
                            
                            const markers: SeriesMarker<Time>[] = [
                                {
                                    time: maxPoint.time as Time,
                                    position: 'aboveBar',
                                    color: '#FF4B4B',
                                    shape: 'circle',
                                    size: 0.8,
                                },
                                {
                                    time: minPoint.time as Time,
                                    position: 'belowBar',
                                    color: '#3182F6',
                                    shape: 'circle',
                                    size: 0.8,
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
                        
                        // 최고점, 최저점 마커 표시
                        if (showHighLow && uniqueData.length > 1) {
                            let maxPoint = uniqueData[0];
                            let minPoint = uniqueData[0];
                            
                            uniqueData.forEach(point => {
                                if (point.value > maxPoint.value) maxPoint = point;
                                if (point.value < minPoint.value) minPoint = point;
                            });
                            
                            const markers: SeriesMarker<Time>[] = [
                                {
                                    time: maxPoint.time as Time,
                                    position: 'aboveBar',
                                    color: '#FF4B4B',
                                    shape: 'circle',
                                    size: 0.8,
                                },
                                {
                                    time: minPoint.time as Time,
                                    position: 'belowBar',
                                    color: '#3182F6',
                                    shape: 'circle',
                                    size: 0.8,
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
        <div 
            ref={chartContainerRef} 
            className="w-full relative overflow-hidden" 
            style={{ 
                maxWidth: '100%',
                display: 'block',
                minWidth: 0
            }} 
        />
    );
};