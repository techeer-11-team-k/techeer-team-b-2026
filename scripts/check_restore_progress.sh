#!/bin/bash
# 복원 진행률 실시간 확인 스크립트

echo "============================================================"
echo "  데이터베이스 복원 진행률 확인"
echo "============================================================"

# Docker 컨테이너에서 Python으로 직접 확인
docker exec realestate-backend python3 <<'PYTHON_SCRIPT'
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
import os

# 환경 변수에서 DATABASE_URL 가져오기
database_url = os.getenv('DATABASE_URL', 'postgresql+asyncpg://postgres:postgres@localhost:5432/realestate_db')

async def check_progress():
    engine = create_async_engine(database_url, echo=False)
    
    try:
        async with engine.connect() as conn:
            # rents 테이블 확인
            result = await conn.execute(text('SELECT COUNT(*) FROM rents'))
            rents_count = result.scalar() or 0
            
            # sales 테이블 확인
            result = await conn.execute(text('SELECT COUNT(*) FROM sales'))
            sales_count = result.scalar() or 0
            
            # 예상 행 수 (백업 파일에서)
            estimated_rents = 5702411
            estimated_sales = 3237595
            
            print(f"\n📊 현재 복원 진행률:")
            print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            
            if rents_count > 0:
                rents_pct = (rents_count / estimated_rents * 100) if estimated_rents > 0 else 0
                rents_bar = "█" * int(rents_pct / 2) + "░" * (50 - int(rents_pct / 2))
                print(f"rents:    {rents_count:>10,} / {estimated_rents:>10,} 행 ({rents_pct:>5.1f}%)")
                print(f"          [{rents_bar}]")
            else:
                print(f"rents:    아직 시작되지 않음")
            
            if sales_count > 0:
                sales_pct = (sales_count / estimated_sales * 100) if estimated_sales > 0 else 0
                sales_bar = "█" * int(sales_pct / 2) + "░" * (50 - int(sales_pct / 2))
                print(f"sales:    {sales_count:>10,} / {estimated_sales:>10,} 행 ({sales_pct:>5.1f}%)")
                print(f"          [{sales_bar}]")
            else:
                print(f"sales:    아직 시작되지 않음")
            
            print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            
            # 전체 진행률
            total_current = rents_count + sales_count
            total_estimated = estimated_rents + estimated_sales
            if total_current > 0:
                total_pct = (total_current / total_estimated * 100) if total_estimated > 0 else 0
                print(f"전체:     {total_current:>10,} / {total_estimated:>10,} 행 ({total_pct:>5.1f}%)")
            
            # 예상 남은 시간 계산 (간단한 추정)
            if rents_count > 0 or sales_count > 0:
                print(f"\n💡 팁: 이 스크립트를 주기적으로 실행하여 진행률을 확인하세요.")
                print(f"   watch -n 5 ./scripts/check_restore_progress.sh")
    
    finally:
        await engine.dispose()

asyncio.run(check_progress())
PYTHON_SCRIPT

echo ""
echo "============================================================"
