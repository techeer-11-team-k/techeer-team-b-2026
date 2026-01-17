"""
부동산 거래량 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class HouseVolumeBase(BaseModel):
    """기본 부동산 거래량 스키마"""
    region_id: int = Field(..., description="지역 ID (FK)")
    base_ym: str = Field(..., description="기준 년월 (YYYYMM)", max_length=6, min_length=6)
    volume_value: int = Field(..., description="거래량 값")
    volume_area: Optional[float] = Field(None, description="거래 면적")


class HouseVolumeCreate(HouseVolumeBase):
    """부동산 거래량 생성 스키마"""
    pass


class HouseVolumeUpdate(BaseModel):
    """부동산 거래량 수정 스키마"""
    volume_value: Optional[int] = Field(None, description="거래량 값")
    volume_area: Optional[float] = Field(None, description="거래 면적")


class HouseVolumeResponse(HouseVolumeBase):
    """부동산 거래량 응답 스키마"""
    volume_id: int = Field(..., description="거래량 ID (PK)")
    created_at: Optional[datetime] = Field(None, description="생성일시")
    updated_at: Optional[datetime] = Field(None, description="수정일시")
    is_deleted: bool = Field(..., description="삭제 여부")
    
    model_config = ConfigDict(from_attributes=True)


class HouseVolumeCollectionResponse(BaseModel):
    """부동산 거래량 데이터 수집 응답 스키마"""
    success: bool = Field(..., description="수집 성공 여부")
    total_fetched: int = Field(..., description="API에서 가져온 총 레코드 수")
    total_saved: int = Field(..., description="데이터베이스에 저장된 레코드 수")
    skipped: int = Field(..., description="중복으로 건너뛴 레코드 수")
    errors: list[str] = Field(default_factory=list, description="오류 메시지 목록")
    message: str = Field(..., description="결과 메시지")


class HouseVolumeIndicatorResponse(BaseModel):
    """부동산 거래량 지표 응답 스키마"""
    region_id: int = Field(..., description="지역 ID")
    base_ym: str = Field(..., description="기준 년월 (YYYYMM)")
    volume_value: int = Field(..., description="거래량 값")
    volume_area: Optional[float] = Field(None, description="거래 면적")