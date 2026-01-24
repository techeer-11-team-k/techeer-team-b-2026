#!/usr/bin/env python3
"""
데이터베이스 테이블 생성 스크립트

SQLAlchemy 모델을 기반으로 데이터베이스 테이블을 생성합니다.

사용법:
    # Docker 컨테이너에서 실행
    docker exec -it realestate-backend python /app/scripts/create_tables.py
    
    # 로컬에서 실행
    python backend/scripts/create_tables.py
"""
import asyncio
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
script_path = Path(__file__).resolve()
if script_path.parts[0] == '/app':
    project_root = Path('/app')
else:
    project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings
from app.db.base import Base

# 모든 모델을 import하여 SQLAlchemy가 인식하도록 함
from app.models import (  # noqa: F401
    state,
    apartment,
    apart_detail,
    account,
    sale,
    rent,
    favorite,
    my_property,
    house_score,
    population_movement,
)


async def create_tables():
    """데이터베이스 테이블 생성"""
    print("=" * 60)
    print("🔄 데이터베이스 테이블 생성 시작...")
    print(f"📍 DB URL: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else 'N/A'}")
    print("=" * 60)
    
    # 엔진 생성
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    
    try:
        # 테이블 생성
        print("📦 SQLAlchemy 모델을 기반으로 테이블 생성 중...")
        async with engine.begin() as conn:
            # 모든 테이블 생성
            await conn.run_sync(Base.metadata.create_all)
        
        print("✅ 테이블 생성 완료!")
        print("=" * 60)
        
        # 생성된 테이블 목록 확인
        from sqlalchemy import text
        async with engine.connect() as conn:
            result = await conn.execute(text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename
            """))
            tables = [row[0] for row in result.fetchall()]
            print(f"\n📋 생성된 테이블 ({len(tables)}개):")
            for table in tables:
                print(f"   - {table}")
        
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"❌ 테이블 생성 실패: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await engine.dispose()


if __name__ == "__main__":
    success = asyncio.run(create_tables())
    sys.exit(0 if success else 1)
