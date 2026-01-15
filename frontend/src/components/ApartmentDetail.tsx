import React, { useEffect, useState } from 'react';
import { ArrowLeft, MapPin, TrendingUp, TrendingDown, Calendar, Layers, Home, Ruler, Building, ChevronDown, ChevronUp, Train, School, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';
import { getApartmentDetail, ApartmentDetailData } from '../lib/apartmentApi';

interface ApartmentDetailProps {
  apartment: any;
  onBack: () => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

export default function ApartmentDetail({ apartment, onBack, isDarkMode, isDesktop = false }: ApartmentDetailProps) {
  const [detailData, setDetailData] = useState<ApartmentDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showMoreInfo, setShowMoreInfo] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      if (apartment?.apt_id || apartment?.id) {
        setLoading(true);
        try {
          const id = apartment.apt_id || apartment.id;
          const data = await getApartmentDetail(id);
          setDetailData(data);
        } catch (error) {
          console.error("Failed to fetch details", error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchDetail();
  }, [apartment]);

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
  const price = apartment.price || "가격 정보 없음";
  const changeStr = apartment.change || "0%";
  const changeValue = parseFloat(changeStr.replace('%', ''));
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
        <div>
          <h1 className={`text-2xl font-bold ${textPrimary}`}>{apartment.name || apartment.apt_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <MapPin className="w-4 h-4 text-sky-400" />
            <p className={`text-sm ${textSecondary}`}>{address}</p>
          </div>
        </div>
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
          
          {apartment.change && (
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
                <p className={`text-xs ${textSecondary} mt-1 text-center`}>최근 6개월</p>
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
        <h2 className={`text-lg font-bold ${textPrimary} mb-1`}>가격 변화 추이</h2>
        <p className={`text-xs ${textSecondary} mb-4`}>최근 6개월 평균 거래가 (단위: 억원)</p>
        <DevelopmentPlaceholder 
          title="개발 중입니다"
          message="가격 변화 추이 데이터를 준비 중입니다."
          isDarkMode={isDarkMode}
        />
      </div>

      {/* Transaction History */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-sky-400" />
          <div>
            <h2 className={`text-lg font-bold ${textPrimary}`}>실거래 내역</h2>
            <p className={`text-xs ${textSecondary} mt-0.5`}>최근 8건 (84.92㎡ / 25.7평 기준)</p>
          </div>
        </div>

        <DevelopmentPlaceholder 
          title="개발 중입니다"
          message="실거래 내역 데이터를 준비 중입니다."
          isDarkMode={isDarkMode}
        />
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
    </div>
  );
}
