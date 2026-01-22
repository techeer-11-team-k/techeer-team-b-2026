"""
내 집 CRUD

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
from app.models.my_property import MyProperty
from app.schemas.my_property import MyPropertyCreate, MyPropertyUpdate


class CRUDMyProperty(CRUDBase[MyProperty, MyPropertyCreate, MyPropertyUpdate]):
    """
    내 집 CRUD 클래스
    
    MyProperty 모델에 대한 데이터베이스 작업을 수행합니다.
    """
    
    async def get_by_account(
        self,
        db: AsyncSession,
        *,
        account_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[MyProperty]:
        """
        사용자별 내 집 목록 조회
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
            skip: 건너뛸 레코드 수
            limit: 가져올 레코드 수 (최대 100)
        
        Returns:
            MyProperty 객체 목록 (Apartment 관계 포함)
        """
        result = await db.execute(
            select(MyProperty)
            .where(
                and_(
                    MyProperty.account_id == account_id,
                    MyProperty.is_deleted == False
                )
            )
            .options(
                selectinload(MyProperty.apartment).selectinload(Apartment.region),  # Apartment와 State 관계 로드
                selectinload(MyProperty.apartment).selectinload(Apartment.apart_detail)  # Apartment 상세 정보 로드 (1대1 관계)
            )
            .order_by(MyProperty.created_at.desc().nulls_last())  # NULL 값은 마지막에
            .offset(skip)
            .limit(min(limit, 100))
        )
        return list(result.scalars().all())
    
    async def get_by_account_and_id(
        self,
        db: AsyncSession,
        *,
        account_id: int,
        property_id: int
    ) -> Optional[MyProperty]:
        """
        사용자와 내 집 ID로 내 집 조회
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
            property_id: 내 집 ID
        
        Returns:
            MyProperty 객체 또는 None
        """
        result = await db.execute(
            select(MyProperty)
            .where(
                and_(
                    MyProperty.property_id == property_id,
                    MyProperty.account_id == account_id,
                    MyProperty.is_deleted == False
                )
            )
            .options(
                selectinload(MyProperty.apartment).selectinload(Apartment.region),  # Apartment와 State 관계 로드
                selectinload(MyProperty.apartment).selectinload(Apartment.apart_detail)  # Apartment 상세 정보 로드 (1대1 관계)
            )
            .order_by(MyProperty.created_at.desc())  # 최신순으로 정렬하여 중복 시 최신 것만 반환
            .limit(1)  # 최대 1개만 반환
        )
        return result.scalars().first()  # scalar_one_or_none() 대신 first() 사용 (중복 시 첫 번째만 반환)
    
    async def count_by_account(
        self,
        db: AsyncSession,
        *,
        account_id: int
    ) -> int:
        """
        사용자별 내 집 개수 조회 (제한 확인용)
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
        
        Returns:
            내 집 개수
        """
        result = await db.execute(
            select(func.count(MyProperty.property_id))
            .where(
                and_(
                    MyProperty.account_id == account_id,
                    MyProperty.is_deleted == False
                )
            )
        )
        return result.scalar() or 0
    
    async def get_by_account_and_apt_id(
        self,
        db: AsyncSession,
        *,
        account_id: int,
        apt_id: int,
        exclusive_area: float = None
    ) -> Optional[MyProperty]:
        """
        사용자와 아파트 ID로 내 집 조회 (중복 체크용)
        전용면적이 제공되면 같은 아파트+같은 면적만 중복으로 처리
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
            apt_id: 아파트 ID
            exclusive_area: 전용면적 (선택, 제공 시 면적까지 일치해야 중복)
        
        Returns:
            MyProperty 객체 또는 None
        """
        conditions = [
            MyProperty.account_id == account_id,
            MyProperty.apt_id == apt_id,
            MyProperty.is_deleted == False
        ]
        
        # 전용면적이 제공되면 면적까지 일치하는 경우만 중복 처리
        if exclusive_area is not None:
            conditions.append(MyProperty.exclusive_area == exclusive_area)
        
        result = await db.execute(
            select(MyProperty)
            .where(and_(*conditions))
            .limit(1)
        )
        return result.scalars().first()
    
    async def create(
        self,
        db: AsyncSession,
        *,
        obj_in: MyPropertyCreate,
        account_id: int
    ) -> MyProperty:
        """
        내 집 생성
        
        Args:
            db: 데이터베이스 세션
            obj_in: 생성할 내 집 정보
            account_id: 계정 ID
        
        Returns:
            생성된 MyProperty 객체
        """
        # 현재 시간 설정
        now = datetime.utcnow()
        
        # MyProperty 객체 생성
        db_obj = MyProperty(
            account_id=account_id,
            apt_id=obj_in.apt_id,
            nickname=obj_in.nickname,
            exclusive_area=obj_in.exclusive_area,
            current_market_price=obj_in.current_market_price,
            memo=obj_in.memo,
            created_at=now,
            updated_at=now,
            is_deleted=False
        )
        
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        return db_obj
    
    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: MyProperty,
        obj_in: MyPropertyUpdate
    ) -> MyProperty:
        """
        내 집 정보 수정
        
        Args:
            db: 데이터베이스 세션
            db_obj: 수정할 MyProperty 객체
            obj_in: 수정할 정보
        
        Returns:
            수정된 MyProperty 객체
        """
        # 수정할 필드만 업데이트
        update_data = obj_in.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        
        # 수정일시 업데이트
        db_obj.updated_at = datetime.utcnow()
        
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        return db_obj
    
    async def soft_delete(
        self,
        db: AsyncSession,
        *,
        property_id: int,
        account_id: int
    ) -> Optional[MyProperty]:
        """
        내 집 소프트 삭제
        
        Args:
            db: 데이터베이스 세션
            property_id: 내 집 ID
            account_id: 계정 ID
        
        Returns:
            삭제된 MyProperty 객체 또는 None
        """
        property_obj = await self.get_by_account_and_id(
            db, account_id=account_id, property_id=property_id
        )
        
        if property_obj:
            property_obj.is_deleted = True
            property_obj.updated_at = datetime.utcnow()
            db.add(property_obj)
            await db.commit()
            await db.refresh(property_obj)
        
        return property_obj


# CRUD 인스턴스 생성
my_property = CRUDMyProperty(MyProperty)
