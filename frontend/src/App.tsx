import React, { useState, useEffect, useCallback } from 'react';
import { Home as HomeIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './components/Dashboard';
import MapView from './components/map/RealEstateMap';
import Favorites from './components/Favorites';
import Statistics from './components/Statistics';
import MyHome from './components/MyHome';
import ApartmentDetail from './components/ApartmentDetail';
import RegionDetail from './components/RegionDetail';
import SearchResultsPage from './components/SearchResultsPage';
import FloatingDock from './components/FloatingDock';
import ProfileMenu from './components/ProfileMenu';
import { useProfile } from './hooks/useProfile';
import { useKakaoLoader } from './hooks/useKakaoLoader';
import { LocationSearchResult } from './lib/searchApi';
import { useAuth } from './lib/clerk';
import { getDarkModeSetting, updateDarkModeSetting } from './lib/usersApi';

type ViewType = 'dashboard' | 'map' | 'favorites' | 'statistics' | 'myHome';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isDarkModeLoaded, setIsDarkModeLoaded] = useState(false);
  const [selectedApartment, setSelectedApartment] = useState<any>(null);
  const [showApartmentDetail, setShowApartmentDetail] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<LocationSearchResult | null>(null);
  const [showRegionDetail, setShowRegionDetail] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const { isSignedIn, getToken } = useAuth();
  
  // 카카오 SDK를 앱 시작 시 미리 로딩
  const { isLoaded: kakaoLoaded } = useKakaoLoader();

  // 로그인 시 서버에서 다크모드 설정 불러오기
  useEffect(() => {
    const loadDarkModeSetting = async () => {
      if (isSignedIn && !isDarkModeLoaded) {
        try {
          const token = await getToken();
          if (token) {
            const response = await getDarkModeSetting(token);
            if (response.success) {
              setIsDarkMode(response.data.is_dark_mode);
            }
          }
        } catch (error) {
          console.warn('다크모드 설정 불러오기 실패:', error);
          // 실패해도 로컬 설정 유지
        } finally {
          setIsDarkModeLoaded(true);
        }
      } else if (!isSignedIn) {
        // 로그아웃 상태에서는 로컬스토리지에서 불러오기
        const savedDarkMode = localStorage.getItem('isDarkMode');
        if (savedDarkMode !== null) {
          setIsDarkMode(savedDarkMode === 'true');
        }
        setIsDarkModeLoaded(true);
      }
    };

    loadDarkModeSetting();
  }, [isSignedIn, getToken, isDarkModeLoaded]);

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          if (currentScrollY < 10) {
            setIsHeaderVisible(true);
          } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
            setIsHeaderVisible(false);
          } else if (currentScrollY < lastScrollY) {
            setIsHeaderVisible(true);
          }
          setLastScrollY(currentScrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const handleApartmentSelect = React.useCallback((apartment: any) => {
    setSelectedApartment(apartment);
    setShowApartmentDetail(true);
  }, []);

  const handleBackFromDetail = React.useCallback(() => {
    const willShowMap = currentView === 'map';
    
    if (willShowMap) {
      // 지도로 돌아갈 때는 전환 최적화
      setIsTransitioning(true);
      setShowApartmentDetail(false);
      setSelectedApartment(null);
      requestAnimationFrame(() => {
        setIsTransitioning(false);
      });
    } else {
      setShowApartmentDetail(false);
      setSelectedApartment(null);
    }
  }, [currentView]);

  const handleRegionSelect = React.useCallback((region: LocationSearchResult) => {
    setSelectedRegion(region);
    setShowRegionDetail(true);
  }, []);

  const handleBackFromRegionDetail = React.useCallback(() => {
    setShowRegionDetail(false);
    setSelectedRegion(null);
  }, []);

  const handleShowMoreSearch = React.useCallback((query: string) => {
    setSearchQuery(query);
    setShowSearchResults(true);
  }, []);

  const handleViewChange = React.useCallback((view: ViewType) => {
    // 다른 탭으로 이동할 때 상세 정보 닫기
    if (showApartmentDetail) {
      setShowApartmentDetail(false);
      setSelectedApartment(null);
    }
    
    const isMapTransition = view === 'map' || currentView === 'map';
    
    if (isMapTransition) {
      // 지도 탭 전환 시 블러 fade 애니메이션
      setIsTransitioning(true);
      // requestAnimationFrame을 사용하여 레이아웃 재계산 후 전환
      requestAnimationFrame(() => {
        setCurrentView(view);
        window.scrollTo({ top: 0, behavior: 'instant' });
        // 0.3초 후 애니메이션 종료
        setTimeout(() => {
          setIsTransitioning(false);
        }, 300);
      });
    } else {
      // 일반 탭 전환은 부드럽게
      setCurrentView(view);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentView, showApartmentDetail]);

  const handleToggleDarkMode = useCallback(async () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    
    // 로컬스토리지에 저장 (비로그인 사용자용)
    localStorage.setItem('isDarkMode', String(newDarkMode));
    
    // 로그인 상태면 서버에도 저장
    if (isSignedIn) {
      try {
        const token = await getToken();
        if (token) {
          await updateDarkModeSetting(newDarkMode, token);
        }
      } catch (error) {
        console.warn('다크모드 설정 저장 실패:', error);
        // 실패해도 로컬 설정은 유지
      }
    }
  }, [isDarkMode, isSignedIn, getToken]);

  // 맵 뷰인지 여부에 따라 최상위 컨테이너 클래스 결정
  // 맵 뷰: 전체 화면 (스크롤 없음, 고정)
  // 일반 뷰: 스크롤 가능
  // 상세 페이지가 열려있으면 맵 뷰가 아니어도 일반 레이아웃 사용
  const isMapView = currentView === 'map' && !showApartmentDetail;

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-blue-50/30 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
        <div 
          className={`relative bg-white dark:bg-zinc-950 shadow-2xl shadow-black/5 dark:shadow-black/50 transition-all ${
            isMapView 
              ? 'w-full h-screen overflow-hidden fixed inset-0 z-30' // 맵 뷰: 풀스크린, 스크롤 방지
              : (isDesktop ? 'min-h-screen pb-6 w-full max-w-[1400px] mx-auto' : 'min-h-screen pb-20 max-w-md mx-auto')
          }`}
          style={{
            transitionDuration: isMapView || isTransitioning ? '0ms' : '200ms'
          }}
        >
          {/* Header */}
          <header className={`fixed top-0 left-0 right-0 z-20 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl transition-transform duration-300 ${
            isDesktop ? 'translate-y-0' : (isHeaderVisible && !isMapView ? 'translate-y-0' : '-translate-y-full')
          } ${isMapView && !isDesktop ? '-translate-y-full' : ''}`}>
            <div 
              className={`border-b dark:border-zinc-800 border-zinc-200 ${
                isMapView || isDesktop ? 'w-full' : 'max-w-md mx-auto'
              }`}
              style={isDesktop ? {
                maxWidth: '1400px',
                marginLeft: 'auto',
                marginRight: 'auto',
              } : {}}
            >
              <div className={`px-4 ${isDesktop ? 'px-8' : ''} ${isDesktop ? 'py-3' : 'py-2'} flex items-center ${isDesktop ? 'justify-between' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl shadow-lg shadow-sky-500/30">
                    <HomeIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">HOMU</h1>
                  </div>
                </div>
                {isDesktop && (
                  <FloatingDock 
                    currentView={currentView} 
                    onViewChange={handleViewChange} 
                    isDarkMode={isDarkMode} 
                    isDesktop={true}
                  />
                )}
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main 
            className={`
              ${isMapView ? 'w-full h-full p-0 fixed z-0' : `px-3 ${isDesktop ? 'px-8' : ''} py-6`} 
              ${!isMapView && (isDesktop ? 'pt-20' : 'pt-14')}
              ${!isMapView && (isDesktop ? '' : 'min-h-[calc(100vh-4rem)]')}
            `}
            style={isMapView ? {
              top: isDesktop ? '64px' : '0',
              left: 0,
              right: 0,
              bottom: 0,
            } : !isDesktop && !isMapView ? {
              paddingTop: 'calc(56px + 4vh)', // 모바일에서 헤더 높이 + 4vh 여백
            } : isDesktop && !isMapView ? {
              width: '100%',
              maxWidth: '1400px',
              marginLeft: 'auto',
              marginRight: 'auto',
              paddingTop: '80px',
            } : {}}
          >
            <AnimatePresence mode="wait">
              {showSearchResults ? (
                <motion.div
                  key="search-results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`w-full ${isDesktop ? 'max-w-full' : 'max-w-full'}`}
                  style={{ 
                    position: 'relative',
                    minHeight: 'calc(100vh - 8rem)'
                  }}
                >
                  <SearchResultsPage
                    query={searchQuery}
                    onBack={() => setShowSearchResults(false)}
                    onApartmentSelect={handleApartmentSelect}
                    onRegionSelect={handleRegionSelect}
                    isDarkMode={isDarkMode}
                    isDesktop={isDesktop}
                  />
                </motion.div>
              ) : showRegionDetail && selectedRegion ? (
                <motion.div
                  key="region-detail"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`w-full ${isDesktop ? 'max-w-full' : 'max-w-full'}`}
                  style={{ 
                    position: 'relative',
                    minHeight: 'calc(100vh - 8rem)'
                  }}
                >
                  <RegionDetail 
                    region={selectedRegion} 
                    onBack={handleBackFromRegionDetail} 
                    onApartmentSelect={handleApartmentSelect}
                    isDarkMode={isDarkMode} 
                    isDesktop={isDesktop} 
                  />
                </motion.div>
              ) : showApartmentDetail ? (
                <motion.div
                  key="detail"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: isTransitioning || currentView === 'map' ? 0 : 0.15 }}
                  className={`w-full ${isDesktop ? 'max-w-full' : 'max-w-full'}`}
                  style={{ 
                    position: 'relative',
                    minHeight: 'calc(100vh - 8rem)'
                  }}
                >
                  <ApartmentDetail apartment={selectedApartment} onBack={handleBackFromDetail} isDarkMode={isDarkMode} isDesktop={isDesktop} />
                </motion.div>
              ) : (
                <motion.div
                  key={currentView}
                  initial={isMapView || isTransitioning ? { opacity: 0, filter: 'blur(10px)' } : { opacity: 0 }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={isMapView || isTransitioning ? { opacity: 0, filter: 'blur(10px)' } : { opacity: 0 }}
                  transition={isMapView || isTransitioning ? { duration: 0.3 } : { duration: 0.15 }}
                  className={`w-full ${isMapView ? 'h-full' : isDesktop ? 'max-w-full' : 'max-w-full'}`}
                  style={{ minHeight: isMapView ? '100%' : 'auto' }}
                >
                  {currentView === 'dashboard' && <Dashboard onApartmentClick={handleApartmentSelect} onRegionSelect={handleRegionSelect} onShowMoreSearch={handleShowMoreSearch} isDarkMode={isDarkMode} isDesktop={isDesktop} />}
                  {currentView === 'map' && <MapView onApartmentSelect={handleApartmentSelect} onRegionSelect={handleRegionSelect} onShowMoreSearch={handleShowMoreSearch} isDarkMode={isDarkMode} isDesktop={isDesktop} />}
                  {currentView === 'favorites' && <Favorites onApartmentClick={handleApartmentSelect} isDarkMode={isDarkMode} isDesktop={isDesktop} />}
                  {currentView === 'statistics' && <Statistics isDarkMode={isDarkMode} isDesktop={isDesktop} />}
                  {currentView === 'myHome' && (
                    <MyHome 
                      isDarkMode={isDarkMode} 
                      onOpenProfileMenu={() => setShowProfileMenu(true)}
                      isDesktop={isDesktop}
                      onApartmentClick={handleApartmentSelect}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Floating Dock - 모바일에서만 표시 */}
          {!isDesktop && (
            <FloatingDock 
              currentView={currentView} 
              onViewChange={handleViewChange} 
              isDarkMode={isDarkMode} 
              isDesktop={false}
            />
          )}

          {/* Profile Menu */}
          <ProfileMenu 
            isOpen={showProfileMenu} 
            onClose={() => setShowProfileMenu(false)}
            isDarkMode={isDarkMode}
            onToggleDarkMode={handleToggleDarkMode}
          />
        </div>
      </div>
    </div>
  );
}
