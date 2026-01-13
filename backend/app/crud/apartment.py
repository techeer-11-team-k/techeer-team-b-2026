"""
아파트 정보 CRUD

데이터베이스 작업을 담당하는 레이어
"""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.models.apartment import Apartment
from app.schemas.apartment import ApartmentCreate, ApartmentUpdate


class CRUDApartment(CRUDBase[Apartment, ApartmentCreate, ApartmentUpdate]):
    """
    아파트 정보 CRUD 클래스
    
    Apartment 모델에 대한 데이터베이스 작업을 수행합니다.
    """
    
    async def get_by_kapt_code(
        self,
        db: AsyncSession,
        *,
        kapt_code: str
    ) -> Optional[Apartment]:
        """
        국토부 단지코드로 아파트 정보 조회
        
        Args:
            db: 데이터베이스 세션
            kapt_code: 국토부 단지코드
        
        Returns:
            Apartment 객체 또는 None
        """
        result = await db.execute(
            select(Apartment)
            .where(Apartment.kapt_code == kapt_code)
            .where(Apartment.is_deleted == False)
        )
        return result.scalar_one_or_none()
    
    async def create_or_skip(
        self,
        db: AsyncSession,
        *,
        obj_in: ApartmentCreate
    ) -> tuple[Optional[Apartment], bool]:
        """
        아파트 정보 생성 또는 건너뛰기
        
        이미 존재하는 kapt_code면 건너뛰고, 없으면 생성합니다.
        
        Args:
            db: 데이터베이스 세션
            obj_in: 생성할 아파트 정보
        
        Returns:
            (Apartment 객체 또는 None, 생성 여부)
            - (Apartment, True): 새로 생성됨
            - (Apartment, False): 이미 존재하여 건너뜀
            - (None, False): 오류 발생
        """
        # 중복 확인
        existing = await self.get_by_kapt_code(db, kapt_code=obj_in.kapt_code)
        if existing:
            return existing, False
        
        # 새로 생성
        try:
            db_obj = Apartment(**obj_in.model_dump())
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj, True
        except Exception as e:
            await db.rollback()
            raise e


# CRUD 인스턴스 생성
apartment = CRUDApartment(Apartment)
