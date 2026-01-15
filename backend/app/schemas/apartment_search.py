"""
아파트 상세 검색 스키마

상세 검색 요청/응답 스키마
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List


class DetailedSearchRequest(BaseModel):
    """
    아파트 상세 검색 요청 스키마
    
    위치, 평수, 가격, 지하철 거리, 교육시설 등 다양한 조건으로 검색합니다.
    """
    # 위치 관련
    region_id: Optional[int] = Field(None, description="지역 ID (states.region_id)")
    location: Optional[str] = Field(None, max_length=100, description="지역명 (예: '강남구', '서울시 강남구')")
    
    # 평수 관련 (전용면적, ㎡ 단위)
    min_area: Optional[float] = Field(None, ge=0, description="최소 전용면적 (㎡)")
    max_area: Optional[float] = Field(None, ge=0, description="최대 전용면적 (㎡)")
    
    # 가격 관련 (만원 단위)
    min_price: Optional[int] = Field(None, ge=0, description="최소 가격 (만원)")
    max_price: Optional[int] = Field(None, ge=0, description="최대 가격 (만원)")
    
    # 지하철 거리 관련
    subway_max_distance_minutes: Optional[int] = Field(None, ge=0, le=60, description="지하철역까지 최대 도보 시간 (분, 0~60)")
    
    # 교육시설 유무
    has_education_facility: Optional[bool] = Field(None, description="교육시설 유무 (True: 있음, False: 없음, None: 상관없음)")
    
    # 페이지네이션
    limit: int = Field(50, ge=1, le=100, description="반환할 최대 개수 (기본 50개, 최대 100개)")
    skip: int = Field(0, ge=0, description="건너뛸 레코드 수")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "location": "강남구",
                "min_area": 84.0,
                "max_area": 114.0,
                "min_price": 50000,
                "max_price": 100000,
                "subway_max_distance_minutes": 10,
                "has_education_facility": True,
                "limit": 50,
                "skip": 0
            }
        }
    )


class DetailedSearchResult(BaseModel):
    """
    상세 검색 결과 항목 스키마
    """
    apt_id: int = Field(..., description="아파트 ID")
    apt_name: str = Field(..., description="아파트명")
    kapt_code: Optional[str] = Field(None, description="국토부 단지코드")
    region_id: Optional[int] = Field(None, description="지역 ID")
    address: Optional[str] = Field(None, description="주소 (도로명 우선, 없으면 지번)")
    location: Optional[dict] = Field(None, description="위치 정보 (lat, lng)")
    exclusive_area: Optional[float] = Field(None, description="전용면적 (㎡)")
    average_price: Optional[float] = Field(None, description="평균 가격 (만원, 최근 거래 기준)")
    subway_station: Optional[str] = Field(None, description="지하철 역명")
    subway_line: Optional[str] = Field(None, description="지하철 노선")
    subway_time: Optional[str] = Field(None, description="지하철 도보 시간")
    education_facility: Optional[str] = Field(None, description="교육시설 정보")
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "apt_id": 1,
                "apt_name": "래미안 강남파크",
                "kapt_code": "A14074102",
                "region_id": 1168010100,
                "address": "서울특별시 강남구 테헤란로 123",
                "location": {"lat": 37.5665, "lng": 126.9780},
                "exclusive_area": 84.5,
                "average_price": 85000,
                "subway_station": "강남역",
                "subway_line": "2호선",
                "subway_time": "5~10분이내",
                "education_facility": "초등학교(강남초등학교)"
            }
        }
    )


class DetailedSearchResponse(BaseModel):
    """
    상세 검색 응답 스키마
    """
    success: bool = Field(True, description="성공 여부")
    data: dict = Field(..., description="검색 결과 데이터")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "data": {
                    "results": [
                        {
                            "apt_id": 1,
                            "apt_name": "래미안 강남파크",
                            "address": "서울특별시 강남구 테헤란로 123",
                            "location": {"lat": 37.5665, "lng": 126.9780},
                            "exclusive_area": 84.5,
                            "average_price": 85000,
                            "subway_station": "강남역",
                            "subway_line": "2호선",
                            "subway_time": "5~10분이내",
                            "education_facility": "초등학교(강남초등학교)"
                        }
                    ],
                    "count": 1,
                    "total": 1,
                    "limit": 50,
                    "skip": 0
                }
            }
        }
    )
