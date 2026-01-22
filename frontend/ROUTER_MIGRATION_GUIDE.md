# 라우터 마이그레이션 가이드

## 📋 현재 상태 분석

### 현재 구조
- **상태 관리**: `App.tsx`에서 `currentView` state로 뷰 전환 관리
- **뷰 타입**: `ViewType = 'dashboard' | 'map' | 'compare' | 'stats' | 'portfolio'`
- **특수 케이스**: `selectedPropertyId`로 `PropertyDetail` 모달식 표시
- **통계 서브 메뉴**: 드롭다운으로 "주택 수요", "주택 공급", "주택 랭킹" 선택 가능

### 현재 문제점
1. URL이 변경되지 않아 브라우저 뒤로가기/앞으로가기 불가
2. 특정 페이지로 직접 링크 공유 불가
3. 새로고침 시 항상 대시보드로 이동
4. 통계 서브 페이지 구분 불가

---

## 🎯 라우터 적용 방안

### 1. 라우터 라이브러리 선택

**React Router v6** 사용 권장
- 가장 널리 사용되는 라이브러리
- TypeScript 지원 우수
- 중첩 라우팅 지원
- 코드 스플리팅 지원

### 2. 설치

```bash
npm install react-router-dom
npm install --save-dev @types/react-router-dom
```

### 3. 라우트 구조 설계

```
/                           → Dashboard (홈)
/dashboard                  → Dashboard (리다이렉트)
/portfolio                  → PortfolioList
/map                        → MapExplorer
/compare                    → Comparison
/stats                      → Statistics (기본: 주택 수요)
  /stats/demand             → Statistics - 주택 수요
  /stats/supply             → Statistics - 주택 공급
  /stats/ranking            → Statistics - 주택 랭킹
/property/:id               → PropertyDetail
```

---

## 📝 마이그레이션 단계별 가이드

### Step 1: 라우터 설정 파일 생성

**파일**: `src/routes/index.tsx` (또는 `src/AppRoutes.tsx`)

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from '../components/views/Dashboard';
import { PortfolioList } from '../components/views/PortfolioList';
import { MapExplorer } from './components/views/MapExplorer';
import { Comparison } from './components/views/Comparison';
import { Statistics } from './components/views/Statistics';
import { PropertyDetail } from './components/views/PropertyDetail';

export const AppRoutes = () => {
  return (
    <Routes>
      {/* 메인 루트 */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      {/* 대시보드 */}
      <Route path="/dashboard" element={<Dashboard />} />
      
      {/* 포트폴리오 */}
      <Route path="/portfolio" element={<PortfolioList />} />
      
      {/* 지도 */}
      <Route path="/map" element={<MapExplorer />} />
      
      {/* 비교 */}
      <Route path="/compare" element={<Comparison />} />
      
      {/* 통계 - 중첩 라우팅 */}
      <Route path="/stats" element={<Statistics />}>
        <Route index element={<Navigate to="/stats/demand" replace />} />
        <Route path="demand" element={<Statistics category="demand" />} />
        <Route path="supply" element={<Statistics category="supply" />} />
        <Route path="ranking" element={<Statistics category="ranking" />} />
      </Route>
      
      {/* 부동산 상세 */}
      <Route path="/property/:id" element={<PropertyDetail />} />
      
      {/* 404 페이지 */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
```

### Step 2: App.tsx 수정

**변경 전:**
```tsx
function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  // ...
}
```

**변경 후:**
```tsx
import { BrowserRouter } from 'react-router-dom';
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
```

### Step 3: Layout 컴포넌트 수정

**변경 전:**
```tsx
interface LayoutProps {
  currentView: ViewType;
  onChangeView: (view: ViewType) => void;
  // ...
}
```

**변경 후:**
```tsx
import { useNavigate, useLocation, Link } from 'react-router-dom';

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // 현재 경로에서 ViewType 추출
  const currentView = location.pathname.startsWith('/stats') 
    ? 'stats' 
    : (location.pathname.slice(1) || 'dashboard') as ViewType;
  
  const handleViewChange = (view: ViewType) => {
    const pathMap: Record<ViewType, string> = {
      dashboard: '/dashboard',
      portfolio: '/portfolio',
      map: '/map',
      compare: '/compare',
      stats: '/stats/demand', // 기본값
    };
    navigate(pathMap[view]);
  };
  
  // ...
}
```

### Step 4: 통계 드롭다운 메뉴 수정

**변경 전:**
```tsx
<button onClick={() => { onChangeView('stats'); setIsStatsDropdownOpen(false); }}>
  주택 수요
</button>
```

**변경 후:**
```tsx
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

<button 
  onClick={() => { 
    navigate('/stats/demand'); 
    setIsStatsDropdownOpen(false); 
  }}
>
  주택 수요
</button>
<button 
  onClick={() => { 
    navigate('/stats/supply'); 
    setIsStatsDropdownOpen(false); 
  }}
>
  주택 공급
</button>
<button 
  onClick={() => { 
    navigate('/stats/ranking'); 
    setIsStatsDropdownOpen(false); 
  }}
>
  주택 랭킹
</button>
```

### Step 5: Statistics 컴포넌트 수정

**변경 후:**
```tsx
import { useParams, useNavigate } from 'react-router-dom';

export const Statistics: React.FC = () => {
  const { category = 'demand' } = useParams<{ category?: string }>();
  const navigate = useNavigate();
  
  // category에 따라 다른 데이터 표시
  // ...
  
  return (
    <div>
      {/* 탭 또는 버튼으로 카테고리 전환 */}
      <button onClick={() => navigate('/stats/demand')}>주택 수요</button>
      <button onClick={() => navigate('/stats/supply')}>주택 공급</button>
      <button onClick={() => navigate('/stats/ranking')}>주택 랭킹</button>
      
      {/* category에 따른 컨텐츠 렌더링 */}
    </div>
  );
};
```

### Step 6: PropertyDetail 라우팅

**변경 전:**
```tsx
const handlePropertyClick = (id: string) => {
  setSelectedPropertyId(id);
};
```

**변경 후:**
```tsx
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

const handlePropertyClick = (id: string) => {
  navigate(`/property/${id}`);
};
```

**PropertyDetail 컴포넌트:**
```tsx
import { useParams, useNavigate } from 'react-router-dom';

export const PropertyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const handleBack = () => {
    navigate(-1); // 또는 navigate('/dashboard')
  };
  
  // ...
};
```

---

## 🔄 마이그레이션 체크리스트

### 필수 작업
- [ ] `react-router-dom` 설치
- [ ] `App.tsx`에 `BrowserRouter` 추가
- [ ] 라우트 설정 파일 생성
- [ ] `Layout` 컴포넌트에서 `useNavigate`, `useLocation` 사용
- [ ] 모든 뷰 전환을 `navigate()`로 변경
- [ ] `PropertyDetail`을 라우트로 변경
- [ ] 통계 서브 페이지 라우팅 구현

### 선택 작업
- [ ] 로딩 상태 관리 (Suspense)
- [ ] 에러 바운더리 추가
- [ ] 코드 스플리팅 (lazy loading)
- [ ] SEO를 위한 메타 태그 관리
- [ ] 404 페이지 커스터마이징

---

## 🎨 고급 기능

### 1. 코드 스플리팅 (성능 최적화)

```tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./components/views/Dashboard'));
const Statistics = lazy(() => import('./components/views/Statistics'));

export const AppRoutes = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        {/* ... */}
      </Routes>
    </Suspense>
  );
};
```

### 2. 보호된 라우트 (인증 필요 시)

```tsx
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = true; // 실제 인증 로직
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

<Route 
  path="/dashboard" 
  element={
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  } 
/>
```

### 3. 쿼리 파라미터 활용

```tsx
import { useSearchParams } from 'react-router-dom';

// URL: /stats?year=2024&region=seoul
const [searchParams, setSearchParams] = useSearchParams();
const year = searchParams.get('year');
const region = searchParams.get('region');
```

---

## 📦 최종 파일 구조

```
src/
├── App.tsx                 # BrowserRouter 설정
├── routes/
│   └── index.tsx          # 라우트 정의
├── components/
│   ├── Layout.tsx         # useNavigate, useLocation 사용
│   └── views/
│       ├── Dashboard.tsx
│       ├── Statistics.tsx # useParams로 category 받기
│       └── PropertyDetail.tsx # useParams로 id 받기
└── types.ts
```

---

## ⚠️ 주의사항

1. **기존 state 제거**: `currentView`, `selectedPropertyId` state는 더 이상 필요 없음
2. **이벤트 핸들러 수정**: 모든 `onChangeView` 호출을 `navigate()`로 변경
3. **타입 안정성**: `ViewType`은 유지하되, URL과 매핑 필요
4. **뒤로가기 처리**: `navigate(-1)` 또는 명시적 경로 사용
5. **모바일 네비게이션**: 기존 플로팅 도크도 라우터와 연동 필요

---

## 🚀 마이그레이션 순서 추천

1. **1단계**: 라우터 설치 및 기본 설정
2. **2단계**: 메인 페이지 라우팅 (dashboard, map, compare)
3. **3단계**: PropertyDetail 라우팅
4. **4단계**: 통계 서브 페이지 라우팅
5. **5단계**: 코드 정리 및 최적화

---

## 📚 참고 자료

- [React Router 공식 문서](https://reactrouter.com/)
- [React Router v6 마이그레이션 가이드](https://reactrouter.com/en/main/upgrading/v5)
