"""
Redis 클라이언트 관리

Redis 연결을 관리하고 싱글톤 패턴으로 클라이언트를 제공합니다.

성능 최적화 (ElastiCache 환경):
- 연결 풀 크기 최적화 (cache.t3.micro 고려)
- 재시도 로직 및 백오프 전략
- 연결 상태 모니터링 간격 증가 (불필요한 ping 최소화)
- 연결 실패 시 graceful degradation
"""
import logging
import time
from typing import Optional
from redis import asyncio as aioredis
from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialBackoff

from app.core.config import settings

logger = logging.getLogger(__name__)

# ===== ElastiCache 최적화 설정 =====
MAX_CONNECTIONS = 10          # 최대 연결 수 (cache.t3.micro용)
SOCKET_TIMEOUT = 5.0          # 소켓 타임아웃 (초) - 10초 → 5초
CONNECT_TIMEOUT = 3.0         # 연결 타임아웃 (초) - 10초 → 3초
HEALTH_CHECK_INTERVAL = 60    # 헬스 체크 간격 (초)
PING_INTERVAL = 120.0         # Ping 체크 간격 (초) - 60초 → 120초

# 전역 Redis 클라이언트 인스턴스
_redis_client: Optional[Redis] = None
_last_ping_time: float = 0.0
_ping_interval: float = PING_INTERVAL
_redis_available: bool = True  # Redis 가용성 플래그


async def get_redis_client(check_health: bool = False) -> Optional[Redis]:
    """
    Redis 클라이언트 인스턴스를 반환합니다 (싱글톤 패턴)
    
    애플리케이션 시작 시 한 번만 연결을 생성하고,
    이후에는 같은 인스턴스를 재사용합니다.
    
    성능 최적화:
    - Ping 체크 간격 증가 (120초)
    - 연결 실패 시 graceful degradation (None 반환)
    - 타임아웃 단축으로 빠른 실패
    
    Args:
        check_health: True인 경우에만 연결 상태를 확인합니다 (기본: False)
                     일반적인 캐시 조회/저장 시에는 False로 설정하여 성능 최적화
    
    Returns:
        Redis: aioredis Redis 클라이언트 인스턴스 또는 None (연결 실패 시)
    """
    global _redis_client, _last_ping_time, _redis_available
    
    # Redis가 비활성화된 경우 빠르게 None 반환
    if not _redis_available:
        return None
    
    if _redis_client is None:
        try:
            # 재시도 전략 설정 (지수 백오프, 최대 2회)
            retry = Retry(ExponentialBackoff(cap=1, base=0.5), retries=2)
            
            # Redis 연결 풀 생성 - ElastiCache cache.t3.micro 최적화
            _redis_client = aioredis.Redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                # ===== 연결 풀 설정 (cache.t3.micro 최적화) =====
                max_connections=MAX_CONNECTIONS,
                retry_on_timeout=True,
                retry=retry,
                # ===== 타임아웃 설정 (단축) =====
                socket_timeout=SOCKET_TIMEOUT,
                socket_connect_timeout=CONNECT_TIMEOUT,
                socket_keepalive=True,
                health_check_interval=HEALTH_CHECK_INTERVAL,
            )
            logger.info(f"✅ Redis 클라이언트 연결 성공 - max_connections: {MAX_CONNECTIONS}")
            _last_ping_time = time.time()
            _redis_available = True
        except Exception as e:
            logger.warning(f"⚠️ Redis 연결 실패 (캐싱 비활성화): {e}")
            _redis_available = False
            return None
    
    # 주기적으로만 연결 상태 확인 (성능 최적화)
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
            # 재연결 시도 (1회만)
            try:
                return await get_redis_client(check_health=False)
            except:
                _redis_available = False
                return None
    
    return _redis_client


def is_redis_available() -> bool:
    """Redis 가용성 확인 (캐시 사용 여부 판단용)"""
    return _redis_available


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
