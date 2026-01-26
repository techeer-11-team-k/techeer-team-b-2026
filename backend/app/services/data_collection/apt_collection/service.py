"""
Apt Collection Service
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


class AptCollectionService(DataCollectionServiceBase):
    """
    Apt Collection Service
    """

    async def fetch_apartment_data(
        self,
        page_no: int = 1,
        num_of_rows: int = 1000
    ) -> Dict[str, Any]:
        """
        국토부 API에서 아파트 목록 데이터 가져오기
        
        Args:
            page_no: 페이지 번호 (기본값: 1)
            num_of_rows: 한 페이지 결과 수 (기본값: 1000)
        
        Returns:
            API 응답 데이터 (dict)
        
        Raises:
            httpx.HTTPError: API 호출 실패 시
        """
        # API 요청 파라미터
        params = {
            "serviceKey": self.api_key,
            "pageNo": str(page_no),
            "numOfRows": str(num_of_rows)
        }
        
        logger.info(f"    API 호출: 페이지 {page_no}, {num_of_rows}개 요청")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(MOLIT_APARTMENT_LIST_API_URL, params=params)
            response.raise_for_status()
            data = response.json()
            
            # 첫 페이지일 때만 디버그 로그 출력
            if page_no == 1:
                logger.debug(f"    API 응답 구조: {data}")
            
            return data
    

    def parse_apartment_data(
        self,
        api_response: Dict[str, Any]
    ) -> tuple[List[Dict[str, Any]], int, int]:
        """
        아파트 목록 API 응답 파싱
        
        Args:
            api_response: API 응답 데이터
        
        Returns:
            (파싱된 아파트 목록, 전체 개수, 원본 개수)
        """
        try:
            # 응답 구조: response.body.items
            body = api_response.get("response", {}).get("body", {})
            items = body.get("items", [])
            total_count = int(body.get("totalCount", 0))
            
            # items가 리스트가 아닌 경우 (단일 객체)
            if not isinstance(items, list):
                items = [items] if items else []
            
            original_count = len(items)
            apartments = []
            
            for item in items:
                if not item:
                    continue
                
                # API 응답 필드 매핑
                kapt_code = item.get("kaptCode", "").strip()
                kapt_name = item.get("kaptName", "").strip()
                bjd_code = item.get("bjdCode", "").strip()
                
                # 필수 필드 검증
                if not kapt_code or not kapt_name or not bjd_code:
                    continue
                
                apartments.append({
                    "kapt_code": kapt_code,
                    "apt_name": kapt_name,
                    "bjd_code": bjd_code,  # 법정동 코드 (region_code로 매칭)
                    "as1": item.get("as1"),  # 시도
                    "as2": item.get("as2"),  # 시군구
                    "as3": item.get("as3"),  # 읍면동
                    "as4": item.get("as4")   # 리
                })
            
            logger.info(f" 파싱 완료: 원본 {original_count}개 → 수집 {len(apartments)}개 아파트 (전체 {total_count}개 중)")
            
            return apartments, total_count, original_count
            
        except Exception as e:
            logger.error(f" 파싱 오류: {e}")
            return [], 0, 0
    

    async def collect_all_apartments(
        self,
        db: AsyncSession
    ) -> ApartmentCollectionResponse:
        """
        모든 아파트 목록 수집
        
        국토부 아파트 목록 API에서 모든 아파트를 가져와서 데이터베이스에 저장합니다.
        
        Args:
            db: 데이터베이스 세션
        
        Returns:
            ApartmentCollectionResponse: 수집 결과 통계
        """
        total_fetched = 0
        total_saved = 0
        skipped = 0
        errors = []
        
        try:
            logger.info("=" * 80)
            logger.info(" 아파트 목록 수집 시작")
            logger.info("=" * 80)
            
            page_no = 1
            has_more = True
            num_of_rows = 1000  # 페이지당 요청할 레코드 수
            
            logger.info(f" 아파트 데이터 수집 시작 (페이지당 {num_of_rows}개 요청)")
            
            while has_more:
                # API 데이터 가져오기
                api_response = await self.fetch_apartment_data(
                    page_no=page_no,
                    num_of_rows=num_of_rows
                )
                
                # 데이터 파싱
                apartments, total_count, original_count = self.parse_apartment_data(api_response)
                
                # 원본 데이터가 없으면 종료
                if original_count == 0:
                    logger.info(f"   ℹ  페이지 {page_no}: 원본 데이터 없음 (종료)")
                    has_more = False
                    break
                
                total_fetched += len(apartments)
                
                logger.info(f"    페이지 {page_no}: 원본 {original_count}개 → 수집 {len(apartments)}개 아파트 (누적: {total_fetched}개)")
                
                # 데이터베이스에 저장
                for apt_idx, apt_data in enumerate(apartments, 1):
                    try:
                        kapt_code = apt_data.get('kapt_code', 'Unknown')
                        apt_name = apt_data.get('apt_name', 'Unknown')
                        bjd_code = apt_data.get('bjd_code', '')
                        
                        # bjdCode를 region_code로 사용하여 region_id 찾기
                        region = await state_crud.get_by_region_code(db, region_code=bjd_code)
                        
                        if not region:
                            error_msg = f"아파트 '{apt_name}' (코드: {kapt_code}): 법정동 코드 '{bjd_code}'에 해당하는 지역을 찾을 수 없습니다."
                            errors.append(error_msg)
                            logger.warning(f"       {error_msg}")
                            continue
                        
                        # 상세 로그
                        logger.info(f"    [{region.city_name} {region.region_name}] {apt_name} (단지코드: {kapt_code}) 저장 시도... ({apt_idx}/{len(apartments)}번째)")
                        
                        apartment_create = ApartmentCreate(
                            region_id=region.region_id,
                            apt_name=apt_name,
                            kapt_code=kapt_code,
                            is_available=None  # 기본값
                        )
                        
                        db_obj, is_created = await apartment_crud.create_or_skip(
                            db,
                            obj_in=apartment_create
                        )
                        
                        if is_created:
                            total_saved += 1
                            logger.info(f"       저장 완료: {apt_name} (전체 저장: {total_saved}개)")
                        else:
                            skipped += 1
                            logger.info(f"      ⏭  건너뜀 (이미 존재): {apt_name} (전체 건너뜀: {skipped}개)")
                            
                    except Exception as e:
                        error_msg = f"아파트 '{apt_data.get('apt_name', 'Unknown')}': {str(e)}"
                        errors.append(error_msg)
                        logger.warning(f"       저장 실패: {error_msg}")
                
                # 다음 페이지 확인
                if original_count < num_of_rows:
                    logger.info(f"    마지막 페이지로 판단 (원본 {original_count}개 < 요청 {num_of_rows}개)")
                    has_more = False
                else:
                    logger.info(f"   ⏭  다음 페이지로... (원본 {original_count}개, 다음 페이지: {page_no + 1})")
                    page_no += 1
                
                # API 호출 제한 방지를 위한 딜레이
                await asyncio.sleep(0.2)
            
            logger.info("=" * 80)
            logger.info(f" 아파트 목록 수집 완료")
            logger.info(f"   - 총 {page_no}페이지 처리")
            logger.info(f"   - 수집: {total_fetched}개")
            logger.info(f"   - 저장: {total_saved}개")
            logger.info(f"   - 건너뜀: {skipped}개")
            if errors:
                logger.info(f"   - 오류: {len(errors)}개")
            logger.info("=" * 80)
            
            return ApartmentCollectionResponse(
                success=True,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors,
                message=f"수집 완료: {total_saved}개 저장, {skipped}개 건너뜀"
            )
            
        except Exception as e:
            logger.error(f" 아파트 목록 수집 실패: {e}", exc_info=True)
            return ApartmentCollectionResponse(
                success=False,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors + [str(e)],
                message=f"수집 실패: {str(e)}"
            )

