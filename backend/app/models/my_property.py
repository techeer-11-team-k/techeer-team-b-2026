"""
내 부동산 모델

테이블명: my_properties
사용자가 소유한 부동산 정보를 저장합니다.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Integer, ForeignKey, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MyProperty(Base):
    """
    내 부동산 테이블
    
    사용자가 소유한 부동산 정보를 저장합니다.
    
    컬럼:
        - property_id: 고유 번호 (자동 생성, PK)
        - account_id: 계정 ID (FK)
        - apt_id: 아파트 ID (FK)
        - nickname: 별칭 (예: 우리집, 투자용)
        - exclusive_area: 전용면적 (㎡)
        - current_market_price: 현재 시세 (만원)
        - risk_checked_at: 리스크 체크 일시
        - memo: 메모
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "my_properties"
    
    # 기본키 (Primary Key)
    property_id: Mapped[int] = mapped_column(
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
    
    # 별칭
    nickname: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="예: 우리집, 투자용"
    )
    
    # 전용면적 (㎡)
    exclusive_area: Mapped[float] = mapped_column(
        Numeric(6, 2),
        nullable=False,
        comment="전용면적 (㎡)"
    )
    
    # 현재 시세 (만원)
    current_market_price: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="단위 : 만원"
    )
    
    # 구매가 (만원)
    purchase_price: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="구매가 (만원)"
    )
    
    # 대출 금액 (만원)
    loan_amount: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="대출 금액 (만원)"
    )
    
    # 매입일
    purchase_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="매입일"
    )
    
    # 리스크 체크 일시
    risk_checked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="리스크 체크 일시"
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
    # 이 부동산을 소유한 계정
    account = relationship("Account", back_populates="my_properties")
    
    # 이 부동산이 속한 아파트
    apartment = relationship("Apartment", back_populates="my_properties")
    
    def __repr__(self):
        return f"<MyProperty(property_id={self.property_id}, account_id={self.account_id}, apt_id={self.apt_id}, nickname='{self.nickname}')>"
