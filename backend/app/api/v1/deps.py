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

# 모든 모델을 import하여 SQLAlchemy 관계 설정이 제대로 작동하도록 함
from app.models import (  # noqa: F401
    Account,
    State,
    Apartment,
    ApartDetail,
    Sale,
    Rent,
    HouseScore,
    FavoriteLocation,
    FavoriteApartment,
    MyProperty,
)
from app.models.account import Account

# SQLAlchemy 관계(relationship) 초기화를 위해 모든 모델 import
from app.models import favorite, my_property  # noqa: F401

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


async def get_db_no_auto_commit() -> Generator:
    """
    데이터베이스 세션 의존성 (자동 커밋 없음)
    
    서비스에서 직접 트랜잭션을 관리하는 경우 사용합니다.
    자동 커밋을 하지 않으므로, 서비스에서 반드시 커밋해야 합니다.
    
    Yields:
        AsyncSession: 데이터베이스 세션
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            # 자동 커밋하지 않음 (서비스에서 직접 커밋)
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
        # 사용자가 없으면 JWT 토큰 정보 또는 Clerk API를 사용하여 자동 생성
        # (Webhook이 아직 도착하지 않았거나, 로컬 개발 환경인 경우)
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"사용자가 DB에 없음, 자동 생성 시작: {clerk_user_id}")
        
        # JWT 토큰에서 이메일 추출 시도
        email = token_payload.get("email")
        
        # JWT에 이메일이 없거나 임시 이메일인 경우 Clerk API 호출
        if not email or email.endswith("@clerk.user"):
            logger.info(f"JWT에 실제 이메일이 없음, Clerk API 호출: {clerk_user_id}")
            clerk_user_info = await get_clerk_user(clerk_user_id)
            
            if clerk_user_info:
                # Clerk API에서 가져온 정보 사용
                email = clerk_user_info.get("email") or email
                logger.info(f"Clerk API에서 사용자 정보 가져옴: email={email}")
        
        # 이메일이 여전히 없으면 임시 이메일 생성
        if not email:
            email = f"{clerk_user_id}@clerk.user"
        
        try:
            # 새 사용자 생성 (nickname, profile_image_url은 DB 스키마에 없으므로 제거)
            user = await account_crud.create_from_clerk(
                db,
                clerk_user_id=clerk_user_id,
                email=email
            )
            logger.info(f"사용자 자동 생성 완료: {user.account_id}, email={email}")
        except Exception as e:
            logger.error(f"사용자 자동 생성 실패: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "code": "USER_CREATION_FAILED",
                    "message": f"사용자 생성에 실패했습니다: {str(e)}"
                }
            )
    
    # 라스트 로그인 시간이 필요없음
    # await account_crud.update_last_login(db, clerk_user_id=clerk_user_id)
    
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
