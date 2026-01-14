"""평당가 추이 API 테스트 스크립트"""
import asyncio
import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.services.apartment import apartment_service

async def test():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with async_session() as db:
            print("=" * 60)
            print("평당가 추이 API 테스트")
            print("=" * 60)
            
            # 먼저 데이터가 있는 apt_id 찾기
            from sqlalchemy import select, func
            from app.models.sale import Sale
            
            # 거래 데이터가 있는 apt_id 찾기
            result = await db.execute(
                select(Sale.apt_id, func.count(Sale.trans_id))
                .where(
                    Sale.contract_date.isnot(None),
                    Sale.trans_price.isnot(None),
                    Sale.exclusive_area.isnot(None),
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                )
                .group_by(Sale.apt_id)
                .order_by(func.count(Sale.trans_id).desc())
                .limit(1)
            )
            row = result.first()
            
            if not row:
                print("❌ 테스트할 데이터가 없습니다. sales 테이블에 거래 데이터가 필요합니다.")
                return
            
            apt_id = row[0]
            transaction_count = row[1]
            print(f"\n📊 테스트 대상: apt_id={apt_id} (거래 건수: {transaction_count}건)")
            
            # 평당가 추이 API 호출
            result = await apartment_service.get_price_trend(db, apt_id=apt_id)
            
            print(f"\n✅ API 호출 성공!")
            print(f"   apt_id: {result.apt_id}")
            print(f"   총 {len(result.data)}개월 데이터")
            print(f"\n   월별 평당가:")
            for item in result.data:
                print(f"     {item.year_month}: {item.price_per_pyeong:,.2f} 만원/평")
            
            print("=" * 60)
            
    except Exception as e:
        print(f"❌ API 호출 실패: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test())
