# ============================================================
# 🚀 FastAPI 애플리케이션 진입점
# ============================================================
"""
FastAPI 애플리케이션 메인 파일

이 파일이 FastAPI 앱의 시작점입니다.
"""

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.redis import get_redis_client, close_redis_client

# SQLAlchemy 관계(relationship) 초기화를 위해 모든 모델 import
# 문자열로 참조된 모델 클래스들이 SQLAlchemy 레지스트리에 등록되도록 함
from app.models import (  # noqa: F401
    account,
    apartment,
    apart_detail,
    favorite,
    my_property,
    state,
    sale,
    rent,
    house_score,
)


# FastAPI 앱 생성
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="부동산 데이터 분석 및 시각화 서비스 API",
    docs_url="/docs",
    redoc_url="/redoc",
)


# OpenAPI 스키마 커스터마이징 - Swagger UI에서 Bearer 토큰 인증 추가
def custom_openapi():
    """
    OpenAPI 스키마를 커스터마이징하여 Swagger UI에서 Bearer 토큰 인증을 사용할 수 있도록 설정
    
    Swagger UI에서 "Authorize" 버튼을 클릭하여 Bearer 토큰을 입력할 수 있습니다.
    """
    if app.openapi_schema:
        return app.openapi_schema
    
    from fastapi.openapi.utils import get_openapi
    
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    
    # components가 없으면 생성
    if "components" not in openapi_schema:
        openapi_schema["components"] = {}
    
    # Security scheme 추가 (Bearer 토큰 인증)
    openapi_schema["components"]["securitySchemes"] = {
        "Bearer": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Clerk 인증 토큰을 입력하세요. 형식: Bearer {token}"
        }
    }
    
    # 인증이 필요한 경로에 security 명시적으로 추가
    # get_current_user를 사용하는 엔드포인트에 security 추가
    paths = openapi_schema.get("paths", {})
    
    # 인증이 필요한 경로 패턴 (명시적으로 지정)
    auth_required_paths = [
        "/api/v1/search/recent",
        "/api/v1/search/recent/{search_id}",
        "/api/v1/favorites",
        "/api/v1/my-properties",
        "/api/v1/auth/me",
    ]
    
    for path, methods in paths.items():
        # 경로 패턴 매칭 (부분 일치)
        needs_auth = any(auth_path in path for auth_path in auth_required_paths)
        
        for method_name, method_info in methods.items():
            if isinstance(method_info, dict):
                # dependencies에 get_current_user가 있는 경우
                dependencies = method_info.get("dependencies", [])
                has_auth_dep = any(
                    "get_current_user" in str(dep) or "Bearer" in str(dep)
                    for dep in dependencies
                )
                
                # security가 없고 인증이 필요한 경우 추가
                if (needs_auth or has_auth_dep) and "security" not in method_info:
                    method_info["security"] = [{"Bearer": []}]
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema


# OpenAPI 스키마 함수 등록
app.openapi = custom_openapi

# CORS 미들웨어 설정
# 모든 응답에 Access-Control-Allow-Origin 헤더를 명시적으로 추가
if settings.ALLOWED_ORIGINS:
    origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,  # 허용할 출처 목록
        allow_credentials=True,  # 쿠키/인증 정보 포함 허용
        allow_methods=["*"],  # 모든 HTTP 메서드 허용 (GET, POST, PUT, DELETE 등)
        allow_headers=["*"],  # 모든 헤더 허용 (Authorization, Content-Type 등)
        expose_headers=["*"],  # 클라이언트에서 접근 가능한 응답 헤더
    )
else:
    # 개발 환경: 모든 출처 허용 (프로덕션에서는 사용하지 마세요!)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 모든 출처 허용
        allow_credentials=False,  # allow_origins=["*"]일 때는 False여야 함
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )


# CORS 헤더를 명시적으로 추가하는 미들웨어 (에러 응답에도 적용)
class CORSHeaderMiddleware(BaseHTTPMiddleware):
    """모든 응답에 CORS 헤더를 명시적으로 추가하는 미들웨어"""
    
    async def dispatch(self, request: Request, call_next):
        # Origin 헤더 확인
        origin = request.headers.get("origin")
        
        # 허용된 출처인지 확인
        allowed_origins = []
        if settings.ALLOWED_ORIGINS:
            allowed_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]
        
        try:
            # 응답 처리
            response = await call_next(request)
        except Exception as e:
            # 에러 발생 시에도 CORS 헤더가 포함된 응답 반환
            from fastapi.responses import JSONResponse
            response = JSONResponse(
                status_code=500,
                content={"detail": {"code": "INTERNAL_SERVER_ERROR", "message": str(e)}}
            )
        
        # CORS 헤더 추가 (에러 응답에도 적용)
        if origin and origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        elif not settings.ALLOWED_ORIGINS:
            # 개발 환경: 모든 출처 허용
            response.headers["Access-Control-Allow-Origin"] = "*"
        else:
            # 기본적으로 첫 번째 허용된 출처 사용
            if allowed_origins:
                response.headers["Access-Control-Allow-Origin"] = allowed_origins[0]
        
        # 추가 CORS 헤더
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        response.headers["Access-Control-Expose-Headers"] = "*"
        
        return response

# CORS 헤더 미들웨어 추가 (CORSMiddleware 다음에 추가)
app.add_middleware(CORSHeaderMiddleware)


# 전역 예외 핸들러: 모든 에러 응답에 CORS 헤더 추가
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """전역 예외 핸들러 - 모든 에러에 CORS 헤더 추가"""
    from fastapi.responses import JSONResponse
    import logging
    import traceback
    
    logger = logging.getLogger(__name__)
    
    # DEBUG 모드일 때만 상세 traceback 로깅
    if settings.DEBUG:
        logger.error(f"예외 발생: {str(exc)}\n{traceback.format_exc()}")
    else:
        logger.error(f"예외 발생: {str(exc)}")
    
    # Origin 헤더 확인
    origin = request.headers.get("origin")
    
    # 허용된 출처인지 확인
    allowed_origins = []
    if settings.ALLOWED_ORIGINS:
        allowed_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]
    
    # 에러 응답 생성
    response = JSONResponse(
        status_code=500,
        content={
            "detail": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": str(exc) if settings.DEBUG else "Internal server error"
            }
        }
    )
    
    # CORS 헤더 추가
    if origin and origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    elif not settings.ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = "*"
    elif allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = allowed_origins[0]
    
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
    
    return response


# ============================================================
# 데이터베이스 테이블 자동 생성 (개발 환경)
# ============================================================
@app.on_event("startup")
async def startup_event():
    """애플리케이션 시작 시 실행되는 이벤트"""
    import logging
    
    # 로깅 설정 (파일 저장 추가)
    logger = logging.getLogger()
    # 기존 핸들러 중복 방지
    if not any(isinstance(h, logging.FileHandler) for h in logger.handlers):
        file_handler = logging.FileHandler("backend.log", encoding="utf-8")
        file_handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s"))
        logger.addHandler(file_handler)
        logger.setLevel(logging.DEBUG)  # DEBUG 레벨로 변경하여 상세 로그 확인
    
    logger = logging.getLogger(__name__)
    
    # DB 초기화 로직은 docker-entrypoint-initdb.d/init_db.sql에서 처리되므로
    # 앱 시작 시점에는 스킵하거나, 연결 테스트만 수행합니다.
    # 불필요한 초기화 시도로 인한 인증 에러 방지
    
    # Redis 연결 초기화
    try:
        await get_redis_client()
        logger.info("✅ Redis 연결 초기화 완료")
    except Exception as e:
        logger.warning(f"⚠️ Redis 연결 초기화 실패 (캐싱 기능 비활성화): {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """애플리케이션 종료 시 실행되는 이벤트"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Redis 연결 종료
    try:
        await close_redis_client()
        logger.info("✅ Redis 연결 종료 완료")
    except Exception as e:
        logger.warning(f"⚠️ Redis 연결 종료 중 오류: {e}")


# ============================================================
# 라우터 등록
# ============================================================
from app.api.v1.router import api_router

app.include_router(api_router, prefix=settings.API_V1_STR)


# ============================================================
# 기본 엔드포인트
# ============================================================

@app.get("/")
async def root():
    """루트 엔드포인트"""
    return {
        "message": "부동산 데이터 분석 서비스 API",
        "version": settings.VERSION,
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """헬스 체크 엔드포인트"""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME
    }
