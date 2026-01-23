# 통계 페이지 API 구현 가이드

> **작성일**: 2026-01-23  
> **목적**: 통계 페이지 관련 API 구현을 위한 상세 가이드  
> **참고**: `.agent/02_backend_dev.md` (백엔드 개발 가이드)

---

## 📋 목차

1. [거래량 API](#1-거래량-api)
2. [시장 국면 지표 API](#2-시장-국면-지표-api)
3. [인구 순이동 Sankey Diagram API](#3-인구-순이동-sankey-diagram-api)
4. [랭킹 API](#4-랭킹-api)

---

## 1. 거래량 API

### 1.1 요구사항

- **연도별 그래프**: 전국, 수도권, 지방5대광역시의 거래량을 연도별로 표시
  - 백엔드에서 최대 7년치 월별 데이터를 받아서 프론트엔드에서 연도별로 집계
- **월별 그래프**: x축에 1월부터 12월까지, 선택한 연도 개수만큼 꺾은선 그래프가 겹쳐서 표시
  - 연도 선택: 2년, 3년, 5년 (프론트엔드에서 필터링)
  - 지방5대광역시는 지역별로 볼 수도 있고, 각 연도별로 볼 수도 있게 선택 가능
  - 백엔드에서 최대 7년치 월별 데이터를 받아서 프론트엔드에서 필요한 형태로 재구성

### 1.1.1 설계 방식 비교

#### 방식 A: 백엔드에서 지역별/기간별 필터링 (현재 가이드)
- 백엔드에서 `region_type` 파라미터로 전국/수도권/지방5대광역시 필터링
- 백엔드에서 연도별/월별로 별도 엔드포인트 제공
- 각 요청마다 필요한 데이터만 조회

#### 방식 B: 전국 데이터 일괄 요청 + 프론트엔드 필터링 (제안)
- 백엔드에서 전국의 월별 거래량 데이터를 한 번에 반환 (지역 정보 포함)
- 프론트엔드에서 전국/수도권/지방5대광역시, 월별/연도별 필터링 처리
- Dashboard 차트 데이터 처리 방식과 유사

**방식 B의 장단점 분석:**

**장점:**
1. ✅ **API 호출 횟수 감소**: 한 번의 API 호출로 모든 필터링 옵션 지원 가능
2. ✅ **프론트엔드 유연성**: 사용자가 필터를 빠르게 변경해도 추가 API 호출 불필요
3. ✅ **일관된 패턴**: Dashboard의 차트 데이터 처리 방식과 동일한 패턴 (기존 코드와 일관성)
4. ✅ **캐싱 효율성**: 한 번의 캐시로 모든 필터링 옵션 지원 가능
5. ✅ **네트워크 효율성**: 여러 번의 작은 요청보다 한 번의 큰 요청이 효율적일 수 있음

**단점:**
1. ❌ **초기 데이터 크기**: 전국 월별 데이터가 크면 초기 로딩 시간 증가
   - 예상: 10년 × 12개월 × 17개 시도 = 약 2,040개 데이터 포인트
   - 각 포인트: {year, month, city_name, region_name, volume} ≈ 100 bytes
   - 총 크기: 약 200KB (압축 시 50KB 이하)
2. ❌ **불필요한 데이터 전송**: 사용자가 특정 지역만 볼 때도 전체 데이터 전송
3. ❌ **프론트엔드 복잡도**: 필터링 로직이 프론트엔드로 이동하여 복잡도 증가
4. ❌ **메모리 사용**: 프론트엔드에서 전체 데이터를 메모리에 보관

**권장 사항:**
- **방식 B 권장** (Dashboard 패턴과 일관성, 사용자 경험 향상)
- 단, 데이터 크기가 500KB를 초과하면 방식 A 고려
- 하이브리드 접근: 기본적으로 방식 B, 필요시 백엔드 필터링 옵션 제공

#### 방식 C: 백엔드에서 부분 필터링 (하이브리드) ⭐ **최종 선택**

**설계 원칙:**
- 백엔드: 지역 유형(`region_type`) + 연도 범위(`start_year`, `end_year`) 필터링
- 프론트엔드: 연도 선택(2/3/5년), 지역별/연도별 그룹화 처리

**백엔드 필터링의 장점:**

1. ✅ **데이터베이스 최적화**: SQL WHERE 절로 필터링하면 인덱스 활용 가능
   - `city_name` 인덱스로 빠른 지역 필터링
   - `contract_date` 인덱스로 빠른 연도 범위 필터링
   - 불필요한 데이터 스캔 방지

2. ✅ **네트워크 트래픽 감소**: 필요한 데이터만 전송
   - 전국 11년 데이터: ~220KB → 수도권 11년: ~66KB (70% 감소)
   - 수도권 5년 데이터: ~30KB (86% 감소)
   - 수도권 3년 데이터: ~18KB (92% 감소)
   - 모바일 환경에서 중요

3. ✅ **캐시 효율성**: 필터링된 결과를 별도 캐시 키로 저장
   - `statistics:volume:yearly:전국:sale:2014:2024` (220KB)
   - `statistics:volume:yearly:수도권:sale:2014:2024` (66KB)
   - `statistics:volume:monthly:수도권:sale:2020:2024` (30KB)
   - 각각 독립적으로 캐시 관리 가능

4. ✅ **서버 리소스 절약**: 집계 연산을 DB에서 처리
   - 프론트엔드에서 2,040개 포인트 처리 vs 백엔드에서 132개 포인트만 반환 (연도별 11년)
   - 프론트엔드에서 600개 포인트 처리 vs 백엔드에서 60개 포인트만 반환 (월별 5년)
   - 메모리 사용량 감소

5. ✅ **확장성**: 향후 더 많은 지역 필터 추가 시 유리
   - 시군구 단위 필터링 추가 시 백엔드 필터링이 필수
   - 추가 필터 파라미터 확장 용이

**필터링 레벨:**

**백엔드에서 필터링 (필수):**
- ✅ `region_type`: 전국/수도권/지방5대광역시 (필수)
- ✅ `max_years`: 최대 연도 수 (선택, 기본값: 7, 최대: 7)
  - 최근 7년치 월별 데이터 반환 (예: 2018-01 ~ 2024-12)
- ✅ `transaction_type`: sale/rent (선택, 기본값: sale)

**프론트엔드에서 처리 (선택):**
- ✅ 연도별/월별 뷰 전환: 월별 데이터를 연도별로 집계하거나 그대로 표시
- ✅ 연도 선택 (2년/3년/5년): 받은 데이터 중 최신 N개 연도만 필터링
- ✅ `view_mode` (지방5대광역시): 지역별/연도별 그룹화
- ✅ 데이터 재구성: 프론트엔드에서 필요한 형태로 변환

**API 호출 예시:**
```
# 기본 호출 (최근 7년 월별 데이터)
GET /api/v1/statistics/transaction-volume
?region_type=수도권
&transaction_type=sale

# 최대 연도 수 지정
GET /api/v1/statistics/transaction-volume
?region_type=수도권
&transaction_type=sale
&max_years=5
```

**이유:**
1. **지역 필터링은 DB 인덱스 활용 가능** → 성능 향상
2. **월별 데이터만 반환하여 백엔드 로직 단순화** → 유지보수 용이
3. **프론트엔드에서 연도별/월별 뷰 자유롭게 전환** → 사용자 경험 향상
4. **연도 선택(2/3/5년)은 사용자 인터랙션** → 프론트엔드 처리 적합 (추가 API 호출 불필요)
5. **캐시 키 단순화**: `region_type` + `transaction_type` + `max_years` 조합으로 캐싱

**데이터 크기 비교:**
- 전국 7년 월별 데이터: ~84KB (7년 × 12개월 = 84개 포인트)
- 수도권 7년 월별 데이터: ~25KB (70% 감소)
- 지방5대광역시 7년 월별 데이터: ~42KB (5개 지역 × 84개 포인트)
- 프론트엔드에서 연도별 집계 시: 7개 포인트로 축소

**구현 예시:**
```python
# 백엔드 쿼리 (최적화)
# 최근 7년치 월별 데이터 반환
current_year = datetime.now().year
start_year = current_year - max_years + 1  # 기본값: 현재 연도 - 6
start_date = date(start_year, 1, 1)
end_date = date(current_year, 12, 31)  # 현재 연도 12월까지

SELECT 
    EXTRACT(YEAR FROM s.contract_date) AS year,
    EXTRACT(MONTH FROM s.contract_date) AS month,
    st.city_name AS city_name,  -- 지방5대광역시일 때만 사용
    COUNT(*) AS volume
FROM sales s
JOIN apartments a ON s.apt_id = a.apt_id
JOIN states st ON a.region_id = st.region_id
WHERE 
    s.is_canceled = false
    AND (s.is_deleted = false OR s.is_deleted IS NULL)
    AND s.contract_date IS NOT NULL
    AND (s.remarks != '더미' OR s.remarks IS NULL)
    AND s.contract_date >= :start_date
    AND s.contract_date <= :end_date
    AND st.city_name IN ('서울특별시', '경기도', '인천광역시')  -- region_type에 따라 동적 변경
GROUP BY EXTRACT(YEAR FROM s.contract_date), EXTRACT(MONTH FROM s.contract_date), st.city_name
ORDER BY year DESC, month, st.city_name;
```

**최종 권장:**
- **방식 C (하이브리드) 채택**: 지역 유형은 백엔드, 뷰 전환 및 세부 필터링은 프론트엔드
- **API 통합**: 연도별/월별 엔드포인트 통합 → 단일 엔드포인트로 월별 데이터 반환
- **캐시 전략**: `statistics:volume:{region_type}:{transaction_type}:{max_years}` 조합으로 캐싱 (TTL: 6시간)
- **기본값**: 최근 7년치 월별 데이터 반환 (`max_years = 7`)
- **프론트엔드**: 
  - 연도별 뷰: 월별 데이터를 연도별로 집계
  - 월별 뷰: 원본 데이터를 연도별로 그룹화
  - 연도 선택: 받은 데이터 중 최신 2/3/5년만 필터링

### 1.2 API 엔드포인트 설계 (하이브리드 방식 - 통합)

**설계 원칙:**
- 백엔드: 지역 유형(`region_type`) 필터링 + 최대 7년까지 월별 데이터 반환
- 프론트엔드: 연도별/월별 뷰 전환, 연도 선택(2/3/5년), 지역별/연도별 그룹화 처리

#### 1.2.1 거래량 조회 (통합 API)

```
GET /api/v1/statistics/transaction-volume
```

**Query Parameters:**
- `region_type` (required): `"전국"`, `"수도권"`, `"지방5대광역시"`
- `transaction_type` (optional): `"sale"` (매매), `"rent"` (전월세), 기본값: `"sale"`
- `max_years` (optional): 최대 연도 수 (기본값: 7, 최대: 7)

**응답 예시 (전국/수도권):**
```json
{
  "success": true,
  "data": [
    {
      "year": 2024,
      "month": 1,
      "volume": 12345
    },
    {
      "year": 2024,
      "month": 2,
      "volume": 13456
    },
    ...
    {
      "year": 2024,
      "month": 12,
      "volume": 15678
    },
    {
      "year": 2023,
      "month": 1,
      "volume": 11234
    },
    ...
    {
      "year": 2018,
      "month": 12,
      "volume": 9876
    }
  ],
  "region_type": "수도권",
  "period": "2018-01 ~ 2024-12",
  "max_years": 7
}
```

**응답 예시 (지방5대광역시 - 지역별 상세):**
```json
{
  "success": true,
  "data": [
    {
      "year": 2024,
      "month": 1,
      "city_name": "부산광역시",
      "volume": 1234
    },
    {
      "year": 2024,
      "month": 1,
      "city_name": "대구광역시",
      "volume": 987
    },
    {
      "year": 2024,
      "month": 1,
      "city_name": "광주광역시",
      "volume": 567
    },
    {
      "year": 2024,
      "month": 1,
      "city_name": "대전광역시",
      "volume": 432
    },
    {
      "year": 2024,
      "month": 1,
      "city_name": "울산광역시",
      "volume": 345
    },
    {
      "year": 2024,
      "month": 2,
      "city_name": "부산광역시",
      "volume": 1345
    },
    ...
  ],
  "region_type": "지방5대광역시",
  "period": "2018-01 ~ 2024-12",
  "max_years": 7
}
```

**프론트엔드 처리:**

1. **연도별 뷰**: 월별 데이터를 연도별로 집계
   ```typescript
   // 연도별 집계
   const yearlyData = monthlyData.reduce((acc, item) => {
     if (!acc[item.year]) {
       acc[item.year] = { year: item.year, volume: 0 };
     }
     acc[item.year].volume += item.volume;
     return acc;
   }, {});
   ```

2. **월별 뷰**: 원본 데이터를 연도별로 그룹화
   ```typescript
   // 연도별 그룹화
   const groupedByYear = monthlyData.reduce((acc, item) => {
     if (!acc[item.year]) {
       acc[item.year] = { year: item.year, months: [] };
     }
     acc[item.year].months.push({ month: item.month, volume: item.volume });
     return acc;
   }, {});
   ```

3. **연도 선택 (2/3/5년)**: 받은 데이터에서 최신 N개 연도만 필터링
   ```typescript
   const selectedYears = [2024, 2023, 2022]; // 3년 선택
   const filteredData = monthlyData.filter(item => selectedYears.includes(item.year));
   ```

4. **지역별 그룹화** (지방5대광역시):
   ```typescript
   // by_region 모드: 지역별로 그룹화
   const groupedByRegion = monthlyData.reduce((acc, item) => {
     if (!acc[item.city_name]) {
       acc[item.city_name] = [];
     }
     acc[item.city_name].push({ year: item.year, month: item.month, volume: item.volume });
     return acc;
   }, {});
   ```

### 1.3 데이터베이스 쿼리 설계 (하이브리드 방식 - 통합)

**공통 필터 조건:**
- 취소된 거래 제외: `is_canceled = false`
- 삭제된 거래 제외: `is_deleted = false OR is_deleted IS NULL`
- 더미 데이터 제외: `remarks != '더미' OR remarks IS NULL`
- 날짜 필수: `contract_date IS NOT NULL`
- 연도 범위 필터: `contract_date >= start_date AND contract_date <= end_date`

#### 1.3.1 월별 거래량 쿼리 (통합)

**전국:**
```sql
-- 최근 7년치 월별 데이터 (기본값)
SELECT 
    EXTRACT(YEAR FROM contract_date) AS year,
    EXTRACT(MONTH FROM contract_date) AS month,
    COUNT(*) AS volume
FROM sales
WHERE 
    is_canceled = false
    AND (is_deleted = false OR is_deleted IS NULL)
    AND contract_date IS NOT NULL
    AND (remarks != '더미' OR remarks IS NULL)
    AND contract_date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '6 years')  -- 최근 7년
    AND contract_date <= CURRENT_DATE
GROUP BY EXTRACT(YEAR FROM contract_date), EXTRACT(MONTH FROM contract_date)
ORDER BY year DESC, month;
```

**수도권:**
```sql
SELECT 
    EXTRACT(YEAR FROM s.contract_date) AS year,
    EXTRACT(MONTH FROM s.contract_date) AS month,
    COUNT(*) AS volume
FROM sales s
JOIN apartments a ON s.apt_id = a.apt_id
JOIN states st ON a.region_id = st.region_id
WHERE 
    s.is_canceled = false
    AND (s.is_deleted = false OR s.is_deleted IS NULL)
    AND s.contract_date IS NOT NULL
    AND (s.remarks != '더미' OR s.remarks IS NULL)
    AND st.city_name IN ('서울특별시', '경기도', '인천광역시')
    AND s.contract_date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '6 years')  -- 최근 7년
    AND s.contract_date <= CURRENT_DATE
GROUP BY EXTRACT(YEAR FROM s.contract_date), EXTRACT(MONTH FROM s.contract_date)
ORDER BY year DESC, month;
```

**지방5대광역시 (지역별 상세):**
```sql
SELECT 
    EXTRACT(YEAR FROM s.contract_date) AS year,
    EXTRACT(MONTH FROM s.contract_date) AS month,
    st.city_name AS city_name,
    COUNT(*) AS volume
FROM sales s
JOIN apartments a ON s.apt_id = a.apt_id
JOIN states st ON a.region_id = st.region_id
WHERE 
    s.is_canceled = false
    AND (s.is_deleted = false OR s.is_deleted IS NULL)
    AND s.contract_date IS NOT NULL
    AND (s.remarks != '더미' OR s.remarks IS NULL)
    AND st.city_name IN ('부산광역시', '대구광역시', '광주광역시', '대전광역시', '울산광역시')
    AND s.contract_date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '6 years')  -- 최근 7년
    AND s.contract_date <= CURRENT_DATE
GROUP BY EXTRACT(YEAR FROM s.contract_date), EXTRACT(MONTH FROM s.contract_date), st.city_name
ORDER BY year DESC, month, st.city_name;
```

**참고:**
- 전국 쿼리는 `JOIN states` 없이 `sales` 테이블만 사용
- `max_years` 파라미터로 연도 수 조정 가능 (기본값: 7, 최대: 7)
- 연도 범위는 `CURRENT_DATE - INTERVAL '{max_years-1} years'` ~ `CURRENT_DATE`로 계산
- 프론트엔드에서 연도별 집계는 월별 데이터를 합산하여 처리

### 1.4 구현 시 주의사항

#### 1.4.1 백엔드 구현

1. **성능 최적화**:
   - `contract_date`에 인덱스 확인 (이미 있음)
   - `states.city_name`에 인덱스 확인 (지역 필터링 성능)
   - 연도 범위 필터링으로 불필요한 데이터 스캔 방지
   - Redis 캐싱 적용 (TTL: 6시간)
   - 캐시 키: `statistics:volume:{region_type}:{transaction_type}:{max_years}`

2. **파라미터 검증**:
   - `region_type`: `"전국"`, `"수도권"`, `"지방5대광역시"` 중 하나만 허용
   - `max_years`: 1 ~ 7 범위 확인 (기본값: 7, 최대: 7)
   - `transaction_type`: `"sale"`, `"rent"` 중 하나만 허용

3. **기본값 설정**:
   - `max_years`: 기본값 `7` (최근 7년치 월별 데이터)
   - `transaction_type`: 기본값 `"sale"`
   - 연도 범위: `CURRENT_DATE - INTERVAL '{max_years-1} years'` ~ `CURRENT_DATE`

4. **데이터 필터링**:
   - 취소된 거래 제외: `is_canceled = false`
   - 삭제된 거래 제외: `is_deleted = false OR is_deleted IS NULL`
   - 더미 데이터 제외: `remarks != '더미' OR remarks IS NULL`
   - `contract_date`가 NULL인 경우 제외

5. **지역 필터링**:
   - 수도권: `city_name IN ('서울특별시', '경기도', '인천광역시')`
   - 지방5대광역시: `city_name IN ('부산광역시', '대구광역시', '광주광역시', '대전광역시', '울산광역시')`
   - 전국: 지역 필터 없음

6. **응답 데이터 구조**:
   - 연도별: 연도와 거래량만 반환 (지방5대광역시는 지역별 상세 포함)
   - 월별: 연도, 월, 거래량 반환 (지방5대광역시는 `city_name` 포함)
   - 모든 데이터는 시간순 정렬 (최신 → 과거)

#### 1.4.2 프론트엔드 구현

1. **API 호출 전략**:
   - 기본값으로 최근 7년치 월별 데이터 요청 (`max_years=7`)
   - 사용자가 필터 변경 시 동일 API 재호출 (캐시 활용)
   - 한 번의 API 호출로 연도별/월별 뷰 모두 지원

2. **연도별 뷰 처리**:
   - 월별 데이터를 연도별로 집계
   ```typescript
   const yearlyData = useMemo(() => {
     const grouped = monthlyData.reduce((acc, item) => {
       if (!acc[item.year]) {
         acc[item.year] = { year: item.year, volume: 0 };
       }
       acc[item.year].volume += item.volume;
       return acc;
     }, {});
     return Object.values(grouped).sort((a, b) => b.year - a.year);
   }, [monthlyData]);
   ```

3. **월별 뷰 처리**:
   - 원본 월별 데이터를 연도별로 그룹화
   ```typescript
   const monthlyGroupedByYear = useMemo(() => {
     const grouped = monthlyData.reduce((acc, item) => {
       if (!acc[item.year]) {
         acc[item.year] = { year: item.year, months: [] };
       }
       acc[item.year].months.push({ month: item.month, volume: item.volume });
       return acc;
     }, {});
     return Object.values(grouped)
       .sort((a, b) => b.year - a.year)
       .map(yearData => ({
         ...yearData,
         months: yearData.months.sort((a, b) => a.month - b.month)
       }));
   }, [monthlyData]);
   ```

4. **연도 선택 처리** (2년/3년/5년):
   - 받은 데이터 중 최신 N개 연도만 필터링
   ```typescript
   const filteredByYears = useMemo(() => {
     const uniqueYears = [...new Set(monthlyData.map(d => d.year))].sort((a, b) => b - a);
     const selectedYears = uniqueYears.slice(0, selectedYearCount); // 2, 3, 5
     return monthlyData.filter(item => selectedYears.includes(item.year));
   }, [monthlyData, selectedYearCount]);
   ```

5. **지역별 그룹화** (지방5대광역시, `by_region` 모드):
   ```typescript
   const groupedByRegion = useMemo(() => {
     return monthlyData.reduce((acc, item) => {
       if (!acc[item.city_name]) {
         acc[item.city_name] = [];
       }
       acc[item.city_name].push({
         year: item.year,
         month: item.month,
         volume: item.volume
       });
       return acc;
     }, {});
   }, [monthlyData]);
   ```

6. **성능 최적화**:
   - `useMemo`로 모든 변환 결과 캐싱
   - 대량 데이터 처리 시 가상화(virtualization) 고려
   - 차트 라이브러리 최적화 (예: Recharts의 `dataKey` 활용)
   - 연도별 집계는 한 번만 계산하고 재사용

---

## 2. 시장 국면 지표 API

### 2.1 요구사항

- **벌집 순환 모형(Honeycomb Cycle)** 기반 시장 국면 판별
- **X축**: 거래량 변동 (과거 평균 대비 현재 거래량의 비율 또는 전월 대비 증감)
- **Y축**: 가격 변동 (최근 3개월 이동평균 변동률 - 최근 3개월 평균 vs 이전 3개월 평균)
- **6개 국면**:
  1. **회복 (Recovery)**: 거래량 증가 ↑ / 가격 하락 혹은 보합 →
  2. **상승 (Expansion)**: 거래량 증가 ↑ / 가격 상승 ↑
  3. **둔화 (Slowdown)**: 거래량 감소 ↓ / 가격 상승 ↑
  4. **후퇴 (Recession)**: 거래량 감소 ↓ / 가격 하락 ↓
  5. **침체 (Depression)**: 거래량 급감 ↓ / 가격 하락세 지속 ↓
  6. **천착 (Trough)**: 거래량 미세 증가 ↑ / 가격 하락 ↓

- **지역별 데이터**:
  - 전국: 평균 데이터 하나
  - 수도권: 평균 데이터 하나
  - 지방5대광역시: 각 지역별 값

### 2.2 API 엔드포인트 설계

```
GET /api/v1/statistics/market-phase
```

**Query Parameters:**
- `region_type` (required): `"전국"`, `"수도권"`, `"지방5대광역시"`
- `volume_calculation_method` (optional): `"average"` (과거 평균 대비), `"month_over_month"` (전월 대비), 기본값: `"average"`
- `average_period_months` (optional, average 방식일 때): 평균 계산 기간 (개월, 기본값: 6)
- `volume_threshold` (optional): 거래량 변동 임계값 (%, 기본값: 지역별 설정값 또는 2.0)
- `price_threshold` (optional): 가격 변동 임계값 (%, 기본값: 지역별 설정값 또는 0.5)
- `min_transaction_count` (optional): 최소 거래 건수 (기본값: 5, 이 값 미만이면 "데이터 부족" 반환)

**응답 예시 (전국/수도권):**
```json
{
  "success": true,
  "data": {
    "region_type": "전국",
    "volume_change_rate": 5.2,
    "price_change_rate": 2.1,
    "phase": 2,
    "phase_label": "상승",
    "description": "거래량 증가와 가격 상승이 동반되는 활황기입니다.",
    "current_month_volume": 12345
  },
  "calculation_method": {
    "volume_method": "average",
    "average_period_months": 6,
    "price_method": "moving_average_3months"
  },
  "thresholds": {
    "volume_threshold": 2.0,
    "price_threshold": 0.5
  }
}
```

**응답 예시 (데이터 부족 시):**
```json
{
  "success": true,
  "data": {
    "region_type": "전국",
    "phase": null,
    "phase_label": "데이터 부족",
    "description": "데이터 부족으로 판별 불가 (현재 월 거래량: 3건, 최소 요구량: 5건)",
    "current_month_volume": 3,
    "min_required_volume": 5
  },
  "calculation_method": {
    "volume_method": "average",
    "average_period_months": 6,
    "price_method": "moving_average_3months"
  }
}
```

**응답 예시 (지방5대광역시):**
```json
{
  "success": true,
  "data": [
    {
      "region": "부산",
      "volume_change_rate": 3.5,
      "price_change_rate": -1.2,
      "phase": 1,
      "phase_label": "회복",
      "description": "거래량 증가와 가격 하락이 동반되는 바닥 다지기 단계입니다.",
      "current_month_volume": 1234
    },
    {
      "region": "대구",
      "volume_change_rate": -2.1,
      "price_change_rate": 1.5,
      "phase": 3,
      "phase_label": "둔화",
      "description": "거래량 감소와 가격 상승이 동반되는 에너지 고갈 단계입니다.",
      "current_month_volume": 987
    },
    {
      "region": "울산",
      "phase": null,
      "phase_label": "데이터 부족",
      "description": "데이터 부족으로 판별 불가 (현재 월 거래량: 3건, 최소 요구량: 5건)",
      "current_month_volume": 3,
      "min_required_volume": 5
    },
    ...
  ],
  "region_type": "지방5대광역시",
  "calculation_method": {
    "volume_method": "average",
    "average_period_months": 6,
    "price_method": "moving_average_3months"
  },
  "thresholds": {
    "volume_threshold": 2.0,
    "price_threshold": 0.5
  }
}
```

### 2.3 데이터베이스 쿼리 설계

#### 2.3.1 거래량 변동률 계산

**과거 평균 대비 방식:**
```sql
-- 현재 기간 거래량 (최근 1개월)
WITH current_volume AS (
    SELECT COUNT(*) AS volume
    FROM sales s
    JOIN apartments a ON s.apt_id = a.apt_id
    JOIN states st ON a.region_id = st.region_id
    WHERE 
        s.is_canceled = false
        AND (s.is_deleted = false OR s.is_deleted IS NULL)
        AND s.contract_date IS NOT NULL
        AND (s.remarks != '더미' OR s.remarks IS NULL)
        AND s.contract_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
        AND s.contract_date < DATE_TRUNC('month', CURRENT_DATE)
        -- 지역 필터 추가
),
-- 과거 평균 거래량 (6개월 평균)
average_volume AS (
    SELECT AVG(monthly_volume) AS avg_volume
    FROM (
        SELECT 
            DATE_TRUNC('month', s.contract_date) AS month,
            COUNT(*) AS monthly_volume
        FROM sales s
        JOIN apartments a ON s.apt_id = a.apt_id
        JOIN states st ON a.region_id = st.region_id
        WHERE 
            s.is_canceled = false
            AND (s.is_deleted = false OR s.is_deleted IS NULL)
            AND s.contract_date IS NOT NULL
            AND (s.remarks != '더미' OR s.remarks IS NULL)
            AND s.contract_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '7 months'
            AND s.contract_date < DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
            -- 지역 필터 추가
        GROUP BY month
    ) monthly_data
)
SELECT 
    ((current_volume.volume - average_volume.avg_volume) / average_volume.avg_volume * 100) AS volume_change_rate
FROM current_volume, average_volume;
```

**전월 대비 방식:**
```sql
WITH monthly_volumes AS (
    SELECT 
        DATE_TRUNC('month', s.contract_date) AS month,
        COUNT(*) AS volume
    FROM sales s
    JOIN apartments a ON s.apt_id = a.apt_id
    JOIN states st ON a.region_id = st.region_id
    WHERE 
        s.is_canceled = false
        AND (s.is_deleted = false OR s.is_deleted IS NULL)
        AND s.contract_date IS NOT NULL
        AND (s.remarks != '더미' OR s.remarks IS NULL)
        AND s.contract_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'
        AND s.contract_date < DATE_TRUNC('month', CURRENT_DATE)
        -- 지역 필터 추가
    GROUP BY month
    ORDER BY month DESC
    LIMIT 2
)
SELECT 
    ((current.volume - previous.volume) / previous.volume * 100) AS volume_change_rate
FROM 
    (SELECT volume FROM monthly_volumes ORDER BY month DESC LIMIT 1) AS current,
    (SELECT volume FROM monthly_volumes ORDER BY month DESC OFFSET 1 LIMIT 1) AS previous;
```

#### 2.3.2 가격 변동률 계산 (최근 3개월 이동평균 변동률)

**최근 3개월 이동평균 변동률 방식:**
```sql
-- 최근 3개월의 HPI 데이터 조회 및 이동평균 변동률 계산
WITH recent_hpi AS (
    SELECT 
        hs.base_ym,
        hs.index_value,
        hs.index_change_rate,
        st.city_name,
        st.region_id,
        ROW_NUMBER() OVER (PARTITION BY st.region_id ORDER BY hs.base_ym DESC) AS rn
    FROM house_scores hs
    JOIN states st ON hs.region_id = st.region_id
    WHERE 
        hs.is_deleted = false
        AND st.is_deleted = false
        AND hs.index_type = 'APT'
        -- 지역 필터 추가
        AND hs.base_ym >= TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYYMM')
    ORDER BY hs.base_ym DESC
),
-- 최근 3개월 데이터만 선택
last_3_months AS (
    SELECT 
        base_ym,
        index_value,
        index_change_rate,
        city_name,
        region_id
    FROM recent_hpi
    WHERE rn <= 3
),
-- 이동평균 변동률 계산
moving_average_change AS (
    SELECT 
        region_id,
        city_name,
        -- 최신 3개월 평균 가격
        AVG(CASE WHEN rn = 1 THEN index_value END) AS current_avg_price,
        -- 이전 3개월 평균 가격 (4~6개월 전)
        AVG(CASE WHEN rn BETWEEN 4 AND 6 THEN index_value END) AS previous_avg_price
    FROM (
        SELECT 
            hs.base_ym,
            hs.index_value,
            st.city_name,
            st.region_id,
            ROW_NUMBER() OVER (PARTITION BY st.region_id ORDER BY hs.base_ym DESC) AS rn
        FROM house_scores hs
        JOIN states st ON hs.region_id = st.region_id
        WHERE 
            hs.is_deleted = false
            AND st.is_deleted = false
            AND hs.index_type = 'APT'
            -- 지역 필터 추가
            AND hs.base_ym >= TO_CHAR(CURRENT_DATE - INTERVAL '6 months', 'YYYYMM')
    ) ranked_hpi
    WHERE rn <= 6
    GROUP BY region_id, city_name
    HAVING COUNT(*) >= 3  -- 최소 3개월 데이터 필요
)
SELECT 
    region_id,
    city_name,
    current_avg_price,
    previous_avg_price,
    CASE 
        WHEN previous_avg_price > 0 
        THEN ((current_avg_price - previous_avg_price) / previous_avg_price * 100)
        ELSE NULL
    END AS price_change_rate
FROM moving_average_change;
```

**Python에서 이동평균 변동률 계산 (대안):**
```python
# 최근 6개월 HPI 데이터 조회
recent_hpi_data = [
    {"base_ym": "202412", "index_value": 105.2},
    {"base_ym": "202411", "index_value": 104.8},
    {"base_ym": "202410", "index_value": 104.5},
    {"base_ym": "202409", "index_value": 104.0},
    {"base_ym": "202408", "index_value": 103.5},
    {"base_ym": "202407", "index_value": 103.2},
]

# 최근 3개월 평균
current_3month_avg = sum([d["index_value"] for d in recent_hpi_data[:3]]) / 3

# 이전 3개월 평균 (4~6개월 전)
previous_3month_avg = sum([d["index_value"] for d in recent_hpi_data[3:6]]) / 3

# 이동평균 변동률 계산
price_change_rate = ((current_3month_avg - previous_3month_avg) / previous_3month_avg) * 100
```

### 2.4 국면 판별 로직

```python
def get_thresholds(
    region_type: str,
    region_name: Optional[str] = None,
    volume_threshold: Optional[float] = None,
    price_threshold: Optional[float] = None,
    db: Session = None
) -> tuple[float, float]:
    """
    임계값 조회 (API 파라미터 우선, 없으면 지역별 설정값, 없으면 기본값)
    
    Args:
        region_type: 지역 유형 ("전국", "수도권", "지방5대광역시")
        region_name: 지역명 (지방5대광역시일 때)
        volume_threshold: API 파라미터로 전달된 거래량 임계값
        price_threshold: API 파라미터로 전달된 가격 임계값
        db: 데이터베이스 세션
    
    Returns:
        (volume_threshold, price_threshold) 튜플
    """
    # 1. API 파라미터가 있으면 우선 사용
    if volume_threshold is not None and price_threshold is not None:
        return volume_threshold, price_threshold
    
    # 2. 지역별 설정값 테이블에서 조회 (예: market_phase_thresholds 테이블)
    if db:
        threshold_record = db.query(MarketPhaseThreshold).filter(
            MarketPhaseThreshold.region_type == region_type,
            MarketPhaseThreshold.region_name == region_name if region_name else None
        ).first()
        
        if threshold_record:
            return (
                volume_threshold or threshold_record.volume_threshold,
                price_threshold or threshold_record.price_threshold
            )
    
    # 3. 기본값 사용
    return volume_threshold or 2.0, price_threshold or 0.5


def calculate_market_phase(
    volume_change_rate: float,
    price_change_rate: float,
    current_month_volume: int,
    min_transaction_count: int = 5,
    volume_threshold: float = 2.0,
    price_threshold: float = 0.5
) -> dict:
    """
    벌집 순환 모형에 따른 시장 국면 판별
    
    Args:
        volume_change_rate: 거래량 변동률 (%)
        price_change_rate: 가격 변동률 (%)
        current_month_volume: 현재 월 거래량
        min_transaction_count: 최소 거래 건수 (기본값: 5)
        volume_threshold: 거래량 변동 임계값 (%)
        price_threshold: 가격 변동 임계값 (%)
    
    Returns:
        {
            "phase": int | None,
            "phase_label": str,
            "description": str,
            "current_month_volume": int,
            "min_required_volume": int
        } 딕셔너리
    """
    # 예외 처리: 거래량이 너무 적은 경우
    if current_month_volume < min_transaction_count:
        return {
            "phase": None,
            "phase_label": "데이터 부족",
            "description": f"데이터 부족으로 판별 불가 (현재 월 거래량: {current_month_volume}건, 최소 요구량: {min_transaction_count}건)",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 임계값 기반 판별
    volume_up = volume_change_rate > volume_threshold
    volume_down = volume_change_rate < -volume_threshold
    price_up = price_change_rate > price_threshold
    price_down = price_change_rate < -price_threshold
    price_stable = -price_threshold <= price_change_rate <= price_threshold
    
    # 1. 회복 (Recovery): 거래량 증가 ↑ / 가격 하락 혹은 보합 →
    if volume_up and (price_down or price_stable):
        return {
            "phase": 1,
            "phase_label": "회복",
            "description": "거래량 증가와 가격 하락/보합이 동반되는 바닥 다지기 단계입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 2. 상승 (Expansion): 거래량 증가 ↑ / 가격 상승 ↑
    if volume_up and price_up:
        return {
            "phase": 2,
            "phase_label": "상승",
            "description": "거래량 증가와 가격 상승이 동반되는 활황기입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 3. 둔화 (Slowdown): 거래량 감소 ↓ / 가격 상승 ↑
    if volume_down and price_up:
        return {
            "phase": 3,
            "phase_label": "둔화",
            "description": "거래량 감소와 가격 상승이 동반되는 에너지 고갈 단계입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 4. 후퇴 (Recession): 거래량 감소 ↓ / 가격 하락 ↓
    if volume_down and price_down:
        return {
            "phase": 4,
            "phase_label": "후퇴",
            "description": "거래량 감소와 가격 하락이 동반되는 본격 하락 단계입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 5. 침체 (Depression): 거래량 급감 ↓ / 가격 하락세 지속 ↓
    if volume_change_rate < -5.0 and price_change_rate < -1.0:
        return {
            "phase": 5,
            "phase_label": "침체",
            "description": "거래량 급감과 가격 하락세 지속이 동반되는 침체기입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 6. 천착 (Trough): 거래량 미세 증가 ↑ / 가격 하락 ↓
    if 0 < volume_change_rate <= volume_threshold and price_down:
        return {
            "phase": 6,
            "phase_label": "천착",
            "description": "거래량 미세 증가와 가격 하락이 동반되는 반등 준비 단계입니다.",
            "current_month_volume": current_month_volume,
            "min_required_volume": min_transaction_count
        }
    
    # 기본값: 중립
    return {
        "phase": 0,
        "phase_label": "중립",
        "description": "시장이 중립 상태입니다.",
        "current_month_volume": current_month_volume,
        "min_required_volume": min_transaction_count
    }
```

**임계값 설정 테이블 설계 (선택사항):**
```sql
-- 지역별 임계값 설정 테이블
CREATE TABLE market_phase_thresholds (
    threshold_id SERIAL PRIMARY KEY,
    region_type VARCHAR(20) NOT NULL,  -- "전국", "수도권", "지방5대광역시"
    region_name VARCHAR(50),  -- NULL이면 전체, "부산" 등 지역명
    volume_threshold DECIMAL(5, 2) NOT NULL DEFAULT 2.0,
    price_threshold DECIMAL(5, 2) NOT NULL DEFAULT 0.5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    UNIQUE(region_type, region_name)
);

-- 예시 데이터
INSERT INTO market_phase_thresholds (region_type, region_name, volume_threshold, price_threshold) VALUES
('전국', NULL, 2.0, 0.5),
('수도권', NULL, 2.5, 0.6),
('지방5대광역시', '부산', 1.8, 0.4),
('지방5대광역시', '대구', 1.5, 0.4);
```

### 2.5 구현 시 주의사항

1. **데이터 정합성**:
   - 거래량 데이터는 `sales` 테이블에서 조회
   - 가격 데이터는 `house_scores` 테이블에서 조회 (`index_type = 'APT'`)
   - 가격 변동률은 **최근 3개월 이동평균 변동률**을 사용 (단일 월 데이터 사용 금지)
   - 두 데이터의 기준 년월이 일치해야 함

2. **지역별 집계**:
   - 전국/수도권: 전체 데이터를 평균으로 집계
   - 지방5대광역시: 각 지역별로 개별 계산

3. **가격 변동률 계산**:
   - **최근 3개월 이동평균 변동률** 사용
   - 최근 3개월 평균 가격 vs 이전 3개월 평균 가격 비교
   - 최소 6개월 데이터 필요 (3개월씩 2개 구간)
   - SQL 또는 Python에서 이동평균 계산 후 변동률 산출

4. **임계값 동적 관리**:
   - **우선순위**: API 파라미터 > 지역별 설정값 테이블 > 기본값
   - `volume_threshold`, `price_threshold` 파라미터로 API에서 받을 수 있음
   - 지역별 설정값 테이블(`market_phase_thresholds`)에서 조회 가능
   - 기본값: `volume_threshold = 2.0`, `price_threshold = 0.5`
   - 지역별로 시장 변동성이 다르므로 지역별 임계값 설정 권장

5. **예외 처리**:
   - **거래량 부족 검증**: 현재 월 거래량이 `min_transaction_count` 미만이면 국면 판별 불가
   - 기본 `min_transaction_count = 5` (월 거래 5건 미만)
   - 데이터 부족 시 응답:
     ```json
     {
       "phase": null,
       "phase_label": "데이터 부족",
       "description": "데이터 부족으로 판별 불가 (현재 월 거래량: 3건, 최소 요구량: 5건)",
       "current_month_volume": 3,
       "min_required_volume": 5
     }
     ```
   - 가격 데이터 부족 시에도 유사한 예외 처리 필요

6. **성능 최적화**:
   - Redis 캐싱 적용 (TTL: 1시간, 데이터가 자주 변할 수 있음)
   - 병렬 쿼리 실행 (`asyncio.gather` 사용)
   - 이동평균 계산은 SQL에서 처리하여 Python 로직 단순화

7. **임계값 조정 가이드**:
   - 지역별 시장 변동성에 따라 임계값 조정 필요
   - 예: 거래량이 적은 지역은 `volume_threshold`를 낮춤 (1.5%)
   - 예: 가격 변동이 큰 지역은 `price_threshold`를 높임 (0.8%)
   - 침체 국면 판별을 위한 추가 임계값도 조정 가능

---

## 3. 인구 순이동 Sankey Diagram API

### 3.1 요구사항

- 인구 이동 데이터를 Sankey diagram 형식으로 제공
- 기존 API `/api/v1/statistics/population-movements` 참고 가능
- 출발 지역 → 도착 지역으로의 인구 이동 흐름을 시각화

### 3.2 기존 API 확인

기존 API: `GET /api/v1/statistics/population-movements`

**응답 형식:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01",
      "region_id": 1,
      "region_name": "서울특별시",
      "in_migration": 12345,
      "out_migration": 23456,
      "net_migration": -11111
    },
    ...
  ],
  "period": "202301 ~ 202412"
}
```

**문제점**: 기존 API는 지역별 순이동만 제공하고, 지역 간 이동 흐름(출발지 → 도착지)을 제공하지 않음.

### 3.3 새로운 API 엔드포인트 설계

```
GET /api/v1/statistics/population-movements/sankey
```

**Query Parameters:**
- `base_ym` (optional): 기준 년월 (YYYYMM, 기본값: 최신)
- `region_type` (optional): `"전국"`, `"수도권"`, `"지방5대광역시"`, 기본값: `"전국"`

**응답 예시:**
```json
{
  "success": true,
  "data": [
    {
      "from_region": "서울",
      "to_region": "경기",
      "value": 12345
    },
    {
      "from_region": "서울",
      "to_region": "인천",
      "value": 5678
    },
    {
      "from_region": "부산",
      "to_region": "서울",
      "value": 2345
    },
    ...
  ],
  "base_ym": "202412",
  "region_type": "전국"
}
```

### 3.4 데이터베이스 구조 확인

**PopulationMovement 모델:**
- `region_id`: 지역 ID
- `base_ym`: 기준 년월 (YYYYMM)
- `in_migration`: 전입 인구 수
- `out_migration`: 전출 인구 수
- `net_migration`: 순이동 인구 수 (전입 - 전출)

**문제점**: 현재 `population_movements` 테이블은 지역별 순이동만 저장하고, **지역 간 이동 흐름(출발지 → 도착지)**을 저장하지 않음.

### 3.5 해결 방안

#### 방안 1: 기존 데이터 활용 (권장하지 않음)

기존 데이터로는 지역 간 이동 흐름을 정확히 알 수 없음. `net_migration`만으로는 어느 지역에서 어느 지역으로 이동했는지 알 수 없음.

#### 방안 2: 새로운 데이터 구조 필요

Sankey diagram을 위해서는 **지역 간 이동 매트릭스** 데이터가 필요함.

**필요한 데이터 구조:**
```sql
CREATE TABLE population_movement_matrix (
    movement_matrix_id SERIAL PRIMARY KEY,
    base_ym CHAR(6) NOT NULL,
    from_region_id INTEGER NOT NULL REFERENCES states(region_id),
    to_region_id INTEGER NOT NULL REFERENCES states(region_id),
    movement_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);
```

**또는 기존 테이블에 컬럼 추가:**
- `from_region_id`: 출발 지역 ID
- `to_region_id`: 도착 지역 ID

### 3.6 임시 구현 방안 (현재 데이터로 근사치 계산)

현재 데이터로는 정확한 지역 간 이동을 알 수 없지만, 다음과 같은 근사치를 제공할 수 있음:

1. **순이동 기반 추정**:
   - `net_migration > 0`인 지역: 순유입 지역 (다른 지역에서 유입)
   - `net_migration < 0`인 지역: 순유출 지역 (다른 지역으로 유출)
   - 하지만 정확한 출발지/도착지는 알 수 없음

2. **권장 사항**:
   - **데이터 수집 단계에서 지역 간 이동 매트릭스 데이터를 수집해야 함**
   - 또는 통계청 API에서 지역 간 이동 데이터를 직접 가져와야 함

### 3.7 구현 시 주의사항

1. **데이터 제한사항**:
   - 현재 `population_movements` 테이블로는 정확한 Sankey diagram 생성 불가
   - 데이터 수집 로직 수정 필요

2. **성능 최적화**:
   - 지역 간 이동 매트릭스가 큰 경우 (전국 기준 17개 시도 × 17개 시도 = 289개 조합)
   - Redis 캐싱 필수 (TTL: 6시간)

3. **지역 필터링**:
   - 전국: 모든 시도
   - 수도권: 서울, 경기, 인천
   - 지방5대광역시: 부산, 대구, 광주, 대전, 울산

---

## 4. 랭킹 API

### 4.1 요구사항

- 가격 높은 순, 낮은 순, 거래량 높은 순으로 각 10개 아파트 조회
- 표시 정보: 가격, 아파트 이름, 주소, 평수

### 4.2 API 엔드포인트 설계

```
GET /api/v1/statistics/ranking/apartments
```

**Query Parameters:**
- `sort_by` (required): `"price_high"`, `"price_low"`, `"volume_high"`
- `limit` (optional): 조회 개수 (기본값: 10, 최대: 50)
- `region_type` (optional): `"전국"`, `"수도권"`, `"지방5대광역시"`, 기본값: `"전국"`
- `period_months` (optional, volume_high일 때): 거래량 계산 기간 (개월, 기본값: 6)

**응답 예시:**
```json
{
  "success": true,
  "data": [
    {
      "apt_id": 12345,
      "apt_name": "래미안 강남파크",
      "address": "서울특별시 강남구 역삼동",
      "exclusive_area": 84.5,
      "price": 1500000000,
      "rank": 1,
      "transaction_count": 25
    },
    {
      "apt_id": 12346,
      "apt_name": "한남더힐",
      "address": "서울특별시 용산구 한남동",
      "exclusive_area": 95.2,
      "price": 1450000000,
      "rank": 2,
      "transaction_count": 18
    },
    ...
  ],
  "sort_by": "price_high",
  "region_type": "전국",
  "limit": 10
}
```

### 4.3 데이터베이스 쿼리 설계

#### 4.3.1 가격 높은 순

```sql
SELECT 
    a.apt_id,
    a.apt_name,
    CONCAT(st.city_name, ' ', st.region_name) AS address,
    AVG(s.exclusive_area) AS exclusive_area,
    MAX(s.trans_price) AS price,
    COUNT(s.trans_id) AS transaction_count
FROM apartments a
JOIN states st ON a.region_id = st.region_id
JOIN sales s ON a.apt_id = s.apt_id
WHERE 
    a.is_deleted = false
    AND st.is_deleted = false
    AND s.is_canceled = false
    AND (s.is_deleted = false OR s.is_deleted IS NULL)
    AND s.trans_price IS NOT NULL
    AND (s.remarks != '더미' OR s.remarks IS NULL)
    -- 지역 필터 추가
GROUP BY a.apt_id, a.apt_name, st.city_name, st.region_name
HAVING COUNT(s.trans_id) >= 3  -- 최소 거래 건수 필터
ORDER BY price DESC
LIMIT 10;
```

#### 4.3.2 가격 낮은 순

```sql
-- 위 쿼리와 동일하지만 ORDER BY price ASC
ORDER BY price ASC
LIMIT 10;
```

#### 4.3.3 거래량 높은 순

```sql
SELECT 
    a.apt_id,
    a.apt_name,
    CONCAT(st.city_name, ' ', st.region_name) AS address,
    AVG(s.exclusive_area) AS exclusive_area,
    AVG(s.trans_price) AS price,
    COUNT(s.trans_id) AS transaction_count
FROM apartments a
JOIN states st ON a.region_id = st.region_id
JOIN sales s ON a.apt_id = s.apt_id
WHERE 
    a.is_deleted = false
    AND st.is_deleted = false
    AND s.is_canceled = false
    AND (s.is_deleted = false OR s.is_deleted IS NULL)
    AND s.contract_date IS NOT NULL
    AND (s.remarks != '더미' OR s.remarks IS NULL)
    AND s.contract_date >= CURRENT_DATE - INTERVAL '6 months'  -- 기간 필터
    -- 지역 필터 추가
GROUP BY a.apt_id, a.apt_name, st.city_name, st.region_name
ORDER BY transaction_count DESC
LIMIT 10;
```

### 4.4 구현 시 주의사항

1. **가격 기준**:
   - 가격 높은/낮은 순: 최근 거래가격의 최대값 또는 평균값 사용
   - 최소 거래 건수 필터 적용 (예: 최소 3건 이상)

2. **거래량 기준**:
   - 선택한 기간 내 거래 건수로 계산
   - `period_months` 파라미터로 기간 조정 가능

3. **주소 정보**:
   - `states` 테이블의 `city_name`과 `region_name`을 조합
   - 필요시 `ApartDetail` 테이블에서 상세 주소 조회

4. **평수 정보**:
   - `exclusive_area` 필드 사용 (㎡ 단위)
   - 필요시 평(3.3㎡) 단위로 변환

5. **성능 최적화**:
   - Redis 캐싱 적용 (TTL: 1시간)
   - 인덱스 확인: `sales.contract_date`, `sales.apt_id`, `apartments.apt_id`

6. **데이터 필터링**:
   - 취소된 거래 제외
   - 삭제된 데이터 제외
   - 더미 데이터 제외

---

## 5. 공통 구현 가이드

### 5.1 스키마 정의

`backend/app/schemas/statistics.py`에 다음 스키마 추가:

```python
# 거래량 API 스키마 (하이브리드 방식 - 통합)

# 월별 거래량 데이터 포인트 (통합)
class TransactionVolumeDataPoint(BaseModel):
    """월별 거래량 데이터 포인트"""
    year: int = Field(..., description="연도")
    month: int = Field(..., description="월 (1~12)")
    volume: int = Field(..., description="거래량")
    city_name: Optional[str] = Field(None, description="시도명 (지방5대광역시일 때만 포함)")

class TransactionVolumeResponse(BaseModel):
    """거래량 응답 스키마 (통합)"""
    success: bool = Field(..., description="성공 여부")
    data: List[TransactionVolumeDataPoint] = Field(..., description="월별 거래량 데이터 리스트")
    region_type: str = Field(..., description="지역 유형")
    period: str = Field(..., description="기간 설명 (예: '2018-01 ~ 2024-12')")
    max_years: int = Field(..., description="조회한 최대 연도 수")

# 시장 국면 지표 API 스키마
class MarketPhaseDataPoint(BaseModel):
    """시장 국면 지표 데이터 포인트"""
    region: Optional[str] = Field(None, description="지역명 (지방5대광역시일 때)")
    volume_change_rate: Optional[float] = Field(None, description="거래량 변동률 (%)")
    price_change_rate: Optional[float] = Field(None, description="가격 변동률 (%)")
    phase: Optional[int] = Field(None, description="국면 번호 (1~6, None이면 데이터 부족)")
    phase_label: str = Field(..., description="국면 라벨")
    description: str = Field(..., description="국면 설명")
    current_month_volume: int = Field(..., description="현재 월 거래량")
    min_required_volume: Optional[int] = Field(None, description="최소 요구 거래량 (데이터 부족 시에만 포함)")

class MarketPhaseCalculationMethod(BaseModel):
    """계산 방법 정보"""
    volume_method: str = Field(..., description="거래량 계산 방법 (average, month_over_month)")
    average_period_months: Optional[int] = Field(None, description="평균 계산 기간 (개월)")
    price_method: str = Field(..., description="가격 계산 방법 (moving_average_3months)")

class MarketPhaseThresholds(BaseModel):
    """임계값 정보"""
    volume_threshold: float = Field(..., description="거래량 변동 임계값 (%)")
    price_threshold: float = Field(..., description="가격 변동 임계값 (%)")

class MarketPhaseResponse(BaseModel):
    """시장 국면 지표 응답 스키마 (전국/수도권)"""
    success: bool = Field(..., description="성공 여부")
    data: MarketPhaseDataPoint = Field(..., description="시장 국면 지표 데이터")
    calculation_method: MarketPhaseCalculationMethod = Field(..., description="계산 방법 정보")
    thresholds: MarketPhaseThresholds = Field(..., description="사용된 임계값 정보")

class MarketPhaseListResponse(BaseModel):
    """시장 국면 지표 응답 스키마 (지방5대광역시)"""
    success: bool = Field(..., description="성공 여부")
    data: List[MarketPhaseDataPoint] = Field(..., description="지역별 시장 국면 지표 데이터 리스트")
    region_type: str = Field(..., description="지역 유형")
    calculation_method: MarketPhaseCalculationMethod = Field(..., description="계산 방법 정보")
    thresholds: MarketPhaseThresholds = Field(..., description="사용된 임계값 정보")

# 랭킹 API 스키마
class ApartmentRankingDataPoint(BaseModel):
    apt_id: int = Field(..., description="아파트 ID")
    apt_name: str = Field(..., description="아파트 이름")
    address: str = Field(..., description="주소")
    exclusive_area: float = Field(..., description="전용면적 (㎡)")
    price: Optional[int] = Field(None, description="가격 (원)")
    rank: int = Field(..., description="순위")
    transaction_count: int = Field(..., description="거래 건수")
```

### 5.2 에러 처리

- 유효하지 않은 `region_type`: `400 Bad Request`
  - 허용 값: `"전국"`, `"수도권"`, `"지방5대광역시"`
- 유효하지 않은 `max_years`: `400 Bad Request`
  - `max_years < 1` 또는 `max_years > 7`: `400 Bad Request`
  - 기본값: 7
- 유효하지 않은 `transaction_type`: `400 Bad Request`
  - 허용 값: `"sale"`, `"rent"`
- 데이터 없음: 빈 배열 반환 (에러 아님)
  - `data: []` 반환, `success: true` 유지
- 데이터베이스 오류: `500 Internal Server Error`
  - 상세 에러 메시지와 함께 로깅

### 5.3 캐싱 전략

- **거래량 API**: TTL 6시간 (데이터가 자주 변하지 않음)
  - 캐시 키: `statistics:volume:{region_type}:{transaction_type}:{max_years}`
  - 예시: `statistics:volume:수도권:sale:7`
  - 예시: `statistics:volume:전국:rent:5`
- **시장 국면 지표 API**: TTL 1시간 (데이터가 자주 변할 수 있음)
  - 캐시 키: `statistics:market-phase:{region_type}:{volume_method}:{average_period_months}`
- **인구 순이동 API**: TTL 6시간
  - 캐시 키: `statistics:population-movements:sankey:{base_ym}:{region_type}`
- **랭킹 API**: TTL 1시간
  - 캐시 키: `statistics:ranking:{sort_by}:{region_type}:{limit}:{period_months}`

### 5.4 로깅

모든 API에 다음 로깅 추가:
- 요청 파라미터 로깅
- 쿼리 실행 시간 측정
- 데이터 포인트 개수 로깅
- 에러 발생 시 상세 로깅

---

## 6. 체크리스트

### 6.1 거래량 API (하이브리드 방식 - 통합)
- [ ] 거래량 조회 API 구현 (통합)
  - [ ] `region_type` 파라미터로 지역 필터링
  - [ ] `max_years` 파라미터로 최대 연도 수 제한 (기본값: 7, 최대: 7)
  - [ ] 월별 데이터 반환 (연도, 월, 거래량)
  - [ ] 지방5대광역시일 때 `city_name` 포함하여 반환
- [ ] 백엔드 필터링 로직 구현
  - [ ] 지역 필터링 (전국/수도권/지방5대광역시)
  - [ ] 연도 범위 필터링 (최근 N년, 인덱스 활용)
  - [ ] 파라미터 검증 (`max_years` 1~7 범위 확인)
- [ ] 프론트엔드 뷰 전환 로직 구현
  - [ ] 연도별 뷰: 월별 데이터를 연도별로 집계
  - [ ] 월별 뷰: 원본 데이터를 연도별로 그룹화
  - [ ] 연도 선택 (2/3/5년) 처리
  - [ ] 지방5대광역시 지역별/연도별 그룹화 (`by_region` 모드)
  - [ ] `useMemo`로 모든 변환 결과 캐싱
- [ ] Redis 캐싱 적용
  - [ ] 캐시 키: `statistics:volume:{region_type}:{transaction_type}:{max_years}`
  - [ ] TTL: 6시간
- [ ] 스키마 정의 (통합 방식에 맞게)
- [ ] 에러 처리
- [ ] 로깅 추가

### 6.2 시장 국면 지표 API
- [ ] 거래량 변동률 계산 로직 구현
  - [ ] 과거 평균 대비 방식 구현
  - [ ] 전월 대비 방식 구현
  - [ ] 현재 월 거래량 조회 (예외 처리용)
- [ ] 가격 변동률 계산 로직 구현
  - [ ] **최근 3개월 이동평균 변동률** 계산 (단일 월 데이터 사용 금지)
  - [ ] 최근 3개월 평균 vs 이전 3개월 평균 비교
  - [ ] SQL 또는 Python에서 이동평균 계산
- [ ] 국면 판별 로직 구현
  - [ ] 임계값 동적 관리 로직 구현 (API 파라미터 > 지역별 설정값 > 기본값)
  - [ ] 거래량 부족 예외 처리 (월 거래 5건 미만 시 "데이터 부족" 반환)
  - [ ] 가격 데이터 부족 예외 처리
- [ ] 임계값 관리 시스템 구현
  - [ ] `volume_threshold`, `price_threshold` API 파라미터 지원
  - [ ] 지역별 임계값 설정 테이블(`market_phase_thresholds`) 설계 및 구현 (선택사항)
  - [ ] 임계값 조회 우선순위 로직 구현
- [ ] 지역별 집계 로직 구현
  - [ ] 전국/수도권: 전체 데이터 평균 집계
  - [ ] 지방5대광역시: 각 지역별 개별 계산
- [ ] Redis 캐싱 적용
  - [ ] 캐시 키: `statistics:market-phase:{region_type}:{volume_method}:{average_period_months}:{volume_threshold}:{price_threshold}`
  - [ ] TTL: 1시간
- [ ] 스키마 정의
  - [ ] `MarketPhaseDataPoint` 스키마 업데이트 (예외 처리 필드 추가)
  - [ ] `MarketPhaseCalculationMethod` 스키마 추가
  - [ ] `MarketPhaseThresholds` 스키마 추가
  - [ ] `MarketPhaseResponse`, `MarketPhaseListResponse` 스키마 추가
- [ ] 에러 처리
  - [ ] 거래량 부족 시 적절한 응답 반환
  - [ ] 가격 데이터 부족 시 적절한 응답 반환
  - [ ] 유효하지 않은 파라미터 검증
- [ ] 로깅 추가

### 6.3 인구 순이동 Sankey Diagram API
- [ ] 데이터 구조 확인 및 수정 필요 여부 판단
- [ ] 지역 간 이동 매트릭스 데이터 수집 로직 확인
- [ ] Sankey 형식 데이터 변환 로직 구현
- [ ] Redis 캐싱 적용
- [ ] 스키마 정의 (기존 `PopulationMovementSankeyResponse` 활용)
- [ ] 에러 처리
- [ ] 로깅 추가

### 6.4 랭킹 API
- [ ] 가격 높은 순 조회 API 구현
- [ ] 가격 낮은 순 조회 API 구현
- [ ] 거래량 높은 순 조회 API 구현
- [ ] 지역 필터링 로직 구현
- [ ] Redis 캐싱 적용
- [ ] 스키마 정의
- [ ] 에러 처리
- [ ] 로깅 추가

---

## 7. 참고 자료

- 기존 통계 API: `backend/app/api/v1/endpoints/statistics.py`
- 통계 스키마: `backend/app/schemas/statistics.py`
- 백엔드 개발 가이드: `.agent/02_backend_dev.md`
- 데이터베이스 모델:
  - `backend/app/models/sale.py`
  - `backend/app/models/rent.py`
  - `backend/app/models/apartment.py`
  - `backend/app/models/house_score.py`
  - `backend/app/models/population_movement.py`
  - `backend/app/models/state.py`
