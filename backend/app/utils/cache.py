"""
캐시 유틸리티 함수

Redis 캐싱을 위한 헬퍼 함수들을 제공합니다.
"""
import json
import logging
from typing import Optional, Any, List, Dict
from datetime import timedelta

from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)

# 캐시 키 네임스페이스
CACHE_NAMESPACE = "realestate"

# 기본 TTL (초 단위)
DEFAULT_TTL = 3600  # 1시간


def build_cache_key(*parts: str) -> str:
    """
    캐시 키를 생성합니다
    
    네임스페이스 패턴을 사용하여 키 충돌을 방지합니다.
    예: "realestate:favorite:locations:account:1"
    
    Args:
        *parts: 캐시 키의 각 부분
    
    Returns:
        str: 완성된 캐시 키
    """
    key_parts = [CACHE_NAMESPACE] + [str(part) for part in parts]
    return ":".join(key_parts)


async def get_from_cache(key: str) -> Optional[Any]:
    """
    Redis에서 캐시된 값을 조회합니다
    
    Args:
        key: 캐시 키
    
    Returns:
        캐시된 값 (JSON 디코딩됨) 또는 None
    """
    try:
        redis_client = await get_redis_client()
        cached_value = await redis_client.get(key)
        
        if cached_value is None:
            return None
        
        # JSON 디코딩
        return json.loads(cached_value)
    except Exception as e:
        logger.warning(f"⚠️ 캐시 조회 실패 (키: {key}): {e}")
        return None


async def set_to_cache(
    key: str,
    value: Any,
    ttl: int = DEFAULT_TTL
) -> bool:
    """
    Redis에 값을 캐시합니다
    
    Args:
        key: 캐시 키
        value: 캐시할 값 (JSON 직렬화 가능한 객체)
        ttl: 캐시 유효 시간 (초 단위, 기본 1시간)
    
    Returns:
        bool: 성공 여부
    """
    try:
        redis_client = await get_redis_client()
        
        # JSON 인코딩
        serialized_value = json.dumps(value, ensure_ascii=False, default=str)
        
        # Redis에 저장 (TTL 설정)
        await redis_client.setex(key, ttl, serialized_value)
        logger.debug(f"✅ 캐시 저장 성공 (키: {key}, TTL: {ttl}초)")
        return True
    except Exception as e:
        logger.warning(f"⚠️ 캐시 저장 실패 (키: {key}): {e}")
        return False


async def delete_from_cache(key: str) -> bool:
    """
    Redis에서 캐시를 삭제합니다
    
    Args:
        key: 삭제할 캐시 키
    
    Returns:
        bool: 성공 여부
    """
    try:
        redis_client = await get_redis_client()
        deleted_count = await redis_client.delete(key)
        logger.debug(f"✅ 캐시 삭제 성공 (키: {key})")
        return deleted_count > 0
    except Exception as e:
        logger.warning(f"⚠️ 캐시 삭제 실패 (키: {key}): {e}")
        return False


async def delete_cache_pattern(pattern: str) -> int:
    """
    패턴에 맞는 모든 캐시를 삭제합니다
    
    예: "realestate:favorite:locations:account:1:*" 패턴으로
    해당 계정의 모든 관심 지역 캐시를 삭제
    
    Args:
        pattern: 삭제할 캐시 키 패턴 (와일드카드 지원)
    
    Returns:
        int: 삭제된 캐시 개수
    """
    try:
        redis_client = await get_redis_client()
        
        # 패턴에 맞는 키 찾기
        keys = []
        async for key in redis_client.scan_iter(match=pattern):
            keys.append(key)
        
        if not keys:
            return 0
        
        # 일괄 삭제
        deleted_count = await redis_client.delete(*keys)
        logger.debug(f"✅ 패턴 캐시 삭제 성공 (패턴: {pattern}, 삭제: {deleted_count}개)")
        return deleted_count
    except Exception as e:
        logger.warning(f"⚠️ 패턴 캐시 삭제 실패 (패턴: {pattern}): {e}")
        return 0


# ============ 즐겨찾기 관련 캐시 키 헬퍼 ============

def get_favorite_locations_cache_key(account_id: int, skip: int = 0, limit: int = 50) -> str:
    """
    관심 지역 목록 조회 캐시 키 생성
    
    Args:
        account_id: 계정 ID
        skip: 건너뛸 레코드 수
        limit: 가져올 레코드 수
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("favorite", "locations", "account", str(account_id), f"skip:{skip}", f"limit:{limit}")


def get_favorite_locations_count_cache_key(account_id: int) -> str:
    """
    관심 지역 개수 조회 캐시 키 생성
    
    Args:
        account_id: 계정 ID
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("favorite", "locations", "count", "account", str(account_id))


def get_favorite_location_pattern_key(account_id: int) -> str:
    """
    특정 계정의 모든 관심 지역 캐시 패턴 키 생성
    
    캐시 무효화 시 사용합니다.
    
    Args:
        account_id: 계정 ID
    
    Returns:
        str: 캐시 키 패턴
    """
    return build_cache_key("favorite", "locations", "account", str(account_id), "*")


# ============ 아파트 즐겨찾기 관련 캐시 키 헬퍼 ============

def get_favorite_apartments_cache_key(account_id: int, skip: int = 0, limit: int = 50) -> str:
    """
    관심 아파트 목록 조회 캐시 키 생성
    
    Args:
        account_id: 계정 ID
        skip: 건너뛸 레코드 수
        limit: 가져올 레코드 수
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("favorite", "apartments", "account", str(account_id), f"skip:{skip}", f"limit:{limit}")


def get_favorite_apartments_count_cache_key(account_id: int) -> str:
    """
    관심 아파트 개수 조회 캐시 키 생성
    
    Args:
        account_id: 계정 ID
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("favorite", "apartments", "count", "account", str(account_id))


def get_favorite_apartment_pattern_key(account_id: int) -> str:
    """
    특정 계정의 모든 관심 아파트 캐시 패턴 키 생성
    
    캐시 무효화 시 사용합니다.
    
    Args:
        account_id: 계정 ID
    
    Returns:
        str: 캐시 키 패턴
    """
    return build_cache_key("favorite", "apartments", "account", str(account_id), "*")


# ============ 사용자 프로필 관련 캐시 키 헬퍼 ============

def get_user_profile_cache_key(account_id: int) -> str:
    """
    사용자 프로필 조회 캐시 키 생성
    
    Args:
        account_id: 계정 ID
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("user", "profile", "account", str(account_id))


# ============ 내 집 관련 캐시 키 헬퍼 ============

def get_my_properties_cache_key(account_id: int, skip: int = 0, limit: int = 100) -> str:
    """
    내 집 목록 조회 캐시 키 생성
    
    Args:
        account_id: 계정 ID
        skip: 건너뛸 레코드 수
        limit: 가져올 레코드 수
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("my_property", "list", "account", str(account_id), f"skip:{skip}", f"limit:{limit}")


def get_my_properties_count_cache_key(account_id: int) -> str:
    """
    내 집 개수 조회 캐시 키 생성
    
    Args:
        account_id: 계정 ID
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("my_property", "count", "account", str(account_id))


def get_my_property_detail_cache_key(account_id: int, property_id: int) -> str:
    """
    내 집 상세 조회 캐시 키 생성
    
    Args:
        account_id: 계정 ID
        property_id: 내 집 ID
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("my_property", "detail", "account", str(account_id), "property", str(property_id))


def get_my_property_pattern_key(account_id: int) -> str:
    """
    특정 계정의 모든 내 집 캐시 패턴 키 생성
    
    캐시 무효화 시 사용합니다.
    
    Args:
        account_id: 계정 ID
    
    Returns:
        str: 캐시 키 패턴
    """
    return build_cache_key("my_property", "*", "account", str(account_id), "*")


def get_my_property_compliment_cache_key(property_id: int) -> str:
    """
    내 집 칭찬글 캐시 키 생성
    
    Args:
        property_id: 내 집 ID
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("my_property", "compliment", "property", str(property_id))


# ============ 아파트 AI 요약 관련 캐시 키 헬퍼 ============

def get_apartment_summary_cache_key(apt_id: int) -> str:
    """
    아파트 AI 요약 캐시 키 생성
    
    Args:
        apt_id: 아파트 ID
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("apartment", "summary", "apt", str(apt_id))


# ============ 주변 아파트 평균 가격 관련 캐시 키 헬퍼 ============

def get_nearby_price_cache_key(apt_id: int, months: int) -> str:
    """
    주변 아파트 평균 가격 캐시 키 생성
    
    Args:
        apt_id: 아파트 ID
        months: 조회 기간 (개월)
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key("apartment", "nearby_price", "apt", str(apt_id), "months", str(months))


def get_nearby_comparison_cache_key(apt_id: int, months: int, radius_meters: int = 500) -> str:
    """
    주변 아파트 비교 캐시 키 생성
    
    Args:
        apt_id: 아파트 ID
        months: 가격 계산 기간 (개월)
        radius_meters: 검색 반경 (미터, 기본값: 500)
    
    Returns:
        str: 캐시 키
    """
    return build_cache_key(
        "apartment", 
        "nearby_comparison", 
        "apt", 
        str(apt_id), 
        "months", 
        str(months),
        "radius",
        str(radius_meters)
    )
