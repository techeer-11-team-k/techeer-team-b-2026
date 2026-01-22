"""
통계 관련 스키마

RVOL(상대 거래량) 및 4분면 분류 통계 데이터 스키마를 정의합니다.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class RVOLDataPoint(BaseModel):
    """RVOL 데이터 포인트"""
    date: str = Field(..., description="날짜 (YYYY-MM-DD 형식)")
    current_volume: int = Field(..., description="현재 거래량")
    average_volume: float = Field(..., description="과거 평균 거래량")
    rvol: float = Field(..., description="RVOL 값 (현재 거래량 / 과거 평균 거래량)")


class RVOLResponse(BaseModel):
    """RVOL 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    data: List[RVOLDataPoint] = Field(..., description="RVOL 데이터 리스트")
    period: str = Field(..., description="기간 설명 (예: '최근 3개월 vs 직전 6개월')")


class QuadrantDataPoint(BaseModel):
    """4분면 분류 데이터 포인트"""
    date: str = Field(..., description="날짜 (YYYY-MM 형식)")
    sale_volume_change_rate: float = Field(..., description="매매 거래량 변화율 (%)")
    rent_volume_change_rate: float = Field(..., description="전월세 거래량 변화율 (%)")
    quadrant: int = Field(..., description="분면 번호 (1: 매수 전환, 2: 임대 선호, 3: 시장 위축, 4: 활성화)")
    quadrant_label: str = Field(..., description="분면 라벨")


class QuadrantResponse(BaseModel):
    """4분면 분류 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    data: List[QuadrantDataPoint] = Field(..., description="4분면 분류 데이터 리스트")
    summary: Dict[str, Any] = Field(..., description="요약 통계")


class HPIDataPoint(BaseModel):
    """주택가격지수(HPI) 데이터 포인트"""
    date: str = Field(..., description="날짜 (YYYY-MM 형식)")
    index_value: float = Field(..., description="지수 값 (2017.11=100 기준)")
    index_change_rate: Optional[float] = Field(None, description="지수 변동률")
    region_name: Optional[str] = Field(None, description="지역명")
    index_type: str = Field(..., description="지수 유형 (APT=아파트, HOUSE=단독주택, ALL=전체)")


class HPIResponse(BaseModel):
    """주택가격지수(HPI) 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    data: List[HPIDataPoint] = Field(..., description="HPI 데이터 리스트")
    region_id: Optional[int] = Field(None, description="지역 ID (지정된 경우)")
    index_type: str = Field(..., description="지수 유형")
    period: str = Field(..., description="기간 설명")


class HPIHeatmapDataPoint(BaseModel):
    """HPI 히트맵 데이터 포인트"""
    city_name: str = Field(..., description="시도명 (예: 서울특별시, 부산광역시)")
    index_value: float = Field(..., description="지수 값 (2017.11=100 기준)")
    index_change_rate: Optional[float] = Field(None, description="지수 변동률")
    base_ym: str = Field(..., description="기준 년월 (YYYYMM)")
    region_count: int = Field(..., description="포함된 지역 수")


class HPIHeatmapResponse(BaseModel):
    """HPI 히트맵 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    data: List[HPIHeatmapDataPoint] = Field(..., description="도/시별 HPI 데이터 리스트")
    index_type: str = Field(..., description="지수 유형")
    base_ym: str = Field(..., description="기준 년월 (YYYYMM)")


class StatisticsSummaryResponse(BaseModel):
    """통계 요약 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    rvol: RVOLResponse = Field(..., description="RVOL 데이터")
    quadrant: QuadrantResponse = Field(..., description="4분면 분류 데이터")


class PopulationMovementDataPoint(BaseModel):
    """인구 이동 데이터 포인트"""
    date: str = Field(..., description="날짜 (YYYY-MM 형식)")
    region_id: int = Field(..., description="지역 ID")
    region_name: str = Field(..., description="지역명")
    in_migration: int = Field(..., description="전입 인구 수 (명)")
    out_migration: int = Field(..., description="전출 인구 수 (명)")
    net_migration: int = Field(..., description="순이동 인구 수 (명)")


class PopulationMovementResponse(BaseModel):
    """인구 이동 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    data: List[PopulationMovementDataPoint] = Field(..., description="인구 이동 데이터 리스트")
    period: str = Field(..., description="기간 설명")


class PopulationMovementSankeyDataPoint(BaseModel):
    """인구 이동 Sankey 다이어그램 데이터 포인트"""
    from_region: str = Field(..., description="출발 지역명")
    to_region: str = Field(..., description="도착 지역명")
    value: int = Field(..., description="이동 인구 수 (명)")


class PopulationMovementSankeyResponse(BaseModel):
    """인구 이동 Sankey 다이어그램 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    data: List[PopulationMovementSankeyDataPoint] = Field(..., description="Sankey 다이어그램 데이터")
    period: str = Field(..., description="기간 설명")


class CorrelationAnalysisResponse(BaseModel):
    """상관관계 분석 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    correlation_coefficient: float = Field(..., description="상관계수 (-1 ~ 1)")
    r_squared: float = Field(..., description="결정계수 (R², 0 ~ 1)")
    regression_equation: str = Field(..., description="회귀식")
    p_value: float = Field(..., description="유의확률 (P-value)")
    data_points: List[Dict[str, Any]] = Field(..., description="데이터 포인트 (가격 상승률, 순이동)")
    interpretation: str = Field(..., description="해석")


# ============================================================
# 주택 수요 페이지용 새로운 스키마
# ============================================================

class TransactionVolumeDataPoint(BaseModel):
    """거래량 데이터 포인트 (월별/년도별)"""
    period: str = Field(..., description="기간 (예: '2020' 또는 '1월')")
    value: Optional[int] = Field(None, description="거래량 (년도별일 때 사용)")
    # 동적 키는 Dict[str, Any]로 처리 (예: {period: "1월", 2023: 140, 2024: 150})


class TransactionVolumeResponse(BaseModel):
    """거래량 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    data: List[Dict[str, Any]] = Field(..., description="거래량 데이터 리스트 (동적 키 포함 가능)")
    years: Optional[List[int]] = Field(None, description="년도 목록 (월별일 때만)")
    region_type: str = Field(..., description="지역 유형 (전국, 수도권, 지방5대광역시)")
    period_type: str = Field(..., description="기간 유형 (monthly, yearly)")
    year_range: Optional[int] = Field(None, description="년도 범위 (월별일 때만)")
    start_year: Optional[int] = Field(None, description="시작 연도 (년도별일 때만)")
    end_year: Optional[int] = Field(None, description="종료 연도 (년도별일 때만)")


class MarketPhaseDataPoint(BaseModel):
    """시장 국면 분석 데이터 포인트"""
    region_id: int = Field(..., description="지역 ID")
    region_name: str = Field(..., description="지역명 (예: '서울 강남')")
    city_name: str = Field(..., description="시도명 (예: '서울특별시')")
    phase: str = Field(..., description="시장 국면 (상승기, 회복기, 침체기, 후퇴기)")
    trend: str = Field(..., description="추세 (up, down)")
    change: str = Field(..., description="변화율 문자열 (예: '+1.5%')")
    price_change_rate: float = Field(..., description="가격 변화율 (%)")
    volume_change_rate: float = Field(..., description="거래량 변화율 (%)")
    recent_price: Optional[float] = Field(None, description="최근 평균 가격 (평당가, 만원)")
    previous_price: Optional[float] = Field(None, description="이전 평균 가격 (평당가, 만원)")
    recent_volume: Optional[int] = Field(None, description="최근 거래량")
    previous_volume: Optional[int] = Field(None, description="이전 거래량")


class MarketPhaseResponse(BaseModel):
    """시장 국면 분석 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    data: List[MarketPhaseDataPoint] = Field(..., description="시장 국면 분석 데이터 리스트")
    region_type: str = Field(..., description="지역 유형")
    period_months: int = Field(..., description="비교 기간 (개월)")


class HPIRegionTypeDataPoint(BaseModel):
    """지역 유형별 주택 가격 지수 데이터 포인트"""
    id: Optional[str] = Field(None, description="지역 ID (선택사항, 프론트엔드 좌표 매칭용)")
    name: str = Field(..., description="지역명 (정규화된 형식, 예: '서울')")
    value: float = Field(..., description="지수 값 (0~100 범위)")
    index_change_rate: Optional[float] = Field(None, description="지수 변동률")


class HPIRegionTypeResponse(BaseModel):
    """지역 유형별 주택 가격 지수 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    data: List[HPIRegionTypeDataPoint] = Field(..., description="지역별 HPI 데이터 리스트")
    region_type: str = Field(..., description="지역 유형")
    index_type: str = Field(..., description="지수 유형")
    base_ym: str = Field(..., description="기준 년월 (YYYYMM)")


class PopulationMovementRegionTypeDataPoint(BaseModel):
    """지역 유형별 인구 순이동 데이터 포인트"""
    name: str = Field(..., description="지역명 (정규화된 형식, 예: '서울')")
    value: int = Field(..., description="순이동 인구 수 (양수: 순유입, 음수: 순유출)")
    label: str = Field(..., description="라벨 ('순유입' 또는 '순유출')")
    in_migration: int = Field(..., description="전입 인구 수 (명)")
    out_migration: int = Field(..., description="전출 인구 수 (명)")
    net_migration: int = Field(..., description="순이동 인구 수 (명)")


class PopulationMovementRegionTypeResponse(BaseModel):
    """지역 유형별 인구 순이동 응답 스키마"""
    success: bool = Field(..., description="성공 여부")
    data: List[PopulationMovementRegionTypeDataPoint] = Field(..., description="지역별 인구 순이동 데이터 리스트")
    region_type: str = Field(..., description="지역 유형")
    start_ym: str = Field(..., description="시작 년월 (YYYYMM)")
    end_ym: str = Field(..., description="종료 년월 (YYYYMM)")
    period_months: int = Field(..., description="기간 (개월)")
