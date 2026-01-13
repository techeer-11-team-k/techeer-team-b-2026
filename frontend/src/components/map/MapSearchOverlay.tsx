import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, SlidersHorizontal, TrendingUp } from 'lucide-react';

interface MapSearchOverlayProps {
  isDarkMode?: boolean;
}

export default function MapSearchOverlay({ isDarkMode = false }: MapSearchOverlayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'keywords' | 'filter'>('keywords');

  // Colors
  const bgBase = isDarkMode ? 'bg-slate-900/90' : 'bg-white/90';
  const textPrimary = isDarkMode ? 'text-white' : 'text-slate-900';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const borderColor = isDarkMode ? 'border-slate-700' : 'border-slate-200';
  const accentColor = 'bg-blue-600';

  return (
    <div className="absolute top-4 left-4 z-50 flex flex-col items-start gap-4">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.button
            key="search-button"
            layoutId="search-container"
            onClick={() => setIsExpanded(true)}
            className={`flex items-center justify-center w-12 h-12 rounded-full shadow-lg ${accentColor} text-white`}
            whileTap={{ scale: 0.9 }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Search className="w-6 h-6" />
          </motion.button>
        ) : (
          <motion.div
            key="search-bar"
            layoutId="search-container"
            className={`flex flex-col gap-3 w-[85vw] max-w-sm`}
            initial={{ opacity: 0, width: 48 }}
            animate={{ opacity: 1, width: '100%' }}
            exit={{ opacity: 0, width: 48 }}
          >
            {/* Search Input Pill */}
            <div className={`flex items-center px-4 py-3 rounded-full shadow-xl border backdrop-blur-md ${bgBase} ${borderColor}`}>
              <Search className={`w-5 h-5 mr-3 ${textSecondary}`} />
              <input
                autoFocus
                type="text"
                placeholder="장소, 주소, 역 검색"
                className={`flex-1 bg-transparent outline-none text-base ${textPrimary} placeholder:${textSecondary}`}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                className={`p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 ${textSecondary}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs Pill */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex overflow-hidden rounded-2xl shadow-lg border backdrop-blur-md ${bgBase} ${borderColor}`}
            >
              <button
                onClick={() => setActiveTab('keywords')}
                className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'keywords' 
                    ? 'bg-blue-600/10 text-blue-600' 
                    : `${textSecondary} hover:bg-black/5 dark:hover:bg-white/5`
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                상위 검색어
              </button>
              <div className={`w-px ${borderColor} my-2`} />
              <button
                onClick={() => setActiveTab('filter')}
                className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'filter' 
                    ? 'bg-blue-600/10 text-blue-600' 
                    : `${textSecondary} hover:bg-black/5 dark:hover:bg-white/5`
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                필터
              </button>
            </motion.div>

            {/* Content Area */}
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className={`p-6 rounded-2xl shadow-lg border backdrop-blur-md ${bgBase} ${borderColor}`}
            >
              <div className="flex flex-col items-center justify-center text-center py-4">
                <div className={`p-3 rounded-full mb-3 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                   {activeTab === 'keywords' ? <TrendingUp className={`w-6 h-6 ${textSecondary}`} /> : <SlidersHorizontal className={`w-6 h-6 ${textSecondary}`} />}
                </div>
                <p className={`font-medium ${textPrimary}`}>
                  {activeTab === 'keywords' ? '상위 검색어' : '필터 옵션'}
                </p>
                <p className={`text-sm mt-1 ${textSecondary}`}>
                  개발 중입니다
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
