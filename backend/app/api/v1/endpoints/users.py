"""
사용자 관련 API 엔드포인트

담당 기능:
- 최근 본 아파트 목록 조회 (GET /users/me/recent-views) - P1
- 최근 본 아파트 기록 저장 (POST /users/me/recent-views) - P1
- UI 개인화 설정 (GET/PUT /users/me/ui-preferences)
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_current_user
from app.models.account import Account
from app.crud.recent_view import recent_view as recent_view_crud
from app.schemas.recent_view import RecentViewCreate, RecentViewResponse
from app.schemas.ui_preferences import UiPreferencesResponse, UiPreferencesUpdateRequest, UiPreferences


router = APIRouter()


@router.get(
    "/me/recent-views",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Users (사용자)"],
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


@router.post(
    "/me/recent-views",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    tags=[" Users (사용자)"],
    summary="최근 본 아파트 기록 저장",
    description="아파트 상세 페이지를 방문했을 때 조회 기록을 저장합니다. 같은 아파트를 다시 보면 기존 기록의 조회 시간만 업데이트됩니다.",
    responses={
        201: {"description": "저장 성공"},
        400: {"description": "잘못된 요청 (apt_id가 유효하지 않음)"},
        401: {"description": "로그인이 필요합니다"},
        404: {"description": "아파트를 찾을 수 없습니다"}
    }
)
async def create_recent_view(
    request: RecentViewCreate = Body(..., description="아파트 ID"),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    최근 본 아파트 기록 저장 API
    
    아파트 상세 페이지를 방문했을 때 호출하여 조회 기록을 저장합니다.
    같은 아파트를 이미 본 기록이 있으면 기존 레코드의 viewed_at만 업데이트합니다.
    
    Args:
        request: 아파트 ID를 포함한 요청 데이터
        current_user: 현재 로그인한 사용자 (의존성 주입)
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "data": {
                "view_id": int,
                "apt_id": int,
                "viewed_at": str  # ISO 8601 형식
            }
        }
    
    Raises:
        HTTPException: 
            - 400: apt_id가 유효하지 않은 경우
            - 401: 로그인이 필요한 경우
            - 404: 아파트를 찾을 수 없는 경우
    """
    # 아파트 존재 여부 확인
    from app.crud.apartment import apartment as apartment_crud
    apartment = await apartment_crud.get(db, id=request.apt_id)
    if not apartment or apartment.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="아파트를 찾을 수 없습니다"
        )
    
    # 최근 본 아파트 기록 생성 또는 업데이트
    recent_view = await recent_view_crud.create_or_update(
        db,
        account_id=current_user.account_id,
        apt_id=request.apt_id
    )
    
    return {
        "success": True,
        "data": {
            "view_id": recent_view.view_id,
            "apt_id": recent_view.apt_id,
            "viewed_at": recent_view.viewed_at.isoformat() if recent_view.viewed_at else None
        }
    }


@router.delete(
    "/me/recent-views/{view_id}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Users (사용자)"],
    summary="최근 본 아파트 기록 삭제",
    description="특정 최근 본 아파트 기록을 삭제합니다.",
    responses={
        200: {"description": "삭제 성공"},
        401: {"description": "로그인이 필요합니다"},
        404: {"description": "기록을 찾을 수 없습니다"}
    }
)
async def delete_recent_view(
    view_id: int,
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    최근 본 아파트 기록 삭제 API
    
    특정 최근 본 아파트 기록을 삭제합니다.
    
    Args:
        view_id: 삭제할 기록 ID
        current_user: 현재 로그인한 사용자 (의존성 주입)
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "message": "기록이 삭제되었습니다"
        }
    
    Raises:
        HTTPException: 
            - 401: 로그인이 필요한 경우
            - 404: 기록을 찾을 수 없는 경우
    """
    # 기록 조회 및 권한 확인
    view = await recent_view_crud.get(db, id=view_id)
    if not view or view.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기록을 찾을 수 없습니다"
        )
    
    if view.account_id != current_user.account_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이 기록을 삭제할 권한이 없습니다"
        )
    
    # 기록 삭제 (soft delete)
    from datetime import datetime
    view.is_deleted = True
    view.updated_at = datetime.utcnow()
    db.add(view)
    await db.commit()
    
    return {
        "success": True,
        "message": "기록이 삭제되었습니다"
    }


@router.delete(
    "/me/recent-views",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Users (사용자)"],
    summary="최근 본 아파트 전체 삭제",
    description="로그인한 사용자의 모든 최근 본 아파트 기록을 삭제합니다.",
    responses={
        200: {"description": "전체 삭제 성공"},
        401: {"description": "로그인이 필요합니다"}
    }
)
async def delete_all_recent_views(
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    최근 본 아파트 전체 삭제 API
    
    로그인한 사용자의 모든 최근 본 아파트 기록을 삭제합니다.
    
    Args:
        current_user: 현재 로그인한 사용자 (의존성 주입)
        db: 데이터베이스 세션
    
    Returns:
        {
            "success": true,
            "message": "모든 기록이 삭제되었습니다",
            "deleted_count": int
        }
    
    Raises:
        HTTPException: 
            - 401: 로그인이 필요한 경우
    """
    # 사용자의 모든 기록 조회
    all_views = await recent_view_crud.get_by_account(
        db,
        account_id=current_user.account_id,
        limit=100  # 충분히 큰 수로 설정
    )
    
    # 모든 기록 삭제 (soft delete)
    from datetime import datetime
    now = datetime.utcnow()
    deleted_count = 0
    for view in all_views:
        view.is_deleted = True
        view.updated_at = now
        db.add(view)
        deleted_count += 1
    await db.commit()
    
    return {
        "success": True,
        "message": "모든 기록이 삭제되었습니다",
        "deleted_count": deleted_count
    }


# ============================================================
# UI 개인화 설정 (대시보드)
# ============================================================

@router.get(
    "/me/ui-preferences",
    response_model=UiPreferencesResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Users (사용자)"],
    summary="내 UI 개인화 설정 조회",
    description="로그인한 사용자의 UI 개인화 설정을 조회합니다. (대시보드 하단 좌측/우측 카드 뷰)",
    responses={
        200: {"description": "조회 성공"},
        401: {"description": "로그인이 필요합니다"},
    },
)
async def get_ui_preferences(
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 좌측 카드 뷰 가져오기 (없으면 기본값, 컬럼이 없을 수도 있음)
    left_view = 'policyNews'  # 기본값
    if hasattr(current_user, 'dashboard_left_panel_view'):
        left_view = getattr(current_user, 'dashboard_left_panel_view', 'policyNews')
        if not left_view:
            left_view = 'policyNews'
    
    return {
        "success": True,
        "data": UiPreferences(
            left_panel_view=left_view,
            bottom_panel_view=current_user.dashboard_bottom_panel_view,  # 하위 호환성
            right_panel_view=current_user.dashboard_bottom_panel_view,
        ),
    }


@router.put(
    "/me/ui-preferences",
    response_model=UiPreferencesResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Users (사용자)"],
    summary="내 UI 개인화 설정 저장",
    description="로그인한 사용자의 UI 개인화 설정을 저장합니다. (대시보드 하단 좌측/우측 카드 뷰)",
    responses={
        200: {"description": "저장 성공"},
        401: {"description": "로그인이 필요합니다"},
    },
)
async def update_ui_preferences(
    payload: UiPreferencesUpdateRequest = Body(..., description="저장할 UI 설정"),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 좌측 카드 뷰 업데이트 (컬럼이 존재하는 경우에만)
    if payload.left_panel_view is not None:
        if hasattr(current_user, 'dashboard_left_panel_view'):
            current_user.dashboard_left_panel_view = payload.left_panel_view
        # 컬럼이 없으면 무시 (마이그레이션 전 환경 대응)
    
    # 우측 카드 뷰 업데이트 (right_panel_view 우선, 없으면 bottom_panel_view 사용)
    right_view = payload.right_panel_view or payload.bottom_panel_view
    if right_view is not None:
        current_user.dashboard_bottom_panel_view = right_view
    
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    # 좌측 카드 뷰 가져오기 (없으면 기본값, 컬럼이 없을 수도 있음)
    left_view = 'policyNews'  # 기본값
    if hasattr(current_user, 'dashboard_left_panel_view'):
        left_view = getattr(current_user, 'dashboard_left_panel_view', 'policyNews')
        if not left_view:
            left_view = 'policyNews'
    
    return {
        "success": True,
        "data": UiPreferences(
            left_panel_view=left_view,
            bottom_panel_view=current_user.dashboard_bottom_panel_view,  # 하위 호환성
            right_panel_view=current_user.dashboard_bottom_panel_view,
        ),
    }
