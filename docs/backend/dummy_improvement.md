# 더미 데이터 개선 보고서

## 📋 목차
1. [현재 더미 데이터 로직 분석](#현재-더미-데이터-로직-분석)
2. [문제점 및 개선 필요 사항](#문제점-및-개선-필요-사항)
3. [해결 방안](#해결-방안)
4. [구현 내용](#구현-내용)
5. [검증 및 테스트](#검증-및-테스트)

---

## 현재 더미 데이터 로직 분석

### 1. 더미 데이터 목적

> **"공공데이터 API 문제로 이름 매칭에 실패한 아파트에 대해, 발표용으로 더미 데이터를 추가하여 구색 맞추기"**

- **대상**: 매매와 전월세 거래가 모두 없는 아파트
- **기간**: 2020년 1월 ~ 오늘까지
- **표시**: `remarks='더미'` 필드로 구분
- **통계 제외**: 홈 랭킹, 그래프, 통계 탭에서 제외되어야 함

### 2. 현재 구현 (db_admin.py)

#### 2.1 더미 데이터 생성 함수

**파일**: `backend/app/db_admin.py`  
**함수**: `generate_dummy_for_empty_apartments()` (654~1262 라인)

**작동 방식**:
```python
# 1. 거래가 없는 아파트 찾기
- 매매와 전월세 거래가 모두 없는 아파트만 대상

# 2. 가격 계산
- 같은 동(region_name) 기준으로 평균 가격 조회
- 평균값이 없으면 지역 계수 사용 (서울 1.8배, 경기 1.3배 등)
- ±10% 오차범위 내에서 랜덤 변동

# 3. 시간에 따른 가격 상승
- 2020년 1월 = 1.0, 오늘 = 1.8 (선형 상승)

# 4. 거래 데이터 생성
- 2020년 1월부터 오늘까지 월별로 순회
- 3개월 주기로 매매 1개, 전세 1개, 월세 1개씩 생성
- remarks='더미'로 표시
```

#### 2.2 현재 생성 주기

**문제**: 코드 분석 결과, **3개월에 3개 (매매 1, 전세 1, 월세 1)**씩 생성됨

```python
# 라인 974~1010: 3개월 주기 확인
month_offset = (month_count - 1 - cycle_start) % 3

# 주기 시작(month_offset == 0): 생성된 유형 초기화
if is_cycle_start:
    created_types.clear()

# 첫 달(offset 0): 매매
# 둘째 달(offset 1): 전세
# 셋째 달(offset 2): 월세
if month_offset == 0:
    record_type = "매매"
elif month_offset == 1:
    record_type = "전세"
else:  # month_offset == 2
    record_type = "월세"
```

**결과**: 2020년 1월 ~ 2025년 12월 (72개월)
- 매매: 24개 (72 / 3)
- 전세: 24개 (72 / 3)
- 월세: 24개 (72 / 3)
- **총 72개 거래/아파트**

**사용자 요구사항**: 2개월에 1개씩
- 매매/전세/월세 각각 2개월에 1개씩
- 즉, 2개월마다 3가지 거래 유형 모두 1개씩 (총 3개)
- **총 108개 거래/아파트** (72 / 2 * 3)

### 3. 더미 데이터 제외 로직

#### 3.1 제외 로직이 구현된 API

다음 API들은 더미 데이터를 **정상적으로 제외**합니다:

| API | 파일 | 라인 | 필터 조건 |
|-----|------|------|----------|
| `/api/v1/dashboard/summary` | dashboard.py | 909, 921 | `or_(trans_table.remarks != "더미", trans_table.remarks.is_(None))` |
| `/api/v1/dashboard/rankings` | dashboard.py | 1231, 1243 | `or_(trans_table.remarks != "더미", trans_table.remarks.is_(None))` |
| `/api/v1/dashboard/*` (기타) | dashboard.py | 81, 93, 287, 299, 591, 603, 706, 718 | `or_(trans_table.remarks != "더미", trans_table.remarks.is_(None))` |
| `/api/v1/statistics/*` | statistics.py | 159, 167, 378, 398, 417, 436 | `or_(*.remarks != "더미", *.remarks.is_(None))` |
| `/api/v1/apartments/{apt_id}/price-trend` | apartments.py | 963, 977, 991, 1006 | `or_(*.remarks != "더미", *.remarks.is_(None))` |
| `admin_web.py` (관리자 웹) | admin_web.py | 45, 51, 57, 64 | `or_(*.remarks != "더미", *.remarks.is_(None))` |

#### 3.2 제외 로직이 누락된 API ❌

다음 API들은 더미 데이터를 **제외하지 않습니다**:

| API | 파일 | 라인 | 문제 |
|-----|------|------|------|
| `/api/v1/dashboard/rankings_region` | dashboard.py | 1665~1682 | **더미 제외 로직 없음** |
| `detailed_search` (아파트 상세 검색) | apartment.py (service) | 872~956 | **더미 제외 로직 없음** |

---

## 문제점 및 개선 필요 사항

### 문제 1: 더미 데이터 생성 주기 오류 ❌

**현재**: 3개월에 3개 (매매 1, 전세 1, 월세 1)씩 생성  
**요구사항**: 2개월에 1개씩 (매매/전세/월세 각각)

**영향**:
- 현재: 2020년 1월~2025년 12월 (72개월) → 총 72개/아파트
- 요구: 2020년 1월~2025년 12월 (72개월) → 총 108개/아파트
- **차이**: 36개 부족 (50% 부족)

**발생 원인**:
```python
# 라인 978~1010: 3개월 주기 로직
month_offset = (month_count - 1 - cycle_start) % 3  # ❌ % 3 → 3개월 주기
```

### 문제 2: 지역별 랭킹에서 더미 데이터 제외 안 됨 ❌

**위치**: `backend/app/api/v1/endpoints/dashboard.py` (1665~1682 라인)

**문제**:
```python
# /rankings_region 엔드포인트
if transaction_type == "sale":
    base_filter = and_(
        trans_table.is_canceled == False,
        (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
        trans_table.trans_price.isnot(None),
        trans_table.exclusive_area.isnot(None),
        trans_table.exclusive_area > 0
        # ❌ 더미 제외 조건 없음!
    )
```

**영향**:
- 지역별 랭킹에 더미 데이터가 포함됨
- 상승률/하락률 계산이 왜곡됨
- **통계 정확도 저하**

### 문제 3: 아파트 상세 검색에서 더미 데이터 제외 안 됨 ❌

**위치**: `backend/app/services/apartment.py` (872~956 라인)

**문제**:
```python
# detailed_search() 함수
sale_stats_subq = (
    select(*sale_select_fields)
    .where(
        Sale.is_canceled == False,
        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
        Sale.contract_date >= date_from,
        Sale.exclusive_area.isnot(None),
        Sale.exclusive_area > 0,
        Sale.trans_price.isnot(None)
        # ❌ 더미 제외 조건 없음!
    )
    .group_by(Sale.apt_id)
).subquery()
```

**영향**:
- 아파트 검색 결과에 더미 데이터가 포함됨
- 평균 가격, 최저/최고가 계산이 왜곡됨
- **검색 품질 저하**

### 문제 4: 가격 변동의 자연스러움 검증 필요 ⚠️

**현재 방식**:
```python
# 가격 계산
base_price_per_sqm = region_sale_avg[region_key]  # 같은 동 평균
price_per_sqm = base_price_per_sqm * time_multiplier  # 시간 상승률
random_variation = random.uniform(0.90, 1.10)  # ±10% 변동
total_price = int(price_per_sqm * exclusive_area * random_variation)
```

**검증 필요 사항**:
1. **같은 동 평균 가격이 없는 경우**: 지역 계수 사용 (서울 1.8배 등)
   - 실제 시세와 괴리가 있을 수 있음
2. **±10% 오차범위**: 너무 좁거나 넓지 않은지 확인 필요
   - 실제 아파트는 평당 가격 편차가 크므로, ±15~20%가 더 자연스러울 수 있음
3. **시간에 따른 가격 상승률**: 선형 상승 (2020년 1.0 → 오늘 1.8)
   - 실제 시장은 비선형적으로 변동하므로, 단조 증가가 부자연스러울 수 있음

---

## 해결 방안

### 원칙

> **"더미 데이터는 발표용으로만 사용하며, 모든 통계와 랭킹에서 철저히 제외되어야 한다."**

### 방안 1: 더미 데이터 생성 주기 수정 ✅

**현재**: 3개월 주기 (매매 1, 전세 1, 월세 1)  
**변경**: 2개월 주기 (매매/전세/월세 각각 1개씩)

**구현**:
```python
# % 3 → % 2 변경
month_offset = (month_count - 1 - cycle_start) % 2  # ✅ 2개월 주기

# 2개월마다 매매, 전세, 월세 각각 1개씩 생성
# 첫 달(offset 0): 매매, 전세, 월세 모두 생성
# 둘째 달(offset 1): 건너뛰기
if month_offset == 0:
    # 매매 1개, 전세 1개, 월세 1개 모두 생성
    record_types = ["매매", "전세", "월세"]
else:
    # 건너뛰기
    continue
```

**효과**:
- 2개월마다 3가지 거래 유형 모두 생성
- 2020년 1월~2025년 12월 (72개월) → 총 108개/아파트 (36번 * 3)

### 방안 2: 지역별 랭킹에 더미 제외 로직 추가 ✅

**파일**: `backend/app/api/v1/endpoints/dashboard.py` (1665~1682 라인)

**변경 전**:
```python
base_filter = and_(
    trans_table.is_canceled == False,
    (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
    trans_table.trans_price.isnot(None),
    trans_table.exclusive_area.isnot(None),
    trans_table.exclusive_area > 0
)
```

**변경 후**:
```python
base_filter = and_(
    trans_table.is_canceled == False,
    (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
    trans_table.trans_price.isnot(None),
    trans_table.exclusive_area.isnot(None),
    trans_table.exclusive_area > 0,
    or_(trans_table.remarks != "더미", trans_table.remarks.is_(None))  # ✅ 더미 제외
)
```

**효과**:
- 지역별 랭킹에서 더미 데이터 제외
- 통계 정확도 향상

### 방안 3: 아파트 상세 검색에 더미 제외 로직 추가 ✅

**파일**: `backend/app/services/apartment.py` (872~956 라인)

**변경 전**:
```python
sale_stats_subq = (
    select(*sale_select_fields)
    .where(
        Sale.is_canceled == False,
        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
        Sale.contract_date >= date_from,
        Sale.exclusive_area.isnot(None),
        Sale.exclusive_area > 0,
        Sale.trans_price.isnot(None)
    )
    .group_by(Sale.apt_id)
).subquery()
```

**변경 후**:
```python
sale_stats_subq = (
    select(*sale_select_fields)
    .where(
        Sale.is_canceled == False,
        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
        Sale.contract_date >= date_from,
        Sale.exclusive_area.isnot(None),
        Sale.exclusive_area > 0,
        Sale.trans_price.isnot(None),
        or_(Sale.remarks != "더미", Sale.remarks.is_(None))  # ✅ 더미 제외
    )
    .group_by(Sale.apt_id)
).subquery()
```

**전월세 서브쿼리도 동일하게 수정**:
```python
rent_stats_subq = (
    select(*rent_select_fields)
    .where(
        *rent_where_conditions,
        or_(Rent.remarks != "더미", Rent.remarks.is_(None))  # ✅ 더미 제외
    )
    .group_by(Rent.apt_id)
).subquery()
```

**효과**:
- 아파트 검색 결과에서 더미 데이터 제외
- 검색 품질 향상

### 방안 4: 가격 변동 범위 확대 (선택사항) 💡

**현재**: ±10% 오차범위  
**제안**: ±15% 또는 ±20% 오차범위

**이유**:
- 실제 아파트는 층수, 향, 뷰 등에 따라 평당 가격 편차가 큼
- ±10%는 너무 좁아서 부자연스러울 수 있음

**구현** (선택사항):
```python
# 변경 전
random_variation = random.uniform(0.90, 1.10)  # ±10%

# 변경 후
random_variation = random.uniform(0.85, 1.15)  # ±15%
# 또는
random_variation = random.uniform(0.80, 1.20)  # ±20%
```

---

## 구현 내용

### 1. 더미 데이터 생성 주기 수정

**파일**: `backend/app/db_admin.py`

**변경 1: 2개월 주기로 변경 (라인 929~1017)**

```python
# 기존 코드 (라인 929~934)
# 아파트별 3개월 주기 추적: 3개월마다 매매 1개, 전세 1개, 월세 1개씩 생성
apartment_cycles = {}
for apt_id, _, _, _ in empty_apartments:
    # 각 아파트마다 3개월 주기를 랜덤하게 시작 (0, 1, 2 중 하나)
    apartment_cycles[apt_id] = {
        'cycle_start': random.randint(0, 2),  # 0: 1월부터 시작, 1: 2월부터 시작, 2: 3월부터 시작
        'created_types': set()  # 이번 주기에 생성한 거래 유형 추적 (매매, 전세, 월세)
    }

# 변경 후:
# 아파트별 2개월 주기 추적: 2개월마다 매매 1개, 전세 1개, 월세 1개씩 생성
apartment_cycles = {}
for apt_id, _, _, _ in empty_apartments:
    # 각 아파트마다 2개월 주기를 랜덤하게 시작 (0, 1 중 하나)
    apartment_cycles[apt_id] = {
        'cycle_start': random.randint(0, 1),  # 0: 1월부터 시작, 1: 2월부터 시작
        'created_types': set()  # 이번 주기에 생성한 거래 유형 추적 (매매, 전세, 월세)
    }
```

**변경 2: 2개월 주기 로직 (라인 978~1018)**

```python
# 기존 코드
month_offset = (month_count - 1 - cycle_start) % 3  # 3개월 주기
is_cycle_start = (month_offset == 0)

if is_cycle_start:
    created_types.clear()

# 3개월 주기 내에서 생성할 거래 유형 결정
record_types = []
if "매매" not in created_types:
    record_types.append("매매")
if "전세" not in created_types:
    record_types.append("전세")
if "월세" not in created_types:
    record_types.append("월세")

if not record_types:
    continue

# 이번 달에 생성할 유형 선택 (주기 내에서 순차적으로 생성)
if month_offset == 0:
    record_type = "매매"
elif month_offset == 1:
    record_type = "전세"
else:  # month_offset == 2
    record_type = "월세"

if record_type not in record_types:
    continue

created_types.add(record_type)

# 기록 생성: 선택한 유형 하나만 생성
for record_type in [record_type]:
    # ... 가격 계산 및 레코드 생성

# 변경 후:
month_offset = (month_count - 1 - cycle_start) % 2  # ✅ 2개월 주기

# 2개월 주기: 첫 달에만 생성 (매매, 전세, 월세 모두)
if month_offset != 0:
    # 둘째 달은 건너뛰기
    continue

# 2개월 주기 시작: 매매, 전세, 월세 모두 생성
record_types_to_create = ["매매", "전세", "월세"]

for record_type in record_types_to_create:
    # ... 가격 계산 및 레코드 생성 (기존 로직 유지)
```

### 2. 지역별 랭킹 더미 제외

**파일**: `backend/app/api/v1/endpoints/dashboard.py`

**변경: 라인 1665~1682**

```python
# 매매 필터
if transaction_type == "sale":
    base_filter = and_(
        trans_table.is_canceled == False,
        (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
        trans_table.trans_price.isnot(None),
        trans_table.exclusive_area.isnot(None),
        trans_table.exclusive_area > 0,
        or_(trans_table.remarks != "더미", trans_table.remarks.is_(None))  # ✅ 추가
    )
else:  # jeonse
    base_filter = and_(
        or_(
            trans_table.monthly_rent == 0,
            trans_table.monthly_rent.is_(None)
        ),
        (trans_table.is_deleted == False) | (trans_table.is_deleted.is_(None)),
        trans_table.deposit_price.isnot(None),
        trans_table.exclusive_area.isnot(None),
        trans_table.exclusive_area > 0,
        or_(trans_table.remarks != "더미", trans_table.remarks.is_(None))  # ✅ 추가
    )
```

### 3. 아파트 상세 검색 더미 제외

**파일**: `backend/app/services/apartment.py`

**변경 1: 매매 서브쿼리 (라인 872~883)**

```python
sale_stats_subq = (
    select(*sale_select_fields)
    .where(
        Sale.is_canceled == False,
        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
        Sale.contract_date >= date_from,
        Sale.exclusive_area.isnot(None),
        Sale.exclusive_area > 0,
        Sale.trans_price.isnot(None),
        or_(Sale.remarks != "더미", Sale.remarks.is_(None))  # ✅ 추가
    )
    .group_by(Sale.apt_id)
).subquery()
```

**변경 2: 전월세 서브쿼리 (라인 894~975 근처)**

```python
# rent_where_conditions 리스트에 더미 제외 조건 추가
rent_where_conditions = [
    (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
    Rent.deal_date >= date_from,
    Rent.deposit_price.isnot(None),
    Rent.exclusive_area.isnot(None),
    Rent.exclusive_area > 0,
    or_(Rent.remarks != "더미", Rent.remarks.is_(None))  # ✅ 추가
]
```

---

## 검증 및 테스트

### 1. 더미 데이터 생성 검증

#### 테스트 시나리오

**시나리오 1: 2개월 주기 확인**

```bash
# Docker 컨테이너 내에서 실행
docker exec -it realestate-backend python -m app.db_admin

# 메뉴에서 선택:
# 10. 거래 없는 아파트에 더미 데이터 생성
```

**예상 결과**:
- 2020년 1월~2025년 12월 (72개월) → 총 108개/아파트
- 매매: 36개 (72 / 2)
- 전세: 36개 (72 / 2)
- 월세: 36개 (72 / 2)

**검증 쿼리**:
```sql
-- 아파트별 더미 거래 개수 확인
SELECT 
    apt_id,
    COUNT(*) as total_dummy_count,
    SUM(CASE WHEN remarks = '더미' THEN 1 ELSE 0 END) as dummy_count
FROM (
    SELECT apt_id, 'sale' as type, remarks FROM sales WHERE remarks = '더미'
    UNION ALL
    SELECT apt_id, 'rent' as type, remarks FROM rents WHERE remarks = '더미'
) AS dummy_data
GROUP BY apt_id
ORDER BY total_dummy_count DESC
LIMIT 10;

-- 월별 더미 거래 분포 확인 (2개월마다 3개씩 생성되었는지)
SELECT 
    DATE_TRUNC('month', contract_date) as month,
    COUNT(*) as sale_count
FROM sales
WHERE remarks = '더미'
GROUP BY month
ORDER BY month;

SELECT 
    DATE_TRUNC('month', deal_date) as month,
    COUNT(*) as rent_count
FROM rents
WHERE remarks = '더미'
GROUP BY month
ORDER BY month;
```

### 2. 더미 데이터 제외 검증

#### 테스트 시나리오

**시나리오 1: 지역별 랭킹 API 테스트**

```bash
# API 호출
curl "http://localhost:8000/api/v1/dashboard/rankings_region?transaction_type=sale&region_name=경기도"
```

**검증**:
- 응답 데이터에 remarks='더미'인 거래가 포함되지 않아야 함
- 로그에서 SQL 쿼리 확인: `WHERE ... OR (remarks != '더미' OR remarks IS NULL)`

**시나리오 2: 아파트 상세 검색 API 테스트**

```bash
# API 호출
curl "http://localhost:8000/api/v1/apartments/search/detailed?min_price=30000&max_price=50000"
```

**검증**:
- 검색 결과의 평균 가격, 최저/최고가에 더미 데이터가 영향을 주지 않아야 함

#### 검증 쿼리

```sql
-- 더미 데이터가 제외되는지 확인 (각 API 호출 후 실행)
-- 1. 지역별 랭킹 (경기도)
SELECT 
    a.apt_name,
    s.trans_price,
    s.remarks
FROM sales s
JOIN apartments a ON s.apt_id = a.apt_id
JOIN states st ON a.region_id = st.region_id
WHERE st.city_name = '경기도'
  AND s.contract_date >= CURRENT_DATE - INTERVAL '3 months'
  AND s.is_canceled = FALSE
  AND (s.is_deleted = FALSE OR s.is_deleted IS NULL)
  -- ✅ 더미 제외 조건이 적용되어야 함
  AND (s.remarks != '더미' OR s.remarks IS NULL)
ORDER BY s.contract_date DESC
LIMIT 10;

-- 2. 아파트 상세 검색
SELECT 
    a.apt_id,
    a.apt_name,
    AVG(s.trans_price) as avg_price,
    COUNT(*) as transaction_count,
    SUM(CASE WHEN s.remarks = '더미' THEN 1 ELSE 0 END) as dummy_count  -- ✅ 0이어야 함
FROM sales s
JOIN apartments a ON s.apt_id = a.apt_id
WHERE s.is_canceled = FALSE
  AND (s.is_deleted = FALSE OR s.is_deleted IS NULL)
  AND s.trans_price BETWEEN 30000 AND 50000
  -- ✅ 더미 제외 조건이 적용되어야 함
  AND (s.remarks != '더미' OR s.remarks IS NULL)
GROUP BY a.apt_id, a.apt_name
HAVING COUNT(*) >= 1
LIMIT 10;
```

### 3. 통계 영향 확인

#### 비교 테스트

**Before (더미 포함)**:
```sql
-- 전국 평균 매매가 (더미 포함)
SELECT AVG(trans_price / exclusive_area) as avg_price_per_sqm
FROM sales
WHERE is_canceled = FALSE
  AND (is_deleted = FALSE OR is_deleted IS NULL)
  AND trans_price IS NOT NULL
  AND exclusive_area > 0;
```

**After (더미 제외)**:
```sql
-- 전국 평균 매매가 (더미 제외)
SELECT AVG(trans_price / exclusive_area) as avg_price_per_sqm
FROM sales
WHERE is_canceled = FALSE
  AND (is_deleted = FALSE OR is_deleted IS NULL)
  AND trans_price IS NOT NULL
  AND exclusive_area > 0
  AND (remarks != '더미' OR remarks IS NULL);  -- ✅ 더미 제외
```

**검증**:
- 두 값의 차이가 거의 없어야 함 (더미 데이터가 통계에 영향을 주지 않음)
- 차이가 크면 더미 데이터 생성 로직 재검토 필요

---

## 결론

### 개선 효과 요약

| 개선 항목 | 기대 효과 |
|----------|----------|
| 더미 데이터 생성 주기 수정 | 2개월마다 3가지 거래 유형 생성, 총 거래 수 50% 증가 |
| 지역별 랭킹 더미 제외 | 지역별 통계 정확도 향상 |
| 아파트 상세 검색 더미 제외 | 검색 품질 및 가격 정확도 향상 |
| 모든 API에서 더미 제외 일관성 확보 | 통계 왜곡 방지, 사용자 신뢰도 향상 |

### 남은 검토 사항

1. **가격 변동 범위**: ±10%가 적절한지 검토 (±15~20%로 확대 고려)
2. **시간에 따른 가격 상승**: 선형 상승이 자연스러운지 검토 (비선형 모델 고려)
3. **더미 데이터 백업/복원**: 더미 데이터만 별도 관리 필요 시 추가 개발

### 향후 개선 방향

1. **더미 데이터 식별 UI**: 발표 시 더미 데이터를 시각적으로 구분 (예: 회색 표시)
2. **더미 데이터 토글 기능**: 관리자 모드에서 더미 데이터 표시/숨김 기능
3. **실제 데이터 수집 강화**: 매칭 정확도 향상으로 더미 데이터 필요성 감소

---

**작성일**: 2026-01-19  
**작성자**: AI Assistant  
**문서 버전**: 1.0
