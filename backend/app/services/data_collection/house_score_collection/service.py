"""
House Score Collection Service
데이터 수집 서비스
국토교통부 API에서 지역 데이터를 가져와서 데이터베이스에 저장하는 비즈니스 로직
"""
import logging
import asyncio
import sys
import csv
import re
import calendar
import xml.etree.ElementTree as ET
from difflib import SequenceMatcher
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import quote
import httpx
from datetime import datetime, date
import os

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, text
from sqlalchemy.orm import joinedload
from app.db.session import AsyncSessionLocal

# 모든 모델을 import하여 SQLAlchemy 관계 설정이 제대로 작동하도록 함
from app.models import (  # noqa: F401
    Account,
    State,
    Apartment,
    ApartDetail,
    Sale,
    Rent,
    HouseScore,
    FavoriteLocation,
    FavoriteApartment,
    MyProperty,
)

from app.core.config import settings
from app.utils.search_utils import BRAND_ENG_TO_KOR
from app.crud.state import state as state_crud

# 새 매칭 모듈 import
from app.services.apt_matching import (
    BRAND_KEYWORD_TO_STANDARD,
    BUILD_YEAR_TOLERANCE,
    VetoChecker,
    get_apt_processor,
)
from app.crud.apartment import apartment as apartment_crud
from app.crud.apart_detail import apart_detail as apart_detail_crud
from app.crud.house_score import house_score as house_score_crud
from app.crud.rent import rent as rent_crud
from app.schemas.state import StateCreate, StateCollectionResponse
from app.schemas.apartment import ApartmentCreate, ApartmentCollectionResponse
from app.schemas.apart_detail import ApartDetailCreate, ApartDetailCollectionResponse
from app.schemas.house_score import HouseScoreCreate, HouseScoreCollectionResponse
from app.schemas.rent import RentCreate, RentCollectionResponse

# 로거 설정
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
    logger.propagate = False  # 부모 로거로 전파하지 않음

# 상수는 constants.py에서 import
from app.services.data_collection.constants import (
    MOLIT_REGION_API_URL,
    MOLIT_APARTMENT_LIST_API_URL,
    MOLIT_APARTMENT_BASIC_API_URL,
    MOLIT_APARTMENT_DETAIL_API_URL,
    REB_DATA_URL,
    MOLIT_SALE_API_URL,
    MOLIT_RENT_API_URL,
    CITY_NAMES,
)



from app.services.data_collection.base import DataCollectionServiceBase
from app.services.data_collection.utils.matching import ApartmentMatcher


class HouseScoreCollectionService(DataCollectionServiceBase):
    """
    House Score Collection Service
    """

    def _get_area_code_from_csv(self, region_code_prefix: str) -> Optional[int]:
        """
        CSV 파일에서 region_code 앞 5자리로 area_code(CLS_ID)를 찾아 반환
        
        Args:
            region_code_prefix: region_code 앞 5자리
        
        Returns:
            area_code (int) 또는 None
        """
        try:
            # CSV 파일 경로 캐싱 (한 번만 확인)
            if not self._csv_path_checked:
                current_file = Path(__file__).resolve()
                current_file_str = str(current_file)
                
                if current_file_str.startswith('/app'):
                    # Docker 컨테이너 내부
                    csv_path = Path('/app/legion_code.csv')
                else:
                    # 로컬 실행: backend/app/services/data_collection.py -> 프로젝트 루트
                    csv_path = current_file.parent.parent.parent.parent / 'legion_code.csv'
                
                if not csv_path.exists():
                    logger.error(f"❌ CSV 파일을 찾을 수 없습니다: {csv_path}")
                    logger.error(f"   현재 파일 경로: {current_file_str}")
                    self._csv_path_checked = True
                    self._csv_path_cache = None
                    return None
                
                self._csv_path_cache = csv_path
                self._csv_path_checked = True
            
            # 캐시된 경로가 없으면 (파일이 없는 경우)
            if self._csv_path_cache is None:
                return None
            
            csv_path = self._csv_path_cache
            
            region_code_prefix = str(region_code_prefix)
            if len(region_code_prefix) < 5:
                region_code_prefix = region_code_prefix[:5].ljust(5, '0')
            
            # CSV 파일 읽기
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            
            # 1. 5자리 일치 검색
            for row in rows:
                region_code = str(row.get('region_code', '')).strip()
                if region_code.startswith(region_code_prefix):
                    return int(row.get('area_code', 0))
            
            # 2. 앞 2자리 일치 검색 (fallback)
            prefix_2 = region_code_prefix[:2]
            for row in rows:
                region_code = str(row.get('region_code', '')).strip()
                if region_code.startswith(prefix_2):
                    return int(row.get('area_code', 0))
            
            return None
        except Exception as e:
            logger.error(f"❌ CSV 파일 읽기 오류: {e}")
            return None
    

    async def collect_house_scores(
        self,
        db: AsyncSession
    ) -> HouseScoreCollectionResponse:
        """
        부동산 지수 데이터 수집
        
        STATES 테이블의 region_code를 사용하여 한국부동산원 API에서 데이터를 가져와서
        HOUSE_SCORES 테이블에 저장합니다.
        """
        total_fetched = 0
        total_saved = 0
        skipped = 0
        errors = []
        
        # 에러 제한 설정
        MAX_CONSECUTIVE_ERRORS = 10  # 연속 에러 최대 횟수
        MAX_ERROR_RATIO = 0.5  # 전체 에러 비율 최대값 (50%)
        MIN_PROCESSED_FOR_RATIO_CHECK = 10  # 에러 비율 체크를 위한 최소 처리 횟수
        consecutive_errors = 0  # 연속 에러 카운터
        total_processed = 0  # 처리한 지역 수
        
        try:
            # REB_API_KEY 확인
            if not settings.REB_API_KEY:
                raise ValueError("REB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
            
            logger.info("=" * 60)
            logger.info("🏠 부동산 지수 데이터 수집 시작")
            logger.info("=" * 60)
            
            # STATES 테이블에서 모든 region_code 조회
            from app.models.state import State
            result = await db.execute(
                select(State.region_id, State.region_code)
                .where(State.is_deleted == False)
            )
            states = result.fetchall()
            
            if not states:
                logger.warning("⚠️ STATES 테이블에 데이터가 없습니다.")
                return HouseScoreCollectionResponse(
                    success=False,
                    total_fetched=0,
                    total_saved=0,
                    skipped=0,
                    errors=[],
                    message=f"모든 지역 수집 완료 (시작 인덱스 {start_region_index} >= 총 지역 수 {len(region_codes)})",
                    api_calls_used=0
                )
            
            # 2단계: 수집할 년월 목록 생성
            year_months = self.generate_year_months(start_year, start_month)
            
            # 시작 인덱스부터의 지역코드만 사용
            remaining_region_codes = region_codes[start_region_index:]
            
            total_combinations = len(remaining_region_codes) * len(year_months)
            
            logger.info(f"📍 수집 대상: {len(remaining_region_codes)}개 지역 × {len(year_months)}개월")
            logger.info(f"📅 수집 기간: {year_months[0]} ~ {year_months[-1]}")
            logger.info(f"📊 총 예상 API 호출: {total_combinations}회")
            logger.info(f"🚀 시작 지역 인덱스: {start_region_index} ({remaining_region_codes[0] if remaining_region_codes else 'N/A'})")
            logger.info("=" * 80)
            
            # 3단계: 각 지역코드 × 년월 조합에 대해 수집
            current_idx = 0
            stopped_by_limit = False
            
            for region_offset, lawd_cd in enumerate(remaining_region_codes):
                actual_region_index = start_region_index + region_offset
                
                logger.info(f"\n{'='*60}")
                logger.info(f"📍 [지역 {actual_region_index + 1}/{len(region_codes)}] 지역코드: {lawd_cd}")
                logger.info(f"   API 호출: {api_calls_used}/{max_api_calls}")
                logger.info(f"{'='*60}")
                
                for ym_idx, deal_ymd in enumerate(year_months):
                    # API 호출 제한 체크
                    if api_calls_used >= max_api_calls:
                        logger.warning(f"⚠️ 일일 API 호출 제한 도달! ({api_calls_used}/{max_api_calls})")
                        stopped_by_limit = True
                        next_region_index = actual_region_index  # 현재 지역부터 재시작
                        break
                    
                    current_idx += 1
                    progress = (current_idx / total_combinations) * 100
                    
                    logger.info(f"   [{current_idx}/{total_combinations}] ({progress:.1f}%) {lawd_cd} - {deal_ymd}")
                    
                    try:
                        # API 호출
                        xml_data = await self.fetch_rent_data(lawd_cd, deal_ymd)
                        api_calls_used += 1
                        last_lawd_cd = lawd_cd
                        last_deal_ymd = deal_ymd
                        
                        # XML → JSON 변환
                        items, result_code, result_msg = self.parse_rent_xml_to_json(xml_data)
                        
                        if result_code not in ["000", "00"]:
                            error_msg = f"{lawd_cd}/{deal_ymd}: API 오류 - {result_msg}"
                            all_errors.append(error_msg)
                            logger.warning(f"      ⚠️ {error_msg}")
                            await asyncio.sleep(0.3)
                            continue
                        
                        if not items:
                            logger.debug(f"      ℹ️ 데이터 없음")
                            await asyncio.sleep(0.2)
                            continue
                        
                        total_fetched += len(items)
                        
                        # 아파트 캐시 (반복 검색 방지)
                        apt_cache = {}
                        saved_count = 0
                        skipped_count = 0
                        
                        for item in items:
                            apt_name = item.get("aptNm", "Unknown")
                            sgg_cd = item.get("sggCd", lawd_cd)
                            
                            try:
                                # 아파트 ID 찾기
                                cache_key = f"{sgg_cd}:{apt_name}"
                                
                                if cache_key in apt_cache:
                                    apt_id = apt_cache[cache_key]
                                elif cache_key not in apt_cache:
                                    apartment = await self.find_apartment_by_name_and_region(
                                        db, apt_name, sgg_cd
                                    )
                                    
                                    if not apartment:
                                        apt_cache[cache_key] = None
                                        continue
                                    
                                    apt_id = apartment.apt_id
                                    apt_cache[cache_key] = apt_id
                                
                                if apt_cache.get(cache_key) is None:
                                    continue
                                
                                # 페이지 응답 성공 확인
                                page_head_data = page_stts_data[0].get("head", [])
                                page_result_data = {}
                                for item in page_head_data:
                                    if isinstance(item, dict) and "RESULT" in item:
                                        page_result_data = item["RESULT"]
                                        break
                                
                                page_response_code = page_result_data.get("CODE", "UNKNOWN")
                                if page_response_code != "INFO-000":
                                    logger.warning(f"   ⚠️ {region_code_str}: 페이지 {page_index} API 오류 [CODE: {page_response_code}] - 건너뜀")
                                    continue
                                
                                # DB 저장
                                _, is_created = await rent_crud.create_or_skip(
                                    db,
                                    obj_in=rent_create
                                )
                                
                                if is_created:
                                    saved_count += 1
                                else:
                                    skipped_count += 1
                                    
                            except Exception as e:
                                pass  # 개별 오류는 무시하고 계속 진행
                        
                        total_saved += saved_count
                        total_skipped += skipped_count
                        
                        if saved_count > 0:
                            logger.info(f"      ✅ {len(items)}건 중 {saved_count}건 저장, {skipped_count}건 건너뜀")
                        
                    except httpx.HTTPError as e:
                        error_msg = f"{lawd_cd}/{deal_ymd}: HTTP 오류 - {str(e)}"
                        all_errors.append(error_msg)
                        logger.warning(f"      ⚠️ {error_msg}")
                    except Exception as e:
                        error_msg = f"{lawd_cd}/{deal_ymd}: 오류 - {str(e)}"
                        all_errors.append(error_msg)
                        logger.warning(f"      ⚠️ {error_msg}")
                    
                    # API 호출 제한 방지 딜레이
                    await asyncio.sleep(0.3)
                
                # API 제한으로 중단된 경우
                if stopped_by_limit:
                    break
            
            # 모든 지역 완료 체크
            if not stopped_by_limit:
                next_region_index = None  # 모두 완료
            
            # 결과 출력
            logger.info("\n" + "=" * 80)
            if stopped_by_limit:
                logger.info("⏸️ 전월세 실거래가 수집 일시 중단 (일일 API 호출 제한)")
                logger.info(f"   ➡️ 다음에 시작할 지역 인덱스: {next_region_index}")
            else:
                logger.info("🎉 전월세 실거래가 전체 수집 완료!")
            logger.info(f"   📊 총 수집: {total_fetched}건")
            logger.info(f"   💾 저장: {total_saved}건")
            logger.info(f"   ⏭️ 건너뜀: {total_skipped}건")
            logger.info(f"   🔄 API 호출: {api_calls_used}회")
            logger.info(f"   ⚠️ 오류: {len(all_errors)}건")
            logger.info("=" * 80)
            
            message = f"수집 완료: {total_saved}건 저장, {total_skipped}건 건너뜀"
            if stopped_by_limit:
                message = f"일일 제한으로 중단 (다음 시작: 지역 인덱스 {next_region_index}): {total_saved}건 저장"
            
            return RentCollectionResponse(
                success=True,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=total_skipped,
                errors=all_errors[:100],  # 최대 100개만
                message=message,
                lawd_cd=last_lawd_cd,
                deal_ymd=last_deal_ymd,
                api_calls_used=api_calls_used,
                next_region_index=next_region_index
            )
            
        except Exception as e:
            logger.error(f"❌ 전체 수집 실패: {e}", exc_info=True)
            return RentCollectionResponse(
                success=False,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=total_skipped,
                errors=all_errors + [str(e)],
                message=f"전체 수집 실패: {str(e)}",
                api_calls_used=api_calls_used,
                next_region_index=start_region_index  # 실패 시 현재 위치 반환
            )


