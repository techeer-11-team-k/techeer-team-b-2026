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
    
    # Clerk 사용자 ID (유니크, 인덱스)
    # Clerk에서 사용자를 식별하는 고유 ID
    clerk_user_id: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
        comment="Clerk 사용자 ID"
    )
    
    # 이메일 (Clerk에서 동기화, 유니크)
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
        comment="로그인 ID, UNIQUE"
    )
    
    # 닉네임
    nickname: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="사용자 닉네임"
    )
    
    # 프로필 이미지 URL
    profile_image_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="프로필 이미지 URL"
    )
    
    # 마지막 로그인 시간
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="마지막 로그인 시간"
    )
    
    # 가입일 (자동 생성)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="레코드 생성 일시"
    )
    
    # 수정일 (자동 업데이트)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        comment="레코드 수정 일시"
    )
    
    # 소프트 삭제 여부
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="소프트 삭제"
    )
    
    # ===== 관계 (Relationships) =====
    # 아직 정의되지 않은 모델들은 주석 처리
    # 해당 모델 구현 후 주석 해제하세요
    
    # 이 사용자의 관심 아파트들
    # favorite_apartments = relationship(
    #     "FavoriteApartment",
    #     back_populates="account"
    # )
    
    # 이 사용자의 관심 지역들
    # favorite_locations = relationship(
    #     "FavoriteLocation",
    #     back_populates="account"
    # )
    
    # 이 사용자의 내 집들
    # my_properties = relationship(
    #     "MyProperty",
    #     back_populates="account"
    # )
    
    def __repr__(self):
        return f"<Account(account_id={self.account_id}, email='{self.email}', clerk_user_id='{self.clerk_user_id}')>"
