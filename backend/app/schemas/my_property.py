"""
내 집 관련 스키마

요청/응답 데이터 검증 및 직렬화를 위한 Pydantic 스키마
"""
from datetime import datetime, date
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, ConfigDict


# ============ 내 집 생성 스키마 ============

class MyPropertyCreate(BaseModel):
    """내 집 등록 요청 스키마"""
    apt_id: int = Field(..., description="아파트 ID (FK)", gt=0)
    nickname: str = Field(default="우리집", description="별칭 (예: 우리집, 투자용)", max_length=50)
    exclusive_area: float = Field(..., description="전용면적 (㎡)", gt=0)
    current_market_price: Optional[int] = Field(None, description="현재 시세 (만원)", ge=0)
    purchase_price: Optional[int] = Field(None, description="구매가 (만원)", ge=0)
    loan_amount: Optional[int] = Field(None, description="대출 금액 (만원)", ge=0)
    purchase_date: Optional[date] = Field(None, description="매입일")
    memo: Optional[str] = Field(None, description="메모")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "apt_id": 12345,
                "nickname": "우리집",
                "exclusive_area": 84.5,
                "current_market_price": 85000,
                "purchase_price": 80000,
                "loan_amount": 40000,
                "purchase_date": "2024-03-15",
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
    purchase_price: Optional[int] = Field(None, description="구매가 (만원)", ge=0)
    loan_amount: Optional[int] = Field(None, description="대출 금액 (만원)", ge=0)
    purchase_date: Optional[date] = Field(None, description="매입일")
    memo: Optional[str] = Field(None, description="메모")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "nickname": "투자용",
                "exclusive_area": 84.5,
                "current_market_price": 90000,
                "purchase_price": 80000,
                "loan_amount": 35000,
                "purchase_date": "2024-03-15",
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
    purchase_price: Optional[int] = Field(None, description="구매가 (만원)")
    loan_amount: Optional[int] = Field(None, description="대출 금액 (만원)")
    purchase_date: Optional[date] = Field(None, description="매입일")
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
    
    # 추가 상세 정보
    total_household_cnt: Optional[int] = Field(None, description="총 세대수")
    use_approval_date: Optional[date] = Field(None, description="사용승인일")
    index_change_rate: Optional[float] = Field(None, description="부동산 지수 변동률")
    road_address: Optional[str] = Field(None, description="도로명 주소")
    jibun_address: Optional[str] = Field(None, description="지번 주소")
    
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


# ============ 최근 거래 내역 스키마 ============

class RecentTransactionItem(BaseModel):
    """개별 거래 내역 스키마"""
    trans_id: int = Field(..., description="거래 ID")
    trans_type: Literal["매매", "전세", "월세"] = Field(..., description="거래 유형")
    contract_date: Optional[date] = Field(None, description="계약일/거래일")
    exclusive_area: float = Field(..., description="전용면적 (㎡)")
    floor: int = Field(..., description="층")
    
    # 매매 관련
    trans_price: Optional[int] = Field(None, description="매매가격 (만원)")
    
    # 전월세 관련
    deposit_price: Optional[int] = Field(None, description="보증금 (만원)")
    monthly_rent: Optional[int] = Field(None, description="월세 (만원)")
    
    # 기타
    building_num: Optional[str] = Field(None, description="동")
    
    model_config = ConfigDict(from_attributes=True)


class RecentTransactionsResponse(BaseModel):
    """최근 거래 내역 응답 스키마"""
    property_id: int = Field(..., description="내 집 ID")
    apt_id: int = Field(..., description="아파트 ID")
    apt_name: Optional[str] = Field(None, description="아파트명")
    
    # 조회 기간 정보
    months: int = Field(..., description="조회 기간 (개월)")
    
    # 거래 통계
    total_count: int = Field(..., description="전체 거래 건수")
    sale_count: int = Field(..., description="매매 거래 건수")
    rent_count: int = Field(..., description="전월세 거래 건수")
    
    # 거래 내역
    transactions: List[RecentTransactionItem] = Field(..., description="거래 내역 (최신순)")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "property_id": 1,
                "apt_id": 12345,
                "apt_name": "래미안 강남파크",
                "months": 6,
                "total_count": 15,
                "sale_count": 5,
                "rent_count": 10,
                "transactions": [
                    {
                        "trans_id": 1001,
                        "trans_type": "매매",
                        "contract_date": "2026-01-10",
                        "exclusive_area": 84.5,
                        "floor": 12,
                        "trans_price": 95000,
                        "deposit_price": None,
                        "monthly_rent": None,
                        "building_num": "101"
                    },
                    {
                        "trans_id": 2001,
                        "trans_type": "전세",
                        "contract_date": "2026-01-05",
                        "exclusive_area": 59.9,
                        "floor": 8,
                        "trans_price": None,
                        "deposit_price": 65000,
                        "monthly_rent": 0,
                        "building_num": None
                    },
                    {
                        "trans_id": 2002,
                        "trans_type": "월세",
                        "contract_date": "2025-12-20",
                        "exclusive_area": 59.9,
                        "floor": 3,
                        "trans_price": None,
                        "deposit_price": 10000,
                        "monthly_rent": 120,
                        "building_num": None
                    }
                ]
            }
        }
    )
