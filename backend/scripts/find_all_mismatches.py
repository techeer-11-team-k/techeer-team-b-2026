"""
전체 아파트 데이터에서 ROW_NUMBER 불일치 찾기

apart_details의 n번째 레코드가 apartments의 n번째 레코드와 
apt_id가 일치하지 않는 모든 경우를 찾습니다.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def find_all_mismatches():
    """전체 데이터에서 ROW_NUMBER 불일치 찾기"""
    
    print("=" * 80)
    print(" 전체 ROW_NUMBER 불일치 탐지")
    print("=" * 80)
    
    async with AsyncSessionLocal() as db:
        # apartments와 apart_details를 ROW_NUMBER로 비교
        query = text("""
            WITH numbered_apartments AS (
                SELECT 
                    ROW_NUMBER() OVER (ORDER BY apt_id) as row_num,
                    apt_id as apt_apt_id
                FROM apartments
                WHERE is_deleted = false
            ),
            numbered_details AS (
                SELECT 
                    ROW_NUMBER() OVER (ORDER BY apt_detail_id) as row_num,
                    apt_detail_id,
                    apt_id as detail_apt_id
                FROM apart_details
                WHERE is_deleted = false
            )
            SELECT 
                na.row_num,
                na.apt_apt_id,
                nd.apt_detail_id,
                nd.detail_apt_id,
                (nd.detail_apt_id - na.apt_apt_id) as apt_id_diff
            FROM numbered_apartments na
            INNER JOIN numbered_details nd ON na.row_num = nd.row_num
            WHERE na.apt_apt_id != nd.detail_apt_id
            ORDER BY na.row_num;
        """)
        
        result = await db.execute(query)
        mismatches = result.fetchall()
        
        if mismatches:
            print(f"\n  총 {len(mismatches):,}개의 불일치 발견!\n")
            
            # 처음 20개 출력
            print("처음 20개 불일치:")
            print("-" * 80)
            for row in mismatches[:20]:
                row_num, apt_apt_id, detail_id, detail_apt_id, diff = row
                print(f"  {row_num}번째: apartments.apt_id={apt_apt_id}, "
                      f"apart_details.apt_id={detail_apt_id}, 차이={diff:+d}")
            
            # 차이 통계
            print("\n\n차이 통계:")
            print("-" * 80)
            
            # 차이별 그룹화
            diff_groups = {}
            for row in mismatches:
                diff = row[4]
                diff_groups[diff] = diff_groups.get(diff, 0) + 1
            
            for diff in sorted(diff_groups.keys()):
                count = diff_groups[diff]
                print(f"  차이 {diff:+d}: {count:,}개")
            
            # 연속된 불일치 구간 찾기
            print("\n\n연속된 불일치 구간:")
            print("-" * 80)
            
            segments = []
            current_start = mismatches[0][0]
            current_end = mismatches[0][0]
            current_diff = mismatches[0][4]
            
            for row in mismatches[1:]:
                row_num, _, _, _, diff = row
                
                # 연속되고 차이가 같으면 현재 구간 확장
                if row_num == current_end + 1 and diff == current_diff:
                    current_end = row_num
                else:
                    # 새로운 구간 시작
                    segments.append((current_start, current_end, current_diff))
                    current_start = row_num
                    current_end = row_num
                    current_diff = diff
            
            # 마지막 구간 추가
            segments.append((current_start, current_end, current_diff))
            
            for idx, (start, end, diff) in enumerate(segments, 1):
                count = end - start + 1
                print(f"  구간 {idx}: {start}~{end}번 ({count:,}개), 차이={diff:+d}")
            
            # 수정 제안
            print("\n\n" + "=" * 80)
            print(" 수정 제안")
            print("=" * 80)
            print("\napart_details의 apt_id를 재정렬해야 합니다.")
            print("방법: apart_details의 n번째 레코드의 apt_id를")
            print("      apartments의 n번째 레코드의 apt_id로 변경")
            print("\n  주의: 이 작업은 sales, rents 등 종속 테이블을 모두 초기화합니다.")
            
        else:
            print("\n 모든 레코드가 올바르게 매칭되어 있습니다!")
        
        print("\n" + "=" * 80)


if __name__ == "__main__":
    asyncio.run(find_all_mismatches())
