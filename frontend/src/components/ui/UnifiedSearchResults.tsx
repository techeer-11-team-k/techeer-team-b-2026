import React, { useState, useRef, useCallback, useMemo } from 'react';
import { MapPin, Building2, Search, ChevronRight } from 'lucide-react';
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
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`py-12 text-center ${isDarkMode ? 'text-white' : 'text-zinc-700'}`}
      >
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="flex flex-col items-center gap-3"
        >
          <div className={`p-4 rounded-full ${isDarkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
            <Search className={`w-8 h-8 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`} />
          </div>
          <div>
            <p className="text-sm font-medium">검색 결과가 없습니다</p>
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              다른 검색어로 시도해보세요
            </p>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  if (isSearching && !hasResults) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={`py-12 ${isDarkMode ? 'text-white' : 'text-zinc-700'}`}
      >
        <div className="flex flex-col items-center gap-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className={`p-3 rounded-full ${isDarkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}
          >
            <Search className={`w-6 h-6 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
          </motion.div>
          <div className="flex flex-col items-center gap-2">
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-sm font-medium"
            >
              검색 중...
            </motion.p>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className={`w-2 h-2 rounded-full ${
                    isDarkMode ? 'bg-sky-400' : 'bg-sky-600'
                  }`}
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 1, 0.5]
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeInOut"
                  }}
                />
              ))}
            </div>
          </div>
          {/* 스켈레톤 로더 */}
          <div className="w-full space-y-2 mt-4">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2
                }}
                className={`h-16 rounded-lg ${
                  isDarkMode ? 'bg-zinc-800' : 'bg-zinc-100'
                }`}
              />
            ))}
          </div>
        </div>
      </motion.div>
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
                  <motion.button
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
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 300,
                      damping: 20
                    }}
                    className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap relative overflow-hidden ${
                      isDarkMode
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                        : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                    }`}
                  >
                    {/* 호버 시 빛나는 효과 */}
                    <motion.div
                      className="absolute inset-0 opacity-0 hover:opacity-100"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                        backgroundSize: '200% 100%'
                      }}
                      whileHover={{
                        backgroundPosition: ['0% 0%', '200% 0%'],
                        transition: { duration: 0.6 }
                      }}
                    />
                    <MapPin className="w-4 h-4 shrink-0 relative z-10" />
                    <span className="relative z-10">{displayName}</span>
                    <span className="text-xs opacity-70 shrink-0 relative z-10">({getLocationTypeLabel()})</span>
                  </motion.button>
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
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96, height: 0 }}
                    transition={{ 
                      duration: 0.15,
                      delay: index * 0.02,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                  >
                    <motion.button
                      onClick={() => onApartmentSelect(apt)}
                      whileHover={{ x: 4, scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 group relative overflow-hidden ${
                        isDarkMode 
                          ? 'hover:bg-zinc-800/70 hover:shadow-lg hover:shadow-blue-500/10 border border-transparent hover:border-blue-500/20' 
                          : 'hover:bg-zinc-50 hover:shadow-md border border-transparent hover:border-blue-200'
                      }`}
                    >
                      {/* 호버 시 그라데이션 효과 */}
                      <motion.div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: isDarkMode
                            ? 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.1), transparent)'
                            : 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.05), transparent)'
                        }}
                      />
                      <motion.div
                        whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                        transition={{ duration: 0.5 }}
                      >
                        <Building2 size={16} className={`shrink-0 transition-colors relative z-10 ${
                          isDarkMode ? 'text-blue-400 group-hover:text-blue-300' : 'text-blue-600 group-hover:text-blue-700'
                        }`} />
                      </motion.div>
                      
                      <div className="flex-1 min-w-0 overflow-hidden relative z-10">
                        <motion.p
                          className={`text-sm font-medium truncate transition-colors ${
                            isDarkMode ? 'text-white group-hover:text-sky-300' : 'text-zinc-900 group-hover:text-sky-700'
                          }`}
                          whileHover={{ x: 2 }}
                          transition={{ type: "spring", stiffness: 400 }}
                        >
                          {apt.apt_name}
                        </motion.p>
                        <motion.p
                          className={`text-xs mt-1 truncate transition-colors ${
                            isDarkMode ? 'text-zinc-400 group-hover:text-zinc-300' : 'text-zinc-600 group-hover:text-zinc-700'
                          }`}
                          initial={{ opacity: 0.8 }}
                          whileHover={{ opacity: 1 }}
                        >
                          {apt.address}
                        </motion.p>
                        {apt.price && (
                          <motion.p
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`text-xs mt-1 font-semibold ${
                              isDarkMode ? 'text-blue-400' : 'text-blue-600'
                            }`}
                          >
                            {apt.price}
                          </motion.p>
                        )}
                      </div>
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        whileHover={{ opacity: 1, x: 0 }}
                        className="relative z-10"
                      >
                        <ChevronRight className={`w-4 h-4 transition-colors ${
                          isDarkMode ? 'text-zinc-500 group-hover:text-blue-400' : 'text-zinc-400 group-hover:text-blue-600'
                        }`} />
                      </motion.div>
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
