import React, { useState, useEffect } from 'react';
import { TrendingUp, Search, ChevronRight, ArrowUpRight, ArrowDownRight, Building2, Flame, TrendingDown, MapPin } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { motion } from 'framer-motion';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';
import { useApartmentSearch } from '../hooks/useApartmentSearch';
import SearchResultsList from './ui/SearchResultsList';
import { ApartmentSearchResult } from '../lib/searchApi';
import { useGeolocation } from '../hooks/useGeolocation';
import { coordToAddress } from '../lib/kakaoGeocoding';

interface DashboardProps {
  onApartmentClick: (apartment: any) => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

// 더미 데이터 제거 - 개발 중입니다로 대체

export default function Dashboard({ onApartmentClick, isDarkMode, isDesktop = false }: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [rankingTab, setRankingTab] = useState<'sale' | 'jeonse'>('sale');
  const { position: currentPosition, getCurrentPosition, requestPermission, loading: locationLoading } = useGeolocation(false);
  const [currentAddress, setCurrentAddress] = useState<string>('현재 위치');
  
  const { results, isSearching } = useApartmentSearch(searchQuery);

  // 현재 위치 가져오기
  useEffect(() => {
    const fetchLocation = async () => {
      const hasPermission = await requestPermission();
      if (hasPermission) {
        await getCurrentPosition();
      }
    };
    fetchLocation();
  }, []);

  // 좌표를 주소로 변환
  useEffect(() => {
    const convertToAddress = async () => {
      if (currentPosition) {
        console.log('📍 [Dashboard] Converting coordinates to address:', currentPosition);
        setCurrentAddress('주소 확인 중...');
        const address = await coordToAddress(currentPosition.lng, currentPosition.lat);
        if (address && address.address) {
          console.log('✅ [Dashboard] Address converted:', address.address);
          setCurrentAddress(address.address);
        } else {
          console.warn('⚠️ [Dashboard] Failed to convert address, showing coordinates');
          setCurrentAddress(`위도: ${currentPosition.lat.toFixed(4)}, 경도: ${currentPosition.lng.toFixed(4)}`);
        }
      } else {
        setCurrentAddress('현재 위치');
      }
    };
    convertToAddress();
  }, [currentPosition]);

  const handleSelect = (apt: ApartmentSearchResult) => {
    onApartmentClick({
      name: apt.apt_name,
      price: apt.price,
      change: "0%", // Default value as API doesn't return this yet
      ...apt
    });
    setSearchQuery('');
  };

  return (
    <motion.div 
      className={`w-full ${isDesktop ? 'space-y-6' : 'space-y-5'}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Current Location Card */}
      {currentPosition && (
        <motion.div 
          className={`flex items-center justify-between p-4 rounded-2xl ${
            isDarkMode ? 'bg-zinc-900' : 'bg-sky-50/50 border border-sky-100'
          }`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
        >
          <div className="flex items-center gap-2.5">
            <MapPin className="w-4 h-4 text-sky-500" />
            <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
              {locationLoading ? '위치 확인 중...' : currentAddress}
            </span>
          </div>
        </motion.div>
      )}

      {/* Search */}
      <motion.div 
        className="relative mt-2 z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
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
        {(searchQuery.length >= 2 || isSearching) && (
          <div className={`absolute top-full left-0 right-0 mt-2 rounded-2xl border shadow-xl overflow-hidden z-30 ${
            isDarkMode 
              ? 'bg-zinc-900 border-zinc-800' 
              : 'bg-white border-zinc-200'
          }`}>
             <SearchResultsList 
               results={results}
               onSelect={handleSelect}
               isDarkMode={isDarkMode}
               query={searchQuery}
               isSearching={isSearching}
             />
          </div>
        )}
      </motion.div>

      {/* 데스크톱: 첫 번째 줄 - 2컬럼 그리드 */}
      {isDesktop ? (
        <div className="grid grid-cols-2 gap-8">
          {/* 전국 평당가 및 거래량 추이 */}
          <motion.div 
            className={`rounded-2xl p-6 ${
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
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
            <DevelopmentPlaceholder 
              title="개발 중입니다"
              message="전국 평당가 및 거래량 추이 데이터를 준비 중입니다."
              isDarkMode={isDarkMode}
            />
          </motion.div>

          {/* 요즘 관심 많은 아파트 */}
          <motion.div 
            className={`rounded-2xl overflow-hidden ${
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="p-6 pb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  요즘 관심 많은 아파트
                </h3>
              </div>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                최근 7일 기준
              </p>
            </div>
            <DevelopmentPlaceholder 
              title="개발 중입니다"
              message="요즘 관심 많은 아파트 데이터를 준비 중입니다."
              isDarkMode={isDarkMode}
            />
          </motion.div>
        </div>
      ) : (
        <>
          {/* 모바일: 기존 세로 레이아웃 */}
          {/* 전국 평당가 및 거래량 추이 */}
          <motion.div 
            className={`rounded-2xl p-5 ${
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
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
            <DevelopmentPlaceholder 
              title="개발 중입니다"
              message="전국 평당가 및 거래량 추이 데이터를 준비 중입니다."
              isDarkMode={isDarkMode}
            />
          </motion.div>

          {/* 요즘 관심 많은 아파트 */}
          <motion.div 
            className={`rounded-2xl overflow-hidden ${
              isDarkMode 
                ? '' 
                : 'bg-white/80'
            }`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="p-5 pb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  요즘 관심 많은 아파트
                </h3>
              </div>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                최근 7일 기준
              </p>
            </div>
            <DevelopmentPlaceholder 
              title="개발 중입니다"
              message="요즘 관심 많은 아파트 데이터를 준비 중입니다."
              isDarkMode={isDarkMode}
            />
          </motion.div>
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
          <motion.div 
            key={rankingTab}
            className="col-span-9 grid grid-cols-2 gap-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
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
              <DevelopmentPlaceholder 
                title="개발 중입니다"
                message={`${rankingTab === 'sale' ? '매매' : '전세'} 상승 랭킹 데이터를 준비 중입니다.`}
                isDarkMode={isDarkMode}
              />
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
              <DevelopmentPlaceholder 
                title="개발 중입니다"
                message={`${rankingTab === 'sale' ? '매매' : '전세'} 하락 랭킹 데이터를 준비 중입니다.`}
                isDarkMode={isDarkMode}
              />
            </div>
          </motion.div>
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
          <motion.div 
            key={rankingTab}
            className="grid grid-cols-2 gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
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
              <DevelopmentPlaceholder 
                title="개발 중입니다"
                message={`${rankingTab === 'sale' ? '매매' : '전세'} 상승 랭킹 데이터를 준비 중입니다.`}
                isDarkMode={isDarkMode}
              />
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
              <DevelopmentPlaceholder 
                title="개발 중입니다"
                message={`${rankingTab === 'sale' ? '매매' : '전세'} 하락 랭킹 데이터를 준비 중입니다.`}
                isDarkMode={isDarkMode}
              />
            </div>
          </motion.div>
        </>
      )}

      {/* 월간 전국 아파트 값 추이 (전국 vs 지역) - 전체 너비 */}

      {/* 월간 전국 아파트 값 추이 (전국 vs 지역) */}
      <motion.div 
        className={`rounded-2xl ${isDesktop ? 'p-8' : 'p-6'} ${
          isDarkMode 
            ? '' 
            : 'bg-white'
        }`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <div className="mb-5">
          <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
            월간 아파트 값 추이
          </h3>
          <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
            전국 vs 주요 지역 비교
          </p>
        </div>
        
        <DevelopmentPlaceholder 
          title="개발 중입니다"
          message="월간 아파트 값 추이 데이터를 준비 중입니다."
          isDarkMode={isDarkMode}
        />
      </motion.div>
    </motion.div>
  );
}