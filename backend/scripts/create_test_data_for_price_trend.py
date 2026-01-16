"""평당가 추이 API 테스트를 위한 더미 데이터 생성"""
import asyncio
import sys
from pathlib import Path
from datetime import date

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.core.config import settings
from app.models.apartment import Apartment
from app.models.sale import Sale

async def create_test_data():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with async_session() as db:
            # apt_id=1이 이미 있는지 확인
            existing_apt = await db.get(Apartment, 1)
            if not existing_apt:
                # 외래 키 제약 조건 일시적으로 비활성화
                print(f"[INFO] 외래 키 제약 조건 일시적으로 비활성화...")
                await db.execute(text("SET session_replication_role = 'replica';"))
                
                # 더미 아파트 생성
                dummy_apt = Apartment(
                    apt_id=1,
                    region_id=10843,
                    apt_name="테스트 아파트",
                    kapt_code="TEST001",
                    is_available=None,
                    is_deleted=False
                )
                db.add(dummy_apt)
                await db.commit()
                
                # 외래 키 제약 조건 다시 활성화
                await db.execute(text("SET session_replication_role = 'origin';"))
                await db.commit()
                print(f"✅ 더미 아파트 생성 완료: apt_id=1")
            
            # 기존 거래 데이터 확인
            from sqlalchemy import select, func
            result = await db.execute(
                select(func.count(Sale.trans_id)).where(Sale.apt_id == 1)
            )
            existing_count = result.scalar()
            
            if existing_count > 0:
                print(f"✅ apt_id=1에 이미 {existing_count}개 거래 데이터가 있습니다.")
                return
            
            # 외래 키 제약 조건 일시적으로 비활성화
            print(f"[INFO] 외래 키 제약 조건 일시적으로 비활성화...")
            await db.execute(text("SET session_replication_role = 'replica';"))
            
            # 더미 거래 데이터 생성 (2024년 1월~3월, 각 월별로 여러 거래)
            test_sales = [
                # 2024년 1월
                Sale(apt_id=1, trans_price=50000, exclusive_area=84.0, contract_date=date(2024, 1, 5), is_canceled=False, trans_type="매매", floor=5, build_year="2010"),
                Sale(apt_id=1, trans_price=52000, exclusive_area=84.0, contract_date=date(2024, 1, 15), is_canceled=False, trans_type="매매", floor=10, build_year="2010"),
                Sale(apt_id=1, trans_price=51000, exclusive_area=84.0, contract_date=date(2024, 1, 25), is_canceled=False, trans_type="매매", floor=7, build_year="2010"),
                # 2024년 2월
                Sale(apt_id=1, trans_price=53000, exclusive_area=84.0, contract_date=date(2024, 2, 10), is_canceled=False, trans_type="매매", floor=12, build_year="2010"),
                Sale(apt_id=1, trans_price=54000, exclusive_area=84.0, contract_date=date(2024, 2, 20), is_canceled=False, trans_type="매매", floor=15, build_year="2010"),
                # 2024년 3월
                Sale(apt_id=1, trans_price=55000, exclusive_area=84.0, contract_date=date(2024, 3, 5), is_canceled=False, trans_type="매매", floor=8, build_year="2010"),
                Sale(apt_id=1, trans_price=56000, exclusive_area=84.0, contract_date=date(2024, 3, 15), is_canceled=False, trans_type="매매", floor=20, build_year="2010"),
                Sale(apt_id=1, trans_price=54500, exclusive_area=84.0, contract_date=date(2024, 3, 25), is_canceled=False, trans_type="매매", floor=11, build_year="2010"),
            ]
            
            for sale in test_sales:
                db.add(sale)
            
            await db.commit()
            
            # 외래 키 제약 조건 다시 활성화
            print(f"[INFO] 외래 키 제약 조건 다시 활성화...")
            await db.execute(text("SET session_replication_role = 'origin';"))
            await db.commit()
            
            print(f"✅ {len(test_sales)}개 거래 데이터 생성 완료!")
            print(f"   - 2024-01: 3건")
            print(f"   - 2024-02: 2건")
            print(f"   - 2024-03: 3건")
            print(f"\n   예상 평당가 계산:")
            print(f"   - 2024-01: (50000+52000+51000) / (84*0.3025*3) = 153000 / 76.23 = 약 2,006 만원/평")
            print(f"   - 2024-02: (53000+54000) / (84*0.3025*2) = 107000 / 50.82 = 약 2,106 만원/평")
            print(f"   - 2024-03: (55000+56000+54500) / (84*0.3025*3) = 165500 / 76.23 = 약 2,171 만원/평")
            
    except Exception as e:
        print(f"[ERROR] 실패: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(create_test_data())
