# 배포 개요 및 구조

전체 프로젝트의 배포 구조와 각 컴포넌트의 배포 방법을 설명합니다.

## 🏗️ 전체 배포 구조

```
┌─────────────────────────────────────────────────────────┐
│                    사용자 접근                           │
└───────────────┬─────────────────────┬───────────────────┘
                │                     │
        ┌───────▼────────┐    ┌───────▼────────┐
        │   웹 브라우저   │    │  모바일 앱      │
        │  (Chrome, etc) │    │ (iOS/Android)  │
        └───────┬────────┘    └───────┬────────┘
                │                     │
                │                     │ WebView
                │                     │
        ┌───────▼─────────────────────▼────────┐
        │      Vercel (프론트엔드)              │
        │  - React + Vite 앱                   │
        │  - https://your-project.vercel.app   │
        └───────────────┬───────────────────────┘
                        │ API 호출
                        │
        ┌───────────────▼───────────────────────┐
        │      별도 호스팅 (백엔드)              │
        │  - FastAPI 서버                       │
        │  - PostgreSQL + Redis                │
        │  - Railway/Render/AWS 등              │
        └───────────────────────────────────────┘
```

---

## 📦 배포 컴포넌트

### 1. 프론트엔드 (웹앱)

- **위치**: `frontend/` 디렉토리
- **기술 스택**: React + Vite + TypeScript
- **배포 플랫폼**: Vercel
- **배포 가이드**: [01_vercel_deployment.md](./01_vercel_deployment.md)
- **체크리스트**: [03_vercel_deployment_checklist.md](./03_vercel_deployment_checklist.md)

**특징:**
- 정적 사이트 생성 (SSG)
- CDN을 통한 빠른 로딩
- 자동 HTTPS
- CI/CD 자동 배포

---

### 2. 백엔드 (API 서버)

- **위치**: `backend/` 디렉토리
- **기술 스택**: FastAPI + Python + PostgreSQL + Redis
- **배포 플랫폼**: Railway, Render, AWS 등
- **배포 가이드**: 백엔드 호스팅 플랫폼 문서 참고

**특징:**
- RESTful API 제공
- 데이터베이스 연결
- Redis 캐싱
- CORS 설정 필요

**추천 호스팅:**
- **Railway** (가장 쉬움) - https://railway.app
- **Render** - https://render.com
- **AWS** (EC2/ECS/Lambda)
- **DigitalOcean** App Platform

---

### 3. 모바일 앱

- **위치**: `mobile/` 디렉토리
- **기술 스택**: React Native + Expo + WebView
- **배포 플랫폼**: Google Play Store, Apple App Store
- **배포 가이드**: [04_mobile_app_deployment.md](./04_mobile_app_deployment.md)

**특징:**
- WebView로 웹앱 표시
- 네이티브 앱처럼 동작
- 앱스토어 배포 필요
- EAS Build 사용

---

## 🔄 배포 순서

### 1단계: 백엔드 배포 (먼저!)

백엔드를 먼저 배포하고 URL을 확보해야 합니다.

```bash
# 백엔드 배포 (Railway 예시)
1. Railway에 프로젝트 생성
2. PostgreSQL 데이터베이스 추가
3. Redis 추가
4. 환경 변수 설정
5. 배포 및 URL 확보
```

**확보해야 할 정보:**
- 백엔드 API URL (예: `https://your-backend.railway.app`)
- 데이터베이스 연결 정보
- Redis 연결 정보

---

### 2단계: 프론트엔드 배포

백엔드 URL을 사용하여 프론트엔드를 배포합니다.

```bash
# Vercel 배포
1. Vercel 프로젝트 생성
2. Root Directory: frontend 설정
3. 환경 변수 설정:
   - VITE_API_BASE_URL=https://your-backend.railway.app/api/v1
   - VITE_CLERK_PUBLISHABLE_KEY=...
   - VITE_KAKAO_JAVASCRIPT_KEY=...
4. 배포
```

**확보해야 할 정보:**
- 프론트엔드 URL (예: `https://your-project.vercel.app`)

---

### 3단계: 백엔드 CORS 설정 업데이트

프론트엔드 URL을 백엔드 CORS 설정에 추가합니다.

```bash
# 백엔드 환경 변수 업데이트
ALLOWED_ORIGINS=https://your-project.vercel.app,https://your-project-*.vercel.app
```

---

### 4단계: 모바일 앱 배포

프론트엔드 URL을 사용하여 모바일 앱을 빌드하고 배포합니다.

```bash
# 모바일 앱 빌드
1. App.tsx에서 프로덕션 URL 설정
2. EAS Build로 빌드
3. 앱스토어 제출
```

---

## 🔗 컴포넌트 간 연결

### 프론트엔드 → 백엔드

```typescript
// frontend/src/lib/api.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
// 예: https://your-backend.railway.app/api/v1
```

**필요한 설정:**
- 백엔드 CORS에 프론트엔드 도메인 추가
- 환경 변수 `VITE_API_BASE_URL` 설정

---

### 모바일 앱 → 프론트엔드

```typescript
// mobile/App.tsx
const PRODUCTION_WEB_APP_URL = 'https://your-project.vercel.app';
```

**특징:**
- WebView로 프론트엔드 URL 로드
- 모바일 앱은 백엔드와 직접 통신하지 않음
- 프론트엔드를 통해 백엔드 API 호출

---

## 🌐 도메인 및 URL 관리

### 프로덕션 URL 예시

```
프론트엔드: https://homu.vercel.app
백엔드:     https://homu-api.railway.app
모바일 앱:  앱스토어에서 다운로드
```

### 환경 변수 요약

**프론트엔드 (Vercel):**
- `VITE_API_BASE_URL`: 백엔드 API URL
- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk 공개 키
- `VITE_KAKAO_JAVASCRIPT_KEY`: 카카오 API 키

**백엔드 (Railway 등):**
- `ALLOWED_ORIGINS`: 허용할 프론트엔드 도메인
- `DATABASE_URL`: PostgreSQL 연결 정보
- `REDIS_URL`: Redis 연결 정보
- 기타 API 키들

**모바일 앱 (EAS Build):**
- `EXPO_PUBLIC_WEB_APP_URL`: 프론트엔드 URL

---

## 🔒 보안 고려사항

### 1. HTTPS 사용

- 모든 프로덕션 URL은 HTTPS 사용
- Vercel은 자동 HTTPS 제공
- 백엔드 호스팅 플랫폼에서 HTTPS 설정

### 2. CORS 설정

- 백엔드에서 허용할 도메인만 명시
- 와일드카드 사용 시 주의 (`*` 사용 지양)

### 3. 환경 변수 관리

- 공개 키만 `VITE_` 접두사 사용
- 비밀 키는 절대 클라이언트에 노출하지 않음
- 각 플랫폼의 환경 변수 관리 기능 활용

---

## 📚 배포 가이드 링크

1. **프론트엔드 배포**: [01_vercel_deployment.md](./01_vercel_deployment.md)
2. **전체 배포 가이드**: [02_deployment_guide.md](./02_deployment_guide.md)
3. **Vercel 배포 체크리스트**: [03_vercel_deployment_checklist.md](./03_vercel_deployment_checklist.md)
4. **모바일 앱 배포**: [04_mobile_app_deployment.md](./04_mobile_app_deployment.md)

---

## ✅ 전체 배포 체크리스트

### 백엔드 배포

- [ ] 호스팅 플랫폼 선택 및 계정 생성
- [ ] PostgreSQL 데이터베이스 생성
- [ ] Redis 인스턴스 생성
- [ ] 환경 변수 설정
- [ ] 배포 및 URL 확보
- [ ] 헬스 체크 엔드포인트 확인

### 프론트엔드 배포

- [ ] Vercel 계정 생성
- [ ] GitHub 저장소 연결
- [ ] Root Directory 설정 (`frontend`)
- [ ] 환경 변수 설정
- [ ] 배포 및 URL 확보
- [ ] 웹앱 동작 확인

### CORS 설정

- [ ] 백엔드 `ALLOWED_ORIGINS`에 프론트엔드 도메인 추가
- [ ] 백엔드 서버 재시작
- [ ] CORS 동작 확인

### 모바일 앱 배포

- [ ] Expo 계정 생성
- [ ] EAS CLI 설치 및 로그인
- [ ] `App.tsx`에서 프로덕션 URL 설정
- [ ] 앱 아이콘 및 스플래시 스크린 준비
- [ ] Android 빌드 및 Google Play 제출
- [ ] iOS 빌드 및 App Store 제출

### 배포 후 확인

- [ ] 웹앱 접속 확인
- [ ] 모바일 앱 다운로드 및 실행 확인
- [ ] API 연결 확인
- [ ] 인증 기능 확인
- [ ] 주요 기능 동작 확인

---

**전체 배포 완료를 기원합니다! 🚀**
