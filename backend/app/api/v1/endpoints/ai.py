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
from app.schemas.ai import AISearchRequest, AISearchResponse, AISearchCriteria
from app.services.apartment import apartment_service

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


@router.post(
    "/search",
    response_model=AISearchResponse,
    status_code=status.HTTP_200_OK,
    tags=["🤖 AI (인공지능)"],
    summary="AI 자연어 아파트 검색",
    description="""
    AI에게 자연어로 원하는 집에 대한 설명을 하면 AI가 파싱해서 관련된 아파트 리스트를 반환합니다.
    
    ### 기능 설명
    - 사용자가 자연어로 원하는 집의 조건을 입력합니다 (예: "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처")
    - AI가 자연어를 파싱하여 구조화된 검색 조건으로 변환합니다
    - 변환된 조건으로 아파트를 검색하여 결과를 반환합니다
    
    ### 지원하는 검색 조건
    - 위치: 지역명 (예: "강남구", "서울시 강남구")
    - 평수: 전용면적 (예: "30평대", "20평~30평")
    - 가격: 매매가격 (예: "5억", "3억~5억")
    - 지하철 거리: 지하철역까지 도보 시간 (예: "10분 이내", "지하철 근처")
    - 교육시설: 교육시설 유무 (예: "초등학교 근처", "학교 근처")
    
    ### 요청 정보
    - `query`: 자연어 검색 쿼리 (5자 이상, 500자 이하)
    
    ### 응답 정보
    - `criteria`: AI가 파싱한 검색 조건
    - `apartments`: 검색 결과 아파트 목록
    - `count`: 검색 결과 개수
    - `total`: 전체 검색 결과 개수
    
    ### 제한사항
    - GEMINI_API_KEY가 설정되어 있어야 합니다.
    - 자연어 파싱의 정확도는 입력된 설명의 명확도에 따라 달라집니다.
    """,
    responses={
        200: {
            "description": "검색 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "criteria": {
                                "location": "강남구",
                                "min_area": 84.0,
                                "max_area": 114.0,
                                "subway_max_distance_minutes": 10,
                                "has_education_facility": True,
                                "raw_query": "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처",
                                "parsed_confidence": 0.9
                            },
                            "apartments": [
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
                            "total": 1
                        }
                    }
                }
            }
        },
        400: {
            "description": "잘못된 요청 (쿼리 길이 부족 등)"
        },
        503: {
            "description": "AI 서비스 사용 불가 (GEMINI_API_KEY 미설정 또는 API 오류)"
        }
    }
)
async def ai_search_apartments(
    request: AISearchRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    AI 자연어 아파트 검색
    
    사용자가 자연어로 원하는 집에 대한 설명을 입력하면
    AI가 파싱하여 구조화된 검색 조건으로 변환하고,
    해당 조건에 맞는 아파트 목록을 반환합니다.
    """
    # AI 서비스가 사용 가능한지 확인
    if ai_service is None:
        raise ExternalAPIException("AI 서비스가 사용할 수 없습니다. GEMINI_API_KEY를 설정해주세요.")
    
    # 1. AI로 자연어 파싱
    try:
        parsed_criteria = await ai_service.parse_search_query(request.query)
    except Exception as e:
        raise ExternalAPIException(f"AI 자연어 파싱 실패: {str(e)}")
    
    # 2. 지역명이 있으면 region_id 조회
    region_id = parsed_criteria.get("region_id")
    if not region_id and parsed_criteria.get("location"):
        location_name = parsed_criteria.get("location")
        
        # 지역명으로 region_id 찾기
        # "서울시 강남구" 또는 "강남구" 같은 형식 지원
        try:
            from sqlalchemy import or_, and_
            from app.models.state import State
            
            # 지역명 파싱
            # "서울시 강남구" -> city_name="서울특별시", region_name="강남구"
            # "강남구" -> region_name="강남구"
            parts = location_name.strip().split()
            
            if len(parts) >= 2:
                # "서울시 강남구" 형식
                city_part = parts[0].replace("시", "특별시").replace("도", "")
                region_part = parts[1]
                
                # city_name 정규화 (예: "서울시" -> "서울특별시")
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
                
                city_name = city_mapping.get(city_part, city_part)
                if not city_name.endswith(("시", "도", "특별시", "광역시", "특별자치시", "특별자치도")):
                    city_name = city_mapping.get(city_part, f"{city_part}시")
                
                # 시군구 레벨로 검색 (region_code 마지막 5자리가 "00000")
                result = await db.execute(
                    select(State)
                    .where(
                        and_(
                            State.city_name == city_name,
                            State.region_name == region_part,
                            State.region_code.like("%00000"),  # 시군구 레벨
                            State.is_deleted == False
                        )
                    )
                    .limit(1)
                )
            else:
                # "강남구" 형식 (region_name만)
                region_part = parts[0]
                
                # 시군구 레벨로 검색 (가장 일반적인 매칭)
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
                # 파싱된 criteria에 region_id 업데이트
                parsed_criteria["region_id"] = region_id
        except Exception as e:
            # 지역명 매칭 실패 시 로그만 남기고 계속 진행 (region_id는 None)
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"지역명 매칭 실패: {location_name}, 오류: {str(e)}")
            pass
    
    # 3. 상세 검색 실행
    try:
        apartments = await apartment_service.detailed_search(
            db,
            region_id=region_id,
            min_area=parsed_criteria.get("min_area"),
            max_area=parsed_criteria.get("max_area"),
            min_price=parsed_criteria.get("min_price"),
            max_price=parsed_criteria.get("max_price"),
            subway_max_distance_minutes=parsed_criteria.get("subway_max_distance_minutes"),
            has_education_facility=parsed_criteria.get("has_education_facility"),
            limit=50,
            skip=0
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"아파트 검색 중 오류가 발생했습니다: {str(e)}"
        )
    
    # 4. 응답 구성
    return {
        "success": True,
        "data": {
            "criteria": parsed_criteria,
            "apartments": apartments,
            "count": len(apartments),
            "total": len(apartments)
        }
    }
