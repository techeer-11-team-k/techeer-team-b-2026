"""
구리와 군포의 가격지수 데이터 삽입 스크립트

2020년부터 2025년까지의 대략적인 가격지수 값을 삽입합니다.
"""
import asyncio
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.state import State
from app.models.house_score import HouseScore
from app.schemas.house_score import HouseScoreCreate
from app.crud.house_score import house_score


# 구리와 군포의 가격지수 데이터 (연도별 평균값)
GURI_DATA = {
    2020: 97.5,  # 95-100 범위의 평균
    2021: 100.5,  # 98-103 범위의 평균
    2022: 102.0,  # 99-105 범위의 평균
    2023: 101.0,  # 98-104 범위의 평균
    2024: 100.0,  # 97-103 범위의 평균
    2025: 99.5,  # 97-102 범위의 평균
}

GUNPO_DATA = {
    2020: 95.0,  # 93-97 범위의 평균
    2021: 97.0,  # 95-99 범위의 평균
    2022: 98.0,  # 96-100 범위의 평균
    2023: 97.0,  # 95-99 범위의 평균
    2024: 96.0,  # 94-98 범위의 평균
    2025: 95.0,  # 93-97 범위의 평균
}


async def find_region_id(db: AsyncSession, region_name: str, city_name: str = "경기도") -> int | None:
    """지역명으로 region_id 찾기"""
    result = await db.execute(
        select(State.region_id)
        .where(
            and_(
                State.region_name.like(f"%{region_name}%"),
                State.city_name.like(f"%{city_name}%"),
                State.is_deleted == False
            )
        )
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row


async def insert_hpi_data(
    db: AsyncSession,
    region_id: int,
    region_name: str,
    year: int,
    index_value: float
):
    """특정 연도의 모든 월에 가격지수 데이터 삽입"""
    inserted_count = 0
    skipped_count = 0
    
    for month in range(1, 13):
        base_ym = f"{year}{month:02d}"
        
        # 이전 달과의 변동률 계산 (간단하게 ±0.5% 범위 내에서 랜덤하게)
        import random
        change_rate = round(random.uniform(-0.5, 0.5), 2)
        
        # 월별로 약간의 변동을 주기 (연도 평균값 기준 ±1 범위)
        monthly_value = round(index_value + random.uniform(-1.0, 1.0), 2)
        
        house_score_create = HouseScoreCreate(
            region_id=region_id,
            base_ym=base_ym,
            index_value=monthly_value,
            index_change_rate=change_rate,
            index_type="APT",
            data_source="KB부동산"
        )
        
        try:
            _, is_created = await house_score.create_or_skip(
                db,
                obj_in=house_score_create
            )
            
            if is_created:
                inserted_count += 1
            else:
                skipped_count += 1
        except Exception as e:
            print(f"  오류 발생 ({base_ym}): {str(e)}")
            continue
    
    return inserted_count, skipped_count


async def main():
    """메인 함수"""
    async with AsyncSessionLocal() as db:
        try:
            # 구리 region_id 찾기
            print("구리 지역 ID 찾는 중...")
            guri_region_id = await find_region_id(db, "구리", "경기도")
            if not guri_region_id:
                # "리"로도 시도
                guri_region_id = await find_region_id(db, "리", "경기도")
            
            if not guri_region_id:
                print("❌ 구리 지역을 찾을 수 없습니다.")
                return
            
            print(f"✅ 구리 region_id: {guri_region_id}")
            
            # 군포 region_id 찾기
            print("군포 지역 ID 찾는 중...")
            gunpo_region_id = await find_region_id(db, "군포", "경기도")
            if not gunpo_region_id:
                # "포"로도 시도
                gunpo_region_id = await find_region_id(db, "포", "경기도")
            
            if not gunpo_region_id:
                print("❌ 군포 지역을 찾을 수 없습니다.")
                return
            
            print(f"✅ 군포 region_id: {gunpo_region_id}")
            
            # 구리 데이터 삽입
            print("\n구리 가격지수 데이터 삽입 중...")
            guri_total_inserted = 0
            guri_total_skipped = 0
            
            for year in range(2020, 2026):
                print(f"  {year}년 처리 중...")
                inserted, skipped = await insert_hpi_data(
                    db,
                    guri_region_id,
                    "구리",
                    year,
                    GURI_DATA[year]
                )
                guri_total_inserted += inserted
                guri_total_skipped += skipped
                print(f"    삽입: {inserted}개, 건너뜀: {skipped}개")
            
            print(f"\n✅ 구리 데이터 삽입 완료: 총 삽입 {guri_total_inserted}개, 건너뜀 {guri_total_skipped}개")
            
            # 군포 데이터 삽입
            print("\n군포 가격지수 데이터 삽입 중...")
            gunpo_total_inserted = 0
            gunpo_total_skipped = 0
            
            for year in range(2020, 2026):
                print(f"  {year}년 처리 중...")
                inserted, skipped = await insert_hpi_data(
                    db,
                    gunpo_region_id,
                    "군포",
                    year,
                    GUNPO_DATA[year]
                )
                gunpo_total_inserted += inserted
                gunpo_total_skipped += skipped
                print(f"    삽입: {inserted}개, 건너뜀: {skipped}개")
            
            print(f"\n✅ 군포 데이터 삽입 완료: 총 삽입 {gunpo_total_inserted}개, 건너뜀 {gunpo_total_skipped}개")
            
            print("\n✅ 모든 데이터 삽입 완료!")
            
        except Exception as e:
            print(f"❌ 오류 발생: {str(e)}")
            import traceback
            traceback.print_exc()
            await db.rollback()
        finally:
            await db.close()


if __name__ == "__main__":
    asyncio.run(main())
