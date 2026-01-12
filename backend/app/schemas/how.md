# 📋 schemas 폴더 가이드

> 마지막 업데이트: 2026-01-11

## 🎯 이 폴더는 뭐하는 곳이에요?

`schemas/` 폴더는 **데이터의 형태(모양)를 정의**하는 곳이에요!

### 쉬운 비유로 이해하기

마트에서 **주문서 양식**을 생각해보세요:
- 고객이 주문할 때 필요한 정보: 이름, 연락처, 주소
- 마트가 고객에게 알려주는 정보: 주문번호, 배송일, 총 금액

schemas는 바로 이 **"양식"**을 정의하는 곳이에요!

```
클라이언트 → [요청 스키마] → 서버 → [응답 스키마] → 클라이언트
```

## 📁 이 폴더에 들어갈 파일들

```
schemas/
├── __init__.py          # 스키마 모듈 초기화
├── account.py           # 사용자 계정 관련 스키마
├── apartment.py         # 아파트 정보 스키마
├── transaction.py       # 거래 내역 스키마
├── favorite.py          # 관심 매물/지역 스키마
├── my_property.py       # 내 자산 스키마
├── search.py            # 검색 관련 스키마
├── map.py               # 지도 관련 스키마
├── indicator.py         # 지표 데이터 스키마
├── news.py              # 뉴스 스키마
├── common.py            # 공통으로 사용하는 스키마
└── token.py             # JWT 토큰 관련 스키마
```

## 🔧 Pydantic이란?

Pydantic은 Python에서 **데이터 검증(validation)**을 쉽게 해주는 라이브러리에요.

### 왜 Pydantic을 사용할까요?

1. **자동 타입 검증**: 잘못된 데이터가 들어오면 자동으로 에러 발생
2. **자동 변환**: 문자열 "123"을 정수 123으로 자동 변환
3. **API 문서 자동 생성**: FastAPI와 함께 사용하면 Swagger 문서 자동 생성

## 📝 코드 예시

### 1. 기본 스키마 구조 (common.py)

```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Generic, TypeVar, List

# 제네릭 타입 정의
T = TypeVar('T')


class BaseSchema(BaseModel):
    """모든 스키마의 기본 클래스"""
    
    class Config:
        from_attributes = True  # ORM 모델 → 스키마 변환 허용


class ResponseBase(BaseModel, Generic[T]):
    """통일된 API 응답 형태"""
    success: bool = True
    data: Optional[T] = None
    message: str = "요청이 성공적으로 처리되었습니다"


class PaginatedResponse(BaseModel, Generic[T]):
    """페이지네이션이 포함된 응답"""
    items: List[T]
    total: int
    page: int
    size: int
    pages: int  # 총 페이지 수
```

### 2. 사용자 계정 스키마 (account.py)

```python
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional


# ============ 요청(Request) 스키마 ============

class AccountCreate(BaseModel):
    """회원가입 요청 스키마"""
    email: EmailStr                              # 이메일 형식 자동 검증!
    password: str = Field(..., min_length=8)     # 최소 8자
    name: str = Field(..., min_length=2, max_length=50)
    
    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "securepassword123",
                "name": "홍길동"
            }
        }


class AccountLogin(BaseModel):
    """로그인 요청 스키마"""
    email: EmailStr
    password: str


class AccountUpdate(BaseModel):
    """프로필 수정 요청 스키마"""
    name: Optional[str] = Field(None, min_length=2, max_length=50)
    profile_image: Optional[str] = None


# ============ 응답(Response) 스키마 ============

class AccountBase(BaseModel):
    """사용자 기본 정보 (비밀번호 제외!)"""
    id: int
    email: EmailStr
    name: str
    profile_image: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True  # SQLAlchemy 모델에서 변환 가능


class AccountResponse(BaseModel):
    """API 응답용 사용자 정보"""
    success: bool = True
    data: AccountBase
```

### 3. 아파트 스키마 (apartment.py)

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class ApartmentBase(BaseModel):
    """아파트 기본 정보"""
    id: int
    name: str
    address: str
    dong: Optional[str] = None
    latitude: float
    longitude: float
    
    class Config:
        from_attributes = True


class ApartmentDetail(ApartmentBase):
    """아파트 상세 정보 (기본 정보 + 추가 정보)"""
    built_year: Optional[int] = None
    total_units: Optional[int] = None
    floor_area: Optional[Decimal] = None
    avg_price: Optional[Decimal] = None
    
    # 최근 거래 내역
    recent_transactions: Optional[List["TransactionBrief"]] = None


class ApartmentListItem(BaseModel):
    """목록에서 보여줄 아파트 정보 (간략화)"""
    id: int
    name: str
    address: str
    latitude: float
    longitude: float
    avg_price: Optional[Decimal] = None
    transaction_count: int = 0
    
    class Config:
        from_attributes = True


class TransactionBrief(BaseModel):
    """거래 내역 요약"""
    id: int
    price: Decimal
    floor: Optional[int] = None
    transaction_date: datetime
    
    class Config:
        from_attributes = True
```

### 4. 지도 관련 스키마 (map.py)

```python
from pydantic import BaseModel, Field
from typing import List, Optional
from decimal import Decimal


class BoundsRequest(BaseModel):
    """지도 영역 요청 스키마"""
    min_lat: float = Field(..., ge=-90, le=90)   # 위도 범위 검증
    max_lat: float = Field(..., ge=-90, le=90)
    min_lng: float = Field(..., ge=-180, le=180) # 경도 범위 검증
    max_lng: float = Field(..., ge=-180, le=180)
    zoom: Optional[int] = Field(None, ge=1, le=20)
    
    class Config:
        json_schema_extra = {
            "example": {
                "min_lat": 37.4,
                "max_lat": 37.6,
                "min_lng": 126.8,
                "max_lng": 127.1,
                "zoom": 15
            }
        }


class MapMarker(BaseModel):
    """지도 마커 정보"""
    id: int
    latitude: float
    longitude: float
    name: str
    price: Optional[Decimal] = None
    marker_type: str = "apartment"  # apartment, my_property, favorite 등


class MapCluster(BaseModel):
    """클러스터 정보 (여러 마커를 하나로 묶음)"""
    latitude: float
    longitude: float
    count: int
    avg_price: Optional[Decimal] = None
```

### 5. 토큰 스키마 (token.py)

```python
from pydantic import BaseModel
from typing import Optional


class Token(BaseModel):
    """토큰 응답"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """토큰 페이로드 (토큰 내부 정보)"""
    sub: Optional[int] = None  # 사용자 ID
    exp: Optional[int] = None  # 만료 시간
```

## 🎨 스키마 네이밍 규칙

| 접미사 | 용도 | 예시 |
|--------|------|------|
| `Create` | 생성 요청 | `AccountCreate`, `FavoriteCreate` |
| `Update` | 수정 요청 | `AccountUpdate`, `MyPropertyUpdate` |
| `Response` | API 응답 | `AccountResponse`, `ApartmentResponse` |
| `Base` | 기본 필드 정의 | `ApartmentBase`, `TransactionBase` |
| `Detail` | 상세 정보 | `ApartmentDetail` (Base 상속 + 추가 필드) |
| `Brief` | 요약 정보 | `TransactionBrief` (목록용 간략 버전) |
| `List` | 목록 조회용 | `ApartmentListItem` |

## 💡 Schema vs Model 차이점

헷갈리기 쉬운 두 개념을 정리해볼게요!

| 구분 | Model (models/) | Schema (schemas/) |
|------|-----------------|-------------------|
| **역할** | 데이터베이스 테이블 정의 | API 요청/응답 형태 정의 |
| **라이브러리** | SQLAlchemy | Pydantic |
| **특징** | DB에 저장되는 모든 필드 포함 | 필요한 필드만 선택적으로 포함 |
| **예시** | 비밀번호 해시 포함 | 비밀번호 절대 포함 X |

### 왜 분리할까요?

1. **보안**: 비밀번호 같은 민감 정보가 API 응답에 노출되지 않도록
2. **유연성**: 같은 데이터라도 상황에 따라 다른 형태로 제공 가능
3. **검증**: 요청 데이터의 유효성을 자동으로 검사

## 🚀 개발 순서 가이드

1. **1단계**: `common.py`, `token.py` - 공통 스키마 먼저
2. **2단계**: `account.py` - 사용자 인증 관련
3. **3단계**: `apartment.py`, `transaction.py` - 핵심 데이터
4. **4단계**: `map.py`, `search.py` - 지도/검색 기능
5. **5단계**: 나머지 스키마들

## ❓ 자주 묻는 질문

### Q: `from_attributes = True`가 뭔가요?
Pydantic v2에서 SQLAlchemy 모델을 스키마로 변환할 때 필요한 설정이에요.
```python
# 이렇게 하면 모델 → 스키마 변환 가능!
account_schema = AccountBase.model_validate(account_model)
```

### Q: `Field(...)`에서 `...`은 뭔가요?
필수 필드라는 의미에요! `None`을 넣으면 선택 필드가 됩니다.
```python
name: str = Field(...)           # 필수
nickname: str = Field(None)      # 선택
```

### Q: Optional이랑 None의 차이는요?
```python
# 둘 다 선택 필드지만, 타입 힌트가 다릅니다
field1: str | None = None        # Python 3.10+ 스타일
field2: Optional[str] = None     # 전통적 스타일 (typing import 필요)
```

## 📚 참고 자료

- [Pydantic 공식 문서](https://docs.pydantic.dev/)
- [FastAPI - Request Body](https://fastapi.tiangolo.com/tutorial/body/)
