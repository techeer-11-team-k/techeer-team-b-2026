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


from app.api.v1.endpoints import auth, admin, data_collection, favorites, apartments, my_properties, admin_web

# 메인 API 라우터 생성
# 이 라우터에 모든 하위 라우터를 등록합니다
api_router = APIRouter()

# ============================================================
# 관리자 웹 패널 API
# ============================================================
api_router.include_router(
    admin_web.router,
    prefix="/admin",  # URL prefix: /api/v1/admin/database-web 등
    tags=["🛠️ Admin Web (웹 관리자)"]
)

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
    tags=["🔐 Auth (인증)"]  # Swagger UI에서 그룹화할 태그
)

# ============================================================
# 관리자 API (개발/테스트용)
# ============================================================
# 데이터베이스 조회 및 관리 기능
# ⚠️ 주의: 프로덕션 환경에서는 인증을 추가하거나 비활성화해야 합니다
#
# 엔드포인트:
# - GET    /api/v1/admin/accounts           - 모든 계정 조회
# - GET    /api/v1/admin/accounts/{id}      - 특정 계정 조회
# - DELETE /api/v1/admin/accounts/{id}     - 계정 삭제 (소프트 삭제)
# - DELETE /api/v1/admin/accounts/{id}/hard - 계정 하드 삭제 (개발용)
# - GET    /api/v1/admin/db/tables          - 테이블 목록
# - GET    /api/v1/admin/db/query           - 테이블 데이터 조회
#
# 파일 위치: app/api/v1/endpoints/admin.py
api_router.include_router(
    admin.router,
    prefix="/admin",  # URL prefix: /api/v1/admin/...
    tags=["🛠️ Admin (관리자)"]  # Swagger UI에서 그룹화할 태그
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
    tags=["📥 Data Collection (데이터 수집)"]  # Swagger UI에서 그룹화할 태그
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
    tags=["🏠 Apartment (아파트)"]
)

# ============================================================
# 검색 관련 API
# ============================================================
# 
# 엔드포인트:
# - GET    /api/v1/search/apartments        - 아파트명 검색 (자동완성)
# - GET    /api/v1/search/locations         - 지역 검색
# - GET    /api/v1/search/recent            - 최근 검색어 조회
# - DELETE /api/v1/search/recent/{id}       - 최근 검색어 삭제
#
# 파일 위치: app/api/v1/endpoints/search.py
from app.api.v1.endpoints import search
api_router.include_router(
    search.router,
    prefix="/search",
    tags=["🔍 Search (검색)"]
)


# 관심 매물/지역 API
# ============================================================
# 사용자가 관심 있는 아파트와 지역을 저장하고 관리하는 기능
# 🔒 모든 API가 로그인 필요
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
# 🔒 모든 API가 로그인 필요
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
    tags=["🏠 My Properties (내 집)"]  # Swagger UI에서 그룹화할 태그
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
#        tags=["🏠 Apartment (아파트)"]
#    )
# 
# 3. 결과: GET /api/v1/apartments/search 엔드포인트 생성됨
#
# 자세한 내용은 backend/docs/api_development.md 참고
