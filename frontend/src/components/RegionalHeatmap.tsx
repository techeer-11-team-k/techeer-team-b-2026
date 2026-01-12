import React from 'react';

interface RegionalHeatmapProps {
  isDarkMode: boolean;
  region: string;
}

const heatmapData: Record<string, any[]> = {
  paju: [
    { name: '교하동', value: 11.9, color: 'from-red-500 to-red-600' },
    { name: '운정동', value: 9.2, color: 'from-orange-500 to-orange-600' },
    { name: '금촌동', value: 7.8, color: 'from-amber-500 to-amber-600' },
    { name: '문산읍', value: -2.1, color: 'from-blue-500 to-blue-600' },
  ],
  gangnam: [
    { name: '역삼동', value: 12.5, color: 'from-red-500 to-red-600' },
    { name: '대치동', value: 11.2, color: 'from-red-500 to-red-600' },
    { name: '압구정동', value: 10.8, color: 'from-orange-500 to-orange-600' },
    { name: '개포동', value: -1.2, color: 'from-blue-500 to-blue-600' },
  ],
  hwacheon: [
    { name: '화천읍', value: 5.2, color: 'from-emerald-500 to-emerald-600' },
    { name: '간동면', value: 4.1, color: 'from-amber-500 to-amber-600' },
    { name: '사내면', value: -1.8, color: 'from-blue-500 to-blue-600' },
    { name: '하남면', value: -1.2, color: 'from-blue-500 to-blue-600' },
  ],
};

export default function RegionalHeatmap({ isDarkMode, region }: RegionalHeatmapProps) {
  const regions = heatmapData[region] || heatmapData.paju;

  return (
    <div className={`rounded-3xl p-6 border ${
      isDarkMode 
        ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50 border-white/10' 
        : 'bg-white border-black/5 shadow-lg shadow-black/5'
    }`}>
      <div className="mb-5">
        <h2 className={`font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
          {region === 'paju' ? '파주시' : region === 'gangnam' ? '강남구' : '화천군'} 지역별 히트맵
        </h2>
        <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
          최근 3개월 평균 상승률 (%)
        </p>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-5">
        {regions.map((item, index) => (
          <button
            key={index}
            className="relative p-5 rounded-2xl overflow-hidden transition-all active:scale-95"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${item.color} ${isDarkMode ? 'opacity-80' : 'opacity-90'}`} />
            <div className="relative z-10">
              <h3 className="font-bold text-white drop-shadow-lg text-sm">{item.name}</h3>
              <p className="text-3xl font-bold text-white drop-shadow-lg mt-2">
                {item.value > 0 ? '+' : ''}{item.value}%
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-medium ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>낮음</span>
        <div className="flex-1 h-2.5 rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 via-amber-500 via-orange-500 to-red-600" />
        <span className={`text-xs font-medium ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>높음</span>
      </div>
    </div>
  );
}
