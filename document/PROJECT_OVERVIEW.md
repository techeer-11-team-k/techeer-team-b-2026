# SWEETHOME 프로젝트 정리

> 부동산 데이터 분석 및 시각화 서비스 — 기능, 차별점, 최적화, 요약

---

## 1. 요약 (Executive Summary)

- **서비스명**: SWEETHOME
- **정의**: 국토교통부·한국부동산원 등 공공 데이터를 활용해 실거래가·시세·통계를 **조회·비교·시각화**하고, 내 자산·관심 아파트를 관리할 수 있는 **데이터 조회/분석 전용** 부동산 자산 관리 플랫폼입니다.
- **기술 스택 요약**:  
  React, TypeScript, Vite, Tailwind CSS, FastAPI, PostgreSQL+PostGIS, Redis, Clerk, Kakao Maps, Docker, GitHub Actions, Nginx, Prometheus, Grafana, Expo/React Native
- **프로젝트 기간**: 2025-12-29 ~ 2026-1-31

---

## 2. 기능 (Features)

### 2.1 부동산 데이터 조회

- 아파트 기본 정보·상세 정보 조회 (동수, 세대수, 층수, 사용승인일, 주차, 난방 등)
- 매매/전월세 거래 내역 및 가격 추이 분석
- 국토교통부 API 기반 실거래가 데이터 수집·활용

**관련 화면**: `PropertyDetail` (아파트 상세), 대시보드/통계 내 시세·차트

### 2.2 지도 기반 검색

- 지도 영역 기반 데이터 조회 및 주변 아파트 검색
- 최근 검색어·아파트명 자동완성
- Kakao Maps API 연동 인터랙티브 지도 (마커, 필터, 상세 패널/바텀시트)

**관련 화면**: `MapExplorer`

### 2.3 자산·관심 목록·비교

- **소유 부동산 등록·관리**: 내 부동산 등록 후 현재 시세·변동률 조회
- **자산 활동 로그**: 등록한 “내 부동산”의 가격 변동 이력 등을 타임라인으로 제공
- **관심 아파트 즐겨찾기**: 아파트 단위 즐겨찾기 및 목록 관리
- **1:1·다수 아파트 비교**: 2~5개 아파트 선택 시 6각형(레이다) 스펙 비교, 평형별 비교, 핵심 특징 비교, 상세 스펙·학군 정보 비교

**관련 화면**: `Dashboard`, `MyPropertyModal`, `AssetActivityTimeline`, `Comparison`

### 2.4 시장 분석·통계 시각화

- 전국 평당가·거래량 추이 대시보드
- 지역별 랭킹 (거래량·상승률·하락률 TOP)
- 부동산 지수(HPI) 시각화
- 주택 공급·수요, 정책·뉴스 연계
- D3.js·Recharts·Highcharts 등 인터랙티브 차트

**관련 화면**: `Dashboard`, `Ranking`, `HousingSupply`, `HousingDemand`, `GovernmentPolicy`, `PolicyNewsList`

### 2.5 인증·온보딩

- Clerk를 통한 소셜 로그인·이메일 가입
- 튜토리얼·온보딩 플로우로 초기 사용 가이드

**관련 화면**: `Onboarding`, Clerk 연동 라우트

### 2.6 관리자·모니터링

- admin_web 등 백오피스 기능 (데이터·유저·시스템 관리)
- Prometheus + Grafana 기반 모니터링

**관련 구현**: `backend/app/api/v1/endpoints/admin_web.py`, `backend/monitoring/`

---

## 3. 다른 서비스와 차별점 (Differentiators)

### 3.1 데이터 조회·분석 전용 포지셔닝

- **하지 않는 것**: 매물 등록, 매매/임대 거래 성사, 청약·분양, 대출·금융, 중개사 연결·상담 예약, 커뮤니티·리뷰, 실시간 호가·급매물 알림
- **하는 것**: 시세·통계·비교·시각화에만 집중한 “데이터 조회 및 분석” 전용 서비스

### 3.2 1:1·다수 아파트 비교 (6각형 레이더·절대값 스케일)

- 2~5개 아파트를 골라 **6각형(레이다) 스펙 비교**로 매매가·전세가·전세가율·평당가·세대수·역도보·주차·건축연도 등을 한 번에 비교
- **절대값 기준 스케일**: 매매가·전세가·평당가는 “두 아파트 중 큰 값 × 1.25”를 최댓값으로 사용해, 상대 비교가 아닌 절대 스케일에서 비교
- 평형별 비교, 핵심 특징 요약, 상세 스펙·주변 학교 정보 비교 제공

### 3.3 자산 활동 타임라인

- 등록한 “내 부동산”에 대한 가격 변동 이력 등을 **타임라인** 형태로 제공해, 시세 추이를 시각적으로 파악 가능

### 3.4 PostGIS 기반 지도·공간 검색

- 아파트 위치(geometry), 반경/영역 검색 등 **공간 쿼리(ST_Within, ST_DWithin 등)** 활용
- 지도·통계·검색이 하나의 플랫폼에서 연동

### 3.5 통계·정책·뉴스 통합

- 전국/지역 통계, 부동산 정책, 뉴스 크롤링·요약을 한 서비스에서 제공
- 사용자 지정 카드·위젯으로 대시보드를 개인화

---

## 4. 최적화 관련 행동 (Optimization Actions)

| 항목 | 내용 | 기대 효과 |
|------|------|-----------|
| **Connection Pooling** | `pool_size` 5→20, `max_overflow` 10→40, `pool_recycle` 900→1800초 (`backend/app/db/session.py`) | 동시 요청 처리 능력 약 4배 증가 |
| **Redis 통계 캐싱** | 통계 API용 캐시 서비스·스케줄러, 필터 조합별 캐시 키, 매일 새벽 2시 사전 계산, TTL 6시간 | 통계 API 응답 시간 캐시 히트 시 90% 이상 감소 |
| **Materialized View** | `mv_monthly_transaction_stats` — 월별 거래량 통계 사전 집계, 월·지역·거래유형별 인덱스 | 통계 쿼리 속도 약 10~20배 향상 |
| **복합 인덱스** | `idx_sales_apt_date_price`, `idx_sales_region_date_canceled`, `idx_rents_apt_date_type`, `idx_apartments_region_deleted_name`, `idx_apart_details_apt_deleted` | 검색·상세 조회 속도 약 2~5배 향상 |
| **일일 통계 배치** | `daily_statistics` 테이블·서비스로 전날 통계 사전 계산, 월별 통계는 일일 집계 기반 | 월별 통계 계산 시간 약 80% 이상 감소 |
| **캐시 무효화** | 데이터 갱신 시 관련 통계 캐시 자동 무효화 (`backend/app/services/cache_invalidation.py`, main 이벤트 리스너 등록) | 갱신 후에도 캐시와 DB 정합성 유지 |
| **검색 최적화** | pg_trgm GIN 인덱스, 2단계 검색(LIKE → 유사도), 필요한 컬럼만 SELECT | 검색 속도·정확도 향상 |
| **아파트 상세 최적화** | JOIN 기반 조회(서브쿼리 축소), Redis 캐시(TTL 10분), 필요한 컬럼만 SELECT | 상세 API 응답 시간·부하 감소 |

---

## 5. 기타

### 5.1 시스템 아키텍처

- 프론트엔드(React/Vite)·백엔드(FastAPI)·DB(PostgreSQL+PostGIS)·캐시(Redis)를 Docker Compose로 구성
- CI/CD는 GitHub Actions, 배포는 AWS EC2·Vercel·Nginx 등 활용
- 상세 구조·다이어그램은 루트 `README.md`의 System Architecture 섹션 참고

### 5.2 API·ERD

- API 목록·스펙 및 ERD는 루트 `README.md`, `backend/README.md`, 백오피스·모니터링 관련 문서를 참고

### 5.3 팀·기간

- **팀**: 김강문(Team Leader), 조항중, 박찬영, 김민성, 조수아, 정조셉 (README Member 표 참고)
- **기간**: 2025-12-29 ~ 2026-1-31
