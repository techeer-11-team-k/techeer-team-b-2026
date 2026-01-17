import React, { useState, useRef, useCallback } from 'react';
import { MapPin, Building2 } from 'lucide-react';
import { ApartmentSearchResult, LocationSearchResult } from '../../lib/searchApi';

interface UnifiedSearchResultsProps {
  apartmentResults: ApartmentSearchResult[];
  locationResults: LocationSearchResult[];
  onApartmentSelect: (apt: ApartmentSearchResult) => void;
  onLocationSelect: (location: LocationSearchResult) => void;
  isDarkMode: boolean;
  query: string;
  isSearchingApartments: boolean;
  isSearchingLocations: boolean;
  onShowMore?: () => void;
  showMoreButton?: boolean;
}

export default function UnifiedSearchResults({
  apartmentResults,
  locationResults,
  onApartmentSelect,
  onLocationSelect,
  isDarkMode,
  query,
  isSearchingApartments,
  isSearchingLocations,
  onShowMore,
  showMoreButton = false,
}: UnifiedSearchResultsProps) {
  // 마우스 드래그로 스크롤을 위한 ref 및 state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);
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
  }, [locationResults.length]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !scrollContainerRef.current || locationResults.length === 0) return;
    
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
  }, [isDragging, startX, scrollLeft, locationResults.length]);

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

  const hasResults = apartmentResults.length > 0 || locationResults.length > 0;
  const isSearching = isSearchingApartments || isSearchingLocations;
  
  // 최대 10개만 표시
  const MAX_DISPLAY = 10;
  const displayedLocationResults = locationResults.slice(0, MAX_DISPLAY);
  const displayedApartmentResults = apartmentResults.slice(0, MAX_DISPLAY);
  const hasMoreLocations = locationResults.length > MAX_DISPLAY;
  const hasMoreApartments = apartmentResults.length > MAX_DISPLAY;
  const showMore = showMoreButton && (hasMoreLocations || hasMoreApartments);
  
  if (query.length < 1) return null;

  if (query.length >= 1 && !hasResults && !isSearching) {
    return (
      <div className={`py-8 text-center ${isDarkMode ? 'text-white' : 'text-zinc-700'}`}>
        검색 결과가 없습니다.
      </div>
    );
  }

  if (isSearching && !hasResults) {
    return (
      <div className={`py-8 text-center ${isDarkMode ? 'text-white' : 'text-zinc-700'}`}>
        검색 중...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 지역 검색 결과 - 가로 스크롤 Pill 형태 */}
      {displayedLocationResults.length > 0 && (
        <div>
          <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-white' : 'text-zinc-700'}`}>
            지역 ({locationResults.length}개{hasMoreLocations ? `, ${displayedLocationResults.length}개 표시` : ''})
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
              {displayedLocationResults.map((location) => {
                const displayName = location.full_name || location.region_name;
                const getLocationTypeLabel = () => {
                  if (location.location_type === 'city') return '시도';
                  if (location.location_type === 'sigungu') return '시군구';
                  if (location.location_type === 'dong') return '동';
                  return '';
                };
                
                return (
                  <button
                    key={location.region_id}
                    onClick={(e) => {
                      if ((e.currentTarget as any)._isDragging || hasMoved) {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.currentTarget as any)._isDragging = false;
                        return;
                      }
                      onLocationSelect(location);
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
      )}

      {/* 아파트 검색 결과 */}
      {displayedApartmentResults.length > 0 && (
        <div>
          <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-white' : 'text-zinc-700'}`}>
            아파트 ({apartmentResults.length}개{hasMoreApartments ? `, ${displayedApartmentResults.length}개 표시` : ''})
          </p>
          <ul className="space-y-1">
            {displayedApartmentResults.map((apt) => (
              <li key={apt.apt_id}>
                <button
                  onClick={() => onApartmentSelect(apt)}
                  className={`w-full text-left p-3 rounded-xl transition-all flex items-start group ${
                    isDarkMode 
                      ? 'bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50' 
                      : 'bg-zinc-50 hover:bg-zinc-100 border border-zinc-200'
                  }`}
                >
                  <div className={`mt-0.5 mr-3 p-2 rounded-full transition-colors shrink-0 ${
                      isDarkMode 
                        ? 'bg-blue-900/30 text-blue-400 group-hover:bg-blue-900/50' 
                        : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'
                  }`}>
                    <Building2 size={16} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <p className={`text-base font-bold truncate pr-2 ${
                        isDarkMode ? 'text-white' : 'text-zinc-900'
                      }`}>
                        {apt.apt_name}
                      </p>
                      <div className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        isDarkMode
                          ? 'bg-zinc-700 border-zinc-600 text-zinc-300'
                          : 'bg-white border-zinc-300 text-zinc-700'
                      }`}>
                        아파트
                      </div>
                    </div>
                    <p className={`text-xs mt-0.5 line-clamp-1 ${
                      isDarkMode ? 'text-zinc-300' : 'text-zinc-600'
                    }`}>
                      {apt.address}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* 더보기 버튼 */}
      {showMore && onShowMore && (
        <button
          onClick={onShowMore}
          className={`w-full py-3 rounded-xl font-semibold transition-all ${
            isDarkMode
              ? 'bg-zinc-800 hover:bg-zinc-700 text-sky-400 border border-zinc-700'
              : 'bg-zinc-100 hover:bg-zinc-200 text-sky-600 border border-zinc-300'
          }`}
        >
          더보기 ({locationResults.length + apartmentResults.length - MAX_DISPLAY * 2}개 더)
        </button>
      )}
    </div>
  );
}
