import React, { useState, useRef, useCallback } from 'react';
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
  // 마우스 드래그로 스크롤을 위한 ref 및 state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);
  
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

  // 마우스 드래그 스크롤 핸들러
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollContainerRef.current || locationResults.length === 0) return;
    
    setIsDragging(true);
    setHasMoved(false);
    const rect = scrollContainerRef.current.getBoundingClientRect();
    setStartX(e.pageX - rect.left);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
    
    const target = e.target as HTMLElement;
    const button = target.closest('button');
    if (button) {
      (button as any)._isDragging = false;
      (button as any)._startX = e.pageX;
      (button as any)._startY = e.pageY;
    }
    
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grabbing';
      scrollContainerRef.current.style.userSelect = 'none';
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !scrollContainerRef.current) return;
    
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const x = e.pageX - rect.left;
    const walk = (x - startX) * 2;
    const moveDistance = Math.abs(x - startX);
    
    if (moveDistance > 3) {
      setHasMoved(true);
      e.preventDefault();
      e.stopPropagation();
      scrollContainerRef.current.scrollLeft = scrollLeft - walk;
      
      if (scrollContainerRef.current) {
        const buttons = scrollContainerRef.current.querySelectorAll('button');
        buttons.forEach(btn => {
          (btn as any)._isDragging = true;
        });
      }
    }
  }, [isDragging, startX, scrollLeft]);

  const handleMouseUp = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grab';
      scrollContainerRef.current.style.userSelect = '';
    }
    
    if (scrollContainerRef.current) {
      const buttons = scrollContainerRef.current.querySelectorAll('button');
      buttons.forEach(btn => {
        (btn as any)._isDragging = false;
      });
    }
    
    setIsDragging(false);
    setHasMoved(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grab';
      scrollContainerRef.current.style.userSelect = '';
      
      const buttons = scrollContainerRef.current.querySelectorAll('button');
      buttons.forEach(btn => {
        (btn as any)._isDragging = false;
      });
    }
    
    setIsDragging(false);
    setHasMoved(false);
  }, [locationResults.length]);

  return (
    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar overscroll-contain">
      <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
        검색 결과
      </p>
      
      {/* 지역 결과 - 가로 스크롤 */}
      {locationResults.length > 0 && (
        <div className="mb-3">
          <div
            ref={scrollContainerRef}
            className={`overflow-x-auto scrollbar-hide overscroll-contain pb-2 -mx-1 px-1 cursor-grab ${isDragging ? 'cursor-grabbing' : ''}`}
            style={{
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              overflowY: 'hidden',
              position: 'relative'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={(e) => {
              if (scrollContainerRef.current && !isDragging) {
                if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                  e.preventDefault();
                  scrollContainerRef.current.scrollLeft += e.deltaY || e.deltaX;
                }
              }
            }}
          >
            <div className="flex gap-2 min-w-max">
              {locationResults.map((result) => {
                const loc = result.location;
                const getLocationTypeLabel = () => {
                  if (loc.type === 'city') return '시도';
                  if (loc.type === 'sigungu') return '시군구';
                  if (loc.type === 'dong') return '동';
                  return '';
                };
                
                return (
                  <button
                    key={`location-${loc.id}`}
                    onClick={(e) => {
                      if ((e.currentTarget as any)._isDragging || hasMoved) {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.currentTarget as any)._isDragging = false;
                        return;
                      }
                      onSelect(result);
                    }}
                    className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                      isDarkMode
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                        : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                    }`}
                  >
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span>{loc.full_name}</span>
                    <span className="text-xs opacity-70 shrink-0">({getLocationTypeLabel()})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {/* 아파트 결과 표시 - 세로 나열 유지 */}
      {apartmentResults.length > 0 && (
        <ul className="space-y-1">
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
      )}
    </div>
  );
}
