# 모바일 앱 배포 가이드

React Native + Expo를 사용한 WebView 기반 모바일 앱 배포 가이드입니다.

## 📱 배포 구조

```
┌─────────────────────────────────────┐
│  모바일 앱 (React Native + Expo)     │
│  - WebView로 웹앱 표시                │
│  - iOS/Android 앱스토어 배포         │
└──────────┬──────────────────────────┘
           │ WebView로 로드
           ▼
┌─────────────────────────────────────┐
│  Vercel (프론트엔드)                 │
│  - React + Vite 앱                   │
│  - https://your-project.vercel.app  │
└──────────┬──────────────────────────┘
           │ API 호출
           ▼
┌─────────────────────────────────────┐
│  별도 호스팅 (백엔드)                │
│  - FastAPI 서버                      │
└──────────────────────────────────────┘
```

---

## 📋 배포 전 체크리스트

### 1. 프론트엔드 배포 완료

- [ ] Vercel에 프론트엔드 배포 완료
- [ ] 배포된 URL 확인 (예: `https://your-project.vercel.app`)
- [ ] 웹앱이 정상 동작하는지 확인

### 2. 백엔드 CORS 설정 확인

모바일 앱은 WebView를 통해 웹앱에 접근하므로, 백엔드 CORS 설정은 **웹앱의 도메인(Vercel URL)**만 허용하면 됩니다.

- [ ] 백엔드 `ALLOWED_ORIGINS`에 Vercel 도메인 포함 확인
- [ ] 예: `https://your-project.vercel.app`

### 3. Expo 계정 및 EAS 설정

- [ ] Expo 계정 생성: https://expo.dev
- [ ] EAS CLI 설치 및 로그인

---

## 🚀 배포 단계

### 1단계: WebView URL 설정

프로덕션 URL을 환경 변수로 관리하도록 설정합니다.

#### 1-1. App.tsx 수정

`mobile/App.tsx` 파일의 `getWebAppUrl` 함수를 수정:

```typescript
const getWebAppUrl = () => {
  // 프로덕션 환경에서는 환경 변수 또는 하드코딩된 URL 사용
  if (!__DEV__) {
    // 환경 변수 우선, 없으면 하드코딩된 URL 사용
    return process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://your-project.vercel.app';
  }

  // 개발 환경: 로컬 IP 또는 localhost 사용
  const ip = OVERRIDE_IP || LOCAL_IP;
  
  if (Platform.OS === 'android') {
    return `http://${ip}:3000`;
  }
  
  if (Platform.OS === 'ios' && !Platform.isPad) {
    return `http://${ip}:3000`;
  }
  
  return 'http://localhost:3000';
};
```

#### 1-2. 환경 변수 설정

**방법 A: EAS Build 시 환경 변수 설정 (권장)**

EAS Build 시 환경 변수를 설정할 수 있습니다:

```bash
# EAS Build 시 환경 변수 설정
eas build --platform android --profile production --env EXPO_PUBLIC_WEB_APP_URL=https://your-project.vercel.app
```

또는 `eas.json`에 환경 변수 추가:

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_WEB_APP_URL": "https://your-project.vercel.app"
      }
    }
  }
}
```

**방법 B: app.json에 추가 (선택사항)**

`mobile/app.json`에 추가:

```json
{
  "expo": {
    "extra": {
      "webAppUrl": "https://your-project.vercel.app"
    }
  }
}
```

그리고 `App.tsx`에서 사용:

```typescript
import Constants from 'expo-constants';
const PRODUCTION_WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL || Constants.expoConfig?.extra?.webAppUrl || 'https://your-production-url.com';
```

**방법 C: 직접 하드코딩 (간단하지만 유연성 낮음)**

`App.tsx`의 `PRODUCTION_WEB_APP_URL` 상수에 직접 입력:

```typescript
const PRODUCTION_WEB_APP_URL = 'https://your-project.vercel.app';
```

---

### 2단계: EAS Build 설정

#### 2-1. EAS CLI 설치

```bash
npm install -g eas-cli
```

#### 2-2. EAS 로그인

```bash
eas login
```

#### 2-3. 프로젝트 초기화

```bash
cd mobile
eas build:configure
```

이 명령어는 `eas.json` 파일을 생성합니다.

#### 2-4. eas.json 설정 확인

`mobile/eas.json` 파일이 생성되면 다음과 같이 설정:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "ios": {
        "bundleIdentifier": "com.homu.mobile"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

---

### 3단계: 앱 아이콘 및 스플래시 스크린 준비

#### 3-1. 아이콘 준비

- **iOS**: 1024x1024px PNG (투명 배경 없음)
- **Android**: 1024x1024px PNG (투명 배경 없음)

`mobile/assets/icon.png` 파일에 저장

#### 3-2. 스플래시 스크린 준비

- **iOS**: 1242x2436px PNG
- **Android**: 1242x2436px PNG

`mobile/assets/splash.png` 파일에 저장

#### 3-3. Android Adaptive Icon (선택사항)

- **Foreground**: 1024x1024px PNG
- **Background**: 1024x1024px PNG

`mobile/assets/adaptive-icon.png` 파일에 저장

---

### 4단계: Android 앱 빌드 및 배포

#### 4-1. Android 빌드

**프리뷰 빌드 (테스트용 APK):**

```bash
cd mobile
eas build --platform android --profile preview
```

**프로덕션 빌드 (앱스토어 제출용):**

```bash
eas build --platform android --profile production
```

#### 4-2. 빌드 상태 확인

빌드가 시작되면:
1. Expo 대시보드에서 빌드 진행 상황 확인: https://expo.dev
2. 빌드 완료 후 다운로드 링크 제공

#### 4-3. Google Play Console 설정

1. **Google Play Console** 접속: https://play.google.com/console
2. 새 앱 생성 또는 기존 앱 선택
3. 앱 정보 입력:
   - 앱 이름: HOMU
   - 카테고리: 부동산
   - 콘텐츠 등급: 설정 필요
4. **앱 번들 업로드**:
   - 빌드 완료 후 다운로드한 `.aab` 파일 업로드
5. **스토어 등록 정보** 작성:
   - 앱 설명
   - 스크린샷 (최소 2개)
   - 아이콘
   - 개인정보 처리방침 URL
6. **검토 제출**

---

### 5단계: iOS 앱 빌드 및 배포

#### 5-1. Apple Developer 계정 필요

- [ ] Apple Developer Program 가입 (연 $99)
- [ ] Apple ID로 로그인

#### 5-2. iOS 빌드

**프리뷰 빌드 (테스트용):**

```bash
cd mobile
eas build --platform ios --profile preview
```

**프로덕션 빌드 (앱스토어 제출용):**

```bash
eas build --platform ios --profile production
```

#### 5-3. App Store Connect 설정

1. **App Store Connect** 접속: https://appstoreconnect.apple.com
2. 새 앱 생성:
   - Bundle ID: `com.homu.mobile` (app.json과 일치)
   - 앱 이름: HOMU
3. **앱 정보** 입력:
   - 카테고리
   - 연령 등급
   - 개인정보 처리방침 URL
4. **빌드 업로드**:
   - EAS Build가 자동으로 App Store Connect에 업로드
   - 또는 Xcode로 수동 업로드
5. **스토어 등록 정보** 작성:
   - 앱 설명
   - 스크린샷 (다양한 기기 크기)
   - 키워드
   - 지원 URL
6. **검토 제출**

---

### 6단계: 자동 제출 (선택사항)

EAS Submit을 사용하면 빌드 후 자동으로 앱스토어에 제출할 수 있습니다.

#### 6-1. Android 자동 제출

```bash
eas submit --platform android --profile production
```

#### 6-2. iOS 자동 제출

```bash
eas submit --platform ios --profile production
```

---

## 🔧 환경별 설정

### 개발 환경

```typescript
// App.tsx
const getWebAppUrl = () => {
  if (__DEV__) {
    // 로컬 개발 서버
    return 'http://localhost:3000';
  }
  // ...
};
```

### 스테이징 환경

```typescript
const getWebAppUrl = () => {
  if (!__DEV__) {
    // 스테이징 서버
    return process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://staging.vercel.app';
  }
  // ...
};
```

### 프로덕션 환경

```typescript
const getWebAppUrl = () => {
  if (!__DEV__) {
    // 프로덕션 서버
    return process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://your-project.vercel.app';
  }
  // ...
};
```

---

## 📱 테스트 빌드

### Android APK 다운로드 및 설치

1. EAS Build 완료 후 다운로드 링크 확인
2. APK 파일 다운로드
3. Android 기기에 설치:
   ```bash
   adb install app.apk
   ```
4. 또는 QR 코드 스캔하여 설치

### iOS 빌드 테스트

1. EAS Build 완료 후 다운로드 링크 확인
2. TestFlight에 업로드 (자동 또는 수동)
3. TestFlight 앱에서 테스트

---

## 🔒 보안 설정

### 1. HTTPS 강제

프로덕션에서는 반드시 HTTPS를 사용하세요:

```typescript
const getWebAppUrl = () => {
  if (!__DEV__) {
    // HTTPS만 허용
    return 'https://your-project.vercel.app';
  }
  // 개발 환경에서만 HTTP 허용
  return 'http://localhost:3000';
};
```

### 2. WebView 보안 설정

`App.tsx`에서 WebView 보안 설정:

```typescript
<WebView
  source={{ uri: WEB_APP_URL }}
  // HTTPS만 허용 (프로덕션)
  originWhitelist={['https://*']}
  // JavaScript 활성화
  javaScriptEnabled={true}
  // 쿠키 공유 (Clerk 인증용)
  sharedCookiesEnabled={true}
  // 파일 접근 제한
  allowsFileAccess={false}
  // 혼합 콘텐츠 차단 (프로덕션)
  mixedContentMode="never"
/>
```

---

## 🐛 문제 해결

### WebView가 로드되지 않는 경우

**증상:** 앱 실행 시 빈 화면 또는 에러

**해결 방법:**
1. WebView URL 확인:
   ```typescript
   console.log('WebView URL:', WEB_APP_URL);
   ```
2. 네트워크 연결 확인
3. Vercel 배포 상태 확인
4. 백엔드 CORS 설정 확인

### CORS 에러 발생

**증상:** API 호출 시 CORS 에러

**해결 방법:**
1. 백엔드 `ALLOWED_ORIGINS`에 Vercel 도메인 추가 확인
2. 모바일 앱은 WebView를 통해 웹앱에 접근하므로, 웹앱의 도메인만 허용하면 됨

### Clerk 인증이 작동하지 않는 경우

**증상:** 로그인/회원가입 버튼 클릭 시 동작하지 않음

**해결 방법:**
1. WebView 설정 확인:
   ```typescript
   sharedCookiesEnabled={true}
   thirdPartyCookiesEnabled={true}
   ```
2. Clerk Dashboard에서 도메인 허용 확인
3. WebView의 `onShouldStartLoadWithRequest`에서 Clerk 도메인 허용 확인

---

## 📚 참고 자료

- [Expo 공식 문서](https://docs.expo.dev/)
- [EAS Build 가이드](https://docs.expo.dev/build/introduction/)
- [EAS Submit 가이드](https://docs.expo.dev/submit/introduction/)
- [React Native WebView 문서](https://github.com/react-native-webview/react-native-webview)

---

## ✅ 배포 체크리스트

### 배포 전

- [ ] 프론트엔드 Vercel 배포 완료
- [ ] 백엔드 CORS 설정 확인
- [ ] WebView URL 프로덕션 URL로 변경
- [ ] 앱 아이콘 및 스플래시 스크린 준비
- [ ] `app.json` 설정 확인 (Bundle ID, 앱 이름 등)

### Android 배포

- [ ] EAS Build로 Android 빌드 완료
- [ ] Google Play Console에 앱 생성
- [ ] 앱 번들 업로드
- [ ] 스토어 등록 정보 작성
- [ ] 검토 제출

### iOS 배포

- [ ] Apple Developer 계정 가입
- [ ] EAS Build로 iOS 빌드 완료
- [ ] App Store Connect에 앱 생성
- [ ] 빌드 업로드
- [ ] 스토어 등록 정보 작성
- [ ] 검토 제출

### 배포 후

- [ ] 앱스토어에서 앱 다운로드 테스트
- [ ] 주요 기능 동작 확인
- [ ] WebView 로딩 확인
- [ ] API 연결 확인
- [ ] 인증 기능 확인

---

**모바일 앱 배포 성공을 기원합니다! 📱🚀**
