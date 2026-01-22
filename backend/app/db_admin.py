#!/usr/bin/env python3
"""
데이터베이스 관리 CLI 도구

Docker 컨테이너에서 실행 가능한 데이터베이스 관리 명령어 도구입니다.

사용법:
    # Docker 컨테이너에서 실행 (대화형 모드 - 권장)
    docker exec -it realestate-backend python -m app.db_admin
    
    # 명령줄 모드 (하위 호환성)
    docker exec -it realestate-backend python -m app.db_admin list
    docker exec -it realestate-backend python -m app.db_admin backup
    docker exec -it realestate-backend python -m app.db_admin restore
"""
import asyncio
import sys
import argparse
import os
import csv
import traceback
import time
import subprocess
import random
import calendar
import numpy as np
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import text, select, insert, func, and_, or_
from sqlalchemy.ext.asyncio import create_async_engine

try:
    from tqdm import tqdm
    TQDM_AVAILABLE = True
except ImportError:
    TQDM_AVAILABLE = False
    # tqdm 없을 때 대체 클래스
    class DummyTqdm:
        """tqdm이 없을 때 사용하는 더미 클래스"""
        def __init__(self, iterable, **kwargs):
            self.iterable = iterable
            self.desc = kwargs.get('desc', '')
            self.unit = kwargs.get('unit', '')
            self.ncols = kwargs.get('ncols', 80)
            if self.desc:
                print(f"   {self.desc}...", flush=True)
        
        def __iter__(self):
            return iter(self.iterable)
        
        def __enter__(self):
            return self
        
        def __exit__(self, *args):
            return False
        
        def set_description(self, desc):
            """설명 변경 (무시)"""
            pass
        
        def set_postfix(self, **kwargs):
            """후위 정보 변경 (무시)"""
            pass
        
        def update(self, n=1):
            """진행률 업데이트 (무시)"""
            pass
    
    def tqdm(iterable, **kwargs):
        return DummyTqdm(iterable, **kwargs)

from app.core.config import settings
from app.models.apartment import Apartment
from app.models.state import State
from app.models.sale import Sale
from app.models.rent import Rent
from app.models.house_score import HouseScore


# ============================================================================
# 개선된 더미 데이터 생성을 위한 상수 및 헬퍼 함수
# ============================================================================

# 대한민국 일반적인 아파트 평형 분포 (전용면적 기준, ㎡)
COMMON_AREAS_KR = [
    (59, 0.15),   # 20평대: 15%
    (84, 0.40),   # 30평대: 40% (가장 흔함)
    (114, 0.25),  # 40평대: 25%
    (135, 0.15),  # 50평대: 15%
    (167, 0.05),  # 60평대 이상: 5%
]

# 월별 계절성 계수 (대한민국 부동산 시장 기준)
MONTHLY_SEASONALITY_KR = {
    1: 0.7,   # 1월: 비수기 (설 연휴)
    2: 0.6,   # 2월: 최대 비수기 (짧은 달)
    3: 1.5,   # 3월: 성수기 (이사철)
    4: 1.2,   # 4월: 준성수기
    5: 1.0,   # 5월: 평균
    6: 0.9,   # 6월: 준비수기
    7: 0.8,   # 7월: 비수기 (휴가철)
    8: 0.9,   # 8월: 비수기
    9: 1.4,   # 9월: 성수기 (가을 이사철)
    10: 1.1,  # 10월: 준성수기
    11: 0.9,  # 11월: 준비수기
    12: 0.8   # 12월: 비수기 (연말)
}

# 실제 부동산 가격 변동 이벤트 (대한민국 2020~2025년)
PRICE_EVENTS_KR = [
    (202001, 1.00),  # 2020년 1월 기준
    (202007, 1.12),  # 코로나 부양책으로 가격 상승
    (202103, 1.22),  # LTV/DTI 완화
    (202109, 1.32),  # 전세가 급등
    (202203, 1.42),  # 금리 상승 전 최고점
    (202206, 1.38),  # 금리 인상 시작으로 조정
    (202209, 1.30),  # 금리 추가 인상, 하락세
    (202303, 1.26),  # 침체기
    (202306, 1.28),  # 소폭 반등
    (202309, 1.32),  # 회복 조짐
    (202403, 1.38),  # 안정화
    (202409, 1.45),  # 완만한 상승
    (202412, 1.50),  # 연말 회복
    (202501, 1.55),  # 2025년 현재
]

# 대한민국 세부 지역별 가격 계수 (전국 평균 대비)
REGION_PRICE_MULTIPLIERS_KR = {
    # 서울 (구별)
    "서울특별시 강남구": 2.8,
    "서울특별시 서초구": 2.6,
    "서울특별시 송파구": 2.3,
    "서울특별시 용산구": 2.2,
    "서울특별시 성동구": 2.0,
    "서울특별시 광진구": 1.9,
    "서울특별시 마포구": 2.0,
    "서울특별시 영등포구": 1.9,
    "서울특별시 강동구": 1.8,
    "서울특별시 동작구": 1.8,
    "서울특별시 양천구": 1.8,
    "서울특별시 종로구": 2.1,
    "서울특별시 중구": 1.9,
    "서울특별시 강서구": 1.7,
    "서울특별시 구로구": 1.6,
    "서울특별시 노원구": 1.5,
    "서울특별시 은평구": 1.5,
    "서울특별시 도봉구": 1.4,
    "서울특별시 강북구": 1.3,
    "서울특별시 관악구": 1.4,
    "서울특별시 금천구": 1.5,
    "서울특별시": 1.7,  # 서울 기타
    
    # 경기 (시/구별)
    "경기도 성남시 분당구": 2.3,
    "경기도 성남시 수정구": 1.7,
    "경기도 성남시 중원구": 1.6,
    "경기도 용인시 수지구": 2.0,
    "경기도 용인시 기흥구": 1.7,
    "경기도 용인시 처인구": 1.4,
    "경기도 과천시": 2.4,
    "경기도 광명시": 1.9,
    "경기도 하남시": 1.9,
    "경기도 고양시 일산서구": 1.8,
    "경기도 고양시 일산동구": 1.7,
    "경기도 고양시 덕양구": 1.5,
    "경기도 수원시 영통구": 1.7,
    "경기도 수원시 장안구": 1.5,
    "경기도 수원시": 1.6,
    "경기도 안양시 동안구": 1.7,
    "경기도 안양시 만안구": 1.6,
    "경기도 안양시": 1.65,
    "경기도 부천시": 1.6,
    "경기도 화성시": 1.4,
    "경기도 평택시": 1.2,
    "경기도": 1.3,  # 경기 기타
    
    # 인천
    "인천광역시 연수구": 1.6,
    "인천광역시 남동구": 1.5,
    "인천광역시 서구": 1.4,
    "인천광역시": 1.4,
    
    # 부산
    "부산광역시 해운대구": 1.5,
    "부산광역시 수영구": 1.4,
    "부산광역시 남구": 1.3,
    "부산광역시": 1.2,
    
    # 대구
    "대구광역시 수성구": 1.4,
    "대구광역시 달서구": 1.1,
    "대구광역시": 1.0,
    
    # 기타 광역시
    "대전광역시 유성구": 1.1,
    "대전광역시": 1.0,
    "광주광역시": 0.95,
    "울산광역시": 1.0,
    
    # 세종
    "세종특별자치시": 1.3,
    
    # 기타
    "default": 0.6
}

# 더미 데이터 식별자
DUMMY_MARKER = "더미"  # 명시적 식별자로 변경


def get_realistic_area_kr() -> float:
    """대한민국 실제 아파트 평형 분포 기반 전용면적 (㎡)"""
    areas, weights = zip(*COMMON_AREAS_KR)
    base_area = random.choices(areas, weights=weights)[0]
    # ±3㎡ 오차 (같은 평형도 약간씩 다름)
    return round(base_area + random.uniform(-3, 3), 2)


def get_monthly_transaction_count_kr(month: int) -> int:
    """월별 예상 거래 건수 (계절성 + 푸아송 분포)"""
    seasonality = MONTHLY_SEASONALITY_KR.get(month, 1.0)
    # 기본 평균 2건, 계절성 반영
    lambda_param = 2.0 * seasonality
    count = int(np.random.poisson(lambda_param))
    # 최소 0건, 최대 10건
    return max(0, min(count, 10))


def get_price_multiplier_with_events_kr(year: int, month: int) -> float:
    """이벤트 기반 가격 승수 (실제 대한민국 부동산 시장 반영)"""
    target_ym = year * 100 + month
    
    # 범위 밖이면 가장 가까운 값 사용
    if target_ym <= PRICE_EVENTS_KR[0][0]:
        return PRICE_EVENTS_KR[0][1]
    if target_ym >= PRICE_EVENTS_KR[-1][0]:
        return PRICE_EVENTS_KR[-1][1]
    
    # 해당 시점의 전후 이벤트 찾아서 선형 보간
    for i in range(len(PRICE_EVENTS_KR) - 1):
        if PRICE_EVENTS_KR[i][0] <= target_ym <= PRICE_EVENTS_KR[i+1][0]:
            ym1, rate1 = PRICE_EVENTS_KR[i]
            ym2, rate2 = PRICE_EVENTS_KR[i+1]
            
            # 월 수 계산
            months1 = (ym1 // 100) * 12 + (ym1 % 100)
            months2 = (ym2 // 100) * 12 + (ym2 % 100)
            months_target = (target_ym // 100) * 12 + (target_ym % 100)
            
            months_diff = months2 - months1
            if months_diff == 0:
                return rate1
            
            # 선형 보간
            progress = (months_target - months1) / months_diff
            return rate1 + (rate2 - rate1) * progress
    
    return 1.0


def get_detailed_region_multiplier_kr(city_name: str, region_name: str) -> float:
    """대한민국 세부 지역 기반 가격 계수"""
    city_name = city_name or ""
    region_name = region_name or ""
    
    # 1순위: 시/도 + 구/군까지 매칭
    full_key = f"{city_name} {region_name}".strip()
    if full_key in REGION_PRICE_MULTIPLIERS_KR:
        return REGION_PRICE_MULTIPLIERS_KR[full_key]
    
    # 2순위: 시/도만 매칭
    if city_name in REGION_PRICE_MULTIPLIERS_KR:
        return REGION_PRICE_MULTIPLIERS_KR[city_name]
    
    # 3순위: 상위 시/도 추출 (예: "경기도 성남시" → "경기도")
    for key in REGION_PRICE_MULTIPLIERS_KR.keys():
        if city_name.startswith(key):
            return REGION_PRICE_MULTIPLIERS_KR[key]
    
    # 4순위: 기본값
    return REGION_PRICE_MULTIPLIERS_KR["default"]


def get_realistic_floor(max_floor: int) -> int:
    """현실적인 층수 선택 (저층/고층 프리미엄 반영)"""
    if max_floor <= 5:
        return random.randint(1, max_floor)
    
    # 15% 확률로 저층 (1~3층) - 단독 주택 느낌 선호
    if random.random() < 0.15:
        return random.randint(1, min(3, max_floor))
    # 25% 확률로 고층 (상위 20%) - 조망권 선호
    elif random.random() < 0.25:
        threshold = max(int(max_floor * 0.8), 1)
        return random.randint(threshold, max_floor)
    # 60% 확률로 중층
    else:
        low = min(4, max_floor)
        high = max(int(max_floor * 0.8), low)
        return random.randint(low, high)


def get_price_variation_normal() -> float:
    """가격 변동폭 (정규분포 기반, ±10% 범위)"""
    # 평균 1.0, 표준편차 0.04 → 대부분 0.88~1.12 범위
    variation = np.random.normal(1.0, 0.04)
    # 극단값 제한 (0.85~1.15)
    return np.clip(variation, 0.85, 1.15)


def get_realistic_sale_type_kr(year: int) -> str:
    """현실적인 매매 유형 (대한민국, 시기별 가중치)"""
    if year <= 2021:
        # 2021년 이전: 일반 매매 위주
        weights = [0.85, 0.10, 0.05]
    else:
        # 2022년 이후: 전매/분양권 증가
        weights = [0.70, 0.20, 0.10]
    
    types = ["매매", "전매", "분양권전매"]
    return random.choices(types, weights=weights)[0]


def get_realistic_contract_type_kr(year: int) -> bool:
    """현실적인 계약 유형 (갱신 여부, 대한민국)"""
    if year >= 2020:
        # 2020년 이후: 전월세 2년 계약 일반화 → 갱신 증가
        return random.random() < 0.55  # 55% 갱신
    else:
        return random.random() < 0.35  # 35% 갱신


def get_dummy_remarks() -> str:
    """더미 데이터 식별자 반환"""
    return DUMMY_MARKER


async def get_house_score_multipliers(conn, region_ids: List[int]) -> dict:
    """
    house_scores 테이블에서 실제 주택가격지수를 가져와서 시간에 따른 승수 계산
    
    Returns:
        dict: {(region_id, YYYYMM): multiplier} 형태
        multiplier는 2017.11=100 기준으로 정규화된 값
    """
    # house_scores 테이블에서 APT 지수 조회
    stmt = (
        select(
            HouseScore.region_id,
            HouseScore.base_ym,
            HouseScore.index_value
        )
        .where(
            and_(
                HouseScore.region_id.in_(region_ids),
                HouseScore.index_type == "APT",
                (HouseScore.is_deleted == False) | (HouseScore.is_deleted.is_(None))
            )
        )
        .order_by(HouseScore.base_ym)
    )
    
    result = await conn.execute(stmt)
    rows = result.fetchall()
    
    if not rows:
        return {}
    
    # {(region_id, YYYYMM): multiplier}
    score_multipliers = {}
    
    # 기준값 (2017.11 = 100)을 1.0으로 정규화
    BASE_INDEX = 100.0
    
    for row in rows:
        region_id, base_ym, index_value = row
        # index_value가 100이면 1.0, 150이면 1.5
        multiplier = float(index_value) / BASE_INDEX
        score_multipliers[(region_id, base_ym)] = multiplier
    
    return score_multipliers


async def get_apartment_real_area_distribution(conn, apt_id: int) -> List[float]:
    """
    특정 아파트의 실제 거래 데이터에서 전용면적 분포 추출
    
    Returns:
        List[float]: 실제 거래된 전용면적 리스트 (빈 리스트 가능)
    """
    # 매매 데이터에서 전용면적 추출
    sale_stmt = (
        select(Sale.exclusive_area)
        .where(
            and_(
                Sale.apt_id == apt_id,
                Sale.exclusive_area > 0,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                or_(Sale.remarks != DUMMY_MARKER, Sale.remarks.is_(None))  # 더미 제외
            )
        )
        .limit(100)  # 최대 100건
    )
    
    result = await conn.execute(sale_stmt)
    sale_areas = [float(row[0]) for row in result.fetchall()]
    
    # 전월세 데이터에서 전용면적 추출
    rent_stmt = (
        select(Rent.exclusive_area)
        .where(
            and_(
                Rent.apt_id == apt_id,
                Rent.exclusive_area > 0,
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                or_(Rent.remarks != DUMMY_MARKER, Rent.remarks.is_(None))  # 더미 제외
            )
        )
        .limit(100)
    )
    
    result = await conn.execute(rent_stmt)
    rent_areas = [float(row[0]) for row in result.fetchall()]
    
    # 중복 제거 및 정렬
    all_areas = list(set(sale_areas + rent_areas))
    return sorted(all_areas) if all_areas else []


async def get_apartment_real_floor_distribution(conn, apt_id: int) -> List[int]:
    """
    특정 아파트의 실제 거래 데이터에서 층수 분포 추출
    
    Returns:
        List[int]: 실제 거래된 층수 리스트 (빈 리스트 가능)
    """
    # 매매 데이터에서 층수 추출
    sale_stmt = (
        select(Sale.floor)
        .where(
            and_(
                Sale.apt_id == apt_id,
                Sale.floor > 0,
                (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                or_(Sale.remarks != DUMMY_MARKER, Sale.remarks.is_(None))
            )
        )
        .limit(100)
    )
    
    result = await conn.execute(sale_stmt)
    sale_floors = [int(row[0]) for row in result.fetchall()]
    
    # 전월세 데이터에서 층수 추출
    rent_stmt = (
        select(Rent.floor)
        .where(
            and_(
                Rent.apt_id == apt_id,
                Rent.floor > 0,
                (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                or_(Rent.remarks != DUMMY_MARKER, Rent.remarks.is_(None))
            )
        )
        .limit(100)
    )
    
    result = await conn.execute(rent_stmt)
    rent_floors = [int(row[0]) for row in result.fetchall()]
    
    # 중복 제거 및 정렬
    all_floors = list(set(sale_floors + rent_floors))
    return sorted(all_floors) if all_floors else []


def select_realistic_area_from_distribution(area_distribution: List[float]) -> float:
    """실제 분포에서 전용면적 선택 (약간의 변동 추가)"""
    if not area_distribution:
        return get_realistic_area_kr()
    
    # 실제 분포에서 랜덤 선택
    base_area = random.choice(area_distribution)
    # ±2㎡ 변동 (같은 평형도 약간씩 다름)
    return round(base_area + random.uniform(-2, 2), 2)


def select_realistic_floor_from_distribution(floor_distribution: List[int]) -> int:
    """실제 분포에서 층수 선택"""
    if not floor_distribution:
        return get_realistic_floor(30)  # 기본값
    
    # 실제 분포에서 랜덤 선택
    return random.choice(floor_distribution)


class DatabaseAdmin:
    """
    데이터베이스 관리 클래스
    
    테이블 조회, 삭제, 데이터 삭제, 백업, 복원 등의 기능을 제공합니다.
    """
    
    def __init__(self):
        """초기화"""
        self.engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            pool_pre_ping=True,
            pool_recycle=3600
        )
        self.backup_dir = Path("/app/backups")
        # 백업 디렉토리가 없으면 생성 (컨테이너 내부)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        # 디렉토리 쓰기 권한 확인
        if not os.access(self.backup_dir, os.W_OK):
            print(f"⚠️  경고: 백업 디렉토리에 쓰기 권한이 없습니다: {self.backup_dir}")
        else:
            print(f"✅ 백업 디렉토리 확인: {self.backup_dir}")
    
    async def close(self):
        """엔진 종료"""
        await self.engine.dispose()
    
    async def list_tables(self) -> List[str]:
        """모든 테이블 목록 조회"""
        async with self.engine.begin() as conn:
            result = await conn.execute(text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename
            """))
            tables = [row[0] for row in result.fetchall()]
            # spatial_ref_sys는 PostGIS 시스템 테이블이므로 제외
            return [t for t in tables if t != 'spatial_ref_sys']
    
    async def get_table_info(self, table_name: str) -> dict:
        """테이블 정보 조회"""
        async with self.engine.begin() as conn:
            count_result = await conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
            row_count = count_result.scalar()
            
            columns_result = await conn.execute(text("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = :table_name
                ORDER BY ordinal_position
            """).bindparams(table_name=table_name))
            
            columns = []
            for row in columns_result.fetchall():
                columns.append({
                    "name": row[0], "type": row[1],
                    "nullable": row[2] == "YES", "default": row[3]
                })
            
            return {
                "table_name": table_name,
                "row_count": row_count,
                "column_count": len(columns),
                "columns": columns
            }
    
    async def truncate_table(self, table_name: str, confirm: bool = False) -> bool:
        """테이블 데이터 삭제"""
        if not confirm:
            print(f"⚠️  경고: '{table_name}' 테이블의 모든 데이터가 삭제됩니다!")
            if input("계속하시겠습니까? (yes/no): ").lower() != "yes":
                return False
        
        try:
            async with self.engine.begin() as conn:
                await conn.execute(text(f'TRUNCATE TABLE "{table_name}" RESTART IDENTITY CASCADE'))
            print(f"✅ '{table_name}' 테이블의 모든 데이터가 삭제되었습니다.")
            return True
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
            return False
    
    async def drop_table(self, table_name: str, confirm: bool = False) -> bool:
        """테이블 삭제"""
        if not confirm:
            print(f"⚠️  경고: '{table_name}' 테이블이 완전히 삭제됩니다!")
            if input("계속하시겠습니까? (yes/no): ").lower() != "yes":
                return False
        
        try:
            async with self.engine.begin() as conn:
                await conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))
            print(f"✅ '{table_name}' 테이블이 삭제되었습니다.")
            return True
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
            return False

    async def backup_table(self, table_name: str, show_progress: bool = True) -> bool:
        """테이블을 CSV로 백업 (tqdm 진행 표시 포함)"""
        file_path = self.backup_dir / f"{table_name}.csv"
        try:
            # 디렉토리 확인
            if not self.backup_dir.exists():
                self.backup_dir.mkdir(parents=True, exist_ok=True)
            
            # 먼저 총 행 수 확인
            async with self.engine.begin() as conn:
                count_result = await conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
                total_rows = count_result.scalar() or 0
            
            if show_progress:
                print(f"   💾 '{table_name}' 백업 중... ({total_rows:,}개 행)")
            
            # asyncpg connection을 직접 사용하여 COPY 명령 실행
            async with self.engine.connect() as conn:
                raw_conn = await conn.get_raw_connection()
                pg_conn = raw_conn.driver_connection
                
                try:
                    # 방법 1: copy_from_query 사용 (빠름)
                    with open(file_path, 'wb') as f:
                        await pg_conn.copy_from_query(
                            f'SELECT * FROM "{table_name}"',
                            output=f,
                            format='csv',
                            header=True
                        )
                        f.flush()
                        os.fsync(f.fileno())
                except Exception as copy_error:
                    # 방법 2: copy_from_query 실패 시 일반 SELECT로 대체 (tqdm 포함)
                    if show_progress:
                        print(f"      ⚠️  copy_from_query 실패, 일반 SELECT 방식으로 시도...")
                    result = await conn.execute(text(f'SELECT * FROM "{table_name}"'))
                    rows = result.fetchall()
                    columns = result.keys()
                    
                    with open(file_path, 'w', encoding='utf-8', newline='') as f:
                        writer = csv.writer(f)
                        writer.writerow(columns)
                        
                        # tqdm 진행 표시
                        for row in tqdm(rows, desc=f"      {table_name}", unit="rows", ncols=80):
                            writer.writerow(row)
                        
                        f.flush()
                        os.fsync(f.fileno())
            
            time.sleep(0.1)
            
            # 파일 생성 확인
            if file_path.exists() and file_path.stat().st_size > 0:
                file_size = file_path.stat().st_size
                if show_progress:
                    print(f"      ✅ 완료! -> {file_path.name} ({file_size:,} bytes)")
                return True
            else:
                if show_progress:
                    print(f"      ❌ 실패! 파일이 생성되지 않았거나 비어있습니다.")
                if file_path.exists():
                    file_path.unlink()
                return False
                
        except Exception as e:
            print(f"      ❌ 실패! ({str(e)})")
            print(f"      상세 오류:\n{traceback.format_exc()}")
            return False

    async def restore_table(self, table_name: str, confirm: bool = False) -> bool:
        """CSV에서 테이블 복원 (tqdm 진행 표시 포함)"""
        file_path = self.backup_dir / f"{table_name}.csv"
        if not file_path.exists():
            print(f"❌ 백업 파일을 찾을 수 없습니다: {file_path}")
            return False
            
        if not confirm:
            print(f"⚠️  경고: '{table_name}' 테이블의 기존 데이터가 모두 삭제되고 백업 데이터로 덮어씌워집니다!")
            if input("계속하시겠습니까? (yes/no): ").lower() != "yes":
                return False

        try:
            # 1. 기존 데이터 삭제
            await self.truncate_table(table_name, confirm=True)
            
            # 2. 데이터 복원 - 모든 테이블에 대해 일반화된 복원 사용
            print(f"   ♻️ '{table_name}' 복원 중...")
            await self._restore_table_with_progress(table_name, file_path)
            
            # 3. Sequence 동기화 (autoincrement primary key를 사용하는 모든 테이블)
            sequence_map = {
                'sales': ('sales_trans_id_seq', 'trans_id'),
                'rents': ('rents_trans_id_seq', 'trans_id'),
                'house_scores': ('house_scores_index_id_seq', 'index_id'),
                'house_volumes': ('house_volumes_volume_id_seq', 'volume_id'),
                'apartments': ('apartments_apt_id_seq', 'apt_id'),
                'apart_details': ('apart_details_apt_detail_id_seq', 'apt_detail_id'),
                'states': ('states_region_id_seq', 'region_id'),
                'accounts': ('accounts_account_id_seq', 'account_id'),
                'favorite_locations': ('favorite_locations_favorite_id_seq', 'favorite_id'),
                'favorite_apartments': ('favorite_apartments_favorite_id_seq', 'favorite_id'),
                'my_properties': ('my_properties_property_id_seq', 'property_id'),
                'recent_searches': ('recent_searches_search_id_seq', 'search_id'),
                'recent_views': ('recent_views_view_id_seq', 'view_id')
            }
            
            if table_name in sequence_map:
                sequence_name, id_column = sequence_map[table_name]
                
                print(f"   🔄 Sequence 동기화 중 ({sequence_name})...", end="", flush=True)
                async with self.engine.begin() as conn:
                    max_id_result = await conn.execute(
                        text(f'SELECT COALESCE(MAX({id_column}), 0) FROM "{table_name}"')
                    )
                    max_id = max_id_result.scalar() or 0
                    
                    await conn.execute(
                        text(f"SELECT setval(:seq_name, :max_val + 1, false)").bindparams(
                            seq_name=sequence_name,
                            max_val=max_id
                        )
                    )
                    
                    seq_value_result = await conn.execute(
                        text(f"SELECT last_value FROM {sequence_name}")
                    )
                    seq_value = seq_value_result.scalar()
                    print(f" 완료! (최대 ID: {max_id}, Sequence: {seq_value})")
            
            print(f"   ✅ '{table_name}' 복원 완료!")
            return True
        except Exception as e:
            print(f" 실패! ({str(e)})")
            traceback.print_exc()
            return False
    
    async def _restore_table_with_progress(self, table_name: str, file_path: Path) -> None:
        """일반화된 테이블 복원 (tqdm 진행 표시, 타입 변환 포함)"""
        # 테이블별 컬럼 타입 정의
        column_types = self._get_column_types(table_name)
        
        # CSV 파일 행 수 계산 (진행률 표시용)
        total_rows = 0
        with open(file_path, 'r', encoding='utf-8', newline='') as f:
            total_rows = sum(1 for _ in f) - 1  # 헤더 제외
        
        if total_rows == 0:
            print(f"      ⚠️ '{table_name}' 백업 파일이 비어 있습니다.")
            return
        
        print(f"      📊 총 {total_rows:,}개 행 복원 예정")
        
        # 배치 크기 설정
        batch_size = 5000
        inserted_count = 0
        
        async with self.engine.begin() as conn:
            with open(file_path, 'r', encoding='utf-8', newline='') as f:
                reader = csv.DictReader(f)
                batch = []
                
                # tqdm 진행 표시
                pbar = tqdm(
                    reader,
                    total=total_rows,
                    desc=f"      {table_name}",
                    unit="rows",
                    ncols=80
                )
                
                for row in pbar:
                    # 행 데이터 타입 변환
                    processed_row = self._process_row(row, column_types)
                    batch.append(processed_row)
                    
                    # 배치 크기에 도달하면 삽입
                    if len(batch) >= batch_size:
                        await self._insert_batch(conn, table_name, batch)
                        inserted_count += len(batch)
                        pbar.set_postfix({"inserted": f"{inserted_count:,}"})
                        batch = []
                
                # 남은 배치 삽입
                if batch:
                    await self._insert_batch(conn, table_name, batch)
                    inserted_count += len(batch)
        
        print(f"      ✅ {inserted_count:,}개 행 삽입 완료")
    
    def _get_column_types(self, table_name: str) -> Dict[str, str]:
        """테이블별 컬럼 타입 정의"""
        # 공통 타입
        common_types = {
            'created_at': 'timestamp',
            'updated_at': 'timestamp',
            'is_deleted': 'boolean',
        }
        
        table_specific_types = {
            'accounts': {
                'account_id': 'integer',
                'is_admin': 'boolean',
                'is_dark_mode': 'boolean',
            },
            'sales': {
                'trans_id': 'integer',
                'apt_id': 'integer',
                'trans_price': 'integer',
                'floor': 'integer',
                'is_canceled': 'boolean',
                'exclusive_area': 'decimal',
                'contract_date': 'date',
                'cancel_date': 'date',
            },
            'rents': {
                'trans_id': 'integer',
                'apt_id': 'integer',
                'deposit_price': 'integer',
                'monthly_rent': 'integer',
                'floor': 'integer',
                'exclusive_area': 'decimal',
                'deal_date': 'date',
                'contract_date': 'date',
                'contract_type': 'boolean',
                'rent_type': 'string',  # 신규: JEONSE, MONTHLY_RENT
            },
            'apartments': {
                'apt_id': 'integer',
                'region_id': 'integer',
                'latitude': 'decimal',
                'longitude': 'decimal',
                'apt_seq': 'string',  # 신규: 매매/전월세 API의 aptSeq
            },
            'apart_details': {
                'apt_detail_id': 'integer',
                'apt_id': 'integer',
                'total_household_cnt': 'integer',
                'total_building_cnt': 'integer',
                'highest_floor': 'integer',
                'use_approval_date': 'date',
                'total_parking_cnt': 'integer',
                'jibun_bonbun': 'string',  # 신규: 지번 본번
                'jibun_bubun': 'string',  # 신규: 지번 부번
            },
            'states': {
                'region_id': 'integer',
            },
            'house_scores': {
                'index_id': 'integer',
                'region_id': 'integer',
                'index_value': 'decimal',
                'index_change_rate': 'decimal',
            },
            'house_volumes': {
                'volume_id': 'integer',
                'region_id': 'integer',
                'sale_volume': 'integer',
                'rent_volume': 'integer',
                'total_volume': 'integer',
            },
            'favorite_locations': {
                'favorite_id': 'integer',
                'account_id': 'integer',
                'region_id': 'integer',
            },
            'favorite_apartments': {
                'favorite_id': 'integer',
                'account_id': 'integer',
                'apt_id': 'integer',
            },
            'my_properties': {
                'property_id': 'integer',
                'account_id': 'integer',
                'apt_id': 'integer',
                'exclusive_area': 'decimal',
                'current_market_price': 'integer',
                'risk_checked_at': 'timestamp',
            },
            'recent_searches': {
                'search_id': 'integer',
                'account_id': 'integer',
            },
            'recent_views': {
                'view_id': 'integer',
                'account_id': 'integer',
                'apt_id': 'integer',
                'viewed_at': 'timestamp',
            },
            'population_movements': {
                'movement_id': 'integer',
                'region_id': 'integer',
                'in_migration': 'integer',
                'out_migration': 'integer',
                'net_migration': 'integer',
            },
        }
        
        # 공통 타입과 테이블별 타입 병합
        result = common_types.copy()
        if table_name in table_specific_types:
            result.update(table_specific_types[table_name])
        return result
    
    def _process_row(self, row: Dict[str, str], column_types: Dict[str, str]) -> Dict[str, Any]:
        """CSV 행 데이터를 적절한 타입으로 변환"""
        processed = {}
        for key, value in row.items():
            # 빈 문자열은 None으로 변환
            if value == '' or value is None:
                processed[key] = None
                continue
            
            col_type = column_types.get(key, 'string')
            
            try:
                if col_type == 'integer':
                    processed[key] = int(value)
                elif col_type == 'decimal':
                    processed[key] = float(value)
                elif col_type == 'boolean':
                    if value.lower() in ('t', 'true', '1'):
                        processed[key] = True
                    elif value.lower() in ('f', 'false', '0'):
                        processed[key] = False
                    else:
                        processed[key] = None
                elif col_type == 'date':
                    # 날짜 문자열을 date 객체로 변환
                    try:
                        if isinstance(value, str) and value.strip():
                            value = value.strip()
                            # 'YYYY-MM-DD' 형식 파싱
                            if '-' in value:
                                parts = value.split('-')
                                if len(parts) == 3:
                                    year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                                    processed[key] = date(year, month, day)
                                else:
                                    processed[key] = None
                            else:
                                # 다른 형식 시도
                                processed[key] = None
                        elif isinstance(value, date):
                            # 이미 date 객체인 경우
                            processed[key] = value
                        else:
                            processed[key] = None
                    except (ValueError, TypeError, AttributeError) as e:
                        processed[key] = None
                elif col_type == 'timestamp':
                    # timestamp 문자열을 datetime 객체로 변환
                    try:
                        if isinstance(value, str) and value.strip():
                            value = value.strip()
                            # 'YYYY-MM-DD HH:MM:SS' 또는 'YYYY-MM-DD HH:MM:SS.microseconds' 형식 파싱
                            if ' ' in value:
                                date_part, time_part = value.split(' ', 1)
                                date_parts = date_part.split('-')
                                if len(date_parts) == 3:
                                    year, month, day = int(date_parts[0]), int(date_parts[1]), int(date_parts[2])
                                    
                                    # 시간 부분 파싱
                                    if '.' in time_part:
                                        time_str, microseconds_str = time_part.split('.')
                                        microseconds = int(microseconds_str[:6].ljust(6, '0'))  # 최대 6자리
                                    else:
                                        time_str = time_part
                                        microseconds = 0
                                    
                                    time_parts = time_str.split(':')
                                    if len(time_parts) >= 3:
                                        hour, minute, second = int(time_parts[0]), int(time_parts[1]), int(time_parts[2])
                                        processed[key] = datetime(year, month, day, hour, minute, second, microseconds)
                                    else:
                                        processed[key] = None
                                else:
                                    processed[key] = None
                            else:
                                # 날짜만 있는 경우
                                if '-' in value:
                                    parts = value.split('-')
                                    if len(parts) == 3:
                                        year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                                        processed[key] = datetime(year, month, day)
                                    else:
                                        processed[key] = None
                                else:
                                    processed[key] = None
                        elif isinstance(value, datetime):
                            # 이미 datetime 객체인 경우
                            processed[key] = value
                        elif isinstance(value, date):
                            # date 객체를 datetime으로 변환
                            processed[key] = datetime.combine(value, datetime.min.time())
                        else:
                            processed[key] = None
                    except (ValueError, TypeError, AttributeError) as e:
                        processed[key] = None
                else:
                    processed[key] = value  # 문자열
            except (ValueError, TypeError):
                processed[key] = None
        
        return processed
    
    async def _insert_batch(self, conn, table_name: str, batch: List[Dict[str, Any]]) -> None:
        """배치 데이터를 DB에 삽입 (날짜 객체 자동 처리)"""
        if not batch:
            return
        
        # 컬럼명 추출 (첫 번째 행 기준)
        columns = list(batch[0].keys())
        columns_str = ', '.join([f'"{col}"' for col in columns])
        
        # 각 행에 대해 개별 INSERT 생성
        # SQLAlchemy가 date 객체를 자동으로 처리해줌
        for row in batch:
            placeholders = []
            params = {}
            
            for i, col in enumerate(columns):
                val = row.get(col)
                param_name = f"p{i}"
                
                if val is None:
                    placeholders.append("NULL")
                else:
                    placeholders.append(f":{param_name}")
                    # date 객체는 그대로 전달 (SQLAlchemy가 자동 변환)
                    params[param_name] = val
            
            placeholders_str = ', '.join(placeholders)
            stmt = text(f'INSERT INTO "{table_name}" ({columns_str}) VALUES ({placeholders_str})')
            await conn.execute(stmt, params)

    async def backup_dummy_data(self) -> bool:
        """더미 데이터만 백업 (sales와 rents 테이블의 remarks='더미'인 데이터)"""
        print(f"\n📦 더미 데이터 백업 시작 (저장 경로: {self.backup_dir})")
        print("=" * 60)
        
        try:
            async with self.engine.connect() as conn:
                raw_conn = await conn.get_raw_connection()
                pg_conn = raw_conn.driver_connection
                
                # 1. 매매 더미 데이터 백업
                sales_file = self.backup_dir / "sales_dummy.csv"
                print(f"   💾 매매 더미 데이터 백업 중...", end="", flush=True)
                try:
                    with open(sales_file, 'wb') as f:
                        await pg_conn.copy_from_query(
                            f"SELECT * FROM sales WHERE remarks = '{DUMMY_MARKER}'",
                            output=f,
                            format='csv',
                            header=True
                        )
                        f.flush()
                        os.fsync(f.fileno())
                    file_size = sales_file.stat().st_size if sales_file.exists() else 0
                    print(f" 완료! -> {sales_file} ({file_size:,} bytes)")
                except Exception as e:
                    print(f" 실패! ({str(e)})")
                    # 일반 SELECT 방식으로 대체
                    result = await conn.execute(text(f"SELECT * FROM sales WHERE remarks = :marker").bindparams(marker=DUMMY_MARKER))
                    rows = result.fetchall()
                    columns = result.keys()
                    with open(sales_file, 'w', encoding='utf-8', newline='') as f:
                        writer = csv.writer(f)
                        writer.writerow(columns)
                        for row in rows:
                            writer.writerow(row)
                        f.flush()
                        os.fsync(f.fileno())
                    file_size = sales_file.stat().st_size if sales_file.exists() else 0
                    print(f" 완료! -> {sales_file} ({file_size:,} bytes)")
                
                # 2. 전월세 더미 데이터 백업
                rents_file = self.backup_dir / "rents_dummy.csv"
                print(f"   💾 전월세 더미 데이터 백업 중...", end="", flush=True)
                try:
                    with open(rents_file, 'wb') as f:
                        await pg_conn.copy_from_query(
                            f"SELECT * FROM rents WHERE remarks = '{DUMMY_MARKER}'",
                            output=f,
                            format='csv',
                            header=True
                        )
                        f.flush()
                        os.fsync(f.fileno())
                    file_size = rents_file.stat().st_size if rents_file.exists() else 0
                    print(f" 완료! -> {rents_file} ({file_size:,} bytes)")
                except Exception as e:
                    print(f" 실패! ({str(e)})")
                    # 일반 SELECT 방식으로 대체
                    result = await conn.execute(text(f"SELECT * FROM rents WHERE remarks = :marker").bindparams(marker=DUMMY_MARKER))
                    rows = result.fetchall()
                    columns = result.keys()
                    with open(rents_file, 'w', encoding='utf-8', newline='') as f:
                        writer = csv.writer(f)
                        writer.writerow(columns)
                        for row in rows:
                            writer.writerow(row)
                        f.flush()
                        os.fsync(f.fileno())
                    file_size = rents_file.stat().st_size if rents_file.exists() else 0
                    print(f" 완료! -> {rents_file} ({file_size:,} bytes)")
                
                # 3. 통계 출력
                sales_count = await conn.execute(text(f"SELECT COUNT(*) FROM sales WHERE remarks = :marker").bindparams(marker=DUMMY_MARKER))
                rents_count = await conn.execute(text(f"SELECT COUNT(*) FROM rents WHERE remarks = :marker").bindparams(marker=DUMMY_MARKER))
                sales_total = sales_count.scalar() or 0
                rents_total = rents_count.scalar() or 0
                
                print("=" * 60)
                print(f"✅ 더미 데이터 백업 완료!")
                print(f"   - 매매 더미 데이터: {sales_total:,}개 -> {sales_file.name}")
                print(f"   - 전월세 더미 데이터: {rents_total:,}개 -> {rents_file.name}")
                print(f"   📁 백업 위치: {self.backup_dir} (로컬: ./db_backup)")
                return True
                
        except Exception as e:
            print(f"❌ 더미 데이터 백업 중 오류 발생: {e}")
            import traceback
            print(traceback.format_exc())
            return False

    async def backup_all(self):
        """모든 테이블 백업 (tqdm 진행 표시 포함)"""
        print(f"\n📦 전체 데이터베이스 백업 시작 (저장 경로: {self.backup_dir})")
        print("=" * 60)
        tables = await self.list_tables()
        success_count = 0
        failed_tables = []
        
        # tqdm 진행 표시
        print(f"\n📋 총 {len(tables)}개 테이블 백업 시작\n")
        pbar = tqdm(tables, desc="전체 백업 진행", unit="table", ncols=80)
        
        for table in pbar:
            pbar.set_description(f"백업: {table}")
            if await self.backup_table(table, show_progress=True):
                success_count += 1
            else:
                failed_tables.append(table)
        
        # 백업 완료 후 파일 목록 확인
        print("\n" + "=" * 60)
        print(f"✅ 백업 완료: {success_count}/{len(tables)}개 테이블")
        
        if failed_tables:
            print(f"❌ 실패한 테이블: {', '.join(failed_tables)}")
        
        print(f"\n📁 백업된 파일 목록:")
        backup_files = list(self.backup_dir.glob("*.csv"))
        if backup_files:
            total_size = 0
            for backup_file in sorted(backup_files):
                file_size = backup_file.stat().st_size
                total_size += file_size
                print(f"   - {backup_file.name} ({file_size:,} bytes)")
            print(f"\n   📊 총 백업 크기: {total_size:,} bytes ({total_size / 1024 / 1024:.2f} MB)")
            print(f"💡 로컬 경로 확인: ./db_backup 폴더에 파일이 동기화되었는지 확인하세요.")
        else:
            print("   ⚠️  백업 파일을 찾을 수 없습니다!")

    async def restore_all(self, confirm: bool = False):
        """모든 테이블 복원 (tqdm 진행 표시 포함)"""
        print(f"\n♻️ 전체 데이터베이스 복원 시작 (원본 경로: {self.backup_dir})")
        print("=" * 60)
        
        if not confirm:
            print("⚠️  경고: 모든 테이블의 데이터가 삭제되고 백업 파일 내용으로 덮어씌워집니다!")
            if input("정말 진행하시겠습니까? (yes/no): ").lower() != "yes":
                print("취소되었습니다.")
                return

        # 외래 키 제약 조건 때문에 순서가 중요할 수 있음
        # 참조되는 테이블(부모)부터 복원해야 함.
        priority_tables = ['states', 'apartments', 'accounts', 'apart_details']
        tables = await self.list_tables()
        
        # 우선순위 테이블 먼저, 나머지는 그 뒤에
        sorted_tables = [t for t in priority_tables if t in tables] + [t for t in tables if t not in priority_tables]
        
        success_count = 0
        failed_tables = []
        
        # tqdm 진행 표시
        print(f"\n📋 총 {len(sorted_tables)}개 테이블 복원 시작\n")
        pbar = tqdm(sorted_tables, desc="전체 복원 진행", unit="table", ncols=80)
        
        for table in pbar:
            pbar.set_description(f"복원: {table}")
            if await self.restore_table(table, confirm=True):
                success_count += 1
            else:
                failed_tables.append(table)
        
        print("\n" + "=" * 60)
        print(f"✅ 복원 완료: {success_count}/{len(tables)}개 테이블")
        
        if failed_tables:
            print(f"❌ 실패한 테이블: {', '.join(failed_tables)}")

    # (기존 메서드들 생략 - show_table_data, rebuild_database 등은 그대로 유지한다고 가정)
    # ... (파일 길이 제한으로 인해 필요한 부분만 구현, 실제로는 기존 코드를 포함해야 함)
    # 아래는 기존 코드에 추가된 메서드들만 포함한 것이 아니라 전체 코드를 다시 작성함.
    
    async def show_table_data(self, table_name: str, limit: int = 10, offset: int = 0) -> None:
        try:
            async with self.engine.begin() as conn:
                result = await conn.execute(
                    text(f'SELECT * FROM "{table_name}" LIMIT :limit OFFSET :offset')
                    .bindparams(limit=limit, offset=offset)
                )
                rows = result.fetchall()
                columns = result.keys()
                if not rows:
                    print(f"'{table_name}' 테이블에 데이터가 없습니다.")
                    return
                print(f"\n📊 '{table_name}' 테이블 데이터 (최대 {limit}개):")
                print("=" * 80)
                header = " | ".join([str(col).ljust(15) for col in columns])
                print(header)
                print("-" * 80)
                for row in rows:
                    row_str = " | ".join([str(val).ljust(15) if val is not None else "NULL".ljust(15) for val in row])
                    print(row_str)
                print("=" * 80)
        except Exception as e:
            print(f"❌ 오류 발생: {e}")

    async def get_table_relationships(self, table_name: Optional[str] = None) -> List[dict]:
        async with self.engine.begin() as conn:
            if table_name:
                query = text("""
                    SELECT tc.table_name AS from_table, kcu.column_name AS from_column,
                        ccu.table_name AS to_table, ccu.column_name AS to_column, tc.constraint_name
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
                    JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY' AND (tc.table_name = :table_name OR ccu.table_name = :table_name)
                """).bindparams(table_name=table_name)
            else:
                query = text("""
                    SELECT tc.table_name AS from_table, kcu.column_name AS from_column,
                        ccu.table_name AS to_table, ccu.column_name AS to_column, tc.constraint_name
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
                    JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                """)
            result = await conn.execute(query)
            return [{"from_table": r[0], "from_column": r[1], "to_table": r[2], "to_column": r[3], "constraint_name": r[4]} for r in result.fetchall()]

    async def rebuild_database(self, confirm: bool = False) -> bool:
        if not confirm:
            print("\n⚠️  경고: 데이터베이스 완전 재구축")
            print("   모든 테이블과 데이터가 삭제되고 초기화됩니다!")
            if input("계속하시겠습니까? (yes/no): ").lower() != "yes": 
                return False
        
        try:
            print("\n🔄 데이터베이스 재구축 시작...")
            tables = await self.list_tables()
            
            if tables:
                print(f"   삭제할 테이블: {', '.join(tables)}")
                async with self.engine.begin() as conn:
                    for table in tables:
                        try:
                            await conn.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
                            print(f"   ✓ {table} 삭제됨")
                        except Exception as e:
                            print(f"   ⚠️ {table} 삭제 실패: {e}")
            else:
                print("   삭제할 테이블이 없습니다.")
            
            # init_db.sql 실행
            init_db_path = Path("/app/scripts/init_db.sql")
            if not init_db_path.exists():
                # 상대 경로도 시도
                init_db_path = Path(__file__).parent.parent / "scripts" / "init_db.sql"
                if not init_db_path.exists():
                    print(f"❌ init_db.sql 파일을 찾을 수 없습니다. (시도한 경로: {init_db_path})")
                    return False
            
            print(f"\n   📄 SQL 파일 읽기: {init_db_path}")
            with open(init_db_path, "r", encoding="utf-8") as f:
                sql_content = f.read()
            
            # asyncpg는 prepared statement에서 여러 명령을 한 번에 실행할 수 없음
            # 따라서 SQL 문장을 올바르게 분리해서 개별 실행해야 함
            import re
            
            # Dollar-quoted strings ($$ ... $$)를 보호하면서 SQL 문장 분리
            def parse_sql_statements(sql_content):
                """
                Dollar-quoted strings를 고려하여 SQL 문장을 분리합니다.
                
                PostgreSQL에서는 $$ ... $$ 또는 $tag$ ... $tag$ 형식의 dollar-quoted strings를 사용합니다.
                이 안에는 세미콜론이 포함될 수 있으므로, 단순히 ';'로 split하면 안 됩니다.
                """
                statements = []
                current_statement = []
                in_dollar_quote = False
                dollar_tag = None
                i = 0
                
                while i < len(sql_content):
                    char = sql_content[i]
                    
                    # Dollar quote 시작/끝 감지
                    if char == '$':
                        # Dollar quote tag 찾기 (예: $$, $tag$, $body$)
                        tag_match = re.match(r'\$(\w*)\$', sql_content[i:])
                        if tag_match:
                            tag = tag_match.group(0)  # 전체 태그 (예: $$, $tag$)
                            
                            if not in_dollar_quote:
                                # Dollar quote 시작
                                in_dollar_quote = True
                                dollar_tag = tag
                                current_statement.append(tag)
                                i += len(tag)
                                continue
                            elif dollar_tag == tag:
                                # Dollar quote 끝
                                in_dollar_quote = False
                                current_statement.append(tag)
                                dollar_tag = None
                                i += len(tag)
                                continue
                    
                    # 세미콜론으로 문장 구분 (dollar quote 밖에서만)
                    if char == ';' and not in_dollar_quote:
                        current_statement.append(char)
                        stmt = ''.join(current_statement).strip()
                        if stmt:
                            statements.append(stmt)
                        current_statement = []
                        i += 1
                        continue
                    
                    current_statement.append(char)
                    i += 1
                
                # 마지막 문장 처리
                if current_statement:
                    stmt = ''.join(current_statement).strip()
                    if stmt:
                        statements.append(stmt)
                
                return statements
            
            # SQL 문장 파싱
            raw_statements = parse_sql_statements(sql_content)
            
            # 주석 제거 및 빈 문장 필터링
            statements = []
            for stmt in raw_statements:
                # 주석만 있는 줄 제거
                lines = []
                for line in stmt.split('\n'):
                    stripped = line.strip()
                    # 주석 라인 건너뛰기 (단, SQL 명령어가 있는 라인은 유지)
                    if stripped and not stripped.startswith('--'):
                        lines.append(line)
                    elif stripped.startswith('--') and any(keyword in stripped.upper() for keyword in ['CREATE', 'ALTER', 'INSERT']):
                        # 명령어가 포함된 주석은 유지 (혹시 모를 경우 대비)
                        lines.append(line)
                
                if lines:
                    cleaned_stmt = '\n'.join(lines).strip()
                    if cleaned_stmt:
                        statements.append(cleaned_stmt)
            
            print(f"   📝 {len(statements)}개 SQL 문장 실행 중...")
            success_count = 0
            error_count = 0
            errors = []
            
            # 각 문장을 개별 트랜잭션으로 실행 (에러가 발생해도 다른 문장에 영향 없음)
            for i, stmt in enumerate(statements, 1):
                try:
                    # 각 문장을 개별 트랜잭션으로 실행
                    async with self.engine.begin() as conn:
                        await conn.execute(text(stmt))
                    success_count += 1
                    if i % 10 == 0:
                        print(f"   진행 중... ({i}/{len(statements)})")
                except Exception as e:
                    error_count += 1
                    error_msg = str(e)
                    errors.append((i, error_msg, stmt[:200]))
                    
                    # 중요한 에러만 출력
                    if any(keyword in stmt.upper()[:100] for keyword in ['CREATE', 'ALTER', 'COMMENT', 'DO', 'DROP', 'INSERT']):
                        print(f"   ⚠️ 문장 {i} 실행 실패: {error_msg[:200]}")
                        stmt_preview = stmt[:100].replace('\n', ' ').strip()
                        if stmt_preview:
                            print(f"      문장 미리보기: {stmt_preview}...")
            
            print(f"\n✅ 재구축 완료")
            print(f"   성공: {success_count}개, 실패: {error_count}개")
            
            if error_count > 0:
                print(f"\n   ⚠️ 실패한 문장들:")
                for i, err_msg, stmt_preview in errors[:10]:  # 최대 10개만 표시
                    print(f"      문장 {i}: {err_msg[:150]}")
                if len(errors) > 10:
                    print(f"      ... 외 {len(errors) - 10}개")
                
                # 심각한 에러가 있는지 확인
                critical_errors = [e for e in errors if any(keyword in e[2].upper()[:100] for keyword in ['CREATE TABLE', 'CREATE EXTENSION'])]
                if critical_errors:
                    print(f"\n   ❌ 심각한 에러 발견: {len(critical_errors)}개")
                    print(f"      데이터베이스 구조에 문제가 있을 수 있습니다.")
                    return False
            
            return True
        except Exception as e:
            print(f"❌ 재구축 중 오류 발생: {e}")
            import traceback
            print(traceback.format_exc())
            return False

    async def generate_dummy_for_empty_apartments(self, confirm: bool = False) -> bool:
        """
        매매와 전월세 거래가 모두 없는 아파트에만 더미 데이터 생성 (실제 데이터 활용 버전)
        
        거래가 없는 아파트를 찾아서 2020년 1월부터 오늘까지의 더미 데이터를 생성합니다.
        
        개선 사항 (실제 DB 데이터 활용):
        - 거래량: 월별 푸아송 분포 기반 (평균 1~3건, 계절성 반영)
        - 가격: house_scores 테이블의 실제 주택가격지수 반영 (있을 경우)
        - 평형: 같은 아파트의 실제 거래 전용면적 분포 사용 (있을 경우)
        - 층수: 같은 아파트의 실제 거래 층수 분포 사용 (있을 경우)
        - 가격: 같은 동(region_name)의 실제 거래 평균가 우선 사용
        - remarks: "더미" 명시적 식별자 사용
        
        실제 데이터가 없는 경우 통계적 분포 사용 (이전 버전 로직)
        """
        # 거래량이 0인 아파트 수를 먼저 확인
        print("\n🔄 거래가 없는 아파트 찾기 시작...")
        
        try:
            # 1. 거래가 없는 아파트 찾기 (확인용)
            async with self.engine.begin() as conn:
                from sqlalchemy import exists
                
                no_sales = ~exists(select(1).where(Sale.apt_id == Apartment.apt_id))
                no_rents = ~exists(select(1).where(Rent.apt_id == Apartment.apt_id))
                
                result = await conn.execute(
                    select(func.count(Apartment.apt_id))
                    .join(State, Apartment.region_id == State.region_id)
                    .where(
                        ((Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))),
                        no_sales,
                        no_rents
                    )
                )
                empty_count = result.scalar() or 0
            
            if empty_count == 0:
                print("   ✅ 거래가 없는 아파트가 없습니다.")
                return True
            
            # 거래량이 0인 아파트 수를 먼저 출력하고 확인
            print(f"\n📊 거래량이 0인 아파트: {empty_count:,}개")
            print("\n⚠️  경고: 거래가 없는 아파트에 더미 데이터 생성 (실제 데이터 활용)")
            print("   - 매매와 전월세 거래가 모두 없는 아파트만 대상입니다.")
            print(f"   - 2020년 1월부터 {date.today().strftime('%Y년 %m월 %d일')}까지의 데이터가 생성됩니다.")
            print("   - 월별 거래량: 푸아송 분포 기반 (평균 1~3건, 계절성 반영)")
            print("   - 가격지수: house_scores 테이블의 실제 주택가격지수 우선 사용")
            print("   - 평형/층수: 같은 아파트의 실제 거래 데이터 우선 사용")
            print("   - 가격: 같은 동의 실제 거래 평균가 기반")
            print("   - remarks: '더미' 식별자 사용")
            
            if not confirm:
                if input("\n계속하시겠습니까? (yes/no): ").lower() != "yes":
                    print("   ❌ 취소되었습니다.")
                    return False
            
            # --- 헬퍼 함수들 ---
            def get_realistic_exclusive_area() -> float:
                """실제 시장과 유사한 전용면적 분포 생성"""
                # 전용면적 분포: 25형(59㎡), 34형(84㎡), 43형(109㎡) 중심
                area_types = [
                    (59.0, 5.0, 0.35),   # 25평형 (59㎡ 기준, 표준편차 5, 확률 35%)
                    (84.0, 7.0, 0.45),   # 34평형 (84㎡ 기준, 표준편차 7, 확률 45%)
                    (114.0, 10.0, 0.15), # 43평형 (114㎡ 기준, 표준편차 10, 확률 15%)
                    (145.0, 15.0, 0.05), # 대형 (145㎡ 기준, 표준편차 15, 확률 5%)
                ]
                
                r = random.random()
                cumulative = 0
                for mean, std, prob in area_types:
                    cumulative += prob
                    if r <= cumulative:
                        area = random.gauss(mean, std)
                        # 최소/최대 범위 제한
                        return round(max(29.0, min(200.0, area)), 2)
                
                return round(random.uniform(59.0, 84.0), 2)
            
            def get_realistic_floor(max_floor: int = 30) -> int:
                """실제 시장과 유사한 층수 분포 생성 (중층 선호)"""
                # 중층(8-15층)이 가장 인기, 저층/최상층은 상대적으로 적음
                if max_floor <= 5:
                    return random.randint(1, max_floor)
                
                # 정규분포로 중층 선호 표현
                mean_floor = max_floor * 0.5  # 중간층
                std_floor = max_floor * 0.25
                floor = int(random.gauss(mean_floor, std_floor))
                return max(1, min(max_floor, floor))
            
            def get_price_variation() -> float:
                """가격 변동 (정규분포 기반, 평균 1.0, 표준편차 0.08)"""
                # 대부분 ±15% 범위 내, 가끔 더 큰 변동
                variation = random.gauss(1.0, 0.08)
                return max(0.75, min(1.25, variation))
            
            def get_seasonal_multiplier(month: int) -> float:
                """계절별 거래량/가격 변동 (봄/가을 성수기)"""
                seasonal_factors = {
                    1: 0.85, 2: 0.80,  # 겨울: 비수기
                    3: 1.10, 4: 1.15, 5: 1.10,  # 봄: 성수기
                    6: 0.95, 7: 0.85, 8: 0.80,  # 여름: 비수기
                    9: 1.10, 10: 1.15, 11: 1.05,  # 가을: 성수기
                    12: 0.90  # 겨울: 비수기
                }
                return seasonal_factors.get(month, 1.0)
            
            def get_market_trend_multiplier(year: int, month: int) -> float:
                """시장 트렌드 반영 (2020-2022 상승, 2023 조정, 2024 회복)"""
                base_year = 2020
                months_from_base = (year - base_year) * 12 + (month - 1)
                
                # 2020-2021: 급상승 (코로나 특수)
                if year <= 2021:
                    return 1.0 + (months_from_base / 24) * 0.5
                # 2022: 고점
                elif year == 2022:
                    return 1.5 + (month - 1) / 12 * 0.15
                # 2023: 조정기
                elif year == 2023:
                    return 1.65 - (month - 1) / 12 * 0.15
                # 2024 이후: 안정/회복
                else:
                    return 1.50 + (months_from_base - 48) / 24 * 0.1
            
            def get_realistic_build_year(region_multiplier: float) -> str:
                """지역 특성에 맞는 건축년도 생성"""
                # 비싼 지역일수록 신축 비율 높음
                if region_multiplier >= 1.5:
                    # 서울/강남권: 2000년대 이후 신축 많음
                    weights = [0.1, 0.2, 0.3, 0.4]  # 1990, 2000, 2010, 2020년대
                elif region_multiplier >= 1.0:
                    # 수도권/광역시: 고른 분포
                    weights = [0.2, 0.3, 0.3, 0.2]
                else:
                    # 지방: 구축 비율 높음
                    weights = [0.35, 0.35, 0.2, 0.1]
                
                decade = random.choices([1990, 2000, 2010, 2020], weights=weights)[0]
                year = decade + random.randint(0, 9)
                return str(min(year, date.today().year))
            
            def calculate_monthly_rent_from_deposit(deposit: int, area: float) -> int:
                """보증금 기반 월세 계산 (전월세 전환율 반영)"""
                # 전월세 전환율: 보통 4-6% (연)
                conversion_rate = random.uniform(0.04, 0.06)
                annual_rent = deposit * conversion_rate
                monthly = int(annual_rent / 12)
                
                # 면적에 따른 조정 (소형은 월세 비율 높음)
                if area < 60:
                    monthly = int(monthly * random.uniform(1.1, 1.3))
                
                # 최소/최대 범위
                return max(30, min(500, monthly))
            
            # 1. 거래가 없는 아파트 찾기 (상세 정보)
            async with self.engine.begin() as conn:
                from sqlalchemy import exists
                
                no_sales = ~exists(select(1).where(Sale.apt_id == Apartment.apt_id))
                no_rents = ~exists(select(1).where(Rent.apt_id == Apartment.apt_id))
                
                result = await conn.execute(
                    select(
                        Apartment.apt_id,
                        Apartment.region_id,
                        State.city_name,
                        State.region_name
                    )
                    .join(State, Apartment.region_id == State.region_id)
                    .where(
                        ((Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))),
                        no_sales,
                        no_rents
                    )
                )
                empty_apartments = result.fetchall()
            
            if not empty_apartments:
                print("   ✅ 거래가 없는 아파트가 없습니다.")
                return True
            
            print(f"   ✅ 거래가 없는 아파트 {len(empty_apartments):,}개 발견")
            
            # 2. 지역별 평균 가격 조회 (같은 동(region_name) 기준)
            print("   📊 지역별 평균 가격 조회 중... (같은 동 기준)")
            
            async with self.engine.begin() as conn:
                # 매매 평균 가격 (전용면적당, 만원/㎡) - region_name 기준으로 그룹화
                # 더미 데이터 제외
                sale_avg_stmt = (
                    select(
                        State.region_name,
                        State.city_name,
                        func.avg(Sale.trans_price / Sale.exclusive_area).label("avg_price_per_sqm"),
                        func.stddev(Sale.trans_price / Sale.exclusive_area).label("std_price_per_sqm")
                    )
                    .join(Apartment, Sale.apt_id == Apartment.apt_id)
                    .join(State, Apartment.region_id == State.region_id)
                    .where(
                        and_(
                            Sale.trans_price.isnot(None),
                            Sale.exclusive_area > 0,
                            Sale.is_canceled == False,
                            (Sale.is_deleted == False) | (Sale.is_deleted.is_(None)),
                            or_(Sale.remarks != DUMMY_MARKER, Sale.remarks.is_(None))  # 더미 데이터 제외
                        )
                    )
                    .group_by(State.region_name, State.city_name)
                    .having(func.count(Sale.trans_id) >= 5)
                )
                sale_result = await conn.execute(sale_avg_stmt)
                region_sale_avg = {
                    f"{row.city_name} {row.region_name}": {
                        "avg": float(row.avg_price_per_sqm or 0),
                        "std": float(row.std_price_per_sqm or 0) if row.std_price_per_sqm else 0
                    }
                    for row in sale_result.fetchall()
                }
                
                # 전세 평균 가격 (전용면적당, 만원/㎡) - region_name 기준
                jeonse_avg_stmt = (
                    select(
                        State.region_name,
                        State.city_name,
                        func.avg(Rent.deposit_price / Rent.exclusive_area).label("avg_price_per_sqm"),
                        func.stddev(Rent.deposit_price / Rent.exclusive_area).label("std_price_per_sqm")
                    )
                    .join(Apartment, Rent.apt_id == Apartment.apt_id)
                    .join(State, Apartment.region_id == State.region_id)
                    .where(
                        and_(
                            Rent.deposit_price.isnot(None),
                            Rent.exclusive_area > 0,
                            or_(Rent.monthly_rent == 0, Rent.monthly_rent.is_(None)),
                            (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                            or_(Rent.remarks != DUMMY_MARKER, Rent.remarks.is_(None))  # 더미 데이터 제외
                        )
                    )
                    .group_by(State.region_name, State.city_name)
                    .having(func.count(Rent.trans_id) >= 5)
                )
                jeonse_result = await conn.execute(jeonse_avg_stmt)
                region_jeonse_avg = {
                    f"{row.city_name} {row.region_name}": {
                        "avg": float(row.avg_price_per_sqm or 0),
                        "std": float(row.std_price_per_sqm or 0) if row.std_price_per_sqm else 0
                    }
                    for row in jeonse_result.fetchall()
                }
                
                # 월세 평균 가격 - region_name 기준
                wolse_avg_stmt = (
                    select(
                        State.region_name,
                        State.city_name,
                        func.avg(Rent.deposit_price / Rent.exclusive_area).label("avg_deposit_per_sqm"),
                        func.avg(Rent.monthly_rent).label("avg_monthly_rent"),
                        func.stddev(Rent.monthly_rent).label("std_monthly_rent")
                    )
                    .join(Apartment, Rent.apt_id == Apartment.apt_id)
                    .join(State, Apartment.region_id == State.region_id)
                    .where(
                        and_(
                            Rent.deposit_price.isnot(None),
                            Rent.monthly_rent.isnot(None),
                            Rent.exclusive_area > 0,
                            Rent.monthly_rent > 0,
                            (Rent.is_deleted == False) | (Rent.is_deleted.is_(None)),
                            or_(Rent.remarks != DUMMY_MARKER, Rent.remarks.is_(None))  # 더미 데이터 제외
                        )
                    )
                    .group_by(State.region_name, State.city_name)
                    .having(func.count(Rent.trans_id) >= 5)
                )
                wolse_result = await conn.execute(wolse_avg_stmt)
                region_wolse_avg = {
                    f"{row.city_name} {row.region_name}": {
                        "deposit_avg": float(row.avg_deposit_per_sqm or 0),
                        "monthly_avg": float(row.avg_monthly_rent or 0),
                        "monthly_std": float(row.std_monthly_rent or 0) if row.std_monthly_rent else 0
                    }
                    for row in wolse_result.fetchall()
                }
            
            print(f"   ✅ 지역별 평균 가격 조회 완료 (매매: {len(region_sale_avg)}개 동, 전세: {len(region_jeonse_avg)}개 동, 월세: {len(region_wolse_avg)}개 동)")
            
            # 3. house_scores 테이블에서 실제 주택가격지수 로드
            print("   📈 house_scores 테이블에서 실제 주택가격지수 로드 중...")
            region_ids_list = list(set([apt[1] for apt in empty_apartments]))  # 중복 제거
            async with self.engine.begin() as conn:
                house_score_multipliers = await get_house_score_multipliers(conn, region_ids_list)
            
            if house_score_multipliers:
                print(f"   ✅ house_scores 데이터 로드 완료: {len(house_score_multipliers):,}개 지역-월 조합")
                print("      실제 주택가격지수를 가격 계산에 활용합니다.")
            else:
                print("   ⚠️  house_scores 데이터가 없습니다. 통계적 가격 모델을 사용합니다.")
            
            # 4. 아파트별 실제 거래 데이터 분석 (전용면적, 층수)
            print("   🏢 아파트별 실제 거래 데이터 분석 중 (전용면적, 층수)...")
            apartment_area_distributions = {}  # {apt_id: [area1, area2, ...]}
            apartment_floor_distributions = {}  # {apt_id: [floor1, floor2, ...]}
            
            # 배치 단위로 처리 (성능 최적화)
            batch_size = 100
            analyzed_count = 0
            
            for i in range(0, len(empty_apartments), batch_size):
                batch = empty_apartments[i:i+batch_size]
                
                async with self.engine.begin() as conn:
                    for apt_id, region_id, city_name, region_name in batch:
                        # 전용면적 분포
                        area_dist = await get_apartment_real_area_distribution(conn, apt_id)
                        if area_dist:
                            apartment_area_distributions[apt_id] = area_dist
                        
                        # 층수 분포
                        floor_dist = await get_apartment_real_floor_distribution(conn, apt_id)
                        if floor_dist:
                            apartment_floor_distributions[apt_id] = floor_dist
                
                analyzed_count += len(batch)
                if analyzed_count % 1000 == 0:
                    print(f"      분석 진행 중: {analyzed_count:,}/{len(empty_apartments):,}개 아파트")
            
            print(f"   ✅ 아파트 거래 데이터 분석 완료:")
            print(f"      - 실제 전용면적 분포 확보: {len(apartment_area_distributions):,}개 아파트")
            print(f"      - 실제 층수 분포 확보: {len(apartment_floor_distributions):,}개 아파트")
            print(f"      - 나머지는 통계적 분포 사용")
            
            # 5. 거래 데이터 생성 및 삽입
            print("   📊 더미 거래 데이터 생성 및 삽입 중...")
            
            start_date = date(2020, 1, 1)
            end_date = date.today()
            
            start_year = start_date.year
            start_month = start_date.month
            end_year = end_date.year
            end_month = end_date.month
            total_months = (end_year - start_year) * 12 + (end_month - start_month) + 1
            
            batch_size_transactions = 2000
            batch_size_insert = 1000
            
            rents_batch = []
            sales_batch = []
            
            total_transactions = 0
            total_apartments = len(empty_apartments)
            total_sales_inserted = 0
            total_rents_inserted = 0
            
            current_timestamp = datetime.now()
            
            async def insert_batch(conn, sales_batch_data, rents_batch_data):
                nonlocal total_sales_inserted, total_rents_inserted
                
                try:
                    if sales_batch_data:
                        for i in range(0, len(sales_batch_data), batch_size_insert):
                            batch = sales_batch_data[i:i + batch_size_insert]
                            stmt = insert(Sale).values(batch)
                            await conn.execute(stmt)
                        total_sales_inserted += len(sales_batch_data)
                    
                    if rents_batch_data:
                        for i in range(0, len(rents_batch_data), batch_size_insert):
                            batch = rents_batch_data[i:i + batch_size_insert]
                            stmt = insert(Rent).values(batch)
                            await conn.execute(stmt)
                        total_rents_inserted += len(rents_batch_data)
                except Exception as e:
                    print(f"   ❌ 배치 삽입 중 오류 발생: {e}")
                    raise
            
            # 날짜 캐싱
            days_in_month_cache = {}
            today = date.today()
            for year in range(2020, today.year + 1):
                end_m = 12 if year < today.year else today.month
                for month in range(1, end_m + 1):
                    days_in_month_cache[(year, month)] = calendar.monthrange(year, month)[1]
            
            # 지역별 가격 계수 미리 계산 (아파트별로 캐싱) - 개선된 세부 지역 계수 사용
            apartment_multipliers = {}
            apartment_region_keys = {}
            for apt_id, region_id, city_name, region_name in empty_apartments:
                apartment_multipliers[apt_id] = get_detailed_region_multiplier_kr(city_name, region_name)
                apartment_region_keys[apt_id] = f"{city_name} {region_name}"  # 같은 동 키
            
            # 아파트별 거래 생성 여부 추적 (더 이상 3개월 주기 사용 안 함)
            # 개선: 월별로 푸아송 분포 기반 거래 건수 생성
            
            current_date = start_date
            month_count = 0
            
            while current_date <= end_date:
                year = current_date.year
                month = current_date.month
                month_count += 1
                current_ym = f"{year:04d}{month:02d}"
                
                # 가격 승수 결정: house_scores 우선, 없으면 이벤트 기반
                # house_scores는 지역별로 다르므로 아파트별로 조회 필요 (루프 내에서 처리)
                
                # 월별 일수 (캐시에서 가져오기)
                days_in_month = days_in_month_cache[(year, month)]
                
                print(f"\n   📅 처리 중: {year}년 {month}월 ({current_ym}) | 진행: {month_count}/{total_months}개월")
                
                apt_log_interval = 1000
                
                for apt_idx, (apt_id, region_id, city_name, region_name) in enumerate(empty_apartments, 1):
                    if apt_idx % apt_log_interval == 0 or apt_idx == total_apartments:
                        apt_progress = (apt_idx / total_apartments) * 100
                        print(f"      ⏳ 아파트 처리 중: {apt_idx:,}/{total_apartments:,}개 ({apt_progress:.1f}%) | "
                              f"생성된 거래: {total_transactions:,}개")
                    
                    # 지역별 가격 계수 (캐시에서 가져오기)
                    region_multiplier = apartment_multipliers[apt_id]
                    
                    # ========================================================
                    # 개선: 월별 거래 건수를 푸아송 분포로 생성 (계절성 반영)
                    # ========================================================
                    monthly_transaction_count = get_monthly_transaction_count_kr(month)
                    
                    # 거래가 없으면 건너뛰기
                    if monthly_transaction_count == 0:
                        continue
                    
                    # 거래 유형 분포 (매매 50%, 전세 30%, 월세 20%)
                    transaction_types = []
                    for _ in range(monthly_transaction_count):
                        rand = random.random()
                        if rand < 0.50:
                            transaction_types.append("매매")
                        elif rand < 0.80:  # 0.50 + 0.30
                            transaction_types.append("전세")
                        else:
                            transaction_types.append("월세")
                    
                    # 가격 승수: house_scores 우선, 없으면 이벤트 기반
                    score_key = (region_id, current_ym)
                    if score_key in house_score_multipliers:
                        time_multiplier = house_score_multipliers[score_key]
                    else:
                        # house_scores 데이터가 없으면 이벤트 기반 승수 사용
                        time_multiplier = get_price_multiplier_with_events_kr(year, month)
                    
                    # 각 거래 유형별로 데이터 생성
                    for record_type in transaction_types:
                        # 전용면적: 실제 아파트 거래 분포 우선 사용
                        if apt_id in apartment_area_distributions:
                            exclusive_area = select_realistic_area_from_distribution(
                                apartment_area_distributions[apt_id]
                            )
                        else:
                            # 실제 데이터 없으면 통계적 분포 사용
                            exclusive_area = get_realistic_area_kr()
                        
                        # 층: 실제 아파트 거래 분포 우선 사용
                        if apt_id in apartment_floor_distributions:
                            floor = select_realistic_floor_from_distribution(
                                apartment_floor_distributions[apt_id]
                            )
                        else:
                            # 실제 데이터 없으면 선호도 기반 생성
                            max_floor = 30  # 기본값
                            floor = get_realistic_floor(max_floor)
                        
                        # 거래일 (해당 월 내 랜덤, 오늘 날짜를 넘지 않도록)
                        today = date.today()
                        if year == today.year and month == today.month:
                            # 현재 월인 경우 오늘 날짜까지만
                            max_day = min(days_in_month, today.day)
                        else:
                            price_per_sqm = 500 * region_multiplier * price_variation
                        
                        final_price = int(price_per_sqm * exclusive_area * market_multiplier * seasonal_multiplier)
                        final_price = max(5000, final_price)  # 최소 5천만원
                        
                        trans_type = random.choices(
                            ["매매", "전매", "분양권전매"],
                            weights=[0.85, 0.10, 0.05]
                        )[0]
                        is_canceled = random.random() < 0.03  # 3% 취소율
                        cancel_date_val = None
                        if is_canceled:
                            cancel_day = random.randint(deal_day, days_in_month)
                            cancel_date_val = date(year, month, cancel_day)
                        
                        # 가격 계산 (같은 동의 평균값 + 오차범위) - 개선
                        # 같은 동(region_name)의 평균 가격이 있으면 사용, 없으면 기본값 사용
                        region_key = apartment_region_keys[apt_id]
                        total_price = 0
                        total_deposit = 0
                        monthly_rent = 0
                        
                        # 가격 변동폭: 정규분포 기반 (개선)
                        random_variation = get_price_variation_normal()
                        
                        if record_type == "매매":
                            if region_key in region_sale_avg:
                                base_price_per_sqm = region_sale_avg[region_key]
                            else:
                                # 평균값이 없으면 기본값 * 지역계수 사용
                                base_price_per_sqm = 500 * region_multiplier
                            price_per_sqm = base_price_per_sqm * time_multiplier
                            total_price = int(price_per_sqm * exclusive_area * random_variation)
                        
                        elif record_type == "전세":
                            if region_key in region_jeonse_avg:
                                base_price_per_sqm = region_jeonse_avg[region_key]
                            else:
                                # 평균값이 없으면 매매가의 60% 사용
                                base_price_per_sqm = 500 * region_multiplier * 0.6
                            price_per_sqm = base_price_per_sqm * time_multiplier
                            total_price = int(price_per_sqm * exclusive_area * random_variation)
                        
                        else:  # 월세
                            if region_key in region_wolse_avg:
                                base_deposit_per_sqm = region_wolse_avg[region_key]["deposit"]
                                base_monthly_rent = region_wolse_avg[region_key]["monthly"]
                            else:
                                # 평균값이 없으면 기본값 사용
                                base_deposit_per_sqm = 500 * region_multiplier * 0.3
                                base_monthly_rent = 50  # 기본 월세 50만원
                            deposit_per_sqm = base_deposit_per_sqm * time_multiplier
                            total_deposit = int(deposit_per_sqm * exclusive_area * random_variation)
                            monthly_rent = int(base_monthly_rent * random_variation)
                        
                        if record_type == "매매":
                            # 매매 거래 데이터
                            trans_type = get_realistic_sale_type_kr(year)
                            is_canceled = random.random() < 0.05  # 5% 확률로 취소
                            cancel_date = None
                            if is_canceled:
                                cancel_day = random.randint(deal_day, days_in_month)
                                cancel_date = date(year, month, cancel_day)
                            
                            sales_batch.append({
                                "apt_id": apt_id,
                                "build_year": str(random.randint(1990, 2020)),
                                "trans_type": trans_type,
                                "trans_price": total_price,
                                "exclusive_area": exclusive_area,
                                "floor": floor,
                                "building_num": str(random.randint(1, 20)) if random.random() > 0.3 else None,
                                "contract_date": contract_date,
                                "is_canceled": is_canceled,
                                "cancel_date": cancel_date,
                                "remarks": get_dummy_remarks(),  # "더미" 식별자
                                "created_at": current_timestamp,
                                "updated_at": current_timestamp,
                                "is_deleted": False
                            })
                            total_transactions += 1
                        
                        elif record_type == "전세":
                            # 전세: monthly_rent = 0, deposit_price가 전세가
                            deposit_price = total_price
                            
                            # 갱신 여부: 시기별 차이 반영
                            contract_type = get_realistic_contract_type_kr(year)
                            
                            rents_batch.append({
                                "apt_id": apt_id,
                                "build_year": str(random.randint(1990, 2020)),
                                "contract_type": contract_type,
                                "deposit_price": deposit_price,
                                "monthly_rent": 0,  # 전세는 월세가 0
                                "exclusive_area": exclusive_area,
                                "floor": floor,
                                "apt_seq": str(random.randint(1, 100)) if random.random() > 0.3 else None,
                                "deal_date": deal_date,
                                "contract_date": contract_date,
                                "remarks": get_dummy_remarks(),  # "더미" 식별자
                                "created_at": current_timestamp,
                                "updated_at": current_timestamp,
                                "is_deleted": False
                            })
                            total_transactions += 1
                        
                        else:  # 월세
                            # 월세: 보증금과 월세 모두 있음
                            deposit_price = total_deposit
                            
                            # 갱신 여부: 시기별 차이 반영
                            contract_type = get_realistic_contract_type_kr(year)
                            
                            rents_batch.append({
                                "apt_id": apt_id,
                                "build_year": str(random.randint(1990, 2020)),
                                "contract_type": contract_type,
                                "deposit_price": deposit_price,
                                "monthly_rent": monthly_rent,
                                "exclusive_area": exclusive_area,
                                "floor": floor,
                                "apt_seq": str(random.randint(1, 100)) if random.random() > 0.3 else None,
                                "deal_date": deal_date,
                                "contract_date": contract_date,
                                "remarks": get_dummy_remarks(),  # "더미" 식별자
                                "created_at": current_timestamp,
                                "updated_at": current_timestamp,
                                "is_deleted": False
                            })
                            total_transactions += 1
                        
                        rents_batch.append({
                            "apt_id": apt_id,
                            "build_year": apt_build_year,
                            "contract_type": contract_type,
                            "deposit_price": deposit_price,
                            "monthly_rent": monthly_rent,
                            "rent_type": "MONTHLY_RENT",  # 신규 필드!
                            "exclusive_area": exclusive_area,
                            "floor": floor,
                            "apt_seq": None,
                            "deal_date": deal_date_val,
                            "contract_date": contract_date_val,
                            "remarks": "더미",
                            "created_at": current_timestamp,
                            "updated_at": current_timestamp,
                            "is_deleted": False
                        })
                        total_transactions += 1
                    
                    # 배치 삽입
                    if len(sales_batch) + len(rents_batch) >= batch_size_transactions:
                        try:
                            async with self.engine.begin() as conn:
                                await insert_batch(conn, sales_batch, rents_batch)
                            sales_batch.clear()
                            rents_batch.clear()
                            current_timestamp = datetime.now()
                        except Exception as e:
                            print(f"      ❌ 배치 삽입 실패: {e}")
                            raise
                
                # 월별 완료 후 배치 삽입
                if sales_batch or rents_batch:
                    try:
                        async with self.engine.begin() as conn:
                            await insert_batch(conn, sales_batch, rents_batch)
                        sales_batch.clear()
                        rents_batch.clear()
                        current_timestamp = datetime.now()
                    except Exception as e:
                        print(f"      ❌ 월별 배치 삽입 실패: {e}")
                        raise
                
                month_progress = (month_count / total_months) * 100
                print(f"      ✅ {year}년 {month}월 완료 | "
                      f"생성: {total_transactions:,}개 | "
                      f"DB: 매매 {total_sales_inserted:,}개, 전월세 {total_rents_inserted:,}개 | "
                      f"{month_progress:.1f}%")
                
                if month == 12:
                    current_date = date(year + 1, 1, 1)
                else:
                    current_date = date(year, month + 1, 1)
            
            # 마지막 배치
            if sales_batch or rents_batch:
                print(f"\n   💾 남은 배치 데이터 삽입 중...")
                try:
                    async with self.engine.begin() as conn:
                        await insert_batch(conn, sales_batch, rents_batch)
                    print(f"   ✅ 남은 배치 데이터 삽입 완료")
                except Exception as e:
                    print(f"   ❌ 남은 배치 데이터 삽입 실패: {e}")
                    raise
            
            # 결과 통계
            async with self.engine.begin() as conn:
                jeonse_count = await conn.execute(
                    text('SELECT COUNT(*) FROM rents WHERE remarks = :marker AND monthly_rent = 0')
                    .bindparams(marker=DUMMY_MARKER)
                )
                wolse_count = await conn.execute(
                    text('SELECT COUNT(*) FROM rents WHERE remarks = :marker AND monthly_rent > 0')
                    .bindparams(marker=DUMMY_MARKER)
                )
                sales_count = await conn.execute(
                    text('SELECT COUNT(*) FROM sales WHERE remarks = :marker')
                    .bindparams(marker=DUMMY_MARKER)
                )
                rents_count = await conn.execute(
                    text('SELECT COUNT(*) FROM rents WHERE remarks = :marker')
                    .bindparams(marker=DUMMY_MARKER)
                )
                
                jeonse_total = jeonse_count.scalar() or 0
                wolse_total = wolse_count.scalar() or 0
                sales_total = sales_count.scalar() or 0
                rents_total = rents_count.scalar() or 0
            
            print("\n✅ 더미 거래 데이터 생성 완료!")
            print(f"   - 매매 거래 (더미): {sales_total:,}개")
            print(f"   - 전월세 거래 (더미): {rents_total:,}개")
            print(f"     * 전세 (rent_type=JEONSE): {jeonse_total:,}개")
            print(f"     * 월세 (rent_type=MONTHLY_RENT): {wolse_total:,}개")
            print(f"   - 총 거래 (더미): {sales_total + rents_total:,}개")
            
            return True
            
        except Exception as e:
            print(f"❌ 더미 데이터 생성 중 오류 발생: {e}")
            import traceback
            print(traceback.format_exc())
            return False

    async def delete_dummy_data(self, confirm: bool = False) -> bool:
        """
        remarks='더미'인 모든 거래 데이터 삭제
        
        sales와 rents 테이블에서 remarks = '더미'인 레코드만 삭제합니다.
        """
        if not confirm:
            print("\n⚠️  경고: 더미 데이터 삭제")
            print("   - remarks='더미'인 모든 매매 및 전월세 거래가 삭제됩니다.")
            print("   - 이 작업은 되돌릴 수 없습니다!")
            
            # 삭제될 데이터 수 확인
            async with self.engine.begin() as conn:
                sales_count = await conn.execute(
                    text('SELECT COUNT(*) FROM sales WHERE remarks = :marker')
                    .bindparams(marker=DUMMY_MARKER)
                )
                rents_count = await conn.execute(
                    text('SELECT COUNT(*) FROM rents WHERE remarks = :marker')
                    .bindparams(marker=DUMMY_MARKER)
                )
                sales_total = sales_count.scalar() or 0
                rents_total = rents_count.scalar() or 0
            
            print(f"\n📊 삭제될 데이터:")
            print(f"   - 매매 거래 (더미): {sales_total:,}개")
            print(f"   - 전월세 거래 (더미): {rents_total:,}개")
            print(f"   - 총 거래 (더미): {sales_total + rents_total:,}개")
            
            if input("\n정말 삭제하시겠습니까? (yes/no): ").lower() != "yes":
                print("   ❌ 취소되었습니다.")
                return False
        
        try:
            print("\n🔄 더미 데이터 삭제 시작...")
            
            async with self.engine.begin() as conn:
                # 삭제 전 개수 확인
                sales_count_before = await conn.execute(
                    text('SELECT COUNT(*) FROM sales WHERE remarks = :marker')
                    .bindparams(marker=DUMMY_MARKER)
                )
                rents_count_before = await conn.execute(
                    text('SELECT COUNT(*) FROM rents WHERE remarks = :marker')
                    .bindparams(marker=DUMMY_MARKER)
                )
                sales_before = sales_count_before.scalar() or 0
                rents_before = rents_count_before.scalar() or 0
                
                print(f"   📊 삭제 전 더미 데이터 수:")
                print(f"      - 매매: {sales_before:,}개")
                print(f"      - 전월세: {rents_before:,}개")
                
                # 매매 더미 데이터 삭제
                print("   🗑️  매매 더미 데이터 삭제 중...")
                sales_delete_result = await conn.execute(
                    text('DELETE FROM sales WHERE remarks = :marker')
                    .bindparams(marker=DUMMY_MARKER)
                )
                sales_deleted = sales_delete_result.rowcount
                
                # 전월세 더미 데이터 삭제
                print("   🗑️  전월세 더미 데이터 삭제 중...")
                rents_delete_result = await conn.execute(
                    text('DELETE FROM rents WHERE remarks = :marker')
                    .bindparams(marker=DUMMY_MARKER)
                )
                rents_deleted = rents_delete_result.rowcount
                
                # 삭제 후 개수 확인
                sales_count_after = await conn.execute(
                    text('SELECT COUNT(*) FROM sales WHERE remarks = :marker')
                    .bindparams(marker=DUMMY_MARKER)
                )
                rents_count_after = await conn.execute(
                    text('SELECT COUNT(*) FROM rents WHERE remarks = :marker')
                    .bindparams(marker=DUMMY_MARKER)
                )
                sales_after = sales_count_after.scalar() or 0
                rents_after = rents_count_after.scalar() or 0
            
            print("\n✅ 더미 데이터 삭제 완료!")
            print(f"   - 삭제된 매매 거래: {sales_deleted:,}개")
            print(f"   - 삭제된 전월세 거래: {rents_deleted:,}개")
            print(f"   - 총 삭제된 거래: {sales_deleted + rents_deleted:,}개")
            print(f"\n   📊 삭제 후 남은 더미 데이터:")
            print(f"      - 매매: {sales_after:,}개")
            print(f"      - 전월세: {rents_after:,}개")
            
            return True
            
        except Exception as e:
            print(f"❌ 더미 데이터 삭제 중 오류 발생: {e}")
            import traceback
            print(traceback.format_exc())
            return False

# ------------------------------------------------------------------------------
# 커맨드 핸들러
# ------------------------------------------------------------------------------

async def list_tables_command(admin: DatabaseAdmin):
    tables = await admin.list_tables()
    print("\n📋 테이블 목록:")
    for idx, table in enumerate(tables, 1):
        info = await admin.get_table_info(table)
        print(f"{idx}. {table:20s} (레코드: {info['row_count']})")

async def backup_command(admin: DatabaseAdmin, table_name: Optional[str] = None):
    if table_name:
        await admin.backup_table(table_name)
    else:
        await admin.backup_all()

async def restore_command(admin: DatabaseAdmin, table_name: Optional[str] = None, force: bool = False):
    if table_name:
        await admin.restore_table(table_name, confirm=force)
    else:
        await admin.restore_all(confirm=force)

# ... (기타 커맨드 생략, 메인 루프에서 호출)

def print_menu():
    print("\n" + "=" * 60)
    print("🗄️  데이터베이스 관리 도구")
    print("=" * 60)
    print("1. 테이블 목록 조회")
    print("2. 테이블 정보 조회")
    print("3. 테이블 데이터 조회")
    print("4. 테이블 데이터 삭제")
    print("5. 테이블 삭제")
    print("6. 데이터베이스 재구축")
    print("7. 테이블 관계 조회")
    print("8. 💾 데이터 백업 (CSV)")
    print("9. ♻️  데이터 복원 (CSV)")
    print("10. 🎲 거래 없는 아파트에 더미 데이터 생성")
    print("11. 📥 더미 데이터만 백업 (CSV)")
    print("12. 🗑️  더미 데이터만 삭제")
    print("0. 종료")
    print("=" * 60)

async def interactive_mode(admin: DatabaseAdmin):
    while True:
        print_menu()
        choice = input("\n선택하세요 (0-12): ").strip()
        
        if choice == "0": break
        elif choice == "1": await list_tables_command(admin)
        elif choice == "2":
            table = input("테이블명: ").strip()
            if table: await admin.get_table_info(table) # 출력 로직 필요
        elif choice == "3":
            table = input("테이블명: ").strip()
            if table: await admin.show_table_data(table)
        elif choice == "4":
            table = input("테이블명: ").strip()
            if table: await admin.truncate_table(table)
        elif choice == "5":
            table = input("테이블명: ").strip()
            if table: await admin.drop_table(table)
        elif choice == "6": await admin.rebuild_database()
        elif choice == "7": await admin.get_table_relationships() # 인자 처리 필요
        elif choice == "8":
            table = input("테이블명 (전체는 엔터): ").strip()
            await backup_command(admin, table if table else None)
        elif choice == "9":
            table = input("테이블명 (전체는 엔터): ").strip()
            await restore_command(admin, table if table else None)
        elif choice == "10": await admin.generate_dummy_for_empty_apartments()
        elif choice == "11": await admin.backup_dummy_data()
        elif choice == "12": await admin.delete_dummy_data()
        
        input("\n계속하려면 Enter...")

def main():
    if len(sys.argv) > 1:
        parser = argparse.ArgumentParser(description="DB Admin Tool")
        subparsers = parser.add_subparsers(dest="command")
        
        subparsers.add_parser("list")
        
        backup_parser = subparsers.add_parser("backup")
        backup_parser.add_argument("table_name", nargs="?", help="테이블명")
        
        restore_parser = subparsers.add_parser("restore")
        restore_parser.add_argument("table_name", nargs="?", help="테이블명")
        restore_parser.add_argument("--force", action="store_true")
        
        dummy_parser = subparsers.add_parser("dummy")
        dummy_parser.add_argument("--force", action="store_true", help="확인 없이 실행")
        
        subparsers.add_parser("backup-dummy", help="더미 데이터만 백업")
        
        args = parser.parse_args()
        
        async def run():
            admin = DatabaseAdmin()
            try:
                if args.command == "list": await list_tables_command(admin)
                elif args.command == "backup": await backup_command(admin, args.table_name)
                elif args.command == "restore": await restore_command(admin, args.table_name, args.force)
                elif args.command == "dummy": await admin.generate_dummy_for_empty_apartments(confirm=args.force)
                elif args.command == "backup-dummy": await admin.backup_dummy_data()
            finally: await admin.close()
        
        asyncio.run(run())
    else:
        async def run_interactive():
            admin = DatabaseAdmin()
            try: await interactive_mode(admin)
            finally: await admin.close()
        asyncio.run(run_interactive())

if __name__ == "__main__":
    main()