"""
Sale Collection Service
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
from app.services.data_collection.constants import MOLIT_SALE_API_URL


class SaleCollectionService(DataCollectionServiceBase):
    """
    Sale Collection Service
    """

    async def collect_sales_data(
        self,
        db: AsyncSession,
        start_ym: str,
        end_ym: str,
        max_items: Optional[int] = None,
        allow_duplicate: bool = False
    ) -> Any:
        """
        아파트 매매 실거래가 데이터 수집 (새로운 JSON API 사용)
        
        Args:
            start_ym: 시작 연월 (YYYYMM)
            end_ym: 종료 연월 (YYYYMM)
            max_items: 최대 수집 개수 제한 (기본값: None, 제한 없음)
            allow_duplicate: 중복 저장 허용 여부 (기본값: False, False=건너뛰기, True=업데이트)
        """
        from app.schemas.sale import SalesCollectionResponse, SaleCreate
        
        total_fetched = 0
        total_saved = 0
        skipped = 0
        errors = []
        
        logger.info(f"💰 매매 수집 시작: {start_ym} ~ {end_ym}")
        
        # 1. 기간 생성
        def get_months(start, end):
            try:
                start_date = datetime.strptime(start, "%Y%m")
                end_date = datetime.strptime(end, "%Y%m")
            except ValueError:
                raise ValueError("날짜 형식이 올바르지 않습니다. YYYYMM 형식이어야 합니다.")
            
            months = []
            curr = start_date
            while curr <= end_date:
                months.append(curr.strftime("%Y%m"))
                if curr.month == 12:
                    curr = curr.replace(year=curr.year + 1, month=1)
                else:
                    curr = curr.replace(month=curr.month + 1)
            return months
        
        try:
            target_months = get_months(start_ym, end_ym)
        except ValueError as e:
            return SalesCollectionResponse(success=False, message=str(e))
        
        # 2. 지역 코드 추출
        try:
            stmt = text("SELECT DISTINCT SUBSTR(region_code, 1, 5) FROM states WHERE length(region_code) >= 5")
            result = await db.execute(stmt)
            target_sgg_codes = [row[0] for row in result.fetchall() if row[0] and len(row[0]) == 5]
            logger.info(f"📍 {len(target_sgg_codes)}개 지역 코드 추출")
        except Exception as e:
            logger.error(f"❌ 지역 코드 추출 실패: {e}")
            return SalesCollectionResponse(success=False, message=f"DB 오류: {e}")
        
        # 2.5. 지역별 아파트/지역 정보 사전 로드 (성능 최적화)
        apt_cache: Dict[str, List[Apartment]] = {}
        region_cache: Dict[str, Dict[int, State]] = {}
        detail_cache: Dict[str, Dict[int, ApartDetail]] = {}
        
        async def load_apts_and_regions(sgg_cd: str) -> tuple[List[Apartment], Dict[int, State], Dict[int, ApartDetail]]:
            """지역별 아파트, 지역 정보, 아파트 상세 정보 로드 (캐싱)"""
            if sgg_cd in apt_cache:
                return apt_cache[sgg_cd], region_cache[sgg_cd], detail_cache.get(sgg_cd, {})
            
            async with AsyncSessionLocal() as cache_db:
                # 아파트 로드
                stmt = select(Apartment).options(joinedload(Apartment.region)).join(State).where(
                    State.region_code.like(f"{sgg_cd}%")
                )
                apt_result = await cache_db.execute(stmt)
                local_apts = apt_result.scalars().all()
                
                # 동 정보 캐시
                region_stmt = select(State).where(State.region_code.like(f"{sgg_cd}%"))
                region_result = await cache_db.execute(region_stmt)
                all_regions = {r.region_id: r for r in region_result.scalars().all()}
                
                # 아파트 상세 정보 로드 (지번 포함)
                apt_ids = [apt.apt_id for apt in local_apts]
                if apt_ids:
                    detail_stmt = select(ApartDetail).where(ApartDetail.apt_id.in_(apt_ids))
                    detail_result = await cache_db.execute(detail_stmt)
                    apt_details = {d.apt_id: d for d in detail_result.scalars().all()}
                else:
                    apt_details = {}
                
                apt_cache[sgg_cd] = local_apts
                region_cache[sgg_cd] = all_regions
                detail_cache[sgg_cd] = apt_details
                
                return local_apts, all_regions, apt_details
        
        # 3. 병렬 처리 (DB 연결 풀 크기에 맞춰 10개로 제한 - QueuePool 에러 방지)
        # DB pool_size=5, max_overflow=10 → 최대 15개 연결 가능
        semaphore = asyncio.Semaphore(10)
        
        # 진행 상황 추적용 변수
        total_regions = len(target_sgg_codes)
        
        def format_ym(ym: str) -> str:
            """연월 형식 변환: YYYYMM -> YYYY년 MM월"""
            try:
                y = int(ym[:4])
                m = int(ym[4:])
                return f"{y}년 {m}월"
            except:
                return ym
        
        # 공유 HTTP 클라이언트 (연결 재사용으로 성능 향상)
        http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            limits=httpx.Limits(max_connections=15, max_keepalive_connections=10)
        )
        
        async def process_sale_region(ym: str, sgg_cd: str):
            """매매 데이터 수집 작업"""
            ym_formatted = format_ym(ym)
            async with semaphore:
                async with AsyncSessionLocal() as local_db:
                    nonlocal total_fetched, total_saved, skipped, errors
                    
                    try:
                        # 기존 데이터 확인
                        y = int(ym[:4])
                        m = int(ym[4:])
                        start_date = date(y, m, 1)
                        last_day = calendar.monthrange(y, m)[1]
                        end_date = date(y, m, last_day)
                        
                        check_stmt = select(func.count(Sale.trans_id)).join(Apartment).join(State).where(
                            and_(
                                State.region_code.like(f"{sgg_cd}%"),
                                Sale.contract_date >= start_date,
                                Sale.contract_date <= end_date
                            )
                        )
                        count_result = await local_db.execute(check_stmt)
                        existing_count = count_result.scalar() or 0
                        
                        if existing_count > 0 and not allow_duplicate:
                            skipped += existing_count
                            logger.info(f"⏭️ {sgg_cd}/{ym} ({ym_formatted}): 건너뜀 ({existing_count}건 존재)")
                            return
                        
                        # max_items 제한 확인
                        if max_items and total_saved >= max_items:
                            return
                        
                        # API 호출 (XML) - 공유 클라이언트 사용
                        params = {
                            "serviceKey": self.api_key,
                            "LAWD_CD": sgg_cd,
                            "DEAL_YMD": ym,
                            "numOfRows": 4000
                        }
                        
                        response = await http_client.get(MOLIT_SALE_API_URL, params=params)
                        response.raise_for_status()
                        xml_content = response.text
                        
                        # XML 파싱
                        try:
                            root = ET.fromstring(xml_content)
                        except ET.ParseError as e:
                            errors.append(f"{sgg_cd}/{ym} ({ym_formatted}): XML 파싱 실패 - {str(e)}")
                            logger.error(f"❌ {sgg_cd}/{ym} ({ym_formatted}): XML 파싱 실패 - {str(e)}")
                            return
                        
                        # 결과 코드 확인
                        result_code_elem = root.find(".//resultCode")
                        result_msg_elem = root.find(".//resultMsg")
                        result_code = result_code_elem.text if result_code_elem is not None else ""
                        result_msg = result_msg_elem.text if result_msg_elem is not None else ""
                        
                        if result_code != "000":
                            errors.append(f"{sgg_cd}/{ym} ({ym_formatted}): {result_msg}")
                            logger.error(f"❌ {sgg_cd}/{ym} ({ym_formatted}): {result_msg}")
                            return
                        
                        # items 추출
                        items = root.findall(".//item")
                        
                        if not items:
                            return
                        
                        total_fetched += len(items)
                        
                        # 아파트 및 지역 정보 로드 (캐싱 활용)
                        local_apts, all_regions, apt_details = await load_apts_and_regions(sgg_cd)
                        
                        if not local_apts:
                            return
                        
                        sales_to_save = []
                        success_count = 0
                        skip_count = 0
                        error_count = 0
                        apt_name_log = ""
                        normalized_cache: Dict[str, Any] = {}  # 정규화 결과 캐싱
                        batch_size = 100  # 배치 커밋 크기
                        
                        for item in items:
                            # max_items 제한 확인
                            if max_items and total_saved >= max_items:
                                break
                            
                            try:
                                # 🔑 API 응답 원본 데이터 추출 (실패 로그용)
                                api_response_data = {}
                                for child in item:
                                    if child.text is not None:
                                        api_response_data[child.tag] = child.text.strip()
                                
                                # XML Element에서 필드 추출 (Dev API: camelCase 필드명)
                                apt_nm_elem = item.find("aptNm")
                                apt_nm = apt_nm_elem.text.strip() if apt_nm_elem is not None and apt_nm_elem.text else ""
                                
                                umd_nm_elem = item.find("umdNm")
                                umd_nm = umd_nm_elem.text.strip() if umd_nm_elem is not None and umd_nm_elem.text else ""
                                
                                # 🆕 새 API 추가 필드: umdCd (읍면동코드) - 더 정확한 동 매칭에 활용
                                umd_cd_elem = item.find("umdCd")
                                umd_cd = umd_cd_elem.text.strip() if umd_cd_elem is not None and umd_cd_elem.text else ""
                                
                                sgg_cd_elem = item.find("sggCd")
                                sgg_cd_item = sgg_cd_elem.text.strip() if sgg_cd_elem is not None and sgg_cd_elem.text else sgg_cd
                                
                                # 지번 추출 (기존 필드 유지)
                                jibun_elem = item.find("jibun")
                                jibun = jibun_elem.text.strip() if jibun_elem is not None and jibun_elem.text else ""
                                
                                # 🆕 새 API 추가 필드: bonbun/bubun (본번/부번) - 더 정확한 지번 매칭
                                bonbun_elem = item.find("bonbun")
                                bonbun = bonbun_elem.text.strip().lstrip('0') if bonbun_elem is not None and bonbun_elem.text else ""
                                bubun_elem = item.find("bubun")
                                bubun = bubun_elem.text.strip().lstrip('0') if bubun_elem is not None and bubun_elem.text else ""
                                
                                # 본번/부번으로 정확한 지번 생성 (bonbun이 있으면 우선 사용)
                                if bonbun:
                                    jibun_precise = bonbun
                                    if bubun and bubun != "0" and bubun != "":
                                        jibun_precise += f"-{bubun}"
                                    # 기존 jibun과 비교하여 더 정확한 것 사용
                                    if not jibun or len(jibun_precise) >= len(jibun):
                                        jibun = jibun_precise
                                
                                # 🆕 새 API 추가 필드: aptSeq (단지 일련번호) - 중복 체크 및 추적에 활용
                                apt_seq_elem = item.find("aptSeq")
                                apt_seq = apt_seq_elem.text.strip() if apt_seq_elem is not None and apt_seq_elem.text else ""
                                
                                # 건축년도 추출 (매칭에 활용)
                                build_year_elem = item.find("buildYear")
                                build_year_for_match = build_year_elem.text.strip() if build_year_elem is not None and build_year_elem.text else ""
                                
                                if not apt_nm:
                                    continue
                                
                                if not apt_name_log:
                                    apt_name_log = apt_nm
                                
                                # 🔑 최우선 매칭: 법정동 코드 10자리 + 지번(부번까지) 정확 매칭
                                # 이름과 관계없이 법정동 코드와 지번이 모두 일치하면 같은 아파트로 인식
                                # (95% 신뢰구간에서 같은 부동산을 가리키는 것으로 간주)
                                matched_apt = None
                                candidates = local_apts
                                sgg_code_matched = True
                                dong_matched = False
                                
                                # 매칭 단계 추적용 리스트
                                matching_steps = []
                                
                                # 0단계: 법정동 코드 10자리 + 지번(부번까지) 정확 매칭 (최우선, 이름 무관)
                                if sgg_cd_item and umd_cd and jibun:
                                    full_region_code = f"{sgg_cd_item}{umd_cd}"
                                    
                                    # 🔑 새로운 매칭 함수 사용: 법정동 코드 + 지번(부번까지) 정확 매칭
                                    matched_apt = ApartmentMatcher.match_by_address_and_jibun(
                                        full_region_code=full_region_code,
                                        jibun=jibun,
                                        bonbun=bonbun if bonbun else None,
                                        bubun=bubun if bubun else None,
                                        candidates=local_apts,
                                        apt_details=apt_details,
                                        all_regions=all_regions
                                    )
                                    
                                    if matched_apt:
                                        candidates = [matched_apt]
                                        sgg_code_matched = True
                                        dong_matched = True
                                        matching_steps.append({
                                            'step': 'address_jibun',
                                            'attempted': True,
                                            'success': True,
                                            'full_region_code': full_region_code,
                                            'jibun': jibun
                                        })
                                        # 🔑 매칭 성공 로그를 파일로 저장 (docker log에는 출력 안 함)
                                        self._record_apt_success(
                                            trans_type='매매',
                                            full_region_code=full_region_code,
                                            jibun=jibun,
                                            apt_name=matched_apt.apt_name,
                                            ym=ym  # 거래 발생 월
                                        )
                                        # 성공 로그 기록
                                        self._record_apt_matching(
                                            matched_apt.apt_id,
                                            matched_apt.apt_name,
                                            apt_nm,
                                            ym,
                                            matching_method='address_jibun'
                                        )
                                    else:
                                        matching_steps.append({
                                            'step': 'address_jibun',
                                            'attempted': True,
                                            'success': False,
                                            'full_region_code': full_region_code,
                                            'jibun': jibun,
                                            'reason': '법정동코드+지번 매칭 실패'
                                        })
                                
                                # 🔑 개선: 법정동 코드 10자리로 후보 강제 필터링 (미스매칭 방지)
                                # 지번 매칭 실패 시, 법정동 코드만으로라도 후보를 제한
                                if not matched_apt and sgg_cd_item and umd_cd:
                                    full_region_code = f"{sgg_cd_item}{umd_cd}"
                                    filtered = [
                                        apt for apt in local_apts
                                        if apt.region_id in all_regions
                                        and all_regions[apt.region_id].region_code == full_region_code
                                    ]
                                    if filtered:
                                        # 동 단위로 후보 제한 성공
                                        candidates = filtered
                                        sgg_code_matched = True
                                        dong_matched = True
                                        matching_steps.append({
                                            'step': 'full_region_code',
                                            'attempted': True,
                                            'success': True,
                                            'full_region_code': full_region_code,
                                            'candidates': len(filtered)
                                        })
                                    else:
                                        # 🔑 개선: 법정동 코드로 후보가 없으면 매칭 실패로 간주 (미스매칭 방지)
                                        matching_steps.append({
                                            'step': 'full_region_code',
                                            'attempted': True,
                                            'success': False,
                                            'full_region_code': full_region_code,
                                            'reason': '법정동 코드로 후보 없음 (DB에 해당 동 아파트 없음)'
                                        })
                                        # 매칭 실패로 처리
                                        candidates = []
                                
                                # 3단계: 시군구 코드만 매칭 (fallback)
                                if not matched_apt and not dong_matched and sgg_cd_item and str(sgg_cd_item).strip():
                                    sgg_cd_item_str = str(sgg_cd_item).strip()
                                    sgg_cd_db = ApartmentMatcher.convert_sgg_code_to_db_format(sgg_cd_item_str)
                                    
                                    if sgg_cd_db:
                                        filtered = [
                                            apt for apt in local_apts
                                            if apt.region_id in all_regions
                                            and all_regions[apt.region_id].region_code == sgg_cd_db
                                        ]
                                        if not filtered:
                                            filtered = [
                                                apt for apt in local_apts
                                                if apt.region_id in all_regions
                                                and all_regions[apt.region_id].region_code.startswith(sgg_cd_item_str)
                                            ]
                                        if filtered:
                                            candidates = filtered
                                            sgg_code_matched = True
                                            matching_steps.append({
                                                'step': 'sgg_code_only',
                                                'attempted': True,
                                                'success': True,
                                                'candidates': len(filtered)
                                            })
                                
                                # 4단계: 동 이름 매칭 (fallback)
                                if not matched_apt and not dong_matched and umd_nm and candidates:
                                    matching_region_ids = ApartmentMatcher.find_matching_regions(umd_nm, all_regions)
                                    
                                    if matching_region_ids:
                                        filtered = [
                                            apt for apt in candidates
                                            if apt.region_id in matching_region_ids
                                        ]
                                        if filtered:
                                            candidates = filtered
                                            dong_matched = True
                                            matching_steps.append({
                                                'step': 'dong_name',
                                                'attempted': True,
                                                'success': True,
                                                'candidates': len(filtered)
                                            })
                                
                                # 🔑 개선: 법정동 코드로 필터링한 경우, 후보가 없으면 매칭 불가 (미스매칭 방지)
                                # 동 검증 실패 시 전체 후보로 복원하지 않음
                                if not candidates and sgg_cd_item and umd_cd:
                                    # 법정동 코드로 필터링했는데 후보가 없음 → 매칭 불가
                                    error_count += 1
                                    matching_steps.append({
                                        'step': 'final_check',
                                        'attempted': True,
                                        'success': False,
                                        'reason': '동 검증 실패 (법정동 코드로 후보 없음)'
                                    })
                                    # 로깅 (파일로만 저장, docker log 출력 안 함)
                                    self._record_apt_failure(
                                        trans_type='매매',
                                        full_region_code=f"{sgg_cd_item}{umd_cd}",
                                        jibun=jibun if jibun else "",
                                        apt_name_api=apt_nm,
                                        ym=ym,
                                        reason='dong_no_candidates',
                                        candidates_count=0
                                    )
                                    continue  # 다음 거래로 넘어감
                                elif not candidates:
                                    # 읍면동 코드가 없는 경우만 전체 후보로 복원 (하위 호환성)
                                    candidates = local_apts
                                    sgg_code_matched = True
                                    dong_matched = False
                                
                                # 5단계: 이름 매칭 (시군구+동코드+지번 매칭 실패 시에만 사용)
                                # 🔑 동 검증 기본 활성화 (require_dong_match 기본값 True)
                                if not matched_apt:
                                    matched_apt = ApartmentMatcher.match_apartment(
                                        apt_nm, candidates, sgg_cd, umd_nm, 
                                        jibun, build_year_for_match, apt_details, normalized_cache,
                                        all_regions=all_regions  # require_dong_match 기본값 True 사용
                                    )
                                    
                                    if matched_apt:
                                        matching_steps.append({
                                            'step': 'name_matching',
                                            'attempted': True,
                                            'success': True,
                                            'candidates': len(candidates)
                                        })
                                    else:
                                        matching_steps.append({
                                            'step': 'name_matching',
                                            'attempted': True,
                                            'success': False,
                                            'candidates': len(candidates),
                                            'reason': '유사도 부족 또는 Veto 조건'
                                        })
                                
                                # 필터링된 후보에서 실패 시 전체 후보로 재시도 (단, 동 검증 필수!)
                                if not matched_apt and len(candidates) < len(local_apts) and dong_matched:
                                    matched_apt = ApartmentMatcher.match_apartment(
                                        apt_nm, local_apts, sgg_cd, umd_nm, 
                                        jibun, build_year_for_match, apt_details, normalized_cache,
                                        all_regions=all_regions, require_dong_match=True
                                    )
                                    
                                    if matched_apt:
                                        matching_steps.append({
                                            'step': 'name_matching_full',
                                            'attempted': True,
                                            'success': True,
                                            'candidates': len(local_apts)
                                        })
                                    else:
                                        matching_steps.append({
                                            'step': 'name_matching_full',
                                            'attempted': True,
                                            'success': False,
                                            'candidates': len(local_apts),
                                            'reason': '전체 후보에서도 매칭 실패'
                                        })
                                
                                if not matched_apt:
                                    error_count += 1
                                    # 정규화된 이름 가져오기
                                    normalized_name = normalized_cache.get(apt_nm)
                                    if not normalized_name:
                                        normalized_name = ApartmentMatcher.normalize_apt_name(apt_nm)
                                        normalized_cache[apt_nm] = normalized_name
                                    
                                    # 지역 이름 가져오기 (시군구/동)
                                    region_name = None
                                    if umd_nm:
                                        # 동 이름으로 지역 찾기
                                        matching_region_ids = ApartmentMatcher.find_matching_regions(umd_nm, all_regions)
                                        if matching_region_ids:
                                            first_region_id = list(matching_region_ids)[0]
                                            if first_region_id in all_regions:
                                                region_name = all_regions[first_region_id].region_name
                                    elif sgg_cd_item:
                                        # 시군구 코드로 지역 찾기
                                        sgg_cd_db = ApartmentMatcher.convert_sgg_code_to_db_format(str(sgg_cd_item).strip())
                                        if sgg_cd_db:
                                            for region in all_regions.values():
                                                if region.region_code == sgg_cd_db:
                                                    region_name = region.region_name
                                                    break
                                    
                                    # 실패 케이스 로깅 (apartfail_YYYYMM.log 파일로 저장)
                                    self._record_apt_fail(
                                        trans_type='매매',
                                        apt_name=apt_nm,
                                        jibun=jibun,
                                        build_year=build_year_for_match,
                                        umd_nm=umd_nm,
                                        sgg_cd=sgg_cd,
                                        ym=ym,  # 거래 발생 월
                                        reason='이름매칭 실패',
                                        normalized_name=normalized_name,
                                        candidates=candidates,
                                        local_apts=local_apts,
                                        sgg_code_matched=sgg_code_matched,
                                        dong_matched=dong_matched,
                                        region_name=region_name,
                                        full_region_code=full_region_code if sgg_cd_item and umd_cd else None,
                                        matching_steps=matching_steps,
                                        api_response_data=api_response_data
                                    )
                                    continue
                                
                                # 매칭 로그 기록 (apart_YYYYMM.log용) - 거래 발생 월(ym) 사용
                                matching_method = 'name_matching'
                                if matching_steps:
                                    # 가장 먼저 성공한 단계 찾기
                                    for step in matching_steps:
                                        if step.get('success'):
                                            matching_method = step.get('step', 'name_matching')
                                            break
                                
                                self._record_apt_matching(
                                    matched_apt.apt_id,
                                    matched_apt.apt_name,
                                    apt_nm,
                                    ym,  # 거래 발생 월
                                    matching_method=matching_method
                                )
                                
                                # 거래 데이터 파싱 (XML Element에서 추출)
                                deal_amount_elem = item.find("dealAmount")
                                deal_amount = deal_amount_elem.text.replace(",", "").strip() if deal_amount_elem is not None and deal_amount_elem.text else "0"
                                
                                build_year_elem = item.find("buildYear")
                                build_year = build_year_elem.text.strip() if build_year_elem is not None and build_year_elem.text else None
                                
                                deal_year_elem = item.find("dealYear")
                                deal_year = deal_year_elem.text.strip() if deal_year_elem is not None and deal_year_elem.text else None
                                
                                deal_month_elem = item.find("dealMonth")
                                deal_month = deal_month_elem.text.strip() if deal_month_elem is not None and deal_month_elem.text else None
                                
                                deal_day_elem = item.find("dealDay")
                                deal_day = deal_day_elem.text.strip() if deal_day_elem is not None and deal_day_elem.text else None
                                
                                exclu_use_ar_elem = item.find("excluUseAr")
                                exclu_use_ar = exclu_use_ar_elem.text.strip() if exclu_use_ar_elem is not None and exclu_use_ar_elem.text else None
                                
                                floor_elem = item.find("floor")
                                floor = floor_elem.text.strip() if floor_elem is not None and floor_elem.text else None
                                
                                contract_date = None
                                if deal_year and deal_month and deal_day:
                                    try:
                                        contract_date = date(int(deal_year), int(deal_month), int(deal_day))
                                    except:
                                        pass
                                
                                sale_create = SaleCreate(
                                    apt_id=matched_apt.apt_id,
                                    build_year=build_year,
                                    trans_type="매매",
                                    trans_price=int(deal_amount) if deal_amount else 0,
                                    exclusive_area=float(exclu_use_ar) if exclu_use_ar else 0.0,
                                    floor=int(floor) if floor else 0,
                                    contract_date=contract_date,
                                    is_canceled=False,
                                    remarks=matched_apt.apt_name
                                )
                                
                                # 중복 체크 및 저장
                                exists_stmt = select(Sale).where(
                                    and_(
                                        Sale.apt_id == sale_create.apt_id,
                                        Sale.contract_date == sale_create.contract_date,
                                        Sale.trans_price == sale_create.trans_price,
                                        Sale.floor == sale_create.floor,
                                        Sale.exclusive_area == sale_create.exclusive_area
                                    )
                                )
                                exists = await local_db.execute(exists_stmt)
                                existing_sale = exists.scalars().first()
                                
                                if existing_sale:
                                    if allow_duplicate:
                                        # 업데이트
                                        existing_sale.build_year = build_year
                                        existing_sale.trans_price = sale_create.trans_price
                                        existing_sale.exclusive_area = sale_create.exclusive_area
                                        existing_sale.floor = sale_create.floor
                                        existing_sale.remarks = matched_apt.apt_name
                                        local_db.add(existing_sale)
                                        success_count += 1
                                        total_saved += 1
                                    else:
                                        skip_count += 1
                                    continue
                                
                                db_obj = Sale(**sale_create.model_dump())
                                local_db.add(db_obj)
                                sales_to_save.append(sale_create)
                                
                                # 아파트 상태 업데이트
                                if matched_apt.is_available != "1":
                                    matched_apt.is_available = "1"
                                    local_db.add(matched_apt)
                                
                                # 배치 커밋 (성능 최적화)
                                if len(sales_to_save) >= batch_size:
                                    await local_db.commit()
                                    total_saved += len(sales_to_save)
                                    success_count += len(sales_to_save)
                                    sales_to_save = []
                            
                            except Exception as e:
                                error_count += 1
                                continue
                        
                        # 남은 데이터 커밋
                        if sales_to_save or (allow_duplicate and success_count > 0):
                            await local_db.commit()
                            if sales_to_save:
                                total_saved += len(sales_to_save)
                                success_count += len(sales_to_save)
                        
                        # 간결한 로그 (한 줄)
                        if success_count > 0 or skip_count > 0 or error_count > 0:
                            logger.info(
                                f"{sgg_cd}/{ym} ({ym_formatted}): "
                                f"✅{success_count} ⏭️{skip_count} ❌{error_count} "
                                f"({apt_name_log})"
                            )
                        
                        skipped += skip_count
                        
                        # max_items 제한 확인
                        if max_items and total_saved >= max_items:
                            return
                        
                    except Exception as e:
                        errors.append(f"{sgg_cd}/{ym}: {str(e)}")
                        logger.error(f"❌ {sgg_cd}/{ym}: {str(e)}")
                        await local_db.rollback()
        
        # 병렬 실행
        try:
            total_months = len(target_months)
            for month_idx, ym in enumerate(target_months, 1):
                if max_items and total_saved >= max_items:
                    break
                
                ym_formatted = format_ym(ym)
                # 월 시작 로그
                logger.info(f"📊 {ym_formatted} | {month_idx}/{total_months}개 월 | {total_regions}개 지역 데이터 수집 중...")
                
                tasks = [process_sale_region(ym, sgg_cd) for sgg_cd in target_sgg_codes]
                await asyncio.gather(*tasks, return_exceptions=True)
                
                # 월 완료 로그
                logger.info(f"✅ {ym_formatted} 완료 | 누적 저장: {total_saved}건")
                
                # 해당 월의 로그 저장 (apart_YYYYMM.log, apartfail_YYYYMM.log)
                print(f"[LOG_SAVE] 월 완료 - {ym_formatted} 로그 저장 시작 (ym={ym})")
                logger.info(f"=" * 60)
                logger.info(f"📝 [매매] {ym_formatted} 로그 저장 시작")
                logger.info(f"   매칭 로그: {len(self._apt_matching_log_by_month.get(ym, {}))}개 아파트")
                logger.info(f"   실패 로그: {len(self._apt_fail_log_by_month.get(ym, []))}건")
                logger.info(f"=" * 60)
                
                try:
                    print(f"[LOG_SAVE] {ym} - _save_apt_matching_log 호출")
                    self._save_apt_matching_log(ym)
                    print(f"[LOG_SAVE] {ym} - _save_apt_matching_log 완료")
                except Exception as e:
                    print(f"[LOG_SAVE] ERROR: {ym} 매칭 로그 저장 실패 - {e}")
                    logger.error(f"❌ [매매] {ym_formatted} 매칭 로그 저장 실패: {e}", exc_info=True)
                
                try:
                    print(f"[LOG_SAVE] {ym} - _save_apt_fail_log 호출")
                    self._save_apt_fail_log(ym)
                    print(f"[LOG_SAVE] {ym} - _save_apt_fail_log 완료")
                except Exception as e:
                    print(f"[LOG_SAVE] ERROR: {ym} 실패 로그 저장 실패 - {e}")
                    logger.error(f"❌ [매매] {ym_formatted} 실패 로그 저장 실패: {e}", exc_info=True)
                
                try:
                    print(f"[LOG_SAVE] {ym} - _save_apt_success_log 호출")
                    self._save_apt_success_log(ym)
                    print(f"[LOG_SAVE] {ym} - _save_apt_success_log 완료")
                except Exception as e:
                    print(f"[LOG_SAVE] ERROR: {ym} 성공 로그 저장 실패 - {e}")
                    logger.error(f"❌ [매매] {ym_formatted} 성공 로그 저장 실패: {e}", exc_info=True)
                
                logger.info(f"=" * 60)
                logger.info(f"📝 [매매] {ym_formatted} 로그 저장 완료")
                logger.info(f"=" * 60)
                print(f"[LOG_SAVE] {ym_formatted} 로그 저장 프로세스 완료")
                
                if max_items and total_saved >= max_items:
                    break
        finally:
            # HTTP 클라이언트 정리
            await http_client.aclose()
        
        logger.info(f"🎉 매매 수집 완료: 저장 {total_saved}건, 건너뜀 {skipped}건, 오류 {len(errors)}건")
        # 참고: 각 월의 로그는 월별로 이미 저장되었습니다.
        
        return SalesCollectionResponse(
            success=True,
            total_fetched=total_fetched,
            total_saved=total_saved,
            skipped=skipped,
            errors=errors,
            message=f"수집 완료: {total_saved}건 저장"
        )
