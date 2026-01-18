import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, BarChart3, Info, Calendar, Lightbulb, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import { getStatisticsSummary, getHPI, getHPIHeatmap, RVOLDataPoint, QuadrantDataPoint, HPIDataPoint, HPIHeatmapDataPoint } from '../lib/statisticsApi';
import { useAuth } from '../lib/clerk';

interface StatisticsProps {
  isDarkMode: boolean;
  isDesktop?: boolean;
}

export default function Statistics({ isDarkMode, isDesktop = false }: StatisticsProps) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rvolData, setRvolData] = useState<RVOLDataPoint[]>([]);
  const [quadrantData, setQuadrantData] = useState<QuadrantDataPoint[]>([]);
  const [hpiData, setHpiData] = useState<HPIDataPoint[]>([]);
  const [hpiPeriod, setHpiPeriod] = useState<string>('');
  const [hpiHeatmapData, setHpiHeatmapData] = useState<HPIHeatmapDataPoint[]>([]);
  const [hpiHeatmapBaseYm, setHpiHeatmapBaseYm] = useState<string>('');
  const [period, setPeriod] = useState<string>('');
  const [summary, setSummary] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'detail'>('basic');
  const [hpiViewMode, setHpiViewMode] = useState<'heatmap' | 'line'>('heatmap');
  const [heatmapFilter, setHeatmapFilter] = useState<'all' | 'provinces' | 'metropolitan' | 'special'>('all');
  const [lineFilter, setLineFilter] = useState<'all' | 'provinces' | 'metropolitan' | 'special'>('all');
  const [isLineDropdownOpen, setIsLineDropdownOpen] = useState(false);
  const [isQuadrantInfoExpanded, setIsQuadrantInfoExpanded] = useState(true);
  const [isHpiInfoExpanded, setIsHpiInfoExpanded] = useState(false);
  
  const quadrantSvgRef = useRef<SVGSVGElement>(null);
  const quadrantContainerRef = useRef<HTMLDivElement>(null);

  // ApartmentDetail과 동일한 카드 스타일
  const cardClass = isDarkMode
    ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';
  
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const textTertiary = isDarkMode ? 'text-slate-500' : 'text-slate-500';
  const bgSecondary = isDarkMode ? 'bg-zinc-900/30' : 'bg-slate-50';

  // 데이터 로드 - PC에서는 12개월(1년), 모바일에서는 6개월
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        // PC에서는 12개월(1년) 데이터 요청
        const periodMonths = isDesktop ? 12 : 6;
        const [response, hpiResponse, hpiHeatmapResponse] = await Promise.all([
          getStatisticsSummary('sale', periodMonths, periodMonths, periodMonths, token),
          getHPI(null, 'APT', isDesktop ? 24 : 12, token),
          getHPIHeatmap('APT', token)
        ]);
        
        // 응답 검증
        if (!response || !response.rvol || !response.quadrant) {
          throw new Error('서버에서 올바른 형식의 데이터를 받지 못했습니다.');
        }
        
        // 현재 달 제외 필터링
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        const currentMonthStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;
        
        const filteredRvolData = (response.rvol.data || []).filter((item: RVOLDataPoint) => {
          // date 형식: "2026-01-01" -> "2026-01" 추출
          const datePrefix = item.date.substring(0, 7); // "YYYY-MM"
          return datePrefix !== currentMonthStr;
        });
        
        const filteredQuadrantData = (response.quadrant.data || []).filter((item: QuadrantDataPoint) => {
          // date 형식: "2026-01" -> 그대로 사용
          return item.date !== currentMonthStr;
        });
        
        // HPI 데이터 필터링 (현재 달 제외)
        const filteredHpiData = (hpiResponse.data || []).filter((item: HPIDataPoint) => {
          return item.date !== currentMonthStr;
        });
        
        setRvolData(filteredRvolData);
        setQuadrantData(filteredQuadrantData);
        setHpiData(filteredHpiData);
        setHpiPeriod(hpiResponse.period || '');
        setHpiHeatmapData(hpiHeatmapResponse.data || []);
        setHpiHeatmapBaseYm(hpiHeatmapResponse.base_ym || '');
        setPeriod(response.rvol.period || '');
        setSummary(response.quadrant.summary || null);
      } catch (err: any) {
        console.error('통계 데이터 로드 실패:', err);
        const errorMessage = err?.response?.data?.detail || err?.message || '데이터를 불러오는 중 오류가 발생했습니다.';
        setError(errorMessage);
        // 에러 발생 시 빈 배열로 초기화
        setRvolData([]);
        setQuadrantData([]);
        setHpiData([]);
        setHpiPeriod('');
        setHpiHeatmapData([]);
        setHpiHeatmapBaseYm('');
        setPeriod('');
        setSummary(null);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [getToken, isDesktop]);

  // 날짜 포맷팅 함수
  const formatDate = (dateStr: string) => {
    const [year, month] = dateStr.split('-');
    return `${year}년 ${parseInt(month)}월`;
  };

  // 도/시 분류 함수 (states.csv 기준)
  const getCityType = (cityName: string): 'special' | 'metropolitan' | 'province' => {
    // 특별시: 서울특별시
    if (cityName === '서울특별시' || cityName.includes('서울특별시')) {
      return 'special';
    }
    // 광역시: 부산광역시, 대구광역시, 인천광역시, 광주광역시, 대전광역시, 울산광역시
    // 특별자치시: 세종특별자치시
    if (cityName.includes('광역시') || cityName === '세종특별자치시' || cityName.includes('세종특별자치시')) {
      return 'metropolitan';
    }
    // 도: 경기도, 강원특별자치도, 충청북도, 충청남도, 전북특별자치도, 전라남도, 경상북도, 경상남도, 제주특별자치도
    if (cityName.includes('도')) {
      return 'province';
    }
    // 기본값은 도로 처리
    return 'province';
  };

  // 필터링된 히트맵 데이터
  const filteredHeatmapData = hpiHeatmapData.filter(item => {
    if (heatmapFilter === 'all') return true;
    const cityType = getCityType(item.city_name);
    if (heatmapFilter === 'special') return cityType === 'special';
    if (heatmapFilter === 'metropolitan') return cityType === 'metropolitan';
    if (heatmapFilter === 'provinces') return cityType === 'province';
    return true;
  });

  // 필터링된 꺾은선 데이터 (도/시별로 그룹화)
  const filteredLineData = (() => {
    if (lineFilter === 'all') {
      // 전국 평균 계산 - 히트맵 데이터 사용
      if (hpiHeatmapData.length === 0) return [];
      // 히트맵 데이터는 현재 시점만 있으므로, hpiData를 사용하여 시계열 데이터 생성
      const groupedByDate: Record<string, { sum: number; count: number }> = {};
      hpiData.forEach(item => {
        if (!groupedByDate[item.date]) {
          groupedByDate[item.date] = { sum: 0, count: 0 };
        }
        groupedByDate[item.date].sum += item.index_value;
        groupedByDate[item.date].count += 1;
      });
      return Object.entries(groupedByDate)
        .map(([date, data]) => ({
          date,
          index_value: data.sum / data.count,
          index_change_rate: null,
          region_name: '전국 평균',
          index_type: 'APT'
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } else {
      // 도/시별로 필터링 - 히트맵 데이터에서 해당 타입만 추출
      const filteredHeatmap = hpiHeatmapData.filter(item => {
        const cityType = getCityType(item.city_name);
        if (lineFilter === 'special') return cityType === 'special';
        if (lineFilter === 'metropolitan') return cityType === 'metropolitan';
        if (lineFilter === 'provinces') return cityType === 'province';
        return false;
      });

      // 각 도/시별로 hpiData에서 해당 지역의 시계열 데이터 찾기
      const result: Array<{ date: string; index_value: number; index_change_rate: number | null; region_name: string; index_type: string }> = [];
      
      filteredHeatmap.forEach(heatmapItem => {
        // 해당 도/시의 시계열 데이터 찾기
        // hpiData의 region_name이 city_name과 일치하거나 포함하는 경우 찾기
        const cityData = hpiData.filter(item => {
          if (!item.region_name) return false;
          // 정확한 매칭 또는 city_name이 region_name을 포함하는 경우
          // 예: city_name = "서울특별시", region_name = "서울특별시 강남구" -> 매칭
          return item.region_name === heatmapItem.city_name || 
                 item.region_name.startsWith(heatmapItem.city_name);
        });

        if (cityData.length > 0) {
          // 도/시별로 그룹화하여 평균 계산
          const groupedByDate: Record<string, { sum: number; count: number }> = {};
          cityData.forEach(item => {
            if (!groupedByDate[item.date]) {
              groupedByDate[item.date] = { sum: 0, count: 0 };
            }
            groupedByDate[item.date].sum += item.index_value;
            groupedByDate[item.date].count += 1;
          });

          Object.entries(groupedByDate).forEach(([date, data]) => {
            result.push({
              date,
              index_value: data.sum / data.count,
              index_change_rate: null,
              region_name: heatmapItem.city_name,
              index_type: 'APT'
            });
          });
        } else {
          // hpiData에 해당 도/시 데이터가 없는 경우, 히트맵 데이터의 값으로 시계열 생성
          // (현재 시점만 있으므로 단일 포인트로 생성)
          if (hpiHeatmapBaseYm) {
            const [year, month] = [hpiHeatmapBaseYm.substring(0, 4), hpiHeatmapBaseYm.substring(4, 6)];
            result.push({
              date: `${year}-${month}`,
              index_value: heatmapItem.index_value,
              index_change_rate: heatmapItem.index_change_rate,
              region_name: heatmapItem.city_name,
              index_type: 'APT'
            });
          }
        }
      });

      return result.sort((a, b) => {
        if (a.region_name !== b.region_name) {
          return a.region_name.localeCompare(b.region_name);
        }
        return a.date.localeCompare(b.date);
      });
    }
  })();

  // 분면별 색상 및 아이콘
  const getQuadrantStyle = (quadrant: number) => {
    const styles = {
      1: {
        color: isDarkMode ? '#4ade80' : '#22c55e', // 다크 모드에서 더 밝은 초록색
        bgColor: isDarkMode ? '' : 'bg-green-50',
        borderColor: isDarkMode ? 'border-zinc-800/50' : 'border-green-200',
        textColor: isDarkMode ? 'text-green-300' : 'text-green-600', // 다크 모드에서 더 밝게
        icon: TrendingUp,
      },
      2: {
        color: isDarkMode ? '#60a5fa' : '#3b82f6', // 다크 모드에서 더 밝은 파란색
        bgColor: isDarkMode ? '' : 'bg-blue-50',
        borderColor: isDarkMode ? 'border-zinc-800/50' : 'border-blue-200',
        textColor: isDarkMode ? 'text-blue-300' : 'text-blue-600', // 다크 모드에서 더 밝게
        icon: TrendingDown,
      },
      3: {
        color: isDarkMode ? '#f87171' : '#ef4444', // 다크 모드에서 더 밝은 빨간색
        bgColor: isDarkMode ? '' : 'bg-red-50',
        borderColor: isDarkMode ? 'border-zinc-800/50' : 'border-red-200',
        textColor: isDarkMode ? 'text-red-300' : 'text-red-600', // 다크 모드에서 더 밝게
        icon: TrendingDown,
      },
      4: {
        color: isDarkMode ? '#c084fc' : '#a855f7', // 다크 모드에서 더 밝은 보라색
        bgColor: isDarkMode ? '' : 'bg-purple-50',
        borderColor: isDarkMode ? 'border-zinc-800/50' : 'border-purple-200',
        textColor: isDarkMode ? 'text-purple-300' : 'text-purple-600', // 다크 모드에서 더 밝게
        icon: TrendingUp,
      },
    };
    return styles[quadrant as keyof typeof styles] || styles[1];
  };

  // D3.js로 4분면 차트 그리기
  useEffect(() => {
    if (!quadrantData.length || activeTab !== 'detail') {
      // 탭이 detail이 아니면 차트 제거
      if (quadrantSvgRef.current) {
        d3.select(quadrantSvgRef.current).selectAll('*').remove();
      }
      return;
    }

    // 차트 그리기 함수
    const drawChart = () => {
      if (!quadrantContainerRef.current || !quadrantSvgRef.current) return;
      
      const container = quadrantContainerRef.current;
      // 컨테이너 크기 확인 - 더 정확한 크기 측정
      const rect = container.getBoundingClientRect();
      const containerWidth = rect.width || container.clientWidth || container.offsetWidth || 800;
      const width = Math.max(containerWidth, 300);
      const height = isDesktop ? 550 : Math.max(window.innerHeight * 0.5, 400);
      
      const margin = { 
        top: 60, 
        right: Math.max(50, width * 0.1), 
        bottom: 80, 
        left: Math.max(70, width * 0.12) 
      };
      const chartWidth = Math.max(width - margin.left - margin.right, 200);
      const chartHeight = Math.max(height - margin.top - margin.bottom, 300);

      // 기존 SVG 내용 제거
      d3.select(quadrantSvgRef.current).selectAll('*').remove();

      const svg = d3.select(quadrantSvgRef.current)
        .attr('width', width)
        .attr('height', height);

      const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      // 스케일 설정
      const xExtent = d3.extent(quadrantData, d => d.sale_volume_change_rate) as [number, number];
      const yExtent = d3.extent(quadrantData, d => d.rent_volume_change_rate) as [number, number];
      
      const xPadding = Math.abs(xExtent[1] - xExtent[0]) * 0.15 || 10;
      const yPadding = Math.abs(yExtent[1] - yExtent[0]) * 0.15 || 10;

      const xScale = d3.scaleLinear()
        .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
        .range([0, chartWidth]);

      const yScale = d3.scaleLinear()
        .domain([yExtent[1] + yPadding, yExtent[0] - yPadding])
        .range([0, chartHeight]);

      // 축 색상
      const axisColor = isDarkMode ? '#94a3b8' : '#64748b';
      const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
      const textColor = isDarkMode ? '#e2e8f0' : '#1e293b';

      // 그리드 라인
      const xGrid = d3.axisBottom(xScale)
        .ticks(5)
        .tickSize(-chartHeight)
        .tickFormat(() => '');

      const yGrid = d3.axisLeft(yScale)
        .ticks(5)
        .tickSize(-chartWidth)
        .tickFormat(() => '');

      g.append('g')
        .attr('class', 'grid')
        .attr('transform', `translate(0,${chartHeight})`)
        .call(xGrid)
        .attr('stroke', gridColor)
        .attr('stroke-opacity', 0.3);

      g.append('g')
        .attr('class', 'grid')
        .call(yGrid)
        .attr('stroke', gridColor)
        .attr('stroke-opacity', 0.3);

      // 중앙선 (x=0, y=0)
      const zeroX = xScale(0);
      const zeroY = yScale(0);
      
      if (zeroX >= 0 && zeroX <= chartWidth) {
        g.append('line')
          .attr('x1', zeroX)
          .attr('x2', zeroX)
          .attr('y1', 0)
          .attr('y2', chartHeight)
          .attr('stroke', axisColor)
          .attr('stroke-width', 2.5)
          .attr('stroke-dasharray', '5,5')
          .attr('opacity', 0.6);
      }

      if (zeroY >= 0 && zeroY <= chartHeight) {
        g.append('line')
          .attr('x1', 0)
          .attr('x2', chartWidth)
          .attr('y1', zeroY)
          .attr('y2', zeroY)
          .attr('stroke', axisColor)
          .attr('stroke-width', 2.5)
          .attr('stroke-dasharray', '5,5')
          .attr('opacity', 0.6);
      }

      // 4분면 배경색 - 다크 모드에서 더 밝게
      const quadrantColors = {
        1: isDarkMode ? 'rgba(74, 222, 128, 0.12)' : 'rgba(34, 197, 94, 0.08)', // 더 밝은 초록색
        2: isDarkMode ? 'rgba(96, 165, 250, 0.12)' : 'rgba(59, 130, 246, 0.08)', // 더 밝은 파란색
        3: isDarkMode ? 'rgba(248, 113, 113, 0.12)' : 'rgba(239, 68, 68, 0.08)', // 더 밝은 빨간색
        4: isDarkMode ? 'rgba(192, 132, 252, 0.12)' : 'rgba(168, 85, 247, 0.08)', // 더 밝은 보라색
      };

      // 분면 배경 및 라벨
      // 주의: D3의 Y축은 위에서 아래로 증가하므로, y=0은 차트 중앙이 아니라 위쪽에 위치
      // 실제로는: y=0 (위쪽) → y=chartHeight (아래쪽)
      // 따라서 zeroY는 차트에서 y=0 (전월세 변화율 0)의 위치를 나타냄
      // 매매↑/전월세↑ (활성화)는 우상단, 매매↑/전월세↓ (매수 전환)는 우하단
      if (zeroX >= 0 && zeroX <= chartWidth && zeroY >= 0 && zeroY <= chartHeight) {
        // 4사분면 (활성화) - 매매↑ / 전월세↑ → 우상단 (x > 0, y < zeroY)
        g.append('rect')
          .attr('x', zeroX)
          .attr('y', 0)
          .attr('width', chartWidth - zeroX)
          .attr('height', zeroY)
          .attr('fill', quadrantColors[4]);

        // 2사분면 (임대 선호) - 매매↓ / 전월세↑ → 좌상단 (x < 0, y < zeroY)
        g.append('rect')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', zeroX)
          .attr('height', zeroY)
          .attr('fill', quadrantColors[2]);

        // 3사분면 (시장 위축) - 매매↓ / 전월세↓ → 좌하단 (x < 0, y > zeroY)
        g.append('rect')
          .attr('x', 0)
          .attr('y', zeroY)
          .attr('width', zeroX)
          .attr('height', chartHeight - zeroY)
          .attr('fill', quadrantColors[3]);

        // 1사분면 (매수 전환) - 매매↑ / 전월세↓ → 우하단 (x > 0, y > zeroY)
        g.append('rect')
          .attr('x', zeroX)
          .attr('y', zeroY)
          .attr('width', chartWidth - zeroX)
          .attr('height', chartHeight - zeroY)
          .attr('fill', quadrantColors[1]);

        // 분면 라벨
        const labelStyle = {
          fontSize: isDesktop ? '13px' : '11px',
          fontWeight: 'bold',
          fill: textColor,
        };

        const labelBgStyle = {
          fill: isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)',
          stroke: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.2)',
          strokeWidth: 1,
        };

        // 4사분면 라벨 (활성화) - 우상단
        const label4 = g.append('g')
          .attr('transform', `translate(${zeroX + 15}, 25)`);
        label4.append('rect')
          .attr('x', -8)
          .attr('y', -12)
          .attr('width', 100)
          .attr('height', 20)
          .attr('rx', 4)
          .attr('fill', labelBgStyle.fill)
          .attr('stroke', labelBgStyle.stroke)
          .attr('stroke-width', labelBgStyle.strokeWidth);
        label4.append('circle')
          .attr('cx', -3)
          .attr('cy', 0)
          .attr('r', 6)
          .attr('fill', isDarkMode ? '#c084fc' : '#a855f7');
        label4.append('text')
          .attr('x', 5)
          .attr('y', 0)
          .attr('style', `font-size: ${labelStyle.fontSize}; font-weight: ${labelStyle.fontWeight}; fill: ${labelStyle.fill}`)
          .text('4 활성화');

        // 2사분면 라벨 (좌상단)
        const label2 = g.append('g')
          .attr('transform', `translate(${zeroX - 15}, 25)`);
        label2.append('rect')
          .attr('x', -100)
          .attr('y', -12)
          .attr('width', 100)
          .attr('height', 20)
          .attr('rx', 4)
          .attr('fill', labelBgStyle.fill)
          .attr('stroke', labelBgStyle.stroke)
          .attr('stroke-width', labelBgStyle.strokeWidth);
        label2.append('circle')
          .attr('cx', -95)
          .attr('cy', 0)
          .attr('r', 6)
          .attr('fill', isDarkMode ? '#60a5fa' : '#3b82f6');
        label2.append('text')
          .attr('x', -87)
          .attr('y', 0)
          .attr('text-anchor', 'start')
          .attr('style', `font-size: ${labelStyle.fontSize}; font-weight: ${labelStyle.fontWeight}; fill: ${labelStyle.fill}`)
          .text('2 임대 선호');

        // 3사분면 라벨 (좌하단)
        const label3 = g.append('g')
          .attr('transform', `translate(${zeroX - 15},${chartHeight - 15})`);
        label3.append('rect')
          .attr('x', -100)
          .attr('y', -12)
          .attr('width', 100)
          .attr('height', 20)
          .attr('rx', 4)
          .attr('fill', labelBgStyle.fill)
          .attr('stroke', labelBgStyle.stroke)
          .attr('stroke-width', labelBgStyle.strokeWidth);
        label3.append('circle')
          .attr('cx', -95)
          .attr('cy', 0)
          .attr('r', 6)
          .attr('fill', isDarkMode ? '#f87171' : '#ef4444');
        label3.append('text')
          .attr('x', -87)
          .attr('y', 0)
          .attr('text-anchor', 'start')
          .attr('style', `font-size: ${labelStyle.fontSize}; font-weight: ${labelStyle.fontWeight}; fill: ${labelStyle.fill}`)
          .text('3 시장 위축');

        // 1사분면 라벨 (매수 전환) - 우하단
        const label1 = g.append('g')
          .attr('transform', `translate(${zeroX + 15},${chartHeight - 15})`);
        label1.append('rect')
          .attr('x', -8)
          .attr('y', -12)
          .attr('width', 100)
          .attr('height', 20)
          .attr('rx', 4)
          .attr('fill', labelBgStyle.fill)
          .attr('stroke', labelBgStyle.stroke)
          .attr('stroke-width', labelBgStyle.strokeWidth);
        label1.append('circle')
          .attr('cx', -3)
          .attr('cy', 0)
          .attr('r', 6)
          .attr('fill', isDarkMode ? '#4ade80' : '#22c55e');
        label1.append('text')
          .attr('x', 5)
          .attr('y', 0)
          .attr('style', `font-size: ${labelStyle.fontSize}; font-weight: ${labelStyle.fontWeight}; fill: ${labelStyle.fill}`)
          .text('1 매수 전환');
      }

      // 데이터 포인트 - 다크 모드에서 더 밝게
      const pointColors: Record<number, string> = {
        1: isDarkMode ? '#4ade80' : '#22c55e', // 더 밝은 초록색
        2: isDarkMode ? '#60a5fa' : '#3b82f6', // 더 밝은 파란색
        3: isDarkMode ? '#f87171' : '#ef4444', // 더 밝은 빨간색
        4: isDarkMode ? '#c084fc' : '#a855f7', // 더 밝은 보라색
      };

      // 데이터 포인트와 라벨 생성
      const points = g.selectAll('.point-group')
        .data(quadrantData)
        .enter()
        .append('g')
        .attr('class', 'point-group')
        .attr('transform', d => `translate(${xScale(d.sale_volume_change_rate)},${yScale(d.rent_volume_change_rate)})`);

      // 점
      points.append('circle')
        .attr('class', 'point')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', isDesktop ? 7 : 6)
        .attr('fill', d => pointColors[d.quadrant] || '#94a3b8')
        .attr('stroke', isDarkMode ? '#1e293b' : '#ffffff')
        .attr('stroke-width', 2.5)
        .attr('opacity', 0.85);

      // 날짜 라벨 - 항상 표시
      points.each(function(d) {
        const labelGroup = d3.select(this).append('g')
          .attr('class', 'date-label');
        
        const dateText = formatDate(d.date);
        const textSize = isDesktop ? 11 : 10;
        const padding = 5;
        const labelOffsetY = isDesktop ? -22 : -20;
        
        // 먼저 텍스트를 추가하여 크기 측정
        const textElement = labelGroup.append('text')
          .attr('x', 0)
          .attr('y', 0)
          .attr('text-anchor', 'middle')
          .attr('style', `font-size: ${textSize}px; font-weight: 600; fill: ${textColor}`)
          .text(dateText);
        
        // 텍스트 크기 측정
        const bbox = (textElement.node() as SVGTextElement)?.getBBox();
        const labelWidth = bbox ? Math.max(bbox.width + padding * 2, 50) : 70;
        const labelHeight = bbox ? bbox.height + padding * 2 : 20;
        
        // 배경 사각형을 텍스트 뒤에 삽입
        labelGroup.insert('rect', 'text')
          .attr('x', -labelWidth / 2)
          .attr('y', labelOffsetY - labelHeight / 2)
          .attr('width', labelWidth)
          .attr('height', labelHeight)
          .attr('fill', isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)')
          .attr('stroke', pointColors[d.quadrant])
          .attr('stroke-width', 1.5)
          .attr('rx', 4)
          .attr('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))');
        
        // 텍스트 위치 조정
        textElement.attr('y', labelOffsetY + 3);
      });

      // X축
      const xAxis = d3.axisBottom(xScale)
        .ticks(isDesktop ? 7 : 5)
        .tickFormat(d => `${d >= 0 ? '+' : ''}${d}%`);

      g.append('g')
        .attr('transform', `translate(0,${chartHeight})`)
        .call(xAxis)
        .attr('color', axisColor)
        .selectAll('text')
        .attr('fill', textColor)
        .attr('font-size', isDesktop ? '12px' : '11px');

      g.append('text')
        .attr('transform', `translate(${chartWidth / 2},${chartHeight + 50})`)
        .attr('text-anchor', 'middle')
        .attr('style', `font-size: ${isDesktop ? '13px' : '12px'}; font-weight: 600; fill: ${textColor}`)
        .text('매매 거래량 변화율 (%)');

      // Y축
      const yAxis = d3.axisLeft(yScale)
        .ticks(isDesktop ? 7 : 5)
        .tickFormat(d => `${d >= 0 ? '+' : ''}${d}%`);

      g.append('g')
        .call(yAxis)
        .attr('color', axisColor)
        .selectAll('text')
        .attr('fill', textColor)
        .attr('font-size', isDesktop ? '12px' : '11px');

      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -55)
        .attr('x', -chartHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('style', `font-size: ${isDesktop ? '13px' : '12px'}; font-weight: 600; fill: ${textColor}`)
        .text('전월세 거래량 변화율 (%)');

      // 중앙 교차점 표시
      if (zeroX >= 0 && zeroX <= chartWidth && zeroY >= 0 && zeroY <= chartHeight) {
        g.append('circle')
          .attr('cx', zeroX)
          .attr('cy', zeroY)
          .attr('r', 4)
          .attr('fill', axisColor)
          .attr('opacity', 0.5);
      }
    };

    // 초기 렌더링 - 탭이 detail일 때만 그리고, 약간의 지연을 두어 DOM이 준비된 후 그리기
    const timer = setTimeout(() => {
      if (activeTab === 'detail' && quadrantContainerRef.current && quadrantSvgRef.current) {
        drawChart();
      }
    }, 150);

    // 리사이즈 이벤트 핸들러
    const handleResize = () => {
      if (activeTab === 'detail') {
        drawChart();
      }
    };

    // IntersectionObserver로 컨테이너가 보일 때 차트 그리기
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && activeTab === 'detail') {
            setTimeout(() => drawChart(), 50);
          }
        });
      },
      { threshold: 0.1 }
    );

    if (quadrantContainerRef.current) {
      observer.observe(quadrantContainerRef.current);
    }

    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (quadrantContainerRef.current) {
        observer.unobserve(quadrantContainerRef.current);
      }
    };
  }, [quadrantData, isDarkMode, isDesktop, activeTab]);

  // HPI 꺾은선 그래프 옵션
  const hpiLineChartOptions: Highcharts.Options = {
    chart: {
      type: 'line',
      backgroundColor: 'transparent',
      height: isDesktop ? 450 : 380,
      spacingTop: 20,
      spacingRight: 20,
      spacingBottom: 20,
      spacingLeft: 20,
    },
    title: {
      text: '',
    },
    xAxis: {
      type: 'datetime',
      labels: {
        style: {
          color: isDarkMode ? '#e2e8f0' : '#475569',
          fontSize: '12px',
        },
        rotation: isDesktop ? -45 : -60,
        formatter: function() {
          const date = new Date(this.value);
          return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
        },
      },
      gridLineColor: isDarkMode ? '#334155' : '#e2e8f0',
    },
    yAxis: {
      title: {
        text: '지수 (2025년 3월 = 100)',
        style: {
          color: isDarkMode ? '#e2e8f0' : '#475569',
          fontSize: '13px',
          fontWeight: '600',
        },
      },
      labels: {
        style: {
          color: isDarkMode ? '#e2e8f0' : '#475569',
          fontSize: '12px',
        },
      },
      gridLineColor: isDarkMode ? '#334155' : '#e2e8f0',
      plotLines: [{
        value: 100,
        color: isDarkMode ? '#64748b' : '#94a3b8',
        width: 2.5,
        dashStyle: 'Dash',
        label: {
          text: '기준선 (100)',
          style: {
            color: isDarkMode ? '#94a3b8' : '#64748b',
            fontSize: '11px',
            fontWeight: '500',
          },
          align: 'right',
          x: -10,
        },
      }],
    },
    tooltip: {
      backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
      borderColor: isDarkMode ? '#334155' : '#e2e8f0',
      borderRadius: 8,
      style: {
        color: isDarkMode ? '#e2e8f0' : '#475569',
        fontSize: '12px',
      },
      formatter: function() {
        const point = this.point as any;
        const dateStr = point.date || (() => {
          const date = new Date(point.x);
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        })();
        const [year, month] = dateStr.split('-');
        return `
          <div style="padding: 4px 0;">
            <b style="font-size: 13px; color: ${isDarkMode ? '#e2e8f0' : '#1e293b'};">${year}년 ${parseInt(month)}월</b><br/>
            <span style="color: ${isDarkMode ? '#f59e0b' : '#d97706'}; font-weight: 600;">지수: ${point.index_value.toFixed(2)}</span><br/>
            <span style="font-size: 11px; color: ${isDarkMode ? '#94a3b8' : '#64748b'};">
              지역: ${point.region_name || '전국 평균'}
            </span>
          </div>
        `;
      },
    },
    legend: {
      enabled: lineFilter !== 'all',
      itemStyle: {
        color: isDarkMode ? '#e2e8f0' : '#475569',
        fontSize: '12px',
      },
    },
    series: (() => {
      if (lineFilter === 'all') {
        return [{
          name: '전국 평균',
          type: 'line',
          data: filteredLineData.map(d => {
            const [year, month] = d.date.split('-');
            return {
              x: new Date(parseInt(year), parseInt(month) - 1).getTime(),
              y: d.index_value,
              date: d.date,
              index_value: d.index_value,
              region_name: d.region_name,
            };
          }),
          color: '#f59e0b',
          lineWidth: 3,
          marker: {
            radius: 5,
            fillColor: '#f59e0b',
            lineWidth: 2,
            lineColor: '#ffffff',
          },
        }];
      } else {
        // 도/시별로 시리즈 분리
        const cityGroups: Record<string, typeof filteredLineData> = {};
        filteredLineData.forEach(item => {
          const cityName = item.region_name || '기타';
          if (!cityGroups[cityName]) {
            cityGroups[cityName] = [];
          }
          cityGroups[cityName].push(item);
        });

        const colors = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];
        return Object.entries(cityGroups).map(([cityName, data], index) => ({
          name: cityName,
          type: 'line' as const,
          data: data.map(d => {
            const [year, month] = d.date.split('-');
            return {
              x: new Date(parseInt(year), parseInt(month) - 1).getTime(),
              y: d.index_value,
              date: d.date,
              index_value: d.index_value,
              region_name: d.region_name,
            };
          }),
          color: colors[index % colors.length],
          lineWidth: 2.5,
          marker: {
            radius: 4,
            fillColor: colors[index % colors.length],
            lineWidth: 2,
            lineColor: '#ffffff',
          },
        }));
      }
    })(),
    credits: {
      enabled: false,
    },
  };

  // HighChart 옵션
  const rvolChartOptions: Highcharts.Options = {
    chart: {
      type: 'line',
      backgroundColor: 'transparent',
      height: isDesktop ? 450 : 380,
      spacingTop: 20,
      spacingRight: 20,
      spacingBottom: 20,
      spacingLeft: 20,
    },
    title: {
      text: '',
    },
    xAxis: {
      type: 'datetime',
      labels: {
        style: {
          color: isDarkMode ? '#e2e8f0' : '#475569',
          fontSize: '12px',
        },
      },
      gridLineColor: isDarkMode ? '#334155' : '#e2e8f0',
    },
    yAxis: {
      title: {
        text: 'RVOL',
        style: {
          color: isDarkMode ? '#e2e8f0' : '#475569',
          fontSize: '13px',
          fontWeight: '600',
        },
      },
      labels: {
        style: {
          color: isDarkMode ? '#e2e8f0' : '#475569',
          fontSize: '12px',
        },
      },
      gridLineColor: isDarkMode ? '#334155' : '#e2e8f0',
      plotLines: [{
        value: 1,
        color: isDarkMode ? '#64748b' : '#94a3b8',
        width: 2.5,
        dashStyle: 'Dash',
        label: {
          text: 'RVOL = 1 (평균)',
          style: {
            color: isDarkMode ? '#94a3b8' : '#64748b',
            fontSize: '11px',
            fontWeight: '500',
          },
          align: 'right',
          x: -10,
        },
      }],
    },
    tooltip: {
      backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
      borderColor: isDarkMode ? '#334155' : '#e2e8f0',
      borderRadius: 8,
      style: {
        color: isDarkMode ? '#e2e8f0' : '#475569',
        fontSize: '12px',
      },
      formatter: function() {
        const point = this.point as any;
        return `
          <div style="padding: 4px 0;">
            <b style="font-size: 13px; color: ${isDarkMode ? '#e2e8f0' : '#1e293b'};">${point.date}</b><br/>
            <span style="color: ${isDarkMode ? '#60a5fa' : '#2563eb'}; font-weight: 600;">RVOL: ${point.rvol.toFixed(2)}</span><br/>
            <span style="font-size: 11px; color: ${isDarkMode ? '#94a3b8' : '#64748b'};">
              현재 거래량: ${point.current_volume.toLocaleString()}건<br/>
              평균 거래량: ${point.average_volume.toFixed(2)}건
            </span>
          </div>
        `;
      },
    },
    legend: {
      itemStyle: {
        color: isDarkMode ? '#e2e8f0' : '#475569',
        fontSize: '12px',
      },
    },
    series: [{
      name: 'RVOL',
      type: 'line',
      data: rvolData.map(d => ({
        x: new Date(d.date).getTime(),
        y: d.rvol,
        date: d.date,
        current_volume: d.current_volume,
        average_volume: d.average_volume,
        rvol: d.rvol,
      })),
      color: '#3b82f6',
      lineWidth: 3,
      marker: {
        radius: 5,
        fillColor: '#3b82f6',
        lineWidth: 2,
        lineColor: '#ffffff',
      },
    }],
    credits: {
      enabled: false,
    },
  };

  if (loading) {
    return (
      <div className={`w-full max-w-7xl mx-auto ${isDesktop ? 'px-8' : 'px-4'} ${isDesktop ? 'py-12' : 'py-6'} ${isDesktop ? 'space-y-10' : 'space-y-6'}`}>
        <div className={`rounded-2xl p-5 ${cardClass} flex items-center justify-center ${isDesktop ? 'h-80' : 'h-64'}`}>
          <div className="text-center">
            <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${isDarkMode ? 'border-blue-400' : 'border-blue-600'} mx-auto mb-4`}></div>
            <p className={textSecondary}>데이터를 불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`w-full max-w-7xl mx-auto ${isDesktop ? 'px-8' : 'px-4'} ${isDesktop ? 'py-12' : 'py-6'} ${isDesktop ? 'space-y-10' : 'space-y-6'}`}>
        <div className={`rounded-2xl p-5 ${cardClass}`}>
          <div className="text-center">
            <p className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>오류가 발생했습니다</p>
            <p className={`text-sm ${textSecondary}`}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // 최근 6개월 데이터를 날짜순으로 정렬 (최신순)
  const sortedQuadrantData = [...quadrantData].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA; // 최신순
  });

  return (
    <div className={`space-y-6 pb-10 ${isDesktop ? 'max-w-full' : ''}`}>
      {/* RVOL 차트 */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-zinc-800/50' : 'bg-blue-50'}`}>
              <Activity className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-blue-600'}`} stroke={isDarkMode ? '#ffffff' : '#2563eb'} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${textPrimary} mb-1`}>상대 거래량 (RVOL)</h2>
              <p className={`text-sm ${textSecondary}`}>{period}</p>
            </div>
          </div>
        </div>
        
        {/* RVOL 설명 */}
        <div className={`mb-6 p-4 rounded-xl ${bgSecondary} border ${isDarkMode ? 'border-zinc-800/50' : 'border-slate-200'}`}>
          <div className="flex items-start gap-2 mb-3">
            <Info className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isDarkMode ? 'text-white' : 'text-blue-600'}`} stroke={isDarkMode ? '#ffffff' : '#2563eb'} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${textPrimary} mb-2`}>RVOL이란?</p>
              <p className={`text-xs leading-relaxed ${textSecondary} mb-3`}>
                현재 거래량을 과거 평균 거래량으로 나눈 값입니다. RVOL이 1보다 크면 평소보다 거래가 활발하고, 
                1보다 작으면 거래가 한산한 상태를 의미합니다.
              </p>
              <div className={`flex flex-wrap gap-3 text-xs ${textSecondary}`}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0"></div>
                  <span className={textSecondary}>RVOL &gt; 1: 평소보다 거래 활발</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400 flex-shrink-0"></div>
                  <span className={textSecondary}>RVOL = 1: 평소와 비슷</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400 flex-shrink-0"></div>
                  <span className={textSecondary}>RVOL &lt; 1: 평소보다 거래 한산</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <HighchartsReact
          highcharts={Highcharts}
          options={rvolChartOptions}
        />
      </div>

      {/* 4분면 분류 차트 */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-zinc-800/50' : 'bg-purple-50'}`}>
              <BarChart3 className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-purple-600'}`} stroke={isDarkMode ? '#ffffff' : '#9333ea'} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${textPrimary} mb-1`}>국면 4분면 분류</h2>
              <p className={`text-sm ${textSecondary}`}>최근 6개월 매매/전월세 거래량 변화율 분석</p>
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className={`flex gap-2 p-1.5 rounded-2xl mb-6 ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
          <button
            onClick={() => setActiveTab('basic')}
            className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'basic'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                : isDarkMode
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            기본
          </button>
          <button
            onClick={() => setActiveTab('detail')}
            className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'detail'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                : isDarkMode
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            자세히
          </button>
        </div>

          {/* 기본 탭 - 월별 리스트 */}
          <AnimatePresence mode="wait">
            {activeTab === 'basic' && (
              <motion.div
                key="basic"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={isDesktop ? 'grid grid-cols-2 gap-3' : 'space-y-3'}
              >
                {sortedQuadrantData.length > 0 ? (
                  sortedQuadrantData.map((point, index) => {
                    const style = getQuadrantStyle(point.quadrant);
                    const Icon = style.icon;
                    
                    return (
                      <div
                        key={`${point.date}-${index}`}
                        className="flex items-center justify-between py-3 px-4 rounded-lg"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`p-1.5 rounded ${isDarkMode ? 'bg-zinc-800/50' : 'bg-white/50'}`}>
                            <Icon className={`w-4 h-4 ${isDarkMode ? 'text-white' : style.textColor}`} stroke={isDarkMode ? '#ffffff' : style.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${textPrimary} mb-0.5`} style={{ color: isDarkMode ? '#f1f5f9' : undefined }}>
                              {formatDate(point.date)}
                            </p>
                            <p className={`text-xs ${textSecondary}`} style={{ color: isDarkMode ? '#94a3b8' : undefined }}>
                              매매 {point.sale_volume_change_rate >= 0 ? '+' : ''}{point.sale_volume_change_rate.toFixed(1)}% / 
                              전월세 {point.rent_volume_change_rate >= 0 ? '+' : ''}{point.rent_volume_change_rate.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                        <div className="flex-shrink-0 ml-4">
                          <div 
                            className="px-4 py-2 rounded-lg font-semibold text-sm"
                            style={{ 
                              backgroundColor: isDarkMode ? style.color : `${style.color}15`,
                              color: isDarkMode ? '#ffffff' : style.color,
                            }}
                          >
                            {point.quadrant_label}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={`text-center py-8 ${textSecondary}`}>
                    <p className={textSecondary}>데이터가 없습니다.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 자세히 탭 */}
          <AnimatePresence mode="wait">
            {activeTab === 'detail' && (
              <motion.div
                key="detail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* 4분면 설명 */}
                <div className={`mb-6 rounded-xl ${bgSecondary} border ${isDarkMode ? 'border-zinc-800/50' : 'border-slate-200'} overflow-hidden`}>
                  <div 
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-opacity-50 transition-colors"
                    onClick={() => setIsQuadrantInfoExpanded(!isQuadrantInfoExpanded)}
                  >
                    <div className="flex items-center gap-2">
                      <Info className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? 'text-white' : 'text-purple-600'}`} stroke={isDarkMode ? '#ffffff' : '#9333ea'} />
                      <p className={`text-sm font-semibold ${textPrimary}`} style={{ color: isDarkMode ? '#f1f5f9' : undefined }}>4분면 분류란?</p>
                    </div>
                    {isQuadrantInfoExpanded ? (
                      <ChevronUp className={`w-4 h-4 ${isDarkMode ? 'text-white' : 'text-slate-600'}`} stroke={isDarkMode ? '#ffffff' : '#475569'} />
                    ) : (
                      <ChevronDown className={`w-4 h-4 ${isDarkMode ? 'text-white' : 'text-slate-600'}`} stroke={isDarkMode ? '#ffffff' : '#475569'} />
                    )}
                  </div>
                  
                  <AnimatePresence>
                    {isQuadrantInfoExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4">
                          <p className={`text-xs leading-relaxed ${textSecondary} mb-4`} style={{ color: isDarkMode ? '#94a3b8' : undefined }}>
                            매매 거래량과 전월세 거래량의 변화율을 기준으로 부동산 시장의 국면을 4가지로 분류합니다. 
                            각 분면은 시장의 다른 특성을 나타냅니다.
                          </p>
                          <div className="space-y-2">
                            {[1, 2, 3, 4].map((quadrant) => {
                              const style = getQuadrantStyle(quadrant);
                              const Icon = style.icon;
                              const labels = {
                                1: { title: '1 매수 전환', desc: '매매↑ / 전월세↓', detail: '사는 쪽으로 이동' },
                                2: { title: '2 임대 선호', desc: '매매↓ / 전월세↑', detail: '빌리는 쪽으로 이동' },
                                3: { title: '3 시장 위축', desc: '매매↓ / 전월세↓', detail: '전체 유동성 경색' },
                                4: { title: '4 활성화', desc: '매매↑ / 전월세↑', detail: '수요 자체가 강함' },
                              };
                              const label = labels[quadrant as keyof typeof labels];
                              
                              return (
                                <div key={quadrant} className="flex items-start gap-3 py-2">
                                  <div className={`p-1.5 rounded ${isDarkMode ? 'bg-zinc-800/50' : 'bg-white/50'} flex-shrink-0`}>
                                    <Icon className={`w-4 h-4 ${isDarkMode ? 'text-white' : style.textColor}`} stroke={isDarkMode ? '#ffffff' : style.color} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-semibold ${style.textColor} mb-0.5`} style={{ color: isDarkMode ? style.color : undefined }}>
                                      {label.title}
                                    </p>
                                    <p className={`text-xs ${textSecondary} mb-0.5`} style={{ color: isDarkMode ? '#94a3b8' : undefined }}>
                                      {label.desc}
                                    </p>
                                    <p className={`text-xs ${textTertiary}`} style={{ color: isDarkMode ? '#64748b' : undefined }}>
                                      {label.detail}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 그래프 설명 */}
                <div className={`mb-4 p-3 rounded-lg ${bgSecondary} border ${isDarkMode ? 'border-zinc-800/50' : 'border-slate-200'}`}>
                  <div className="flex items-start gap-2">
                    <Lightbulb className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isDarkMode ? 'text-white' : 'text-yellow-600'}`} stroke={isDarkMode ? '#ffffff' : '#ca8a04'} />
                    <p className={`text-xs ${textSecondary} leading-relaxed break-words`} style={{ color: isDarkMode ? '#94a3b8' : undefined }}>
                      <span className={`font-semibold ${textSecondary}`} style={{ color: isDarkMode ? '#94a3b8' : undefined }}>읽는 방법:</span> 그래프의 각 점은 월별 데이터를 나타냅니다. 
                      점의 위치에 따라 해당 월의 시장 국면을 파악할 수 있습니다. 점에 마우스를 올리면 상세 정보를 확인할 수 있습니다.
                    </p>
                  </div>
                </div>

                <div ref={quadrantContainerRef} className="w-full overflow-x-auto overflow-y-visible" style={{ minHeight: isDesktop ? '550px' : '400px' }}>
                  <svg ref={quadrantSvgRef} className="w-full" style={{ minHeight: isDesktop ? '550px' : '400px' }}></svg>
                </div>

                {summary && (
                  <div className={`mt-6 p-4 rounded-xl ${bgSecondary} border ${isDarkMode ? 'border-zinc-800/50' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className={`w-4 h-4 ${isDarkMode ? 'text-white' : 'text-purple-600'}`} stroke={isDarkMode ? '#ffffff' : '#9333ea'} />
                      <p className={`text-sm font-semibold ${textPrimary}`} style={{ color: isDarkMode ? '#f1f5f9' : undefined }}>분면 분포 요약</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[1, 2, 3, 4].map((quadrant) => {
                        const style = getQuadrantStyle(quadrant);
                        const labels = {
                          1: '매수 전환',
                          2: '임대 선호',
                          3: '시장 위축',
                          4: '활성화',
                        };
                        
                        return (
                          <div key={quadrant} className="text-center">
                            <p className={`text-2xl font-bold ${style.textColor} mb-1`} style={{ color: isDarkMode ? style.color : undefined }}>
                              {summary.quadrant_distribution[quadrant] || 0}
                            </p>
                            <p className={`text-xs ${textSecondary}`} style={{ color: isDarkMode ? '#94a3b8' : undefined }}>{labels[quadrant as keyof typeof labels]}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
      </div>

      {/* 주택가격지수(HPI) 차트 */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-zinc-800/50' : 'bg-amber-50'}`}>
              <TrendingUp className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-amber-600'}`} stroke={isDarkMode ? '#ffffff' : '#d97706'} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${textPrimary} mb-1`}>주택가격지수 (HPI)</h2>
              <p className={`text-sm ${textSecondary}`} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                기준: 2025년 3월 = 100
              </p>
            </div>
          </div>
        </div>

        {/* 히트맵/꺾은선 탭 */}
        <div className={`flex gap-2 p-1.5 rounded-2xl mb-6 ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
          <button
            onClick={() => setHpiViewMode('heatmap')}
            className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
              hpiViewMode === 'heatmap'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                : isDarkMode
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            히트맵
          </button>
          <button
            onClick={() => setHpiViewMode('line')}
            className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
              hpiViewMode === 'line'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                : isDarkMode
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            꺾은선
          </button>
        </div>
        
        {/* HPI 설명 */}
        <div className={`mb-6 rounded-xl ${bgSecondary} border ${isDarkMode ? 'border-zinc-800/50' : 'border-slate-200'} overflow-hidden`}>
          <div 
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-opacity-50 transition-colors"
            onClick={() => setIsHpiInfoExpanded(!isHpiInfoExpanded)}
          >
            <div className="flex items-center gap-2">
              <Info className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? 'text-white' : 'text-amber-600'}`} stroke={isDarkMode ? '#ffffff' : '#d97706'} />
              <p className={`text-sm font-semibold ${textPrimary}`} style={{ color: isDarkMode ? '#f1f5f9' : undefined }}>주택가격지수란?</p>
            </div>
            {isHpiInfoExpanded ? (
              <ChevronUp className={`w-4 h-4 ${isDarkMode ? 'text-white' : 'text-slate-600'}`} stroke={isDarkMode ? '#ffffff' : '#475569'} />
            ) : (
              <ChevronDown className={`w-4 h-4 ${isDarkMode ? 'text-white' : 'text-slate-600'}`} stroke={isDarkMode ? '#ffffff' : '#475569'} />
            )}
          </div>
          
          <AnimatePresence>
            {isHpiInfoExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4">
                  <p className={`text-xs leading-relaxed ${textSecondary} mb-3`} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                    주택가격지수(Housing Price Index, HPI)는 2025년 3월의 주택 가격을 기준(100)으로 잡고, 이후 가격이 얼마나 변했는지를 수치화한 통계 지표입니다. 
                    단순히 "집값이 올랐다"는 느낌을 넘어, 시장 전체의 가격 흐름을 객관적인 데이터로 보여주는 역할을 합니다.
                  </p>
                  
                  <div className="space-y-3 text-xs">
                    <div>
                      <p className={`font-semibold ${textPrimary} mb-1.5`} style={{ color: isDarkMode ? '#f1f5f9' : undefined }}>주택가격지수의 종류</p>
                      <div className="space-y-1.5 pl-2">
                        <p className={textSecondary} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                          <span className="font-medium" style={{ color: isDarkMode ? '#e2e8f0' : undefined }}>한국부동산원 지수:</span> 공공기관 전문 조사원이 보수적으로 평가한 가격 기준
                        </p>
                        <p className={textSecondary} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                          <span className="font-medium" style={{ color: isDarkMode ? '#e2e8f0' : undefined }}>KB 주택가격지수:</span> 일선 중개업소에서 입력한 '호가'와 '시세' 기준, 시장 반응이 빠르고 체감도가 높음
                        </p>
                        <p className={textSecondary} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                          <span className="font-medium" style={{ color: isDarkMode ? '#e2e8f0' : undefined }}>실거래가격지수:</span> 실제로 신고된 '거래 가격'만을 집계, 정확도는 가장 높으나 시차가 발생
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className={`font-semibold ${textPrimary} mb-1.5`} style={{ color: isDarkMode ? '#f1f5f9' : undefined }}>지수 변화의 의미</p>
                      <div className="space-y-1.5 pl-2">
                        <div className="flex items-start gap-1.5">
                          <TrendingUp className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                          <p className={textSecondary} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                            <span className={`font-medium ${isDarkMode ? 'text-green-300' : 'text-green-600'}`}>지수 상승:</span> 자산 효과, 인플레이션 반영, 금리 하락 가능성 등으로 시장 과열 및 자산 가치 상승
                          </p>
                        </div>
                        <div className="flex items-start gap-1.5">
                          <TrendingDown className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
                          <p className={textSecondary} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                            <span className={`font-medium ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>지수 하락:</span> 역자산 효과, 금리 인상 영향, 깡통전세 리스크 등으로 경기 위축 및 리스크 증가
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className={`font-semibold ${textPrimary} mb-1.5`} style={{ color: isDarkMode ? '#f1f5f9' : undefined }}>지수 계산법</p>
                      <p className={`${textSecondary} pl-2`} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                        기준점: 2025년 3월 = 100<br/>
                        변동률(%) = (비교시점 지수 - 기준시점 지수) / 기준시점 지수 × 100<br/>
                        <span className={textTertiary} style={{ color: isDarkMode ? '#94a3b8' : undefined }}>
                          예: 2025년 3월 지수 100 → 현재 105 = 5% 상승
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 히트맵 뷰 */}
        {hpiViewMode === 'heatmap' && (
          <>
            {/* 히트맵 필터 */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {(['all', 'special', 'metropolitan', 'provinces'] as const).map((filter) => {
                const labels = {
                  all: '전국',
                  special: '특별시',
                  metropolitan: '광역시',
                  provinces: '도'
                };
                return (
                  <button
                    key={filter}
                    onClick={() => setHeatmapFilter(filter)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      heatmapFilter === filter
                        ? isDarkMode
                          ? 'bg-sky-600 text-white shadow-lg shadow-sky-500/30'
                          : 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                        : isDarkMode
                        ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                    }`}
                  >
                    {labels[filter]}
                  </button>
                );
              })}
            </div>

            {filteredHeatmapData.length > 0 ? (
              <div>
                {hpiHeatmapBaseYm && (
                  <p className={`text-xs font-medium mb-4 ${textSecondary}`} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                    현재: {hpiHeatmapBaseYm.substring(0, 4)}년 {parseInt(hpiHeatmapBaseYm.substring(4, 6))}월
                  </p>
                )}
                
                {/* 히트맵 그리드 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {(() => {
                    // 지수 값 기준으로 정렬 (내림차순)
                    const sortedData = [...filteredHeatmapData].sort((a, b) => b.index_value - a.index_value);
                
                return sortedData.map((item, index) => {
                  const totalItems = sortedData.length;
                  const rank = index + 1;
                  
                  // 100 이상인 항목 수 계산
                  const above100Count = sortedData.filter(d => d.index_value >= 100).length;
                  
                  // 색상 계산: 순위 기반 그라데이션
                  let bgColor, borderColor, textColor, valueColor;
                  
                  if (item.index_value >= 100) {
                    // 상승세: 빨간색 계열 (1순위가 가장 진한 빨강)
                    const ratio = rank / above100Count; // 0~1 사이 값
                    if (isDarkMode) {
                      // 다크 모드: 밝은 빨강에서 옅은 빨강으로
                      const redIntensity = Math.max(200, 255 - (ratio * 100)); // 255~200
                      bgColor = `rgba(${redIntensity}, 50, 50, 0.3)`;
                      borderColor = `rgba(${redIntensity}, 100, 100, 0.6)`;
                      textColor = `rgb(${Math.min(255, redIntensity + 50)}, ${Math.min(255, 100 + ratio * 50)}, ${Math.min(255, 100 + ratio * 50)})`;
                      valueColor = `rgb(${Math.min(255, redIntensity + 30)}, ${Math.min(255, 80 + ratio * 40)}, ${Math.min(255, 80 + ratio * 40)})`;
                    } else {
                      // 라이트 모드: 진한 빨강에서 옅은 빨강으로
                      const redIntensity = Math.max(150, 255 - (ratio * 80)); // 255~150
                      bgColor = `rgba(${redIntensity}, 100, 100, 0.15)`;
                      borderColor = `rgb(${redIntensity}, 150, 150)`;
                      textColor = `rgb(${Math.max(100, redIntensity - 50)}, 0, 0)`;
                      valueColor = `rgb(${Math.max(120, redIntensity - 30)}, 0, 0)`;
                    }
                  } else {
                    // 하강세: 파란색 계열 (100에 가까울수록 옅은 파랑, 낮을수록 진한 파랑)
                    const below100Data = sortedData.filter(d => d.index_value < 100);
                    const below100Index = below100Data.findIndex(d => d.city_name === item.city_name);
                    const below100Ratio = below100Index / (below100Data.length - 1 || 1); // 0~1
                    
                    if (isDarkMode) {
                      // 다크 모드: 옅은 파랑(하늘색)에서 진한 파랑으로
                      const blueIntensity = 100 + (below100Ratio * 100); // 100~200
                      const skyBlue = 180 + (below100Ratio * 50); // 180~230
                      bgColor = `rgba(50, ${skyBlue}, ${blueIntensity + 50}, 0.4)`;
                      borderColor = `rgba(100, ${skyBlue + 30}, ${blueIntensity + 80}, 0.7)`;
                      textColor = `rgb(150, ${skyBlue}, ${blueIntensity + 50})`;
                      valueColor = `rgb(120, ${skyBlue - 20}, ${blueIntensity + 30})`;
                    } else {
                      // 라이트 모드: 옅은 파랑에서 진한 파랑으로
                      const blueIntensity = 150 + (below100Ratio * 80); // 150~230
                      const skyBlue = 200 + (below100Ratio * 30); // 200~230
                      bgColor = `rgba(150, ${skyBlue}, ${blueIntensity}, 0.2)`;
                      borderColor = `rgb(100, ${skyBlue - 30}, ${blueIntensity - 30})`;
                      textColor = `rgb(0, ${Math.max(50, skyBlue - 100)}, ${Math.max(100, blueIntensity - 50)})`;
                      valueColor = `rgb(0, ${Math.max(30, skyBlue - 120)}, ${Math.max(80, blueIntensity - 70)})`;
                    }
                  }
                  
                  return (
                    <div
                      key={item.city_name}
                      className="p-4 rounded-lg border-2 transition-all hover:scale-105 cursor-pointer shadow-md"
                      style={{
                        backgroundColor: bgColor,
                        borderColor: borderColor,
                      }}
                      title={`${item.city_name}: ${item.index_value.toFixed(2)} (${item.index_change_rate !== null ? (item.index_change_rate >= 0 ? '+' : '') + item.index_change_rate.toFixed(2) : 'N/A'}) | 순위: ${rank}위`}
                    >
                      <p 
                        className="text-sm font-bold mb-2 truncate" 
                        style={{ color: textColor }}
                        title={item.city_name}
                      >
                        {item.city_name.replace('특별시', '').replace('광역시', '').replace('특별자치시', '').replace('특별자치도', '').replace('도', '')}
                      </p>
                      <p 
                        className="text-2xl font-extrabold mb-1" 
                        style={{ color: valueColor }}
                      >
                        {item.index_value.toFixed(1)}
                      </p>
                      {item.index_change_rate !== null && (
                        <p 
                          className="text-xs font-semibold" 
                          style={{ color: isDarkMode ? '#cbd5e1' : '#64748b' }}
                        >
                          {item.index_change_rate >= 0 ? '+' : ''}{item.index_change_rate.toFixed(2)}
                        </p>
                      )}
                    </div>
                  );
                });
                  })()}
                </div>
                
                {/* 범례 */}
                <div className={`mt-4 p-3 rounded-lg ${bgSecondary} border ${isDarkMode ? 'border-zinc-700/50' : 'border-slate-200'}`}>
                  <p className={`text-xs font-semibold mb-2 ${textPrimary}`} style={{ color: isDarkMode ? '#f1f5f9' : undefined }}>
                    색상 범례 (2025년 3월 = 100 기준)
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded border-2" 
                        style={{ 
                          backgroundColor: isDarkMode ? 'rgba(255, 50, 50, 0.3)' : 'rgba(255, 150, 150, 0.2)',
                          borderColor: isDarkMode ? 'rgba(255, 100, 100, 0.6)' : 'rgb(255, 150, 150)'
                        }}
                      ></div>
                      <span className={textSecondary} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>상승세 (100 이상)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded border-2" 
                        style={{ 
                          backgroundColor: isDarkMode ? 'rgba(50, 200, 250, 0.4)' : 'rgba(150, 220, 250, 0.2)',
                          borderColor: isDarkMode ? 'rgba(100, 210, 250, 0.7)' : 'rgb(100, 200, 250)'
                        }}
                      ></div>
                      <span className={textSecondary} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>하강세 (100 미만)</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`text-center py-8 ${textSecondary}`} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                <p>선택한 필터에 해당하는 데이터가 없습니다.</p>
              </div>
            )}
          </>
        )}

        {/* 꺾은선 그래프 뷰 */}
        {hpiViewMode === 'line' && (
          <>
            {/* 꺾은선 필터 드롭다운 */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative">
                <button
                  onClick={() => setIsLineDropdownOpen(!isLineDropdownOpen)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1 ${
                    lineFilter !== 'all'
                      ? isDarkMode
                        ? 'bg-sky-900/30 text-sky-400 border border-sky-700'
                        : 'bg-sky-100 text-sky-600 border border-sky-300'
                      : isDarkMode
                      ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  {lineFilter === 'all' ? '전국' : lineFilter === 'special' ? '특별시' : lineFilter === 'metropolitan' ? '광역시' : '도'}
                  {isLineDropdownOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                <AnimatePresence>
                  {isLineDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`absolute top-full left-0 mt-1 border rounded-lg shadow-lg z-10 min-w-[120px] ${
                        isDarkMode 
                          ? 'bg-zinc-800 border-zinc-700' 
                          : 'bg-white border-zinc-200'
                      }`}
                    >
                      {(['all', 'special', 'metropolitan', 'provinces'] as const).map((filter) => {
                        const labels = {
                          all: '전국',
                          special: '특별시',
                          metropolitan: '광역시',
                          provinces: '도'
                        };
                        return (
                          <button
                            key={filter}
                            onClick={() => {
                              setLineFilter(filter);
                              setIsLineDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm ${
                              lineFilter === filter
                                ? isDarkMode
                                  ? 'bg-sky-900/20 text-sky-400'
                                  : 'bg-sky-50 text-sky-600'
                                : isDarkMode
                                ? 'text-zinc-300 hover:bg-zinc-700'
                                : 'text-zinc-700 hover:bg-zinc-100'
                            }`}
                          >
                            {labels[filter]}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {filteredLineData.length > 0 ? (
              <HighchartsReact
                highcharts={Highcharts}
                options={hpiLineChartOptions}
              />
            ) : (
              <div className={`text-center py-8 ${textSecondary}`} style={{ color: isDarkMode ? '#cbd5e1' : undefined }}>
                <p>선택한 필터에 해당하는 데이터가 없습니다.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
