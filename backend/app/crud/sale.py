"""
매매 거래 정보 CRUD

데이터베이스 작업을 담당하는 레이어
"""
from typing import Optional, Tuple
from datetime import date, datetime, timedelta
from sqlalchemy import select, func, and_
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
from app.models.sale import Sale
from app.models.apartment import Apartment


class CRUDSale(CRUDBase[Sale, dict, dict]):
    """
    매매 거래 정보 CRUD 클래스

    Sale 모델에 대한 데이터베이스 작업을 수행합니다.
    """

    async def get_target_apartment_average_area(
        self,
        db: AsyncSession,
        *,
        apt_id: int,
        months: int = 6
    ) -> Optional[float]:
        """
        기준 아파트의 최근 거래 평균 면적 조회
        
        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 ID
            months: 조회할 기간 (개월 수)
        
        Returns:
            평균 면적 (㎡) 또는 None
        """
        date_from = date.today() - timedelta(days=months * 30)
        
        stmt = (
            select(func.avg(Sale.exclusive_area).label("avg_area"))
            .where(
                and_(
                    Sale.apt_id == apt_id,
                    Sale.is_canceled == False,
                    Sale.is_deleted != True,
                    Sale.contract_date >= date_from,
                    Sale.exclusive_area > 0
                )
            )
        )
        
        result = await db.execute(stmt)
        row = result.first()
        
        if not row or row.avg_area is None:
            return None
        
        return float(row.avg_area)

    async def get_nearby_average_price(
        self,
        db: AsyncSession,
        *,
        region_id: int,
        target_apt_id: int,
        months: int = 6
    ) -> Optional[Tuple[float, int]]:
        """
        주변 아파트들의 평균 평당가 조회
        
        같은 지역(region_id)의 아파트들 중에서
        최근 N개월간의 거래 데이터를 기반으로 평당가를 계산합니다.
        
        계산 방식:
        - 평당가 = SUM(trans_price) / SUM(exclusive_area)
        - 거래 개수 = COUNT(*)
        
        Args:
            db: 데이터베이스 세션
            region_id: 지역 ID (같은 지역의 아파트들 조회)
            target_apt_id: 기준 아파트 ID (자기 자신 제외)
            months: 조회할 기간 (개월 수, 기본값: 6)
        
        Returns:
            (평당가, 거래 개수) 튜플 또는 None
            - 평당가는 만원/㎡ 단위
            - 거래 개수가 0이면 None 반환
        """
        # 날짜 계산: 현재 날짜에서 N개월 전
        date_from = date.today() - timedelta(days=months * 30)
        
        # SQL 쿼리: 같은 지역의 주변 아파트 거래 데이터 집계
        stmt = (
            select(
                func.sum(Sale.trans_price).label("total_price"),
                func.sum(Sale.exclusive_area).label("total_area"),
                func.count(Sale.trans_id).label("transaction_count")
            )
            .select_from(Sale)
            .join(Apartment, Sale.apt_id == Apartment.apt_id)
            .where(
                and_(
                    Apartment.region_id == region_id,
                    Sale.apt_id != target_apt_id,  # 자기 자신 제외
                    Sale.is_canceled == False,
                    Sale.is_deleted != True,
                    Sale.contract_date >= date_from,
                    Sale.trans_price.isnot(None),
                    Sale.exclusive_area > 0
                )
            )
        )
        
        result = await db.execute(stmt)
        row = result.first()
        
        if not row or row.transaction_count == 0 or row.total_area is None or row.total_area == 0:
            return None
        
        # 평당가 계산: 전체 가격 합 / 전체 면적 합
        average_price_per_sqm = float(row.total_price) / float(row.total_area)
        
        return (average_price_per_sqm, row.transaction_count)


# CRUD 인스턴스 생성
sale = CRUDSale(Sale)
