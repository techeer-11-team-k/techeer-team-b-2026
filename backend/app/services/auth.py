"""
인증 관련 비즈니스 로직

Clerk 인증을 사용하므로:
- 회원가입/로그인은 Clerk에서 처리 (백엔드 API 불필요)
- 웹훅을 통한 사용자 동기화
- 프로필 조회/수정만 백엔드에서 처리
"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.account import account as account_crud
from app.models.account import Account
from app.schemas.account import AccountUpdate
from app.core.exceptions import NotFoundException, AlreadyExistsException


class AuthService:
    """
    인증 관련 비즈니스 로직
    
    Clerk 인증을 사용하므로:
    - 회원가입/로그인: Clerk에서 처리
    - 웹훅 동기화: Clerk → 백엔드 DB
    - 프로필 관리: 백엔드에서 처리
    """
    
    async def sync_user_from_clerk(
        self,
        db: AsyncSession,
        *,
        clerk_user_id: str,
        email: str,
        nickname: Optional[str] = None,
        profile_image_url: Optional[str] = None
    ) -> Account:
        """
        Clerk 웹훅을 통해 사용자 동기화
        
        사용자가 Clerk에서 생성/업데이트될 때 호출됩니다.
        
        Args:
            db: 데이터베이스 세션
            clerk_user_id: Clerk 사용자 ID
            email: 이메일 주소
            nickname: 닉네임
            profile_image_url: 프로필 이미지 URL
        
        Returns:
            동기화된 사용자 객체
        """
        # 기존 사용자 확인
        existing_user = await account_crud.get_by_clerk_user_id(
            db,
            clerk_user_id=clerk_user_id
        )
        
        if existing_user:
            # 업데이트
            return await account_crud.update_from_clerk(
                db,
                clerk_user_id=clerk_user_id,
                email=email,
                nickname=nickname,
                profile_image_url=profile_image_url
            )
        else:
            # 새로 생성
            return await account_crud.create_from_clerk(
                db,
                clerk_user_id=clerk_user_id,
                email=email,
                nickname=nickname,
                profile_image_url=profile_image_url
            )
    
    async def get_user_by_clerk_id(
        self,
        db: AsyncSession,
        *,
        clerk_user_id: str
    ) -> Account:
        """
        Clerk 사용자 ID로 사용자 조회
        
        Args:
            db: 데이터베이스 세션
            clerk_user_id: Clerk 사용자 ID
        
        Returns:
            사용자 객체
        
        Raises:
            NotFoundException: 사용자를 찾을 수 없는 경우
        """
        user = await account_crud.get_by_clerk_user_id(
            db,
            clerk_user_id=clerk_user_id
        )
        
        if not user:
            raise NotFoundException("사용자")
        
        return user
    
    async def update_profile(
        self,
        db: AsyncSession,
        *,
        user: Account,
        profile_update: AccountUpdate
    ) -> Account:
        """
        프로필 수정
        
        Args:
            db: 데이터베이스 세션
            user: 현재 사용자 객체
            profile_update: 수정할 프로필 정보
        
        Returns:
            수정된 사용자 객체
        """
        return await account_crud.update(
            db,
            db_obj=user,
            obj_in=profile_update
        )
    
    async def update_last_login(
        self,
        db: AsyncSession,
        *,
        clerk_user_id: str
    ) -> Optional[Account]:
        """
        마지막 로그인 시간 업데이트
        
        Args:
            db: 데이터베이스 세션
            clerk_user_id: Clerk 사용자 ID
        
        Returns:
            업데이트된 사용자 객체 또는 None
        """
        return await account_crud.update_last_login(
            db,
            clerk_user_id=clerk_user_id
        )


# 싱글톤 인스턴스
auth_service = AuthService()
