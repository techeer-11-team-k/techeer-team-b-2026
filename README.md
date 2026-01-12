# 🏠 부동산 데이터 분석 및 시각화 서비스

> **프로젝트 시작일**: 2026-01-11

---

## 🚀 빠른 시작

### Docker Compose로 실행 (권장)

```bash
# 1. 환경변수 설정
# .env 파일이 이미 존재합니다. 필요시 수정하세요.
# .env 파일을 열어서 실제 값으로 수정

# 2-1. Backend + DB + Redis만 실행 (Frontend 없을 때)
docker-compose up -d

# 2-2. Frontend 포함 전체 실행 (Frontend 초기화 후)
# 먼저 frontend 폴더에 Expo 프로젝트 생성 필요:
# cd frontend && npx create-expo-app@latest . --template blank-typescript
docker-compose --profile frontend up -d

# 3. 로그 확인
docker-compose logs -f backend
docker-compose logs -f frontend  # frontend 실행 시

# 4. 서비스 접속
# Backend API: http://localhost:8000
# API 문서: http://localhost:8000/docs
# Frontend: http://localhost:3000 (frontend 실행 시)
```

### 개별 서비스 실행

#### Backend만 실행
```bash
cd backend
docker-compose up -d
```

#### 로컬에서 직접 실행
```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

---

## 📁 프로젝트 구조

```
techeer-team-b-2026/
├── backend/          # FastAPI 백엔드
│   ├── app/         # 애플리케이션 코드
│   ├── scripts/     # 유틸리티 스크립트
│   ├── Dockerfile
│   └── docker-compose.yml  # Backend만 실행 시
│
├── frontend/        # 프론트엔드 (구조 예정)
│   └── Dockerfile
│
├── docs/            # 문서
│   ├── api_docs.md      # API 명세서
│   ├── api_check.md     # API 개발 체크리스트
│   └── api_help.md      # API 개발 도움말
│
├── docker-compose.yml   # 통합 Docker Compose (전체 실행)
├── .env                 # 환경변수 설정 (Git에 커밋하지 않음)
└── README.md            # 이 파일
```

---

## 📚 관련 문서

- [API 명세서](./docs/api_docs.md)
- [API 개발 체크리스트](./docs/api_check.md)
- [Backend README](./backend/README.md)
- [Backend 폴더 구조](./backend/tree.md)

---

## 🛠️ 기술 스택

| 영역 | 기술 |
|------|------|
| **Backend** | FastAPI, Python 3.11+, SQLAlchemy, PostgreSQL + PostGIS |
| **Frontend** | React Native (Expo) / Next.js (웹) |
| **Database** | PostgreSQL 15+ with PostGIS 3.3 |
| **Cache** | Redis 7+ |
| **Infrastructure** | Docker, Docker Compose |


절대 .env파일 외에는 API Key값을 적지 말도록
Access-Control-Allow-Origin 헤더 추가: 서버 응답 헤더에 허용할 출처를 지정합니다 (예: Access-Control-Allow-Origin: http://localhost:3000 또는 *로 모든 출처 허용).로 해놨으므로 배포 직전에는 수정 할 것