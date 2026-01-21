"""
데이터 수집 캐시 유틸리티

아파트 정규화 및 매칭에 사용되는 캐시를 관리합니다.
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import asyncio

logger = logging.getLogger(__name__)


class NormalizationCache:
    """
    아파트 이름 정규화 결과 캐시
    
    정규화 계산은 비용이 높으므로 결과를 캐싱하여 재사용합니다.
    """
    
    _instance = None
    _cache: Dict[str, Dict[str, Any]] = {}
    _max_size: int = 100000  # 최대 캐시 크기
    _hits: int = 0
    _misses: int = 0
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """캐시에서 값 조회"""
        if key in self._cache:
            self._hits += 1
            return self._cache[key]
        self._misses += 1
        return None
    
    def set(self, key: str, value: Dict[str, Any]) -> None:
        """캐시에 값 저장"""
        # 캐시 크기 제한
        if len(self._cache) >= self._max_size:
            # 가장 오래된 항목 10% 삭제 (간단한 LRU 대체)
            keys_to_remove = list(self._cache.keys())[:int(self._max_size * 0.1)]
            for k in keys_to_remove:
                del self._cache[k]
        
        self._cache[key] = value
    
    def get_or_compute(
        self,
        key: str,
        compute_func: callable
    ) -> Dict[str, Any]:
        """캐시에서 조회하거나 없으면 계산 후 저장"""
        result = self.get(key)
        if result is not None:
            return result
        
        result = compute_func()
        self.set(key, result)
        return result
    
    def clear(self) -> None:
        """캐시 초기화"""
        self._cache.clear()
        self._hits = 0
        self._misses = 0
    
    def get_stats(self) -> Dict[str, Any]:
        """캐시 통계 반환"""
        total = self._hits + self._misses
        hit_rate = self._hits / total * 100 if total > 0 else 0
        return {
            "size": len(self._cache),
            "max_size": self._max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": f"{hit_rate:.2f}%"
        }


class RegionApartmentCache:
    """
    지역별 아파트 목록 캐시
    
    시군구 코드별 아파트 목록을 캐싱하여 DB 조회 횟수를 줄입니다.
    """
    
    _instance = None
    _cache: Dict[str, Dict[str, Any]] = {}
    _ttl_seconds: int = 3600  # 1시간
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def get(self, sgg_cd: str) -> Optional[Dict[str, Any]]:
        """캐시에서 지역별 아파트 목록 조회"""
        if sgg_cd not in self._cache:
            return None
        
        entry = self._cache[sgg_cd]
        # TTL 확인
        if datetime.now() > entry["expires_at"]:
            del self._cache[sgg_cd]
            return None
        
        return entry["data"]
    
    def set(
        self,
        sgg_cd: str,
        apartments: List[Any],
        regions: Dict[int, Any],
        details: Dict[int, Any]
    ) -> None:
        """캐시에 지역별 아파트 목록 저장"""
        self._cache[sgg_cd] = {
            "data": {
                "apartments": apartments,
                "regions": regions,
                "details": details
            },
            "expires_at": datetime.now() + timedelta(seconds=self._ttl_seconds),
            "created_at": datetime.now()
        }
    
    def invalidate(self, sgg_cd: str) -> None:
        """특정 지역 캐시 무효화"""
        if sgg_cd in self._cache:
            del self._cache[sgg_cd]
    
    def clear(self) -> None:
        """전체 캐시 초기화"""
        self._cache.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """캐시 통계 반환"""
        active_entries = sum(
            1 for entry in self._cache.values()
            if datetime.now() <= entry["expires_at"]
        )
        return {
            "total_entries": len(self._cache),
            "active_entries": active_entries,
            "ttl_seconds": self._ttl_seconds
        }


class AptSeqCache:
    """
    apt_seq → apt_id 매핑 캐시
    
    API의 aptSeq를 DB의 apt_id로 빠르게 변환합니다.
    """
    
    _instance = None
    _cache: Dict[str, int] = {}  # apt_seq → apt_id
    _reverse_cache: Dict[int, str] = {}  # apt_id → apt_seq
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def get_apt_id(self, apt_seq: str) -> Optional[int]:
        """apt_seq로 apt_id 조회"""
        return self._cache.get(apt_seq.strip())
    
    def get_apt_seq(self, apt_id: int) -> Optional[str]:
        """apt_id로 apt_seq 조회"""
        return self._reverse_cache.get(apt_id)
    
    def set(self, apt_seq: str, apt_id: int) -> None:
        """매핑 저장"""
        apt_seq_clean = apt_seq.strip()
        self._cache[apt_seq_clean] = apt_id
        self._reverse_cache[apt_id] = apt_seq_clean
    
    def load_from_db(self, mappings: List[tuple]) -> None:
        """
        DB에서 apt_seq 매핑 로드
        
        Args:
            mappings: List of (apt_id, apt_seq) tuples
        """
        for apt_id, apt_seq in mappings:
            if apt_seq:
                self.set(apt_seq, apt_id)
        
        logger.info(f"✅ apt_seq 캐시 로드 완료: {len(self._cache)}개 매핑")
    
    def clear(self) -> None:
        """캐시 초기화"""
        self._cache.clear()
        self._reverse_cache.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """캐시 통계 반환"""
        return {
            "total_mappings": len(self._cache)
        }


# 싱글톤 인스턴스
normalization_cache = NormalizationCache()
region_apartment_cache = RegionApartmentCache()
apt_seq_cache = AptSeqCache()


def get_cache_stats() -> Dict[str, Any]:
    """모든 캐시 통계 반환"""
    return {
        "normalization": normalization_cache.get_stats(),
        "region_apartment": region_apartment_cache.get_stats(),
        "apt_seq": apt_seq_cache.get_stats()
    }


def clear_all_caches() -> None:
    """모든 캐시 초기화"""
    normalization_cache.clear()
    region_apartment_cache.clear()
    apt_seq_cache.clear()
    logger.info("✅ 모든 캐시 초기화 완료")
