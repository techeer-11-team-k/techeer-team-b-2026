# 🔧 환경 변수 가이드

백엔드에서 사용하는 모든 환경 변수를 설명합니다.

## 📋 목차
1. [환경 변수 파일](#환경-변수-파일)
2. [필수 환경 변수](#필수-환경-변수)
3. [선택적 환경 변수](#선택적-환경-변수)
4. [설정 방법](#설정-방법)

---

## 환경 변수 파일

프로젝트 루트에 `.env` 파일을 생성하여 환경 변수를 설정합니다.

```bash
# .env 파일 예시
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/realestate
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
```

> ⚠️ **주의**: `.env` 파일은 절대 Git에 커밋하지 마세요!

---

## 필수 환경 변수

### 데이터베이스

#### `DATABASE_URL`
**설명**: PostgreSQL 데이터베이스 연결 URL

**형식**: `postgresql+asyncpg://{user}:{password}@{host}:{port}/{database}`

**예시**:
```bash
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/realestate
```

**Docker 사용 시**:
```bash
DATABASE_URL=postgresql+asyncpg://user:password@db:5432/realestate
```

---

### Clerk 인증

#### `CLERK_SECRET_KEY`
**설명**: Clerk Secret Key (백엔드용)

**형식**: `sk_test_...` (테스트) 또는 `sk_live_...` (프로덕션)

**설정 방법**:
1. Clerk Dashboard → **API Keys**
2. **Secret Key** 복사
3. `.env` 파일에 추가

**예시**:
```bash
CLERK_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
```

---

#### `CLERK_PUBLISHABLE_KEY`
**설명**: Clerk Publishable Key (프론트엔드용, 백엔드에서도 참조 가능)

**형식**: `pk_test_...` (테스트) 또는 `pk_live_...` (프로덕션)

**예시**:
```bash
CLERK_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
```

---

#### `CLERK_WEBHOOK_SECRET` (선택)
**설명**: Clerk Webhook 서명 검증용 Secret

**형식**: `whsec_...`

**설정 방법**:
1. Clerk Dashboard → **Webhooks**
2. 엔드포인트 생성 후 **Signing Secret** 복사
3. `.env` 파일에 추가

**예시**:
```bash
CLERK_WEBHOOK_SECRET=whsec_abc123...
```

---

## 선택적 환경 변수

### Redis

#### `REDIS_URL`
**설명**: Redis 연결 URL

**기본값**: `redis://localhost:6379/0`

**예시**:
```bash
REDIS_URL=redis://localhost:6379/0
```

**Docker 사용 시**:
```bash
REDIS_URL=redis://redis:6379/0
```

---

### CORS

#### `ALLOWED_ORIGINS`
**설명**: CORS 허용 도메인 목록 (쉼표로 구분)

**기본값**: `http://localhost:3000,http://localhost:5173,http://localhost:8081`

**예시**:
```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://yourdomain.com
```

---

### 프로젝트 설정

#### `PROJECT_NAME`
**설명**: 프로젝트 이름

**기본값**: `부동산 데이터 분석 서비스`

**예시**:
```bash
PROJECT_NAME=부동산 분석 플랫폼
```

---

#### `VERSION`
**설명**: API 버전

**기본값**: `1.0.0`

**예시**:
```bash
VERSION=1.0.0
```

---

#### `API_V1_STR`
**설명**: API v1 경로 prefix

**기본값**: `/api/v1`

**예시**:
```bash
API_V1_STR=/api/v1
```

---

#### `DEBUG`
**설명**: 디버그 모드 활성화

**기본값**: `False`

**예시**:
```bash
DEBUG=true
```

---

#### `ENVIRONMENT`
**설명**: 실행 환경

**기본값**: `development`

**가능한 값**: `development`, `staging`, `production`

**예시**:
```bash
ENVIRONMENT=production
```

---

### 외부 API 키

#### `MOLIT_API_KEY`
**설명**: 국토부 API 키

**예시**:
```bash
MOLIT_API_KEY=your_molit_api_key
```

---

#### `KAKAO_REST_API_KEY`
**설명**: 카카오 REST API 키

**예시**:
```bash
KAKAO_REST_API_KEY=your_kakao_rest_api_key
```

---

#### `KAKAO_JAVASCRIPT_KEY`
**설명**: 카카오 JavaScript API 키

**예시**:
```bash
KAKAO_JAVASCRIPT_KEY=your_kakao_javascript_key
```

---

#### `GEMINI_API_KEY`
**설명**: Google Gemini API 키

**예시**:
```bash
GEMINI_API_KEY=your_gemini_api_key
```

---

#### `NAVER_CLIENT_ID`
**설명**: 네이버 클라이언트 ID

**예시**:
```bash
NAVER_CLIENT_ID=your_naver_client_id
```

---

#### `NAVER_CLIENT_SECRET`
**설명**: 네이버 클라이언트 Secret

**예시**:
```bash
NAVER_CLIENT_SECRET=your_naver_client_secret
```

---

### 이메일 설정

#### `SMTP_HOST`
**설명**: SMTP 서버 호스트

**기본값**: `smtp.gmail.com`

**예시**:
```bash
SMTP_HOST=smtp.gmail.com
```

---

#### `SMTP_PORT`
**설명**: SMTP 서버 포트

**기본값**: `587`

**예시**:
```bash
SMTP_PORT=587
```

---

#### `SMTP_USER`
**설명**: SMTP 사용자명 (이메일 주소)

**예시**:
```bash
SMTP_USER=your-email@gmail.com
```

---

#### `SMTP_PASSWORD`
**설명**: SMTP 비밀번호 (앱 비밀번호)

**예시**:
```bash
SMTP_PASSWORD=your-app-password
```

---

## 설정 방법

### 1. `.env` 파일 생성

프로젝트 루트에 `.env` 파일을 생성합니다.

```bash
# Windows
type nul > .env

# Linux/Mac
touch .env
```

### 2. 환경 변수 추가

`.env` 파일에 필요한 환경 변수를 추가합니다.

```bash
# 필수
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/realestate
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# 선택
REDIS_URL=redis://localhost:6379/0
ALLOWED_ORIGINS=http://localhost:3000
DEBUG=true
```

### 3. `.env` 파일 확인

`.env` 파일이 이미 프로젝트 루트에 존재합니다. 필요한 환경변수를 확인하고 수정하세요.

```bash
# .env 파일 예시 구조
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/realestate
CLERK_SECRET_KEY=sk_test_YOUR_KEY_HERE
CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
CLERK_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
REDIS_URL=redis://localhost:6379/0
ALLOWED_ORIGINS=http://localhost:3000
DEBUG=true
ENVIRONMENT=development
```

> ⚠️ **주의**: `.env` 파일은 Git에 커밋하지 마세요! 실제 API 키가 포함되어 있습니다.

### 4. Docker Compose 사용 시

`docker-compose.yml`에서 환경 변수를 설정할 수 있습니다.

```yaml
services:
  backend:
    environment:
      DATABASE_URL: ${DATABASE_URL}
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY}
      CLERK_PUBLISHABLE_KEY: ${CLERK_PUBLISHABLE_KEY}
```

---

## 환경 변수 확인

### Python에서 확인

```python
from app.core.config import settings

print(settings.DATABASE_URL)
print(settings.CLERK_SECRET_KEY)
```

### 환경 변수 로드 확인

서버 시작 시 환경 변수가 제대로 로드되었는지 확인:

```bash
docker-compose logs backend | grep "DATABASE_URL"
```

---

## 📚 추가 자료

- [Clerk 인증 설정](./clerk_setup.md)
- [Docker 설정](./docker_setup.md)

---

**마지막 업데이트**: 2026-01-11
