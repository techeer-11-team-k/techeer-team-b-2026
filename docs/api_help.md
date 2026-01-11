# API 문서 작성 도움말 & 개발 가이드

> **목적**: API 문서 작성 시 참고할 가이드라인, 개발 초보자를 위한 팁, 추가 기능 및 기술 스택 제안

---

## 📋 목차

1. [API 문서 작성 가이드라인](#1-api-문서-작성-가이드라인)
2. [개발 초보자를 위한 기본 지식](#2-개발-초보자를-위한-기본-지식)
3. [FastAPI 개발 팁](#3-fastapi-개발-팁)
4. [추가 기능 제안](#4-추가-기능-제안)
5. [기술 스택 추천](#5-기술-스택-추천)
6. [자주 하는 실수와 해결책](#6-자주-하는-실수와-해결책)
7. [참고 자료](#7-참고-자료)

---

## 1. API 문서 작성 가이드라인

### 1.1 RESTful API 네이밍 규칙

#### URL 설계 원칙

```
✅ Good:
GET    /api/v1/apartments           # 아파트 목록 조회
GET    /api/v1/apartments/{id}      # 특정 아파트 조회
POST   /api/v1/apartments           # 아파트 생성
PUT    /api/v1/apartments/{id}      # 아파트 전체 수정
PATCH  /api/v1/apartments/{id}      # 아파트 일부 수정
DELETE /api/v1/apartments/{id}      # 아파트 삭제

❌ Bad:
GET    /api/v1/getApartments        # 동사 사용 X
POST   /api/v1/apartment/create     # 동사 사용 X
GET    /api/v1/Apartments           # 대문자 X
```

#### 관계형 리소스

```
# 아파트의 거래 내역
GET /api/v1/apartments/{apt_id}/transactions

# 사용자의 관심 아파트
GET /api/v1/users/me/favorites/apartments
```

#### Query Parameter 사용 시점

- **필터링**: `?trans_type=SALE`
- **정렬**: `?sort=price&order=desc`
- **페이지네이션**: `?page=1&limit=20`
- **검색**: `?q=래미안`

### 1.2 응답 형식 통일

모든 API 응답은 **일관된 형식**을 따라야 합니다.

```json
// 성공
{
  "success": true,
  "data": { /* 실제 데이터 */ },
  "meta": { /* 페이지네이션, 출처 등 메타 정보 */ }
}

// 실패
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",       // 프로그래밍용 코드
    "message": "사용자 메시지",  // UI에 표시할 메시지
    "details": null             // 추가 디버깅 정보 (개발 환경만)
  }
}
```

### 1.3 에러 코드 설계

| 범주 | 코드 패턴 | 예시 |
|------|-----------|------|
| 인증 | `AUTH_*` | `AUTH_TOKEN_EXPIRED`, `AUTH_INVALID_CREDENTIALS` |
| 리소스 | `{RESOURCE}_*` | `APT_NOT_FOUND`, `USER_NOT_FOUND` |
| 검증 | `VALIDATION_*` | `VALIDATION_EMAIL_FORMAT`, `VALIDATION_PASSWORD_WEAK` |
| 제한 | `LIMIT_*` | `LIMIT_FAVORITE_EXCEEDED`, `LIMIT_RATE_EXCEEDED` |
| 권한 | `PERMISSION_*` | `PERMISSION_DENIED` |

### 1.4 문서 작성 체크리스트

각 API 문서 작성 시 확인할 항목:

- [ ] **기본 정보**: Method, URL, 설명
- [ ] **인증 필요 여부**: Auth 헤더 필요 여부 명시
- [ ] **Request**:
  - [ ] Headers (Content-Type, Authorization 등)
  - [ ] Path Parameters
  - [ ] Query Parameters
  - [ ] Request Body (필드명, 타입, 필수 여부, 검증 규칙)
- [ ] **Response**:
  - [ ] 성공 응답 (상태 코드, 예시 JSON)
  - [ ] 에러 응답 (에러 코드별 설명)
- [ ] **예시**: cURL 또는 실제 요청/응답 예시
- [ ] **관련 기능 ID**: 기능 명세서의 FUNC-XXX와 매핑

---

## 2. 개발 초보자를 위한 기본 지식

### 2.1 HTTP 메서드 이해

| 메서드 | 의미 | 특성 | 예시 |
|--------|------|------|------|
| `GET` | 조회 | 안전, 멱등 | 아파트 정보 조회 |
| `POST` | 생성 | 비멱등 | 회원가입, 관심 아파트 추가 |
| `PUT` | 전체 수정 | 멱등 | 프로필 전체 수정 |
| `PATCH` | 일부 수정 | 멱등 | 닉네임만 수정 |
| `DELETE` | 삭제 | 멱등 | 관심 아파트 삭제 |

> **멱등(Idempotent)**: 여러 번 호출해도 결과가 같음

### 2.2 HTTP 상태 코드

#### 성공 (2xx)

| 코드 | 의미 | 사용 예시 |
|------|------|-----------|
| `200 OK` | 성공 | GET, PUT, PATCH, DELETE 성공 |
| `201 Created` | 리소스 생성됨 | POST로 새 리소스 생성 |
| `204 No Content` | 성공, 응답 본문 없음 | DELETE 성공 |

#### 클라이언트 에러 (4xx)

| 코드 | 의미 | 사용 예시 |
|------|------|-----------|
| `400 Bad Request` | 잘못된 요청 | 파라미터 누락, 형식 오류 |
| `401 Unauthorized` | 인증 필요 | 토큰 없음, 토큰 만료 |
| `403 Forbidden` | 권한 없음 | 타인 리소스 접근 시도 |
| `404 Not Found` | 리소스 없음 | 존재하지 않는 아파트 조회 |
| `409 Conflict` | 충돌 | 이미 존재하는 이메일로 가입 |
| `429 Too Many Requests` | 요청 제한 초과 | Rate Limit 초과 |

#### 서버 에러 (5xx)

| 코드 | 의미 | 사용 예시 |
|------|------|-----------|
| `500 Internal Server Error` | 서버 에러 | 예기치 못한 오류 |
| `502 Bad Gateway` | 게이트웨이 오류 | 외부 API 연동 실패 |
| `503 Service Unavailable` | 서비스 불가 | 서버 점검 중 |

### 2.3 JSON 기본 문법

```json
{
  "string_field": "문자열",
  "number_field": 123,
  "float_field": 12.34,
  "boolean_field": true,
  "null_field": null,
  "array_field": [1, 2, 3],
  "object_field": {
    "nested": "value"
  }
}
```

**주의사항**:
- 키는 **쌍따옴표**로 감싸야 함 (`'key'` ❌, `"key"` ✅)
- 마지막 항목 뒤에 쉼표 없음
- 날짜는 ISO 8601 형식 (`"2026-01-11T12:00:00Z"`)

### 2.4 JWT (JSON Web Token) 이해

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**구조**:
1. **Header**: 알고리즘, 토큰 타입
2. **Payload**: 사용자 정보 (user_id, email, 만료시간 등)
3. **Signature**: 위변조 방지용 서명

**Access Token vs Refresh Token**:

| 구분 | Access Token | Refresh Token |
|------|--------------|---------------|
| 용도 | API 인증 | Access Token 재발급 |
| 유효기간 | 짧음 (24시간) | 길음 (7일) |
| 저장 위치 | 메모리, Secure Storage | Secure Storage |
| 전송 빈도 | 매 요청마다 | 토큰 갱신 시만 |

---

## 3. FastAPI 개발 팁

### 3.1 Pydantic 스키마 작성

```python
from pydantic import BaseModel, Field, validator, EmailStr
from typing import Literal, Optional
from datetime import datetime

# Request 스키마
class RegisterRequest(BaseModel):
    email: EmailStr  # 이메일 형식 자동 검증
    password: str = Field(..., min_length=8, description="8자 이상")
    nickname: str = Field(..., min_length=2, max_length=20)

    @validator('password')
    def validate_password(cls, v):
        # 비밀번호 복잡도 검증
        if not any(c.isdigit() for c in v):
            raise ValueError('비밀번호는 숫자를 포함해야 합니다')
        return v

# Response 스키마
class ApartmentResponse(BaseModel):
    apt_id: int
    apt_name: str
    trans_type: Literal["SALE", "JEONSE", "MONTHLY"]
    trans_price: Optional[int] = Field(None, description="매매가 (만원)")
    
    class Config:
        from_attributes = True  # ORM 객체 → Pydantic 변환 허용
```

### 3.2 API 엔드포인트 작성

```python
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/apartments", tags=["apartments"])

@router.get("/{apt_id}")
async def get_apartment(
    apt_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    아파트 상세 정보 조회
    
    - **apt_id**: 아파트 ID
    """
    apartment = await apartment_service.get_by_id(db, apt_id)
    if not apartment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APT_NOT_FOUND", "message": "아파트를 찾을 수 없습니다"}
        )
    return {"success": True, "data": apartment}

@router.get("/{apt_id}/transactions")
async def get_transactions(
    apt_id: int,
    trans_type: Optional[str] = Query(None, regex="^(SALE|JEONSE|MONTHLY|ALL)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """거래 내역 조회 (페이지네이션)"""
    result = await transaction_service.get_by_apartment(
        db, apt_id, trans_type, page, limit
    )
    return {
        "success": True,
        "data": result.items,
        "meta": {"page": page, "limit": limit, "total": result.total}
    }
```

### 3.3 비동기 처리

```python
# 외부 API 동시 호출
import asyncio
import httpx

async def fetch_apartment_data(apt_id: int):
    async with httpx.AsyncClient() as client:
        # 여러 외부 API 동시 호출
        basic_info, price_info = await asyncio.gather(
            client.get(f"{MOLIT_API}/basic/{apt_id}"),
            client.get(f"{MOLIT_API}/price/{apt_id}")
        )
    return basic_info.json(), price_info.json()
```

---

## 4. 추가 기능 제안

### 4.1 현재 후순위로 표시된 기능들

| 기능 | 설명 | 구현 난이도 | 우선순위 제안 |
|------|------|-------------|---------------|
| **소셜 로그인** (FUNC-001-02) | 카카오/구글 OAuth | 중간 | MVP 이후 |
| **가격 히트맵** | 지역별 가격 색상 오버레이 | 높음 | Beta |
| **POI 표시** | 역, 학교 등 주요 시설 | 낮음 | Beta |
| **로드뷰** (FUNC-003-08) | 카카오맵 로드뷰 연동 | 낮음 | MVP |
| **뉴스 기능** (FUNC-009) | 부동산 뉴스 크롤링 | 중간 | Beta |
| **AI 챗봇** (FUNC-009-01 AI) | 조건 기반 아파트 탐색 | 높음 | 향후 |
| **푸시 알림** (FUNC-011) | 관심 아파트 시세 알림 | 중간 | 향후 |
| **차트 다운로드** (FUNC-005-07) | PNG/CSV 내보내기 | 낮음 | Beta |

### 4.2 추가 고려할 기능

#### 사용자 경험 개선

| 기능 | 설명 | API 엔드포인트 제안 |
|------|------|---------------------|
| **가격 알림 설정** | 관심 아파트 가격 변동 시 알림 | `POST /api/v1/alerts` |
| **비교함** | 여러 아파트 비교 | `POST /api/v1/comparisons` |
| **시세 예측** | 과거 데이터 기반 추세선 | `GET /api/v1/apartments/{id}/forecast` |
| **공유 기능** | 아파트 정보 공유 링크 | `POST /api/v1/shares` |
| **데이터 다운로드** | 거래 내역 엑셀 다운로드 | `GET /api/v1/exports/transactions` |

#### 데이터 품질 개선

| 기능 | 설명 |
|------|------|
| **데이터 갱신 알림** | 새 거래 데이터 반영 시 알림 |
| **데이터 정확도 표시** | 데이터 수집 시점, 신뢰도 표시 |
| **이상치 감지** | 비정상적인 거래가 필터링 |

---

## 5. 기술 스택 추천

### 5.1 현재 기술 스택 (PRD 기준)

| 레이어 | 기술 |
|--------|------|
| Frontend | React Native (Expo), TypeScript, TailwindCSS |
| Map | 카카오맵 JS SDK, Mapbox GL JS |
| Visualization | D3.js, Highcharts |
| Backend | FastAPI, Python 3.11+, Uvicorn, Pydantic |
| Database | PostgreSQL 15+ with PostGIS 3.3 |
| Cache | Redis (ElastiCache) |
| Infra | AWS (EC2, RDS, S3, ElastiCache), Docker, Nginx |
| CI/CD | GitHub Actions |
| Monitoring | Prometheus, Grafana, Slack |

### 5.2 추가 추천 도구

#### 개발 생산성

| 도구 | 용도 | 설명 |
|------|------|------|
| **Ruff** | Python Linter | Black + isort + flake8 통합, 매우 빠름 |
| **pre-commit** | Git Hooks | 커밋 전 코드 검사 자동화 |
| **pytest-asyncio** | 테스트 | 비동기 API 테스트 |
| **httpx** | HTTP 클라이언트 | 외부 API 호출용 (async 지원) |

#### API 문서화

| 도구 | 용도 | 설명 |
|------|------|------|
| **Swagger UI** | API 문서 | FastAPI 자동 생성 (`/docs`) |
| **ReDoc** | API 문서 | FastAPI 자동 생성 (`/redoc`) |
| **Stoplight** | API 설계 | OpenAPI 스펙 시각적 편집 |

#### 테스트

| 도구 | 용도 | 설명 |
|------|------|------|
| **pytest** | 단위/통합 테스트 | Python 표준 테스트 프레임워크 |
| **Locust** | 부하 테스트 | Python 기반 부하 테스트 |
| **k6** | 부하 테스트 | 성능 테스트 (JS 기반) |
| **Postman** | API 테스트 | 수동 API 테스트 및 자동화 |

#### 모니터링 & 로깅

| 도구 | 용도 | 설명 |
|------|------|------|
| **Sentry** | 에러 추적 | 실시간 에러 모니터링 |
| **Structlog** | 로깅 | 구조화된 JSON 로그 |
| **OpenTelemetry** | 추적 | 분산 추적 (Tracing) |

#### 데이터 관련

| 도구 | 용도 | 설명 |
|------|------|------|
| **Celery** | 배치 작업 | 비동기 작업 큐 |
| **APScheduler** | 스케줄링 | 배치 작업 스케줄링 |
| **Alembic** | DB 마이그레이션 | SQLAlchemy 마이그레이션 |

### 5.3 개발 환경 설정 예시

#### requirements.txt

```txt
# Core
fastapi>=0.100.0
uvicorn[standard]>=0.23.0
pydantic>=2.0.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4

# Database
sqlalchemy[asyncio]>=2.0.0
asyncpg>=0.28.0
alembic>=1.11.0
geoalchemy2>=0.14.0

# Cache
redis>=4.6.0

# HTTP Client
httpx>=0.24.0

# Testing
pytest>=7.4.0
pytest-asyncio>=0.21.0
pytest-cov>=4.1.0

# Linting
ruff>=0.0.280
```

#### Docker Compose (개발용)

```yaml
version: '3.8'
services:
  db:
    image: postgis/postgis:15-3.3
    environment:
      POSTGRES_DB: realestate
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: devpassword
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://dev:devpassword@db:5432/realestate
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

volumes:
  postgres_data:
```

---

## 6. 자주 하는 실수와 해결책

### 6.1 좌표 순서 혼동

**문제**: GeoJSON과 카카오맵의 좌표 순서가 다름

```javascript
// GeoJSON/PostGIS: [경도(lng), 위도(lat)]
const geoJsonCoord = [127.0276, 37.4979];

// 카카오맵: LatLng(위도, 경도)
const kakaoLatLng = new kakao.maps.LatLng(37.4979, 127.0276);
```

**해결책**: 변환 유틸리티 함수 사용

```javascript
// utils/coordinates.js
export function geoJsonToKakao([lng, lat]) {
  return new kakao.maps.LatLng(lat, lng);
}

export function kakaoToGeoJson(latLng) {
  return [latLng.getLng(), latLng.getLat()];
}
```

### 6.2 페이지네이션 누락

**문제**: 대량 데이터 조회 시 성능 저하

**해결책**: 모든 리스트 조회 API에 페이지네이션 필수

```python
# ❌ Bad
@router.get("/apartments")
async def get_all():
    return await db.execute(select(Apartment))  # 전체 조회

# ✅ Good
@router.get("/apartments")
async def get_paginated(page: int = 1, limit: int = Query(20, le=100)):
    offset = (page - 1) * limit
    query = select(Apartment).offset(offset).limit(limit)
    return await db.execute(query)
```

### 6.3 캐시 무효화 누락

**문제**: 데이터 갱신 후에도 이전 캐시 응답

**해결책**: 데이터 변경 시 관련 캐시 삭제

```python
async def update_apartment(apt_id: int, data: dict):
    # 1. DB 업데이트
    await db.execute(update(Apartment).where(...).values(**data))
    
    # 2. 관련 캐시 무효화
    await redis.delete(f"apt:{apt_id}:detail")
    await redis.delete(f"apt:{apt_id}:transactions")
    # 지도 마커 캐시도 무효화 필요할 수 있음
```

### 6.4 에러 메시지 노출

**문제**: 개발 환경의 상세 에러가 운영 환경에서 노출

**해결책**: 환경별 에러 응답 분리

```python
from fastapi import Request
from starlette.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if settings.DEBUG:
        # 개발 환경: 상세 정보 포함
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": str(exc),
                    "details": traceback.format_exc()
                }
            }
        )
    else:
        # 운영 환경: 일반 메시지만
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "일시적인 오류가 발생했습니다."
                }
            }
        )
```

### 6.5 법적 고지 누락

**문제**: 투자 관련 데이터에 면책 조항 없음

**해결책**: 모든 지표/차트 응답에 disclaimer 포함

```python
def create_indicator_response(data: dict) -> dict:
    return {
        "success": True,
        "data": data,
        "meta": {
            "data_source": "국토교통부",
            "data_period": "2025-12",
            "disclaimer": "본 서비스는 과거 데이터 기반 시각화이며 투자 판단/권유를 제공하지 않습니다."
        }
    }
```

---

## 7. 참고 자료

### 7.1 공식 문서

| 기술 | URL |
|------|-----|
| FastAPI | https://fastapi.tiangolo.com/ko/ |
| Pydantic V2 | https://docs.pydantic.dev/latest/ |
| SQLAlchemy 2.0 | https://docs.sqlalchemy.org/en/20/ |
| PostGIS | https://postgis.net/documentation/ |
| 카카오맵 API | https://apis.map.kakao.com/web/ |
| OpenAI API | https://platform.openai.com/docs/ |

### 7.2 외부 API 문서

| API | 설명 | 위치 |
|-----|------|------|
| 국토부 실거래가 | 아파트 매매/전월세 | `external_api_spec/엔드포인트/아파트 매매 실거래가*` |
| 국토부 기본정보 | 아파트 단지 정보 | `external_api_spec/엔드포인트/아파트 단지*` |
| 카카오 지오코딩 | 주소 → 좌표 변환 | `external_api_spec/엔드포인트/Kakao 지오코딩*` |
| 카카오 로컬 | 주소 검색 | `external_api_spec/엔드포인트/카카오 로컬*` |

### 7.3 프로젝트 내부 문서

| 문서 | 설명 | 경로 |
|------|------|------|
| PRD | 제품 요구사항 정의서 | `.agent/prd.md` |
| 기능 명세서 | 기능 ID 및 설명 | `.agent/feature.md`, `feature_spec.md` |
| 백엔드 가이드 | API/DB 상세 | `.agent/02_backend_dev.md` |
| 협업 노트 | 팀 간 합의사항 | `.agent/note.md` |
| DB 스키마 | 테이블 정의 | `.agent/data.sql` |

---

## 📝 부록: 용어 정리

| 용어 | 설명 |
|------|------|
| **전세가율** | 매매가 대비 전세가 비율 (%) |
| **평당가** | 전용면적 1평(3.3㎡) 당 가격 |
| **실거래가** | 국토부에 신고된 실제 거래 금액 |
| **주택가격지수** | 특정 시점(2017.11) 대비 가격 변동률 지수 |
| **법정동 코드** | 행정구역 식별 코드 (10자리) |
| **단지코드 (kapt_code)** | 국토부 아파트 단지 식별 코드 |
| **SRID 4326** | WGS84 좌표계 (GPS 좌표) |
| **멱등성 (Idempotent)** | 동일한 요청을 여러 번 해도 결과가 같은 성질 |

---

> **문서 변경 이력**
>
> | 버전 | 날짜 | 변경 내용 | 작성자 |
> |------|------|-----------|--------|
> | 0.1.0 | 2026-01-11 | 초안 작성 | (TODO) |
