import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, TrendingUp, History, Filter, MapPin, Trash2, Navigation, Settings, Clock, ChevronRight, ChevronDown, ChevronUp, Building2, Sparkles, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ApartmentSearchResult, getRecentSearches, RecentSearch, searchLocations, LocationSearchResult, deleteRecentSearch, deleteAllRecentSearches, searchApartments, getTrendingApartments, TrendingApartment, detailedSearchApartments, DetailedSearchResult, DetailedSearchRequest } from '../../lib/searchApi';
import { aiSearchApartments, AISearchApartmentResult, AISearchHistoryItem, saveAISearchHistory, getAISearchHistory, clearAISearchHistory } from '../../lib/aiApi';
import AIChatMessages from './AIChatMessages';
import { useApartmentSearch } from '../../hooks/useApartmentSearch';
import SearchResultsList from '../../components/ui/SearchResultsList';
import LocationSearchResults from '../../components/ui/LocationSearchResults';
import UnifiedSearchResults from '../../components/ui/UnifiedSearchResults';
import { useAuth } from '../../lib/clerk';
import { UnifiedSearchResult } from '../../hooks/useUnifiedSearch';
import { getRecentViews, deleteRecentView, deleteAllRecentViews, RecentView } from '../../lib/usersApi';
import { useDynamicIslandToast } from '../../components/ui/DynamicIslandToast';
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

// 쿠키 유틸리티 함수
const COOKIE_KEY_RECENT_SEARCHES = 'map_recent_searches';
const MAX_COOKIE_SEARCHES = 5; // 최대 저장 개수

// 최근 본 아파트 쿠키 관련 상수
const COOKIE_KEY_RECENT_VIEWS = 'map_recent_views';
const MAX_COOKIE_VIEWS = 5; // 최대 저장 개수

// AI 검색 입력 쿠키 관련 상수
const COOKIE_KEY_AI_SEARCH_INPUTS = 'map_ai_search_inputs';
const MAX_COOKIE_AI_INPUTS = 5; // 최대 저장 개수

// 쿠키에 저장할 최근 본 아파트 데이터 타입
interface CookieRecentView {
  apt_id: number;
  apt_name: string;
  address?: string;
  sigungu_name?: string;
  location?: { lat: number; lng: number } | null;
  timestamp: number; // 저장 시각
}

// 쿠키에서 최근 검색어 읽기
const getRecentSearchesFromCookie = (): string[] => {
  if (typeof document === 'undefined') return [];
  
  const cookies = document.cookie.split(';');
  const cookie = cookies.find(c => c.trim().startsWith(`${COOKIE_KEY_RECENT_SEARCHES}=`));
  
  if (!cookie) return [];
  
  try {
    const value = cookie.split('=')[1];
    const decoded = decodeURIComponent(value);
    return JSON.parse(decoded);
  } catch {
    return [];
  }
};

// 쿠키에 최근 검색어 저장
const saveRecentSearchToCookie = (searchTerm: string): void => {
  if (typeof document === 'undefined' || !searchTerm || searchTerm.trim().length === 0) return;
  
  const trimmedTerm = searchTerm.trim();
  const currentSearches = getRecentSearchesFromCookie();
  
  // 중복 제거 및 최신순 정렬
  const filtered = currentSearches.filter(term => term !== trimmedTerm);
  const updated = [trimmedTerm, ...filtered].slice(0, MAX_COOKIE_SEARCHES);
  
  // 쿠키에 저장 (30일 유효)
  const expires = new Date();
  expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
  const cookieValue = encodeURIComponent(JSON.stringify(updated));
  document.cookie = `${COOKIE_KEY_RECENT_SEARCHES}=${cookieValue};expires=${expires.toUTCString()};path=/`;
};

// 쿠키에서 최근 검색어 삭제
const deleteRecentSearchFromCookie = (searchTerm: string): void => {
  if (typeof document === 'undefined') return;
  
  const currentSearches = getRecentSearchesFromCookie();
  const updated = currentSearches.filter(term => term !== searchTerm);
  
  if (updated.length === 0) {
    // 모두 삭제하면 쿠키 삭제
    document.cookie = `${COOKIE_KEY_RECENT_SEARCHES}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  } else {
    // 업데이트된 목록 저장
    const expires = new Date();
    expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
    const cookieValue = encodeURIComponent(JSON.stringify(updated));
    document.cookie = `${COOKIE_KEY_RECENT_SEARCHES}=${cookieValue};expires=${expires.toUTCString()};path=/`;
  }
};

// 쿠키에서 최근 본 아파트 읽기
const getRecentViewsFromCookie = (): CookieRecentView[] => {
  if (typeof document === 'undefined') return [];
  
  const cookies = document.cookie.split(';');
  const cookie = cookies.find(c => c.trim().startsWith(`${COOKIE_KEY_RECENT_VIEWS}=`));
  
  if (!cookie) return [];
  
  try {
    const value = cookie.split('=')[1];
    const decoded = decodeURIComponent(value);
    return JSON.parse(decoded);
  } catch {
    return [];
  }
};

// 쿠키에 최근 본 아파트 저장
const saveRecentViewToCookie = (apt: ApartmentSearchResult): void => {
  if (typeof document === 'undefined' || !apt || !apt.apt_id) return;
  
  const currentViews = getRecentViewsFromCookie();
  
  // 중복 제거 (같은 apt_id가 있으면 제거)
  const filtered = currentViews.filter(view => view.apt_id !== apt.apt_id);
  
  // 새로운 항목을 맨 앞에 추가
  const newView: CookieRecentView = {
    apt_id: apt.apt_id,
    apt_name: apt.apt_name || '',
    address: apt.address,
    sigungu_name: apt.sigungu_name,
    location: apt.location,
    timestamp: Date.now()
  };
  
  const updated = [newView, ...filtered].slice(0, MAX_COOKIE_VIEWS);
  
  // 쿠키에 저장 (30일 유효)
  const expires = new Date();
  expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
  const cookieValue = encodeURIComponent(JSON.stringify(updated));
  document.cookie = `${COOKIE_KEY_RECENT_VIEWS}=${cookieValue};expires=${expires.toUTCString()};path=/`;
};

// 쿠키에서 최근 본 아파트 삭제
const deleteRecentViewFromCookie = (aptId: number): void => {
  if (typeof document === 'undefined') return;
  
  const currentViews = getRecentViewsFromCookie();
  const updated = currentViews.filter(view => view.apt_id !== aptId);
  
  if (updated.length === 0) {
    // 모두 삭제하면 쿠키 삭제
    document.cookie = `${COOKIE_KEY_RECENT_VIEWS}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  } else {
    // 업데이트된 목록 저장
    const expires = new Date();
    expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
    const cookieValue = encodeURIComponent(JSON.stringify(updated));
    document.cookie = `${COOKIE_KEY_RECENT_VIEWS}=${cookieValue};expires=${expires.toUTCString()};path=/`;
  }
};

// 쿠키에서 모든 최근 본 아파트 삭제
const clearAllRecentViewsFromCookie = (): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_KEY_RECENT_VIEWS}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
};

// 쿠키에서 AI 검색 입력 읽기
const getAISearchInputsFromCookie = (): string[] => {
  if (typeof document === 'undefined') return [];
  
  const cookies = document.cookie.split(';');
  const cookie = cookies.find(c => c.trim().startsWith(`${COOKIE_KEY_AI_SEARCH_INPUTS}=`));
  
  if (!cookie) return [];
  
  try {
    const value = cookie.split('=')[1];
    const decoded = decodeURIComponent(value);
    return JSON.parse(decoded);
  } catch {
    return [];
  }
};

// 쿠키에 AI 검색 입력 저장
const saveAISearchInputToCookie = (input: string): void => {
  if (typeof document === 'undefined' || !input || input.trim().length === 0) return;
  
  const trimmedInput = input.trim();
  const currentInputs = getAISearchInputsFromCookie();
  
  // 중복 제거 및 최신순 정렬
  const filtered = currentInputs.filter(term => term !== trimmedInput);
  const updated = [trimmedInput, ...filtered].slice(0, MAX_COOKIE_AI_INPUTS);
  
  // 쿠키에 저장 (30일 유효)
  const expires = new Date();
  expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
  const cookieValue = encodeURIComponent(JSON.stringify(updated));
  document.cookie = `${COOKIE_KEY_AI_SEARCH_INPUTS}=${cookieValue};expires=${expires.toUTCString()};path=/`;
};

// 쿠키에서 AI 검색 입력 삭제
const deleteAISearchInputFromCookie = (input: string): void => {
  if (typeof document === 'undefined') return;
  
  const currentInputs = getAISearchInputsFromCookie();
  const updated = currentInputs.filter(term => term !== input);
  
  if (updated.length === 0) {
    // 모두 삭제하면 쿠키 삭제
    document.cookie = `${COOKIE_KEY_AI_SEARCH_INPUTS}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  } else {
    // 업데이트된 목록 저장
    const expires = new Date();
    expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
    const cookieValue = encodeURIComponent(JSON.stringify(updated));
    document.cookie = `${COOKIE_KEY_AI_SEARCH_INPUTS}=${cookieValue};expires=${expires.toUTCString()};path=/`;
  }
};

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
  const [gradientPosition, setGradientPosition] = useState({ x: 50, y: 50 });
  const [gradientSize, setGradientSize] = useState(150);

  // AI 모드일 때 물 흐르듯한 그라데이션 애니메이션
  useEffect(() => {
    if (!isAIMode) return;

    let animationFrameId: number;
    let startTime = Date.now();

    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000; // 초 단위
      
      // 부드럽게 변화하는 각도 (사인파 기반)
      const angle = 90 + Math.sin(elapsed * 0.3) * 45 + Math.cos(elapsed * 0.2) * 30;
      setGradientAngle(angle);
      
      // 원형으로 움직이는 그라데이션 위치
      const radius = 30;
      const x = 50 + Math.sin(elapsed * 0.4) * radius;
      const y = 50 + Math.cos(elapsed * 0.35) * radius;
      setGradientPosition({ x, y });
      
      // 크기 변화 (호흡하는 듯한 효과)
      const size = 150 + Math.sin(elapsed * 0.5) * 50;
      setGradientSize(size);
      
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isAIMode]);
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [isLoadingRecentViews, setIsLoadingRecentViews] = useState(false);
  // 쿠키 기반 최근 본 아파트 상태 추가
  const [cookieRecentViews, setCookieRecentViews] = useState<CookieRecentView[]>([]);
  // 급상승 아파트 상태 추가
  const [trendingApartments, setTrendingApartments] = useState<TrendingApartment[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  // 상세 검색 상태
  const [detailedSearchLocation, setDetailedSearchLocation] = useState('');
  const [detailedSearchMinArea, setDetailedSearchMinArea] = useState('');
  const [detailedSearchMaxArea, setDetailedSearchMaxArea] = useState('');
  const [detailedSearchMinPrice, setDetailedSearchMinPrice] = useState('');
  const [detailedSearchMaxPrice, setDetailedSearchMaxPrice] = useState('');
  const [detailedSearchSubwayMinutes, setDetailedSearchSubwayMinutes] = useState('');
  const [detailedSearchHasEducation, setDetailedSearchHasEducation] = useState<boolean | null>(null);
  const [detailedSearchResults, setDetailedSearchResults] = useState<DetailedSearchResult[]>([]);
  const [isSearchingDetailed, setIsSearchingDetailed] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [showDeleteAllRecentViewsDialog, setShowDeleteAllRecentViewsDialog] = useState(false);
  const [isRecentSearchesExpanded, setIsRecentSearchesExpanded] = useState(true);
  const [isRecentViewsExpanded, setIsRecentViewsExpanded] = useState(false);
  
  // 쿠키 기반 최근 검색어 상태
  const [cookieRecentSearches, setCookieRecentSearches] = useState<string[]>([]);
  
  // 쿠키 기반 AI 검색 입력 상태
  const [cookieAISearchInputs, setCookieAISearchInputs] = useState<string[]>([]);
  
  // AI 검색 결과 상태
  const [aiResults, setAiResults] = useState<ApartmentSearchResult[]>([]);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [aiSearchHistory, setAiSearchHistory] = useState<AISearchHistoryItem[]>([]);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  
  // 지도 검색창에서는 검색 기록을 저장함 (saveRecent: true)
  // AI 모드가 아닐 때만 기존 검색 훅 사용
  const { results, isSearching } = useApartmentSearch(query, true);
  const { isSignedIn, getToken } = useAuth();
  const { showError, ToastComponent } = useDynamicIslandToast(isDarkMode, 3000);

  // 검색 결과 변경 시 부모 컴포넌트에 알림 (아파트와 지역 결과 모두 전달)
  const onSearchResultsChangeRef = useRef(onSearchResultsChange);
  useEffect(() => {
    onSearchResultsChangeRef.current = onSearchResultsChange;
  }, [onSearchResultsChange]);
  
  // AI 검색 히스토리 로드 (초기 로드 시에만)
  const [historyLoaded, setHistoryLoaded] = React.useState(false);
  
  useEffect(() => {
    if (isAIMode && isExpanded && !historyLoaded) {
      const history = getAISearchHistory();
      setAiSearchHistory(history);
      setHistoryLoaded(true);
      
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
    } else if (!isAIMode || !isExpanded) {
      setHistoryLoaded(false);
    }
  }, [isAIMode, isExpanded, historyLoaded, query]);

  // AI 검색 실행 (AI 모드일 때만)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (isAIMode && query.length >= 5) {
        setIsSearchingAI(true);
        try {
          const response = await aiSearchApartments(query);
          
          // 시세 정보가 있는 아파트만 필터링
          const apartmentsWithPrice = response.data.apartments.filter((apt: AISearchApartmentResult) => 
            apt.average_price && apt.average_price > 0
          );
          
          // AI 검색 결과를 ApartmentSearchResult 형식으로 변환
          const convertedResults: ApartmentSearchResult[] = apartmentsWithPrice.map((apt: AISearchApartmentResult) => ({
            apt_id: apt.apt_id,
            apt_name: apt.apt_name,
            address: apt.address,
            sigungu_name: apt.address.split(' ').slice(0, 2).join(' ') || '', // 주소에서 시군구 추출
            location: apt.location,
            price: apt.average_price ? `${(apt.average_price / 10000).toFixed(1)}억원` : '정보 없음'
          }));
          
          // 검색 결과가 있으면 히스토리에 저장하고 결과 초기화 (히스토리에서 표시)
          if (convertedResults.length > 0) {
            setAiResults([]); // 히스토리에서 표시하므로 새 결과는 숨김
            // AI 검색 히스토리에 저장
            const historyItem: AISearchHistoryItem = {
              id: `ai-search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              query: query.trim(),
              timestamp: Date.now(),
              response: {
                ...response,
                data: {
                  ...response.data,
                  apartments: apartmentsWithPrice
                }
              },
              apartments: apartmentsWithPrice
            };
            
            saveAISearchHistory(historyItem);
            
            // 히스토리 상태 업데이트 (중복 제거 후 최신 순으로 정렬)
            setAiSearchHistory(prev => [historyItem, ...prev.filter(h => h.query !== query.trim())].slice(0, 10));
          } else {
            setAiResults([]);
            // 시세 정보가 없는 경우 에러 메시지 표시
            showError('시세 정보가 있는 아파트를 찾을 수 없습니다.');
          }
        } catch (error: any) {
          console.error('Failed to search with AI:', error);
          setAiResults([]);
          
          // 에러 메시지 추출 및 표시
          let errorMessage = 'AI 검색에 실패했습니다.';
          const statusCode = error.response?.status;
          const errorCode = error.code;
          
          // 네트워크 에러 처리
          if (errorCode === 'ERR_NETWORK' || error.message === 'Network Error') {
            errorMessage = '네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.';
          } else if (statusCode >= 400 && statusCode < 500) {
            // 400번대 에러
            if (statusCode === 400) {
              errorMessage = '잘못된 검색 요청입니다. 검색어를 확인해주세요.';
            } else if (statusCode === 401) {
              errorMessage = '인증이 필요합니다. 로그인 후 다시 시도해주세요.';
            } else if (statusCode === 403) {
              errorMessage = '검색 권한이 없습니다.';
            } else if (statusCode === 404) {
              errorMessage = 'AI 검색 서비스를 찾을 수 없습니다.';
            } else if (statusCode === 422) {
              errorMessage = '검색어 형식이 올바르지 않습니다.';
            } else if (statusCode === 429) {
              errorMessage = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
            } else {
              errorMessage = error.response?.data?.detail || error.message || '검색 요청에 실패했습니다.';
            }
          } else if (statusCode >= 500) {
            // 500번대 에러
            if (statusCode === 503) {
              errorMessage = 'AI 검색 서비스가 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.';
            } else if (statusCode === 504) {
              errorMessage = 'AI 검색 응답 시간이 초과되었습니다. 다시 시도해주세요.';
            } else {
              errorMessage = 'AI 검색 서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
            }
          } else if (error.message) {
            errorMessage = error.message;
          }
          
          // 다이나믹 아일랜드 토스트로 에러 표시
          showError(errorMessage);
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
      
      // location이 null인 아파트를 필터링하여 제외
      const apartmentResults = apartmentResultsToUse
        .filter(apt => apt.location != null && apt.location.lat != null && apt.location.lng != null)
        .map(apt => ({
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

  // 컴포넌트 마운트 시 쿠키에서 최근 검색어 읽기
  useEffect(() => {
    const searches = getRecentSearchesFromCookie();
    setCookieRecentSearches(searches);
  }, []);

  // 컴포넌트 마운트 시 쿠키에서 최근 본 아파트 읽기
  useEffect(() => {
    const views = getRecentViewsFromCookie();
    setCookieRecentViews(views);
  }, []);

  // 컴포넌트 마운트 시 쿠키에서 AI 검색 입력 읽기
  useEffect(() => {
    const inputs = getAISearchInputsFromCookie();
    setCookieAISearchInputs(inputs);
  }, []);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // 툴팁이 열려있으면 검색창을 닫지 않음
      if (showInfoTooltip) {
        return;
      }
      
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
        setQuery(''); // 검색어 초기화
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [containerRef, showInfoTooltip]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded]);


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

  // 급상승 아파트 가져오기
  useEffect(() => {
    const fetchTrendingApartments = async () => {
      if (isExpanded && activeTab === 'trending' && query.length < 1) {
        setIsLoadingTrending(true);
        try {
          const token = isSignedIn && getToken ? await getToken() : null;
          const apartments = await getTrendingApartments(token);
          setTrendingApartments(apartments);
        } catch (error) {
          console.error('Failed to fetch trending apartments:', error);
          setTrendingApartments([]);
        } finally {
          setIsLoadingTrending(false);
        }
      }
    };

    fetchTrendingApartments();
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
    
    // 쿠키에 최근 본 아파트 저장
    saveRecentViewToCookie(apt);
    setCookieRecentViews(getRecentViewsFromCookie());
    
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
    
  };


  const handleDeleteAllRecentViews = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!isSignedIn || !getToken || recentViews.length === 0) {
      return;
    }
    
    try {
      const token = await getToken();
      if (token) {
        const result = await deleteAllRecentViews(token);
        setRecentViews([]);
        showSuccess(`모든 최근 본 아파트 기록(${result.deleted_count}개)이 삭제되었습니다.`);
      }
    } catch (error) {
      console.error('❌ [MapSearchControl] 최근 본 아파트 전체 삭제 실패:', error);
      showError('삭제 중 오류가 발생했습니다.');
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
    { id: 'settings', label: '상세 검색', icon: Settings },
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
                  ? 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.12) 0%, rgba(88, 28, 135, 0.08) 50%, transparent 100%)'
                  : 'radial-gradient(circle at 50% 50%, rgba(147, 197, 253, 0.25) 0%, rgba(196, 181, 253, 0.2) 50%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
            {/* 움직이는 그라데이션 레이어 - 물 흐르듯한 효과 */}
            <div 
              className="water-gradient-flow"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 24,
                background: isDarkMode
                  ? `radial-gradient(circle ${gradientSize}px at ${gradientPosition.x}% ${gradientPosition.y}%, rgba(59, 130, 246, 0.2) 0%, rgba(168, 85, 247, 0.25) 30%, rgba(59, 130, 246, 0.15) 60%, transparent 100%)`
                  : `radial-gradient(circle ${gradientSize}px at ${gradientPosition.x}% ${gradientPosition.y}%, rgba(96, 165, 250, 0.35) 0%, rgba(192, 132, 252, 0.4) 30%, rgba(96, 165, 250, 0.25) 60%, transparent 100%)`,
                pointerEvents: 'none',
                zIndex: 0,
                transition: 'background 0.3s ease-out',
              }}
            />
            {/* 추가 움직이는 레이어 - 더 랜덤한 효과 */}
            <div 
              className="water-gradient-flow-secondary"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 24,
                background: isDarkMode
                  ? `radial-gradient(ellipse ${gradientSize * 0.7}px ${gradientSize * 1.2}px at ${100 - gradientPosition.x}% ${100 - gradientPosition.y}%, rgba(168, 85, 247, 0.18) 0%, rgba(59, 130, 246, 0.12) 40%, transparent 80%)`
                  : `radial-gradient(ellipse ${gradientSize * 0.7}px ${gradientSize * 1.2}px at ${100 - gradientPosition.x}% ${100 - gradientPosition.y}%, rgba(192, 132, 252, 0.3) 0%, rgba(96, 165, 250, 0.2) 40%, transparent 80%)`,
                pointerEvents: 'none',
                zIndex: 0,
                transition: 'background 0.4s ease-out',
              }}
            />
          </>
        )}
        {/* Header Area */}
        <div className="w-full flex items-center shrink-0 h-12 relative" style={{ zIndex: 1 }}>
            {!isExpanded ? (
                <button
                    onClick={() => setIsExpanded(true)}
                    className="w-12 h-12 flex items-center justify-center text-blue-600 dark:text-blue-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                    <Search size={22} />
                </button>
            ) : (
                <div 
                    className="flex items-center w-full px-4 gap-2 h-12"
                >
                    <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${isAIMode ? 'text-purple-400' : 'text-zinc-400'}`} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => handleQueryChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const trimmedQuery = query.trim();
                            
                            // 검색어가 있으면 쿠키에 저장 (AI 모드가 아니고 2글자 이상인 경우)
                            if (trimmedQuery.length >= 2 && !isAIMode) {
                              saveRecentSearchToCookie(trimmedQuery);
                              // 쿠키 최근 검색어 상태 업데이트
                              setCookieRecentSearches(getRecentSearchesFromCookie());
                            }
                            
                            // AI 모드에서 엔터 키를 누르면 검색이 자동으로 시작됨 (useEffect가 처리)
                            // AI 검색 입력도 쿠키에 저장 (5글자 이상인 경우)
                            if (isAIMode && trimmedQuery.length >= 5) {
                              saveAISearchInputToCookie(trimmedQuery);
                              // 쿠키 AI 검색 입력 상태 업데이트
                              setCookieAISearchInputs(getAISearchInputsFromCookie());
                              e.preventDefault();
                            }
                          }
                        }}
                        placeholder={isAIMode ? "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처" : "아파트 이름, 지역 검색..."}
                        className={`flex-1 pl-12 pr-4 py-1.5 rounded-2xl border transition-all ${
                          isAIMode
                            ? isDarkMode
                              ? 'bg-zinc-900 border-purple-500/50 focus:border-purple-400 text-white placeholder:text-purple-300/60'
                              : 'bg-white border-purple-400/50 focus:border-purple-500 text-zinc-900 placeholder:text-purple-400/60'
                            : isDarkMode
                            ? 'bg-zinc-900 border-white/10 focus:border-sky-500/50 text-white placeholder:text-zinc-600'
                            : 'bg-white border-black/5 focus:border-sky-500 text-zinc-900 placeholder:text-zinc-400'
                        } focus:outline-none focus:ring-4 focus:ring-sky-500/10`}
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
                style={{ position: 'relative', zIndex: 1, maxHeight: '70vh', overflow: 'hidden' }}
            >
                    <div className={`w-full overflow-y-auto custom-scrollbar overscroll-contain ${isAIMode && query.length >= 1 ? 'pt-2.5 pb-4 px-4' : 'p-4'}`} style={{ maxHeight: '70vh', position: 'relative', zIndex: 10 }}>
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
                                        
                                        {/* AI 검색 히스토리 및 결과 표시 */}
                                        {query.length >= 5 && !isSearchingAI && (
                                            <AIChatMessages
                                                history={aiSearchHistory.filter(item => 
                                                    item.query.toLowerCase() === query.toLowerCase().trim()
                                                )}
                                                isDarkMode={isDarkMode}
                                                onApartmentSelect={handleSelect}
                                                onHistoryCleared={() => {
                                                    // 히스토리 삭제 후 즉시 업데이트
                                                    const updatedHistory = getAISearchHistory();
                                                    setAiSearchHistory(updatedHistory);
                                                    setHistoryLoaded(false); // 히스토리 다시 로드 방지
                                                }}
                                                showTooltip={true}
                                            />
                                        )}
                                        {/* 검색 중이 아니고 결과가 있지만 히스토리에 없는 경우 (새로운 검색 결과) - 이제는 히스토리에 저장되므로 표시하지 않음 */}
                                        {false && !isSearchingAI && aiResults.length > 0 && query.length >= 5 && aiSearchHistory.filter(item => 
                                            item.query.toLowerCase() === query.toLowerCase().trim()
                                        ).length === 0 && (
                                            <div className="space-y-2 mt-4">
                                                <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                    검색 결과 ({aiResults.length}개)
                                                </div>
                                                {aiResults.map((apt) => (
                                                    <button
                                                        key={apt.apt_id}
                                                        onClick={() => handleSelect({ type: 'apartment', apartment: apt })}
                                                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                                                            isDarkMode
                                                                ? 'hover:bg-zinc-800 border border-zinc-700'
                                                                : 'hover:bg-zinc-50 border border-zinc-200'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <Building2 className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                                            <div className="flex-1">
                                                                <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>{apt.apt_name}</p>
                                                                <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>{apt.address}</p>
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
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
                                    <>
                                            {/* 최근 본 아파트 섹션 */}
                                            {isSignedIn && (
                                                <div className="mb-6">
                                                    <button
                                                        onClick={(e) => {
                                                            // 스크롤 위치 저장 (가장 가까운 스크롤 컨테이너 찾기)
                                                            let scrollContainer: HTMLElement | Window = window;
                                                            let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                                                            
                                                            // 현재 버튼에서 가장 가까운 스크롤 가능한 부모 요소 찾기
                                                            let parent = (e.currentTarget as HTMLElement)?.closest('.overflow-y-auto, .overflow-auto') as HTMLElement;
                                                            if (!parent) {
                                                                // MapSearchControl 내부의 스크롤 컨테이너 찾기
                                                                const container = containerRef.current?.querySelector('.overflow-y-auto') as HTMLElement;
                                                                if (container) {
                                                                    parent = container;
                                                                }
                                                            }
                                                            
                                                            if (parent) {
                                                                scrollContainer = parent;
                                                                scrollTop = parent.scrollTop;
                                                            }
                                                            
                                                            setIsRecentViewsExpanded(!isRecentViewsExpanded);
                                                            
                                                            // 스크롤 위치 복원
                                                            requestAnimationFrame(() => {
                                                                if (scrollContainer === window) {
                                                                    window.scrollTo(0, scrollTop);
                                                                } else {
                                                                    (scrollContainer as HTMLElement).scrollTop = scrollTop;
                                                                }
                                                            });
                                                        }}
                                                        className={`w-full py-3 px-0 border-b transition-colors group ${
                                                            isDarkMode
                                                                ? 'border-zinc-700/30 hover:bg-zinc-800/20'
                                                                : 'border-zinc-200/50 hover:bg-zinc-50/50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <Clock className={`w-4 h-4 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                                                                <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                                                                    최근 본 아파트
                                                                </h3>
                                                                {cookieRecentViews.length > 0 && (
                                                                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                                        isDarkMode
                                                                            ? 'bg-zinc-800 text-zinc-300'
                                                                            : 'bg-zinc-100 text-zinc-600'
                                                                    }`}>
                                                                        {cookieRecentViews.length}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {cookieRecentViews.length > 0 && (
                                                                    <button
                                                                        onClick={() => {
                                                                            clearAllRecentViewsFromCookie();
                                                                            setCookieRecentViews([]);
                                                                        }}
                                                                        className={`p-1.5 rounded-full hover:bg-zinc-700 dark:hover:bg-zinc-700 transition-colors shrink-0 ${
                                                                            isDarkMode ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-500 hover:text-red-600'
                                                                        }`}
                                                                        aria-label="모든 최근 본 아파트 삭제"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                )}
                                                                {isRecentViewsExpanded ? (
                                                                    <ChevronUp
                                                                        className={`w-4 h-4 transition-colors duration-200 ${
                                                                            isDarkMode
                                                                                ? 'text-zinc-400 group-hover:text-white'
                                                                                : 'text-zinc-600 group-hover:text-zinc-900'
                                                                        }`}
                                                                    />
                                                                ) : (
                                                                    <ChevronDown
                                                                        className={`w-4 h-4 transition-colors duration-200 ${
                                                                            isDarkMode
                                                                                ? 'text-zinc-400 group-hover:text-white'
                                                                                : 'text-zinc-600 group-hover:text-zinc-900'
                                                                        }`}
                                                                    />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                    <AnimatePresence>
                                                        {isRecentViewsExpanded && (
                                                            <motion.div
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                transition={{ duration: 0.2, ease: "easeOut" }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="pt-2 max-h-[360px] overflow-y-auto">
                                                                {isLoadingRecentViews ? (
                                                                    <motion.div
                                                                        initial={{ opacity: 0 }}
                                                                        animate={{ opacity: 1 }}
                                                                        className="flex items-center justify-center py-4"
                                                                    >
                                                                        <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                                                                    </motion.div>
                                                                ) : cookieRecentViews.length > 0 ? (
                                                                    <div>
                                                                        <AnimatePresence mode="popLayout">
                                                                            {cookieRecentViews.slice(0, 5).map((view, index) => (
                                                                                <motion.div
                                                                                    key={view.apt_id}
                                                                                    initial={{ opacity: 0, y: -10 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    exit={{ opacity: 0, height: 0 }}
                                                                                    transition={{ 
                                                                                        duration: 0.2,
                                                                                        delay: index * 0.03,
                                                                                        ease: "easeOut"
                                                                                    }}
                                                                                    className={`w-full flex items-center gap-3 py-2.5 transition-colors group ${
                                                                                        index !== cookieRecentViews.length - 1
                                                                                            ? `border-b ${isDarkMode ? 'border-zinc-700/50' : 'border-zinc-200'}`
                                                                                            : ''
                                                                                    } ${
                                                                                        isDarkMode 
                                                                                            ? 'hover:bg-zinc-800/30' 
                                                                                            : 'hover:bg-zinc-50'
                                                                                    }`}
                                                                                >
                                                                                    <motion.button
                                                                                        whileHover={{ scale: 1.01 }}
                                                                                        whileTap={{ scale: 0.99 }}
                                                                                        onClick={() => {
                                                                                            if (view.location && view.location.lat && view.location.lng) {
                                                                                                const aptData: ApartmentSearchResult = {
                                                                                                    apt_id: view.apt_id,
                                                                                                    apt_name: view.apt_name,
                                                                                                    address: view.address || '',
                                                                                                    sigungu_name: view.sigungu_name || '',
                                                                                                    location: view.location,
                                                                                                    price: '',
                                                                                                };
                                                                                                handleSelect(aptData);
                                                                                            }
                                                                                        }}
                                                                                        className="flex-1 flex items-center gap-3 text-left"
                                                                                    >
                                                                                        <Building2 size={14} className={`shrink-0 ${
                                                                                            isDarkMode ? 'text-blue-400' : 'text-blue-600'
                                                                                        }`} />
                                                                                        <div className="flex-1 min-w-0">
                                                                                            <p className={`text-sm font-medium truncate ${
                                                                                                isDarkMode 
                                                                                                    ? 'text-white group-hover:text-blue-400' 
                                                                                                    : 'text-zinc-900 group-hover:text-blue-600'
                                                                                            }`}>
                                                                                                {view.apt_name}
                                                                                            </p>
                                                                                            {view.address && (
                                                                                                <div className="flex items-center gap-1 mt-0.5">
                                                                                                    <MapPin size={11} className={`shrink-0 ${
                                                                                                        isDarkMode ? 'text-zinc-400' : 'text-zinc-500'
                                                                                                    }`} />
                                                                                                    <p className={`text-xs truncate ${
                                                                                                        isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                                                                                                    }`}>
                                                                                                        {view.address}
                                                                                                    </p>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </motion.button>
                                                                                    <motion.button
                                                                                        whileHover={{ scale: 1.1 }}
                                                                                        whileTap={{ scale: 0.9 }}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            deleteRecentViewFromCookie(view.apt_id);
                                                                                            setCookieRecentViews(getRecentViewsFromCookie());
                                                                                        }}
                                                                                        className={`p-1.5 rounded-full hover:bg-zinc-700 dark:hover:bg-zinc-700 transition-colors shrink-0 ${
                                                                                            isDarkMode ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-500 hover:text-red-600'
                                                                                        }`}
                                                                                        aria-label="최근 본 아파트 삭제"
                                                                                    >
                                                                                        <X size={14} />
                                                                                    </motion.button>
                                                                                </motion.div>
                                                                            ))}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                ) : (
                                                                    <motion.div
                                                                        initial={{ opacity: 0 }}
                                                                        animate={{ opacity: 1 }}
                                                                        className={`text-xs text-center py-3 rounded-lg ${
                                                                            isDarkMode ? 'text-zinc-400 bg-zinc-800/30' : 'text-zinc-500 bg-zinc-50'
                                                                        }`}
                                                                    >
                                                                        최근 본 아파트가 없습니다
                                                                    </motion.div>
                                                                )}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )}

                                            {/* 검색 기록 섹션 */}
                                            <div className="mb-6">
                                                <button
                                                    onClick={(e) => {
                                                        // 스크롤 위치 저장 (가장 가까운 스크롤 컨테이너 찾기)
                                                        let scrollContainer: HTMLElement | Window = window;
                                                        let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                                                        
                                                        // 현재 버튼에서 가장 가까운 스크롤 가능한 부모 요소 찾기
                                                        let parent = (e.currentTarget as HTMLElement)?.closest('.overflow-y-auto, .overflow-auto') as HTMLElement;
                                                        if (!parent) {
                                                            // MapSearchControl 내부의 스크롤 컨테이너 찾기
                                                            const container = containerRef.current?.querySelector('.overflow-y-auto') as HTMLElement;
                                                            if (container) {
                                                                parent = container;
                                                            }
                                                        }
                                                        
                                                        if (parent) {
                                                            scrollContainer = parent;
                                                            scrollTop = parent.scrollTop;
                                                        }
                                                        
                                                        setIsRecentSearchesExpanded(!isRecentSearchesExpanded);
                                                        
                                                        // 스크롤 위치 복원
                                                        requestAnimationFrame(() => {
                                                            if (scrollContainer === window) {
                                                                window.scrollTo(0, scrollTop);
                                                            } else {
                                                                (scrollContainer as HTMLElement).scrollTop = scrollTop;
                                                            }
                                                        });
                                                    }}
                                                    className={`w-full py-3 px-0 border-b transition-colors group ${
                                                        isDarkMode
                                                            ? 'border-zinc-700/30 hover:bg-zinc-800/20'
                                                            : 'border-zinc-200/50 hover:bg-zinc-50/50'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <Clock className={`w-4 h-4 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                                                            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                                                                최근 검색어
                                                            </h3>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <ChevronDown
                                                                className={`w-4 h-4 transition-transform duration-200 ${
                                                                    isRecentSearchesExpanded ? 'rotate-180' : ''
                                                                } ${
                                                                    isDarkMode
                                                                        ? 'text-zinc-400 group-hover:text-white'
                                                                        : 'text-zinc-600 group-hover:text-zinc-900'
                                                                }`}
                                                            />
                                                        </div>
                                                    </div>
                                                </button>
                                                {isRecentSearchesExpanded && (
                                                    <div className="pt-2">
                                                        {cookieRecentSearches.length > 0 ? (
                                                                    <div className="space-y-2">
                                                                        {cookieRecentSearches.slice(0, 5).map((searchTerm, index) => (
                                                                            <button
                                                                                key={index}
                                                                                onClick={() => {
                                                                                    handleQueryChange(searchTerm);
                                                                                    setQuery(searchTerm);
                                                                                    inputRef.current?.focus();
                                                                                }}
                                                                                className={`w-full text-left p-2 rounded-lg transition-all flex items-center gap-2 group ${
                                                                                    isDarkMode 
                                                                                        ? 'hover:bg-zinc-800/50 hover:shadow-md' 
                                                                                        : 'hover:bg-zinc-50 hover:shadow-sm'
                                                                                }`}
                                                                            >
                                                                                <Clock size={14} className={`shrink-0 ${
                                                                                    isDarkMode ? 'text-zinc-400 group-hover:text-zinc-300' : 'text-zinc-500 group-hover:text-zinc-700'
                                                                                }`} />
                                                                                <span className={`flex-1 text-sm font-medium truncate ${
                                                                                    isDarkMode ? 'text-white group-hover:text-sky-300' : 'text-zinc-900 group-hover:text-sky-700'
                                                                                }`}>
                                                                                    {searchTerm}
                                                                                </span>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        deleteRecentSearchFromCookie(searchTerm);
                                                                                        setCookieRecentSearches(getRecentSearchesFromCookie());
                                                                                    }}
                                                                                    className={`p-1 rounded hover:bg-zinc-700 dark:hover:bg-zinc-700 transition-colors shrink-0 ${
                                                                                        isDarkMode ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-500 hover:text-red-600'
                                                                                    }`}
                                                                                    aria-label="검색어 삭제"
                                                                                >
                                                                                    <X size={14} />
                                                                                </button>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className={`text-xs text-center py-3 rounded-lg ${
                                                                        isDarkMode ? 'text-zinc-400 bg-zinc-800/30' : 'text-zinc-500 bg-zinc-50'
                                                                    }`}>
                                                                        최근 검색 기록이 없습니다
                                                                    </div>
                                                                )}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )
                                    : !isAIMode && activeTab === 'settings' ? (
                                    <div className="flex flex-col gap-4">
                                        <div className="space-y-3">
                                            {/* 지역 */}
                                            <div>
                                                <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                    지역
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="예: 강남구, 서울시 강남구"
                                                    value={detailedSearchLocation}
                                                    onChange={(e) => setDetailedSearchLocation(e.target.value)}
                                                    className={`w-full px-3 py-2 text-sm rounded-lg border transition-all ${
                                                        isDarkMode 
                                                            ? 'bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10' 
                                                            : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10'
                                                    }`}
                                                />
                                            </div>
                                            
                                            {/* 평수 범위 */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                        최소 평수 (㎡)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        placeholder="최소"
                                                        value={detailedSearchMinArea}
                                                        onChange={(e) => setDetailedSearchMinArea(e.target.value)}
                                                        className={`w-full px-3 py-2 text-sm rounded-lg border transition-all ${
                                                            isDarkMode 
                                                                ? 'bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10' 
                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10'
                                                        }`}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                        최대 평수 (㎡)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        placeholder="최대"
                                                        value={detailedSearchMaxArea}
                                                        onChange={(e) => setDetailedSearchMaxArea(e.target.value)}
                                                        className={`w-full px-3 py-2 text-sm rounded-lg border transition-all ${
                                                            isDarkMode 
                                                                ? 'bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10' 
                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10'
                                                        }`}
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* 가격 범위 */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                        최소 가격 (만원)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        placeholder="최소"
                                                        value={detailedSearchMinPrice}
                                                        onChange={(e) => setDetailedSearchMinPrice(e.target.value)}
                                                        className={`w-full px-3 py-2 text-sm rounded-lg border transition-all ${
                                                            isDarkMode 
                                                                ? 'bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10' 
                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10'
                                                        }`}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                        최대 가격 (만원)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        placeholder="최대"
                                                        value={detailedSearchMaxPrice}
                                                        onChange={(e) => setDetailedSearchMaxPrice(e.target.value)}
                                                        className={`w-full px-3 py-2 text-sm rounded-lg border transition-all ${
                                                            isDarkMode 
                                                                ? 'bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10' 
                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10'
                                                        }`}
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* 지하철 거리 */}
                                            <div>
                                                <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                    지하철 도보 시간 (분, 최대)
                                                </label>
                                                <input
                                                    type="number"
                                                    placeholder="예: 10"
                                                    min="0"
                                                    max="60"
                                                    value={detailedSearchSubwayMinutes}
                                                    onChange={(e) => setDetailedSearchSubwayMinutes(e.target.value)}
                                                    className={`w-full px-3 py-2 text-sm rounded-lg border transition-all ${
                                                        isDarkMode 
                                                            ? 'bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10' 
                                                            : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10'
                                                    }`}
                                                />
                                            </div>
                                            
                                            {/* 교육시설 */}
                                            <div>
                                                <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                    교육시설
                                                </label>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setDetailedSearchHasEducation(detailedSearchHasEducation === true ? null : true)}
                                                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                                                            detailedSearchHasEducation === true
                                                                ? isDarkMode
                                                                    ? 'bg-sky-500 text-white'
                                                                    : 'bg-sky-500 text-white'
                                                                : isDarkMode
                                                                    ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                                                    : 'bg-zinc-50 text-zinc-600 border border-zinc-300'
                                                        }`}
                                                    >
                                                        있음
                                                    </button>
                                                    <button
                                                        onClick={() => setDetailedSearchHasEducation(detailedSearchHasEducation === false ? null : false)}
                                                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                                                            detailedSearchHasEducation === false
                                                                ? isDarkMode
                                                                    ? 'bg-sky-500 text-white'
                                                                    : 'bg-sky-500 text-white'
                                                                : isDarkMode
                                                                    ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                                                    : 'bg-zinc-50 text-zinc-600 border border-zinc-300'
                                                        }`}
                                                    >
                                                        없음
                                                    </button>
                                                    <button
                                                        onClick={() => setDetailedSearchHasEducation(null)}
                                                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                                                            detailedSearchHasEducation === null
                                                                ? isDarkMode
                                                                    ? 'bg-sky-500 text-white'
                                                                    : 'bg-sky-500 text-white'
                                                                : isDarkMode
                                                                    ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                                                    : 'bg-zinc-50 text-zinc-600 border border-zinc-300'
                                                        }`}
                                                    >
                                                        상관없음
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            {/* 검색 버튼 */}
                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={async () => {
                                                    setIsSearchingDetailed(true);
                                                    try {
                                                        const token = isSignedIn && getToken ? await getToken() : null;
                                                        const request: DetailedSearchRequest = {
                                                            location: detailedSearchLocation.trim() || undefined,
                                                            min_area: detailedSearchMinArea ? parseFloat(detailedSearchMinArea) : undefined,
                                                            max_area: detailedSearchMaxArea ? parseFloat(detailedSearchMaxArea) : undefined,
                                                            min_price: detailedSearchMinPrice ? parseInt(detailedSearchMinPrice) : undefined,
                                                            max_price: detailedSearchMaxPrice ? parseInt(detailedSearchMaxPrice) : undefined,
                                                            subway_max_distance_minutes: detailedSearchSubwayMinutes ? parseInt(detailedSearchSubwayMinutes) : undefined,
                                                            has_education_facility: detailedSearchHasEducation,
                                                            limit: 50
                                                        };
                                                        const result = await detailedSearchApartments(request, token);
                                                        setDetailedSearchResults(result.results.filter(apt => apt.location != null && apt.location.lat != null && apt.location.lng != null));
                                                        
                                                        // 검색 결과를 지도에 표시
                                                        if (onSearchResultsChange && result.results.length > 0) {
                                                            const markers = result.results
                                                                .filter(apt => apt.location && apt.location.lat && apt.location.lng)
                                                                .map(apt => ({
                                                                    id: apt.apt_id,
                                                                    apt_id: apt.apt_id,
                                                                    name: apt.apt_name,
                                                                    apt_name: apt.apt_name,
                                                                    lat: apt.location!.lat,
                                                                    lng: apt.location!.lng,
                                                                    address: apt.address || '',
                                                                    markerType: 'apartment' as const
                                                                }));
                                                            onSearchResultsChange(markers);
                                                        }
                                                    } catch (error) {
                                                        console.error('Failed to detailed search apartments:', error);
                                                        setDetailedSearchResults([]);
                                                    } finally {
                                                        setIsSearchingDetailed(false);
                                                    }
                                                }}
                                                disabled={isSearchingDetailed}
                                                className={`w-full py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                                                    isSearchingDetailed
                                                        ? isDarkMode
                                                            ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                                                            : 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                                                        : isDarkMode
                                                            ? 'bg-sky-500 hover:bg-sky-600 text-white'
                                                            : 'bg-sky-500 hover:bg-sky-600 text-white'
                                                }`}
                                            >
                                                {isSearchingDetailed ? (
                                                    <>
                                                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                                        <span>검색 중...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Search size={16} />
                                                        <span>검색</span>
                                                    </>
                                                )}
                                            </motion.button>
                                            
                                            {/* 검색 결과 */}
                                            {detailedSearchResults.length > 0 && (
                                                <div className="mt-4 pt-4 border-t border-zinc-700 dark:border-zinc-700">
                                                    <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                        검색 결과 ({detailedSearchResults.length}개)
                                                    </p>
                                                    <div className="max-h-[200px] overflow-y-auto space-y-2">
                                                        {detailedSearchResults.slice(0, 10).map((apt) => (
                                                            <motion.button
                                                                key={apt.apt_id}
                                                                whileHover={{ scale: 1.01 }}
                                                                whileTap={{ scale: 0.99 }}
                                                                onClick={() => {
                                                                    if (apt.location && apt.location.lat && apt.location.lng) {
                                                                        const aptData: ApartmentSearchResult = {
                                                                            apt_id: apt.apt_id,
                                                                            apt_name: apt.apt_name,
                                                                            address: apt.address || '',
                                                                            sigungu_name: '',
                                                                            location: apt.location,
                                                                            price: '',
                                                                        };
                                                                        handleSelect(aptData);
                                                                    }
                                                                }}
                                                                className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                                                                    isDarkMode
                                                                        ? 'bg-zinc-800/50 hover:bg-zinc-800 text-white'
                                                                        : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-900'
                                                                }`}
                                                            >
                                                                <p className="text-sm font-medium truncate">{apt.apt_name}</p>
                                                                {apt.address && (
                                                                    <p className={`text-xs mt-0.5 truncate ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                                        {apt.address}
                                                                    </p>
                                                                )}
                                                                {apt.average_price && apt.average_price > 0 ? (() => {
                                                                    const price = Math.floor(apt.average_price);
                                                                    const priceText = price >= 10000 
                                                                        ? `${Math.floor(price / 10000)}억 ${(price % 10000).toLocaleString()}만원`
                                                                        : `${price.toLocaleString()}만원`;
                                                                    return (
                                                                        <p className={`text-xs mt-1 font-medium ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
                                                                            평균 {priceText}
                                                                        </p>
                                                                    );
                                                                })() : (
                                                                    <p className="text-xs mt-1 font-medium text-red-500">
                                                                        최근 6개월간 거래 내역이 없습니다
                                                                    </p>
                                                                )}
                                                            </motion.button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : !isAIMode && activeTab === 'trending' ? (
                                    isLoadingTrending ? (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="flex items-center justify-center py-4"
                                        >
                                            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                                        </motion.div>
                                    ) : trendingApartments.length > 0 ? (
                                        <div>
                                            <AnimatePresence mode="popLayout">
                                                {trendingApartments.map((apt, index) => (
                                                    <motion.div
                                                        key={apt.apt_id}
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ 
                                                            duration: 0.2,
                                                            delay: index * 0.03,
                                                            ease: "easeOut"
                                                        }}
                                                        className={`w-full flex items-center gap-3 py-2.5 transition-colors group ${
                                                            index !== trendingApartments.length - 1
                                                                ? `border-b ${isDarkMode ? 'border-zinc-700/50' : 'border-zinc-200'}`
                                                                : ''
                                                        } ${
                                                            isDarkMode 
                                                                ? 'hover:bg-zinc-800/30' 
                                                                : 'hover:bg-zinc-50'
                                                        }`}
                                                    >
                                                        <motion.button
                                                            whileHover={{ scale: 1.01 }}
                                                            whileTap={{ scale: 0.99 }}
                                                            onClick={() => {
                                                                if (apt.location && apt.location.lat && apt.location.lng) {
                                                                    const aptData: ApartmentSearchResult = {
                                                                        apt_id: apt.apt_id,
                                                                        apt_name: apt.apt_name,
                                                                        address: apt.address || '',
                                                                        sigungu_name: '',
                                                                        location: apt.location,
                                                                        price: '',
                                                                    };
                                                                    handleSelect(aptData);
                                                                }
                                                            }}
                                                            className="flex-1 flex items-center gap-3 text-left"
                                                        >
                                                            <TrendingUp size={14} className={`shrink-0 ${
                                                                isDarkMode ? 'text-orange-400' : 'text-orange-600'
                                                            }`} />
                                                            <div className="flex-1 min-w-0">
                                                                <p className={`text-sm font-medium truncate ${
                                                                    isDarkMode 
                                                                        ? 'text-white group-hover:text-orange-400' 
                                                                        : 'text-zinc-900 group-hover:text-orange-600'
                                                                }`}>
                                                                    {apt.apt_name}
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    {apt.address && (
                                                                        <div className="flex items-center gap-1">
                                                                            <MapPin size={11} className={`shrink-0 ${
                                                                                isDarkMode ? 'text-zinc-400' : 'text-zinc-500'
                                                                            }`} />
                                                                            <p className={`text-xs truncate ${
                                                                                isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                                                                            }`}>
                                                                                {apt.address}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                                        isDarkMode ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'
                                                                    }`}>
                                                                        {apt.transaction_count}건
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </motion.button>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    ) : (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className={`text-xs text-center py-3 rounded-lg ${
                                                isDarkMode ? 'text-zinc-400 bg-zinc-800/30' : 'text-zinc-500 bg-zinc-50'
                                            }`}
                                        >
                                            급상승 검색어가 없습니다
                                        </motion.div>
                                    )
                                ) : !isAIMode && (
                                    <div className={`flex flex-col items-center justify-center py-8 gap-3 ${
                                        isDarkMode ? 'text-white' : 'text-zinc-500'
                                    }`}>
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                            isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'
                                        }`}>
                                        </div>
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
                                {query.length < 1 && (
                                    <div className="flex flex-col gap-2">
                                        {/* 최근 검색 이력 헤더 */}
                                        <div className="flex items-center justify-between pb-1">
                                            <div className="flex items-center gap-2">
                                                <div className="relative">
                                                    <button
                                                        ref={infoButtonRef}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (infoButtonRef.current) {
                                                                const rect = infoButtonRef.current.getBoundingClientRect();
                                                                setTooltipPosition({
                                                                    top: rect.bottom + 8,
                                                                    left: rect.left
                                                                });
                                                            }
                                                            setShowInfoTooltip(!showInfoTooltip);
                                                        }}
                                                        className={`p-1.5 rounded-full transition-all duration-200 ${
                                                            isDarkMode 
                                                                ? 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300' 
                                                                : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700'
                                                        }`}
                                                        title="AI 검색 지원 조건 보기"
                                                    >
                                                        <Info className="w-4 h-4" />
                                                    </button>
                                                    {/* Info 툴팁 */}
                                                    {showInfoTooltip && createPortal(
                                                        <>
                                                            <div
                                                                className="fixed inset-0 z-[999998] bg-black/20"
                                                                style={{ zIndex: 999998 }}
                                                            />
                                                            <div
                                                                className={`fixed p-4 rounded-xl shadow-2xl border z-[999999] w-80 max-w-[calc(100vw-2rem)] ${
                                                                    isDarkMode 
                                                                        ? 'bg-zinc-800 border-zinc-700 text-white' 
                                                                        : 'bg-white border-zinc-200 text-zinc-900'
                                                                }`}
                                                                style={{
                                                                    top: tooltipPosition ? `${tooltipPosition.top}px` : '50%',
                                                                    left: tooltipPosition ? `${tooltipPosition.left}px` : '50%',
                                                                    transform: tooltipPosition ? 'none' : 'translate(-50%, -50%)',
                                                                    maxHeight: '80vh',
                                                                    overflowY: 'auto',
                                                                    zIndex: 999999
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <div className="flex items-start justify-between mb-3">
                                                                    <h4 className="font-semibold text-sm">AI 검색 지원 조건</h4>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            setShowInfoTooltip(false);
                                                                        }}
                                                                        className={`p-1 rounded-full transition-colors flex-shrink-0 ${
                                                                            isDarkMode ? 'hover:bg-zinc-700' : 'hover:bg-zinc-100'
                                                                        }`}
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                                <ul className="text-xs space-y-2">
                                                                    <li className="flex items-start gap-2">
                                                                        <span className="text-sky-500 mt-0.5">•</span>
                                                                        <span>지역: 시도, 시군구, 동 단위</span>
                                                                    </li>
                                                                    <li className="flex items-start gap-2">
                                                                        <span className="text-sky-500 mt-0.5">•</span>
                                                                        <span>평수: 전용면적 (예: 30평대)</span>
                                                                    </li>
                                                                    <li className="flex items-start gap-2">
                                                                        <span className="text-sky-500 mt-0.5">•</span>
                                                                        <span>가격: 매매/전월세 가격대</span>
                                                                    </li>
                                                                    <li className="flex items-start gap-2">
                                                                        <span className="text-sky-500 mt-0.5">•</span>
                                                                        <span>아파트 이름: 특정 아파트명</span>
                                                                    </li>
                                                                    <li className="flex items-start gap-2">
                                                                        <span className="text-sky-500 mt-0.5">•</span>
                                                                        <span>지하철 거리: 도보 시간</span>
                                                                    </li>
                                                                    <li className="flex items-start gap-2">
                                                                        <span className="text-sky-500 mt-0.5">•</span>
                                                                        <span>교육시설: 초등학교 등 유무</span>
                                                                    </li>
                                                                </ul>
                                                            </div>
                                                        </>,
                                                        document.body
                                                    )}
                                                </div>
                                                <div className={`text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                    최근 검색 이력
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    clearAISearchHistory();
                                                    const updatedHistory = getAISearchHistory();
                                                    setAiSearchHistory(updatedHistory);
                                                    setHistoryLoaded(false);
                                                }}
                                                className={`p-1.5 rounded-full transition-all duration-200 ${
                                                    isDarkMode 
                                                        ? 'hover:bg-zinc-800 text-zinc-400 hover:text-red-400' 
                                                        : 'hover:bg-zinc-100 text-zinc-500 hover:text-red-600'
                                                }`}
                                                title="검색 히스토리 지우기"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {/* 최근 검색 이력 목록 */}
                                        {cookieAISearchInputs.length > 0 ? (
                                            <div className="space-y-2">
                                                {cookieAISearchInputs.slice(0, 5).map((input, index) => (
                                                    <button
                                                        key={index}
                                                        onClick={() => {
                                                            // 검색어를 입력창에 설정하면 useEffect가 자동으로 검색 실행
                                                            setQuery(input);
                                                            setIsExpanded(true);
                                                            inputRef.current?.focus();
                                                        }}
                                                        className={`w-full text-left p-2 rounded-lg transition-all flex items-center gap-2 group ${
                                                            isDarkMode 
                                                                ? 'hover:bg-zinc-800/50 hover:shadow-md' 
                                                                : 'hover:bg-zinc-50 hover:shadow-sm'
                                                        }`}
                                                    >
                                                        <Clock size={14} className={`shrink-0 ${
                                                            isDarkMode ? 'text-zinc-400 group-hover:text-zinc-300' : 'text-zinc-500 group-hover:text-zinc-700'
                                                        }`} />
                                                        <span className={`flex-1 text-sm font-medium truncate ${
                                                            isDarkMode ? 'text-white group-hover:text-purple-300' : 'text-zinc-900 group-hover:text-purple-700'
                                                        }`}>
                                                            {input}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteAISearchInputFromCookie(input);
                                                                setCookieAISearchInputs(getAISearchInputsFromCookie());
                                                            }}
                                                            className={`p-1 rounded hover:bg-zinc-700 dark:hover:bg-zinc-700 transition-colors shrink-0 ${
                                                                isDarkMode ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-500 hover:text-red-600'
                                                            }`}
                                                            aria-label="검색어 삭제"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className={`text-center py-8 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                <p className="text-sm">AI 검색 이력이 없습니다.</p>
                                                <p className="text-xs mt-1">자연어로 원하는 집의 조건을 입력해보세요.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        )}
                    </div>
            </div>
        )}
      </div>

      {/* 최근 본 아파트 전체 삭제 확인 모달 */}
      <AlertDialog open={showDeleteAllRecentViewsDialog} onOpenChange={setShowDeleteAllRecentViewsDialog}>
        <AlertDialogContent 
          className={`${
            isDarkMode 
              ? 'bg-zinc-900 border-zinc-800 text-white shadow-black/50' 
              : 'bg-white border-zinc-200 text-zinc-900 shadow-black/20'
          }`}
        >
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isDarkMode ? 'bg-red-500/20' : 'bg-red-50'
              }`}>
                <Trash2 size={24} className={isDarkMode ? 'text-red-400' : 'text-red-600'} />
              </div>
            </div>
            <AlertDialogTitle className={`text-xl font-bold ${
              isDarkMode ? 'text-white' : 'text-zinc-900'
            }`}>
              최근 본 아파트 전체 삭제
            </AlertDialogTitle>
            <AlertDialogDescription className={`mt-2 ${
              isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
            }`}>
              모든 최근 본 아파트 기록을 삭제하시겠습니까?<br />
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
              onClick={handleDeleteAllRecentViews}
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

      {/* 다이나믹 아일랜드 토스트 */}
      {ToastComponent}

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

