"""
최근 본 아파트 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class RecentViewCreate(BaseModel):
    """최근 본 아파트 저장 요청 스키마"""
    apt_id: int = Field(..., gt=0, description="아파트 ID")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "apt_id": 12345
            }
        }
    )


class RecentViewApartmentInfo(BaseModel):
    """아파트 기본 정보 (최근 본 아파트 응답에 포함)"""
    apt_id: int = Field(..., description="아파트 ID")
    apt_name: str = Field(..., description="아파트 단지명")
    kapt_code: Optional[str] = Field(None, description="국토부 단지코드")
    region_name: Optional[str] = Field(None, description="시군구명")
    city_name: Optional[str] = Field(None, description="시도명")
    
    model_config = ConfigDict(from_attributes=True)


class RecentViewResponse(BaseModel):
    """최근 본 아파트 응답 스키마"""
    view_id: int = Field(..., description="조회 ID (PK)")
    account_id: int = Field(..., description="계정 ID")
    apt_id: int = Field(..., description="아파트 ID")
    viewed_at: Optional[datetime] = Field(None, description="조회일시")
    created_at: Optional[datetime] = Field(None, description="생성일시")
    updated_at: Optional[datetime] = Field(None, description="수정일시")
    apartment: Optional[RecentViewApartmentInfo] = Field(None, description="아파트 정보")
    
    model_config = ConfigDict(from_attributes=True)


class RecentViewListResponse(BaseModel):
    """최근 본 아파트 목록 응답 스키마"""
    recent_views: List[RecentViewResponse] = Field(..., description="최근 본 아파트 목록")
    total: int = Field(..., description="총 개수")
