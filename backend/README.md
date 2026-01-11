# 🏠 부동산 분석 플랫폼 - Backend

> 마지막 업데이트: 2026-01-11

---

## 🛠️ 기술 스택

| 분류 | 기술 | 버전 | 설명 |
|------|------|------|------|
| **Language** | Python | 3.11+ | 메인 개발 언어 |
| **Framework** | FastAPI | 0.109+ | 비동기 웹 프레임워크 |
| **ASGI Server** | Uvicorn | 0.27+ | ASGI 서버 |
| **Database** | PostgreSQL | 15+ | 메인 데이터베이스 |
| **Spatial DB** | PostGIS | 3.3+ | 지리 공간 데이터 확장 |
| **ORM** | SQLAlchemy | 2.0+ | 비동기 ORM |
| **Validation** | Pydantic | 2.5+ | 데이터 검증 및 직렬화 |
| **Auth** | python-jose | 3.3+ | JWT 토큰 처리 |
| **Password** | passlib[bcrypt] | 1.7+ | 비밀번호 해싱 |
| **Cache** | Redis | 7+ | 캐싱 및 세션 |
| **HTTP Client** | httpx | 0.26+ | 비동기 HTTP 클라이언트 |
| **Container** | Docker | 24+ | 컨테이너화 |
| **Orchestration** | Docker Compose | 2.24+ | 멀티 컨테이너 관리 |

---

## 👥 팀 역할별 담당 영역

### 📱 Frontend

| 영역 | 기술 | 설명 |
|------|------|------|
| **Framework** | Next.js / React | 프론트엔드 프레임워크 |
| **Language** | TypeScript | 타입 안정성 |
| **Styling** | TailwindCSS | 유틸리티 CSS |
| **State** | Zustand / React Query | 상태 관리 |
| **Map** | Kakao Maps API | 지도 시각화 |
| **Chart** | D3.js / Chart.js | 데이터 시각화 |

### ⚙️ Backend

| 영역 | 기술 | 설명 |
|------|------|------|
| **API Server** | FastAPI + Uvicorn | REST API 서버 |
| **Database** | PostgreSQL + PostGIS | 공간 데이터 지원 DB |
| **ORM** | SQLAlchemy 2.0 (async) | 비동기 ORM |
| **Auth** | JWT (python-jose) | 토큰 기반 인증 |
| **Cache** | Redis | API 응답 캐싱 |
| **Validation** | Pydantic v2 | 요청/응답 검증 |

### 🗄️ Data / GIS

| 영역 | 기술 | 설명 |
|------|------|------|
| **Spatial DB** | PostGIS | 공간 쿼리 (ST_Within, ST_DWithin) |
| **GeoAlchemy** | GeoAlchemy2 | SQLAlchemy + PostGIS 연동 |
| **External API** | 국토교통부 API | 실거래가 데이터 수집 |
| **Batch** | APScheduler | 정기 데이터 수집 |

### 🚀 DevOps / Infra

| 영역 | 기술 | 설명 |
|------|------|------|
| **Container** | Docker | 애플리케이션 컨테이너화 |
| **Orchestration** | Docker Compose | 로컬 개발 환경 |
| **CI/CD** | GitHub Actions | 자동 빌드/배포 |
| **Cloud** | AWS / GCP | 클라우드 인프라 |
| **Monitoring** | Prometheus + Grafana | 모니터링 (선택) |

---

## 🚀 빠른 시작

### 1. 환경 설정

```bash
# 저장소 클론
git clone https://github.com/your-org/techeer-team-b-2026.git
cd techeer-team-b-2026/backend

# .env 파일 생성
cp .env.example .env
# .env 파일을 열어서 실제 값으로 수정
```

### 2. Docker로 실행 (권장)

```bash
# 전체 서비스 실행 (DB + Redis + API)
docker-compose up -d

# 로그 확인
docker-compose logs -f api

# 종료
docker-compose down
```

### 3. 로컬에서 직접 실행

```bash
# 가상환경 생성 및 활성화
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 서버 실행
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. API 문서 확인

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 📁 프로젝트 구조

```
backend/
├── app/
│   ├── api/v1/endpoints/   # API 엔드포인트
│   ├── core/               # 설정, 보안, 예외
│   ├── crud/               # 데이터베이스 CRUD
│   ├── db/                 # DB 연결 설정
│   ├── models/             # SQLAlchemy 모델
│   ├── schemas/            # Pydantic 스키마
│   ├── services/           # 비즈니스 로직
│   ├── utils/              # 유틸리티 함수
│   └── main.py             # 앱 진입점
├── scripts/                # 유틸리티 스크립트
├── .env.example            # 환경변수 예시
├── requirements.txt        # Python 의존성
├── Dockerfile              # Docker 이미지 설정
├── docker-compose.yml      # Docker Compose 설정
└── README.md               # 이 파일
```

---

## 📚 관련 문서

- `tree.md` - 상세 폴더 구조
- `app/*/how.md` - 각 폴더별 가이드
- `../docs/api_docs.md` - API 명세서
- `../docs/api_check.md` - API 개발 체크리스트
