"""
뉴스 모델

현재는 DB 저장을 하지 않으므로 모델이 비어있습니다.
필요시 SQLAlchemy 모델을 추가할 수 있습니다.
"""

# 뉴스 API는 현재 DB 저장 없이 크롤링만 수행하므로 모델이 없습니다.
# DB 저장 기능이 필요할 경우 아래와 같이 모델을 정의할 수 있습니다:
#
# from sqlalchemy import Column, Integer, String, DateTime, Text
# from sqlalchemy.sql import func
# from app.db.base_class import Base
#
# class News(Base):
#     __tablename__ = "news"
#     
#     id = Column(Integer, primary_key=True, index=True)
#     title = Column(String, nullable=False)
#     content = Column(Text)
#     url = Column(String, unique=True, nullable=False, index=True)
#     source = Column(String)
#     thumbnail_url = Column(String)
#     category = Column(String)
#     published_at = Column(DateTime(timezone=True))
#     created_at = Column(DateTime(timezone=True), server_default=func.now())
