"""
기본 CRUD 클래스

모든 CRUD 클래스가 상속받는 기본 클래스입니다.
"""
from typing import Generic, TypeVar, Type, Optional, List, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.base import Base

# 타입 변수 정의
ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)


class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    """
    기본 CRUD 클래스
    
    모든 테이블에 공통으로 필요한 CRUD 작업을 정의합니다.
    각 테이블별 CRUD는 이 클래스를 상속받아 사용합니다.
    """
    
    def __init__(self, model: Type[ModelType]):
        """
        Args:
            model: SQLAlchemy 모델 클래스
        """
        self.model = model
    
    async def get(
        self,
        db: AsyncSession,
        id: int
    ) -> Optional[ModelType]:
        """ID로 단일 항목 조회"""
        result = await db.execute(
            select(self.model).where(self.model.account_id == id)
        )
        return result.scalar_one_or_none()
    
    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 100
    ) -> List[ModelType]:
        """여러 항목 조회 (페이지네이션)"""
        result = await db.execute(
            select(self.model)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def create(
        self,
        db: AsyncSession,
        *,
        obj_in: CreateSchemaType
    ) -> ModelType:
        """새 항목 생성"""
        # Pydantic 스키마 → dict → 모델 인스턴스
        obj_data = obj_in.model_dump()
        db_obj = self.model(**obj_data)
        
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)  # 생성된 ID 등 갱신
        
        return db_obj
    
    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: ModelType,
        obj_in: UpdateSchemaType | dict[str, Any]
    ) -> ModelType:
        """기존 항목 수정"""
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        return db_obj
    
    async def delete(
        self,
        db: AsyncSession,
        *,
        id: int
    ) -> Optional[ModelType]:
        """항목 삭제"""
        obj = await self.get(db, id=id)
        if obj:
            await db.delete(obj)
            await db.commit()
        return obj
