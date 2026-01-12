# 🔄 인증 플로우 가이드

Clerk를 사용한 사용자 인증의 전체 흐름을 설명합니다.

## 📋 목차
1. [전체 플로우](#전체-플로우)
2. [상세 설명](#상세-설명)
3. [시퀀스 다이어그램](#시퀀스-다이어그램)

---

## 전체 플로우

```
1. 사용자 로그인 (프론트엔드)
   ↓
2. Clerk 인증 처리
   ↓
3. JWT 토큰 발급
   ↓
4. API 호출 (토큰 포함)
   ↓
5. 백엔드 토큰 검증
   ↓
6. 사용자 조회/생성
   ↓
7. 응답 반환
```

---

## 상세 설명

### 1단계: 사용자 로그인 (프론트엔드)

사용자가 Clerk UI를 통해 로그인합니다.

```typescript
// React 예시
import { SignIn } from '@clerk/clerk-react'

function LoginPage() {
  return <SignIn />
}
```

**결과**: Clerk가 사용자를 인증하고 세션을 생성합니다.

---

### 2단계: JWT 토큰 가져오기

프론트엔드에서 Clerk SDK를 사용하여 JWT 토큰을 가져옵니다.

```typescript
import { useAuth } from '@clerk/clerk-react'

function MyComponent() {
  const { getToken } = useAuth()
  
  const callApi = async () => {
    // JWT 토큰 가져오기
    const token = await getToken()
    // token = "eyJhbGciOiJSUzI1NiIs..."
  }
}
```

**JWT 토큰 내용** (디코딩 시):
```json
{
  "sub": "user_2aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2u",  // Clerk 사용자 ID
  "email": "user@example.com",
  "iss": "https://careful-snipe-83.clerk.accounts.dev",
  "exp": 1234567890,
  ...
}
```

---

### 3단계: API 호출 (토큰 포함)

프론트엔드에서 백엔드 API를 호출할 때 토큰을 헤더에 포함합니다.

```typescript
const response = await fetch('http://localhost:8000/api/v1/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

---

### 4단계: 백엔드 토큰 검증

백엔드에서 `get_current_user` 의존성이 토큰을 검증합니다.

```python
# app/api/v1/deps.py

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Account:
    # 1. 토큰 추출
    token = credentials.credentials
    
    # 2. Clerk JWT 검증
    token_payload = await verify_clerk_token(authorization=f"Bearer {token}")
    
    # 3. 사용자 ID 추출
    clerk_user_id = token_payload.get("sub")
    
    # 4. DB에서 사용자 조회
    user = await account_crud.get_by_clerk_user_id(db, clerk_user_id=clerk_user_id)
    
    # 5. 없으면 자동 생성
    if not user:
        user = await create_user_from_token(db, token_payload)
    
    return user
```

**검증 과정**:
1. JWT 헤더에서 `kid` (Key ID) 추출
2. Clerk JWKS 엔드포인트에서 공개 키 가져오기
3. RS256 알고리즘으로 서명 검증
4. `iss` (Issuer), `exp` (Expiration) 검증

---

### 5단계: 사용자 자동 생성 (필요 시)

사용자가 DB에 없으면 JWT 토큰 정보를 기반으로 자동 생성합니다.

```python
# app/api/v1/deps.py

if not user:
    # JWT에서 정보 추출
    email = token_payload.get("email") or f"{clerk_user_id}@clerk.user"
    nickname = token_payload.get("username") or email.split("@")[0]
    
    # 사용자 생성
    user = await account_crud.create_from_clerk(
        db,
        clerk_user_id=clerk_user_id,
        email=email,
        nickname=nickname[:50]  # 길이 제한
    )
```

---

### 6단계: 응답 반환

사용자 정보를 반환합니다.

```python
@router.get("/me")
async def get_my_profile(current_user: Account = Depends(get_current_user)):
    return {
        "success": True,
        "data": current_user
    }
```

---

## 시퀀스 다이어그램

```
사용자          프론트엔드          Clerk          백엔드          DB
  |                |                |              |              |
  |--로그인 요청-->|                |              |              |
  |                |--인증 요청---->|              |              |
  |                |<--세션 생성----|              |              |
  |<--로그인 완료--|                |              |              |
  |                |                |              |              |
  |--API 호출 요청->|                |              |              |
  |                |--토큰 요청---->|              |              |
  |                |<--JWT 토큰-----|              |              |
  |                |                |              |              |
  |                |--API 호출 (토큰)------------->|              |
  |                |                |              |--토큰 검증-->|
  |                |                |              |--JWKS 요청-->|
  |                |                |<--JWKS 반환--|              |
  |                |                |              |--검증 완료--|
  |                |                |              |--사용자 조회->|
  |                |                |              |<--사용자 정보-|
  |                |                |              |              |
  |                |<--응답 반환----|              |              |
  |<--결과 표시----|                |              |              |
```

---

## 웹훅 플로우 (사용자 동기화)

Clerk에서 사용자가 생성/수정/삭제될 때 웹훅을 통해 백엔드에 알립니다.

```
Clerk          백엔드          DB
  |              |              |
  |--웹훅 이벤트->|              |
  |              |--서명 검증-->|
  |              |--이벤트 파싱|
  |              |              |
  |              |--사용자 생성->|
  |              |              |--INSERT
  |              |<--완료------|
  |<--200 OK-----|              |
```

**웹훅 이벤트 타입**:
- `user.created`: 새 사용자 생성
- `user.updated`: 사용자 정보 업데이트
- `user.deleted`: 사용자 삭제

---

## 📚 추가 자료

- [Clerk 인증 설정](./clerk_setup.md)
- [API 라우터 가이드](./api_router_guide.md)

---

**마지막 업데이트**: 2026-01-11
