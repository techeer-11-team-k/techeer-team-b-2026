"""
사용자 계정 모델

테이블명: accounts
Clerk 인증을 사용하므로 password 필드는 없습니다.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Account(Base):
    """
    사용자 계정 테이블
    
    Clerk 인증을 사용하므로:
    - password 필드 없음 (Clerk가 인증 처리)
    - clerk_user_id: Clerk의 사용자 ID (유니크, 인덱스)
    - email: Clerk에서 동기화된 이메일
    
    컬럼:
        - account_id: 고유 번호 (자동 생성)
        - clerk_user_id: Clerk 사용자 ID (유니크, 인덱스)
        - email: 이메일 (Clerk에서 동기화)
        - nickname: 닉네임
        - profile_image_url: 프로필 이미지 URL
        - last_login_at: 마지막 로그인 시간
        - created_at: 가입일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "accounts"
    
    # 기본키 (Primary Key)
    account_id: Mapped[int] = mapped_column(
        Integer, 
        primary_key=True, 
        autoincrement=True,
        comment="PK"
    )
    
    # Clerk 사용자 ID
    # Clerk에서 사용자를 식별하는 고유 ID
    clerk_user_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Clerk 사용자 ID"
    )
    
    # 이메일 (Clerk에서 동기화, 캐시 저장용)
    email: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="캐시 저장용"
    )
    
    # 관리자 여부
    is_admin: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="관리자 여부"
    )
    
    # 가입일
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="레코드 생성 일시"
    )
    
    # 수정일
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="레코드 수정 일시"
    )
    
    # 소프트 삭제 여부
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="소프트 삭제"
    )
    
    # 다크모드 활성화 여부
    is_dark_mode: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="다크모드 활성화 여부"
    )

    # 대시보드 하단 우측 카드 선택(개인화)
    dashboard_bottom_panel_view: Mapped[str] = mapped_column(
        String(32),
        default="regionComparison",
        nullable=False,
        comment="대시보드 하단 우측 카드 뷰 (policyNews|transactionVolume|marketPhase|regionComparison)"
    )
    
    # ===== 관계 (Relationships) =====
    # 이 사용자의 관심 아파트들
    favorite_apartments = relationship(
        "FavoriteApartment",
        back_populates="account"
    )
    
    # 이 사용자의 관심 지역들
    favorite_locations = relationship(
        "FavoriteLocation",
        back_populates="account"
    )
    
    # 이 사용자의 내 집들
    my_properties = relationship(
        "MyProperty",
        back_populates="account"
    )
    
    # 이 사용자의 최근 검색어들
    recent_searches = relationship(
        "RecentSearch",
        back_populates="account"
    )
    
    # 이 사용자의 최근 본 아파트들
    recent_views = relationship(
        "RecentView",
        back_populates="account"
    )
    
    def __repr__(self):
        return f"<Account(account_id={self.account_id}, email='{self.email}', clerk_user_id='{self.clerk_user_id}')>"
