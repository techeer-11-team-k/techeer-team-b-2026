# 📁 core/ 폴더 설명

> **이 폴더는 뭘 하는 곳인가요?**  
> 앱 전체에서 사용하는 **핵심 설정과 보안 기능**이 들어가는 곳입니다!

---

## 🎯 한줄 요약

```
core/ = 가게 운영 시스템 ⚙️
```

영업 시간, 보안 시스템, 규칙 등 가게 전체에 적용되는 설정들입니다.

---

## 📁 이 폴더에 들어갈 파일들

| 파일명 | 역할 | 설명 |
|--------|------|------|
| `config.py` | 설정 관리 | 환경변수, 상수값 |
| `security.py` | 보안 기능 | JWT 토큰, 비밀번호 암호화 |
| `exceptions.py` | 예외 처리 | 커스텀 에러 클래스 |

---

## 📄 config.py - 환경 설정

```python
"""
애플리케이션 설정 관리

환경변수를 읽어와서 Pydantic Settings로 관리합니다.
.env 파일에서 값을 읽어옵니다.
"""
from typing import Optional
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """
    환경변수 설정 클래스
    
    사용법:
        from app.core.config import settings
        print(settings.DATABASE_URL)
    """
    
    # 프로젝트 기본 정보
    PROJECT_NAME: str = "부동산 데이터 분석 서비스"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False
    
    # 데이터베이스
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/realestate"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # JWT 설정
    SECRET_KEY: str = "your-secret-key-change-in-production"  # 반드시 변경!
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24시간
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # 7일
    
    # 외부 API
    MOLIT_API_KEY: Optional[str] = None  # 국토부 API 키
    KAKAO_REST_API_KEY: Optional[str] = None  # 카카오 REST API 키 (주소 검색, 좌표 변환 등)
    KAKAO_JAVASCRIPT_KEY: Optional[str] = None  # 카카오 JavaScript API 키 (지도 SDK용, 프론트엔드에서 주로 사용)
    GEMINI_API_KEY: Optional[str] = None  # Google Gemini API 키 (AI 기능)
    
    # CORS 설정
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """
    설정 인스턴스를 캐싱하여 반환합니다.
    매번 .env 파일을 읽지 않아서 효율적입니다.
    """
    return Settings()


settings = get_settings()
```

---

## 🔧 .env 파일과 config.py 연동 방법

### 1단계: .env 파일 확인

```bash
cd backend
# .env 파일이 이미 존재합니다. 필요시 수정하세요.
```

### 2단계: .env 파일 수정

`.env` 파일을 열어서 실제 값으로 변경:

```bash
# 예시: SECRET_KEY 생성
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3단계: config.py가 자동으로 읽어옴

Pydantic의 `BaseSettings`가 자동으로 `.env` 파일을 읽습니다.

```python
# app/core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str  # .env의 DATABASE_URL 자동 매핑
    SECRET_KEY: str    # .env의 SECRET_KEY 자동 매핑
    
    class Config:
        env_file = ".env"  # 이 설정이 .env 파일을 읽어옴!
```

### 환경변수 우선순위

```
1️⃣ 시스템 환경변수 (export DATABASE_URL=...)
2️⃣ .env 파일
3️⃣ 기본값 (코드에서 설정한 값)
```

**예시**:
```python
DEBUG: bool = False  # 기본값은 False
# .env에 DEBUG=true 있으면 → True
# 시스템에 export DEBUG=false 있으면 → False (시스템 우선)
```

### Docker에서의 환경변수

Docker Compose에서는 `.env` 대신 `environment:` 블록 사용:

```yaml
# docker-compose.yml
services:
  api:
    environment:
      DATABASE_URL: postgresql+asyncpg://user:pass@db:5432/realestate
      SECRET_KEY: ${SECRET_KEY}  # 호스트의 .env에서 읽음
```

### 타입 변환

Pydantic이 자동으로 타입 변환:

```python
class Settings(BaseSettings):
    DEBUG: bool = False           # "true" → True
    PORT: int = 8000              # "8000" → 8000
    ALLOWED_ORIGINS: list[str]    # "http://a,http://b" → ["http://a", "http://b"]
```

**리스트 변환 커스텀 (콤마 구분)**:
```python
from pydantic import field_validator

class Settings(BaseSettings):
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]
    
    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v
```

### 환경별 설정 분리 (선택)

```python
# .env.development, .env.production 등 사용
import os

class Settings(BaseSettings):
    class Config:
        env_file = f".env.{os.getenv('ENVIRONMENT', 'development')}"
```

---

## 📄 security.py - 보안 기능

```python
"""
보안 관련 유틸리티

- 비밀번호 해싱
- JWT 토큰 생성/검증
"""
from datetime import datetime, timedelta
from typing import Optional, Any
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.core.config import settings

# 비밀번호 해싱 설정
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ==================== 비밀번호 관련 ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    비밀번호 검증
    
    Args:
        plain_password: 사용자가 입력한 비밀번호
        hashed_password: DB에 저장된 해시된 비밀번호
    
    Returns:
        일치하면 True, 아니면 False
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    비밀번호 해싱
    
    Args:
        password: 원본 비밀번호
    
    Returns:
        해시된 비밀번호 (DB에 저장할 값)
    """
    return pwd_context.hash(password)


# ==================== JWT 토큰 관련 ====================

def create_access_token(
    subject: int | str, 
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Access Token 생성
    
    Args:
        subject: 토큰에 담을 정보 (보통 user_id)
        expires_delta: 만료 시간 (기본: 24시간)
    
    Returns:
        JWT 토큰 문자열
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    
    to_encode = {
        "exp": expire,      # 만료 시간
        "sub": str(subject) # 사용자 ID
    }
    
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.SECRET_KEY, 
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(subject: int | str) -> str:
    """
    Refresh Token 생성
    
    Access Token보다 유효기간이 길어요 (7일)
    """
    expire = datetime.utcnow() + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "refresh"  # refresh token임을 표시
    }
    
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.SECRET_KEY, 
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict[str, Any]]:
    """
    Access Token 검증 및 디코딩
    
    Args:
        token: JWT 토큰 문자열
    
    Returns:
        성공: 토큰 페이로드 ({"sub": "user_id", "exp": ...})
        실패: None
    """
    try:
        payload = jwt.decode(
            token, 
            settings.SECRET_KEY, 
            algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None
```

---

## 📄 exceptions.py - 커스텀 예외

```python
"""
커스텀 예외 클래스

API 에러 응답을 일관되게 관리합니다.
"""
from typing import Any, Optional
from fastapi import HTTPException, status


class AppException(HTTPException):
    """
    애플리케이션 기본 예외 클래스
    """
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Any] = None
    ):
        detail = {
            "code": code,
            "message": message,
            "details": details
        }
        super().__init__(status_code=status_code, detail=detail)


# ==================== 인증 관련 예외 ====================

class InvalidCredentialsException(AppException):
    """이메일 또는 비밀번호가 틀렸을 때"""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="INVALID_CREDENTIALS",
            message="이메일 또는 비밀번호가 올바르지 않습니다."
        )


class TokenExpiredException(AppException):
    """토큰이 만료되었을 때"""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="TOKEN_EXPIRED",
            message="인증 토큰이 만료되었습니다. 다시 로그인해주세요."
        )


class AlreadyExistsException(AppException):
    """이미 존재하는 리소스일 때 (중복 가입 등)"""
    def __init__(self, resource: str = "리소스"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            code="ALREADY_EXISTS",
            message=f"이미 존재하는 {resource}입니다."
        )


# ==================== 리소스 관련 예외 ====================

class NotFoundException(AppException):
    """리소스를 찾을 수 없을 때"""
    def __init__(self, resource: str = "리소스"):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code=f"{resource.upper()}_NOT_FOUND",
            message=f"해당 {resource}을(를) 찾을 수 없습니다."
        )


class LimitExceededException(AppException):
    """제한 초과했을 때"""
    def __init__(self, resource: str, limit: int):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code=f"{resource.upper()}_LIMIT_EXCEEDED",
            message=f"{resource}은(는) 최대 {limit}개까지 가능합니다."
        )


# ==================== 검증 관련 예외 ====================

class ValidationException(AppException):
    """입력값 검증 실패"""
    def __init__(self, message: str, details: Any = None):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="VALIDATION_ERROR",
            message=message,
            details=details
        )
```

---

## 💡 사용 예시

```python
# 설정값 사용
from app.core.config import settings
print(settings.DATABASE_URL)

# 비밀번호 해싱
from app.core.security import get_password_hash, verify_password
hashed = get_password_hash("mypassword123")
is_valid = verify_password("mypassword123", hashed)

# JWT 토큰 생성
from app.core.security import create_access_token
token = create_access_token(subject=user.id)

# 예외 발생
from app.core.exceptions import NotFoundException
raise NotFoundException("아파트")
```
