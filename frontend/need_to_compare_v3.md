# 비교 기능 프론트엔드-백엔드 연동 요구사항 (v3)

## 문서 메타
| 항목 | 내용 |
|------|------|
| 문서 제목 | 비교 기능 API 연동 요구사항 (최종판) |
| 작성일 | 2026-01-21 |
| 버전 | 3.0.0 |
| 문서 타입 | 기술명세서 (Tech Spec) |
| 대상 독자 | 백엔드 개발자, 프론트엔드 개발자 |
| 변경 이력 | v2 대비 기존 거래 내역 API 활용으로 신규 개발 축소 |

---

## 한 줄 요약
아파트 비교 기능을 위해 **신규 API 2개** 개발 필요 (다중 아파트 비교 + 평형별 가격). 최대 5개 아파트 비교, 캐시 10분.

---

## 배경 & 문제 정의

### 현재 상태
- 프론트엔드에서 아파트 비교 기능 UI 구현 완료
- 현재 하드코딩된 Mock 데이터 사용 중
- 백엔드 API 확인 결과:
  - ✅ 지하철/학교 데이터 존재 (상세정보 API)
  - ✅ 거래 내역 API 존재 (평형별 가격 활용 가능)

### 확인된 기존 API

#### 1. 아파트 상세정보 API
```json
GET /api/v1/apartments/{apt_id}/detail

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

#### 2. 거래 내역 API (신규 확인)
```json
GET /api/v1/apartments/{apt_id}/transactions

{
  "data": {
    "apartment": {
      "apt_id": 1,
      "apt_name": "경희궁의아침4단지"
    },
    "recent_transactions": [
      {
        "trans_id": 2631974,
        "date": "2025-08-18",
        "price": 252000,
        "area": 150.77,
        "floor": 6,
        "price_per_sqm": 1671,
        "price_per_pyeong": 5515.7,
        "trans_type": "매매",
        "is_canceled": false
      }
    ],
    "statistics": {
      "avg_price": 201714,
      "avg_price_per_pyeong": 4943.6,
      "min_price": 169000,
      "max_price": 252000
    }
  }
}
```

**활용 가능성**:
- ✅ 평형별 가격 정보 (`area` 필드)
- ✅ 매매/전세 구분 (`trans_type`)
- ✅ 평당가 이미 계산됨 (`price_per_pyeong`)
- ✅ 통계 정보 (`statistics`)

### 문제점
1. ✅ ~~지하철 정보~~ → 이미 존재
2. ✅ ~~학교 정보~~ → 존재 (백엔드 파싱 예정)
3. ✅ ~~평형별 가격~~ → 거래 내역 API로 해결
4. ❌ **다중 아파트 동시 조회 API만 필요!**

---

## 목표 / 비목표

### 목표
- [ ] 아파트 비교 기능의 백엔드 API 연동
- [ ] 실시간 데이터 기반 비교 분석 제공
- [ ] 기존 API 최대한 활용하여 개발 범위 최소화
- [ ] 학교 정보 구조화 (백엔드 파싱)

### 비목표
- ~~평형별 가격 API 신규 개발~~ → 기존 API 활용
- 비교 결과 공유 기능 (추후 개발)
- 비교 결과 PDF 다운로드 (추후 개발)

---

## 범위 (Scope)

### In Scope
- 아파트 검색 및 선택
- 1:1 비교 및 다수 비교 (최대 **5개**)
- 평형별 가격 비교 (신규 API 개발)
- 주변 학교 정보 표시

### Out of Scope
- AI 기반 비교 추천
- 비교 결과 저장 기능

---

## 요구사항

### 기능 요구사항 (FR)

#### FR-01: 다중 아파트 비교 조회 API (신규 개발 필요)
| 항목 | 내용 |
|------|------|
| 설명 | 여러 아파트를 한 번에 조회하여 비교 데이터 반환 |
| 입력 | 아파트 ID 배열 (최대 **5개**) |
| 출력 | 아파트별 상세 정보 + 비교용 통계 + 구조화된 학교 정보 |
| 우선순위 | 🔴 필수 |

**필요 데이터**:
```typescript
- 아파트 기본 정보 (id, 이름, 주소, 지역)
- 가격 정보 (최근 매매가, 전세가, 전세가율)
- 평당가 (최근 거래 기준)
- 세대수 (total_household_cnt)
- 주차공간 (total_parking_cnt)
- 세대당 주차 (parking_per_household)
- 건축연도 (use_approval_date)
- 지하철역 (subway_line, subway_station, subway_time)
- 학교 정보 (구조화된 JSON 배열)
```

#### FR-02: 평형별 가격 조회 API (신규 개발)
| 항목 | 내용 |
|------|------|
| 설명 | 거래 내역 API를 활용하여 평형별 가격 정보를 그룹화하여 제공 |
| 엔드포인트 | `GET /api/v1/apartments/{apt_id}/pyeong-prices` |
| 처리 방법 | **백엔드에서 `area` 기준 그룹화** |
| 우선순위 | 🔴 필수 |

**데이터 변환 로직**:
```typescript
// 평형별로 그룹화
interface PyeongGroup {
  pyeong_type: string;  // "38평형"
  area_m2: number;      // 124.17
  recent_sale?: {
    price: number;          // 230 (억)
    date: string;           // "2025-03-25"
    price_per_pyeong: number; // 6112.6 (만원)
  };
  recent_jeonse?: {
    price: number;
    date: string;
    price_per_pyeong: number;
  };
}

function groupByPyeong(transactions) {
  const grouped = new Map();
  
  transactions.forEach(trans => {
    const pyeong = Math.round(trans.area / 3.3058);
    const key = `${pyeong}평형`;
    
    if (!grouped.has(key)) {
      grouped.set(key, {
        pyeong_type: key,
        area_m2: trans.area,
        sales: [],
        jeonse: []
      });
    }
    
    const group = grouped.get(key);
    if (trans.trans_type === '매매') {
      group.sales.push(trans);
    } else {
      group.jeonse.push(trans);
    }
  });
  
  // 각 평형별 최근 거래 추출
  return Array.from(grouped.values()).map(group => ({
    pyeong_type: group.pyeong_type,
    area_m2: group.area_m2,
    recent_sale: group.sales[0] ? {
      price: group.sales[0].price / 10000, // 억 단위
      date: group.sales[0].date,
      price_per_pyeong: group.sales[0].price_per_pyeong / 10000
    } : null,
    recent_jeonse: group.jeonse[0] ? {
      price: group.jeonse[0].price / 10000,
      date: group.jeonse[0].date,
      price_per_pyeong: group.jeonse[0].price_per_pyeong / 10000
    } : null
  }));
}
```

#### FR-03: 학교 정보 파싱 및 구조화
| 항목 | 내용 |
|------|------|
| 설명 | educationFacility 텍스트를 파싱하여 구조화된 JSON으로 제공 |
| 우선순위 | 🟡 중간 (Phase 2) |
| 담당 | 백엔드 |

#### FR-04: 아파트 검색 API (기존 활용)
| 항목 | 내용 |
|------|------|
| 엔드포인트 | `GET /api/v1/search/apartments` |
| 우선순위 | ✅ 기존 API 활용 |

### 비기능 요구사항 (NFR)

| ID | 요구사항 | 기준 |
|----|----------|------|
| NFR-01 | 응답 속도 | 다중 아파트 조회 < 1초 |
| NFR-02 | 캐싱 | 비교 데이터 **10분** 캐시 |
| NFR-03 | 에러 처리 | 일부 아파트 조회 실패 시에도 성공한 데이터 반환 |

---

## API/인터페이스 설계

### API-01: 다중 아파트 비교 조회 (신규 개발)
```
POST /api/v1/apartments/compare
```

**Request Body**:
```json
{
  "apartment_ids": [1, 2, 3, 4, 5]  // 최대 5개
}
```

**Response**:
```json
{
  "apartments": [
    {
      "id": 1,
      "name": "경희궁의아침4단지",
      "region": "서울시 종로구",
      "address": "서울시 종로구 신문로2가",
      "price": 23.0,
      "jeonse": 15.0,
      "jeonse_rate": 65.2,
      "price_per_pyeong": 611.3,
      "households": 800,
      "parking_total": 720,
      "parking_per_household": 0.9,
      "build_year": 2010,
      "subway": {
        "line": "5호선",
        "station": "광화문역",
        "walking_time": "5~10분이내"
      },
      "schools": {
        "elementary": [{"name": "경희초등학교"}],
        "middle": [{"name": "경희중학교"}],
        "high": [{"name": "경희고등학교"}]
      }
    }
  ]
}
```

**데이터 소스**:
- 기본 정보: `GET /api/v1/apartments/{id}/detail`
- 최근 가격: 거래 내역 API에서 최근 거래 추출
- 평당가: 거래 내역 API의 `price_per_pyeong` 활용

**에러 처리**:
- 200: 정상 (일부 실패해도 성공한 데이터 반환)
- 400: 잘못된 요청 (ID 개수 초과)
- 404: 모든 아파트를 찾을 수 없음

### API-02: 평형별 가격 조회 (신규 개발)
```
GET /api/v1/apartments/{apt_id}/pyeong-prices
```

**Response**:
```json
{
  "apartment_id": 1,
  "apartment_name": "경희궁의아침4단지",
  "pyeong_options": [
    {
      "pyeong_type": "38평형",
      "area_m2": 124.17,
      "recent_sale": {
        "price": 23.0,
        "date": "2025-03-25",
        "price_per_pyeong": 611.3
      },
      "recent_jeonse": {
        "price": 15.0,
        "date": "2025-02-10",
        "price_per_pyeong": 398.7
      }
    },
    {
      "pyeong_type": "46평형",
      "area_m2": 150.77,
      "recent_sale": {
        "price": 25.2,
        "date": "2025-08-18",
        "price_per_pyeong": 551.6
      }
    }
  ]
}
```

---

## 데이터 처리 로직

### 1. 다중 아파트 비교 데이터 생성
```python
def get_comparison_data(apartment_ids: list) -> list:
    results = []
    
    for apt_id in apartment_ids:
        try:
            # 1. 상세정보 조회
            detail = get_apartment_detail(apt_id)
            
            # 2. 거래 내역에서 최근 가격 추출
            transactions = get_recent_transactions(apt_id)
            recent_sale = next((t for t in transactions if t['trans_type'] == '매매'), None)
            recent_jeonse = next((t for t in transactions if t['trans_type'] == '전세'), None)
            
            # 3. 학교 정보 파싱
            schools = parse_education_facility(detail.get('educationFacility'))
            
            # 4. 비교 데이터 생성
            results.append({
                'id': apt_id,
                'name': detail['apt_name'],
                'region': f"{detail['sido']} {detail['sigungu']}",
                'address': detail['road_address'],
                'price': recent_sale['price'] / 10000 if recent_sale else None,
                'jeonse': recent_jeonse['price'] / 10000 if recent_jeonse else None,
                'jeonse_rate': calculate_jeonse_rate(recent_jeonse, recent_sale),
                'price_per_pyeong': recent_sale['price_per_pyeong'] / 10000 if recent_sale else None,
                'households': detail['total_household_cnt'],
                'parking_total': detail['total_parking_cnt'],
                'parking_per_household': detail['total_parking_cnt'] / detail['total_household_cnt'],
                'build_year': parse_year(detail['use_approval_date']),
                'subway': {
                    'line': detail.get('subway_line'),
                    'station': detail.get('subway_station'),
                    'walking_time': detail.get('subway_time')
                },
                'schools': schools
            })
        except Exception as e:
            logger.warning(f"Failed to get data for apt_id {apt_id}: {e}")
            continue
    
    return results
```

### 2. 평형별 가격 그룹화
```python
def get_pyeong_prices(apt_id: int) -> list:
    # 거래 내역 조회
    transactions = get_recent_transactions(apt_id)
    
    # 평형별 그룹화
    pyeong_groups = {}
    
    for trans in transactions['recent_transactions']:
        pyeong = round(trans['area'] / 3.3058)
        pyeong_type = f"{pyeong}평형"
        
        if pyeong_type not in pyeong_groups:
            pyeong_groups[pyeong_type] = {
                'pyeong_type': pyeong_type,
                'area_m2': trans['area'],
                'sales': [],
                'jeonse': []
            }
        
        if trans['trans_type'] == '매매':
            pyeong_groups[pyeong_type]['sales'].append(trans)
        else:
            pyeong_groups[pyeong_type]['jeonse'].append(trans)
    
    # 평형별 최근 거래 추출
    result = []
    for pyeong_type, data in pyeong_groups.items():
        option = {
            'pyeong_type': pyeong_type,
            'area_m2': data['area_m2']
        }
        
        if data['sales']:
            recent_sale = data['sales'][0]
            option['recent_sale'] = {
                'price': recent_sale['price'] / 10000,
                'date': recent_sale['date'],
                'price_per_pyeong': recent_sale['price_per_pyeong'] / 10000
            }
        
        if data['jeonse']:
            recent_jeonse = data['jeonse'][0]
            option['recent_jeonse'] = {
                'price': recent_jeonse['price'] / 10000,
                'date': recent_jeonse['date'],
                'price_per_pyeong': recent_jeonse['price_per_pyeong'] / 10000
            }
        
        result.append(option)
    
    return result
```

### 3. 학교 정보 파싱
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

---

## 기존 API 활용 현황

### 활용 가능 (변경 없음)
| 기능 | 기존 API | 활용도 |
|------|----------|--------|
| 아파트 검색 | `GET /api/v1/search/apartments` | ✅ 그대로 사용 |
| 아파트 상세 | `GET /api/v1/apartments/{id}/detail` | ✅ 비교 데이터 소스 |
| 거래 내역 | `GET /api/v1/apartments/{id}/transactions` | ✅ **평형별 가격 소스** |

### 신규 개발 필요
| 기능 | 제안 API | 우선순위 |
|------|----------|----------|
| 다중 아파트 비교 | `POST /api/v1/apartments/compare` | 🔴 필수 |
| 평형별 가격 | `GET /api/v1/apartments/{id}/pyeong-prices` | 🔴 필수 |

---

## 구현 우선순위

### Phase 1 (필수)
1. **다중 아파트 비교 API** (`POST /api/v1/apartments/compare`)
   - 기본 정보 + 가격 정보 + 시설 정보
   - 기존 상세정보 API + 거래 내역 API 조합
   - 최대 5개 아파트 동시 조회

2. **평형별 가격 API** (`GET /api/v1/apartments/{id}/pyeong-prices`)
   - 거래 내역 API 기반 평형별 그룹화
   - 매매/전세 최근 거래가 제공

### Phase 2 (선택)
3. **학교 정보 파싱**
   - educationFacility 텍스트 파싱
   - 구조화된 JSON 제공

---

## 오픈 이슈 & 리스크

| ID | 이슈 | 영향 | 담당 | 상태 |
|----|------|------|------|------|
| ~~ISS-01~~ | ~~지하철역 데이터~~ | - | - | ✅ 해결 |
| ~~ISS-02~~ | ~~학교 데이터~~ | - | - | ✅ 해결 |
| ~~ISS-03~~ | ~~평형별 가격 API~~ | - | - | ✅ 기존 API 활용 |
| ~~ISS-04~~ | ~~거래 내역 API 엔드포인트~~ | - | - | ✅ 확인됨 (`/transactions`) |
| ~~ISS-05~~ | ~~평형별 가격 처리 위치~~ | - | - | ✅ 백엔드 처리 결정 |
| ISS-06 | 거래 데이터 없는 아파트 처리 | UI 표시 | 프론트엔드 | ⬜ |

---

## TODO

| 작업 | 담당 | 우선순위 | 예상 기간 | 상태 |
|------|------|----------|-----------|------|
| ~~거래 내역 API 엔드포인트 확인~~ | 백엔드 | - | - | ✅ 완료 |
| 다중 아파트 비교 API 개발 | 백엔드 | 높음 | 1.5일 | ⬜ |
| 평형별 가격 API 개발 | 백엔드 | 높음 | 0.5일 | ⬜ |
| 학교 정보 파싱 로직 구현 | 백엔드 | 중간 | 0.5일 | ⬜ |
| API 연동 (비교 기능) | 프론트엔드 | 높음 | 1일 | ⬜ |
| 평형별 가격 API 연동 | 프론트엔드 | 높음 | 0.5일 | ⬜ |
| 에러 핸들링 구현 | 프론트엔드 | 중간 | 0.5일 | ⬜ |
| 통합 테스트 | QA | 중간 | 0.5일 | ⬜ |

**예상 총 개발 기간**: 3일

---

## 확인 질문

### ✅ 해결된 질문
1. ~~지하철역 데이터 존재?~~ → ✅ 존재
2. ~~학교 데이터 존재?~~ → ✅ 존재
3. ~~학교 파싱 담당?~~ → ✅ 백엔드
4. ~~평형별 가격 API 필요?~~ → ✅ 기존 API로 해결
5. ~~전세 데이터 포함?~~ → ✅ 포함됨
6. ~~모든 아파트 사용 가능?~~ → ✅ 가능
7. ~~거래 내역 API 엔드포인트?~~ → ✅ `GET /api/v1/apartments/{apt_id}/transactions`
8. ~~평형별 가격 처리 위치?~~ → ✅ **백엔드에서 처리**
9. ~~다중 아파트 조회 최대 개수?~~ → ✅ **5개**
10. ~~비교 데이터 캐시 TTL?~~ → ✅ **10분**

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 1.0.0 | 2026-01-21 | 초안 작성 |
| 2.0.0 | 2026-01-21 | 지하철/학교 데이터 존재 확인, API 스펙 구체화 |
| 3.0.0 | 2026-01-21 | 기존 거래 내역 API 확인, 평형별 가격 처리 백엔드로 결정, 최대 비교 개수 5개, 캐시 TTL 10분 |

---

## 개발 범위 비교

| 항목 | v1 | v2 | v3 (현재) |
|------|----|----|-----------|
| 신규 API 개발 | 3개 | 2개 | **2개** |
| 기존 API 활용 | 1개 | 2개 | **3개** |
| 최대 비교 개수 | 8개 | 8개 | **5개** |
| 캐시 TTL | 5분 | 5분 | **10분** |
| 예상 개발 기간 | 4~5일 | 3~4일 | **3일** |

---

## 참고 자료

- [백엔드 기능 문서](/.document/backend-features.md)
- 프론트엔드 컴포넌트: `components/views/Comparison.tsx`
- 기존 API:
  - `GET /api/v1/apartments/{apt_id}/detail`
  - `GET /api/v1/apartments/{apt_id}/transactions` (거래 내역)
