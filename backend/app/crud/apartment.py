"""
아파트 관련 CRUD

담당 기능:
- 아파트 상세 정보 조회
- (향후) 아파트 기본 정보 CRUD 추가 가능
"""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.apart_detail import ApartDetail

# 조회만 필요하므로 CreateSchemaType, UpdateSchemaType은 dict로 설정
class CRUDApartment(CRUDBase[ApartDetail, dict, dict]):
    """
    아파트 상세정보 CRUD
    
    현재는 조회 기능만 구현되어 있습니다.
    필요시 생성, 수정, 삭제 기능을 추가할 수 있습니다.
    """
    
    async def get_by_apt_id(
        self,
        db: AsyncSession,   
        *,
        apt_id: int
    ) -> Optional[ApartDetail]:
        """
        아파트 ID로 상세 정보 조회
        
        Args:
            db: 
            apt_id: 아파트 ID (apartments.apt_id)
        
        Returns:
            아파트 상세 정보 객체 또는 None
        """
        result = await db.execute(
            select(ApartDetail).where(
                ApartDetail.apt_id == apt_id,
                ApartDetail.is_deleted == False  # 삭제되지 않은 것만 조회
            )
        )
        return result.scalar_one_or_none()
    
    async def get_by_detail_id(
        self,
        db: AsyncSession,
        *,
        apt_detail_id: int
    ) -> Optional[ApartDetail]:
        """
        상세 정보 ID로 조회
        
        Args:
            db: 데이터베이스 세션
            apt_detail_id: 아파트 상세정보 ID (apart_details.apt_detail_id)
        
        Returns:
            아파트 상세 정보 객체 또는 None
        """
        result = await db.execute(
            select(ApartDetail).where(
                ApartDetail.apt_detail_id == apt_detail_id,
                ApartDetail.is_deleted == False  # 삭제되지 않은 것만 조회
            )
        )
        return result.scalar_one_or_none()


# 싱글톤 인스턴스 생성
# 다른 곳에서 from app.crud.apartment import apartment 로 사용
apartment = CRUDApartment(ApartDetail)