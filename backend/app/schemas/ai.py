"""
AI 관련 스키마

AI 자연어 검색 요청/응답 스키마
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any


class AISearchRequest(BaseModel):
    """
    AI 자연어 검색 요청 스키마
    
    사용자가 자연어로 원하는 집에 대한 설명을 입력하면
    AI가 이를 파싱하여 검색 조건으로 변환합니다.
    """
    query: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="원하는 집에 대한 자연어 설명 (예: '강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처')"
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "query": "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처"
            }
        }
    )


class AISearchCriteria(BaseModel):
    """
    AI가 파싱한 검색 조건 스키마
    
    자연어를 파싱하여 구조화된 검색 조건으로 변환한 결과입니다.
    """
    # 위치 관련
    location: Optional[str] = Field(None, description="지역명 (예: '강남구', '서울시 강남구')")
    region_id: Optional[int] = Field(None, description="지역 ID (states.region_id)")
    
    # 평수 관련 (전용면적, ㎡ 단위)
    min_area: Optional[float] = Field(None, ge=0, description="최소 전용면적 (㎡)")
    max_area: Optional[float] = Field(None, ge=0, description="최대 전용면적 (㎡)")
    
    # 가격 관련 (만원 단위)
    min_price: Optional[int] = Field(None, ge=0, description="최소 가격 (만원, 매매가격)")
    max_price: Optional[int] = Field(None, ge=0, description="최대 가격 (만원, 매매가격)")
    min_deposit: Optional[int] = Field(None, ge=0, description="최소 보증금 (만원, 전세/월세)")
    max_deposit: Optional[int] = Field(None, ge=0, description="최대 보증금 (만원, 전세/월세)")
    min_monthly_rent: Optional[int] = Field(None, ge=0, description="최소 월세 (만원)")
    max_monthly_rent: Optional[int] = Field(None, ge=0, description="최대 월세 (만원)")
    
    # 지하철 관련
    subway_max_distance_minutes: Optional[int] = Field(None, ge=0, description="지하철역까지 최대 도보 시간 (분)")
    subway_line: Optional[str] = Field(None, description="지하철 노선 (예: '2호선', '3호선')")
    subway_station: Optional[str] = Field(None, description="지하철 역명 (예: '강남역', '홍대입구역')")
    
    # 교육시설 유무
    has_education_facility: Optional[bool] = Field(None, description="교육시설 유무 (True: 있음, False: 없음, None: 상관없음)")
    
    # 건축년도 관련
    min_build_year: Optional[int] = Field(None, ge=1900, le=2100, description="최소 건축년도")
    max_build_year: Optional[int] = Field(None, ge=1900, le=2100, description="최대 건축년도")
    build_year_range: Optional[str] = Field(None, description="건축년도 범위 (예: '신축', '10년이하', '20년이하')")
    
    # 층수 관련
    min_floor: Optional[int] = Field(None, ge=1, description="최소 층수")
    max_floor: Optional[int] = Field(None, ge=1, description="최대 층수")
    floor_type: Optional[str] = Field(None, description="층수 유형 (예: '저층', '중층', '고층')")
    
    # 주차 관련
    min_parking_cnt: Optional[int] = Field(None, ge=0, description="최소 주차대수")
    has_parking: Optional[bool] = Field(None, description="주차 가능 여부 (True: 있음, False: 없음, None: 상관없음)")
    
    # 건설사/시공사 관련
    builder_name: Optional[str] = Field(None, description="건설사명 (예: '롯데건설', '삼성물산')")
    developer_name: Optional[str] = Field(None, description="시공사명")
    
    # 난방방식
    heating_type: Optional[str] = Field(None, description="난방방식 (예: '지역난방', '개별난방')")
    
    # 관리방식
    manage_type: Optional[str] = Field(None, description="관리방식 (예: '자치관리', '위탁관리')")
    
    # 복도유형
    hallway_type: Optional[str] = Field(None, description="복도유형 (예: '계단식', '복도식', '혼합식')")
    
    # 거래일 관련
    recent_transaction_months: Optional[int] = Field(None, ge=1, le=24, description="최근 거래 기간 (개월, 예: 3, 6, 12)")
    
    # 기타
    apartment_name: Optional[str] = Field(None, description="아파트 이름 (예: '래미안', '힐스테이트')")
    raw_query: str = Field(..., description="원본 자연어 쿼리")
    parsed_confidence: Optional[float] = Field(None, ge=0.0, le=1.0, description="파싱 신뢰도 (0.0~1.0)")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "location": "강남구",
                "region_id": None,
                "min_area": 84.0,
                "max_area": 114.0,
                "min_price": None,
                "max_price": 100000,
                "subway_max_distance_minutes": 10,
                "has_education_facility": True,
                "raw_query": "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처",
                "parsed_confidence": 0.9
            }
        }
    )


class AISearchResponse(BaseModel):
    """
    AI 자연어 검색 응답 스키마
    """
    success: bool = Field(True, description="성공 여부")
    data: Dict[str, Any] = Field(..., description="응답 데이터")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "data": {
                    "criteria": {
                        "location": "강남구",
                        "min_area": 84.0,
                        "max_area": 114.0,
                        "subway_max_distance_minutes": 10,
                        "has_education_facility": True,
                        "raw_query": "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처",
                        "parsed_confidence": 0.9
                    },
                    "apartments": [
                        {
                            "apt_id": 1,
                            "apt_name": "래미안 강남파크",
                            "address": "서울특별시 강남구 테헤란로 123",
                            "location": {"lat": 37.5665, "lng": 126.9780},
                            "exclusive_area": 84.5,
                            "average_price": 85000,
                            "subway_station": "강남역",
                            "subway_time": "5분",
                            "education_facility": "초등학교(강남초등학교)"
                        }
                    ],
                    "count": 1,
                    "total": 1
                }
            }
        }
    )
