"""
데이터베이스 세션 관리

비동기 SQLAlchemy 세션을 생성하고 관리합니다.

성능 최적화:
- 연결 풀 설정으로 RDS 환경에서 연결 재사용
- pool_pre_ping으로 연결 상태 확인
- pool_recycle로 stale 연결 방지
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.config import settings

# SQLAlchemy 엔진 로거 레벨을 WARNING으로 설정 (INFO 레벨의 SQL 쿼리 로그 방지)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

# 비동기 엔진 생성 - 연결 풀 최적화 설정 추가
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,  # echo는 False로 설정하고, 필요시 로거 레벨로 제어
    future=True,
    # ===== 연결 풀 설정 (RDS 환경 최적화) =====
    pool_size=10,           # 기본 연결 풀 크기 (동시 연결 수)
    max_overflow=20,        # pool_size 초과 시 추가 허용 연결 수 (최대 30개)
    pool_timeout=30,        # 연결 대기 타임아웃 (초) - 30초 후 에러
    pool_recycle=1800,      # 연결 재활용 주기 (초) - 30분마다 연결 갱신 (RDS 연결 끊김 방지)
    pool_pre_ping=True,     # 쿼리 실행 전 연결 상태 확인 (끊긴 연결 자동 재연결)
    # ===== 연결 설정 =====
    connect_args={
        "server_settings": {
            "statement_timeout": "60000",  # 쿼리 타임아웃 60초
            "lock_timeout": "30000",       # 락 타임아웃 30초
        },
        "command_timeout": 60,  # asyncpg 명령 타임아웃
    },
)

logger.info(f"✅ DB 엔진 생성 완료 - pool_size: 10, max_overflow: 20")

# 비동기 세션 팩토리
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)
