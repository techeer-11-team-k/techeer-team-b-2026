# 내 집 기능 문서

## 개요

사용자가 소유한 부동산(내 집)을 관리하는 기능입니다. 사용자는 자신이 소유한 아파트를 등록하고, 목록을 조회하며, 상세 정보를 확인하고, 삭제할 수 있습니다.

## 엔드포인트

기본 URL: `/api/v1/my-properties`

### 1. 내 집 목록 조회

**엔드포인트:** `GET /api/v1/my-properties`

**설명:** 현재 로그인한 사용자가 등록한 내 집 목록을 조회합니다.

**인증:** 필요 (Bearer Token)

**쿼리 파라미터:**
- `skip` (int, 선택): 건너뛸 레코드 수 (기본값: 0)
- `limit` (int, 선택): 가져올 레코드 수 (기본값: 100, 최대: 100)

**응답 예시:**
```json
{
  "success": true,
  "data": {
    "properties": [
      {
        "property_id": 1,
        "account_id": 1,
        "apt_id": 12345,
        "nickname": "우리집",
        "exclusive_area": 84.5,
        "current_market_price": 85000,
        "risk_checked_at": null,
        "memo": "2024년 구매",
        "apt_name": "래미안 강남파크",
        "kapt_code": "A1234567890",
        "region_name": "강남구",
        "city_name": "서울특별시",
        "created_at": "2026-01-10T15:30:00Z",
        "updated_at": "2026-01-10T15:30:00Z",
        "is_deleted": false
      }
    ],
    "total": 1,
    "limit": 100
  }
}
```

**에러 코드:**
- `401`: 인증 필요
- `500`: 서버 오류

---

### 2. 내 집 등록

**엔드포인트:** `POST /api/v1/my-properties`

**설명:** 새로운 내 집을 등록합니다.

**인증:** 필요 (Bearer Token)

**요청 본문:**
```json
{
  "apt_id": 12345,
  "nickname": "우리집",
  "exclusive_area": 84.5,
  "current_market_price": 85000,
  "memo": "2024년 구매"
}
```

**응답 예시:**
```json
{
  "success": true,
  "data": {
    "property_id": 1,
    "account_id": 1,
    "apt_id": 12345,
    "nickname": "우리집",
    "exclusive_area": 84.5,
    "current_market_price": 85000,
    "risk_checked_at": null,
    "memo": "2024년 구매",
    "apt_name": "래미안 강남파크",
    "kapt_code": "A1234567890",
    "region_name": "강남구",
    "city_name": "서울특별시",
    "created_at": "2026-01-10T15:30:00Z"
  }
}
```

**에러 코드:**
- `400`: 잘못된 요청
- `404`: 아파트를 찾을 수 없음
- `409`: 제한 초과 (최대 100개)
- `401`: 인증 필요

---

### 3. 내 집 상세 조회

**엔드포인트:** `GET /api/v1/my-properties/{property_id}`

**설명:** 지정한 내 집 ID에 해당하는 내 집의 상세 정보를 반환합니다.

**인증:** 필요 (Bearer Token)

**경로 파라미터:**
- `property_id` (int, 필수): 내 집 ID

**응답 예시:**
```json
{
  "success": true,
  "data": {
    "property_id": 1,
    "account_id": 1,
    "apt_id": 12345,
    "nickname": "우리집",
    "exclusive_area": 84.5,
    "current_market_price": 85000,
    "risk_checked_at": null,
    "memo": "2024년 구매",
    "apt_name": "래미안 강남파크",
    "kapt_code": "A1234567890",
    "region_name": "강남구",
    "city_name": "서울특별시",
    "created_at": "2026-01-10T15:30:00Z",
    "updated_at": "2026-01-10T15:30:00Z",
    "is_deleted": false
  }
}
```

**에러 코드:**
- `404`: 내 집을 찾을 수 없음
- `401`: 인증 필요

---

### 4. 내 집 삭제

**엔드포인트:** `DELETE /api/v1/my-properties/{property_id}`

**설명:** 지정한 내 집 ID에 해당하는 내 집을 소프트 삭제합니다.

**인증:** 필요 (Bearer Token)

**경로 파라미터:**
- `property_id` (int, 필수): 내 집 ID

**응답 예시:**
```json
{
  "success": true,
  "data": {
    "message": "내 집이 삭제되었습니다.",
    "property_id": 1
  }
}
```

**에러 코드:**
- `404`: 내 집을 찾을 수 없음
- `401`: 인증 필요

---

## 데이터 모델

### MyProperty 모델

**테이블명:** `my_properties`

**컬럼:**
- `property_id` (PK, 자동 증가)
- `account_id` (FK, accounts 테이블)
- `apt_id` (FK, apartments 테이블)
- `nickname` (별칭, 기본값: "우리집")
- `exclusive_area` (전용면적, ㎡)
- `current_market_price` (현재 시세, 만원, 선택)
- `risk_checked_at` (위험도 확인일, 선택)
- `memo` (메모, 선택)
- `created_at` (생성일)
- `updated_at` (수정일)
- `is_deleted` (소프트 삭제 플래그)

---

## 아키텍처

### 레이어 구조

1. **API Layer** (`app/api/v1/endpoints/my_properties.py`)
   - HTTP 요청/응답 처리
   - 인증 및 권한 확인
   - 캐시 관리
   - 에러 처리

2. **CRUD Layer** (`app/crud/my_property.py`)
   - 데이터베이스 쿼리 수행
   - 비즈니스 로직 (개수 제한 확인 등)

3. **Schema Layer** (`app/schemas/my_property.py`)
   - 요청/응답 데이터 검증
   - 직렬화/역직렬화

4. **Model Layer** (`app/models/my_property.py`)
   - 데이터베이스 테이블 정의
   - 관계 설정

### 캐싱 전략

- **목록 조회:** Redis 캐시 사용 (TTL: 1시간)
- **상세 조회:** Redis 캐시 사용 (TTL: 1시간)
- **캐시 무효화:** 등록/수정/삭제 시 해당 계정의 모든 캐시 삭제

---

## 제한사항

- 최대 100개까지 저장 가능
- 소프트 삭제 사용 (실제 데이터는 삭제되지 않음)
- 사용자별로만 접근 가능 (다른 사용자의 내 집 조회 불가)

---

## 에러 코드

- `MY_PROPERTY_NOT_FOUND`: 내 집을 찾을 수 없음
- `APARTMENT_NOT_FOUND`: 아파트를 찾을 수 없음
- `LIMIT_EXCEEDED`: 최대 개수 초과

---

## 개발 가이드

### 새 기능 추가 시

1. Schema에 필드 추가 (`app/schemas/my_property.py`)
2. CRUD에 메서드 추가 (`app/crud/my_property.py`)
3. 엔드포인트에 라우트 추가 (`app/api/v1/endpoints/my_properties.py`)
4. 캐시 무효화 로직 추가 (필요 시)
5. 문서 업데이트

### 테스트 시나리오

1. **등록 테스트:**
   - 정상 등록
   - 최대 개수 초과
   - 존재하지 않는 아파트 ID

2. **조회 테스트:**
   - 목록 조회 (캐시 히트/미스)
   - 상세 조회 (캐시 히트/미스)
   - 존재하지 않는 내 집 조회

3. **삭제 테스트:**
   - 정상 삭제
   - 존재하지 않는 내 집 삭제
   - 다른 사용자의 내 집 삭제 시도

---

## 참고 파일

- **엔드포인트:** `backend/app/api/v1/endpoints/my_properties.py`
- **CRUD:** `backend/app/crud/my_property.py`
- **Schema:** `backend/app/schemas/my_property.py`
- **Model:** `backend/app/models/my_property.py`
- **캐시 유틸:** `backend/app/utils/cache.py`
- **라우터 등록:** `backend/app/api/v1/router.py`

---

## 변경 이력

- 2026-01-11: 내 집 기능 초기 구현
  - 목록 조회
  - 등록
  - 상세 조회
  - 삭제

---

## 문제 해결 기록

### 문제 1: SQLAlchemy 비동기 세션에서 lazy loading 에러 발생 (greenlet_spawn)

**발생 날짜:** 2026-01-14

**에러 메시지:**
```
greenlet_spawn has not been called; can't call await_only() here. Was IO attempted in an unexpected place?
```

**문제 원인:**

1. **비동기 SQLAlchemy에서 lazy loading의 제한:**
   - 비동기 SQLAlchemy 세션에서는 lazy loading이 작동하지 않습니다
   - `apartment.region`과 같이 관계 속성에 접근할 때 lazy loading이 발생하려고 시도합니다
   - 하지만 비동기 컨텍스트에서는 이를 지원하지 않아 `greenlet_spawn` 에러가 발생합니다

2. **내집 등록 엔드포인트에서의 문제:**
   - `create_my_property` 엔드포인트에서 `apartment_crud.get()`으로 아파트를 조회했습니다
   - 이 메서드는 기본 CRUD의 `get` 메서드를 사용하며, 관계를 로드하지 않습니다
   - 이후 `apartment.region`에 접근하여 lazy loading이 발생했습니다

3. **관심 아파트와의 차이점:**
   - 관심 아파트 추가 엔드포인트에서는 `state_crud.get(db, id=apartment.region_id)`로 region을 직접 조회했습니다
   - 이는 lazy loading을 발생시키지 않으므로 정상 작동했습니다

**해결 방법:**

1. **내집 등록 엔드포인트 수정:**
   ```python
   # 수정 전 (문제 발생)
   region = apartment.region if apartment else None
   
   # 수정 후 (해결)
   region = await state_crud.get(db, id=apartment.region_id) if apartment else None
   ```

2. **state_crud import 추가:**
   ```python
   from app.crud.state import state as state_crud
   ```

**수정된 파일:**
- `backend/app/api/v1/endpoints/my_properties.py`

**학습 포인트:**

1. **비동기 SQLAlchemy에서 관계 접근:**
   - 관계 속성에 직접 접근하면 lazy loading이 발생합니다
   - 비동기 세션에서는 lazy loading이 작동하지 않습니다
   - `selectinload`를 사용하여 관계를 명시적으로 로드하거나, 외래키를 사용하여 직접 조회해야 합니다

2. **CRUD 메서드의 차이:**
   - 기본 CRUD의 `get` 메서드는 관계를 로드하지 않습니다
   - 관계가 필요하다면 `selectinload`를 사용하거나, 별도의 CRUD 메서드를 사용해야 합니다

3. **일관성 있는 패턴:**
   - 관심 아파트처럼 `region_id`로 직접 조회하는 패턴을 사용하는 것이 안전합니다
   - 이는 lazy loading을 완전히 피할 수 있습니다

**관련 수정:**
- 내집 목록/상세 조회에서는 CRUD에서 `selectinload`를 사용하여 관계를 명시적으로 로드했습니다
- 이는 여러 객체를 조회할 때 효율적입니다
- 단일 객체 조회 시에는 `region_id`로 직접 조회하는 것이 더 간단하고 안전합니다
