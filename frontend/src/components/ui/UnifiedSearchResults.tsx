import React, { useState, useRef, useCallback, useMemo } from 'react';
import { MapPin, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

  const hasResults = useMemo(() => apartmentResults.length > 0 || locationResults.length > 0, [apartmentResults.length, locationResults.length]);
  const isSearching = useMemo(() => isSearchingApartments || isSearchingLocations, [isSearchingApartments, isSearchingLocations]);
  
  // 아파트 검색 결과 초기 표시 개수 및 더 보기 상태
  const INITIAL_APARTMENT_DISPLAY = 4;
  const [showAllApartments, setShowAllApartments] = useState(false);
  const apartmentScrollRef = useRef<HTMLDivElement>(null);
  
  // 최대 10개만 표시 (지역)
  const MAX_DISPLAY = 10;
  const displayedLocationResults = useMemo(() => locationResults.slice(0, MAX_DISPLAY), [locationResults]);
  const displayedApartmentResults = useMemo(() => showAllApartments 
    ? apartmentResults 
    : apartmentResults.slice(0, INITIAL_APARTMENT_DISPLAY), [showAllApartments, apartmentResults]);
  const hasMoreLocations = useMemo(() => locationResults.length > MAX_DISPLAY, [locationResults.length]);
  const hasMoreApartments = useMemo(() => apartmentResults.length > INITIAL_APARTMENT_DISPLAY, [apartmentResults.length]);
  const showMore = useMemo(() => showMoreButton && (hasMoreLocations || hasMoreApartments), [showMoreButton, hasMoreLocations, hasMoreApartments]);
  
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
      {apartmentResults.length > 0 && (
        <div>
          <p className={`text-xs font-semibold mb-2 px-1 ${isDarkMode ? 'text-white' : 'text-zinc-700'}`}>
            아파트 ({apartmentResults.length}개{hasMoreApartments && !showAllApartments ? `, ${INITIAL_APARTMENT_DISPLAY}개 표시` : ''})
          </p>
          <div 
            ref={apartmentScrollRef}
            className={`max-h-[60vh] overflow-y-auto overflow-x-hidden custom-scrollbar overscroll-contain ${showAllApartments ? '' : ''}`}
          >
            <ul className="space-y-1">
              <AnimatePresence mode="popLayout">
                {displayedApartmentResults.map((apt, index) => (
                  <motion.li
                    key={apt.apt_id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ 
                      duration: 0.2,
                      delay: index * 0.03,
                      ease: "easeOut"
                    }}
                  >
                    <motion.button
                      onClick={() => onApartmentSelect(apt)}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full text-left p-2 rounded transition-all flex items-center gap-2 group ${
                        isDarkMode 
                          ? 'hover:bg-zinc-800/50 hover:shadow-md' 
                          : 'hover:bg-zinc-50 hover:shadow-sm'
                      }`}
                    >
                      <Building2 size={14} className={`shrink-0 transition-colors ${
                        isDarkMode ? 'text-blue-400 group-hover:text-blue-300' : 'text-blue-600 group-hover:text-blue-700'
                      }`} />
                      
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className={`text-sm font-medium truncate transition-colors ${
                          isDarkMode ? 'text-white group-hover:text-sky-300' : 'text-zinc-900 group-hover:text-sky-700'
                        }`}>
                          {apt.apt_name}
                        </p>
                        <p className={`text-xs mt-0.5 truncate transition-colors ${
                          isDarkMode ? 'text-zinc-400 group-hover:text-zinc-300' : 'text-zinc-600 group-hover:text-zinc-700'
                        }`}>
                          {apt.address}
                        </p>
                      </div>
                    </motion.button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
          
          {/* 더 보기 버튼 - 아파트와 지역 통합 */}
          {(hasMoreApartments && !showAllApartments) || (showMore && onShowMore) ? (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                if (hasMoreApartments && !showAllApartments) {
                  setShowAllApartments(true);
                  setTimeout(() => {
                    apartmentScrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 100);
                } else if (showMore && onShowMore) {
                  onShowMore();
                }
              }}
              className={`w-full mt-2 py-2 rounded-xl font-semibold text-sm transition-all ${
                isDarkMode
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-sky-400 border border-zinc-700'
                  : 'bg-zinc-100 hover:bg-zinc-200 text-sky-600 border border-zinc-300'
              }`}
            >
              {hasMoreApartments && !showAllApartments
                ? `더 보기 (아파트 ${apartmentResults.length - INITIAL_APARTMENT_DISPLAY}개 더)`
                : showMore && onShowMore
                ? `더보기 (전체 ${locationResults.length + apartmentResults.length - MAX_DISPLAY * 2}개 더)`
                : '더 보기'}
            </motion.button>
          ) : null}
        </div>
      )}
    </div>
  );
}
