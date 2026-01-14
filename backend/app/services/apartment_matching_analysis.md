# 아파트 매칭 알고리즘 분석 및 개선 방안

## 1. 현재 로직 분석

### 1.1 필터링 단계

#### 1단계: 시군구 코드 기반 필터링
```python
# API: 5자리 코드 (예: 11110)
# DB: 10자리 코드 (예: 1111000000)
if sgg_cd_item == sgg_cd:
    sgg_code_matched = True
else:
    filtered = [apt for apt in local_apts 
                if apt.region.region_code.startswith(sgg_cd_item)]
```

**문제점:**
- API의 5자리 코드와 DB의 10자리 코드를 직접 비교하고 있음
- DB의 `region_code`는 끝자리가 `00000`인 형태로 저장되어 있음 (예: `1111000000`)
- `startswith`로 비교하지만, 더 정확한 변환이 필요함

#### 2단계: 동(umdNm) 기반 필터링
```python
# 정확한 매칭 우선
matching_region_ids = {
    region_id for region_id, region in all_regions.items()
    if region.region_name == umd_nm or umd_nm in region.region_name or region.region_name in umd_nm
}

# 부분 매칭 시도
if not matching_region_ids:
    umd_nm_clean = umd_nm.replace("동", "").replace("가", "").strip()
    matching_region_ids = {
        region_id for region_id, region in all_regions.items()
        if umd_nm_clean in region.region_name.replace("동", "").replace("가", "") or 
           region.region_name.replace("동", "").replace("가", "") in umd_nm_clean
    }
```

**문제점:**
- 동 매칭이 여전히 엄격함
- 지역과 법정동이 일치한다는 가정 하에 더 널널하게 매칭 가능
- "동", "가" 제거 로직이 단순함

### 1.2 아파트 이름 매칭

#### 이름 정제 함수
```python
def _clean_apt_name(self, name: str) -> str:
    """아파트 이름 정제 (괄호 및 내용 제거)"""
    if not name:
        return ""
    return re.sub(r'\([^)]*\)', '', name).strip()
```

**문제점:**
- 괄호 처리만 하고 있음
- 다양한 괄호 형태 미처리: `(101동~105동)`, `(1~5동)`, `[101~105동]` 등
- 괄호 내부의 숫자/동 정보는 무시해야 함

#### 이름 정규화 함수
```python
def _normalize_apt_name(self, name: str) -> str:
    """아파트 이름 정규화 (공백 제거, 소문자 변환 등)"""
    if not name:
        return ""
    normalized = re.sub(r'\s+', '', name.lower())
    normalized = re.sub(r'[^\w가-힣]', '', normalized)
    return normalized
```

**문제점:**
- 한글 소문자 변환이 의미 없음 (한글은 대소문자 구분 없음)
- 특수문자 제거가 너무 공격적일 수 있음

#### 매칭 전략 (3단계)
1. **정확한 매칭**: 정규화된 이름이 완전히 일치
2. **포함 관계 확인**: 양방향 포함 관계 확인 (최소 3자 이상)
3. **키워드 기반 매칭**: 공통 키워드 2개 이상, 공통 비율 40% 이상

**문제점:**
- 대한민국 아파트 특성을 고려하지 않음
- "아파트", "아파트명" 등의 접미사 처리 부족
- 숫자 포함 아파트명 처리 부족 (예: "1차", "2차", "3단지" 등)

## 2. 실제 데이터 분석 결과

### 2.1 실제 데이터 패턴 분석

#### 아파트 이름 패턴 (apartments.csv 기준)
1. **차수/단지 표기 차이**:
   - "경희궁의아침2단지", "경희궁의아침3단지", "경희궁의아침4단지"
   - "명륜아남1차" vs "명륜아남2차아파트"
   - "창신쌍용1단지" vs "창신쌍용아파트2단지"
   - "광장현대3단지아파트", "광장현대5단지", "광장현대8단지", "광장현대9차"

2. **공백 포함**:
   - "광화문스페이스본 아파트" (공백 포함)
   - "경희궁자이2단지 아파트" (공백 포함)
   - "경희궁 롯데캐슬아파트" (공백 포함)

3. **괄호 포함**:
   - "경희궁자이1단지(임대아파트)"
   - "남대문(양동) 단지"
   - "약수하이츠아파트(임대)"

4. **접미사 차이**:
   - "명륜아남1차" vs "명륜아남2차아파트"
   - "창신쌍용1단지" vs "창신쌍용아파트2단지"
   - "인왕산2차아이파크아파트" vs "인왕산아이파크"

#### 시군구 코드 패턴 (states.csv 기준)
- DB에 저장된 `region_code`는 10자리 형식
- 예: `4111100000`, `4113111100`, `4127111100` 등
- 끝자리가 `00000`인 경우도 있고, 그렇지 않은 경우도 있음
- API는 5자리 코드를 제공 (예: `11110`)

### 2.2 생길 수 있는 문제점

#### 2.2.1 시군구 코드 매칭 실패
- **원인**: API 5자리 코드와 DB 10자리 코드 변환 불일치
- **예시**: 
  - API: `11110`
  - DB: `1111000000` (끝자리 00000인 경우) 또는 `4111100000` (다른 지역)
- **영향**: 잘못된 지역의 아파트를 후보에 포함하거나, 올바른 아파트를 제외할 수 있음

#### 2.2.2 동 매칭 실패
- **원인**: 동 이름 표기법 차이
- **예시**: 
  - API: "사직동"
  - DB: "사직동", "사직1동", "사직2동" 등
- **영향**: 올바른 지역의 아파트를 필터링에서 제외할 수 있음

#### 2.2.3 아파트 이름 매칭 실패
- **원인**: 다양한 표기법 차이
- **실제 사례**:
  - API: "광화문스페이스본(101동~105동)" → DB: "광화문스페이스본 아파트" (공백 포함)
  - API: "유등마을쌍용아파트" → DB: "유등마을쌍용" (접미사 차이)
  - API: "경희궁의아침" → DB: "경희궁의아침2단지", "경희궁의아침3단지" (차수/단지 표기)
  - API: "명륜아남" → DB: "명륜아남1차", "명륜아남2차아파트" (차수 표기)
  - API: "창신쌍용" → DB: "창신쌍용1단지", "창신쌍용아파트2단지" (단지 표기)
- **영향**: 매칭 실패로 인한 데이터 손실 (현재 약 137건 중 많은 부분이 이런 이유)

#### 2.2.4 필터링이 너무 엄격함
- **원인**: 지역과 법정동이 일치한다는 가정을 충분히 활용하지 않음
- **영향**: 올바른 아파트를 후보에서 제외하여 매칭 실패

#### 2.2.5 차수/단지 표기 무시 필요
- **원인**: 같은 아파트 단지의 다른 차수/단지가 별도로 저장됨
- **예시**:
  - "경희궁의아침2단지", "경희궁의아침3단지", "경희궁의아침4단지" → 모두 "경희궁의아침"으로 매칭 가능해야 함
  - "명륜아남1차", "명륜아남2차아파트" → 모두 "명륜아남"으로 매칭 가능해야 함
- **영향**: 차수/단지 표기가 다르면 매칭 실패

## 3. 개선 방안

### 3.1 시군구 코드 매칭 개선

**개선 사항:**
```python
# API 5자리 코드 → DB 10자리 코드 변환
def _convert_sgg_code_to_db_format(self, sgg_cd: str) -> str:
    """5자리 시군구 코드를 10자리 DB 형식으로 변환"""
    if not sgg_cd or len(sgg_cd) != 5:
        return sgg_cd
    return f"{sgg_cd}00000"

# 필터링 시 변환된 코드 사용
sgg_cd_db = self._convert_sgg_code_to_db_format(sgg_cd_item_str)
filtered = [
    apt for apt in local_apts
    if apt.region.region_code == sgg_cd_db or 
       apt.region.region_code.startswith(sgg_cd_item_str)
]
```

### 3.2 동 매칭 개선

**개선 사항:**
- 지역과 법정동이 일치한다는 가정 하에 더 널널하게 매칭
- 동 이름에서 숫자, "동", "가" 등을 제거한 후 비교
- 부분 매칭 허용 범위 확대

```python
def _normalize_dong_name(self, dong_name: str) -> str:
    """동 이름 정규화"""
    if not dong_name:
        return ""
    # 숫자 제거 (예: "사직1동" → "사직동")
    normalized = re.sub(r'\d+', '', dong_name)
    # "동", "가" 제거
    normalized = normalized.replace("동", "").replace("가", "").strip()
    return normalized

# 더 널널한 매칭
matching_region_ids = {
    region_id for region_id, region in all_regions.items()
    if self._normalize_dong_name(region.region_name) == self._normalize_dong_name(umd_nm) or
       self._normalize_dong_name(umd_nm) in self._normalize_dong_name(region.region_name) or
       self._normalize_dong_name(region.region_name) in self._normalize_dong_name(umd_nm)
}
```

### 3.3 아파트 이름 정제 개선

**개선 사항:**
- 다양한 괄호 형태 처리: `()`, `[]`, `{}`
- 괄호 내부 내용 완전 제거
- 숫자 포함 동 정보 제거 (예: "101동~105동", "1~5동" 등)

```python
def _clean_apt_name(self, name: str) -> str:
    """아파트 이름 정제 (괄호 및 내용 제거)"""
    if not name:
        return ""
    # 다양한 괄호 형태 제거: (), [], {}
    cleaned = re.sub(r'[\(\[\{][^\)\]\}]*[\)\]\}]', '', name)
    # 연속된 공백 제거
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned.strip()
```

### 3.4 아파트 이름 정규화 개선

**개선 사항:**
- 한글 소문자 변환 제거 (의미 없음)
- 대한민국 아파트 특성 고려
- "아파트", "아파트명" 등의 접미사 처리
- **차수/단지 표기 제거** (예: "1차", "2차", "1단지", "2단지" 등)
- 숫자+차/단지 패턴 제거 (예: "2차", "3단지", "13차" 등)

```python
def _normalize_apt_name(self, name: str) -> str:
    """아파트 이름 정규화 (대한민국 아파트 특성 고려)"""
    if not name:
        return ""
    
    # 공백 제거
    normalized = re.sub(r'\s+', '', name)
    
    # 차수/단지 표기 제거 (예: "1차", "2차", "1단지", "2단지", "13차" 등)
    # 숫자+차/단지 패턴 제거
    normalized = re.sub(r'\d+차', '', normalized)  # "1차", "2차", "13차" 등
    normalized = re.sub(r'\d+단지', '', normalized)  # "1단지", "2단지" 등
    
    # "아파트", "아파트명" 접미사 제거 (비교 시 무시)
    normalized = re.sub(r'아파트명?$', '', normalized)
    
    # 특수문자 제거 (한글, 영문, 숫자만 유지)
    normalized = re.sub(r'[^\w가-힣]', '', normalized)
    
    return normalized
```

**예시:**
- "경희궁의아침2단지" → "경희궁의아침"
- "명륜아남2차아파트" → "명륜아남"
- "창신쌍용아파트2단지" → "창신쌍용"
- "광장현대9차" → "광장현대"

### 3.5 매칭 전략 개선

**개선 사항:**
- 지역과 법정동이 일치한다는 가정 하에 더 널널한 매칭
- 키워드 매칭 기준 완화 (공통 비율 30% 이상으로 낮춤)
- 부분 매칭 허용 범위 확대

```python
def _match_apartment(
    self,
    apt_name_api: str,
    candidates: List[Apartment],
    sgg_cd: str,
    umd_nm: Optional[str] = None
) -> Optional[Apartment]:
    """
    아파트 매칭 (개선된 버전)
    
    지역과 법정동이 일치한다는 가정 하에 더 널널하게 매칭
    """
    if not apt_name_api or not candidates:
        return None
    
    cleaned_api = self._clean_apt_name(apt_name_api)
    normalized_api = self._normalize_apt_name(cleaned_api)
    
    if not cleaned_api or not normalized_api:
        return None
    
    # 1단계: 정확한 매칭
    for apt in candidates:
        cleaned_db = self._clean_apt_name(apt.apt_name)
        normalized_db = self._normalize_apt_name(cleaned_db)
        
        if normalized_api == normalized_db:
            return apt
    
    # 2단계: 포함 관계 확인 (양방향, 최소 2자 이상)
    for apt in candidates:
        cleaned_db = self._clean_apt_name(apt.apt_name)
        normalized_db = self._normalize_apt_name(cleaned_db)
        
        if len(normalized_api) >= 2 and len(normalized_db) >= 2:
            if normalized_api in normalized_db or normalized_db in normalized_api:
                return apt
    
    # 3단계: 키워드 기반 매칭 (기준 완화)
    api_keywords = set(re.findall(r'[가-힣]+', normalized_api))
    if len(api_keywords) >= 1:  # 1개 이상으로 완화
        for apt in candidates:
            cleaned_db = self._clean_apt_name(apt.apt_name)
            normalized_db = self._normalize_apt_name(cleaned_db)
            db_keywords = set(re.findall(r'[가-힣]+', normalized_db))
            
            common_keywords = api_keywords & db_keywords
            if len(common_keywords) >= 1:  # 1개 이상으로 완화
                common_ratio = len(common_keywords) / max(len(api_keywords), len(db_keywords))
                if common_ratio >= 0.3:  # 30% 이상으로 완화
                    return apt
    
    return None
```

### 3.6 필터링 로직 개선

**개선 사항:**
- 시군구 코드 변환 후 정확한 매칭 시도
- 동 매칭 실패 시에도 후보 유지 (더 널널하게)
- 필터링 실패 시 전체 후보로 재시도

```python
# 시군구 코드 기반 필터링 (개선)
sgg_cd_db = self._convert_sgg_code_to_db_format(sgg_cd_item_str)
if sgg_cd_db:
    # 정확한 매칭 시도
    filtered = [
        apt for apt in local_apts
        if apt.region.region_code == sgg_cd_db
    ]
    # 정확한 매칭 실패 시 시작 부분 매칭
    if not filtered:
        filtered = [
            apt for apt in local_apts
            if apt.region.region_code.startswith(sgg_cd_item_str)
        ]
    if filtered:
        candidates = filtered

# 동 기반 필터링 (더 널널하게)
if umd_nm and candidates:
    matching_region_ids = self._find_matching_regions(umd_nm, all_regions)
    if matching_region_ids:
        filtered = [
            apt for apt in candidates
            if apt.region_id in matching_region_ids
        ]
        if filtered:
            candidates = filtered
    # 필터링 실패해도 후보 유지 (더 널널하게)
```

## 4. 실제 데이터 기반 추가 개선 사항

### 4.1 차수/단지 표기 무시 로직

**문제점:**
- 같은 아파트 단지의 다른 차수/단지가 별도로 저장되어 있음
- API에서는 차수/단지 정보가 없거나 다를 수 있음
- 예: API "경희궁의아침" → DB "경희궁의아침2단지", "경희궁의아침3단지", "경희궁의아침4단지"

**해결 방안:**
- 정규화 시 차수/단지 표기 제거
- 매칭 시 차수/단지 정보를 무시하고 비교
- 여러 후보가 매칭되면 첫 번째 것을 선택 (또는 가장 유사한 것)

### 4.2 공백 처리 개선

**문제점:**
- DB에 공백이 포함된 아파트명이 있음
- 예: "광화문스페이스본 아파트", "경희궁자이2단지 아파트"

**해결 방안:**
- 정규화 시 모든 공백 제거 (이미 구현됨)
- 추가로 공백이 포함된 경우도 매칭 가능하도록 보장

### 4.3 접미사 처리 개선

**문제점:**
- "아파트" 접미사가 있거나 없거나 차이
- 예: "명륜아남1차" vs "명륜아남2차아파트"

**해결 방안:**
- 정규화 시 "아파트" 접미사 제거 (이미 구현됨)
- 차수/단지 제거 후 접미사 제거 순서 중요

## 5. 예상 효과

1. **매칭 성공률 향상**: 
   - 시군구 코드 변환 및 동 매칭 개선으로 필터링 정확도 향상
   - 차수/단지 표기 무시로 같은 단지의 다른 차수도 매칭 가능
   - 예상: 현재 137건 실패 중 약 50-70% 개선 가능

2. **데이터 손실 최소화**: 
   - 더 널널한 매칭 기준으로 잘못 버려지는 데이터 감소
   - 차수/단지 표기 차이로 인한 매칭 실패 해결

3. **대한민국 아파트 특성 반영**: 
   - 괄호 처리, 접미사 처리, 차수/단지 처리 등으로 실제 사용 사례에 맞춤
   - 실제 데이터 패턴 기반 최적화

4. **유지보수성 향상**: 
   - 명확한 함수 분리로 코드 가독성 향상
   - 각 단계별 로직 명확화

## 6. 구현 우선순위

1. **높음**: 차수/단지 표기 제거 로직 추가 (정규화 함수 개선)
2. **높음**: 시군구 코드 변환 함수 추가
3. **높음**: 아파트 이름 정제 함수 개선 (괄호 처리)
4. **중간**: 동 매칭 로직 개선
5. **중간**: 아파트 이름 정규화 개선 (접미사 처리)
6. **낮음**: 매칭 전략 완화 (필요 시 추가 조정)
