"""
매매 거래 정보 모델

테이블명: sales
아파트 매매 거래 내역을 저장합니다.
"""
from datetime import date, datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Integer, Date, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Sale(Base):
    """
    매매 거래 정보 테이블
    
    아파트 매매 거래 내역을 저장합니다.
    
    컬럼:
        - trans_id: 고유 번호 (자동 생성, PK)
        - apt_id: 아파트 ID (FK)
        - build_year: 건축년도
        - trans_type: 거래 유형
        - trans_price: 거래가격
        - exclusive_area: 전용면적 (㎡)
        - floor: 층
        - building_num: 건물번호
        - contract_date: 계약일
        - is_canceled: 취소 여부
        - cancel_date: 취소일
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "sales"
    
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
        index=True,  # 인덱스 추가 (검색 속도 향상)
        comment="FK"
    )
    
    # 건축년도
    build_year: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="건축년도"
    )
    
    # 거래 유형
    trans_type: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        comment="거래 유형"
    )
    
    # 거래가격
    trans_price: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="거래가격"
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
    
    # 건물번호
    building_num: Mapped[Optional[str]] = mapped_column(
        String(10),
        nullable=True,
        comment="건물번호"
    )
    
    # 계약일
    contract_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        index=True,  # 인덱스 추가 (검색 속도 향상)
        comment="계약일"
    )
    
    # 취소 여부
    is_canceled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        comment="취소 여부"
    )
    
    # 취소일
    cancel_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="취소일"
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
    apartment = relationship("Apartment", back_populates="sales")
    
    def __repr__(self):
        return f"<Sale(trans_id={self.trans_id}, apt_id={self.apt_id}, trans_price={self.trans_price})>"
