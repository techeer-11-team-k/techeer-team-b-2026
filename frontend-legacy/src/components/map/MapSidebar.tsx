import React, { useState } from 'react';
import { Search, SlidersHorizontal, MapPin } from 'lucide-react';

interface MapSidebarProps {
  isDarkMode: boolean;
  onApartmentSelect?: (apt: any) => void;
  apartments: any[];
}

export default function MapSidebar({ isDarkMode, onApartmentSelect, apartments }: MapSidebarProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'filter'>('list');

  const bgBase = isDarkMode ? 'bg-slate-900' : 'bg-white';
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const borderColor = isDarkMode ? 'border-slate-800' : 'border-slate-200';
  const hoverBg = isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50';

  return (
    <div className={`flex flex-col w-[400px] h-full border-r z-10 ${bgBase} ${borderColor}`}>
      {/* Header / Search */}
      <div className={`p-4 border-b ${borderColor}`}>
        <h2 className={`text-xl font-bold mb-4 ${textPrimary}`}>부동산 찾기</h2>
        <div className={`flex items-center px-3 py-2.5 rounded-lg border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
          <Search className={`w-5 h-5 mr-2 ${textSecondary}`} />
          <input
            type="text"
            placeholder="지역, 아파트명 검색"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex border-b ${borderColor}`}>
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'list' 
              ? 'border-blue-600 text-blue-600' 
              : `border-transparent ${textSecondary} hover:text-blue-500`
          }`}
        >
          검색 결과
        </button>
        <button
          onClick={() => setActiveTab('filter')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'filter' 
              ? 'border-blue-600 text-blue-600' 
              : `border-transparent ${textSecondary} hover:text-blue-500`
          }`}
        >
          필터
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'list' ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {apartments.map((apt) => (
              <div
                key={apt.id}
                onClick={() => onApartmentSelect?.(apt)}
                className={`p-4 cursor-pointer transition-colors ${hoverBg}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className={`font-bold ${textPrimary}`}>{apt.name}</h3>
                  <span className="text-blue-600 font-bold">{apt.price}</span>
                </div>
                <div className="flex items-center text-xs text-slate-500">
                  <MapPin className="w-3 h-3 mr-1" />
                  {apt.location}
                </div>
              </div>
            ))}
             <div className="p-8 text-center text-sm text-slate-400">
                더 많은 매물이 있습니다.
             </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            <SlidersHorizontal className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className={textSecondary}>상세 필터 기능 개발 중</p>
          </div>
        )}
      </div>
    </div>
  );
}
