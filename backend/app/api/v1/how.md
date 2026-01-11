# 📁 api/v1/ 폴더 설명

> **이 폴더는 뭘 하는 곳인가요?**  
> API 버전 1의 모든 엔드포인트를 관리하는 곳입니다.

---

## 🎯 한줄 요약

```
v1/ = API 버전 1 모음
```

---

## 📁 이 폴더에 들어갈 파일들

```
v1/
├── endpoints/       # 각 도메인별 API 파일들
│   ├── auth.py
│   ├── apartments.py
│   └── ...
├── router.py        # 모든 엔드포인트를 한 곳에 모으기
└── deps.py          # 의존성 주입 (인증, DB 세션)
```

---

## 📄 router.py 예시

```python
from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    apartments,
    map,
    search,
    dashboard,
    favorites,
    my_properties,
    indicators,
    users,
    news,
    tools,
    ai
)

api_router = APIRouter()

# 인증 관련 (로그인, 회원가입)
api_router.include_router(
    auth.router, 
    prefix="/auth", 
    tags=["🔐 Auth (인증)"]
)

# 지도 관련
api_router.include_router(
    map.router, 
    prefix="/map", 
    tags=["🗺️ Map (지도)"]
)

# 아파트 정보
api_router.include_router(
    apartments.router, 
    prefix="/apartments", 
    tags=["🏢 Apartments (아파트)"]
)

# 검색
api_router.include_router(
    search.router, 
    prefix="/search", 
    tags=["🔍 Search (검색)"]
)

# 대시보드
api_router.include_router(
    dashboard.router, 
    prefix="/dashboard", 
    tags=["📊 Dashboard (대시보드)"]
)

# 즐겨찾기
api_router.include_router(
    favorites.router, 
    prefix="/favorites", 
    tags=["⭐ Favorites (즐겨찾기)"]
)

# 내 집
api_router.include_router(
    my_properties.router, 
    prefix="/my-properties", 
    tags=["🏠 My Properties (내 집)"]
)

# 지표
api_router.include_router(
    indicators.router, 
    prefix="/indicators", 
    tags=["📈 Indicators (지표)"]
)

# 사용자
api_router.include_router(
    users.router, 
    prefix="/users", 
    tags=["👤 Users (사용자)"]
)

# 뉴스 (P2)
api_router.include_router(
    news.router, 
    prefix="/news", 
    tags=["📰 News (뉴스)"]
)

# 도구 (P2)
api_router.include_router(
    tools.router, 
    prefix="/tools", 
    tags=["🛠️ Tools (도구)"]
)

# AI (P2)
api_router.include_router(
    ai.router, 
    prefix="/ai", 
    tags=["🤖 AI (AI 기능)"]
)
```

---

## 📄 deps.py 예시

```python
from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.core.config import settings
from app.core.security import decode_access_token
from app.crud import crud_account
from app.models.account import Account

# OAuth2 토큰 스키마 (로그인 URL 지정)
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login"
)

# DB 세션 의존성
async def get_db() -> Generator:
    """
    각 요청마다 DB 세션을 생성하고, 요청 끝나면 자동으로 닫습니다.
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

# 현재 로그인한 사용자 가져오기
async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> Account:
    """
    JWT 토큰을 검증하고, 현재 로그인한 사용자 정보를 반환합니다.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "INVALID_TOKEN", "message": "인증이 필요합니다"},
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = decode_access_token(token)
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await crud_account.get(db, id=user_id)
    if user is None:
        raise credentials_exception
    
    return user

# 선택적 인증 (로그인 안 해도 되는 API용)
async def get_current_user_optional(
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme)
) -> Optional[Account]:
    """
    로그인 안 해도 되는 API에서 사용.
    토큰이 있으면 사용자 정보 반환, 없으면 None.
    """
    if token is None:
        return None
    try:
        return await get_current_user(db, token)
    except HTTPException:
        return None
```

---

## 💡 사용 예시

### 로그인 필요한 API

```python
from app.api.v1.deps import get_current_user, get_db

@router.get("/me")
async def get_my_profile(
    current_user: Account = Depends(get_current_user),  # 로그인 필수!
    db: AsyncSession = Depends(get_db)
):
    return {"success": True, "data": current_user}
```

### 로그인 필요 없는 API

```python
@router.get("/{apt_id}")
async def get_apartment(
    apt_id: int,
    db: AsyncSession = Depends(get_db)  # DB만 필요
):
    apartment = await ApartmentService.get_detail(db, apt_id)
    return {"success": True, "data": apartment}
```
