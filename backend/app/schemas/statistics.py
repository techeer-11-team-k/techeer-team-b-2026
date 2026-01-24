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
    base_ym: str = Field(..., description="기준 년월 (YYYYMM)")
    region_type: str = Field(..., description="지역 유형 (전국, 수도권, 지방5대광역시)")


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


# ============================================================
# 거래량 API 스키마 (하이브리드 방식 - 통합)
# ============================================================

class TransactionVolumeDataPoint(BaseModel):
    """월별 거래량 데이터 포인트"""
    year: int = Field(..., description="연도")
    month: int = Field(..., description="월 (1~12)")
    volume: int = Field(..., description="거래량")
    city_name: Optional[str] = Field(None, description="시도명 (지방5대광역시일 때만 포함)")


class TransactionVolumeResponse(BaseModel):
    """거래량 응답 스키마 (통합)"""
    success: bool = Field(..., description="성공 여부")
    data: List[TransactionVolumeDataPoint] = Field(..., description="월별 거래량 데이터 리스트")
    region_type: str = Field(..., description="지역 유형")
    period: str = Field(..., description="기간 설명 (예: '2018-01 ~ 2024-12')")
    max_years: int = Field(..., description="조회한 최대 연도 수")


# ============================================================
# 시장 국면 지표 API 스키마
# ============================================================

class MarketPhaseDataPoint(BaseModel):
    """시장 국면 지표 데이터 포인트"""
    region: Optional[str] = Field(None, description="지역명 (지방5대광역시일 때)")
    volume_change_rate: Optional[float] = Field(None, description="거래량 변동률 (%)")
    price_change_rate: Optional[float] = Field(None, description="가격 변동률 (%)")
    phase: Optional[int] = Field(None, description="국면 번호 (1~6, None이면 데이터 부족)")
    phase_label: str = Field(..., description="국면 라벨")
    description: str = Field(..., description="국면 설명")
    current_month_volume: int = Field(..., description="현재 월 거래량")
    min_required_volume: Optional[int] = Field(None, description="최소 요구 거래량 (데이터 부족 시에만 포함)")


class MarketPhaseCalculationMethod(BaseModel):
    """계산 방법 정보"""
    volume_method: str = Field(..., description="거래량 계산 방법 (average, month_over_month)")
    average_period_months: Optional[int] = Field(None, description="평균 계산 기간 (개월)")
    price_method: str = Field(..., description="가격 계산 방법 (moving_average_3months)")


class MarketPhaseThresholds(BaseModel):
    """임계값 정보"""
    volume_threshold: float = Field(..., description="거래량 변동 임계값 (%)")
    price_threshold: float = Field(..., description="가격 변동 임계값 (%)")


class MarketPhaseResponse(BaseModel):
    """시장 국면 지표 응답 스키마 (전국/수도권)"""
    success: bool = Field(..., description="성공 여부")
    data: MarketPhaseDataPoint = Field(..., description="시장 국면 지표 데이터")
    calculation_method: MarketPhaseCalculationMethod = Field(..., description="계산 방법 정보")
    thresholds: MarketPhaseThresholds = Field(..., description="사용된 임계값 정보")


class MarketPhaseListResponse(BaseModel):
    """시장 국면 지표 응답 스키마 (지방5대광역시)"""
    success: bool = Field(..., description="성공 여부")
    data: List[MarketPhaseDataPoint] = Field(..., description="지역별 시장 국면 지표 데이터 리스트")
    region_type: str = Field(..., description="지역 유형")
    calculation_method: MarketPhaseCalculationMethod = Field(..., description="계산 방법 정보")
    thresholds: MarketPhaseThresholds = Field(..., description="사용된 임계값 정보")


