# 📁 프로젝트 구조 가이드

백엔드 프로젝트의 폴더 구조와 각 파일의 역할을 설명합니다.

## 📂 전체 구조

```
backend/
├── app/                          # 메인 애플리케이션 코드
│   ├── main.py                   # FastAPI 앱 시작점
│   ├── api/                      # API 엔드포인트
│   │   └── v1/
│   │       ├── router.py         # 모든 라우터 통합
│   │       ├── deps.py           # 의존성 주입 (DB, 인증 등)
│   │       └── endpoints/        # 실제 API 엔드포인트
│   │           ├── auth.py       # 인증 관련 API
│   │           ├── admin.py       # 관리자 API
│   │           └── search.py      # 검색 API (예정)
│   ├── core/                     # 핵심 설정 및 유틸리티
│   │   ├── config.py             # 환경 변수 설정
│   │   ├── clerk.py              # Clerk 인증 유틸리티
│   │   └── exceptions.py         # 커스텀 예외 클래스
│   ├── db/                       # 데이터베이스 설정
│   │   ├── base.py               # SQLAlchemy Base
│   │   └── session.py            # DB 세션 관리
│   ├── models/                   # 데이터베이스 모델 (테이블 정의)
│   │   └── account.py            # Account 모델
│   ├── schemas/                  # Pydantic 스키마 (요청/응답)
│   │   └── account.py            # Account 스키마
│   ├── crud/                     # 데이터베이스 CRUD 작업
│   │   ├── base.py               # 기본 CRUD 클래스
│   │   └── account.py            # Account CRUD
│   ├── services/                 # 비즈니스 로직
│   │   └── auth.py               # 인증 서비스
│   └── utils/                    # 유틸리티 함수
├── scripts/                      # 스크립트 파일
│   └── init_db.sql              # DB 초기화 SQL
├── docs/                         # 문서
├── requirements.txt             # Python 패키지 목록
├── Dockerfile                   # Docker 이미지 정의
└── README.md                    # 프로젝트 README
```

---

## 📄 주요 파일 설명

### 1. `app/main.py`
**역할**: FastAPI 애플리케이션의 시작점

**주요 내용**:
- FastAPI 앱 생성
- CORS 미들웨어 설정
- 라우터 등록
- 기본 엔드포인트 (`/`, `/health`)

**예시**:
```python
from fastapi import FastAPI
from app.api.v1.router import api_router

app = FastAPI(title="부동산 데이터 분석 서비스")
app.include_router(api_router, prefix="/api/v1")
```

---

### 2. `app/api/v1/router.py`
**역할**: 모든 API 라우터를 하나로 모음

**주요 내용**:
- 각 엔드포인트 모듈을 import
- `api_router`에 등록
- 태그와 prefix 설정

**예시**:
```python
from app.api.v1.endpoints import auth, admin

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["🔐 Auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["🛠️ Admin"])
```

---

### 3. `app/api/v1/endpoints/auth.py`
**역할**: 인증 관련 API 엔드포인트

**주요 엔드포인트**:
- `POST /api/v1/auth/webhook` - Clerk 웹훅
- `GET /api/v1/auth/me` - 내 프로필 조회
- `PATCH /api/v1/auth/me` - 내 프로필 수정

---

### 4. `app/api/v1/deps.py`
**역할**: 의존성 주입 (Dependency Injection)

**주요 함수**:
- `get_db()` - 데이터베이스 세션 제공
- `get_current_user()` - 현재 로그인한 사용자 조회
- `get_current_user_optional()` - 선택적 인증

**사용 예시**:
```python
@router.get("/me")
async def get_profile(current_user: Account = Depends(get_current_user)):
    return current_user
```

---

### 5. `app/core/config.py`
**역할**: 환경 변수 관리

**주요 설정**:
- 데이터베이스 URL
- Clerk 키
- Redis URL
- CORS 설정

**사용 예시**:
```python
from app.core.config import settings

print(settings.DATABASE_URL)
print(settings.CLERK_SECRET_KEY)
```

---

### 6. `app/core/clerk.py`
**역할**: Clerk 인증 유틸리티

**주요 함수**:
- `verify_clerk_token()` - JWT 토큰 검증
- `get_clerk_jwks()` - JWKS 가져오기
- `verify_webhook_signature()` - 웹훅 서명 검증

---

### 7. `app/models/account.py`
**역할**: 데이터베이스 모델 정의 (SQLAlchemy)

**주요 내용**:
- `Account` 클래스
- 테이블 컬럼 정의
- 관계(Relationships) 정의

**예시**:
```python
class Account(Base):
    __tablename__ = "accounts"
    
    account_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clerk_user_id: Mapped[str] = mapped_column(String(255), unique=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    ...
```

---

### 8. `app/schemas/account.py`
**역할**: 요청/응답 스키마 정의 (Pydantic)

**주요 스키마**:
- `AccountCreate` - 계정 생성 요청
- `AccountUpdate` - 계정 수정 요청
- `AccountResponse` - 계정 응답
- `ClerkWebhookEvent` - Clerk 웹훅 이벤트

**예시**:
```python
class AccountResponse(BaseModel):
    success: bool = True
    data: AccountBase
```

---

### 9. `app/crud/account.py`
**역할**: 데이터베이스 CRUD 작업

**주요 메서드**:
- `get_by_clerk_user_id()` - Clerk ID로 조회
- `create_from_clerk()` - Clerk 웹훅으로 생성
- `update_from_clerk()` - Clerk 웹훅으로 업데이트

**예시**:
```python
user = await account_crud.get_by_clerk_user_id(db, clerk_user_id="user_...")
```

---

### 10. `app/services/auth.py`
**역할**: 인증 관련 비즈니스 로직

**주요 메서드**:
- `sync_user_from_clerk()` - Clerk 사용자 동기화
- `get_user_by_clerk_id()` - 사용자 조회
- `update_profile()` - 프로필 수정

**예시**:
```python
user = await auth_service.sync_user_from_clerk(
    db,
    clerk_user_id="user_...",
    email="user@example.com",
    nickname="홍길동"
)
```

---

## 🔄 데이터 흐름

### API 요청 처리 흐름

```
1. 클라이언트 요청
   ↓
2. app/main.py (FastAPI 앱)
   ↓
3. app/api/v1/router.py (라우터 통합)
   ↓
4. app/api/v1/endpoints/auth.py (엔드포인트)
   ↓
5. app/api/v1/deps.py (의존성 주입: 인증, DB)
   ↓
6. app/services/auth.py (비즈니스 로직)
   ↓
7. app/crud/account.py (DB 작업)
   ↓
8. app/models/account.py (SQLAlchemy 모델)
   ↓
9. PostgreSQL 데이터베이스
```

---

## 📝 레이어 설명

### 1. API Layer (`app/api/`)
- **역할**: HTTP 요청/응답 처리
- **책임**: 요청 검증, 응답 형식 변환
- **예시**: `auth.py`, `admin.py`

### 2. Service Layer (`app/services/`)
- **역할**: 비즈니스 로직 처리
- **책임**: 복잡한 로직, 여러 CRUD 조합
- **예시**: `auth_service.sync_user_from_clerk()`

### 3. CRUD Layer (`app/crud/`)
- **역할**: 데이터베이스 작업
- **책임**: 단순한 CRUD 작업
- **예시**: `account_crud.get_by_clerk_user_id()`

### 4. Model Layer (`app/models/`)
- **역할**: 데이터베이스 테이블 정의
- **책임**: 테이블 구조, 관계 정의
- **예시**: `Account` 클래스

---

## 🎯 새 기능 추가 시 따라야 할 순서

1. **Model 추가** (`app/models/`)
   - 테이블 구조 정의

2. **Schema 추가** (`app/schemas/`)
   - 요청/응답 스키마 정의

3. **CRUD 추가** (`app/crud/`)
   - 데이터베이스 작업 메서드

4. **Service 추가** (`app/services/`)
   - 비즈니스 로직 구현

5. **Endpoint 추가** (`app/api/v1/endpoints/`)
   - API 엔드포인트 구현

6. **Router 등록** (`app/api/v1/router.py`)
   - 라우터에 추가

---

## 📚 추가 자료

- [API 라우터 가이드](./api_router_guide.md)
- [API 개발 가이드](./api_development.md)
- [Clerk 인증 설정](./clerk_setup.md)
