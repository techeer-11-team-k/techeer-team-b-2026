# 부동산 분석 플랫폼 - Frontend

React Native + Expo를 사용한 크로스 플랫폼 애플리케이션입니다.

## 기술 스택

- **Core**: React Native (Expo SDK ~51), TypeScript
- **Routing**: Expo Router
- **UI/UX**: NativeWind (TailwindCSS), React Native Reanimated
- **State Management**: Zustand (클라이언트 상태), React Query (서버 상태)
- **Authentication**: Clerk (@clerk/clerk-expo)
- **HTTP Client**: Axios

## 🚀 빠른 시작

### 웹에서 실행 (개발용)
```bash
npm run dev
# 또는
npx expo start --web
```

### Android Studio에서 실행
자세한 내용은 [ANDROID_STUDIO_SETUP.md](./ANDROID_STUDIO_SETUP.md)를 참고하세요.

**간단한 방법:**
```bash
# Android 프로젝트 생성 (이미 완료됨)
npx expo prebuild --platform android

# Android Studio에서 android 폴더 열기
# 또는 터미널에서 직접 실행:
npm run android
# 또는
npx expo run:android
```

## 프로젝트 구조

```
frontend/
├── app/                    # Expo Router 기반 페이지
│   ├── _layout.tsx         # 루트 레이아웃
│   ├── index.tsx           # 홈 페이지
│   └── db.tsx              # DB 뷰어 페이지
├── components/             # 재사용 가능한 컴포넌트
│   ├── atoms/              # 기본 컴포넌트
│   ├── molecules/         # 복합 컴포넌트
│   ├── organisms/          # 복잡한 컴포넌트
│   └── templates/          # 페이지 템플릿
├── app.json                # Expo 설정
├── babel.config.js         # Babel 설정 (NativeWind 포함)
├── tailwind.config.js      # TailwindCSS 설정
├── metro.config.js         # Metro bundler 설정
└── global.css              # 전역 스타일
```

## 환경변수 설정

프로젝트 루트의 `.env` 파일에 다음 환경변수를 설정하세요:

```bash
# Expo는 EXPO_PUBLIC_ 접두사를 사용합니다
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY=...
```

## 실행 방법

### 로컬 개발

```bash
# 의존성 설치
npm install

# 개발 서버 시작 (웹)
npm run dev
# 또는
npx expo start --web

# iOS 시뮬레이터
npm run ios

# Android 에뮬레이터
npm run android
```

### Docker로 실행

```bash
# Frontend 포함 전체 실행
docker-compose --profile frontend up -d

# 로그 확인
docker-compose logs -f frontend
```

## 개발 가이드

### 컴포넌트 구조

Atomic Design 패턴을 따릅니다:
- **atoms**: 가장 작은 단위의 컴포넌트 (Button, Input 등)
- **molecules**: atoms를 조합한 컴포넌트 (SearchBar, Card 등)
- **organisms**: molecules와 atoms를 조합한 복잡한 컴포넌트 (Header, Form 등)
- **templates**: 페이지 레이아웃 템플릿

### 상태 관리

- **서버 상태**: React Query (TanStack Query) 사용
- **클라이언트 UI 상태**: Zustand 사용
- **Prop Drilling 방지**: 3단계 이상의 Prop 전달 시 Context 또는 Zustand 사용

### 스타일링

NativeWind를 사용하여 TailwindCSS 클래스를 직접 사용할 수 있습니다:

```tsx
<View className="flex-1 items-center justify-center bg-white">
  <Text className="text-2xl font-bold text-blue-500">Hello World</Text>
</View>
```

### 타입 안정성

- `any` 타입 사용 절대 금지
- 엄격한 TypeScript 설정 적용
- 모든 API 응답에 대한 타입 정의 필수

## 주의사항

- Expo Router는 파일 기반 라우팅을 사용합니다
- 환경변수는 `EXPO_PUBLIC_` 접두사가 필요합니다
- NativeWind는 `className` prop을 사용합니다 (웹의 `class`가 아님)
