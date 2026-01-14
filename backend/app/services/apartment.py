"""
아파트 관련 비즈니스 로직

담당 기능:
- 아파트 상세 정보 조회 (DB에서)
- 유사 아파트 조회
"""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.apartment import apartment as apart_crud
from app.models.apart_detail import ApartDetail
from app.schemas.apartment import (
    ApartDetailBase, 
    SimilarApartmentItem,
    VolumeTrendItem,
    VolumeTrendResponse,
    PriceTrendItem,
    PriceTrendResponse
)
from app.core.exceptions import NotFoundException


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
        
        # 모델을 스키마로 변환하여 반환
        return ApartDetailBase.model_validate(apart_detail)
    
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


# 싱글톤 인스턴스 생성
# 다른 곳에서 from app.services.apartment import apartment_service 로 사용
apartment_service = ApartmentService()