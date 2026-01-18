import { useState, useEffect, useRef } from 'react';
import { Star, MapPin, Plus, X, Search, Building2, TrendingUp, TrendingDown, Newspaper } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, SafeSignInButton } from '../lib/clerk';
import { 
  getFavoriteLocations, 
  addFavoriteLocation, 
  deleteFavoriteLocation,
  FavoriteLocation,
  getFavoriteApartments,
  addFavoriteApartment,
  deleteFavoriteApartment,
  FavoriteApartment,
  getRegionStats,
  RegionStats
} from '../lib/favoritesApi';
import { searchLocations, LocationSearchResult, getApartmentsByRegion } from '../lib/searchApi';
import { searchApartments, ApartmentSearchResult } from '../lib/searchApi';
import { getApartmentTransactions } from '../lib/apartmentApi';

import { getNewsList, getNewsDetail, NewsResponse, formatTimeAgo } from '../lib/newsApi';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './ui/Toast';
import { ChevronRight, ArrowLeft } from 'lucide-react';

import { useDynamicIslandToast } from './ui/DynamicIslandToast';


interface FavoritesProps {
  onApartmentClick?: (apartment: any) => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

export default function Favorites({ onApartmentClick, isDarkMode, isDesktop = false }: FavoritesProps) {
  const { isSignedIn, getToken } = useAuth();
  const toast = useToast();

  const { showSuccess, showError, showWarning, showInfo, ToastComponent } = useDynamicIslandToast(isDarkMode, 3000);

  const [activeTab, setActiveTab] = useState<'regions' | 'apartments'>('regions');
  
  // 즐겨찾기 데이터
  const [favoriteLocations, setFavoriteLocations] = useState<FavoriteLocation[]>([]);
  const [favoriteApartments, setFavoriteApartments] = useState<FavoriteApartment[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [loadingApartments, setLoadingApartments] = useState(false);
  
  // 선택된 지역
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  
  // 지역 통계 데이터
  const [regionStatsMap, setRegionStatsMap] = useState<Record<number, RegionStats>>({});
  const [loadingRegionStats, setLoadingRegionStats] = useState<Record<number, boolean>>({});
  
  // 아파트 최근 시세 데이터
  const [apartmentPricesMap, setApartmentPricesMap] = useState<Record<number, number | null>>({});
  
  // 즐겨찾기 해제 중인 항목들 (애니메이션용)
  const [unfavoritingLocations, setUnfavoritingLocations] = useState<Set<number>>(new Set());
  const [unfavoritingApartments, setUnfavoritingApartments] = useState<Set<number>>(new Set());
  
  // 지역 목록 스크롤 컨테이너 ref
  const locationsScrollRef = useRef<HTMLDivElement>(null);
  
  // 뉴스 데이터
  const [regionNewsMap, setRegionNewsMap] = useState<Record<number, NewsResponse[]>>({});
  const [loadingRegionNews, setLoadingRegionNews] = useState<Record<number, boolean>>({});
  const [regionNewsPageMap, setRegionNewsPageMap] = useState<Record<number, number>>({});
  
  // 뉴스 상세 정보
  const [selectedNews, setSelectedNews] = useState<NewsResponse | null>(null);
  const [loadingNewsDetail, setLoadingNewsDetail] = useState(false);

  // 지역별 아파트 리스트
  const [regionApartmentsMap, setRegionApartmentsMap] = useState<Record<number, ApartmentSearchResult[]>>({});
  const [loadingRegionApartments, setLoadingRegionApartments] = useState<Record<number, boolean>>({});
  
  // 아파트 가격 변화율 데이터 (아파트 ID -> 변화율)
  const [apartmentChangeRates, setApartmentChangeRates] = useState<Record<number, number | null>>({});
  const [loadingApartmentChanges, setLoadingApartmentChanges] = useState<Record<number, boolean>>({});
  
  // 검색 모드
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [isSearchingApartment, setIsSearchingApartment] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [apartmentSearchQuery, setApartmentSearchQuery] = useState('');
  const [locationSearchResults, setLocationSearchResults] = useState<LocationSearchResult[]>([]);
  const [apartmentSearchResults, setApartmentSearchResults] = useState<ApartmentSearchResult[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [searchingApartment, setSearchingApartment] = useState(false);

  // 즐겨찾기 데이터 로드
  useEffect(() => {
    if (isSignedIn) {
      loadFavoriteLocations();
      loadFavoriteApartments();
    } else {
      setFavoriteLocations([]);
      setFavoriteApartments([]);
    }
  }, [isSignedIn, activeTab]);

  // 첫 번째 즐겨찾는 지역을 기본 선택
  useEffect(() => {
    if (activeTab === 'regions' && favoriteLocations.length > 0 && !selectedRegionId) {
      setSelectedRegionId(favoriteLocations[0].region_id);
    } else if (activeTab === 'regions' && favoriteLocations.length === 0) {
      setSelectedRegionId(null);
    }
  }, [activeTab, favoriteLocations]);

  // 선택된 지역의 통계 데이터 로드
  useEffect(() => {
    if (activeTab === 'regions' && selectedRegionId) {
      if (!regionStatsMap[selectedRegionId] && !loadingRegionStats[selectedRegionId]) {
        loadRegionStats(selectedRegionId);
      }
      // 지역이 선택될 때마다 뉴스를 다시 검색 (항상 새로 로드)
      if (!loadingRegionNews[selectedRegionId]) {
        // 기존 뉴스 데이터를 초기화하고 새로 로드
        setRegionNewsMap(prev => {
          const newMap = { ...prev };
          delete newMap[selectedRegionId];
          return newMap;
        });
        loadRegionNews(selectedRegionId);
        // 지역 변경 시 페이지 인덱스 초기화
        setRegionNewsPageMap(prev => ({ ...prev, [selectedRegionId]: 0 }));
      }
      // 지역별 아파트 리스트 로드
      if (!regionApartmentsMap[selectedRegionId] && !loadingRegionApartments[selectedRegionId]) {
        loadRegionApartments(selectedRegionId);
      }
    }
  }, [activeTab, selectedRegionId]);

  // 아파트 최근 시세 데이터 로드
  useEffect(() => {
    if (activeTab === 'apartments' && favoriteApartments.length > 0) {
      favoriteApartments.forEach((fav) => {
        if (!apartmentPricesMap[fav.apt_id]) {
          loadApartmentPrice(fav.apt_id);
        }
      });
    }
  }, [activeTab, favoriteApartments]);

  const loadRegionStats = async (regionId: number) => {
    setLoadingRegionStats(prev => ({ ...prev, [regionId]: true }));
    try {
      const stats = await getRegionStats(regionId, 'sale', 3);
      if (stats) {
        setRegionStatsMap(prev => ({ ...prev, [regionId]: stats }));
      } else {
        console.warn(`No stats data returned for region ${regionId}`);
        // 데이터가 없어도 빈 객체로 설정하여 로딩 상태 해제
        setRegionStatsMap(prev => ({ ...prev, [regionId]: null as any }));
      }
    } catch (error) {
      console.error(`Failed to load region stats for ${regionId}:`, error);
      // 에러 발생 시에도 로딩 상태 해제
      setRegionStatsMap(prev => ({ ...prev, [regionId]: null as any }));
    } finally {
      setLoadingRegionStats(prev => ({ ...prev, [regionId]: false }));
    }
  };

  // 지역 이름에서 접미사 제거 함수
  const removeRegionSuffix = (name: string): string => {
    if (!name) return '';
    
    // 특수 케이스: 도 이름을 줄임말로 변환
    if (name === '경상북도') return '경북';
    if (name === '경상남도') return '경남';
    if (name === '충청북도') return '충북';
    if (name === '충청남도') return '충남';
    if (name === '전라북도') return '전북';
    if (name === '전라남도') return '전남';
    
    // 일반적인 접미사 제거: 특별시, 광역시, 시, 도, 구, 군 등
    return name
      .replace(/특별시$/, '')
      .replace(/광역시$/, '')
      .replace(/북도$/, '')
      .replace(/남도$/, '')
      .replace(/시$/, '')
      .replace(/도$/, '')
      .replace(/구$/, '')
      .replace(/군$/, '')
      .trim();
  };

  const loadRegionNews = async (regionId: number) => {
    const selectedFav = favoriteLocations.find(f => f.region_id === regionId);
    if (!selectedFav) return;

    setLoadingRegionNews(prev => ({ ...prev, [regionId]: true }));
    try {
      const token = await getToken();
      const regionName = selectedFav.region_name || selectedFav.location?.region_name || '';
      const cityName = selectedFav.city_name || selectedFav.location?.city_name || '';
      
      // 시/군/구 정보를 포함한 뉴스 검색
      // 접미사 제거: "서울특별시" → "서울", "경주시" → "경주", "경상북도" → "경북"
      const cleanedCityName = cityName ? removeRegionSuffix(cityName) : null;
      const cleanedRegionName = regionName ? removeRegionSuffix(regionName) : null;
      
      // 도, 시, 군, 구 정보를 키워드 배열로 전달
      const keywords: string[] = [];
      if (cleanedCityName) {
        keywords.push(cleanedCityName);
      }
      if (cleanedRegionName && cleanedRegionName !== cleanedCityName) {
        keywords.push(cleanedRegionName);
      }
      
      console.log(`[loadRegionNews] 지역 ID: ${regionId}, 지역명: ${regionName}, 시명: ${cityName}`);
      console.log(`[loadRegionNews] 정제된 지역: ${cleanedRegionName}, 정제된 시: ${cleanedCityName}`);
      console.log(`[loadRegionNews] 전달할 keywords 배열:`, keywords);
      
      // 먼저 지역별 뉴스를 가져옵니다
      const newsResponse = await getNewsList(9, token, keywords.length > 0 ? keywords : undefined);
      console.log(`[loadRegionNews] 뉴스 응답:`, newsResponse);
      
      let regionNews: NewsResponse[] = [];
      if (newsResponse && newsResponse.success && newsResponse.data) {
        // 지역별 뉴스 내부 중복 제거 (URL 기준)
        const seenUrls = new Set<string>();
        regionNews = newsResponse.data.filter(news => {
          if (seenUrls.has(news.url)) {
            return false;
          }
          seenUrls.add(news.url);
          return true;
        });
      }
      
      // 지역별 뉴스가 3개 미만이면 일반 부동산 뉴스를 추가로 가져옵니다
      if (regionNews.length < 3) {
        try {
          const generalNewsResponse = await getNewsList(9, token, undefined);
          if (generalNewsResponse && generalNewsResponse.success && generalNewsResponse.data) {
            // 일반 뉴스 내부 중복 제거 (URL 기준)
            const generalSeenUrls = new Set<string>();
            const uniqueGeneralNews = generalNewsResponse.data.filter(news => {
              if (generalSeenUrls.has(news.url)) {
                return false;
              }
              generalSeenUrls.add(news.url);
              return true;
            });
            
            // 지역별 뉴스와 중복 제거 (URL 기준)
            const existingUrls = new Set(regionNews.map(n => n.url));
            const additionalNews = uniqueGeneralNews.filter(n => !existingUrls.has(n.url));
            
            // 최소 3개가 되도록 추가
            const neededCount = 3 - regionNews.length;
            regionNews = [...regionNews, ...additionalNews.slice(0, neededCount)];
          }
        } catch (error) {
          console.error(`Failed to load general news for ${regionId}:`, error);
          // 일반 뉴스 로드 실패해도 지역별 뉴스는 표시
        }
      }
      
      // 최종 중복 제거 (혹시 모를 중복 방지)
      const finalSeenUrls = new Set<string>();
      const finalNews = regionNews.filter(news => {
        if (finalSeenUrls.has(news.url)) {
          return false;
        }
        finalSeenUrls.add(news.url);
        return true;
      });
      
      setRegionNewsMap(prev => ({ ...prev, [regionId]: finalNews }));
    } catch (error) {
      console.error(`Failed to load region news for ${regionId}:`, error);
      setRegionNewsMap(prev => ({ ...prev, [regionId]: [] }));
    } finally {
      setLoadingRegionNews(prev => ({ ...prev, [regionId]: false }));
    }
  };

  const loadNewsDetail = async (newsUrl: string) => {
    setLoadingNewsDetail(true);
    try {
      const token = await getToken();
      const response = await getNewsDetail(newsUrl, token || undefined);
      if (response && response.success && response.data) {
        setSelectedNews(response.data);
      } else {
        toast.error('뉴스 상세 정보를 불러올 수 없습니다.');
      }
    } catch (error) {
      console.error('Failed to load news detail:', error);
      toast.error('뉴스 상세 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoadingNewsDetail(false);
    }
  };

  const loadRegionApartments = async (regionId: number) => {
    setLoadingRegionApartments(prev => ({ ...prev, [regionId]: true }));
    try {
      const apartments = await getApartmentsByRegion(regionId, 5, 0); // 상위 5개만
      setRegionApartmentsMap(prev => ({ ...prev, [regionId]: apartments }));
      
      // 각 아파트의 가격 변화율 로드
      apartments.forEach((apartment) => {
        loadApartmentChangeRate(apartment.apt_id);
      });
    } catch (error) {
      console.error(`Failed to load region apartments for ${regionId}:`, error);
      setRegionApartmentsMap(prev => ({ ...prev, [regionId]: [] }));
    } finally {
      setLoadingRegionApartments(prev => ({ ...prev, [regionId]: false }));
    }
  };

  const loadApartmentChangeRate = async (aptId: number) => {
    // 이미 로드된 데이터가 있으면 스킵
    if (apartmentChangeRates[aptId] !== undefined) {
      return;
    }
    
    setLoadingApartmentChanges(prev => ({ ...prev, [aptId]: true }));
    try {
      const transactions = await getApartmentTransactions(aptId, 'sale', 10, 6); // 최근 6개월 데이터
      
      if (transactions?.change_summary) {
        const changeRate = transactions.change_summary.change_rate;
        setApartmentChangeRates(prev => ({ ...prev, [aptId]: changeRate }));
      } else {
        setApartmentChangeRates(prev => ({ ...prev, [aptId]: null }));
      }
    } catch (error) {
      console.error(`Failed to load apartment change rate for ${aptId}:`, error);
      setApartmentChangeRates(prev => ({ ...prev, [aptId]: null }));
    } finally {
      setLoadingApartmentChanges(prev => ({ ...prev, [aptId]: false }));
    }
  };

  const loadApartmentPrice = async (aptId: number) => {
    // 이미 로드된 데이터가 있으면 스킵
    if (apartmentPricesMap[aptId] !== undefined) {
      return;
    }
    
    try {
      const transactions = await getApartmentTransactions(aptId, 'sale', 1, 1);
      if (transactions?.recent_transactions && transactions.recent_transactions.length > 0) {
        const latestPrice = transactions.recent_transactions[0].price || null;
        setApartmentPricesMap(prev => ({ ...prev, [aptId]: latestPrice }));
      } else {
        setApartmentPricesMap(prev => ({ ...prev, [aptId]: null }));
      }
    } catch (error) {
      console.error(`Failed to load apartment price for ${aptId}:`, error);
      setApartmentPricesMap(prev => ({ ...prev, [aptId]: null }));
    }
  };

  const loadFavoriteLocations = async () => {
    if (!isSignedIn || !getToken) return;
    
    setLoadingLocations(true);
    try {
      const data = await getFavoriteLocations(getToken);
      if (data) {
        const loadedLocations = data.favorites.filter(f => !f.is_deleted);
        setFavoriteLocations(loadedLocations);
        // 로드된 항목에 없는 지역은 해제 중 상태에서 제거
        const loadedRegionIds = new Set(loadedLocations.map(f => f.region_id));
        setUnfavoritingLocations(prev => {
          const newSet = new Set(prev);
          loadedRegionIds.forEach(id => newSet.delete(id));
          return newSet;
        });
        // 선택된 지역이 삭제되었거나 목록에 없으면 첫 번째 지역 선택
        if (loadedLocations.length > 0) {
          const currentSelectedExists = selectedRegionId && loadedRegionIds.has(selectedRegionId);
          if (!currentSelectedExists) {
            setSelectedRegionId(loadedLocations[0].region_id);
          }
        } else {
          setSelectedRegionId(null);
        }
      }
    } catch (error) {
      console.error('Failed to load favorite locations:', error);
    } finally {
      setLoadingLocations(false);
    }
  };

  const loadFavoriteApartments = async () => {
    if (!isSignedIn || !getToken) return;
    
    setLoadingApartments(true);
    try {
      const data = await getFavoriteApartments(getToken);
      if (data) {
        const loadedApartments = data.favorites.filter(f => !f.is_deleted);
        setFavoriteApartments(loadedApartments);
        // 로드된 항목에 없는 아파트는 해제 중 상태에서 제거
        const loadedAptIds = new Set(loadedApartments.map(f => f.apt_id));
        setUnfavoritingApartments(prev => {
          const newSet = new Set(prev);
          loadedAptIds.forEach(id => newSet.delete(id));
          return newSet;
        });
      }
    } catch (error) {
      console.error('Failed to load favorite apartments:', error);
    } finally {
      setLoadingApartments(false);
    }
  };

  // 지역 검색
  useEffect(() => {
    if (!isSearchingLocation || !locationSearchQuery || locationSearchQuery.length < 1) {
      setLocationSearchResults([]);
      return;
    }

    const searchTimer = setTimeout(async () => {
      setSearchingLocation(true);
      try {
        const token = await getToken();
        const results = await searchLocations(locationSearchQuery, token, 'sigungu'); // 시군구만 검색
        setLocationSearchResults(results);
      } catch (error) {
        console.error('Failed to search locations:', error);
      } finally {
        setSearchingLocation(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [locationSearchQuery, isSearchingLocation, getToken]);

  // 아파트 검색
  useEffect(() => {
    if (!isSearchingApartment || !apartmentSearchQuery || apartmentSearchQuery.length < 2) {
      setApartmentSearchResults([]);
      return;
    }

    const searchTimer = setTimeout(async () => {
      setSearchingApartment(true);
      try {
        const token = await getToken();
        const results = await searchApartments(apartmentSearchQuery, token);
        setApartmentSearchResults(results);
      } catch (error) {
        console.error('Failed to search apartments:', error);
      } finally {
        setSearchingApartment(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [apartmentSearchQuery, isSearchingApartment, getToken]);

  const handleAddLocation = async (region: LocationSearchResult) => {
    if (!isSignedIn || !getToken) {
      showWarning('로그인이 필요합니다.');
      return;
    }

    if (!region.region_id) {
      showError('유효하지 않은 지역입니다.');
      return;
    }

    const addedRegionId = region.region_id;
    try {

      await addFavoriteLocation(getToken, addedRegionId);
      toast.success('즐겨찾는 지역에 추가되었습니다.');

      setIsSearchingLocation(false);
      setLocationSearchQuery('');
      await loadFavoriteLocations();
      // 추가된 지역을 선택 상태로 설정 (파란색으로 표시)
      setSelectedRegionId(addedRegionId);
      // 스크롤을 오른쪽 끝으로 이동하여 추가된 지역이 보이도록 함
      setTimeout(() => {
        if (locationsScrollRef.current) {
          locationsScrollRef.current.scrollLeft = locationsScrollRef.current.scrollWidth;
        }
      }, 100);
    } catch (error: any) {
      console.error('지역 추가 실패:', error);
      if (error.response?.status === 404) {
        showError('지역을 찾을 수 없습니다.');
      } else if (error.response?.status === 409 || error.message?.includes('이미 추가')) {
        showInfo('이미 즐겨찾기에 추가된 지역입니다.');
      } else if (error.response?.status === 400 || error.message?.includes('제한')) {
        showError('즐겨찾기 지역은 최대 50개까지 추가할 수 있습니다.');
      } else if (error.response?.status === 500) {
        showError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        showError('지역 추가에 실패했습니다.');
      }
    }
  };

  const handleDeleteLocation = async (regionId: number) => {
    if (!isSignedIn || !getToken) return;

    // 즉시 회색으로 변경 (애니메이션)
    setUnfavoritingLocations(prev => new Set(prev).add(regionId));

    try {
      await deleteFavoriteLocation(getToken, regionId);

      toast.success('즐겨찾는 지역에서 제거되었습니다.');
      // 애니메이션을 0.2초 더 보여주기 위해 지연
      await new Promise(resolve => setTimeout(resolve, 200));
      await loadFavoriteLocations();
    } catch (error) {
      // 실패 시 회색 상태 해제
      setUnfavoritingLocations(prev => {
        const newSet = new Set(prev);
        newSet.delete(regionId);
        return newSet;
      });
      toast.error('지역 제거에 실패했습니다.');

    }
  };

  const handleAddApartment = async (apartment: ApartmentSearchResult) => {
    if (!isSignedIn || !getToken) {
      showWarning('로그인이 필요합니다.');
      return;
    }

    try {
      await addFavoriteApartment(getToken, apartment.apt_id);

      toast.success('즐겨찾는 매물에 추가되었습니다.');

      setIsSearchingApartment(false);
      setApartmentSearchQuery('');
      await loadFavoriteApartments();
    } catch (error: any) {
      if (error.message?.includes('이미 추가')) {
        showInfo('이미 즐겨찾기에 추가된 아파트입니다.');
      } else if (error.message?.includes('제한')) {
        showError('즐겨찾기 아파트는 최대 100개까지 추가할 수 있습니다.');
      } else {
        showError('아파트 추가에 실패했습니다.');
      }
    }
  };

  const handleDeleteApartment = async (aptId: number) => {
    if (!isSignedIn || !getToken) return;

    // 즉시 회색으로 변경 (애니메이션)
    setUnfavoritingApartments(prev => new Set(prev).add(aptId));

    try {
      await deleteFavoriteApartment(getToken, aptId);

      toast.success('즐겨찾는 매물에서 제거되었습니다.');
      // 애니메이션을 0.2초 더 보여주기 위해 지연
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadFavoriteApartments();
    } catch (error) {
      // 실패 시 회색 상태 해제
      setUnfavoritingApartments(prev => {
        const newSet = new Set(prev);
        newSet.delete(aptId);
        return newSet;
      });
      toast.error('아파트 제거에 실패했습니다.');

    }
  };

  const textPrimary = isDarkMode ? 'text-white' : 'text-zinc-900';
  const textSecondary = isDarkMode ? 'text-zinc-400' : 'text-zinc-600';
  const textMuted = isDarkMode ? 'text-zinc-500' : 'text-zinc-500';

  // 뉴스 상세 페이지 표시
  if (selectedNews) {
    return (
      <div className={`w-full min-h-screen ${isDarkMode ? 'bg-zinc-950' : 'bg-white'}`}>
        <div className="sticky top-0 z-10 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setSelectedNews(null)}
              className={`p-2 rounded-xl transition-colors ${
                isDarkMode
                  ? 'bg-zinc-800/50 hover:bg-zinc-800'
                  : 'bg-white hover:bg-sky-50 border border-sky-200'
              }`}
            >
              <ArrowLeft className="w-5 h-5 text-sky-500" />
            </button>
            <h1 className={`text-lg font-bold ${textPrimary}`}>뉴스 상세</h1>
          </div>
        </div>
        
        <div className="px-4 py-6 max-w-3xl mx-auto">
          {loadingNewsDetail ? (
            <div className={`text-center py-12 ${textSecondary}`}>로딩 중...</div>
          ) : (
            <div className="space-y-6">
              {/* 제목 */}
              <h2 className={`text-2xl font-bold leading-tight ${textPrimary}`}>
                {selectedNews.title}
              </h2>
              
              {/* 메타 정보 */}
              <div className="flex items-center gap-3 flex-wrap">
                {selectedNews.category && (
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    isDarkMode 
                      ? 'bg-zinc-800 text-zinc-400' 
                      : 'bg-sky-50 text-sky-700'
                  }`}>
                    {selectedNews.category}
                  </span>
                )}
                <span className={`text-sm ${textSecondary}`}>
                  {selectedNews.source}
                </span>
                <span className={`text-sm ${textMuted}`}>·</span>
                <span className={`text-sm ${textSecondary}`}>
                  {formatTimeAgo(selectedNews.published_at)}
                </span>
              </div>
              
              {/* 이미지들 (중복 제거) */}
              {(() => {
                // 썸네일과 images 배열에서 중복 제거
                const allImages: string[] = [];
                if (selectedNews.thumbnail_url) {
                  allImages.push(selectedNews.thumbnail_url);
                }
                if (selectedNews.images && selectedNews.images.length > 0) {
                  // thumbnail_url과 중복되지 않는 이미지만 추가
                  selectedNews.images.forEach(img => {
                    if (img !== selectedNews.thumbnail_url && !allImages.includes(img)) {
                      allImages.push(img);
                    }
                  });
                }
                
                return allImages.length > 0 ? (
                  <div className="space-y-4">
                    {allImages.map((imageUrl, index) => (
                      <div key={index} className="w-full rounded-2xl overflow-hidden">
                        <img 
                          src={imageUrl} 
                          alt={index === 0 ? selectedNews.title : `${selectedNews.title} - 이미지 ${index}`}
                          className="w-full h-auto object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
              
              {/* 내용 */}
              {selectedNews.content && (
                <div 
                  className={`text-base leading-relaxed ${textPrimary}`}
                  style={{
                    wordBreak: 'keep-all',
                    lineHeight: '1.8'
                  }}
                  dangerouslySetInnerHTML={{ __html: selectedNews.content }}
                />
              )}
              
              {/* 원문 링크 */}
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <a
                  href={selectedNews.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline`}
                >
                  원문 보기
                  <ChevronRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 로그인하지 않은 경우
  if (!isSignedIn) {
    return (
      <div className={`w-full ${isDesktop ? 'space-y-6 max-w-6xl mx-auto' : 'space-y-5 px-2'}`}>
        <div className={`rounded-2xl p-8 text-center ${isDarkMode ? 'bg-transparent' : 'bg-transparent'}`}>
          <Star className={`w-16 h-16 mx-auto mb-4 ${textMuted}`} />
          <h2 className={`text-xl font-bold mb-2 ${textPrimary}`}>로그인이 필요합니다</h2>
          <p className={`mb-6 ${textSecondary}`}>즐겨찾기 기능을 사용하려면 로그인해주세요.</p>
          <SafeSignInButton mode="modal">
            <button className={`px-6 py-3 rounded-xl font-medium transition-all ${
              isDarkMode
                ? 'bg-sky-600 hover:bg-sky-700 text-white'
                : 'bg-sky-500 hover:bg-sky-600 text-white'
            }`}>
              로그인하기
            </button>
          </SafeSignInButton>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${isDesktop ? 'space-y-6 max-w-6xl mx-auto' : 'space-y-5'}`}>
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} isDarkMode={isDarkMode} />

      {/* Tab Selector */}
      <div className={`flex gap-2 p-1.5 rounded-2xl ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
        <button
          onClick={() => {
            setActiveTab('regions');
            setIsSearchingLocation(false);
            setIsSearchingApartment(false);
          }}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'regions'
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
              : isDarkMode
              ? 'text-zinc-400 hover:text-white'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          즐겨찾는 지역
        </button>
        <button
          onClick={() => {
            setActiveTab('apartments');
            setIsSearchingLocation(false);
            setIsSearchingApartment(false);
          }}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'apartments'
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
              : isDarkMode
              ? 'text-zinc-400 hover:text-white'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          즐겨찾는 매물
        </button>
      </div>

      {/* 즐겨찾는 지역 */}
      {activeTab === 'regions' && (
        <AnimatePresence mode="wait">
          {isSearchingLocation ? (
            <motion.div
              key="location-search"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* 검색 헤더 */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsSearchingLocation(false);
                    setLocationSearchQuery('');
                    setLocationSearchResults([]);
                  }}
                  className={`p-2 rounded-xl transition-colors ${
                    isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-white hover:bg-zinc-50'
                  }`}
                >
                  <X className="w-5 h-5 text-sky-500" />
                </button>
                <h2 className={`text-xl font-bold ${textPrimary}`}>지역 검색</h2>
              </div>

              {/* 검색 입력 */}
              <div className={`relative ${isDarkMode ? 'bg-zinc-900' : 'bg-white'} rounded-2xl p-4`}>
                <div className="flex items-center gap-3">
                  <Search className={`w-5 h-5 ${textMuted}`} />
                  <input
                    type="text"
                    value={locationSearchQuery}
                    onChange={(e) => setLocationSearchQuery(e.target.value)}
                    placeholder="시/군/구를 검색하세요 (예: 강남구)"
                    className={`flex-1 bg-transparent ${textPrimary} placeholder:${textMuted} outline-none`}
                    autoFocus
                  />
                  {searchingLocation && (
                    <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              </div>

              {/* 검색 결과 */}
              {locationSearchResults.length > 0 && (
                <div className="space-y-2">
                  {locationSearchResults.map((region) => {
                    const isAlreadyAdded = favoriteLocations.some(f => f.region_id === region.region_id);
                    return (
                      <motion.div
                        key={region.region_id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`rounded-xl p-4 flex items-center justify-between ${
                          isDarkMode ? 'bg-zinc-900' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className={`w-5 h-5 ${textSecondary}`} />
                          <div>
                            <p className={`font-semibold ${textPrimary}`}>{region.full_name || region.region_name}</p>
                            <p className={`text-sm ${textSecondary}`}>{region.city_name}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => !isAlreadyAdded && handleAddLocation(region)}
                          disabled={isAlreadyAdded}
                          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                            isAlreadyAdded
                              ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
                              : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                          }`}
                        >
                          {isAlreadyAdded ? '추가됨' : '추가'}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {locationSearchQuery.length >= 1 && !searchingLocation && locationSearchResults.length === 0 && (
                <div className={`text-center py-8 ${textSecondary}`}>
                  <p>검색 결과가 없습니다.</p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="location-list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5"
            >
              {/* 지역 Pill 탭 */}
              {loadingLocations ? (
                <div className={`text-center py-8 ${textSecondary}`}>로딩 중...</div>
              ) : favoriteLocations.length > 0 ? (
                <div className="space-y-4">
                  {/* 목록과 추가 버튼을 나란히 배치 */}
                  <div className="flex items-center gap-2">
                    {/* 목록 영역 - 버튼을 제외한 나머지 공간, 그라데이션 마스크 적용 */}
                    <div className="flex-1 relative overflow-hidden">
                      <div 
                        ref={locationsScrollRef} 
                        className="flex gap-2 overflow-x-auto overflow-y-hidden scrollbar-hide pb-2 pr-2"
                      >
                    {favoriteLocations.map((fav) => {
                      // 백엔드 응답 구조에 맞춤: region_name, city_name이 직접 포함됨
                      const regionName = fav.region_name || fav.location?.region_name || '';
                      const cityName = fav.city_name || fav.location?.city_name || '';
                      const isSelected = selectedRegionId === fav.region_id;
                      return (
                        <motion.div
                          key={fav.favorite_id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="group relative flex-shrink-0"
                        >
                          <button
                            onClick={() => setSelectedRegionId(fav.region_id)}
                            className={`px-5 py-2.5 rounded-full font-semibold text-sm transition-all whitespace-nowrap ${
                              isSelected
                                ? isDarkMode
                                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30 ring-2 ring-sky-400'
                                  : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30 ring-2 ring-sky-400'
                                : isDarkMode
                                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{regionName}</span>
                              {cityName && <span className="text-xs opacity-70">{cityName}</span>}
                            </div>
                          </button>
                        </motion.div>
                      );
                    })}
                      </div>
                      {/* 그라데이션 마스크 - 오른쪽 10px 지점부터 투명하게 */}
                      <div 
                        className={`absolute right-10 top-0 bottom-2 w-10 pointer-events-none ${
                          isDarkMode 
                            ? 'bg-gradient-to-l from-transparent to-zinc-950' 
                            : 'bg-gradient-to-l from-transparent to-white'
                        }`}
                      />
                    </div>
                    {/* 추가 버튼 - 고정 위치 (오른쪽 끝) */}
                    <button
                      onClick={() => setIsSearchingLocation(true)}
                      className={`flex-shrink-0 p-2 rounded-full transition-all ${
                        isDarkMode
                          ? 'bg-gradient-to-br from-sky-500 to-blue-600 hover:shadow-lg hover:shadow-sky-500/30'
                          : 'bg-gradient-to-br from-sky-500 to-blue-600 hover:shadow-lg hover:shadow-sky-500/30'
                      }`}
                    >
                      <Plus className="w-5 h-5 text-white" />
                    </button>
                  </div>
                  
                  {/* 선택된 지역의 통계 정보 */}
                  {selectedRegionId && (() => {
                    const selectedFav = favoriteLocations.find(f => f.region_id === selectedRegionId);
                    if (!selectedFav) return null;
                    
                    const stats = regionStatsMap[selectedRegionId];
                    const isLoadingStats = loadingRegionStats[selectedRegionId];
                    const regionName = selectedFav.region_name || selectedFav.location?.region_name || '';
                    const cityName = selectedFav.city_name || selectedFav.location?.city_name || '';
                    
                    return (
                      <motion.div
                        key={`stats-${selectedRegionId}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`rounded-2xl border overflow-hidden ${
                          isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                        }`}
                      >
                        {/* 헤더 */}
                        <div className={`p-5 pb-3 border-b ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <MapPin className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                              <div>
                                <h3 className={`font-bold text-lg ${textPrimary}`}>
                                  {regionName}
                                  {cityName && <span className="text-sm font-normal opacity-70 ml-1">({cityName})</span>}
                                </h3>
                                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                  지역 통계 정보
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLocation(selectedRegionId);
                              }}
                              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 relative overflow-hidden ${
                                unfavoritingLocations.has(selectedRegionId)
                                  ? isDarkMode
                                    ? 'bg-zinc-800 text-zinc-400 border-2 border-zinc-700'
                                    : 'bg-white text-zinc-400 border-2 border-zinc-200'
                                  : 'bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 text-yellow-900 border-2 border-yellow-400 shadow-lg shadow-yellow-500/50 ring-2 ring-yellow-400/50 hover:scale-110'
                              }`}
                            >
                              <Star className={`w-4 h-4 ${unfavoritingLocations.has(selectedRegionId) ? '' : 'fill-current'}`} />
                            </button>
                          </div>
                        </div>
                        
                        {/* 통계 정보 */}
                        <div className="px-5 pt-4 pb-6">
                        
                        {isLoadingStats ? (
                          <div className={`text-center py-4 ${textSecondary}`}>통계 로딩 중...</div>
                        ) : stats ? (
                          <div className="space-y-4">
                            {/* 평균 집값 */}
                            <div className="flex items-center justify-between py-1.5">
                              <span className={`text-sm ${textSecondary}`}>평균 집값</span>
                              <span className={`font-semibold text-base ${textPrimary}`}>
                                {stats.avg_price_per_pyeong > 0 
                                  ? `${Math.round(stats.avg_price_per_pyeong).toLocaleString()}만원/평`
                                  : '데이터 없음'}
                              </span>
                            </div>
                            
                            {/* 상승률/하락률 */}
                            <div className="flex items-center justify-between py-1.5">
                              <span className={`text-sm ${textSecondary}`}>가격 변화</span>
                              <div className="flex items-center gap-1">
                                {stats.change_rate > 0 ? (
                                  <>
                                    <TrendingUp className="w-4 h-4 text-red-500" />
                                    <span className="font-semibold text-sm text-red-500">+{stats.change_rate.toFixed(1)}%</span>
                                  </>
                                ) : stats.change_rate < 0 ? (
                                  <>
                                    <TrendingDown className="w-4 h-4 text-blue-500" />
                                    <span className="font-semibold text-sm text-blue-500">{stats.change_rate.toFixed(1)}%</span>
                                  </>
                                ) : (
                                  <span className={`font-medium text-sm ${textSecondary}`}>변동 없음</span>
                                )}
                              </div>
                            </div>
                            
                            {/* 거래량 */}
                            <div className="flex items-center justify-between py-1.5">
                              <span className={`text-sm ${textSecondary}`}>최근 거래량</span>
                              <span className={`font-medium text-sm ${textPrimary}`}>
                                {stats.transaction_count}건
                              </span>
                            </div>
                            
                            {/* 아파트 수 */}
                            <div className="flex items-center justify-between py-1.5">
                              <span className={`text-sm ${textSecondary}`}>아파트 수</span>
                              <span className={`font-medium text-sm ${textPrimary}`}>
                                {stats.apartment_count}개
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className={`text-center py-4 text-sm ${textSecondary}`}>
                            통계 데이터를 불러올 수 없습니다
                          </div>
                        )}
                        </div>
                      </motion.div>
                    );
                  })()}
                  
                  {/* 뉴스 섹션 */}
                  {selectedRegionId && (() => {
                    const news = regionNewsMap[selectedRegionId];
                    const isLoadingNews = loadingRegionNews[selectedRegionId];
                        
                        return (
                          <motion.div
                            key={`news-${selectedRegionId}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`rounded-2xl overflow-hidden border mt-4 ${
                              isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                            }`}
                          >
                            <div className="p-5 pb-3">
                              <h2 className={`font-bold flex items-center gap-2 ${textPrimary}`}>
                                <Newspaper className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                                주요 뉴스
                              </h2>
                              <p className={`text-xs mt-0.5 ${textSecondary}`}>
                                부동산 시장 소식
                              </p>
                            </div>
                            
                            {isLoadingNews ? (
                              <div className={`text-center py-8 ${textSecondary}`}>뉴스 로딩 중...</div>
                            ) : news && news.length > 0 ? (
                              <>
                                <div>
                                  {(() => {
                                    const currentPage = regionNewsPageMap[selectedRegionId] || 0;
                                    const startIndex = currentPage * 3;
                                    const endIndex = startIndex + 3;
                                    const currentNews = news.slice(startIndex, endIndex);
                                    
                                    return currentNews.map((newsItem) => (
                                      <button
                                        key={newsItem.id}
                                        onClick={() => loadNewsDetail(newsItem.url)}
                                        className={`w-full p-4 text-left transition-all active:scale-[0.98] border-t ${
                                          isDarkMode
                                            ? 'hover:bg-zinc-800/50 active:bg-zinc-800/70 border-zinc-800'
                                            : 'hover:bg-sky-50/50 active:bg-sky-50 border-zinc-200'
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <h3 className={`font-semibold leading-snug mb-2 ${textPrimary}`}>
                                              {newsItem.title}
                                            </h3>
                                            <div className="flex items-center gap-2 flex-wrap">
                                              {newsItem.category && (
                                                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                                                  isDarkMode 
                                                    ? 'bg-zinc-800 text-zinc-400' 
                                                    : 'bg-sky-50 text-sky-700'
                                                }`}>
                                                  {newsItem.category}
                                                </span>
                                              )}
                                              <span className={`text-xs ${textSecondary}`}>
                                                {newsItem.source}
                                              </span>
                                              <span className={`text-xs ${textMuted}`}>
                                                ·
                                              </span>
                                              <span className={`text-xs ${textSecondary}`}>
                                                {formatTimeAgo(newsItem.published_at)}
                                              </span>
                                            </div>
                                          </div>
                                          <ChevronRight className={`w-5 h-5 flex-shrink-0 ${isDarkMode ? 'text-zinc-700' : 'text-zinc-300'}`} />
                                        </div>
                                      </button>
                                    ));
                                  })()}
                                </div>
                                
                                {/* 페이지네이션 인덱스 */}
                                {news.length > 3 && (
                                  <div className="flex items-center justify-center gap-2 px-5 py-4 border-t border-zinc-200 dark:border-zinc-800">
                                    {[0, 1, 2].map((pageIndex) => {
                                      const currentPage = regionNewsPageMap[selectedRegionId] || 0;
                                      const hasNews = news.length > pageIndex * 3;
                                      
                                      if (!hasNews) return null;
                                      
                                      return (
                                        <button
                                          key={pageIndex}
                                          onClick={() => {
                                            setRegionNewsPageMap(prev => ({
                                              ...prev,
                                              [selectedRegionId]: pageIndex
                                            }));
                                          }}
                                          className={`w-8 h-8 rounded-full text-sm font-semibold transition-all ${
                                            currentPage === pageIndex
                                              ? isDarkMode
                                                ? 'bg-sky-500 text-white'
                                                : 'bg-sky-500 text-white'
                                              : isDarkMode
                                                ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                          }`}
                                        >
                                          {pageIndex + 1}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className={`text-center py-8 text-sm ${textSecondary}`}>
                                관련 뉴스가 없습니다
                              </div>
                            )}
                          </motion.div>
                        );
                      })()}
                  
                  {/* 아파트 실시간 정보 섹션 */}
                  {selectedRegionId && (() => {
                    const apartments = regionApartmentsMap[selectedRegionId];
                    const isLoadingApartments = loadingRegionApartments[selectedRegionId];
                    
                    return (
                      <motion.div
                        key={`apartments-${selectedRegionId}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`rounded-2xl overflow-hidden border mt-4 ${
                          isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                        }`}
                      >
                        <div className="p-5 pb-3">
                          <h2 className={`font-bold ${textPrimary}`}>
                            아파트 실시간 정보
                          </h2>
                          <p className={`text-xs mt-0.5 ${textSecondary}`}>
                            지역별 아파트 시세 정보
                          </p>
                        </div>
                        
                        {isLoadingApartments ? (
                          <div className={`text-center py-8 ${textSecondary}`}>아파트 정보 로딩 중...</div>
                        ) : apartments && apartments.length > 0 ? (
                          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {apartments.slice(0, 5).map((apartment, index) => {
                              return (
                                <button
                                  key={apartment.apt_id}
                                  onClick={() => onApartmentClick && onApartmentClick(apartment)}
                                  className={`w-full p-4 text-left transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:scale-[0.98] ${
                                    isDarkMode ? '' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-4">
                                    {/* 랭킹 배지 */}
                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                      index === 0
                                        ? 'bg-gradient-to-br from-sky-500 to-blue-600 text-white'
                                        : isDarkMode
                                        ? 'bg-zinc-800 text-zinc-400'
                                        : 'bg-zinc-100 text-zinc-600'
                                    }`}>
                                      {index + 1}
                                    </div>
                                    
                                    {/* 아파트 정보 */}
                                    <div className="flex-1 min-w-0">
                                      <h3 className={`font-semibold mb-1 ${textPrimary} truncate`}>
                                        {apartment.apt_name}
                                      </h3>
                                      <p className={`text-xs ${textSecondary} truncate`}>
                                        {apartment.address || apartment.sigungu_name}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className={`text-center py-8 text-sm ${textSecondary}`}>
                            해당 지역의 아파트 정보가 없습니다
                          </div>
                        )}
                      </motion.div>
                    );
                  })()}
                </div>
              ) : (
                <div className={`text-center py-12 ${textSecondary}`}>
                  <MapPin className={`w-16 h-16 mx-auto mb-4 ${textMuted} opacity-50`} />
                  <p className="mb-2">즐겨찾는 지역이 없습니다</p>
                  <button
                    onClick={() => setIsSearchingLocation(true)}
                    className={`mt-4 px-6 py-2 rounded-lg font-semibold transition-all ${
                      isDarkMode
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                        : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                    }`}
                  >
                    지역 추가하기
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* 즐겨찾는 매물 */}
      {activeTab === 'apartments' && (
        <AnimatePresence mode="wait">
          {isSearchingApartment ? (
            <motion.div
              key="apartment-search"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* 검색 헤더 */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsSearchingApartment(false);
                    setApartmentSearchQuery('');
                    setApartmentSearchResults([]);
                  }}
                  className={`p-2 rounded-xl transition-colors ${
                    isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-white hover:bg-zinc-50'
                  }`}
                >
                  <X className="w-5 h-5 text-sky-500" />
                </button>
                <h2 className={`text-xl font-bold ${textPrimary}`}>아파트 검색</h2>
              </div>

              {/* 검색 입력 */}
              <div className={`relative ${isDarkMode ? 'bg-zinc-900' : 'bg-white'} rounded-2xl p-4`}>
                <div className="flex items-center gap-3">
                  <Search className={`w-5 h-5 ${textMuted}`} />
                  <input
                    type="text"
                    value={apartmentSearchQuery}
                    onChange={(e) => setApartmentSearchQuery(e.target.value)}
                    placeholder="아파트명을 검색하세요 (예: 래미안)"
                    className={`flex-1 bg-transparent ${textPrimary} placeholder:${textMuted} outline-none`}
                    autoFocus
                  />
                  {searchingApartment && (
                    <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              </div>

              {/* 검색 결과 */}
              {apartmentSearchResults.length > 0 && (
                <div className="space-y-2">
                  {apartmentSearchResults.map((apartment) => {
                    const isAlreadyAdded = favoriteApartments.some(f => f.apt_id === apartment.apt_id);
                    return (
                      <motion.div
                        key={apartment.apt_id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`rounded-xl p-4 flex items-center justify-between ${
                          isDarkMode ? 'bg-zinc-900' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Building2 className={`w-5 h-5 ${textSecondary}`} />
                          <div className="flex-1">
                            <p className={`font-semibold ${textPrimary}`}>{apartment.apt_name}</p>
                            <p className={`text-sm ${textSecondary}`}>{apartment.address}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => !isAlreadyAdded && handleAddApartment(apartment)}
                          disabled={isAlreadyAdded}
                          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                            isAlreadyAdded
                              ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
                              : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                          }`}
                        >
                          {isAlreadyAdded ? '추가됨' : '추가'}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {apartmentSearchQuery.length >= 2 && !searchingApartment && apartmentSearchResults.length === 0 && (
                <div className={`text-center py-8 ${textSecondary}`}>
                  <p>검색 결과가 없습니다.</p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="apartment-list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5"
            >
              {/* 아파트 목록 헤더 */}
              <div className="flex items-center justify-between">
                <h2 className={`text-xl font-bold ${textPrimary}`}>즐겨찾는 매물</h2>
                <button
                  onClick={() => setIsSearchingApartment(true)}
                  className={`p-2 rounded-full transition-all ${
                    isDarkMode
                      ? 'bg-gradient-to-br from-sky-500 to-blue-600 hover:shadow-lg hover:shadow-sky-500/30'
                      : 'bg-gradient-to-br from-sky-500 to-blue-600 hover:shadow-lg hover:shadow-sky-500/30'
                  }`}
                >
                  <Plus className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* 아파트 목록 */}
              {loadingApartments ? (
                <div className={`text-center py-8 ${textSecondary}`}>로딩 중...</div>
              ) : favoriteApartments.length > 0 ? (
                <div className={isDesktop ? "grid grid-cols-2 gap-3" : "space-y-3"}>
                  {favoriteApartments.map((fav, index) => {
                    // 백엔드 응답 구조에 맞춤: apt_name이 직접 포함됨
                    const aptName = fav.apt_name || fav.apartment?.apt_name || '이름 없음';
                    const address = fav.apartment?.address || (fav.region_name && fav.city_name ? `${fav.city_name} ${fav.region_name}` : '주소 없음');
                    return (
                      <motion.div
                        key={fav.favorite_id}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                        onClick={() => onApartmentClick && onApartmentClick({ apt_id: fav.apt_id, apt_name: aptName, address })}
                        className={`rounded-2xl p-5 cursor-pointer transition-all hover:shadow-xl ${
                          isDarkMode
                            ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800'
                            : 'bg-white border border-sky-100 shadow-lg'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Building2 className={`w-4 h-4 ${textSecondary}`} />
                              <h3 className={`font-bold ${textPrimary}`}>{aptName}</h3>
                            </div>
                            <p className={`text-xs ${textSecondary} mb-2`}>{address}</p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteApartment(fav.apt_id);
                            }}
                            className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 relative overflow-hidden ${
                              unfavoritingApartments.has(fav.apt_id)
                                ? isDarkMode
                                  ? 'bg-zinc-800 text-zinc-400 border-2 border-zinc-700'
                                  : 'bg-white text-zinc-400 border-2 border-zinc-200'
                                : 'bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 text-yellow-900 border-2 border-yellow-400 shadow-lg shadow-yellow-500/50 ring-2 ring-yellow-400/50 hover:scale-110'
                            }`}
                          >
                            <Star className={`w-5 h-5 ${unfavoritingApartments.has(fav.apt_id) ? '' : 'fill-current'}`} />
                          </button>
                        </div>
                        {fav.nickname && (
                          <div className={`text-sm ${textSecondary} mb-2`}>
                            별칭: {fav.nickname}
                          </div>
                        )}
                        {fav.memo && (
                          <div className={`text-xs ${textMuted}`}>
                            {fav.memo}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className={`text-center py-12 ${textSecondary}`}>
                  <Building2 className={`w-16 h-16 mx-auto mb-4 ${textMuted} opacity-50`} />
                  <p className="mb-2">즐겨찾는 매물이 없습니다</p>
                  <button
                    onClick={() => setIsSearchingApartment(true)}
                    className={`mt-4 px-6 py-2 rounded-lg font-semibold transition-all ${
                      isDarkMode
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                        : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/30'
                    }`}
                  >
                    아파트 추가하기
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
