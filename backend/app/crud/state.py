"""
지역 정보 CRUD

데이터베이스 작업을 담당하는 레이어
"""
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.state import State
from app.schemas.state import StateCreate, StateUpdate


class CRUDState(CRUDBase[State, StateCreate, StateUpdate]):
    """
    지역 정보 CRUD 클래스
    
    State 모델에 대한 데이터베이스 작업을 수행합니다.
    """
    
    async def get_by_region_code(
        self,
        db: AsyncSession,
        *,
        region_code: str
    ) -> Optional[State]:
        """
        지역코드로 지역 정보 조회
        
        Args:
            db: 데이터베이스 세션
            region_code: 지역코드 (10자리)
        
        Returns:
            State 객체 또는 None
        """
        result = await db.execute(
            select(State)
            .where(State.region_code == region_code)
            .where(State.is_deleted == False)
        )
        return result.scalar_one_or_none()
    
    async def get_by_city_name(
        self,
        db: AsyncSession,
        *,
        city_name: str,
        skip: int = 0,
        limit: int = 100
    ) -> List[State]:
        """
        시도명으로 지역 목록 조회
        
        Args:
            db: 데이터베이스 세션
            city_name: 시도명 (예: 서울특별시)
            skip: 건너뛸 레코드 수
            limit: 가져올 레코드 수
        
        Returns:
            State 객체 목록
        """
        result = await db.execute(
            select(State)
            .where(State.city_name == city_name)
            .where(State.is_deleted == False)
            .offset(skip)
            .limit(limit)
            .order_by(State.region_name)
        )
        return list(result.scalars().all())
    
    async def create_or_skip(
        self,
        db: AsyncSession,
        *,
        obj_in: StateCreate
    ) -> tuple[Optional[State], bool]:
        """
        지역 정보 생성 또는 건너뛰기
        
        이미 존재하는 region_code면 건너뛰고, 없으면 생성합니다.
        
        Args:
            db: 데이터베이스 세션
            obj_in: 생성할 지역 정보
        
        Returns:
            (State 객체 또는 None, 생성 여부)
            - (State, True): 새로 생성됨
            - (State, False): 이미 존재하여 건너뜀
            - (None, False): 오류 발생
        """
        # 중복 확인
        existing = await self.get_by_region_code(db, region_code=obj_in.region_code)
        if existing:
            return existing, False
        
        # 새로 생성
        try:
            db_obj = State(**obj_in.model_dump())
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj, True
        except Exception as e:
            await db.rollback()
            raise e


# CRUD 인스턴스 생성
state = CRUDState(State)
