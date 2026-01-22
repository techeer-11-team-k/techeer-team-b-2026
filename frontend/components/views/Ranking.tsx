import React, { useState, useMemo } from 'react';
import { Trophy, TrendingUp, TrendingDown, Activity, ChevronRight, ArrowUpDown, Coins, CircleDollarSign, Banknote } from 'lucide-react';
import { ViewProps } from '../../types';
import { Card } from '../ui/Card';
import { ApartmentRow } from '../ui/ApartmentRow';

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

// 데모 데이터 생성
const generateRankingData = (type: string, period: string): RankingItem[] => {
  const baseData = [
    { name: '반포 래미안 원베일리', location: '서울시 서초구 반포동', area: 84 },
    { name: '개포 자이 프레지던스', location: '서울시 강남구 개포동', area: 101 },
    { name: '송도 더샵 센트럴파크', location: '인천시 연수구 송도동', area: 84 },
    { name: '압구정 현대 힐스테이트', location: '서울시 강남구 압구정동', area: 114 },
    { name: '잠실 롯데캐슬 골드', location: '서울시 송파구 잠실동', area: 84 },
    { name: '한남더힐', location: '서울시 용산구 한남동', area: 101 },
    { name: '청담래미안', location: '서울시 강남구 청담동', area: 114 },
    { name: '목동 현대아이파크', location: '서울시 양천구 목동', area: 84 },
    { name: '상암 DMC 래미안', location: '서울시 마포구 상암동', area: 101 },
    { name: '잠원 한양수자인', location: '서울시 서초구 잠원동', area: 84 },
  ];

  return baseData.map((item, index) => {
    let price = 0;
    let changeRate = 0;
    let transactionCount = 0;

    if (type === 'highest') {
      // 가장 비싼 아파트
      price = period === '1year' 
        ? 180000 + (10 - index) * 5000 
        : 200000 + (10 - index) * 8000;
    } else if (type === 'lowest') {
      // 가장 싼 아파트
      price = period === '1year'
        ? 35000 + index * 2000
        : 30000 + index * 1500;
    } else if (type === 'mostIncreased') {
      // 가장 많이 오른 아파트
      price = 80000 + (10 - index) * 3000;
      changeRate = 15.5 - index * 1.2;
    } else if (type === 'leastIncreased') {
      // 가장 많이 내린 아파트
      price = 70000 + (10 - index) * 2000;
      changeRate = -(8.5 - index * 0.8); // 음수로 변경하여 하락률 표시 (절댓값이 큰 순서)
    } else if (type === 'mostTraded') {
      // 거래량 많은 아파트
      price = 90000 + (10 - index) * 4000;
      transactionCount = 45 - index * 3;
    }

    return {
      id: `${type}-${period}-${index + 1}`,
      rank: index + 1,
      ...item,
      price,
      changeRate,
      transactionCount,
    };
  });
};


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
}> = ({ 
  title, 
  icon: Icon, 
  type, 
  periods, 
  defaultPeriod,
  showChangeRate,
  showTransactionCount,
  onPropertyClick 
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  
  const rankingData = useMemo(
    () => generateRankingData(type, selectedPeriod),
    [type, selectedPeriod]
  );

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
        {rankingData.map((item) => (
          <RankingRow
            key={item.id}
            item={item}
            onClick={() => onPropertyClick(item.id)}
            showChangeRate={showChangeRate}
            showTransactionCount={showTransactionCount}
          />
        ))}
      </div>
    </Card>
  );
};

export const Ranking: React.FC<ViewProps> = ({ onPropertyClick }) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('price');

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

  return (
    <div className="space-y-8 pb-32 animate-fade-in px-4 md:px-0 pt-0">
      <div className="md:hidden pt-2 pb-2">
        <h1 className="text-2xl font-black text-slate-900">랭킹</h1>
      </div>

      <div className="my-4">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
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
                { value: 'alltime', label: '역대' },
              ]}
              defaultPeriod="1year"
              onPropertyClick={onPropertyClick}
            />
            <RankingSection
              title="가장 싼 아파트"
              icon={CircleDollarSign}
              type="lowest"
              periods={[
                { value: '1year', label: '1년' },
                { value: 'alltime', label: '역대' },
              ]}
              defaultPeriod="1year"
              onPropertyClick={onPropertyClick}
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
            />
            <RankingSection
              title="가장 많이 내린 아파트"
              icon={TrendingDown}
              type="leastIncreased"
              periods={[]}
              defaultPeriod="6months"
              showChangeRate={true}
              onPropertyClick={onPropertyClick}
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
            defaultPeriod="6months"
            showTransactionCount={true}
            onPropertyClick={onPropertyClick}
          />
        )}
      </div>
    </div>
  );
};
