#!/usr/bin/env python3
"""
자동 마이그레이션 스크립트

Docker 컨테이너 시작 시 자동으로 마이그레이션을 실행합니다.
이미 실행된 마이그레이션은 건너뜁니다.

사용법:
    # Docker 컨테이너에서 실행
    python /app/scripts/auto_migrate.py
    
    # 로컬에서 실행
    python backend/scripts/auto_migrate.py
"""
import asyncio
import sys
from pathlib import Path
from datetime import datetime

# 프로젝트 루트를 Python 경로에 추가
script_path = Path(__file__).resolve()
if script_path.parts[0] == '/app':
    project_root = Path('/app')
    migrations_dir = Path('/app/scripts/migrations')
else:
    project_root = Path(__file__).parent.parent.parent
    migrations_dir = Path(__file__).parent / 'migrations'

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


async def ensure_migration_table(engine):
    """마이그레이션 추적 테이블 생성"""
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        await conn.execute(text("""
            COMMENT ON TABLE _migrations IS '적용된 마이그레이션 추적 테이블'
        """))


async def get_applied_migrations(engine):
    """이미 적용된 마이그레이션 목록 조회"""
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT name FROM _migrations"))
        return {row[0] for row in result.fetchall()}


async def mark_migration_applied(engine, name: str):
    """마이그레이션을 적용 완료로 표시"""
    async with engine.begin() as conn:
        await conn.execute(
            text("INSERT INTO _migrations (name) VALUES (:name) ON CONFLICT (name) DO NOTHING"),
            {"name": name}
        )


async def run_migration_file(engine, migration_file: Path) -> bool:
    """개별 마이그레이션 파일 실행"""
    print(f"\n📄 마이그레이션 실행: {migration_file.name}")
    
    # SQL 파일 읽기
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    # SQL 문을 세미콜론으로 분리 (함수 정의 블록 처리)
    statements = []
    current_statement = []
    in_function = False
    
    for line in sql_content.split('\n'):
        # 주석만 있는 줄은 건너뜀
        stripped = line.strip()
        if stripped.startswith('--') and not current_statement:
            continue
        
        current_statement.append(line)
        
        # 함수 정의 시작 감지
        if 'AS $$' in line.upper() or 'AS $BODY$' in line.upper():
            in_function = True
        
        # 함수 정의 끝 감지
        if in_function and ('$$ LANGUAGE' in line.upper() or '$BODY$ LANGUAGE' in line.upper()):
            in_function = False
        
        # 세미콜론으로 문장 종료 (함수 내부가 아닐 때만)
        if not in_function and stripped.endswith(';'):
            statement = '\n'.join(current_statement).strip()
            if statement:
                statements.append(statement)
            current_statement = []
    
    # 남은 문장 처리
    if current_statement:
        remaining = '\n'.join(current_statement).strip()
        if remaining:
            statements.append(remaining)
    
    # 각 SQL 문 실행
    async with engine.begin() as conn:
        for i, statement in enumerate(statements, 1):
            statement = statement.strip()
            if not statement:
                continue
            
            try:
                await conn.execute(text(statement))
                # 긴 문장은 첫 50자만 표시
                preview = statement[:50].replace('\n', ' ')
                if len(statement) > 50:
                    preview += '...'
                print(f"   ✅ [{i}/{len(statements)}] {preview}")
            except Exception as e:
                error_msg = str(e).lower()
                # 이미 존재하는 경우는 무시
                if 'already exists' in error_msg or 'duplicate' in error_msg:
                    print(f"   ⚠️  [{i}/{len(statements)}] 건너뜀 (이미 존재)")
                    continue
                else:
                    print(f"   ❌ [{i}/{len(statements)}] 실패: {e}")
                    raise
    
    return True


async def run_auto_migrations():
    """모든 마이그레이션 자동 실행"""
    print("=" * 60)
    print("🚀 자동 마이그레이션 시작")
    print(f"📅 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # 데이터베이스 연결
    database_url = await get_database_url()
    if not database_url:
        print("❌ DATABASE_URL이 설정되지 않았습니다.")
        return False
    
    # 호스트 정보만 출력 (보안)
    db_host = database_url.split('@')[-1].split('/')[0] if '@' in database_url else 'N/A'
    print(f"📍 데이터베이스: {db_host}")
    
    engine = create_async_engine(database_url, echo=False)
    
    try:
        # 마이그레이션 테이블 확인/생성
        await ensure_migration_table(engine)
        
        # 이미 적용된 마이그레이션 조회
        applied = await get_applied_migrations(engine)
        print(f"\n📊 이미 적용된 마이그레이션: {len(applied)}개")
        
        # migrations 폴더의 SQL 파일 조회
        if not migrations_dir.exists():
            print(f"\n⚠️  마이그레이션 폴더 없음: {migrations_dir}")
            print("   새 마이그레이션이 없습니다.")
            return True
        
        migration_files = sorted(migrations_dir.glob('*.sql'))
        if not migration_files:
            print("\n✅ 실행할 마이그레이션이 없습니다.")
            return True
        
        print(f"📁 발견된 마이그레이션 파일: {len(migration_files)}개")
        
        # 새 마이그레이션 실행
        new_count = 0
        skip_count = 0
        
        for migration_file in migration_files:
            migration_name = migration_file.name
            
            if migration_name in applied:
                print(f"\n⏭️  건너뜀: {migration_name} (이미 적용됨)")
                skip_count += 1
                continue
            
            try:
                success = await run_migration_file(engine, migration_file)
                if success:
                    await mark_migration_applied(engine, migration_name)
                    new_count += 1
                    print(f"   ✅ 마이그레이션 완료: {migration_name}")
            except Exception as e:
                print(f"\n❌ 마이그레이션 실패: {migration_name}")
                print(f"   오류: {e}")
                return False
        
        print("\n" + "=" * 60)
        print(f"✅ 마이그레이션 완료!")
        print(f"   - 새로 적용: {new_count}개")
        print(f"   - 건너뜀: {skip_count}개")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n❌ 마이그레이션 오류: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await engine.dispose()


if __name__ == "__main__":
    success = asyncio.run(run_auto_migrations())
    sys.exit(0 if success else 1)
