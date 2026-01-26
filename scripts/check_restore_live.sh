#!/bin/bash
# 복원 진행 상황 실시간 확인 스크립트

echo "============================================================"
echo "  복원 진행 상황 실시간 확인"
echo "============================================================"

# Docker 컨테이너에서 Python으로 직접 확인
docker exec realestate-backend python3 <<'PYTHON_SCRIPT'
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
import os
from datetime import datetime

# 환경 변수에서 DATABASE_URL 가져오기
database_url = os.getenv('DATABASE_URL', 'postgresql+asyncpg://postgres:postgres@localhost:5432/realestate_db')

async def check_progress():
    engine = create_async_engine(database_url, echo=False, pool_pre_ping=True)
    
    try:
        async with engine.connect() as conn:
            # rents 테이블 확인
            result = await conn.execute(text('SELECT COUNT(*) FROM rents'))
            rents_count = result.scalar() or 0
            
            # sales 테이블 확인
            result = await conn.execute(text('SELECT COUNT(*) FROM sales'))
            sales_count = result.scalar() or 0
            
            # 예상 행 수
            estimated_rents = 5702411
            estimated_sales = 3237595
            
            # 현재 시간
            now = datetime.now().strftime("%H:%M:%S")
            
            print(f"\n⏰ 확인 시간: {now}")
            print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            
            # rents 진행률
            if rents_count > 0:
                rents_pct = (rents_count / estimated_rents * 100) if estimated_rents > 0 else 0
                rents_bar_length = min(50, int(rents_pct / 2))
                rents_bar = "█" * rents_bar_length + "░" * (50 - rents_bar_length)
                print(f"rents:    {rents_count:>10,} / {estimated_rents:>10,} 행 ({rents_pct:>5.1f}%)")
                print(f"          [{rents_bar}]")
                
                # 진행 속도 계산 (대략적)
                if rents_count < estimated_rents:
                    remaining = estimated_rents - rents_count
                    print(f"          남은 행: {remaining:,} (예상 시간: {remaining/10000:.0f}초)")
            else:
                print(f"rents:    아직 시작되지 않음 또는 0행")
            
            # sales 진행률
            if sales_count > 0:
                sales_pct = (sales_count / estimated_sales * 100) if estimated_sales > 0 else 0
                sales_bar_length = min(50, int(sales_pct / 2))
                sales_bar = "█" * sales_bar_length + "░" * (50 - sales_bar_length)
                print(f"sales:    {sales_count:>10,} / {estimated_sales:>10,} 행 ({sales_pct:>5.1f}%)")
                print(f"          [{sales_bar}]")
                
                # 진행 속도 계산
                if sales_count < estimated_sales:
                    remaining = estimated_sales - sales_count
                    print(f"          남은 행: {remaining:,} (예상 시간: {remaining/10000:.0f}초)")
            else:
                print(f"sales:    아직 시작되지 않음 또는 0행")
            
            print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            
            # 상태 판단
            total_current = rents_count + sales_count
            total_estimated = estimated_rents + estimated_sales
            
            if total_current == 0:
                print(f"⚠️  아직 데이터가 삽입되지 않았습니다. COPY 명령이 시작 중일 수 있습니다.")
            elif total_current < total_estimated * 0.01:  # 1% 미만
                print(f"⚠️  진행이 매우 느립니다. 리소스 부족 가능성이 있습니다.")
            elif total_current >= total_estimated * 0.99:  # 99% 이상
                print(f"✅ 거의 완료되었습니다!")
            else:
                total_pct = (total_current / total_estimated * 100) if total_estimated > 0 else 0
                print(f"📊 전체 진행률: {total_pct:.1f}% ({total_current:,}/{total_estimated:,} 행)")
            
            # 프로세스 상태 확인
            import subprocess
            try:
                result = subprocess.run(
                    ['ps', 'aux'], 
                    capture_output=True, 
                    text=True, 
                    timeout=2
                )
                python_processes = [line for line in result.stdout.split('\n') if 'python.*db_admin' in line or 'app.db_admin' in line]
                if python_processes:
                    print(f"\n✅ Python 복원 프로세스가 실행 중입니다.")
                else:
                    print(f"\n⚠️  Python 복원 프로세스를 찾을 수 없습니다.")
            except:
                pass
    
    except Exception as e:
        print(f"\n❌ 오류 발생: {e}")
        print(f"   데이터베이스 연결 문제일 수 있습니다.")
    finally:
        await engine.dispose()

asyncio.run(check_progress())
PYTHON_SCRIPT

echo ""
echo "💡 이 스크립트를 반복 실행하여 진행 상황을 확인하세요:"
echo "   watch -n 3 ./scripts/check_restore_live.sh"
echo "============================================================"
