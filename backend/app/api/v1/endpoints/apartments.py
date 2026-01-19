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
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func, and_, desc, case, cast, or_
from sqlalchemy.types import Float
from geoalchemy2 import functions as geo_func

from app.api.v1.deps import get_db
from app.services.apartment import apartment_service
from app.schemas.apartment import ApartDetailBase, VolumeTrendResponse, PriceTrendResponse
from app.schemas.apartment_search import DetailedSearchRequest, DetailedSearchResponse
from app.models.apart_detail import ApartDetail
from app.models.sale import Sale
from app.models.rent import Rent
from app.models.apartment import Apartment
from app.models.state import State
from app.utils.cache import (
    get_from_cache,
    set_to_cache,
    get_nearby_price_cache_key,
    get_nearby_comparison_cache_key,
    build_cache_key
)
from app.utils.kakao_api import address_to_coordinates

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get(
    "",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🏠 Apartment (아파트)"],
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
    tags=["🏠 Apartment (아파트)"],
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
        logger.error(f"❌ 급상승 아파트 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"급상승 아파트 조회 중 오류가 발생했습니다: {str(e)}"
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
    tags=["🏠 Apartment (아파트)"],
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
    tags=["🏠 Apartment (아파트)"],
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
    tags=["🏠 Apartment (아파트)"],
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
    db: AsyncSession = Depends(get_db)
):
    """
    주변 아파트 비교 조회
    
    기준 아파트로부터 지정된 반경 내의 주변 아파트들을 거리순으로 조회하고,
    각 아파트의 최근 거래 가격 정보를 포함하여 비교 데이터를 제공합니다.
    """
    limit = 10  # 최대 10개
    
    # 캐시 키 생성
    cache_key = get_nearby_comparison_cache_key(apt_id, months, radius_meters)
    
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
        limit=limit
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
    tags=["🏠 Apartment (아파트)"],
    summary="전체 아파트 주소를 좌표로 변환하여 geometry 일괄 업데이트",
    description="""
    주소를 좌표로 변환하고 geometry 컬럼을 일괄 업데이트합니다.
    
    ### 기능
    1. apart_details 테이블의 **모든 레코드**를 조회 (geometry가 있는 것도 포함)
    2. 각 레코드의 road_address 또는 jibun_address를 사용하여 카카오 API 호출
    3. 좌표를 받아서 PostGIS Point로 변환하여 geometry 컬럼 업데이트
    4. **이미 geometry가 있는 레코드는 건너뜁니다** (중복 처리 방지)
    
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
    
    apart_details 테이블의 geometry가 없는 레코드에 대해
    카카오 API를 통해 좌표를 조회하고 geometry 컬럼을 일괄 업데이트합니다.
    (이미 geometry가 있는 레코드는 건너뜁니다)
    
    Args:
        limit: 처리할 최대 레코드 수 (None이면 전체)
        batch_size: 배치 크기 (기본값: 20)
        db: 데이터베이스 세션
    
    Returns:
        업데이트 결과 딕셔너리
    """
    try:
        logger.info("🚀 Geometry 일괄 업데이트 작업 시작")
        
        # geometry가 NULL인 레코드 조회
        logger.info("🔍 geometry가 비어있는 레코드 조회 중...")
        
        stmt = select(ApartDetail).where(ApartDetail.geometry.is_(None))
        
        if limit:
            stmt = stmt.limit(limit)
        
        result = await db.execute(stmt)
        records = result.scalars().all()
        
        total_processed = len(records)
        
        if total_processed == 0:
            logger.info("ℹ️  업데이트할 레코드가 없습니다. (모든 레코드에 geometry가 이미 설정되어 있습니다)")
            return {
                "success": True,
                "message": "업데이트할 레코드가 없습니다.",
                "data": {
                    "total_processed": 0,
                    "success_count": 0,
                    "failed_count": 0,
                    "skipped_count": 0
                }
            }
        
        logger.info(f"📊 총 {total_processed}개 레코드 처리 예정")
        
        success_count = 0
        failed_count = 0
        
        # 배치 처리
        for batch_start in range(0, total_processed, batch_size):
            batch_end = min(batch_start + batch_size, total_processed)
            batch_records = records[batch_start:batch_end]
            
            logger.info(f"📦 배치 처리 중: {batch_start + 1}~{batch_end}/{total_processed}")
            
            for idx, record in enumerate(batch_records, start=batch_start + 1):
                try:
                    # 이미 geometry가 있는 경우 건너뛰기
                    if record.geometry is not None:
                        logger.debug(f"[{idx}/{total_processed}] ⏭️  건너뜀: apt_detail_id={record.apt_detail_id} (이미 geometry 있음)")
                        continue
                    
                    # 주소 선택 (도로명 주소 우선, 없으면 지번 주소)
                    address = record.road_address if record.road_address else record.jibun_address
                    
                    if not address:
                        logger.warning(f"[{idx}/{total_processed}] ⚠️  주소 없음: apt_detail_id={record.apt_detail_id}")
                        failed_count += 1
                        continue
                    
                    # 카카오 API로 좌표 변환
                    logger.debug(f"[{idx}/{total_processed}] 🌐 카카오 API 호출 중... 주소='{address}'")
                    coordinates = await address_to_coordinates(address)
                    
                    if not coordinates:
                        logger.warning(f"[{idx}/{total_processed}] ⚠️  좌표 변환 실패: apt_detail_id={record.apt_detail_id}, 주소='{address}'")
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
                    
                    logger.debug(f"[{idx}/{total_processed}] ✅ 성공: apt_detail_id={record.apt_detail_id}, 좌표=({longitude}, {latitude})")
                    success_count += 1
                    
                except Exception as e:
                    logger.error(f"[{idx}/{total_processed}] ❌ 레코드 처리 오류: apt_detail_id={record.apt_detail_id}, 오류={str(e)}", exc_info=True)
                    failed_count += 1
            
            # 배치마다 커밋
            await db.commit()
            logger.info(f"✅ 배치 커밋 완료: {batch_start + 1}~{batch_end}/{total_processed}")
        
        logger.info("🎉 Geometry 일괄 업데이트 작업 완료!")
        logger.info(f"   처리한 레코드: {total_processed}개")
        logger.info(f"   성공: {success_count}개")
        logger.info(f"   실패: {failed_count}개")
        
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
        logger.error(f"❌ Geometry 업데이트 실패: 설정 오류 - {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"설정 오류: {str(e)}"
        )
    except Exception as e:
        logger.error(f"❌ Geometry 업데이트 중 예상치 못한 오류 발생!", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"geometry 업데이트 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/{apt_id}/transactions",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🏠 Apartment (아파트)"],
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
    limit: int = Query(10, ge=1, le=50, description="최근 거래 내역 개수"),
    months: int = Query(6, ge=1, le=36, description="가격 추이 조회 기간 (개월, 최대 36개월)"),
    area: Optional[float] = Query(None, description="전용면적 필터 (㎡)"),
    area_tolerance: float = Query(5.0, description="전용면적 허용 오차 (㎡, 기본값: 5.0)"),
    db: AsyncSession = Depends(get_db)
):
    """
    아파트 실거래 내역 조회
    
    시세 내역, 최근 6개월간 변화량, 가격 변화 추이를 반환합니다.
    """
    # 캐시 키 생성 (area, area_tolerance 추가)
    cache_key = build_cache_key("apartment", "transactions", str(apt_id), transaction_type, str(limit), str(months), str(area) if area else "all", str(area_tolerance))
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
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
            date_field = Sale.contract_date
            area_field = Sale.exclusive_area
            base_filter = and_(
                Sale.apt_id == apt_id,
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.trans_price.isnot(None),
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0,
                or_(Sale.remarks != "더미", Sale.remarks.is_(None))
            )
        elif transaction_type == "jeonse":
            trans_table = Rent
            price_field = Rent.deposit_price
            date_field = Rent.deal_date
            area_field = Rent.exclusive_area
            base_filter = and_(
                Rent.apt_id == apt_id,
                or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),  # 전세: 월세가 0이거나 NULL
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deposit_price.isnot(None),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0,
                or_(Rent.remarks != "더미", Rent.remarks.is_(None))
            )
        elif transaction_type == "monthly":
            trans_table = Rent
            price_field = Rent.deposit_price # 통계(평당가 등) 계산 시 보증금 기준
            date_field = Rent.deal_date
            area_field = Rent.exclusive_area
            base_filter = and_(
                Rent.apt_id == apt_id,
                Rent.monthly_rent > 0,  # 월세만
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.monthly_rent.isnot(None),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0,
                or_(Rent.remarks != "더미", Rent.remarks.is_(None))
            )
        else:
            # 기본값 sale (안전장치)
            trans_table = Sale
            price_field = Sale.trans_price
            date_field = Sale.contract_date
            area_field = Sale.exclusive_area
            base_filter = and_(
                Sale.apt_id == apt_id,
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.trans_price.isnot(None),
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0,
                or_(Sale.remarks != "더미", Sale.remarks.is_(None))
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
        # 월세의 경우 전월세전환율 등을 고려하지 않고 단순 월세 평균으로 계산하면 의미가 다를 수 있음.
        # 하지만 일단 요청대로 진행.
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=months * 30)
        
        month_expr = func.to_char(date_field, 'YYYY-MM')
        
        # 가격 변화 추이 쿼리
        trend_stmt = (
            select(
                month_expr.label('month'),
                func.avg(
                    case(
                        (and_(
                            area_field.isnot(None),
                            area_field > 0
                        ), cast(price_field, Float) / cast(area_field, Float) * 3.3),
                        else_=None
                    )
                ).label('avg_price_per_pyeong'),
                func.avg(cast(price_field, Float)).label('avg_price'),
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
        
        # 3. 최근 6개월 변화량 계산
        six_months_ago = end_date - timedelta(days=180)
        recent_start = end_date - timedelta(days=90)  # 최근 3개월
        
        previous_avg_stmt = (
            select(
                func.avg(
                    case(
                        (and_(
                            area_field.isnot(None),
                            area_field > 0
                        ), cast(price_field, Float) / cast(area_field, Float) * 3.3),
                        else_=None
                    )
                ).label('avg_price_per_pyeong')
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
                func.avg(
                    case(
                        (and_(
                            area_field.isnot(None),
                            area_field > 0
                        ), cast(price_field, Float) / cast(area_field, Float) * 3.3),
                        else_=None
                    )
                ).label('avg_price_per_pyeong')
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
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"아파트 실거래 내역 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.post(
    "/search",
    response_model=DetailedSearchResponse,
    status_code=status.HTTP_200_OK,
    tags=["🏠 Apartment (아파트)"],
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
            
            # 지역명으로 region_id 찾기
            # 지원 형식:
            # - "경기도 파주시 야당동" (3단계: 시도 시군구 동)
            # - "파주시 야당동" (2단계: 시군구 동)
            # - "경기도 파주시" (2단계: 시도 시군구)
            # - "야당동" (1단계: 동)
            # - "파주시" (1단계: 시군구)
            try:
                from sqlalchemy import and_
                from app.models.state import State
                
                # 지역명 파싱
                parts = location_name.strip().split()
                
                # city_name 정규화 매핑
                city_mapping = {
                    "서울": "서울특별시",
                    "부산": "부산광역시",
                    "대구": "대구광역시",
                    "인천": "인천광역시",
                    "광주": "광주광역시",
                    "대전": "대전광역시",
                    "울산": "울산광역시",
                    "세종": "세종특별자치시",
                    "경기": "경기도",
                    "강원": "강원특별자치도",
                    "충북": "충청북도",
                    "충남": "충청남도",
                    "전북": "전북특별자치도",
                    "전남": "전라남도",
                    "경북": "경상북도",
                    "경남": "경상남도",
                    "제주": "제주특별자치도"
                }
                
                state = None
                
                if len(parts) >= 3:
                    # 3단계: "경기도 파주시 야당동" 형식
                    city_part = parts[0].replace("시", "특별시").replace("도", "")
                    sigungu_part = parts[1]
                    dong_part = parts[2]
                    
                    city_name = city_mapping.get(city_part, city_part)
                    if not city_name.endswith(("시", "도", "특별시", "광역시", "특별자치시", "특별자치도")):
                        city_name = city_mapping.get(city_part, f"{city_part}시")
                    
                    # 동 레벨 검색 (region_code 마지막 5자리가 "00000"이 아님)
                    result = await db.execute(
                        select(State)
                        .where(
                            and_(
                                State.city_name == city_name,
                                State.region_name == dong_part,
                                ~State.region_code.like("%00000"),  # 동 레벨 (시군구가 아님)
                                State.is_deleted == False
                            )
                        )
                    )
                    states = result.scalars().all()
                    
                    # 시군구명으로 필터링 (region_code의 앞 5자리로 매칭)
                    for s in states:
                        # 해당 동이 속한 시군구 찾기
                        sigungu_result = await db.execute(
                            select(State)
                            .where(
                                and_(
                                    State.city_name == city_name,
                                    State.region_name == sigungu_part,
                                    State.region_code.like("%00000"),  # 시군구 레벨
                                    State.region_code[:5] == s.region_code[:5],  # 같은 시군구 코드
                                    State.is_deleted == False
                                )
                            )
                            .limit(1)
                        )
                        sigungu_state = sigungu_result.scalar_one_or_none()
                        if sigungu_state:
                            state = s
                            break
                    
                    # 매칭 실패 시 동 이름만으로 검색
                    if not state and states:
                        state = states[0]
                        
                elif len(parts) == 2:
                    # 2단계: "파주시 야당동" 또는 "경기도 파주시" 형식
                    first_part = parts[0]
                    second_part = parts[1]
                    
                    # "동"으로 끝나는지 확인하여 동 레벨인지 판단
                    is_dong = second_part.endswith("동") or second_part.endswith("리") or second_part.endswith("가")
                    
                    if is_dong:
                        # "파주시 야당동" 형식 (시군구 + 동)
                        sigungu_part = first_part
                        dong_part = second_part
                        
                        # 시군구 찾기
                        sigungu_result = await db.execute(
                            select(State)
                            .where(
                                and_(
                                    State.region_name == sigungu_part,
                                    State.region_code.like("%00000"),  # 시군구 레벨
                                    State.is_deleted == False
                                )
                            )
                            .limit(1)
                        )
                        sigungu_state = sigungu_result.scalar_one_or_none()
                        
                        if sigungu_state:
                            # 해당 시군구에 속한 동 찾기
                            sigungu_code_prefix = sigungu_state.region_code[:5]
                            result = await db.execute(
                                select(State)
                                .where(
                                    and_(
                                        State.region_name == dong_part,
                                        State.region_code.like(f"{sigungu_code_prefix}%"),
                                        ~State.region_code.like("%00000"),  # 동 레벨
                                        State.is_deleted == False
                                    )
                                )
                                .limit(1)
                            )
                            state = result.scalar_one_or_none()
                    else:
                        # "경기도 파주시" 형식 (시도 + 시군구)
                        city_part = first_part.replace("시", "특별시").replace("도", "")
                        sigungu_part = second_part
                        
                        city_name = city_mapping.get(city_part, city_part)
                        if not city_name.endswith(("시", "도", "특별시", "광역시", "특별자치시", "특별자치도")):
                            city_name = city_mapping.get(city_part, f"{city_part}시")
                        
                        # 시군구 레벨 검색
                        result = await db.execute(
                            select(State)
                            .where(
                                and_(
                                    State.city_name == city_name,
                                    State.region_name == sigungu_part,
                                    State.region_code.like("%00000"),  # 시군구 레벨
                                    State.is_deleted == False
                                )
                            )
                            .limit(1)
                        )
                        state = result.scalar_one_or_none()
                else:
                    # 1단계: "야당동" 또는 "파주시" 형식
                    region_part = parts[0]
                    
                    # "동"으로 끝나는지 확인하여 동 레벨인지 판단
                    is_dong = region_part.endswith("동") or region_part.endswith("리") or region_part.endswith("가")
                    
                    if is_dong:
                        # 동 레벨 검색 (전체 검색)
                        result = await db.execute(
                            select(State)
                            .where(
                                and_(
                                    State.region_name == region_part,
                                    ~State.region_code.like("%00000"),  # 동 레벨
                                    State.is_deleted == False
                                )
                            )
                            .limit(1)
                        )
                        state = result.scalar_one_or_none()
                    else:
                        # 시군구 레벨 검색
                        result = await db.execute(
                            select(State)
                            .where(
                                and_(
                                    State.region_name == region_part,
                                    State.region_code.like("%00000"),  # 시군구 레벨
                                    State.is_deleted == False
                                )
                            )
                            .limit(1)
                        )
                        state = result.scalar_one_or_none()
                
                if state:
                    region_id = state.region_id
                else:
                    # 지역을 찾을 수 없으면 경고 로그만 남기고 계속 진행
                    logger.warning(f"지역명을 찾을 수 없습니다: {location_name}")
            except Exception as e:
                # 지역명 매칭 실패 시 로그만 남기고 계속 진행 (region_id는 None)
                logger.warning(f"지역명 매칭 실패: {location_name}, 오류: {str(e)}")
                pass
        
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