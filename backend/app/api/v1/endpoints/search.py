"""
검색 관련 API 엔드포인트

담당 기능:
- 아파트명 검색 (GET /search/apartments) - P0 (pg_trgm 유사도 검색)
- 지역 검색 (GET /search/locations) - P0
- 최근 검색어 조회 (GET /search/recent) - P1
- 최근 검색어 삭제 (DELETE /search/recent/{id}) - P1
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.api.v1.deps import get_db, get_current_user
from app.models.account import Account
from app.models.apartment import Apartment
from app.models.apart_detail import ApartDetail
from app.models.state import State
from app.utils.search_utils import normalize_apt_name_py

router = APIRouter()


@router.get(
    "/apartments",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🔍 Search (검색)"],
    summary="아파트명 검색",
    description="아파트명으로 검색합니다. pg_trgm 유사도 검색을 사용하여 오타, 공백, 부분 매칭을 지원합니다.",
    responses={
        200: {"description": "검색 성공"},
        400: {"description": "검색어가 2글자 미만인 경우"},
        422: {"description": "입력값 검증 실패"}
    }
)
async def search_apartments(
    q: str = Query(..., min_length=2, description="검색어 (2글자 이상)"),
    limit: int = Query(10, ge=1, le=50, description="결과 개수 (최대 50개)"),
    threshold: float = Query(0.2, ge=0.0, le=1.0, description="유사도 임계값 (0.0~1.0, 기본 0.2)"),
    db: AsyncSession = Depends(get_db)
):
    """
    아파트명 검색 API - pg_trgm 유사도 검색
    
    pg_trgm 확장을 사용하여 유사도 기반 검색을 수행합니다.
    - "롯데캐슬"로 "롯데 캐슬 파크타운" 검색 가능
    - "e편한세상"과 "이편한세상" 모두 검색 가능
    - 부분 매칭 지원 (예: "힐스테" → "힐스테이트")
    
    Args:
        q: 검색어 (최소 2글자)
        limit: 반환할 결과 개수 (기본 10개, 최대 50개)
        threshold: 유사도 임계값 (기본 0.2, 높을수록 정확한 결과)
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "data": {
                "results": [
                    {
                        "apt_id": int,
                        "apt_name": str,
                        "address": str,
                        "sigungu_name": str,
                        "location": {"lat": float, "lng": float},
                        "score": float  # 유사도 점수
                    }
                ]
            },
            "meta": {
                "query": str,
                "normalized_query": str,
                "count": int
            }
        }
    """
    # 검색어 정규화 (Python에서 SQL 함수와 동일하게)
    normalized_q = normalize_apt_name_py(q)
    
    # pg_trgm 유사도 검색 쿼리
    # similarity() 함수는 0~1 사이의 유사도 점수를 반환
    stmt = (
        select(
            Apartment.apt_id,
            Apartment.apt_name,
            ApartDetail.road_address,
            ApartDetail.jibun_address,
            State.city_name,
            State.region_name,
            func.ST_X(ApartDetail.geometry).label('lng'),
            func.ST_Y(ApartDetail.geometry).label('lat'),
            func.similarity(
                func.normalize_apt_name(Apartment.apt_name),
                normalized_q
            ).label('score')
        )
        .join(ApartDetail, Apartment.apt_id == ApartDetail.apt_id)
        .join(State, Apartment.region_id == State.region_id)
        .where(
            func.similarity(
                func.normalize_apt_name(Apartment.apt_name),
                normalized_q
            ) > threshold
        )
        .order_by(text('score DESC'))
        .limit(limit)
    )
    
    result = await db.execute(stmt)
    apartments = result.all()
    
    results = []
    for apt in apartments:
        # 주소 조합 (도로명 우선, 없으면 지번)
        address = apt.road_address if apt.road_address else apt.jibun_address
        
        # 시군구 이름 조합 (예: 서울특별시 강남구)
        sigungu_full = f"{apt.city_name} {apt.region_name}"
        
        results.append({
            "apt_id": apt.apt_id,
            "apt_name": apt.apt_name,
            "address": address,
            "sigungu_name": sigungu_full,
            "location": {
                "lat": apt.lat if apt.lat else 0.0,
                "lng": apt.lng if apt.lng else 0.0
            },
            "score": round(apt.score, 3) if apt.score else 0.0,
            # 프론트엔드 호환성을 위해 추가 필드 (가격 등은 현재 DB에 없으므로 더미/추후 조인)
            "price": "시세 정보 없음"  
        })
    
    return {
        "success": True,
        "data": {
            "results": results
        },
        "meta": {
            "query": q,
            "normalized_query": normalized_q,
            "count": len(results)
        }
    }


@router.get(
    "/locations",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🔍 Search (검색)"],
    summary="지역 검색",
    description="지역명(시/군/구/동)으로 검색합니다. 시군구 또는 동 단위로 검색할 수 있습니다.",
    responses={
        200: {"description": "검색 성공"},
        422: {"description": "입력값 검증 실패"}
    }
)
async def search_locations(
    q: str = Query(..., min_length=1, description="검색어"),
    location_type: Optional[str] = Query(
        None, 
        regex="^(sigungu|dong)$",
        description="지역 유형 (sigungu: 시군구, dong: 동)"
    ),
    db: AsyncSession = Depends(get_db)
):
    """
    지역 검색 API
    
    시/군/구 또는 동 단위로 지역을 검색합니다.
    검색어로 시작하거나 포함하는 지역 목록을 반환합니다.
    
    Args:
        q: 검색어
        location_type: 지역 유형 필터 (sigungu: 시군구, dong: 동, None: 전체)
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "data": {
                "results": [
                    {
                        "id": int,
                        "name": str,
                        "type": str,
                        "full_name": str,
                        "center": {"lat": float, "lng": float}
                    }
                ]
            }
        }
    
    Note:
        - location_type이 None이면 시군구와 동 모두 검색
        - Redis 캐싱 적용 권장 (TTL: 1시간)
    """
    # 검색어로 시작하거나 포함하는 지역 검색
    query_filter = or_(
        State.region_name.ilike(f"%{q}%"),
        State.city_name.ilike(f"%{q}%")
    )
    
    # 지역 유형 필터링
    # region_code의 마지막 5자리가 00000이면 시군구, 아니면 동
    if location_type == 'sigungu':
        query_filter = query_filter & func.right(State.region_code, 5) == '00000'
    elif location_type == 'dong':
        query_filter = query_filter & func.right(State.region_code, 5) != '00000'
    
    # 지역 검색 쿼리
    stmt = (
        select(
            State.region_id,
            State.region_name,
            State.city_name,
            State.region_code,
            # 지역 유형 판단 (region_code 마지막 5자리가 00000이면 시군구)
            case(
                (func.right(State.region_code, 5) == '00000', 'sigungu'),
                else_='dong'
            ).label('type'),
            # 해당 지역의 아파트들의 평균 좌표 계산
            func.avg(func.ST_Y(ApartDetail.geometry)).label('lat'),
            func.avg(func.ST_X(ApartDetail.geometry)).label('lng')
        )
        .outerjoin(Apartment, State.region_id == Apartment.region_id)
        .outerjoin(ApartDetail, Apartment.apt_id == ApartDetail.apt_id)
        .where(query_filter)
        .where(State.is_deleted == False)
        .where(ApartDetail.is_deleted == False)
        .where(ApartDetail.geometry.isnot(None))
        .group_by(
            State.region_id,
            State.region_name,
            State.city_name,
            State.region_code
        )
        .having(func.count(ApartDetail.apt_detail_id) > 0)  # 아파트가 있는 지역만
        .limit(20)
    )
    
    result = await db.execute(stmt)
    locations = result.all()
    
    results = []
    for loc in locations:
        # 전체 이름 구성 (시도명 + 시군구명)
        full_name = f"{loc.city_name} {loc.region_name}"
        
        # 중심 좌표가 있으면 사용, 없으면 기본값
        center_lat = float(loc.lat) if loc.lat else 37.5665  # 서울시청 기본값
        center_lng = float(loc.lng) if loc.lng else 126.9780
        
        results.append({
            "id": loc.region_id,
            "name": loc.region_name,
            "type": loc.type,
            "full_name": full_name,
            "center": {
                "lat": center_lat,
                "lng": center_lng
            }
        })
    
    return {
        "success": True,
        "data": {
            "results": results
        }
    }


@router.get(
    "/recent",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🔍 Search (검색)"],
    summary="최근 검색어 조회",
    description="로그인한 사용자의 최근 검색어 목록을 조회합니다. 검색창을 탭했을 때 이전 검색 기록을 보여줍니다.",
    responses={
        200: {"description": "조회 성공"},
        401: {"description": "로그인이 필요합니다"}
    }
)
async def get_recent_searches(
    limit: int = Query(10, ge=1, le=50, description="최대 개수 (기본 10개, 최대 50개)"),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    최근 검색어 조회 API
    
    로그인한 사용자가 최근에 검색한 기록을 시간순(최신순)으로 반환합니다.
    아파트 검색과 지역 검색을 모두 포함합니다.
    
    Args:
        limit: 반환할 최대 개수 (기본 10개, 최대 50개)
        current_user: 현재 로그인한 사용자 (의존성 주입)
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "data": {
                "recent_searches": [
                    {
                        "id": int,
                        "query": str,
                        "type": str,  # "apartment" 또는 "location"
                        "searched_at": str  # ISO 8601 형식
                    }
                ]
            }
        }
    
    Raises:
        HTTPException: 로그인이 필요한 경우 401 에러
    """
    # TODO: SearchService.get_recent_searches() 구현 후 사용
    # result = await SearchService.get_recent_searches(db, user_id=current_user.id, limit=limit)
    
    # 임시 응답 (서비스 레이어 구현 전)
    return {
        "success": True,
        "data": {
            "recent_searches": []
        }
    }


@router.delete(
    "/recent/{search_id}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🔍 Search (검색)"],
    summary="최근 검색어 삭제",
    description="특정 최근 검색어를 삭제합니다. 사용자가 검색 기록을 개별적으로 삭제할 때 사용합니다.",
    responses={
        200: {"description": "삭제 성공"},
        401: {"description": "로그인이 필요합니다"},
        404: {"description": "검색어를 찾을 수 없습니다"}
    }
)
async def delete_recent_search(
    search_id: int,
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    최근 검색어 삭제 API
    
    로그인한 사용자의 특정 검색 기록을 삭제합니다.
    본인의 검색 기록만 삭제할 수 있습니다.
    
    Args:
        search_id: 삭제할 검색어 ID
        current_user: 현재 로그인한 사용자 (의존성 주입)
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "data": {
                "message": "검색어가 삭제되었습니다."
            }
        }
    
    Raises:
        HTTPException: 
            - 401: 로그인이 필요한 경우
            - 404: 검색어를 찾을 수 없거나 본인의 검색 기록이 아닌 경우
    """
    # TODO: SearchService.delete_recent_search() 구현 후 사용
    # await SearchService.delete_recent_search(db, search_id=search_id, user_id=current_user.id)
    
    # 임시 응답 (서비스 레이어 구현 전)
    return {
        "success": True,
        "data": {
            "message": "검색어가 삭제되었습니다."
        }
    }
