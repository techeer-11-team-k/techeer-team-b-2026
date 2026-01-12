# 협업 가이드 (Team Collaboration Notes)

> **목적**: 프론트엔드, 백엔드, DB/GIS 담당자가 개발 착수 전 합의해야 할 사항을 정리합니다.

---

## 📋 사전 합의 체크리스트

### 1. API 계약 (Contract) - 백엔드 ↔ 프론트엔드

#### 1.1 응답 형식 합의

```json
// ✅ 합의 필요: 공통 응답 래퍼
{
  "success": boolean,
  "data": T | null,
  "error": {
    "code": string,      // 예: "APT_NOT_FOUND"
    "message": string,   // 사용자에게 표시할 메시지
    "details": object    // 디버깅용 상세 정보 (optional)
  } | null,
  "meta": {
    "timestamp": string,
    "page": number,      // 페이지네이션
    "limit": number,
    "total": number
  }
}
```

**📝 Note**: 
- 에러 코드 리스트를 문서화하여 프론트에서 적절한 UI 처리 가능하게 할 것
- 페이지네이션 방식: Offset vs Cursor 기반 합의 필요 (지도 마커는 Cursor 권장)

#### 1.2 인증 헤더 합의

```
Authorization: Bearer <access_token>
```

**📝 Note**:
- 401 응답 시 프론트에서 자동 refresh 시도 후 재요청 로직 합의
- Refresh Token 저장 위치: Secure Storage (React Native)

#### 1.3 날짜/시간 형식

```
# ISO 8601 형식 사용
timestamp: "2026-01-10T12:00:00Z"
date: "2026-01-10"
yearMonth: "2026-01"
```

**📝 Note**: 
- 서버는 항상 UTC, 프론트에서 로컬 타임존 변환

---

### 2. 지도 데이터 합의 - 프론트엔드 ↔ 백엔드 ↔ DB/GIS

#### 2.1 좌표 형식

```json
// ✅ 합의 필요: GeoJSON 형식 사용
{
  "type": "Point",
  "coordinates": [127.0276, 37.4979]  // [경도, 위도] 순서!
}
```

**📝 Note**:
- ⚠️ **중요**: GeoJSON은 `[lng, lat]` 순서, 카카오맵은 `new kakao.maps.LatLng(lat, lng)` 순서
- 프론트에서 변환 로직 필요, 또는 백엔드에서 `{ lat, lng }` 형태로도 함께 제공

#### 2.2 Bounds(뷰포트) 파라미터

```
GET /api/v1/map/apartments?bounds=126.9,37.4,127.1,37.6&zoom=15

# bounds = west,south,east,north (min_lng, min_lat, max_lng, max_lat)
```

**📝 Note**:
- 줌 레벨에 따른 마커 제한 수 합의:
  - zoom ≤ 10: 클러스터만 (집계 데이터)
  - zoom 11-14: 최대 100개
  - zoom ≥ 15: 최대 200개

#### 2.3 공간 쿼리 인터페이스 (백엔드 ↔ DB)

```sql
-- DB 담당자가 준비해야 할 인덱스
CREATE INDEX idx_apartments_geometry ON APARTMENTS USING GIST(geometry);

-- 백엔드가 호출할 쿼리 예시
SELECT apt_id, apt_name, 
       ST_X(geometry) as lng, 
       ST_Y(geometry) as lat
FROM APARTMENTS
WHERE ST_Within(geometry, ST_MakeEnvelope($west, $south, $east, $north, 4326))
LIMIT 200;
```

**📝 Note**:
- 대용량 조회 시 DB 부하 → Redis 캐싱 전략 합의 필요
- 캐시 키 예시: `map:apartments:{zoom}:{tile_x}:{tile_y}`

---

### 3. 데이터 동기화 합의 - 백엔드 ↔ DB/GIS

#### 3.1 외부 API 배치 수집 주기

| 데이터 | 수집 주기 | 담당 |
|--------|-----------|------|
| 아파트 실거래가 (국토부) | 매일 02:00 | 백엔드 배치 |
| 아파트 기본정보 (국토부) | 주 1회 (일요일) | 백엔드 배치 |
| 주소 → 좌표 변환 | 신규 아파트 등록 시 | 백엔드 |
| 주택가격지수 (KB) | 월 1회 수동 | DB 담당 |

**📝 Note**:
- 배치 실패 시 Slack 알림 + 수동 재실행 가능해야 함
- 데이터 업데이트 후 관련 Redis 캐시 무효화 로직 필요

#### 3.2 데이터 정합성 체크

```sql
-- 좌표가 없는 아파트 체크 (DB 담당)
SELECT COUNT(*) FROM APARTMENTS WHERE geometry IS NULL;

-- 거래 내역과 아파트 매핑 누락 체크
SELECT t.trans_id FROM TRANSACTIONS t
LEFT JOIN APARTMENTS a ON t.apt_id = a.apt_id
WHERE a.apt_id IS NULL;
```

**📝 Note**:
- 주 1회 정합성 체크 스크립트 실행, 이상 시 알림

---

### 4. 차트 데이터 합의 - 프론트엔드 ↔ 백엔드

#### 4.1 가격 추이 차트 데이터 형식

```json
// ✅ 합의 필요
{
  "apt_id": 12345,
  "chart_type": "price_trend",
  "period": "2y",
  "data_points": [
    { "date": "2024-01", "avg_price_per_pyeong": 5200 },
    { "date": "2024-02", "avg_price_per_pyeong": 5250 },
    // ...
  ],
  "unit": "만원/평"
}
```

**📝 Note**:
- 프론트에서 사용하는 차트 라이브러리 확정 필요 (Victory Native, react-native-chart-kit 등)
- 데이터 포인트 형식에 맞춰 백엔드 응답 설계

#### 4.2 거래량 차트

```json
{
  "data_points": [
    { "month": "2024-01", "sale_count": 45, "jeonse_count": 32, "monthly_count": 12 }
  ]
}
```

---

### 5. 캐싱 전략 합의 - 백엔드 ↔ DevOps

| 데이터 | TTL | 무효화 조건 |
|--------|-----|-------------|
| 지도 마커 (뷰포트별) | 1시간 | 배치 데이터 갱신 시 |
| 아파트 상세 정보 | 24시간 | 데이터 갱신 시 |
| 대시보드 랭킹 | 6시간 | 배치 갱신 시 |
| 검색 자동완성 | 24시간 | 아파트 추가/삭제 시 |
| 사용자 세션 | Access: 24h, Refresh: 7d | 로그아웃 시 |

**📝 Note**:
- Redis 키 네이밍 컨벤션 합의 필요
- 예: `apt:{apt_id}:detail`, `dashboard:ranking:{type}`, `user:{user_id}:recent`

---

### 6. 에러 처리 합의 - 프론트엔드 ↔ 백엔드

#### 6.1 HTTP 상태 코드

| 코드 | 의미 | 프론트 처리 |
|------|------|-------------|
| 200 | 성공 | 정상 렌더링 |
| 400 | 잘못된 요청 | 입력값 검증 에러 표시 |
| 401 | 인증 실패 | 토큰 갱신 시도 → 실패 시 로그인 페이지 |
| 403 | 권한 없음 | 접근 권한 없음 알림 |
| 404 | 리소스 없음 | "데이터를 찾을 수 없습니다" |
| 429 | Rate Limit | "잠시 후 다시 시도해주세요" |
| 500 | 서버 에러 | "일시적 오류" + 재시도 버튼 |

#### 6.2 비즈니스 에러 코드

```json
{
  "APT_NOT_FOUND": "해당 아파트를 찾을 수 없습니다",
  "FAVORITE_LIMIT_EXCEEDED": "즐겨찾기는 최대 50개까지 가능합니다",
  "PROPERTY_LIMIT_EXCEEDED": "내 집은 최대 5개까지 등록 가능합니다",
  "INVALID_BOUNDS": "지도 영역이 올바르지 않습니다"
}
```

---

### 7. 보안 합의 - 전체 팀

#### 7.1 민감 정보 처리

| 정보 | 저장 위치 | 암호화 |
|------|-----------|--------|
| 비밀번호 | DB | bcrypt (cost 12) |
| JWT Secret | 환경변수 | - |
| 카카오 API Key | 프론트: 환경변수, 서버: Secrets Manager | - |
| 사용자 이메일 | DB | 평문 (법적 요건 검토 후 결정) |

**📝 Note**:
- 사용자 위치 정보(GPS)는 서버에 저장하지 않음
- 프론트에서만 현재 위치 사용, API로 전송 안 함

#### 7.2 API Rate Limiting

```
- 비로그인: 30 req/min (IP 기준)
- 로그인: 100 req/min (user_id 기준)
- 검색: 20 req/min
```

---

### 8. 테스트 데이터 합의 - 전체 팀

#### 8.1 개발/테스트 환경 데이터

```
- 아파트: 서울 강남구, 서초구 일부 (약 500개)
- 거래 내역: 최근 2년 (약 10,000건)
- 가격지수: 2020.01 ~ 현재
```

**📝 Note**:
- DB 담당자가 seed 데이터 SQL 준비
- 테스트 계정: test@test.com / Test1234!

---

## 🗓 협업 일정 제안

| 순서 | 미팅 | 참석자 | 결과물 |
|------|------|--------|--------|
| 1 | API 계약 합의 | FE + BE | OpenAPI Spec 초안 |
| 2 | DB 스키마 리뷰 | BE + DB | 인덱스 전략, 쿼리 패턴 |
| 3 | 지도 인터페이스 | FE + BE + DB | 좌표/bounds 형식 확정 |
| 4 | 캐싱 전략 | BE + DevOps | Redis 키 구조 |
| 5 | 보안 리뷰 | 전체 | 인증/인가 흐름도 |

---

## 🚨 주의사항

1. **API 변경 시 반드시 사전 공유**
   - Swagger/OpenAPI 문서 우선 업데이트
   - Breaking Change 시 deprecation 기간 필요

2. **공간 데이터 좌표 순서 주의**
   - PostGIS/GeoJSON: `[lng, lat]`
   - 카카오맵: `LatLng(lat, lng)`
   - 혼동 방지를 위해 변환 유틸리티 함수 작성

3. **법적 고지 문구 누락 금지**
   - 모든 차트/지표 화면에 필수
   - 프론트에서 공통 컴포넌트로 제공

4. **캐시 무효화 누락 주의**
   - 데이터 갱신 시 관련 캐시 삭제 로직 필수
   - 배치 작업 완료 후 캐시 clear API 호출

---

> **문서 관리**
> - 이 문서는 Notion 또는 Confluence에서 관리 권장
> - 합의 사항 변경 시 변경 이력 기록 필수
> - 각 팀별 담당자가 해당 섹션 관리
