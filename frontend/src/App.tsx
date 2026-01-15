import React, { useState, useEffect } from 'react';
import { Home as HomeIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './components/Dashboard';
import MapView from './components/map/RealEstateMap';
import Favorites from './components/Favorites';
import Statistics from './components/Statistics';
import MyHome from './components/MyHome';
import ApartmentDetail from './components/ApartmentDetail';
import FloatingDock from './components/FloatingDock';
import ProfileMenu from './components/ProfileMenu';
import { useProfile } from './hooks/useProfile';
import { useKakaoLoader } from './hooks/useKakaoLoader';

type ViewType = 'dashboard' | 'map' | 'favorites' | 'statistics' | 'myHome';

export default function App() {
  console.log('📱 App 컴포넌트 렌더링 시작');
  
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedApartment, setSelectedApartment] = useState<any>(null);
  const [showApartmentDetail, setShowApartmentDetail] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);

  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const { isLoaded: kakaoLoaded } = useKakaoLoader(); // 카카오맵 SDK 미리 로드
  
  console.log('✅ useProfile 훅 실행 완료', { profileLoading, profileError });
  console.log('🗺️ 카카오맵 SDK 로드 상태:', kakaoLoaded);

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < 10) {
        setIsHeaderVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setIsHeaderVisible(false);
      } else if (currentScrollY < lastScrollY) {
        setIsHeaderVisible(true);
      }
      setLastScrollY(currentScrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // 홈에서 아파트 클릭 시 바로 상세 페이지 열기
  const handleApartmentSelect = (apartment: any) => {
    setSelectedApartment(apartment);
    setShowApartmentDetail(true);
  };

  // 지도에서 마커 클릭 시 상세 페이지 열기
  const handleMarkerClick = (apartment: any) => {
    setSelectedApartment(apartment);
    setShowApartmentDetail(true);
  };

  const handleBackFromDetail = () => {
    setShowApartmentDetail(false);
    setSelectedApartment(null);
  };

  const handleViewChange = (view: ViewType) => {
    // 상세정보 페이지가 열려있으면 닫기
    if (showApartmentDetail) {
      setShowApartmentDetail(false);
      setSelectedApartment(null);
    }
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // 맵 뷰인지 여부에 따라 최상위 컨테이너 클래스 결정
  // 맵 뷰: 전체 화면 (스크롤 없음, 고정)
  // 일반 뷰: 스크롤 가능
  const isMapView = currentView === 'map';

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-blue-50/30 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
        <div 
          className={`relative bg-white dark:bg-zinc-950 shadow-2xl shadow-black/5 dark:shadow-black/50 ${
            isMapView 
              ? 'w-full h-screen overflow-hidden' // 맵 뷰: 풀스크린, 스크롤 방지
              : (isDesktop ? 'min-h-screen pb-6 w-full max-w-[1400px] mx-auto' : 'min-h-screen pb-20 max-w-md mx-auto')
          }`}
          style={isDesktop && !isMapView ? {
            maxWidth: '1400px',
            marginLeft: 'auto',
            marginRight: 'auto',
          } : {}}
        >
          {/* Header */}
          <header className={`fixed top-0 left-0 right-0 z-30 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl transition-transform duration-300 ${
            isDesktop ? 'translate-y-0' : (isHeaderVisible && !isMapView ? 'translate-y-0' : '-translate-y-full')
          }`}>
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
              ${isMapView && !showApartmentDetail ? 'w-full h-full p-0 fixed inset-0 z-0' : `${isDesktop ? 'px-8' : 'px-4'} ${isDesktop ? 'py-8' : 'py-6'}`} 
              ${!isMapView && (isDesktop ? 'pt-20' : 'pt-20')}
              ${!isMapView && (isDesktop ? '' : 'min-h-[calc(100vh-4rem)]')}
              ${showApartmentDetail && isMapView ? 'relative z-50' : ''}
            `}
            style={isDesktop && !isMapView ? {
              width: '100%',
              maxWidth: '1400px',
              marginLeft: 'auto',
              marginRight: 'auto',
              paddingTop: '80px',
            } : (!isMapView ? {
              paddingTop: '80px',
            } : (showApartmentDetail && isMapView ? {
              paddingTop: '80px',
              paddingLeft: '16px',
              paddingRight: '16px',
            } : {}))}
          >
            <AnimatePresence mode="wait">
              {showApartmentDetail ? (
                <motion.div
                  key="detail"
                  initial={{ x: '100%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: '100%', opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35, duration: 0.2 }}
                  className={`min-h-[calc(100vh-8rem)] w-full max-w-full ${isMapView ? 'relative z-50 bg-white dark:bg-zinc-950 rounded-t-2xl shadow-2xl' : ''}`}
                >
                  <ApartmentDetail apartment={selectedApartment} onBack={handleBackFromDetail} isDarkMode={isDarkMode} />
                </motion.div>
              ) : (
                <motion.div
                  key={currentView}
                  initial={isMapView ? { opacity: 0 } : { opacity: 0, y: 15 }}
                  animate={isMapView ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={isMapView ? { opacity: 0 } : { opacity: 0, y: -15 }}
                  transition={{ duration: 0.2 }}
                  className={`w-full ${isMapView ? 'h-full' : 'max-w-full'}`}
                >
                  {currentView === 'dashboard' && <Dashboard onApartmentClick={handleApartmentSelect} isDarkMode={isDarkMode} isDesktop={isDesktop} />}
                  {currentView === 'map' && <MapView onApartmentSelect={handleMarkerClick} selectedApartment={selectedApartment} isDarkMode={isDarkMode} isDesktop={isDesktop} />}
                  {currentView === 'favorites' && <Favorites onApartmentClick={handleApartmentSelect} isDarkMode={isDarkMode} isDesktop={isDesktop} />}
                  {currentView === 'statistics' && <Statistics isDarkMode={isDarkMode} isDesktop={isDesktop} />}
                  {currentView === 'myHome' && (
                    <MyHome 
                      isDarkMode={isDarkMode} 
                      onOpenProfileMenu={() => setShowProfileMenu(true)}
                      isDesktop={isDesktop}
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
