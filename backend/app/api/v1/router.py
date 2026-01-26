"""
API v1 라우터

모든 API 엔드포인트를 한 곳에 모아서 관리합니다.

이 파일은 FastAPI의 라우터를 통합하는 중앙 집중식 관리 파일입니다.
각 기능별로 분리된 엔드포인트 파일들을 여기서 하나로 모아서
FastAPI 앱에 등록합니다.

작동 방식:
1. 각 기능별 엔드포인트 파일 (auth.py, admin.py 등)에서 router를 정의
2. 이 파일에서 모든 router를 import
3. api_router에 각 router를 등록 (prefix와 tags 지정)
4. app/main.py에서 이 api_router를 FastAPI 앱에 등록

새로운 API를 추가하려면:
1. app/api/v1/endpoints/ 폴더에 새 파일 생성 (예: apartment.py)
2. router = APIRouter() 생성 및 엔드포인트 정의
3. 이 파일에서 import하고 include_router로 등록

참고 문서:
- backend/docs/api_router_guide.md - API 라우터 가이드 (초보자용)
- backend/docs/api_development.md - 새 API 추가 방법
"""
from fastapi import APIRouter


from app.api.v1.endpoints import auth, data_collection, favorites, apartments, my_properties, ai, news, users, dashboard, indicators, statistics, interest_rates, map, fix, asset_activity

# 메인 API 라우터 생성
# 이 라우터에 모든 하위 라우터를 등록합니다
api_router = APIRouter()

# ============================================================
# 인증 관련 API
# ============================================================
# Clerk를 사용한 사용자 인증 및 프로필 관리
# 
# 엔드포인트:
# - POST /api/v1/auth/webhook - Clerk 웹훅 (사용자 동기화)
# - GET  /api/v1/auth/me      - 내 프로필 조회
# - PATCH /api/v1/auth/me     - 내 프로필 수정
#
# 파일 위치: app/api/v1/endpoints/auth.py
api_router.include_router(
    auth.router,
    prefix="/auth",  # URL prefix: /api/v1/auth/...
    tags=[" Auth (인증)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 데이터 수집 API
# ============================================================
# 국토교통부 API에서 지역 데이터를 가져와서 데이터베이스에 저장
#
# 엔드포인트:
# - POST /api/v1/data-collection/regions - 지역 데이터 수집 및 저장
#
# 파일 위치: app/api/v1/endpoints/data-collection.py
api_router.include_router(
    data_collection.router,
    prefix="/data-collection",  # URL prefix: /api/v1/data-collection/...
    tags=[" Data Collection (데이터 수집)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 아파트 관련 API
# ============================================================
# 
# 엔드포인트:
# - GET    /api/v1/apartments/{apt_id}      - 아파트 기본 정보
# - GET    /api/v1/apartments/{apt_id}/detail  - 아파트 상세 정보
#
# 파일 위치: app/api/v1/endpoints/apartments.py
api_router.include_router(
    apartments.router,
    prefix="/apartments",
    tags=[" Apartment (아파트)"]
)

# ============================================================
# 검색 관련 API
# ============================================================
# 
# 엔드포인트:
# - GET    /api/v1/search/apartments        - 아파트명 검색 (자동완성)
# - GET    /api/v1/search/locations         - 지역 검색
# - POST   /api/v1/search/recent/s         - 최근 검색어 저장
# - GET    /api/v1/search/recent            - 최근 검색어 조회
# - DELETE /api/v1/search/recent/{id}       - 최근 검색어 삭제
#
# 파일 위치: app/api/v1/endpoints/search.py
from app.api.v1.endpoints import search
api_router.include_router(
    search.router,
    prefix="/search",
    tags=[" Search (검색)"]
)


# 관심 매물/지역 API
# ============================================================
# 사용자가 관심 있는 아파트와 지역을 저장하고 관리하는 기능
#  모든 API가 로그인 필요
#
# 엔드포인트:
# [관심 지역]
# - GET    /api/v1/favorites/locations         - 관심 지역 목록 조회
# - POST   /api/v1/favorites/locations         - 관심 지역 추가
# - DELETE /api/v1/favorites/locations/{id}    - 관심 지역 삭제
#
# [관심 아파트]
# - GET    /api/v1/favorites/apartments        - 관심 아파트 목록 조회
# - POST   /api/v1/favorites/apartments        - 관심 아파트 추가
# - DELETE /api/v1/favorites/apartments/{id}  - 관심 아파트 삭제
#
# 파일 위치: app/api/v1/endpoints/favorites.py
api_router.include_router(
    favorites.router,
    prefix="/favorites",  # URL prefix: /api/v1/favorites/...
    tags=["⭐ Favorites (즐겨찾기)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 내 집 API
# ============================================================
# 사용자가 소유한 부동산을 관리하는 기능
#  모든 API가 로그인 필요
#
# 엔드포인트:
# - GET    /api/v1/my-properties              - 내 집 목록 조회
# - POST   /api/v1/my-properties               - 내 집 등록
# - GET    /api/v1/my-properties/{id}          - 내 집 상세 조회
# - DELETE /api/v1/my-properties/{id}          - 내 집 삭제
#
# 파일 위치: app/api/v1/endpoints/my_properties.py
api_router.include_router(
    my_properties.router,
    prefix="/my-properties",  # URL prefix: /api/v1/my-properties/...
    tags=[" My Properties (내 집)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 지표 API
# ============================================================
# 부동산 지표 관련 조회 기능
#
# 엔드포인트:
# - GET /api/v1/indicators/house-scores/{region_id}/{base_ym} - 부동산 지수 조회
#
# 파일 위치: app/api/v1/endpoints/indicators.py
api_router.include_router(
    indicators.router,
    prefix="/indicators",  # URL prefix: /api/v1/indicators/...
    tags=[" Indicators (지표)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 사용자 관련 API
# ============================================================
# 사용자의 최근 본 아파트 목록 조회 기능
#  모든 API가 로그인 필요
#
# 엔드포인트:
# - GET    /api/v1/users/me/recent-views    - 최근 본 아파트 목록 조회
#
# 파일 위치: app/api/v1/endpoints/users.py
api_router.include_router(
    users.router,
    prefix="/users",  # URL prefix: /api/v1/users/...
    tags=[" Users (사용자)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 대시보드 API
# ============================================================
# 전국 평당가 및 거래량 추이, 랭킹 데이터 조회
#
# 엔드포인트:
# - GET    /api/v1/dashboard/summary           - 대시보드 요약 데이터 조회
# - GET    /api/v1/dashboard/rankings          - 대시보드 랭킹 데이터 조회
#
# 파일 위치: app/api/v1/endpoints/dashboard.py
api_router.include_router(
    dashboard.router,
    prefix="/dashboard",  # URL prefix: /api/v1/dashboard/...
    tags=[" Dashboard (대시보드)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# AI (인공지능) API
# ============================================================
# AI를 사용한 다양한 기능 제공
#
# 엔드포인트:
# - POST   /api/v1/ai/summary/my-property     - 내 집 칭찬글 생성
# - POST   /api/v1/ai/summary/apartment        - 아파트 정보 요약
# - POST   /api/v1/ai/summary/news             - 뉴스 요약
# - POST   /api/v1/ai/search                   - AI 조건 기반 아파트 탐색
#
# 파일 위치: app/api/v1/endpoints/ai.py
api_router.include_router(
    ai.router,
    prefix="/ai",  # URL prefix: /api/v1/ai/...
    tags=[" AI (인공지능)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 뉴스 API
# ============================================================
# 부동산 뉴스 크롤링 및 조회
#
# 엔드포인트:
# - GET    /api/v1/news                        - 뉴스 목록 조회
# - GET    /api/v1/news/detail                 - 뉴스 상세 조회
#
# 파일 위치: app/api/v1/endpoints/news.py
api_router.include_router(
    news.router,
    prefix="/news",  # URL prefix: /api/v1/news/...
    tags=[" News (뉴스)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 통계 API
# ============================================================
# RVOL(상대 거래량) 및 4분면 분류 통계
#
# 엔드포인트:
# - GET    /api/v1/statistics/rvol            - RVOL 조회
# - GET    /api/v1/statistics/quadrant         - 4분면 분류 조회
# - GET    /api/v1/statistics/summary          - 통계 요약 조회
#
# 파일 위치: app/api/v1/endpoints/statistics.py
api_router.include_router(
    statistics.router,
    prefix="/statistics",  # URL prefix: /api/v1/statistics/...
    tags=[" Statistics (통계)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 금리 지표 API
# ============================================================
# 금리 정보 조회 및 관리
#
# 엔드포인트:
# - GET    /api/v1/interest-rates           - 금리 지표 목록 조회
# - PUT    /api/v1/interest-rates/{type}    - 금리 지표 수정 (운영자용)
# - POST   /api/v1/interest-rates/batch-update - 금리 지표 일괄 수정
#
# 파일 위치: app/api/v1/endpoints/interest_rates.py
api_router.include_router(
    interest_rates.router,
    prefix="/interest-rates",  # URL prefix: /api/v1/interest-rates/...
    tags=[" Interest Rates (금리 지표)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 지도 API
# ============================================================
# 지도 영역 기반 데이터 조회
#
# 엔드포인트:
# - POST   /api/v1/map/bounds            - 지도 영역 기반 데이터 조회
# - GET    /api/v1/map/regions/prices    - 전체 지역 평균 가격 조회
# - GET    /api/v1/map/apartments/nearby - 주변 아파트 조회
#
# 파일 위치: app/api/v1/endpoints/map.py
api_router.include_router(
    map.router,
    prefix="/map",  # URL prefix: /api/v1/map/...
    tags=["Map"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# Fix (에러 보정) API
# ============================================================
# 특정 아파트 매매/전월세 초기화 후 재수집 (에러 fix)
#
# 엔드포인트:
# - POST /api/v1/fix/apartment-transactions - 아파트 매매/전월세 초기화 후 재수집
#
# 파일 위치: app/api/v1/endpoints/fix.py
api_router.include_router(
    fix.router,
    prefix="/fix",
    tags=[" Fix (에러 보정)"]
)

# ============================================================
# 자산 활동 로그 API
# ============================================================
# 사용자의 아파트 추가/삭제 및 가격 변동 이력 조회
#  모든 API가 로그인 필요
#
# 엔드포인트:
# - GET    /api/v1/asset-activity              - 활동 로그 조회
#
# 파일 위치: app/api/v1/endpoints/asset_activity.py
api_router.include_router(
    asset_activity.router,
    prefix="/asset-activity",  # URL prefix: /api/v1/asset-activity/...
    tags=[" Asset Activity (자산 활동)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 새 API 추가 예시
# ============================================================
# 
# 1. app/api/v1/endpoints/apartment.py 파일 생성
# 
#    from fastapi import APIRouter
#    router = APIRouter()
#    
#    @router.get("/search")
#    async def search_apartments():
#        return {"message": "검색 결과"}
# 
# 2. 이 파일에서 import하고 등록
# 
#    from app.api.v1.endpoints import apartment
#    
#    api_router.include_router(
#        apartment.router,
#        prefix="/apartments",
#        tags=[" Apartment (아파트)"]
#    )
# 
# 3. 결과: GET /api/v1/apartments/search 엔드포인트 생성됨
#
# 자세한 내용은 backend/docs/api_development.md 참고