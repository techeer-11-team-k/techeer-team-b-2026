"""
아파트 정보 CRUD

데이터베이스 작업을 담당하는 레이어
"""
import logging
from typing import Optional, List, Tuple
from sqlalchemy import select, case, and_, func as sql_func, literal_column
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import functions as geo_func

logger = logging.getLogger(__name__)

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
        # is_deleted가 False인 상세 정보만 고려해야 함
        stmt = (
            select(Apartment)
            .outerjoin(
                ApartDetail,
                and_(
                    Apartment.apt_id == ApartDetail.apt_id,
                    ApartDetail.is_deleted == False
                )
            )
            .where(
                Apartment.is_deleted == False,
                ApartDetail.apt_id.is_(None)  # 상세 정보가 없는 경우 (is_deleted=False인 것만 고려)
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
    
    async def get_nearby_within_radius(
        self,
        db: AsyncSession,
        *,
        apt_id: int,
        radius_meters: float = 500,
        limit: int = 10
    ) -> List[Tuple[ApartDetail, float]]:
        """
        반경 내 주변 아파트 조회 (거리 순 정렬)
        
        기준 아파트로부터 가장 가까운 아파트들을 조회하고 거리순으로 정렬합니다.
        radius_meters가 지정되어 있으면 그 범위 내에서, 없으면 가장 가까운 limit개를 반환합니다.
        
        Args:
            db: 데이터베이스 세션
            apt_id: 기준 아파트 ID
            radius_meters: 반경 (미터, 기본값: 500, None이면 제한 없음)
            limit: 반환할 최대 개수 (기본값: 10)
        
        Returns:
            (ApartDetail, distance_meters) 튜플 리스트
            - 거리순으로 정렬됨
            - distance_meters: 실제 거리 (미터)
        """
        # 1. 기준 아파트의 geometry 조회
        target_detail = await self.get_by_apt_id(db, apt_id=apt_id)
        if not target_detail:
            logger.warning(f"⚠️ 기준 아파트 상세 정보를 찾을 수 없음: apt_id={apt_id}")
            return []
        if not target_detail.geometry:
            logger.warning(f"⚠️ 기준 아파트에 geometry 데이터가 없음: apt_id={apt_id}")
            return []
        
        # 2. 기준 geometry 서브쿼리
        target_geometry_subq = (
            select(ApartDetail.geometry)
            .where(ApartDetail.apt_id == apt_id)
            .where(ApartDetail.is_deleted == False)
            .limit(1)
        ).scalar_subquery()
        
        # 3. 거리 계산식 (미터 단위, 정확한 구면 거리)
        distance_expr = geo_func.ST_Distance_Spheroid(
            target_geometry_subq,
            ApartDetail.geometry,
            'SPHEROID["WGS 84",6378137,298.257223563]'
        ).label('distance_meters')
        
        # 4. 쿼리 구성 - 반경 제한 없이 가장 가까운 아파트 찾기
        # 성능을 위해 큰 반경(111km)으로 대략 필터링 후 정확한 거리로 정렬
        # 111km ≈ 1.0도 (위도 기준)
        # 일부 지역에서는 더 멀리 떨어진 아파트도 있을 수 있으므로 충분히 큰 값 사용
        large_radius_degrees = 2.0  # 약 222km (충분히 큰 범위)
        
        where_conditions = [
            ApartDetail.apt_id != apt_id,  # 자기 자신 제외
            ApartDetail.is_deleted == False,
            ApartDetail.geometry.isnot(None),
            # 대략적인 필터링 (인덱스 활용을 위해 ST_DWithin 사용)
            # 2.0도는 충분히 큰 범위이므로 거의 모든 아파트 포함
            geo_func.ST_DWithin(
                ApartDetail.geometry,
                target_geometry_subq,
                large_radius_degrees
            )
        ]
        
        # 5. 거리순으로 정렬하여 가장 가까운 아파트 조회
        # limit만큼만 가져오면 됨 (반경 제한 없음)
        stmt = (
            select(
                ApartDetail,
                distance_expr
            )
            .where(and_(*where_conditions))
            .order_by(distance_expr)  # 거리순 정렬
            .limit(limit)  # 가장 가까운 limit개만
        )
        
        result = await db.execute(stmt)
        rows = result.all()
        
        logger.debug(f"🔍 주변 아파트 조회 결과: apt_id={apt_id}, 조회된 개수={len(rows)}, limit={limit}")
        
        # 6. 결과 반환
        # radius_meters가 None이면 거리 제한 없이 반환
        # radius_meters가 지정되어 있으면 해당 반경 내만 필터링
        results = []
        for row in rows:
            distance = float(row.distance_meters)
            if radius_meters is None or distance <= radius_meters:
                results.append((row.ApartDetail, distance))
        
        if len(results) == 0:
            logger.warning(f"⚠️ 주변 아파트를 찾지 못함: apt_id={apt_id}, radius_meters={radius_meters}")
        else:
            logger.debug(f"✅ 주변 아파트 {len(results)}개 찾음: apt_id={apt_id}, 최소 거리={results[0][1] if results else 0:.2f}m")
        
        return results

# CRUD 인스턴스 생성
apartment = CRUDApartment(Apartment)
