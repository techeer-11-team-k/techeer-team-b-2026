import React, { useState, useMemo, useEffect } from 'react';
import { Trophy, TrendingUp, TrendingDown, Activity, ChevronRight, ArrowUpDown, Coins, CircleDollarSign, Banknote } from 'lucide-react';
import { ViewProps } from '../../types';
import { Card } from '../ui/Card';
import { ApartmentRow } from '../ui/ApartmentRow';
import {
  fetchApartmentRankings,
  fetchDashboardRankings,
  type ApartmentRankingItem,
  type DashboardRankingItem
} from '../../services/api';

// 랭킹 데이터 타입
interface RankingItem {
  id: string;
  rank: number;
  name: string;
  location: string;
  area: number;
  price: number;
  changeRate?: number;
  transactionCount?: number;
}


// 랭킹 아이템 컴포넌트 (Ranking 페이지 전용)
const RankingRow: React.FC<{
  item: RankingItem;
  onClick: () => void;
  showChangeRate?: boolean;
  showTransactionCount?: boolean;
}> = ({ item, onClick, showChangeRate, showTransactionCount }) => {
  return (
    <ApartmentRow
      name={item.name}
      location={item.location}
      area={item.area}
      price={item.price}
      rank={item.rank}
      changeRate={item.changeRate}
      transactionCount={item.transactionCount}
      showRank={true}
      showChangeRate={showChangeRate}
      showTransactionCount={showTransactionCount}
      onClick={onClick}
      variant="default"
    />
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
  onPropertyClick: (id: string) => void;
  data?: RankingItem[];
  isLoading?: boolean;
  error?: string | null;
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
  error = null
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);

  return (
    <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white">
      <div className="border-b border-slate-100 px-6 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 ${periods.length > 1 ? '' : 'py-2'} ml-3`}>
            <h3 className="font-black text-slate-900 text-[17px]">{title}</h3>
          </div>
          
          {/* 기간 선택 탭 - periods가 2개 이상일 때만 표시 */}
          {periods.length > 1 && (
            <div className="flex gap-2">
              {periods.map((period) => (
                <button
                  key={period.value}
                  onClick={() => setSelectedPeriod(period.value)}
                  className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${
                    selectedPeriod === period.value
                      ? 'bg-deep-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
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
          <div className="px-6 py-8 text-center text-slate-500">
            데이터를 불러오는 중...
          </div>
        ) : error ? (
          <div className="px-6 py-8 text-center text-red-500">
            {error}
          </div>
        ) : data.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500">
            데이터가 없습니다.
          </div>
        ) : (
          data.map((item) => (
            <RankingRow
              key={item.id}
              item={item}
              onClick={() => onPropertyClick(String(item.id))}
              showChangeRate={showChangeRate}
              showTransactionCount={showTransactionCount}
            />
          ))
        )}
      </div>
    </Card>
  );
};

export const Ranking: React.FC<ViewProps> = ({ onPropertyClick }) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('price');
  
  // API 데이터 상태
  const [priceHighestData, setPriceHighestData] = useState<RankingItem[]>([]);
  const [priceLowestData, setPriceLowestData] = useState<RankingItem[]>([]);
  const [volumeData, setVolumeData] = useState<RankingItem[]>([]);
  const [changeUpData, setChangeUpData] = useState<RankingItem[]>([]);
  const [changeDownData, setChangeDownData] = useState<RankingItem[]>([]);
  
  // 로딩 상태
  const [isLoading, setIsLoading] = useState<{ [key: string]: boolean }>({});
  const [errors, setErrors] = useState<{ [key: string]: string | null }>({});

  const rankingTypes = [
    { id: 'price', title: '가격 랭킹', icon: Trophy },
    { id: 'change', title: '변동률 랭킹', icon: ArrowUpDown },
    { id: 'mostTraded', title: '거래량 많은 아파트', icon: Activity },
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

  // API 데이터를 RankingItem 형식으로 변환
  const convertApartmentRankingItem = (
    item: ApartmentRankingItem,
    type: string
  ): RankingItem => {
    const avgPrice = item.avg_price;
    const avgPricePerPyeong = item.avg_price_per_pyeong;
    
    // 평당가를 기준으로 평균 면적(84㎡)을 곱하여 가격 추정
    const estimatedPrice = avgPrice || (avgPricePerPyeong ? avgPricePerPyeong * (84 / 3.3) : 0);
    
    return {
      id: `${type}-${item.apt_id}`,
      rank: item.rank,
      name: item.apt_name,
      location: item.region,
      area: 84, // 기본값 (실제로는 API에서 가져와야 함)
      price: Math.round(estimatedPrice),
      changeRate: item.change_rate,
      transactionCount: item.transaction_count,
    };
  };

  // Dashboard 랭킹 데이터를 RankingItem 형식으로 변환
  const convertDashboardRankingItem = (
    item: DashboardRankingItem,
    type: string,
    rank: number
  ): RankingItem => {
    const avgPricePerPyeong = item.avg_price_per_pyeong;
    const estimatedPrice = avgPricePerPyeong ? avgPricePerPyeong * (84 / 3.3) : 0;
    
    return {
      id: `${type}-${item.apt_id}`,
      rank: rank,
      name: item.apt_name,
      location: item.region,
      area: 84,
      price: Math.round(estimatedPrice),
      changeRate: item.change_rate,
      transactionCount: item.transaction_count,
    };
  };

  // API 데이터 로딩
  useEffect(() => {
    const loadRankingData = async () => {
      try {
        // 가격 랭킹 (가장 비싼/싼)
        setIsLoading(prev => ({ ...prev, priceHighest: true, priceLowest: true }));
        setErrors(prev => ({ ...prev, priceHighest: null, priceLowest: null }));
        
        const [highestRes, lowestRes] = await Promise.all([
          fetchApartmentRankings('price_highest', { priceMonths: 12, limit: 10 }),
          fetchApartmentRankings('price_lowest', { priceMonths: 12, limit: 10 })
        ]);
        
        if (highestRes.success) {
          setPriceHighestData(highestRes.data.apartments.map(item => convertApartmentRankingItem(item, 'highest')));
        }
        if (lowestRes.success) {
          setPriceLowestData(lowestRes.data.apartments.map(item => convertApartmentRankingItem(item, 'lowest')));
        }
        
        setIsLoading(prev => ({ ...prev, priceHighest: false, priceLowest: false }));
      } catch (error) {
        console.error('가격 랭킹 데이터 로딩 실패:', error);
        setErrors(prev => ({ 
          ...prev, 
          priceHighest: '데이터를 불러오는데 실패했습니다.',
          priceLowest: '데이터를 불러오는데 실패했습니다.'
        }));
        setIsLoading(prev => ({ ...prev, priceHighest: false, priceLowest: false }));
      }

      try {
        // 거래량 랭킹 (3개월)
        setIsLoading(prev => ({ ...prev, volume: true }));
        setErrors(prev => ({ ...prev, volume: null }));
        
        const volumeRes = await fetchApartmentRankings('volume', { volumeMonths: 3, limit: 10 });
        
        if (volumeRes.success) {
          setVolumeData(volumeRes.data.apartments.map(item => convertApartmentRankingItem(item, 'volume')));
        }
        
        setIsLoading(prev => ({ ...prev, volume: false }));
      } catch (error) {
        console.error('거래량 랭킹 데이터 로딩 실패:', error);
        setErrors(prev => ({ ...prev, volume: '데이터를 불러오는데 실패했습니다.' }));
        setIsLoading(prev => ({ ...prev, volume: false }));
      }

      try {
        // 변동률 랭킹 (6개월) - 대시보드 API 사용
        setIsLoading(prev => ({ ...prev, changeUp: true, changeDown: true }));
        setErrors(prev => ({ ...prev, changeUp: null, changeDown: null }));
        
        const changeRes = await fetchDashboardRankings('sale', 7, 6);
        
        if (changeRes.success) {
          setChangeUpData(changeRes.data.rising.map((item, idx) => 
            convertDashboardRankingItem(item, 'change-up', idx + 1)
          ));
          
          setChangeDownData(changeRes.data.falling.map((item, idx) => 
            convertDashboardRankingItem(item, 'change-down', idx + 1)
          ));
        }
        
        setIsLoading(prev => ({ ...prev, changeUp: false, changeDown: false }));
      } catch (error) {
        console.error('변동률 랭킹 데이터 로딩 실패:', error);
        setErrors(prev => ({ 
          ...prev, 
          changeUp: '데이터를 불러오는데 실패했습니다.',
          changeDown: '데이터를 불러오는데 실패했습니다.'
        }));
        setIsLoading(prev => ({ ...prev, changeUp: false, changeDown: false }));
      }
    };

    loadRankingData();
  }, []);

  return (
    <div className="space-y-8 pb-32 animate-fade-in px-4 md:px-0 pt-10">
      <div className="md:hidden pt-2 pb-2">
        <h1 className="text-2xl font-black text-slate-900">랭킹</h1>
      </div>

      <div className="mb-10">
        <h2 className="text-3xl font-black text-slate-900 mb-2 pl-2">
          아파트 랭킹
        </h2>
      </div>

      {/* 필터 버튼 */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          {rankingTypes.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleFilterSelect(id)}
              className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-all flex items-center gap-2 ${
                selectedFilter === id
                  ? 'bg-deep-900 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {title}
            </button>
          ))}
        </div>
      </div>

      {/* 그리드 레이아웃 */}
      <div className="grid grid-cols-1 gap-6">
        {/* 가격 랭킹 (가장 비싼/싼 아파트 함께 표시) */}
        {shouldShowRanking('highest') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RankingSection
              title="가장 비싼 아파트"
              icon={Banknote}
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
            <RankingSection
              title="가장 싼 아파트"
              icon={CircleDollarSign}
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
          </div>
        )}

        {/* 거래량 많은 아파트 */}
        {shouldShowRanking('mostTraded') && (
          <RankingSection
            title="거래량 많은 아파트"
            icon={Activity}
            type="mostTraded"
            periods={[]}
            defaultPeriod="3months"
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
