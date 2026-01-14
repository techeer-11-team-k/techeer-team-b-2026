"""
즐겨찾기 모델

테이블명: favorite_locations, favorite_apartments
사용자의 즐겨찾기 지역 및 아파트를 저장합니다.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class FavoriteLocation(Base):
    """
    즐겨찾기 지역 테이블
    
    사용자가 즐겨찾기한 지역을 저장합니다.
    
    컬럼:
        - favorite_id: 고유 번호 (자동 생성, PK)
        - account_id: 계정 ID (FK)
        - region_id: 지역 ID (FK)
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "favorite_locations"
    
    # 기본키 (Primary Key)
    favorite_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="PK"
    )
    
    # 계정 ID (외래키)
    account_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("accounts.account_id"),
        nullable=False,
        comment="FK"
    )
    
    # 지역 ID (외래키)
    region_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("states.region_id"),
        nullable=False,
        comment="FK"
    )
    
    # 생성일
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
    
    # ===== 관계 (Relationships) =====
    # 이 즐겨찾기가 속한 계정
    account = relationship("Account", back_populates="favorite_locations")
    
    # 이 즐겨찾기가 속한 지역
    region = relationship("State", back_populates="favorite_locations")
    
    def __repr__(self):
        return f"<FavoriteLocation(favorite_id={self.favorite_id}, account_id={self.account_id}, region_id={self.region_id})>"


class FavoriteApartment(Base):
    """
    즐겨찾기 아파트 테이블
    
    사용자가 즐겨찾기한 아파트를 저장합니다.
    
    컬럼:
        - favorite_id: 고유 번호 (자동 생성, PK)
        - apt_id: 아파트 ID (FK)
        - account_id: 계정 ID (FK, nullable)
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "favorite_apartments"
    
    # 기본키 (Primary Key)
    favorite_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="PK"
    )
    
    # 아파트 ID (외래키)
    apt_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("apartments.apt_id"),
        nullable=False,
        comment="FK"
    )
    
    # 계정 ID (외래키, nullable)
    account_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("accounts.account_id"),
        nullable=True,
        comment="FK"
    )
    
    # 별칭 (사용자가 설정한 집 이름)
    nickname: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        comment="별칭 (예: 우리집, 투자용)"
    )
    
    # 메모
    memo: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="메모"
    )
    
    # 생성일
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
    
    # ===== 관계 (Relationships) =====
    # 이 즐겨찾기가 속한 아파트
    apartment = relationship("Apartment", back_populates="favorite_apartments")
    
    # 이 즐겨찾기가 속한 계정
    account = relationship("Account", back_populates="favorite_apartments")
    
    def __repr__(self):
        return f"<FavoriteApartment(favorite_id={self.favorite_id}, apt_id={self.apt_id}, account_id={self.account_id})>"
