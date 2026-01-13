#!/usr/bin/env python3
"""
데이터베이스 관리 CLI 도구

Docker 컨테이너에서 실행 가능한 데이터베이스 관리 명령어 도구입니다.

사용법:
    # Docker 컨테이너에서 실행 (대화형 모드 - 권장)
    docker exec -it realestate-backend python -m app.db_admin
    
    # 명령줄 모드 (하위 호환성)
    docker exec -it realestate-backend python -m app.db_admin list
    docker exec -it realestate-backend python -m app.db_admin info states
    docker exec -it realestate-backend python -m app.db_admin rebuild
"""
import asyncio
import sys
import argparse
import os
from pathlib import Path
from typing import List, Optional
from sqlalchemy import text, inspect
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

from app.core.config import settings


class DatabaseAdmin:
    """
    데이터베이스 관리 클래스
    
    테이블 조회, 삭제, 데이터 삭제 등의 기능을 제공합니다.
    """
    
    def __init__(self):
        """초기화"""
        # pool_pre_ping=True: 연결이 닫혀있으면 자동으로 재연결
        # pool_recycle=3600: 1시간마다 연결 재생성
        self.engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            pool_pre_ping=True,
            pool_recycle=3600
        )
    
    async def close(self):
        """엔진 종료"""
        await self.engine.dispose()
    
    async def list_tables(self) -> List[str]:
        """
        모든 테이블 목록 조회
        
        Returns:
            테이블명 목록
        """
        async with self.engine.begin() as conn:
            result = await conn.execute(text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename
            """))
            tables = [row[0] for row in result.fetchall()]
            return tables
    
    async def get_table_info(self, table_name: str) -> dict:
        """
        테이블 정보 조회
        
        Args:
            table_name: 테이블명
        
        Returns:
            테이블 정보 (컬럼 수, 레코드 수 등)
        """
        async with self.engine.begin() as conn:
            # 레코드 수 조회
            count_result = await conn.execute(
                text(f'SELECT COUNT(*) FROM "{table_name}"')
            )
            row_count = count_result.scalar()
            
            # 컬럼 정보 조회
            columns_result = await conn.execute(text("""
                SELECT 
                    column_name,
                    data_type,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_schema = 'public' 
                AND table_name = :table_name
                ORDER BY ordinal_position
            """).bindparams(table_name=table_name))
            
            columns = []
            for row in columns_result.fetchall():
                columns.append({
                    "name": row[0],
                    "type": row[1],
                    "nullable": row[2] == "YES",
                    "default": row[3]
                })
            
            return {
                "table_name": table_name,
                "row_count": row_count,
                "column_count": len(columns),
                "columns": columns
            }
    
    async def truncate_table(self, table_name: str, confirm: bool = False) -> bool:
        """
        테이블의 모든 데이터 삭제 (테이블 구조는 유지)
        
        Args:
            table_name: 테이블명
            confirm: 확인 여부
        
        Returns:
            성공 여부
        """
        if not confirm:
            print(f"⚠️  경고: '{table_name}' 테이블의 모든 데이터가 삭제됩니다!")
            response = input("계속하시겠습니까? (yes/no): ")
            if response.lower() != "yes":
                print("취소되었습니다.")
                return False
        
        try:
            async with self.engine.begin() as conn:
                # TRUNCATE는 트랜잭션 내에서 실행
                await conn.execute(text(f'TRUNCATE TABLE "{table_name}" RESTART IDENTITY CASCADE'))
            
            print(f"✅ '{table_name}' 테이블의 모든 데이터가 삭제되었습니다.")
            return True
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
            return False
    
    async def drop_table(self, table_name: str, confirm: bool = False) -> bool:
        """
        테이블 삭제 (테이블 구조와 데이터 모두 삭제)
        
        Args:
            table_name: 테이블명
            confirm: 확인 여부
        
        Returns:
            성공 여부
        """
        if not confirm:
            print(f"⚠️  경고: '{table_name}' 테이블이 완전히 삭제됩니다!")
            print("   테이블 구조와 모든 데이터가 영구적으로 삭제됩니다!")
            response = input("계속하시겠습니까? (yes/no): ")
            if response.lower() != "yes":
                print("취소되었습니다.")
                return False
        
        try:
            async with self.engine.begin() as conn:
                # CASCADE로 외래키 제약조건도 함께 삭제
                await conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))
            
            print(f"✅ '{table_name}' 테이블이 삭제되었습니다.")
            return True
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
            return False
    
    def _split_sql_statements(self, sql_content: str) -> List[str]:
        """
        SQL 파일 내용을 개별 명령으로 분리
        
        DO $$ ... END $$; 블록은 하나의 명령으로 유지
        
        Args:
            sql_content: SQL 파일 전체 내용
        
        Returns:
            SQL 명령 리스트
        """
        statements = []
        current_statement = []
        in_do_block = False
        dollar_quote = None  # $$ 또는 $tag$ 같은 구분자
        
        lines = sql_content.split('\n')
        
        for line in lines:
            # 주석만 있는 줄은 건너뛰기
            stripped = line.strip()
            if not stripped or stripped.startswith('--'):
                continue
            
            # DO $$ 블록 시작 감지
            if 'DO' in stripped.upper() and '$$' in stripped:
                in_do_block = True
                # $$ 또는 $tag$ 같은 구분자 찾기
                import re
                match = re.search(r'\$\$|\$[A-Za-z_]*\$', stripped)
                if match:
                    dollar_quote = match.group()
                current_statement.append(line)
                continue
            
            # DO $$ 블록 내부
            if in_do_block:
                current_statement.append(line)
                # END $$; 또는 END $tag$; 감지
                if f'END {dollar_quote}' in stripped.upper() or f'END{dollar_quote}' in stripped.upper():
                    # 세미콜론으로 끝나는지 확인
                    if stripped.endswith(';'):
                        # DO 블록 완료
                        statements.append('\n'.join(current_statement))
                        current_statement = []
                        in_do_block = False
                        dollar_quote = None
                continue
            
            # 일반 SQL 명령
            current_statement.append(line)
            
            # 세미콜론으로 끝나면 명령 완료
            if stripped.endswith(';'):
                stmt = '\n'.join(current_statement).strip()
                if stmt:
                    statements.append(stmt)
                current_statement = []
        
        # 마지막 명령이 세미콜론 없이 끝난 경우
        if current_statement:
            stmt = '\n'.join(current_statement).strip()
            if stmt:
                statements.append(stmt)
        
        return statements
    
    async def get_table_relationships(self, table_name: Optional[str] = None) -> List[dict]:
        """
        테이블 간 관계 조회 (Foreign Key)
        
        Args:
            table_name: 특정 테이블명 (None이면 모든 테이블)
        
        Returns:
            관계 정보 리스트
        """
        async with self.engine.begin() as conn:
            if table_name:
                # 특정 테이블의 관계만 조회
                query = text("""
                    SELECT
                        tc.table_name AS from_table,
                        kcu.column_name AS from_column,
                        ccu.table_name AS to_table,
                        ccu.column_name AS to_column,
                        tc.constraint_name AS constraint_name
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                      AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                      AND ccu.table_schema = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_schema = 'public'
                      AND (tc.table_name = :table_name OR ccu.table_name = :table_name)
                    ORDER BY tc.table_name, kcu.column_name
                """).bindparams(table_name=table_name)
            else:
                # 모든 테이블의 관계 조회
                query = text("""
                    SELECT
                        tc.table_name AS from_table,
                        kcu.column_name AS from_column,
                        ccu.table_name AS to_table,
                        ccu.column_name AS to_column,
                        tc.constraint_name AS constraint_name
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                      AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                      AND ccu.table_schema = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_schema = 'public'
                    ORDER BY tc.table_name, kcu.column_name
                """)
            
            result = await conn.execute(query)
            relationships = []
            for row in result.fetchall():
                relationships.append({
                    "from_table": row[0],
                    "from_column": row[1],
                    "to_table": row[2],
                    "to_column": row[3],
                    "constraint_name": row[4]
                })
            return relationships
    
    async def show_table_data(
        self, 
        table_name: str, 
        limit: int = 10,
        offset: int = 0
    ) -> None:
        """
        테이블 데이터 조회 (미리보기)
        
        Args:
            table_name: 테이블명
            limit: 조회할 레코드 수
            offset: 건너뛸 레코드 수
        """
        try:
            async with self.engine.begin() as conn:
                # 데이터 조회
                result = await conn.execute(
                    text(f'SELECT * FROM "{table_name}" LIMIT :limit OFFSET :offset')
                    .bindparams(limit=limit, offset=offset)
                )
                
                rows = result.fetchall()
                columns = result.keys()
                
                if not rows:
                    print(f"'{table_name}' 테이블에 데이터가 없습니다.")
                    return
                
                # 헤더 출력
                print(f"\n📊 '{table_name}' 테이블 데이터 (최대 {limit}개):")
                print("=" * 80)
                
                # 컬럼명 출력
                header = " | ".join([str(col).ljust(15) for col in columns])
                print(header)
                print("-" * 80)
                
                # 데이터 출력
                for row in rows:
                    row_str = " | ".join([str(val).ljust(15) if val is not None else "NULL".ljust(15) for val in row])
                    print(row_str)
                
                print("=" * 80)
                
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
    
    async def rebuild_database(self, confirm: bool = False) -> bool:
        """
        데이터베이스 완전 재구축
        
        모든 테이블을 삭제하고 init_db.sql을 실행하여 테이블과 관계를 모두 재구축합니다.
        
        Args:
            confirm: 확인 여부
        
        Returns:
            성공 여부
        """
        if not confirm:
            print("\n" + "=" * 80)
            print("⚠️  ⚠️  ⚠️  경고: 데이터베이스 완전 재구축 ⚠️  ⚠️  ⚠️")
            print("=" * 80)
            print("이 작업은 다음을 수행합니다:")
            print("  1. 모든 테이블을 삭제합니다 (CASCADE)")
            print("  2. 모든 데이터가 영구적으로 삭제됩니다")
            print("  3. init_db.sql을 실행하여 테이블과 관계를 재구축합니다")
            print("=" * 80)
            print("\n⚠️  이 작업은 되돌릴 수 없습니다!")
            response = input("\n계속하시겠습니까? (yes/no): ")
            if response.lower() != "yes":
                print("취소되었습니다.")
                return False
        
        try:
            print("\n🔄 데이터베이스 재구축 시작...")
            
            # 1단계: 모든 테이블 목록 조회
            print("\n📋 1단계: 기존 테이블 목록 조회...")
            async with self.engine.begin() as conn:
                result = await conn.execute(text("""
                    SELECT tablename 
                    FROM pg_tables 
                    WHERE schemaname = 'public'
                    ORDER BY tablename
                """))
                existing_tables = [row[0] for row in result.fetchall()]
            
            if existing_tables:
                print(f"   발견된 테이블: {len(existing_tables)}개")
                for table in existing_tables:
                    print(f"     - {table}")
            else:
                print("   기존 테이블이 없습니다.")
            
            # 2단계: 모든 테이블 삭제 (CASCADE)
            print("\n🗑️  2단계: 모든 테이블 삭제...")
            async with self.engine.begin() as conn:
                for table in existing_tables:
                    try:
                        await conn.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
                        print(f"   ✅ '{table}' 테이블 삭제됨")
                    except Exception as e:
                        print(f"   ⚠️  '{table}' 테이블 삭제 중 오류: {e}")
            
            # 3단계: init_db.sql 파일 읽기
            print("\n📄 3단계: init_db.sql 파일 읽기...")
            # 프로젝트 루트 디렉토리 찾기 (여러 경로 시도)
            current_file = Path(__file__).resolve()  # 절대 경로로 변환
            # 가능한 경로들
            possible_paths = [
                current_file.parent.parent / "scripts" / "init_db.sql",  # backend/app/db_admin.py -> backend/scripts/
                current_file.parent.parent.parent / "backend" / "scripts" / "init_db.sql",  # 프로젝트 루트에서
                Path("/app/scripts/init_db.sql"),  # Docker 컨테이너 내부 경로
                Path("scripts/init_db.sql"),  # 현재 작업 디렉토리 기준
            ]
            
            init_db_path = None
            for path in possible_paths:
                if path.exists():
                    init_db_path = path
                    break
            
            if not init_db_path or not init_db_path.exists():
                print(f"❌ 오류: init_db.sql 파일을 찾을 수 없습니다.")
                print(f"   시도한 경로:")
                for path in possible_paths:
                    print(f"     - {path} (존재: {path.exists()})")
                print(f"   현재 파일 위치: {current_file}")
                print(f"   현재 작업 디렉토리: {os.getcwd()}")
                return False
            
            print(f"   ✅ 파일 경로: {init_db_path}")
            with open(init_db_path, "r", encoding="utf-8") as f:
                sql_content = f.read()
            
            # SQL 파일을 세미콜론으로 분리 (간단한 파싱)
            # 주의: DO $$ 블록 등은 별도 처리 필요
            print(f"   파일 크기: {len(sql_content)} bytes")
            
            # 4단계: SQL 실행
            print("\n🔨 4단계: 데이터베이스 스키마 구축...")
            # SQL 파일을 명령 단위로 분리
            # asyncpg는 prepared statement에 여러 명령을 넣을 수 없으므로 개별 실행 필요
            statements = self._split_sql_statements(sql_content)
            print(f"   총 {len(statements)}개의 SQL 명령을 실행합니다...")
            
            async with self.engine.begin() as conn:
                executed_count = 0
                failed_count = 0
                
                for idx, statement in enumerate(statements, 1):
                    # 빈 문장이나 주석만 있는 문장은 건너뛰기
                    stmt_clean = statement.strip()
                    if not stmt_clean or stmt_clean.startswith('--'):
                        continue
                    
                    try:
                        # 각 SQL 명령을 개별적으로 실행
                        await conn.execute(text(stmt_clean))
                        executed_count += 1
                        
                        # 진행 상황 출력 (10개마다)
                        if executed_count % 10 == 0:
                            print(f"   진행 중... ({executed_count}/{len(statements)}개 실행됨)")
                    except Exception as e:
                        failed_count += 1
                        # 첫 번째 오류만 상세 출력
                        if failed_count == 1:
                            print(f"   ⚠️  SQL 명령 {idx}번째 실행 중 오류:")
                            print(f"      {str(e)[:200]}...")  # 오류 메시지 일부만 출력
                            print(f"      SQL: {stmt_clean[:100]}...")  # SQL 일부만 출력
                        # 나머지 오류는 간단히 카운트만
                
                if failed_count > 0:
                    print(f"   ⚠️  {failed_count}개의 SQL 명령 실행 실패")
                else:
                    print(f"   ✅ 모든 SQL 명령 실행 완료 ({executed_count}개)")
                
                if failed_count > 0 and executed_count == 0:
                    # 모든 명령이 실패한 경우
                    print(f"\n   ❌ 모든 SQL 명령 실행 실패")
                    return False
            
            # 5단계: 생성된 테이블 확인
            print("\n✅ 5단계: 생성된 테이블 확인...")
            new_tables = []
            async with self.engine.begin() as conn:
                result = await conn.execute(text("""
                    SELECT tablename 
                    FROM pg_tables 
                    WHERE schemaname = 'public'
                    ORDER BY tablename
                """))
                new_tables = [row[0] for row in result.fetchall()]
                
                if new_tables:
                    print(f"   생성된 테이블: {len(new_tables)}개")
                    for table in new_tables:
                        # 각 테이블의 레코드 수 확인
                        count_result = await conn.execute(
                            text(f'SELECT COUNT(*) FROM "{table}"')
                        )
                        count = count_result.scalar()
                        print(f"     - {table:30s} ({count:6d}개 레코드)")
                else:
                    print("   ⚠️  생성된 테이블이 없습니다.")
            
            # 6단계: 외래키 제약조건 확인
            print("\n🔗 6단계: 외래키 제약조건 확인...")
            foreign_keys = []
            async with self.engine.begin() as conn:
                result = await conn.execute(text("""
                    SELECT
                        tc.table_name,
                        kcu.column_name,
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                      AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                      AND ccu.table_schema = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_schema = 'public'
                    ORDER BY tc.table_name, kcu.column_name
                """))
                foreign_keys = result.fetchall()
                
                if foreign_keys:
                    print(f"   발견된 외래키: {len(foreign_keys)}개")
                    for fk in foreign_keys[:10]:  # 최대 10개만 출력
                        print(f"     - {fk[0]}.{fk[1]} -> {fk[2]}.{fk[3]}")
                    if len(foreign_keys) > 10:
                        print(f"     ... 외 {len(foreign_keys) - 10}개")
                else:
                    print("   ⚠️  외래키 제약조건이 없습니다.")
            
            print("\n" + "=" * 80)
            print("✅ 데이터베이스 재구축 완료!")
            print("=" * 80)
            print(f"   - 삭제된 테이블: {len(existing_tables)}개")
            print(f"   - 생성된 테이블: {len(new_tables)}개")
            print(f"   - 외래키 제약조건: {len(foreign_keys)}개")
            print("=" * 80)
            
            return True
            
        except Exception as e:
            print(f"\n❌ 오류 발생: {e}")
            import traceback
            traceback.print_exc()
            return False


async def list_tables_command(admin: DatabaseAdmin):
    """테이블 목록 조회 명령어"""
    print("\n📋 데이터베이스 테이블 목록:")
    print("=" * 60)
    
    tables = await admin.list_tables()
    
    if not tables:
        print("테이블이 없습니다.")
        return
    
    for idx, table in enumerate(tables, 1):
        # 테이블 정보 조회
        info = await admin.get_table_info(table)
        print(f"{idx:2d}. {table:30s} | 레코드: {info['row_count']:6d}개 | 컬럼: {info['column_count']:2d}개")
    
    print("=" * 60)
    print(f"총 {len(tables)}개 테이블")


async def info_command(admin: DatabaseAdmin, table_name: str):
    """테이블 정보 조회 명령어"""
    print(f"\n📊 '{table_name}' 테이블 정보:")
    print("=" * 60)
    
    try:
        info = await admin.get_table_info(table_name)
        
        print(f"테이블명: {info['table_name']}")
        print(f"레코드 수: {info['row_count']:,}개")
        print(f"컬럼 수: {info['column_count']}개")
        print("\n컬럼 정보:")
        print("-" * 60)
        
        for col in info['columns']:
            nullable = "NULL" if col['nullable'] else "NOT NULL"
            default = f" DEFAULT {col['default']}" if col['default'] else ""
            print(f"  - {col['name']:30s} {col['type']:20s} {nullable}{default}")
        
        print("=" * 60)
        
        # 데이터 미리보기
        if info['row_count'] > 0:
            await admin.show_table_data(table_name, limit=5)
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        print(f"   '{table_name}' 테이블이 존재하지 않을 수 있습니다.")


async def truncate_command(admin: DatabaseAdmin, table_name: str, force: bool = False):
    """테이블 데이터 삭제 명령어"""
    # 테이블 존재 확인
    tables = await admin.list_tables()
    if table_name not in tables:
        print(f"❌ '{table_name}' 테이블이 존재하지 않습니다.")
        print(f"\n사용 가능한 테이블:")
        for table in tables:
            print(f"  - {table}")
        return
    
    # 테이블 정보 확인
    info = await admin.get_table_info(table_name)
    print(f"\n'{table_name}' 테이블 정보:")
    print(f"  레코드 수: {info['row_count']:,}개")
    
    # 데이터 삭제 실행
    success = await admin.truncate_table(table_name, confirm=force)
    if success:
        # 삭제 후 확인
        new_info = await admin.get_table_info(table_name)
        print(f"  삭제 후 레코드 수: {new_info['row_count']:,}개")


async def drop_command(admin: DatabaseAdmin, table_name: str, force: bool = False):
    """테이블 삭제 명령어"""
    # 테이블 존재 확인
    tables = await admin.list_tables()
    if table_name not in tables:
        print(f"❌ '{table_name}' 테이블이 존재하지 않습니다.")
        print(f"\n사용 가능한 테이블:")
        for table in tables:
            print(f"  - {table}")
        return
    
    # 테이블 삭제 실행
    success = await admin.drop_table(table_name, confirm=force)
    if success:
        # 삭제 확인
        tables_after = await admin.list_tables()
        if table_name not in tables_after:
            print(f"  ✅ '{table_name}' 테이블이 성공적으로 삭제되었습니다.")


async def show_command(admin: DatabaseAdmin, table_name: str, limit: int = 10):
    """테이블 데이터 조회 명령어"""
    # 테이블 존재 확인
    tables = await admin.list_tables()
    if table_name not in tables:
        print(f"❌ '{table_name}' 테이블이 존재하지 않습니다.")
        print(f"\n사용 가능한 테이블:")
        for table in tables:
            print(f"  - {table}")
        return
    
    await admin.show_table_data(table_name, limit=limit)


async def relationships_command(admin: DatabaseAdmin, table_name: Optional[str] = None):
    """테이블 관계 조회 명령어"""
    if table_name:
        # 특정 테이블의 관계 조회
        tables = await admin.list_tables()
        if table_name not in tables:
            print(f"❌ '{table_name}' 테이블이 존재하지 않습니다.")
            print(f"\n사용 가능한 테이블:")
            for table in tables:
                print(f"  - {table}")
            return
        
        print(f"\n🔗 '{table_name}' 테이블의 관계:")
        print("=" * 80)
    else:
        print("\n🔗 전체 데이터베이스 관계:")
        print("=" * 80)
    
    relationships = await admin.get_table_relationships(table_name)
    
    if not relationships:
        if table_name:
            print(f"   '{table_name}' 테이블에 관계가 없습니다.")
        else:
            print("   데이터베이스에 관계가 없습니다.")
        return
    
    # 테이블별로 그룹화
    from collections import defaultdict
    by_table = defaultdict(list)
    for rel in relationships:
        by_table[rel["from_table"]].append(rel)
    
    for from_table, rels in sorted(by_table.items()):
        print(f"\n📋 {from_table} 테이블:")
        print("-" * 80)
        for rel in rels:
            print(f"   {rel['from_column']:30s} → {rel['to_table']}.{rel['to_column']}")
            print(f"      (제약조건: {rel['constraint_name']})")
    
    print("\n" + "=" * 80)
    print(f"총 {len(relationships)}개의 관계")
    
    # 관계 그래프 요약
    if not table_name:
        print("\n📊 관계 요약:")
        print("-" * 80)
        # 각 테이블이 참조하는 테이블 수
        refs_count = defaultdict(int)
        for rel in relationships:
            refs_count[rel["from_table"]] += 1
        
        for table, count in sorted(refs_count.items(), key=lambda x: x[1], reverse=True):
            print(f"   {table:30s} → {count}개의 관계")


async def rebuild_command(admin: DatabaseAdmin, force: bool = False):
    """데이터베이스 재구축 명령어"""
    success = await admin.rebuild_database(confirm=force)
    if success:
        print("\n✅ 데이터베이스 재구축이 성공적으로 완료되었습니다.")
    else:
        print("\n❌ 데이터베이스 재구축이 실패했습니다.")


def print_menu():
    """메뉴 출력"""
    print("\n" + "=" * 60)
    print("🗄️  데이터베이스 관리 도구")
    print("=" * 60)
    print("1. 테이블 목록 조회")
    print("2. 테이블 정보 조회")
    print("3. 테이블 데이터 조회")
    print("4. 테이블 데이터 삭제 (테이블 구조 유지)")
    print("5. 테이블 삭제 (테이블 구조와 데이터 모두 삭제)")
    print("6. 데이터베이스 완전 재구축 (모든 테이블 삭제 후 재생성)")
    print("7. 테이블 관계 조회 (Foreign Key)")
    print("0. 종료")
    print("=" * 60)


async def interactive_mode(admin: DatabaseAdmin):
    """대화형 모드"""
    while True:
        print_menu()
        choice = input("\n선택하세요 (0-7): ").strip()
        
        if choice == "0":
            print("\n👋 종료합니다.")
            break
        elif choice == "1":
            await list_tables_command(admin)
            input("\n계속하려면 Enter를 누르세요...")
        elif choice == "2":
            tables = await admin.list_tables()
            if not tables:
                print("테이블이 없습니다.")
                input("\n계속하려면 Enter를 누르세요...")
                continue
            
            print("\n사용 가능한 테이블:")
            for idx, table in enumerate(tables, 1):
                print(f"  {idx}. {table}")
            
            table_input = input("\n테이블명을 입력하세요: ").strip()
            if table_input:
                await info_command(admin, table_input)
            input("\n계속하려면 Enter를 누르세요...")
        elif choice == "3":
            tables = await admin.list_tables()
            if not tables:
                print("테이블이 없습니다.")
                input("\n계속하려면 Enter를 누르세요...")
                continue
            
            print("\n사용 가능한 테이블:")
            for idx, table in enumerate(tables, 1):
                print(f"  {idx}. {table}")
            
            table_input = input("\n테이블명을 입력하세요: ").strip()
            if not table_input:
                input("\n계속하려면 Enter를 누르세요...")
                continue
            
            limit_input = input("조회할 레코드 수 (기본값: 10): ").strip()
            limit = int(limit_input) if limit_input.isdigit() else 10
            await show_command(admin, table_input, limit)
            input("\n계속하려면 Enter를 누르세요...")
        elif choice == "4":
            tables = await admin.list_tables()
            if not tables:
                print("테이블이 없습니다.")
                input("\n계속하려면 Enter를 누르세요...")
                continue
            
            print("\n사용 가능한 테이블:")
            for idx, table in enumerate(tables, 1):
                print(f"  {idx}. {table}")
            
            table_input = input("\n데이터를 삭제할 테이블명을 입력하세요: ").strip()
            if table_input:
                await truncate_command(admin, table_input, force=False)
            input("\n계속하려면 Enter를 누르세요...")
        elif choice == "5":
            tables = await admin.list_tables()
            if not tables:
                print("테이블이 없습니다.")
                input("\n계속하려면 Enter를 누르세요...")
                continue
            
            print("\n사용 가능한 테이블:")
            for idx, table in enumerate(tables, 1):
                print(f"  {idx}. {table}")
            
            table_input = input("\n삭제할 테이블명을 입력하세요: ").strip()
            if table_input:
                await drop_command(admin, table_input, force=False)
            input("\n계속하려면 Enter를 누르세요...")
        elif choice == "6":
            await rebuild_command(admin, force=False)
            input("\n계속하려면 Enter를 누르세요...")
        elif choice == "7":
            tables = await admin.list_tables()
            if not tables:
                print("테이블이 없습니다.")
                input("\n계속하려면 Enter를 누르세요...")
                continue
            
            print("\n옵션:")
            print("  1. 전체 데이터베이스 관계 조회")
            print("  2. 특정 테이블 관계 조회")
            rel_choice = input("\n선택하세요 (1-2): ").strip()
            
            if rel_choice == "1":
                await relationships_command(admin, table_name=None)
            elif rel_choice == "2":
                print("\n사용 가능한 테이블:")
                for idx, table in enumerate(tables, 1):
                    print(f"  {idx}. {table}")
                table_input = input("\n테이블명을 입력하세요: ").strip()
                if table_input:
                    await relationships_command(admin, table_name=table_input)
            else:
                print("❌ 잘못된 선택입니다.")
            input("\n계속하려면 Enter를 누르세요...")
        else:
            print("\n❌ 잘못된 선택입니다. 0-7 사이의 숫자를 입력하세요.")
            input("\n계속하려면 Enter를 누르세요...")


def main():
    """메인 함수"""
    # 명령줄 인자가 있으면 기존 방식으로 동작 (하위 호환성)
    if len(sys.argv) > 1:
        parser = argparse.ArgumentParser(
            description="데이터베이스 관리 CLI 도구",
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
사용 예시:
  # 대화형 모드 (권장)
  python -m app.db_admin
  
  # 명령줄 모드
  python -m app.db_admin list
  python -m app.db_admin info states
  python -m app.db_admin show states --limit 20
  python -m app.db_admin truncate states
  python -m app.db_admin drop states
  python -m app.db_admin rebuild --force
  python -m app.db_admin relationships
  python -m app.db_admin relationships states
            """
        )
        
        subparsers = parser.add_subparsers(dest="command", help="명령어")
        
        # list 명령어
        list_parser = subparsers.add_parser("list", help="테이블 목록 조회")
        
        # info 명령어
        info_parser = subparsers.add_parser("info", help="테이블 정보 조회")
        info_parser.add_argument("table_name", help="테이블명")
        
        # show 명령어
        show_parser = subparsers.add_parser("show", help="테이블 데이터 조회")
        show_parser.add_argument("table_name", help="테이블명")
        show_parser.add_argument("--limit", type=int, default=10, help="조회할 레코드 수 (기본값: 10)")
        
        # truncate 명령어
        truncate_parser = subparsers.add_parser("truncate", help="테이블 데이터 삭제 (테이블 구조 유지)")
        truncate_parser.add_argument("table_name", help="테이블명")
        truncate_parser.add_argument("--force", action="store_true", help="확인 없이 실행")
        
        # drop 명령어
        drop_parser = subparsers.add_parser("drop", help="테이블 삭제 (테이블 구조와 데이터 모두 삭제)")
        drop_parser.add_argument("table_name", help="테이블명")
        drop_parser.add_argument("--force", action="store_true", help="확인 없이 실행")
        
        # rebuild 명령어
        rebuild_parser = subparsers.add_parser("rebuild", help="데이터베이스 완전 재구축 (모든 테이블 삭제 후 재생성)")
        rebuild_parser.add_argument("--force", action="store_true", help="확인 없이 실행")
        
        # relationships 명령어
        rel_parser = subparsers.add_parser("relationships", help="테이블 관계 조회 (Foreign Key)")
        rel_parser.add_argument("table_name", nargs="?", help="테이블명 (생략 시 전체 조회)")
        
        args = parser.parse_args()
        
        if not args.command:
            parser.print_help()
            sys.exit(1)
        
        # 비동기 실행
        async def run_command():
            admin = DatabaseAdmin()
            try:
                if args.command == "list":
                    await list_tables_command(admin)
                elif args.command == "info":
                    await info_command(admin, args.table_name)
                elif args.command == "show":
                    await show_command(admin, args.table_name, args.limit)
                elif args.command == "truncate":
                    await truncate_command(admin, args.table_name, args.force)
                elif args.command == "drop":
                    await drop_command(admin, args.table_name, args.force)
                elif args.command == "rebuild":
                    await rebuild_command(admin, args.force)
                elif args.command == "relationships":
                    await relationships_command(admin, args.table_name)
            finally:
                await admin.close()
        
        asyncio.run(run_command())
    else:
        # 대화형 모드 (기본)
        async def run_interactive():
            admin = DatabaseAdmin()
            try:
                await interactive_mode(admin)
            finally:
                await admin.close()
        
        asyncio.run(run_interactive())


if __name__ == "__main__":
    main()
