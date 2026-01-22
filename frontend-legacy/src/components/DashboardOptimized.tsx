/**
 * Dashboard 컴포넌트 최적화 래퍼
 * 
 * React.memo를 사용하여 불필요한 리렌더링 방지
 */
import React from 'react';
import Dashboard from './Dashboard';
import { LocationSearchResult } from '../lib/searchApi';

interface DashboardProps {
  onApartmentClick: (apartment: any) => void;
  onRegionSelect?: (region: LocationSearchResult) => void;
  onShowMoreSearch?: (query: string) => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

// React.memo로 감싸서 props가 변경되지 않으면 리렌더링 방지
const DashboardOptimized = React.memo<DashboardProps>(
  Dashboard,
  (prevProps, nextProps) => {
    // 커스텀 비교 함수
    // true를 반환하면 리렌더링 스킵
    return (
      prevProps.isDarkMode === nextProps.isDarkMode &&
      prevProps.isDesktop === nextProps.isDesktop &&
      prevProps.onApartmentClick === nextProps.onApartmentClick &&
      prevProps.onRegionSelect === nextProps.onRegionSelect &&
      prevProps.onShowMoreSearch === nextProps.onShowMoreSearch
    );
  }
);

DashboardOptimized.displayName = 'DashboardOptimized';

export default DashboardOptimized;
