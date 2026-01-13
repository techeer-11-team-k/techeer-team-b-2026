"""
아파트 관련 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class ApartmentBase(BaseModel):
    """기본 아파트 정보 스키마"""
    region_id: int = Field(..., description="지역 ID (FK)")
    apt_name: str = Field(..., description="아파트 단지명", max_length=100)
    kapt_code: str = Field(..., description="국토부 단지코드", max_length=20)
    is_available: Optional[str] = Field(None, description="거래 가능 여부", max_length=255)


class ApartmentCreate(ApartmentBase):
    """아파트 정보 생성 스키마"""
    pass


class ApartmentUpdate(BaseModel):
    """아파트 정보 수정 스키마"""
    region_id: Optional[int] = Field(None, description="지역 ID")
    apt_name: Optional[str] = Field(None, description="아파트 단지명", max_length=100)
    kapt_code: Optional[str] = Field(None, description="국토부 단지코드", max_length=20)
    is_available: Optional[str] = Field(None, description="거래 가능 여부", max_length=255)


class ApartmentResponse(ApartmentBase):
    """아파트 정보 응답 스키마"""
    apt_id: int = Field(..., description="아파트 ID (PK)")
    created_at: Optional[datetime] = Field(None, description="생성일시")
    updated_at: Optional[datetime] = Field(None, description="수정일시")
    is_deleted: bool = Field(False, description="삭제 여부")
    
    model_config = ConfigDict(from_attributes=True)


class ApartmentCollectionResponse(BaseModel):
    """아파트 데이터 수집 응답 스키마"""
    success: bool = Field(..., description="수집 성공 여부")
    total_fetched: int = Field(..., description="API에서 가져온 총 레코드 수")
    total_saved: int = Field(..., description="데이터베이스에 저장된 레코드 수")
    skipped: int = Field(..., description="중복으로 건너뛴 레코드 수")
    errors: list[str] = Field(default_factory=list, description="오류 메시지 목록")
    message: str = Field(..., description="결과 메시지")
