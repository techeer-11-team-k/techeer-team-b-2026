import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Clock, MapPin, Navigation, X, SlidersHorizontal } from 'lucide-react';
import FilterPanel from './FilterPanel';
import { searchApartments, searchLocations, ApartmentSearchResult, LocationSearchResult } from '../lib/searchApi';
import { useAuth } from '../lib/clerk';
import UnifiedSearchResults from './ui/UnifiedSearchResults';

interface MapViewProps {
  onApartmentSelect: (apartment: any) => void;
  isDarkMode: boolean;
}

const apartments = [
  { id: 1, name: '일산 두산위브더제니스', price: '6억 8천만원', change: '+4.3%', x: 42, y: 35, region: '경기 북부' },
  { id: 2, name: '강남 래미안', price: '21억 5천만원', change: '+12.5%', x: 52, y: 52, region: '서울' },
  { id: 3, name: '송파 헬리오시티', price: '14억 8천만원', change: '+6.2%', x: 58, y: 55, region: '서울' },
  { id: 4, name: '마곡 힐스테이트', price: '10억 3천만원', change: '+5.1%', x: 45, y: 50, region: '서울' },
  { id: 5, name: '판교 푸르지오', price: '12억 3천만원', change: '-2.1%', x: 55, y: 68, region: '경기 남부' },
  { id: 6, name: '운정 더샵', price: '5억 2천만원', change: '+3.8%', x: 38, y: 32, region: '경기 북부' },
  { id: 7, name: '광교 센트럴타운', price: '11억 5천만원', change: '+4.7%', x: 52, y: 70, region: '경기 남부' },
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

export default function MapView({ onApartmentSelect, isDarkMode }: MapViewProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApt, setSelectedApt] = useState<number | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showAI, setShowAI] = useState(false);
  
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
    // 지역 선택 시 처리 (필요시 구현)
    setSearchQuery('');
    setSearchOpen(false);
  };

  return (
    <div className="relative h-full -mx-4">
      {/* Full Screen Map Container */}
      <div className={`w-full h-full relative ${
        isDarkMode 
          ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' 
          : 'bg-gradient-to-br from-blue-50 via-sky-50 to-blue-50'
      }`}>
        {/* Grid Pattern for map feel */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="mapgrid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path 
                  d="M 50 0 L 0 0 0 50" 
                  fill="none" 
                  stroke={isDarkMode ? '#0ea5e9' : '#0284c7'} 
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#mapgrid)" />
          </svg>
        </div>

        {/* Map overlay with subtle styling */}
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, ${isDarkMode ? 'rgba(14, 165, 233, 0.05)' : 'rgba(14, 165, 233, 0.1)'} 0%, transparent 70%)`
        }} />

        {/* Search Bar at Top */}
        <div className="absolute top-0 left-0 right-0 pt-safe z-50">
          <div className="px-6 py-4">
            <div className="relative">
              {/* Search Input with Filter Button */}
              <div className="flex gap-2">
                <div className={`flex-1 backdrop-blur-xl rounded-2xl px-6 py-3 border transition-all flex items-center gap-3 ${
                  isDarkMode
                    ? 'bg-slate-800/95 shadow-[8px_8px_16px_rgba(0,0,0,0.6)] border-sky-800/30'
                    : 'bg-white/95 shadow-[8px_8px_16px_rgba(163,177,198,0.4)] border-sky-200/50'
                }`}>
                  <Search className="w-5 h-5 text-sky-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="아파트 이름 또는 지역 검색..."
                    className={`flex-1 bg-transparent outline-none ${
                      searchQuery ? textPrimary : textSecondary
                    } placeholder:${textSecondary}`}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className={`flex-shrink-0 p-1 rounded-full hover:bg-slate-700/50 transition-colors`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {/* Filter Button */}
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className={`backdrop-blur-xl rounded-2xl px-4 py-3 border transition-all flex items-center gap-2 ${
                    showFilter
                      ? 'bg-sky-600 border-sky-500 shadow-lg'
                      : isDarkMode
                      ? 'bg-slate-800/95 shadow-[8px_8px_16px_rgba(0,0,0,0.6)] border-sky-800/30 hover:bg-slate-700/95'
                      : 'bg-white/95 shadow-[8px_8px_16px_rgba(163,177,198,0.4)] border-sky-200/50 hover:bg-sky-50/95'
                  }`}
                >
                  <SlidersHorizontal className={`w-5 h-5 ${
                    showFilter ? 'text-white' : 'text-sky-400'
                  }`} />
                </button>
              </div>

              {/* Search Results Dropdown with Animation */}
              <div 
                className={`absolute top-full left-0 right-0 mt-2 backdrop-blur-xl rounded-2xl border overflow-hidden transition-all duration-300 ease-out ${
                  searchOpen 
                    ? 'opacity-100 translate-y-0 pointer-events-auto' 
                    : 'opacity-0 -translate-y-4 pointer-events-none'
                } ${
                  isDarkMode
                    ? 'bg-slate-800/95 shadow-[8px_8px_20px_rgba(0,0,0,0.6)] border-sky-800/30'
                    : 'bg-white/95 shadow-[8px_8px_20px_rgba(163,177,198,0.4)] border-sky-200/50'
                }`}
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
                              className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                                isDarkMode
                                  ? 'hover:bg-slate-700/50'
                                  : 'hover:bg-sky-50'
                              }`}
                            >
                              <span className={`flex-shrink-0 w-5 text-xs font-bold ${textSecondary}`}>
                                {index + 1}
                              </span>
                              <div className="flex-1 text-left">
                                <p className={`font-semibold text-sm ${textPrimary}`}>{item.name}</p>
                                <p className={`text-xs ${textSecondary}`}>{item.location}</p>
                              </div>
                              <span className={`text-xs ${textSecondary}`}>{item.searches.toLocaleString()}회</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Recent Searches */}
                      {recentSearches.length > 0 && (
                        <div className={`pt-3 mt-3 border-t ${isDarkMode ? 'border-sky-800/30' : 'border-sky-200'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-sky-400" />
                              <h3 className={`text-sm font-bold ${textPrimary}`}>최근 검색어</h3>
                            </div>
                            <button 
                              onClick={clearRecentSearches}
                              className={`text-xs ${textSecondary} hover:text-sky-500 transition-colors`}
                            >
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
                                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                                  isDarkMode
                                    ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                                    : 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                                }`}
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

              {/* Filter Panel */}
              {showFilter && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 animate-slideDown">
                  <FilterPanel 
                    onClose={() => setShowFilter(false)}
                    isDarkMode={isDarkMode}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Current Location Badge */}
        <div className={`absolute top-32 left-4 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border z-10 ${
          isDarkMode ? 'bg-slate-800/90 border-sky-800/30' : 'bg-white/90 border-sky-200'
        }`}>
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-sky-500" />
            <p className={`text-sm font-bold ${textPrimary}`}>경기도 파주시</p>
          </div>
          <p className={`text-xs ${textSecondary} mt-1`}>현재 위치</p>
        </div>

        {/* Region Labels */}
        <div className={`absolute top-[25%] left-[20%] px-3 py-1.5 rounded-lg backdrop-blur-sm ${
          isDarkMode ? 'bg-slate-700/40 text-slate-300' : 'bg-white/40 text-slate-700'
        } text-sm font-semibold`}>
          경기 북부
        </div>
        <div className={`absolute top-[50%] left-[50%] px-3 py-1.5 rounded-lg backdrop-blur-sm ${
          isDarkMode ? 'bg-slate-700/40 text-slate-300' : 'bg-white/40 text-slate-700'
        } text-sm font-semibold`}>
          서울
        </div>
        <div className={`absolute bottom-[25%] right-[25%] px-3 py-1.5 rounded-lg backdrop-blur-sm ${
          isDarkMode ? 'bg-slate-700/40 text-slate-300' : 'bg-white/40 text-slate-700'
        } text-sm font-semibold`}>
          경기 남부
        </div>

        {/* Apartment Markers */}
        {apartments.map((apt) => (
          <div
            key={apt.id}
            className="absolute cursor-pointer group z-20"
            style={{
              left: `${apt.x}%`,
              top: `${apt.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onClick={() => {
              setSelectedApt(apt.id);
              onApartmentSelect(apt);
            }}
          >
            {/* Marker Pin */}
            <div className={`relative transition-all duration-300 ${
              selectedApt === apt.id ? 'scale-125 z-30' : 'group-hover:scale-110'
            }`}>
              <div className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center border-4 ${
                selectedApt === apt.id
                  ? 'bg-sky-600 border-white'
                  : apt.change.startsWith('+')
                  ? isDarkMode
                    ? 'bg-green-600 border-green-400/50'
                    : 'bg-green-500 border-green-300'
                  : isDarkMode
                  ? 'bg-red-600 border-red-400/50'
                  : 'bg-red-500 border-red-300'
              }`}>
                <MapPin className="w-5 h-5 text-white" />
              </div>
              
              {/* Popup on hover/select */}
              <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 transition-all duration-200 z-50 ${
                selectedApt === apt.id ? 'opacity-100 visible' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible'
              }`}>
                <div className={`backdrop-blur-xl rounded-xl p-3 shadow-xl border whitespace-nowrap ${
                  isDarkMode 
                    ? 'bg-slate-800/95 border-sky-800/30' 
                    : 'bg-white/95 border-sky-200'
                }`}>
                  <h3 className={`font-bold text-sm ${textPrimary}`}>{apt.name}</h3>
                  <p className="text-sky-600 dark:text-sky-400 font-bold text-lg mt-1">{apt.price}</p>
                  <p className={`text-xs font-semibold mt-1 ${
                    apt.change.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {apt.change}
                  </p>
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                    <div className={`w-2 h-2 rotate-45 ${
                      isDarkMode ? 'bg-slate-800/95' : 'bg-white/95'
                    }`} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* AI Assistant Button - Bottom Right */}
        <button
          onClick={handleAIClick}
          className={`absolute bottom-24 right-6 z-30 w-16 h-16 rounded-full backdrop-blur-xl shadow-xl border-2 transition-all active:scale-95 hover:scale-105 ${
            showAI
              ? 'bg-sky-600 border-sky-400 shadow-sky-500/50'
              : isDarkMode
              ? 'bg-slate-800/95 border-sky-800/30 shadow-[8px_8px_24px_rgba(0,0,0,0.6)] hover:bg-slate-700/95'
              : 'bg-white/95 border-sky-200/50 shadow-[8px_8px_24px_rgba(163,177,198,0.5)] hover:bg-sky-50/95'
          }`}
        >
          <div className="flex items-center justify-center">
            <span className={`font-bold text-lg ${
              showAI ? 'text-white' : 'text-sky-500'
            }`}>
              AI
            </span>
          </div>
          {/* Pulse effect when active */}
          {showAI && (
            <span className="absolute inset-0 rounded-full bg-sky-400 animate-ping opacity-20" />
          )}
        </button>
      </div>

      {/* Click outside to close */}
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