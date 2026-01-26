import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar, TrendingUp, FileText, AlertCircle, X, TrendingDown, ChevronRight, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Sector, Area, AreaChart } from 'recharts';
import { fetchInterestRates, type InterestRateItem } from '../services/api';
import { useUser } from '@clerk/clerk-react';

interface PortfolioData {
  region: string;
  value: number;
  color: string;
}

interface FavoriteApartment {
  id: string;
  name: string;
  location: string;
  area: number;
  currentPrice: number;
  changeRate: number;
}

interface EventItem {
  id: string;
  title: string;
  date: string;
  daysLeft?: number;
  iconType: 'tax' | 'update' | 'deadline' | 'alert';
  type: 'tax' | 'update' | 'deadline' | 'alert';
}

interface InterestRateData {
  label: string;
  value: number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  history: { month: string; value: number }[];
}

// 지역 라벨 정규화 (예: 경기 -> 경기도, 전라북 -> 전라북도, 서울특별시/서울시 -> 서울)
const REGION_SHORTHAND_MAP: Record<string, string> = {
  경기: '경기도',
  강원: '강원도',
  충청북: '충청북도',
  충청남: '충청남도',
  전라북: '전라북도',
  전라남: '전라남도',
  경상북: '경상북도',
  경상남: '경상남도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전라북도',
  전남: '전라남도',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주도',
};

const normalizeTopLevelRegionLabel = (raw: string): string => {
  const t = (raw ?? '').trim();
  if (!t) return t;

  const mapped = REGION_SHORTHAND_MAP[t];
  if (mapped) return mapped;

  // 특별자치 명칭은 너무 길어 UI가 잘릴 수 있어 축약
  if (t === '세종특별자치시') return '세종';
  if (t === '제주특별자치도') return '제주도';
  if (t === '강원특별자치도') return '강원도';

  // '도'는 유지 (경기도/전라북도 등). '시' 계열만 축약.
  if (t.endsWith('특별시')) return t.replace(/특별시$/, '');
  if (t.endsWith('광역시')) return t.replace(/광역시$/, '');
  if (t.endsWith('특별자치시')) return t.replace(/특별자치시$/, '');
  if (t.endsWith('시')) return t.replace(/시$/, '');

  return t;
};

// 내 자산 아파트 데이터 (Dashboard의 내 자산 탭 기반)
const myAssetApartments: FavoriteApartment[] = [
  { id: 'a1', name: '시흥 배곧 호반써밋', location: '시흥시 배곧동', area: 84, currentPrice: 45000, changeRate: 9.7 },
  { id: 'a2', name: '김포 한강 센트럴자이', location: '김포시 장기동', area: 84, currentPrice: 39000, changeRate: -7.1 },
  { id: 'a3', name: '수원 영통 황골마을', location: '수원시 영통구', area: 84, currentPrice: 32000, changeRate: 14.2 },
];

// 관심 리스트 아파트 데이터 (Dashboard에서 가져온 데이터 기반)
const favoriteApartments: FavoriteApartment[] = [
  { id: 'f1-1', name: '성동구 옥수 파크힐스', location: '서울시 성동구', area: 59, currentPrice: 145000, changeRate: 3.5 },
  { id: 'f1-2', name: '마포 래미안 푸르지오', location: '서울시 마포구', area: 84, currentPrice: 182000, changeRate: 2.2 },
  { id: 'f2-1', name: '천안 불당 지웰', location: '천안시 서북구', area: 84, currentPrice: 75000, changeRate: -1.3 },
  { id: 'f2-2', name: '청주 지웰시티 1차', location: '청주시 흥덕구', area: 99, currentPrice: 62000, changeRate: 3.3 },
];

// 관심 리스트 기반 포트폴리오 데이터 계산
const calculatePortfolioData = (): PortfolioData[] => {
  const regionMap = new Map<string, { total: number; count: number }>();
  
  favoriteApartments.forEach(apt => {
    const region = apt.location.split(' ')[0]; // '서울시' -> '서울', '천안시' -> '천안'
    const regionKey = normalizeTopLevelRegionLabel(region);
    const existing = regionMap.get(regionKey) || { total: 0, count: 0 };
    existing.total += apt.currentPrice;
    existing.count += 1;
    regionMap.set(regionKey, existing);
  });
  
  const total = Array.from(regionMap.values()).reduce((sum, item) => sum + item.total, 0);
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
  
  return Array.from(regionMap.entries()).map(([region, data], index) => ({
    region,
    value: Math.round((data.total / total) * 100),
    color: colors[index % colors.length],
  }));
};

const mockEvents: EventItem[] = [
  {
    id: '1',
    title: '재산세 납부',
    date: '2024.07.15',
    daysLeft: 15,
    iconType: 'tax',
    type: 'tax',
  },
  {
    id: '2',
    title: '관심 단지 실거래가 업데이트',
    date: '2024.07.01',
    iconType: 'update',
    type: 'update',
  },
  {
    id: '3',
    title: '부동산 등기 신고 마감',
    date: '2024.07.20',
    daysLeft: 20,
    iconType: 'deadline',
    type: 'deadline',
  },
  {
    id: '4',
    title: '임대료 수령일',
    date: '2024.07.05',
    daysLeft: 5,
    iconType: 'alert',
    type: 'alert',
  },
];

const getEventColor = (type: string) => {
  const colors: Record<string, string> = {
    tax: 'text-blue-600 bg-blue-50',
    update: 'text-purple-600 bg-purple-50',
    deadline: 'text-orange-600 bg-orange-50',
    alert: 'text-green-600 bg-green-50',
  };
  return colors[type] || 'text-slate-600 bg-slate-50';
};

const lineChartData = [
  { period: '6개월 전', value: 8.5 },
  { period: '5개월 전', value: 7.8 },
  { period: '4개월 전', value: 6.2 },
  { period: '3개월 전', value: 5.1 },
  { period: '2개월 전', value: 4.8 },
  { period: '1개월 전', value: 4.5 },
  { period: '현재', value: 4.21 },
];

const getEventIcon = (type: string) => {
  switch (type) {
    case 'tax':
      return <Calendar className="w-4 h-4" />;
    case 'update':
      return <TrendingUp className="w-4 h-4" />;
    case 'deadline':
      return <FileText className="w-4 h-4" />;
    case 'alert':
      return <AlertCircle className="w-4 h-4" />;
    default:
      return <Calendar className="w-4 h-4" />;
  }
};

interface ProfileWidgetsCardProps {
  activeGroupName?: string;
  assets?: any[];
  isHorizontal?: boolean;
  showProfile?: boolean;
  showInterestRates?: boolean;
  showPortfolio?: boolean;
  isMobileRateHorizontal?: boolean;
}

// 금리 지표 드롭다운 컴포넌트
const InterestRateDropdown: React.FC<{
  value: number;
  onChange: (value: number) => void;
  options: { index: number; label: string }[];
}> = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.index === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-[11px] font-medium px-2 py-1 rounded-md bg-slate-100 text-slate-600 border-none cursor-pointer hover:bg-slate-200 transition-all focus:outline-none flex items-center gap-1"
      >
        <span>{selectedOption?.label || options[0]?.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      <div 
        className={`absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 transition-all duration-200 ease-out origin-top min-w-full overflow-y-auto custom-scrollbar ${
          isOpen 
            ? 'opacity-100 scale-y-100 translate-y-0 pointer-events-auto max-h-[150px]' 
            : 'opacity-0 scale-y-95 -translate-y-1 pointer-events-none max-h-0 overflow-hidden'
        }`}
      >
        {options.map((option) => (
          <button
            key={option.index}
            onClick={() => {
              onChange(option.index);
              setIsOpen(false);
            }}
            className={`w-full text-left text-[11px] font-medium py-2 px-3 hover:bg-slate-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
              value === option.index ? 'bg-slate-100 text-slate-900' : 'text-slate-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const ProfileWidgetsCard: React.FC<ProfileWidgetsCardProps> = ({ 
  activeGroupName = '내 자산', 
  assets, 
  isHorizontal = false,
  showProfile = true,
  showInterestRates = true,
  showPortfolio = true,
  isMobileRateHorizontal = false
}) => {
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedApartmentIndex, setSelectedApartmentIndex] = useState<number | null>(null);
  const [selectedRateIndex, setSelectedRateIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [interestRates, setInterestRates] = useState<InterestRateData[]>([]);
  const [isRatesLoading, setIsRatesLoading] = useState(true);
  const [portfolioViewMode, setPortfolioViewMode] = useState<'apartment' | 'region'>('apartment');
  const eventRefs = useRef<(HTMLDivElement | null)[]>([]);
  const currentValue = 4.21;
  
  // Clerk 사용자 정보
  const { user: clerkUser } = useUser();

  // 금리 데이터 API 호출
  useEffect(() => {
    const loadInterestRates = async () => {
      try {
        setIsRatesLoading(true);
        const response = await fetchInterestRates();
        if (response.success && response.data) {
          const ratesData: InterestRateData[] = response.data.map((rate) => ({
            label: rate.rate_label,
            value: rate.rate_value,
            change: rate.change_value,
            trend: rate.trend,
            // 히스토리 데이터는 API에서 제공하지 않으므로 시뮬레이션
            history: generateRateHistory(rate.rate_value, rate.change_value, rate.trend),
          }));
          setInterestRates(ratesData);
        }
      } catch (error) {
        console.error('금리 데이터 로드 실패:', error);
        // 실패 시 기본 데이터 유지
      } finally {
        setIsRatesLoading(false);
      }
    };
    loadInterestRates();
  }, []);

  // 금리 히스토리 데이터 생성 (1년)
  const generateRateHistory = (currentValue: number, change: number, trend: string) => {
    // 1년 전과 현재만 표시
    const history = [];
    
    if (trend === 'up') {
      // 상승: 1년 전 낮았음 → 현재 높음
      history.push({ month: '1년', value: Math.round((currentValue - Math.abs(change) * 3) * 100) / 100 });
      history.push({ month: '현재', value: Math.round(currentValue * 100) / 100 });
    } else if (trend === 'down') {
      // 하락: 1년 전 높았음 → 현재 낮음
      history.push({ month: '1년', value: Math.round((currentValue + Math.abs(change) * 3) * 100) / 100 });
      history.push({ month: '현재', value: Math.round(currentValue * 100) / 100 });
    } else {
      // 동결: 약간의 변동 추가
      history.push({ month: '1년', value: Math.round((currentValue + 0.05) * 100) / 100 });
      history.push({ month: '현재', value: Math.round(currentValue * 100) / 100 });
    }
    return history;
  };

  // 현재 탭에 따른 아파트 데이터 선택 (실제 데이터만 사용)
  const currentApartments = useMemo(() => {
    // assets가 전달되면 해당 데이터 사용
    if (assets && assets.length > 0) {
      return assets.map((asset, index) => ({
        id: asset.id || `asset-${index}`,
        name: asset.name,
        location: asset.location || '위치 정보 없음',
        area: asset.area || 84,
        currentPrice: asset.currentPrice || 0,
        changeRate: asset.changeRate || asset.profitRate || 0,
      }));
    }
    // 데이터가 없으면 빈 배열 반환 (더미 데이터 대신)
    return [];
  }, [assets]);

  // 디데이 순으로 정렬 (daysLeft가 작을수록 위에)
  const sortedEvents = useMemo(() => {
    return [...mockEvents].sort((a, b) => {
      // daysLeft가 없는 경우 맨 아래로
      if (!a.daysLeft && !b.daysLeft) return 0;
      if (!a.daysLeft) return 1;
      if (!b.daysLeft) return -1;
      return a.daysLeft - b.daysLeft;
    });
  }, []);
  
  // 이벤트 툴팁 위치 계산
  const handleEventClick = (event: EventItem, index: number) => {
    const el = eventRefs.current[index];
    if (el) {
      const rect = el.getBoundingClientRect();
      setTooltipPosition({ x: rect.right + 10, y: rect.top });
      setSelectedEvent(event);
    }
  };

  // 외부 클릭시 툴팁 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectedEvent && !(e.target as HTMLElement).closest('.event-tooltip')) {
        setSelectedEvent(null);
        setTooltipPosition(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [selectedEvent]);

  // 스크롤 시 툴팁 닫기
  useEffect(() => {
    const handleScroll = () => {
      if (selectedEvent) {
        setSelectedEvent(null);
        setTooltipPosition(null);
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [selectedEvent]);

  // 가로 레이아웃용 포트폴리오 데이터 계산
  const horizontalPortfolioData = useMemo(() => {
    if (currentApartments.length === 0) return { regions: [], apartments: [] };
    
    const chartColors = ['#3182F6', '#FF4B4B', '#f59e0b', '#8b5cf6', '#10b981', '#06b6d4'];
    const totalPrice = currentApartments.reduce((sum, a) => sum + a.currentPrice, 0);
    
    // 지역별 데이터
    const extractRegion = (location: string) => {
      const parts = location.split(' ');
      if (parts.length > 0) {
        return normalizeTopLevelRegionLabel(parts[0]);
      }
      return normalizeTopLevelRegionLabel(location);
    };
    
    const regionMap = new Map<string, number>();
    currentApartments.forEach(apt => {
      const region = extractRegion(apt.location);
      regionMap.set(region, (regionMap.get(region) || 0) + apt.currentPrice);
    });
    
    const regions = Array.from(regionMap.entries())
      .map(([name, price], index) => ({
        name,
        percentage: Math.round((price / totalPrice) * 100),
        color: chartColors[index % chartColors.length]
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3);
    
    // 아파트별 데이터
    const apartments = currentApartments
      .map((apt, index) => ({
        name: apt.name,
        percentage: Math.round((apt.currentPrice / totalPrice) * 100),
        color: chartColors[index % chartColors.length]
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3);
    
    return { regions, apartments };
  }, [currentApartments]);

  // 모바일 상단 가로 금리 지표
  if (isMobileRateHorizontal) {
    return (
      <div className="bg-white rounded-[20px] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-black text-slate-900 whitespace-nowrap">금리 지표</h3>
              {!isRatesLoading && interestRates.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ 
                  interestRates[selectedRateIndex ?? 0]?.trend === 'stable' ? 'bg-slate-800 text-white' : 
                  interestRates[selectedRateIndex ?? 0]?.change > 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {interestRates[selectedRateIndex ?? 0]?.trend === 'stable' ? '동결' : 
                   interestRates[selectedRateIndex ?? 0]?.change > 0 ? `+${interestRates[selectedRateIndex ?? 0]?.change.toFixed(2)}%` : 
                   `${interestRates[selectedRateIndex ?? 0]?.change.toFixed(2)}%`}
                </span>
              )}
            </div>
            
            {!isRatesLoading && interestRates.length > 0 ? (
              <div className="flex items-baseline gap-2">
                <span className="text-[20px] font-black text-slate-900 tabular-nums">
                  {interestRates[selectedRateIndex ?? 0]?.value.toFixed(2)}%
                </span>
                <InterestRateDropdown
                  value={selectedRateIndex ?? 0}
                  onChange={(index) => setSelectedRateIndex(index)}
                  options={interestRates.map((rate, index) => ({ index, label: rate.label }))}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="text-[11px] text-slate-400">로딩 중...</span>
              </div>
            )}
          </div>
          
          {/* 미니 금리 그래프 */}
          {!isRatesLoading && interestRates.length > 0 && interestRates[selectedRateIndex ?? 0]?.history && (
            <div className="w-[100px] h-[50px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={interestRates[selectedRateIndex ?? 0]?.history.slice(-6)} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                  <defs>
                    <linearGradient id="rateGradientMobile" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3182F6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3182F6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#3182F6" 
                    strokeWidth={2}
                    fill="url(#rateGradientMobile)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 가로 레이아웃 (태블릿용)
  if (isHorizontal) {
    return (
      <div className="bg-white rounded-[28px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80">
        <div className="flex items-center gap-5">
          {/* 금리 지표 섹션 - 값 표시 및 필터 */}
          <div className="flex items-center gap-4 pr-5 border-r border-slate-100 flex-shrink-0">
            {/* 금리 값 및 배지 */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h3 className="text-[12px] font-black text-slate-900 whitespace-nowrap">금리</h3>
                {!isRatesLoading && interestRates.length > 0 && (
                  <>
                    <span className="text-[18px] font-black text-slate-900">
                      {interestRates[selectedRateIndex ?? 0]?.value.toFixed(2)}%
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${ 
                      interestRates[selectedRateIndex ?? 0]?.trend === 'stable' ? 'bg-slate-800 text-white' : 
                      interestRates[selectedRateIndex ?? 0]?.change > 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {interestRates[selectedRateIndex ?? 0]?.trend === 'stable' ? '동결' : 
                       interestRates[selectedRateIndex ?? 0]?.change > 0 ? `+${interestRates[selectedRateIndex ?? 0]?.change.toFixed(2)}%` : 
                       `${interestRates[selectedRateIndex ?? 0]?.change.toFixed(2)}%`}
                    </span>
                  </>
                )}
                {isRatesLoading && (
                  <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                )}
              </div>
              {/* 금리 종류 필터 */}
              {!isRatesLoading && interestRates.length > 0 && (
                <select
                  value={selectedRateIndex ?? 0}
                  onChange={(e) => setSelectedRateIndex(Number(e.target.value))}
                  className="text-[10px] font-medium px-2 py-1 mt-1 rounded-md bg-slate-100 text-slate-600 border-none cursor-pointer hover:bg-slate-200 transition-all focus:outline-none"
                >
                  {interestRates.map((rate, index) => (
                    <option key={index} value={index}>{rate.label}</option>
                  ))}
                </select>
              )}
            </div>
            
            {/* 미니 금리 그래프 */}
            {!isRatesLoading && interestRates.length > 0 && interestRates[selectedRateIndex ?? 0]?.history && (
              <div className="w-[100px] h-[40px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={interestRates[selectedRateIndex ?? 0]?.history.slice(-6)} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                    <defs>
                      <linearGradient id="rateGradientHorizontal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3182F6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3182F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3182F6" 
                      strokeWidth={1.5}
                      fill="url(#rateGradientHorizontal)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 지역 포트폴리오 - 미니 원형 그래프 */}
          <div className="flex items-center gap-3 pl-4 pr-5 border-r border-slate-100 flex-shrink-0">
            <h3 className="text-[12px] font-black text-slate-900 whitespace-nowrap">지역</h3>
            {currentApartments.length === 0 ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-slate-300" />
                </div>
                <span className="text-[9px] text-slate-400">없음</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* 미니 원형 그래프 */}
                <div className="w-10 h-10 relative">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    {horizontalPortfolioData.regions.reduce((acc, region, idx) => {
                      const prevOffset = acc.offset;
                      const dashArray = `${region.percentage} ${100 - region.percentage}`;
                      acc.elements.push(
                        <circle
                          key={idx}
                          cx="18"
                          cy="18"
                          r="14"
                          fill="none"
                          stroke={region.color}
                          strokeWidth="4"
                          strokeDasharray={dashArray}
                          strokeDashoffset={-prevOffset}
                        />
                      );
                      acc.offset += region.percentage;
                      return acc;
                    }, { offset: 0, elements: [] as React.ReactNode[] }).elements}
                  </svg>
                </div>
                {/* 범례 */}
                <div className="flex flex-col gap-0.5">
                  {horizontalPortfolioData.regions.slice(0, 2).map((region, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: region.color }}></div>
                      <span className="text-[9px] text-slate-600">{region.name}</span>
                      <span className="text-[9px] font-bold text-slate-900">{region.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 아파트 포트폴리오 - 미니 원형 그래프 */}
          <div className="flex items-center gap-3 pl-4 pr-5 border-r border-slate-100 flex-shrink-0">
            <h3 className="text-[12px] font-black text-slate-900 whitespace-nowrap">아파트</h3>
            {currentApartments.length === 0 ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-slate-300" />
                </div>
                <span className="text-[9px] text-slate-400">없음</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* 미니 원형 그래프 */}
                <div className="w-10 h-10 relative">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    {horizontalPortfolioData.apartments.reduce((acc, apt, idx) => {
                      const prevOffset = acc.offset;
                      const dashArray = `${apt.percentage} ${100 - apt.percentage}`;
                      acc.elements.push(
                        <circle
                          key={idx}
                          cx="18"
                          cy="18"
                          r="14"
                          fill="none"
                          stroke={apt.color}
                          strokeWidth="4"
                          strokeDasharray={dashArray}
                          strokeDashoffset={-prevOffset}
                        />
                      );
                      acc.offset += apt.percentage;
                      return acc;
                    }, { offset: 0, elements: [] as React.ReactNode[] }).elements}
                  </svg>
                </div>
                {/* 범례 */}
                <div className="flex flex-col gap-0.5">
                  {horizontalPortfolioData.apartments.slice(0, 2).map((apt, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: apt.color }}></div>
                      <span className="text-[9px] text-slate-600 truncate max-w-[50px]">{apt.name}</span>
                      <span className="text-[9px] font-bold text-slate-900">{apt.percentage}%</span>
                    </div>
                  ))}
                  {currentApartments.length > 2 && (
                    <span className="text-[8px] text-slate-400">+{currentApartments.length - 2}개</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 등록 자산 수 */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <span className="text-[10px] text-slate-500 font-medium">자산</span>
            <span className="text-[16px] font-black text-slate-900">{currentApartments.length}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`bg-white rounded-[28px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80 h-full flex flex-col ${!showProfile && 'pt-4'}`}>
        {/* Profile Section */}
        {showProfile && (
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
            <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
              {clerkUser?.imageUrl ? (
                <img src={clerkUser.imageUrl} alt="User" className="w-full h-full object-cover" />
              ) : (
                <img 
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" 
                  alt="User" 
                  className="w-full h-full" 
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-black text-slate-900 truncate">
                {clerkUser?.fullName || clerkUser?.firstName || '사용자'}
              </p>
              <p className="text-[12px] text-slate-500 font-medium">투자자</p>
            </div>
          </div>
        )}

        {/* 금리 지표 Section */}
        {showInterestRates && (
          <div className="mb-4 pb-4 border-b border-slate-100">
            <h3 className="text-[15px] font-black text-slate-900 mb-3">금리 지표</h3>
            
            {isRatesLoading ? (
              <div className="flex flex-col items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-2"></div>
                <span className="text-[10px] text-slate-400">로딩 중...</span>
              </div>
            ) : interestRates.length === 0 ? (
              <div className="text-center py-4">
                <span className="text-[10px] text-slate-400">금리 데이터가 없습니다</span>
              </div>
            ) : (
              <div className="space-y-3">
                {interestRates.map((rate, index) => {
                  // 게이지바 비율 계산 (0~10% 범위 기준)
                  const gaugePercent = Math.min(Math.max((rate.value / 10) * 100, 0), 100);
                  // 기준금리: 노란색, 주담대(고정/변동): 파란색, 전세대출: 검은색
                  const isBaseRate = index === 0;
                  const isMortgage = index === 1 || index === 2; // 주담대(고정), 주담대(변동)
                  
                  const dotColor = isBaseRate ? 'bg-amber-500' : isMortgage ? 'bg-blue-500' : 'bg-slate-700';
                  const gaugeColor = isBaseRate ? 'from-amber-400 to-amber-500' : isMortgage ? 'from-blue-400 to-blue-600' : 'from-slate-600 to-slate-800';
                  const chartColor = isBaseRate ? '#f59e0b' : isMortgage ? '#3b82f6' : '#475569';
                  
                  return (
                    <div 
                      key={index} 
                      onClick={() => setSelectedRateIndex(selectedRateIndex === index ? null : index)}
                      className={`rounded-xl transition-all duration-200 cursor-pointer p-2 ${ 
                        selectedRateIndex === index 
                          ? 'bg-slate-50' 
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* 라벨과 변동률 */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></div>
                          <span className="text-[11px] font-bold text-slate-800">{rate.label}</span>
                        </div>
                        <span className={`text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${ 
                          rate.trend === 'stable' 
                            ? 'bg-slate-800 text-white' 
                            : rate.change > 0 
                              ? 'bg-red-100 text-red-600' 
                              : 'bg-blue-100 text-blue-600'
                        }`}>
                          {rate.trend === 'stable' ? '동결' : 
                           rate.change > 0 ? `+${rate.change.toFixed(2)}%` : 
                           `${rate.change.toFixed(2)}%`}
                        </span>
                      </div>
                      
                      {/* 금리 값 */}
                      <div className="font-black tabular-nums mb-1.5 text-[15px] text-slate-900">
                        {rate.value.toFixed(2)}%
                      </div>
                      
                      {/* 게이지바 */}
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${gaugeColor}`}
                          style={{ width: `${gaugePercent}%` }}
                        ></div>
                      </div>
                      
                      {/* 미니 차트 - 클릭 시 표시 (간단한 SVG 선 그래프) */}
                      {selectedRateIndex === index && rate.history.length >= 2 && (
                        <div className="mt-2 flex justify-center">
                          <div className="w-[90%] h-[45px] animate-fade-in bg-white rounded-lg px-3 py-2 border border-slate-200">
                            <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none">
                              {/* 선 그래프 */}
                              <line 
                                x1="10" 
                                y1={rate.history[0].value > rate.history[1].value ? "8" : rate.history[0].value < rate.history[1].value ? "22" : "15"} 
                                x2="90" 
                                y2={rate.history[0].value > rate.history[1].value ? "22" : rate.history[0].value < rate.history[1].value ? "8" : "15"} 
                                stroke={chartColor} 
                                strokeWidth="2.5" 
                                strokeLinecap="round"
                              />
                              {/* 시작점 */}
                              <circle 
                                cx="10" 
                                cy={rate.history[0].value > rate.history[1].value ? "8" : rate.history[0].value < rate.history[1].value ? "22" : "15"} 
                                r="4" 
                                fill={chartColor} 
                                stroke="white" 
                                strokeWidth="2"
                              />
                              {/* 끝점 */}
                              <circle 
                                cx="90" 
                                cy={rate.history[0].value > rate.history[1].value ? "22" : rate.history[0].value < rate.history[1].value ? "8" : "15"} 
                                r="4" 
                                fill={chartColor} 
                                stroke="white" 
                                strokeWidth="2"
                              />
                            </svg>
                            <div className="flex justify-between text-[8px] font-semibold text-slate-500 -mt-1">
                              <span>1년</span>
                              <span>현재</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* 지역 포트폴리오 Section - 항상 지역 모드로 표시 */}
      {showPortfolio && (
        <>
        <div className={`pb-4 border-b border-slate-100 ${currentApartments.length === 0 ? 'flex-1 flex flex-col mt-2' : 'mb-4 mt-2'}`}>
          <h3 className="text-[15px] font-black text-slate-900 mb-2">지역 포트폴리오</h3>
          
          {currentApartments.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                <TrendingUp className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-[12px] font-bold text-slate-500 mb-0.5">등록된 자산이 없습니다</p>
              <p className="text-[10px] text-slate-400">자산을 추가하면 확인할 수 있습니다</p>
            </div>
          ) : (() => {
            // 차트 색상 배열 (관심 리스트와 동일한 색상 사용)
            const chartColors = ['#3182F6', '#FF4B4B', '#f59e0b', '#8b5cf6', '#10b981', '#06b6d4'];
            const totalPrice = currentApartments.reduce((sum, a) => sum + a.currentPrice, 0);
            
            // 지역 이름 추출 헬퍼 (서울시 성동구 -> 서울, 천안시 서북구 -> 천안)
            const extractRegion = (location: string) => {
              const parts = location.split(' ');
              if (parts.length > 0) {
                return normalizeTopLevelRegionLabel(parts[0]);
              }
              return normalizeTopLevelRegionLabel(location);
            };
            
            // 지역별 데이터 계산
            const regionMap = new Map<string, { total: number; apartments: string[] }>();
            currentApartments.forEach(apt => {
              const region = extractRegion(apt.location);
              const existing = regionMap.get(region) || { total: 0, apartments: [] };
              existing.total += apt.currentPrice;
              existing.apartments.push(apt.name);
              regionMap.set(region, existing);
            });
            
            // 지역별 데이터를 배열로 변환 및 반올림 오차 보정
            const regionRawData = Array.from(regionMap.entries()).map(([region, data]) => ({
              id: region,
              name: region,
              location: region,
              price: data.total,
              apartments: data.apartments,
              rawPercentage: totalPrice > 0 ? (data.total / totalPrice) * 100 : 0,
            }));
            
            const regionRoundedData = regionRawData.map(r => ({
              ...r,
              percentage: Math.round(r.rawPercentage),
            }));
            
            const regionTotalRounded = regionRoundedData.reduce((sum, r) => sum + r.percentage, 0);
            const regionDiff = 100 - regionTotalRounded;
            if (regionDiff !== 0 && regionRoundedData.length > 0) {
              const maxIndex = regionRoundedData.reduce((maxIdx, r, idx, arr) => 
                r.percentage > arr[maxIdx].percentage ? idx : maxIdx, 0);
              regionRoundedData[maxIndex].percentage += regionDiff;
            }
            
            const regionData = regionRoundedData.map((r, index) => ({
              ...r,
              color: chartColors[index % chartColors.length],
            }));
            
            // % 높은 순으로 정렬
            const sortedRegions = [...regionData].sort((a, b) => b.percentage - a.percentage);
            
            return (
              <div className="flex flex-col items-center">
                <div className="w-[130px] h-[130px] relative mb-3 overflow-visible">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie
                        data={sortedRegions.map(item => ({
                          name: item.name,
                          value: item.percentage,
                          color: item.color,
                          location: item.location,
                          price: item.price,
                          apartments: item.apartments,
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={selectedApartmentIndex !== null ? 58 : 55}
                        paddingAngle={2}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                        labelLine={false}
                        activeShape={(props: any) => {
                          const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                          return (
                            <g>
                              <Sector
                                cx={cx}
                                cy={cy}
                                innerRadius={innerRadius - 2}
                                outerRadius={outerRadius + 3}
                                startAngle={startAngle}
                                endAngle={endAngle}
                                fill={fill}
                                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
                              />
                            </g>
                          );
                        }}
                        onMouseEnter={(_, index) => setSelectedApartmentIndex(index)}
                        onMouseLeave={() => setSelectedApartmentIndex(null)}
                        onClick={(_, index) => setSelectedApartmentIndex(selectedApartmentIndex === index ? null : index)}
                      >
                        {sortedRegions.map((item, index) => (
                          <Cell 
                            key={`cell-${index}`}
                            fill={item.color}
                            style={{ 
                              cursor: 'pointer',
                              opacity: selectedApartmentIndex !== null && selectedApartmentIndex !== index ? 0.4 : 1,
                              transition: 'opacity 0.2s ease'
                            }}
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-[11px]">
                                <p className="font-bold">{data.name}</p>
                                <p className="text-slate-300">{data.value}%</p>
                                {data.apartments && (
                                  <p className="text-slate-400 mt-1 text-[9px]">{data.apartments.join(', ')}</p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* 범례 (지역별) */}
                <div
                  className={`w-full space-y-1.5 ${ 
                    sortedRegions.length > 5
                      ? 'max-h-[140px] overflow-y-auto overscroll-contain scrollbar-hide'
                      : ''
                  }`}
                >
                  {sortedRegions.map((item, index) => {
                    const isSelected = selectedApartmentIndex === index;
                    return (
                      <div 
                        key={item.id} 
                        className={`flex items-center justify-between cursor-pointer p-1.5 rounded-lg transition-all ${ 
                          isSelected ? 'bg-slate-100 scale-[1.02]' : 'hover:bg-slate-50'
                        } ${selectedApartmentIndex !== null && !isSelected ? 'opacity-50' : ''}`}
                        onClick={() => setSelectedApartmentIndex(isSelected ? null : index)}
                        onMouseEnter={() => setSelectedApartmentIndex(index)}
                        onMouseLeave={() => setSelectedApartmentIndex(null)}
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform ${isSelected ? 'scale-125' : ''}`}
                            style={{ backgroundColor: item.color }}
                          ></div>
                          <span className={`text-[11px] font-bold truncate max-w-[90px] transition-colors ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>
                            {item.name}
                          </span>
                        </div>
                        <span className={`text-[11px] font-bold transition-colors ${isSelected ? 'text-blue-600' : 'text-slate-900'}`}>{item.percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* 아파트 포트폴리오 Section - 아파트가 있을 때 표시 */}
        {currentApartments.length > 0 && (() => {
          // 차트 색상 배열
          const chartColors = ['#3182F6', '#FF4B4B', '#f59e0b', '#8b5cf6', '#10b981', '#06b6d4'];
          const totalPrice = currentApartments.reduce((sum, a) => sum + a.currentPrice, 0);
          
          // 아파트별 데이터 (가격 기준 비중) - 반올림 오차 보정
          const rawPercentages = currentApartments.map((apt) => ({
            id: apt.id,
            name: apt.name,
            location: apt.location,
            price: apt.currentPrice,
            rawPercentage: totalPrice > 0 ? (apt.currentPrice / totalPrice) * 100 : 0,
          }));
          
          // 반올림 오차 보정: 가장 큰 값에서 조정
          const roundedPercentages = rawPercentages.map(apt => ({
            ...apt,
            percentage: Math.round(apt.rawPercentage),
          }));
          
          const totalRounded = roundedPercentages.reduce((sum, apt) => sum + apt.percentage, 0);
          const diff = 100 - totalRounded;
          
          // 오차가 있으면 가장 큰 비중 항목에서 조정
          if (diff !== 0 && roundedPercentages.length > 0) {
            const maxIndex = roundedPercentages.reduce((maxIdx, apt, idx, arr) => 
              apt.percentage > arr[maxIdx].percentage ? idx : maxIdx, 0);
            roundedPercentages[maxIndex].percentage += diff;
          }
          
          const apartmentData = roundedPercentages.map((apt, index) => ({
            id: apt.id,
            name: apt.name,
            location: apt.location,
            price: apt.price,
            percentage: apt.percentage,
            color: chartColors[index % chartColors.length],
          }));
          
          // % 높은 순으로 정렬
          const sortedApartments = [...apartmentData].sort((a, b) => b.percentage - a.percentage);
          
          return (
            <div className="mb-0 flex-1 flex flex-col">
              <h3 className="text-[15px] font-black text-slate-900 mb-3">
                아파트 포트폴리오
              </h3>
              <div className="flex flex-col items-center">
                <div className="w-[130px] h-[130px] relative mb-3 overflow-visible">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie
                                              data={sortedApartments.map(item => ({
                                                name: item.name,
                                                value: item.percentage,
                                                color: item.color,
                                                location: item.location,
                                                price: item.price,
                                              }))}                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={selectedApartmentIndex !== null ? 58 : 55}
                        paddingAngle={2}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                        labelLine={false}
                        activeShape={(props: any) => {
                          const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                          return (
                            <g>
                              <Sector
                                cx={cx}
                                cy={cy}
                                innerRadius={innerRadius - 2}
                                outerRadius={outerRadius + 3}
                                startAngle={startAngle}
                                endAngle={endAngle}
                                fill={fill}
                                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
                              />
                            </g>
                          );
                        }}
                        onMouseEnter={(_, index) => setSelectedApartmentIndex(index)}
                        onMouseLeave={() => setSelectedApartmentIndex(null)}
                        onClick={(_, index) => setSelectedApartmentIndex(selectedApartmentIndex === index ? null : index)}
                      >
                        {sortedApartments.map((item, index) => (
                          <Cell 
                            key={`cell-${index}`}
                            fill={item.color}
                            style={{ 
                              cursor: 'pointer',
                              opacity: selectedApartmentIndex !== null && selectedApartmentIndex !== index ? 0.4 : 1,
                              transition: 'opacity 0.2s ease'
                            }}
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-[11px]">
                                <p className="font-bold">{data.name}</p>
                                <p className="text-slate-300">{data.value}%</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* 범례 */}
                <div
                  className={`w-full space-y-1.5 ${ 
                    sortedApartments.length > 6
                      ? 'max-h-[160px] overflow-y-auto overscroll-contain scrollbar-hide'
                      : ''
                  }`}
                >
                  {sortedApartments.map((item, index) => {
                    const isSelected = selectedApartmentIndex === index;
                    return (
                      <div 
                        key={item.id} 
                        className={`flex items-center justify-between cursor-pointer p-1.5 rounded-lg transition-all ${ 
                          isSelected ? 'bg-slate-100 scale-[1.02]' : 'hover:bg-slate-50'
                        } ${selectedApartmentIndex !== null && !isSelected ? 'opacity-50' : ''}`}
                        onClick={() => setSelectedApartmentIndex(isSelected ? null : index)}
                        onMouseEnter={() => setSelectedApartmentIndex(index)}
                        onMouseLeave={() => setSelectedApartmentIndex(null)}
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform ${isSelected ? 'scale-125' : ''}`}
                            style={{ backgroundColor: item.color }}
                          ></div>
                          <span className={`text-[11px] font-bold truncate max-w-[90px] transition-colors ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>
                            {item.name}
                          </span>
                        </div>
                        <span className={`text-[11px] font-bold transition-colors ${isSelected ? 'text-blue-600' : 'text-slate-900'}`}>{item.percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
        </>
      )}
      </div>

      {/* Event Tooltip - 검은색 말풍선 (뉴스 위에 표시, z-index 최상위) */}
      {selectedEvent && tooltipPosition && (
        <div 
          className="fixed z-[9999] event-tooltip animate-fade-in pointer-events-auto"
          style={{ 
            left: tooltipPosition.x, 
            top: tooltipPosition.y,
            transform: 'translateY(-50%)'
          }}
        >
          <div className="relative bg-slate-900 text-white rounded-xl shadow-2xl p-3 max-w-[180px]">
            {/* 말풍선 화살표 - 세로 중앙 고정 */}
            <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2">
              <div className="w-0 h-0 border-t-6 border-b-6 border-r-6 border-transparent border-r-slate-900"></div>
            </div>
            
            {/* 닫기 버튼 */}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedEvent(null);
                setTooltipPosition(null);
              }}
              className="absolute top-1 right-1 p-0.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors z-10"
            >
              <X className="w-3 h-3" />
            </button>
            
            <p className="text-[11px] text-gray-200 leading-snug pr-4 whitespace-pre-line">
              {selectedEvent.type === 'tax' && '재산세 납부 기한입니다.\n기한 내 납부해주세요.'}
              {selectedEvent.type === 'update' && '관심 단지 실거래가가\n업데이트되었습니다.'}
              {selectedEvent.type === 'deadline' && '등기 신고 마감일입니다.\n기한 내 신고해주세요.'}
              {selectedEvent.type === 'alert' && '월세 수령 예정일입니다.\n입금을 확인해주세요.'}
            </p>
          </div>
        </div>
      )}


      {/* Chart Modal */}
      {isChartModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsChartModalOpen(false)}
          ></div>
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900">{currentValue.toFixed(2)}%</h3>
              <button 
                onClick={() => setIsChartModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-6">
              <div 
                className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all"
                style={{ width: `${(currentValue / 8.5) * 100}%` }}
              ></div>
            </div>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                <LineChart data={lineChartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="period" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }}
                    height={60}
                    tickFormatter={(value, index) => {
                      if (index === 0) return '6개월 전';
                      if (index === 3) return '4.21%';
                      if (index === 6) return '현재';
                      return '';
                    }}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 'bold' }}
                    tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#8b5cf6" 
                    strokeWidth={3}
                    dot={{ fill: '#8b5cf6', r: 5, strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
