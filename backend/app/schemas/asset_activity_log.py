"""
자산 활동 내역 로그 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, ConfigDict


# ============ 자산 활동 로그 생성 스키마 ============

class AssetActivityLogCreate(BaseModel):
    """자산 활동 로그 생성 스키마"""
    account_id: int = Field(..., description="계정 ID", gt=0)
    apt_id: Optional[int] = Field(None, description="아파트 ID (FK)", gt=0)
    category: Literal["MY_ASSET", "INTEREST"] = Field(..., description="카테고리 (MY_ASSET: 내 아파트, INTEREST: 관심 목록)")
    event_type: Literal["ADD", "DELETE", "PRICE_UP", "PRICE_DOWN"] = Field(..., description="이벤트 타입")
    price_change: Optional[int] = Field(None, description="가격 변동액 (만원 단위)")
    previous_price: Optional[int] = Field(None, description="변동 전 가격 (만원 단위)", ge=0)
    current_price: Optional[int] = Field(None, description="변동 후 가격 (만원 단위)", ge=0)
    metadata: Optional[str] = Field(None, description="추가 정보 (JSON 문자열)")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "account_id": 1,
                "apt_id": 12345,
                "category": "MY_ASSET",
                "event_type": "ADD",
                "price_change": None,
                "previous_price": None,
                "current_price": 85000,
                "metadata": None
            }
        }
    )


# ============ 자산 활동 로그 응답 스키마 ============

class AssetActivityLogResponse(BaseModel):
    """자산 활동 로그 응답 스키마"""
    id: int = Field(..., description="로그 ID (PK)")
    account_id: int = Field(..., description="계정 ID")
    apt_id: Optional[int] = Field(None, description="아파트 ID")
    category: str = Field(..., description="카테고리 (MY_ASSET, INTEREST)")
    event_type: str = Field(..., description="이벤트 타입 (ADD, DELETE, PRICE_UP, PRICE_DOWN)")
    price_change: Optional[int] = Field(None, description="가격 변동액 (만원 단위)")
    previous_price: Optional[int] = Field(None, description="변동 전 가격 (만원 단위)")
    current_price: Optional[int] = Field(None, description="변동 후 가격 (만원 단위)")
    created_at: datetime = Field(..., description="생성 일시")
    # 모델 필드명은 meta_data이지만 API 응답에서는 metadata로 표시
    # from_attributes=True를 사용하므로 모델의 실제 필드명(meta_data)과 매칭
    meta_data: Optional[str] = Field(
        None, 
        description="추가 정보 (JSON 문자열)",
        serialization_alias="metadata",  # JSON 출력 시 metadata로 변환
        validation_alias="metadata"  # JSON 입력 시 metadata로 변환
    )
    
    # 아파트 정보 (관계 데이터)
    apt_name: Optional[str] = Field(None, description="아파트명")
    kapt_code: Optional[str] = Field(None, description="국토부 단지코드")
    
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )


# ============ 자산 활동 로그 필터 스키마 ============

class AssetActivityLogFilter(BaseModel):
    """자산 활동 로그 필터링 스키마"""
    category: Optional[Literal["MY_ASSET", "INTEREST"]] = Field(None, description="카테고리 필터")
    event_type: Optional[Literal["ADD", "DELETE", "PRICE_UP", "PRICE_DOWN"]] = Field(None, description="이벤트 타입 필터")
    start_date: Optional[datetime] = Field(None, description="시작 날짜")
    end_date: Optional[datetime] = Field(None, description="종료 날짜")
    limit: int = Field(100, description="최대 개수 제한", ge=1, le=1000)
    skip: int = Field(0, description="건너뛸 개수", ge=0)


# ============ 자산 활동 로그 목록 응답 스키마 ============

class AssetActivityLogListResponse(BaseModel):
    """자산 활동 로그 목록 응답 스키마"""
    logs: List[AssetActivityLogResponse] = Field(..., description="활동 로그 목록")
    total: int = Field(..., description="총 개수")
    limit: int = Field(100, description="최대 개수 제한")
    skip: int = Field(0, description="건너뛴 개수")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "logs": [
                    {
                        "id": 1,
                        "account_id": 1,
                        "apt_id": 12345,
                        "category": "MY_ASSET",
                        "event_type": "ADD",
                        "price_change": None,
                        "previous_price": None,
                        "current_price": 85000,
                        "created_at": "2026-01-25T10:00:00Z",
                        "metadata": None,
                        "apt_name": "래미안 강남파크",
                        "kapt_code": "A1234567890"
                    }
                ],
                "total": 1,
                "limit": 100,
                "skip": 0
            }
        }
    )
