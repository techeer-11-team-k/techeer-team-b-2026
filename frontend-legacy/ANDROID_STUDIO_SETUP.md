# Android Studio에서 실행하기

## 📱 React Native + Expo 프로젝트를 Android Studio에서 실행하는 방법

### 1. 사전 준비사항

#### 필수 설치
- ✅ **Android Studio** (최신 버전)
  - 다운로드: https://developer.android.com/studio
- ✅ **Java JDK 17 이상**
  - Android Studio 설치 시 함께 설치됨
- ✅ **Android SDK**
  - Android Studio → SDK Manager에서 설치
  - 최소 API Level 23 (Android 6.0) 이상

#### 환경 변수 설정 (선택사항)
```bash
# ANDROID_HOME 설정 (Windows)
setx ANDROID_HOME "C:\Users\YourName\AppData\Local\Android\Sdk"

# PATH에 추가
setx PATH "%PATH%;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools"
```

### 2. Android Studio에서 프로젝트 열기

#### 방법 1: Android 폴더 직접 열기 (권장)
1. Android Studio 실행
2. **File → Open** 선택
3. `frontend/android` 폴더 선택
4. **"Trust Project"** 클릭
5. Gradle 동기화 대기 (처음에는 시간이 걸릴 수 있음)

#### 방법 2: Expo CLI로 실행
```bash
cd frontend
npx expo run:android
```
이 명령어는 자동으로:
- Android Studio를 열거나
- 연결된 에뮬레이터/실제 기기에서 실행

### 3. 에뮬레이터 설정

#### AVD (Android Virtual Device) 생성
1. Android Studio → **Tools → Device Manager**
2. **Create Device** 클릭
3. 원하는 기기 선택 (예: Pixel 5)
4. **System Image** 선택 (API Level 33 이상 권장)
5. **Finish** 클릭

#### 에뮬레이터 실행
- Device Manager에서 생성한 에뮬레이터의 **▶️ Play** 버튼 클릭

### 4. 프로젝트 실행

#### 방법 1: Android Studio에서 실행
1. 상단 툴바에서 에뮬레이터 선택
2. **▶️ Run** 버튼 클릭 (또는 `Shift + F10`)
3. 빌드 완료 대기 (처음에는 5-10분 소요)

#### 방법 2: 터미널에서 실행
```bash
cd frontend

# Expo 개발 서버 시작
npx expo start

# 별도 터미널에서 Android 실행
npx expo run:android
```

### 5. 개발 서버 연결

앱이 실행되면:
- **Metro Bundler**가 자동으로 시작됩니다
- 에뮬레이터에서 앱이 열립니다
- 코드 변경 시 **Hot Reload**가 자동으로 적용됩니다

### 6. 디버깅

#### React Native Debugger
- 앱 실행 중 **Ctrl + M** (또는 흔들기) → **Debug** 선택
- Chrome DevTools가 열립니다

#### Android Studio Logcat
- Android Studio 하단의 **Logcat** 탭에서 로그 확인
- 필터: `ReactNativeJS` 또는 `Expo`

### 7. 문제 해결

#### 빌드 에러: "SDK location not found"
```bash
# android/local.properties 파일 생성
echo sdk.dir=C\:\\Users\\YourName\\AppData\\Local\\Android\\Sdk > android/local.properties
```

#### Gradle 동기화 실패
```bash
cd frontend/android
./gradlew clean
```

#### 포트 충돌
```bash
# Metro Bundler 포트 변경
npx expo start --port 8082
```

#### 캐시 클리어
```bash
cd frontend
npx expo start --clear
```

### 8. 실제 기기에서 실행

1. **개발자 옵션 활성화**
   - 설정 → 휴대전화 정보 → 빌드 번호 7번 탭

2. **USB 디버깅 활성화**
   - 설정 → 개발자 옵션 → USB 디버깅 ON

3. **기기 연결**
   - USB로 연결 후 Android Studio에서 기기 선택
   - **Run** 버튼 클릭

### 9. 빌드 설정

#### Release 빌드
```bash
cd frontend/android
./gradlew assembleRelease
```

APK 파일 위치: `android/app/build/outputs/apk/release/app-release.apk`

### 10. 주요 파일 위치

```
frontend/
├── android/              # Android 네이티브 프로젝트
│   ├── app/
│   │   └── src/
│   │       └── main/
│   │           ├── AndroidManifest.xml
│   │           └── java/.../MainActivity.java
│   ├── build.gradle      # 프로젝트 빌드 설정
│   └── settings.gradle
├── app.json              # Expo 설정
└── package.json          # Node.js 의존성
```

### 참고 링크

- [Expo Android 가이드](https://docs.expo.dev/workflow/android-studio/)
- [React Native Android 설정](https://reactnative.dev/docs/environment-setup)
- [Android Studio 공식 문서](https://developer.android.com/studio/intro)

---

## 🚀 빠른 시작

```bash
# 1. 프로젝트 디렉토리로 이동
cd frontend

# 2. 의존성 설치 (이미 했다면 생략)
npm install

# 3. Android 프로젝트 생성 (이미 했다면 생략)
npx expo prebuild --platform android

# 4. Android Studio에서 android 폴더 열기
# 또는 터미널에서 직접 실행:
npx expo run:android
```

**성공!** 🎉 이제 Android Studio에서 React Native 앱을 실행할 수 있습니다!
