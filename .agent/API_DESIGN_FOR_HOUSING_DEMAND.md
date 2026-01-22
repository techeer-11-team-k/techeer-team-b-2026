# 주택 수요 페이지 API 설계 문서

## 1. 프론트엔드 데이터 형식 분석

### 1.1 거래량 그래프 (LineChart - recharts)

#### 연도별 데이터 형식
```typescript
// 현재 사용 중인 형식
const yearlyData = [
  { period: '2020', value: 1250 },
  { period: '2021', value: 1380 },
  { period: '2022', value: 1520 },
  // ...
];

// LineChart 사용법
<LineChart data={yearlyData}>
  <Line dataKey="value" />
  <XAxis dataKey="period" />
</LineChart>
```

**필요한 API 응답 형식:**
```json
{
  "success": true,
  "data": [
    { "period": "2020", "value": 1250 },
    { "period": "2021", "value": 1380 },
    { "period": "2022", "value": 1520 }
  ]
}
```

#### 월별 데이터 형식 (여러 년도 비교)
```typescript
// 현재 사용 중인 형식
const monthlyData = [
  { period: '1월', 2023: 140, 2024: 150, 2025: 160 },
  { period: '2월', 2023: 135, 2024: 147, 2025: 160 },
  // ...
];

// LineChart 사용법 (동적 키)
monthlyYears.map((year) => (
  <Line key={year} dataKey={year} />
))
```

**필요한 API 응답 형식:**
```json
{
  "success": true,
  "data": [
    { "period": "1월", "2023": 140, "2024": 150, "2025": 160 },
    { "period": "2월", "2023": 135, "2024": 147, "2025": 160 }
  ],
  "years": [2023, 2024, 2025]  // 동적 키 목록
}
```

### 1.2 시장 국면 분석

```typescript
// 현재 사용 중인 형식
const marketPhases = [
  { 
    region: '서울 강남', 
    phase: '상승기', 
    trend: 'up', 
    change: '+1.5%', 
    color: 'text-brand-red', 
    bg: 'bg-red-50' 
  },
  // ...
];
```

**필요한 API 응답 형식:**
```json
{
  "success": true,
  "data": [
    {
      "region": "서울 강남",
      "phase": "상승기",
      "trend": "up",
      "change": "+1.5%",
      "price_change_rate": 1.5,
      "volume_change_rate": 2.3
    }
  ]
}
```

**참고:** `color`와 `bg`는 프론트엔드에서 `phase` 값에 따라 결정됨
- 상승기: `text-brand-red`, `bg-red-50`
- 회복기: `text-orange-500`, `bg-orange-50`
- 침체기: `text-brand-blue`, `bg-blue-50`
- 후퇴기: `text-slate-500`, `bg-slate-100`

### 1.3 주택 가격 지수 (KoreaHexMap - Highcharts Tilemap)

```typescript
// 현재 사용 중인 형식
interface RegionData {
  id?: string;
  name: string;
  value: number;
}

// 컴포넌트 내부에서 좌표와 병합
const mergedData = mergeCoordinatesWithData(coordinates, apiData);
```

**필요한 API 응답 형식:**
```json
{
  "success": true,
  "data": [
    { "id": "KR-11", "name": "서울", "value": 85.5 },
    { "id": "KR-28", "name": "인천", "value": 72.3 },
    { "id": "KR-41", "name": "경기", "value": 78.9 }
  ],
  "region_type": "전국",
  "index_type": "APT",
  "base_ym": "202501"
}
```

**참고:** 
- 좌표 데이터는 프론트엔드에 하드코딩되어 있음
- `id`는 선택사항 (없으면 `name`으로 매칭)
- `value`는 0~100 범위의 지수 값

### 1.4 인구 순이동 (MigrationSankey - Highcharts Sankey)

```typescript
// 현재 사용 중인 형식
const migrationData = [
  { name: '경기', value: 4500, label: '순유입' },
  { name: '인천', value: 1200, label: '순유입' },
  { name: '서울', value: -3500, label: '순유출' },
  { name: '부산', value: -1500, label: '순유출' }
];

// 컴포넌트 내부에서 Sankey 형식으로 변환
// - value > 0: 순유입 (도착지)
// - value < 0: 순유출 (출발지)
```

**필요한 API 응답 형식 (간단한 형식):**
```json
{
  "success": true,
  "data": [
    { "name": "경기", "value": 4500, "label": "순유입" },
    { "name": "인천", "value": 1200, "label": "순유입" },
    { "name": "서울", "value": -3500, "label": "순유출" },
    { "name": "부산", "value": -1500, "label": "순유출" }
  ],
  "region_type": "전국",
  "base_ym": "202501",
  "period_months": 3
}
```

**또는 Sankey 직접 형식 (선택사항):**
```json
{
  "success": true,
  "nodes": [
    { "id": "서울", "name": "서울" },
    { "id": "경기", "name": "경기" }
  ],
  "links": [
    { "from": "서울", "to": "경기", "weight": 3500 }
  ]
}
```

---

## 2. API 설계

### 2.1 지역별 월별/년도별 거래량 조회

**엔드포인트:** `GET /api/v1/statistics/transaction-volume`

**Query Parameters:**
- `region_type` (required): "전국" | "수도권" | "지방5대광역시"
- `period_type` (required): "monthly" | "yearly"
- `year_range` (optional, monthly일 때만): 2 | 3 | 5 (기본값: 3)
- `start_year` (optional, yearly일 때만): 시작 연도 (기본값: 5년 전)
- `end_year` (optional, yearly일 때만): 종료 연도 (기본값: 현재 연도)
- `transaction_type` (optional): "sale" | "rent" (기본값: "sale")

**응답 형식 (월별):**
```json
{
  "success": true,
  "data": [
    { "period": "1월", "2023": 140, "2024": 150, "2025": 160 },
    { "period": "2월", "2023": 135, "2024": 147, "2025": 160 }
  ],
  "years": [2023, 2024, 2025],
  "region_type": "전국",
  "period_type": "monthly",
  "year_range": 3
}
```

**응답 형식 (년도별):**
```json
{
  "success": true,
  "data": [
    { "period": "2020", "value": 1250 },
    { "period": "2021", "value": 1380 },
    { "period": "2022", "value": 1520 }
  ],
  "region_type": "전국",
  "period_type": "yearly",
  "start_year": 2020,
  "end_year": 2025
}
```

**구현 로직:**
1. `region_type`에 따라 지역 필터링
   - 전국: 필터 없음
   - 수도권: `city_name IN ('서울특별시', '경기도', '인천광역시')`
   - 지방5대광역시: `city_name IN ('부산광역시', '대구광역시', '광주광역시', '대전광역시', '울산광역시')`
2. `period_type`에 따라 집계
   - monthly: `extract('year', date_field)`와 `extract('month', date_field)` 사용 (인덱스 활용 가능)
     - Python에서 `f"{int(row.month)}월"` 형식으로 변환
     - 여러 년도 데이터를 동적 키 형식으로 변환: `{period: "1월", 2023: 140, 2024: 150}`
   - yearly: `extract('year', date_field)` → 년도별 집계
3. `year_range`에 따라 최근 N년 데이터만 조회
4. 필터 조건 (기존 코드 패턴과 일치):
   - `is_canceled == False` (sale만)
   - `(is_deleted == False) | (is_deleted.is_(None))`
   - `contract_date.isnot(None)` 또는 `deal_date.isnot(None)`
   - `or_(remarks != "더미", remarks.is_(None))` (더미 데이터 제외)

---

### 2.2 지역별 시장 국면 분석

**엔드포인트:** `GET /api/v1/statistics/market-phase`

**Query Parameters:**
- `region_type` (required): "전국" | "수도권" | "지방5대광역시"
- `region_id` (optional): 특정 지역 ID (지정 시 해당 지역만 조회)
- `period_months` (optional): 비교 기간 (개월, 기본값: 2)
- `transaction_type` (optional): "sale" | "rent" (기본값: "sale")

**응답 형식:**
```json
{
  "success": true,
  "data": [
    {
      "region_id": 1,
      "region_name": "서울 강남",
      "city_name": "서울특별시",
      "phase": "상승기",
      "trend": "up",
      "change": "+1.5%",
      "price_change_rate": 1.5,
      "volume_change_rate": 2.3,
      "recent_price": 12500.5,
      "previous_price": 12315.2,
      "recent_volume": 150,
      "previous_volume": 147
    }
  ],
  "region_type": "전국",
  "period_months": 2
}
```

**시장 국면 분류 로직:**
```
가격 변화율 > 0 && 거래량 변화율 > 0 → 상승기 (up)
가격 변화율 > 0 && 거래량 변화율 < 0 → 회복기 (up)
가격 변화율 < 0 && 거래량 변화율 < 0 → 침체기 (down)
가격 변화율 < 0 && 거래량 변화율 > 0 → 후퇴기 (down)
```

**구현 로직:**
1. 최근 `period_months`개월 평균 가격/거래량 계산
   - 가격: 평당가 기준 (`trans_price / exclusive_area * 3.3`)
   - 거래량: 거래 건수 (`func.count(trans_id)`)
2. 이전 `period_months`개월 평균 가격/거래량 계산
3. 변화율 계산: `((recent - previous) / previous) * 100`
4. 변화율 기반으로 시장 국면 분류
5. 지역별로 정렬 (시도 → 시군구)
6. 필터 조건 (기존 코드 패턴과 일치):
   - `is_canceled == False` (sale만)
   - `(is_deleted == False) | (is_deleted.is_(None))`
   - `contract_date.isnot(None)` 또는 `deal_date.isnot(None)`
   - `or_(remarks != "더미", remarks.is_(None))` (더미 데이터 제외)

---

### 2.3 지역 유형별 주택 가격 지수 조회

**엔드포인트:** `GET /api/v1/statistics/hpi/by-region-type`

**Query Parameters:**
- `region_type` (required): "전국" | "수도권" | "지방5대광역시"
- `index_type` (optional): "APT" | "HOUSE" | "ALL" (기본값: "APT")
- `base_ym` (optional): 기준 년월 (YYYYMM, 기본값: 최신)

**응답 형식:**
```json
{
  "success": true,
  "data": [
    { 
      "id": "KR-11", 
      "name": "서울", 
      "value": 85.5,
      "index_change_rate": 0.5
    },
    { 
      "id": "KR-28", 
      "name": "인천", 
      "value": 72.3,
      "index_change_rate": -0.2
    }
  ],
  "region_type": "전국",
  "index_type": "APT",
  "base_ym": "202501"
}
```

**구현 로직:**
1. `region_type`에 따라 지역 필터링
2. `base_ym`에 해당하는 최신 HPI 데이터 조회
   - 최신 `base_ym` 찾기: 최대 12개월 전까지 역순으로 검색
3. 지역별로 그룹화하여 평균 HPI 계산 (또는 각 지역별 HPI 반환)
4. `house_scores` 테이블과 `states` 테이블 조인
5. 지역명 정규화: `city_name`을 프론트엔드 형식으로 변환
   - "서울특별시" → "서울"
   - "부산광역시" → "부산"
   - "경기도" → "경기"
   - 기타: 그대로 사용

**지역명 매핑:**
- `states.city_name` → 정규화 후 `name` 필드로 사용
- `id`는 선택사항 (프론트엔드에서 좌표 매칭용, 현재는 사용하지 않음)

---

### 2.4 지역 유형별 인구 순이동 조회

**엔드포인트:** `GET /api/v1/statistics/population-movements/by-region-type`

**Query Parameters:**
- `region_type` (required): "전국" | "수도권" | "지방5대광역시"
- `start_ym` (optional): 시작 년월 (YYYYMM, 기본값: 최근 3개월 전)
- `end_ym` (optional): 종료 년월 (YYYYMM, 기본값: 최신)
- `aggregate` (optional): "sum" | "avg" (기본값: "sum") - 기간별 합계 또는 평균

**응답 형식:**
```json
{
  "success": true,
  "data": [
    { 
      "name": "경기", 
      "value": 4500, 
      "label": "순유입",
      "in_migration": 5000,
      "out_migration": 500,
      "net_migration": 4500
    },
    { 
      "name": "서울", 
      "value": -3500, 
      "label": "순유출",
      "in_migration": 2000,
      "out_migration": 5500,
      "net_migration": -3500
    }
  ],
  "region_type": "전국",
  "start_ym": "202410",
  "end_ym": "202501",
  "period_months": 3
}
```

**구현 로직:**
1. `region_type`에 따라 지역 필터링
2. `start_ym` ~ `end_ym` 기간의 `population_movements` 데이터 조회
3. 시도 레벨로 그룹화 (`State.city_name` 사용)
4. `aggregate`에 따라 합계 또는 평균 계산
   - sum: `func.sum(PopulationMovement.net_migration)`
   - avg: `func.avg(PopulationMovement.net_migration)`
5. `net_migration` 기준으로 정렬 (큰 순서대로)
6. `value` = `net_migration`, `label` = `net_migration > 0 ? "순유입" : "순유출"`
7. 지역명 정규화: `city_name`을 프론트엔드 형식으로 변환

---

### 2.5 Sankey 다이어그램용 인구 이동 데이터 (선택사항)

**엔드포인트:** `GET /api/v1/statistics/population-movements/sankey`

**Query Parameters:**
- `region_type` (required): "전국" | "수도권" | "지방5대광역시"
- `base_ym` (optional): 기준 년월 (YYYYMM, 기본값: 최신)

**응답 형식:**
```json
{
  "success": true,
  "nodes": [
    { "id": "서울", "name": "서울" },
    { "id": "경기", "name": "경기" },
    { "id": "인천", "name": "인천" }
  ],
  "links": [
    { "from": "서울", "to": "경기", "weight": 3500 },
    { "from": "서울", "to": "인천", "weight": 500 }
  ],
  "region_type": "전국",
  "base_ym": "202501"
}
```

**구현 로직:**
1. 순유출 지역과 순유입 지역 식별
2. 순유출 지역에서 순유입 지역으로의 이동 링크 생성
3. 가중치 계산 (순유입 비율에 따라 분배)

**참고:** 현재 프론트엔드에서 자동으로 Sankey 형식으로 변환하므로, 이 API는 선택사항입니다.

---

## 3. 지역 유형 정의 및 매핑

### 3.1 지역 유형별 city_name 목록

**전국:**
- 필터 없음 (모든 지역)

**수도권:**
- `city_name IN ('서울특별시', '경기도', '인천광역시')`

**지방5대광역시:**
- `city_name IN ('부산광역시', '대구광역시', '광주광역시', '대전광역시', '울산광역시')`

### 3.2 지역명 정규화

API에서 반환하는 `name` 필드는 `states.city_name`을 사용하되, 프론트엔드에서 사용하는 이름과 일치하도록 정규화:

**정규화 매핑:**
- "서울특별시" → "서울"
- "부산광역시" → "부산"
- "대구광역시" → "대구"
- "인천광역시" → "인천"
- "광주광역시" → "광주"
- "대전광역시" → "대전"
- "울산광역시" → "울산"
- "경기도" → "경기"
- 기타: 그대로 사용

**구현 예시:**
```python
def normalize_city_name(city_name: str) -> str:
    """시도명을 프론트엔드 형식으로 정규화"""
    mapping = {
        "서울특별시": "서울",
        "부산광역시": "부산",
        "대구광역시": "대구",
        "인천광역시": "인천",
        "광주광역시": "광주",
        "대전광역시": "대전",
        "울산광역시": "울산",
        "경기도": "경기",
    }
    return mapping.get(city_name, city_name)
```

---

## 4. 구현 우선순위

1. **높음:** `GET /api/v1/statistics/transaction-volume` - 거래량 그래프 (가장 중요)
2. **높음:** `GET /api/v1/statistics/market-phase` - 시장 국면 분석
3. **중간:** `GET /api/v1/statistics/hpi/by-region-type` - 주택 가격 지수
4. **중간:** `GET /api/v1/statistics/population-movements/by-region-type` - 인구 순이동
5. **낮음:** `GET /api/v1/statistics/population-movements/sankey` - Sankey 직접 형식 (선택사항)

---

## 5. 성능 최적화 고려사항

1. **캐싱:** 모든 API는 Redis 캐싱 적용 (TTL: 6시간)
2. **인덱스:** 
   - `states.city_name` 인덱스 확인
   - `sales.contract_date` 인덱스 있음 (확인됨)
   - `rents.deal_date` 인덱스 있음 (확인됨)
   - `population_movements.region_id`, `population_movements.base_ym` 인덱스 있음 (확인됨)
3. **집계 최적화:** 
   - 월별/년도별 집계는 DB에서 수행 (프론트엔드에서 변환 최소화)
   - `extract` 방식 사용으로 인덱스 활용 가능 (기존 코드 패턴과 일치)
4. **병렬 쿼리:** 여러 기간 데이터 조회 시 `asyncio.gather()` 사용
5. **필터 조건:** 기존 코드 패턴과 일치하도록 구현 (더미 데이터 제외 등)

---

## 6. 에러 처리

- `region_type`이 유효하지 않은 경우: 400 Bad Request
- 데이터가 없는 경우: 빈 배열 반환 (200 OK)
- `base_ym`이 유효하지 않은 경우: 400 Bad Request

---

## 7. 테스트 케이스

1. 전국 월별 거래량 조회 (3년) - 동적 키 형식 확인
2. 수도권 년도별 거래량 조회
3. 지방5대광역시 시장 국면 분석 - 가격/거래량 변화율 확인
4. 전국 주택 가격 지수 조회 - 지역명 정규화 확인
5. 수도권 인구 순이동 조회 - 시도 레벨 집계 확인

## 8. 실제 DB 구조 및 외부 API 확인 사항

### 8.1 DB 구조 확인 완료
- ✅ `sales.contract_date`: Date 타입 (인덱스 있음)
- ✅ `rents.deal_date`: Date 타입 (인덱스 있음)
- ✅ `house_scores.base_ym`: CHAR(6) 타입 (YYYYMM 형식)
- ✅ `population_movements.base_ym`: CHAR(6) 타입 (YYYYMM 형식)
- ✅ `population_movements.net_migration`: Integer 타입
- ✅ `states.city_name`: String(40) 타입 ("서울특별시" 형식)

### 8.2 외부 API 확인 완료
- ✅ KOSIS API: 이미 DB에 저장됨 (직접 사용 안 함)
- ✅ REB API: 이미 DB에 저장됨 (직접 사용 안 함)
- ✅ 설계 문서는 DB 구조만 고려하면 됨

### 8.3 기존 코드 패턴 확인 완료
- ✅ 월별 집계: `extract('year', date_field)`, `extract('month', date_field)` 사용
- ✅ 지역 필터링: `State.city_name` 사용
- ✅ 필터 조건: `is_canceled`, `is_deleted`, `remarks` 체크
