# 🏠 부동산 데이터 분석 및 시각화 서비스

> **프로젝트 시작일**: 2026-01-11

---

## 🚀 빠른 시작

프로젝트 실행 방법은 [start.md](./start.md)를 참고하세요.

---

## 📁 프로젝트 구조
.
```
techeer-team-b-2026/
├── backend/          # FastAPI 백엔드
│   ├── app/         # 애플리케이션 코드
│   ├── scripts/     # 유틸리티 스크립트
│   ├── Dockerfile
│   └── docker-compose.yml  # Backend만 실행 시
│
├── frontend/        # 프론트엔드 웹 앱 (React + Vite)
│   └── Dockerfile
│
├── mobile/          # 모바일 앱 (React Native + Expo + WebView)
│   ├── App.tsx      # WebView 메인 컴포넌트
│   └── README.md    # 모바일 앱 실행 가이드
│
├── docs/            # 문서
│   ├── api_docs.md      # API 명세서
│   ├── api_check.md     # API 개발 체크리스트
│   └── api_help.md      # API 개발 도움말
│
├── docker-compose.yml   # 통합 Docker Compose (전체 실행)
├── .env                 # 환경변수 설정 (Git에 커밋하지 않음)
├── start.md             # 빠른 시작 가이드 (실행 방법)
└── readme.md            # 이 파일 (프로젝트 소개)
```

---

## 📚 관련 문서

- [API 명세서](./docs/api_docs.md)
- [API 개발 체크리스트](./docs/api_check.md)
- [Backend README](./backend/README.md)
- [Backend 폴더 구조](./backend/tree.md)
- [모바일 앱 가이드](./mobile/README.md)

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