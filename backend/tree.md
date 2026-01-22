# 📁 백엔드 폴더 구조 (Backend Folder Structure)

> **생성일**: 2026-01-11 (일요일)  
> **마지막 업데이트**: 2026-01-11  
> **문서 버전**: 1.1

---

## 🌳 전체 트리 구조

```
backend/..
│
├── 📁 app/                          # 🎯 메인 애플리케이션 폴더
│   │
│   ├── 📁 api/                      # API 라우터 모음
│   │   └── 📁 v1/                   # API 버전 1
│   │       ├── 📁 endpoints/        # 실제 API 엔드포인트 파일들
│   │       │   ├── auth.py          # 인증 API (회원가입, 로그인 등)
│   │       │   ├── apartments.py    # 아파트 API (상세, 거래내역 등)
│   │       │   ├── map.py           # 지도 API (마커, 히트맵 등)
│   │       │   ├── search.py        # 검색 API (아파트, 지역 검색)
│   │       │   ├── dashboard.py     # 대시보드 API (요약, 랭킹)
│   │       │   ├── favorites.py     # 즐겨찾기 API
│   │       │   ├── my_properties.py # 내 집 API
│   │       │   ├── indicators.py    # 지표 API (주택가격지수 등)
│   │       │   ├── users.py         # 사용자 API (프로필 등)
│   │       │   ├── news.py          # 뉴스 API
│   │       │   ├── tools.py         # 도구 API (대출계산기 등)
│   │       │   └── ai.py            # AI API (조건탐색, 요약)
│   │       │
│   │       ├── router.py            # 모든 엔드포인트를 모아주는 라우터
│   │       └── deps.py              # 의존성 주입 (DB 세션, 인증 등)
│   │
│   ├── 📁 core/                     # 🔧 핵심 설정 및 유틸리티
│   │   ├── config.py                # 환경변수, 설정값 관리
│   │   ├── security.py              # JWT, 비밀번호 암호화
│   │   └── exceptions.py            # 커스텀 예외 클래스
│   │
│   ├── 📁 db/                       # 🗄️ 데이터베이스 연결
│   │   ├── base.py                  # SQLAlchemy Base 클래스
│   │   └── session.py               # DB 세션 관리
│   │
│   ├── 📁 models/                   # 📊 SQLAlchemy ORM 모델
│   │   ├── account.py               # 사용자 계정 모델
│   │   ├── apartment.py             # 아파트 모델
│   │   ├── transaction.py           # 거래 내역 모델
│   │   ├── favorite.py              # 즐겨찾기 모델
│   │   ├── my_property.py           # 내 집 모델
│   │   ├── location.py              # 시군구/동 모델
│   │   └── house_price.py           # 주택가격지수 모델
│   │
│   ├── 📁 schemas/                  # 📋 Pydantic 스키마 (요청/응답 검증)
│   │   ├── auth.py                  # 인증 관련 스키마
│   │   ├── apartment.py             # 아파트 관련 스키마
│   │   ├── transaction.py           # 거래 관련 스키마
│   │   ├── map.py                   # 지도 관련 스키마
│   │   ├── user.py                  # 사용자 관련 스키마
│   │   └── common.py                # 공통 응답 스키마
│   │
│   ├── 📁 crud/                     # 🔄 CRUD 작업 (Create, Read, Update, Delete)
│   │   ├── crud_account.py          # 계정 CRUD
│   │   ├── crud_apartment.py        # 아파트 CRUD
│   │   ├── crud_transaction.py      # 거래 CRUD
│   │   └── crud_favorite.py         # 즐겨찾기 CRUD
│   │
│   ├── 📁 services/                 # 💼 비즈니스 로직
│   │   ├── auth_service.py          # 인증 서비스 (로그인, 토큰 발급)
│   │   ├── apartment_service.py     # 아파트 서비스
│   │   ├── map_service.py           # 지도 서비스 (공간쿼리)
│   │   ├── search_service.py        # 검색 서비스
│   │   └── cache_service.py         # Redis 캐싱 서비스
│   │
│   ├── 📁 utils/                    # 🛠️ 유틸리티 함수
│   │   ├── coordinates.py           # 좌표 변환 유틸
│   │   ├── pagination.py            # 페이지네이션 헬퍼
│   │   └── response.py              # 응답 포맷 헬퍼
│   │
│   └── main.py                      # 🚀 FastAPI 앱 진입점
│
├── 📁 scripts/                      # 📜 유틸리티 스크립트
│   ├── seed_data.py                 # 초기 데이터 삽입
│   ├── fetch_molit_data.py          # 국토부 API 데이터 수집
│   └── run_dev.sh                   # 개발 서버 실행 스크립트
│
├── .env                             # 환경변수 설정 (Git에 커밋하지 않음)
├── requirements.txt                 # Python 의존성
├── Dockerfile                       # Docker 이미지 빌드
├── docker-compose.yml               # Docker Compose 설정
├── README.md                        # 백엔드 README
└── tree.md                          # 📋 이 문서 (폴더 구조 설명)

frontend/                             # 🎨 프론트엔드 폴더 (별도 구조)
└── (프론트엔드 팀에서 구성)
```

---

## 🎯 폴더별 역할 요약

| 폴더 | 역할 | 처음 만들 파일 |
|------|------|----------------|
| `app/api/v1/endpoints/` | API 엔드포인트 정의 | `auth.py` (로그인부터!) |
| `app/core/` | 설정, 보안, 예외 | `config.py` |
| `app/db/` | DB 연결 | `session.py` |
| `app/models/` | 테이블 정의 (ORM) | `account.py` |
| `app/schemas/` | 요청/응답 검증 | `auth.py` |
| `app/crud/` | DB CRUD 작업 | `crud_account.py` |
| `app/services/` | 비즈니스 로직 | `auth_service.py` |
| `scripts/` | 유틸리티 스크립트 | `seed_data.py` |

---

## 📚 개발 순서 추천

```
1️⃣ 설정 먼저 (core/)
   └→ config.py (환경변수)
   └→ security.py (비밀번호 해시, JWT)

2️⃣ DB 연결 (db/)
   └→ session.py (AsyncSession)
   └→ base.py (SQLAlchemy Base)

3️⃣ 모델 정의 (models/)
   └→ account.py (사용자)
   └→ apartment.py (아파트)

4️⃣ 스키마 정의 (schemas/)
   └→ auth.py (로그인 요청/응답)

5️⃣ CRUD 작성 (crud/)
   └→ crud_account.py

6️⃣ 서비스 로직 (services/)
   └→ auth_service.py

7️⃣ API 엔드포인트 (api/v1/endpoints/)
   └→ auth.py (로그인, 회원가입)
```

---

## 💡 팁

- **각 폴더에 `how.md`가 있습니다!** 자세한 설명은 해당 폴더의 `how.md`를 참고하세요.
- **모르겠으면 `auth` 관련 파일부터 참고하세요.** 인증 기능이 가장 기본이고, 다른 기능들도 비슷한 패턴을 따릅니다.

---

> 📝 이 문서는 프로젝트 구조가 변경될 때마다 업데이트해주세요!
