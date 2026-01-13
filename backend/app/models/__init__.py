"""
모든 모델을 한 곳에서 import

SQLAlchemy가 모든 모델을 인식할 수 있도록 모든 모델을 import합니다.
이 파일은 Alembic 마이그레이션과 SQLAlchemy 관계 설정에 필요합니다.
"""
# 모든 모델을 import하여 SQLAlchemy가 관계를 인식할 수 있도록 함
from app.models.account import Account
from app.models.state import State
from app.models.apartment import Apartment
from app.models.apart_detail import ApartDetail
from app.models.sale import Sale
from app.models.rent import Rent
from app.models.house_score import HouseScore
from app.models.favorite import FavoriteLocation, FavoriteApartment
from app.models.my_property import MyProperty

__all__ = [
    "Account",
    "State",
    "Apartment",
    "ApartDetail",
    "Sale",
    "Rent",
    "HouseScore",
    "FavoriteLocation",
    "FavoriteApartment",
    "MyProperty",
]
