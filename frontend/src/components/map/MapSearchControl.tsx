import React, { useState, useRef, useEffect } from 'react';
import { Search, X, TrendingUp, History, Filter, MapPin, Trash2, Navigation, Settings, Clock, ChevronRight, Building2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ApartmentSearchResult, getRecentSearches, RecentSearch, searchLocations, LocationSearchResult, deleteRecentSearch, deleteAllRecentSearches, searchApartments } from '../../lib/searchApi';
import { aiSearchApartments, AISearchApartmentResult, AISearchHistoryItem, saveAISearchHistory, getAISearchHistory } from '../../lib/aiApi';
import AIChatMessages from './AIChatMessages';
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
  const [isAIMode, setIsAIMode] = useState(false);
  const [gradientAngle, setGradientAngle] = useState(90);

  // AI 모드일 때 각도를 랜덤하게 변경
  useEffect(() => {
    if (!isAIMode) return;

    const intervalId = setInterval(() => {
      // 0~360도 사이의 랜덤 각도 생성
      setGradientAngle(Math.floor(Math.random() * 360));
    }, 3000); // 3초마다 각도 변경

    return () => clearInterval(intervalId);
  }, [isAIMode]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [isLoadingRecentViews, setIsLoadingRecentViews] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  
  // AI 검색 결과 상태
  const [aiResults, setAiResults] = useState<ApartmentSearchResult[]>([]);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [aiSearchHistory, setAiSearchHistory] = useState<AISearchHistoryItem[]>([]);
  
  // 지도 검색창에서는 검색 기록을 저장함 (saveRecent: true)
  // AI 모드가 아닐 때만 기존 검색 훅 사용
  const { results, isSearching } = useApartmentSearch(query, true);
  const { isSignedIn, getToken } = useAuth();

  // 검색 결과 변경 시 부모 컴포넌트에 알림 (아파트와 지역 결과 모두 전달)
  const onSearchResultsChangeRef = useRef(onSearchResultsChange);
  useEffect(() => {
    onSearchResultsChangeRef.current = onSearchResultsChange;
  }, [onSearchResultsChange]);
  
  // AI 검색 히스토리 로드 (컴포넌트 마운트 시)
  useEffect(() => {
    if (isAIMode && isExpanded) {
      const history = getAISearchHistory();
      setAiSearchHistory(history);
      
      // 마지막 검색 결과가 있으면 복원
      if (history.length > 0 && query.length === 0) {
        const lastItem = history[0];
        const convertedResults: ApartmentSearchResult[] = lastItem.apartments.map((apt: AISearchApartmentResult) => ({
          apt_id: apt.apt_id,
          apt_name: apt.apt_name,
          address: apt.address,
          sigungu_name: apt.address.split(' ').slice(0, 2).join(' ') || '',
          location: apt.location,
          price: apt.average_price ? `${(apt.average_price / 10000).toFixed(1)}억원` : '정보 없음'
        }));
        setAiResults(convertedResults);
      }
    }
  }, [isAIMode, isExpanded]);

  // AI 검색 실행 (AI 모드일 때만)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (isAIMode && query.length >= 5) {
        setIsSearchingAI(true);
        try {
          const response = await aiSearchApartments(query);
          
          // AI 검색 결과를 ApartmentSearchResult 형식으로 변환
          const convertedResults: ApartmentSearchResult[] = response.data.apartments.map((apt: AISearchApartmentResult) => ({
            apt_id: apt.apt_id,
            apt_name: apt.apt_name,
            address: apt.address,
            sigungu_name: apt.address.split(' ').slice(0, 2).join(' ') || '', // 주소에서 시군구 추출
            location: apt.location,
            price: apt.average_price ? `${(apt.average_price / 10000).toFixed(1)}억원` : '정보 없음'
          }));
          
          setAiResults(convertedResults);
          
          // AI 검색 히스토리에 저장
          const historyItem: AISearchHistoryItem = {
            id: `ai-search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            query: query.trim(),
            timestamp: Date.now(),
            response: response,
            apartments: response.data.apartments
          };
          
          saveAISearchHistory(historyItem);
          
          // 히스토리 상태 업데이트 (중복 제거 후 최신 순으로 정렬)
          setAiSearchHistory(prev => [historyItem, ...prev.filter(h => h.query !== query.trim())].slice(0, 10));
        } catch (error) {
          console.error('Failed to search with AI:', error);
          setAiResults([]);
        } finally {
          setIsSearchingAI(false);
        }
      } else if (isAIMode) {
        // AI 모드이지만 검색어가 5자 미만이면 결과 초기화
        setAiResults([]);
        setIsSearchingAI(false);
      }
    }, 500); // AI 검색은 조금 더 긴 딜레이 (500ms)

    return () => clearTimeout(timer);
  }, [query, isAIMode]);

  useEffect(() => {
    // 검색어가 있을 때만 결과 전달 (초기 렌더링 시 호출 방지)
    if (onSearchResultsChangeRef.current && query.length >= 1) {
      // AI 모드일 때는 AI 검색 결과 사용, 아닐 때는 기존 검색 결과 사용
      const apartmentResultsToUse = isAIMode ? aiResults : results;
      
      const apartmentResults = apartmentResultsToUse.map(apt => ({
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
      
      // AI 모드일 때는 지역 검색 결과 제외
      const locationResultsForMap = isAIMode ? [] : locationResults.map(loc => ({
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
  }, [results, aiResults, locationResults, query, isAIMode]);
  
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

  // 지역 검색 (AI 모드가 아닐 때만)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!isAIMode && query.length >= 1) {
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
  }, [query, isSignedIn, getToken, isAIMode]);

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
      <div
        style={{
          width: isExpanded ? 360 : 48,
          height: isExpanded ? 'auto' : 48,
          borderRadius: 24,
          position: 'relative',
        }}
        className={`${isAIMode ? (isDarkMode ? 'bg-zinc-900' : 'bg-white') : 'bg-white dark:bg-zinc-900'} shadow-2xl shadow-black/20 overflow-hidden flex flex-col items-start ${isAIMode ? '' : 'backdrop-blur-sm'} border-2 ${
            isAIMode 
              ? 'border-transparent' 
              : 'border-zinc-200 dark:border-zinc-800'
        } ${
            isExpanded ? '' : 'justify-center items-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors'
        }`}
      >
        {/* 물이 흐르는 듯한 파란-보라 그라데이션 애니메이션 */}
        {isAIMode && (
          <>
            {/* 배경 그라데이션 레이어 */}
            <div 
              className="water-gradient-base"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 24,
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(30, 58, 138, 0.15) 0%, rgba(88, 28, 135, 0.15) 50%, rgba(30, 58, 138, 0.15) 100%)'
                  : 'linear-gradient(135deg, rgba(147, 197, 253, 0.4) 0%, rgba(196, 181, 253, 0.4) 50%, rgba(147, 197, 253, 0.4) 100%)',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
            {/* 움직이는 그라데이션 레이어 */}
            <div 
              className="water-gradient-flow animate-water-flow"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 24,
                background: isDarkMode
                  ? `linear-gradient(${gradientAngle}deg, rgba(59, 130, 246, 0.15) 0%, rgba(168, 85, 247, 0.18) 25%, rgba(59, 130, 246, 0.15) 50%, rgba(168, 85, 247, 0.18) 75%, rgba(59, 130, 246, 0.15) 100%)`
                  : `linear-gradient(${gradientAngle}deg, rgba(96, 165, 250, 0.3) 0%, rgba(192, 132, 252, 0.35) 25%, rgba(96, 165, 250, 0.3) 50%, rgba(192, 132, 252, 0.35) 75%, rgba(96, 165, 250, 0.3) 100%)`,
                backgroundSize: '200% 200%',
                pointerEvents: 'none',
                zIndex: 0,
                transition: 'background 2s ease-in-out',
              }}
            />
          </>
        )}
        {/* Header Area */}
        <div className="w-full flex items-center shrink-0 h-12 relative" style={{ zIndex: 1 }}>
            {!isExpanded ? (
                <button
                    onClick={() => setIsExpanded(true)}
                    className="w-12 h-12 flex items-center justify-center text-blue-600 dark:text-blue-400 absolute top-0 left-0"
                >
                    <Search size={22} />
                </button>
            ) : (
                <div 
                    className="flex items-center w-full px-4 gap-3 h-12"
                >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(false);
                            }}
                            className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 shrink-0"
                        >
                            <Search size={18} className="text-blue-600 dark:text-blue-400" />
                        </button>
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            placeholder={isAIMode ? "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처" : "지역 또는 아파트명 검색"}
                            className={`flex-1 bg-transparent border-none outline-none text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-400 min-w-0 ${isAIMode && !query ? 'animate-placeholder-scroll' : ''}`}
                            style={{ color: isDarkMode ? '#f4f4f5' : '#18181b' }}
                        />
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                const newMode = !isAIMode;
                                setIsAIMode(newMode);
                                if (newMode) {
                                  // 랜덤 각도 생성 (0~360도)
                                  setGradientAngle(Math.floor(Math.random() * 360));
                                  // AI 모드로 전환할 때 검색 결과 초기화
                                  setAiResults([]);
                                } else {
                                  // 일반 모드로 전환할 때도 AI 검색 결과 초기화
                                  setAiResults([]);
                                }
                            }}
                            className={`px-3 py-1.5 rounded-full shrink-0 text-sm font-medium transition-all border-2 ${
                              isAIMode 
                                ? 'animate-sky-purple-gradient text-white shadow-sm' 
                                : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-700 text-blue-600 dark:text-blue-400'
                            }`}
                            style={isAIMode ? {
                              background: isDarkMode
                                ? 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 25%, #c084fc 50%, #a78bfa 75%, #60a5fa 100%)'
                                : 'linear-gradient(135deg, #38bdf8 0%, #a78bfa 25%, #c084fc 50%, #a78bfa 75%, #38bdf8 100%)',
                              borderColor: isDarkMode ? 'rgba(167, 139, 250, 0.5)' : 'rgba(167, 139, 250, 0.4)',
                            } : undefined}
                        >
                            AI
                        </button>
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
                            className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 shrink-0"
                        >
                            <X size={18} className="text-zinc-500 dark:text-zinc-300" />
                        </button>
                    </div>
                )}
        </div>

        {/* Content Area */}
        {isExpanded && (
            <div
                className={`w-full flex flex-col ${
                  isAIMode 
                    ? 'border-t border-purple-400/30 dark:border-purple-500/30' 
                    : 'border-t border-zinc-100 dark:border-zinc-800'
                }`}
                style={{ position: 'relative', zIndex: 1, minHeight: '200px', maxHeight: '70vh' }}
            >
                    <div className={`w-full overflow-y-auto custom-scrollbar overscroll-contain ${isAIMode && query.length >= 1 ? 'pt-2.5 pb-4 px-4' : 'p-4'}`} style={{ maxHeight: 'calc(70vh - 1px)', minHeight: '200px', position: 'relative', zIndex: 10 }}>
                        {query.length >= 1 ? (
                            <AnimatePresence mode="wait">
                                {isAIMode ? (
                                    // AI 모드일 때는 채팅 형식으로 표시
                                    <motion.div
                                        key="ai-mode"
                                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                                        exit={{ opacity: 0, filter: 'blur(4px)' }}
                                        transition={{ duration: 0.25 }}
                                        className="flex flex-col gap-4"
                                    >
                                        {/* 현재 검색 중인 메시지 표시 */}
                                        {isSearchingAI && query.length >= 5 && (
                                            <div className="flex flex-col gap-3">
                                                {/* 사용자 메시지 */}
                                                <div className="flex justify-center" style={{ position: 'relative', zIndex: 10 }}>
                                                    <div className="flex flex-col items-center gap-1 w-full max-w-full">
                                                        <div className={`px-4 py-2.5 rounded-2xl w-full overflow-x-auto relative border ${
                                                            isDarkMode 
                                                              ? 'border-purple-400/50 text-white' 
                                                              : 'border-purple-500/50 text-white'
                                                        }`} style={{ zIndex: 10, backgroundColor: '#5B66C9' }}>
                                                            <p className="text-sm font-medium text-center whitespace-nowrap">
                                                                {query}
                                                            </p>
                                                        </div>
                                                        <span className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                                            방금
                                                        </span>
                                                    </div>
                                                </div>
                                                {/* AI 로딩 메시지 */}
                                                <div className="flex justify-center">
                                                    <div className="flex flex-col items-center gap-2 w-full max-w-full">
                                                        <span className={`text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                            AI
                                                        </span>
                                                        <div className={`px-4 py-2.5 rounded-2xl w-full overflow-x-auto ${
                                                            isDarkMode 
                                                              ? 'bg-zinc-800 border border-zinc-700 text-white' 
                                                              : 'bg-white border border-zinc-200 text-zinc-900'
                                                        }`}>
                                                            <div className="flex items-center justify-center gap-2">
                                                                <Sparkles className={`w-4 h-4 animate-pulse ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                                                                <p className="text-sm text-center whitespace-nowrap">검색 중...</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* 검색 히스토리 표시 (현재 검색어와 일치하는 항목) */}
                                        {aiSearchHistory.length > 0 && (
                                            <AIChatMessages
                                                history={aiSearchHistory.filter(item => 
                                                    item.query.toLowerCase() === query.toLowerCase().trim()
                                                ).slice(0, 1)}
                                                isDarkMode={isDarkMode}
                                                onApartmentSelect={handleSelect}
                                            />
                                        )}
                                    </motion.div>
                                ) : (
                                    // 일반 모드일 때는 기존 UnifiedSearchResults 사용
                                    <motion.div
                                        key="normal-mode"
                                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                                        exit={{ opacity: 0, filter: 'blur(4px)' }}
                                        transition={{ duration: 0.25 }}
                                    >
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
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        ) : (
                            <AnimatePresence mode="wait">
                                {!isAIMode ? (
                                    <motion.div
                                        key="normal-tabs"
                                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                                        exit={{ opacity: 0, filter: 'blur(4px)' }}
                                        transition={{ duration: 0.25 }}
                                    >
                                    {/* 탭 버튼 영역 - 항상 유지하여 높이 일관성 보장 */}
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

                                {!isAIMode && activeTab === 'recent' ? (
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
                                                    {!isAIMode && (
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
                                                    )}
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
                                ) : !isAIMode && activeTab === 'settings' ? (
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
                                ) : !isAIMode && (
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
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="ai-tabs"
                                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                                        exit={{ opacity: 0, filter: 'blur(4px)' }}
                                        transition={{ duration: 0.25 }}
                                        className="flex flex-col"
                                    >
                                    {/* 탭 버튼 영역 - AI 모드에서도 공간 유지 (높이 일관성) */}
                                    <div className="flex gap-1 mb-6 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-full opacity-0 pointer-events-none" aria-hidden="true">
                                        {tabs.map((tab) => (
                                            <div key={tab.id} className="flex-1 py-1.5 text-xs font-bold" />
                                        ))}
                                    </div>
                                {query.length < 1 && (
                                    aiSearchHistory.length > 0 ? (
                                        // AI 검색 히스토리가 있으면 채팅 히스토리 표시
                                        <AIChatMessages
                                            history={aiSearchHistory}
                                            isDarkMode={isDarkMode}
                                            onApartmentSelect={handleSelect}
                                        />
                                    ) : (
                                        // AI 검색 히스토리가 없으면 안내 메시지 표시
                                        <div className={`flex flex-col items-center justify-center py-12 gap-4 ${
                                            isDarkMode ? 'text-zinc-300' : 'text-zinc-600'
                                        }`}>
                                            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                                                isDarkMode ? 'bg-purple-500/20' : 'bg-purple-400/20'
                                            }`}>
                                                <Sparkles size={32} className={`${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                                            </div>
                                            <span className={`text-base font-medium ${isDarkMode ? 'text-zinc-200' : 'text-zinc-700'}`}>
                                                AI 검색 모드가 활성화되었습니다
                                            </span>
                                            <span className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                                검색어를 입력하면 AI가 도와드립니다
                                            </span>
                                        </div>
                                    )
                                )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        )}
                    </div>
            </div>
        )}
      </div>

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

      <style>{`
        @keyframes waterFlow {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .animate-water-flow {
          animation: waterFlow 8s ease-in-out infinite;
        }
        
        @keyframes placeholderScroll {
          0% {
            transform: translateX(0);
          }
          45% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(calc(189px - 100%));
          }
          95% {
            transform: translateX(calc(189px - 100%));
          }
          100% {
            transform: translateX(0);
          }
        }
        .animate-placeholder-scroll {
          position: relative;
        }
        .animate-placeholder-scroll::placeholder {
          animation: placeholderScroll 8s ease-in-out infinite;
          display: inline-block;
          white-space: nowrap;
        }
        
        @keyframes skyPurpleGradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .animate-sky-purple-gradient {
          background-size: 200% 200%;
          animation: skyPurpleGradient 6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
