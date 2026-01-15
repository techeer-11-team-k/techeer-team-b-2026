import React from 'react';
import { MapPin, Building2 } from 'lucide-react';
import { UnifiedSearchResult } from '../../lib/searchApi';

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
  
  if (query.length >= 2 && results.length === 0 && !isSearching) {
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

  // 아파트와 지역을 분리
  const apartments = results.filter(r => r.type === 'apartment');
  const locations = results.filter(r => r.type === 'location');

  return (
    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar overscroll-contain">
      {/* 아파트 검색 결과 */}
      {apartments.length > 0 && (
        <div className="mb-4">
          <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
            아파트 ({apartments.length})
          </p>
          <ul className="space-y-1">
            {apartments.map((result) => {
              const apt = result.apartment!;
              return (
                <li key={`apt-${apt.apt_id}`}>
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
                      <Building2 size={16} />
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
      )}

      {/* 지역 검색 결과 */}
      {locations.length > 0 && (
        <div>
          <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
            지역 ({locations.length})
          </p>
          <ul className="space-y-1">
            {locations.map((result) => {
              const loc = result.location!;
              return (
                <li key={`loc-${loc.id}`}>
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
                          ? 'bg-green-900/30 text-green-400 group-hover:bg-green-900/50' 
                          : 'bg-green-50 text-green-500 group-hover:bg-green-100'
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
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-400'
                            : 'bg-white border-zinc-200 text-zinc-500'
                        }`}>
                          {loc.type === 'sigungu' ? '시군구' : '동'}
                        </div>
                      </div>
                      <p className={`text-xs mt-0.5 line-clamp-1 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                        {loc.name}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
