"""
데이터 수집 서비스 메인 모듈

각 수집 모듈로 위임합니다.
"""
from app.services.data_collection.state_collection import StateCollectionService
from app.services.data_collection.apt_collection import AptCollectionService
from app.services.data_collection.apt_detail_collection import AptDetailCollectionService
from app.services.data_collection.sale_collection import SaleCollectionService
from app.services.data_collection.rent_collection import RentCollectionService
from app.services.data_collection.house_score_collection import HouseScoreCollectionService
from app.services.data_collection.house_volume_collection import HouseVolumeCollectionService

# 서비스 인스턴스 생성
_state_service = StateCollectionService()
_apt_service = AptCollectionService()
_apt_detail_service = AptDetailCollectionService()
_sale_service = SaleCollectionService()
_rent_service = RentCollectionService()
_house_score_service = HouseScoreCollectionService()
_house_volume_service = HouseVolumeCollectionService()


class DataCollectionService:
    """
    데이터 수집 서비스 메인 클래스
    
    각 수집 모듈로 위임합니다.
    """
    
    def __init__(self):
        """서비스 초기화"""
        self.state_service = _state_service
        self.apt_service = _apt_service
        self.apt_detail_service = _apt_detail_service
        self.sale_service = _sale_service
        self.rent_service = _rent_service
        self.house_score_service = _house_score_service
        self.house_volume_service = _house_volume_service
    
    # State Collection
    async def collect_all_regions(self, db, *args, **kwargs):
        return await self.state_service.collect_all_regions(db, *args, **kwargs)
    
    # Apartment Collection
    async def collect_all_apartments(self, db, *args, **kwargs):
        return await self.apt_service.collect_all_apartments(db, *args, **kwargs)
    
    # Apartment Detail Collection
    async def collect_apartment_details(self, db, *args, **kwargs):
        return await self.apt_detail_service.collect_apartment_details(db, *args, **kwargs)
    
    # Sale Collection
    async def collect_sales_data(self, db, *args, **kwargs):
        return await self.sale_service.collect_sales_data(db, *args, **kwargs)
    
    # Rent Collection
    async def collect_rent_data(self, db, *args, **kwargs):
        return await self.rent_service.collect_rent_data(db, *args, **kwargs)
    
    # House Score Collection
    async def collect_house_scores(self, db, *args, **kwargs):
        return await self.house_score_service.collect_house_scores(db, *args, **kwargs)
    
    # House Volume Collection
    async def collect_house_volumes(self, db, *args, **kwargs):
        return await self.house_volume_service.collect_house_volumes(db, *args, **kwargs)


# 서비스 인스턴스 생성
data_collection_service = DataCollectionService()
