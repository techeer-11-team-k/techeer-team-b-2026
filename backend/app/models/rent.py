"""
전월세 거래 정보 모델

테이블명: rents
아파트 전월세 거래 내역을 저장합니다.
"""
from datetime import date, datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Integer, Date, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Rent(Base):
    """
    전월세 거래 정보 테이블
    
    아파트 전월세 거래 내역을 저장합니다.
    
    컬럼:
        - trans_id: 고유 번호 (자동 생성, PK)
        - apt_id: 아파트 ID (FK)
        - build_year: 건축년도
        - contract_type: 계약 유형 (신규 or 갱신)
        - deposit_price: 보증금
        - monthly_rent: 월세
        - exclusive_area: 전용면적 (㎡)
        - floor: 층
        - apt_seq: 아파트 일련번호
        - deal_date: 거래일
        - contract_date: 계약일
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "rents"
    
    # 기본키 (Primary Key)
    trans_id: Mapped[int] = mapped_column(
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
    
    # 건축년도
    build_year: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="건축년도"
    )
    
    # 계약 유형 (신규 or 갱신)
    contract_type: Mapped[Optional[bool]] = mapped_column(
        Boolean,
        nullable=True,
        comment="신규 or 갱신"
    )
    
    # 보증금
    deposit_price: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="보증금"
    )
    
    # 월세
    monthly_rent: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="월세"
    )

    # 전월세 구분 (JEONSE, MONTHLY_RENT)
    rent_type: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="전월세 구분 (JEONSE, MONTHLY_RENT)"
    )
    
    # 전용면적 (㎡)
    exclusive_area: Mapped[float] = mapped_column(
        Numeric(7, 2),
        nullable=False,
        comment="전용면적 (㎡)"
    )
    
    # 층
    floor: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="층"
    )
    
    # 아파트 일련번호
    apt_seq: Mapped[Optional[str]] = mapped_column(
        String(10),
        nullable=True,
        comment="아파트 일련번호"
    )
    
    # 거래일
    deal_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="거래일"
    )
    
    # 계약일
    contract_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="계약일"
    )
    
    # 비고 (아파트 이름 등 참고용)
    remarks: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="비고"
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
    is_deleted: Mapped[Optional[bool]] = mapped_column(
        Boolean,
        nullable=True,
        comment="소프트 삭제"
    )
    
    # ===== 관계 (Relationships) =====
    # 이 거래가 속한 아파트
    apartment = relationship("Apartment", back_populates="rents")
    
    def __repr__(self):
        return f"<Rent(trans_id={self.trans_id}, apt_id={self.apt_id}, deposit_price={self.deposit_price}, monthly_rent={self.monthly_rent})>"
