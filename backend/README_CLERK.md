# 🔐 Clerk 인증 설정 가이드

Clerk를 사용한 인증 시스템 설정 방법입니다.

## ✅ 완료된 작업

- [x] Clerk 통합 코드 작성 완료
- [x] 환경변수 파일 생성 (`.env`)
- [x] API 라우터 등록 완료
- [x] 데이터베이스 마이그레이션 스크립트 생성

## 📋 다음 단계

### 1. Clerk Dashboard에서 Webhook 설정

1. **Clerk Dashboard 접속**: https://dashboard.clerk.com
2. **Webhooks 메뉴**로 이동
3. **Add Endpoint** 클릭
4. **엔드포인트 URL 입력**:
   - 로컬 개발: `http://localhost:8000/api/v1/auth/webhook`
   - 배포 환경: `https://your-api-domain.com/api/v1/auth/webhook`
5. **이벤트 선택**:
   - ✅ `user.created`
   - ✅ `user.updated`
   - ✅ `user.deleted`
6. **Webhook Secret 복사** → `.env` 파일의 `CLERK_WEBHOOK_SECRET`에 추가

### 2. 데이터베이스 초기화

```bash
# Docker를 사용하는 경우
docker exec -i realestate-db psql -U postgres -d realestate < backend/scripts/init_db.sql

# 또는 직접 psql 사용
psql -U postgres -d realestate -f backend/scripts/init_db.sql
```

### 3. 의존성 설치

```bash
cd backend
pip install -r requirements.txt
```

### 4. 서버 실행

```bash
# 로컬에서 실행
cd backend
uvicorn app.main:app --reload

# 또는 Docker Compose 사용
docker-compose up -d backend
```

### 5. API 테스트

1. **Swagger UI 접속**: http://localhost:8000/docs
2. **엔드포인트 확인**:
   - `POST /api/v1/auth/webhook` - Clerk 웹훅
   - `GET /api/v1/auth/me` - 내 프로필 조회 (인증 필요)
   - `PATCH /api/v1/auth/me` - 내 프로필 수정 (인증 필요)

## 🔑 환경변수 확인

`.env` 파일에 다음 값들이 설정되어 있는지 확인하세요:

```bash
CLERK_SECRET_KEY=sk_test_... ✅
CLERK_PUBLISHABLE_KEY=pk_test_... ✅
CLERK_WEBHOOK_SECRET=  # Clerk Dashboard에서 발급받아 추가 필요
```

## 📱 React Native 연동

React Native 앱에서 Clerk를 사용하려면:

1. **Clerk SDK 설치**:
```bash
npm install @clerk/clerk-expo
```

2. **환경변수 설정** (React Native):
```javascript
// app.json 또는 .env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
```

3. **로그인 후 세션 토큰 전송**:
```javascript
import { useAuth } from '@clerk/clerk-expo';

const { getToken } = useAuth();

// API 호출 시
const token = await getToken();
fetch('http://localhost:8000/api/v1/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## 🧪 테스트 방법

### 1. 웹훅 테스트

Clerk Dashboard에서 테스트 사용자를 생성하면 자동으로 웹훅이 호출되어 `accounts` 테이블에 사용자가 생성됩니다.

### 2. API 테스트

Swagger UI (`/docs`)에서 직접 테스트하거나, Postman/Thunder Client 사용:

```bash
# 내 프로필 조회 (Clerk 세션 토큰 필요)
GET http://localhost:8000/api/v1/auth/me
Authorization: Bearer {clerk_session_token}
```

## ⚠️ 주의사항

1. **`.env` 파일은 절대 Git에 커밋하지 마세요!** (이미 `.gitignore`에 포함됨)
2. **Webhook Secret은 반드시 설정해야 합니다.** (웹훅 보안 검증용)
3. **프로덕션 환경에서는 `CLERK_SECRET_KEY`를 Production 키로 변경하세요.**

## 📚 참고 자료

- [Clerk 공식 문서](https://clerk.com/docs)
- [Clerk Backend SDK](https://github.com/clerk/clerk-sdk-python)
- [Clerk React Native](https://clerk.com/docs/quickstarts/expo)
