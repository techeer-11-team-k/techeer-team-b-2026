import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, ArrowUpDown, Trophy, Activity, Crown, Home, ChevronDown } from 'lucide-react';
import { ViewProps } from '../../types';
import { Card } from '../ui/Card';
import { ApartmentRow } from '../ui/ApartmentRow';
import {
  fetchDashboardRankings,
  type DashboardRankingItem
} from '../../services/api';

// 랭킹 데이터 타입
interface RankingItem {
  id: string;
  aptId: number; // 실제 apt_id 추가
  rank: number;
  name: string;
  location: string;
  area: number;
  price: number;
  changeRate?: number;
  transactionCount?: number;
  avgPricePerPyeong?: number;
}

// 숫자 카운트업 애니메이션 컴포넌트
const AnimatedNumber: React.FC<{ value: number; duration?: number; decimals?: number; prefix?: string; suffix?: string }> = ({ 
  value, 
  duration = 1000, 
  decimals = 1,
  prefix = '',
  suffix = ''
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setIsAnimating(true);
      const startValue = prevValueRef.current;
      const endValue = value;
      const startTime = Date.now();

      const animate = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-out 함수
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = startValue + (endValue - startValue) * easeOut;
        
        setDisplayValue(currentValue);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayValue(endValue);
          setIsAnimating(false);
        }
      };

      requestAnimationFrame(animate);
      prevValueRef.current = value;
    }
  }, [value, duration]);

  return (
    <span className={isAnimating ? 'animate-pulse' : ''}>
      {prefix}{displayValue.toFixed(decimals)}{suffix}
    </span>
  );
};

// 랭킹 아이템 컴포넌트 (리스트 형식, 공간 절약)
const RankingRow: React.FC<{
  item: RankingItem;
  onClick: () => void;
  showChangeRate?: boolean;
  showTransactionCount?: boolean;
  index: number;
  rankingType?: string; // 'highest' 또는 'lowest'
}> = ({ item, onClick, showChangeRate, showTransactionCount, index, rankingType }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, index * 50);

    return () => clearTimeout(timer);
  }, [index]);

  const isTop3 = item.rank <= 3;
  const hasChangeRate = showChangeRate && item.changeRate !== undefined;
  const hasTransactionCount = showTransactionCount && item.transactionCount !== undefined;

  return (
    <div
      className={`transform transition-all duration-300 ${
        isVisible 
          ? 'opacity-100 translate-x-0' 
          : 'opacity-0 -translate-x-2'
      }`}
      style={{ transitionDelay: `${index * 30}ms` }}
    >
      <div
        onClick={onClick}
        className={`group flex items-center gap-2 md:gap-3 px-2 md:px-3 py-2 md:py-2.5 border-b border-slate-100 transition-all duration-200 cursor-pointer active:scale-[0.98] rounded-2xl ${
          isTop3
            ? item.rank === 1
              ? 'bg-gradient-to-r from-yellow-50/80 via-yellow-50/60 to-yellow-50/40 hover:from-yellow-100/80 hover:via-yellow-100/60 hover:to-yellow-100/40 shadow-sm hover:shadow-md'
              : item.rank === 2
              ? 'bg-gradient-to-r from-gray-50/80 via-gray-50/60 to-gray-50/40 hover:from-gray-100/80 hover:via-gray-100/60 hover:to-gray-100/40 shadow-sm hover:shadow-md'
              : 'bg-gradient-to-r from-orange-50/80 via-orange-50/60 to-orange-50/40 hover:from-orange-100/80 hover:via-orange-100/60 hover:to-orange-100/40 shadow-sm hover:shadow-md'
            : 'bg-white hover:bg-slate-50'
        }`}
      >
        {/* 순위 */}
        <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-black text-sm md:text-base font-sans transition-all duration-200 ${
          isTop3 
            ? item.rank === 1 
              ? 'bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 text-white shadow-lg shadow-yellow-500/50 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-yellow-500/60' 
              : item.rank === 2
              ? 'bg-gradient-to-br from-gray-300 via-gray-400 to-gray-500 text-white shadow-lg shadow-gray-400/50 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-gray-400/60'
              : 'bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/50 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-orange-500/60'
            : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'
        }`}>
          {item.rank}
        </div>

        {/* 아파트 정보 */}
        <div className="flex-1 min-w-0 font-sans">
          <div className="flex items-center gap-1.5 md:gap-2">
            <h4 className="font-bold text-[14px] md:text-[15px] truncate transition-colors text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-300">
              {item.name}
            </h4>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 text-[11px] md:text-[12px] text-slate-500 mt-0.5">
            <span className="truncate">{item.location}</span>
          </div>
        </div>

        {/* 가격 및 통계 */}
        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0 font-sans">
          <div className="text-right">
            <p className={`font-bold tabular-nums text-[15px] md:text-[17px] ${
              rankingType === 'highest'
                ? 'text-red-600 dark:text-red-500'
                : rankingType === 'lowest'
                ? 'text-blue-600 dark:text-blue-500'
                : 'text-slate-900 dark:text-white'
            }`}>
              {(() => {
                const eok = Math.floor(item.price / 10000);
                const man = item.price % 10000;
                
                if (eok === 0) {
                  // 0억인 경우: 만원만 표시
                  return (
                    <>
                      <span className="font-bold">{man.toLocaleString()}</span>
                      <span className="ml-0.5 text-[13px] md:text-[15px] font-bold">만원</span>
                    </>
                  );
                } else if (man === 0) {
                  // 0000만원인 경우: 억만 표시
                  return (
                    <>
                      <span className="font-bold">{eok}</span>
                      <span className="ml-0.5 text-[13px] md:text-[15px] font-bold">억</span>
                    </>
                  );
                } else {
                  // 일반적인 경우: 억 만원 모두 표시
                  return (
                    <>
                      <span className="font-bold">{eok}</span>
                      <span className="ml-0.5 text-[13px] md:text-[15px] font-bold">억</span>
                      <span className="ml-1 font-bold">{man.toLocaleString()}</span>
                      <span className="ml-0.5 text-[13px] md:text-[15px] font-bold">만원</span>
                    </>
                  );
                }
              })()}
            </p>
            {hasChangeRate && (
              <p className={`text-[12px] mt-0.5 font-bold tabular-nums flex items-center justify-end gap-1 ${
                item.changeRate! >= 0 ? 'text-red-500' : 'text-blue-500'
              }`}>
                {item.changeRate! >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>
                  {item.changeRate! >= 0 ? '+' : ''}{item.changeRate!.toFixed(1)}%
                </span>
              </p>
            )}
            {hasTransactionCount && item.transactionCount !== undefined && item.transactionCount > 0 && (
              <p className="text-[12px] mt-0.5 font-bold tabular-nums text-red-500 flex items-center justify-end gap-1">
                <Activity className="w-3 h-3" />
                <span>{item.transactionCount}건</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 랭킹 섹션 컴포넌트
const RankingSection: React.FC<{
  title: string;
  icon: React.ComponentType<any>;
  type: string;
  periods: { value: string; label: string }[];
  defaultPeriod: string;
  showChangeRate?: boolean;
  showTransactionCount?: boolean;
  onPropertyClick: ViewProps['onPropertyClick'];
  data?: RankingItem[];
  isLoading?: boolean;
  error?: string | null;
  onPeriodChange?: (period: string) => void;
  selectedPeriod?: string;
}> = ({ 
  title, 
  icon: Icon, 
  type, 
  periods, 
  defaultPeriod,
  showChangeRate,
  showTransactionCount,
  onPropertyClick,
  data = [],
  isLoading = false,
  error = null,
  onPeriodChange,
  selectedPeriod: externalSelectedPeriod
}) => {
  const [internalSelectedPeriod, setInternalSelectedPeriod] = useState(defaultPeriod);
  const selectedPeriod = externalSelectedPeriod !== undefined ? externalSelectedPeriod : internalSelectedPeriod;
  
  const handlePeriodChange = (period: string) => {
    if (onPeriodChange) {
      onPeriodChange(period);
    } else {
      setInternalSelectedPeriod(period);
    }
  };

  return (
    <div className="md:rounded-[24px] rounded-[20px] md:border border border-slate-200 md:shadow-sm bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] font-sans md:shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-2.5 md:py-3 bg-slate-50 rounded-t-[20px] md:rounded-t-[24px]">
        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1.5 md:gap-2 min-w-0 flex-1 ${periods.length > 1 ? '' : ''}`}>
            <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-600 flex-shrink-0" />
            <h3 className="font-bold text-slate-900 text-[14px] md:text-[15px] truncate">{title}</h3>
          </div>
          
          {/* 기간 선택 탭 - periods가 2개 이상일 때만 표시 */}
          {periods.length > 1 && (
            <div className="flex gap-1 md:gap-1.5 flex-shrink-0">
              {periods.map((period) => (
                <button
                  key={period.value}
                  onClick={() => handlePeriodChange(period.value)}
                  className={`px-2 md:px-3 py-1 md:py-1.5 rounded-md text-[11px] md:text-[12px] font-bold transition-all whitespace-nowrap ${
                    selectedPeriod === period.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="divide-y divide-slate-100">
        {isLoading ? (
          <div className="px-3 md:px-6 py-6 md:py-8 text-center text-slate-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm">데이터를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="px-3 md:px-6 py-6 md:py-8 text-center text-red-500 text-sm">
            {error}
          </div>
        ) : data.length === 0 ? (
          <div className="px-3 md:px-6 py-6 md:py-8 text-center text-slate-500 text-sm">
            데이터가 없습니다.
          </div>
        ) : (
          data.map((item, index) => (
            <RankingRow
              key={item.id}
              item={item}
              onClick={() => onPropertyClick(String(item.aptId))}
              showChangeRate={showChangeRate}
              showTransactionCount={showTransactionCount}
              index={index}
              rankingType={type}
            />
          ))
        )}
      </div>
    </div>
  );
};

export const Ranking: React.FC<ViewProps> = ({ onPropertyClick }) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('price');
  const [selectedPeriod, setSelectedPeriod] = useState<'6개월' | '3년' | '역대'>('6개월');
  const [volumePeriod, setVolumePeriod] = useState<string>('3years');
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const periodDropdownRef = useRef<HTMLDivElement>(null);
  
  // API 데이터 상태
  const [priceHighestData, setPriceHighestData] = useState<RankingItem[]>([]);
  const [priceLowestData, setPriceLowestData] = useState<RankingItem[]>([]);
  const [volumeData, setVolumeData] = useState<RankingItem[]>([]);
  const [changeUpData, setChangeUpData] = useState<RankingItem[]>([]);
  const [changeDownData, setChangeDownData] = useState<RankingItem[]>([]);
  
  // 로딩 상태
  const [isLoading, setIsLoading] = useState<{ [key: string]: boolean }>({});
  const [errors, setErrors] = useState<{ [key: string]: string | null }>({});

  // 필터 타입 정의 - 가격과 변동률을 분리
  const rankingTypes = [
    { id: 'price', title: '가격 랭킹', icon: Trophy, description: '가장 비싼/싼 아파트' },
    { id: 'change', title: '변동률 랭킹', icon: ArrowUpDown, description: '가장 많이 오른/내린 아파트' },
    { id: 'mostTraded', title: '거래량 랭킹', icon: Activity, description: '거래가 가장 활발한 아파트' },
  ];

  const handleFilterSelect = (filterId: string) => {
    setSelectedFilter(filterId);
  };

  const shouldShowRanking = (type: string) => {
    if (selectedFilter === 'price') {
      return type === 'highest' || type === 'lowest';
    }
    if (selectedFilter === 'change') {
      return type === 'mostIncreased' || type === 'leastIncreased';
    }
    return selectedFilter === type;
  };

  // Dashboard 랭킹 데이터를 RankingItem 형식으로 변환
  const convertDashboardRankingItem = (
    item: DashboardRankingItem,
    type: string,
    rank: number
  ): RankingItem => {
    // 가격 랭킹의 경우 avg_price(실제 거래가)를 우선 사용
    // 변동률 랭킹의 경우 recent_avg를 우선 사용, 없으면 avg_price_per_pyeong 사용
    let price = 0;
    
    if (type.includes('price-')) {
      // 가격 랭킹: 실제 거래가 사용
      price = item.avg_price || 0;
    } else {
      // 변동률/거래량 랭킹: 평당가를 기준으로 추정
      const avgPricePerPyeong = item.recent_avg || item.avg_price_per_pyeong || 0;
      // 평균 전용면적을 84㎡로 가정 (실제로는 다양한 면적이 있을 수 있음)
      price = avgPricePerPyeong ? Math.round(avgPricePerPyeong * (84 / 3.3)) : 0;
    }
    
    return {
      id: `${type}-${item.apt_id}`,
      aptId: item.apt_id, // 실제 apt_id 저장
      rank: rank,
      name: item.apt_name,
      location: item.region,
      area: 84, // 기본값, 실제 데이터가 있으면 사용
      price: price,
      changeRate: item.change_rate,
      transactionCount: item.transaction_count || 0, // 기본값 0으로 설정
      avgPricePerPyeong: item.avg_price_per_pyeong || item.recent_avg || 0,
    };
  };

  // 기간을 개월 수로 변환하는 함수
  const getPeriodMonths = (period: '6개월' | '3년' | '역대'): number => {
    switch (period) {
      case '6개월':
        return 6;
      case '3년':
        return 36;
      case '역대':
        return 120; // 10년 (최대값으로 설정, API가 지원하는 범위 내에서)
      default:
        return 36;
    }
  };

  // 거래량 랭킹 기간을 개월 수로 변환하는 함수
  const getVolumePeriodMonths = (period: string): number => {
    switch (period) {
      case '6months':
        return 6;
      case '3years':
        return 36;
      case 'all':
        return 120; // 10년
      default:
        return 36;
    }
  };

  // API 데이터 로딩
  useEffect(() => {
    const loadRankingData = async () => {
      const periodMonths = getPeriodMonths(selectedPeriod);
      
      try {
        // 가격 랭킹 데이터 로드
        setIsLoading(prev => ({ ...prev, priceHighest: true, priceLowest: true }));
        setErrors(prev => ({ ...prev, priceHighest: null, priceLowest: null }));
        
        const priceRes = await fetchDashboardRankings('sale', 7, periodMonths);
        
        if (priceRes.success) {
          // 백엔드에서 제공하는 price_highest와 price_lowest 데이터 사용
          if (priceRes.data.price_highest && priceRes.data.price_highest.length > 0) {
            const highest = priceRes.data.price_highest
              .slice(0, 10)
              .map((item, idx) => 
                convertDashboardRankingItem(item, 'price-highest', idx + 1)
              );
            setPriceHighestData(highest);
          } else {
            // fallback: trending 데이터를 가격 순으로 정렬 (하위 호환성)
            if (priceRes.data.trending) {
              const sortedByPrice = [...priceRes.data.trending]
                .filter(item => item.avg_price_per_pyeong && item.avg_price_per_pyeong > 0)
                .sort((a, b) => (b.avg_price_per_pyeong || 0) - (a.avg_price_per_pyeong || 0));
              
              const highest = sortedByPrice.slice(0, 10).map((item, idx) => 
                convertDashboardRankingItem(item, 'price-highest', idx + 1)
              );
              setPriceHighestData(highest);
            }
          }
          
          if (priceRes.data.price_lowest && priceRes.data.price_lowest.length > 0) {
            const lowest = priceRes.data.price_lowest
              .slice(0, 10)
              .map((item, idx) => 
                convertDashboardRankingItem(item, 'price-lowest', idx + 1)
              );
            setPriceLowestData(lowest);
          } else {
            // fallback: trending 데이터를 가격 순으로 정렬 (하위 호환성)
            if (priceRes.data.trending) {
              const sortedByPrice = [...priceRes.data.trending]
                .filter(item => item.avg_price_per_pyeong && item.avg_price_per_pyeong > 0)
                .sort((a, b) => (a.avg_price_per_pyeong || 0) - (b.avg_price_per_pyeong || 0));
              
              const lowest = sortedByPrice.slice(0, 10).map((item, idx) => 
                convertDashboardRankingItem(item, 'price-lowest', idx + 1)
              );
              setPriceLowestData(lowest);
            }
          }
        }
        
        setIsLoading(prev => ({ ...prev, priceHighest: false, priceLowest: false }));

        // 변동률 랭킹 - 선택된 기간에 따라 데이터 로드
        setIsLoading(prev => ({ ...prev, changeUp: true, changeDown: true }));
        setErrors(prev => ({ ...prev, changeUp: null, changeDown: null }));
        
        const changeRes = await fetchDashboardRankings('sale', 7, periodMonths);
        
        if (changeRes.success) {
          setChangeUpData(changeRes.data.rising.map((item, idx) => 
            convertDashboardRankingItem(item, 'change-up', idx + 1)
          ));
          
          setChangeDownData(changeRes.data.falling.map((item, idx) => 
            convertDashboardRankingItem(item, 'change-down', idx + 1)
          ));
        }
        
        setIsLoading(prev => ({ ...prev, changeUp: false, changeDown: false }));

        // 거래량 랭킹 (백엔드에서 제공하는 volume_ranking 데이터 사용)
        setIsLoading(prev => ({ ...prev, volume: true }));
        setErrors(prev => ({ ...prev, volume: null }));
        
        if (priceRes.success) {
          if (priceRes.data.volume_ranking && priceRes.data.volume_ranking.length > 0) {
            // 거래량이 같으면 같은 등수로 처리
            let currentRank = 1;
            let prevTransactionCount: number | null = null;
            
            const volumeData = priceRes.data.volume_ranking
              .slice(0, 10)
              .map((item, idx) => {
                const transactionCount = item.transaction_count || 0;
                // 이전 항목과 거래량이 다르면 등수를 증가
                if (prevTransactionCount !== null && transactionCount !== prevTransactionCount) {
                  currentRank = idx + 1;
                }
                prevTransactionCount = transactionCount;
                
                return convertDashboardRankingItem(item, 'volume', currentRank);
              });
            setVolumeData(volumeData);
          } else if (priceRes.data.trending) {
            // fallback: trending 데이터 사용 (하위 호환성)
            const sortedByVolume = [...priceRes.data.trending]
              .filter(item => item.transaction_count && item.transaction_count > 0)
              .sort((a, b) => (b.transaction_count || 0) - (a.transaction_count || 0));
            
            // 거래량이 같으면 같은 등수로 처리
            let currentRank = 1;
            let prevTransactionCount: number | null = null;
            
            setVolumeData(sortedByVolume.slice(0, 10).map((item, idx) => {
              const transactionCount = item.transaction_count || 0;
              // 이전 항목과 거래량이 다르면 등수를 증가
              if (prevTransactionCount !== null && transactionCount !== prevTransactionCount) {
                currentRank = idx + 1;
              }
              prevTransactionCount = transactionCount;
              
              return convertDashboardRankingItem(item, 'volume', currentRank);
            }));
          }
        }
        
        setIsLoading(prev => ({ ...prev, volume: false }));
        } catch (error) {
          console.error('랭킹 데이터 로딩 실패:', error);
          // 에러 메시지 원본을 텍스트로 출력
          if (error instanceof Error) {
            console.error('에러 타입:', error.constructor.name);
            console.error('에러 메시지:', error.message);
            console.error('스택 트레이스:', error.stack);
          } else {
            console.error('에러 객체:', JSON.stringify(error, null, 2));
          }
        setErrors(prev => ({ 
          ...prev, 
          priceHighest: '데이터를 불러오는데 실패했습니다.',
          priceLowest: '데이터를 불러오는데 실패했습니다.',
          changeUp: '데이터를 불러오는데 실패했습니다.',
          changeDown: '데이터를 불러오는데 실패했습니다.',
          volume: '데이터를 불러오는데 실패했습니다.'
        }));
        setIsLoading(prev => ({ 
          ...prev, 
          priceHighest: false, 
          priceLowest: false,
          changeUp: false, 
          changeDown: false,
          volume: false
        }));
      }
    };

    loadRankingData();
  }, [selectedPeriod]);

  // 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(event.target as Node)) {
        setIsPeriodDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="space-y-4 md:space-y-8 pb-32 animate-fade-in font-sans min-h-screen w-full px-2 md:px-0 pt-2 md:pt-8">
      {/* 제목 섹션 */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mb-8">아파트 랭킹</h1>
      </div>

      {/* 필터 섹션 - 주택 공급 페이지 스타일 */}
      <div className="w-full rounded-[20px] md:rounded-[24px] transition-all duration-200 relative bg-white border border-slate-200 md:shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] p-4 md:p-6 overflow-visible">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch md:items-center">
          {/* 1번: 랭킹 유형 */}
          <div className="flex flex-col gap-1.5 md:gap-2">
            <label className="text-[12px] md:text-[14px] font-bold text-slate-700">랭킹 유형</label>
            <div className="flex gap-2 md:gap-3">
              {rankingTypes.map(({ id, title, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => handleFilterSelect(id)}
                  className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-[12px] md:text-[14px] font-bold transition-all duration-200 whitespace-nowrap ${
                    selectedFilter === id
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span>{title}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* 구분선 */}
          <div className="hidden md:block h-16 w-px bg-slate-200"></div>
          <div className="md:hidden w-full h-px bg-slate-200"></div>
          
          {/* 2번: 기간 (드롭다운) */}
          <div className="flex flex-col gap-1.5 md:gap-2">
            <label className="text-[12px] md:text-[14px] font-bold text-slate-700">기간</label>
            <div className="relative" ref={periodDropdownRef}>
              <button
                onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
                className="w-full md:w-auto bg-white border border-slate-200 text-slate-700 text-[12px] md:text-[14px] rounded-lg px-2.5 md:px-4 py-1.5 md:py-2 shadow-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 flex items-center gap-1.5 md:gap-2 md:min-w-[120px] justify-between"
              >
                <span className="truncate">
                  {selectedPeriod === '6개월' ? '최근 6개월' : selectedPeriod === '3년' ? '최근 3년' : '역대'}
                </span>
                <ChevronDown 
                  className={`w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${
                    isPeriodDropdownOpen ? 'rotate-180' : ''
                  }`} 
                />
              </button>
              
              {isPeriodDropdownOpen && (
                <div className="absolute left-0 top-full mt-2 w-full bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-[100] animate-enter origin-top-left">
                  {[
                    { label: '최근 6개월', value: '6개월' as const },
                    { label: '최근 3년', value: '3년' as const },
                    { label: '역대', value: '역대' as const }
                  ].map((period) => (
                    <button
                      key={period.value}
                      onClick={() => {
                        setSelectedPeriod(period.value);
                        setIsPeriodDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 md:px-4 py-2.5 md:py-3 text-[14px] font-bold transition-colors duration-200 ${
                        selectedPeriod === period.value
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 그리드 레이아웃 */}
      <div className="grid grid-cols-1 gap-6">
        {/* 가격 랭킹 (가장 비싼/싼 아파트 함께 표시) */}
        {shouldShowRanking('highest') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RankingSection
              title="가장 비싼 아파트"
              icon={Crown}
              type="highest"
              periods={[
                { value: '1year', label: '1년' },
              ]}
              defaultPeriod="1year"
              onPropertyClick={onPropertyClick}
              data={priceHighestData}
              isLoading={isLoading.priceHighest}
              error={errors.priceHighest}
            />
            {shouldShowRanking('lowest') && (
              <RankingSection
                title="가장 싼 아파트"
                icon={Home}
                type="lowest"
                periods={[
                  { value: '1year', label: '1년' },
                ]}
                defaultPeriod="1year"
                onPropertyClick={onPropertyClick}
                data={priceLowestData}
                isLoading={isLoading.priceLowest}
                error={errors.priceLowest}
              />
            )}
          </div>
        )}

        {/* 변동률 랭킹 (가장 많이 오른/내린 아파트 함께 표시) */}
        {shouldShowRanking('mostIncreased') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RankingSection
              title="가장 많이 오른 아파트"
              icon={TrendingUp}
              type="mostIncreased"
              periods={[]}
              defaultPeriod="6months"
              showChangeRate={true}
              onPropertyClick={onPropertyClick}
              data={changeUpData}
              isLoading={isLoading.changeUp}
              error={errors.changeUp}
            />
            {shouldShowRanking('leastIncreased') && (
              <RankingSection
                title="가장 많이 내린 아파트"
                icon={TrendingDown}
                type="leastIncreased"
                periods={[]}
                defaultPeriod="6months"
                showChangeRate={true}
                onPropertyClick={onPropertyClick}
                data={changeDownData}
                isLoading={isLoading.changeDown}
                error={errors.changeDown}
              />
            )}
          </div>
        )}

        {/* 거래량 랭킹 */}
        {shouldShowRanking('mostTraded') && (
          <RankingSection
            title="거래량 랭킹"
            icon={Activity}
            type="mostTraded"
            periods={[]}
            defaultPeriod={selectedPeriod}
            selectedPeriod={selectedPeriod}
            showTransactionCount={true}
            onPropertyClick={onPropertyClick}
            data={volumeData}
            isLoading={isLoading.volume}
            error={errors.volume}
          />
        )}
      </div>
    </div>
  );
};
