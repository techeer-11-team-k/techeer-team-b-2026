import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, ArrowRightLeft, PieChart, Search, LogOut, X, Sparkles, Moon, Sun, QrCode, LogIn, TrendingUp, FileText, Building2, Download, Settings } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SignInButton, SignUpButton, SignedIn, SignedOut, useUser, useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewType, TabItem } from '../types';
import { setAuthToken, fetchTrendingApartments, searchApartments, aiSearchApartments, type TrendingApartmentItem, type ApartmentSearchItem, type AISearchApartment, type AISearchCriteria } from '../services/api';
import { PercentileBadge } from './ui/PercentileBadge';
import { getInstallPrompt, showInstallPrompt, isWebView, isPWAInstalled } from '../utils/pwa';

interface LayoutProps {
  children: React.ReactNode;
  currentView?: ViewType;
  onChangeView?: (view: ViewType) => void;
  onStatsCategoryChange?: (category: 'demand' | 'supply' | 'ranking') => void;
  isDetailOpen?: boolean;
  isDockVisible?: boolean;
  onSettingsClick?: () => void;
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

// Haptic Feedback Helper
const vibrate = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
    }
};

// Search Overlay Component - Bottom Sheet for Mobile, Popup for PC
const SearchOverlay = ({ isOpen, onClose, isDarkMode }: { isOpen: boolean; onClose: () => void; isDarkMode?: boolean }) => {
    const [isAiMode, setIsAiMode] = useState(false);
    const [trendingApartments, setTrendingApartments] = useState<TrendingApartmentItem[]>([]);
    const [isLoadingTrending, setIsLoadingTrending] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ApartmentSearchItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [aiResponse, setAiResponse] = useState<string>('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const navigate = useNavigate();
    
    // 인기 아파트 로드 함수
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
    
    // 최근 검색어 저장
    const saveRecentSearch = (query: string) => {
        if (!query.trim() || query.trim().length < 2) return;
        const trimmedQuery = query.trim();
        setRecentSearches(prev => {
            const updated = [trimmedQuery, ...prev.filter(s => s !== trimmedQuery)].slice(0, 5);
            localStorage.setItem('sweethome-recent-searches', JSON.stringify(updated));
            return updated;
        });
    };
    
    // 최근 검색어 삭제
    const removeRecentSearch = (query: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setRecentSearches(prev => {
            const updated = prev.filter(s => s !== query);
            localStorage.setItem('sweethome-recent-searches', JSON.stringify(updated));
            return updated;
        });
    };
    
    // 최근 검색어 로드
    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem('sweethome-recent-searches');
            if (saved) {
                try {
                    setRecentSearches(JSON.parse(saved));
                } catch (e) {
                    setRecentSearches([]);
                }
            }
        }
    }, [isOpen]);
    
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
            setIsAiMode(false);
            setAiResponse('');
            setIsAiLoading(false);
        }
        return () => {
            document.body.style.overflow = '';
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleSearch = async (query?: string, saveToRecent: boolean = true) => {
        const searchTerm = query ?? searchQuery;
        if (!searchTerm.trim()) {
            setHasSearched(false);
            setSearchResults([]);
            return;
        }
        
        if (searchTerm.trim().length < 2) {
            setHasSearched(true);
            setSearchResults([]);
            return;
        }
        
        if (saveToRecent && searchTerm.trim().length >= 2) {
            saveRecentSearch(searchTerm);
        }
        
        setIsSearching(true);
        setHasSearched(true);
        try {
            const response = await searchApartments(searchTerm.trim(), 10);
            if (response && response.data && response.data.results) {
                setSearchResults(response.data.results);
            } else {
                setSearchResults([]);
            }
        } catch (error) {
            console.error('검색 실패:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        if (!searchQuery.trim()) {
            setHasSearched(false);
            setSearchResults([]);
            return;
        }
        
        if (searchQuery.trim().length < 2) {
            setHasSearched(false);
            setSearchResults([]);
            return;
        }
        
        const debounceTimer = setTimeout(() => {
            handleSearch(searchQuery, false);
        }, 500);
        
        return () => clearTimeout(debounceTimer);
    }, [searchQuery]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (isAiMode) {
                handleAiSearch(searchQuery);
            } else {
                handleSearch(searchQuery, true);
            }
        }
    };

    const [aiSearchResults, setAiSearchResults] = useState<AISearchApartment[]>([]);
    const [aiCriteria, setAiCriteria] = useState<AISearchCriteria | null>(null);

    const handleAiSearch = async (query: string) => {
        if (!query.trim() || query.trim().length < 5) {
            setAiResponse('검색어를 5글자 이상 입력해주세요.\n예: "강남 30평대 10억 이하"');
            setHasSearched(true);
            return;
        }
        
        setIsAiLoading(true);
        setHasSearched(true);
        setAiResponse('');
        setAiSearchResults([]);
        setAiCriteria(null);
        
        try {
            const response = await aiSearchApartments(query);
            
            if (response.success && response.data) {
                const { criteria, apartments, count, total } = response.data;
                setAiCriteria(criteria);
                setAiSearchResults(apartments);
                
                let responseText = `**AI 검색 결과**\n\n`;
                if (criteria.location) responseText += `**지역:** ${criteria.location}\n`;
                
                // ... (Format logic retained) ...
                if (criteria.min_area || criteria.max_area) {
                    const minPyeong = criteria.min_area ? Math.round(criteria.min_area / 3.3) : null;
                    const maxPyeong = criteria.max_area ? Math.round(criteria.max_area / 3.3) : null;
                    if (minPyeong && maxPyeong) responseText += `**평수:** ${minPyeong}평 ~ ${maxPyeong}평\n`;
                    else if (minPyeong) responseText += `**평수:** ${minPyeong}평 이상\n`;
                    else if (maxPyeong) responseText += `**평수:** ${maxPyeong}평 이하\n`;
                }
                
                 if (apartments.length > 0) {
                    responseText += `**${total}개 아파트** 중 ${count}개를 찾았습니다.\n\n`;
                } else {
                    responseText += `조건에 맞는 아파트를 찾지 못했습니다.\n\n`;
                }
                
                setAiResponse(responseText);
            } else {
                setAiResponse('🤖 검색 결과를 가져오는데 실패했습니다.');
            }
        } catch (error: unknown) {
             const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            setAiResponse(`❌ AI 검색 중 오류가 발생했습니다.\n\n${errorMessage}`);
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleApartmentClick = (aptId: number | string) => {
        vibrate();
        onClose();
        navigate(`/property/${aptId}`);
    };
    
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                {/* Backdrop */}
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-[2px]"
                    onClick={onClose}
                />
                
                {/* Mobile Bottom Sheet & PC Popup */}
                <motion.div 
                    className="fixed z-[101] flex flex-col bg-white dark:bg-slate-800 shadow-2xl overflow-hidden
                               md:inset-auto md:top-16 md:right-8 md:w-[380px] md:h-[520px] md:rounded-2xl
                               inset-x-0 bottom-0 h-[85vh] rounded-t-[24px] pb-safe"
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                >
                    {/* Handle bar for Mobile */}
                    <div className="md:hidden w-full flex justify-center pt-3 pb-1" onClick={onClose}>
                        <div className="w-12 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>

                    <div className="p-4 flex flex-col h-full">
                        {/* Search Header */}
                        <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                            <div className={`relative flex-1 flex items-center h-12 md:h-11 px-4 rounded-xl border-2 transition-all duration-700 ${isSearching || isAiLoading 
                                    ? 'border-transparent bg-clip-padding ring-[2.5px] ring-indigo-400/40' 
                                    : isAiMode 
                                        ? 'border-indigo-400 dark:border-indigo-500 bg-white dark:bg-slate-800' 
                                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700'
                            }`}>
                                <Search className="w-4 h-4 text-slate-400 dark:text-slate-400" />
                                <input 
                                    type="text" 
                                    placeholder={isAiMode ? "AI에게 물어보세요..." : "검색어 입력"} 
                                    className="flex-1 ml-2 bg-transparent border-none focus:ring-0 focus:outline-none text-[16px] md:text-[14px] font-medium text-slate-900 dark:text-white placeholder:text-slate-400 h-full"
                                    autoFocus
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                />
                                <button 
                                    onClick={() => setIsAiMode(!isAiMode)}
                                    className={`p-1.5 rounded-lg transition-all ${isAiMode ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}
                                >
                                    <Sparkles className="w-4 h-4" />
                                </button>
                            </div>
                            <button 
                                onClick={onClose}
                                className="hidden md:block p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Recent Searches */}
                        {!isAiMode && !hasSearched && recentSearches.length > 0 && (
                            <div className="mb-4 flex-shrink-0">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-[14px] font-bold text-slate-500">최근 검색</h3>
                                    <button onClick={() => setRecentSearches([])} className="text-[12px] font-medium text-slate-400">전체삭제</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {recentSearches.map((search, index) => (
                                        <div key={index} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-full cursor-pointer active:scale-95" onClick={() => { setSearchQuery(search); handleSearch(search); }}>
                                            <span className="text-[14px] font-medium text-slate-700 dark:text-slate-200">{search}</span>
                                            <X className="w-3.5 h-3.5 text-slate-400" onClick={(e) => removeRecentSearch(search, e)} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Search Results */}
                        {!isAiMode && hasSearched && (
                            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar min-h-0">
                                {isSearching ? (
                                    <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div></div>
                                ) : searchResults.length > 0 ? (
                                    searchResults.map((apt) => (
                                        <div key={apt.apt_id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer" onClick={() => handleApartmentClick(apt.apt_id)}>
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center"><span className="text-[11px] font-bold text-blue-600">{apt.apt_name.charAt(0)}</span></div>
                                                <div><span className="font-bold text-slate-900 dark:text-white text-[15px] block">{apt.apt_name}</span><span className="text-[12px] text-slate-500">{apt.address}</span></div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-slate-400 text-[14px]">검색 결과가 없습니다.</div>
                                )}
                            </div>
                        )}
                        
                        {/* Trending - Horizontal Scroll on Mobile */}
                        {!isAiMode && !hasSearched && (
                            <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                                <section>
                                    <div className="flex justify-between items-end mb-3">
                                        <h3 className="text-[15px] font-black text-slate-900 dark:text-white">인기 아파트</h3>
                                        <span className="text-[11px] font-bold text-slate-400">거래량 기준</span>
                                    </div>
                                    <div className="md:space-y-2 flex md:block overflow-x-auto snap-x space-x-3 md:space-x-0 pb-4 md:pb-0 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
                                        {isLoadingTrending ? (
                                            <div className="w-full text-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div></div>
                                        ) : trendingApartments.length > 0 ? (
                                            trendingApartments.map((apt, i) => (
                                                <div 
                                                    key={apt.apt_id} 
                                                    className="flex-shrink-0 w-[85%] md:w-full snap-center flex items-center justify-between group cursor-pointer p-4 md:p-3 rounded-2xl md:rounded-xl bg-slate-50 md:bg-transparent border border-slate-100 md:border-transparent md:hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                                    onClick={() => handleApartmentClick(apt.apt_id)}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <span className={`w-4 text-center font-black text-[15px] ${i < 3 ? 'text-brand-blue' : 'text-slate-400'}`}>{i + 1}</span>
                                                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                                                            <span className="text-[11px] font-bold text-slate-500">{apt.apt_name.charAt(0)}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-slate-900 dark:text-white text-[15px] block">{apt.apt_name}</span>
                                                            <span className="text-[12px] text-slate-500 dark:text-slate-400">{apt.address}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : null}
                                    </div>
                                </section>
                            </div>
                        )}
                    </div>
                </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export const Layout: React.FC<LayoutProps> = ({ children, currentView, onChangeView, onStatsCategoryChange, isDetailOpen = false, isDockVisible = true, onSettingsClick }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileStatsTabBarVisible, setMobileStatsTabBarVisible] = useState(true);
  const lastScrollY = useRef(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isStatsDropdownOpen, setIsStatsDropdownOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sweethome-dark-mode');
      return saved === 'true';
    }
    return false;
  });
  const [isQROpen, setIsQROpen] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);
  
  const { isLoaded: isClerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { getToken } = useClerkAuth();
  const { signOut, openUserProfile } = useClerk();
  
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isWebView() || isPWAInstalled()) {
      setShowInstallButton(false);
      return;
    }
    const checkInstallPrompt = () => {
      const prompt = getInstallPrompt();
      setShowInstallButton(!!prompt);
    };
    checkInstallPrompt();
    const interval = setInterval(checkInstallPrompt, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleInstallPWA = async () => {
    const installed = await showInstallPrompt();
    if (installed) {
      setShowInstallButton(false);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  
  useEffect(() => {
    if (!getToken) return;
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
    if (location.pathname.startsWith('/stats') || location.pathname.startsWith('/policy')) return 'stats';
    if (location.pathname.startsWith('/map')) return 'map';
    if (location.pathname.startsWith('/compare')) return 'compare';
    if (location.pathname.startsWith('/property')) return 'dashboard';
    return 'dashboard';
  })();
  
  const isMapMode = derivedView === 'map' && !isDetailOpen;
  const isDashboard = derivedView === 'dashboard';
  const profileRef = useRef<HTMLDivElement>(null);
  const statsDropdownRef = useRef<HTMLDivElement>(null);
  
  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
      const path = location.pathname;
      if ((path.startsWith('/stats') || path.startsWith('/policy')) && typeof window !== 'undefined' && window.innerWidth < 768) {
        const y = window.scrollY;
        if (y > lastScrollY.current && y > 80) setMobileStatsTabBarVisible(false);
        else if (y < lastScrollY.current || y <= 80) setMobileStatsTabBarVisible(true);
        lastScrollY.current = y;
      }
    };
    window.addEventListener('scroll', handleScroll);
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setIsProfileOpen(false);
      if (statsDropdownRef.current && !statsDropdownRef.current.contains(event.target as Node)) setIsStatsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    if (location.pathname.startsWith('/stats') || location.pathname.startsWith('/policy')) {
      lastScrollY.current = window.scrollY;
      setMobileStatsTabBarVisible(true);
    }
    return () => {
        window.removeEventListener('scroll', handleScroll);
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDarkMode, location.pathname]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    if (typeof window !== 'undefined') localStorage.setItem('sweethome-dark-mode', String(!isDarkMode));
  };

  const openQRModal = () => setIsQROpen(true);

  return (
    <>
      {/* Custom Gradient Background (PC Only) */}
      <div 
        className="hidden md:block fixed inset-0 -z-10"
        style={{
          background: `linear-gradient(135deg, #E8F6FC 0%, #D0EBF7 50%, #E0F4FA 100%)`,
          backgroundSize: '100% 100%',
        }}
        aria-hidden="true"
      />
      
      <div className={`min-h-screen text-slate-900 dark:text-slate-100 selection:bg-brand-blue selection:text-white ${isMapMode ? 'overflow-hidden' : ''} ${isDarkMode ? 'dark bg-slate-900' : 'bg-slate-50 md:bg-transparent'}`}>
      
      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} isDarkMode={isDarkMode} />

      {/* QR Code Modal */}
      <AnimatePresence>
      {isQROpen && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsQROpen(false)}></div>
          <motion.div initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">QR 코드</h3>
              <button onClick={() => setIsQROpen(false)} className="p-2 rounded-full hover:bg-slate-100"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-2xl"><QRCodeSVG value={typeof window !== 'undefined' ? window.location.href : ''} size={256} /></div>
              <p className="text-sm text-slate-500">모바일에서 열기</p>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* PC HEADER */}
      <header className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-16 transition-all duration-300 items-center justify-between px-8 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] border-b border-slate-100/80 dark:border-slate-700/80">
        <div className="flex items-center gap-12">
          <Link to="/" className="cursor-pointer"><Logo /></Link>
          <nav className="flex gap-1">
            {tabs.map((tab) => {
              if (tab.id === 'stats') {
                const statsActive = isActive('/stats') || isActive('/policy');
                return (
                  <div key={tab.id} className="relative" ref={statsDropdownRef}>
                    <button onClick={() => setIsStatsDropdownOpen(!isStatsDropdownOpen)} className={`px-4 py-2 rounded-lg text-[15px] font-bold flex items-center gap-2 ${statsActive ? 'text-deep-900 bg-slate-200/50' : 'text-slate-500 hover:text-slate-900'}`}>
                      <tab.icon size={19} strokeWidth={statsActive ? 2.5 : 2} />{tab.label}
                    </button>
                    {isStatsDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-deep border border-slate-200 p-2 z-50">
                        {['demand', 'supply', 'ranking'].map(sub => (
                           <Link 
                             key={sub} 
                             to={`/stats/${sub}`} 
                             onClick={() => setIsStatsDropdownOpen(false)}
                             className="block w-full text-left px-4 py-3 text-[14px] font-bold hover:bg-slate-50 rounded-lg"
                           >
                             {sub === 'demand' ? '주택 수요' : sub === 'supply' ? '주택 공급' : '주택 랭킹'}
                           </Link>
                        ))}
                        <Link 
                          to="/policy" 
                          onClick={() => setIsStatsDropdownOpen(false)}
                          className="block w-full text-left px-4 py-3 text-[14px] font-bold hover:bg-slate-50 rounded-lg"
                        >
                          정부정책
                        </Link>
                      </div>
                    )}
                  </div>
                );
              }
              const pathMap: Record<string, string> = { 'dashboard': '/', 'map': '/map', 'compare': '/compare', 'stats': '/stats' };
              const tabPath = pathMap[tab.id] || '/';
              const active = isActive(tabPath);
              return (
              <Link key={tab.id} to={tabPath} className={`px-4 py-2 rounded-lg text-[15px] font-bold flex items-center gap-2 ${active ? 'text-deep-900 bg-slate-200/50' : 'text-slate-500 hover:text-slate-900'}`}>
                <tab.icon size={19} strokeWidth={active ? 2.5 : 2} />{tab.label}
              </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
            {showInstallButton && (
                <button onClick={handleInstallPWA} className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-blue to-blue-600 text-white rounded-lg text-[14px] font-bold shadow-md active:scale-95">
                    <Download className="w-4 h-4" />설치
                </button>
            )}
            <button onClick={() => setIsSearchOpen(true)} className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><Search className="w-5 h-5" /></button>
            <SignedOut>
              <SignInButton mode="modal"><button className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-[14px] font-bold hover:bg-blue-600 transition-colors"><LogIn className="w-4 h-4" />로그인</button></SignInButton>
            </SignedOut>
            <SignedIn>
                <div className="relative" ref={profileRef}>
                    <div onClick={() => setIsProfileOpen(!isProfileOpen)} className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border border-white shadow-sm cursor-pointer hover:ring-2 transition-all active:scale-95">
                        {clerkUser?.imageUrl && <img src={clerkUser.imageUrl} alt="User" className="w-full h-full object-cover" />}
                    </div>
                    {isProfileOpen && (
                        <div className="absolute right-0 top-12 w-64 bg-white rounded-2xl shadow-deep border border-slate-200 p-2 overflow-hidden z-50">
                            <div className="p-3 border-b border-slate-50 mb-1">
                                 <p className="font-bold text-slate-900 text-[15px]">{clerkUser?.fullName || '사용자'}</p>
                            </div>
                            <div className="mt-1 pt-1 space-y-1">
                                 <button onClick={openQRModal} className="w-full text-left px-3 py-2 text-[13px] hover:bg-slate-50 rounded-lg flex items-center gap-2 font-medium"><QrCode className="w-4 h-4" /> QR 코드</button>
                                 <div className="pt-1 border-t border-slate-100 mt-1">
                                     <button onClick={() => { signOut(); setIsProfileOpen(false); }} className="w-full text-left px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 font-medium"><LogOut className="w-4 h-4" />로그아웃</button>
                                 </div>
                            </div>
                        </div>
                    )}
                </div>
            </SignedIn>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`${isMapMode 
          ? 'h-screen w-full p-0 md:pt-16 md:px-0' 
          : (isDashboard ? 'pt-0 md:pt-20 px-0 md:px-2' : 'pt-0 md:pt-20 px-0 md:px-2')
      } max-w-[1600px] 2xl:max-w-[1760px] mx-auto min-h-screen relative pb-24 md:pb-0`}> 
        
        {/* Mobile Header - Apple Style (Sticky, Blur, Conditional) */}
        {!isDetailOpen && !isMapMode && (
          <>
            <div className={`md:hidden sticky top-0 z-30 flex justify-between items-center py-3 px-4 transition-all duration-300 ${scrolled ? 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-100/50 dark:border-slate-800/50 shadow-sm' : 'bg-transparent border-transparent'}`}>
                <SignedIn>
                    {isDashboard ? (
                        <div className="relative" ref={profileRef}>
                            <div 
                              className="flex items-center gap-2.5 cursor-pointer" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsProfileOpen(!isProfileOpen);
                              }}
                            >
                               <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-white/50 shadow-sm">
                                  {clerkUser?.imageUrl && <img src={clerkUser.imageUrl} alt="User" className="w-full h-full object-cover" />}
                               </div>
                               <div>
                                  <p className="text-[11px] font-medium text-slate-500 leading-tight">안녕하세요</p>
                                  <p className="text-[15px] font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                                      {clerkUser?.fullName || clerkUser?.firstName || '사용자'}
                                  </p>
                               </div>
                            </div>
                            {isProfileOpen && (
                                <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-2 overflow-hidden z-50">
                                    <div className="p-3 border-b border-slate-100 dark:border-slate-700 mb-1">
                                         <p className="font-bold text-slate-900 dark:text-white text-[15px]">{clerkUser?.fullName || '사용자'}</p>
                                    </div>
                                    <div className="mt-1 pt-1 space-y-1">
                                         <button 
                                           onClick={() => {
                                             openUserProfile();
                                             setIsProfileOpen(false);
                                           }} 
                                           className="w-full text-left px-3 py-2 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200"
                                         >
                                           <Settings className="w-4 h-4" /> 계정 관리
                                         </button>
                                         <button onClick={openQRModal} className="w-full text-left px-3 py-2 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                                           <QrCode className="w-4 h-4" /> QR 코드
                                         </button>
                                         <div className="pt-1 border-t border-slate-100 dark:border-slate-700 mt-1">
                                             <button 
                                               onClick={() => { 
                                                 signOut(); 
                                                 setIsProfileOpen(false); 
                                               }} 
                                               className="w-full text-left px-3 py-2 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-2 font-medium"
                                             >
                                               <LogOut className="w-4 h-4" />로그아웃
                                             </button>
                                         </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : derivedView === 'stats' ? (
                        <h1 className="text-[22px] font-black text-slate-900 dark:text-white tracking-tight ml-1">
                          {location.pathname.startsWith('/policy') ? '정부정책' : '통계'}
                        </h1>
                    ) : derivedView === 'compare' ? (
                        <h1 className="text-[22px] font-black text-slate-900 dark:text-white tracking-tight ml-1">비교</h1>
                    ) : (
                        <div className="flex items-center gap-3"><Logo className="scale-90 origin-left" /></div>
                    )}
                </SignedIn>
                <SignedOut>
                    {isDashboard ? (
                        <div className="flex items-center gap-3"><Logo className="scale-90 origin-left" /></div>
                    ) : derivedView === 'stats' ? (
                        <h1 className="text-[22px] font-black text-slate-900 dark:text-white tracking-tight ml-1">
                          {location.pathname.startsWith('/policy') ? '정부정책' : '통계'}
                        </h1>
                    ) : derivedView === 'compare' ? (
                        <h1 className="text-[22px] font-black text-slate-900 dark:text-white tracking-tight ml-1">비교</h1>
                    ) : (
                        <div className="flex items-center gap-3"><Logo className="scale-90 origin-left" /></div>
                    )}
                </SignedOut>
                <div className="flex items-center gap-2">
                  {/* 모바일 사용자 버튼 제거됨 - 내 자산 탭에서 로그인/로그아웃 가능 */}
                  <SignedOut>
                    {/* 로그인 버튼 */}
                    <SignInButton mode="modal">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          vibrate();
                        }}
                        className="px-3 py-2 rounded-full bg-brand-blue text-white text-[13px] font-bold active:bg-blue-700 active:scale-95 transition-all shadow-md hover:shadow-lg flex items-center gap-1.5"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>로그인</span>
                      </button>
                    </SignInButton>
                  </SignedOut>
                  {isDashboard && onSettingsClick && (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation();
                        vibrate(); 
                        onSettingsClick(); 
                      }} 
                      className="p-2 rounded-full bg-white/50 text-slate-500 active:bg-slate-200 active:scale-95 transition-all shadow-sm"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                  )}
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation();
                      vibrate(); 
                      setIsSearchOpen(true); 
                    }} 
                    className="p-2 rounded-full bg-white/50 text-slate-500 active:bg-slate-200 active:scale-95 transition-all shadow-sm"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                </div>
            </div>
            
            {/* 모바일 통계 탭 선택기 — 스크롤 내리면 숨김 */}
            {derivedView === 'stats' && (
              <div
                className={`md:hidden overflow-hidden transition-all duration-300 ease-out ${
                  mobileStatsTabBarVisible ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
                }`}
              >
                <div className="sticky top-[57px] z-30 bg-transparent px-4 py-3">
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                    {[
                      { label: '주택 수요', path: '/stats/demand' },
                      { label: '주택 공급', path: '/stats/supply' },
                      { label: '주택 랭킹', path: '/stats/ranking' },
                      { label: '정부정책', path: '/policy' }
                    ].map((tab) => {
                      const isActive = location.pathname === tab.path;
                      return (
                        <Link
                          key={tab.path}
                          to={tab.path}
                          className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                            isActive
                              ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/30'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {tab.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        
        <AnimatePresence mode="wait">
            <motion.div 
                key={location.pathname}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="h-full"
            >
                 {children}
            </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer (PC Only) */}
      {!isMapMode && (
          <footer className="hidden md:block mt-20 border-t border-slate-200 bg-white py-12 px-8">
              <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div className="md:col-span-1">
                      <Logo className="mb-4" />
                      <p className="text-[13px] text-slate-400 leading-relaxed">스위트홈은 데이터 기반의 부동산 의사결정을 지원하는<br/>프리미엄 자산 관리 서비스입니다.</p>
                  </div>
                  {/* ... Footer content same as before ... */}
              </div>
          </footer>
      )}

      {/* Mobile Floating Dock (Restored to Floating Style) */}
      {!isDetailOpen && (
        <nav 
            className={`md:hidden fixed bottom-6 left-1/2 transform -translate-x-1/2 w-[280px] h-[64px]
                        bg-white/90 dark:bg-slate-800/90 backdrop-blur-2xl 
                        rounded-full 
                        shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(255,255,255,0.4)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.1)]
                        flex justify-between items-center px-6 z-[90] 
                        transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)
                        ${isDockVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-[200%] opacity-0 scale-90'}`}
            style={{ marginBottom: 'env(safe-area-inset-bottom, 20px)' }}
        >
          {tabs.map((tab) => {
            const pathMap: Record<string, string> = { 'dashboard': '/', 'map': '/map', 'compare': '/compare', 'stats': '/stats' };
            const tabPath = pathMap[tab.id] || '/';
            const active = isActive(tabPath);
            return (
              <Link
                key={tab.id}
                to={tabPath}
                onClick={vibrate}
                className="relative z-10 flex flex-col items-center justify-center w-12 h-12 group"
              >
                <div 
                  className={`flex items-center justify-center p-3 rounded-full transition-all duration-300 ${active 
                      ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/40 scale-110' 
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 active:scale-95'}`}
                >
                  <tab.icon size={22} strokeWidth={active ? 2.5 : 2} />
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