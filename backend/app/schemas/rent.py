"""
전월세 거래 관련 스키마

국토교통부 아파트 전월세 실거래가 API 연동을 위한 요청/응답 스키마
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import date, datetime


# ============ API 요청 스키마 ============

class RentTransactionRequest(BaseModel):
    """
    전월세 실거래가 데이터 수집 요청 스키마 (전체 자동 수집용)
    
    DB에 저장된 모든 지역코드에 대해 2023년 1월부터 현재까지의
    전월세 실거래가 데이터를 자동으로 수집합니다.
    
    API 인증키(serviceKey)는 서버의 MOLIT_API_KEY 환경변수를 사용합니다.
    
    ⚠️ 공공데이터포털 API 일일 호출 제한(10,000건)을 고려하여
    max_api_calls 파라미터로 호출 횟수를 제한할 수 있습니다.
    """
    start_year: int = Field(
        default=2023,
        description="수집 시작 연도 (기본값: 2023)",
        ge=2006,  # 실거래가 공개 시작 연도
        examples=[2023]
    )
    start_month: int = Field(
        default=1,
        description="수집 시작 월 (기본값: 1)",
        ge=1,
        le=12,
        examples=[1]
    )
    start_region_index: int = Field(
        default=0,
        description="시작할 지역코드 인덱스 (0부터 시작, 이전에 중단된 지점부터 재개할 때 사용)",
        ge=0,
        examples=[0]
    )
    max_api_calls: int = Field(
        default=9500,
        description="최대 API 호출 횟수 (기본값: 9500, 일일 제한 10000건 고려하여 여유 확보)",
        ge=1,
        le=10000,
        examples=[9500]
    )


# ============ 외부 API 응답 파싱 스키마 ============

class RentApiItem(BaseModel):
    """
    국토교통부 API 응답 아이템 스키마
    
    XML 응답을 JSON으로 변환한 후 파싱하기 위한 스키마입니다.
    API 응답 필드명을 그대로 사용합니다.
    """
    aptNm: Optional[str] = Field(None, description="아파트명")
    aptSeq: Optional[str] = Field(None, description="아파트 일련번호 (예: 11110-127)")
    buildYear: Optional[str] = Field(None, description="건축년도")
    contractTerm: Optional[str] = Field(None, description="계약기간")
    contractType: Optional[str] = Field(None, description="계약유형 (신규/갱신)")
    dealDay: Optional[str] = Field(None, description="거래일")
    dealMonth: Optional[str] = Field(None, description="거래월")
    dealYear: Optional[str] = Field(None, description="거래년")
    deposit: Optional[str] = Field(None, description="보증금 (만원, 쉼표 포함 가능)")
    excluUseAr: Optional[str] = Field(None, description="전용면적 (㎡)")
    floor: Optional[str] = Field(None, description="층")
    jibun: Optional[str] = Field(None, description="지번")
    monthlyRent: Optional[str] = Field(None, description="월세 (만원)")
    preDeposit: Optional[str] = Field(None, description="종전 보증금")
    preMonthlyRent: Optional[str] = Field(None, description="종전 월세")
    roadnm: Optional[str] = Field(None, description="도로명 주소")
    roadnmbcd: Optional[str] = Field(None, description="도로명 건물 본번 코드")
    roadnmbonbun: Optional[str] = Field(None, description="도로명 건물 본번")
    roadnmbubun: Optional[str] = Field(None, description="도로명 건물 부번")
    roadnmcd: Optional[str] = Field(None, description="도로명 코드")
    roadnmseq: Optional[str] = Field(None, description="도로명 일련번호")
    roadnmsggcd: Optional[str] = Field(None, description="도로명 시군구 코드")
    sggCd: Optional[str] = Field(None, description="시군구 코드")
    umdNm: Optional[str] = Field(None, description="읍면동명")
    useRRRight: Optional[str] = Field(None, description="갱신요구권 사용 여부")

    model_config = ConfigDict(
        extra="ignore",  # API 응답에서 예상치 못한 필드는 무시
    )


# ============ DB 저장용 스키마 ============

class RentCreate(BaseModel):
    """
    전월세 거래 정보 생성 스키마
    
    DB에 저장하기 위한 스키마입니다.
    API 응답 데이터를 파싱하여 이 스키마로 변환 후 DB에 저장합니다.
    """
    apt_id: int = Field(..., description="아파트 ID (FK)")
    build_year: Optional[str] = Field(None, description="건축년도", max_length=255)
    contract_type: Optional[bool] = Field(None, description="계약유형 (True=갱신, False=신규)")
    deposit_price: Optional[int] = Field(None, description="보증금 (만원)")
    monthly_rent: Optional[int] = Field(None, description="월세 (만원)")
    exclusive_area: float = Field(..., description="전용면적 (㎡)")
    floor: int = Field(..., description="층")
    apt_seq: Optional[str] = Field(None, description="아파트 일련번호", max_length=10)
    deal_date: date = Field(..., description="거래일")
    contract_date: Optional[date] = Field(None, description="계약일")
    remarks: Optional[str] = Field(None, description="비고 (아파트 이름 등 참고용)", max_length=255)


class RentUpdate(BaseModel):
    """전월세 거래 정보 수정 스키마"""
    deposit_price: Optional[int] = Field(None, description="보증금 (만원)")
    monthly_rent: Optional[int] = Field(None, description="월세 (만원)")
    contract_type: Optional[bool] = Field(None, description="계약유형")


class RentResponse(BaseModel):
    """
    전월세 거래 정보 응답 스키마
    
    DB에서 조회한 데이터를 반환하기 위한 스키마입니다.
    """
    trans_id: int = Field(..., description="거래 ID (PK)")
    apt_id: int = Field(..., description="아파트 ID (FK)")
    build_year: Optional[str] = Field(None, description="건축년도")
    contract_type: Optional[bool] = Field(None, description="계약유형 (True=갱신, False=신규)")
    deposit_price: Optional[int] = Field(None, description="보증금 (만원)")
    monthly_rent: Optional[int] = Field(None, description="월세 (만원)")
    exclusive_area: float = Field(..., description="전용면적 (㎡)")
    floor: int = Field(..., description="층")
    apt_seq: Optional[str] = Field(None, description="아파트 일련번호")
    deal_date: date = Field(..., description="거래일")
    contract_date: Optional[date] = Field(None, description="계약일")
    created_at: Optional[datetime] = Field(None, description="생성일")
    updated_at: Optional[datetime] = Field(None, description="수정일")
    is_deleted: Optional[bool] = Field(None, description="삭제 여부")

    model_config = ConfigDict(from_attributes=True)


# ============ 수집 결과 스키마 ============

class RentCollectionResponse(BaseModel):
    """
    전월세 데이터 수집 응답 스키마
    
    API 호출 결과를 반환하기 위한 스키마입니다.
    """
    success: bool = Field(..., description="수집 성공 여부")
    total_fetched: int = Field(0, description="API에서 가져온 총 레코드 수")
    total_saved: int = Field(0, description="데이터베이스에 저장된 레코드 수")
    skipped: int = Field(0, description="중복으로 건너뛴 레코드 수")
    errors: List[str] = Field(default_factory=list, description="오류 메시지 목록")
    message: str = Field(..., description="결과 메시지")
    
    # 추가 메타 정보 (이어서 수집할 때 사용)
    lawd_cd: Optional[str] = Field(None, description="마지막 처리한 지역코드")
    deal_ymd: Optional[str] = Field(None, description="마지막 처리한 계약년월")
    api_calls_used: int = Field(0, description="사용한 API 호출 횟수")
    next_region_index: Optional[int] = Field(None, description="다음에 시작할 지역코드 인덱스 (이어서 수집할 때 사용)")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "total_fetched": 150,
                "total_saved": 145,
                "skipped": 5,
                "errors": [],
                "message": "수집 완료: 145개 저장, 5개 건너뜀",
                "lawd_cd": "11110",
                "deal_ymd": "201512"
            }
        }
    )
