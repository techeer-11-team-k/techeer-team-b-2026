"""
Redis 클라이언트 관리

Redis 연결을 관리하고 싱글톤 패턴으로 클라이언트를 제공합니다.
"""
import logging
import time
from typing import Optional
from redis import asyncio as aioredis
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# 전역 Redis 클라이언트 인스턴스
_redis_client: Optional[Redis] = None
_last_ping_time: float = 0.0
_ping_interval: float = 30.0  # 30초마다 ping 체크


async def get_redis_client(check_health: bool = False) -> Redis:
    """
    Redis 클라이언트 인스턴스를 반환합니다 (싱글톤 패턴)
    
    애플리케이션 시작 시 한 번만 연결을 생성하고,
    이후에는 같은 인스턴스를 재사용합니다.
    
    Args:
        check_health: True인 경우에만 연결 상태를 확인합니다 (기본: False)
                     일반적인 캐시 조회/저장 시에는 False로 설정하여 성능 최적화
    
    Returns:
        Redis: aioredis Redis 클라이언트 인스턴스
    
    Raises:
        ConnectionError: Redis 연결 실패 시
    """
    global _redis_client, _last_ping_time
    
    if _redis_client is None:
        try:
            # Redis 연결 풀 생성
            _redis_client = aioredis.Redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,  # 문자열로 자동 디코딩
                max_connections=10,  # 최대 연결 수
                retry_on_timeout=True,  # 타임아웃 시 재시도
                socket_timeout=5.0,  # 소켓 타임아웃 (초)
                socket_connect_timeout=5.0,  # 연결 타임아웃 (초)
                health_check_interval=30,  # 헬스 체크 간격 (초)
            )
            logger.info("✅ Redis 클라이언트 연결 성공")
            _last_ping_time = time.time()
        except Exception as e:
            logger.error(f"❌ Redis 연결 실패: {e}")
            raise ConnectionError(f"Redis 연결 실패: {e}")
    
    # 주기적으로만 연결 상태 확인 (성능 최적화)
    # check_health가 True이거나 마지막 ping 이후 일정 시간이 지났을 때만 체크
    current_time = time.time()
    should_check = check_health or (current_time - _last_ping_time) >= _ping_interval
    
    if should_check:
        try:
            import asyncio
            # 짧은 타임아웃으로 빠르게 체크
            await asyncio.wait_for(_redis_client.ping(), timeout=2.0)
            _last_ping_time = current_time
        except asyncio.TimeoutError:
            # 타임아웃 발생 시에도 클라이언트는 반환 (실제 작업 시 재연결 시도)
            logger.debug("⚠️ Redis ping 타임아웃 (연결은 유지하고 계속 진행)")
        except Exception as e:
            # 연결 끊김 등의 심각한 오류인 경우에만 재연결 시도
            logger.warning(f"⚠️ Redis 연결 오류 감지: {e}")
            try:
                await _redis_client.close()
            except:
                pass
            _redis_client = None
            # 재연결 시도
            return await get_redis_client(check_health=False)
    
    return _redis_client


async def close_redis_client():
    """
    Redis 클라이언트 연결을 종료합니다
    
    애플리케이션 종료 시 호출됩니다.
    """
    global _redis_client
    
    if _redis_client is not None:
        try:
            await _redis_client.close()
            logger.info("✅ Redis 클라이언트 연결 종료")
        except Exception as e:
            logger.error(f"❌ Redis 연결 종료 실패: {e}")
        finally:
            _redis_client = None
