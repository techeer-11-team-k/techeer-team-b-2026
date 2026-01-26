"""
자산 활동 내역 로그 서비스

사용자의 아파트 추가/삭제 및 가격 변동 이력을 기록하는 서비스
"""
import logging
import sys
from datetime import datetime, date
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc

from app.models.asset_activity_log import AssetActivityLog
from app.schemas.asset_activity_log import AssetActivityLogCreate

# 로거 설정
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)


async def create_activity_log(
    db: AsyncSession,
    log_data: AssetActivityLogCreate,
    created_at: Optional[datetime] = None
) -> AssetActivityLog:
    """
    활동 로그 생성
    
    Args:
        db: 데이터베이스 세션
        log_data: 로그 데이터
        created_at: 생성일시 (지정하지 않으면 현재 시간 사용)
        
    Returns:
        생성된 AssetActivityLog 객체
    """
    db_log = AssetActivityLog(
        account_id=log_data.account_id,
        apt_id=log_data.apt_id,
        category=log_data.category,
        event_type=log_data.event_type,
        price_change=log_data.price_change,
        previous_price=log_data.previous_price,
        current_price=log_data.current_price,
        meta_data=log_data.metadata,
        created_at=created_at if created_at else datetime.utcnow()
    )
    
    db.add(db_log)
    await db.commit()
    await db.refresh(db_log)
    
    logger.info(
        f" 활동 로그 생성 완료 - "
        f"id: {db_log.id}, account_id: {db_log.account_id}, "
        f"apt_id: {db_log.apt_id}, category: {db_log.category}, "
        f"event_type: {db_log.event_type}"
    )
    
    return db_log


async def log_apartment_added(
    db: AsyncSession,
    account_id: int,
    apt_id: int,
    category: str,
    current_price: Optional[int] = None
) -> None:
    """
    아파트 추가 로그 생성
    
    Args:
        db: 데이터베이스 세션
        account_id: 계정 ID
        apt_id: 아파트 ID
        category: 카테고리 ('MY_ASSET' 또는 'INTEREST')
        current_price: 현재 가격 (만원 단위, 선택)
    """
    log_data = AssetActivityLogCreate(
        account_id=account_id,
        apt_id=apt_id,
        category=category,
        event_type="ADD",
        current_price=current_price
    )
    
    await create_activity_log(db, log_data)


async def log_apartment_deleted(
    db: AsyncSession,
    account_id: int,
    apt_id: int,
    category: str
) -> None:
    """
    아파트 삭제 로그 생성
    
    Args:
        db: 데이터베이스 세션
        account_id: 계정 ID
        apt_id: 아파트 ID
        category: 카테고리 ('MY_ASSET' 또는 'INTEREST')
    """
    log_data = AssetActivityLogCreate(
        account_id=account_id,
        apt_id=apt_id,
        category=category,
        event_type="DELETE"
    )
    
    await create_activity_log(db, log_data)


async def log_price_change(
    db: AsyncSession,
    account_id: int,
    apt_id: int,
    category: str,
    previous_price: int,
    current_price: int,
    created_at: Optional[datetime] = None
) -> None:
    """
    가격 변동 로그 생성
    
    Args:
        db: 데이터베이스 세션
        account_id: 계정 ID
        apt_id: 아파트 ID
        category: 카테고리 ('MY_ASSET' 또는 'INTEREST')
        previous_price: 변동 전 가격 (만원 단위)
        current_price: 변동 후 가격 (만원 단위)
    """
    # 가격 변동액 계산
    price_change = current_price - previous_price
    
    # 이벤트 타입 결정
    event_type = "PRICE_UP" if price_change > 0 else "PRICE_DOWN"
    
    log_data = AssetActivityLogCreate(
        account_id=account_id,
        apt_id=apt_id,
        category=category,
        event_type=event_type,
        price_change=abs(price_change),  # 절댓값으로 저장
        previous_price=previous_price,
        current_price=current_price
    )
    
    await create_activity_log(db, log_data, created_at=created_at)
    
    logger.info(
        f" 가격 변동 로그 생성 - "
        f"account_id: {account_id}, apt_id: {apt_id}, "
        f"이전: {previous_price}만원 → 현재: {current_price}만원, "
        f"변동: {price_change:+}만원 ({event_type})"
    )


async def trigger_price_change_log_if_needed(
    db: AsyncSession,
    apt_id: int,
    new_price: int,
    sale_date: Optional[date] = None
) -> None:
    """
    실거래가 업데이트 시 가격 변동 로그 생성 트리거
    
    my_properties와 favorite_apartments에 등록된 아파트인 경우,
    기존 가격과 새 가격을 비교하여 1% 이상 변동 시 로그를 생성합니다.
    
    Args:
        db: 데이터베이스 세션
        apt_id: 아파트 ID
        new_price: 새로운 실거래가 (만원 단위)
        sale_date: 실거래가 발생일 (지정하지 않으면 현재 날짜 사용)
    """
    try:
        # 1. my_properties와 favorite_apartments에 등록된 아파트인지 확인
        from app.models.my_property import MyProperty
        from app.models.favorite import FavoriteApartment
        from app.models.sale import Sale
        from sqlalchemy import select, func
        
        # MY_ASSET 아파트들 조회
        my_properties_result = await db.execute(
            select(MyProperty.account_id, MyProperty.apt_id, MyProperty.current_market_price).where(
                MyProperty.apt_id == apt_id,
                MyProperty.is_deleted == False
            )
        )
        my_properties = my_properties_result.all()
        
        # INTEREST 아파트들 조회
        favorites_result = await db.execute(
            select(FavoriteApartment.account_id, FavoriteApartment.apt_id).where(
                FavoriteApartment.apt_id == apt_id,
                FavoriteApartment.is_deleted == False,
                FavoriteApartment.account_id.isnot(None)
            )
        )
        favorites = favorites_result.all()
        
        if not my_properties and not favorites:
            # 등록된 아파트가 없으면 로그 생성하지 않음
            return
        
        # 2. 기존 최신 실거래가 조회 (이전 가격으로 사용)
        # 최근 1년 기간 내의 거래만 조회 (요구사항: 1년 기간)
        from datetime import timedelta
        one_year_ago = datetime.now().date() - timedelta(days=365)
        
        previous_sale_result = await db.execute(
            select(Sale).where(
                Sale.apt_id == apt_id,
                Sale.is_canceled == False,
                Sale.trans_price.isnot(None),
                Sale.contract_date >= one_year_ago  # 최근 1년 기간 내 거래만
            ).order_by(Sale.contract_date.desc()).limit(2)
        )
        previous_sales = previous_sale_result.scalars().all()
        
        # 이전 가격 결정: 두 번째로 최근 거래가 (가장 최근은 현재 거래)
        previous_price = None
        if len(previous_sales) >= 2:
            # 최근 1년 내에 2개 이상 거래가 있으면 두 번째 거래가를 이전 가격으로 사용
            previous_price = previous_sales[1].trans_price
        elif len(previous_sales) == 1:
            # 최근 1년 내 첫 거래인 경우, 로그 생성하지 않음 (비교할 이전 가격이 없음)
            # 첫 거래는 가격 변동을 비교할 수 없으므로 스킵
            return
        
        if previous_price is None:
            # 이전 가격이 없으면 로그 생성하지 않음
            return
        
        # 3. 가격 변동률 계산 (1% 이상 변동 시에만 로그 생성)
        price_change_ratio = abs(new_price - previous_price) / previous_price if previous_price > 0 else 0
        
        if price_change_ratio < 0.01:
            # 1% 미만 변동은 로그 생성하지 않음
            return
        
        # 4. 중복 체크: 같은 날짜에 동일한 변동 로그가 있는지 확인
        check_date = sale_date if sale_date else datetime.now().date()
        
        # 5. 각 등록된 아파트에 대해 로그 생성
        for property in my_properties:
            account_id = property.account_id
            
            # 중복 체크
            existing_log_result = await db.execute(
                select(AssetActivityLog).where(
                    AssetActivityLog.account_id == account_id,
                    AssetActivityLog.apt_id == apt_id,
                    AssetActivityLog.category == "MY_ASSET",
                    AssetActivityLog.event_type.in_(["PRICE_UP", "PRICE_DOWN"]),
                    func.date(AssetActivityLog.created_at) == check_date
                )
            )
            existing_log = existing_log_result.scalar_one_or_none()
            
            if existing_log:
                continue
            
            # 로그 생성
            await log_price_change(
                db,
                account_id=account_id,
                apt_id=apt_id,
                category="MY_ASSET",
                previous_price=previous_price,
                current_price=new_price
            )
        
        for favorite in favorites:
            account_id = favorite.account_id
            
            # 중복 체크
            existing_log_result = await db.execute(
                select(AssetActivityLog).where(
                    AssetActivityLog.account_id == account_id,
                    AssetActivityLog.apt_id == apt_id,
                    AssetActivityLog.category == "INTEREST",
                    AssetActivityLog.event_type.in_(["PRICE_UP", "PRICE_DOWN"]),
                    func.date(AssetActivityLog.created_at) == check_date
                )
            )
            existing_log = existing_log_result.scalar_one_or_none()
            
            if existing_log:
                continue
            
            # 로그 생성
            await log_price_change(
                db,
                account_id=account_id,
                apt_id=apt_id,
                category="INTEREST",
                previous_price=previous_price,
                current_price=new_price
            )
    
    except Exception as e:
        # 트리거 실패해도 실거래가 저장은 성공으로 처리
        logger.warning(
            f" 가격 변동 로그 트리거 실패 - "
            f"apt_id: {apt_id}, new_price: {new_price}, "
            f"에러: {type(e).__name__}: {str(e)}"
        )


async def generate_historical_price_change_logs(
    db: AsyncSession,
    account_id: int,
    apt_id: int,
    category: str,
    purchase_date: Optional[date] = None
) -> None:
    """
    아파트 추가 시 과거 실거래가 데이터를 기반으로 가격 변동 로그 생성
    
    Args:
        db: 데이터베이스 세션
        account_id: 계정 ID
        apt_id: 아파트 ID
        category: 카테고리 ('MY_ASSET' 또는 'INTEREST')
        purchase_date: 매입일 (내 아파트인 경우만, 선택)
    
    기간 설정:
    - 내 아파트 (MY_ASSET):
      - 매입일이 있으면: 매입일 3개월 전부터 현재까지
      - 매입일이 없으면: 6개월 전부터 현재까지
    - 관심 목록 (INTEREST):
      - 6개월 전부터 현재까지
    """
    try:
        from app.models.sale import Sale
        from datetime import timedelta
        from sqlalchemy import select, func
        
        logger.info(
            f" 과거 가격 변동 로그 생성 시작 - "
            f"account_id: {account_id}, apt_id: {apt_id}, category: {category}, "
            f"purchase_date: {purchase_date}"
        )
        
        # 기간 설정
        end_date = datetime.now().date()
        
        if category == "MY_ASSET" and purchase_date:
            # 내 아파트이고 매입일이 있는 경우: 매입일 3개월 전부터
            start_date = purchase_date - timedelta(days=90)  # 약 3개월
            logger.info(
                f" 조회 기간: {start_date} ~ {end_date} (매입일 {purchase_date} 기준 3개월 전부터)"
            )
        else:
            # 내 아파트(매입일 없음) 또는 관심 목록: 6개월 전부터
            start_date = end_date - timedelta(days=180)  # 약 6개월
            period_desc = "6개월" if category == "INTEREST" else "6개월 (매입일 없음)"
            logger.info(
                f" 조회 기간: {start_date} ~ {end_date} ({period_desc})"
            )
        
        # 실거래가 데이터 조회 (과거 1년, 취소되지 않은 거래만, 계약일 기준 정렬)
        sales_result = await db.execute(
            select(Sale).where(
                Sale.apt_id == apt_id,
                Sale.is_canceled == False,
                Sale.trans_price.isnot(None),
                Sale.contract_date >= start_date,
                Sale.contract_date <= end_date
            ).order_by(Sale.contract_date.asc())
        )
        sales = list(sales_result.scalars().all())
        
        logger.info(
            f" 조회된 거래 개수: {len(sales)}개"
        )
        
        if len(sales) < 2:
            # 조회 기간 내 거래가 2개 미만이면 가격 비교 불가
            period_desc = f"{start_date} ~ {end_date}"
            logger.warning(
                f"⏭ 가격 변동 로그 생성 스킵 - "
                f"account_id: {account_id}, apt_id: {apt_id}, "
                f"이유: 기간 내 거래 {len(sales)}개 (2개 이상 필요), 기간: {period_desc}"
            )
            return
        
        # 연속된 거래 간 가격 변동 확인
        logs_created = 0
        logs_skipped = 0
        
        for i in range(1, len(sales)):
            previous_sale = sales[i - 1]
            current_sale = sales[i]
            
            previous_price = previous_sale.trans_price
            current_price = current_sale.trans_price
            
            if previous_price is None or current_price is None or previous_price == 0:
                logs_skipped += 1
                logger.debug(
                    f"⏭ 거래 {i} 스킵 - 가격 정보 없음: "
                    f"이전={previous_price}, 현재={current_price}"
                )
                continue
            
            # 가격 변동률 계산
            price_change_ratio = abs(current_price - previous_price) / previous_price
            
            logger.debug(
                f" 거래 {i} 가격 변동 확인 - "
                f"이전: {previous_price}만원, 현재: {current_price}만원, "
                f"변동률: {price_change_ratio*100:.2f}%"
            )
            
            if price_change_ratio < 0.01:  # 1% 미만 변동은 스킵
                logs_skipped += 1
                logger.debug(
                    f"⏭ 거래 {i} 스킵 - 변동률 {price_change_ratio*100:.2f}% < 1%"
                )
                continue
            
            # 중복 체크: 같은 날짜에 동일한 변동 로그가 있는지 확인
            check_date = current_sale.contract_date
            
            existing_log_result = await db.execute(
                select(AssetActivityLog).where(
                    AssetActivityLog.account_id == account_id,
                    AssetActivityLog.apt_id == apt_id,
                    AssetActivityLog.category == category,
                    AssetActivityLog.event_type.in_(["PRICE_UP", "PRICE_DOWN"]),
                    func.date(AssetActivityLog.created_at) == check_date
                )
            )
            existing_log = existing_log_result.scalar_one_or_none()
            
            if existing_log:
                continue
            
            # 가격 변동 로그 생성
            await log_price_change(
                db,
                account_id=account_id,
                apt_id=apt_id,
                category=category,
                previous_price=previous_price,
                current_price=current_price,
                created_at=datetime.combine(check_date, datetime.min.time())
            )
            
            logs_created += 1
            logger.info(
                f" 과거 가격 변동 로그 생성 - "
                f"account_id: {account_id}, apt_id: {apt_id}, "
                f"category: {category}, date: {check_date}, "
                f"변동률: {price_change_ratio*100:.2f}%"
            )
        
        logger.info(
            f" 과거 가격 변동 로그 생성 완료 - "
            f"account_id: {account_id}, apt_id: {apt_id}, category: {category}, "
            f"기간: {start_date} ~ {end_date}, "
            f"생성: {logs_created}개, 스킵: {logs_skipped}개"
        )
    
    except Exception as e:
        # 로그 생성 실패해도 아파트 추가는 성공으로 처리
        import traceback
        logger.error(
            f" 과거 가격 변동 로그 생성 실패 - "
            f"account_id: {account_id}, apt_id: {apt_id}, category: {category}, "
            f"에러: {type(e).__name__}: {str(e)}\n"
            f"Traceback: {traceback.format_exc()}"
        )


async def get_user_activity_logs(
    db: AsyncSession,
    account_id: int,
    category: Optional[str] = None,
    event_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 100,
    skip: int = 0
) -> List[AssetActivityLog]:
    """
    사용자의 활동 로그 조회
    
    Args:
        db: 데이터베이스 세션
        account_id: 계정 ID
        category: 카테고리 필터 (선택)
        event_type: 이벤트 타입 필터 (선택)
        start_date: 시작 날짜 (선택)
        end_date: 종료 날짜 (선택)
        limit: 최대 개수 (기본값: 100)
        skip: 건너뛸 개수 (기본값: 0)
        
    Returns:
        AssetActivityLog 객체 목록 (최신순)
    """
    # 기본 쿼리 구성
    query = select(AssetActivityLog).where(
        AssetActivityLog.account_id == account_id
    )
    
    # 필터 추가
    if category:
        query = query.where(AssetActivityLog.category == category)
    
    if event_type:
        query = query.where(AssetActivityLog.event_type == event_type)
    
    if start_date:
        query = query.where(AssetActivityLog.created_at >= start_date)
    
    if end_date:
        query = query.where(AssetActivityLog.created_at <= end_date)
    
    # 정렬 및 제한
    query = query.order_by(desc(AssetActivityLog.created_at)).offset(skip).limit(limit)
    
    result = await db.execute(query)
    logs = list(result.scalars().all())
    
    logger.info(
        f" 활동 로그 조회 완료 - "
        f"account_id: {account_id}, 결과: {len(logs)}개"
    )
    
    return logs


async def delete_activity_logs_by_apartment(
    db: AsyncSession,
    account_id: int,
    apt_id: int,
    category: str
) -> int:
    """
    특정 아파트의 활동 로그 삭제
    
    관심 목록에서 아파트를 삭제할 때, 해당 아파트의 관심 목록 관련 로그만 삭제합니다.
    내 아파트의 경우 로그는 유지합니다.
    
    Args:
        db: 데이터베이스 세션
        account_id: 계정 ID
        apt_id: 아파트 ID
        category: 카테고리 ('MY_ASSET' 또는 'INTEREST')
        
    Returns:
        삭제된 로그 개수
    """
    try:
        from sqlalchemy import delete
        
        logger.info(
            f" 활동 로그 삭제 시작 - "
            f"account_id: {account_id}, apt_id: {apt_id}, category: {category}"
        )
        
        # 해당 카테고리의 로그만 삭제
        delete_stmt = delete(AssetActivityLog).where(
            AssetActivityLog.account_id == account_id,
            AssetActivityLog.apt_id == apt_id,
            AssetActivityLog.category == category
        )
        
        result = await db.execute(delete_stmt)
        deleted_count = result.rowcount
        
        await db.commit()
        
        logger.info(
            f" 활동 로그 삭제 완료 - "
            f"account_id: {account_id}, apt_id: {apt_id}, category: {category}, "
            f"삭제된 로그: {deleted_count}개"
        )
        
        return deleted_count
    
    except Exception as e:
        await db.rollback()
        import traceback
        logger.error(
            f" 활동 로그 삭제 실패 - "
            f"account_id: {account_id}, apt_id: {apt_id}, category: {category}, "
            f"에러: {type(e).__name__}: {str(e)}\n"
            f"Traceback: {traceback.format_exc()}"
        )
        raise
