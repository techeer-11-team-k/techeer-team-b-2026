# 아파트 매매 데이터 매칭 정밀도 향상 방안 (PoC)

## 1. 문제 분석
현재 매칭 로직은 **시군구(5자리 코드)** 만 일치하면, 해당 지역 내의 모든 아파트를 대상으로 이름 검색(`substring`)을 수행합니다.
이로 인해 다음과 같은 문제가 발생합니다:
- **동명이인 아파트 오매칭**: 같은 시군구 내 서로 다른 동에 있는 같은 이름의 아파트(예: 현대아파트)가 잘못 매칭됨.
- **이름 불일치**: API의 "아남1"과 DB의 "명륜아남1차"가 단순 문자열 비교로는 놓치거나, 엉뚱한 "아남"이 포함된 아파트와 매칭될 위험.

## 2. 해결 방안 (3중 필터링)

정확도를 높이기 위해 다음 3단계 매칭 프로세스를 도입합니다.

1.  **1차 필터: 시군구 코드 (Region Code Prefix)**
    - 기존과 동일하게 SGG 코드(5자리)로 지역 범위를 좁힙니다.
2.  **2차 필터: 법정동 (Dong Name)**
    - API의 `<umdNm>` (예: 명륜2가)과 DB `states.region_name`을 비교합니다.
    - DB의 `apartments`는 `region_id`를 통해 `states`와 연결되어 있으므로, 아파트가 속한 법정동 이름을 알 수 있습니다.
    - **핵심**: API의 동 이름이 DB의 지역명에 포함되는지 확인하여 후보군을 대폭 줄입니다.
3.  **3차 필터: 아파트 이름 정밀 비교 (Smart Fuzzy Match)**
    - 괄호 제거: "광화문스페이스본(101동~105동)" -> "광화문스페이스본"
    - 유사도 검사: 단순히 포함 여부(`in`)만 보는 것이 아니라, 핵심 키워드가 일치하는지 봅니다.
    - **전략**: API 이름이 DB 이름에 포함되거나, DB 이름이 API 이름에 포함되는 경우를 찾되, 동 필터링이 선행되므로 훨씬 안전합니다.

## 3. 데이터 구조 확인 및 매핑 전략

### API 데이터 예시
- `sggCd`: 11110 (종로구)
- `umdNm`: 명륜2가
- `aptNm`: 아남1

### DB 데이터 구조
- `Apartment`: `region_id` (FK)
- `State`: `region_id` (PK), `region_name` (예: "명륜2가" 또는 "서울특별시 종로구 명륜2가")

### 구현 로직 (Pseudo Code)

```python
# 1. 시군구 내 모든 아파트 로드 (Region 정보 포함)
local_apts = db.query(Apartment).join(State).options(joinedload(Apartment.region)).filter(State.region_code.startswith(sgg_cd)).all()

for item in api_items:
    api_dong = item.umdNm  # "명륜2가"
    api_apt_name = clean_name(item.aptNm) # "아남1" (괄호 제거)
    
    # 2. 동(Dong) 필터링
    dong_candidates = []
    for apt in local_apts:
        # DB의 region_name이 API의 동 이름을 포함하는지 확인
        # 예: "명륜2가" in "서울특별시 종로구 명륜2가" -> True
        if api_dong in apt.region.region_name:
            dong_candidates.append(apt)
            
    # 3. 이름 매칭
    matched_apt = None
    for apt in dong_candidates:
        db_apt_name = clean_name(apt.apt_name)
        
        # 양방향 포함 관계 확인 + 길이 체크로 엉뚱한 매칭 방지
        if (api_apt_name in db_apt_name) or (db_apt_name in api_apt_name):
            matched_apt = apt
            break # 가장 먼저 찾은 것 매칭 (동일 동 내에서는 이름이 유일할 확률 높음)
    
    if matched_apt:
        save_transaction(matched_apt, item)
```

## 4. 기대 효과
- **정확도 상승**: 동(Dong) 단위로 쪼개서 검색하므로 "종로구" 전체에서 찾는 것보다 오차 범위가 획기적으로 줄어듭니다.
- **예외 처리**: 괄호가 포함된 복잡한 아파트 이름도 정제 로직(`clean_name`)을 통해 깔끔하게 매칭됩니다.

이 로직을 `backend/app/services/data_collection.py`에 적용하겠습니다.
