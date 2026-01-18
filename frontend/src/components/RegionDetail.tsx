import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, MapPin, Building2, TrendingUp, TrendingDown, Home, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { LocationSearchResult } from '../lib/searchApi';
import { getRegionStats, RegionStats } from '../lib/favoritesApi';
import { getApartmentsByRegion, ApartmentSearchResult } from '../lib/searchApi';

interface RegionDetailProps {
  region: LocationSearchResult;
  onBack: () => void;
  onApartmentSelect: (apartment: any) => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

const APARTMENTS_PER_PAGE = 30;

export default function RegionDetail({ region, onBack, onApartmentSelect, isDarkMode, isDesktop = false }: RegionDetailProps) {
  const [stats, setStats] = useState<RegionStats | null>(null);
  const [apartments, setApartments] = useState<ApartmentSearchResult[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingApartments, setLoadingApartments] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set([1]));
  const [apartmentsCache, setApartmentsCache] = useState<Map<number, ApartmentSearchResult[]>>(new Map());

  // 총 페이지 수 계산
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / APARTMENTS_PER_PAGE));
  }, [totalCount]);

  // 현재 페이지의 아파트 목록 (캐시에서 가져오기)
  const displayedApartments = useMemo(() => {
    return apartmentsCache.get(currentPage) || [];
  }, [currentPage, apartmentsCache]);

  // 초기 데이터 로드
  useEffect(() => {
    const loadInitialData = async () => {
      setLoadingStats(true);
      setLoadingApartments(true);
      
      try {
        // 통계 데이터와 첫 페이지를 병렬로 로드
        const [apartmentsResponse, statsData] = await Promise.all([
          getApartmentsByRegion(region.region_id, APARTMENTS_PER_PAGE, 0),
          getRegionStats(region.region_id, 'sale', 3)
        ]);
        
        if (statsData) {
          setStats(statsData);
          // 통계에서 아파트 개수 가져오기
          if (statsData.apartment_count) {
            setTotalCount(statsData.apartment_count);
          }
        }
        
        if (apartmentsResponse.results && apartmentsResponse.results.length > 0) {
          // 첫 페이지 캐시에 저장
          setApartmentsCache(new Map([[1, apartmentsResponse.results]]));
          setApartments(apartmentsResponse.results);
          setCurrentPage(1);
          
          // 총 개수가 없으면 응답에서 가져오기
          if (!statsData?.apartment_count && apartmentsResponse.total_count) {
            setTotalCount(apartmentsResponse.total_count);
          }
        } else {
          setApartments([]);
          setTotalCount(0);
        }
      } catch (error) {
        console.error('Failed to load region data:', error);
        setApartments([]);
        setTotalCount(0);
      } finally {
        setLoadingStats(false);
        setLoadingApartments(false);
      }
    };

    // 지역이 변경되면 초기화
    setCurrentPage(1);
    setLoadedPages(new Set([1]));
    setApartmentsCache(new Map());
    setTotalCount(0);
    
    loadInitialData();
  }, [region.region_id]);

  // 페이지 변경 시 데이터 로드
  const loadPage = useCallback(async (page: number) => {
    // 이미 로드된 페이지인지 확인
    if (apartmentsCache.has(page)) {
      console.log(`Page ${page} already cached, skipping load`);
      return;
    }
    
    if (loadingApartments) {
      console.log(`Already loading, skipping page ${page}`);
      return;
    }
    
    console.log(`Loading page ${page}...`);
    setLoadingApartments(true);
    try {
      const skip = (page - 1) * APARTMENTS_PER_PAGE;
      const apartmentsResponse = await getApartmentsByRegion(region.region_id, APARTMENTS_PER_PAGE, skip);
      
      console.log(`Page ${page} loaded:`, {
        count: apartmentsResponse.results.length,
        total: apartmentsResponse.total_count,
        has_more: apartmentsResponse.has_more
      });
      
      if (apartmentsResponse.results.length > 0 || page === 1) {
        // 캐시에 저장 (빈 배열이어도 1페이지는 저장)
        setApartmentsCache(prev => {
          const newCache = new Map(prev);
          newCache.set(page, apartmentsResponse.results);
          return newCache;
        });
        
        setLoadedPages(prev => new Set([...prev, page]));
        
        // 총 개수 업데이트
        if (apartmentsResponse.total_count !== undefined) {
          setTotalCount(apartmentsResponse.total_count);
        }
      }
    } catch (error) {
      console.error(`Failed to load page ${page}:`, error);
    } finally {
      setLoadingApartments(false);
    }
  }, [region.region_id, loadingApartments, apartmentsCache]);

  // 페이지 변경 핸들러
  const handlePageChange = useCallback((page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) {
      return;
    }
    
    console.log(`Changing page from ${currentPage} to ${page}`);
    
    // 해당 페이지가 캐시에 없으면 로드
    if (!apartmentsCache.has(page)) {
      console.log(`Page ${page} not cached, loading...`);
      loadPage(page);
    }
    
    // 페이지 변경 (캐시에 없어도 일단 변경하여 UI 업데이트)
    setCurrentPage(page);
  }, [currentPage, totalPages, apartmentsCache, loadPage]);

  // 이전/다음 페이지로 이동
  const goToPreviousPage = useCallback(() => {
    handlePageChange(currentPage - 1);
  }, [currentPage, handlePageChange]);

  const goToNextPage = useCallback(() => {
    handlePageChange(currentPage + 1);
  }, [currentPage, handlePageChange]);

  const textPrimary = isDarkMode ? 'text-white' : 'text-zinc-900';
  const textSecondary = isDarkMode ? 'text-zinc-400' : 'text-zinc-600';
  const textMuted = isDarkMode ? 'text-zinc-500' : 'text-zinc-500';

  const displayName = region.full_name || `${region.city_name} ${region.region_name}`;

  return (
    <div className={`w-full ${isDesktop ? 'max-w-6xl mx-auto' : 'px-2'}`}>
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className={`p-2 rounded-xl transition-all ${
            isDarkMode ? 'bg-zinc-900 hover:bg-zinc-800' : 'bg-white hover:bg-zinc-50'
          }`}
        >
          <ArrowLeft className={`w-5 h-5 ${textPrimary}`} />
        </button>
        <div className="flex items-center gap-2">
          <MapPin className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
          <h1 className={`text-2xl font-bold ${textPrimary}`}>{displayName.replace(/([가-힣])(\()/g, '$1 $2')}</h1>
        </div>
      </div>

      {/* 통계 정보 */}
      {loadingStats ? (
        <div className={`text-center py-8 ${textSecondary}`}>통계 로딩 중...</div>
      ) : stats ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 md:p-6 mb-4 md:mb-6 ${
            isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200'
          }`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div>
              <div className={`text-sm ${textSecondary} mb-1`}>평균 집값</div>
              <div className={`text-xl font-bold ${textPrimary}`}>
                {stats.avg_price_per_pyeong > 0 
                  ? `${Math.round(stats.avg_price_per_pyeong).toLocaleString()}만원/평`
                  : '데이터 없음'}
              </div>
            </div>
            <div>
              <div className={`text-sm ${textSecondary} mb-1`}>가격 변화</div>
              <div className="flex items-center gap-1">
                {stats.change_rate > 0 ? (
                  <>
                    <TrendingUp className="w-4 h-4 text-red-500" />
                    <span className="text-xl font-bold text-red-500">+{stats.change_rate.toFixed(1)}%</span>
                  </>
                ) : stats.change_rate < 0 ? (
                  <>
                    <TrendingDown className="w-4 h-4 text-blue-500" />
                    <span className="text-xl font-bold text-blue-500">{stats.change_rate.toFixed(1)}%</span>
                  </>
                ) : (
                  <span className={`text-xl font-bold ${textSecondary}`}>변동 없음</span>
                )}
              </div>
            </div>
            <div>
              <div className={`text-sm ${textSecondary} mb-1`}>최근 거래량</div>
              <div className={`text-xl font-bold ${textPrimary}`}>{stats.transaction_count}건</div>
            </div>
            <div>
              <div className={`text-sm ${textSecondary} mb-1`}>아파트 수</div>
              <div className={`text-xl font-bold ${textPrimary}`}>{stats.apartment_count}개</div>
            </div>
          </div>
        </motion.div>
      ) : null}

      {/* 아파트 목록 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-bold ${textPrimary}`}>
            지역 내 아파트 {totalCount > 0 && `(${totalCount.toLocaleString()}개)`}
          </h2>
        </div>
        
        {loadingApartments && displayedApartments.length === 0 ? (
          <div className={`text-center py-8 ${textSecondary}`}>
            <div className="inline-block w-8 h-8 border-4 border-current border-t-transparent rounded-full animate-spin mb-2"></div>
            <div>아파트 목록 로딩 중...</div>
          </div>
        ) : displayedApartments.length > 0 ? (
          <>
            <div className={isDesktop ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-2"}>
              {displayedApartments.map((apt, index) => (
                <motion.div
                  key={`${apt.apt_id}-${currentPage}-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  onClick={() => {
                    // 아파트 상세정보 페이지로 이동
                    onApartmentSelect({
                      apt_id: apt.apt_id,
                      id: apt.apt_id, // ApartmentDetail이 id도 사용할 수 있도록
                      apt_name: apt.apt_name,
                      name: apt.apt_name, // ApartmentDetail이 name도 사용할 수 있도록
                      address: apt.address
                    });
                  }}
                  className={`rounded-xl p-3 cursor-pointer transition-all hover:shadow-md ${
                    isDarkMode
                      ? 'bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800'
                      : 'bg-white border border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                      isDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                    }`}>
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold text-sm mb-0.5 ${textPrimary} truncate`}>{apt.apt_name}</h3>
                      <p className={`text-xs ${textSecondary} truncate`}>{apt.address}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            
            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="mt-6 flex flex-col items-center gap-4">
                <div className={`flex items-center gap-2 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  <button
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1 || loadingApartments}
                    className={`p-2 rounded-lg transition-all ${
                      isDarkMode
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                        : 'bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-200'
                    } ${currentPage === 1 || loadingApartments ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  
                  <div className="flex items-center gap-1 flex-wrap justify-center">
                    {/* 첫 페이지 */}
                    {currentPage > 3 && (
                      <>
                        <button
                          onClick={() => handlePageChange(1)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            isDarkMode
                              ? 'bg-zinc-800 hover:bg-zinc-700 text-white'
                              : 'bg-white hover:bg-zinc-50 text-zinc-900'
                          }`}
                        >
                          1
                        </button>
                        {currentPage > 4 && <span className={`px-2 ${textSecondary}`}>...</span>}
                      </>
                    )}
                    
                    {/* 현재 페이지 주변 */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      if (pageNum < 1 || pageNum > totalPages) return null;
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          disabled={loadingApartments}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            pageNum === currentPage
                              ? isDarkMode
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-600 text-white'
                              : isDarkMode
                                ? 'bg-zinc-800 hover:bg-zinc-700 text-white'
                                : 'bg-white hover:bg-zinc-50 text-zinc-900'
                          } ${loadingApartments ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    {/* 마지막 페이지 */}
                    {currentPage < totalPages - 2 && (
                      <>
                        {currentPage < totalPages - 3 && <span className={`px-2 ${textSecondary}`}>...</span>}
                        <button
                          onClick={() => handlePageChange(totalPages)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            isDarkMode
                              ? 'bg-zinc-800 hover:bg-zinc-700 text-white'
                              : 'bg-white hover:bg-zinc-50 text-zinc-900'
                          }`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>
                  
                  <button
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages || loadingApartments}
                    className={`p-2 rounded-lg transition-all ${
                      isDarkMode
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                        : 'bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-200'
                    } ${currentPage === totalPages || loadingApartments ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                
                <div className={`text-sm ${textSecondary}`}>
                  {currentPage} / {totalPages} 페이지
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={`text-center py-8 ${textSecondary}`}>아파트 데이터가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
