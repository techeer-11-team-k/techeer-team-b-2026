"""
뉴스 CRUD 작업

데이터베이스에서 뉴스를 조회, 생성, 수정, 삭제하는 작업을 담당합니다.
"""
from datetime import datetime
from typing import List, Optional

try:
    from sqlalchemy import select, desc, func
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.models.news import News
    from app.crud.base import CRUDBase
    from app.schemas.news import NewsCreate, NewsUpdate
    DB_AVAILABLE = True
except (ImportError, AttributeError):
    # DB 모델이 없을 경우
    DB_AVAILABLE = False
    News = None
    CRUDBase = None
    NewsCreate = None
    NewsUpdate = None
    AsyncSession = None


if DB_AVAILABLE and News and CRUDBase:
    class CRUDNews(CRUDBase[News, NewsCreate, NewsUpdate]):
        """
        뉴스 CRUD 클래스
        
        기본 CRUD 작업 외에 뉴스 특화 메서드를 제공합니다.
        """
        
        async def get_by_url(
            self, 
            db: AsyncSession, 
            url: str
        ) -> Optional[News]:
            """
            URL로 뉴스 조회 (중복 체크용)
            
            Args:
                db: 데이터베이스 세션
                url: 뉴스 URL
                
            Returns:
                뉴스 객체 (없으면 None)
            """
            result = await db.execute(
                select(News).where(News.url == url, News.is_deleted == False)
            )
            return result.scalar_one_or_none()
        
        async def get_latest(
            self,
            db: AsyncSession,
            limit: int = 20,
            offset: int = 0,
            category: Optional[str] = None,
            source: Optional[str] = None
        ) -> List[News]:
            """
            최신 뉴스 목록 조회
            
            Args:
                db: 데이터베이스 세션
                limit: 최대 개수
                offset: 시작 위치
                category: 카테고리 필터 (선택)
                source: 출처 필터 (선택)
                
            Returns:
                뉴스 목록 (발행일 내림차순)
            """
            query = select(News).where(News.is_deleted == False)
            
            if category:
                query = query.where(News.category == category)
            if source:
                query = query.where(News.source == source)
            
            query = query.order_by(desc(News.published_at)).limit(limit).offset(offset)
            
            result = await db.execute(query)
            return list(result.scalars().all())
        
        async def get_count(
            self,
            db: AsyncSession,
            category: Optional[str] = None,
            source: Optional[str] = None
        ) -> int:
            """
            뉴스 총 개수 조회 (필터 적용)
            
            Args:
                db: 데이터베이스 세션
                category: 카테고리 필터 (선택)
                source: 출처 필터 (선택)
                
            Returns:
                총 개수
            """
            query = select(func.count(News.news_id)).where(News.is_deleted == False)
            
            if category:
                query = query.where(News.category == category)
            if source:
                query = query.where(News.source == source)
            
            result = await db.execute(query)
            return result.scalar() or 0
        
        async def create_or_update(
            self,
            db: AsyncSession,
            news_in: NewsCreate
        ) -> News:
            """
            뉴스 생성 또는 업데이트 (URL 기준 중복 체크)
            
            이미 존재하는 URL이면 업데이트, 없으면 생성
            
            Args:
                db: 데이터베이스 세션
                news_in: 뉴스 생성 스키마
                
            Returns:
                생성/업데이트된 뉴스 객체
            """
            existing = await self.get_by_url(db, url=news_in.url)
            
            if existing:
                # 업데이트
                update_data = news_in.model_dump(exclude_unset=True)
                update_data["updated_at"] = datetime.utcnow()
                for field, value in update_data.items():
                    setattr(existing, field, value)
                db.add(existing)
                await db.commit()
                await db.refresh(existing)
                return existing
            else:
                # 생성
                return await self.create(db, obj_in=news_in)
    
    # 싱글톤 인스턴스
    news = CRUDNews(News)
else:
    # DB가 없을 경우 더미 객체
    class DummyCRUDNews:
        """DB가 없을 때 사용하는 더미 CRUD 클래스"""
        pass
    news = DummyCRUDNews()
