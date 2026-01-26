"""
아파트 기본 정보 모델

테이블명: apartments
아파트 단지의 기본 정보를 저장합니다.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Apartment(Base):
    """
    아파트 기본 정보 테이블
    
    아파트 단지의 기본 정보를 저장합니다.
    
    컬럼:
        - apt_id: 고유 번호 (자동 생성, PK)
        - region_id: 지역 ID (FK)
        - apt_name: 아파트 단지명
        - kapt_code: 국토부 단지코드
        - is_available: 거래 가능 여부 (Default=0, 거래 내역 있으면 1)
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "apartments"
    
    # 기본키 (Primary Key)
    apt_id: Mapped[int] = mapped_column(
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
    
    # 아파트 단지명
    apt_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,  # 인덱스 추가 (검색 속도 향상)
        comment="아파트 단지명"
    )
    
    # 국토부 단지코드
    kapt_code: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,  # 인덱스 추가 (중복 체크 성능 향상)
        comment="국토부 단지코드"
    )
    
    # 거래 가능 여부
    is_available: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Default=0, 거래 내역 있으면 1"
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
    # 이 아파트가 속한 지역
    region = relationship("State", back_populates="apartments")
    
    # 이 아파트의 상세 정보 (1대1 관계)
    apart_detail = relationship("ApartDetail", back_populates="apartment", uselist=False)
    
    # 이 아파트의 매매 거래 내역들
    sales = relationship("Sale", back_populates="apartment")
    
    # 이 아파트의 전월세 거래 내역들
    rents = relationship("Rent", back_populates="apartment")
    
    # 이 아파트를 즐겨찾기한 사용자들
    favorite_apartments = relationship("FavoriteApartment", back_populates="apartment")
    
    # 이 아파트를 소유한 사용자들
    my_properties = relationship("MyProperty", back_populates="apartment")
    
    # 이 아파트를 최근에 본 사용자들
    recent_views = relationship("RecentView", back_populates="apartment")
    
    # 이 아파트의 자산 활동 로그들
    asset_activity_logs = relationship("AssetActivityLog", back_populates="apartment")
    
    def __repr__(self):
        return f"<Apartment(apt_id={self.apt_id}, apt_name='{self.apt_name}', kapt_code='{self.kapt_code}')>"
