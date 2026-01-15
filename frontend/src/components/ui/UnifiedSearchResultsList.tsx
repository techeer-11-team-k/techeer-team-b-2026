import React from 'react';
import { MapPin } from 'lucide-react';
import { UnifiedSearchResult } from '../../hooks/useUnifiedSearch';

interface UnifiedSearchResultsListProps {
  results: UnifiedSearchResult[];
  onSelect: (result: UnifiedSearchResult) => void;
  isDarkMode: boolean;
  query: string;
  isSearching: boolean;
}

export default function UnifiedSearchResultsList({ 
  results, 
  onSelect, 
  isDarkMode, 
  query,
  isSearching 
}: UnifiedSearchResultsListProps) {
  
  // 지역 검색은 1글자부터 가능하므로 조건 변경
  const minLength = results.some(r => r.type === 'location') ? 1 : 2;
  
  if (query.length >= minLength && results.length === 0 && !isSearching) {
    return (
      <div className={`py-4 text-center ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
        검색 결과가 없습니다.
      </div>
    );
  }

  if (isSearching && results.length === 0) {
      return (
        <div className={`py-4 text-center ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
          검색 중...
        </div>
      );
  }

  if (results.length === 0) return null;

  // 아파트와 지역 결과 분리
  const apartmentResults = results.filter(r => r.type === 'apartment' && r.apartment);
  const locationResults = results.filter(r => r.type === 'location' && r.location);

  if (apartmentResults.length === 0 && locationResults.length === 0) return null;

  return (
    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar overscroll-contain">
      <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
        검색 결과
      </p>
      <ul className="space-y-1">
        {/* 지역 결과 먼저 표시 */}
        {locationResults.map((result) => {
          const loc = result.location;
          return (
            <li key={`location-${loc.id}`}>
              <button
                onClick={() => onSelect(result)}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-start group ${
                  isDarkMode 
                    ? 'hover:bg-zinc-800' 
                    : 'hover:bg-zinc-100'
                }`}
              >
                <div className={`mt-0.5 mr-3 p-2 rounded-full transition-colors shrink-0 ${
                    isDarkMode 
                      ? 'bg-red-900/30 text-red-400 group-hover:bg-red-900/50' 
                      : 'bg-red-50 text-red-500 group-hover:bg-red-100'
                }`}>
                  <MapPin size={16} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <p className={`text-base font-bold truncate pr-2 ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                      {loc.full_name}
                    </p>
                    <div className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      isDarkMode
                        ? 'bg-red-900/30 border-red-800 text-red-400'
                        : 'bg-red-50 border-red-200 text-red-600'
                    }`}>
                      {loc.type === 'sigungu' ? '시군구' : '동'}
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
        
        {/* 아파트 결과 표시 */}
        {apartmentResults.map((result) => {
          const apt = result.apartment;
          return (
            <li key={apt.apt_id}>
              <button
                onClick={() => onSelect(result)}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-start group ${
                  isDarkMode 
                    ? 'hover:bg-zinc-800' 
                    : 'hover:bg-zinc-100'
                }`}
              >
                <div className={`mt-0.5 mr-3 p-2 rounded-full transition-colors shrink-0 ${
                    isDarkMode 
                      ? 'bg-blue-900/30 text-blue-400 group-hover:bg-blue-900/50' 
                      : 'bg-blue-50 text-blue-500 group-hover:bg-blue-100'
                }`}>
                  <MapPin size={16} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <p className={`text-base font-bold truncate pr-2 ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                      {apt.apt_name}
                    </p>
                    <div className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      isDarkMode
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-400'
                        : 'bg-white border-zinc-200 text-zinc-500'
                    }`}>
                      아파트
                    </div>
                  </div>
                  <p className={`text-xs mt-0.5 line-clamp-1 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                    {apt.address}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
