"""
최근 검색어 삭제 API

담당자: 박찬영
API 번호: 20
엔드포인트: DELETE /api/v1/search/recent/{id}

기능:
- 로그인한 사용자의 특정 최근 검색어를 삭제합니다
- 사용자가 검색 기록을 개별적으로 삭제할 때 사용합니다
- 본인의 검색 기록만 삭제할 수 있습니다

레이어드 아키텍처:
- API Layer (이 파일): 요청/응답 처리, Swagger 문서화
- Service Layer (services/search.py): 비즈니스 로직
- CRUD Layer (crud/recent_search.py): DB 작업
- Model Layer (models/recent_search.py): 데이터 모델
"""
from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_current_user
from app.models.account import Account
from app.services.search import search_service

router = APIRouter()


@router.delete(
    "/recent/{search_id}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🔍 Search (검색)"],
    summary="최근 검색어 삭제",
    description="특정 최근 검색어를 삭제합니다. 사용자가 검색 기록을 개별적으로 삭제할 때 사용합니다. 본인의 검색 기록만 삭제할 수 있습니다.",
    dependencies=[Depends(get_current_user)],  # Swagger UI에서 인증 필요 표시
    responses={
        200: {
            "description": "삭제 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "message": "검색어가 삭제되었습니다."
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
        },
        404: {
            "description": "검색어를 찾을 수 없습니다",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {
                            "code": "SEARCH_NOT_FOUND",
                            "message": "검색어를 찾을 수 없거나 본인의 검색 기록이 아닙니다."
                        }
                    }
                }
            }
        }
    }
)
async def delete_recent_search(
    search_id: int = Path(
        ...,
        description="삭제할 검색어 ID",
        example=1,
        gt=0
    ),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    최근 검색어 삭제 API
    
    로그인한 사용자의 특정 검색 기록을 삭제합니다.
    본인의 검색 기록만 삭제할 수 있습니다.
    
    Args:
        search_id: 삭제할 검색어 ID (경로 파라미터)
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
    
    Note:
        - 로그인한 사용자만 사용 가능
        - 본인의 검색 기록만 삭제 가능
        - 소프트 삭제 방식 사용 (is_deleted 플래그 설정)
        - 삭제된 검색 기록은 조회되지 않음
    """
    # Service 레이어를 통해 비즈니스 로직 처리
    # 엔드포인트는 최소한의 로직만 포함하고, 복잡한 처리는 Service에 위임
    try:
        await search_service.delete_recent_search(
            db=db,
            search_id=search_id,
            account_id=current_user.account_id
        )
    except ValueError as e:
        # 검색어를 찾을 수 없거나 본인의 검색 기록이 아닌 경우
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SEARCH_NOT_FOUND",
                "message": str(e)
            }
        )
    
    # 공통 응답 형식으로 반환
    return {
        "success": True,
        "data": {
            "message": "검색어가 삭제되었습니다."
        }
    }
