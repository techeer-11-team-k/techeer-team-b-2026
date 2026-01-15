"""
아파트 관련 비즈니스 로직

담당 기능:
- 아파트 상세 정보 조회 (DB에서)
- 유사 아파트 조회
- 주변 아파트 평균 가격 조회
"""
import logging
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.shape import to_shape

from app.crud.apartment import apartment as apart_crud
from app.crud.sale import sale as sale_crud
from app.crud.state import state as state_crud
from app.schemas.apartment import (
    ApartDetailBase, 
    SimilarApartmentItem,
    NearbyComparisonItem
)
from app.core.exceptions import NotFoundException

logger = logging.getLogger(__name__)


class ApartmentService:
    """
    아파트 관련 비즈니스 로직
    
    - 아파트 상세 정보 조회: DB에서 아파트 상세 정보를 조회합니다.
    - 유사 아파트 조회: 비슷한 조건의 아파트를 찾습니다.
    """
    
    async def get_apart_detail(
        self,
        db: AsyncSession,
        *,
        apt_id: int
    ) -> ApartDetailBase:
        """
        아파트 상세 정보 조회
        
        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 ID (apartments.apt_id)
        
        Returns:
            아파트 상세 정보 스키마 객체
        
        Raises:
            NotFoundException: 아파트 상세 정보를 찾을 수 없는 경우
        """
        # CRUD 호출
        apart_detail = await apart_crud.get_by_apt_id(db, apt_id=apt_id)
        
        # 결과 검증 및 예외 처리
        if not apart_detail:
            raise NotFoundException("아파트 상세 정보")
        
        # 모델을 스키마로 변환하기 전에 geometry 필드 처리
        # WKBElement를 문자열로 변환
        try:
            detail_dict = {}
            
            # 스키마에 정의된 모든 필드명 가져오기
            schema_fields = ApartDetailBase.model_fields.keys()
            
            # 각 스키마 필드에 대해 모델에서 값 가져오기
            for field_name in schema_fields:
                # geometry 필드는 별도 처리
                if field_name == 'geometry':
                    value = getattr(apart_detail, 'geometry', None)
                    if value is not None:
                        try:
                            # WKBElement를 shapely geometry로 변환
                            shape = to_shape(value)
                            # WKT (Well-Known Text) 형식으로 변환 (예: "POINT(126.9780 37.5665)")
                            detail_dict['geometry'] = shape.wkt
                            logger.debug(f"✅ geometry 변환 성공: apt_id={apt_id}, geometry={detail_dict['geometry']}")
                        except Exception as e:
                            logger.warning(f"⚠️ geometry 변환 실패: apt_id={apt_id}, 오류={str(e)}", exc_info=True)
                            detail_dict['geometry'] = None
                    else:
                        detail_dict['geometry'] = None
                else:
                    # 다른 필드는 모델 속성에서 직접 가져오기
                    # SQLAlchemy는 속성명을 사용하므로 (예: educationFacility)
                    value = getattr(apart_detail, field_name, None)
                    detail_dict[field_name] = value
            
            # Pydantic 스키마로 변환 (자동으로 타입 변환 수행)
            return ApartDetailBase.model_validate(detail_dict)
        except Exception as e:
            # 스키마 변환 오류 로깅
            logger.error(f"❌ 아파트 상세 정보 스키마 변환 오류: apt_id={apt_id}, 오류={str(e)}", exc_info=True)
            logger.error(f"   detail_dict keys: {list(detail_dict.keys())}")
            logger.error(f"   detail_dict values (first 5): {dict(list(detail_dict.items())[:5])}")
            logger.error(f"   geometry type: {type(detail_dict.get('geometry'))}")
            logger.error(f"   geometry value: {detail_dict.get('geometry')}")
            # 각 필드의 타입 확인
            for key, value in detail_dict.items():
                if value is not None:
                    logger.error(f"   {key}: type={type(value).__name__}, value={str(value)[:100]}")
            raise ValueError(f"아파트 상세 정보 변환 중 오류 발생: {str(e)}")
    
    async def get_similar_apartments(
        self,
        db: AsyncSession,
        *,
        apt_id: int,
        limit: int = 10
    ) -> List[SimilarApartmentItem]:
        """
        유사한 아파트 조회
        
        같은 지역, 비슷한 규모(세대수, 동수)를 기준으로 유사한 아파트를 찾습니다.
        
        Args:
            db: 데이터베이스 세션
            apt_id: 기준 아파트 ID
            limit: 반환할 최대 개수
        
        Returns:
            유사 아파트 목록
        
        Raises:
            NotFoundException: 기준 아파트를 찾을 수 없는 경우
        """
        # 기준 아파트 존재 확인
        target_apartment = await apart_crud.get(db, id=apt_id)
        if not target_apartment or target_apartment.is_deleted:
            raise NotFoundException("아파트")
        
        # CRUD 호출
        similar_list = await apart_crud.get_similar_apartments(
            db,
            apt_id=apt_id,
            limit=limit
        )
        
        # 결과 변환
        results = []
        for apartment, detail in similar_list:
            results.append(SimilarApartmentItem(
                apt_id=apartment.apt_id,
                apt_name=apartment.apt_name,
                road_address=detail.road_address,
                jibun_address=detail.jibun_address,
                total_household_cnt=detail.total_household_cnt,
                total_building_cnt=detail.total_building_cnt,
                builder_name=detail.builder_name,
                use_approval_date=detail.use_approval_date
            ))
        
        return results
    
    async def get_nearby_price(
        self,
        db: AsyncSession,
        *,
        apt_id: int,
        months: int = 6
    ) -> Dict[str, Any]:
        """
        주변 아파트들의 평균 가격 조회
        
        같은 지역의 주변 아파트들의 최근 N개월 거래 데이터를 기반으로
        평당가를 계산하고, 기준 아파트의 면적을 곱하여 예상 가격을 산출합니다.
        
        Args:
            db: 데이터베이스 세션
            apt_id: 기준 아파트 ID
            months: 조회할 기간 (개월 수, 기본값: 6)
        
        Returns:
            주변 아파트 평균 가격 정보 딕셔너리
        
        Raises:
            NotFoundException: 기준 아파트를 찾을 수 없는 경우
        """
        # 1. 기준 아파트 정보 조회
        target_apartment = await apart_crud.get(db, id=apt_id)
        if not target_apartment or target_apartment.is_deleted:
            raise NotFoundException("아파트")
        
        # 2. 지역 정보 조회 (lazy loading 방지를 위해 직접 조회)
        region = await state_crud.get(db, id=target_apartment.region_id) if target_apartment.region_id else None
        region_name = region.region_name if region else None
        
        # 3. 기준 아파트의 최근 거래 평균 면적 조회
        target_exclusive_area = await sale_crud.get_target_apartment_average_area(
            db,
            apt_id=apt_id,
            months=months
        )
        
        # 4. 주변 아파트 평균 가격 조회
        result = await sale_crud.get_nearby_average_price(
            db,
            region_id=target_apartment.region_id,
            target_apt_id=apt_id,
            months=months
        )
        
        # 5. 결과 처리
        if result is None:
            # 거래 데이터가 없는 경우
            return {
                "apt_id": apt_id,
                "apt_name": target_apartment.apt_name,
                "region_name": region_name,
                "period_months": months,
                "target_exclusive_area": target_exclusive_area,
                "average_price_per_sqm": None,
                "estimated_price": -1,
                "transaction_count": 0,
                "average_price": -1
            }
        
        average_price_per_sqm, transaction_count = result
        
        # 6. 예상 가격 계산: 평당가 × 기준 아파트 면적
        estimated_price = None
        average_price = -1
        
        if target_exclusive_area and target_exclusive_area > 0:
            estimated_price = average_price_per_sqm * target_exclusive_area
            
            # 거래 개수가 5개 이하이면 average_price = -1
            if transaction_count <= 5:
                average_price = -1
            else:
                average_price = estimated_price
        
        return {
            "apt_id": apt_id,
            "apt_name": target_apartment.apt_name,
            "region_name": region_name,
            "period_months": months,
            "target_exclusive_area": target_exclusive_area,
            "average_price_per_sqm": round(average_price_per_sqm, 2) if average_price_per_sqm else None,
            "estimated_price": round(estimated_price, 2) if estimated_price else None,
            "transaction_count": transaction_count,
            "average_price": round(average_price, 2) if average_price != -1 else -1
        }
    
    async def get_nearby_comparison(
        self,
        db: AsyncSession,
        *,
        apt_id: int,
        radius_meters: int = 500,
        months: int = 6,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        주변 500m 내 아파트 비교 조회
        
        기준 아파트로부터 지정된 반경 내의 아파트들을 조회하고,
        각 아파트의 최근 거래 가격 정보를 포함하여 비교 데이터를 반환합니다.
        
        Args:
            db: 데이터베이스 세션
            apt_id: 기준 아파트 ID
            radius_meters: 반경 (미터, 기본값: 500)
            months: 가격 계산 기간 (개월, 기본값: 6)
            limit: 반환할 최대 개수 (기본값: 10)
        
        Returns:
            주변 아파트 비교 정보 딕셔너리
        
        Raises:
            NotFoundException: 기준 아파트를 찾을 수 없는 경우
        """
        # 1. 기준 아파트 정보 조회
        target_apartment = await apart_crud.get(db, id=apt_id)
        if not target_apartment or target_apartment.is_deleted:
            raise NotFoundException("아파트")
        
        target_detail = await apart_crud.get_by_apt_id(db, apt_id=apt_id)
        if not target_detail:
            raise NotFoundException("아파트 상세 정보")
        
        # 기준 아파트 정보 구성
        target_info = {
            "apt_id": target_apartment.apt_id,
            "apt_name": target_apartment.apt_name,
            "road_address": target_detail.road_address,
            "jibun_address": target_detail.jibun_address
        }
        
        # 2. 반경 내 주변 아파트 조회 (거리순 정렬)
        # radius_meters를 None으로 전달하면 반경 제한 없이 가장 가까운 limit개만 반환
        # 현재는 매우 큰 값(50000m = 50km)으로 설정하여 실질적으로 반경 제한 없음
        nearby_list = await apart_crud.get_nearby_within_radius(
            db,
            apt_id=apt_id,
            radius_meters=None,  # 반경 제한 없이 가장 가까운 아파트만 찾기
            limit=limit
        )
        
        # 3. 각 주변 아파트의 가격 정보 조회 및 데이터 구성
        nearby_apartments = []
        for nearby_detail, distance_meters in nearby_list:
            # 아파트 기본 정보 조회
            nearby_apartment = await apart_crud.get(db, id=nearby_detail.apt_id)
            if not nearby_apartment:
                continue
            
            # 최근 거래 가격 정보 조회
            price_info = await sale_crud.get_average_price_by_apartment(
                db,
                apt_id=nearby_detail.apt_id,
                months=months
            )
            
            # 가격 정보 처리
            average_price = None
            average_price_per_sqm = None
            transaction_count = 0
            
            if price_info:
                average_price, average_price_per_sqm, transaction_count = price_info
                average_price = round(average_price, 2) if average_price else None
                average_price_per_sqm = round(average_price_per_sqm, 2) if average_price_per_sqm else None
            
            # 주변 아파트 정보 구성
            nearby_item = NearbyComparisonItem(
                apt_id=nearby_apartment.apt_id,
                apt_name=nearby_apartment.apt_name,
                road_address=nearby_detail.road_address,
                jibun_address=nearby_detail.jibun_address,
                distance_meters=round(distance_meters, 2),
                total_household_cnt=nearby_detail.total_household_cnt,
                total_building_cnt=nearby_detail.total_building_cnt,
                builder_name=nearby_detail.builder_name,
                use_approval_date=nearby_detail.use_approval_date,
                average_price=average_price,
                average_price_per_sqm=average_price_per_sqm,
                transaction_count=transaction_count
            )
            
            nearby_apartments.append(nearby_item)
        
        return {
            "target_apartment": target_info,
            "nearby_apartments": [item.model_dump() for item in nearby_apartments],
            "count": len(nearby_apartments),
            "radius_meters": radius_meters,
            "period_months": months
        }


# 싱글톤 인스턴스 생성
# 다른 곳에서 from app.services.apartment import apartment_service 로 사용
apartment_service = ApartmentService()