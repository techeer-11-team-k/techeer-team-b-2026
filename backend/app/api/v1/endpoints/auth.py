"""
인증 관련 API 엔드포인트

Clerk 인증을 사용하므로:
- 회원가입/로그인: Clerk에서 처리 (백엔드 API 불필요)
- 웹훅: Clerk → 백엔드 사용자 동기화
- 프로필: 백엔드에서 조회/수정
"""
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_current_user
from app.schemas.account import (
    AccountResponse,
    AccountUpdate,
    ClerkWebhookEvent
)
from app.services.auth import auth_service
from app.models.account import Account
from app.core.clerk import verify_webhook_signature

router = APIRouter()


@router.post(
    "/webhook",
    status_code=status.HTTP_200_OK,
    tags=["🔐 Auth (인증)"],
    summary="Clerk 웹훅",
    description="Clerk에서 사용자 생성/업데이트/삭제 이벤트를 받아 백엔드 DB와 동기화합니다.",
    responses={
        200: {"description": "웹훅 처리 성공"},
        401: {"description": "웹훅 서명 검증 실패"},
        400: {"description": "잘못된 웹훅 데이터"}
    }
)
async def clerk_webhook(
    request: Request,
    event: ClerkWebhookEvent,
    svix_id: str = Header(..., description="Svix 이벤트 ID"),
    svix_timestamp: str = Header(..., description="Svix 타임스탬프"),
    svix_signature: str = Header(..., description="Svix 서명"),
    db: AsyncSession = Depends(get_db)
):
    """
    Clerk 웹훅 엔드포인트
    
    Clerk에서 사용자 관련 이벤트가 발생하면 호출됩니다:
    - user.created: 새 사용자 생성
    - user.updated: 사용자 정보 업데이트
    - user.deleted: 사용자 삭제
    
    ### 웹훅 서명 검증
    - svix_signature 헤더를 사용하여 요청이 실제로 Clerk에서 온 것인지 검증합니다.
    
    ### 처리 이벤트
    - **user.created**: 백엔드 DB에 새 사용자 생성
    - **user.updated**: 백엔드 DB의 사용자 정보 업데이트
    - **user.deleted**: 백엔드 DB의 사용자 소프트 삭제 (is_deleted = True)
    
    ### 설정 방법
    1. Clerk Dashboard → Webhooks에서 엔드포인트 등록
    2. 엔드포인트 URL: `https://your-api.com/api/v1/auth/webhook`
    3. 이벤트 선택: user.created, user.updated, user.deleted
    4. Webhook Secret을 환경변수 CLERK_WEBHOOK_SECRET에 설정
    """
    # 웹훅 서명 검증
    body = await request.body()
    if not verify_webhook_signature(
        payload=body.decode("utf-8"),
        signature=svix_signature
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_WEBHOOK_SIGNATURE",
                "message": "웹훅 서명이 유효하지 않습니다."
            }
        )
    
    # 이벤트 타입에 따라 처리
    user_data = event.data
    clerk_user_id = user_data.id
    
    # 이메일 추출 (첫 번째 이메일 사용)
    email = user_data.email_addresses[0].email_address if user_data.email_addresses else None
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "MISSING_EMAIL",
                "message": "이메일 주소가 없습니다."
            }
        )
    
    # 닉네임 추출 (username 또는 first_name + last_name)
    nickname = user_data.username
    if not nickname and (user_data.first_name or user_data.last_name):
        nickname = f"{user_data.first_name or ''} {user_data.last_name or ''}".strip()
    
    if event.type == "user.created":
        # 새 사용자 생성
        user = await auth_service.sync_user_from_clerk(
            db,
            clerk_user_id=clerk_user_id,
            email=email,
            nickname=nickname,
            profile_image_url=user_data.image_url
        )
        return {
            "success": True,
            "data": {
                "message": "사용자가 생성되었습니다.",
                "user_id": user.account_id
            }
        }
    
    elif event.type == "user.updated":
        # 사용자 정보 업데이트
        user = await auth_service.sync_user_from_clerk(
            db,
            clerk_user_id=clerk_user_id,
            email=email,
            nickname=nickname,
            profile_image_url=user_data.image_url
        )
        return {
            "success": True,
            "data": {
                "message": "사용자 정보가 업데이트되었습니다.",
                "user_id": user.account_id
            }
        }
    
    elif event.type == "user.deleted":
        # 사용자 소프트 삭제
        user = await auth_service.get_user_by_clerk_id(
            db,
            clerk_user_id=clerk_user_id
        )
        # TODO: 소프트 삭제 구현 (is_deleted = True)
        return {
            "success": True,
            "data": {
                "message": "사용자가 삭제되었습니다.",
                "user_id": user.account_id
            }
        }
    
    else:
        # 알 수 없는 이벤트 타입
        return {
            "success": True,
            "data": {
                "message": f"처리되지 않은 이벤트 타입: {event.type}"
            }
        }


@router.get(
    "/me",
    response_model=AccountResponse,
    status_code=status.HTTP_200_OK,
    tags=["🔐 Auth (인증)"],
    summary="내 프로필 조회",
    description="현재 로그인한 사용자의 프로필 정보를 조회합니다.",
    responses={
        200: {"description": "조회 성공"},
        401: {"description": "로그인이 필요합니다"}
    }
)
async def get_my_profile(
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    내 프로필 조회 API
    
    Clerk로 로그인한 사용자의 프로필 정보를 반환합니다.
    
    ### Response
    - account_id: 계정 ID
    - clerk_user_id: Clerk 사용자 ID
    - email: 이메일
    - nickname: 닉네임
    - profile_image_url: 프로필 이미지 URL
    - last_login_at: 마지막 로그인 시간
    - created_at: 가입일
    """
    return {
        "success": True,
        "data": current_user
    }


@router.patch(
    "/me",
    response_model=AccountResponse,
    status_code=status.HTTP_200_OK,
    tags=["🔐 Auth (인증)"],
    summary="내 프로필 수정",
    description="현재 로그인한 사용자의 프로필 정보를 수정합니다.",
    responses={
        200: {"description": "수정 성공"},
        401: {"description": "로그인이 필요합니다"}
    }
)
async def update_my_profile(
    profile_update: AccountUpdate,
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    내 프로필 수정 API
    
    닉네임과 프로필 이미지 URL을 수정할 수 있습니다.
    이메일은 Clerk에서 관리하므로 수정할 수 없습니다.
    
    ### Request Body
    - **nickname**: 닉네임 (선택, 2~20자)
    - **profile_image_url**: 프로필 이미지 URL (선택)
    
    ### Response
    - 수정된 사용자 정보
    """
    updated_user = await auth_service.update_profile(
        db,
        user=current_user,
        profile_update=profile_update
    )
    
    return {
        "success": True,
        "data": updated_user
    }
