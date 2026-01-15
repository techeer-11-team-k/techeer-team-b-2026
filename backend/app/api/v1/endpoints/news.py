"""
뉴스 API 엔드포인트

부동산 뉴스 크롤링 API를 제공합니다.
DB 저장이 없으므로 크롤링 결과만 반환합니다.
캐싱을 사용하여 성능을 최적화합니다.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Tuple, Any
from fastapi import APIRouter, HTTPException, status, Query

from app.services.news import news_service
from app.schemas.news import NewsListResponse, NewsDetailResponse, NewsResponse
from app.utils.news import generate_news_id

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
    """,
    responses={
        200: {"description": "크롤링 완료"},
        500: {"description": "크롤링 중 오류 발생"}
    }
)
async def get_news(
    limit_per_source: int = Query(20, ge=1, le=100, description="소스당 최대 수집 개수")
):
    """뉴스 목록 크롤링 및 조회"""
    try:
        # 캐시 키 생성
        cache_key = f"news_list_{limit_per_source}"
        
        # 캐시 확인
        cached_result = get_cached_data(cache_key)
        if cached_result:
            return cached_result
        
        # 캐시 없으면 크롤링 실행
        crawled_news = await news_service.crawl_only(limit_per_source=limit_per_source)
        
        # 크롤링 결과를 NewsResponse 스키마로 변환 (간단한 해시 ID 추가)
        from app.schemas.news import NewsResponse
        news_list = [
            NewsResponse(
                id=generate_news_id(news["url"]),
                **news
            ) for news in crawled_news
        ]
        
        response = NewsListResponse(
            success=True,
            data=news_list,
            meta={
                "total": len(news_list),
                "limit": len(news_list),
                "offset": 0
            }
        )
        
        # 캐시에 저장
        set_cached_data(cache_key, response)
        
        return response
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


