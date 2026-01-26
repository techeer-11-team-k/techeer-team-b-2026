"""
거래 내역 API 엔드포인트

담당 기능:
- 최근 거래 내역 조회 (GET /transactions/recent)
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, or_

from app.api.v1.deps import get_db, get_current_user_optional
from app.models.account import Account
from app.models.sale import Sale
from app.models.rent import Rent
from app.models.apartment import Apartment
from app.models.state import State
from app.models.my_property import MyProperty
from app.models.favorite import FavoriteApartment
from app.schemas.transaction import TransactionResponse, TransactionListResponse
from app.crud.my_property import my_property as my_property_crud
from app.crud.favorite import favorite_apartment as favorite_apartment_crud

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/recent",
    response_model=TransactionListResponse,
    status_code=status.HTTP_200_OK,
    tags=["📋 Transactions (거래 내역)"],
    summary="최근 거래 내역 조회",
    description="매매와 전월세 거래를 통합하여 최근 거래 내역을 조회합니다. 필터를 통해 내 자산 또는 즐겨찾기 아파트의 거래만 조회할 수 있습니다.",
    responses={
        200: {"description": "조회 성공"},
        401: {"description": "인증 필요 (필터 사용 시)"},
        500: {"description": "서버 오류"}
    }
)
async def get_recent_transactions(
    limit: int = Query(10, ge=1, le=100, description="조회할 개수 (기본 10개, 최대 100개)"),
    filter_type: Optional[str] = Query(None, description="필터 타입: 'my_assets'(내 자산), 'favorites'(즐겨찾기), None(전체)"),
    months: int = Query(6, ge=1, le=120, description="조회할 기간 (개월, 기본 6개월, 최대 120개월)"),
    current_user: Optional[Account] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    최근 거래 내역 조회 API
    
    매매(sales)와 전월세(rents) 거래를 통합하여 최근 거래일 기준으로 정렬된 거래 내역을 반환합니다.
    필터를 통해 내 자산 또는 즐겨찾기 아파트의 거래만 조회할 수 있습니다.
    
    Args:
        limit: 조회할 거래 개수 (기본 10개, 최대 100개)
        filter_type: 필터 타입 ('my_assets': 내 자산, 'favorites': 즐겨찾기, None: 전체)
        current_user: 현재 로그인한 사용자 (필터 사용 시 필수)
        db: 데이터베이스 세션
    
    Returns:
        TransactionListResponse: 거래 내역 목록
    """
    try:
        # 필터 타입이 지정된 경우 사용자 인증 필요
        if filter_type and filter_type != 'all':
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="필터를 사용하려면 로그인이 필요합니다."
                )
        
        # 필터에 따라 apt_id 목록 가져오기
        filter_apt_ids: Optional[List[int]] = None
        if filter_type == 'my_assets' and current_user:
            # 내 자산 아파트 ID 목록 가져오기
            my_properties = await my_property_crud.get_by_account(
                db,
                account_id=current_user.account_id,
                skip=0,
                limit=100
            )
            filter_apt_ids = [prop.apt_id for prop in my_properties if prop.apt_id]
        elif filter_type == 'favorites' and current_user:
            # 즐겨찾기 아파트 ID 목록 가져오기
            favorite_apartments = await favorite_apartment_crud.get_by_account(
                db,
                account_id=current_user.account_id,
                skip=0,
                limit=100
            )
            filter_apt_ids = [fav.apt_id for fav in favorite_apartments if fav.apt_id]
        
        # 필터 조건 생성
        apt_filter = None
        rent_apt_filter = None
        if filter_apt_ids and len(filter_apt_ids) > 0:
            apt_filter = Sale.apt_id.in_(filter_apt_ids)
            rent_apt_filter = Rent.apt_id.in_(filter_apt_ids)
        elif filter_apt_ids is not None and len(filter_apt_ids) == 0:
            # 필터가 지정되었지만 결과가 없는 경우, 빈 결과 반환
            return TransactionListResponse(
                transactions=[],
                total=0,
                limit=limit
            )
        
        # 날짜 필터링: 최근 N개월 거래만 조회
        today = date.today()
        start_date = today - timedelta(days=months * 30)  # 대략 N개월 전
        
        # 1. 매매 거래 쿼리 (sales 테이블) - 아파트 정보 및 지역 정보 포함
        # NOTE:
        # - 일부 데이터에서 is_deleted가 NULL로 저장되어 있을 수 있습니다.
        #   다른 엔드포인트(apartments/{apt_id}/transactions)와 동일하게
        #   NULL도 "삭제 아님"으로 취급해 최근 거래 목록에서도 누락되지 않도록 합니다.
        sales_where_conditions = [
            (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
            (Sale.is_canceled == False) | (Sale.is_canceled.is_(None)),
            Sale.contract_date.isnot(None),
            Sale.contract_date >= start_date
        ]
        if apt_filter is not None:
            sales_where_conditions.append(apt_filter)
        
        sales_query = (
            select(
                Sale.trans_id,
                Sale.apt_id,
                Sale.contract_date.label("deal_date"),
                Sale.exclusive_area,
                Sale.floor,
                Sale.trans_price,
                Apartment.apt_name.label("apartment_name"),
                func.concat(State.city_name, " ", State.region_name).label("apartment_location")
            )
            .join(Apartment, Sale.apt_id == Apartment.apt_id, isouter=True)
            .join(State, Apartment.region_id == State.region_id, isouter=True)
            .where(and_(*sales_where_conditions))
            .order_by(desc(Sale.contract_date))
            .limit(limit * 2)  # 더 많이 가져와서 정렬 후 선택
        )
        
        # 2. 전월세 거래 쿼리 (rents 테이블) - 아파트 정보 및 지역 정보 포함
        rents_where_conditions = [
            (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
            Rent.deal_date.isnot(None),
            Rent.deal_date >= start_date
        ]
        if rent_apt_filter is not None:
            rents_where_conditions.append(rent_apt_filter)
        
        rents_query = (
            select(
                Rent.trans_id,
                Rent.apt_id,
                Rent.deal_date.label("deal_date"),
                Rent.exclusive_area,
                Rent.floor,
                Rent.deposit_price,
                Rent.monthly_rent,
                Rent.rent_type,
                Apartment.apt_name.label("apartment_name"),
                func.concat(State.city_name, " ", State.region_name).label("apartment_location")
            )
            .join(Apartment, Rent.apt_id == Apartment.apt_id, isouter=True)
            .join(State, Apartment.region_id == State.region_id, isouter=True)
            .where(and_(*rents_where_conditions))
            .order_by(desc(Rent.deal_date))
            .limit(limit * 2)  # 더 많이 가져와서 정렬 후 선택
        )
        
        # 3. 두 쿼리 각각 실행
        sales_result = await db.execute(sales_query)
        sales_rows = sales_result.all()
        
        rents_result = await db.execute(rents_query)
        rents_rows = rents_result.all()
        
        # 4. 결과를 통합 리스트로 변환
        all_transactions = []
        
        # 매매 거래 추가
        for row in sales_rows:
            all_transactions.append({
                'trans_id': row.trans_id,
                'apt_id': row.apt_id,
                'transaction_type': '매매',
                'deal_date': row.deal_date,
                'exclusive_area': float(row.exclusive_area),
                'floor': row.floor,
                'apartment_name': row.apartment_name,
                'apartment_location': row.apartment_location,
                'trans_price': row.trans_price,
                'deposit_price': None,
                'monthly_rent': None,
                'rent_type': None
            })
        
        # 전월세 거래 추가
        for row in rents_rows:
            # rent_type에 따라 '전세' 또는 '월세'로 표시
            transaction_type = '전세'
            if row.rent_type == "MONTHLY_RENT":
                transaction_type = '월세'
            elif row.rent_type == "JEONSE":
                transaction_type = '전세'
            
            all_transactions.append({
                'trans_id': row.trans_id,
                'apt_id': row.apt_id,
                'transaction_type': transaction_type,
                'deal_date': row.deal_date,
                'exclusive_area': float(row.exclusive_area),
                'floor': row.floor,
                'apartment_name': row.apartment_name,
                'apartment_location': row.apartment_location,
                'trans_price': None,
                'deposit_price': row.deposit_price,
                'monthly_rent': row.monthly_rent,
                'rent_type': row.rent_type
            })
        
        # 5. 거래일 기준으로 정렬 (최신순)
        # deal_date가 None인 경우는 제외되므로 안전하게 정렬 가능
        all_transactions.sort(key=lambda x: x['deal_date'] or date(1900, 1, 1), reverse=True)
        
        # 6. limit만큼만 선택
        all_transactions = all_transactions[:limit]
        
        # 7. 응답 데이터 구성
        transactions = []
        for trans in all_transactions:
            transaction = TransactionResponse(
                trans_id=trans['trans_id'],
                apt_id=trans['apt_id'],
                transaction_type=trans['transaction_type'],
                deal_date=trans['deal_date'],
                exclusive_area=trans['exclusive_area'],
                floor=trans['floor'],
                apartment_name=trans['apartment_name'],
                apartment_location=trans['apartment_location'],
                trans_price=trans['trans_price'],
                deposit_price=trans['deposit_price'],
                monthly_rent=trans['monthly_rent'],
                rent_type=trans['rent_type']
            )
            transactions.append(transaction)
        
        return TransactionListResponse(
            transactions=transactions,
            total=len(transactions),
            limit=limit
        )
        
    except Exception as e:
        import traceback
        error_msg = str(e) if str(e) else f"알 수 없는 오류: {type(e).__name__}"
        error_traceback = traceback.format_exc()
        logger.error(f"최근 거래 내역 조회 오류: {error_msg}\n{error_traceback}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"거래 내역 조회 중 오류가 발생했습니다: {error_msg}"
        )
