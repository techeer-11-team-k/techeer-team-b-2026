import React, { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Building2, TrendingUp, TrendingDown, Home, BarChart3 } from 'lucide-react';
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

export default function RegionDetail({ region, onBack, onApartmentSelect, isDarkMode, isDesktop = false }: RegionDetailProps) {
  const [stats, setStats] = useState<RegionStats | null>(null);
  const [apartments, setApartments] = useState<ApartmentSearchResult[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingApartments, setLoadingApartments] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoadingStats(true);
      setLoadingApartments(true);
      try {
        const [statsData, apartmentsData] = await Promise.all([
          getRegionStats(region.region_id, 'sale', 3),
          getApartmentsByRegion(region.region_id, 50, 0)
        ]);
        if (statsData) {
          setStats(statsData);
        }
        if (apartmentsData) {
          setApartments(apartmentsData);
        }
      } catch (error) {
        console.error('Failed to load region data:', error);
      } finally {
        setLoadingStats(false);
        setLoadingApartments(false);
      }
    };

    loadData();
  }, [region.region_id]);

  const textPrimary = isDarkMode ? 'text-white' : 'text-zinc-900';
  const textSecondary = isDarkMode ? 'text-zinc-400' : 'text-zinc-600';
  const textMuted = isDarkMode ? 'text-zinc-500' : 'text-zinc-500';

  const displayName = region.full_name || `${region.city_name} ${region.region_name}`;

  return (
    <div className={`w-full ${isDesktop ? 'max-w-6xl mx-auto' : ''}`}>
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
          <h1 className={`text-2xl font-bold ${textPrimary}`}>{displayName}</h1>
        </div>
      </div>

      {/* 통계 정보 */}
      {loadingStats ? (
        <div className={`text-center py-8 ${textSecondary}`}>통계 로딩 중...</div>
      ) : stats ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-6 mb-6 ${
            isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200'
          }`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        <h2 className={`text-xl font-bold mb-4 ${textPrimary}`}>지역 내 아파트</h2>
        {loadingApartments ? (
          <div className={`text-center py-8 ${textSecondary}`}>아파트 목록 로딩 중...</div>
        ) : apartments.length > 0 ? (
          <div className={isDesktop ? "grid grid-cols-2 gap-4" : "space-y-3"}>
            {apartments.map((apt, index) => (
              <motion.div
                key={apt.apt_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onApartmentSelect({ apt_id: apt.apt_id, apt_name: apt.apt_name, address: apt.address })}
                className={`rounded-2xl p-5 cursor-pointer transition-all hover:shadow-xl ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800'
                    : 'bg-white border border-sky-100 shadow-lg'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${
                    isDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                  }`}>
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-bold mb-1 ${textPrimary}`}>{apt.apt_name}</h3>
                    <p className={`text-sm ${textSecondary}`}>{apt.address}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className={`text-center py-8 ${textSecondary}`}>아파트 데이터가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
