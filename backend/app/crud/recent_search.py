"""
최근 검색어 CRUD

데이터베이스 작업을 담당하는 레이어
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

# 모든 모델을 import하여 SQLAlchemy 관계 설정이 제대로 작동하도록 함
from app.models import (  # noqa: F401
    Account,
    State,
    Apartment,
    ApartDetail,
    Sale,
    Rent,
    HouseScore,
    FavoriteLocation,
    FavoriteApartment,
    MyProperty,
    RecentSearch,
    RecentView,
)

from app.crud.base import CRUDBase
from app.models.recent_search import RecentSearch
from app.schemas.recent_search import RecentSearchCreate


class CRUDRecentSearch(CRUDBase[RecentSearch, RecentSearchCreate, dict]):
    """
    최근 검색어 CRUD 클래스
    
    RecentSearch 모델에 대한 데이터베이스 작업을 수행합니다.
    """
    
    async def get_by_account(
        self,
        db: AsyncSession,
        *,
        account_id: int,
        limit: int = 10
    ) -> List[RecentSearch]:
        """
        사용자별 최근 검색어 목록 조회
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
            limit: 가져올 레코드 수 (기본 10개, 최대 50개)
        
        Returns:
            RecentSearch 객체 목록 (최신순)
        """
        result = await db.execute(
            select(RecentSearch)
            .where(
                and_(
                    RecentSearch.account_id == account_id,
                    RecentSearch.is_deleted == False
                )
            )
            .order_by(RecentSearch.created_at.desc().nulls_last())
            .limit(min(limit, 50))
        )
        return list(result.scalars().all())
    
    async def create_or_update(
        self,
        db: AsyncSession,
        *,
        account_id: int,
        query: str,
        search_type: str = "apartment"
    ) -> RecentSearch:
        """
        최근 검색어 생성 또는 업데이트
        
        같은 검색어가 이미 있으면 기존 레코드의 created_at을 업데이트하고,
        없으면 새로 생성합니다.
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
            query: 검색어
            search_type: 검색 유형 (apartment, location)
        
        Returns:
            RecentSearch 객체
        """
        # 같은 검색어가 있는지 확인
        existing = await db.execute(
            select(RecentSearch)
            .where(
                and_(
                    RecentSearch.account_id == account_id,
                    RecentSearch.query == query,
                    RecentSearch.search_type == search_type,
                    RecentSearch.is_deleted == False
                )
            )
        )
        existing_search = existing.scalar_one_or_none()
        
        now = datetime.utcnow()
        
        if existing_search:
            # 기존 레코드가 있으면 created_at만 업데이트 (최신순 정렬을 위해)
            existing_search.created_at = now
            existing_search.updated_at = now
            db.add(existing_search)
            await db.commit()
            await db.refresh(existing_search)
            return existing_search
        else:
            # 새 레코드 생성
            db_obj = RecentSearch(
                account_id=account_id,
                query=query,
                search_type=search_type,
                created_at=now,
                updated_at=now,
                is_deleted=False
            )
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj
    
    async def delete_by_id_and_account(
        self,
        db: AsyncSession,
        *,
        search_id: int,
        account_id: int
    ) -> Optional[RecentSearch]:
        """
        최근 검색어 소프트 삭제 (ID와 계정 ID로)
        
        Args:
            db: 데이터베이스 세션
            search_id: 검색어 ID
            account_id: 계정 ID
        
        Returns:
            삭제된 RecentSearch 객체 또는 None
        """
        result = await db.execute(
            select(RecentSearch)
            .where(
                and_(
                    RecentSearch.search_id == search_id,
                    RecentSearch.account_id == account_id,
                    RecentSearch.is_deleted == False
                )
            )
        )
        search = result.scalar_one_or_none()
        
        if search:
            search.is_deleted = True
            search.updated_at = datetime.utcnow()
            db.add(search)
            await db.commit()
            await db.refresh(search)
        
        return search
    
    async def count_by_account(
        self,
        db: AsyncSession,
        *,
        account_id: int
    ) -> int:
        """
        사용자별 최근 검색어 개수 조회
        
        Args:
            db: 데이터베이스 세션
            account_id: 계정 ID
        
        Returns:
            최근 검색어 개수
        """
        result = await db.execute(
            select(func.count(RecentSearch.search_id))
            .where(
                and_(
                    RecentSearch.account_id == account_id,
                    RecentSearch.is_deleted == False
                )
            )
        )
        return result.scalar() or 0


# CRUD 인스턴스 생성
recent_search = CRUDRecentSearch(RecentSearch)
