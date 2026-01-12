# 📁 app/ 폴더 설명

> **이 폴더는 뭘 하는 곳인가요?**  
> 백엔드 애플리케이션의 **모든 핵심 코드**가 들어가는 메인 폴더입니다!

---

## 🎯 한줄 요약

```
app/ = 우리 서비스의 뇌 🧠
```

사용자가 앱에서 "로그인" 버튼을 누르면, 그 요청을 처리하는 모든 코드가 이 폴더 안에 있습니다.

---

## 📁 하위 폴더들

| 폴더 | 역할 | 비유 |
|------|------|------|
| `api/` | 사용자 요청을 받는 곳 | 🚪 가게 카운터 |
| `core/` | 설정, 보안 등 핵심 기능 | ⚙️ 가게 운영 시스템 |
| `db/` | 데이터베이스 연결 | 🔌 창고 연결 통로 |
| `models/` | 데이터 구조 정의 | 📦 창고 선반 구조 |
| `schemas/` | 데이터 검증 | ✅ 주문서 양식 |
| `crud/` | 데이터 읽기/쓰기 | 📝 창고 입출고 담당 |
| `services/` | 비즈니스 로직 | 👨‍🍳 실제 요리사 |
| `utils/` | 도우미 함수들 | 🧹 청소/정리 담당 |

---

## 📄 main.py

이 폴더에서 가장 중요한 파일!

```python
# main.py - FastAPI 앱이 시작되는 곳
from fastapi import FastAPI
from app.api.v1.router import api_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="부동산 데이터 분석 서비스 API"
)

# 모든 API 라우터 연결
app.include_router(api_router, prefix="/api/v1")

# 서버 실행 시 이 파일이 실행됩니다
# uvicorn app.main:app --reload
```

---

## 🔄 요청 처리 흐름

```
사용자 요청 (예: 로그인)
        ↓
┌─────────────────────┐
│   main.py           │  ← FastAPI 앱 시작점
│   (앱 진입점)        │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   api/v1/router.py  │  ← 어떤 엔드포인트로 갈지 분배
│   (라우터)           │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   api/v1/endpoints/ │  ← 요청 받고, 응답 보내기
│   auth.py           │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   services/         │  ← 실제 로직 처리
│   auth_service.py   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   crud/             │  ← DB에서 데이터 가져오기
│   crud_account.py   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   models/           │  ← DB 테이블 구조
│   account.py        │
└─────────────────────┘
```

---

## 💡 개발 시작하기

1. **처음엔 `core/config.py`부터!**
   - 환경변수(DB 주소, 비밀키 등) 설정
   
2. **그 다음 `db/session.py`**
   - 데이터베이스 연결 설정
   
3. **모델 → 스키마 → CRUD → 서비스 → 엔드포인트** 순서로 개발

---

## ❓ 자주 하는 질문

**Q: 파일이 너무 많은데 어디서 시작해야 하나요?**  
A: `auth` 관련 파일들을 먼저 보세요! `endpoints/auth.py` → `services/auth_service.py` → `crud/crud_account.py` → `models/account.py` 순서로 보면 전체 흐름이 이해됩니다.

**Q: 새 기능을 추가하려면?**  
A: 아래 순서로 파일을 만드세요:
1. `models/새기능.py` - 테이블 정의
2. `schemas/새기능.py` - 요청/응답 형식
3. `crud/crud_새기능.py` - DB 작업
4. `services/새기능_service.py` - 비즈니스 로직
5. `endpoints/새기능.py` - API 엔드포인트
