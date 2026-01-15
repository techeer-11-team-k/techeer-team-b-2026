"""
AI 관련 API 엔드포인트

AI 기능을 제공하는 API입니다.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_current_user
from app.models.account import Account
from app.crud.my_property import my_property as my_property_crud
from app.crud.state import state as state_crud
from app.services.ai_service import ai_service
from datetime import datetime
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from app.models.apartment import Apartment
from app.core.exceptions import (
    NotFoundException,
    ExternalAPIException
)
from app.utils.cache import (
    get_from_cache,
    set_to_cache,
    get_my_property_compliment_cache_key,
    get_apartment_summary_cache_key
)

router = APIRouter()


@router.post(
    "/summary/my-property",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🤖 AI (인공지능)"],
    summary="내 집 칭찬글 생성",
    description="""
    AI를 사용하여 내 집에 대한 칭찬글을 생성합니다.
    
    ### 기능 설명
    - Gemini AI를 사용하여 내 집 정보를 바탕으로 따뜻하고 긍정적인 칭찬글을 생성합니다.
    - 생성된 칭찬글은 캐시되어 동일한 내집에 대한 재요청 시 빠르게 반환됩니다.
    - 칭찬글은 200자 이내로 생성됩니다.
    
    ### 요청 정보
    - `property_id`: 칭찬글을 생성할 내 집 ID (query parameter)
    
    ### 응답 정보
    - `compliment`: AI가 생성한 칭찬글
    - `generated_at`: 생성 일시
    
    ### 제한사항
    - GEMINI_API_KEY가 설정되어 있어야 합니다.
    - 내 집 정보가 충분해야 좋은 칭찬글을 생성할 수 있습니다.
    """,
    responses={
        200: {
            "description": "칭찬글 생성 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "property_id": 1,
                            "compliment": "이 집은 정말 멋진 곳이네요! 강남구의 중심부에 위치한 래미안 강남파크는 최고의 입지를 자랑합니다. 84.5㎡의 넉넉한 전용면적은 가족이 함께 생활하기에 충분한 공간을 제공합니다. 현재 시세 85,000만원은 이 지역의 가치를 잘 반영하고 있으며, 앞으로도 지속적인 가치 상승이 기대되는 곳입니다. 정말 부러운 집이에요!",
                            "generated_at": "2026-01-14T15:30:00Z"
                        }
                    }
                }
            }
        },
        404: {
            "description": "내 집을 찾을 수 없음"
        },
        503: {
            "description": "AI 서비스 사용 불가 (GEMINI_API_KEY 미설정 또는 API 오류)"
        },
        401: {
            "description": "인증 필요"
        }
    }
)
async def generate_property_compliment(
    property_id: int = Query(..., description="칭찬글을 생성할 내 집 ID", gt=0),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    내 집 칭찬글 생성
    
    AI를 사용하여 내 집에 대한 칭찬글을 생성합니다.
    생성된 칭찬글은 캐시되어 재사용됩니다.
    """
    # AI 서비스가 사용 가능한지 확인
    if ai_service is None:
        raise ExternalAPIException("AI 서비스가 사용할 수 없습니다. GEMINI_API_KEY를 설정해주세요.")
    
    # 1. 내 집 조회
    property_obj = await my_property_crud.get_by_account_and_id(
        db,
        account_id=current_user.account_id,
        property_id=property_id
    )
    
    if not property_obj:
        raise NotFoundException("내 집")
    
    # 2. 캐시에서 조회 시도
    cache_key = get_my_property_compliment_cache_key(property_id)
    cached_compliment = await get_from_cache(cache_key)
    
    if cached_compliment is not None:
        # 캐시 히트: 캐시된 칭찬글 반환
        return {
            "success": True,
            "data": {
                "property_id": property_id,
                "compliment": cached_compliment.get("compliment"),
                "generated_at": cached_compliment.get("generated_at")
            }
        }
    
    # 3. 아파트 및 지역 정보 조회
    apartment = property_obj.apartment  # Apartment 관계 로드됨
    
    # State 관계 정보 포함 (region_id로 직접 조회하여 lazy loading 방지)
    region = None
    if apartment and apartment.region_id:
        region = await state_crud.get(db, id=apartment.region_id)
    
    # 아파트 상세 정보 조회
    apart_detail = apartment.apart_detail if apartment else None
    
    # 4. AI에 전달할 데이터 구성
    property_data = {
        "nickname": property_obj.nickname,
        "apt_name": apartment.apt_name if apartment else None,
        "kapt_code": apartment.kapt_code if apartment else None,
        "region_name": region.region_name if region else None,
        "city_name": region.city_name if region else None,
        "exclusive_area": float(property_obj.exclusive_area) if property_obj.exclusive_area else None,
        "current_market_price": property_obj.current_market_price,
        "memo": property_obj.memo,
        # 교육 시설 및 교통 정보 추가
        "education_facility": apart_detail.educationFacility if apart_detail else None,
        "subway_line": apart_detail.subway_line if apart_detail else None,
        "subway_station": apart_detail.subway_station if apart_detail else None,
        "subway_time": apart_detail.subway_time if apart_detail else None,
    }
    
    # 5. AI 칭찬글 생성
    try:
        compliment = await ai_service.generate_property_compliment(property_data)
    except Exception as e:
        raise ExternalAPIException(f"AI 칭찬글 생성 실패: {str(e)}")
    
    # 6. 생성 일시
    generated_at = datetime.utcnow().isoformat() + "Z"
    
    # 7. 캐시에 저장 (TTL: 24시간 - 칭찬글은 자주 변경되지 않으므로 긴 TTL)
    await set_to_cache(
        cache_key,
        {
            "compliment": compliment,
            "generated_at": generated_at
        },
        ttl=86400  # 24시간
    )
    
    return {
        "success": True,
        "data": {
            "property_id": property_id,
            "compliment": compliment,
            "generated_at": generated_at
        }
    }


@router.post(
    "/summary/apartment",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🤖 AI (인공지능)"],
    summary="아파트 정보 AI 요약 생성",
    description="""
    AI를 사용하여 아파트에 대한 객관적이고 유용한 요약을 생성합니다.
    
    ### 기능 설명
    - Gemini AI를 사용하여 아파트 정보를 바탕으로 요약을 생성합니다.
    - 생성된 요약은 캐시되어 동일한 아파트에 대한 재요청 시 빠르게 반환됩니다.
    - 요약은 300자 이내로 생성됩니다.
    
    ### 요청 정보
    - `apt_id`: 요약을 생성할 아파트 ID (query parameter)
    
    ### 응답 정보
    - `summary`: AI가 생성한 요약
    - `apt_id`: 아파트 ID
    - `generated_at`: 생성 일시
    
    ### 제한사항
    - GEMINI_API_KEY가 설정되어 있어야 합니다.
    - 아파트 정보가 충분해야 좋은 요약을 생성할 수 있습니다.
    """,
    responses={
        200: {
            "description": "요약 생성 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "apt_id": 1,
                            "summary": "이 아파트는 서울특별시 강남구에 위치한 대규모 아파트 단지입니다. 총 500세대 규모로 구성되어 있으며, 지하철 2호선 강남역과 도보 5분 거리에 위치하여 교통 접근성이 우수합니다. 인근에 초등학교와 중학교가 있어 교육 환경이 양호하며, 총 주차대수 300대로 주차 시설도 충분합니다.",
                            "generated_at": "2026-01-14T15:30:00Z"
                        }
                    }
                }
            }
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        },
        503: {
            "description": "AI 서비스 사용 불가 (GEMINI_API_KEY 미설정 또는 API 오류)"
        }
    }
)
async def generate_apartment_summary(
    apt_id: int = Query(..., description="요약을 생성할 아파트 ID", gt=0),
    db: AsyncSession = Depends(get_db)
):
    """
    아파트 정보 AI 요약 생성
    
    AI를 사용하여 아파트에 대한 객관적이고 유용한 요약을 생성합니다.
    생성된 요약은 캐시되어 재사용됩니다.
    """
    # AI 서비스가 사용 가능한지 확인
    if ai_service is None:
        raise ExternalAPIException("AI 서비스가 사용할 수 없습니다. GEMINI_API_KEY를 설정해주세요.")
    
    # 1. 캐시에서 조회 시도
    cache_key = get_apartment_summary_cache_key(apt_id)
    cached_summary = await get_from_cache(cache_key)
    
    if cached_summary is not None:
        # 캐시 히트: 캐시된 요약 반환
        return {
            "success": True,
            "data": {
                "apt_id": apt_id,
                "summary": cached_summary.get("summary"),
                "generated_at": cached_summary.get("generated_at")
            }
        }
    
    # 2. 아파트 정보 조회 (eager loading으로 관계 정보 포함)
    result = await db.execute(
        select(Apartment)
        .where(
            Apartment.apt_id == apt_id,
            Apartment.is_deleted == False
        )
        .options(
            selectinload(Apartment.region),  # State 관계 로드
            selectinload(Apartment.apart_detail)  # ApartDetail 관계 로드 (1대1)
        )
    )
    apartment = result.scalar_one_or_none()
    
    if not apartment:
        raise NotFoundException("아파트")
    
    # 3. 지역 정보 및 상세 정보 추출
    region = apartment.region if apartment else None
    apart_detail = apartment.apart_detail if apartment else None
    
    # 4. AI에 전달할 데이터 구성
    apartment_data = {
        "apt_name": apartment.apt_name if apartment else None,
        "kapt_code": apartment.kapt_code if apartment else None,
        "region_name": region.region_name if region else None,
        "city_name": region.city_name if region else None,
        "road_address": apart_detail.road_address if apart_detail else None,
        "jibun_address": apart_detail.jibun_address if apart_detail else None,
        "total_household_cnt": apart_detail.total_household_cnt if apart_detail else None,
        "total_building_cnt": apart_detail.total_building_cnt if apart_detail else None,
        "highest_floor": apart_detail.highest_floor if apart_detail else None,
        "use_approval_date": apart_detail.use_approval_date.isoformat() if apart_detail and apart_detail.use_approval_date else None,
        "total_parking_cnt": apart_detail.total_parking_cnt if apart_detail else None,
        "builder_name": apart_detail.builder_name if apart_detail else None,
        "code_heat_nm": apart_detail.code_heat_nm if apart_detail else None,
        "education_facility": apart_detail.educationFacility if apart_detail else None,
        "subway_line": apart_detail.subway_line if apart_detail else None,
        "subway_station": apart_detail.subway_station if apart_detail else None,
        "subway_time": apart_detail.subway_time if apart_detail else None,
    }
    
    # 5. AI 요약 생성
    try:
        summary = await ai_service.generate_apartment_summary(apartment_data)
    except Exception as e:
        raise ExternalAPIException(f"AI 요약 생성 실패: {str(e)}")
    
    # 6. 생성 일시
    generated_at = datetime.utcnow().isoformat() + "Z"
    
    # 7. 캐시에 저장 (TTL: 24시간 - 요약은 자주 변경되지 않으므로 긴 TTL)
    await set_to_cache(
        cache_key,
        {
            "summary": summary,
            "generated_at": generated_at
        },
        ttl=86400  # 24시간
    )
    
    return {
        "success": True,
        "data": {
            "apt_id": apt_id,
            "summary": summary,
            "generated_at": generated_at
        }
    }
