import asyncio
import sys
import os

# 프로젝트 루트 경로를 sys.path에 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.db.session import engine

async def add_remarks_column():
    """sales 테이블에 remarks 컬럼 추가"""
    print("🚀 sales 테이블에 remarks 컬럼 추가 중...")
    
    async with engine.begin() as conn:
        try:
            # PostgreSQL용 ALTER TABLE
            await conn.execute(text("ALTER TABLE sales ADD COLUMN IF NOT EXISTS remarks VARCHAR(255);"))
            print("✅ remarks 컬럼이 성공적으로 추가되었습니다 (또는 이미 존재함).")
        except Exception as e:
            print(f"❌ 컬럼 추가 실패: {e}")

if __name__ == "__main__":
    asyncio.run(add_remarks_column())
