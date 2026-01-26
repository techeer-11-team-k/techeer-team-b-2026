"""
통계 캐시 스케줄러

주기적으로 모든 통계 조합을 사전 계산하여 Redis에 저장합니다.
"""
import asyncio
import logging
from datetime import datetime, time
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.services.statistics_cache_service import statistics_cache_service

logger = logging.getLogger(__name__)


async def precompute_statistics_task():
    """통계 사전 계산 작업"""
    logger.info("통계 사전 계산 작업 시작")
    
    try:
        async with async_session() as db:
            results = await statistics_cache_service.precompute_all_statistics(
                db,
                endpoints=["transaction-volume", "rvol", "hpi", "market-phase"]
            )
            
            logger.info(f"통계 사전 계산 완료: {results}")
    except Exception as e:
        logger.error(f"통계 사전 계산 실패: {e}", exc_info=True)


async def run_statistics_scheduler():
    """통계 캐시 스케줄러 실행"""
    logger.info("통계 캐시 스케줄러 시작")
    
    while True:
        try:
            # 현재 시간 확인
            now = datetime.now()
            current_time = now.time()
            
            # 매일 새벽 2시에 실행
            target_time = time(2, 0)  # 02:00
            
            # 다음 실행 시간 계산
            if current_time < target_time:
                # 오늘 실행
                next_run = datetime.combine(now.date(), target_time)
            else:
                # 내일 실행
                from datetime import timedelta
                next_run = datetime.combine(
                    now.date() + timedelta(days=1),
                    target_time
                )
            
            wait_seconds = (next_run - now).total_seconds()
            logger.info(f"다음 통계 사전 계산 예정: {next_run} (대기 시간: {wait_seconds:.0f}초)")
            
            # 대기
            await asyncio.sleep(wait_seconds)
            
            # 통계 사전 계산 실행
            await precompute_statistics_task()
            
        except Exception as e:
            logger.error(f"스케줄러 오류: {e}", exc_info=True)
            # 오류 발생 시 1시간 후 재시도
            await asyncio.sleep(3600)


# FastAPI 앱 시작 시 스케줄러 실행
async def start_statistics_scheduler():
    """스케줄러를 백그라운드 태스크로 시작"""
    asyncio.create_task(run_statistics_scheduler())
    logger.info("통계 캐시 스케줄러가 백그라운드에서 시작되었습니다")


# 수동 실행용 (테스트 또는 즉시 실행)
if __name__ == "__main__":
    async def main():
        await precompute_statistics_task()
    
    asyncio.run(main())
