import React, { useState, useRef, useEffect } from 'react';
import { Search, X, TrendingUp, History, Filter, MapPin, Navigation, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UnifiedSearchResult } from '../../hooks/useUnifiedSearch';
import { useUnifiedSearch } from '../../hooks/useUnifiedSearch';
import UnifiedSearchResultsList from '../../components/ui/UnifiedSearchResultsList';

interface MapSearchControlProps {
  isDarkMode: boolean;
  isDesktop?: boolean;
  onApartmentSelect?: (result: UnifiedSearchResult) => void;
  onSearchResultsChange?: (results: any[], query?: string) => void;
  onMoveToCurrentLocation?: () => void;
  isRoadviewMode?: boolean;
  onToggleRoadviewMode?: () => void;
}

export default function MapSearchControl({ 
  isDarkMode, 
  isDesktop = false, 
  onApartmentSelect, 
  onSearchResultsChange,
  onMoveToCurrentLocation,
  isRoadviewMode = false,
  onToggleRoadviewMode
}: MapSearchControlProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'trending' | 'filter'>('recent');
  const [query, setQuery] = useState('');
  
  // 지도 탭에서는 지역 검색도 포함
  const { results, isSearching } = useUnifiedSearch(query, { includeLocations: true });

  // 검색 결과 변경 시 부모 컴포넌트에 알림 (아파트와 지역 결과 모두 전달)
  // useRef를 사용하여 최신 콜백 참조 유지 (무한 루프 방지)
  const onSearchResultsChangeRef = useRef(onSearchResultsChange);
  useEffect(() => {
    onSearchResultsChangeRef.current = onSearchResultsChange;
  }, [onSearchResultsChange]);
  
  useEffect(() => {
    // 검색어가 있을 때만 결과 전달 (초기 렌더링 시 호출 방지)
    if (onSearchResultsChangeRef.current && query.length >= 1) {
      const apartmentResults = results
        .filter(r => r.type === 'apartment' && r.apartment && r.apartment.location)
        .map(r => ({
          ...r.apartment!,
          apt_id: r.apartment!.apt_id || r.apartment!.apt_id,
          id: r.apartment!.apt_id || r.apartment!.apt_id,
          name: r.apartment!.apt_name,
          apt_name: r.apartment!.apt_name,
          lat: r.apartment!.location.lat,
          lng: r.apartment!.location.lng,
          address: r.apartment!.address || '',
          markerType: 'apartment' as const
        }));
      
      const locationResults = results
        .filter(r => r.type === 'location' && r.location && r.location.center)
        .map(r => ({
          id: `location-${r.location.id}`,
          name: r.location.full_name,
          lat: r.location.center.lat,
          lng: r.location.center.lng,
          address: r.location.full_name,
          markerType: 'location' as const
        }));
      
      const allResults = [...apartmentResults, ...locationResults];
      
      onSearchResultsChangeRef.current(allResults, query);
    }
    // 검색어가 비어있을 때는 마커를 유지 (명시적으로 지우지 않는 한)
  }, [results, query]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [containerRef]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded]);

  const handleSelect = (result: UnifiedSearchResult) => {
    if (onApartmentSelect) {
        onApartmentSelect(result);
    }
    setIsExpanded(false);
    // 검색어를 지우지 않음 (다음 검색 전까지 마커 유지)
    // setQuery(''); 
  };
  
  // 검색어가 완전히 지워질 때만 마커 제거
  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    // 검색어가 완전히 비어있을 때만 마커 제거
    if (newQuery.length === 0 && onSearchResultsChangeRef.current) {
      onSearchResultsChangeRef.current([], '');
    }
  };

  const tabs = [
    { id: 'recent', label: '최근 검색', icon: History },
    { id: 'trending', label: '급상승', icon: TrendingUp },
    { id: 'settings', label: '설정', icon: Settings },
  ];

  return (
    <div 
      className={`absolute left-4 z-50 font-sans flex flex-col items-start`} 
      style={{ 
        top: isDesktop ? 'calc(5rem + 2vh)' : 'calc(0.5rem + 2vh)' 
      }}
      ref={containerRef}
    >
      <motion.div
        initial={false}
        animate={{
          width: isExpanded ? 360 : 48,
          height: isExpanded ? 'auto' : 48,
          borderRadius: 24,
        }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className={`bg-white dark:bg-zinc-900 shadow-2xl shadow-black/20 overflow-hidden flex flex-col items-start border border-zinc-200 dark:border-zinc-800 backdrop-blur-sm ${
            isExpanded ? '' : 'justify-center items-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors'
        }`}
      >
        {/* Header Area */}
        <div className="w-full flex items-center shrink-0 h-12 relative">
            <AnimatePresence mode="popLayout">
                {!isExpanded ? (
                    <motion.button
                        key="search-btn"
                        layoutId="search-trigger"
                        onClick={() => setIsExpanded(true)}
                        className="w-12 h-12 flex items-center justify-center text-blue-600 dark:text-blue-400 absolute top-0 left-0"
                        whileTap={{ scale: 0.9 }}
                    >
                        <Search size={22} />
                    </motion.button>
                ) : (
                    <motion.div 
                        key="search-input"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center w-full px-4 gap-3 h-12"
                    >
                        <Search size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            placeholder="지역 또는 아파트명 검색"
                            className="flex-1 bg-transparent border-none outline-none text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-400 min-w-0"
                            style={{ color: isDarkMode ? '#f4f4f5' : '#18181b' }}
                        />
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                if (query) {
                                    handleQueryChange('');
                                    inputRef.current?.focus();
                                } else {
                                    setIsExpanded(false); 
                                }
                            }}
                            className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shrink-0"
                        >
                            <X size={18} className="text-zinc-500 dark:text-zinc-300" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Content Area */}
        <AnimatePresence>
            {isExpanded && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="w-full border-t border-zinc-100 dark:border-zinc-800"
                >
                    <div className="p-4 w-full">
                        {query.length >= 1 ? (
                            <UnifiedSearchResultsList 
                                results={results}
                                onSelect={handleSelect}
                                isDarkMode={isDarkMode}
                                query={query}
                                isSearching={isSearching}
                            />
                        ) : (
                            <>
                                <div className="flex gap-1 mb-6 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-full">
                                    {tabs.map((tab) => (
                                        <button 
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id as any)}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                                                activeTab === tab.id
                                                    ? 'bg-zinc-800 dark:bg-zinc-700 text-white shadow-md' 
                                                    : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {activeTab === 'settings' ? (
                                    <div className="flex flex-col gap-3">
                                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2">지도 설정</h3>
                                        
                                        {/* 내 위치로 이동 */}
                                        {onMoveToCurrentLocation && (
                                            <button
                                                onClick={() => {
                                                    onMoveToCurrentLocation();
                                                    setIsExpanded(false);
                                                }}
                                                className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-left border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-400/20 flex items-center justify-center">
                                                    <Navigation size={20} className="text-blue-600 dark:text-blue-400" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">내 위치로 이동</div>
                                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">현재 위치로 지도 이동</div>
                                                </div>
                                            </button>
                                        )}
                                        
                                        {/* 거리뷰 토글 */}
                                        {onToggleRoadviewMode && (
                                            <button
                                                onClick={() => {
                                                    onToggleRoadviewMode();
                                                }}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                                                    isRoadviewMode
                                                        ? 'bg-sky-500/10 dark:bg-sky-400/20 border-2 border-sky-500 dark:border-sky-400'
                                                        : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600'
                                                }`}
                                            >
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                                    isRoadviewMode
                                                        ? 'bg-sky-500 dark:bg-sky-500'
                                                        : 'bg-zinc-200 dark:bg-zinc-700'
                                                }`}>
                                                    <MapPin size={20} className={isRoadviewMode ? 'text-white' : 'text-zinc-600 dark:text-zinc-300'} />
                                                </div>
                                                <div className="flex-1">
                                                    <div className={`text-sm font-semibold ${
                                                        isRoadviewMode
                                                            ? 'text-sky-600 dark:text-sky-400'
                                                            : 'text-zinc-900 dark:text-zinc-100'
                                                    }`}>
                                                        거리뷰 {isRoadviewMode ? '켜짐' : '꺼짐'}
                                                    </div>
                                                    <div className={`text-xs ${
                                                        isRoadviewMode
                                                            ? 'text-sky-500 dark:text-sky-400'
                                                            : 'text-zinc-500 dark:text-zinc-400'
                                                    }`}>
                                                        {isRoadviewMode ? '거리뷰 모드가 활성화되었습니다' : '거리뷰 모드를 활성화하려면 클릭하세요'}
                                                    </div>
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-8 text-zinc-400 dark:text-zinc-400 gap-3">
                                        <div className="w-12 h-12 rounded-full bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center">
                                            {activeTab === 'recent' && <History size={24} className="text-zinc-400 dark:text-zinc-400 opacity-60" />}
                                            {activeTab === 'trending' && <TrendingUp size={24} className="text-zinc-400 dark:text-zinc-400 opacity-60" />}
                                        </div>
                                        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                                            {activeTab === 'recent' && '최근 검색 기록이 없습니다'}
                                            {activeTab === 'trending' && '급상승 검색어가 없습니다'}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}