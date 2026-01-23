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
# 빠른 실패를 위해 타임아웃을 최소화
MAX_CONNECTIONS = 10          # 최대 연결 수 (cache.t3.micro용)
SOCKET_TIMEOUT = 1.0          # 소켓 타임아웃 (초) - 5초 → 1초 (빠른 실패)
CONNECT_TIMEOUT = 1.0         # 연결 타임아웃 (초) - 3초 → 1초 (빠른 실패)
HEALTH_CHECK_INTERVAL = 60    # 헬스 체크 간격 (초)
PING_INTERVAL = 300.0         # Ping 체크 간격 (초) - 120초 → 300초 (5분)
REDIS_RETRY_INTERVAL = 60.0   # Redis 재연결 시도 간격 (초)

# 전역 Redis 클라이언트 인스턴스
_redis_client: Optional[Redis] = None
_last_ping_time: float = 0.0
_ping_interval: float = PING_INTERVAL
_redis_available: bool = True  # Redis 가용성 플래그
_redis_unavailable_since: float = 0.0  # Redis 비가용 시작 시간


async def get_redis_client(check_health: bool = False) -> Optional[Redis]:
    """
    Redis 클라이언트 인스턴스를 반환합니다 (싱글톤 패턴)
    
    애플리케이션 시작 시 한 번만 연결을 생성하고,
    이후에는 같은 인스턴스를 재사용합니다.
    
    성능 최적화:
    - 빠른 실패 (타임아웃 1초)
    - 연결 실패 시 60초간 재시도 안 함 (graceful degradation)
    - 재시도 없음 (retries=0)
    
    Args:
        check_health: True인 경우에만 연결 상태를 확인합니다 (기본: False)
                     일반적인 캐시 조회/저장 시에는 False로 설정하여 성능 최적화
    
    Returns:
        Redis: aioredis Redis 클라이언트 인스턴스 또는 None (연결 실패 시)
    """
    global _redis_client, _last_ping_time, _redis_available, _redis_unavailable_since
    
    current_time = time.time()
    
    # Redis가 비활성화된 경우, 일정 시간 후에만 재시도
    if not _redis_available:
        # 60초 후 재시도
        if current_time - _redis_unavailable_since < REDIS_RETRY_INTERVAL:
            return None
        # 재시도 허용
        _redis_available = True
        logger.info("🔄 Redis 재연결 시도...")
    
    if _redis_client is None:
        try:
            # 재시도 없음 - 빠른 실패
            retry = Retry(ExponentialBackoff(cap=0.5, base=0.1), retries=0)
            
            # Redis 연결 풀 생성 - 빠른 실패 설정
            _redis_client = aioredis.Redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                # ===== 연결 풀 설정 =====
                max_connections=MAX_CONNECTIONS,
                retry_on_timeout=False,  # 타임아웃 시 재시도 안 함
                retry=retry,
                # ===== 타임아웃 설정 (빠른 실패) =====
                socket_timeout=SOCKET_TIMEOUT,
                socket_connect_timeout=CONNECT_TIMEOUT,
                socket_keepalive=True,
                health_check_interval=HEALTH_CHECK_INTERVAL,
            )
            
            # 연결 테스트 (빠른 실패)
            import asyncio
            await asyncio.wait_for(_redis_client.ping(), timeout=CONNECT_TIMEOUT)
            
            logger.info(f"✅ Redis 연결 성공 (timeout: {CONNECT_TIMEOUT}s)")
            _last_ping_time = current_time
            _redis_available = True
        except Exception as e:
            logger.warning(f"⚠️ Redis 연결 실패 - 캐시 없이 진행 ({REDIS_RETRY_INTERVAL}초 후 재시도): {type(e).__name__}")
            _redis_available = False
            _redis_unavailable_since = current_time
            if _redis_client:
                try:
                    await _redis_client.close()
                except:
                    pass
            _redis_client = None
            return None
    
    # 주기적 헬스 체크 (간격 늘림)
    should_check = check_health or (current_time - _last_ping_time) >= _ping_interval
    
    if should_check:
        try:
            import asyncio
            await asyncio.wait_for(_redis_client.ping(), timeout=SOCKET_TIMEOUT)
            _last_ping_time = current_time
        except Exception as e:
            # 연결 실패 시 비활성화
            logger.warning(f"⚠️ Redis 헬스 체크 실패: {type(e).__name__}")
            try:
                await _redis_client.close()
            except:
                pass
            _redis_client = None
            _redis_available = False
            _redis_unavailable_since = current_time
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
