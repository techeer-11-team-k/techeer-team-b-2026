# 📁 db/ 폴더 설명

> **이 폴더는 뭘 하는 곳인가요?**  
> **데이터베이스 연결**을 설정하고 관리하는 곳입니다!

---

## 🎯 한줄 요약

```
db/ = 창고 연결 통로 🔌
```

우리 코드(가게)와 데이터베이스(창고)를 연결해주는 역할입니다.

---

## 📁 이 폴더에 들어갈 파일들

| 파일명 | 역할 | 설명 |
|--------|------|------|
| `base.py` | Base 클래스 | 모든 ORM 모델의 부모 클래스 |
| `session.py` | 세션 관리 | DB 연결 및 세션 생성 |

---

## 📄 base.py - SQLAlchemy Base 클래스

```python
"""
SQLAlchemy Base 클래스

모든 ORM 모델은 이 Base를 상속받아야 합니다.
"""
from sqlalchemy.orm import DeclarativeBase, declared_attr
from sqlalchemy import MetaData

# 테이블 이름 규칙 정의 (일관된 네이밍)
convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
}

metadata = MetaData(naming_convention=convention)


class Base(DeclarativeBase):
    """
    모든 ORM 모델의 부모 클래스
    
    사용법:
        from app.db.base import Base
        
        class Account(Base):
            __tablename__ = "accounts"
            ...
    """
    metadata = metadata
    
    @declared_attr.directive
    def __tablename__(cls) -> str:
        """
        클래스 이름을 소문자+언더스코어로 변환하여 테이블 이름으로 사용
        예: Account → accounts, MyProperty → my_properties
        """
        import re
        name = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', cls.__name__)
        return re.sub('([a-z0-9])([A-Z])', r'\1_\2', name).lower() + 's'


# 모든 모델을 한 곳에서 import하는 곳
# Alembic 마이그레이션에서 사용합니다
def import_all_models():
    """
    모든 모델을 import하여 Alembic이 인식하게 합니다.
    """
    from app.models import (
        account,
        apartment,
        transaction,
        favorite,
        my_property,
        location,
        house_price
    )
```

---

## 📄 session.py - 데이터베이스 세션 관리

```python
"""
데이터베이스 세션 관리

비동기(async) SQLAlchemy를 사용합니다.
"""
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine
)
from sqlalchemy.pool import NullPool

from app.core.config import settings

# 비동기 엔진 생성
# echo=True로 하면 SQL 쿼리가 콘솔에 출력됩니다 (디버깅용)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    poolclass=NullPool,  # 비동기에서는 NullPool 권장
)

# 세션 팩토리 생성
# 이걸로 DB 세션을 만들어서 사용합니다
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    DB 세션을 생성하고 제공합니다.
    
    FastAPI의 Depends()에서 사용됩니다.
    요청 처리 후 자동으로 세션을 닫습니다.
    
    사용법:
        @router.get("/")
        async def get_items(db: AsyncSession = Depends(get_db)):
            result = await db.execute(select(Item))
            return result.scalars().all()
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """
    데이터베이스 초기화
    
    테이블을 생성합니다.
    개발 환경에서만 사용하세요!
    운영에서는 Alembic 마이그레이션을 사용합니다.
    """
    from app.db.base import Base
    from app.db.base import import_all_models
    
    # 모든 모델 import
    import_all_models()
    
    async with engine.begin() as conn:
        # 모든 테이블 생성
        await conn.run_sync(Base.metadata.create_all)
```

---

## 💡 왜 비동기(async)를 쓰나요?

### 동기 (sync) 방식
```python
# ❌ 한 요청이 DB 작업 중이면 다른 요청들이 대기
def get_users():
    result = db.execute(select(User))  # DB 응답 기다리는 동안 멈춤
    return result
```

### 비동기 (async) 방식
```python
# ✅ DB 작업 중에도 다른 요청 처리 가능
async def get_users():
    result = await db.execute(select(User))  # 기다리는 동안 다른 작업 처리
    return result
```

**비동기를 쓰면**:
- 서버가 동시에 더 많은 요청을 처리할 수 있어요
- 특히 DB 작업이 많은 API에서 효과적이에요

---

## 📝 사용 예시

### API 엔드포인트에서 DB 사용

```python
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.account import Account

@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db)  # 자동으로 세션 주입!
):
    result = await db.execute(
        select(Account).where(Account.id == user_id)
    )
    user = result.scalar_one_or_none()
    return user
```

### CRUD에서 DB 사용

```python
# crud/crud_account.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.account import Account

async def get_by_email(db: AsyncSession, email: str) -> Account | None:
    result = await db.execute(
        select(Account).where(Account.email == email)
    )
    return result.scalar_one_or_none()

async def create(db: AsyncSession, account: Account) -> Account:
    db.add(account)
    await db.flush()  # ID 생성
    await db.refresh(account)  # 최신 데이터 가져오기
    return account
```

---

## ⚠️ 주의사항

1. **운영 환경에서는 `init_db()` 사용하지 마세요!**
   - Alembic 마이그레이션을 사용해서 테이블을 관리합니다.

2. **세션은 Depends()로 주입받으세요!**
   - 직접 `AsyncSessionLocal()`로 생성하면 안 닫힐 수 있어요.

3. **`await`를 잊지 마세요!**
   - 비동기 함수에서 `await` 안 붙이면 에러나요.
