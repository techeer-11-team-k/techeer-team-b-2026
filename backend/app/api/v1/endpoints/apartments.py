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
from sqlalchemy import select, text, func, and_, desc, case, cast
from sqlalchemy.types import Float
from geoalchemy2 import functions as geo_func

from app.api.v1.deps import get_db
from app.services.apartment import apartment_service
from app.schemas.apartment import ApartDetailBase, VolumeTrendResponse, PriceTrendResponse
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
    results = await apartment_service.get_apartments_by_region(
        db,
        region_id=region_id,
        limit=limit,
        skip=skip
    )
    
    return {
        "success": True,
        "data": {
            "results": results,
            "count": len(results)
        }
    }

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
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세)"),
    limit: int = Query(10, ge=1, le=50, description="최근 거래 내역 개수"),
    months: int = Query(6, ge=1, le=12, description="가격 추이 조회 기간 (개월)"),
    db: AsyncSession = Depends(get_db)
):
    """
    아파트 실거래 내역 조회
    
    시세 내역, 최근 6개월간 변화량, 가격 변화 추이를 반환합니다.
    """
    # 캐시 키 생성
    cache_key = build_cache_key("apartment", "transactions", str(apt_id), transaction_type, str(limit), str(months))
    
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
                Sale.exclusive_area > 0
            )
        else:  # jeonse
            trans_table = Rent
            price_field = Rent.deposit_price
            date_field = Rent.deal_date
            area_field = Rent.exclusive_area
            base_filter = and_(
                Rent.apt_id == apt_id,
                Rent.monthly_rent == 0,  # 전세만
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deposit_price.isnot(None),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0
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
            else:
                trans_price = trans.deposit_price or 0
            
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
            recent_transactions.append(transaction_data)
        
        # 2. 가격 변화 추이 (월별)
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=months * 30)
        
        month_expr = func.to_char(date_field, 'YYYY-MM')
        
        # 가격 변화 추이 쿼리: exclusive_area가 0이거나 NULL인 경우 제외
        # Decimal 타입과 float 연산을 위해 cast 사용
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
        
        # 이전 3개월 평균 (exclusive_area가 0이거나 NULL인 경우 제외)
        # Decimal 타입과 float 연산을 위해 cast 사용
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
        
        # 최근 3개월 평균 (exclusive_area가 0이거나 NULL인 경우 제외)
        # Decimal 타입과 float 연산을 위해 cast 사용
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
        change_rate = 0.0
        if previous_avg > 0:
            change_rate = ((recent_avg - previous_avg) / previous_avg) * 100
        
        # 4. 통계 정보 (exclusive_area가 0이거나 NULL인 경우 제외)
        # Decimal 타입과 float 연산을 위해 cast 사용
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
                    "change_rate": round(change_rate, 2),
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