"""
Rent Collection Service
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

# 핸들러는 루트 로거에서만 설정하므로 여기서는 추가하지 않음
# propagate는 True로 유지하여 루트 로거로 전파 (중복 로그 방지)
logger.propagate = True

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


class RentCollectionService(DataCollectionServiceBase):
    """
    Rent Collection Service
    """

    def parse_rent_xml_to_json(
        self,
        xml_data: str
    ) -> tuple[List[Dict[str, Any]], str, str]:
        """
        국토부 전월세 API XML 응답을 JSON으로 변환
        
        Args:
            xml_data: XML 응답 문자열
        
        Returns:
            (거래 데이터 리스트, 결과코드, 결과메시지)
        
        Note:
            - xmltodict 라이브러리를 사용하여 XML → dict 변환
            - API 응답의 빈 값(" ")은 None으로 처리합니다.
        """
        try:
            # XML → dict 변환
            data = xmltodict.parse(xml_data)
            
            # 응답 구조 추출
            response = data.get("response", {})
            header = response.get("header", {})
            body = response.get("body", {})
            
            result_code = header.get("resultCode", "")
            result_msg = header.get("resultMsg", "")
            
            # 결과 코드 확인 (000 또는 00이 성공)
            if result_code not in ["000", "00"]:
                logger.warning(f" API 응답 오류: {result_code} - {result_msg}")
                return [], result_code, result_msg
            
            # items 추출
            items = body.get("items", {})
            if not items:
                logger.info("   ℹ 조회된 데이터가 없습니다.")
                return [], result_code, result_msg
            
            item_list = items.get("item", [])
            
            # 단일 아이템인 경우 리스트로 변환
            if isinstance(item_list, dict):
                item_list = [item_list]
            
            # 빈 값(" ") → None 변환
            cleaned_items = []
            for item in item_list:
                cleaned_item = {}
                for key, value in item.items():
                    if isinstance(value, str) and value.strip() == "":
                        cleaned_item[key] = None
                    else:
                        cleaned_item[key] = value
                cleaned_items.append(cleaned_item)
            
            logger.info(f" XML → JSON 변환 완료: {len(cleaned_items)}개 거래 데이터")
            
            return cleaned_items, result_code, result_msg
            
        except Exception as e:
            logger.error(f" XML 파싱 실패: {e}")
            return [], "PARSE_ERROR", str(e)
    

    def parse_rent_item_from_xml(
        self,
        item: ET.Element,
        apt_id: int,
        apt_name: str = ""
    ) -> Optional[RentCreate]:
        """
        전월세 거래 데이터 파싱 (XML Element)
        
        API 응답의 단일 XML 아이템을 RentCreate 스키마로 변환합니다.
        
        Args:
            item: API 응답 아이템 (XML Element)
            apt_id: 매칭된 아파트 ID
        
        Returns:
            RentCreate 스키마 또는 None (파싱 실패 시)
        
        Note:
            - 보증금과 월세의 쉼표(,)를 제거하고 정수로 변환합니다.
            - 거래일은 dealYear, dealMonth, dealDay를 조합하여 생성합니다.
            - 계약유형은 "갱신"이면 True, 그 외에는 False 또는 None입니다.
            - monthlyRent가 0이면 전세, 0이 아니면 월세입니다.
        """
        try:
            # 거래일 파싱 (필수)
            deal_year_elem = item.find("dealYear")
            deal_month_elem = item.find("dealMonth")
            deal_day_elem = item.find("dealDay")
            
            deal_year = deal_year_elem.text.strip() if deal_year_elem is not None and deal_year_elem.text else None
            deal_month = deal_month_elem.text.strip() if deal_month_elem is not None and deal_month_elem.text else None
            deal_day = deal_day_elem.text.strip() if deal_day_elem is not None and deal_day_elem.text else None
            
            if not deal_year or not deal_month or not deal_day:
                apt_nm_elem = item.find("aptNm")
                apt_nm = apt_nm_elem.text if apt_nm_elem is not None and apt_nm_elem.text else "Unknown"
                logger.warning(f"    거래일 정보 누락: {apt_nm}")
                return None
            
            try:
                deal_date_obj = date(
                    int(deal_year),
                    int(deal_month),
                    int(deal_day)
                )
            except (ValueError, TypeError) as e:
                logger.warning(f"    거래일 변환 실패: {deal_year}-{deal_month}-{deal_day}, 오류: {e}")
                return None
            
            # 전용면적 파싱 (필수)
            exclu_use_ar_elem = item.find("excluUseAr")
            exclu_use_ar = exclu_use_ar_elem.text.strip() if exclu_use_ar_elem is not None and exclu_use_ar_elem.text else None
            
            if not exclu_use_ar:
                apt_nm_elem = item.find("aptNm")
                apt_nm = apt_nm_elem.text if apt_nm_elem is not None and apt_nm_elem.text else "Unknown"
                logger.warning(f"    전용면적 정보 누락: {apt_nm}")
                return None
            
            try:
                exclusive_area = float(exclu_use_ar)
            except (ValueError, TypeError):
                logger.warning(f"    전용면적 변환 실패: {exclu_use_ar}")
                return None
            
            # 층 파싱 (필수)
            floor_elem = item.find("floor")
            floor_str = floor_elem.text.strip() if floor_elem is not None and floor_elem.text else None
            
            if not floor_str:
                apt_nm_elem = item.find("aptNm")
                apt_nm = apt_nm_elem.text if apt_nm_elem is not None and apt_nm_elem.text else "Unknown"
                logger.warning(f"    층 정보 누락: {apt_nm}")
                return None
            
            try:
                floor = int(floor_str)
            except (ValueError, TypeError):
                logger.warning(f"    층 변환 실패: {floor_str}")
                return None
            
            # 보증금 파싱 (쉼표 제거)
            deposit_elem = item.find("deposit")
            deposit_str = deposit_elem.text.strip() if deposit_elem is not None and deposit_elem.text else None
            deposit_price = None
            if deposit_str:
                try:
                    deposit_price = int(deposit_str.replace(",", ""))
                except (ValueError, TypeError, AttributeError):
                    pass
            
            # 월세 파싱
            monthly_rent_elem = item.find("monthlyRent")
            monthly_rent_str = monthly_rent_elem.text.strip() if monthly_rent_elem is not None and monthly_rent_elem.text else None
            monthly_rent = None
            if monthly_rent_str:
                try:
                    monthly_rent = int(monthly_rent_str.replace(",", ""))
                except (ValueError, TypeError, AttributeError):
                    pass
            
            # 전세/월세 구분: monthlyRent가 0이면 전세, 0이 아니면 월세
            # 전세인 경우: deposit_price가 전세가, monthly_rent는 None
            # 월세인 경우: deposit_price가 보증금, monthly_rent가 월세가
            rent_type = "MONTHLY_RENT"
            if monthly_rent == 0:
                # 전세
                monthly_rent = None
                rent_type = "JEONSE"
            elif monthly_rent is None:
                # monthly_rent가 없는 경우도 전세로 간주 (안전장치)
                rent_type = "JEONSE"
            # 월세인 경우는 그대로 유지
            
            # 계약유형 파싱 (갱신=True, 신규/None=False)
            contract_type_elem = item.find("contractType")
            contract_type_str = contract_type_elem.text.strip() if contract_type_elem is not None and contract_type_elem.text else None
            contract_type = None
            if contract_type_str:
                contract_type = contract_type_str.strip() == "갱신"
            
            # apt_seq 추출
            apt_seq_elem = item.find("aptSeq")
            apt_seq = apt_seq_elem.text.strip() if apt_seq_elem is not None and apt_seq_elem.text else None
            if apt_seq and len(apt_seq) > 10:
                apt_seq = apt_seq[:10]  # DB 컬럼 제한에 맞게 자르기
            
            # 건축년도
            build_year_elem = item.find("buildYear")
            build_year = build_year_elem.text.strip() if build_year_elem is not None and build_year_elem.text else None
            
            return RentCreate(
                apt_id=apt_id,
                build_year=build_year,
                contract_type=contract_type,
                deposit_price=deposit_price,
                monthly_rent=monthly_rent,
                rent_type=rent_type,
                exclusive_area=exclusive_area,
                floor=floor,
                apt_seq=apt_seq,
                deal_date=deal_date_obj,
                contract_date=None,  # API에서 별도 제공하지 않음
                remarks=apt_name  # 아파트 이름 저장
            )
            
        except Exception as e:
            logger.error(f"    거래 데이터 파싱 실패: {e}")
            import traceback
            logger.debug(f"   상세: {traceback.format_exc()}")
            return None
    

    def parse_rent_item(
        self,
        item: Dict[str, Any],
        apt_id: int
    ) -> Optional[RentCreate]:
        """
        전월세 거래 데이터 파싱 (Dict - 레거시)
        
        API 응답의 단일 아이템을 RentCreate 스키마로 변환합니다.
        
        Args:
            item: API 응답 아이템 (dict)
            apt_id: 매칭된 아파트 ID
        
        Returns:
            RentCreate 스키마 또는 None (파싱 실패 시)
        
        Note:
            - 보증금과 월세의 쉼표(,)를 제거하고 정수로 변환합니다.
            - 거래일은 dealYear, dealMonth, dealDay를 조합하여 생성합니다.
            - 계약유형은 "갱신"이면 True, 그 외에는 False 또는 None입니다.
        """
        try:
            # 거래일 파싱 (필수)
            deal_year = item.get("dealYear")
            deal_month = item.get("dealMonth")
            deal_day = item.get("dealDay")
            
            if not deal_year or not deal_month or not deal_day:
                logger.warning(f"    거래일 정보 누락: {item.get('aptNm', 'Unknown')}")
                return None
            
            try:
                deal_date_obj = date(
                    int(deal_year),
                    int(deal_month),
                    int(deal_day)
                )
            except (ValueError, TypeError) as e:
                logger.warning(f"    거래일 변환 실패: {deal_year}-{deal_month}-{deal_day}, 오류: {e}")
                return None
            
            # 전용면적 파싱 (필수)
            exclu_use_ar = item.get("excluUseAr")
            if not exclu_use_ar:
                logger.warning(f"    전용면적 정보 누락: {item.get('aptNm', 'Unknown')}")
                return None
            
            try:
                exclusive_area = float(exclu_use_ar)
            except (ValueError, TypeError):
                logger.warning(f"    전용면적 변환 실패: {exclu_use_ar}")
                return None
            
            # 층 파싱 (필수)
            floor_str = item.get("floor")
            if not floor_str:
                logger.warning(f"    층 정보 누락: {item.get('aptNm', 'Unknown')}")
                return None
            
            try:
                floor = int(floor_str)
            except (ValueError, TypeError):
                logger.warning(f"    층 변환 실패: {floor_str}")
                return None
            
            # 보증금 파싱 (쉼표 제거)
            deposit_str = item.get("deposit")
            deposit_price = None
            if deposit_str:
                try:
                    deposit_price = int(deposit_str.replace(",", ""))
                except (ValueError, TypeError, AttributeError):
                    pass
            
            # 월세 파싱
            monthly_rent_str = item.get("monthlyRent")
            monthly_rent = None
            if monthly_rent_str:
                try:
                    monthly_rent = int(monthly_rent_str.replace(",", ""))
                except (ValueError, TypeError, AttributeError):
                    pass
            
            # 전세/월세 구분
            rent_type = "MONTHLY_RENT"
            if monthly_rent == 0:
                monthly_rent = None
                rent_type = "JEONSE"
            elif monthly_rent is None:
                rent_type = "JEONSE"
            
            # 계약유형 파싱 (갱신=True, 신규/None=False)
            contract_type_str = item.get("contractType")
            contract_type = None
            if contract_type_str:
                contract_type = contract_type_str.strip() == "갱신"
            
            # apt_seq 추출
            apt_seq = item.get("aptSeq")
            if apt_seq and len(apt_seq) > 10:
                apt_seq = apt_seq[:10]  # DB 컬럼 제한에 맞게 자르기
            
            # 건축년도
            build_year = item.get("buildYear")
            
            return RentCreate(
                apt_id=apt_id,
                build_year=build_year,
                contract_type=contract_type,
                deposit_price=deposit_price,
                monthly_rent=monthly_rent,
                rent_type=rent_type,
                exclusive_area=exclusive_area,
                floor=floor,
                apt_seq=apt_seq,
                deal_date=deal_date_obj,
                contract_date=None  # API에서 별도 제공하지 않음
            )
            
        except Exception as e:
            logger.error(f"    거래 데이터 파싱 실패: {e}")
            import traceback
            logger.debug(f"   상세: {traceback.format_exc()}")
            return None
    

    async def find_apartment_by_name_and_region(
        self,
        db: AsyncSession,
        apt_name: str,
        sgg_cd: str
    ) -> Optional[Apartment]:
        """
        아파트 이름과 시군구 코드로 아파트 검색
        
        Args:
            db: 데이터베이스 세션
            apt_name: 아파트 이름
            sgg_cd: 시군구 코드 (5자리)
        
        Returns:
            Apartment 객체 또는 None
        
        Note:
            - 먼저 시군구 코드로 시작하는 region_code를 가진 지역을 찾습니다.
            - 해당 지역에 속한 아파트 중 이름이 일치하는 것을 찾습니다.
            - 이름이 정확히 일치하지 않을 수 있으므로 LIKE 검색도 시도합니다.
        """
        from app.models.state import State
        
        try:
            # 1단계: 시군구 코드로 시작하는 region을 가진 아파트 찾기 (정확한 이름 매칭)
            result = await db.execute(
                select(Apartment)
                .join(State, Apartment.region_id == State.region_id)
                .where(
                    State.region_code.like(f"{sgg_cd}%"),
                    Apartment.apt_name == apt_name,
                    Apartment.is_deleted == False
                )
                .limit(1)
            )
            apartment = result.scalar_one_or_none()
            
            if apartment:
                return apartment
            
            # 2단계: 이름 부분 매칭 시도 (예: "아파트" 접미사 제거 등)
            # "○○아파트" → "○○" 또는 "○○" → "○○아파트"
            search_names = [apt_name]
            if apt_name.endswith("아파트"):
                search_names.append(apt_name[:-3])  # "아파트" 제거
            else:
                search_names.append(apt_name + "아파트")  # "아파트" 추가
            
            for name in search_names:
                result = await db.execute(
                    select(Apartment)
                    .join(State, Apartment.region_id == State.region_id)
                    .where(
                        State.region_code.like(f"{sgg_cd}%"),
                        Apartment.apt_name.like(f"%{name}%"),
                        Apartment.is_deleted == False
                    )
                    .limit(1)
                )
                apartment = result.scalar_one_or_none()
                if apartment:
                    return apartment
            
            return None
            
        except Exception as e:
            logger.error(f"    아파트 검색 실패 ({apt_name}): {e}")
            return None
    

    async def collect_rent_transactions(
        self,
        db: AsyncSession,
        lawd_cd: str,
        deal_ymd: str
    ) -> RentCollectionResponse:
        """
        전월세 실거래가 데이터 수집 및 저장
        
        국토교통부 API에서 전월세 실거래가 데이터를 가져와서 DB에 저장합니다.
        
        Args:
            db: 데이터베이스 세션
            lawd_cd: 지역코드 (법정동코드 앞 5자리)
            deal_ymd: 계약년월 (YYYYMM)
        
        Returns:
            RentCollectionResponse: 수집 결과 통계
        
        Note:
            - API 인증키는 서버의 MOLIT_API_KEY 환경변수를 사용합니다.
            - XML 응답을 JSON으로 변환합니다.
            - 아파트 이름과 지역코드로 apartments 테이블에서 apt_id를 찾습니다.
            - 중복 거래 데이터는 건너뜁니다.
        """
        total_fetched = 0
        total_saved = 0
        skipped = 0
        errors = []
        
        try:
            logger.info("=" * 80)
            logger.info(f" 전월세 실거래가 수집 시작")
            logger.info(f"    지역코드: {lawd_cd}")
            logger.info(f"    계약년월: {deal_ymd}")
            logger.info("=" * 80)
            
            # 1단계: API 호출하여 XML 데이터 가져오기 (매매와 동일한 방식)
            try:
                params = {
                    "serviceKey": self.api_key,
                    "LAWD_CD": lawd_cd,
                    "DEAL_YMD": deal_ymd,
                    "numOfRows": 4000
                }
                
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(60.0, connect=10.0),
                    limits=httpx.Limits(max_connections=15, max_keepalive_connections=10)
                ) as http_client:
                    response = await http_client.get(MOLIT_RENT_API_URL, params=params)
                    response.raise_for_status()
                    xml_content = response.text
            except httpx.HTTPError as e:
                error_msg = f"API 호출 실패: {str(e)}"
                logger.error(f" {error_msg}")
                return RentCollectionResponse(
                    success=False,
                    total_fetched=0,
                    total_saved=0,
                    skipped=0,
                    errors=[error_msg],
                    message=error_msg,
                    lawd_cd=lawd_cd,
                    deal_ymd=deal_ymd
                )
            
            # 2단계: XML 파싱 (매매와 동일한 방식)
            try:
                root = ET.fromstring(xml_content)
            except ET.ParseError as e:
                error_msg = f"XML 파싱 실패: {str(e)}"
                logger.error(f" {error_msg}")
                return RentCollectionResponse(
                    success=False,
                    total_fetched=0,
                    total_saved=0,
                    skipped=0,
                    errors=[error_msg],
                    message=error_msg,
                    lawd_cd=lawd_cd,
                    deal_ymd=deal_ymd
                )
            
            # 결과 코드 확인
            result_code_elem = root.find(".//resultCode")
            result_msg_elem = root.find(".//resultMsg")
            result_code = result_code_elem.text if result_code_elem is not None else ""
            result_msg = result_msg_elem.text if result_msg_elem is not None else ""
            
            if result_code != "000":
                error_msg = f"API 응답 오류: {result_code} - {result_msg}"
                logger.error(f" {error_msg}")
                return RentCollectionResponse(
                    success=False,
                    total_fetched=0,
                    total_saved=0,
                    skipped=0,
                    errors=[error_msg],
                    message=error_msg,
                    lawd_cd=lawd_cd,
                    deal_ymd=deal_ymd
                )
            
            # items 추출
            items_elements = root.findall(".//item")
            
            if not items_elements:
                return RentCollectionResponse(
                    success=True,
                    total_fetched=0,
                    total_saved=0,
                    skipped=0,
                    errors=[],
                    message="조회된 데이터가 없습니다.",
                    lawd_cd=lawd_cd,
                    deal_ymd=deal_ymd
                )
            
            # XML Element를 Dict로 변환 (기존 parse_rent_item과 호환)
            items = []
            for item_elem in items_elements:
                item_dict = {}
                for child in item_elem:
                    if child.text is not None:
                        item_dict[child.tag] = child.text.strip()
                    else:
                        item_dict[child.tag] = None
                items.append(item_dict)
            
            total_fetched = len(items)
            logger.info(f" 수집된 거래 데이터: {total_fetched}개")
            
            # 3단계: 각 거래 데이터를 파싱하여 DB에 저장
            apt_cache = {}  # 아파트 이름 → apt_id 캐시 (반복 검색 방지)
            
            for idx, item in enumerate(items, 1):
                apt_name = item.get("aptNm", "Unknown")
                sgg_cd = item.get("sggCd", lawd_cd)  # 시군구 코드 (없으면 lawd_cd 사용)
                
                try:
                    # 3-1: 아파트 ID 찾기 (캐시 활용)
                    cache_key = f"{sgg_cd}:{apt_name}"
                    
                    if cache_key in apt_cache:
                        apt_id = apt_cache[cache_key]
                    else:
                        apartment = await self.find_apartment_by_name_and_region(
                            db, apt_name, sgg_cd
                        )
                        
                        if not apartment:
                            error_msg = f"아파트를 찾을 수 없음: {apt_name} (지역: {sgg_cd})"
                            errors.append(error_msg)
                            logger.warning(f"    [{idx}/{total_fetched}] {error_msg}")
                            continue
                        
                        apt_id = apartment.apt_id
                        apt_cache[cache_key] = apt_id
                    
                    # 3-2: 거래 데이터 파싱
                    rent_create = self.parse_rent_item(item, apt_id)
                    
                    if not rent_create:
                        error_msg = f"데이터 파싱 실패: {apt_name}"
                        errors.append(error_msg)
                        logger.warning(f"    [{idx}/{total_fetched}] {error_msg}")
                        continue
                    
                    # 3-3: DB에 저장 (중복 체크)
                    db_obj, is_created = await rent_crud.create_or_skip(
                        db,
                        obj_in=rent_create
                    )
                    
                    if is_created:
                        total_saved += 1
                        if total_saved % 10 == 0 or total_saved == 1:
                            logger.info(f"    [{idx}/{total_fetched}] {apt_name} 저장 완료 (현재까지: {total_saved}개)")
                    else:
                        skipped += 1
                        logger.debug(f"   ⏭ [{idx}/{total_fetched}] {apt_name} 건너뜀 (중복)")
                    
                except Exception as e:
                    # savepoint 롤백
                    try:
                        await savepoint.rollback()
                    except Exception:
                        pass
                    
                    error_msg = f"처리 실패: {str(e)}"
                    errors.append(f"아파트 '{apt_name}' (ID: {apt_id}, 코드: {kapt_code}): {error_msg}")
                    total_processed += 1
                    logger.error(f"[{idx}/{len(apartments)}] {apt_name} |  실패: {error_msg}")
                    import traceback
                    logger.debug(f"상세 스택: {traceback.format_exc()}")
            
            # 마지막 남은 데이터 커밋 (반드시 실행되어야 함)
            remaining_count = total_saved - last_commit_count
            if remaining_count > 0:
                try:
                    await db.commit()  # 최상위 트랜잭션 커밋 (실제 DB 반영)
                    last_commit_count = total_saved
                    logger.info(f" 최종 커밋 완료: 총 {total_saved}개 저장됨")
                except Exception as commit_error:
                    logger.error(f" 최종 커밋 실패: {remaining_count}개 데이터 손실 가능 - {str(commit_error)}")
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                    errors.append(f"최종 커밋 실패 ({remaining_count}개 데이터 손실): {str(commit_error)}")
            
            logger.info(f" 수집 완료: 처리 {total_processed}개 | 저장 {total_saved}개 | 건너뜀 {skipped}개")
            if errors:
                logger.warning(f" 오류 {len(errors)}개 발생")
                for error in errors[:10]:
                    logger.warning(f"   - {error}")
                if len(errors) > 10:
                    logger.warning(f"   ... 외 {len(errors) - 10}개 오류")
            
            # 최종 커밋 실패가 있었으면 success=False로 반환
            final_success = len([e for e in errors if "최종 커밋 실패" in e]) == 0
            
            return ApartDetailCollectionResponse(
                success=final_success,
                total_processed=total_processed,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors,
                message=f"수집 완료: {total_saved}개 저장, {skipped}개 건너뜀" if final_success else f"수집 완료 (일부 오류): {total_saved}개 저장, {skipped}개 건너뜀"
            )
            
        except Exception as e:
            logger.error(f" 아파트 상세 정보 수집 실패: {e}", exc_info=True)
            # 예외 발생 시 남은 데이터 커밋 시도
            try:
                remaining_count = total_saved - last_commit_count
                if remaining_count > 0:
                    logger.warning(f"    예외 발생 전 남은 {remaining_count}개 데이터 커밋 시도...")
                    try:
                        await db.commit()
                        logger.info(f"    예외 발생 전 데이터 커밋 완료")
                    except Exception as commit_error:
                        logger.error(f"    예외 발생 전 데이터 커밋 실패: {str(commit_error)}")
                        await db.rollback()
            except Exception:
                pass  # 이미 예외가 발생한 상태이므로 무시
            
            return ApartDetailCollectionResponse(
                success=False,
                total_processed=total_processed,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors + [str(e)],
                message=f"수집 실패: {str(e)}"
            )
    

    async def collect_rent_data(
        self,
        db: AsyncSession,
        start_ym: str,
        end_ym: str,
        max_items: Optional[int] = None,
        allow_duplicate: bool = False,
        sgg_codes: Optional[List[str]] = None,
        apt_id_filter: Optional[int] = None,
    ) -> RentCollectionResponse:
        """
        아파트 전월세 실거래가 데이터 수집 (매매와 동일한 방식)
        
        Args:
            start_ym: 시작 연월 (YYYYMM)
            end_ym: 종료 연월 (YYYYMM)
            max_items: 최대 수집 개수 제한 (기본값: None, 제한 없음)
            allow_duplicate: 중복 저장 허용 여부 (기본값: False, False=건너뛰기, True=업데이트)
        """
        total_fetched = 0
        total_saved = 0
        skipped = 0
        errors = []
        
        logger.info(f" 전월세 수집 시작: {start_ym} ~ {end_ym}")
        if apt_id_filter is not None:
            logger.info(f"    Fix 모드: 대상 아파트(apt_id={apt_id_filter})만 저장. API는 시군구+연월 단위만 지원하므로 해당 아파트 소재 시군구로 조회 후 매칭 건만 저장합니다.")
        
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
            return RentCollectionResponse(
                success=False,
                total_fetched=0,
                total_saved=0,
                skipped=0,
                errors=[str(e)],
                message=f"날짜 형식 오류: {str(e)}",
                lawd_cd=None,
                deal_ymd=None
            )
        
        # 2. 지역 코드 추출 (sgg_codes 지정 시 해당만 사용, Fix API용)
        try:
            if sgg_codes is not None:
                target_sgg_codes = [c for c in sgg_codes if c and len(c) == 5]
                fix_msg = f", Fix 대상 아파트 apt_id={apt_id_filter} 소재 시군구" if apt_id_filter is not None else ""
                logger.info(f" 지역 코드 지정 사용 (Fix){fix_msg}: {len(target_sgg_codes)}개")
            else:
                stmt = text("SELECT DISTINCT SUBSTR(region_code, 1, 5) FROM states WHERE length(region_code) >= 5")
                result = await db.execute(stmt)
                target_sgg_codes = [row[0] for row in result.fetchall() if row[0] and len(row[0]) == 5]
                logger.info(f" {len(target_sgg_codes)}개 지역 코드 추출")
        except Exception as e:
            logger.error(f" 지역 코드 추출 실패: {e}")
            return RentCollectionResponse(
                success=False,
                total_fetched=0,
                total_saved=0,
                skipped=0,
                errors=[f"DB 오류: {e}"],
                message=f"DB 오류: {e}",
                lawd_cd=None,
                deal_ymd=None
            )
        
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
        
        async def process_rent_region(ym: str, sgg_cd: str):
            """전월세 데이터 수집 작업"""
            ym_formatted = format_ym(ym)
            async with semaphore:
                async with AsyncSessionLocal() as local_db:
                    nonlocal total_fetched, total_saved, skipped, errors
                    
                    # max_items 제한 확인
                    if max_items and total_saved >= max_items:
                        return
                    
                    try:
                        # 기존 데이터 확인
                        y = int(ym[:4])
                        m = int(ym[4:])
                        start_date = date(y, m, 1)
                        last_day = calendar.monthrange(y, m)[1]
                        end_date = date(y, m, last_day)
                        
                        check_stmt = select(func.count(Rent.trans_id)).join(Apartment).join(State).where(
                            and_(
                                State.region_code.like(f"{sgg_cd}%"),
                                Rent.deal_date >= start_date,
                                Rent.deal_date <= end_date
                            )
                        )
                        count_result = await local_db.execute(check_stmt)
                        existing_count = count_result.scalar() or 0
                        
                        if existing_count > 0 and not allow_duplicate and apt_id_filter is None:
                            skipped += existing_count
                            logger.info(f"⏭ {sgg_cd}/{ym} ({ym_formatted}): 건너뜀 ({existing_count}건 존재)")
                            return
                        
                        # API 호출 (XML) - 공유 클라이언트 사용
                        params = {
                            "serviceKey": self.api_key,
                            "LAWD_CD": sgg_cd,
                            "DEAL_YMD": ym,
                            "numOfRows": 4000
                        }
                        
                        response = await http_client.get(MOLIT_RENT_API_URL, params=params)
                        response.raise_for_status()
                        xml_content = response.text
                        
                        # XML 파싱
                        try:
                            root = ET.fromstring(xml_content)
                        except ET.ParseError as e:
                            errors.append(f"{sgg_cd}/{ym} ({ym_formatted}): XML 파싱 실패 - {str(e)}")
                            logger.error(f" {sgg_cd}/{ym} ({ym_formatted}): XML 파싱 실패 - {str(e)}")
                            return
                        
                        # 결과 코드 확인
                        result_code_elem = root.find(".//resultCode")
                        result_msg_elem = root.find(".//resultMsg")
                        result_code = result_code_elem.text if result_code_elem is not None else ""
                        result_msg = result_msg_elem.text if result_msg_elem is not None else ""
                        
                        if result_code != "000":
                            errors.append(f"{sgg_cd}/{ym} ({ym_formatted}): {result_msg}")
                            logger.error(f" {sgg_cd}/{ym} ({ym_formatted}): {result_msg}")
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
                        
                        rents_to_save = []
                        success_count = 0
                        skip_count = 0
                        error_count = 0
                        jeonse_count = 0
                        wolse_count = 0
                        apt_name_log = ""
                        normalized_cache: Dict[str, Any] = {}  # 정규화 결과 캐싱
                        batch_size = 100  # 배치 커밋 크기
                        
                        for item in items:
                            # max_items 제한 확인
                            if max_items and total_saved >= max_items:
                                break
                            
                            try:
                                #  API 응답 원본 데이터 추출 (실패 로그용)
                                api_response_data = {}
                                for child in item:
                                    if child.text is not None:
                                        api_response_data[child.tag] = child.text.strip()
                                
                                # XML Element에서 필드 추출
                                apt_nm_elem = item.find("aptNm")
                                apt_nm = apt_nm_elem.text.strip() if apt_nm_elem is not None and apt_nm_elem.text else ""
                                
                                umd_nm_elem = item.find("umdNm")
                                umd_nm = umd_nm_elem.text.strip() if umd_nm_elem is not None and umd_nm_elem.text else ""
                                
                                #  새 API 추가 필드: umdCd (읍면동코드) - 더 정확한 동 매칭에 활용
                                umd_cd_elem = item.find("umdCd")
                                umd_cd = umd_cd_elem.text.strip() if umd_cd_elem is not None and umd_cd_elem.text else ""
                                
                                sgg_cd_elem = item.find("sggCd")
                                sgg_cd_item = sgg_cd_elem.text.strip() if sgg_cd_elem is not None and sgg_cd_elem.text else sgg_cd
                                
                                # 지번 추출 (매칭에 활용)
                                jibun_elem = item.find("jibun")
                                jibun = jibun_elem.text.strip() if jibun_elem is not None and jibun_elem.text else ""
                                
                                #  새 API 추가 필드: bonbun/bubun (본번/부번) - 더 정확한 지번 매칭
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
                                
                                # 건축년도 추출 (매칭에 활용)
                                build_year_elem = item.find("buildYear")
                                build_year_for_match = build_year_elem.text.strip() if build_year_elem is not None and build_year_elem.text else ""
                                
                                if not apt_nm:
                                    continue
                                
                                if not apt_name_log:
                                    apt_name_log = apt_nm
                                
                                #  최우선 매칭: 법정동 코드 10자리 + 지번(부번까지) 정확 매칭
                                # 이름과 관계없이 법정동 코드와 지번이 모두 일치하면 같은 아파트로 인식
                                matched_apt = None
                                candidates = local_apts
                                sgg_code_matched = True
                                dong_matched = False
                                
                                # 매칭 단계 추적용 리스트
                                matching_steps = []
                                
                                # 0단계: 법정동 코드 10자리 + 지번(부번까지) 정확 매칭 (최우선, 이름 무관)
                                if sgg_cd_item and umd_cd and jibun:
                                    full_region_code = f"{sgg_cd_item}{umd_cd}"
                                    
                                    #  새로운 매칭 함수 사용: 법정동 코드 + 지번(부번까지) 정확 매칭
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
                                        #  매칭 성공 로그를 파일로 저장 (docker log에는 출력 안 함)
                                        self._record_apt_success(
                                            trans_type='전월세',
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
                                
                                #  개선: 법정동 코드 10자리로 후보 강제 필터링 (미스매칭 방지)
                                # 법정동+지번 매칭 실패 시, 법정동 코드만으로라도 후보를 제한
                                if not matched_apt and sgg_cd_item and umd_cd:
                                    full_region_code = f"{sgg_cd_item}{umd_cd}"
                                    # 법정동 코드 10자리로 후보 강제 필터링
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
                                        #  개선: 법정동 코드로 후보가 없으면 매칭 실패로 간주 (미스매칭 방지)
                                        matching_steps.append({
                                            'step': 'full_region_code',
                                            'attempted': True,
                                            'success': False,
                                            'full_region_code': full_region_code,
                                            'reason': '법정동 코드로 후보 없음 (DB에 해당 동 아파트 없음)'
                                        })
                                        # 매칭 실패로 처리
                                        candidates = []
                                
                                # 시군구 코드 기반 필터링 (fallback - 읍면동 코드가 없는 경우만)
                                if not matched_apt and not dong_matched and sgg_cd_item and str(sgg_cd_item).strip():
                                    sgg_cd_item_str = str(sgg_cd_item).strip()
                                    sgg_cd_db = ApartmentMatcher.convert_sgg_code_to_db_format(sgg_cd_item_str)
                                    
                                    if sgg_cd_db:
                                        # 정확한 매칭 시도
                                        filtered = [
                                            apt for apt in local_apts
                                            if apt.region_id in all_regions
                                            and all_regions[apt.region_id].region_code == sgg_cd_db
                                        ]
                                        # 정확한 매칭 실패 시 시작 부분 매칭
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
                                
                                # 동 기반 필터링 (fallback - 읍면동 코드가 없고 동 이름만 있는 경우)
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
                                
                                #  개선: 법정동 코드로 필터링한 경우, 후보가 없으면 매칭 불가 (미스매칭 방지)
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
                                        trans_type='전월세',
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
                                
                                # 1단계: 이름 매칭 (주소+지번 매칭 실패 시에만 사용)
                                #  동 검증 기본 활성화 (require_dong_match 기본값 True)
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
                                    # 전체 후보로 재시도 시 반드시 동 일치 검증 수행
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
                                    full_region_code = None
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
                                    
                                    # 법정동 코드 구성
                                    if sgg_cd_item and umd_cd:
                                        full_region_code = f"{sgg_cd_item}{umd_cd}"
                                    
                                    # 실패 케이스 로깅 (apartfail_YYYYMM.log 파일로 저장)
                                    self._record_apt_fail(
                                        trans_type='전월세',
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
                                        full_region_code=full_region_code,
                                        matching_steps=matching_steps,
                                        api_response_data=api_response_data
                                    )
                                    continue
                                
                                # 매칭 로그 기록 (apart_YYYYMM.log용)
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
                                    ym,
                                    matching_method=matching_method
                                )
                                
                                if apt_id_filter is not None and matched_apt.apt_id != apt_id_filter:
                                    continue
                                
                                # 거래 데이터 파싱 (XML Element에서 추출) - 인라인으로 최적화
                                try:
                                    # 거래일 파싱
                                    deal_year_elem = item.find("dealYear")
                                    deal_month_elem = item.find("dealMonth")
                                    deal_day_elem = item.find("dealDay")
                                    
                                    deal_year = deal_year_elem.text.strip() if deal_year_elem is not None and deal_year_elem.text else None
                                    deal_month = deal_month_elem.text.strip() if deal_month_elem is not None and deal_month_elem.text else None
                                    deal_day = deal_day_elem.text.strip() if deal_day_elem is not None and deal_day_elem.text else None
                                    
                                    if not deal_year or not deal_month or not deal_day:
                                        error_count += 1
                                        continue
                                    
                                    deal_date_obj = date(int(deal_year), int(deal_month), int(deal_day))
                                    
                                    # 전용면적 파싱
                                    exclu_use_ar_elem = item.find("excluUseAr")
                                    exclu_use_ar = exclu_use_ar_elem.text.strip() if exclu_use_ar_elem is not None and exclu_use_ar_elem.text else None
                                    if not exclu_use_ar:
                                        error_count += 1
                                        continue
                                    exclusive_area = float(exclu_use_ar)
                                    
                                    # 층 파싱
                                    floor_elem = item.find("floor")
                                    floor_str = floor_elem.text.strip() if floor_elem is not None and floor_elem.text else None
                                    if not floor_str:
                                        error_count += 1
                                        continue
                                    floor = int(floor_str)
                                    
                                    # 보증금 파싱
                                    deposit_elem = item.find("deposit")
                                    deposit_str = deposit_elem.text.strip() if deposit_elem is not None and deposit_elem.text else None
                                    deposit_price = None
                                    if deposit_str:
                                        try:
                                            deposit_price = int(deposit_str.replace(",", ""))
                                        except:
                                            pass
                                    
                                    # 월세 파싱
                                    monthly_rent_elem = item.find("monthlyRent")
                                    monthly_rent_str = monthly_rent_elem.text.strip() if monthly_rent_elem is not None and monthly_rent_elem.text else None
                                    monthly_rent = None
                                    if monthly_rent_str:
                                        try:
                                            monthly_rent = int(monthly_rent_str.replace(",", ""))
                                            if monthly_rent == 0:
                                                monthly_rent = None  # 전세인 경우
                                        except:
                                            pass
                                    
                                    # 전세/월세 구분
                                    rent_type = "JEONSE" if monthly_rent is None else "MONTHLY_RENT"
                                    
                                    # 전세/월세 구분 카운트
                                    if monthly_rent and monthly_rent > 0:
                                        wolse_count += 1
                                    else:
                                        jeonse_count += 1
                                    
                                    # 중복 체크 (인라인으로 최적화 - 전월세 특성 반영)
                                    # 전월세는 같은 날짜에 같은 아파트에서 여러 거래가 있을 수 있으므로
                                    # apt_seq(아파트 일련번호)를 포함하여 더 정확한 중복 체크 수행
                                    apt_seq_elem = item.find("aptSeq")
                                    apt_seq = apt_seq_elem.text.strip() if apt_seq_elem is not None and apt_seq_elem.text else None
                                    if apt_seq and len(apt_seq) > 10:
                                        apt_seq = apt_seq[:10]
                                    
                                    exists_conditions = [
                                        Rent.apt_id == matched_apt.apt_id,
                                        Rent.deal_date == deal_date_obj,
                                        Rent.floor == floor,
                                        Rent.exclusive_area >= exclusive_area - 0.01,
                                        Rent.exclusive_area <= exclusive_area + 0.01,
                                    ]
                                    
                                    # deposit_price 조건 추가 (None 처리)
                                    if deposit_price is None:
                                        exists_conditions.append(Rent.deposit_price.is_(None))
                                    else:
                                        exists_conditions.append(Rent.deposit_price == deposit_price)
                                    
                                    # monthly_rent 조건 추가 (None 처리)
                                    if monthly_rent is None:
                                        exists_conditions.append(Rent.monthly_rent.is_(None))
                                    else:
                                        exists_conditions.append(Rent.monthly_rent == monthly_rent)
                                    
                                    # apt_seq가 있으면 중복 체크에 포함 (더 정확한 중복 방지)
                                    if apt_seq:
                                        exists_conditions.append(Rent.apt_seq == apt_seq)
                                    
                                    exists_stmt = select(Rent).where(and_(*exists_conditions))
                                    exists = await local_db.execute(exists_stmt)
                                    existing_rent = exists.scalars().first()
                                    
                                    if existing_rent:
                                        if allow_duplicate:
                                            # 업데이트
                                            build_year_elem = item.find("buildYear")
                                            build_year = build_year_elem.text.strip() if build_year_elem is not None and build_year_elem.text else None
                                            contract_type_elem = item.find("contractType")
                                            contract_type_str = contract_type_elem.text.strip() if contract_type_elem is not None and contract_type_elem.text else None
                                            contract_type = contract_type_str == "갱신" if contract_type_str else None
                                            
                                            existing_rent.build_year = build_year
                                            existing_rent.deposit_price = deposit_price
                                            existing_rent.monthly_rent = monthly_rent
                                            existing_rent.rent_type = rent_type
                                            existing_rent.contract_type = contract_type
                                            existing_rent.remarks = apt_nm
                                            local_db.add(existing_rent)
                                            success_count += 1
                                            total_saved += 1
                                        else:
                                            skip_count += 1
                                        continue
                                    
                                    # 새로 생성
                                    build_year_elem = item.find("buildYear")
                                    build_year = build_year_elem.text.strip() if build_year_elem is not None and build_year_elem.text else None
                                    contract_type_elem = item.find("contractType")
                                    contract_type_str = contract_type_elem.text.strip() if contract_type_elem is not None and contract_type_elem.text else None
                                    contract_type = contract_type_str == "갱신" if contract_type_str else None
                                    
                                    # apt_seq는 위에서 이미 추출됨 (중복 체크에서 사용)
                                    
                                    rent_create = RentCreate(
                                        apt_id=matched_apt.apt_id,
                                        build_year=build_year,
                                        contract_type=contract_type,
                                        deposit_price=deposit_price,
                                        monthly_rent=monthly_rent,
                                        rent_type=rent_type,
                                        exclusive_area=exclusive_area,
                                        floor=floor,
                                        apt_seq=apt_seq,
                                        deal_date=deal_date_obj,
                                        contract_date=None,
                                        remarks=apt_nm
                                    )
                                    
                                    db_obj = Rent(**rent_create.model_dump())
                                    local_db.add(db_obj)
                                    rents_to_save.append(rent_create)
                                    
                                    # 아파트 상태 업데이트
                                    if matched_apt.is_available != "1":
                                        matched_apt.is_available = "1"
                                        local_db.add(matched_apt)
                                    
                                    # 배치 커밋 (성능 최적화)
                                    if len(rents_to_save) >= batch_size:
                                        await local_db.commit()
                                        total_saved += len(rents_to_save)
                                        success_count += len(rents_to_save)
                                        rents_to_save = []
                                        
                                except Exception as e:
                                    error_count += 1
                                    continue
                                
                            except Exception as e:
                                error_count += 1
                                continue
                        
                        # 남은 데이터 커밋
                        if rents_to_save or (allow_duplicate and success_count > 0):
                            await local_db.commit()
                            if rents_to_save:
                                total_saved += len(rents_to_save)
                                success_count += len(rents_to_save)
                        
                        # 간결한 로그 (한 줄)
                        if success_count > 0 or skip_count > 0 or error_count > 0:
                            logger.info(
                                f"{sgg_cd}/{ym} ({ym_formatted}): "
                                f"{success_count} ⏭{skip_count} {error_count} "
                                f"(전세:{jeonse_count} 월세:{wolse_count}) ({apt_name_log})"
                            )
                        if apt_id_filter is not None:
                            total_apt = success_count + skip_count
                            logger.info(
                                f"    Fix 대상 아파트(apt_id={apt_id_filter}) {ym_formatted} 전월세: "
                                f"총 {total_apt}건 (저장 {success_count}, 중복 스킵 {skip_count}) "
                                f"(전세 {jeonse_count}, 월세 {wolse_count})"
                            )
                        
                        skipped += skip_count
                        
                        # max_items 제한 확인
                        if max_items and total_saved >= max_items:
                            return
                        
                    except Exception as e:
                        errors.append(f"{sgg_cd}/{ym}: {str(e)}")
                        logger.error(f" {sgg_cd}/{ym}: {str(e)}")
                        await local_db.rollback()
        
        # 병렬 실행
        try:
            total_months = len(target_months)
            for month_idx, ym in enumerate(target_months, 1):
                if max_items and total_saved >= max_items:
                    break
                
                ym_formatted = format_ym(ym)
                # 월 시작 로그 (Fix 모드: 대상 아파트 소재 시군구만 사용, 지역 자체를 수집하는 아님)
                if apt_id_filter is not None:
                    logger.info(f" {ym_formatted} | {month_idx}/{total_months}개 월 | Fix: 대상 아파트(apt_id={apt_id_filter}) 소재 시군구 1개 기준 전월세 수집 중...")
                else:
                    logger.info(f" {ym_formatted} | {month_idx}/{total_months}개 월 | {total_regions}개 지역 데이터 수집 중...")
                
                tasks = [process_rent_region(ym, sgg_cd) for sgg_cd in target_sgg_codes]
                await asyncio.gather(*tasks, return_exceptions=True)
                
                # 월 완료 로그
                logger.info(f" {ym_formatted} 완료 | 누적 저장: {total_saved}건")
                
                # 해당 월의 로그 저장 (apart_YYYYMM.log, apartfail_YYYYMM.log)
                print(f"[LOG_SAVE] 월 완료 - {ym_formatted} 로그 저장 시작 (ym={ym})")
                logger.info(f"=" * 60)
                logger.info(f" [전월세] {ym_formatted} 로그 저장 시작")
                logger.info(f"   매칭 로그: {len(self._apt_matching_log_by_month.get(ym, {}))}개 아파트")
                logger.info(f"   실패 로그: {len(self._apt_fail_log_by_month.get(ym, []))}건")
                logger.info(f"=" * 60)
                
                try:
                    print(f"[LOG_SAVE] {ym} - _save_apt_matching_log 호출")
                    self._save_apt_matching_log(ym)
                    print(f"[LOG_SAVE] {ym} - _save_apt_matching_log 완료")
                except Exception as e:
                    print(f"[LOG_SAVE] ERROR: {ym} 매칭 로그 저장 실패 - {e}")
                    logger.error(f" [전월세] {ym_formatted} 매칭 로그 저장 실패: {e}", exc_info=True)
                
                try:
                    print(f"[LOG_SAVE] {ym} - _save_apt_fail_log 호출")
                    self._save_apt_fail_log(ym)
                    print(f"[LOG_SAVE] {ym} - _save_apt_fail_log 완료")
                except Exception as e:
                    print(f"[LOG_SAVE] ERROR: {ym} 실패 로그 저장 실패 - {e}")
                    logger.error(f" [전월세] {ym_formatted} 실패 로그 저장 실패: {e}", exc_info=True)
                
                try:
                    print(f"[LOG_SAVE] {ym} - _save_apt_success_log 호출")
                    self._save_apt_success_log(ym)
                    print(f"[LOG_SAVE] {ym} - _save_apt_success_log 완료")
                except Exception as e:
                    print(f"[LOG_SAVE] ERROR: {ym} 성공 로그 저장 실패 - {e}")
                    logger.error(f" [전월세] {ym_formatted} 성공 로그 저장 실패: {e}", exc_info=True)
                
                logger.info(f"=" * 60)
                logger.info(f" [전월세] {ym_formatted} 로그 저장 완료")
                logger.info(f"=" * 60)
                print(f"[LOG_SAVE] {ym_formatted} 로그 저장 프로세스 완료")
                
                if max_items and total_saved >= max_items:
                    break
        finally:
            # HTTP 클라이언트 정리
            await http_client.aclose()
        
        logger.info(f" 전월세 수집 완료: 저장 {total_saved}건, 건너뜀 {skipped}건, 오류 {len(errors)}건")
        # 참고: 각 월의 로그는 월별로 이미 저장되었습니다.
        
        return RentCollectionResponse(
            success=True,
            total_fetched=total_fetched,
            total_saved=total_saved,
            skipped=skipped,
            errors=errors[:100],
            message=f"수집 완료: {total_saved}건 저장, {skipped}건 건너뜀",
            lawd_cd=None,
            deal_ymd=None
        )

