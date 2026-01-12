import React, { useState, useEffect } from 'react';
import { Home as HomeIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './components/Dashboard';
import MapView from './components/MapView';
import Favorites from './components/Favorites';
import Statistics from './components/Statistics';
import MyHome from './components/MyHome';
import ApartmentDetail from './components/ApartmentDetail';
import FloatingDock from './components/FloatingDock';
import ProfileMenu from './components/ProfileMenu';

type ViewType = 'dashboard' | 'map' | 'favorites' | 'statistics' | 'myHome';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedApartment, setSelectedApartment] = useState<any>(null);
  const [showApartmentDetail, setShowApartmentDetail] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY < 10) {
        setIsHeaderVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
        // Scrolling down
        setIsHeaderVisible(false);
      } else if (currentScrollY < lastScrollY) {
        // Scrolling up
        setIsHeaderVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const handleApartmentSelect = (apartment: any) => {
    setSelectedApartment(apartment);
    setShowApartmentDetail(true);
  };

  const handleBackFromDetail = () => {
    setShowApartmentDetail(false);
    setSelectedApartment(null);
  };

  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-blue-50/30 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
        <div className="max-w-md mx-auto min-h-screen bg-white dark:bg-zinc-950 shadow-2xl shadow-black/5 dark:shadow-black/50 relative pb-20">
          {/* Header */}
          <header className={`fixed top-0 left-0 right-0 z-20 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl transition-transform duration-300 ${
            isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
          }`}>
            <div className="max-w-md mx-auto border-b dark:border-zinc-800 border-zinc-200">
              <div className="px-4 py-4 flex items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl shadow-lg shadow-sky-500/30">
                    <HomeIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">HOMU</h1>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="px-3 pt-20 py-6">
            <AnimatePresence mode="wait">
              {showApartmentDetail ? (
                <motion.div
                  key="detail"
                  initial={{ x: '100%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: '100%', opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35, duration: 0.2 }}
                >
                  <ApartmentDetail apartment={selectedApartment} onBack={handleBackFromDetail} isDarkMode={isDarkMode} />
                </motion.div>
              ) : (
                <motion.div
                  key={currentView}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentView === 'dashboard' && <Dashboard onApartmentClick={handleApartmentSelect} isDarkMode={isDarkMode} />}
                  {currentView === 'map' && <MapView onApartmentSelect={handleApartmentSelect} isDarkMode={isDarkMode} />}
                  {currentView === 'favorites' && <Favorites onApartmentClick={handleApartmentSelect} isDarkMode={isDarkMode} />}
                  {currentView === 'statistics' && <Statistics isDarkMode={isDarkMode} />}
                  {currentView === 'myHome' && (
                    <MyHome 
                      isDarkMode={isDarkMode} 
                      onOpenProfileMenu={() => setShowProfileMenu(true)}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Floating Dock */}
          <FloatingDock currentView={currentView} onViewChange={handleViewChange} isDarkMode={isDarkMode} />

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
