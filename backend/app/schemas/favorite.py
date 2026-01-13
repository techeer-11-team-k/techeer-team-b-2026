"""
관심 매물/지역 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


# ============ 관심 지역 (FavoriteLocation) 스키마 ============

class FavoriteLocationCreate(BaseModel):
    """관심 지역 추가 요청 스키마"""
    region_id: int = Field(..., description="지역 ID (FK)", gt=0)
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "region_id": 1
            }
        }
    )


class FavoriteLocationResponse(BaseModel):
    """관심 지역 응답 스키마"""
    favorite_id: int = Field(..., description="즐겨찾기 ID (PK)")
    account_id: int = Field(..., description="계정 ID")
    region_id: int = Field(..., description="지역 ID")
    region_name: Optional[str] = Field(None, description="시군구명")
    city_name: Optional[str] = Field(None, description="시도명")
    created_at: Optional[datetime] = Field(None, description="생성일시")
    updated_at: Optional[datetime] = Field(None, description="수정일시")
    is_deleted: bool = Field(False, description="삭제 여부")
    
    model_config = ConfigDict(from_attributes=True)


class FavoriteLocationListResponse(BaseModel):
    """관심 지역 목록 응답 스키마"""
    favorites: List[FavoriteLocationResponse] = Field(..., description="관심 지역 목록")
    total: int = Field(..., description="총 개수")
    limit: int = Field(50, description="최대 개수 제한")


# ============ 관심 아파트 (FavoriteApartment) 스키마 ============
# (나중에 아파트 기능 추가 시 사용)

class FavoriteApartmentCreate(BaseModel):
    """관심 아파트 추가 요청 스키마"""
    apt_id: int = Field(..., description="아파트 ID (FK)", gt=0)
    memo: Optional[str] = Field(None, description="메모", max_length=500)
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "apt_id": 12345,
                "memo": "투자 검토 중"
            }
        }
    )


class FavoriteApartmentResponse(BaseModel):
    """관심 아파트 응답 스키마"""
    favorite_id: int = Field(..., description="즐겨찾기 ID (PK)")
    account_id: Optional[int] = Field(None, description="계정 ID")
    apt_id: int = Field(..., description="아파트 ID")
    memo: Optional[str] = Field(None, description="메모")
    created_at: Optional[datetime] = Field(None, description="생성일시")
    updated_at: Optional[datetime] = Field(None, description="수정일시")
    is_deleted: bool = Field(False, description="삭제 여부")
    
    model_config = ConfigDict(from_attributes=True)
