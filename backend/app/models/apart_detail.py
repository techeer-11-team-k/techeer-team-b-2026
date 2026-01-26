"""
아파트 상세 정보 모델

테이블명: apart_details
아파트 단지의 상세 정보를 저장합니다.
"""
from datetime import date, datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean, Integer, Date, ForeignKey, CHAR, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from app.db.base import Base


class ApartDetail(Base):
    """
    아파트 상세 정보 테이블
    
    아파트 단지의 상세 정보(주소, 건물 정보, 위치 등)를 저장합니다.
    
    컬럼:
        - apt_detail_id: 고유 번호 (자동 생성, PK)
        - apt_id: 아파트 ID (FK)
        - road_address: 도로명주소
        - jibun_address: 지번주소
        - zip_code: 우편번호
        - code_sale_nm: 분양/임대 구분
        - code_heat_nm: 난방 방식
        - total_household_cnt: 총 세대수
        - total_building_cnt: 총 동수
        - highest_floor: 최고층
        - use_approval_date: 사용승인일
        - total_parking_cnt: 총 주차대수
        - builder_name: 건설사명
        - developer_name: 시공사명
        - manage_type: 관리 유형
        - hallway_type: 복도 유형
        - subway_time: 지하철 소요시간
        - subway_line: 지하철 노선
        - subway_station: 지하철 역명
        - educationFacility: 교육시설
        - geometry: 위치 정보 (PostGIS Point)
        - created_at: 생성일
        - updated_at: 수정일
        - is_deleted: 소프트 삭제 여부
    """
    __tablename__ = "apart_details"
    
    __table_args__ = (
        # GiST 인덱스: 공간 쿼리 최적화 (ST_Distance, ST_DWithin 등)
        Index("idx_apart_details_geometry", "geometry", postgresql_using="gist"),
    )
    
    # 기본키 (Primary Key)
    apt_detail_id: Mapped[int] = mapped_column(
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
        unique=True,  # 1대1 관계 보장
        comment="FK"
    )
    
    # 도로명주소
    road_address: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        index=True,  # 인덱스 추가 (주소 검색 속도 향상)
        comment="도로명주소"
    )
    
    # 지번주소
    jibun_address: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        index=True,  # 인덱스 추가 (주소 검색 속도 향상)
        comment="구 지번 주소"
    )
    
    # 우편번호
    zip_code: Mapped[Optional[str]] = mapped_column(
        CHAR(5),
        nullable=True,
        comment="우편번호"
    )
    
    # 분양/임대 구분
    code_sale_nm: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="분양/임대 등, 기본정보"
    )
    
    # 난방 방식
    code_heat_nm: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="지역난방/개별난방 등, 기본정보"
    )
    
    # 총 세대수
    total_household_cnt: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="기본정보"
    )
    
    # 총 동수
    total_building_cnt: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="기본정보"
    )
    
    # 최고층
    highest_floor: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="기본정보"
    )
    
    # 사용승인일
    use_approval_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="사용승인일"
    )
    
    # 총 주차대수
    total_parking_cnt: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="지상과 지하 합친 주차대수"
    )
    
    # 건설사명
    builder_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="시공사"
    )
    
    # 시공사명
    developer_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="시행사"
    )
    
    # 관리 유형
    manage_type: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="자치관리/위탁관리 등, 관리방식"
    )
    
    # 복도 유형
    hallway_type: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="계단식/복도식/혼합식 등 복도유형"
    )
    
    # 지하철 소요시간
    subway_time: Mapped[Optional[str]] = mapped_column(
        String(200),
        nullable=True,
        comment="주변 지하철역까지의 도보시간"
    )
    
    # 지하철 노선
    subway_line: Mapped[Optional[str]] = mapped_column(
        String(200),
        nullable=True,
        comment="주변 지하철 호선"
    )
    
    # 지하철 역명
    subway_station: Mapped[Optional[str]] = mapped_column(
        String(200),
        nullable=True,
        comment="주변 지하철역"
    )
    
    # 교육시설
    educationFacility: Mapped[Optional[str]] = mapped_column(
        String(200),
        name="educationfacility",  # PostgreSQL은 소문자로 변환되므로 명시적으로 지정
        nullable=True,
        comment="교육기관"
    )
    
    # 위치 정보 (PostGIS Point)
    geometry: Mapped[Optional[str]] = mapped_column(
        Geometry(geometry_type='POINT', srid=4326),
        nullable=True,
        comment="위치 정보 (PostGIS)"
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
    # 이 상세 정보가 속한 아파트
    apartment = relationship("Apartment", back_populates="apart_detail")
    
    def __repr__(self):
        return f"<ApartDetail(apt_detail_id={self.apt_detail_id}, apt_id={self.apt_id}, road_address='{self.road_address}')>"
