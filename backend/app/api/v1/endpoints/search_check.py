"""
최근 검색어 조회 API

담당자: 박찬영
API 번호: 19
엔드포인트: GET /api/v1/search/recent

기능:
- 로그인한 사용자의 최근 검색어 목록을 조회합니다
- 검색창을 탭했을 때 이전 검색 기록을 보여줍니다
- 최신순으로 정렬되어 반환됩니다

레이어드 아키텍처:
- API Layer (이 파일): 요청/응답 처리, Swagger 문서화
- Service Layer (services/search.py): 비즈니스 로직
- CRUD Layer (crud/recent_search.py): DB 작업
- Model Layer (models/recent_search.py): 데이터 모델
"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_current_user
from app.models.account import Account
from app.services.search import search_service

router = APIRouter()


@router.get(
    "/recent",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🔍 Search (검색)"],
    summary="최근 검색어 조회",
    description="로그인한 사용자의 최근 검색어 목록을 조회합니다. 검색창을 탭했을 때 이전 검색 기록을 보여줍니다. 아파트 검색과 지역 검색을 모두 포함하며, 최신순으로 정렬되어 반환됩니다.",
    dependencies=[Depends(get_current_user)],  # Swagger UI에서 인증 필요 표시
    responses={
        200: {
            "description": "조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "recent_searches": [
                                {
                                    "id": 1,
                                    "query": "래미안",
                                    "type": "apartment",
                                    "searched_at": "2026-01-13T10:30:00Z"
                                },
                                {
                                    "id": 2,
                                    "query": "강남구",
                                    "type": "location",
                                    "searched_at": "2026-01-13T09:15:00Z"
                                }
                            ]
                        },
                        "meta": {
                            "count": 2
                        }
                    }
                }
            }
        },
        401: {
            "description": "로그인이 필요합니다",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {
                            "code": "UNAUTHORIZED",
                            "message": "인증이 필요합니다."
                        }
                    }
                }
            }
        }
    }
)
async def get_recent_searches(
    limit: int = Query(
        10, 
        ge=1, 
        le=50,
        description="최대 개수 (기본 10개, 최대 50개)",
        example=10
    ),
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
                        "id": int,           # 검색 기록 ID
                        "query": str,        # 검색어
                        "type": str,         # 검색 유형 ("apartment" 또는 "location")
                        "searched_at": str   # 검색 시간 (ISO 8601 형식)
                    }
                ]
            },
            "meta": {
                "count": int  # 반환된 검색 기록 개수
            }
        }
    
    Raises:
        HTTPException: 
            - 401: 로그인이 필요한 경우
    
    Note:
        - 로그인한 사용자만 사용 가능
        - 최신순으로 정렬되어 반환
        - 삭제되지 않은 검색 기록만 조회
        - 아파트 검색과 지역 검색을 모두 포함
    """
    # Service 레이어를 통해 비즈니스 로직 처리
    # 엔드포인트는 최소한의 로직만 포함하고, 복잡한 처리는 Service에 위임
    results = await search_service.get_recent_searches(
        db=db,
        account_id=current_user.account_id,
        limit=limit
    )
    
    # 공통 응답 형식으로 반환
    # 모든 API는 동일한 형식 ({success, data, meta})을 사용하여 일관성 유지
    return {
        "success": True,
        "data": {
            "recent_searches": results
        },
        "meta": {
            "count": len(results)
        }
    }
