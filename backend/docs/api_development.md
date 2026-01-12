# 🛠️ API 개발 가이드

새로운 API 엔드포인트를 추가하는 방법을 단계별로 설명합니다.

## 📋 목차
1. [개발 순서](#개발-순서)
2. [실제 예시: 아파트 검색 API](#실제-예시-아파트-검색-api)
3. [테스트 방법](#테스트-방법)
4. [베스트 프랙티스](#베스트-프랙티스)

---

## 개발 순서

새 API를 추가할 때는 다음 순서를 따릅니다:

```
1. Model (데이터베이스 테이블 정의)
   ↓
2. Schema (요청/응답 스키마)
   ↓
3. CRUD (데이터베이스 작업)
   ↓
4. Service (비즈니스 로직)
   ↓
5. Endpoint (API 엔드포인트)
   ↓
6. Router 등록
```

---

## 실제 예시: 아파트 검색 API

아파트 이름으로 검색하는 API를 만들어봅시다.

### 1단계: Model 확인

이미 `apartments` 테이블이 있다고 가정합니다.

```python
# app/models/apartment.py (이미 존재한다고 가정)
class Apartment(Base):
    __tablename__ = "apartments"
    
    apt_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apt_name: Mapped[str] = mapped_column(String(100))
    road_address: Mapped[str] = mapped_column(String(200))
    ...
```

---

### 2단계: Schema 작성

요청과 응답 스키마를 정의합니다.

```python
# app/schemas/apartment.py

from pydantic import BaseModel, Field
from typing import List, Optional

# 요청 스키마
class ApartmentSearchRequest(BaseModel):
    """아파트 검색 요청"""
    query: str = Field(..., min_length=1, max_length=100, description="검색어 (아파트 이름)")
    limit: int = Field(10, ge=1, le=100, description="결과 개수 (최대 100)")
    skip: int = Field(0, ge=0, description="건너뛸 개수")

# 응답 스키마
class ApartmentBase(BaseModel):
    """아파트 기본 정보"""
    apt_id: int
    apt_name: str
    road_address: str
    
    class Config:
        from_attributes = True  # SQLAlchemy 모델에서 변환 가능

class ApartmentSearchResponse(BaseModel):
    """아파트 검색 응답"""
    success: bool = True
    data: List[ApartmentBase]
    meta: dict = Field(default_factory=lambda: {"total": 0})
```

---

### 3단계: CRUD 작성

데이터베이스에서 검색하는 메서드를 추가합니다.

```python
# app/crud/apartment.py

from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.apartment import Apartment

class CRUDApartment:
    async def search_by_name(
        self,
        db: AsyncSession,
        *,
        query: str,
        limit: int = 10,
        skip: int = 0
    ) -> List[Apartment]:
        """
        아파트 이름으로 검색
        
        Args:
            db: 데이터베이스 세션
            query: 검색어
            limit: 결과 개수
            skip: 건너뛸 개수
        
        Returns:
            아파트 목록
        """
        # SQLAlchemy 쿼리 작성
        stmt = (
            select(Apartment)
            .where(Apartment.apt_name.ilike(f"%{query}%"))  # 대소문자 구분 없이 검색
            .where(Apartment.is_deleted == False)
            .offset(skip)
            .limit(limit)
            .order_by(Apartment.apt_name)
        )
        
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    async def count_by_name(
        self,
        db: AsyncSession,
        *,
        query: str
    ) -> int:
        """검색 결과 총 개수"""
        from sqlalchemy import func
        
        stmt = (
            select(func.count(Apartment.apt_id))
            .where(Apartment.apt_name.ilike(f"%{query}%"))
            .where(Apartment.is_deleted == False)
        )
        
        result = await db.execute(stmt)
        return result.scalar() or 0

# 싱글톤 인스턴스
apartment = CRUDApartment()
```

---

### 4단계: Service 작성

비즈니스 로직을 처리합니다.

```python
# app/services/apartment.py

from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.crud.apartment import apartment as apartment_crud
from app.models.apartment import Apartment
from app.schemas.apartment import ApartmentSearchRequest

class ApartmentService:
    async def search_apartments(
        self,
        db: AsyncSession,
        search_request: ApartmentSearchRequest
    ) -> dict:
        """
        아파트 검색
        
        Args:
            db: 데이터베이스 세션
            search_request: 검색 요청
        
        Returns:
            검색 결과 (목록 + 메타 정보)
        """
        # CRUD를 통해 검색
        apartments = await apartment_crud.search_by_name(
            db,
            query=search_request.query,
            limit=search_request.limit,
            skip=search_request.skip
        )
        
        # 총 개수 조회
        total = await apartment_crud.count_by_name(
            db,
            query=search_request.query
        )
        
        return {
            "apartments": apartments,
            "total": total,
            "skip": search_request.skip,
            "limit": search_request.limit
        }

# 싱글톤 인스턴스
apartment_service = ApartmentService()
```

---

### 5단계: Endpoint 작성

API 엔드포인트를 만듭니다.

```python
# app/api/v1/endpoints/apartment.py

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.schemas.apartment import ApartmentSearchRequest, ApartmentSearchResponse
from app.services.apartment import apartment_service

router = APIRouter()


@router.get(
    "/search",
    response_model=ApartmentSearchResponse,
    status_code=status.HTTP_200_OK,
    tags=["🏠 Apartment (아파트)"],
    summary="아파트 검색",
    description="아파트 이름으로 검색합니다.",
    responses={
        200: {"description": "검색 성공"},
        400: {"description": "입력값 검증 실패"}
    }
)
async def search_apartments(
    query: str,
    limit: int = 10,
    skip: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """
    아파트 검색 API
    
    아파트 이름에 검색어가 포함된 아파트 목록을 반환합니다.
    
    ### 쿼리 파라미터
    - **query** (필수): 검색어
    - **limit** (선택): 결과 개수 (기본값: 10, 최대: 100)
    - **skip** (선택): 건너뛸 개수 (기본값: 0)
    
    ### 예시
    ```
    GET /api/v1/apartments/search?query=래미안&limit=20
    ```
    """
    # 요청 스키마 생성
    search_request = ApartmentSearchRequest(
        query=query,
        limit=limit,
        skip=skip
    )
    
    # 서비스를 통해 검색
    result = await apartment_service.search_apartments(db, search_request)
    
    return {
        "success": True,
        "data": result["apartments"],
        "meta": {
            "total": result["total"],
            "skip": result["skip"],
            "limit": result["limit"]
        }
    }
```

---

### 6단계: Router 등록

라우터에 새 엔드포인트를 등록합니다.

```python
# app/api/v1/router.py

from fastapi import APIRouter
from app.api.v1.endpoints import auth, admin, apartment  # apartment 추가

api_router = APIRouter()

# 기존 라우터들...
api_router.include_router(auth.router, prefix="/auth", tags=["🔐 Auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["🛠️ Admin"])

# 새 라우터 추가
api_router.include_router(
    apartment.router,
    prefix="/apartments",
    tags=["🏠 Apartment (아파트)"]
)
```

이제 다음 URL로 접근할 수 있습니다:
```
GET /api/v1/apartments/search?query=래미안
```

---

## 테스트 방법

### 1. Swagger UI에서 테스트

1. 서버 실행: `docker-compose up backend`
2. 브라우저에서 http://localhost:8000/docs 접속
3. 새로 추가한 API 찾기
4. "Try it out" 클릭
5. 파라미터 입력 후 "Execute" 클릭

### 2. curl로 테스트

```bash
curl -X GET "http://localhost:8000/api/v1/apartments/search?query=래미안&limit=10"
```

### 3. Python으로 테스트

```python
import httpx

async def test_search():
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://localhost:8000/api/v1/apartments/search",
            params={"query": "래미안", "limit": 10}
        )
        print(response.json())

# 실행
import asyncio
asyncio.run(test_search())
```

---

## 베스트 프랙티스

### ✅ DO (해야 할 것)

1. **일관된 응답 형식 사용**
   ```python
   return {
       "success": True,
       "data": ...,
       "meta": {...}  # 페이지네이션 정보 등
   }
   ```

2. **Pydantic 스키마로 검증**
   ```python
   @router.post("/create")
   async def create(item: ItemCreate):  # Pydantic 스키마
       ...
   ```

3. **에러는 커스텀 예외 사용**
   ```python
   from app.core.exceptions import NotFoundException
   
   if not item:
       raise NotFoundException("Item")
   ```

4. **비즈니스 로직은 Service에**
   ```python
   # ❌ 나쁜 예: Endpoint에 로직이 많음
   @router.get("/search")
   async def search():
       # 복잡한 로직...
       result = await db.execute(...)
       # 가공...
       return result
   
   # ✅ 좋은 예: Service에 위임
   @router.get("/search")
   async def search(db: AsyncSession = Depends(get_db)):
       return await service.search(db)
   ```

5. **Swagger 문서 작성**
   ```python
   @router.get(
       "/search",
       summary="아파트 검색",  # 간단한 설명
       description="아파트 이름으로 검색합니다.",  # 자세한 설명
       tags=["🏠 Apartment"],
       responses={200: {"description": "성공"}}
   )
   ```

### ❌ DON'T (하지 말아야 할 것)

1. **직접 SQL 작성 금지** (CRUD 레이어 사용)
   ```python
   # ❌ 나쁜 예
   result = await db.execute(text("SELECT * FROM apartments"))
   
   # ✅ 좋은 예
   apartments = await apartment_crud.get_all(db)
   ```

2. **Endpoint에 비즈니스 로직 넣지 않기**
   ```python
   # ❌ 나쁜 예
   @router.get("/search")
   async def search():
       # 복잡한 로직...
   
   # ✅ 좋은 예
   @router.get("/search")
   async def search():
       return await service.search()
   ```

3. **타입 힌트 생략하지 않기**
   ```python
   # ❌ 나쁜 예
   async def search(query):
       ...
   
   # ✅ 좋은 예
   async def search(query: str) -> dict:
       ...
   ```

---

## 📚 추가 자료

- [API 라우터 가이드](./api_router_guide.md)
- [프로젝트 구조](./project_structure.md)
- [FastAPI 공식 문서](https://fastapi.tiangolo.com/)

---

**마지막 업데이트**: 2026-01-11
