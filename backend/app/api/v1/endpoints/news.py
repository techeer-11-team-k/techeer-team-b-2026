"""
뉴스 API 엔드포인트

부동산 뉴스 크롤링 API를 제공합니다.
DB 저장이 없으므로 크롤링 결과만 반환합니다.
Redis 캐싱을 사용하여 성능을 최적화합니다.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Tuple, Any, Optional, List
from fastapi import APIRouter, HTTPException, status, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.news import news_service
from app.schemas.news import NewsListResponse, NewsDetailResponse, NewsResponse
from app.utils.news import generate_news_id, filter_news_by_location, filter_news_by_keywords
from app.api.v1.deps import get_db
from app.crud.apartment import apartment as apartment_crud
from app.crud.state import state as state_crud
from app.utils.cache import get_from_cache, set_to_cache

logger = logging.getLogger(__name__)

router = APIRouter()

# ===== Redis 캐시 TTL 설정 (성능 최적화) =====
# 뉴스 크롤링은 비용이 높으므로 캐시 TTL을 충분히 길게 설정
NEWS_LIST_CACHE_TTL = 1800    # 뉴스 목록: 30분 (기존 10분 → 30분)
NEWS_DETAIL_CACHE_TTL = 3600  # 뉴스 상세: 1시간 (기존 10분 → 1시간)
NEWS_CACHE_TTL = NEWS_LIST_CACHE_TTL  # 하위 호환성 유지


async def get_cached_news_data(cache_key: str):
    """Redis에서 뉴스 캐시 데이터 가져오기"""
    try:
        cached = await get_from_cache(f"news:{cache_key}")
        if cached:
            logger.debug(f" 뉴스 캐시 히트: {cache_key}")
            return cached
    except Exception as e:
        logger.warning(f" 뉴스 캐시 조회 실패 (무시): {e}")
    return None


async def set_cached_news_data(cache_key: str, data: any, is_detail: bool = False):
    """Redis에 뉴스 캐시 데이터 저장"""
    try:
        # 상세 뉴스는 더 긴 TTL 적용
        ttl = NEWS_DETAIL_CACHE_TTL if is_detail else NEWS_LIST_CACHE_TTL
        await set_to_cache(f"news:{cache_key}", data, ttl=ttl)
        logger.debug(f" 뉴스 캐시 저장: {cache_key} (TTL: {ttl}초)")
    except Exception as e:
        logger.warning(f" 뉴스 캐시 저장 실패 (무시): {e}")


@router.get(
    "",
    response_model=NewsListResponse,
    status_code=status.HTTP_200_OK,
    tags=[" News (뉴스)"],
    summary="뉴스 목록 크롤링 및 조회",
    description="""
    여러 소스에서 부동산 뉴스를 크롤링하여 목록을 반환합니다.
    
    - DB 저장 없이 실시간 크롤링 결과만 반환
    - 캐싱 적용 (5분 TTL)
    - 소스당 최대 수집 개수 제한 가능
    
    파라미터:
    - limit_per_source: 소스당 최대 수집 개수 (필수)
    - apt_id: 아파트 ID (선택적)
    - keywords: 검색 키워드 리스트 (선택적, 예: ["서울시", "강남구", "역삼동"])
    
    동작 방식:
    - apt_id가 전달되지 않고 keywords도 없는 경우: 기존 기능과 같이 개수만큼 크롤링하여 반환
    - apt_id가 전달될 경우: 
      * apartment 테이블과 state 테이블을 참고해서 시, 동, 아파트 이름 알아내기
      * 검색 단계별로 관련 뉴스 검색:
        1. 시 + 부동산
        2. 시 + 동 + 부동산
        3. 시 + 동 + 아파트이름 + 부동산
      * 관련된 뉴스 5개 목록을 반환
      * 반환값에 시, 동, 아파트 이름 포함 (meta 필드)
    - keywords가 전달될 경우:
      * apt_id가 있어도 keywords를 우선 사용
      * 각 키워드가 뉴스 제목이나 본문에 포함되어 있는지 확인
      * 제목에 포함된 키워드는 높은 점수, 본문에 포함된 키워드는 낮은 점수
      * 관련성 점수가 높은 순으로 최대 5개 뉴스 반환
      * 반환값에 keywords 포함 (meta 필드)
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
    keywords: Optional[List[str]] = Query(None, description="검색 키워드 리스트 (선택적, 예: ['서울시', '강남구', '역삼동'])"),
    db: AsyncSession = Depends(get_db)
):
    """뉴스 목록 크롤링 및 조회"""
    try:
        search_keywords = keywords if keywords else []  # 키워드 리스트
        apartment_name = None
        region_name = None
        si_value = None
        dong_value = None
        
        # 키워드가 전달되지 않은 경우에만 apt_id로부터 정보 추출
        has_keywords = search_keywords and len(search_keywords) > 0
        
        # apt_id가 전달되고 키워드가 없는 경우, 아파트 정보 조회
        if apt_id is not None and not has_keywords:
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
            si_value = city_name
            if si_value:
                if "특별시" in si_value:
                    si_value = si_value.replace("특별시", "시")
                elif "광역시" in si_value:
                    si_value = si_value.replace("광역시", "시")
                elif not si_value.endswith("시"):
                    si_value = si_value + "시"
            
            # 동은 region_name에서 "동"으로 끝나는 경우만 추출 (예: "잠실동")
            if region_name and region_name.endswith("동"):
                dong_value = region_name
            else:
                dong_value = None
        
        # 캐시 키 생성 (apt_id 또는 keywords 포함)
        if has_keywords:
            # 키워드를 정렬하여 동일한 키워드 조합에 대해 같은 캐시 사용
            sorted_keywords = sorted([kw.strip() for kw in search_keywords if kw and kw.strip()])
            keywords_str = "_".join(sorted_keywords)
            cache_key = f"news_list_{limit_per_source}_keywords_{keywords_str}"
        elif apt_id is not None:
            cache_key = f"news_list_{limit_per_source}_apt_{apt_id}"
        else:
            cache_key = f"news_list_{limit_per_source}"
        
        # 캐시 확인 (Redis)
        cached_result = await get_cached_news_data(cache_key)
        if cached_result:
            # Pydantic 모델로 변환하여 반환
            return NewsListResponse(**cached_result)
        
        # 캐시 없으면 크롤링 실행
        logger.info(f" 뉴스 캐시 미스 - 크롤링 시작: {cache_key}")
        crawled_news = await news_service.crawl_only(limit_per_source=limit_per_source)
        
        # 키워드가 있으면 키워드 기반 필터링, apt_id만 있으면 지역 기반 필터링
        if has_keywords:
            # 키워드 기반 필터링
            filtered_news = filter_news_by_keywords(
                news_list=crawled_news,
                keywords=search_keywords
            )
        elif apt_id is not None:
            # apt_id 기반 지역 필터링
            filtered_news = filter_news_by_location(
                news_list=crawled_news,
                si=si_value,
                dong=dong_value,
                apartment=apartment_name
            )
        else:
            # 키워드도 없고 apt_id도 없으면 기존처럼 모든 뉴스 반환
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
        
        # 키워드가 있는 경우 메타 정보에 추가
        if has_keywords:
            meta["keywords"] = search_keywords
        
        # apt_id가 전달된 경우 메타 정보에 추가 (키워드보다 우선순위 낮음)
        if apt_id is not None:
            apt_meta = {
                "apt_id": apt_id,
                "apt_name": apartment_name
            }
            # 키워드가 없는 경우에만 si, dong 추가 (apt_id로부터 추출한 값)
            if not has_keywords:
                if si_value:
                    apt_meta["si"] = si_value
                if dong_value:
                    apt_meta["dong"] = dong_value
            meta.update(apt_meta)
        
        response = NewsListResponse(
            success=True,
            data=news_list,
            meta=meta
        )
        
        # Redis 캐시에 저장 (dict로 변환)
        await set_cached_news_data(cache_key, response.dict())
        
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
    tags=[" News (뉴스)"],
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
        cache_key = f"detail_{generate_news_id(url)}"
        
        # Redis 캐시 확인
        cached_result = await get_cached_news_data(cache_key)
        if cached_result:
            return NewsDetailResponse(**cached_result)
        
        # 캐시 없으면 크롤링 실행
        logger.info(f" 뉴스 상세 캐시 미스 - 크롤링 시작: {url}")
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
        
        # Redis 캐시에 저장 (상세 뉴스는 더 긴 TTL)
        await set_cached_news_data(cache_key, response.dict(), is_detail=True)
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"뉴스 상세 크롤링 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"크롤링 중 오류가 발생했습니다: {str(e)}"
        )
