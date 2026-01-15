import React, { useState } from 'react';
import { MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import { LocationSearchResult, groupLocationsBySigungu } from '../../lib/searchApi';

interface LocationSearchResultsProps {
  results: LocationSearchResult[];
  onSelect: (location: LocationSearchResult) => void;
  isDarkMode: boolean;
  query: string;
  isSearching: boolean;
}

export default function LocationSearchResults({ 
  results, 
  onSelect, 
  isDarkMode, 
  query,
  isSearching 
}: LocationSearchResultsProps) {
  const [expandedSigungu, setExpandedSigungu] = useState<Set<string>>(new Set());
  
  if (query.length >= 1 && results.length === 0 && !isSearching) {
    return (
      <div className={`py-4 text-center ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
        검색 결과가 없습니다.
      </div>
    );
  }

  if (isSearching && results.length === 0) {
    return (
      <div className={`py-4 text-center ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
        검색 중...
      </div>
    );
  }

  if (results.length === 0) return null;

  // 시군구별로 그룹화
  const grouped = groupLocationsBySigungu(results);
  const sigunguList = Array.from(grouped.keys()).sort();

  const toggleSigungu = (sigungu: string) => {
    const newExpanded = new Set(expandedSigungu);
    if (newExpanded.has(sigungu)) {
      newExpanded.delete(sigungu);
    } else {
      newExpanded.add(sigungu);
    }
    setExpandedSigungu(newExpanded);
  };

  return (
    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar overscroll-contain">
      <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
        검색 결과 ({results.length}개)
      </p>
      <div className="space-y-1">
        {sigunguList.map((sigungu) => {
          const locations = grouped.get(sigungu) || [];
          const cityLocations = locations.filter(l => l.location_type === 'city');
          const sigunguLocations = locations.filter(l => l.location_type === 'sigungu');
          const dongLocations = locations.filter(l => l.location_type === 'dong');
          const isExpanded = expandedSigungu.has(sigungu);
          
          return (
            <div key={sigungu} className={`rounded-xl overflow-hidden ${
              isDarkMode 
                ? 'bg-zinc-800/50 border border-zinc-700/50' 
                : 'bg-zinc-50 border border-zinc-200'
            }`}>
              {/* 시도/시군구 헤더 */}
              {(cityLocations.length > 0 || sigunguLocations.length > 0) && (
                <button
                  onClick={() => {
                    // 시도 레벨은 바로 선택, 시군구는 토글
                    if (cityLocations.length > 0) {
                      onSelect(cityLocations[0]);
                    } else if (sigunguLocations.length > 0 && dongLocations.length === 0) {
                      onSelect(sigunguLocations[0]);
                    } else {
                      toggleSigungu(sigungu);
                    }
                  }}
                  className={`w-full flex items-center gap-3 p-3 transition-colors ${
                    isDarkMode 
                      ? 'hover:bg-zinc-800' 
                      : 'hover:bg-zinc-100'
                  }`}
                >
                  <div className={`p-2 rounded-full transition-colors shrink-0 ${
                    isDarkMode 
                      ? 'bg-blue-900/30 text-blue-400' 
                      : 'bg-blue-50 text-blue-600'
                  }`}>
                    <MapPin size={16} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-bold ${isDarkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>
                      {sigungu}
                    </p>
                    <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      {cityLocations.length > 0 
                        ? '시도' 
                        : dongLocations.length > 0 
                        ? `${dongLocations.length}개 동` 
                        : '시군구'}
                    </p>
                  </div>
                  {dongLocations.length > 0 && cityLocations.length === 0 && (
                    <div className="shrink-0">
                      {isExpanded ? (
                        <ChevronDown size={18} className={isDarkMode ? 'text-zinc-400' : 'text-zinc-600'} />
                      ) : (
                        <ChevronRight size={18} className={isDarkMode ? 'text-zinc-400' : 'text-zinc-600'} />
                      )}
                    </div>
                  )}
                </button>
              )}
              
              {/* 동 목록 (접기/펼치기) */}
              {dongLocations.length > 0 && isExpanded && (
                <div className={`border-t ${
                  isDarkMode ? 'border-zinc-700/50' : 'border-zinc-200'
                }`}>
                  {dongLocations.map((dong) => (
                    <button
                      key={dong.region_id}
                      onClick={() => onSelect(dong)}
                      className={`w-full flex items-center gap-3 p-3 pl-12 transition-colors group ${
                        isDarkMode 
                          ? 'hover:bg-zinc-800' 
                          : 'hover:bg-zinc-100'
                      }`}
                    >
                      <MapPin size={14} className={`shrink-0 ${
                        isDarkMode ? 'text-blue-400' : 'text-blue-600'
                      }`} />
                      <div className="flex-1 text-left">
                        <p className={`text-sm font-medium ${
                          isDarkMode 
                            ? 'text-zinc-200 group-hover:text-blue-400' 
                            : 'text-zinc-800 group-hover:text-blue-600'
                        } transition-colors`}>
                          {dong.region_name}
                        </p>
                        <p className={`text-xs mt-0.5 ${
                          isDarkMode ? 'text-zinc-500' : 'text-zinc-600'
                        }`}>
                          {dong.full_name}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {/* 시군구만 있고 동이 없으면 클릭 가능 */}
              {dongLocations.length === 0 && sigunguLocations.length > 0 && (
                <button
                  onClick={() => onSelect(sigunguLocations[0])}
                  className={`w-full flex items-center gap-3 p-3 transition-colors group ${
                    isDarkMode 
                      ? 'hover:bg-zinc-800' 
                      : 'hover:bg-zinc-100'
                  }`}
                >
                  <MapPin size={16} className={`shrink-0 ${
                    isDarkMode ? 'text-blue-400' : 'text-blue-600'
                  }`} />
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-medium ${
                      isDarkMode 
                        ? 'text-zinc-200 group-hover:text-blue-400' 
                        : 'text-zinc-800 group-hover:text-blue-600'
                    } transition-colors`}>
                      {sigunguLocations[0].region_name}
                    </p>
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
