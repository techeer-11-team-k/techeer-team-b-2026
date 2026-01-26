"""
자산 활동 내역 로그 모델

테이블명: asset_activity_logs
사용자의 아파트 추가/삭제 및 가격 변동 이력을 기록합니다.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Integer, ForeignKey, Text, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AssetActivityLog(Base):
    """
    자산 활동 내역 로그 테이블
    
    사용자의 아파트 관련 활동을 시간순으로 기록합니다.
    
    컬럼:
        - id: 고유 번호 (자동 생성, PK)
        - account_id: 계정 ID (FK)
        - apt_id: 아파트 ID (FK, nullable - 관심 목록은 아파트 없을 수도)
        - category: 카테고리 (MY_ASSET 또는 INTEREST)
        - event_type: 이벤트 타입 (ADD, DELETE, PRICE_UP, PRICE_DOWN)
        - price_change: 가격 변동액 (만원 단위)
        - previous_price: 변동 전 가격 (만원 단위)
        - current_price: 변동 후 가격 (만원 단위)
        - created_at: 생성일
        - meta_data: 추가 정보 (JSON 문자열, DB 컬럼명: metadata)
    """
    __tablename__ = "asset_activity_logs"
    
    # 기본키 (Primary Key)
    id: Mapped[int] = mapped_column(
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
        comment="FK - accounts.account_id"
    )
    
    # 아파트 ID (외래키, nullable - 관심 목록은 아파트 없을 수도)
    apt_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("apartments.apt_id"),
        nullable=True,
        comment="FK - apartments.apt_id"
    )
    
    # 카테고리
    category: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="카테고리 (MY_ASSET: 내 아파트, INTEREST: 관심 목록)"
    )
    
    # 이벤트 타입
    event_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="이벤트 타입 (ADD, DELETE, PRICE_UP, PRICE_DOWN)"
    )
    
    # 가격 변동액 (만원 단위)
    price_change: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="가격 변동액 (만원 단위)"
    )
    
    # 변동 전 가격 (만원 단위)
    previous_price: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="변동 전 가격 (만원 단위)"
    )
    
    # 변동 후 가격 (만원 단위)
    current_price: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="변동 후 가격 (만원 단위)"
    )
    
    # 생성일
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        comment="레코드 생성 일시"
    )
    
    # 추가 정보 (JSON 문자열)
    # 주의: SQLAlchemy에서 'metadata'는 예약어이므로 필드명은 'meta_data'로 하고 컬럼명은 'metadata'로 지정
    meta_data: Mapped[Optional[str]] = mapped_column(
        Text,
        name="metadata",  # 데이터베이스 컬럼명은 'metadata'로 유지
        nullable=True,
        comment="추가 정보 (JSON 문자열)"
    )
    
    # 제약 조건
    __table_args__ = (
        CheckConstraint(
            "category IN ('MY_ASSET', 'INTEREST')",
            name="check_category"
        ),
        CheckConstraint(
            "event_type IN ('ADD', 'DELETE', 'PRICE_UP', 'PRICE_DOWN')",
            name="check_event_type"
        ),
    )
    
    # ===== 관계 (Relationships) =====
    # 이 로그를 생성한 계정
    account = relationship("Account", back_populates="asset_activity_logs")
    
    # 이 로그가 관련된 아파트
    apartment = relationship("Apartment", back_populates="asset_activity_logs")
    
    def __repr__(self):
        return f"<AssetActivityLog(id={self.id}, account_id={self.account_id}, apt_id={self.apt_id}, category='{self.category}', event_type='{self.event_type}')>"
