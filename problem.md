# 문제 분석 및 해결 완료 (2차 수정)

> ✅ 모든 문제가 해결되었습니다. (2026-01-22 업데이트)

## 문제 1: 홈에서 관심 리스트가 0억으로 표시됨

### 원인 분석
1. **백엔드**: `favorites.py`에서 `current_market_price`를 조회할 때 최근 거래가 없으면 `None`이 반환됨
2. **프론트엔드**: `Dashboard.tsx`의 `mapFavoriteToProperty`에서 `fav.current_market_price || 0`으로 처리하므로, `None`이면 0이 됨
3. **캐시 문제**: 기존 캐시에 `current_market_price`가 없는 데이터가 저장되어 있을 수 있음

### 해결 방안
- 백엔드에서 최근 거래가 없으면 전체 기간에서 최신 거래가 조회
- 그래도 없으면 아파트의 평균 시세 사용
- 캐시 무효화 또는 API 응답에서 가격 데이터 보장

---

## 문제 2: 실거래 내역에서 면적이 표시되지 않음

### 원인 분석
1. **PropertyDetail.tsx line 550-562**: 거래 내역 병합 시 `area` 필드를 포함하지 않음
```typescript
...saleTransactions.map((tx) => ({
    date: tx.date ? tx.date.replace(/-/g, '.').slice(2) : '-',
    floor: `${tx.floor}층`,
    price: tx.price,
    type: '매매'  // ❌ area 필드 누락!
})),
```

2. **TransactionRow 컴포넌트 (line 232-244)**: 4개 컬럼(날짜, 유형, 층, 가격)만 있고 면적 컬럼이 없음

### 해결 방안
- 거래 내역 매핑 시 `area` 필드 추가
- `TransactionRow` 컴포넌트에 면적 컬럼 추가
- 그리드를 `grid-cols-5`로 변경

---

## 문제 3: 그래프 면적 필터에 "전체 면적" 옵션이 없음

### 원인 분석
**PropertyDetail.tsx line 880-885**: 면적 필터 옵션에 "전체" 옵션이 없음
```typescript
options={[
    { value: '84', label: '84㎡' },
    { value: '90', label: '90㎡' },
    { value: '102', label: '102㎡' },
    { value: '114', label: '114㎡' }
]}
```

### 해결 방안
- 옵션 배열 맨 앞에 `{ value: 'all', label: '전체 면적' }` 추가
- API 호출 시 `area` 파라미터를 `all`이면 생략하도록 처리

---

## 문제 4: 아파트 상세정보 그래프가 실거래 내역을 반영하지 않음

### 원인 분석
1. **API 기간 제한**: `apartments.py`에서 `months=6`으로 기본 설정되어 있어 최근 6개월만 조회
2. **데이터 부족**: 해당 아파트의 최근 6개월 내 거래가 없으면 `price_trend`가 빈 배열
3. **fallback 로직**: `price_trend`가 비어있으면 `generateChartData()`로 예시 데이터 사용

### 해결 방안
- API 호출 시 `months=36` (3년)으로 변경하여 더 많은 데이터 조회
- 백엔드에서 데이터가 없으면 전체 기간 조회하도록 로직 추가

---

## 문제 5: 홈에서 데이터 로딩 속도가 느림

### 원인 분석
**Dashboard.tsx line 380-400**: 각 자산마다 개별 `fetchApartmentTransactions` 호출
```typescript
const chartDataPromises = allAssets.map(async (asset) => {
    // 각 자산마다 개별 API 호출 → N번의 요청 발생
    const transRes = await fetchApartmentTransactions(asset.aptId, 'sale', 20);
    ...
});
```

### 해결 방안
1. **차트 데이터 지연 로딩**: 초기 로딩 시 차트 데이터 없이 먼저 표시, 이후 차트 데이터 로드
2. **백엔드 벌크 API**: 여러 아파트의 price_trend를 한 번에 조회하는 API 추가
3. **캐싱 활용**: 이미 조회한 데이터는 클라이언트에서 캐싱

---

## 해결 완료 상태

| 순서 | 문제 | 상태 | 수정 파일 |
|------|------|------|-----------|
| 1 | 문제 1: 0억 표시 | ✅ 해결 | `backend/app/api/v1/endpoints/favorites.py` |
| 2 | 문제 4: 그래프 미반영 | ✅ 해결 | `frontend/services/api.ts`, `PropertyDetail.tsx` |
| 3 | 문제 2: 면적 미표시 | ✅ 해결 | `frontend/components/views/PropertyDetail.tsx` |
| 4 | 문제 3: 전체 면적 옵션 | ✅ 해결 | `frontend/components/views/PropertyDetail.tsx` |
| 5 | 문제 5: 로딩 속도 | ✅ 해결 | `frontend/components/views/Dashboard.tsx` |

---

## 2차 수정 (2026-01-22)

### 핵심 문제: 날짜 범위 필터
- **원인**: DB 데이터가 2022년인데 `months=36`으로 2023년 이후만 조회
- **해결**: 실제 데이터가 있는 기간을 자동 감지하여 조회

### 수정된 파일

#### 1. `backend/app/api/v1/endpoints/apartments.py`
- `price_trend` 조회 시 실제 데이터의 날짜 범위를 먼저 확인
- 데이터가 있는 기간에 맞춰 자동 조회
- 변화량 계산도 실제 데이터 기준으로 수정

#### 2. `backend/app/api/v1/endpoints/my_properties.py`
- **버그 수정**: 계산한 `current_market_price`를 응답에 반영 (기존: `prop.current_market_price` 반환)
- 면적 필터 완화: 해당 아파트의 가장 최근 거래가 조회
- `purchase_price` 필드 추가 반환

#### 3. `backend/app/api/v1/endpoints/favorites.py`
- 캐시에 `current_market_price`가 없으면 DB 재조회
- 가격 조회 로직 강화

#### 4. `frontend/components/views/PropertyDetail.tsx`
- **필터 통합**: 그래프 필터(거래유형, 면적, 기간)가 실거래 내역에도 적용
- **기간 필터 확장**: 6개월 / 1년 / 3년 / 전체 (4개)
- **실거래 내역 필터 제거**: 그래프 필터와 연동되어 불필요

#### 5. `frontend/components/views/Dashboard.tsx`
- fallback 값 제거: API에서 실제 데이터만 사용

---

## 1차 수정 상세

### 1. 백엔드 (favorites.py)
- 관심 아파트 가격 조회 로직 개선
- 최근 거래가 없으면 전체 기간에서 최신 거래 조회
- 그래도 없으면 최근 1년 평균 거래가 사용

### 2. 프론트엔드 API (api.ts)
- `fetchApartmentTransactions`에 `months` 파라미터 추가
- 기본값 36개월(3년)으로 설정

### 3. PropertyDetail.tsx
- 거래 내역에 `area` 필드 추가 (면적 컬럼)
- `TransactionRow` 컴포넌트를 5열(날짜, 구분, 면적, 층, 거래액)로 확장
- 면적 필터에 '전체 면적' 옵션 추가
- `selectedArea` 초기값을 'all'로 변경
- API 호출 시 `months=36`으로 3년치 데이터 조회

### 4. Dashboard.tsx
- 2단계 로딩 방식 적용:
  1. 기본 데이터로 먼저 UI 표시 (빠른 초기 렌더링)
  2. 차트 데이터는 백그라운드에서 점진적 로딩 (배치 처리)
