# 🚀 개발 가이드

> 팀원들이 API 개발 시 참고해야 할 주의사항과 코드 작성 흐름입니다.

---

## ⚠️ 코드 작성 주의사항

### 1. `.gitignore`에 `.env` 추가 확인
- `.env` 파일은 **절대 GitHub에 올라가면 안 됩니다!**
- 커밋 전 `.gitignore`에 `.env`가 포함되어 있는지 확인하세요.

```bash
# .gitignore에 있어야 할 항목
.env
.env.local
.env.*.local
```

### 2. 인증키 유출 주의
- **Clerk 키, API 키 등 인증 정보**는 절대 코드에 직접 작성하지 마세요!
- 환경변수(`.env`)로 관리하세요.
- **PR 전에 반드시 확인**: 인증키가 코드에 노출되지 않았는지 체크!

```python
# ❌ 나쁜 예
CLERK_SECRET_KEY = "sk_test_xxxxx..."

# ✅ 좋은 예
import os
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY")
```

### 3. PR(Pull Request) 신중히 작성
- 코드 리뷰를 위해 **변경 내용을 명확히 설명**하세요.
- **테스트 완료 후** PR을 요청하세요.
- 민감한 정보가 포함되지 않았는지 **셀프 체크**!

### 4. 노션 API 명세서 업데이트
- 파일 작성 후 **노션 API 명세서**에 상태 업데이트
- 사이드 보드에 **PoC(Proof of Concept)** 또는 **코드 링크** 공유

---

## 📋 코드 작성 흐름

### Step 1: 브랜치 생성
```bash
git checkout main
git pull origin main
git checkout -b feature/이름
```

**브랜치 이름 규칙:**
```
feature/이름           # 예: feature/chanyoung
feature/api-기능명     # 예: feature/api-search-apartments
```

### Step 2: 코드 작성 (Cursor에서)
```
backend/app/api/v1/endpoints/파일명.py
```

**파일 구조:**
```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.deps import get_db

router = APIRouter()

@router.get("/endpoint")
async def my_api(db: AsyncSession = Depends(get_db)):
    # 로직 구현
    return {"success": True, "data": {...}}
```

### Step 3: 커밋
```bash
git add .
git commit -m "feat(api): 아파트명 검색 API 구현"
```

**커밋 메시지 규칙:**
| 타입 | 설명 | 예시 |
|------|------|------|
| `feat` | 새 기능 | `feat(api): 아파트 검색 구현` |
| `fix` | 버그 수정 | `fix(api): 검색 쿼리 오류 수정` |
| `docs` | 문서 수정 | `docs: README 업데이트` |
| `refactor` | 리팩토링 | `refactor(api): 검색 로직 개선` |

### Step 4: 푸시
```bash
git push -u origin feature/이름
```

### Step 5: GitHub에서 PR 생성

1. GitHub 저장소 접속
2. **"Compare & pull request"** 버튼 클릭
3. PR 템플릿에 맞게 작성:

```markdown
## 📋 작업 내용
- [ ] GET /api/v1/search/apartments 구현

## 📍 관련 노션 API 명세서
- #17 아파트명 검색 (자동완성)

## 🧪 테스트 방법
1. docker-compose up -d
2. http://localhost:8000/docs 접속
3. 엔드포인트 테스트

## ✅ 체크리스트
- [ ] 로컬 테스트 완료
- [ ] 인증키 노출 없음 확인
- [ ] 노션 상태 업데이트
```

4. **Reviewers** 지정
5. **Create pull request** 클릭

---

## 🔄 전체 흐름 요약

```
1️⃣ 브랜치 생성
    git checkout -b feature/이름
         ↓
2️⃣ 코드 작성 (Cursor)
    endpoints/파일명.py
         ↓
3️⃣ 커밋
    git commit -m "feat(api): 기능 구현"
         ↓
4️⃣ 푸시
    git push -u origin feature/이름
         ↓
5️⃣ GitHub PR 생성
    main ← feature/이름
         ↓
6️⃣ 코드 리뷰 & 머지
         ↓
7️⃣ 노션 상태 업데이트
    진행 중 → 완료
```

---

## 📁 파일 위치 가이드

| 작업 | 파일 위치 |
|------|-----------|
| API 엔드포인트 | `backend/app/api/v1/endpoints/` |
| 모델 (DB 테이블) | `backend/app/models/` |
| 라우터 등록 | `backend/app/api/v1/router.py` |
| 스키마 (요청/응답) | `backend/app/schemas/` |
| 서비스 (비즈니스 로직) | `backend/app/services/` |

---

## 🧪 테스트 방법

### 1. Docker로 서버 실행
```bash
docker-compose up -d
```

### 2. Swagger에서 API 테스트
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### 3. API 직접 호출 (curl)
```bash
curl "http://localhost:8000/api/v1/search/apartments?q=래미안&limit=10"
```

---

## 📞 도움이 필요할 때

- **Cursor AI**: 코드 작성 도움
- **팀 슬랙/디스코드**: 팀원에게 질문
- **노션 문서**: API 명세서 확인

---

> 📅 최종 수정: 2026-01-12
> ✍️ 작성자: 팀 테커
