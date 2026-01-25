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
    showHighLowInTooltip?: boolean;
    chartStyle?: 'line' | 'area' | 'candlestick';
    period?: '1년' | '3년' | '전체';
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
    showHighLowInTooltip = false,
    chartStyle = 'area',
    period
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const priceLineRefs = useRef<{ max?: any; min?: any; leftMax?: any; leftMin?: any }>({});
    const [tooltip, setTooltip] = useState<{
        visible: boolean;
        x: number;
        y: number;
        date: string;
        price: string;
        seriesName?: string;
        color?: string;
        maxPrice?: string;
        minPrice?: string;
    } | null>(null);
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

    type BusinessDayLike = { year: number; month: number; day: number };
    const isBusinessDayLike = (v: unknown): v is BusinessDayLike => {
        if (!v || typeof v !== 'object') return false;
        const anyV = v as any;
        return (
            typeof anyV.year === 'number' &&
            typeof anyV.month === 'number' &&
            typeof anyV.day === 'number'
        );
    };

    // lightweight-charts Time(유닉스초) / BusinessDay / (커스텀) string 모두 처리
    const timeToMs = (t: Time | string): number => {
        if (typeof t === 'number') return t * 1000;
        if (typeof t === 'string') return new Date(t).getTime();
        if (isBusinessDayLike(t)) return new Date(t.year, t.month - 1, t.day).getTime();
        return NaN;
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
                
                // 👇 주석 해제! (리사이즈 시에도 자동으로 내용 맞춤)
                chartRef.current.timeScale().fitContent(); 
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
                // 아직 레이아웃이 계산되지 않았으면 다시 시도 (최대 10번)
                let retryCount = 0;
                const maxRetries = 10;
                const retryInit = () => {
                    retryCount++;
                    const width = getContainerWidth();
                    if (width > 0 || retryCount >= maxRetries) {
                        if (width > 0) {
                            initChart();
                        } else {
                            console.warn('[ProfessionalChart] 컨테이너 너비를 가져올 수 없습니다.');
                        }
                    } else {
                        rafId = requestAnimationFrame(retryInit);
                    }
                };
                rafId = requestAnimationFrame(retryInit);
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
                leftPriceScale: {
                    visible: !isSparkline && showHighLow,
                    borderColor: 'transparent',
                    scaleMargins: { top: 0.2, bottom: 0.2 },
                    borderVisible: false,
                    alignLabels: true,
                    autoScale: true,
                    entireTextOnly: false,
                },
                rightPriceScale: {
                    visible: !isSparkline,
                    borderColor: 'transparent',
                    scaleMargins: { top: 0.2, bottom: 0.2 }, // 마커가 잘리지 않도록 충분한 여유 공간 확보 (벽 역할)
                    borderVisible: false,
                    alignLabels: true,
                    autoScale: false,
                    entireTextOnly: false,
                },
                timeScale: {
                    visible: !isSparkline,
                    borderColor: 'transparent',
                    timeVisible: true,
                    borderVisible: false,
                    
                    fixLeftEdge: false,  
                    fixRightEdge: true,
                    
                    rightOffset: 0,
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
            
            // 데이터 개수 추적 변수
            let totalDataPoints = 0;
            let hasAnyData = false;

            if (series && series.length > 0) {
                series.forEach((s, seriesIndex) => {
                    if (!s.visible) return;
                    // 데이터가 없는 시리즈는 건너뛰기
                    if (!s.data || s.data.length === 0) return;
                    
                    const seriesColor = s.color;
                    const lineSeries = chart.addLineSeries({
                        color: seriesColor,
                        lineWidth: 2,
                        crosshairMarkerVisible: true,
                        priceLineVisible: false,
                        title: '', // 아파트 이름 네모박스 제거
                        lastValueVisible: false,
                        priceScaleId: 'right', // 오른쪽 Y축에 연결 (현 시세 표시)
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
                        hasAnyData = true;
                        
                        // 최대 데이터 개수 업데이트
                        if (sampledData.length > totalDataPoints) {
                            totalDataPoints = sampledData.length;
                        }
                        
                        // 최고점, 최저점 계산 및 price line으로 표시
                        if (showHighLow && sampledData.length > 1) {
                            // 현재 보이는 범위 내의 최저/최고점 계산 함수
                            const updateHighLow = () => {
                                const visibleRange = chart.timeScale().getVisibleRange();
                                if (!visibleRange || !visibleRange.from || !visibleRange.to) {
                                    // 전체 범위 사용
                                    let maxPoint = sampledData[0];
                                    let minPoint = sampledData[0];
                                    
                                    sampledData.forEach(point => {
                                        if (point.value > maxPoint.value) maxPoint = point;
                                        if (point.value < minPoint.value) minPoint = point;
                                    });
                                    
                                    updatePriceLines(lineSeries, leftSeries, maxPoint, minPoint);
                                    return;
                                }
                                
                                // 보이는 범위 내의 데이터만 필터링
                                const fromMsRaw = timeToMs(visibleRange.from);
                                const toMsRaw = timeToMs(visibleRange.to);
                                const fromTime = Number.isFinite(fromMsRaw) ? fromMsRaw : -Infinity;
                                const toTime = Number.isFinite(toMsRaw) ? toMsRaw : Infinity;
                                
                                const visibleData = sampledData.filter(point => {
                                    const pointTime = new Date(point.time).getTime();
                                    return pointTime >= fromTime && pointTime <= toTime;
                                });
                                
                                if (visibleData.length === 0) return;
                                
                                let maxPoint = visibleData[0];
                                let minPoint = visibleData[0];
                                
                                visibleData.forEach(point => {
                                    if (point.value > maxPoint.value) maxPoint = point;
                                    if (point.value < minPoint.value) minPoint = point;
                                });
                                
                                updatePriceLines(lineSeries, leftSeries, maxPoint, minPoint);
                            };
                            
                            // price line 업데이트 함수
                            const updatePriceLines = (rightSeries: ISeriesApi<SeriesType>, leftSeries: ISeriesApi<SeriesType>, maxPoint: { time: string; value: number }, minPoint: { time: string; value: number }) => {
                                // 기존 price line 제거
                                if (priceLineRefs.current.max) rightSeries.removePriceLine(priceLineRefs.current.max);
                                if (priceLineRefs.current.min) rightSeries.removePriceLine(priceLineRefs.current.min);
                                if (priceLineRefs.current.leftMax) leftSeries.removePriceLine(priceLineRefs.current.leftMax);
                                if (priceLineRefs.current.leftMin) leftSeries.removePriceLine(priceLineRefs.current.leftMin);
                                
                                // 최고/최저점 정보 저장
                                setHighLowLabels({ max: maxPoint, min: minPoint });
                                
                                // 오른쪽 Y축에 최고점 가로 점선 (빨강)
                                priceLineRefs.current.max = rightSeries.createPriceLine({
                                    price: maxPoint.value,
                                    color: '#FF4B4B',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: false,
                                    title: '',
                                });
                                
                                // 오른쪽 Y축에 최저점 가로 점선 (파랑)
                                priceLineRefs.current.min = rightSeries.createPriceLine({
                                    price: minPoint.value,
                                    color: '#3182F6',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: false,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축에 최고점 가로 점선 (빨강, 강조 표시)
                                priceLineRefs.current.leftMax = leftSeries.createPriceLine({
                                    price: maxPoint.value,
                                    color: '#FF4B4B',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: true,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축에 최저점 가로 점선 (파랑, 강조 표시)
                                priceLineRefs.current.leftMin = leftSeries.createPriceLine({
                                    price: minPoint.value,
                                    color: '#3182F6',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: true,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축 시리즈 데이터 업데이트 (Y축 스케일링을 위해)
                                leftSeries.setData([
                                    { time: sampledData[0].time as Time, value: minPoint.value },
                                    { time: sampledData[sampledData.length - 1].time as Time, value: maxPoint.value }
                                ]);
                            };
                            
                            // 왼쪽 Y축에 최저/최고점 표시를 위한 시리즈
                            const leftSeries = chart.addLineSeries({
                                color: 'transparent',
                                lineWidth: 1,
                                priceScaleId: 'left',
                                visible: true,
                                lastValueVisible: false,
                                priceLineVisible: false,
                            });
                            
                            // 초기 최저/최고점 계산 및 표시
                            updateHighLow();
                            
                            // visible range 변경 감지
                            chart.timeScale().subscribeVisibleTimeRangeChange(updateHighLow);
                        }
                    }
                });
            } else if (data && data.length > 0) {
                const mainColor = lineColor || '#3182F6'; 
                const topColor = areaTopColor || 'rgba(49, 130, 246, 0.2)';
                const bottomColor = areaBottomColor || 'rgba(49, 130, 246, 0.0)'; 

                const sortedData = [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
                const uniqueData = sortedData.filter((item, index, self) => index === 0 || item.time !== self[index - 1].time);
                
                // 데이터 개수 업데이트
                totalDataPoints = uniqueData.length;

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
                            priceScaleId: 'right', // 오른쪽 Y축에 연결 (현 시세 표시)
                        });

                        const candleData = uniqueData.map(d => ({
                            time: d.time as Time,
                            open: d.open || d.value,
                            high: d.high || d.value,
                            low: d.low || d.value,
                            close: d.close || d.value,
                        }));

                        candleSeries.setData(candleData);
                        allSeriesData.set(candleSeries, uniqueData);
                        
                        // 최고점, 최저점 계산 및 price line으로 표시
                        if (showHighLow && uniqueData.length > 1) {
                            // 현재 보이는 범위 내의 최저/최고점 계산 함수
                            const updateHighLow = () => {
                                const visibleRange = chart.timeScale().getVisibleRange();
                                if (!visibleRange || !visibleRange.from || !visibleRange.to) {
                                    // 전체 범위 사용
                                    let maxValue = uniqueData[0].high || uniqueData[0].value;
                                    let minValue = uniqueData[0].low || uniqueData[0].value;
                                    let maxPoint = uniqueData[0];
                                    let minPoint = uniqueData[0];
                                    
                                    uniqueData.forEach(point => {
                                        const high = point.high || point.value;
                                        const low = point.low || point.value;
                                        if (high > maxValue) {
                                            maxValue = high;
                                            maxPoint = point;
                                        }
                                        if (low < minValue) {
                                            minValue = low;
                                            minPoint = point;
                                        }
                                    });
                                    
                                    updatePriceLines(candleSeries, leftSeries, { time: maxPoint.time, value: maxValue }, { time: minPoint.time, value: minValue });
                                    return;
                                }
                                
                                // 보이는 범위 내의 데이터만 필터링
                                const fromMsRaw = timeToMs(visibleRange.from);
                                const toMsRaw = timeToMs(visibleRange.to);
                                const fromTime = Number.isFinite(fromMsRaw) ? fromMsRaw : -Infinity;
                                const toTime = Number.isFinite(toMsRaw) ? toMsRaw : Infinity;
                                
                                const visibleData = uniqueData.filter(point => {
                                    const pointTime = new Date(point.time).getTime();
                                    return pointTime >= fromTime && pointTime <= toTime;
                                });
                                
                                if (visibleData.length === 0) return;
                                
                                let maxValue = visibleData[0].high || visibleData[0].value;
                                let minValue = visibleData[0].low || visibleData[0].value;
                                let maxPoint = visibleData[0];
                                let minPoint = visibleData[0];
                                
                                visibleData.forEach(point => {
                                    const high = point.high || point.value;
                                    const low = point.low || point.value;
                                    if (high > maxValue) {
                                        maxValue = high;
                                        maxPoint = point;
                                    }
                                    if (low < minValue) {
                                        minValue = low;
                                        minPoint = point;
                                    }
                                });
                                
                                updatePriceLines(candleSeries, leftSeries, { time: maxPoint.time, value: maxValue }, { time: minPoint.time, value: minValue });
                            };
                            
                            // price line 업데이트 함수
                            const updatePriceLines = (rightSeries: ISeriesApi<SeriesType>, leftSeries: ISeriesApi<SeriesType>, maxPoint: { time: string; value: number }, minPoint: { time: string; value: number }) => {
                                // 기존 price line 제거
                                if (priceLineRefs.current.max) rightSeries.removePriceLine(priceLineRefs.current.max);
                                if (priceLineRefs.current.min) rightSeries.removePriceLine(priceLineRefs.current.min);
                                if (priceLineRefs.current.leftMax) leftSeries.removePriceLine(priceLineRefs.current.leftMax);
                                if (priceLineRefs.current.leftMin) leftSeries.removePriceLine(priceLineRefs.current.leftMin);
                                
                                // 최고/최저점 정보 저장
                                setHighLowLabels({ max: maxPoint, min: minPoint });
                                
                                // 오른쪽 Y축에 최고점 가로 점선 (빨강)
                                priceLineRefs.current.max = rightSeries.createPriceLine({
                                    price: maxPoint.value,
                                    color: '#FF4B4B',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: false,
                                    title: '',
                                });
                                
                                // 오른쪽 Y축에 최저점 가로 점선 (파랑)
                                priceLineRefs.current.min = rightSeries.createPriceLine({
                                    price: minPoint.value,
                                    color: '#3182F6',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: false,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축에 최고점 가로 점선 (빨강, 강조 표시)
                                priceLineRefs.current.leftMax = leftSeries.createPriceLine({
                                    price: maxPoint.value,
                                    color: '#FF4B4B',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: true,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축에 최저점 가로 점선 (파랑, 강조 표시)
                                priceLineRefs.current.leftMin = leftSeries.createPriceLine({
                                    price: minPoint.value,
                                    color: '#3182F6',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: true,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축 시리즈 데이터 업데이트 (Y축 스케일링을 위해)
                                leftSeries.setData([
                                    { time: uniqueData[0].time as Time, value: minPoint.value },
                                    { time: uniqueData[uniqueData.length - 1].time as Time, value: maxPoint.value }
                                ]);
                            };
                            
                            // 왼쪽 Y축에 최저/최고점 표시를 위한 시리즈
                            const leftSeries = chart.addLineSeries({
                                color: 'transparent',
                                lineWidth: 1,
                                priceScaleId: 'left',
                                visible: true,
                                lastValueVisible: false,
                                priceLineVisible: false,
                            });
                            
                            // 초기 최저/최고점 계산 및 표시
                            updateHighLow();
                            
                            // visible range 변경 감지
                            chart.timeScale().subscribeVisibleTimeRangeChange(updateHighLow);
                        }
                    } else if (chartStyle === 'line') {
                        // 라인 차트
                        const lineSeries = chart.addLineSeries({
                            color: mainColor,
                            lineWidth: 2,
                            priceFormat: { type: 'custom', formatter: formatPrice },
                            crosshairMarkerVisible: true,
                            priceLineVisible: false,
                            priceScaleId: 'right', // 오른쪽 Y축에 연결 (현 시세 표시)
                        });

                        lineSeries.setData(uniqueData);
                        allSeriesData.set(lineSeries, uniqueData);

                        // 최고점, 최저점 계산 및 price line으로 표시
                        if (showHighLow && uniqueData.length > 1) {
                            // 현재 보이는 범위 내의 최저/최고점 계산 함수
                            const updateHighLow = () => {
                                const visibleRange = chart.timeScale().getVisibleRange();
                                if (!visibleRange || !visibleRange.from || !visibleRange.to) {
                                    // 전체 범위 사용
                                    let maxPoint = uniqueData[0];
                                    let minPoint = uniqueData[0];
                                    
                                    uniqueData.forEach(point => {
                                        if (point.value > maxPoint.value) maxPoint = point;
                                        if (point.value < minPoint.value) minPoint = point;
                                    });
                                    
                                    updatePriceLines(lineSeries, leftSeries, maxPoint, minPoint);
                                    return;
                                }
                                
                                // 보이는 범위 내의 데이터만 필터링
                                const fromMsRaw = timeToMs(visibleRange.from);
                                const toMsRaw = timeToMs(visibleRange.to);
                                const fromTime = Number.isFinite(fromMsRaw) ? fromMsRaw : -Infinity;
                                const toTime = Number.isFinite(toMsRaw) ? toMsRaw : Infinity;
                                
                                const visibleData = uniqueData.filter(point => {
                                    const pointTime = new Date(point.time).getTime();
                                    return pointTime >= fromTime && pointTime <= toTime;
                                });
                                
                                if (visibleData.length === 0) return;
                                
                                let maxPoint = visibleData[0];
                                let minPoint = visibleData[0];
                                
                                visibleData.forEach(point => {
                                    if (point.value > maxPoint.value) maxPoint = point;
                                    if (point.value < minPoint.value) minPoint = point;
                                });
                                
                                updatePriceLines(lineSeries, leftSeries, maxPoint, minPoint);
                            };
                            
                            // price line 업데이트 함수
                            const updatePriceLines = (rightSeries: ISeriesApi<SeriesType>, leftSeries: ISeriesApi<SeriesType>, maxPoint: { time: string; value: number }, minPoint: { time: string; value: number }) => {
                                // 기존 price line 제거
                                if (priceLineRefs.current.max) rightSeries.removePriceLine(priceLineRefs.current.max);
                                if (priceLineRefs.current.min) rightSeries.removePriceLine(priceLineRefs.current.min);
                                if (priceLineRefs.current.leftMax) leftSeries.removePriceLine(priceLineRefs.current.leftMax);
                                if (priceLineRefs.current.leftMin) leftSeries.removePriceLine(priceLineRefs.current.leftMin);
                                
                                // 최고/최저점 정보 저장
                                setHighLowLabels({ max: maxPoint, min: minPoint });
                                
                                // 오른쪽 Y축에 최고점 가로 점선 (빨강)
                                priceLineRefs.current.max = rightSeries.createPriceLine({
                                    price: maxPoint.value,
                                    color: '#FF4B4B',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: false,
                                    title: '',
                                });
                                
                                // 오른쪽 Y축에 최저점 가로 점선 (파랑)
                                priceLineRefs.current.min = rightSeries.createPriceLine({
                                    price: minPoint.value,
                                    color: '#3182F6',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: false,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축에 최고점 가로 점선 (빨강, 강조 표시)
                                priceLineRefs.current.leftMax = leftSeries.createPriceLine({
                                    price: maxPoint.value,
                                    color: '#FF4B4B',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: true,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축에 최저점 가로 점선 (파랑, 강조 표시)
                                priceLineRefs.current.leftMin = leftSeries.createPriceLine({
                                    price: minPoint.value,
                                    color: '#3182F6',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: true,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축 시리즈 데이터 업데이트 (Y축 스케일링을 위해)
                                leftSeries.setData([
                                    { time: uniqueData[0].time as Time, value: minPoint.value },
                                    { time: uniqueData[uniqueData.length - 1].time as Time, value: maxPoint.value }
                                ]);
                            };
                            
                            // 왼쪽 Y축에 최저/최고점 표시를 위한 시리즈
                            const leftSeries = chart.addLineSeries({
                                color: 'transparent',
                                lineWidth: 1,
                                priceScaleId: 'left',
                                visible: true,
                                lastValueVisible: false,
                                priceLineVisible: false,
                            });
                            
                            // 초기 최저/최고점 계산 및 표시
                            updateHighLow();
                            
                            // visible range 변경 감지
                            chart.timeScale().subscribeVisibleTimeRangeChange(updateHighLow);
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
                            priceScaleId: 'right', // 오른쪽 Y축에 연결 (현 시세 표시)
                        });

                        areaSeries.setData(uniqueData);
                        allSeriesData.set(areaSeries, uniqueData);
                        
                        // 최고점, 최저점 계산 및 price line으로 표시
                        if (showHighLow && uniqueData.length > 1) {
                            // 현재 보이는 범위 내의 최저/최고점 계산 함수
                            const updateHighLow = () => {
                                const visibleRange = chart.timeScale().getVisibleRange();
                                if (!visibleRange || !visibleRange.from || !visibleRange.to) {
                                    // 전체 범위 사용
                                    let maxPoint = uniqueData[0];
                                    let minPoint = uniqueData[0];
                                    
                                    uniqueData.forEach(point => {
                                        if (point.value > maxPoint.value) maxPoint = point;
                                        if (point.value < minPoint.value) minPoint = point;
                                    });
                                    
                                    updatePriceLines(areaSeries, leftSeries, maxPoint, minPoint);
                                    return;
                                }
                                
                                // 보이는 범위 내의 데이터만 필터링
                                const fromMsRaw = timeToMs(visibleRange.from);
                                const toMsRaw = timeToMs(visibleRange.to);
                                const fromTime = Number.isFinite(fromMsRaw) ? fromMsRaw : -Infinity;
                                const toTime = Number.isFinite(toMsRaw) ? toMsRaw : Infinity;
                                
                                const visibleData = uniqueData.filter(point => {
                                    const pointTime = new Date(point.time).getTime();
                                    return pointTime >= fromTime && pointTime <= toTime;
                                });
                                
                                if (visibleData.length === 0) return;
                                
                                let maxPoint = visibleData[0];
                                let minPoint = visibleData[0];
                                
                                visibleData.forEach(point => {
                                    if (point.value > maxPoint.value) maxPoint = point;
                                    if (point.value < minPoint.value) minPoint = point;
                                });
                                
                                updatePriceLines(areaSeries, leftSeries, maxPoint, minPoint);
                            };
                            
                            // price line 업데이트 함수
                            const updatePriceLines = (rightSeries: ISeriesApi<SeriesType>, leftSeries: ISeriesApi<SeriesType>, maxPoint: { time: string; value: number }, minPoint: { time: string; value: number }) => {
                                // 기존 price line 제거
                                if (priceLineRefs.current.max) rightSeries.removePriceLine(priceLineRefs.current.max);
                                if (priceLineRefs.current.min) rightSeries.removePriceLine(priceLineRefs.current.min);
                                if (priceLineRefs.current.leftMax) leftSeries.removePriceLine(priceLineRefs.current.leftMax);
                                if (priceLineRefs.current.leftMin) leftSeries.removePriceLine(priceLineRefs.current.leftMin);
                                
                                // 최고/최저점 정보 저장
                                setHighLowLabels({ max: maxPoint, min: minPoint });
                                
                                // 오른쪽 Y축에 최고점 가로 점선 (빨강)
                                priceLineRefs.current.max = rightSeries.createPriceLine({
                                    price: maxPoint.value,
                                    color: '#FF4B4B',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: false,
                                    title: '',
                                });
                                
                                // 오른쪽 Y축에 최저점 가로 점선 (파랑)
                                priceLineRefs.current.min = rightSeries.createPriceLine({
                                    price: minPoint.value,
                                    color: '#3182F6',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: false,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축에 최고점 가로 점선 (빨강, 강조 표시)
                                priceLineRefs.current.leftMax = leftSeries.createPriceLine({
                                    price: maxPoint.value,
                                    color: '#FF4B4B',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: true,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축에 최저점 가로 점선 (파랑, 강조 표시)
                                priceLineRefs.current.leftMin = leftSeries.createPriceLine({
                                    price: minPoint.value,
                                    color: '#3182F6',
                                    lineWidth: 1,
                                    lineStyle: LineStyle.Dashed,
                                    axisLabelVisible: true,
                                    title: '',
                                });
                                
                                // 왼쪽 Y축 시리즈 데이터 업데이트 (Y축 스케일링을 위해)
                                leftSeries.setData([
                                    { time: uniqueData[0].time as Time, value: minPoint.value },
                                    { time: uniqueData[uniqueData.length - 1].time as Time, value: maxPoint.value }
                                ]);
                            };
                            
                            // 왼쪽 Y축에 최저/최고점 표시를 위한 시리즈
                            const leftSeries = chart.addLineSeries({
                                color: 'transparent',
                                lineWidth: 1,
                                priceScaleId: 'left',
                                visible: true,
                                lastValueVisible: false,
                                priceLineVisible: false,
                            });
                            
                            // 초기 최저/최고점 계산 및 표시
                            updateHighLow();
                            
                            // visible range 변경 감지
                            chart.timeScale().subscribeVisibleTimeRangeChange(updateHighLow);
                        }
                    }
                }
            }

            // 데이터가 없으면 차트를 제거하고 종료
            if (!hasAnyData && totalDataPoints === 0) {
                try {
                    chart.remove();
                } catch (e) {}
                chartRef.current = null;
                isInitializing = false;
                return;
            }

            // 전체 기간일 때만 약간 축소하여 스크롤 가능하도록 설정
            if (period === '전체' && (series || data)) {
                const allData = series && series.length > 0 
                    ? series.flatMap(s => s.data || [])
                    : (data || []);
                
                if (allData.length > 0) {
                    // 데이터를 시간순으로 정렬
                    const sortedData = [...allData].sort((a, b) => 
                        new Date(a.time).getTime() - new Date(b.time).getTime()
                    );
                    
                    const firstTime = sortedData[0].time;
                    const lastTime = sortedData[sortedData.length - 1].time;
                    
                    // 전체 데이터 범위 계산
                    const totalDuration = new Date(lastTime).getTime() - new Date(firstTime).getTime();
                    
                    // 전체의 약 90%만 표시하여 스크롤 한 번 정도만 가능하도록
                    const visibleDuration = totalDuration * 0.9;
                    const visibleStart = new Date(new Date(firstTime).getTime() + (totalDuration - visibleDuration) / 2);
                    const visibleEnd = new Date(visibleStart.getTime() + visibleDuration);
                    
                    try {
                        chart.timeScale().setVisibleRange({
                            from: (visibleStart.getTime() / 1000) as any,
                            to: (visibleEnd.getTime() / 1000) as any
                        });
                    } catch (e) {
                        // setVisibleRange 실패 시 fitContent 사용
                        chart.timeScale().fitContent();
                    }
                } else {
                    chart.timeScale().fitContent();
                }
            } else {
                chart.timeScale().fitContent();
            }
            
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
                
                const paramTimeStr = param.time as string;
                
                // param.seriesData에서 마우스가 올려진 시리즈 찾기
                let targetPrice: number | null = null;
                let targetSeriesName: string = '';
                let targetColor: string = '#3182F6';
                let targetSeriesApi: ISeriesApi<SeriesType> | null = null;
                let minDistance = Infinity;
                
                // param.seriesData에 있는 시리즈들 중에서 마우스와 가장 가까운 것 찾기
                // param.seriesData는 param.time에 해당하는 모든 시리즈의 보간된 값을 포함합니다
                if (param.seriesData && param.seriesData.size > 0) {
                    param.seriesData.forEach((seriesValue, seriesApi) => {
                        if (seriesValue && typeof seriesValue === 'object' && 'value' in seriesValue) {
                            const value = (seriesValue as any).value;
                            const seriesY = (seriesValue as any).y;
                            const meta = seriesMetaMap.get(seriesApi);
                            
                            // 값이 유효한지 확인 (null, undefined, NaN 체크)
                            if (value !== null && value !== undefined && !isNaN(value)) {
                                // 각 시리즈의 price scale을 사용해서 마우스 Y 좌표를 가격으로 변환
                                let mousePrice: number | null = null;
                                try {
                                    mousePrice = (seriesApi as any).coordinateToPrice?.(param.point.y) || null;
                                } catch (e) {
                                    // coordinateToPrice가 없거나 실패하면 null
                                }
                                
                                // seriesY가 있으면 Y 좌표 거리 사용, 없으면 가격 차이 사용
                                let distance: number;
                                if (seriesY !== undefined && !isNaN(seriesY)) {
                                    distance = Math.abs(param.point.y - seriesY);
                                } else if (mousePrice !== null) {
                                    // 가격 차이를 사용 (마우스 위치의 가격과 시리즈 가격의 차이)
                                    distance = Math.abs(mousePrice - value);
                                } else {
                                    // 둘 다 없으면 무한대 (선택되지 않음)
                                    distance = Infinity;
                                }
                                
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    targetPrice = value;
                                    targetSeriesName = meta?.name || '';
                                    targetColor = meta?.color || '#3182F6';
                                    targetSeriesApi = seriesApi;
                                }
                            }
                        }
                    });
                }
                
                // param.seriesData에 없거나 유효한 값이 없으면 allSeriesData에서 정확한 시간의 데이터 찾기
                if (targetPrice === null) {
                    let closestDataPoint: { time: string; value: number } | null = null;
                    let closestSeriesApi: ISeriesApi<SeriesType> | null = null;
                    let closestTimeDiff = Infinity;
                    let closestPriceDiff = Infinity;
                    
                    // 모든 시리즈에서 param.time에 가장 가까운 데이터 포인트 찾기
                    for (const [seriesApi, seriesData] of allSeriesData.entries()) {
                        const meta = seriesMetaMap.get(seriesApi);
                        
                        // 각 시리즈의 price scale을 사용해서 마우스 Y 좌표를 가격으로 변환
                        let mousePrice: number | null = null;
                        try {
                            mousePrice = (seriesApi as any).coordinateToPrice?.(param.point.y) || null;
                        } catch (e) {
                            // coordinateToPrice가 없거나 실패하면 null
                        }
                        
                        // 정확히 일치하는 시간 찾기
                        let dataPoint = seriesData.find(d => d.time === paramTimeStr);
                        
                        // 정확히 일치하는 것이 없으면 가장 가까운 시간 찾기
                        if (!dataPoint && seriesData.length > 0) {
                            const paramTime = new Date(paramTimeStr).getTime();
                            for (const point of seriesData) {
                                const pointTime = new Date(point.time).getTime();
                                const timeDiff = Math.abs(paramTime - pointTime);
                                if (timeDiff < closestTimeDiff) {
                                    closestTimeDiff = timeDiff;
                                    dataPoint = point;
                                }
                            }
                        }
                        
                        if (dataPoint) {
                            // 마우스 위치의 가격과 가장 가까운 시리즈 선택
                            const priceDiff = mousePrice !== null ? Math.abs(mousePrice - dataPoint.value) : Infinity;
                            
                            // 시간 차이가 같거나 더 작고, 가격 차이가 더 작은 시리즈 선택
                            const currentTimeDiff = Math.abs(new Date(dataPoint.time).getTime() - new Date(paramTimeStr).getTime());
                            if (closestDataPoint === null || 
                                (currentTimeDiff <= closestTimeDiff && priceDiff < closestPriceDiff)) {
                                closestTimeDiff = currentTimeDiff;
                                closestPriceDiff = priceDiff;
                                closestDataPoint = dataPoint;
                                closestSeriesApi = seriesApi;
                            }
                        }
                    }
                    
                    if (closestDataPoint && closestSeriesApi) {
                        const meta = seriesMetaMap.get(closestSeriesApi);
                        targetPrice = closestDataPoint.value;
                        targetSeriesName = meta?.name || '';
                        targetColor = meta?.color || '#3182F6';
                        targetSeriesApi = closestSeriesApi;
                    }
                }
                
                if (targetPrice !== null) {
                    const timeStr = param.time as string;
                    let maxPrice: string | undefined;
                    let minPrice: string | undefined;
                    if (showHighLowInTooltip && targetSeriesApi) {
                        const seriesData = allSeriesData.get(targetSeriesApi);
                        if (seriesData && seriesData.length > 0) {
                            let maxVal = seriesData[0].value;
                            let minVal = seriesData[0].value;
                            for (const p of seriesData) {
                                if (p.value > maxVal) maxVal = p.value;
                                if (p.value < minVal) minVal = p.value;
                            }
                            maxPrice = formatPrice(maxVal);
                            minPrice = formatPrice(minVal);
                        }
                    }
                    setTooltip({
                        visible: true,
                        x: param.point.x,
                        y: param.point.y,
                        date: formatDateKorean(timeStr),
                        price: formatPrice(targetPrice),
                        seriesName: targetSeriesName,
                        color: targetColor,
                        maxPrice,
                        minPrice,
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
    }, [data, series, height, theme, lineColor, areaTopColor, areaBottomColor, isSparkline, showHighLow, chartStyle, period]);

    // 데이터 유효성 검사
    const hasData = (series && series.length > 0 && series.some(s => s.data && s.data.length > 0)) || 
                    (data && data.length > 0);

    return (
        <div className="relative w-full">
            {!hasData ? (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                    <div className="text-center">
                        <p className={`text-[14px] font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            데이터가 없습니다
                        </p>
                        <p className={`text-[12px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            차트 데이터를 불러오는 중이거나 표시할 데이터가 없습니다
                        </p>
                    </div>
                </div>
            ) : (
                <div 
                    ref={chartContainerRef} 
                    className="w-full relative overflow-hidden" 
                    style={{ 
                        maxWidth: '100%',
                        display: 'block',
                        minWidth: 0
                    }} 
                />
            )}
            {/* 커스텀 툴팁 - 마우스 위치의 데이터만 표시 */}
            {hasData && tooltip && tooltip.visible && (
                <div 
                    className="absolute pointer-events-none z-50 px-3 py-2.5 rounded-xl shadow-xl text-sm"
                    style={{
                        left: Math.min(tooltip.x + 15, (chartContainerRef.current?.clientWidth || 300) - 150),
                        top: Math.max(tooltip.y - 92, 10),
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
                    {showHighLowInTooltip && (tooltip.maxPrice || tooltip.minPrice) && (
                        <div className="mt-1 text-[11px] space-y-0.5 opacity-90">
                            {tooltip.maxPrice && (
                                <div className="flex items-center justify-between gap-3">
                                    <span className="opacity-70">최고</span>
                                    <span className="font-bold text-red-300">{tooltip.maxPrice}</span>
                                </div>
                            )}
                            {tooltip.minPrice && (
                                <div className="flex items-center justify-between gap-3">
                                    <span className="opacity-70">최저</span>
                                    <span className="font-bold text-blue-300">{tooltip.minPrice}</span>
                                </div>
                            )}
                        </div>
                    )}
                    {tooltip.seriesName && (
                        <div className="text-[11px] opacity-70 mt-1 truncate max-w-[140px]">{tooltip.seriesName}</div>
                    )}
                </div>
            )}
        </div>
    );
};