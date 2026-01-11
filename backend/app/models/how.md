# 📁 models/ 폴더 설명

> **이 폴더는 뭘 하는 곳인가요?**  
> **데이터베이스 테이블 구조**를 Python 클래스로 정의하는 곳입니다!

---

## 🎯 한줄 요약

```
models/ = 창고 선반 구조 📦
```

창고(DB)에서 물건(데이터)을 어떤 선반(테이블)에 어떻게 정리할지 정합니다.

---

## 📁 이 폴더에 들어갈 파일들

| 파일명 | 테이블명 | 설명 |
|--------|----------|------|
| `account.py` | ACCOUNTS | 사용자 계정 |
| `apartment.py` | APARTMENTS | 아파트 정보 |
| `transaction.py` | TRANSACTIONS | 실거래 내역 |
| `favorite.py` | FAVORITE_APARTMENTS, FAVORITE_LOCATIONS | 즐겨찾기 |
| `my_property.py` | MY_PROPERTIES | 내 집 |
| `location.py` | STATES (시군구), CITIES (동) | 지역 정보 |
| `house_price.py` | HOUSE_PRICES | 주택가격지수 |
| `recent_search.py` | RECENT_SEARCHES | 최근 검색어 |

---

## 📄 ORM이 뭔가요?

**ORM (Object-Relational Mapping)** = 객체-관계 매핑

| SQL로 하면... | SQLAlchemy ORM으로 하면... |
|---------------|---------------------------|
| `INSERT INTO accounts (email, password) VALUES ('a@b.com', 'hash')` | `db.add(Account(email="a@b.com", password="hash"))` |
| `SELECT * FROM accounts WHERE email = 'a@b.com'` | `select(Account).where(Account.email == "a@b.com")` |

**장점**: SQL 몰라도 Python으로 DB 조작 가능!

---

## 📄 account.py 예시 (사용자 모델)

```python
"""
사용자 계정 모델

테이블명: accounts
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Account(Base):
    """
    사용자 계정 테이블
    
    컬럼:
        - id: 고유 번호 (자동 생성)
        - email: 이메일 (로그인용)
        - password: 해시된 비밀번호
        - nickname: 닉네임
        - created_at: 가입일
        - is_active: 활성 상태
    """
    __tablename__ = "accounts"
    
    # 기본키 (Primary Key)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # 이메일 (유니크, 인덱스)
    email: Mapped[str] = mapped_column(
        String(255), 
        unique=True, 
        index=True,
        nullable=False
    )
    
    # 해시된 비밀번호
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # 닉네임
    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # 가입일 (자동 생성)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow,
        nullable=False
    )
    
    # 마지막 로그인
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # 활성 상태
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # ===== 관계 (Relationships) =====
    # 이 사용자의 관심 아파트들
    favorite_apartments = relationship("FavoriteApartment", back_populates="account")
    
    # 이 사용자의 내 집들
    my_properties = relationship("MyProperty", back_populates="account")
    
    def __repr__(self):
        return f"<Account(id={self.id}, email='{self.email}')>"
```

---

## 📄 apartment.py 예시 (아파트 모델)

```python
"""
아파트 모델

테이블명: apartments
PostGIS 공간 데이터를 사용합니다.
"""
from datetime import date
from typing import Optional
from sqlalchemy import String, Integer, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from app.db.base import Base


class Apartment(Base):
    """
    아파트 테이블
    
    국토교통부 아파트 기본정보 API 데이터를 저장합니다.
    """
    __tablename__ = "apartments"
    
    # 기본키
    apt_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # 아파트명
    apt_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    
    # 국토부 단지코드
    kapt_code: Mapped[Optional[str]] = mapped_column(String(50), unique=True)
    
    # 주소
    road_address: Mapped[Optional[str]] = mapped_column(String(300))  # 도로명주소
    jibun_address: Mapped[Optional[str]] = mapped_column(String(300))  # 지번주소
    
    # 동 FK (외래키)
    dong_id: Mapped[int] = mapped_column(ForeignKey("cities.dong_id"), nullable=False)
    
    # 세대수, 동수, 최고층
    total_household_cnt: Mapped[Optional[int]] = mapped_column(Integer)
    total_building_cnt: Mapped[Optional[int]] = mapped_column(Integer)
    highest_floor: Mapped[Optional[int]] = mapped_column(Integer)
    
    # 준공일
    use_approval_date: Mapped[Optional[date]] = mapped_column(Date)
    
    # 주차대수
    total_parking_cnt: Mapped[Optional[int]] = mapped_column(Integer)
    
    # 건설사, 시공사
    builder_name: Mapped[Optional[str]] = mapped_column(String(100))
    developer_name: Mapped[Optional[str]] = mapped_column(String(100))
    
    # 관리유형, 복도유형, 난방방식
    manage_type: Mapped[Optional[str]] = mapped_column(String(50))
    hallway_type: Mapped[Optional[str]] = mapped_column(String(50))
    heating_type: Mapped[Optional[str]] = mapped_column(String(50))
    
    # ⭐ 위치 (PostGIS Point)
    # SRID 4326 = WGS84 좌표계 (GPS 좌표)
    geometry: Mapped[Optional[str]] = mapped_column(
        Geometry(geometry_type='POINT', srid=4326),
        nullable=True
    )
    
    # ===== 관계 (Relationships) =====
    # 이 아파트가 속한 동
    dong = relationship("City", back_populates="apartments")
    
    # 이 아파트의 거래 내역들
    transactions = relationship("Transaction", back_populates="apartment")
    
    def __repr__(self):
        return f"<Apartment(apt_id={self.apt_id}, name='{self.apt_name}')>"
```

---

## 📄 transaction.py 예시 (거래 내역 모델)

```python
"""
실거래 내역 모델

테이블명: transactions
"""
from datetime import date
from typing import Optional
from sqlalchemy import String, Integer, Date, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.base import Base


class TransactionType(str, enum.Enum):
    """거래 유형"""
    SALE = "SALE"          # 매매
    JEONSE = "JEONSE"      # 전세
    MONTHLY = "MONTHLY"    # 월세


class Transaction(Base):
    """
    실거래 내역 테이블
    """
    __tablename__ = "transactions"
    
    # 기본키
    trans_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # 아파트 FK
    apt_id: Mapped[int] = mapped_column(ForeignKey("apartments.apt_id"), nullable=False)
    
    # 시군구 FK (빠른 조회용)
    sigungu_id: Mapped[int] = mapped_column(ForeignKey("states.sigungu_id"), nullable=False)
    
    # 거래 유형 (매매/전세/월세)
    trans_type: Mapped[TransactionType] = mapped_column(
        SQLEnum(TransactionType), 
        nullable=False
    )
    
    # 가격 (만원)
    trans_price: Mapped[Optional[int]] = mapped_column(Integer)       # 매매가
    deposit_price: Mapped[Optional[int]] = mapped_column(Integer)     # 보증금
    monthly_rent: Mapped[Optional[int]] = mapped_column(Integer)      # 월세
    
    # 면적, 층
    exclusive_area: Mapped[Optional[float]] = mapped_column()         # 전용면적 (㎡)
    floor: Mapped[Optional[int]] = mapped_column(Integer)             # 층
    
    # 거래일
    deal_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    
    # 취소 여부
    is_canceled: Mapped[bool] = mapped_column(default=False)
    
    # ===== 관계 (Relationships) =====
    apartment = relationship("Apartment", back_populates="transactions")
    sigungu = relationship("State", back_populates="transactions")
    
    def __repr__(self):
        return f"<Transaction(id={self.trans_id}, type={self.trans_type}, price={self.trans_price})>"
```

---

## 💡 자주 쓰는 컬럼 타입

| Python 타입 | SQLAlchemy | DB 타입 | 예시 |
|-------------|------------|---------|------|
| `int` | `Integer` | INT | 세대수, 가격 |
| `str` | `String(n)` | VARCHAR(n) | 이름, 주소 |
| `bool` | `Boolean` | BOOLEAN | 활성 여부 |
| `float` | `Float` | FLOAT | 면적 |
| `datetime` | `DateTime` | TIMESTAMP | 가입일 |
| `date` | `Date` | DATE | 거래일 |
| `geometry` | `Geometry` | GEOMETRY | 위치 (PostGIS) |

---

## 💡 관계(Relationship) 설정

### 1:N 관계 (하나 대 다수)

```python
# 시군구 1개 : 아파트 N개
class State(Base):  # 시군구
    apartments = relationship("Apartment", back_populates="sigungu")

class Apartment(Base):  # 아파트
    sigungu_id = mapped_column(ForeignKey("states.sigungu_id"))
    sigungu = relationship("State", back_populates="apartments")
```

### 사용 예시

```python
# 아파트에서 시군구 접근
apartment.sigungu.sigungu_name  # "강남구"

# 시군구에서 아파트들 접근
state.apartments  # [<Apartment ...>, <Apartment ...>, ...]
```

---

## ⚠️ 주의사항

1. **테이블명은 복수형으로!** (`account` ❌ → `accounts` ✅)
2. **FK는 반드시 인덱스가 있는 컬럼을 참조!**
3. **nullable을 명시적으로 지정!** (암묵적으로 True/False 헷갈림 방지)
4. **geometry 컬럼은 PostGIS 확장 필요!**
