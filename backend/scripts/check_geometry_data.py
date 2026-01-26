#!/usr/bin/env python3
"""
아파트 geometry 데이터 확인 스크립트

데이터베이스에 geometry 데이터가 얼마나 있는지 확인합니다.

사용법:
    # Docker 컨테이너에서 실행
    docker exec -it realestate-backend python /app/scripts/check_geometry_data.py
    
    # 또는 docker-compose 사용
    docker-compose exec backend python scripts/check_geometry_data.py
    
    # 로컬에서 실행
    python backend/scripts/check_geometry_data.py
"""
import asyncio
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
script_path = Path(__file__).resolve()
if script_path.parts[0] == '/app':
    project_root = Path('/app')
else:
    project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import select, func, text
from app.db.session import AsyncSessionLocal
from app.models.apart_detail import ApartDetail
from app.models.apartment import Apartment


async def check_geometry_data():
    """geometry 데이터 통계 확인"""
    async with AsyncSessionLocal() as db:
        # 1. 전체 아파트 상세 정보 개수
        total_count = await db.execute(
            select(func.count(ApartDetail.apt_detail_id))
            .where(ApartDetail.is_deleted == False)
        )
        total = total_count.scalar() or 0
        
        # 2. geometry가 있는 아파트 개수
        with_geometry_count = await db.execute(
            select(func.count(ApartDetail.apt_detail_id))
            .where(
                ApartDetail.is_deleted == False,
                ApartDetail.geometry.isnot(None)
            )
        )
        with_geometry = with_geometry_count.scalar() or 0
        
        # 3. geometry가 없는 아파트 개수
        without_geometry = total - with_geometry
        
        # 4. 비율 계산
        ratio = (with_geometry / total * 100) if total > 0 else 0
        
        print("=" * 60)
        print(" 아파트 Geometry 데이터 통계")
        print("=" * 60)
        print(f"전체 아파트 상세 정보: {total:,}개")
        print(f"Geometry 있음: {with_geometry:,}개 ({ratio:.2f}%)")
        print(f"Geometry 없음: {without_geometry:,}개 ({100-ratio:.2f}%)")
        print("=" * 60)
        
        # 5. 샘플 확인: geometry가 있는 아파트 몇 개
        if with_geometry > 0:
            sample_query = await db.execute(
                select(ApartDetail.apt_id, ApartDetail.road_address)
                .where(
                    ApartDetail.is_deleted == False,
                    ApartDetail.geometry.isnot(None)
                )
                .limit(5)
            )
            samples = sample_query.all()
            
            print("\n Geometry가 있는 아파트 샘플 (최대 5개):")
            for apt_id, address in samples:
                print(f"  - apt_id: {apt_id}, 주소: {address}")
        
        # 6. 샘플 확인: geometry가 없는 아파트 몇 개
        if without_geometry > 0:
            sample_query = await db.execute(
                select(ApartDetail.apt_id, ApartDetail.road_address)
                .where(
                    ApartDetail.is_deleted == False,
                    ApartDetail.geometry.is_(None)
                )
                .limit(5)
            )
            samples = sample_query.all()
            
            print("\n Geometry가 없는 아파트 샘플 (최대 5개):")
            for apt_id, address in samples:
                print(f"  - apt_id: {apt_id}, 주소: {address}")
        
        # 7. 특정 아파트의 geometry 확인 (테스트용)
        print("\n" + "=" * 60)
        print(" 특정 아파트 Geometry 확인 (apt_id=1~10)")
        print("=" * 60)
        
        for apt_id in range(1, min(11, total + 1)):
            detail_query = await db.execute(
                select(ApartDetail.geometry, ApartDetail.road_address)
                .where(
                    ApartDetail.apt_id == apt_id,
                    ApartDetail.is_deleted == False
                )
                .limit(1)
            )
            result = detail_query.first()
            
            if result:
                has_geometry = result.geometry is not None
                status = " 있음" if has_geometry else " 없음"
                print(f"apt_id={apt_id}: {status} - {result.road_address}")
            else:
                print(f"apt_id={apt_id}: 아파트 상세 정보 없음")
        
        print("\n" + "=" * 60)
        print(" 권장사항:")
        if ratio < 50:
            print("  Geometry 데이터가 50% 미만입니다!")
            print("   → 주소 → 좌표 변환 프로세스를 확인하세요.")
            print("   → 데이터 수집 스크립트에서 geometry 추가를 확인하세요.")
        elif ratio < 80:
            print("  Geometry 데이터가 80% 미만입니다.")
            print("   → 누락된 geometry 데이터를 보완하는 것을 권장합니다.")
        else:
            print(" Geometry 데이터가 충분합니다.")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(check_geometry_data())
