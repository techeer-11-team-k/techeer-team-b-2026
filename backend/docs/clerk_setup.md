# 🔐 Clerk 인증 설정 가이드

Clerk를 사용한 사용자 인증 설정 방법을 설명합니다.

## 📋 목차
1. [Clerk란?](#clerk란)
2. [Clerk 계정 생성](#clerk-계정-생성)
3. [환경 변수 설정](#환경-변수-설정)
4. [웹훅 설정](#웹훅-설정)
5. [프론트엔드 연동](#프론트엔드-연동)
6. [문제 해결](#문제-해결)

---

## Clerk란?

**Clerk**는 사용자 인증을 쉽게 구현할 수 있게 해주는 서비스입니다.

### 장점
- ✅ 회원가입/로그인 UI 제공
- ✅ 소셜 로그인 (Google, GitHub 등) 지원
- ✅ 비밀번호 재설정, 이메일 인증 자동 처리
- ✅ 보안 관리 (JWT, 세션 등)

### 우리 프로젝트에서의 역할
- **프론트엔드**: Clerk UI로 로그인 → JWT 토큰 받음
- **백엔드**: JWT 토큰 검증 → 사용자 정보 조회

---

## Clerk 계정 생성

1. **Clerk 웹사이트 접속**: https://clerk.com
2. **회원가입/로그인**
3. **새 애플리케이션 생성**
   - Application name: "부동산 분석 플랫폼" (원하는 이름)
   - Sign-in options: Email, Google 등 선택

---

## 환경 변수 설정

Clerk Dashboard에서 키를 복사하여 `.env` 파일에 추가합니다.

### 1. Clerk Dashboard에서 키 복사

1. Clerk Dashboard → **API Keys** 메뉴
2. 다음 키들을 복사:
   - **Publishable Key** (pk_test_...)
   - **Secret Key** (sk_test_...)

### 2. `.env` 파일 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가:

```bash
# Clerk 인증 설정
CLERK_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
CLERK_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
CLERK_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
```

> ⚠️ **주의**: `.env` 파일은 절대 Git에 커밋하지 마세요! `.gitignore`에 추가되어 있습니다.

---

## 웹훅 설정

웹훅은 Clerk에서 사용자가 생성/수정/삭제될 때 백엔드에 알려주는 기능입니다.

### 1. 로컬 개발 환경 (ngrok 사용)

로컬 개발 환경에서는 ngrok을 사용하여 외부에서 접근 가능한 URL을 만듭니다.

#### ngrok 설치
```bash
# Windows (Chocolatey)
choco install ngrok

# 또는 https://ngrok.com/download 에서 다운로드
```

#### ngrok 실행
```bash
ngrok http 8000
```

출력 예시:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:8000
```

#### Clerk Dashboard 설정
1. Clerk Dashboard → **Webhooks** 메뉴
2. **Add Endpoint** 클릭
3. **Endpoint URL** 입력: `https://abc123.ngrok.io/api/v1/auth/webhook`
4. **Events** 선택:
   - ✅ `user.created`
   - ✅ `user.updated`
   - ✅ `user.deleted`
5. **Create** 클릭
6. **Signing Secret** 복사 → `.env` 파일의 `CLERK_WEBHOOK_SECRET`에 추가

### 2. 프로덕션 환경

프로덕션 환경에서는 실제 도메인을 사용합니다.

```
https://your-api.com/api/v1/auth/webhook
```

---

## 프론트엔드 연동

### React (예시)

```typescript
import { ClerkProvider, useAuth } from '@clerk/clerk-react'

// ClerkProvider로 앱 감싸기
function App() {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <YourApp />
    </ClerkProvider>
  )
}

// 로그인 후 토큰 가져오기
function YourComponent() {
  const { getToken } = useAuth()
  
  const callApi = async () => {
    const token = await getToken()
    
    const response = await fetch('http://localhost:8000/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    
    const data = await response.json()
    console.log(data)
  }
}
```

---

## 인증 플로우

### 1. 사용자 로그인
```
사용자 → Clerk 로그인 → JWT 토큰 받음
```

### 2. API 호출
```
프론트엔드 → Authorization: Bearer {token} → 백엔드
```

### 3. 토큰 검증
```
백엔드 → verify_clerk_token() → JWT 검증
```

### 4. 사용자 조회/생성
```
백엔드 → DB에서 사용자 조회
      → 없으면 자동 생성 (JWT 정보 기반)
      → 사용자 정보 반환
```

---

## 문제 해결

### Q1. "INVALID_TOKEN" 에러가 발생해요.

**원인**: JWT 토큰이 유효하지 않거나 만료됨

**해결 방법**:
1. 프론트엔드에서 토큰을 다시 가져오기: `await getToken()`
2. Clerk Dashboard에서 키가 올바른지 확인
3. 백엔드 로그 확인: `docker-compose logs backend`

---

### Q2. "USER_NOT_FOUND" 에러가 발생해요.

**원인**: 사용자가 DB에 없음

**해결 방법**:
- 자동 생성 기능이 있으므로, 다시 API를 호출하면 자동으로 생성됩니다.
- 또는 Clerk 웹훅이 제대로 설정되어 있는지 확인

---

### Q3. 웹훅이 작동하지 않아요.

**원인**: 웹훅 URL이 잘못되었거나 서명 검증 실패

**해결 방법**:
1. Clerk Dashboard에서 웹훅 URL 확인
2. `.env` 파일의 `CLERK_WEBHOOK_SECRET` 확인
3. 백엔드 로그 확인: `docker-compose logs backend`

---

### Q4. CORS 에러가 발생해요.

**원인**: 프론트엔드 도메인이 CORS 허용 목록에 없음

**해결 방법**:
`.env` 파일의 `ALLOWED_ORIGINS`에 프론트엔드 URL 추가:

```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

---

## 📚 추가 자료

- [Clerk 공식 문서](https://clerk.com/docs)
- [API 라우터 가이드](./api_router_guide.md)
- [인증 플로우](./auth_flow.md)

---

**마지막 업데이트**: 2026-01-11
