"""
거래 내역 스키마

매매와 전월세 거래를 통합한 응답 스키마입니다.
"""
from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


class TransactionResponse(BaseModel):
    """거래 내역 응답 스키마"""
    
    # 공통 필드
    trans_id: int = Field(..., description="거래 ID")
    apt_id: int = Field(..., description="아파트 ID")
    transaction_type: str = Field(..., description="거래 유형: '매매' 또는 '전세' 또는 '월세'")
    deal_date: Optional[date] = Field(None, description="거래일/계약일")
    exclusive_area: float = Field(..., description="전용면적 (㎡)")
    floor: int = Field(..., description="층")
    
    # 아파트 정보
    apartment_name: Optional[str] = Field(None, description="아파트명")
    apartment_location: Optional[str] = Field(None, description="아파트 위치")
    
    # 매매 거래 필드 (transaction_type이 '매매'일 때만)
    trans_price: Optional[int] = Field(None, description="거래가격 (매매만)")
    
    # 전월세 거래 필드 (transaction_type이 '전세' 또는 '월세'일 때만)
    deposit_price: Optional[int] = Field(None, description="보증금 (전월세만)")
    monthly_rent: Optional[int] = Field(None, description="월세 (월세만)")
    rent_type: Optional[str] = Field(None, description="전세/월세 구분 (JEONSE, MONTHLY_RENT)")
    
    class Config:
        from_attributes = True


class TransactionListResponse(BaseModel):
    """거래 내역 목록 응답 스키마"""
    transactions: list[TransactionResponse] = Field(..., description="거래 내역 목록")
    total: int = Field(..., description="전체 거래 수")
    limit: int = Field(..., description="요청한 개수")
