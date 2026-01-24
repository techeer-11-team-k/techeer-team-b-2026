import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card } from '../ui/Card';
import { ChevronDown, BarChart3, Grid2X2, ArrowLeft, Info, Calendar } from 'lucide-react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { KoreaHexMap, RegionType } from '../ui/KoreaHexMap';
import { MigrationSankey } from '../ui/MigrationSankey';
import { aggregateMigrationData } from '../charts/migrationUtils';
import { ToggleButtonGroup } from '../ui/ToggleButtonGroup';

import {
  fetchHPIByRegionType,
  HPIRegionTypeDataPoint,
  fetchTransactionVolume,
  TransactionVolumeDataPoint as ApiTransactionVolumeDataPoint,
  fetchPopulationFlow,
  SankeyNode,
  SankeyLink,
  fetchQuadrant,
  QuadrantDataPoint
} from '../../services/api';


// 거래량 데이터 타입
interface TransactionVolumeDataPoint {
  period: string;
  value: number;
  [key: string]: string | number; // 년도별 데이터를 위한 동적 키
}

const getYearColor = (year: number, totalYears: number) => {
  const currentYear = 2025;
  const yearIndex = currentYear - year;
  // 최신 연도일수록 진한 파란색, 오래될수록 연하게
  const opacity = 0.4 + ((totalYears - 1 - yearIndex) / (totalYears - 1)) * 0.6;
  return `rgba(49, 130, 246, ${opacity})`;
};

// 확장된 지역 타입 (서울 포함)
type ExtendedRegionType = RegionType | '서울특별시' | '기타';

export const HousingDemand: React.FC = () => {
  const [viewMode, setViewMode] = useState<'yearly' | 'monthly'>('monthly');
  const [yearRange, setYearRange] = useState<2 | 3 | 5>(3);
  
  // 독립적인 지역 선택 상태 관리
  const [transactionRegion, setTransactionRegion] = useState<ExtendedRegionType>('전국');
  const [hpiRegion, setHpiRegion] = useState<ExtendedRegionType>('전국');
  
  // 인구 이동 뷰 상태
  const [migrationViewType, setMigrationViewType] = useState<'sankey' | 'table'>('sankey');
  // 인구 이동 기간 상태 (3개월, 1년, 3년, 5년)
  const [migrationPeriod, setMigrationPeriod] = useState<3 | 12 | 36 | 60>(3);
  const [isMigrationPeriodOpen, setIsMigrationPeriodOpen] = useState(false);
  
  // 인구 이동 필터 및 드릴다운 상태
  const [drillDownRegion, setDrillDownRegion] = useState<string | null>(null);
  const [topNFilter, setTopNFilter] = useState<number>(20);
  const [tableFilterTab, setTableFilterTab] = useState<'all' | 'inflow' | 'outflow'>('all');

  // 드롭다운 상태 관리
  const [isTransactionRegionOpen, setIsTransactionRegionOpen] = useState(false);
  const [isHpiRegionOpen, setIsHpiRegionOpen] = useState(false);
  
  const transactionRegionRef = useRef<HTMLDivElement>(null);
  const hpiRegionRef = useRef<HTMLDivElement>(null);
  const migrationPeriodRef = useRef<HTMLDivElement>(null);
  
  // API 데이터 상태
  const [hpiData, setHpiData] = useState<HPIRegionTypeDataPoint[]>([]);
  const [transactionData, setTransactionData] = useState<TransactionVolumeDataPoint[]>([]);
  const [monthlyYears, setMonthlyYears] = useState<number[]>([]);
  const [rawTransactionData, setRawTransactionData] = useState<ApiTransactionVolumeDataPoint[]>([]);
  const [quadrantData, setQuadrantData] = useState<QuadrantDataPoint[]>([]);
  const [rawMigrationData, setRawMigrationData] = useState<{ nodes: SankeyNode[]; links: SankeyLink[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [isQuadrantLoading, setIsQuadrantLoading] = useState(false);
  const [isMigrationLoading, setIsMigrationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 주택 가격 지수 기준 년월 상태 (기본값: 2025년 12월)
  const [hpiSelectedYear, setHpiSelectedYear] = useState<number | null>(2025);
  const [hpiSelectedMonth, setHpiSelectedMonth] = useState<number | null>(12);
  const [isHpiYearDropdownOpen, setIsHpiYearDropdownOpen] = useState(false);
  const [isHpiMonthDropdownOpen, setIsHpiMonthDropdownOpen] = useState(false);
  const hpiYearDropdownRef = useRef<HTMLDivElement>(null);
  const hpiMonthDropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (transactionRegionRef.current && !transactionRegionRef.current.contains(event.target as Node)) {
        setIsTransactionRegionOpen(false);
      }
      if (hpiRegionRef.current && !hpiRegionRef.current.contains(event.target as Node)) {
        setIsHpiRegionOpen(false);
      }
      if (hpiYearDropdownRef.current && !hpiYearDropdownRef.current.contains(event.target as Node)) {
        setIsHpiYearDropdownOpen(false);
      }
      if (hpiMonthDropdownRef.current && !hpiMonthDropdownRef.current.contains(event.target as Node)) {
        setIsHpiMonthDropdownOpen(false);
      }
      if (migrationPeriodRef.current && !migrationPeriodRef.current.contains(event.target as Node)) {
        setIsMigrationPeriodOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // 사용 가능한 년도 목록 생성
  const getAvailableYears = (): number[] => {
    const years: number[] = [];
    for (let year = 2025; year >= 2020; year--) {
      years.push(year);
    }
    return years;
  };

  // 사용 가능한 월 목록
  const getAvailableMonths = (): { value: number; label: string }[] => {
    return [
      { value: 3, label: '3월' },
      { value: 6, label: '6월' },
      { value: 9, label: '9월' },
      { value: 12, label: '12월' }
    ];
  };

  const getHpiBaseYm = (): string | null => {
    if (hpiSelectedYear && hpiSelectedMonth) {
      return `${hpiSelectedYear}${hpiSelectedMonth.toString().padStart(2, '0')}`;
    }
    return null;
  };

  // 백엔드 API 요청용 지역 타입 변환
  const getBackendRegionType = (region: ExtendedRegionType): '전국' | '수도권' | '지방5대광역시' => {
    if (region === '서울특별시') return '수도권'; // 서울은 수도권 API에서 필터링
    if (region === '기타') return '전국'; // 기타는 전국 API에서 필터링
    const regionTypeMap: Record<string, '전국' | '수도권' | '지방5대광역시'> = {
      '전국': '전국',
      '수도권': '수도권',
      '지방 5대광역시': '지방5대광역시'
    };
    return regionTypeMap[region] || '전국';
  };

  // HPI 데이터 가공 (서울 통합 등)
  const processHpiData = (data: HPIRegionTypeDataPoint[], region: ExtendedRegionType) => {
    if (region === '수도권') {
      return data;
    } else if (region === '서울특별시') {
      return data.filter(d => d.id && d.id.startsWith('11') || (d.name && (d.name.endsWith('구') || d.name === '서울')));
    } else if (region === '기타') {
      const excludedPrefixes = ['11', '26', '27', '28', '29', '30', '31', '41'];
      return data.filter(d => !d.id || !excludedPrefixes.some(prefix => d.id && d.id.startsWith(prefix)));
    }
    return data;
  };

  // Highcharts 옵션 생성 (일반 꺾은선/영역 그래프)
  const getHighchartsOptions = useMemo(() => {
    if (transactionData.length === 0) return null;

    const commonOptions: Highcharts.Options = {
      chart: {
        type: 'area', // 기본적으로 area 차트 사용
        height: 400,
        backgroundColor: 'transparent',
        spacing: [20, 20, 20, 20],
        style: {
            fontFamily: 'Pretendard, sans-serif'
        }
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: {
        enabled: true,
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: { fontSize: '12px', fontWeight: 'bold', color: '#64748b' }
      },
      yAxis: {
        title: { text: undefined },
        labels: {
          style: { fontSize: '12px', fontWeight: 'bold', color: '#94a3b8' },
          formatter: function() { return this.value.toLocaleString(); }
        },
        gridLineColor: '#f1f5f9',
        gridLineDashStyle: 'Dash'
      },
      tooltip: {
        backgroundColor: 'white',
        borderColor: '#e2e8f0',
        borderRadius: 12,
        shadow: { color: 'rgba(0,0,0,0.1)', width: 4, offsetX:0, offsetY:4 },
        style: { fontSize: '13px', fontWeight: 'bold', color: '#334155' },
        shared: true,
        crosshairs: true
      },
      plotOptions: {
        area: {
            fillOpacity: 0.1,
            marker: { radius: 3, lineWidth: 2, lineColor: '#fff', fillColor: '#3182F6' },
            lineWidth: 2
        },
        line: {
            marker: { radius: 3, lineWidth: 2, lineColor: '#fff', fillColor: '#3182F6' },
            lineWidth: 2
        }
      }
    };

    if (viewMode === 'yearly') {
        // 연도별 데이터 (단일 시리즈)
        return {
            ...commonOptions,
            xAxis: {
                categories: transactionData.map(item => item.period),
                labels: { style: { fontSize: '12px', fontWeight: 'bold', color: '#94a3b8' } },
                lineWidth: 0,
                tickWidth: 0
            },
            series: [{
                name: '연간 거래량',
                type: 'area',
                data: transactionData.map(item => item.value),
                color: '#3182F6',
                fillColor: {
                    linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                    stops: [
                        [0, 'rgba(49, 130, 246, 0.2)'],
                        [1, 'rgba(49, 130, 246, 0.0)']
                    ]
                }
            }]
        } as Highcharts.Options;
    } else {
        // 월별 데이터 (연도별 비교 - 다중 시리즈)
        const seriesData = monthlyYears.map(year => {
            const color = getYearColor(year, monthlyYears.length);
            // 최신 연도는 area, 과거 연도는 line으로 표시하여 구분
            const isLatest = year === monthlyYears[0];
            
            return {
              name: `${year}년`,
              type: isLatest ? 'area' : 'line',
              data: transactionData.map(item => (item[String(year)] as number) || null), // null로 설정하여 데이터 없는 월은 끊어서 표시
              color: color,
              fillColor: isLatest ? {
                  linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                  stops: [
                      [0, color.replace(')', ', 0.2)').replace('rgb', 'rgba')],
                      [1, color.replace(')', ', 0.0)').replace('rgb', 'rgba')]
                  ]
              } : undefined,
              dashStyle: isLatest ? 'Solid' : 'ShortDot', // 과거 연도는 점선으로 표현 가능
              lineWidth: isLatest ? 3 : 2,
              marker: {
                  enabled: isLatest, // 최신 연도만 마커 표시
                  symbol: 'circle'
              }
            };
          });

          return {
            ...commonOptions,
            xAxis: {
                categories: transactionData.map(item => item.period),
                labels: { style: { fontSize: '12px', fontWeight: 'bold', color: '#94a3b8' } },
                lineWidth: 0,
                tickWidth: 0
            },
            series: seriesData as Highcharts.SeriesOptionsType[]
          };
    }
  }, [transactionData, viewMode, monthlyYears]);

  // 거래량 데이터 변환 로직
  useEffect(() => {
    if (rawTransactionData.length === 0) {
      setTransactionData([]);
      setMonthlyYears([]);
      return;
    }

    if (viewMode === 'yearly') {
      const yearlyMap = new Map<number, number>();
      rawTransactionData.forEach(item => {
        const year = item.year;
        const currentVolume = yearlyMap.get(year) || 0;
        yearlyMap.set(year, currentVolume + item.volume);
      });

      const yearlyData: TransactionVolumeDataPoint[] = Array.from(yearlyMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([year, volume]) => ({
          period: `${year}년`,
          value: volume
        }));

      setTransactionData(yearlyData);
      setMonthlyYears([]);
    } else {
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - yearRange + 1;
      const filteredData = rawTransactionData.filter(item => item.year >= startYear);
      
      const yearMap = new Map<number, Map<number, number>>();
      filteredData.forEach(item => {
        if (!yearMap.has(item.year)) {
          yearMap.set(item.year, new Map());
        }
        const yearData = yearMap.get(item.year)!;
        const currentVolume = yearData.get(item.month) || 0;
        yearData.set(item.month, currentVolume + item.volume);
      });

      const monthlyData: TransactionVolumeDataPoint[] = [];
      for (let month = 1; month <= 12; month++) {
        const dataPoint: TransactionVolumeDataPoint = {
          period: `${month}월`,
          value: 0
        };
        yearMap.forEach((yearData, year) => {
          dataPoint[String(year)] = yearData.get(month) || null as any; // 데이터 없으면 null
        });
        monthlyData.push(dataPoint);
      }

      setTransactionData(monthlyData);
      const years = Array.from(yearMap.keys()).sort((a, b) => b - a);
      setMonthlyYears(years);
    }
  }, [rawTransactionData, viewMode, yearRange]);

  // 거래량 API 호출
  useEffect(() => {
    const loadTransactionData = async () => {
      setIsTransactionLoading(true);
      try {
        const backendRegionType = getBackendRegionType(transactionRegion);
        const res = await fetchTransactionVolume(backendRegionType, 'sale', 10);
        if (res.success) {
          setRawTransactionData(res.data);
        } else {
          setRawTransactionData([]);
        }
      } catch (err) {
        console.error('거래량 데이터 로딩 실패:', err);
        setRawTransactionData([]);
      } finally {
        setIsTransactionLoading(false);
      }
    };
    loadTransactionData();
  }, [transactionRegion]);

  // HPI 데이터 로딩
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const backendRegionType = getBackendRegionType(hpiRegion);
        const hpiRes = await fetchHPIByRegionType(backendRegionType, 'APT', getHpiBaseYm() || undefined);
        if (hpiRes.success) {
          setHpiData(processHpiData(hpiRes.data, hpiRegion));
        }
      } catch (err) {
        console.error('데이터 로딩 실패:', err);
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [hpiRegion, hpiSelectedYear, hpiSelectedMonth]);

  // 시장 국면 데이터 로딩
  useEffect(() => {
    const loadQuadrantData = async () => {
      setIsQuadrantLoading(true);
      try {
        const res = await fetchQuadrant(8);
        if (res.success) {
          setQuadrantData(res.data);
        }
      } catch (err) {
        console.error('시장 국면 데이터 로딩 실패:', err);
      } finally {
        setIsQuadrantLoading(false);
      }
    };
    loadQuadrantData();
  }, []);

  // 인구 이동 데이터 로딩 (기간 변경 시 다시 로드)
  useEffect(() => {
    const loadMigration = async () => {
        setIsMigrationLoading(true);
        try {
            const flowRes = await fetchPopulationFlow(migrationPeriod, true);
            if (flowRes.nodes && flowRes.links) {
                const transformedLinks = flowRes.links.map((link: SankeyLink) => ({
                    from: link.from_region || (link as any).from,
                    to: link.to_region || (link as any).to,
                    weight: link.value || (link as any).weight || 0
                }));
                setRawMigrationData({ 
                    nodes: flowRes.nodes, 
                    links: transformedLinks as any 
                });
            }
        } catch (err) {
            console.error('인구 이동 데이터 로딩 실패:', err);
        } finally {
            setIsMigrationLoading(false);
        }
    };
    loadMigration();
  }, [migrationPeriod]);

  // 인구 이동 데이터 가공
  const processedMigrationData = useMemo(() => {
    if (!rawMigrationData) return { nodes: [], links: [], topInflow: [], topOutflow: [] };
    
    const { nodes, links } = aggregateMigrationData(
        rawMigrationData.nodes,
        rawMigrationData.links as any, 
        'simple',
        drillDownRegion
    );

    const sortedLinks = [...links].sort((a, b) => b.weight - a.weight);
    const topNLinks = sortedLinks.slice(0, topNFilter);

    const activeNodeIds = new Set<string>();
    topNLinks.forEach(link => {
      activeNodeIds.add(link.from);
      activeNodeIds.add(link.to);
    });
    
    // 순이동 계산
    const sortedNodes = [...nodes].sort((a, b) => {
        const netA = a.netMigration ?? a.net ?? 0;
        const netB = b.netMigration ?? b.net ?? 0;
        return netB - netA;
    });

    const displayNodes = nodes.filter(node => activeNodeIds.has(node.id));

    const topInflow = sortedNodes
        .filter(n => (n.netMigration ?? n.net) > 0)
        .slice(0, 3)
        .map(n => ({ region: n.name || n.title || n.id, net: n.netMigration ?? n.net }));
    
    const topOutflow = sortedNodes
        .filter(n => (n.netMigration ?? n.net) < 0)
        .slice(-3)
        .reverse()
        .map(n => ({ region: n.name || n.title || n.id, net: n.netMigration ?? n.net }));

    return { nodes: displayNodes, links: topNLinks, topInflow, topOutflow };
  }, [rawMigrationData, drillDownRegion, topNFilter]);

  const hexMapRegion = hpiRegion as RegionType;
  const regionOptions: ExtendedRegionType[] = ['전국', '수도권', '서울특별시', '지방 5대광역시', '기타'];

  return (
    <div className="space-y-8 pb-32 animate-fade-in px-4 md:px-0 pt-10">
      <div className="md:hidden pt-2 pb-2">
        <h1 className="text-2xl font-black text-slate-900">통계</h1>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold border border-red-100">
          {error}
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-3xl font-black text-slate-900 mb-2 pl-2">
          주택 수요
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
        {/* 거래량 차트 (개선됨: Area Chart) */}
        <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white lg:col-span-6 flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div>
                    <h3 className="font-black text-slate-900 text-[17px]">거래량</h3>
                    <p className="text-[13px] text-slate-500 mt-1 font-medium">
                    {viewMode === 'yearly' ? '연도별 거래량 추이' : '월별 거래량 추이'}
                    </p>
                </div>
                <div className="relative" ref={transactionRegionRef}>
                    <button
                        onClick={() => setIsTransactionRegionOpen(!isTransactionRegionOpen)}
                        className="bg-slate-50 border border-slate-200 text-slate-700 text-[13px] rounded-lg px-3 py-1.5 font-bold hover:bg-slate-100 transition-all flex items-center gap-1.5"
                    >
                        <span>{transactionRegion}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isTransactionRegionOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isTransactionRegionOpen && (
                        <div className="absolute left-0 top-full mt-2 w-[140px] bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-50 animate-enter">
                            {regionOptions.map((region) => (
                                <button
                                    key={region}
                                    onClick={() => {
                                        setTransactionRegion(region);
                                        setIsTransactionRegionOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 text-[13px] font-bold transition-colors ${
                                        transactionRegion === region ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    {region}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {viewMode === 'monthly' && (
                  <ToggleButtonGroup
                    options={['2년', '3년', '5년']}
                    value={`${yearRange}년`}
                    onChange={(value) => setYearRange(parseInt(value.replace('년', '')) as 2 | 3 | 5)}
                  />
                )}
                <ToggleButtonGroup
                  options={['연도별', '월별']}
                  value={viewMode === 'yearly' ? '연도별' : '월별'}
                  onChange={(value) => setViewMode(value === '연도별' ? 'yearly' : 'monthly')}
                />
              </div>
            </div>
          </div>
          <div className="p-6 bg-gradient-to-b from-white to-slate-50/20 flex-1 flex flex-col min-h-[400px]">
            <div className="flex-1 w-full min-h-[400px]">
              {isLoading || isTransactionLoading ? (
                <div className="flex items-center justify-center h-full min-h-[400px]">
                  <p className="text-slate-400 text-[14px] font-bold">데이터를 불러오는 중...</p>
                </div>
              ) : transactionData.length === 0 ? (
                <div className="flex items-center justify-center h-full min-h-[400px]">
                  <p className="text-slate-400 text-[14px] font-bold">데이터가 없습니다.</p>
                </div>
              ) : (
                <HighchartsReact
                  highcharts={Highcharts}
                  options={getHighchartsOptions}
                />
              )}
            </div>
          </div>
        </Card>

        {/* 시장 국면 차트 */}
        <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white lg:col-span-4 flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
                <h3 className="font-black text-slate-900 text-[17px]">시장 국면 지표</h3>
                <p className="text-[13px] text-slate-500 mt-1 font-medium">최근 8개월간 시장 흐름</p>
            </div>
            <div className="bg-slate-50 px-3 py-1 rounded-full text-[11px] font-bold text-slate-600">
                월별 추이
            </div>
          </div>
          <div className="p-6 flex-1 overflow-y-auto max-h-[600px] bg-slate-50/30">
            {isQuadrantLoading ? (
              <div className="text-center py-8 text-slate-500 text-[14px]">로딩 중...</div>
            ) : quadrantData.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {quadrantData.slice(0, 8).map((item, idx) => {
                  const phaseColors: Record<number, { bg: string; color: string; border: string; icon: string }> = {
                    4: { bg: 'bg-red-50', color: 'text-red-600', border: 'border-red-100', icon: '🔥' }, // 활성화
                    2: { bg: 'bg-orange-50', color: 'text-orange-600', border: 'border-orange-100', icon: '🏠' }, // 임대선호
                    3: { bg: 'bg-blue-50', color: 'text-blue-600', border: 'border-blue-100', icon: '📉' }, // 시장위축
                    1: { bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-emerald-100', icon: '📈' } // 매수전환
                  };
                  const style = phaseColors[item.quadrant] || { bg: 'bg-slate-50', color: 'text-slate-600', border: 'border-slate-100', icon: '-' };
                  
                  return (
                    <div key={idx} className={`p-4 rounded-xl border ${style.border} bg-white hover:shadow-md transition-all relative overflow-hidden group`}>
                      <div className={`absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity text-4xl`}>
                        {style.icon}
                      </div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-slate-400">{item.date}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${style.bg} ${style.color}`}>
                            {item.quadrant_label}
                        </span>
                      </div>
                      <div className="space-y-1 mt-2">
                        <div className="flex justify-between text-[12px]">
                            <span className="text-slate-500">매매변동</span>
                            <span className={`font-bold ${item.sale_volume_change_rate >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                {item.sale_volume_change_rate > 0 ? '+' : ''}{item.sale_volume_change_rate.toFixed(1)}%
                            </span>
                        </div>
                        <div className="flex justify-between text-[12px]">
                            <span className="text-slate-500">전월세변동</span>
                            <span className={`font-bold ${item.rent_volume_change_rate >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                {item.rent_volume_change_rate > 0 ? '+' : ''}{item.rent_volume_change_rate.toFixed(1)}%
                            </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-[14px]">데이터가 없습니다.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 2. 주택 가격 지수 카드 */}
          <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white">
               {/* HPI Header (생략 - 기존 코드와 동일) */}
               <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div>
                        <h3 className="font-black text-slate-900 text-[17px]">주택 가격 지수</h3>
                        <p className="text-[13px] text-slate-500 mt-1 font-medium">색상이 진할수록 값이 높음 (0~100)</p>
                    </div>
                    {/* HPI Region Dropdown */}
                    <div className="relative" ref={hpiRegionRef}>
                        <button
                            onClick={() => setIsHpiRegionOpen(!isHpiRegionOpen)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-[13px] rounded-lg px-3 py-1.5 font-bold hover:bg-slate-100 transition-all flex items-center gap-1.5"
                        >
                            <span>{hpiRegion}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isHpiRegionOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isHpiRegionOpen && (
                            <div className="absolute left-0 top-full mt-2 w-[140px] bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-50 animate-enter">
                                {regionOptions.map((region) => (
                                    <button
                                        key={region}
                                        onClick={() => {
                                            setHpiRegion(region);
                                            setIsHpiRegionOpen(false);
                                        }}
                                        className={`w-full text-left px-4 py-3 text-[13px] font-bold transition-colors ${
                                            hpiRegion === region ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        {region}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                  </div>
                  {/* HPI Date Selectors */}
                  <div className="flex items-center gap-2">
                    <div className="relative" ref={hpiYearDropdownRef}>
                      <button
                        onClick={() => setIsHpiYearDropdownOpen(!isHpiYearDropdownOpen)}
                        className="bg-white border border-slate-200 text-slate-700 text-[13px] rounded-lg focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 block px-4 py-2 shadow-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 flex items-center gap-2 min-w-[100px] justify-between"
                      >
                        <span>{hpiSelectedYear ? `${hpiSelectedYear}년` : '년도'}</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 ${isHpiYearDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isHpiYearDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-full bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-50 animate-enter max-h-[300px] overflow-y-auto">
                          {getAvailableYears().map((year) => (
                            <button
                              key={year}
                              onClick={() => { setHpiSelectedYear(year); setIsHpiYearDropdownOpen(false); }}
                              className={`w-full text-left px-4 py-3 text-[14px] font-bold ${hpiSelectedYear === year ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                              {year}년
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="relative" ref={hpiMonthDropdownRef}>
                      <button
                        onClick={() => setIsHpiMonthDropdownOpen(!isHpiMonthDropdownOpen)}
                        className="bg-white border border-slate-200 text-slate-700 text-[13px] rounded-lg focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 block px-4 py-2 shadow-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 flex items-center gap-2 min-w-[80px] justify-between"
                      >
                        <span>{hpiSelectedMonth ? `${hpiSelectedMonth}월` : '월'}</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 ${isHpiMonthDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isHpiMonthDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-full bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-50 animate-enter">
                          {getAvailableMonths().map((month) => (
                            <button
                              key={month.value}
                              onClick={() => { setHpiSelectedMonth(month.value); setIsHpiMonthDropdownOpen(false); }}
                              className={`w-full text-left px-4 py-3 text-[14px] font-bold ${hpiSelectedMonth === month.value ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                              {month.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
              </div>
              <div className="p-6">
                  {isLoading ? (
                    <div className="text-center py-8 text-slate-500 text-[14px]">로딩 중...</div>
                  ) : (
                    <KoreaHexMap 
                      region={hexMapRegion} 
                      className="w-full"
                      {...(hpiData.length > 0 && {
                        apiData: hpiData.map(item => ({
                          id: item.id,
                          name: item.name,
                          value: item.value
                        }))
                      })}
                    />
                  )}
              </div>
          </Card>

          {/* 3. 인구 순이동 차트 (단일 뷰) - 개선된 UI */}
          <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white flex flex-col">
            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {drillDownRegion && (
                    <button 
                        onClick={() => setDrillDownRegion(null)}
                        className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all animate-fadeIn"
                        title="전체 권역으로 돌아가기"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                )}
                <div>
                    <h3 className="font-black text-slate-900 text-[17px]">
                        {drillDownRegion ? `${drillDownRegion} 상세 이동` : '인구 순이동'}
                    </h3>
                    <p className="text-[13px] text-slate-500 mt-1 font-medium">
                        {drillDownRegion ? '권역 내부 및 외부와의 상세 이동' : '지역별 인구 이동 흐름'}
                    </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                  {/* 기간 선택 드롭다운 */}
                  <div className="relative" ref={migrationPeriodRef}>
                    <button
                        onClick={() => setIsMigrationPeriodOpen(!isMigrationPeriodOpen)}
                        className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{migrationPeriod === 3 ? '3개월' : migrationPeriod === 12 ? '1년' : migrationPeriod === 36 ? '3년' : '5년'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMigrationPeriodOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isMigrationPeriodOpen && (
                        <div className="absolute right-0 top-full mt-2 w-24 bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-50 animate-enter">
                            {[3, 12, 36, 60].map((period) => (
                                <button
                                    key={period}
                                    onClick={() => {
                                        setMigrationPeriod(period as any);
                                        setIsMigrationPeriodOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-[12px] font-bold transition-colors ${
                                        migrationPeriod === period ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {period === 3 ? '3개월' : period === 12 ? '1년' : period === 36 ? '3년' : '5년'}
                                </button>
                            ))}
                        </div>
                    )}
                  </div>

                  {/* 상위 N개 필터 */}
                  <div className="hidden md:flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg mr-2">
                      <span className="text-[11px] font-bold text-slate-500">상위 {topNFilter}개</span>
                      <input 
                        type="range" 
                        min="5" 
                        max="50" 
                        step="5"
                        value={topNFilter} 
                        onChange={(e) => setTopNFilter(Number(e.target.value))}
                        className="w-20 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                  </div>

                  <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg">
                    <button
                        onClick={() => setMigrationViewType('sankey')}
                        className={`p-2 rounded-md transition-all ${migrationViewType === 'sankey' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                        title="흐름도 (Sankey)"
                    >
                        <BarChart3 className="w-4 h-4 rotate-90" />
                    </button>
                    <button
                        onClick={() => setMigrationViewType('table')}
                        className={`p-2 rounded-md transition-all ${migrationViewType === 'table' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                        title="표 (Table)"
                    >
                        <Grid2X2 className="w-4 h-4" />
                    </button>
                  </div>
              </div>
            </div>
            
            {/* 인사이트 요약 문구 */}
            {!isMigrationLoading && processedMigrationData.topInflow.length > 0 && (
                <div className="px-6 py-3 bg-blue-50/50 border-b border-blue-100 flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[13px] text-blue-800 font-medium leading-relaxed">
                        최근 {migrationPeriod === 3 ? '3개월' : migrationPeriod === 12 ? '1년' : migrationPeriod === 36 ? '3년' : '5년'}간 <span className="font-bold">{processedMigrationData.topInflow[0].region}</span>으로의 유입이 가장 활발합니다. 
                        반면 <span className="font-bold">{processedMigrationData.topOutflow[0].region}</span>에서는 인구가 빠져나가는 추세입니다.
                        {drillDownRegion ? ' 상세 지역 간의 이동 흐름을 확인해보세요.' : ' 지역을 클릭하면 더 자세한 이동 경로를 볼 수 있습니다.'}
                    </p>
                </div>
            )}
            
            <div className="p-6 flex-1 min-h-[600px] relative flex flex-col">
              {/* 모바일에서 필터 표시 */}
              <div className="md:hidden mb-4 flex items-center justify-end">
                  <span className="text-[11px] font-bold text-slate-500 mr-2">상위 {topNFilter}개</span>
                  <input 
                    type="range" 
                    min="5" 
                    max="50" 
                    step="5"
                    value={topNFilter} 
                    onChange={(e) => setTopNFilter(Number(e.target.value))}
                    className="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
              </div>

              {isMigrationLoading ? (
                <div className="flex items-center justify-center h-full">
                    <div className="text-center py-8 text-slate-500 text-[14px]">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                        로딩 중...
                    </div>
                </div>
              ) : processedMigrationData.links.length > 0 ? (
                <>
                    <div className="flex-1">
                        {migrationViewType === 'table' ? (
                            <div className="h-[600px] flex flex-col">
                                {/* 테이블 필터 탭 */}
                                <div className="flex gap-2 mb-4">
                                    <button 
                                        onClick={() => setTableFilterTab('all')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tableFilterTab === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                    >
                                        전체 이동
                                    </button>
                                    <button 
                                        onClick={() => setTableFilterTab('inflow')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tableFilterTab === 'inflow' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                    >
                                        순유입 순
                                    </button>
                                    <button 
                                        onClick={() => setTableFilterTab('outflow')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tableFilterTab === 'outflow' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                                    >
                                        순유출 순
                                    </button>
                                </div>
                                
                                <div className="overflow-x-auto flex-1 border rounded-xl border-slate-200">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-4 py-3 rounded-tl-lg">출발지</th>
                                                <th className="px-4 py-3 text-center">→</th>
                                                <th className="px-4 py-3">도착지</th>
                                                <th className="px-4 py-3 text-right rounded-tr-lg">이동 인구</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {processedMigrationData.links
                                                .sort((a, b) => b.weight - a.weight)
                                                .map((link: any, idx: number) => {
                                                    const maxWeight = processedMigrationData.links[0]?.weight || 1;
                                                    const intensity = Math.min((link.weight / maxWeight) * 0.15, 0.15);
                                                    
                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50 transition-colors" style={{ backgroundColor: `rgba(59, 130, 246, ${intensity})` }}>
                                                            <td className="px-4 py-3 font-bold text-slate-700">{link.from}</td>
                                                            <td className="px-4 py-3 text-center text-slate-400">→</td>
                                                            <td className="px-4 py-3 font-bold text-slate-700">{link.to}</td>
                                                            <td className="px-4 py-3 text-right font-black text-slate-900">
                                                                {Math.floor(link.weight).toLocaleString()}명
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <MigrationSankey 
                              nodes={processedMigrationData.nodes}
                              links={processedMigrationData.links}
                              height={600}
                              onNodeClick={(nodeId) => {
                                  if (!drillDownRegion) {
                                      setDrillDownRegion(nodeId);
                                  }
                              }}
                            />
                        )}
                    </div>

                    {/* 순이동 통계 요약 (그래프 아래로 이동) */}
                    <div className="mt-6 pt-4 border-t border-slate-100">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white rounded-xl p-4 border border-emerald-100 bg-emerald-50/30">
                            <div className="text-[12px] text-emerald-700 font-bold mb-3 flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                📈 순유입 TOP 3
                            </div>
                            <div className="space-y-2">
                              {processedMigrationData.topInflow.length > 0 ? (
                                processedMigrationData.topInflow.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-[13px]">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold ${idx === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 border border-slate-100'}`}>{idx + 1}</span>
                                        <span className="font-bold text-slate-700">{item.region}</span>
                                    </div>
                                    <span className="text-emerald-600 font-black">+{Math.floor(item.net).toLocaleString()}명</span>
                                  </div>
                                ))
                              ) : <div className="text-[12px] text-slate-400">데이터 없음</div>}
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-4 border border-rose-100 bg-rose-50/30">
                            <div className="text-[12px] text-rose-700 font-bold mb-3 flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                                📉 순유출 TOP 3
                            </div>
                            <div className="space-y-2">
                              {processedMigrationData.topOutflow.length > 0 ? (
                                processedMigrationData.topOutflow.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-[13px]">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold ${idx === 0 ? 'bg-rose-100 text-rose-700' : 'bg-white text-slate-500 border border-slate-100'}`}>{idx + 1}</span>
                                        <span className="font-bold text-slate-700">{item.region}</span>
                                    </div>
                                    <span className="text-rose-600 font-black">{Math.floor(item.net).toLocaleString()}명</span>
                                  </div>
                                ))
                              ) : <div className="text-[12px] text-slate-400">데이터 없음</div>}
                            </div>
                          </div>
                        </div>
                    </div>
                </>
              ) : (
                <div className="text-center py-20 text-slate-400 font-medium">
                    데이터가 없습니다.
                </div>
              )}
            </div>
          </Card>
      </div>
    </div>
  );
};
