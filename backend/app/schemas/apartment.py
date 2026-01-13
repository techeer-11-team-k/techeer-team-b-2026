from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal

# ============ 서비스용 스키마 (DB 모델 기반) ============

class ApartDetailBase(BaseModel):
    """
    아파트 상세 정보 기본 스키마
    
    DB 모델(app.models.apart_detail.ApartDetail)을 기반으로 한 스키마입니다.
    """
    apt_detail_id: Optional[int] = Field(None, description="아파트 상세정보 ID (PK, 자동 생성)")
    apt_id: int = Field(..., description="아파트 ID (FK)")
    road_address: str = Field(..., max_length=200, description="도로명 주소")
    jibun_address: str = Field(..., max_length=200, description="지번 주소")
    zip_code: Optional[str] = Field(None, max_length=5, description="우편번호")
    code_sale_nm: Optional[str] = Field(None, max_length=20, description="분양형태")
    code_heat_nm: Optional[str] = Field(None, max_length=20, description="난방방식")
    total_household_cnt: int = Field(..., description="총 세대수")
    total_building_cnt: Optional[int] = Field(None, description="총 동수")
    highest_floor: Optional[int] = Field(None, description="최고 층수")
    use_approval_date: Optional[date] = Field(None, description="사용승인일")
    total_parking_cnt: Optional[int] = Field(None, description="총 주차대수")
    builder_name: Optional[str] = Field(None, max_length=100, description="시공사명")
    developer_name: Optional[str] = Field(None, max_length=100, description="시행사명")
    manage_type: Optional[str] = Field(None, max_length=20, description="관리방식")
    hallway_type: Optional[str] = Field(None, max_length=20, description="복도유형")
    subway_time: Optional[str] = Field(None, max_length=100, description="지하철 도보 시간")
    subway_line: Optional[str] = Field(None, max_length=100, description="인근지하철 노선")
    subway_station: Optional[str] = Field(None, max_length=100, description="인근지하철 역")
    educationFacility: Optional[str] = Field(None, max_length=100, description="교육시설정보")
    geometry: Optional[str] = Field(None, description="지오메트리 정보 (PostGIS Point)")
    created_at: Optional[datetime] = Field(None, description="생성일")
    updated_at: Optional[datetime] = Field(None, description="수정일")
    is_deleted: bool = Field(False, description="삭제 여부")
    
    model_config = ConfigDict(
        from_attributes=True,  # SQLAlchemy 모델에서 변환 가능
        json_schema_extra={
            "example": {
                "apt_detail_id": 1,
                "apt_id": 1,
                "road_address": "부산광역시 사하구 낙동대로 180",
                "jibun_address": "부산광역시 사하구 괴정동 258",
                "zip_code": "49338",
                "code_sale_nm": "분양",
                "code_heat_nm": "개별난방",
                "total_household_cnt": 182,
                "total_building_cnt": 3,
                "highest_floor": 15,
                "use_approval_date": "2015-08-06",
                "total_parking_cnt": 162,
                "builder_name": "(주)경성리츠",
                "developer_name": "(주)경성리츠",
                "manage_type": "자치관리",
                "hallway_type": "혼합식",
                "subway_time": "5~10분이내",
                "subway_line": "1호선",
                "subway_station": "괴정역",
                "educationFacility": "초등학교(괴정초등학교) 대학교(동주대학교)",
                "geometry": None,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "is_deleted": False
            }
        }
    )


