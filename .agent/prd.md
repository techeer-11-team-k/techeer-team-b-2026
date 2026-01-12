# 부동산 데이터 분석 및 시각화 서비스 PRD
## Product Requirements Document v1.0

> **작성일**: 2026-01-10  
> **문서 버전**: 1.0  
> **작성자**: CPO & System Architect  
> **상태**: Draft

---

## 1. Project Mission

### 1.1 핵심 문제

부동산 투자자와 일반 사용자들이 직면하는 핵심 문제:

| 문제 | 설명 | 현재 상황 |
|------|------|-----------|
| **정보 파편화** | 아파트 실거래가, 전세가, 시세 정보가 여러 사이트에 분산 | 국토부, KB부동산, 네이버 부동산 등 개별 조회 필요 |
| **시각화 부재** | 원시 데이터만 제공, 트렌드 파악 어려움 | 엑셀 수작업으로 차트 생성 |
| **지역 비교 어려움** | 관심 지역 간 가격/거래량 비교 불편 | 각 지역 개별 검색 후 수기 비교 |
| **공간 기반 탐색 미흡** | 지도 기반 직관적 탐색 기능 부족 | 텍스트 기반 검색 중심 |

### 1.2 가치 제안 (Value Proposition)

```
"흩어진 부동산 공공데이터를 한눈에, 지도 위에서 직관적으로"
```

- **One-Stop 데이터 허브**: 국토부 실거래가 + KB지수 + 아파트 기본정보를 통합
- **GIS 기반 시각화**: 카카오맵 위에 가격 히트맵, 거래량 마커 오버레이
- **투자자 친화 지표**: 전세가율, 평당가 추이, 상승/하락률 랭킹 제공
- **개인화 대시보드**: 내 집/관심 아파트 시세 모니터링

### 1.3 타겟 사용자

| 페르소나 | 비율 | 핵심 니즈 |
|----------|------|-----------|
| **부동산 투자자** | 60-70% | 지역별 시세 추이, 전세가율, 랭킹 데이터 |
| **실수요자(예비 매수자)** | 20-30% | 관심 아파트 시세, 주변 시세 비교 |
| **자산 관리자** | 10% | 내 집 시세 변동 모니터링 |

### 1.4 핵심 제약사항 (Critical Constraints)

> ⚠️ **반드시 준수해야 할 제약사항**

1. **실시간 데이터 불가**: 모든 데이터는 과거/배치 데이터 기반 (국토부 데이터 1~2개월 지연)
2. **투자 추천 금지**: 데이터 시각화만 제공, 판단은 사용자에게 위임
3. **법적 고지 필수**: 모든 차트/지표 화면에 "투자 판단/권유 아님" 문구 표시
4. **데이터 출처 명시**: 국토부, KB부동산 등 출처 및 기준일 표기

---

## 2. Core Features (User Stories)

### 2.1 P0 (필수 - MVP 출시 필수)

#### FEAT-001: 회원 인증 시스템

| 항목 | 내용 |
|------|------|
| **User Story** | 사용자로서, 이메일로 회원가입/로그인하여 내 데이터를 저장하고 싶다 |
| **연관 기술 스택** | FastAPI (인증 서버), JWT (토큰), PostgreSQL (사용자 DB), bcrypt (암호화) |
| **인수 조건** | ✅ 이메일 형식 검증 ✅ 비밀번호 8자 이상, 영문+숫자 ✅ JWT 유효기간 24h, Refresh Token 7일 |

```
POST /api/v1/auth/register  → 회원가입
POST /api/v1/auth/login     → 로그인 (JWT 발급)
POST /api/v1/auth/refresh   → 토큰 갱신
POST /api/v1/auth/logout    → 로그아웃 (토큰 무효화)
```

#### FEAT-002: 지도 기반 아파트 탐색

| 항목 | 내용 |
|------|------|
| **User Story** | 사용자로서, 지도에서 특정 지역의 아파트를 마커로 확인하고 클릭하여 상세정보를 보고 싶다 |
| **연관 기술 스택** | 카카오맵 JS SDK / Mapbox GL JS (프론트), PostGIS (공간 쿼리), FastAPI (API), Redis (마커 캐싱) |
| **인수 조건** | ✅ 지도 로딩 < 1초 ✅ 뷰포트 내 마커 렌더링 < 500ms ✅ 줌 레벨별 클러스터링 |

**공간 쿼리 예시 (PostGIS)**:
```sql
SELECT apt_id, apt_name, ST_AsGeoJSON(geometry) as location
FROM APARTMENTS
WHERE ST_Within(geometry, ST_MakeEnvelope(:west, :south, :east, :north, 4326))
LIMIT 200;
```

```
GET /api/v1/map/apartments?bounds=west,south,east,north&zoom=15
GET /api/v1/map/apartments/{apt_id}/summary
```

#### FEAT-003: 아파트 상세 정보 조회

| 항목 | 내용 |
|------|------|
| **User Story** | 사용자로서, 선택한 아파트의 기본정보, 실거래 내역, 가격 추이 차트를 확인하고 싶다 |
| **연관 기술 스택** | FastAPI (API), PostgreSQL (거래 데이터), D3.js / Highcharts (시각화) |
| **인수 조건** | ✅ 상세 패널 로딩 < 200ms ✅ 최근 2년 거래 내역 표시 ✅ 평당가 추이 라인차트 |

```
GET /api/v1/apartments/{apt_id}                    → 기본정보
GET /api/v1/apartments/{apt_id}/transactions       → 거래 내역
GET /api/v1/apartments/{apt_id}/price-trend        → 가격 추이 (차트 데이터)
```

#### FEAT-004: 아파트 검색

| 항목 | 내용 |
|------|------|
| **User Story** | 사용자로서, 아파트명 또는 주소로 검색하여 빠르게 원하는 아파트를 찾고 싶다 |
| **연관 기술 스택** | FastAPI, PostgreSQL Full-Text Search, Redis (검색어 캐싱) |
| **인수 조건** | ✅ 자동완성 응답 < 100ms ✅ 2글자 이상 입력 시 연관 검색어 표시 |

```
GET /api/v1/search/apartments?q=래미안&limit=10
GET /api/v1/search/locations?q=강남구
GET /api/v1/search/recent                          → 최근 검색어 (로그인 필요)
```

### 2.2 P1 (중요 - MVP 직후 구현)

#### FEAT-005: 관심 아파트 & 지역 즐겨찾기

| 항목 | 내용 |
|------|------|
| **User Story** | 로그인 사용자로서, 관심 아파트/지역을 저장하여 빠르게 접근하고 싶다 |
| **연관 기술 스택** | FastAPI, PostgreSQL (FAVORITE_APARTMENTS, FAVORITE_LOCATIONS) |
| **인수 조건** | ✅ 즐겨찾기 추가/삭제 ✅ 최대 50개 제한 ✅ 홈에서 바로 접근 |

```
POST   /api/v1/favorites/apartments          → 관심 아파트 추가
DELETE /api/v1/favorites/apartments/{apt_id} → 삭제
GET    /api/v1/favorites/apartments          → 목록 조회
```

#### FEAT-006: 홈 대시보드

| 항목 | 내용 |
|------|------|
| **User Story** | 사용자로서, 서비스 진입 시 핵심 지표와 랭킹을 한눈에 보고 싶다 |
| **연관 기술 스택** | React Native, FastAPI, Redis (지표 캐싱) |
| **인수 조건** | ✅ 홈 로딩 < 1초 ✅ 상승/하락률 Top 5 표시 ✅ 최근 본 아파트 표시 |

```
GET /api/v1/dashboard/summary                → 핵심 지표 요약
GET /api/v1/dashboard/rankings?type=rise     → 상승률 랭킹
GET /api/v1/dashboard/rankings?type=fall     → 하락률 랭킹
GET /api/v1/dashboard/rankings?type=volume   → 거래량 랭킹
```

#### FEAT-007: 가격 지표 시각화

| 항목 | 내용 |
|------|------|
| **User Story** | 투자자로서, 지역별 주택가격지수와 전세가율을 차트로 확인하고 싶다 |
| **연관 기술 스택** | FastAPI, PostgreSQL (HOUSE_PRICES), D3.js / Highcharts |
| **인수 조건** | ✅ 시군구 단위 지수 조회 ✅ 기간 필터 (1년/3년/5년) ✅ 전세가율 계산 표시 |

```
GET /api/v1/indicators/house-price-index?sigungu_id=11680&period=3y
GET /api/v1/indicators/jeonse-ratio?apt_id=12345
```

#### FEAT-008: 내 집 관리

| 항목 | 내용 |
|------|------|
| **User Story** | 로그인 사용자로서, 내 소유 아파트를 등록하고 시세 변동을 추적하고 싶다 |
| **연관 기술 스택** | FastAPI, PostgreSQL (MY_PROPERTIES) |
| **인수 조건** | ✅ 내 집 등록 (최대 5개) ✅ 6개월 시세 변동 차트 ✅ 최근 동일 단지 거래 표시 |

```
POST   /api/v1/my-properties           → 내 집 등록
GET    /api/v1/my-properties           → 내 집 목록
GET    /api/v1/my-properties/{id}/trend → 시세 추이
DELETE /api/v1/my-properties/{id}      → 삭제
```

### 2.3 P2 (부가 - 향후 로드맵)

#### FEAT-009: 주변 시세 비교

| 항목 | 내용 |
|------|------|
| **User Story** | 사용자로서, 선택한 아파트 주변 500m 내 아파트와 평당가를 비교하고 싶다 |
| **연관 기술 스택** | PostGIS (ST_DWithin), FastAPI |
| **인수 조건** | ✅ 반경 500m 내 아파트 조회 ✅ 평당가 비교 테이블 표시 |

```sql
SELECT * FROM APARTMENTS 
WHERE ST_DWithin(geometry, (SELECT geometry FROM APARTMENTS WHERE apt_id = :target), 500);
```

```
GET /api/v1/apartments/{apt_id}/nearby-comparison
```

#### FEAT-010: 가격 히트맵 오버레이

| 항목 | 내용 |
|------|------|
| **User Story** | 투자자로서, 지도 위에 지역별 가격/상승률 히트맵을 확인하고 싶다 |
| **연관 기술 스택** | 카카오맵 CustomOverlay / Mapbox Heatmap Layer, PostGIS, Redis, D3.js (색상 스케일) |
| **인수 조건** | ✅ 시군구 단위 히트맵 ✅ 상승(녹색)/하락(적색) 색상 구분 |

```
GET /api/v1/map/heatmap?type=price&region=seoul
GET /api/v1/map/heatmap?type=change_rate&period=6m
```

#### FEAT-011: AI 조건 탐색 챗봇

| 항목 | 내용 |
|------|------|
| **User Story** | 사용자로서, 자연어로 조건을 입력하여 조건에 맞는 아파트를 찾고 싶다 |
| **연관 기술 스택** | OpenAI API (GPT), FastAPI, LangChain |
| **인수 조건** | ✅ "강남역 30분, 5억 이하" 조건 파싱 ✅ 필터링 결과 반환 (추천 아님) |

> ⚠️ **고지 필수**: "투자 조언이 아닌 조건 기반 필터링입니다"

```
POST /api/v1/ai/search
Body: { "query": "강남역 30분 이내, 전용 84㎡, 5억 이하" }
```

#### FEAT-012: 부동산 뉴스 피드

| 항목 | 내용 |
|------|------|
| **User Story** | 사용자로서, 관심 지역/아파트 관련 최신 뉴스를 확인하고 싶다 |
| **연관 기술 스택** | 뉴스 크롤링, FastAPI, Redis (캐싱) |
| **인수 조건** | ✅ 외부 링크 연결 ✅ 지역별 필터 ✅ 북마크 기능 |

```
GET /api/v1/news?region=seoul&limit=20
GET /api/v1/news/{news_id}
POST /api/v1/news/{news_id}/bookmark
```

#### FEAT-013: 대출 계산기

| 항목 | 내용 |
|------|------|
| **User Story** | 사용자로서, 대출 금액/기간/상환방법을 입력하여 월 상환금을 계산하고 싶다 |
| **연관 기술 스택** | React Native (프론트 계산), FastAPI (선택) |
| **인수 조건** | ✅ 원리금균등/원금균등 상환 계산 ✅ 월별 상환 스케줄 표시 |

```
POST /api/v1/tools/loan-calculator
Body: { "principal": 300000000, "rate": 4.5, "months": 360, "type": "equal_principal_interest" }
```

---

## 3. Data Requirements

### 3.1 핵심 엔티티 관계도 (ERD)

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    ACCOUNTS     │      │     STATES      │      │     CITIES      │
│   (사용자)       │      │   (시군구)       │      │     (동)        │
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│ account_id (PK) │      │ sigungu_id (PK) │◄─────│ dong_id (PK)    │
│ email           │      │ sigungu_name    │      │ sigungu_id (FK) │
│ password        │      │ sigungu_code    │      │ dong_code       │
│ nickname        │      └─────────────────┘      │ dong_name       │
└────────┬────────┘              │                └────────┬────────┘
         │                       │                         │
         │                       ▼                         ▼
         │              ┌─────────────────┐       ┌─────────────────┐
         │              │  HOUSE_PRICES   │       │   APARTMENTS    │
         │              │  (가격지수)      │       │    (아파트)      │
         │              ├─────────────────┤       ├─────────────────┤
         │              │ index_id (PK)   │       │ apt_id (PK)     │
         │              │ sigungu_id (FK) │       │ dong_id (FK)    │
         │              │ base_ym         │       │ apt_name        │
         │              │ index_value     │       │ geometry (Point)│ ← PostGIS
         │              └─────────────────┘       │ kapt_code       │
         │                                        └────────┬────────┘
         │                                                 │
         ▼                                                 ▼
┌─────────────────┐                              ┌─────────────────┐
│ MY_PROPERTIES   │                              │  TRANSACTIONS   │
│  (내 부동산)     │                              │   (실거래)       │
├─────────────────┤                              ├─────────────────┤
│ property_id(PK) │                              │ trans_id (PK)   │
│ apt_id (FK)     │◄─────────────────────────────│ apt_id (FK)     │
│ user_id (FK)    │                              │ sigungu_id (FK) │
│ nickname        │                              │ trans_type      │
│ exclusive_area  │                              │ trans_price     │
└─────────────────┘                              │ deal_date       │
         │                                        └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FAVORITE_APARTMENTS / FAVORITE_LOCATIONS (즐겨찾기)                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 공간 데이터 처리 (PostGIS)

#### 좌표 시스템
- **SRID**: 4326 (WGS84 - GPS 좌표계)
- **데이터 타입**: `geometry(Point, 4326)` for 아파트 위치

#### 핵심 공간 함수

| 함수 | 용도 | 예시 |
|------|------|------|
| `ST_Within` | 경계 내 포함 여부 | 뷰포트 내 아파트 조회 |
| `ST_DWithin` | 거리 기반 조회 | 반경 500m 내 아파트 |
| `ST_Distance` | 두 점 사이 거리 | 역까지 거리 계산 |
| `ST_AsGeoJSON` | GeoJSON 변환 | 프론트 지도 표시용 |
| `ST_MakeEnvelope` | 경계 사각형 생성 | 지도 뷰포트 쿼리 |

#### 공간 인덱스 필수
```sql
CREATE INDEX idx_apartments_geometry ON APARTMENTS USING GIST(geometry);
```

### 3.3 외부 데이터 소스

| 데이터 | 소스 | 갱신 주기 | 연동 방식 |
|--------|------|-----------|-----------|
| 아파트 실거래가 | 국토교통부 API | 월 1회 | Batch Job |
| 아파트 기본정보 | 국토교통부 API | 분기 1회 | Batch Job |
| 주택가격지수 | KB부동산 | 월 1회 | 수동/Batch |
| 주소 좌표 | 카카오 로컬 API | 실시간 | On-demand |
| 지도 타일 | 카카오맵 JS SDK / Mapbox GL JS | 실시간 | 직접 호출 |

---

## 4. Non-Functional Requirements

### 4.1 성능 목표

| 항목 | 목표 | 측정 방법 |
|------|------|-----------|
| **지도 초기 로딩** | < 1초 (LCP) | Lighthouse, 실 디바이스 |
| **API 응답 시간** | < 200ms (p95) | Prometheus + Grafana |
| **마커 렌더링** | < 500ms (200개 기준) | 프론트 Performance API |
| **검색 자동완성** | < 100ms | API 응답 시간 |
| **동시 접속자** | 1,000명 (MVP) | 부하 테스트 (k6) |
| **데이터베이스 쿼리** | < 50ms (p95) | 슬로우 쿼리 로그 |

### 4.2 확장성 대비 (100배 트래픽 시나리오)

| 병목 지점 | 대비책 |
|-----------|--------|
| DB 조회 지연 | Redis 캐싱 (마커, 랭킹, 지표), Read Replica 도입 |
| 공간 쿼리 부하 | PostGIS 인덱스 최적화, 결과 캐싱 |
| API 서버 부하 | Horizontal Scaling (Auto Scaling Group) |
| 지도 타일 트래픽 | 카카오맵 CDN 의존 (별도 대응 불필요) |

### 4.3 보안 요구사항

| 영역 | 요구사항 | 구현 방식 |
|------|----------|-----------|
| **인증** | JWT 기반 인증 | Access Token (24h) + Refresh Token (7d) |
| **비밀번호** | 암호화 저장 | bcrypt (cost factor 12) |
| **API 보안** | Rate Limiting | 100 req/min per user |
| **HTTPS** | TLS 1.3 필수 | AWS ALB + ACM |
| **개인정보** | 최소 수집 원칙 | 이메일, 닉네임만 수집 |
| **위치정보** | 저장 안함 | 서버에 사용자 위치 미전송 |

### 4.4 가용성

| 항목 | 목표 |
|------|------|
| **SLA** | 99.5% (MVP) |
| **다운타임** | 월 3.5시간 이내 |
| **백업** | RDS 자동 백업 (7일 보존) |
| **장애 복구** | Multi-AZ 구성 (운영 단계) |

---

## 5. API & Interface Sketch

### 5.1 화면별 API 매핑

#### 홈 (대시보드)

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]                                    [Profile Icon]  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │        🔥 이번 주 핵심 지표                          │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐          │   │ → GET /api/v1/dashboard/summary
│  │  │ 거래량    │ │ 평균 상승률│ │ 평균 가격  │          │   │
│  │  │ 2,345건   │ │ +2.3%     │ │ 8.5억     │          │   │
│  │  └───────────┘ └───────────┘ └───────────┘          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  📈 상승률 TOP 5                   📉 하락률 TOP 5         │ → GET /api/v1/dashboard/rankings
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. 래미안 원베일리 +5.2%  │ 1. OO아파트 -3.1%       │  │
│  │ 2. ...                    │ 2. ...                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  🕐 최근 본 아파트                                          │ → GET /api/v1/users/me/recent-views
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [아파트1] [아파트2] [아파트3]                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ⭐ 관심 지역 바로가기                                      │ → GET /api/v1/favorites/locations
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [강남구] [서초구] [송파구]                            │  │
│  └──────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  [홈]      [지도]       [랭킹]        [마이]               │
└─────────────────────────────────────────────────────────────┘
```

#### 지도 (탐색)

```
┌─────────────────────────────────────────────────────────────┐
│  [🔍 아파트, 주소 검색...]                  [필터] [현위치] │ → GET /api/v1/search/apartments
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │                    [카카오맵]                        │   │ → 카카오맵 JS SDK
│  │                                                     │   │
│  │     📍        📍                                    │   │ → GET /api/v1/map/apartments?bounds=...
│  │           📍        📍                              │   │
│  │                                                     │   │
│  │                 📍                                   │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [내 화면에 보이는 아파트 가져오기]                   │   │ → GET /api/v1/map/apartments (batch)
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📍 래미안 원베일리                        ⭐ [+]   │   │
│  │  서울 서초구 반포동 | 2,500세대 | 2024년 준공       │   │ → GET /api/v1/apartments/{apt_id}/summary
│  │  최근 거래: 45억 (전용 84㎡) | 평당가 5,350만원     │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  [홈]      [지도]       [랭킹]        [마이]               │
└─────────────────────────────────────────────────────────────┘
```

#### 아파트 상세

```
┌─────────────────────────────────────────────────────────────┐
│  [←] 래미안 원베일리                              [⭐] [↗]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📍 서울 서초구 반포동 123-45                              │ → GET /api/v1/apartments/{apt_id}
│  준공 2024년 | 2,500세대 | 최고 35층                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [기본정보] [실거래] [가격추이] [주변비교]           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  💰 실거래 내역                           [전체] [매매]    │ → GET /api/v1/apartments/{apt_id}/transactions
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 2025.12 | 전용 84㎡ | 32층 | 45억 (매매)             │  │
│  │ 2025.11 | 전용 59㎡ | 15층 | 32억 (매매)             │  │
│  │ 2025.10 | 전용 84㎡ | 25층 | 2.5억/월120 (월세)      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  📈 평당가 추이 (최근 2년)                                  │ → GET /api/v1/apartments/{apt_id}/price-trend
│  ┌──────────────────────────────────────────────────────┐  │
│  │       ____/\                                         │  │
│  │   ___/      \___/\___                               │  │
│  │  /                                                   │  │
│  │ '24.01  '24.04  '24.07  '24.10  '25.01              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ⚠️ 본 서비스는 과거 데이터 기반 시각화이며                  │
│     투자 판단/권유를 제공하지 않습니다.                      │
│     데이터 출처: 국토교통부 | 기준: 2025.12                 │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 API 명세 요약

| 도메인 | Method | Endpoint | 설명 | Auth |
|--------|--------|----------|------|------|
| **Auth** | POST | `/api/v1/auth/register` | 회원가입 | ❌ |
| | POST | `/api/v1/auth/login` | 로그인 | ❌ |
| | POST | `/api/v1/auth/refresh` | 토큰 갱신 | ✅ |
| | POST | `/api/v1/auth/logout` | 로그아웃 | ✅ |
| **Map** | GET | `/api/v1/map/apartments` | 뷰포트 내 아파트 | ❌ |
| | GET | `/api/v1/map/heatmap` | 히트맵 데이터 | ❌ |
| **Apartments** | GET | `/api/v1/apartments/{id}` | 아파트 상세 | ❌ |
| | GET | `/api/v1/apartments/{id}/transactions` | 거래 내역 | ❌ |
| | GET | `/api/v1/apartments/{id}/price-trend` | 가격 추이 | ❌ |
| | GET | `/api/v1/apartments/{id}/nearby-comparison` | 주변 비교 | ❌ |
| **Search** | GET | `/api/v1/search/apartments` | 아파트 검색 | ❌ |
| | GET | `/api/v1/search/locations` | 지역 검색 | ❌ |
| | GET | `/api/v1/search/recent` | 최근 검색어 | ✅ |
| **Dashboard** | GET | `/api/v1/dashboard/summary` | 핵심 지표 | ❌ |
| | GET | `/api/v1/dashboard/rankings` | 랭킹 | ❌ |
| **Favorites** | GET | `/api/v1/favorites/apartments` | 관심 아파트 | ✅ |
| | POST | `/api/v1/favorites/apartments` | 추가 | ✅ |
| | DELETE | `/api/v1/favorites/apartments/{id}` | 삭제 | ✅ |
| **My Properties** | GET | `/api/v1/my-properties` | 내 집 목록 | ✅ |
| | POST | `/api/v1/my-properties` | 내 집 등록 | ✅ |
| | GET | `/api/v1/my-properties/{id}/trend` | 시세 추이 | ✅ |
| **Indicators** | GET | `/api/v1/indicators/house-price-index` | 주택가격지수 | ❌ |
| | GET | `/api/v1/indicators/jeonse-ratio` | 전세가율 | ❌ |
| **Users** | GET | `/api/v1/users/me` | 내 정보 | ✅ |
| | PATCH | `/api/v1/users/me` | 정보 수정 | ✅ |
| | GET | `/api/v1/users/me/recent-views` | 최근 본 아파트 | ✅ |

### 5.3 응답 형식 (공통)

```json
// 성공 응답
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-10T12:00:00Z",
    "data_source": "국토교통부",
    "data_period": "2025-12"
  }
}

// 에러 응답
{
  "success": false,
  "error": {
    "code": "APT_NOT_FOUND",
    "message": "해당 아파트를 찾을 수 없습니다.",
    "details": null
  }
}
```

---

## 6. Risks & Mitigation

### 6.1 기술적 리스크

| 리스크 | 영향도 | 발생 가능성 | 대응 방안 |
|--------|--------|-------------|-----------|
| **PostGIS 공간 쿼리 성능 저하** | 높음 | 중간 | 공간 인덱스 최적화, 결과 캐싱 (Redis), 줌 레벨별 쿼리 제한 |
| **지도 API 호출 제한 (카카오맵/Mapbox)** | 높음 | 낮음 | 프론트에서 디바운싱, 서버 프록시로 호출 집계, Mapbox 무료 티어 모니터링 |
| **국토부 API 장애/지연** | 중간 | 중간 | 배치 수집으로 DB 저장, 장애 시 캐시 데이터 서빙 |
| **대량 마커 렌더링 지연** | 중간 | 높음 | 클러스터링, 줌 레벨별 마커 수 제한 (200개), 가상화 |
| **JWT 토큰 탈취** | 높음 | 낮음 | 짧은 만료 시간, Refresh Token Rotation, HTTPS 필수 |

### 6.2 운영 리스크

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|-----------|
| **데이터 배치 실패** | 중간 | 배치 모니터링 (Slack 알림), 재시도 로직 |
| **서버 과부하** | 높음 | Auto Scaling, Rate Limiting, 알림 설정 |
| **DB 장애** | 높음 | Multi-AZ (운영), 자동 백업, 장애 복구 플레이북 |

---

## Appendix

### A. 기술 스택 요약

| 레이어 | 기술 |
|--------|------|
| **Frontend** | React Native (Expo), TypeScript, TailwindCSS |
| **Map** | 카카오맵 JS SDK, Mapbox GL JS (히트맵/고급 시각화용) |
| **Visualization** | D3.js (커스텀 차트), Highcharts (대시보드 차트) |
| **Backend** | FastAPI, Python 3.11+, Uvicorn, Pydantic |
| **Database** | PostgreSQL 15+ with PostGIS 3.3 |
| **Cache** | Redis (ElastiCache) |
| **Infra** | AWS (EC2, RDS, S3, ElastiCache), Docker, Nginx |
| **CI/CD** | GitHub Actions |
| **Monitoring** | Prometheus, Grafana, Slack 알림 |

### B. 마일스톤 (예시)

| Phase | 기간 | 목표 |
|-------|------|------|
| **Phase 1: MVP** | 1주 | P0 기능 완료, 내부 테스트 |
| **Phase 2: Beta** | 1주 | P1 기능, 성능 최적화 |
| **Phase 3: Launch** | 3일 | P2 일부, 운영 모니터링 |

### C. 용어 정의

| 용어 | 설명 |
|------|------|
| **전세가율** | 매매가 대비 전세가 비율 (%) |
| **평당가** | 전용면적 1평(3.3㎡) 당 가격 |
| **실거래가** | 국토부에 신고된 실제 거래 금액 |
| **주택가격지수** | 특정 시점(2017.11) 대비 가격 변동률 지수 |

---

> **⚠️ 문서 변경 이력**
> 
> | 버전 | 날짜 | 변경 내용 | 작성자 |
> |------|------|-----------|--------|
> | 1.0 | 2026-01-10 | 초안 작성 | CPO |
> | 1.1 | 2026-01-10 | 시각화 라이브러리 변경 (D3.js, Highcharts), Mapbox 추가 | CPO |