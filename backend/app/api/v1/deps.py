"""
의존성 주입 (Dependency Injection)

FastAPI의 Depends를 사용하여:
- 데이터베이스 세션 관리
- Clerk 인증 검증
- 현재 사용자 조회
"""
from typing import Generator, Optional
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.core.clerk import verify_clerk_token, get_clerk_user
from app.crud.account import account as account_crud
from app.models.account import Account

# HTTP Bearer 토큰 스키마
security = HTTPBearer(auto_error=False)


async def get_db() -> Generator:
    """
    데이터베이스 세션 의존성
    
    각 요청마다 DB 세션을 생성하고, 요청 끝나면 자동으로 닫습니다.
    
    Yields:
        AsyncSession: 데이터베이스 세션
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Account:
    """
    현재 로그인한 사용자 조회 (Clerk 인증)
    
    Authorization 헤더에서 Clerk 세션 토큰을 받아 검증하고,
    사용자 정보를 반환합니다.
    
    Args:
        db: 데이터베이스 세션
        credentials: HTTP Bearer 토큰 (Clerk 세션 토큰)
    
    Returns:
        Account: 현재 로그인한 사용자 객체
    
    Raises:
        HTTPException: 인증 실패 시 401 에러
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "MISSING_TOKEN",
                "message": "인증 토큰이 필요합니다."
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Clerk 토큰 검증
    token_payload = await verify_clerk_token(
        authorization=f"Bearer {credentials.credentials}"
    )
    
    if not token_payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_TOKEN",
                "message": "유효하지 않은 인증 토큰입니다."
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Clerk에서 사용자 정보 조회 (sub 클레임에 user_id가 있음)
    clerk_user_id = token_payload.get("sub")
    if not clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_TOKEN",
                "message": "토큰에 사용자 정보가 없습니다."
            }
        )
    
    # DB에서 사용자 조회
    user = await account_crud.get_by_clerk_user_id(
        db,
        clerk_user_id=clerk_user_id
    )
    
    if not user:
        # 사용자가 없으면 JWT 토큰 정보를 사용하여 자동 생성
        # (Webhook이 아직 도착하지 않았거나, 로컬 개발 환경인 경우)
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"사용자가 DB에 없음, 자동 생성 시작: {clerk_user_id}")
        
        # JWT 토큰에서 이메일 추출 (Clerk JWT의 email 클레임 또는 기본값 사용)
        email = token_payload.get("email")
        if not email:
            # 이메일이 없으면 clerk_user_id 기반으로 임시 이메일 생성
            email = f"{clerk_user_id}@clerk.user"
        
        # 닉네임 추출 (우선순위: username > first_name > 이메일 앞부분)
        nickname = (
            token_payload.get("username") or 
            token_payload.get("first_name") or 
            email.split("@")[0] if "@" in email else "사용자"
        )
        # 닉네임 길이 제한 (DB 필드 크기에 맞춤)
        nickname = nickname[:50] if nickname else "사용자"
        
        # 프로필 이미지 URL (JWT에 있을 수 있음)
        profile_image_url = token_payload.get("image_url") or token_payload.get("picture")
        
        try:
            # 새 사용자 생성
            user = await account_crud.create_from_clerk(
                db,
                clerk_user_id=clerk_user_id,
                email=email,
                nickname=nickname,
                profile_image_url=profile_image_url
            )
            logger.info(f"사용자 자동 생성 완료: {user.account_id}")
        except Exception as e:
            logger.error(f"사용자 자동 생성 실패: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "code": "USER_CREATION_FAILED",
                    "message": f"사용자 생성에 실패했습니다: {str(e)}"
                }
            )
    
    # 마지막 로그인 시간 업데이트
    await account_crud.update_last_login(db, clerk_user_id=clerk_user_id)
    
    return user


async def get_current_user_optional(
    db: AsyncSession = Depends(get_db),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[Account]:
    """
    선택적 인증 (로그인 안 해도 되는 API용)
    
    토큰이 있으면 사용자 정보 반환, 없으면 None.
    
    Args:
        db: 데이터베이스 세션
        credentials: HTTP Bearer 토큰 (선택)
    
    Returns:
        Account 또는 None
    """
    if not credentials:
        return None
    
    try:
        return await get_current_user(db, credentials)
    except HTTPException:
        return None
