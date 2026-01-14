"""
내 집 관련 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


# ============ 내 집 생성 스키마 ============

class MyPropertyCreate(BaseModel):
    """내 집 등록 요청 스키마"""
    apt_id: int = Field(..., description="아파트 ID (FK)", gt=0)
    nickname: str = Field(default="우리집", description="별칭 (예: 우리집, 투자용)", max_length=50)
    exclusive_area: float = Field(..., description="전용면적 (㎡)", gt=0)
    current_market_price: Optional[int] = Field(None, description="현재 시세 (만원)", ge=0)
    memo: Optional[str] = Field(None, description="메모")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "apt_id": 12345,
                "nickname": "우리집",
                "exclusive_area": 84.5,
                "current_market_price": 85000,
                "memo": "2024년 구매"
            }
        }
    )


# ============ 내 집 수정 스키마 ============

class MyPropertyUpdate(BaseModel):
    """내 집 정보 수정 요청 스키마"""
    nickname: Optional[str] = Field(None, description="별칭", max_length=50)
    exclusive_area: Optional[float] = Field(None, description="전용면적 (㎡)", gt=0)
    current_market_price: Optional[int] = Field(None, description="현재 시세 (만원)", ge=0)
    memo: Optional[str] = Field(None, description="메모")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "nickname": "투자용",
                "exclusive_area": 84.5,
                "current_market_price": 90000,
                "memo": "시세 상승"
            }
        }
    )


# ============ 내 집 응답 스키마 ============

class MyPropertyResponse(BaseModel):
    """내 집 응답 스키마"""
    property_id: int = Field(..., description="내 집 ID (PK)")
    account_id: int = Field(..., description="계정 ID")
    apt_id: int = Field(..., description="아파트 ID")
    nickname: str = Field(..., description="별칭")
    exclusive_area: float = Field(..., description="전용면적 (㎡)")
    current_market_price: Optional[int] = Field(None, description="현재 시세 (만원)")
    risk_checked_at: Optional[datetime] = Field(None, description="리스크 체크 일시")
    memo: Optional[str] = Field(None, description="메모")
    created_at: Optional[datetime] = Field(None, description="생성일시")
    updated_at: Optional[datetime] = Field(None, description="수정일시")
    is_deleted: bool = Field(False, description="삭제 여부")
    
    # 아파트 정보 (관계 데이터)
    apt_name: Optional[str] = Field(None, description="아파트명")
    kapt_code: Optional[str] = Field(None, description="국토부 단지코드")
    region_name: Optional[str] = Field(None, description="시군구명")
    city_name: Optional[str] = Field(None, description="시도명")
    
    # 아파트 상세 정보 (ApartDetail 관계 데이터)
    builder_name: Optional[str] = Field(None, description="건설사명")
    code_heat_nm: Optional[str] = Field(None, description="난방 방식")
    educationFacility: Optional[str] = Field(None, description="교육 시설")
    subway_line: Optional[str] = Field(None, description="지하철 노선")
    subway_station: Optional[str] = Field(None, description="지하철 역명")
    subway_time: Optional[str] = Field(None, description="지하철 소요 시간")
    total_parking_cnt: Optional[int] = Field(None, description="총 주차 대수")
    
    model_config = ConfigDict(from_attributes=True)


class MyPropertyListResponse(BaseModel):
    """내 집 목록 응답 스키마"""
    properties: list[MyPropertyResponse] = Field(..., description="내 집 목록")
    total: int = Field(..., description="총 개수")
    limit: int = Field(100, description="최대 개수 제한")


class MyPropertyComplimentResponse(BaseModel):
    """내 집 칭찬글 응답 스키마"""
    property_id: int = Field(..., description="내 집 ID")
    compliment: str = Field(..., description="AI가 생성한 칭찬글")
    generated_at: Optional[datetime] = Field(None, description="생성 일시")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "property_id": 1,
                "compliment": "이 집은 정말 멋진 곳이네요! 강남구의 중심부에 위치한 래미안 강남파크는 최고의 입지를 자랑합니다. 84.5㎡의 넉넉한 전용면적은 가족이 함께 생활하기에 충분한 공간을 제공합니다. 현재 시세 85,000만원은 이 지역의 가치를 잘 반영하고 있으며, 앞으로도 지속적인 가치 상승이 기대되는 곳입니다. 정말 부러운 집이에요!",
                "generated_at": "2026-01-14T15:30:00Z"
            }
        }
    )
