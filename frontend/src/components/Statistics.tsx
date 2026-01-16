import React from 'react';
import { MapPin } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';

interface StatisticsProps {
  isDarkMode: boolean;
  isDesktop?: boolean;
}

// 개발 중 - 더미 데이터 제거

export default function Statistics({ isDarkMode, isDesktop = false }: StatisticsProps) {
  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-sky-800/30 shadow-[8px_8px_20px_rgba(0,0,0,0.5),-4px_-4px_12px_rgba(100,100,150,0.05)]'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';
  
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';

  // 상승률에 따라 색상 반환 (히트맵용)
  const getHeatmapColor = (change: string) => {
    const value = parseFloat(change.replace('%', ''));
    if (value >= 7) return '#ef4444'; // 빨강 (급등)
    if (value >= 5) return '#f97316'; // 주황
    if (value >= 3) return '#f59e0b'; // 노랑-주황
    if (value >= 1.5) return '#10b981'; // 초록
    if (value >= 0) return '#3b82f6'; // 파랑
    return '#6366f1'; // 남색 (하락)
  };

  return (
    <div className={`w-full ${isDesktop ? 'space-y-8' : 'space-y-6'}`}>
      {/* 데스크톱: 상하 배치 */}
      {isDesktop ? (
        <>
          {/* National Index Chart */}
          <div className={`rounded-2xl p-6 ${cardClass}`}>
            <h2 className={`text-lg font-bold ${textPrimary} mb-1`}>전국 매매지수 추이</h2>
            <p className={`text-xs ${textSecondary} mb-3`}>2020년 1월 = 100 기준</p>
            <DevelopmentPlaceholder 
              title="개발 중입니다"
              message="전국 매매지수 추이 데이터를 준비 중입니다."
              isDarkMode={isDarkMode}
            />
          </div>

          {/* Korea Map Heatmap */}
          <div className={`rounded-2xl p-6 ${cardClass}`}>
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-5 h-5 text-blue-500" />
              <div>
                <h2 className={`text-lg font-bold ${textPrimary}`}>지역별 집값 변동 히트맵</h2>
                <p className={`text-xs ${textSecondary} mt-0.5`}>최근 1년간 상승률</p>
              </div>
            </div>
            
            {/* Map Container */}
            <div className={`relative w-full h-[400px] rounded-xl overflow-hidden ${
              isDarkMode ? 'bg-slate-900/50' : 'bg-slate-100'
            }`}>
              {/* 기존 맵 SVG 코드는 아래 모바일 버전과 동일하게 사용 */}
              <DevelopmentPlaceholder 
                title="개발 중입니다"
                message="지역별 집값 변동 히트맵 데이터를 준비 중입니다."
                isDarkMode={isDarkMode}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* 모바일: 기존 세로 레이아웃 */}
          {/* National Index Chart */}
          <div className={`rounded-2xl p-5 ${cardClass}`}>
        <h2 className={`text-lg font-bold ${textPrimary} mb-1`}>전국 매매지수 추이</h2>
        <p className={`text-xs ${textSecondary} mb-3`}>2020년 1월 = 100 기준</p>
        <DevelopmentPlaceholder 
          title="개발 중입니다"
          message="전국 매매지수 추이 데이터를 준비 중입니다."
          isDarkMode={isDarkMode}
        />
      </div>

      {/* Korea Map Heatmap */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-5 h-5 text-blue-500" />
          <div>
            <h2 className={`text-lg font-bold ${textPrimary}`}>지역별 집값 변동 히트맵</h2>
            <p className={`text-xs ${textSecondary} mt-0.5`}>최근 1년간 상승률</p>
          </div>
        </div>
        
        {/* Map Container */}
        <div className={`relative w-full h-[500px] rounded-xl overflow-hidden ${
          isDarkMode ? 'bg-slate-900/50' : 'bg-slate-100'
        }`}>
          {/* Korea Map SVG Outline */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
            {/* Main Peninsula - Improved accuracy */}
            <path
              d="M 50 15
                 L 54 17 L 58 20 L 60 24 L 62 28 L 64 33 L 65 38
                 L 66 43 L 67 48 L 67 53 L 67 58
                 L 66 63 L 65 68 L 63 73 L 60 78 L 56 82
                 L 52 85 L 48 87 L 44 87 L 40 85
                 L 36 82 L 32 78 L 29 73 L 27 68
                 L 26 63 L 25 58 L 25 53 L 25 48
                 L 26 43 L 27 38 L 29 33 L 32 28
                 L 36 24 L 40 20 L 44 17 Z
                 M 60 24 L 63 26 L 65 30
                 M 32 28 L 29 30 L 27 34"
              fill={isDarkMode ? 'rgba(71, 85, 105, 0.2)' : 'rgba(203, 213, 225, 0.3)'}
              stroke={isDarkMode ? '#7c3aed' : '#9333ea'}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            
            {/* Jeju Island */}
            <ellipse 
              cx="40" 
              cy="94" 
              rx="5" 
              ry="2.5" 
              fill={isDarkMode ? 'rgba(71, 85, 105, 0.2)' : 'rgba(203, 213, 225, 0.3)'}
              stroke={isDarkMode ? '#7c3aed' : '#9333ea'}
              strokeWidth="1.5"
            />
          </svg>

          {/* 개발 중 플레이스홀더 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <DevelopmentPlaceholder 
              title="개발 중입니다"
              message="지역별 집값 변동 히트맵 데이터를 준비 중입니다."
              isDarkMode={isDarkMode}
            />
          </div>
        </div>

        {/* Heatmap Legend */}
        <div className="mt-5">
          <p className={`text-xs ${textSecondary} mb-2 text-center font-semibold`}>최근 1년 집값 변동률</p>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${textSecondary}`}>하락</span>
            <div className="flex-1 h-3 rounded-full" style={{
              background: 'linear-gradient(to right, #6366f1, #3b82f6, #10b981, #f59e0b, #f97316, #ef4444)'
            }} />
            <span className={`text-xs ${textSecondary}`}>급등</span>
          </div>
          <div className="flex justify-between mt-1 px-1">
            <span className={`text-xs ${textSecondary}`}>0%</span>
            <span className={`text-xs ${textSecondary}`}>+1.5%</span>
            <span className={`text-xs ${textSecondary}`}>+3%</span>
            <span className={`text-xs ${textSecondary}`}>+5%</span>
            <span className={`text-xs ${textSecondary}`}>+7%+</span>
          </div>
          <p className={`text-xs ${textSecondary} text-center mt-3 leading-relaxed`}>
            💡 빨간색 지역은 집값이 많이 올랐어요. 파란색 지역은 안정적이에요.
          </p>
        </div>
      </div>
        </>
      )}
    </div>
  );
}