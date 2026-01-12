# 🚀 API 라우터 가이드 (초보자용)

이 문서는 백엔드 API의 구조와 사용법을 초보 개발자도 이해할 수 있도록 설명합니다.

## 📋 목차
1. [API란?](#api란)
2. [라우터 구조](#라우터-구조)
3. [엔드포인트 목록](#엔드포인트-목록)
4. [사용 예시](#사용-예시)
5. [에러 처리](#에러-처리)

---

## API란?

**API (Application Programming Interface)**는 다른 프로그램과 소통하는 방법입니다.

예를 들어:
- **프론트엔드 (React)**: "사용자 정보를 보여줘!"
- **백엔드 (FastAPI)**: "여기 있어요!" → 데이터 전달

이런 대화를 가능하게 하는 것이 **API 엔드포인트**입니다.

---

## 라우터 구조

백엔드의 API는 다음과 같이 구성되어 있습니다:

```
http://localhost:8000
├── /                          # 루트 (서비스 정보)
├── /health                    # 헬스 체크
├── /docs                      # API 문서 (Swagger UI)
└── /api/v1                    # API v1 버전
    ├── /auth                  # 인증 관련
    │   ├── /webhook           # Clerk 웹훅 (사용자 동기화)
    │   ├── /me                # 내 프로필 조회
    │   └── /me                # 내 프로필 수정 (PATCH)
    └── /admin                 # 관리자 기능 (개발용)
        ├── /accounts          # 모든 계정 조회
        ├── /accounts/{id}     # 특정 계정 조회
        ├── /db/tables         # 테이블 목록
        └── /db/query          # 테이블 데이터 조회
```

### 📁 파일 구조

```
backend/app/
├── main.py                    # FastAPI 앱 시작점
└── api/v1/
    ├── router.py              # 모든 라우터를 모으는 곳
    └── endpoints/
        ├── auth.py            # 인증 엔드포인트
        └── admin.py           # 관리자 엔드포인트
```

---

## 엔드포인트 목록

### 🔐 인증 API (`/api/v1/auth`)

#### 1. 내 프로필 조회
```http
GET /api/v1/auth/me
```

**설명**: 현재 로그인한 사용자의 정보를 가져옵니다.

**인증 필요**: ✅ (Bearer Token 필요)

**요청 예시**:
```bash
curl -X GET "http://localhost:8000/api/v1/auth/me" \
  -H "Authorization: Bearer YOUR_CLERK_TOKEN"
```

**응답 예시**:
```json
{
  "success": true,
  "data": {
    "account_id": 1,
    "clerk_user_id": "user_2aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2u",
    "email": "user@example.com",
    "nickname": "홍길동",
    "profile_image_url": "https://example.com/profile.jpg",
    "last_login_at": "2026-01-11T13:34:08",
    "created_at": "2026-01-11T10:00:00",
    "updated_at": "2026-01-11T13:34:08",
    "is_deleted": false
  }
}
```

---

#### 2. 내 프로필 수정
```http
PATCH /api/v1/auth/me
```

**설명**: 현재 로그인한 사용자의 닉네임이나 프로필 이미지를 수정합니다.

**인증 필요**: ✅ (Bearer Token 필요)

**요청 본문**:
```json
{
  "nickname": "새로운닉네임",
  "profile_image_url": "https://example.com/new-profile.jpg"
}
```

**요청 예시**:
```bash
curl -X PATCH "http://localhost:8000/api/v1/auth/me" \
  -H "Authorization: Bearer YOUR_CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nickname": "새로운닉네임"
  }'
```

**응답 예시**:
```json
{
  "success": true,
  "data": {
    "account_id": 1,
    "nickname": "새로운닉네임",
    ...
  }
}
```

---

#### 3. Clerk 웹훅 (내부용)
```http
POST /api/v1/auth/webhook
```

**설명**: Clerk에서 사용자가 생성/수정/삭제될 때 자동으로 호출됩니다.  
**일반 사용자는 사용하지 않습니다!** Clerk Dashboard에서 설정하는 용도입니다.

**인증 필요**: ✅ (Svix 서명 검증)

---

### 🛠️ 관리자 API (`/api/v1/admin`)

> ⚠️ **주의**: 이 API들은 개발/테스트 환경에서만 사용하세요!

#### 1. 모든 계정 조회
```http
GET /api/v1/admin/accounts?skip=0&limit=100
```

**설명**: 데이터베이스에 등록된 모든 사용자 계정을 조회합니다.

**인증 필요**: ❌ (개발용이므로 인증 없이 사용 가능)

**쿼리 파라미터**:
- `skip` (선택): 건너뛸 레코드 수 (기본값: 0)
- `limit` (선택): 가져올 레코드 수 (기본값: 100, 최대: 100)

**요청 예시**:
```bash
curl -X GET "http://localhost:8000/api/v1/admin/accounts?skip=0&limit=10"
```

**응답 예시**:
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "account_id": 1,
        "email": "user1@example.com",
        "nickname": "홍길동",
        ...
      },
      {
        "account_id": 2,
        "email": "user2@example.com",
        "nickname": "김철수",
        ...
      }
    ],
    "total": 50,
    "skip": 0,
    "limit": 10
  }
}
```

---

#### 2. 특정 계정 조회
```http
GET /api/v1/admin/accounts/{account_id}
```

**설명**: 특정 계정 ID로 계정 정보를 조회합니다.

**경로 파라미터**:
- `account_id` (필수): 계정 ID (숫자)

**요청 예시**:
```bash
curl -X GET "http://localhost:8000/api/v1/admin/accounts/1"
```

---

#### 3. 계정 삭제
```http
DELETE /api/v1/admin/accounts/{account_id}
```

**설명**: 특정 계정을 삭제합니다. (소프트 삭제: `is_deleted = true`)

**경로 파라미터**:
- `account_id` (필수): 계정 ID (숫자)

**요청 예시**:
```bash
curl -X DELETE "http://localhost:8000/api/v1/admin/accounts/1"
```

**응답 예시**:
```json
{
  "success": true,
  "data": {
    "message": "계정이 삭제되었습니다.",
    "account_id": 1
  }
}
```

---

#### 4. 테이블 목록 조회
```http
GET /api/v1/admin/db/tables
```

**설명**: 데이터베이스에 있는 모든 테이블 목록을 조회합니다.

**요청 예시**:
```bash
curl -X GET "http://localhost:8000/api/v1/admin/db/tables"
```

**응답 예시**:
```json
{
  "success": true,
  "data": {
    "tables": [
      "accounts",
      "apartments",
      "cities",
      "favorite_apartments",
      "favorite_locations",
      "house_prices",
      "my_properties",
      "recent_searches",
      "states",
      "transactions"
    ],
    "count": 10
  }
}
```

---

#### 5. 테이블 데이터 조회
```http
GET /api/v1/admin/db/query?table_name=accounts&limit=50
```

**설명**: 특정 테이블의 데이터를 조회합니다.

**쿼리 파라미터**:
- `table_name` (필수): 테이블 이름
- `limit` (선택): 가져올 레코드 수 (기본값: 50, 최대: 100)

**허용된 테이블**:
- `accounts`, `states`, `cities`, `apartments`, `transactions`
- `favorite_apartments`, `favorite_locations`, `my_properties`
- `house_prices`, `recent_searches`

**요청 예시**:
```bash
curl -X GET "http://localhost:8000/api/v1/admin/db/query?table_name=accounts&limit=10"
```

**응답 예시**:
```json
{
  "success": true,
  "data": {
    "table_name": "accounts",
    "columns": ["account_id", "clerk_user_id", "email", "nickname", ...],
    "rows": [
      {
        "account_id": 1,
        "clerk_user_id": "user_...",
        "email": "user@example.com",
        ...
      }
    ],
    "total": 50,
    "limit": 10
  }
}
```

---

## 사용 예시

### JavaScript (Axios)

```javascript
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

// 1. 내 프로필 조회
async function getMyProfile(token) {
  const response = await axios.get(`${API_BASE_URL}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data;
}

// 2. 프로필 수정
async function updateMyProfile(token, nickname) {
  const response = await axios.patch(
    `${API_BASE_URL}/api/v1/auth/me`,
    { nickname },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
}

// 3. 모든 계정 조회 (관리자)
async function getAllAccounts() {
  const response = await axios.get(`${API_BASE_URL}/api/v1/admin/accounts`);
  return response.data;
}
```

### Python (httpx)

```python
import httpx

API_BASE_URL = "http://localhost:8000"

# 1. 내 프로필 조회
async def get_my_profile(token: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{API_BASE_URL}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        return response.json()

# 2. 프로필 수정
async def update_my_profile(token: str, nickname: str):
    async with httpx.AsyncClient() as client:
        response = await client.patch(
            f"{API_BASE_URL}/api/v1/auth/me",
            json={"nickname": nickname},
            headers={"Authorization": f"Bearer {token}"}
        )
        return response.json()
```

---

## 에러 처리

모든 API는 일관된 에러 형식을 반환합니다:

### 에러 응답 형식

```json
{
  "detail": {
    "code": "ERROR_CODE",
    "message": "에러 메시지"
  }
}
```

### 주요 에러 코드

| HTTP 상태 코드 | 에러 코드 | 설명 |
|--------------|----------|------|
| 401 | `MISSING_TOKEN` | 인증 토큰이 없습니다 |
| 401 | `INVALID_TOKEN` | 유효하지 않은 토큰입니다 |
| 404 | `USER_NOT_FOUND` | 사용자를 찾을 수 없습니다 |
| 404 | `NOT_FOUND` | 리소스를 찾을 수 없습니다 |
| 400 | `VALIDATION_ERROR` | 입력값 검증 실패 |
| 500 | `INTERNAL_SERVER_ERROR` | 서버 내부 오류 |

### 에러 처리 예시

```javascript
try {
  const response = await axios.get(`${API_BASE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('성공:', response.data);
} catch (error) {
  if (error.response) {
    // 서버가 응답을 반환했지만 에러 상태 코드
    const errorDetail = error.response.data.detail;
    console.error('에러 코드:', errorDetail.code);
    console.error('에러 메시지:', errorDetail.message);
    
    if (error.response.status === 401) {
      // 인증 실패 - 다시 로그인 필요
      console.log('로그인이 필요합니다.');
    }
  } else {
    // 요청이 전송되지 않음 (네트워크 오류 등)
    console.error('네트워크 오류:', error.message);
  }
}
```

---

## 📚 추가 자료

- **Swagger UI**: http://localhost:8000/docs
  - 모든 API를 시각적으로 확인하고 테스트할 수 있습니다.
- **ReDoc**: http://localhost:8000/redoc
  - API 문서를 읽기 좋은 형식으로 볼 수 있습니다.

---

## ❓ 자주 묻는 질문 (FAQ)

### Q1. 인증 토큰은 어디서 가져오나요?
**A**: Clerk를 사용하여 프론트엔드에서 로그인하면 토큰을 받을 수 있습니다.  
자세한 내용은 [Clerk 인증 설정](./clerk_setup.md) 문서를 참고하세요.

### Q2. API를 테스트하고 싶어요.
**A**: Swagger UI (http://localhost:8000/docs)를 사용하면 브라우저에서 바로 테스트할 수 있습니다.

### Q3. 새 API 엔드포인트를 추가하고 싶어요.
**A**: [API 개발 가이드](./api_development.md) 문서를 참고하세요.

### Q4. 에러가 발생했어요. 어떻게 해야 하나요?
**A**: 
1. 백엔드 로그 확인: `docker-compose logs backend`
2. Swagger UI에서 요청/응답 확인
3. 에러 코드를 확인하고 위의 [에러 처리](#에러-처리) 섹션 참고

---

**마지막 업데이트**: 2026-01-11
