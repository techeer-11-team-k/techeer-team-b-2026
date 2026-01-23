
"""
아파트와 상세정보 매칭 문제 진단 스크립트

서울 아파트가 충청도 상세정보와 매칭되는 등의 문제를 찾아냅니다.
"""
import asyncio
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, and_, text
from app.db.session import AsyncSessionLocal
from app.models.apartment import Apartment
from app.models.apart_detail import ApartDetail


async def diagnose_mismatch():
    """아파트와 상세정보 매칭 문제 진단"""
    
    print("=" * 80)
    print("🔍 아파트와 상세정보 매칭 문제 진단")
    print("=" * 80)
    
    async with AsyncSessionLocal() as db:
        # 1. 서울/경기 아파트인데 다른 지역 상세정보
        print("\n📊 1단계: 지역 불일치 찾기")
        print("-" * 80)
        
        # 먼저 아파트 지역 분포 확인
        region_query = text("""
            SELECT 
                SUBSTRING(ad.jibun_address FROM 1 FOR 10) as region,
                COUNT(*) as count
            FROM apartments a
            INNER JOIN apart_details ad ON a.apt_id = ad.apt_id
            WHERE 
                a.is_deleted = false
                AND ad.is_deleted = false
            GROUP BY SUBSTRING(ad.jibun_address FROM 1 FOR 10)
            ORDER BY count DESC
            LIMIT 20;
        """)
        
        region_result = await db.execute(region_query)
        region_rows = region_result.fetchall()
        
        print("\n지역별 분포:")
        for region, count in region_rows:
            print(f"  {region}: {count:,}개")
        
        # 실제 불일치 찾기: apt_id 간격이 큰 경우
        query = text("""
            SELECT 
                a.apt_id,
                a.apt_name,
                a.kapt_code,
                ad.jibun_address,
                SUBSTRING(ad.jibun_address FROM 1 FOR 10) as address_prefix
            FROM apartments a
            INNER JOIN apart_details ad ON a.apt_id = ad.apt_id
            WHERE 
                a.is_deleted = false
                AND ad.is_deleted = false
                -- apt_id 760 근처 (사용자가 언급한 문제 지점)
                AND a.apt_id BETWEEN 750 AND 800
            ORDER BY a.apt_id
            LIMIT 100;
        """)
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        if rows:
            print(f"\n⚠️  지역 불일치 발견: {len(rows)}개")
            for idx, row in enumerate(rows[:20], 1):
                print(f"\n[{idx}]")
                print(f"  apt_id: {row[0]}")
                print(f"  apt_name: {row[1]}")
                print(f"  kapt_code: {row[2]}")
                print(f"  jibun_address: {row[3][:50]}...")
        else:
            print("✅ 지역 불일치 없음")
        
        # 2. 아파트 이름과 지번주소 불일치 (ROW_NUMBER 기반)
        print("\n\n📊 2단계: ROW_NUMBER 기반 매칭 확인 (760번 근처)")
        print("-" * 80)
        print("apartments와 apart_details의 순서 비교")
        
        # apartments의 row_number
        query2a = text("""
            SELECT 
                ROW_NUMBER() OVER (ORDER BY apt_id) as row_num,
                apt_id,
                apt_name,
                kapt_code
            FROM apartments
            WHERE is_deleted = false
                AND ROW_NUMBER() OVER (ORDER BY apt_id) BETWEEN 758 AND 762
            ORDER BY apt_id;
        """)
        
        # 서브쿼리로 수정
        query2a = text("""
            WITH numbered_apartments AS (
                SELECT 
                    ROW_NUMBER() OVER (ORDER BY apt_id) as row_num,
                    apt_id,
                    apt_name,
                    kapt_code
                FROM apartments
                WHERE is_deleted = false
            )
            SELECT * FROM numbered_apartments
            WHERE row_num BETWEEN 758 AND 762
            ORDER BY apt_id;
        """)
        
        result2a = await db.execute(query2a)
        apt_rows = result2a.fetchall()
        
        print("\n[apartments 테이블 - 758~762번째 레코드]")
        for row in apt_rows:
            print(f"  {row[0]}번: apt_id={row[1]}, name={row[2]}, kapt_code={row[3]}")
        
        # apart_details의 row_number
        query2b = text("""
            WITH numbered_details AS (
                SELECT 
                    ROW_NUMBER() OVER (ORDER BY apt_detail_id) as row_num,
                    apt_detail_id,
                    apt_id,
                    jibun_address
                FROM apart_details
                WHERE is_deleted = false
            )
            SELECT * FROM numbered_details
            WHERE row_num BETWEEN 758 AND 762
            ORDER BY apt_detail_id;
        """)
        
        result2b = await db.execute(query2b)
        detail_rows = result2b.fetchall()
        
        print("\n[apart_details 테이블 - 758~762번째 레코드]")
        for row in detail_rows:
            addr_parts = row[3].split()
            last_word = addr_parts[-1] if addr_parts else ""
            print(f"  {row[0]}번: apt_detail_id={row[1]}, apt_id={row[2]}, 주소 마지막={last_word}")
        
        # 3. 실제 JOIN 매칭 확인
        query2 = text("""
            SELECT 
                a.apt_id,
                a.apt_name,
                ad.jibun_address
            FROM apartments a
            INNER JOIN apart_details ad ON a.apt_id = ad.apt_id
            WHERE 
                a.is_deleted = false
                AND ad.is_deleted = false
                AND a.apt_id BETWEEN 750 AND 770
            ORDER BY a.apt_id
            LIMIT 1000;
        """)
        
        result2 = await db.execute(query2)
        rows2 = result2.fetchall()
        
        print("\n\n[JOIN 매칭 결과 - apt_id 750~770]")
        mismatches = []
        for row in rows2:
            apt_id, apt_name, jibun_address = row
            
            # 띄어쓰기 제거
            apt_name_clean = apt_name.strip().replace(" ", "")
            
            # 지번주소에서 아파트 이름 추출
            import re
            match = re.search(r'(동|가|리|로)\s+(?:\d+[^\s]*\s+)?(.+)$', jibun_address)
            
            if match:
                addr_apt_name = match.group(2).strip()
                addr_apt_name_clean = addr_apt_name.replace(" ", "")
                
                # 포함 관계 확인
                is_match = (
                    apt_name_clean == addr_apt_name_clean or
                    apt_name_clean in addr_apt_name_clean or
                    addr_apt_name_clean in apt_name_clean
                )
                
                match_status = "✅" if is_match else "❌"
                print(f"{match_status} apt_id={apt_id}: '{apt_name}' vs '{addr_apt_name}'")
                
                if not is_match:
                    mismatches.append({
                        'apt_id': apt_id,
                        'apt_name': apt_name,
                        'jibun_address': jibun_address,
                        'extracted_name': addr_apt_name
                    })
        
        if mismatches:
            print(f"\n⚠️  이름 불일치 발견: {len(mismatches)}개")
            for idx, m in enumerate(mismatches[:20], 1):
                print(f"\n[{idx}]")
                print(f"  apt_id: {m['apt_id']}")
                print(f"  DB 이름: {m['apt_name']}")
                print(f"  주소에서 추출: {m['extracted_name']}")
                print(f"  전체 주소: {m['jibun_address'][:60]}...")
        else:
            print("\n✅ 이름 불일치 없음 (750~770 범위)")
        
        # 3. ID 순서 확인 (연속성)
        print("\n\n📊 3단계: ID 연속성 확인")
        print("-" * 80)
        
        query3 = text("""
            SELECT 
                a.apt_id as apt_id,
                ad.apt_id as detail_apt_id,
                a.apt_name,
                ad.jibun_address
            FROM apartments a
            FULL OUTER JOIN apart_details ad ON a.apt_id = ad.apt_id
            WHERE 
                (a.apt_id IS NULL OR ad.apt_id IS NULL)
                AND (a.is_deleted = false OR a.is_deleted IS NULL)
                AND (ad.is_deleted = false OR ad.is_deleted IS NULL)
            LIMIT 50;
        """)
        
        result3 = await db.execute(query3)
        rows3 = result3.fetchall()
        
        if rows3:
            print(f"\n⚠️  매칭되지 않은 레코드: {len(rows3)}개")
            for idx, row in enumerate(rows3[:10], 1):
                apt_id, detail_apt_id, apt_name, jibun_address = row
                print(f"\n[{idx}]")
                if apt_id and not detail_apt_id:
                    print(f"  apartments만 존재: apt_id={apt_id}, name={apt_name}")
                elif detail_apt_id and not apt_id:
                    print(f"  apart_details만 존재: apt_id={detail_apt_id}, address={jibun_address[:40]}...")
        else:
            print("✅ 모든 레코드 매칭됨")
        
        # 4. 통계 요약
        print("\n\n📊 4단계: 전체 통계")
        print("-" * 80)
        
        stats_query = text("""
            SELECT 
                (SELECT COUNT(*) FROM apartments WHERE is_deleted = false) as total_apartments,
                (SELECT COUNT(*) FROM apart_details WHERE is_deleted = false) as total_details,
                (SELECT COUNT(*) 
                 FROM apartments a 
                 INNER JOIN apart_details ad ON a.apt_id = ad.apt_id 
                 WHERE a.is_deleted = false AND ad.is_deleted = false) as matched_count
        """)
        
        stats = await db.execute(stats_query)
        stats_row = stats.fetchone()
        
        print(f"\n  총 아파트: {stats_row[0]:,}개")
        print(f"  총 상세정보: {stats_row[1]:,}개")
        print(f"  매칭된 개수: {stats_row[2]:,}개")
        print(f"  차이: {abs(stats_row[0] - stats_row[1]):,}개")
        
        if stats_row[0] != stats_row[1]:
            print(f"\n  ⚠️  개수가 다릅니다!")
        
        print("\n" + "=" * 80)
        print("🎯 진단 완료")
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(diagnose_mismatch())
