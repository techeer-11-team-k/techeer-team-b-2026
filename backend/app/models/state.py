"""
지역 정보 모델

테이블명: states
시군구 정보를 저장합니다.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Integer, CHAR
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from app.db.base import Base


class State(Base):
    """
    지역 정보 테이블
    
    국토교통부 표준지역코드 API에서 가져온 시군구 정보를 저장합니다.
    
    컬럼:
        - region_id: 고유 번호 (자동 생성, PK)
        - region_name: 시군구명 (예: 강남구, 해운대구)
        - region_code: 시도코드 2자리 + 시군구 3자리 + 동코드 5자리
        - city_name: 시도명 (예: 서울특별시, 부산광역시)
        - geometry: 위치 정보 (PostGIS Point)
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "states"
    
    # 기본키 (Primary Key)
    region_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="PK"
    )
    
    # 시군구명
    region_name: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,  # 인덱스 추가 (검색 속도 향상)
        comment="시군구명 (예: 강남구, 해운대구)"
    )
    
    # 지역코드 (시도코드 2자리 + 시군구 3자리 + 동코드 5자리)
    region_code: Mapped[str] = mapped_column(
        CHAR(10),
        nullable=False,
        index=True,
        comment="시도코드 2자리 + 시군구 3자리 + 동코드 5자리"
    )
    
    # 시도명
    city_name: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        comment="시도명 (예: 서울특별시, 부산광역시)"
    )

    # 위치 정보 (PostGIS Point)
    geometry: Mapped[Optional[str]] = mapped_column(
        Geometry(geometry_type='POINT', srid=4326),
        nullable=True,
        comment="위치 정보 (PostGIS) - 중심점"
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
        comment="삭제 여부 (소프트 삭제)"
    )
    
    # ===== 관계 (Relationships) =====
    # 이 지역에 속한 아파트들
    apartments = relationship("Apartment", back_populates="region")
    
    # 이 지역의 부동산 지수들
    house_scores = relationship("HouseScore", back_populates="region")
    
    # 이 지역의 부동산 거래량들
    house_volumes = relationship("HouseVolume", back_populates="region")
    
    # 이 지역을 즐겨찾기한 사용자들
    favorite_locations = relationship("FavoriteLocation", back_populates="region")
    
    # 이 지역을 출발지로 하는 인구 이동 데이터들
    population_movements_from = relationship(
        "PopulationMovement",
        foreign_keys="PopulationMovement.from_region_id",
        back_populates="from_region"
    )
    
    # 이 지역을 도착지로 하는 인구 이동 데이터들
    population_movements_to = relationship(
        "PopulationMovement",
        foreign_keys="PopulationMovement.to_region_id",
        back_populates="to_region"
    )
    
    def __repr__(self):
        return f"<State(region_id={self.region_id}, region_name='{self.region_name}', city_name='{self.city_name}')>"
