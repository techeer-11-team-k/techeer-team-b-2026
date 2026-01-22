import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { ArrowLeft, MapPin, TrendingUp, TrendingDown, ArrowRight, Calendar, Layers, Home, Ruler, Building, ChevronDown, ChevronUp, Train, School, Info, Star, ChevronUp as ChevronUpIcon, Filter } from 'lucide-react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';
import { getApartmentDetail, ApartmentDetailData, getApartmentTransactions, ApartmentTransactionsResponse, TransactionData } from '../lib/apartmentApi';
import { addFavoriteApartment, getFavoriteApartments, deleteFavoriteApartment } from '../lib/favoritesApi';
import { createRecentView } from '../lib/usersApi';
import { useAuth } from '../lib/clerk';
import { useDynamicIslandToast } from './ui/DynamicIslandToast';
import AddMyJeonserateModal from './AddMyJeonserateModal';

interface ApartmentDetailProps {
  apartment: any;
  onBack: () => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

// 가격 포맷팅 유틸리티 함수
const formatPrice = (price: number) => {
  if (!price) return '0원';
  if (price >= 10000) {
    const eok = Math.floor(price / 10000);
    const man = price % 10000;
    return `${eok}억${man > 0 ? ` ${man.toLocaleString()}만원` : ''}`;
  }
  return `${price.toLocaleString()}만원`;
};

export default function ApartmentDetail({ apartment, onBack, isDarkMode, isDesktop = false }: ApartmentDetailProps) {
  const { isSignedIn, getToken } = useAuth();
  const { showSuccess, showError, showWarning, showInfo, ToastComponent } = useDynamicIslandToast(isDarkMode, 3000);
  const [detailData, setDetailData] = useState<ApartmentDetailData | null>(null);
  const [transactionsData, setTransactionsData] = useState<ApartmentTransactionsResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [checkingFavorite, setCheckingFavorite] = useState(false);
  const [isAddingFavorite, setIsAddingFavorite] = useState(false);
  const [isAddJeonserateModalOpen, setIsAddJeonserateModalOpen] = useState(false);
  const starControls = useAnimation();
  
  // 가격 변화 추이 필터 상태
  const [transactionType, setTransactionType] = useState<'sale' | 'jeonse' | 'monthly' | 'all'>('all'); // 매매, 전세, 월세, 전체
  const [period, setPeriod] = useState<3 | 12 | 36 | 0>(3); // 3개월, 1년, 3년, 전체(0)
  const [selectedArea, setSelectedArea] = useState<number | null>(null); // 면적 필터 (null이면 전체)
  const [availableAreas, setAvailableAreas] = useState<number[]>([]); // 사용 가능한 면적 목록
  const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  
  // 매매/전세/월세 데이터를 모두 저장 (그래프용)
  const [saleTransactionsData, setSaleTransactionsData] = useState<ApartmentTransactionsResponse['data'] | null>(null);
  const [jeonseTransactionsData, setJeonseTransactionsData] = useState<ApartmentTransactionsResponse['data'] | null>(null);
  const [monthlyTransactionsData, setMonthlyTransactionsData] = useState<ApartmentTransactionsResponse['data'] | null>(null);
  
  // 실거래 내역 리스트용 상태
  const [historyTransactionType, setHistoryTransactionType] = useState<'sale' | 'jeonse' | 'monthly'>('sale');
  const [recentTransactionsData, setRecentTransactionsData] = useState<ApartmentTransactionsResponse['data'] | null>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false); // 접기/펼치기 상태
  const [isHistoryTypeDropdownOpen, setIsHistoryTypeDropdownOpen] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      if (apartment?.apt_id || apartment?.id) {
        setLoading(true);
        try {
          const id = apartment.apt_id || apartment.id;
          const data = await getApartmentDetail(id);
          setDetailData(data);
          
          // 로그인한 사용자의 경우 조회 기록 저장
          if (isSignedIn && getToken) {
            try {
              const token = await getToken();
              if (token) {
                await createRecentView(id, token);
              }
            } catch (error) {
              // 조회 기록 저장 실패는 무시 (에러 로그만 출력)
              console.warn('Failed to save recent view:', error);
            }
          }
        } catch (error) {
          console.error("Failed to fetch details", error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchDetail();
  }, [apartment, isSignedIn, getToken]);

  // 실거래 내역 조회 (필터 적용)
  useEffect(() => {
    const fetchRecentTransactions = async () => {
      if (apartment?.apt_id || apartment?.id) {
        try {
          const id = apartment.apt_id || apartment.id;
          // 선택된 거래 유형에 따라 데이터 조회 (항상 최근 50건)
          // selectedArea도 적용하여 리스트 필터링
          const data = await getApartmentTransactions(
            id, 
            historyTransactionType, 
            50, 
            6, 
            selectedArea || undefined
          );
          setRecentTransactionsData(data);
        } catch (error) {
          console.error("Failed to fetch recent transactions", error);
          setRecentTransactionsData(null);
        }
      }
    };

    fetchRecentTransactions();
  }, [apartment, historyTransactionType, selectedArea]);

  // 가격 변화 추이 데이터 조회 (필터 적용)
  useEffect(() => {
    const fetchChartData = async () => {
      if (apartment?.apt_id || apartment?.id) {
        setTransactionsLoading(true);
        try {
          const id = apartment.apt_id || apartment.id;
          const months = period === 0 ? 36 : period; // 전체는 3년으로 조회
          
          // 매매, 전세, 월세 데이터를 병렬로 조회 (면적 필터 적용)
          const [saleData, jeonseData, monthlyData] = await Promise.all([
            getApartmentTransactions(id, 'sale', 50, months, selectedArea || undefined),
            getApartmentTransactions(id, 'jeonse', 50, months, selectedArea || undefined),
            getApartmentTransactions(id, 'monthly', 50, months, selectedArea || undefined)
          ]);
          
          setSaleTransactionsData(saleData);
          setJeonseTransactionsData(jeonseData);
          setMonthlyTransactionsData(monthlyData);
          
          // 면적 옵션 추출 (매매와 전세 거래 내역에서 고유한 면적 값 추출)
          if (selectedArea === null) {
              const areas = new Set<number>();
              [saleData, jeonseData, monthlyData].forEach(data => {
                if (data?.recent_transactions) {
                  data.recent_transactions.forEach((trans: TransactionData) => {
                    if (trans.area && trans.area > 0) {
                      const roundedArea = Math.round(trans.area);
                      areas.add(roundedArea);
                    }
                  });
                }
              });
              const sortedAreas = Array.from(areas).sort((a, b) => a - b);
              if (sortedAreas.length > 0) {
                  setAvailableAreas(sortedAreas);
              }
          }
          
          // transactionsData는 그래프 표시용으로만 사용
          setTransactionsData(saleData);
        } catch (error) {
          console.error("Failed to fetch chart data", error);
          setTransactionsData(null);
          setSaleTransactionsData(null);
          setJeonseTransactionsData(null);
          setMonthlyTransactionsData(null);
        } finally {
          setTransactionsLoading(false);
        }
      }
    };

    fetchChartData();
  }, [apartment, period, selectedArea]);
  
  // 시세 카드용 데이터 (현재 표시 중인 recentTransactionsData의 첫 번째 항목 사용)
  const currentPriceData = recentTransactionsData;
  const recentPrice = currentPriceData?.recent_transactions?.[0]?.price;
  const priceDisplay = recentPrice 
    ? formatPrice(recentPrice)
    : (apartment.price || "시세 정보 없음");

  // 즐겨찾기 상태 확인
  useEffect(() => {
    const checkFavorite = async () => {
      if (!isSignedIn || !getToken || !apartment) return;
      
      const aptId = apartment.apt_id || apartment.id;
      if (!aptId) return;

      setCheckingFavorite(true);
      try {
        const data = await getFavoriteApartments(getToken);
        if (data) {
          const favorite = data.favorites.find((f: { apt_id: number; is_deleted: boolean }) => f.apt_id === aptId && !f.is_deleted);
          setIsFavorite(!!favorite);
        }
      } catch (error) {
        // 에러 무시 (로그인하지 않은 경우 등)
      } finally {
        setCheckingFavorite(false);
      }
    };

    checkFavorite();
  }, [isSignedIn, getToken, apartment]);

  const handleToggleFavorite = useCallback(async () => {
    if (!isSignedIn || !getToken) {
      showWarning('로그인 후 사용해 주세요');
      return;
    }

    const aptId = apartment.apt_id || apartment.id;
    if (!aptId) return;

    try {
      setIsAddingFavorite(true);
      
      if (isFavorite) {
        // 즐겨찾기 삭제
        await deleteFavoriteApartment(getToken, aptId);
        setIsFavorite(false);
        showSuccess('즐겨찾기에서 제거되었습니다.');
        
        // 즐겨찾기 상태 다시 확인
        try {
          const data = await getFavoriteApartments(getToken);
          if (data) {
            const favorite = data.favorites.find((f: { apt_id: number; is_deleted: boolean }) => f.apt_id === aptId && !f.is_deleted);
            setIsFavorite(!!favorite);
          }
        } catch (error) {
          // 에러 무시
        }
      } else {
        // 즐겨찾기 추가 - 화려한 애니메이션
        // 애니메이션 시작
        starControls.start({
          scale: [1, 1.3, 1],
          rotate: [0, 180, 360],
          transition: { duration: 0.6, ease: "easeOut" }
        });
        
        // API 호출
        await addFavoriteApartment(getToken, aptId);
        setIsFavorite(true);
        showSuccess('즐겨찾기에 추가되었습니다.');
        
        // 즐겨찾기 상태 다시 확인
        try {
          const data = await getFavoriteApartments(getToken);
          if (data) {
            const favorite = data.favorites.find((f: { apt_id: number; is_deleted: boolean }) => f.apt_id === aptId && !f.is_deleted);
            setIsFavorite(!!favorite);
          }
        } catch (error) {
          // 에러 무시
        }
      }
    } catch (error: any) {
      if (error.message?.includes('이미 추가') || error.response?.status === 409) {
        setIsFavorite(true);
        showInfo('이미 즐겨찾기에 추가된 아파트입니다.');
      } else if (error.message?.includes('제한') || error.response?.status === 400) {
        showError('즐겨찾기 아파트는 최대 100개까지 추가할 수 있습니다.');
      } else if (error.message?.includes('로그인')) {
        showError('로그인이 필요합니다.');
      } else {
        console.error('즐겨찾기 처리 실패:', error);
        showError(isFavorite ? '즐겨찾기 제거에 실패했습니다.' : '즐겨찾기 추가에 실패했습니다.');
      }
    } finally {
      setIsAddingFavorite(false);
    }
  }, [isSignedIn, getToken, apartment, isFavorite, starControls, showWarning, showSuccess, showInfo, showError]);

  const cardClass = useMemo(() => isDarkMode
    ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]', [isDarkMode]);
  
  const textPrimary = useMemo(() => isDarkMode ? 'text-slate-100' : 'text-slate-800', [isDarkMode]);
  const textSecondary = useMemo(() => isDarkMode ? 'text-slate-400' : 'text-slate-600', [isDarkMode]);

  if (!apartment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <button
          onClick={onBack}
          className={`p-2 rounded-xl transition-colors self-start ml-4 absolute top-4 left-0 ${
            isDarkMode
              ? 'bg-slate-800/50 hover:bg-slate-800'
              : 'bg-white hover:bg-sky-50 border border-sky-200'
          }`}
        >
          <ArrowLeft className="w-5 h-5 text-sky-500" />
        </button>
        <div className={`text-center ${textSecondary} mt-20`}>
            <Building className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">상세 정보가 없습니다.</p>
        </div>
      </div>
    );
  }

  // Address
  const address = detailData?.road_address || detailData?.jibun_address || apartment.address || apartment.location || "주소 정보 없음";
  
  // Detailed Info (with fallbacks)
  const buildYear = detailData?.use_approval_date ? new Date(detailData.use_approval_date).getFullYear() + '년' : "-";
  const totalUnits = detailData?.total_household_cnt ? `${detailData.total_household_cnt.toLocaleString()}세대` : "-";
  
  // Parking calculation
  const totalParking = detailData?.total_parking_cnt || 0;
  const totalHouseholds = detailData?.total_household_cnt || 1;
  const parkingPerHousehold = totalParking > 0 ? (totalParking / totalHouseholds).toFixed(2) : "-";
  
  // 그래프 데이터 기반 변화량 계산 (선택된 거래 유형에 따라)
  const calculatedChangeSummary = useMemo(() => {
    // 선택된 거래 유형에 따라 데이터 선택
    let trend = null;
    if (transactionType === 'sale' || transactionType === 'all') {
      trend = saleTransactionsData?.price_trend || [];
    } else if (transactionType === 'jeonse') {
      trend = jeonseTransactionsData?.price_trend || [];
    } else if (transactionType === 'monthly') {
      trend = monthlyTransactionsData?.price_trend || [];
    }
    
    // API에서 이미 면적 필터링이 적용되어 오므로 client-side 필터링 제거
    const filteredTrend = trend || [];
    
    if (filteredTrend.length < 2) {
      return null;
    }
    
    const firstValue = filteredTrend[0].avg_price;
    const lastValue = filteredTrend[filteredTrend.length - 1].avg_price;
    
    if (firstValue === 0 || lastValue === 0) {
      return null;
    }
    
    const changeRate = ((lastValue - firstValue) / firstValue) * 100;
    
    return {
      previous_avg: firstValue,
      recent_avg: lastValue,
      change_rate: changeRate,
      period: period === 0 ? '전체' : period === 3 ? '3개월' : period === 12 ? '1년' : '3년'
    };
  }, [saleTransactionsData?.price_trend, jeonseTransactionsData?.price_trend, monthlyTransactionsData?.price_trend, transactionType, period]);
  
  // 그래프용 통합 데이터 생성 (매매/전세/월세)
  const chartData = useMemo(() => {
    const saleTrend = saleTransactionsData?.price_trend || [];
    const jeonseTrend = jeonseTransactionsData?.price_trend || [];
    const monthlyTrend = monthlyTransactionsData?.price_trend || [];
    
    // 모든 월을 수집
    const allMonths = new Set<string>();
    saleTrend.forEach(d => allMonths.add(d.month));
    jeonseTrend.forEach(d => allMonths.add(d.month));
    monthlyTrend.forEach(d => allMonths.add(d.month));
    
    const sortedMonths = Array.from(allMonths).sort();
    
    return sortedMonths.map(month => {
      const saleData = saleTrend.find(d => d.month === month);
      const jeonseData = jeonseTrend.find(d => d.month === month);
      const monthlyData = monthlyTrend.find(d => d.month === month);
      
      return {
        month,
        salePrice: saleData ? saleData.avg_price : null,
        jeonsePrice: jeonseData ? jeonseData.avg_price : null,
        monthlyPrice: monthlyData ? monthlyData.avg_price : null
      };
    });
  }, [saleTransactionsData?.price_trend, jeonseTransactionsData?.price_trend, monthlyTransactionsData?.price_trend]);

  return (
    <div className={`space-y-6 pb-10 ${isDesktop ? 'max-w-full' : ''}`}>
      {/* Header with Back Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className={`p-2 rounded-xl transition-colors ${
            isDarkMode
              ? 'bg-slate-800/50 hover:bg-slate-800'
              : 'bg-white hover:bg-sky-50 border border-sky-200'
          }`}
        >
          <ArrowLeft className="w-5 h-5 text-sky-500" />
        </button>
        <div className="flex-1">
          <h1 className={`text-2xl font-bold ${textPrimary}`}>{apartment.name || apartment.apt_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <MapPin className="w-4 h-4 text-sky-400" />
            <p className={`text-sm ${textSecondary}`}>{address}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 전세매물 추가 버튼 */}
          <motion.button
            onClick={() => {
              if (!isSignedIn) {
                toast.info('로그인이 필요합니다.');
                return;
              }
              setIsAddJeonserateModalOpen(true);
            }}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
              isDarkMode
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <Home className="w-5 h-5" />
          </motion.button>
          
          {/* 즐겨찾기 버튼 */}
          <motion.button
            onClick={handleToggleFavorite}
            disabled={checkingFavorite || isAddingFavorite}
            initial={{ opacity: 1, scale: 1 }}
            className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 relative overflow-hidden ${
              isFavorite
                ? 'bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 text-yellow-900 border-2 border-yellow-400 shadow-lg shadow-yellow-500/50 ring-2 ring-yellow-400/50'
                : isDarkMode
                ? 'bg-zinc-800 text-zinc-400 border-2 border-zinc-700 hover:bg-zinc-700 hover:text-yellow-500 hover:border-yellow-500/50'
                : 'bg-white text-zinc-400 border-2 border-zinc-200 hover:bg-yellow-50 hover:text-yellow-500 hover:border-yellow-500/50'
            }`}
            whileHover={!isAddingFavorite ? (isFavorite ? { scale: 1.1 } : { scale: 1.05 }) : {}}
            whileTap={!isAddingFavorite ? { scale: 0.95 } : {}}
            style={{
              boxShadow: isFavorite 
                ? '0 0 20px rgba(250, 204, 21, 0.6), 0 0 40px rgba(250, 204, 21, 0.4)' 
                : undefined
            }}
          >
          <motion.div
            animate={starControls}
            initial={{ scale: 1, rotate: 0 }}
          >
            <Star className={`w-6 h-6 relative z-10 ${isFavorite ? 'fill-current drop-shadow-lg' : ''}`} />
          </motion.div>
          {isFavorite && (
            <motion.div
              className="absolute inset-0 rounded-full bg-yellow-400"
              animate={{
                scale: [1, 1.5, 1.5],
                opacity: [0.5, 0, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut"
              }}
            />
          )}
        </motion.button>
        </div>
      </div>

      {/* Merged Price & Transaction History Card */}
      <div className={`rounded-2xl overflow-hidden ${cardClass}`}>
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-bold ${textPrimary}`}>시세 및 거래 내역</h2>
            <div className="flex items-center gap-2">
              {/* 거래 유형 필터 드롭다운 */}
              <div className="relative">
                <button
                  onClick={() => setIsHistoryTypeDropdownOpen(!isHistoryTypeDropdownOpen)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1 ${
                    isDarkMode
                      ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  {historyTransactionType === 'sale' ? '매매' : historyTransactionType === 'jeonse' ? '전세' : '월세'}
                  <ChevronDown className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {isHistoryTypeDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`absolute top-full right-0 mt-1 border rounded-lg shadow-lg z-10 w-24 overflow-hidden ${
                        isDarkMode 
                          ? 'bg-zinc-800 border-zinc-700' 
                          : 'bg-white border-zinc-200'
                      }`}
                    >
                      {[
                        { value: 'sale' as const, label: '매매' },
                        { value: 'jeonse' as const, label: '전세' },
                        { value: 'monthly' as const, label: '월세' }
                      ].map((type) => (
                        <button
                          key={type.value}
                          onClick={() => {
                            setHistoryTransactionType(type.value);
                            setIsHistoryTypeDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm ${
                            historyTransactionType === type.value
                              ? isDarkMode
                                ? 'bg-sky-900/20 text-sky-400'
                                : 'bg-sky-50 text-sky-600'
                              : isDarkMode
                                ? 'text-zinc-300 hover:bg-zinc-700'
                                : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="flex items-end gap-3 mb-6">
             <div className="flex-1">
                <p className={`text-sm ${textSecondary} mb-1`}>현재 시세 ({historyTransactionType === 'sale' ? '매매' : historyTransactionType === 'jeonse' ? '전세' : '월세'} 기준)</p>
                <div className="flex items-baseline gap-2">
                    <p className={`text-4xl font-bold bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent`}>
                    {priceDisplay}
                    </p>
                </div>
             </div>
             {(currentPriceData?.change_summary || apartment.change) && (
                <div className={`px-4 py-2 rounded-xl border mb-1 ${
                    currentPriceData?.change_summary?.change_rate === 0
                    ? 'bg-yellow-500/20 border-yellow-500/30'
                    : (currentPriceData?.change_summary?.change_rate || 0) > 0 
                    ? 'bg-green-500/20 border-green-500/30' 
                    : 'bg-red-500/20 border-red-500/30'
                }`}>
                    <div className="flex items-center gap-1">
                        {(currentPriceData?.change_summary?.change_rate === 0) ? (
                            <ArrowRight className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                        ) : (currentPriceData?.change_summary?.change_rate || 0) > 0 ? (
                            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                            <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                        )}
                        <span className={`text-lg font-bold ${
                            (currentPriceData?.change_summary?.change_rate === 0)
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : (currentPriceData?.change_summary?.change_rate || 0) > 0 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                            {currentPriceData?.change_summary?.change_rate !== undefined && currentPriceData?.change_summary?.change_rate !== null
                                ? `${currentPriceData.change_summary.change_rate >= 0 ? '+' : ''}${currentPriceData.change_summary.change_rate.toFixed(2)}%`
                                : "0%"}
                        </span>
                    </div>
                </div>
             )}
          </div>
        </div>

        {/* Transaction List */}
        <div className={`border-t ${isDarkMode ? 'border-zinc-800' : 'border-zinc-100'}`}>
           {recentTransactionsData?.recent_transactions && recentTransactionsData.recent_transactions.length > 0 ? (
             <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
               {recentTransactionsData.recent_transactions.slice(0, isHistoryExpanded ? undefined : 5).map((transaction: TransactionData, index: number) => (
                 <div
                   key={transaction.trans_id || index}
                   className={`p-4 transition-colors hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between gap-4`}
                 >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                             <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                transaction.trans_type === '중도금지급' 
                                ? (isDarkMode ? 'bg-orange-900 text-orange-100' : 'bg-orange-100 text-orange-700')
                                : historyTransactionType === 'sale'
                                ? (isDarkMode ? 'bg-blue-900 text-blue-100' : 'bg-blue-100 text-blue-700')
                                : historyTransactionType === 'jeonse'
                                ? (isDarkMode ? 'bg-green-900 text-green-100' : 'bg-green-100 text-green-700')
                                : (isDarkMode ? 'bg-purple-900 text-purple-100' : 'bg-purple-100 text-purple-700')
                             }`}>
                                {historyTransactionType === 'sale' ? '매매' : historyTransactionType === 'jeonse' ? '전세' : '월세'}
                             </span>
                             <span className={`text-xs ${textSecondary}`}>
                                {transaction.date ? new Date(transaction.date).toLocaleDateString('ko-KR', { 
                                year: '2-digit', 
                                month: 'numeric', 
                                day: 'numeric' 
                                }) : '-'}
                             </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                             <span className={`text-base font-bold ${textPrimary}`}>
                                {historyTransactionType === 'monthly' && transaction.monthly_rent
                                    ? `${formatPrice(transaction.price)} / ${formatPrice(transaction.monthly_rent)}` 
                                    : formatPrice(transaction.price)}
                             </span>
                             {transaction.floor && (
                                <span className={`text-sm ${textSecondary}`}>
                                    {transaction.floor}층
                                </span>
                             )}
                        </div>
                        <div className={`text-xs ${textSecondary} mt-0.5`}>
                           {transaction.area.toFixed(2)}㎡ ({Math.round(transaction.area * 0.3025 * 10) / 10}평)
                           {transaction.price_per_pyeong > 0 && ` · ${transaction.price_per_pyeong.toLocaleString()}만원/평`}
                        </div>
                    </div>
                    {transaction.is_canceled && (
                        <span className={`text-xs px-2 py-1 rounded ${isDarkMode ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-600'}`}>
                            취소
                        </span>
                    )}
                 </div>
               ))}
             </div>
           ) : (
             <div className="p-8">
                <DevelopmentPlaceholder 
                    title="거래 내역 없음"
                    message="선택한 조건의 거래 내역이 없습니다."
                    isDarkMode={isDarkMode}
                />
             </div>
           )}
           
           {recentTransactionsData?.recent_transactions && recentTransactionsData.recent_transactions.length > 5 && (
              <button
                onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                className={`w-full py-3 text-sm font-medium transition-colors border-t ${
                    isDarkMode 
                    ? 'border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200' 
                    : 'border-zinc-100 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
                } flex items-center justify-center gap-1`}
              >
                {isHistoryExpanded ? (
                    <>접기 <ChevronUp className="w-4 h-4" /></>
                ) : (
                    <>더보기 ({recentTransactionsData.recent_transactions.length - 5}건) <ChevronDown className="w-4 h-4" /></>
                )}
              </button>
           )}
        </div>
      </div>

      {/* Basic Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-2xl p-4 ${cardClass} flex flex-col justify-center`}>
          <div className="flex items-center gap-2 mb-2">
            <Building className="w-4 h-4 text-sky-400" />
            <span className={`text-sm ${textSecondary}`}>건축년도</span>
          </div>
          <p className={`text-lg font-bold ${textPrimary}`}>
            {loading ? <span className="opacity-50 text-sm">로딩중...</span> : buildYear}
          </p>
        </div>
        
        <div className={`rounded-2xl p-4 ${cardClass} flex flex-col justify-center`}>
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <span className={`text-sm ${textSecondary}`}>총 세대수</span>
          </div>
          <p className={`text-lg font-bold ${textPrimary}`}>
            {loading ? <span className="opacity-50 text-sm">로딩중...</span> : totalUnits}
          </p>
        </div>
        
        <div className={`rounded-2xl p-4 ${cardClass} flex flex-col justify-center`}>
          <div className="flex items-center gap-2 mb-2">
            <Home className="w-4 h-4 text-sky-400" />
            <span className={`text-sm ${textSecondary}`}>세대당 주차</span>
          </div>
          <p className={`text-lg font-bold ${textPrimary}`}>
             {loading ? <span className="opacity-50 text-sm">로딩중...</span> : parkingPerHousehold}대
          </p>
        </div>
      </div>

      {/* Collapsible More Info Section */}
      <div className={`rounded-2xl overflow-hidden ${cardClass}`}>
        <button 
          onClick={() => setShowMoreInfo(!showMoreInfo)}
          className="w-full flex items-center justify-between p-5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500" />
            <span className={`font-bold ${textPrimary}`}>단지 상세 정보 더보기</span>
          </div>
          {showMoreInfo ? (
            <ChevronUp className={`w-5 h-5 ${textSecondary}`} />
          ) : (
            <ChevronDown className={`w-5 h-5 ${textSecondary}`} />
          )}
        </button>
        
        <AnimatePresence>
          {showMoreInfo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <div className="p-5 pt-0 border-t border-dashed border-zinc-200 dark:border-zinc-800">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 mt-4">
                  {/* Left Column */}
                  <div className="space-y-4">
                     <div>
                        <p className={`text-sm ${textSecondary} mb-1`}>난방 방식</p>
                        <p className={`font-medium ${textPrimary}`}>{detailData?.code_heat_nm || "-"}</p>
                     </div>
                     <div>
                        <p className={`text-sm ${textSecondary} mb-1`}>복도 유형</p>
                        <p className={`font-medium ${textPrimary}`}>{detailData?.hallway_type || "-"}</p>
                     </div>
                     <div>
                        <p className={`text-sm ${textSecondary} mb-1`}>관리 방식</p>
                        <p className={`font-medium ${textPrimary}`}>{detailData?.manage_type || "-"}</p>
                     </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                     <div>
                        <p className={`text-sm ${textSecondary} mb-1`}>건설사</p>
                        <p className={`font-medium ${textPrimary}`}>{detailData?.builder_name || "-"}</p>
                     </div>
                     <div>
                        <p className={`text-sm ${textSecondary} mb-1`}>시행사</p>
                        <p className={`font-medium ${textPrimary}`}>{detailData?.developer_name || "-"}</p>
                     </div>
                  </div>
                </div>

                {/* Transportation & Education (Full Width) */}
                <div className="mt-6 space-y-4">
                    <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                        <div className="flex items-start gap-3">
                            <Train className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                            <div>
                                <p className={`text-sm font-bold ${textSecondary} mb-1`}>교통 정보</p>
                                <p className={`text-sm ${textPrimary} leading-relaxed`}>
                                    {detailData?.subway_station 
                                        ? `${detailData.subway_line} ${detailData.subway_station} (${detailData.subway_time})`
                                        : "지하철 정보 없음"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                        <div className="flex items-start gap-3">
                            <School className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                            <div>
                                <p className={`text-sm font-bold ${textSecondary} mb-1`}>교육 시설</p>
                                <p className={`text-sm ${textPrimary} leading-relaxed`}>
                                    {detailData?.educationFacility || "교육 시설 정보 없음"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Price History Chart */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className={`text-lg font-bold ${textPrimary} mb-1`}>가격 변화 추이</h2>
            <p className={`text-sm ${textSecondary}`}>평균 거래가 (단위: 만원)</p>
          </div>
          {calculatedChangeSummary && (
            <div className={`px-3 py-2 rounded-xl border ${
              calculatedChangeSummary.change_rate === 0
                ? 'bg-yellow-500/20 border-yellow-500/30'
                : calculatedChangeSummary.change_rate > 0
                ? 'bg-green-500/20 border-green-500/30' 
                : 'bg-red-500/20 border-red-500/30'
            }`}>
              <div className="flex items-center gap-1">
                {calculatedChangeSummary.change_rate === 0 ? (
                  <ArrowRight className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                ) : calculatedChangeSummary.change_rate > 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                )}
                <span className={`text-sm font-bold ${
                  calculatedChangeSummary.change_rate === 0
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : calculatedChangeSummary.change_rate > 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {calculatedChangeSummary.change_rate >= 0 ? '+' : ''}{calculatedChangeSummary.change_rate.toFixed(2)}%
                </span>
              </div>
              <p className={`text-xs ${textSecondary} mt-0.5 text-center`}>
                {calculatedChangeSummary.period}
              </p>
            </div>
          )}
        </div>
        
        {/* 필터 UI */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* 거래 유형 필터 */}
          <div className={`flex gap-1 p-1 rounded-lg ${
            isDarkMode ? 'bg-zinc-800' : 'bg-zinc-100'
          }`}>
            {[
              { value: 'all' as const, label: '전체' },
              { value: 'sale' as const, label: '매매' },
              { value: 'jeonse' as const, label: '전세' },
              { value: 'monthly' as const, label: '월세' }
            ].map((t) => (
              <button
                key={t.value}
                onClick={() => setTransactionType(t.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  transactionType === t.value
                    ? isDarkMode
                      ? 'bg-zinc-700 text-sky-400 shadow-sm'
                      : 'bg-white text-sky-600 shadow-sm'
                    : isDarkMode
                      ? 'bg-transparent text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                      : 'bg-transparent text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          
          {/* 기간 필터 */}
          <div className={`flex gap-1 p-1 rounded-lg ${
            isDarkMode ? 'bg-zinc-800' : 'bg-zinc-100'
          }`}>
            {[
              { value: 3 as const, label: '3개월' },
              { value: 12 as const, label: '1년' },
              { value: 36 as const, label: '3년' },
              { value: 0 as const, label: '전체' }
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  period === p.value
                    ? isDarkMode
                      ? 'bg-zinc-700 text-sky-400 shadow-sm'
                      : 'bg-white text-sky-600 shadow-sm'
                    : isDarkMode
                      ? 'bg-transparent text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                      : 'bg-transparent text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          
          {/* 면적 필터 */}
          {availableAreas.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setIsAreaDropdownOpen(!isAreaDropdownOpen)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1 ${
                  selectedArea !== null
                    ? isDarkMode
                      ? 'bg-sky-900/30 text-sky-400 border border-sky-700'
                      : 'bg-sky-100 text-sky-600 border border-sky-300'
                    : isDarkMode
                      ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                <Ruler className="w-4 h-4" />
                {selectedArea !== null ? `${selectedArea}㎡` : '면적'}
                {isAreaDropdownOpen ? (
                  <ChevronUpIcon className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              <AnimatePresence>
                {isAreaDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`absolute top-full left-0 mt-1 border rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto ${
                      isDarkMode 
                        ? 'bg-zinc-800 border-zinc-700' 
                        : 'bg-white border-zinc-200'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setSelectedArea(null);
                        setIsAreaDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm ${
                        selectedArea === null
                          ? isDarkMode
                            ? 'bg-sky-900/20 text-sky-400'
                            : 'bg-sky-50 text-sky-600'
                          : isDarkMode
                            ? 'text-zinc-300 hover:bg-zinc-700'
                            : 'text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      전체
                    </button>
                    {availableAreas.map((area) => (
                      <button
                        key={area}
                        onClick={() => {
                          setSelectedArea(area);
                          setIsAreaDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm ${
                          selectedArea === area
                            ? isDarkMode
                              ? 'bg-sky-900/20 text-sky-400'
                              : 'bg-sky-50 text-sky-600'
                            : isDarkMode
                              ? 'text-zinc-300 hover:bg-zinc-700'
                              : 'text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        {area}㎡ ({Math.round(area * 0.3025 * 10) / 10}평)
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
        
        {transactionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : chartData.length > 0 ? (
          <div ref={chartContainerRef} className="w-full">
            <HighchartsReact
              highcharts={Highcharts}
              options={{
                chart: {
                  type: 'line',
                  backgroundColor: 'transparent',
                  height: 300,
                  style: {
                    fontFamily: 'inherit'
                  }
                },
                title: {
                  text: ''
                },
                xAxis: {
                  categories: chartData.map(d => d.month),
                  labels: {
                    style: {
                      color: isDarkMode ? '#a1a1aa' : '#71717a'
                    }
                  },
                  gridLineColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
                  lineColor: isDarkMode ? '#3f3f46' : '#e4e4e7'
                },
                yAxis: {
                  title: {
                    text: '만원',
                    style: {
                      color: isDarkMode ? '#a1a1aa' : '#71717a'
                    }
                  },
                  labels: {
                    style: {
                      color: isDarkMode ? '#a1a1aa' : '#71717a'
                    },
                    formatter: function() {
                      return (this.value / 10000).toFixed(1) + '억';
                    }
                  },
                  gridLineColor: isDarkMode ? '#3f3f46' : '#e4e4e7'
                },
                tooltip: {
                  backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
                  borderColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
                  style: {
                    color: isDarkMode ? '#ffffff' : '#18181b'
                  },
                  shared: true,
                  formatter: function() {
                    let tooltip = `<b>${this.x}</b><br/>`;
                    this.points?.forEach((point: any) => {
                      if (point.y !== null) {
                        const priceInEok = (point.y / 10000).toFixed(1);
                        tooltip += `<span style="color:${point.color}">●</span> ${point.series.name}: <b>${priceInEok}억원</b><br/>`;
                      }
                    });
                    return tooltip;
                  }
                },
                legend: {
                  enabled: true,
                  itemStyle: {
                    color: isDarkMode ? '#a1a1aa' : '#71717a'
                  }
                },
                plotOptions: {
                  line: {
                    marker: {
                      enabled: true,
                      radius: 4,
                      lineWidth: 2
                    },
                    lineWidth: 2,
                    states: {
                      hover: {
                        lineWidth: 3
                      }
                    },
                    connectNulls: false
                  }
                },
                series: (() => {
                  const series = [];
                  if (transactionType === 'all' || transactionType === 'sale') {
                    series.push({
                      name: '매매가',
                      type: 'line',
                      data: chartData.map(d => d.salePrice),
                      color: '#3b82f6',
                      marker: {
                        fillColor: '#3b82f6'
                      }
                    });
                  }
                  if (transactionType === 'all' || transactionType === 'jeonse') {
                    series.push({
                      name: '전세가',
                      type: 'line',
                      data: chartData.map(d => d.jeonsePrice),
                      color: '#10b981',
                      marker: {
                        fillColor: '#10b981'
                      }
                    });
                  }
                  if (transactionType === 'all' || transactionType === 'monthly') {
                    series.push({
                      name: '월세보증금',
                      type: 'line',
                      data: chartData.map(d => d.monthlyPrice),
                      color: '#a855f7',
                      marker: {
                        fillColor: '#a855f7'
                      }
                    });
                  }
                  return series;
                })(),
                credits: {
                  enabled: false
                }
              }}
            />
          </div>
        ) : (
          <DevelopmentPlaceholder 
            title="데이터 없음"
            message={`선택한 기간(${period === 0 ? '전체' : period === 3 ? '3개월' : period === 12 ? '1년' : '3년'})에 거래 데이터가 없습니다.`}
            isDarkMode={isDarkMode}
          />
        )}
      </div>

      {/* Additional Info */}
      <div className={`rounded-2xl p-5 ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50 border border-blue-200'}`}>
        <h3 className={`text-sm font-bold ${textPrimary} mb-2 flex items-center gap-2`}>
          <TrendingUp className="w-4 h-4 text-blue-500" />
          거래 정보 활용 팁
        </h3>
        <ul className={`text-sm ${textSecondary} space-y-1.5 leading-relaxed`}>
          <li>• <span className="font-semibold">층수별 차이:</span> 같은 평형이라도 층수에 따라 가격이 다를 수 있어요</li>
          <li>• <span className="font-semibold">거래 빈도:</span> 최근 거래가 많다면 시세가 투명하고 매매가 활발해요</li>
          <li>• <span className="font-semibold">가격 추세:</span> 지속적으로 오르는지 내리는지 확인하세요</li>
        </ul>
      </div>

      {/* Toast Container */}
      {ToastComponent}
      
      {/* 다이나믹 아일랜드 토스트 */}
      {ToastComponent}

      {/* 전세매물 추가 모달 */}
      <AddMyJeonserateModal
        isOpen={isAddJeonserateModalOpen}
        onClose={() => setIsAddJeonserateModalOpen(false)}
        isDarkMode={isDarkMode}
        apartment={apartment}
      />
    </div>
  );
}