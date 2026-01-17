"""
부동산 거래량 CRUD

데이터베이스 작업을 담당하는 레이어
"""
from typing import Optional, List, Tuple
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

# 모든 모델을 import하여 SQLAlchemy 관계 설정이 제대로 작동하도록 함
from app.models import (  # noqa: F401
    Account,
    State,
    Apartment,
    Sale,
    Rent,
    HouseScore,
    HouseVolume,
    FavoriteLocation,
    FavoriteApartment,
    MyProperty,
)

from app.crud.base import CRUDBase
from app.models.house_volume import HouseVolume
from app.schemas.house_volume import HouseVolumeCreate, HouseVolumeUpdate


class CRUDHouseVolume(CRUDBase[HouseVolume, HouseVolumeCreate, HouseVolumeUpdate]):
    """
    부동산 거래량 CRUD 클래스
    
    HouseVolume 모델에 대한 데이터베이스 작업을 수행합니다.
    """
    
    async def get_by_region_and_month(
        self,
        db: AsyncSession,
        *,
        region_id: int,
        base_ym: str
    ) -> Optional[HouseVolume]:
        """
        지역 ID와 기준 년월로 부동산 거래량 조회
        
        Args:
            db: 데이터베이스 세션
            region_id: 지역 ID
            base_ym: 기준 년월 (YYYYMM)
        
        Returns:
            HouseVolume 객체 또는 None
        """
        result = await db.execute(
            select(HouseVolume)
            .where(
                and_(
                    HouseVolume.region_id == region_id,
                    HouseVolume.base_ym == base_ym,
                    HouseVolume.is_deleted == False
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def get_by_region(
        self,
        db: AsyncSession,
        *,
        region_id: int
    ) -> List[HouseVolume]:
        """
        지역 ID로 부동산 거래량 목록 조회
        
        Args:
            db: 데이터베이스 세션
            region_id: 지역 ID
        
        Returns:
            HouseVolume 객체 목록
        """
        result = await db.execute(
            select(HouseVolume)
            .where(
                and_(
                    HouseVolume.region_id == region_id,
                    HouseVolume.is_deleted == False
                )
            )
            .order_by(HouseVolume.base_ym.desc())
        )
        return list(result.scalars().all())
    
    async def create_or_skip(
        self,
        db: AsyncSession,
        *,
        obj_in: HouseVolumeCreate
    ) -> Tuple[Optional[HouseVolume], bool]:
        """
        부동산 거래량 생성 또는 건너뛰기
        
        이미 존재하는 (region_id, base_ym) 조합이면 건너뛰고, 없으면 생성합니다.
        
        Args:
            db: 데이터베이스 세션
            obj_in: 생성할 부동산 거래량 정보
        
        Returns:
            (HouseVolume 객체 또는 None, 생성 여부)
            - (HouseVolume, True): 새로 생성됨
            - (HouseVolume, False): 이미 존재하여 건너뜀
            - (None, False): 오류 발생
        """
        # 중복 확인 (region_id, base_ym 조합)
        result = await db.execute(
            select(HouseVolume)
            .where(
                and_(
                    HouseVolume.region_id == obj_in.region_id,
                    HouseVolume.base_ym == obj_in.base_ym,
                    HouseVolume.is_deleted == False
                )
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            return existing, False
        
        # 새로 생성
        try:
            db_obj = HouseVolume(**obj_in.model_dump())
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj, True
        except Exception as e:
            await db.rollback()
            raise e


# CRUD 인스턴스 생성
house_volume = CRUDHouseVolume(HouseVolume)