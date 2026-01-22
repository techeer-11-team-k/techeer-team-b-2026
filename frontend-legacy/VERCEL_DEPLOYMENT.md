# Vercel 배포 가이드

이 가이드는 프론트엔드(`frontend/`) 디렉토리만 Vercel에 배포하는 방법을 설명합니다.

## 📋 사전 준비사항

1. **Vercel 계정**: [vercel.com](https://vercel.com)에서 계정 생성
2. **GitHub 저장소**: 프로젝트가 GitHub에 푸시되어 있어야 함
3. **환경 변수 목록**: 필요한 환경 변수 확인

## 🔧 필요한 환경 변수

프로젝트에서 사용하는 환경 변수들:

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk 인증용 Publishable Key
- `VITE_KAKAO_JAVASCRIPT_KEY`: 카카오 지도 API 키
- `VITE_API_BASE_URL`: 백엔드 API 기본 URL (예: `https://your-backend-api.com/api/v1`)

## 📝 배포 단계

### 방법 1: Vercel 웹 대시보드 사용 (권장)

#### 1단계: Vercel 프로젝트 생성

1. [Vercel 대시보드](https://vercel.com/dashboard)에 로그인
2. **"Add New..."** → **"Project"** 클릭
3. GitHub 저장소 선택 또는 연결
4. 프로젝트 설정:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend` (중요!)
   - **Build Command**: `npm run build` (또는 `cd frontend && npm run build`)
   - **Output Directory**: `build` (vite.config.ts에서 `outDir: 'build'`로 설정됨)
   - **Install Command**: `npm install`

#### 2단계: 환경 변수 설정

Vercel 대시보드에서:
1. 프로젝트 설정 → **"Environment Variables"** 탭
2. 다음 환경 변수 추가:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_... (또는 pk_live_...)
VITE_KAKAO_JAVASCRIPT_KEY=your_kakao_api_key
VITE_API_BASE_URL=https://your-backend-api.com/api/v1
```

각 환경(Production, Preview, Development)에 대해 설정 가능

> ⚠️ **경고 메시지에 대해**: 
> Vercel에서 `VITE_` 접두사와 `KEY`가 포함된 환경 변수를 추가할 때 보안 경고가 나타날 수 있습니다.
> 하지만 이 프로젝트에서 사용하는 키들은 모두 **공개 키(Public Key)**이므로 클라이언트에 노출되어도 안전합니다:
> - `VITE_CLERK_PUBLISHABLE_KEY`: Clerk의 Publishable Key는 이름 그대로 공개되어도 안전한 키입니다
> - `VITE_KAKAO_JAVASCRIPT_KEY`: 카카오 JavaScript API 키는 웹에서 사용하는 공개 키입니다
> 
> 이 경고는 무시하고 계속 진행하셔도 됩니다. 만약 정말 민감한 Secret Key가 있다면 `VITE_` 접두사를 사용하지 말고 서버 사이드에서만 사용해야 합니다.

#### 3단계: 배포 실행

1. **"Deploy"** 버튼 클릭
2. 빌드 로그 확인
3. 배포 완료 후 제공되는 URL로 접속

### 방법 2: Vercel CLI 사용

#### 1단계: Vercel CLI 설치

```bash
npm install -g vercel
```

#### 2단계: Vercel 로그인

```bash
vercel login
```

#### 3단계: 프로젝트 디렉토리로 이동

```bash
cd frontend
```

#### 4단계: Vercel 프로젝트 초기화

```bash
vercel
```

초기 설정 질문에 답변:
- **Set up and deploy?** → `Y`
- **Which scope?** → 본인 계정 선택
- **Link to existing project?** → `N` (처음 배포 시)
- **What's your project's name?** → 프로젝트 이름 입력
- **In which directory is your code located?** → `./` (frontend 디렉토리에서 실행 중이므로)
- **Want to override the settings?** → `N` (기본값 사용)

#### 5단계: 환경 변수 설정

```bash
vercel env add VITE_CLERK_PUBLISHABLE_KEY
vercel env add VITE_KAKAO_JAVASCRIPT_KEY
vercel env add VITE_API_BASE_URL
```

각 환경 변수에 대해:
- **Value**: 실제 값 입력
- **Environment**: Production, Preview, Development 선택 (또는 모두)

#### 6단계: 프로덕션 배포

```bash
vercel --prod
```

## ⚙️ Vercel 설정 파일 (vercel.json)

프로젝트 루트에 `vercel.json` 파일을 생성하여 추가 설정 가능:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

이 파일을 `frontend/` 디렉토리에 생성하면 Vercel이 자동으로 인식합니다.

## 🔍 빌드 설정 확인

### vite.config.ts 확인

현재 설정:
- **Output Directory**: `build`
- **Build Target**: `esnext`

Vercel은 자동으로 `vite build` 명령을 실행하고 `build` 디렉토리를 배포합니다.

## 🚀 배포 후 확인사항

1. **환경 변수 확인**
   - 브라우저 개발자 도구 → Console에서 확인
   - `import.meta.env.VITE_*` 값들이 올바르게 로드되는지 확인

2. **API 연결 확인**
   - 백엔드 API가 CORS 설정되어 있는지 확인
   - `VITE_API_BASE_URL`이 올바른 백엔드 URL을 가리키는지 확인

3. **카카오 지도 확인**
   - 카카오 지도가 정상적으로 로드되는지 확인
   - 카카오 개발자 콘솔에서 도메인 등록 확인

## 🔄 지속적 배포 (CI/CD)

GitHub 저장소와 연결하면:
- `main` 브랜치에 푸시 → Production 배포
- 다른 브랜치에 푸시 → Preview 배포

## 📌 주의사항

1. **Root Directory 설정**
   - Vercel 대시보드에서 Root Directory를 `frontend`로 설정해야 함
   - 그렇지 않으면 프로젝트 루트에서 빌드를 시도하여 실패할 수 있음

2. **환경 변수 접두사**
   - Vite는 `VITE_` 접두사가 있는 환경 변수만 클라이언트에 노출
   - 모든 환경 변수는 `VITE_`로 시작해야 함
   - ⚠️ **보안 주의**: `VITE_` 접두사가 있는 환경 변수는 빌드 시 클라이언트 번들에 포함되어 브라우저에서 볼 수 있습니다
   - 따라서 **공개되어도 안전한 키만** `VITE_` 접두사를 사용하세요:
     - ✅ `VITE_CLERK_PUBLISHABLE_KEY`: 공개 키 (안전)
     - ✅ `VITE_KAKAO_JAVASCRIPT_KEY`: 공개 키 (안전)
     - ❌ `CLERK_SECRET_KEY`: 비밀 키 (절대 `VITE_` 접두사 사용 금지!)

3. **빌드 출력 디렉토리**
   - `vite.config.ts`에서 `outDir: 'build'`로 설정되어 있음
   - Vercel의 Output Directory도 `build`로 설정해야 함

4. **백엔드 CORS 설정**
   - Vercel에 배포된 프론트엔드 도메인을 백엔드 CORS 설정에 추가해야 함
   - 예: `https://your-project.vercel.app`

## 🐛 문제 해결

### 빌드 실패 시

1. **로컬에서 빌드 테스트**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **빌드 로그 확인**
   - Vercel 대시보드의 Deployment 로그 확인
   - 에러 메시지 확인

3. **환경 변수 확인**
   - 모든 `VITE_*` 환경 변수가 설정되어 있는지 확인

### 환경 변수가 로드되지 않는 경우

1. **환경 변수 이름 확인**
   - `VITE_` 접두사가 있는지 확인
   - 대소문자 정확히 일치하는지 확인

2. **재배포**
   - 환경 변수 추가/수정 후 재배포 필요

### API 연결 오류

1. **CORS 확인**
   - 백엔드에서 Vercel 도메인 허용 확인
   - `Access-Control-Allow-Origin` 헤더 확인

2. **API URL 확인**
   - `VITE_API_BASE_URL`이 올바른지 확인
   - HTTPS 사용 권장

## 🔒 환경 변수 보안 가이드

### 공개 키 vs 비밀 키

#### ✅ 공개 키 (클라이언트 노출 가능)
다음 키들은 `VITE_` 접두사를 사용하여 클라이언트에 노출되어도 안전합니다:

- **`VITE_CLERK_PUBLISHABLE_KEY`**
  - Clerk의 Publishable Key는 이름 그대로 공개되어도 안전합니다
  - 프론트엔드에서 인증을 위해 반드시 필요합니다
  - Vercel 경고가 나타나도 무시하고 진행하세요

- **`VITE_KAKAO_JAVASCRIPT_KEY`**
  - 카카오 JavaScript API 키는 웹에서 사용하는 공개 키입니다
  - 카카오 개발자 콘솔에서 도메인 제한을 설정하여 보안을 강화할 수 있습니다

#### ❌ 비밀 키 (절대 노출 금지)
다음 키들은 절대 `VITE_` 접두사를 사용하지 마세요:

- `CLERK_SECRET_KEY`: 백엔드에서만 사용
- `DATABASE_URL`: 백엔드에서만 사용
- `REDIS_URL`: 백엔드에서만 사용
- 기타 API Secret Key들

### Vercel 경고 메시지 처리

Vercel에서 다음과 같은 경고가 나타날 수 있습니다:

> "This key, which is prefixed with VITE_ and includes the term KEY, might expose sensitive information to the browser."

**이 경고는 무시해도 됩니다** 왜냐하면:
1. `VITE_CLERK_PUBLISHABLE_KEY`는 공개 키입니다
2. `VITE_KAKAO_JAVASCRIPT_KEY`는 공개 키입니다
3. 이 키들은 의도적으로 클라이언트에서 사용됩니다

### 보안 모범 사례

1. **도메인 제한 설정**
   - 카카오 개발자 콘솔에서 허용된 도메인만 설정
   - Clerk Dashboard에서 허용된 도메인 설정

2. **API 키 사용량 모니터링**
   - 카카오 개발자 콘솔에서 API 사용량 확인
   - Clerk Dashboard에서 사용량 확인

3. **환경별 키 분리**
   - Production: `pk_live_...` (프로덕션 키)
   - Development: `pk_test_...` (테스트 키)

## 📚 추가 리소스

- [Vercel 공식 문서](https://vercel.com/docs)
- [Vite 배포 가이드](https://vitejs.dev/guide/static-deploy.html#vercel)
- [Vercel 환경 변수 설정](https://vercel.com/docs/concepts/projects/environment-variables)
- [Clerk 보안 가이드](https://clerk.com/docs/security/overview)
- [카카오 API 보안 가이드](https://developers.kakao.com/docs/latest/ko/getting-started/app-key)