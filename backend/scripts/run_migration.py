#!/usr/bin/env python3
"""
데이터베이스 마이그레이션 실행 스크립트

특정 마이그레이션 SQL 파일을 실행합니다.

사용법:
    # Docker 컨테이너에서 실행
    docker exec -it realestate-backend python /app/scripts/run_migration.py migrations/add_favorite_apartments_nickname_memo.sql
    
    # 로컬에서 실행
    python backend/scripts/run_migration.py migrations/add_favorite_apartments_nickname_memo.sql
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
from app.core.config import settings


async def run_migration(migration_file: Path):
    """마이그레이션 SQL 파일 실행"""
    print("=" * 60)
    print("🔄 마이그레이션 실행 중...")
    print(f"📄 파일: {migration_file.name}")
    print(f"📍 DB URL: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else 'N/A'}")
    print("=" * 60)
    
    if not migration_file.exists():
        print(f"❌ 마이그레이션 파일을 찾을 수 없습니다: {migration_file}")
        return False
    
    # SQL 파일 읽기
    print(f"📖 SQL 파일 읽는 중...")
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    # SQL 문을 세미콜론으로 분리
    statements = []
    current_statement = []
    
    for line in sql_content.split('\n'):
        # 주석 제거
        if line.strip().startswith('--'):
            continue
        
        current_statement.append(line)
        
        # 세미콜론으로 문장 종료
        if line.strip().endswith(';'):
            statement = '\n'.join(current_statement).strip()
            if statement:
                statements.append(statement)
            current_statement = []
    
    # 남은 문장 처리
    if current_statement:
        remaining = '\n'.join(current_statement).strip()
        if remaining:
            statements.append(remaining)
    
    # 엔진 생성
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    
    try:
        # 각 SQL 문을 개별적으로 실행
        async with engine.begin() as conn:
            for i, statement in enumerate(statements, 1):
                statement = statement.strip()
                if not statement:
                    continue
                
                try:
                    await conn.execute(text(statement))
                    print(f"   ✅ 문장 {i}/{len(statements)} 실행 완료")
                except Exception as e:
                    # IF NOT EXISTS로 인한 오류는 무시
                    error_msg = str(e).lower()
                    if 'already exists' in error_msg or 'duplicate' in error_msg:
                        print(f"   ⚠️  문장 {i}/{len(statements)} 건너뜀 (이미 존재)")
                        continue
                    else:
                        raise
        
        print("✅ 마이그레이션 완료!")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"❌ 마이그레이션 실패: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python run_migration.py <migration_file>")
        print("예시: python run_migration.py migrations/add_favorite_apartments_nickname_memo.sql")
        sys.exit(1)
    
    migration_path = sys.argv[1]
    migration_file = Path(__file__).parent / migration_path
    
    success = asyncio.run(run_migration(migration_file))
    sys.exit(0 if success else 1)
