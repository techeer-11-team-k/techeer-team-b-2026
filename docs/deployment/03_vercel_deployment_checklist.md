# Vercel 배포 체크리스트

## ✅ 배포 가능 여부

**결론: 현재 구조로 Vercel 배포 가능합니다!**

- ✅ 프론트엔드(`frontend/`)는 Vercel에 배포 가능
- ⚠️ 백엔드(`backend/`)는 별도 호스팅 필요

---

## 📋 배포 전 체크리스트

### 1. 백엔드 호스팅 준비

백엔드를 먼저 배포하고 URL을 확보해야 합니다.

**백엔드 호스팅 (현재 아키텍처 기준):**
- **AWS EC2** (FastAPI + 모니터링)
- **AWS RDS** (PostgreSQL)
- **AWS ElastiCache** (Redis)
- **S3** 정적 파일 (현재 미사용)

**백엔드 배포 후 확인:**
- [ ] 백엔드 API URL 확보 (예: `https://api.example.com`) 
- [ ] 헬스 체크 엔드포인트 동작 확인 (`/health` 또는 `/api/v1/health`) 
- [ ] CORS 설정 확인 (아래 2번 항목 참고) 

---

### 2. 백엔드 CORS 설정 업데이트

**중요:** Vercel 배포 전에 백엔드 CORS 설정을 업데이트해야 합니다!

#### 현재 설정 위치
- 파일: `backend/app/core/config.py`
- 환경 변수: `ALLOWED_ORIGINS`

#### 업데이트 방법

**방법 A: 환경 변수로 설정 (권장)**

백엔드 호스팅 플랫폼의 환경 변수에 추가:

```bash
ALLOWED_ORIGINS=https://your-project.vercel.app,https://your-project-git-main.vercel.app,https://your-project-*.vercel.app
```

**주의사항:**
- Vercel은 여러 도메인을 생성합니다:
  - 프로덕션: `https://your-project.vercel.app`
  - 프리뷰: `https://your-project-git-branch.vercel.app`
  - 모든 프리뷰를 허용하려면 와일드카드 사용: `https://your-project-*.vercel.app`

**방법 B: .env 파일 수정**

로컬 개발용 `.env` 파일에 추가:

```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8081,https://your-project.vercel.app,https://your-project-*.vercel.app
```

---

### 3. Vercel 배포 설정

#### 3-1. 프로젝트 설정

Vercel 대시보드에서:
- [ ] **Root Directory**: `frontend` 설정
- [ ] **Framework Preset**: `Vite` 선택
- [ ] **Build Command**: `npm run build` (자동 감지됨)
- [ ] **Output Directory**: `build` (자동 감지됨)
- [ ] **Install Command**: `npm install` (자동 감지됨)

#### 3-2. 환경 변수 설정

Vercel 대시보드 → Settings → Environment Variables에서 추가:

```bash
# 필수 환경 변수
VITE_API_BASE_URL=https://api.example.com/api/v1
VITE_CLERK_PUBLISHABLE_KEY=pk_live_... (또는 pk_test_...)
VITE_KAKAO_JAVASCRIPT_KEY=your_kakao_api_key

# 선택적 환경 변수 (필요한 경우)
VITE_ENVIRONMENT=production
```

**환경별 설정:**
- Production: 프로덕션 값
- Preview: 개발/테스트 값
- Development: 로컬 개발 값

---

### 4. 카카오 개발자 콘솔 설정

카카오 지도 API를 사용하는 경우:

- [ ] 카카오 개발자 콘솔 접속
- [ ] 애플리케이션 → 플랫폼 → Web 플랫폼 추가
- [ ] 사이트 도메인 등록:
  - `https://your-project.vercel.app`
  - `https://your-project-*.vercel.app` (프리뷰용)

---

### 5. Clerk 설정

Clerk 인증을 사용하는 경우:

- [ ] Clerk Dashboard 접속
- [ ] 애플리케이션 설정 → Domains
- [ ] 허용된 도메인 추가:
  - `https://your-project.vercel.app`
  - `https://your-project-*.vercel.app` (프리뷰용)

---

### 6. 배포 후 확인사항

#### 6-1. 프론트엔드 확인

- [ ] Vercel 배포 성공 확인
- [ ] 배포된 URL 접속 가능 확인
- [ ] 브라우저 콘솔 에러 확인 (F12 → Console)
- [ ] 환경 변수 로드 확인:
  ```javascript
  // 브라우저 콘솔에서 실행
  console.log(import.meta.env.VITE_API_BASE_URL);
  console.log(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  ```

#### 6-2. API 연결 확인

- [ ] 네트워크 탭에서 API 호출 확인 (F12 → Network)
- [ ] CORS 에러 없는지 확인
- [ ] API 응답 정상 확인

#### 6-3. 기능 테스트

- [ ] 로그인/회원가입 동작 확인
- [ ] 카카오 지도 로드 확인
- [ ] 주요 기능 동작 확인

---

## 🚨 문제 해결

### CORS 에러 발생 시

**증상:**
```
Access to fetch at 'https://your-backend.com/api/v1/...' from origin 'https://your-project.vercel.app' has been blocked by CORS policy
```

**해결 방법:**
1. 백엔드 `ALLOWED_ORIGINS`에 Vercel 도메인 추가 확인
2. 백엔드 서버 재시작
3. 브라우저 캐시 삭제 후 재시도

### 환경 변수가 로드되지 않는 경우

**증상:**
- `import.meta.env.VITE_*` 값이 `undefined`

**해결 방법:**
1. Vercel 대시보드에서 환경 변수 이름 확인 (대소문자 정확히 일치)
2. `VITE_` 접두사 확인
3. 환경 변수 추가/수정 후 재배포

### API 연결 실패

**증상:**
- 네트워크 탭에서 404 또는 500 에러

**해결 방법:**
1. `VITE_API_BASE_URL` 값 확인
2. 백엔드 헬스 체크 엔드포인트 직접 접속 테스트
3. 백엔드 로그 확인

---

## 📚 참고 문서

- [Vercel 배포 가이드](./01_vercel_deployment.md)
- [전체 배포 가이드](./02_deployment_guide.md)
- [백엔드 환경 변수 설정](../backend/environment_variables.md)

---

## ✅ 최종 확인

배포 전에 다음을 모두 확인하세요:

- [ ] 백엔드 호스팅 완료 및 URL 확보
- [ ] 백엔드 CORS 설정에 Vercel 도메인 추가
- [ ] Vercel 프로젝트 생성 및 Root Directory 설정
- [ ] Vercel 환경 변수 설정 완료
- [ ] 카카오 개발자 콘솔 도메인 등록
- [ ] Clerk Dashboard 도메인 등록
- [ ] 배포 후 기능 테스트 완료

---

**배포 성공을 기원합니다! 🚀**
