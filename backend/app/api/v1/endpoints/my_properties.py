"""
내 집 API 엔드포인트

사용자가 소유한 부동산을 관리하는 API입니다.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_current_user
from app.models.account import Account
from app.models.apartment import Apartment
from app.schemas.my_property import (
    MyPropertyCreate,
    MyPropertyUpdate,
    MyPropertyResponse,
    MyPropertyListResponse,
    RecentTransactionsResponse,
    RecentTransactionItem
)
from app.crud.my_property import my_property as my_property_crud
from app.crud.apartment import apartment as apartment_crud
from app.crud.state import state as state_crud
from app.crud.sale import sale as sale_crud
from app.crud.rent import rent as rent_crud
from app.core.exceptions import (
    NotFoundException,
    LimitExceededException
)
from app.utils.cache import (
    get_from_cache,
    set_to_cache,
    delete_cache_pattern,
    get_my_properties_cache_key,
    get_my_properties_count_cache_key,
    get_my_property_detail_cache_key,
    get_my_property_pattern_key
)

router = APIRouter()

# 내 집 최대 개수 제한
MY_PROPERTY_LIMIT = 100


@router.get(
    "",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🏠 My Properties (내 집)"],
    summary="내 집 목록 조회",
    description="""
    현재 로그인한 사용자가 등록한 내 집 목록을 조회합니다.
    
    ### 응답 정보
    - 각 내 집에는 내 집 ID, 아파트 정보, 별칭, 전용면적, 현재 시세가 포함됩니다.
    - 최대 100개까지 저장 가능합니다.
    - 최신순으로 정렬됩니다.
    """,
    responses={
        200: {
            "description": "내 집 목록 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "properties": [
                                {
                                    "property_id": 1,
                                    "account_id": 1,
                                    "apt_id": 12345,
                                    "nickname": "우리집",
                                    "exclusive_area": 84.5,
                                    "current_market_price": 85000,
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
async def get_my_properties(
    skip: int = Query(0, ge=0, description="건너뛸 레코드 수"),
    limit: int = Query(100, ge=1, le=100, description="가져올 레코드 수 (최대 100)"),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    내 집 목록 조회
    
    현재 로그인한 사용자의 내 집 목록을 반환합니다.
    Redis 캐싱을 사용하여 성능을 최적화합니다.
    """
    account_id = current_user.account_id
    
    # 캐시 키 생성
    cache_key = get_my_properties_cache_key(account_id, skip, limit)
    count_cache_key = get_my_properties_count_cache_key(account_id)
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    cached_count = await get_from_cache(count_cache_key)
    
    if cached_data is not None and cached_count is not None:
        # 캐시 히트: 캐시된 데이터 반환
        return {
            "success": True,
            "data": {
                "properties": cached_data.get("properties", []),
                "total": cached_count,
                "limit": MY_PROPERTY_LIMIT
            }
        }
    
    # 2. 캐시 미스: 데이터베이스에서 조회
    properties = await my_property_crud.get_by_account(
        db,
        account_id=account_id,
        skip=skip,
        limit=limit
    )
    
    # 총 개수 조회
    total = await my_property_crud.count_by_account(
        db,
        account_id=account_id
    )
    
    # 응답 데이터 구성 (Apartment 관계 정보 포함)
    properties_data = []
    for prop in properties:
        apartment = prop.apartment  # Apartment 관계 로드됨
        region = apartment.region if apartment else None  # State 관계
        apart_detail = apartment.apart_detail if apartment else None  # ApartDetail 관계
        
        properties_data.append({
            "property_id": prop.property_id,
            "account_id": prop.account_id,
            "apt_id": prop.apt_id,
            "nickname": prop.nickname,
            "exclusive_area": float(prop.exclusive_area) if prop.exclusive_area else None,
            "current_market_price": prop.current_market_price,
            "risk_checked_at": prop.risk_checked_at.isoformat() if prop.risk_checked_at else None,
            "memo": prop.memo,
            "created_at": prop.created_at.isoformat() if prop.created_at else None,
            "updated_at": prop.updated_at.isoformat() if prop.updated_at else None,
            "is_deleted": prop.is_deleted,
            "apt_name": apartment.apt_name if apartment else None,
            "kapt_code": apartment.kapt_code if apartment else None,
            "region_name": region.region_name if region else None,
            "city_name": region.city_name if region else None,
            # 아파트 상세 정보
            "builder_name": apart_detail.builder_name if apart_detail else None,
            "code_heat_nm": apart_detail.code_heat_nm if apart_detail else None,
            "educationFacility": apart_detail.educationFacility if apart_detail else None,
            "subway_line": apart_detail.subway_line if apart_detail else None,
            "subway_station": apart_detail.subway_station if apart_detail else None,
            "subway_time": apart_detail.subway_time if apart_detail else None,
            "total_parking_cnt": apart_detail.total_parking_cnt if apart_detail else None,
        })
    
    response_data = {
        "properties": properties_data,
        "total": total,
        "limit": MY_PROPERTY_LIMIT
    }
    
    # 3. 캐시에 저장 (TTL: 1시간)
    await set_to_cache(cache_key, {"properties": properties_data}, ttl=3600)
    await set_to_cache(count_cache_key, total, ttl=3600)
    
    return {
        "success": True,
        "data": response_data
    }


@router.post(
    "",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    tags=["🏠 My Properties (내 집)"],
    summary="내 집 등록",
    description="""
    새로운 내 집을 등록합니다.
    
    ### 제한사항
    - 최대 100개까지 저장 가능합니다.
    - 아파트 ID는 유효한 아파트여야 합니다.
    
    ### 요청 정보
    - `apt_id`: 아파트 ID (필수)
    - `nickname`: 별칭 (필수, 예: 우리집, 투자용)
    - `exclusive_area`: 전용면적 (㎡, 필수)
    - `current_market_price`: 현재 시세 (만원, 선택)
    - `memo`: 메모 (선택)
    """,
    responses={
        201: {
            "description": "내 집 등록 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "property_id": 1,
                            "account_id": 1,
                            "apt_id": 12345,
                            "nickname": "우리집",
                            "exclusive_area": 84.5,
                            "current_market_price": 85000,
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
        401: {
            "description": "인증 필요"
        }
    }
)
async def create_my_property(
    property_in: MyPropertyCreate = Body(
        ...,
        description="등록할 내 집 정보",
        example={
            "apt_id": 12345,
            "nickname": "우리집",
            "exclusive_area": 84.5,
            "current_market_price": 85000,
            "memo": "2024년 구매"
        }
    ),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    내 집 등록
    
    새로운 내 집을 등록합니다. 최대 개수를 초과하면 에러를 반환합니다.
    """
    # 1. 아파트 존재 확인
    apartment = await apartment_crud.get(db, id=property_in.apt_id)
    if not apartment or apartment.is_deleted:
        raise NotFoundException("아파트")
    
    # 2. 개수 제한 확인
    current_count = await my_property_crud.count_by_account(
        db,
        account_id=current_user.account_id
    )
    if current_count >= MY_PROPERTY_LIMIT:
        raise LimitExceededException("내 집", MY_PROPERTY_LIMIT)
    
    # 3. 내 집 생성
    property_obj = await my_property_crud.create(
        db,
        obj_in=property_in,
        account_id=current_user.account_id
    )
    
    # 4. 캐시 무효화 (해당 계정의 모든 내 집 캐시 삭제)
    cache_pattern = get_my_property_pattern_key(current_user.account_id)
    await delete_cache_pattern(cache_pattern)
    
    # State 관계 정보 포함 (region_id로 직접 조회하여 lazy loading 방지)
    region = await state_crud.get(db, id=apartment.region_id) if apartment else None
    
    return {
        "success": True,
        "data": {
            "property_id": property_obj.property_id,
            "account_id": property_obj.account_id,
            "apt_id": property_obj.apt_id,
            "nickname": property_obj.nickname,
            "exclusive_area": float(property_obj.exclusive_area) if property_obj.exclusive_area else None,
            "current_market_price": property_obj.current_market_price,
            "risk_checked_at": property_obj.risk_checked_at.isoformat() if property_obj.risk_checked_at else None,
            "memo": property_obj.memo,
            "created_at": property_obj.created_at.isoformat() if property_obj.created_at else None,
            "apt_name": apartment.apt_name if apartment else None,
            "kapt_code": apartment.kapt_code if apartment else None,
            "region_name": region.region_name if region else None,
            "city_name": region.city_name if region else None,
        }
    }


@router.get(
    "/{property_id}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🏠 My Properties (내 집)"],
    summary="내 집 상세 조회",
    description="""
    특정 내 집의 상세 정보를 조회합니다.
    
    ### 요청 정보
    - `property_id`: 내 집 ID (path parameter)
    
    ### 응답 정보
    - 내 집의 모든 정보와 아파트 정보가 포함됩니다.
    """,
    responses={
        200: {
            "description": "내 집 상세 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "property_id": 1,
                            "account_id": 1,
                            "apt_id": 12345,
                            "nickname": "우리집",
                            "exclusive_area": 84.5,
                            "current_market_price": 85000,
                            "risk_checked_at": None,
                            "memo": "2024년 구매",
                            "apt_name": "래미안 강남파크",
                            "kapt_code": "A1234567890",
                            "region_name": "강남구",
                            "city_name": "서울특별시",
                            "builder_name": "삼성물산",
                            "code_heat_nm": "지역난방",
                            "educationFacility": "초등학교(강남초등학교) 중학교(강남중학교)",
                            "subway_line": "2호선",
                            "subway_station": "강남역",
                            "subway_time": "5~10분이내",
                            "total_parking_cnt": 500,
                            "created_at": "2026-01-10T15:30:00Z",
                            "updated_at": "2026-01-10T15:30:00Z",
                            "is_deleted": False
                        }
                    }
                }
            }
        },
        404: {
            "description": "내 집을 찾을 수 없음"
        },
        401: {
            "description": "인증 필요"
        }
    }
)
async def get_my_property(
    property_id: int,
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    내 집 상세 조회
    
    지정한 내 집 ID에 해당하는 내 집의 상세 정보를 반환합니다.
    Redis 캐싱을 사용하여 성능을 최적화합니다.
    """
    account_id = current_user.account_id
    
    # 캐시 키 생성
    cache_key = get_my_property_detail_cache_key(account_id, property_id)
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        # 캐시 히트: 캐시된 데이터 반환
        return {
            "success": True,
            "data": cached_data
        }
    
    # 2. 캐시 미스: 데이터베이스에서 조회
    property_obj = await my_property_crud.get_by_account_and_id(
        db,
        account_id=account_id,
        property_id=property_id
    )
    
    if not property_obj:
        raise NotFoundException("내 집")
    
    apartment = property_obj.apartment  # Apartment 관계 로드됨
    region = apartment.region if apartment else None  # State 관계
    apart_detail = apartment.apart_detail if apartment else None  # ApartDetail 관계
    
    property_data = {
        "property_id": property_obj.property_id,
        "account_id": property_obj.account_id,
        "apt_id": property_obj.apt_id,
        "nickname": property_obj.nickname,
        "exclusive_area": float(property_obj.exclusive_area) if property_obj.exclusive_area else None,
        "current_market_price": property_obj.current_market_price,
        "risk_checked_at": property_obj.risk_checked_at.isoformat() if property_obj.risk_checked_at else None,
        "memo": property_obj.memo,
        "created_at": property_obj.created_at.isoformat() if property_obj.created_at else None,
        "updated_at": property_obj.updated_at.isoformat() if property_obj.updated_at else None,
        "is_deleted": property_obj.is_deleted,
        "apt_name": apartment.apt_name if apartment else None,
        "kapt_code": apartment.kapt_code if apartment else None,
        "region_name": region.region_name if region else None,
        "city_name": region.city_name if region else None,
        # 아파트 상세 정보
        "builder_name": apart_detail.builder_name if apart_detail else None,
        "code_heat_nm": apart_detail.code_heat_nm if apart_detail else None,
        "educationFacility": apart_detail.educationFacility if apart_detail else None,
        "subway_line": apart_detail.subway_line if apart_detail else None,
        "subway_station": apart_detail.subway_station if apart_detail else None,
        "subway_time": apart_detail.subway_time if apart_detail else None,
        "total_parking_cnt": apart_detail.total_parking_cnt if apart_detail else None,
    }
    
    # 3. 캐시에 저장 (TTL: 1시간)
    await set_to_cache(cache_key, property_data, ttl=3600)
    
    return {
        "success": True,
        "data": property_data
    }


@router.delete(
    "/{property_id}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🏠 My Properties (내 집)"],
    summary="내 집 삭제",
    description="""
    내 집을 삭제합니다.
    
    ### 삭제 방식
    - 소프트 삭제를 사용합니다 (실제 데이터는 삭제되지 않음).
    - `is_deleted` 플래그를 `True`로 설정하여 삭제 처리합니다.
    - 이미 삭제된 내 집을 다시 삭제하려고 하면 404 에러를 반환합니다.
    
    ### 요청 정보
    - `property_id`: 삭제할 내 집 ID (path parameter)
    """,
    responses={
        200: {
            "description": "내 집 삭제 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "message": "내 집이 삭제되었습니다.",
                            "property_id": 1
                        }
                    }
                }
            }
        },
        404: {
            "description": "내 집을 찾을 수 없음 (이미 삭제되었거나 존재하지 않음)",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {
                            "code": "MY_PROPERTY_NOT_FOUND",
                            "message": "해당 내 집을(를) 찾을 수 없습니다."
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
async def delete_my_property(
    property_id: int,
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    내 집 삭제
    
    지정한 내 집 ID에 해당하는 내 집을 소프트 삭제합니다.
    이미 삭제된 내 집이거나 존재하지 않는 내 집이면 404 에러를 반환합니다.
    """
    # 내 집 조회 및 삭제
    property_obj = await my_property_crud.soft_delete(
        db,
        property_id=property_id,
        account_id=current_user.account_id
    )
    
    if not property_obj:
        raise NotFoundException("내 집")
    
    # 캐시 무효화 (해당 계정의 모든 내 집 캐시 삭제)
    cache_pattern = get_my_property_pattern_key(current_user.account_id)
    await delete_cache_pattern(cache_pattern)
    
    return {
        "success": True,
        "data": {
            "message": "내 집이 삭제되었습니다.",
            "property_id": property_id
        }
    }


@router.get(
    "/{property_id}/recent-transactions",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🏠 My Properties (내 집)"],
    summary="동일 단지 최근 거래 조회",
    description="""
    내 집과 동일한 아파트 단지의 최근 거래 내역을 조회합니다.
    
    ### 조회 범위
    - 매매 거래 (Sale): 취소되지 않은 거래만 조회
    - 전월세 거래 (Rent): 전세 및 월세 거래 조회
    
    ### 파라미터
    - `months`: 조회 기간 (기본값: 6개월, 최대: 36개월)
    - `limit`: 최대 조회 건수 (기본값: 50, 최대: 100)
    
    ### 응답 정보
    - 매매, 전세, 월세 거래를 통합하여 최신순으로 정렬
    - 각 거래 유형별 건수 통계 포함
    """,
    responses={
        200: {
            "description": "최근 거래 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "property_id": 1,
                            "apt_id": 12345,
                            "apt_name": "래미안 강남파크",
                            "months": 6,
                            "total_count": 15,
                            "sale_count": 5,
                            "rent_count": 10,
                            "transactions": [
                                {
                                    "trans_id": 1001,
                                    "trans_type": "매매",
                                    "contract_date": "2026-01-10",
                                    "exclusive_area": 84.5,
                                    "floor": 12,
                                    "trans_price": 95000,
                                    "deposit_price": None,
                                    "monthly_rent": None,
                                    "building_num": "101"
                                }
                            ]
                        }
                    }
                }
            }
        },
        404: {
            "description": "내 집을 찾을 수 없음"
        },
        401: {
            "description": "인증 필요"
        }
    }
)
async def get_recent_transactions(
    property_id: int,
    months: int = Query(6, ge=1, le=36, description="조회 기간 (개월, 기본값: 6, 최대: 36)"),
    limit: int = Query(50, ge=1, le=100, description="최대 조회 건수 (기본값: 50, 최대: 100)"),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    동일 단지 최근 거래 조회
    
    내 집과 동일한 아파트 단지의 최근 매매/전월세 거래 내역을 조회합니다.
    거래 유형(매매/전세/월세)을 구분하여 최신순으로 정렬하여 반환합니다.
    """
    # 1. 내 집 조회 및 권한 확인
    property_obj = await my_property_crud.get_by_account_and_id(
        db,
        account_id=current_user.account_id,
        property_id=property_id
    )
    
    if not property_obj:
        raise NotFoundException("내 집")
    
    apt_id = property_obj.apt_id
    apartment = property_obj.apartment
    
    # 2. 매매 거래 조회
    sales = await sale_crud.get_recent_by_apt_id(
        db,
        apt_id=apt_id,
        months=months,
        limit=limit
    )
    
    # 3. 전월세 거래 조회
    rents = await rent_crud.get_recent_by_apt_id(
        db,
        apt_id=apt_id,
        months=months,
        limit=limit
    )
    
    # 4. 거래 내역 통합 및 변환
    transactions = []
    
    # 매매 거래 변환
    for sale in sales:
        transactions.append({
            "trans_id": sale.trans_id,
            "trans_type": "매매",
            "contract_date": sale.contract_date.isoformat() if sale.contract_date else None,
            "exclusive_area": float(sale.exclusive_area) if sale.exclusive_area else 0,
            "floor": sale.floor,
            "trans_price": sale.trans_price,
            "deposit_price": None,
            "monthly_rent": None,
            "building_num": sale.building_num
        })
    
    # 전월세 거래 변환
    for rent_item in rents:
        # 월세가 0이면 전세, 아니면 월세
        is_jeonse = (rent_item.monthly_rent is None or rent_item.monthly_rent == 0)
        trans_type = "전세" if is_jeonse else "월세"
        
        transactions.append({
            "trans_id": rent_item.trans_id,
            "trans_type": trans_type,
            "contract_date": rent_item.deal_date.isoformat() if rent_item.deal_date else None,
            "exclusive_area": float(rent_item.exclusive_area) if rent_item.exclusive_area else 0,
            "floor": rent_item.floor,
            "trans_price": None,
            "deposit_price": rent_item.deposit_price,
            "monthly_rent": rent_item.monthly_rent,
            "building_num": None
        })
    
    # 5. 날짜순 정렬 (최신순)
    transactions.sort(
        key=lambda x: x["contract_date"] if x["contract_date"] else "",
        reverse=True
    )
    
    # limit 적용
    transactions = transactions[:limit]
    
    return {
        "success": True,
        "data": {
            "property_id": property_id,
            "apt_id": apt_id,
            "apt_name": apartment.apt_name if apartment else None,
            "months": months,
            "total_count": len(transactions),
            "sale_count": len(sales),
            "rent_count": len(rents),
            "transactions": transactions
        }
    }

