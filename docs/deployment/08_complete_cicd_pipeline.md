# 전체 CI/CD 파이프라인 통합 가이드

프론트엔드(Vercel), 백엔드(AWS), 모바일 앱(Expo)의 CI/CD를 통합하여 자동화된 배포 파이프라인을 구축합니다.

## 🎯 전체 워크플로우 개요

```
개발자가 코드 푸시
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│                  GitHub Repository                        │
│                  (Single Source of Truth)                 │
└──────┬─────────────────┬─────────────────┬───────────────┘
       │                 │                 │
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Frontend     │  │ Backend      │  │ Mobile       │
│ CI/CD        │  │ CI/CD        │  │ CI/CD        │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ GitHub       │  │ GitHub       │  │ GitHub       │
│ Actions      │  │ Actions      │  │ Actions      │
│ ↓            │  │ ↓            │  │ ↓            │
│ Vercel       │  │ AWS ECR/ECS  │  │ EAS Build    │
│ (자동 배포)   │  │ (자동 배포)   │  │ (수동/태그)  │
└──────────────┘  └──────────────┘  └──────────────┘
       │                 │                 │
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Production   │  │ Production   │  │ App Stores   │
│ (Vercel)     │  │ (AWS)        │  │ (iOS/Android)│
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 📋 브랜치 전략

### Git Flow 기반 브랜치 전략

```
main (프로덕션)
  ├── dev (개발)
  │    ├── feature/login (기능 개발)
  │    ├── feature/map (기능 개발)
  │    └── bugfix/api-error (버그 수정)
  └── hotfix/critical-bug (긴급 수정)
```

### 브랜치별 배포 전략

| 브랜치 | 배포 환경 | 트리거 | 설명 |
|--------|----------|--------|------|
| `feature/*` | CI만 | PR 생성 | 테스트만 실행, 배포 안 함 |
| `dev` | Staging | PR 병합 | 개발 환경에 자동 배포 |
| `main` | Production | PR 병합 | 프로덕션 자동 배포 |
| `v*.*.*` (태그) | Production | 태그 생성 | 모바일 앱 빌드 |

---

## 🔄 CI/CD 파이프라인 상세 흐름

### 1. 기능 개발 단계

```
개발자: feature 브랜치 생성
   ↓
코드 작성 및 커밋
   ↓
GitHub에 푸시
   ↓
🤖 GitHub Actions 자동 실행
   ├─ 프론트엔드 CI (frontend/ 변경 시)
   │  ├─ ESLint 검사
   │  ├─ TypeScript 타입 체크
   │  ├─ 빌드 테스트
   │  └─ ✅ 결과 PR에 표시
   │
   ├─ 백엔드 CI (backend/ 변경 시)
   │  ├─ Flake8 린트
   │  ├─ 단위 테스트
   │  ├─ Docker 빌드 테스트
   │  └─ ✅ 결과 PR에 표시
   │
   └─ 모바일 CI (mobile/ 변경 시)
      ├─ TypeScript 타입 체크
      ├─ ESLint 검사
      └─ ✅ 결과 PR에 표시
```

### 2. 코드 리뷰 및 병합

```
PR 생성
   ↓
코드 리뷰
   ↓
모든 CI 체크 통과 확인
   ↓
dev 브랜치로 병합
   ↓
🤖 Staging 환경 자동 배포
   ├─ 프론트엔드 → Vercel Preview
   ├─ 백엔드 → AWS Staging
   └─ 모바일 → 배포 안 함 (비용 고려)
```

### 3. 프로덕션 배포

```
dev → main PR 생성
   ↓
최종 검토
   ↓
main 브랜치로 병합
   ↓
🤖 프로덕션 자동 배포
   ├─ 프론트엔드 → Vercel Production
   ├─ 백엔드 → AWS Production
   └─ 📧 Slack 알림
```

### 4. 모바일 앱 릴리스

```
릴리스 준비 완료
   ↓
Git 태그 생성 (v1.0.0)
   ↓
GitHub에 푸시
   ↓
🤖 EAS Build 자동 실행
   ├─ Android 빌드
   ├─ iOS 빌드
   └─ 📧 빌드 완료 알림
   ↓
수동으로 앱스토어 제출
```

---

## 📂 워크플로우 파일 구조

```
.github/
└── workflows/
    ├── frontend-ci.yml          # 프론트엔드 CI
    ├── frontend-cd-staging.yml  # Staging 배포 (선택)
    ├── backend-ci.yml           # 백엔드 CI
    ├── backend-cd-staging.yml   # Staging 배포
    ├── backend-cd-production.yml # Production 배포
    ├── mobile-ci.yml            # 모바일 CI
    ├── mobile-cd.yml            # 모바일 빌드 (태그 트리거)
    └── notify-slack.yml         # 공통 알림 (재사용)
```

---

## 🔧 통합 워크플로우 예시

### 모노레포 전체 CI

`.github/workflows/monorepo-ci.yml`:

```yaml
name: Monorepo CI

on:
  pull_request:
    branches: [main, dev]

jobs:
  # 변경된 파일 감지
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
      backend: ${{ steps.filter.outputs.backend }}
      mobile: ${{ steps.filter.outputs.mobile }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v2
        id: filter
        with:
          filters: |
            frontend:
              - 'frontend/**'
            backend:
              - 'backend/**'
            mobile:
              - 'mobile/**'
  
  # 프론트엔드 CI
  frontend-ci:
    needs: detect-changes
    if: needs.detect-changes.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: './frontend/package-lock.json'
      - run: npm ci
      - run: npm run build
        env:
          VITE_API_BASE_URL: https://api.example.com
          VITE_CLERK_PUBLISHABLE_KEY: pk_test_dummy
          VITE_KAKAO_JAVASCRIPT_KEY: dummy
  
  # 백엔드 CI
  backend-ci:
    needs: detect-changes
    if: needs.detect-changes.outputs.backend == 'true'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./backend
    services:
      postgres:
        image: postgis/postgis:15-3.3
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r requirements.txt
      - run: pytest tests/ -v || echo "No tests found"
        env:
          DATABASE_URL: postgresql+asyncpg://test:test@localhost:5432/test
  
  # 모바일 CI
  mobile-ci:
    needs: detect-changes
    if: needs.detect-changes.outputs.mobile == 'true'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./mobile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: './mobile/package-lock.json'
      - run: npm ci
      - run: npx tsc --noEmit
```

---

## 🚀 Production 배포 워크플로우

`.github/workflows/deploy-production.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  # 변경 감지
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
      backend: ${{ steps.filter.outputs.backend }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v2
        id: filter
        with:
          filters: |
            frontend:
              - 'frontend/**'
            backend:
              - 'backend/**'
  
  # 백엔드 배포
  deploy-backend:
    needs: detect-changes
    if: needs.detect-changes.outputs.backend == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: AWS 자격 증명
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2
      
      - name: ECR 로그인
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Docker 빌드 및 푸시
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          ECR_REPOSITORY: homu-backend
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:latest ./backend
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
      
      - name: ECS 서비스 업데이트
        run: |
          aws ecs update-service \
            --cluster homu-cluster \
            --service homu-backend-service \
            --force-new-deployment
      
      - name: 배포 완료 대기
        run: |
          aws ecs wait services-stable \
            --cluster homu-cluster \
            --services homu-backend-service
  
  # 배포 알림
  notify:
    needs: [deploy-backend]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Slack 알림
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: |
            🚀 Production 배포 ${{ job.status }}
            백엔드: ${{ needs.deploy-backend.result }}
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## 📱 모바일 앱 릴리스 워크플로우

`.github/workflows/mobile-release.yml`:

```yaml
name: Mobile App Release

on:
  push:
    tags:
      - 'v*.*.*'  # v1.0.0, v2.1.0 등

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Expo CLI 설치
        run: npm install -g eas-cli
      
      - name: 의존성 설치
        working-directory: ./mobile
        run: npm ci
      
      - name: EAS Build (Android)
        working-directory: ./mobile
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          EXPO_PUBLIC_WEB_APP_URL: ${{ secrets.PRODUCTION_WEB_URL }}
        run: |
          eas build --platform android --profile production --non-interactive
      
      - name: EAS Build (iOS)
        working-directory: ./mobile
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          EXPO_PUBLIC_WEB_APP_URL: ${{ secrets.PRODUCTION_WEB_URL }}
        run: |
          eas build --platform ios --profile production --non-interactive
      
      - name: GitHub Release 생성
        uses: softprops/action-gh-release@v1
        with:
          tag_name: ${{ github.ref_name }}
          name: Release ${{ github.ref_name }}
          body: |
            ## 🎉 새로운 버전 릴리스
            
            버전: ${{ github.ref_name }}
            
            ### 변경사항
            - 자동 생성된 릴리스
            
            ### 다운로드
            - Android: EAS 대시보드 확인
            - iOS: TestFlight 또는 App Store
```

---

## 🔐 필요한 GitHub Secrets

### 공통
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### 백엔드 (AWS)
```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-2
```

### 프론트엔드 (Vercel)
```
# Vercel이 자동으로 처리하므로 추가 Secret 불필요
# Vercel 대시보드에서 GitHub 연동만 하면 됨
```

### 모바일 앱 (Expo)
```
EXPO_TOKEN=...
PRODUCTION_WEB_URL=https://your-project.vercel.app
```

---

## 📊 배포 모니터링

### 1. GitHub Actions 대시보드

- 저장소 → Actions 탭
- 각 워크플로우 실행 상태 확인
- 실패 시 로그 확인

### 2. Vercel 대시보드

- 프론트엔드 배포 상태
- Preview URL 확인
- 빌드 로그

### 3. AWS CloudWatch

- ECS 서비스 상태
- 애플리케이션 로그
- 성능 메트릭

### 4. Slack 알림

- 배포 성공/실패 알림
- 빌드 시간 리포트
- 에러 알림

---

## 🎯 배포 시나리오 예시

### 시나리오 1: 새 기능 개발 및 배포

```
1. feature/new-feature 브랜치 생성
   └─ GitHub Actions: CI 실행 (린트, 테스트)

2. 코드 작성 및 푸시
   └─ 각 푸시마다 CI 자동 실행

3. dev 브랜치로 PR 생성
   └─ CI 체크 통과 확인

4. dev 브랜치로 병합
   └─ Staging 환경에 자동 배포
   └─ QA 팀 테스트

5. main 브랜치로 PR 생성
   └─ 최종 검토

6. main 브랜치로 병합
   └─ Production 자동 배포
   └─ Slack 알림

⏰ 소요 시간: 10-15분 (자동화)
```

### 시나리오 2: 긴급 버그 수정 (Hotfix)

```
1. main에서 hotfix/critical-bug 브랜치 생성
   └─ 버그 수정

2. main으로 직접 PR 생성
   └─ CI 체크 통과

3. 즉시 병합
   └─ Production 자동 배포 (5분)
   └─ Slack 알림

4. dev 브랜치로도 병합
   └─ 동기화 유지

⏰ 소요 시간: 5-10분 (긴급)
```

---

## 🐛 문제 해결

### 문제 1: CI 체크 실패

**해결:**
1. Actions 탭에서 로그 확인
2. 로컬에서 동일한 명령어 실행
3. 문제 수정 후 재푸시

### 문제 2: 배포 실패

**백엔드 (AWS):**
- CloudWatch 로그 확인
- ECS Task 상태 확인
- 환경 변수 확인

**프론트엔드 (Vercel):**
- Vercel 빌드 로그 확인
- 환경 변수 확인

### 문제 3: 모바일 앱 빌드 실패

- EAS 빌드 로그 확인
- `eas.json` 설정 확인
- Expo 토큰 유효성 확인

---

## 💡 모범 사례

### 1. 작은 단위로 자주 배포
```
큰 변경보다 작은 변경을 자주
→ 문제 발생 시 빠른 롤백
```

### 2. Feature Flags 사용
```
기능을 코드로 배포하되, 플래그로 활성화
→ 안전한 배포
```

### 3. 자동화된 롤백
```
배포 실패 시 이전 버전으로 자동 롤백
→ 다운타임 최소화
```

### 4. 모니터링 및 알림
```
모든 배포에 Slack 알림
→ 팀 전체가 배포 상태 파악
```

---

**이제 CI/CD 파이프라인이 완성되었습니다! 🎉**

다음 문서: [시각적 예시 웹사이트](./example/index.html)에서 전체 흐름을 인터랙티브하게 확인하세요!
