# 📁 api/ 폴더 설명

> **이 폴더는 뭘 하는 곳인가요?**  
> 사용자(프론트엔드)로부터 **HTTP 요청을 받고, 응답을 보내는** 곳입니다!

---

## 🎯 한줄 요약

```
api/ = 가게 카운터 🚪
```

손님(프론트엔드)이 주문(요청)을 하면, 카운터(API)에서 받아서 주방(서비스)으로 전달합니다.

---

## 📁 폴더 구조

```
api/
└── v1/                        # API 버전 1 (나중에 v2도 만들 수 있어요)
    ├── endpoints/             # 실제 API 엔드포인트 파일들
    │   ├── auth.py            # /api/v1/auth/...
    │   ├── apartments.py      # /api/v1/apartments/...
    │   ├── map.py             # /api/v1/map/...
    │   └── ...
    ├── router.py              # 모든 엔드포인트를 모아주는 파일
    └── deps.py                # 의존성 주입 (인증, DB 세션 등)
```

---

## 🔧 왜 버전(v1)이 있나요?

나중에 API를 크게 바꿔야 할 때를 대비해서입니다!

```
지금: /api/v1/apartments/123
나중에 (큰 변경 시): /api/v2/apartments/123
```

기존 앱 사용자는 v1을 계속 쓰고, 새 앱은 v2를 쓸 수 있어요.

---

## 📄 핵심 파일들

### 1. router.py - 모든 엔드포인트 모아주기

```python
# api/v1/router.py
from fastapi import APIRouter
from app.api.v1.endpoints import auth, apartments, map, search

api_router = APIRouter()

# 각 엔드포인트 파일을 라우터에 연결
api_router.include_router(auth.router, prefix="/auth", tags=["인증"])
api_router.include_router(apartments.router, prefix="/apartments", tags=["아파트"])
api_router.include_router(map.router, prefix="/map", tags=["지도"])
api_router.include_router(search.router, prefix="/search", tags=["검색"])
# ... 나머지 엔드포인트들
```

### 2. deps.py - 의존성 주입

```python
# api/v1/deps.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# DB 세션을 주입하는 의존성
async def get_database() -> AsyncSession:
    async with get_db() as session:
        yield session

# 현재 로그인한 사용자를 가져오는 의존성
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_database)
):
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증이 필요합니다"
        )
    # DB에서 사용자 정보 조회
    user = await crud_account.get(db, user_id)
    return user
```

### 3. endpoints/auth.py - 인증 API 예시

```python
# api/v1/endpoints/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.deps import get_database
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.services.auth_service import AuthService

router = APIRouter()

@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    회원가입 API
    
    - **email**: 이메일 (필수)
    - **password**: 비밀번호 8자 이상 (필수)
    - **nickname**: 닉네임 (필수)
    """
    result = await AuthService.register(db, request)
    return {"success": True, "data": result}

@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    로그인 API
    
    성공 시 JWT 토큰을 반환합니다.
    """
    tokens = await AuthService.login(db, request.email, request.password)
    return {"success": True, "data": tokens}
```

---

## 💡 엔드포인트 작성 팁

### ✅ 좋은 예시

```python
@router.get("/{apt_id}")
async def get_apartment(
    apt_id: int,                              # URL에서 가져오는 값
    db: AsyncSession = Depends(get_database)  # 자동으로 주입되는 값
):
    """
    아파트 상세 정보 조회
    
    - **apt_id**: 아파트 ID
    """
    # 서비스 레이어에 위임!
    result = await ApartmentService.get_detail(db, apt_id)
    if not result:
        raise HTTPException(status_code=404, detail="아파트를 찾을 수 없습니다")
    return {"success": True, "data": result}
```

### ❌ 나쁜 예시

```python
@router.get("/{apt_id}")
async def get_apartment(apt_id: int, db: AsyncSession = Depends(get_database)):
    # ❌ 엔드포인트에서 직접 복잡한 로직을 처리하면 안 됨!
    result = await db.execute(
        select(Apartment)
        .join(Transaction)
        .where(Apartment.apt_id == apt_id)
        .options(selectinload(Apartment.transactions))
    )
    apartment = result.scalar_one_or_none()
    # 이런 복잡한 로직은 service/ 폴더로!
```

---

## 📝 새 엔드포인트 추가하기

1. **`endpoints/` 폴더에 새 파일 생성**
   ```
   endpoints/news.py
   ```

2. **라우터 정의하고 엔드포인트 작성**
   ```python
   from fastapi import APIRouter
   router = APIRouter()
   
   @router.get("/")
   async def get_news_list():
       ...
   ```

3. **`router.py`에 연결**
   ```python
   from app.api.v1.endpoints import news
   api_router.include_router(news.router, prefix="/news", tags=["뉴스"])
   ```

---

## 🎨 Swagger 문서 확인하기

서버 실행 후 브라우저에서:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

여기서 모든 API를 테스트해볼 수 있어요! 🚀
