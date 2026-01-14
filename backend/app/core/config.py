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
    ENVIRONMENT: str = "development"
    
    # 데이터베이스
    # ⚠️ 보안: .env 파일에서 반드시 설정하세요!
    DATABASE_URL: str  # 필수 환경변수
    
    # Redis
    # ⚠️ 보안: .env 파일에서 반드시 설정하세요!
    REDIS_URL: str  # 필수 환경변수
    
    # Clerk 인증 설정
    # ⚠️ 보안: .env 파일에서 반드시 설정하세요!
    CLERK_SECRET_KEY: Optional[str] = None  # Clerk Secret Key (Backend API) - 인증이 필요한 API에서만 사용
    CLERK_PUBLISHABLE_KEY: Optional[str] = None  # Clerk Publishable Key (Frontend)
    CLERK_WEBHOOK_SECRET: Optional[str] = None  # Clerk Webhook Secret (웹훅 검증용)
    
    # JWT 설정 (레거시 호환성, Clerk 사용 시 불필요)
    # ⚠️ 보안: .env 파일에서 반드시 설정하세요!
    SECRET_KEY: str  # 필수 환경변수
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24시간
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # 7일
    
    # 외부 API
    MOLIT_API_KEY: Optional[str] = None  # 국토부 API 키
    KAKAO_REST_API_KEY: Optional[str] = None  # 카카오 REST API 키
    KAKAO_JAVASCRIPT_KEY: Optional[str] = None  # 카카오 JavaScript API 키
    GEMINI_API_KEY: Optional[str] = None  # Google Gemini API 키
    NAVER_CLIENT_ID: Optional[str] = None
    NAVER_CLIENT_SECRET: Optional[str] = None
    
    # CORS 설정 (문자열로 받아서 split)
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:8081"
    
    # 이메일 설정
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    
    class Config:
        # .env 파일이 있으면 읽고, 없으면 환경변수에서 읽음
        # 도커 환경에서는 환경변수가 우선순위가 높음
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        # 환경변수가 빈 문자열이어도 None으로 처리하지 않도록
        env_ignore_empty = False


@lru_cache()
def get_settings() -> Settings:
    """
    설정 인스턴스를 캐싱하여 반환합니다.
    매번 .env 파일을 읽지 않아서 효율적입니다.
    """
    return Settings()


settings = get_settings()
