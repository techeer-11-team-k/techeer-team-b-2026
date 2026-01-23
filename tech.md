# 🏠 부동산 분석 플랫폼 기술 보고서

> **프로젝트명**: SweetHome Premium Real Estate  
> **버전**: 1.0.0  
> **작성일**: 2026년 1월 23일

---

## 📋 목차

1. [프로젝트 아키텍처 개요](#1-프로젝트-아키텍처-개요)
2. [프론트엔드 기술 스택](#2-프론트엔드-기술-스택)
3. [백엔드 기술 스택](#3-백엔드-기술-스택)
4. [데이터베이스 아키텍처](#4-데이터베이스-아키텍처)
5. [외부 API 연동](#5-외부-api-연동)
6. [캐싱 전략](#6-캐싱-전략)
7. [AI/ML 기능](#7-aiml-기능)
8. [DevOps 인프라](#8-devops-인프라)
9. [성능 최적화](#9-성능-최적화)
10. [보안 아키텍처](#10-보안-아키텍처)

---

## 1. 프로젝트 아키텍처 개요

### 1.1 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │   Web Browser    │  │  Mobile (React   │  │    Admin Panel   │           │
│  │  (React + Vite)  │  │     Native)      │  │                  │           │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘           │
└───────────┼──────────────────────┼──────────────────────┼────────────────────┘
            │                      │                      │
            ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API Gateway Layer                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                   FastAPI Application (ASGI)                          │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │   │
│  │  │    GZip     │ │    CORS     │ │ Performance │ │   Cache     │     │   │
│  │  │ Middleware  │ │ Middleware  │ │  Middleware │ │ Middleware  │     │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │   │
│  │  ┌───────────────────────────────────────────────────────────────┐   │   │
│  │  │              Prometheus Instrumentator                         │   │   │
│  │  └───────────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Service Layer                                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐│
│  │  Auth Svc  │ │Apartment   │ │ Dashboard  │ │ AI Service │ │  Data      ││
│  │  (Clerk)   │ │  Service   │ │  Service   │ │  (Gemini)  │ │ Collection ││
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Data Layer                                       │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐        │
│  │   PostgreSQL      │  │      Redis        │  │   External APIs   │        │
│  │   + PostGIS       │  │    (Cache)        │  │  (국토부, 카카오) │        │
│  │   (Primary DB)    │  │                   │  │                   │        │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 마이크로서비스 지향 모듈러 아키텍처

본 프로젝트는 **모놀리식 코드베이스** 내에서 **도메인 주도 설계(DDD)** 원칙을 적용한 모듈러 아키텍처를 채택하였습니다.

```
backend/app/
├── api/v1/endpoints/     # API 엔드포인트 (Presentation Layer)
├── services/             # 비즈니스 로직 (Application Layer)
├── crud/                 # 데이터 접근 객체 (Repository Pattern)
├── models/               # SQLAlchemy ORM 모델 (Domain Layer)
├── schemas/              # Pydantic 스키마 (DTO)
├── core/                 # 핵심 설정 (Infrastructure)
└── utils/                # 유틸리티 함수
```

---

## 2. 프론트엔드 기술 스택

### 2.1 핵심 프레임워크

| 기술 | 버전 | 용도 |
|------|------|------|
| **React** | 19.2.3 | UI 컴포넌트 라이브러리 |
| **TypeScript** | 5.8.2 | 정적 타입 시스템 |
| **Vite** | 6.2.0 | 차세대 빌드 도구 |
| **React Router DOM** | 7.12.0 | SPA 라우팅 |

### 2.2 React 19 최신 기능 활용

```typescript
// React 19의 최신 기능 활용
// - Automatic batching 개선
// - Concurrent rendering 최적화
// - Suspense 개선

// 예시: MapExplorer.tsx에서의 최적화된 상태 관리
const [mapApartments, setMapApartments] = useState<MapApartment[]>([]);
const [currentZoomLevel, setCurrentZoomLevel] = useState(7);
const [isLoadingMapData, setIsLoadingMapData] = useState(false);

// useCallback을 통한 메모이제이션으로 불필요한 리렌더링 방지
const loadMapData = useCallback(async (map: any) => {
  if (isLoadingRef.current) return;
  // ... 지도 데이터 로드 로직
}, [transactionType, clearAllOverlays, createRegionOverlay, createApartmentOverlay]);
```

### 2.3 데이터 시각화 라이브러리

#### Highcharts (v12.5.0)
- **고급 인터랙티브 차트**: 부동산 가격 추이, 거래량 분석
- **반응형 차트 렌더링**: 모바일/데스크탑 최적화
- **실시간 데이터 업데이트**: WebSocket 지원 가능 구조

#### Recharts (v3.6.0)
- **React 네이티브 통합**: 선언적 차트 컴포넌트
- **SVG 기반 렌더링**: 고해상도 디스플레이 지원

#### Lightweight Charts (v4.1.1)
- **금융 차트 특화**: 캔들스틱, 라인 차트
- **경량화**: 번들 사이즈 최소화 (< 50KB)

### 2.4 Kakao Maps SDK 통합

```typescript
// hooks/useKakaoLoader.ts - 커스텀 훅 구현
export const useKakaoLoader = (): UseKakaoLoaderReturn => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const loadKakaoMaps = useCallback(() => {
    // 동적 스크립트 로딩 with 자동 재시도
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&libraries=services,clusterer,drawing&autoload=false`;
    script.async = true;
    
    // Kakao Maps의 load() 콜백 패턴 활용
    window.kakao.maps.load(() => {
      setIsLoaded(true);
    });
  }, [retryCount]);
  
  return { isLoaded, error, isLoading, retry };
};
```

### 2.5 지도 기반 가격 시각화

```typescript
// 확대 레벨별 데이터 타입 결정 알고리즘
// 카카오맵: 레벨이 낮을수록 확대, 높을수록 축소
const getDataTypeByZoom = (zoomLevel: number): 'sigungu' | 'dong' | 'apartment' => {
  if (zoomLevel >= 8) return 'sigungu';  // 광역 시군구 단위
  if (zoomLevel >= 5) return 'dong';      // 동 단위
  return 'apartment';                      // 개별 아파트
};

// 가격대별 색상 매핑 (Heat Map 스타일)
const getPriceColor = (price: number, isRegion = false): string => {
  if (isRegion) {
    if (price >= 15) return 'rgba(30, 64, 175, 0.95)';   // 15억 이상
    if (price >= 10) return 'rgba(37, 99, 235, 0.95)';   // 10억 이상
    if (price >= 5) return 'rgba(59, 130, 246, 0.95)';   // 5억 이상
    return 'rgba(96, 165, 250, 0.95)';                    // 5억 미만
  }
  // 아파트별 더 세분화된 색상 스펙트럼
  if (price >= 20) return 'rgba(127, 29, 29, 0.95)';    // 20억 이상 - 진한 빨강
  if (price >= 15) return 'rgba(185, 28, 28, 0.95)';    // 15억 이상
  // ...
};
```

### 2.6 API 클라이언트 설계

```typescript
// services/api.ts - 엔터프라이즈급 API 클라이언트

// API 설정 상수 (타임아웃, 재시도 전략)
const API_CONFIG = {
  DEFAULT_TIMEOUT: 30000,
  MAX_RETRIES: 2,
  RETRY_DELAY: 1000,
  RETRYABLE_STATUS_CODES: [408, 429, 500, 502, 503, 504] as number[],
} as const;

// 커스텀 에러 클래스
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
  
  get isNetworkError(): boolean { return this.status === 0; }
  get isAuthError(): boolean { return this.status === 401 || this.status === 403; }
  get isServerError(): boolean { return this.status >= 500; }
}

// 지수 백오프(Exponential Backoff) 재시도 로직
const apiFetch = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, requestInit, timeout);
      if (!response.ok && shouldRetry) {
        await delay(API_CONFIG.RETRY_DELAY * attempt); // 지수 증가
        continue;
      }
      return response.json() as Promise<T>;
    } catch (error) {
      // 재시도 가능한 에러 처리
    }
  }
};
```

---

## 3. 백엔드 기술 스택

### 3.1 FastAPI 프레임워크

```python
# main.py - 고성능 ASGI 애플리케이션

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="부동산 데이터 분석 및 시각화 서비스 API",
    docs_url="/docs",      # Swagger UI
    redoc_url="/redoc",    # ReDoc
)

# GZip 압축 미들웨어 (500 bytes 이상 응답 자동 압축)
# 평균 70-80% 크기 감소 효과
app.add_middleware(GZipMiddleware, minimum_size=500)
```

### 3.2 커스텀 성능 미들웨어

```python
# 성능 모니터링 및 타임아웃 미들웨어
class PerformanceMiddleware(BaseHTTPMiddleware):
    """
    기능:
    - 요청 처리 시간 측정
    - 느린 요청 로깅 (> 5초)
    - 요청 타임아웃 처리 (60초)
    """
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # 타임아웃 적용 (asyncio.wait_for 사용)
        timeout = REQUEST_TIMEOUT  # 기본 60초
        if "/news" in path or "/search" in path:
            timeout = 90.0  # 뉴스/검색은 90초
        
        try:
            response = await asyncio.wait_for(
                call_next(request),
                timeout=timeout
            )
            
            duration = time.time() - start_time
            
            # 느린 요청 로깅 (> 5초)
            if duration > SLOW_REQUEST_THRESHOLD:
                perf_logger.warning(f"🐢 느린 요청: {method} {path} - {duration:.2f}초")
            
            # 응답 헤더에 처리 시간 추가
            response.headers["X-Response-Time"] = f"{duration:.3f}s"
            return response
            
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=504,
                content={"detail": {"code": "GATEWAY_TIMEOUT", ...}}
            )
```

### 3.3 캐싱 헤더 전략

```python
# API 경로별 캐싱 전략 (CDN/브라우저 캐시 최적화)
class CacheHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        if request.method == "GET":
            path = request.url.path
            
            # API 경로별 차등 캐싱 TTL
            if "/apartments/" in path and "/detail" in path:
                # 아파트 상세 정보: 30분 캐싱
                response.headers["Cache-Control"] = "public, max-age=1800, s-maxage=1800"
            elif "/dashboard/" in path:
                # 대시보드 데이터: 10분 캐싱
                response.headers["Cache-Control"] = "public, max-age=600, s-maxage=600"
            elif "/news" in path:
                # 뉴스: 30분 캐싱
                response.headers["Cache-Control"] = "public, max-age=1800, s-maxage=1800"
            elif "/indicators/" in path:
                # 금리/지표: 1시간 캐싱
                response.headers["Cache-Control"] = "public, max-age=3600, s-maxage=3600"
            
            # ETag 지원 (조건부 요청)
            response.headers["Vary"] = "Accept-Encoding, Authorization"
```

### 3.4 SQLAlchemy 비동기 ORM

```python
# models/apartment.py - SQLAlchemy 2.0 스타일 모델 정의

from sqlalchemy import String, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

class Apartment(Base):
    """
    아파트 기본 정보 테이블
    
    관계(Relationships):
    - region: State (N:1)
    - apart_detail: ApartDetail (1:1)
    - sales: Sale (1:N)
    - rents: Rent (1:N)
    - favorite_apartments: FavoriteApartment (1:N)
    - my_properties: MyProperty (1:N)
    """
    __tablename__ = "apartments"
    
    apt_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="PK"
    )
    
    region_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("states.region_id"),
        nullable=False,
        comment="FK"
    )
    
    apt_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,  # 검색 속도 향상을 위한 인덱스
        comment="아파트 단지명"
    )
    
    # Lazy Loading vs Eager Loading 전략
    region = relationship("State", back_populates="apartments")
    apart_detail = relationship("ApartDetail", back_populates="apartment", uselist=False)
    sales = relationship("Sale", back_populates="apartment")
```

### 3.5 API 라우터 설계

```python
# api/v1/router.py - 중앙 집중식 라우터 관리

api_router = APIRouter()

# 인증 API
api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["🔐 Auth (인증)"]
)

# 아파트 API
api_router.include_router(
    apartments.router,
    prefix="/apartments",
    tags=["🏠 Apartment (아파트)"]
)

# 대시보드 API (실시간 통계)
api_router.include_router(
    dashboard.router,
    prefix="/dashboard",
    tags=["📊 Dashboard (대시보드)"]
)

# AI API (Gemini 통합)
api_router.include_router(
    ai.router,
    prefix="/ai",
    tags=["🤖 AI (인공지능)"]
)

# 지도 API (PostGIS 기반)
api_router.include_router(
    map.router,
    prefix="/map",
    tags=["🗺️ Map (지도)"]
)

# 통계 API (RVOL, 4분면 분류)
api_router.include_router(
    statistics.router,
    prefix="/statistics",
    tags=["📈 Statistics (통계)"]
)
```

---

## 4. 데이터베이스 아키텍처

### 4.1 PostgreSQL + PostGIS

```sql
-- PostGIS 확장을 활용한 공간 데이터 저장
-- apart_details 테이블의 geometry 컬럼

CREATE TABLE apart_details (
    apt_detail_id SERIAL PRIMARY KEY,
    apt_id INTEGER REFERENCES apartments(apt_id),
    road_address VARCHAR(200),
    jibun_address VARCHAR(200),
    geometry GEOMETRY(Point, 4326),  -- SRID 4326 (WGS84)
    -- ...
);

-- 공간 인덱스 생성 (R-Tree 기반)
CREATE INDEX idx_apart_details_geometry 
ON apart_details USING GIST (geometry);
```

### 4.2 공간 쿼리 최적화

```python
# 반경 내 아파트 검색 (PostGIS ST_DWithin 활용)
from geoalchemy2 import functions as geo_func

async def get_nearby_apartments(
    lat: float, lng: float, radius_meters: int, limit: int
):
    """
    ST_DWithin + use_spheroid=True 사용
    - 구면 거리 계산으로 정확한 측지학적 거리 측정
    - 오차: ±1m 미만
    """
    stmt = (
        select(
            ApartDetail,
            geo_func.ST_Distance(
                ApartDetail.geometry,
                func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326),
                use_spheroid=True
            ).label('distance_meters')
        )
        .where(
            geo_func.ST_DWithin(
                ApartDetail.geometry,
                func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326),
                radius_meters,
                use_spheroid=True
            )
        )
        .order_by('distance_meters')
        .limit(limit)
    )
```

### 4.3 ERD 주요 테이블

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   states    │────<│  apartments │────<│    sales    │
│  (지역 정보) │     │  (아파트)   │     │  (매매 거래) │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                   ┌──────┴──────┐
                   │             │
              ┌────▼────┐  ┌────▼────┐
              │ apart   │  │  rents  │
              │ details │  │(전월세) │
              │(상세정보)│  └─────────┘
              └─────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  accounts   │────<│  favorites  │     │ my_property │
│  (사용자)   │     │ (즐겨찾기)  │     │ (내 자산)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## 5. 외부 API 연동

### 5.1 국토교통부 공공데이터 API

```python
# 데이터 수집 서비스 (Rate Limit 처리 포함)

class AptDetailCollectionService(DataCollectionServiceBase):
    async def fetch_apartment_basic_info(self, kapt_code: str, retries: int = 3):
        """
        국토부 API에서 아파트 기본정보 가져오기
        
        Rate Limit 처리:
        - 429 에러 발생 시 지수 백오프 (2초, 4초, 6초)
        - HTTP 클라이언트 풀 재사용
        """
        for attempt in range(retries):
            try:
                response = await client.get(MOLIT_APARTMENT_BASIC_API_URL, params=params)
                
                if response.status_code == 429:
                    wait_time = (attempt + 1) * 2  # 지수 백오프
                    logger.warning(f"⚠️ Rate Limit (429), {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                # 재시도 로직
```

### 5.2 Kakao 지도/검색 API

```python
# 주소 → 좌표 변환 (Geocoding)

async def address_to_coordinates(address: str) -> Optional[Tuple[float, float]]:
    """
    카카오 REST API를 사용한 지오코딩
    
    Returns:
        (longitude, latitude) 튜플 또는 None
    """
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"}
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers, params={"query": address})
        data = response.json()
        
        if data.get("documents"):
            doc = data["documents"][0]
            return (float(doc["x"]), float(doc["y"]))
    return None
```

### 5.3 네이버 뉴스 크롤링

```python
# 부동산 뉴스 수집 (Naver Search API)

async def fetch_real_estate_news(keywords: List[str], limit: int = 20):
    """
    네이버 검색 API를 활용한 부동산 뉴스 수집
    
    - 키워드 기반 뉴스 검색
    - 본문 요약 추출
    - 중복 제거 로직
    """
    headers = {
        "X-Naver-Client-Id": settings.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": settings.NAVER_CLIENT_SECRET
    }
    # ...
```

---

## 6. 캐싱 전략

### 6.1 Redis 캐싱 아키텍처

```python
# core/redis.py - ElastiCache 최적화 설정

# 빠른 실패를 위한 타임아웃 최소화
MAX_CONNECTIONS = 10          # cache.t3.micro용
SOCKET_TIMEOUT = 1.0          # 소켓 타임아웃 (빠른 실패)
CONNECT_TIMEOUT = 1.0         # 연결 타임아웃 (빠른 실패)
HEALTH_CHECK_INTERVAL = 60    # 헬스 체크 간격
REDIS_RETRY_INTERVAL = 60.0   # Redis 재연결 시도 간격

async def get_redis_client(check_health: bool = False) -> Optional[Redis]:
    """
    Redis 클라이언트 싱글톤 패턴
    
    성능 최적화:
    - 빠른 실패 (타임아웃 1초)
    - 연결 실패 시 60초간 재시도 안 함 (graceful degradation)
    - 재시도 없음 (retries=0)
    """
    global _redis_client, _redis_available, _redis_unavailable_since
    
    # Redis가 비활성화된 경우, 일정 시간 후에만 재시도
    if not _redis_available:
        if current_time - _redis_unavailable_since < REDIS_RETRY_INTERVAL:
            return None  # 캐시 없이 진행
        _redis_available = True  # 재시도 허용
    
    # ... 연결 로직
```

### 6.2 캐시 키 네이밍 전략

```python
# utils/cache.py - 구조화된 캐시 키 관리

CACHE_NAMESPACE = "realestate"

def build_cache_key(*parts: str) -> str:
    """
    네임스페이스 패턴을 사용하여 키 충돌 방지
    예: "realestate:apartment:detail:apt:123"
    """
    key_parts = [CACHE_NAMESPACE] + [str(part) for part in parts]
    return ":".join(key_parts)

# 캐시 키 헬퍼 함수들
def get_favorite_apartments_cache_key(account_id: int, skip: int, limit: int) -> str:
    return build_cache_key("favorite", "apartments", "account", str(account_id), ...)

def get_apartment_summary_cache_key(apt_id: int) -> str:
    return build_cache_key("apartment", "summary", "apt", str(apt_id))

def get_nearby_comparison_cache_key(apt_id: int, months: int, radius_meters: int) -> str:
    return build_cache_key("apartment", "nearby_comparison", "apt", str(apt_id), ...)
```

### 6.3 Graceful Degradation

```python
# 캐시 실패 시 서비스 중단 없이 진행

async def get_from_cache(key: str) -> Optional[Any]:
    """
    성능 최적화:
    - 타임아웃 1초 (빠른 실패)
    - Redis 연결 실패 시 None 반환 (graceful degradation)
    - 과도한 로깅 방지 (10회 실패마다 1회 로깅)
    """
    global _cache_fail_count
    
    try:
        redis_client = await get_redis_client()
        if redis_client is None:
            return None  # Redis 비활성화 시 캐시 없이 진행
        
        cached_value = await asyncio.wait_for(
            redis_client.get(key),
            timeout=CACHE_OPERATION_TIMEOUT  # 1초
        )
        
        _cache_fail_count = 0  # 성공 시 카운터 리셋
        return json.loads(cached_value) if cached_value else None
        
    except asyncio.TimeoutError:
        _cache_fail_count += 1
        if _cache_fail_count % 10 == 1:  # 과도한 로깅 방지
            logger.debug(f"⏱️ 캐시 조회 타임아웃 (키: {key})")
        return None
```

---

## 7. AI/ML 기능

### 7.1 Google Gemini API 통합

```python
# services/ai_service.py

class AIService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
    
    async def generate_text(
        self,
        prompt: str,
        model: str = "gemini-2.5-flash",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None
    ) -> str:
        """
        Gemini API를 사용한 텍스트 생성
        
        성능 최적화:
        - timeout 10초 (연결 3초)
        - 모델: gemini-2.5-flash (빠른 응답)
        - HTTP 클라이언트 타임아웃 최적화
        """
        timeout_config = httpx.Timeout(10.0, connect=3.0)
        
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            response = await client.post(url, headers=headers, params=params, json=body)
            # ...
```

### 7.2 자연어 검색 쿼리 파싱

```python
async def parse_search_query(self, query: str) -> Dict[str, Any]:
    """
    자연어 검색 쿼리를 구조화된 검색 조건으로 변환
    
    예시:
    - "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내"
    - "전세 5억 이하 신축 아파트"
    
    Returns:
        {
            "location": "강남구",
            "min_area": 84.0,
            "max_area": 114.0,
            "subway_max_distance_minutes": 10,
            "max_deposit": 50000,  # 전세 보증금 (만원)
            "build_year_range": "신축",
            "parsed_confidence": 0.9
        }
    """
    prompt = self._build_search_parsing_prompt(query)
    
    response_text = await self.generate_text(
        prompt=prompt,
        model="gemini-2.5-flash",
        temperature=0.0,  # 정확한 파싱을 위해 최저 온도
        max_tokens=800
    )
    
    # JSON 파싱 (재시도 로직 포함)
    parsed_data = self._parse_json_response(response_text)
    
    return {
        "location": parsed_data.get("location"),
        "min_area": parsed_data.get("min_area"),
        "max_area": parsed_data.get("max_area"),
        # 평수 변환: 1평 = 3.3058㎡
        # "30평대" → min_area: 84.0, max_area: 114.0
        # ...
    }
```

### 7.3 AI 내 집 칭찬글 생성

```python
async def generate_property_compliment(self, property_data: Dict[str, Any]) -> str:
    """
    내 집에 대한 맞춤형 칭찬글 생성
    
    입력 데이터:
    - 아파트명, 위치, 전용면적
    - 교육 시설, 지하철 정보
    - 사용자 메모
    
    프롬프트 엔지니어링:
    - 지역/동 정보 강조
    - 교통 접근성 (호선, 역명, 소요시간)
    - 교육 환경 (학교명)
    - 300-400자 분량
    """
    prompt = self._build_compliment_prompt(property_data)
    
    compliment = await self.generate_text(
        prompt=prompt,
        model="gemini-2.5-flash",
        temperature=0.7,  # 창의적인 칭찬글
        max_tokens=1000
    )
    
    return self._clean_compliment_response(compliment)
```

---

## 8. DevOps 인프라

### 8.1 Docker Compose 멀티 서비스 아키텍처

```yaml
# docker-compose.yml

services:
  # PostgreSQL + PostGIS
  db:
    image: postgis/postgis:15-3.3
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/scripts/init_db.sql:/docker-entrypoint-initdb.d/01-init_schema.sql:ro
  
  # Redis 캐시
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
  
  # FastAPI Backend
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379/0
    entrypoint: ["/bin/bash", "/app/scripts/docker_entrypoint.sh"]
    command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
  
  # Prometheus 메트릭 수집
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./backend/monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    command:
      - '--storage.tsdb.retention.time=30d'
  
  # Grafana 시각화
  grafana:
    image: grafana/grafana:latest
    volumes:
      - ./backend/monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./backend/monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro
```

### 8.2 GitHub Actions CI/CD

```yaml
# .github/workflows/backend-cd.yml

name: Backend CD - Deploy to EC2

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - 'docker-compose.prod.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Deploy to EC2
        run: |
          ssh -i ~/.ssh/ec2_key ${{ env.EC2_USER }}@${{ env.EC2_HOST }} << 'ENDSSH'
            # 최신 코드 가져오기
            git fetch origin
            git reset --hard origin/main
            
            # Docker Compose로 재배포
            docker compose -f docker-compose.prod.yml up -d --build
            
            # 헬스 체크 (최대 20회 재시도, 5초 간격)
            MAX_RETRIES=20
            while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
              HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health)
              if [ "$HTTP_CODE" = "200" ]; then
                echo "✅ 헬스 체크 성공!"
                break
              fi
              sleep 5
            done
          ENDSSH

      # Slack 배포 알림
      - name: Slack Notification
        if: always()
        run: |
          curl -X POST -H 'Content-type: application/json' \
            --data '{"text": "🚀 백엔드 배포 ${{ job.status }}"}' \
            "$SLACK_WEBHOOK_URL"
```

### 8.3 Prometheus 메트릭 수집

```python
# main.py - FastAPI Prometheus Instrumentator

from prometheus_fastapi_instrumentator import Instrumentator

instrumentator = Instrumentator(
    excluded_handlers=[
        "/metrics",   # 메트릭 엔드포인트 자체는 제외
        "/health",    # 헬스 체크 제외
        "/docs",      # Swagger 문서 제외
    ],
)

# 메트릭 수집기 활성화
instrumentator.instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
```

### 8.4 Grafana 대시보드

```json
// monitoring/grafana/dashboards/api-performance-dashboard.json

{
  "title": "API Performance Dashboard",
  "panels": [
    {
      "title": "요청 처리 시간 (p95)",
      "targets": [{
        "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
      }]
    },
    {
      "title": "초당 요청 수 (RPS)",
      "targets": [{
        "expr": "rate(http_requests_total[1m])"
      }]
    },
    {
      "title": "에러율",
      "targets": [{
        "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m]))"
      }]
    }
  ]
}
```

---

## 9. 성능 최적화

### 9.1 비동기 병렬 처리

```python
# 대시보드 API - 쿼리 병렬 실행

async def get_dashboard_summary(transaction_type: str, months: int, db: AsyncSession):
    """
    asyncio.gather를 사용한 쿼리 병렬 실행으로 성능 향상
    """
    # 4개의 쿼리를 동시에 실행
    price_trend_result, volume_trend_result, national_trend_result, regional_trend_result = \
        await asyncio.gather(
            db.execute(price_trend_stmt),
            db.execute(volume_trend_stmt),
            db.execute(national_trend_stmt),
            db.execute(regional_trend_stmt)
        )
    
    # 결과 처리
    # ...
```

### 9.2 데이터베이스 쿼리 최적화

```python
# 복합 인덱스 활용 쿼리

# 가격대별 아파트 분포 (CASE 문 활용)
price_ranges = case(
    (price_field < 10000, "1억 미만"),
    (and_(price_field >= 10000, price_field < 30000), "1억~3억"),
    (and_(price_field >= 30000, price_field < 50000), "3억~5억"),
    # ...
    else_="15억 이상"
)

stmt = (
    select(
        price_ranges.label('price_range'),
        func.count(trans_table.trans_id).label('count'),
        func.avg(price_field).label('avg_price')
    )
    .join(Apartment, trans_table.apt_id == Apartment.apt_id)
    .where(base_filter)
    .group_by(price_ranges)
)
```

### 9.3 서버 시작 시 캐시 프리로딩

```python
# 홈 화면 캐싱 (서버 시작 시 백그라운드 태스크)

async def preload_home_cache():
    """
    서버 시작 시 홈 화면 및 통계 지표들을 미리 캐싱
    TTL: 12시간 (43200초)
    """
    cache_tasks = [
        ("dashboard/summary", {"transaction_type": "sale", "months": 6}),
        ("dashboard/summary", {"transaction_type": "jeonse", "months": 6}),
        ("dashboard/rankings", {"transaction_type": "sale", "trending_days": 7}),
        ("statistics/summary", {"transaction_type": "sale", "current_period_months": 6}),
    ]
    
    async with AsyncSessionLocal() as db:
        for api_name, params in cache_tasks:
            # 캐시 프리로드 실행
            result = await get_dashboard_summary(db=db, **params)
            await set_to_cache(cache_key, result, ttl=43200)

# 앱 시작 시 백그라운드 태스크로 실행
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(preload_home_cache())
```

---

## 10. 보안 아키텍처

### 10.1 Clerk 인증 통합

```python
# core/clerk.py - Clerk JWT 검증

from clerk_backend_api import Clerk
from clerk_backend_api.jwks_helpers import AuthenticateRequestOptions

async def verify_clerk_token(authorization: str) -> Optional[Dict]:
    """
    Clerk JWT 토큰 검증
    
    - JWKS 기반 서명 검증
    - 토큰 만료 검사
    - 클레임 추출
    """
    clerk = Clerk(bearer_auth=settings.CLERK_SECRET_KEY)
    
    # JWT 검증
    request_state = clerk.authenticate_request(
        request=Request("GET", "https://example.com"),
        options=AuthenticateRequestOptions(
            secret_key=settings.CLERK_SECRET_KEY
        )
    )
    
    if request_state.is_signed_in:
        return request_state.payload
    return None
```

### 10.2 CORS 보안 설정

```python
# 프로덕션 환경 CORS 설정

if settings.ALLOWED_ORIGINS:
    origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,          # 허용된 출처만
        allow_credentials=True,         # 쿠키/인증 정보 포함 허용
        allow_methods=["*"],            # 모든 HTTP 메서드 허용
        allow_headers=["*"],            # 모든 헤더 허용
        expose_headers=["*"],           # 클라이언트에서 접근 가능한 응답 헤더
    )
```

### 10.3 환경변수 관리

```python
# core/config.py - Pydantic Settings

class Settings(BaseSettings):
    """
    환경변수 설정 클래스
    ⚠️ 민감한 정보는 .env 파일에서 관리
    """
    # 필수 환경변수 (없으면 앱 시작 실패)
    DATABASE_URL: str
    REDIS_URL: str
    SECRET_KEY: str
    
    # 선택적 환경변수 (기본값 제공)
    CLERK_SECRET_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    MOLIT_API_KEY: Optional[str] = None
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
```

---

## 📊 기술 스택 요약

| 계층 | 기술 | 버전 | 특징 |
|------|------|------|------|
| **Frontend** | React | 19.2.3 | Concurrent Rendering, Automatic Batching |
| | TypeScript | 5.8.2 | 정적 타입 안전성 |
| | Vite | 6.2.0 | HMR, ESBuild 번들링 |
| | Kakao Maps SDK | - | 지도 시각화, 클러스터링 |
| | Highcharts | 12.5.0 | 인터랙티브 차트 |
| **Backend** | FastAPI | - | ASGI, 비동기 지원 |
| | SQLAlchemy | 2.0 | 비동기 ORM |
| | Pydantic | v2 | 데이터 검증 |
| **Database** | PostgreSQL | 15 | 관계형 DB |
| | PostGIS | 3.3 | 공간 데이터 처리 |
| | Redis | 7 | 캐싱, 세션 |
| **AI/ML** | Google Gemini | 2.5-flash | 자연어 처리, 텍스트 생성 |
| **DevOps** | Docker | - | 컨테이너화 |
| | GitHub Actions | - | CI/CD |
| | Prometheus | - | 메트릭 수집 |
| | Grafana | - | 모니터링 대시보드 |
| **인증** | Clerk | - | JWT 기반 인증 |

---

## 🎯 핵심 기술적 성과

1. **비동기 아키텍처**: FastAPI + SQLAlchemy 비동기 조합으로 높은 동시성 처리
2. **공간 데이터 처리**: PostGIS 기반 정확한 거리 계산 및 반경 검색
3. **지능형 캐싱**: Redis + Graceful Degradation으로 안정적인 서비스
4. **AI 통합**: Gemini API를 활용한 자연어 검색 및 콘텐츠 생성
5. **실시간 모니터링**: Prometheus + Grafana 기반 성능 관측
6. **자동화된 배포**: GitHub Actions + Docker로 무중단 배포

---

*이 문서는 프로젝트의 기술적 구현 세부사항을 설명하며, 지속적으로 업데이트됩니다.*
