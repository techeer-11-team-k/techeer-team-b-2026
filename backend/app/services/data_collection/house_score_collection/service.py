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
from collections import namedtuple
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
            
            # 1. 정확히 5자리 일치 검색 (최우선)
            if len(region_code_prefix) == 5:
                for row in rows:
                    region_code = str(row.get('region_code', '')).strip()
                    if region_code == region_code_prefix or region_code.startswith(region_code_prefix):
                        area_code = int(row.get('area_code', 0))
                        if area_code > 0:
                            return area_code
            
            # 2. 앞 2자리 일치 검색 (시도 레벨)
            # 시도 코드 매핑 (시도별 대표 area_code 찾기)
            prefix_2 = region_code_prefix[:2] if len(region_code_prefix) >= 2 else region_code_prefix
            if len(prefix_2) == 2:
                # 시도 코드별 매핑 (앞 2자리로 시작하는 region_code 중에서 선택)
                matched_rows = []
                for row in rows:
                    region_code = str(row.get('region_code', '')).strip()
                    if region_code.startswith(prefix_2):
                        area_code = int(row.get('area_code', 0))
                        if area_code > 0:
                            matched_rows.append((region_code, area_code))
                
                if matched_rows:
                    # 같은 길이의 region_code 중에서 가장 짧은 것을 우선 (시도 레벨)
                    # 예: "51" -> "51000" 같은 것을 찾음
                    matched_rows.sort(key=lambda x: (len(x[0]), x[0]))
                    # 2자리로 시작하는 것 중 가장 짧은 것을 반환 (시도 레벨 데이터)
                    return matched_rows[0][1]
            
            return None
        except Exception as e:
            logger.error(f" CSV 파일 읽기 오류: {e}")
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
        pre_check_skipped = 0  # 사전 체크로 스킵된 지역 수
        errors = []
        CONCURRENT_LIMIT = 30  # 동시 처리 수: 30개 (시군구 확장으로 안정성 우선)
        semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
        BATCH_SIZE = 50  # 50개씩 배치로 처리 (시군구 확장으로 안정성 우선)
        api_calls_used = 0
        api_calls_lock = asyncio.Lock()  # API 호출 카운터 동기화용
        
        try:
            # REB_API_KEY 확인 및 여러 키 지원
            reb_api_keys = []
            
            # REB_API_KEYS가 있으면 우선 사용 (콤마로 구분)
            # getattr를 사용하여 안전하게 접근 (속성이 없으면 None 반환)
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
            logger.info(" [고성능 모드] 부동산 지수 데이터 수집 시작")
            logger.info(f" 사용 가능한 API 키: {len(reb_api_keys)}개")
            logger.info("=" * 60)
            
            # 수집 설정
            start_year = 2020
            start_month = 1
            START_WRTTIME = "202001"  # 수집 시작 년월 (YYYYMM)
            max_api_calls = 10000 * len(reb_api_keys)  # 키 개수만큼 제한 증가
            max_api_calls_per_key = 10000  # 키당 최대 호출 수
            
            # REB API 고정 파라미터
            STATBL_ID = "A_2024_00045"  # 통계표 ID
            DTACYCLE_CD = "MM"  # 월별 데이터
            
            # STATES 테이블에서 시군구만 조회 (읍면동리 제외)
            from app.models.state import State
            
            # 모든 지역 조회 후 Python에서 시군구만 필터링
            # 시군구: region_code의 마지막 5자리가 "00000"인 것만
            # 읍면동리는 마지막 5자리가 "00000"이 아니므로 제외됨
            all_states_result = await db.execute(
                select(State.region_id, State.region_code, State.city_name, State.region_name)
                .where(State.is_deleted == False)
            )
            all_states = all_states_result.fetchall()
            
            # 시군구만 필터링: region_code의 마지막 5자리가 "00000"인 것만 포함
            # 시도 레벨도 포함 (마지막 8자리가 "00000000"인 경우도 시군구로 간주)
            all_states = [
                s for s in all_states 
                if str(s.region_code)[-5:] == "00000"  # 시군구 레벨 (마지막 5자리가 "00000")
            ]
            
            # 시군구만 선택 (시도 포함, 읍면동리 제외)
            # legion_code.csv에 area_code가 있는 지역만 포함
            StateRow = namedtuple('StateRow', ['region_id', 'region_code', 'city_name', 'region_name'])
            states = []
            skipped_regions = []  # CSV에 없어서 스킵된 지역
            
            for state in all_states:
                region_code_str = str(state.region_code)
                
                # legion_code.csv에서 area_code 찾기
                if len(region_code_str) >= 5:
                    region_code_prefix = region_code_str[:5]
                else:
                    region_code_prefix = region_code_str[:2] if len(region_code_str) >= 2 else region_code_str
                
                # 사전 체크: CSV에 있는 경우만 포함
                area_code = self._get_area_code_from_csv(region_code_prefix)
                
                if area_code:
                    states.append(StateRow(
                        region_id=state.region_id,
                        region_code=state.region_code,
                        city_name=state.city_name,
                        region_name=state.region_name
                    ))
                else:
                    skipped_regions.append({
                        'city_name': state.city_name,
                        'region_name': state.region_name,
                        'region_code': region_code_str
                    })
            
            if not states:
                logger.warning(" STATES 테이블에 데이터가 없습니다.")
                return HouseScoreCollectionResponse(
                    success=False,
                    total_fetched=0,
                    total_saved=0,
                    skipped=0,
                    errors=[],
                    message="STATES 테이블에 데이터가 없습니다."
                )
            
            # 시도와 시군구 구분 카운트
            sido_count = sum(1 for s in states if len(str(s.region_code)) <= 8 and str(s.region_code).endswith('00000'))
            sigungu_count = len(states) - sido_count
            
            logger.info(f" 수집 대상: {len(states)}개 지역 (시도 {sido_count}개 + 시군구 {sigungu_count}개, 읍면동리 제외)")
            if skipped_regions:
                logger.warning(f" CSV 매칭 실패로 스킵된 지역: {len(skipped_regions)}개")
                # 처음 5개만 로그 출력
                for region in skipped_regions[:5]:
                    logger.warning(f"   - {region['city_name']} {region['region_name']} (code: {region['region_code']})")
                if len(skipped_regions) > 5:
                    logger.warning(f"   ... 외 {len(skipped_regions) - 5}개 지역")
            
            # 시도별 시군구 개수 통계
            city_counts = {}
            for state in states:
                city_name = state.city_name
                if city_name not in city_counts:
                    city_counts[city_name] = 0
                city_counts[city_name] += 1
            
            logger.info(f"   시도별 수집 지역 수:")
            for city_name in sorted(city_counts.keys()):
                logger.info(f"      {city_name}: {city_counts[city_name]}개")
            
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
                city_name = state.city_name
                region_name = state.region_name
                region_fetched = 0
                region_saved = 0
                region_skipped = 0
                region_errors = []
                
                # 지역명 생성 (시도 + 시군구)
                full_region_name = f"{city_name} {region_name}" if region_name else city_name
                
                logger.info(f"    [{state_idx + 1}/{len(states)}] 처리 시작: {full_region_name} (region_id={region_id}, region_code={region_code})")
                
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
                            from app.models.house_score import HouseScore
                            
                            # 예상 개수 계산: 2020년 1월 ~ 현재까지의 개월 수
                            current_date = datetime.now()
                            expected_months = ((current_date.year - start_year) * 12) + (current_date.month - start_month) + 1
                            # 지수 유형별로 데이터가 있을 수 있으므로 최소 예상 개수는 expected_months (1개 유형 기준)
                            # 실제로는 APT, HOUSE, ALL 등 여러 유형이 있을 수 있지만, 
                            # 최소한 expected_months 개의 데이터가 있으면 이미 수집된 것으로 간주
                            
                            # DB에서 해당 region_id의 데이터 개수 확인
                            existing_count_result = await local_db.execute(
                                select(func.count(HouseScore.index_id))
                                .where(
                                    and_(
                                        HouseScore.region_id == region_id,
                                        HouseScore.base_ym >= START_WRTTIME,
                                        HouseScore.is_deleted == False
                                    )
                                )
                            )
                            existing_count = existing_count_result.scalar() or 0
                            
                            # 이미 충분한 데이터가 있으면 API 호출 없이 스킵
                            if existing_count >= expected_months:
                                # 모든 데이터가 이미 있는 것으로 간주
                                return {
                                    "success": True,
                                    "error": None,
                                    "region_code": region_code,
                                    "fetched": 0,
                                    "saved": 0,
                                    "skipped": existing_count,  # 건너뛴 개수로 표시
                                    "skip_reason": f"이미 수집 완료 (기존 {existing_count}건 >= 예상 {expected_months}건)",
                                    "pre_check_skip": True  # 사전 체크로 스킵됨
                                }
                            
                            # region_code에서 area_code (CLS_ID) 추출
                            region_code_str = str(region_code)
                            # 시도 레벨이므로 앞 2자리(시도 코드) 또는 5자리 사용
                            if len(region_code_str) >= 5:
                                region_code_prefix = region_code_str[:5]
                            else:
                                # 2자리 시도 코드로 시작하는 region_code 찾기
                                region_code_prefix = region_code_str[:2] if len(region_code_str) >= 2 else region_code_str
                            
                            area_code = self._get_area_code_from_csv(region_code_prefix)
                            
                            if not area_code:
                                logger.warning(f"    area_code 변환 실패: region_code={region_code}, prefix={region_code_prefix}")
                                return {
                                    "success": False,
                                    "error": f"area_code를 찾을 수 없습니다. (region_code: {region_code}, prefix: {region_code_prefix})",
                                    "region_code": region_code,
                                    "fetched": 0,
                                    "saved": 0,
                                    "skipped": 0
                                }
                            
                            logger.info(f"    [{state_idx + 1}/{len(states)}] area_code 변환 성공: region_code={region_code} -> area_code={area_code}")
                            
                            # REB API 호출 (START_WRTTIME 파라미터 사용)
                            # 선택된 API 키 사용
                            current_api_key = available_key
                            
                            params = {
                                "KEY": current_api_key,
                                "Type": "json",
                                "pIndex": 1,
                                "pSize": 1000,
                                "STATBL_ID": STATBL_ID,
                                "DTACYCLE_CD": DTACYCLE_CD,
                                "CLS_ID": str(area_code),
                                "START_WRTTIME": START_WRTTIME  # 2020년 1월부터 데이터 조회
                            }
                            
                            # API 호출 URL 및 파라미터 로깅
                            safe_params = {k: (v if k != "KEY" else "***") for k, v in params.items()}
                            from urllib.parse import urlencode
                            actual_url = f"{REB_DATA_URL}?{urlencode(params)}"
                            logger.info(f"    [{state_idx + 1}/{len(states)}] REB API 호출: {full_region_name} (area_code={area_code})")
                            logger.info(f"      URL: {actual_url[:200]}...")
                            logger.info(f"      파라미터: {safe_params}")
                            
                            response = await self.fetch_with_retry(REB_DATA_URL, params)
                            
                            async with api_calls_lock:
                                api_calls_used += 1
                            
                            logger.info(f"    [{state_idx + 1}/{len(states)}] API 응답 수신: {full_region_name}")
                            
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
                            logger.info(f"    [{state_idx + 1}/{len(states)}] API 응답 코드: {response_code} (총 {total_count}건)")
                            
                            if response_code != "INFO-000":
                                response_message = result_data.get("MESSAGE", "")
                                logger.error(f"    [{state_idx + 1}/{len(states)}] API 오류 [{response_code}]: {response_message}")
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
                            logger.info(f"    [{state_idx + 1}/{len(states)}] 데이터 추출: {len(row_data) if isinstance(row_data, list) else 0}건")
                            if not isinstance(row_data, list):
                                row_data = [row_data] if row_data else []
                            
                            # 페이지네이션 처리 (total_count가 pSize보다 큰 경우)
                            all_row_data = row_data[:]
                            page = 1
                            while total_count > len(all_row_data) and len(row_data) >= 1000:
                                page += 1
                                params["pIndex"] = page
                                
                                # 페이지네이션 시에도 같은 API 키 사용
                                params["KEY"] = current_api_key
                                
                                page_response = await self.fetch_with_retry(REB_DATA_URL, params)
                                
                                async with api_calls_lock:
                                    api_calls_used += 1
                                
                                # 페이지네이션 호출도 같은 키 사용 횟수 증가
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
                            
                            # 각 row를 HouseScoreCreate로 변환하여 모아두기 (배치 커밋용)
                            house_scores_to_save = []
                            
                            for row in all_row_data:
                                base_ym = None  # 기본값 설정
                                try:
                                    # 기준년월 추출 (WRTTIME_IDTFR_ID)
                                    wrttime_idtfr_id = str(row.get("WRTTIME_IDTFR_ID", "")).strip()
                                    if len(wrttime_idtfr_id) < 6:
                                        continue
                                    
                                    base_ym = wrttime_idtfr_id[:6]
                                    
                                    # 지수 값 추출 (DTA_VAL)
                                    index_value_str = row.get("DTA_VAL", "0")
                                    try:
                                        index_value = float(index_value_str)
                                    except (ValueError, TypeError):
                                        index_value = 0.0
                                    
                                    # 지수 유형 추출 (ITM_NM) 및 매핑
                                    itm_nm = str(row.get("ITM_NM", "")).strip().upper()
                                    index_type = "APT"  # 기본값
                                    
                                    # ITM_NM을 지수 유형으로 매핑
                                    if "아파트" in itm_nm or "APT" in itm_nm or "APARTMENT" in itm_nm:
                                        index_type = "APT"
                                    elif "단독주택" in itm_nm or "HOUSE" in itm_nm or "단독" in itm_nm:
                                        index_type = "HOUSE"
                                    elif "전체" in itm_nm or "ALL" in itm_nm or "종합" in itm_nm:
                                        index_type = "ALL"
                                    
                                    # 데이터 출처 (STATBL_ID)
                                    data_source = str(row.get("STATBL_ID", STATBL_ID)).strip()
                                    
                                    # 전월 대비 변동률은 비워둠 (None)
                                    index_change_rate = None
                                    
                                    # HouseScore 생성
                                    house_score_create = HouseScoreCreate(
                                        region_id=region_id,
                                        base_ym=base_ym,
                                        index_value=index_value,
                                        index_change_rate=index_change_rate,
                                        index_type=index_type,
                                        data_source=data_source
                                    )
                                    
                                    house_scores_to_save.append(house_score_create)
                                    
                                except Exception as e:
                                    # base_ym이 설정되지 않은 경우를 대비
                                    base_ym_str = base_ym if base_ym else "Unknown"
                                    error_msg = f"{region_code}/{base_ym_str}: 데이터 파싱 오류 - {str(e)}"
                                    region_errors.append(error_msg)
                                    continue
                            
                            # 배치로 중복 체크 및 저장
                            saved_count = 0
                            skipped_count = 0
                            
                            for house_score_create in house_scores_to_save:
                                try:
                                    # DB 저장 (중복 체크) - 독립 세션 사용
                                    _, is_created = await house_score_crud.create_or_skip(
                                        local_db,
                                        obj_in=house_score_create
                                    )
                                    
                                    if is_created:
                                        saved_count += 1
                                    else:
                                        skipped_count += 1
                                        
                                except Exception as e:
                                    error_msg = f"{region_code}/{house_score_create.base_ym}: 데이터 저장 오류 - {str(e)}"
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
                            
                            # 사전 체크로 스킵된 경우 카운트
                            if result.get("pre_check_skip"):
                                pre_check_skipped += 1
                            
                            region_errors = result.get("errors", [])
                            if region_errors:
                                errors.extend(region_errors)
                            
                            # 로그 출력
                            skip_reason = result.get("skip_reason")
                            if skip_reason:
                                # 사전 체크로 스킵된 경우
                                logger.info(
                                    f"   ⏭ [{total_processed + idx + 1}/{len(states)}] {result['region_code']}: "
                                    f"사전 체크로 스킵 ({skip_reason})"
                                )
                            elif result.get("fetched", 0) > 0:
                                # 실제 API 호출하여 데이터 수집한 경우
                                logger.info(
                                    f"    [{total_processed + idx + 1}/{len(states)}] {result['region_code']}: "
                                    f"{result['fetched']}건 수집, {result['saved']}건 저장, {result['skipped']}건 건너뜀"
                                )
                        else:
                            error_msg = f"{result.get('region_code', 'Unknown')}: {result.get('error', '알 수 없는 오류')}"
                            errors.append(error_msg)
                            logger.warning(f"    [{total_processed + idx + 1}/{len(states)}] {error_msg}")
                
                total_processed += len(batch)
                
                # 배치 간 딜레이 (API 호출 제한 방지)
                if total_processed < len(states):
                    await asyncio.sleep(0.5)
            
            # 결과 출력
            logger.info("\n" + "=" * 80)
            logger.info(" 부동산 지수 데이터 수집 완료!")
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
            
            return HouseScoreCollectionResponse(
                success=True,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors[:100],  # 최대 100개만
                message=message
            )
            
        except Exception as e:
            logger.error(f" 전체 수집 실패: {e}", exc_info=True)
            return HouseScoreCollectionResponse(
                success=False,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors + [str(e)],
                message=f"전체 수집 실패: {str(e)}"
            )


