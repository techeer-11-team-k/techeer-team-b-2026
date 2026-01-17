"""
관심 매물/지역 API 엔드포인트

관심 아파트와 관심 지역을 관리하는 API입니다.
"""
import logging
import asyncio
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc

logger = logging.getLogger(__name__)

from app.api.v1.deps import get_db, get_current_user
from app.models.account import Account
from app.models.state import State
from app.models.apartment import Apartment
from app.models.sale import Sale
from app.models.rent import Rent
from app.schemas.favorite import (
    FavoriteLocationCreate,
    FavoriteLocationResponse,
    FavoriteLocationListResponse,
    FavoriteApartmentCreate,
    FavoriteApartmentUpdate,
    FavoriteApartmentResponse
)
from app.crud.favorite import (
    favorite_location as favorite_location_crud,
    favorite_apartment as favorite_apartment_crud
)
from app.crud.state import state as state_crud
from app.crud.apartment import apartment as apartment_crud
from app.core.exceptions import (
    NotFoundException,
    AlreadyExistsException,
    LimitExceededException
)
from app.utils.cache import (
    get_from_cache,
    set_to_cache,
    delete_cache_pattern,
    get_favorite_locations_cache_key,
    get_favorite_locations_count_cache_key,
    get_favorite_location_pattern_key,
    get_favorite_apartments_cache_key,
    get_favorite_apartments_count_cache_key,
    get_favorite_apartment_pattern_key
)

router = APIRouter()

# 관심 지역 최대 개수 제한
FAVORITE_LOCATION_LIMIT = 50

# 관심 아파트 최대 개수 제한
FAVORITE_APARTMENT_LIMIT = 100


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
    skip: int = Query(0, ge=0, description="건너뛸 레코드 수 (선택적)"),
    limit: Optional[int] = Query(None, ge=1, le=50, description="가져올 레코드 수 (선택적, 기본값: 전체)"),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    관심 지역 목록 조회
    
    현재 로그인한 사용자의 관심 지역 목록을 반환합니다.
    Redis 캐싱을 사용하여 성능을 최적화합니다.
    """
    account_id = current_user.account_id
    
    # limit이 None이면 전체 조회 (최대 50개 제한)
    effective_limit = limit if limit is not None else FAVORITE_LOCATION_LIMIT
    
    # 캐시 키 생성
    cache_key = get_favorite_locations_cache_key(account_id, skip, effective_limit)
    count_cache_key = get_favorite_locations_count_cache_key(account_id)
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    cached_count = await get_from_cache(count_cache_key)
    
    if cached_data is not None and cached_count is not None:
        # 캐시 히트: 캐시된 데이터 반환
        return {
            "success": True,
            "data": {
                "favorites": cached_data.get("favorites", []),
                "total": cached_count,
                "limit": FAVORITE_LOCATION_LIMIT
            }
        }
    
    # 2. 캐시 미스: 데이터베이스에서 조회
    favorites = await favorite_location_crud.get_by_account(
        db,
        account_id=account_id,
        skip=skip,
        limit=effective_limit
    )
    
    # 총 개수 조회
    total = await favorite_location_crud.count_by_account(
        db,
        account_id=account_id
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
    
    response_data = {
        "favorites": favorites_data,
        "total": total,
        "limit": FAVORITE_LOCATION_LIMIT
    }
    
    # 3. 캐시에 저장 (TTL: 1시간)
    await set_to_cache(cache_key, {"favorites": favorites_data}, ttl=3600)
    await set_to_cache(count_cache_key, total, ttl=3600)
    
    return {
        "success": True,
        "data": response_data
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
        examples=[{"region_id": 1}]
    ),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    관심 지역 추가
    
    새로운 관심 지역을 추가합니다. 이미 추가된 지역이거나 최대 개수를 초과하면 에러를 반환합니다.
    """
    # 1. 지역 존재 확인
    try:
        region = await state_crud.get(db, id=favorite_in.region_id)
        if not region or region.is_deleted:
            logger.warning(f"지역을 찾을 수 없음: region_id={favorite_in.region_id}")
            raise NotFoundException("지역")
    except NotFoundException:
        raise
    except Exception as e:
        logger.error(f"지역 조회 실패: region_id={favorite_in.region_id}, error={str(e)}", exc_info=True)
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
    
    # 5. 캐시 무효화 (해당 계정의 모든 관심 지역 캐시 삭제)
    cache_pattern = get_favorite_location_pattern_key(current_user.account_id)
    await delete_cache_pattern(cache_pattern)
    
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
    
    # 캐시 무효화 (해당 계정의 모든 관심 지역 캐시 삭제)
    cache_pattern = get_favorite_location_pattern_key(current_user.account_id)
    await delete_cache_pattern(cache_pattern)
    
    return {
        "success": True,
        "data": {
            "message": "관심 지역이 삭제되었습니다.",
            "region_id": region_id
        }
    }


# ============ 관심 아파트 API ============

@router.get(
    "/apartments",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["⭐ Favorites (즐겨찾기)"],
    summary="관심 아파트 목록 조회",
    description=""" 
    현재 로그인한 사용자가 저장한 관심 아파트 목록을 조회합니다.
    
    ### 응답 정보
    - 각 관심 아파트에는 아파트 ID, 아파트명, 지역 정보가 포함됩니다.
    - 최대 100개까지 저장 가능합니다.
    - 최신순으로 정렬됩니다.
    """,
    responses={
        200: {
            "description": "관심 아파트 목록 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "favorites": [
                                {
                                    "favorite_id": 1,
                                    "account_id": 1,
                                    "apt_id": 12345,
                                    "nickname": "투자용",
                                    "memo": "투자 검토 중",
                                    "apt_name": "래미안 강남파크",
                                    "kapt_code": "A1234567890",
                                    "region_name": "강남구",
                                    "city_name": "서울특별시",
                                    "created_at": "2026-01-10T15:30:00Z",
                                    "updated_at": "2026-01-10T15:30:00Z",
                                    "is_deleted": False
                                }
                            ],
                            "total": 1,
                            "limit": 100
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
async def get_favorite_apartments(
    skip: int = Query(0, ge=0, description="건너뛸 레코드 수 (선택적)"),
    limit: Optional[int] = Query(None, ge=1, le=100, description="가져올 레코드 수 (선택적, 기본값: 전체)"),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    관심 아파트 목록 조회
    
    현재 로그인한 사용자의 관심 아파트 목록을 반환합니다.
    Redis 캐싱을 사용하여 성능을 최적화합니다.
    """
    account_id = current_user.account_id
    logger.info(f"🔍 관심 아파트 조회 시작 - account_id: {account_id}, skip: {skip}, limit: {limit}")
    
    # limit이 None이면 전체 조회 (최대 100개 제한)
    effective_limit = limit if limit is not None else FAVORITE_APARTMENT_LIMIT
    
    # 캐시 키 생성
    cache_key = get_favorite_apartments_cache_key(account_id, skip, effective_limit)
    count_cache_key = get_favorite_apartments_count_cache_key(account_id)
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    cached_count = await get_from_cache(count_cache_key)
    
    # 캐시 히트이지만 빈 배열인 경우 DB 재확인
    should_verify_db = False
    if cached_data is not None and cached_count is not None:
        cached_favorites = cached_data.get("favorites", [])
        if cached_count == 0 or len(cached_favorites) == 0:
            # 빈 배열이 캐시되어 있음 → DB 재확인 필요
            logger.info(f"⚠️ 캐시에 빈 배열 저장됨 - DB 재확인 시작 - account_id: {account_id}")
            should_verify_db = True
        else:
            # 캐시 히트: 캐시된 데이터 반환
            logger.info(f"✅ 캐시 히트 - account_id: {account_id}, total: {cached_count}")
            return {
                "success": True,
                "data": {
                    "favorites": cached_favorites,
                    "total": cached_count,
                    "limit": FAVORITE_APARTMENT_LIMIT
                }
            }
    
    # 2. 캐시 미스 또는 빈 배열 캐시 → 데이터베이스에서 조회
    logger.info(f"{'🔄 DB 재확인' if should_verify_db else '❌ 캐시 미스'} - DB에서 조회 시작 - account_id: {account_id}")
    favorites = await favorite_apartment_crud.get_by_account(
        db,
        account_id=account_id,
        skip=skip,
        limit=effective_limit
    )
    logger.info(f"📊 DB 조회 결과 - favorites 개수: {len(favorites)}")
    
    # 총 개수 조회
    total = await favorite_apartment_crud.count_by_account(
        db,
        account_id=account_id
    )
    logger.info(f"📊 DB 총 개수 - total: {total}")
    
    # 응답 데이터 구성 (Apartment 관계 정보 포함)
    favorites_data = []
    for fav in favorites:
        apartment = fav.apartment  # Apartment 관계 로드됨
        region = apartment.region if apartment else None  # State 관계
        
        logger.info(f"🔍 관심 아파트 데이터 처리 - favorite_id: {fav.favorite_id}, apt_id: {fav.apt_id}, account_id: {fav.account_id}, is_deleted: {fav.is_deleted}, apartment: {apartment is not None}")
        
        favorites_data.append({
            "favorite_id": fav.favorite_id,
            "account_id": fav.account_id,
            "apt_id": fav.apt_id,
            "nickname": fav.nickname,
            "memo": fav.memo,
            "apt_name": apartment.apt_name if apartment else None,
            "kapt_code": apartment.kapt_code if apartment else None,
            "region_name": region.region_name if region else None,
            "city_name": region.city_name if region else None,
            "created_at": fav.created_at.isoformat() if fav.created_at else None,
            "updated_at": fav.updated_at.isoformat() if fav.updated_at else None,
            "is_deleted": fav.is_deleted
        })
    
    response_data = {
        "favorites": favorites_data,
        "total": total,
        "limit": FAVORITE_APARTMENT_LIMIT
    }
    
    logger.info(f"✅ 관심 아파트 조회 완료 - account_id: {account_id}, favorites_data 개수: {len(favorites_data)}, total: {total}")
    
    # 3. 캐시에 저장 (TTL: 1시간)
    # 빈 배열 캐시 재확인 후 데이터가 있으면 캐시 갱신
    if should_verify_db and total > 0:
        logger.info(f"🔄 빈 배열 캐시 갱신 - account_id: {account_id}, new_total: {total}")
    
    await set_to_cache(cache_key, {"favorites": favorites_data}, ttl=3600)
    await set_to_cache(count_cache_key, total, ttl=3600)
    
    return {
        "success": True,
        "data": response_data
    }


@router.post(
    "/apartments",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    tags=["⭐ Favorites (즐겨찾기)"],
    summary="관심 아파트 추가",
    description="""
    새로운 관심 아파트를 추가합니다.
    
    ### 제한사항
    - 최대 100개까지 저장 가능합니다.
    - 이미 추가된 아파트는 다시 추가할 수 없습니다.
    
    ### 요청 정보
    - `apt_id`: 추가할 아파트의 ID (apartments 테이블의 apt_id)
    - `nickname`: 별칭 (선택, 예: 우리집, 투자용)
    - `memo`: 메모 (선택)
    """,
    responses={
        201: {
            "description": "관심 아파트 추가 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "favorite_id": 1,
                            "account_id": 1,
                            "apt_id": 12345,
                            "nickname": "투자용",
                            "memo": "투자 검토 중",
                            "apt_name": "래미안 강남파크",
                            "kapt_code": "A1234567890",
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
            "description": "아파트를 찾을 수 없음"
        },
        409: {
            "description": "이미 추가된 아파트"
        },
        401: {
            "description": "인증 필요"
        }
    }
)
async def create_favorite_apartment(
    favorite_in: FavoriteApartmentCreate = Body(
        ...,
        description="추가할 관심 아파트 정보",
        example={
            "apt_id": 12345,
            "nickname": "투자용",
            "memo": "투자 검토 중"
        }
    ),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    관심 아파트 추가
    
    새로운 관심 아파트를 추가합니다. 이미 추가된 아파트이거나 최대 개수를 초과하면 에러를 반환합니다.
    """
    account_id = current_user.account_id
    logger.info(f"➕ 관심 아파트 추가 시도 - account_id: {account_id}, apt_id: {favorite_in.apt_id}")
    
    # 1. 아파트 존재 확인
    apartment = await apartment_crud.get(db, id=favorite_in.apt_id)
    if not apartment or apartment.is_deleted:
        logger.warning(f"⚠️ 아파트를 찾을 수 없음 - apt_id: {favorite_in.apt_id}")
        raise NotFoundException("아파트")
    
    # 2. 중복 확인
    existing = await favorite_apartment_crud.get_by_account_and_apt(
        db,
        account_id=account_id,
        apt_id=favorite_in.apt_id
    )
    if existing:
        logger.warning(f"⚠️ 이미 추가된 관심 아파트 - account_id: {account_id}, apt_id: {favorite_in.apt_id}")
        raise AlreadyExistsException("관심 아파트")
    
    # 3. 개수 제한 확인
    current_count = await favorite_apartment_crud.count_by_account(
        db,
        account_id=account_id
    )
    logger.info(f"📊 현재 관심 아파트 개수 - account_id: {account_id}, count: {current_count}")
    if current_count >= FAVORITE_APARTMENT_LIMIT:
        raise LimitExceededException("관심 아파트", FAVORITE_APARTMENT_LIMIT)
    
    # 4. 관심 아파트 생성
    favorite = await favorite_apartment_crud.create(
        db,
        obj_in=favorite_in,
        account_id=account_id
    )
    logger.info(f"✅ 관심 아파트 생성 완료 - favorite_id: {favorite.favorite_id}, account_id: {account_id}, apt_id: {favorite_in.apt_id}")
    
    # 5. 캐시 무효화 (해당 계정의 모든 관심 아파트 캐시 삭제)
    cache_pattern = get_favorite_apartment_pattern_key(account_id)
    await delete_cache_pattern(cache_pattern)
    logger.info(f"🗑️ 캐시 무효화 완료 - account_id: {account_id}")
    
    # State 관계 정보 포함 (region_id로 직접 조회하여 lazy loading 방지)
    region = await state_crud.get(db, id=apartment.region_id) if apartment else None
    
    return {
        "success": True,
        "data": {
            "favorite_id": favorite.favorite_id,
            "account_id": favorite.account_id,
            "apt_id": favorite.apt_id,
            "nickname": favorite.nickname,
            "memo": favorite.memo,
            "apt_name": apartment.apt_name if apartment else None,
            "kapt_code": apartment.kapt_code if apartment else None,
            "region_name": region.region_name if region else None,
            "city_name": region.city_name if region else None,
            "created_at": favorite.created_at.isoformat() if favorite.created_at else None
        }
    }


@router.put(
    "/apartments/{favorite_id}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["⭐ Favorites (즐겨찾기)"],
    summary="관심 아파트 수정",
    description="""
    관심 아파트의 메모와 별명을 수정합니다.
    
    ### 수정 가능한 정보
    - `nickname`: 별칭 (예: 우리집, 투자용)
    - `memo`: 메모
    
    ### 요청 정보
    - `favorite_id`: 수정할 즐겨찾기 ID (path parameter)
    - `nickname`: 별칭 (선택)
    - `memo`: 메모 (선택)
    """,
    responses={
        200: {
            "description": "관심 아파트 수정 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "favorite_id": 1,
                            "account_id": 1,
                            "apt_id": 12345,
                            "nickname": "투자용",
                            "memo": "시세 상승 중",
                            "apt_name": "래미안 강남파크",
                            "kapt_code": "A1234567890",
                            "region_name": "강남구",
                            "city_name": "서울특별시",
                            "updated_at": "2026-01-11T15:00:00Z"
                        }
                    }
                }
            }
        },
        404: {
            "description": "관심 아파트를 찾을 수 없음"
        },
        401: {
            "description": "인증 필요"
        }
    }
)
async def update_favorite_apartment(
    favorite_id: int,
    favorite_update: FavoriteApartmentUpdate = Body(
        ...,
        description="수정할 관심 아파트 정보",
        example={
            "nickname": "투자용",
            "memo": "시세 상승 중"
        }
    ),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    관심 아파트 수정
    
    지정한 즐겨찾기 ID에 해당하는 관심 아파트의 메모와 별명을 수정합니다.
    존재하지 않는 즐겨찾기이거나 다른 사용자의 즐겨찾기이면 404 에러를 반환합니다.
    """
    # 1. 관심 아파트 조회
    favorite = await favorite_apartment_crud.get_by_account_and_favorite_id(
        db,
        account_id=current_user.account_id,
        favorite_id=favorite_id
    )
    
    if not favorite:
        raise NotFoundException("관심 아파트")
    
    # 2. 관심 아파트 수정
    updated_favorite = await favorite_apartment_crud.update(
        db,
        db_obj=favorite,
        obj_in=favorite_update
    )
    
    # 3. 캐시 무효화 (해당 계정의 모든 관심 아파트 캐시 삭제)
    cache_pattern = get_favorite_apartment_pattern_key(current_user.account_id)
    await delete_cache_pattern(cache_pattern)
    
    # 4. 아파트 및 지역 정보 조회
    apartment = updated_favorite.apartment  # Apartment 관계 로드됨
    region = apartment.region if apartment else None  # State 관계
    
    return {
        "success": True,
        "data": {
            "favorite_id": updated_favorite.favorite_id,
            "account_id": updated_favorite.account_id,
            "apt_id": updated_favorite.apt_id,
            "nickname": updated_favorite.nickname,
            "memo": updated_favorite.memo,
            "apt_name": apartment.apt_name if apartment else None,
            "kapt_code": apartment.kapt_code if apartment else None,
            "region_name": region.region_name if region else None,
            "city_name": region.city_name if region else None,
            "updated_at": updated_favorite.updated_at.isoformat() if updated_favorite.updated_at else None
        }
    }


@router.delete(
    "/apartments/{apt_id}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["⭐ Favorites (즐겨찾기)"],
    summary="관심 아파트 삭제",
    description="""
    관심 아파트를 삭제합니다.
    
    ### 삭제 방식
    - 소프트 삭제를 사용합니다 (실제 데이터는 삭제되지 않음).
    - `is_deleted` 플래그를 `True`로 설정하여 삭제 처리합니다.
    - 이미 삭제된 아파트를 다시 삭제하려고 하면 404 에러를 반환합니다.
    
    ### 요청 정보
    - `apt_id`: 삭제할 아파트의 ID (path parameter)
    """,
    responses={
        200: {
            "description": "관심 아파트 삭제 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "message": "관심 아파트가 삭제되었습니다.",
                            "apt_id": 12345
                        }
                    }
                }
            }
        },
        404: {
            "description": "관심 아파트를 찾을 수 없음 (이미 삭제되었거나 존재하지 않음)",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {
                            "code": "FAVORITE_APARTMENT_NOT_FOUND",
                            "message": "해당 관심 아파트를(를) 찾을 수 없습니다."
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
async def delete_favorite_apartment(
    apt_id: int,
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    관심 아파트 삭제
    
    지정한 아파트 ID에 해당하는 관심 아파트를 소프트 삭제합니다.
    이미 삭제된 아파트이거나 존재하지 않는 아파트이면 404 에러를 반환합니다.
    """
    # 관심 아파트 조회 및 삭제
    favorite = await favorite_apartment_crud.soft_delete_by_account_and_apt(
        db,
        account_id=current_user.account_id,
        apt_id=apt_id
    )
    
    if not favorite:
        raise NotFoundException("관심 아파트")
    
    # 캐시 무효화 (해당 계정의 모든 관심 아파트 캐시 삭제)
    cache_pattern = get_favorite_apartment_pattern_key(current_user.account_id)
    await delete_cache_pattern(cache_pattern)
    
    return {
        "success": True,
        "data": {
            "message": "관심 아파트가 삭제되었습니다.",
            "apt_id": apt_id
        }
    }


@router.post(
    "/apartments/refresh-cache",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["⭐ Favorites (즐겨찾기)"],
    summary="관심 아파트 캐시 강제 갱신",
    description="""
    현재 사용자의 관심 아파트 캐시를 강제로 삭제하고 DB에서 새로 조회합니다.
    
    ### 사용 시나리오
    - 캐시에 잘못된 데이터가 저장된 경우
    - 데이터 동기화 문제가 발생한 경우
    """
)
async def refresh_favorite_apartments_cache(
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    관심 아파트 캐시 강제 갱신
    
    캐시를 삭제하고 DB에서 새로 데이터를 조회하여 캐시에 저장합니다.
    """
    account_id = current_user.account_id
    logger.info(f"🔄 캐시 강제 갱신 요청 - account_id: {account_id}")
    
    # 1. 기존 캐시 삭제
    cache_pattern = get_favorite_apartment_pattern_key(account_id)
    deleted_count = await delete_cache_pattern(cache_pattern)
    logger.info(f"🗑️ 캐시 삭제 완료 - account_id: {account_id}, deleted_count: {deleted_count}")
    
    # 2. DB에서 새로 조회
    favorites = await favorite_apartment_crud.get_by_account(
        db,
        account_id=account_id,
        skip=0,
        limit=FAVORITE_APARTMENT_LIMIT
    )
    
    total = await favorite_apartment_crud.count_by_account(
        db,
        account_id=account_id
    )
    
    logger.info(f"📊 DB 조회 결과 - account_id: {account_id}, favorites: {len(favorites)}, total: {total}")
    
    # 3. 응답 데이터 구성
    favorites_data = []
    for fav in favorites:
        apartment = fav.apartment
        region = apartment.region if apartment else None
        
        favorites_data.append({
            "favorite_id": fav.favorite_id,
            "account_id": fav.account_id,
            "apt_id": fav.apt_id,
            "nickname": fav.nickname,
            "memo": fav.memo,
            "apt_name": apartment.apt_name if apartment else None,
            "kapt_code": apartment.kapt_code if apartment else None,
            "region_name": region.region_name if region else None,
            "city_name": region.city_name if region else None,
            "created_at": fav.created_at.isoformat() if fav.created_at else None,
            "updated_at": fav.updated_at.isoformat() if fav.updated_at else None,
            "is_deleted": fav.is_deleted
        })
    
    # 4. 새 캐시 저장
    cache_key = get_favorite_apartments_cache_key(account_id, 0, FAVORITE_APARTMENT_LIMIT)
    count_cache_key = get_favorite_apartments_count_cache_key(account_id)
    await set_to_cache(cache_key, {"favorites": favorites_data}, ttl=3600)
    await set_to_cache(count_cache_key, total, ttl=3600)
    
    logger.info(f"✅ 캐시 갱신 완료 - account_id: {account_id}, favorites: {len(favorites_data)}, total: {total}")
    
    return {
        "success": True,
        "data": {
            "message": "캐시가 갱신되었습니다.",
            "favorites": favorites_data,
            "total": total,
            "limit": FAVORITE_APARTMENT_LIMIT
        }
    }


# ============ 지역별 통계 API ============

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
    "/regions/{region_id}/stats",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["⭐ Favorites (즐겨찾기)"],
    summary="지역별 통계 조회",
    description="""
    특정 시군구 지역의 통계 정보를 조회합니다.
    
    ### 제공 데이터
    - 평균 집값 (만원/평)
    - 가격 변화율 (%)
    - 최근 거래량 (건)
    - 지역 내 아파트 수 (개)
    - 최근 3개월 평균 가격
    - 이전 3개월 평균 가격
    
    ### Query Parameters
    - `transaction_type`: 거래 유형 (sale: 매매, jeonse: 전세, 기본값: sale)
    - `months`: 비교 기간 (개월, 기본값: 3)
    """,
    responses={
        200: {"description": "조회 성공"},
        404: {"description": "지역을 찾을 수 없음"}
    }
)
async def get_region_stats(
    region_id: int,
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세)"),
    months: int = Query(3, ge=1, le=12, description="비교 기간 (개월)"),
    db: AsyncSession = Depends(get_db)
):
    """
    지역별 통계 조회
    
    시군구 단위로 평균 집값, 상승률, 거래량, 아파트 수를 반환합니다.
    """
    try:
        # 지역 존재 확인
        region = await state_crud.get(db, id=region_id)
        if not region:
            raise NotFoundException("지역")
        
        logger.info(f"🔍 지역 정보 - region_id: {region.region_id}, region_name: {region.region_name}, region_code: {region.region_code}")
        
        # 지역 레벨 판단 및 하위 지역 찾기
        target_region_ids = [region.region_id]  # 기본적으로 해당 지역 ID
        
        if region.region_code and len(region.region_code) >= 10:
            # 레벨 판단
            is_city = region.region_code[-8:] == "00000000"  # 시도 레벨 (예: 서울특별시, 경기도)
            is_sigungu = region.region_code[-5:] == "00000" and not is_city  # 시군구 레벨 (예: 강남구, 파주시)
            is_dong = not is_city and not is_sigungu  # 동/면/읍 레벨
            
            if is_dong:
                # 동 단위인 경우, 상위 시군구를 찾아야 함
                # region_code의 앞 5자리로 시군구 찾기
                sigungu_code = region.region_code[:5] + "00000"
                sigungu_stmt = select(State).where(State.region_code == sigungu_code)
                sigungu_result = await db.execute(sigungu_stmt)
                sigungu = sigungu_result.scalar_one_or_none()
                if sigungu:
                    region = sigungu
                    is_sigungu = True
                    is_dong = False
                    logger.info(f"🔍 동 → 시군구로 변경 - region_id: {region.region_id}, region_name: {region.region_name}, region_code: {region.region_code}")
            
            # 시도 또는 시군구인 경우, 하위 지역의 region_id 찾기
            if is_city:
                # 시도 레벨: 앞 2자리로 검색 (예: "11" → 서울특별시 전체)
                city_prefix = region.region_code[:2]
                sub_regions_stmt = select(State.region_id).where(
                    and_(
                        State.region_code.like(f"{city_prefix}%"),
                        State.is_deleted == False
                    )
                )
                sub_regions_result = await db.execute(sub_regions_stmt)
                target_region_ids = [row.region_id for row in sub_regions_result.fetchall()]
                logger.info(f"🔍 시도 하위 지역 수 - {len(target_region_ids)}개 (region_code prefix: {city_prefix}, region_name: {region.region_name})")
            elif is_sigungu:
                # 시군구 레벨: 앞 5자리로 검색 (예: "11680" → 강남구 전체)
                sigungu_prefix = region.region_code[:5]
                sub_regions_stmt = select(State.region_id).where(
                    and_(
                        State.region_code.like(f"{sigungu_prefix}%"),
                        State.is_deleted == False
                    )
                )
                sub_regions_result = await db.execute(sub_regions_stmt)
                target_region_ids = [row.region_id for row in sub_regions_result.fetchall()]
                logger.info(f"🔍 시군구 하위 지역 수 - {len(target_region_ids)}개 (region_code prefix: {sigungu_prefix}, region_name: {region.region_name})")
        
        trans_table = get_transaction_table(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        date_field = get_date_field(transaction_type, trans_table)
        
        # 필터 조건
        if transaction_type == "sale":
            base_filter = and_(
                trans_table.is_canceled == False,
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                price_field.isnot(None),
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
                price_field.isnot(None),
                trans_table.exclusive_area.isnot(None),
                trans_table.exclusive_area > 0
            )
        
        # 날짜 범위 계산
        today = date.today()
        recent_end = today
        recent_start = today - timedelta(days=months * 30)
        previous_end = recent_start
        previous_start = previous_end - timedelta(days=months * 30)
        
        # 실제 데이터의 날짜 범위 확인 (하위 지역들 포함)
        date_range_stmt = (
            select(
                func.min(date_field).label('min_date'),
                func.max(date_field).label('max_date')
            )
            .select_from(trans_table)
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .where(
                and_(
                    Apartment.region_id.in_(target_region_ids),
                    base_filter,
                    date_field.isnot(None)
                )
            )
        )
        date_range_result = await db.execute(date_range_stmt)
        date_range = date_range_result.first()
        
        if date_range and date_range.min_date and date_range.max_date:
            logger.info(f"📅 실제 데이터 날짜 범위 - min_date: {date_range.min_date}, max_date: {date_range.max_date}")
            # 실제 데이터 범위에 맞춰 날짜 조정
            if recent_start < date_range.min_date:
                recent_start = date_range.min_date
            if recent_end > date_range.max_date:
                recent_end = date_range.max_date
            if previous_start < date_range.min_date:
                previous_start = date_range.min_date
            if previous_end > date_range.max_date:
                previous_end = date_range.max_date
            logger.info(f"📅 조정된 날짜 범위 - recent_start: {recent_start}, recent_end: {recent_end}, previous_start: {previous_start}, previous_end: {previous_end}")
        else:
            logger.warning(f"⚠️ 해당 지역에 거래 데이터가 없습니다 - region_id: {region.region_id}")
        
        # 최근 기간 통계 (하위 지역들 포함)
        recent_stmt = (
            select(
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong'),
                func.count(trans_table.trans_id).label('transaction_count')
            )
            .select_from(trans_table)
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .where(
                and_(
                    Apartment.region_id.in_(target_region_ids),
                    base_filter,
                    date_field.isnot(None),
                    date_field >= recent_start,
                    date_field <= recent_end,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
        )
        
        # 이전 기간 통계 (하위 지역들 포함)
        previous_stmt = (
            select(
                func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong')
            )
            .select_from(trans_table)
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .where(
                and_(
                    Apartment.region_id.in_(target_region_ids),
                    base_filter,
                    date_field.isnot(None),
                    date_field >= previous_start,
                    date_field < previous_end,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    trans_table.exclusive_area.isnot(None),
                    trans_table.exclusive_area > 0
                )
            )
        )
        
        # 아파트 수 조회 (하위 지역들 포함)
        apartment_count_stmt = (
            select(func.count(Apartment.apt_id))
            .where(
                and_(
                    Apartment.region_id.in_(target_region_ids),
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
                )
            )
        )
        
        # 디버깅: 해당 지역의 아파트와 거래 데이터 존재 여부 확인 (하위 지역들 포함)
        debug_apt_stmt = select(func.count(Apartment.apt_id)).where(
            and_(
                Apartment.region_id.in_(target_region_ids),
                (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
            )
        )
        debug_trans_stmt = select(func.count(trans_table.trans_id)).select_from(trans_table).join(
            Apartment, trans_table.apt_id == Apartment.apt_id
        ).where(
            and_(
                Apartment.region_id.in_(target_region_ids),
                base_filter,
                date_field.isnot(None)
            )
        )
        
        debug_apt_result, debug_trans_result = await asyncio.gather(
            db.execute(debug_apt_stmt),
            db.execute(debug_trans_stmt)
        )
        debug_apt_count = debug_apt_result.scalar() or 0
        debug_trans_count = debug_trans_result.scalar() or 0
        
        logger.info(f"🔍 지역별 통계 조회 시작 - region_id: {region.region_id}, region_name: {region.region_name}, transaction_type: {transaction_type}, months: {months}")
        logger.info(f"📅 날짜 범위 - recent_start: {recent_start}, recent_end: {recent_end}, previous_start: {previous_start}, previous_end: {previous_end}")
        logger.info(f"🔍 디버깅 - 해당 지역의 총 아파트 수: {debug_apt_count}, 총 거래 수: {debug_trans_count}")
        
        recent_result, previous_result, apartment_count_result = await asyncio.gather(
            db.execute(recent_stmt),
            db.execute(previous_stmt),
            db.execute(apartment_count_stmt)
        )
        
        recent_data = recent_result.first()
        previous_data = previous_result.first()
        apartment_count = apartment_count_result.scalar() or 0
        
        logger.info(f"📊 쿼리 결과 - recent_data: {recent_data}, previous_data: {previous_data}, apartment_count: {apartment_count}")
        
        recent_avg = float(recent_data.avg_price_per_pyeong or 0) if recent_data and recent_data.avg_price_per_pyeong else 0
        previous_avg = float(previous_data.avg_price_per_pyeong or 0) if previous_data and previous_data.avg_price_per_pyeong else 0
        transaction_count = recent_data.transaction_count or 0 if recent_data else 0
        
        # 데이터가 없을 경우, 날짜 필터 없이 전체 기간 조회 시도 (하위 지역들 포함)
        if transaction_count == 0 and apartment_count > 0:
            logger.info(f"⚠️ 최근 {months}개월 데이터가 없어 전체 기간 조회 시도")
            all_time_stmt = (
                select(
                    func.avg(price_field / trans_table.exclusive_area * 3.3).label('avg_price_per_pyeong'),
                    func.count(trans_table.trans_id).label('transaction_count')
                )
                .select_from(trans_table)
                .join(Apartment, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        Apartment.region_id.in_(target_region_ids),
                        base_filter,
                        date_field.isnot(None),
                        (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                        trans_table.exclusive_area.isnot(None),
                        trans_table.exclusive_area > 0
                    )
                )
            )
            all_time_result = await db.execute(all_time_stmt)
            all_time_data = all_time_result.first()
            if all_time_data and all_time_data.transaction_count and all_time_data.transaction_count > 0:
                recent_avg = float(all_time_data.avg_price_per_pyeong or 0) if all_time_data.avg_price_per_pyeong else 0
                transaction_count = all_time_data.transaction_count or 0
                logger.info(f"✅ 전체 기간 데이터 발견 - avg_price: {recent_avg}, transaction_count: {transaction_count}")
        
        # 상승률 계산
        change_rate = 0.0
        if previous_avg > 0 and recent_avg > 0:
            change_rate = ((recent_avg - previous_avg) / previous_avg) * 100
        
        logger.info(f"✅ 지역별 통계 조회 완료 - region_id: {region.region_id}, avg_price: {recent_avg}, transaction_count: {transaction_count}, apartment_count: {apartment_count}, change_rate: {change_rate}")
        
        return {
            "success": True,
            "data": {
                "region_id": region.region_id,
                "region_name": region.region_name,
                "city_name": region.city_name,
                "avg_price_per_pyeong": round(recent_avg, 1) if recent_avg > 0 else 0,
                "change_rate": round(change_rate, 2),
                "transaction_count": transaction_count,
                "apartment_count": apartment_count,
                "previous_avg_price": round(previous_avg, 1) if previous_avg > 0 else 0,
                "transaction_type": transaction_type,
                "period_months": months
            }
        }
        
    except NotFoundException:
        raise
    except Exception as e:
        logger.error(f"❌ 지역별 통계 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )
