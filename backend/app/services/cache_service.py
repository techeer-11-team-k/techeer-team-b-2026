"""
Redis 캐싱 서비스

애플리케이션 전반에 걸쳐 사용되는 캐싱 로직을 중앙 집중화합니다.
"""
import logging
import json
from typing import Optional, Any, Callable, TypeVar
from functools import wraps
import hashlib

from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CacheService:
    """Redis 캐싱 서비스"""
    
    # 캐시 TTL (초 단위)
    TTL_5_MINUTES = 300
    TTL_10_MINUTES = 600
    TTL_30_MINUTES = 1800
    TTL_1_HOUR = 3600
    TTL_6_HOURS = 21600
    TTL_1_DAY = 86400
    
    @staticmethod
    def _generate_cache_key(prefix: str, *args, **kwargs) -> str:
        """
        캐시 키 생성
        
        Args:
            prefix: 키 접두사
            *args: 위치 인자
            **kwargs: 키워드 인자
        
        Returns:
            생성된 캐시 키
        """
        # 인자들을 정렬된 문자열로 변환
        key_parts = [prefix]
        
        # 위치 인자 추가
        for arg in args:
            if arg is not None:
                key_parts.append(str(arg))
        
        # 키워드 인자 추가 (정렬하여 일관성 유지)
        for k, v in sorted(kwargs.items()):
            if v is not None:
                key_parts.append(f"{k}:{v}")
        
        # 키가 너무 길면 해시 사용
        key_str = ":".join(key_parts)
        if len(key_str) > 200:
            hash_suffix = hashlib.md5(key_str.encode()).hexdigest()[:16]
            key_str = f"{prefix}:hash:{hash_suffix}"
        
        return key_str
    
    @staticmethod
    async def get(key: str) -> Optional[Any]:
        """
        캐시에서 값 가져오기
        
        Args:
            key: 캐시 키
        
        Returns:
            캐시된 값 (없으면 None)
        """
        try:
            redis_client = await get_redis_client()
            value = await redis_client.get(key)
            
            if value:
                logger.debug(f"✅ Cache HIT: {key}")
                return json.loads(value)
            else:
                logger.debug(f"❌ Cache MISS: {key}")
                return None
        except Exception as e:
            logger.warning(f"캐시 조회 실패 (키: {key}): {e}")
            return None
    
    @staticmethod
    async def set(key: str, value: Any, ttl: int = TTL_5_MINUTES) -> bool:
        """
        캐시에 값 저장
        
        Args:
            key: 캐시 키
            value: 저장할 값
            ttl: TTL (초)
        
        Returns:
            성공 여부
        """
        try:
            redis_client = await get_redis_client()
            serialized = json.dumps(value, ensure_ascii=False)
            await redis_client.set(key, serialized, ex=ttl)
            logger.debug(f"💾 Cache SET: {key} (TTL: {ttl}s)")
            return True
        except Exception as e:
            logger.warning(f"캐시 저장 실패 (키: {key}): {e}")
            return False
    
    @staticmethod
    async def delete(key: str) -> bool:
        """
        캐시 삭제
        
        Args:
            key: 캐시 키
        
        Returns:
            성공 여부
        """
        try:
            redis_client = await get_redis_client()
            await redis_client.delete(key)
            logger.debug(f"🗑️ Cache DELETE: {key}")
            return True
        except Exception as e:
            logger.warning(f"캐시 삭제 실패 (키: {key}): {e}")
            return False
    
    @staticmethod
    async def delete_pattern(pattern: str) -> int:
        """
        패턴에 매칭되는 모든 캐시 삭제
        
        Args:
            pattern: 키 패턴 (예: "dashboard:*")
        
        Returns:
            삭제된 키 개수
        """
        try:
            redis_client = await get_redis_client()
            # SCAN을 사용하여 키 찾기 (KEYS는 프로덕션에서 위험)
            keys = []
            cursor = 0
            while True:
                cursor, partial_keys = await redis_client.scan(cursor, match=pattern, count=100)
                keys.extend(partial_keys)
                if cursor == 0:
                    break
            
            if keys:
                deleted = await redis_client.delete(*keys)
                logger.info(f"🗑️ Cache DELETE PATTERN: {pattern} ({deleted} keys)")
                return deleted
            return 0
        except Exception as e:
            logger.warning(f"캐시 패턴 삭제 실패 (패턴: {pattern}): {e}")
            return 0


def cached(ttl: int = CacheService.TTL_5_MINUTES, key_prefix: str = None):
    """
    함수 결과를 캐싱하는 데코레이터
    
    Usage:
        @cached(ttl=300, key_prefix="apartment")
        async def get_apartment(apartment_id: int):
            return await db.query(...)
    
    Args:
        ttl: TTL (초)
        key_prefix: 캐시 키 접두사
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            # 캐시 키 생성
            prefix = key_prefix or func.__name__
            cache_key = CacheService._generate_cache_key(prefix, *args, **kwargs)
            
            # 캐시 조회
            cached_value = await CacheService.get(cache_key)
            if cached_value is not None:
                return cached_value
            
            # 캐시 미스 - 함수 실행
            result = await func(*args, **kwargs)
            
            # 결과 캐싱
            if result is not None:
                await CacheService.set(cache_key, result, ttl)
            
            return result
        
        return wrapper
    return decorator


# 전역 캐시 서비스 인스턴스
cache_service = CacheService()
