import React, { useState, useEffect } from 'react';
import { Star, MapPin, ChevronRight, RefreshCw, ArrowUpRight, ArrowDownRight, TrendingUp, DollarSign, Shield, TrendingUpIcon, Gem } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import RegionalHeatmap from './RegionalHeatmap';
import RegionalRanking from './RegionalRanking';
import NewsSection from './NewsSection';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';
import { useGeolocation } from '../hooks/useGeolocation';
import { coordToAddress } from '../lib/kakaoGeocoding';

interface FavoritesProps {
  onApartmentClick?: (apartment: any) => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

// 더미 데이터 제거 - 개발 중입니다로 대체
const regionTabs = [
  { id: 'paju', label: '내 동네', subLabel: '파주시' },
  { id: 'gangnam', label: '서울시', subLabel: '강남구' },
  { id: 'hwacheon', label: '강원도', subLabel: '화천군' },
];

// 개발 중 - 더미 데이터 제거
const regionData = {
  paju: {
    location: '경기도 파주시',
    rank: '상위 15%',
    avgChange: '+4.5',
    avgPrice: 480,
    avgPriceKr: '4억 8천만원',
    transactions: 8500,
    priceByPeriod: {
      '3m': { price: '4억 8천만원', priceNum: 480, change: '+4.5' },
      '6m': { price: '4억 5천만원', priceNum: 450, change: '+9.8' },
      '1y': { price: '4억 1천만원', priceNum: 410, change: '+17.1' },
      '3y': { price: '3억 2천만원', priceNum: 320, change: '+50.0' },
    },
    priceIndex: {
      '3m': [
        { month: '11월', value: 105.2, value2: 103.5 },
        { month: '12월', value: 108.5, value2: 107.8 },
        { month: '01월', value: 114.8, value2: 116.5 },
      ],
      '6m': [
        { month: '08월', value: 105.2, value2: 103.5 },
        { month: '09월', value: 106.8, value2: 105.2 },
        { month: '10월', value: 108.5, value2: 107.8 },
        { month: '11월', value: 110.2, value2: 110.5 },
        { month: '12월', value: 112.4, value2: 113.2 },
        { month: '01월', value: 114.8, value2: 116.5 },
      ],
      '1y': [
        { month: '2월', value: 95.2, value2: 93.5 },
        { month: '4월', value: 98.5, value2: 97.8 },
        { month: '6월', value: 101.2, value2: 100.5 },
        { month: '8월', value: 105.2, value2: 103.5 },
        { month: '10월', value: 108.5, value2: 107.8 },
        { month: '12월', value: 112.4, value2: 113.2 },
        { month: '01월', value: 114.8, value2: 116.5 },
      ],
      '3y': [
        { month: '23년', value: 80.2, value2: 78.5 },
        { month: '23년 중', value: 85.5, value2: 83.8 },
        { month: '23년 말', value: 90.2, value2: 88.5 },
        { month: '24년 초', value: 95.2, value2: 93.5 },
        { month: '24년 중', value: 102.4, value2: 100.2 },
        { month: '24년 말', value: 112.4, value2: 113.2 },
        { month: '25년', value: 114.8, value2: 116.5 },
      ],
    },
    nearby: [
      { name: '파주시 평균', price: 480, priceKr: '4억 8천', change: '+4.5', trend: 'up' },
      { name: '인근 고양시', price: 520, priceKr: '5억 2천', change: '+3.8', trend: 'up' },
      { name: '인근 연천군', price: 210, priceKr: '2억 1천', change: '+2.1', trend: 'up' },
    ]
  },
  gangnam: {
    location: '서울시 강남구',
    rank: '상위 10%',
    avgChange: '+6.2',
    avgPrice: 1830,
    avgPriceKr: '18억 3천',
    transactions: 7200,
    priceByPeriod: {
      '3m': { price: '18억 3천', priceNum: 1830, change: '+6.2' },
      '6m': { price: '17억 2천', priceNum: 1720, change: '+12.4' },
      '1y': { price: '15억 8천', priceNum: 1580, change: '+18.9' },
      '3y': { price: '12억 5천', priceNum: 1250, change: '+46.4' },
    },
    priceIndex: {
      '3m': [
        { month: '11월', value: 105.2, value2: 104.8 },
        { month: '12월', value: 108.5, value2: 110.2 },
        { month: '01월', value: 114.8, value2: 118.2 },
      ],
      '6m': [
        { month: '08월', value: 105.2, value2: 104.8 },
        { month: '09월', value: 106.8, value2: 107.5 },
        { month: '10월', value: 108.5, value2: 110.2 },
        { month: '11월', value: 110.2, value2: 112.8 },
        { month: '12월', value: 112.4, value2: 115.3 },
        { month: '01월', value: 114.8, value2: 118.2 },
      ],
      '1y': [
        { month: '2월', value: 92.2, value2: 90.8 },
        { month: '4월', value: 96.5, value2: 95.2 },
        { month: '6월', value: 100.2, value2: 99.5 },
        { month: '8월', value: 105.2, value2: 104.8 },
        { month: '10월', value: 108.5, value2: 110.2 },
        { month: '12월', value: 112.4, value2: 115.3 },
        { month: '01월', value: 114.8, value2: 118.2 },
      ],
      '3y': [
        { month: '23년', value: 78.2, value2: 76.5 },
        { month: '23년 중', value: 83.5, value2: 81.8 },
        { month: '23년 말', value: 88.2, value2: 86.5 },
        { month: '24년 초', value: 92.2, value2: 90.8 },
        { month: '24년 중', value: 100.4, value2: 98.2 },
        { month: '24년 말', value: 112.4, value2: 115.3 },
        { month: '25년', value: 114.8, value2: 118.2 },
      ],
    },
    nearby: [
      { name: '강남구 평균', price: 1830, priceKr: '18억 3천', change: '+6.2', trend: 'up' },
      { name: '인근 서초구', price: 1650, priceKr: '16억 5천', change: '+5.8', trend: 'up' },
      { name: '인근 송파구', price: 1420, priceKr: '14억 2천', change: '+4.9', trend: 'up' },
    ]
  },
  hwacheon: {
    location: '강원도 화천군',
    rank: '상위 20%',
    avgChange: '+5.1',
    avgPrice: 150,
    avgPriceKr: '1억 5천',
    transactions: 6300,
    priceByPeriod: {
      '3m': { price: '1억 5천', priceNum: 150, change: '+5.1' },
      '6m': { price: '1억 4천', priceNum: 140, change: '+10.5' },
      '1y': { price: '1억 3천', priceNum: 130, change: '+17.2' },
      '3y': { price: '1억', priceNum: 100, change: '+50.0' },
    },
    priceIndex: {
      '3m': [
        { month: '11월', value: 105.2, value2: 106.1 },
        { month: '12월', value: 108.5, value2: 110.8 },
        { month: '01월', value: 114.8, value2: 117.5 },
      ],
      '6m': [
        { month: '08월', value: 105.2, value2: 106.1 },
        { month: '09월', value: 106.8, value2: 108.5 },
        { month: '10월', value: 108.5, value2: 110.8 },
        { month: '11월', value: 110.2, value2: 112.2 },
        { month: '12월', value: 112.4, value2: 114.8 },
        { month: '01월', value: 114.8, value2: 117.5 },
      ],
      '1y': [
        { month: '2월', value: 94.2, value2: 95.1 },
        { month: '4월', value: 98.5, value2: 99.8 },
        { month: '6월', value: 101.2, value2: 102.5 },
        { month: '8월', value: 105.2, value2: 106.1 },
        { month: '10월', value: 108.5, value2: 110.8 },
        { month: '12월', value: 112.4, value2: 114.8 },
        { month: '01월', value: 114.8, value2: 117.5 },
      ],
      '3y': [
        { month: '23년', value: 76.2, value2: 77.5 },
        { month: '23년 중', value: 81.5, value2: 82.8 },
        { month: '23년 말', value: 86.2, value2: 87.5 },
        { month: '24년 초', value: 94.2, value2: 95.1 },
        { month: '24년 중', value: 102.4, value2: 103.2 },
        { month: '24년 말', value: 112.4, value2: 114.8 },
        { month: '25년', value: 114.8, value2: 117.5 },
      ],
    },
    nearby: [
      { name: '화천군 평균', price: 150, priceKr: '1억 5천', change: '+5.1', trend: 'up' },
      { name: '인근 춘천시', price: 280, priceKr: '2억 8천', change: '+4.2', trend: 'up' },
      { name: '인근 철원군', price: 130, priceKr: '1억 3천', change: '+3.5', trend: 'up' },
    ]
  }
};

// 개발 중 - 더미 데이터 제거
const apartmentsByCategory = {
  expensive: [],
  cheap: [],
  safe: [],
  active: [],
};

const categoryTabs = [
  { id: 'expensive', label: '시세 높음', Icon: Gem },
  { id: 'cheap', label: '시세 저렴', Icon: DollarSign },
  { id: 'safe', label: '안전 매물', Icon: Shield },
  { id: 'active', label: '거래 활발', Icon: TrendingUpIcon },
];

export default function Favorites({ onApartmentClick, isDarkMode, isDesktop = false }: FavoritesProps) {
  const [selectedRegion, setSelectedRegion] = useState('paju');
  const [activeTab, setActiveTab] = useState<'regions' | 'apartments'>('regions');
  const [selectedPeriod, setSelectedPeriod] = useState<'3m' | '6m' | '1y' | '3y'>('3m');
  const [selectedCategory, setSelectedCategory] = useState<'expensive' | 'cheap' | 'safe' | 'active'>('expensive');
  const { position: currentPosition, getCurrentPosition, requestPermission, loading: locationLoading } = useGeolocation(false);
  const [currentLocationName, setCurrentLocationName] = useState<string>('현재 위치');

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
        console.log('📍 [Favorites] Converting coordinates to address:', currentPosition);
        setCurrentLocationName('주소 확인 중...');
        const address = await coordToAddress(currentPosition.lng, currentPosition.lat);
        if (address && address.address) {
          console.log('✅ [Favorites] Address converted:', address.address);
          setCurrentLocationName(address.address);
        } else {
          console.warn('⚠️ [Favorites] Failed to convert address, showing coordinates');
          setCurrentLocationName(`위도: ${currentPosition.lat.toFixed(4)}, 경도: ${currentPosition.lng.toFixed(4)}`);
        }
      } else {
        setCurrentLocationName('현재 위치');
      }
    };
    convertToAddress();
  }, [currentPosition]);

  const currentData = regionData[selectedRegion as keyof typeof regionData];
  
  const periodLabels = {
    '3m': '3개월',
    '6m': '6개월',
    '1y': '1년',
    '3y': '3년'
  };
  
  // 개발 중 - 더미 데이터 제거
  const currentPeriodData = currentData?.priceByPeriod?.[selectedPeriod] || { price: '개발 중', change: '+0%' };
  const avgChange = currentPeriodData.change;
  const isPositive = avgChange.startsWith('+');

  const textPrimary = isDarkMode ? 'text-white' : 'text-zinc-900';
  const textSecondary = isDarkMode ? 'text-zinc-400' : 'text-zinc-600';
  const textMuted = isDarkMode ? 'text-zinc-500' : 'text-zinc-500';

  // 선택된 카테고리의 아파트 목록
  const currentApartments = apartmentsByCategory[selectedCategory];

  return (
    <div className={`w-full ${isDesktop ? 'space-y-6 max-w-6xl mx-auto' : 'space-y-5'}`}>
      {/* Tab Selector */}
      <div className={`flex gap-2 p-1.5 rounded-2xl ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
        <button
          onClick={() => setActiveTab('regions')}
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
          onClick={() => setActiveTab('apartments')}
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
        <div className="space-y-5">
          {/* Current Location Badge */}
          <div className={`flex items-center justify-between p-4 rounded-2xl ${
            isDarkMode ? 'bg-zinc-900' : 'bg-sky-50/50 border border-sky-100'
          }`}>
            <div className="flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-sky-500" />
              <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                {locationLoading ? '위치 확인 중...' : currentLocationName}
              </span>
            </div>
            {currentPosition && (
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-sky-700'
              }`}>
                {currentData.rank}
              </span>
            )}
          </div>

          {/* Region Tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {regionTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedRegion(tab.id)}
                className={`flex-shrink-0 px-5 py-2.5 rounded-full font-semibold text-sm transition-all active:scale-95 ${
                  selectedRegion === tab.id
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                    : isDarkMode
                    ? 'bg-zinc-900 text-zinc-400 border border-white/10 hover:bg-zinc-800 active:bg-zinc-800'
                    : 'bg-white text-zinc-700 border border-black/5 hover:bg-zinc-50 active:bg-zinc-100'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span>{tab.label}</span>
                  <span className={`text-xs ${selectedRegion === tab.id ? 'text-white/70' : 'text-zinc-500'}`}>
                    {tab.subLabel}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Main Stats Card with Chart */}
          <div className={`rounded-2xl p-6 ${
            isDarkMode 
              ? '' 
              : 'bg-white/80'
          }`}>
            {/* Period Selector Pills */}
            <div className={`flex gap-2 mb-4 p-1 rounded-xl ${isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-100'}`}>
              {(['3m', '6m', '1y', '3y'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                    selectedPeriod === period
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                      : isDarkMode
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {periodLabels[period]}
                </button>
              ))}
            </div>

            {/* Price Info */}
            <div className="mb-6">
              <h2 className={`text-sm font-medium mb-1 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                {currentData?.location || '지역 선택'}
              </h2>
              <DevelopmentPlaceholder 
                title="개발 중입니다"
                message="지역별 가격 정보를 준비 중입니다."
                isDarkMode={isDarkMode}
                className="py-8"
              />
            </div>

            {/* Chart */}
            <DevelopmentPlaceholder 
              title="개발 중입니다"
              message="지역별 가격 추이 차트 데이터를 준비 중입니다."
              isDarkMode={isDarkMode}
            />
          </div>

          {/* Regional Heatmap */}
          <DevelopmentPlaceholder 
            title="개발 중입니다"
            message="지역별 히트맵 데이터를 준비 중입니다."
            isDarkMode={isDarkMode}
          />

          {/* News Section */}
          <DevelopmentPlaceholder 
            title="개발 중입니다"
            message="뉴스 섹션을 준비 중입니다."
            isDarkMode={isDarkMode}
          />

          {/* Regional Ranking */}
          <DevelopmentPlaceholder 
            title="개발 중입니다"
            message="지역별 랭킹 데이터를 준비 중입니다."
            isDarkMode={isDarkMode}
          />
        </div>
      )}

      {/* 즐겨찾는 매물 */}
      {activeTab === 'apartments' && (
        <div className="space-y-5">
          {/* Category Tabs */}
          <div className={`grid grid-cols-2 gap-2 p-1.5 rounded-2xl ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
            {categoryTabs.map((category) => {
              const CategoryIcon = category.Icon;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id as any)}
                  className={`py-3 px-4 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    selectedCategory === category.id
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                      : isDarkMode
                      ? 'bg-zinc-800 text-zinc-400 hover:text-white'
                      : 'bg-white text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <CategoryIcon className="w-4 h-4" />
                  {category.label}
                </button>
              );
            })}
          </div>

          {/* Apartment Cards */}
          {currentApartments.length > 0 ? (
            <motion.div 
              className={isDesktop ? "grid grid-cols-2 gap-6" : "space-y-3"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {currentApartments.map((apt, index) => {
              // 전세가율에 따른 안전도 판단
              let safetyStatus = '';
              let safetyColor = '';
              
              if (apt.jeonseRate >= 80) {
                safetyStatus = '위험';
                safetyColor = 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30';
              } else if (apt.jeonseRate >= 70) {
                safetyStatus = '주의';
                safetyColor = 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
              } else if (apt.jeonseRate >= 60) {
                safetyStatus = '보통';
                safetyColor = 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30';
              } else {
                safetyStatus = '안전';
                safetyColor = 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30';
              }
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                  className={`rounded-2xl p-5 cursor-pointer transition-all active:scale-[0.98] hover:shadow-xl ${
                    isDarkMode 
                      ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50' 
                      : 'bg-white border border-sky-100 shadow-lg'
                  }`}
                  onClick={() => onApartmentClick && onApartmentClick(apt)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className={`font-bold ${textPrimary}`}>{apt.name}</h3>
                      </div>
                      <p className={`text-xs ${textSecondary} mt-0.5`}>{apt.location}</p>
                    </div>
                    {(apt as any).trades && (
                      <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        isDarkMode ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-500/20 text-orange-600'
                      }`}>
                        {(apt as any).trades}건
                      </div>
                    )}
                  </div>

                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <p className={`text-2xl font-bold bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent`}>
                        {apt.price}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 border border-green-600/40 rounded-full">
                      <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />
                      <span className="text-xs font-bold text-green-700 dark:text-green-400">{apt.change}</span>
                    </div>
                  </div>

                  <div className={`flex items-center justify-between pt-3 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                    <div>
                      <p className={`text-xs ${textSecondary} mb-0.5`}>전세 {apt.jeonsePrice}</p>
                      <p className={`text-sm font-semibold ${textPrimary}`}>전세가율 {apt.jeonseRate}%</p>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full text-sm font-bold border ${safetyColor}`}>
                      {safetyStatus}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
          ) : (
            <DevelopmentPlaceholder 
              title="개발 중입니다"
              message={`${categoryTabs.find(c => c.id === selectedCategory)?.label || '아파트'} 데이터를 준비 중입니다.`}
              isDarkMode={isDarkMode}
            />
          )}
        </div>
      )}
    </div>
  );
}