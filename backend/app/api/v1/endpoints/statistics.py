"""
통계 관련 API 엔드포인트

담당 기능:
- RVOL(상대 거래량) 계산 및 조회
- 4분면 분류 (매매/전월세 거래량 변화율 기반)

성능 최적화:
- 기간 제한: 최대 2~3개월
- 월별 집계로 간소화
- 긴 캐시 TTL (6시간)
"""
import logging
import sys
import asyncio
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case, desc, text, extract
from sqlalchemy.orm import selectinload, aliased

from app.api.v1.deps import get_db
from app.models.sale import Sale
from app.models.rent import Rent
from app.models.apartment import Apartment
from app.models.state import State
from app.models.house_score import HouseScore
from app.models.population_movement import PopulationMovement
from app.schemas.statistics import (
    RVOLResponse,
    RVOLDataPoint,
    QuadrantResponse,
    QuadrantDataPoint,
    StatisticsSummaryResponse,
    HPIResponse,
    HPIDataPoint,
    HPIHeatmapResponse,
    HPIHeatmapDataPoint,
    PopulationMovementResponse,
    PopulationMovementDataPoint,
    PopulationMovementSankeyResponse,
    PopulationMovementSankeyDataPoint,
    SankeyNode,
    CorrelationAnalysisResponse,
    HPIRegionTypeResponse,
    HPIRegionTypeDataPoint,
    TransactionVolumeResponse,
    TransactionVolumeDataPoint,
    MarketPhaseResponse,
    MarketPhaseListResponse,
    MarketPhaseDataPoint,
    MarketPhaseCalculationMethod,
    MarketPhaseThresholds
)
from app.utils.cache import get_from_cache, set_to_cache, build_cache_key, delete_cache_pattern
from app.services import statistics_service
from app.services.statistics_cache_service import statistics_cache_service

# 로거 설정 (Docker 로그에 출력되도록)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = True  # 루트 로거로도 전파

router = APIRouter()

# 캐시 TTL: 6시간 (통계 데이터는 자주 변하지 않음)
STATISTICS_CACHE_TTL = 21600


# ============================================================
# 헬퍼 함수
# ============================================================

def normalize_city_name(city_name: str) -> str:
    """
    시도명을 프론트엔드 형식으로 정규화
    
    Args:
        city_name: 시도명 (예: "서울특별시", "부산광역시")
    
    Returns:
        정규화된 지역명 (예: "서울", "부산")
    """
    mapping = {
        "서울특별시": "서울",
        "부산광역시": "부산",
        "대구광역시": "대구",
        "인천광역시": "인천",
        "광주광역시": "광주",
        "대전광역시": "대전",
        "울산광역시": "울산",
        "경기도": "경기",
    }
    return mapping.get(city_name, city_name)


def normalize_metropolitan_region_name(city_name: str, region_name: str) -> str:
    """
    수도권의 구 단위 지역명을 시/군 단위로 정규화
    
    Args:
        city_name: 시도명 (예: "서울특별시", "경기도", "인천광역시")
        region_name: 시군구명 (예: "강남구", "수원시", "권선구")
    
    Returns:
        정규화된 시/군명 (예: "서울", "수원", "인천")
    """
    if not region_name:
        if city_name == "서울특별시":
            return "서울"
        elif city_name == "인천광역시":
            return "인천"
        else:
            return city_name
    
    # 구 단위를 시/군 단위로 매핑
    gu_to_city_map = {
        # 수원시 구들
        "권선구": "수원",
        "영통구": "수원",
        "장안구": "수원",
        "팔달구": "수원",
        "권선": "수원",
        "영통": "수원",
        "장안": "수원",
        "팔달": "수원",
        # 용인시 구들 (수지는 용인, 기흥은 시흥으로 매핑)
        "수지구": "용인",
        "처인구": "용인",
        "수지": "용인",
        "처인": "용인",
        # 기흥 → 시흥으로 매핑
        "기흥구": "시흥",
        "기흥": "시흥",
        # 안산시 구들
        "단원구": "안산",
        "상록구": "안산",
        "단원": "안산",
        "상록": "안산",
        # 고양시 구들
        "덕양구": "고양",
        "일산동구": "고양",
        "일산서구": "고양",
        "덕양": "고양",
        "일산동": "고양",
        "일산서": "고양",
        # 안양시 구들
        "동안구": "안양",
        "만안구": "안양",
        "동안": "안양",
        "만안": "안양",
        # 성남시 구들
        "분당구": "성남",
        "수정구": "성남",
        "중원구": "성남",
        "분당": "성남",
        "수정": "성남",
        "중원": "성남",
        # 부천시 구들
        "소사구": "부천",
        "오정구": "부천",
        "원미구": "부천",
        "소사": "부천",
        "오정": "부천",
        "원미": "부천",
        # 불완전한 이름 매핑
        "리": "구리",
        "포": "군포",
    }
    
    # 원본 region_name에서 직접 매핑 확인 (불완전한 이름 처리)
    if region_name in gu_to_city_map:
        return gu_to_city_map[region_name]
    
    # "부천 소사", "부천 오정", "부천 원미" 같은 형식 처리
    if "부천" in region_name:
        # "부천시 소사구" 또는 "부천 소사" 형식 처리
        parts = region_name.replace("시", "").replace("구", "").split()
        if len(parts) > 1:
            gu_name = parts[1].strip()
            if gu_name in gu_to_city_map:
                return gu_to_city_map[gu_name]
        return "부천"
    
    # 구 단위 매핑 확인
    normalized_region = region_name.replace("시", "").replace("군", "").replace("구", "").strip()
    
    # 정규화된 이름으로 매핑 확인
    if normalized_region in gu_to_city_map:
        return gu_to_city_map[normalized_region]
    
    # 서울특별시와 인천광역시는 시도명만 사용
    if city_name == "서울특별시":
        return "서울"
    elif city_name == "인천광역시":
        return "인천"
    
    # 경기도: 시/군명에서 "시", "군", "구" 제거
    # 이미 정규화된 경우 그대로 사용
    if normalized_region:
        return normalized_region
    
    return city_name


def normalize_metropolitan_region_name_without_fallback(city_name: str, region_name: str) -> str:
    """
    수도권의 구 단위 지역명을 시/군 단위로 정규화 (예외처리 제외 버전)
    "리", "포", "기흥"은 매핑하지 않고 그대로 반환
    
    Args:
        city_name: 시도명 (예: "서울특별시", "경기도", "인천광역시")
        region_name: 시군구명 (예: "강남구", "수원시", "권선구")
    
    Returns:
        정규화된 시/군명 (예: "서울", "수원", "인천") 또는 원본 ("리", "포", "기흥")
    """
    if not region_name:
        if city_name == "서울특별시":
            return "서울"
        elif city_name == "인천광역시":
            return "인천"
        else:
            return city_name
    
    # 구 단위를 시/군 단위로 매핑 (리, 포, 기흥 제외)
    gu_to_city_map = {
        # 수원시 구들
        "권선구": "수원",
        "영통구": "수원",
        "장안구": "수원",
        "팔달구": "수원",
        "권선": "수원",
        "영통": "수원",
        "장안": "수원",
        "팔달": "수원",
        # 용인시 구들 (수지, 처인만 용인으로, 기흥은 매핑하지 않음)
        "수지구": "용인",
        "처인구": "용인",
        "수지": "용인",
        "처인": "용인",
        # 안산시 구들
        "단원구": "안산",
        "상록구": "안산",
        "단원": "안산",
        "상록": "안산",
        # 고양시 구들
        "덕양구": "고양",
        "일산동구": "고양",
        "일산서구": "고양",
        "덕양": "고양",
        "일산동": "고양",
        "일산서": "고양",
        # 안양시 구들
        "동안구": "안양",
        "만안구": "안양",
        "동안": "안양",
        "만안": "안양",
        # 성남시 구들
        "분당구": "성남",
        "수정구": "성남",
        "중원구": "성남",
        "분당": "성남",
        "수정": "성남",
        "중원": "성남",
        # 부천시 구들
        "소사구": "부천",
        "오정구": "부천",
        "원미구": "부천",
        "소사": "부천",
        "오정": "부천",
        "원미": "부천",
    }
    
    # 원본 region_name 확인
    normalized_region = region_name.replace("시", "").replace("군", "").replace("구", "").strip()
    
    # "리", "포", "기흥"은 예외처리용이므로 그대로 반환
    if normalized_region == "리" or normalized_region == "포" or normalized_region == "기흥":
        return normalized_region
    
    # 원본 region_name에서 직접 매핑 확인
    if region_name in gu_to_city_map:
        return gu_to_city_map[region_name]
    
    # "부천 소사", "부천 오정", "부천 원미" 같은 형식 처리
    if "부천" in region_name:
        parts = region_name.replace("시", "").replace("구", "").split()
        if len(parts) > 1:
            gu_name = parts[1].strip()
            if gu_name in gu_to_city_map:
                return gu_to_city_map[gu_name]
        return "부천"
    
    # 정규화된 이름으로 매핑 확인
    if normalized_region in gu_to_city_map:
        return gu_to_city_map[normalized_region]
    
    # 서울특별시와 인천광역시는 시도명만 사용
    if city_name == "서울특별시":
        return "서울"
    elif city_name == "인천광역시":
        return "인천"
    
    # 경기도: 시/군명에서 "시", "군", "구" 제거
    if normalized_region:
        return normalized_region
    
    return city_name


def get_region_type_filter(region_type: str):
    """
    지역 유형에 따른 city_name 필터 조건 반환
    
    Args:
        region_type: 지역 유형 ("전국", "수도권", "지방5대광역시")
    
    Returns:
        SQLAlchemy 필터 조건 (None이면 필터 없음)
    """
    if region_type == "전국":
        return None
    elif region_type == "수도권":
        return State.city_name.in_(['서울특별시', '경기도', '인천광역시'])
    elif region_type == "지방5대광역시":
        return State.city_name.in_(['부산광역시', '대구광역시', '광주광역시', '대전광역시', '울산광역시'])
    else:
        raise ValueError(f"유효하지 않은 region_type: {region_type}")


def calculate_quadrant(sale_change_rate: float, rent_change_rate: float) -> tuple[int, str]:
    """
    4분면 분류 계산
    
    Args:
        sale_change_rate: 매매 거래량 변화율 (%)
        rent_change_rate: 전월세 거래량 변화율 (%)
    
    Returns:
        (quadrant_number, quadrant_label) 튜플
    """
    if sale_change_rate > 0 and rent_change_rate < 0:
        return (1, "매수 전환")
    elif sale_change_rate < 0 and rent_change_rate > 0:
        return (2, "임대 선호/관망")
    elif sale_change_rate < 0 and rent_change_rate < 0:
        return (3, "시장 위축")
    elif sale_change_rate > 0 and rent_change_rate > 0:
        return (4, "활성화")
    else:
        # 변화율이 0인 경우는 중립으로 처리
        if sale_change_rate == 0 and rent_change_rate == 0:
            return (0, "중립")
        elif sale_change_rate == 0:
            return (2 if rent_change_rate > 0 else 3, "임대 선호/관망" if rent_change_rate > 0 else "시장 위축")
        else:
            return (1 if sale_change_rate > 0 else 3, "매수 전환" if sale_change_rate > 0 else "시장 위축")


# ============================================================
# 시장 국면 지표 헬퍼 함수
# ============================================================

def get_region_filters(region_type: str, city_name: Optional[str] = None) -> list:
    """
    지역 유형에 따른 필터 조건 반환
    
    Args:
        region_type: 지역 유형 ("전국", "수도권", "지방5대광역시")
        city_name: 특정 시도명 (지방5대광역시일 때 특정 지역 필터링)
    
    Returns:
        SQLAlchemy 필터 조건 리스트
    """
    if region_type == "전국":
        filters = []
        logger.debug(f"지역 필터: 전국 (필터 없음)")
        return filters
    elif region_type == "수도권":
        filters = [State.city_name.in_(['서울특별시', '경기도', '인천광역시'])]
        logger.debug(f"지역 필터: 수도권 - 서울특별시, 경기도, 인천광역시")
        return filters
    elif region_type == "지방5대광역시":
        if city_name:
            filters = [State.city_name == city_name]
            logger.debug(f"지역 필터: 지방5대광역시 - {city_name}")
            return filters
        filters = [State.city_name.in_(['부산광역시', '대구광역시', '광주광역시', '대전광역시', '울산광역시'])]
        logger.debug(f"지역 필터: 지방5대광역시 - 부산광역시, 대구광역시, 광주광역시, 대전광역시, 울산광역시")
        return filters
    else:
        logger.warning(f"알 수 없는 region_type: {region_type}")
        return []


async def get_thresholds(
    db: AsyncSession,
    region_type: str,
    region_name: Optional[str] = None,
    volume_threshold: Optional[float] = None,
    price_threshold: Optional[float] = None
) -> tuple[float, float]:
    """
    임계값 조회 (API 파라미터 우선, 없으면 기본값)
    
    우선순위:
    1. API 파라미터
    2. 지역별 설정값 테이블 (향후 구현)
    3. 기본값
    
    Args:
        db: 데이터베이스 세션
        region_type: 지역 유형 ("전국", "수도권", "지방5대광역시")
        region_name: 지역명 (지방5대광역시일 때)
        volume_threshold: API 파라미터로 전달된 거래량 임계값
        price_threshold: API 파라미터로 전달된 가격 임계값
    
    Returns:
        (volume_threshold, price_threshold) 튜플
    """
    # 1. API 파라미터가 있으면 우선 사용
    if volume_threshold is not None and price_threshold is not None:
        return volume_threshold, price_threshold
    
    # 2. 지역별 설정값 테이블에서 조회 (향후 구현)
    # TODO: market_phase_thresholds 테이블 조회
    # if db:
    #     threshold_record = await db.query(MarketPhaseThreshold).filter(
    #         MarketPhaseThreshold.region_type == region_type,
    #         MarketPhaseThreshold.region_name == region_name if region_name else None
    #     ).first()
    #     
    #     if threshold_record:
    #         return (
    #             volume_threshold or threshold_record.volume_threshold,
    #             price_threshold or threshold_record.price_threshold
    #         )
    
    # 3. 지역별 기본값 사용
    # API 파라미터가 없으면 지역별 기본값 적용
    if region_type == "전국":
        default_vol_threshold = 2.0
        default_price_threshold = 0.5
    elif region_type == "수도권":
        default_vol_threshold = 2.5
        default_price_threshold = 0.6
    elif region_type == "지방5대광역시":
        default_vol_threshold = 1.7
        default_price_threshold = 0.4
    else:
        default_vol_threshold = 2.0
        default_price_threshold = 0.5
    
    final_vol_threshold = volume_threshold if volume_threshold is not None else default_vol_threshold
    final_price_threshold = price_threshold if price_threshold is not None else default_price_threshold
    
    logger.info(
        f"[Thresholds] Threshold lookup - "
        f"region_type: {region_type}, region_name: {region_name}, "
        f"API params: vol={volume_threshold}, price={price_threshold}, "
        f"Final values: vol={final_vol_threshold}, price={final_price_threshold}"
    )
    
    return final_vol_threshold, final_price_threshold


def calculate_market_phase(
    volume_change_rate: Optional[float],
    price_change_rate: Optional[float],
    current_month_volume: int,
    min_transaction_count: int = 5,
    volume_threshold: float = 2.0,
    price_threshold: float = 0.5
) -> dict:
    """
    벌집 순환 모형에 따른 시장 국면 판별
    
    6개 국면:
    1. 회복 (Recovery): 거래량 증가 ↑ / 가격 하락 혹은 보합 →
    2. 상승 (Expansion): 거래량 증가 ↑ / 가격 상승 ↑
    3. 둔화 (Slowdown): 거래량 감소 ↓ / 가격 상승 ↑
    4. 후퇴 (Recession): 거래량 감소 ↓ / 가격 하락 ↓
    5. 침체 (Depression): 거래량 급감 ↓ / 가격 하락세 지속 ↓
    6. 천착 (Trough): 거래량 미세 증가 ↑ / 가격 하락 ↓
    
    Args:
        volume_change_rate: 거래량 변동률 (%)
        price_change_rate: 가격 변동률 (%)
        current_month_volume: 현재 월 거래량
        min_transaction_count: 최소 거래 건수 (기본값: 5)
        volume_threshold: 거래량 변동 임계값 (%)
        price_threshold: 가격 변동 임계값 (%)
    
    Returns:
        {
            "phase": int | None,
            "phase_label": str,
            "description": str,
            "current_month_volume": int,
            "min_required_volume": int
        } 딕셔너리
    """
    # 예외 처리: 거래량이 너무 적은 경우
    if current_month_volume < min_transaction_count:
        return {
            "phase": None,
            "phase_label": "데이터 부족",
            "description": f"데이터 부족으로 판별 불가 (현재 월 거래량: {current_month_volume}건, 최소 요구량: {min_transaction_count}건)",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 데이터 부족 체크
    if volume_change_rate is None or price_change_rate is None:
        return {
            "phase": None,
            "phase_label": "데이터 부족",
            "description": "가격 또는 거래량 데이터 부족으로 판별 불가",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 임계값 기반 판별
    volume_up = volume_change_rate > volume_threshold
    volume_down = volume_change_rate < -volume_threshold
    price_up = price_change_rate > price_threshold
    price_down = price_change_rate < -price_threshold
    price_stable = -price_threshold <= price_change_rate <= price_threshold
    
    # 1. 회복 (Recovery): 거래량 증가 ↑ / 가격 하락 혹은 보합 →
    if volume_up and (price_down or price_stable):
        return {
            "phase": 1,
            "phase_label": "회복",
            "description": "거래량 증가와 가격 하락/보합이 동반되는 바닥 다지기 단계입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 2. 상승 (Expansion): 거래량 증가 ↑ / 가격 상승 ↑
    if volume_up and price_up:
        return {
            "phase": 2,
            "phase_label": "상승",
            "description": "거래량 증가와 가격 상승이 동반되는 활황기입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 3. 둔화 (Slowdown): 거래량 감소 ↓ / 가격 상승 ↑
    if volume_down and price_up:
        return {
            "phase": 3,
            "phase_label": "둔화",
            "description": "거래량 감소와 가격 상승이 동반되는 에너지 고갈 단계입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 4. 후퇴 (Recession): 거래량 감소 ↓ / 가격 하락 ↓
    if volume_down and price_down:
        return {
            "phase": 4,
            "phase_label": "후퇴",
            "description": "거래량 감소와 가격 하락이 동반되는 본격 하락 단계입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 5. 침체 (Depression): 거래량 급감 ↓ / 가격 하락세 지속 ↓
    if volume_change_rate < -5.0 and price_change_rate < -1.0:
        return {
            "phase": 5,
            "phase_label": "침체",
            "description": "거래량 급감과 가격 하락세 지속이 동반되는 침체기입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 6. 천착 (Trough): 거래량 미세 증가 ↑ / 가격 하락 ↓
    if 0 < volume_change_rate <= volume_threshold and price_down:
        return {
            "phase": 6,
            "phase_label": "천착",
            "description": "거래량 미세 증가와 가격 하락이 동반되는 반등 준비 단계입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 기본값: 중립
    return {
        "phase": 0,
        "phase_label": "중립",
        "description": "시장이 중립 상태입니다.",
        "current_month_volume": current_month_volume,
        "min_required_volume": min_transaction_count
    }


async def calculate_volume_change_rate_average(
    db: AsyncSession,
    region_type: str,
    city_name: Optional[str] = None,
    average_period_months: int = 6
) -> tuple[Optional[float], int]:
    """
    과거 평균 대비 거래량 변동률 계산
    
    Args:
        db: 데이터베이스 세션
        region_type: 지역 유형
        city_name: 특정 시도명 (지방5대광역시일 때)
        average_period_months: 평균 계산 기간 (개월)
    
    Returns:
        (volume_change_rate, current_month_volume) 튜플
    """
    # 현재 날짜 기준으로 기간 계산
    # 가이드 문서에 따르면 "이전 달" 데이터를 조회 (완전히 집계된 데이터)
    now = datetime.now()
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # 이전 달 계산 (더 안전한 방법)
    if current_month_start.month == 1:
        previous_month_start = current_month_start.replace(year=current_month_start.year - 1, month=12)
    else:
        previous_month_start = current_month_start.replace(month=current_month_start.month - 1)
    
    # 지역 필터
    region_filters = get_region_filters(region_type, city_name)
    
    # 현재 월 거래량 (이전 달 완전히 집계된 데이터)
    # 가이드 문서: contract_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
    #            AND contract_date < DATE_TRUNC('month', CURRENT_DATE)
    current_volume_query = select(func.count(Sale.trans_id)).select_from(
        Sale.__table__.join(
            Apartment.__table__,
            Sale.apt_id == Apartment.apt_id
        ).join(
            State.__table__,
            Apartment.region_id == State.region_id
        )
    ).where(
        and_(
            Sale.is_canceled == False,
            or_(Sale.is_deleted == False, Sale.is_deleted.is_(None)),
            Sale.contract_date.isnot(None),
            # TODO: 실제 데이터 사용 시 아래 주석 해제
            # or_(Sale.remarks != '더미', Sale.remarks.is_(None)),
            Sale.contract_date >= previous_month_start,
            Sale.contract_date < current_month_start,
            *region_filters
        )
    )
    
    current_volume_result = await db.execute(current_volume_query)
    current_month_volume = current_volume_result.scalar() or 0
    
    # 디버깅: 쿼리 결과 상세 로깅
    if current_month_volume == 0:
        logger.warning(
            f"거래량 변동률 계산: 현재 월 거래량 0 - "
            f"region_type: {region_type}, city_name: {city_name}, "
            f"조회 기간: {previous_month_start.date()} ~ {current_month_start.date()}, "
            f"필터 조건: {region_filters}"
        )
        
        # 디버깅: 필터 없이 전체 거래량 확인
        debug_query = select(func.count(Sale.trans_id)).select_from(
            Sale.__table__.join(
                Apartment.__table__,
                Sale.apt_id == Apartment.apt_id
            ).join(
                State.__table__,
                Apartment.region_id == State.region_id
            )
        ).where(
            and_(
                Sale.is_canceled == False,
                or_(Sale.is_deleted == False, Sale.is_deleted.is_(None)),
                Sale.contract_date.isnot(None),
                Sale.contract_date >= previous_month_start,
                Sale.contract_date < current_month_start,
                *region_filters
            )
        )
        debug_result = await db.execute(debug_query)
        debug_count = debug_result.scalar() or 0
        logger.info(f"디버깅: 필터 적용 거래량 = {debug_count}")
        
        # 디버깅: 해당 지역의 전체 거래량 확인 (필터 없이)
        if city_name:
            city_only_query = select(func.count(Sale.trans_id)).select_from(
                Sale.__table__.join(
                    Apartment.__table__,
                    Sale.apt_id == Apartment.apt_id
                ).join(
                    State.__table__,
                    Apartment.region_id == State.region_id
                )
            ).where(
                and_(
                    Sale.is_canceled == False,
                    or_(Sale.is_deleted == False, Sale.is_deleted.is_(None)),
                    Sale.contract_date.isnot(None),
                    Sale.contract_date >= previous_month_start,
                    Sale.contract_date < current_month_start,
                    State.city_name == city_name
                )
            )
            city_result = await db.execute(city_only_query)
            city_count = city_result.scalar() or 0
            logger.info(
                f" 디버깅: {city_name} 지역 전체 거래량 (필터 없이) = {city_count}, "
                f"조회 기간: {previous_month_start.date()} ~ {current_month_start.date()}"
            )
            
            # 디버깅: 해당 지역의 아파트 수 확인
            apt_count_query = select(func.count(Apartment.apt_id)).select_from(
                Apartment.__table__.join(
                    State.__table__,
                    Apartment.region_id == State.region_id
                )
            ).where(
                State.city_name == city_name
            )
            apt_result = await db.execute(apt_count_query)
            apt_count = apt_result.scalar() or 0
            logger.info(f" 디버깅: {city_name} 지역 아파트 수 = {apt_count}")
            
            # 디버깅: 해당 지역의 전체 거래 수 확인 (기간 제한 없이)
            all_time_query = select(func.count(Sale.trans_id)).select_from(
                Sale.__table__.join(
                    Apartment.__table__,
                    Sale.apt_id == Apartment.apt_id
                ).join(
                    State.__table__,
                    Apartment.region_id == State.region_id
                )
            ).where(
                and_(
                    Sale.is_canceled == False,
                    or_(Sale.is_deleted == False, Sale.is_deleted.is_(None)),
                    Sale.contract_date.isnot(None),
                    State.city_name == city_name
                )
            )
            all_time_result = await db.execute(all_time_query)
            all_time_count = all_time_result.scalar() or 0
            logger.info(f" 디버깅: {city_name} 지역 전체 기간 거래량 = {all_time_count}")
        
        return None, 0
    
    # 과거 평균 거래량 계산 (N개월 평균)
    # 월별 거래량을 구한 후 평균 계산
    avg_start_date = previous_month_start - timedelta(days=30 * average_period_months)
    
    # 월별 거래량 조회
    monthly_volumes_query = select(
        extract('year', Sale.contract_date).label('year'),
        extract('month', Sale.contract_date).label('month'),
        func.count(Sale.trans_id).label('volume')
    ).select_from(
        Sale.__table__.join(
            Apartment.__table__,
            Sale.apt_id == Apartment.apt_id
        ).join(
            State.__table__,
            Apartment.region_id == State.region_id
        )
    ).where(
        and_(
            Sale.is_canceled == False,
            or_(Sale.is_deleted == False, Sale.is_deleted.is_(None)),
            Sale.contract_date.isnot(None),
            # TODO: 실제 데이터 사용 시 아래 주석 해제
            # or_(Sale.remarks != '더미', Sale.remarks.is_(None)),
            Sale.contract_date >= avg_start_date,
            Sale.contract_date < previous_month_start,
            *region_filters
        )
    ).group_by(
        extract('year', Sale.contract_date),
        extract('month', Sale.contract_date)
    )
    
    monthly_volumes_result = await db.execute(monthly_volumes_query)
    monthly_volumes = [row.volume for row in monthly_volumes_result.fetchall()]
    
    if not monthly_volumes:
        logger.warning(
            f"거래량 변동률 계산: 과거 평균 데이터 없음 - "
            f"region_type: {region_type}, city_name: {city_name}, "
            f"기간: {average_period_months}개월"
        )
        return None, current_month_volume
    
    avg_volume = sum(monthly_volumes) / len(monthly_volumes)
    
    if avg_volume == 0:
        logger.warning(
            f"거래량 변동률 계산: 과거 평균 거래량 0 - "
            f"region_type: {region_type}, city_name: {city_name}"
        )
        return None, current_month_volume
    
    volume_change_rate = ((current_month_volume - avg_volume) / avg_volume) * 100
    return volume_change_rate, current_month_volume


async def calculate_volume_change_rate_mom(
    db: AsyncSession,
    region_type: str,
    city_name: Optional[str] = None
) -> tuple[Optional[float], int]:
    """
    전월 대비 거래량 변동률 계산
    
    Args:
        db: 데이터베이스 세션
        region_type: 지역 유형
        city_name: 특정 시도명 (지방5대광역시일 때)
    
    Returns:
        (volume_change_rate, current_month_volume) 튜플
    """
    # 현재 날짜 기준으로 기간 계산
    now = datetime.now()
    current_month_start = now.replace(day=1)
    previous_month_start = (current_month_start - timedelta(days=1)).replace(day=1)
    two_months_ago_start = (previous_month_start - timedelta(days=1)).replace(day=1)
    
    # 지역 필터
    region_filters = get_region_filters(region_type, city_name)
    logger.debug(
        f"거래량 변동률 계산 (mom) - "
        f"region_type: {region_type}, city_name: {city_name}, "
        f"필터 개수: {len(region_filters)}"
    )
    
    # 최근 2개월 거래량 조회
    monthly_volumes_query = select(
        extract('year', Sale.contract_date).label('year'),
        extract('month', Sale.contract_date).label('month'),
        func.count(Sale.trans_id).label('volume')
    ).select_from(
        Sale.__table__.join(
            Apartment.__table__,
            Sale.apt_id == Apartment.apt_id
        ).join(
            State.__table__,
            Apartment.region_id == State.region_id
        )
    ).where(
        and_(
            Sale.is_canceled == False,
            or_(Sale.is_deleted == False, Sale.is_deleted.is_(None)),
            Sale.contract_date.isnot(None),
            # TODO: 실제 데이터 사용 시 아래 주석 해제
            # or_(Sale.remarks != '더미', Sale.remarks.is_(None)),
            Sale.contract_date >= two_months_ago_start,
            Sale.contract_date < current_month_start,
            *region_filters
        )
    ).group_by(
        extract('year', Sale.contract_date),
        extract('month', Sale.contract_date)
    ).order_by(
        desc(extract('year', Sale.contract_date)),
        desc(extract('month', Sale.contract_date))
    ).limit(2)
    
    monthly_volumes_result = await db.execute(monthly_volumes_query)
    monthly_data = monthly_volumes_result.fetchall()
    
    if len(monthly_data) < 2:
        logger.warning(
            f"거래량 변동률 계산 (전월 대비): 데이터 부족 - "
            f"필요: 2개월, 실제: {len(monthly_data)}개월, "
            f"region_type: {region_type}, city_name: {city_name}"
        )
        return None, 0
    
    current_volume = monthly_data[0].volume
    previous_volume = monthly_data[1].volume
    
    if previous_volume == 0:
        logger.warning(
            f"거래량 변동률 계산 (전월 대비): 전월 거래량 0 - "
            f"region_type: {region_type}, city_name: {city_name}"
        )
        return None, current_volume
    
    volume_change_rate = ((current_volume - previous_volume) / previous_volume) * 100
    return volume_change_rate, current_volume


async def calculate_price_change_rate_moving_average(
    db: AsyncSession,
    region_type: str,
    city_name: Optional[str] = None
) -> Optional[float]:
    """
    최근 3개월 이동평균 변동률 계산
    
    최근 3개월 평균 vs 이전 3개월 평균 비교
    
    Args:
        db: 데이터베이스 세션
        region_type: 지역 유형
        city_name: 특정 시도명 (지방5대광역시일 때)
    
    Returns:
        가격 변동률 (%) 또는 None
    """
    # 최근 6개월 HPI 데이터 조회 필요
    # base_ym은 YYYYMM 형식 문자열 (CHAR(6))
    now = datetime.now()
    current_year_month = now.strftime('%Y%m')  # 문자열로 유지
    
    # 6개월 전 base_ym 계산
    six_months_ago = now - timedelta(days=180)
    start_base_ym = six_months_ago.strftime('%Y%m')  # 문자열로 유지
    
    # 지역 필터
    region_filters = get_region_filters(region_type, city_name)
    logger.debug(
        f"가격 변동률 계산 - "
        f"region_type: {region_type}, city_name: {city_name}, "
        f"필터 개수: {len(region_filters)}"
    )
    
    # HPI 데이터 조회 (최근 6개월)
    # base_ym은 문자열이므로 문자열 비교 사용
    hpi_query = select(
        HouseScore.base_ym,
        HouseScore.index_value,
        State.city_name,
        State.region_id
    ).join(
        State, HouseScore.region_id == State.region_id
    ).where(
        and_(
            HouseScore.is_deleted == False,
            State.is_deleted == False,
            HouseScore.index_type == 'APT',
            HouseScore.base_ym >= start_base_ym,
            HouseScore.base_ym <= current_year_month,
            *region_filters
        )
    ).order_by(
        desc(HouseScore.base_ym)
    )
    
    hpi_result = await db.execute(hpi_query)
    hpi_data = hpi_result.fetchall()
    
    if len(hpi_data) < 6:
        # 최소 6개월 데이터 필요
        logger.warning(
            f"가격 변동률 계산: 데이터 부족 - "
            f"필요: 6개월, 실제: {len(hpi_data)}개월"
        )
        return None
    
    # 전국/수도권: 전체 평균 계산
    if region_type in ["전국", "수도권"]:
        # base_ym별로 평균 index_value 계산
        hpi_by_month = defaultdict(list)
        for row in hpi_data:
            hpi_by_month[row.base_ym].append(row.index_value)
        
        # 월별 평균 계산
        monthly_avg = {
            base_ym: sum(values) / len(values)
            for base_ym, values in hpi_by_month.items()
        }
        
        # base_ym 순서대로 정렬 (최신순)
        # base_ym은 YYYYMM 형식 문자열이므로 정수로 변환하여 정렬
        sorted_months = sorted(
            monthly_avg.keys(), 
            key=lambda x: int(x) if isinstance(x, str) and x.isdigit() else int(x) if isinstance(x, (int, float)) else 0,
            reverse=True
        )
        
        if len(sorted_months) < 6:
            logger.warning(
                f"가격 변동률 계산: 데이터 부족 - "
                f"필요: 6개월, 실제: {len(sorted_months)}개월 (region_type: {region_type})"
            )
            return None
        
        # 최근 3개월 평균
        recent_3months_values = [monthly_avg[m] for m in sorted_months[:3]]
        current_avg = sum(recent_3months_values) / len(recent_3months_values)
        
        # 이전 3개월 평균 (4~6개월 전)
        previous_3months_values = [monthly_avg[m] for m in sorted_months[3:6]]
        previous_avg = sum(previous_3months_values) / len(previous_3months_values)
        
        if previous_avg == 0:
            logger.warning(
                f"가격 변동률 계산: 이전 평균이 0 - region_type: {region_type}"
            )
            return None
        
        price_change_rate = ((current_avg - previous_avg) / previous_avg) * 100
        return price_change_rate
    
    # 지방5대광역시: 특정 지역별 계산
    else:
        if not city_name:
            if not hpi_data:
                logger.warning(
                    f"가격 변동률 계산: 데이터 없음 - region_type: {region_type}"
                )
                return None
            # city_name이 없으면 첫 번째 지역 사용
            city_name = hpi_data[0].city_name
        
        # 해당 지역의 데이터만 필터링
        region_hpi = [row for row in hpi_data if row.city_name == city_name]
        
        if len(region_hpi) < 6:
            logger.warning(
                f"가격 변동률 계산: 데이터 부족 - "
                f"필요: 6개월, 실제: {len(region_hpi)}개월 (지역: {city_name})"
            )
            return None
        
        # base_ym별로 그룹화하여 평균 계산 (같은 base_ym에 여러 데이터가 있을 수 있음)
        hpi_by_month = defaultdict(list)
        for row in region_hpi:
            hpi_by_month[row.base_ym].append(float(row.index_value))
        
        # 월별 평균 계산
        monthly_avg = {
            base_ym: sum(values) / len(values)
            for base_ym, values in hpi_by_month.items()
        }
        
        # base_ym 순서대로 정렬 (최신순)
        sorted_months = sorted(
            monthly_avg.keys(), 
            key=lambda x: int(x) if isinstance(x, str) and x.isdigit() else int(x) if isinstance(x, (int, float)) else 0,
            reverse=True
        )
        
        if len(sorted_months) < 6:
            logger.warning(
                f"가격 변동률 계산: 데이터 부족 - "
                f"필요: 6개월, 실제: {len(sorted_months)}개월 (지역: {city_name})"
            )
            return None
        
        # 최근 3개월 평균
        recent_3months_values = [monthly_avg[m] for m in sorted_months[:3]]
        current_avg = sum(recent_3months_values) / len(recent_3months_values)
        
        # 이전 3개월 평균 (4~6개월 전)
        previous_3months_values = [monthly_avg[m] for m in sorted_months[3:6]]
        previous_avg = sum(previous_3months_values) / len(previous_3months_values)
        
        if previous_avg == 0:
            logger.warning(
                f"가격 변동률 계산: 이전 평균이 0 - 지역: {city_name}"
            )
            return None
        
        price_change_rate = ((current_avg - previous_avg) / previous_avg) * 100
        return price_change_rate


@router.get(
    "/rvol",
    response_model=RVOLResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Statistics (통계)"],
    summary="RVOL(상대 거래량) 조회",
    description="""
    RVOL(Relative Volume)을 계산하여 조회합니다.
    
    ### RVOL 계산 방법
    - 현재 거래량을 과거 일정 기간의 평균 거래량으로 나눈 값
    - 예: 최근 2개월 거래량 ÷ 직전 2개월 평균 거래량
    
    ### 해석
    - **RVOL > 1**: 평소보다 거래가 활발함 (평균 이상)
    - **RVOL = 1**: 평소와 비슷한 수준의 거래량
    - **RVOL < 1**: 평소보다 거래가 한산함 (평균 이하)
    
    ### Query Parameters
    - `transaction_type`: 거래 유형 (sale: 매매, rent: 전월세, 기본값: sale)
    - `current_period_months`: 현재 기간 (개월, 기본값: 6, 최대: 6)
    - `average_period_months`: 평균 계산 기간 (개월, 기본값: 6, 최대: 6)
    """
)
async def get_rvol(
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), rent(전월세)"),
    current_period_months: int = Query(6, ge=1, le=12, description="현재 기간 (개월, 최대 12)"),
    average_period_months: int = Query(6, ge=1, le=12, description="평균 계산 기간 (개월, 최대 12)"),
    db: AsyncSession = Depends(get_db)
):
    """
    RVOL(상대 거래량) 조회
    """
    return await statistics_service.get_rvol(
        db, 
        transaction_type, 
        current_period_months, 
        average_period_months
    )


@router.get(
    "/quadrant",
    response_model=QuadrantResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Statistics (통계)"],
    summary="4분면 분류 조회",
    description="""
    매매 거래량 변화율과 전월세 거래량 변화율을 기반으로 4분면 분류를 수행합니다.
    
    ### 4분면 분류
    - **x축**: 매매 거래량 변화율
    - **y축**: 전월세 거래량 변화율
    
    ### 해석
    1. **매매↑ / 전월세↓**: 매수 전환 (사는 쪽으로 이동)
    2. **매매↓ / 전월세↑**: 임대 선호/관망 (빌리는 쪽으로 이동)
    3. **매매↓ / 전월세↓**: 시장 위축 (전체 유동성 경색)
    4. **매매↑ / 전월세↑**: 활성화 (수요 자체가 강함, 이사/거래 증가)
    
    ### Query Parameters
    - `period_months`: 비교 기간 (개월, 기본값: 2, 최대: 6)
    """
)
async def get_quadrant(
    period_months: int = Query(2, ge=1, le=12, description="비교 기간 (개월, 최대 12)"),
    db: AsyncSession = Depends(get_db)
):
    """
    4분면 분류 조회 - 성능 최적화 버전
    
    월별 집계로 간소화하여 빠른 응답 제공
    """
    cache_key = build_cache_key("statistics", "quadrant_v2", str(period_months))
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f" [Statistics Quadrant] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f" [Statistics Quadrant] 4분면 분류 데이터 조회 시작 - "
            f"period_months: {period_months}"
        )
        
        # 현재 날짜 기준으로 기간 설정
        today = date.today()
        # 현재 달의 첫 날 (현재 달 제외)
        current_month_start = date(today.year, today.month, 1)
        
        # 최근 기간과 이전 기간 설정 (현재 달 제외)
        recent_start = current_month_start - timedelta(days=period_months * 30)
        recent_end = current_month_start  # 현재 달의 첫 날 전까지
        
        previous_start = recent_start - timedelta(days=period_months * 30)
        previous_end = recent_start
        
        logger.info(
            f" [Statistics Quadrant] 날짜 범위 - "
            f"previous_start: {previous_start}, previous_end: {previous_end}, "
            f"recent_start: {recent_start}, recent_end: {recent_end}"
        )
        
        # 월별 집계 (to_char 대신 extract 사용 - 인덱스 활용 가능)
        # 매매 거래량: 이전 기간
        sale_previous_stmt = (
            select(
                extract('year', Sale.contract_date).label('year'),
                extract('month', Sale.contract_date).label('month'),
                func.count(Sale.trans_id).label('count')
            )
            .where(
                and_(
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                    Sale.contract_date.isnot(None),
                    Sale.contract_date >= previous_start,
                    Sale.contract_date < previous_end,
                    #or_(Sale.remarks != "더미", Sale.remarks.is_(None))
                )
            )
            .group_by(extract('year', Sale.contract_date), extract('month', Sale.contract_date))
        )
        
        # 매매 거래량: 최근 기간
        sale_recent_stmt = (
            select(
                extract('year', Sale.contract_date).label('year'),
                extract('month', Sale.contract_date).label('month'),
                func.count(Sale.trans_id).label('count')
            )
            .where(
                and_(
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                    Sale.contract_date.isnot(None),
                    Sale.contract_date >= recent_start,
                    Sale.contract_date < recent_end,  # 현재 달 제외 (미만으로 변경)
                    #or_(Sale.remarks != "더미", Sale.remarks.is_(None))
                )
            )
            .group_by(extract('year', Sale.contract_date), extract('month', Sale.contract_date))
        )
        
        # 전월세 거래량: 이전 기간
        rent_previous_stmt = (
            select(
                extract('year', Rent.deal_date).label('year'),
                extract('month', Rent.deal_date).label('month'),
                func.count(Rent.trans_id).label('count')
            )
            .where(
                and_(
                    (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                    Rent.deal_date.isnot(None),
                    Rent.deal_date >= previous_start,
                    Rent.deal_date < previous_end,
                    #or_(Rent.remarks != "더미", Rent.remarks.is_(None))
                )
            )
            .group_by(extract('year', Rent.deal_date), extract('month', Rent.deal_date))
        )
        
        # 전월세 거래량: 최근 기간
        rent_recent_stmt = (
            select(
                extract('year', Rent.deal_date).label('year'),
                extract('month', Rent.deal_date).label('month'),
                func.count(Rent.trans_id).label('count')
            )
            .where(
                and_(
                    (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                    Rent.deal_date.isnot(None),
                    Rent.deal_date >= recent_start,
                    Rent.deal_date < recent_end,  # 현재 달 제외 (미만으로 변경)
                    #or_(Rent.remarks != "더미", Rent.remarks.is_(None))
                )
            )
            .group_by(extract('year', Rent.deal_date), extract('month', Rent.deal_date))
        )
        
        # 순차 실행 (SQLAlchemy AsyncSession 동시성 제한)
        sale_previous_result = await db.execute(sale_previous_stmt)
        sale_recent_result = await db.execute(sale_recent_stmt)
        rent_previous_result = await db.execute(rent_previous_stmt)
        rent_recent_result = await db.execute(rent_recent_stmt)
        
        sale_previous_rows = sale_previous_result.fetchall()
        sale_recent_rows = sale_recent_result.fetchall()
        rent_previous_rows = rent_previous_result.fetchall()
        rent_recent_rows = rent_recent_result.fetchall()
        
        # 이전 기간 평균 계산
        sale_previous_total = sum(row.count for row in sale_previous_rows) if sale_previous_rows else 0
        rent_previous_total = sum(row.count for row in rent_previous_rows) if rent_previous_rows else 0
        
        sale_previous_avg = sale_previous_total / len(sale_previous_rows) if sale_previous_rows else 1
        rent_previous_avg = rent_previous_total / len(rent_previous_rows) if rent_previous_rows else 1
        
        # 최근 기간 데이터를 딕셔너리로 변환
        sale_recent_dict = {f"{int(row.year)}-{int(row.month):02d}": row.count for row in sale_recent_rows}
        rent_recent_dict = {f"{int(row.year)}-{int(row.month):02d}": row.count for row in rent_recent_rows}
        
        # 모든 기간 수집 (현재 달 제외)
        all_periods = set(sale_recent_dict.keys()) | set(rent_recent_dict.keys())
        current_year = today.year
        current_month = today.month
        current_period_key = f"{current_year}-{current_month:02d}"
        
        # 현재 달 제외
        all_periods.discard(current_period_key)
        
        quadrant_data = []
        quadrant_counts = {1: 0, 2: 0, 3: 0, 4: 0}
        
        for period in sorted(all_periods):
            sale_recent_count = sale_recent_dict.get(period, 0)
            rent_recent_count = rent_recent_dict.get(period, 0)
            
            # 변화율 계산
            sale_change_rate = ((sale_recent_count - sale_previous_avg) / sale_previous_avg * 100) if sale_previous_avg > 0 else 0
            rent_change_rate = ((rent_recent_count - rent_previous_avg) / rent_previous_avg * 100) if rent_previous_avg > 0 else 0
            
            # 4분면 분류
            quadrant_num, quadrant_label = calculate_quadrant(sale_change_rate, rent_change_rate)
            
            if quadrant_num > 0:
                quadrant_counts[quadrant_num] = quadrant_counts.get(quadrant_num, 0) + 1
            
            quadrant_data.append(
                QuadrantDataPoint(
                    date=period,
                    sale_volume_change_rate=round(sale_change_rate, 2),
                    rent_volume_change_rate=round(rent_change_rate, 2),
                    quadrant=quadrant_num,
                    quadrant_label=quadrant_label
                )
            )
        
        summary = {
            "total_periods": len(quadrant_data),
            "quadrant_distribution": quadrant_counts,
            "sale_previous_avg": round(sale_previous_avg, 2),
            "rent_previous_avg": round(rent_previous_avg, 2)
        }
        
        response_data = QuadrantResponse(
            success=True,
            data=quadrant_data,
            summary=summary
        )
        
        # 캐시에 저장 (TTL: 6시간)
        if len(quadrant_data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        logger.info(f" [Statistics Quadrant] 4분면 분류 데이터 생성 완료 - 데이터 포인트 수: {len(quadrant_data)}")
        
        return response_data
        
    except Exception as e:
        logger.error(f" [Statistics Quadrant] 4분면 분류 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"4분면 분류 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/hpi",
    response_model=HPIResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Statistics (통계)"],
    summary="주택가격지수(HPI) 조회",
    description="""
    주택가격지수(Housing Price Index, HPI)를 조회합니다.
    
    ### 주택가격지수란?
    특정 시점의 주택 가격을 기준(100)으로 잡고, 이후 가격이 얼마나 변했는지를 수치화한 통계 지표입니다.
    
    ### 지수 해석
    - **지수 > 100**: 기준 시점보다 집값이 올랐음
    - **지수 = 100**: 기준 시점과 동일
    - **지수 < 100**: 기준 시점보다 집값이 내렸음
    
    ### Query Parameters
    - `region_id`: 지역 ID (선택, 지정하지 않으면 전체 지역 평균)
    - `index_type`: 지수 유형 (APT: 아파트, HOUSE: 단독주택, ALL: 전체, 기본값: APT)
    - `months`: 조회 기간 (개월, 기본값: 24, 최대: 60)
    """
)
async def get_hpi(
    region_id: Optional[int] = Query(None, description="지역 ID (선택)"),
    index_type: str = Query("APT", description="지수 유형: APT(아파트), HOUSE(단독주택), ALL(전체)"),
    months: int = Query(24, ge=1, le=60, description="조회 기간 (개월, 최대 60)"),
    db: AsyncSession = Depends(get_db)
):
    """
    주택가격지수(HPI) 조회
    
    지역별 주택가격지수 데이터를 조회합니다.
    """
    # 유효한 index_type 검증
    valid_index_types = ["APT", "HOUSE", "ALL"]
    if index_type not in valid_index_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 index_type입니다. 가능한 값: {', '.join(valid_index_types)}"
        )
    
    cache_key = build_cache_key(
        "statistics", "hpi", 
        str(region_id) if region_id else "all",
        index_type,
        str(months)
    )
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f" [Statistics HPI] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f" [Statistics HPI] HPI 데이터 조회 시작 - "
            f"region_id: {region_id}, index_type: {index_type}, months: {months}"
        )
        
        # 기준 날짜 계산 (현재 날짜 기준으로 최근 months개월)
        today = date.today()
        # base_ym은 YYYYMM 형식이므로, 현재 년월을 기준으로 계산
        current_year = today.year
        current_month = today.month
        
        # 최소 base_ym 계산 (months개월 전)
        # 월 단위로 계산
        total_months = current_year * 12 + current_month - 1
        start_total_months = total_months - months + 1  # 현재 달 포함
        start_year = start_total_months // 12
        start_month = (start_total_months % 12) + 1
        
        start_base_ym = f"{start_year:04d}{start_month:02d}"
        end_base_ym = f"{current_year:04d}{current_month:02d}"
        
        logger.info(
            f" [Statistics HPI] 날짜 범위 - "
            f"start_base_ym: {start_base_ym}, end_base_ym: {end_base_ym}"
        )
        
        # 쿼리 구성
        # region_id가 지정된 경우: 특정 지역만 조회
        if region_id is not None:
            query = (
                select(
                    HouseScore.base_ym,
                    HouseScore.index_value,
                    HouseScore.index_change_rate,
                    HouseScore.index_type,
                    State.city_name.label('region_name')  # 시도명 사용
                )
                .join(State, HouseScore.region_id == State.region_id)
                .where(
                    and_(
                        HouseScore.region_id == region_id,
                        HouseScore.is_deleted == False,
                        HouseScore.index_type == index_type,
                        HouseScore.base_ym >= start_base_ym,
                        HouseScore.base_ym <= end_base_ym
                    )
                )
                .order_by(HouseScore.base_ym)
            )
        else:
            # region_id가 없는 경우: 시도(city_name) 레벨로 그룹화 (인구 이동 데이터와 동일한 레벨)
            query = (
                select(
                    HouseScore.base_ym,
                    func.avg(HouseScore.index_value).label('index_value'),
                    func.avg(HouseScore.index_change_rate).label('index_change_rate'),
                    func.max(HouseScore.index_type).label('index_type'),
                    State.city_name.label('region_name')  # 시도명으로 그룹화
                )
                .join(State, HouseScore.region_id == State.region_id)
                .where(
                    and_(
                        HouseScore.is_deleted == False,
                        State.is_deleted == False,
                        HouseScore.index_type == index_type,
                        HouseScore.base_ym >= start_base_ym,
                        HouseScore.base_ym <= end_base_ym
                    )
                )
                .group_by(HouseScore.base_ym, State.city_name)
                .order_by(HouseScore.base_ym, State.city_name)
            )
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        logger.info(
            f" [Statistics HPI] 쿼리 결과 - "
            f"총 {len(rows)}건 조회됨"
        )
        
        # 시도별 데이터 개수 확인
        if rows:
            region_counts = {}
            for row in rows:
                region_name = row.region_name if hasattr(row, 'region_name') and row.region_name else "Unknown"
                region_counts[region_name] = region_counts.get(region_name, 0) + 1
            
            logger.info(
                f" [Statistics HPI] 시도별 데이터 개수 - "
                f"{', '.join([f'{k}: {v}건' for k, v in sorted(region_counts.items())])}"
            )
        
        # 데이터 포인트 생성
        hpi_data = []
        for row in rows:
            base_ym = row.base_ym
            # YYYYMM -> YYYY-MM 형식으로 변환
            year = base_ym[:4]
            month = base_ym[4:6]
            date_str = f"{year}-{month}"
            
            index_value = float(row.index_value) if row.index_value is not None else 0.0
            index_change_rate = float(row.index_change_rate) if row.index_change_rate is not None else None
            
            # region_name 처리: 시도명(city_name) 사용
            region_name = row.region_name if hasattr(row, 'region_name') and row.region_name else None
            
            hpi_data.append(
                HPIDataPoint(
                    date=date_str,
                    index_value=round(index_value, 2),
                    index_change_rate=round(index_change_rate, 2) if index_change_rate is not None else None,
                    region_name=region_name,
                    index_type=index_type
                )
            )
        
        # 날짜순 정렬 (이미 정렬되어 있지만 확실히)
        hpi_data.sort(key=lambda x: x.date)
        
        # 지역별/날짜별 데이터 개수 확인
        if hpi_data:
            date_counts = {}
            region_date_counts = {}
            for item in hpi_data:
                date_counts[item.date] = date_counts.get(item.date, 0) + 1
                if item.region_name:
                    key = f"{item.region_name}-{item.date}"
                    region_date_counts[key] = region_date_counts.get(key, 0) + 1
            
            logger.info(
                f" [Statistics HPI] 데이터 포인트 상세 - "
                f"총 {len(hpi_data)}건, "
                f"날짜별 개수: {dict(sorted(date_counts.items())[:5])}... (최신 5개만 표시), "
                f"시도 수: {len(set(item.region_name for item in hpi_data if item.region_name))}개"
            )
            
            # 각 시도별 최신 데이터 샘플 로깅
            latest_by_region = {}
            for item in reversed(hpi_data):  # 최신부터
                if item.region_name and item.region_name not in latest_by_region:
                    latest_by_region[item.region_name] = item
            
            if latest_by_region:
                sample_regions = list(latest_by_region.items())[:5]  # 최대 5개만
                logger.info(
                    f" [Statistics HPI] 시도별 최신 데이터 샘플 - "
                    f"{', '.join([f'{r}: {d.date} {d.index_value}' for r, d in sample_regions])}"
                )
        
        region_desc = f"지역 ID {region_id}" if region_id else "전체 지역 평균"
        period_desc = f"{months}개월 ({hpi_data[0].date if hpi_data else 'N/A'} ~ {hpi_data[-1].date if hpi_data else 'N/A'})"
        
        response_data = HPIResponse(
            success=True,
            data=hpi_data,
            region_id=region_id,
            index_type=index_type,
            period=f"{region_desc}, {index_type}, {period_desc}"
        )
        
        # 캐시에 저장 (TTL: 6시간)
        if len(hpi_data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        logger.info(f" [Statistics HPI] HPI 데이터 생성 완료 - 데이터 포인트 수: {len(hpi_data)}")
        
        return response_data
        
    except Exception as e:
        logger.error(f" [Statistics HPI] HPI 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HPI 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/hpi/heatmap",
    response_model=HPIHeatmapResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Statistics (통계)"],
    summary="주택가격지수(HPI) 히트맵 조회",
    description="""
    광역시/특별시/도별 주택가격지수를 히트맵 형식으로 조회합니다.
    
    각 도/시의 최신 HPI 값을 반환하여 지역별 가격 추이를 한눈에 비교할 수 있습니다.
    
    ### Query Parameters
    - `index_type`: 지수 유형 (APT: 아파트, HOUSE: 단독주택, ALL: 전체, 기본값: APT)
    """
)
async def get_hpi_heatmap(
    index_type: str = Query("APT", description="지수 유형: APT(아파트), HOUSE(단독주택), ALL(전체)"),
    db: AsyncSession = Depends(get_db)
):
    """
    주택가격지수(HPI) 히트맵 조회
    
    도/시별 최신 HPI 값을 조회합니다.
    """
    # 유효한 index_type 검증
    valid_index_types = ["APT", "HOUSE", "ALL"]
    if index_type not in valid_index_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 index_type입니다. 가능한 값: {', '.join(valid_index_types)}"
        )
    
    cache_key = build_cache_key("statistics", "hpi_heatmap", index_type)
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f" [Statistics HPI Heatmap] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f" [Statistics HPI Heatmap] HPI 히트맵 데이터 조회 시작 - "
            f"index_type: {index_type}"
        )
        
        # 현재 날짜 기준으로 최신 base_ym 찾기
        today = date.today()
        current_year = today.year
        current_month = today.month
        current_base_ym = f"{current_year:04d}{current_month:02d}"
        
        # 최신 base_ym부터 역순으로 찾기 (최대 12개월 전까지)
        found_base_ym = None
        for i in range(12):
            check_year = current_year
            check_month = current_month - i
            if check_month <= 0:
                check_year -= 1
                check_month += 12
            check_base_ym = f"{check_year:04d}{check_month:02d}"
            
            # 해당 base_ym에 데이터가 있는지 확인
            check_query = (
                select(func.count(HouseScore.index_id))
                .where(
                    and_(
                        HouseScore.is_deleted == False,
                        HouseScore.index_type == index_type,
                        HouseScore.base_ym == check_base_ym
                    )
                )
            )
            check_result = await db.execute(check_query)
            count = check_result.scalar() or 0
            
            if count > 0:
                found_base_ym = check_base_ym
                break
        
        if not found_base_ym:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="HPI 데이터를 찾을 수 없습니다."
            )
        
        logger.info(f" [Statistics HPI Heatmap] 사용할 base_ym: {found_base_ym}")
        
        # 도/시별로 그룹화하여 평균 HPI 계산
        query = (
            select(
                State.city_name,
                func.avg(HouseScore.index_value).label('index_value'),
                func.avg(HouseScore.index_change_rate).label('index_change_rate'),
                func.count(HouseScore.index_id).label('region_count')
            )
            .join(State, HouseScore.region_id == State.region_id)
            .where(
                and_(
                    HouseScore.is_deleted == False,
                    State.is_deleted == False,
                    HouseScore.index_type == index_type,
                    HouseScore.base_ym == found_base_ym
                )
            )
            .group_by(State.city_name)
            .order_by(State.city_name)
        )
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        # 데이터 포인트 생성
        heatmap_data = []
        for row in rows:
            city_name = row.city_name
            index_value = float(row.index_value) if row.index_value is not None else 0.0
            index_change_rate = float(row.index_change_rate) if row.index_change_rate is not None else None
            region_count = int(row.region_count) if row.region_count else 0
            
            heatmap_data.append(
                HPIHeatmapDataPoint(
                    city_name=city_name,
                    index_value=round(index_value, 2),
                    index_change_rate=round(index_change_rate, 2) if index_change_rate is not None else None,
                    base_ym=found_base_ym,
                    region_count=region_count
                )
            )
        
        # 도/시명 순으로 정렬
        heatmap_data.sort(key=lambda x: x.city_name)
        
        response_data = HPIHeatmapResponse(
            success=True,
            data=heatmap_data,
            index_type=index_type,
            base_ym=found_base_ym
        )
        
        # 캐시에 저장 (TTL: 6시간)
        if len(heatmap_data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        logger.info(f" [Statistics HPI Heatmap] HPI 히트맵 데이터 생성 완료 - 데이터 포인트 수: {len(heatmap_data)}")
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f" [Statistics HPI Heatmap] HPI 히트맵 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HPI 히트맵 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/summary",
    response_model=StatisticsSummaryResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Statistics (통계)"],
    summary="통계 요약 조회",
    description="""
    RVOL과 4분면 분류 데이터를 한 번에 조회합니다.
    """
)
async def get_statistics_summary(
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), rent(전월세)"),
    current_period_months: int = Query(6, ge=1, le=12, description="현재 기간 (개월, 최대 12)"),
    average_period_months: int = Query(6, ge=1, le=12, description="평균 계산 기간 (개월, 최대 12)"),
    quadrant_period_months: int = Query(2, ge=1, le=12, description="4분면 비교 기간 (개월, 최대 12)"),
    db: AsyncSession = Depends(get_db)
):
    """
    통계 요약 조회
    
    RVOL과 4분면 분류 데이터를 한 번에 조회합니다.
    """
    # 캐시 키 생성
    cache_key = build_cache_key(
        "statistics", "summary", transaction_type,
        str(current_period_months), str(average_period_months), str(quadrant_period_months)
    )
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f" [Statistics Summary] 캐시에서 반환")
        return cached_data
    
    # RVOL과 4분면 분류를 순차적으로 조회 (SQLAlchemy 세션 공유 문제 방지)
    rvol_response = await get_rvol(transaction_type, current_period_months, average_period_months, db)
    quadrant_response = await get_quadrant(quadrant_period_months, db)
    
    response_data = StatisticsSummaryResponse(
        success=True,
        rvol=rvol_response,
        quadrant=quadrant_response
    )
    
    # 캐시에 저장 (TTL: 6시간)
    await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
    logger.info(f" [Statistics Summary] 캐시 저장 완료")
    
    return response_data


# 주의: 이 엔드포인트는 더 이상 사용되지 않습니다.
# population_movements 테이블 구조가 변경되어 출발지→도착지 매트릭스 구조로 변경되었습니다.
# Sankey Diagram은 /api/v1/statistics/population-flow 엔드포인트를 사용하세요.
# 
# @router.get(
#     "/population-movements",
#     response_model=PopulationMovementResponse,
#     status_code=status.HTTP_200_OK,
#     tags=[" Statistics (통계)"],
#     summary="인구 이동 데이터 조회 (비활성화됨)",
#     description="""
#     이 엔드포인트는 더 이상 사용되지 않습니다.
#     population_movements 테이블 구조가 변경되어 출발지→도착지 매트릭스 구조로 변경되었습니다.
#     Sankey Diagram은 /api/v1/statistics/population-flow 엔드포인트를 사용하세요.
#     """
# )
# async def get_population_movements(...):
#     pass

# 임시로 빈 응답 반환 (하위 호환성)
@router.get(
    "/population-movements",
    response_model=PopulationMovementResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Statistics (통계)"],
    summary="인구 이동 데이터 조회 (비활성화됨)",
    description="""
     이 엔드포인트는 더 이상 사용되지 않습니다.
    
    population_movements 테이블 구조가 변경되어 출발지→도착지 매트릭스 구조로 변경되었습니다.
    Sankey Diagram은 `/api/v1/statistics/population-flow` 엔드포인트를 사용하세요.
    """
)
async def get_population_movements(
    region_id: Optional[int] = Query(None, description="지역 ID (선택)"),
    start_ym: Optional[str] = Query(None, description="시작 년월 (YYYYMM)"),
    end_ym: Optional[str] = Query(None, description="종료 년월 (YYYYMM)"),
    db: AsyncSession = Depends(get_db)
):
    """
    인구 이동 데이터 조회 (비활성화됨)
    
    이 엔드포인트는 더 이상 사용되지 않습니다.
    population_movements 테이블 구조가 변경되어 출발지→도착지 매트릭스 구조로 변경되었습니다.
    """
    try:
        # 빈 응답 반환 (하위 호환성)
        logger.warning(
            f" [Statistics Population Movement] 이 엔드포인트는 더 이상 사용되지 않습니다. "
            f"/api/v1/statistics/population-flow를 사용하세요."
        )
        
        return PopulationMovementResponse(
            success=True,
            data=[],
            period=""
        )
        
    except Exception as e:
        logger.error(f" 인구 이동 데이터 조회 실패: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"인구 이동 데이터 조회 실패: {str(e)}"
        )


# ============================================================
# 주택 수요 페이지용 새로운 API
# ============================================================

@router.get(
    "/hpi/by-region-type",
    response_model=HPIRegionTypeResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Statistics (통계)"],
    summary="지역 유형별 주택 가격 지수 조회",
    description="""
    지역 유형별로 주택 가격 지수를 조회합니다.
    
    ### Query Parameters
    - `region_type`: 지역 유형 (required)
    - `index_type`: 지수 유형 (optional, 기본값: "APT")
    - `base_ym`: 기준 년월 (optional, 기본값: 최신)
    """
)
async def get_hpi_by_region_type(
    region_type: str = Query(..., description="지역 유형: 전국, 수도권, 지방5대광역시"),
    index_type: str = Query("APT", description="지수 유형: APT(아파트), HOUSE(단독주택), ALL(전체)"),
    base_ym: Optional[str] = Query(None, description="기준 년월 (YYYYMM, 기본값: 최신)"),
    db: AsyncSession = Depends(get_db)
):
    """
    지역 유형별 주택 가격 지수 조회
    """
    # 유효성 검증
    valid_region_types = ["전국", "수도권", "지방5대광역시"]
    if region_type not in valid_region_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 region_type입니다. 가능한 값: {', '.join(valid_region_types)}"
        )
    
    valid_index_types = ["APT", "HOUSE", "ALL"]
    if index_type not in valid_index_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 index_type입니다. 가능한 값: {', '.join(valid_index_types)}"
        )
    
    cache_key = build_cache_key(
        "statistics", "hpi-by-region-type", region_type, index_type,
        base_ym if base_ym else "latest"
    )
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f" [Statistics HPI Region Type] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f" [Statistics HPI Region Type] HPI 데이터 조회 시작 - "
            f"region_type: {region_type}, index_type: {index_type}, base_ym: {base_ym}"
        )
        
        # base_ym이 없으면 최신 데이터 찾기
        if not base_ym:
            today = date.today()
            current_year = today.year
            current_month = today.month
            
            # 최신 base_ym 찾기 (최대 12개월 전까지)
            found_base_ym = None
            for i in range(12):
                check_year = current_year
                check_month = current_month - i
                if check_month <= 0:
                    check_year -= 1
                    check_month += 12
                check_base_ym = f"{check_year:04d}{check_month:02d}"
                
                # 해당 base_ym에 데이터가 있는지 확인
                check_query = (
                    select(func.count(HouseScore.index_id))
                    .where(
                        and_(
                            HouseScore.is_deleted == False,
                            HouseScore.index_type == index_type,
                            HouseScore.base_ym == check_base_ym
                        )
                    )
                )
                check_result = await db.execute(check_query)
                count = check_result.scalar() or 0
                
                if count > 0:
                    found_base_ym = check_base_ym
                    break
            
            if not found_base_ym:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="HPI 데이터를 찾을 수 없습니다."
                )
            
            base_ym = found_base_ym
        
        # 지역 필터 조건
        region_filter = get_region_type_filter(region_type)
        
        # 수도권의 경우 시/군 단위로 그룹화, 그 외는 시도 단위로 그룹화
        if region_type == "수도권":
            # 수도권: 시/군 단위로 그룹화 (서울특별시는 "서울", 인천광역시는 "인천", 경기도는 시/군명)
            query = (
                select(
                    State.city_name,
                    State.region_name,
                    func.avg(HouseScore.index_value).label('index_value'),
                    func.avg(HouseScore.index_change_rate).label('index_change_rate'),
                    func.count(HouseScore.index_id).label('region_count')
                )
                .join(State, HouseScore.region_id == State.region_id)
                .where(
                    and_(
                        HouseScore.is_deleted == False,
                        State.is_deleted == False,
                        HouseScore.index_type == index_type,
                        HouseScore.base_ym == base_ym
                    )
                )
                .group_by(State.city_name, State.region_name)
            )
            
            # 지역 필터 적용
            if region_filter is not None:
                query = query.where(region_filter)
            
            query = query.order_by(State.city_name, State.region_name)
            
            result = await db.execute(query)
            rows = result.fetchall()
            
            # 응답 데이터 생성: 시/군 단위
            # 구 단위 데이터를 시/군 단위로 집계
            region_data_map: Dict[str, Dict[str, Any]] = {}
            fallback_data_map: Dict[str, Dict[str, Any]] = {}  # 예외처리용: 리, 포, 기흥 데이터 저장
            
            for row in rows:
                city_name = row.city_name
                region_name = row.region_name or ""
                
                # 서울특별시는 구 단위로 처리
                if city_name == '서울특별시':
                    # 구 이름 추출 (예: "강남구")
                    normalized_name = region_name
                else:
                    # 원본 region_name 확인 (예외처리용)
                    original_normalized = region_name.replace("시", "").replace("군", "").replace("구", "").strip()
                    
                    # 구 단위를 시/군 단위로 정규화 (예외처리 제외)
                    normalized_name = normalize_metropolitan_region_name_without_fallback(city_name, region_name)
                    
                    # 불완전한 이름 필터링 (1글자 또는 이상한 데이터)
                    if len(normalized_name) <= 1 or normalized_name == "흥":
                        continue
                    
                    # "경기도" 같은 도 단위 데이터 제외
                    if normalized_name == "경기도" or normalized_name == "경기":
                        continue
                    
                    # 예외처리용 데이터 저장 (리, 포, 기흥)
                    if original_normalized == "리":
                        if "리" not in fallback_data_map:
                            fallback_data_map["리"] = {
                                "total_value": float(row.index_value or 0) * (row.region_count or 0),
                                "total_count": (row.region_count or 0),
                                "index_change_rate": float(row.index_change_rate) if row.index_change_rate is not None else None
                            }
                        else:
                            fallback_data_map["리"]["total_value"] += float(row.index_value or 0) * (row.region_count or 0)
                            fallback_data_map["리"]["total_count"] += (row.region_count or 0)
                        continue
                    elif original_normalized == "포":
                        if "포" not in fallback_data_map:
                            fallback_data_map["포"] = {
                                "total_value": float(row.index_value or 0) * (row.region_count or 0),
                                "total_count": (row.region_count or 0),
                                "index_change_rate": float(row.index_change_rate) if row.index_change_rate is not None else None
                            }
                        else:
                            fallback_data_map["포"]["total_value"] += float(row.index_value or 0) * (row.region_count or 0)
                            fallback_data_map["포"]["total_count"] += (row.region_count or 0)
                        continue
                    elif original_normalized == "기흥":
                        if "기흥" not in fallback_data_map:
                            fallback_data_map["기흥"] = {
                                "total_value": float(row.index_value or 0) * (row.region_count or 0),
                                "total_count": (row.region_count or 0),
                                "index_change_rate": float(row.index_change_rate) if row.index_change_rate is not None else None
                            }
                        else:
                            fallback_data_map["기흥"]["total_value"] += float(row.index_value or 0) * (row.region_count or 0)
                            fallback_data_map["기흥"]["total_count"] += (row.region_count or 0)
                        continue
                
                index_value = float(row.index_value or 0)
                index_change_rate = float(row.index_change_rate) if row.index_change_rate is not None else None
                region_count = row.region_count or 0
                
                # 같은 시/군의 데이터를 집계 (평균)
                if normalized_name not in region_data_map:
                    region_data_map[normalized_name] = {
                        "total_value": index_value * region_count,
                        "total_count": region_count,
                        "index_change_rate": index_change_rate,
                        "is_seoul_gu": city_name == '서울특별시' # 서울 구 표시
                    }
                else:
                    region_data_map[normalized_name]["total_value"] += index_value * region_count
                    region_data_map[normalized_name]["total_count"] += region_count
                    # index_change_rate는 첫 번째 값 사용 (또는 평균 계산 가능)
            
            # 예외처리: 구리, 군포, 시흥이 없는 경우에만 리, 포, 기흥 데이터 사용
            if "구리" not in region_data_map and "리" in fallback_data_map:
                region_data_map["구리"] = fallback_data_map["리"]
            if "군포" not in region_data_map and "포" in fallback_data_map:
                region_data_map["군포"] = fallback_data_map["포"]
            if "시흥" not in region_data_map and "기흥" in fallback_data_map:
                region_data_map["시흥"] = fallback_data_map["기흥"]
            
            # 집계된 데이터를 응답 형식으로 변환
            # 허용된 수도권 지역 목록
            allowed_metropolitan_regions = {
                "연천", "포천", "파주", "양주", "동두천", "가평", "고양", "의정부", 
                "남양주", "양평", "김포", "서울", "구리", "하남", "인천", "부천", 
                "광명", "과천", "광주", "시흥", "안양", "성남", "이천", "여주", 
                "안산", "군포", "의왕", "용인", "화성", "수원", "안성", "오산", "평택"
            }
            
            hpi_data = []
            for normalized_name, data in region_data_map.items():
                # 허용된 지역만 포함 (서울 구는 무조건 포함)
                if not data.get("is_seoul_gu") and normalized_name not in allowed_metropolitan_regions:
                    continue
                
                # 서울 구 데이터는 그대로 추가하되, 전체 '서울' 데이터는 제외 (중복 방지)
                if normalized_name == '서울' and any(d.get("is_seoul_gu") for d in region_data_map.values()):
                     continue

                avg_value = data["total_value"] / data["total_count"] if data["total_count"] > 0 else 0
                
                hpi_data.append(HPIRegionTypeDataPoint(
                    id=None,
                    name=normalized_name,
                    value=round(avg_value, 2),
                    index_change_rate=round(data["index_change_rate"], 2) if data["index_change_rate"] is not None else None
                ))
        else:
            # 전국, 지방5대광역시: 시도 레벨로 그룹화
            query = (
                select(
                    State.city_name,
                    func.avg(HouseScore.index_value).label('index_value'),
                    func.avg(HouseScore.index_change_rate).label('index_change_rate'),
                    func.count(HouseScore.index_id).label('region_count')
                )
                .join(State, HouseScore.region_id == State.region_id)
                .where(
                    and_(
                        HouseScore.is_deleted == False,
                        State.is_deleted == False,
                        HouseScore.index_type == index_type,
                        HouseScore.base_ym == base_ym
                    )
                )
                .group_by(State.city_name)
            )
            
            # 지역 필터 적용
            if region_filter is not None:
                query = query.where(region_filter)
            
            query = query.order_by(State.city_name)
            
            result = await db.execute(query)
            rows = result.fetchall()
            
            # 응답 데이터 생성: 시도 단위
            hpi_data = []
            for row in rows:
                city_name = row.city_name
                normalized_name = normalize_city_name(city_name)
                index_value = float(row.index_value or 0)
                index_change_rate = float(row.index_change_rate) if row.index_change_rate is not None else None
                
                hpi_data.append(HPIRegionTypeDataPoint(
                    id=None,
                    name=normalized_name,
                    value=round(index_value, 2),
                    index_change_rate=round(index_change_rate, 2) if index_change_rate is not None else None
                ))
        
        response_data = HPIRegionTypeResponse(
            success=True,
            data=hpi_data,
            region_type=region_type,
            index_type=index_type,
            base_ym=base_ym
        )
        
        # 캐시에 저장
        if len(hpi_data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        logger.info(f" [Statistics HPI Region Type] HPI 데이터 생성 완료 - 데이터 포인트 수: {len(hpi_data)}")
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f" [Statistics HPI Region Type] HPI 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HPI 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/transaction-volume",
    response_model=TransactionVolumeResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Statistics (통계)"],
    summary="거래량 조회 (월별 데이터)",
    description="""
    전국, 수도권, 지방5대광역시의 월별 거래량을 조회합니다.
    
    ### 지역 유형
    - **전국**: 전체 지역
    - **수도권**: 서울특별시, 경기도, 인천광역시
    - **지방5대광역시**: 부산광역시, 대구광역시, 광주광역시, 대전광역시, 울산광역시
    
    ### 데이터 형식
    - 월별 데이터를 반환합니다 (연도, 월, 거래량)
    - 지방5대광역시의 경우 `city_name` 필드가 포함됩니다
    - 프론트엔드에서 연도별 집계 또는 월별 뷰로 변환하여 사용합니다
    
    ### Query Parameters
    - `region_type`: 지역 유형 (필수) - "전국", "수도권", "지방5대광역시"
    - `transaction_type`: 거래 유형 (선택) - "sale"(매매), "rent"(전월세), 기본값: "sale"
    - `max_years`: 최대 연도 수 (선택) - 1~10, 기본값: 10
    """
)
async def get_transaction_volume(
    region_type: str = Query(..., description="지역 유형: 전국, 수도권, 지방5대광역시"),
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), rent(전월세)"),
    max_years: int = Query(10, ge=1, le=10, description="최대 연도 수 (1~10)"),
    db: AsyncSession = Depends(get_db)
):
    """
    거래량 조회 (월별 데이터)
    
    최근 N년치 월별 거래량 데이터를 반환합니다.
    프론트엔드에서 연도별 집계 또는 월별 뷰로 변환하여 사용합니다.
    """
    # 파라미터 검증
    if region_type not in ["전국", "수도권", "지방5대광역시"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 region_type: {region_type}. 허용 값: 전국, 수도권, 지방5대광역시"
        )
    
    if transaction_type not in ["sale", "rent"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 transaction_type: {transaction_type}. 허용 값: sale, rent"
        )
    
    # 통계 캐싱 서비스를 사용하여 캐시 조회 (모든 필터 조합 고려)
    city_name = None  # city_name 파라미터는 추후 추가 가능
    cache_key = statistics_cache_service.generate_cache_key(
        endpoint="transaction-volume",
        region_type=region_type,
        city_name=city_name,
        transaction_type=transaction_type,
        max_years=max_years
    )
    cached_data = await statistics_cache_service.get_cached_statistics(
        endpoint="transaction-volume",
        region_type=region_type,
        city_name=city_name,
        transaction_type=transaction_type,
        max_years=max_years
    )
    
    if cached_data is not None:
        # 캐시된 데이터의 연도 범위 확인 (디버깅용)
        if cached_data.get("data"):
            cached_years = sorted(set(int(item.get("year", 0)) for item in cached_data.get("data", [])), reverse=True)
            cached_data_count = len(cached_data.get("data", []))
            logger.warning(
                f" [Statistics Transaction Volume] 캐시 발견 (무시하고 DB 조회) - "
                f"region_type: {region_type}, "
                f"데이터 포인트 수: {cached_data_count}, "
                f"연도 범위: {cached_years[0] if cached_years else 'N/A'} ~ {cached_years[-1] if cached_years else 'N/A'}, "
                f"캐시 키: {cache_key}"
            )
            # 캐시 무시하고 DB에서 직접 조회 (디버깅용)
            # return cached_data
        else:
            logger.info(f" [Statistics Transaction Volume] 캐시에서 반환 (데이터 없음) - region_type: {region_type}, 캐시 키: {cache_key}")
            return cached_data
    
    try:
        logger.info(
            f" [Statistics Transaction Volume] 거래량 데이터 조회 시작 - "
            f"region_type: {region_type}, transaction_type: {transaction_type}, max_years: {max_years}"
        )
        
        # 현재 날짜 기준으로 연도 범위 계산
        current_date = date.today()
        start_year = current_date.year - max_years + 1
        start_date = date(start_year, 1, 1)
        end_date = current_date
        
        logger.info(
            f" [Statistics Transaction Volume] 날짜 범위 설정 - "
            f"start_date: {start_date}, end_date: {end_date}, "
            f"start_year: {start_year}, max_years: {max_years}"
        )
        
        # 거래 유형에 따른 테이블 및 필드 선택
        if transaction_type == "sale":
            trans_table = Sale
            date_field = Sale.contract_date
            base_filter = and_(
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.contract_date.isnot(None),
                # remarks 필터: 테스트 데이터가 모두 '더미'이므로 일단 제거
                # TODO: 실제 운영 데이터에서 더미 데이터 제외 필요 시 재활성화
                # or_(Sale.remarks != "더미", Sale.remarks.is_(None)),
                Sale.contract_date >= start_date,
                Sale.contract_date <= end_date
            )
        else:  # rent
            trans_table = Rent
            date_field = Rent.deal_date
            base_filter = and_(
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deal_date.isnot(None),
                # remarks 필터: 테스트 데이터가 모두 '더미'이므로 일단 제거
                # TODO: 실제 운영 데이터에서 더미 데이터 제외 필요 시 재활성화
                # or_(Rent.remarks != "더미", Rent.remarks.is_(None)),
                Rent.deal_date >= start_date,
                Rent.deal_date <= end_date
            )
        
        # 디버깅: 실제 DB에 존재하는 최신 데이터 연도 확인 (필터 전)
        max_date_query_all = select(
            func.max(date_field).label('max_date'),
            func.min(date_field).label('min_date'),
            func.count().label('total_count')
        ).select_from(trans_table).where(
            and_(
                trans_table.is_canceled == False if transaction_type == "sale" else True,
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                date_field.isnot(None)
            )
        )
        max_date_result_all = await db.execute(max_date_query_all)
        max_date_row_all = max_date_result_all.first()
        
        # 디버깅: remarks 값 분포 확인
        remarks_dist_query = select(
            trans_table.remarks,
            func.count().label('count')
        ).select_from(trans_table).where(
            and_(
                trans_table.is_canceled == False if transaction_type == "sale" else True,
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                date_field.isnot(None),
                date_field >= start_date,
                date_field <= end_date
            )
        ).group_by(trans_table.remarks).limit(10)
        remarks_dist_result = await db.execute(remarks_dist_query)
        remarks_dist_rows = remarks_dist_result.all()
        remarks_dist = {row.remarks or 'NULL': row.count for row in remarks_dist_rows}
        logger.info(
            f" [Statistics Transaction Volume] remarks 값 분포 확인 - "
            f"{remarks_dist}"
        )
        
        # 디버깅: 필터 적용 후 데이터 확인 (remarks 필터 제외)
        max_date_query_no_remarks = select(
            func.max(date_field).label('max_date'),
            func.min(date_field).label('min_date'),
            func.count().label('total_count')
        ).select_from(trans_table).where(
            and_(
                trans_table.is_canceled == False if transaction_type == "sale" else True,
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                date_field.isnot(None),
                date_field >= start_date,
                date_field <= end_date
            )
        )
        max_date_result_no_remarks = await db.execute(max_date_query_no_remarks)
        max_date_row_no_remarks = max_date_result_no_remarks.first()
        
        # 디버깅: base_filter 적용 후 데이터 확인 (remarks 필터 제거됨)
        max_date_query = select(
            func.max(date_field).label('max_date'),
            func.min(date_field).label('min_date'),
            func.count().label('total_count')
        ).select_from(trans_table).where(
            and_(
                trans_table.is_canceled == False if transaction_type == "sale" else True,
                (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
                date_field.isnot(None),
                # remarks 필터 제거됨 (테스트 데이터가 모두 '더미')
                date_field >= start_date,
                date_field <= end_date
            )
        )
        max_date_result = await db.execute(max_date_query)
        max_date_row = max_date_result.first()
        
        if max_date_row_all:
            logger.info(
                f" [Statistics Transaction Volume] DB 전체 데이터 범위 (필터 전) - "
                f"최신 날짜: {max_date_row_all.max_date}, "
                f"최 old 날짜: {max_date_row_all.min_date}, "
                f"전체 거래 수: {max_date_row_all.total_count}"
            )
        
        if max_date_row_no_remarks:
            logger.info(
                f" [Statistics Transaction Volume] DB 데이터 범위 (remarks 필터 제외) - "
                f"최신 날짜: {max_date_row_no_remarks.max_date}, "
                f"최 old 날짜: {max_date_row_no_remarks.min_date}, "
                f"거래 수: {max_date_row_no_remarks.total_count}"
            )
        
        if max_date_row and max_date_row.max_date:
            logger.info(
                f" [Statistics Transaction Volume] DB 실제 데이터 범위 (base_filter 적용) - "
                f"최신 날짜: {max_date_row.max_date}, "
                f"최 old 날짜: {max_date_row.min_date}, "
                f"필터링된 거래 수: {max_date_row.total_count}, "
                f"날짜 범위: {start_date} ~ {end_date}"
            )
            
            # 날짜 범위와 실제 데이터 범위 비교
            if max_date_row.min_date and max_date_row.min_date > start_date:
                logger.warning(
                    f" [Statistics Transaction Volume] 날짜 범위 불일치 - "
                    f"요청한 시작 날짜: {start_date}, "
                    f"실제 데이터 최소 날짜: {max_date_row.min_date}, "
                    f"차이: {(max_date_row.min_date - start_date).days}일"
                )
        
        # 지역 필터링 조건 가져오기
        region_filter = get_region_type_filter(region_type)
        
        # 디버깅: 실제 데이터 존재 여부 확인 (수도권, 지방5대광역시)
        if region_type in ["수도권", "지방5대광역시"]:
            debug_query = select(
                extract('year', date_field).label('year'),
                func.count().label('count')
            ).select_from(
                trans_table
            ).join(
                Apartment, trans_table.apt_id == Apartment.apt_id
            ).join(
                State, Apartment.region_id == State.region_id
            ).where(
                and_(base_filter, region_filter)
            ).group_by(
                extract('year', date_field)
            ).order_by(
                desc(extract('year', date_field))
            )
            debug_result = await db.execute(debug_query)
            debug_rows = debug_result.all()
            debug_years = [int(row.year) for row in debug_rows[:10]]  # 최신 10개 연도
            logger.info(
                f" [Statistics Transaction Volume] {region_type} 실제 데이터 연도 확인 - "
                f"최신 연도: {debug_years[0] if debug_years else 'N/A'}, "
                f"연도 목록: {debug_years}, "
                f"총 {len(debug_rows)}개 연도 데이터 존재"
            )
            
            # JOIN 전 데이터 확인 (디버깅용) - 항상 실행
            # JOIN 없이 거래 데이터만 확인
            no_join_query = select(
                extract('year', date_field).label('year'),
                func.count().label('count')
            ).select_from(
                trans_table
            ).where(
                base_filter
            ).group_by(
                extract('year', date_field)
            ).order_by(
                desc(extract('year', date_field))
            )
            no_join_result = await db.execute(no_join_query)
            no_join_rows = no_join_result.all()
            no_join_years = [int(row.year) for row in no_join_rows[:10]]
            
            if len(debug_rows) == 0 and len(no_join_rows) > 0:
                logger.warning(
                    f" [Statistics Transaction Volume] {region_type} JOIN으로 인한 데이터 손실 확인 - "
                    f"JOIN 전: {len(no_join_rows)}개 연도 (최신: {no_join_years[0] if no_join_years else 'N/A'}), "
                    f"JOIN 후: 0개 연도 (JOIN 조건 문제 가능성)"
                )
            elif len(debug_rows) > 0:
                logger.info(
                    f" [Statistics Transaction Volume] {region_type} JOIN 전/후 데이터 비교 - "
                    f"JOIN 전: {len(no_join_rows)}개 연도, JOIN 후: {len(debug_rows)}개 연도"
                )
        
        # 쿼리 구성
        if region_type == "전국":
            # 전국: JOIN 없이 거래 테이블만 사용
            # 디버깅: 전국 쿼리 전에 base_filter 적용 결과 확인
            debug_national_query = select(
                extract('year', date_field).label('year'),
                func.count().label('count')
            ).select_from(
                trans_table
            ).where(
                base_filter
            ).group_by(
                extract('year', date_field)
            ).order_by(
                desc(extract('year', date_field))
            )
            debug_national_result = await db.execute(debug_national_query)
            debug_national_rows = debug_national_result.all()
            debug_national_years = [int(row.year) for row in debug_national_rows]
            logger.info(
                f" [Statistics Transaction Volume] 전국 base_filter 적용 후 연도 확인 - "
                f"연도 목록: {debug_national_years[:10]}, "
                f"총 {len(debug_national_rows)}개 연도"
            )
            
            query = select(
                extract('year', date_field).label('year'),
                extract('month', date_field).label('month'),
                func.count().label('volume')
            ).select_from(
                trans_table
            ).where(
                base_filter
            ).group_by(
                extract('year', date_field),
                extract('month', date_field)
            ).order_by(
                desc(extract('year', date_field)),
                extract('month', date_field)
            )
        elif region_type == "지방5대광역시":
            # 지방5대광역시: city_name 포함하여 그룹화
            # 디버깅: 지방5대광역시 JOIN 전 데이터 확인
            debug_local_before_join = select(
                extract('year', date_field).label('year'),
                func.count().label('count')
            ).select_from(
                trans_table
            ).where(
                base_filter
            ).group_by(
                extract('year', date_field)
            ).order_by(
                desc(extract('year', date_field))
            )
            debug_local_before_result = await db.execute(debug_local_before_join)
            debug_local_before_rows = debug_local_before_result.all()
            debug_local_before_years = [int(row.year) for row in debug_local_before_rows]
            logger.info(
                f" [Statistics Transaction Volume] 지방5대광역시 JOIN 전 연도 확인 - "
                f"연도 목록: {debug_local_before_years[:10]}, "
                f"총 {len(debug_local_before_rows)}개 연도"
            )
            
            query = select(
                extract('year', date_field).label('year'),
                extract('month', date_field).label('month'),
                State.city_name.label('city_name'),
                func.count().label('volume')
            ).select_from(
                trans_table
            ).join(
                Apartment, trans_table.apt_id == Apartment.apt_id
            ).join(
                State, Apartment.region_id == State.region_id
            ).where(
                and_(base_filter, region_filter)
            ).group_by(
                extract('year', date_field),
                extract('month', date_field),
                State.city_name
            ).order_by(
                desc(extract('year', date_field)),
                extract('month', date_field),
                State.city_name
            )
        else:  # 수도권
            # 수도권: JOIN 사용하지만 city_name은 그룹화하지 않음
            query = select(
                extract('year', date_field).label('year'),
                extract('month', date_field).label('month'),
                func.count().label('volume')
            ).select_from(
                trans_table
            ).join(
                Apartment, trans_table.apt_id == Apartment.apt_id
            ).join(
                State, Apartment.region_id == State.region_id
            ).where(
                and_(base_filter, region_filter)
            ).group_by(
                extract('year', date_field),
                extract('month', date_field)
            ).order_by(
                desc(extract('year', date_field)),
                extract('month', date_field)
            )
        
        # 쿼리 실행
        result = await db.execute(query)
        rows = result.all()
        
        logger.info(
            f" [Statistics Transaction Volume] 쿼리 결과 - "
            f"총 {len(rows)}개 행 반환, region_type: {region_type}"
        )
        
        # 데이터가 없을 때 상세 디버깅 정보 출력
        if len(rows) == 0 and region_type in ["수도권", "지방5대광역시"]:
            # JOIN 없이 전체 거래 데이터 확인
            total_count_query = select(func.count()).select_from(trans_table).where(base_filter)
            total_result = await db.execute(total_count_query)
            total_count = total_result.scalar() or 0
            
            logger.warning(
                f" [Statistics Transaction Volume] {region_type} 데이터 없음 - "
                f"base_filter 적용 후 전체 거래 수: {total_count}, "
                f"JOIN 후 데이터: 0개 (JOIN 조건 문제 가능성 높음)"
            )
        
        # 연도별 데이터 존재 여부 확인 (디버깅용)
        if rows:
            years = sorted(set(int(row.year) for row in rows), reverse=True)
            logger.info(
                f" [Statistics Transaction Volume] DB 쿼리 결과 - "
                f"region_type: {region_type}, "
                f"데이터 행 수: {len(rows)}, "
                f"연도 범위: {years[0] if years else 'N/A'} ~ {years[-1] if years else 'N/A'}, "
                f"전체 연도: {years[:10] if len(years) <= 10 else years[:10] + ['...']}"
            )
        
        # 데이터 포인트 생성
        data_points = []
        for row in rows:
            data_point = TransactionVolumeDataPoint(
                year=int(row.year),
                month=int(row.month),
                volume=int(row.volume),
                city_name=row.city_name if hasattr(row, 'city_name') and row.city_name else None
            )
            data_points.append(data_point)
        
        # 기간 문자열 생성
        period_str = f"{start_date.strftime('%Y-%m')} ~ {end_date.strftime('%Y-%m')}"
        
        # 응답 생성
        response_data = TransactionVolumeResponse(
            success=True,
            data=data_points,
            region_type=region_type,
            period=period_str,
            max_years=max_years
        )
        
        # 통계 캐싱 서비스를 사용하여 캐시 저장 (모든 필터 조합 고려)
        if len(data_points) > 0:
            await statistics_cache_service.cache_statistics(
                endpoint="transaction-volume",
                data=response_data.model_dump(),
                region_type=region_type,
                city_name=city_name,
                transaction_type=transaction_type,
                max_years=max_years,
                ttl=STATISTICS_CACHE_TTL
            )
            logger.info(
                f" [Statistics Transaction Volume] 캐시 저장 완료 - "
                f"region_type: {region_type}, "
                f"연도 범위: {years[0] if years else 'N/A'} ~ {years[-1] if years else 'N/A'}"
            )
        
        logger.info(
            f" [Statistics Transaction Volume] 거래량 데이터 생성 완료 - "
            f"데이터 포인트 수: {len(data_points)}, 기간: {period_str}"
        )
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f" [Statistics Transaction Volume] 거래량 데이터 조회 실패: {e}",
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"거래량 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


# ============================================================
# 시장 국면 지표 API
# ============================================================

@router.get(
    "/market-phase",
    response_model=Union[MarketPhaseResponse, MarketPhaseListResponse],
    summary="시장 국면 지표 조회",
    description="벌집 순환 모형(Honeycomb Cycle) 기반으로 시장 국면을 판별합니다."
)
async def get_market_phase(
    region_type: str = Query(..., description="지역 유형 (전국, 수도권, 지방5대광역시)"),
    volume_calculation_method: str = Query("average", description="거래량 계산 방법 (average, month_over_month)"),
    average_period_months: int = Query(6, ge=1, le=12, description="평균 계산 기간 (개월)"),
    volume_threshold: Optional[float] = Query(None, description="거래량 변동 임계값 (%)"),
    price_threshold: Optional[float] = Query(None, description="가격 변동 임계값 (%)"),
    min_transaction_count: int = Query(5, ge=1, description="최소 거래 건수"),
    db: AsyncSession = Depends(get_db)
):
    """
    시장 국면 지표 조회
    
    벌집 순환 모형(Honeycomb Cycle) 기반으로 시장 국면을 판별합니다.
    
    **6개 국면:**
    1. 회복 (Recovery): 거래량 증가 ↑ / 가격 하락 혹은 보합 →
    2. 상승 (Expansion): 거래량 증가 ↑ / 가격 상승 ↑
    3. 둔화 (Slowdown): 거래량 감소 ↓ / 가격 상승 ↑
    4. 후퇴 (Recession): 거래량 감소 ↓ / 가격 하락 ↓
    5. 침체 (Depression): 거래량 급감 ↓ / 가격 하락세 지속 ↓
    6. 천착 (Trough): 거래량 미세 증가 ↑ / 가격 하락 ↓
    """
    try:
        # 파라미터 검증
        if region_type not in ["전국", "수도권", "지방5대광역시"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"유효하지 않은 region_type: {region_type}. 허용 값: 전국, 수도권, 지방5대광역시"
            )
        
        if volume_calculation_method not in ["average", "month_over_month"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"유효하지 않은 volume_calculation_method: {volume_calculation_method}. 허용 값: average, month_over_month"
            )
        
        # 캐시 키 생성
        cache_key = build_cache_key(
            "statistics",
            "market-phase",
            region_type,
            volume_calculation_method,
            str(average_period_months),
            str(volume_threshold) if volume_threshold is not None else "default",
            str(price_threshold) if price_threshold is not None else "default",
            str(min_transaction_count)
        )
        
        # 캐시 확인
        cached_result = await get_from_cache(cache_key)
        if cached_result:
            logger.info(
                f"[Market Phase] Cache hit - region_type: {region_type}"
            )
            # 캐시된 결과에도 임계값이 포함되어 있지만, 로깅을 위해 확인
            if isinstance(cached_result, dict) and 'thresholds' in cached_result:
                thresholds = cached_result.get('thresholds', {})
                logger.info(
                    f"[Market Phase] Cached thresholds - "
                    f"vol={thresholds.get('volume_threshold')}, "
                    f"price={thresholds.get('price_threshold')}"
                )
            return cached_result
        
        # 임계값 조회 (응답에 사용될 임계값)
        vol_threshold, price_thresh = await get_thresholds(
            db, region_type, None, volume_threshold, price_threshold
        )
        
        logger.info(
            f"[Market Phase] Calculation started - "
            f"region_type: {region_type}, "
            f"volume_method: {volume_calculation_method}, "
            f"thresholds: vol={vol_threshold}, price={price_thresh} "
            f"(API params: vol={volume_threshold}, price={price_threshold})"
        )
        
        # 전국/수도권: 단일 데이터
        if region_type in ["전국", "수도권"]:
            # 거래량 변동률 계산
            if volume_calculation_method == "average":
                volume_change_rate, current_volume = await calculate_volume_change_rate_average(
                    db, region_type, None, average_period_months
                )
            else:
                volume_change_rate, current_volume = await calculate_volume_change_rate_mom(
                    db, region_type, None
                )
            
            # 가격 변동률 계산
            price_change_rate = await calculate_price_change_rate_moving_average(
                db, region_type, None
            )
            
            # 국면 판별
            phase_data = calculate_market_phase(
                volume_change_rate,
                price_change_rate,
                current_volume,
                min_transaction_count,
                vol_threshold,
                price_thresh
            )
            
            # 응답 생성
            response = MarketPhaseResponse(
                success=True,
                data=MarketPhaseDataPoint(
                    region=None,
                    volume_change_rate=volume_change_rate,
                    price_change_rate=price_change_rate,
                    **phase_data
                ),
                calculation_method=MarketPhaseCalculationMethod(
                    volume_method=volume_calculation_method,
                    average_period_months=average_period_months if volume_calculation_method == "average" else None,
                    price_method="moving_average_3months"
                ),
                thresholds=MarketPhaseThresholds(
                    volume_threshold=vol_threshold,
                    price_threshold=price_thresh
                )
            )
            
            # 캐시 저장 (TTL: 1시간)
            await set_to_cache(cache_key, response.dict(), ttl=3600)
            
            logger.info(
                f"[Market Phase] Calculation completed - "
                f"region_type: {region_type}, "
                f"phase: {phase_data.get('phase')}, "
                f"phase_label: {phase_data.get('phase_label')}, "
                f"Response thresholds: vol={vol_threshold}, price={price_thresh}"
            )
            
            return response
        
        # 지방5대광역시: 지역별 데이터
        else:
            regions = ['부산광역시', '대구광역시', '광주광역시', '대전광역시', '울산광역시']
            data_list = []
            
            # 순차 처리로 변경 (SQLAlchemy AsyncSession은 동시 쿼리 불가)
            # 병렬 처리는 같은 세션을 공유하면 세션 충돌 발생
            for region in regions:
                logger.info(
                    f"[Market Phase] Region calculation started - region: {region}"
                )
                
                # 거래량 변동률 계산
                if volume_calculation_method == "average":
                    volume_change_rate, current_volume = await calculate_volume_change_rate_average(
                        db, region_type, region, average_period_months
                    )
                else:
                    volume_change_rate, current_volume = await calculate_volume_change_rate_mom(
                        db, region_type, region
                    )
                
                # 가격 변동률 계산
                price_change_rate = await calculate_price_change_rate_moving_average(
                    db, region_type, region
                )
                
                # 지역별 임계값 조회 (지방5대광역시는 각 지역별로 동일한 임계값 사용)
                # region_name은 정규화된 이름 사용 (예: "광주" 대신 "광주광역시")
                region_vol_threshold, region_price_thresh = await get_thresholds(
                    db, region_type, region, volume_threshold, price_threshold
                )
                
                # 국면 판별
                phase_data = calculate_market_phase(
                    volume_change_rate,
                    price_change_rate,
                    current_volume,
                    min_transaction_count,
                    region_vol_threshold,
                    region_price_thresh
                )
                
                # 지역명 정규화
                normalized_region = normalize_city_name(region)
                
                data_list.append(
                    MarketPhaseDataPoint(
                        region=normalized_region,
                        volume_change_rate=volume_change_rate,
                        price_change_rate=price_change_rate,
                        **phase_data
                    )
                )
                
                logger.info(
                    f" [Market Phase] 지역 계산 완료 - "
                    f"region: {region}, "
                    f"phase: {phase_data.get('phase')}, "
                    f"volume: {current_volume}"
                )
            
            # 지방5대광역시는 지역별로 동일한 임계값 사용 (1.7%, 0.4%)
            # vol_threshold, price_thresh는 이미 get_thresholds에서 지방5대광역시 기본값으로 설정됨
            # 응답에 사용된 임계값 로깅
            logger.info(
                f"[Market Phase] Response thresholds for 지방5대광역시 - "
                f"volume_threshold: {vol_threshold}, price_threshold: {price_thresh}"
            )
            
            response = MarketPhaseListResponse(
                success=True,
                data=data_list,
                region_type=region_type,
                calculation_method=MarketPhaseCalculationMethod(
                    volume_method=volume_calculation_method,
                    average_period_months=average_period_months if volume_calculation_method == "average" else None,
                    price_method="moving_average_3months"
                ),
                thresholds=MarketPhaseThresholds(
                    volume_threshold=vol_threshold,  # 지방5대광역시: 1.7%
                    price_threshold=price_thresh     # 지방5대광역시: 0.4%
                )
            )
            
            # 캐시 저장 (TTL: 1시간)
            await set_to_cache(cache_key, response.dict(), ttl=3600)
            
            logger.info(
                f" [Market Phase] 계산 완료 - "
                f"region_type: {region_type}, "
                f"지역 수: {len(data_list)}"
            )
            
            return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f" [Market Phase] 시장 국면 지표 조회 실패: {e}",
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"시장 국면 지표 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/population-flow",
    response_model=PopulationMovementSankeyResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Statistics (통계)"],
    summary="인구 이동 Sankey 조회",
    description="지역별 인구 이동 Sankey Diagram 데이터를 조회합니다 (서울, 경인, 충청, 대전, 경상, 대구, 부산, 울산, 강원, 제주)."
)
async def get_population_flow_sankey(
    period_months: int = Query(3, ge=1, le=12, description="조회 기간 (개월, 최근 데이터 기준)"),
    raw: bool = Query(False, description="원시 데이터 반환 (그룹화 없이 city_name 레벨)"),
    db: AsyncSession = Depends(get_db)
):
    """
    인구 이동 Sankey 데이터 조회
    
    최근 데이터(base_ym)를 기준으로 지정된 그룹별 인구 이동 흐름을 반환합니다.
    
    raw=True인 경우 원시 데이터(city_name 레벨)를 반환하여 프론트엔드에서 그룹화할 수 있습니다.
    """
    cache_key = build_cache_key("statistics", "population_flow", str(period_months), "raw" if raw else "grouped")
    
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f" [Statistics Sankey] 캐시에서 반환")
        return cached_data
        
    try:
        # 1. 최신 base_ym 찾기
        stmt = select(func.max(PopulationMovement.base_ym)).where(
            PopulationMovement.is_deleted == False
        )
        result = await db.execute(stmt)
        latest_base_ym = result.scalar()
        
        if not latest_base_ym:
             # 데이터가 없으면 빈 응답
             return PopulationMovementSankeyResponse(
                 success=True,
                 nodes=[],
                 links=[],
                 base_ym="",
                 region_type="전국"
             )
             
        # 2. 데이터 조회
        # State 테이블을 두 번 조인 (From, To)
        FromRegion = aliased(State)
        ToRegion = aliased(State)
        
        query = select(
            PopulationMovement.movement_count,
            FromRegion.city_name.label("from_city"),
            FromRegion.region_name.label("from_region_name"),
            ToRegion.city_name.label("to_city"),
            ToRegion.region_name.label("to_region_name")
        ).join(
            FromRegion, PopulationMovement.from_region_id == FromRegion.region_id
        ).join(
            ToRegion, PopulationMovement.to_region_id == ToRegion.region_id
        ).where(
            and_(
                PopulationMovement.base_ym == latest_base_ym,
                PopulationMovement.is_deleted == False
            )
        )
        
        result = await db.execute(query)
        rows = result.all()
        
        # raw=True인 경우 원시 데이터 반환 (프론트엔드에서 그룹화)
        if raw:
            # 원시 데이터를 그대로 반환 (city_name 레벨, 단 서울은 구 단위)
            links = []
            active_nodes = set()
            city_colors = {
                '서울특별시': '#3182F6',
                '인천광역시': '#60A5FA',
                '경기도': '#60A5FA',
                '충청북도': '#10B981',
                '충청남도': '#10B981',
                '세종특별자치시': '#10B981',
                '대전광역시': '#059669',
                '강원특별자치도': '#8B5CF6',
                '강원도': '#8B5CF6',
                '경상북도': '#F43F5E',
                '경상남도': '#F43F5E',
                '대구광역시': '#E11D48',
                '울산광역시': '#F59E0B',
                '부산광역시': '#9F1239',
                '제주특별자치도': '#FCD34D',
                '제주도': '#FCD34D',
                '광주광역시': '#EC4899',
                '전북특별자치도': '#A855F7',
                '전라북도': '#A855F7',
                '전라남도': '#A855F7',
            }
            
            flow_counts = defaultdict(int)
            
            # 서울 구 단위 색상 매핑 (임시)
            seoul_gu_colors = '#3182F6'; 

            for row in rows:
                # 서울특별시는 구 단위로, 그 외는 시도 단위로
                from_city = row.from_city
                from_region_name = row.from_region_name
                
                to_city = row.to_city
                to_region_name = row.to_region_name

                # 출발지 이름 결정
                if from_city == '서울특별시':
                    # 구 이름만 사용 (예: "강남구")
                    src = from_region_name
                else:
                    src = from_city
                
                # 도착지 이름 결정
                if to_city == '서울특별시':
                    # 구 이름만 사용
                    dst = to_region_name
                else:
                    dst = to_city
                
                count = row.movement_count
                flow_counts[(src, dst)] += count
            
            for (src, dst), count in flow_counts.items():
                if count > 0:
                    links.append(PopulationMovementSankeyDataPoint(
                        from_region=src,
                        to_region=dst,
                        value=count
                    ))
                    active_nodes.add(src)
                    active_nodes.add(dst)
            
            nodes = []
            for node_name in sorted(active_nodes):
                # 노드 색상 결정
                color = '#94A3B8' # 기본값
                
                # 서울 구 이름인지 확인 (단순하게 '구'로 끝나면 서울 색상 부여 - 완벽하진 않지만 시각적 구분용)
                if node_name.endswith('구') and not node_name.startswith('대구') and not node_name.startswith('북구') and not node_name.startswith('남구') and not node_name.startswith('동구') and not node_name.startswith('서구') and not node_name.startswith('중구'): 
                     # 주의: 부산/대구 등의 구와 겹칠 수 있으나, 위 로직에서 서울 외에는 시도명을 썼으므로 
                     # 여기서 '구'로 끝나는건 서울 구일 확률이 높음. 
                     # (단, 데이터상 광역시의 구 정보가 넘어오지 않도록 위에서 처리했음)
                     color = seoul_gu_colors
                elif node_name in city_colors:
                    color = city_colors[node_name]
                
                nodes.append(SankeyNode(
                    id=node_name,
                    name=node_name,
                    color=color
                ))
            
            response = PopulationMovementSankeyResponse(
                success=True,
                nodes=nodes,
                links=links,
                base_ym=latest_base_ym,
                region_type="전국"
            )
            
            await set_to_cache(cache_key, response.dict(), ttl=STATISTICS_CACHE_TTL)
            return response
        
        # 3. 그룹 매핑 및 집계 (사용자 요청: 10개 지역 그룹)
        group_map = {
            '서울특별시': '서울',
            '인천광역시': '경인',
            '경기도': '경인',
            '충청북도': '충청',
            '충청남도': '충청',
            '세종특별자치시': '충청',
            '대전광역시': '대전',
            '강원특별자치도': '강원',
            '강원도': '강원',
            '경상북도': '경상',
            '경상남도': '경상',
            '대구광역시': '대구',
            '울산광역시': '울산',
            '부산광역시': '부산',
            '제주특별자치도': '제주',
            '제주도': '제주',
            # 기타 지역은 제외하거나 '기타'로 매핑
            '광주광역시': '기타',
            '전북특별자치도': '기타',
            '전라북도': '기타',
            '전라남도': '기타'
        }
        
        # 색상 매핑 (10개 지역 그룹별 고유 색상)
        colors = {
            '서울': '#3182F6',   # Blue
            '경인': '#60A5FA',   # Light Blue
            '충청': '#10B981',   # Emerald
            '대전': '#059669',   # Dark Emerald
            '경상': '#F43F5E',   # Rose
            '대구': '#E11D48',   # Dark Rose
            '부산': '#9F1239',   # Rose 900
            '울산': '#F59E0B',   # Amber
            '강원': '#8B5CF6',   # Violet
            '제주': '#FCD34D',   # Yellow
            '기타': '#94A3B8'    # Slate
        }
        
        # 집계: (from_group, to_group) -> count
        flow_counts = defaultdict(int)
        
        for row in rows:
            from_city = row.from_city
            to_city = row.to_city
            count = row.movement_count
            
            from_group = group_map.get(from_city, '기타')
            to_group = group_map.get(to_city, '기타')
            
            # 같은 그룹 내 이동은 제외하지 않음 (사용자 요청: 지역별로 구별되는 색으로 표시)
            # 단, '기타' 그룹은 제외
            if from_group == '기타' or to_group == '기타':
                continue
                
            flow_counts[(from_group, to_group)] += count
            
        # 4. 링크 및 노드 생성
        links = []
        active_nodes = set()
        
        for (src, dst), count in flow_counts.items():
            if count > 0:
                links.append(PopulationMovementSankeyDataPoint(
                    from_region=src,
                    to_region=dst,
                    value=count
                ))
                active_nodes.add(src)
                active_nodes.add(dst)
                
        # 노드 리스트 생성 (10개 지역 그룹 순서대로 정렬)
        region_order = ['서울', '경인', '충청', '대전', '경상', '대구', '부산', '강원', '제주', '울산']
        nodes = []
        # 먼저 순서대로 추가
        for region in region_order:
            if region in active_nodes:
                nodes.append(SankeyNode(
                    id=region,
                    name=region,
                    color=colors.get(region, '#CBD5E1')
                ))
        # 나머지 노드 추가 (기타 등)
        for node_name in sorted(active_nodes):
            if node_name not in region_order:
                nodes.append(SankeyNode(
                    id=node_name,
                    name=node_name,
                    color=colors.get(node_name, '#CBD5E1')
                ))
            
        # 결과 반환
        response = PopulationMovementSankeyResponse(
            success=True,
            nodes=nodes,
            links=links,
            base_ym=latest_base_ym,
            region_type="전국"
        )
        
        # 캐시 저장
        await set_to_cache(cache_key, response.dict(), ttl=STATISTICS_CACHE_TTL)
        
        return response
        
    except Exception as e:
        logger.error(f" [Statistics Sankey] Sankey 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sankey 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )
