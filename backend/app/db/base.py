"""
데이터베이스 베이스 클래스

모든 SQLAlchemy 모델이 상속받는 기본 클래스입니다.
"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    SQLAlchemy Base 클래스
    
    모든 모델은 이 클래스를 상속받습니다.
    """
    pass
