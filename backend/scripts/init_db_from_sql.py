#!/usr/bin/env python3
"""
데이터베이스 초기화 스크립트 (SQL 파일 기반)

테이블이 없는 경우 SQL 파일을 실행하여 스키마를 생성합니다.
이 스크립트는 안전하게 실행할 수 있으며, 이미 테이블이 존재하면 건너뜁니다.

사용법:
    # Docker 컨테이너에서 실행 (권장)
    docker exec -it realestate-backend python /app/scripts/init_db_from_sql.py
    
    # 또는 모듈로 실행 (scripts 폴더가 마운트된 경우)
    docker exec -it realestate-backend bash -c "cd /app && python scripts/init_db_from_sql.py"
    
    # 로컬에서 실행
    python backend/scripts/init_db_from_sql.py
"""
import asyncio
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
# Docker 컨테이너 내부에서는 /app이 루트
script_path = Path(__file__).resolve()
if script_path.parts[0] == '/app':
    # Docker 컨테이너 내부
    project_root = Path('/app')
else:
    # 로컬 실행
    project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from app.core.config import settings


async def check_table_exists(engine, table_name: str) -> bool:
    """테이블이 존재하는지 확인"""
    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public' AND tablename = :table_name
        """).bindparams(table_name=table_name.lower()))
        return result.scalar() is not None


async def init_db_from_sql():
    """SQL 파일을 읽어서 데이터베이스 초기화"""
    print("=" * 60)
    print("🔄 데이터베이스 초기화 시작...")
    print(f"📍 DB URL: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else 'N/A'}")
    print("=" * 60)
    
    # SQL 파일 경로
    sql_file = Path(__file__).parent / "init_db.sql"
    
    if not sql_file.exists():
        print(f"❌ SQL 파일을 찾을 수 없습니다: {sql_file}")
        return False
    
    # 엔진 생성
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    
    try:
        # 주요 테이블 중 하나가 이미 존재하는지 확인
        async with engine.connect() as conn:
            result = await conn.execute(text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename
            """))
            existing_tables = [row[0] for row in result.fetchall()]
            
            # accounts 테이블이 이미 존재하면 스킵
            if 'accounts' in [t.lower() for t in existing_tables]:
                print("ℹ️  테이블이 이미 존재합니다. 초기화를 건너뜁니다.")
                print(f"   발견된 테이블: {', '.join(existing_tables[:5])}{'...' if len(existing_tables) > 5 else ''}")
                return True
        
        # SQL 파일 읽기
        print(f"📖 SQL 파일 읽는 중: {sql_file.name}")
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # SQL 문을 세미콜론으로 분리 (간단한 파싱)
        # 주의: 복잡한 SQL 함수나 프로시저가 있으면 더 정교한 파서가 필요합니다
        sql_statements = []
        current_statement = []
        
        for line in sql_content.split('\n'):
            # 주석 제거 (-- 로 시작하는 줄)
            if line.strip().startswith('--'):
                continue
            
            # DO $$ 블록 처리
            if 'DO $$' in line or '$$;' in line:
                current_statement.append(line)
                if '$$;' in line:
                    sql_statements.append('\n'.join(current_statement))
                    current_statement = []
                continue
            
            current_statement.append(line)
            
            # 세미콜론으로 문장 종료
            if line.strip().endswith(';') and 'DO $$' not in '\n'.join(current_statement):
                statement = '\n'.join(current_statement).strip()
                if statement:
                    sql_statements.append(statement)
                current_statement = []
        
        # 남은 문장 처리
        if current_statement:
            remaining = '\n'.join(current_statement).strip()
            if remaining:
                sql_statements.append(remaining)
        
        # SQL 실행
        print(f"📦 {len(sql_statements)}개의 SQL 문 실행 중...")
        async with engine.begin() as conn:
            executed_count = 0
            for i, statement in enumerate(sql_statements, 1):
                statement = statement.strip()
                if not statement or statement.startswith('--'):
                    continue
                
                try:
                    await conn.execute(text(statement))
                    executed_count += 1
                    if i % 10 == 0:
                        print(f"   진행 중... ({i}/{len(sql_statements)})")
                except Exception as e:
                    # 일부 오류는 무시 (예: 이미 존재하는 확장, 테이블 등)
                    error_msg = str(e).lower()
                    if 'already exists' in error_msg or 'duplicate' in error_msg:
                        continue
                    else:
                        print(f"⚠️  SQL 실행 중 오류 (무시됨): {e}")
        
        print(f"✅ {executed_count}개의 SQL 문 실행 완료!")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"❌ 데이터베이스 초기화 실패: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await engine.dispose()


if __name__ == "__main__":
    success = asyncio.run(init_db_from_sql())
    sys.exit(0 if success else 1)
