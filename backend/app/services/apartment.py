"""
아파트 관련 비즈니스 로직

담당 기능:
- 아파트 상세 정보 조회 (DB에서)
- 유사 아파트 조회
- 주변 아파트 평균 가격 조회
"""
import logging
import sys
import asyncio
import time
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case, cast
from sqlalchemy.types import Float, Integer
from sqlalchemy.sql import desc
from geoalchemy2.shape import to_shape

from app.crud.apartment import apartment as apart_crud
from app.models.apartment import Apartment
from app.models.apart_detail import ApartDetail
from app.models.sale import Sale
from app.models.rent import Rent
from app.crud.sale import sale as sale_crud
from app.crud.state import state as state_crud
from app.schemas.apartment import (
    ApartDetailBase, 
    SimilarApartmentItem,
    NearbyComparisonItem,
        VolumeTrendItem,
    VolumeTrendResponse,
    PriceTrendItem,
    PriceTrendResponse
)
from app.core.exceptions import NotFoundException

# 로거 설정 (Docker 로그에 출력되도록)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = True  # 루트 로거로도 전파


class ApartmentService:
    """
    아파트 관련 비즈니스 로직
    
    - 아파트 상세 정보 조회: DB에서 아파트 상세 정보를 조회합니다.
    - 유사 아파트 조회: 비슷한 조건의 아파트를 찾습니다.
    - 지역별 아파트 조회: 특정 지역의 아파트 목록을 조회합니다.
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
            NotFoundException: 아파트를 찾을 수 없는 경우
        """
        # 먼저 아파트 기본 정보 확인
        apartment = await apart_crud.get(db, id=apt_id)
        if not apartment or apartment.is_deleted:
            raise NotFoundException("아파트")
        
        # CRUD 호출 (상세 정보)
        apart_detail = await apart_crud.get_by_apt_id(db, apt_id=apt_id)
        
        # 상세 정보가 없으면 기본 정보만으로 생성
        if not apart_detail:
            # 기본 정보만으로 최소한의 상세 정보 모델 생성
            from app.models.apart_detail import ApartDetail
            
            # 기본 정보로 최소한의 상세 정보 생성 (필수 필드만 채움)
            apart_detail = ApartDetail(
                apt_id=apartment.apt_id,
                road_address="",  # 필수 필드이므로 빈 문자열
                jibun_address="",  # 필수 필드이므로 빈 문자열
                zip_code=None,
                code_sale_nm=None,
                code_heat_nm=None,
                total_household_cnt=0,  # 필수 필드이므로 0
                total_building_cnt=None,
                highest_floor=None,
                use_approval_date=None,
                total_parking_cnt=None,
                builder_name=None,
                developer_name=None,
                manage_type=None,
                hallway_type=None,
                subway_time=None,
                subway_line=None,
                subway_station=None,
                educationFacility=None,
                geometry=None,
                is_deleted=False
            )
        
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
                            logger.debug(f" geometry 변환 성공: apt_id={apt_id}, geometry={detail_dict['geometry']}")
                        except Exception as e:
                            logger.warning(f" geometry 변환 실패: apt_id={apt_id}, 오류={str(e)}", exc_info=True)
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
            logger.error(f" 아파트 상세 정보 스키마 변환 오류: apt_id={apt_id}, 오류={str(e)}", exc_info=True)
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
        limit: int = 10,
        area: Optional[float] = None,
        area_tolerance: float = 5.0,
        transaction_type: str = "sale"
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
        nearby_list = await apart_crud.get_nearby_within_radius(
            db,
            apt_id=apt_id,
            radius_meters=radius_meters,  # 실제 반경 제한 적용
            limit=limit
        )
        
        # 3. 각 주변 아파트의 가격 정보 조회 및 데이터 구성 (N+1 문제 해결: Batch 조회)
        if not nearby_list:
            return {
                "target_apartment": target_info,
                "nearby_apartments": [],
                "count": 0,
                "radius_meters": radius_meters,
                "period_months": months
            }

        # apt_id 목록 추출
        nearby_apt_ids = [detail.apt_id for detail, _ in nearby_list]
        
        # 아파트 기본 정보 일괄 조회
        apartments_stmt = select(Apartment).where(Apartment.apt_id.in_(nearby_apt_ids))
        apartments_result = await db.execute(apartments_stmt)
        apartments_map = {apt.apt_id: apt for apt in apartments_result.scalars().all()}
        
        # 최근 거래 가격 정보 일괄 조회
        date_from = date.today() - timedelta(days=months * 30)
        
        # 거래 테이블 및 필드 선택
        if transaction_type == "sale":
            trans_table = Sale
            price_field = Sale.trans_price
            area_field = Sale.exclusive_area
            base_filter = and_(
                Sale.apt_id.in_(nearby_apt_ids),
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.contract_date >= date_from,
                Sale.trans_price.isnot(None),
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0
            )
        elif transaction_type == "jeonse":
            trans_table = Rent
            price_field = Rent.deposit_price
            area_field = Rent.exclusive_area
            base_filter = and_(
                Rent.apt_id.in_(nearby_apt_ids),
                or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deal_date >= date_from,
                Rent.deposit_price.isnot(None),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0
            )
        elif transaction_type == "monthly":
            trans_table = Rent
            price_field = Rent.deposit_price
            area_field = Rent.exclusive_area
            base_filter = and_(
                Rent.apt_id.in_(nearby_apt_ids),
                Rent.monthly_rent > 0,
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deal_date >= date_from,
                Rent.monthly_rent.isnot(None),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0
            )
        else:
            trans_table = Sale
            price_field = Sale.trans_price
            area_field = Sale.exclusive_area
            base_filter = and_(
                Sale.apt_id.in_(nearby_apt_ids),
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.contract_date >= date_from,
                Sale.trans_price.isnot(None),
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0
            )
            
        # 면적 필터 추가
        if area is not None:
            base_filter = and_(
                base_filter,
                area_field >= area - area_tolerance,
                area_field <= area + area_tolerance
            )
            
        # 통계 일괄 계산
        stats_stmt = (
            select(
                trans_table.apt_id,
                func.count(trans_table.trans_id).label('total_count'),
                func.avg(cast(price_field, Float)).label('avg_price'),
                func.avg(
                    case(
                        (and_(
                            area_field.isnot(None),
                            area_field > 0
                        ), cast(price_field, Float) / cast(area_field, Float) * 3.3),
                        else_=None
                    )
                ).label('avg_price_per_pyeong')
            )
            .where(base_filter)
            .group_by(trans_table.apt_id)
        )
        
        stats_result = await db.execute(stats_stmt)
        stats_map = {row.apt_id: row for row in stats_result.all()}
        
        nearby_apartments = []
        for nearby_detail, distance_meters in nearby_list:
            apt_id = nearby_detail.apt_id
            nearby_apartment = apartments_map.get(apt_id)
            if not nearby_apartment:
                continue
                
            stats = stats_map.get(apt_id)
            
            # 가격 정보 처리
            average_price = None
            average_price_per_sqm = None
            transaction_count = 0
            
            if stats and stats.total_count > 0:
                average_price = round(float(stats.avg_price or 0), 0) if stats.avg_price else None
                if stats.avg_price_per_pyeong:
                    avg_price_per_pyeong = float(stats.avg_price_per_pyeong)
                    average_price_per_sqm = round(avg_price_per_pyeong / 3.3, 2)
                transaction_count = stats.total_count
            
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
    
    async def get_same_region_comparison(
        self,
        db: AsyncSession,
        *,
        apt_id: int,
        months: int = 6,
        limit: int = 20,
        area: Optional[float] = None,
        area_tolerance: float = 5.0,
        transaction_type: str = "sale"
    ) -> Dict[str, Any]:
        """
        같은 법정동 내 아파트 비교 조회
        
        기준 아파트와 같은 법정동(region_id) 내의 아파트들을 조회하고,
        각 아파트의 최근 거래 가격 정보를 포함하여 비교 데이터를 반환합니다.
        
        Args:
            db: 데이터베이스 세션
            apt_id: 기준 아파트 ID
            months: 가격 계산 기간 (개월, 기본값: 6)
            limit: 반환할 최대 개수 (기본값: 20)
            area: 전용면적 필터 (㎡, 선택)
            area_tolerance: 전용면적 허용 오차 (㎡, 기본값: 5.0)
            transaction_type: 거래 유형 (sale/jeonse/monthly, 기본값: sale)
        
        Returns:
            같은 법정동 내 아파트 비교 정보 딕셔너리
        
        Raises:
            NotFoundException: 기준 아파트를 찾을 수 없는 경우
        """
        # 1. 기준 아파트 정보 조회
        target_apartment = await apart_crud.get(db, id=apt_id)
        if not target_apartment or target_apartment.is_deleted:
            raise NotFoundException("아파트")
        
        if not target_apartment.region_id:
            raise NotFoundException("아파트의 지역 정보")
        
        target_detail = await apart_crud.get_by_apt_id(db, apt_id=apt_id)
        if not target_detail:
            raise NotFoundException("아파트 상세 정보")
        
        # 기준 아파트 정보 구성
        target_info = {
            "apt_id": target_apartment.apt_id,
            "apt_name": target_apartment.apt_name,
            "road_address": target_detail.road_address,
            "jibun_address": target_detail.jibun_address,
            "region_id": target_apartment.region_id
        }
        
        # 2. 같은 법정동 내의 아파트들 조회 (자기 자신 제외)
        same_region_apartments_stmt = (
            select(Apartment, ApartDetail)
            .outerjoin(
                ApartDetail,
                and_(
                    Apartment.apt_id == ApartDetail.apt_id,
                    (ApartDetail.is_deleted == False) | (ApartDetail.is_deleted.is_(None))
                )
            )
            .where(
                and_(
                    Apartment.region_id == target_apartment.region_id,
                    Apartment.apt_id != apt_id,  # 자기 자신 제외
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
                )
            )
            .order_by(Apartment.apt_name)
            .limit(limit)
        )
        
        result = await db.execute(same_region_apartments_stmt)
        same_region_list = result.all()
        
        # 3. 각 아파트의 가격 정보 조회 및 데이터 구성
        same_region_apartments = []
        date_from = date.today() - timedelta(days=months * 30)
        
        for nearby_apartment, nearby_detail in same_region_list:
            if not nearby_detail:
                continue
            
            # 거래 테이블 및 필드 선택
            if transaction_type == "sale":
                trans_table = Sale
                price_field = Sale.trans_price
                date_field = Sale.contract_date
                area_field = Sale.exclusive_area
                base_filter = and_(
                    Sale.apt_id == nearby_apartment.apt_id,
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                    Sale.contract_date >= date_from,
                    Sale.trans_price.isnot(None),
                    Sale.exclusive_area.isnot(None),
                    Sale.exclusive_area > 0
                )
            elif transaction_type == "jeonse":
                trans_table = Rent
                price_field = Rent.deposit_price
                date_field = Rent.deal_date
                area_field = Rent.exclusive_area
                base_filter = and_(
                    Rent.apt_id == nearby_apartment.apt_id,
                    or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),
                    (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                    Rent.deal_date >= date_from,
                    Rent.deposit_price.isnot(None),
                    Rent.exclusive_area.isnot(None),
                    Rent.exclusive_area > 0
                )
            elif transaction_type == "monthly":
                trans_table = Rent
                price_field = Rent.deposit_price
                date_field = Rent.deal_date
                area_field = Rent.exclusive_area
                base_filter = and_(
                    Rent.apt_id == nearby_apartment.apt_id,
                    Rent.monthly_rent > 0,
                    (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                    Rent.deal_date >= date_from,
                    Rent.monthly_rent.isnot(None),
                    Rent.exclusive_area.isnot(None),
                    Rent.exclusive_area > 0
                )
            else:
                trans_table = Sale
                price_field = Sale.trans_price
                date_field = Sale.contract_date
                area_field = Sale.exclusive_area
                base_filter = and_(
                    Sale.apt_id == nearby_apartment.apt_id,
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                    Sale.contract_date >= date_from,
                    Sale.trans_price.isnot(None),
                    Sale.exclusive_area.isnot(None),
                    Sale.exclusive_area > 0
                )
            
            # 면적 필터 추가
            if area is not None:
                base_filter = and_(
                    base_filter,
                    area_field >= area - area_tolerance,
                    area_field <= area + area_tolerance
                )
            
            # statistics 계산
            stats_stmt = (
                select(
                    func.count(trans_table.trans_id).label('total_count'),
                    func.avg(cast(price_field, Float)).label('avg_price'),
                    func.avg(
                        case(
                            (and_(
                                area_field.isnot(None),
                                area_field > 0
                            ), cast(price_field, Float) / cast(area_field, Float) * 3.3),
                            else_=None
                        )
                    ).label('avg_price_per_pyeong'),
                    func.min(cast(price_field, Float)).label('min_price'),
                    func.max(cast(price_field, Float)).label('max_price')
                )
                .where(
                    and_(
                        base_filter,
                        area_field.isnot(None),
                        area_field > 0
                    )
                )
            )
            stats_result = await db.execute(stats_stmt)
            stats_row = stats_result.one()
            
            # 가격 정보 처리
            average_price = None
            average_price_per_sqm = None
            transaction_count = 0
            
            if stats_row.total_count and stats_row.total_count > 0:
                average_price = round(float(stats_row.avg_price or 0), 0) if stats_row.avg_price else None
                if stats_row.avg_price_per_pyeong:
                    avg_price_per_pyeong = float(stats_row.avg_price_per_pyeong)
                    average_price_per_sqm = round(avg_price_per_pyeong / 3.3, 2)
                transaction_count = stats_row.total_count
            
            # 가격 정보가 있는 경우만 추가
            if average_price is not None and average_price > 0:
                nearby_item = NearbyComparisonItem(
                    apt_id=nearby_apartment.apt_id,
                    apt_name=nearby_apartment.apt_name,
                    road_address=nearby_detail.road_address,
                    jibun_address=nearby_detail.jibun_address,
                    distance_meters=None,  # 같은 법정동이므로 거리 정보 없음
                    total_household_cnt=nearby_detail.total_household_cnt,
                    total_building_cnt=nearby_detail.total_building_cnt,
                    builder_name=nearby_detail.builder_name,
                    use_approval_date=nearby_detail.use_approval_date,
                    average_price=average_price,
                    average_price_per_sqm=average_price_per_sqm,
                    transaction_count=transaction_count
                )
                
                same_region_apartments.append(nearby_item)
        
        return {
            "target_apartment": target_info,
            "same_region_apartments": [item.model_dump() for item in same_region_apartments],
            "count": len(same_region_apartments),
            "period_months": months
        }
    
    async def get_apartments_by_region(
        self,
        db: AsyncSession,
        *,
        region_id: int,
        limit: int = 50,
        skip: int = 0
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        지역별 아파트 목록 조회
        
        특정 지역(시군구 또는 동)에 속한 아파트 목록을 반환합니다.
        - 동을 선택하면 자동으로 상위 시군구로 변경하여 해당 시군구의 모든 아파트를 조회합니다.
        - 시군구를 선택하면 해당 시군구 코드로 시작하는 모든 동의 아파트를 조회합니다.
        
        Args:
            db: 데이터베이스 세션
            region_id: 지역 ID (states.region_id)
            limit: 반환할 최대 개수
            skip: 건너뛸 레코드 수
        
        Returns:
            아파트 목록 (검색 결과 형식과 동일), 총 개수
        """
        # 먼저 지역 정보 조회
        state = await state_crud.get(db, id=region_id)
        if not state:
            return [], 0
        
        # geometry 좌표를 포함한 쿼리
        from sqlalchemy import func, select as sql_select
        from app.models.state import State as StateModel
        from app.models.apart_detail import ApartDetail as ApartDetailModel

        #  [BUG FIX] 동 단위 감지 시 상위 시군구로 변경
        # apartments 테이블의 region_id가 대부분 시군구 레벨로 저장되어 있어,
        # 동 단위로 검색 시 결과가 0건인 문제를 해결하기 위함.
        if state.region_code and len(state.region_code) >= 5:
            if state.region_code[-5:] != "00000":
                # 동 단위인 경우, 상위 시군구를 찾아야 함
                # region_code의 앞 5자리로 시군구 찾기
                sigungu_code = state.region_code[:5] + "00000"
                sigungu_stmt = sql_select(StateModel).where(StateModel.region_code == sigungu_code)
                sigungu_result = await db.execute(sigungu_stmt)
                sigungu = sigungu_result.scalar_one_or_none()
                if sigungu:
                    state = sigungu
                    logger.info(f" [get_apartments_by_region] 동 단위 감지 → 상위 시군구로 변경: region_id={state.region_id}, region_name={state.region_name}")
        
        # location_type 판단
        # region_code의 마지막 8자리가 "00000000"이면 시도 레벨
        # region_code의 마지막 5자리가 "00000"이면 시군구 레벨
        # 그 외는 동 레벨
        is_city = state.region_code[-8:] == "00000000"
        is_sigungu = state.region_code[-5:] == "00000" and not is_city
        is_dong = not is_city and not is_sigungu

        # 전체 개수 조회를 위한 쿼리 (count 쿼리)
        if is_city:
            #  시도 선택: 해당 시도 코드(앞 2자리)로 시작하는 모든 지역의 아파트 조회
            city_code_prefix = state.region_code[:2]
            logger.info(f" [get_apartments_by_region] 시도 레벨 검색 - region_name={state.region_name}, prefix={city_code_prefix}")
            count_stmt = (
                select(func.count(Apartment.apt_id))
                .join(StateModel, Apartment.region_id == StateModel.region_id)
                .where(
                    StateModel.region_code.like(f"{city_code_prefix}%"),
                    Apartment.is_deleted == False,
                    StateModel.is_deleted == False
                )
            )
            stmt = (
                select(
                    Apartment,
                    ApartDetailModel,
                    func.ST_X(ApartDetailModel.geometry).label('lng'),
                    func.ST_Y(ApartDetailModel.geometry).label('lat')
                )
                .outerjoin(
                    ApartDetailModel,
                    and_(
                        Apartment.apt_id == ApartDetailModel.apt_id,
                        ApartDetailModel.is_deleted == False
                    )
                )
                .join(
                    StateModel,
                    Apartment.region_id == StateModel.region_id
                )
                .where(
                    StateModel.region_code.like(f"{city_code_prefix}%"),
                    Apartment.is_deleted == False,
                    StateModel.is_deleted == False
                )
                .order_by(Apartment.apt_name)
                .offset(skip)
                .limit(limit)
            )
        elif is_sigungu:
            #  시군구 선택: 해당 시군구 코드로 시작하는 모든 동의 아파트 조회
            # apartments 테이블에 직접 region_id가 시군구로 저장된 경우와
            # 하위 동에 region_id가 저장된 경우를 모두 포함
            sigungu_code_prefix = state.region_code[:5]
            logger.info(f" [get_apartments_by_region] 시군구 레벨 검색 - region_name={state.region_name}, prefix={sigungu_code_prefix}, region_code={state.region_code}")
            
            #  고양시, 안산시, 용인시 등 시 내부에 구가 있는 경우 처리
            # 문제: "고양시"의 하위 구들("덕양구", "일산동구" 등)이 region_code의 앞 5자리가 다름
            # 예: 고양시 "4128000000" (앞 5자리: "41280"), 덕양구 "4128100000" (앞 5자리: "41281"), 일산동구 "4128200000" (앞 5자리: "41282")
            # 해결: 시 단위인 경우 region_code의 앞 4자리("4128")로 검색하여 모든 하위 구 포함
            if state.region_name.endswith("시") and not state.region_name.endswith("특별시") and not state.region_name.endswith("광역시"):
                # 시 내부에 구가 있는 경우: 앞 4자리로 검색
                sigungu_prefix_4 = state.region_code[:4]  # 예: "4128"
                sub_regions_stmt = sql_select(StateModel.region_id).where(
                    and_(
                        StateModel.region_code.like(f"{sigungu_prefix_4}%"),  # "4128%" → "41280", "41281", "41282" 등 모두 매칭
                        StateModel.city_name == state.city_name,  # 같은 시도 내
                        StateModel.is_deleted == False
                    )
                )
                sub_regions_result = await db.execute(sub_regions_stmt)
                sub_region_ids = [row.region_id for row in sub_regions_result.fetchall()]
                logger.info(f" [get_apartments_by_region] 하위 지역 수 (region_code 4자리 기반) - {len(sub_region_ids)}개 (prefix: {sigungu_prefix_4}, region_name: {state.region_name})")
            else:
                # 일반 시군구(구가 없는 시 또는 일반 구): 앞 5자리로 검색 (기존 로직)
                sub_regions_stmt = sql_select(StateModel.region_id).where(
                    and_(
                        StateModel.region_code.like(f"{sigungu_code_prefix}%"),
                        StateModel.is_deleted == False
                    )
                )
                sub_regions_result = await db.execute(sub_regions_stmt)
                sub_region_ids = [row.region_id for row in sub_regions_result.fetchall()]
                logger.info(f" [get_apartments_by_region] 하위 지역 수 (region_code 5자리 기반) - {len(sub_region_ids)}개 (prefix: {sigungu_code_prefix})")
            
            # 본체 region_id가 하위 지역 목록에 없으면 추가
            if state.region_id not in sub_region_ids:
                sub_region_ids.append(state.region_id)
                logger.info(f" [get_apartments_by_region] 시군구 본체 region_id 추가 - {state.region_id} ({state.region_name})")
            
            if len(sub_region_ids) == 0:
                logger.warning(f" [get_apartments_by_region] 하위 지역을 찾을 수 없음 - region_name={state.region_name}, region_code={state.region_code}")
                # 하위 지역이 없으면 본체만 조회
                sub_region_ids = [state.region_id]
            
            count_stmt = (
                select(func.count(Apartment.apt_id))
                .where(
                    Apartment.region_id.in_(sub_region_ids),
                    Apartment.is_deleted == False
                )
            )
            stmt = (
                select(
                    Apartment,
                    ApartDetailModel,
                    func.ST_X(ApartDetailModel.geometry).label('lng'),
                    func.ST_Y(ApartDetailModel.geometry).label('lat')
                )
                .outerjoin(
                    ApartDetailModel,
                    and_(
                        Apartment.apt_id == ApartDetailModel.apt_id,
                        ApartDetailModel.is_deleted == False
                    )
                )
                .where(
                    Apartment.region_id.in_(sub_region_ids),
                    Apartment.is_deleted == False
                )
                .order_by(Apartment.apt_name)
                .offset(skip)
                .limit(limit)
            )
        elif is_dong:
            #  동 레벨 검색: 해당 동의 아파트만 조회
            logger.info(f" [get_apartments_by_region] 동 레벨 검색 - region_name={state.region_name}, region_id={state.region_id}")
            
            count_stmt = (
                select(func.count(Apartment.apt_id))
                .where(
                    Apartment.region_id == state.region_id,
                    Apartment.is_deleted == False
                )
            )
            stmt = (
                select(
                    Apartment,
                    ApartDetailModel,
                    func.ST_X(ApartDetailModel.geometry).label('lng'),
                    func.ST_Y(ApartDetailModel.geometry).label('lat')
                )
                .outerjoin(
                    ApartDetailModel,
                    and_(
                        Apartment.apt_id == ApartDetailModel.apt_id,
                        ApartDetailModel.is_deleted == False
                    )
                )
                .where(
                    Apartment.region_id == state.region_id,
                    Apartment.is_deleted == False
                )
                .order_by(Apartment.apt_name)
                .offset(skip)
                .limit(limit)
            )
        else:
            # 예상치 못한 경우
            logger.warning(f" [get_apartments_by_region] 예상치 못한 지역 레벨 - region_id={state.region_id}, region_code={state.region_code}")
            return [], 0
    
    # 전체 개수와 결과를 동시에 조회
        count_result, result = await asyncio.gather(
            db.execute(count_stmt),
            db.execute(stmt)
        )
        total_count = count_result.scalar() or 0
        rows = result.all()
        
        results = []
        for row in rows:
            apartment = row[0]
            detail = row[1]
            lng = row[2] if len(row) > 2 else None
            lat = row[3] if len(row) > 3 else None
            
            address = None
            location = None
            
            if detail:
                address = detail.road_address if detail.road_address else (detail.jibun_address if detail.jibun_address else None)
            
            if lat is not None and lng is not None:
                location = {
                    "lat": float(lat),
                    "lng": float(lng)
                }
            
            results.append({
                "apt_id": apartment.apt_id,
                "apt_name": apartment.apt_name,
                "kapt_code": apartment.kapt_code if apartment.kapt_code else None,
                "region_id": apartment.region_id,
                "address": address,
                "location": location
            })
        
        return results, total_count
    
    async def get_volume_trend(
        self,
        db: AsyncSession,
        *,
        apt_id: int
    ) -> VolumeTrendResponse:
        """
        아파트의 거래량 추이 조회
        
        sales 테이블에서 해당 아파트의 거래량을 월별로 집계합니다.
        
        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 ID
        
        Returns:
            거래량 추이 응답 스키마 객체
        
        Raises:
            NotFoundException: 아파트를 찾을 수 없는 경우
        """
        # 아파트 존재 확인
        apartment = await apart_crud.get(db, id=apt_id)
        if not apartment or apartment.is_deleted:
            raise NotFoundException("아파트")
        
        # CRUD 호출하여 월별 거래량 조회
        volume_trend_data = await apart_crud.get_volume_trend(db, apt_id=apt_id)
        
        # 결과 변환
        trend_items = [
            VolumeTrendItem(year_month=year_month, volume=volume)
            for year_month, volume in volume_trend_data
        ]
        
        # 전체 거래량 합계 계산
        total_volume = sum(volume for _, volume in volume_trend_data)
        
        return VolumeTrendResponse(
            success=True,
            apt_id=apt_id,
            data=trend_items,
            total_volume=total_volume
        )
    
    async def get_price_trend(
        self,
        db: AsyncSession,
        *,
        apt_id: int
    ) -> PriceTrendResponse:
        """
        아파트의 평당가 추이 조회
        
        sales 테이블에서 해당 아파트의 평당가를 월별로 집계합니다.
        
        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 ID
        
        Returns:
            평당가 추이 응답 스키마 객체
        
        Raises:
            NotFoundException: 아파트를 찾을 수 없는 경우
        """
        # 아파트 존재 확인
        apartment = await apart_crud.get(db, id=apt_id)
        if not apartment or apartment.is_deleted:
            raise NotFoundException("아파트")
        
        # CRUD 호출하여 월별 평당가 조회
        price_trend_data = await apart_crud.get_price_trend(db, apt_id=apt_id)
        
        # 결과 변환
        trend_items = [
            PriceTrendItem(year_month=year_month, price_per_pyeong=price_per_pyeong)
            for year_month, price_per_pyeong in price_trend_data
        ]
        
        return PriceTrendResponse(
            success=True,
            apt_id=apt_id,
            data=trend_items
        )

    async def detailed_search(
        self,
        db: AsyncSession,
        *,
        region_id: Optional[int] = None,
        min_area: Optional[float] = None,
        max_area: Optional[float] = None,
        min_price: Optional[int] = None,
        max_price: Optional[int] = None,
        min_deposit: Optional[int] = None,
        max_deposit: Optional[int] = None,
        min_monthly_rent: Optional[int] = None,
        max_monthly_rent: Optional[int] = None,
        subway_max_distance_minutes: Optional[int] = None,
        subway_line: Optional[str] = None,
        subway_station: Optional[str] = None,
        has_education_facility: Optional[bool] = None,
        min_build_year: Optional[int] = None,
        max_build_year: Optional[int] = None,
        build_year_range: Optional[str] = None,
        min_floor: Optional[int] = None,
        max_floor: Optional[int] = None,
        floor_type: Optional[str] = None,
        min_parking_cnt: Optional[int] = None,
        has_parking: Optional[bool] = None,
        builder_name: Optional[str] = None,
        developer_name: Optional[str] = None,
        heating_type: Optional[str] = None,
        manage_type: Optional[str] = None,
        hallway_type: Optional[str] = None,
        recent_transaction_months: Optional[int] = None,
        apartment_name: Optional[str] = None,
        limit: int = 50,
        skip: int = 0
    ) -> List[Dict[str, Any]]:
        """
        아파트 상세 검색 (확장 버전)
        
        위치, 평수, 가격, 지하철 거리, 교육시설, 건축년도, 층수, 주차, 건설사 등
        다양한 조건으로 아파트를 검색합니다.
        N+1 문제를 해결하고 DB 레벨 필터링을 사용하여 성능을 최적화했습니다.
        
        Args:
            db: 데이터베이스 세션
            region_id: 지역 ID (states.region_id)
            min_area: 최소 전용면적 (㎡)
            max_area: 최대 전용면적 (㎡)
            min_price: 최소 매매가격 (만원)
            max_price: 최대 매매가격 (만원)
            min_deposit: 최소 보증금 (만원, 전세/월세)
            max_deposit: 최대 보증금 (만원, 전세/월세)
            min_monthly_rent: 최소 월세 (만원)
            max_monthly_rent: 최대 월세 (만원)
            subway_max_distance_minutes: 지하철역까지 최대 도보 시간 (분)
            subway_line: 지하철 노선 (예: '2호선', '3호선')
            subway_station: 지하철 역명 (예: '강남역', '홍대입구역')
            has_education_facility: 교육시설 유무 (True: 있음, False: 없음, None: 상관없음)
            min_build_year: 최소 건축년도
            max_build_year: 최대 건축년도
            build_year_range: 건축년도 범위 (예: '신축', '10년이하', '20년이하')
            min_floor: 최소 층수
            max_floor: 최대 층수
            floor_type: 층수 유형 (예: '저층', '중층', '고층')
            min_parking_cnt: 최소 주차대수
            has_parking: 주차 가능 여부 (True: 있음, False: 없음, None: 상관없음)
            builder_name: 건설사명 (예: '롯데건설', '삼성물산')
            developer_name: 시공사명
            heating_type: 난방방식 (예: '지역난방', '개별난방')
            manage_type: 관리방식 (예: '자치관리', '위탁관리')
            hallway_type: 복도유형 (예: '계단식', '복도식', '혼합식')
            recent_transaction_months: 최근 거래 기간 (개월, 예: 3, 6, 12)
            apartment_name: 아파트 이름 (예: '래미안', '힐스테이트')
            limit: 반환할 최대 개수
            skip: 건너뛸 레코드 수
        
        Returns:
            검색 결과 목록 (dict 리스트)
        """
        from app.models.sale import Sale
        from app.models.rent import Rent
        from app.models.state import State as StateModel
        from datetime import datetime, timedelta
        
        # 최근 거래 기간 계산 (기본값: 6개월)
        transaction_months = recent_transaction_months if recent_transaction_months else 6
        date_from = datetime.now().date() - timedelta(days=transaction_months * 30)
        
        # 건축년도 범위 처리
        if build_year_range:
            current_year = datetime.now().year
            if build_year_range == '신축':
                min_build_year = max(min_build_year or 0, 2020)  # 2020년 이후
            elif build_year_range == '10년이하':
                min_build_year = max(min_build_year or 0, current_year - 10)
            elif build_year_range == '20년이하':
                min_build_year = max(min_build_year or 0, current_year - 20)
        
        # 전세/월세 조건이 있는지 확인 (서브쿼리 최적화)
        has_rent_conditions = any([
            min_deposit is not None,
            max_deposit is not None,
            min_monthly_rent is not None,
            max_monthly_rent is not None
        ])
        
        logger.info(f"[DETAILED_SEARCH] 검색 시작 - region_id: {region_id}, min_deposit: {min_deposit}, max_deposit: {max_deposit}, min_monthly_rent: {min_monthly_rent}, max_monthly_rent: {max_monthly_rent}")
        logger.info(f"[DETAILED_SEARCH] 전세/월세 조건 존재: {has_rent_conditions}")
        
        # ===== 서브쿼리 최적화: 인덱스 활용 =====
        # apt_id (인덱스), contract_date (인덱스), is_canceled (인덱스) 순으로 필터링
        
        # 서브쿼리: 아파트별 평균 가격 및 평균 면적 계산 (매매)
        sale_select_fields = [
            Sale.apt_id.label('apt_id'),
            func.avg(cast(Sale.trans_price, Float)).label('avg_price'),
            func.avg(Sale.exclusive_area).label('avg_area')
        ]
        
        # 건축년도 조건이 있거나 전세/월세 조건이 없을 때만 build_year 포함
        if min_build_year is not None or max_build_year is not None or not has_rent_conditions:
            sale_select_fields.append(
                func.min(
                    cast(
                        func.nullif(func.regexp_replace(Sale.build_year, '[^0-9]', '', 'g'), ''),
                        Integer
                    )
                ).label('min_build_year_sale')
            )
        
        # 인덱스 활용 최적화: WHERE 절에서 인덱스가 있는 컬럼 우선 필터링
        sale_stats_subq = (
            select(*sale_select_fields)
            .where(
                # 인덱스 있는 컬럼 우선
                Sale.apt_id.isnot(None),  # apt_id 인덱스 활용
                Sale.contract_date >= date_from,  # contract_date 인덱스 활용
                Sale.is_canceled == False,
                or_(Sale.is_deleted == False, Sale.is_deleted.is_(None)),
                # 나머지 조건
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0,
                Sale.trans_price.isnot(None),
                or_(Sale.remarks != "더미", Sale.remarks.is_(None))  #  더미 제외
            )
            .group_by(Sale.apt_id)
        ).subquery()
        
        # 전세/월세 구분
        # 전세 조건: monthly_rent가 NULL이거나 0인 거래만
        # 월세 조건: monthly_rent가 있는 거래만
        has_deposit_condition = min_deposit is not None or max_deposit is not None
        has_monthly_rent_condition = min_monthly_rent is not None or max_monthly_rent is not None
        
        logger.info(f"[DETAILED_SEARCH] 전세 조건: {has_deposit_condition} (min: {min_deposit}, max: {max_deposit}), 월세 조건: {has_monthly_rent_condition} (min: {min_monthly_rent}, max: {max_monthly_rent})")
        
        # 서브쿼리: 아파트별 전세/월세 통계 계산 (필요할 때만)
        rent_stats_subq = None
        if has_rent_conditions or min_build_year is not None or max_build_year is not None:
            logger.info(f"[DETAILED_SEARCH] 전세/월세 서브쿼리 생성 - has_rent_conditions: {has_rent_conditions}, build_year 조건: {min_build_year is not None or max_build_year is not None}")
            rent_select_fields = [
                Rent.apt_id.label('apt_id'),
                func.avg(cast(Rent.deposit_price, Float)).label('avg_deposit'),
                func.avg(cast(Rent.monthly_rent, Float)).label('avg_monthly_rent'),
                func.avg(Rent.exclusive_area).label('avg_area_rent')
            ]
            
            # 건축년도 조건이 있을 때만 build_year 포함
            if min_build_year is not None or max_build_year is not None:
                rent_select_fields.append(
                    func.min(
                        cast(
                            func.nullif(func.regexp_replace(Rent.build_year, '[^0-9]', '', 'g'), ''),
                            Integer
                        )
                    ).label('min_build_year_rent')
                )
            
            # WHERE 조건 구성 (인덱스 있는 컬럼 우선)
            rent_where_conditions = [
                # 인덱스 있는 컬럼 우선
                Rent.apt_id.isnot(None),  # apt_id 인덱스 활용
                Rent.deal_date >= date_from,  # deal_date 인덱스 활용
                # 나머지 조건
                or_(Rent.is_deleted == False, Rent.is_deleted.is_(None)),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0,
                or_(Rent.remarks != "더미", Rent.remarks.is_(None))  #  더미 제외
            ]
            
            # 전세/월세 구분 필터링
            # 전세 조건이 있으면: monthly_rent가 NULL이거나 0인 거래만, deposit_price가 NULL이 아닌 것만
            # 월세 조건이 있으면: monthly_rent가 있는 거래만
            # 가격 필터링은 HAVING 절에서 평균값 기준으로 처리 (WHERE 절에서 필터링하면 평균값이 왜곡됨)
            if has_deposit_condition and not has_monthly_rent_condition:
                # 전세만: monthly_rent가 NULL이거나 0, deposit_price가 NULL이 아닌 것만
                logger.info(f"[DETAILED_SEARCH] 전세 거래만 필터링 (monthly_rent IS NULL OR monthly_rent = 0, deposit_price IS NOT NULL)")
                rent_where_conditions.append(
                    and_(
                        or_(
                            Rent.monthly_rent.is_(None),
                            Rent.monthly_rent == 0
                        ),
                        Rent.deposit_price.isnot(None)  # 전세 데이터가 있어야 함
                    )
                )
            elif has_monthly_rent_condition and not has_deposit_condition:
                # 월세만: monthly_rent가 있고 0보다 큰 것만
                logger.info(f"[DETAILED_SEARCH] 월세 거래만 필터링 (monthly_rent IS NOT NULL AND monthly_rent > 0)")
                rent_where_conditions.append(
                    and_(
                        Rent.monthly_rent.isnot(None),
                        Rent.monthly_rent > 0
                    )
                )
            elif has_deposit_condition and has_monthly_rent_condition:
                # 둘 다 있으면: deposit_price가 NULL이 아닌 것만 (전세/월세 모두 포함)
                logger.info(f"[DETAILED_SEARCH] 전세/월세 모두 포함 (deposit_price IS NOT NULL)")
                rent_where_conditions.append(Rent.deposit_price.isnot(None))
            else:
                # 전세/월세 조건이 없으면 모든 거래 포함
                logger.info(f"[DETAILED_SEARCH] 전세/월세 조건 없음 - 모든 거래 포함")
            
            rent_stats_subq = (
                select(*rent_select_fields)
                .where(and_(*rent_where_conditions))
                .group_by(Rent.apt_id)
            ).subquery()
        
        # 메인 쿼리 구성 (더 많은 필드 포함)
        select_fields = [
            Apartment.apt_id,
            Apartment.apt_name,
            Apartment.kapt_code,
            Apartment.region_id,
            ApartDetail.road_address,
            ApartDetail.jibun_address,
            ApartDetail.subway_station,
            ApartDetail.subway_line,
            ApartDetail.subway_time,
            ApartDetail.educationFacility,
            ApartDetail.total_parking_cnt,
            ApartDetail.builder_name,
            ApartDetail.developer_name,
            ApartDetail.code_heat_nm,
            ApartDetail.manage_type,
            ApartDetail.hallway_type,
            ApartDetail.use_approval_date,
            ApartDetail.highest_floor,
            func.ST_X(ApartDetail.geometry).label('lng'),
            func.ST_Y(ApartDetail.geometry).label('lat'),
            sale_stats_subq.c.avg_price.label('avg_price'),
            sale_stats_subq.c.avg_area.label('avg_area')
        ]
        
        # build_year 필드 추가 (조건부)
        if hasattr(sale_stats_subq.c, 'min_build_year_sale'):
            select_fields.append(sale_stats_subq.c.min_build_year_sale.label('min_build_year_sale'))
        
        # 전세/월세 필드 추가 (조건부)
        if rent_stats_subq is not None:
            select_fields.extend([
                rent_stats_subq.c.avg_deposit.label('avg_deposit'),
                rent_stats_subq.c.avg_monthly_rent.label('avg_monthly_rent'),
                rent_stats_subq.c.avg_area_rent.label('avg_area_rent')
            ])
            if hasattr(rent_stats_subq.c, 'min_build_year_rent'):
                select_fields.append(rent_stats_subq.c.min_build_year_rent.label('min_build_year_rent'))
        
        stmt = (
            select(*select_fields)
            .outerjoin(
                ApartDetail,
                and_(
                    Apartment.apt_id == ApartDetail.apt_id,
                    ApartDetail.is_deleted == False
                )
            )
            .outerjoin(
                sale_stats_subq,
                Apartment.apt_id == sale_stats_subq.c.apt_id
            )
            .where(Apartment.is_deleted == False)
        )
        
        # 전세/월세 서브쿼리 조인 (필요할 때만)
        # 전세/월세 조건이 있으면 INNER JOIN으로 변경하여 해당 데이터가 있는 아파트만 조회
        if rent_stats_subq is not None:
            if has_rent_conditions:
                # 전세/월세 조건이 있으면 INNER JOIN (해당 데이터가 있는 아파트만)
                logger.info(f"[DETAILED_SEARCH] 전세/월세 조건이 있으므로 INNER JOIN 사용")
                stmt = stmt.join(
                    rent_stats_subq,
                    Apartment.apt_id == rent_stats_subq.c.apt_id
                )
            else:
                # 전세/월세 조건이 없으면 OUTER JOIN (모든 아파트 포함)
                logger.info(f"[DETAILED_SEARCH] 전세/월세 조건이 없으므로 OUTER JOIN 사용")
                stmt = stmt.outerjoin(
                    rent_stats_subq,
                    Apartment.apt_id == rent_stats_subq.c.apt_id
                )
        
        # 지역 조건 추가
        if region_id:
            state = await state_crud.get(db, id=region_id)
            if state:
                is_city = state.region_code[-8:] == "00000000"
                is_sigungu = state.region_code[-5:] == "00000" and not is_city
                
                if is_city:
                    city_code_prefix = state.region_code[:2]
                    stmt = stmt.join(
                        StateModel,
                        Apartment.region_id == StateModel.region_id
                    ).where(
                        StateModel.region_code.like(f"{city_code_prefix}%"),
                        StateModel.is_deleted == False
                    )
                elif is_sigungu:
                    sigungu_code_prefix = state.region_code[:5]
                    stmt = stmt.join(
                        StateModel,
                        Apartment.region_id == StateModel.region_id
                    ).where(
                        StateModel.region_code.like(f"{sigungu_code_prefix}%"),
                        StateModel.is_deleted == False
                    )
                else:
                    stmt = stmt.where(Apartment.region_id == region_id)
            else:
                stmt = stmt.where(Apartment.region_id == region_id)
        
        # 아파트 이름 필터링
        if apartment_name:
            stmt = stmt.where(
                Apartment.apt_name.ilike(f"%{apartment_name}%")
            )
        
        # 지하철 거리 조건
        if subway_max_distance_minutes is not None:
            stmt = stmt.where(
                ApartDetail.subway_time.isnot(None),
                ApartDetail.subway_time != ''
            )
        
        # 지하철역 필터 (부분 일치)
        if subway_station:
            # "역" 글자 제거 ("강남역" -> "강남")
            station_name = subway_station.replace("역", "").strip()
            if station_name:
                stmt = stmt.where(ApartDetail.subway_station.like(f"%{station_name}%"))
        
        # 지하철 노선 필터
        if subway_line:
            stmt = stmt.where(ApartDetail.subway_line.like(f"%{subway_line}%"))
            
        # 지하철 도보 거리 필터 (문자열 파싱 필요: "5분", "10분" 등)
        if subway_max_distance_minutes:
            # 데이터가 "5분", "10분", "15분" 등으로 저장되어 있다고 가정
            # 5분 이내: "5분" 포함
            # 10분 이내: "5분" 또는 "10분" 포함
            pass # 복잡한 문자열 파싱은 추후 구현, 현재는 스킵하거나 단순 LIKE로 처리
            
        # 교육 시설 필터
        if has_education_facility:
            stmt = stmt.where(and_(
                ApartDetail.educationFacility.isnot(None),
                ApartDetail.educationFacility != ""
            ))
        
        # 건축년도 조건 (use_approval_date 또는 거래 데이터의 build_year 사용)
        # Python 레벨에서 필터링하도록 변경 (HAVING 절에서 복잡한 OR 조건 처리 어려움)
        
        # 층수 조건 (highest_floor 사용)
        if min_floor is not None:
            stmt = stmt.where(
                or_(
                    ApartDetail.highest_floor.is_(None),
                    ApartDetail.highest_floor >= min_floor
                )
            )
        if max_floor is not None:
            stmt = stmt.where(
                or_(
                    ApartDetail.highest_floor.is_(None),
                    ApartDetail.highest_floor <= max_floor
                )
            )
        
        # 주차 조건
        if min_parking_cnt is not None:
            stmt = stmt.where(
                or_(
                    ApartDetail.total_parking_cnt.is_(None),
                    ApartDetail.total_parking_cnt >= min_parking_cnt
                )
            )
        if has_parking is not None:
            if has_parking:
                stmt = stmt.where(
                    or_(
                        ApartDetail.total_parking_cnt.isnot(None),
                        ApartDetail.total_parking_cnt > 0
                    )
                )
            else:
                stmt = stmt.where(
                    or_(
                        ApartDetail.total_parking_cnt.is_(None),
                        ApartDetail.total_parking_cnt == 0
                    )
                )
        
        # 건설사 조건
        if builder_name:
            stmt = stmt.where(
                ApartDetail.builder_name.ilike(f"%{builder_name}%")
            )
        
        # 시공사 조건
        if developer_name:
            stmt = stmt.where(
                ApartDetail.developer_name.ilike(f"%{developer_name}%")
            )
        
        # 난방방식 조건
        if heating_type:
            stmt = stmt.where(
                ApartDetail.code_heat_nm.ilike(f"%{heating_type}%")
            )
        
        # 관리방식 조건
        if manage_type:
            stmt = stmt.where(
                ApartDetail.manage_type.ilike(f"%{manage_type}%")
            )
        
        # 복도유형 조건
        if hallway_type:
            stmt = stmt.where(
                ApartDetail.hallway_type.ilike(f"%{hallway_type}%")
            )
        
        # 그룹화 (중복 제거) - 필요한 필드만 포함
        group_by_fields = [
            Apartment.apt_id,
            Apartment.apt_name,
            Apartment.kapt_code,
            Apartment.region_id,
            ApartDetail.road_address,
            ApartDetail.jibun_address,
            ApartDetail.subway_station,
            ApartDetail.subway_line,
            ApartDetail.subway_time,
            ApartDetail.educationFacility,
            ApartDetail.total_parking_cnt,
            ApartDetail.builder_name,
            ApartDetail.developer_name,
            ApartDetail.code_heat_nm,
            ApartDetail.manage_type,
            ApartDetail.hallway_type,
            ApartDetail.use_approval_date,
            ApartDetail.highest_floor,
            ApartDetail.geometry,
            sale_stats_subq.c.avg_price,
            sale_stats_subq.c.avg_area
        ]
        
        if hasattr(sale_stats_subq.c, 'min_build_year_sale'):
            group_by_fields.append(sale_stats_subq.c.min_build_year_sale)
        
        if rent_stats_subq is not None:
            group_by_fields.extend([
                rent_stats_subq.c.avg_deposit,
                rent_stats_subq.c.avg_monthly_rent,
                rent_stats_subq.c.avg_area_rent
            ])
            if hasattr(rent_stats_subq.c, 'min_build_year_rent'):
                group_by_fields.append(rent_stats_subq.c.min_build_year_rent)
        
        stmt = stmt.group_by(*group_by_fields)
        
        # 매매 가격 조건 (HAVING 절에서 처리)
        if min_price is not None:
            stmt = stmt.having(
                (sale_stats_subq.c.avg_price.is_(None)) |
                (sale_stats_subq.c.avg_price >= min_price)
            )
        if max_price is not None:
            stmt = stmt.having(
                (sale_stats_subq.c.avg_price.is_(None)) |
                (sale_stats_subq.c.avg_price <= max_price)
            )
        
        # 전세/월세 가격 조건 (HAVING 절에서 처리) - 서브쿼리가 있을 때만
        # 전세/월세 조건이 있으면 해당 데이터가 있는 아파트만 필터링
        if rent_stats_subq is not None and has_rent_conditions:
            logger.info(f"[DETAILED_SEARCH] 전세/월세 HAVING 절 필터링 적용 - 시간: {datetime.now().isoformat()}")
            # 전세 조건 (보증금)
            has_deposit_condition = min_deposit is not None or max_deposit is not None
            if has_deposit_condition:
                # 전세 조건이 있을 때는 반드시 전세 데이터가 있어야 함 (avg_deposit IS NOT NULL)
                # WHERE 절에서 이미 전세 거래만 필터링했으므로, HAVING 절에서는 가격 조건만 확인
                deposit_condition = rent_stats_subq.c.avg_deposit.isnot(None)  # 전세 데이터가 있어야 함
                if min_deposit is not None:
                    deposit_condition = and_(deposit_condition, rent_stats_subq.c.avg_deposit >= min_deposit)
                    logger.info(f"[DETAILED_SEARCH] 전세 최소 조건 적용: avg_deposit >= {min_deposit} (만원)")
                if max_deposit is not None:
                    deposit_condition = and_(deposit_condition, rent_stats_subq.c.avg_deposit <= max_deposit)
                    logger.info(f"[DETAILED_SEARCH] 전세 최대 조건 적용: avg_deposit <= {max_deposit} (만원)")
                stmt = stmt.having(deposit_condition)
                logger.info(f"[DETAILED_SEARCH] 전세 조건 HAVING 절 추가 완료 - 조건: min_deposit={min_deposit}, max_deposit={max_deposit}")
            else:
                logger.info(f"[DETAILED_SEARCH] 전세 조건 없음 - HAVING 절 추가 안함")
            
            # 월세 조건
            has_monthly_rent_condition = min_monthly_rent is not None or max_monthly_rent is not None
            if has_monthly_rent_condition:
                # 월세 조건이 있을 때는 반드시 월세 데이터가 있어야 함 (avg_monthly_rent IS NOT NULL AND > 0)
                monthly_rent_condition = and_(
                    rent_stats_subq.c.avg_monthly_rent.isnot(None),
                    rent_stats_subq.c.avg_monthly_rent > 0
                )
                if min_monthly_rent is not None:
                    monthly_rent_condition = and_(monthly_rent_condition, rent_stats_subq.c.avg_monthly_rent >= min_monthly_rent)
                    logger.info(f"[DETAILED_SEARCH] 월세 최소 조건 적용: avg_monthly_rent >= {min_monthly_rent} (만원)")
                if max_monthly_rent is not None:
                    monthly_rent_condition = and_(monthly_rent_condition, rent_stats_subq.c.avg_monthly_rent <= max_monthly_rent)
                    logger.info(f"[DETAILED_SEARCH] 월세 최대 조건 적용: avg_monthly_rent <= {max_monthly_rent} (만원)")
                stmt = stmt.having(monthly_rent_condition)
                logger.info(f"[DETAILED_SEARCH] 월세 조건 HAVING 절 추가 완료 - 조건: min_monthly_rent={min_monthly_rent}, max_monthly_rent={max_monthly_rent}")
            else:
                logger.info(f"[DETAILED_SEARCH] 월세 조건 없음 - HAVING 절 추가 안함")
        else:
            logger.info(f"[DETAILED_SEARCH] 전세/월세 서브쿼리 없음 또는 조건 없음 - rent_stats_subq: {rent_stats_subq is not None}, has_rent_conditions: {has_rent_conditions}")
        
        # 면적 조건 (HAVING 절에서 처리) - 매매와 전세/월세 모두 고려
        if min_area is not None:
            if rent_stats_subq is not None:
                stmt = stmt.having(
                    or_(
                        sale_stats_subq.c.avg_area.is_(None),
                        sale_stats_subq.c.avg_area >= min_area,
                        and_(
                            rent_stats_subq.c.avg_area_rent.isnot(None),
                            rent_stats_subq.c.avg_area_rent >= min_area
                        )
                    )
                )
            else:
                stmt = stmt.having(
                    (sale_stats_subq.c.avg_area.is_(None)) |
                    (sale_stats_subq.c.avg_area >= min_area)
                )
        if max_area is not None:
            if rent_stats_subq is not None:
                stmt = stmt.having(
                    or_(
                        sale_stats_subq.c.avg_area.is_(None),
                        sale_stats_subq.c.avg_area <= max_area,
                        and_(
                            rent_stats_subq.c.avg_area_rent.isnot(None),
                            rent_stats_subq.c.avg_area_rent <= max_area
                        )
                    )
                )
            else:
                stmt = stmt.having(
                    (sale_stats_subq.c.avg_area.is_(None)) |
                    (sale_stats_subq.c.avg_area <= max_area)
                )
        
        # 정렬 및 페이지네이션
        stmt = stmt.order_by(Apartment.apt_name).offset(skip).limit(limit)
        
        # 쿼리 실행
        query_start_time = time.time()
        logger.info(f"[DETAILED_SEARCH] 쿼리 실행 시작 - 시간: {datetime.now().isoformat()}")
        result = await db.execute(stmt)
        rows = result.all()
        query_end_time = time.time()
        query_duration = query_end_time - query_start_time
        logger.info(f"[DETAILED_SEARCH] 쿼리 실행 완료 - 소요시간: {query_duration:.3f}초, 결과 행 수: {len(rows)}")
        
        # 결과 변환 및 추가 필터링
        filter_start_time = time.time()
        results = []
        import re
        
        for row in rows:
            # 지하철 거리 필터링 (Python 레벨에서 처리)
            if subway_max_distance_minutes is not None and row.subway_time:
                numbers = re.findall(r'\d+', row.subway_time)
                if numbers:
                    max_time = max([int(n) for n in numbers])
                    if max_time > subway_max_distance_minutes:
                        continue  # 조건에 맞지 않으면 스킵
            
            # 층수 유형 필터링 (Python 레벨에서 처리)
            if floor_type and row.highest_floor:
                highest_floor = row.highest_floor
                if floor_type == '저층' and highest_floor > 5:
                    continue
                elif floor_type == '중층' and (highest_floor <= 5 or highest_floor > 15):
                    continue
                elif floor_type == '고층' and highest_floor <= 15:
                    continue
            
            # 건축년도 필터링 (Python 레벨에서 처리)
            build_year = None
            if row.use_approval_date:
                build_year = row.use_approval_date.year
            elif hasattr(row, 'min_build_year_sale') and row.min_build_year_sale:
                build_year = int(row.min_build_year_sale)
            elif hasattr(row, 'min_build_year_rent') and row.min_build_year_rent:
                build_year = int(row.min_build_year_rent)
            
            if min_build_year is not None and build_year and build_year < min_build_year:
                continue
            if max_build_year is not None and build_year and build_year > max_build_year:
                continue
            
            # 주소 결정
            address = row.road_address if row.road_address else (row.jibun_address if row.jibun_address else None)
            
            # 위치 정보
            location = None
            if row.lat is not None and row.lng is not None:
                location = {
                    "lat": float(row.lat),
                    "lng": float(row.lng)
                }
            
            # build_year는 이미 위에서 계산됨
            
            # 전세/월세 가격 정보 (조건부)
            avg_deposit = None
            avg_monthly_rent = None
            if hasattr(row, 'avg_deposit') and row.avg_deposit:
                avg_deposit = float(row.avg_deposit)
            if hasattr(row, 'avg_monthly_rent') and row.avg_monthly_rent:
                avg_monthly_rent = float(row.avg_monthly_rent)
            
            # 면적 정보 (매매 우선, 없으면 전세/월세)
            exclusive_area = None
            if row.avg_area:
                exclusive_area = float(row.avg_area)
            elif hasattr(row, 'avg_area_rent') and row.avg_area_rent:
                exclusive_area = float(row.avg_area_rent)
            
            results.append({
                "apt_id": row.apt_id,
                "apt_name": row.apt_name,
                "kapt_code": row.kapt_code if row.kapt_code else None,
                "region_id": row.region_id,
                "address": address,
                "location": location,
                "exclusive_area": exclusive_area,
                "average_price": float(row.avg_price) if row.avg_price else None,
                "average_deposit": avg_deposit,
                "average_monthly_rent": avg_monthly_rent,
                "subway_station": row.subway_station,
                "subway_line": row.subway_line,
                "subway_time": row.subway_time,
                "education_facility": row.educationFacility,
                "total_parking_cnt": row.total_parking_cnt,
                "builder_name": row.builder_name,
                "developer_name": row.developer_name,
                "heating_type": row.code_heat_nm,
                "manage_type": row.manage_type,
                "hallway_type": row.hallway_type,
                "build_year": build_year,
                "highest_floor": row.highest_floor
            })
        
        filter_end_time = time.time()
        filter_duration = filter_end_time - filter_start_time
        total_duration = filter_end_time - query_start_time
        
        logger.info(f"[DETAILED_SEARCH] 결과 필터링 완료 - 소요시간: {filter_duration:.3f}초, 최종 결과: {len(results)}개")
        logger.info(f"[DETAILED_SEARCH] 전체 검색 완료 - 총 소요시간: {total_duration:.3f}초 (쿼리: {query_duration:.3f}초, 필터링: {filter_duration:.3f}초)")
        
        # 전세 조건이 있는데 결과에 전세 데이터가 없는 경우 경고
        if (min_deposit is not None or max_deposit is not None) and results:
            deposit_results = [r for r in results if r.get("average_deposit") is not None]
            if len(deposit_results) == 0:
                logger.warning(f"[DETAILED_SEARCH]  전세 조건이 있지만 전세 데이터가 있는 결과가 없음! (전체 결과: {len(results)}개)")
                # 샘플 결과 로깅
                if len(results) > 0:
                    sample = results[0]
                    logger.warning(f"[DETAILED_SEARCH] 샘플 결과 - apt_id: {sample.get('apt_id')}, apt_name: {sample.get('apt_name')}, average_price: {sample.get('average_price')}, average_deposit: {sample.get('average_deposit')}")
            else:
                logger.info(f"[DETAILED_SEARCH] 전세 데이터 있는 결과: {len(deposit_results)}/{len(results)}개")
                # 전세 가격 범위 확인
                deposit_prices = [r.get("average_deposit") for r in deposit_results if r.get("average_deposit") is not None]
                if deposit_prices:
                    min_deposit_result = min(deposit_prices)
                    max_deposit_result = max(deposit_prices)
                    logger.info(f"[DETAILED_SEARCH] 전세 가격 범위 - 최소: {min_deposit_result:.1f}만원, 최대: {max_deposit_result:.1f}만원, 조건: min_deposit={min_deposit}, max_deposit={max_deposit}")
        
        return results



# 싱글톤 인스턴스 생성
# 다른 곳에서 from app.services.apartment import apartment_service 로 사용
apartment_service = ApartmentService()