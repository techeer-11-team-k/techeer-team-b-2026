"""
아파트 관련 API 엔드포인트

담당 기능:
- 아파트 상세 정보 조회 (GET /apartments/{apt_id})
- 유사 아파트 조회 (GET /apartments/{apt_id}/similar)
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.services.apartment import apartment_service
from app.schemas.apartment import ApartDetailBase, VolumeTrendResponse

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