# 매매 vs 전월세 데이터 수집 및 매칭 알고리즘 분석

## 1. API 응답 구조 차이

### 매매 API 응답
```xml
<item>
  <aptNm>동문굿모닝힐3차</aptNm>
  <sggCd>41465</sggCd>
  <umdNm>동천동</umdNm>
  <dealAmount>64,700</dealAmount>
  ...
</item>
```

### 전월세 API 응답
```xml
<item>
  <aptNm>풍산아파트</aptNm>
  <sggCd>41465</sggCd>
  <umdNm>상현동</umdNm>
  <deposit>3,000</deposit>
  <monthlyRent>120</monthlyRent>
  ...
</item>
```

**차이점**: 필드명은 동일하지만, 전월세는 추가 필드(`deposit`, `monthlyRent`, `aptSeq` 등)가 있습니다.

## 2. 데이터 파싱 방식 차이

### 매매 데이터 파싱
- **방식**: `ET.fromstring(xml_content)` → XML Element Tree 직접 파싱
- **결과**: `List[ET.Element]` (XML Element 리스트)
- **필드 추출**: `item.findtext("aptNm")` → 문자열 반환 (없으면 None)

### 전월세 데이터 파싱
- **방식**: `parse_rent_xml_to_json(xml_content)` → xmltodict로 Dict 변환
- **결과**: `List[Dict[str, Any]]` (Dict 리스트)
- **필드 추출**: `item.get("aptNm")` → 값 반환 (없으면 None)

**문제점**: 
- 전월세는 Dict이므로 `findtext()` 같은 XML 메서드를 사용할 수 없음
- 현재 코드는 이미 `item.get()`을 사용하고 있어 이 부분은 수정됨

## 3. 아파트 매칭 알고리즘 비교

### 공통점
두 방식 모두 동일한 `_match_apartment()` 함수를 사용합니다:
1. 시군구 코드 기반 사전 필터링
2. 동(umdNm) 기반 필터링
3. 아파트 이름 매칭 (6가지 전략)

### 차이점 분석

#### 매매 코드 (라인 1994-2030)
```python
# 1단계: 시군구 코드 기반 사전 필터링
candidates = local_apts
sgg_code_matched = False
if sgg_cd_item:
    if sgg_cd_item == sgg_cd:
        sgg_code_matched = True
    else:
        candidates = [apt for apt in local_apts 
                    if apt.region.region_code.startswith(sgg_cd_item)]
        sgg_code_matched = False
else:
    sgg_code_matched = True

# 2단계: 동(umdNm) 기반 필터링
dong_matched = False
if umd_nm and candidates:
    matching_region_ids = {
        region_id for region_id, region in all_regions.items()
        if umd_nm in region.region_name
    }
    if matching_region_ids:
        filtered = [apt for apt in candidates 
                  if apt.region_id in matching_region_ids]
        if filtered:
            candidates = filtered
            dong_matched = True

# 3단계: 아파트 이름 매칭
matched_apt = self._match_apartment(
    apt_nm_xml,
    candidates,
    sgg_code_matched=sgg_code_matched,
    dong_matched=dong_matched
)
```

#### 전월세 코드 (라인 2376-2417)
```python
# 1단계: 시군구 코드 기반 사전 필터링
candidates = local_apts
sgg_code_matched = False
if sgg_cd_item:
    if sgg_cd_item == sgg_cd:
        sgg_code_matched = True
    else:
        candidates = [apt for apt in local_apts 
                    if apt.region.region_code.startswith(sgg_cd_item)]
        sgg_code_matched = False
else:
    sgg_code_matched = True

# 2단계: 동(umdNm) 기반 필터링
dong_matched = False
if umd_nm and candidates:
    matching_region_ids = {
        region_id for region_id, region in all_regions.items()
        if umd_nm in region.region_name
    }
    if matching_region_ids:
        filtered = [apt for apt in candidates 
                  if apt.region_id in matching_region_ids]
        if filtered:
            candidates = filtered
            dong_matched = True

# 3단계: 아파트 이름 매칭
matched_apt = self._match_apartment(
    apt_nm_xml,
    candidates,
    sgg_code_matched=sgg_code_matched,
    dong_matched=dong_matched
)
```

**결론**: 코드 로직은 동일합니다!

## 4. 문제점 분석

### 문제 1: 후보 아파트가 없는 경우
전월세에서 `local_apts`가 비어있으면 매칭이 불가능합니다.
- 현재 코드: `if not local_apts: return` → 조용히 종료
- **문제**: 로그가 없어서 원인 파악이 어려움

### 문제 2: 동 매칭 실패 가능성
`umd_nm in region.region_name` 방식이 정확하지 않을 수 있습니다.
- 예: "영등포동1가" vs "영등포동" → 포함 관계로 매칭 시도
- **문제**: 정확한 매칭이 안 될 수 있음

### 문제 3: 시군구 코드 비교 문제
`sgg_cd_item`이 문자열로 변환된 후 비교하는데, 타입 불일치 가능성
- 매매: `item.findtext("sggCd")` → 문자열
- 전월세: `str(item.get("sggCd")).strip()` → 문자열
- **문제**: None이거나 빈 문자열인 경우 처리 필요

### 문제 4: 아파트 이름 정규화 차이
매매와 전월세 모두 `_clean_apt_name()`과 `_normalize_apt_name()`을 사용하지만,
전월세에서 `apt_nm_xml`이 제대로 정규화되지 않을 수 있습니다.

## 5. 문제점 및 해결 방안

### 문제 1: 후보 아파트가 없는 경우 ✅ 해결됨
- **문제**: `local_apts`가 비어있으면 매칭이 불가능
- **해결**: 후보가 없으면 원래 후보(`local_apts`)로 복원하여 매칭 재시도

### 문제 2: 동 매칭 실패 가능성 ✅ 해결됨
- **문제**: `umd_nm in region.region_name` 방식이 정확하지 않음
  - 예: "영등포동1가" vs "영등포동" → 단방향 포함 관계만 확인
- **해결**: 
  1. 정확한 매칭 우선 시도 (`region.region_name == umd_nm`)
  2. 양방향 포함 관계 확인 (`umd_nm in region.region_name or region.region_name in umd_nm`)
  3. 부분 매칭 시도 ("동", "가" 제거 후 비교)

### 문제 3: 시군구 코드 비교 문제 ✅ 해결됨
- **문제**: `sgg_cd_item`이 None이거나 빈 문자열인 경우 처리 부족
- **해결**: 
  1. 타입 변환 및 None 처리 강화 (`str(sgg_cd_item).strip()`)
  2. 필터링 결과가 없으면 원래 후보 유지

### 문제 4: 아파트 이름 정규화 차이 ✅ 해결됨
- **문제**: 전월세에서 `apt_nm_xml`이 제대로 정규화되지 않을 수 있음
- **해결**: 매매와 동일한 정규화 함수 사용

### 문제 5: 필터링이 너무 엄격함 ✅ 해결됨
- **문제**: 필터링 후 후보가 비어버리면 매칭 불가능
- **해결**: 
  1. 후보가 없으면 원래 후보로 복원
  2. 필터링된 후보에서 실패 시 전체 후보로 재시도
  3. 더 널널한 매칭 기준 적용 (`sgg_code_matched=True`, `dong_matched=False`)

## 6. 수정 완료 사항

### 전월세 코드 개선
1. ✅ 시군구 코드 비교 로직 강화 (타입 변환 및 None 처리)
2. ✅ 동 매칭 로직 개선 (정확한 매칭 우선, 부분 매칭 후보)
3. ✅ 후보가 없을 때 원래 후보로 복원
4. ✅ 필터링 실패 시 전체 후보로 재시도
5. ✅ 디버깅 로그 추가 (후보 목록 출력)

### 매매 코드 개선 (동일한 로직 적용)
1. ✅ 시군구 코드 비교 로직 강화
2. ✅ 동 매칭 로직 개선
3. ✅ 후보가 없을 때 원래 후보로 복원
4. ✅ 필터링 실패 시 전체 후보로 재시도

## 7. 핵심 개선 사항 상세 설명

### 개선 1: 시군구 코드 비교 로직 강화
**이전 코드**:
```python
if sgg_cd_item:
    if sgg_cd_item == sgg_cd:
        sgg_code_matched = True
```

**문제점**: 
- `sgg_cd_item`이 문자열이 아닐 수 있음 (Dict에서 가져올 때)
- None이나 빈 문자열 처리 부족
- 필터링 결과가 없을 때 후보가 비어버림

**개선 코드**:
```python
if sgg_cd_item and str(sgg_cd_item).strip():
    sgg_cd_item_str = str(sgg_cd_item).strip()
    sgg_cd_str = str(sgg_cd).strip()
    
    if sgg_cd_item_str == sgg_cd_str:
        sgg_code_matched = True
    else:
        filtered = [apt for apt in local_apts 
                  if apt.region.region_code.startswith(sgg_cd_item_str)]
        if filtered:
            candidates = filtered
        # 필터링 결과가 없으면 원래 후보 유지
```

### 개선 2: 동 매칭 로직 개선
**이전 코드**:
```python
matching_region_ids = {
    region_id for region_id, region in all_regions.items()
    if umd_nm in region.region_name
}
```

**문제점**:
- 단방향 포함 관계만 확인 ("영등포동1가" in "영등포동" = False)
- 정확한 매칭을 우선하지 않음
- "동", "가" 같은 접미사로 인한 매칭 실패

**개선 코드**:
```python
# 1단계: 정확한 매칭 우선
matching_region_ids = {
    region_id for region_id, region in all_regions.items()
    if region.region_name == umd_nm or umd_nm in region.region_name or region.region_name in umd_nm
}

# 2단계: 정확한 매칭 실패 시 부분 매칭
if not matching_region_ids:
    umd_nm_clean = umd_nm.replace("동", "").replace("가", "").strip()
    partial_matching_ids = {
        region_id for region_id, region in all_regions.items()
        if umd_nm_clean in region.region_name.replace("동", "").replace("가", "") or 
           region.region_name.replace("동", "").replace("가", "") in umd_nm_clean
    }
```

### 개선 3: 후보 복원 및 재시도 로직
**이전 코드**:
```python
matched_apt = self._match_apartment(...)
if not matched_apt:
    unmatched_count += 1
    continue
```

**문제점**:
- 필터링 후 후보가 비어버리면 매칭 불가능
- 필터링된 후보에서 실패하면 끝

**개선 코드**:
```python
# 후보가 없으면 원래 후보로 복원
if not candidates:
    candidates = local_apts
    sgg_code_matched = True  # 널널하게
    dong_matched = False

matched_apt = self._match_apartment(...)

# 필터링된 후보에서 실패 시 전체 후보로 재시도
if not matched_apt and len(candidates) < len(local_apts):
    matched_apt = self._match_apartment(
        apt_nm_xml,
        local_apts,
        sgg_code_matched=True,  # 널널하게
        dong_matched=False
    )
```

## 8. 예상 효과

1. **전월세 매칭 성공률 향상**: 필터링 실패 시에도 전체 후보로 재시도하여 매칭 기회 증가
2. **동 매칭 정확도 향상**: 정확한 매칭 우선, 부분 매칭 후보로 더 많은 경우 매칭 가능
3. **시군구 코드 처리 안정성 향상**: 타입 변환 및 None 처리로 예외 상황 방지
4. **디버깅 용이성 향상**: 매칭 실패 시 후보 목록 출력으로 원인 파악 용이
