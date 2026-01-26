"""
House Volume Collection Service
데이터 수집 서비스
한국부동산원 API에서 지역별 부동산 거래량 데이터를 가져와서 데이터베이스에 저장하는 비즈니스 로직
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
    HouseVolume,
    FavoriteLocation,
    FavoriteApartment,
    MyProperty,
)

from app.core.config import settings
from app.utils.search_utils import BRAND_ENG_TO_KOR
from app.crud.state import state as state_crud
from app.crud.house_volume import house_volume as house_volume_crud
from app.schemas.house_volume import HouseVolumeCreate, HouseVolumeCollectionResponse

# 상수는 constants.py에서 import
from app.services.data_collection.constants import (
    REB_DATA_URL,
)

from app.services.data_collection.base import DataCollectionServiceBase

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


class HouseVolumeCollectionService(DataCollectionServiceBase):
    """
    House Volume Collection Service
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
                    csv_path = Path('/app/legion_code2.csv')
                else:
                    # 로컬 실행: backend/app/services/data_collection/house_volume_collection/service.py -> 프로젝트 루트
                    csv_path = current_file.parent.parent.parent.parent.parent / 'legion_code2.csv'
                
                if not csv_path.exists():
                    logger.error(f" CSV 파일을 찾을 수 없습니다: {csv_path}")
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
            logger.error(f" CSV 파일 읽기 오류: {e}")
            return None
    

    async def collect_house_volumes(
        self,
        db: AsyncSession
    ) -> HouseVolumeCollectionResponse:
        """
        부동산 거래량 데이터 수집
        
        STATES 테이블의 region_code를 사용하여 한국부동산원 API에서 데이터를 가져와서
        HOUSE_VOLUMES 테이블에 저장합니다.
        """
        total_fetched = 0
        total_saved = 0
        skipped = 0
        pre_check_skipped = 0  # 사전 체크로 스킵된 지역 수
        errors = []
        CONCURRENT_LIMIT = 50  # 동시 처리 수: 50개
        semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
        BATCH_SIZE = 100  # 100개씩 배치로 처리
        api_calls_used = 0
        api_calls_lock = asyncio.Lock()  # API 호출 카운터 동기화용
        
        try:
            # REB_API_KEY 확인 및 여러 키 지원
            reb_api_keys = []
            
            # REB_API_KEYS가 있으면 우선 사용 (콤마로 구분)
            reb_api_keys_str = getattr(settings, 'REB_API_KEYS', None)
            if reb_api_keys_str:
                reb_api_keys = [key.strip() for key in reb_api_keys_str.split(",") if key.strip()]
            
            # REB_API_KEYS가 없으면 REB_API_KEY 사용 (레거시 호환)
            if not reb_api_keys and settings.REB_API_KEY:
                reb_api_keys = [settings.REB_API_KEY]
            
            if not reb_api_keys:
                raise ValueError("REB_API_KEY 또는 REB_API_KEYS가 설정되지 않았습니다. .env 파일을 확인하세요.")
            
            # API 키별 호출 횟수 추적 (균등 분산을 위해)
            api_key_usage = {key: 0 for key in reb_api_keys}
            api_key_lock = asyncio.Lock()  # API 키 선택 동기화용
            
            logger.info("=" * 60)
            logger.info(" [고성능 모드] 부동산 거래량 데이터 수집 시작")
            logger.info(f" 사용 가능한 API 키: {len(reb_api_keys)}개")
            logger.info("=" * 60)
            
            # 수집 설정
            start_year = 2020
            start_month = 1
            START_WRTTIME = "202001"  # 수집 시작 년월 (YYYYMM)
            max_api_calls = 10000 * len(reb_api_keys)  # 키 개수만큼 제한 증가
            max_api_calls_per_key = 10000  # 키당 최대 호출 수
            
            # REB API 고정 파라미터
            STATBL_ID = "A_2024_00554"  # 통계표 ID (거래량)
            DTACYCLE_CD = "MM"  # 월별 데이터
            
            # STATES 테이블에서 모든 region_code 조회
            from app.models.state import State
            result = await db.execute(
                select(State.region_id, State.region_code)
                .where(State.is_deleted == False)
            )
            states = result.fetchall()
            
            if not states:
                logger.warning(" STATES 테이블에 데이터가 없습니다.")
                return HouseVolumeCollectionResponse(
                    success=False,
                    total_fetched=0,
                    total_saved=0,
                    skipped=0,
                    errors=[],
                    message="STATES 테이블에 데이터가 없습니다."
                )
            
            logger.info(f" 수집 대상: {len(states)}개 지역")
            logger.info(f" 수집 기간: {START_WRTTIME} ~ 현재")
            logger.info(f" 총 예상 API 호출: {len(states)}회 (각 지역당 1회)")
            logger.info(f" 동시 처리 수: {CONCURRENT_LIMIT}개, 배치 크기: {BATCH_SIZE}개")
            logger.info(f" API 키별 최대 호출: {max_api_calls_per_key}회, 전체 최대: {max_api_calls}회")
            logger.info("=" * 80)
            
            async def _process_single_region(state, state_idx: int) -> Dict[str, Any]:
                """단일 지역 처리 함수 (독립 DB 세션 사용)"""
                nonlocal total_fetched, total_saved, skipped, pre_check_skipped, api_calls_used, api_key_usage
                
                region_id = state.region_id
                region_code = state.region_code
                region_fetched = 0
                region_saved = 0
                region_skipped = 0
                region_errors = []
                
                # 각 지역마다 독립적인 DB 세션 생성 (병렬 처리 시 세션 충돌 방지)
                async with AsyncSessionLocal() as local_db:
                    async with semaphore:
                        try:
                            # API 호출 제한 체크 (전체 및 키별)
                            async with api_calls_lock:
                                # 전체 제한 체크
                                if api_calls_used >= max_api_calls:
                                    return {
                                        "success": False,
                                        "error": f"전체 API 호출 제한 도달 ({api_calls_used}/{max_api_calls})",
                                        "region_code": region_code,
                                        "fetched": 0,
                                        "saved": 0,
                                        "skipped": 0
                                    }
                            
                            # 사용 가능한 API 키 찾기 (제한에 도달하지 않은 키)
                            available_key = None
                            async with api_key_lock:
                                # 사용 횟수가 가장 적고 제한에 도달하지 않은 키 선택
                                min_usage = min(api_key_usage.values())
                                for key, usage in api_key_usage.items():
                                    if usage < max_api_calls_per_key:
                                        if usage == min_usage:
                                            available_key = key
                                            break
                                
                                # 모든 키가 제한에 도달했는지 확인
                                if not available_key:
                                    return {
                                        "success": False,
                                        "error": f"모든 API 키의 호출 제한 도달 (키당 {max_api_calls_per_key}회)",
                                        "region_code": region_code,
                                        "fetched": 0,
                                        "saved": 0,
                                        "skipped": 0
                                    }
                                
                                # 선택된 키의 사용 횟수 증가
                                api_key_usage[available_key] += 1
                            
                            # 사전 중복 체크: API 호출 전에 이미 수집된 데이터가 있는지 확인
                            from app.models.house_volume import HouseVolume
                            
                            # 예상 개수 계산: 2020년 1월 ~ 현재까지의 개월 수
                            current_date = datetime.now()
                            expected_months = ((current_date.year - start_year) * 12) + (current_date.month - start_month) + 1
                            
                            # DB에서 해당 region_id의 데이터 개수 확인
                            existing_count_result = await local_db.execute(
                                select(func.count(HouseVolume.volume_id))
                                .where(
                                    and_(
                                        HouseVolume.region_id == region_id,
                                        HouseVolume.base_ym >= START_WRTTIME,
                                        HouseVolume.is_deleted == False
                                    )
                                )
                            )
                            existing_count = existing_count_result.scalar() or 0
                            
                            # 이미 충분한 데이터가 있으면 API 호출 없이 스킵
                            if existing_count >= expected_months:
                                return {
                                    "success": True,
                                    "error": None,
                                    "region_code": region_code,
                                    "fetched": 0,
                                    "saved": 0,
                                    "skipped": existing_count,
                                    "skip_reason": f"이미 수집 완료 (기존 {existing_count}건 >= 예상 {expected_months}건)",
                                    "pre_check_skip": True
                                }
                            
                            # region_code에서 area_code (CLS_ID) 추출
                            region_code_prefix = str(region_code)[:5] if len(str(region_code)) >= 5 else str(region_code)
                            area_code = self._get_area_code_from_csv(region_code_prefix)
                            
                            if not area_code:
                                # area_code가 없으면 -1로 처리
                                area_code = -1
                                logger.warning(f" {region_code}: area_code를 찾을 수 없어 -1로 처리합니다.")
                            
                            # REB API 호출 (START_WRTTIME 파라미터 사용)
                            current_api_key = available_key
                            
                            params = {
                                "KEY": current_api_key,
                                "Type": "json",
                                "pIndex": 1,
                                "pSize": 1000,
                                "STATBL_ID": STATBL_ID,
                                "DTACYCLE_CD": DTACYCLE_CD,
                                "CLS_ID": str(area_code),
                                "START_WRTTIME": START_WRTTIME
                            }
                            
                            response = await self.fetch_with_retry(REB_DATA_URL, params)
                            
                            async with api_calls_lock:
                                api_calls_used += 1
                            
                            # 응답 파싱
                            if not response or not isinstance(response, dict):
                                return {
                                    "success": False,
                                    "error": f"API 응답이 유효하지 않습니다.",
                                    "region_code": region_code,
                                    "fetched": 0,
                                    "saved": 0,
                                    "skipped": 0
                                }
                            
                            stts_data = response.get("SttsApiTblData", [])
                            if not isinstance(stts_data, list) or len(stts_data) < 2:
                                return {
                                    "success": False,
                                    "error": f"API 응답 구조가 올바르지 않습니다.",
                                    "region_code": region_code,
                                    "fetched": 0,
                                    "saved": 0,
                                    "skipped": 0
                                }
                            
                            # RESULT 확인
                            head_data = stts_data[0].get("head", [])
                            result_data = {}
                            total_count = 0
                            for item in head_data:
                                if isinstance(item, dict):
                                    if "RESULT" in item:
                                        result_data = item["RESULT"]
                                    if "list_total_count" in item:
                                        total_count = int(item["list_total_count"])
                                    elif "totalCount" in item:
                                        total_count = int(item["totalCount"])
                            
                            response_code = result_data.get("CODE", "UNKNOWN")
                            if response_code != "INFO-000":
                                response_message = result_data.get("MESSAGE", "")
                                return {
                                    "success": False,
                                    "error": f"API 오류 [{response_code}] - {response_message}",
                                    "region_code": region_code,
                                    "fetched": 0,
                                    "saved": 0,
                                    "skipped": 0
                                }
                            
                            # ROW 데이터 추출
                            row_data = stts_data[1].get("row", [])
                            if not isinstance(row_data, list):
                                row_data = [row_data] if row_data else []
                            
                            # 페이지네이션 처리
                            all_row_data = row_data[:]
                            page = 1
                            while total_count > len(all_row_data) and len(row_data) >= 1000:
                                page += 1
                                params["pIndex"] = page
                                params["KEY"] = current_api_key
                                
                                page_response = await self.fetch_with_retry(REB_DATA_URL, params)
                                
                                async with api_calls_lock:
                                    api_calls_used += 1
                                
                                async with api_key_lock:
                                    api_key_usage[current_api_key] += 1
                                
                                page_stts_data = page_response.get("SttsApiTblData", [])
                                if isinstance(page_stts_data, list) and len(page_stts_data) >= 2:
                                    page_row_data = page_stts_data[1].get("row", [])
                                    if not isinstance(page_row_data, list):
                                        page_row_data = [page_row_data] if page_row_data else []
                                    all_row_data.extend(page_row_data)
                                    row_data = page_row_data
                                else:
                                    break
                            
                            if not all_row_data:
                                return {
                                    "success": True,
                                    "error": None,
                                    "region_code": region_code,
                                    "fetched": 0,
                                    "saved": 0,
                                    "skipped": 0
                                }
                            
                            region_fetched = len(all_row_data)
                            
                            # 같은 base_ym에 대해 ITM_NM별로 데이터를 그룹화
                            # base_ym -> { '동(호)수': volume_value, '면적': volume_area }
                            volume_data_by_ym: Dict[str, Dict[str, Optional[float]]] = {}
                            
                            for row in all_row_data:
                                try:
                                    # 기준년월 추출 (WRTTIME_IDTFR_ID)
                                    wrttime_idtfr_id = str(row.get("WRTTIME_IDTFR_ID", "")).strip()
                                    if len(wrttime_idtfr_id) < 6:
                                        continue
                                    
                                    base_ym = wrttime_idtfr_id[:6]
                                    
                                    # ITM_NM 추출 ('동(호)수' 또는 '면적')
                                    itm_nm = str(row.get("ITM_NM", "")).strip()
                                    
                                    # DTA_VAL 추출
                                    dta_val_str = row.get("DTA_VAL", "0")
                                    try:
                                        dta_val = int(float(dta_val_str))  # float()로 먼저 변환 후 int()로 변환 (소수점 제거)
                                    except (ValueError, TypeError):
                                        dta_val = None
                                    
                                    # base_ym별로 데이터 그룹화
                                    if base_ym not in volume_data_by_ym:
                                        volume_data_by_ym[base_ym] = {
                                            'volume_value': None,
                                            'volume_area': None
                                        }
                                    
                                    # ITM_NM에 따라 적절한 필드에 저장
                                    if '동(호)수' in itm_nm or '호수' in itm_nm:
                                        volume_data_by_ym[base_ym]['volume_value'] = dta_val if dta_val is not None else None
                                    elif '면적' in itm_nm:
                                        volume_data_by_ym[base_ym]['volume_area'] = dta_val
                                    
                                except Exception as e:
                                    base_ym_str = base_ym if 'base_ym' in locals() else "Unknown"
                                    error_msg = f"{region_code}/{base_ym_str}: 데이터 파싱 오류 - {str(e)}"
                                    region_errors.append(error_msg)
                                    continue
                            
                            # 그룹화된 데이터를 HouseVolumeCreate로 변환
                            house_volumes_to_save = []
                            
                            for base_ym, data in volume_data_by_ym.items():
                                # volume_value는 필수 (없으면 건너뜀)
                                if data['volume_value'] is None:
                                    continue
                                
                                house_volume_create = HouseVolumeCreate(
                                    region_id=region_id,
                                    base_ym=base_ym,
                                    volume_value=data['volume_value'],
                                    volume_area=data.get('volume_area')
                                )
                                
                                house_volumes_to_save.append(house_volume_create)
                            
                            # 배치로 중복 체크 및 저장
                            saved_count = 0
                            skipped_count = 0
                            
                            for house_volume_create in house_volumes_to_save:
                                try:
                                    # DB 저장 (중복 체크) - 독립 세션 사용
                                    _, is_created = await house_volume_crud.create_or_skip(
                                        local_db,
                                        obj_in=house_volume_create
                                    )
                                    
                                    if is_created:
                                        saved_count += 1
                                    else:
                                        skipped_count += 1
                                        
                                except Exception as e:
                                    error_msg = f"{region_code}/{house_volume_create.base_ym}: 데이터 저장 오류 - {str(e)}"
                                    region_errors.append(error_msg)
                                    continue
                            
                            region_saved = saved_count
                            region_skipped = skipped_count
                            
                            return {
                                "success": True,
                                "error": None,
                                "region_code": region_code,
                                "fetched": region_fetched,
                                "saved": region_saved,
                                "skipped": region_skipped,
                                "errors": region_errors
                            }
                        except httpx.HTTPError as e:
                            return {
                                "success": False,
                                "error": f"HTTP 오류 - {str(e)}",
                                "region_code": region_code,
                                "fetched": 0,
                                "saved": 0,
                                "skipped": 0
                            }
                        except Exception as e:
                            return {
                                "success": False,
                                "error": f"오류 - {str(e)}",
                                "region_code": region_code,
                                "fetched": 0,
                                "saved": 0,
                                "skipped": 0
                            }
                        finally:
                            # 세션 정리
                            try:
                                await local_db.close()
                            except Exception:
                                pass
            
            # 배치 단위로 처리
            total_processed = 0
            while total_processed < len(states):
                batch = states[total_processed:total_processed + BATCH_SIZE]
                if not batch:
                    break
                
                # 병렬 처리
                tasks = [_process_single_region(state, total_processed + idx) for idx, state in enumerate(batch)]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # 결과 집계
                for idx, result in enumerate(results):
                    if isinstance(result, Exception):
                        error_msg = f"처리 중 예외 발생: {str(result)}"
                        errors.append(error_msg)
                        logger.error(f"    예외 발생: {error_msg}")
                    elif isinstance(result, dict):
                        if result.get("success"):
                            total_fetched += result.get("fetched", 0)
                            total_saved += result.get("saved", 0)
                            skipped += result.get("skipped", 0)
                            
                            if result.get("pre_check_skip"):
                                pre_check_skipped += 1
                            
                            region_errors = result.get("errors", [])
                            if region_errors:
                                errors.extend(region_errors)
                            
                            skip_reason = result.get("skip_reason")
                            if skip_reason:
                                logger.info(
                                    f"   ⏭ [{total_processed + idx + 1}/{len(states)}] {result['region_code']}: "
                                    f"사전 체크로 스킵 ({skip_reason})"
                                )
                            elif result.get("fetched", 0) > 0:
                                logger.info(
                                    f"    [{total_processed + idx + 1}/{len(states)}] {result['region_code']}: "
                                    f"{result['fetched']}건 수집, {result['saved']}건 저장, {result['skipped']}건 건너뜀"
                                )
                        else:
                            error_msg = f"{result.get('region_code', 'Unknown')}: {result.get('error', '알 수 없는 오류')}"
                            errors.append(error_msg)
                            logger.warning(f"    [{total_processed + idx + 1}/{len(states)}] {error_msg}")
                
                total_processed += len(batch)
                
                # 배치 간 딜레이
                if total_processed < len(states):
                    await asyncio.sleep(0.5)
            
            # 결과 출력
            logger.info("\n" + "=" * 80)
            logger.info(" 부동산 거래량 데이터 수집 완료!")
            logger.info(f"    총 수집: {total_fetched}건")
            logger.info(f"    저장: {total_saved}건")
            logger.info(f"   ⏭ 건너뜀: {skipped}건 (중복 데이터)")
            logger.info(f"    사전 체크 스킵: {pre_check_skipped}개 지역 (API 호출 없음)")
            logger.info(f"    API 호출: {api_calls_used}회 (사전 체크로 {pre_check_skipped}개 지역 절약)")
            logger.info(f"    API 키별 사용량:")
            for key_idx, (key, usage) in enumerate(api_key_usage.items(), 1):
                key_display = f"{key[:8]}..." if len(key) > 12 else key
                logger.info(f"      키 {key_idx}: {usage}회 / {max_api_calls_per_key}회 ({key_display})")
            logger.info(f"    오류: {len(errors)}건")
            logger.info("=" * 80)
            
            message = f"고속 수집 완료: {total_saved}건 저장, {skipped}건 건너뜀"
            
            return HouseVolumeCollectionResponse(
                success=True,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors[:100],  # 최대 100개만
                message=message
            )
            
        except Exception as e:
            logger.error(f" 전체 수집 실패: {e}", exc_info=True)
            return HouseVolumeCollectionResponse(
                success=False,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors + [str(e)],
                message=f"전체 수집 실패: {str(e)}"
            )