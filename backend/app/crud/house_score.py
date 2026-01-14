"""
부동산 지수 CRUD

데이터베이스 작업을 담당하는 레이어
"""
from typing import Optional, Tuple
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
    FavoriteLocation,
    FavoriteApartment,
    MyProperty,
)

from app.crud.base import CRUDBase
from app.models.house_score import HouseScore
from app.schemas.house_score import HouseScoreCreate, HouseScoreUpdate


class CRUDHouseScore(CRUDBase[HouseScore, HouseScoreCreate, HouseScoreUpdate]):
    """
    부동산 지수 CRUD 클래스
    
    HouseScore 모델에 대한 데이터베이스 작업을 수행합니다.
    """
    
    async def get_previous_month(
        self,
        db: AsyncSession,
        *,
        region_id: int,
        base_ym: str,
        index_type: str
    ) -> Optional[HouseScore]:
        """
        전월 데이터 조회
        
        Args:
            db: 데이터베이스 세션
            region_id: 지역 ID
            base_ym: 기준 년월 (YYYYMM)
            index_type: 지수 유형
        
        Returns:
            전월 HouseScore 객체 또는 None
        """
        # base_ym을 년월로 파싱
        if len(base_ym) != 6:
            return None
        
        try:
            year = int(base_ym[:4])
            month = int(base_ym[4:6])
            
            # 전월 계산
            if month == 1:
                prev_year = year - 1
                prev_month = 12
            else:
                prev_year = year
                prev_month = month - 1
            
            prev_base_ym = f"{prev_year:04d}{prev_month:02d}"
            
            # 전월 데이터 조회
            result = await db.execute(
                select(HouseScore)
                .where(
                    and_(
                        HouseScore.region_id == region_id,
                        HouseScore.base_ym == prev_base_ym,
                        HouseScore.index_type == index_type,
                        HouseScore.is_deleted == False
                    )
                )
            )
            return result.scalar_one_or_none()
        except (ValueError, TypeError):
            return None
    
    async def create_or_skip(
        self,
        db: AsyncSession,
        *,
        obj_in: HouseScoreCreate
    ) -> Tuple[Optional[HouseScore], bool]:
        """
        부동산 지수 생성 또는 건너뛰기
        
        이미 존재하는 (region_id, base_ym, index_type) 조합이면 건너뛰고, 없으면 생성합니다.
        
        Args:
            db: 데이터베이스 세션
            obj_in: 생성할 부동산 지수 정보
        
        Returns:
            (HouseScore 객체 또는 None, 생성 여부)
            - (HouseScore, True): 새로 생성됨
            - (HouseScore, False): 이미 존재하여 건너뜀
            - (None, False): 오류 발생
        """
        # 중복 확인 (region_id, base_ym, index_type 조합)
        result = await db.execute(
            select(HouseScore)
            .where(
                and_(
                    HouseScore.region_id == obj_in.region_id,
                    HouseScore.base_ym == obj_in.base_ym,
                    HouseScore.index_type == obj_in.index_type,
                    HouseScore.is_deleted == False
                )
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            return existing, False
        
        # 새로 생성
        try:
            db_obj = HouseScore(**obj_in.model_dump())
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj, True
        except Exception as e:
            await db.rollback()
            raise e


# CRUD 인스턴스 생성
house_score = CRUDHouseScore(HouseScore)
