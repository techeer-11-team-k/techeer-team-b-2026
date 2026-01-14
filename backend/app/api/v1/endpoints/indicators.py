"""
지표 관련 API 엔드포인트

담당 기능:
- 부동산 지수 조회 (GET /indicators/house-scores/{id}/{YYYYMM})
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.crud.house_score import house_score as house_score_crud
from app.schemas.house_score import HouseScoreResponse
from pydantic import BaseModel, Field


router = APIRouter()


class HouseScoreValueResponse(BaseModel):
    """부동산 지수 값 응답 스키마"""
    index_value: float = Field(..., description="지수 값 (2017.11=100 기준)")
    index_type: str = Field(..., description="지수 유형 (APT=아파트, HOUSE=단독주택, ALL=전체)")
    index_change_rate: float | None = Field(None, description="지수 변동률")


class HouseScoreIndicatorResponse(BaseModel):
    """부동산 지수 지표 응답 스키마"""
    region_id: int = Field(..., description="지역 ID")
    base_ym: str = Field(..., description="기준 년월 (YYYYMM)")
    values: List[HouseScoreValueResponse] = Field(..., description="지수 값 목록")


@router.get(
    "/house-scores/{region_id}/{base_ym}",
    response_model=HouseScoreIndicatorResponse,
    status_code=status.HTTP_200_OK,
    tags=["📈 Indicators (지표)"],
    summary="부동산 지수 조회",
    description="""
    특정 지역과 기준 년월의 부동산 지수를 조회합니다.
    
    **Path Parameters:**
    - `region_id`: 지역 ID (STATES 테이블의 region_id)
    - `base_ym`: 기준 년월 (YYYYMM 형식, 예: 202309)
    
    **Response:**
    - `region_id`: 지역 ID
    - `base_ym`: 기준 년월
    - `values`: 지수 값 목록 (각 index_type별로 반환)
      - `index_value`: 지수 값 (2017.11=100 기준)
      - `index_type`: 지수 유형 (APT, HOUSE, ALL)
      - `index_change_rate`: 지수 변동률 (선택)
    
    **주의사항:**
    - 같은 region_id와 base_ym 조합에 대해 여러 index_type (APT, HOUSE, ALL)이 있을 수 있습니다.
    - 해당하는 데이터가 없으면 404 에러를 반환합니다.
    """,
    responses={
        200: {
            "description": "조회 성공",
            "model": HouseScoreIndicatorResponse
        },
        404: {
            "description": "해당 지역/년월의 데이터를 찾을 수 없음"
        },
        422: {
            "description": "입력값 검증 실패 (base_ym 형식 오류 등)"
        }
    }
)
async def get_house_score_indicator(
    region_id: int = Path(..., description="지역 ID", ge=1),
    base_ym: str = Path(..., description="기준 년월 (YYYYMM)", regex="^\\d{6}$"),
    db: AsyncSession = Depends(get_db)
) -> HouseScoreIndicatorResponse:
    """
    부동산 지수 조회
    
    특정 지역(region_id)과 기준 년월(base_ym)에 해당하는 부동산 지수를 조회합니다.
    여러 index_type (APT, HOUSE, ALL)의 값이 모두 반환됩니다.
    
    Args:
        region_id: 지역 ID (STATES 테이블의 region_id)
        base_ym: 기준 년월 (YYYYMM 형식, 예: 202309)
        db: 데이터베이스 세션
    
    Returns:
        HouseScoreIndicatorResponse: 부동산 지수 정보
    
    Raises:
        HTTPException:
            - 404: 해당 지역/년월의 데이터를 찾을 수 없음
            - 422: base_ym 형식이 올바르지 않음
    """
    # 데이터 조회
    house_scores = await house_score_crud.get_by_region_and_month(
        db,
        region_id=region_id,
        base_ym=base_ym
    )
    
    if not house_scores:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "NOT_FOUND",
                "message": f"지역 ID {region_id}, 기준 년월 {base_ym}에 해당하는 부동산 지수 데이터를 찾을 수 없습니다."
            }
        )
    
    # 응답 데이터 구성
    values = []
    for score in house_scores:
        values.append(HouseScoreValueResponse(
            index_value=float(score.index_value),
            index_type=score.index_type,
            index_change_rate=float(score.index_change_rate) if score.index_change_rate is not None else None
        ))
    
    return HouseScoreIndicatorResponse(
        region_id=region_id,
        base_ym=base_ym,
        values=values
    )
