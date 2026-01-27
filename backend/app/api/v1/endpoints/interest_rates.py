"""
금리 지표 API 엔드포인트

금리 정보를 조회하고 관리하는 API입니다.

성능 최적화:
- Redis 캐싱 적용 (금리 데이터는 자주 변하지 않음)
- 캐시 TTL: 1시간 (수정 시 캐시 무효화)
"""
import logging
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Body, Query, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel, Field

from app.api.v1.deps import get_db
from app.models.interest_rate import InterestRate
from app.utils.cache import get_from_cache, set_to_cache, delete_cache_pattern, build_cache_key

logger = logging.getLogger(__name__)
router = APIRouter()

# 캐시 설정
INTEREST_RATE_CACHE_TTL = 3600  # 1시간
INTEREST_RATE_CACHE_KEY = "interest_rates:list"


# ===== Schemas =====
class InterestRateItem(BaseModel):
    """금리 항목"""
    rate_id: int
    rate_type: str
    rate_label: str
    rate_value: float
    change_value: float
    trend: str
    base_date: date
    description: Optional[str] = None

    class Config:
        from_attributes = True


class InterestRateListResponse(BaseModel):
    """금리 목록 응답"""
    success: bool = True
    data: List[InterestRateItem]
    meta: dict


class InterestRateUpdate(BaseModel):
    """금리 수정 요청"""
    rate_value: Optional[float] = Field(None, ge=0, le=100, description="금리 값 (%)")
    change_value: Optional[float] = Field(None, ge=-100, le=100, description="변동폭 (%)")
    trend: Optional[str] = Field(None, pattern="^(up|down|stable)$", description="추세")
    base_date: Optional[date] = Field(None, description="기준일")
    description: Optional[str] = Field(None, description="설명")


# ===== Endpoints =====
@router.get(
    "",
    response_model=InterestRateListResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Interest Rates (금리 지표)"],
    summary="금리 지표 목록 조회",
    description="""
    현재 금리 지표 목록을 조회합니다.
    
    ### 반환 정보
    - 기준금리, 주담대(고정), 주담대(변동), 전세대출 금리
    - 각 금리의 변동폭과 추세
    """,
    responses={
        200: {
            "description": "조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": [
                            {
                                "rate_id": 1,
                                "rate_type": "base_rate",
                                "rate_label": "기준금리",
                                "rate_value": 3.50,
                                "change_value": 0.00,
                                "trend": "stable",
                                "base_date": "2024-12-01",
                                "description": "한국은행 기준금리"
                            }
                        ],
                        "meta": {"count": 4}
                    }
                }
            }
        }
    }
)
async def get_interest_rates(
    db: AsyncSession = Depends(get_db)
):
    """금리 지표 목록 조회 (캐싱 적용)"""
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(INTEREST_RATE_CACHE_KEY)
    if cached_data is not None:
        logger.debug(" 금리 지표 캐시 히트")
        return cached_data
    
    # 2. 캐시 미스: DB에서 조회
    stmt = (
        select(InterestRate)
        .where(InterestRate.is_deleted == False)
        .order_by(InterestRate.rate_id)
    )
    
    result = await db.execute(stmt)
    rates = result.scalars().all()
    
    data = [
        InterestRateItem(
            rate_id=rate.rate_id,
            rate_type=rate.rate_type,
            rate_label=rate.rate_label,
            rate_value=float(rate.rate_value),
            change_value=float(rate.change_value),
            trend=rate.trend,
            base_date=rate.base_date,
            description=rate.description
        )
        for rate in rates
    ]
    
    response = {
        "success": True,
        "data": [item.model_dump() for item in data],
        "meta": {"count": len(data)}
    }
    
    # 3. 캐시에 저장
    await set_to_cache(INTEREST_RATE_CACHE_KEY, response, ttl=INTEREST_RATE_CACHE_TTL)
    logger.debug(f" 금리 지표 캐시 저장 (TTL: {INTEREST_RATE_CACHE_TTL}초)")
    
    return response


@router.put(
    "/{rate_type}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Interest Rates (금리 지표)"],
    summary="금리 지표 수정 (운영자용)",
    description="""
    특정 금리 지표를 수정합니다.
    
    ### 요청 정보
    - `rate_type`: 금리 유형 (base_rate, mortgage_fixed, mortgage_variable, jeonse_loan)
    - `rate_value`: 새 금리 값 (%)
    - `change_value`: 변동폭 (%)
    - `trend`: 추세 (up, down, stable)
    - `base_date`: 기준일
    
    ### 사용 예시
    Swagger UI(/docs)에서 직접 수정 가능합니다.
    """,
    responses={
        200: {
            "description": "수정 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "message": "금리 지표가 수정되었습니다.",
                        "data": {
                            "rate_type": "base_rate",
                            "rate_value": 3.50,
                            "change_value": 0.00,
                            "trend": "stable"
                        }
                    }
                }
            }
        },
        404: {"description": "금리 유형을 찾을 수 없음"}
    }
)
async def update_interest_rate(
    rate_type: str = Path(
        ...,
        description="금리 유형",
        example="base_rate",
        examples={
            "base_rate": {
                "summary": "기준금리",
                "value": "base_rate"
            },
            "mortgage_fixed": {
                "summary": "주담대(고정)",
                "value": "mortgage_fixed"
            },
            "mortgage_variable": {
                "summary": "주담대(변동)",
                "value": "mortgage_variable"
            },
            "jeonse_loan": {
                "summary": "전세대출",
                "value": "jeonse_loan"
            }
        }
    ),
    rate_update: InterestRateUpdate = Body(
        ...,
        description="수정할 금리 정보",
        examples=[{
            "rate_value": 3.75,
            "change_value": 0.25,
            "trend": "up",
            "base_date": "2025-01-01",
            "description": "2025년 1월 인상"
        }]
    ),
    db: AsyncSession = Depends(get_db)
):
    """금리 지표 수정 (운영자용)"""
    # 기존 금리 조회
    stmt = select(InterestRate).where(
        InterestRate.rate_type == rate_type,
        InterestRate.is_deleted == False
    )
    result = await db.execute(stmt)
    rate = result.scalar_one_or_none()
    
    if not rate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"금리 유형 '{rate_type}'을(를) 찾을 수 없습니다."
        )
    
    # 수정할 필드만 업데이트
    update_data = rate_update.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="수정할 내용이 없습니다."
        )
    
    for field, value in update_data.items():
        setattr(rate, field, value)
    
    await db.commit()
    await db.refresh(rate)
    
    # 캐시 무효화
    from app.utils.cache import delete_from_cache
    await delete_from_cache(INTEREST_RATE_CACHE_KEY)
    logger.info(f" 금리 지표 캐시 무효화 완료 (rate_type: {rate_type})")
    
    return {
        "success": True,
        "message": "금리 지표가 수정되었습니다.",
        "data": {
            "rate_type": rate.rate_type,
            "rate_label": rate.rate_label,
            "rate_value": float(rate.rate_value),
            "change_value": float(rate.change_value),
            "trend": rate.trend,
            "base_date": rate.base_date.isoformat() if rate.base_date else None
        }
    }


@router.post(
    "/batch-update",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Interest Rates (금리 지표)"],
    summary="금리 지표 일괄 수정 (운영자용)",
    description="""
    여러 금리 지표를 한 번에 수정합니다.
    
    ### 사용 예시
    모든 금리의 기준일을 한 번에 변경하거나,
    여러 금리를 동시에 업데이트할 때 사용합니다.
    """,
    responses={
        200: {"description": "일괄 수정 성공"}
    }
)
async def batch_update_interest_rates(
    updates: List[dict] = Body(
        ...,
        description="수정할 금리 목록",
        examples=[[
            {"rate_type": "base_rate", "rate_value": 3.75, "change_value": 0.25, "trend": "up"},
            {"rate_type": "mortgage_fixed", "rate_value": 4.35, "change_value": 0.14, "trend": "up"}
        ]]
    ),
    db: AsyncSession = Depends(get_db)
):
    """금리 지표 일괄 수정"""
    updated_count = 0
    errors = []
    
    for item in updates:
        rate_type = item.get("rate_type")
        if not rate_type:
            errors.append({"error": "rate_type is required"})
            continue
        
        stmt = select(InterestRate).where(
            InterestRate.rate_type == rate_type,
            InterestRate.is_deleted == False
        )
        result = await db.execute(stmt)
        rate = result.scalar_one_or_none()
        
        if not rate:
            errors.append({"rate_type": rate_type, "error": "not found"})
            continue
        
        # 업데이트 가능한 필드
        for field in ["rate_value", "change_value", "trend", "base_date", "description"]:
            if field in item:
                setattr(rate, field, item[field])
        
        updated_count += 1
    
    await db.commit()
    
    # 캐시 무효화
    if updated_count > 0:
        from app.utils.cache import delete_from_cache
        await delete_from_cache(INTEREST_RATE_CACHE_KEY)
        logger.info(f" 금리 지표 캐시 무효화 완료 (일괄 수정: {updated_count}개)")
    
    return {
        "success": True,
        "message": f"{updated_count}개의 금리 지표가 수정되었습니다.",
        "updated_count": updated_count,
        "errors": errors if errors else None
    }
