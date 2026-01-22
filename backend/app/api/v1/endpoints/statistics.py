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
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case, desc, text, extract
from sqlalchemy.orm import selectinload

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
    CorrelationAnalysisResponse,
    TransactionVolumeResponse,
    MarketPhaseResponse,
    MarketPhaseDataPoint,
    HPIRegionTypeResponse,
    HPIRegionTypeDataPoint,
    PopulationMovementRegionTypeResponse,
    PopulationMovementRegionTypeDataPoint
)
from app.utils.cache import get_from_cache, set_to_cache, build_cache_key

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


def calculate_market_phase(price_change_rate: float, volume_change_rate: float) -> tuple[str, str, str]:
    """
    가격 변화율과 거래량 변화율을 기반으로 시장 국면 분류
    
    Args:
        price_change_rate: 가격 변화율 (%)
        volume_change_rate: 거래량 변화율 (%)
    
    Returns:
        (phase, trend, change) 튜플
        - phase: "상승기", "회복기", "침체기", "후퇴기"
        - trend: "up", "down"
        - change: 변화율 문자열 (예: "+1.5%")
    """
    if price_change_rate > 0 and volume_change_rate > 0:
        phase = "상승기"
        trend = "up"
    elif price_change_rate > 0 and volume_change_rate < 0:
        phase = "회복기"
        trend = "up"
    elif price_change_rate < 0 and volume_change_rate < 0:
        phase = "침체기"
        trend = "down"
    elif price_change_rate < 0 and volume_change_rate > 0:
        phase = "후퇴기"
        trend = "down"
    else:
        # 변화율이 0인 경우는 중립으로 처리
        if price_change_rate == 0 and volume_change_rate == 0:
            phase = "중립"
            trend = "up"
        elif price_change_rate == 0:
            phase = "회복기" if volume_change_rate > 0 else "침체기"
            trend = "up" if volume_change_rate > 0 else "down"
        else:
            phase = "상승기" if price_change_rate > 0 else "후퇴기"
            trend = "up" if price_change_rate > 0 else "down"
    
    # 변화율 문자열 생성 (가격 변화율 기준)
    change_sign = "+" if price_change_rate >= 0 else ""
    change_str = f"{change_sign}{price_change_rate:.1f}%"
    
    return (phase, trend, change_str)


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


@router.get(
    "/rvol",
    response_model=RVOLResponse,
    status_code=status.HTTP_200_OK,
    tags=["📊 Statistics (통계)"],
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
    RVOL(상대 거래량) 조회 - 성능 최적화 버전
    
    월별 집계로 간소화하여 빠른 응답 제공
    """
    cache_key = build_cache_key(
        "statistics", "rvol_v2", transaction_type, 
        str(current_period_months), str(average_period_months)
    )
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f"✅ [Statistics RVOL] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f"🔍 [Statistics RVOL] RVOL 데이터 조회 시작 - "
            f"transaction_type: {transaction_type}, "
            f"current_period_months: {current_period_months}, "
            f"average_period_months: {average_period_months}"
        )
        
        # 거래 유형에 따른 테이블 및 필드 선택
        if transaction_type == "sale":
            trans_table = Sale
            date_field = Sale.contract_date
            base_filter = and_(
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.contract_date.isnot(None),
                or_(Sale.remarks != "더미", Sale.remarks.is_(None))
            )
        else:  # rent
            trans_table = Rent
            date_field = Rent.deal_date
            base_filter = and_(
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deal_date.isnot(None),
                or_(Rent.remarks != "더미", Rent.remarks.is_(None))
            )
        
        # 현재 날짜 기준으로 기간 설정 (min/max 쿼리 제거)
        today = date.today()
        # 현재 달의 첫 날 (현재 달 제외)
        current_month_start = date(today.year, today.month, 1)
        
        # 현재 기간: 최근 current_period_months 개월 (현재 달 제외)
        current_start = current_month_start - timedelta(days=current_period_months * 30)
        current_end = current_month_start  # 현재 달의 첫 날 전까지
        
        # 평균 계산 기간: current_start 이전 average_period_months 개월
        average_start = current_start - timedelta(days=average_period_months * 30)
        average_end = current_start
        
        logger.info(
            f"📅 [Statistics RVOL] 날짜 범위 - "
            f"current_start: {current_start}, current_end: {current_end}, "
            f"average_start: {average_start}, average_end: {average_end}"
        )
        
        # 월별 집계로 간소화 (일별 대신 월별)
        # 평균 기간 월별 거래량
        average_volume_stmt = (
            select(
                extract('year', date_field).label('year'),
                extract('month', date_field).label('month'),
                func.count(trans_table.trans_id).label('count')
            )
            .where(
                and_(
                    base_filter,
                    date_field >= average_start,
                    date_field < average_end
                )
            )
            .group_by(extract('year', date_field), extract('month', date_field))
        )
        
        # 현재 기간 월별 거래량
        current_volume_stmt = (
            select(
                extract('year', date_field).label('year'),
                extract('month', date_field).label('month'),
                func.count(trans_table.trans_id).label('count')
            )
            .where(
                and_(
                    base_filter,
                    date_field >= current_start,
                    date_field < current_end  # 현재 달 제외 (미만으로 변경)
                )
            )
            .group_by(extract('year', date_field), extract('month', date_field))
        )
        
        # 병렬 실행
        average_result, current_result = await asyncio.gather(
            db.execute(average_volume_stmt),
            db.execute(current_volume_stmt)
        )
        
        average_rows = average_result.fetchall()
        current_rows = current_result.fetchall()
        
        # 평균 거래량 계산
        if average_rows:
            total_average = sum(row.count for row in average_rows)
            average_monthly_volume = total_average / len(average_rows)
        else:
            average_monthly_volume = 1  # 0으로 나누기 방지
        
        logger.info(
            f"📊 [Statistics RVOL] 평균 거래량 계산 - "
            f"average_monthly_volume: {average_monthly_volume}"
        )
        
        # RVOL 데이터 생성 (월별) - 현재 달 제외
        rvol_data = []
        current_year = today.year
        current_month = today.month
        
        for row in current_rows:
            year = int(row.year)
            month = int(row.month)
            
            # 현재 달 제외
            if year == current_year and month == current_month:
                continue
                
            count = row.count or 0
            
            # RVOL 계산
            rvol = count / average_monthly_volume if average_monthly_volume > 0 else 0
            
            rvol_data.append(
                RVOLDataPoint(
                    date=f"{year}-{month:02d}-01",
                    current_volume=count,
                    average_volume=round(average_monthly_volume, 2),
                    rvol=round(rvol, 2)
                )
            )
        
        # 날짜순 정렬
        rvol_data.sort(key=lambda x: x.date)
        
        period_description = f"최근 {current_period_months}개월 vs 직전 {average_period_months}개월"
        
        response_data = RVOLResponse(
            success=True,
            data=rvol_data,
            period=period_description
        )
        
        # 캐시에 저장 (TTL: 6시간)
        if len(rvol_data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        logger.info(f"✅ [Statistics RVOL] RVOL 데이터 생성 완료 - 데이터 포인트 수: {len(rvol_data)}")
        
        return response_data
        
    except Exception as e:
        logger.error(f"❌ [Statistics RVOL] RVOL 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"RVOL 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/quadrant",
    response_model=QuadrantResponse,
    status_code=status.HTTP_200_OK,
    tags=["📊 Statistics (통계)"],
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
        logger.info(f"✅ [Statistics Quadrant] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f"🔍 [Statistics Quadrant] 4분면 분류 데이터 조회 시작 - "
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
            f"📅 [Statistics Quadrant] 날짜 범위 - "
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
                    or_(Sale.remarks != "더미", Sale.remarks.is_(None))
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
                    or_(Sale.remarks != "더미", Sale.remarks.is_(None))
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
                    or_(Rent.remarks != "더미", Rent.remarks.is_(None))
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
                    or_(Rent.remarks != "더미", Rent.remarks.is_(None))
                )
            )
            .group_by(extract('year', Rent.deal_date), extract('month', Rent.deal_date))
        )
        
        # 쿼리 병렬 실행 (성능 최적화)
        sale_previous_result, sale_recent_result, rent_previous_result, rent_recent_result = await asyncio.gather(
            db.execute(sale_previous_stmt),
            db.execute(sale_recent_stmt),
            db.execute(rent_previous_stmt),
            db.execute(rent_recent_stmt)
        )
        
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
        
        logger.info(f"✅ [Statistics Quadrant] 4분면 분류 데이터 생성 완료 - 데이터 포인트 수: {len(quadrant_data)}")
        
        return response_data
        
    except Exception as e:
        logger.error(f"❌ [Statistics Quadrant] 4분면 분류 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"4분면 분류 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/hpi",
    response_model=HPIResponse,
    status_code=status.HTTP_200_OK,
    tags=["📊 Statistics (통계)"],
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
        logger.info(f"✅ [Statistics HPI] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f"🔍 [Statistics HPI] HPI 데이터 조회 시작 - "
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
            f"📅 [Statistics HPI] 날짜 범위 - "
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
            f"📊 [Statistics HPI] 쿼리 결과 - "
            f"총 {len(rows)}건 조회됨"
        )
        
        # 시도별 데이터 개수 확인
        if rows:
            region_counts = {}
            for row in rows:
                region_name = row.region_name if hasattr(row, 'region_name') and row.region_name else "Unknown"
                region_counts[region_name] = region_counts.get(region_name, 0) + 1
            
            logger.info(
                f"📋 [Statistics HPI] 시도별 데이터 개수 - "
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
                f"📈 [Statistics HPI] 데이터 포인트 상세 - "
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
                    f"📍 [Statistics HPI] 시도별 최신 데이터 샘플 - "
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
        
        logger.info(f"✅ [Statistics HPI] HPI 데이터 생성 완료 - 데이터 포인트 수: {len(hpi_data)}")
        
        return response_data
        
    except Exception as e:
        logger.error(f"❌ [Statistics HPI] HPI 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HPI 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/hpi/heatmap",
    response_model=HPIHeatmapResponse,
    status_code=status.HTTP_200_OK,
    tags=["📊 Statistics (통계)"],
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
        logger.info(f"✅ [Statistics HPI Heatmap] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f"🔍 [Statistics HPI Heatmap] HPI 히트맵 데이터 조회 시작 - "
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
        
        logger.info(f"📅 [Statistics HPI Heatmap] 사용할 base_ym: {found_base_ym}")
        
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
        
        logger.info(f"✅ [Statistics HPI Heatmap] HPI 히트맵 데이터 생성 완료 - 데이터 포인트 수: {len(heatmap_data)}")
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [Statistics HPI Heatmap] HPI 히트맵 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HPI 히트맵 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/summary",
    response_model=StatisticsSummaryResponse,
    status_code=status.HTTP_200_OK,
    tags=["📊 Statistics (통계)"],
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
    # RVOL과 4분면 분류를 병렬로 조회
    rvol_task = get_rvol(transaction_type, current_period_months, average_period_months, db)
    quadrant_task = get_quadrant(quadrant_period_months, db)
    
    rvol_response, quadrant_response = await asyncio.gather(rvol_task, quadrant_task)
    
    return StatisticsSummaryResponse(
        success=True,
        rvol=rvol_response,
        quadrant=quadrant_response
    )


@router.get(
    "/population-movements",
    response_model=PopulationMovementResponse,
    status_code=status.HTTP_200_OK,
    tags=["📊 Statistics (통계)"],
    summary="인구 이동 데이터 조회",
    description="""
    지역별 인구 이동 데이터를 조회합니다.
    
    ### Query Parameters
    - `region_id`: 지역 ID (선택, 지정하지 않으면 전체)
    - `start_ym`: 시작 년월 (YYYYMM, 기본값: 최근 12개월)
    - `end_ym`: 종료 년월 (YYYYMM, 기본값: 현재)
    """
)
async def get_population_movements(
    region_id: Optional[int] = Query(None, description="지역 ID (선택)"),
    start_ym: Optional[str] = Query(None, description="시작 년월 (YYYYMM)"),
    end_ym: Optional[str] = Query(None, description="종료 년월 (YYYYMM)"),
    db: AsyncSession = Depends(get_db)
):
    """
    인구 이동 데이터 조회
    """
    try:
        # 기본 기간 설정 (최근 12개월)
        if not end_ym:
            end_date = datetime.now()
            end_ym = end_date.strftime("%Y%m")
        
        if not start_ym:
            start_date = datetime.now() - timedelta(days=365)
            start_ym = start_date.strftime("%Y%m")
        
        # 쿼리 구성: 시도 레벨 데이터만 조회 (city_name 사용)
        query = select(
            PopulationMovement,
            State.city_name  # 시도명 사용 (예: 서울특별시, 부산광역시)
        ).join(
            State, PopulationMovement.region_id == State.region_id
        ).where(
            and_(
                PopulationMovement.base_ym >= start_ym,
                PopulationMovement.base_ym <= end_ym,
                PopulationMovement.is_deleted == False
            )
        )
        
        if region_id:
            query = query.where(PopulationMovement.region_id == region_id)
        
        query = query.order_by(PopulationMovement.base_ym.desc())
        
        result = await db.execute(query)
        rows = result.all()
        
        logger.info(
            f"📊 [Statistics Population Movement] 인구 이동 데이터 조회 - "
            f"총 {len(rows)}건 조회됨"
        )
        
        # 지역별 데이터 개수 확인
        if rows:
            region_counts = {}
            region_net_totals = {}  # 지역별 순이동 합계
            for movement, city_name in rows:
                region_name = city_name or "Unknown"
                region_counts[region_name] = region_counts.get(region_name, 0) + 1
                # 순이동 합계 계산
                if region_name not in region_net_totals:
                    region_net_totals[region_name] = 0
                region_net_totals[region_name] += movement.net_migration or 0
            
            logger.info(
                f"📋 [Statistics Population Movement] 시도별 데이터 개수 - "
                f"{', '.join([f'{k}: {v}건' for k, v in sorted(region_counts.items())])}"
            )
            
            logger.info(
                f"📊 [Statistics Population Movement] 시도별 순이동 합계 - "
                f"{', '.join([f'{k}: {v}명' for k, v in sorted(region_net_totals.items())])}"
            )
        
        data_points = []
        for movement, city_name in rows:
            # YYYYMM -> YYYY-MM 변환
            year = movement.base_ym[:4]
            month = movement.base_ym[4:]
            date_str = f"{year}-{month}"
            
            data_points.append(PopulationMovementDataPoint(
                date=date_str,
                region_id=movement.region_id,
                region_name=city_name,  # 시도명 반환
                in_migration=movement.in_migration,
                out_migration=movement.out_migration,
                net_migration=movement.net_migration
            ))
        
        return PopulationMovementResponse(
            success=True,
            data=data_points,
            period=f"{start_ym} ~ {end_ym}"
        )
        
    except Exception as e:
        logger.error(f"❌ 인구 이동 데이터 조회 실패: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"인구 이동 데이터 조회 실패: {str(e)}"
        )


# ============================================================
# 주택 수요 페이지용 새로운 API
# ============================================================

@router.get(
    "/transaction-volume",
    response_model=TransactionVolumeResponse,
    status_code=status.HTTP_200_OK,
    tags=["📊 Statistics (통계)"],
    summary="지역별 월별/년도별 거래량 조회",
    description="""
    지역 유형별로 월별 또는 년도별 거래량을 조회합니다.
    
    ### 지역 유형
    - **전국**: 모든 지역
    - **수도권**: 서울특별시 + 경기도 + 인천광역시
    - **지방5대광역시**: 부산광역시, 대구광역시, 광주광역시, 대전광역시, 울산광역시
    
    ### Query Parameters
    - `region_type`: 지역 유형 (required)
    - `period_type`: 기간 유형 (required, "monthly" | "yearly")
    - `year_range`: 년도 범위 (optional, monthly일 때만, 2 | 3 | 5)
    - `start_year`: 시작 연도 (optional, yearly일 때만)
    - `end_year`: 종료 연도 (optional, yearly일 때만)
    - `transaction_type`: 거래 유형 (optional, "sale" | "rent", 기본값: "sale")
    """
)
async def get_transaction_volume(
    region_type: str = Query(..., description="지역 유형: 전국, 수도권, 지방5대광역시"),
    period_type: str = Query(..., description="기간 유형: monthly(월별), yearly(년도별)"),
    year_range: Optional[int] = Query(None, ge=2, le=5, description="년도 범위 (월별일 때만, 2 | 3 | 5)"),
    start_year: Optional[int] = Query(None, ge=2000, le=2100, description="시작 연도 (년도별일 때만)"),
    end_year: Optional[int] = Query(None, ge=2000, le=2100, description="종료 연도 (년도별일 때만)"),
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), rent(전월세)"),
    db: AsyncSession = Depends(get_db)
):
    """
    지역별 월별/년도별 거래량 조회
    """
    # 유효성 검증
    valid_region_types = ["전국", "수도권", "지방5대광역시"]
    if region_type not in valid_region_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 region_type입니다. 가능한 값: {', '.join(valid_region_types)}"
        )
    
    valid_period_types = ["monthly", "yearly"]
    if period_type not in valid_period_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 period_type입니다. 가능한 값: {', '.join(valid_period_types)}"
        )
    
    if period_type == "monthly" and year_range is None:
        year_range = 3  # 기본값
    if period_type == "yearly" and (start_year is None or end_year is None):
        # 기본값: 최근 5년
        current_year = date.today().year
        end_year = current_year
        start_year = current_year - 5
    
    cache_key = build_cache_key(
        "statistics", "transaction-volume", region_type, period_type,
        str(year_range) if year_range else "",
        str(start_year) if start_year else "",
        str(end_year) if end_year else "",
        transaction_type
    )
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f"✅ [Statistics Transaction Volume] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f"🔍 [Statistics Transaction Volume] 거래량 데이터 조회 시작 - "
            f"region_type: {region_type}, period_type: {period_type}, "
            f"year_range: {year_range}, transaction_type: {transaction_type}"
        )
        
        # 거래 유형에 따른 테이블 및 필드 선택
        if transaction_type == "sale":
            trans_table = Sale
            date_field = Sale.contract_date
            base_filter = and_(
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.contract_date.isnot(None),
                or_(Sale.remarks != "더미", Sale.remarks.is_(None))
            )
        else:  # rent
            trans_table = Rent
            date_field = Rent.deal_date
            base_filter = and_(
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deal_date.isnot(None),
                or_(Rent.remarks != "더미", Rent.remarks.is_(None))
            )
        
        # 지역 필터 조건
        region_filter = get_region_type_filter(region_type)
        
        # 날짜 범위 계산
        today = date.today()
        current_year = today.year
        current_month = today.month
        
        if period_type == "monthly":
            # 월별: 최근 year_range년 데이터
            start_date = date(current_year - year_range, 1, 1)
            end_date = date(current_year, current_month, 1)  # 현재 달 제외
        else:  # yearly
            # 년도별: start_year ~ end_year
            start_date = date(start_year, 1, 1)
            end_date = date(end_year, 12, 31)
        
        # 쿼리 구성
        query = (
            select(
                extract('year', date_field).label('year'),
                extract('month', date_field).label('month'),
                func.count(trans_table.trans_id).label('count')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= start_date,
                    date_field <= end_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    (State.is_deleted == False) | (State.is_deleted.is_(None))
                )
            )
        )
        
        # 지역 필터 적용
        if region_filter is not None:
            query = query.where(region_filter)
        
        # 그룹화
        if period_type == "monthly":
            query = query.group_by(
                extract('year', date_field),
                extract('month', date_field)
            ).order_by(
                extract('year', date_field),
                extract('month', date_field)
            )
        else:  # yearly
            query = query.group_by(
                extract('year', date_field)
            ).order_by(
                extract('year', date_field)
            )
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        # 응답 데이터 생성
        if period_type == "monthly":
            # 월별: 동적 키 형식으로 변환
            monthly_data_map: Dict[str, Dict[str, Any]] = {}
            years_set = set()
            
            for row in rows:
                year = int(row.year)
                month = int(row.month)
                count = row.count or 0
                
                years_set.add(year)
                month_key = f"{month}월"
                
                if month_key not in monthly_data_map:
                    monthly_data_map[month_key] = {"period": month_key}
                
                monthly_data_map[month_key][year] = count
            
            data = list(monthly_data_map.values())
            years = sorted(years_set)
            
            response_data = TransactionVolumeResponse(
                success=True,
                data=data,
                years=years,
                region_type=region_type,
                period_type=period_type,
                year_range=year_range,
                start_year=None,
                end_year=None
            )
        else:  # yearly
            # 년도별: {period, value} 형식
            data = []
            for row in rows:
                year = int(row.year)
                count = row.count or 0
                data.append({
                    "period": str(year),
                    "value": count
                })
            
            response_data = TransactionVolumeResponse(
                success=True,
                data=data,
                years=None,
                region_type=region_type,
                period_type=period_type,
                year_range=None,
                start_year=start_year,
                end_year=end_year
            )
        
        # 캐시에 저장
        if len(data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        logger.info(f"✅ [Statistics Transaction Volume] 거래량 데이터 생성 완료 - 데이터 포인트 수: {len(data)}")
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [Statistics Transaction Volume] 거래량 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"거래량 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/market-phase",
    response_model=MarketPhaseResponse,
    status_code=status.HTTP_200_OK,
    tags=["📊 Statistics (통계)"],
    summary="지역별 시장 국면 분석",
    description="""
    가격 변화율과 거래량 변화율을 기반으로 지역별 시장 국면을 분석합니다.
    
    ### 시장 국면 분류
    - **상승기**: 가격↑ + 거래량↑
    - **회복기**: 가격↑ + 거래량↓
    - **침체기**: 가격↓ + 거래량↓
    - **후퇴기**: 가격↓ + 거래량↑
    
    ### Query Parameters
    - `region_type`: 지역 유형 (required)
    - `region_id`: 특정 지역 ID (optional)
    - `period_months`: 비교 기간 (optional, 기본값: 2)
    - `transaction_type`: 거래 유형 (optional, 기본값: "sale")
    """
)
async def get_market_phase(
    region_type: str = Query(..., description="지역 유형: 전국, 수도권, 지방5대광역시"),
    region_id: Optional[int] = Query(None, description="특정 지역 ID (지정 시 해당 지역만 조회)"),
    period_months: int = Query(2, ge=1, le=12, description="비교 기간 (개월)"),
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), rent(전월세)"),
    db: AsyncSession = Depends(get_db)
):
    """
    지역별 시장 국면 분석
    """
    # 유효성 검증
    valid_region_types = ["전국", "수도권", "지방5대광역시"]
    if region_type not in valid_region_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 region_type입니다. 가능한 값: {', '.join(valid_region_types)}"
        )
    
    cache_key = build_cache_key(
        "statistics", "market-phase", region_type,
        str(region_id) if region_id else "all",
        str(period_months),
        transaction_type
    )
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f"✅ [Statistics Market Phase] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f"🔍 [Statistics Market Phase] 시장 국면 분석 시작 - "
            f"region_type: {region_type}, region_id: {region_id}, "
            f"period_months: {period_months}, transaction_type: {transaction_type}"
        )
        
        # 거래 유형에 따른 테이블 및 필드 선택
        if transaction_type == "sale":
            trans_table = Sale
            price_field = Sale.trans_price
            date_field = Sale.contract_date
            area_field = Sale.exclusive_area
            base_filter = and_(
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.contract_date.isnot(None),
                Sale.trans_price.isnot(None),
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0,
                or_(Sale.remarks != "더미", Sale.remarks.is_(None))
            )
        else:  # rent
            trans_table = Rent
            price_field = Rent.deposit_price
            date_field = Rent.deal_date
            area_field = Rent.exclusive_area
            base_filter = and_(
                or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),  # 전세만
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deal_date.isnot(None),
                Rent.deposit_price.isnot(None),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0,
                or_(Rent.remarks != "더미", Rent.remarks.is_(None))
            )
        
        # 날짜 범위 계산
        today = date.today()
        current_month_start = date(today.year, today.month, 1)
        
        recent_start = current_month_start - timedelta(days=period_months * 30)
        recent_end = current_month_start  # 현재 달 제외
        
        previous_start = recent_start - timedelta(days=period_months * 30)
        previous_end = recent_start
        
        # 지역 필터 조건
        region_filter = get_region_type_filter(region_type)
        
        # 시군구 레벨로 그룹화 (region_id, region_name 사용)
        # 최근 기간 평균 가격 및 거래량
        recent_stmt = (
            select(
                State.region_id,
                State.city_name,
                State.region_name,
                func.avg(price_field / area_field * 3.3).label('avg_price_per_pyeong'),
                func.count(trans_table.trans_id).label('volume')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= recent_start,
                    date_field < recent_end,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    (State.is_deleted == False) | (State.is_deleted.is_(None))
                )
            )
            .group_by(State.region_id, State.city_name, State.region_name)
            .having(func.count(trans_table.trans_id) >= 5)  # 최소 5건 이상
        )
        
        # 이전 기간 평균 가격 및 거래량
        previous_stmt = (
            select(
                State.region_id,
                State.city_name,
                State.region_name,
                func.avg(price_field / area_field * 3.3).label('avg_price_per_pyeong'),
                func.count(trans_table.trans_id).label('volume')
            )
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= previous_start,
                    date_field < previous_end,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    (State.is_deleted == False) | (State.is_deleted.is_(None))
                )
            )
            .group_by(State.region_id, State.city_name, State.region_name)
            .having(func.count(trans_table.trans_id) >= 5)  # 최소 5건 이상
        )
        
        # 지역 필터 적용
        if region_filter is not None:
            recent_stmt = recent_stmt.where(region_filter)
            previous_stmt = previous_stmt.where(region_filter)
        
        # 특정 지역 필터 적용
        if region_id is not None:
            recent_stmt = recent_stmt.where(State.region_id == region_id)
            previous_stmt = previous_stmt.where(State.region_id == region_id)
        
        # 병렬 실행
        recent_result, previous_result = await asyncio.gather(
            db.execute(recent_stmt),
            db.execute(previous_stmt)
        )
        
        recent_rows = recent_result.fetchall()
        previous_rows = previous_result.fetchall()
        
        # 이전 기간 데이터를 딕셔너리로 변환
        previous_data_map: Dict[int, Dict[str, Any]] = {}
        for row in previous_rows:
            previous_data_map[row.region_id] = {
                "avg_price": float(row.avg_price_per_pyeong or 0),
                "volume": row.volume or 0
            }
        
        # 시장 국면 분석 데이터 생성
        market_phases = []
        for row in recent_rows:
            region_id_val = row.region_id
            city_name = row.city_name
            region_name = row.region_name
            
            # 이전 기간 데이터가 없으면 스킵
            if region_id_val not in previous_data_map:
                continue
            
            recent_price = float(row.avg_price_per_pyeong or 0)
            recent_volume = row.volume or 0
            previous_price = previous_data_map[region_id_val]["avg_price"]
            previous_volume = previous_data_map[region_id_val]["volume"]
            
            # 변화율 계산
            if previous_price > 0:
                price_change_rate = ((recent_price - previous_price) / previous_price) * 100
            else:
                price_change_rate = 0.0
            
            if previous_volume > 0:
                volume_change_rate = ((recent_volume - previous_volume) / previous_volume) * 100
            else:
                volume_change_rate = 0.0
            
            # 시장 국면 분류
            phase, trend, change_str = calculate_market_phase(price_change_rate, volume_change_rate)
            
            # 지역명 생성 (시도 + 시군구)
            full_region_name = f"{city_name} {region_name}" if region_name else city_name
            
            market_phases.append(MarketPhaseDataPoint(
                region_id=region_id_val,
                region_name=full_region_name,
                city_name=city_name,
                phase=phase,
                trend=trend,
                change=change_str,
                price_change_rate=round(price_change_rate, 2),
                volume_change_rate=round(volume_change_rate, 2),
                recent_price=round(recent_price, 1),
                previous_price=round(previous_price, 1),
                recent_volume=recent_volume,
                previous_volume=previous_volume
            ))
        
        # 정렬 (시도 → 시군구)
        market_phases.sort(key=lambda x: (x.city_name, x.region_name))
        
        response_data = MarketPhaseResponse(
            success=True,
            data=market_phases,
            region_type=region_type,
            period_months=period_months
        )
        
        # 캐시에 저장
        if len(market_phases) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        logger.info(f"✅ [Statistics Market Phase] 시장 국면 분석 완료 - 데이터 포인트 수: {len(market_phases)}")
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [Statistics Market Phase] 시장 국면 분석 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"시장 국면 분석 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/hpi/by-region-type",
    response_model=HPIRegionTypeResponse,
    status_code=status.HTTP_200_OK,
    tags=["📊 Statistics (통계)"],
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
        logger.info(f"✅ [Statistics HPI Region Type] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f"🔍 [Statistics HPI Region Type] HPI 데이터 조회 시작 - "
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
            hpi_data = []
            for row in rows:
                city_name = row.city_name
                region_name = row.region_name
                
                # 서울특별시와 인천광역시는 시도명만 사용, 경기도는 시/군명 사용
                if city_name == "서울특별시":
                    display_name = "서울"
                elif city_name == "인천광역시":
                    display_name = "인천"
                else:
                    # 경기도: 시/군명에서 "시", "군", "구" 제거
                    display_name = region_name.replace("시", "").replace("군", "").replace("구", "") if region_name else city_name
                
                index_value = float(row.index_value or 0)
                index_change_rate = float(row.index_change_rate) if row.index_change_rate is not None else None
                
                hpi_data.append(HPIRegionTypeDataPoint(
                    id=None,
                    name=display_name,
                    value=round(index_value, 2),
                    index_change_rate=round(index_change_rate, 2) if index_change_rate is not None else None
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
        
        logger.info(f"✅ [Statistics HPI Region Type] HPI 데이터 생성 완료 - 데이터 포인트 수: {len(hpi_data)}")
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [Statistics HPI Region Type] HPI 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HPI 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/population-movements/by-region-type",
    response_model=PopulationMovementRegionTypeResponse,
    status_code=status.HTTP_200_OK,
    tags=["📊 Statistics (통계)"],
    summary="지역 유형별 인구 순이동 조회",
    description="""
    지역 유형별로 인구 순이동 데이터를 조회합니다.
    
    ### Query Parameters
    - `region_type`: 지역 유형 (required)
    - `start_ym`: 시작 년월 (optional, 기본값: 최근 3개월 전)
    - `end_ym`: 종료 년월 (optional, 기본값: 최신)
    - `aggregate`: 집계 방식 (optional, "sum" | "avg", 기본값: "sum")
    """
)
async def get_population_movements_by_region_type(
    region_type: str = Query(..., description="지역 유형: 전국, 수도권, 지방5대광역시"),
    start_ym: Optional[str] = Query(None, description="시작 년월 (YYYYMM)"),
    end_ym: Optional[str] = Query(None, description="종료 년월 (YYYYMM)"),
    aggregate: str = Query("sum", description="집계 방식: sum(합계), avg(평균)"),
    db: AsyncSession = Depends(get_db)
):
    """
    지역 유형별 인구 순이동 조회
    """
    # 유효성 검증
    valid_region_types = ["전국", "수도권", "지방5대광역시"]
    if region_type not in valid_region_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 region_type입니다. 가능한 값: {', '.join(valid_region_types)}"
        )
    
    valid_aggregates = ["sum", "avg"]
    if aggregate not in valid_aggregates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 aggregate입니다. 가능한 값: {', '.join(valid_aggregates)}"
        )
    
    # 기본 기간 설정
    if not end_ym:
        end_date = datetime.now()
        end_ym = end_date.strftime("%Y%m")
    
    if not start_ym:
        # 최근 3개월 전
        start_date = datetime.now() - timedelta(days=90)
        start_ym = start_date.strftime("%Y%m")
    
    # 기간 개월 수 계산
    start_year = int(start_ym[:4])
    start_month = int(start_ym[4:])
    end_year = int(end_ym[:4])
    end_month = int(end_ym[4:])
    period_months = (end_year - start_year) * 12 + (end_month - start_month) + 1
    
    cache_key = build_cache_key(
        "statistics", "population-movements-by-region-type", region_type,
        start_ym, end_ym, aggregate
    )
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f"✅ [Statistics Population Movement Region Type] 캐시에서 반환")
        return cached_data
    
    try:
        logger.info(
            f"🔍 [Statistics Population Movement Region Type] 인구 순이동 데이터 조회 시작 - "
            f"region_type: {region_type}, start_ym: {start_ym}, end_ym: {end_ym}, aggregate: {aggregate}"
        )
        
        # 지역 필터 조건
        region_filter = get_region_type_filter(region_type)
        
        # 집계 함수 선택
        if aggregate == "sum":
            net_migration_func = func.sum(PopulationMovement.net_migration)
            in_migration_func = func.sum(PopulationMovement.in_migration)
            out_migration_func = func.sum(PopulationMovement.out_migration)
        else:  # avg
            net_migration_func = func.avg(PopulationMovement.net_migration)
            in_migration_func = func.avg(PopulationMovement.in_migration)
            out_migration_func = func.avg(PopulationMovement.out_migration)
        
        # 쿼리 구성: 시도 레벨로 그룹화
        query = (
            select(
                State.city_name,
                net_migration_func.label('net_migration'),
                in_migration_func.label('in_migration'),
                out_migration_func.label('out_migration')
            )
            .join(State, PopulationMovement.region_id == State.region_id)
            .where(
                and_(
                    PopulationMovement.base_ym >= start_ym,
                    PopulationMovement.base_ym <= end_ym,
                    PopulationMovement.is_deleted == False,
                    State.is_deleted == False
                )
            )
            .group_by(State.city_name)
        )
        
        # 지역 필터 적용
        if region_filter is not None:
            query = query.where(region_filter)
        
        query = query.order_by(desc(net_migration_func))  # 순이동 큰 순서대로
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        # 응답 데이터 생성
        migration_data = []
        for row in rows:
            city_name = row.city_name
            normalized_name = normalize_city_name(city_name)
            net_migration = int(row.net_migration or 0) if aggregate == "sum" else float(row.net_migration or 0)
            in_migration = int(row.in_migration or 0) if aggregate == "sum" else float(row.in_migration or 0)
            out_migration = int(row.out_migration or 0) if aggregate == "sum" else float(row.out_migration or 0)
            
            # 정수로 변환 (평균인 경우 반올림)
            if aggregate == "avg":
                net_migration = int(round(net_migration))
                in_migration = int(round(in_migration))
                out_migration = int(round(out_migration))
            
            label = "순유입" if net_migration > 0 else "순유출"
            
            migration_data.append(PopulationMovementRegionTypeDataPoint(
                name=normalized_name,
                value=net_migration,
                label=label,
                in_migration=in_migration,
                out_migration=out_migration,
                net_migration=net_migration
            ))
        
        response_data = PopulationMovementRegionTypeResponse(
            success=True,
            data=migration_data,
            region_type=region_type,
            start_ym=start_ym,
            end_ym=end_ym,
            period_months=period_months
        )
        
        # 캐시에 저장
        if len(migration_data) > 0:
            await set_to_cache(cache_key, response_data.dict(), ttl=STATISTICS_CACHE_TTL)
        
        logger.info(f"✅ [Statistics Population Movement Region Type] 인구 순이동 데이터 생성 완료 - 데이터 포인트 수: {len(migration_data)}")
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [Statistics Population Movement Region Type] 인구 순이동 데이터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"인구 순이동 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )
