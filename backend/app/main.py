# ============================================================
#  FastAPI 애플리케이션 진입점
# ============================================================
"""
FastAPI 애플리케이션 메인 파일

이 파일이 FastAPI 앱의 시작점입니다.

성능 최적화 (EC2 + RDS db.t4g.micro 환경):
- 요청 타임아웃 미들웨어 (느린 요청 조기 종료)
- GZip 압축 (응답 크기 감소)
- 캐싱 헤더 (클라이언트 캐시 활용)
- 느린 요청 로깅 (성능 모니터링)
"""
import asyncio
import time
import logging

from fastapi import FastAPI, Request, Response
from fastapi.responses import ORJSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.core.config import settings
from app.core.redis import get_redis_client, close_redis_client

perf_logger = logging.getLogger("performance")

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
    house_volume,
    news,
    recent_search,
    recent_view,
    asset_activity_log,
)


# FastAPI 앱 생성
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="부동산 데이터 분석 및 시각화 서비스 API",
    docs_url="/docs",
    redoc_url="/redoc",
    default_response_class=ORJSONResponse,  # orjson 사용 (JSON 직렬화 속도 개선)
)

# ============================================================
# GZip 압축 미들웨어 (응답 크기 감소)
# ============================================================
# 500 bytes 이상의 응답을 자동으로 gzip 압축
# 평균 70-80% 크기 감소 효과
app.add_middleware(GZipMiddleware, minimum_size=500)

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


# ===== 성능 최적화 상수 =====
SLOW_REQUEST_THRESHOLD = 5.0  # 느린 요청 임계값 (초)
REQUEST_TIMEOUT = 60.0        # 요청 타임아웃 (초)


# 성능 모니터링 및 타임아웃 미들웨어
class PerformanceMiddleware(BaseHTTPMiddleware):
    """
    성능 모니터링 미들웨어
    
    기능:
    - 요청 처리 시간 측정
    - 느린 요청 로깅 (> 5초)
    - 요청 타임아웃 처리 (60초)
    """
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        path = request.url.path
        method = request.method
        
        # 정적 파일/메트릭 엔드포인트는 모니터링 스킵
        if path in ["/metrics", "/health", "/docs", "/redoc", "/openapi.json"]:
            return await call_next(request)
        
        try:
            # 타임아웃 적용 (뉴스/검색은 더 긴 타임아웃)
            timeout = REQUEST_TIMEOUT
            if "/news" in path or "/search" in path:
                timeout = 90.0  # 뉴스/검색은 90초
            
            response = await asyncio.wait_for(
                call_next(request),
                timeout=timeout
            )
            
            # 처리 시간 측정
            duration = time.time() - start_time
            
            # 느린 요청 로깅
            if duration > SLOW_REQUEST_THRESHOLD:
                perf_logger.warning(
                    f" 느린 요청: {method} {path} - {duration:.2f}초"
                )
            
            # 응답 헤더에 처리 시간 추가 (디버깅용)
            response.headers["X-Response-Time"] = f"{duration:.3f}s"
            
            return response
            
        except asyncio.TimeoutError:
            duration = time.time() - start_time
            perf_logger.error(
                f"⏱ 요청 타임아웃: {method} {path} - {duration:.2f}초 (제한: {timeout}초)"
            )
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=504,
                content={
                    "detail": {
                        "code": "GATEWAY_TIMEOUT",
                        "message": f"요청 처리 시간이 초과되었습니다 ({timeout}초)"
                    }
                }
            )
        except Exception as e:
            duration = time.time() - start_time
            perf_logger.error(
                f" 요청 처리 오류: {method} {path} - {duration:.2f}초 - {e}"
            )
            raise


# 캐싱 헤더를 추가하는 미들웨어
class CacheHeaderMiddleware(BaseHTTPMiddleware):
    """응답에 캐싱 헤더를 추가하는 미들웨어 (CORS는 CORSMiddleware에서 처리)"""
    
    async def dispatch(self, request: Request, call_next):
        # 응답 처리
        response = await call_next(request)
        
        # 캐싱 헤더 추가 (성능 최적화)
        # GET 요청에만 캐싱 적용
        if request.method == "GET":
            path = request.url.path
            
            # API 경로별 캐싱 전략 (TTL 증가)
            if "/apartments/" in path and "/detail" in path:
                # 아파트 상세 정보: 30분 캐싱
                response.headers["Cache-Control"] = "public, max-age=1800, s-maxage=1800"
            elif "/dashboard/" in path:
                # 대시보드 데이터: 10분 캐싱 (5분 → 10분)
                response.headers["Cache-Control"] = "public, max-age=600, s-maxage=600"
            elif "/search/" in path:
                # 검색 결과: 5분 캐싱 (3분 → 5분)
                response.headers["Cache-Control"] = "public, max-age=300, s-maxage=300"
            elif "/news" in path:
                # 뉴스: 30분 캐싱 (10분 → 30분)
                response.headers["Cache-Control"] = "public, max-age=1800, s-maxage=1800"
            elif "/indicators/" in path or "/interest-rates" in path:
                # 지표/금리: 1시간 캐싱
                response.headers["Cache-Control"] = "public, max-age=3600, s-maxage=3600"
            else:
                # 기본: 2분 캐싱 (1분 → 2분)
                response.headers["Cache-Control"] = "public, max-age=120, s-maxage=120"
            
            # ETag 지원 (조건부 요청)
            response.headers["Vary"] = "Accept-Encoding, Authorization"
        else:
            # POST, PUT, DELETE 등은 캐싱 안 함
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        
        return response

# 성능 모니터링 미들웨어 추가 (가장 먼저 실행되도록)
app.add_middleware(PerformanceMiddleware)

# 캐싱 헤더 미들웨어 추가
app.add_middleware(CacheHeaderMiddleware)

# ============================================================
#  Prometheus 메트릭 수집 설정
# ============================================================
# FastAPI 애플리케이션의 메트릭을 자동으로 수집합니다
# ============================================================
instrumentator = Instrumentator(
    # 기본적으로 모든 엔드포인트를 수집
    excluded_handlers=[
        "/metrics",  # Prometheus 메트릭 엔드포인트 자체는 제외
        "/health",   # 헬스 체크는 제외 (선택적)
        "/docs",     # Swagger 문서는 제외 (선택적)
        "/redoc",    # ReDoc 문서는 제외 (선택적)
    ],
)

# 메트릭 수집기 활성화
instrumentator.instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


# HTTPException 핸들러 (CORS 헤더 명시적 추가)
from fastapi import HTTPException
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTPException 핸들러 - CORS 헤더를 명시적으로 추가"""
    from fastapi.responses import JSONResponse
    
    origin = request.headers.get("origin", "*")
    
    response = JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )
    
    # CORS 헤더 명시적 추가
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    
    return response


# 전역 예외 핸들러 (CORS 헤더 명시적 추가)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """전역 예외 핸들러 - CORS 헤더를 명시적으로 추가"""
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
    origin = request.headers.get("origin", "*")
    
    # 에러 응답 생성 (CORS 헤더 명시적 추가)
    response = JSONResponse(
        status_code=500,
        content={
            "detail": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": str(exc) if settings.DEBUG else "Internal server error"
            }
        }
    )
    
    # CORS 헤더 명시적 추가 (에러 응답에도 적용)
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    
    return response


# ============================================================
# 데이터베이스 테이블 자동 생성 (개발 환경)
# ============================================================
@app.on_event("startup")
async def startup_event():
    """애플리케이션 시작 시 실행되는 이벤트"""
    import logging
    from sqlalchemy import text
    from app.db.session import AsyncSessionLocal
    
    # 로깅 설정 (콘솔 + 파일 저장)
    import sys
    logger = logging.getLogger()
    log_format = logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s")
    
    # 콘솔 핸들러 추가 (Docker 환경에서 로그 확인용)
    if not any(isinstance(h, logging.StreamHandler) for h in logger.handlers):
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(log_format)
        console_handler.setLevel(logging.INFO)
        logger.addHandler(console_handler)
    
    # 파일 핸들러 추가
    if not any(isinstance(h, logging.FileHandler) for h in logger.handlers):
        file_handler = logging.FileHandler("backend.log", encoding="utf-8")
        file_handler.setFormatter(log_format)
        logger.addHandler(file_handler)
    
    logger.setLevel(logging.INFO)
    
    logger = logging.getLogger(__name__)
    
    # DB 초기화 로직은 docker-entrypoint-initdb.d/init_db.sql에서 처리되므로
    # 앱 시작 시점에는 스킵하거나, 연결 테스트만 수행합니다.
    # 불필요한 초기화 시도로 인한 인증 에러 방지
    
    # apart_details 시퀀스 재동기화 (데이터 백업/복원 후 시퀀스 동기화)
    try:
        async with AsyncSessionLocal() as db:
            # 시퀀스를 실제 최대값 + 1로 재설정 (서브쿼리 사용으로 안전하게 처리)
            result = await db.execute(
                text("""
                    SELECT setval(
                        'apart_details_apt_detail_id_seq', 
                        COALESCE((SELECT MAX(apt_detail_id) FROM apart_details), 0) + 1, 
                        false
                    )
                """)
            )
            new_seq_val = result.scalar()
            await db.commit()
            logger.info(f" apart_details 시퀀스 재동기화 완료: 새 시퀀스값={new_seq_val}")
    except Exception as e:
        logger.warning(f" apart_details 시퀀스 재동기화 실패 (무시하고 계속 진행): {e}")
    
    # Redis 연결 초기화 (타임아웃 설정으로 블로킹 방지)
    try:
        import asyncio
        await asyncio.wait_for(get_redis_client(), timeout=10.0)
        logger.info(" Redis 연결 초기화 완료")
    except asyncio.TimeoutError:
        logger.warning(" Redis 연결 초기화 타임아웃 (캐싱 기능 비활성화, 서버는 계속 시작)")
    except Exception as e:
        logger.warning(f" Redis 연결 초기화 실패 (캐싱 기능 비활성화): {e}")
    
    # 서버 시작 시 모든 통계 데이터 캐싱 (백그라운드 태스크로 실행)
    try:
        from app.services.warmup import preload_all_statistics
        import asyncio
        # 백그라운드 태스크로 실행 (서버 시작을 블로킹하지 않음)
        asyncio.create_task(preload_all_statistics())
        logger.info(" 통계 데이터 전체 캐싱 작업 시작 (백그라운드)")
    except Exception as e:
        logger.warning(f" 통계 데이터 캐싱 작업 시작 실패 (무시하고 계속 진행): {e}")
    
    # 통계 캐시 스케줄러 시작 (매일 새벽 2시에 통계 사전 계산)
    try:
        from app.services.statistics_cache_scheduler import start_statistics_scheduler
        await start_statistics_scheduler()
        logger.info(" 통계 캐시 스케줄러가 시작되었습니다")
    except Exception as e:
        logger.warning(f" 통계 캐시 스케줄러 시작 실패 (무시하고 계속 진행): {e}")
    
    # 캐시 무효화 이벤트 리스너 등록
    try:
        from app.services.cache_invalidation import register_cache_invalidation
        register_cache_invalidation()
        logger.info(" 캐시 무효화 이벤트 리스너가 등록되었습니다")
    except Exception as e:
        logger.warning(f" 캐시 무효화 이벤트 리스너 등록 실패 (무시하고 계속 진행): {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """애플리케이션 종료 시 실행되는 이벤트"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Redis 연결 종료
    try:
        await close_redis_client()
        logger.info(" Redis 연결 종료 완료")
    except Exception as e:
        logger.warning(f" Redis 연결 종료 중 오류: {e}")


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
