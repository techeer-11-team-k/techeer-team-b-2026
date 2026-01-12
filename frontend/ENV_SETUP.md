# .env 파일 설정 가이드

## 문제
Expo 앱에서 `.env` 파일의 환경 변수를 읽지 못하는 문제

## 해결 방법

### 1. app.config.js 생성 완료 ✅
- `dotenv`를 사용하여 프로젝트 루트의 `.env` 파일을 로드
- `EXPO_PUBLIC_` 접두사가 붙은 변수를 자동으로 로드

### 2. babel.config.js 수정 완료 ✅
- `react-native-dotenv` 플러그인 추가
- 런타임에 환경 변수 접근 가능

### 3. .env 파일 확인
프로젝트 루트(`C:\dev\techeer-team-b-2026\.env`)에 다음 변수가 있어야 합니다:
```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
```

## 사용 방법

### Metro 서버 재시작 (필수!)
환경 변수 변경 후 반드시 Metro 서버를 재시작해야 합니다:

```bash
cd frontend

# 1. 현재 Metro 서버 종료 (Ctrl+C)

# 2. 캐시 클리어 후 재시작
npx expo start --clear
```

### 환경 변수 접근
코드에서 환경 변수에 접근:
```typescript
// _layout.tsx에서
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY

// 다른 파일에서
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000'
```

## 중요 사항

1. **EXPO_PUBLIC_ 접두사 필수**
   - Expo는 `EXPO_PUBLIC_` 접두사가 붙은 변수만 클라이언트 번들에 포함시킵니다
   - 보안상 민감한 정보는 서버 사이드에서만 사용하세요

2. **Metro 서버 재시작 필수**
   - `.env` 파일을 수정한 후 반드시 Metro 서버를 재시작해야 합니다
   - `--clear` 옵션을 사용하여 캐시를 클리어하세요

3. **app.config.js vs app.json**
   - `app.config.js`가 있으면 `app.json`보다 우선순위가 높습니다
   - 환경 변수를 동적으로 로드하려면 `app.config.js`를 사용하세요

## 문제 해결

### 환경 변수가 여전히 읽히지 않는 경우

1. **Metro 서버 재시작 확인**
   ```bash
   # 완전히 종료 후
   npx expo start --clear
   ```

2. **.env 파일 위치 확인**
   - 프로젝트 루트(`C:\dev\techeer-team-b-2026\.env`)에 있어야 합니다
   - `frontend/.env`가 아닙니다!

3. **환경 변수 이름 확인**
   - `EXPO_PUBLIC_` 접두사가 정확히 붙어있는지 확인
   - 대소문자 구분

4. **app.config.js 확인**
   - `require('dotenv').config({ path: '../.env' })`가 올바른 경로를 가리키는지 확인

5. **디버깅**
   ```typescript
   // _layout.tsx에서
   console.log('환경 변수:', {
     CLERK_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
     allEnv: Object.keys(process.env).filter(k => k.startsWith('EXPO_PUBLIC_'))
   })
   ```

## 참고

- [Expo 환경 변수 문서](https://docs.expo.dev/guides/environment-variables/)
- [dotenv 패키지](https://www.npmjs.com/package/dotenv)

---

**가장 중요한 것: Metro 서버를 재시작하세요!** 🚀
