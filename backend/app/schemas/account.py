"""
사용자 계정 관련 스키마

Clerk 인증을 사용하므로:
- 회원가입/로그인은 Clerk에서 처리 (백엔드 API 불필요)
- 웹훅을 통한 사용자 동기화
- 프로필 조회/수정만 백엔드에서 처리
"""
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional


# ============ 요청(Request) 스키마 ============

class AccountUpdate(BaseModel):
    """프로필 수정 요청 스키마"""
    nickname: Optional[str] = Field(
        None,
        min_length=2,
        max_length=20,
        description="닉네임 (2~20자)"
    )
    profile_image_url: Optional[str] = Field(
        None,
        max_length=500,
        description="프로필 이미지 URL"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "nickname": "홍길동",
                "profile_image_url": "https://example.com/profile.jpg"
            }
        }


class ClerkEmailAddress(BaseModel):
    """Clerk 이메일 주소"""
    email_address: str
    id: str


class ClerkWebhookUser(BaseModel):
    """Clerk 웹훅에서 받는 사용자 정보"""
    id: str = Field(..., description="Clerk 사용자 ID")
    email_addresses: list[ClerkEmailAddress] = Field(..., description="이메일 주소 목록")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    image_url: Optional[str] = None
    username: Optional[str] = None


class ClerkWebhookEvent(BaseModel):
    """Clerk 웹훅 이벤트"""
    type: str = Field(..., description="이벤트 타입 (user.created, user.updated, user.deleted)")
    data: ClerkWebhookUser = Field(..., description="사용자 데이터")


# ============ 응답(Response) 스키마 ============

class AccountBase(BaseModel):
    """사용자 기본 정보"""
    account_id: int = Field(..., description="계정 ID")
    clerk_user_id: str = Field(..., description="Clerk 사용자 ID")
    email: EmailStr = Field(..., description="이메일")
    nickname: str = Field(..., description="닉네임")
    profile_image_url: Optional[str] = Field(None, description="프로필 이미지 URL")
    last_login_at: Optional[datetime] = Field(None, description="마지막 로그인 시간")
    created_at: datetime = Field(..., description="가입일")
    
    class Config:
        from_attributes = True  # SQLAlchemy 모델에서 변환 가능
        json_schema_extra = {
            "example": {
                "account_id": 1,
                "clerk_user_id": "user_2abc123def456",
                "email": "user@example.com",
                "nickname": "홍길동",
                "profile_image_url": "https://example.com/profile.jpg",
                "last_login_at": "2026-01-11T12:00:00Z",
                "created_at": "2026-01-01T00:00:00Z"
            }
        }


class AccountResponse(BaseModel):
    """API 응답용 사용자 정보"""
    success: bool = True
    data: AccountBase


class AccountListResponse(BaseModel):
    """사용자 목록 응답"""
    success: bool = True
    data: list[AccountBase]
    meta: Optional[dict] = None
