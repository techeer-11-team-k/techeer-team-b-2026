import React from 'react';
import { MapPin } from 'lucide-react';
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

  // 각 결과를 개별 항목으로 표시 (동도 시군구처럼 개별 표시)
  const grouped = groupLocationsBySigungu(results);
  const locationList = Array.from(grouped.keys()).sort((a, b) => {
    // full_name 기준으로 정렬 (region_id 제거)
    const nameA = a.split('_')[0];
    const nameB = b.split('_')[0];
    return nameA.localeCompare(nameB, 'ko');
  });

  return (
    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar overscroll-contain">
      <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
        검색 결과 ({results.length}개)
      </p>
      <div className="space-y-1">
        {locationList.map((locationKey) => {
          const locations = grouped.get(locationKey) || [];
          const location = locations[0]; // 각 그룹의 첫 번째 항목
          
          // location_type에 따른 레이블
          const getLocationTypeLabel = () => {
            if (location.location_type === 'city') return '시도';
            if (location.location_type === 'sigungu') return '시군구';
            if (location.location_type === 'dong') return '동';
            return '';
          };
          
          // 표시할 이름 (full_name 또는 region_name)
          const displayName = location.full_name || location.region_name;
          
          return (
            <div key={locationKey} className={`rounded-xl overflow-hidden ${
              isDarkMode 
                ? 'bg-zinc-800/50 border border-zinc-700/50' 
                : 'bg-zinc-50 border border-zinc-200'
            }`}>
              <button
                onClick={() => {
                  // 클릭하면 바로 선택 (아파트 리스트 표시)
                  onSelect(location);
                }}
                className={`w-full flex items-center gap-3 p-3 transition-colors group ${
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
                  <p className={`text-sm font-bold ${isDarkMode ? 'text-zinc-100 group-hover:text-blue-400' : 'text-zinc-900 group-hover:text-blue-600'} transition-colors`}>
                    {displayName}
                  </p>
                  <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    {getLocationTypeLabel()}
                  </p>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
