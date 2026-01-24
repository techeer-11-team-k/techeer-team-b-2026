"""
인구 이동 모델

테이블명: population_movements
지역 간 인구 이동 매트릭스 데이터를 저장합니다 (출발지 → 도착지, KOSIS 통계청 데이터).
Sankey Diagram 표시에 사용됩니다.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Integer, CHAR, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PopulationMovement(Base):
    """
    인구 이동 테이블 (출발지 → 도착지 매트릭스)
    
    지역 간 인구 이동 매트릭스 데이터를 저장합니다 (KOSIS 통계청 데이터).
    Sankey Diagram 표시에 사용됩니다.
    
    컬럼:
        - movement_id: 고유 번호 (자동 생성, PK)
        - base_ym: 기준 년월 (YYYYMM)
        - from_region_id: 출발 지역 ID (FK)
        - to_region_id: 도착 지역 ID (FK)
        - movement_count: 이동 인구 수 (명)
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "population_movements"
    
    # 기본키 (Primary Key)
    movement_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="PK"
    )
    
    # 기준 년월 (YYYYMM)
    base_ym: Mapped[str] = mapped_column(
        CHAR(6),
        nullable=False,
        comment="기준 년월 (YYYYMM)"
    )
    
    # 출발 지역 ID (외래키)
    from_region_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("states.region_id"),
        nullable=False,
        comment="출발 지역 ID (FK)"
    )
    
    # 도착 지역 ID (외래키)
    to_region_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("states.region_id"),
        nullable=False,
        comment="도착 지역 ID (FK)"
    )
    
    # 이동 인구 수
    movement_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="이동 인구 수 (명)"
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
    # 출발 지역
    from_region = relationship(
        "State",
        foreign_keys=[from_region_id],
        back_populates="population_movements_from"
    )
    
    # 도착 지역
    to_region = relationship(
        "State",
        foreign_keys=[to_region_id],
        back_populates="population_movements_to"
    )
    
    # ===== 인덱스 및 제약조건 =====
    __table_args__ = (
        Index("idx_population_movements_ym_from_to", "base_ym", "from_region_id", "to_region_id"),
        Index("idx_population_movements_base_ym", "base_ym"),
        Index("idx_population_movements_from_region", "from_region_id"),
        Index("idx_population_movements_to_region", "to_region_id"),
        UniqueConstraint("base_ym", "from_region_id", "to_region_id", name="uk_population_movements_ym_from_to"),
    )
    
    def __repr__(self):
        return f"<PopulationMovement(movement_id={self.movement_id}, base_ym='{self.base_ym}', from_region_id={self.from_region_id}, to_region_id={self.to_region_id}, movement_count={self.movement_count})>"
