"""
apart_details 테이블에 kapt_code 컬럼 추가

이 스크립트는 apart_details 테이블에 kapt_code 컬럼을 추가하고,
기존 데이터의 kapt_code를 apartments 테이블에서 가져와 채웁니다.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def add_kapt_code_column():
    """apart_details에 kapt_code 컬럼 추가 및 데이터 채우기"""
    
    print("=" * 80)
    print("🔧 apart_details 테이블에 kapt_code 컬럼 추가")
    print("=" * 80)
    
    async with AsyncSessionLocal() as db:
        # 1. kapt_code 컬럼이 이미 존재하는지 확인
        check_query = text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'apart_details' 
            AND column_name = 'kapt_code';
        """)
        
        result = await db.execute(check_query)
        exists = result.fetchone()
        
        if exists:
            print("\n✅ kapt_code 컬럼이 이미 존재합니다!")
            print("   데이터 동기화를 진행합니다...")
        else:
            print("\n📝 kapt_code 컬럼 추가 중...")
            # kapt_code 컬럼 추가
            add_column_query = text("""
                ALTER TABLE apart_details 
                ADD COLUMN kapt_code VARCHAR(20);
            """)
            
            await db.execute(add_column_query)
            await db.commit()
            print("✅ kapt_code 컬럼 추가 완료!")
            
            # 인덱스 추가
            print("\n📝 kapt_code 인덱스 추가 중...")
            add_index_query = text("""
                CREATE INDEX IF NOT EXISTS idx_apart_details_kapt_code 
                ON apart_details(kapt_code);
            """)
            
            await db.execute(add_index_query)
            await db.commit()
            print("✅ 인덱스 추가 완료!")
        
        # 2. 기존 데이터의 kapt_code를 apartments에서 가져와 업데이트
        print("\n📝 기존 데이터의 kapt_code 동기화 중...")
        
        # 업데이트할 레코드 수 확인
        count_query = text("""
            SELECT COUNT(*) 
            FROM apart_details ad
            INNER JOIN apartments a ON ad.apt_id = a.apt_id
            WHERE ad.kapt_code IS NULL OR ad.kapt_code != a.kapt_code;
        """)
        
        result = await db.execute(count_query)
        update_count = result.scalar()
        
        if update_count == 0:
            print("✅ 모든 데이터가 이미 동기화되어 있습니다!")
        else:
            print(f"   {update_count:,}개의 레코드를 업데이트합니다...")
            
            # apartments의 kapt_code로 apart_details 업데이트
            update_query = text("""
                UPDATE apart_details ad
                SET kapt_code = a.kapt_code
                FROM apartments a
                WHERE ad.apt_id = a.apt_id
                AND (ad.kapt_code IS NULL OR ad.kapt_code != a.kapt_code);
            """)
            
            result = await db.execute(update_query)
            await db.commit()
            print(f"✅ {result.rowcount:,}개의 레코드 업데이트 완료!")
        
        # 3. 검증
        print("\n🔍 데이터 검증 중...")
        verify_query = text("""
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN ad.kapt_code = a.kapt_code THEN 1 END) as matched,
                COUNT(CASE WHEN ad.kapt_code IS NULL THEN 1 END) as null_count,
                COUNT(CASE WHEN ad.kapt_code != a.kapt_code THEN 1 END) as mismatched
            FROM apart_details ad
            INNER JOIN apartments a ON ad.apt_id = a.apt_id;
        """)
        
        result = await db.execute(verify_query)
        stats = result.fetchone()
        
        print(f"\n검증 결과:")
        print(f"  - 총 레코드: {stats[0]:,}개")
        print(f"  - 일치: {stats[1]:,}개")
        print(f"  - NULL: {stats[2]:,}개")
        print(f"  - 불일치: {stats[3]:,}개")
        
        if stats[1] == stats[0] and stats[2] == 0 and stats[3] == 0:
            print("\n✅ 모든 데이터가 올바르게 동기화되었습니다!")
        else:
            print("\n⚠️  일부 데이터에 문제가 있습니다. 확인이 필요합니다.")
        
        print("\n" + "=" * 80)
        print("🎉 마이그레이션 완료!")
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(add_kapt_code_column())
