"""
일일 통계 배치 집계 서비스

매일 전날 통계를 계산하여 daily_statistics 테이블에 저장합니다.
월별 통계는 일일 통계를 집계하여 계산합니다.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, text
from sqlalchemy.dialects.postgresql import insert

from app.models.sale import Sale
from app.models.rent import Rent
from app.models.apartment import Apartment
from app.models.state import State

logger = logging.getLogger(__name__)


class DailyStatisticsService:
    """일일 통계 배치 집계 서비스"""
    
    async def calculate_daily_statistics(
        self,
        db: AsyncSession,
        target_date: Optional[date] = None
    ) -> dict:
        """
        특정 날짜의 통계를 계산하여 daily_statistics 테이블에 저장
        
        Args:
            db: 데이터베이스 세션
            target_date: 계산할 날짜 (None이면 전날)
        
        Returns:
            계산 결과 통계
        """
        if target_date is None:
            target_date = date.today() - timedelta(days=1)
        
        logger.info(f"일일 통계 계산 시작: {target_date}")
        
        # 매매 통계 계산
        sale_stats = await self._calculate_sale_statistics(db, target_date)
        
        # 전월세 통계 계산
        rent_stats = await self._calculate_rent_statistics(db, target_date)
        
        # 통계 저장
        sale_count = await self._save_statistics(db, target_date, 'sale', sale_stats)
        rent_count = await self._save_statistics(db, target_date, 'rent', rent_stats)
        
        logger.info(
            f"일일 통계 계산 완료: {target_date} - "
            f"매매: {sale_count}개 지역, 전월세: {rent_count}개 지역"
        )
        
        return {
            "date": target_date.isoformat(),
            "sale_regions": sale_count,
            "rent_regions": rent_count,
            "sale_stats": sale_stats,
            "rent_stats": rent_stats
        }
    
    async def _calculate_sale_statistics(
        self,
        db: AsyncSession,
        target_date: date
    ) -> list:
        """매매 통계 계산"""
        stmt = (
            select(
                Apartment.region_id,
                func.count(Sale.trans_id).label('transaction_count'),
                func.avg(Sale.trans_price).label('avg_price'),
                func.sum(Sale.trans_price).label('total_amount'),
                func.avg(Sale.exclusive_area).label('avg_area')
            )
            .select_from(Sale)
            .join(Apartment, Sale.apt_id == Apartment.apt_id)
            .where(
                and_(
                    Sale.contract_date == target_date,
                    Sale.is_canceled == False,
                    or_(Sale.is_deleted == False, Sale.is_deleted.is_(None)),
                    Apartment.is_deleted == False
                )
            )
            .group_by(Apartment.region_id)
        )
        
        result = await db.execute(stmt)
        rows = result.all()
        
        return [
            {
                "region_id": row.region_id,
                "transaction_count": int(row.transaction_count),
                "avg_price": float(row.avg_price) if row.avg_price else None,
                "total_amount": float(row.total_amount) if row.total_amount else None,
                "avg_area": float(row.avg_area) if row.avg_area else None
            }
            for row in rows
        ]
    
    async def _calculate_rent_statistics(
        self,
        db: AsyncSession,
        target_date: date
    ) -> list:
        """전월세 통계 계산"""
        stmt = (
            select(
                Apartment.region_id,
                func.count(Rent.trans_id).label('transaction_count'),
                func.avg(Rent.deposit_price).label('avg_price'),
                func.sum(Rent.deposit_price).label('total_amount'),
                func.avg(Rent.exclusive_area).label('avg_area')
            )
            .select_from(Rent)
            .join(Apartment, Rent.apt_id == Apartment.apt_id)
            .where(
                and_(
                    Rent.deal_date == target_date,
                    or_(Rent.is_deleted == False, Rent.is_deleted.is_(None)),
                    Apartment.is_deleted == False
                )
            )
            .group_by(Apartment.region_id)
        )
        
        result = await db.execute(stmt)
        rows = result.all()
        
        return [
            {
                "region_id": row.region_id,
                "transaction_count": int(row.transaction_count),
                "avg_price": float(row.avg_price) if row.avg_price else None,
                "total_amount": float(row.total_amount) if row.total_amount else None,
                "avg_area": float(row.avg_area) if row.avg_area else None
            }
            for row in rows
        ]
    
    async def _save_statistics(
        self,
        db: AsyncSession,
        target_date: date,
        transaction_type: str,
        stats: list
    ) -> int:
        """통계를 daily_statistics 테이블에 저장 (UPSERT)"""
        if not stats:
            return 0
        
        # UPSERT 쿼리
        insert_stmt = insert(text("daily_statistics")).values([
            {
                "stat_date": target_date,
                "region_id": stat["region_id"],
                "transaction_type": transaction_type,
                "transaction_count": stat["transaction_count"],
                "avg_price": stat["avg_price"],
                "total_amount": stat["total_amount"],
                "avg_area": stat["avg_area"],
                "updated_at": datetime.now()
            }
            for stat in stats
        ])
        
        update_stmt = insert_stmt.on_conflict_do_update(
            index_elements=["stat_date", "region_id", "transaction_type"],
            set_={
                "transaction_count": insert_stmt.excluded.transaction_count,
                "avg_price": insert_stmt.excluded.avg_price,
                "total_amount": insert_stmt.excluded.total_amount,
                "avg_area": insert_stmt.excluded.avg_area,
                "updated_at": datetime.now()
            }
        )
        
        await db.execute(update_stmt)
        await db.commit()
        
        return len(stats)
    
    async def get_monthly_statistics_from_daily(
        self,
        db: AsyncSession,
        start_date: date,
        end_date: date,
        region_id: Optional[int] = None
    ) -> dict:
        """
        일일 통계를 집계하여 월별 통계 계산 (빠름)
        
        Args:
            db: 데이터베이스 세션
            start_date: 시작 날짜
            end_date: 종료 날짜
            region_id: 지역 ID (None이면 전국)
        
        Returns:
            월별 통계 데이터
        """
        stmt = (
            select(
                func.date_trunc('month', text('stat_date')).label('month'),
                text('transaction_type'),
                func.sum(text('transaction_count')).label('total_count'),
                func.avg(text('avg_price')).label('avg_price'),
                func.sum(text('total_amount')).label('total_amount'),
                func.avg(text('avg_area')).label('avg_area')
            )
            .select_from(text('daily_statistics'))
            .where(
                and_(
                    text('stat_date >= :start_date'),
                    text('stat_date <= :end_date')
                )
            )
        )
        
        if region_id:
            stmt = stmt.where(text('region_id = :region_id'))
        
        stmt = stmt.group_by(
            text('month'),
            text('transaction_type')
        ).order_by(
            text('month DESC'),
            text('transaction_type')
        )
        
        result = await db.execute(
            stmt,
            {"start_date": start_date, "end_date": end_date, "region_id": region_id}
        )
        rows = result.all()
        
        return [
            {
                "month": row.month,
                "transaction_type": row.transaction_type,
                "total_count": int(row.total_count),
                "avg_price": float(row.avg_price) if row.avg_price else None,
                "total_amount": float(row.total_amount) if row.total_amount else None,
                "avg_area": float(row.avg_area) if row.avg_area else None
            }
            for row in rows
        ]


# 서비스 인스턴스
daily_statistics_service = DailyStatisticsService()
