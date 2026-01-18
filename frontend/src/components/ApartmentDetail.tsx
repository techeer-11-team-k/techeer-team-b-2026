import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, MapPin, TrendingUp, TrendingDown, Calendar, Layers, Home, Ruler, Building, ChevronDown, ChevronUp, ChevronRight, Train, School, Info, Star } from 'lucide-react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import Highcharts from 'highcharts/highstock';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';
import { getApartmentDetail, ApartmentDetailData, getApartmentTransactions, ApartmentTransactionsResponse, TransactionData } from '../lib/apartmentApi';
import { addFavoriteApartment, getFavoriteApartments, deleteFavoriteApartment } from '../lib/favoritesApi';
import { createRecentView } from '../lib/usersApi';
import { useAuth } from '../lib/clerk';
import { useDynamicIslandToast } from './ui/DynamicIslandToast';

interface ApartmentDetailProps {
  apartment: any;
  onBack: () => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

export default function ApartmentDetail({ apartment, onBack, isDarkMode, isDesktop = false }: ApartmentDetailProps) {
  const { isSignedIn, getToken } = useAuth();
  const { showSuccess, showError, showWarning, showInfo, ToastComponent } = useDynamicIslandToast(isDarkMode, 3000);
  const [detailData, setDetailData] = useState<ApartmentDetailData | null>(null);
  const [transactionsData, setTransactionsData] = useState<ApartmentTransactionsResponse['data'] | null>(null);
  const [currentPriceData, setCurrentPriceData] = useState<ApartmentTransactionsResponse['data'] | null>(null); // 현재 시세용 (최근 3개월 고정)
  const [loading, setLoading] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [checkingFavorite, setCheckingFavorite] = useState(false);
  const [isAddingFavorite, setIsAddingFavorite] = useState(false);
  const starControls = useAnimation();
  
  // 가격 추이 필터 상태
  const [transactionType, setTransactionType] = useState<'sale' | 'jeonse'>('sale');
  const [period, setPeriod] = useState<'3m' | '1y' | '3y' | 'all'>('3m');
  const [selectedAreaMin, setSelectedAreaMin] = useState<number | undefined>(undefined);
  const [selectedAreaMax, setSelectedAreaMax] = useState<number | undefined>(undefined);
  const [priceType, setPriceType] = useState<'pyeong' | 'price'>('price'); // 기본값을 매매가/전세가로 변경
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<Highcharts.Chart | null>(null);

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

  // 현재 시세용 데이터 조회 (최근 3개월 고정, 필터와 무관)
  // 최근 3개월 간의 처음과 끝 매매 히스토리 기반으로 변화율 계산
  useEffect(() => {
    const fetchCurrentPrice = async () => {
      if (apartment?.apt_id || apartment?.id) {
        try {
          const id = apartment.apt_id || apartment.id;
          const data = await getApartmentTransactions(
            id, 
            'sale', // 현재 시세는 매매 기준
            10, 
            '3m', // 최근 3개월 고정
            undefined, // 면적 필터 없음
            undefined,
            'price' // 매매가 기준 (처음과 끝 거래 가격 직접 비교)
          );
          if (data) {
            setCurrentPriceData(data);
          } else {
            setCurrentPriceData(null);
          }
        } catch (error) {
          console.error("Failed to fetch current price", error);
          setCurrentPriceData(null);
        }
      }
    };

    fetchCurrentPrice();
  }, [apartment]);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (apartment?.apt_id || apartment?.id) {
        setTransactionsLoading(true);
        try {
          const id = apartment.apt_id || apartment.id;
          const data = await getApartmentTransactions(
            id, 
            transactionType, 
            10, 
            period,
            selectedAreaMin,
            selectedAreaMax,
            priceType
          );
          if (data) {
            console.log('거래 데이터 수신:', data);
            setTransactionsData(data);
          } else {
            console.warn('거래 데이터가 null입니다. API 응답을 확인하세요.');
            setTransactionsData(null);
          }
        } catch (error) {
          console.error("Failed to fetch transactions", error);
          setTransactionsData(null);
        } finally {
          setTransactionsLoading(false);
        }
      }
    };

    fetchTransactions();
  }, [apartment, transactionType, period, selectedAreaMin, selectedAreaMax, priceType]);

  // Highcharts Stock 차트 렌더링
  useEffect(() => {
    if (!transactionsData?.price_trend || transactionsData.price_trend.length === 0 || !chartRef.current) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
      return;
    }

    // 기존 차트가 있으면 제거
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const priceLabel = priceType === 'pyeong' 
      ? '평당가 (만원/평)' 
      : transactionType === 'sale' 
        ? '매매가 (만원)' 
        : '전세가 (만원)';

    // Stock 차트용 데이터 포맷: [timestamp, value] - Highcharts Stock 기본 형식
    const stockChartData = transactionsData.price_trend
      .map(item => {
        const timestamp = new Date(item.month + '-01').getTime();
        const value = item.price_value || 0;
        return [timestamp, value] as [number, number];
      })
      .filter(item => item[1] > 0); // 값이 0보다 큰 데이터만 표시

    if (stockChartData.length === 0) {
      return;
    }

    // Highcharts Stock 차트 생성
    chartInstanceRef.current = Highcharts.stockChart(chartRef.current, {
      chart: {
        backgroundColor: 'transparent',
        height: 350,
        spacing: [10, 10, 10, 10]
      },
      title: {
        text: ''
      },
      credits: {
        enabled: false
      },
      rangeSelector: {
        enabled: false
      },
      navigator: {
        enabled: false
      },
      scrollbar: {
        enabled: false
      },
      xAxis: {
        type: 'datetime',
        labels: {
          style: {
            color: isDarkMode ? '#a1a1aa' : '#71717a',
            fontSize: '11px'
          },
          format: '{value:%Y-%m}'
        },
        gridLineColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
        lineColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
        tickColor: isDarkMode ? '#3f3f46' : '#e4e4e7'
      },
      yAxis: {
        title: {
          text: priceLabel,
          style: {
            color: isDarkMode ? '#a1a1aa' : '#71717a',
            fontSize: '11px'
          }
        },
        labels: {
          style: {
            color: isDarkMode ? '#a1a1aa' : '#71717a',
            fontSize: '11px'
          },
          formatter: function() {
            return this.value.toLocaleString();
          }
        },
        gridLineColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
        lineColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
        opposite: false
      },
      tooltip: {
        backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
        borderColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
        borderRadius: 8,
        style: {
          color: isDarkMode ? '#ffffff' : '#18181b',
          fontSize: '12px'
        },
        formatter: function() {
          const point = this.point as any;
          const month = new Date(point.x).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
          const trendItem = transactionsData.price_trend.find((item: any) => 
            new Date(item.month + '-01').getTime() === point.x
          );
          return `
            <div style="padding: 4px;">
              <div style="font-weight: bold; margin-bottom: 4px;">${month}</div>
              <div>${priceLabel}: <strong>${point.y.toLocaleString()}</strong></div>
              ${trendItem ? `<div style="font-size: 11px; color: ${isDarkMode ? '#a1a1aa' : '#71717a'}; margin-top: 4px;">
                거래 건수: ${trendItem.transaction_count}건
              </div>` : ''}
            </div>
          `;
        }
      },
      plotOptions: {
        area: {
          fillColor: {
            linearGradient: {
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 1
            },
            stops: [
              [0, isDarkMode ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'],
              [1, isDarkMode ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.05)']
            ]
          },
          lineWidth: 2,
          marker: {
            enabled: true,
            radius: 4,
            fillColor: '#3b82f6',
            lineWidth: 2,
            lineColor: '#ffffff'
          },
          states: {
            hover: {
              lineWidth: 3,
              marker: {
                radius: 6
              }
            }
          },
          threshold: null
        }
      },
      series: [{
        type: 'area',
        name: priceLabel,
        data: stockChartData,
        color: '#3b82f6',
        fillOpacity: 0.6
      }],
      legend: {
        enabled: false
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [transactionsData?.price_trend, priceType, transactionType, isDarkMode]);

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

  const handleToggleFavorite = async () => {
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
  };

  const cardClass = isDarkMode
    ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';
  
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';

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

  // Basic Info from Search Result or Detail API
  // 현재 시세는 최근 3개월 고정 데이터에서 가져오기 (필터와 무관)
  const recentPrice = currentPriceData?.recent_transactions?.[0]?.price;
  const price = recentPrice 
    ? (recentPrice >= 10000 
      ? `${(recentPrice / 10000).toFixed(1)}억원`
      : `${recentPrice.toLocaleString()}만원`)
    : (apartment.price || "시세 정보 없음");
  
  // 현재 시세의 변화율도 최근 3개월 고정 데이터에서 가져오기
  const changeStr = currentPriceData?.change_summary?.change_rate !== undefined
    ? `${currentPriceData.change_summary.change_rate >= 0 ? '+' : ''}${currentPriceData.change_summary.change_rate.toFixed(2)}%`
    : (apartment.change || "0%");
  const changeValue = parseFloat(changeStr.replace(/[+%]/g, ''));
  const isPositive = changeValue > 0;
  const address = detailData?.road_address || detailData?.jibun_address || apartment.address || apartment.location || "주소 정보 없음";
  
  // Detailed Info (with fallbacks)
  const buildYear = detailData?.use_approval_date ? new Date(detailData.use_approval_date).getFullYear() + '년' : "-";
  const totalUnits = detailData?.total_household_cnt ? `${detailData.total_household_cnt.toLocaleString()}세대` : "-";
  
  // Parking calculation
  const totalParking = detailData?.total_parking_cnt || 0;
  const totalHouseholds = detailData?.total_household_cnt || 1;
  const parkingPerHousehold = totalParking > 0 ? (totalParking / totalHouseholds).toFixed(2) : "-";

  return (
    <div className={`space-y-6 pb-10 ${isDesktop ? 'max-w-full' : ''}`} style={{ paddingTop: isDesktop ? '3rem' : '2rem' }}>
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

      {/* Current Price Card */}
      <div className={`rounded-2xl p-6 ${cardClass}`}>
        <div className="flex items-end justify-between">
          <div>
            <p className={`text-sm ${textSecondary} mb-1`}>현재 시세 (최근 거래가)</p>
            <p className={`text-4xl font-bold bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent`}>
              {price}
            </p>
          </div>
          
          {(transactionsData?.change_summary || apartment.change) && (
            <div className={`px-4 py-2 rounded-xl border ${
                isPositive 
                ? 'bg-green-500/20 border-green-500/30' 
                : 'bg-red-500/20 border-red-500/30'
            }`}>
                <div className="flex items-center gap-1">
                {isPositive ? (
                    <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                    <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
                <span className={`text-xl font-bold ${
                    isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                    {changeStr}
                </span>
                </div>
                <p className={`text-xs ${textSecondary} mt-1 text-center`}>최근 3개월</p>
            </div>
          )}
        </div>
      </div>

      {/* Basic Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-2xl p-4 ${cardClass} flex flex-col justify-center`}>
          <div className="flex items-center gap-2 mb-2">
            <Building className="w-4 h-4 text-sky-400" />
            <span className={`text-xs ${textSecondary}`}>건축년도</span>
          </div>
          <p className={`text-lg font-bold ${textPrimary}`}>
            {loading ? <span className="opacity-50 text-sm">로딩중...</span> : buildYear}
          </p>
        </div>
        
        <div className={`rounded-2xl p-4 ${cardClass} flex flex-col justify-center`}>
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <span className={`text-xs ${textSecondary}`}>총 세대수</span>
          </div>
          <p className={`text-lg font-bold ${textPrimary}`}>
            {loading ? <span className="opacity-50 text-sm">로딩중...</span> : totalUnits}
          </p>
        </div>
        
        <div className={`rounded-2xl p-4 ${cardClass} flex flex-col justify-center`}>
          <div className="flex items-center gap-2 mb-2">
            <Home className="w-4 h-4 text-sky-400" />
            <span className={`text-xs ${textSecondary}`}>세대당 주차</span>
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
                        <p className={`text-xs ${textSecondary} mb-1`}>난방 방식</p>
                        <p className={`font-medium ${textPrimary}`}>{detailData?.code_heat_nm || "-"}</p>
                     </div>
                     <div>
                        <p className={`text-xs ${textSecondary} mb-1`}>복도 유형</p>
                        <p className={`font-medium ${textPrimary}`}>{detailData?.hallway_type || "-"}</p>
                     </div>
                     <div>
                        <p className={`text-xs ${textSecondary} mb-1`}>관리 방식</p>
                        <p className={`font-medium ${textPrimary}`}>{detailData?.manage_type || "-"}</p>
                     </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                     <div>
                        <p className={`text-xs ${textSecondary} mb-1`}>건설사</p>
                        <p className={`font-medium ${textPrimary}`}>{detailData?.builder_name || "-"}</p>
                     </div>
                     <div>
                        <p className={`text-xs ${textSecondary} mb-1`}>시행사</p>
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
                                <p className={`text-xs font-bold ${textSecondary} mb-1`}>교통 정보</p>
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
                                <p className={`text-xs font-bold ${textSecondary} mb-1`}>교육 시설</p>
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
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className={`text-lg font-bold ${textPrimary} mb-1`}>가격 변화 추이</h2>
              <p className={`text-xs ${textSecondary}`}>
                {priceType === 'pyeong' 
                  ? `${transactionType === 'sale' ? '매매' : '전세'} 평당가 (단위: 만원/평)`
                  : `${transactionType === 'sale' ? '매매가' : '전세가'} (단위: 만원)`
                }
              </p>
            </div>
            {transactionsData?.change_summary && transactionsData.change_summary.previous_avg > 0 && transactionsData.change_summary.recent_avg > 0 && (
              <div className={`px-4 py-3 rounded-xl border ${
                transactionsData.change_summary.change_rate >= 0
                  ? 'bg-green-500/20 border-green-500/30' 
                  : 'bg-red-500/20 border-red-500/30'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {transactionsData.change_summary.change_rate >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                    )}
                    <span className={`text-xs ${textSecondary}`}>
                      {transactionsData.change_summary.period || '기간 정보 없음'}
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${
                    transactionsData.change_summary.change_rate >= 0 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {transactionsData.change_summary.change_rate >= 0 ? '+' : ''}{transactionsData.change_summary.change_rate.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs ${textSecondary} mb-0.5`}>시작</p>
                    <p className={`text-sm font-semibold ${textPrimary} whitespace-nowrap`}>
                      {transactionsData.change_summary.previous_avg > 0 
                        ? `${Math.round(transactionsData.change_summary.previous_avg).toLocaleString()}${priceType === 'pyeong' ? '만원/평' : '만원'}`
                        : '데이터 없음'}
                    </p>
                  </div>
                  <div className="flex-shrink-0 px-2">
                    <ChevronRight className={`w-4 h-4 ${textSecondary}`} />
                  </div>
                  <div className="flex-1 text-right min-w-0">
                    <p className={`text-xs ${textSecondary} mb-0.5`}>종료</p>
                    <p className={`text-sm font-semibold ${textPrimary} whitespace-nowrap`}>
                      {transactionsData.change_summary.recent_avg > 0 
                        ? `${Math.round(transactionsData.change_summary.recent_avg).toLocaleString()}${priceType === 'pyeong' ? '만원/평' : '만원'}`
                        : '데이터 없음'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* 필터 컨트롤 */}
          <div className="flex flex-wrap gap-2 mb-4">
            {/* 거래 유형 선택 */}
            <div className="flex gap-1 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setTransactionType('sale')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  transactionType === 'sale'
                    ? 'bg-blue-500 text-white'
                    : isDarkMode
                    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    : 'bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                매매
              </button>
              <button
                onClick={() => setTransactionType('jeonse')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  transactionType === 'jeonse'
                    ? 'bg-blue-500 text-white'
                    : isDarkMode
                    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    : 'bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                전세
              </button>
            </div>
            
            {/* 기간 선택 */}
            <div className="flex gap-1 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
              {(['3m', '1y', '3y', 'all'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    period === p
                      ? 'bg-blue-500 text-white'
                      : isDarkMode
                      ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      : 'bg-white text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {p === '3m' ? '3개월' : p === '1y' ? '1년' : p === '3y' ? '3년' : '전체'}
                </button>
              ))}
            </div>
            
            {/* 가격 표시 유형 */}
            <div className="flex gap-1 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setPriceType('price')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  priceType === 'price'
                    ? 'bg-blue-500 text-white'
                    : isDarkMode
                    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    : 'bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {transactionType === 'sale' ? '매매가' : '전세가'}
              </button>
              <button
                onClick={() => setPriceType('pyeong')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  priceType === 'pyeong'
                    ? 'bg-blue-500 text-white'
                    : isDarkMode
                    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    : 'bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                평당가
              </button>
            </div>
            
            {/* 단위면적 선택 */}
            {transactionsData?.available_areas && transactionsData.available_areas.length > 0 && (
              <select
                value={selectedAreaMin !== undefined ? `${selectedAreaMin}-${selectedAreaMax || ''}` : 'all'}
                onChange={(e) => {
                  if (e.target.value === 'all') {
                    setSelectedAreaMin(undefined);
                    setSelectedAreaMax(undefined);
                  } else {
                    const [min, max] = e.target.value.split('-').map(v => v ? parseFloat(v) : undefined);
                    setSelectedAreaMin(min);
                    setSelectedAreaMax(max);
                  }
                }}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  isDarkMode
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                    : 'bg-white border-zinc-200 text-zinc-700'
                }`}
              >
                <option value="all">전체 면적</option>
                {transactionsData.available_areas.map((area, idx) => {
                  const pyeong = Math.round(area * 0.3025 * 10) / 10;
                  return (
                    <option key={idx} value={`${area}-${area}`}>
                      {area}㎡ ({pyeong}평)
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        </div>
        {transactionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : transactionsData?.price_trend && transactionsData.price_trend.length > 0 ? (
          <div ref={chartRef} className="w-full" style={{ height: '350px', minHeight: '350px' }}></div>
        ) : (
          <DevelopmentPlaceholder 
            title="데이터 없음"
            message="가격 변화 추이 데이터가 없습니다."
            isDarkMode={isDarkMode}
          />
        )}
      </div>

      {/* Transaction History */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-sky-400" />
          <div>
            <h2 className={`text-lg font-bold ${textPrimary}`}>실거래 내역</h2>
            <p className={`text-xs ${textSecondary} mt-0.5`}>
              {transactionsData?.recent_transactions && transactionsData.recent_transactions.length > 0
                ? `최근 ${transactionsData.recent_transactions.length}건`
                : '실거래 내역'}
            </p>
          </div>
        </div>

        {transactionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : transactionsData?.recent_transactions && transactionsData.recent_transactions.length > 0 ? (
          <div className="space-y-3">
            {transactionsData.recent_transactions.map((transaction: TransactionData, index: number) => (
              <div
                key={transaction.trans_id || index}
                className={`p-4 rounded-xl border transition-all ${
                  isDarkMode
                    ? 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800'
                    : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${
                        isDarkMode ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-200 text-zinc-700'
                      }`}>
                        {transaction.date ? new Date(transaction.date).toLocaleDateString('ko-KR', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        }) : '날짜 미상'}
                      </span>
                      {transaction.floor && (
                        <span className={`text-xs ${textSecondary}`}>
                          {transaction.floor}층
                        </span>
                      )}
                      {transaction.area && (
                        <span className={`text-xs ${textSecondary}`}>
                          {transaction.area.toFixed(2)}㎡ ({Math.round(transaction.area * 0.3025 * 10) / 10}평)
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-lg font-bold ${textPrimary}`}>
                        {transaction.price ? `${(transaction.price / 10000).toLocaleString()}억` : '가격 정보 없음'}
                      </span>
                      {transaction.price_per_pyeong && (
                        <span className={`text-sm ${textSecondary}`}>
                          ({transaction.price_per_pyeong.toLocaleString()}만원/평)
                        </span>
                      )}
                    </div>
                    {transaction.trans_type && (
                      <div className={`text-xs mt-1 ${textSecondary}`}>
                        거래 유형: {transaction.trans_type === '중도금지급' ? '중도금지급' : transaction.trans_type}
                      </div>
                    )}
                  </div>
                  {transaction.is_canceled && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600'
                    }`}>
                      취소
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DevelopmentPlaceholder 
            title="데이터 없음"
            message="실거래 내역 데이터가 없습니다."
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
        <ul className={`text-xs ${textSecondary} space-y-1.5 leading-relaxed`}>
          <li>• <span className="font-semibold">층수별 차이:</span> 같은 평형이라도 층수에 따라 가격이 다를 수 있어요</li>
          <li>• <span className="font-semibold">거래 빈도:</span> 최근 거래가 많다면 시세가 투명하고 매매가 활발해요</li>
          <li>• <span className="font-semibold">가격 추세:</span> 지속적으로 오르는지 내리는지 확인하세요</li>
        </ul>
      </div>

      {/* Toast Container */}
      {ToastComponent}
      
      {/* 다이나믹 아일랜드 토스트 */}
      {ToastComponent}
    </div>
  );
}
