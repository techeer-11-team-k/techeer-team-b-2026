"""
아파트 관련 API 엔드포인트

담당 기능:
- 아파트 상세 정보 조회 (GET /apartments/{apt_id})
- 유사 아파트 조회 (GET /apartments/{apt_id}/similar)
- 주변 아파트 평균 가격 조회 (GET /apartments/{apt_id}/nearby_price)
- 주변 500m 아파트 비교 (GET /apartments/{apt_id}/nearby-comparison)
- 주소를 좌표로 변환하여 geometry 업데이트 (POST /apartments/geometry)
"""

import logging
import traceback
import re
import asyncio
from datetime import date, datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func, and_, desc, case, cast, or_
from sqlalchemy.types import Float
from geoalchemy2 import functions as geo_func

from app.api.v1.deps import get_db
from app.services.apartment import apartment_service
from app.schemas.apartment import (
    ApartDetailBase,
    VolumeTrendResponse,
    PriceTrendResponse,
    ApartmentCompareRequest,
    ApartmentCompareResponse,
    ApartmentCompareItem,
    SubwayInfo,
    SchoolGroup,
    SchoolItem,
    PyeongPricesResponse,
    PyeongOption,
    PyeongRecentPrice,
    PercentileResponse
)
from app.schemas.apartment_search import DetailedSearchRequest, DetailedSearchResponse
from app.models.apart_detail import ApartDetail
from app.models.sale import Sale
from app.models.rent import Rent
from app.models.apartment import Apartment
from app.models.state import State
from app.utils.cache import (
    get_from_cache,
    set_to_cache,
    delete_from_cache,
    get_nearby_price_cache_key,
    get_nearby_comparison_cache_key,
    build_cache_key
)
from app.utils.kakao_api import address_to_coordinates as kakao_address_to_coordinates
from app.utils.google_geocoding import address_to_coordinates as google_address_to_coordinates

logger = logging.getLogger(__name__)

router = APIRouter()


def parse_education_facility(text: Optional[str]) -> SchoolGroup:
    """educationFacility 텍스트를 파싱하여 학교 정보를 구조화한다."""
    if not text:
        return SchoolGroup(elementary=[], middle=[], high=[])
    
    elementary = re.findall(r'초등학교\(([^)]+)\)', text)
    middle = re.findall(r'중학교\(([^)]+)\)', text)
    high = re.findall(r'고등학교\(([^)]+)\)', text)
    
    return SchoolGroup(
        elementary=[SchoolItem(name=name.strip()) for name in elementary],
        middle=[SchoolItem(name=name.strip()) for name in middle],
        high=[SchoolItem(name=name.strip()) for name in high]
    )


def safe_divide(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator

@router.get(
    "",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="지역별 아파트 목록 조회",
    description="특정 지역(시군구 또는 동)에 속한 아파트 목록을 조회합니다.",
    responses={
        200: {"description": "조회 성공"},
        422: {"description": "입력값 검증 실패"}
    }
)
async def get_apartments_by_region(
    region_id: int = Query(..., description="지역 ID (states.region_id)"),
    limit: int = Query(50, ge=1, le=100, description="반환할 최대 개수 (기본 50개, 최대 100개)"),
    skip: int = Query(0, ge=0, description="건너뛸 레코드 수"),
    db: AsyncSession = Depends(get_db)
):
    """
    지역별 아파트 목록 조회 API
    
    특정 지역(시군구 또는 동)에 속한 아파트 목록을 반환합니다.
    동 단위로 조회하면 해당 동의 아파트만, 시군구 단위로 조회하면 해당 시군구의 모든 아파트를 반환합니다.
    
    Args:
        region_id: 지역 ID (states.region_id)
        limit: 반환할 최대 개수 (기본 50개, 최대 100개)
        skip: 건너뛸 레코드 수
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "data": {
                "results": [
                    {
                        "apt_id": int,
                        "apt_name": str,
                        "kapt_code": str | null,
                        "region_id": int,
                        "address": str | null,
                        "location": {"lat": float, "lng": float} | null
                    }
                ],
                "count": int
            }
        }
    """
    results, total_count = await apartment_service.get_apartments_by_region(
        db,
        region_id=region_id,
        limit=limit,
        skip=skip
    )
    
    return {
        "success": True,
        "data": {
            "results": results,
            "count": len(results),
            "total_count": total_count,
            "has_more": (skip + len(results)) < total_count
        }
    }

@router.get(
    "/trending",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="급상승 아파트 조회",
    description="""
    최근 1개월 동안 거래량이 많은 아파트 상위 5개를 조회합니다.
    contract_date 기준으로 최근 30일 내 거래를 집계합니다.
    """,
    responses={
        200: {"description": "조회 성공"},
        500: {"description": "서버 오류"}
    }
)
async def get_trending_apartments(
    limit: int = Query(5, ge=1, le=10, description="반환할 최대 개수 (기본 5개, 최대 10개)"),
    db: AsyncSession = Depends(get_db)
):
    """
    급상승 아파트 조회 API
    
    최근 1개월 동안 거래량이 많은 아파트를 조회합니다.
    
    Args:
        limit: 반환할 최대 개수 (기본 5개)
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "data": {
                "apartments": [
                    {
                        "apt_id": int,
                        "apt_name": str,
                        "address": str | null,
                        "location": {"lat": float, "lng": float} | null,
                        "transaction_count": int,
                        "region_id": int | null
                    }
                ]
            }
        }
    """
    try:
        # 최근 1개월 기준 날짜
        one_month_ago = date.today() - timedelta(days=30)
        
        # sales 테이블에서 apt_id별 거래 건수 집계
        stmt = (
            select(
                Sale.apt_id,
                func.count(Sale.trans_id).label('transaction_count')
            )
            .where(
                and_(
                    Sale.contract_date >= one_month_ago,
                    Sale.contract_date <= date.today(),
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                    Sale.contract_date.isnot(None)
                )
            )
            .group_by(Sale.apt_id)
            .order_by(desc(func.count(Sale.trans_id)))
            .limit(limit)
        )
        
        result = await db.execute(stmt)
        trending_data = result.all()
        
        if not trending_data:
            return {
                "success": True,
                "data": {
                    "apartments": []
                }
            }
        
        # 아파트 정보 조회
        apt_ids = [row.apt_id for row in trending_data]
        apt_count_map = {row.apt_id: row.transaction_count for row in trending_data}
        
        # apartments와 apart_details 조인하여 정보 가져오기
        apt_stmt = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                Apartment.region_id,
                ApartDetail.road_address,
                ApartDetail.jibun_address,
                geo_func.ST_X(ApartDetail.geometry).label('lng'),
                geo_func.ST_Y(ApartDetail.geometry).label('lat')
            )
            .outerjoin(ApartDetail, Apartment.apt_id == ApartDetail.apt_id)
            .where(
                and_(
                    Apartment.apt_id.in_(apt_ids),
                    (ApartDetail.is_deleted == False) | (ApartDetail.is_deleted.is_(None)),
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
                )
            )
        )
        
        apt_result = await db.execute(apt_stmt)
        apartments_data = apt_result.all()
        
        # 결과 구성
        apartments = []
        for apt in apartments_data:
            # 주소 조합 (도로명 우선, 없으면 지번)
            address = apt.road_address if apt.road_address else apt.jibun_address
            
            # 위치 정보
            location = None
            if apt.lat is not None and apt.lng is not None:
                location = {
                    "lat": float(apt.lat),
                    "lng": float(apt.lng)
                }
            
            apartments.append({
                "apt_id": apt.apt_id,
                "apt_name": apt.apt_name,
                "address": address,
                "location": location,
                "transaction_count": apt_count_map.get(apt.apt_id, 0),
                "region_id": apt.region_id
            })
        
        # transaction_count 기준으로 정렬 (집계 순서 유지)
        apartments.sort(key=lambda x: x["transaction_count"], reverse=True)
        
        return {
            "success": True,
            "data": {
                "apartments": apartments
            }
        }
        
    except Exception as e:
        logger.error(f" 급상승 아파트 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"급상승 아파트 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/{apt_id}/detail",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="아파트 상세 정보 조회",
    description="아파트 기본 정보, 주소, 시설, 지하철/학교 정보를 조회합니다.",
    responses={
        200: {"description": "조회 성공"},
        404: {"description": "아파트를 찾을 수 없음"}
    }
)
async def get_apartment_detail(
    apt_id: int,
    db: AsyncSession = Depends(get_db)
):
    cache_key = build_cache_key("apartment", "detail_v2", str(apt_id))
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return cached_data
    
    stmt = (
        select(
            Apartment.apt_id,
            Apartment.apt_name,
            Apartment.kapt_code,
            Apartment.region_id,
            State.city_name,
            State.region_name,
            ApartDetail.road_address,
            ApartDetail.jibun_address,
            ApartDetail.total_household_cnt,
            ApartDetail.total_parking_cnt,
            ApartDetail.use_approval_date,
            ApartDetail.subway_line,
            ApartDetail.subway_station,
            ApartDetail.subway_time,
            ApartDetail.educationFacility,
            ApartDetail.builder_name,
            ApartDetail.developer_name,
            ApartDetail.code_heat_nm,
            ApartDetail.hallway_type,
            ApartDetail.manage_type,
            ApartDetail.total_building_cnt,
            ApartDetail.highest_floor,
            geo_func.ST_X(ApartDetail.geometry).label("lng"),
            geo_func.ST_Y(ApartDetail.geometry).label("lat")
        )
        .select_from(Apartment)
        .join(State, Apartment.region_id == State.region_id, isouter=True)
        .join(ApartDetail, Apartment.apt_id == ApartDetail.apt_id, isouter=True)
        .where(
            Apartment.apt_id == apt_id,
            (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
        )
    )
    
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="아파트를 찾을 수 없습니다")
    
    location = None
    if row.lat is not None and row.lng is not None:
        location = {"lat": float(row.lat), "lng": float(row.lng)}
    
    response_data = {
        "success": True,
        "data": {
            "apt_id": row.apt_id,
            "apt_name": row.apt_name,
            "kapt_code": row.kapt_code,
            "region_id": row.region_id,
            "city_name": row.city_name,
            "region_name": row.region_name,
            "road_address": row.road_address,
            "jibun_address": row.jibun_address,
            "total_household_cnt": row.total_household_cnt,
            "total_parking_cnt": row.total_parking_cnt,
            "use_approval_date": row.use_approval_date.isoformat() if row.use_approval_date else None,
            "subway_line": row.subway_line,
            "subway_station": row.subway_station,
            "subway_time": row.subway_time,
            "educationFacility": row.educationFacility,
            "builder_name": row.builder_name,
            "developer_name": row.developer_name,
            "code_heat_nm": row.code_heat_nm,
            "hallway_type": row.hallway_type,
            "manage_type": row.manage_type,
            "total_building_cnt": row.total_building_cnt,
            "highest_floor": row.highest_floor,
            "location": location
        }
    }
    
    await set_to_cache(cache_key, response_data, ttl=600)
    
    return response_data


@router.post(
    "/compare",
    response_model=ApartmentCompareResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="다중 아파트 비교 조회",
    description="최대 5개 아파트의 비교 데이터를 한 번에 조회합니다.",
    responses={
        200: {"description": "조회 성공"},
        400: {"description": "요청 형식 오류"},
        404: {"description": "조회 가능한 아파트가 없음"}
    }
)
async def compare_apartments(
    payload: ApartmentCompareRequest,
    db: AsyncSession = Depends(get_db)
):
    apartment_ids = payload.apartment_ids
    if not apartment_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="아파트 ID 목록이 비어 있습니다")
    
    cache_key = build_cache_key("apartment", "compare", ",".join(map(str, apartment_ids)))
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        # 캐시된 데이터가 올바른 형식인지 검증
        try:
            # 딕셔너리이고 'apartments' 키가 있는지 확인
            if isinstance(cached_data, dict) and "apartments" in cached_data:
                # apartments 리스트의 각 항목이 딕셔너리인지 확인
                if isinstance(cached_data["apartments"], list):
                    # 첫 번째 항목이 딕셔너리인지 확인 (문자열이 아닌지)
                    if cached_data["apartments"] and isinstance(cached_data["apartments"][0], dict):
                        return ApartmentCompareResponse(**cached_data)
        except Exception as e:
            # 캐시 데이터가 잘못된 형식이면 무시하고 새로 계산
            logger.warning(f" 캐시 데이터 형식 오류 (키: {cache_key}): {e}")
            # 잘못된 캐시 삭제
            await delete_from_cache(cache_key)
    
    detail_stmt = (
        select(
            Apartment.apt_id,
            Apartment.apt_name,
            State.city_name,
            State.region_name,
            ApartDetail.road_address,
            ApartDetail.jibun_address,
            ApartDetail.total_household_cnt,
            ApartDetail.total_parking_cnt,
            ApartDetail.use_approval_date,
            ApartDetail.subway_line,
            ApartDetail.subway_station,
            ApartDetail.subway_time,
            ApartDetail.educationFacility
        )
        .select_from(Apartment)
        .join(State, Apartment.region_id == State.region_id, isouter=True)
        .join(ApartDetail, Apartment.apt_id == ApartDetail.apt_id, isouter=True)
        .where(
            Apartment.apt_id.in_(apartment_ids),
            (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
        )
    )
    
    detail_result = await db.execute(detail_stmt)
    detail_rows = detail_result.all()
    detail_map = {row.apt_id: row for row in detail_rows}
    
    if not detail_map:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="조회 가능한 아파트가 없습니다")
    
    sale_subq = (
        select(
            Sale.apt_id.label("apt_id"),
            Sale.trans_price.label("price"),
            Sale.exclusive_area.label("area"),
            Sale.contract_date.label("date"),
            func.row_number().over(
                partition_by=Sale.apt_id,
                order_by=Sale.contract_date.desc()
            ).label("rn")
        )
        .where(
            Sale.apt_id.in_(apartment_ids),
            Sale.is_canceled == False,
            (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
            Sale.trans_price.isnot(None),
            Sale.exclusive_area.isnot(None),
            Sale.exclusive_area > 0,
            Sale.contract_date.isnot(None)
        )
        .subquery()
    )
    
    sale_result = await db.execute(
        select(sale_subq.c.apt_id, sale_subq.c.price, sale_subq.c.area, sale_subq.c.date)
        .where(sale_subq.c.rn == 1)
    )
    recent_sales = {row.apt_id: row for row in sale_result.all()}
    
    rent_subq = (
        select(
            Rent.apt_id.label("apt_id"),
            Rent.deposit_price.label("price"),
            Rent.exclusive_area.label("area"),
            Rent.deal_date.label("date"),
            func.row_number().over(
                partition_by=Rent.apt_id,
                order_by=Rent.deal_date.desc()
            ).label("rn")
        )
        .where(
            Rent.apt_id.in_(apartment_ids),
            or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),
            (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
            Rent.deposit_price.isnot(None),
            Rent.exclusive_area.isnot(None),
            Rent.exclusive_area > 0,
            Rent.deal_date.isnot(None)
        )
        .subquery()
    )
    
    rent_result = await db.execute(
        select(rent_subq.c.apt_id, rent_subq.c.price, rent_subq.c.area, rent_subq.c.date)
        .where(rent_subq.c.rn == 1)
    )
    recent_rents = {row.apt_id: row for row in rent_result.all()}
    
    apartments: List[ApartmentCompareItem] = []
    for apt_id in apartment_ids:
        detail = detail_map.get(apt_id)
        if not detail:
            continue
        
        sale = recent_sales.get(apt_id)
        rent = recent_rents.get(apt_id)
        
        sale_price = round(float(sale.price) / 10000, 2) if sale and sale.price else None
        sale_pp = None
        if sale and sale.price and sale.area:
            sale_pp = round(float(sale.price) / float(sale.area) * 3.3 / 10000, 2)
        
        rent_price = round(float(rent.price) / 10000, 2) if rent and rent.price else None
        rent_pp = None
        if rent and rent.price and rent.area:
            rent_pp = round(float(rent.price) / float(rent.area) * 3.3 / 10000, 2)
        
        parking_per_household = None
        if detail.total_household_cnt:
            parking_per_household = round(float(detail.total_parking_cnt or 0) / float(detail.total_household_cnt), 2)
        
        build_year = detail.use_approval_date.year if detail.use_approval_date else None
        
        region = " ".join([part for part in [detail.city_name, detail.region_name] if part])
        address = detail.road_address or detail.jibun_address
        
        apartments.append(
            ApartmentCompareItem(
                id=apt_id,
                name=detail.apt_name,
                region=region,
                address=address,
                price=sale_price,
                jeonse=rent_price,
                jeonse_rate=round(safe_divide(rent_price, sale_price) * 100, 1) if sale_price and rent_price else None,
                price_per_pyeong=sale_pp,
                households=detail.total_household_cnt,
                parking_total=detail.total_parking_cnt,
                parking_per_household=parking_per_household,
                build_year=build_year,
                subway=SubwayInfo(
                    line=detail.subway_line,
                    station=detail.subway_station,
                    walking_time=detail.subway_time
                ),
                schools=parse_education_facility(detail.educationFacility)
            )
        )
    
    if not apartments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="조회 가능한 아파트가 없습니다")
    
    response = ApartmentCompareResponse(apartments=apartments)
    # 캐시에는 dict로 저장 (JSON 직렬화 가능하도록)
    await set_to_cache(cache_key, response.model_dump(), ttl=600)
    
    return response


@router.get(
    "/{apt_id}/pyeong-prices",
    response_model=PyeongPricesResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="평형별 가격 조회",
    description="아파트의 전용면적별 최근 매매/전세 가격을 반환합니다.",
    responses={
        200: {"description": "조회 성공"},
        404: {"description": "아파트를 찾을 수 없음"}
    }
)
async def get_pyeong_prices(
    apt_id: int,
    db: AsyncSession = Depends(get_db)
):
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        cache_key = build_cache_key("apartment", "pyeong_prices", str(apt_id))
        cached_data = await get_from_cache(cache_key)
        if cached_data is not None:
            return cached_data
        
        apt_result = await db.execute(select(Apartment).where(Apartment.apt_id == apt_id))
        apartment = apt_result.scalar_one_or_none()
        if not apartment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="아파트를 찾을 수 없습니다")
        
        sales_stmt = (
            select(
                Sale.trans_price,
                Sale.exclusive_area,
                Sale.contract_date
            )
            .where(
                Sale.apt_id == apt_id,
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.trans_price.isnot(None),
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0,
                Sale.contract_date.isnot(None)
            )
            .order_by(Sale.contract_date.desc())
            .limit(200)
        )
        
        rents_stmt = (
            select(
                Rent.deposit_price,
                Rent.exclusive_area,
                Rent.deal_date
            )
            .where(
                Rent.apt_id == apt_id,
                or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deposit_price.isnot(None),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0,
                Rent.deal_date.isnot(None)
            )
            .order_by(Rent.deal_date.desc())
            .limit(200)
        )
        
        sales_result = await db.execute(sales_stmt)
        rents_result = await db.execute(rents_stmt)
        
        pyeong_groups: dict[str, dict] = {}
        
        for row in sales_result.all():
            try:
                area = float(row.exclusive_area) if row.exclusive_area else 0
                if area <= 0:
                    continue
                pyeong = round(area / 3.3058)
                pyeong_type = f"{pyeong}평형"
                if pyeong_type not in pyeong_groups:
                    pyeong_groups[pyeong_type] = {
                        "area": area,
                        "sale": None,
                        "jeonse": None
                    }
                if pyeong_groups[pyeong_type]["sale"] is None and row.trans_price and row.contract_date:
                    price = float(row.trans_price)
                    date_str = row.contract_date.isoformat() if hasattr(row.contract_date, 'isoformat') else str(row.contract_date)
                    pyeong_groups[pyeong_type]["sale"] = PyeongRecentPrice(
                        price=round(price / 10000, 2),
                        date=date_str,
                        price_per_pyeong=round(price / area * 3.3 / 10000, 2)
                    )
            except Exception as e:
                logger.warning(f"[pyeong-prices] 매매 데이터 처리 오류 (apt_id={apt_id}): {e}")
                continue
        
        for row in rents_result.all():
            try:
                area = float(row.exclusive_area) if row.exclusive_area else 0
                if area <= 0:
                    continue
                pyeong = round(area / 3.3058)
                pyeong_type = f"{pyeong}평형"
                if pyeong_type not in pyeong_groups:
                    pyeong_groups[pyeong_type] = {
                        "area": area,
                        "sale": None,
                        "jeonse": None
                    }
                if pyeong_groups[pyeong_type]["jeonse"] is None and row.deposit_price and row.deal_date:
                    price = float(row.deposit_price)
                    date_str = row.deal_date.isoformat() if hasattr(row.deal_date, 'isoformat') else str(row.deal_date)
                    pyeong_groups[pyeong_type]["jeonse"] = PyeongRecentPrice(
                        price=round(price / 10000, 2),
                        date=date_str,
                        price_per_pyeong=round(price / area * 3.3 / 10000, 2)
                    )
            except Exception as e:
                logger.warning(f"[pyeong-prices] 전세 데이터 처리 오류 (apt_id={apt_id}): {e}")
                continue
        
        pyeong_options_data: List[dict] = []
        for pyeong_type, data in sorted(pyeong_groups.items(), key=lambda x: int(re.sub(r"[^0-9]", "", x[0]) or 0)):
            option = PyeongOption(
                pyeong_type=pyeong_type,
                area_m2=round(data["area"], 2),
                recent_sale=data["sale"],
                recent_jeonse=data["jeonse"]
            )
            # Pydantic 모델을 dict로 변환 (JSON 직렬화 가능하도록)
            pyeong_options_data.append(option.model_dump())
        
        response_data = {
            "apartment_id": apartment.apt_id,
            "apartment_name": apartment.apt_name,
            "pyeong_options": pyeong_options_data
        }
        
        await set_to_cache(cache_key, response_data, ttl=600)
        
        return response_data
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[pyeong-prices] 예상치 못한 오류 (apt_id={apt_id}): {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"평형별 가격 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/{apt_id}", 
    response_model=ApartDetailBase,
    summary="아파트 상세정보 조회", 
    description="아파트 ID로 상세정보 조회")
async def get_apart_detail(
    apt_id: int,
    db: AsyncSession = Depends(get_db)
) -> ApartDetailBase:
    """
    아파트 상세정보 조회
    
    ### Path Parameter
    - **apt_id**: 아파트 ID (양수)
    
    ### Response
    - 성공: 아파트 상세 정보 반환
    - 실패: 
      - 404: 아파트 상세 정보를 찾을 수 없음
    """
    # 캐시 키 생성
    cache_key = build_cache_key("apartment", "detail", str(apt_id))
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return ApartDetailBase.model_validate(cached_data)
    
    # 2. 캐시 미스: 서비스 호출
    detail_data = await apartment_service.get_apart_detail(db, apt_id=apt_id)
    
    # 3. 캐시에 저장 (TTL: 1시간 = 3600초)
    detail_dict = detail_data.model_dump()
    await set_to_cache(cache_key, detail_dict, ttl=3600)
    
    return detail_data


@router.get(
    "/{apt_id}/similar",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="유사 아파트 조회",
    description="""
    특정 아파트와 유사한 조건의 아파트를 조회합니다.
    
    ### 유사도 기준
    - 같은 지역 (시군구)
    - 비슷한 세대수 (±30% 범위)
    - 비슷한 동수 (±2동 범위)
    - 같은 시공사 (우선순위 높음)
    
    ### 요청 정보
    - `apt_id`: 기준 아파트 ID (path parameter)
    - `limit`: 반환할 최대 개수 (query parameter, 기본값: 10)
    
    ### 응답 정보
    - 유사 아파트 목록 (아파트명, 주소, 규모 정보 포함)
    """,
    responses={
        200: {
            "description": "유사 아파트 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "similar_apartments": [
                                {
                                    "apt_id": 2,
                                    "apt_name": "래미안 강남파크",
                                    "road_address": "서울특별시 강남구 테헤란로 123",
                                    "jibun_address": "서울특별시 강남구 역삼동 456",
                                    "total_household_cnt": 500,
                                    "total_building_cnt": 5,
                                    "builder_name": "삼성물산",
                                    "use_approval_date": "2015-08-06"
                                }
                            ],
                            "count": 1
                        }
                    }
                }
            }
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        }
    }
)
async def get_similar_apartments(
    apt_id: int,
    limit: int = Query(10, ge=1, le=50, description="반환할 최대 개수 (1~50)"),
    db: AsyncSession = Depends(get_db)
):
    """
    유사 아파트 조회
    
    같은 지역, 비슷한 규모를 기준으로 유사한 아파트를 찾습니다.
    """
    similar_apartments = await apartment_service.get_similar_apartments(
        db,
        apt_id=apt_id,
        limit=limit
    )
    
    return {
        "success": True,
        "data": {
            "similar_apartments": [
                apt.model_dump() for apt in similar_apartments
            ],
            "count": len(similar_apartments)
        }
    }


@router.get(
    "/{apt_id}/volume-trend",
    response_model=VolumeTrendResponse,
    status_code=status.HTTP_200_OK,
    summary="아파트 거래량 추이 조회",
    description="""
    특정 아파트의 월별 거래량 추이를 조회합니다.
    
    ### 요청 정보
    - `apt_id`: 아파트 ID (path parameter)
    
    ### 응답 정보
    - 월별 거래량 목록 (연도-월, 거래량)
    - 전체 거래량 합계
    
    ### 집계 기준
    - 계약일(contract_date) 기준으로 월별 집계
    - 취소되지 않은 거래만 집계 (is_canceled = False)
    - 삭제되지 않은 거래만 집계
    """,
    responses={
        200: {
            "description": "거래량 추이 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "apt_id": 1,
                        "data": [
                            {"year_month": "2024-01", "volume": 5},
                            {"year_month": "2024-02", "volume": 3},
                            {"year_month": "2024-03", "volume": 7}
                        ],
                        "total_volume": 15
                    }
                }
            }
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        }
    }
)
async def get_volume_trend(
    apt_id: int,
    db: AsyncSession = Depends(get_db)
) -> VolumeTrendResponse:
    """
    아파트 거래량 추이 조회
    
    sales 테이블에서 해당 아파트의 거래량을 월별로 집계하여 반환합니다.
    """
    return await apartment_service.get_volume_trend(db, apt_id=apt_id)


@router.get(
    "/{apt_id}/price-trend",
    response_model=PriceTrendResponse,
    status_code=status.HTTP_200_OK,
    summary="아파트 평당가 추이 조회",
    description="""
    특정 아파트의 월별 평당가 추이를 조회합니다.
    
    ### 요청 정보
    - `apt_id`: 아파트 ID (path parameter)
    
    ### 응답 정보
    - 월별 평당가 목록 (연도-월, 평당가)
    
    ### 집계 기준
    - 계약일(contract_date) 기준으로 월별 집계
    - 취소되지 않은 거래만 집계 (is_canceled = False)
    - 삭제되지 않은 거래만 집계
    - 거래가격(trans_price)과 전용면적(exclusive_area)이 있는 거래만 집계
    
    ### 평당가 계산식
    - 평수 = 전용면적(m²) × 0.3025
    - 평당가 = SUM(거래가격) / SUM(평수)
    - 단위: 만원/평
    """,
    responses={
        200: {
            "description": "평당가 추이 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "apt_id": 1,
                        "data": [
                            {"year_month": "2024-01", "price_per_pyeong": 12500.5},
                            {"year_month": "2024-02", "price_per_pyeong": 13000.0},
                            {"year_month": "2024-03", "price_per_pyeong": 12800.3}
                        ]
                    }
                }
            }
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        }
    }
)
async def get_price_trend(
    apt_id: int,
    db: AsyncSession = Depends(get_db)
) -> PriceTrendResponse:
    """
    아파트 평당가 추이 조회
    
    sales 테이블에서 해당 아파트의 평당가를 월별로 집계하여 반환합니다.
    """
    return await apartment_service.get_price_trend(db, apt_id=apt_id)


@router.get(
    "/{apt_id}/nearby_price",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="주변 아파트 평균 가격 조회",
    description="""
    특정 아파트와 같은 지역의 주변 아파트들의 평균 거래가격을 조회합니다.
    
    ### 계산 방식
    - 같은 지역(시군구)의 주변 아파트들의 최근 N개월 거래 데이터를 기반으로 계산
    - 평당가 = 전체 거래 가격 합계 / 전체 면적 합계
    - 예상 가격 = 평당가 × 기준 아파트 전용면적
    
    ### 요청 정보
    - `apt_id`: 기준 아파트 ID (path parameter)
    - `months`: 조회 기간 (query parameter, 기본값: 6, 선택: 6 또는 12)
    
    ### 응답 정보
    - 평당가 평균 (만원/㎡)
    - 예상 가격 (만원, 평당가 × 기준 아파트 면적)
    - 거래 개수
    - 평균 가격 (거래 개수 5개 이하면 -1)
    """,
    responses={
        200: {
            "description": "주변 아파트 평균 가격 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "apt_id": 1,
                            "apt_name": "래미안 강남파크",
                            "region_name": "강남구",
                            "period_months": 6,
                            "target_exclusive_area": 84.5,
                            "average_price_per_sqm": 1005.9,
                            "estimated_price": 85000,
                            "transaction_count": 150,
                            "average_price": 85000
                        }
                    }
                }
            }
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        }
    }
)
async def get_nearby_price(
    apt_id: int,
    months: int = Query(6, ge=1, le=24, description="조회 기간 (개월, 기본값: 6)"),
    db: AsyncSession = Depends(get_db)
):
    """
    주변 아파트 평균 가격 조회
    
    같은 지역의 주변 아파트들의 최근 N개월 거래 데이터를 기반으로
    평당가를 계산하고, 기준 아파트의 면적을 곱하여 예상 가격을 산출합니다.
    """
    # 캐시 키 생성
    cache_key = get_nearby_price_cache_key(apt_id, months)
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return {
            "success": True,
            "data": cached_data
        }
    
    # 2. 캐시 미스: 서비스 호출
    nearby_price_data = await apartment_service.get_nearby_price(
        db,
        apt_id=apt_id,
        months=months
    )
    
    # 3. 캐시에 저장 (TTL: 10분 = 600초)
    await set_to_cache(cache_key, nearby_price_data, ttl=600)
    
    return {
        "success": True,
        "data": nearby_price_data
    }


@router.get(
    "/{apt_id}/nearby-comparison",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="주변 아파트 비교",
    description="""
    특정 아파트 기준으로 지정된 반경 내의 주변 아파트들을 조회하고 비교 정보를 제공합니다.
    
    ### 기능
    - 기준 아파트로부터 지정된 반경 내 아파트 검색 (PostGIS 공간 쿼리)
    - 거리순 정렬 (가까운 순서)
    - 각 아파트의 최근 거래 가격 정보 포함
    - 평균 가격 및 평당가 제공
    
    ### 요청 정보
    - `apt_id`: 기준 아파트 ID (path parameter)
    - `radius_meters`: 검색 반경 (query parameter, 기본값: 500, 범위: 100~5000 미터)
    - `months`: 가격 계산 기간 (query parameter, 기본값: 6, 범위: 1~24)
    
    ### 응답 정보
    - `target_apartment`: 기준 아파트 기본 정보
    - `nearby_apartments`: 주변 아파트 목록 (최대 10개, 거리순)
      - `distance_meters`: 기준 아파트로부터의 거리 (미터)
      - `average_price`: 평균 가격 (만원, 최근 거래 기준)
      - `average_price_per_sqm`: 평당가 (만원/㎡)
      - `transaction_count`: 최근 거래 개수
    - `count`: 주변 아파트 개수
    - `radius_meters`: 검색 반경 (미터)
    - `period_months`: 가격 계산 기간 (개월)
    
    ### 거리 계산
    - PostGIS ST_DWithin + use_spheroid=True 사용
    - 구면 거리 계산으로 정확한 측지학적 거리 측정
    - 오차: ±1m 미만
    """,
    responses={
        200: {
            "description": "주변 아파트 비교 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "target_apartment": {
                                "apt_id": 1,
                                "apt_name": "래미안 강남파크",
                                "road_address": "서울특별시 강남구 테헤란로 123",
                                "jibun_address": "서울특별시 강남구 역삼동 456"
                            },
                            "nearby_apartments": [
                                {
                                    "apt_id": 2,
                                    "apt_name": "힐스테이트 강남",
                                    "road_address": "서울특별시 강남구 테헤란로 200",
                                    "jibun_address": "서울특별시 강남구 역삼동 500",
                                    "distance_meters": 250.5,
                                    "total_household_cnt": 500,
                                    "total_building_cnt": 5,
                                    "builder_name": "삼성물산",
                                    "use_approval_date": "2015-08-06",
                                    "average_price": 85000,
                                    "average_price_per_sqm": 1005.9,
                                    "transaction_count": 15
                                }
                            ],
                            "count": 1,
                            "radius_meters": 500,
                            "period_months": 6
                        }
                    }
                }
            }
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        }
    }
)
async def get_nearby_comparison(
    apt_id: int,
    radius_meters: int = Query(500, ge=100, le=5000, description="검색 반경 (미터, 기본값: 500, 범위: 100~5000)"),
    months: int = Query(6, ge=1, le=24, description="가격 계산 기간 (개월, 기본값: 6)"),
    area: Optional[float] = Query(None, description="전용면적 필터 (㎡)"),
    area_tolerance: float = Query(5.0, description="전용면적 허용 오차 (㎡, 기본값: 5.0)"),
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세), monthly(월세)"),
    db: AsyncSession = Depends(get_db)
):
    """
    주변 아파트 비교 조회
    
    기준 아파트로부터 지정된 반경 내의 주변 아파트들을 거리순으로 조회하고,
    각 아파트의 최근 거래 가격 정보를 포함하여 비교 데이터를 제공합니다.
    """
    limit = 10  # 최대 10개
    
    # 캐시 키 생성 (area, area_tolerance, transaction_type 추가)
    cache_key = get_nearby_comparison_cache_key(apt_id, months, radius_meters, area, area_tolerance, transaction_type)
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return {
            "success": True,
            "data": cached_data
        }
    
    # 2. 캐시 미스: 서비스 호출
    comparison_data = await apartment_service.get_nearby_comparison(
        db,
        apt_id=apt_id,
        radius_meters=radius_meters,
        months=months,
        limit=limit,
        area=area,
        area_tolerance=area_tolerance,
        transaction_type=transaction_type
    )
    
    # 3. 캐시에 저장 (TTL: 10분 = 600초)
    await set_to_cache(cache_key, comparison_data, ttl=600)
    
    return {
        "success": True,
        "data": comparison_data
    }


@router.get(
    "/{apt_id}/same-region-comparison",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="같은 법정동 내 아파트 비교",
    description="""
    특정 아파트와 같은 법정동(region_id) 내의 아파트들을 조회하고 비교 정보를 제공합니다.
    
    ### 기능
    - 기준 아파트와 같은 법정동 내 아파트 검색
    - 각 아파트의 최근 거래 가격 정보 포함
    - 평균 가격 및 평당가 제공
    
    ### 요청 정보
    - `apt_id`: 기준 아파트 ID (path parameter)
    - `months`: 가격 계산 기간 (query parameter, 기본값: 6, 범위: 1~24)
    - `limit`: 반환할 최대 개수 (query parameter, 기본값: 20, 범위: 1~50)
    - `area`: 전용면적 필터 (query parameter, 선택, ㎡ 단위)
    - `area_tolerance`: 전용면적 허용 오차 (query parameter, 기본값: 5.0, ㎡ 단위)
    - `transaction_type`: 거래 유형 (query parameter, 기본값: sale, 선택: sale/jeonse/monthly)
    
    ### 응답 정보
    - `target_apartment`: 기준 아파트 기본 정보
    - `same_region_apartments`: 같은 법정동 내 아파트 목록
      - `average_price`: 평균 가격 (만원, 최근 거래 기준)
      - `average_price_per_sqm`: 평당가 (만원/㎡)
      - `transaction_count`: 최근 거래 개수
    - `count`: 같은 법정동 내 아파트 개수
    - `period_months`: 가격 계산 기간 (개월)
    """,
    responses={
        200: {
            "description": "같은 법정동 내 아파트 비교 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "target_apartment": {
                                "apt_id": 1,
                                "apt_name": "래미안 강남파크",
                                "road_address": "서울특별시 강남구 테헤란로 123",
                                "jibun_address": "서울특별시 강남구 역삼동 456",
                                "region_id": 123
                            },
                            "same_region_apartments": [
                                {
                                    "apt_id": 2,
                                    "apt_name": "힐스테이트 강남",
                                    "road_address": "서울특별시 강남구 테헤란로 200",
                                    "jibun_address": "서울특별시 강남구 역삼동 500",
                                    "average_price": 85000,
                                    "average_price_per_sqm": 1005.9,
                                    "transaction_count": 15
                                }
                            ],
                            "count": 1,
                            "period_months": 6
                        }
                    }
                }
            }
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        }
    }
)
async def get_same_region_comparison(
    apt_id: int,
    months: int = Query(6, ge=1, le=24, description="가격 계산 기간 (개월, 기본값: 6)"),
    limit: int = Query(20, ge=1, le=50, description="반환할 최대 개수 (기본값: 20, 최대: 50)"),
    area: Optional[float] = Query(None, description="전용면적 필터 (㎡)"),
    area_tolerance: float = Query(5.0, description="전용면적 허용 오차 (㎡, 기본값: 5.0)"),
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세), monthly(월세)"),
    db: AsyncSession = Depends(get_db)
):
    """
    같은 법정동 내 아파트 비교 조회
    
    기준 아파트와 같은 법정동(region_id) 내의 아파트들을 조회하고,
    각 아파트의 최근 거래 가격 정보를 포함하여 비교 데이터를 제공합니다.
    """
    # 캐시 키 생성
    cache_key = build_cache_key("apartment", "same_region_comparison", str(apt_id), str(months), str(limit), str(area) if area else "all", str(area_tolerance), transaction_type)
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return {
            "success": True,
            "data": cached_data
        }
    
    # 2. 캐시 미스: 서비스 호출
    comparison_data = await apartment_service.get_same_region_comparison(
        db,
        apt_id=apt_id,
        months=months,
        limit=limit,
        area=area,
        area_tolerance=area_tolerance,
        transaction_type=transaction_type
    )
    
    # 3. 캐시에 저장 (TTL: 10분 = 600초)
    await set_to_cache(cache_key, comparison_data, ttl=600)
    
    return {
        "success": True,
        "data": comparison_data
    }


@router.post(
    "/geometry",
    status_code=status.HTTP_200_OK,
    tags=[" Data Collection (데이터 수집)"],
    summary="전체 아파트 주소를 좌표로 변환하여 geometry 일괄 업데이트",
    description="""
    주소를 좌표로 변환하고 geometry 컬럼을 일괄 업데이트합니다.
    
    ### 기능
    1. apart_details 테이블에서 **주소가 있는 레코드만** 조회 (geometry가 없는 것만)
    2.  **도로명 주소 또는 지번 주소가 있는 경우만** 처리 (빈 문자열 제외)
    3. 각 레코드의 road_address 또는 jibun_address를 사용하여 카카오 API 호출
    4. 좌표를 받아서 PostGIS Point로 변환하여 geometry 컬럼 업데이트
    5. **이미 geometry가 있는 레코드는 건너뜁니다** (중복 처리 방지)
    
    ### Query Parameters
    - `limit`: 처리할 최대 레코드 수 (기본값: None, 전체 처리)
    - `batch_size`: 배치 크기 (기본값: 20)
    
    ### 응답
    - `total_processed`: 처리한 총 레코드 수 (geometry가 없는 레코드만)
    - `success_count`: 성공한 레코드 수
    - `failed_count`: 실패한 레코드 수
    - `skipped_count`: 건너뛴 레코드 수 (이미 geometry가 있는 레코드)
    """,
    responses={
        200: {
            "description": "geometry 업데이트 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "message": "Geometry 일괄 업데이트 작업 완료!",
                        "data": {
                            "total_processed": 100,
                            "success_count": 95,
                            "failed_count": 5,
                            "skipped_count": 10
                        }
                    }
                }
            }
        },
        500: {
            "description": "서버 오류"
        }
    }
)
async def update_geometry(
    limit: Optional[int] = Query(None, ge=1, description="처리할 최대 레코드 수 (None이면 전체)"),
    batch_size: int = Query(20, ge=1, le=100, description="배치 크기 (1~100)"),
    db: AsyncSession = Depends(get_db)
):
    """
    주소를 좌표로 변환하여 geometry 일괄 업데이트
    
     중요: 아파트 상세정보가 있고 주소 수집이 가능한 아파트만 처리합니다.
    - apart_details 테이블의 geometry가 없는 레코드
    - 도로명 주소 또는 지번 주소가 있는 레코드만 (빈 문자열 제외)
    - 이미 geometry가 있는 레코드는 건너뜁니다
    
    Args:
        limit: 처리할 최대 레코드 수 (None이면 전체)
        batch_size: 배치 크기 (기본값: 20)
        db: 데이터베이스 세션
    
    Returns:
        업데이트 결과 딕셔너리
    """
    try:
        logger.info(" [아파트 geometry] Geometry 일괄 업데이트 작업 시작")
        logger.info(" [아파트 geometry] geometry가 비어있고 주소가 있는 레코드 조회 중...")
        
        stmt = (
            select(ApartDetail)
            .where(
                and_(
                    ApartDetail.geometry.is_(None),
                    ApartDetail.is_deleted == False,
                    # 도로명 주소 또는 지번 주소가 있는 경우만 (빈 문자열 제외)
                    or_(
                        and_(
                            ApartDetail.road_address.isnot(None),
                            ApartDetail.road_address != ""
                        ),
                        and_(
                            ApartDetail.jibun_address.isnot(None),
                            ApartDetail.jibun_address != ""
                        )
                    )
                )
            )
        )
        
        if limit:
            stmt = stmt.limit(limit)
        
        result = await db.execute(stmt)
        records = result.scalars().all()
        
        total_processed = len(records)
        
        if total_processed == 0:
            logger.info("ℹ  [아파트 geometry] 업데이트할 레코드 없음 (geometry 이미 있거나 주소 없음)")
            return {
                "success": True,
                "message": "업데이트할 레코드가 없습니다. (geometry가 이미 설정되어 있거나 주소가 없는 레코드는 제외됩니다)",
                "data": {
                    "total_processed": 0,
                    "success_count": 0,
                    "failed_count": 0,
                    "skipped_count": 0
                }
            }
        
        logger.info(f" [아파트 geometry] 총 {total_processed}개 레코드 처리 예정 (주소 있는 아파트 상세만)")
        
        success_count = 0
        failed_count = 0
        
        # 배치 처리
        for batch_start in range(0, total_processed, batch_size):
            batch_end = min(batch_start + batch_size, total_processed)
            batch_records = records[batch_start:batch_end]
            
            logger.info(f" [아파트 geometry] 배치 처리 중: {batch_start + 1}~{batch_end}/{total_processed}")
            for idx, record in enumerate(batch_records, start=batch_start + 1):
                try:
                    # 이미 geometry가 있는 경우 건너뛰기
                    if record.geometry is not None:
                        logger.debug(f"[{idx}/{total_processed}] ⏭  건너뜀: apt_detail_id={record.apt_detail_id} (이미 geometry 있음)")
                        continue
                    
                    # 주소 선택 (지번 주소 우선, 없으면 도로명 주소) - Google Geocoding API 사용
                    address = record.jibun_address if record.jibun_address else record.road_address
                    
                    if not address:
                        logger.warning(f"[{idx}/{total_processed}]  [아파트 geometry] 주소 없음: apt_detail_id={record.apt_detail_id}")
                        failed_count += 1
                        continue
                    
                    # Google Geocoding API로 좌표 변환 (지번주소 우선)
                    logger.info(
                        f"[{idx}/{total_processed}]  [아파트 geometry] Google Geocoding API 호출: "
                        f"apt_detail_id={record.apt_detail_id}, "
                        f"road_address='{record.road_address}', "
                        f"jibun_address='{record.jibun_address}', "
                        f"query_address='{address}' (지번주소 우선)"
                    )
                    coordinates = await google_address_to_coordinates(address)
                    
                    if not coordinates:
                        logger.warning(
                            f"[{idx}/{total_processed}]  [아파트 geometry] Google 좌표 변환 실패: "
                            f"apt_detail_id={record.apt_detail_id}, "
                            f"road_address='{record.road_address}', "
                            f"jibun_address='{record.jibun_address}', "
                            f"query_address='{address}' | "
                            f"raw 원인: app.utils.google_geocoding [Google RAW] 로그 참조"
                        )
                        failed_count += 1
                        continue
                    
                    longitude, latitude = coordinates
                    
                    # PostGIS Point 생성 및 업데이트
                    # SQLAlchemy의 text()를 사용하여 직접 SQL 실행
                    update_stmt = text("""
                        UPDATE apart_details
                        SET geometry = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE apt_detail_id = :apt_detail_id
                    """)
                    
                    await db.execute(
                        update_stmt,
                        {
                            "longitude": longitude,
                            "latitude": latitude,
                            "apt_detail_id": record.apt_detail_id
                        }
                    )
                    
                    logger.debug(f"[{idx}/{total_processed}]  성공: apt_detail_id={record.apt_detail_id}, 좌표=({longitude}, {latitude})")
                    success_count += 1
                    
                except Exception as e:
                    tb = traceback.format_exc()
                    logger.error(
                        f"[{idx}/{total_processed}]  [아파트 geometry] 레코드 처리 오류: "
                        f"apt_detail_id={record.apt_detail_id}, "
                        f"road_address='{record.road_address}', jibun_address='{record.jibun_address}' | "
                        f"error={type(e).__name__}: {str(e)} | raw traceback:\n{tb}",
                        exc_info=True
                    )
                    failed_count += 1
            
            # 배치마다 커밋
            await db.commit()
            logger.info(f" [아파트 geometry] 배치 커밋 완료: {batch_start + 1}~{batch_end}/{total_processed}")
        logger.info(" [아파트 geometry] Geometry 일괄 업데이트 작업 완료!")
        logger.info(f"   [아파트 geometry] 처리: {total_processed}개, 성공: {success_count}개, 실패: {failed_count}개")
        
        return {
            "success": True,
            "message": "Geometry 일괄 업데이트 작업 완료!",
            "data": {
                "total_processed": total_processed,
                "success_count": success_count,
                "failed_count": failed_count,
                "skipped_count": 0  # 현재는 건너뛰는 로직이 없지만, 향후 확장 가능
            }
        }
        
    except ValueError as e:
        logger.error(f" [아파트 geometry] 업데이트 실패: 설정 오류 - {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"설정 오류: {str(e)}"
        )
    except Exception as e:
        tb = traceback.format_exc()
        logger.error(
            f" [아파트 geometry] 업데이트 중 예상치 못한 오류: {type(e).__name__}: {str(e)} | "
            f"raw traceback:\n{tb}",
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"geometry 업데이트 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/{apt_id}/transactions",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="아파트 실거래 내역 조회",
    description="""
    특정 아파트의 실거래 내역을 조회하여 시세 내역, 최근 6개월간 변화량, 가격 변화 추이를 제공합니다.
    
    ### 제공 데이터
    1. **시세 내역**: 최근 거래 내역 (매매/전세)
    2. **최근 6개월 변화량**: 6개월 전 대비 가격 변화율
    3. **가격 변화 추이**: 월별 평균 거래가 추이
    4. **거래 통계**: 총 거래 건수, 평균 가격 등
    
    ### Query Parameters
    - `transaction_type`: 거래 유형 (sale: 매매, jeonse: 전세, 기본값: sale)
    - `limit`: 최근 거래 내역 개수 (기본값: 10)
    - `months`: 가격 추이 조회 기간 (개월, 기본값: 6)
    """
)
async def get_apartment_transactions(
    apt_id: int,
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세), monthly(월세)"),
    limit: int = Query(10, ge=1, le=5000, description="최근 거래 내역 개수 (상세 페이지 전체 조회 시 2000 등 사용)"),
    months: int = Query(6, ge=1, le=120, description="가격 추이 조회 기간 (개월, 최대 120개월)"),
    area: Optional[float] = Query(None, description="전용면적 필터 (㎡)"),
    area_tolerance: float = Query(5.0, description="전용면적 허용 오차 (㎡, 기본값: 5.0)"),
    db: AsyncSession = Depends(get_db)
):
    """
    아파트 실거래 내역 조회
    
    시세 내역, 최근 6개월간 변화량, 가격 변화 추이를 반환합니다.
    """
    logger.info(f" [Apt Transactions] 조회 시작 - apt_id: {apt_id}, type: {transaction_type}, months: {months}, area: {area}")
    
    # 캐시 키 생성 (area, area_tolerance 추가)
    cache_key = build_cache_key("apartment", "transactions", str(apt_id), transaction_type, str(limit), str(months), str(area) if area else "all", str(area_tolerance))
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f" [Apt Transactions] 캐시 히트 - apt_id: {apt_id}")
        return cached_data
    
    try:
        # 2. 캐시 미스: 데이터베이스에서 조회
        # 아파트 존재 확인
        apt_result = await db.execute(
            select(Apartment).where(Apartment.apt_id == apt_id)
        )
        apartment = apt_result.scalar_one_or_none()
        
        if not apartment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"아파트를 찾을 수 없습니다 (apt_id: {apt_id})"
            )
        
        # 거래 테이블 및 필드 선택
        if transaction_type == "sale":
            trans_table = Sale
            price_field = Sale.trans_price
            trend_price_field = price_field
            date_field = Sale.contract_date
            area_field = Sale.exclusive_area
            base_filter = and_(
                Sale.apt_id == apt_id,
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.trans_price.isnot(None),
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0
            )
        elif transaction_type == "jeonse":
            trans_table = Rent
            price_field = Rent.deposit_price
            trend_price_field = price_field
            date_field = Rent.deal_date
            area_field = Rent.exclusive_area
            base_filter = and_(
                Rent.apt_id == apt_id,
                or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),  # 전세: 월세가 0이거나 NULL
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deposit_price.isnot(None),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0
            )
        elif transaction_type == "monthly":
            trans_table = Rent
            price_field = Rent.deposit_price  # 거래 목록/통계: 보증금
            trend_price_field = Rent.monthly_rent  # 그래프: 월세 가격
            date_field = Rent.deal_date
            area_field = Rent.exclusive_area
            base_filter = and_(
                Rent.apt_id == apt_id,
                Rent.monthly_rent > 0,  # 월세만
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.monthly_rent.isnot(None),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0
            )
        else:
            # 기본값 sale (안전장치)
            trans_table = Sale
            price_field = Sale.trans_price
            trend_price_field = price_field
            date_field = Sale.contract_date
            area_field = Sale.exclusive_area
            base_filter = and_(
                Sale.apt_id == apt_id,
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.trans_price.isnot(None),
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0
            )
        
        # 면적 필터 추가
        if area is not None:
            base_filter = and_(
                base_filter,
                area_field >= area - area_tolerance,
                area_field <= area + area_tolerance
            )
        
        # 1. 최근 거래 내역
        recent_transactions_stmt = (
            select(trans_table)
            .where(base_filter)
            .order_by(desc(date_field))
            .limit(limit)
        )
        recent_result = await db.execute(recent_transactions_stmt)
        recent_transactions = []
        for trans in recent_result.scalars().all():
            # 날짜 필드 가져오기
            if transaction_type == "sale":
                trans_date = trans.contract_date
            else:
                trans_date = trans.deal_date
            
            # 가격 및 면적 가져오기
            if transaction_type == "sale":
                trans_price = trans.trans_price or 0
            elif transaction_type == "jeonse":
                trans_price = trans.deposit_price or 0
            else: # monthly
                trans_price = trans.deposit_price or 0 # 보증금
            
            # Decimal 타입을 float로 변환
            trans_area = float(trans.exclusive_area) if trans.exclusive_area else 0.0
            
            transaction_data = {
                "trans_id": trans.trans_id,
                "date": str(trans_date) if trans_date else None,
                "price": int(trans_price) if trans_price else 0,
                "area": trans_area,
                "floor": trans.floor,
                "price_per_sqm": round(float(trans_price / trans_area) if trans_area > 0 and trans_price else 0, 0),
                "price_per_pyeong": round(float(trans_price / trans_area * 3.3) if trans_area > 0 and trans_price else 0, 1)
            }
            if transaction_type == "sale":
                transaction_data["trans_type"] = trans.trans_type
                transaction_data["is_canceled"] = trans.is_canceled
            else:
                transaction_data["monthly_rent"] = trans.monthly_rent
                # transaction_data["deposit_price"] = trans.deposit_price # 이미 price에 담김
            
            recent_transactions.append(transaction_data)
        
        # 2. 가격 변화 추이 (월별)
        # 먼저 실제 데이터의 날짜 범위를 확인
        date_range_stmt = (
            select(
                func.min(date_field).label('min_date'),
                func.max(date_field).label('max_date')
            )
            .where(
                and_(
                    base_filter,
                    date_field.isnot(None)
                )
            )
        )
        date_range_result = await db.execute(date_range_stmt)
        date_range = date_range_result.first()
        
        # 데이터가 있는 기간에 맞춰 조회 (데이터가 없으면 요청된 months 사용)
        if date_range and date_range.max_date:
            end_date = date_range.max_date
            # 데이터가 있는 최소 날짜와 요청된 기간 중 더 최근 것 사용
            requested_start = end_date - timedelta(days=months * 30)
            if date_range.min_date:
                start_date = max(date_range.min_date, requested_start) if months < 120 else date_range.min_date
            else:
                start_date = requested_start
            logger.info(f" 가격 추이 조회 기간 - start: {start_date}, end: {end_date} (실제 데이터 범위: {date_range.min_date} ~ {date_range.max_date})")
        else:
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=months * 30)
            logger.info(f" 가격 추이 조회 기간 (기본값) - start: {start_date}, end: {end_date}")
        
        month_expr = func.to_char(date_field, 'YYYY-MM')
        
        # 가격 변화 추이 쿼리 (월세는 trend_price_field=monthly_rent 사용, 그 외는 price_field)
        trend_stmt = (
            select(
                month_expr.label('month'),
                func.avg(
                    case(
                        (and_(
                            area_field.isnot(None),
                            area_field > 0
                        ), cast(trend_price_field, Float) / cast(area_field, Float) * 3.3),
                        else_=None
                    )
                ).label('avg_price_per_pyeong'),
                func.avg(cast(trend_price_field, Float)).label('avg_price'),
                func.count(trans_table.trans_id).label('transaction_count')
            )
            .where(
                and_(
                    base_filter,
                    date_field >= start_date,
                    date_field <= end_date,
                    area_field.isnot(None),
                    area_field > 0
                )
            )
            .group_by(month_expr)
            .order_by(month_expr)
        )
        
        trend_result = await db.execute(trend_stmt)
        price_trend = []
        for row in trend_result:
            price_trend.append({
                "month": row.month,
                "avg_price_per_pyeong": round(float(row.avg_price_per_pyeong or 0), 1),
                "avg_price": round(float(row.avg_price or 0), 0),
                "transaction_count": row.transaction_count or 0
            })
        
        logger.info(f" 가격 추이 데이터 - {len(price_trend)}개 월별 데이터")
        
        # 3. 변화량 계산 (실제 데이터 범위 기준)
        # end_date는 이미 실제 데이터의 최신 날짜로 설정됨
        six_months_ago = end_date - timedelta(days=180)
        recent_start = end_date - timedelta(days=90)  # 최근 3개월
        
        # 가격 변화 계산 (평당가가 아닌 실제 거래가 기준으로 변경)
        previous_avg_stmt = (
            select(
                func.avg(cast(price_field, Float)).label('avg_price')
            )
            .where(
                and_(
                    base_filter,
                    date_field >= six_months_ago,
                    date_field < recent_start,
                    area_field.isnot(None),
                    area_field > 0
                )
            )
        )
        previous_result = await db.execute(previous_avg_stmt)
        previous_avg = float(previous_result.scalar() or 0)
        
        recent_avg_stmt = (
            select(
                func.avg(cast(price_field, Float)).label('avg_price')
            )
            .where(
                and_(
                    base_filter,
                    date_field >= recent_start,
                    date_field <= end_date,
                    area_field.isnot(None),
                    area_field > 0
                )
            )
        )
        recent_result = await db.execute(recent_avg_stmt)
        recent_avg = float(recent_result.scalar() or 0)
        
        # 변화량 계산
        change_rate = None
        if previous_avg > 0 and recent_avg > 0:
            change_rate = ((recent_avg - previous_avg) / previous_avg) * 100
        elif previous_avg == 0 and recent_avg > 0:
            change_rate = None
        elif previous_avg > 0 and recent_avg == 0:
            change_rate = None
        
        # 4. 통계 정보
        stats_stmt = (
            select(
                func.count(trans_table.trans_id).label('total_count'),
                func.avg(cast(price_field, Float)).label('avg_price'),
                func.avg(
                    case(
                        (and_(
                            area_field.isnot(None),
                            area_field > 0
                        ), cast(price_field, Float) / cast(area_field, Float) * 3.3),
                        else_=None
                    )
                ).label('avg_price_per_pyeong'),
                func.min(cast(price_field, Float)).label('min_price'),
                func.max(cast(price_field, Float)).label('max_price')
            )
            .where(
                and_(
                    base_filter,
                    area_field.isnot(None),
                    area_field > 0
                )
            )
        )
        stats_result = await db.execute(stats_stmt)
        stats_row = stats_result.one()
        
        response_data = {
            "success": True,
            "data": {
                "apartment": {
                    "apt_id": apartment.apt_id,
                    "apt_name": apartment.apt_name
                },
                "recent_transactions": recent_transactions,
                "price_trend": price_trend,
                "change_summary": {
                    "previous_avg": round(previous_avg, 1),
                    "recent_avg": round(recent_avg, 1),
                    "change_rate": round(change_rate, 2) if change_rate is not None else None,
                    "period": "최근 6개월"
                },
                "statistics": {
                    "total_count": stats_row.total_count or 0,
                    "avg_price": round(float(stats_row.avg_price or 0), 0),
                    "avg_price_per_pyeong": round(float(stats_row.avg_price_per_pyeong or 0), 1),
                    "min_price": round(float(stats_row.min_price or 0), 0),
                    "max_price": round(float(stats_row.max_price or 0), 0)
                }
            }
        }
        
        # 3. 캐시에 저장 (TTL: 10분 = 600초)
        await set_to_cache(cache_key, response_data, ttl=600)
        
        logger.info(f" [Apt Transactions] 조회 완료 - apt_id: {apt_id}, 거래내역: {len(response_data['data']['recent_transactions'])}건, 추이: {len(response_data['data']['price_trend'])}개월")
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        error_traceback = traceback.format_exc()
        
        logger.error(
            f" [Apt Transactions] 조회 실패\n"
            f"   apt_id: {apt_id}\n"
            f"   transaction_type: {transaction_type}\n"
            f"   limit: {limit}, months: {months}, area: {area}\n"
            f"   에러 타입: {error_type}\n"
            f"   에러 메시지: {error_message}\n"
            f"   상세 스택 트레이스:\n{error_traceback}",
            exc_info=True
        )
        
        # 콘솔에도 출력 (Docker 로그에서 확인 가능)
        print(f"[ERROR] Apt Transactions 조회 실패:")
        print(f"  apt_id: {apt_id}")
        print(f"  transaction_type: {transaction_type}")
        print(f"  limit: {limit}, months: {months}, area: {area}")
        print(f"  에러 타입: {error_type}")
        print(f"  에러 메시지: {error_message}")
        print(f"  스택 트레이스:\n{error_traceback}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"거래 내역 조회 중 오류가 발생했습니다 (apt_id: {apt_id}): {error_type}: {error_message}"
        )


@router.post(
    "/search",
    response_model=DetailedSearchResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="아파트 상세 검색",
    description="""
    위치, 평수, 가격, 지하철 거리, 교육시설 등 다양한 조건으로 아파트를 검색합니다.
    
    ### 검색 조건
    - **위치**: 지역 ID 또는 지역명으로 검색
    - **평수**: 최소/최대 전용면적 (㎡ 단위)
    - **가격**: 최소/최대 매매가격 (만원 단위, 최근 6개월 거래 기준)
    - **지하철 거리**: 지하철역까지 최대 도보 시간 (분)
    - **교육시설**: 교육시설 유무
    
    ### 요청 정보
    - `region_id`: 지역 ID (선택, location과 함께 사용 시 location 우선)
    - `location`: 지역명 (선택, 예: "강남구", "서울시 강남구" - region_id 대신 사용 가능)
    - `min_area`: 최소 전용면적 (㎡, 선택)
    - `max_area`: 최대 전용면적 (㎡, 선택)
    - `min_price`: 최소 가격 (만원, 선택)
    - `max_price`: 최대 가격 (만원, 선택)
    - `subway_max_distance_minutes`: 지하철역까지 최대 도보 시간 (분, 선택, 0~60)
    - `has_education_facility`: 교육시설 유무 (True/False/None, 선택)
    - `limit`: 반환할 최대 개수 (기본 50개, 최대 100개)
    - `skip`: 건너뛸 레코드 수 (기본 0)
    
    ### 응답 정보
    - `results`: 검색 결과 아파트 목록
    - `count`: 검색 결과 개수
    - `total`: 전체 검색 결과 개수
    - `limit`: 반환된 최대 개수
    - `skip`: 건너뛴 레코드 수
    
    ### 주의사항
    - 가격은 최근 6개월 거래 데이터를 기반으로 계산됩니다.
    - 평수는 해당 아파트의 최근 거래 평균 면적을 사용합니다.
    - 지하철 거리는 subway_time 필드를 파싱하여 비교합니다.
    """,
    responses={
        200: {
            "description": "검색 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "results": [
                                {
                                    "apt_id": 1,
                                    "apt_name": "래미안 강남파크",
                                    "address": "서울특별시 강남구 테헤란로 123",
                                    "location": {"lat": 37.5665, "lng": 126.9780},
                                    "exclusive_area": 84.5,
                                    "average_price": 85000,
                                    "subway_station": "강남역",
                                    "subway_line": "2호선",
                                    "subway_time": "5~10분이내",
                                    "education_facility": "초등학교(강남초등학교)"
                                }
                            ],
                            "count": 1,
                            "total": 1,
                            "limit": 50,
                            "skip": 0
                        }
                    }
                }
            }
        },
        422: {
            "description": "입력값 검증 실패"
        },
        500: {
            "description": "서버 오류"
        }
    }
)
async def detailed_search_apartments(
    request: DetailedSearchRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    아파트 상세 검색
    
    위치, 평수, 가격, 지하철 거리, 교육시설 등 다양한 조건으로 아파트를 검색합니다.
    """
    try:
        # 지역명이 있으면 region_id로 변환
        region_id = request.region_id
        if not region_id and request.location:
            location_name = request.location
            
            # 지역명으로 region_id 찾기 (최적화된 단일 쿼리 버전)
            try:
                from sqlalchemy import and_, or_, func
                from app.models.state import State
                
                # 지역명 파싱
                parts = location_name.strip().split()
                
                # city_name 정규화 매핑
                city_mapping = {
                    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시",
                    "인천": "인천광역시", "광주": "광주광역시", "대전": "대전광역시",
                    "울산": "울산광역시", "세종": "세종특별자치시", "경기": "경기도",
                    "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
                    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도",
                    "경남": "경상남도", "제주": "제주특별자치도"
                }
                
                state = None
                
                # 동 레벨 판단 헬퍼 함수
                def is_dong_level(name: str) -> bool:
                    return name.endswith(("동", "리", "가"))
                
                # 시도명 정규화 헬퍼 함수
                def normalize_city(name: str) -> str:
                    city_part = name.replace("시", "특별시").replace("도", "")
                    result = city_mapping.get(city_part, city_part)
                    if not result.endswith(("시", "도", "특별시", "광역시", "특별자치시", "특별자치도")):
                        result = city_mapping.get(city_part, f"{city_part}시")
                    return result
                
                # ===== 최적화: 단일 쿼리로 검색 =====
                if len(parts) >= 3:
                    # 3단계: "경기도 파주시 야당동"
                    city_name = normalize_city(parts[0])
                    dong_part = parts[2]
                    
                    # 필요한 컬럼만 SELECT, LIMIT 1 (인덱스 활용)
                    result = await db.execute(
                        select(State.region_id)
                        .where(
                            State.is_deleted == False,
                            State.city_name == city_name,
                            State.region_name == dong_part,
                            ~State.region_code.like("_____00000")  # 동 레벨
                        )
                        .limit(1)
                    )
                    row = result.scalar_one_or_none()
                    if row:
                        region_id = row
                        
                elif len(parts) == 2:
                    first_part, second_part = parts[0], parts[1]
                    
                    if is_dong_level(second_part):
                        # "파주시 야당동" (시군구 + 동) - 최적화된 단일 쿼리
                        result = await db.execute(
                            select(State.region_id)
                            .where(
                                State.is_deleted == False,
                                State.region_name == second_part,
                                ~State.region_code.like("_____00000")  # 동 레벨
                            )
                            .limit(1)
                        )
                        row = result.scalar_one_or_none()
                        if row:
                            region_id = row
                    else:
                        # "경기도 파주시" (시도 + 시군구)
                        city_name = normalize_city(first_part)
                        
                        result = await db.execute(
                            select(State.region_id)
                            .where(
                                State.is_deleted == False,
                                State.city_name == city_name,
                                State.region_name == second_part,
                                State.region_code.like("_____00000")  # 시군구 레벨
                            )
                            .limit(1)
                        )
                        row = result.scalar_one_or_none()
                        if row:
                            region_id = row
                else:
                    # 1단계: "야당동" 또는 "파주시"
                    region_part = parts[0]
                    
                    if is_dong_level(region_part):
                        # 동 레벨
                        result = await db.execute(
                            select(State.region_id)
                            .where(
                                State.is_deleted == False,
                                State.region_name == region_part,
                                ~State.region_code.like("_____00000")
                            )
                            .limit(1)
                        )
                    else:
                        # 시군구 레벨
                        result = await db.execute(
                            select(State.region_id)
                            .where(
                                State.is_deleted == False,
                                State.region_name == region_part,
                                State.region_code.like("_____00000")
                            )
                            .limit(1)
                        )
                    
                    row = result.scalar_one_or_none()
                    if row:
                        region_id = row
                
                if not region_id:
                    logger.warning(f"지역명을 찾을 수 없습니다: {location_name}")
            except Exception as e:
                logger.warning(f"지역명 매칭 실패: {location_name}, 오류: {str(e)}")
        
        # 상세 검색 실행
        apartments = await apartment_service.detailed_search(
            db,
            region_id=region_id,
            min_area=request.min_area,
            max_area=request.max_area,
            min_price=request.min_price,
            max_price=request.max_price,
            subway_max_distance_minutes=request.subway_max_distance_minutes,
            has_education_facility=request.has_education_facility,
            limit=request.limit,
            skip=request.skip
        )
        
        return {
            "success": True,
            "data": {
                "results": apartments,
                "count": len(apartments),
                "total": len(apartments),
                "limit": request.limit,
                "skip": request.skip
            }
        }
    except Exception as e:
        logger.error(f"아파트 상세 검색 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"검색 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/{apt_id}/exclusive-areas",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="아파트 전용면적 목록 조회",
    description="""
    특정 아파트의 실제 거래 데이터에서 전용면적 목록을 조회합니다.
    
    ### 제공 데이터
    - 매매 및 전월세 거래 데이터에서 실제 거래된 전용면적을 추출
    - 중복 제거 및 정렬된 전용면적 배열 반환
    
    ### 응답 형식
    - `exclusive_areas`: 전용면적 배열 (㎡ 단위, 오름차순 정렬)
    """,
    responses={
        200: {
            "description": "전용면적 목록 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "apt_id": 1,
                            "apt_name": "래미안 강남파크",
                            "exclusive_areas": [59.99, 84.5, 102.3, 114.2]
                        }
                    }
                }
            }
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        }
    }
)
async def get_apartment_exclusive_areas(
    apt_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    아파트 전용면적 목록 조회
    
    특정 아파트의 실제 거래 데이터에서 전용면적을 추출하여 반환합니다.
    """
    try:
        # 아파트 존재 확인
        apt_result = await db.execute(
            select(Apartment).where(Apartment.apt_id == apt_id)
        )
        apartment = apt_result.scalar_one_or_none()
        
        if not apartment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"아파트를 찾을 수 없습니다 (apt_id: {apt_id})"
            )
        
        # 매매 및 전월세 데이터에서 전용면적 추출
        from app.models.sale import Sale
        from app.models.rent import Rent
        
        # 매매 데이터에서 전용면적 추출
        sale_stmt = (
            select(Sale.exclusive_area)
            .where(
                and_(
                    Sale.apt_id == apt_id,
                    Sale.exclusive_area > 0,
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                    Sale.exclusive_area.isnot(None)
                )
            )
            .distinct()
            .limit(100)
        )
        
        sale_result = await db.execute(sale_stmt)
        sale_areas = [float(row[0]) for row in sale_result.fetchall() if row[0] is not None]
        
        # 전월세 데이터에서 전용면적 추출
        rent_stmt = (
            select(Rent.exclusive_area)
            .where(
                and_(
                    Rent.apt_id == apt_id,
                    Rent.exclusive_area > 0,
                    (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                    Rent.exclusive_area.isnot(None)
                )
            )
            .distinct()
            .limit(100)
        )
        
        rent_result = await db.execute(rent_stmt)
        rent_areas = [float(row[0]) for row in rent_result.fetchall() if row[0] is not None]
        
        # 중복 제거 및 정렬
        all_areas = sorted(list(set(sale_areas + rent_areas)))
        
        return {
            "success": True,
            "data": {
                "apt_id": apartment.apt_id,
                "apt_name": apartment.apt_name,
                "exclusive_areas": all_areas
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f" 전용면적 목록 조회 실패: apt_id={apt_id}, 오류={str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"전용면적 목록 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/{apt_id}/percentile",
    response_model=PercentileResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Apartment (아파트)"],
    summary="아파트 percentile 조회 (전국 기준 + 동 내 기준)",
    description="""
    특정 아파트의 전국 기준 percentile과 동 내 percentile을 모두 조회합니다.
    
    ### 기능
    - 전국 모든 아파트 기준 percentile 계산 (기본)
    - 동 내 아파트 기준 percentile 계산 (상세 정보)
    - 최근 6개월 매매 거래 데이터로 평당가 계산
    - 해당 아파트의 평당가와 비교하여 percentile 및 순위 계산
    
    ### 요청 정보
    - `apt_id`: 아파트 ID (path parameter)
    
    ### 응답 정보
    - `percentile`: 전국 상위 percentile (0~100)
    - `rank`: 전국 순위 (1부터 시작)
    - `total_count`: 전국 비교 대상 아파트 총 개수
    - `region_percentile`: 동 내 상위 percentile (0~100, 선택적)
    - `region_rank`: 동 내 순위 (1부터 시작, 선택적)
    - `region_total_count`: 동 내 비교 대상 아파트 총 개수 (선택적)
    - `price_per_pyeong`: 해당 아파트의 평당가 (만원)
    - `average_price_per_pyeong`: 전국 평균 평당가 (만원)
    - `region_average_price_per_pyeong`: 동 내 평균 평당가 (만원, 선택적)
    - `display_text`: 표시용 텍스트 (예: "상위 15% (100개 중 15위)")
    
    ### 에러 처리
    - 데이터가 부족한 경우 (전국 거래 데이터가 5개 미만): 400 에러 반환
    - 아파트를 찾을 수 없는 경우: 404 에러 반환
    """,
    responses={
        200: {
            "description": "percentile 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "apt_id": 1,
                        "apt_name": "래미안 강남파크",
                        "region_name": "역삼동",
                        "city_name": "서울특별시",
                        "percentile": 15.0,
                        "rank": 15,
                        "total_count": 10000,
                        "region_percentile": 20.0,
                        "region_rank": 8,
                        "region_total_count": 40,
                        "price_per_pyeong": 8500.0,
                        "average_price_per_pyeong": 7500.0,
                        "region_average_price_per_pyeong": 8000.0,
                        "period_months": 6,
                        "display_text": "상위 15% (10000개 중 15위)"
                    }
                }
            }
        },
        400: {
            "description": "데이터 부족 (동 내 거래 데이터가 5개 미만)"
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        }
    }
)
async def get_apartment_percentile(
    apt_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    아파트 percentile 조회 (전국 기준 + 동 내 기준)
    
    전국 아파트 기준 percentile과 동 내 percentile을 모두 계산하여 반환합니다.
    - 전국 기준: 모든 아파트의 최근 6개월 평당가 기준
    - 동 내 기준: 같은 동 내 아파트의 최근 6개월 평당가 기준
    """
    try:
        # 1. 아파트 정보 조회
        apt_stmt = (
            select(Apartment, State)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                Apartment.apt_id == apt_id,
                (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                (State.is_deleted == False) | (State.is_deleted.is_(None))
            )
        )
        apt_result = await db.execute(apt_stmt)
        apt_row = apt_result.first()
        
        if not apt_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="아파트를 찾을 수 없습니다"
            )
        
        apartment, region = apt_row
        region_id = apartment.region_id
        
        # 2. 최근 6개월 날짜 범위 계산
        today = date.today()
        six_months_ago = today - timedelta(days=180)
        
        # 3. 전국 모든 아파트의 최근 6개월 평당가 계산
        # 평당가 = (매매가 / 전용면적) * 3.3 (평 변환)
        # 평당가 단위: 만원/평
        national_price_stmt = (
            select(
                Sale.apt_id,
                func.avg(
                    cast(Sale.trans_price, Float) / 
                    cast(Sale.exclusive_area, Float) * 3.3
                ).label('avg_price_per_pyeong')
            )
            .join(Apartment, Sale.apt_id == Apartment.apt_id)
            .where(
                Sale.contract_date.isnot(None),
                Sale.contract_date >= six_months_ago,
                Sale.contract_date <= today,
                Sale.trans_price.isnot(None),
                Sale.trans_price > 0,
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0,
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
            )
            .group_by(Sale.apt_id)
            .having(func.count(Sale.trans_id) >= 1)  # 최소 1건 이상 거래
        )
        
        national_price_result = await db.execute(national_price_stmt)
        national_price_data = {row[0]: float(row[1]) for row in national_price_result.fetchall()}
        
        # 4. 전국 데이터 부족 체크 (최소 5개 아파트 필요)
        if len(national_price_data) < 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"전국 거래 데이터가 부족합니다 (필요: 5개 이상, 현재: {len(national_price_data)}개)"
            )
        
        # 5. 해당 아파트의 평당가 확인 (전국 기준)
        target_price_per_pyeong = national_price_data.get(apt_id)
        if target_price_per_pyeong is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="해당 아파트의 최근 6개월 거래 데이터가 없습니다"
            )
        
        # 6. 전국 percentile 계산
        # 가격이 높을수록 상위 percentile
        national_sorted_prices = sorted(national_price_data.values(), reverse=True)
        national_total_count = len(national_sorted_prices)
        
        # 해당 아파트보다 높은 가격의 아파트 개수
        national_higher_count = sum(1 for price in national_sorted_prices if price > target_price_per_pyeong)
        
        # 전국 percentile 계산: (더 높은 가격의 아파트 수 / 전체) * 100
        national_percentile = (national_higher_count / national_total_count) * 100
        
        # 전국 순위 계산 (1부터 시작, 같은 가격은 같은 순위)
        national_rank = national_higher_count + 1
        
        # 전국 평균 평당가 계산
        national_average_price_per_pyeong = sum(national_sorted_prices) / national_total_count
        
        # 7. 동 내 percentile 계산 (선택적)
        same_region_apts_stmt = (
            select(Apartment.apt_id)
            .where(
                Apartment.region_id == region_id,
                (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
            )
        )
        same_region_result = await db.execute(same_region_apts_stmt)
        same_region_apt_ids = [row[0] for row in same_region_result.fetchall()]
        
        region_percentile = None
        region_rank = None
        region_total_count = None
        region_average_price_per_pyeong = None
        
        if same_region_apt_ids:
            # 동 내 아파트의 평당가만 필터링
            region_price_data = {apt_id: price for apt_id, price in national_price_data.items() if apt_id in same_region_apt_ids}
            
            if len(region_price_data) >= 5 and apt_id in region_price_data:
                region_sorted_prices = sorted(region_price_data.values(), reverse=True)
                region_total_count = len(region_sorted_prices)
                region_higher_count = sum(1 for price in region_sorted_prices if price > target_price_per_pyeong)
                region_percentile = (region_higher_count / region_total_count) * 100
                region_rank = region_higher_count + 1
                region_average_price_per_pyeong = sum(region_sorted_prices) / region_total_count
        
        # 8. 표시용 텍스트 생성 (전국 기준)
        display_text = f"상위 {national_percentile:.1f}% ({national_total_count}개 중 {national_rank}위)"
        
        # 9. 응답 생성
        response = PercentileResponse(
            apt_id=apartment.apt_id,
            apt_name=apartment.apt_name,
            region_name=region.region_name,
            city_name=region.city_name,
            # 전국 기준
            percentile=round(national_percentile, 1),
            rank=national_rank,
            total_count=national_total_count,
            # 동 내 기준 (선택적)
            region_percentile=round(region_percentile, 1) if region_percentile is not None else None,
            region_rank=region_rank,
            region_total_count=region_total_count,
            price_per_pyeong=round(target_price_per_pyeong, 1),
            average_price_per_pyeong=round(national_average_price_per_pyeong, 1),
            region_average_price_per_pyeong=round(region_average_price_per_pyeong, 1) if region_average_price_per_pyeong is not None else None,
            period_months=6,
            display_text=display_text
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f" percentile 조회 실패: apt_id={apt_id}, 오류={str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"percentile 조회 중 오류가 발생했습니다: {str(e)}"
        )