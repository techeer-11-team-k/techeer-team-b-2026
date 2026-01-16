"""
데이터베이스 세션 관리

비동기 SQLAlchemy 세션을 생성하고 관리합니다.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.config import settings

# SQLAlchemy 엔진 로거 레벨을 WARNING으로 설정 (INFO 레벨의 SQL 쿼리 로그 방지)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

# 비동기 엔진 생성
# 연결 풀 설정: 데이터 수집 시 많은 동시 연결이 필요하므로 풀 크기 증가
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,  # echo는 False로 설정하고, 필요시 로거 레벨로 제어
    future=True,
    pool_size=20,  # 기본 연결 풀 크기 (기본값: 5)
    max_overflow=30,  # 추가 연결 가능 개수 (기본값: 10)
    pool_timeout=60,  # 연결 대기 타임아웃 (초)
    pool_recycle=3600,  # 연결 재사용 시간 (1시간)
    pool_pre_ping=True  # 연결 유효성 사전 확인
)

# 비동기 세션 팩토리
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)
