"""
Redis 클라이언트 관리

Redis 연결을 관리하고 싱글톤 패턴으로 클라이언트를 제공합니다.
"""
import logging
from typing import Optional
from redis import asyncio as aioredis
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# 전역 Redis 클라이언트 인스턴스
_redis_client: Optional[Redis] = None


async def get_redis_client() -> Redis:
    """
    Redis 클라이언트 인스턴스를 반환합니다 (싱글톤 패턴)
    
    애플리케이션 시작 시 한 번만 연결을 생성하고,
    이후에는 같은 인스턴스를 재사용합니다.
    
    Returns:
        Redis: aioredis Redis 클라이언트 인스턴스
    
    Raises:
        ConnectionError: Redis 연결 실패 시
    """
    global _redis_client
    
    if _redis_client is None:
        try:
            # Redis 연결 풀 생성
            _redis_client = aioredis.Redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,  # 문자열로 자동 디코딩
                max_connections=10,  # 최대 연결 수
                retry_on_timeout=True,  # 타임아웃 시 재시도
            )
            logger.info("✅ Redis 클라이언트 연결 성공")
        except Exception as e:
            logger.error(f"❌ Redis 연결 실패: {e}")
            raise ConnectionError(f"Redis 연결 실패: {e}")
    
    # 연결 상태 확인 (타임아웃 설정)
    try:
        import asyncio
        await asyncio.wait_for(_redis_client.ping(), timeout=5.0)
    except asyncio.TimeoutError:
        logger.warning("⚠️ Redis ping 타임아웃 (연결은 유지하고 계속 진행)")
    except Exception as e:
        logger.warning(f"⚠️ Redis 연결 끊김, 재연결 시도: {e}")
        _redis_client = None
        return await get_redis_client()
    
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
