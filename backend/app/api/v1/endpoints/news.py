"""
뉴스 API 엔드포인트

부동산 뉴스 크롤링 API를 제공합니다.
DB 저장이 없으므로 크롤링 결과만 반환합니다.
캐싱을 사용하여 성능을 최적화합니다.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Tuple, Any, Optional
from fastapi import APIRouter, HTTPException, status, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.news import news_service
from app.schemas.news import NewsListResponse, NewsDetailResponse, NewsResponse
from app.utils.news import generate_news_id, filter_news_by_location
from app.api.v1.deps import get_db
from app.crud.apartment import apartment as apartment_crud
from app.crud.state import state as state_crud

logger = logging.getLogger(__name__)

router = APIRouter()

# 간단한 메모리 캐시 (프로덕션에서는 Redis 사용 권장)
_cache: Dict[str, Tuple[Any, datetime]] = {}
CACHE_TTL = timedelta(minutes=5)  # 5분간 캐시 유지


def get_cached_data(cache_key: str):
    """캐시에서 데이터 가져오기"""
    if cache_key in _cache:
        cached_data, cached_time = _cache[cache_key]
        if datetime.now() - cached_time < CACHE_TTL:
            logger.debug(f"캐시 히트: {cache_key}")
            return cached_data
        else:
            # 캐시 만료
            del _cache[cache_key]
            logger.debug(f"캐시 만료: {cache_key}")
    return None


def set_cached_data(cache_key: str, data: any):
    """캐시에 데이터 저장"""
    _cache[cache_key] = (data, datetime.now())
    logger.debug(f"캐시 저장: {cache_key}")


@router.get(
    "",
    response_model=NewsListResponse,
    status_code=status.HTTP_200_OK,
    tags=["📰 News (뉴스)"],
    summary="뉴스 목록 크롤링 및 조회",
    description="""
    여러 소스에서 부동산 뉴스를 크롤링하여 목록을 반환합니다.
    
    - DB 저장 없이 실시간 크롤링 결과만 반환
    - 캐싱 적용 (5분 TTL)
    - 소스당 최대 수집 개수 제한 가능
    
    파라미터:
    - limit_per_source: 소스당 최대 수집 개수 (필수)
    - apt_id: 아파트 ID (선택적)
    
    동작 방식:
    - apt_id가 전달되지 않을 경우: 기존 기능과 같이 개수만큼 크롤링하여 반환
    - apt_id가 전달될 경우: 
      * apartment 테이블과 state 테이블을 참고해서 시, 동, 아파트 이름 알아내기
      * 검색 단계별로 관련 뉴스 검색:
        1. 시 + 부동산
        2. 시 + 동 + 부동산
        3. 시 + 동 + 아파트이름 + 부동산
      * 관련된 뉴스 5개 목록을 반환
      * 반환값에 시, 동, 아파트 이름 포함 (meta 필드)
    """,
    responses={
        200: {"description": "크롤링 완료"},
        404: {"description": "아파트를 찾을 수 없음"},
        500: {"description": "크롤링 중 오류 발생"}
    }
)
async def get_news(
    limit_per_source: int = Query(20, ge=1, le=100, description="소스당 최대 수집 개수"),
    apt_id: Optional[int] = Query(None, description="아파트 ID (apartments.apt_id)"),
    db: AsyncSession = Depends(get_db)
):
    """뉴스 목록 크롤링 및 조회"""
    try:
        si = None
        dong = None
        apartment_name = None
        region_name = None
        
        # apt_id가 전달된 경우, 아파트 정보 조회
        if apt_id is not None:
            # 1. Apartments 테이블에서 region_id와 apt_name 찾기
            apartment = await apartment_crud.get(db, id=apt_id)
            if not apartment or apartment.is_deleted:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"아파트를 찾을 수 없습니다: apt_id={apt_id}"
                )
            
            apartment_name = apartment.apt_name
            region_id = apartment.region_id
            
            # 2. States 테이블에서 region_name 찾기
            state = await state_crud.get(db, id=region_id)
            if not state or state.is_deleted:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"지역 정보를 찾을 수 없습니다: region_id={region_id}"
                )
            
            region_name = state.region_name
            city_name = state.city_name
            
            # 3. 시는 city_name에서, 동은 region_name에서 가져오기
            # city_name을 시로 사용 (예: "서울특별시" -> "서울시")
            si = city_name
            if si:
                if "특별시" in si:
                    si = si.replace("특별시", "시")
                elif "광역시" in si:
                    si = si.replace("광역시", "시")
                elif not si.endswith("시"):
                    si = si + "시"
            
            # 동은 region_name에서 "동"으로 끝나는 경우만 추출 (예: "잠실동")
            if region_name and region_name.endswith("동"):
                dong = region_name
            else:
                dong = None
        
        # 캐시 키 생성 (apt_id 또는 지역 파라미터 포함)
        if apt_id is not None:
            cache_key = f"news_list_{limit_per_source}_apt_{apt_id}"
        else:
            cache_key = f"news_list_{limit_per_source}"
        
        # 캐시 확인
        cached_result = get_cached_data(cache_key)
        if cached_result:
            return cached_result
        
        # 캐시 없으면 크롤링 실행
        crawled_news = await news_service.crawl_only(limit_per_source=limit_per_source)
        
        # apt_id가 전달된 경우, 지역 필터링 적용하여 5개 반환
        if apt_id is not None:
            filtered_news = filter_news_by_location(
                news_list=crawled_news,
                si=si,
                dong=dong,
                apartment=apartment_name
            )
        else:
            # apt_id가 없으면 기존처럼 모든 뉴스 반환
            filtered_news = crawled_news
        
        # 크롤링 결과를 NewsResponse 스키마로 변환 (간단한 해시 ID 추가)
        from app.schemas.news import NewsResponse
        news_list = [
            NewsResponse(
                id=generate_news_id(news["url"]),
                **{k: v for k, v in news.items() if k not in ["relevance_score", "matched_category"]}
            ) for news in filtered_news
        ]
        
        # 메타 정보 구성
        meta = {
            "total": len(news_list),
            "limit": len(news_list),
            "offset": 0
        }
        
        # apt_id가 전달된 경우 메타 정보에 추가
        if apt_id is not None:
            meta.update({
                "apt_id": apt_id,
                "apt_name": apartment_name,
                "si": si,
                "dong": dong
            })
        
        response = NewsListResponse(
            success=True,
            data=news_list,
            meta=meta
        )
        
        # 캐시에 저장
        set_cached_data(cache_key, response)
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"뉴스 크롤링 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"크롤링 중 오류가 발생했습니다: {str(e)}"
        )


@router.get(
    "/detail",
    response_model=NewsDetailResponse,
    status_code=status.HTTP_200_OK,
    tags=["📰 News (뉴스)"],
    summary="뉴스 상세 내용 크롤링",
    description="""
    특정 뉴스 URL의 상세 내용을 크롤링합니다.
    
    - 뉴스 목록에서 받은 `url` 필드를 사용하여 상세 조회
    - 캐싱 적용 (5분 TTL)
    - 제목, 본문, 썸네일 등 상세 정보 반환
    """,
    responses={
        200: {"description": "크롤링 완료"},
        400: {"description": "잘못된 URL"},
        404: {"description": "뉴스를 찾을 수 없음"},
        500: {"description": "크롤링 중 오류 발생"}
    }
)
async def get_news_detail_by_url(
    url: str = Query(..., description="뉴스 상세 페이지 URL (뉴스 목록에서 받은 url 필드 사용)")
):
    """뉴스 상세 내용 크롤링"""
    try:
        # 캐시 키 생성
        cache_key = f"news_detail_{generate_news_id(url)}"
        
        # 캐시 확인
        cached_result = get_cached_data(cache_key)
        if cached_result:
            return cached_result
        
        # 캐시 없으면 크롤링 실행
        detail = await news_service.crawl_news_detail(url=url)
        
        if not detail:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"뉴스를 찾을 수 없거나 크롤링에 실패했습니다: {url}"
            )
        
        # 간단한 해시 ID 생성하여 응답 생성
        news_response = NewsResponse(
            id=generate_news_id(url),
            **detail
        )
        
        response = NewsDetailResponse(
            success=True,
            data=news_response
        )
        
        # 캐시에 저장
        set_cached_data(cache_key, response)
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"뉴스 상세 크롤링 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"크롤링 중 오류가 발생했습니다: {str(e)}"
        )
