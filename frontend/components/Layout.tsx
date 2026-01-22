import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, ArrowRightLeft, PieChart, Search, LogOut, X, Sparkles, Moon, Sun, QrCode, LogIn } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SignInButton, SignUpButton, UserButton, SignedIn, SignedOut, useUser, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { ViewType, TabItem } from '../types';
import { setAuthToken, fetchTrendingApartments, searchApartments, type TrendingApartmentItem, type ApartmentSearchItem } from '../services/api';

interface LayoutProps {
  children: React.ReactNode;
  currentView?: ViewType;
  onChangeView?: (view: ViewType) => void;
  onStatsCategoryChange?: (category: 'demand' | 'supply' | 'ranking') => void;
  isDetailOpen?: boolean;
  isDockVisible?: boolean;
}

const tabs: TabItem[] = [
  { id: 'dashboard', label: '홈', icon: Home },
  { id: 'map', label: '지도', icon: Compass },
  { id: 'compare', label: '비교', icon: ArrowRightLeft },
  { id: 'stats', label: '통계', icon: PieChart },
];

const Logo = ({ className = "" }: { className?: string }) => (
    <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-2xl font-black tracking-tight font-sans bg-gradient-to-r from-purple-700 via-blue-500 to-teal-500 bg-clip-text text-transparent">
            SweetHome
        </span>
    </div>
);

// Search Overlay Component - Centered Popup for PC
const SearchOverlay = ({ isOpen, onClose, isDarkMode }: { isOpen: boolean; onClose: () => void; isDarkMode?: boolean }) => {
    const [isAiMode, setIsAiMode] = useState(false);
    const [trendingApartments, setTrendingApartments] = useState<TrendingApartmentItem[]>([]);
    const [isLoadingTrending, setIsLoadingTrending] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ApartmentSearchItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const navigate = useNavigate();
    
    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            // 인기 아파트 로드
            loadTrendingApartments();
        } else {
            document.body.style.overflow = '';
            // 모달 닫을 때 검색 상태 초기화
            setSearchQuery('');
            setSearchResults([]);
            setHasSearched(false);
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const loadTrendingApartments = async () => {
        setIsLoadingTrending(true);
        try {
            const response = await fetchTrendingApartments(5);
            setTrendingApartments(response.data.apartments);
        } catch (error) {
            console.error('Failed to load trending apartments:', error);
        } finally {
            setIsLoadingTrending(false);
        }
    };

    const handleSearch = async (query?: string) => {
        const searchTerm = query ?? searchQuery;
        if (!searchTerm.trim() || searchTerm.trim().length < 2) return;
        
        setIsSearching(true);
        setHasSearched(true);
        try {
            const response = await searchApartments(searchTerm.trim(), 10);
            setSearchResults(response.data.results);
        } catch (error) {
            console.error('검색 실패:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const handleApartmentClick = (aptId: number) => {
        onClose();
        navigate(`/property/${aptId}`);
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 animate-fade-in p-4">
            {/* Backdrop with Blur */}
            <div 
                className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" 
                onClick={onClose}
            ></div>

            {/* Modal Container */}
            <div className={`relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] ${isDarkMode ? 'dark' : ''}`}>
                <div className="p-6">
                    {/* Search Header */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className={`flex-1 flex items-center h-14 px-5 rounded-2xl border transition-all duration-300 focus-within:border-slate-200 focus-within:dark:border-slate-700 ${isAiMode ? 'border-transparent ring-2 ring-indigo-500 shadow-glow bg-white dark:bg-slate-700' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700'}`}>
                            <Search className={`w-5 h-5 ${isAiMode ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-400'}`} />
                            <input 
                                type="text" 
                                placeholder={isAiMode ? "AI에게 부동산 질문을 해보세요..." : "지역, 아파트, 학교명 검색 (2글자 이상)"} 
                                className="flex-1 ml-3 bg-transparent border-none focus:ring-0 focus:outline-none focus:border-none text-[17px] font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 h-full"
                                autoFocus
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                            <button 
                                onClick={() => setIsAiMode(!isAiMode)}
                                className={`p-2 rounded-lg transition-all focus:outline-none ${isAiMode ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                <Sparkles className="w-5 h-5" />
                            </button>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Content - Scrollable */}
                    <div className="space-y-8 overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
                        {/* Search Results */}
                        {hasSearched && (
                            <section>
                                <div className="flex justify-between items-end mb-3">
                                    <h3 className="text-[15px] font-black text-slate-900 dark:text-white">검색 결과</h3>
                                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                                        {searchResults.length}개 결과
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {isSearching ? (
                                        <div className="flex items-center justify-center py-8">
                                            <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                                        </div>
                                    ) : searchResults.length > 0 ? (
                                        searchResults.map((apt) => (
                                            <div 
                                                key={apt.apt_id} 
                                                className="flex items-center justify-between group cursor-pointer p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                                onClick={() => handleApartmentClick(apt.apt_id)}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 flex items-center justify-center">
                                                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">{apt.apt_name.charAt(0)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-slate-900 dark:text-white text-[15px] block">{apt.apt_name}</span>
                                                        {apt.address && (
                                                            <span className="text-[12px] text-slate-500 dark:text-slate-400">{apt.address}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-[14px]">
                                            "{searchQuery}"에 대한 검색 결과가 없습니다.
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* Popular/Trending Apartments - 검색 결과가 없을 때만 표시 */}
                        {!hasSearched && (
                        <section>
                            <div className="flex justify-between items-end mb-3">
                                <h3 className="text-[15px] font-black text-slate-900 dark:text-white">인기 아파트</h3>
                                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">거래량 기준</span>
                            </div>
                            <div className="space-y-2">
                                {isLoadingTrending ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                                    </div>
                                ) : trendingApartments.length > 0 ? (
                                    trendingApartments.map((apt, i) => (
                                        <div 
                                            key={apt.apt_id} 
                                            className="flex items-center justify-between group cursor-pointer p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                            onClick={() => handleApartmentClick(apt.apt_id)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className={`w-4 text-center font-black text-[15px] ${i < 3 ? 'text-brand-blue dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>{i + 1}</span>
                                                <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-600 border border-slate-100 dark:border-slate-600 flex items-center justify-center">
                                                    <span className="text-[11px] font-bold text-slate-500">{apt.apt_name.charAt(0)}</span>
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-900 dark:text-white text-[15px] block">{apt.apt_name}</span>
                                                    {apt.address && (
                                                        <span className="text-[12px] text-slate-500 dark:text-slate-400">{apt.address}</span>
                                                    )}
                                                </div>
                                            </div>
                                            {apt.transaction_count && (
                                                <span className="text-[13px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                                                    {apt.transaction_count}건
                                                </span>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-[14px]">
                                        인기 아파트 데이터를 불러올 수 없습니다.
                                    </div>
                                )}
                            </div>
                        </section>
                        )}

                        {/* Curated Picks - 검색 결과가 없을 때만 표시 */}
                        {!hasSearched && (
                        <section>
                             <h3 className="text-[15px] font-black text-slate-900 dark:text-white mb-3">추천 검색</h3>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                 {[
                                     { title: '강남 아파트', desc: '서울 강남 지역 아파트' },
                                     { title: '신축 아파트', desc: '최근 5년 내 입주' },
                                     { title: '역세권 아파트', desc: '지하철역 도보 5분 이내' },
                                 ].map((card, i) => (
                                     <div 
                                         key={i} 
                                         className="bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 p-4 rounded-2xl hover:bg-white dark:hover:bg-slate-600 hover:border-slate-200 dark:hover:border-slate-500 hover:shadow-soft transition-all cursor-pointer"
                                         onClick={() => {
                                             setSearchQuery(card.title);
                                             handleSearch(card.title);
                                         }}
                                     >
                                         <h4 className="font-black text-slate-900 dark:text-white text-[15px] mb-1">{card.title}</h4>
                                         <p className="text-[13px] text-slate-500 dark:text-slate-400 font-medium">{card.desc}</p>
                                     </div>
                                 ))}
                             </div>
                        </section>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const Layout: React.FC<LayoutProps> = ({ children, currentView, onChangeView, onStatsCategoryChange, isDetailOpen = false, isDockVisible = true }) => {
  const [scrolled, setScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isStatsDropdownOpen, setIsStatsDropdownOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // localStorage에서 저장된 설정을 불러옴 (브라우저 설정 무시)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sweethome-dark-mode');
      return saved === 'true';
    }
    return false;
  });
  const [isQROpen, setIsQROpen] = useState(false);
  
  // Clerk 인증 훅
  const { isLoaded: isClerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { getToken } = useClerkAuth();
  
  const location = useLocation();
  const navigate = useNavigate();
  
  // Clerk 토큰을 API에 설정
  useEffect(() => {
    const updateAuthToken = async () => {
      if (isClerkLoaded && isSignedIn) {
        const token = await getToken();
        setAuthToken(token);
      } else {
        setAuthToken(null);
      }
    };
    updateAuthToken();
  }, [isClerkLoaded, isSignedIn, getToken]);
  
  const derivedView = currentView || (() => {
    if (location.pathname.startsWith('/stats')) return 'stats';
    if (location.pathname.startsWith('/map')) return 'map';
    if (location.pathname.startsWith('/compare')) return 'compare';
    if (location.pathname.startsWith('/property')) return 'dashboard';
    return 'dashboard';
  })();
  
  const isMapMode = derivedView === 'map' && !isDetailOpen;
  const isDashboard = derivedView === 'dashboard';
  const profileRef = useRef<HTMLDivElement>(null);
  const statsDropdownRef = useRef<HTMLDivElement>(null);
  
  // 현재 경로에 따라 active 상태 결정
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (statsDropdownRef.current && !statsDropdownRef.current.contains(event.target as Node)) {
        setIsStatsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    // Apply dark mode to document
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    return () => {
        window.removeEventListener('scroll', handleScroll);
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    // localStorage에 설정 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('sweethome-dark-mode', String(newValue));
    }
  };

  const openQRModal = () => {
    setIsQROpen(true);
  };

  return (
    <>
      {/* Mesh Gradient Background */}
      <div className={`mesh-gradient-bg ${isDarkMode ? 'dark' : ''}`} />
      
      <div className={`min-h-screen text-slate-900 dark:text-slate-100 selection:bg-brand-blue selection:text-white ${
        isMapMode ? 'overflow-hidden' : ''
      } ${isDarkMode ? 'dark bg-slate-900' : ''}`}>
      
      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} isDarkMode={isDarkMode} />

      {/* QR Code Modal */}
      {isQROpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsQROpen(false)}
          ></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">QR 코드</h3>
              <button 
                onClick={() => setIsQROpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-2xl">
                <QRCodeSVG 
                  value={typeof window !== 'undefined' ? window.location.href : ''}
                  size={256}
                  level="H"
                  includeMargin={true}
                  fgColor="#000000"
                  bgColor="transparent"
                />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                이 QR 코드를 스캔하여 현재 페이지를 모바일에서 열 수 있습니다
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          PC HEADER (Original Design - Restored)
      ----------------------------------------------------------------------- */}
      <header className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-16 transition-all duration-300 items-center justify-between px-8 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] border-b border-slate-100/80 dark:border-slate-700/80">
        <div className="flex items-center gap-12">
          <Link to="/" className="cursor-pointer">
              <Logo />
          </Link>
          <nav className="flex gap-1">
            {tabs.map((tab) => {
              if (tab.id === 'stats') {
                const statsActive = isActive('/stats');
                return (
                  <div key={tab.id} className="relative" ref={statsDropdownRef}>
                    <button
                      onClick={() => setIsStatsDropdownOpen(!isStatsDropdownOpen)}
                      className={`px-4 py-2 rounded-lg text-[15px] font-bold transition-all duration-300 flex items-center gap-2 ${
                        statsActive 
                          ? 'text-deep-900 dark:text-white bg-slate-200/50 dark:bg-slate-700/50' 
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <tab.icon size={19} strokeWidth={statsActive ? 2.5 : 2} />
                      {tab.label}
                    </button>
                    
                    {isStatsDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-deep border border-slate-200 dark:border-slate-700 p-2 animate-enter origin-top-left overflow-hidden z-50">
                        <Link
                          to="/stats/demand"
                          onClick={() => {
                            setIsStatsDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 text-[14px] font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors block"
                        >
                          주택 수요
                        </Link>
                        <Link
                          to="/stats/supply"
                          onClick={() => {
                            setIsStatsDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 text-[14px] font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors block"
                        >
                          주택 공급
                        </Link>
                        <Link
                          to="/stats/ranking"
                          onClick={() => {
                            setIsStatsDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 text-[14px] font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors block"
                        >
                          주택 랭킹
                        </Link>
                      </div>
                    )}
                  </div>
                );
              }
              
              // 경로 매핑
              const pathMap: Record<string, string> = {
                'dashboard': '/',
                'map': '/map',
                'compare': '/compare',
                'stats': '/stats'
              };
              
              const tabPath = pathMap[tab.id] || '/';
              const active = isActive(tabPath);
              
              return (
              <Link
                key={tab.id}
                to={tabPath}
                className={`px-4 py-2 rounded-lg text-[15px] font-bold transition-all duration-300 flex items-center gap-2 ${
                  active 
                    ? 'text-deep-900 dark:text-white bg-slate-200/50 dark:bg-slate-700/50' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <tab.icon size={19} strokeWidth={active ? 2.5 : 2} />
                {tab.label}
              </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
            <button 
                onClick={() => setIsSearchOpen(true)}
                className="p-2 rounded-full text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
                <Search className="w-5 h-5" />
            </button>
            
            {/* 로그인 안됨 - 로그인 버튼 표시 */}
            <SignedOut>
                <SignInButton mode="modal">
                    <button className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-[14px] font-bold hover:bg-blue-600 transition-colors">
                        <LogIn className="w-4 h-4" />
                        로그인
                    </button>
                </SignInButton>
            </SignedOut>
            
            {/* 로그인됨 - 프로필 드롭다운 표시 */}
            <SignedIn>
                {/* Profile Dropdown */}
                <div className="relative" ref={profileRef}>
                    <div 
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-white dark:border-slate-600 shadow-md cursor-pointer hover:ring-2 hover:ring-slate-100 dark:hover:ring-slate-700 transition-all active:scale-95"
                    >
                        {clerkUser?.imageUrl ? (
                            <img src={clerkUser.imageUrl} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" className="w-full h-full" />
                        )}
                    </div>
                    
                    {isProfileOpen && (
                        <div className="absolute right-0 top-12 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-deep border border-slate-200 dark:border-slate-700 p-2 animate-enter origin-top-right overflow-hidden z-50">
                            <div className="p-3 border-b border-slate-50 dark:border-slate-700 mb-1">
                                 <p className="font-bold text-slate-900 dark:text-white text-[15px]">
                                     {clerkUser?.fullName || clerkUser?.firstName || '사용자'}님
                                 </p>
                                 <p className="text-[13px] text-slate-400 dark:text-slate-400">
                                     {clerkUser?.primaryEmailAddress?.emailAddress || ''}
                                 </p>
                            </div>
                            <div className="mt-1 pt-1 space-y-1">
                                 <button 
                                    onClick={toggleDarkMode}
                                    className="w-full text-left px-3 py-2 text-[13px] text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg flex items-center justify-between font-medium transition-colors"
                                 >
                                     <div className="flex items-center gap-2">
                                         {isDarkMode ? (
                                             <>
                                                 <Sun className="w-4 h-4" /> 라이트 모드
                                             </>
                                         ) : (
                                             <>
                                                 <Moon className="w-4 h-4" /> 다크 모드
                                             </>
                                         )}
                                     </div>
                                     <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${
                                         isDarkMode ? 'bg-brand-blue' : 'bg-slate-300'
                                     }`}>
                                         <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${
                                             isDarkMode ? 'translate-x-5' : 'translate-x-0'
                                         }`}></div>
                                     </div>
                                 </button>
                                 <button 
                                    onClick={openQRModal}
                                    className="w-full text-left px-3 py-2 text-[13px] text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2 font-medium transition-colors"
                                 >
                                     <QrCode className="w-4 h-4" /> QR 코드
                                 </button>
                                 <div className="pt-1 border-t border-slate-100 dark:border-slate-700 mt-1">
                                     <UserButton 
                                         afterSignOutUrl="/"
                                         appearance={{
                                             elements: {
                                                 rootBox: 'w-full',
                                                 userButtonTrigger: 'w-full text-left px-3 py-2 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-2 font-medium transition-colors'
                                             }
                                         }}
                                     />
                                 </div>
                            </div>
                    </div>
                )}
                </div>
            </SignedIn>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`${
        isMapMode 
          ? 'h-screen w-full p-0 md:pt-16 md:px-0' 
          : (isDashboard ? 'pt-0 md:pt-20 px-0 md:px-8' : 'pt-14 md:pt-20 px-4 md:px-8')
      } max-w-[1600px] 2xl:max-w-[1760px] mx-auto min-h-screen relative`}>
        
        {/* Mobile Header */}
        {isDashboard && !isDetailOpen && !isMapMode && (
          <div className={`md:hidden flex justify-between items-center mb-0 pt-6 pb-4 px-6 z-20 relative animate-fade-in`}>
              <SignedIn>
                  <div className="flex items-center gap-3" onClick={() => setIsProfileOpen(true)}>
                     <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-white shadow-md">
                        {clerkUser?.imageUrl ? (
                            <img src={clerkUser.imageUrl} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" className="w-full h-full" />
                        )}
                     </div>
                     <div>
                        <p className="text-[13px] font-medium mb-0.5 text-slate-500">안녕하세요</p>
                        <p className="text-xl font-black text-slate-900 tracking-tight">
                            {clerkUser?.fullName || clerkUser?.firstName || '사용자'}님
                        </p>
                     </div>
                  </div>
              </SignedIn>
              <SignedOut>
                  <div className="flex items-center gap-3">
                     <Logo />
                  </div>
              </SignedOut>
              <div className="flex items-center gap-3">
                <button 
                    onClick={() => setIsSearchOpen(true)}
                    className="p-2.5 rounded-full shadow-sm border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-400 active:bg-slate-50 dark:active:bg-slate-700 active:scale-95 transition-all"
                >
                    <Search className="w-5 h-5" />
                </button>
                <SignedOut>
                    <SignInButton mode="modal">
                        <button className="p-2.5 rounded-full shadow-sm border border-slate-200/60 dark:border-slate-700/60 bg-brand-blue text-white active:scale-95 transition-all">
                            <LogIn className="w-5 h-5" />
                        </button>
                    </SignInButton>
                </SignedOut>
              </div>
          </div>
        )}
        
        <div key={derivedView} className="animate-fade-in">
             {children}
        </div>
      </main>

      {/* Footer */}
      {!isMapMode && (
          <footer className="mt-20 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-12 px-8">
              <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div className="md:col-span-1">
                      <Logo className="mb-4" />
                      <p className="text-[13px] text-slate-400 dark:text-slate-400 leading-relaxed">
                          스위트홈은 데이터 기반의 부동산 의사결정을 지원하는<br/>
                          프리미엄 자산 관리 서비스입니다.
                      </p>
                  </div>
                  <div>
                      <h4 className="font-bold text-slate-900 dark:text-white mb-4 text-[15px]">서비스</h4>
                      <ul className="space-y-2 text-[13px] text-slate-500 dark:text-slate-400">
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">자산 분석</li>
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">시장 동향</li>
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">세금 계산기</li>
                      </ul>
                  </div>
                   <div>
                      <h4 className="font-bold text-slate-900 dark:text-white mb-4 text-[15px]">고객지원</h4>
                      <ul className="space-y-2 text-[13px] text-slate-500 dark:text-slate-400">
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">자주 묻는 질문</li>
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">문의하기</li>
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">이용약관</li>
                      </ul>
                  </div>
                  <div>
                      <p className="text-[13px] text-slate-400 dark:text-slate-400">
                          (주)스위트홈 | 대표: 홍길동<br/>
                          서울시 강남구 테헤란로 123<br/>
                          사업자등록번호: 123-45-67890<br/>
                          Copyright © SweetHome. All rights reserved.
                      </p>
                  </div>
              </div>
          </footer>
      )}

      {/* Mobile Floating Dock */}
      {!isDetailOpen && (
        <nav 
            className={`md:hidden fixed bottom-6 left-1/2 transform -translate-x-1/2 w-[280px] h-[64px]
                        bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl 
                        rounded-full 
                        shadow-[0_8px_40px_rgba(0,0,0,0.15),0_0_0_1px_rgba(255,255,255,0.2)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.3),0_0_0_1px_rgba(51,65,85,0.3)]
                        flex justify-between items-center px-6 z-[90] 
                        transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)
                        ${isDockVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-[200%] opacity-0 scale-90'}`}
        >
          {tabs.map((tab) => {
            const pathMap: Record<string, string> = {
              'dashboard': '/',
              'map': '/map',
              'compare': '/compare',
              'stats': '/stats'
            };
            const tabPath = pathMap[tab.id] || '/';
            const active = isActive(tabPath);
            return (
              <Link
                key={tab.id}
                to={tabPath}
                className="relative z-10 flex flex-col items-center justify-center w-12 h-12 group"
              >
                <div 
                  className={`flex items-center justify-center p-2.5 rounded-full transition-all duration-300 ${
                    active 
                      ? 'bg-deep-900 dark:bg-slate-700 text-white shadow-lg scale-110' 
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 active:scale-95'
                  }`}
                >
                  <tab.icon size={20} strokeWidth={active ? 2.5 : 2} />
                </div>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
    </>
  );
};