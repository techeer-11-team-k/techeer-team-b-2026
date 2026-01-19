"""
부동산 거래량 모델

테이블명: house_volumes
지역별 부동산 거래량을 저장합니다.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, Boolean, Integer, CHAR, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class HouseVolume(Base):
    """
    부동산 거래량 테이블
    
    지역별 부동산 거래량을 저장합니다.
    
    컬럼:
        - volume_id: 고유 번호 (자동 생성, PK)
        - region_id: 지역 ID (FK)
        - base_ym: 기준 년월 (YYYYMM)
        - volume_value: 거래량 값
        - volume_area: 거래 면적
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "house_volumes"
    
    # 기본키 (Primary Key)
    volume_id: Mapped[int] = mapped_column(
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
    
    # 거래량 값
    volume_value: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="거래량 값"
    )
    
    # 거래 면적
    volume_area: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
        comment="거래 면적"
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
    # 이 거래량이 속한 지역
    region = relationship("State", back_populates="house_volumes")
    
    def __repr__(self):
        return f"<HouseVolume(volume_id={self.volume_id}, region_id={self.region_id}, base_ym='{self.base_ym}', volume_value={self.volume_value})>"