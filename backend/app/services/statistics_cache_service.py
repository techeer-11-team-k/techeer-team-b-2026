"""
통계 캐싱 서비스

드롭다운 필터를 고려한 모든 통계 조합을 Redis에 사전 계산하여 저장합니다.
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import date, datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, extract

from app.models.sale import Sale
from app.models.rent import Rent
from app.models.apartment import Apartment
from app.models.state import State
from app.utils.cache import get_from_cache, set_to_cache, generate_hash_key, delete_cache_pattern

logger = logging.getLogger(__name__)

# 통계 캐시 TTL (초 단위)
STATISTICS_CACHE_TTL = 21600  # 6시간


class StatisticsCacheService:
    """통계 캐싱 서비스 클래스"""
    
    # 모든 가능한 필터 조합
    REGION_TYPES = ["전국", "수도권", "지방5대광역시"]
    TRANSACTION_TYPES = ["sale", "rent"]
    MAX_YEARS_OPTIONS = [1, 3, 5, 10]
    CITIES = ["부산광역시", "대구광역시", "광주광역시", "대전광역시", "울산광역시"]
    
    @staticmethod
    def generate_cache_key(
        endpoint: str,
        region_type: str,
        city_name: Optional[str] = None,
        transaction_type: str = "sale",
        max_years: int = 10,
        **kwargs
    ) -> str:
        """
        통계 캐시 키 생성 (모든 필터 조합 고려)
        
        Args:
            endpoint: API 엔드포인트명 (예: "transaction-volume", "rvol")
            region_type: 지역 유형
            city_name: 시도명 (지방5대광역시일 때)
            transaction_type: 거래 유형
            max_years: 최대 연도 수
            **kwargs: 추가 필터 파라미터
        
        Returns:
            캐시 키 (해시 기반)
        """
        key_params = {
            "endpoint": endpoint,
            "region_type": region_type,
            "city_name": city_name or "all",
            "transaction_type": transaction_type,
            "max_years": max_years,
            **kwargs
        }
        
        return generate_hash_key("statistics", **key_params)
    
    async def get_cached_statistics(
        self,
        endpoint: str,
        region_type: str,
        city_name: Optional[str] = None,
        transaction_type: str = "sale",
        max_years: int = 10,
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """
        캐시된 통계 데이터 조회
        
        Returns:
            캐시된 통계 데이터 또는 None
        """
        cache_key = self.generate_cache_key(
            endpoint, region_type, city_name, transaction_type, max_years, **kwargs
        )
        
        cached_data = await get_from_cache(cache_key)
        if cached_data:
            logger.debug(f"캐시 히트: {cache_key}")
            return cached_data
        
        logger.debug(f"캐시 미스: {cache_key}")
        return None
    
    async def cache_statistics(
        self,
        endpoint: str,
        data: Dict[str, Any],
        region_type: str,
        city_name: Optional[str] = None,
        transaction_type: str = "sale",
        max_years: int = 10,
        ttl: int = STATISTICS_CACHE_TTL,
        **kwargs
    ) -> bool:
        """
        통계 데이터를 캐시에 저장
        
        Returns:
            저장 성공 여부
        """
        cache_key = self.generate_cache_key(
            endpoint, region_type, city_name, transaction_type, max_years, **kwargs
        )
        
        success = await set_to_cache(cache_key, data, ttl=ttl)
        if success:
            logger.debug(f"캐시 저장 성공: {cache_key}")
        else:
            logger.warning(f"캐시 저장 실패: {cache_key}")
        
        return success
    
    async def precompute_all_statistics(
        self,
        db: AsyncSession,
        endpoints: Optional[List[str]] = None
    ) -> Dict[str, int]:
        """
        모든 통계 조합을 사전 계산하여 Redis에 저장
        
        Args:
            db: 데이터베이스 세션
            endpoints: 사전 계산할 엔드포인트 목록 (None이면 모든 엔드포인트)
        
        Returns:
            각 엔드포인트별 계산된 통계 개수
        """
        if endpoints is None:
            endpoints = ["transaction-volume", "rvol", "hpi", "market-phase"]
        
        results = {}
        
        for endpoint in endpoints:
            count = 0
            
            # 각 지역 유형별로 계산
            for region_type in self.REGION_TYPES:
                # 전국/수도권의 경우
                if region_type in ["전국", "수도권"]:
                    for transaction_type in self.TRANSACTION_TYPES:
                        for max_years in self.MAX_YEARS_OPTIONS:
                            try:
                                data = await self._calculate_statistics(
                                    db, endpoint, region_type, None,
                                    transaction_type, max_years
                                )
                                
                                if data:
                                    await self.cache_statistics(
                                        endpoint, data, region_type, None,
                                        transaction_type, max_years
                                    )
                                    count += 1
                            except Exception as e:
                                logger.error(
                                    f"통계 계산 실패: {endpoint}, "
                                    f"region_type={region_type}, "
                                    f"transaction_type={transaction_type}, "
                                    f"max_years={max_years}, error={e}"
                                )
                
                # 지방5대광역시의 경우 각 도시별로도 계산
                elif region_type == "지방5대광역시":
                    # 전체 지방5대광역시
                    for transaction_type in self.TRANSACTION_TYPES:
                        for max_years in self.MAX_YEARS_OPTIONS:
                            try:
                                data = await self._calculate_statistics(
                                    db, endpoint, region_type, None,
                                    transaction_type, max_years
                                )
                                
                                if data:
                                    await self.cache_statistics(
                                        endpoint, data, region_type, None,
                                        transaction_type, max_years
                                    )
                                    count += 1
                            except Exception as e:
                                logger.error(
                                    f"통계 계산 실패: {endpoint}, "
                                    f"region_type={region_type}, "
                                    f"transaction_type={transaction_type}, "
                                    f"max_years={max_years}, error={e}"
                                )
                    
                    # 각 도시별
                    for city in self.CITIES:
                        for transaction_type in self.TRANSACTION_TYPES:
                            for max_years in self.MAX_YEARS_OPTIONS:
                                try:
                                    data = await self._calculate_statistics(
                                        db, endpoint, region_type, city,
                                        transaction_type, max_years
                                    )
                                    
                                    if data:
                                        await self.cache_statistics(
                                            endpoint, data, region_type, city,
                                            transaction_type, max_years
                                        )
                                        count += 1
                                except Exception as e:
                                    logger.error(
                                        f"통계 계산 실패: {endpoint}, "
                                        f"region_type={region_type}, "
                                        f"city={city}, "
                                        f"transaction_type={transaction_type}, "
                                        f"max_years={max_years}, error={e}"
                                    )
            
            results[endpoint] = count
            logger.info(f"{endpoint} 통계 사전 계산 완료: {count}개 조합")
        
        total = sum(results.values())
        logger.info(f"전체 통계 사전 계산 완료: 총 {total}개 조합")
        
        return results
    
    async def _calculate_statistics(
        self,
        db: AsyncSession,
        endpoint: str,
        region_type: str,
        city_name: Optional[str] = None,
        transaction_type: str = "sale",
        max_years: int = 10
    ) -> Optional[Dict[str, Any]]:
        """
        통계 데이터 계산 (내부 메서드)
        
        각 엔드포인트별로 적절한 계산 로직 호출
        """
        if endpoint == "transaction-volume":
            return await self._calculate_transaction_volume(
                db, region_type, city_name, transaction_type, max_years
            )
        elif endpoint == "rvol":
            return await self._calculate_rvol(
                db, region_type, city_name, transaction_type
            )
        # 다른 엔드포인트들도 추가 가능
        else:
            logger.warning(f"알 수 없는 엔드포인트: {endpoint}")
            return None
    
    async def _calculate_transaction_volume(
        self,
        db: AsyncSession,
        region_type: str,
        city_name: Optional[str] = None,
        transaction_type: str = "sale",
        max_years: int = 10
    ) -> Optional[Dict[str, Any]]:
        """거래량 통계 계산"""
        from app.api.v1.endpoints.statistics import get_region_type_filter
        
        # 날짜 범위 계산
        current_date = date.today()
        start_year = current_date.year - max_years + 1
        start_date = date(start_year, 1, 1)
        end_date = current_date
        
        # 지역 필터
        region_filter = get_region_type_filter(region_type)
        
        # 거래 유형에 따른 테이블 선택
        if transaction_type == "sale":
            trans_table = Sale
            date_field = Sale.contract_date
            base_filter = and_(
                Sale.is_canceled == False,
                or_(Sale.is_deleted == False, Sale.is_deleted.is_(None)),
                Sale.contract_date.isnot(None),
                Sale.contract_date >= start_date,
                Sale.contract_date <= end_date
            )
        else:  # rent
            trans_table = Rent
            date_field = Rent.deal_date
            base_filter = and_(
                or_(Rent.is_deleted == False, Rent.is_deleted.is_(None)),
                Rent.deal_date.isnot(None),
                Rent.deal_date >= start_date,
                Rent.deal_date <= end_date
            )
        
        # 월별 거래량 조회 (지역 필터에 따라 쿼리 구성)
        if region_type == "전국":
            # 전국: JOIN 없이 거래 테이블만 사용
            stmt = (
                select(
                    extract('year', date_field).label('year'),
                    extract('month', date_field).label('month'),
                    func.count(trans_table.trans_id).label('volume')
                )
                .select_from(trans_table)
                .where(base_filter)
                .group_by(
                    extract('year', date_field),
                    extract('month', date_field)
                )
                .order_by(
                    extract('year', date_field),
                    extract('month', date_field)
                )
            )
        else:
            # 수도권/지방5대광역시: JOIN 사용
            stmt = (
                select(
                    extract('year', date_field).label('year'),
                    extract('month', date_field).label('month'),
                    func.count(trans_table.trans_id).label('volume')
                )
                .select_from(
                    trans_table.__table__.join(
                        Apartment.__table__,
                        trans_table.apt_id == Apartment.apt_id
                    ).join(
                        State.__table__,
                        Apartment.region_id == State.region_id
                    )
                )
                .where(and_(base_filter, region_filter) if region_filter else base_filter)
                .group_by(
                    extract('year', date_field),
                    extract('month', date_field)
                )
                .order_by(
                    extract('year', date_field),
                    extract('month', date_field)
                )
            )
        
        result = await db.execute(stmt)
        rows = result.all()
        
        # 데이터 포맷팅
        data_points = [
            {
                "year": int(row.year),
                "month": int(row.month),
                "volume": int(row.volume)
            }
            for row in rows
        ]
        
        if city_name:
            return {
                "region_type": region_type,
                "city_name": city_name,
                "transaction_type": transaction_type,
                "max_years": max_years,
                "data": data_points
            }
        else:
            return {
                "region_type": region_type,
                "transaction_type": transaction_type,
                "max_years": max_years,
                "data": data_points
            }
    
    async def _calculate_rvol(
        self,
        db: AsyncSession,
        region_type: str,
        city_name: Optional[str] = None,
        transaction_type: str = "sale"
    ) -> Optional[Dict[str, Any]]:
        """RVOL(상대 거래량) 통계 계산"""
        # RVOL 계산 로직은 statistics_service.py의 get_rvol 메서드 참고
        # 여기서는 간단한 예시만 제공
        from app.services.statistics_service import statistics_service
        
        try:
            rvol_data = await statistics_service.get_rvol(
                db, transaction_type, current_period_months=6, average_period_months=6
            )
            return rvol_data.model_dump() if rvol_data else None
        except Exception as e:
            logger.error(f"RVOL 계산 실패: {e}")
            return None
    
    async def invalidate_statistics_cache(
        self,
        region_id: Optional[int] = None,
        apt_id: Optional[int] = None,
        transaction_type: Optional[str] = None,
        city_name: Optional[str] = None
    ) -> int:
        """
        통계 캐시 무효화
        
        Args:
            region_id: 지역 ID (해당 지역의 모든 통계 캐시 삭제)
            apt_id: 아파트 ID (해당 아파트 관련 통계 캐시 삭제)
            transaction_type: 거래 유형 (해당 거래 유형의 모든 통계 캐시 삭제)
            city_name: 시도명 (해당 도시의 모든 통계 캐시 삭제)
        
        Returns:
            삭제된 캐시 개수
        """
        patterns = []
        
        # 지역별 통계 캐시 무효화
        if region_id:
            # 해당 region_id를 가진 모든 통계 캐시 삭제
            # 주의: region_id로 직접 필터링된 통계는 없을 수 있음
            # 대신 region_id를 통해 city_name을 찾아서 삭제
            patterns.append(f"realestate:statistics:*")
        
        # 거래 유형별 통계 캐시 무효화
        if transaction_type:
            patterns.append(f"realestate:statistics:*")
        
        # 도시별 통계 캐시 무효화
        if city_name:
            # 지방5대광역시의 특정 도시 통계 캐시 삭제
            patterns.append(f"realestate:statistics:*")
        
        # 아파트별 통계 캐시는 일반적으로 없으므로 스킵
        
        # 모든 통계 캐시 삭제 (데이터 대량 업데이트 시)
        if not any([region_id, apt_id, transaction_type, city_name]):
            patterns.append(f"realestate:statistics:*")
        
        # 패턴 매칭으로 삭제
        total_deleted = 0
        for pattern in set(patterns):  # 중복 제거
            deleted = await delete_cache_pattern(pattern)
            total_deleted += deleted
        
        logger.info(f"통계 캐시 무효화 완료: {total_deleted}개 삭제")
        
        return total_deleted


# 서비스 인스턴스
statistics_cache_service = StatisticsCacheService()
