import React, { useState, useEffect } from 'react';
import { Star, MapPin, Plus, X, Search, Building2, TrendingUp, TrendingDown, Home, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/clerk';
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
import { searchLocations, LocationSearchResult } from '../lib/searchApi';
import { searchApartments, ApartmentSearchResult } from '../lib/searchApi';
import { getApartmentTransactions } from '../lib/apartmentApi';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './ui/Toast';
import { useDynamicIslandToast } from './ui/DynamicIslandToast';

interface FavoritesProps {
  onApartmentClick?: (apartment: any) => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

export default function Favorites({ onApartmentClick, isDarkMode, isDesktop = false }: FavoritesProps) {
  const { isSignedIn, getToken } = useAuth();
  const toast = useToast();
  const { showToast: showDynamicToast, ToastComponent } = useDynamicIslandToast(isDarkMode, 3000);
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
    if (isSignedIn && getToken) {
      loadFavoriteLocations();
      loadFavoriteApartments();
    } else {
      setFavoriteLocations([]);
      setFavoriteApartments([]);
    }
  }, [isSignedIn, getToken, activeTab]);

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

  const loadApartmentPrice = async (aptId: number) => {
    try {
      const transactions = await getApartmentTransactions(aptId, 'sale', 1, 1);
      if (transactions?.recent_transactions && transactions.recent_transactions.length > 0) {
        const latestPrice = transactions.recent_transactions[0].trans_price || null;
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
        setFavoriteLocations(data.favorites.filter(f => !f.is_deleted));
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
        setFavoriteApartments(data.favorites.filter(f => !f.is_deleted));
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
      toast.warning('로그인이 필요합니다.');
      return;
    }

    if (!region.region_id) {
      toast.error('유효하지 않은 지역입니다.');
      return;
    }

    try {
      await addFavoriteLocation(getToken, region.region_id);
      toast.success('즐겨찾는 지역에 추가되었습니다.');
      showDynamicToast('즐겨찾는 지역에 추가되었습니다.');
      setIsSearchingLocation(false);
      setLocationSearchQuery('');
      await loadFavoriteLocations();
    } catch (error: any) {
      console.error('지역 추가 실패:', error);
      if (error.response?.status === 404) {
        toast.error('지역을 찾을 수 없습니다.');
      } else if (error.response?.status === 409 || error.message?.includes('이미 추가')) {
        toast.info('이미 즐겨찾기에 추가된 지역입니다.');
      } else if (error.response?.status === 400 || error.message?.includes('제한')) {
        toast.error('즐겨찾기 지역은 최대 50개까지 추가할 수 있습니다.');
      } else if (error.response?.status === 500) {
        toast.error('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        toast.error('지역 추가에 실패했습니다.');
      }
    }
  };

  const handleDeleteLocation = async (regionId: number) => {
    if (!isSignedIn || !getToken) return;

    try {
      await deleteFavoriteLocation(getToken, regionId);
      toast.success('즐겨찾는 지역에서 제거되었습니다.');
      showDynamicToast('즐겨찾는 지역에서 제거되었습니다.');
      await loadFavoriteLocations();
    } catch (error) {
      toast.error('지역 제거에 실패했습니다.');
    }
  };

  const handleAddApartment = async (apartment: ApartmentSearchResult) => {
    if (!isSignedIn || !getToken) {
      toast.warning('로그인이 필요합니다.');
      return;
    }

    try {
      await addFavoriteApartment(getToken, apartment.apt_id);
      toast.success('즐겨찾는 매물에 추가되었습니다.');
      showDynamicToast('즐겨찾는 매물에 추가되었습니다.');
      setIsSearchingApartment(false);
      setApartmentSearchQuery('');
      await loadFavoriteApartments();
    } catch (error: any) {
      if (error.message?.includes('이미 추가')) {
        toast.info('이미 즐겨찾기에 추가된 아파트입니다.');
      } else if (error.message?.includes('제한')) {
        toast.error('즐겨찾기 아파트는 최대 100개까지 추가할 수 있습니다.');
      } else {
        toast.error('아파트 추가에 실패했습니다.');
      }
    }
  };

  const handleDeleteApartment = async (aptId: number) => {
    if (!isSignedIn || !getToken) return;

    try {
      await deleteFavoriteApartment(getToken, aptId);
      toast.success('즐겨찾는 매물에서 제거되었습니다.');
      showDynamicToast('즐겨찾는 매물에서 제거되었습니다.');
      await loadFavoriteApartments();
    } catch (error) {
      toast.error('아파트 제거에 실패했습니다.');
    }
  };

  const textPrimary = isDarkMode ? 'text-white' : 'text-zinc-900';
  const textSecondary = isDarkMode ? 'text-zinc-400' : 'text-zinc-600';
  const textMuted = isDarkMode ? 'text-zinc-500' : 'text-zinc-500';

  // 로그인하지 않은 경우
  if (!isSignedIn) {
    return (
      <div className={`w-full ${isDesktop ? 'space-y-6 max-w-6xl mx-auto' : 'space-y-5'}`}>
        <div className={`rounded-2xl p-8 text-center ${isDarkMode ? 'bg-zinc-900' : 'bg-white'}`}>
          <Star className={`w-16 h-16 mx-auto mb-4 ${textMuted}`} />
          <h2 className={`text-xl font-bold mb-2 ${textPrimary}`}>로그인이 필요합니다</h2>
          <p className={textSecondary}>즐겨찾기 기능을 사용하려면 로그인해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${isDesktop ? 'space-y-6 max-w-6xl mx-auto' : 'space-y-5'}`}>
      {/* 다이나믹 아일랜드 토스트 */}
      {ToastComponent}
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
              {/* 지역 목록 헤더 */}
              <div className="flex items-center justify-between">
                <h2 className={`text-xl font-bold ${textPrimary}`}>즐겨찾는 지역</h2>
              </div>

              {/* 지역 Pill 탭 */}
              {loadingLocations ? (
                <div className={`text-center py-8 ${textSecondary}`}>로딩 중...</div>
              ) : favoriteLocations.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
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
                          className="group relative"
                        >
                          <button
                            onClick={() => setSelectedRegionId(fav.region_id)}
                            className={`w-full px-5 py-2.5 rounded-full font-semibold text-sm transition-all ${
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
                              <MapPin className="w-4 h-4" />
                              <span>{regionName}</span>
                              {cityName && <span className="text-xs opacity-70">{cityName}</span>}
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLocation(fav.region_id);
                              if (selectedRegionId === fav.region_id) {
                                const remaining = favoriteLocations.filter(f => f.region_id !== fav.region_id);
                                setSelectedRegionId(remaining.length > 0 ? remaining[0].region_id : null);
                              }
                            }}
                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </motion.div>
                      );
                    })}
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
                        className={`rounded-2xl p-5 ${
                          isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <MapPin className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                          <h3 className={`font-bold text-lg ${textPrimary}`}>
                            {regionName}
                            {cityName && <span className="text-sm font-normal opacity-70 ml-1">({cityName})</span>}
                          </h3>
                        </div>
                        
                        {isLoadingStats ? (
                          <div className={`text-center py-4 ${textSecondary}`}>통계 로딩 중...</div>
                        ) : stats ? (
                          <div className="space-y-3">
                            {/* 평균 집값 */}
                            <div className="flex items-center justify-between">
                              <span className={`text-sm ${textSecondary}`}>평균 집값</span>
                              <span className={`font-bold text-lg ${textPrimary}`}>
                                {stats.avg_price_per_pyeong > 0 
                                  ? `${Math.round(stats.avg_price_per_pyeong).toLocaleString()}만원/평`
                                  : '데이터 없음'}
                              </span>
                            </div>
                            
                            {/* 상승률/하락률 */}
                            <div className="flex items-center justify-between">
                              <span className={`text-sm ${textSecondary}`}>가격 변화</span>
                              <div className="flex items-center gap-1">
                                {stats.change_rate > 0 ? (
                                  <>
                                    <TrendingUp className="w-4 h-4 text-red-500" />
                                    <span className="font-bold text-red-500">+{stats.change_rate.toFixed(1)}%</span>
                                  </>
                                ) : stats.change_rate < 0 ? (
                                  <>
                                    <TrendingDown className="w-4 h-4 text-blue-500" />
                                    <span className="font-bold text-blue-500">{stats.change_rate.toFixed(1)}%</span>
                                  </>
                                ) : (
                                  <span className={`font-bold ${textSecondary}`}>변동 없음</span>
                                )}
                              </div>
                            </div>
                            
                            {/* 거래량 */}
                            <div className="flex items-center justify-between">
                              <span className={`text-sm ${textSecondary}`}>최근 거래량</span>
                              <span className={`font-semibold ${textPrimary}`}>
                                {stats.transaction_count}건
                              </span>
                            </div>
                            
                            {/* 아파트 수 */}
                            <div className="flex items-center justify-between">
                              <span className={`text-sm ${textSecondary}`}>아파트 수</span>
                              <span className={`font-semibold ${textPrimary}`}>
                                {stats.apartment_count}개
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className={`text-center py-4 text-sm ${textSecondary}`}>
                            통계 데이터를 불러올 수 없습니다
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
                <div className={isDesktop ? "grid grid-cols-2 gap-6" : "space-y-3"}>
                  {favoriteApartments.map((fav, index) => {
                    // 백엔드 응답 구조에 맞춤: apt_name이 직접 포함됨
                    const aptName = fav.apt_name || fav.apartment?.apt_name || '이름 없음';
                    const address = fav.apartment?.address || (fav.region_name && fav.city_name ? `${fav.city_name} ${fav.region_name}` : '주소 없음');
                    const recentPrice = apartmentPricesMap[fav.apt_id];
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
                            {recentPrice !== null && recentPrice !== undefined && (
                              <p className={`text-xl font-bold ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
                                {Math.round(recentPrice / 10000).toLocaleString()}만원
                              </p>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteApartment(fav.apt_id);
                            }}
                            className={`p-2 rounded-lg transition-all ${
                              isDarkMode
                                ? 'hover:bg-zinc-800 text-zinc-400 hover:text-red-400'
                                : 'hover:bg-red-50 text-zinc-400 hover:text-red-500'
                            }`}
                          >
                            <X className="w-4 h-4" />
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
