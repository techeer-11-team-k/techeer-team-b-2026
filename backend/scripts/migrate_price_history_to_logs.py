"""
과거 실거래가 데이터를 기반으로 가격 변동 로그 생성

실행 방법:
    python backend/scripts/migrate_price_history_to_logs.py
    
또는 Docker 컨테이너 내에서:
    docker exec realestate-backend python /app/scripts/migrate_price_history_to_logs.py
"""
import asyncio
import sys
from pathlib import Path
from datetime import datetime, timedelta, date
from typing import Dict, Set, Tuple

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func, and_, or_, desc
from app.core.config import settings
from app.models.my_property import MyProperty
from app.models.favorite import FavoriteApartment
from app.models.sale import Sale
from app.models.asset_activity_log import AssetActivityLog
from app.schemas.asset_activity_log import AssetActivityLogCreate
from app.services.asset_activity_service import create_activity_log


async def migrate_price_history():
    """과거 실거래가 데이터를 기반으로 가격 변동 로그 생성"""
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with async_session() as db:
            print("\n" + "="*60)
            print(" 과거 실거래가 데이터 기반 가격 변동 로그 생성")
            print("="*60)
            
            # 1. my_properties와 favorite_apartments에 등록된 모든 아파트 ID 수집
            print("\n1⃣ 등록된 아파트 조회 중...")
            
            # MY_ASSET 아파트들 (account_id, apt_id 쌍)
            properties_result = await db.execute(
                select(MyProperty.account_id, MyProperty.apt_id).where(
                    MyProperty.is_deleted == False
                )
            )
            my_asset_apartments: Dict[Tuple[int, int], str] = {
                (row.account_id, row.apt_id): "MY_ASSET"
                for row in properties_result.all()
            }
            
            # INTEREST 아파트들 (account_id, apt_id 쌍)
            favorites_result = await db.execute(
                select(FavoriteApartment.account_id, FavoriteApartment.apt_id).where(
                    FavoriteApartment.is_deleted == False,
                    FavoriteApartment.account_id.isnot(None)
                )
            )
            interest_apartments: Dict[Tuple[int, int], str] = {
                (row.account_id, row.apt_id): "INTEREST"
                for row in favorites_result.all()
            }
            
            # 모든 아파트 통합
            all_apartments = {**my_asset_apartments, **interest_apartments}
            
            if not all_apartments:
                print(" 등록된 아파트가 없습니다.")
                return
            
            print(f"   - MY_ASSET: {len(my_asset_apartments)}개")
            print(f"   - INTEREST: {len(interest_apartments)}개")
            print(f"   - 전체: {len(all_apartments)}개")
            
            # 2. 각 아파트별로 과거 1년 실거래가 조회 및 가격 변동 로그 생성
            print("\n2⃣ 실거래가 히스토리 조회 및 가격 변동 로그 생성 중...")
            
            # 과거 1년 기간 설정
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=365)
            
            total_logs_created = 0
            total_logs_skipped = 0
            total_errors = 0
            errors = []
            
            # 아파트별로 처리 (1초에 5개씩)
            apartment_list = list(all_apartments.items())
            total_apartments = len(apartment_list)
            
            for idx, ((account_id, apt_id), category) in enumerate(apartment_list, 1):
                try:
                    # 실거래가 데이터 조회 (과거 1년, 취소되지 않은 거래만, 계약일 기준 정렬)
                    sales_result = await db.execute(
                        select(Sale).where(
                            Sale.apt_id == apt_id,
                            Sale.contract_date >= start_date,
                            Sale.contract_date <= end_date,
                            Sale.is_canceled == False,
                            Sale.trans_price.isnot(None)
                        ).order_by(Sale.contract_date.asc())
                    )
                    sales = sales_result.scalars().all()
                    
                    if len(sales) < 2:
                        # 최소 2개 이상의 거래가 있어야 가격 변동 비교 가능
                        continue
                    
                    # 가격 변동 체크 (이전 거래가 대비 1% 이상 변동 시 로그 생성)
                    previous_price = None
                    previous_date = None
                    
                    for sale in sales:
                        if sale.trans_price is None:
                            continue
                        
                        current_price = sale.trans_price
                        current_date = sale.contract_date
                        
                        if previous_price is not None and current_date is not None:
                            # 가격 변동률 계산
                            price_change_ratio = abs(current_price - previous_price) / previous_price if previous_price > 0 else 0
                            
                            # 1% 이상 변동 시 로그 생성
                            if price_change_ratio >= 0.01:
                                # 중복 체크: 같은 날짜에 동일한 변동 로그가 있는지 확인
                                existing_log_result = await db.execute(
                                    select(AssetActivityLog).where(
                                        AssetActivityLog.account_id == account_id,
                                        AssetActivityLog.apt_id == apt_id,
                                        AssetActivityLog.category == category,
                                        AssetActivityLog.event_type.in_(["PRICE_UP", "PRICE_DOWN"]),
                                        func.date(AssetActivityLog.created_at) == current_date
                                    )
                                )
                                existing_log = existing_log_result.scalar_one_or_none()
                                
                                if existing_log:
                                    total_logs_skipped += 1
                                    continue
                                
                                # 가격 변동액 계산
                                price_change = current_price - previous_price
                                event_type = "PRICE_UP" if price_change > 0 else "PRICE_DOWN"
                                
                                # 로그 생성
                                log_data = AssetActivityLogCreate(
                                    account_id=account_id,
                                    apt_id=apt_id,
                                    category=category,
                                    event_type=event_type,
                                    price_change=abs(price_change),
                                    previous_price=previous_price,
                                    current_price=current_price
                                )
                                
                                # created_at을 실거래가 발생일로 설정
                                sale_datetime = datetime.combine(current_date, datetime.min.time())
                                await create_activity_log(db, log_data, created_at=sale_datetime)
                                
                                total_logs_created += 1
                                
                                if total_logs_created % 50 == 0:
                                    await db.commit()
                                    print(f"    중간 커밋 완료 ({total_logs_created}개 로그 생성)")
                        
                        previous_price = current_price
                        previous_date = current_date
                    
                    # 진행 상황 출력 (10개마다)
                    if idx % 10 == 0:
                        print(f"   진행 중: {idx}/{total_apartments} ({idx*100//total_apartments}%)")
                    
                    # 1초에 5개씩 처리 (Rate Limit 방지)
                    if idx % 5 == 0:
                        await asyncio.sleep(1)
                
                except Exception as e:
                    total_errors += 1
                    error_msg = f"account_id={account_id}, apt_id={apt_id}: {str(e)}"
                    errors.append(error_msg)
                    print(f"    오류: {error_msg}")
                    await db.rollback()
            
            # 최종 커밋
            if total_logs_created > 0:
                await db.commit()
                print(f"\n 최종 커밋 완료")
            
            # 결과 출력
            print("\n" + "="*60)
            print(" 마이그레이션 완료!")
            print("="*60)
            print(f" 생성된 로그: {total_logs_created}개")
            print(f"⏭  스킵된 로그: {total_logs_skipped}개 (이미 존재)")
            print(f" 오류: {total_errors}개")
            print("="*60)
            
            if errors:
                print("\n  오류 상세 (최대 10개):")
                for error in errors[:10]:
                    print(f"  - {error}")
                if len(errors) > 10:
                    print(f"  ... 외 {len(errors) - 10}개 오류")
            
            # 검증: 생성된 로그 수 확인
            if total_logs_created > 0:
                print("\n 마이그레이션 결과 검증 중...")
                verify_result = await db.execute(
                    select(AssetActivityLog).where(
                        AssetActivityLog.event_type.in_(["PRICE_UP", "PRICE_DOWN"])
                    )
                )
                price_logs = verify_result.scalars().all()
                print(f" asset_activity_logs 테이블에 가격 변동 로그 {len(price_logs)}개 확인됨")
            
    except Exception as e:
        print(f"\n 치명적 오류: {str(e)}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate_price_history())
