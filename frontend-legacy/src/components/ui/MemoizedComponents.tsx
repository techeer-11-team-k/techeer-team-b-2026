/**
 * 메모이제이션된 UI 컴포넌트들
 * 
 * 자주 사용되는 UI 컴포넌트들을 React.memo로 최적화
 */
import React from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// 차트 컴포넌트 메모이제이션
export const MemoizedLineChart = React.memo(LineChart);
export const MemoizedLine = React.memo(Line);
export const MemoizedAreaChart = React.memo(AreaChart);
export const MemoizedArea = React.memo(Area);
export const MemoizedBarChart = React.memo(BarChart);
export const MemoizedBar = React.memo(Bar);
export const MemoizedXAxis = React.memo(XAxis);
export const MemoizedYAxis = React.memo(YAxis);
export const MemoizedCartesianGrid = React.memo(CartesianGrid);
export const MemoizedTooltip = React.memo(Tooltip);
export const MemoizedResponsiveContainer = React.memo(ResponsiveContainer);
export const MemoizedLegend = React.memo(Legend);

// 카드 컴포넌트
interface CardProps {
  children: React.ReactNode;
  className?: string;
  isDarkMode?: boolean;
  onClick?: () => void;
}

export const MemoizedCard = React.memo<CardProps>(
  ({ children, className = '', isDarkMode = false, onClick }) => {
    const cardClass = isDarkMode
      ? 'bg-slate-800/50 border border-sky-800/30 shadow-[8px_8px_20px_rgba(0,0,0,0.5),-4px_-4px_12px_rgba(100,100,150,0.05)]'
      : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';
    
    return (
      <div 
        className={`rounded-2xl p-5 ${cardClass} ${className}`}
        onClick={onClick}
      >
        {children}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.isDarkMode === next.isDarkMode &&
      prev.className === next.className &&
      prev.onClick === next.onClick &&
      prev.children === next.children
    );
  }
);

MemoizedCard.displayName = 'MemoizedCard';

// 로딩 스켈레톤
interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  isDarkMode?: boolean;
}

export const MemoizedSkeleton = React.memo<SkeletonProps>(
  ({ width = '100%', height = '20px', className = '', isDarkMode = false }) => {
    return (
      <div
        className={`animate-pulse rounded ${
          isDarkMode ? 'bg-zinc-800' : 'bg-gray-200'
        } ${className}`}
        style={{ width, height }}
      />
    );
  }
);

MemoizedSkeleton.displayName = 'MemoizedSkeleton';

// 빈 상태 컴포넌트
interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: React.ReactNode;
  isDarkMode?: boolean;
}

export const MemoizedEmptyState = React.memo<EmptyStateProps>(
  ({ title, message, icon, isDarkMode = false }) => {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        {icon && (
          <div className={`mb-4 ${isDarkMode ? 'text-zinc-600' : 'text-gray-400'}`}>
            {icon}
          </div>
        )}
        <h3 className={`text-lg font-semibold mb-2 ${
          isDarkMode ? 'text-zinc-300' : 'text-gray-700'
        }`}>
          {title}
        </h3>
        {message && (
          <p className={`text-sm ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>
            {message}
          </p>
        )}
      </div>
    );
  }
);

MemoizedEmptyState.displayName = 'MemoizedEmptyState';
