# 🔧 crud 폴더 가이드

> 마지막 업데이트: 2026-01-11

## 🎯 이 폴더는 뭐하는 곳이에요?

`crud/` 폴더는 **데이터베이스 작업을 담당**하는 곳이에요!

### CRUD란?

CRUD는 데이터베이스의 4가지 기본 작업을 말해요:

| 글자 | 의미 | SQL | 설명 |
|------|------|-----|------|
| **C** | Create | INSERT | 새 데이터 생성 |
| **R** | Read | SELECT | 데이터 조회 |
| **U** | Update | UPDATE | 데이터 수정 |
| **D** | Delete | DELETE | 데이터 삭제 |

### 쉬운 비유로 이해하기

도서관의 **사서**를 생각해보세요:
- 새 책 등록 (Create)
- 책 검색/대출 (Read)
- 책 정보 수정 (Update)
- 폐기 도서 처리 (Delete)

crud 폴더는 이 **"사서 역할"**을 하는 곳이에요!

## 📁 이 폴더에 들어갈 파일들

```
crud/
├── __init__.py          # CRUD 모듈 초기화
├── base.py              # 모든 CRUD의 기본 클래스
├── account.py           # 사용자 계정 CRUD
├── apartment.py         # 아파트 CRUD
├── transaction.py       # 거래 내역 CRUD
├── favorite.py          # 관심 매물/지역 CRUD
├── my_property.py       # 내 자산 CRUD
├── search.py            # 검색 기록 CRUD
└── location.py          # 지역 정보 CRUD
```

## 📝 코드 예시

### 1. 기본 CRUD 클래스 (base.py)

모든 CRUD 클래스가 상속받는 기본 클래스를 먼저 만들어요.

```python
from typing import Generic, TypeVar, Type, Optional, List, Any
from sqlalchemy import select, update, delete
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
    
    모든 테이블에 공통으로 필요한 CRUD 작업을 정의해요.
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
            select(self.model).where(self.model.id == id)
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
```

### 2. 사용자 CRUD (account.py)

기본 CRUD를 상속받고, 사용자 전용 기능을 추가해요.

```python
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.account import Account
from app.schemas.account import AccountCreate, AccountUpdate
from app.core.security import get_password_hash, verify_password


class CRUDAccount(CRUDBase[Account, AccountCreate, AccountUpdate]):
    """
    사용자 계정 CRUD
    
    기본 CRUD + 사용자 전용 기능:
    - 이메일로 사용자 찾기
    - 비밀번호 검증
    - 회원가입 (비밀번호 해싱)
    """
    
    async def get_by_email(
        self, 
        db: AsyncSession, 
        *, 
        email: str
    ) -> Optional[Account]:
        """이메일로 사용자 조회"""
        result = await db.execute(
            select(Account).where(Account.email == email)
        )
        return result.scalar_one_or_none()
    
    async def create(
        self, 
        db: AsyncSession, 
        *, 
        obj_in: AccountCreate
    ) -> Account:
        """회원가입 (비밀번호 해싱 처리)"""
        db_obj = Account(
            email=obj_in.email,
            name=obj_in.name,
            hashed_password=get_password_hash(obj_in.password)  # 해싱!
        )
        
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        return db_obj
    
    async def authenticate(
        self, 
        db: AsyncSession, 
        *, 
        email: str, 
        password: str
    ) -> Optional[Account]:
        """로그인 인증 (이메일 + 비밀번호 확인)"""
        user = await self.get_by_email(db, email=email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user
    
    async def is_active(self, user: Account) -> bool:
        """사용자 활성 상태 확인"""
        return user.is_active


# 싱글톤 인스턴스 생성
# 다른 곳에서 from app.crud.account import account 로 사용
account = CRUDAccount(Account)
```

### 3. 아파트 CRUD (apartment.py)

PostGIS 공간 쿼리가 포함된 예시에요.

```python
from typing import List, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import functions as geo_func

from app.crud.base import CRUDBase
from app.models.apartment import Apartment
from app.schemas.apartment import ApartmentCreate, ApartmentUpdate


class CRUDApartment(CRUDBase[Apartment, ApartmentCreate, ApartmentUpdate]):
    """
    아파트 CRUD
    
    공간 쿼리 기능 포함:
    - 영역 내 아파트 검색
    - 반경 내 아파트 검색
    """
    
    async def get_by_bounds(
        self, 
        db: AsyncSession,
        *,
        min_lat: float,
        max_lat: float,
        min_lng: float,
        max_lng: float,
        skip: int = 0,
        limit: int = 100
    ) -> List[Apartment]:
        """
        지도 영역(bounds) 내 아파트 조회
        
        PostGIS의 ST_MakeEnvelope를 사용해서
        사각형 영역 안에 있는 아파트들을 찾아요.
        """
        # 영역(사각형) 생성
        envelope = geo_func.ST_MakeEnvelope(
            min_lng, min_lat,  # 왼쪽 아래 (경도, 위도)
            max_lng, max_lat,  # 오른쪽 위 (경도, 위도)
            4326  # SRID (WGS84 좌표계)
        )
        
        result = await db.execute(
            select(Apartment)
            .where(geo_func.ST_Within(Apartment.location, envelope))
            .offset(skip)
            .limit(limit)
        )
        
        return list(result.scalars().all())
    
    async def get_nearby(
        self, 
        db: AsyncSession,
        *,
        latitude: float,
        longitude: float,
        radius_meters: float = 1000,  # 기본 1km
        limit: int = 50
    ) -> List[Apartment]:
        """
        특정 지점 반경 내 아파트 조회
        
        PostGIS의 ST_DWithin을 사용해서
        특정 지점으로부터 일정 거리 안에 있는 아파트들을 찾아요.
        """
        # 중심점 생성
        point = geo_func.ST_SetSRID(
            geo_func.ST_MakePoint(longitude, latitude),
            4326
        )
        
        result = await db.execute(
            select(Apartment)
            .where(
                geo_func.ST_DWithin(
                    geo_func.ST_Transform(Apartment.location, 3857),  # 미터 단위 계산용
                    geo_func.ST_Transform(point, 3857),
                    radius_meters
                )
            )
            .limit(limit)
        )
        
        return list(result.scalars().all())
    
    async def search_by_name(
        self, 
        db: AsyncSession,
        *,
        keyword: str,
        skip: int = 0,
        limit: int = 20
    ) -> List[Apartment]:
        """아파트명으로 검색 (LIKE 검색)"""
        result = await db.execute(
            select(Apartment)
            .where(Apartment.name.ilike(f"%{keyword}%"))
            .offset(skip)
            .limit(limit)
        )
        
        return list(result.scalars().all())


# 싱글톤 인스턴스
apartment = CRUDApartment(Apartment)
```

### 4. 관심 매물 CRUD (favorite.py)

```python
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.favorite import FavoriteApartment, FavoriteLocation
from app.schemas.favorite import (
    FavoriteApartmentCreate, 
    FavoriteApartmentUpdate,
    FavoriteLocationCreate,
    FavoriteLocationUpdate
)


class CRUDFavoriteApartment(CRUDBase[FavoriteApartment, FavoriteApartmentCreate, FavoriteApartmentUpdate]):
    """관심 매물 CRUD"""
    
    async def get_by_user(
        self, 
        db: AsyncSession, 
        *, 
        account_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[FavoriteApartment]:
        """사용자의 관심 매물 목록 조회"""
        result = await db.execute(
            select(FavoriteApartment)
            .where(FavoriteApartment.account_id == account_id)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def get_by_user_and_apartment(
        self, 
        db: AsyncSession, 
        *, 
        account_id: int,
        apartment_id: int
    ) -> Optional[FavoriteApartment]:
        """특정 사용자가 특정 아파트를 찜했는지 확인"""
        result = await db.execute(
            select(FavoriteApartment)
            .where(
                and_(
                    FavoriteApartment.account_id == account_id,
                    FavoriteApartment.apartment_id == apartment_id
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def toggle(
        self, 
        db: AsyncSession, 
        *, 
        account_id: int,
        apartment_id: int
    ) -> tuple[bool, Optional[FavoriteApartment]]:
        """
        관심 매물 토글 (있으면 삭제, 없으면 추가)
        
        Returns:
            (is_added, favorite): 추가되었으면 (True, 객체), 삭제되었으면 (False, None)
        """
        existing = await self.get_by_user_and_apartment(
            db, 
            account_id=account_id, 
            apartment_id=apartment_id
        )
        
        if existing:
            await db.delete(existing)
            await db.commit()
            return (False, None)
        else:
            new_favorite = FavoriteApartment(
                account_id=account_id,
                apartment_id=apartment_id
            )
            db.add(new_favorite)
            await db.commit()
            await db.refresh(new_favorite)
            return (True, new_favorite)


# 싱글톤 인스턴스
favorite_apartment = CRUDFavoriteApartment(FavoriteApartment)
```

## 🔄 CRUD 사용 흐름

```
Endpoint (api/v1/endpoints/)
         │
         ▼
    ┌─────────┐
    │ Service │  ← 비즈니스 로직
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │  CRUD   │  ← 데이터베이스 작업 (여기!)
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │  Model  │  ← 테이블 정의
    └────┬────┘
         │
         ▼
    [Database]
```

## 💡 CRUD vs Service 차이점

| 구분 | CRUD | Service |
|------|------|---------|
| **역할** | 순수 DB 작업 | 비즈니스 로직 |
| **예시** | `get_by_id()` | `calculate_price_trend()` |
| **복잡도** | 단순 (1개 작업) | 복잡 (여러 작업 조합) |
| **트랜잭션** | 단일 쿼리 | 여러 CRUD 조합 |

### 왜 분리할까요?

```python
# Service에서 CRUD를 조합하는 예시
class ApartmentService:
    async def get_apartment_with_favorites(
        self, 
        db: AsyncSession, 
        apartment_id: int,
        user_id: int
    ):
        # 1. 아파트 정보 가져오기 (CRUD 사용)
        apt = await apartment.get(db, id=apartment_id)
        
        # 2. 사용자가 찜했는지 확인 (다른 CRUD 사용)
        is_favorited = await favorite_apartment.get_by_user_and_apartment(
            db, 
            account_id=user_id,
            apartment_id=apartment_id
        ) is not None
        
        # 3. 결과 조합 (비즈니스 로직)
        return {
            "apartment": apt,
            "is_favorited": is_favorited
        }
```

## 🚀 개발 순서 가이드

1. **1단계**: `base.py` - 기본 CRUD 클래스
2. **2단계**: `account.py` - 인증에 필요
3. **3단계**: `apartment.py`, `transaction.py` - 핵심 데이터
4. **4단계**: 나머지 CRUD들

## ❓ 자주 묻는 질문

### Q: 왜 async/await를 사용하나요?
DB 작업은 시간이 오래 걸려요. async를 사용하면 DB 응답을 기다리는 동안 다른 요청을 처리할 수 있어요!

### Q: `model_dump(exclude_unset=True)`는 뭔가요?
수정할 때, 사용자가 입력한 필드만 업데이트하기 위해서에요.
```python
# 사용자가 name만 수정 요청한 경우
update_data = {"name": "새이름"}  # email 같은 건 포함 안 됨!
```

### Q: 싱글톤 패턴은 왜 사용하나요?
CRUD 클래스는 상태가 없어서 한 번만 생성해도 돼요. 메모리도 절약되고 사용도 편해요!
```python
# crud/account.py 마지막에
account = CRUDAccount(Account)

# 다른 곳에서 사용
from app.crud.account import account
```

## 📚 참고 자료

- [SQLAlchemy 2.0 비동기 튜토리얼](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
- [FastAPI - SQL Database](https://fastapi.tiangolo.com/tutorial/sql-databases/)
