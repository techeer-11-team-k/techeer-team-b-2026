import React, { useState, useRef, useCallback } from 'react';
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
  // 마우스 드래그로 스크롤을 위한 ref 및 state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);
  
  if (query.length >= 1 && results.length === 0 && !isSearching) {
    return (
      <div className={`py-4 text-center ${isDarkMode ? 'text-white' : 'text-zinc-700'}`}>
        검색 결과가 없습니다.
      </div>
    );
  }

  if (isSearching && results.length === 0) {
    return (
      <div className={`py-4 text-center ${isDarkMode ? 'text-white' : 'text-zinc-700'}`}>
        검색 중...
      </div>
    );
  }

  if (results.length === 0) return null;

  // 마우스 드래그 스크롤 핸들러
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollContainerRef.current || results.length === 0) return;
    
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
  }, [results.length]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !scrollContainerRef.current || results.length === 0) return;
    
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
  }, [isDragging, startX, scrollLeft, results.length]);

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
  }, []);

  // 각 결과를 개별 항목으로 표시 (동도 시군구처럼 개별 표시)
  const grouped = groupLocationsBySigungu(results);
  const locationList = Array.from(grouped.keys()).sort((a, b) => {
    // full_name 기준으로 정렬 (region_id 제거)
    const nameA = a.split('_')[0];
    const nameB = b.split('_')[0];
    return nameA.localeCompare(nameB, 'ko');
  });

  return (
    <div>
      <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-white' : 'text-zinc-700'}`}>
        검색 결과 ({results.length}개)
      </p>
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
              <button
                key={locationKey}
                onClick={(e) => {
                  if ((e.currentTarget as any)._isDragging || hasMoved) {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.currentTarget as any)._isDragging = false;
                    return;
                  }
                  onSelect(location);
                }}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                    : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                }`}
              >
                <MapPin className="w-4 h-4 shrink-0" />
                <span>{displayName}</span>
                <span className="text-xs opacity-70 shrink-0">({getLocationTypeLabel()})</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
