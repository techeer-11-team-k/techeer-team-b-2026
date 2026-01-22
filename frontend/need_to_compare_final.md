# 비교 기능 프론트엔드-백엔드 연동 요구사항 (최종)

## 문서 메타
| 항목 | 내용 |
|------|------|
| 문서 제목 | 비교 기능 API 연동 요구사항 (최종 확정판) |
| 작성일 | 2026-01-21 |
| 최종 확정일 | 2026-01-21 |
| 버전 | Final (v3 기반) |
| 문서 타입 | 기술명세서 (Tech Spec) |
| 대상 독자 | 백엔드 개발자, 프론트엔드 개발자 |
| 상태 | ✅ 모든 질문 해결, 개발 준비 완료 |

---

## 한 줄 요약
아파트 비교 기능을 위해 **신규 API 2개** 개발 필요. 최대 5개 아파트 비교, 캐시 10분.

---

## 배경 & 문제 정의

### 현재 상태
- ✅ 프론트엔드 비교 기능 UI 구현 완료
- ⬜ 현재 Mock 데이터 사용 중 → 백엔드 API 연동 필요
- ✅ 백엔드 기존 API 확인 완료

### 확인된 사항
| 항목 | 상태 | 비고 |
|------|------|------|
| 지하철 정보 | ✅ 존재 | `subway_line`, `subway_station`, `subway_time` |
| 학교 정보 | ✅ 존재 | `educationFacility` (백엔드 파싱 예정) |
| 거래 내역 API | ✅ 존재 | `GET /api/v1/apartments/{id}/transactions` |
| 평형별 가격 | ✅ 가능 | 거래 내역에서 `area` 기준 그룹화 |

---

## 신규 개발 필요 API (2개)

### 1. 다중 아파트 비교 조회
```
POST /api/v1/apartments/compare
```

**목적**: 여러 아파트를 한 번에 조회하여 비교

**Request**:
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
- `GET /api/v1/apartments/{id}/detail` (기본 정보, 지하철, 학교)
- `GET /api/v1/apartments/{id}/transactions` (최근 가격, 평당가)

**에러 처리**:
- `200`: 정상 (일부 실패해도 성공한 데이터 반환)
- `400`: 잘못된 요청 (ID 6개 이상)
- `404`: 모든 아파트를 찾을 수 없음

**캐싱**: 10분

---

### 2. 평형별 가격 조회
```
GET /api/v1/apartments/{apt_id}/pyeong-prices
```

**목적**: 아파트의 평형(전용면적)별 최근 거래가 제공

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

**데이터 소스**:
- `GET /api/v1/apartments/{id}/transactions` (거래 내역)
- `area` 필드 기준 평형별 그룹화

**에러 처리**:
- `200`: 정상 (거래 없으면 빈 배열)
- `404`: 아파트를 찾을 수 없음

**캐싱**: 10분

---

## 데이터 처리 로직

### 1. 다중 아파트 비교 데이터 생성 (백엔드)
```python
def get_comparison_data(apartment_ids: list) -> list:
    """최대 5개 아파트의 비교 데이터 생성"""
    if len(apartment_ids) > 5:
        raise ValueError("최대 5개까지만 비교 가능합니다")
    
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
            schools = parse_education_facility(detail.get('educationFacility', ''))
            
            # 4. 비교 데이터 생성
            results.append({
                'id': apt_id,
                'name': detail['apt_name'],
                'region': f"{detail['sido']} {detail['sigungu']}",
                'address': detail['road_address'],
                'price': recent_sale['price'] / 10000 if recent_sale else None,
                'jeonse': recent_jeonse['price'] / 10000 if recent_jeonse else None,
                'jeonse_rate': (recent_jeonse['price'] / recent_sale['price'] * 100) if (recent_sale and recent_jeonse) else None,
                'price_per_pyeong': recent_sale['price_per_pyeong'] / 10000 if recent_sale else None,
                'households': detail['total_household_cnt'],
                'parking_total': detail['total_parking_cnt'],
                'parking_per_household': round(detail['total_parking_cnt'] / detail['total_household_cnt'], 2),
                'build_year': int(detail['use_approval_date'][:4]),
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
    
    if not results:
        raise HTTPException(status_code=404, detail="조회 가능한 아파트가 없습니다")
    
    return results
```

### 2. 평형별 가격 그룹화 (백엔드)
```python
def get_pyeong_prices(apt_id: int) -> dict:
    """평형별 최근 거래가 조회"""
    # 1. 거래 내역 조회
    response = get_recent_transactions(apt_id)
    transactions = response.get('data', {}).get('recent_transactions', [])
    
    if not transactions:
        return {
            'apartment_id': apt_id,
            'apartment_name': response.get('data', {}).get('apartment', {}).get('apt_name'),
            'pyeong_options': []
        }
    
    # 2. 평형별 그룹화
    pyeong_groups = {}
    
    for trans in transactions:
        # 평형 계산
        pyeong = round(trans['area'] / 3.3058)
        pyeong_type = f"{pyeong}평형"
        
        # 그룹 초기화
        if pyeong_type not in pyeong_groups:
            pyeong_groups[pyeong_type] = {
                'pyeong_type': pyeong_type,
                'area_m2': trans['area'],
                'sales': [],
                'jeonse': []
            }
        
        # 거래 타입별 분류
        if trans['trans_type'] == '매매':
            pyeong_groups[pyeong_type]['sales'].append(trans)
        else:
            pyeong_groups[pyeong_type]['jeonse'].append(trans)
    
    # 3. 평형별 최근 거래 추출
    pyeong_options = []
    for pyeong_type, data in sorted(pyeong_groups.items()):
        option = {
            'pyeong_type': pyeong_type,
            'area_m2': round(data['area_m2'], 2)
        }
        
        # 최근 매매가
        if data['sales']:
            recent_sale = data['sales'][0]
            option['recent_sale'] = {
                'price': round(recent_sale['price'] / 10000, 2),
                'date': recent_sale['date'],
                'price_per_pyeong': round(recent_sale['price_per_pyeong'] / 10000, 2)
            }
        
        # 최근 전세가
        if data['jeonse']:
            recent_jeonse = data['jeonse'][0]
            option['recent_jeonse'] = {
                'price': round(recent_jeonse['price'] / 10000, 2),
                'date': recent_jeonse['date'],
                'price_per_pyeong': round(recent_jeonse['price_per_pyeong'] / 10000, 2)
            }
        
        pyeong_options.append(option)
    
    return {
        'apartment_id': apt_id,
        'apartment_name': response.get('data', {}).get('apartment', {}).get('apt_name'),
        'pyeong_options': pyeong_options
    }
```

### 3. 학교 정보 파싱 (백엔드)
```python
import re

def parse_education_facility(text: str) -> dict:
    """educationFacility 텍스트 파싱"""
    if not text:
        return {"elementary": [], "middle": [], "high": []}
    
    schools = {
        "elementary": [],
        "middle": [],
        "high": []
    }
    
    # 정규표현식으로 학교 정보 추출
    elementary = re.findall(r'초등학교\(([^)]+)\)', text)
    schools["elementary"] = [{"name": name.strip()} for name in elementary]
    
    middle = re.findall(r'중학교\(([^)]+)\)', text)
    schools["middle"] = [{"name": name.strip()} for name in middle]
    
    high = re.findall(r'고등학교\(([^)]+)\)', text)
    schools["high"] = [{"name": name.strip()} for name in high]
    
    return schools

# 예시
# 입력: "초등학교(괴정초등학교) 중학교(괴정중학교) 고등학교(부산고등학교) 대학교(동주대학교)"
# 출력: {
#   "elementary": [{"name": "괴정초등학교"}],
#   "middle": [{"name": "괴정중학교"}],
#   "high": [{"name": "부산고등학교"}]
# }
```

---

## 기존 API 활용

| 기능 | 엔드포인트 | 용도 |
|------|-----------|------|
| 아파트 검색 | `GET /api/v1/search/apartments` | 비교 대상 검색 |
| 아파트 상세 | `GET /api/v1/apartments/{id}/detail` | 기본 정보, 지하철, 학교 |
| 거래 내역 | `GET /api/v1/apartments/{id}/transactions` | 평형별 가격 소스 |

---

## 개발 범위

### Phase 1 (필수) - 비교 기능 핵심
| API | 설명 | 우선순위 | 예상 기간 |
|-----|------|----------|-----------|
| `POST /api/v1/apartments/compare` | 다중 아파트 비교 | 🔴 필수 | 1.5일 |
| `GET /api/v1/apartments/{id}/pyeong-prices` | 평형별 가격 | 🔴 필수 | 0.5일 |

### Phase 2 (선택) - UX 향상
| 작업 | 설명 | 우선순위 | 예상 기간 |
|------|------|----------|-----------|
| 학교 정보 파싱 | educationFacility 구조화 | 🟡 중간 | 0.5일 |

**예상 총 개발 기간**: 3일

---

## 요구사항 상세

### FR-01: 다중 아파트 비교 조회 API
**필수 데이터**:
- ✅ 아파트 기본 정보 (id, 이름, 주소, 지역)
- ✅ 가격 정보 (매매가, 전세가, 전세가율, 평당가)
- ✅ 시설 정보 (세대수, 주차, 건축연도)
- ✅ 지하철역 정보 (노선, 역명, 도보시간)
- ✅ 학교 정보 (초/중/고 분류)

**제약사항**:
- 최대 5개까지만 조회 가능
- 일부 아파트 조회 실패 시에도 성공한 데이터 반환
- 응답 시간 < 1초
- 캐시 TTL: 10분

### FR-02: 평형별 가격 조회 API
**필수 데이터**:
- ✅ 평형 타입 ("24평형", "38평형" 등)
- ✅ 전용면적 (m²)
- ✅ 최근 매매가 (억 원)
- ✅ 최근 전세가 (억 원)
- ✅ 평당가 (만원)
- ✅ 거래 날짜

**제약사항**:
- 거래 데이터 없으면 빈 배열 반환
- 캐시 TTL: 10분

---

## 테스트 케이스

### 다중 아파트 비교 API
| ID | 시나리오 | 입력 | 기대 결과 |
|----|----------|------|-----------|
| TC-01 | 단일 조회 | apt_ids: [1] | 1개 데이터 |
| TC-02 | 다중 조회 | apt_ids: [1,2,3] | 3개 데이터 |
| TC-03 | 최대 개수 | apt_ids: [1,2,3,4,5] | 5개 데이터 |
| TC-04 | 초과 개수 | apt_ids: [1,2,3,4,5,6] | 400 에러 |
| TC-05 | 일부 없음 | apt_ids: [1, 99999] | 200, 1개 데이터 |
| TC-06 | 모두 없음 | apt_ids: [99999] | 404 에러 |
| TC-07 | 학교 있음 | apt_id: 1 | schools 객체 포함 |
| TC-08 | 학교 없음 | apt_id: 2 | schools 빈 객체 |

### 평형별 가격 API
| ID | 시나리오 | 입력 | 기대 결과 |
|----|----------|------|-----------|
| TC-09 | 정상 조회 | apt_id: 1 | 평형 목록 반환 |
| TC-10 | 거래 없음 | apt_id: 2 | 빈 배열 |
| TC-11 | 존재하지 않음 | apt_id: 99999 | 404 에러 |

---

## TODO 체크리스트

### 백엔드 개발
- [ ] `POST /api/v1/apartments/compare` API 개발 (1.5일)
  - [ ] 다중 조회 로직
  - [ ] 데이터 조합 로직
  - [ ] 에러 처리
  - [ ] 캐싱 (10분)
  
- [ ] `GET /api/v1/apartments/{id}/pyeong-prices` API 개발 (0.5일)
  - [ ] 평형별 그룹화 로직
  - [ ] 매매/전세 분리
  - [ ] 캐싱 (10분)
  
- [ ] 학교 정보 파싱 로직 (0.5일)
  - [ ] 정규표현식 파싱
  - [ ] 초/중/고 분류
  - [ ] 예외 처리

### 프론트엔드 연동
- [ ] API 연동 (1일)
  - [ ] 비교 API 호출
  - [ ] 평형 선택 API 호출
  - [ ] 데이터 바인딩
  
- [ ] 에러 핸들링 (0.5일)
  - [ ] 로딩 상태
  - [ ] 에러 메시지
  - [ ] 재시도 로직

### QA
- [ ] 통합 테스트 (0.5일)
  - [ ] API 연동 테스트
  - [ ] 성능 테스트
  - [ ] 에러 시나리오 테스트

---

## 비기능 요구사항

| ID | 요구사항 | 기준 | 비고 |
|----|----------|------|------|
| NFR-01 | 응답 속도 | < 1초 | 다중 조회 기준 |
| NFR-02 | 캐싱 | 10분 TTL | Redis 캐시 |
| NFR-03 | 최대 비교 개수 | 5개 | UI 제약 |
| NFR-04 | 에러 처리 | Graceful degradation | 일부 실패해도 계속 진행 |

---

## 확정 사항 요약

### ✅ 모든 확인 완료
1. ~~지하철 데이터~~ → 존재 (`apart_details` 테이블)
2. ~~학교 데이터~~ → 존재 (`educationFacility` 필드)
3. ~~거래 내역 API~~ → 존재 (`/transactions`)
4. ~~평형별 가격 처리~~ → **백엔드에서 처리**
5. ~~최대 비교 개수~~ → **5개**
6. ~~캐시 TTL~~ → **10분**

### 🚀 개발 시작 가능
- 신규 API: 2개
- 예상 기간: 3일
- 기존 API 활용: 3개

---

## 참고 자료

### 문서
- [백엔드 기능 문서](c:\dev\techeer-team-b-2026\.document\backend-features.md)
- [문서화 달인 프롬프트](c:\dev\techeer-team-b-2026\.agent\10_master_of_documentation.txt)

### 코드
- 프론트엔드: `c:\dev\b\frontend-test\components\views\Comparison.tsx`

### 기존 API
- `GET /api/v1/search/apartments` - 아파트 검색
- `GET /api/v1/apartments/{apt_id}/detail` - 아파트 상세
- `GET /api/v1/apartments/{apt_id}/transactions` - 거래 내역

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|-----------|
| v1.0 | 2026-01-21 | 초안 (3개 API 필요) |
| v2.0 | 2026-01-21 | 지하철/학교 확인 (2개 API 필요) |
| v3.0 | 2026-01-21 | 거래 내역 API 확인 (2개 API 필요) |
| **Final** | **2026-01-21** | **모든 질문 해결, 개발 준비 완료** |

---

**문서 상태**: ✅ **확정 완료 - 즉시 개발 가능**
