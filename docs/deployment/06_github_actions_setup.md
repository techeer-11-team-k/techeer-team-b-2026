# GitHub Actions 설정 가이드

프로젝트(앱: Expo+RN, 웹: React+Vercel, 백엔드: AWS)에 GitHub Actions를 설정하는 방법을 단계별로 설명합니다.

## 📁 프로젝트 구조와 CI/CD 전략

```
techeer-team-b-2026/
├── .github/
│   └── workflows/              # GitHub Actions 워크플로우
│       ├── frontend-ci.yml     # 프론트엔드 CI
│       ├── frontend-cd.yml     # 프론트엔드 CD (Vercel)
│       ├── backend-ci.yml      # 백엔드 CI
│       ├── backend-cd.yml      # 백엔드 CD (AWS)
│       └── mobile-ci.yml       # 모바일 앱 CI
├── frontend/                   # React + Vite
├── backend/                    # FastAPI
└── mobile/                     # Expo + React Native
```

---

## 🎯 CI/CD 전략 개요

### 1. 프론트엔드 (React + Vercel)

**CI (Continuous Integration):**
- Pull Request 생성 시
- `frontend/` 폴더 변경 감지
- 린트 검사 + 빌드 테스트

**CD (Continuous Deployment):**
- Vercel이 자동으로 처리
- GitHub 연동 시 자동 배포
- Preview URL 자동 생성

---

### 2. 백엔드 (FastAPI + AWS)

**CI (Continuous Integration):**
- Pull Request 생성 시
- `backend/` 폴더 변경 감지
- 린트 + 단위 테스트 + 빌드

**CD (Continuous Deployment):**
- main 브랜치 병합 시
- Docker 이미지 빌드
- AWS ECR에 푸시
- AWS ECS/EC2에 배포

---

### 3. 모바일 앱 (Expo + React Native)

**CI (Continuous Integration):**
- Pull Request 생성 시
- `mobile/` 폴더 변경 감지
- 린트 검사

**CD (Continuous Deployment):**
- 태그 생성 시 (`v1.0.0`)
- EAS Build 트리거
- 자동 앱스토어 제출 (선택)

---

## 🚀 1단계: GitHub Actions 활성화

### 1-1. 저장소 설정 확인

GitHub 저장소에서:
1. **Settings** → **Actions** → **General**
2. **Actions permissions** 확인
   - ✅ "Allow all actions and reusable workflows" 선택

### 1-2. 워크플로우 폴더 생성

```bash
# 프로젝트 루트에서
mkdir -p .github/workflows
```

---

## 📝 2단계: 프론트엔드 CI/CD 설정

### 2-1. 프론트엔드 CI 워크플로우

`.github/workflows/frontend-ci.yml` 파일 생성:

```yaml
name: Frontend CI

# 트리거: PR 생성/업데이트 시, frontend 폴더 변경 시만
on:
  pull_request:
    branches: [main, dev]
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-ci.yml'

# 동일한 PR에 새 푸시 시 이전 실행 취소
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-build:
    name: 린트 및 빌드 테스트
    runs-on: ubuntu-latest
    
    # 작업 디렉토리 설정
    defaults:
      run:
        working-directory: ./frontend
    
    steps:
      # 1. 코드 체크아웃
      - name: 코드 체크아웃
        uses: actions/checkout@v4
      
      # 2. Node.js 설정
      - name: Node.js 설정
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: './frontend/package-lock.json'
      
      # 3. 의존성 설치
      - name: 의존성 설치
        run: npm ci
      
      # 4. 린트 검사 (선택사항)
      - name: 린트 검사
        run: |
          if grep -q '"lint"' package.json; then
            npm run lint
          else
            echo "린트 스크립트가 없습니다. 건너뜁니다."
          fi
        continue-on-error: true
      
      # 5. 빌드 테스트
      - name: 빌드 테스트
        run: npm run build
        env:
          # 환경 변수 (더미 값 사용)
          VITE_API_BASE_URL: https://api.example.com
          VITE_CLERK_PUBLISHABLE_KEY: pk_test_dummy
          VITE_KAKAO_JAVASCRIPT_KEY: dummy_key
      
      # 6. 빌드 결과 업로드 (선택사항)
      - name: 빌드 결과 업로드
        uses: actions/upload-artifact@v4
        with:
          name: frontend-build
          path: frontend/build/
          retention-days: 7
```

### 2-2. Vercel 자동 배포 (이미 설정됨)

Vercel은 GitHub 연동 시 자동으로 CI/CD를 제공합니다:

**Vercel이 자동으로 하는 일:**
- Pull Request마다 Preview URL 생성
- main 브랜치 병합 시 Production 배포
- 배포 상태를 GitHub PR에 표시

**추가 설정 불필요!** Vercel 대시보드에서 GitHub 저장소 연결만 하면 됩니다.

---

## 🔧 3단계: 백엔드 CI/CD 설정

### 3-1. 백엔드 CI 워크플로우

`.github/workflows/backend-ci.yml` 파일 생성:

```yaml
name: Backend CI

on:
  pull_request:
    branches: [main, dev]
    paths:
      - 'backend/**'
      - '.github/workflows/backend-ci.yml'

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-test:
    name: 린트 및 테스트
    runs-on: ubuntu-latest
    
    # 서비스 컨테이너: 테스트용 PostgreSQL
    services:
      postgres:
        image: postgis/postgis:15-3.3
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    defaults:
      run:
        working-directory: ./backend
    
    steps:
      - name: 코드 체크아웃
        uses: actions/checkout@v4
      
      - name: Python 설정
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
          cache-dependency-path: './backend/requirements.txt'
      
      - name: 의존성 설치
        run: |
          pip install --upgrade pip
          pip install -r requirements.txt
      
      - name: 린트 검사 (flake8)
        run: |
          pip install flake8
          flake8 app --count --select=E9,F63,F7,F82 --show-source --statistics
        continue-on-error: true
      
      - name: 단위 테스트 실행
        env:
          DATABASE_URL: postgresql+asyncpg://test_user:test_password@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379/0
          SECRET_KEY: test_secret_key_for_ci
        run: |
          if [ -d "tests" ]; then
            pip install pytest pytest-asyncio
            pytest tests/ -v
          else
            echo "테스트 폴더가 없습니다. 건너뜁니다."
          fi
        continue-on-error: true
      
      - name: Docker 이미지 빌드 테스트
        run: |
          cd ..
          docker build -t backend-test:latest ./backend
```

### 3-2. 백엔드 CD 워크플로우 (AWS 배포)

`.github/workflows/backend-cd.yml` 파일 생성:

```yaml
name: Backend CD (AWS)

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - '.github/workflows/backend-cd.yml'

jobs:
  deploy:
    name: AWS 배포
    runs-on: ubuntu-latest
    
    steps:
      - name: 코드 체크아웃
        uses: actions/checkout@v4
      
      # AWS 자격 증명 설정
      - name: AWS 자격 증명 구성
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2  # 서울 리전
      
      # Docker 이미지 빌드
      - name: Docker 이미지 빌드
        working-directory: ./backend
        run: |
          docker build -t homu-backend:${{ github.sha }} .
          docker tag homu-backend:${{ github.sha }} homu-backend:latest
      
      # ECR 로그인
      - name: ECR 로그인
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2
      
      # ECR에 이미지 푸시
      - name: ECR에 이미지 푸시
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          ECR_REPOSITORY: homu-backend
        run: |
          docker tag homu-backend:latest $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker tag homu-backend:${{ github.sha }} $ECR_REGISTRY/$ECR_REPOSITORY:${{ github.sha }}
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:${{ github.sha }}
      
      # ECS 서비스 업데이트 (옵션 1)
      - name: ECS 서비스 업데이트
        run: |
          aws ecs update-service \
            --cluster homu-cluster \
            --service homu-backend-service \
            --force-new-deployment
      
      # 또는 EC2에 배포 (옵션 2)
      # - name: EC2에 배포
      #   uses: appleboy/ssh-action@master
      #   with:
      #     host: ${{ secrets.EC2_HOST }}
      #     username: ubuntu
      #     key: ${{ secrets.EC2_SSH_KEY }}
      #     script: |
      #       cd /home/ubuntu/app
      #       docker-compose pull
      #       docker-compose up -d
      
      # Slack 알림
      - name: Slack 알림
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: '백엔드 배포 ${{ job.status }}'
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## 📱 4단계: 모바일 앱 CI 설정

`.github/workflows/mobile-ci.yml` 파일 생성:

```yaml
name: Mobile CI

on:
  pull_request:
    branches: [main, dev]
    paths:
      - 'mobile/**'
      - '.github/workflows/mobile-ci.yml'

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: 린트 검사
    runs-on: ubuntu-latest
    
    defaults:
      run:
        working-directory: ./mobile
    
    steps:
      - name: 코드 체크아웃
        uses: actions/checkout@v4
      
      - name: Node.js 설정
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: './mobile/package-lock.json'
      
      - name: 의존성 설치
        run: npm ci
      
      - name: TypeScript 타입 체크
        run: npx tsc --noEmit
        continue-on-error: true
      
      - name: 린트 검사
        run: |
          if grep -q '"lint"' package.json; then
            npm run lint
          else
            echo "린트 스크립트가 없습니다. 건너뜁니다."
          fi
        continue-on-error: true

  # EAS Build는 수동 또는 태그 생성 시에만 실행 (비용 고려)
  # 별도 워크플로우로 관리 권장
```

**모바일 앱 CD (EAS Build):**

EAS Build는 비용이 발생하므로, 릴리스 태그 생성 시에만 실행하는 것을 권장합니다:

`.github/workflows/mobile-cd.yml`:

```yaml
name: Mobile CD (EAS Build)

on:
  push:
    tags:
      - 'v*.*.*'  # v1.0.0, v1.0.1 등

jobs:
  build:
    name: EAS Build
    runs-on: ubuntu-latest
    
    steps:
      - name: 코드 체크아웃
        uses: actions/checkout@v4
      
      - name: Node.js 설정
        uses: actions/setup-node@v4
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
          EXPO_PUBLIC_WEB_APP_URL: https://your-project.vercel.app
        run: |
          eas build --platform android --profile production --non-interactive
      
      - name: EAS Build (iOS)
        working-directory: ./mobile
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          EXPO_PUBLIC_WEB_APP_URL: https://your-project.vercel.app
        run: |
          eas build --platform ios --profile production --non-interactive
```

---

## 🔐 5단계: GitHub Secrets 설정

### 필요한 Secrets

GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

#### 백엔드 AWS 배포용:
```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-2
```

#### 모바일 앱 EAS Build용:
```
EXPO_TOKEN=...  (Expo 대시보드에서 생성)
```

#### 알림용 (선택사항):
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## ✅ 6단계: 워크플로우 테스트

### 1. 브랜치 생성 및 PR

```bash
git checkout -b feature/test-cicd
echo "# Test CI/CD" >> README.md
git add .
git commit -m "test: CI/CD 테스트"
git push origin feature/test-cicd
```

### 2. GitHub에서 PR 생성

- PR 생성 시 CI 워크플로우 자동 실행
- Actions 탭에서 진행 상황 확인

### 3. 결과 확인

- ✅ 모든 체크 통과 → PR 병합 가능
- ❌ 체크 실패 → 로그 확인 후 수정

---

## 📊 워크플로우 실행 확인

### GitHub Actions 탭에서 확인

1. 저장소 → **Actions** 탭
2. 왼쪽에서 워크플로우 선택
3. 최근 실행 기록 확인
4. 클릭하여 상세 로그 확인

### PR에서 확인

- PR 페이지 하단에 체크 상태 표시
- "Details" 클릭하여 로그 확인

---

## 🎨 워크플로우 뱃지 추가

README.md에 상태 뱃지 추가:

```markdown
# HOMU 프로젝트

![Frontend CI](https://github.com/your-org/techeer-team-b-2026/workflows/Frontend%20CI/badge.svg)
![Backend CI](https://github.com/your-org/techeer-team-b-2026/workflows/Backend%20CI/badge.svg)
![Mobile CI](https://github.com/your-org/techeer-team-b-2026/workflows/Mobile%20CI/badge.svg)
```

---

## 💡 모범 사례

### 1. 빠른 피드백

```yaml
# 변경된 파일만 트리거
on:
  pull_request:
    paths:
      - 'frontend/**'  # frontend 폴더만
```

### 2. 캐싱 활용

```yaml
# Node.js 캐싱
- uses: actions/setup-node@v4
  with:
    cache: 'npm'
    cache-dependency-path: './frontend/package-lock.json'
```

### 3. 병렬 실행

```yaml
# 여러 작업 동시 실행
jobs:
  lint:
    runs-on: ubuntu-latest
  test:
    runs-on: ubuntu-latest  # lint와 병렬 실행
```

### 4. 조건부 실행

```yaml
# main 브랜치에만 배포
- name: 배포
  if: github.ref == 'refs/heads/main'
  run: ...
```

---

## 🐛 문제 해결

### 문제 1: 워크플로우가 실행되지 않음

**해결:**
- Actions 권한 확인
- 트리거 조건 확인 (`on:` 섹션)
- YAML 문법 오류 확인

### 문제 2: 의존성 설치 실패

**해결:**
- `package-lock.json` 또는 `requirements.txt` 확인
- 캐시 삭제 후 재실행

### 문제 3: Secrets 접근 불가

**해결:**
- Secret 이름 대소문자 확인
- Secret이 올바르게 생성되었는지 확인

---

**다음 문서에서는 AWS 배포 설정을 자세히 알아봅니다!**
