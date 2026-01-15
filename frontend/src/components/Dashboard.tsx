import React, { useState, useEffect } from 'react';
import { TrendingUp, Search, ChevronRight, ArrowUpRight, ArrowDownRight, Building2, Flame, TrendingDown, X } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';
import { useApartmentSearch } from '../hooks/useApartmentSearch';
import SearchResultsList from './ui/SearchResultsList';
import LocationSearchResults from './ui/LocationSearchResults';
import { ApartmentSearchResult, searchLocations, LocationSearchResult, getApartmentsByRegion } from '../lib/searchApi';
import { useAuth } from '../lib/clerk';
import LocationBadge from './LocationBadge';
import { motion } from 'framer-motion';
import { getDashboardSummary, getDashboardRankings, getRegionalHeatmap, getRegionalTrends, PriceTrendData, VolumeTrendData, MonthlyTrendData, RegionalTrendData, TrendingApartment, RankingApartment, RegionalHeatmapItem, RegionalTrendItem, getPriceDistribution, getRegionalPriceCorrelation, PriceDistributionItem, RegionalCorrelationItem } from '../lib/dashboardApi';
import HistogramChart from './charts/HistogramChart';
import BubbleChart from './charts/BubbleChart';

interface DashboardProps {
  onApartmentClick: (apartment: any) => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

// 더미 데이터 제거 - 개발 중입니다로 대체

export default function Dashboard({ onApartmentClick, isDarkMode, isDesktop = false }: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [rankingTab, setRankingTab] = useState<'sale' | 'jeonse'>('sale');
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationSearchResult | null>(null);
  const [regionApartments, setRegionApartments] = useState<ApartmentSearchResult[]>([]);
  const [isLoadingRegionApartments, setIsLoadingRegionApartments] = useState(false);
  
  const { results, isSearching } = useApartmentSearch(searchQuery);
  const { isSignedIn, getToken } = useAuth();

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

  // 지역 검색
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 1) {
        setIsSearchingLocations(true);
        try {
          const token = isSignedIn && getToken ? await getToken() : null;
          const locations = await searchLocations(searchQuery, token);
          setLocationResults(locations);
        } catch (error) {
          console.error('Failed to search locations:', error);
          setLocationResults([]);
        } finally {
          setIsSearchingLocations(false);
        }
      } else {
        setLocationResults([]);
        // 검색어가 비어지면 선택된 지역도 초기화
        if (selectedLocation) {
          setSelectedLocation(null);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isSignedIn, getToken, selectedLocation]);

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

  const handleSelect = (apt: ApartmentSearchResult) => {
    onApartmentClick({
      name: apt.apt_name,
      price: apt.price,
      change: "0%", // Default value as API doesn't return this yet
      ...apt
    });
    setSearchQuery('');
    setSelectedLocation(null);
  };

  const handleLocationSelect = (location: LocationSearchResult) => {
    setSelectedLocation(location);
    setSearchQuery(location.full_name);
  };

  const handleClearLocation = () => {
    setSelectedLocation(null);
    setSearchQuery('');
    setRegionApartments([]);
  };

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
          className={`mb-4 p-4 rounded-2xl border ${
            isDarkMode
              ? 'bg-zinc-900 border-zinc-800'
              : 'bg-white border-zinc-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                {selectedLocation.full_name}
              </h3>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {isLoadingRegionApartments ? '아파트 조회 중...' : `${regionApartments.length}개의 아파트`}
              </p>
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
              {selectedLocation.full_name} 아파트 목록
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
                      <div className="flex-1">
                        <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                          {apt.apt_name}
                        </p>
                        {apt.address && (
                          <p className={`text-sm mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                            {apt.address}
                          </p>
                        )}
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
        className="relative mt-2 z-50"
      >
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            type="text"
            placeholder="아파트 이름, 지역 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-12 pr-4 py-3.5 rounded-2xl border transition-all ${
              isDarkMode
                ? 'bg-zinc-900 border-white/10 focus:border-sky-500/50 text-white placeholder:text-zinc-600'
                : 'bg-white border-black/5 focus:border-sky-500 text-zinc-900 placeholder:text-zinc-400'
            } focus:outline-none focus:ring-4 focus:ring-sky-500/10`}
          />
        </div>

        {/* Search Results Dropdown */}
        {(searchQuery.length >= 1 || isSearching || isSearchingLocations) && (
          <div className={`absolute top-full left-0 right-0 mt-2 rounded-2xl border shadow-xl overflow-hidden z-[100] max-h-[60vh] overflow-y-auto ${
            isDarkMode 
              ? 'bg-zinc-900 border-zinc-800' 
              : 'bg-white border-zinc-200'
          }`}>
            <div className="p-4 space-y-4">
              {/* 지역 검색 결과 */}
              {locationResults.length > 0 && (
                <LocationSearchResults
                  results={locationResults}
                  onSelect={handleLocationSelect}
                  isDarkMode={isDarkMode}
                  query={searchQuery}
                  isSearching={isSearchingLocations}
                />
              )}
              
              {/* 아파트 검색 결과 */}
              {searchQuery.length >= 2 && (
                <SearchResultsList 
                  results={results}
                  onSelect={handleSelect}
                  isDarkMode={isDarkMode}
                  query={searchQuery}
                  isSearching={isSearching}
                />
              )}
              
              {/* 검색 결과가 없을 때 */}
              {searchQuery.length >= 2 && results.length === 0 && !isSearching && locationResults.length === 0 && !isSearchingLocations && (
                <div className={`py-4 text-center ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  검색 결과가 없습니다.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
                <TrendingUp className="w-5 h-5 text-blue-500" />
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
                          <span className={`flex-shrink-0 w-6 text-sm font-bold ${
                            index < 3
                              ? 'text-blue-500'
                              : isDarkMode
                              ? 'text-zinc-400'
                              : 'text-zinc-500'
                          }`}>
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
                          <div className={`text-base font-bold ${item.change_rate >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
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
                <TrendingUp className="w-5 h-5 text-blue-500" />
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
                          <div className={`text-sm font-bold ${item.change_rate >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
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
                  <ArrowUpRight className="w-4 h-4 text-emerald-500" />
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
                            <span className={`flex-shrink-0 w-5 text-xs font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
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
                            <div className={`text-xs font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
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
                  <ArrowDownRight className="w-4 h-4 text-red-500" />
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
                  <ArrowUpRight className="w-4 h-4 text-emerald-500" />
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
                            <span className={`flex-shrink-0 w-4 text-xs font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
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
                            <div className={`text-xs font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
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
                  <ArrowDownRight className="w-4 h-4 text-red-500" />
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
    </motion.div>
  );
}