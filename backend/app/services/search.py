"""
검색 서비스

아파트 검색 및 지역 검색 비즈니스 로직을 담당하는 서비스 레이어
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.apartment import Apartment
from app.models.apart_detail import ApartDetail
from app.models.state import State
from app.utils.search_utils import normalize_apt_name_py


class SearchService:
    """
    검색 서비스 클래스
    
    아파트 검색 관련 비즈니스 로직을 처리합니다.
    """
    
    async def search_apartments(
        self,
        db: AsyncSession,
        *,
        query: str,
        limit: int = 10,
        threshold: float = 0.2
    ) -> List[Dict[str, Any]]:
        """
        아파트명으로 검색 (pg_trgm 유사도 검색)
        
        pg_trgm 확장을 사용하여 유사도 기반 검색을 수행합니다.
        검색어를 포함하는 아파트 목록을 반환합니다.
        DB에서 조회한 후 응답 형식에 맞게 변환합니다.
        주소와 위치 정보는 APART_DETAILS 테이블과 JOIN하여 가져옵니다.
        
        Args:
            db: 데이터베이스 세션
            query: 검색어 (최소 2글자)
            limit: 반환할 결과 개수 (기본 10개, 최대 50개)
            threshold: 유사도 임계값 (기본 0.2, 높을수록 정확한 결과)
        
        Returns:
            검색 결과 목록 (dict 리스트)
            - apt_id: 아파트 ID
            - apt_name: 아파트명
            - kapt_code: 국토부 단지코드
            - region_id: 지역 ID
            - address: 주소 (도로명 우선, 없으면 지번)
            - location: 위치 정보 (lat, lng)
        
        Note:
            - pg_trgm 유사도 검색 사용
            - 삭제되지 않은 아파트만 검색
            - 유사도 점수 내림차순 정렬
        """
        # 검색어 정규화 (Python에서 SQL 함수와 동일하게)
        normalized_q = normalize_apt_name_py(query)
        
        # pg_trgm 유사도 검색 쿼리
        stmt = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                Apartment.kapt_code,
                Apartment.region_id,
                ApartDetail.road_address,
                ApartDetail.jibun_address,
                State.city_name,
                State.region_name,
                func.ST_X(ApartDetail.geometry).label('lng'),
                func.ST_Y(ApartDetail.geometry).label('lat'),
                func.similarity(
                    func.normalize_apt_name(Apartment.apt_name),
                    normalized_q
                ).label('score')
            )
            .outerjoin(ApartDetail, Apartment.apt_id == ApartDetail.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                func.similarity(
                    func.normalize_apt_name(Apartment.apt_name),
                    normalized_q
                ) > threshold
            )
            .where(Apartment.is_deleted == False)
            .order_by(func.similarity(
                func.normalize_apt_name(Apartment.apt_name),
                normalized_q
            ).desc())
            .limit(limit)
        )
        
        result = await db.execute(stmt)
        apartments = result.all()
        
        # 응답 형식에 맞게 데이터 변환
        results = []
        for apt in apartments:
            # 주소 조합 (도로명 우선, 없으면 지번, 둘 다 없으면 null)
            address = apt.road_address if apt.road_address else (apt.jibun_address if apt.jibun_address else None)
            
            # 위치 정보 (lat, lng)
            location = None
            if apt.lat is not None and apt.lng is not None:
                location = {
                    "lat": float(apt.lat),
                    "lng": float(apt.lng)
                }
            
            result_item = {
                "apt_id": apt.apt_id,
                "apt_name": apt.apt_name,
                "kapt_code": apt.kapt_code if apt.kapt_code else None,
                "region_id": apt.region_id if apt.region_id else None,
                "address": address,
                "location": location
            }
            
            results.append(result_item)
        
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
        지역 검색 (시/군/구/동)
        
        검색어를 포함하는 지역 목록을 반환합니다.
        DB에서 조회한 후 응답 형식에 맞게 변환합니다.
        
        Args:
            db: 데이터베이스 세션
            query: 검색어 (최소 1글자)
            location_type: 지역 유형 필터 (sigungu: 시군구, dong: 동/리/면, None: 전체)
            limit: 반환할 결과 개수 (기본 20개)
        
        Returns:
            검색 결과 목록 (dict 리스트)
        
        Note:
            - 대소문자 구분 없이 검색 (ILIKE 사용)
            - 삭제되지 않은 지역만 검색
            - 정렬: 시도명, 지역명 오름차순
            - region_code의 마지막 5자리가 "00000"이면 시군구, 그 외는 동
        """
        # 검색어로 시작하는 지역 검색
        query_filter = State.region_name.ilike(f"{query}%")
        
        # location_type 필터 적용
        if location_type == "sigungu":
            # 시군구만: region_code의 마지막 5자리가 "00000"
            query_filter = query_filter & (State.region_code.like("_____00000"))
        elif location_type == "dong":
            # 동만: region_code의 마지막 5자리가 "00000"이 아님
            query_filter = query_filter & (~State.region_code.like("_____00000"))
        
        # 쿼리 실행
        stmt = (
            select(State)
            .where(
                query_filter & (State.is_deleted == False)
            )
            .order_by(State.region_name)
            .limit(limit)
        )
        
        result = await db.execute(stmt)
        states = result.scalars().all()
        
        # 응답 형식에 맞게 데이터 변환 및 중복 제거
        results = []
        seen_codes = set()  # region_code 기준 중복 제거
        
        for state in states:
            # region_code 기준으로 중복 제거
            if state.region_code in seen_codes:
                continue
            seen_codes.add(state.region_code)
            
            # location_type 판단
            # region_code의 마지막 8자리가 "00000000"이면 시도 레벨
            # region_code의 마지막 5자리가 "00000"이면 시군구 레벨
            # 그 외는 동 레벨
            if state.region_code[-8:] == "00000000":
                loc_type = "city"  # 시도 레벨
            elif state.region_code[-5:] == "00000":
                loc_type = "sigungu"  # 시군구 레벨
            else:
                loc_type = "dong"  # 동 레벨
            
            # full_name 조합 (중복 제거)
            # region_name과 city_name이 완전히 같으면 region_name만 사용
            # region_name이 city_name으로 시작하면 region_name만 사용 (예: "서울특별시" == "서울특별시")
            if state.region_name == state.city_name:
                full_name = state.region_name
            elif state.region_name.startswith(state.city_name):
                # "서울특별시"로 시작하는 경우 region_name만 사용
                full_name = state.region_name
            else:
                # 그 외의 경우 조합 (예: "경기도" + "풍무동" = "경기도 풍무동")
                full_name = f"{state.city_name} {state.region_name}"
            
            result_item = {
                "region_id": state.region_id,
                "region_name": state.region_name,
                "region_code": state.region_code,
                "city_name": state.city_name,
                "full_name": full_name,
                "location_type": loc_type
            }
            
            results.append(result_item)
        
        return results


# 서비스 인스턴스 생성
search_service = SearchService()
