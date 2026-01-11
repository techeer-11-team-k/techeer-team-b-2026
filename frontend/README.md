# 📱 Frontend - Expo 프로젝트

> **상태**: 아직 초기화되지 않음

## 🚀 초기화 방법

### 1. Expo 프로젝트 생성

```bash
cd frontend
npx create-expo-app@latest . --template blank-typescript
```

또는

```bash
npx create-expo-app@latest . --template
# 선택: blank (TypeScript)
```

### 2. 필요한 패키지 설치

```bash
npm install
```

### 3. Docker로 실행

프로젝트 루트에서:

```bash
docker-compose up frontend
```

## 📦 예상 패키지 구조

```
frontend/
├── package.json          # 필수!
├── app.json              # Expo 설정
├── tsconfig.json         # TypeScript 설정
├── App.tsx               # 메인 컴포넌트
└── ...
```

## ⚠️ 주의사항

- `package.json`이 없으면 Docker 빌드가 실패합니다
- 초기화 후 `package.json`이 생성되어야 합니다
- Docker Compose에서 frontend 서비스를 주석 처리하면 backend만 실행할 수 있습니다
