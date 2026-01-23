"""
kapt_code 기반 매칭 확인

apartments와 apart_details가 kapt_code로 올바르게 매칭되어 있는지 확인합니다.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def check_kapt_code_matching():
    """kapt_code 기반 매칭 확인"""
    
    print("=" * 80)
    print("🔍 kapt_code 기반 매칭 확인")
    print("=" * 80)
    
    async with AsyncSessionLocal() as db:
        # 1. apart_details 테이블 구조 확인
        print("\n📊 1단계: apart_details 테이블 구조 확인")
        print("-" * 80)
        
        columns_query = text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'apart_details'
            ORDER BY ordinal_position;
        """)
        
        result = await db.execute(columns_query)
        columns = result.fetchall()
        
        print("\napart_details 테이블 컬럼:")
        has_kapt_code = False
        for col_name, col_type in columns:
            print(f"  - {col_name}: {col_type}")
            if col_name == 'kapt_code':
                has_kapt_code = True
        
        # 2. apartments와 apart_details의 kapt_code 비교
        print("\n\n📊 2단계: kapt_code 매칭 확인")
        print("-" * 80)
        
        if has_kapt_code:
            # kapt_code가 있는 경우
            matching_query = text("""
                SELECT 
                    a.apt_id,
                    a.apt_name,
                    a.kapt_code as apt_kapt_code,
                    ad.apt_detail_id,
                    ad.kapt_code as detail_kapt_code,
                    ad.jibun_address
                FROM apartments a
                INNER JOIN apart_details ad ON a.apt_id = ad.apt_id
                WHERE 
                    a.is_deleted = false
                    AND ad.is_deleted = false
                    AND a.kapt_code != ad.kapt_code
                LIMIT 100;
            """)
            
            result = await db.execute(matching_query)
            mismatches = result.fetchall()
            
            if mismatches:
                print(f"\n⚠️  kapt_code 불일치 발견: {len(mismatches)}개")
                for idx, row in enumerate(mismatches[:20], 1):
                    apt_id, apt_name, apt_kapt, detail_id, detail_kapt, jibun = row
                    print(f"\n[{idx}]")
                    print(f"  apt_id: {apt_id}, name: {apt_name}")
                    print(f"  apartments.kapt_code: {apt_kapt}")
                    print(f"  apart_details.kapt_code: {detail_kapt}")
                    print(f"  주소: {jibun[:60]}...")
            else:
                print("\n✅ 모든 kapt_code가 일치합니다!")
        else:
            # kapt_code가 없는 경우
            print("\n⚠️  apart_details에 kapt_code 컬럼이 없습니다!")
            print("   이것이 문제의 원인입니다.")
            print("   apart_details는 kapt_code 없이 순서대로 저장된 것 같습니다.")
        
        # 3. 샘플 데이터 비교 (760번 근처)
        print("\n\n📊 3단계: 760번 근처 샘플 비교")
        print("-" * 80)
        
        sample_query = text("""
            SELECT 
                a.apt_id,
                a.apt_name,
                a.kapt_code as apt_kapt_code,
                ad.jibun_address,
                SUBSTRING(ad.jibun_address FROM '.+ ([^ ]+)$') as last_word
            FROM apartments a
            INNER JOIN apart_details ad ON a.apt_id = ad.apt_id
            WHERE 
                a.is_deleted = false
                AND ad.is_deleted = false
                AND a.apt_id BETWEEN 758 AND 762
            ORDER BY a.apt_id;
        """)
        
        result = await db.execute(sample_query)
        samples = result.fetchall()
        
        print("\n760번 근처 매칭 상태:")
        for row in samples:
            apt_id, apt_name, kapt_code, jibun_address, last_word = row
            
            # 아파트 이름과 주소 마지막 단어 비교
            apt_name_clean = apt_name.replace(" ", "")
            last_word_clean = (last_word or "").replace(" ", "") if last_word else ""
            
            match_status = "✅" if apt_name_clean == last_word_clean else "❌"
            
            print(f"\n{match_status} apt_id={apt_id}, kapt_code={kapt_code}")
            print(f"  apt_name: {apt_name}")
            print(f"  주소: {jibun_address[:70]}...")
            print(f"  마지막 단어: {last_word or 'N/A'}")
        
        # 4. 올바른 매칭 찾기 (kapt_code로)
        print("\n\n📊 4단계: 올바른 매칭 찾기")
        print("-" * 80)
        print("\napartments의 kapt_code로 올바른 apart_details를 찾을 수 있는지 확인...")
        
        # 760번 "루미아"의 kapt_code로 올바른 상세정보 찾기
        search_query = text("""
            SELECT 
                a.apt_id,
                a.apt_name,
                a.kapt_code
            FROM apartments a
            WHERE a.apt_id = 760
            LIMIT 1;
        """)
        
        result = await db.execute(search_query)
        apt_760 = result.fetchone()
        
        if apt_760:
            apt_id, apt_name, kapt_code = apt_760
            print(f"\napartments 760번: {apt_name} (kapt_code: {kapt_code})")
            
            # 이 kapt_code를 가진 apart_details가 있는지 확인
            if has_kapt_code:
                find_detail_query = text("""
                    SELECT 
                        ad.apt_detail_id,
                        ad.apt_id,
                        ad.jibun_address
                    FROM apart_details ad
                    WHERE ad.kapt_code = :kapt_code
                    LIMIT 1;
                """)
                
                result = await db.execute(find_detail_query, {"kapt_code": kapt_code})
                detail = result.fetchone()
                
                if detail:
                    detail_id, detail_apt_id, jibun = detail
                    print(f"\n이 kapt_code의 apart_details:")
                    print(f"  apt_detail_id: {detail_id}")
                    print(f"  현재 연결된 apt_id: {detail_apt_id}")
                    print(f"  주소: {jibun[:70]}...")
                    
                    if detail_apt_id != apt_id:
                        print(f"\n⚠️  잘못 연결됨! {detail_apt_id} != {apt_id}")
                else:
                    print("\n⚠️  이 kapt_code의 apart_details를 찾을 수 없습니다!")
        
        print("\n" + "=" * 80)
        print("🎯 진단 완료")
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(check_kapt_code_matching())
