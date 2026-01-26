#!/usr/bin/env python3
"""
데이터 불일치 보정 스크립트

apart_details 테이블의 apt_id 매핑 오류를 자동으로 감지하고 수정합니다.
데이터 수집 과정에서 발생한 ID 밀림 현상(Sequence Gap)을 해결합니다.

사용법:
    python backend/scripts/fix_data_mismatch.py
"""
import asyncio
import sys
import logging
from pathlib import Path
from typing import List, Tuple, Dict

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update, text
from app.core.config import settings
from app.models.apartment import Apartment
from app.models.apart_detail import ApartDetail
from app.models.state import State

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

async def fix_data_mismatch():
    """데이터 불일치 보정 메인 함수"""
    logger.info("=" * 60)
    logger.info(" 데이터 불일치 보정 스크립트 시작")
    logger.info("=" * 60)
    
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        # 1. 모든 상세 정보와 연결된 아파트 정보 조회
        logger.info("1⃣  데이터 조회 및 분석 중...")
        stmt = (
            select(ApartDetail, Apartment)
            .join(Apartment, ApartDetail.apt_id == Apartment.apt_id)
            .order_by(ApartDetail.apt_detail_id)
        )
        result = await db.execute(stmt)
        rows = result.all()
        
        mismatches: List[Tuple[ApartDetail, int, str]] = []  # (detail, correct_apt_id, reason)
        
        total_count = len(rows)
        logger.info(f"   총 {total_count}개의 상세 정보 분석 시작")
        
        # 2. 불일치 감지 로직
        # 먼저 모든 아파트를 kapt_code로 인덱싱 (더 정확한 매칭을 위해)
        logger.info("   아파트 정보 인덱싱 중...")
        all_apts_stmt = select(Apartment).where(Apartment.is_deleted == False)
        all_apts_result = await db.execute(all_apts_stmt)
        all_apts = {apt.apt_id: apt for apt in all_apts_result.scalars().all()}
        apts_by_kapt_code = {apt.kapt_code: apt for apt in all_apts.values()}
        logger.info(f"   인덱싱 완료: {len(all_apts)}개 아파트")
        
        for detail, apt in rows:
            # 검증 1: 주소에 아파트 이름이 포함되어 있는지 확인
            # 지번주소나 도로명주소에 아파트 이름이 포함되어야 정상
            # 공백 제거 후 비교
            clean_apt_name = apt.apt_name.replace(" ", "").replace("-", "")
            clean_jibun = (detail.jibun_address or "").replace(" ", "").replace("-", "")
            clean_road = (detail.road_address or "").replace(" ", "").replace("-", "")
            
            is_match = (clean_apt_name in clean_jibun) or (clean_apt_name in clean_road) or (clean_jibun in clean_apt_name) or (clean_road in clean_apt_name)
            
            # 아파트 이름이 너무 짧으면 오탐 가능성이 있으므로 패스 (예: "자이")
            if len(clean_apt_name) < 2:
                is_match = True
                
            if not is_match:
                # 불일치 감지! 복구 시도
                # 패턴 1: kapt_code로 정확한 매칭 시도 (가장 정확함)
                # 상세 정보에는 kapt_code가 없으므로, 주소나 이름으로 매칭해야 함
                # 하지만 실제로는 상세 정보를 수집할 때 apt_id를 사용하므로,
                # 여기서는 ID 기반 매칭이 더 적절함
                
                # 패턴 2: ID + 2 규칙 적용 (가장 유력한 패턴)
                target_apt_id = apt.apt_id + 2
                
                # 타겟 아파트 조회
                target_apt = all_apts.get(target_apt_id)
                
                if target_apt:
                    # 타겟 아파트 이름으로 다시 검증
                    clean_target_name = target_apt.apt_name.replace(" ", "").replace("-", "")
                    if (clean_target_name in clean_jibun) or (clean_target_name in clean_road) or (clean_jibun in clean_target_name) or (clean_road in clean_target_name):
                        mismatches.append((detail, target_apt_id, f"ID Shift (+2) 감지: {apt.apt_name}({apt.apt_id}) -> {target_apt.apt_name}({target_apt_id})"))
                        continue
                
                # 패턴 3: ID + 1, +3, -1, -2 등 다양한 패턴 시도
                for offset in [1, 3, -1, -2]:
                    candidate_id = apt.apt_id + offset
                    candidate_apt = all_apts.get(candidate_id)
                    if candidate_apt:
                        clean_candidate_name = candidate_apt.apt_name.replace(" ", "").replace("-", "")
                        if (clean_candidate_name in clean_jibun) or (clean_candidate_name in clean_road) or (clean_jibun in clean_candidate_name) or (clean_road in clean_candidate_name):
                            mismatches.append((detail, candidate_id, f"ID Shift ({offset:+d}) 감지: {apt.apt_name}({apt.apt_id}) -> {candidate_apt.apt_name}({candidate_id})"))
                            break
                else:
                    logger.warning(f"     매핑 오류 의심 (복구 불가): 현재 연결 {apt.apt_name}({apt.apt_id}) != 주소상의 아파트")
                
        
        if not mismatches:
            logger.info(" 데이터 불일치가 발견되지 않았습니다. 모든 데이터가 정상으로 보입니다.")
            return

        logger.info(f"    총 {len(mismatches)}개의 잘못된 매핑 발견!")
        for detail, target_id, reason in mismatches[:5]:
            logger.info(f"      - {reason}")
        if len(mismatches) > 5:
            logger.info(f"      ... 외 {len(mismatches) - 5}건")

        # 3. 데이터 수정 (Unique Constraint 충돌 방지: correct_apt_id 내림차순으로 직접 업데이트)
        # 음수 apt_id 사용 시 FK 위반되므로 사용 금지. 역순 업데이트로 해소.
        logger.info("\n2⃣  데이터 수정 시작 (correct_apt_id 내림차순 직접 업데이트)")
        
        try:
            # correct_apt_id 내림차순 정렬 → 5419→5421, 5417→5419 순으로 업데이트해
            # 선점 충돌(5419 동시 사용 등) 방지
            mismatches_sorted = sorted(mismatches, key=lambda x: x[1], reverse=True)
            
            for detail, correct_apt_id, reason in mismatches_sorted:
                stmt = (
                    update(ApartDetail)
                    .where(ApartDetail.apt_detail_id == detail.apt_detail_id)
                    .values(apt_id=correct_apt_id)
                )
                await db.execute(stmt)
                logger.info(f"   수정: apt_detail_id={detail.apt_detail_id} apt_id {detail.apt_id} → {correct_apt_id} ({reason})")
            
            await db.commit()
            logger.info(" 데이터 보정 완료!")
            
        except Exception as e:
            await db.rollback()
            logger.error(f" 데이터 수정 중 오류 발생: {e}")
            import traceback
            logger.error(traceback.format_exc())

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(fix_data_mismatch())
