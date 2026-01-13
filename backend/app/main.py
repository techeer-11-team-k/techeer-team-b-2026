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
