import React from 'react';
import { Building2, MapPin, Calendar, TrendingUp, Newspaper, Sparkles, ChevronRight, Home, Plus, User } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';
import { useUser } from '@/lib/clerk';

interface MyHomeProps {
  isDarkMode: boolean;
  onOpenProfileMenu: () => void;
  isDesktop?: boolean;
}

// 개발 중 - 더미 데이터 제거

export default function MyHome({ isDarkMode, onOpenProfileMenu, isDesktop = false }: MyHomeProps) {
  // Clerk 사용자 정보 가져오기
  const { user, isSignedIn } = useUser();

  const cardClass = isDarkMode
    ? 'bg-slate-800/50 shadow-[8px_8px_20px_rgba(0,0,0,0.5),-4px_-4px_12px_rgba(100,100,150,0.05)]'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';
  
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const textMuted = isDarkMode ? 'text-slate-500' : 'text-slate-500';

  return (
    <div className={`w-full ${isDesktop ? 'space-y-8 max-w-4xl mx-auto' : 'space-y-6'}`}>
      {/* User Profile Card - 실제 Clerk 사용자 정보 사용 */}
      <button
        onClick={onOpenProfileMenu}
        className={`w-full rounded-2xl p-5 transition-all active:scale-[0.98] ${cardClass} hover:shadow-xl`}
      >
        <div className="flex items-center gap-4">
          {/* Profile Image */}
          <div className="relative">
            {isSignedIn && user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={user.firstName || 'User'}
                className="w-16 h-16 rounded-full border-2 border-white dark:border-zinc-950 shadow-lg"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center border-2 border-white dark:border-zinc-950 shadow-lg shadow-sky-500/25">
                <User className="w-8 h-8 text-white" />
              </div>
            )}
            {isSignedIn && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white dark:border-zinc-950 rounded-full"></div>
            )}
          </div>

          {/* User Info */}
          <div className="flex-1 text-left">
            {isSignedIn && user ? (
              <>
                <h3 className={`text-lg font-bold ${textPrimary} mb-0.5`}>
                  {user.firstName || user.emailAddresses[0]?.emailAddress || '사용자'}
                </h3>
                <p className={`text-sm ${textSecondary}`}>
                  {user.emailAddresses[0]?.emailAddress || ''}
                </p>
              </>
            ) : (
              <>
                <h3 className={`text-lg font-bold ${textPrimary} mb-0.5`}>로그인이 필요합니다</h3>
                <p className={`text-sm ${textSecondary}`}>프로필을 보려면 로그인하세요</p>
              </>
            )}
          </div>

          {/* Arrow Icon */}
          <ChevronRight className={`w-6 h-6 ${textSecondary}`} />
        </div>
      </button>

      {/* 개발 중 - 내 집 관리 기능 */}
      <DevelopmentPlaceholder 
        title="개발 중입니다"
        message="내 집 관리 기능을 준비 중입니다."
        isDarkMode={isDarkMode}
      />
    </div>
  );
}