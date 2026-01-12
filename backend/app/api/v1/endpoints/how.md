# 📁 endpoints/ 폴더 설명

> **이 폴더는 뭘 하는 곳인가요?**  
> 실제 API 엔드포인트 코드가 들어가는 곳입니다!

---

## 🎯 한줄 요약

```
endpoints/ = API 주소별 처리 코드 모음
```

각 파일이 하나의 API 그룹을 담당합니다.

---

## 📁 이 폴더에 들어갈 파일들

| 파일명 | 담당 API | 우선순위 |
|--------|----------|----------|
| `auth.py` | `/api/v1/auth/...` | 🔴 P0 (필수) |
| `map.py` | `/api/v1/map/...` | 🔴 P0 |
| `apartments.py` | `/api/v1/apartments/...` | 🔴 P0 |
| `search.py` | `/api/v1/search/...` | 🔴 P0 |
| `dashboard.py` | `/api/v1/dashboard/...` | 🟡 P1 |
| `favorites.py` | `/api/v1/favorites/...` | 🟡 P1 |
| `my_properties.py` | `/api/v1/my-properties/...` | 🟡 P1 |
| `indicators.py` | `/api/v1/indicators/...` | 🟡 P1 |
| `users.py` | `/api/v1/users/...` | 🟡 P1 |
| `news.py` | `/api/v1/news/...` | 🟢 P2 |
| `tools.py` | `/api/v1/tools/...` | 🟢 P2 |
| `ai.py` | `/api/v1/ai/...` | 🟢 P2 |

---

## 📄 파일 작성 템플릿

### auth.py 예시 (가장 먼저 만들 파일!)

```python
"""
인증 관련 API 엔드포인트

담당 기능:
- 회원가입 (POST /auth/register)
- 로그인 (POST /auth/login)
- 토큰 갱신 (POST /auth/refresh)
- 로그아웃 (POST /auth/logout)
- 비밀번호 변경 (PUT /auth/password)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_current_user
from app.schemas.auth import (
    RegisterRequest, 
    RegisterResponse,
    LoginRequest, 
    TokenResponse,
    PasswordChangeRequest
)
from app.services.auth_service import AuthService
from app.models.account import Account

router = APIRouter()


@router.post(
    "/register", 
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="회원가입",
    description="이메일로 새 계정을 만듭니다."
)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    ## 회원가입 API
    
    ### Request Body
    - **email**: 이메일 형식 (예: user@example.com)
    - **password**: 8자 이상, 영문+숫자 포함
    - **nickname**: 2~20자
    
    ### Response
    - 성공: 201 Created + 사용자 정보
    - 실패: 400 (검증 오류) 또는 409 (이메일 중복)
    """
    result = await AuthService.register(db, request)
    return {
        "success": True,
        "data": result
    }


@router.post(
    "/login",
    response_model=dict,
    summary="로그인",
    description="이메일과 비밀번호로 로그인합니다."
)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    ## 로그인 API
    
    ### Request Body
    - **email**: 가입한 이메일
    - **password**: 비밀번호
    
    ### Response
    - 성공: access_token, refresh_token 반환
    - 실패: 401 (이메일/비밀번호 틀림)
    """
    tokens = await AuthService.login(db, request.email, request.password)
    return {
        "success": True,
        "data": tokens
    }


@router.post(
    "/refresh",
    response_model=dict,
    summary="토큰 갱신",
    description="만료된 Access Token을 새로 발급받습니다."
)
async def refresh_token(
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    ## 토큰 갱신 API
    
    Authorization 헤더에 refresh_token을 넣어 요청하세요.
    
    ### Response
    - 성공: 새 access_token 반환
    - 실패: 401 (refresh_token 만료)
    """
    new_token = await AuthService.refresh_token(db, current_user)
    return {
        "success": True,
        "data": new_token
    }


@router.post(
    "/logout",
    response_model=dict,
    summary="로그아웃",
    description="토큰을 무효화합니다."
)
async def logout(
    current_user: Account = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    ## 로그아웃 API
    
    현재 토큰을 무효화합니다.
    """
    await AuthService.logout(db, current_user)
    return {
        "success": True,
        "data": {"message": "로그아웃되었습니다."}
    }
```

---

### apartments.py 예시

```python
"""
아파트 관련 API 엔드포인트

담당 기능:
- 아파트 상세 조회 (GET /apartments/{apt_id})
- 거래 내역 조회 (GET /apartments/{apt_id}/transactions)
- 가격 추이 조회 (GET /apartments/{apt_id}/price-trend)
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.services.apartment_service import ApartmentService

router = APIRouter()


@router.get(
    "/{apt_id}",
    response_model=dict,
    summary="아파트 상세 정보",
    description="아파트의 모든 기본 정보를 조회합니다."
)
async def get_apartment(
    apt_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    ## 아파트 상세 조회 API
    
    ### Path Parameter
    - **apt_id**: 아파트 고유 번호
    
    ### Response
    - 아파트명, 주소, 세대수, 준공일 등 기본 정보
    """
    result = await ApartmentService.get_detail(db, apt_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APT_NOT_FOUND", "message": "아파트를 찾을 수 없습니다"}
        )
    return {
        "success": True,
        "data": result,
        "meta": {
            "data_source": "국토교통부",
            "disclaimer": "본 서비스는 과거 데이터 기반 시각화이며 투자 판단/권유를 제공하지 않습니다."
        }
    }


@router.get(
    "/{apt_id}/transactions",
    response_model=dict,
    summary="실거래 내역",
    description="아파트의 실거래 내역을 조회합니다."
)
async def get_transactions(
    apt_id: int,
    trans_type: Optional[str] = Query(None, regex="^(SALE|JEONSE|MONTHLY|ALL)$"),
    start_date: Optional[str] = Query(None, description="시작 년월 (YYYY-MM)"),
    end_date: Optional[str] = Query(None, description="종료 년월 (YYYY-MM)"),
    page: int = Query(1, ge=1, description="페이지 번호"),
    limit: int = Query(20, ge=1, le=100, description="페이지당 개수"),
    db: AsyncSession = Depends(get_db)
):
    """
    ## 실거래 내역 조회 API
    
    ### Query Parameters
    - **trans_type**: 거래 유형 (SALE, JEONSE, MONTHLY, ALL)
    - **page**: 페이지 번호 (기본 1)
    - **limit**: 페이지당 개수 (기본 20, 최대 100)
    """
    result = await ApartmentService.get_transactions(
        db, apt_id, trans_type, start_date, end_date, page, limit
    )
    return {
        "success": True,
        "data": result["transactions"],
        "meta": {
            "page": page,
            "limit": limit,
            "total": result["total"],
            "data_source": "국토교통부"
        }
    }
```

---

## 💡 작성 시 주의사항

### ✅ 해야 할 것

1. **Docstring 작성**: Swagger 문서에 자동으로 표시됩니다
2. **타입 힌트 사용**: `apt_id: int`, `request: RegisterRequest`
3. **의존성 주입 사용**: `Depends(get_db)`, `Depends(get_current_user)`
4. **서비스 레이어에 위임**: 복잡한 로직은 `services/`에서 처리

### ❌ 하면 안 되는 것

1. **엔드포인트에서 직접 DB 쿼리 작성하지 않기**
2. **복잡한 비즈니스 로직 넣지 않기**
3. **에러 메시지에 민감한 정보 노출하지 않기**

---

## 🎨 HTTP 상태 코드 가이드

| 상황 | 상태 코드 | 예시 |
|------|-----------|------|
| 조회 성공 | 200 OK | GET /apartments/123 |
| 생성 성공 | 201 Created | POST /auth/register |
| 삭제 성공 | 200 OK | DELETE /favorites/apartments/123 |
| 잘못된 요청 | 400 Bad Request | 이메일 형식 틀림 |
| 인증 필요 | 401 Unauthorized | 토큰 없음/만료 |
| 권한 없음 | 403 Forbidden | 남의 정보 접근 |
| 리소스 없음 | 404 Not Found | 없는 아파트 조회 |
| 중복 | 409 Conflict | 이미 가입된 이메일 |
