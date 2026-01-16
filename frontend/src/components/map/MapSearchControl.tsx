import React, { useState, useRef, useEffect } from 'react';
import { Search, X, TrendingUp, History, Filter, MapPin, Trash2, Navigation, Settings, Clock, ChevronRight, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ApartmentSearchResult, getRecentSearches, RecentSearch, searchLocations, LocationSearchResult, deleteRecentSearch, deleteAllRecentSearches, searchApartments } from '../../lib/searchApi';
import { useApartmentSearch } from '../../hooks/useApartmentSearch';
import SearchResultsList from '../../components/ui/SearchResultsList';
import LocationSearchResults from '../../components/ui/LocationSearchResults';
import UnifiedSearchResults from '../../components/ui/UnifiedSearchResults';
import { useAuth } from '../../lib/clerk';
import { UnifiedSearchResult } from '../../hooks/useUnifiedSearch';
import { getRecentViews, RecentView } from '../../lib/usersApi';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';

interface MapSearchControlProps {
  isDarkMode: boolean;
  isDesktop?: boolean;
  onApartmentSelect?: (result: UnifiedSearchResult) => void;
  onSearchResultsChange?: (results: any[], query?: string) => void;
  onMoveToCurrentLocation?: () => void;
  isRoadviewMode?: boolean;
  onToggleRoadviewMode?: () => void;
  onShowMoreSearch?: (query: string) => void;
}

export default function MapSearchControl({ 
  isDarkMode, 
  isDesktop = false, 
  onApartmentSelect, 
  onSearchResultsChange,
  onMoveToCurrentLocation,
  isRoadviewMode = false,
  onToggleRoadviewMode,
  onShowMoreSearch
}: MapSearchControlProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'trending' | 'settings'>('recent');
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [isLoadingRecentViews, setIsLoadingRecentViews] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  
  // 지도 검색창에서는 검색 기록을 저장함 (saveRecent: true)
  const { results, isSearching } = useApartmentSearch(query, true);
  const { isSignedIn, getToken } = useAuth();

  // 검색 결과 변경 시 부모 컴포넌트에 알림 (아파트와 지역 결과 모두 전달)
  const onSearchResultsChangeRef = useRef(onSearchResultsChange);
  useEffect(() => {
    onSearchResultsChangeRef.current = onSearchResultsChange;
  }, [onSearchResultsChange]);
  
  useEffect(() => {
    // 검색어가 있을 때만 결과 전달 (초기 렌더링 시 호출 방지)
    if (onSearchResultsChangeRef.current && query.length >= 1) {
      const apartmentResults = results.map(apt => ({
        ...apt,
        apt_id: apt.apt_id || apt.apt_id,
        id: apt.apt_id || apt.apt_id,
        name: apt.apt_name,
        apt_name: apt.apt_name,
        lat: apt.location.lat,
        lng: apt.location.lng,
        address: apt.address || '',
        markerType: 'apartment' as const
      }));
      
      const locationResultsForMap = locationResults.map(loc => ({
        id: `location-${loc.region_id}`,
        name: loc.full_name,
        lat: 0, // 지역 검색 결과에는 좌표가 없을 수 있음
        lng: 0,
        address: loc.full_name,
        markerType: 'location' as const,
        region_id: loc.region_id
      }));
      
      const allResults = [...apartmentResults, ...locationResultsForMap];
      
      onSearchResultsChangeRef.current(allResults, query);
    }
    // 검색어가 비어있을 때는 마커를 유지 (명시적으로 지우지 않는 한)
  }, [results, locationResults, query]);
  
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

  // 최근 검색어 가져오기
  useEffect(() => {
    const fetchRecentSearches = async () => {
      if (isExpanded && activeTab === 'recent' && query.length < 1) {
        setIsLoadingRecent(true);
        try {
          // 로그인한 사용자만 최근 검색어 가져오기 (최대 50개까지)
          const token = isSignedIn && getToken ? await getToken() : null;
          const searches = await getRecentSearches(token, 50); // 최대 50개까지 가져오기
          setRecentSearches(searches);
        } catch (error) {
          console.error('Failed to fetch recent searches:', error);
          setRecentSearches([]);
        } finally {
          setIsLoadingRecent(false);
        }
      }
    };

    fetchRecentSearches();
  }, [isExpanded, activeTab, query, isSignedIn, getToken]);

  // 최근 본 아파트 가져오기
  useEffect(() => {
    const fetchRecentViews = async () => {
      if (isExpanded && activeTab === 'recent' && query.length < 1 && isSignedIn && getToken) {
        setIsLoadingRecentViews(true);
        try {
          const token = await getToken();
          if (token) {
            const response = await getRecentViews(5, token); // 최대 5개만 표시
            setRecentViews(response.data.recent_views || []);
          }
        } catch (error) {
          console.error('Failed to fetch recent views:', error);
          setRecentViews([]);
        } finally {
          setIsLoadingRecentViews(false);
        }
      } else if (!isSignedIn) {
        setRecentViews([]);
      }
    };

    fetchRecentViews();
  }, [isExpanded, activeTab, query, isSignedIn, getToken]);

  // 지역 검색
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 1) {
        setIsSearchingLocations(true);
        try {
          const token = isSignedIn && getToken ? await getToken() : null;
          const locations = await searchLocations(query, token);
          setLocationResults(locations);
        } catch (error) {
          console.error('Failed to search locations:', error);
          setLocationResults([]);
        } finally {
          setIsSearchingLocations(false);
        }
      } else {
        setLocationResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, isSignedIn, getToken]);

  const handleSelect = (apt: ApartmentSearchResult) => {
    const result: UnifiedSearchResult = {
      type: 'apartment',
      apartment: apt
    };
    
    if (onApartmentSelect) {
        onApartmentSelect(result);
    }
    setIsExpanded(false);
    setQuery(''); 
    
    // 최근 검색어 새로고침
    if (activeTab === 'recent' && isSignedIn && getToken) {
      getToken().then(token => {
        getRecentSearches(token, 50).then(setRecentSearches).catch(console.error);
      }).catch(console.error);
    }
  };

  const handleLocationSelect = (location: LocationSearchResult) => {
    // 지역 선택 시 처리 (예: 지도 중심 이동)
    console.log('Location selected:', location);
    
    // UnifiedSearchResult 형태로 변환하여 부모에 전달
    if (onApartmentSelect) {
      onApartmentSelect({
        type: 'location',
        location: {
          ...location,
          center: { lat: 0, lng: 0 } // 지역 좌표는 나중에 설정 가능
        }
      });
    }
    
    setIsExpanded(false);
    setQuery('');
    
    // 최근 검색어 새로고침
    if (activeTab === 'recent' && isSignedIn && getToken) {
      getToken().then(token => {
        getRecentSearches(token, 50).then(setRecentSearches).catch(console.error);
      }).catch(console.error);
    }
  };

  const handleRecentSearchClick = (search: RecentSearch) => {
    setQuery(search.query);
    inputRef.current?.focus();
  };

  const handleDeleteRecentSearch = async (e: React.MouseEvent, searchId: number) => {
    e.stopPropagation(); // 버튼 클릭 시 검색어 클릭 이벤트 방지
    if (!isSignedIn || !getToken) return;
    
    try {
      const token = await getToken();
      const success = await deleteRecentSearch(searchId, token);
      if (success) {
        // 삭제 성공 시 목록 새로고침 (최대 50개까지)
        const searches = await getRecentSearches(token, 50);
        setRecentSearches(searches);
      }
    } catch (error) {
      console.error('Failed to delete recent search:', error);
    }
  };

  const handleDeleteAllRecentSearches = async () => {
    if (!isSignedIn || !getToken) return;
    
    try {
      const token = await getToken();
      const success = await deleteAllRecentSearches(token);
      if (success) {
        setRecentSearches([]);
      }
      setShowDeleteAllDialog(false);
    } catch (error) {
      console.error('Failed to delete all recent searches:', error);
      setShowDeleteAllDialog(false);
    }
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
                    className="w-full border-t border-zinc-100 dark:border-zinc-800 flex flex-col max-h-[70vh]"
                >
                    <div className="p-4 w-full overflow-y-auto custom-scrollbar overscroll-contain" style={{ maxHeight: 'calc(70vh - 1px)' }}>
                        {query.length >= 1 ? (
                            <UnifiedSearchResults
                                apartmentResults={results}
                                locationResults={locationResults}
                                onApartmentSelect={handleSelect}
                                onLocationSelect={handleLocationSelect}
                                isDarkMode={isDarkMode}
                                query={query}
                                isSearchingApartments={isSearching}
                                isSearchingLocations={isSearchingLocations}
                                showMoreButton={true}
                                onShowMore={() => {
                                    if (onShowMoreSearch) {
                                        onShowMoreSearch(query);
                                    }
                                }}
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

                                {activeTab === 'recent' ? (
                                    isLoadingRecent ? (
                                <div className="flex flex-col items-center justify-center py-8 text-zinc-400 dark:text-zinc-500 gap-3">
                                    <div className="w-12 h-12 rounded-full bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center">
                                                <History size={24} className="opacity-50 animate-pulse" />
                                            </div>
                                            <span className="text-sm font-medium">로딩 중...</span>
                                        </div>
                                    ) : (
                                        <>
                                            {/* 최근 본 아파트 섹션 */}
                                            {isSignedIn && (
                                                <div className="mb-4">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Clock className={`w-4 h-4 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                                                        <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                                                            최근 본 아파트
                                                        </h3>
                                                    </div>
                                                    {isLoadingRecentViews ? (
                                                        <div className="flex items-center justify-center py-4">
                                                            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                                                        </div>
                                                    ) : recentViews.length > 0 ? (
                                                        <div className="space-y-2 mb-4">
                                                            {recentViews.map((view) => (
                                                                <button
                                                                    key={view.view_id}
                                                                    onClick={async () => {
                                                                        if (view.apartment && onApartmentSelect) {
                                                                            // 최근 본 아파트 클릭 시 아파트 이름으로 검색하여 위치 정보 가져오기
                                                                            const aptName = view.apartment.apt_name || '';
                                                                            if (aptName) {
                                                                                try {
                                                                                    const token = isSignedIn && getToken ? await getToken() : null;
                                                                                    const searchResults = await searchApartments(aptName, token);
                                                                                    
                                                                                    // 검색 결과에서 같은 apt_id를 가진 아파트 찾기
                                                                                    const matchedApt = searchResults.find(apt => apt.apt_id === view.apartment.apt_id);
                                                                                    
                                                                                    if (matchedApt && matchedApt.location) {
                                                                                        // 위치 정보가 있는 경우
                                                                                        handleSelect(matchedApt);
                                                                                    } else {
                                                                                        // 검색 결과가 없거나 위치 정보가 없는 경우, 기본 데이터로 처리
                                                                                        const aptData: ApartmentSearchResult = {
                                                                                            apt_id: view.apartment.apt_id,
                                                                                            apt_name: aptName,
                                                                                            address: view.apartment.region_name 
                                                                                                ? `${view.apartment.city_name || ''} ${view.apartment.region_name || ''}`.trim()
                                                                                                : '',
                                                                                            sigungu_name: view.apartment.region_name || '',
                                                                                            location: { lat: 0, lng: 0 },
                                                                                            price: '',
                                                                                        };
                                                                                        handleSelect(aptData);
                                                                                    }
                                                                                } catch (error) {
                                                                                    console.error('Failed to search apartment location:', error);
                                                                                    // 에러 발생 시 기본 데이터로 처리
                                                                                    const aptData: ApartmentSearchResult = {
                                                                                        apt_id: view.apartment.apt_id,
                                                                                        apt_name: aptName,
                                                                                        address: view.apartment.region_name 
                                                                                            ? `${view.apartment.city_name || ''} ${view.apartment.region_name || ''}`.trim()
                                                                                            : '',
                                                                                        sigungu_name: view.apartment.region_name || '',
                                                                                        location: { lat: 0, lng: 0 },
                                                                                        price: '',
                                                                                    };
                                                                                    handleSelect(aptData);
                                                                                }
                                                                            }
                                                                        }
                                                                    }}
                                                                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left group ${
                                                                        isDarkMode 
                                                                            ? 'bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50' 
                                                                            : 'bg-zinc-50 hover:bg-zinc-100 border border-zinc-200'
                                                                    }`}
                                                                >
                                                                    <Building2 size={16} className={`shrink-0 ${
                                                                        isDarkMode ? 'text-blue-400' : 'text-blue-600'
                                                                    }`} />
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className={`text-sm font-medium truncate ${
                                                                            isDarkMode 
                                                                                ? 'text-white group-hover:text-blue-400' 
                                                                                : 'text-zinc-900 group-hover:text-blue-600'
                                                                        }`}>
                                                                            {view.apartment?.apt_name || '알 수 없음'}
                                                                        </p>
                                                                        {view.apartment?.region_name && (
                                                                            <p className={`text-xs mt-0.5 truncate ${
                                                                                isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                                                                            }`}>
                                                                                {view.apartment.city_name && `${view.apartment.city_name} `}
                                                                                {view.apartment.region_name}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <ChevronRight 
                                                                        size={16} 
                                                                        className={`shrink-0 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`} 
                                                                    />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className={`text-xs text-center py-3 mb-4 rounded-lg ${
                                                            isDarkMode ? 'text-zinc-400 bg-zinc-800/30' : 'text-zinc-500 bg-zinc-50'
                                                        }`}>
                                                            최근 본 아파트가 없습니다
                                                        </div>
                                                    )}
                                                    <div className="h-px bg-zinc-200 dark:bg-zinc-800 mb-4"></div>
                                                </div>
                                            )}

                                            {/* 검색 기록 섹션 */}
                                            {recentSearches.length > 0 ? (
                                                <>
                                                    {/* 전체 삭제 버튼 */}
                                                    <button
                                                        onClick={() => setShowDeleteAllDialog(true)}
                                                        className={`w-full mb-3 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg transition-colors ${
                                                            isDarkMode 
                                                                ? 'bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-white' 
                                                                : 'bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-900'
                                                        }`}
                                                    >
                                                        <Trash2 size={16} />
                                                        <span className="text-sm font-medium">검색 기록 전체 삭제</span>
                                                    </button>
                                                    {/* 최근 검색어 목록 (최대 10개 표시) */}
                                                    <div className="space-y-2">
                                                        {recentSearches.slice(0, 10).map((search) => (
                                                            <div
                                                                key={search.id}
                                                                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left group ${
                                                                    isDarkMode 
                                                                        ? 'bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50' 
                                                                        : 'bg-zinc-50 hover:bg-zinc-100 border border-zinc-200'
                                                                }`}
                                                            >
                                                                <button
                                                                    onClick={() => handleRecentSearchClick(search)}
                                                                    className="flex-1 flex items-center gap-3 text-left cursor-pointer"
                                                                >
                                                                    <MapPin size={16} className={`shrink-0 ${
                                                                        isDarkMode ? 'text-blue-400' : 'text-blue-600'
                                                                    }`} />
                                                                    <span className={`flex-1 text-sm font-medium transition-colors ${
                                                                        isDarkMode 
                                                                            ? 'text-white group-hover:text-blue-400' 
                                                                            : 'text-zinc-900 group-hover:text-blue-600'
                                                                    }`}>
                                                                        {search.query}
                                                                    </span>
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleDeleteRecentSearch(e, search.id)}
                                                                    className={`p-1.5 rounded-full hover:bg-zinc-700 dark:hover:bg-zinc-700 transition-colors shrink-0 ${
                                                                        isDarkMode ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-500 hover:text-red-600'
                                                                    }`}
                                                                    aria-label="검색 기록 삭제"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className={`flex flex-col items-center justify-center py-8 gap-3 ${
                                                    isDarkMode ? 'text-white' : 'text-zinc-600'
                                                }`}>
                                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                                        isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'
                                                    }`}>
                                                        <History size={24} className={`opacity-50 ${isDarkMode ? 'text-white' : 'text-zinc-600'}`} />
                                                    </div>
                                                    <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-zinc-600'}`}>
                                                        최근 검색 기록이 없습니다
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    )
                                ) : activeTab === 'settings' ? (
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
                                    <div className={`flex flex-col items-center justify-center py-8 gap-3 ${
                                        isDarkMode ? 'text-white' : 'text-zinc-500'
                                    }`}>
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                            isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'
                                        }`}>
                                            {activeTab === 'trending' && <TrendingUp size={24} className={`opacity-50 ${isDarkMode ? 'text-white' : 'text-zinc-500'}`} />}
                                        </div>
                                        <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-zinc-500'}`}>
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

      {/* 삭제 확인 모달 - Portal로 body에 직접 렌더링 */}
      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent 
          className={`${
            isDarkMode 
              ? 'bg-zinc-900 border-zinc-800 text-white shadow-black/50' 
              : 'bg-white border-zinc-200 text-zinc-900 shadow-black/20'
          } w-[60vw] max-w-[60vw]`}
          style={{ 
            zIndex: 999999,
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          <AlertDialogHeader className="text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-3 mb-2">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isDarkMode ? 'bg-red-500/20' : 'bg-red-50'
              }`}>
                <Trash2 size={24} className={isDarkMode ? 'text-red-400' : 'text-red-600'} />
              </div>
            </div>
            <AlertDialogTitle className={`text-xl font-bold ${
              isDarkMode ? 'text-white' : 'text-zinc-900'
            }`}>
              검색 기록 전체 삭제
            </AlertDialogTitle>
            <AlertDialogDescription className={`mt-2 ${
              isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
            }`}>
              모든 최근 검색어를 삭제하시겠습니까?<br />
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 mt-6">
            <AlertDialogCancel 
              className={`w-full sm:w-auto ${
                isDarkMode 
                  ? 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 hover:border-zinc-600' 
                  : 'bg-zinc-50 border-zinc-200 text-zinc-900 hover:bg-zinc-100 hover:border-zinc-300'
              } rounded-xl font-medium transition-all`}
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAllRecentSearches}
              className={`w-full sm:w-auto rounded-xl font-medium transition-all ${
                isDarkMode 
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20' 
                  : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30'
              }`}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
