"""
아파트 관련 비즈니스 로직

담당 기능:
- 아파트 상세 정보 조회 (DB에서)
"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.apartment import apartment as apart_crud
from app.models.apart_detail import ApartDetail
from app.schemas.apartment import ApartDetailBase
from app.core.exceptions import NotFoundException


class ApartmentService:
    """
    아파트 관련 비즈니스 로직
    
    - 아파트 상세 정보 조회: DB에서 아파트 상세 정보를 조회합니다.
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


# 싱글톤 인스턴스 생성
# 다른 곳에서 from app.services.apartment import apartment_service 로 사용
apartment_service = ApartmentService()