import React from 'react';
import { MapPin } from 'lucide-react';
import { ApartmentSearchResult } from '../../lib/searchApi';

interface SearchResultsListProps {
  results: ApartmentSearchResult[];
  onSelect: (apt: ApartmentSearchResult) => void;
  isDarkMode: boolean;
  query: string;
  isSearching: boolean;
}

export default function SearchResultsList({ 
  results, 
  onSelect, 
  isDarkMode, 
  query,
  isSearching 
}: SearchResultsListProps) {
  
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

  return (
    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar overscroll-contain">
      <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
        검색 결과
      </p>
      <ul className="space-y-1">
        {results.map((apt) => (
          <li key={apt.apt_id}>
            <button
              onClick={() => onSelect(apt)}
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
        ))}
      </ul>
    </div>
  );
}
