"""
사용자 계정 CRUD

Clerk 인증을 사용하므로:
- 비밀번호 관련 메서드 없음
- clerk_user_id 기반 조회
- 웹훅을 통한 사용자 생성/업데이트
"""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.account import Account
from app.schemas.account import AccountUpdate


class CRUDAccount(CRUDBase[Account, dict, AccountUpdate]):
    """
    사용자 계정 CRUD
    
    Clerk 인증을 사용하므로:
    - password 필드 없음
    - clerk_user_id로 사용자 식별
    - 웹훅을 통한 사용자 동기화
    """
    
    async def get_by_clerk_user_id(
        self,
        db: AsyncSession,
        *,
        clerk_user_id: str
    ) -> Optional[Account]:
        """
        Clerk 사용자 ID로 사용자 조회
        
        Args:
            db: 데이터베이스 세션
            clerk_user_id: Clerk 사용자 ID
        
        Returns:
            사용자 객체 또는 None
        """
        result = await db.execute(
            select(Account).where(
                Account.clerk_user_id == clerk_user_id,
                Account.is_deleted == False
            )
        )
        return result.scalar_one_or_none()
    
    async def get_by_email(
        self,
        db: AsyncSession,
        *,
        email: str
    ) -> Optional[Account]:
        """
        이메일로 사용자 조회
        
        Args:
            db: 데이터베이스 세션
            email: 이메일 주소
        
        Returns:
            사용자 객체 또는 None
        """
        result = await db.execute(
            select(Account).where(
                Account.email == email,
                Account.is_deleted == False
            )
        )
        return result.scalar_one_or_none()
    
    async def create_from_clerk(
        self,
        db: AsyncSession,
        *,
        clerk_user_id: str,
        email: str,
        nickname: Optional[str] = None,
        profile_image_url: Optional[str] = None
    ) -> Account:
        """
        Clerk 웹훅을 통해 사용자 생성
        
        Args:
            db: 데이터베이스 세션
            clerk_user_id: Clerk 사용자 ID
            email: 이메일 주소
            nickname: 닉네임 (없으면 이메일 앞부분 사용)
            profile_image_url: 프로필 이미지 URL
        
        Returns:
            생성된 사용자 객체
        """
        # 닉네임이 없으면 이메일 앞부분 사용
        if not nickname:
            nickname = email.split("@")[0]
        
        db_obj = Account(
            clerk_user_id=clerk_user_id,
            email=email,
            nickname=nickname,
            profile_image_url=profile_image_url
        )
        
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        return db_obj
    
    async def update_from_clerk(
        self,
        db: AsyncSession,
        *,
        clerk_user_id: str,
        email: Optional[str] = None,
        nickname: Optional[str] = None,
        profile_image_url: Optional[str] = None
    ) -> Optional[Account]:
        """
        Clerk 웹훅을 통해 사용자 정보 업데이트
        
        Args:
            db: 데이터베이스 세션
            clerk_user_id: Clerk 사용자 ID
            email: 이메일 주소 (업데이트)
            nickname: 닉네임 (업데이트)
            profile_image_url: 프로필 이미지 URL (업데이트)
        
        Returns:
            업데이트된 사용자 객체 또는 None
        """
        user = await self.get_by_clerk_user_id(db, clerk_user_id=clerk_user_id)
        if not user:
            return None
        
        update_data = {}
        if email is not None:
            update_data["email"] = email
        if nickname is not None:
            update_data["nickname"] = nickname
        if profile_image_url is not None:
            update_data["profile_image_url"] = profile_image_url
        
        if update_data:
            return await self.update(db, db_obj=user, obj_in=update_data)
        
        return user
    
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
        from datetime import datetime
        
        user = await self.get_by_clerk_user_id(db, clerk_user_id=clerk_user_id)
        if not user:
            return None
        
        user.last_login_at = datetime.utcnow()
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        return user


# 싱글톤 인스턴스 생성
# 다른 곳에서 from app.crud.account import account 로 사용
account = CRUDAccount(Account)
