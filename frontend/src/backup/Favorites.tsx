import React, { useState } from 'react';
import { Star, MapPin, ChevronRight, RefreshCw, ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import RegionalHeatmap from './RegionalHeatmap';
import RegionalRanking from './RegionalRanking';
import NewsSection from './NewsSection';

interface FavoritesProps {
  onApartmentClick?: (apartment: any) => void;
  isDarkMode: boolean;
}

const regionTabs = [
  { id: 'paju', label: '내 동네', subLabel: '파주시' },
  { id: 'gangnam', label: '서울시', subLabel: '강남구' },
  { id: 'hwacheon', label: '강원도', subLabel: '화천군' },
];

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

// 아파트 카테고리별 데이터
const apartmentsByCategory = {
  expensive: [
    { name: '강남 타워팰리스', location: '서울 강남구 도곡동', price: '85억원', change: '+12.3%', trend: 'up', jeonseRate: 45, jeonsePrice: '38억원' },
    { name: '압구정 아크로리버파크', location: '서울 강남구 압구정동', price: '68억원', change: '+10.8%', trend: 'up', jeonseRate: 48, jeonsePrice: '32억 6천만원' },
    { name: '청담 래미안퍼스티지', location: '서울 강남구 청담동', price: '54억원', change: '+9.2%', trend: 'up', jeonseRate: 52, jeonsePrice: '28억원' },
    { name: '서초 아크로비스타', location: '서울 서초구 반포동', price: '48억원', change: '+8.5%', trend: 'up', jeonseRate: 55, jeonsePrice: '26억 4천만원' },
    { name: '대치 은마아파트', location: '서울 강남구 대치동', price: '42억원', change: '+7.8%', trend: 'up', jeonseRate: 58, jeonsePrice: '24억 3천만원' },
  ],
  cheap: [
    { name: '파주 문산 한양수자인', location: '경기 파주시 문산읍', price: '2억 1천만원', change: '+3.2%', trend: 'up', jeonseRate: 72, jeonsePrice: '1억 5천만원' },
    { name: '화천 센트럴파크', location: '강원 화천군 화천읍', price: '2억 3천만원', change: '+4.1%', trend: 'up', jeonseRate: 68, jeonsePrice: '1억 5천6백만원' },
    { name: '금촌 주공1단지', location: '경기 파주시 금촌동', price: '2억 5천만원', change: '+2.8%', trend: 'up', jeonseRate: 76, jeonsePrice: '1억 9천만원' },
    { name: '춘천 호반베르디움', location: '강원 춘천시 퇴계동', price: '2억 7천만원', change: '+3.5%', trend: 'up', jeonseRate: 70, jeonsePrice: '1억 8천9백만원' },
    { name: '파주 힐스테이트', location: '경기 파주시 금촌동', price: '2억 8천만원', change: '+3.9%', trend: 'up', jeonseRate: 74, jeonsePrice: '2억 7백만원' },
  ],
  safe: [
    { name: '여의도 아크로리버파크', location: '서울 영등포구 여의도동', price: '32억원', change: '+5.2%', trend: 'up', jeonseRate: 42, jeonsePrice: '13억 4천만원' },
    { name: '용산 더 프라임', location: '서울 용산구 이촌동', price: '28억원', change: '+4.8%', trend: 'up', jeonseRate: 45, jeonsePrice: '12억 6천만원' },
    { name: '마포 래미안푸르지오', location: '서울 마포구 공덕동', price: '25억원', change: '+4.5%', trend: 'up', jeonseRate: 48, jeonsePrice: '12억원' },
    { name: '성동 트리마제', location: '서울 성동구 성수동', price: '22억원', change: '+6.1%', trend: 'up', jeonseRate: 50, jeonsePrice: '11억원' },
    { name: '강남 래미안', location: '서울 강남구 역삼동', price: '21억 5천만원', change: '+8.6%', trend: 'up', jeonseRate: 52, jeonsePrice: '11억 1천8백만원' },
  ],
  active: [
    { name: '송파 헬리오시티', location: '서울 송파구 거여동', price: '14억 8천만원', change: '+6.2%', trend: 'up', jeonseRate: 82, jeonsePrice: '12억 1천만원', trades: 234 },
    { name: '강남 대치 래미안', location: '서울 강남구 대치동', price: '35억원', change: '+7.5%', trend: 'up', jeonseRate: 60, jeonsePrice: '21억원', trades: 198 },
    { name: '압구정 현대', location: '서울 강남구 압구정동', price: '45억원', change: '+8.2%', trend: 'up', jeonseRate: 58, jeonsePrice: '26억 1천만원', trades: 176 },
    { name: '파주 운정 더샵', location: '경기 파주시 운정동', price: '7억 2천만원', change: '+5.8%', trend: 'up', jeonseRate: 72, jeonsePrice: '5억 1천8백만원', trades: 154 },
    { name: '개포 주공', location: '서울 강남구 개포동', price: '18억원', change: '+5.5%', trend: 'up', jeonseRate: 68, jeonsePrice: '12억 2천4백만원', trades: 142 },
  ],
};

const categoryTabs = [
  { id: 'expensive', label: '시세 높음', icon: '💎' },
  { id: 'cheap', label: '시세 저렴', icon: '💰' },
  { id: 'safe', label: '안전 매물', icon: '🛡️' },
  { id: 'active', label: '거래 활발', icon: '🔥' },
];

export default function Favorites({ onApartmentClick, isDarkMode }: FavoritesProps) {
  const [selectedRegion, setSelectedRegion] = useState('paju');
  const [activeTab, setActiveTab] = useState<'regions' | 'apartments'>('regions');
  const [selectedPeriod, setSelectedPeriod] = useState<'3m' | '6m' | '1y' | '3y'>('3m');
  const [selectedCategory, setSelectedCategory] = useState<'expensive' | 'cheap' | 'safe' | 'active'>('expensive');

  const currentData = regionData[selectedRegion];
  
  const periodLabels = {
    '3m': '3개월',
    '6m': '6개월',
    '1y': '1년',
    '3y': '3년'
  };
  
  // 현재 선택된 기간의 가격 정보
  const currentPeriodData = currentData.priceByPeriod[selectedPeriod];
  const avgChange = currentPeriodData.change;
  const isPositive = avgChange.startsWith('+');

  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const textMuted = isDarkMode ? 'text-slate-500' : 'text-slate-500';

  // 선택된 카테고리의 아파트 목록
  const currentApartments = apartmentsByCategory[selectedCategory];

  return (
    <div className="space-y-5">
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
                경기도 파주시
              </span>
            </div>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
              isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-sky-700'
            }`}>
              {currentData.rank}
            </span>
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
                {currentData.location}
              </h2>
              <div className="flex items-baseline gap-2">
                <p className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  {currentPeriodData.price}원
                </p>
                <div className={`flex items-center gap-1 text-sm font-semibold ${
                  isPositive ? 'text-emerald-500' : 'text-red-500'
                }`}>
                  {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {avgChange}%
                </div>
              </div>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                최근 {periodLabels[selectedPeriod]} 평균
              </p>
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={currentData.priceIndex[selectedPeriod]}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#27272a' : '#f4f4f5'} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 11, fill: isDarkMode ? '#71717a' : '#a1a1aa' }} 
                  stroke={isDarkMode ? '#27272a' : '#e4e4e7'}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: isDarkMode ? '#71717a' : '#a1a1aa' }} 
                  stroke={isDarkMode ? '#27272a' : '#e4e4e7'}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
                    borderColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#0ea5e9" 
                  strokeWidth={2.5} 
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="value2" 
                  stroke="#10b981" 
                  strokeWidth={2.5} 
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Regional Heatmap */}
          <RegionalHeatmap isDarkMode={isDarkMode} region={selectedRegion} />

          {/* News Section */}
          <NewsSection isDarkMode={isDarkMode} />

          {/* Regional Ranking */}
          <RegionalRanking isDarkMode={isDarkMode} region={selectedRegion} />
        </div>
      )}

      {/* 즐겨찾는 매물 */}
      {activeTab === 'apartments' && (
        <div className="space-y-5">
          {/* Category Tabs */}
          <div className={`grid grid-cols-2 gap-2 p-1.5 rounded-2xl ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
            {categoryTabs.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id as any)}
                className={`py-3 px-4 rounded-xl font-semibold text-sm transition-all active:scale-95 ${
                  selectedCategory === category.id
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                    : isDarkMode
                    ? 'bg-zinc-800 text-zinc-400 hover:text-white'
                    : 'bg-white text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <span className="mr-1.5">{category.icon}</span>
                {category.label}
              </button>
            ))}
          </div>

          {/* Apartment Cards */}
          <motion.div 
            className="space-y-3"
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
        </div>
      )}
    </div>
  );
}
