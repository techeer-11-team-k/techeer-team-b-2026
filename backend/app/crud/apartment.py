"""
아파트 정보 CRUD

데이터베이스 작업을 담당하는 레이어
"""
from typing import Optional
from sqlalchemy import select, case
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
from app.models.apart_detail import ApartDetail
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

    async def get_by_apt_id(
        self,
        db: AsyncSession,
        *,
        apt_id: int
    ) -> Optional[ApartDetail]:
        """
        아파트 ID로 상세 정보 조회

        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 ID (apartments.apt_id)

        Returns:
            아파트 상세 정보 객체 또는 None
        """
        result = await db.execute(
            select(ApartDetail).where(
                ApartDetail.apt_id == apt_id,
                ApartDetail.is_deleted == False  # 삭제되지 않은 것만 조회
            )
        )
        return result.scalar_one_or_none()

    async def get_by_detail_id(
        self,
        db: AsyncSession,
        *,
        apt_detail_id: int
    ) -> Optional[ApartDetail]:
        """
        상세 정보 ID로 조회

        Args:
            db: 데이터베이스 세션
            apt_detail_id: 아파트 상세정보 ID (apart_details.apt_detail_id)

        Returns:
            아파트 상세 정보 객체 또는 None
        """
        result = await db.execute(
            select(ApartDetail).where(
                ApartDetail.apt_detail_id == apt_detail_id,
                ApartDetail.is_deleted == False  # 삭제되지 않은 것만 조회
            )
        )
        return result.scalar_one_or_none()

    async def get_multi_missing_details(
        self,
        db: AsyncSession,
        *,
        limit: int = 100
    ) -> list[Apartment]:
        """
        상세 정보가 없는 아파트 목록 조회
        
        JOIN을 사용하여 apart_details 테이블에 데이터가 없는 아파트만 조회합니다.
        
        Args:
            db: 데이터베이스 세션
            limit: 조회할 개수 제한
            
        Returns:
            아파트 목록
        """
        # LEFT JOIN으로 apart_details가 없는(NULL) 아파트만 선택
        stmt = (
            select(Apartment)
            .outerjoin(ApartDetail, Apartment.apt_id == ApartDetail.apt_id)
            .where(
                Apartment.is_deleted == False,
                ApartDetail.apt_id == None  # 상세 정보가 없는 경우
            )
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    async def get_similar_apartments(
        self,
        db: AsyncSession,
        *,
        apt_id: int,
        limit: int = 10
    ) -> list[tuple[Apartment, ApartDetail]]:
        """
        유사한 아파트 조회
        
        같은 지역, 비슷한 규모(세대수), 비슷한 건설년도를 기준으로 유사한 아파트를 찾습니다.
        
        Args:
            db: 데이터베이스 세션
            apt_id: 기준 아파트 ID
            limit: 반환할 최대 개수
            
        Returns:
            (Apartment, ApartDetail) 튜플 리스트
        """
        # 1. 기준 아파트 정보 조회
        target_apartment = await self.get(db, id=apt_id)
        if not target_apartment or target_apartment.is_deleted:
            return []
        
        # 2. 기준 아파트의 상세 정보 조회
        target_detail = await self.get_by_apt_id(db, apt_id=apt_id)
        if not target_detail:
            return []
        
        # 3. 유사한 아파트 조회 조건
        # - 같은 지역 (region_id)
        # - 비슷한 세대수 (±30% 범위)
        # - 비슷한 동수 (±2동 범위)
        # - 같은 시공사 (선택적, 있으면 우선)
        # - 같은 아파트 제외
        
        household_min = int(target_detail.total_household_cnt * 0.7) if target_detail.total_household_cnt else None
        household_max = int(target_detail.total_household_cnt * 1.3) if target_detail.total_household_cnt else None
        
        building_min = (target_detail.total_building_cnt - 2) if target_detail.total_building_cnt else None
        building_max = (target_detail.total_building_cnt + 2) if target_detail.total_building_cnt else None
        
        # 쿼리 구성
        stmt = (
            select(Apartment, ApartDetail)
            .join(ApartDetail, Apartment.apt_id == ApartDetail.apt_id)
            .where(
                Apartment.apt_id != apt_id,  # 자기 자신 제외
                Apartment.is_deleted == False,
                ApartDetail.is_deleted == False,
                Apartment.region_id == target_apartment.region_id  # 같은 지역
            )
        )
        
        # 세대수 필터
        if household_min is not None and household_max is not None:
            stmt = stmt.where(
                ApartDetail.total_household_cnt.between(household_min, household_max)
            )
        
        # 동수 필터
        if building_min is not None and building_max is not None:
            stmt = stmt.where(
                ApartDetail.total_building_cnt.between(building_min, building_max)
            )
        
        # 시공사가 같으면 우선순위 높이기 (ORDER BY로 처리)
        if target_detail.builder_name:
            stmt = stmt.order_by(
                case(
                    (ApartDetail.builder_name == target_detail.builder_name, 0),
                    else_=1
                ),
                Apartment.apt_name
            )
        else:
            stmt = stmt.order_by(Apartment.apt_name)
        
        stmt = stmt.limit(limit)
        
        result = await db.execute(stmt)
        return list(result.all())

# CRUD 인스턴스 생성
apartment = CRUDApartment(Apartment)
