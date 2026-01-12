"""
데이터베이스 테이블 생성 스크립트

SQLAlchemy 모델을 기반으로 데이터베이스 테이블을 생성합니다.
개발 환경에서만 사용하세요. 프로덕션에서는 Alembic 마이그레이션을 사용합니다.

사용법:
    python -m app.scripts.create_tables
    또는
    python backend/scripts/create_tables.py
"""
import asyncio
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine
from app.db.base import Base
from app.core.config import settings
from app.models.account import Account  # 모든 모델 import


async def create_tables():
    """데이터베이스 테이블 생성"""
    print("🔄 데이터베이스 연결 중...")
    
    # 비동기 엔진 생성
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=True,  # SQL 쿼리 출력
    )
    
    try:
        print("📦 테이블 생성 중...")
        
        # 모든 테이블 생성
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        print("✅ 테이블 생성 완료!")
        print(f"   - accounts 테이블이 생성되었습니다.")
        
    except Exception as e:
        print(f"❌ 테이블 생성 실패: {e}")
        raise
    finally:
        await engine.dispose()


if __name__ == "__main__":
    print("=" * 50)
    print("🏠 부동산 분석 플랫폼 - 테이블 생성 스크립트")
    print("=" * 50)
    print()
    
    asyncio.run(create_tables())
    
    print()
    print("=" * 50)
    print("✅ 완료!")
    print("=" * 50)
