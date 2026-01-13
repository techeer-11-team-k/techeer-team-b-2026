"""
관심 매물/지역 CRUD

데이터베이스 작업을 담당하는 레이어
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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

from app.crud.base import CRUDBase
from app.models.favorite import FavoriteLocation
from app.schemas.favorite import FavoriteLocationCreate


class CRUDFavoriteLocation(CRUDBase[FavoriteLocation, FavoriteLocationCreate, dict]):
    """
    관심 지역 CRUD 클래스
    
    FavoriteLocation 모델에 대한 데이터베이스 작업을 수행합니다.
    """
    
    async def get_by_account_and_region(
        self,
        db: AsyncSession,
        *,
        account_id: int,
        region_id: int
    ) -> Optional[FavoriteLocation]:
        """
        사용자와 지역으로 관심 지역 조회 (중복 확인용)
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
            region_id: 지역 ID
        
        Returns:
            FavoriteLocation 객체 또는 None
        """
        result = await db.execute(
            select(FavoriteLocation)
            .where(
                and_(
                    FavoriteLocation.account_id == account_id,
                    FavoriteLocation.region_id == region_id,
                    FavoriteLocation.is_deleted == False
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def get_by_account(
        self,
        db: AsyncSession,
        *,
        account_id: int,
        skip: int = 0,
        limit: int = 50
    ) -> List[FavoriteLocation]:
        """
        사용자별 관심 지역 목록 조회
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
            skip: 건너뛸 레코드 수
            limit: 가져올 레코드 수 (최대 50)
        
        Returns:
            FavoriteLocation 객체 목록 (State 관계 포함)
        """
        result = await db.execute(
            select(FavoriteLocation)
            .where(
                and_(
                    FavoriteLocation.account_id == account_id,
                    FavoriteLocation.is_deleted == False
                )
            )
            .options(selectinload(FavoriteLocation.region))  # State 관계 로드
            .order_by(FavoriteLocation.created_at.desc().nulls_last())  # NULL 값은 마지막에
            .offset(skip)
            .limit(min(limit, 50))
        )
        return list(result.scalars().all())
    
    async def count_by_account(
        self,
        db: AsyncSession,
        *,
        account_id: int
    ) -> int:
        """
        사용자별 관심 지역 개수 조회 (제한 확인용)
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
        
        Returns:
            관심 지역 개수
        """
        result = await db.execute(
            select(func.count(FavoriteLocation.favorite_id))
            .where(
                and_(
                    FavoriteLocation.account_id == account_id,
                    FavoriteLocation.is_deleted == False
                )
            )
        )
        return result.scalar() or 0
    
    async def create(
        self,
        db: AsyncSession,
        *,
        obj_in: FavoriteLocationCreate,
        account_id: int
    ) -> FavoriteLocation:
        """
        관심 지역 생성
        
        Args:
            db: 데이터베이스 세션
            obj_in: 생성할 관심 지역 정보
            account_id: 계정 ID
        
        Returns:
            생성된 FavoriteLocation 객체
        """
        # 현재 시간 설정
        now = datetime.utcnow()
        
        # FavoriteLocation 객체 생성
        db_obj = FavoriteLocation(
            account_id=account_id,
            region_id=obj_in.region_id,
            created_at=now,
            updated_at=now,
            is_deleted=False
        )
        
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        # State 관계도 함께 로드
        await db.refresh(db_obj, ["region"])
        
        return db_obj
    
    async def soft_delete_by_account_and_region(
        self,
        db: AsyncSession,
        *,
        account_id: int,
        region_id: int
    ) -> Optional[FavoriteLocation]:
        """
        관심 지역 소프트 삭제 (사용자와 지역 ID로)
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
            region_id: 지역 ID
        
        Returns:
            삭제된 FavoriteLocation 객체 또는 None
        """
        favorite = await self.get_by_account_and_region(
            db, account_id=account_id, region_id=region_id
        )
        
        if favorite:
            favorite.is_deleted = True
            favorite.updated_at = datetime.utcnow()
            db.add(favorite)
            await db.commit()
            await db.refresh(favorite)
        
        return favorite


# CRUD 인스턴스 생성
favorite_location = CRUDFavoriteLocation(FavoriteLocation)
