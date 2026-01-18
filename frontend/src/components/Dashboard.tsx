import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { TrendingUp, Search, ChevronRight, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, Building2, Flame, TrendingDown, X, MapPin, Trash2, Star, Info, Filter } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';
import { useApartmentSearch } from '../hooks/useApartmentSearch';
import SearchResultsList from './ui/SearchResultsList';
import LocationSearchResults from './ui/LocationSearchResults';
import UnifiedSearchResults from './ui/UnifiedSearchResults';
import { ApartmentSearchResult, searchLocations, LocationSearchResult, getApartmentsByRegion } from '../lib/searchApi';
import { aiSearchApartments, AISearchApartmentResult, AISearchHistoryItem, saveAISearchHistory, getAISearchHistory, clearAISearchHistory } from '../lib/aiApi';
import AIChatMessages from './map/AIChatMessages';
import { useAuth } from '../lib/clerk';
import LocationBadge from './LocationBadge';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useDynamicIslandToast } from './ui/DynamicIslandToast';
import { getDashboardSummary, getDashboardRankings, getDashboardRankingsRegion, getRegionalHeatmap, getRegionalTrends, PriceTrendData, VolumeTrendData, MonthlyTrendData, RegionalTrendData, TrendingApartment, RankingApartment, RegionalHeatmapItem, RegionalTrendItem, getPriceDistribution, getRegionalPriceCorrelation, PriceDistributionItem, RegionalCorrelationItem } from '../lib/dashboardApi';
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
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const infoButtonRef = React.useRef<HTMLButtonElement>(null);
  
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
  
  // 지역별 랭킹 데이터 상태
  const [regionalRankingsData, setRegionalRankingsData] = useState<{
    trending: TrendingApartment[];
    rising: RankingApartment[];
    falling: RankingApartment[];
  } | null>(null);
  const [regionalRankingsLoading, setRegionalRankingsLoading] = useState(false);
  const [rankingType, setRankingType] = useState<'trending' | 'rising' | 'falling'>('trending');
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);
  const [lastChangeRateType, setLastChangeRateType] = useState<'rising' | 'falling'>('rising');
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>('전국');
  const [showRegionFilterDropdown, setShowRegionFilterDropdown] = useState(false);
  
  // 시장 동향 데이터 상태
  const [marketTrendsSale, setMarketTrendsSale] = useState<RegionalTrendItem[]>([]);
  const [marketTrendsJeonse, setMarketTrendsJeonse] = useState<RegionalTrendItem[]>([]);
  const [marketTrendsLoading, setMarketTrendsLoading] = useState(false);
  const [selectedMarketRegion, setSelectedMarketRegion] = useState<string>('전국');
  const [showMarketRegionFilterDropdown, setShowMarketRegionFilterDropdown] = useState(false);
  
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
      
      // 왼쪽에서 오른쪽으로 흐르는 그라데이션 위치 (0% ~ 100%)
      // 부드럽게 왕복하도록 사인파 사용
      const x = 50 + Math.sin(elapsed * 0.5) * 50; // 0% ~ 100% 사이를 부드럽게 이동
      
      // 값이 충분히 변경되었을 때만 상태 업데이트 (성능 최적화)
      const threshold = 0.5;
      const shouldUpdate = Math.abs(gradientValuesRef.current.x - x) > threshold;
      
      if (shouldUpdate) {
        gradientValuesRef.current = { angle: 90, x, y: 50, size: 150 };
        // 배치 업데이트 (requestAnimationFrame 내에서 자동 배치됨)
        setGradientPosition({ x, y: 50 });
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
  const lastRequestTimeRef = React.useRef<number>(0); // 마지막 요청 시간 추적
  
  const executeAISearch = React.useCallback(async (query: string) => {
    if (!isAIMode || query.length < 5) {
      setAiResults([]);
      setIsSearchingAI(false);
      isSearchingRef.current = false;
      return;
    }

    // 에러 발생 후 2초 제한 체크
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimeRef.current;
    if (lastErrorRef.current && timeSinceLastRequest < 2000) {
      // 2초가 지나지 않았으면 요청 차단
      const remainingTime = Math.ceil((2000 - timeSinceLastRequest) / 1000);
      console.log(`요청 제한: ${remainingTime}초 후 다시 시도할 수 있습니다.`);
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

    // 요청 시간 기록
    lastRequestTimeRef.current = now;

    isSearchingRef.current = true;
    lastSearchQueryRef.current = query.trim();
    lastErrorRef.current = ''; // 성공 시 에러 상태 초기화
    
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
      
      // 성공 시 에러 상태 초기화
      lastErrorRef.current = '';
      
      // 검색 조건 확인
      const criteria = response.data.criteria;
      const hasJeonseCondition = (criteria.min_deposit !== null && criteria.min_deposit !== undefined) || 
                                  (criteria.max_deposit !== null && criteria.max_deposit !== undefined);
      const hasMonthlyRentCondition = (criteria.min_monthly_rent !== null && criteria.min_monthly_rent !== undefined) || 
                                       (criteria.max_monthly_rent !== null && criteria.max_monthly_rent !== undefined);
      const hasSaleCondition = (criteria.min_price !== null && criteria.min_price !== undefined) || 
                               (criteria.max_price !== null && criteria.max_price !== undefined);
      
      // 시세 정보가 있는 아파트만 필터링 (검색 조건에 따라 적절한 시세 정보 체크)
      const apartmentsWithPrice = response.data.apartments.filter((apt: AISearchApartmentResult) => {
        // 전세 조건이 있으면 전세 정보 체크
        if (hasJeonseCondition) {
          return apt.average_deposit !== null && apt.average_deposit !== undefined && apt.average_deposit > 0;
        }
        // 월세 조건이 있으면 월세 정보 체크
        if (hasMonthlyRentCondition) {
          return apt.average_monthly_rent !== null && apt.average_monthly_rent !== undefined && apt.average_monthly_rent > 0;
        }
        // 매매 조건이 있거나 조건이 없으면 매매가 정보 체크 (기본값)
        return apt.average_price !== null && apt.average_price !== undefined && apt.average_price > 0;
      });
      
      const convertedResults: ApartmentSearchResult[] = apartmentsWithPrice.map((apt: AISearchApartmentResult) => {
        // 가격 표시 로직 (검색 조건에 따라 적절한 가격 표시)
        let priceText = '정보 없음';
        if (hasJeonseCondition && apt.average_deposit) {
          priceText = `전세 ${(apt.average_deposit / 10000).toFixed(1)}억원`;
        } else if (hasMonthlyRentCondition && apt.average_monthly_rent) {
          priceText = `월세 ${apt.average_monthly_rent}만원`;
        } else if (apt.average_price) {
          priceText = `${(apt.average_price / 10000).toFixed(1)}억원`;
        }
        
        return {
          apt_id: apt.apt_id,
          apt_name: apt.apt_name,
          address: apt.address,
          sigungu_name: apt.address.split(' ').slice(0, 2).join(' ') || '',
          location: apt.location,
          price: priceText
        };
      });
      
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
          // 에러 발생 시 마지막 요청 시간 업데이트 (2초 제한 적용)
          lastRequestTimeRef.current = Date.now();
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
      
      // 에러 발생 시 마지막 요청 시간 업데이트 (2초 제한 적용)
      lastRequestTimeRef.current = Date.now();
    } finally {
      if (!abortController.signal.aborted) {
        setIsSearchingAI(false);
        isSearchingRef.current = false;
      }
    }
  }, [isAIMode, showError]);

  // AI 검색 실행 (AI 모드일 때만, Enter 키로만 검색) - 자동 검색 비활성화
  useEffect(() => {
    // AI 모드에서는 자동 검색하지 않음 (Enter 키로만 검색)
    if (isAIMode && searchQuery.length < 5) {
      setAiResults([]);
      setIsSearchingAI(false);
      isSearchingRef.current = false;
      lastSearchQueryRef.current = '';
      lastErrorRef.current = '';
    }
  }, [searchQuery, isAIMode]);

  // forceSearchTrigger는 더 이상 사용하지 않음 (Enter 키 핸들러에서 직접 호출)

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
  
  // 지역별 랭킹 데이터 로드 (지역 필터 적용)
  useEffect(() => {
    const fetchRegionalRankings = async () => {
      console.log('🔄 [Dashboard Component] 지역별 랭킹 데이터 로드 시작 - rankingTab:', rankingTab, 'regionFilter:', selectedRegionFilter);
      setRegionalRankingsLoading(true);
      try {
        // 전국이 아닌 경우에만 regionName 전달
        const regionName = selectedRegionFilter === '전국' ? undefined : selectedRegionFilter;
        const data = await getDashboardRankingsRegion(rankingTab, 7, 3, regionName);
        console.log('✅ [Dashboard Component] 지역별 랭킹 데이터 로드 완료:', {
          trendingCount: data.trending?.length || 0,
          risingCount: data.rising?.length || 0,
          fallingCount: data.falling?.length || 0,
          data
        });
        setRegionalRankingsData(data);
      } catch (error) {
        console.error('❌ [Dashboard Component] 지역별 랭킹 데이터 로드 실패:', error);
        setRegionalRankingsData(null);
      } finally {
        setRegionalRankingsLoading(false);
      }
    };
    
    fetchRegionalRankings();
  }, [rankingTab, selectedRegionFilter]);
  
  // 시장 동향 데이터 로드 (매매, 전세)
  useEffect(() => {
    const fetchMarketTrends = async () => {
      console.log('🔄 [Dashboard Component] 시장 동향 데이터 로드 시작');
      setMarketTrendsLoading(true);
      try {
        const [saleData, jeonseData] = await Promise.all([
          getRegionalTrends('sale', 12),
          getRegionalTrends('jeonse', 12)
        ]);
        console.log('✅ [Dashboard Component] 시장 동향 데이터 로드 완료:', {
          saleCount: saleData.length,
          jeonseCount: jeonseData.length
        });
        setMarketTrendsSale(saleData);
        setMarketTrendsJeonse(jeonseData);
      } catch (error) {
        console.error('❌ [Dashboard Component] 시장 동향 데이터 로드 실패:', error);
        setMarketTrendsSale([]);
        setMarketTrendsJeonse([]);
      } finally {
        setMarketTrendsLoading(false);
      }
    };
    
    fetchMarketTrends();
  }, []);
  
  // 화면 크기 추적
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);
  
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
        <div className="relative flex items-center gap-2">
          {/* 검색 바 컨테이너 - 배경 애니메이션이 여기에만 적용 */}
          <div className="relative flex-1 overflow-hidden rounded-2xl" style={{ position: 'relative' }}>
            {/* AI 모드 그라데이션 배경 - 검색 바에만 적용 */}
            {isAIMode && (
              <div 
                className="absolute inset-0"
                style={{
                  background: isDarkMode
                    ? `linear-gradient(90deg, rgba(96, 165, 250, 0.3) 0%, rgba(147, 197, 253, 0.35) 20%, rgba(192, 132, 252, 0.4) 40%, rgba(196, 181, 253, 0.4) 60%, rgba(192, 132, 252, 0.35) 80%, rgba(147, 197, 253, 0.3) 100%)`
                    : `linear-gradient(90deg, rgba(147, 197, 253, 0.45) 0%, rgba(196, 181, 253, 0.5) 20%, rgba(192, 132, 252, 0.55) 40%, rgba(196, 181, 253, 0.5) 60%, rgba(192, 132, 252, 0.5) 80%, rgba(147, 197, 253, 0.45) 100%)`,
                  backgroundSize: '200% 100%',
                  backgroundPosition: `${gradientPosition.x}% 0%`,
                  transition: 'background-position 4s ease-in-out',
                  willChange: 'background-position',
                }}
              />
            )}
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${isAIMode ? (isDarkMode ? 'text-purple-300' : 'text-purple-500') : 'text-zinc-400'}`} style={{ zIndex: 2 }} />
            <input
              type="text"
              placeholder={isAIMode ? "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처" : "아파트 이름, 지역 검색..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isAIMode && searchQuery.length >= 5) {
                  e.preventDefault();
                  // 엔터 키를 누르면 즉시 검색 시작 (자동 검색 방지)
                  if (!isSearchingRef.current) {
                    executeAISearch(searchQuery);
                  }
                }
              }}
              className={`w-full pl-12 pr-4 py-3.5 rounded-2xl border transition-all relative ${
                isAIMode
                  ? isDarkMode
                    ? 'bg-transparent border-purple-500/50 focus:border-purple-400 text-white placeholder:text-purple-300/60'
                    : 'bg-transparent border-purple-400/50 focus:border-purple-500 text-zinc-900 placeholder:text-purple-400/60'
                  : isDarkMode
                  ? 'bg-zinc-900 border-white/10 focus:border-sky-500/50 text-white placeholder:text-zinc-600'
                  : 'bg-white border-black/5 focus:border-sky-500 text-zinc-900 placeholder:text-zinc-400'
              } focus:outline-none focus:ring-4 focus:ring-sky-500/10`}
              style={{ zIndex: 1 }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full shrink-0 transition-colors ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
                }`}
                style={{ zIndex: 2 }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
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
            className={`px-3 py-1.5 rounded-full shrink-0 text-sm font-medium transition-all border-2 relative ${
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
              zIndex: 2,
            } : { zIndex: 2 }}
          >
            AI
          </button>
        </div>

        {/* Search Results Dropdown */}
        {((isAIMode && searchQuery.length >= 1) || (!isAIMode && (searchQuery.length >= 1 || isSearching || isSearchingLocations)) || isSearchingAI) && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`absolute top-full left-0 right-0 mt-2 rounded-2xl border shadow-xl overflow-hidden z-[100] max-h-[60vh] overflow-y-auto backdrop-blur-xl ${
              isDarkMode 
                ? 'bg-zinc-900/95 border-zinc-800' 
                : 'bg-white/95 border-zinc-200'
            }`}
          >
            <div className="p-4">
              <AnimatePresence mode="wait">
                {isAIMode ? (
                  <motion.div
                    key="ai-mode"
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    transition={{ 
                      duration: 0.2,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                    className="flex flex-col gap-4"
                  >
                    {isSearchingAI && searchQuery.length >= 5 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="flex justify-center"
                      >
                        <div className="flex flex-col items-center gap-3 w-full max-w-full">
                          <div className={`px-6 py-4 rounded-2xl w-full overflow-x-auto relative ${
                            isDarkMode 
                              ? 'bg-gradient-to-r from-purple-900/20 via-purple-800/30 to-purple-900/20 border border-purple-700/50 text-white' 
                              : 'bg-gradient-to-r from-purple-50 via-purple-100/50 to-purple-50 border border-purple-200 text-zinc-900'
                          }`}>
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Sparkles className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                              <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="text-sm font-medium text-center whitespace-nowrap"
                              >
                                AI가 검색 중입니다...
                              </motion.p>
                              <motion.div
                                className="flex gap-1 justify-center"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                              >
                                {[0, 1, 2].map((i) => (
                                  <motion.div
                                    key={i}
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      isDarkMode ? 'bg-purple-400' : 'bg-purple-600'
                                    }`}
                                    animate={{
                                      y: [0, -4, 0],
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
                              </motion.div>
                            </div>
                            {/* 그라데이션 애니메이션 배경 */}
                            <motion.div
                              className="absolute inset-0 rounded-2xl opacity-30"
                              style={{
                                background: isDarkMode
                                  ? 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.3), transparent)'
                                  : 'linear-gradient(90deg, transparent, rgba(192, 132, 252, 0.3), transparent)',
                                backgroundSize: '200% 100%'
                              }}
                              animate={{
                                backgroundPosition: ['0% 0%', '200% 0%']
                              }}
                              transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: "linear"
                              }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                    {/* AI 검색 히스토리 및 결과 표시 */}
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15, delay: 0.05 }}
                      className="flex flex-col gap-2"
                    >
                      {/* 최근 검색 이력 헤더 및 목록 (5자 미만일 때와 동일한 구조) */}
                      <div className="space-y-2">
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
                                      onClick={() => setShowInfoTooltip(false)}
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
                                if (window.confirm('모든 검색 이력을 삭제하시겠습니까?')) {
                                  clearAISearchHistory();
                                  const updatedHistory = getAISearchHistory();
                                  setAiSearchHistory(updatedHistory);
                                  setHistoryLoaded(false);
                                }
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
                          {/* 최근 검색 이력 목록 (5자 미만일 때와 동일하게 전체 표시) */}
                          {aiSearchHistory.length > 0 ? (
                            <AIChatMessages
                              history={aiSearchHistory.slice(0, 5)}
                              isDarkMode={isDarkMode}
                              onApartmentSelect={(apt) => handleSelect(apt)}
                              onHistoryCleared={() => {
                                const updatedHistory = getAISearchHistory();
                                setAiSearchHistory(updatedHistory);
                                setHistoryLoaded(false);
                              }}
                              showTooltip={true}
                              hideHeader={true}
                            />
                          ) : (
                            <div className={`text-center py-8 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                              <p className="text-sm">AI 검색 이력이 없습니다.</p>
                              <p className="text-xs mt-1">자연어로 원하는 집의 조건을 입력해보세요.</p>
                            </div>
                          )}
                        </div>
                    </motion.div>
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
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    transition={{ 
                      duration: 0.2,
                      ease: [0.4, 0, 0.2, 1]
                    }}
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
          </motion.div>
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

      {/* 카드 섹션 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* 카드 1 - 시장 동향 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`rounded-2xl border p-6 ${
            isDarkMode
              ? 'bg-zinc-900 border-zinc-800'
              : 'bg-white border-zinc-200'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${
                isDarkMode ? 'bg-sky-500/20' : 'bg-sky-50'
              }`}>
                <TrendingUp className={`w-5 h-5 ${
                  isDarkMode ? 'text-sky-400' : 'text-sky-600'
                }`} />
              </div>
              <h3 className={`font-bold text-lg ${
                isDarkMode ? 'text-white' : 'text-zinc-900'
              }`}>
                지역별 평단가 추이
              </h3>
            </div>
            
            {/* 지역 필터 버튼 */}
            <div className="relative">
              <button
                onClick={() => setShowMarketRegionFilterDropdown(!showMarketRegionFilterDropdown)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  selectedMarketRegion !== '전국'
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                    : isDarkMode
                    ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{selectedMarketRegion}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMarketRegionFilterDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {/* 드롭다운 메뉴 */}
              <AnimatePresence>
                {showMarketRegionFilterDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowMarketRegionFilterDropdown(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className={`absolute top-full right-0 mt-2 rounded-xl border shadow-xl overflow-hidden z-20 ${
                        isDarkMode
                          ? 'bg-zinc-900 border-zinc-800'
                          : 'bg-white border-zinc-200'
                      }`}
                      style={{ minWidth: '120px' }}
                    >
                      {['전국', '서울', '경기', '인천', '충청', '부울경', '전라', '제주', '기타'].map((region) => (
                        <button
                          key={region}
                          onClick={() => {
                            setSelectedMarketRegion(region);
                            setShowMarketRegionFilterDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                            selectedMarketRegion === region
                              ? isDarkMode
                                ? 'bg-sky-500/20 text-sky-400'
                                : 'bg-sky-50 text-sky-600'
                              : isDarkMode
                              ? 'text-zinc-300 hover:bg-zinc-800'
                              : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          {region}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
          
          {/* 그래프 영역 */}
          {marketTrendsLoading ? (
            <div className={`py-8 text-center ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <div className="inline-block w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-2 text-xs">데이터를 불러오는 중...</p>
            </div>
          ) : (() => {
            // 선택된 지역의 데이터 필터링
            const saleRegionData = selectedMarketRegion === '전국' 
              ? marketTrendsSale.find(r => r.region === '전국') || marketTrendsSale[0]
              : marketTrendsSale.find(r => r.region === selectedMarketRegion);
            
            const jeonseRegionData = selectedMarketRegion === '전국'
              ? marketTrendsJeonse.find(r => r.region === '전국') || marketTrendsJeonse[0]
              : marketTrendsJeonse.find(r => r.region === selectedMarketRegion);
            
            if (!saleRegionData && !jeonseRegionData) {
              return (
                <div className={`text-sm py-8 text-center ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  데이터가 없습니다.
                </div>
              );
            }
            
            // 그래프 데이터 준비 - 매매와 전세 데이터를 월별로 병합
            const saleDataMap = new Map(
              (saleRegionData?.data || []).map(item => [
                item.month,
                Math.round(item.avg_price_per_pyeong)
              ])
            );
            
            const jeonseDataMap = new Map(
              (jeonseRegionData?.data || []).map(item => [
                item.month,
                Math.round(item.avg_price_per_pyeong)
              ])
            );
            
            // 모든 월을 수집
            const allMonths = new Set([
              ...Array.from(saleDataMap.keys()),
              ...Array.from(jeonseDataMap.keys())
            ]);
            
            // 월별로 정렬된 통합 데이터 생성
            const combinedChartData = Array.from(allMonths)
              .sort()
              .map(month => ({
                month,
                매매평단가: saleDataMap.get(month) || null,
                전세평단가: jeonseDataMap.get(month) || null
              }));
            
            if (combinedChartData.length === 0) {
              return (
                <div className={`text-sm py-8 text-center ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  데이터가 없습니다.
                </div>
              );
            }
            
            return (
              <div>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={combinedChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#3f3f46' : '#e4e4e7'} />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 10, fill: isDarkMode ? '#a1a1aa' : '#71717a' }}
                      tickFormatter={(value) => value.split('-')[1]}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: isDarkMode ? '#a1a1aa' : '#71717a' }}
                      tickFormatter={(value) => `${value}만원`}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
                        border: isDarkMode ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                        borderRadius: '8px',
                        color: isDarkMode ? '#ffffff' : '#18181b'
                      }}
                      formatter={(value: any, name: string) => {
                        if (value === null) return ['데이터 없음', name];
                        return [`${value}만원`, name === '매매평단가' ? '매매' : '전세'];
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                      iconType="line"
                      formatter={(value) => value === '매매평단가' ? '매매' : '전세'}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="매매평단가" 
                      stroke="#0ea5e9" 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      name="매매평단가"
                      connectNulls={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="전세평단가" 
                      stroke="#a78bfa" 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      name="전세평단가"
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </motion.div>

        {/* 카드 2 - 인기 지역 랭킹 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`rounded-2xl border p-6 ${
            isDarkMode
              ? 'bg-zinc-900 border-zinc-800'
              : 'bg-white border-zinc-200'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${
                isDarkMode ? 'bg-purple-500/20' : 'bg-purple-50'
              }`}>
                <Flame className={`w-5 h-5 ${
                  isDarkMode ? 'text-white' : 'text-purple-600'
                }`} />
              </div>
              <h3 className={`font-bold text-lg ${
                isDarkMode ? 'text-white' : 'text-zinc-900'
              }`}>
                Top Ranking
              </h3>
            </div>
            
            {/* 필터 버튼 */}
            {windowWidth >= 431 ? (
              // 431px 이상: 지역 필터 + Favorites 스타일 탭 (거래량, 변동률)
              <div className="flex items-center gap-2">
                {/* 지역 필터 버튼 */}
                <div className="relative">
                  <button
                    onClick={() => setShowRegionFilterDropdown(!showRegionFilterDropdown)}
                    className={`py-3 px-4 rounded-xl font-semibold transition-all flex items-center gap-2 ${
                      selectedRegionFilter !== '전국'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                        : isDarkMode
                        ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    {selectedRegionFilter}
                    <ChevronDown className={`w-4 h-4 transition-transform ${showRegionFilterDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {/* 드롭다운 메뉴 */}
                  <AnimatePresence>
                    {showRegionFilterDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowRegionFilterDropdown(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className={`absolute top-full right-0 mt-2 rounded-xl border shadow-xl overflow-hidden z-20 ${
                            isDarkMode
                              ? 'bg-zinc-900 border-zinc-800'
                              : 'bg-white border-zinc-200'
                          }`}
                          style={{ minWidth: '120px' }}
                        >
                          {['전국', '서울특별시', '경기도', '강원도', '충청북도', '충청남도', '전라북도', '전라남도', '경상북도', '경상남도'].map((region) => (
                            <button
                              key={region}
                              onClick={() => {
                                setSelectedRegionFilter(region);
                                setShowRegionFilterDropdown(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                selectedRegionFilter === region
                                  ? isDarkMode
                                    ? 'bg-sky-500/20 text-sky-400'
                                    : 'bg-sky-50 text-sky-600'
                                  : isDarkMode
                                  ? 'text-zinc-300 hover:bg-zinc-800'
                                  : 'text-zinc-700 hover:bg-zinc-100'
                              }`}
                            >
                              {region}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                
                {/* 거래량/변동률 탭 */}
                <div 
                  className="flex gap-2 p-1.5 rounded-2xl min-w-[200px]"
                  style={
                    isDarkMode 
                      ? { backgroundColor: '#18181b' }
                      : { backgroundColor: '#f4f4f5', border: '1px solid #e4e4e7' }
                  }
                >
                  <button
                    onClick={() => setRankingType('trending')}
                    className="flex-1 py-3 px-4 rounded-xl font-semibold transition-all min-w-[90px]"
                    style={
                      rankingType === 'trending'
                        ? {
                            background: 'linear-gradient(to right, #0ea5e9, #2563eb)',
                            color: '#ffffff',
                            boxShadow: '0 10px 15px -3px rgba(14, 165, 233, 0.3), 0 4px 6px -2px rgba(14, 165, 233, 0.3)',
                            border: 'none'
                          }
                        : isDarkMode
                        ? { 
                            backgroundColor: 'transparent', 
                            color: '#a1a1aa',
                            border: 'none'
                          }
                        : { 
                            backgroundColor: '#ffffff',
                            color: '#27272a',
                            border: '1px solid #e4e4e7',
                            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                          }
                    }
                  >
                    거래량
                  </button>
                  <button
                    onClick={() => {
                      // 변동률 클릭 시 이전에 선택했던 타입 사용, 없으면 상승률
                      setRankingType(lastChangeRateType);
                    }}
                    onContextMenu={(e) => {
                      // 우클릭으로 변동률 내에서 상승/하락 전환
                      if (rankingType !== 'trending') {
                        e.preventDefault();
                        const newType = rankingType === 'rising' ? 'falling' : 'rising';
                        setRankingType(newType);
                        setLastChangeRateType(newType);
                      }
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-semibold transition-all min-w-[90px]"
                    style={
                      rankingType !== 'trending'
                        ? {
                            background: 'linear-gradient(to right, #0ea5e9, #2563eb)',
                            color: '#ffffff',
                            boxShadow: '0 10px 15px -3px rgba(14, 165, 233, 0.3), 0 4px 6px -2px rgba(14, 165, 233, 0.3)',
                            border: 'none'
                          }
                        : isDarkMode
                        ? { 
                            backgroundColor: 'transparent', 
                            color: '#a1a1aa',
                            border: 'none'
                          }
                        : { 
                            backgroundColor: '#ffffff',
                            color: '#27272a',
                            border: '1px solid #e4e4e7',
                            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                          }
                    }
                  >
                    변동률
                  </button>
                </div>
              </div>
            ) : (
              // 431px 미만: 지역 필터 + 1개 버튼 (거래량 -> 상승률 -> 하락률 -> 거래량 순환)
              <div className="flex items-center gap-2">
                {/* 지역 필터 버튼 */}
                <div className="relative">
                  <button
                    onClick={() => setShowRegionFilterDropdown(!showRegionFilterDropdown)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      selectedRegionFilter !== '전국'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                        : isDarkMode
                        ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{selectedRegionFilter}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRegionFilterDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {/* 드롭다운 메뉴 */}
                  <AnimatePresence>
                    {showRegionFilterDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowRegionFilterDropdown(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className={`absolute top-full right-0 mt-2 rounded-xl border shadow-xl overflow-hidden z-20 ${
                            isDarkMode
                              ? 'bg-zinc-900 border-zinc-800'
                              : 'bg-white border-zinc-200'
                          }`}
                          style={{ minWidth: '120px' }}
                        >
                          {['전국', '서울특별시', '경기도', '강원도', '충청북도', '충청남도', '전라북도', '전라남도', '경상북도', '경상남도'].map((region) => (
                            <button
                              key={region}
                              onClick={() => {
                                setSelectedRegionFilter(region);
                                setShowRegionFilterDropdown(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                selectedRegionFilter === region
                                  ? isDarkMode
                                    ? 'bg-sky-500/20 text-sky-400'
                                    : 'bg-sky-50 text-sky-600'
                                  : isDarkMode
                                  ? 'text-zinc-300 hover:bg-zinc-800'
                                  : 'text-zinc-700 hover:bg-zinc-100'
                              }`}
                            >
                              {region}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                
                {/* 거래량/상승률/하락률 버튼 */}
                <button
                  onClick={() => {
                    // 거래량 -> 상승률 -> 하락률 -> 거래량 순환
                    if (rankingType === 'trending') {
                      setRankingType('rising');
                    } else if (rankingType === 'rising') {
                      setRankingType('falling');
                    } else {
                      setRankingType('trending');
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                    rankingType === 'rising'
                      ? isDarkMode
                        ? 'bg-blue-500 text-white'
                        : ''
                      : rankingType === 'falling'
                      ? isDarkMode
                        ? 'bg-purple-400 text-white'
                        : ''
                      : isDarkMode
                      ? 'bg-purple-400 text-white'
                      : ''
                  }`}
                  style={
                    !isDarkMode && (rankingType === 'trending' || rankingType === 'rising' || rankingType === 'falling')
                      ? { backgroundColor: 'rgba(237, 237, 237, 1)', color: 'rgba(63, 63, 71, 1)' }
                      : undefined
                  }
                >
                  {rankingType === 'trending' ? '거래량' : rankingType === 'rising' ? '상승률' : '하락률'}
                </button>
              </div>
            )}
          </div>
          
          {regionalRankingsLoading ? (
            <div className={`py-4 text-center ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <div className="inline-block w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-2 text-xs">랭킹 데이터를 불러오는 중...</p>
            </div>
          ) : (() => {
            // PC 화면에서 변동률 탭일 때는 상승률과 하락률을 동시에 표시
            if (windowWidth >= 431 && rankingType !== 'trending') {
              const risingData = regionalRankingsData?.rising || [];
              const fallingData = regionalRankingsData?.falling || [];
              const hasRising = risingData.length > 0;
              const hasFalling = fallingData.length > 0;
              
              if (!hasRising && !hasFalling) {
                return (
                  <div className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    랭킹 데이터가 없습니다.
                  </div>
                );
              }
              
              const renderRankingItem = (apt: RankingApartment, index: number, isRising: boolean) => (
                <motion.button
                  key={apt.apt_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => {
                    handleSelect({
                      apt_id: apt.apt_id,
                      apt_name: apt.apt_name,
                      address: apt.region,
                      sigungu_name: apt.region.split(' ')[1] || '',
                      location: { lat: 0, lng: 0 },
                      price: `${(apt.recent_avg * 3.3).toFixed(1)}억원`,
                    });
                  }}
                  className={`w-full text-left py-3 px-2 transition-colors ${
                    isDarkMode
                      ? 'hover:bg-zinc-800/50'
                      : 'hover:bg-zinc-50'
                  } ${index > 0 ? `border-t ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}` : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isDarkMode
                        ? 'bg-zinc-800 text-zinc-400'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm truncate ${
                        isDarkMode ? 'text-white' : 'text-zinc-900'
                      }`}>
                        {apt.apt_name}
                      </p>
                      <p className={`text-xs truncate mt-0.5 ${
                        isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                      }`}>
                        {apt.region}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="flex items-center gap-1">
                        {isRising ? (
                          <ArrowUpRight 
                            className="w-3 h-3" 
                            style={{ color: isDarkMode ? '#f87171' : '#dc2626' }}
                          />
                        ) : (
                          <ArrowDownRight 
                            className="w-3 h-3" 
                            style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }}
                          />
                        )}
                        <p 
                          className="text-xs font-medium"
                          style={{ 
                            color: isRising 
                              ? (isDarkMode ? '#f87171' : '#dc2626')
                              : (isDarkMode ? '#60a5fa' : '#2563eb')
                          }}
                        >
                          {Math.abs(apt.change_rate).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
              
              return (
                <div className="grid grid-cols-2 gap-4">
                  {/* 상승률 컬럼 */}
                  <div>
                    <p className={`text-xs mb-3 px-2 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      상승률 TOP 5
                    </p>
                    <div className={`rounded-lg overflow-hidden ${
                      isDarkMode ? 'bg-zinc-800/30' : 'bg-zinc-50'
                    }`}>
                      {hasRising ? (
                        risingData.slice(0, 5).map((apt, index) => renderRankingItem(apt, index, true))
                      ) : (
                        <div className={`py-4 text-center text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                          데이터 없음
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* 하락률 컬럼 */}
                  <div>
                    <p className={`text-xs mb-3 px-2 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      하락률 TOP 5
                    </p>
                    <div className={`rounded-lg overflow-hidden ${
                      isDarkMode ? 'bg-zinc-800/30' : 'bg-zinc-50'
                    }`}>
                      {hasFalling ? (
                        fallingData.slice(0, 5).map((apt, index) => renderRankingItem(apt, index, false))
                      ) : (
                        <div className={`py-4 text-center text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                          데이터 없음
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }
            
            // 거래량 또는 모바일 화면일 때는 기존 로직
            let displayData: (TrendingApartment | RankingApartment)[] = [];
            let title = '';
            let hasData = false;
            
            if (rankingType === 'trending' && regionalRankingsData?.trending) {
              displayData = regionalRankingsData.trending.slice(0, 5);
              title = '요즘 관심 많은 아파트 TOP 5';
              hasData = displayData.length > 0;
            } else if (rankingType === 'rising' && regionalRankingsData?.rising) {
              displayData = regionalRankingsData.rising.slice(0, 5);
              title = '상승률 TOP 5';
              hasData = displayData.length > 0;
            } else if (rankingType === 'falling' && regionalRankingsData?.falling) {
              displayData = regionalRankingsData.falling.slice(0, 5);
              title = '하락률 TOP 5';
              hasData = displayData.length > 0;
            }
            
            if (!hasData) {
              return (
                <div className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  랭킹 데이터가 없습니다.
                </div>
              );
            }
            
            return (
              <div>
                <p className={`text-xs mb-3 px-2 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {title}
                </p>
                <div className={`rounded-lg overflow-hidden ${
                  isDarkMode ? 'bg-zinc-800/30' : 'bg-zinc-50'
                }`}>
                  {displayData.map((apt, index) => {
                    const isTrending = rankingType === 'trending';
                    const rankingApt = apt as RankingApartment;
                    const trendingApt = apt as TrendingApartment;
                    
                    return (
                      <motion.button
                        key={apt.apt_id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => {
                          handleSelect({
                            apt_id: apt.apt_id,
                            apt_name: apt.apt_name,
                            address: apt.region,
                            sigungu_name: apt.region.split(' ')[1] || '',
                            location: { lat: 0, lng: 0 },
                            price: isTrending 
                              ? `${(trendingApt.avg_price_per_pyeong * 3.3).toFixed(1)}억원 (평당 ${trendingApt.avg_price_per_pyeong.toLocaleString()}만원)`
                              : `${(rankingApt.recent_avg * 3.3).toFixed(1)}억원`,
                          });
                        }}
                        className={`w-full text-left py-3 px-2 transition-colors ${
                          isDarkMode
                            ? 'hover:bg-zinc-800/50'
                            : 'hover:bg-zinc-50'
                        } ${index > 0 ? `border-t ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}` : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            isDarkMode
                              ? 'bg-zinc-800 text-zinc-400'
                              : 'bg-zinc-100 text-zinc-600'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-sm truncate ${
                              isDarkMode ? 'text-white' : 'text-zinc-900'
                            }`}>
                              {apt.apt_name}
                            </p>
                            <p className={`text-xs truncate mt-0.5 ${
                              isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                            }`}>
                              {apt.region}
                            </p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            {isTrending ? (
                              <p className={`text-xs font-medium ${
                                isDarkMode ? 'text-white' : 'text-zinc-700'
                              }`}>
                                {trendingApt.transaction_count}건
                              </p>
                            ) : (
                              <div className="flex items-center gap-1">
                                {rankingType === 'rising' ? (
                                  <ArrowUpRight 
                                    className="w-3 h-3" 
                                    style={{ color: isDarkMode ? '#f87171' : '#dc2626' }}
                                  />
                                ) : (
                                  <ArrowDownRight 
                                    className="w-3 h-3" 
                                    style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }}
                                  />
                                )}
                                <p 
                                  className="text-xs font-medium"
                                  style={{ 
                                    color: rankingType === 'rising'
                                      ? (isDarkMode ? '#f87171' : '#dc2626')
                                      : (isDarkMode ? '#60a5fa' : '#2563eb')
                                  }}
                                >
                                  {Math.abs(rankingApt.change_rate).toFixed(1)}%
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </motion.div>
      </div>


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