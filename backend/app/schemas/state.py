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


# ============ 지역 검색 응답 스키마 ============

class LocationSearchResult(BaseModel):
    """
    지역 검색 결과 항목 스키마
    
    시군구 또는 동 단위 지역 검색 결과를 나타냅니다.
    """
    region_id: int = Field(..., description="지역 ID (PK)")
    region_name: str = Field(..., description="시군구명 또는 동명 (예: 강남구, 역삼동)")
    region_code: str = Field(..., description="지역코드 (10자리)")
    city_name: str = Field(..., description="시도명 (예: 서울특별시, 부산광역시)")
    full_name: str = Field(..., description="전체 지역명 (예: 서울특별시 강남구)")
    location_type: str = Field(..., description="지역 유형 (city: 시도, sigungu: 시군구, dong: 동/리/면)")
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "region_id": 1168010100,
                "region_name": "역삼동",
                "region_code": "1168010100",
                "city_name": "서울특별시",
                "full_name": "서울특별시 강남구 역삼동",
                "location_type": "dong"
            }
        }
    )


class LocationSearchData(BaseModel):
    """지역 검색 결과 데이터 스키마"""
    results: list[LocationSearchResult] = Field(..., description="검색 결과 목록")


class LocationSearchMeta(BaseModel):
    """지역 검색 메타 정보 스키마"""
    query: str = Field(..., description="검색어")
    count: int = Field(..., description="검색 결과 개수")
    location_type: Optional[str] = Field(None, description="필터링된 지역 유형 (sigungu/dong)")


class LocationSearchResponse(BaseModel):
    """
    지역 검색 응답 스키마
    
    공통 응답 형식({success, data, meta})을 준수합니다.
    """
    success: bool = Field(True, description="성공 여부")
    data: LocationSearchData = Field(..., description="검색 결과 데이터")
    meta: Optional[LocationSearchMeta] = Field(None, description="메타 정보 (검색어, 개수 등)")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "data": {
                    "results": [
                        {
                            "region_id": 1168010100,
                            "region_name": "역삼동",
                            "region_code": "1168010100",
                            "city_name": "서울특별시",
                            "full_name": "서울특별시 강남구 역삼동",
                            "location_type": "dong"
                        }
                    ],
                    "meta": {
                        "query": "역삼",
                        "count": 1,
                        "location_type": "dong"
                    }
                }
            }
        }
    )