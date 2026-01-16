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
    email: Optional[str] = Field(
        None,
        max_length=255,
        description="이메일 (캐시 저장용)"
    )
    is_admin: Optional[str] = Field(
        None,
        max_length=255,
        description="관리자 여부"
    )
    is_dark_mode: Optional[bool] = Field(
        None,
        description="다크모드 활성화 여부"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "is_admin": "Y",
                "is_dark_mode": True
            }
        }


class DarkModeUpdate(BaseModel):
    """다크모드 설정 변경 요청 스키마"""
    is_dark_mode: bool = Field(
        ...,
        description="다크모드 활성화 여부"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "is_dark_mode": True
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
    clerk_user_id: Optional[str] = Field(None, description="Clerk 사용자 ID")
    email: Optional[str] = Field(None, description="이메일 (캐시 저장용)")
    is_admin: Optional[str] = Field(None, description="관리자 여부")
    is_dark_mode: bool = Field(True, description="다크모드 활성화 여부")
    created_at: Optional[datetime] = Field(None, description="가입일")
    updated_at: Optional[datetime] = Field(None, description="수정일")
    is_deleted: bool = Field(False, description="삭제 여부")
    
    class Config:
        from_attributes = True  # SQLAlchemy 모델에서 변환 가능
        json_schema_extra = {
            "example": {
                "account_id": 1,
                "clerk_user_id": "user_2abc123def456",
                "email": "user@example.com",
                "is_admin": "Y",
                "is_dark_mode": True,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "is_deleted": False
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
