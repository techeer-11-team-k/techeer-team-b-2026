import logging
import asyncio
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case, desc, text, extract

from app.models.sale import Sale
from app.models.rent import Rent
from app.models.apartment import Apartment
from app.models.state import State
from app.models.house_score import HouseScore
from app.schemas.statistics import (
    RVOLResponse,
    RVOLDataPoint,
    QuadrantResponse,
    QuadrantDataPoint,
    StatisticsSummaryResponse,
    HPIResponse,
    HPIDataPoint,
    HPIHeatmapResponse,
    HPIHeatmapDataPoint,
)
from app.utils.cache import get_from_cache, set_to_cache, build_cache_key, generate_hash_key

logger = logging.getLogger(__name__)

STATISTICS_CACHE_TTL = 21600

# ============================================================
# 헬퍼 함수
# ============================================================

def calculate_quadrant(sale_change_rate: float, rent_change_rate: float) -> tuple[int, str]:
    """
    4분면 분류 계산
    """
    if sale_change_rate > 0 and rent_change_rate < 0:
        return (1, "매수 전환")
    elif sale_change_rate < 0 and rent_change_rate > 0:
        return (2, "임대 선호/관망")
    elif sale_change_rate < 0 and rent_change_rate < 0:
        return (3, "시장 위축")
    elif sale_change_rate > 0 and rent_change_rate > 0:
        return (4, "활성화")
    else:
        # 변화율이 0인 경우는 중립으로 처리
        if sale_change_rate == 0 and rent_change_rate == 0:
            return (0, "중립")
        elif sale_change_rate == 0:
            return (2 if rent_change_rate > 0 else 3, "임대 선호/관망" if rent_change_rate > 0 else "시장 위축")
        else:
            return (1 if sale_change_rate > 0 else 3, "매수 전환" if sale_change_rate > 0 else "시장 위축")


async def get_rvol(
    db: AsyncSession,
    transaction_type: str = "sale",
    current_period_months: int = 6,
    average_period_months: int = 6
) -> RVOLResponse:
    """
    RVOL(상대 거래량) 조회
    """
    # 해시 키 사용
    cache_key = generate_hash_key(
        "statistics:rvol",
        transaction_type=transaction_type,
        current_period=current_period_months,
        average_period=average_period_months
    )
    
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return RVOLResponse(**cached_data)
    
    try:
        # 거래 유형에 따른 테이블 및 필드 선택
        if transaction_type == "sale":
            trans_table = Sale
            date_field = Sale.contract_date
            base_filter = and_(
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.contract_date.isnot(None),
                or_(Sale.remarks != "더미", Sale.remarks.is_(None))
            )
        else:  # rent
            trans_table = Rent
            date_field = Rent.deal_date
            base_filter = and_(
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deal_date.isnot(None),
                or_(Rent.remarks != "더미", Rent.remarks.is_(None))
            )
        
        today = date.today()
        current_month_start = date(today.year, today.month, 1)
        
        current_start = current_month_start - timedelta(days=current_period_months * 30)
        current_end = current_month_start
        
        average_start = current_start - timedelta(days=average_period_months * 30)
        average_end = current_start
        
        # 월별 집계
        average_volume_stmt = (
            select(
                extract('year', date_field).label('year'),
                extract('month', date_field).label('month'),
                func.count(trans_table.trans_id).label('count')
            )
            .where(
                and_(
                    base_filter,
                    date_field >= average_start,
                    date_field < average_end
                )
            )
            .group_by(extract('year', date_field), extract('month', date_field))
        )
        
        current_volume_stmt = (
            select(
                extract('year', date_field).label('year'),
                extract('month', date_field).label('month'),
                func.count(trans_table.trans_id).label('count')
            )
            .where(
                and_(
                    base_filter,
                    date_field >= current_start,
                    date_field < current_end
                )
            )
            .group_by(extract('year', date_field), extract('month', date_field))
        )
        
        # 순차 실행 (SQLAlchemy AsyncSession 동시성 제한)
        average_result = await db.execute(average_volume_stmt)
        current_result = await db.execute(current_volume_stmt)
        
        average_rows = average_result.fetchall()
        current_rows = current_result.fetchall()
        
        if average_rows:
            total_average = sum(row.count for row in average_rows)
            average_monthly_volume = total_average / len(average_rows)
        else:
            average_monthly_volume = 1
        
        rvol_data = []
        current_year = today.year
        current_month = today.month
        
        for row in current_rows:
            year = int(row.year)
            month = int(row.month)
            
            if year == current_year and month == current_month:
                continue
                
            count = row.count or 0
            rvol = count / average_monthly_volume if average_monthly_volume > 0 else 0
            
            rvol_data.append(
                RVOLDataPoint(
                    date=f"{year}-{month:02d}-01",
                    current_volume=count,
                    average_volume=round(average_monthly_volume, 2),
                    rvol=round(rvol, 2)
                )
            )
        
        rvol_data.sort(key=lambda x: x.date)
        
        period_description = f"최근 {current_period_months}개월 vs 직전 {average_period_months}개월"
        
        response_data = RVOLResponse(
            success=True,
            data=rvol_data,
            period=period_description
        )
        
        if len(rvol_data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        return response_data
        
    except Exception as e:
        logger.error(f" RVOL 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"RVOL 조회 오류: {str(e)}"
        )


async def get_quadrant(
    db: AsyncSession,
    period_months: int = 2
) -> QuadrantResponse:
    """
    4분면 분류 조회
    """
    cache_key = generate_hash_key("statistics:quadrant", period_months=period_months)
    
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return QuadrantResponse(**cached_data)
    
    try:
        today = date.today()
        current_month_start = date(today.year, today.month, 1)
        
        recent_start = current_month_start - timedelta(days=period_months * 30)
        recent_end = current_month_start
        
        previous_start = recent_start - timedelta(days=period_months * 30)
        previous_end = recent_start
        
        # 쿼리 작성 (Sale)
        sale_previous_stmt = (
            select(
                extract('year', Sale.contract_date).label('year'),
                extract('month', Sale.contract_date).label('month'),
                func.count(Sale.trans_id).label('count')
            )
            .where(
                and_(
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                    Sale.contract_date.isnot(None),
                    Sale.contract_date >= previous_start,
                    Sale.contract_date < previous_end,
                )
            )
            .group_by(extract('year', Sale.contract_date), extract('month', Sale.contract_date))
        )
        
        sale_recent_stmt = (
            select(
                extract('year', Sale.contract_date).label('year'),
                extract('month', Sale.contract_date).label('month'),
                func.count(Sale.trans_id).label('count')
            )
            .where(
                and_(
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                    Sale.contract_date.isnot(None),
                    Sale.contract_date >= recent_start,
                    Sale.contract_date < recent_end,
                )
            )
            .group_by(extract('year', Sale.contract_date), extract('month', Sale.contract_date))
        )
        
        # 쿼리 작성 (Rent)
        rent_previous_stmt = (
            select(
                extract('year', Rent.deal_date).label('year'),
                extract('month', Rent.deal_date).label('month'),
                func.count(Rent.trans_id).label('count')
            )
            .where(
                and_(
                    (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                    Rent.deal_date.isnot(None),
                    Rent.deal_date >= previous_start,
                    Rent.deal_date < previous_end,
                )
            )
            .group_by(extract('year', Rent.deal_date), extract('month', Rent.deal_date))
        )
        
        rent_recent_stmt = (
            select(
                extract('year', Rent.deal_date).label('year'),
                extract('month', Rent.deal_date).label('month'),
                func.count(Rent.trans_id).label('count')
            )
            .where(
                and_(
                    (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                    Rent.deal_date.isnot(None),
                    Rent.deal_date >= recent_start,
                    Rent.deal_date < recent_end,
                )
            )
            .group_by(extract('year', Rent.deal_date), extract('month', Rent.deal_date))
        )
        
        # 순차 실행 (SQLAlchemy AsyncSession 동시성 제한)
        sale_previous_result = await db.execute(sale_previous_stmt)
        sale_recent_result = await db.execute(sale_recent_stmt)
        rent_previous_result = await db.execute(rent_previous_stmt)
        rent_recent_result = await db.execute(rent_recent_stmt)
        
        sale_previous_rows = sale_previous_result.fetchall()
        sale_recent_rows = sale_recent_result.fetchall()
        rent_previous_rows = rent_previous_result.fetchall()
        rent_recent_rows = rent_recent_result.fetchall()
        
        # 계산
        sale_previous_total = sum(row.count for row in sale_previous_rows) if sale_previous_rows else 0
        rent_previous_total = sum(row.count for row in rent_previous_rows) if rent_previous_rows else 0
        
        sale_previous_avg = sale_previous_total / len(sale_previous_rows) if sale_previous_rows else 1
        rent_previous_avg = rent_previous_total / len(rent_previous_rows) if rent_previous_rows else 1
        
        sale_recent_dict = {f"{int(row.year)}-{int(row.month):02d}": row.count for row in sale_recent_rows}
        rent_recent_dict = {f"{int(row.year)}-{int(row.month):02d}": row.count for row in rent_recent_rows}
        
        all_periods = set(sale_recent_dict.keys()) | set(rent_recent_dict.keys())
        current_year = today.year
        current_month = today.month
        current_period_key = f"{current_year}-{current_month:02d}"
        
        all_periods.discard(current_period_key)
        
        quadrant_data = []
        quadrant_counts = {1: 0, 2: 0, 3: 0, 4: 0}
        
        for period in sorted(all_periods):
            sale_recent_count = sale_recent_dict.get(period, 0)
            rent_recent_count = rent_recent_dict.get(period, 0)
            
            sale_change_rate = ((sale_recent_count - sale_previous_avg) / sale_previous_avg * 100) if sale_previous_avg > 0 else 0
            rent_change_rate = ((rent_recent_count - rent_previous_avg) / rent_previous_avg * 100) if rent_previous_avg > 0 else 0
            
            quadrant_num, quadrant_label = calculate_quadrant(sale_change_rate, rent_change_rate)
            
            if quadrant_num > 0:
                quadrant_counts[quadrant_num] = quadrant_counts.get(quadrant_num, 0) + 1
            
            quadrant_data.append(
                QuadrantDataPoint(
                    date=period,
                    sale_volume_change_rate=round(sale_change_rate, 2),
                    rent_volume_change_rate=round(rent_change_rate, 2),
                    quadrant=quadrant_num,
                    quadrant_label=quadrant_label
                )
            )
        
        summary = {
            "total_periods": len(quadrant_data),
            "quadrant_distribution": quadrant_counts,
            "sale_previous_avg": round(sale_previous_avg, 2),
            "rent_previous_avg": round(rent_previous_avg, 2)
        }
        
        response_data = QuadrantResponse(
            success=True,
            data=quadrant_data,
            summary=summary
        )
        
        if len(quadrant_data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        return response_data
        
    except Exception as e:
        logger.error(f" 4분면 분석 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def get_hpi(
    db: AsyncSession,
    region_id: Optional[int] = None,
    index_type: str = "APT",
    months: int = 24
) -> HPIResponse:
    """
    주택가격지수(HPI) 조회
    """
    cache_key = generate_hash_key(
        "statistics:hpi",
        region_id=region_id,
        index_type=index_type,
        months=months
    )
    
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return HPIResponse(**cached_data)
    
    try:
        today = date.today()
        current_year = today.year
        current_month = today.month
        
        total_months = current_year * 12 + current_month - 1
        start_total_months = total_months - months + 1
        start_year = start_total_months // 12
        start_month = (start_total_months % 12) + 1
        
        start_base_ym = f"{start_year:04d}{start_month:02d}"
        end_base_ym = f"{current_year:04d}{current_month:02d}"
        
        if region_id is not None:
            query = (
                select(
                    HouseScore.base_ym,
                    HouseScore.index_value,
                    HouseScore.index_change_rate,
                    HouseScore.index_type,
                    State.city_name.label('region_name')
                )
                .join(State, HouseScore.region_id == State.region_id)
                .where(
                    and_(
                        HouseScore.region_id == region_id,
                        HouseScore.is_deleted == False,
                        HouseScore.index_type == index_type,
                        HouseScore.base_ym >= start_base_ym,
                        HouseScore.base_ym <= end_base_ym
                    )
                )
                .order_by(HouseScore.base_ym)
            )
        else:
            query = (
                select(
                    HouseScore.base_ym,
                    func.avg(HouseScore.index_value).label('index_value'),
                    func.avg(HouseScore.index_change_rate).label('index_change_rate'),
                    func.max(HouseScore.index_type).label('index_type'),
                    State.city_name.label('region_name')
                )
                .join(State, HouseScore.region_id == State.region_id)
                .where(
                    and_(
                        HouseScore.is_deleted == False,
                        State.is_deleted == False,
                        HouseScore.index_type == index_type,
                        HouseScore.base_ym >= start_base_ym,
                        HouseScore.base_ym <= end_base_ym
                    )
                )
                .group_by(HouseScore.base_ym, State.city_name)
                .order_by(HouseScore.base_ym, State.city_name)
            )
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        hpi_data = []
        for row in rows:
            base_ym = row.base_ym
            year = base_ym[:4]
            month = base_ym[4:6]
            date_str = f"{year}-{month}"
            
            index_value = float(row.index_value) if row.index_value is not None else 0.0
            index_change_rate = float(row.index_change_rate) if row.index_change_rate is not None else None
            
            region_name = row.region_name if hasattr(row, 'region_name') and row.region_name else None
            
            hpi_data.append(
                HPIDataPoint(
                    date=date_str,
                    index_value=round(index_value, 2),
                    index_change_rate=round(index_change_rate, 2) if index_change_rate is not None else None,
                    region_name=region_name,
                    index_type=index_type
                )
            )
        
        hpi_data.sort(key=lambda x: x.date)
        
        region_desc = f"지역 ID {region_id}" if region_id else "전체 지역 평균"
        period_desc = f"{months}개월"
        
        response_data = HPIResponse(
            success=True,
            data=hpi_data,
            region_id=region_id,
            index_type=index_type,
            period=f"{region_desc}, {index_type}, {period_desc}"
        )
        
        if len(hpi_data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        return response_data
        
    except Exception as e:
        logger.error(f" HPI 조회 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def get_hpi_heatmap(
    db: AsyncSession,
    index_type: str = "APT"
) -> HPIHeatmapResponse:
    """
    주택가격지수 히트맵 조회
    """
    cache_key = generate_hash_key("statistics:hpi_heatmap", index_type=index_type)
    
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return HPIHeatmapResponse(**cached_data)
    
    try:
        today = date.today()
        current_year = today.year
        current_month = today.month
        
        found_base_ym = None
        for i in range(12):
            check_year = current_year
            check_month = current_month - i
            if check_month <= 0:
                check_year -= 1
                check_month += 12
            check_base_ym = f"{check_year:04d}{check_month:02d}"
            
            check_query = (
                select(func.count(HouseScore.index_id))
                .where(
                    and_(
                        HouseScore.is_deleted == False,
                        HouseScore.index_type == index_type,
                        HouseScore.base_ym == check_base_ym
                    )
                )
            )
            check_result = await db.execute(check_query)
            count = check_result.scalar() or 0
            
            if count > 0:
                found_base_ym = check_base_ym
                break
        
        if not found_base_ym:
            raise HTTPException(status_code=404, detail="HPI 데이터를 찾을 수 없습니다.")
        
        query = (
            select(
                State.city_name,
                func.avg(HouseScore.index_value).label('index_value'),
                func.avg(HouseScore.index_change_rate).label('index_change_rate'),
                func.count(HouseScore.index_id).label('region_count')
            )
            .join(State, HouseScore.region_id == State.region_id)
            .where(
                and_(
                    HouseScore.is_deleted == False,
                    State.is_deleted == False,
                    HouseScore.index_type == index_type,
                    HouseScore.base_ym == found_base_ym
                )
            )
            .group_by(State.city_name)
            .order_by(State.city_name)
        )
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        heatmap_data = []
        for row in rows:
            city_name = row.city_name
            index_value = float(row.index_value) if row.index_value is not None else 0.0
            index_change_rate = float(row.index_change_rate) if row.index_change_rate is not None else None
            region_count = int(row.region_count) if row.region_count else 0
            
            heatmap_data.append(
                HPIHeatmapDataPoint(
                    city_name=city_name,
                    index_value=round(index_value, 2),
                    index_change_rate=round(index_change_rate, 2) if index_change_rate is not None else None,
                    base_ym=found_base_ym,
                    region_count=region_count
                )
            )
        
        heatmap_data.sort(key=lambda x: x.city_name)
        
        response_data = HPIHeatmapResponse(
            success=True,
            data=heatmap_data,
            index_type=index_type,
            base_ym=found_base_ym
        )
        
        if len(heatmap_data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f" 히트맵 조회 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def get_statistics_summary(
    db: AsyncSession,
    transaction_type: str = "sale",
    current_period_months: int = 6,
    average_period_months: int = 6,
    quadrant_period_months: int = 2
) -> StatisticsSummaryResponse:
    """
    통계 요약 조회
    """
    cache_key = generate_hash_key(
        "statistics:summary",
        transaction_type=transaction_type,
        current_period=current_period_months,
        average_period=average_period_months,
        quadrant_period=quadrant_period_months
    )
    
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return StatisticsSummaryResponse(**cached_data)
    
    rvol_response = await get_rvol(db, transaction_type, current_period_months, average_period_months)
    quadrant_response = await get_quadrant(db, quadrant_period_months)
    
    response_data = StatisticsSummaryResponse(
        success=True,
        rvol=rvol_response,
        quadrant=quadrant_response
    )
    
    await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
    
    return response_data
