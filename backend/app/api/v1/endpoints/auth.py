"""
인증 관련 API 엔드포인트

Clerk 인증을 사용하므로:
- 회원가입/로그인: Clerk에서 처리 (백엔드 API 불필요)
- 웹훅: Clerk → 백엔드 사용자 동기화
- 프로필: 백엔드에서 조회/수정
"""
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request, Body
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
from app.utils.cache import (
    get_from_cache,
    set_to_cache,
    delete_from_cache,
    get_user_profile_cache_key
)

router = APIRouter()


@router.post(
    "/webhook",
    status_code=status.HTTP_200_OK,
    tags=[" Auth (인증)"],
    summary="Clerk 웹훅 - 사용자 동기화",
    description="""
    Clerk에서 사용자 생성/업데이트/삭제 이벤트를 받아 백엔드 DB와 동기화합니다.
    
    ### 처리 이벤트
    - **user.created**: 새 사용자가 Clerk에서 생성되면 백엔드 DB의 `accounts` 테이블에 자동으로 추가됩니다.
    - **user.updated**: 사용자 정보가 Clerk에서 업데이트되면 백엔드 DB도 동기화됩니다.
    - **user.deleted**: 사용자가 Clerk에서 삭제되면 백엔드 DB에서 소프트 삭제(`is_deleted = True`)됩니다.
    
    ### 웹훅 설정 방법
    1. Clerk Dashboard → Webhooks에서 엔드포인트 등록
    2. 엔드포인트 URL: `https://your-api.com/api/v1/auth/webhook`
    3. 이벤트 선택: `user.created`, `user.updated`, `user.deleted`
    4. Webhook Secret을 환경변수 `CLERK_WEBHOOK_SECRET`에 설정
    
    ### 보안
    - `svix_signature` 헤더를 사용하여 요청이 실제로 Clerk에서 온 것인지 검증합니다.
    - 서명 검증 실패 시 401 에러를 반환합니다.
    """,
    responses={
        200: {
            "description": "웹훅 처리 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "message": "사용자가 생성되었습니다.",
                            "user_id": 1
                        }
                    }
                }
            }
        },
        401: {
            "description": "웹훅 서명 검증 실패",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {
                            "code": "INVALID_WEBHOOK_SIGNATURE",
                            "message": "웹훅 서명이 유효하지 않습니다."
                        }
                    }
                }
            }
        },
        400: {
            "description": "잘못된 웹훅 데이터 (예: 이메일 없음)",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {
                            "code": "MISSING_EMAIL",
                            "message": "이메일 주소가 없습니다."
                        }
                    }
                }
            }
        }
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
    
    # 닉네임 추출 (소셜 로그인 지원)
    # 우선순위: username > first_name + last_name > first_name > 이메일 앞부분
    nickname = None
    
    # 1. username이 있으면 사용 (사용자가 직접 설정한 경우)
    if user_data.username:
        nickname = user_data.username
    # 2. first_name과 last_name이 있으면 조합 (소셜 로그인 시)
    elif user_data.first_name or user_data.last_name:
        first_name = user_data.first_name or ""
        last_name = user_data.last_name or ""
        nickname = f"{first_name} {last_name}".strip()
    # 3. first_name만 있으면 사용
    elif user_data.first_name:
        nickname = user_data.first_name
    # 4. 이메일 앞부분 사용 (기본값)
    else:
        nickname = email.split("@")[0] if email else "사용자"
    
    # 닉네임이 없거나 비어있으면 기본값 설정
    if not nickname or not nickname.strip():
        nickname = email.split("@")[0] if email else "사용자"
    
    # 닉네임 길이 제한 (DB 필드 크기에 맞춤: 최대 50자)
    nickname = nickname[:50] if nickname else "사용자"
    
    if event.type == "user.created":
        # 새 사용자 생성
        user = await auth_service.sync_user_from_clerk(
            db,
            clerk_user_id=clerk_user_id,
            email=email,
            nickname=nickname,
            profile_image_url=user_data.image_url
        )
        # 새 사용자 생성 시 캐시는 없으므로 무효화 불필요
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
        # 사용자 정보 업데이트 시 캐시 무효화
        cache_key = get_user_profile_cache_key(user.account_id)
        await delete_from_cache(cache_key)
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
        if user:
            # 소프트 삭제 구현 (is_deleted = True)
            user.is_deleted = True
            db.add(user)
            await db.commit()
            return {
                "success": True,
                "data": {
                    "message": "사용자가 삭제되었습니다.",
                    "user_id": user.account_id
                }
            }
        else:
            # 사용자가 이미 없거나 삭제된 경우
            return {
                "success": True,
                "data": {
                    "message": "사용자가 이미 삭제되었거나 존재하지 않습니다."
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
    tags=[" Auth (인증)"],
    summary="내 프로필 조회",
    description="""
    현재 로그인한 사용자의 프로필 정보를 조회합니다.
    
    ### 인증
    - Clerk JWT 토큰이 필요합니다.
    - Authorization 헤더에 `Bearer {token}` 형식으로 전달하세요.
    - 사용자가 DB에 없으면 JWT 토큰 정보를 기반으로 자동 생성됩니다.
    
    ### 응답 데이터
    - `account_id`: 계정 ID (PK)
    - `clerk_user_id`: Clerk 사용자 ID
    - `email`: 이메일 주소 (Clerk에서 동기화)
    - `created_at`: 가입일
    """,
    responses={
        200: {
            "description": "조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                        "account_id": 1,
                        "clerk_user_id": "user_2abc123def456",
                        "email": "user@example.com",
                        "created_at": "2026-01-01T00:00:00Z"
                        }
                    }
                }
            }
        },
        401: {
            "description": "로그인이 필요합니다 (토큰 없음 또는 유효하지 않음)",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {
                            "code": "MISSING_TOKEN",
                            "message": "인증 토큰이 필요합니다."
                        }
                    }
                }
            }
        }
    }
)
async def get_my_profile(
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    내 프로필 조회 API
    
    Clerk로 로그인한 사용자의 프로필 정보를 반환합니다.
    Redis 캐싱을 사용하여 성능을 최적화합니다.
    
    ### Response
    - account_id: 계정 ID
    - clerk_user_id: Clerk 사용자 ID
    - email: 이메일
    - created_at: 가입일
    """
    from app.schemas.account import AccountBase
    
    account_id = current_user.account_id
    
    # 캐시 키 생성
    cache_key = get_user_profile_cache_key(account_id)
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        # 캐시 히트: 캐시된 데이터를 AccountBase로 변환하여 반환
        # is_dark_mode가 없으면 기본값 True 사용
        if "is_dark_mode" not in cached_data:
            cached_data["is_dark_mode"] = True
        user_data = AccountBase(**cached_data)
        return {
            "success": True,
            "data": user_data
        }
    
    # 2. 캐시 미스: 데이터베이스에서 조회
    # Account 모델을 AccountBase 스키마로 변환
    user_data = AccountBase(
        account_id=current_user.account_id,
        clerk_user_id=current_user.clerk_user_id,
        email=current_user.email,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
        is_deleted=current_user.is_deleted,
        is_dark_mode=current_user.is_dark_mode
    )
    
    # 3. 캐시에 저장 (TTL: 1시간)
    user_data_dict = {
        "account_id": user_data.account_id,
        "clerk_user_id": user_data.clerk_user_id,
        "email": user_data.email,
        "is_admin": user_data.is_admin,
        "created_at": user_data.created_at.isoformat() if user_data.created_at else None,
        "updated_at": user_data.updated_at.isoformat() if user_data.updated_at else None,
        "is_deleted": user_data.is_deleted,
        "is_dark_mode": user_data.is_dark_mode
    }
    await set_to_cache(cache_key, user_data_dict, ttl=3600)
    
    return {
        "success": True,
        "data": user_data
    }


@router.patch(
    "/me",
    response_model=AccountResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Auth (인증)"],
    summary="내 프로필 수정",
    description="""
    현재 로그인한 사용자의 프로필 정보를 수정합니다.
    
    ### 수정 불가능한 필드
    - **email**: 이메일은 Clerk에서 관리하므로 수정할 수 없습니다.
    - **clerk_user_id**: Clerk 사용자 ID는 변경할 수 없습니다.
    
    ### 인증
    - Clerk JWT 토큰이 필요합니다.
    - Authorization 헤더에 `Bearer {token}` 형식으로 전달하세요.
    """,
    responses={
        200: {
            "description": "수정 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                        "account_id": 1,
                        "clerk_user_id": "user_2abc123def456",
                        "email": "user@example.com",
                        "created_at": "2026-01-01T00:00:00Z"
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
                            "code": "MISSING_TOKEN",
                            "message": "인증 토큰이 필요합니다."
                        }
                    }
                }
            }
        },
    }
)
async def update_my_profile(
    profile_update: AccountUpdate = Body(
        ...,
        description="수정할 프로필 정보"
    ),
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    내 프로필 수정 API
    
    이메일은 Clerk에서 관리하므로 수정할 수 없습니다.
    프로필 수정 시 캐시를 무효화하여 최신 데이터를 보장합니다.
    
    ### Response
    - 수정된 사용자 정보
    """
    updated_user = await auth_service.update_profile(
        db,
        user=current_user,
        profile_update=profile_update
    )
    
    # 캐시 무효화 (프로필이 변경되었으므로 캐시 삭제)
    cache_key = get_user_profile_cache_key(current_user.account_id)
    await delete_from_cache(cache_key)
    
    return {
        "success": True,
        "data": updated_user
    }
