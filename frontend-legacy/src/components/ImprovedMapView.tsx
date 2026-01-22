import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Clock, MapPin, Navigation, X, SlidersHorizontal, ZoomIn, ZoomOut, Minus, Plus } from 'lucide-react';
import FilterPanel from './FilterPanel';
import { searchApartments, searchLocations, ApartmentSearchResult, LocationSearchResult } from '../lib/searchApi';
import { useAuth } from '../lib/clerk';
import UnifiedSearchResults from './ui/UnifiedSearchResults';

interface MapViewProps {
  onApartmentSelect: (apartment: any) => void;
  onRegionSelect?: (region: LocationSearchResult) => void;
  onShowMoreSearch?: (query: string) => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

// 실제 거래 데이터 기반 아파트 마커 (실제 위도/경도)
const apartments = [
  // 경기 북부 (파주, 고양, 의정부 등)
  { id: 1, name: '일산 두산위브더제니스', price: '6억 8천만원', change: '+4.3%', lat: 37.6680, lng: 126.7736, region: '경기 북부', recentTrades: 167 },
  { id: 2, name: '운정 더샵', price: '5억 2천만원', change: '+3.8%', lat: 37.6951, lng: 126.7364, region: '경기 북부', recentTrades: 143 },
  { id: 3, name: '파주 운정 푸르지오', price: '5억 7천만원', change: '+4.2%', lat: 37.6920, lng: 126.7450, region: '경기 북부', recentTrades: 98 },
  
  // 서울 강남권
  { id: 4, name: '강남 래미안', price: '21억 5천만원', change: '+12.5%', lat: 37.4979, lng: 127.0276, region: '서울', recentTrades: 198 },
  { id: 5, name: '송파 헬리오시티', price: '14억 8천만원', change: '+6.2%', lat: 37.4933, lng: 127.1357, region: '서울', recentTrades: 234 },
  { id: 6, name: '서초 아크로리버파크', price: '18억 2천만원', change: '+7.1%', lat: 37.4862, lng: 127.0041, region: '서울', recentTrades: 156 },
  
  // 서울 강서/마곡
  { id: 7, name: '마곡 힐스테이트', price: '10억 3천만원', change: '+5.1%', lat: 37.5618, lng: 126.8285, region: '서울', recentTrades: 189 },
  
  // 경기 남부 (성남, 수원, 화성 등)
  { id: 8, name: '판교 푸르지오', price: '12억 3천만원', change: '-2.1%', lat: 37.3947, lng: 127.1115, region: '경기 남부', recentTrades: 132 },
  { id: 9, name: '광교 센트럴타운', price: '11억 5천만원', change: '+4.7%', lat: 37.2839, lng: 127.0465, region: '경기 남부', recentTrades: 87 },
  { id: 10, name: '수원 광교호수공원 자이', price: '9억 8천만원', change: '+5.3%', lat: 37.2876, lng: 127.0512, region: '경기 남부', recentTrades: 76 },
  
  // 인천
  { id: 11, name: '청라 국제도시', price: '8억 7천만원', change: '+3.8%', lat: 37.5397, lng: 126.6428, region: '인천', recentTrades: 152 },
];

const topSearched = [
  { name: '강남 래미안', location: '서울 강남구', searches: 2543 },
  { name: '송파 헬리오시티', location: '서울 송파구', searches: 2198 },
  { name: '일산 두산위브더제니스', location: '경기 고양시', searches: 1876 },
  { name: '마곡 힐스테이트', location: '서울 강서구', searches: 1654 },
  { name: '청라 국제도시', location: '인천 서구', searches: 1432 },
];

const recentSearches = [
  '일산 두산위브더제니스',
  '강남 래미안',
  '송파 헬리오시티',
];

export default function MapView({ onApartmentSelect, onRegionSelect, onShowMoreSearch, isDarkMode, isDesktop = false }: MapViewProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApt, setSelectedApt] = useState<number | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  
  // 검색 결과 상태
  const [apartmentResults, setApartmentResults] = useState<ApartmentSearchResult[]>([]);
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [isSearchingApartments, setIsSearchingApartments] = useState(false);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  
  const { isSignedIn, getToken } = useAuth();

  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';

  const clearRecentSearches = () => {
    console.log('Clear recent searches');
  };

  const handleAIClick = () => {
    setShowAI(!showAI);
    console.log('AI Assistant clicked');
  };

  // 아파트 검색
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setApartmentResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingApartments(true);
      try {
        const token = isSignedIn && getToken ? await getToken() : null;
        const results = await searchApartments(searchQuery, token);
        setApartmentResults(results);
      } catch (error) {
        console.error('Failed to search apartments:', error);
        setApartmentResults([]);
      } finally {
        setIsSearchingApartments(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isSignedIn, getToken]);

  // 지역 검색
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) {
      setLocationResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingLocations(true);
      try {
        const token = isSignedIn && getToken ? await getToken() : null;
        const results = await searchLocations(searchQuery, token);
        setLocationResults(results);
      } catch (error) {
        console.error('Failed to search locations:', error);
        setLocationResults([]);
      } finally {
        setIsSearchingLocations(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isSignedIn, getToken]);

  const handleApartmentSelect = (apartment: ApartmentSearchResult) => {
    onApartmentSelect(apartment);
    setSearchQuery('');
    setSearchOpen(false);
  };

  const handleLocationSelect = (location: LocationSearchResult) => {
    if (onRegionSelect) {
      onRegionSelect(location);
    }
    setSearchQuery('');
    setSearchOpen(false);
  };

  const handleZoomIn = () => {
    setZoom(Math.min(zoom + 0.3, 3));
  };

  const handleZoomOut = () => {
    setZoom(Math.max(zoom - 0.3, 0.6));
  };

  // 위도/경도를 화면 좌표로 변환 (Mercator-like projection)
  const latLngToXY = (lat: number, lng: number) => {
    // 서울/경기 지역을 중심으로 한 좌표 변환
    const centerLat = 37.5665;  // 서울시청
    const centerLng = 126.9780;
    
    // 스케일 조정 (한국 중심으로)
    const scale = 800 * zoom;
    
    const x = ((lng - centerLng) * scale) + 50 + panX;
    const y = ((centerLat - lat) * scale * 1.3) + 50 + panY;
    
    return { x: `${x}%`, y: `${y}%` };
  };

  return (
    <div className="relative h-full -mx-4">
      {/* Korea Map Background */}
      <div className={`w-full h-full relative overflow-hidden ${isDarkMode ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-sky-50 to-blue-50'}`}>
        {/* Map Layer with Korea-like geography */}
        <div 
          className="absolute inset-0" 
          style={{ 
            transform: `scale(${zoom}) translate(${panX * 0.5}px, ${panY * 0.5}px)`,
            transformOrigin: 'center center',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          {/* Korea Peninsula Shape (Simplified SVG) */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid meet">
            <defs>
              {/* Map gradient */}
              <linearGradient id="mapGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={isDarkMode ? '#1e3a5f' : '#bfdbfe'} stopOpacity="0.3" />
                <stop offset="100%" stopColor={isDarkMode ? '#0f172a' : '#dbeafe'} stopOpacity="0.5" />
              </linearGradient>
              
              {/* Water gradient */}
              <linearGradient id="waterGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={isDarkMode ? '#0c1a2e' : '#e0f2fe'} stopOpacity="0.8" />
                <stop offset="100%" stopColor={isDarkMode ? '#1e293b' : '#bae6fd'} stopOpacity="0.8" />
              </linearGradient>
              
              {/* City lights effect */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            {/* Water/Sea background */}
            <rect width="100%" height="100%" fill="url(#waterGradient)" />
            
            {/* Simplified Korea Peninsula */}
            <path
              d="M 180 50 
                 Q 185 45, 190 50
                 L 200 80
                 Q 205 100, 210 120
                 L 220 150
                 Q 225 180, 230 200
                 L 240 250
                 Q 245 290, 240 320
                 L 235 360
                 Q 230 400, 220 430
                 L 210 460
                 Q 200 485, 185 500
                 L 170 510
                 Q 155 515, 140 510
                 L 125 500
                 Q 115 490, 110 475
                 L 105 450
                 Q 100 420, 105 390
                 L 110 350
                 Q 115 310, 120 280
                 L 125 240
                 Q 128 200, 135 170
                 L 145 130
                 Q 155 95, 165 70
                 L 175 55
                 Q 177 50, 180 50 Z"
              fill="url(#mapGradient)"
              stroke={isDarkMode ? '#38bdf8' : '#0ea5e9'}
              strokeWidth="1"
              opacity="0.6"
            />
            
            {/* Seoul Metropolitan Area (brighter region) */}
            <circle 
              cx="180" 
              cy="240" 
              r="40" 
              fill={isDarkMode ? '#0ea5e9' : '#38bdf8'} 
              opacity="0.15"
              filter="url(#glow)"
            />
            
            {/* Gyeonggi North */}
            <circle 
              cx="165" 
              cy="200" 
              r="25" 
              fill={isDarkMode ? '#06b6d4' : '#22d3ee'} 
              opacity="0.12"
              filter="url(#glow)"
            />
            
            {/* Gyeonggi South */}
            <circle 
              cx="190" 
              cy="280" 
              r="30" 
              fill={isDarkMode ? '#14b8a6' : '#5eead4'} 
              opacity="0.12"
              filter="url(#glow)"
            />
            
            {/* Incheon */}
            <circle 
              cx="140" 
              cy="230" 
              r="20" 
              fill={isDarkMode ? '#0891b2' : '#67e8f9'} 
              opacity="0.12"
              filter="url(#glow)"
            />
            
            {/* Road network */}
            <g opacity="0.3" stroke={isDarkMode ? '#38bdf8' : '#0284c7'} strokeWidth="0.5" fill="none">
              {/* Major highways */}
              <path d="M 180 240 L 165 200" strokeWidth="1.5" />
              <path d="M 180 240 L 190 280" strokeWidth="1.5" />
              <path d="M 180 240 L 140 230" strokeWidth="1.5" />
              <path d="M 180 240 L 210 250" strokeWidth="1.5" />
              
              {/* Minor roads */}
              <path d="M 165 200 L 155 180" strokeDasharray="2,2" />
              <path d="M 190 280 L 200 310" strokeDasharray="2,2" />
              <path d="M 140 230 L 130 220" strokeDasharray="2,2" />
            </g>
            
            {/* Grid overlay for map feel */}
            <g opacity="0.08" stroke={isDarkMode ? '#38bdf8' : '#0ea5e9'} strokeWidth="0.3" fill="none">
              {[...Array(12)].map((_, i) => (
                <line key={`h${i}`} x1="100" y1={100 + i * 35} x2="250" y2={100 + i * 35} />
              ))}
              {[...Array(8)].map((_, i) => (
                <line key={`v${i}`} x1={100 + i * 20} y1="100" x2={100 + i * 20} y2="500" />
              ))}
            </g>
          </svg>

          {/* Region Labels */}
          <div className={`absolute top-[25%] left-[28%] px-4 py-2 rounded-xl backdrop-blur-md border ${isDarkMode ? 'bg-slate-800/70 border-sky-800/50 text-sky-300' : 'bg-white/80 border-sky-200 text-sky-700'} text-sm font-bold shadow-xl`}>
            경기 북부
            <p className={`text-xs font-normal mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>고양/파주/의정부</p>
          </div>
          
          <div className={`absolute top-[40%] left-[44%] px-5 py-2.5 rounded-xl backdrop-blur-md border ${isDarkMode ? 'bg-slate-800/70 border-sky-800/50 text-sky-300' : 'bg-white/80 border-sky-200 text-sky-700'} text-base font-bold shadow-xl`}>
            서울
            <p className={`text-xs font-normal mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>강남/강서/송파</p>
          </div>
          
          <div className={`absolute top-[47%] left-[47%] px-4 py-2 rounded-xl backdrop-blur-md border ${isDarkMode ? 'bg-slate-800/70 border-sky-800/50 text-sky-300' : 'bg-white/80 border-sky-200 text-sky-700'} text-sm font-bold shadow-xl`}>
            경기 남부
            <p className={`text-xs font-normal mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>성남/수원/화성</p>
          </div>
          
          <div className={`absolute top-[38%] left-[18%] px-4 py-2 rounded-xl backdrop-blur-md border ${isDarkMode ? 'bg-slate-800/70 border-sky-800/50 text-sky-300' : 'bg-white/80 border-sky-200 text-sky-700'} text-sm font-bold shadow-xl`}>
            인천
            <p className={`text-xs font-normal mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>청라/송도</p>
          </div>

          {/* Apartment Markers */}
          {apartments.map((apt) => {
            const pos = latLngToXY(apt.lat, apt.lng);
            return (
              <div
                key={apt.id}
                className="absolute cursor-pointer group z-20"
                style={{
                  left: pos.x,
                  top: pos.y,
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={() => {
                  setSelectedApt(apt.id);
                  onApartmentSelect(apt);
                }}
              >
                {/* Heat indicator */}
                <div className={`absolute inset-0 w-20 h-20 -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 rounded-full ${apt.recentTrades > 200 ? 'bg-orange-500/20' : apt.recentTrades > 150 ? 'bg-yellow-500/20' : 'bg-green-500/20'}`} style={{ filter: 'blur(15px)' }} />
                
                <div className={`relative transition-all duration-300 ${selectedApt === apt.id ? 'scale-125 z-30' : 'group-hover:scale-110'}`}>
                  <div className={`w-12 h-12 rounded-full shadow-2xl flex items-center justify-center border-4 transition-all ${selectedApt === apt.id ? 'bg-sky-600 border-white shadow-sky-500/50' : apt.change.startsWith('+') ? isDarkMode ? 'bg-emerald-600 border-emerald-400/50 shadow-emerald-500/30' : 'bg-emerald-500 border-emerald-300 shadow-emerald-500/40' : isDarkMode ? 'bg-red-600 border-red-400/50 shadow-red-500/30' : 'bg-red-500 border-red-300 shadow-red-500/40'}`}>
                    <MapPin className="w-6 h-6 text-white" />
                  </div>
                  
                  {/* Trade volume badge */}
                  <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 shadow-lg ${apt.recentTrades > 200 ? 'bg-orange-500 border-orange-300 text-white' : apt.recentTrades > 150 ? 'bg-yellow-500 border-yellow-300 text-yellow-900' : 'bg-sky-500 border-sky-300 text-white'}`}>
                    {apt.recentTrades > 200 ? '🔥' : apt.recentTrades > 150 ? '⚡' : '📊'}
                  </div>
                  
                  {/* Info popup */}
                  <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-3 transition-all duration-200 z-50 ${selectedApt === apt.id ? 'opacity-100 visible' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible'}`}>
                    <div className={`backdrop-blur-xl rounded-2xl p-4 shadow-2xl border whitespace-nowrap ${isDarkMode ? 'bg-slate-800/95 border-sky-800/30' : 'bg-white/95 border-sky-200'}`}>
                      <h3 className={`font-bold text-sm ${textPrimary} mb-1`}>{apt.name}</h3>
                      <p className="text-sky-600 dark:text-sky-400 font-bold text-xl mb-1">{apt.price}</p>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold ${apt.change.startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {apt.change}
                        </p>
                        <span className={`text-xs ${textSecondary}`}>•</span>
                        <p className={`text-xs ${textSecondary}`}>거래 {apt.recentTrades}건</p>
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                        <div className={`w-3 h-3 rotate-45 ${isDarkMode ? 'bg-slate-800/95' : 'bg-white/95'}`} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="absolute top-0 left-0 right-0 pt-safe z-50">
          <div className="px-6 py-4">
            <div className="relative">
              <div className="flex gap-2">
                <div className={`flex-1 backdrop-blur-xl rounded-2xl px-6 py-3 border transition-all flex items-center gap-3 ${isDarkMode ? 'bg-slate-800/95 shadow-[8px_8px_16px_rgba(0,0,0,0.6)] border-sky-800/30' : 'bg-white/95 shadow-[8px_8px_16px_rgba(163,177,198,0.4)] border-sky-200/50'}`}>
                  <Search className="w-5 h-5 text-sky-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="아파트 이름 또는 지역 검색..."
                    className={`flex-1 bg-transparent outline-none ${searchQuery ? textPrimary : textSecondary} placeholder:${textSecondary}`}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="flex-shrink-0 p-1 rounded-full hover:bg-slate-700/50 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className={`backdrop-blur-xl rounded-2xl px-4 py-3 border transition-all flex items-center gap-2 ${showFilter ? 'bg-sky-600 border-sky-500 shadow-lg' : isDarkMode ? 'bg-slate-800/95 shadow-[8px_8px_16px_rgba(0,0,0,0.6)] border-sky-800/30 hover:bg-slate-700/95' : 'bg-white/95 shadow-[8px_8px_16px_rgba(163,177,198,0.4)] border-sky-200/50 hover:bg-sky-50/95'}`}
                >
                  <SlidersHorizontal className={`w-5 h-5 ${showFilter ? 'text-white' : 'text-sky-400'}`} />
                </button>
              </div>

              {/* Search dropdown */}
              <div 
                className={`absolute top-full left-0 right-0 mt-2 backdrop-blur-xl rounded-2xl border overflow-hidden transition-all duration-300 ease-out ${searchOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-4 pointer-events-none'} ${isDarkMode ? 'bg-slate-800/95 shadow-[8px_8px_20px_rgba(0,0,0,0.6)] border-sky-800/30' : 'bg-white/95 shadow-[8px_8px_20px_rgba(163,177,198,0.4)] border-sky-200/50'}`}
                style={{ maxHeight: searchOpen ? '500px' : '0' }}
              >
                <div className="overflow-y-auto max-h-[500px] p-4">
                  {/* 통합 검색 결과 */}
                  {searchQuery.length >= 1 && (
                    <UnifiedSearchResults
                      apartmentResults={apartmentResults}
                      locationResults={locationResults}
                      onApartmentSelect={handleApartmentSelect}
                      onLocationSelect={handleLocationSelect}
                      isDarkMode={isDarkMode}
                      query={searchQuery}
                      isSearchingApartments={isSearchingApartments}
                      isSearchingLocations={isSearchingLocations}
                      showMoreButton={true}
                      onShowMore={() => {
                        if (onShowMoreSearch) {
                          onShowMoreSearch(searchQuery);
                        }
                      }}
                    />
                  )}

                  {/* 검색어가 없을 때 인기 검색어 표시 */}
                  {!searchQuery && (
                    <>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-4 h-4 text-sky-400" />
                          <h3 className={`text-sm font-bold ${textPrimary}`}>인기 검색어 TOP 5</h3>
                        </div>
                        <div className="space-y-1">
                          {topSearched.map((item, index) => (
                            <button
                              key={index}
                              onClick={() => {
                                setSearchQuery(item.name);
                                setSearchOpen(true);
                              }}
                              className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-sky-50'}`}
                            >
                              <span className={`flex-shrink-0 w-5 text-xs font-bold ${textSecondary}`}>{index + 1}</span>
                              <div className="flex-1 text-left">
                                <p className={`font-semibold text-sm ${textPrimary}`}>{item.name}</p>
                                <p className={`text-xs ${textSecondary}`}>{item.location}</p>
                              </div>
                              <span className={`text-xs ${textSecondary}`}>{item.searches.toLocaleString()}회</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {recentSearches.length > 0 && (
                        <div className={`pt-3 mt-3 border-t ${isDarkMode ? 'border-sky-800/30' : 'border-sky-200'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-sky-400" />
                              <h3 className={`text-sm font-bold ${textPrimary}`}>최근 검색어</h3>
                            </div>
                            <button onClick={clearRecentSearches} className={`text-xs ${textSecondary} hover:text-sky-500 transition-colors`}>
                              전체 삭제
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {recentSearches.map((term, index) => (
                              <button
                                key={index}
                                onClick={() => {
                                  setSearchQuery(term);
                                  setSearchOpen(true);
                                }}
                                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${isDarkMode ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700' : 'bg-sky-100 text-sky-700 hover:bg-sky-200'}`}
                              >
                                {term}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {showFilter && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 animate-slideDown">
                  <FilterPanel onClose={() => setShowFilter(false)} isDarkMode={isDarkMode} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Current Location */}
        <div className={`absolute top-32 left-4 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border z-10 ${isDarkMode ? 'bg-slate-800/90 border-sky-800/30' : 'bg-white/90 border-sky-200'}`}>
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-sky-500" />
            <p className={`text-sm font-bold ${textPrimary}`}>경기도 파주시</p>
          </div>
          <p className={`text-xs ${textSecondary} mt-1`}>현재 위치</p>
        </div>

        {/* Zoom Controls - Improved Design */}
        <div className="absolute bottom-32 right-6 z-30 flex flex-col gap-2">
          <button
            onClick={handleZoomIn}
            className={`w-14 h-14 rounded-2xl backdrop-blur-xl shadow-2xl border-2 transition-all active:scale-95 hover:scale-105 flex items-center justify-center ${isDarkMode ? 'bg-slate-800/95 border-sky-800/40 hover:bg-slate-700/95 hover:border-sky-700/60' : 'bg-white/95 border-sky-200/60 hover:bg-sky-50/95 hover:border-sky-300'}`}
          >
            <Plus className="w-6 h-6 text-sky-500" strokeWidth={2.5} />
          </button>
          
          {/* Zoom level indicator */}
          <div className={`px-3 py-2 rounded-xl backdrop-blur-xl shadow-lg border text-center ${isDarkMode ? 'bg-slate-800/95 border-sky-800/30' : 'bg-white/95 border-sky-200/50'}`}>
            <p className={`text-xs font-bold ${textPrimary}`}>{Math.round(zoom * 100)}%</p>
          </div>
          
          <button
            onClick={handleZoomOut}
            className={`w-14 h-14 rounded-2xl backdrop-blur-xl shadow-2xl border-2 transition-all active:scale-95 hover:scale-105 flex items-center justify-center ${isDarkMode ? 'bg-slate-800/95 border-sky-800/40 hover:bg-slate-700/95 hover:border-sky-700/60' : 'bg-white/95 border-sky-200/60 hover:bg-sky-50/95 hover:border-sky-300'}`}
          >
            <Minus className="w-6 h-6 text-sky-500" strokeWidth={2.5} />
          </button>
        </div>

        {/* AI Assistant */}
        <button
          onClick={handleAIClick}
          className={`absolute bottom-24 left-6 z-30 w-16 h-16 rounded-full backdrop-blur-xl shadow-xl border-2 transition-all active:scale-95 hover:scale-105 ${showAI ? 'bg-sky-600 border-sky-400 shadow-sky-500/50' : isDarkMode ? 'bg-slate-800/95 border-sky-800/30 shadow-[8px_8px_24px_rgba(0,0,0,0.6)] hover:bg-slate-700/95' : 'bg-white/95 border-sky-200/50 shadow-[8px_8px_24px_rgba(163,177,198,0.5)] hover:bg-sky-50/95'}`}
        >
          <div className="flex items-center justify-center">
            <span className={`font-bold text-lg ${showAI ? 'text-white' : 'text-sky-500'}`}>AI</span>
          </div>
          {showAI && <span className="absolute inset-0 rounded-full bg-sky-400 animate-ping opacity-20" />}
        </button>
      </div>

      {(searchOpen || showFilter) && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => {
            setSearchOpen(false);
            setShowFilter(false);
          }}
        />
      )}

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideDown {
          animation: slideDown 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
