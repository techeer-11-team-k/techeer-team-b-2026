# 아파트 API 에러 발생 시점 정리

## 📋 개요
`endpoints/apartments.py`와 `services/apartment.py`에서 발생하는 에러의 흐름과 시점을 정리합니다.

---

## 🔄 에러 처리 흐름

```
클라이언트 요청
    ↓
endpoints/apartments.py (엔드포인트)
    ↓
services/apartment.py (비즈니스 로직)
    ↓
외부 API 호출 (MOLIT API)
    ↓
응답 처리 및 변환
    ↓
에러 발생 시 → handle_apartment_errors 데코레이터가 HTTP 응답으로 변환
```

---

## 📍 `endpoints/apartments.py` - 에러 발생 시점

### 1. **`handle_apartment_errors` 데코레이터**
   - **위치**: 모든 엔드포인트 함수에 적용
   - **역할**: 서비스 레이어에서 발생한 예외를 HTTP 응답으로 변환

   #### 발생하는 에러:
   
   | 예외 타입 | HTTP 상태 코드 | 응답 코드 | 발생 시점 |
   |---------|--------------|----------|----------|
   | `NotFoundException` | 404 | `APT_NOT_FOUND` | 서비스에서 아파트를 찾을 수 없을 때 |
   | `ExternalAPIException` | 503 | `EXTERNAL_API_ERROR` | 외부 API 호출 실패 또는 오류 |
   | 기타 `Exception` | 500 | `INTERNAL_SERVER_ERROR` | 예상치 못한 서버 오류 |

### 2. **엔드포인트 함수**
   - `get_apartment_info()`: 기본 정보 조회
   - `get_apartment_detail_info()`: 상세 정보 조회
   - **에러 발생**: 직접 발생하지 않음, 서비스 레이어에서 발생한 예외를 받아서 처리

---

## 📍 `services/apartment.py` - 에러 발생 시점

### 1. **`_call_external_api()` 메서드**

   #### 에러 발생 시점:

   **① API 키 검증 실패**
   ```python
   if not api_key:
       raise ExternalAPIException("API 키가 설정되지 않았습니다...")
   ```
   - **시점**: API 키가 `settings.MOLIT_API_KEY`에 없을 때
   - **에러 타입**: `ExternalAPIException`

   **② HTTP 요청 실패**
   ```python
   except httpx.HTTPError as e:
       raise ExternalAPIException(f"외부 API 호출 실패: {str(e)}")
   ```
   - **시점**: 
     - 네트워크 오류
     - 타임아웃 (10초 초과)
     - HTTP 상태 코드 오류 (4xx, 5xx)
   - **에러 타입**: `ExternalAPIException`

   **③ 응답 형식 오류**
   ```python
   elif "application/xml" in content_type:
       raise ExternalAPIException("API가 XML 형식으로 응답했습니다...")
   ```
   - **시점**: API가 JSON이 아닌 XML로 응답할 때
   - **에러 타입**: `ExternalAPIException`

   **④ 지원하지 않는 Content-Type**
   ```python
   else:
       raise ExternalAPIException(f"지원하지 않는 응답 형식입니다...")
   ```
   - **시점**: 응답의 Content-Type이 JSON도 XML도 아닐 때
   - **에러 타입**: `ExternalAPIException`

   **⑤ 기타 예외**
   ```python
   except Exception as e:
       raise ExternalAPIException(f"API 처리 중 오류 발생: {str(e)}")
   ```
   - **시점**: 예상치 못한 예외 발생
   - **에러 타입**: `ExternalAPIException`

### 2. **`_parse_api_response()` 메서드**

   #### 에러 발생 시점:

   **① API 응답 구조 오류**
   ```python
   else:
       raise ExternalAPIException(f"예상하지 못한 API 응답 구조: {list(api_response.keys())}")
   ```
   - **시점**: 응답에 `response` 키가 없을 때
   - **에러 타입**: `ExternalAPIException`

   **② API 에러 코드 (resultCode != "00")**
   ```python
   if result_code and result_code != "00":
       if result_code in ["03", "05"]:  # 데이터 없음
           raise NotFoundException("아파트")
       else:
           raise ExternalAPIException(error_msg)
   ```
   - **시점**: 
     - `resultCode`가 "03" 또는 "05" → `NotFoundException` (데이터 없음)
     - 그 외 에러 코드 → `ExternalAPIException`
   - **에러 타입**: `NotFoundException` 또는 `ExternalAPIException`

   **③ body가 없는 경우**
   ```python
   else:
       raise NotFoundException("아파트")
   ```
   - **시점**: 응답에 `body` 키가 없을 때
   - **에러 타입**: `NotFoundException`

   **④ items가 비어있는 경우**
   ```python
   if not items:
       raise NotFoundException("아파트")
   ```
   - **시점**: `body.items`가 None이거나 빈 딕셔너리일 때
   - **에러 타입**: `NotFoundException`

   **⑤ item이 없는 경우**
   ```python
   if not item:
       raise NotFoundException("아파트")
   ```
   - **시점**: `items.item`이 None이거나 빈 리스트일 때
   - **에러 타입**: `NotFoundException`

### 3. **`get_apartment_basic_info()` 메서드**

   #### 에러 발생 시점:

   **① 입력 검증 실패**
   ```python
   if not kapt_code or not kapt_code.strip():
       raise ExternalAPIException("단지 코드(kapt_code)가 필요합니다.")
   ```
   - **시점**: `kapt_code`가 비어있거나 공백만 있을 때
   - **에러 타입**: `ExternalAPIException`

   **② API 응답 파싱 실패 (NotFoundException 재발생)**
   ```python
   except NotFoundException:
       raise NotFoundException(f"아파트를 찾을 수 없습니다. (단지코드: {kapt_code})...")
   ```
   - **시점**: `_parse_api_response()`에서 `NotFoundException` 발생 시
   - **에러 타입**: `NotFoundException` (더 자세한 메시지 포함)

   **③ 스키마 검증 실패**
   ```python
   except Exception as e:
       raise ExternalAPIException(f"API 응답 파싱 실패: {error_msg}")
   ```
   - **시점**: `AptBasicInfo(**item)`에서 Pydantic 검증 실패
   - **에러 타입**: `ExternalAPIException`

### 4. **`get_apartment_detail_info()` 메서드**

   #### 에러 발생 시점:
   - `get_apartment_basic_info()`와 동일한 패턴
   - 단, `AptDetailInfo` 스키마로 변환

---

## 📊 에러 발생 시점 요약표

| 단계 | 메서드/함수 | 에러 타입 | 발생 조건 |
|-----|-----------|---------|----------|
| **입력 검증** | `get_apartment_basic_info()` | `ExternalAPIException` | kapt_code가 비어있음 |
| **API 호출** | `_call_external_api()` | `ExternalAPIException` | API 키 없음, 네트워크 오류, 타임아웃, HTTP 오류 |
| **응답 형식** | `_call_external_api()` | `ExternalAPIException` | XML 응답, 지원하지 않는 Content-Type |
| **응답 파싱** | `_parse_api_response()` | `NotFoundException` | 데이터 없음 (resultCode 03/05, items/item 없음) |
| **응답 파싱** | `_parse_api_response()` | `ExternalAPIException` | 응답 구조 오류, 기타 API 에러 코드 |
| **스키마 변환** | `get_apartment_*_info()` | `ExternalAPIException` | Pydantic 검증 실패 |
| **에러 변환** | `handle_apartment_errors` | HTTP 404/503/500 | 서비스 레이어 예외를 HTTP 응답으로 변환 |

---

## 🔍 실제 에러 발생 예시

### 예시 1: 아파트를 찾을 수 없음
```
요청: GET /api/v1/apartments/A15876402
  ↓
services/apartment.py: _parse_api_response()
  → resultCode = "03" (데이터 없음)
  → NotFoundException 발생
  ↓
endpoints/apartments.py: handle_apartment_errors
  → HTTP 404 응답
```

### 예시 2: API 키 없음
```
요청: GET /api/v1/apartments/A15876402
  ↓
services/apartment.py: _call_external_api()
  → settings.MOLIT_API_KEY가 None
  → ExternalAPIException 발생
  ↓
endpoints/apartments.py: handle_apartment_errors
  → HTTP 503 응답
```

### 예시 3: 네트워크 오류
```
요청: GET /api/v1/apartments/A15876402
  ↓
services/apartment.py: _call_external_api()
  → httpx.HTTPError 발생 (연결 실패)
  → ExternalAPIException 발생
  ↓
endpoints/apartments.py: handle_apartment_errors
  → HTTP 503 응답
```

---

## 💡 디버깅 팁

1. **로깅 확인**: `logger.debug()`로 API 응답 확인
2. **에러 메시지**: `NotFoundException`과 `ExternalAPIException`의 메시지 확인
3. **API 응답 구조**: `_parse_api_response()`에서 실제 응답 구조 확인
4. **스키마 검증**: Pydantic 에러의 `errors` 필드 확인
