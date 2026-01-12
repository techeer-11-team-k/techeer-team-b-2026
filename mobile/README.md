# HOMU 모바일 앱

React Native WebView를 사용하여 웹 앱을 모바일 앱으로 감싼 버전입니다.

## 설치 및 실행

### 1. 의존성 설치

```bash
cd mobile
npm install
```

또는

```bash
cd mobile
yarn install
```

### 2. 웹 앱 실행

먼저 프론트엔드 웹 앱을 실행해야 합니다:

```bash
cd ../frontend
npm run dev
```

웹 앱이 `http://localhost:5173`에서 실행되어야 합니다.

### 3. 모바일 앱 실행

새 터미널에서:

```bash
cd mobile
npm start
```

그 다음:
- **iOS 시뮬레이터**: `i` 키를 누르거나 `npm run ios`
- **Android 에뮬레이터**: `a` 키를 누르거나 `npm run android`
- **웹 브라우저**: `w` 키를 누르거나 `npm run web`

## 설정

### 웹 앱 URL 변경

`App.tsx` 파일에서 `WEB_APP_URL` 상수를 수정하세요:

```typescript
const WEB_APP_URL = __DEV__ 
  ? 'http://localhost:5173'  // 개발 환경
  : 'https://your-production-url.com';  // 프로덕션 환경
```

### 네트워크 설정

#### Android
- Android 에뮬레이터에서 localhost에 접근하려면 `10.0.2.2`를 사용하세요:
  ```typescript
  const WEB_APP_URL = __DEV__ 
    ? 'http://10.0.2.2:5173'  // Android 에뮬레이터
    : 'https://your-production-url.com';
  ```

#### iOS
- iOS 시뮬레이터에서는 `localhost` 또는 컴퓨터의 로컬 IP 주소를 사용할 수 있습니다.

#### 실제 기기
- 실제 기기에서 테스트하려면 컴퓨터의 로컬 IP 주소를 사용하세요:
  ```typescript
  const WEB_APP_URL = __DEV__ 
    ? 'http://192.168.1.100:5173'  // 컴퓨터의 로컬 IP
    : 'https://your-production-url.com';
  ```

## 빌드

### Android APK 빌드

```bash
expo build:android
```

### iOS 빌드

```bash
expo build:ios
```

## 주의사항

1. **CORS 설정**: 백엔드에서 모바일 앱의 요청을 허용하도록 CORS 설정을 확인하세요.
2. **HTTPS**: 프로덕션에서는 HTTPS를 사용하는 것이 좋습니다.
3. **네트워크 권한**: Android의 경우 `INTERNET` 권한이 필요합니다 (이미 `app.json`에 포함되어 있습니다).
