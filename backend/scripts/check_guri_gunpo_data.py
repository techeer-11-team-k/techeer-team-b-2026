"""
구리와 군포 데이터 확인 스크립트
"""
import asyncio
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.state import State
from app.models.house_score import HouseScore


async def check_data():
    async with AsyncSessionLocal() as db:
        # 구리 region_id 찾기
        guri_result = await db.execute(
            select(State.region_id, State.region_name)
            .where(
                and_(
                    or_(
                        State.region_name.like('%구리%'),
                        State.region_name == '리'
                    ),
                    State.city_name == '경기도',
                    State.is_deleted == False
                )
            )
            .limit(5)
        )
        guri_states = guri_result.fetchall()
        print("구리 지역:")
        for state in guri_states:
            print(f"  region_id: {state.region_id}, region_name: {state.region_name}")
            if state.region_id:
                # 최신 5개 base_ym 데이터 조회
                data_result = await db.execute(
                    select(
                        func.avg(HouseScore.index_value).label('avg_value'),
                        func.count(HouseScore.index_id).label('count'),
                        HouseScore.base_ym
                    )
                    .where(
                        and_(
                            HouseScore.region_id == state.region_id,
                            HouseScore.index_type == 'APT',
                            HouseScore.is_deleted == False
                        )
                    )
                    .group_by(HouseScore.base_ym)
                    .order_by(desc(HouseScore.base_ym))
                    .limit(5)
                )
                data_rows = data_result.fetchall()
                print(f"    데이터:")
                for row in data_rows:
                    print(f"      base_ym: {row.base_ym}, avg: {row.avg_value:.2f}, count: {row.count}")
        
        print("\n군포 지역:")
        gunpo_result = await db.execute(
            select(State.region_id, State.region_name)
            .where(
                and_(
                    or_(
                        State.region_name.like('%군포%'),
                        State.region_name == '포'
                    ),
                    State.city_name == '경기도',
                    State.is_deleted == False
                )
            )
            .limit(5)
        )
        gunpo_states = gunpo_result.fetchall()
        for state in gunpo_states:
            print(f"  region_id: {state.region_id}, region_name: {state.region_name}")
            if state.region_id:
                # 최신 5개 base_ym 데이터 조회
                data_result = await db.execute(
                    select(
                        func.avg(HouseScore.index_value).label('avg_value'),
                        func.count(HouseScore.index_id).label('count'),
                        HouseScore.base_ym
                    )
                    .where(
                        and_(
                            HouseScore.region_id == state.region_id,
                            HouseScore.index_type == 'APT',
                            HouseScore.is_deleted == False
                        )
                    )
                    .group_by(HouseScore.base_ym)
                    .order_by(desc(HouseScore.base_ym))
                    .limit(5)
                )
                data_rows = data_result.fetchall()
                print(f"    데이터:")
                for row in data_rows:
                    print(f"      base_ym: {row.base_ym}, avg: {row.avg_value:.2f}, count: {row.count}")


if __name__ == "__main__":
    asyncio.run(check_data())
