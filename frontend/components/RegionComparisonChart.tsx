import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
import { SlidersHorizontal, ExternalLink, X, RefreshCw } from 'lucide-react';
import {
  fetchNews,
  fetchQuadrant,
  fetchTransactionVolume,
  type NewsItem as ApiNewsItem,
  type QuadrantDataPoint,
  type TransactionVolumeDataPoint,
} from '../services/api';

// 기본 이미지 목록
const defaultImages = [
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&h=300&fit=crop',
];

// API 응답을 컴포넌트 NewsItem으로 변환
interface NewsItem {
  id: string;
  title: string;
  description: string;
  date: string;
  category: string;
  source: string;
  image: string;
  fullContent: string;
  url: string;
}

const mapApiToNewsItem = (item: ApiNewsItem, index: number): NewsItem => ({
  id: item.id,
  title: item.title,
  description: item.summary || item.content?.slice(0, 100) || '',
  date: item.date,
  category: item.category || '부동산',
  source: item.source,
  image: item.thumbnail || defaultImages[index % defaultImages.length],
  fullContent: item.content || item.summary || '',
  url: item.url,
});

// 날짜 문자열 파싱
const parseNewsDate = (dateStr: string | undefined): Date => {
  if (!dateStr || dateStr.trim() === '') {
    return new Date(0);
  }
  const cleanedDate = dateStr.replace(/기사입력\s*/, '').trim();
  const parsed = new Date(cleanedDate);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  const match = cleanedDate.match(/(\d{4})-(\d{2})-(\d{2})\s*(\d{2})?:?(\d{2})?/);
  if (match) {
    const [, year, month, day, hour = '0', minute = '0'] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }
  return new Date(0);
};

// 날짜 포맷팅
const formatNewsDate = (dateStr: string | undefined): string | null => {
  if (!dateStr || dateStr.trim() === '') {
    return null;
  }
  const date = parseNewsDate(dateStr);
  if (date.getTime() === 0) {
    return null;
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return diffMinutes < 0 ? '방금 전' : `${diffMinutes}분 전`;
  } else if (diffHours < 24) {
    return `${diffHours}시간 전`;
  } else if (diffDays < 7) {
    return `${diffDays}일 전`;
  } else {
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  }
};

// 카테고리 색상
const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    '일반': 'bg-slate-800 text-white',
    '부동산': 'bg-amber-400 text-amber-900',
    '세제/정책': 'bg-blue-500 text-white',
    '정책': 'bg-blue-500 text-white',
    '분양': 'bg-purple-500 text-white',
    '시장동향': 'bg-emerald-500 text-white',
    '시세/시황': 'bg-emerald-500 text-white',
    '인프라': 'bg-orange-500 text-white',
  };
  return colors[category] || 'bg-slate-800 text-white';
};

// 부동산 관련 핵심 키워드 사전
const keywordDictionary = [
  '아파트', '부동산', '청약', '분양', '재건축', '재개발', '전세', '월세', '매매',
  '금리', '대출', '주담대', 'LTV', 'DTI', 'DSR', '규제', '완화', '강화',
  '서울', '수도권', '지방', '강남', '강북', '경기', '인천',
  '상승', '하락', '안정', '급등', '급락', '회복', '조정',
  '투자', '시세', '실거래가', '공시가격', '호가', '거래량',
  '정책', '세금', '취득세', '양도세', '종부세', '재산세',
  '입주', '미분양', '공급', '수요', '물량', '착공', '준공',
  '한옥', '빌라', '오피스텔', '상가', '토지', '건물',
  '경쟁률', '당첨', '추첨', '가점', '무순위', '특별공급',
  '임대', '임차', '보증금', '계약', '갱신', '만기',
  '시장', '전망', '예측', '분석', '동향', '트렌드'
];

// 기사에서 핵심 키워드 추출
const extractKeywords = (news: NewsItem): string[] => {
  const text = `${news.title} ${news.description} ${news.fullContent}`.toLowerCase();
  const foundKeywords: string[] = [];
  
  keywordDictionary.forEach(keyword => {
    if (text.includes(keyword.toLowerCase()) && !foundKeywords.includes(keyword)) {
      foundKeywords.push(keyword);
    }
  });
  
  if (news.category && !foundKeywords.includes(news.category)) {
    foundKeywords.unshift(news.category);
  }
  
  return foundKeywords.slice(0, 5);
};

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

  const chartContainerRef = React.useRef<HTMLDivElement>(null);

  // 우측 카드에서 다른 섹션을 "미리보기"로 렌더링하기 위한 데이터
  const [txData, setTxData] = React.useState<Array<{ period: string; volume: number }>>([]);
  const [isTxLoading, setIsTxLoading] = React.useState(false);

  const [quadrantData, setQuadrantData] = React.useState<QuadrantDataPoint[]>([]);
  const [isQuadrantLoading, setIsQuadrantLoading] = React.useState(false);

  const [news, setNews] = React.useState<NewsItem[]>([]);
  const [isNewsLoading, setIsNewsLoading] = React.useState(false);
  const [selectedNews, setSelectedNews] = React.useState<NewsItem | null>(null);

  const [panelError, setPanelError] = React.useState<string | null>(null);

  const loadNews = React.useCallback(async () => {
    setIsNewsLoading(true);
    setPanelError(null);
    try {
      const res = await fetchNews(5);
      setNews(res?.success ? res.data.map(mapApiToNewsItem) : []);
    } catch {
      setPanelError('데이터를 불러오지 못했습니다.');
    } finally {
      setIsNewsLoading(false);
    }
  }, []);

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
          setNews(res?.success ? res.data.map(mapApiToNewsItem) : []);
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
        className="bg-white rounded-[20px] md:rounded-[28px] p-4 md:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80 h-full flex flex-col relative"
      >
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-shrink-0">
              <h2 className="text-xl font-black text-slate-900 tracking-tight mb-2">{headerTitle}</h2>
              <p className="text-[13px] text-slate-500 font-medium">{headerSubtitle}</p>
            </div>

            {/* 헤더 드롭다운 (PolicyNewsList / ControlsContent와 같은 톤) */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative w-full md:w-[240px] flex-shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={activeSection}
                  onChange={(e) => onSelectSection(e.target.value as RegionComparisonChartProps['activeSection'])}
                  className="w-full pl-9 pr-7 h-10 text-[14px] font-bold bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 appearance-none cursor-pointer hover:bg-slate-50 transition-colors"
                  aria-label="대시보드 콘텐츠 선택"
                >
                  <option value="policyNews">정책 및 뉴스</option>
                  <option value="transactionVolume">거래량</option>
                  <option value="marketPhase">시장 국면지표</option>
                  <option value="regionComparison">지역 대비 수익률 비교</option>
                </select>
              </div>

              {/* 새로고침 버튼(뉴스일 때만) */}
              {activeSection === 'policyNews' && (
                <button
                  onClick={loadNews}
                  className="text-[13px] font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 hover:bg-slate-50 p-2 rounded-lg transition-colors"
                  title="새로고침"
                  aria-label="정책 및 뉴스 새로고침"
                >
                  <RefreshCw className={`w-4 h-4 ${isNewsLoading ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex-1 min-h-0 relative overflow-visible">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={`h-full ${
                activeSection === 'policyNews' 
                  ? 'overflow-y-auto custom-scrollbar space-y-3 pr-2' 
                  : activeSection === 'transactionVolume' || activeSection === 'marketPhase' || activeSection === 'regionComparison'
                  ? 'relative overflow-visible'
                  : 'relative'
              }`}
            >
              {panelError ? (
                <div className="h-full flex items-center justify-center text-center px-4">
                  <p className="text-[13px] text-slate-500 font-medium">{panelError}</p>
                </div>
              ) : activeSection === 'policyNews' ? (
                <>
                  {isNewsLoading ? (
                    <div className="h-full flex items-center justify-center text-center px-4">
                      <p className="text-[13px] text-slate-500 font-medium">데이터 로딩 중...</p>
                    </div>
                  ) : news.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center px-4">
                      <p className="text-[14px] text-slate-400">뉴스가 없습니다.</p>
                    </div>
                  ) : (
                    news.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => setSelectedNews(n)}
                        className="group relative flex items-start gap-3 md:gap-4 py-3 md:p-4 md:rounded-2xl border-b md:border md:border-slate-100 md:hover:border-slate-200 md:hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all cursor-pointer last:border-b-0"
                      >
                        {/* 외부 링크 아이콘 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (n.url) {
                              window.open(n.url, '_blank', 'noopener,noreferrer');
                            }
                          }}
                          className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors opacity-0 group-hover:opacity-100"
                          title="원문 보기"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        
                        {/* 썸네일 이미지 */}
                        <div className="flex flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-slate-100">
                          <img 
                            src={n.image} 
                            alt={n.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = defaultImages[0];
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                            <span className={`flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${getCategoryColor(n.category)}`}>
                              {n.category}
                            </span>
                            <span className="text-[11px] text-slate-400">{n.source}</span>
                            {(() => {
                              const formattedDate = formatNewsDate(n.date);
                              return formattedDate ? (
                                <span className="text-[11px] text-slate-400 font-medium ml-auto">{formattedDate}</span>
                              ) : null;
                            })()}
                          </div>
                          <h3 className="text-[14px] md:text-[15px] font-black text-slate-900 mb-1 md:mb-1 group-hover:text-brand-blue transition-colors line-clamp-2 md:line-clamp-1">
                            {n.title}
                          </h3>
                          <p className="hidden md:block text-[13px] text-slate-500 font-medium line-clamp-1 mb-1.5">
                            {n.description}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </>
              ) : activeSection === 'transactionVolume' ? (
                <div className="w-full h-full">
                  {isTxLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-[13px] text-slate-500 font-medium">데이터 로딩 중...</p>
                    </div>
                  ) : txData.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
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
                          <linearGradient id="txVolumeGradientRight" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="volume"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          fill="url(#txVolumeGradientRight)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ) : activeSection === 'marketPhase' ? (
                <div className="w-full h-full">
                  {isQuadrantLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-[13px] text-slate-500 font-medium">데이터 로딩 중...</p>
                    </div>
                  ) : quadrantData.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
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
          <div className="w-full h-full overflow-visible">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 0, bottom: 100 }}
              barCategoryGap="10%"
              barGap={0}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="region" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }}
                height={120}
                angle={-35}
                textAnchor="end"
                interval={0}
                dy={10}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 'bold' }}
                tickFormatter={(val) => `${val > 0 ? '+' : ''}${Number(val).toFixed(1)}%`}
                width={55}
              />
              <Tooltip 
                active={false}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const entry = payload[0].payload as ComparisonData;
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
                      <p className="text-[13px] font-black text-slate-900 dark:text-white mb-2">{entry.aptName || entry.region}</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[12px] font-bold text-slate-600 dark:text-slate-400">내 단지 상승률</span>
                          <span className={`text-[13px] font-black ${entry.myProperty >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            {entry.myProperty > 0 ? '+' : ''}{entry.myProperty.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[12px] font-bold text-slate-600 dark:text-slate-400">행정구역 평균 상승률</span>
                          <span className={`text-[13px] font-black ${entry.regionAverage >= 0 ? 'text-purple-600' : 'text-amber-600'}`}>
                            {entry.regionAverage > 0 ? '+' : ''}{entry.regionAverage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar 
                dataKey="myProperty" 
                name="myProperty"
                radius={[8, 8, 0, 0]}
                isAnimationActive={false}
                maxBarSize={40}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-my-${index}`} 
                    fill={entry.myProperty >= 0 ? '#3b82f6' : '#ef4444'} 
                  />
                ))}
              </Bar>
              <Bar 
                dataKey="regionAverage" 
                name="regionAverage"
                radius={[8, 8, 0, 0]}
                isAnimationActive={false}
                maxBarSize={40}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-avg-${index}`} 
                    fill={entry.regionAverage >= 0 ? '#8b5cf6' : '#f59e0b'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* News Detail Modal - 모바일은 bottom sheet, PC는 모달 */}
      <AnimatePresence>
        {selectedNews && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity md:flex md:items-center md:justify-center p-4"
              onClick={() => setSelectedNews(null)}
            ></motion.div>
            <motion.div 
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed md:relative z-[101] w-full md:max-w-3xl bg-white md:rounded-3xl shadow-2xl overflow-hidden flex flex-col md:max-h-[85vh] bottom-0 md:bottom-auto rounded-t-[24px] md:rounded-t-3xl max-h-[90vh] md:max-h-[85vh]"
            >
              {/* 모바일 핸들 바 */}
              <div className="md:hidden w-full flex justify-center pt-3 pb-1" onClick={() => setSelectedNews(null)}>
                <div className="w-12 h-1.5 rounded-full bg-slate-200" />
              </div>
            {/* 헤더 이미지 */}
            <div className="relative h-48 w-full flex-shrink-0">
              <img 
                src={selectedNews.image} 
                alt={selectedNews.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
              <button 
                onClick={() => setSelectedNews(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/90 hover:bg-white text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="absolute bottom-4 left-6 right-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${getCategoryColor(selectedNews.category)}`}>
                    {selectedNews.category}
                  </span>
                  <span className="text-[12px] text-white/90">{selectedNews.date}</span>
                  <span className="w-1 h-1 bg-white/60 rounded-full"></span>
                  <span className="text-[12px] text-white/90">{selectedNews.source}</span>
                </div>
                <h2 className="text-2xl font-black text-white">{selectedNews.title}</h2>
              </div>
            </div>
            
            {/* 본문 */}
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <p className="text-[15px] text-slate-700 font-medium leading-relaxed mb-6">
                {selectedNews.description}
              </p>
              
              <div className="border-t border-slate-100 pt-6">
                <h4 className="text-[15px] font-black text-slate-900 mb-4">상세 내용</h4>
                <p className="text-[14px] text-slate-600 leading-[1.8]">
                  {selectedNews.fullContent}
                </p>
              </div>
              
              {/* 원문 보기 버튼 */}
              {selectedNews.url && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <a 
                    href={selectedNews.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg font-bold text-[14px] hover:bg-blue-600 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    원문 보기
                  </a>
                </div>
              )}
              
              {/* 관련 태그 */}
              <div className="mt-6 pt-6 border-t border-slate-100">
                <p className="text-[12px] font-bold text-slate-500 mb-3">관련 키워드</p>
                <div className="flex flex-wrap gap-2">
                  {extractKeywords(selectedNews).map((tag, index) => (
                    <span key={index} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-[12px] font-bold rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
