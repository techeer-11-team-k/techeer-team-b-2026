"""
아파트명 검색 API 엔드포인트

담당자: 박찬영
담당 기능:
- 아파트명 검색 (GET /search/apartments)

참고:
- 최근 검색어 조회: search_check.py (API #19)
- 최근 검색어 삭제: search_delete.py (API #20)
- 지역 검색: search_region.py

레이어드 아키텍처:
- API Layer (이 파일): 요청/응답 처리
- Service Layer (services/search.py): 비즈니스 로직
- CRUD Layer (crud/apartment.py): DB 작업
- Model Layer (models/apartment.py): 데이터 모델

주의:
- 이 파일은 레이어드 아키텍처를 준수하여 Service 레이어를 사용합니다.
- 직접 DB 쿼리를 작성하지 않고, Service 레이어에 위임합니다.
"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.services.search import search_service
from app.schemas.apartment import (
    ApartmentSearchResponse,
    ApartmentSearchData,
    ApartmentSearchMeta
)

router = APIRouter()


@router.get(
    "/apartments",
    response_model=ApartmentSearchResponse,
    status_code=status.HTTP_200_OK,
    tags=["🔍 Search (검색)"],
    summary="아파트명 검색 (자동완성)",
    description="아파트명으로 검색합니다. 검색창에 2글자 이상 입력 시 자동완성 결과를 반환합니다. 주소와 위치 정보를 포함하여 반환합니다.",
    responses={
        200: {
            "description": "검색 성공",
            "model": ApartmentSearchResponse
        },
        400: {
            "description": "검색어가 2글자 미만",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {
                            "code": "VALIDATION_ERROR",
                            "message": "검색어는 최소 2글자 이상이어야 합니다."
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
async def search_apartments(
    q: str = Query(
        ..., 
        min_length=2, 
        max_length=50,
        description="검색어 (2글자 이상, 최대 50자)",
        example="래미안"
    ),
    limit: int = Query(
        10, 
        ge=1, 
        le=50,
        description="결과 개수 (기본 10개, 최대 50개)"
    ),
    db: AsyncSession = Depends(get_db)
):
    """
    ## 아파트명 검색 API
    
    검색창에 입력한 글자를 포함하는 아파트 목록을 반환합니다.
    대소문자 구분 없이 검색하며, 삭제되지 않은 아파트만 조회합니다.
    주소와 위치 정보는 APART_DETAILS 테이블과 JOIN하여 가져옵니다.
    
    ### 동작 흐름
    1. 클라이언트가 검색어를 전송
    2. API 엔드포인트에서 파라미터 검증 (Pydantic)
    3. Service 레이어에서 비즈니스 로직 처리
    4. CRUD 레이어에서 DB 쿼리 실행 (JOIN 포함)
    5. 결과를 응답 형식에 맞게 변환하여 반환
    
    ### Query Parameters
    - **q**: 검색어 (최소 2글자, 최대 50자)
        - 예: "래미안", "강남", "해운대"
    - **limit**: 반환할 결과 개수 (기본 10개, 최대 50개)
    
    ### Response
    - 성공 (200): 아파트 목록 (이름, 주소, 위치 정보 포함)
    - 실패 (400): 검색어가 2글자 미만
    - 실패 (422): 입력값 검증 실패
    
    ### 성능 고려사항
    - apt_name 컬럼에 인덱스가 필요합니다
    - 대량 데이터 조회 시 페이지네이션 권장
    - Redis 캐싱 적용 시 TTL 1시간 권장
    
    ### 사용 예시
    ```bash
    GET /api/v1/search/apartments?q=래미안&limit=10
    ```
    """
    # Service 레이어를 통해 비즈니스 로직 처리
    # 엔드포인트는 최소한의 로직만 포함하고, 복잡한 처리는 Service에 위임
    results = await search_service.search_apartments(
        db=db,
        query=q,
        limit=limit
    )
    
    # 공통 응답 형식으로 반환
    # 모든 API는 동일한 형식 ({success, data, meta})을 사용하여 일관성 유지
    # Pydantic 스키마를 사용하여 타입 안정성 보장
    return ApartmentSearchResponse(
        success=True,
        data=ApartmentSearchData(results=results),
        meta=ApartmentSearchMeta(query=q, count=len(results))
    )


# 최근 검색어 관련 API는 별도 파일로 분리되었습니다:
# - 최근 검색어 조회: search_check.py (API #19)
# - 최근 검색어 삭제: search_delete.py (API #20)
