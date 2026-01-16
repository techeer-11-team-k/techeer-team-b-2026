"""
sales.csv 파일을 데이터베이스에 import하는 스크립트

사용 방법:
    python -m scripts.import_sales_csv
    또는
    cd backend && python -m scripts.import_sales_csv
"""
import asyncio
import sys
import csv
from pathlib import Path
from datetime import datetime

# Windows에서 UTF-8 인코딩 설정
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 프로젝트 루트를 Python 경로에 추가
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, select, func
from app.core.config import settings
from app.models.sale import Sale
from app.db.base import Base


async def import_sales_csv():
    """sales.csv 파일을 데이터베이스에 import"""
    # CSV 파일 경로 (도커 컨테이너 내부 경로)
    # docker-compose.yml에서 ./db_backup:/app/backups로 마운트됨
    csv_path = Path("/app/backups/sales.csv")
    
    # 도커 외부에서 실행하는 경우를 위한 대체 경로
    if not csv_path.exists():
        csv_path = Path(__file__).parent.parent.parent / "db_backup" / "sales.csv"
    
    if not csv_path.exists():
        print(f"[ERROR] CSV 파일을 찾을 수 없습니다: {csv_path}")
        return
    
    print(f"[INFO] CSV 파일 읽기: {csv_path}")
    
    # 데이터베이스 연결
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with async_session() as db:
            # CSV 파일 읽기
            sales_data = []
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # 빈 행 건너뛰기
                    if not row.get('trans_id'):
                        continue
                    
                    # contract_date 파싱
                    contract_date = None
                    if row.get('contract_date'):
                        try:
                            contract_date = datetime.strptime(row['contract_date'], '%Y-%m-%d').date()
                        except:
                            pass
                    
                    # cancel_date 파싱
                    cancel_date = None
                    if row.get('cancel_date'):
                        try:
                            cancel_date = datetime.strptime(row['cancel_date'], '%Y-%m-%d').date()
                        except:
                            pass
                    
                    # created_at, updated_at 파싱
                    created_at = None
                    updated_at = None
                    if row.get('created_at'):
                        try:
                            created_at = datetime.strptime(row['created_at'], '%Y-%m-%d %H:%M:%S')
                        except:
                            pass
                    if row.get('updated_at'):
                        try:
                            updated_at = datetime.strptime(row['updated_at'], '%Y-%m-%d %H:%M:%S')
                        except:
                            pass
                    
                    # Sale 객체 생성
                    sale = Sale(
                        trans_id=int(row['trans_id']),
                        apt_id=int(row['apt_id']),
                        build_year=row.get('build_year') or None,
                        trans_type=row.get('trans_type', '매매'),
                        trans_price=int(row['trans_price']) if row.get('trans_price') else None,
                        exclusive_area=float(row['exclusive_area']),
                        floor=int(row['floor']),
                        building_num=row.get('building_num') or None,
                        contract_date=contract_date,
                        is_canceled=row.get('is_canceled', 'False').lower() == 'true',
                        cancel_date=cancel_date,
                        remarks=row.get('remarks') or None,
                        created_at=created_at,
                        updated_at=updated_at,
                        is_deleted=row.get('is_deleted', 'False').lower() == 'true' if row.get('is_deleted') else False
                    )
                    sales_data.append(sale)
            
            print(f"[INFO] {len(sales_data)}개 레코드 읽기 완료")
            
            # 기존 데이터 확인 (선택적 - 중복 체크)
            if sales_data:
                apt_id_to_check = sales_data[0].apt_id
                existing_count = await db.execute(
                    select(func.count(Sale.trans_id)).where(Sale.apt_id == apt_id_to_check)
                )
                existing = existing_count.scalar()
                print(f"[INFO] 기존 데이터 (apt_id={apt_id_to_check}): {existing}개")
            
            # 외래 키 제약 조건 일시적으로 비활성화 (더미 데이터 테스트용)
            print(f"[INFO] 외래 키 제약 조건 일시적으로 비활성화...")
            await db.execute(text("SET session_replication_role = 'replica';"))
            
            # 데이터 삽입
            print(f"[INFO] 데이터 삽입 중...")
            for sale in sales_data:
                db.add(sale)
            
            await db.commit()
            
            # 외래 키 제약 조건 다시 활성화
            print(f"[INFO] 외래 키 제약 조건 다시 활성화...")
            await db.execute(text("SET session_replication_role = 'origin';"))
            await db.commit()
            
            print(f"[OK] {len(sales_data)}개 레코드 삽입 완료!")
            
    except Exception as e:
        print(f"[ERROR] Import 실패: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(import_sales_csv())
