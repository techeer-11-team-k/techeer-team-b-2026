"""
뉴스 서비스

뉴스 크롤링 및 비즈니스 로직을 담당합니다.
"""
import logging
from typing import List, Optional

from app.services.news_crawler import news_crawler

logger = logging.getLogger(__name__)

# DB 관련 import는 선택적으로 (뉴스 API는 DB 저장 없이 크롤링만 수행)
try:
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.crud.news import news as news_crud
    from app.schemas.news import NewsCreate
    DB_AVAILABLE = True
except (ImportError, AttributeError):
    # DB 모델이 없거나 CRUD가 없을 경우
    DB_AVAILABLE = False
    AsyncSession = None
    news_crud = None
    NewsCreate = None


class NewsService:
    """
    뉴스 서비스 클래스
    
    크롤링과 데이터베이스 작업을 조율합니다.
    """
    
    async def crawl_and_save(
        self,
        db: Optional[AsyncSession],
        limit_per_source: int = 20
    ) -> dict:
        """
        뉴스를 크롤링하고 데이터베이스에 저장
        
        Args:
            db: 데이터베이스 세션 (선택적)
            limit_per_source: 소스당 최대 수집 개수
            
        Returns:
            수집 결과 통계
        """
        if not DB_AVAILABLE or not db:
            logger.warning("DB가 사용 불가능하므로 크롤링만 수행합니다.")
            crawled_news = await news_crawler.crawl_all_sources(limit_per_source=limit_per_source)
            return {
                "total_crawled": len(crawled_news),
                "saved": 0,
                "updated": 0,
                "errors": 0
            }
        
        # 크롤링 실행
        logger.info("뉴스 크롤링 시작...")
        crawled_news = await news_crawler.crawl_all_sources(limit_per_source=limit_per_source)
        logger.info(f"크롤링 완료: {len(crawled_news)}개 뉴스 수집")
        
        # 데이터베이스에 저장
        saved_count = 0
        updated_count = 0
        error_count = 0
        
        for news_data in crawled_news:
            try:
                news_create = NewsCreate(**news_data)
                existing = await news_crud.get_by_url(db, url=news_create.url)
                
                if existing:
                    # 업데이트
                    update_data = news_create.model_dump(exclude_unset=True)
                    await news_crud.update(db, db_obj=existing, obj_in=update_data)
                    updated_count += 1
                else:
                    # 생성
                    await news_crud.create(db, obj_in=news_create)
                    saved_count += 1
                    
            except Exception as e:
                logger.error(f"뉴스 저장 실패: {news_data.get('title', 'Unknown')} - {e}")
                error_count += 1
        
        await db.commit()
        
        return {
            "total_crawled": len(crawled_news),
            "saved": saved_count,
            "updated": updated_count,
            "errors": error_count
        }
    
    async def get_news_list(
        self,
        db: Optional[AsyncSession],
        limit: int = 20,
        offset: int = 0,
        category: Optional[str] = None,
        source: Optional[str] = None
    ) -> dict:
        """
        뉴스 목록 조회 (DB 사용)
        
        Args:
            db: 데이터베이스 세션 (선택적)
            limit: 최대 개수
            offset: 시작 위치
            category: 카테고리 필터
            source: 출처 필터
            
        Returns:
            뉴스 목록과 메타 정보
        """
        if not DB_AVAILABLE or not db or not news_crud:
            raise NotImplementedError("DB가 사용 불가능합니다. crawl_only()를 사용하세요.")
        
        news_list = await news_crud.get_latest(
            db=db,
            limit=limit,
            offset=offset,
            category=category,
            source=source
        )
        
        # 총 개수 조회 (필터 적용)
        total = await news_crud.get_count(
            db=db,
            category=category,
            source=source
        )
        
        return {
            "data": news_list,
            "meta": {
                "total": total,
                "limit": limit,
                "offset": offset
            }
        }
    
    async def get_news_detail(
        self,
        db: Optional[AsyncSession],
        news_id: int
    ) -> Optional:
        """
        뉴스 상세 조회 (DB 사용)
        
        Args:
            db: 데이터베이스 세션 (선택적)
            news_id: 뉴스 ID
            
        Returns:
            뉴스 객체 (없으면 None)
        """
        if not DB_AVAILABLE or not db or not news_crud:
            raise NotImplementedError("DB가 사용 불가능합니다. crawl_news_detail()를 사용하세요.")
        
        return await news_crud.get(db, id=news_id)
    
    async def crawl_only(
        self,
        limit_per_source: int = 20
    ) -> List[dict]:
        """
        뉴스 목록을 크롤링만 하고 저장하지 않음 (실시간 조회용)
        
        Args:
            limit_per_source: 소스당 최대 수집 개수
            
        Returns:
            크롤링한 뉴스 딕셔너리 리스트 (제목, URL 등 기본 정보만 포함)
        """
        logger.info("뉴스 목록 크롤링 시작 (저장 없음)...")
        crawled_news = await news_crawler.crawl_all_sources(limit_per_source=limit_per_source)
        logger.info(f"크롤링 완료: {len(crawled_news)}개 뉴스 수집 (저장하지 않음)")
        
        return crawled_news
    
    async def crawl_news_detail(self, url: str) -> Optional[dict]:
        """
        뉴스 상세 내용을 크롤링 (저장 없음)
        
        Args:
            url: 뉴스 상세 페이지 URL
            
        Returns:
            뉴스 상세 정보 딕셔너리 (제목, 본문, 썸네일 등 포함)
        """
        logger.info(f"뉴스 상세 크롤링 시작: {url}")
        detail = await news_crawler.crawl_news_detail(url)
        if detail:
            logger.info(f"뉴스 상세 크롤링 완료: {detail.get('title', 'Unknown')}")
        else:
            logger.warning(f"뉴스 상세 크롤링 실패: {url}")
        return detail


# 싱글톤 인스턴스
news_service = NewsService()
