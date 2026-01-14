"""
부동산 지수 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class HouseScoreBase(BaseModel):
    """기본 부동산 지수 스키마"""
    region_id: int = Field(..., description="지역 ID (FK)")
    base_ym: str = Field(..., description="기준 년월 (YYYYMM)", max_length=6, min_length=6)
    index_value: float = Field(..., description="지수 값 (2017.11=100 기준)")
    index_change_rate: Optional[float] = Field(None, description="지수 변동률")
    index_type: str = Field(default="APT", description="지수 유형 (APT=아파트, HOUSE=단독주택, ALL=전체)", max_length=10)
    data_source: str = Field(default="KB부동산", description="데이터 출처", max_length=50)


class HouseScoreCreate(HouseScoreBase):
    """부동산 지수 생성 스키마"""
    pass


class HouseScoreUpdate(BaseModel):
    """부동산 지수 수정 스키마"""
    index_value: Optional[float] = Field(None, description="지수 값")
    index_change_rate: Optional[float] = Field(None, description="지수 변동률")
    index_type: Optional[str] = Field(None, description="지수 유형", max_length=10)
    data_source: Optional[str] = Field(None, description="데이터 출처", max_length=50)


class HouseScoreResponse(HouseScoreBase):
    """부동산 지수 응답 스키마"""
    index_id: int = Field(..., description="지수 ID (PK)")
    created_at: datetime = Field(..., description="생성일시")
    updated_at: datetime = Field(..., description="수정일시")
    is_deleted: bool = Field(..., description="삭제 여부")
    
    model_config = ConfigDict(from_attributes=True)


class HouseScoreCollectionResponse(BaseModel):
    """부동산 지수 데이터 수집 응답 스키마"""
    success: bool = Field(..., description="수집 성공 여부")
    total_fetched: int = Field(..., description="API에서 가져온 총 레코드 수")
    total_saved: int = Field(..., description="데이터베이스에 저장된 레코드 수")
    skipped: int = Field(..., description="중복으로 건너뛴 레코드 수")
    errors: list[str] = Field(default_factory=list, description="오류 메시지 목록")
    message: str = Field(..., description="결과 메시지")
