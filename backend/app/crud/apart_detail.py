"""
아파트 상세 정보 CRUD 작업

아파트 상세 정보에 대한 데이터베이스 작업을 수행합니다.
"""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.crud.base import CRUDBase
from app.models.apart_detail import ApartDetail
from app.schemas.apart_detail import ApartDetailCreate, ApartDetailUpdate

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

logger = logging.getLogger(__name__)


class CRUDApartDetail(CRUDBase[ApartDetail, ApartDetailCreate, ApartDetailUpdate]):
    """
    아파트 상세 정보 CRUD 클래스
    
    기본 CRUD 작업 외에 apt_id로 조회하는 기능을 제공합니다.
    """
    
    async def get_by_apt_id(
        self,
        db: AsyncSession,
        *,
        apt_id: int
    ) -> Optional[ApartDetail]:
        """
        아파트 ID로 상세 정보 조회 (1대1 관계 보장)
        
        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 ID
        
        Returns:
            ApartDetail 객체 또는 None
        """
        result = await db.execute(
            select(ApartDetail)
            .where(ApartDetail.apt_id == apt_id)
            .where(ApartDetail.is_deleted == False)
        )
        return result.scalar_one_or_none()
    
    async def create_or_skip(
        self,
        db: AsyncSession,
        *,
        obj_in: ApartDetailCreate
    ) -> tuple[Optional[ApartDetail], bool]:
        """
        아파트 상세 정보 생성 또는 건너뛰기
        
        apt_id에 대한 상세 정보가 이미 존재하면 건너뛰고, 없으면 생성합니다.
        (1대1 관계 보장)
        
        Args:
            db: 데이터베이스 세션
            obj_in: 생성할 상세 정보 데이터
        
        Returns:
            (ApartDetail 객체, 생성 여부) 튜플
            - 생성된 경우: (ApartDetail 객체, True)
            - 이미 존재하는 경우: (기존 ApartDetail 객체, False)
        """
        # 기존 상세 정보 확인 (1대1 관계 보장)
        existing = await self.get_by_apt_id(db, apt_id=obj_in.apt_id)
        
        if existing:
            logger.debug(f"기존 상세 정보 발견 (apt_detail_id: {existing.apt_detail_id})")
            return existing, False
        
        # 새로 생성
        try:
            db_obj = ApartDetail(**obj_in.model_dump())
            db.add(db_obj)
            await db.flush()  # savepoint와 호환되도록 flush 사용
            await db.refresh(db_obj)
            logger.debug(f"새 상세 정보 생성 완료 (apt_detail_id: {db_obj.apt_detail_id})")
            return db_obj, True
        except Exception as e:
            logger.error(f"저장 중 오류 발생: {str(e)}")
            import traceback
            logger.debug(f"상세 스택: {traceback.format_exc()}")
            raise


# CRUD 인스턴스 생성
apart_detail = CRUDApartDetail(ApartDetail)
