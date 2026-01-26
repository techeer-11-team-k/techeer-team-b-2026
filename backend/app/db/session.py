"""
데이터베이스 세션 관리

비동기 SQLAlchemy 세션을 생성하고 관리합니다.

성능 최적화 (db.t4g.micro 환경):
- 연결 풀 크기를 RDS 스펙에 맞게 최적화 (1GB RAM → max_connections ~87)
- pool_pre_ping으로 연결 상태 확인
- pool_recycle로 stale 연결 방지
- 쿼리 타임아웃 단축으로 느린 쿼리 빠르게 실패
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.config import settings

# SQLAlchemy 엔진 로거 레벨을 WARNING으로 설정 (INFO 레벨의 SQL 쿼리 로그 방지)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

# ===== 성능 최적화 설정 =====
# Connection Pooling 최적화 (성능 개선 가이드 적용)
# pool_size와 max_overflow를 증가시켜 동시 요청 처리 능력 향상
POOL_SIZE = 20              # 기본 연결 풀 크기 증가 (5 → 20)
MAX_OVERFLOW = 40           # 최대 추가 연결 증가 (10 → 40, 총 60개까지)
POOL_TIMEOUT = 30           # 연결 대기 타임아웃 (초)
POOL_RECYCLE = 1800         # 연결 재활용 (30분) - 15분 → 30분으로 증가하여 재연결 오버헤드 감소
STATEMENT_TIMEOUT = 30000   # 쿼리 타임아웃 30초 (느린 쿼리 빠르게 실패)
LOCK_TIMEOUT = 10000        # 락 타임아웃 10초
COMMAND_TIMEOUT = 30        # asyncpg 명령 타임아웃 30초

# 비동기 엔진 생성 - db.t4g.micro 환경 최적화
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    # ===== 연결 풀 설정 (db.t4g.micro 최적화) =====
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_recycle=POOL_RECYCLE,
    pool_pre_ping=True,     # 쿼리 실행 전 연결 상태 확인
    # ===== 연결 설정 =====
    connect_args={
        "server_settings": {
            "statement_timeout": str(STATEMENT_TIMEOUT),  # 30초
            "lock_timeout": str(LOCK_TIMEOUT),            # 10초
            "idle_in_transaction_session_timeout": "30000",  # 트랜잭션 유휴 타임아웃 30초
            "work_mem": "4MB",                            # 쿼리별 메모리 제한 (t4g.micro용)
        },
        "command_timeout": COMMAND_TIMEOUT,
    },
)

logger.info(f" DB 엔진 생성 완료 - pool_size: {POOL_SIZE}, max_overflow: {MAX_OVERFLOW}, statement_timeout: {STATEMENT_TIMEOUT}ms")

# 비동기 세션 팩토리
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)
