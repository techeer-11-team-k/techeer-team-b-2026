"""
지역 검색 API 엔드포인트

담당자: 박찬영
담당 기능:
- 지역 검색 (GET /search/locations) - P0

레이어드 아키텍처:
- API Layer (이 파일): 요청/응답 처리
- Service Layer (services/search.py): 비즈니스 로직
- CRUD Layer (crud/state.py): DB 작업
- Model Layer (models/state.py): 데이터 모델
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.services.search import search_service
from app.schemas.state import (
    LocationSearchResponse,
    LocationSearchData,
    LocationSearchMeta,
    LocationSearchResult
)

router = APIRouter()


@router.get(
    "/locations",
    response_model=LocationSearchResponse,
    status_code=status.HTTP_200_OK,
    summary="지역 검색 (시/군/구/동)",
    description="지역명으로 검색합니다. 검색창에 1글자 이상 입력 시 자동완성 결과를 반환합니다. 시군구 또는 동 단위로 필터링할 수 있습니다. ERD 설계에 따라 기본 정보(지역ID, 지역명, 지역코드, 시도명)만 반환하며, 상세 정보는 별도 API를 통해 조회할 수 있습니다.",
    tags=["🔍 Search (검색)"],
    responses={
        200: {
            "description": "검색 성공",
            "model": LocationSearchResponse
        },
        400: {
            "description": "검색어가 1글자 미만",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {
                            "code": "VALIDATION_ERROR",
                            "message": "검색어는 최소 1글자 이상이어야 합니다."
                        }
                    }
                }
            }
        },
        422: {
            "description": "입력값 검증 실패"
        },
        500: {
            "description": "서버 내부 오류"
        }
    }
)
async def search_locations(
    q: str = Query(
        ..., 
        min_length=1, 
        max_length=50,
        description="검색어 (1글자 이상, 최대 50자)",
        example="강남"
    ),
    location_type: Optional[str] = Query(
        None, 
        pattern="^(sigungu|dong)$",
        description="지역 유형 필터 (sigungu: 시군구만, dong: 동/리/면만, None: 전체)",
        example="sigungu"
    ),
    limit: int = Query(
        20, 
        ge=1, 
        le=50,
        description="결과 개수 (기본 20개, 최대 50개)"
    ),
    db: AsyncSession = Depends(get_db)
):
    """
    ## 지역 검색 API (시/군/구/동)
    
    검색창에 입력한 글자를 포함하는 지역 목록을 반환합니다.
    대소문자 구분 없이 검색하며, 삭제되지 않은 지역만 조회합니다.
    
    ### 동작 흐름
    1. 클라이언트가 검색어를 전송
    2. API 엔드포인트에서 파라미터 검증 (Pydantic)
    3. Service 레이어에서 비즈니스 로직 처리
    4. CRUD 레이어에서 DB 쿼리 실행
    5. 결과를 응답 형식에 맞게 변환하여 반환
    
    ### Query Parameters
    - **q**: 검색어 (최소 1글자, 최대 50자)
        - 예: "강남", "역삼", "서울"
    - **location_type**: 지역 유형 필터 (선택)
        - `sigungu`: 시군구만 검색 (예: "강남구", "해운대구")
        - `dong`: 동/리/면만 검색 (예: "역삼동", "물치리")
        - `None` (생략): 전체 검색
    - **limit**: 반환할 결과 개수 (기본 20개, 최대 50개)
    
    ### Response
    - 성공 (200): 지역 목록 (ID, 이름, 전체 주소, 지역 유형)
    - 실패 (400): 검색어가 1글자 미만
    - 실패 (422): 입력값 검증 실패
    
    ### 지역 유형 판단
    - **sigungu**: region_name에 "구", "시", "군" 포함 (단, "동", "리", "면" 제외)
    - **dong**: region_name에 "동", "리", "면" 포함
    
    ### 성능 고려사항
    - region_name, city_name 컬럼에 인덱스가 필요합니다
    - 대량 데이터 조회 시 페이지네이션 권장
    - Redis 캐싱 적용 시 TTL 1시간 권장
    
    ### 사용 예시
    ```bash
    # 전체 검색
    GET /api/v1/search/locations?q=강남&limit=20
    
    # 시군구만 검색
    GET /api/v1/search/locations?q=강남&location_type=sigungu
    
    # 동만 검색
    GET /api/v1/search/locations?q=역삼&location_type=dong
    ```
    """
    # Service 레이어를 통해 비즈니스 로직 처리
    # 엔드포인트는 최소한의 로직만 포함하고, 복잡한 처리는 Service에 위임
    results = await search_service.search_locations(
        db=db,
        query=q,
        location_type=location_type,
        limit=limit
    )
    
    # Pydantic 스키마로 변환
    location_results = [
        LocationSearchResult(
            region_id=item["region_id"],
            region_name=item["region_name"],
            region_code=item["region_code"],
            city_name=item["city_name"],
            full_name=item["full_name"],
            location_type=item["location_type"]
        )
        for item in results
    ]
    
    # 공통 응답 형식으로 반환
    # 모든 API는 동일한 형식 ({success, data, meta})을 사용하여 일관성 유지
    # Pydantic 스키마를 사용하여 타입 안정성 보장
    return LocationSearchResponse(
        success=True,
        data=LocationSearchData(results=location_results),
        meta=LocationSearchMeta(
            query=q,
            count=len(location_results),
            location_type=location_type
        )
    )
