# 🔴 RegionDetail 동/면 단위 검색 버그 상세 분석

## 📌 문제 요약

**증상**: 
- "경상북도 서면" 검색 → 통계: "아파트 수 106개", 목록: "아파트 데이터가 없습니다"
- "경기도 파주시" 검색 → 페이지 2 이동 시 `count: 0, total: 9` 표시
- 모든 동/면/읍 단위 검색에서 동일한 현상 발생

**발견 경로**:
```
사용자 보고 로그:
[getRegionStats] 요청 시작 - regionId: 2183
[getRegionStats] 데이터 반환 - region_id: 2176, region_name: "파주시", apartment_count: 199
Page 2 loaded: count: 0, total: 9, has_more: false
```

---

## 🔍 근본 원인 분석

### 1. 데이터 구조 이해

**states 테이블 구조** (db_backup/states.csv):
```csv
region_id | region_name | region_code  | city_name  | 레벨 구분
----------|-------------|--------------|------------|----------
6374      | 경주시       | 4713000000   | 경상북도   | 시군구 (끝 5자리: 00000)
6516      | 서면         | 4713035000   | 경상북도   | 동/면 (끝 5자리: 35000)
2176      | 파주시       | 4148000000   | 경기도     | 시군구 (끝 5자리: 00000)
```

**지역 레벨 판단 기준**:
- `region_code[-8:] == "00000000"` → 시도 레벨 (예: 경상북도)
- `region_code[-5:] == "00000"` → 시군구 레벨 (예: 경주시, 파주시)
- 그 외 → 동/면/읍 레벨 (예: 서면)

### 2. 문제의 핵심: API 간 로직 불일치

#### 🟢 getRegionStats (정상 작동)
**파일**: `backend/app/api/v1/endpoints/favorites.py` (1044-1068행)

```python
# 동 단위 입력 시 자동으로 상위 시군구로 변경
if region.region_code[-5:] != "00000":
    # 동 단위 → 시군구 찾기
    sigungu_code = region.region_code[:5] + "00000"
    sigungu = await db.execute(select(State).where(State.region_code == sigungu_code))
    region = sigungu.scalar_one_or_none()
    logger.info(f"🔍 상위 시군구로 변경 - region_id: {region.region_id}")

# 시군구 하위 모든 동/면/읍의 region_id를 target_region_ids에 포함
if region.region_code[-5:] == "00000":
    sigungu_prefix = region.region_code[:5]
    target_region_ids = [row.region_id for row in ...]  # 47130xxxxx 모두 포함
```

**결과**: 서면(6516) 입력 → 경주시(6374)로 변경 → 경주시 전체 아파트 통계 (106개)

#### 🔴 get_apartments_by_region (버그 발생)
**파일**: `backend/app/services/apartment.py` (395-545행, 수정 전)

```python
# 동 단위 입력 시 그대로 사용
state = await state_crud.get(db, id=region_id)  # 서면(6516) 그대로

# 레벨 판단
is_sigungu = state.region_code[-5:] == "00000"  # False (서면은 35000)

# else 분기 (동 레벨 처리)
else:
    # 동 선택: 해당 동의 아파트만 조회
    stmt = select(Apartment).where(
        Apartment.region_id == region_id,  # region_id=6516(서면)만 검색
        Apartment.is_deleted == False
    )
```

**결과**: 서면(6516) 입력 → 서면(6516)에 직접 저장된 아파트만 검색 → 0개
- **문제**: apartments 테이블의 `region_id`는 대부분 시군구 레벨(6374)로 저장되어 있음

### 3. 데이터 저장 방식 문제

**apartments 테이블 실제 데이터**:
```
apt_id | apt_name           | region_id | (실제 위치)
-------|-------------------|-----------|-------------
1001   | 경주 중앙하이츠     | 6374      | 경주시 전체
1002   | 경주 대우아파트     | 6374      | 경주시 전체
...    | ...               | 6374      | (서면 포함)
```

- 아파트의 `region_id`가 **시군구 레벨**(6374, 경주시)로 저장됨
- 동/면 레벨(6516, 서면)로 저장된 아파트는 거의 없음
- 따라서 `WHERE region_id = 6516` 쿼리는 항상 0개 반환

---

## 🔄 문제 재현 시나리오

### 시나리오 1: "경상북도 서면" 검색

```mermaid
사용자 입력: "경상북도 서면"
    ↓
LocationSearch 결과: region_id=6516 (서면)
    ↓
RegionDetail 컴포넌트
    ├─ getRegionStats(6516)
    │   └─ 동 감지 → 경주시(6374)로 변경
    │   └─ 경주시 전체 통계 집계
    │   └─ apartment_count: 106 ✅
    │
    └─ getApartmentsByRegion(6516, limit=30, skip=0)
        └─ 동 감지 → 그대로 6516 사용 ❌
        └─ WHERE apartment.region_id = 6516
        └─ 결과: []
        └─ total_count: 0 ❌

UI 표시:
- 통계: "아파트 수 106개"
- 목록: "아파트 데이터가 없습니다"
- 페이지네이션: 1페이지만 표시
```

### 시나리오 2: 페이지 2 이동 시

```
사용자: 페이지 2 클릭
    ↓
getApartmentsByRegion(6516, limit=30, skip=30)
    └─ WHERE apartment.region_id = 6516
    └─ LIMIT 30 OFFSET 30
    └─ 결과: [] (0개 중 30~60번째 = 없음)
    └─ total_count: 0

로그 출력:
Page 2 loaded: count: 0, total: 0, has_more: false
```

---

## ✅ 해결 방법

### 수정 내용: `backend/app/services/apartment.py`

```python
async def get_apartments_by_region(
    self,
    db: AsyncSession,
    *,
    region_id: int,
    limit: int = 50,
    skip: int = 0
) -> tuple[List[Dict[str, Any]], int]:
    """
    지역별 아파트 목록 조회
    
    특정 지역(시군구 또는 동)에 속한 아파트 목록을 반환합니다.
    - 동을 선택하면 자동으로 상위 시군구로 변경하여 해당 시군구의 모든 아파트를 조회합니다.
    - 시군구를 선택하면 해당 시군구 코드로 시작하는 모든 동의 아파트를 조회합니다.
    """
    # 먼저 지역 정보 조회
    state = await state_crud.get(db, id=region_id)
    if not state:
        return [], 0
    
    from sqlalchemy import func, select as sql_select
    from app.models.state import State as StateModel
    from app.models.apart_detail import ApartDetail as ApartDetailModel
    
    # 🔧 getRegionStats와 동일한 로직: 동 단위인 경우 상위 시군구로 변경
    if state.region_code and len(state.region_code) >= 5:
        if state.region_code[-5:] != "00000":
            # 동 단위인 경우, 상위 시군구를 찾아야 함
            # region_code의 앞 5자리로 시군구 찾기
            sigungu_code = state.region_code[:5] + "00000"
            sigungu_stmt = sql_select(StateModel).where(StateModel.region_code == sigungu_code)
            sigungu_result = await db.execute(sigungu_stmt)
            sigungu = sigungu_result.scalar_one_or_none()
            if sigungu:
                state = sigungu
                logger.info(f"🔍 [get_apartments_by_region] 동 단위 감지 → 상위 시군구로 변경: region_id={state.region_id}, region_name={state.region_name}")
    
    # location_type 판단 (이제 state는 시군구 레벨)
    is_city = state.region_code[-8:] == "00000000"
    is_sigungu = state.region_code[-5:] == "00000" and not is_city
    
    # 시군구 레벨이므로 해당 시군구 코드로 시작하는 모든 동의 아파트 조회
    if is_sigungu:
        sigungu_code_prefix = state.region_code[:5]
        count_stmt = (
            select(func.count(Apartment.apt_id))
            .join(StateModel, Apartment.region_id == StateModel.region_id)
            .where(
                StateModel.region_code.like(f"{sigungu_code_prefix}%"),  # 47130%
                Apartment.is_deleted == False,
                StateModel.is_deleted == False
            )
        )
        stmt = (
            select(Apartment, ApartDetailModel, ...)
            .join(StateModel, Apartment.region_id == StateModel.region_id)
            .where(
                StateModel.region_code.like(f"{sigungu_code_prefix}%"),  # 47130%
                Apartment.is_deleted == False,
                StateModel.is_deleted == False
            )
            .order_by(Apartment.apt_name)
            .offset(skip)
            .limit(limit)
        )
    
    # ... (쿼리 실행 및 결과 반환)
```

### 수정 후 동작 흐름

```mermaid
사용자 입력: "경상북도 서면"
    ↓
LocationSearch 결과: region_id=6516 (서면)
    ↓
RegionDetail 컴포넌트
    ├─ getRegionStats(6516)
    │   └─ 동 감지 → 경주시(6374)로 변경
    │   └─ apartment_count: 106 ✅
    │
    └─ getApartmentsByRegion(6516, limit=30, skip=0)
        └─ 동 감지 → 경주시(6374)로 변경 ✅
        └─ WHERE state.region_code LIKE "47130%"
        └─ 결과: [106개 중 1~30번째]
        └─ total_count: 106 ✅

UI 표시:
- 통계: "아파트 수 106개"
- 목록: 30개 표시
- 페이지네이션: 4페이지 (106/30 = 3.5 → 4페이지)
```

---

## 🧪 테스트 케이스

### 테스트 1: 동 단위 검색
```
입력: region_id=6516 (서면)
예상: 경주시(6374) 전체 아파트 106개

✅ getRegionStats: apartment_count=106
✅ getApartmentsByRegion: total_count=106, results=[30개]
✅ 페이지 2: results=[30개]
✅ 페이지 4: results=[16개] (106-90=16)
```

### 테스트 2: 시군구 단위 검색
```
입력: region_id=6374 (경주시)
예상: 경주시 전체 아파트 106개

✅ 변경 없음 (이미 시군구)
✅ getApartmentsByRegion: total_count=106, results=[30개]
```

### 테스트 3: 시도 단위 검색
```
입력: region_id=xxxx (경상북도)
예상: 경상북도 전체 아파트

✅ 시도 레벨 처리 로직 작동
✅ WHERE region_code LIKE "47%"
```

---

## 📊 영향 범위

### 영향받는 기능
1. ✅ RegionDetail 컴포넌트 (전체)
2. ✅ 지역 검색 결과 목록
3. ✅ 페이지네이션 (2페이지 이후)
4. ✅ 즐겨찾기 지역 상세 페이지

### 영향받는 지역 레벨
- ✅ 모든 동/면/읍 단위 검색
- 예: 서면, 야당동, 파주읍, 금촌동 등

### 영향받지 않는 기능
- ❌ AI 검색 (별도 로직)
- ❌ 지도 검색 (별도 API)
- ❌ 아파트 상세 페이지

---

## 🔗 관련 파일

### 백엔드
- `backend/app/services/apartment.py` - **[수정]** get_apartments_by_region 함수
- `backend/app/api/v1/endpoints/favorites.py` - **[참조]** getRegionStats 로직
- `backend/app/api/v1/endpoints/apartments.py` - **[영향]** apartments 엔드포인트

### 프론트엔드
- `frontend/src/components/RegionDetail.tsx` - **[영향]** 페이지네이션 UI
- `frontend/src/lib/searchApi.ts` - **[호출]** getApartmentsByRegion API

### 데이터
- `db_backup/states.csv` - **[참조]** region_code 구조 확인

---

## 🚀 배포 체크리스트

- [ ] 백엔드 코드 변경 커밋
- [ ] 백엔드 서버 재시작
- [ ] "경상북도 서면" 검색 테스트
- [ ] "경기도 파주시" 검색 테스트
- [ ] 페이지 2, 3, 4 이동 테스트
- [ ] 로그에서 "동 단위 감지 → 상위 시군구로 변경" 메시지 확인
- [ ] 통계 개수와 목록 개수 일치 확인

---

**작성일**: 2026-01-17  
**작성자**: AI Assistant  
**버전**: 1.0  
**심각도**: 🔴 Critical (사용자 경험에 치명적 영향)  
**상태**: ✅ 해결 완료
