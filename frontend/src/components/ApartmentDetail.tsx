import React from 'react';
import { ArrowLeft, MapPin, TrendingUp, TrendingDown, Calendar, Layers, Home, Ruler, Building } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';

interface ApartmentDetailProps {
  apartment: any;
  onBack: () => void;
  isDarkMode: boolean;
}

// 개발 중 - 더미 데이터 제거

export default function ApartmentDetail({ apartment, onBack, isDarkMode }: ApartmentDetailProps) {
  const cardClass = isDarkMode
    ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';
  
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';

  const changeValue = parseFloat(apartment.change.replace('%', ''));
  const isPositive = changeValue > 0;

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className={`p-2 rounded-xl transition-colors ${
            isDarkMode
              ? 'bg-slate-800/50 hover:bg-slate-800'
              : 'bg-white hover:bg-sky-50 border border-sky-200'
          }`}
        >
          <ArrowLeft className="w-5 h-5 text-sky-500" />
        </button>
        <div>
          <h1 className={`text-2xl font-bold ${textPrimary}`}>{apartment.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <MapPin className="w-4 h-4 text-sky-400" />
            <p className={`text-sm ${textSecondary}`}>경기도 고양시 일산서구 탄현동</p>
          </div>
        </div>
      </div>

      {/* Current Price Card */}
      <div className={`rounded-2xl p-6 ${cardClass}`}>
        <div className="flex items-end justify-between">
          <div>
            <p className={`text-sm ${textSecondary} mb-1`}>현재 시세 (최근 거래가)</p>
            <p className={`text-4xl font-bold bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent`}>
              {apartment.price}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-xl border ${
            isPositive 
              ? 'bg-green-500/20 border-green-500/30' 
              : 'bg-red-500/20 border-red-500/30'
          }`}>
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
              <span className={`text-xl font-bold ${
                isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {apartment.change}
              </span>
            </div>
            <p className={`text-xs ${textSecondary} mt-1 text-center`}>최근 6개월</p>
          </div>
        </div>
      </div>

      {/* Overview Info */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-2xl p-4 ${cardClass}`}>
          <div className="flex items-center gap-2 mb-2">
            <Building className="w-4 h-4 text-sky-400" />
            <span className={`text-xs ${textSecondary}`}>건축년도</span>
          </div>
          <p className={`text-lg font-bold ${textPrimary}`}>2015년</p>
        </div>
        
        <div className={`rounded-2xl p-4 ${cardClass}`}>
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <span className={`text-xs ${textSecondary}`}>총 세대수</span>
          </div>
          <p className={`text-lg font-bold ${textPrimary}`}>1,456세대</p>
        </div>
        
        <div className={`rounded-2xl p-4 ${cardClass}`}>
          <div className="flex items-center gap-2 mb-2">
            <Home className="w-4 h-4 text-sky-400" />
            <span className={`text-xs ${textSecondary}`}>주차대수</span>
          </div>
          <p className={`text-lg font-bold ${textPrimary}`}>1.81대</p>
        </div>
      </div>

      {/* Price History Chart */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <h2 className={`text-lg font-bold ${textPrimary} mb-1`}>가격 변화 추이</h2>
        <p className={`text-xs ${textSecondary} mb-4`}>최근 6개월 평균 거래가 (단위: 억원)</p>
        <DevelopmentPlaceholder 
          title="개발 중입니다"
          message="가격 변화 추이 데이터를 준비 중입니다."
          isDarkMode={isDarkMode}
        />
      </div>

      {/* Transaction History */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-sky-400" />
          <div>
            <h2 className={`text-lg font-bold ${textPrimary}`}>실거래 내역</h2>
            <p className={`text-xs ${textSecondary} mt-0.5`}>최근 8건 (84.92㎡ / 25.7평 기준)</p>
          </div>
        </div>

        <DevelopmentPlaceholder 
          title="개발 중입니다"
          message="실거래 내역 데이터를 준비 중입니다."
          isDarkMode={isDarkMode}
        />
      </div>

      {/* Additional Info */}
      <div className={`rounded-2xl p-5 ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50 border border-blue-200'}`}>
        <h3 className={`text-sm font-bold ${textPrimary} mb-2 flex items-center gap-2`}>
          <TrendingUp className="w-4 h-4 text-blue-500" />
          거래 정보 활용 팁
        </h3>
        <ul className={`text-xs ${textSecondary} space-y-1.5 leading-relaxed`}>
          <li>• <span className="font-semibold">층수별 차이:</span> 같은 평형이라도 층수에 따라 가격이 다를 수 있어요</li>
          <li>• <span className="font-semibold">거래 빈도:</span> 최근 거래가 많다면 시세가 투명하고 매매가 활발해요</li>
          <li>• <span className="font-semibold">가격 추세:</span> 지속적으로 오르는지 내리는지 확인하세요</li>
        </ul>
      </div>
    </div>
  );
}