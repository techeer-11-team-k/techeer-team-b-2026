/**
 * Dashboard 검색 컴포넌트
 * 
 * Dashboard에서 분리하여 독립적으로 관리
 */
import React, { useState } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardSearchProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isAIMode: boolean;
  setIsAIMode: (mode: boolean) => void;
  onSearch: () => void;
  isDarkMode: boolean;
  gradientAngle?: number;
  gradientPosition?: { x: number; y: number };
  gradientSize?: number;
}

const DashboardSearch = React.memo<DashboardSearchProps>(({
  searchQuery,
  setSearchQuery,
  isAIMode,
  setIsAIMode,
  onSearch,
  isDarkMode,
  gradientAngle = 90,
  gradientPosition = { x: 50, y: 50 },
  gradientSize = 150,
}) => {
  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-sky-800/30 shadow-[8px_8px_20px_rgba(0,0,0,0.5),-4px_-4px_12px_rgba(100,100,150,0.05)]'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';

  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className={`rounded-2xl p-5 ${cardClass} mb-6 relative overflow-hidden`}>
      {/* AI 모드 배경 그라데이션 */}
      {isAIMode && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(
                ${gradientSize}% ${gradientSize}% at ${gradientPosition.x}% ${gradientPosition.y}%,
                rgba(14, 165, 233, 0.15) 0%,
                rgba(139, 92, 246, 0.1) 25%,
                rgba(236, 72, 153, 0.08) 50%,
                transparent 100%
              ),
              linear-gradient(
                ${gradientAngle}deg,
                rgba(14, 165, 233, 0.05) 0%,
                rgba(139, 92, 246, 0.05) 50%,
                rgba(236, 72, 153, 0.05) 100%
              )
            `,
            opacity: 0.8,
          }}
        />
      )}

      <div className="relative z-10">
        {/* 검색 모드 토글 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setIsAIMode(false)}
            className={`flex-1 py-2 px-4 rounded-lg transition-all duration-200 ${
              !isAIMode
                ? isDarkMode
                  ? 'bg-sky-600 text-white'
                  : 'bg-sky-500 text-white'
                : isDarkMode
                ? 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Search className="w-4 h-4 inline mr-2" />
            일반 검색
          </button>
          <button
            onClick={() => setIsAIMode(true)}
            className={`flex-1 py-2 px-4 rounded-lg transition-all duration-200 ${
              isAIMode
                ? 'bg-gradient-to-r from-sky-500 via-purple-500 to-pink-500 text-white'
                : isDarkMode
                ? 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Sparkles className="w-4 h-4 inline mr-2" />
            AI 검색
          </button>
        </div>

        {/* 검색 입력 */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSearch();
              }
            }}
            placeholder={
              isAIMode
                ? '예: 서울 강남구에서 전세 5억 이하, 지하철 가까운 곳'
                : '아파트명 또는 지역을 검색하세요'
            }
            className={`w-full py-3 pl-12 pr-12 rounded-xl border transition-all ${
              isDarkMode
                ? 'bg-slate-900/50 border-sky-700/50 text-slate-100 placeholder-slate-500 focus:border-sky-500'
                : 'bg-white border-gray-300 text-slate-800 placeholder-gray-400 focus:border-sky-500'
            } focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
          />
          <Search
            className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${
              isDarkMode ? 'text-slate-500' : 'text-gray-400'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className={`absolute right-4 top-1/2 -translate-y-1/2 ${
                isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* AI 모드 설명 */}
        {isAIMode && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`text-xs ${textSecondary} mt-2`}
          >
            💡 자연어로 원하는 조건을 입력하면 AI가 맞춤 아파트를 찾아드립니다
          </motion.p>
        )}
      </div>
    </div>
  );
});

DashboardSearch.displayName = 'DashboardSearch';

export default DashboardSearch;
