"""
대시보드 관련 API 엔드포인트

담당 기능:
- 전국 평당가 및 거래량 추이 조회
- 월간 아파트 값 추이 조회
- 랭킹 조회 (요즘 관심 많은 아파트, 상승률, 하락률 TOP 5)
"""
import logging
import asyncio
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case, desc, text
from sqlalchemy.orm import selectinload

from app.api.v1.deps import get_db
from app.models.apartment import Apartment
from app.models.sale import Sale
from app.models.rent import Rent
from app.models.state import State
from app.utils.cache import get_from_cache, set_to_cache, build_cache_key

logger = logging.getLogger(__name__)

router = APIRouter()


def get_transaction_table(transaction_type: str):
    """거래 유형에 따른 테이블 반환"""
    if transaction_type == "sale":
        return Sale
    elif transaction_type == "jeonse":
        return Rent
    else:
        return Sale


def get_price_field(transaction_type: str, table):
    """거래 유형에 따른 가격 필드 반환"""
    if transaction_type == "sale":
        return table.trans_price
    elif transaction_type == "jeonse":
        return table.deposit_price
    else:
        return table.trans_price


def get_date_field(transaction_type: str, table):
    """거래 유형에 따른 날짜 필드 반환"""
    if transaction_type == "sale":
        return table.contract_date
    elif transaction_type == "jeonse":
        return table.deal_date
    else:
        return table.contract_date


@router.get(
    "/summary",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["📊 Dashboard (대시보드)"],
    summary="대시보드 요약 데이터 조회",
    description="""
    전국 평당가 및 거래량 추이, 월간 아파트 값 추이 데이터를 조회합니다.
    
    ### 제공 데이터
    1. **전국 평당가 추이**: 최근 6개월간 월별 평당가 평균
    2. **전국 거래량 추이**: 최근 6개월간 월별 거래 건수
    3. **월간 아파트 값 추이**: 전국 vs 주요 지역 비교 (최근 12개월)
    
    ### Query Parameters
    - `transaction_type`: 거래 유형 (sale: 매매, jeonse: 전세, 기본값: sale)
    - `months`: 조회 기간 (개월, 기본값: 6, 최대: 12)
    """
)
async def get_dashboard_summary(
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세)"),
    months: int = Query(6, ge=1, le=12, description="조회 기간 (개월)"),
    db: AsyncSession = Depends(get_db)
):
    """
    대시보드 요약 데이터 조회
    
    전국 평당가 및 거래량 추이, 월간 아파트 값 추이를 반환합니다.
    """
    # 캐시 키 생성
    cache_key = build_cache_key("dashboard", "summary", transaction_type, str(months))
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return cached_data
    
    try:
        # 2. 캐시 미스: 데이터베이스에서 조회
        trans_table = get_transaction_table(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        date_field = get_date_field(transaction_type, trans_table)
        
        # 필터 조건 (trans_table 사용)
        if transaction_type == "sale":
            base_filter = and_(
                trans_table.is_canceled == False,
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                trans_table.trans_price.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        else:  # jeonse
            base_filter = and_(
                trans_table.monthly_rent == 0,  # 전세만 (월세 제외)
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                trans_table.deposit_price.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        
        # 시작 날짜 계산 (N개월 전)
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=months * 30)
        
        # 월별 그룹화를 위한 표현식
        month_expr = func.to_char(date_field, 'YYYY-MM')
        
        # 1. 전국 평당가 추이 (월별)
        # exclusive_area가 0이거나 NULL인 경우를 명시적으로 필터링하고,
        # 평당가 계산 시 NULL 값이 발생하지 않도록 처리
        price_trend_stmt = (
            select(
                month_expr.label('month'),
                func.avg(
                    case(
                        (trans_table.exclusive_area.isnot(None), price_field / trans_table.exclusive_area * 3.3),
                        else_=None
                    )
                ).label('avg_price_per_pyeong'),  # 평당가 (만원)
                func.count(trans_table.trans_id).label('transaction_count')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .where(
                and_(
                    base_filter,
                    date_field >= start_date,
                    date_field <= end_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(month_expr)
            .order_by(month_expr)
        )
        
        # 3. 월간 아파트 값 추이 (전국 vs 주요 지역) - 최근 12개월
        monthly_months = 12
        monthly_start_date = end_date - timedelta(days=monthly_months * 30)
        
        # 월별 그룹화를 위한 표현식 (월간 추이용)
        monthly_month_expr = func.to_char(date_field, 'YYYY-MM')
        
        # 전국 평균
        national_trend_stmt = (
            select(
                monthly_month_expr.label('month'),
                func.avg(price_field).label('avg_price')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .where(
                and_(
                    base_filter,
                    date_field >= monthly_start_date,
                    date_field <= end_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(monthly_month_expr)
            .order_by(monthly_month_expr)
        )
        
        # 지역별 추이 (주요 도시: 서울, 부산, 대구, 인천, 광주, 대전, 울산)
        major_cities = ['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시']
        
        regional_trend_stmt = (
            select(
                State.city_name,
                monthly_month_expr.label('month'),
                func.avg(price_field).label('avg_price')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= monthly_start_date,
                    date_field <= end_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    State.city_name.in_(major_cities),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(State.city_name, monthly_month_expr)
            .order_by(State.city_name, monthly_month_expr)
        )
        
        # 2. 전국 거래량 추이 (월별) - price_trend와 동일한 데이터 사용 가능하지만 별도 쿼리로 유지
        volume_trend_stmt = (
            select(
                month_expr.label('month'),
                func.count(trans_table.trans_id).label('transaction_count')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .where(
                and_(
                    base_filter,
                    date_field >= start_date,
                    date_field <= end_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(month_expr)
            .order_by(month_expr)
        )
        
        # 쿼리 병렬 실행으로 성능 향상
        price_trend_result, volume_trend_result, national_trend_result, regional_trend_result = await asyncio.gather(
            db.execute(price_trend_stmt),
            db.execute(volume_trend_stmt),
            db.execute(national_trend_stmt),
            db.execute(regional_trend_stmt)
        )
        
        # 결과 처리
        price_trend_data = []
        for row in price_trend_result:
            price_trend_data.append({
                "month": row.month,
                "avg_price_per_pyeong": round(float(row.avg_price_per_pyeong or 0), 1),
                "transaction_count": row.transaction_count or 0
            })
        
        volume_trend_data = []
        for row in volume_trend_result:
            volume_trend_data.append({
                "month": row.month,
                "count": row.transaction_count or 0
            })
        
        national_trend = []
        for row in national_trend_result:
            national_trend.append({
                "month": row.month,
                "avg_price": round(float(row.avg_price or 0), 0)
            })
        regional_trend_dict: Dict[str, List[Dict[str, Any]]] = {}
        for row in regional_trend_result:
            city = row.city_name
            if city not in regional_trend_dict:
                regional_trend_dict[city] = []
            regional_trend_dict[city].append({
                "month": row.month,
                "avg_price": round(float(row.avg_price or 0), 0)
            })
        
        # 지역별 데이터를 리스트로 변환
        regional_trend = [
            {
                "region": city,
                "data": data
            }
            for city, data in regional_trend_dict.items()
        ]
        
        response_data = {
            "success": True,
            "data": {
                "price_trend": price_trend_data,  # 평당가 추이
                "volume_trend": volume_trend_data,  # 거래량 추이
                "monthly_trend": {
                    "national": national_trend,  # 전국 추이
                    "regional": regional_trend  # 지역별 추이
                }
            }
        }
        
        # 3. 캐시에 저장 (TTL: 30분 = 1800초) - 더 긴 캐시로 성능 향상
        await set_to_cache(cache_key, response_data, ttl=1800)
        
        return response_data
        
    except Exception as e:
        logger.error(f"대시보드 요약 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/rankings",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["📊 Dashboard (대시보드)"],
    summary="대시보드 랭킹 데이터 조회",
    description="""
    요즘 관심 많은 아파트, 상승률 TOP 5, 하락률 TOP 5를 조회합니다.
    
    ### 제공 데이터
    1. **요즘 관심 많은 아파트**: 최근 7일간 거래량 기준 TOP 10
    2. **상승률 TOP 5**: 최근 3개월간 가격 상승률이 높은 아파트
    3. **하락률 TOP 5**: 최근 3개월간 가격 하락률이 높은 아파트
    
    ### Query Parameters
    - `transaction_type`: 거래 유형 (sale: 매매, jeonse: 전세, 기본값: sale)
    - `trending_days`: 관심 많은 아파트 조회 기간 (일, 기본값: 7)
    - `trend_months`: 상승/하락률 계산 기간 (개월, 기본값: 3)
    """
)
async def get_dashboard_rankings(
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세)"),
    trending_days: int = Query(7, ge=1, le=30, description="관심 많은 아파트 조회 기간 (일)"),
    trend_months: int = Query(3, ge=1, le=12, description="상승/하락률 계산 기간 (개월)"),
    db: AsyncSession = Depends(get_db)
):
    """
    대시보드 랭킹 데이터 조회
    
    요즘 관심 많은 아파트, 상승률 TOP 5, 하락률 TOP 5를 반환합니다.
    """
    # 캐시 키 생성
    cache_key = build_cache_key("dashboard", "rankings", transaction_type, str(trending_days), str(trend_months))
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return cached_data
    
    try:
        # 2. 캐시 미스: 데이터베이스에서 조회
        trans_table = get_transaction_table(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        date_field = get_date_field(transaction_type, trans_table)
        
        # 필터 조건 (trans_table 사용)
        if transaction_type == "sale":
            base_filter = and_(
                trans_table.is_canceled == False,
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                trans_table.trans_price.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        else:  # jeonse
            base_filter = and_(
                trans_table.monthly_rent == 0,
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                trans_table.deposit_price.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        
        # 날짜 계산
        now = datetime.now().date()
        trending_start_date = now - timedelta(days=trending_days)
        trend_start_date = now - timedelta(days=trend_months * 30)
        
        # 2. 상승률/하락률 TOP 5 계산
        # 이전 기간과 최근 기간의 평균 가격 비교
        previous_start = trend_start_date - timedelta(days=trend_months * 30)
        
        # 1. 요즘 관심 많은 아파트 (최근 N일간 거래량 기준)
        trending_stmt = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                State.city_name,
                State.region_name,
                func.count(trans_table.trans_id).label('transaction_count'),
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong')
            )
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= trending_start_date,
                    date_field <= now,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(Apartment.apt_id, Apartment.apt_name, State.city_name, State.region_name)
            .order_by(desc('transaction_count'))
            .limit(10)
        )
        
        # 아파트별 이전 기간 평균 가격 (최적화: 서브쿼리 사용)
        previous_prices_stmt = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                State.city_name,
                State.region_name,
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong')
            )
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= previous_start,
                    date_field < trend_start_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(Apartment.apt_id, Apartment.apt_name, State.city_name, State.region_name)
            .having(func.count(trans_table.trans_id) >= 3)  # 최소 3건 이상 거래
        )
        
        # 아파트별 최근 기간 평균 가격
        recent_prices_stmt = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                State.city_name,
                State.region_name,
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong')
            )
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= trend_start_date,
                    date_field <= now,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(Apartment.apt_id, Apartment.apt_name, State.city_name, State.region_name)
            .having(func.count(trans_table.trans_id) >= 3)  # 최소 3건 이상 거래
        )
        
        # 쿼리 병렬 실행
        trending_result, previous_prices_result, recent_prices_result = await asyncio.gather(
            db.execute(trending_stmt),
            db.execute(previous_prices_stmt),
            db.execute(recent_prices_stmt)
        )
        
        # 요즘 관심 많은 아파트 처리
        trending_apartments = []
        for row in trending_result:
            trending_apartments.append({
                "apt_id": row.apt_id,
                "apt_name": row.apt_name or "-",
                "region": f"{row.city_name} {row.region_name}" if row.city_name and row.region_name else "-",
                "transaction_count": row.transaction_count or 0,
                "avg_price_per_pyeong": round(float(row.avg_price_per_pyeong or 0), 1)
            })
        
        # 이전 기간 가격 처리
        previous_prices: Dict[int, Dict[str, Any]] = {}
        for row in previous_prices_result:
            previous_prices[row.apt_id] = {
                "apt_name": row.apt_name or "-",
                "region": f"{row.city_name} {row.region_name}" if row.city_name and row.region_name else "-",
                "avg_price_per_pyeong": float(row.avg_price_per_pyeong or 0)
            }
        rising_apartments = []
        falling_apartments = []
        
        for row in recent_prices_result:
            apt_id = row.apt_id
            if apt_id not in previous_prices:
                continue
            
            previous_avg = previous_prices[apt_id]["avg_price_per_pyeong"]
            recent_avg = float(row.avg_price_per_pyeong or 0)
            
            if previous_avg == 0:
                continue
            
            change_rate = ((recent_avg - previous_avg) / previous_avg) * 100
            
            apt_data = {
                "apt_id": apt_id,
                "apt_name": row.apt_name or previous_prices[apt_id]["apt_name"],
                "region": f"{row.city_name} {row.region_name}" if row.city_name and row.region_name else previous_prices[apt_id]["region"],
                "change_rate": round(change_rate, 2),
                "recent_avg": round(recent_avg, 1),
                "previous_avg": round(previous_avg, 1)
            }
            
            if change_rate > 0:
                rising_apartments.append(apt_data)
            elif change_rate < 0:
                falling_apartments.append(apt_data)
        
        # 정렬 및 TOP 5 선택
        rising_apartments.sort(key=lambda x: x["change_rate"], reverse=True)
        falling_apartments.sort(key=lambda x: x["change_rate"])
        
        rising_apartments = rising_apartments[:5]
        falling_apartments = falling_apartments[:5]
        
        response_data = {
            "success": True,
            "data": {
                "trending": trending_apartments,  # 요즘 관심 많은 아파트
                "rising": rising_apartments,  # 상승률 TOP 5
                "falling": falling_apartments  # 하락률 TOP 5
            }
        }
        
        # 3. 캐시에 저장 (TTL: 10분 = 600초)
        await set_to_cache(cache_key, response_data, ttl=1800)
        
        return response_data
        
    except Exception as e:
        logger.error(f"대시보드 랭킹 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )
