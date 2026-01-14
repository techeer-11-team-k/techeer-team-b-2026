# 내집 기능 보안 점검 보고서

**점검 일시**: 2026-01-14  
**점검 범위**: 내집 기능 관련 코드 및 설정 파일

## 📋 요약

### ✅ 안전한 부분
- `.env` 파일이 `.gitignore`에 포함되어 Git에 추적되지 않음
- 모든 API key와 비밀값은 환경변수를 통해 관리됨
- 소스 코드 파일에는 API key가 하드코딩되어 있지 않음
- `docker-compose.yml`에는 환경변수 참조만 있고 실제 값은 없음

### ⚠️ 확인 사항
- 문서 파일에 예시 값들이 있지만 실제 키 값은 아님
- `docker-compose.yml`에 기본값(`change-me-in-production`)이 있으나 환경변수로 오버라이드됨

---

## 🔍 상세 점검 결과

### 1. .gitignore 설정 확인

**위치**: `.gitignore` (line 141-148)

```gitignore
.env
.envrc
.env.local
.env.*.local
.env.production
.env.development
!.env.example
!.envexample
```

**결과**: ✅ `.env` 파일이 제대로 무시되도록 설정되어 있습니다.

---

### 2. .env 파일 Git 추적 확인

**명령어**: `git ls-files | Select-String "\.env$"`

**결과**: ✅ `.env` 파일이 Git에 추적되고 있지 않습니다.

---

### 3. 소스 코드 파일 점검

#### ✅ 안전한 파일들

**backend/app/core/config.py**
- 모든 API key와 비밀값이 환경변수에서 읽어오도록 설정됨
- 실제 값이 하드코딩되어 있지 않음
- 예시:
  ```python
  CLERK_SECRET_KEY: str  # 필수 환경변수
  MOLIT_API_KEY: Optional[str] = None  # 환경변수에서 읽어옴
  SECRET_KEY: str  # 필수 환경변수
  ```

**backend/app/api/v1/endpoints/my_properties.py**
- 환경변수를 직접 사용하지 않고, `settings`를 통해 간접적으로 사용
- 하드코딩된 API key 없음

**backend/app/crud/my_property.py**
- 데이터베이스 접근만 담당
- API key나 비밀값을 사용하지 않음

---

### 4. docker-compose.yml 확인

**위치**: `docker-compose.yml` (line 75-102)

**환경변수 설정**:
```yaml
environment:
  DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@db:5432/${POSTGRES_DB:-realestate}
  CLERK_SECRET_KEY: ${CLERK_SECRET_KEY:-}
  MOLIT_API_KEY: ${MOLIT_API_KEY:-}
  SECRET_KEY: ${SECRET_KEY:-change-me-in-production}
```

**결과**: ✅ 
- 모든 API key는 환경변수에서 읽어옴 (`${VARIABLE_NAME:-}`)
- `SECRET_KEY`에 기본값(`change-me-in-production`)이 있지만, 환경변수로 오버라이드됨
- 실제 키 값은 하드코딩되어 있지 않음

---

### 5. 문서 파일 확인

**검색 결과**: 문서 파일들에는 예시 값만 있고 실제 키 값은 없음

**예시 값들** (실제 키가 아님):
- `sk_test_...` (예시)
- `pk_test_...` (예시)
- `YOUR_KEY_HERE` (예시)
- `your-secret-key-change-in-production` (예시)

**위치**:
- `backend/docs/environment_variables.md`
- `backend/docs/clerk_setup.md`
- `backend/README_CLERK.md`
- `backend/app/core/how.md` (문서 파일)

**결과**: ✅ 문서 파일에 실제 키 값이 하드코딩되어 있지 않음

---

### 6. 하드코딩된 긴 키 값 검색

**검색 패턴**: 50자 이상의 긴 키 값 (실제 API key는 보통 50자 이상)

**결과**: ✅ 실제 API key 값이 하드코딩되어 있는 파일이 없음

---

## 🛠️ 권장 사항

### 현재 상태 (안전함)
1. ✅ `.env` 파일이 Git에 추적되지 않음
2. ✅ 모든 API key는 환경변수를 통해 관리됨
3. ✅ 소스 코드에 하드코딩된 키 값 없음
4. ✅ `docker-compose.yml`에 실제 키 값 없음

### 추가 권장사항
1. **.env.example 파일 유지**
   - 실제 키 값 없이 예시 값만 포함
   - 새 개발자가 참고할 수 있도록 유지

2. **환경변수 검증**
   - 애플리케이션 시작 시 필수 환경변수가 설정되어 있는지 확인
   - `config.py`에서 이미 필수 환경변수를 정의하고 있음

3. **보안 모범 사례**
   - 프로덕션 환경에서는 `.env` 파일 대신 환경변수 직접 설정 권장
   - Docker 환경에서는 Docker Secrets 사용 고려
   - 키 로테이션 정기적으로 수행

---

## 📝 내집 기능 관련 환경변수

내집 기능 자체는 별도의 API key를 사용하지 않지만, 애플리케이션 전역에서 사용하는 환경변수들:

### 필수 환경변수
- `DATABASE_URL`: PostgreSQL 연결 URL
- `REDIS_URL`: Redis 연결 URL
- `CLERK_SECRET_KEY`: Clerk 인증용 Secret Key
- `SECRET_KEY`: JWT 토큰 서명용 Secret Key

### 선택적 환경변수
- `MOLIT_API_KEY`: 국토부 API 키 (데이터 수집용)
- `KAKAO_REST_API_KEY`: 카카오 API 키
- `GEMINI_API_KEY`: Google Gemini API 키

---

## ✅ 결론

**내집 기능 관련 코드는 보안상 안전합니다.**

- `.env` 파일이 Git에 추적되지 않음
- 모든 API key와 비밀값은 환경변수를 통해 관리됨
- 소스 코드에 하드코딩된 키 값 없음
- 문서 파일에 실제 키 값 없음 (예시 값만 존재)

**추가 조치 필요 없음.**
