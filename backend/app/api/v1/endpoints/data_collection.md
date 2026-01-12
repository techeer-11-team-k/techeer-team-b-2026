# 데이터 수집 API 문서

## 개요

국토교통부 표준지역코드 API에서 지역 데이터를 가져와서 데이터베이스에 저장하는 API입니다.

## 엔드포인트

### POST `/api/v1/data-collection/regions`

지역 데이터 수집 및 저장

#### 요청

```http
POST /api/v1/data-collection/regions
Content-Type: application/json
```

요청 본문 없음 (파라미터 없음)

#### 응답

**성공 (200 OK)**

```json
{
  "success": true,
  "total_fetched": 3500,
  "total_saved": 3200,
  "skipped": 300,
  "errors": [],
  "message": "수집 완료: 3200개 저장, 300개 건너뜀"
}
```

**오류 (500 Internal Server Error)**

```json
{
  "detail": {
    "code": "CONFIGURATION_ERROR",
    "message": "MOLIT_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요."
  }
}
```

#### 응답 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 수집 성공 여부 |
| `total_fetched` | integer | API에서 가져온 총 레코드 수 |
| `total_saved` | integer | 데이터베이스에 저장된 레코드 수 |
| `skipped` | integer | 중복으로 건너뛴 레코드 수 |
| `errors` | array[string] | 오류 메시지 목록 |
| `message` | string | 결과 메시지 |

## 작동 방식

1. **API 호출**: 17개 시도를 순회하며 국토부 API 호출
   - 서울특별시, 부산광역시, 대구광역시, 인천광역시, 광주광역시, 대전광역시, 울산광역시, 세종특별자치시, 경기도, 강원특별자치도, 충청북도, 충청남도, 전북특별자치도, 전라남도, 경상북도, 경상남도, 제주특별자치도

2. **페이지네이션**: 각 시도별로 페이지를 순회하며 모든 데이터 수집
   - 한 페이지당 최대 1000개 레코드
   - `totalCount`를 확인하여 다음 페이지 존재 여부 판단

3. **중복 체크**: 데이터베이스에 이미 존재하는 `region_code`는 건너뜀
   - `region_code` 기준으로 중복 확인
   - 존재하면 저장하지 않고 `skipped` 카운트 증가

4. **데이터 저장**: 새로운 데이터만 `states` 테이블에 저장
   - `region_name`: 시군구명
   - `region_code`: 지역코드 (10자리)
   - `city_name`: 시도명

5. **로깅**: 진행 상황을 백엔드 로그에 출력
   - 각 시도별 진행 상황
   - 저장/건너뜀 통계
   - 오류 메시지

## 환경 변수

`.env` 파일에 다음 환경 변수가 설정되어 있어야 합니다:

```bash
MOLIT_API_KEY=your_api_key_here
```

## 사용 예시

### cURL

```bash
curl -X POST "http://localhost:8000/api/v1/data-collection/regions" \
  -H "Content-Type: application/json"
```

### Python (httpx)

```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8000/api/v1/data-collection/regions"
    )
    result = response.json()
    print(f"저장: {result['total_saved']}개, 건너뜀: {result['skipped']}개")
```

### Swagger UI

1. `http://localhost:8000/docs` 접속
2. `📥 Data Collection (데이터 수집)` 섹션 찾기
3. `POST /api/v1/data-collection/regions` 클릭
4. "Try it out" → "Execute" 클릭

## 주의사항

1. **API 호출 제한**: 국토부 API는 호출 제한이 있을 수 있습니다. 너무 자주 호출하지 마세요.

2. **실행 시간**: 17개 시도를 모두 처리하는데 시간이 걸릴 수 있습니다 (약 1-2분).

3. **중복 실행**: 이미 수집된 데이터는 자동으로 건너뛰므로 안전하게 재실행할 수 있습니다.

4. **로그 확인**: 진행 상황은 백엔드 로그에서 확인할 수 있습니다:
   ```bash
   docker compose logs -f backend
   ```

## 관련 파일

- **엔드포인트**: `backend/app/api/v1/endpoints/data-collection.py`
- **서비스**: `backend/app/services/data_collection.py`
- **CRUD**: `backend/app/crud/state.py`
- **모델**: `backend/app/models/state.py`
- **스키마**: `backend/app/schemas/state.py`
