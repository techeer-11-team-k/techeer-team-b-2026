import React, { useState } from 'react';
import { Heart } from 'lucide-react';

interface RegionalRankingProps {
  isDarkMode: boolean;
  region: string;
}

// 실제 데이터 기반 Mock (2024-2025년 기준)
const rankingData: Record<string, any> = {
  paju: {
    mostExpensive: [
      { rank: 1, name: '운정 신도시 더샵 레이크파크', price: '7억 2천만원', location: '교하동', change: '+5.2%' },
      { rank: 2, name: '일산 두산위브 더제니스', price: '6억 8천만원', location: '탄현동', change: '+4.8%' },
      { rank: 3, name: '운정 호반베르디움 센트럴파크', price: '6억 5천만원', location: '운정동', change: '+6.1%' },
      { rank: 4, name: '파주 롯데캐슬 골드파크', price: '5억 9천만원', location: '금촌동', change: '+3.9%' },
      { rank: 5, name: '운정 푸르지오 그랑블', price: '5억 7천만원', location: '운정동', change: '+4.2%' },
    ],
    cheapest: [
      { rank: 1, name: '문산 한양수자인', price: '2억 1천만원', location: '문산읍', change: '+3.2%' },
      { rank: 2, name: '금촌 주공1단지', price: '2억 5천만원', location: '금촌동', change: '+2.5%' },
      { rank: 3, name: '파주 힐스테이트', price: '2억 8천만원', location: '금촌동', change: '+2.8%' },
      { rank: 4, name: '문산 한신', price: '3억 2천만원', location: '문산읍', change: '+3.1%' },
      { rank: 5, name: '금촌 LIG', price: '3억 5천만원', location: '금촌동', change: '+2.9%' },
    ],
    mostTraded: [
      { rank: 1, name: '운정 신도시 더샵', volume: 234, location: '운정동', change: '+5.8%' },
      { rank: 2, name: '일산 두산위브', volume: 198, location: '탄현동', change: '+4.5%' },
      { rank: 3, name: '운정 푸르지오', volume: 176, location: '운정동', change: '+6.2%' },
      { rank: 4, name: '파주 롯데캐슬', volume: 154, location: '금촌동', change: '+3.8%' },
      { rank: 5, name: '운정 호반베르디움', volume: 142, location: '운정동', change: '+4.1%' },
    ],
  },
  gangnam: {
    mostExpensive: [
      { rank: 1, name: '타워팰리스', price: '85억원', location: '도곡동', change: '+12.3%' },
      { rank: 2, name: '아크로리버파크', price: '68억원', location: '압구정동', change: '+10.8%' },
      { rank: 3, name: '청담 래미안퍼스티지', price: '54억원', location: '청담동', change: '+9.2%' },
      { rank: 4, name: '압구정 현대', price: '48억원', location: '압구정동', change: '+8.5%' },
      { rank: 5, name: '대치 은마아파트', price: '42억원', location: '대치동', change: '+7.8%' },
    ],
    cheapest: [
      { rank: 1, name: '개포 주공1단지', price: '12억 5천만원', location: '개포동', change: '+5.2%' },
      { rank: 2, name: '대치 미도', price: '13억 8천만원', location: '대치동', change: '+4.8%' },
      { rank: 3, name: '압구정 한양', price: '14억 2천만원', location: '압구정동', change: '+5.1%' },
      { rank: 4, name: '역삼 삼익', price: '15억원', location: '역삼동', change: '+4.5%' },
      { rank: 5, name: '개포 주공2단지', price: '15억 5천만원', location: '개포동', change: '+4.9%' },
    ],
    mostTraded: [
      { rank: 1, name: '대치 래미안', volume: 456, location: '대치동', change: '+8.2%' },
      { rank: 2, name: '압구정 현대', volume: 389, location: '압구정동', change: '+7.5%' },
      { rank: 3, name: '역삼 래미안', volume: 342, location: '역삼동', change: '+6.8%' },
      { rank: 4, name: '개포 주공', volume: 298, location: '개포동', change: '+6.2%' },
      { rank: 5, name: '청담 삼성', volume: 267, location: '청담동', change: '+5.9%' },
    ],
  },
  hwacheon: {
    mostExpensive: [
      { rank: 1, name: '화천 센트럴파크', price: '2억 3천만원', location: '화천읍', change: '+4.5%' },
      { rank: 2, name: '화천 중앙하이츠', price: '2억원', location: '화천읍', change: '+3.8%' },
      { rank: 3, name: '화천 대림', price: '1억 8천만원', location: '화천읍', change: '+4.2%' },
      { rank: 4, name: '화천 한양', price: '1억 5천만원', location: '화천읍', change: '+3.5%' },
      { rank: 5, name: '화천 우성', price: '1억 2천만원', location: '화천읍', change: '+3.1%' },
    ],
    cheapest: [
      { rank: 1, name: '간동 주공', price: '5천만원', location: '간동면', change: '+2.5%' },
      { rank: 2, name: '사내 대림', price: '6천만원', location: '사내면', change: '+2.8%' },
      { rank: 3, name: '하남 한양', price: '7천만원', location: '하남면', change: '+2.2%' },
      { rank: 4, name: '간동 한양', price: '8천만원', location: '간동면', change: '+2.6%' },
      { rank: 5, name: '화천 구)청', price: '9천만원', location: '화천읍', change: '+2.9%' },
    ],
    mostTraded: [
      { rank: 1, name: '화천 센트럴파크', volume: 45, location: '화천읍', change: '+4.8%' },
      { rank: 2, name: '화천 중앙하이츠', volume: 38, location: '화천읍', change: '+4.2%' },
      { rank: 3, name: '화천 대림', volume: 29, location: '화천읍', change: '+3.8%' },
      { rank: 4, name: '화천 한양', volume: 23, location: '화천읍', change: '+3.5%' },
      { rank: 5, name: '간동 주공', volume: 18, location: '간동면', change: '+3.2%' },
    ],
  },
};

const tabs = [
  { id: 'mostExpensive', label: '시세 높음' },
  { id: 'cheapest', label: '시세 저렴' },
  { id: 'mostTraded', label: '거래 활발' },
];

export default function RegionalRanking({ isDarkMode, region }: RegionalRankingProps) {
  const [selectedTab, setSelectedTab] = useState('mostExpensive');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const data = rankingData[region] || rankingData.paju;
  const currentItems = data[selectedTab];
  const showVolume = selectedTab === 'mostTraded';

  const toggleFavorite = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavorites = new Set(favorites);
    if (newFavorites.has(name)) {
      newFavorites.delete(name);
    } else {
      newFavorites.add(name);
    }
    setFavorites(newFavorites);
  };

  return (
    <div className={`rounded-2xl overflow-hidden border ${
      isDarkMode 
        ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50 border-white/10' 
        : 'bg-white border-black/5 shadow-lg shadow-black/5'
    }`}>
      {/* Header with Tabs */}
      <div className="p-5 pb-0">
        <h2 className={`font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
          실시간 랭킹
        </h2>
        
        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-zinc-800/50 dark:border-zinc-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`pb-3 px-1 font-semibold text-sm transition-all relative ${
                selectedTab === tab.id
                  ? isDarkMode
                    ? 'text-white'
                    : 'text-zinc-900'
                  : isDarkMode
                  ? 'text-zinc-500 hover:text-zinc-300'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {tab.label}
              {selectedTab === tab.id && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-sky-500 to-blue-600"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List Items */}
      <div
        key={selectedTab}
      >
        {currentItems.map((item: any, index: number) => {
          const isPositive = item.change.startsWith('+');
          const isFavorite = favorites.has(item.name);
          
          return (
            <button
              key={item.rank}
              className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-all active:scale-[0.98] border-t ${
                isDarkMode ? 'hover:bg-zinc-800/50 active:bg-zinc-800/70 border-white/5' : 'hover:bg-sky-50/50 active:bg-sky-50 border-black/5'
              }`}
            >
              {/* Rank Badge */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                item.rank === 1
                  ? 'bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md'
                  : item.rank === 2
                  ? isDarkMode 
                    ? 'bg-zinc-700 text-zinc-300'
                    : 'bg-zinc-200 text-zinc-700'
                  : item.rank === 3
                  ? isDarkMode
                    ? 'bg-zinc-800 text-zinc-400'
                    : 'bg-zinc-100 text-zinc-600'
                  : isDarkMode
                  ? 'bg-zinc-800 text-zinc-500'
                  : 'bg-zinc-100 text-zinc-600'
              }`}>
                {item.rank}
              </div>

              {/* Name and Location */}
              <div className="flex-1 min-w-0">
                <p className={`font-semibold truncate ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  {item.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                    {showVolume ? `${item.volume}건` : item.price}
                  </p>
                  <span className={`text-xs font-semibold ${
                    isPositive 
                      ? 'text-red-500' 
                      : 'text-blue-500'
                  }`}>
                    {item.change}
                  </span>
                </div>
              </div>

              {/* Favorite Heart */}
              <button
                onClick={(e) => toggleFavorite(item.name, e)}
                className="flex-shrink-0 p-2 transition-transform active:scale-90"
              >
                <Heart 
                  className={`w-5 h-5 transition-colors ${
                    isFavorite
                      ? 'fill-red-500 text-red-500'
                      : isDarkMode
                      ? 'text-zinc-600 hover:text-zinc-400'
                      : 'text-zinc-400 hover:text-zinc-600'
                  }`}
                />
              </button>
            </button>
          );
        })}
      </div>
    </div>
  );
}