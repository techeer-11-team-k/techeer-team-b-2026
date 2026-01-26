"""
지도 관련 API 엔드포인트

담당 기능:
- 지도 영역(bounds) 기반 데이터 조회
- 확대 레벨에 따른 시군구/동/아파트 데이터 반환
- 각 레벨별 평균가 정보 포함
"""
import logging
import asyncio
from datetime import date, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, text
from geoalchemy2 import functions as geo_func
from pydantic import BaseModel, Field

from app.api.v1.deps import get_db
from app.models.apartment import Apartment
from app.models.apart_detail import ApartDetail
from app.models.sale import Sale
from app.models.rent import Rent
from app.models.state import State
from app.utils.cache import get_from_cache, set_to_cache, build_cache_key

logger = logging.getLogger(__name__)

router = APIRouter()

# 캐시 TTL: 20분
MAP_CACHE_TTL = 1200


class MapBoundsRequest(BaseModel):
    """지도 영역 요청 스키마"""
    sw_lat: float = Field(..., description="남서쪽 위도")
    sw_lng: float = Field(..., description="남서쪽 경도")
    ne_lat: float = Field(..., description="북동쪽 위도")
    ne_lng: float = Field(..., description="북동쪽 경도")
    zoom_level: int = Field(..., ge=1, le=14, description="지도 확대 레벨 (1~14)")


class RegionPriceItem(BaseModel):
    """지역 가격 정보"""
    region_id: int
    region_name: str
    city_name: Optional[str] = None
    avg_price: float = Field(description="평균 가격 (억원)")
    transaction_count: int
    lat: Optional[float] = None
    lng: Optional[float] = None
    region_type: str = Field(description="sigungu 또는 dong")


class ApartmentPriceItem(BaseModel):
    """아파트 가격 정보"""
    apt_id: int
    apt_name: str
    address: Optional[str] = None
    avg_price: float = Field(description="평균 가격 (억원)")
    min_price: Optional[float] = Field(None, description="최소 거래가 (억원)")
    max_price: Optional[float] = Field(None, description="최대 거래가 (억원)")
    price_per_pyeong: Optional[float] = Field(None, description="평당가 (만원)")
    transaction_count: int
    lat: float
    lng: float


class MapDataResponse(BaseModel):
    """지도 데이터 응답"""
    success: bool = True
    data_type: str = Field(description="regions 또는 apartments")
    regions: Optional[List[RegionPriceItem]] = None
    apartments: Optional[List[ApartmentPriceItem]] = None
    zoom_level: int
    total_count: int


def get_data_type_by_zoom(zoom_level: int) -> str:
    """
    확대 레벨에 따른 데이터 타입 결정
    (카카오맵: 레벨이 낮을수록 확대, 높을수록 축소)
    
    - 레벨 10 이상 (축소): 시/도 레벨
    - 레벨 7~9: 시군구 레벨
    - 레벨 5~6: 동 레벨
    - 레벨 1~4 (확대): 아파트 레벨
    """
    if zoom_level >= 10:
        return "sido"
    elif zoom_level >= 7:
        return "sigungu"
    elif zoom_level >= 5:
        return "dong"
    else:
        return "apartment"


@router.post(
    "/bounds",
    response_model=MapDataResponse,
    status_code=status.HTTP_200_OK,
    tags=["Map"],
    summary="지도 영역 기반 데이터 조회",
    description="""
    지도의 현재 영역(bounds)과 확대 레벨에 따라 적절한 데이터를 반환합니다.
    (카카오맵 레벨: 낮을수록 확대, 높을수록 축소)
    
    ### 확대 레벨별 데이터
    - **레벨 11 이상 (축소)**: 시/도별 평균 가격
    - **레벨 6~10**: 시군구별 평균 가격
    - **레벨 4~5**: 동별 평균 가격
    - **레벨 1~3 (확대)**: 아파트별 가격 정보
    
    ### 요청 파라미터
    - `sw_lat, sw_lng`: 남서쪽 좌표
    - `ne_lat, ne_lng`: 북동쪽 좌표
    - `zoom_level`: 현재 지도 확대 레벨
    - `transaction_type`: 거래 유형 (sale: 매매, jeonse: 전세)
    - `months`: 평균가 계산 기간 (개월)
    
    ### 응답
    - `data_type`: 반환 데이터 타입 (regions / apartments)
    - `regions`: 지역별 데이터 (시/도, 시군구, 동)
    - `apartments`: 아파트별 데이터
    """
)
async def get_map_bounds_data(
    request: MapBoundsRequest,
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세)"),
    months: int = Query(6, ge=1, le=24, description="평균가 계산 기간 (개월)"),
    db: AsyncSession = Depends(get_db)
):
    """
    지도 영역 기반 데이터 조회
    
    확대 레벨에 따라 시군구/동/아파트 데이터를 반환합니다.
    """
    # 캐시 키 생성 (영역을 소수점 2자리로 반올림하여 캐시 효율성 향상)
    sw_lat_r = round(request.sw_lat, 2)
    sw_lng_r = round(request.sw_lng, 2)
    ne_lat_r = round(request.ne_lat, 2)
    ne_lng_r = round(request.ne_lng, 2)
    
    cache_key = build_cache_key(
        "map", "bounds",
        f"{sw_lat_r}_{sw_lng_r}_{ne_lat_r}_{ne_lng_r}",
        str(request.zoom_level),
        transaction_type,
        str(months)
    )
    
    # 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        logger.info(f"[Map Bounds] Cache hit - zoom: {request.zoom_level}")
        return cached_data
    
    try:
        data_type = get_data_type_by_zoom(request.zoom_level)
        
        logger.info(
            f"[Map Bounds] Request - "
            f"zoom: {request.zoom_level}, data_type: {data_type}, "
            f"bounds: ({request.sw_lat:.4f}, {request.sw_lng:.4f}) ~ ({request.ne_lat:.4f}, {request.ne_lng:.4f}), "
            f"transaction_type: {transaction_type}"
        )
        
        if data_type in ["sido", "sigungu", "dong"]:
            # 시/도, 시군구 또는 동 레벨 데이터 조회
            logger.info(f"[Map Bounds] Fetching region prices for type: {data_type}")
            result = await get_region_prices(
                db=db,
                sw_lat=request.sw_lat,
                sw_lng=request.sw_lng,
                ne_lat=request.ne_lat,
                ne_lng=request.ne_lng,
                region_type=data_type,
                transaction_type=transaction_type,
                months=months
            )
            
            logger.info(f"[Map Bounds] Region prices result count: {len(result)}")
            
            response_data = MapDataResponse(
                success=True,
                data_type="regions",
                regions=result,
                apartments=None,
                zoom_level=request.zoom_level,
                total_count=len(result)
            )
        else:
            # 아파트 레벨 데이터 조회
            logger.info(f"[Map Bounds] Fetching apartment prices")
            result = await get_apartment_prices(
                db=db,
                sw_lat=request.sw_lat,
                sw_lng=request.sw_lng,
                ne_lat=request.ne_lat,
                ne_lng=request.ne_lng,
                transaction_type=transaction_type,
                months=months,
                limit=50  # 최대 50개
            )
            
            logger.info(f"[Map Bounds] Apartment prices result count: {len(result)}")
            
            response_data = MapDataResponse(
                success=True,
                data_type="apartments",
                regions=None,
                apartments=result,
                zoom_level=request.zoom_level,
                total_count=len(result)
            )
        
        # 캐시에 저장
        if response_data.total_count > 0:
            await set_to_cache(cache_key, response_data.model_dump(), ttl=MAP_CACHE_TTL)
        
        logger.info(f"[Map Bounds] Response - data_type: {response_data.data_type}, total_count: {response_data.total_count}")
        
        return response_data
        
    except Exception as e:
        logger.error(f"[Map Bounds] Error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"지도 데이터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/directions",
    status_code=status.HTTP_200_OK,
    tags=["Map"],
    summary="자동차 길찾기 (카카오모빌리티)",
    description="""
    카카오모빌리티 길찾기 API를 프록시하여 자동차 경로를 조회합니다.
    
    ### Query Parameters
    - `origin`: 출발지 좌표 (경도,위도)
    - `destination`: 목적지 좌표 (경도,위도)
    - `priority`: 우선순위 (RECOMMEND: 추천, TIME: 최단시간, DISTANCE: 최단거리)
    - `car_type`: 차종 (1: 승용차, 2: 중형승합차, 3: 대형승합차, 4: 대형화물차, 5: 특수화물차, 6: 경차, 7: 이륜차)
    - `car_fuel`: 유종 (GASOLINE, DIESEL, LPG)
    """
)
async def get_directions(
    origin: str = Query(..., description="출발지 (경도,위도)"),
    destination: str = Query(..., description="목적지 (경도,위도)"),
    priority: str = Query("RECOMMEND", description="우선순위 (RECOMMEND, TIME, DISTANCE)"),
    car_type: int = Query(1, description="차종"),
    car_fuel: str = Query("GASOLINE", description="유종"),
):
    """
    자동차 길찾기 조회
    """
    from app.core.config import settings
    import httpx
    
    if not settings.KAKAO_REST_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="서버에 카카오 REST API 키가 설정되지 않았습니다."
        )
        
    url = "https://apis-navi.kakaomobility.com/v1/directions"
    headers = {
        "Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}",
        "Content-Type": "application/json"
    }
    params = {
        "origin": origin,
        "destination": destination,
        "priority": priority,
        "car_type": car_type,
        "car_fuel": car_fuel,
        "roadevent": 0
    }
    
    async with httpx.AsyncClient() as client:
        try:
            logger.info(f"[Directions] Request - origin: {origin}, dest: {destination}")
            response = await client.get(url, headers=headers, params=params)
            
            if response.status_code != 200:
                logger.error(f"[Directions] API Error: {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"카카오 길찾기 API 오류: {response.text}"
                )
            
            data = response.json()
            return data
            
        except httpx.RequestError as e:
            logger.error(f"[Directions] Network Error: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"길찾기 서비스 연결 실패: {str(e)}"
            )
        except Exception as e:
            logger.error(f"[Directions] Error: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"길찾기 조회 중 오류가 발생했습니다: {str(e)}"
            )


@router.get(
    "/places/category",
    status_code=status.HTTP_200_OK,
    tags=["Map"],
    summary="카테고리 장소 검색 (카카오 로컬)",
    description="""
    카카오 로컬 API를 프록시하여 특정 카테고리의 장소를 검색합니다.
    
    ### 주요 카테고리 코드
    - `SW8`: 지하철역
    - `SC4`: 학교
    - `MT1`: 대형마트
    - `CS2`: 편의점
    - `PS3`: 어린이집, 유치원
    - `AC5`: 학원
    - `PK6`: 주차장
    - `OL7`: 주유소, 충전소
    - `CE7`: 카페
    - `HP8`: 병원
    - `PM9`: 약국
    
    ### Query Parameters
    - `category_group_code`: 카테고리 코드 (필수)
    - `x`: 중심 좌표 경도 (longitude)
    - `y`: 중심 좌표 위도 (latitude)
    - `radius`: 반경 (미터, 기본값 1000, 최대 20000)
    - `rect`: 사각형 범위 좌표 (min_x,min_y,max_x,max_y) - x,y,radius 대신 사용 가능
    - `page`: 페이지 번호 (기본 1)
    - `size`: 페이지 당 개수 (기본 15)
    - `sort`: 정렬 순서 (distance 또는 accuracy, 기본 accuracy)
    """
)
async def get_places_by_category(
    category_group_code: str = Query(..., description="카테고리 그룹 코드 (예: SW8, SC4)"),
    x: Optional[str] = Query(None, description="중심 좌표 경도 (longitude)"),
    y: Optional[str] = Query(None, description="중심 좌표 위도 (latitude)"),
    radius: int = Query(1000, description="반경 (미터)"),
    rect: Optional[str] = Query(None, description="사각형 범위 (min_x,min_y,max_x,max_y)"),
    page: int = Query(1, description="페이지 번호"),
    size: int = Query(15, description="페이지 당 개수"),
    sort: str = Query("accuracy", description="정렬 순서 (distance, accuracy)")
):
    """
    카테고리 장소 검색
    """
    from app.core.config import settings
    import httpx
    
    if not settings.KAKAO_REST_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="서버에 카카오 REST API 키가 설정되지 않았습니다."
        )
        
    # x, y, radius 또는 rect 중 하나는 필수
    if not rect and not (x and y):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="좌표(x, y) 또는 사각형 범위(rect) 중 하나는 필수입니다."
        )
        
    url = "https://dapi.kakao.com/v2/local/search/category.json"
    headers = {
        "Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"
    }
    
    params = {
        "category_group_code": category_group_code,
        "page": page,
        "size": size,
        "sort": sort
    }
    
    if rect:
        params["rect"] = rect
    else:
        params["x"] = x
        params["y"] = y
        params["radius"] = radius
    
    async with httpx.AsyncClient() as client:
        try:
            logger.info(f"[Places] Request - category: {category_group_code}")
            response = await client.get(url, headers=headers, params=params)
            
            if response.status_code != 200:
                logger.error(f"[Places] API Error: {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"카카오 로컬 API 오류: {response.text}"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            logger.error(f"[Places] Network Error: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"장소 검색 서비스 연결 실패: {str(e)}"
            )
        except Exception as e:
            logger.error(f"[Places] Error: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"장소 검색 중 오류가 발생했습니다: {str(e)}"
            )


@router.get(
    "/places/keyword",
    status_code=status.HTTP_200_OK,
    tags=["Map"],
    summary="키워드 장소 검색 (카카오 로컬)",
    description="""
    카카오 로컬 API를 프록시하여 키워드로 장소를 검색합니다.
    """
)
async def get_places_by_keyword(
    query: str = Query(..., description="검색 키워드"),
    category_group_code: Optional[str] = Query(None, description="카테고리 그룹 코드 필터 (예: SW8, SC4)"),
    x: Optional[str] = Query(None, description="중심 좌표 경도"),
    y: Optional[str] = Query(None, description="중심 좌표 위도"),
    radius: int = Query(20000, description="반경 (미터)"),
    page: int = Query(1, description="페이지 번호"),
    size: int = Query(15, description="페이지 당 개수"),
    sort: str = Query("accuracy", description="정렬 순서")
):
    """
    키워드 장소 검색
    """
    from app.core.config import settings
    import httpx
    
    if not settings.KAKAO_REST_API_KEY:
        raise HTTPException(status_code=500, detail="Kakao API Key missing")
        
    url = "https://dapi.kakao.com/v2/local/search/keyword.json"
    headers = {"Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"}
    
    params = {
        "query": query,
        "page": page,
        "size": size,
        "sort": sort,
        "radius": radius
    }
    if category_group_code:
        params["category_group_code"] = category_group_code
    if x and y:
        params["x"] = x
        params["y"] = y
        
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"[Keyword Search] Error: {e}")
            raise HTTPException(status_code=500, detail=str(e))


async def get_region_prices(
    db: AsyncSession,
    sw_lat: float,
    sw_lng: float,
    ne_lat: float,
    ne_lng: float,
    region_type: str,
    transaction_type: str,
    months: int
) -> List[RegionPriceItem]:
    """
    지역별 평균 가격 조회
    
    Args:
        region_type: "sigungu" 또는 "dong"
    """
    logger.info(f"[get_region_prices] region_type: {region_type}, transaction_type: {transaction_type}, months: {months}")
    
    # 거래 테이블 및 필드 선택
    if transaction_type == "sale":
        trans_table = Sale
        price_field = Sale.trans_price
        date_field = Sale.contract_date
        base_filter = and_(
            Sale.is_canceled == False,
            (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
            Sale.trans_price.isnot(None),
            Sale.contract_date.isnot(None)
        )
    else:  # jeonse
        trans_table = Rent
        price_field = Rent.deposit_price
        date_field = Rent.deal_date
        base_filter = and_(
            or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),
            (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
            Rent.deposit_price.isnot(None),
            Rent.deal_date.isnot(None)
        )
    
    # 날짜 범위
    end_date = date.today()
    start_date = end_date - timedelta(days=months * 30)
    
    # 영역 내의 지역만 조회 (geometry 기반)
    bounds_filter = or_(
        State.geometry.is_(None),
        geo_func.ST_Within(
            State.geometry,
            geo_func.ST_MakeEnvelope(sw_lng, sw_lat, ne_lng, ne_lat, 4326)
        )
    )
    
    # region_type에 따른 쿼리 분기
    if region_type == "sido":
        # 시/도 레벨: city_name으로 그룹화
        stmt = (
            select(
                func.min(State.region_id).label('region_id'),
                State.city_name.label('region_name'),
                State.city_name,
                func.avg(price_field).label('avg_price'),
                func.count(trans_table.trans_id).label('transaction_count'),
                func.avg(geo_func.ST_X(State.geometry)).label('lng'),
                func.avg(geo_func.ST_Y(State.geometry)).label('lat')
            )
            .select_from(trans_table)
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= start_date,
                    date_field <= end_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    State.is_deleted == False,
                    State.city_name.isnot(None)
                )
            )
            .group_by(State.city_name)
            .having(func.count(trans_table.trans_id) >= 1)
            .order_by(desc('transaction_count'))
            .limit(50)
        )
    elif region_type == "sigungu":
        # 시군구 레벨: region_code 앞 5자리로 그룹화 (동 데이터를 시군구로 집계)
        # 중요: 전체 시군구의 거래 데이터를 사용하여 평균 가격 계산 (bounds 필터 제외)
        # 그 다음 지도 bounds에 있는 시군구만 필터링하여 일관된 평균 가격 유지
        sigungu_code = func.substr(State.region_code, 1, 5)
        
        # 1단계: 전체 시군구의 평균 가격 계산 (bounds 필터 없이)
        sigungu_avg_subquery = (
            select(
                sigungu_code.label('sigungu_code'),
                func.min(State.region_id).label('region_id'),
                func.min(State.region_name).label('region_name'),
                func.min(State.city_name).label('city_name'),
                func.avg(price_field).label('avg_price'),
                func.count(trans_table.trans_id).label('transaction_count'),
                func.avg(geo_func.ST_X(State.geometry)).label('lng'),
                func.avg(geo_func.ST_Y(State.geometry)).label('lat')
            )
            .select_from(trans_table)
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= start_date,
                    date_field <= end_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    State.is_deleted == False,
                    State.region_code.isnot(None)
                )
            )
            .group_by(sigungu_code)
            .having(func.count(trans_table.trans_id) >= 1)
        ).alias('sigungu_avg')
        
        # 2단계: 지도 bounds에 있는 시군구만 필터링
        # bounds에 있는 시군구의 region_code를 찾기
        bounds_sigungu_subquery = (
            select(
                func.substr(State.region_code, 1, 5).label('sigungu_code')
            )
            .select_from(State)
            .where(
                and_(
                    State.is_deleted == False,
                    State.region_code.isnot(None),
                    bounds_filter
                )
            )
            .distinct()
        ).alias('bounds_sigungu')
        
        # 최종 쿼리: 전체 시군구 평균과 bounds 필터 조인
        stmt = (
            select(
                sigungu_avg_subquery.c.region_id,
                sigungu_avg_subquery.c.region_name,
                sigungu_avg_subquery.c.city_name,
                sigungu_avg_subquery.c.avg_price,
                sigungu_avg_subquery.c.transaction_count,
                sigungu_avg_subquery.c.lng,
                sigungu_avg_subquery.c.lat,
                sigungu_avg_subquery.c.sigungu_code
            )
            .select_from(sigungu_avg_subquery)
            .join(
                bounds_sigungu_subquery,
                sigungu_avg_subquery.c.sigungu_code == bounds_sigungu_subquery.c.sigungu_code
            )
            .order_by(desc(sigungu_avg_subquery.c.transaction_count))
            .limit(100)
        )
    else:
        # 동 레벨: 개별 동으로 표시
        # 중요: 전체 동의 거래 데이터를 사용하여 평균 가격 계산 (bounds 필터 제외)
        # 그 다음 지도 bounds에 있는 동만 필터링하여 일관된 평균 가격 유지
        
        # 1단계: 전체 동의 평균 가격 계산 (bounds 필터 없이)
        dong_avg_subquery = (
            select(
                State.region_id,
                State.region_name,
                State.city_name,
                func.avg(price_field).label('avg_price'),
                func.count(trans_table.trans_id).label('transaction_count'),
                geo_func.ST_X(State.geometry).label('lng'),
                geo_func.ST_Y(State.geometry).label('lat')
            )
            .select_from(trans_table)
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= start_date,
                    date_field <= end_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    State.is_deleted == False
                )
            )
            .group_by(State.region_id, State.region_name, State.city_name, State.geometry)
            .having(func.count(trans_table.trans_id) >= 1)
        ).alias('dong_avg')
        
        # 2단계: 지도 bounds에 있는 동만 필터링
        bounds_dong_subquery = (
            select(
                State.region_id
            )
            .select_from(State)
            .where(
                and_(
                    State.is_deleted == False,
                    bounds_filter
                )
            )
            .distinct()
        ).alias('bounds_dong')
        
        # 최종 쿼리: 전체 동 평균과 bounds 필터 조인
        stmt = (
            select(
                dong_avg_subquery.c.region_id,
                dong_avg_subquery.c.region_name,
                dong_avg_subquery.c.city_name,
                dong_avg_subquery.c.avg_price,
                dong_avg_subquery.c.transaction_count,
                dong_avg_subquery.c.lng,
                dong_avg_subquery.c.lat
            )
            .select_from(dong_avg_subquery)
            .join(
                bounds_dong_subquery,
                dong_avg_subquery.c.region_id == bounds_dong_subquery.c.region_id
            )
            .order_by(desc(dong_avg_subquery.c.transaction_count))
            .limit(100)
        )
    
    result = await db.execute(stmt)
    rows = result.fetchall()
    
    logger.info(f"[get_region_prices] Query returned {len(rows)} rows")
    
    # 시군구 레벨인 경우, 시군구 이름을 별도 조회
    sigungu_names = {}
    if region_type == "sigungu" and rows:
        sigungu_codes = [row.sigungu_code + "00000" for row in rows if hasattr(row, 'sigungu_code') and row.sigungu_code]
        if sigungu_codes:
            name_stmt = (
                select(State.region_code, State.region_name)
                .where(State.region_code.in_(sigungu_codes))
            )
            name_result = await db.execute(name_stmt)
            for name_row in name_result.fetchall():
                # region_code 앞 5자리를 키로 사용
                sigungu_names[name_row.region_code[:5]] = name_row.region_name
            logger.info(f"[get_region_prices] Found {len(sigungu_names)} sigungu names")
    
    region_prices = []
    null_geometry_count = 0
    for row in rows:
        avg_price_billion = round(float(row.avg_price or 0) / 10000, 2)  # 억원 단위
        
        lat_val = float(row.lat) if row.lat else None
        lng_val = float(row.lng) if row.lng else None
        
        if lat_val is None or lng_val is None:
            null_geometry_count += 1
        
        # 시군구 레벨인 경우 시군구 이름 사용
        if region_type == "sigungu" and hasattr(row, 'sigungu_code') and row.sigungu_code:
            region_name = sigungu_names.get(row.sigungu_code, row.region_name)
        else:
            region_name = row.region_name
        
        region_prices.append(RegionPriceItem(
            region_id=row.region_id,
            region_name=region_name,
            city_name=row.city_name,
            avg_price=avg_price_billion,
            transaction_count=row.transaction_count or 0,
            lat=lat_val,
            lng=lng_val,
            region_type=region_type
        ))
    
    if null_geometry_count > 0:
        logger.warning(f"[get_region_prices] {null_geometry_count} regions have null geometry")
    
    logger.info(f"[get_region_prices] Returning {len(region_prices)} region prices")
    return region_prices


async def get_apartment_prices(
    db: AsyncSession,
    sw_lat: float,
    sw_lng: float,
    ne_lat: float,
    ne_lng: float,
    transaction_type: str,
    months: int,
    limit: int = 50
) -> List[ApartmentPriceItem]:
    """
    아파트별 평균 가격 조회
    """
    logger.info(f"[get_apartment_prices] transaction_type: {transaction_type}, months: {months}, limit: {limit}")
    
    # 거래 테이블 및 필드 선택
    if transaction_type == "sale":
        trans_table = Sale
        price_field = Sale.trans_price
        area_field = Sale.exclusive_area
        date_field = Sale.contract_date
        base_filter = and_(
            Sale.is_canceled == False,
            (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
            Sale.trans_price.isnot(None),
            Sale.exclusive_area.isnot(None),
            Sale.exclusive_area > 0,
            Sale.contract_date.isnot(None)
        )
    else:  # jeonse
        trans_table = Rent
        price_field = Rent.deposit_price
        area_field = Rent.exclusive_area
        date_field = Rent.deal_date
        base_filter = and_(
            or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),
            (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
            Rent.deposit_price.isnot(None),
            Rent.exclusive_area.isnot(None),
            Rent.exclusive_area > 0,
            Rent.deal_date.isnot(None)
        )
    
    # 날짜 범위
    end_date = date.today()
    start_date = end_date - timedelta(days=months * 30)
    
    # 영역 내의 아파트만 조회 (geometry 기반)
    bounds_filter = geo_func.ST_Within(
        ApartDetail.geometry,
        geo_func.ST_MakeEnvelope(sw_lng, sw_lat, ne_lng, ne_lat, 4326)
    )
    
    stmt = (
        select(
            Apartment.apt_id,
            Apartment.apt_name,
            ApartDetail.road_address,
            ApartDetail.jibun_address,
            func.avg(price_field).label('avg_price'),
            func.min(price_field).label('min_price'),
            func.max(price_field).label('max_price'),
            func.avg(price_field / area_field * 3.3).label('price_per_pyeong'),
            func.count(trans_table.trans_id).label('transaction_count'),
            geo_func.ST_X(ApartDetail.geometry).label('lng'),
            geo_func.ST_Y(ApartDetail.geometry).label('lat')
        )
        .select_from(trans_table)
        .join(Apartment, trans_table.apt_id == Apartment.apt_id)
        .join(ApartDetail, Apartment.apt_id == ApartDetail.apt_id)
        .where(
            and_(
                base_filter,
                date_field >= start_date,
                date_field <= end_date,
                bounds_filter,
                (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                ApartDetail.is_deleted == False,
                ApartDetail.geometry.isnot(None)
            )
        )
        .group_by(
            Apartment.apt_id,
            Apartment.apt_name,
            ApartDetail.road_address,
            ApartDetail.jibun_address,
            ApartDetail.geometry
        )
        .having(func.count(trans_table.trans_id) >= 1)
        .order_by(desc('transaction_count'))
        .limit(limit)
    )
    
    result = await db.execute(stmt)
    rows = result.fetchall()
    
    logger.info(f"[get_apartment_prices] Query returned {len(rows)} rows")
    
    apartment_prices = []
    for row in rows:
        avg_price_billion = round(float(row.avg_price or 0) / 10000, 2)  # 억원 단위
        min_price_billion = round(float(row.min_price or 0) / 10000, 2) if row.min_price else None
        max_price_billion = round(float(row.max_price or 0) / 10000, 2) if row.max_price else None
        price_per_pyeong = round(float(row.price_per_pyeong or 0), 1) if row.price_per_pyeong else None
        
        apartment_prices.append(ApartmentPriceItem(
            apt_id=row.apt_id,
            apt_name=row.apt_name,
            address=row.road_address or row.jibun_address,
            avg_price=avg_price_billion,
            min_price=min_price_billion,
            max_price=max_price_billion,
            price_per_pyeong=price_per_pyeong,
            transaction_count=row.transaction_count or 0,
            lat=float(row.lat),
            lng=float(row.lng)
        ))
    
    logger.info(f"[get_apartment_prices] Returning {len(apartment_prices)} apartment prices")
    return apartment_prices


@router.get(
    "/regions/prices",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["Map"],
    summary="전체 지역 평균 가격 조회",
    description="""
    전체 시군구 또는 동의 평균 가격을 조회합니다.
    지도 초기 로딩 시 사용됩니다.
    
    ### Query Parameters
    - `region_type`: 지역 유형 (sigungu: 시군구, dong: 동)
    - `transaction_type`: 거래 유형 (sale: 매매, jeonse: 전세)
    - `months`: 평균가 계산 기간 (개월)
    - `city_name`: 특정 시도로 필터링 (선택)
    """
)
async def get_all_region_prices(
    region_type: str = Query("sigungu", description="지역 유형: sigungu(시군구), dong(동)"),
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세)"),
    months: int = Query(6, ge=1, le=24, description="평균가 계산 기간 (개월)"),
    city_name: Optional[str] = Query(None, description="시도명 필터 (예: 서울특별시)"),
    db: AsyncSession = Depends(get_db)
):
    """
    전체 지역 평균 가격 조회
    """
    cache_key = build_cache_key(
        "map", "region_prices",
        region_type,
        transaction_type,
        str(months),
        city_name or "all"
    )
    
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return cached_data
    
    try:
        # 거래 테이블 및 필드 선택
        if transaction_type == "sale":
            trans_table = Sale
            price_field = Sale.trans_price
            date_field = Sale.contract_date
            base_filter = and_(
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.trans_price.isnot(None),
                Sale.contract_date.isnot(None)
            )
        else:
            trans_table = Rent
            price_field = Rent.deposit_price
            date_field = Rent.deal_date
            base_filter = and_(
                or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deposit_price.isnot(None),
                Rent.deal_date.isnot(None)
            )
        
        # 날짜 범위
        end_date = date.today()
        start_date = end_date - timedelta(days=months * 30)
        
        # region_type에 따른 필터
        if region_type == "sigungu":
            region_filter = State.region_code.like("_____00000")
        else:
            region_filter = ~State.region_code.like("_____00000")
        
        # 시도 필터
        city_filter = State.city_name == city_name if city_name else True
        
        stmt = (
            select(
                State.region_id,
                State.region_name,
                State.city_name,
                func.avg(price_field).label('avg_price'),
                func.count(trans_table.trans_id).label('transaction_count'),
                geo_func.ST_X(State.geometry).label('lng'),
                geo_func.ST_Y(State.geometry).label('lat')
            )
            .select_from(trans_table)
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(State, Apartment.region_id == State.region_id)
            .where(
                and_(
                    base_filter,
                    date_field >= start_date,
                    date_field <= end_date,
                    region_filter,
                    city_filter,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    State.is_deleted == False
                )
            )
            .group_by(State.region_id, State.region_name, State.city_name, State.geometry)
            .having(func.count(trans_table.trans_id) >= 1)
            .order_by(desc('avg_price'))
        )
        
        result = await db.execute(stmt)
        rows = result.fetchall()
        
        data = []
        for row in rows:
            avg_price_billion = round(float(row.avg_price or 0) / 10000, 2)
            
            data.append({
                "region_id": row.region_id,
                "region_name": row.region_name,
                "city_name": row.city_name,
                "avg_price": avg_price_billion,
                "transaction_count": row.transaction_count or 0,
                "lat": float(row.lat) if row.lat else None,
                "lng": float(row.lng) if row.lng else None,
                "region_type": region_type
            })
        
        response_data = {
            "success": True,
            "data": data,
            "total_count": len(data),
            "region_type": region_type,
            "transaction_type": transaction_type
        }
        
        if len(data) > 0:
            await set_to_cache(cache_key, response_data, ttl=MAP_CACHE_TTL)
        
        return response_data
        
    except Exception as e:
        logger.error(f" [Map Region Prices] 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"지역 가격 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/apartments/nearby",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["Map"],
    summary="주변 아파트 조회",
    description="""
    특정 좌표 주변의 아파트를 조회합니다.
    
    ### Query Parameters
    - `lat`: 중심 위도
    - `lng`: 중심 경도
    - `radius_meters`: 검색 반경 (미터, 기본값: 1000)
    - `transaction_type`: 거래 유형
    - `months`: 평균가 계산 기간
    - `limit`: 최대 반환 개수
    """
)
async def get_nearby_apartments(
    lat: float = Query(..., description="중심 위도"),
    lng: float = Query(..., description="중심 경도"),
    radius_meters: int = Query(1000, ge=100, le=5000, description="검색 반경 (미터)"),
    transaction_type: str = Query("sale", description="거래 유형"),
    months: int = Query(6, ge=1, le=24, description="평균가 계산 기간"),
    limit: int = Query(30, ge=1, le=100, description="최대 반환 개수"),
    db: AsyncSession = Depends(get_db)
):
    """
    주변 아파트 조회
    
    특정 좌표를 중심으로 반경 내의 아파트를 조회합니다.
    """
    cache_key = build_cache_key(
        "map", "nearby",
        f"{round(lat, 4)}_{round(lng, 4)}",
        str(radius_meters),
        transaction_type,
        str(months),
        str(limit)
    )
    
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return cached_data
    
    try:
        # 거래 테이블 및 필드 선택
        if transaction_type == "sale":
            trans_table = Sale
            price_field = Sale.trans_price
            area_field = Sale.exclusive_area
            date_field = Sale.contract_date
            base_filter = and_(
                Sale.is_canceled == False,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                Sale.trans_price.isnot(None),
                Sale.exclusive_area.isnot(None),
                Sale.exclusive_area > 0,
                Sale.contract_date.isnot(None)
            )
        else:
            trans_table = Rent
            price_field = Rent.deposit_price
            area_field = Rent.exclusive_area
            date_field = Rent.deal_date
            base_filter = and_(
                or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                Rent.deposit_price.isnot(None),
                Rent.exclusive_area.isnot(None),
                Rent.exclusive_area > 0,
                Rent.deal_date.isnot(None)
            )
        
        # 날짜 범위
        end_date = date.today()
        start_date = end_date - timedelta(days=months * 30)
        
        # 중심점 생성
        center_point = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)
        
        # 반경 내 아파트 조회
        distance_expr = geo_func.ST_Distance(
            geo_func.ST_Transform(ApartDetail.geometry, 3857),
            geo_func.ST_Transform(center_point, 3857)
        )
        
        stmt = (
            select(
                Apartment.apt_id,
                Apartment.apt_name,
                ApartDetail.road_address,
                ApartDetail.jibun_address,
                func.avg(price_field).label('avg_price'),
                func.avg(price_field / area_field * 3.3).label('price_per_pyeong'),
                func.count(trans_table.trans_id).label('transaction_count'),
                geo_func.ST_X(ApartDetail.geometry).label('lng'),
                geo_func.ST_Y(ApartDetail.geometry).label('lat'),
                distance_expr.label('distance')
            )
            .select_from(trans_table)
            .join(Apartment, trans_table.apt_id == Apartment.apt_id)
            .join(ApartDetail, Apartment.apt_id == ApartDetail.apt_id)
            .where(
                and_(
                    base_filter,
                    date_field >= start_date,
                    date_field <= end_date,
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)),
                    ApartDetail.is_deleted == False,
                    ApartDetail.geometry.isnot(None),
                    geo_func.ST_DWithin(
                        geo_func.ST_Transform(ApartDetail.geometry, 3857),
                        geo_func.ST_Transform(center_point, 3857),
                        radius_meters
                    )
                )
            )
            .group_by(
                Apartment.apt_id,
                Apartment.apt_name,
                ApartDetail.road_address,
                ApartDetail.jibun_address,
                ApartDetail.geometry
            )
            .having(func.count(trans_table.trans_id) >= 1)
            .order_by('distance')
            .limit(limit)
        )
        
        result = await db.execute(stmt)
        rows = result.fetchall()
        
        data = []
        for row in rows:
            avg_price_billion = round(float(row.avg_price or 0) / 10000, 2)
            price_per_pyeong = round(float(row.price_per_pyeong or 0), 1) if row.price_per_pyeong else None
            
            data.append({
                "apt_id": row.apt_id,
                "apt_name": row.apt_name,
                "address": row.road_address or row.jibun_address,
                "avg_price": avg_price_billion,
                "price_per_pyeong": price_per_pyeong,
                "transaction_count": row.transaction_count or 0,
                "lat": float(row.lat),
                "lng": float(row.lng),
                "distance_meters": round(float(row.distance or 0), 1)
            })
        
        response_data = {
            "success": True,
            "data": data,
            "total_count": len(data),
            "center": {"lat": lat, "lng": lng},
            "radius_meters": radius_meters
        }
        
        if len(data) > 0:
            await set_to_cache(cache_key, response_data, ttl=MAP_CACHE_TTL)
        
        return response_data
        
    except Exception as e:
        logger.error(f" [Map Nearby] 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"주변 아파트 조회 중 오류가 발생했습니다: {str(e)}"
        )
