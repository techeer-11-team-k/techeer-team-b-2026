"""더미 데이터 조회 스크립트"""
import asyncio
import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func
from app.core.config import settings
from app.models.apartment import Apartment
from app.models.sale import Sale

async def show_data():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with async_session() as db:
            print("=" * 80)
            print("더미 데이터 조회")
            print("=" * 80)
            
            # 아파트 정보 조회
            apt = await db.get(Apartment, 1)
            if apt:
                print(f"\n 아파트 정보 (apt_id=1):")
                print(f"   - 아파트명: {apt.apt_name}")
                print(f"   - 지역 ID: {apt.region_id}")
                print(f"   - 국토부 코드: {apt.kapt_code}")
                print(f"   - 삭제 여부: {apt.is_deleted}")
            else:
                print("\n apt_id=1인 아파트가 없습니다.")
                return
            
            # 거래 데이터 조회
            result = await db.execute(
                select(Sale)
                .where(Sale.apt_id == 1)
                .order_by(Sale.contract_date)
            )
            sales = result.scalars().all()
            
            if not sales:
                print("\n 거래 데이터가 없습니다.")
                return
            
            print(f"\n 거래 데이터 (총 {len(sales)}건):")
            print("-" * 80)
            print(f"{'거래ID':<8} {'계약일':<12} {'거래가격(만원)':<15} {'전용면적(㎡)':<15} {'평수':<10} {'층':<5}")
            print("-" * 80)
            
            total_price = 0
            total_pyeong = 0
            
            for sale in sales:
                pyeong = float(sale.exclusive_area) * 0.3025
                total_price += sale.trans_price or 0
                total_pyeong += pyeong
                
                contract_date_str = sale.contract_date.strftime("%Y-%m-%d") if sale.contract_date else "N/A"
                price_str = f"{sale.trans_price:,}" if sale.trans_price else "N/A"
                area_str = f"{sale.exclusive_area:.2f}" if sale.exclusive_area else "N/A"
                pyeong_str = f"{pyeong:.2f}"
                
                print(f"{sale.trans_id:<8} {contract_date_str:<12} {price_str:<15} {area_str:<15} {pyeong_str:<10} {sale.floor:<5}")
            
            print("-" * 80)
            print(f"\n 집계 정보:")
            print(f"   - 총 거래가격: {total_price:,} 만원")
            print(f"   - 총 평수: {total_pyeong:.2f} 평")
            print(f"   - 전체 평당가: {total_price / total_pyeong:,.2f} 만원/평")
            
            # 월별 집계
            print(f"\n 월별 집계:")
            print("-" * 80)
            
            from sqlalchemy import extract
            result = await db.execute(
                select(
                    extract('year', Sale.contract_date).label('year'),
                    extract('month', Sale.contract_date).label('month'),
                    func.sum(Sale.trans_price).label('total_price'),
                    func.sum(Sale.exclusive_area * 0.3025).label('total_pyeong'),
                    func.count(Sale.trans_id).label('count')
                )
                .where(
                    Sale.apt_id == 1,
                    Sale.contract_date.isnot(None),
                    Sale.trans_price.isnot(None),
                    Sale.exclusive_area.isnot(None)
                )
                .group_by(
                    extract('year', Sale.contract_date),
                    extract('month', Sale.contract_date)
                )
                .order_by(
                    extract('year', Sale.contract_date),
                    extract('month', Sale.contract_date)
                )
            )
            
            monthly_data = result.all()
            
            for row in monthly_data:
                year = int(row.year)
                month = int(row.month)
                total_price_month = float(row.total_price)
                total_pyeong_month = float(row.total_pyeong)
                count = row.count
                price_per_pyeong = total_price_month / total_pyeong_month
                
                print(f"   {year}-{month:02d}: {count}건, 총 {total_price_month:,.0f}만원 / {total_pyeong_month:.2f}평 = {price_per_pyeong:,.2f} 만원/평")
            
            print("=" * 80)
            
    except Exception as e:
        print(f" 조회 실패: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(show_data())
