"""
부동산 지수 CRUD

데이터베이스 작업을 담당하는 레이어
"""
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
import logging
import sys

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# 핸들러가 없으면 추가
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

# 모든 모델을 import하여 SQLAlchemy 관계 설정이 제대로 작동하도록 함
from app.models import (  # noqa: F401
    Account,
    State,
    Apartment,
    Sale,
    Rent,
    HouseScore,
    FavoriteLocation,
    FavoriteApartment,
    MyProperty,
)

from app.crud.base import CRUDBase
from app.models.house_score import HouseScore
from app.schemas.house_score import HouseScoreCreate, HouseScoreUpdate


class CRUDHouseScore(CRUDBase[HouseScore, HouseScoreCreate, HouseScoreUpdate]):
    """
    부동산 지수 CRUD 클래스
    
    HouseScore 모델에 대한 데이터베이스 작업을 수행합니다.
    """
    
    async def get_previous_month(
        self,
        db: AsyncSession,
        *,
        region_id: int,
        base_ym: str,
        index_type: str
    ) -> Optional[HouseScore]:
        """
        전월 데이터 조회
        
        Args:
            db: 데이터베이스 세션
            region_id: 지역 ID
            base_ym: 기준 년월 (YYYYMM)
            index_type: 지수 유형
        
        Returns:
            전월 HouseScore 객체 또는 None
        """
        # base_ym을 년월로 파싱
        if len(base_ym) != 6:
            return None
        
        try:
            year = int(base_ym[:4])
            month = int(base_ym[4:6])
            
            # 전월 계산
            if month == 1:
                prev_year = year - 1
                prev_month = 12
            else:
                prev_year = year
                prev_month = month - 1
            
            prev_base_ym = f"{prev_year:04d}{prev_month:02d}"
            
            # 전월 데이터 조회
            result = await db.execute(
                select(HouseScore)
                .where(
                    and_(
                        HouseScore.region_id == region_id,
                        HouseScore.base_ym == prev_base_ym,
                        HouseScore.index_type == index_type,
                        HouseScore.is_deleted == False
                    )
                )
            )
            return result.scalar_one_or_none()
        except (ValueError, TypeError):
            return None
    
    async def get_by_region_and_month(
        self,
        db: AsyncSession,
        *,
        region_id: int,
        base_ym: str
    ) -> List[HouseScore]:
        """
        지역 ID와 기준 년월로 부동산 지수 조회
        
        Args:
            db: 데이터베이스 세션
            region_id: 지역 ID
            base_ym: 기준 년월 (YYYYMM)
        
        Returns:
            HouseScore 객체 목록 (여러 index_type이 있을 수 있음)
        """
        result = await db.execute(
            select(HouseScore)
            .where(
                and_(
                    HouseScore.region_id == region_id,
                    HouseScore.base_ym == base_ym,
                    HouseScore.is_deleted == False
                )
            )
            .order_by(HouseScore.index_type)
        )
        return list(result.scalars().all())
    
    async def create_or_skip(
        self,
        db: AsyncSession,
        *,
        obj_in: HouseScoreCreate
    ) -> Tuple[Optional[HouseScore], bool]:
        """
        부동산 지수 생성 또는 건너뛰기
        
        이미 존재하는 (region_id, base_ym, index_type) 조합이면 건너뛰고, 없으면 생성합니다.
        
        Args:
            db: 데이터베이스 세션
            obj_in: 생성할 부동산 지수 정보
        
        Returns:
            (HouseScore 객체 또는 None, 생성 여부)
            - (HouseScore, True): 새로 생성됨
            - (HouseScore, False): 이미 존재하여 건너뜀
            - (None, False): 오류 발생
        """
        # 중복 확인 (region_id, base_ym, index_type 조합)
        result = await db.execute(
            select(HouseScore)
            .where(
                and_(
                    HouseScore.region_id == obj_in.region_id,
                    HouseScore.base_ym == obj_in.base_ym,
                    HouseScore.index_type == obj_in.index_type,
                    HouseScore.is_deleted == False
                )
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            return existing, False
        
        # 새로 생성
        try:
            db_obj = HouseScore(**obj_in.model_dump())
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            return db_obj, True
        except Exception as e:
            await db.rollback()
            raise e
    
    async def update_change_rates(
        self,
        db: AsyncSession,
        *,
        region_id: Optional[int] = None,
        batch_size: int = 500
    ) -> Dict[str, Any]:
        """
        모든 house_scores 레코드의 index_change_rate를 계산하여 업데이트
        
        전월 데이터와 비교하여 변동률을 계산합니다.
        계산식: 현재 index_value - 전월 index_value (단순 차이)
        
        Args:
            db: 데이터베이스 세션
            region_id: 특정 지역 ID만 업데이트 (None이면 전체)
            batch_size: 배치 크기 (기본값: 500)
        
        Returns:
            {
                "total_processed": int,  # 처리한 레코드 수
                "total_updated": int,    # 업데이트된 레코드 수
                "total_skipped": int,    # 전월 데이터가 없어 건너뛴 레코드 수
                "errors": List[str]      # 오류 메시지 목록
            }
        """
        total_processed = 0
        total_updated = 0
        total_skipped = 0
        errors = []
        
        try:
            # 전체 개수 조회
            count_query = select(func.count(HouseScore.index_id)).where(
                HouseScore.is_deleted == False
            )
            if region_id is not None:
                count_query = count_query.where(HouseScore.region_id == region_id)
            
            count_result = await db.execute(count_query)
            total_count = count_result.scalar() or 0
            
            logger.info(f"🔄 index_change_rate 계산 시작: 총 {total_count}개 레코드 (배치 크기: {batch_size})")
            
            if total_count == 0:
                logger.warning("⚠️ 처리할 레코드가 없습니다.")
                return {
                    "total_processed": 0,
                    "total_updated": 0,
                    "total_skipped": 0,
                    "errors": []
                }
            
            offset = 0
            while offset < total_count:
                # 정렬 순서를 유지하며 배치 단위로 조회
                query = select(HouseScore).where(
                    HouseScore.is_deleted == False
                ).order_by(
                    HouseScore.region_id,
                    HouseScore.index_type,
                    HouseScore.base_ym
                ).limit(batch_size).offset(offset)
                
                if region_id is not None:
                    query = query.where(HouseScore.region_id == region_id)
                
                result = await db.execute(query)
                batch_scores = list(result.scalars().all())
                
                if not batch_scores:
                    break
                
                logger.info(f"  📦 배치 처리: {offset + 1}~{offset + len(batch_scores)} / {total_count}")
                
                batch_updated = 0
                # 배치 내 레코드 처리
                for score in batch_scores:
                    total_processed += 1
                    
                    try:
                        # 전월 데이터 조회
                        prev_score = await self.get_previous_month(
                            db,
                            region_id=score.region_id,
                            base_ym=score.base_ym,
                            index_type=score.index_type
                        )
                        
                        if prev_score is None or prev_score.index_value is None:
                            # 전월 데이터가 없으면 건너뛰기
                            total_skipped += 1
                            continue
                        
                        # 변동률 계산 (단순 차이)
                        current_value = float(score.index_value)
                        prev_value = float(prev_score.index_value)
                        
                        change_rate = current_value - prev_value
                        change_rate = round(change_rate, 2)
                        
                        # 객체 직접 업데이트
                        score.index_change_rate = change_rate
                        db.add(score)
                        
                        total_updated += 1
                        batch_updated += 1
                        
                    except Exception as e:
                        error_msg = f"레코드 ID {score.index_id}: {str(e)}"
                        errors.append(error_msg)
                        logger.warning(f"⚠️ {error_msg}")
                        continue
                
                # 배치마다 커밋 (메모리 절약 및 성능 향상)
                if batch_updated > 0:
                    await db.commit()
                    logger.info(f"    ✅ 배치 커밋 완료: {batch_updated}개 업데이트")
                
                offset += batch_size
            
            logger.info(f"✅ 계산 완료: {total_processed}개 처리, {total_updated}개 업데이트, {total_skipped}개 건너뜀")
            
            return {
                "total_processed": total_processed,
                "total_updated": total_updated,
                "total_skipped": total_skipped,
                "errors": errors
            }
            
        except Exception as e:
            await db.rollback()
            logger.error(f"❌ 오류 발생: {e}", exc_info=True)
            raise e


# CRUD 인스턴스 생성
house_score = CRUDHouseScore(HouseScore)
