"""
최근 본 아파트 모델

테이블명: recent_views
사용자가 최근에 본 아파트를 저장합니다.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RecentView(Base):
    """
    최근 본 아파트 테이블
    
    사용자가 최근에 본 아파트를 저장합니다.
    
    컬럼:
        - view_id: 고유 번호 (자동 생성, PK)
        - account_id: 계정 ID (FK)
        - apt_id: 아파트 ID (FK)
        - viewed_at: 조회일시
        - created_at: 생성일시
        - updated_at: 수정일시
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "recent_views"
    
    # 기본키 (Primary Key)
    view_id: Mapped[int] = mapped_column(
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
    
    # 아파트 ID (외래키)
    apt_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("apartments.apt_id"),
        nullable=False,
        comment="FK"
    )
    
    # 조회일시
    viewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        default=datetime.utcnow,
        comment="조회 일시"
    )
    
    # 생성일시
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        default=datetime.utcnow,
        comment="레코드 생성 일시"
    )
    
    # 수정일시
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
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
    # 이 조회가 속한 계정
    account = relationship("Account", back_populates="recent_views")
    
    # 이 조회가 속한 아파트
    apartment = relationship("Apartment", back_populates="recent_views")
    
    def __repr__(self):
        return f"<RecentView(view_id={self.view_id}, account_id={self.account_id}, apt_id={self.apt_id}, viewed_at='{self.viewed_at}')>"
