# 비교 기능 프론트엔드-백엔드 연동 요구사항 (v2)

## 문서 메타
| 항목 | 내용 |
|------|------|
| 문서 제목 | 비교 기능 API 연동 요구사항 (개정판) |
| 작성일 | 2026-01-21 |
| 버전 | 2.0.0 |
| 문서 타입 | 기술명세서 (Tech Spec) |
| 대상 독자 | 백엔드 개발자, 프론트엔드 개발자 |
| 변경 이력 | v1 대비 지하철/학교 데이터 존재 확인, API 스펙 구체화 |

---

## 한 줄 요약
아파트 비교 기능을 위해 **다중 아파트 조회 API**와 **평형별 가격 조회 API** 2개가 필요함. 기존 상세정보 API에 지하철/학교 데이터 포함됨.

---

## 배경 & 문제 정의

### 현재 상태
- 프론트엔드에서 아파트 비교 기능 UI 구현 완료
- 현재 하드코딩된 Mock 데이터 사용 중
- 백엔드 상세정보 API 확인 결과, **지하철 및 학교 데이터 이미 존재**

### 확인된 데이터
기존 `GET /api/v1/apartments/{apt_id}/detail` 응답에 포함된 데이터:
```json
{
  "subway_line": "1호선",
  "subway_station": "괴정역",
  "subway_time": "5~10분이내",
  "educationFacility": "초등학교(괴정초등학교) 대학교(동주대학교)",
  "total_household_cnt": 182,
  "total_parking_cnt": 162,
  "use_approval_date": "2015-08-06"
}
```

### 문제점
1. ✅ ~~지하철 정보~~ → 이미 존재
2. ✅ ~~학교 정보~~ → 존재하나 파싱 필요 (백엔드에서 처리 예정)
3. ❌ 다중 아파트 동시 조회 API 부재
4. ❌ 평형별 가격 정보 조회 API 부재

---

## 목표 / 비목표

### 목표
- [ ] 아파트 비교 기능의 백엔드 API 연동
- [ ] 실시간 데이터 기반 비교 분석 제공
- [ ] 사용자 맞춤 비교 목록 관리
- [ ] 학교 정보 구조화 (백엔드 파싱)

### 비목표
- 비교 결과 공유 기능 (추후 개발)
- 비교 결과 PDF 다운로드 (추후 개발)
- 비교 히스토리 저장 (추후 개발)

---

## 범위 (Scope)

### In Scope
- 아파트 검색 및 선택
- 1:1 비교 및 다수 비교 (최대 8개)
- 평형별 가격 비교
- 주변 학교 정보 표시 (백엔드에서 파싱하여 제공)

### Out of Scope
- AI 기반 비교 추천
- 실시간 알림

---

## 요구사항

### 기능 요구사항 (FR)

#### FR-01: 다중 아파트 비교 조회 API
| 항목 | 내용 |
|------|------|
| 설명 | 여러 아파트를 한 번에 조회하여 비교 데이터 반환 |
| 입력 | 아파트 ID 배열 (최대 8개) |
| 출력 | 아파트별 상세 정보 + 비교용 통계 + 구조화된 학교 정보 |
| 우선순위 | 🔴 필수 |

**필요 데이터**:
```typescript
- 아파트 기본 정보 (id, 이름, 주소, 지역)
- 가격 정보 (매매가, 전세가, 전세가율)
- 평당가
- 세대수 (total_household_cnt)
- 주차공간 (total_parking_cnt)
- 세대당 주차 (parking_per_household)
- 건축연도 (use_approval_date)
- 지하철역 (subway_line, subway_station, subway_time)
- 학교 정보 (구조화된 JSON 배열)
```

#### FR-02: 평형별 가격 조회 API
| 항목 | 내용 |
|------|------|
| 설명 | 특정 아파트의 평형(전용면적)별 가격 정보 조회 |
| 입력 | 아파트 ID |
| 출력 | 평형 목록 + 각 평형별 가격 정보 |
| 우선순위 | 🔴 필수 |

**필요 데이터**:
```typescript
- 평형 타입 (예: "24평형", "32평형")
- 전용면적 (m²)
- 최근 매매가
- 최근 전세가
- 평당가
- 전세가율
```

#### FR-03: 학교 정보 파싱 및 구조화
| 항목 | 내용 |
|------|------|
| 설명 | educationFacility 텍스트를 파싱하여 구조화된 JSON으로 제공 |
| 입력 | "초등학교(괴정초등학교) 중학교(괴정중학교)" 형태의 텍스트 |
| 출력 | 학교 유형별 배열 |
| 우선순위 | 🟡 중간 |
| 담당 | 백엔드 |

**출력 형식**:
```json
{
  "schools": {
    "elementary": [
      { "name": "괴정초등학교" }
    ],
    "middle": [
      { "name": "괴정중학교" }
    ],
    "high": [
      { "name": "부산고등학교" }
    ]
  }
}
```

#### FR-04: 아파트 검색 API (기존 활용)
| 항목 | 내용 |
|------|------|
| 설명 | 아파트명/지역으로 검색 |
| 엔드포인트 | `GET /api/v1/search/apartments` (기존) |
| 우선순위 | ✅ 기존 API 활용 |

### 비기능 요구사항 (NFR)

| ID | 요구사항 | 기준 |
|----|----------|------|
| NFR-01 | 응답 속도 | 다중 아파트 조회 < 1초 |
| NFR-02 | 캐싱 | 비교 데이터 5분 캐시 |
| NFR-03 | 페이지네이션 | 검색 결과 최대 20개/페이지 |
| NFR-04 | 에러 처리 | 일부 아파트 조회 실패 시에도 성공한 데이터 반환 |

---

## 용어/정의 (Glossary)

| 용어 | 정의 |
|------|------|
| 평형 | 전용면적을 평으로 환산한 값 (1평 ≈ 3.3058m²) |
| 평당가 | 매매가 / 평수 |
| 전세가율 | (전세가 / 매매가) × 100 |
| 도보시간 | 성인 기준 분 단위 (80m/분) |
| 세대당 주차 | total_parking_cnt / total_household_cnt |

---

## API/인터페이스 설계

### API-01: 다중 아파트 비교 조회
```
POST /api/v1/apartments/compare
```

**Request Body**:
```json
{
  "apartment_ids": [1, 2, 3, 4, 5]
}
```

**Response**:
```json
{
  "apartments": [
    {
      "id": 1,
      "name": "괴정센트럴자이",
      "region": "부산광역시 사하구",
      "address": "부산광역시 사하구 괴정동 258",
      "price": 4.5,
      "jeonse": 2.8,
      "jeonse_rate": 62.2,
      "price_per_pyeong": 0.82,
      "households": 182,
      "parking_total": 162,
      "parking_per_household": 0.89,
      "build_year": 2015,
      "subway": {
        "line": "1호선",
        "station": "괴정역",
        "walking_time": "5~10분이내"
      },
      "schools": {
        "elementary": [
          { "name": "괴정초등학교" }
        ],
        "middle": [
          { "name": "괴정중학교" }
        ],
        "high": [
          { "name": "부산고등학교" }
        ]
      }
    }
  ]
}
```

**에러 처리**:
- 200: 정상 (일부 실패해도 성공한 데이터 반환)
- 400: 잘못된 요청 (ID 개수 초과, 형식 오류)
- 404: 모든 아파트를 찾을 수 없음

### API-02: 평형별 가격 조회
```
GET /api/v1/apartments/{apt_id}/pyeong-prices
```

**Response**:
```json
{
  "apartment_id": 1,
  "apartment_name": "괴정센트럴자이",
  "pyeong_options": [
    {
      "pyeong_type": "24평형",
      "area_m2": 84.0,
      "recent_price": 3.8,
      "recent_jeonse": 2.2,
      "price_per_pyeong": 0.79,
      "jeonse_rate": 57.9,
      "transaction_date": "2026-01-15"
    },
    {
      "pyeong_type": "32평형",
      "area_m2": 106.0,
      "recent_price": 4.9,
      "recent_jeonse": 3.1,
      "price_per_pyeong": 0.85,
      "jeonse_rate": 63.3,
      "transaction_date": "2026-01-10"
    }
  ]
}
```

**에러 처리**:
- 200: 정상
- 404: 아파트를 찾을 수 없음
- 404: 거래 데이터 없음 (빈 배열 반환)

---

## 데이터 모델 매핑

### 기존 테이블 활용
| 프론트엔드 필드 | 백엔드 소스 | 비고 |
|----------------|------------|------|
| id | apartments.id | ✅ |
| name | apartments.name | ✅ |
| region | states.sido + states.sigungu | ✅ |
| address | apart_details.road_address | ✅ |
| price | sales.price (최근 거래) | ✅ |
| jeonse | rents.deposit (최근 거래) | ✅ |
| jeonse_rate | (jeonse / price) × 100 | ✅ 계산 |
| price_per_pyeong | price / (area ÷ 3.3058) | ✅ 계산 |
| households | apart_details.total_household_cnt | ✅ |
| parking_total | apart_details.total_parking_cnt | ✅ |
| parking_per_household | parking / households | ✅ 계산 |
| build_year | apart_details.use_approval_date | ✅ |
| subway_line | apart_details.subway_line | ✅ |
| subway_station | apart_details.subway_station | ✅ |
| subway_time | apart_details.subway_time | ✅ |
| schools | apart_details.educationFacility | ✅ **파싱 필요** |

### 데이터 처리 로직

#### 1. 최근 가격 집계
```sql
-- 매매가: 최근 3개월 평균
SELECT AVG(price) 
FROM sales 
WHERE apt_id = ? 
  AND transaction_date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)

-- 전세가: 최근 3개월 평균
SELECT AVG(deposit) 
FROM rents 
WHERE apt_id = ? 
  AND transaction_date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
```

#### 2. 학교 정보 파싱 (백엔드)
```python
import re

def parse_education_facility(text: str) -> dict:
    if not text:
        return {"elementary": [], "middle": [], "high": []}
    
    schools = {
        "elementary": [],
        "middle": [],
        "high": []
    }
    
    # 초등학교 파싱
    elementary = re.findall(r'초등학교\(([^)]+)\)', text)
    schools["elementary"] = [{"name": name} for name in elementary]
    
    # 중학교 파싱
    middle = re.findall(r'중학교\(([^)]+)\)', text)
    schools["middle"] = [{"name": name} for name in middle]
    
    # 고등학교 파싱
    high = re.findall(r'고등학교\(([^)]+)\)', text)
    schools["high"] = [{"name": name} for name in high]
    
    return schools
```

#### 3. 평형별 가격 집계
```sql
-- 전용면적별 최근 거래가
SELECT 
  ROUND(area / 3.3058) as pyeong,
  CONCAT(ROUND(area / 3.3058), '평형') as pyeong_type,
  area as area_m2,
  price as recent_price,
  transaction_date
FROM sales
WHERE apt_id = ?
  AND transaction_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
GROUP BY pyeong
ORDER BY transaction_date DESC
```

---

## 기존 API 활용 현황

### 활용 가능
| 기능 | 기존 API | 활용도 |
|------|----------|--------|
| 아파트 검색 | `GET /api/v1/search/apartments` | ✅ 그대로 사용 |
| 아파트 상세 | `GET /api/v1/apartments/{id}/detail` | ✅ 데이터 소스로 활용 |
| 유사 아파트 | `GET /api/v1/apartments/{id}/similar` | ⚠️ 추후 확장 시 활용 |
| 가격 추이 | `GET /api/v1/apartments/{id}/price-trend` | ⚠️ 추후 확장 시 활용 |

### 신규 개발 필요
| 기능 | 제안 API | 우선순위 |
|------|----------|----------|
| 다중 아파트 비교 | `POST /api/v1/apartments/compare` | 🔴 필수 |
| 평형별 가격 | `GET /api/v1/apartments/{id}/pyeong-prices` | 🔴 필수 |

---

## 테스트 플랜

### 다중 아파트 비교 API
| ID | 시나리오 | 입력 | 기대 결과 |
|----|----------|------|-----------|
| TC-01 | 단일 아파트 조회 | apt_ids: [1] | 1개 아파트 데이터 반환 |
| TC-02 | 다중 아파트 조회 | apt_ids: [1,2,3,4,5] | 5개 아파트 데이터 반환 |
| TC-03 | 최대 개수 조회 | apt_ids: 8개 | 8개 아파트 데이터 반환 |
| TC-04 | 초과 개수 조회 | apt_ids: 9개 | 400 에러 반환 |
| TC-05 | 일부 존재하지 않음 | apt_ids: [1, 99999] | 200, 1개 데이터 반환 |
| TC-06 | 모두 존재하지 않음 | apt_ids: [99999] | 404 에러 반환 |
| TC-07 | 학교 정보 파싱 | educationFacility 있음 | 구조화된 schools 객체 |
| TC-08 | 학교 정보 없음 | educationFacility null | 빈 schools 객체 |

### 평형별 가격 API
| ID | 시나리오 | 입력 | 기대 결과 |
|----|----------|------|-----------|
| TC-09 | 평형별 가격 조회 | apt_id: 1 | 평형 목록 반환 |
| TC-10 | 거래 데이터 없음 | apt_id: 1 | 빈 배열 반환 |
| TC-11 | 존재하지 않는 아파트 | apt_id: 99999 | 404 에러 반환 |

---

## 구현 우선순위

### Phase 1 (필수)
1. **다중 아파트 비교 API** (`POST /api/v1/apartments/compare`)
   - 기본 정보 (이름, 주소, 지역)
   - 가격 정보 (매매가, 전세가, 전세가율, 평당가)
   - 시설 정보 (세대수, 주차)
   - 지하철 정보 (이미 존재)

2. **평형별 가격 API** (`GET /api/v1/apartments/{id}/pyeong-prices`)
   - 전용면적별 최근 거래가
   - 평형 타입 구분

### Phase 2 (선택)
3. **학교 정보 파싱**
   - educationFacility 텍스트 파싱
   - 구조화된 JSON 제공

---

## 오픈 이슈 & 리스크

| ID | 이슈 | 영향 | 담당 | 상태 |
|----|------|------|------|------|
| ~~ISS-01~~ | ~~지하철역 거리 데이터 존재 여부~~ | - | 백엔드 | ✅ 해결됨 |
| ~~ISS-02~~ | ~~학교 데이터 소스~~ | - | 백엔드 | ✅ 해결됨 |
| ISS-03 | 학교 정보 파싱 로직 | 학교 비교 기능 제한 | 백엔드 | ⬜ Phase 2 |
| ISS-04 | 평형별 가격 집계 기간 | 데이터 정확도 | 백엔드 | ⬜ 확인 필요 |
| ISS-05 | 거래 데이터 없는 아파트 처리 | UI 표시 | 프론트엔드 | ⬜ |
| ISS-06 | 다중 조회 시 성능 | 응답 속도 | 백엔드 | ⬜ 모니터링 필요 |

---

## TODO

| 작업 | 담당 | 우선순위 | 예상 기간 | 상태 |
|------|------|----------|-----------|------|
| 다중 아파트 비교 API 개발 | 백엔드 | 높음 | 2일 | ⬜ |
| 평형별 가격 API 개발 | 백엔드 | 높음 | 1일 | ⬜ |
| 학교 정보 파싱 로직 구현 | 백엔드 | 중간 | 0.5일 | ⬜ |
| API 연동 (비교 기능) | 프론트엔드 | 높음 | 1일 | ⬜ |
| 에러 핸들링 구현 | 프론트엔드 | 중간 | 0.5일 | ⬜ |
| 로딩 상태 UI | 프론트엔드 | 중간 | 0.5일 | ⬜ |
| 통합 테스트 | QA | 중간 | 1일 | ⬜ |

---

## 확인 질문

### ✅ 해결된 질문
1. ~~지하철역 거리 데이터가 `apart_details` 테이블에 존재하는가?~~
   - **답변**: 존재함 (`subway_line`, `subway_station`, `subway_time`)

2. ~~학교 데이터는 어떻게 수집할 예정인가?~~
   - **답변**: 이미 `educationFacility` 필드에 텍스트로 저장됨

3. ~~학교 정보 파싱을 어디서 처리할 것인가?~~
   - **답변**: 백엔드에서 처리 (정규표현식 파싱)

### ⬜ 확인 필요
4. **평형별 가격 집계 기간**은 얼마로 할 것인가?
   - [ ] 최근 1개월
   - [ ] 최근 3개월 (권장)
   - [ ] 최근 6개월
   - [ ] 최근 12개월

5. **다중 아파트 조회 최대 개수** 8개가 적절한가?
   - [ ] 예 (현재 UI 기준)
   - [ ] 아니오 (다른 제안: ___ 개)

6. **비교 데이터 캐시 TTL** 5분이 적절한가?
   - [ ] 예
   - [ ] 아니오 (다른 제안: ___ 분)

7. **거래 데이터가 없는 아파트**는 어떻게 처리할 것인가?
   - [ ] API에서 제외 (필터링)
   - [ ] null 값으로 반환
   - [ ] "-" 문자열로 반환

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 1.0.0 | 2026-01-21 | 초안 작성 |
| 2.0.0 | 2026-01-21 | 지하철/학교 데이터 존재 확인, 학교 파싱 백엔드 처리 결정, API 스펙 구체화 |

---

## 참고 자료

- [백엔드 기능 문서](/.document/backend-features.md)
- 프론트엔드 컴포넌트: `components/views/Comparison.tsx`
- 기존 API: `GET /api/v1/apartments/{apt_id}/detail`
