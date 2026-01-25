import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from 'recharts';
import { SlidersHorizontal } from 'lucide-react';
import {
  fetchNews,
  fetchQuadrant,
  fetchTransactionVolume,
  type NewsItem as ApiNewsItem,
  type QuadrantDataPoint,
  type TransactionVolumeDataPoint,
} from '../services/api';

export interface ComparisonData {
  region: string;
  myProperty: number;
  regionAverage: number;
  aptName?: string;
}

interface RegionComparisonChartProps {
  data?: ComparisonData[];
  isLoading?: boolean;
  onRefresh?: () => void;
  activeSection: 'policyNews' | 'transactionVolume' | 'marketPhase' | 'regionComparison';
  onSelectSection: (next: 'policyNews' | 'transactionVolume' | 'marketPhase' | 'regionComparison') => void;
}

export const RegionComparisonChart: React.FC<RegionComparisonChartProps> = ({
  data,
  isLoading = false,
  onRefresh,
  activeSection,
  onSelectSection,
}) => {

  const [tooltipData, setTooltipData] = React.useState<{ data: ComparisonData; x: number; y: number } | null>(null);
  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const chartAreaRef = React.useRef<HTMLDivElement>(null);
  const [isTooltipEnabled, setIsTooltipEnabled] = React.useState(true);

  // 우측 카드에서 다른 섹션을 "미리보기"로 렌더링하기 위한 데이터
  const [txData, setTxData] = React.useState<Array<{ period: string; volume: number }>>([]);
  const [isTxLoading, setIsTxLoading] = React.useState(false);

  const [quadrantData, setQuadrantData] = React.useState<QuadrantDataPoint[]>([]);
  const [isQuadrantLoading, setIsQuadrantLoading] = React.useState(false);

  const [news, setNews] = React.useState<ApiNewsItem[]>([]);
  const [isNewsLoading, setIsNewsLoading] = React.useState(false);

  const [panelError, setPanelError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isCancelled = false;
    setPanelError(null);

    const load = async () => {
      try {
        if (activeSection === 'transactionVolume' && txData.length === 0 && !isTxLoading) {
          setIsTxLoading(true);
          const res = await fetchTransactionVolume('전국', 'sale', 3);
          if (isCancelled) return;
          const raw = res?.success ? res.data : [];
          const rows = (raw || [])
            .map((d: TransactionVolumeDataPoint) => ({
              period: `${d.year}-${String(d.month).padStart(2, '0')}`,
              volume: d.volume,
            }))
            .sort((a, b) => a.period.localeCompare(b.period));
          // 최근 24개만
          setTxData(rows.slice(-24));
        }

        if (activeSection === 'marketPhase' && quadrantData.length === 0 && !isQuadrantLoading) {
          setIsQuadrantLoading(true);
          const res = await fetchQuadrant(6);
          if (isCancelled) return;
          setQuadrantData(res?.success ? res.data : []);
        }

        if (activeSection === 'policyNews' && news.length === 0 && !isNewsLoading) {
          setIsNewsLoading(true);
          const res = await fetchNews(5);
          if (isCancelled) return;
          setNews(res?.success ? res.data : []);
        }
      } catch (e) {
        if (isCancelled) return;
        setPanelError('데이터를 불러오지 못했습니다.');
      } finally {
        if (isCancelled) return;
        setIsTxLoading(false);
        setIsQuadrantLoading(false);
        setIsNewsLoading(false);
      }
    };

    load();

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);
  
  // 실제 데이터만 사용 (null/undefined만 체크, 0은 유효한 값으로 처리)
  const hasValidData = data && data.length > 0 && data.some(d => 
    (d.myProperty !== null && d.myProperty !== undefined) || 
    (d.regionAverage !== null && d.regionAverage !== undefined)
  );
  
  const chartData = hasValidData ? data : [];
  
  // Y축 도메인 계산 (모든 값이 0일 때도 표시되도록)
  const allValues = chartData.flatMap(d => [d.myProperty, d.regionAverage]);
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;
  // 모든 값이 0일 때도 차트가 보이도록 최소 범위 설정
  const yAxisDomain = minValue === 0 && maxValue === 0 
    ? [-1, 1] 
    : [Math.min(minValue - 1, -1), Math.max(maxValue + 1, 1)];
  
  // 디버깅: 데이터 확인
  console.log('[RegionComparisonChart] 받은 데이터:', data);
  console.log('[RegionComparisonChart] 유효한 데이터 여부:', hasValidData);
  console.log('[RegionComparisonChart] 사용할 데이터:', chartData);
  console.log('[RegionComparisonChart] Y축 도메인:', yAxisDomain);

  const headerTitle =
    activeSection === 'policyNews'
      ? '정책 및 뉴스'
      : activeSection === 'transactionVolume'
      ? '거래량'
      : activeSection === 'marketPhase'
      ? '시장 국면지표'
      : '지역 대비 수익률 비교';

  const headerSubtitle =
    activeSection === 'policyNews'
      ? '최신 뉴스 요약'
      : activeSection === 'transactionVolume'
      ? '월별 거래량(전국, 최근 3년)'
      : activeSection === 'marketPhase'
      ? '매매/전월세 거래량 변화율 4분면'
      : '내 단지 상승률 vs 해당 행정구역 평균 상승률 (최대 3개)';

  return (
    <>
      <div 
        ref={chartContainerRef}
        className="bg-white rounded-[28px] p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80 h-full flex flex-col relative"
        onMouseLeave={() => {
          if (activeSection === 'regionComparison') setTooltipData(null);
        }}
      >
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight mb-2">{headerTitle}</h2>
              <p className="text-[13px] text-slate-500 font-medium">{headerSubtitle}</p>
            </div>

            {/* 헤더 드롭다운 (PolicyNewsList / ControlsContent와 같은 톤) */}
            <div className="relative w-[190px] flex-shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={activeSection}
                onChange={(e) => onSelectSection(e.target.value as RegionComparisonChartProps['activeSection'])}
                className="w-full pl-9 pr-8 h-10 text-[15px] font-bold bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 appearance-none cursor-pointer hover:bg-slate-50 transition-colors"
                aria-label="대시보드 콘텐츠 선택"
              >
                <option value="policyNews">정책 및 뉴스</option>
                <option value="transactionVolume">거래량</option>
                <option value="marketPhase">시장 국면지표</option>
                <option value="regionComparison">지역 대비 수익률 비교</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="flex-1 min-h-0">
          {panelError ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[13px] text-slate-500 font-medium">{panelError}</p>
            </div>
          ) : activeSection === 'policyNews' ? (
            <div className="h-full overflow-y-auto custom-scrollbar pr-2">
              {isNewsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[13px] text-slate-500 font-medium">데이터 로딩 중...</p>
                </div>
              ) : news.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[13px] text-slate-500 font-medium">뉴스가 없습니다</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {news.slice(0, 8).map((n) => (
                    <div key={n.id} className="p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="text-[12px] font-bold text-slate-500 truncate">{n.source}</p>
                        <p className="text-[12px] font-bold text-slate-400 flex-shrink-0">{n.date}</p>
                      </div>
                      <p className="text-[14px] font-black text-slate-900 line-clamp-2">{n.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeSection === 'transactionVolume' ? (
            <div ref={chartAreaRef} className="w-full h-full">
              {isTxLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[13px] text-slate-500 font-medium">데이터 로딩 중...</p>
                </div>
              ) : txData.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[13px] text-slate-500 font-medium">데이터가 없습니다</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={txData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="period"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 'bold' }}
                      tickFormatter={(v) => `${Number(v).toLocaleString()}`}
                      width={60}
                    />
                    <Tooltip
                      formatter={(v) => [`${Number(v).toLocaleString()}건`, '거래량']}
                      labelFormatter={(l) => `기간: ${l}`}
                    />
                    <defs>
                      <linearGradient id="txVolumeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="volume"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fill="url(#txVolumeGradient)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : activeSection === 'marketPhase' ? (
            <div ref={chartAreaRef} className="w-full h-full">
              {isQuadrantLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[13px] text-slate-500 font-medium">데이터 로딩 중...</p>
                </div>
              ) : quadrantData.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[13px] text-slate-500 font-medium">데이터가 없습니다</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      dataKey="sale_volume_change_rate"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 'bold' }}
                      tickFormatter={(v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(0)}%`}
                      name="매매변화율"
                    />
                    <YAxis
                      type="number"
                      dataKey="rent_volume_change_rate"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 'bold' }}
                      tickFormatter={(v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(0)}%`}
                      name="전월세변화율"
                      width={60}
                    />
                    <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="6 6" />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="6 6" />
                    <Tooltip
                      formatter={(value: any, name: any, props: any) => {
                        if (name === 'sale_volume_change_rate') return [`${Number(value).toFixed(1)}%`, '매매변화율'];
                        if (name === 'rent_volume_change_rate') return [`${Number(value).toFixed(1)}%`, '전월세변화율'];
                        return [value, name];
                      }}
                      labelFormatter={() => ''}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const p = payload[0].payload as QuadrantDataPoint;
                        const color =
                          p.quadrant === 1 ? '#22c55e' : p.quadrant === 2 ? '#3b82f6' : p.quadrant === 3 ? '#ef4444' : '#a855f7';
                        return (
                          <div className="bg-white rounded-xl shadow-lg border border-slate-200 px-4 py-3">
                            <p className="text-[12px] font-bold text-slate-900 mb-1">{p.date}</p>
                            <p className="text-[12px] font-bold" style={{ color }}>
                              {p.quadrant_label}
                            </p>
                            <div className="mt-2 text-[12px] text-slate-600 space-y-1">
                              <p>매매: {p.sale_volume_change_rate > 0 ? '+' : ''}{p.sale_volume_change_rate.toFixed(1)}%</p>
                              <p>전월세: {p.rent_volume_change_rate > 0 ? '+' : ''}{p.rent_volume_change_rate.toFixed(1)}%</p>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Scatter
                      data={quadrantData}
                      fill="#3b82f6"
                      shape={(props: any) => {
                        const p = props.payload as QuadrantDataPoint;
                        const fill =
                          p.quadrant === 1 ? '#22c55e' : p.quadrant === 2 ? '#3b82f6' : p.quadrant === 3 ? '#ef4444' : '#a855f7';
                        return <circle cx={props.cx} cy={props.cy} r={5} fill={fill} opacity={0.85} />;
                      }}
                      isAnimationActive={false}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-[13px] text-slate-500 font-medium">데이터 로딩 중...</p>
              </div>
            </div>
          ) : !hasValidData ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-[14px] text-slate-500 font-medium mb-1">데이터가 없습니다</p>
                <p className="text-[12px] text-slate-400">내 자산 정보를 추가하면 비교 데이터를 확인할 수 있습니다</p>
              </div>
            </div>
          ) : (
          <div ref={chartAreaRef} className="w-full h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 0, bottom: 70 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="region" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                height={80}
                angle={-25}
                textAnchor="end"
                interval={0}
                width={100}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 'bold' }}
                tickFormatter={(val) => `${val > 0 ? '+' : ''}${val.toFixed(1)}%`}
                domain={yAxisDomain}
                width={55}
                allowDataOverflow={false}
              />
              <Tooltip 
                cursor={false}
                allowEscapeViewBox={{ x: true, y: true }}
                content={({ active, payload, coordinate, label }) => {
                  if (!isTooltipEnabled) return null;
                  // Tooltip을 차트 레이아웃에서 완전히 분리
                  // coordinate는 SVG 내부 좌표계이므로, 컨테이너 기준으로 정확히 변환
                  if (active && payload && payload.length && coordinate && chartAreaRef.current && chartContainerRef.current) {
                    const data = payload[0].payload as ComparisonData;
                    const chartAreaRect = chartAreaRef.current.getBoundingClientRect();
                    const containerRect = chartContainerRef.current.getBoundingClientRect();
                    
                    // ResponsiveContainer 내부의 SVG 요소 찾기
                    const svgElement = chartAreaRef.current.querySelector('svg');
                    if (svgElement) {
                      const svgRect = svgElement.getBoundingClientRect();
                      
                      // coordinate는 SVG 내부 좌표계 (margin 포함)
                      // SVG의 실제 위치를 기준으로 컨테이너 상대 좌표 계산
                      const x = svgRect.left - containerRect.left + coordinate.x;
                      const y = svgRect.top - containerRect.top + coordinate.y;
                      
                      requestAnimationFrame(() => {
                        setTooltipData({
                          data,
                          x,
                          y
                        });
                      });
                    }
                  } else {
                    requestAnimationFrame(() => {
                      setTooltipData(null);
                    });
                  }
                  
                  return null; // 차트 레이아웃에 영향을 주지 않도록 null 반환
                }}
              />
              <Legend 
                wrapperStyle={{ 
                  paddingTop: '10px',
                  display: 'flex',
                  justifyContent: 'center',
                  width: '100%'
                }}
                iconType="circle"
                align="center"
                verticalAlign="bottom"
                content={({ payload }) => {
                  if (!payload || !payload.length) return null;
                  return (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
                      {payload.map((entry, index) => {
                        let iconColor = '#94a3b8';
                        if (entry.dataKey === 'myProperty') {
                          // myProperty 색상: 양수면 blue, 음수면 red
                          iconColor = '#3b82f6'; // blue-500 (양수 기본값)
                        } else if (entry.dataKey === 'regionAverage') {
                          // regionAverage 색상: 양수면 purple, 음수면 orange
                          iconColor = '#8b5cf6'; // purple-500 (양수 기본값)
                        }
                        return (
                          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                              <circle cx="7" cy="7" r="6" fill={iconColor} />
                            </svg>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
                              {entry.dataKey === 'myProperty' ? '내 단지 상승률' : '행정구역 평균 상승률'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
                            <Bar 
                                dataKey="myProperty" 
                                name="myProperty"
                                radius={[8, 8, 0, 0]}
                                isAnimationActive={false}
                                activeBar={false}
                                maxBarSize={30}
                                label={{ 
                                  position: 'top', 
                                  formatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`,
                                  fontSize: 11,
                                  fill: '#475569',
                                  fontWeight: 'bold'
                                }}
                              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-my-${index}`} 
                    fill={entry.myProperty >= 0 
                      ? 'url(#myPropertyGradient)' 
                      : 'url(#myPropertyNegativeGradient)'
                    } 
                  />
                ))}
              </Bar>
                            <Bar 
                                dataKey="regionAverage" 
                                name="regionAverage"
                                radius={[8, 8, 0, 0]}
                                isAnimationActive={false}
                                activeBar={false}
                                maxBarSize={30}
                                label={{ 
                                  position: 'top', 
                                  formatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`,
                                  fontSize: 11,
                                  fill: '#475569',
                                  fontWeight: 'bold'
                                }}
                              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-avg-${index}`} 
                    fill={entry.regionAverage >= 0 
                      ? 'url(#regionAverageGradient)' 
                      : 'url(#regionAverageNegativeGradient)'
                    } 
                  />
                ))}
              </Bar>
              <defs>
                <linearGradient id="myPropertyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="myPropertyNegativeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="regionAverageGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="regionAverageNegativeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.8} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
          </div>
          )}
        </div>
        {/* 커스텀 Tooltip - 차트 레이아웃에 영향 없음 */}
        {activeSection === 'regionComparison' && isTooltipEnabled && tooltipData && (
          <div
            className="absolute bg-white rounded-xl shadow-lg border border-slate-200 z-50 pointer-events-none"
            style={{
              left: `${tooltipData.x}px`,
              top: `${tooltipData.y}px`,
              transform: 'translate(-50%, calc(-100% - 10px))',
              width: '280px',
              minHeight: '180px',
              padding: '16px',
            }}
          >
            <p className="font-bold text-slate-900 mb-3 text-sm truncate" title={tooltipData.data.aptName || tooltipData.data.region}>
              {tooltipData.data.aptName || tooltipData.data.region}
            </p>
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-600">내 단지 상승률</span>
                <span className={`font-bold text-sm ${tooltipData.data.myProperty >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                  {tooltipData.data.myProperty > 0 ? '+' : ''}{tooltipData.data.myProperty.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-600">행정구역 평균 상승률</span>
                <span className={`font-bold text-sm ${tooltipData.data.regionAverage >= 0 ? 'text-purple-600' : 'text-orange-500'}`}>
                  {tooltipData.data.regionAverage > 0 ? '+' : ''}{tooltipData.data.regionAverage.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-200">
              <p className="text-[10px] text-slate-500 mb-1.5 font-medium">상세 정보</p>
              <div className="space-y-1 text-[11px] text-slate-600">
                <p>• 차이: {(tooltipData.data.myProperty - tooltipData.data.regionAverage) > 0 ? '+' : ''}{(tooltipData.data.myProperty - tooltipData.data.regionAverage).toFixed(1)}%</p>
                <p className="line-clamp-2">• {tooltipData.data.myProperty > tooltipData.data.regionAverage ? '내 단지가 행정구역 평균보다 높은 수익률을 보이고 있습니다.' : '내 단지가 행정구역 평균보다 낮은 수익률을 보이고 있습니다.'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
