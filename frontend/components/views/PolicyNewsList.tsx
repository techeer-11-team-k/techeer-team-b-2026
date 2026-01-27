import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, X, ExternalLink, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Select } from '../ui/Select';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ReferenceLine,
  LabelList,
} from 'recharts';
import {
  fetchNews,
  fetchNewsDetail,
  fetchQuadrant,
  fetchTransactionVolume,
  type NewsItem as ApiNewsItem,
  type QuadrantDataPoint,
  type TransactionVolumeDataPoint,
} from '../../services/api';
import type { ComparisonData } from '../RegionComparisonChart';

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

// 기본 이미지 목록
const defaultImages = [
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&h=300&fit=crop',
];

// API 응답을 컴포넌트 NewsItem으로 변환
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
  
  // 키워드 사전에서 매칭되는 키워드 찾기
  keywordDictionary.forEach(keyword => {
    if (text.includes(keyword.toLowerCase()) && !foundKeywords.includes(keyword)) {
      foundKeywords.push(keyword);
    }
  });
  
  // 카테고리 추가 (중복 아닌 경우)
  if (news.category && !foundKeywords.includes(news.category)) {
    foundKeywords.unshift(news.category);
  }
  
  // 최대 5개까지만 반환
  return foundKeywords.slice(0, 5);
};

// 날짜 문자열 파싱 (다양한 형식 지원)
const parseNewsDate = (dateStr: string | undefined): Date => {
  // 빈 문자열이나 undefined 처리
  if (!dateStr || dateStr.trim() === '') {
    return new Date(0); // 최소 날짜 반환 (정렬 시 맨 뒤로)
  }
  
  // "기사입력 2026-01-22 18:56" 형식 처리
  const cleanedDate = dateStr.replace(/기사입력\s*/, '').trim();
  
  // ISO 형식 또는 일반 날짜 형식 시도
  const parsed = new Date(cleanedDate);
  
  // 유효한 날짜인지 확인
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // "2026-01-22 18:56" 형식 직접 파싱
  const match = cleanedDate.match(/(\d{4})-(\d{2})-(\d{2})\s*(\d{2})?:?(\d{2})?/);
  if (match) {
    const [, year, month, day, hour = '0', minute = '0'] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }
  
  // 파싱 실패 시 최소 날짜 반환
  return new Date(0);
};

// 날짜 포맷팅 (표시용) - 날짜가 없으면 빈 문자열 반환
const formatNewsDate = (dateStr: string | undefined): string | null => {
  // 빈 문자열이나 undefined 처리
  if (!dateStr || dateStr.trim() === '') {
    return null;
  }
  
  const date = parseNewsDate(dateStr);
  
  // 유효하지 않은 날짜 처리
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

type DashboardBottomView = 'policyNews' | 'transactionVolume' | 'marketPhase' | 'regionComparison';

interface PolicyNewsListProps {
  activeSection: DashboardBottomView;
  onSelectSection: (next: DashboardBottomView) => void;
  regionComparisonData?: ComparisonData[];
  isRegionComparisonLoading?: boolean;
}

export const PolicyNewsList: React.FC<PolicyNewsListProps> = ({
  activeSection,
  onSelectSection,
  regionComparisonData,
  isRegionComparisonLoading = false,
}) => {

  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 차트 데이터(좌측 카드에서도 직접 표시)
  const [txData, setTxData] = useState<Array<{ period: string; volume: number }>>([]);
  const [isTxLoading, setIsTxLoading] = useState(false);
  const [quadrantData, setQuadrantData] = useState<QuadrantDataPoint[]>([]);
  const [isQuadrantLoading, setIsQuadrantLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  // 뉴스 목록 (최신순)
  const sortedNewsList = [...newsList].sort((a, b) => {
    const dateA = parseNewsDate(a.date).getTime();
    const dateB = parseNewsDate(b.date).getTime();
    return dateB - dateA; // 최신순 정렬
  });

  // 뉴스 로드 함수
  const loadNews = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchNews(5);
      if (response.success && response.data) {
        setNewsList(response.data.map(mapApiToNewsItem));
      }
    } catch (err) {
      console.error('뉴스 로드 실패:', err);
      setError('뉴스를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 컴포넌트 마운트 시 뉴스 로드
  useEffect(() => {
    loadNews();
  }, [loadNews]);

  // 거래량/국면지표 데이터는 해당 탭에서만 로딩
  useEffect(() => {
    let cancelled = false;
    setPanelError(null);

    const load = async () => {
      try {
        if (activeSection === 'transactionVolume' && txData.length === 0 && !isTxLoading) {
          setIsTxLoading(true);
          const res = await fetchTransactionVolume('전국', 'sale', 3);
          if (cancelled) return;
          const raw = res?.success ? res.data : [];
          const rows = (raw || [])
            .map((d: TransactionVolumeDataPoint) => ({
              period: `${d.year}-${String(d.month).padStart(2, '0')}`,
              volume: d.volume,
            }))
            .sort((a, b) => a.period.localeCompare(b.period));
          setTxData(rows.slice(-24));
          setIsTxLoading(false);
        }

        if (activeSection === 'marketPhase' && quadrantData.length === 0 && !isQuadrantLoading) {
          setIsQuadrantLoading(true);
          const res = await fetchQuadrant(6);
          if (cancelled) return;
          setQuadrantData(res?.success ? res.data : []);
          setIsQuadrantLoading(false);
        }
      } catch {
        if (cancelled) return;
        setPanelError('데이터를 불러오지 못했습니다.');
        setIsTxLoading(false);
        setIsQuadrantLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  // 모달이 열릴 때 스크롤 고정
  useEffect(() => {
    if (selectedNews) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedNews]);

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

  const handleExternalLink = (e: React.MouseEvent, news: NewsItem) => {
    e.stopPropagation();
    if (news.url) {
      window.open(news.url, '_blank', 'noopener,noreferrer');
    }
  };

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
      <div className="bg-white rounded-[20px] md:rounded-[28px] p-4 md:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80 h-full flex flex-col">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-shrink-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">{headerTitle}</h2>
                {/* 새로고침 버튼(뉴스일 때만) */}
                {activeSection === 'policyNews' && (
                  <button 
                    onClick={loadNews}
                    className="text-[13px] font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 hover:bg-slate-50 p-2 rounded-lg transition-colors"
                    title="새로고침"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
              <p className="text-[13px] text-slate-500 font-medium">{headerSubtitle}</p>
            </div>

            {/* 이동 드롭다운 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative w-full md:w-[240px] flex-shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={activeSection}
                  onChange={(e) => onSelectSection(e.target.value as DashboardBottomView)}
                  className="w-full pl-9 pr-7 h-10 text-[14px] font-bold bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 appearance-none cursor-pointer hover:bg-slate-50 transition-colors"
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
        </div>
        
        <div className="flex-1 overflow-hidden min-h-0 relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={`h-full ${activeSection === 'policyNews' ? 'overflow-y-auto custom-scrollbar space-y-3 pr-2 md:max-h-none max-h-[300px]' : 'relative'}`}
            >
              {panelError ? (
                <div className="h-full flex items-center justify-center text-center px-4">
                  <p className="text-[13px] text-slate-500 font-medium">{panelError}</p>
                </div>
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
                        <RechartsTooltip
                          formatter={(v) => [`${Number(v).toLocaleString()}건`, '거래량']}
                          labelFormatter={(l) => `기간: ${l}`}
                        />
                        <defs>
                          <linearGradient id="txVolumeGradientLeft" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="volume"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          fill="url(#txVolumeGradientLeft)"
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
                        <RechartsTooltip
                          formatter={(value: any, name: any) => {
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
              ) : activeSection === 'regionComparison' ? (
                <div className="w-full h-full">
                  {isRegionComparisonLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-[13px] text-slate-500 font-medium">데이터 로딩 중...</p>
                    </div>
                  ) : !regionComparisonData || regionComparisonData.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-[13px] text-slate-500 font-medium">데이터가 없습니다</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={regionComparisonData} margin={{ top: 25, right: 20, left: 0, bottom: 120 }} barCategoryGap="10%" barGap={0} onMouseMove={() => {}} onMouseLeave={() => {}}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="region"
                          axisLine={false}
                          tickLine={false}
                          height={140}
                          interval={0}
                          tick={(props: { x?: number; y?: number; index?: number }) => {
                            const entry = regionComparisonData[props.index ?? 0] as ComparisonData | undefined;
                            if (!entry) return null;
                            return (
                              <g transform={`translate(${props.x}, ${props.y}) rotate(-35)`}>
                                <text textAnchor="end" x={0} y={0} fontSize={11} fontWeight="bold" fill="#64748b">
                                  <tspan x={0} dy={0}>{entry.aptName || ''}</tspan>
                                  <tspan x={0} dy={14} fontSize={10} fill="#94a3b8">{entry.region || ''}</tspan>
                                </text>
                              </g>
                            );
                          }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 'bold' }}
                          tickFormatter={(val) => `${val > 0 ? '+' : ''}${Number(val).toFixed(1)}%`}
                          width={55}
                          domain={regionComparisonData.every((d) => (d.myProperty ?? -1) >= 0 && (d.regionAverage ?? -1) >= 0) ? [0, 'auto'] : undefined}
                        />
                        <RechartsTooltip active={false} cursor={false} content={() => null} />
                        <Bar dataKey="myProperty" name="내 단지" radius={[8, 8, 0, 0]} isAnimationActive={false} activeBar={false} maxBarSize={40}>
                          {regionComparisonData.map((entry, index) => (
                            <Cell key={`cell-my-left-${index}`} fill={entry.myProperty >= 0 ? '#3b82f6' : '#ef4444'} />
                          ))}
                          <LabelList
                            dataKey="myProperty"
                            position="top"
                            formatter={(val: number) => `${val > 0 ? '+' : ''}${val.toFixed(1)}%`}
                            style={{ fontSize: 10, fontWeight: 'bold', fill: '#3b82f6' }}
                          />
                        </Bar>
                        <Bar dataKey="regionAverage" name="지역 평균" radius={[8, 8, 0, 0]} isAnimationActive={false} activeBar={false} maxBarSize={40}>
                          {regionComparisonData.map((entry, index) => (
                            <Cell key={`cell-avg-left-${index}`} fill={entry.regionAverage >= 0 ? '#8b5cf6' : '#f59e0b'} />
                          ))}
                          <LabelList
                            dataKey="regionAverage"
                            position="top"
                            formatter={(val: number) => `${val > 0 ? '+' : ''}${val.toFixed(1)}%`}
                            style={{ fontSize: 10, fontWeight: 'bold', fill: '#8b5cf6' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ) : isLoading ? (
                // 로딩 스켈레톤
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-2xl border border-slate-100 animate-pulse">
                    <div className="w-20 h-20 rounded-xl bg-slate-200"></div>
                    <div className="flex-1">
                      <div className="h-4 w-16 bg-slate-200 rounded mb-2"></div>
                      <div className="h-5 w-3/4 bg-slate-200 rounded mb-2"></div>
                      <div className="h-4 w-full bg-slate-200 rounded"></div>
                    </div>
                  </div>
                ))
              ) : error ? (
                // 에러 상태
                <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                  <p className="text-[14px] mb-2">{error}</p>
                  <button 
                    onClick={loadNews}
                    className="text-[13px] text-blue-500 hover:text-blue-600 font-bold"
                  >
                    다시 시도
                  </button>
                </div>
              ) : sortedNewsList.length === 0 ? (
                // 뉴스 없음
                <div className="flex items-center justify-center h-full text-slate-400">
                  <p className="text-[14px]">뉴스가 없습니다.</p>
                </div>
              ) : (
                // 뉴스 목록
                sortedNewsList.map((news) => (
                  <div
                    key={news.id}
                    onClick={() => setSelectedNews(news)}
                    className="group relative flex items-start gap-3 md:gap-4 py-3 md:p-4 md:rounded-2xl border-b md:border md:border-slate-100 md:hover:border-slate-200 md:hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all cursor-pointer last:border-b-0"
                  >
                    {/* 외부 링크 아이콘 */}
                    <button
                      onClick={(e) => handleExternalLink(e, news)}
                      className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors opacity-0 group-hover:opacity-100"
                      title="원문 보기"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    
                    {/* 썸네일 이미지 */}
                    <div className="flex flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-slate-100">
                      <img 
                        src={news.image} 
                        alt={news.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = defaultImages[0];
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                        <span className={`flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${getCategoryColor(news.category)}`}>
                          {news.category}
                        </span>
                        <span className="text-[11px] text-slate-400">{news.source}</span>
                        {(() => {
                          const formattedDate = formatNewsDate(news.date);
                          return formattedDate ? (
                            <span className="text-[11px] text-slate-400 font-medium ml-auto">{formattedDate}</span>
                          ) : null;
                        })()}
                      </div>
                      <h3 className="text-[14px] md:text-[15px] font-black text-slate-900 mb-1 md:mb-1 group-hover:text-brand-blue transition-colors line-clamp-2 md:line-clamp-1">
                        {news.title}
                      </h3>
                      <p className="hidden md:block text-[13px] text-slate-500 font-medium line-clamp-1 mb-1.5">
                        {news.description}
                      </p>
                    </div>
                  </div>
                ))
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
              className="fixed z-[101] w-full md:max-w-3xl bg-white md:rounded-3xl shadow-2xl overflow-hidden flex flex-col bottom-0 md:bottom-auto rounded-t-[24px] md:rounded-t-3xl max-h-[90vh] md:max-h-[85vh] md:top-[120px] md:left-[calc(50%-400px)] md:-translate-x-1/2 md:translate-y-0"
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
