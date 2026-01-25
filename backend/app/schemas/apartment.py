"""
아파트 관련 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, date

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


class ApartmentBase(BaseModel):
    """기본 아파트 정보 스키마"""
    region_id: int = Field(..., description="지역 ID (FK)")
    apt_name: str = Field(..., description="아파트 단지명", max_length=100)
    kapt_code: str = Field(..., description="국토부 단지코드", max_length=20)
    is_available: Optional[str] = Field(None, description="거래 가능 여부", max_length=255)


class ApartmentCreate(ApartmentBase):
    """아파트 정보 생성 스키마"""
    pass


class ApartmentUpdate(BaseModel):
    """아파트 정보 수정 스키마"""
    region_id: Optional[int] = Field(None, description="지역 ID")
    apt_name: Optional[str] = Field(None, description="아파트 단지명", max_length=100)
    kapt_code: Optional[str] = Field(None, description="국토부 단지코드", max_length=20)
    is_available: Optional[str] = Field(None, description="거래 가능 여부", max_length=255)


class ApartmentResponse(ApartmentBase):
    """아파트 정보 응답 스키마"""
    apt_id: int = Field(..., description="아파트 ID (PK)")
    created_at: Optional[datetime] = Field(None, description="생성일시")
    updated_at: Optional[datetime] = Field(None, description="수정일시")
    is_deleted: bool = Field(False, description="삭제 여부")
    
    model_config = ConfigDict(from_attributes=True)


# ============ 비교 기능 스키마 ============

class SchoolItem(BaseModel):
    """학교 정보 항목 스키마"""
    name: str = Field(..., description="학교명")


class SchoolGroup(BaseModel):
    """학교 정보 그룹 스키마"""
    elementary: List[SchoolItem] = Field(default_factory=list, description="초등학교 목록")
    middle: List[SchoolItem] = Field(default_factory=list, description="중학교 목록")
    high: List[SchoolItem] = Field(default_factory=list, description="고등학교 목록")


class SubwayInfo(BaseModel):
    """지하철 정보 스키마"""
    line: Optional[str] = Field(None, description="지하철 노선")
    station: Optional[str] = Field(None, description="지하철 역명")
    walking_time: Optional[str] = Field(None, description="도보 시간")


class ApartmentCompareItem(BaseModel):
    """아파트 비교 항목 스키마"""
    id: int = Field(..., description="아파트 ID")
    name: str = Field(..., description="아파트명")
    region: str = Field(..., description="지역 (시/군/구)")
    address: Optional[str] = Field(None, description="주소")
    price: Optional[float] = Field(None, description="최근 매매가 (억)")
    jeonse: Optional[float] = Field(None, description="최근 전세가 (억)")
    jeonse_rate: Optional[float] = Field(None, description="전세가율 (%)")
    price_per_pyeong: Optional[float] = Field(None, description="평당가 (억)")
    households: Optional[int] = Field(None, description="세대수")
    parking_total: Optional[int] = Field(None, description="총 주차대수")
    parking_per_household: Optional[float] = Field(None, description="세대당 주차대수")
    build_year: Optional[int] = Field(None, description="준공 연도")
    subway: SubwayInfo = Field(..., description="지하철 정보")
    schools: SchoolGroup = Field(..., description="학교 정보")


class ApartmentCompareRequest(BaseModel):
    """아파트 비교 요청 스키마"""
    apartment_ids: List[int] = Field(..., description="아파트 ID 목록 (최대 5개)", min_length=1, max_length=5)


class PercentileResponse(BaseModel):
    """아파트 percentile 응답 스키마"""
    apt_id: int = Field(..., description="아파트 ID")
    apt_name: str = Field(..., description="아파트명")
    region_name: str = Field(..., description="동 이름")
    city_name: str = Field(..., description="시도명")
    # 전국 기준 percentile (기본)
    percentile: float = Field(..., description="전국 상위 percentile (0~100)", ge=0, le=100)
    rank: int = Field(..., description="전국 순위 (1부터 시작)")
    total_count: int = Field(..., description="전국 비교 대상 아파트 총 개수")
    # 동 내 percentile (상세 정보용)
    region_percentile: Optional[float] = Field(None, description="동 내 상위 percentile (0~100)", ge=0, le=100)
    region_rank: Optional[int] = Field(None, description="동 내 순위 (1부터 시작)")
    region_total_count: Optional[int] = Field(None, description="동 내 비교 대상 아파트 총 개수")
    price_per_pyeong: float = Field(..., description="해당 아파트의 평당가 (만원)")
    average_price_per_pyeong: Optional[float] = Field(None, description="전국 평균 평당가 (만원)")
    region_average_price_per_pyeong: Optional[float] = Field(None, description="동 내 평균 평당가 (만원)")
    period_months: int = Field(6, description="기준 기간 (개월)")
    display_text: str = Field(..., description="표시용 텍스트 (예: '상위 15% (100개 중 15위)')")


class ApartmentCompareResponse(BaseModel):
    """아파트 비교 응답 스키마"""
    apartments: List[ApartmentCompareItem] = Field(..., description="비교 아파트 목록")


class PyeongRecentPrice(BaseModel):
    """평형별 최근 거래가"""
    price: float = Field(..., description="가격 (억)")
    date: str = Field(..., description="거래일")
    price_per_pyeong: float = Field(..., description="평당가 (억)")


class PyeongOption(BaseModel):
    """평형별 가격 옵션"""
    pyeong_type: str = Field(..., description="평형 타입 (예: 32평형)")
    area_m2: float = Field(..., description="전용면적 (㎡)")
    recent_sale: Optional[PyeongRecentPrice] = Field(None, description="최근 매매가")
    recent_jeonse: Optional[PyeongRecentPrice] = Field(None, description="최근 전세가")


class PyeongPricesResponse(BaseModel):
    """평형별 가격 응답 스키마"""
    apartment_id: int = Field(..., description="아파트 ID")
    apartment_name: str = Field(..., description="아파트명")
    pyeong_options: List[PyeongOption] = Field(default_factory=list, description="평형별 옵션 목록")


class ApartmentCollectionResponse(BaseModel):
    """아파트 데이터 수집 응답 스키마"""
    success: bool = Field(..., description="수집 성공 여부")
    total_fetched: int = Field(..., description="API에서 가져온 총 레코드 수")
    total_saved: int = Field(..., description="데이터베이스에 저장된 레코드 수")
    skipped: int = Field(..., description="중복으로 건너뛴 레코드 수")
    errors: list[str] = Field(default_factory=list, description="오류 메시지 목록")
    message: str = Field(..., description="결과 메시지")


class SimilarApartmentItem(BaseModel):
    """유사 아파트 항목 스키마"""
    apt_id: int = Field(..., description="아파트 ID")
    apt_name: str = Field(..., description="아파트명")
    road_address: Optional[str] = Field(None, description="도로명 주소")
    jibun_address: Optional[str] = Field(None, description="지번 주소")
    total_household_cnt: Optional[int] = Field(None, description="총 세대수")
    total_building_cnt: Optional[int] = Field(None, description="총 동수")
    builder_name: Optional[str] = Field(None, description="시공사명")
    use_approval_date: Optional[date] = Field(None, description="사용승인일")
    
    model_config = ConfigDict(from_attributes=True)


class SimilarApartmentsResponse(BaseModel):
    """유사 아파트 목록 응답 스키마"""
    success: bool = Field(True, description="성공 여부")
    data: dict = Field(..., description="응답 데이터")
    
    model_config = ConfigDict(from_attributes=True)


class VolumeTrendItem(BaseModel):
    """월별 거래량 항목 스키마"""
    year_month: str = Field(..., description="연도-월 (YYYY-MM 형식)", example="2024-01")
    volume: int = Field(..., description="해당 월의 거래량", ge=0)
    
    model_config = ConfigDict(from_attributes=True)


class VolumeTrendResponse(BaseModel):
    """거래량 추이 응답 스키마"""
    success: bool = Field(True, description="성공 여부")
    apt_id: int = Field(..., description="아파트 ID")
    data: list[VolumeTrendItem] = Field(..., description="월별 거래량 목록")
    total_volume: int = Field(..., description="전체 거래량 합계", ge=0)

class NearbyPriceResponse(BaseModel):
    """주변 아파트 평균 가격 응답 스키마"""
    apt_id: int = Field(..., description="아파트 ID")
    apt_name: Optional[str] = Field(None, description="아파트명")
    region_name: Optional[str] = Field(None, description="지역명")
    period_months: int = Field(..., description="조회 기간 (개월)")
    target_exclusive_area: Optional[float] = Field(None, description="기준 아파트 전용면적 (㎡)")
    average_price_per_sqm: Optional[float] = Field(None, description="평당가 평균 (만원/㎡)")
    estimated_price: Optional[float] = Field(None, description="예상 가격 (만원, 평당가 × 기준 아파트 면적)")
    transaction_count: int = Field(..., description="거래 개수")
    average_price: float = Field(..., description="평균 가격 (만원, 거래 개수 5개 이하면 -1)")

    
    model_config = ConfigDict(from_attributes=True)



class PriceTrendItem(BaseModel):
    """월별 평당가 항목 스키마"""
    year_month: str = Field(..., description="연도-월 (YYYY-MM 형식)", example="2024-01")
    price_per_pyeong: float = Field(..., description="해당 월의 평당가 (만원/평)", ge=0)
    
    model_config = ConfigDict(from_attributes=True)


class PriceTrendResponse(BaseModel):
    """평당가 추이 응답 스키마"""
    success: bool = Field(True, description="성공 여부")
    apt_id: int = Field(..., description="아파트 ID")
    data: list[PriceTrendItem] = Field(..., description="월별 평당가 목록")
    
    model_config = ConfigDict(from_attributes=True)

class NearbyComparisonItem(BaseModel):
    """주변 아파트 비교 항목 스키마"""
    apt_id: int = Field(..., description="아파트 ID")
    apt_name: str = Field(..., description="아파트명")
    road_address: Optional[str] = Field(None, description="도로명 주소")
    jibun_address: Optional[str] = Field(None, description="지번 주소")
    distance_meters: Optional[float] = Field(None, description="기준 아파트로부터의 거리 (미터, 같은 법정동인 경우 None)")
    total_household_cnt: Optional[int] = Field(None, description="총 세대수")
    total_building_cnt: Optional[int] = Field(None, description="총 동수")
    builder_name: Optional[str] = Field(None, description="시공사명")
    use_approval_date: Optional[date] = Field(None, description="사용승인일")
    average_price: Optional[float] = Field(None, description="평균 가격 (만원, 최근 거래 기준)")
    average_price_per_sqm: Optional[float] = Field(None, description="평당가 (만원/㎡)")
    transaction_count: int = Field(0, description="최근 거래 개수")
    
    model_config = ConfigDict(from_attributes=True)


class NearbyComparisonResponse(BaseModel):
    """주변 아파트 비교 응답 스키마"""
    target_apartment: dict = Field(..., description="기준 아파트 정보")
    nearby_apartments: List[NearbyComparisonItem] = Field(..., description="주변 아파트 목록")
    count: int = Field(..., description="주변 아파트 개수")
    radius_meters: int = Field(500, description="검색 반경 (미터)")
    period_months: int = Field(6, description="가격 계산 기간 (개월)")
    
    model_config = ConfigDict(from_attributes=True)


# ============ 아파트 검색 응답 스키마 ============

class ApartmentSearchResult(BaseModel):
    """
    아파트 검색 결과 항목 스키마
    
    ERD 설계에 따라 APARTMENTS 테이블에는 기본 정보만 포함됩니다.
    상세 정보(주소, 좌표 등)는 APART_DETAILS 테이블에 있으며, JOIN하여 가져옵니다.
    """
    apt_id: int = Field(..., description="아파트 ID (PK)")
    apt_name: str = Field(..., description="아파트 단지명")
    kapt_code: Optional[str] = Field(None, description="국토부 단지코드")
    region_id: Optional[int] = Field(None, description="지역 ID (FK)")
    address: Optional[str] = Field(None, description="주소 (도로명 우선, 없으면 지번) - APART_DETAILS 테이블에서 가져옴")
    location: Optional[dict] = Field(None, description="위치 정보 (lat, lng) - APART_DETAILS 테이블에서 가져옴")
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "apt_id": 1,
                "apt_name": "래미안 원베일리",
                "kapt_code": "A14074102",
                "region_id": 1168010100,
                "address": "서울특별시 강남구 테헤란로 123",
                "location": {
                    "lat": 37.5665,
                    "lng": 126.9780
                }
            }
        }
    )


class ApartmentSearchData(BaseModel):
    """아파트 검색 결과 데이터 스키마"""
    results: List[ApartmentSearchResult] = Field(..., description="검색 결과 목록")


class ApartmentSearchMeta(BaseModel):
    """아파트 검색 메타 정보 스키마"""
    query: str = Field(..., description="검색어")
    count: int = Field(..., description="검색 결과 개수")


class ApartmentSearchResponse(BaseModel):
    """
    아파트 검색 응답 스키마
    
    공통 응답 형식({success, data, meta})을 준수합니다.
    """
    success: bool = Field(True, description="성공 여부")
    data: ApartmentSearchData = Field(..., description="검색 결과 데이터")
    meta: Optional[ApartmentSearchMeta] = Field(None, description="메타 정보 (검색어, 개수 등)")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "data": {
                    "results": [
                        {
                            "apt_id": 1,
                            "apt_name": "래미안 원베일리",
                            "kapt_code": "A14074102",
                            "region_id": 1168010100,
                            "address": None,
                            "location": None
                        }
                    ],
                    "meta": {
                        "query": "래미안",
                        "count": 1
                    }
                }
            }
        }
    )
