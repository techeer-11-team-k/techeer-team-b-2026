import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar, TrendingUp, FileText, AlertCircle, X, TrendingDown, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Sector, Area, AreaChart } from 'recharts';
import { fetchInterestRates, type InterestRateItem } from '../services/api';

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
    const regionKey = region.replace('시', '').replace('도', '');
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
}

export const ProfileWidgetsCard: React.FC<ProfileWidgetsCardProps> = ({ activeGroupName = '내 자산', assets }) => {
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedApartmentIndex, setSelectedApartmentIndex] = useState<number | null>(null);
  const [selectedRateIndex, setSelectedRateIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [interestRates, setInterestRates] = useState<InterestRateData[]>([]);
  const [isRatesLoading, setIsRatesLoading] = useState(true);
  const eventRefs = useRef<(HTMLDivElement | null)[]>([]);
  const currentValue = 4.21;

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

  return (
    <>
      <div className="bg-white rounded-[28px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80 h-full flex flex-col">
        {/* Profile Section */}
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
          <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
            <img 
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" 
              alt="User" 
              className="w-full h-full" 
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-black text-slate-900 truncate">김부자님</p>
            <p className="text-[12px] text-slate-500 font-medium">투자자</p>
          </div>
        </div>

        {/* 금리 지표 Section */}
        <div className="mb-6 pb-6 border-b border-slate-100">
          <h3 className="text-[15px] font-black text-slate-900 mb-4">금리 지표</h3>
          
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


      {/* 내 자산 포트폴리오 Section - 현재 탭에 따라 변경 */}
      <div className="mb-6 pb-6 border-b border-slate-100">
        <h3 className="text-[15px] font-black text-slate-900 mb-4">
          {activeGroupName === '내 자산' ? '내 자산 포트폴리오' : `${activeGroupName} 포트폴리오`}
        </h3>
        
        {currentApartments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <TrendingUp className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-[13px] font-bold text-slate-500 mb-1">등록된 자산이 없습니다</p>
            <p className="text-[11px] text-slate-400">자산을 추가하면<br/>포트폴리오를 확인할 수 있습니다</p>
          </div>
        ) : (() => {
          // 지역별로 그룹화하여 퍼센트 계산
          const colors = ['#3182F6', '#FF4B4B', '#f59e0b', '#8b5cf6', '#10b981', '#06b6d4'];
          const totalPrice = currentApartments.reduce((sum, a) => sum + a.currentPrice, 0);
          
          // 지역별로 그룹화 (location에서 첫 번째 부분 추출: "서울특별시 강남구" -> "강남구")
          const regionMap = new Map<string, { totalPrice: number; count: number; apartments: string[] }>();
          currentApartments.forEach(apt => {
            // location에서 마지막 구/동 추출 (예: "서울특별시 강남구" -> "강남구")
            const locationParts = (apt.location || '기타').split(' ');
            const region = locationParts.length > 1 ? locationParts[locationParts.length - 1] : locationParts[0];
            const regionKey = region || '기타';
            
            if (!regionMap.has(regionKey)) {
              regionMap.set(regionKey, { totalPrice: 0, count: 0, apartments: [] });
            }
            const entry = regionMap.get(regionKey)!;
            entry.totalPrice += apt.currentPrice;
            entry.count += 1;
            entry.apartments.push(apt.name);
          });
          
          // 지역별 데이터로 변환
          const regionData = Array.from(regionMap.entries()).map(([region, data], index) => ({
            id: region,
            name: region,
            totalPrice: data.totalPrice,
            count: data.count,
            apartments: data.apartments,
            percentage: totalPrice > 0 ? Math.round((data.totalPrice / totalPrice) * 100) : 0,
            color: colors[index % colors.length],
          }));
          
          // % 높은 순으로 정렬
          const sortedRegions = [...regionData].sort((a, b) => b.percentage - a.percentage);
          
          return (
            <div className="flex flex-col items-center">
              <div className="w-[130px] h-[130px] relative mb-3 overflow-visible">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={sortedRegions.map(region => ({
                        name: region.name,
                        value: region.percentage,
                        color: region.color,
                        count: region.count,
                        apartments: region.apartments,
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
                      {sortedRegions.map((region, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={region.color}
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
                              <p className="text-slate-300">{data.value}% ({data.count}개)</p>
                              {data.apartments && data.apartments.length > 0 && (
                                <p className="text-slate-400 mt-1 text-[10px]">
                                  {data.apartments.slice(0, 2).join(', ')}
                                  {data.apartments.length > 2 && ` 외 ${data.apartments.length - 2}개`}
                                </p>
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

              {/* 지역별 범례 */}
              <div className="w-full space-y-1.5">
                {sortedRegions.map((region, index) => {
                  const isSelected = selectedApartmentIndex === index;
                  return (
                    <div 
                      key={region.id} 
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
                          style={{ backgroundColor: region.color }}
                        ></div>
                        <div className="flex flex-col">
                          <span className={`text-[11px] font-medium truncate max-w-[90px] transition-colors ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-700'}`}>{region.name}</span>
                          <span className="text-[9px] text-slate-400">{region.count}개</span>
                        </div>
                      </div>
                      <span className={`text-[11px] font-bold transition-colors ${isSelected ? 'text-blue-600' : 'text-slate-900'}`}>{region.percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Upcoming Events Section */}
      <div className="mb-0 flex-1 flex flex-col">
        <h3 className="text-[15px] font-black text-slate-900 mb-4">주요 일정</h3>
        
        <div className="space-y-0 relative">
          {sortedEvents.map((event, index) => (
            <div
              key={event.id}
              ref={(el) => { eventRefs.current[index] = el; }}
              onClick={(e) => {
                e.stopPropagation();
                handleEventClick(event, index);
              }}
              className={`flex items-start gap-3 p-2.5 rounded-xl transition-colors border cursor-pointer event-tooltip ${
                selectedEvent?.id === event.id 
                  ? 'bg-slate-100 border-slate-200' 
                  : 'hover:bg-slate-50 border-transparent hover:border-slate-100'
              }`}
            >
              <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${getEventColor(event.type)}`}>
                {getEventIcon(event.iconType)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[12px] font-bold text-slate-900 truncate">{event.title}</span>
                  {event.daysLeft && (
                    <span className="text-[10px] font-black text-red-500 tabular-nums flex-shrink-0 ml-2">
                      D-{event.daysLeft}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-medium">{event.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
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
          <div className="relative bg-slate-900 text-white rounded-xl shadow-2xl p-3 w-48">
            {/* 말풍선 화살표 */}
            <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2">
              <div className="w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-slate-900"></div>
            </div>
            
            <p className="text-[11px] text-gray-200 leading-relaxed">
              {selectedEvent.type === 'tax' && '재산세 납부 기한입니다. 기한 내 납부해주세요.'}
              {selectedEvent.type === 'update' && '관심 단지 실거래가가 업데이트되었습니다.'}
              {selectedEvent.type === 'deadline' && '등기 신고 마감일입니다. 기한 내 신고해주세요.'}
              {selectedEvent.type === 'alert' && '월세 수령 예정일입니다. 입금을 확인해주세요.'}
            </p>
            
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedEvent(null);
                setTooltipPosition(null);
              }}
              className="absolute top-1 right-1 p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
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
              <ResponsiveContainer width="100%" height="100%">
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
