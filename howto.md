# 아파트 매칭 알고리즘 개선 가이드

## 1. 개요 및 핵심 원칙

본 문서는 공공데이터(실거래가 로그)와 마스터 데이터(아파트 현황)를 매칭하는 시스템의 고도화 방안을 설명합니다.

### 🚨 최우선 원칙: Zero False Positive

> **"미매칭(No Match)은 허용되지만, 오매칭(Mismatch)은 절대 발생해서는 안 된다."**

- 모호한 경우 과감히 매칭을 포기(Drop)하는 **보수적인 알고리즘** 채택
- 텍스트 유사도가 아무리 높아도, 핵심 식별자(단지 번호, 차수, 브랜드)가 다르면 **즉시 거부(Veto)**

---

## 2. 문제 상황

### 2.1. 데이터 소스 불일치

| 구분 | apartments 테이블 (k-Apt) | 거래 API (실거래가) |
|------|---------------------------|---------------------|
| 출처 | 공공데이터 k-Apt API | 국토부 실거래가 API |
| 식별자 | kapt_code (단지코드) | **없음** |
| 아파트명 | 정규화된 공식명칭 | 비정규 표기 |
| 예시 | "한빛마을7단지(한신휴플러스)" | "한빛마을7단지아파트" |

### 2.2. 실제 오매칭 사례

```
# 성공 로그에서 발견된 오매칭
효자촌(현대) - 효자촌(대우), 효자촌(대창), 효자촌(동아), 효자촌(럭키), 
              효자촌(삼환), 효자촌(임광), 효자촌(현대), 효자촌(화성)

후곡마을10단지아파트 - 후곡마을(건영15), 후곡마을(금호), 후곡마을(대우), 
                       후곡마을(대창), 후곡마을(동성), 후곡마을(동신), 
                       후곡마을(동아10), 후곡마을(동아16), ...

한빛마을7단지 - 한빛마을4단지롯데캐슬Ⅱ, 한빛마을7단지(한신휴플러스), 
               한빛마을9단지롯데캐슬1차
```

### 2.3. 문제 원인 분석

1. **괄호 안 정보 무시**: `효자촌(현대)` vs `효자촌(대우)` - 괄호 안 브랜드가 다른데 매칭됨
2. **단지 번호 무시**: `7단지` vs `4단지`, `9단지` - 단지 번호가 다른데 매칭됨
3. **유사도 과신**: 이름 유사도만 높으면 매칭해버림

---

## 3. 해결 방안

### 3.1. 모듈 구조 개편

기존 `data_collection.py` (5000+ 라인)에서 매칭 로직을 분리:

```
backend/app/services/apt_matching/   # 매칭 전용 모듈
├── __init__.py          # 모듈 초기화 및 내보내기
├── constants.py         # 상수, API URL, 브랜드 사전
├── preprocessing.py     # 전처리 함수 (정규화, 속성 추출)
├── matching.py          # 매칭 알고리즘 (Veto 로직 포함)

backend/app/services/data_collection.py  # 기존 서비스 (데이터 수집)
```

### 3.2. Veto (거부) 로직 도입

```python
class VetoChecker:
    """
    🚫 Veto Conditions - 오매칭 방지를 위한 철벽 방어
    
    하나라도 해당하면 점수 계산 없이 즉시 탈락!
    """
    
    @staticmethod
    def check_block_mismatch(api_block, db_block):
        """단지 번호 불일치: 1단지 vs 2단지 → FAIL"""
        if api_block is not None and db_block is not None:
            if api_block != db_block:
                return "단지번호 불일치"
        return None
    
    @staticmethod
    def check_series_mismatch(api_series, db_series):
        """차수 불일치: 1차 vs 2차 → FAIL"""
        ...
    
    @staticmethod
    def check_brand_mismatch(api_brand, db_brand):
        """브랜드 그룹 불일치: 자이 vs 래미안 → FAIL"""
        ...
    
    @staticmethod
    def check_brand_in_parens_mismatch(api_brand, db_brand):
        """괄호 안 브랜드 불일치: (현대) vs (대우) → FAIL"""
        ...
```

### 3.3. 대규모 브랜드 사전

```python
# Tier 1: 메이저 건설사
BRAND_DICT_TIER1 = {
    "래미안": ["래미안", "RAEMIAN", "삼성물산", "삼성래미안"],
    "힐스테이트": ["힐스테이트", "HILLSTATE", "현대건설", "홈타운"],
    "자이": ["자이", "XI", "LG자이", "GS건설"],
    ...
}

# Public: 공공 및 지자체 (미스매칭 주의!)
BRAND_DICT_PUBLIC = {
    "LH": ["LH", "엘에이치", "주공", "휴먼시아", "뜨란채"],
    "SH": ["SH", "에스에이치", "서울주택도시공사"],
    "부영": ["부영", "사랑으로", "애시앙"],
}

# Tier 2: 중견/지방 건설사
BRAND_DICT_TIER2 = {
    "현대": ["현대", "현대아파트"],
    "대우": ["대우", "대우아파트"],
    "동아": ["동아", "동아아파트"],
    ...
}
```

---

## 4. 매칭 알고리즘 상세

### 4.1. 전처리 파이프라인

```
입력: "한빛마을7단지(한신휴플러스)아파트"
     ↓
1. 기본 클렌징
   - 불필요 접미사 제거 ("입주자대표회의", "관리사무소")
   - 특수문자 정리
     ↓
2. 속성 추출
   - block: 7 (단지)
   - series: None (차수)
   - brand: "한신더휴" (브랜드)
   - brand_in_parens: "한신휴플러스" (괄호 안 브랜드)
   - village: "한빛마을" (마을 이름)
     ↓
3. 정규화
   - normalized: "한빛마을7단지한신휴플러스"
   - normalized_strict: "한빛마을한신휴플러스" (단지 제거)
     ↓
출력: ProcessedName 객체
```

### 4.2. 매칭 플로우

```
1. 후보군 선정 (Blocking)
   - 법정동코드 일치
   - 지번 본번 일치 (우선)
   - 브랜드명 포함 (차선)
        ↓
2. Veto 검사 (절대 거부)
   ┌─ 단지번호 불일치? → FAIL
   ├─ 차수 불일치? → FAIL
   ├─ 브랜드 그룹 불일치? → FAIL
   ├─ 괄호 안 브랜드 불일치? → FAIL
   ├─ 건축년도 3년 초과 차이? → FAIL
   └─ 지번 본번 불일치 (이름 유사도 < 100%)? → FAIL
        ↓
3. 스코어링 (100점 만점)
   - 지번 정확도: 40점 (본번+부번 일치)
   - 이름 유사도: 40점 (Token Set Ratio)
   - 메타데이터: 20점 (단지/차수/브랜드/건축년도)
        ↓
4. 최종 판정
   - 85점 이상 → 매칭 성공
   - 1위-2위 점수차 < 10점 → 애매한 매칭 (REVIEW NEEDED)
   - 그 외 → 미매칭
```

### 4.3. 스코어링 상세

| 항목 | 점수 | 조건 |
|------|------|------|
| 지번 완전 일치 | 40점 | 본번+부번 동일 |
| 지번 부분 일치 | 20점 | 본번만 동일 |
| 이름 유사도 | 최대 40점 | Token Set Ratio × 40 |
| 단지 일치 | 5점 | 단지번호 동일 |
| 차수 일치 | 5점 | 차수 동일 |
| 브랜드 일치 | 5점 | 표준 브랜드명 동일 |
| 건축년도 근사 | 5점 | ±1년 이내 |

---

## 5. 특수 케이스 처리

### 5.1. 이름 없는 데이터 (Address-Only)

```
로그: [매매] (1101-1)
```

**처리 전략:**
- 이름 유사도 비교 생략
- **지번(본번+부번) 완전 일치 필수**
- AND 건축년도 ±1년 이내
- 플래그: `System Match (Address Based)`

### 5.2. 애매한 매칭 (Ambiguous Match)

```
1위: 한빛마을7단지(한신휴플러스) - 87점
2위: 한빛마을7단지(롯데캐슬) - 85점
차이: 2점 < 10점
```

**처리 전략:**
- 기계적 매칭 포기
- `REVIEW NEEDED` 상태로 분류
- 사람이 확인하도록 로그만 남김

### 5.3. 동/읍면리 매칭

```
API: "봉화읍 내성리"
DB: "내성리"
```

**처리 전략:**
1. 원본 문자열 정확 매칭
2. 마지막 부분만 추출 ("내성리")
3. 정규화 매칭 ("내성")
4. 양방향 포함 관계 확인

---

## 6. 파일 구조

```
backend/app/services/
├── data_collection.py       # 기존 데이터 수집 서비스 (DataCollectionService)
│
└── apt_matching/            # 매칭 전용 모듈 (신규)
    ├── __init__.py
    │   - 모듈 초기화
    │   - 외부 노출 API 정의
    │
    ├── constants.py
    │   - API URL (MOLIT_SALE_API_URL, ...)
    │   - 브랜드 사전 (BRAND_DICT_TIER1, ...)
    │   - 점수 상수 (MATCHING_SCORE_THRESHOLD, ...)
    │
    ├── preprocessing.py
    │   - ApartmentNameProcessor: 아파트명 전처리
    │   - DongNameProcessor: 동명 전처리
    │   - BunjiProcessor: 지번 전처리
    │
    └── matching.py
        - VetoChecker: Veto 조건 검사
        - ApartmentMatcher: 메인 매칭 로직
        - AddressOnlyMatcher: 주소 기반 매칭
        - MatchResult: 매칭 결과 데이터클래스
```

---

## 7. 사용 예시

```python
from app.services.apt_matching import (
    get_matcher,
    get_apt_processor,
)

# 아파트명 전처리
processor = get_apt_processor()
result = processor.process("한빛마을7단지(한신휴플러스)아파트")
print(result['block'])  # 7
print(result['brand_in_parens'])  # "한신휴플러스"

# 아파트 매칭
matcher = get_matcher()
match_result = matcher.match(
    api_name="한빛마을7단지아파트",
    candidates=candidate_apartments,  # DB에서 조회한 후보
    sgg_cd="11680",
    umd_nm="역삼동",
    jibun="123-45",
    build_year="2020",
    apt_details=apt_details_dict,
)

if match_result.matched:
    print(f"매칭 성공: {match_result.apartment_name} (점수: {match_result.score})")
else:
    print(f"매칭 실패: {match_result.reason}")
    if match_result.veto_reason:
        print(f"Veto 사유: {match_result.veto_reason}")
```

---

## 8. 마이그레이션 가이드

기존 `data_collection.py`에서 새 모듈로 전환:

### Before

```python
# 기존 코드
from app.services.data_collection import DataCollectionService

service = DataCollectionService()
# ... 기존 메서드 사용
```

### After

```python
# 새 코드 (매칭 로직만 분리된 경우)
from app.services.apt_matching import (
    get_matcher,
    get_apt_processor,
    BRAND_DICT,
)

# 전처리
processor = get_apt_processor()
api_data = processor.process(api_apartment_name)

# 매칭
matcher = get_matcher()
result = matcher.match(api_name, candidates, ...)

# 기존 서비스는 그대로 사용
from app.services.data_collection import DataCollectionService
service = DataCollectionService()
```

---

## 9. 테스트 체크리스트

### 9.1. Veto 조건 테스트

- [ ] 단지번호 불일치: `7단지` vs `4단지` → FAIL
- [ ] 차수 불일치: `1차` vs `2차` → FAIL
- [ ] 브랜드 불일치: `현대` vs `대우` → FAIL
- [ ] 괄호 안 브랜드 불일치: `(현대)` vs `(대우)` → FAIL
- [ ] 건축년도 차이: 4년 이상 → FAIL

### 9.2. 정상 매칭 테스트

- [ ] 완전 일치: 같은 이름, 같은 지번 → 성공
- [ ] 부분 일치: 유사 이름, 같은 지번 → 성공 (점수 확인)
- [ ] 지번 기반: 이름 없음, 지번 일치 → 성공

### 9.3. 애매한 매칭 테스트

- [ ] 점수 차이 < 10점 → REVIEW NEEDED

---

## 10. 로그 형식

### 성공 로그 (`apart_YYYYMM.log`)

```
한빛마을7단지아파트 - 한빛마을7단지(한신휴플러스)
```

### 실패 로그 (`apartfail_YYYYMM.log`)

```
[매매] 효자촌(현대) (정규화: 효자촌현대)
  위치: 지역:역삼동 | 동:역삼동 | 지번:123-45 | 시군구코드:11680 | 건축년도:1995
  매칭: 시군구매칭:O | 동매칭:O
  후보: 전체후보:8개 | 필터후보:0개
  후보목록:[효자촌(대우), 효자촌(대창), ...]
  사유:Veto - 괄호 내 브랜드 불일치
```

---

## 11. 향후 개선 사항

1. **머신러닝 도입**: 매칭 점수 가중치 자동 학습
2. **피드백 루프**: 사람이 확인한 결과를 학습에 반영
3. **캐싱 최적화**: Redis 기반 전처리 결과 캐싱
4. **병렬 처리**: 대량 데이터 매칭 시 비동기 처리

---

*문서 작성일: 2026-01-16*
*버전: 1.0*
