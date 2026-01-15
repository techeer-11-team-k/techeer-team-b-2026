"""
검색 관련 API 엔드포인트

담당 기능:
- 아파트명 검색 (GET /search/apartments) - P0 (pg_trgm 유사도 검색)
- 지역 검색 (GET /search/locations) - P0
- 최근 검색어 저장 (POST /search/recent) - P1
- 최근 검색어 조회 (GET /search/recent) - P1
- 최근 검색어 삭제 (DELETE /search/recent/{id}) - P1

레이어드 아키텍처:
- API Layer (이 파일): 요청/응답 처리
- Service Layer (services/search.py): 비즈니스 로직
- CRUD Layer (crud/): DB 작업
- Model Layer (models/): 데이터 모델
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_current_user, get_current_user_optional
from app.models.account import Account
from app.services.search import search_service
from app.crud.recent_search import recent_search as recent_search_crud
from app.schemas.recent_search import RecentSearchCreate, RecentSearchResponse
from app.schemas.apartment import (
    ApartmentSearchResponse,
    ApartmentSearchData,
    ApartmentSearchMeta,
    ApartmentSearchResult
)
from app.schemas.state import (
    LocationSearchResponse,
    LocationSearchData,
    LocationSearchMeta,
    LocationSearchResult
)

router = APIRouter()


@router.get(
    "/apartments",
    response_model=ApartmentSearchResponse,
    status_code=status.HTTP_200_OK,
    tags=["🔍 Search (검색)"],
    summary="아파트명 검색",
    description="아파트명으로 검색합니다. pg_trgm 유사도 검색을 사용하여 오타, 공백, 부분 매칭을 지원합니다.",
    responses={
        200: {
            "description": "검색 성공",
            "model": ApartmentSearchResponse
        },
        400: {"description": "검색어가 2글자 미만인 경우"},
        422: {"description": "입력값 검증 실패"}
    }
)
async def search_apartments(
    q: str = Query(..., min_length=2, max_length=50, description="검색어 (2글자 이상, 최대 50자)"),
    limit: int = Query(10, ge=1, le=50, description="결과 개수 (기본 10개, 최대 50개)"),
    threshold: float = Query(0.2, ge=0.0, le=1.0, description="유사도 임계값 (0.0~1.0, 기본 0.2)"),
    current_user: Optional[Account] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    아파트명 검색 API - pg_trgm 유사도 검색
    
    pg_trgm 확장을 사용하여 유사도 기반 검색을 수행합니다.
    - "롯데캐슬"로 "롯데 캐슬 파크타운" 검색 가능
    - "e편한세상"과 "이편한세상" 모두 검색 가능
    - 부분 매칭 지원 (예: "힐스테" → "힐스테이트")
    
    로그인한 사용자의 경우 검색어가 자동으로 최근 검색어에 저장됩니다.
    
    Args:
        q: 검색어 (최소 2글자)
        limit: 반환할 결과 개수 (기본 10개, 최대 50개)
        threshold: 유사도 임계값 (기본 0.2, 높을수록 정확한 결과)
        current_user: 현재 로그인한 사용자 (선택적, 로그인하지 않아도 검색 가능)
        db: 데이터베이스 세션
    
    Returns:
        ApartmentSearchResponse: 검색 결과
    """
    # Service 레이어를 통해 비즈니스 로직 처리
    results = await search_service.search_apartments(
        db=db,
        query=q,
        limit=limit,
        threshold=threshold
    )
    
    # 로그인한 사용자인 경우 자동으로 최근 검색어 저장
    if current_user:
        try:
            await recent_search_crud.create_or_update(
                db,
                account_id=current_user.account_id,
                query=q,
                search_type="apartment"
            )
        except Exception as e:
            # 최근 검색어 저장 실패해도 검색 결과는 반환
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"최근 검색어 자동 저장 실패 (무시됨): {e}")
    
    # Pydantic 스키마로 변환
    apartment_results = [
        ApartmentSearchResult(**item)
        for item in results
    ]
    
    # 공통 응답 형식으로 반환
    return ApartmentSearchResponse(
        success=True,
        data=ApartmentSearchData(results=apartment_results),
        meta=ApartmentSearchMeta(
            query=q,
            count=len(apartment_results)
        )
    )


@router.get(
    "/locations",
    response_model=LocationSearchResponse,
    status_code=status.HTTP_200_OK,
    tags=["🔍 Search (검색)"],
    summary="지역 검색",
    description="지역명(시/군/구/동)으로 검색합니다. 시군구 또는 동 단위로 검색할 수 있습니다.",
    responses={
        200: {
            "description": "검색 성공",
            "model": LocationSearchResponse
        },
        422: {"description": "입력값 검증 실패"}
    }
)
async def search_locations(
    q: str = Query(..., min_length=1, max_length=50, description="검색어 (1글자 이상, 최대 50자)"),
    location_type: Optional[str] = Query(
        None, 
        pattern="^(sigungu|dong)$",
        description="지역 유형 필터 (sigungu: 시군구만, dong: 동/리/면만, None: 전체)"
    ),
    limit: int = Query(20, ge=1, le=50, description="결과 개수 (기본 20개, 최대 50개)"),
    current_user: Optional[Account] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    지역 검색 API
    
    시/군/구 또는 동 단위로 지역을 검색합니다.
    검색어로 시작하거나 포함하는 지역 목록을 반환합니다.
    
    로그인한 사용자의 경우 검색어가 자동으로 최근 검색어에 저장됩니다.
    
    Args:
        q: 검색어 (1글자 이상, 최대 50자)
        location_type: 지역 유형 필터 (sigungu: 시군구만, dong: 동/리/면만, None: 전체)
        limit: 결과 개수 (기본 20개, 최대 50개)
        current_user: 현재 로그인한 사용자 (선택적, 로그인하지 않아도 검색 가능)
        db: 데이터베이스 세션
    
    Returns:
        LocationSearchResponse: 검색 결과
    
    Note:
        - location_type이 None이면 시군구와 동 모두 검색
        - region_code의 마지막 5자리가 "00000"이면 시군구, 그 외는 동
        - Redis 캐싱 적용 권장 (TTL: 1시간)
    """
    # Service 레이어를 통해 비즈니스 로직 처리
    results = await search_service.search_locations(
        db=db,
        query=q,
        location_type=location_type,
        limit=limit
    )
    
    # 로그인한 사용자인 경우 자동으로 최근 검색어 저장
    if current_user:
        try:
            await recent_search_crud.create_or_update(
                db,
                account_id=current_user.account_id,
                query=q,
                search_type="location"
            )
        except Exception as e:
            # 최근 검색어 저장 실패해도 검색 결과는 반환
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"최근 검색어 자동 저장 실패 (무시됨): {e}")
    
    # Pydantic 스키마로 변환
    location_results = [
        LocationSearchResult(**item)
        for item in results
    ]
    
    # 공통 응답 형식으로 반환
    return LocationSearchResponse(
        success=True,
        data=LocationSearchData(results=location_results),
        meta=LocationSearchMeta(
            query=q,
            count=len(location_results),
            location_type=location_type
        )
    )


@router.post(
    "/recent",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    tags=["🔍 Search (검색)"],
    summary="최근 검색어 저장",
    description="검색한 검색어를 최근 검색어 목록에 저장합니다. 같은 검색어가 이미 있으면 기존 레코드를 업데이트합니다.",
    responses={
        201: {"description": "저장 성공"},
        401: {"description": "로그인이 필요합니다"},
        422: {"description": "입력값 검증 실패"}
    }
)
async def save_recent_search(
    search_data: RecentSearchCreate = Body(..., description="검색어 정보"),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    최근 검색어 저장 API
    
    사용자가 검색한 검색어를 최근 검색어 목록에 저장합니다.
    같은 검색어가 이미 있으면 기존 레코드의 검색일시를 업데이트합니다.
    
    Args:
        search_data: 검색어 정보 (query, search_type)
        current_user: 현재 로그인한 사용자 (의존성 주입)
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "data": {
                "search_id": int,
                "query": str,
                "search_type": str,
                "searched_at": str
            }
        }
    
    Raises:
        HTTPException: 로그인이 필요한 경우 401 에러
    """
    # 최근 검색어 저장 또는 업데이트
    recent_search = await recent_search_crud.create_or_update(
        db,
        account_id=current_user.account_id,
        query=search_data.query,
        search_type=search_data.search_type
    )
    
    # searched_at은 created_at을 사용 (최신 검색 시간)
    searched_at = recent_search.created_at if recent_search.created_at else recent_search.updated_at
    
    return {
        "success": True,
        "data": {
            "search_id": recent_search.search_id,
            "query": recent_search.query,
            "search_type": recent_search.search_type,
            "searched_at": searched_at.isoformat() if searched_at else None
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
                        "search_id": int,
                        "query": str,
                        "search_type": str,  # "apartment" 또는 "location"
                        "searched_at": str  # ISO 8601 형식
                    }
                ],
                "total": int
            }
        }
    
    Raises:
        HTTPException: 로그인이 필요한 경우 401 에러
    """
    # 최근 검색어 목록 조회
    recent_searches = await recent_search_crud.get_by_account(
        db,
        account_id=current_user.account_id,
        limit=limit
    )
    
    # 응답 데이터 변환 (이미지 형식에 맞춤: id, type, searched_at)
    search_list = []
    for search in recent_searches:
        # searched_at은 created_at을 사용 (최신 검색 시간)
        searched_at = search.created_at if search.created_at else search.updated_at
        
        search_list.append({
            "id": search.search_id,
            "query": search.query,
            "type": search.search_type,
            "searched_at": searched_at.isoformat() if searched_at else None
        })
    
    return {
        "success": True,
        "data": {
            "recent_searches": search_list
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
    # 최근 검색어 삭제 (소프트 삭제)
    deleted_search = await recent_search_crud.delete_by_id_and_account(
        db,
        search_id=search_id,
        account_id=current_user.account_id
    )
    
    if not deleted_search:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SEARCH_NOT_FOUND",
                "message": "검색어를 찾을 수 없거나 본인의 검색 기록이 아닙니다."
            }
        )
    
    return {
        "success": True,
        "data": {
            "message": "검색어가 삭제되었습니다."
        }
    }
