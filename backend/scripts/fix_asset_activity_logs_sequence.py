"""
asset_activity_logs 테이블의 ID 시퀀스 동기화 스크립트

사용법:
    python backend/scripts/fix_asset_activity_logs_sequence.py

이 스크립트는 asset_activity_logs 테이블의 현재 최대 ID 값을 확인하고,
ID 시퀀스(Serial)를 그 다음 값으로 재설정하여 IntegrityError를 해결합니다.
"""

import asyncio
import sys
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# 백엔드 루트 경로 추가
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.config import settings

async def fix_sequence():
    print("="*60)
    print(" asset_activity_logs ID 시퀀스 복구 도구")
    print("="*60)
    
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    
    try:
        async with engine.begin() as conn:
            # 1. 현재 테이블의 최대 ID 조회
            print("1. 현재 최대 ID 조회 중...")
            result = await conn.execute(text("SELECT MAX(id) FROM asset_activity_logs"))
            max_id = result.scalar() or 0
            print(f"   - 현재 최대 ID: {max_id}")
            
            # 2. 시퀀스 이름 확인 (pg_get_serial_sequence 사용)
            print("2. 시퀀스 이름 확인 중...")
            seq_result = await conn.execute(text("SELECT pg_get_serial_sequence('asset_activity_logs', 'id')"))
            seq_name = seq_result.scalar()
            
            if not seq_name:
                # 시퀀스 이름을 찾지 못했다면 기본 이름으로 시도
                seq_name = "asset_activity_logs_id_seq"
                print(f"   - 시퀀스 이름을 찾을 수 없어 기본값 사용: {seq_name}")
            else:
                print(f"   - 확인된 시퀀스 이름: {seq_name}")
            
            # 3. 시퀀스 재설정 (MAX(id) + 1)
            print(f"3. 시퀀스를 {max_id + 1}(으)로 재설정 중...")
            await conn.execute(text(f"SELECT setval('{seq_name}', {max_id + 1}, false)"))
            
            print("\n [성공] 시퀀스가 성공적으로 동기화되었습니다.")
            print(" 이제 IntegrityError 없이 데이터를 추가할 수 있습니다.")
            
    except Exception as e:
        print(f"\n [오류] 시퀀스 동기화 실패:")
        print(f"   {str(e)}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(fix_sequence())
