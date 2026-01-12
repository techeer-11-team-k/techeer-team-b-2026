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
"""
import asyncio
import sys
import argparse
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
        self.engine = create_async_engine(settings.DATABASE_URL, echo=False)
    
    async def close(self):
        """엔진 종료"""
        await self.engine.dispose()
    
    async def list_tables(self) -> List[str]:
        """
        모든 테이블 목록 조회
        
        Returns:
            테이블명 목록
        """
        async with self.engine.connect() as conn:
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
        async with self.engine.connect() as conn:
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
            async with self.engine.connect() as conn:
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
    print("0. 종료")
    print("=" * 60)


async def interactive_mode(admin: DatabaseAdmin):
    """대화형 모드"""
    while True:
        print_menu()
        choice = input("\n선택하세요 (0-5): ").strip()
        
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
        else:
            print("\n❌ 잘못된 선택입니다. 0-5 사이의 숫자를 입력하세요.")
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
