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
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text
    from urllib.parse import urlparse, urlunparse
    
    logger = logging.getLogger(__name__)
    
    # 개발 환경에서만 테이블 자동 생성
    if settings.ENVIRONMENT == "development" or settings.DEBUG:
        try:
            # 먼저 데이터베이스가 존재하는지 확인하고 없으면 생성
            try:
                engine = create_async_engine(settings.DATABASE_URL, echo=False)
                async with engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
                await engine.dispose()
            except Exception as db_error:
                error_msg = str(db_error).lower()
                if "does not exist" in error_msg or "database" in error_msg:
                    logger.warning(f"⚠️ 데이터베이스가 존재하지 않습니다. 생성 시도...")
                    # 데이터베이스 생성 시도
                    parsed = urlparse(settings.DATABASE_URL.replace("+asyncpg", ""))
                    db_name = parsed.path.lstrip("/")
                    db_user = parsed.username or "postgres"
                    db_password = parsed.password or "postgres"
                    db_host = parsed.hostname or "localhost"
                    db_port = parsed.port or 5432
                    
                    # 기본 'postgres' 데이터베이스에 연결하여 새 데이터베이스 생성
                    admin_url = urlunparse((
                        parsed.scheme.replace("+asyncpg", ""),
                        f"{db_user}:{db_password}@{db_host}:{db_port}",
                        "/postgres",
                        "",
                        "",
                        ""
                    )).replace("postgresql://", "postgresql+asyncpg://")
                    
                    admin_engine = create_async_engine(admin_url, echo=False, isolation_level="AUTOCOMMIT")
                    try:
                        async with admin_engine.connect() as admin_conn:
                            # 데이터베이스 존재 여부 확인
                            result = await admin_conn.execute(
                                text("SELECT 1 FROM pg_database WHERE datname = :db_name").bindparams(db_name=db_name)
                            )
                            exists = result.scalar() is not None
                            
                            if not exists:
                                await admin_conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                                logger.info(f"✅ 데이터베이스 '{db_name}' 생성 완료!")
                            else:
                                logger.info(f"ℹ️ 데이터베이스 '{db_name}'가 이미 존재합니다.")
                    finally:
                        await admin_engine.dispose()
                else:
                    raise db_error
            
            # 이제 데이터베이스에 연결하여 테이블 생성
            engine = create_async_engine(settings.DATABASE_URL, echo=False)
            
            # 테이블 존재 여부 확인 (비동기 방식)
            async with engine.connect() as conn:
                # 비동기 컨텍스트에서 테이블 목록 조회
                result = await conn.execute(text("""
                    SELECT tablename 
                    FROM pg_tables 
                    WHERE schemaname = 'public'
                """))
                existing_tables = [row[0] for row in result.fetchall()]
                
                # accounts 테이블이 없으면 SQL 파일로 초기화 시도
                if not existing_tables or 'accounts' not in [t.lower() for t in existing_tables]:
                    logger.info("🔄 테이블이 없습니다. SQL 파일로 초기화 시도...")
                    try:
                        from pathlib import Path
                        sql_file = Path(__file__).parent.parent / "scripts" / "init_schema.sql"
                        
                        if sql_file.exists():
                            with open(sql_file, 'r', encoding='utf-8') as f:
                                sql_content = f.read()
                            
                            # SQL 실행 (간단한 파싱)
                            statements = [s.strip() for s in sql_content.split(';') if s.strip() and not s.strip().startswith('--')]
                            
                            async with engine.begin() as trans_conn:
                                for statement in statements:
                                    if statement:
                                        try:
                                            await trans_conn.execute(text(statement))
                                        except Exception as e:
                                            # 이미 존재하는 객체는 무시
                                            if 'already exists' not in str(e).lower():
                                                logger.warning(f"SQL 실행 중 오류 (무시됨): {e}")
                            
                            logger.info("✅ SQL 파일로 데이터베이스 초기화 완료!")
                        else:
                            logger.warning(f"⚠️ SQL 파일을 찾을 수 없습니다: {sql_file}")
                            # SQLAlchemy 모델로 폴백
                            from app.db.base import Base
                            from app.models.account import Account  # 모든 모델 import
                            
                            async with engine.begin() as conn:
                                await conn.run_sync(Base.metadata.create_all)
                            logger.info("✅ SQLAlchemy 모델로 테이블 생성 완료!")
                    except Exception as sql_error:
                        logger.warning(f"⚠️ SQL 초기화 실패, SQLAlchemy 모델로 폴백: {sql_error}")
                        # SQLAlchemy 모델로 폴백
                        from app.db.base import Base
                        from app.models.account import Account
                        
                        async with engine.begin() as conn:
                            await conn.run_sync(Base.metadata.create_all)
                        logger.info("✅ SQLAlchemy 모델로 테이블 생성 완료!")
                else:
                    logger.info("ℹ️  데이터베이스 테이블이 이미 존재합니다.")
            
            await engine.dispose()
        except Exception as e:
            logger.warning(f"⚠️ 데이터베이스 테이블 생성 실패 (이미 존재할 수 있음): {e}")


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
