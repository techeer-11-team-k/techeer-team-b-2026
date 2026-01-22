import React, { useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';

interface RankingProps {
  isDarkMode: boolean;
}

const topRisers = [
  { rank: 1, name: '강남 래미안', location: '서울 강남구', change: '+12.5%', price: '21억 5천만원', priceChange: '+2억 4천만원' },
  { rank: 2, name: '해운대 센텀', location: '부산 해운대구', change: '+9.8%', price: '8억 2천만원', priceChange: '+7천3백만원' },
  { rank: 3, name: '송도 더샵', location: '인천 연수구', change: '+8.3%', price: '7억 5천만원', priceChange: '+5천7백만원' },
  { rank: 4, name: '분당 판교원마을', location: '경기 성남시', change: '+7.9%', price: '13억 2천만원', priceChange: '+9천6백만원' },
  { rank: 5, name: '용산 아크로리버파크', location: '서울 용산구', change: '+7.2%', price: '28억 5천만원', priceChange: '+1억 9천만원' },
];

const topDecliners = [
  { rank: 1, name: '목동 아이파크', location: '서울 양천구', change: '-3.2%', price: '15억 8천만원', priceChange: '-5천2백만원' },
  { rank: 2, name: '일산 힐스테이트', location: '경기 고양시', change: '-2.7%', price: '6억 9천만원', priceChange: '-1천9백만원' },
  { rank: 3, name: '판교 푸르지오', location: '경기 성남시', change: '-2.1%', price: '12억 3천만원', priceChange: '-2천6백만원' },
  { rank: 4, name: '분당 정자동 주공', location: '경기 성남시', change: '-1.8%', price: '9억 8천만원', priceChange: '-1천8백만원' },
  { rank: 5, name: '광교 호반베르디움', location: '경기 수원시', change: '-1.5%', price: '11억 5천만원', priceChange: '-1천7백만원' },
];

const topVolume = [
  { rank: 1, name: '송파 헬리오시티', location: '서울 송파구', volume: 234, price: '14억 8천만원', change: '+6.2%' },
  { rank: 2, name: '마곡 힐스테이트', location: '서울 강서구', volume: 189, price: '10억 3천만원', change: '+5.1%' },
  { rank: 3, name: '일산 두산위브', location: '경기 고양시', volume: 167, price: '12억 1천만원', change: '+4.3%' },
  { rank: 4, name: '청라 국제도시', location: '인천 서구', volume: 152, price: '8억 7천만원', change: '+3.8%' },
  { rank: 5, name: '김포 한강신도시', location: '경기 김포시', volume: 143, price: '7억 2천만원', change: '+2.9%' },
];

type CategoryType = 'risers' | 'decliners' | 'volume';

export default function Ranking({ isDarkMode }: RankingProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('risers');

  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-sky-800/30 shadow-[8px_8px_20px_rgba(0,0,0,0.5),-4px_-4px_12px_rgba(100,100,150,0.05)]'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';
  
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-900';
    if (rank === 2) return 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800';
    if (rank === 3) return 'bg-gradient-to-r from-amber-600 to-amber-700 text-amber-100';
    return isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700';
  };

  const currentData = selectedCategory === 'risers' ? topRisers : selectedCategory === 'decliners' ? topDecliners : topVolume;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`rounded-2xl p-6 ${cardClass}`}>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-xl shadow-lg">
            <Trophy className="w-6 h-6 text-yellow-900" />
          </div>
          <div>
            <h2 className={`text-2xl font-bold ${textPrimary}`}>랭킹</h2>
            <p className={`text-sm ${textSecondary} mt-1`}>최근 3개월 기준</p>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className={`p-1 rounded-2xl ${isDarkMode ? 'bg-slate-800/30' : 'bg-sky-50/80'}`}>
        <div className="flex gap-1">
          <button
            onClick={() => setSelectedCategory('risers')}
            className={`flex-1 px-3 py-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 ${
              selectedCategory === 'risers'
                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg scale-105'
                : isDarkMode
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-600 hover:text-green-600'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs">최고 상승</span>
          </button>
          <button
            onClick={() => setSelectedCategory('decliners')}
            className={`flex-1 px-3 py-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 ${
              selectedCategory === 'decliners'
                ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg scale-105'
                : isDarkMode
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-600 hover:text-red-600'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span className="text-xs">최고 하락</span>
          </button>
          <button
            onClick={() => setSelectedCategory('volume')}
            className={`flex-1 px-3 py-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 ${
              selectedCategory === 'volume'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg scale-105'
                : isDarkMode
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-600 hover:text-sky-600'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span className="text-xs">거래량</span>
          </button>
        </div>
      </div>

      {/* Ranking List */}
      <div className="space-y-3">
        {currentData.map((item: any, index: number) => (
          <div
            key={index}
            className={`rounded-2xl p-4 ${cardClass} hover:shadow-xl transition-all cursor-pointer active:scale-98`}
          >
            <div className="flex items-start gap-3">
              {/* Rank Badge */}
              <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold shadow-lg ${getRankColor(item.rank)}`}>
                {item.rank}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className={`font-bold text-base ${textPrimary}`}>{item.name}</h3>
                <p className={`text-xs ${textSecondary}`}>{item.location}</p>
                
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-baseline gap-2">
                    <p className={`text-lg font-bold ${textPrimary}`}>{item.price}</p>
                    {selectedCategory !== 'volume' && (
                      <p className={`text-xs font-bold ${
                        selectedCategory === 'risers' 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {item.priceChange}
                      </p>
                    )}
                  </div>
                  
                  {selectedCategory === 'volume' ? (
                    <div className={`px-3 py-1.5 rounded-full font-bold text-base shadow-lg ${
                      isDarkMode 
                        ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white border-2 border-sky-400/50' 
                        : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-2 border-sky-300'
                    }`}>
                      {item.volume}건
                    </div>
                  ) : (
                    <div className={`px-3 py-1.5 rounded-full font-bold text-sm ${
                      selectedCategory === 'risers'
                        ? isDarkMode 
                          ? 'bg-green-600 text-white' 
                          : 'bg-green-600 text-white'
                        : isDarkMode 
                          ? 'bg-red-600 text-white' 
                          : 'bg-red-600 text-white'
                    }`}>
                      {item.change}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}