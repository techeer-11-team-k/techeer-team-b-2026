"""
캐시 무효화 이벤트 리스너

데이터 업데이트 시 관련 캐시를 자동으로 무효화합니다.
"""
import logging
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sale import Sale
from app.models.rent import Rent
from app.models.apartment import Apartment
from app.models.apart_detail import ApartDetail
from app.services.statistics_cache_service import statistics_cache_service

logger = logging.getLogger(__name__)


async def invalidate_apartment_cache(apt_id: int):
    """아파트 관련 캐시 무효화"""
    from app.utils.cache import delete_cache_pattern
    
    patterns = [
        f"realestate:apartment:detail:*:apt:{apt_id}",
        f"realestate:apartment:detail_v2:*:apt:{apt_id}",
        f"realestate:apartment:nearby_price:*:apt:{apt_id}:*",
        f"realestate:apartment:nearby_comparison:*:apt:{apt_id}:*",
    ]
    
    for pattern in patterns:
        await delete_cache_pattern(pattern)
    
    logger.debug(f"아파트 캐시 무효화 완료: apt_id={apt_id}")


async def invalidate_region_statistics_cache(region_id: int):
    """지역 통계 캐시 무효화"""
    # 통계 캐싱 서비스를 사용하여 무효화
    await statistics_cache_service.invalidate_statistics_cache(region_id=region_id)
    logger.debug(f"지역 통계 캐시 무효화 완료: region_id={region_id}")


# SQLAlchemy 이벤트 리스너 (동기 함수)
def setup_cache_invalidation_listeners():
    """캐시 무효화 이벤트 리스너 설정"""
    
    @event.listens_for(Sale, 'after_update')
    def sale_after_update(mapper, connection, target):
        """매매 데이터 업데이트 시 관련 캐시 무효화"""
        # 비동기 함수는 직접 호출할 수 없으므로 백그라운드 태스크로 실행
        import asyncio
        try:
            # 현재 이벤트 루프 가져오기
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # 이미 실행 중인 루프가 있으면 태스크로 추가
                asyncio.create_task(invalidate_region_statistics_cache(None))
                asyncio.create_task(invalidate_apartment_cache(target.apt_id))
            else:
                # 루프가 없으면 새로 실행
                loop.run_until_complete(invalidate_region_statistics_cache(None))
                loop.run_until_complete(invalidate_apartment_cache(target.apt_id))
        except Exception as e:
            logger.warning(f"캐시 무효화 실패 (무시): {e}")
    
    @event.listens_for(Rent, 'after_update')
    def rent_after_update(mapper, connection, target):
        """전월세 데이터 업데이트 시 관련 캐시 무효화"""
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(invalidate_region_statistics_cache(None))
                asyncio.create_task(invalidate_apartment_cache(target.apt_id))
            else:
                loop.run_until_complete(invalidate_region_statistics_cache(None))
                loop.run_until_complete(invalidate_apartment_cache(target.apt_id))
        except Exception as e:
            logger.warning(f"캐시 무효화 실패 (무시): {e}")
    
    @event.listens_for(Apartment, 'after_update')
    def apartment_after_update(mapper, connection, target):
        """아파트 데이터 업데이트 시 관련 캐시 무효화"""
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(invalidate_apartment_cache(target.apt_id))
                if target.region_id:
                    asyncio.create_task(invalidate_region_statistics_cache(target.region_id))
            else:
                loop.run_until_complete(invalidate_apartment_cache(target.apt_id))
                if target.region_id:
                    loop.run_until_complete(invalidate_region_statistics_cache(target.region_id))
        except Exception as e:
            logger.warning(f"캐시 무효화 실패 (무시): {e}")
    
    @event.listens_for(ApartDetail, 'after_update')
    def apart_detail_after_update(mapper, connection, target):
        """아파트 상세정보 업데이트 시 관련 캐시 무효화"""
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(invalidate_apartment_cache(target.apt_id))
            else:
                loop.run_until_complete(invalidate_apartment_cache(target.apt_id))
        except Exception as e:
            logger.warning(f"캐시 무효화 실패 (무시): {e}")
    
    logger.info("캐시 무효화 이벤트 리스너 설정 완료")


# 앱 시작 시 이벤트 리스너 등록
def register_cache_invalidation():
    """캐시 무효화 이벤트 리스너 등록"""
    setup_cache_invalidation_listeners()
