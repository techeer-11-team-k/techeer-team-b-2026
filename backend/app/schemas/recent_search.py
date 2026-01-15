"""
최근 검색어 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class RecentSearchCreate(BaseModel):
    """최근 검색어 저장 요청 스키마"""
    query: str = Field(..., min_length=1, max_length=255, description="검색어")
    search_type: str = Field(
        default="apartment",
        pattern="^(apartment|location)$",
        description="검색 유형 (apartment: 아파트 검색, location: 지역 검색)"
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "query": "롯데캐슬",
                "search_type": "apartment"
            }
        }
    )


class RecentSearchResponse(BaseModel):
    """최근 검색어 응답 스키마"""
    search_id: int = Field(..., description="검색어 ID (PK)")
    account_id: int = Field(..., description="계정 ID")
    query: str = Field(..., description="검색어")
    search_type: str = Field(..., description="검색 유형 (apartment, location)")
    searched_at: Optional[datetime] = Field(None, description="검색일시 (created_at)")
    created_at: Optional[datetime] = Field(None, description="생성일시")
    updated_at: Optional[datetime] = Field(None, description="수정일시")
    
    model_config = ConfigDict(from_attributes=True)


class RecentSearchListResponse(BaseModel):
    """최근 검색어 목록 응답 스키마"""
    recent_searches: List[RecentSearchResponse] = Field(..., description="최근 검색어 목록")
    total: int = Field(..., description="총 개수")
