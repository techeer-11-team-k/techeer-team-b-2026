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


@router.get(
    "/regional-heatmap",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["📊 Dashboard (대시보드)"],
    summary="지역별 상승률 히트맵 데이터 조회",
    description="""
    도/특별시/광역시 단위로 지역별 가격 상승률을 조회합니다.
    
    ### 제공 데이터
    - 지역명 (도/특별시/광역시)
    - 가격 상승률 (%)
    - 평균 가격 (만원/평)
    
    ### Query Parameters
    - `transaction_type`: 거래 유형 (sale: 매매, jeonse: 전세, 기본값: sale)
    - `months`: 비교 기간 (개월, 기본값: 3)
    """
)
async def get_regional_heatmap(
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세)"),
    months: int = Query(3, ge=1, le=12, description="비교 기간 (개월)"),
    db: AsyncSession = Depends(get_db)
):
    """
    지역별 상승률 히트맵 데이터 조회
    
    도/특별시/광역시 단위로 가격 상승률을 계산하여 반환합니다.
    """
    cache_key = build_cache_key("dashboard", "regional-heatmap", transaction_type, str(months))
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return cached_data
    
    try:
        logger.info(f"🔍 [Dashboard Heatmap] 지역별 히트맵 데이터 조회 시작 - transaction_type: {transaction_type}, months: {months}")
        
        trans_table = get_transaction_table(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        date_field = get_date_field(transaction_type, trans_table)
        
        # 필터 조건
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
                or_(
                    trans_table.monthly_rent == 0,
                    trans_table.monthly_rent.is_(None)
                ),
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                trans_table.deposit_price.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        
        # 실제 데이터의 날짜 범위 확인
        date_range_stmt = select(
            func.min(date_field).label('min_date'),
            func.max(date_field).label('max_date')
        ).where(
            and_(
                base_filter,
                date_field.isnot(None)
            )
        )
        date_range_result = await db.execute(date_range_stmt)
        date_range = date_range_result.first()
        
        if not date_range or not date_range.min_date or not date_range.max_date:
            logger.warning(f"⚠️ [Dashboard Heatmap] 날짜 범위를 찾을 수 없음 - 빈 데이터 반환")
            return {
                "success": True,
                "data": []
            }
        
        max_date = date_range.max_date
        min_date = date_range.min_date
        
        # 최근 기간: 최대 날짜로부터 months 개월 전
        recent_start = max_date - timedelta(days=months * 30)
        # 이전 기간: recent_start로부터 months 개월 전
        previous_start = recent_start - timedelta(days=months * 30)
        
        # 날짜 범위가 데이터 범위를 벗어나면 조정
        if previous_start < min_date:
            previous_start = min_date
        if recent_start < min_date:
            recent_start = min_date + timedelta(days=months * 30)
            previous_start = min_date
        
        logger.info(f"📅 [Dashboard Heatmap] 날짜 범위 - min_date: {min_date}, max_date: {max_date}, previous_start: {previous_start}, recent_start: {recent_start}, recent_end: {max_date}")
        
        # 도/특별시/광역시 단위로 그룹화 (city_name 사용)
        # 최근 기간 평균 가격
        recent_prices_stmt = (
            select(
                State.city_name,
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong'),
                func.count(trans_table.trans_id).label('transaction_count')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field.isnot(None),
                    date_field >= recent_start,
                    date_field <= max_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(State.city_name)
            .having(func.count(trans_table.trans_id) >= 5)  # 최소 5건 이상
        )
        
        # 이전 기간 평균 가격
        previous_prices_stmt = (
            select(
                State.city_name,
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field.isnot(None),
                    date_field >= previous_start,
                    date_field < recent_start,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(State.city_name)
            .having(func.count(trans_table.trans_id) >= 5)  # 최소 5건 이상
        )
        
        recent_result, previous_result = await asyncio.gather(
            db.execute(recent_prices_stmt),
            db.execute(previous_prices_stmt)
        )
        
        # 결과를 리스트로 변환 (세션 종료 전에 데이터 가져오기)
        recent_rows = recent_result.fetchall()
        previous_rows = previous_result.fetchall()
        
        # 이전 기간 가격 딕셔너리
        previous_prices = {row.city_name: float(row.avg_price_per_pyeong or 0) for row in previous_rows}
        
        # 최근 기간 데이터 처리 및 상승률 계산
        heatmap_data = []
        for row in recent_rows:
            city_name = row.city_name
            recent_avg = float(row.avg_price_per_pyeong or 0)
            transaction_count = row.transaction_count or 0
            
            if city_name not in previous_prices or previous_prices[city_name] == 0:
                continue
            
            previous_avg = previous_prices[city_name]
            change_rate = ((recent_avg - previous_avg) / previous_avg) * 100
            
            heatmap_data.append({
                "region": city_name,
                "change_rate": round(change_rate, 2),
                "avg_price_per_pyeong": round(recent_avg, 1),
                "transaction_count": transaction_count
            })
        
        # 상승률 기준으로 정렬하고 TOP 5만 반환
        heatmap_data.sort(key=lambda x: x["change_rate"], reverse=True)
        heatmap_data = heatmap_data[:5]  # TOP 5만 반환
        
        logger.info(f"✅ [Dashboard Heatmap] 히트맵 데이터 생성 완료 - 지역 수: {len(heatmap_data)} (TOP 5)")
        
        response_data = {
            "success": True,
            "data": heatmap_data
        }
        
        # 캐시에 저장 (TTL: 30분)
        if len(heatmap_data) > 0:
            await set_to_cache(cache_key, response_data, ttl=1800)
        
        return response_data
        
    except Exception as e:
        logger.error(f"❌ [Dashboard Heatmap] 지역별 히트맵 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/regional-trends",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["📊 Dashboard (대시보드)"],
    summary="지역별 집값 변화 추이 조회",
    description="""
    도/특별시/광역시 단위로 지역별 집값 변화 추이를 조회합니다.
    
    ### 제공 데이터
    - 지역명별 월별 평균 가격 추이
    
    ### Query Parameters
    - `transaction_type`: 거래 유형 (sale: 매매, jeonse: 전세, 기본값: sale)
    - `months`: 조회 기간 (개월, 기본값: 12)
    """
)
async def get_regional_trends(
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세)"),
    months: int = Query(12, ge=1, le=24, description="조회 기간 (개월)"),
    db: AsyncSession = Depends(get_db)
):
    """
    지역별 집값 변화 추이 조회
    
    도/특별시/광역시 단위로 월별 평균 가격 추이를 반환합니다.
    """
    cache_key = build_cache_key("dashboard", "regional-trends", transaction_type, str(months))
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return cached_data
    
    try:
        logger.info(f"🔍 [Dashboard Trends] 지역별 추이 데이터 조회 시작 - transaction_type: {transaction_type}, months: {months}")
        
        trans_table = get_transaction_table(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        date_field = get_date_field(transaction_type, trans_table)
        
        # 필터 조건
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
                or_(
                    trans_table.monthly_rent == 0,
                    trans_table.monthly_rent.is_(None)
                ),
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                trans_table.deposit_price.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        
        # 실제 데이터의 날짜 범위 확인
        date_range_stmt = select(
            func.min(date_field).label('min_date'),
            func.max(date_field).label('max_date')
        ).where(
            and_(
                base_filter,
                date_field.isnot(None)
            )
        )
        date_range_result = await db.execute(date_range_stmt)
        date_range = date_range_result.first()
        
        if not date_range or not date_range.min_date or not date_range.max_date:
            logger.warning(f"⚠️ [Dashboard Trends] 날짜 범위를 찾을 수 없음 - 빈 데이터 반환")
            return {
                "success": True,
                "data": []
            }
        
        # 데이터가 있는 기간을 기준으로 날짜 범위 설정
        end_date = date_range.max_date
        # 최대 1년 전부터, 또는 데이터의 시작일부터
        start_date = max(
            date_range.min_date,
            end_date - timedelta(days=365)
        )
        
        logger.info(f"📅 [Dashboard Trends] 날짜 범위 - min_date: {date_range.min_date}, max_date: {date_range.max_date}, start_date: {start_date}, end_date: {end_date}")
        
        # 월별 그룹화 표현식
        month_expr = func.to_char(date_field, 'YYYY-MM')
        
        # 지역별 월별 평균 가격 조회 (1년 전부터 오늘까지)
        regional_trends_stmt = (
            select(
                State.city_name,
                month_expr.label('month'),
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong'),
                func.count(trans_table.trans_id).label('transaction_count')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field.isnot(None),
                    date_field >= start_date,  # 1년 전부터
                    date_field <= end_date,  # 오늘까지
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(State.city_name, month_expr)
            .having(func.count(trans_table.trans_id) >= 3)  # 최소 3건 이상
            .order_by(State.city_name, month_expr)  # 지역별, 월별 정렬
        )
        
        result = await db.execute(regional_trends_stmt)
        rows = result.fetchall()
        
        # 지역 그룹화 함수 (더 큰 그룹으로 묶기)
        def get_region_group(city_name: str) -> str:
            """도/특별시/광역시를 지역 그룹으로 변환"""
            if not city_name:
                return "기타"
            
            # 서울
            if "서울" in city_name:
                return "서울"
            # 경기
            elif "경기" in city_name:
                return "경기"
            # 인천
            elif "인천" in city_name:
                return "인천"
            # 충청 (충북, 충남, 대전 포함)
            elif "충북" in city_name or "충청북" in city_name:
                return "충청"
            elif "충남" in city_name or "충청남" in city_name:
                return "충청"
            elif "대전" in city_name:
                return "충청"
            # 부울경 (부산, 울산, 경상, 대구 모두 포함)
            elif "부산" in city_name:
                return "부울경"
            elif "울산" in city_name:
                return "부울경"
            elif "대구" in city_name:
                return "부울경"
            elif "경북" in city_name or "경상북" in city_name:
                return "부울경"
            elif "경남" in city_name or "경상남" in city_name:
                return "부울경"
            # 전라 (전북, 전남, 광주 포함)
            elif "전북" in city_name or "전라북" in city_name:
                return "전라"
            elif "전남" in city_name or "전라남" in city_name:
                return "전라"
            elif "광주" in city_name:
                return "전라"
            # 제주
            elif "제주" in city_name:
                return "제주"
            # 기타 (강원 등)
            else:
                return "기타"
        
        # 지역 그룹별로 데이터 그룹화
        regional_groups_dict: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            city_name = row.city_name
            region_group = get_region_group(city_name)
            
            if region_group not in regional_groups_dict:
                regional_groups_dict[region_group] = {}
            
            month = row.month
            avg_price = round(float(row.avg_price_per_pyeong or 0), 1)
            transaction_count = row.transaction_count or 0
            
            # 같은 월의 데이터가 있으면 평균 계산 (가중 평균)
            if month in regional_groups_dict[region_group]:
                existing = regional_groups_dict[region_group][month]
                total_count = existing["transaction_count"] + transaction_count
                if total_count > 0:
                    # 가중 평균 계산
                    existing["avg_price_per_pyeong"] = round(
                        (existing["avg_price_per_pyeong"] * existing["transaction_count"] + 
                         avg_price * transaction_count) / total_count, 1
                    )
                existing["transaction_count"] = total_count
            else:
                regional_groups_dict[region_group][month] = {
                    "month": month,
                    "avg_price_per_pyeong": avg_price,
                    "transaction_count": transaction_count
                }
        
        # 각 지역 그룹별 데이터를 월별로 정렬하고 리스트로 변환
        regional_trends = []
        for region_group, month_data in regional_groups_dict.items():
            data_list = list(month_data.values())
            data_list.sort(key=lambda x: x["month"])
            
            regional_trends.append({
                "region": region_group,
                "data": [
                    {
                        "month": item["month"],
                        "avg_price_per_pyeong": item["avg_price_per_pyeong"],
                        "transaction_count": item["transaction_count"]
                    }
                    for item in data_list
                ]
            })
        
        # 지역 그룹 순서대로 정렬
        region_order = ["서울", "경기", "인천", "충청", "부울경", "전라", "제주", "기타"]
        regional_trends.sort(key=lambda x: region_order.index(x["region"]) if x["region"] in region_order else 999)
        
        logger.info(f"✅ [Dashboard Trends] 지역별 추이 데이터 생성 완료 - 지역 수: {len(regional_trends)}")
        
        response_data = {
            "success": True,
            "data": regional_trends
        }
        
        # 캐시에 저장 (TTL: 30분)
        if len(regional_trends) > 0:
            await set_to_cache(cache_key, response_data, ttl=1800)
        
        return response_data
        
    except Exception as e:
        logger.error(f"❌ [Dashboard Trends] 지역별 추이 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


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
    "/advanced-charts/price-distribution",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["📊 Dashboard (대시보드)"],
    summary="가격대별 아파트 분포 (히스토그램용)",
    description="""
    가격대별 아파트 분포를 조회합니다. HighChart 히스토그램에 사용됩니다.
    
    ### 제공 데이터
    - 가격대 구간별 아파트 수 및 평균 가격
    """
)
async def get_price_distribution(
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세)"),
    db: AsyncSession = Depends(get_db)
):
    """가격대별 아파트 분포 조회 (히스토그램용)"""
    cache_key = build_cache_key("dashboard", "price-distribution", transaction_type)
    
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return cached_data
    
    try:
        logger.info(f"🔍 [Dashboard Advanced] 가격 분포 조회 시작 - transaction_type: {transaction_type}")
        
        trans_table = get_transaction_table(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        
        # 필터 조건
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
                or_(
                    trans_table.monthly_rent == 0,
                    trans_table.monthly_rent.is_(None)
                ),
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                trans_table.deposit_price.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        
        # 가격대 구간별 분류 (만원 단위)
        price_ranges = case(
            (price_field < 10000, "1억 미만"),
            (and_(price_field >= 10000, price_field < 30000), "1억~3억"),
            (and_(price_field >= 30000, price_field < 50000), "3억~5억"),
            (and_(price_field >= 50000, price_field < 70000), "5억~7억"),
            (and_(price_field >= 70000, price_field < 100000), "7억~10억"),
            (and_(price_field >= 100000, price_field < 150000), "10억~15억"),
            else_="15억 이상"
        )
        
        stmt = (
            select(
                price_ranges.label('price_range'),
                func.count(trans_table.trans_id).label('count'),
                func.avg(price_field).label('avg_price')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .where(
                and_(
                    base_filter,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(price_ranges)
            .order_by(price_ranges)
        )
        
        result = await db.execute(stmt)
        rows = result.fetchall()
        
        data = [
            {
                "price_range": row.price_range,
                "count": row.count or 0,
                "avg_price": round(float(row.avg_price or 0) / 10000, 1)  # 억원 단위
            }
            for row in rows
        ]
        
        response_data = {
            "success": True,
            "data": data
        }
        
        if len(data) > 0:
            await set_to_cache(cache_key, response_data, ttl=1800)
        
        return response_data
        
    except Exception as e:
        logger.error(f"❌ [Dashboard Advanced] 가격 분포 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/advanced-charts/regional-price-correlation",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["📊 Dashboard (대시보드)"],
    summary="지역별 가격 상관관계 (버블 차트용)",
    description="""
    지역별 평균 가격, 거래량, 상승률을 조회합니다. HighChart 버블 차트에 사용됩니다.
    
    ### 제공 데이터
    - 지역별 평균 가격, 거래량, 상승률
    """
)
async def get_regional_price_correlation(
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세)"),
    months: int = Query(3, ge=1, le=12, description="비교 기간 (개월)"),
    db: AsyncSession = Depends(get_db)
):
    """지역별 가격 상관관계 조회 (버블 차트용)"""
    cache_key = build_cache_key("dashboard", "price-correlation", transaction_type, str(months))
    
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return cached_data
    
    try:
        logger.info(f"🔍 [Dashboard Advanced] 가격 상관관계 조회 시작 - transaction_type: {transaction_type}, months: {months}")
        
        trans_table = get_transaction_table(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        date_field = get_date_field(transaction_type, trans_table)
        
        # 필터 조건
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
                or_(
                    trans_table.monthly_rent == 0,
                    trans_table.monthly_rent.is_(None)
                ),
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                trans_table.deposit_price.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        
        # 실제 데이터의 날짜 범위 확인
        date_range_stmt = select(
            func.min(date_field).label('min_date'),
            func.max(date_field).label('max_date')
        ).where(
            and_(
                base_filter,
                date_field.isnot(None)
            )
        )
        date_range_result = await db.execute(date_range_stmt)
        date_range = date_range_result.first()
        
        if not date_range or not date_range.min_date or not date_range.max_date:
            logger.warning(f"⚠️ [Dashboard Advanced] 날짜 범위를 찾을 수 없음 - 빈 데이터 반환")
            return {
                "success": True,
                "data": []
            }
        
        max_date = date_range.max_date
        min_date = date_range.min_date
        
        # 최근 기간: 최대 날짜로부터 months 개월 전
        recent_start = max_date - timedelta(days=months * 30)
        # 이전 기간: recent_start로부터 months 개월 전
        previous_start = recent_start - timedelta(days=months * 30)
        
        # 날짜 범위가 데이터 범위를 벗어나면 조정
        if previous_start < min_date:
            previous_start = min_date
        if recent_start < min_date:
            recent_start = min_date + timedelta(days=months * 30)
            previous_start = min_date
        
        logger.info(f"📅 [Dashboard Advanced] 날짜 범위 - min_date: {min_date}, max_date: {max_date}, previous_start: {previous_start}, recent_start: {recent_start}, recent_end: {max_date}")
        
        # 최근 기간 평균 가격 및 거래량
        recent_stmt = (
            select(
                State.city_name,
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong'),
                func.count(trans_table.trans_id).label('transaction_count')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field.isnot(None),
                    date_field >= recent_start,
                    date_field <= max_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(State.city_name)
            .having(func.count(trans_table.trans_id) >= 5)
        )
        
        # 이전 기간 평균 가격
        previous_stmt = (
            select(
                State.city_name,
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field.isnot(None),
                    date_field >= previous_start,
                    date_field < recent_start,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(State.city_name)
            .having(func.count(trans_table.trans_id) >= 5)
        )
        
        recent_result, previous_result = await asyncio.gather(
            db.execute(recent_stmt),
            db.execute(previous_stmt)
        )
        
        recent_rows = recent_result.fetchall()
        previous_rows = previous_result.fetchall()
        
        # 이전 기간 가격 딕셔너리
        previous_prices = {row.city_name: float(row.avg_price_per_pyeong or 0) for row in previous_rows}
        
        # 최근 기간 데이터 처리 및 상승률 계산
        data = []
        for row in recent_rows:
            city_name = row.city_name
            recent_avg = float(row.avg_price_per_pyeong or 0)
            transaction_count = row.transaction_count or 0
            
            if city_name not in previous_prices or previous_prices[city_name] == 0:
                continue
            
            previous_avg = previous_prices[city_name]
            change_rate = ((recent_avg - previous_avg) / previous_avg) * 100 if previous_avg > 0 else 0
            
            data.append({
                "region": city_name,
                "avg_price_per_pyeong": round(recent_avg, 1),
                "transaction_count": transaction_count,
                "change_rate": round(change_rate, 2)
            })
        
        response_data = {
            "success": True,
            "data": data
        }
        
        if len(data) > 0:
            await set_to_cache(cache_key, response_data, ttl=1800)
        
        return response_data
        
    except Exception as e:
        logger.error(f"❌ [Dashboard Advanced] 가격 상관관계 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


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
        logger.info(f"🔍 [Dashboard] 요약 데이터 조회 시작 - transaction_type: {transaction_type}, months: {months}")
        
        trans_table = get_transaction_table(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        date_field = get_date_field(transaction_type, trans_table)
        
        logger.info(f"📊 [Dashboard] 테이블 정보 - trans_table: {trans_table.__tablename__}, price_field: {price_field}, date_field: {date_field}")
        
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
                or_(
                    trans_table.monthly_rent == 0,
                    trans_table.monthly_rent.is_(None)
                ),
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                trans_table.deposit_price.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        
        logger.info(f"🔧 [Dashboard] base_filter 설정 완료 - transaction_type: {transaction_type}")
        
        # 먼저 전체 데이터 개수 확인 (날짜 필터 없이)
        total_count_stmt = select(func.count(trans_table.trans_id)).where(base_filter)
        total_count_result = await db.execute(total_count_stmt)
        total_count = total_count_result.scalar() or 0
        
        # 날짜가 있는 데이터 개수 확인
        date_count_stmt = select(func.count(trans_table.trans_id)).where(
            and_(base_filter, date_field.isnot(None))
        )
        date_count_result = await db.execute(date_count_stmt)
        date_count = date_count_result.scalar() or 0
        
        # 날짜가 NULL인 데이터 개수 확인
        null_date_count_stmt = select(func.count(trans_table.trans_id)).where(
            and_(base_filter, date_field.is_(None))
        )
        null_date_count_result = await db.execute(null_date_count_stmt)
        null_date_count = null_date_count_result.scalar() or 0
        
        logger.info(f"📈 [Dashboard] 데이터 개수 확인 - 전체: {total_count}, 날짜 있음: {date_count}, 날짜 NULL: {null_date_count}")
        
        if total_count == 0:
            logger.warning(f"⚠️ [Dashboard] {transaction_type} 테이블에 데이터가 없습니다!")
        elif date_count == 0 and null_date_count == 0:
            logger.warning(f"⚠️ [Dashboard] {transaction_type} 테이블에 필터 조건을 만족하는 데이터가 없습니다!")
        
        # 실제 데이터의 날짜 범위 확인
        date_range_stmt = select(
            func.min(date_field).label('min_date'),
            func.max(date_field).label('max_date')
        ).where(
            and_(
                base_filter,
                date_field.isnot(None)
            )
        )
        date_range_result = await db.execute(date_range_stmt)
        date_range = date_range_result.first()
        
        if not date_range or not date_range.min_date or not date_range.max_date:
            logger.warning(f"⚠️ [Dashboard] 날짜 범위를 찾을 수 없음 - 빈 데이터 반환")
            return {
                "success": True,
                "data": {
                    "price_trend": [],
                    "volume_trend": [],
                    "monthly_trend": {
                        "national": [],
                        "regional": []
                    }
                }
            }
        
        # 데이터가 있는 기간을 기준으로 날짜 범위 설정
        end_date = date_range.max_date
        # 최대 months 개월 전부터, 또는 데이터의 시작일부터
        start_date = max(
            date_range.min_date,
            end_date - timedelta(days=months * 30)
        )
        
        logger.info(f"📅 [Dashboard] 날짜 범위 - min_date: {date_range.min_date}, max_date: {date_range.max_date}, start_date: {start_date}, end_date: {end_date}")
        
        # 월별 그룹화를 위한 표현식
        month_expr = func.to_char(date_field, 'YYYY-MM')
        
        # 1. 전국 평당가 추이 (월별)
        # exclusive_area가 0이거나 NULL인 경우를 명시적으로 필터링하고,
        # 평당가 계산 시 NULL 값이 발생하지 않도록 처리
        price_trend_where_conditions = [
            base_filter,
            date_field.isnot(None),  # 월별 그룹화를 위해 날짜는 필수
            date_field >= start_date,  # 데이터가 있는 기간의 시작일부터
            date_field <= end_date,  # 데이터가 있는 기간의 종료일까지
            (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
            trans_table.exclusive_area.isnot(None),
            trans_table.exclusive_area > 0
        ]
        
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
            .where(and_(*price_trend_where_conditions))
            .group_by(month_expr)
            .order_by(month_expr)
        )
        
        # 3. 월간 아파트 값 추이 (전국 vs 주요 지역) - 최근 12개월
        # 월별 그룹화를 위한 표현식 (월간 추이용)
        monthly_month_expr = func.to_char(date_field, 'YYYY-MM')
        
        # 월간 추이용 where 조건 (price_trend와 동일)
        monthly_trend_where_conditions = list(price_trend_where_conditions)
        
        # 전국 평균
        national_trend_stmt = (
            select(
                monthly_month_expr.label('month'),
                func.avg(price_field).label('avg_price')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .where(and_(*monthly_trend_where_conditions))
            .group_by(monthly_month_expr)
            .order_by(monthly_month_expr)
        )
        
        # 지역별 추이 (주요 도시: 서울, 부산, 대구, 인천, 광주, 대전, 울산)
        major_cities = ['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시']
        
        # 지역별 추이용 where 조건 (월간 추이 + 지역 필터)
        regional_trend_where_conditions = list(monthly_trend_where_conditions)
        regional_trend_where_conditions.append(State.city_name.in_(major_cities))
        
        regional_trend_stmt = (
            select(
                State.city_name,
                monthly_month_expr.label('month'),
                func.avg(price_field).label('avg_price')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(and_(*regional_trend_where_conditions))
            .group_by(State.city_name, monthly_month_expr)
            .order_by(State.city_name, monthly_month_expr)
        )
        
        # 2. 전국 거래량 추이 (월별) - price_trend와 동일한 조건 사용
        volume_trend_stmt = (
            select(
                month_expr.label('month'),
                func.count(trans_table.trans_id).label('transaction_count')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .where(and_(*price_trend_where_conditions))
            .group_by(month_expr)
            .order_by(month_expr)
        )
        
        # 쿼리 병렬 실행으로 성능 향상
        logger.info("🚀 [Dashboard] 쿼리 실행 시작")
        price_trend_result, volume_trend_result, national_trend_result, regional_trend_result = await asyncio.gather(
            db.execute(price_trend_stmt),
            db.execute(volume_trend_stmt),
            db.execute(national_trend_stmt),
            db.execute(regional_trend_stmt)
        )
        
        logger.info(f"✅ [Dashboard] 쿼리 실행 완료")
        
        # 결과 처리
        price_trend_data = []
        for row in price_trend_result:
            price_trend_data.append({
                "month": row.month,
                "avg_price_per_pyeong": round(float(row.avg_price_per_pyeong or 0), 1),
                "transaction_count": row.transaction_count or 0
            })
        
        logger.info(f"📊 [Dashboard] price_trend_data 개수: {len(price_trend_data)}, 데이터: {price_trend_data}")
        
        volume_trend_data = []
        for row in volume_trend_result:
            volume_trend_data.append({
                "month": row.month,
                "count": row.transaction_count or 0
            })
        
        logger.info(f"📊 [Dashboard] volume_trend_data 개수: {len(volume_trend_data)}, 데이터: {volume_trend_data}")
        
        national_trend = []
        for row in national_trend_result:
            national_trend.append({
                "month": row.month,
                "avg_price": round(float(row.avg_price or 0), 0)
            })
        
        logger.info(f"📊 [Dashboard] national_trend 개수: {len(national_trend)}, 데이터: {national_trend}")
        
        regional_trend_dict: Dict[str, List[Dict[str, Any]]] = {}
        for row in regional_trend_result:
            city = row.city_name
            if city not in regional_trend_dict:
                regional_trend_dict[city] = []
            regional_trend_dict[city].append({
                "month": row.month,
                "avg_price": round(float(row.avg_price or 0), 0)
            })
        
        logger.info(f"📊 [Dashboard] regional_trend_dict: {regional_trend_dict}")
        
        # 지역별 데이터를 리스트로 변환
        regional_trend = [
            {
                "region": city,
                "data": data
            }
            for city, data in regional_trend_dict.items()
        ]
        
        logger.info(f"📊 [Dashboard] regional_trend 개수: {len(regional_trend)}, 데이터: {regional_trend}")
        
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
        
        logger.info(f"✅ [Dashboard] 응답 데이터 생성 완료 - price_trend: {len(price_trend_data)}, volume_trend: {len(volume_trend_data)}, national: {len(national_trend)}, regional: {len(regional_trend)}")
        
        # 데이터가 있는 경우에만 캐시에 저장 (빈 배열은 캐시하지 않음)
        has_data = (len(price_trend_data) > 0 or 
                    len(volume_trend_data) > 0 or 
                    len(national_trend) > 0 or 
                    len(regional_trend) > 0)
        
        if has_data:
            logger.info(f"💾 [Dashboard] 데이터가 있으므로 캐시에 저장")
            # 3. 캐시에 저장 (TTL: 30분 = 1800초) - 더 긴 캐시로 성능 향상
            await set_to_cache(cache_key, response_data, ttl=1800)
        else:
            logger.warning(f"⚠️ [Dashboard] 데이터가 없으므로 캐시에 저장하지 않음")
        
        return response_data
        
    except Exception as e:
        logger.error(f"❌ [Dashboard] 대시보드 요약 데이터 조회 실패: {e}", exc_info=True)
        logger.error(f"❌ [Dashboard] 에러 상세 정보:", exc_info=True)
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
        logger.info(f"🔍 [Dashboard Rankings] 랭킹 데이터 조회 시작 - transaction_type: {transaction_type}, trending_days: {trending_days}, trend_months: {trend_months}")
        
        trans_table = get_transaction_table(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        date_field = get_date_field(transaction_type, trans_table)
        
        logger.info(f"📊 [Dashboard Rankings] 테이블 정보 - trans_table: {trans_table.__tablename__}, price_field: {price_field}, date_field: {date_field}")
        
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
                or_(
                    trans_table.monthly_rent == 0,
                    trans_table.monthly_rent.is_(None)
                ),
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                trans_table.deposit_price.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        
        logger.info(f"🔧 [Dashboard Rankings] base_filter 설정 완료")
        
        # 실제 데이터의 날짜 범위 확인
        date_range_stmt = select(
            func.min(date_field).label('min_date'),
            func.max(date_field).label('max_date')
        ).where(
            and_(
                base_filter,
                date_field.isnot(None)
            )
        )
        date_range_result = await db.execute(date_range_stmt)
        date_range = date_range_result.first()
        
        if not date_range or not date_range.min_date or not date_range.max_date:
            logger.warning(f"⚠️ [Dashboard Rankings] 날짜 범위를 찾을 수 없음 - 빈 데이터 반환")
            return {
                "success": True,
                "data": {
                    "trending": [],
                    "rising": [],
                    "falling": []
                }
            }
        
        # 데이터가 있는 기간을 기준으로 날짜 범위 설정
        max_date = date_range.max_date
        min_date = date_range.min_date
        
        # 데이터 기간 계산 (일 단위)
        data_span_days = (max_date - min_date).days
        
        # 최근 기간: 최대 날짜로부터 trend_months 개월 전
        recent_start = max_date - timedelta(days=trend_months * 30)
        # 이전 기간: recent_start로부터 trend_months 개월 전
        previous_start = recent_start - timedelta(days=trend_months * 30)
        
        # 날짜 범위가 데이터 범위를 벗어나면 조정
        # 데이터 기간이 부족한 경우, 가능한 범위 내에서 최대한 확장
        if data_span_days < trend_months * 30 * 2:
            # 데이터 기간이 부족하면, 최근 기간을 전체 데이터의 절반으로 설정
            logger.warning(f"⚠️ [Dashboard Rankings] 데이터 기간이 부족함 ({data_span_days}일). 날짜 범위 조정")
            if data_span_days >= trend_months * 30:
                # 최소한 trend_months 개월의 데이터는 있는 경우
                recent_start = max_date - timedelta(days=trend_months * 30)
                previous_start = min_date
            else:
                # 데이터 기간이 trend_months 개월보다 짧은 경우
                mid_date = min_date + timedelta(days=data_span_days // 2)
                recent_start = mid_date
                previous_start = min_date
        else:
            # 날짜 범위가 데이터 범위를 벗어나면 조정
            if previous_start < min_date:
                previous_start = min_date
            if recent_start < min_date:
                recent_start = min_date + timedelta(days=trend_months * 30)
                previous_start = min_date
        
        logger.info(f"📅 [Dashboard Rankings] 날짜 범위 - min_date: {min_date}, max_date: {max_date}, data_span_days: {data_span_days}, previous_start: {previous_start}, recent_start: {recent_start}, recent_end: {max_date}")
        
        trending_stmt = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                State.city_name,
                State.region_name,
                func.count(trans_table.trans_id).label('transaction_count'),
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field.isnot(None),
                    date_field >= recent_start,
                    date_field <= max_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(Apartment.apt_id, Apartment.apt_name, State.city_name, State.region_name)
            .having(func.count(trans_table.trans_id) >= 2)  # 최소 거래 건수 완화: 3 -> 2
            .order_by(desc('transaction_count'))
            .limit(5)
        )
        
        # 아파트별 이전 기간 평균 가격
        previous_prices_stmt = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                State.city_name,
                State.region_name,
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field.isnot(None),
                    date_field >= previous_start,
                    date_field < recent_start,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(Apartment.apt_id, Apartment.apt_name, State.city_name, State.region_name)
            .having(func.count(trans_table.trans_id) >= 2)  # 최소 거래 건수 완화: 3 -> 2
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
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field.isnot(None),
                    date_field >= recent_start,
                    date_field <= max_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
            .group_by(Apartment.apt_id, Apartment.apt_name, State.city_name, State.region_name)
            .having(func.count(trans_table.trans_id) >= 2)  # 최소 거래 건수 완화: 3 -> 2
        )
        
        # 쿼리 병렬 실행
        logger.info("🚀 [Dashboard Rankings] 랭킹 쿼리 실행 시작")
        trending_result, previous_prices_result, recent_prices_result = await asyncio.gather(
            db.execute(trending_stmt),
            db.execute(previous_prices_stmt),
            db.execute(recent_prices_stmt)
        )
        
        logger.info(f"✅ [Dashboard Rankings] 랭킹 쿼리 실행 완료")
        
        # 결과를 리스트로 변환 (세션 종료 전에 데이터 가져오기)
        trending_rows = trending_result.fetchall()
        previous_prices_rows = previous_prices_result.fetchall()
        recent_prices_rows = recent_prices_result.fetchall()
        
        logger.info(f"📊 [Dashboard Rankings] 결과 가져오기 완료 - trending: {len(trending_rows)}, previous: {len(previous_prices_rows)}, recent: {len(recent_prices_rows)}")
        
        # 요즘 관심 많은 아파트 처리
        trending_apartments = []
        for row in trending_rows:
            trending_apartments.append({
                "apt_id": row.apt_id,
                "apt_name": row.apt_name or "-",
                "region": f"{row.city_name} {row.region_name}" if row.city_name and row.region_name else "-",
                "transaction_count": row.transaction_count or 0,
                "avg_price_per_pyeong": round(float(row.avg_price_per_pyeong or 0), 1)
            })
        
        logger.info(f"📊 [Dashboard Rankings] trending_apartments 개수: {len(trending_apartments)}, 데이터: {trending_apartments}")
        
        # 이전 기간 가격 처리
        previous_prices: Dict[int, Dict[str, Any]] = {}
        for row in previous_prices_rows:
            previous_prices[row.apt_id] = {
                "apt_name": row.apt_name or "-",
                "region": f"{row.city_name} {row.region_name}" if row.city_name and row.region_name else "-",
                "avg_price_per_pyeong": float(row.avg_price_per_pyeong or 0)
            }
        
        logger.info(f"📊 [Dashboard Rankings] previous_prices 개수: {len(previous_prices)}, apt_ids: {list(previous_prices.keys())[:10]}")
        
        rising_apartments = []
        falling_apartments = []
        
        recent_prices_count = 0
        skipped_no_previous = 0
        skipped_zero_previous = 0
        
        for row in recent_prices_rows:
            recent_prices_count += 1
            apt_id = row.apt_id
            recent_avg = float(row.avg_price_per_pyeong or 0)
            
            if apt_id not in previous_prices:
                skipped_no_previous += 1
                logger.debug(f"⚠️ [Dashboard Rankings] 아파트 {apt_id}는 이전 기간 데이터가 없어 건너뜀")
                continue
            
            previous_avg = previous_prices[apt_id]["avg_price_per_pyeong"]
            
            if previous_avg == 0:
                skipped_zero_previous += 1
                logger.debug(f"⚠️ [Dashboard Rankings] 아파트 {apt_id}는 이전 기간 평균 가격이 0이어서 건너뜀")
                continue
            
            if recent_avg == 0:
                logger.debug(f"⚠️ [Dashboard Rankings] 아파트 {apt_id}는 최근 기간 평균 가격이 0이어서 건너뜀")
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
        
        logger.info(f"📊 [Dashboard Rankings] recent_prices_count: {recent_prices_count}, skipped_no_previous: {skipped_no_previous}, skipped_zero_previous: {skipped_zero_previous}, rising: {len(rising_apartments)}, falling: {len(falling_apartments)}")
        
        # 정렬 및 TOP 5 선택
        rising_apartments.sort(key=lambda x: x["change_rate"], reverse=True)
        falling_apartments.sort(key=lambda x: x["change_rate"])
        
        # 최소 1개 이상의 결과를 보장하기 위해, 데이터가 부족한 경우 더 많은 아파트를 포함
        if len(rising_apartments) < 5 and len(recent_prices_rows) > len(rising_apartments):
            logger.info(f"⚠️ [Dashboard Rankings] 상승 아파트가 부족함 ({len(rising_apartments)}개). 추가 데이터 포함 시도")
        
        if len(falling_apartments) < 5 and len(recent_prices_rows) > len(falling_apartments):
            logger.info(f"⚠️ [Dashboard Rankings] 하락 아파트가 부족함 ({len(falling_apartments)}개). 추가 데이터 포함 시도")
        
        rising_apartments = rising_apartments[:5]
        falling_apartments = falling_apartments[:5]
        
        logger.info(f"📊 [Dashboard Rankings] 최종 결과 - trending: {len(trending_apartments)}, rising: {len(rising_apartments)}, falling: {len(falling_apartments)}")
        
        # 데이터가 없는 경우 상세 로그 출력
        if len(rising_apartments) == 0:
            logger.warning(f"⚠️ [Dashboard Rankings] 상승 아파트가 없습니다. recent_prices_rows: {len(recent_prices_rows)}, previous_prices: {len(previous_prices)}, skipped_no_previous: {skipped_no_previous}, skipped_zero_previous: {skipped_zero_previous}")
        
        if len(falling_apartments) == 0:
            logger.warning(f"⚠️ [Dashboard Rankings] 하락 아파트가 없습니다. recent_prices_rows: {len(recent_prices_rows)}, previous_prices: {len(previous_prices)}, skipped_no_previous: {skipped_no_previous}, skipped_zero_previous: {skipped_zero_previous}")
        
        response_data = {
            "success": True,
            "data": {
                "trending": trending_apartments,  # 요즘 관심 많은 아파트
                "rising": rising_apartments,  # 상승률 TOP 5
                "falling": falling_apartments  # 하락률 TOP 5
            }
        }
        
        logger.info(f"✅ [Dashboard Rankings] 응답 데이터 생성 완료")
        
        # 데이터가 있는 경우에만 캐시에 저장 (빈 배열은 캐시하지 않음)
        has_data = (len(trending_apartments) > 0 or 
                    len(rising_apartments) > 0 or 
                    len(falling_apartments) > 0)
        
        if has_data:
            logger.info(f"💾 [Dashboard Rankings] 데이터가 있으므로 캐시에 저장")
            # 3. 캐시에 저장 (TTL: 30분 = 1800초)
            await set_to_cache(cache_key, response_data, ttl=1800)
        else:
            logger.warning(f"⚠️ [Dashboard Rankings] 데이터가 없으므로 캐시에 저장하지 않음")
        
        return response_data
        
    except Exception as e:
        logger.error(f"❌ [Dashboard Rankings] 대시보드 랭킹 데이터 조회 실패: {e}", exc_info=True)
        logger.error(f"❌ [Dashboard Rankings] 에러 상세 정보:", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )
