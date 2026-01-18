import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, Search, ChevronRight, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, Building2, Flame, TrendingDown, X, MapPin, Trash2, Star } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';
import { useApartmentSearch } from '../hooks/useApartmentSearch';
import SearchResultsList from './ui/SearchResultsList';
import LocationSearchResults from './ui/LocationSearchResults';
import UnifiedSearchResults from './ui/UnifiedSearchResults';
import { ApartmentSearchResult, searchLocations, LocationSearchResult, getApartmentsByRegion } from '../lib/searchApi';
import { aiSearchApartments, AISearchApartmentResult, AISearchHistoryItem, saveAISearchHistory, getAISearchHistory } from '../lib/aiApi';
import AIChatMessages from './map/AIChatMessages';
import { useAuth } from '../lib/clerk';
import LocationBadge from './LocationBadge';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useDynamicIslandToast } from './ui/DynamicIslandToast';
import { getDashboardSummary, getDashboardRankings, getRegionalHeatmap, getRegionalTrends, PriceTrendData, VolumeTrendData, MonthlyTrendData, RegionalTrendData, TrendingApartment, RankingApartment, RegionalHeatmapItem, RegionalTrendItem, getPriceDistribution, getRegionalPriceCorrelation, PriceDistributionItem, RegionalCorrelationItem } from '../lib/dashboardApi';
import HistogramChart from './charts/HistogramChart';
import BubbleChart from './charts/BubbleChart';
import { getRecentViews, deleteRecentView, deleteAllRecentViews, RecentView } from '../lib/usersApi';
import { Clock } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

interface DashboardProps {
  onApartmentClick: (apartment: any) => void;
  onRegionSelect?: (region: LocationSearchResult) => void;
  onShowMoreSearch?: (query: string) => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

// 더미 데이터 제거 - 개발 중입니다로 대체

export default function Dashboard({ onApartmentClick, onRegionSelect, onShowMoreSearch, isDarkMode, isDesktop = false }: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAIMode, setIsAIMode] = useState(false);
  const [gradientAngle, setGradientAngle] = useState(90);
  const [gradientPosition, setGradientPosition] = useState({ x: 50, y: 50 });
  const [gradientSize, setGradientSize] = useState(150);
  const [rankingTab, setRankingTab] = useState<'sale' | 'jeonse'>('sale');
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationSearchResult | null>(null);
  const [regionApartments, setRegionApartments] = useState<ApartmentSearchResult[]>([]);
  const [isLoadingRegionApartments, setIsLoadingRegionApartments] = useState(false);
  
  // AI 검색 결과 상태
  const [aiResults, setAiResults] = useState<ApartmentSearchResult[]>([]);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [aiSearchHistory, setAiSearchHistory] = useState<AISearchHistoryItem[]>([]);
  const [forceSearchTrigger, setForceSearchTrigger] = useState(0);
  
  // 홈 검색창에서는 아파트 검색에서만 검색 기록 저장 (중복 방지)
  const { results, isSearching } = useApartmentSearch(searchQuery, true);
  const { isSignedIn, getToken } = useAuth();
  const { showSuccess, showError, ToastComponent } = useDynamicIslandToast(isDarkMode, 3000);

  // 대시보드 데이터 상태
  const [summaryData, setSummaryData] = useState<{
    price_trend: PriceTrendData[];
    volume_trend: VolumeTrendData[];
    monthly_trend: {
      national: MonthlyTrendData[];
      regional: RegionalTrendData[];
    };
  } | null>(null);
  const [rankingsData, setRankingsData] = useState<{
    trending: TrendingApartment[];
    rising: RankingApartment[];
    falling: RankingApartment[];
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  
  // 지역별 히트맵 및 추이 데이터 상태
  const [heatmapData, setHeatmapData] = useState<RegionalHeatmapItem[]>([]);
  const [regionalTrendsData, setRegionalTrendsData] = useState<RegionalTrendItem[]>([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [trendsLoading, setTrendsLoading] = useState(false);
  
  // 새로운 고급 차트 데이터 상태
  const [priceDistributionData, setPriceDistributionData] = useState<PriceDistributionItem[]>([]);
  const [correlationData, setCorrelationData] = useState<RegionalCorrelationItem[]>([]);
  const [advancedChartsLoading, setAdvancedChartsLoading] = useState(false);
  
  // 최근 본 아파트 상태
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [recentViewsLoading, setRecentViewsLoading] = useState(false);
  const [isRecentViewsExpanded, setIsRecentViewsExpanded] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  // AI 모드일 때 물 흐르듯한 그라데이션 애니메이션 (useRef로 최적화)
  const animationRef = React.useRef<number | null>(null);
  const startTimeRef = React.useRef<number>(Date.now());
  const gradientValuesRef = React.useRef({ angle: 90, x: 50, y: 50, size: 150 });
  const lastUpdateTimeRef = React.useRef<number>(0);
  
  useEffect(() => {
    if (!isAIMode) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    startTimeRef.current = Date.now();
    lastUpdateTimeRef.current = 0;

    const animate = () => {
      const now = Date.now();
      const elapsed = (now - startTimeRef.current) / 1000;
      
      // 프레임 레이트 제한 (초당 최대 60프레임)
      if (now - lastUpdateTimeRef.current < 16) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      
      const angle = 90 + Math.sin(elapsed * 0.3) * 45 + Math.cos(elapsed * 0.2) * 30;
      const radius = 30;
      const x = 50 + Math.sin(elapsed * 0.4) * radius;
      const y = 50 + Math.cos(elapsed * 0.35) * radius;
      const size = 150 + Math.sin(elapsed * 0.5) * 50;
      
      // 값이 충분히 변경되었을 때만 상태 업데이트 (성능 최적화)
      const threshold = 0.5;
      const shouldUpdate = 
        Math.abs(gradientValuesRef.current.angle - angle) > threshold ||
        Math.abs(gradientValuesRef.current.x - x) > threshold ||
        Math.abs(gradientValuesRef.current.y - y) > threshold ||
        Math.abs(gradientValuesRef.current.size - size) > threshold;
      
      if (shouldUpdate) {
        gradientValuesRef.current = { angle, x, y, size };
        // 배치 업데이트 (requestAnimationFrame 내에서 자동 배치됨)
        setGradientAngle(angle);
        setGradientPosition({ x, y });
        setGradientSize(size);
        lastUpdateTimeRef.current = now;
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isAIMode]);

  // AI 검색 히스토리 로드 (초기 로드 시에만)
  const [historyLoaded, setHistoryLoaded] = React.useState(false);
  
  useEffect(() => {
    if (isAIMode && !historyLoaded) {
      const history = getAISearchHistory();
      setAiSearchHistory(history);
      setHistoryLoaded(true);
    } else if (!isAIMode) {
      setHistoryLoaded(false);
    }
  }, [isAIMode, historyLoaded]);

  // AI 검색 실행 함수 (재사용 가능하도록 분리)
  const isSearchingRef = React.useRef(false);
  const lastSearchQueryRef = React.useRef<string>('');
  const lastErrorRef = React.useRef<string>('');
  const searchAbortControllerRef = React.useRef<AbortController | null>(null);
  
  const executeAISearch = React.useCallback(async (query: string) => {
    if (!isAIMode || query.length < 5) {
      setAiResults([]);
      setIsSearchingAI(false);
      isSearchingRef.current = false;
      return;
    }

    // 중복 요청 방지
    if (isSearchingRef.current) {
      // 이전 요청 취소
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
    }

    // 같은 쿼리면 스킵 (에러가 아닌 경우)
    if (lastSearchQueryRef.current === query.trim() && !lastErrorRef.current) {
      return;
    }

    isSearchingRef.current = true;
    lastSearchQueryRef.current = query.trim();
    lastErrorRef.current = '';
    
    // 새로운 AbortController 생성
    const abortController = new AbortController();
    searchAbortControllerRef.current = abortController;

    setIsSearchingAI(true);
    try {
      const response = await aiSearchApartments(query);
      
      // 요청이 취소되었는지 확인
      if (abortController.signal.aborted) {
        return;
      }
      
      // 시세 정보가 있는 아파트만 필터링
      const apartmentsWithPrice = response.data.apartments.filter((apt: AISearchApartmentResult) => 
        apt.average_price && apt.average_price > 0
      );
      
      const convertedResults: ApartmentSearchResult[] = apartmentsWithPrice.map((apt: AISearchApartmentResult) => ({
        apt_id: apt.apt_id,
        apt_name: apt.apt_name,
        address: apt.address,
        sigungu_name: apt.address.split(' ').slice(0, 2).join(' ') || '',
        location: apt.location,
        price: apt.average_price ? `${(apt.average_price / 10000).toFixed(1)}억원` : '정보 없음'
      }));
      
      // 검색 결과가 있으면 히스토리에 저장하고 결과 초기화 (히스토리에서 표시)
      if (convertedResults.length > 0) {
        setAiResults([]); // 히스토리에서 표시하므로 새 결과는 숨김
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
        setAiSearchHistory(prev => [historyItem, ...prev.filter(h => h.query !== query.trim())].slice(0, 10));
      } else {
        setAiResults([]);
        // 시세 정보가 없는 경우 에러 메시지 표시 (중복 방지)
        const errorMsg = '시세 정보가 있는 아파트를 찾을 수 없습니다.';
        if (lastErrorRef.current !== errorMsg) {
          lastErrorRef.current = errorMsg;
          showError(errorMsg);
        }
      }
    } catch (error: any) {
      // 요청이 취소된 경우 에러 처리하지 않음
      if (abortController.signal.aborted) {
        return;
      }
      
      console.error('Failed to search with AI:', error);
      setAiResults([]);
      let errorMessage = 'AI 검색에 실패했습니다.';
      const statusCode = error.response?.status;
      const errorCode = error.code;
      
      // 네트워크 에러 처리
      if (errorCode === 'ERR_NETWORK' || error.message === 'Network Error' || errorCode === 'ERR_INSUFFICIENT_RESOURCES') {
        errorMessage = '네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.';
      } else if (statusCode >= 400 && statusCode < 500) {
        if (statusCode === 400) errorMessage = '잘못된 검색 요청입니다.';
        else if (statusCode === 401) errorMessage = '인증이 필요합니다.';
        else if (statusCode === 403) errorMessage = '검색 권한이 없습니다.';
        else if (statusCode === 404) errorMessage = 'AI 검색 서비스를 찾을 수 없습니다.';
        else if (statusCode === 422) errorMessage = '검색어 형식이 올바르지 않습니다.';
        else if (statusCode === 429) errorMessage = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
        else errorMessage = error.response?.data?.detail || error.message || '검색 요청에 실패했습니다.';
      } else if (statusCode >= 500) {
        if (statusCode === 503) errorMessage = 'AI 검색 서비스가 일시적으로 사용할 수 없습니다.';
        else if (statusCode === 504) errorMessage = 'AI 검색 응답 시간이 초과되었습니다.';
        else errorMessage = 'AI 검색 서버에 문제가 발생했습니다.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // 같은 에러 메시지면 중복 표시하지 않음
      if (lastErrorRef.current !== errorMessage) {
        lastErrorRef.current = errorMessage;
        showError(errorMessage);
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsSearchingAI(false);
        isSearchingRef.current = false;
      }
    }
  }, [isAIMode, showError]);

  // AI 검색 실행 (AI 모드일 때만, 자동 검색) - 디바운싱 및 중복 방지
  useEffect(() => {
    // 이전 타이머 정리
    let timer: NodeJS.Timeout | null = null;
    
    if (isAIMode && searchQuery.length >= 5) {
      // 디바운싱 시간 증가 (500ms -> 800ms)
      timer = setTimeout(() => {
        // 중복 요청 방지 체크
        if (!isSearchingRef.current && lastSearchQueryRef.current !== searchQuery.trim()) {
          executeAISearch(searchQuery);
        }
      }, 800);
    } else if (isAIMode) {
      setAiResults([]);
      setIsSearchingAI(false);
      isSearchingRef.current = false;
      lastSearchQueryRef.current = '';
      lastErrorRef.current = '';
    }
    
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [searchQuery, isAIMode, executeAISearch]);

  // 강제 검색 트리거 (엔터 키 등) - 중복 방지
  useEffect(() => {
    if (forceSearchTrigger > 0 && isAIMode && searchQuery.length >= 5) {
      // 중복 요청 방지
      if (!isSearchingRef.current) {
        executeAISearch(searchQuery);
      }
    }
  }, [forceSearchTrigger, isAIMode, searchQuery, executeAISearch]);

  // 지역 검색 (AI 모드가 아닐 때만)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!isAIMode && searchQuery.length >= 1) {
        setIsSearchingLocations(true);
        try {
          const locations = await searchLocations(searchQuery, null);
          setLocationResults(locations);
        } catch (error) {
          console.error('Failed to search locations:', error);
          setLocationResults([]);
        } finally {
          setIsSearchingLocations(false);
        }
      } else {
        setLocationResults([]);
        if (selectedLocation) {
          setSelectedLocation(null);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedLocation, isAIMode]);

  // 선택된 지역의 아파트 조회
  useEffect(() => {
    const fetchRegionApartments = async () => {
      if (selectedLocation) {
        setIsLoadingRegionApartments(true);
        try {
          const apartments = await getApartmentsByRegion(selectedLocation.region_id, 50, 0);
          setRegionApartments(apartments);
        } catch (error) {
          console.error('Failed to fetch region apartments:', error);
          setRegionApartments([]);
        } finally {
          setIsLoadingRegionApartments(false);
        }
      } else {
        setRegionApartments([]);
      }
    };

    fetchRegionApartments();
  }, [selectedLocation]);
  
  // 대시보드 요약 데이터 로드
  useEffect(() => {
    const fetchSummary = async () => {
      console.log('🔄 [Dashboard Component] 요약 데이터 로드 시작 - rankingTab:', rankingTab);
      setSummaryLoading(true);
      try {
        const data = await getDashboardSummary(rankingTab, 6);
        console.log('✅ [Dashboard Component] 요약 데이터 로드 완료:', {
          priceTrendCount: data.price_trend?.length || 0,
          volumeTrendCount: data.volume_trend?.length || 0,
          nationalTrendCount: data.monthly_trend?.national?.length || 0,
          regionalTrendCount: data.monthly_trend?.regional?.length || 0,
          data
        });
        setSummaryData(data);
      } catch (error) {
        console.error('❌ [Dashboard Component] 요약 데이터 로드 실패:', error);
      } finally {
        setSummaryLoading(false);
      }
    };
    
    fetchSummary();
  }, [rankingTab]);
  
  // 대시보드 랭킹 데이터 로드
  useEffect(() => {
    const fetchRankings = async () => {
      console.log('🔄 [Dashboard Component] 랭킹 데이터 로드 시작 - rankingTab:', rankingTab);
      setRankingsLoading(true);
      try {
        const data = await getDashboardRankings(rankingTab, 7, 3);
        console.log('✅ [Dashboard Component] 랭킹 데이터 로드 완료:', {
          trendingCount: data.trending?.length || 0,
          risingCount: data.rising?.length || 0,
          fallingCount: data.falling?.length || 0,
          data
        });
        setRankingsData(data);
      } catch (error) {
        console.error('❌ [Dashboard Component] 랭킹 데이터 로드 실패:', error);
      } finally {
        setRankingsLoading(false);
      }
    };
    
    fetchRankings();
  }, [rankingTab]);
  
  // 지역별 히트맵 데이터 로드
  useEffect(() => {
    const fetchHeatmap = async () => {
      console.log('🔄 [Dashboard Component] 히트맵 데이터 로드 시작 - rankingTab:', rankingTab);
      setHeatmapLoading(true);
      try {
        const data = await getRegionalHeatmap(rankingTab, 3);
        console.log('✅ [Dashboard Component] 히트맵 데이터 로드 완료:', data);
        setHeatmapData(data);
      } catch (error) {
        console.error('❌ [Dashboard Component] 히트맵 데이터 로드 실패:', error);
      } finally {
        setHeatmapLoading(false);
      }
    };
    
    fetchHeatmap();
  }, [rankingTab]);
  
  // 지역별 추이 데이터 로드
  useEffect(() => {
    const fetchTrends = async () => {
      console.log('🔄 [Dashboard Component] 지역별 추이 데이터 로드 시작 - rankingTab:', rankingTab);
      setTrendsLoading(true);
      try {
        const data = await getRegionalTrends(rankingTab, 12);
        console.log('✅ [Dashboard Component] 지역별 추이 데이터 로드 완료:', data);
        setRegionalTrendsData(data);
      } catch (error) {
        console.error('❌ [Dashboard Component] 지역별 추이 데이터 로드 실패:', error);
      } finally {
        setTrendsLoading(false);
      }
    };
    
    fetchTrends();
  }, [rankingTab]);
  
  // 새로운 고급 차트 데이터 로드
  useEffect(() => {
    const fetchAdvancedCharts = async () => {
      setAdvancedChartsLoading(true);
      try {
        const [priceData, correlationData] = await Promise.all([
          getPriceDistribution(rankingTab),
          getRegionalPriceCorrelation(rankingTab, 3)
        ]);
        setPriceDistributionData(priceData);
        setCorrelationData(correlationData);
      } catch (error) {
        console.error('❌ [Dashboard Component] 고급 차트 데이터 로드 실패:', error);
      } finally {
        setAdvancedChartsLoading(false);
      }
    };
    
    fetchAdvancedCharts();
  }, [rankingTab]);
  
  // 최근 본 아파트 목록 로드
  useEffect(() => {
    const fetchRecentViews = async () => {
      if (!isSignedIn || !getToken) {
        setRecentViews([]);
        return;
      }
      
      setRecentViewsLoading(true);
      try {
        const token = await getToken();
        if (token) {
          const response = await getRecentViews(5, token);
          // 최대 5개까지만 유지 (가장 오래된 것부터 제거)
          const views = response.data.recent_views || [];
          setRecentViews(views.slice(0, 5));
        }
      } catch (error) {
        console.error('❌ [Dashboard Component] 최근 본 아파트 로드 실패:', error);
        setRecentViews([]);
      } finally {
        setRecentViewsLoading(false);
      }
    };
    
    fetchRecentViews();
  }, [isSignedIn, getToken]);

  const handleSelect = useCallback((apt: ApartmentSearchResult) => {
    onApartmentClick({
      name: apt.apt_name,
      price: apt.price,
      change: "0%", // Default value as API doesn't return this yet
      ...apt
    });
    setSearchQuery('');
    setSelectedLocation(null);
  }, [onApartmentClick]);

  const handleLocationSelect = useCallback((location: LocationSearchResult) => {
    if (onRegionSelect) {
      onRegionSelect(location);
    } else {
      setSelectedLocation(location);
      setSearchQuery(location.full_name);
    }
  }, [onRegionSelect]);

  const handleClearLocation = useCallback(() => {
    setSelectedLocation(null);
    setSearchQuery('');
    setRegionApartments([]);
  }, []);

  // 최근 본 아파트 전체 삭제 핸들러
  const handleDeleteAllRecentViews = useCallback(async (e?: React.MouseEvent) => {
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
      console.error('❌ [Dashboard Component] 최근 본 아파트 전체 삭제 실패:', error);
      showError('삭제 중 오류가 발생했습니다.');
    }
  }, [isSignedIn, getToken, recentViews.length, showSuccess, showError]);

  // 최근 본 아파트 개별 삭제 핸들러
  const handleDeleteRecentView = useCallback(async (e: React.MouseEvent, viewId: number) => {
    e.stopPropagation(); // 리스트 항목 클릭 방지
    if (!isSignedIn || !getToken) {
      return;
    }
    
    try {
      const token = await getToken();
      if (token) {
        await deleteRecentView(viewId, token);
        // 삭제 후 목록에서 제거
        setRecentViews(prev => prev.filter(view => view.view_id !== viewId));
      }
    } catch (error) {
      console.error('❌ [Dashboard Component] 최근 본 아파트 삭제 실패:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  }, [isSignedIn, getToken]);

  return (
    <motion.div 
      className={`w-full ${isDesktop ? 'space-y-6' : 'space-y-5'}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Current Location Badge */}
      <LocationBadge isDarkMode={isDarkMode} />

      {/* Selected Location Header */}
      {selectedLocation && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-4 rounded-2xl border overflow-hidden ${
            isDarkMode
              ? 'bg-zinc-900 border-zinc-800'
              : 'bg-white border-zinc-200'
          }`}
        >
          {/* 헤더 */}
          <div className={`p-5 pb-3 border-b ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                <div>
                  <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                    {selectedLocation.full_name.replace(/([가-힣])(\()/g, '$1 $2')}
                  </h3>
                  <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                    {isLoadingRegionApartments ? '아파트 조회 중...' : `${regionApartments.length}개의 아파트`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClearLocation}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
                    : 'hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Region Apartments List */}
      {selectedLocation && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 rounded-2xl border overflow-hidden ${
            isDarkMode
              ? 'bg-zinc-900 border-zinc-800'
              : 'bg-white border-zinc-200'
          }`}
        >
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
              {selectedLocation.full_name.replace(/([가-힣])(\()/g, '$1 $2')} 아파트 목록
            </h3>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoadingRegionApartments ? (
              <div className={`py-8 text-center ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                아파트 조회 중...
              </div>
            ) : regionApartments.length > 0 ? (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {regionApartments.map((apt) => (
                  <button
                    key={apt.apt_id}
                    onClick={() => handleSelect(apt)}
                    className={`w-full text-left p-4 transition-colors ${
                      isDarkMode
                        ? 'hover:bg-zinc-800'
                        : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 flex items-center gap-2">
                        <Building2 className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                            {apt.apt_name}
                          </p>
                          {apt.address && (
                            <p className={`text-sm mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                              {apt.address}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className={`ml-4 px-2 py-1 rounded-full text-xs font-medium ${
                        isDarkMode
                          ? 'bg-zinc-800 text-zinc-300'
                          : 'bg-zinc-100 text-zinc-700'
                      }`}>
                        아파트
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className={`py-8 text-center ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                해당 지역에 아파트가 없습니다.
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Search */}
      <div 
        className="relative mt-2 z-10"
      >
        <div className="relative" style={{ position: 'relative' }}>
          {/* AI 모드 그라데이션 배경 */}
          {isAIMode && (
            <>
              <div 
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: isDarkMode
                    ? 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.12) 0%, rgba(88, 28, 135, 0.08) 50%, transparent 100%)'
                    : 'radial-gradient(circle at 50% 50%, rgba(147, 197, 253, 0.25) 0%, rgba(196, 181, 253, 0.2) 50%, transparent 100%)',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
              <div 
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: isDarkMode
                    ? `radial-gradient(circle ${gradientSize}px at ${gradientPosition.x}% ${gradientPosition.y}%, rgba(59, 130, 246, 0.2) 0%, rgba(168, 85, 247, 0.25) 30%, rgba(59, 130, 246, 0.15) 60%, transparent 100%)`
                    : `radial-gradient(circle ${gradientSize}px at ${gradientPosition.x}% ${gradientPosition.y}%, rgba(96, 165, 250, 0.35) 0%, rgba(192, 132, 252, 0.4) 30%, rgba(96, 165, 250, 0.25) 60%, transparent 100%)`,
                  pointerEvents: 'none',
                  zIndex: 0,
                  transition: 'background 0.3s ease-out',
                }}
              />
            </>
          )}
          <div className="relative flex items-center gap-2" style={{ zIndex: 1 }}>
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${isAIMode ? 'text-purple-400' : 'text-zinc-400'}`} />
            <input
              type="text"
              placeholder={isAIMode ? "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처" : "아파트 이름, 지역 검색..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isAIMode && searchQuery.length >= 5) {
                  e.preventDefault();
                  // 엔터 키를 누르면 즉시 검색 시작
                  setForceSearchTrigger(prev => prev + 1);
                }
              }}
              className={`flex-1 pl-12 pr-4 py-3.5 rounded-2xl border transition-all ${
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
              onClick={() => {
                setIsAIMode(!isAIMode);
                if (!isAIMode) {
                  setGradientAngle(Math.floor(Math.random() * 360));
                  setAiResults([]);
                } else {
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
                backgroundSize: '200% 200%',
                animation: 'skyPurpleGradient 6s ease-in-out infinite',
              } : undefined}
            >
              AI
            </button>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`p-1.5 rounded-full shrink-0 transition-colors ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search Results Dropdown */}
        {(searchQuery.length >= 1 || isSearching || isSearchingLocations || isSearchingAI) && (
          <div className={`absolute top-full left-0 right-0 mt-2 rounded-2xl border shadow-xl overflow-hidden z-[100] max-h-[60vh] overflow-y-auto ${
            isDarkMode 
              ? 'bg-zinc-900 border-zinc-800' 
              : 'bg-white border-zinc-200'
          }`}>
            <div className="p-4">
              <AnimatePresence mode="wait">
                {isAIMode ? (
                  <motion.div
                    key="ai-mode"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: 0.25 }}
                    className="flex flex-col gap-4"
                  >
                    {isSearchingAI && searchQuery.length >= 5 && (
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-center">
                          <div className="flex flex-col items-center gap-1 w-full max-w-full">
                            <div className={`px-4 py-2.5 rounded-2xl w-full overflow-x-auto relative border ${
                              isDarkMode 
                                ? 'border-purple-400/50 text-white' 
                                : 'border-purple-500/50 text-white'
                            }`} style={{ backgroundColor: '#5B66C9' }}>
                              <p className="text-sm font-medium text-center whitespace-nowrap">
                                {searchQuery}
                              </p>
                            </div>
                            <span className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                              방금
                            </span>
                          </div>
                        </div>
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
                    {searchQuery.length >= 5 && (
                      <AIChatMessages
                        history={aiSearchHistory.filter(item => 
                          item.query.toLowerCase() === searchQuery.toLowerCase().trim()
                        )}
                        isDarkMode={isDarkMode}
                        onApartmentSelect={(apt) => handleSelect(apt)}
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
                    {false && !isSearchingAI && aiResults.length > 0 && searchQuery.length >= 5 && aiSearchHistory.filter(item => 
                      item.query.toLowerCase() === searchQuery.toLowerCase().trim()
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
                      query={searchQuery}
                      isSearchingApartments={isSearching}
                      isSearchingLocations={isSearchingLocations}
                      showMoreButton={true}
                      onShowMore={() => {
                        if (onShowMoreSearch) {
                          onShowMoreSearch(searchQuery);
                        }
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
      {ToastComponent}

      {/* 최근 본 아파트 섹션 */}
      {isSignedIn && recentViews.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border overflow-hidden ${
            isDarkMode
              ? 'bg-zinc-900 border-zinc-800'
              : 'bg-white border-zinc-200'
          }`}
        >
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between w-full">
              <button
                onClick={() => setIsRecentViewsExpanded(!isRecentViewsExpanded)}
                className="flex items-center gap-2 flex-1 group"
              >
                <Clock className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  최근 본 아파트
                </h3>
                {recentViews.length > 0 && (
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    isDarkMode 
                      ? 'bg-zinc-800 text-zinc-400' 
                      : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    {recentViews.length}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-2">
                {recentViews.length > 0 && (
                  <button
                    onClick={handleDeleteAllRecentViews}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isDarkMode
                        ? 'hover:bg-zinc-800 text-zinc-400 hover:text-red-400'
                        : 'hover:bg-zinc-100 text-zinc-500 hover:text-red-600'
                    }`}
                    title="모든 기록 삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsRecentViewsExpanded(!isRecentViewsExpanded)}
                  className="transition-transform duration-200"
                >
                  {isRecentViewsExpanded ? (
                    <ChevronUp 
                      className={`w-5 h-5 transition-colors ${
                        isDarkMode 
                          ? 'text-zinc-400 hover:text-white' 
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`} 
                    />
                  ) : (
                    <ChevronDown 
                      className={`w-5 h-5 transition-colors ${
                        isDarkMode 
                          ? 'text-zinc-400 hover:text-white' 
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`} 
                    />
                  )}
                </button>
              </div>
            </div>
          </div>
          <AnimatePresence>
            {isRecentViewsExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="max-h-[360px] overflow-y-auto">
                  {recentViewsLoading ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`py-8 text-center ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}
                    >
                      <div className="inline-block w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="mt-2 text-sm">최근 본 아파트를 불러오는 중...</p>
                    </motion.div>
                  ) : recentViews.length > 0 ? (
                    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      <AnimatePresence mode="popLayout">
                        {recentViews.map((view, index) => (
                          <motion.div
                            key={view.view_id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ 
                              duration: 0.2,
                              delay: index * 0.03,
                              ease: "easeOut"
                            }}
                            className={`w-full p-3 transition-colors ${
                              isDarkMode
                                ? 'hover:bg-zinc-800'
                                : 'hover:bg-zinc-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <motion.button
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                                onClick={() => {
                                  if (view.apartment) {
                                    handleSelect({
                                      apt_id: view.apartment.apt_id,
                                      apt_name: view.apartment.apt_name,
                                      address: view.apartment.region_name 
                                        ? `${view.apartment.city_name || ''} ${view.apartment.region_name || ''}`.trim()
                                        : '',
                                      sigungu_name: view.apartment.region_name || '',
                                      location: { lat: 0, lng: 0 },
                                      price: '',
                                    });
                                  }
                                }}
                                className="flex items-center gap-3 flex-1 min-w-0 text-left"
                              >
                                <Building2 className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                                <span className={`font-bold truncate text-sm ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                                  {view.apartment?.apt_name || '알 수 없음'}
                                </span>
                                {view.apartment?.region_name && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`} />
                                    <span className={`text-xs truncate ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                      {view.apartment.city_name && `${view.apartment.city_name} `}
                                      {view.apartment.region_name}
                                    </span>
                                  </div>
                                )}
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => handleDeleteRecentView(e, view.view_id)}
                                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                                  isDarkMode
                                    ? 'hover:bg-zinc-700 text-zinc-400 hover:text-red-400'
                                    : 'hover:bg-zinc-100 text-zinc-500 hover:text-red-600'
                                }`}
                                title="삭제"
                              >
                                <X className="w-4 h-4" />
                              </motion.button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`py-8 text-center ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}
                    >
                      <Clock className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`} />
                      <p className="text-sm">최근 본 아파트가 없습니다.</p>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        아파트 상세 페이지를 방문하면 여기에 표시됩니다.
                      </p>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* 최근 본 아파트 전체 삭제 확인 모달 */}
      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent 
          className={`${
            isDarkMode 
              ? 'bg-zinc-900 border-zinc-800 text-white shadow-black/50' 
              : 'bg-white border-zinc-200 text-zinc-900 shadow-black/20'
          }`}
          style={{ zIndex: 999999 }}
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

      {/* 데스크톱: 첫 번째 줄 - 2컬럼 그리드 */}
      {isDesktop ? (
        <div className="grid grid-cols-2 gap-8">
          {/* 전국 평당가 및 거래량 추이 */}
          <div 
            className={`rounded-2xl p-6 ${
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}
          >
            <div className="flex items-end justify-between mb-4">
              <div>
                <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  전국 평당가 & 거래량 추이
                </h3>
                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                  최근 6개월 변동 현황
                </p>
              </div>
            </div>
            {summaryLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : summaryData && (summaryData.price_trend.length > 0 || summaryData.volume_trend.length > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={summaryData.price_trend}>
                  <defs>
                    <linearGradient id="colorPriceDesktop" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#3f3f46' : '#e4e4e7'} />
                  <XAxis 
                    dataKey="month" 
                    stroke={isDarkMode ? '#a1a1aa' : '#71717a'}
                    tick={{ fill: isDarkMode ? '#a1a1aa' : '#71717a', fontSize: 12 }}
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke={isDarkMode ? '#a1a1aa' : '#71717a'}
                    tick={{ fill: isDarkMode ? '#a1a1aa' : '#71717a', fontSize: 12 }}
                    label={{ value: '평당가 (만원)', angle: -90, position: 'insideLeft', fill: isDarkMode ? '#a1a1aa' : '#71717a' }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke={isDarkMode ? '#a1a1aa' : '#71717a'}
                    tick={{ fill: isDarkMode ? '#a1a1aa' : '#71717a', fontSize: 12 }}
                    label={{ value: '거래량 (건)', angle: 90, position: 'insideRight', fill: isDarkMode ? '#a1a1aa' : '#71717a' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
                      border: `1px solid ${isDarkMode ? '#3f3f46' : '#e4e4e7'}`,
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: isDarkMode ? '#ffffff' : '#18181b' }}
                  />
                  <Legend />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="avg_price_per_pyeong" 
                    name="평당가 (만원)"
                    stroke="#3b82f6" 
                    fillOpacity={1}
                    fill="url(#colorPriceDesktop)"
                    strokeWidth={2}
                  />
                  <Bar 
                    yAxisId="right"
                    dataKey="transaction_count" 
                    name="거래량 (건)"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <DevelopmentPlaceholder 
                title="데이터 없음"
                message="전국 평당가 및 거래량 추이 데이터가 없습니다."
                isDarkMode={isDarkMode}
              />
            )}
          </div>

          {/* 지역별 가격 상승률 TOP 5 */}
          <div 
            className={`rounded-2xl overflow-hidden ${
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}
          >
            <div className="p-6 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-red-500" />
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  지역별 가격 상승률 TOP 5
                </h3>
              </div>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                최근 3개월 기준 (도/특별시/광역시)
              </p>
            </div>
            {heatmapLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : heatmapData.length > 0 ? (
              <div className="px-6 pb-6">
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {heatmapData.slice(0, 5).map((item, index) => (
                    <div
                      key={item.region}
                      className={`py-3 transition-colors ${
                        isDarkMode ? 'text-white' : 'text-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="flex-shrink-0 w-6 text-sm font-bold text-white">
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-semibold text-sm truncate ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                              {item.region}
                            </h4>
                            <p className={`text-xs truncate mt-0.5 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                              {item.avg_price_per_pyeong.toLocaleString()}만원/평 · {item.transaction_count}건
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-base font-bold ${item.change_rate >= 0 ? 'text-red-500' : 'text-red-500'}`}>
                            {item.change_rate >= 0 ? '+' : ''}{item.change_rate.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <DevelopmentPlaceholder 
                title="데이터 없음"
                message="지역별 상승률 데이터가 없습니다."
                isDarkMode={isDarkMode}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 모바일: 기존 세로 레이아웃 */}
          {/* 전국 평당가 및 거래량 추이 */}
          <div 
            className={`rounded-2xl p-5 ${
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}
          >
            <div className="flex items-end justify-between mb-4">
              <div>
                <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  전국 평당가 & 거래량 추이
                </h3>
                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                  최근 6개월 변동 현황
                </p>
              </div>
            </div>
            {summaryLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : summaryData && (summaryData.price_trend.length > 0 || summaryData.volume_trend.length > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={summaryData.price_trend}>
                  <defs>
                    <linearGradient id="colorPriceMobile" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#3f3f46' : '#e4e4e7'} />
                  <XAxis 
                    dataKey="month" 
                    stroke={isDarkMode ? '#a1a1aa' : '#71717a'}
                    tick={{ fill: isDarkMode ? '#a1a1aa' : '#71717a', fontSize: 10 }}
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke={isDarkMode ? '#a1a1aa' : '#71717a'}
                    tick={{ fill: isDarkMode ? '#a1a1aa' : '#71717a', fontSize: 10 }}
                    label={{ value: '평당가 (만원)', angle: -90, position: 'insideLeft', fill: isDarkMode ? '#a1a1aa' : '#71717a', style: { fontSize: '10px' } }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke={isDarkMode ? '#a1a1aa' : '#71717a'}
                    tick={{ fill: isDarkMode ? '#a1a1aa' : '#71717a', fontSize: 10 }}
                    label={{ value: '거래량 (건)', angle: 90, position: 'insideRight', fill: isDarkMode ? '#a1a1aa' : '#71717a', style: { fontSize: '10px' } }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
                      border: `1px solid ${isDarkMode ? '#3f3f46' : '#e4e4e7'}`,
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    labelStyle={{ color: isDarkMode ? '#ffffff' : '#18181b' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="avg_price_per_pyeong" 
                    name="평당가 (만원)"
                    stroke="#3b82f6" 
                    fillOpacity={1}
                    fill="url(#colorPriceMobile)"
                    strokeWidth={2}
                  />
                  <Bar 
                    yAxisId="right"
                    dataKey="transaction_count" 
                    name="거래량 (건)"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <DevelopmentPlaceholder 
                title="데이터 없음"
                message="전국 평당가 및 거래량 추이 데이터가 없습니다."
                isDarkMode={isDarkMode}
              />
            )}
          </div>

          {/* 지역별 가격 상승률 TOP 5 */}
          <div 
            className={`rounded-2xl overflow-hidden ${
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}
          >
            <div className="p-5 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-red-500" />
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  지역별 가격 상승률 TOP 5
                </h3>
              </div>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                최근 3개월 기준 (도/특별시/광역시)
              </p>
            </div>
            {heatmapLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : heatmapData.length > 0 ? (
              <div className="px-5 pb-5">
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {heatmapData.slice(0, 5).map((item, index) => (
                    <div
                      key={item.region}
                      className={`py-2.5 transition-colors ${
                        isDarkMode ? 'text-white' : 'text-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className={`flex-shrink-0 w-5 text-xs font-bold ${
                            index < 3
                              ? 'text-blue-500'
                              : isDarkMode
                              ? 'text-zinc-400'
                              : 'text-zinc-500'
                          }`}>
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-semibold text-xs truncate ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                              {item.region}
                            </h4>
                            <p className={`text-xs truncate mt-0.5 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                              {item.avg_price_per_pyeong.toLocaleString()}만원/평 · {item.transaction_count}건
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-sm font-bold ${item.change_rate >= 0 ? 'text-red-500' : 'text-red-500'}`}>
                            {item.change_rate >= 0 ? '+' : ''}{item.change_rate.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <DevelopmentPlaceholder 
                title="데이터 없음"
                message="지역별 상승률 데이터가 없습니다."
                isDarkMode={isDarkMode}
              />
            )}
          </div>
        </>
      )}

      {/* 데스크톱: 두 번째 줄 - 탭과 상승/하락을 12컬럼 그리드로 */}
      {isDesktop ? (
        <div className="grid grid-cols-12 gap-8">
          {/* 매매/전세 탭 - 가로 배치 */}
          <div className={`col-span-3 flex flex-row gap-2 p-1.5 rounded-2xl ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
            <button
              onClick={() => setRankingTab('sale')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                rankingTab === 'sale'
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                  : isDarkMode
                  ? 'text-zinc-400 hover:text-white'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              매매
            </button>
            <button
              onClick={() => setRankingTab('jeonse')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                rankingTab === 'jeonse'
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                  : isDarkMode
                  ? 'text-zinc-400 hover:text-white'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              전세
            </button>
          </div>

          {/* 최고 상승/하락 TOP 5 */}
          <div 
            key={rankingTab}
            className="col-span-9 grid grid-cols-2 gap-8"
          >
            {/* 상승 TOP 5 */}
            <div className={`rounded-2xl overflow-hidden ${ 
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}>
              <div className="p-5 pb-3">
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-red-500" />
                  <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                    상승 TOP 5
                  </h3>
                </div>
              </div>
              {rankingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : rankingsData && rankingsData.rising.length > 0 ? (
                <div className="px-5 pb-5">
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {rankingsData.rising.map((apt, index) => (
                      <button
                        key={apt.apt_id}
                        onClick={() => onApartmentClick({
                          apt_id: apt.apt_id,
                          name: apt.apt_name,
                          location: apt.region,
                          price: `${apt.recent_avg.toLocaleString()}만원/평`,
                          change: `+${apt.change_rate.toFixed(2)}%`,
                        })}
                        className={`w-full py-2.5 px-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                          isDarkMode ? 'text-white' : 'text-zinc-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`flex-shrink-0 w-5 text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                              {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <h4 className={`font-semibold text-xs truncate ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                                {apt.apt_name}
                              </h4>
                              <p className={`text-xs truncate ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                {apt.region}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className={`text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                              +{apt.change_rate.toFixed(2)}%
                            </div>
                            <div className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                              {apt.recent_avg.toLocaleString()}만원/평
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <DevelopmentPlaceholder 
                  title="데이터 없음"
                  message={`${rankingTab === 'sale' ? '매매' : '전세'} 상승 랭킹 데이터가 없습니다.`}
                  isDarkMode={isDarkMode}
                />
              )}
            </div>

            {/* 하락 TOP 5 */}
            <div className={`rounded-2xl overflow-hidden ${ 
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}>
              <div className="p-5 pb-3">
                <div className="flex items-center gap-1.5">
                  <ArrowDownRight className="w-4 h-4 text-blue-500" />
                  <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                    하락 TOP 5
                  </h3>
                </div>
              </div>
              {rankingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-3 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : rankingsData && rankingsData.falling.length > 0 ? (
                <div className="px-5 pb-5">
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {rankingsData.falling.map((apt, index) => (
                      <button
                        key={apt.apt_id}
                        onClick={() => onApartmentClick({
                          apt_id: apt.apt_id,
                          name: apt.apt_name,
                          location: apt.region,
                          price: `${apt.recent_avg.toLocaleString()}만원/평`,
                          change: `${apt.change_rate.toFixed(2)}%`,
                        })}
                        className={`w-full py-2.5 px-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                          isDarkMode ? 'text-white' : 'text-zinc-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`flex-shrink-0 w-5 text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                              {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <h4 className={`font-semibold text-xs truncate ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                                {apt.apt_name}
                              </h4>
                              <p className={`text-xs truncate ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                {apt.region}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className={`text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                              {apt.change_rate.toFixed(2)}%
                            </div>
                            <div className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                              {apt.recent_avg.toLocaleString()}만원/평
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <DevelopmentPlaceholder 
                  title="데이터 없음"
                  message={`${rankingTab === 'sale' ? '매매' : '전세'} 하락 랭킹 데이터가 없습니다.`}
                  isDarkMode={isDarkMode}
                />
              )}
        </div>
      </div>
        </div>
      ) : (
        <>
          {/* 모바일: 기존 레이아웃 */}
          {/* 매매/전세 탭 */}
          <div className={`flex gap-2 p-1.5 rounded-2xl ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
            <button
              onClick={() => setRankingTab('sale')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                rankingTab === 'sale'
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                  : isDarkMode
                  ? 'text-zinc-400 hover:text-white'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              매매
            </button>
            <button
              onClick={() => setRankingTab('jeonse')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                rankingTab === 'jeonse'
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                  : isDarkMode
                  ? 'text-zinc-400 hover:text-white'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              전세
            </button>
          </div>

          {/* 최고 상승/하락 TOP 5 */}
          <div 
            key={rankingTab}
            className="grid grid-cols-2 gap-3"
          >
            {/* 상승 TOP 5 */}
            <div className={`rounded-2xl overflow-hidden ${ 
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}>
              <div className="p-4 pb-3">
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-red-500" />
                  <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                    상승 TOP 5
                  </h3>
                </div>
              </div>
              {rankingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : rankingsData && rankingsData.rising.length > 0 ? (
                <div className="px-4 pb-4">
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {rankingsData.rising.map((apt, index) => (
                      <button
                        key={apt.apt_id}
                        onClick={() => onApartmentClick({
                          apt_id: apt.apt_id,
                          name: apt.apt_name,
                          location: apt.region,
                          price: `${apt.recent_avg.toLocaleString()}만원/평`,
                          change: `+${apt.change_rate.toFixed(2)}%`,
                        })}
                        className={`w-full py-2 px-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                          isDarkMode ? 'text-white' : 'text-zinc-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`flex-shrink-0 w-4 text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                              {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <h4 className={`font-semibold text-xs truncate ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                                {apt.apt_name}
                              </h4>
                              <p className={`text-xs truncate ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                {apt.region}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className={`text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                              +{apt.change_rate.toFixed(2)}%
                            </div>
                            <div className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                              {apt.recent_avg.toLocaleString()}만원/평
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <DevelopmentPlaceholder 
                  title="데이터 없음"
                  message={`${rankingTab === 'sale' ? '매매' : '전세'} 상승 랭킹 데이터가 없습니다.`}
                  isDarkMode={isDarkMode}
                />
              )}
            </div>

            {/* 하락 TOP 5 */}
            <div className={`rounded-2xl overflow-hidden ${ 
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}>
              <div className="p-4 pb-3">
                <div className="flex items-center gap-1.5">
                  <ArrowDownRight className="w-4 h-4 text-blue-500" />
                  <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                    하락 TOP 5
                  </h3>
                </div>
              </div>
              {rankingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-3 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : rankingsData && rankingsData.falling.length > 0 ? (
                <div className="px-4 pb-4">
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {rankingsData.falling.map((apt, index) => (
                      <button
                        key={apt.apt_id}
                        onClick={() => onApartmentClick({
                          apt_id: apt.apt_id,
                          name: apt.apt_name,
                          location: apt.region,
                          price: `${apt.recent_avg.toLocaleString()}만원/평`,
                          change: `${apt.change_rate.toFixed(2)}%`,
                        })}
                        className={`w-full py-2 px-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                          isDarkMode ? 'text-white' : 'text-zinc-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`flex-shrink-0 w-4 text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                              {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <h4 className={`font-semibold text-xs truncate ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                                {apt.apt_name}
                              </h4>
                              <p className={`text-xs truncate ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                {apt.region}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className={`text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                              {apt.change_rate.toFixed(2)}%
                            </div>
                            <div className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                              {apt.recent_avg.toLocaleString()}만원/평
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <DevelopmentPlaceholder 
                  title="데이터 없음"
                  message={`${rankingTab === 'sale' ? '매매' : '전세'} 하락 랭킹 데이터가 없습니다.`}
                  isDarkMode={isDarkMode}
                />
              )}
        </div>
      </div>
        </>
      )}

      {/* 지역별 집값 변화 추이 (도/특별시/광역시 비교) */}
      <div 
        className={`rounded-2xl ${isDesktop ? 'p-8' : 'p-6'} ${
          isDarkMode 
            ? '' 
            : 'bg-white'
        }`}
      >
        <div className="mb-5">
          <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
            지역별 집값 변화 추이
          </h3>
          <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
            도/특별시/광역시별 비교 (1년 전부터 오늘까지)
          </p>
        </div>
        {trendsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : regionalTrendsData.length > 0 ? (
          <ResponsiveContainer width="100%" height={isDesktop ? 400 : 300}>
            <LineChart>
              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#3f3f46' : '#e4e4e7'} />
              <XAxis 
                dataKey="month" 
                type="category"
                stroke={isDarkMode ? '#a1a1aa' : '#71717a'}
                tick={{ fill: isDarkMode ? '#a1a1aa' : '#71717a', fontSize: 12 }}
                allowDuplicatedCategory={false}
              />
              <YAxis 
                stroke={isDarkMode ? '#a1a1aa' : '#71717a'}
                tick={{ fill: isDarkMode ? '#a1a1aa' : '#71717a', fontSize: 12 }}
                label={{ value: '평당가 (만원)', angle: -90, position: 'insideLeft', fill: isDarkMode ? '#a1a1aa' : '#71717a' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
                  border: `1px solid ${isDarkMode ? '#3f3f46' : '#e4e4e7'}`,
                  borderRadius: '8px'
                }}
                labelStyle={{ color: isDarkMode ? '#ffffff' : '#18181b' }}
                formatter={(value: number) => [`${value?.toLocaleString() || 0}만원/평`, '평당가']}
              />
              <Legend />
              {(() => {
                // 모든 지역의 데이터를 통합하여 공통 월 리스트 생성
                const allMonths = new Set<string>();
                regionalTrendsData.forEach(region => {
                  region.data.forEach(item => allMonths.add(item.month));
                });
                
                // 월별로 정렬 (1년 전부터 오늘까지)
                const sortedMonths = Array.from(allMonths).sort((a, b) => {
                  const dateA = new Date(a + '-01');
                  const dateB = new Date(b + '-01');
                  return dateA.getTime() - dateB.getTime();
                });
                
                // 각 지역별로 데이터를 월별로 정렬하고, 공통 월 리스트에 맞춰 데이터 생성
                const chartData = sortedMonths.map(month => {
                  const dataPoint: any = { month };
                  regionalTrendsData.forEach(region => {
                    const regionData = region.data.find(d => d.month === month);
                    const regionKey = region.region.replace(/\s+/g, '_');
                    dataPoint[regionKey] = regionData?.avg_price_per_pyeong || null;
                  });
                  return dataPoint;
                });
                
                // 파스텔톤 색상 팔레트 (밝고 가독성 좋은 다양한 색상)
                const pastelColors = [
                  '#FFB6C1', // 연한 핑크
                  '#87CEEB', // 하늘색
                  '#98D8C8', // 민트
                  '#F7DC6F', // 연한 노랑
                  '#BB8FCE', // 연한 보라
                  '#85C1E2', // 연한 파랑
                  '#F8B88B', // 연한 주황
                  '#AED6F1', // 연한 하늘색
                  '#D5A6BD', // 연한 장미색
                  '#A9DFBF', // 연한 초록
                  '#F9E79F', // 연한 노랑
                  '#D7BDE2', // 연한 라벤더
                ];
                
                return (
                  <>
                    {regionalTrendsData.map((region, index) => {
                      const color = pastelColors[index % pastelColors.length];
                      const regionKey = region.region.replace(/\s+/g, '_');
                      
                      return (
                        <Line 
                          key={region.region}
                          type="monotone" 
                          dataKey={regionKey}
                          name={region.region}
                          data={chartData}
                          stroke={color}
                          strokeWidth={2.5}
                          dot={{ fill: color, r: 4 }}
                          activeDot={{ r: 6 }}
                          connectNulls={false}
                        />
                      );
                    })}
                  </>
                );
              })()}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <DevelopmentPlaceholder 
            title="데이터 없음"
            message="지역별 집값 변화 추이 데이터가 없습니다."
            isDarkMode={isDarkMode}
          />
        )}
      </div>
      
      {/* 새로운 고급 차트 섹션 */}
      <div className="space-y-6 mt-8">
        <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
          고급 분석 차트
        </h2>
        
        {/* 1. 가격대별 아파트 분포 (히스토그램) */}
        <div className={`rounded-2xl overflow-hidden ${
          isDarkMode ? '' : 'bg-white/80'
        }`}>
          <div className="p-6 pb-3">
            <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
              가격대별 아파트 분포
            </h3>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
              HighChart 히스토그램으로 시각화
            </p>
          </div>
          {advancedChartsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : priceDistributionData.length > 0 ? (
            <div className="px-6 pb-6">
              <HistogramChart data={priceDistributionData} isDarkMode={isDarkMode} />
            </div>
          ) : (
            <DevelopmentPlaceholder 
              title="데이터 없음"
              message="가격 분포 데이터가 없습니다."
              isDarkMode={isDarkMode}
            />
          )}
        </div>
        
        {/* 2. 지역별 가격 상관관계 (버블 차트) */}
        <div className={`rounded-2xl overflow-hidden ${
          isDarkMode ? '' : 'bg-white/80'
        }`}>
          <div className="p-6 pb-3">
            <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
              지역별 가격 상관관계
            </h3>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
              HighChart 버블 차트로 시각화 (가격 vs 거래량, 버블 크기 = 상승률)
            </p>
          </div>
          {advancedChartsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : correlationData.length > 0 ? (
            <div className="px-6 pb-6">
              <BubbleChart data={correlationData} isDarkMode={isDarkMode} />
            </div>
          ) : (
            <DevelopmentPlaceholder 
              title="데이터 없음"
              message="가격 상관관계 데이터가 없습니다."
              isDarkMode={isDarkMode}
            />
          )}
        </div>
      </div>
      {ToastComponent}
      
      <style>{`
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
    </motion.div>
  );
}