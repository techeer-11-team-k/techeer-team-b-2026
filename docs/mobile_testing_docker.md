# 🚀 Docker 환경에서 Android Studio 에뮬레이터 테스트 가이드

이 가이드는 Docker로 실행 중인 서비스를 Android Studio 에뮬레이터에서 테스트하는 방법을 설명합니다.

## 📋 사전 요구사항

1. Docker 및 Docker Compose 설치
2. Android Studio 설치 및 에뮬레이터 설정
3. Node.js 및 npm 설치 (모바일 앱 실행용)

## 🔍 네트워크 구조 이해

### Android 에뮬레이터 네트워크
- Android 에뮬레이터는 **`10.0.2.2`**를 통해 호스트 머신의 `localhost`에 접근합니다
- 예: `http://10.0.2.2:3000` → 호스트의 `http://localhost:3000`

### Docker 네트워크
- Docker 컨테이너는 호스트의 `0.0.0.0:포트`에 바인딩되어 외부 접근이 가능합니다
- 프론트엔드: `0.0.0.0:3000` → `http://localhost:3000` 또는 `http://10.0.2.2:3000`
- 백엔드: `0.0.0.0:8000` → `http://localhost:8000` 또는 `http://10.0.2.2:8000`

## 🚀 실행 단계

### 1단계: Docker 서비스 시작

```bash
# 프로젝트 루트에서
docker-compose up -d
```

실행 중인 서비스 확인:
```bash
docker-compose ps
```

예상 출력:
```
NAME                  STATUS
realestate-db         Up (healthy)
realestate-redis      Up (healthy)
realestate-backend    Up (healthy)
realestate-frontend   Up
```

### 2단계: 서비스 접근 확인

**호스트에서 테스트:**
- 프론트엔드: http://localhost:3000
- 백엔드 API: http://localhost:8000/docs

**Android 에뮬레이터에서 테스트:**
- 프론트엔드: http://10.0.2.2:3000
- 백엔드 API: http://10.0.2.2:8000/docs

### 3단계: 모바일 앱 실행

```bash
cd mobile
npm install  # 처음 실행 시
npm start
```

Android Studio 에뮬레이터에서:
- `a` 키를 누르거나 `npm run android` 실행

## ⚙️ 설정 확인

### 프론트엔드 API URL 설정

`frontend/src/lib/api.ts`에서 자동으로 현재 호스트를 감지하여 API URL을 설정합니다:
- `10.0.2.2:3000`에서 접근 → `10.0.2.2:8000/api/v1` 사용
- `localhost:3000`에서 접근 → `localhost:8000/api/v1` 사용

### 백엔드 CORS 설정

`docker-compose.yml`에서 다음 출처가 허용됩니다:
- `http://localhost:3000`
- `http://10.0.2.2:3000` (Android 에뮬레이터)
- `http://localhost:5173`
- `http://localhost:8081`

### 모바일 앱 URL 설정

`mobile/App.tsx`에서 Android 에뮬레이터는 자동으로 `10.0.2.2:3000`을 사용합니다.

## 🐛 문제 해결

### 문제 1: "로딩 중..."만 표시되고 페이지가 로드되지 않음

**원인**: 네트워크 연결 문제 또는 서비스 미실행

**해결 방법**:
1. Docker 서비스가 실행 중인지 확인:
   ```bash
   docker-compose ps
   ```

2. 에뮬레이터에서 직접 접근 테스트:
   - 에뮬레이터의 브라우저에서 `http://10.0.2.2:3000` 접속 시도
   - 또는 `adb shell`로 접속 후 `curl http://10.0.2.2:3000` 실행

3. 호스트에서 포트 확인:
   ```bash
   netstat -ano | findstr :3000  # Windows
   lsof -i :3000                 # Mac/Linux
   ```

### 문제 2: API 호출 실패 (CORS 오류)

**원인**: 백엔드 CORS 설정에 에뮬레이터 출처가 없음

**해결 방법**:
1. `docker-compose.yml`의 `ALLOWED_ORIGINS`에 `http://10.0.2.2:3000`이 포함되어 있는지 확인
2. 백엔드 컨테이너 재시작:
   ```bash
   docker-compose restart backend
   ```

### 문제 3: API 호출이 `localhost:8000`으로 가는 문제

**원인**: 프론트엔드가 하드코딩된 API URL 사용

**해결 방법**:
- `frontend/src/lib/api.ts`가 현재 호스트를 자동 감지하도록 수정되어 있습니다
- 프론트엔드 컨테이너 재시작:
  ```bash
  docker-compose restart frontend
  ```

### 문제 4: 방화벽 차단

**원인**: Windows 방화벽이 포트 3000, 8000을 차단

**해결 방법**:
1. Windows 방화벽 설정 열기
2. 인바운드 규칙에서 포트 3000, 8000 허용 추가

## 📝 체크리스트

테스트 전 확인사항:

- [ ] Docker 서비스가 모두 실행 중 (`docker-compose ps`)
- [ ] 호스트에서 `http://localhost:3000` 접속 가능
- [ ] 호스트에서 `http://localhost:8000/docs` 접속 가능
- [ ] 모바일 앱이 `10.0.2.2:3000`을 사용하도록 설정됨
- [ ] 백엔드 CORS에 `http://10.0.2.2:3000` 포함됨
- [ ] 프론트엔드 API URL이 동적으로 설정됨

## 🔗 관련 문서

- [프로젝트 README](../README.md)
- [빠른 시작 가이드](../start.md)
- [모바일 앱 README](../mobile/README.md)

---

**마지막 업데이트**: 2026-01-12
