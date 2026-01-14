#!/usr/bin/env python
"""
CSV 백업 파일로부터 데이터베이스 복원 스크립트

사용법:
    python scripts/restore_from_csv.py

주의: 기존 데이터가 있으면 중복될 수 있습니다.
"""
import asyncio
import csv
import sys
from pathlib import Path
from typing import Dict, List

# 프로젝트 루트를 path에 추가
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


# CSV 파일명과 테이블명 매핑
TABLE_MAPPING = {
    "accounts": "accounts",
    "apartments": "apartments",
    "apart_details": "apart_details",
    "states": "states",
    "favorite_apartments": "favorite_apartments",
    "favorite_locations": "favorite_locations",
    "house_scores": "house_scores",
    "my_properties": "my_properties",
    "rents": "rents",
    "sales": "sales",
}


async def get_csv_files(backup_dir: Path) -> Dict[str, Path]:
    """백업 디렉토리에서 CSV 파일들을 찾아서 반환"""
    csv_files = {}
    for csv_file in backup_dir.glob("*.csv"):
        table_name = csv_file.stem  # 파일명에서 확장자 제거
        if table_name in TABLE_MAPPING:
            csv_files[table_name] = csv_file
    return csv_files


async def restore_table_from_csv(
    db: AsyncSession,
    table_name: str,
    csv_path: Path,
    skip_header: bool = True
):
    """CSV 파일에서 테이블로 데이터 복원"""
    print(f"\n📂 복원 중: {table_name} <- {csv_path.name}")
    
    # CSV 파일 읽기
    rows = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    if not rows:
        print(f"   ⚠️  데이터가 없습니다. 건너뜁니다.")
        return
    
    print(f"   📊 총 {len(rows)}건의 데이터 발견")
    
    # 컬럼명 가져오기
    columns = list(rows[0].keys())
    columns_str = ", ".join(columns)
    
    # 배치 처리 (한 번에 너무 많은 데이터를 넣지 않도록)
    batch_size = 1000
    total_inserted = 0
    
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        
        # VALUES 절 생성
        values_list = []
        for row in batch:
            values = []
            for col in columns:
                value = row.get(col, "")
                if value == "" or value is None:
                    values.append("NULL")
                elif value.lower() == "true" or value.lower() == "t":
                    values.append("TRUE")
                elif value.lower() == "false" or value.lower() == "f":
                    values.append("FALSE")
                else:
                    # 문자열 이스케이프 및 따옴표 처리
                    value_escaped = str(value).replace("'", "''")
                    values.append(f"'{value_escaped}'")
            values_list.append(f"({', '.join(values)})")
        
        # INSERT 문 생성 (ON CONFLICT DO NOTHING으로 중복 방지)
        values_str = ", ".join(values_list)
        insert_sql = f"""
            INSERT INTO {table_name} ({columns_str})
            VALUES {values_str}
            ON CONFLICT DO NOTHING
        """
        
        try:
            await db.execute(text(insert_sql))
            await db.commit()
            total_inserted += len(batch)
            print(f"   ✅ {total_inserted}/{len(rows)}건 삽입 완료", end="\r")
        except Exception as e:
            await db.rollback()
            print(f"\n   ❌ 오류 발생: {e}")
            print(f"   SQL: {insert_sql[:200]}...")
            raise
    
    print(f"\n   ✅ {table_name} 복원 완료: {total_inserted}건")


async def restore_all():
    """모든 CSV 파일을 데이터베이스에 복원"""
    # 백업 디렉토리 경로
    # Docker 컨테이너에서는 /app/backups, 로컬에서는 프로젝트 루트의 db_backup
    if Path("/app/backups").exists():
        backup_dir = Path("/app/backups")
    else:
        project_root = Path(__file__).parent.parent.parent
        backup_dir = project_root / "db_backup"
    
    if not backup_dir.exists():
        print(f"❌ 백업 디렉토리를 찾을 수 없습니다: {backup_dir}")
        return
    
    print(f"📁 백업 디렉토리: {backup_dir}")
    
    # CSV 파일 찾기
    csv_files = await get_csv_files(backup_dir)
    
    if not csv_files:
        print("❌ 복원할 CSV 파일이 없습니다.")
        return
    
    print(f"\n📋 발견된 CSV 파일 ({len(csv_files)}개):")
    for table_name, csv_path in csv_files.items():
        print(f"   - {table_name}: {csv_path.name}")
    
    # 데이터베이스 연결
    print(f"\n🔌 데이터베이스 연결 중...")
    print(f"   URL: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else '***'}")
    
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with async_session() as db:
            # 각 테이블 복원
            for table_name, csv_path in csv_files.items():
                try:
                    await restore_table_from_csv(db, table_name, csv_path)
                except Exception as e:
                    print(f"\n❌ {table_name} 복원 실패: {e}")
                    continue
        
        print("\n✅ 모든 백업 복원 완료!")
        
    except Exception as e:
        print(f"\n❌ 복원 중 오류 발생: {e}")
        raise
    finally:
        await engine.dispose()


if __name__ == "__main__":
    import os
    
    print("=" * 60)
    print("🔄 CSV 백업 파일로부터 데이터베이스 복원")
    print("=" * 60)
    
    # 환경 변수로 자동 실행 제어 (Docker에서 사용)
    auto_confirm = os.getenv("AUTO_CONFIRM", "false").lower() == "true"
    
    if auto_confirm:
        print("\n⚠️  자동 모드: 기존 데이터와 중복될 수 있습니다.")
        asyncio.run(restore_all())
    else:
        confirm = input("\n⚠️  기존 데이터와 중복될 수 있습니다. 계속하시겠습니까? (yes/no): ")
        
        if confirm.lower() == "yes":
            asyncio.run(restore_all())
        else:
            print("취소되었습니다.")
