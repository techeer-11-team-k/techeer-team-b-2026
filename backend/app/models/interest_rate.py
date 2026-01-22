"""
금리 지표 모델

테이블명: interest_rates
금리 지표 정보를 저장합니다.
"""
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Numeric, Date, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InterestRate(Base):
    """
    금리 지표 테이블
    
    각종 금리 정보를 저장합니다.
    
    컬럼:
        - rate_id: 고유 번호 (자동 생성, PK)
        - rate_type: 금리 유형 (기준금리, 주담대(고정), 주담대(변동), 전세대출)
        - rate_value: 금리 값 (%)
        - change_value: 전월 대비 변동폭 (%)
        - trend: 추세 (up, down, stable)
        - base_date: 기준일
        - description: 설명
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "interest_rates"
    
    # 기본키 (Primary Key)
    rate_id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
        comment="PK"
    )
    
    # 금리 유형
    rate_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        unique=True,
        comment="금리 유형 (base_rate, mortgage_fixed, mortgage_variable, jeonse_loan)"
    )
    
    # 금리 유형 표시명
    rate_label: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="표시명 (기준금리, 주담대(고정), 주담대(변동), 전세대출)"
    )
    
    # 금리 값
    rate_value: Mapped[float] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        comment="금리 값 (%)"
    )
    
    # 전월 대비 변동폭
    change_value: Mapped[float] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        default=0.0,
        comment="전월 대비 변동폭 (%)"
    )
    
    # 추세
    trend: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="stable",
        comment="추세 (up, down, stable)"
    )
    
    # 기준일
    base_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="기준일"
    )
    
    # 설명
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="설명"
    )
    
    # 생성일
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        default=datetime.utcnow,
        comment="레코드 생성 일시"
    )
    
    # 수정일
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
    
    def __repr__(self):
        return f"<InterestRate(rate_id={self.rate_id}, rate_type='{self.rate_type}', rate_value={self.rate_value})>"
