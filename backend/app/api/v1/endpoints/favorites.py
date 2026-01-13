"""
관심 매물/지역 API 엔드포인트

관심 아파트와 관심 지역을 관리하는 API입니다.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_current_user
from app.models.account import Account
from app.models.state import State
from app.schemas.favorite import (
    FavoriteLocationCreate,
    FavoriteLocationResponse,
    FavoriteLocationListResponse
)
from app.crud.favorite import favorite_location as favorite_location_crud
from app.crud.state import state as state_crud
from app.core.exceptions import (
    NotFoundException,
    AlreadyExistsException,
    LimitExceededException
)

router = APIRouter()

# 관심 지역 최대 개수 제한
FAVORITE_LOCATION_LIMIT = 50


# ============ 관심 지역 API ============

@router.get(
    "/locations",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["⭐ Favorites (즐겨찾기)"],
    summary="관심 지역 목록 조회",
    description="""
    현재 로그인한 사용자가 저장한 관심 지역 목록을 조회합니다.
    
    ### 응답 정보
    - 각 관심 지역에는 지역 ID, 지역명, 시도명이 포함됩니다.
    - 최대 50개까지 저장 가능합니다.
    - 최신순으로 정렬됩니다.
    """,
    responses={
        200: {
            "description": "관심 지역 목록 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "favorites": [
                                {
                                    "favorite_id": 1,
                                    "account_id": 1,
                                    "region_id": 1,
                                    "region_name": "강남구",
                                    "city_name": "서울특별시",
                                    "created_at": "2026-01-10T15:30:00Z",
                                    "updated_at": "2026-01-10T15:30:00Z",
                                    "is_deleted": False
                                }
                            ],
                            "total": 1,
                            "limit": 50
                        }
                    }
                }
            }
        },
        401: {
            "description": "인증 필요"
        }
    }
)
async def get_favorite_locations(
    skip: int = Query(0, ge=0, description="건너뛸 레코드 수"),
    limit: int = Query(50, ge=1, le=50, description="가져올 레코드 수 (최대 50)"),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    관심 지역 목록 조회
    
    현재 로그인한 사용자의 관심 지역 목록을 반환합니다.
    """
    # 관심 지역 목록 조회
    favorites = await favorite_location_crud.get_by_account(
        db,
        account_id=current_user.account_id,
        skip=skip,
        limit=limit
    )
    
    # 총 개수 조회
    total = await favorite_location_crud.count_by_account(
        db,
        account_id=current_user.account_id
    )
    
    # 응답 데이터 구성 (State 관계 정보 포함)
    favorites_data = []
    for fav in favorites:
        region = fav.region  # State 관계 로드됨
        favorites_data.append({
            "favorite_id": fav.favorite_id,
            "account_id": fav.account_id,
            "region_id": fav.region_id,
            "region_name": region.region_name if region else None,
            "city_name": region.city_name if region else None,
            "created_at": fav.created_at.isoformat() if fav.created_at else None,
            "updated_at": fav.updated_at.isoformat() if fav.updated_at else None,
            "is_deleted": fav.is_deleted
        })
    
    return {
        "success": True,
        "data": {
            "favorites": favorites_data,
            "total": total,
            "limit": FAVORITE_LOCATION_LIMIT
        }
    }


@router.post(
    "/locations",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    tags=["⭐ Favorites (즐겨찾기)"],
    summary="관심 지역 추가",
    description="""
    새로운 관심 지역을 추가합니다.
    
    ### 제한사항
    - 최대 50개까지 저장 가능합니다.
    - 이미 추가된 지역은 다시 추가할 수 없습니다.
    
    ### 요청 정보
    - `region_id`: 추가할 지역의 ID (states 테이블의 region_id)
    """,
    responses={
        201: {
            "description": "관심 지역 추가 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "favorite_id": 1,
                            "account_id": 1,
                            "region_id": 1,
                            "region_name": "강남구",
                            "city_name": "서울특별시",
                            "created_at": "2026-01-11T12:00:00Z"
                        }
                    }
                }
            }
        },
        400: {
            "description": "제한 초과 또는 잘못된 요청"
        },
        404: {
            "description": "지역을 찾을 수 없음"
        },
        409: {
            "description": "이미 추가된 지역"
        },
        401: {
            "description": "인증 필요"
        }
    }
)
async def create_favorite_location(
    favorite_in: FavoriteLocationCreate = Body(
        ...,
        description="추가할 관심 지역 정보",
        example={"region_id": 1}
    ),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    관심 지역 추가
    
    새로운 관심 지역을 추가합니다. 이미 추가된 지역이거나 최대 개수를 초과하면 에러를 반환합니다.
    """
    # 1. 지역 존재 확인
    region = await state_crud.get(db, id=favorite_in.region_id)
    if not region or region.is_deleted:
        raise NotFoundException("지역")
    
    # 2. 중복 확인
    existing = await favorite_location_crud.get_by_account_and_region(
        db,
        account_id=current_user.account_id,
        region_id=favorite_in.region_id
    )
    if existing:
        raise AlreadyExistsException("관심 지역")
    
    # 3. 개수 제한 확인
    current_count = await favorite_location_crud.count_by_account(
        db,
        account_id=current_user.account_id
    )
    if current_count >= FAVORITE_LOCATION_LIMIT:
        raise LimitExceededException("관심 지역", FAVORITE_LOCATION_LIMIT)
    
    # 4. 관심 지역 생성
    favorite = await favorite_location_crud.create(
        db,
        obj_in=favorite_in,
        account_id=current_user.account_id
    )
    
    # State 관계 정보 포함 (이미 조회한 region 사용)
    return {
        "success": True,
        "data": {
            "favorite_id": favorite.favorite_id,
            "account_id": favorite.account_id,
            "region_id": favorite.region_id,
            "region_name": region.region_name if region else None,
            "city_name": region.city_name if region else None,
            "created_at": favorite.created_at.isoformat() if favorite.created_at else None
        }
    }


@router.delete(
    "/locations/{region_id}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["⭐ Favorites (즐겨찾기)"],
    summary="관심 지역 삭제",
    description="""
    관심 지역을 삭제합니다.
    
    ### 삭제 방식
    - 소프트 삭제를 사용합니다 (실제 데이터는 삭제되지 않음).
    - `is_deleted` 플래그를 `True`로 설정하여 삭제 처리합니다.
    - 이미 삭제된 지역을 다시 삭제하려고 하면 404 에러를 반환합니다.
    
    ### 요청 정보
    - `region_id`: 삭제할 지역의 ID (path parameter)
    """,
    responses={
        200: {
            "description": "관심 지역 삭제 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "message": "관심 지역이 삭제되었습니다.",
                            "region_id": 1
                        }
                    }
                }
            }
        },
        404: {
            "description": "관심 지역을 찾을 수 없음 (이미 삭제되었거나 존재하지 않음)",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {
                            "code": "FAVORITE_LOCATION_NOT_FOUND",
                            "message": "해당 관심 지역을(를) 찾을 수 없습니다."
                        }
                    }
                }
            }
        },
        401: {
            "description": "인증 필요"
        }
    }
)
async def delete_favorite_location(
    region_id: int,
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    관심 지역 삭제
    
    지정한 지역 ID에 해당하는 관심 지역을 소프트 삭제합니다.
    이미 삭제된 지역이거나 존재하지 않는 지역이면 404 에러를 반환합니다.
    """
    # 관심 지역 조회 및 삭제
    favorite = await favorite_location_crud.soft_delete_by_account_and_region(
        db,
        account_id=current_user.account_id,
        region_id=region_id
    )
    
    if not favorite:
        raise NotFoundException("관심 지역")
    
    return {
        "success": True,
        "data": {
            "message": "관심 지역이 삭제되었습니다.",
            "region_id": region_id
        }
    }
