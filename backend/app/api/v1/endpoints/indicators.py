"""
지표 관련 API 엔드포인트

담당 기능:
- 부동산 지수 조회 (GET /indicators/house-scores/{id}/{YYYYMM})
- 부동산 거래량 조회 (GET /indicators/house-volumes/{id}/{YYYYMM})
- 전세가율 조회 (GET /indicators/jeonse-ratio)
- 전세가율 계산 (POST /indicators/jeonse-ratio/calculate)
- 지역별 지표 비교 (GET /indicators/regional-comparison)
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Path, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.api.v1.deps import get_db
from app.crud.house_score import house_score as house_score_crud
from app.crud.house_volume import house_volume as house_volume_crud
from app.models.sale import Sale
from app.models.rent import Rent
from app.models.apartment import Apartment
from app.models.state import State
from app.schemas.house_volume import HouseVolumeIndicatorResponse
from pydantic import BaseModel, Field


router = APIRouter()


class HouseScoreValueResponse(BaseModel):
    """부동산 지수 값 응답 스키마"""
    index_value: float = Field(..., description="지수 값 (2017.11=100 기준)")
    index_type: str = Field(..., description="지수 유형 (APT=아파트, HOUSE=단독주택, ALL=전체)")
    index_change_rate: float | None = Field(None, description="지수 변동률")


class HouseScoreIndicatorResponse(BaseModel):
    """부동산 지수 지표 응답 스키마"""
    region_id: int = Field(..., description="지역 ID")
    base_ym: str = Field(..., description="기준 년월 (YYYYMM)")
    values: List[HouseScoreValueResponse] = Field(..., description="지수 값 목록")


@router.get(
    "/house-scores/{region_id}/{base_ym}",
    response_model=HouseScoreIndicatorResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Indicators (지표)"],
    summary="부동산 지수 조회",
    description="""
    특정 지역과 기준 년월의 부동산 지수를 조회합니다.
    
    **Path Parameters:**
    - `region_id`: 지역 ID (STATES 테이블의 region_id)
    - `base_ym`: 기준 년월 (YYYYMM 형식, 예: 202309)
    
    **Response:**
    - `region_id`: 지역 ID
    - `base_ym`: 기준 년월
    - `values`: 지수 값 목록 (각 index_type별로 반환)
      - `index_value`: 지수 값 (2017.11=100 기준)
      - `index_type`: 지수 유형 (APT, HOUSE, ALL)
      - `index_change_rate`: 지수 변동률 (선택)
    
    **주의사항:**
    - 같은 region_id와 base_ym 조합에 대해 여러 index_type (APT, HOUSE, ALL)이 있을 수 있습니다.
    - 해당하는 데이터가 없으면 404 에러를 반환합니다.
    """,
    responses={
        200: {
            "description": "조회 성공",
            "model": HouseScoreIndicatorResponse
        },
        404: {
            "description": "해당 지역/년월의 데이터를 찾을 수 없음"
        },
        422: {
            "description": "입력값 검증 실패 (base_ym 형식 오류 등)"
        }
    }
)
async def get_house_score_indicator(
    region_id: int = Path(..., description="지역 ID", ge=1),
    base_ym: str = Path(..., description="기준 년월 (YYYYMM)", pattern="^\\d{6}$"),
    db: AsyncSession = Depends(get_db)
) -> HouseScoreIndicatorResponse:
    """
    부동산 지수 조회
    
    특정 지역(region_id)과 기준 년월(base_ym)에 해당하는 부동산 지수를 조회합니다.
    여러 index_type (APT, HOUSE, ALL)의 값이 모두 반환됩니다.
    
    Args:
        region_id: 지역 ID (STATES 테이블의 region_id)
        base_ym: 기준 년월 (YYYYMM 형식, 예: 202309)
        db: 데이터베이스 세션
    
    Returns:
        HouseScoreIndicatorResponse: 부동산 지수 정보
    
    Raises:
        HTTPException:
            - 404: 해당 지역/년월의 데이터를 찾을 수 없음
            - 422: base_ym 형식이 올바르지 않음
    """
    # 데이터 조회
    house_scores = await house_score_crud.get_by_region_and_month(
        db,
        region_id=region_id,
        base_ym=base_ym
    )
    
    if not house_scores:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "NOT_FOUND",
                "message": f"지역 ID {region_id}, 기준 년월 {base_ym}에 해당하는 부동산 지수 데이터를 찾을 수 없습니다."
            }
        )
    
    # 응답 데이터 구성
    values = []
    for score in house_scores:
        values.append(HouseScoreValueResponse(
            index_value=float(score.index_value),
            index_type=score.index_type,
            index_change_rate=float(score.index_change_rate) if score.index_change_rate is not None else None
        ))
    
    return HouseScoreIndicatorResponse(
        region_id=region_id,
        base_ym=base_ym,
        values=values
    )


@router.get(
    "/house-volumes/{region_id}/{base_ym}",
    response_model=HouseVolumeIndicatorResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Indicators (지표)"],
    summary="부동산 거래량 조회",
    description="""
    특정 지역과 기준 년월의 부동산 거래량을 조회합니다.
    
    **Path Parameters:**
    - `region_id`: 지역 ID (STATES 테이블의 region_id)
    - `base_ym`: 기준 년월 (YYYYMM 형식, 예: 202501)
    
    **Response:**
    - `region_id`: 지역 ID
    - `base_ym`: 기준 년월
    - `volume_value`: 거래량 값 (동(호)수)
    - `volume_area`: 거래 면적 (선택, NULL 가능)
    
    **주의사항:**
    - 해당하는 데이터가 없으면 404 에러를 반환합니다.
    """,
    responses={
        200: {
            "description": "조회 성공",
            "model": HouseVolumeIndicatorResponse
        },
        404: {
            "description": "해당 지역/년월의 데이터를 찾을 수 없음"
        },
        422: {
            "description": "입력값 검증 실패 (base_ym 형식 오류 등)"
        }
    }
)
async def get_house_volume_indicator(
    region_id: int = Path(..., description="지역 ID", ge=1),
    base_ym: str = Path(..., description="기준 년월 (YYYYMM)", pattern="^\\d{6}$"),
    db: AsyncSession = Depends(get_db)
) -> HouseVolumeIndicatorResponse:
    """
    부동산 거래량 조회
    
    특정 지역(region_id)과 기준 년월(base_ym)에 해당하는 부동산 거래량을 조회합니다.
    
    Args:
        region_id: 지역 ID (STATES 테이블의 region_id)
        base_ym: 기준 년월 (YYYYMM 형식, 예: 202501)
        db: 데이터베이스 세션
    
    Returns:
        HouseVolumeIndicatorResponse: 부동산 거래량 정보
    
    Raises:
        HTTPException:
            - 404: 해당 지역/년월의 데이터를 찾을 수 없음
            - 422: base_ym 형식이 올바르지 않음
    """
    # 데이터 조회
    house_volume = await house_volume_crud.get_by_region_and_month(
        db,
        region_id=region_id,
        base_ym=base_ym
    )
    
    if not house_volume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "NOT_FOUND",
                "message": f"지역 ID {region_id}, 기준 년월 {base_ym}에 해당하는 부동산 거래량 데이터를 찾을 수 없습니다."
            }
        )
    
    return HouseVolumeIndicatorResponse(
        region_id=house_volume.region_id,
        base_ym=house_volume.base_ym,
        volume_value=house_volume.volume_value,
        volume_area=float(house_volume.volume_area) if house_volume.volume_area is not None else None
    )


# ============================================================
# 전세가율 관련 스키마
# ============================================================

class JeonseRatioRequest(BaseModel):
    """전세가율 계산 요청 스키마"""
    sale_price: float = Field(..., description="매매가격 (만원)", gt=0)
    jeonse_price: float = Field(..., description="전세가격 (만원)", gt=0)


class JeonseRatioResponse(BaseModel):
    """전세가율 응답 스키마"""
    jeonse_ratio: float = Field(..., description="전세가율 (%)")
    sale_price: float = Field(..., description="매매가격 (만원)")
    jeonse_price: float = Field(..., description="전세가격 (만원)")


class JeonseRatioQueryResponse(BaseModel):
    """전세가율 조회 응답 스키마"""
    apt_id: Optional[int] = Field(None, description="아파트 ID")
    apt_name: Optional[str] = Field(None, description="아파트명")
    region_name: Optional[str] = Field(None, description="지역명")
    jeonse_ratio: Optional[float] = Field(None, description="전세가율 (%) - (전세가격 / 매매가격) * 100, 전세 거래가 없으면 null")
    sale_price: Optional[float] = Field(None, description="매매가격 (만원)")
    jeonse_price: Optional[float] = Field(None, description="전세가격 (만원)")
    exclusive_area: Optional[float] = Field(None, description="전용면적 (㎡)")
    deal_date: Optional[str] = Field(None, description="거래일")


class RegionalComparisonRequest(BaseModel):
    """지역별 지표 비교 요청 스키마"""
    region_ids: List[int] = Field(..., description="지역 ID 목록", min_items=1, max_items=10)
    base_ym: Optional[str] = Field(None, description="기준 년월 (YYYYMM)")


class RegionalComparisonItem(BaseModel):
    """지역별 지표 비교 항목"""
    region_id: int = Field(..., description="지역 ID")
    region_name: str = Field(..., description="지역명")
    jeonse_ratio: Optional[float] = Field(None, description="평균 전세가율 (%)")
    avg_sale_price: Optional[float] = Field(None, description="평균 매매가격 (만원)")
    avg_jeonse_price: Optional[float] = Field(None, description="평균 전세가격 (만원)")
    transaction_count: int = Field(..., description="거래 건수")


class RegionalComparisonResponse(BaseModel):
    """지역별 지표 비교 응답 스키마"""
    base_ym: Optional[str] = Field(None, description="기준 년월")
    regions: List[RegionalComparisonItem] = Field(..., description="지역별 지표 목록")


# ============================================================
# 전세가율 조회 API
# ============================================================

@router.get(
    "/jeonse-ratio",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Indicators (지표)"],
    summary="전세가율 조회",
    description="""
    아파트의 전세가율을 조회합니다.
    
    전세가율 = (전세가격 / 매매가격) * 100
    
    **Query Parameters:**
    - `apt_id`: 아파트 ID (선택)
    - `region_id`: 지역 ID (선택)
    - `limit`: 조회 개수 (기본값: 10, 최대: 100)
    
    **Response:**
    - `success`: 성공 여부
    - `data`: 전세가율 목록
      - `apt_id`: 아파트 ID
      - `apt_name`: 아파트명
      - `region_name`: 지역명
      - `jeonse_ratio`: 전세가율 (%)
      - `sale_price`: 매매가격 (만원)
      - `jeonse_price`: 전세가격 (만원)
      - `exclusive_area`: 전용면적 (㎡)
      - `deal_date`: 거래일
    
    **주의사항:**
    - apt_id와 region_id 중 하나는 반드시 제공되어야 합니다.
    - 매매가격과 전세가격이 모두 있는 경우에만 전세가율이 계산됩니다.
    """,
    responses={
        200: {
            "description": "조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": [
                            {
                                "apt_id": 1,
                                "apt_name": "래미안 아파트",
                                "region_name": "서울시 강남구",
                                "jeonse_ratio": 75.5,
                                "sale_price": 100000,
                                "jeonse_price": 75500,
                                "exclusive_area": 84.5,
                                "deal_date": "2024-01-15"
                            }
                        ]
                    }
                }
            }
        },
        400: {
            "description": "잘못된 요청 (apt_id와 region_id 모두 없음)"
        }
    }
)
async def get_jeonse_ratio(
    apt_id: Optional[int] = Query(None, description="아파트 ID", ge=1),
    region_id: Optional[int] = Query(None, description="지역 ID", ge=1),
    limit: int = Query(10, description="조회 개수", ge=1, le=100),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    전세가율 조회
    
    아파트의 매매가격과 전세가격을 기반으로 전세가율을 계산하여 반환합니다.
    
    Args:
        apt_id: 아파트 ID (선택)
        region_id: 지역 ID (선택)
        limit: 조회 개수
        db: 데이터베이스 세션
    
    Returns:
        dict: 전세가율 목록
    
    Raises:
        HTTPException:
            - 400: apt_id와 region_id가 모두 없는 경우
    """
    if not apt_id and not region_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_REQUEST",
                "message": "apt_id 또는 region_id 중 하나는 반드시 제공되어야 합니다."
            }
        )
    
    try:
        # 매매 거래와 전세 거래를 조인하여 전세가율 계산
        # 같은 아파트, 비슷한 면적의 매매/전세 거래를 매칭
        # LEFT JOIN을 사용하여 전세 거래가 없어도 매매 거래 정보는 반환
        query = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                State.region_name.label("region_name"),
                Sale.trans_price.label("sale_price"),
                Rent.deposit_price.label("jeonse_price"),
                Sale.exclusive_area,
                Sale.contract_date.label("deal_date")
            )
            .join(Sale, Sale.apt_id == Apartment.apt_id)
            .join(State, State.region_id == Apartment.region_id)
            .outerjoin(Rent, and_(
                Rent.apt_id == Apartment.apt_id,
                or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),  # 전세만 (월세 제외)
                Rent.is_deleted == False,
                func.abs(Rent.exclusive_area - Sale.exclusive_area) <= 10,  # 면적 차이 10㎡ 이내로 완화
                Rent.deposit_price.isnot(None),
                Rent.deposit_price > 0
            ))
            .where(
                Sale.is_canceled == False,
                Sale.is_deleted == False,
                Sale.trans_price.isnot(None),
                Sale.trans_price > 0
            )
        )
        
        if apt_id:
            query = query.where(Apartment.apt_id == apt_id)
        if region_id:
            query = query.where(State.region_id == region_id)
        
        query = query.order_by(Sale.contract_date.desc()).limit(limit)
        
        result = await db.execute(query)
        rows = result.all()
        
        data = []
        for row in rows:
            if row.sale_price and row.sale_price > 0:
                # 전세가격이 있으면 전세가율 계산, 없으면 NULL
                if row.jeonse_price and row.jeonse_price > 0:
                    jeonse_ratio = (row.jeonse_price / row.sale_price) * 100
                else:
                    jeonse_ratio = None
                
                data.append(JeonseRatioQueryResponse(
                    apt_id=row.apt_id,
                    apt_name=row.apt_name,
                    region_name=row.region_name,
                    jeonse_ratio=round(jeonse_ratio, 2) if jeonse_ratio is not None else None,
                    sale_price=float(row.sale_price),
                    jeonse_price=float(row.jeonse_price) if row.jeonse_price else None,
                    exclusive_area=float(row.exclusive_area) if row.exclusive_area else None,
                    deal_date=str(row.deal_date) if row.deal_date else None
                ).model_dump())
        
        return {
            "success": True,
            "data": data
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_SERVER_ERROR",
                "message": f"전세가율 조회 중 오류가 발생했습니다: {str(e)}"
            }
        )


# ============================================================
# 전세가율 계산 API
# ============================================================

@router.post(
    "/jeonse-ratio/calculate",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Indicators (지표)"],
    summary="전세가율 계산 (입력값)",
    description="""
    매매가격과 전세가격을 입력받아 전세가율을 계산합니다.
    
    전세가율 = (전세가격 / 매매가격) * 100
    
    **Request Body:**
    - `sale_price`: 매매가격 (만원, 필수, 0보다 커야 함)
    - `jeonse_price`: 전세가격 (만원, 필수, 0보다 커야 함)
    
    **Response:**
    - `success`: 성공 여부
    - `data`: 계산 결과
      - `jeonse_ratio`: 전세가율 (%)
      - `sale_price`: 매매가격 (만원)
      - `jeonse_price`: 전세가격 (만원)
    
    **예시:**
    - 매매가격: 100,000만원, 전세가격: 75,000만원 → 전세가율: 75.0%
    """,
    responses={
        200: {
            "description": "계산 성공",
            "model": dict
        },
        400: {
            "description": "입력값 검증 실패"
        }
    }
)
async def calculate_jeonse_ratio(
    request: JeonseRatioRequest = Body(..., description="전세가율 계산 요청"),
) -> dict:
    """
    전세가율 계산 (입력값)
    
    매매가격과 전세가격을 입력받아 전세가율을 계산합니다.
    
    Args:
        request: 전세가율 계산 요청 (매매가격, 전세가격)
    
    Returns:
        dict: 계산 결과 (전세가율, 매매가격, 전세가격)
    
    Raises:
        HTTPException:
            - 400: 입력값이 유효하지 않은 경우 (가격이 0 이하)
    """
    try:
        if request.sale_price <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_SALE_PRICE",
                    "message": "매매가격은 0보다 커야 합니다."
                }
            )
        
        if request.jeonse_price <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_JEONSE_PRICE",
                    "message": "전세가격은 0보다 커야 합니다."
                }
            )
        
        # 전세가율 계산: (전세가격 / 매매가격) * 100
        jeonse_ratio = (request.jeonse_price / request.sale_price) * 100
        
        result = JeonseRatioResponse(
            jeonse_ratio=round(jeonse_ratio, 2),
            sale_price=request.sale_price,
            jeonse_price=request.jeonse_price
        )
        
        return {
            "success": True,
            "data": result.model_dump()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_SERVER_ERROR",
                "message": f"전세가율 계산 중 오류가 발생했습니다: {str(e)}"
            }
        )


# ============================================================
# 지역별 지표 비교 API
# ============================================================

@router.get(
    "/regional-comparison",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=[" Indicators (지표)"],
    summary="지역별 지표 비교",
    description="""
    여러 지역의 부동산 지표를 비교하여 반환합니다.
    
    **Query Parameters:**
    - `region_ids`: 지역 ID 목록 (쉼표로 구분, 예: 1,2,3, 최대 10개)
    - `base_ym`: 기준 년월 (YYYYMM 형식, 선택)
    
    **Response:**
    - `success`: 성공 여부
    - `data`: 지역별 지표 비교 결과
      - `base_ym`: 기준 년월
      - `regions`: 지역별 지표 목록
        - `region_id`: 지역 ID
        - `region_name`: 지역명
        - `jeonse_ratio`: 평균 전세가율 (%)
        - `avg_sale_price`: 평균 매매가격 (만원)
        - `avg_jeonse_price`: 평균 전세가격 (만원)
        - `transaction_count`: 거래 건수
    
    **예시:**
    - GET /indicators/regional-comparison?region_ids=1,2,3&base_ym=202401
    """,
    responses={
        200: {
            "description": "조회 성공",
            "model": dict
        },
        400: {
            "description": "잘못된 요청 (region_ids 없음 또는 형식 오류)"
        }
    }
)
async def get_regional_comparison(
    region_ids: str = Query(..., description="지역 ID 목록 (쉼표로 구분)", pattern="^\\d+(,\\d+)*$"),
    base_ym: Optional[str] = Query(None, description="기준 년월 (YYYYMM)", pattern="^\\d{6}$"),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    지역별 지표 비교
    
    여러 지역의 부동산 지표(전세가율, 평균 매매가격, 평균 전세가격 등)를 비교하여 반환합니다.
    
    Args:
        region_ids: 지역 ID 목록 (쉼표로 구분된 문자열)
        base_ym: 기준 년월 (YYYYMM 형식, 선택)
        db: 데이터베이스 세션
    
    Returns:
        dict: 지역별 지표 비교 결과
    
    Raises:
        HTTPException:
            - 400: region_ids 형식이 올바르지 않은 경우
    """
    try:
        # region_ids 파싱
        region_id_list = [int(id.strip()) for id in region_ids.split(",")]
        
        if len(region_id_list) == 0 or len(region_id_list) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_REGION_IDS",
                    "message": "지역 ID는 1개 이상 10개 이하여야 합니다."
                }
            )
        
        # 지역별 지표 조회
        regions_data = []
        
        for region_id in region_id_list:
            # 지역 정보 조회
            state_query = select(State).where(State.region_id == region_id)
            state_result = await db.execute(state_query)
            state = state_result.scalar_one_or_none()
            
            if not state:
                continue
            
            # 매매 거래 통계
            sale_query = (
                select(
                    func.avg(Sale.trans_price).label("avg_sale_price"),
                    func.count(Sale.trans_id).label("sale_count")
                )
                .join(Apartment, Apartment.apt_id == Sale.apt_id)
                .join(State, State.region_id == Apartment.region_id)
                .where(
                    State.region_id == region_id,
                    Sale.is_canceled == False,
                    Sale.is_deleted == False,
                    Sale.trans_price.isnot(None),
                    Sale.trans_price > 0
                )
            )
            
            if base_ym:
                # base_ym을 YYYY-MM 형식으로 변환하여 필터링
                year = base_ym[:4]
                month = base_ym[4:]
                sale_query = sale_query.where(
                    func.extract('year', Sale.deal_date) == int(year),
                    func.extract('month', Sale.deal_date) == int(month)
                )
            
            sale_result = await db.execute(sale_query)
            sale_stats = sale_result.first()
            
            # 전세 거래 통계
            rent_query = (
                select(
                    func.avg(Rent.deposit_price).label("avg_jeonse_price"),
                    func.count(Rent.trans_id).label("rent_count")
                )
                .join(Apartment, Apartment.apt_id == Rent.apt_id)
                .join(State, State.region_id == Apartment.region_id)
                .where(
                    State.region_id == region_id,
                    Rent.monthly_rent == 0,  # 전세만
                    Rent.is_deleted == False,
                    Rent.deposit_price.isnot(None),
                    Rent.deposit_price > 0
                )
            )
            
            if base_ym:
                year = base_ym[:4]
                month = base_ym[4:]
                rent_query = rent_query.where(
                    func.extract('year', Rent.deal_date) == int(year),
                    func.extract('month', Rent.deal_date) == int(month)
                )
            
            rent_result = await db.execute(rent_query)
            rent_stats = rent_result.first()
            
            # 전세가율 계산
            avg_sale_price = float(sale_stats.avg_sale_price) if sale_stats and sale_stats.avg_sale_price else None
            avg_jeonse_price = float(rent_stats.avg_jeonse_price) if rent_stats and rent_stats.avg_jeonse_price else None
            jeonse_ratio = None
            
            if avg_sale_price and avg_jeonse_price and avg_sale_price > 0:
                jeonse_ratio = round((avg_jeonse_price / avg_sale_price) * 100, 2)
            
            transaction_count = (sale_stats.sale_count or 0) + (rent_stats.rent_count or 0)
            
            regions_data.append(RegionalComparisonItem(
                region_id=region_id,
                region_name=state.region_name or f"지역 {region_id}",
                jeonse_ratio=jeonse_ratio,
                avg_sale_price=avg_sale_price,
                avg_jeonse_price=avg_jeonse_price,
                transaction_count=transaction_count
            ).model_dump())
        
        return {
            "success": True,
            "data": {
                "base_ym": base_ym,
                "regions": regions_data
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_SERVER_ERROR",
                "message": f"지역별 지표 비교 중 오류가 발생했습니다: {str(e)}"
            }
        )
