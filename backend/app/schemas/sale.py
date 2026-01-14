from typing import Optional, List, Dict, Any
from datetime import date
from pydantic import BaseModel, Field

class SaleBase(BaseModel):
    """매매 거래 기본 스키마"""
    apt_id: int
    build_year: Optional[str] = None
    trans_type: str = "매매"
    trans_price: Optional[int] = None
    exclusive_area: float
    floor: int
    building_num: Optional[str] = None
    contract_date: Optional[date] = None
    is_canceled: bool = False
    cancel_date: Optional[date] = None
    remarks: Optional[str] = None

class SaleCreate(SaleBase):
    """매매 거래 생성 스키마"""
    pass

class SaleInDB(SaleBase):
    """DB에 저장된 매매 거래 스키마"""
    trans_id: int
    created_at: Any
    updated_at: Any
    is_deleted: Optional[bool] = False

    class Config:
        from_attributes = True

class SalesCollectionResponse(BaseModel):
    """매매 거래 수집 결과 응답"""
    success: bool
    total_fetched: int = 0
    total_saved: int = 0
    skipped: int = 0
    errors: List[str] = []
    message: str = ""
