"""
아파트 관련 API 엔드포인트

담당 기능:
- 아파트 상세 정보 조회 (GET /apartments/{apt_id})
- 유사 아파트 조회 (GET /apartments/{apt_id}/similar)
- 주변 아파트 평균 가격 조회 (GET /apartments/{apt_id}/nearby_price)
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.services.apartment import apartment_service
from app.schemas.apartment import ApartDetailBase
from app.utils.cache import (
    get_from_cache,
    set_to_cache,
    get_nearby_price_cache_key
)

router = APIRouter()

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
    return await apartment_service.get_apart_detail(db, apt_id=apt_id)


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