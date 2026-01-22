/**
 * 라우터 구현 예시 파일
 * 
 * 이 파일은 참고용 예시입니다.
 * 실제 적용 시 프로젝트 구조에 맞게 수정하세요.
 */

// ============================================
// 1. App.tsx 예시
// ============================================

import { BrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AppRoutes } from './routes';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <AppRoutes />
      </Layout>
    </BrowserRouter>
  );
}

export default App;

// ============================================
// 2. routes/index.tsx 예시
// ============================================

import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Dashboard } from '../components/views/Dashboard';
import { PortfolioList } from '../components/views/PortfolioList';
import { MapExplorer } from '../components/views/MapExplorer';
import { Comparison } from '../components/views/Comparison';
import { Statistics } from '../components/views/Statistics';
import { PropertyDetail } from '../components/views/PropertyDetail';

// 코드 스플리팅 예시 (선택사항)
// const Dashboard = lazy(() => import('../components/views/Dashboard'));

export const AppRoutes = () => {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <Routes>
        {/* 루트 경로 리다이렉트 */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* 메인 페이지들 */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/portfolio" element={<PortfolioList />} />
        <Route path="/map" element={<MapExplorer />} />
        <Route path="/compare" element={<Comparison />} />
        
        {/* 통계 페이지 - 중첩 라우팅 */}
        <Route path="/stats" element={<Statistics />}>
          <Route index element={<Navigate to="/stats/demand" replace />} />
          <Route path="demand" element={<Statistics category="demand" />} />
          <Route path="supply" element={<Statistics category="supply" />} />
          <Route path="ranking" element={<Statistics category="ranking" />} />
        </Route>
        
        {/* 부동산 상세 페이지 */}
        <Route path="/property/:id" element={<PropertyDetail />} />
        
        {/* 404 - 존재하지 않는 경로 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
};

// ============================================
// 3. Layout.tsx 수정 예시
// ============================================

import { useNavigate, useLocation, Link } from 'react-router-dom';

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // 현재 경로에서 ViewType 추출
  const getCurrentView = (): ViewType => {
    const path = location.pathname;
    if (path.startsWith('/stats')) return 'stats';
    if (path.startsWith('/property')) return 'dashboard'; // 상세 페이지는 대시보드에서 온 것으로 간주
    if (path === '/portfolio') return 'portfolio';
    if (path === '/map') return 'map';
    if (path === '/compare') return 'compare';
    return 'dashboard';
  };
  
  const currentView = getCurrentView();
  
  const handleViewChange = (view: ViewType) => {
    const pathMap: Record<ViewType, string> = {
      dashboard: '/dashboard',
      portfolio: '/portfolio',
      map: '/map',
      compare: '/compare',
      stats: '/stats/demand', // 기본값
    };
    navigate(pathMap[view]);
    window.scrollTo(0, 0);
  };
  
  // 통계 드롭다운 메뉴
  const handleStatsMenuClick = (category: 'demand' | 'supply' | 'ranking') => {
    navigate(`/stats/${category}`);
    setIsStatsDropdownOpen(false);
  };
  
  return (
    <>
      <header>
        <nav>
          {tabs.map((tab) => {
            if (tab.id === 'stats') {
              return (
                <div key={tab.id} className="relative" ref={statsDropdownRef}>
                  <button onClick={() => setIsStatsDropdownOpen(!isStatsDropdownOpen)}>
                    {tab.label}
                  </button>
                  
                  {isStatsDropdownOpen && (
                    <div className="dropdown-menu">
                      <button onClick={() => handleStatsMenuClick('demand')}>
                        주택 수요
                      </button>
                      <button onClick={() => handleStatsMenuClick('supply')}>
                        주택 공급
                      </button>
                      <button onClick={() => handleStatsMenuClick('ranking')}>
                        주택 랭킹
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            
            return (
              <button
                key={tab.id}
                onClick={() => handleViewChange(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>
      
      <main>
        {children}
      </main>
    </>
  );
};

// ============================================
// 4. Statistics.tsx 수정 예시
// ============================================

import { useParams, useNavigate, Outlet } from 'react-router-dom';

interface StatisticsProps {
  category?: 'demand' | 'supply' | 'ranking';
}

export const Statistics: React.FC<StatisticsProps> = ({ category: propCategory }) => {
  const { category: urlCategory } = useParams<{ category?: string }>();
  const navigate = useNavigate();
  
  // prop으로 받은 category가 우선, 없으면 URL에서 가져옴
  const currentCategory = propCategory || (urlCategory as 'demand' | 'supply' | 'ranking') || 'demand';
  
  const handleCategoryChange = (newCategory: 'demand' | 'supply' | 'ranking') => {
    navigate(`/stats/${newCategory}`);
  };
  
  return (
    <div>
      {/* 카테고리 탭 */}
      <div className="category-tabs">
        <button 
          onClick={() => handleCategoryChange('demand')}
          className={currentCategory === 'demand' ? 'active' : ''}
        >
          주택 수요
        </button>
        <button 
          onClick={() => handleCategoryChange('supply')}
          className={currentCategory === 'supply' ? 'active' : ''}
        >
          주택 공급
        </button>
        <button 
          onClick={() => handleCategoryChange('ranking')}
          className={currentCategory === 'ranking' ? 'active' : ''}
        >
          주택 랭킹
        </button>
      </div>
      
      {/* 카테고리별 컨텐츠 */}
      <div className="content">
        {currentCategory === 'demand' && <DemandContent />}
        {currentCategory === 'supply' && <SupplyContent />}
        {currentCategory === 'ranking' && <RankingContent />}
      </div>
      
      {/* 중첩 라우팅 사용 시 */}
      {/* <Outlet /> */}
    </div>
  );
};

// ============================================
// 5. PropertyDetail.tsx 수정 예시
// ============================================

import { useParams, useNavigate } from 'react-router-dom';

export const PropertyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!id) {
    return <div>Property ID is required</div>;
  }
  
  const handleBack = () => {
    // 이전 페이지로 이동
    navigate(-1);
    
    // 또는 특정 페이지로 이동
    // navigate('/dashboard');
  };
  
  return (
    <div>
      <button onClick={handleBack}>뒤로가기</button>
      <h1>Property Detail: {id}</h1>
      {/* ... */}
    </div>
  );
};

// ============================================
// 6. Dashboard.tsx에서 Property 클릭 예시
// ============================================

import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC<ViewProps> = ({ onPropertyClick, onViewAllPortfolio }) => {
  const navigate = useNavigate();
  
  const handlePropertyClick = (id: string) => {
    navigate(`/property/${id}`);
    window.scrollTo(0, 0);
  };
  
  return (
    <div>
      {/* ... */}
      <button onClick={() => handlePropertyClick('property-123')}>
        자산 상세보기
      </button>
    </div>
  );
};

// ============================================
// 7. 타입 정의 업데이트 (types.ts)
// ============================================

// ViewType은 유지하되, URL 매핑 함수 추가
export type ViewType = 'dashboard' | 'map' | 'compare' | 'stats' | 'portfolio';

export const viewTypeToPath = (view: ViewType): string => {
  const pathMap: Record<ViewType, string> = {
    dashboard: '/dashboard',
    portfolio: '/portfolio',
    map: '/map',
    compare: '/compare',
    stats: '/stats/demand',
  };
  return pathMap[view];
};

export const pathToViewType = (path: string): ViewType => {
  if (path.startsWith('/stats')) return 'stats';
  if (path.startsWith('/property')) return 'dashboard';
  if (path === '/portfolio') return 'portfolio';
  if (path === '/map') return 'map';
  if (path === '/compare') return 'compare';
  return 'dashboard';
};

// ============================================
// 8. 커스텀 훅 예시 (선택사항)
// ============================================

import { useNavigate, useLocation } from 'react-router-dom';
import { ViewType } from '../types';

export const useViewNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const navigateToView = (view: ViewType) => {
    const pathMap: Record<ViewType, string> = {
      dashboard: '/dashboard',
      portfolio: '/portfolio',
      map: '/map',
      compare: '/compare',
      stats: '/stats/demand',
    };
    navigate(pathMap[view]);
    window.scrollTo(0, 0);
  };
  
  const getCurrentView = (): ViewType => {
    const path = location.pathname;
    if (path.startsWith('/stats')) return 'stats';
    if (path.startsWith('/property')) return 'dashboard';
    if (path === '/portfolio') return 'portfolio';
    if (path === '/map') return 'map';
    if (path === '/compare') return 'compare';
    return 'dashboard';
  };
  
  return {
    navigateToView,
    currentView: getCurrentView(),
    currentPath: location.pathname,
  };
};

// 사용 예시:
// const { navigateToView, currentView } = useViewNavigation();
// navigateToView('dashboard');
