"""
전월세 거래 정보 CRUD

데이터베이스 작업을 담당하는 레이어
국토교통부 API에서 가져온 전월세 실거래가 데이터를 저장/조회합니다.
"""
from typing import Optional, List
from datetime import date, datetime, timedelta
from sqlalchemy import select, and_
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
from app.models.rent import Rent
from app.schemas.rent import RentCreate, RentUpdate


class CRUDRent(CRUDBase[Rent, RentCreate, RentUpdate]):
    """
    전월세 거래 정보 CRUD 클래스

    Rent 모델에 대한 데이터베이스 작업을 수행합니다.
    """

    async def get_by_unique_key(
        self,
        db: AsyncSession,
        *,
        apt_id: int,
        deal_date: date,
        floor: int,
        exclusive_area: float,
        deposit_price: Optional[int],
        monthly_rent: Optional[int],
        apt_seq: Optional[str] = None
    ) -> Optional[Rent]:
        """
        고유 키 조합으로 거래 정보 조회
        
        동일한 아파트에서 같은 날짜, 같은 층, 같은 면적, 같은 가격의 거래는
        중복으로 판단합니다.
        
        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 ID
            deal_date: 거래일
            floor: 층
            exclusive_area: 전용면적
            deposit_price: 보증금
            monthly_rent: 월세
            apt_seq: 아파트 일련번호 (선택, 있으면 더 정확한 중복 체크)
        
        Returns:
            Rent 객체 또는 None
        
        Note:
            - 동일한 거래 데이터가 여러 번 수집되어도 중복 저장을 방지합니다.
            - 가격이 None인 경우도 정확히 매칭합니다.
            - apt_seq가 제공되면 중복 체크에 포함하여 더 정확한 중복 방지가 가능합니다.
        """
        # 조건 빌더: deposit_price와 monthly_rent가 None일 수 있으므로 is_ 연산자 사용
        conditions = [
            Rent.apt_id == apt_id,
            Rent.deal_date == deal_date,
            Rent.floor == floor,
            # 소수점 오차를 고려하여 exclusive_area는 범위로 비교
            Rent.exclusive_area >= exclusive_area - 0.01,
            Rent.exclusive_area <= exclusive_area + 0.01,
            Rent.is_deleted != True
        ]
        
        # deposit_price 조건 추가
        if deposit_price is None:
            conditions.append(Rent.deposit_price.is_(None))
        else:
            conditions.append(Rent.deposit_price == deposit_price)
        
        # monthly_rent 조건 추가
        if monthly_rent is None:
            conditions.append(Rent.monthly_rent.is_(None))
        else:
            conditions.append(Rent.monthly_rent == monthly_rent)
        
        # apt_seq가 있으면 중복 체크에 포함 (더 정확한 중복 방지)
        if apt_seq:
            conditions.append(Rent.apt_seq == apt_seq)
        
        result = await db.execute(
            select(Rent).where(and_(*conditions))
        )
        return result.scalar_one_or_none()

    async def create_or_skip(
        self,
        db: AsyncSession,
        *,
        obj_in: RentCreate
    ) -> tuple[Optional[Rent], bool]:
        """
        전월세 거래 정보 생성 또는 건너뛰기

        이미 존재하는 거래면 건너뛰고, 없으면 생성합니다.

        Args:
            db: 데이터베이스 세션
            obj_in: 생성할 전월세 거래 정보

        Returns:
            (Rent 객체 또는 None, 생성 여부)
            - (Rent, True): 새로 생성됨
            - (Rent, False): 이미 존재하여 건너뜀
            - (None, False): 오류 발생
        """
        # 중복 확인
        existing = await self.get_by_unique_key(
            db,
            apt_id=obj_in.apt_id,
            deal_date=obj_in.deal_date,
            floor=obj_in.floor,
            exclusive_area=obj_in.exclusive_area,
            deposit_price=obj_in.deposit_price,
            monthly_rent=obj_in.monthly_rent
        )
        if existing:
            return existing, False
        
        # 새로 생성 (created_at 자동 설정)
        try:
            obj_data = obj_in.model_dump()
            obj_data["created_at"] = datetime.now()
            db_obj = Rent(**obj_data)
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj, True
        except Exception as e:
            await db.rollback()
            raise e

    async def create_or_update(
        self,
        db: AsyncSession,
        *,
        obj_in: RentCreate
    ) -> tuple[Optional[Rent], bool]:
        """
        전월세 거래 정보 생성 또는 업데이트

        이미 존재하는 거래면 업데이트하고, 없으면 생성합니다.

        Args:
            db: 데이터베이스 세션
            obj_in: 생성/업데이트할 전월세 거래 정보

        Returns:
            (Rent 객체, 생성 여부)
            - (Rent, True): 새로 생성됨
            - (Rent, False): 기존 데이터 업데이트됨
        """
        # 중복 확인 (apt_seq 포함하여 더 정확한 중복 체크)
        existing = await self.get_by_unique_key(
            db,
            apt_id=obj_in.apt_id,
            deal_date=obj_in.deal_date,
            floor=obj_in.floor,
            exclusive_area=obj_in.exclusive_area,
            deposit_price=obj_in.deposit_price,
            monthly_rent=obj_in.monthly_rent,
            apt_seq=obj_in.apt_seq
        )
        
        if existing:
            # 기존 데이터 업데이트
            try:
                obj_data = obj_in.model_dump(exclude_unset=True)
                obj_data["updated_at"] = datetime.now()
                for key, value in obj_data.items():
                    setattr(existing, key, value)
                db.add(existing)
                await db.commit()
                await db.refresh(existing)
                return existing, False
            except Exception as e:
                await db.rollback()
                raise e
        
        # 새로 생성
        try:
            obj_data = obj_in.model_dump()
            obj_data["created_at"] = datetime.now()
            db_obj = Rent(**obj_data)
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
        apt_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[Rent]:
        """
        아파트 ID로 전월세 거래 목록 조회
        
        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 ID
            skip: 건너뛸 개수
            limit: 조회할 개수

        Returns:
            전월세 거래 목록
        """
        result = await db.execute(
            select(Rent)
            .where(Rent.apt_id == apt_id)
            .where(Rent.is_deleted != True)
            .order_by(Rent.deal_date.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_by_date_range(
        self,
        db: AsyncSession,
        *,
        apt_id: int,
        start_date: date,
        end_date: date
    ) -> List[Rent]:
        """
        날짜 범위로 전월세 거래 목록 조회
        
        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 ID
            start_date: 시작일
            end_date: 종료일

        Returns:
            전월세 거래 목록
        """
        result = await db.execute(
            select(Rent)
            .where(
                Rent.apt_id == apt_id,
                Rent.deal_date >= start_date,
                Rent.deal_date <= end_date,
                Rent.is_deleted != True
            )
            .order_by(Rent.deal_date.desc())
        )
        return list(result.scalars().all())

    async def bulk_create(
        self,
        db: AsyncSession,
        *,
        objs_in: List[RentCreate]
    ) -> tuple[int, int]:
        """
        전월세 거래 정보 대량 생성
        
        중복 체크 없이 빠르게 대량의 데이터를 저장합니다.
        사용 전 중복 데이터가 없음을 확인해야 합니다.

        Args:
            db: 데이터베이스 세션
            objs_in: 생성할 전월세 거래 정보 목록

        Returns:
            (저장된 개수, 실패한 개수)
        """
        saved = 0
        failed = 0
        now = datetime.now()
        
        for obj_in in objs_in:
            try:
                obj_data = obj_in.model_dump()
                obj_data["created_at"] = now
                db_obj = Rent(**obj_data)
                db.add(db_obj)
                saved += 1
            except Exception:
                failed += 1
        
        if saved > 0:
            await db.commit()
        
        return saved, failed

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: Rent,
        obj_in: RentUpdate
    ) -> Rent:
        """
        전월세 거래 정보 수정 (updated_at 자동 설정)
        
        Args:
            db: 데이터베이스 세션
            db_obj: 수정할 Rent 객체
            obj_in: 수정할 데이터
        
        Returns:
            수정된 Rent 객체
        """
        update_data = obj_in.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.now()
        
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        return db_obj

    async def get_recent_by_apt_id(
        self,
        db: AsyncSession,
        *,
        apt_id: int,
        months: int = 6,
        limit: int = 50
    ) -> List[Rent]:
        """
        특정 아파트의 최근 전월세 거래 내역 조회
        
        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 ID
            months: 조회할 기간 (개월 수, 기본값: 6)
            limit: 최대 조회 개수 (기본값: 50)
        
        Returns:
            전월세 거래 목록 (최신순 정렬)
        """
        from sqlalchemy import or_
        
        date_from = date.today() - timedelta(days=months * 30)
        
        result = await db.execute(
            select(Rent)
            .where(
                and_(
                    Rent.apt_id == apt_id,
                    or_(Rent.is_deleted == False, Rent.is_deleted.is_(None)),
                    Rent.deal_date >= date_from
                )
            )
            .order_by(Rent.deal_date.desc())
            .limit(limit)
        )
        return list(result.scalars().all())


# CRUD 인스턴스 생성
rent = CRUDRent(Rent)
