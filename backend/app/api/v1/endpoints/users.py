"""
사용자 관련 API 엔드포인트

담당 기능:
- 최근 본 아파트 목록 조회 (GET /users/me/recent-views) - P1
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_current_user
from app.models.account import Account
from app.crud.recent_view import recent_view as recent_view_crud
from app.schemas.recent_view import RecentViewCreate, RecentViewResponse


router = APIRouter()


@router.get(
    "/me/recent-views",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["👤 Users (사용자)"],
    summary="최근 본 아파트 목록 조회",
    description="로그인한 사용자가 최근에 본 아파트 목록을 조회합니다. 아파트 상세 페이지를 방문한 기록을 시간순(최신순)으로 반환합니다.",
    responses={
        200: {"description": "조회 성공"},
        401: {"description": "로그인이 필요합니다"}
    }
)
async def get_recent_views(
    limit: int = Query(20, ge=1, le=50, description="최대 개수 (기본 20개, 최대 50개)"),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    최근 본 아파트 목록 조회 API
    
    로그인한 사용자가 최근에 본 아파트 목록을 시간순(최신순)으로 반환합니다.
    아파트 상세 정보도 함께 포함됩니다.
    
    Args:
        limit: 반환할 최대 개수 (기본 20개, 최대 50개)
        current_user: 현재 로그인한 사용자 (의존성 주입)
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "data": {
                "recent_views": [
                    {
                        "view_id": int,
                        "apt_id": int,
                        "viewed_at": str,  # ISO 8601 형식
                        "apartment": {
                            "apt_id": int,
                            "apt_name": str,
                            "kapt_code": str,
                            "region_name": str,
                            "city_name": str
                        }
                    }
                ],
                "total": int
            }
        }
    
    Raises:
        HTTPException: 로그인이 필요한 경우 401 에러
    """
    # 최근 본 아파트 목록 조회
    recent_views = await recent_view_crud.get_by_account(
        db,
        account_id=current_user.account_id,
        limit=limit
    )
    
    # 응답 데이터 변환
    view_list = []
    for view in recent_views:
        apartment_info = None
        if view.apartment:
            apartment_info = {
                "apt_id": view.apartment.apt_id,
                "apt_name": view.apartment.apt_name,
                "kapt_code": view.apartment.kapt_code,
                "region_name": view.apartment.region.region_name if view.apartment.region else None,
                "city_name": view.apartment.region.city_name if view.apartment.region else None
            }
        
        view_list.append({
            "view_id": view.view_id,
            "apt_id": view.apt_id,
            "viewed_at": view.viewed_at.isoformat() if view.viewed_at else None,
            "apartment": apartment_info
        })
    
    return {
        "success": True,
        "data": {
            "recent_views": view_list,
            "total": len(view_list)
        }
    }
