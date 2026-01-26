import logging
import asyncio
from typing import List, Tuple, Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from app.db.session import AsyncSessionLocal

# Services
from app.services import statistics_service
from app.services.statistics_cache_service import statistics_cache_service

# Endpoints (Treating them as services for now)
from app.api.v1.endpoints.dashboard import (
    get_dashboard_summary,
    get_dashboard_rankings,
    get_regional_heatmap,
    get_regional_trends
)
from app.api.v1.endpoints.statistics import get_transaction_volume

logger = logging.getLogger(__name__)

async def preload_all_statistics():
    """
    서버 시작 시 모든 통계 데이터를 미리 캐싱합니다.
    
    대상:
    1. 대시보드 (요약, 랭킹, 히트맵, 추이)
    2. 통계 (RVOL, 4분면, HPI, HPI 히트맵)
    3. 통계 캐싱 서비스를 통한 모든 필터 조합 사전 계산
    
    이 작업은 백그라운드에서 실행됩니다.
    각 작업마다 별도의 DB 세션을 사용하여 동시성 오류를 방지합니다.
    """
    logger.info(" [Warmup] 통계 데이터 전체 캐싱 시작...")
    
    success_count = 0
    fail_count = 0
    
    # 새로운 통계 캐싱 서비스를 사용하여 모든 필터 조합 사전 계산
    try:
        async with AsyncSessionLocal() as db:
            results = await statistics_cache_service.precompute_all_statistics(
                db,
                endpoints=["transaction-volume", "rvol", "hpi", "market-phase"]
            )
            logger.info(f" [Warmup] 통계 캐싱 서비스 사전 계산 완료: {results}")
            success_count += sum(results.values())
    except Exception as e:
        logger.warning(f" [Warmup] 통계 캐싱 서비스 사전 계산 실패: {e}")
        fail_count += 1
    
    # 작업 정의: 각 작업을 래핑하는 코루틴 함수
    async def run_rvol(trans_type: str, period1: int, period2: int):
        async with AsyncSessionLocal() as db:
            return await statistics_service.get_rvol(db, trans_type, period1, period2)
    
    async def run_quadrant(period: int):
        async with AsyncSessionLocal() as db:
            return await statistics_service.get_quadrant(db, period)
    
    async def run_hpi(region_id, index_type: str, months: int):
        async with AsyncSessionLocal() as db:
            return await statistics_service.get_hpi(db, region_id, index_type, months)
    
    async def run_hpi_heatmap(index_type: str):
        async with AsyncSessionLocal() as db:
            return await statistics_service.get_hpi_heatmap(db, index_type)
    
    async def run_stat_summary(trans_type: str, period1: int, period2: int, period3: int):
        async with AsyncSessionLocal() as db:
            return await statistics_service.get_statistics_summary(db, trans_type, period1, period2, period3)
    
    async def run_dash_summary(trans_type: str, months: int):
        async with AsyncSessionLocal() as db:
            return await get_dashboard_summary(trans_type, months, db)
    
    async def run_dash_trends(trans_type: str, months: int):
        async with AsyncSessionLocal() as db:
            return await get_regional_trends(trans_type, months, db)
    
    async def run_dash_heatmap(trans_type: str, months: int):
        async with AsyncSessionLocal() as db:
            return await get_regional_heatmap(trans_type, months, db)
    
    async def run_dash_rankings(trans_type: str, days: int, months: int):
        async with AsyncSessionLocal() as db:
            return await get_dashboard_rankings(trans_type, days, months, db)
    
    async def run_transaction_volume(region_type: str, transaction_type: str, max_years: int):
        """거래량 통계 프리로딩"""
        async with AsyncSessionLocal() as db:
            return await get_transaction_volume(region_type, transaction_type, max_years, db)
    
    async def run_popular_apartment_detail():
        """인기 아파트 상세정보 프리로딩 (최근 거래량 상위 50개)"""
        from app.models.sale import Sale
        from app.models.apartment import Apartment
        from app.api.v1.endpoints.apartments import get_apartment_detail
        from datetime import date, timedelta
        
        async with AsyncSessionLocal() as db:
            # 최근 30일간 거래량 상위 50개 아파트 조회
            date_30_days_ago = date.today() - timedelta(days=30)
            
            stmt = (
                select(Sale.apt_id, func.count(Sale.trans_id).label('cnt'))
                .where(
                    and_(
                        Sale.contract_date >= date_30_days_ago,
                        Sale.is_canceled == False,
                        or_(Sale.is_deleted == False, Sale.is_deleted.is_(None))
                    )
                )
                .group_by(Sale.apt_id)
                .order_by(func.count(Sale.trans_id).desc())
                .limit(50)
            )
            
            result = await db.execute(stmt)
            popular_apt_ids = [row.apt_id for row in result.all()]
            
            logger.info(f" [Warmup] 인기 아파트 {len(popular_apt_ids)}개 상세정보 캐싱 시작")
            
            # 각 아파트 상세정보 프리로딩
            for apt_id in popular_apt_ids:
                try:
                    async with AsyncSessionLocal() as detail_db:
                        await get_apartment_detail(apt_id, detail_db)
                except Exception as e:
                    logger.debug(f" [Warmup] 아파트 {apt_id} 상세정보 캐싱 실패: {e}")
            
            return len(popular_apt_ids)
    
    # 작업 목록 생성
    tasks = []
    
    # RVOL (Sale/Rent, Periods)
    for trans_type in ["sale", "rent"]:
        tasks.append(("rvol", run_rvol(trans_type, 6, 6)))
        tasks.append(("rvol", run_rvol(trans_type, 3, 3)))
        
    # Quadrant (Periods)
    for period in [1, 2, 3, 6]:
        tasks.append(("quadrant", run_quadrant(period)))
        
    # HPI (Index Types, Months)
    for index_type in ["APT", "ALL"]:
        for months in [12, 24, 36, 60]:
            tasks.append(("hpi", run_hpi(None, index_type, months)))
    
    # HPI Heatmap
    for index_type in ["APT", "ALL"]:
        tasks.append(("hpi_heatmap", run_hpi_heatmap(index_type)))
        
    # Statistics Summary
    for trans_type in ["sale", "rent"]:
        tasks.append(("stat_summary", run_stat_summary(trans_type, 6, 6, 2)))

    # Dashboard Endpoints
    for trans_type in ["sale", "jeonse"]:
        for months in [6, 12]:
            tasks.append(("dash_summary", run_dash_summary(trans_type, months)))
            tasks.append(("dash_trends", run_dash_trends(trans_type, months)))
        
        tasks.append(("dash_heatmap", run_dash_heatmap(trans_type, 3)))
        tasks.append(("dash_rankings", run_dash_rankings(trans_type, 7, 3)))
        tasks.append(("dash_rankings", run_dash_rankings(trans_type, 30, 6)))

    # ============================================================
    # 거래량 통계 프리로딩 (연도별/월별 모든 조합)
    # ============================================================
    region_types = ["전국", "수도권", "지방5대광역시"]
    transaction_types = ["sale", "rent"]
    max_years_options = [1, 3, 5, 10]  # 1년, 3년, 5년, 10년
    
    for region_type in region_types:
        for trans_type in transaction_types:
            for max_years in max_years_options:
                tasks.append(("transaction_volume", run_transaction_volume(region_type, trans_type, max_years)))
    
    logger.info(f" [Warmup] 거래량 통계 프리로딩 작업 {len(region_types) * len(transaction_types) * len(max_years_options)}개 추가")
    
    # ============================================================
    # 인기 아파트 상세정보 프리로딩
    # ============================================================
    tasks.append(("popular_apartment_detail", run_popular_apartment_detail()))
    logger.info(" [Warmup] 인기 아파트 상세정보 프리로딩 작업 추가")

    # 순차적으로 실행하지 않고 병렬로 실행하되, DB 커넥션 풀 고갈 방지를 위해 세마포어 사용
    # 동시성 오류 방지를 위해 각 작업마다 별도의 세션 사용
    semaphore = asyncio.Semaphore(3)  # 동시에 3개까지만 실행
    
    async def run_task(name, coro):
        """각 작업 실행 (세마포어로 동시 실행 수 제한)"""
        async with semaphore:
            try:
                await coro
                return True
            except Exception as e:
                logger.warning(f" [Warmup] {name} 실패: {e}")
                return False

    results = await asyncio.gather(*[run_task(name, coro) for name, coro in tasks], return_exceptions=True)
    
    success_count = sum(1 for r in results if r is True)
    fail_count = sum(1 for r in results if r is not True)
    
    logger.info(f" [Warmup] 통계 데이터 캐싱 완료 - 성공: {success_count}, 실패: {fail_count}")
