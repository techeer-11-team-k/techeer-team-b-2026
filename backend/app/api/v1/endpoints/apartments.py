"""
아파트 관련 API 엔드포인트

담당 기능:
- 아파트 검색 (GET /apartments/search)
- 아파트 기본 정보 조회 (GET /apartments/{apt_id})
- 아파트 상세 정보 조회 (GET /apartments/{apt_id}/detail)
"""

import logging
import traceback
from functools import wraps
from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.services.apartment import apartment_service  # 인스턴스 import
from app.schemas.apartment import (
    AptBasicInfo,
    AptDetailInfo
)
from app.core.exceptions import NotFoundException, ExternalAPIException
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

def handle_apartment_errors(func):
    """
    에러 처리 규칙:
    - NotFoundException, ExternalAPIException → 이미 HTTPException이므로 그대로 전달
    - 기타 Exception → 500 (서버 내부 오류)
    
    사용 예시:
        @router.get("/{apt_id}")
        @handle_apartment_errors
        async def get_apartment_info(...):
            apt_info = await apartment_service.get_apartment_basic_info(...)
            return apt_info
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except (NotFoundException, ExternalAPIException):
            # 이미 HTTPException을 상속받은 예외이므로 그대로 전달
            raise
        except Exception as e:
            # 예상치 못한 예외 처리 - 로깅 및 상세 정보 제공
            error_type = type(e).__name__
            error_message = str(e)
            error_traceback = traceback.format_exc()
            
            # 에러 로깅
            logger.error(
                f"엔드포인트에서 예상치 못한 에러 발생: {error_type}",
                exc_info=True,
                extra={
                    "error_type": error_type,
                    "error_message": error_message,
                    "traceback": error_traceback
                }
            )
            
            # 개발 환경에서는 상세 에러 정보 제공
            if settings.DEBUG or settings.ENVIRONMENT == "development":
                detail = {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": f"서버 내부 오류가 발생했습니다: {error_type}",
                    "error": error_message,
                    "traceback": error_traceback.split('\n')[-10:] if error_traceback else None  # 마지막 10줄만
                }
            else:
                # 프로덕션 환경에서는 일반적인 메시지만
                detail = {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "서버 내부 오류가 발생했습니다."
                }
            
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=detail
            )
    
    return wrapper

@router.get(
    "/{apt_id}",
    response_model=AptBasicInfo,  # 응답 스키마
    summary="아파트 기본 정보",
    description="아파트의 기본 정보를 조회합니다."
)
@handle_apartment_errors
async def get_apartment_info(
    apt_id: str = Path(..., description="아파트 단지 코드 (kapt_code)", min_length=1, examples=["A10027875"]),
    db: AsyncSession = Depends(get_db)
):
    """
    ## 아파트 기본 정보 조회 API
    
    ### Path Parameter
    - **apt_id**: 아파트 단지 코드 (kapt_code)
    
    ### Response
    - 성공: 아파트 기본 정보 반환
    - 실패: 404 (아파트를 찾을 수 없음) 또는 503 (외부 API 오류)
    """
    apt_info = await apartment_service.get_apartment_basic_info(db, kapt_code=apt_id)
    return apt_info


@router.get(
    "/{apt_id}/detail",
    response_model=AptDetailInfo,  # 응답 스키마
    summary="아파트 상세 정보",
    description="아파트의 상세 정보를 조회합니다."
)
@handle_apartment_errors
async def get_apartment_detail_info(
    apt_id: str = Path(..., description="아파트 단지 코드 (kapt_code)", min_length=1, examples=["A10027875"]),
    db: AsyncSession = Depends(get_db)
):
    """
    ## 아파트 상세 정보 조회 API
    
    ### Path Parameter
    - **apt_id**: 아파트 단지 코드 (kapt_code)
    
    ### Response
    - 성공: 아파트 상세 정보 반환
    - 실패: 404 (아파트를 찾을 수 없음) 또는 503 (외부 API 오류)
    """
    apt_detail = await apartment_service.get_apartment_detail_info(db, kapt_code=apt_id)
    return apt_detail