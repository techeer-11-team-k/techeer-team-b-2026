"""
Apt Detail Collection Service
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


class AptDetailCollectionService(DataCollectionServiceBase):
    """
    Apt Detail Collection Service
    """

    async def fetch_apartment_basic_info(self, kapt_code: str, retries: int = 3) -> Dict[str, Any]:
        """
        국토부 API에서 아파트 기본정보 가져오기 (Rate Limit 처리 포함)
        
        HTTP 클라이언트 풀을 재사용하고, 429 에러 시 재시도 및 딜레이 처리
        
        Args:
            kapt_code: 국토부 단지코드
            retries: 재시도 횟수
        
        Returns:
            API 응답 데이터 (dict)
        
        Raises:
            httpx.HTTPError: API 호출 실패 시
        """
        params = {
            "serviceKey": self.api_key,
            "kaptCode": kapt_code
        }
        
        client = self._get_http_client()
        
        for attempt in range(retries):
            try:
                response = await client.get(MOLIT_APARTMENT_BASIC_API_URL, params=params)
                
                # 429 에러 처리 (Rate Limit)
                if response.status_code == 429:
                    wait_time = (attempt + 1) * 2  # 지수 백오프: 2초, 4초, 6초
                    logger.warning(f"⚠️ Rate Limit (429) 발생, {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                
                response.raise_for_status()
                logger.info(f"✅ 외부 API 호출 성공: 기본정보 API (kapt_code: {kapt_code})")
                data = response.json()
                return data
                
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < retries - 1:
                    wait_time = (attempt + 1) * 2
                    logger.warning(f"⚠️ Rate Limit (429) 발생, {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                raise
        
        raise httpx.HTTPStatusError("Rate Limit 초과", request=None, response=None)
    

    async def fetch_apartment_detail_info(self, kapt_code: str, retries: int = 3) -> Dict[str, Any]:
        """
        국토부 API에서 아파트 상세정보 가져오기 (Rate Limit 처리 포함)
        
        HTTP 클라이언트 풀을 재사용하고, 429 에러 시 재시도 및 딜레이 처리
        
        Args:
            kapt_code: 국토부 단지코드
            retries: 재시도 횟수
        
        Returns:
            API 응답 데이터 (dict)
        
        Raises:
            httpx.HTTPError: API 호출 실패 시
        """
        params = {
            "serviceKey": self.api_key,
            "kaptCode": kapt_code
        }
        
        client = self._get_http_client()
        
        for attempt in range(retries):
            try:
                response = await client.get(MOLIT_APARTMENT_DETAIL_API_URL, params=params)
                
                # 429 에러 처리 (Rate Limit)
                if response.status_code == 429:
                    wait_time = (attempt + 1) * 2  # 지수 백오프: 2초, 4초, 6초
                    logger.warning(f"⚠️ Rate Limit (429) 발생, {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                
                response.raise_for_status()
                logger.info(f"✅ 외부 API 호출 성공: 상세정보 API (kapt_code: {kapt_code})")
                data = response.json()
                return data
                
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < retries - 1:
                    wait_time = (attempt + 1) * 2
                    logger.warning(f"⚠️ Rate Limit (429) 발생, {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                raise
        
        raise httpx.HTTPStatusError("Rate Limit 초과", request=None, response=None)
    

    def parse_date(self, date_str: Optional[str]) -> Optional[str]:
        """
        날짜 문자열 파싱 (YYYYMMDD -> YYYY-MM-DD)
        
        Args:
            date_str: YYYYMMDD 형식의 날짜 문자열
        
        Returns:
            YYYY-MM-DD 형식의 날짜 문자열 또는 None
        """
        if not date_str or len(date_str) != 8:
            return None
        try:
            return f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
        except Exception:
            return None
    

    def parse_int(self, value: Any) -> Optional[int]:
        """
        정수로 변환 (실패 시 None 반환)
        
        Args:
            value: 변환할 값
        
        Returns:
            정수 또는 None
        """
        if value is None or value == "":
            return None
        try:
            if isinstance(value, str):
                # 빈 문자열이나 공백 제거
                value = value.strip()
                if not value:
                    return None
            return int(value)
        except (ValueError, TypeError):
            return None
    

    def parse_float(self, value: Any) -> Optional[float]:
        """문자열/숫자를 float로 변환"""
        if value is None or value == "": return None
        try:
            if isinstance(value, str):
                value = value.strip()
                if not value: return None
            return float(value)
        except (ValueError, TypeError): return None
    

    def parse_apartment_details(
        self,
        basic_info: Dict[str, Any],
        detail_info: Dict[str, Any],
        apt_id: int
    ) -> Optional[ApartDetailCreate]:
        """
        두 API 응답을 조합하여 ApartDetailCreate 객체 생성
        
        Args:
            basic_info: 기본정보 API 응답
            detail_info: 상세정보 API 응답
            apt_id: 아파트 ID
        
        Returns:
            ApartDetailCreate 객체 또는 None
        """
        try:
            logger.debug(f"파싱 시작: apt_id={apt_id}")
            
            # 기본정보 파싱
            basic_item = basic_info.get("response", {}).get("body", {}).get("item", {})
            if not basic_item:
                logger.warning(f"⚠️ 파싱 실패: 기본정보 API 응답에 item이 없습니다. (apt_id: {apt_id})")
                logger.debug(f"기본정보 응답 구조: {basic_info}")
                return None
            
            # 상세정보 파싱
            detail_item = detail_info.get("response", {}).get("body", {}).get("item", {})
            if not detail_item:
                logger.warning(f"⚠️ 파싱 실패: 상세정보 API 응답에 item이 없습니다. (apt_id: {apt_id})")
                logger.debug(f"상세정보 응답 구조: {detail_info}")
                return None
            
            # 필수 필드 검증: 도로명 주소 또는 지번 주소
            doro_juso = basic_item.get("doroJuso", "").strip() if basic_item.get("doroJuso") else ""
            kapt_addr = basic_item.get("kaptAddr", "").strip() if basic_item.get("kaptAddr") else ""
            
            if not doro_juso and not kapt_addr:
                logger.warning(f"⚠️ 파싱 실패: 도로명 주소와 지번 주소가 모두 없습니다. (apt_id: {apt_id})")
                return None
            
            # 도로명 주소가 없으면 지번 주소 사용
            if not doro_juso:
                doro_juso = kapt_addr
            # 지번 주소가 없으면 도로명 주소 사용
            if not kapt_addr:
                kapt_addr = doro_juso
            
            # 우편번호 처리 (5자리로 제한)
            zipcode = basic_item.get("zipcode", "").strip() if basic_item.get("zipcode") else None
            if zipcode and len(zipcode) > 5:
                zipcode = zipcode[:5]
            
            # 날짜 파싱
            use_approval_date_str = self.parse_date(basic_item.get("kaptUsedate"))
            use_approval_date = None
            if use_approval_date_str:
                try:
                    from datetime import datetime
                    use_approval_date = datetime.strptime(use_approval_date_str, "%Y-%m-%d").date()
                except Exception:
                    pass
            
            # 총 세대 수 (필수)
            kaptda_cnt_raw = basic_item.get("kaptdaCnt")
            total_household_cnt = self.parse_int(kaptda_cnt_raw)
            
            if total_household_cnt is None:
                logger.debug(f"총 세대 수가 없습니다. (원본 값: {kaptda_cnt_raw})")
                return None
            
            # 관리 방식: 상세정보의 codeMgr 우선, 없으면 기본정보의 codeMgrNm
            manage_type = detail_item.get("codeMgr", "").strip()
            if not manage_type:
                manage_type = basic_item.get("codeMgrNm", "").strip()
            if not manage_type:
                manage_type = None
            
            # 지하철 정보: 상세정보 우선 (100자 제한)
            subway_line = detail_item.get("subwayLine", "").strip() if detail_item.get("subwayLine") else None
            subway_station = detail_item.get("subwayStation", "").strip() if detail_item.get("subwayStation") else None
            subway_time = detail_item.get("kaptdWtimesub", "").strip() if detail_item.get("kaptdWtimesub") else None
            
            # 100자 초과 시 자르기 (스키마 제한에 맞춤)
            if subway_line and len(subway_line) > 100:
                subway_line = subway_line[:100]
                logger.debug(f"subway_line이 100자를 초과하여 잘림: {len(detail_item.get('subwayLine', ''))}자 -> 100자")
            if subway_station and len(subway_station) > 100:
                subway_station = subway_station[:100]
                logger.debug(f"subway_station이 100자를 초과하여 잘림: {len(detail_item.get('subwayStation', ''))}자 -> 100자")
            if subway_time and len(subway_time) > 100:
                subway_time = subway_time[:100]
                logger.debug(f"subway_time이 100자를 초과하여 잘림: {len(detail_item.get('kaptdWtimesub', ''))}자 -> 100자")
            
            # 교육 시설 (200자 제한)
            education_facility = detail_item.get("educationFacility", "").strip() if detail_item.get("educationFacility") else None
            if education_facility and len(education_facility) > 200:
                education_facility = education_facility[:200]
                logger.debug(f"educationFacility가 200자를 초과하여 잘림: {len(detail_item.get('educationFacility', ''))}자 -> 200자")
            
            # ApartDetailCreate 객체 생성
            try:
                detail_create = ApartDetailCreate(
                    apt_id=apt_id,
                    road_address=doro_juso,
                    jibun_address=kapt_addr,
                    zip_code=zipcode,
                    code_sale_nm=basic_item.get("codeSaleNm", "").strip() if basic_item.get("codeSaleNm") else None,
                    code_heat_nm=basic_item.get("codeHeatNm", "").strip() if basic_item.get("codeHeatNm") else None,
                    total_household_cnt=total_household_cnt,
                    total_building_cnt=self.parse_int(basic_item.get("kaptDongCnt")),
                    highest_floor=self.parse_int(basic_item.get("kaptTopFloor")),
                    use_approval_date=use_approval_date,
                    total_parking_cnt=self.parse_int(detail_item.get("kaptdPcntu")),
                    builder_name=basic_item.get("kaptBcompany", "").strip() if basic_item.get("kaptBcompany") else None,
                    developer_name=basic_item.get("kaptAcompany", "").strip() if basic_item.get("kaptAcompany") else None,
                    manage_type=manage_type,
                    hallway_type=basic_item.get("codeHallNm", "").strip() if basic_item.get("codeHallNm") else None,
                    subway_time=subway_time,
                    subway_line=subway_line,
                    subway_station=subway_station,
                    educationFacility=education_facility,
                    geometry=None  # API에서 제공되지 않음
                )
                logger.debug(f"ApartDetailCreate 객체 생성 완료")
                return detail_create
            except Exception as create_error:
                logger.error(f"ApartDetailCreate 객체 생성 실패: {str(create_error)}")
                import traceback
                logger.debug(f"상세 스택: {traceback.format_exc()}")
                return None
            
        except Exception as e:
            logger.error(f"파싱 오류: {e}")
            import traceback
            logger.debug(f"상세 스택: {traceback.format_exc()}")
            return None
    

    async def _process_single_apartment(
        self,
        apt: Apartment,
        semaphore: asyncio.Semaphore
    ) -> Dict[str, Any]:
        """
        단일 아파트의 상세 정보 수집 및 저장 (최적화 버전)
        
        사전 중복 체크를 거쳤으므로 바로 API 호출하고 저장합니다.
        각 작업이 독립적인 세션을 사용합니다.
        
        Args:
            apt: 아파트 객체
            semaphore: 동시성 제어용 세마포어
        
        Returns:
            {
                "success": bool,
                "apt_name": str,
                "saved": bool,  # 저장 성공 여부
                "skipped": bool,  # 건너뜀 여부
                "error": str 또는 None
            }
        """
        async with semaphore:
            # 독립적인 세션 사용
            async with AsyncSessionLocal() as local_db:
                try:
                    # 사전 중복 체크를 거쳤지만, 동시성 문제를 대비해 한 번 더 체크
                    exists_stmt = select(ApartDetail).where(
                        and_(
                            ApartDetail.apt_id == apt.apt_id,
                            ApartDetail.is_deleted == False
                        )
                    )
                    exists_result = await local_db.execute(exists_stmt)
                    existing_detail = exists_result.scalars().first()
                    
                    if existing_detail:
                        return {
                            "success": True,
                            "apt_name": apt.apt_name,
                            "saved": False,
                            "skipped": True,
                            "error": None
                        }
                    
                    # 기본정보와 상세정보 API 호출 (Rate Limit 방지를 위해 순차 처리)
                    logger.info(f"🌐 외부 API 호출 시작: {apt.apt_name} (kapt_code: {apt.kapt_code})")
                    # 429 에러 방지를 위해 순차적으로 호출 (각 호출 사이에 작은 딜레이)
                    basic_info = await self.fetch_apartment_basic_info(apt.kapt_code)
                    await asyncio.sleep(0.1)  # API 호출 간 작은 딜레이
                    detail_info = await self.fetch_apartment_detail_info(apt.kapt_code)
                    
                    # 예외 처리
                    if isinstance(basic_info, Exception):
                        error_msg = f"기본정보 API 오류: {str(basic_info)}"
                        logger.debug(f"❌ {apt.apt_name}: {error_msg}")
                        return {
                            "success": False,
                            "apt_name": apt.apt_name,
                            "saved": False,
                            "skipped": False,
                            "error": error_msg
                        }
                    
                    if isinstance(detail_info, Exception):
                        error_msg = f"상세정보 API 오류: {str(detail_info)}"
                        logger.debug(f"❌ {apt.apt_name}: {error_msg}")
                        return {
                            "success": False,
                            "apt_name": apt.apt_name,
                            "saved": False,
                            "skipped": False,
                            "error": error_msg
                        }
                    
                    # 응답 검증
                    basic_result_code = basic_info.get("response", {}).get("header", {}).get("resultCode", "")
                    detail_result_code = detail_info.get("response", {}).get("header", {}).get("resultCode", "")
                    
                    if basic_result_code != "00":
                        basic_msg = basic_info.get("response", {}).get("header", {}).get("resultMsg", "알 수 없는 오류")
                        return {
                            "success": False,
                            "apt_name": apt.apt_name,
                            "saved": False,
                            "skipped": False,
                            "error": f"기본정보 API 오류: {basic_msg}"
                        }
                    
                    if detail_result_code != "00":
                        detail_msg = detail_info.get("response", {}).get("header", {}).get("resultMsg", "알 수 없는 오류")
                        return {
                            "success": False,
                            "apt_name": apt.apt_name,
                            "saved": False,
                            "skipped": False,
                            "error": f"상세정보 API 오류: {detail_msg}"
                        }
                    
                    # 3. 데이터 파싱
                    logger.info(f"🔍 파싱 시작: {apt.apt_name} (apt_id: {apt.apt_id}, kapt_code: {apt.kapt_code})")
                    detail_create = self.parse_apartment_details(basic_info, detail_info, apt.apt_id)
                    
                    if not detail_create:
                        logger.warning(f"⚠️ 파싱 실패: {apt.apt_name} (kapt_code: {apt.kapt_code}) - 필수 필드 누락")
                        return {
                            "success": False,
                            "apt_name": apt.apt_name,
                            "saved": False,
                            "skipped": False,
                            "error": "파싱 실패: 필수 필드 누락"
                        }
                    
                    logger.info(f"✅ 파싱 성공: {apt.apt_name} (apt_id: {apt.apt_id})")
                    
                    # 4. 저장 (매매/전월세와 동일한 방식)
                    logger.info(f"💾 저장 시도: {apt.apt_name} (apt_id: {apt.apt_id})")
                    try:
                        # apt_detail_id를 명시적으로 제거하여 자동 생성되도록 함
                        detail_dict = detail_create.model_dump()
                        # apt_detail_id가 있으면 제거 (자동 생성되어야 함)
                        if 'apt_detail_id' in detail_dict:
                            logger.warning(f"⚠️ apt_detail_id가 스키마에 포함되어 있음: {detail_dict.get('apt_detail_id')} - 제거함")
                            detail_dict.pop('apt_detail_id')
                        
                        # SQLAlchemy가 자동으로 시퀀스를 사용하도록 함
                        db_obj = ApartDetail(**detail_dict)
                        # apt_detail_id를 명시적으로 None으로 설정 (시퀀스 사용 강제)
                        db_obj.apt_detail_id = None
                        local_db.add(db_obj)
                        await local_db.commit()
                        await local_db.refresh(db_obj)  # 생성된 apt_detail_id 가져오기
                        logger.info(f"✅ 저장 성공: {apt.apt_name} (apt_id: {apt.apt_id}, apt_detail_id: {db_obj.apt_detail_id}, kapt_code: {apt.kapt_code})")
                        
                        return {
                            "success": True,
                            "apt_name": apt.apt_name,
                            "saved": True,
                            "skipped": False,
                            "error": None
                        }
                    except Exception as save_error:
                        await local_db.rollback()
                        logger.error(f"❌ 저장 중 예외 발생: {apt.apt_name} (apt_id: {apt.apt_id}) - {save_error}")
                        raise save_error
                    
                except Exception as e:
                    await local_db.rollback()
                    # 중복 키 에러 처리
                    from sqlalchemy.exc import IntegrityError
                    if isinstance(e, IntegrityError):
                        error_str = str(e).lower()
                        # apt_id 중복 (unique constraint) 또는 apt_detail_id 중복 (primary key)
                        if 'duplicate key' in error_str or 'unique constraint' in error_str:
                            # 실제로 존재하는지 다시 확인
                            verify_stmt = select(ApartDetail).where(
                                and_(
                                    ApartDetail.apt_id == apt.apt_id,
                                    ApartDetail.is_deleted == False
                                )
                            )
                            verify_result = await local_db.execute(verify_stmt)
                            existing = verify_result.scalars().first()
                            
                            if existing:
                                logger.info(f"⏭️ 중복으로 건너뜀: {apt.apt_name} (apt_id: {apt.apt_id}, apt_detail_id: {existing.apt_detail_id}) - 이미 존재함")
                            else:
                                # apt_detail_id 중복 에러인 경우 시퀀스 문제로 판단
                                if 'apt_detail_id' in str(e) or 'apart_details_pkey' in str(e):
                                    logger.error(
                                        f"❌ 시퀀스 동기화 문제 감지: {apt.apt_name} (apt_id: {apt.apt_id}). "
                                        f"apart_details 테이블의 apt_detail_id 시퀀스가 실제 데이터와 동기화되지 않았습니다. "
                                        f"다음 SQL을 실행하세요: "
                                        f"SELECT setval('apart_details_apt_detail_id_seq', COALESCE((SELECT MAX(apt_detail_id) FROM apart_details), 0) + 1, false);"
                                    )
                                else:
                                    logger.warning(
                                        f"⚠️ 중복 에러 발생했지만 실제로는 존재하지 않음: {apt.apt_name} (apt_id: {apt.apt_id}). "
                                        f"에러: {str(e)}"
                                    )
                            
                            return {
                                "success": True,
                                "apt_name": apt.apt_name,
                                "saved": False,
                                "skipped": True,
                                "error": None
                            }
                    
                    logger.error(f"❌ 아파트 상세 정보 수집 실패 ({apt.apt_name}): {e}", exc_info=True)
                    return {
                        "success": False,
                        "apt_name": apt.apt_name,
                        "saved": False,
                        "skipped": False,
                        "error": str(e)
                    }
    

    async def collect_apartment_details(
        self,
        db: AsyncSession,
        limit: Optional[int] = None
    ) -> ApartDetailCollectionResponse:
        """
        모든 아파트의 상세 정보 수집 (초고속 최적화 버전)
        
        최적화 방안:
        1. 사전 중복 체크로 불필요한 API 호출 제거 (가장 중요!)
        2. HTTP 클라이언트 풀 재사용
        3. 병렬 처리 증가
        4. 타임아웃 최적화
        
        Args:
            db: 데이터베이스 세션 (아파트 목록 조회용)
            limit: 처리할 아파트 수 제한 (None이면 전체)
        
        Returns:
            ApartDetailCollectionResponse: 수집 결과 통계
        """
        total_processed = 0
        total_saved = 0
        skipped = 0
        errors = []
        # 병렬 처리 (API Rate Limit 고려하여 조정)
        # 각 아파트마다 2개 API 호출(기본정보+상세정보)이 병렬로 발생하므로 실제 동시 요청은 2배
        CONCURRENT_LIMIT = 5  # 429 에러 방지를 위해 5개로 제한 (실제 동시 요청: 최대 10개)
        semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
        BATCH_SIZE = 16  # 배치 크기 감소 (100 -> 50 -> 40)
        
        try:
            logger.info("🚀 [초고속 모드] 아파트 상세 정보 수집 시작")
            logger.info(f"   설정: 병렬 {CONCURRENT_LIMIT}개, 배치 {BATCH_SIZE}개")
            logger.info("   최적화: 사전 중복 체크 + HTTP 풀 재사용 + Rate Limit 처리")
            loop_limit = limit if limit else 1000000
            
            while total_processed < loop_limit:
                fetch_limit = min(BATCH_SIZE, loop_limit - total_processed)
                if fetch_limit <= 0: break
                
                # 아파트 목록 조회 (메인 세션 사용)
                targets = await apartment_crud.get_multi_missing_details(db, limit=fetch_limit)
                
                if not targets:
                    logger.info("✨ 더 이상 수집할 아파트가 없습니다.")
                    break
                
                logger.info(f"   🔍 1차 필터링: get_multi_missing_details 반환 {len(targets)}개")
                
                # 🚀 최적화 1: 사전 중복 체크로 불필요한 API 호출 제거
                apt_ids = [apt.apt_id for apt in targets]
                check_stmt = select(ApartDetail.apt_id).where(
                    and_(
                        ApartDetail.apt_id.in_(apt_ids),
                        ApartDetail.is_deleted == False
                    )
                )
                check_result = await db.execute(check_stmt)
                existing_apt_ids = set(check_result.scalars().all())
                
                # 중복이 아닌 아파트만 필터링
                targets_to_process = [apt for apt in targets if apt.apt_id not in existing_apt_ids]
                pre_skipped = len(existing_apt_ids)
                skipped += pre_skipped
                
                # 🚨 중요: 1차 필터링 결과와 2차 체크 결과가 다르면 경고
                if pre_skipped > 0:
                    logger.warning(
                        f"   ⚠️  중복 발견: 1차 필터링에서 {len(targets)}개 반환했지만, "
                        f"2차 체크에서 {pre_skipped}개가 이미 존재함. "
                        f"get_multi_missing_details 쿼리에 문제가 있을 수 있습니다!"
                    )
                
                if not targets_to_process:
                    logger.info(f"   ⏭️  배치 전체 건너뜀 ({pre_skipped}개 이미 존재) - API 호출 없음 ✅")
                    total_processed += len(targets)
                    continue
                
                logger.info(
                    f"   📊 배치: 전체 {len(targets)}개 중 {pre_skipped}개 건너뜀, "
                    f"{len(targets_to_process)}개 처리 (예상 API 호출: {len(targets_to_process) * 2}회)"
                )
                
                # 병렬로 처리 (각 작업이 독립적인 세션 사용)
                # Rate Limit을 고려하여 작은 배치로 나누어 처리
                batch_tasks = []
                for i in range(0, len(targets_to_process), CONCURRENT_LIMIT):
                    batch = targets_to_process[i:i + CONCURRENT_LIMIT]
                    tasks = [self._process_single_apartment(apt, semaphore) for apt in batch]
                    batch_tasks.append(tasks)
                
                # 각 배치를 순차적으로 처리 (Rate Limit 방지)
                all_results = []
                for batch_idx, tasks in enumerate(batch_tasks):
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    all_results.extend(results)
                    
                    # 배치 간 딜레이 (Rate Limit 방지) - 429 에러 방지를 위해 증가
                    if batch_idx < len(batch_tasks) - 1:  # 마지막 배치가 아니면
                        delay_time = 0.1  # 2초 딜레이로 증가
                        logger.info(f"   ⏸️  배치 간 {delay_time}초 대기 중... (Rate Limit 방지)")
                        await asyncio.sleep(delay_time)
                
                results = all_results
                
                # 결과 집계
                batch_saved = 0
                batch_skipped = 0
                batch_errors = 0
                error_samples = []  # 에러 샘플 (처음 5개만)
                
                for res in results:
                    if isinstance(res, Exception):
                        batch_errors += 1
                        error_msg = f"처리 중 예외: {str(res)}"
                        errors.append(error_msg)
                        if len(error_samples) < 5:
                            error_samples.append(error_msg)
                        continue
                    
                    if res.get("success"):
                        if res.get("saved"):
                            batch_saved += 1
                            total_saved += 1
                        elif res.get("skipped"):
                            batch_skipped += 1
                            skipped += 1
                    else:
                        batch_errors += 1
                        error_msg = f"{res.get('apt_name', 'Unknown')}: {res.get('error', 'Unknown error')}"
                        errors.append(error_msg)
                        if len(error_samples) < 5:
                            error_samples.append(error_msg)
                
                # 에러가 있으면 샘플 출력
                if batch_errors > 0 and error_samples:
                    logger.warning(f"   ⚠️ 에러 샘플 (총 {batch_errors}개 중): {error_samples[:3]}")
                
                total_processed += len(targets)
                
                # 로그 출력
                if batch_saved > 0 or batch_skipped > 0 or batch_errors > 0:
                    logger.info(
                        f"   💾 배치 처리 완료: 저장 {batch_saved}개, "
                        f"건너뜀 {batch_skipped}개, 실패 {batch_errors}개 "
                        f"(사전 건너뜀 {pre_skipped}개 포함, 누적: 저장 {total_saved}개, 건너뜀 {skipped}개)"
                    )

            # HTTP 클라이언트 종료
            await self._close_http_client()
            
            logger.info("=" * 60)
            logger.info(f"🎉 수집 완료 (총 {total_saved}개 저장, {skipped}개 건너뜀, {len(errors)}개 오류)")
            return ApartDetailCollectionResponse(
                success=True,
                total_processed=total_processed,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors[:100],
                message=f"초고속 수집 완료: {total_saved}개 저장됨"
            )

        except Exception as e:
            await self._close_http_client()
            logger.error(f"❌ 치명적 오류 발생: {e}", exc_info=True)
            return ApartDetailCollectionResponse(success=False, total_processed=total_processed, errors=[str(e)], message=f"오류: {str(e)}")

    # =========================================================================
    # 전월세 실거래가 수집 메서드
    # =========================================================================
    
