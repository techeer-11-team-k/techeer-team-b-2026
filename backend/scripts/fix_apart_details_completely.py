"""
apart_details 완전 재구축

apart_details 테이블을 완전히 삭제하고,
apartments의 kapt_code를 기반으로 상세정보를 다시 수집합니다.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def fix_apart_details():
    """apart_details 완전 재구축"""
    
    print("=" * 80)
    print("🔧 apart_details 완전 재구축")
    print("=" * 80)
    
    print("\n⚠️  이 작업은 다음을 수행합니다:")
    print("   1. apart_details와 종속 테이블의 모든 데이터 삭제")
    print("   2. apartments의 kapt_code로 상세정보를 다시 수집")
    print("\n   종속 테이블:")
    print("   - sales, rents")
    print("   - recent_views, recent_searches")
    print("   - favorite_apartments, my_properties")
    print("   - house_scores, house_volumes")
    
    confirm1 = input("\n계속하시겠습니까? (yes/no): ").strip().lower()
    if confirm1 != 'yes':
        print("❌ 취소되었습니다.")
        return False
    
    async with AsyncSessionLocal() as db:
        async with db.begin():
            # 1. 종속 테이블 초기화
            print("\n🗑️  종속 테이블 초기화 중...")
            tables_to_truncate = [
                "sales", "rents",
                "recent_views", "recent_searches",
                "favorite_apartments", "my_properties",
                "house_scores", "house_volumes",
                "apart_details"
            ]
            
            for table_name in tables_to_truncate:
                try:
                    await db.execute(text(f"TRUNCATE TABLE {table_name} CASCADE;"))
                    print(f"   ✅ '{table_name}' 초기화 완료")
                except Exception as e:
                    print(f"   ⚠️ '{table_name}' 초기화 오류: {e}")
        
        print("\n✅ 초기화 완료!")
        
        # 2. apartments 개수 확인
        result = await db.execute(text("SELECT COUNT(*) FROM apartments WHERE is_deleted = false"))
        apt_count = result.scalar()
        
        print(f"\n📊 {apt_count:,}개의 아파트 상세정보를 수집해야 합니다.")
        print("\n다음 명령어로 상세정보를 수집하세요:")
        print("   docker compose exec backend python -m app.services.data_collection.apt_detail_collection.service")
    
    return True


if __name__ == "__main__":
    asyncio.run(fix_apart_details())
