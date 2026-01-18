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
