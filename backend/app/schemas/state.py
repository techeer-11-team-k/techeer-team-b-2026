"""
지역 정보 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class StateBase(BaseModel):
    """기본 지역 정보 스키마"""
    region_name: str = Field(..., description="시군구명 (예: 강남구, 해운대구)", max_length=20)
    region_code: str = Field(..., description="시도코드 2자리 + 시군구 3자리 + 동코드 5자리", max_length=10)
    city_name: str = Field(..., description="시도명 (예: 서울특별시, 부산광역시)", max_length=40)


class StateCreate(StateBase):
    """지역 정보 생성 스키마"""
    pass


class StateUpdate(BaseModel):
    """지역 정보 수정 스키마"""
    region_name: Optional[str] = Field(None, description="시군구명", max_length=20)
    region_code: Optional[str] = Field(None, description="지역코드", max_length=10)
    city_name: Optional[str] = Field(None, description="시도명", max_length=40)


class StateResponse(StateBase):
    """지역 정보 응답 스키마"""
    region_id: int = Field(..., description="지역 ID (PK)")
    created_at: datetime = Field(..., description="생성일시")
    updated_at: datetime = Field(..., description="수정일시")
    is_deleted: bool = Field(..., description="삭제 여부")
    
    model_config = ConfigDict(from_attributes=True)


class StateCollectionResponse(BaseModel):
    """지역 데이터 수집 응답 스키마"""
    success: bool = Field(..., description="수집 성공 여부")
    total_fetched: int = Field(..., description="API에서 가져온 총 레코드 수")
    total_saved: int = Field(..., description="데이터베이스에 저장된 레코드 수")
    skipped: int = Field(..., description="중복으로 건너뛴 레코드 수")
    errors: list[str] = Field(default_factory=list, description="오류 메시지 목록")
    message: str = Field(..., description="결과 메시지")
