# Frontend-Backend 통합 진행 보고서

## 개요
frontend-test와 backend가 연결되었으나, 아직 많은 컴포넌트에서 더미 데이터를 사용하고 있음.
본 문서는 더미 데이터를 실제 백엔드 API로 교체하고, 검색 속도 최적화를 위한 계획을 정리함.

---

## 현재 문제 사항

### 1. 더미 데이터 사용 현황

| 컴포넌트 | 파일 위치 | 더미 데이터 내용 | 연동 필요 API |
|---------|----------|-----------------|--------------|
| Dashboard | `components/views/Dashboard.tsx` | `myProperties`, `rawFav1Properties`, `rawFav2Properties` | `/api/v1/my-properties`, `/api/v1/favorites/apartments` |
| PolicyNewsList | `components/views/PolicyNewsList.tsx` | `mockNews` (4개 하드코딩 뉴스) | `/api/v1/news` |
| Layout (Search) | `components/Layout.tsx` | 최근 검색, 인기 검색 하드코딩 | `/api/v1/search/recent`, `/api/v1/apartments/trending` |
| Dashboard AddModal | `components/views/Dashboard.tsx` | `sampleApartments` | `/api/v1/search/apartments` |

### 2. 미연동 기능

| 기능 | 현재 상태 | 필요 작업 |
|-----|---------|----------|
| 로그인/로그아웃 | UI만 존재, 실제 동작 안함 | Clerk 연동 필요 |
| 내 자산 추가 | 더미 검색 결과 표시 | `/api/v1/my-properties` POST 연동 |
| 관심 단지 추가/삭제 | 로컬 상태만 변경 | `/api/v1/favorites/apartments` CRUD 연동 |
| 뉴스 외부 링크 | 콘솔 로그만 출력 | 뉴스 URL로 실제 이동 |

### 3. 검색 성능 문제

- 현재 아파트 검색 시 전체 테이블 스캔 발생 가능
- 대용량 데이터 조회 시 응답 시간 지연
- 필터 조건별 인덱스 부족

---

## 해결 계획

### Phase 1: 인증 시스템 연동 (Clerk)

#### 1.1 프론트엔드 Clerk 설정
```tsx
// package.json에 추가
"@clerk/clerk-react": "^5.0.0"

// index.tsx에 ClerkProvider 설정
<ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
  <App />
</ClerkProvider>
```

#### 1.2 Layout 컴포넌트 수정
- `useUser()` 훅으로 사용자 정보 가져오기
- 로그인 상태에 따른 UI 분기
- 로그아웃 버튼에 `clerk.signOut()` 연동

#### 1.3 API 요청에 인증 토큰 추가
```typescript
// services/api.ts 수정
const getAuthHeaders = async () => {
  const token = await clerk.session?.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
```

### Phase 2: 내 자산 & 관심 단지 연동

#### 2.1 API 서비스 확장 (`services/api.ts`)
```typescript
// 내 자산 API
export const fetchMyProperties = () => apiFetch('/my-properties');
export const createMyProperty = (data) => apiFetch('/my-properties', { method: 'POST', body: data });
export const deleteMyProperty = (id) => apiFetch(`/my-properties/${id}`, { method: 'DELETE' });

// 관심 아파트 API
export const fetchFavoriteApartments = () => apiFetch('/favorites/apartments');
export const addFavoriteApartment = (data) => apiFetch('/favorites/apartments', { method: 'POST', body: data });
export const removeFavoriteApartment = (aptId) => apiFetch(`/favorites/apartments/${aptId}`, { method: 'DELETE' });
```

#### 2.2 Dashboard 컴포넌트 수정
- `useEffect`로 내 자산/관심 단지 데이터 로드
- 로딩 상태 및 에러 처리 추가
- 자산 추가/삭제 시 API 호출 및 상태 업데이트

### Phase 3: 뉴스 연동

#### 3.1 PolicyNewsList 수정
```typescript
// 더미 데이터 대신 API 호출
const [news, setNews] = useState<NewsItem[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetchNews(5).then(response => {
    setNews(response.data);
    setLoading(false);
  });
}, []);
```

#### 3.2 API 서비스 추가
```typescript
export const fetchNews = (limit = 20) => 
  apiFetch(`/news?limit_per_source=${limit}`);
  
export const fetchNewsDetail = (url: string) =>
  apiFetch(`/news/detail?url=${encodeURIComponent(url)}`);
```

### Phase 4: 검색 기능 연동

#### 4.1 최근 검색어 API 추가
```typescript
export const fetchRecentSearches = () => apiFetch('/search/recent');
export const saveRecentSearch = (query: string) => 
  apiFetch('/search/recent', { method: 'POST', body: { query } });
export const deleteRecentSearch = (id: number) =>
  apiFetch(`/search/recent/${id}`, { method: 'DELETE' });
```

#### 4.2 인기 검색 연동
- `/api/v1/apartments/trending` 활용
- 또는 백엔드에 인기 검색어 집계 API 추가

### Phase 5: 검색 속도 최적화

#### 5.1 백엔드 인덱스 추가 (이미 마이그레이션 존재)
```sql
-- backend/scripts/migrations/20260122_add_search_indexes.sql
CREATE INDEX idx_apartments_apt_name_trgm ON apartments USING gin (apt_name gin_trgm_ops);
CREATE INDEX idx_apartments_region_id ON apartments (region_id);
CREATE INDEX idx_sales_apt_id_contract_date ON sales (apt_id, contract_date DESC);
CREATE INDEX idx_rents_apt_id_deal_date ON rents (apt_id, deal_date DESC);
```

#### 5.2 Redis 캐싱 강화
- 검색 결과 캐싱 (TTL: 5분)
- 트렌딩 아파트 캐싱 (TTL: 1시간)
- 사용자별 관심 목록 캐싱 (TTL: 1시간)

#### 5.3 쿼리 최적화
- N+1 쿼리 방지를 위한 eager loading
- 페이지네이션 적용 (기본 10개, 최대 50개)
- 검색 결과 필드 최소화 (필요한 필드만 SELECT)

---

## 백엔드 엔드포인트 현황

### 기존 구현 완료
| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/auth/webhook` | POST | Clerk 웹훅 |
| `/auth/me` | GET/PATCH | 내 프로필 조회/수정 |
| `/my-properties` | GET/POST | 내 자산 목록/등록 |
| `/my-properties/{id}` | GET/PATCH/DELETE | 내 자산 상세/수정/삭제 |
| `/favorites/apartments` | GET/POST | 관심 아파트 목록/추가 |
| `/favorites/apartments/{id}` | DELETE | 관심 아파트 삭제 |
| `/favorites/locations` | GET/POST/DELETE | 관심 지역 CRUD |
| `/search/apartments` | GET | 아파트 검색 |
| `/apartments/{id}/detail` | GET | 아파트 상세 |
| `/apartments/compare` | POST | 아파트 비교 |
| `/apartments/{id}/pyeong-prices` | GET | 평형별 가격 |
| `/apartments/trending` | GET | 트렌딩 아파트 |
| `/news` | GET | 뉴스 목록 |
| `/news/detail` | GET | 뉴스 상세 |
| `/dashboard/summary` | GET | 대시보드 요약 |

### 추가 필요 (선택)
| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/search/popular` | GET | 인기 검색어 (통계 기반) |
| `/apartments/{id}/price-history` | GET | 가격 히스토리 (차트용) |

---

## 파일 수정 계획

### Frontend 수정 파일
1. `frontend-test/services/api.ts` - API 함수 추가
2. `frontend-test/components/Layout.tsx` - Clerk 연동, 검색 연동
3. `frontend-test/components/views/Dashboard.tsx` - 내 자산/관심단지 API 연동
4. `frontend-test/components/views/PolicyNewsList.tsx` - 뉴스 API 연동
5. `frontend-test/index.tsx` - ClerkProvider 설정
6. `frontend-test/package.json` - @clerk/clerk-react 의존성 추가

### Backend 수정 파일 (필요시)
1. `backend/app/api/v1/endpoints/search.py` - 인기 검색어 API 추가
2. `backend/app/api/v1/endpoints/apartments.py` - 가격 히스토리 API 추가

---

## 진행 기록

### 2026-01-22
- 프론트엔드/백엔드 구조 및 기존 API/라우터/검색 로직 현황 파악
- 비교 기능 문서(최종/버전별)와 라우터 마이그레이션 가이드 확인
- 백엔드 비교/평형 API 및 상세 조회 API 설계 반영
- 검색 성능 개선 인덱스 마이그레이션 SQL 추가
- frontend-test 라우터 분리 및 Kakao Map 로딩 기반 마련
- 비교/지도/상세 화면에 백엔드 API 연동 로직 추가
- docker-compose 프론트엔드를 frontend-test 기반으로 연결
- react-router-dom 의존성 누락 오류 대응(컨테이너 재빌드/설치 가이드)

### 2026-01-22 (통합 작업)
- 더미 데이터 현황 분석 완료
- 백엔드 API 구현 상태 확인 (대부분 구현 완료)
- 통합 작업 계획 수립 및 문서화

### 2026-01-22 (통합 작업 완료)

#### ✅ 완료된 작업

**1. Clerk 인증 시스템 연동**
- `frontend-test/index.tsx`에 ClerkProvider 설정 추가
- `frontend-test/hooks/useAuth.ts` 커스텀 훅 생성 (Clerk 추상화)
- `frontend-test/services/api.ts`에 `setAuthToken()` 함수 추가
- `frontend-test/components/Layout.tsx` Clerk 컴포넌트 통합:
  - PC/모바일 헤더에 `SignInButton`, `UserButton` 연동
  - `SignedIn`/`SignedOut` 상태별 UI 분기
  - 사용자 프로필 이미지 및 이름 실제 데이터 표시
- `package.json`에 `@clerk/clerk-react: ^5.20.0` 의존성 추가

**2. Dashboard 내 자산 & 관심 단지 API 연동**
- `Dashboard.tsx` 전체 리팩토링:
  - 더미 데이터(`myProperties`, `rawFav1Properties`) 제거
  - `fetchMyProperties()`, `fetchFavoriteApartments()` API 호출
  - 로그인 상태에 따른 데이터 로드 로직
  - `loadData()` 콜백으로 데이터 리프레시
- 내 자산/관심 단지 추가 기능:
  - `searchApartments()` API를 통한 실시간 검색
  - `createMyProperty()`, `addFavoriteApartment()` 연동
  - 검색 디바운스(300ms) 적용
- `types.ts`에 `aptId` 필드 추가 (API 아파트 ID)

**3. PolicyNewsList 뉴스 API 연동**
- `mockNews` 더미 데이터 제거
- `fetchNews()` API 호출로 실시간 뉴스 로드
- 로딩 상태 스켈레톤 UI 추가
- 에러 상태 및 빈 목록 처리
- 뉴스 상세 모달에 "원문 보기" 버튼 추가 (외부 링크)
- 새로고침 버튼 추가

**4. 검색 기능 연동**
- Layout `SearchOverlay` 수정:
  - `fetchTrendingApartments()` API로 인기 검색 대체
  - 실시간 트렌딩 아파트 목록 표시
- Dashboard 아파트 추가 모달:
  - `searchApartments()` API 실시간 검색
  - 검색 결과에서 클릭하여 자산/관심단지 추가

**5. API 서비스 레이어 확장 (`services/api.ts`)**
새로 추가된 API 함수:
- `setAuthToken()`, `getAuthToken()` - 인증 토큰 관리
- `fetchMyProperties()`, `createMyProperty()`, `deleteMyProperty()` - 내 자산
- `fetchFavoriteApartments()`, `addFavoriteApartment()`, `removeFavoriteApartment()` - 관심 아파트
- `fetchNews()`, `fetchNewsDetail()` - 뉴스
- `fetchRecentSearches()`, `saveRecentSearch()`, `deleteRecentSearch()` - 최근 검색어
- `fetchDashboardSummary()`, `fetchRegionStats()` - 대시보드

**6. 검색 속도 최적화 (백엔드)**
- 2단계 검색 최적화 구현 (`services/search.py`):
  1. PREFIX 검색 (인덱스 활용, 빠름)
  2. pg_trgm 유사도 검색 (필요시만)
- 인덱스 마이그레이션 (`20260122_add_search_indexes.sql`):
  - `gin_trgm_ops` 트라이그램 인덱스
  - `text_pattern_ops` PREFIX 패턴 인덱스
  - 숫자 제거 정규화 주소 인덱스
- Redis 캐싱:
  - 아파트 검색 결과: TTL 30분
  - 지역 검색 결과: TTL 1시간
  - 자동 캐시 무효화 로직

---

## 남은 선택적 작업

| 작업 | 우선순위 | 설명 |
|-----|---------|------|
| 인기 검색어 통계 API | P2 | 실제 검색 데이터 기반 인기 검색어 |
| 가격 히스토리 차트 API | P2 | 아파트별 시세 변동 그래프 |
| 다크 모드 동기화 | P3 | Clerk 프로필과 다크모드 설정 연동 |
| 알림 시스템 | P3 | 관심 아파트 가격 변동 알림 |

---

## 배포 전 체크리스트

- [ ] `.env` 파일에 `VITE_CLERK_PUBLISHABLE_KEY` 설정
- [ ] 백엔드 `.env`에 `CLERK_SECRET_KEY` 설정
- [ ] Redis 서버 실행 확인
- [ ] PostgreSQL `pg_trgm` 확장 활성화 확인
- [ ] 마이그레이션 SQL 실행 (`20260122_add_search_indexes.sql`)
- [ ] 프론트엔드 빌드 테스트 (`npm run build`)
- [ ] API 엔드포인트 CORS 설정 확인

---

## 2026-01-22 추가 수정 사항

### 1. my-properties 500 에러 수정

**문제:**
```
GET /api/v1/my-properties?skip=0&limit=100 500 (Internal Server Error)
column apart_details.jibun_bonbun does not exist
```

**원인:**
- `ApartDetail` 모델에 `jibun_bonbun`, `jibun_bubun` 컬럼이 정의되어 있으나 실제 DB에는 없음

**수정:**
- `backend/app/models/apart_detail.py`에서 해당 컬럼 정의 제거

### 2. 검색 API 500 에러 수정

**문제:**
```
GET /api/v1/search/apartments?q=강남&limit=10 500 (Internal Server Error)
TypeError: Function.__init__() got an unexpected keyword argument 'else_'
```

**원인:**
- SQLAlchemy의 `func.case()` 대신 `case()` 함수를 사용해야 함

**수정:**
```python
# backend/app/services/search.py
from sqlalchemy import case

case(
    (condition, value),
    else_=1
)
```

### 3. 아파트 비교 분석 - 검색 결과 "더 보기" 기능 추가

**수정 파일:** `frontend-test/components/views/Comparison.tsx`

**변경 내용:**
- 검색 결과를 15개씩 로드 (기존 10개)
- "더 보기" 버튼 추가: 15개씩 추가 로드
- `hasMoreResults` 상태로 추가 결과 여부 확인
- 로딩 상태 표시 (RefreshCw 아이콘 + 애니메이션)

### 4. 지역 대비 수익률 비교 차트 - 실제 데이터 연결

**수정 파일:**
- `frontend-test/components/RegionComparisonChart.tsx`
- `frontend-test/components/views/Dashboard.tsx`

**변경 내용:**
- `RegionComparisonChart`에 `data`, `isLoading` props 추가
- 데이터 없을 때 "등록된 자산이 없습니다" 메시지 표시
- Dashboard에서 내 자산 데이터 기반으로 지역별 수익률 계산
- `index_change_rate` 값을 사용하여 차트 데이터 생성

### 5. 내 자산 포트폴리오 원 그래프 - 실제 데이터 연결

**수정 파일:** `frontend-test/components/ProfileWidgetsCard.tsx`

**변경 내용:**
- 더미 데이터(`myAssetApartments`, `favoriteApartments`) fallback 제거
- `assets` props가 비어있으면 "등록된 자산이 없습니다" 메시지 표시
- Dashboard에서 전달받은 실제 자산 데이터로 포트폴리오 렌더링

### 422 에러 (한 글자 검색)

**참고:** 검색어가 2글자 미만이면 422 에러가 발생합니다. 이는 의도된 동작입니다.
- 백엔드 검색 API에 `min_length=2` 검증 조건이 설정되어 있음
- 프론트엔드에서 "2글자 이상 입력하세요" 안내 메시지 표시됨

---

## 2026-01-22 추가 개선 사항 (2차)

### 1. apartments/compare 500 에러 수정 + "더 보기" 완료 메시지

**문제:**
```
POST /api/v1/apartments/compare 500 (Internal Server Error)
```

**원인:**
- compare API 호출 시 일부 아파트에서 에러 발생
- Redis 캐시 문제 또는 데이터 형식 불일치

**수정:**
- `Comparison.tsx`의 `enrichSearchAssets` 함수에 try-catch 추가
- compare API 호출 실패해도 검색 결과는 계속 표시
- "검색이 모두 완료되었습니다" 메시지 추가 (더 이상 결과 없을 때)

### 2. 내 자산 포트폴리오 - 지역별로 표시

**수정 파일:** `frontend-test/components/ProfileWidgetsCard.tsx`

**변경 내용:**
- 기존: 아파트 이름별 표시
- 변경: 아파트가 속한 지역(시군구)별로 그룹화하여 표시
- 지역별 총 가치 비율로 파이 차트 렌더링
- 툴팁에 지역 내 아파트 개수 및 목록 표시

### 3. 금리 지표 실제 데이터 연결

**추가된 백엔드 파일:**
- `backend/app/models/interest_rate.py` - InterestRate 모델
- `backend/app/api/v1/endpoints/interest_rates.py` - API 엔드포인트
- `backend/scripts/migrations/20260122_add_interest_rates.sql` - 마이그레이션

**API 엔드포인트:**
- `GET /api/v1/interest-rates` - 금리 지표 목록 조회
- `PUT /api/v1/interest-rates/{rate_type}` - 금리 지표 수정 (운영자용)
- `POST /api/v1/interest-rates/batch-update` - 금리 지표 일괄 수정

**프론트엔드 수정:**
- `services/api.ts`에 `fetchInterestRates()` 함수 추가
- `ProfileWidgetsCard.tsx`에서 금리 API 호출 및 실제 데이터 표시
- 로딩 상태 및 에러 처리 추가

### 4. 관심 리스트 클릭 시 실제 데이터로 이동

**수정 파일:** `frontend-test/components/views/Dashboard.tsx`

**문제:**
- 관심 리스트 아파트 클릭 시 더미 데이터 상세 페이지로 이동

**수정:**
- `onPropertyClick(prop.id)` → `onPropertyClick(prop.aptId?.toString() || prop.id)`
- 실제 `apt_id`를 사용하여 아파트 상세 정보 조회

### 5. 아파트 상세정보 버튼 통일 + 토글 기능

**수정 파일:** `frontend-test/components/views/PropertyDetail.tsx`

**변경 내용:**
- 버튼 디자인 통일 (rounded-xl, shadow-sm, 일관된 색상)
- 즐겨찾기 버튼: 토글 기능 + API 연동 (`addFavoriteApartment`/`removeFavoriteApartment`)
- 비교함 버튼: 토글 기능 + localStorage 연동
- 내 자산 버튼: 추가됨 → "내 자산 수정" + "삭제" 버튼 표시
- 100ms 내 시각적 피드백 (scale, transition)

### 6. 내 자산 추가 팝업

**수정 파일:**
- `backend/app/models/my_property.py` - 컬럼 추가
- `backend/app/schemas/my_property.py` - 스키마 업데이트
- `frontend-test/services/api.ts` - 타입 업데이트
- `frontend-test/components/views/PropertyDetail.tsx` - 팝업 모달 추가

**추가된 필드:**
- `purchase_price` (구매가, 만원)
- `loan_amount` (대출 금액, 만원)
- `purchase_date` (매입일)

**팝업 기능:**
- 별칭, 전용면적 선택
- 구매가 입력 (억원 변환 표시)
- 대출 금액 입력 (억원 변환 표시)
- 매입일 선택
- 메모 입력
- 저장/취소 버튼

### 7. 애니메이션 개선 (디자인 가이드 적용)

**수정 파일:** `frontend-test/index.html`

**Tailwind 애니메이션 확장:**
- `animate-fade-in-fast` (150ms) - 마이크로 인터랙션
- `animate-scale-in` (200ms) - 상태 변경
- `animate-bounce-in` (400ms) - 강조 효과
- `animate-stagger-1~5` - 순차적 등장
- `animate-chart-grow` (600ms) - 차트 애니메이션
- `animate-shimmer` - 로딩 효과

**CSS 클래스 추가:**
- `.btn-press` - 클릭 시 scale(0.97) 피드백
- `.btn-hover` - hover 시 translateY(-1px) 효과
- `.shimmer-loading` - 스켈레톤 로딩 효과
- `.stagger-item` - 순차 등장 애니메이션
- `.scroll-reveal` - 스크롤 기반 등장
- `.touch-feedback` - 터치 피드백

**접근성:**
- `@media (prefers-reduced-motion: reduce)` 지원
- 모션 감소 선호 사용자를 위한 대체 스타일

---

## 배포 체크리스트 업데이트

- [x] 금리 지표 테이블 마이그레이션 실행
- [x] my_properties 테이블에 구매 정보 컬럼 추가
- [ ] 운영자 금리 수정 권한 설정 (필요시)
- [ ] Redis 캐시 초기화 (변경 사항 반영)

---

## 2026-01-22 폴더 구조 변경

### 폴더 이름 변경

| 변경 전 | 변경 후 | 설명 |
|---------|---------|------|
| `frontend-test/` | `frontend/` | 메인 프론트엔드 폴더로 승격 |
| `frontend/` | `frontend-legacy/` | 기존 레거시 프론트엔드 보관 |

### Docker 설정 업데이트

**수정 파일:** `docker-compose.yml`

**변경 내용:**
- `frontend-dev` 서비스: `context: ./frontend-test` → `context: ./frontend`
- `frontend-prod` 서비스: `context: ./frontend-test` → `context: ./frontend`
- 볼륨 마운트: `./frontend-test:/app` → `./frontend:/app`

### 실행 방법

```bash
# 개발 서버 실행
docker-compose up -d frontend-dev

# 프로덕션 서버 실행
docker-compose up -d frontend-prod

# 재빌드 필요시
docker-compose up -d --build frontend-dev
```

### 참고사항

- `frontend-legacy/` 폴더는 참조용으로 보관됨
- 새로운 기능 개발은 모두 `frontend/` 폴더에서 진행
- `move_report.md` 내 기존 `frontend-test/` 경로 언급은 히스토리 보존 목적으로 유지
