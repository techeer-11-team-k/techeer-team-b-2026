import React from 'react';
import { Home, Map, Star, BarChart3, Building2 } from 'lucide-react';

interface FloatingDockProps {
  currentView: string;
  onViewChange: (view: 'dashboard' | 'map' | 'favorites' | 'statistics' | 'myHome') => void;
  isDarkMode: boolean;
  isDesktop?: boolean; // 데스크톱 모드 여부
}

export default function FloatingDock({ currentView, onViewChange, isDarkMode, isDesktop = false }: FloatingDockProps) {
  const dockItems = [
    { id: 'map', icon: Map, label: '지도' },
    { id: 'favorites', icon: Star, label: '즐겨찾기' },
    { id: 'dashboard', icon: Home, label: '홈', isHome: true },
    { id: 'statistics', icon: BarChart3, label: '통계' },
    { id: 'myHome', icon: Building2, label: '내 집' },
  ];

  // 데스크톱: 상단 네비게이션 바 스타일
  if (isDesktop) {
    return (
      <nav className="flex items-center gap-1">
        {dockItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const isHome = item.isHome;
          
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id as any)}
              className={`group relative flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30'
                  : isDarkMode
                  ? 'hover:bg-zinc-800/70'
                  : 'hover:bg-zinc-100'
              }`}
              title={item.label}
            >
              <Icon
                className={`transition-all ${
                  isHome && isActive ? 'w-5 h-5' : 'w-4.5 h-4.5'
                } ${
                  isActive 
                    ? 'text-white' 
                    : isDarkMode
                    ? 'text-zinc-400 group-hover:text-zinc-200'
                    : 'text-zinc-600 group-hover:text-zinc-800'
                }`}
              />
              <span className={`text-sm font-medium transition-colors ${
                isActive
                  ? 'text-white'
                  : isDarkMode
                  ? 'text-zinc-400 group-hover:text-zinc-200'
                  : 'text-zinc-600 group-hover:text-zinc-800'
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    );
  }

  // 모바일: 하단 독바 스타일 (기존 유지)
  return (
    <div className="fixed bottom-6 left-0 right-0 z-50 px-4 pb-safe pointer-events-none">
      <div className="max-w-md mx-auto flex justify-center pointer-events-auto">
        <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2.5 backdrop-blur-xl border ${
          isDarkMode 
            ? 'bg-zinc-900/95 border-white/10' 
            : 'bg-white/95 border-black/5 shadow-lg shadow-black/10'
        }`}>
          {dockItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const isHome = item.isHome;
            
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id as any)}
                className={`group relative flex flex-col items-center justify-center rounded-2xl transition-all duration-200 active:scale-90 ${
                  isHome ? 'p-3.5' : 'p-3'
                } ${
                  isActive
                    ? 'bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30'
                    : isDarkMode
                    ? 'hover:bg-zinc-800/70 active:bg-zinc-800'
                    : 'hover:bg-zinc-100 active:bg-zinc-200'
                }`}
              >
                <Icon
                  className={`transition-all ${
                    isHome && isActive ? 'w-6 h-6' : isHome ? 'w-5.5 h-5.5' : 'w-5 h-5'
                  } ${
                    isActive 
                      ? 'text-white' 
                      : isDarkMode
                      ? 'text-zinc-400 group-hover:text-zinc-200'
                      : 'text-zinc-600 group-hover:text-zinc-800'
                  }`}
                />
                {/* Home indicator dot */}
                {isHome && !isActive && (
                  <div className={`absolute -bottom-0.5 w-1 h-1 rounded-full ${
                    isDarkMode ? 'bg-sky-500' : 'bg-sky-600'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
