"""
아파트 상세 정보 스키마

Pydantic 모델을 사용하여 API 요청/응답 데이터 검증
"""
from typing import Optional
from datetime import date, datetime
from pydantic import BaseModel, Field


class ApartDetailBase(BaseModel):
    """아파트 상세 정보 기본 스키마"""
    apt_id: int = Field(..., description="아파트 ID")
    road_address: str = Field(..., max_length=200, description="도로명주소")
    jibun_address: str = Field(..., max_length=200, description="지번주소")
    zip_code: Optional[str] = Field(None, max_length=5, description="우편번호")
    code_sale_nm: Optional[str] = Field(None, max_length=20, description="분양/임대 구분")
    code_heat_nm: Optional[str] = Field(None, max_length=20, description="난방 방식")
    total_household_cnt: int = Field(..., description="총 세대수")
    total_building_cnt: Optional[int] = Field(None, description="총 동수")
    highest_floor: Optional[int] = Field(None, description="최고층")
    use_approval_date: Optional[date] = Field(None, description="사용승인일")
    total_parking_cnt: Optional[int] = Field(None, description="총 주차대수")
    builder_name: Optional[str] = Field(None, max_length=100, description="건설사명")
    developer_name: Optional[str] = Field(None, max_length=100, description="시공사명")
    manage_type: Optional[str] = Field(None, max_length=20, description="관리 유형")
    hallway_type: Optional[str] = Field(None, max_length=20, description="복도 유형")
    subway_time: Optional[str] = Field(None, max_length=100, description="지하철 소요시간")
    subway_line: Optional[str] = Field(None, max_length=100, description="지하철 노선")
    subway_station: Optional[str] = Field(None, max_length=100, description="지하철 역명")
    educationFacility: Optional[str] = Field(None, max_length=200, description="교육시설")
    geometry: Optional[str] = Field(None, description="위치 정보 (PostGIS Point)")


class ApartDetailCreate(ApartDetailBase):
    """아파트 상세 정보 생성 스키마"""
    pass


class ApartDetailUpdate(BaseModel):
    """아파트 상세 정보 수정 스키마"""
    road_address: Optional[str] = Field(None, max_length=200)
    jibun_address: Optional[str] = Field(None, max_length=200)
    zip_code: Optional[str] = Field(None, max_length=5)
    code_sale_nm: Optional[str] = Field(None, max_length=20)
    code_heat_nm: Optional[str] = Field(None, max_length=20)
    total_household_cnt: Optional[int] = None
    total_building_cnt: Optional[int] = None
    highest_floor: Optional[int] = None
    use_approval_date: Optional[date] = None
    total_parking_cnt: Optional[int] = None
    builder_name: Optional[str] = Field(None, max_length=100)
    developer_name: Optional[str] = Field(None, max_length=100)
    manage_type: Optional[str] = Field(None, max_length=20)
    hallway_type: Optional[str] = Field(None, max_length=20)
    subway_time: Optional[str] = Field(None, max_length=100)
    subway_line: Optional[str] = Field(None, max_length=100)
    subway_station: Optional[str] = Field(None, max_length=100)
    educationFacility: Optional[str] = Field(None, max_length=200)
    geometry: Optional[str] = None


class ApartDetailResponse(ApartDetailBase):
    """아파트 상세 정보 응답 스키마"""
    apt_detail_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_deleted: bool = False

    class Config:
        from_attributes = True


class ApartDetailCollectionResponse(BaseModel):
    """아파트 상세 정보 수집 결과 응답 스키마"""
    success: bool
    total_processed: int = Field(..., description="처리한 총 아파트 수")
    total_saved: int = Field(..., description="데이터베이스에 저장된 레코드 수")
    skipped: int = Field(..., description="중복으로 건너뛴 레코드 수")
    errors: list[str] = Field(default_factory=list, description="오류 메시지 목록")
    message: str = Field(..., description="결과 메시지")
