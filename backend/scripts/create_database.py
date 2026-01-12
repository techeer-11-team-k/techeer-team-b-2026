#!/usr/bin/env python3
"""
데이터베이스 생성 스크립트

데이터베이스가 존재하지 않으면 생성합니다.
PostgreSQL의 경우, 기본 'postgres' 데이터베이스에 연결하여 새 데이터베이스를 생성합니다.

사용법:
    python backend/scripts/create_database.py
"""
import asyncio
import sys
from pathlib import Path
from urllib.parse import urlparse, urlunparse

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings


async def create_database_if_not_exists():
    """데이터베이스가 없으면 생성"""
    print("=" * 60)
    print("🔄 데이터베이스 존재 여부 확인 중...")
    print("=" * 60)
    
    # DATABASE_URL 파싱
    parsed = urlparse(settings.DATABASE_URL.replace("+asyncpg", ""))
    db_name = parsed.path.lstrip("/")
    db_user = parsed.username or "postgres"
    db_password = parsed.password or "postgres"
    db_host = parsed.hostname or "localhost"
    db_port = parsed.port or 5432
    
    print(f"📍 데이터베이스 정보:")
    print(f"   호스트: {db_host}:{db_port}")
    print(f"   사용자: {db_user}")
    print(f"   데이터베이스: {db_name}")
    
    # 기본 'postgres' 데이터베이스에 연결 (데이터베이스 생성용)
    admin_url = urlunparse((
        parsed.scheme.replace("+asyncpg", ""),
        f"{db_user}:{db_password}@{db_host}:{db_port}",
        "/postgres",  # 기본 데이터베이스
        "",
        "",
        ""
    ))
    
    # asyncpg 드라이버 추가
    admin_url = admin_url.replace("postgresql://", "postgresql+asyncpg://")
    
    print(f"\n🔗 관리자 데이터베이스에 연결 중...")
    admin_engine = create_async_engine(admin_url, echo=False)
    
    try:
        async with admin_engine.connect() as conn:
            # 데이터베이스 존재 여부 확인
            result = await conn.execute(
                text(
                    "SELECT 1 FROM pg_database WHERE datname = :db_name"
                ).bindparams(db_name=db_name)
            )
            exists = result.scalar() is not None
            
            if exists:
                print(f"✅ 데이터베이스 '{db_name}'가 이미 존재합니다.")
                return True
            else:
                print(f"📦 데이터베이스 '{db_name}' 생성 중...")
                # autocommit 모드로 데이터베이스 생성
                await conn.execute(text("COMMIT"))  # 트랜잭션 종료
                await conn.execute(
                    text(f'CREATE DATABASE "{db_name}"')
                )
                await conn.commit()
                print(f"✅ 데이터베이스 '{db_name}' 생성 완료!")
                return True
                
    except Exception as e:
        print(f"❌ 데이터베이스 생성 실패: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await admin_engine.dispose()


if __name__ == "__main__":
    success = asyncio.run(create_database_if_not_exists())
    sys.exit(0 if success else 1)
