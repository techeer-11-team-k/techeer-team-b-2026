#!/usr/bin/env python3
"""
주택가격지수 시군구 단위 수집 테스트 스크립트
"""
import asyncio
import sys
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가
project_root = Path(__file__).parent / "backend"
sys.path.insert(0, str(project_root))

from app.services.data_collection.house_score_collection.service import HouseScoreCollectionService
from app.db.session import AsyncSessionLocal
from sqlalchemy import create_engine, text
from app.core.config import settings


async def check_before():
    """수집 전 현황 확인"""
    print("\n" + "="*80)
    print("📊 [수집 전] 주택가격지수 데이터 현황")
    print("="*80)
    
    # 동기 엔진 생성
    sync_url = str(settings.DATABASE_URL).replace('postgresql+asyncpg', 'postgresql')
    engine = create_engine(sync_url)
    
    try:
        with engine.connect() as conn:
            # 1. 전체 데이터 수
            result = conn.execute(text('SELECT COUNT(*) FROM house_scores WHERE is_deleted = false'))
            total_count = result.scalar()
            print(f"✅ 전체 house_scores 레코드: {total_count:,}건")
            
            # 2. region_id 개수
            result = conn.execute(text('SELECT COUNT(DISTINCT region_id) FROM house_scores WHERE is_deleted = false'))
            region_count = result.scalar()
            print(f"✅ 수집된 지역(region_id) 수: {region_count}개")
            
            # 3. 시도별 데이터 분포
            query = text("""
                SELECT 
                    s.city_name,
                    COUNT(DISTINCT hs.region_id) as region_count,
                    COUNT(*) as data_count
                FROM house_scores hs
                JOIN states s ON hs.region_id = s.region_id
                WHERE hs.is_deleted = false AND s.is_deleted = false
                GROUP BY s.city_name
                ORDER BY s.city_name
            """)
            result = conn.execute(query)
            rows = result.fetchall()
            
            if rows:
                print(f"\n📍 시도별 데이터 분포:")
                for row in rows:
                    print(f"   - {row[0]}: {row[1]}개 지역, {row[2]:,}건")
            else:
                print(f"\n⚠️ 데이터가 없습니다.")
            
            # 4. STATES 테이블 전체 지역 수
            result = conn.execute(text('SELECT COUNT(*) FROM states WHERE is_deleted = false'))
            total_states = result.scalar()
            print(f"\n📋 STATES 테이블 전체 지역 수: {total_states}개")
            print(f"   (수집 가능 지역: {total_states}개)")
            
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
    finally:
        engine.dispose()


async def run_collection():
    """주택가격지수 수집 실행"""
    print("\n" + "="*80)
    print("🚀 주택가격지수 수집 시작 (시군구 단위)")
    print("="*80)
    
    service = HouseScoreCollectionService()
    
    try:
        async with AsyncSessionLocal() as db:
            result = await service.collect_house_scores(db)
            
            print("\n" + "="*80)
            print("📊 수집 결과")
            print("="*80)
            print(f"✅ 성공 여부: {result.success}")
            print(f"📥 총 수집: {result.total_fetched:,}건")
            print(f"💾 저장: {result.total_saved:,}건")
            print(f"⏭️ 건너뜀: {result.skipped:,}건 (중복)")
            print(f"⚠️ 오류: {len(result.errors)}건")
            print(f"💬 메시지: {result.message}")
            
            if result.errors:
                print(f"\n❌ 오류 목록 (최대 10개):")
                for i, error in enumerate(result.errors[:10], 1):
                    print(f"   {i}. {error}")
                if len(result.errors) > 10:
                    print(f"   ... 외 {len(result.errors) - 10}개 오류")
            
            return result.success
            
    except Exception as e:
        print(f"\n❌ 수집 중 예외 발생: {e}")
        import traceback
        traceback.print_exc()
        return False


async def check_after():
    """수집 후 현황 확인"""
    print("\n" + "="*80)
    print("📊 [수집 후] 주택가격지수 데이터 현황")
    print("="*80)
    
    # 동기 엔진 생성
    sync_url = str(settings.DATABASE_URL).replace('postgresql+asyncpg', 'postgresql')
    engine = create_engine(sync_url)
    
    try:
        with engine.connect() as conn:
            # 1. 전체 데이터 수
            result = conn.execute(text('SELECT COUNT(*) FROM house_scores WHERE is_deleted = false'))
            total_count = result.scalar()
            print(f"✅ 전체 house_scores 레코드: {total_count:,}건")
            
            # 2. region_id 개수
            result = conn.execute(text('SELECT COUNT(DISTINCT region_id) FROM house_scores WHERE is_deleted = false'))
            region_count = result.scalar()
            print(f"✅ 수집된 지역(region_id) 수: {region_count}개")
            
            # 3. 시도별 데이터 분포
            query = text("""
                SELECT 
                    s.city_name,
                    COUNT(DISTINCT hs.region_id) as region_count,
                    COUNT(*) as data_count
                FROM house_scores hs
                JOIN states s ON hs.region_id = s.region_id
                WHERE hs.is_deleted = false AND s.is_deleted = false
                GROUP BY s.city_name
                ORDER BY s.city_name
            """)
            result = conn.execute(query)
            rows = result.fetchall()
            
            if rows:
                print(f"\n📍 시도별 데이터 분포:")
                total_regions = 0
                total_data = 0
                for row in rows:
                    print(f"   - {row[0]}: {row[1]}개 지역, {row[2]:,}건")
                    total_regions += row[1]
                    total_data += row[2]
                print(f"\n   합계: {total_regions}개 지역, {total_data:,}건")
            
            # 4. 최신 데이터 확인
            query = text("""
                SELECT 
                    s.city_name,
                    s.region_name,
                    hs.base_ym,
                    hs.index_value,
                    hs.index_type
                FROM house_scores hs
                JOIN states s ON hs.region_id = s.region_id
                WHERE hs.is_deleted = false AND s.is_deleted = false
                ORDER BY hs.created_at DESC
                LIMIT 5
            """)
            result = conn.execute(query)
            rows = result.fetchall()
            
            if rows:
                print(f"\n🆕 최근 저장된 데이터 (5건):")
                for row in rows:
                    region_full = f"{row[0]} {row[1]}" if row[1] else row[0]
                    print(f"   - {region_full}: {row[2]} / {row[4]} / {row[3]:.2f}")
            
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
    finally:
        engine.dispose()


async def main():
    """메인 함수"""
    print("\n" + "🏠"*40)
    print("   주택가격지수 시군구 단위 수집 테스트")
    print("🏠"*40)
    
    # 1. 수집 전 현황
    await check_before()
    
    # 2. 사용자 확인
    print("\n" + "="*80)
    response = input("🔄 수집을 시작하시겠습니까? (y/n): ")
    if response.lower() != 'y':
        print("❌ 수집을 취소했습니다.")
        return
    
    # 3. 수집 실행
    success = await run_collection()
    
    if not success:
        print("\n❌ 수집에 실패했습니다.")
        return
    
    # 4. 수집 후 현황
    await check_after()
    
    print("\n" + "="*80)
    print("✅ 테스트 완료!")
    print("="*80)


if __name__ == "__main__":
    asyncio.run(main())
