"""
검색 서비스

아파트 검색 및 지역 검색 비즈니스 로직을 담당하는 서비스 레이어

성능 최적화 (db.t4g.micro 환경):
- 인덱스 활용: apt_name, kapt_code, region_id에 인덱스 존재
- 2단계 검색: 1) 빠른 LIKE 검색 먼저 시도 2) 실패 시 pg_trgm 유사도 검색
- 필요한 컬럼만 SELECT하여 데이터 전송량 감소
- pg_trgm % 연산자 사용으로 GIN 인덱스 활용 (similarity() 함수 대신)
- SET pg_trgm.similarity_threshold 제거 (세션 레벨 설정 오버헤드 방지)
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, case
from sqlalchemy.sql import text

from app.models.apartment import Apartment
from app.models.apart_detail import ApartDetail
from app.models.state import State
from app.utils.search_utils import normalize_apt_name_py


class SearchService:
    """
    검색 서비스 클래스
    
    아파트 검색 관련 비즈니스 로직을 처리합니다.
    """
    
    # 세션 레벨 pg_trgm 설정 캐시 (연결당 한 번만 설정)
    _trgm_initialized_sessions: set = set()
    
    async def search_apartments(
        self,
        db: AsyncSession,
        *,
        query: str,
        limit: int = 10,
        threshold: float = 0.2
    ) -> List[Dict[str, Any]]:
        """
        아파트명 또는 주소로 검색 (최적화된 2단계 검색)
        
        1단계: 빠른 LIKE 검색 (인덱스 활용)
        2단계: 1단계 결과가 부족하면 pg_trgm 유사도 검색
        
        성능 최적화:
        - SET 명령어 세션당 1회만 실행 (캐시)
        - % 연산자로 GIN 인덱스 활용
        - LIMIT 조기 적용으로 스캔 최소화
        
        Args:
            db: 데이터베이스 세션
            query: 검색어 (최소 2글자) - 아파트명 또는 주소
            limit: 반환할 결과 개수 (기본 10개, 최대 20개)
            threshold: 유사도 임계값 (기본 0.2, 높을수록 정확한 결과)
        
        Returns:
            검색 결과 목록 (dict 리스트)
        """
        # 검색어 정규화
        normalized_q = normalize_apt_name_py(query)
        
        # ===== 1단계: 빠른 PREFIX 검색 (인덱스 활용) =====
        # lower(text) + text_pattern_ops 인덱스 활용
        fast_results = await self._fast_like_search(db, query, normalized_q, limit)
        
        # 충분한 결과가 있으면 바로 반환 (2단계 스킵)
        if len(fast_results) >= limit:
            return fast_results[:limit]
        
        # ===== 2단계: pg_trgm 유사도 검색 (1단계 결과 부족 시) =====
        # 이미 찾은 apt_id 제외
        found_apt_ids = {r["apt_id"] for r in fast_results}
        remaining_limit = limit - len(fast_results)
        
        # 남은 결과가 필요하면 유사도 검색
        if remaining_limit > 0:
            similarity_results = await self._similarity_search(
                db, query, normalized_q, threshold, remaining_limit, found_apt_ids
            )
            return fast_results + similarity_results
        
        return fast_results
    
    async def _fast_like_search(
        self,
        db: AsyncSession,
        query: str,
        normalized_q: str,
        limit: int
    ) -> List[Dict[str, Any]]:
        """
        빠른 PREFIX 검색 (인덱스 활용)
        
        lower(apt_name/주소) prefix 인덱스를 활용하여 빠르게 검색합니다.
        """
        lowered_query = query.lower()
        like_pattern = f"{lowered_query}%"
        
        # 최소한의 컬럼만 SELECT (성능 최적화)
        stmt = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                Apartment.kapt_code,
                Apartment.region_id,
                ApartDetail.road_address,
                ApartDetail.jibun_address,
                func.ST_X(ApartDetail.geometry).label('lng'),
                func.ST_Y(ApartDetail.geometry).label('lat')
            )
            .outerjoin(
                ApartDetail,
                and_(
                    Apartment.apt_id == ApartDetail.apt_id,
                    ApartDetail.is_deleted == False
                )
            )
            .where(
                Apartment.is_deleted == False,
                or_(
                    # 아파트명 prefix 검색 (pg_trgm GIN 인덱스 활용을 위해 ilike 사용)
                    Apartment.apt_name.ilike(like_pattern),
                    # 도로명주소 prefix 검색
                    func.lower(ApartDetail.road_address).like(like_pattern),
                    # 지번주소 prefix 검색
                    func.lower(ApartDetail.jibun_address).like(like_pattern)
                )
            )
            .order_by(
                # 정확히 시작하는 것 우선
                case(
                    (Apartment.apt_name.ilike(like_pattern), 0),
                    else_=1
                ),
                Apartment.apt_name
            )
            .limit(limit)
        )
        
        result = await db.execute(stmt)
        apartments = result.all()
        
        return self._format_results(apartments)
    
    async def _similarity_search(
        self,
        db: AsyncSession,
        query: str,
        normalized_q: str,
        threshold: float,
        limit: int,
        exclude_apt_ids: set
    ) -> List[Dict[str, Any]]:
        """
        pg_trgm 유사도 검색 (LIKE 검색 결과 부족 시)
        
        성능 최적화:
        - pg_trgm % 연산자를 사용하여 GIN 인덱스를 활용
        - SET pg_trgm.similarity_threshold 제거 (세션 오버헤드 방지)
        - 대신 WHERE 절에서 similarity() > threshold 조건 사용
        - similarity() 함수는 SELECT에서만 사용 (정렬용)
        """
        if limit <= 0:
            return []
        
        # ===== 최적화: SET 명령 제거 =====
        # 기존: await db.execute(text(f"SET pg_trgm.similarity_threshold = {threshold}"))
        # 세션 레벨 설정은 매 요청마다 오버헤드 발생
        # 대신 WHERE 절에서 직접 임계값 비교
        
        # % 연산자를 사용한 유사도 필터링 (GIN 인덱스 활용)
        # 아파트명에 대해서만 % 연산자 사용 (가장 효과적)
        apt_name_match = Apartment.apt_name.op('%')(query)
        
        # 유사도 점수 계산 (결과 정렬용)
        apt_name_similarity = func.similarity(Apartment.apt_name, query)
        
        # ===== 최적화된 쿼리: 조건 단순화 =====
        # 아파트명 % 연산자만 사용하여 GIN 인덱스 최대 활용
        # 주소 검색은 1단계 LIKE에서 처리됨
        stmt = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                Apartment.kapt_code,
                Apartment.region_id,
                ApartDetail.road_address,
                ApartDetail.jibun_address,
                func.ST_X(ApartDetail.geometry).label('lng'),
                func.ST_Y(ApartDetail.geometry).label('lat'),
                apt_name_similarity.label('score')
            )
            .outerjoin(
                ApartDetail,
                and_(
                    Apartment.apt_id == ApartDetail.apt_id,
                    ApartDetail.is_deleted == False
                )
            )
            .where(
                Apartment.is_deleted == False,
                # % 연산자로 필터링 (GIN 인덱스 활용) - 아파트명만
                apt_name_match,
                # 최소 유사도 임계값 (0.1 고정 - pg_trgm 기본값보다 낮게)
                apt_name_similarity >= 0.1
            )
        )
        
        # 이미 찾은 apt_id 제외
        if exclude_apt_ids:
            stmt = stmt.where(~Apartment.apt_id.in_(exclude_apt_ids))
        
        # 유사도 높은 순으로 정렬, LIMIT 적용
        stmt = stmt.order_by(apt_name_similarity.desc()).limit(limit)
        
        result = await db.execute(stmt)
        apartments = result.all()
        
        return self._format_results(apartments)
    
    def _format_results(self, apartments) -> List[Dict[str, Any]]:
        """결과 포맷팅 (공통 로직)"""
        results = []
        for apt in apartments:
            address = apt.road_address or apt.jibun_address or None
            
            location = None
            if apt.lat is not None and apt.lng is not None:
                location = {
                    "lat": float(apt.lat),
                    "lng": float(apt.lng)
                }
            
            results.append({
                "apt_id": apt.apt_id,
                "apt_name": apt.apt_name,
                "kapt_code": apt.kapt_code or None,
                "region_id": apt.region_id or None,
                "address": address,
                "location": location
            })
        
        return results
    
    async def search_locations(
        self,
        db: AsyncSession,
        *,
        query: str,
        location_type: Optional[str] = None,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        지역 검색 (시/군/구/동) - 최적화된 버전
        
        검색어를 포함하는 지역 목록을 반환합니다.
        
        성능 최적화:
        - 필요한 컬럼만 SELECT (ORM 객체 대신)
        - region_name, region_code 인덱스 활용
        - 검색어로 시작하는 것 우선 정렬
        
        Args:
            db: 데이터베이스 세션
            query: 검색어 (최소 1글자)
            location_type: 지역 유형 필터 (sigungu: 시군구, dong: 동/리/면, None: 전체)
            limit: 반환할 결과 개수 (기본 20개)
        
        Returns:
            검색 결과 목록 (dict 리스트)
        """
        # 필요한 컬럼만 SELECT (성능 최적화)
        stmt = select(
            State.region_id,
            State.region_name,
            State.region_code,
            State.city_name
        ).where(
            State.is_deleted == False,
            State.region_name.ilike(f"{query}%")
        )
        
        # location_type 필터 적용
        if location_type == "sigungu":
            # 시군구만: region_code의 마지막 5자리가 "00000"
            stmt = stmt.where(State.region_code.like("_____00000"))
        elif location_type == "dong":
            # 동만: region_code의 마지막 5자리가 "00000"이 아님
            stmt = stmt.where(~State.region_code.like("_____00000"))
        
        # 정확히 시작하는 것 우선, 그 다음 이름순
        stmt = stmt.order_by(
            case(
                (State.region_name.like(f"{query}%"), 0),
                else_=1
            ),
            State.region_name
        ).limit(limit * 2)  # 중복 제거 후 limit 확보를 위해 여유 있게 조회
        
        result = await db.execute(stmt)
        rows = result.all()
        
        # 응답 형식에 맞게 데이터 변환 및 중복 제거
        results = []
        seen_codes = set()
        
        for row in rows:
            if len(results) >= limit:
                break
            
            region_code = row.region_code
            if region_code in seen_codes:
                continue
            seen_codes.add(region_code)
            
            # location_type 판단
            if region_code[-8:] == "00000000":
                loc_type = "city"
            elif region_code[-5:] == "00000":
                loc_type = "sigungu"
            else:
                loc_type = "dong"
            
            # full_name 조합
            region_name = row.region_name
            city_name = row.city_name
            
            if region_name == city_name or region_name.startswith(city_name):
                full_name = region_name
            else:
                full_name = f"{city_name} {region_name}"
            
            results.append({
                "region_id": row.region_id,
                "region_name": region_name,
                "region_code": region_code,
                "city_name": city_name,
                "full_name": full_name,
                "location_type": loc_type
            })
        
        return results


# 서비스 인스턴스 생성
search_service = SearchService()
