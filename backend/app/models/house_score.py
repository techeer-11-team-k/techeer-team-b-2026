"""
부동산 지수 모델

테이블명: house_scores
지역별 부동산 가격 지수를 저장합니다.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Integer, CHAR, ForeignKey, Numeric, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class HouseScore(Base):
    """
    부동산 지수 테이블
    
    지역별 부동산 가격 지수를 저장합니다.
    
    컬럼:
        - index_id: 고유 번호 (자동 생성, PK)
        - region_id: 지역 ID (FK)
        - base_ym: 기준 년월 (YYYYMM)
        - index_value: 지수 값 (2017.11=100 기준)
        - index_change_rate: 지수 변동률
        - index_type: 지수 유형 (APT=아파트, HOUSE=단독주택, ALL=전체)
        - data_source: 데이터 출처
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "house_scores"
    
    # 기본키 (Primary Key)
    index_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="PK"
    )
    
    # 지역 ID (외래키)
    region_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("states.region_id"),
        nullable=False,
        comment="FK"
    )
    
    # 기준 년월 (YYYYMM)
    base_ym: Mapped[str] = mapped_column(
        CHAR(6),
        nullable=False,
        comment="해당 하는 달"
    )
    
    # 지수 값 (2017.11=100 기준)
    index_value: Mapped[float] = mapped_column(
        Numeric(8, 2),
        nullable=False,
        comment="2017.11=100 기준"
    )
    
    # 지수 변동률
    index_change_rate: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
        comment="지수 변동률"
    )
    
    # 지수 유형
    index_type: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="APT",
        comment="APT=아파트, HOUSE=단독주택, ALL=전체"
    )
    
    # 데이터 출처
    data_source: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="KB부동산",
        comment="데이터 출처"
    )
    
    # 생성일 (자동 생성)
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
    # 이 지수가 속한 지역
    region = relationship("State", back_populates="house_scores")
    
    # ===== 제약 조건 =====
    __table_args__ = (
        CheckConstraint("index_type IN ('APT', 'HOUSE', 'ALL')", name="chk_index_type"),
    )
    
    def __repr__(self):
        return f"<HouseScore(index_id={self.index_id}, region_id={self.region_id}, base_ym='{self.base_ym}', index_value={self.index_value})>"
