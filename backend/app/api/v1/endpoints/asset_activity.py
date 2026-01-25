"""
자산 활동 내역 로그 API 엔드포인트

사용자의 아파트 추가/삭제 및 가격 변동 이력을 조회하는 API입니다.
"""
import logging
import sys
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.api.v1.deps import get_db, get_current_user
from app.models.account import Account
from app.models.asset_activity_log import AssetActivityLog
from app.models.apartment import Apartment
from app.schemas.asset_activity_log import (
    AssetActivityLogResponse,
    AssetActivityLogListResponse
)
from app.services.asset_activity_service import get_user_activity_logs


def to_naive_datetime(dt: datetime) -> datetime:
    """
    타임존 인식 datetime을 타임존 비인식 datetime으로 변환
    
    PostgreSQL의 TIMESTAMP WITHOUT TIME ZONE을 사용하므로
    모든 datetime을 타임존 비인식으로 통일해야 합니다.
    """
    if dt.tzinfo is not None:
        # 타임존 정보가 있으면 제거 (UTC로 변환 후 타임존 정보 제거)
        return dt.replace(tzinfo=None)
    return dt

router = APIRouter()

# 로거 설정
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)


@router.get(
    "",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["📋 Asset Activity (자산 활동)"],
    summary="자산 활동 로그 조회",
    description="""
    현재 로그인한 사용자의 자산 활동 내역을 조회합니다.
    
    ### 기본값
    - `start_date`: 현재 날짜 (오늘)
    - `end_date`: 현재에서 1년 전 (기본값, 파라미터로 변경 가능)
    - `category`: MY_ASSET, INTEREST 모두 포함 (필터링은 프론트엔드에서)
    - `event_type`: 모든 이벤트 타입 포함 (필터링은 프론트엔드에서)
    - `limit`: 최대 개수 (기본값: 100, 최대: 1000)
    - `skip`: 건너뛸 개수 (기본값: 0)
    
    ### 정렬
    - 최신순으로 정렬됩니다 (created_at DESC)
    """,
    responses={
        200: {
            "description": "활동 로그 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "logs": [
                                {
                                    "id": 1,
                                    "account_id": 1,
                                    "apt_id": 12345,
                                    "category": "MY_ASSET",
                                    "event_type": "ADD",
                                    "price_change": None,
                                    "previous_price": None,
                                    "current_price": 85000,
                                    "created_at": "2026-01-25T10:00:00Z",
                                    "metadata": None,
                                    "apt_name": "래미안 강남파크",
                                    "kapt_code": "A1234567890"
                                }
                            ],
                            "total": 1,
                            "limit": 100,
                            "skip": 0
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
async def get_activity_logs(
    start_date: Optional[datetime] = Query(
        None,
        description="시작 날짜 (ISO 8601 형식, 기본값: 현재에서 1년 전)"
    ),
    end_date: Optional[datetime] = Query(
        None,
        description="종료 날짜 (ISO 8601 형식, 기본값: 현재 날짜)"
    ),
    limit: int = Query(
        100,
        description="최대 개수",
        ge=1,
        le=1000
    ),
    skip: int = Query(
        0,
        description="건너뛸 개수",
        ge=0
    ),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    자산 활동 로그 조회
    
    현재 로그인한 사용자의 활동 로그를 조회합니다.
    기본값: 시작 날짜는 1년 전, 종료 날짜는 현재, 모든 카테고리와 이벤트 타입 포함.
    """
    try:
        # 기본값 설정
        # 시작 날짜: 파라미터가 없으면 현재에서 1년 전 (과거)
        if start_date is None:
            start_date = datetime.now() - timedelta(days=365)
        else:
            # 파라미터로 받은 start_date가 타임존 인식이면 비인식으로 변환
            start_date = to_naive_datetime(start_date)
        
        # 종료 날짜: 파라미터가 없으면 현재 날짜 (오늘)
        if end_date is None:
            end_date = datetime.now()
        else:
            # 파라미터로 받은 end_date가 타임존 인식이면 비인식으로 변환
            end_date = to_naive_datetime(end_date)
        
        # 타임존 비인식으로 통일 (데이터베이스와 호환성 유지)
        start_date = to_naive_datetime(start_date)
        end_date = to_naive_datetime(end_date)
        
        # 활동 로그 조회 (카테고리와 이벤트 타입 필터링 없음 - 모든 데이터 조회)
        logs = await get_user_activity_logs(
            db,
            account_id=current_user.account_id,
            category=None,  # 모든 카테고리 포함
            event_type=None,  # 모든 이벤트 타입 포함
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            skip=skip
        )
        
        # 총 개수 조회 (날짜 필터만 적용)
        count_query = select(func.count(AssetActivityLog.id)).where(
            AssetActivityLog.account_id == current_user.account_id,
            AssetActivityLog.created_at >= start_date,
            AssetActivityLog.created_at <= end_date
        )
        
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
        
        # 아파트 정보 포함하여 응답 데이터 구성
        logs_data = []
        for log in logs:
            # 아파트 정보 조회 (lazy loading 방지)
            apt_name = None
            kapt_code = None
            if log.apt_id:
                apt_result = await db.execute(
                    select(Apartment).where(Apartment.apt_id == log.apt_id)
                )
                apartment = apt_result.scalar_one_or_none()
                if apartment:
                    apt_name = apartment.apt_name
                    kapt_code = apartment.kapt_code
            
            logs_data.append({
                "id": log.id,
                "account_id": log.account_id,
                "apt_id": log.apt_id,
                "category": log.category,
                "event_type": log.event_type,
                "price_change": log.price_change,
                "previous_price": log.previous_price,
                "current_price": log.current_price,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "metadata": log.meta_data,  # 모델 필드명은 meta_data이지만 API 응답은 metadata로 유지
                "apt_name": apt_name,
                "kapt_code": kapt_code
            })
        
        logger.info(
            f"✅ 활동 로그 조회 완료 - "
            f"account_id: {current_user.account_id}, "
            f"결과: {len(logs_data)}개, 총: {total}개"
        )
        
        return {
            "success": True,
            "data": {
                "logs": logs_data,
                "total": total,
                "limit": limit,
                "skip": skip
            }
        }
    
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        
        logger.error(
            f"❌ 활동 로그 조회 실패 - "
            f"account_id: {current_user.account_id}, "
            f"에러: {error_type}: {error_message}",
            exc_info=True
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"활동 로그 조회 중 오류가 발생했습니다: {error_type}: {error_message}"
        )
