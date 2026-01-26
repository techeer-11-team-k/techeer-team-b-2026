#!/usr/bin/env python3
"""
dashboard_bottom_panel_view 컬럼 추가 스크립트

이 스크립트는 accounts 테이블에 dashboard_bottom_panel_view 컬럼이 없을 때
자동으로 추가합니다.

사용법:
    # Docker 컨테이너에서 실행
    docker-compose exec backend python /app/scripts/fix_dashboard_bottom_panel_view.py
    
    # 로컬에서 실행
    python backend/scripts/fix_dashboard_bottom_panel_view.py
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
from sqlalchemy import text


async def get_database_url():
    """데이터베이스 URL 가져오기"""
    try:
        from app.core.config import settings
        return settings.DATABASE_URL
    except Exception:
        import os
        return os.environ.get('DATABASE_URL', '')


async def check_column_exists(engine):
    """컬럼이 존재하는지 확인"""
    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'accounts' 
            AND column_name = 'dashboard_bottom_panel_view'
        """))
        return result.fetchone() is not None


async def add_column(engine):
    """컬럼 추가"""
    async with engine.begin() as conn:
        # 컬럼 추가 (IF NOT EXISTS로 안전하게)
        await conn.execute(text("""
            ALTER TABLE accounts
            ADD COLUMN IF NOT EXISTS dashboard_bottom_panel_view VARCHAR(32) NOT NULL DEFAULT 'regionComparison'
        """))
        
        # 컬럼 코멘트 추가
        await conn.execute(text("""
            COMMENT ON COLUMN accounts.dashboard_bottom_panel_view IS 
            '대시보드 하단 우측 카드 뷰 (policyNews|transactionVolume|marketPhase|regionComparison)'
        """))


async def fix_column():
    """컬럼 추가 스크립트 실행"""
    print("=" * 60)
    print(" dashboard_bottom_panel_view 컬럼 추가 스크립트")
    print("=" * 60)
    
    # 데이터베이스 연결
    database_url = await get_database_url()
    if not database_url:
        print("❌ DATABASE_URL이 설정되지 않았습니다.")
        return False
    
    engine = create_async_engine(database_url, echo=False)
    
    try:
        # 컬럼 존재 여부 확인
        print("\n📋 컬럼 존재 여부 확인 중...")
        exists = await check_column_exists(engine)
        
        if exists:
            print("✅ 컬럼이 이미 존재합니다. 작업이 필요하지 않습니다.")
            return True
        
        # 컬럼 추가
        print("🔧 컬럼 추가 중...")
        await add_column(engine)
        print("✅ 컬럼 추가 완료!")
        
        # 다시 확인
        exists = await check_column_exists(engine)
        if exists:
            print("✅ 확인: 컬럼이 성공적으로 추가되었습니다.")
            return True
        else:
            print("❌ 오류: 컬럼 추가 후에도 컬럼이 보이지 않습니다.")
            return False
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await engine.dispose()


if __name__ == "__main__":
    success = asyncio.run(fix_column())
    sys.exit(0 if success else 1)
