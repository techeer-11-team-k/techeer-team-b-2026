# API 설계 문서 검토 보고서

## 검토 개요

실제 DB 구조와 외부 API 응답 형식을 확인하여 설계 문서의 정확성을 검증했습니다.

---

## 1. DB 구조 확인 결과

### 1.1 거래량 데이터 (sales, rents 테이블)

**실제 DB 구조:**
- `sales.contract_date`: `Date` 타입 (인덱스 있음)
- `sales.trans_price`: `Integer` 타입
- `sales.exclusive_area`: `Numeric(7, 2)` 타입
- `sales.is_canceled`: `Boolean` 타입
- `sales.is_deleted`: `Optional[Boolean]` 타입
- `rents.deal_date`: `Date` 타입 (인덱스 있음)
- `rents.deposit_price`: `Integer` 타입
- `rents.monthly_rent`: `Integer` 타입
- `rents.exclusive_area`: `Numeric(7, 2)` 타입

**설계 문서 검토:**
- ✅ 필드명 일치: `contract_date`, `deal_date` 모두 정확
- ✅ 데이터 타입 일치: `Date`, `Integer`, `Numeric` 모두 정확
- ⚠️ **수정 필요**: 월별 집계 방식

**기존 코드 패턴 (statistics.py):**
```python
# extract 사용 (인덱스 활용 가능)
extract('year', date_field).label('year'),
extract('month', date_field).label('month'),
.group_by(extract('year', date_field), extract('month', date_field))
```

**설계 문서 제안:**
```python
# to_char 사용 (인덱스 활용 불가)
to_char(contract_date, 'YYYY-MM')
```

**수정 사항:**
- 설계 문서의 월별 집계 방식을 `extract('year', date_field)`와 `extract('month', date_field)`로 변경
- 년도별 집계는 `extract('year', date_field)` 사용

---

### 1.2 주택 가격 지수 (house_scores 테이블)

**실제 DB 구조:**
- `house_scores.base_ym`: `CHAR(6)` 타입 (YYYYMM 형식)
- `house_scores.index_value`: `Numeric(8, 2)` 타입
- `house_scores.index_change_rate`: `Optional[Numeric(5, 2)]` 타입
- `house_scores.index_type`: `String(10)` 타입 ("APT", "HOUSE", "ALL")
- `house_scores.region_id`: `Integer` 타입 (FK)

**설계 문서 검토:**
- ✅ 필드명 일치: 모든 필드명 정확
- ✅ 데이터 타입 일치: `CHAR(6)`, `Numeric`, `String` 모두 정확
- ✅ 제약 조건 확인: `index_type IN ('APT', 'HOUSE', 'ALL')` 체크 제약 있음

**외부 API (REB API) 확인:**
- `WRTTIME_IDTFR_ID`: 기준년월 (YYYYMM 형식) → `base_ym`으로 저장됨
- `DTA_VAL`: 지수 값 → `index_value`로 저장됨
- `ITM_NM`: 지수 유형 (아파트/단독주택/전체) → `index_type`으로 매핑됨
- ✅ 외부 API 응답 형식이 DB 구조와 일치함

---

### 1.3 인구 순이동 (population_movements 테이블)

**실제 DB 구조:**
- `population_movements.base_ym`: `CHAR(6)` 타입 (YYYYMM 형식)
- `population_movements.in_migration`: `Integer` 타입
- `population_movements.out_migration`: `Integer` 타입
- `population_movements.net_migration`: `Integer` 타입 (전입 - 전출)
- `population_movements.movement_type`: `String(20)` 타입 ("TOTAL", "DOMESTIC")
- `population_movements.region_id`: `Integer` 타입 (FK)

**설계 문서 검토:**
- ✅ 필드명 일치: 모든 필드명 정확
- ✅ 데이터 타입 일치: `CHAR(6)`, `Integer` 모두 정확
- ✅ 인덱스 확인: `idx_population_movements_region_ym`, `idx_population_movements_base_ym` 인덱스 있음

**외부 API (KOSIS API) 확인:**
- `T10`: 총전입 → `in_migration`으로 저장됨
- `T20`: 총전출 → `out_migration`으로 저장됨
- `T25`: 순이동 → `net_migration`으로 저장됨 (또는 계산)
- `PRD_DE`: 기준년월 (YYYYMM 형식) → `base_ym`으로 저장됨
- ✅ 외부 API 응답 형식이 DB 구조와 일치함

---

### 1.4 지역 정보 (states 테이블)

**실제 DB 구조:**
- `states.city_name`: `String(40)` 타입 (예: "서울특별시", "부산광역시")
- `states.region_name`: `String(20)` 타입 (예: "강남구", "해운대구")
- `states.region_code`: `CHAR(10)` 타입

**설계 문서 검토:**
- ✅ 필드명 일치: `city_name`, `region_name` 모두 정확
- ⚠️ **수정 필요**: 지역명 정규화 로직

**실제 DB 값 확인:**
- `city_name`은 "서울특별시", "부산광역시" 형식으로 저장됨
- 프론트엔드에서는 "서울", "부산" 형식을 기대함
- ✅ 설계 문서에 정규화 로직 포함되어 있음

---

## 2. 기존 코드 패턴 확인 결과

### 2.1 월별/년도별 집계 패턴

**기존 코드 (statistics.py, dashboard.py):**
```python
# 월별 집계: extract 사용 (인덱스 활용 가능)
extract('year', date_field).label('year'),
extract('month', date_field).label('month'),
.group_by(extract('year', date_field), extract('month', date_field))

# 또는 to_char 사용 (일부 코드에서)
func.to_char(date_field, 'YYYY-MM').label('month')
```

**권장 사항:**
- `extract` 방식 사용 권장 (인덱스 활용 가능, 성능 우수)
- `to_char` 방식은 문자열 변환으로 인덱스 활용 불가

---

### 2.2 지역 필터링 패턴

**기존 코드 (dashboard.py, statistics.py):**
```python
# city_name으로 필터링
State.city_name == "서울특별시"
State.city_name.in_(['서울특별시', '경기도', '인천광역시'])
```

**설계 문서 제안:**
```python
# region_type에 따른 필터링
if region_type == "수도권":
    city_name IN ('서울특별시', '경기도', '인천광역시')
```

**검토 결과:**
- ✅ 기존 패턴과 일치함
- ✅ 설계 문서의 필터링 로직 정확함

---

### 2.3 거래량 집계 패턴

**기존 코드 (statistics.py):**
```python
# 거래량 집계
func.count(trans_table.trans_id).label('count')

# 필터 조건
Sale.is_canceled == False,
(Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
Sale.contract_date.isnot(None),
or_(Sale.remarks != "더미", Sale.remarks.is_(None))
```

**설계 문서 검토:**
- ✅ 필터 조건 일치: `is_canceled`, `is_deleted`, `contract_date` 모두 정확
- ✅ 집계 함수 일치: `func.count()` 사용

---

## 3. 설계 문서 수정 사항

### 3.1 월별 집계 방식 수정

**기존 제안 (설계 문서):**
```python
# 월별 집계
month_expr = func.to_char(date_field, 'YYYY-MM')
```

**수정 제안:**
```python
# 월별 집계 (인덱스 활용 가능)
year_expr = extract('year', date_field)
month_expr = extract('month', date_field)
.group_by(year_expr, month_expr)

# 응답 형식 변환 (Python에서)
period = f"{int(row.year)}-{int(row.month):02d}"  # "2023-01" 형식
# 또는
period = f"{int(row.month)}월"  # "1월" 형식 (프론트엔드 요구사항)
```

---

### 3.2 월별 데이터 형식 (동적 키) 처리

**프론트엔드 요구사항:**
```typescript
{ period: '1월', 2023: 140, 2024: 150, 2025: 160 }
```

**구현 방법:**
1. DB에서 년도별로 집계
2. Python에서 년도별 데이터를 월별로 그룹화
3. 동적 키 형식으로 변환

**수정된 구현 로직:**
```python
# 1. DB에서 년도별 집계
year_month_data = [
    {"year": 2023, "month": 1, "count": 140},
    {"year": 2023, "month": 2, "count": 135},
    {"year": 2024, "month": 1, "count": 150},
    # ...
]

# 2. Python에서 월별로 그룹화
monthly_data_map = {}
for item in year_month_data:
    month_key = f"{item['month']}월"
    if month_key not in monthly_data_map:
        monthly_data_map[month_key] = {"period": month_key}
    monthly_data_map[month_key][item['year']] = item['count']

# 3. 응답 형식으로 변환
data = list(monthly_data_map.values())
years = sorted(set(item['year'] for item in year_month_data))
```

---

### 3.3 지역명 정규화 로직 추가

**설계 문서에 포함되어 있으나, 실제 구현 시 주의사항:**

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
        # 기타는 그대로 사용
    }
    return mapping.get(city_name, city_name)
```

---

## 4. 외부 API 응답 형식 확인

### 4.1 KOSIS API (인구 이동)

**외부 API 응답 형식:**
```json
{
  "StatisticSearch": {
    "row": [
      {
        "PRD_DE": "202401",  // 기준년월
        "C1": "11",          // 지역코드 (서울=11)
        "C1_NM": "서울특별시",
        "ITM_ID": "T10",     // T10=총전입, T20=총전출, T25=순이동
        "DT": "5000"         // 값
      }
    ]
  }
}
```

**DB 저장 형식:**
- `PRD_DE` → `base_ym` (CHAR(6))
- `T10` → `in_migration` (Integer)
- `T20` → `out_migration` (Integer)
- `T25` → `net_migration` (Integer) 또는 계산

**검토 결과:**
- ✅ 외부 API 응답 형식이 DB 구조와 일치함
- ✅ 데이터 수집 서비스에서 이미 변환 로직 구현됨
- ✅ 설계 문서는 DB 구조만 고려하면 됨 (외부 API 직접 사용 안 함)

---

### 4.2 REB API (부동산 지수)

**외부 API 응답 형식:**
```json
{
  "SttsApiTblData": [
    {
      "head": [{"RESULT": {"CODE": "INFO-000"}}]
    },
    {
      "row": [
        {
          "WRTTIME_IDTFR_ID": "20240101",  // 기준년월일 (YYYYMMDD)
          "DTA_VAL": "85.5",               // 지수 값
          "ITM_NM": "아파트",              // 지수 유형
          "CLS_ID": "11000"                // 지역코드
        }
      ]
    }
  ]
}
```

**DB 저장 형식:**
- `WRTTIME_IDTFR_ID[:6]` → `base_ym` (CHAR(6), YYYYMM)
- `DTA_VAL` → `index_value` (Numeric)
- `ITM_NM` → `index_type` ("APT", "HOUSE", "ALL"로 매핑)

**검토 결과:**
- ✅ 외부 API 응답 형식이 DB 구조와 일치함
- ✅ 데이터 수집 서비스에서 이미 변환 로직 구현됨
- ✅ 설계 문서는 DB 구조만 고려하면 됨 (외부 API 직접 사용 안 함)

---

## 5. 최종 검토 결과 및 수정 사항

### ✅ 정확한 부분

1. **DB 필드명**: 모든 필드명이 실제 DB 구조와 일치함
2. **데이터 타입**: 모든 데이터 타입이 실제 DB 구조와 일치함
3. **외부 API**: 외부 API는 이미 DB에 저장되어 있으므로 직접 사용하지 않음
4. **지역 필터링**: `city_name` 기반 필터링 로직 정확함
5. **인구 이동 데이터**: `net_migration` 필드 사용 정확함

### ⚠️ 수정 필요한 부분

1. **월별 집계 방식**: `to_char` → `extract` 방식으로 변경 필요
2. **월별 데이터 형식**: 동적 키 형식 변환 로직 추가 필요
3. **지역명 정규화**: 실제 구현 시 정규화 함수 필요

---

## 6. 수정된 API 설계 (주요 변경사항)

### 6.1 거래량 조회 API 수정

**기존 제안:**
```python
month_expr = func.to_char(date_field, 'YYYY-MM')
```

**수정 제안:**
```python
# 월별 집계 (인덱스 활용 가능)
year_expr = extract('year', date_field)
month_expr = extract('month', date_field)

stmt = (
    select(
        year_expr.label('year'),
        month_expr.label('month'),
        func.count(trans_table.trans_id).label('count')
    )
    .where(...)
    .group_by(year_expr, month_expr)
)

# Python에서 응답 형식 변환
monthly_data_map = {}
for row in result:
    month_key = f"{int(row.month)}월"
    if month_key not in monthly_data_map:
        monthly_data_map[month_key] = {"period": month_key}
    monthly_data_map[month_key][int(row.year)] = row.count

data = list(monthly_data_map.values())
years = sorted(set(int(row.year) for row in result))
```

---

### 6.2 시장 국면 분석 API 수정

**가격 변화율 계산:**
```python
# 평당가 기준으로 계산 (기존 코드 패턴과 일치)
price_field = trans_table.trans_price
area_field = trans_table.exclusive_area

# 평당가 계산
price_per_pyeong = price_field / area_field * 3.3

# 최근 기간 평균 평당가
recent_avg_price = func.avg(price_per_pyeong)

# 이전 기간 평균 평당가
previous_avg_price = func.avg(price_per_pyeong)
```

**거래량 변화율 계산:**
```python
# 거래 건수 기준
recent_volume = func.count(trans_table.trans_id)
previous_volume = func.count(trans_table.trans_id)
```

---

### 6.3 주택 가격 지수 API 수정

**지역명 정규화 추가:**
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

# 응답 데이터 생성 시
for row in rows:
    city_name = normalize_city_name(row.city_name)
    # ...
```

---

### 6.4 인구 순이동 API 수정

**집계 방식:**
```python
# 시도 레벨로 그룹화 (city_name 사용)
query = (
    select(
        State.city_name,
        func.sum(PopulationMovement.net_migration).label('net_migration'),
        func.sum(PopulationMovement.in_migration).label('in_migration'),
        func.sum(PopulationMovement.out_migration).label('out_migration')
    )
    .join(State, PopulationMovement.region_id == State.region_id)
    .where(...)
    .group_by(State.city_name)
)

# 응답 데이터 생성 시
for row in rows:
    city_name = normalize_city_name(row.city_name)
    value = row.net_migration
    label = "순유입" if value > 0 else "순유출"
    # ...
```

---

## 7. 최종 권장사항

### 7.1 구현 시 주의사항

1. **월별 집계**: `extract` 방식 사용 (인덱스 활용)
2. **동적 키 형식**: Python에서 변환 로직 구현
3. **지역명 정규화**: 정규화 함수 구현 필수
4. **필터 조건**: 기존 코드 패턴과 일치하도록 구현
5. **캐싱**: Redis 캐싱 적용 (TTL: 6시간)

### 7.2 성능 최적화

1. **인덱스 활용**: `extract` 방식 사용으로 인덱스 활용 가능
2. **병렬 쿼리**: 여러 기간 데이터 조회 시 `asyncio.gather()` 사용
3. **집계 최적화**: DB에서 집계 수행 (프론트엔드 변환 최소화)

---

## 8. 검토 완료 체크리스트

- [x] DB 필드명 확인
- [x] DB 데이터 타입 확인
- [x] 외부 API 응답 형식 확인
- [x] 기존 코드 패턴 확인
- [x] 월별 집계 방식 수정
- [x] 지역명 정규화 로직 추가
- [x] 필터 조건 확인
- [x] 인덱스 활용 방안 확인

---

## 결론

설계 문서는 **대부분 정확하지만**, 다음 사항들을 수정해야 합니다:

1. **월별 집계 방식**: `to_char` → `extract` 방식으로 변경
2. **동적 키 형식 변환**: Python에서 변환 로직 추가
3. **지역명 정규화**: 실제 구현 시 정규화 함수 필요

외부 API는 이미 DB에 저장되어 있으므로, 설계 문서는 **DB 구조만 고려**하면 됩니다.
