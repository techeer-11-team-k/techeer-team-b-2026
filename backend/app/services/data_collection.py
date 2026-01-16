"""
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
from pathlib import Path
from typing import List, Dict, Any, Optional
from urllib.parse import quote
import httpx
from datetime import datetime, date

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
from app.crud.state import state as state_crud
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

# 국토부 표준지역코드 API 엔드포인트
MOLIT_REGION_API_URL = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList"

# 국토부 아파트 목록 API 엔드포인트
MOLIT_APARTMENT_LIST_API_URL = "https://apis.data.go.kr/1613000/AptListService3/getTotalAptList3"

# 국토부 아파트 기본정보 API 엔드포인트
MOLIT_APARTMENT_BASIC_API_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4"

# 국토부 아파트 상세정보 API 엔드포인트
MOLIT_APARTMENT_DETAIL_API_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusDtlInfoV4"

# 한국부동산원 API 엔드포인트
REB_DATA_URL = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"

# 국토부 아파트 매매 실거래가 API 엔드포인트 (JSON)
MOLIT_SALE_API_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"

# 국토부 아파트 전월세 실거래가 API 엔드포인트 (JSON)
MOLIT_RENT_API_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"

# 시도 목록 (17개)
CITY_NAMES = [
    "강원특별자치도",
    "경기도",
    "경상남도",
    "경상북도",
    "광주광역시",
    "대구광역시",
    "대전광역시",
    "부산광역시",
    "서울특별시",
    "세종특별자치시",
    "울산광역시",
    "인천광역시",
    "전라남도",
    "전북특별자치도",
    "제주특별자치도",
    "충청남도",
    "충청북도"
]


class DataCollectionService:
    """
    데이터 수집 서비스 클래스
    
    국토교통부 API에서 지역 데이터를 가져와서 데이터베이스에 저장합니다.
    """
    
    # CSV 파일 경로 캐시 (한 번만 확인)
    _csv_path_cache: Optional[Path] = None
    _csv_path_checked: bool = False
    
    def __init__(self):
        """서비스 초기화"""
        if not settings.MOLIT_API_KEY:
            raise ValueError("MOLIT_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
        self.api_key = settings.MOLIT_API_KEY
    
    async def fetch_with_retry(self, url: str, params: Dict[str, Any], retries: int = 3) -> Dict[str, Any]:
        """
        API 호출 재시도 로직 (지수 백오프)
        """
        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(url, params=params)
                    response.raise_for_status()
                    return response.json()
            except httpx.TimeoutException:
                if attempt == retries - 1:
                    logger.warning(f"⏰ [Timeout] API 호출 시간 초과 ({url}) - {retries}회 시도 실패")
                    raise
                await asyncio.sleep(0.5 * (2 ** attempt))
            except Exception as e:
                if attempt == retries - 1:
                    logger.warning(f"❌ [API Error] {e} ({url})")
                    raise
                await asyncio.sleep(0.5 * (2 ** attempt))
        return {}
    
    async def fetch_region_data(
        self,
        city_name: str,
        page_no: int = 1,
        num_of_rows: int = 1000
    ) -> Dict[str, Any]:
        """
        국토부 API에서 지역 데이터 가져오기
        
        Args:
            city_name: 시도명 (예: 서울특별시)
            page_no: 페이지 번호 (기본값: 1)
            num_of_rows: 한 페이지 결과 수 (기본값: 1000)
        
        Returns:
            API 응답 데이터 (dict)
        
        Raises:
            httpx.HTTPError: API 호출 실패 시
        """
        # URL 인코딩
        encoded_city_name = quote(city_name)
        
        # API 요청 파라미터
        # locatadd_nm: 주소명으로 필터링 (시도명으로 시작하는 모든 주소)
        params = {
            "serviceKey": self.api_key,
            "pageNo": str(page_no),
            "numOfRows": str(num_of_rows),
            "type": "json",
            "locatadd_nm": city_name  # 예: "서울특별시"로 검색하면 "서울특별시"로 시작하는 모든 주소 반환
        }
        
        logger.info(f"📡 API 호출: {city_name} (페이지 {page_no}, 요청: {num_of_rows}개)")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(MOLIT_REGION_API_URL, params=params)
            response.raise_for_status()
            data = response.json()
            
            # API 응답 구조 확인용 로깅 (첫 페이지만)
            if page_no == 1:
                logger.debug(f"   🔍 API 응답 구조 확인: {list(data.keys()) if isinstance(data, dict) else '리스트'}")
            
            return data
    
    def parse_region_data(
        self,
        api_response: Dict[str, Any],
        city_name: str
    ) -> tuple[List[Dict[str, str]], int, int]:
        """
        API 응답 데이터 파싱 (모든 레벨 수집)
        
        실제 API 응답 구조:
        {
          "StanReginCd": [
            {
              "head": [
                {"totalCount": 493},
                {"numOfRows": "10", "pageNo": "1", "type": "JSON"},
                {"RESULT": {"resultCode": "INFO-0", "resultMsg": "NOMAL SERVICE"}}
              ]
            },
            {
              "row": [
                {
                  "region_cd": "1171000000",
                  "sido_cd": "11",
                  "sgg_cd": "710",
                  "umd_cd": "000",
                  "locatadd_nm": "서울특별시 송파구",
                  "locallow_nm": "송파구",
                  ...
                }
              ]
            }
          ]
        }
        
        Args:
            api_response: API 응답 데이터
            city_name: 시도명 (파라미터로 전달받은 값)
        
        Returns:
            (파싱된 지역 데이터 목록, 총 개수, 원본 데이터 수)
        """
        regions = []
        total_count = 0
        original_count = 0
        
        try:
            # StanReginCd 배열에서 데이터 추출
            stan_regin_cd = api_response.get("StanReginCd", [])
            
            if not stan_regin_cd or len(stan_regin_cd) < 2:
                logger.warning("⚠️ API 응답 구조가 예상과 다릅니다")
                return [], 0, 0
            
            # head에서 totalCount 추출
            head_data = stan_regin_cd[0].get("head", [])
            for head_item in head_data:
                if isinstance(head_item, dict) and "totalCount" in head_item:
                    total_count = int(head_item["totalCount"])
                    break
            
            # row에서 실제 데이터 추출
            row_data = stan_regin_cd[1].get("row", [])
            
            # row가 리스트가 아닌 경우 처리
            if not isinstance(row_data, list):
                row_data = [row_data] if row_data else []
            
            # 원본 데이터 수 저장 (필터링 전)
            original_count = len(row_data)
            
            for item in row_data:
                # 필수 필드 추출
                region_cd = str(item.get("region_cd", "")).strip()
                locatadd_nm = str(item.get("locatadd_nm", "")).strip()  # 전체 주소명 (예: "서울특별시 송파구")
                locallow_nm = str(item.get("locallow_nm", "")).strip()  # 시군구명 (예: "송파구")
                umd_cd = str(item.get("umd_cd", "")).strip()  # 읍면동 코드
                sgg_cd = str(item.get("sgg_cd", "")).strip()  # 시군구 코드
                ri_cd = str(item.get("ri_cd", "")).strip()  # 리 코드
                
                # region_cd가 10자리가 아니면 건너뛰기
                if len(region_cd) != 10:
                    continue
                
                # 모든 레벨 수집 (나중에 최하위 레벨만 필터링)
                # 시도명 추출 (locatadd_nm에서 추출하거나 파라미터 사용)
                parsed_city = self._extract_city_name_from_address(locatadd_nm) or city_name
                
                # 시군구명이 없으면 locatadd_nm에서 추출 시도
                if not locallow_nm:
                    # "서울특별시 송파구" -> "송파구"
                    parts = locatadd_nm.split()
                    if len(parts) >= 2:
                        locallow_nm = parts[-1]
                    else:
                        locallow_nm = locatadd_nm
                
                regions.append({
                    "region_code": region_cd,
                    "region_name": locallow_nm,
                    "city_name": parsed_city
                })
            
            logger.info(f"✅ 파싱 완료: 원본 {original_count}개 → 수집 {len(regions)}개 지역 (모든 레벨 저장, 전체 {total_count}개 중)")
            return regions, total_count, original_count
            
        except Exception as e:
            logger.error(f"❌ 데이터 파싱 실패: {e}")
            logger.debug(f"API 응답: {api_response}")
            import traceback
            logger.debug(traceback.format_exc())
            return [], 0, 0
    
    
    def _extract_city_name_from_address(self, locatadd_nm: str) -> str:
        """
        주소명에서 시도명 추출
        
        Args:
            locatadd_nm: 전체 주소명 (예: "서울특별시 송파구")
        
        Returns:
            시도명 (예: "서울특별시")
        """
        if not locatadd_nm:
            return ""
        
        # 주소명에서 시도명 추출
        for city in CITY_NAMES:
            if locatadd_nm.startswith(city):
                return city
        
        return ""
    
    def _extract_city_name_from_code(self, region_code: str) -> str:
        """
        지역코드에서 시도명 추출
        
        Args:
            region_code: 지역코드 (10자리, 첫 2자리가 시도코드)
        
        Returns:
            시도명
        """
        if len(region_code) < 2:
            return ""
        
        sido_code = region_code[:2]
        # 시도코드 매핑
        sido_map = {
            "11": "서울특별시",
            "26": "부산광역시",
            "27": "대구광역시",
            "28": "인천광역시",
            "29": "광주광역시",
            "30": "대전광역시",
            "31": "울산광역시",
            "36": "세종특별자치시",
            "41": "경기도",
            "42": "강원특별자치도",
            "43": "충청북도",
            "44": "충청남도",
            "45": "전북특별자치도",
            "46": "전라남도",
            "47": "경상북도",
            "48": "경상남도",
            "50": "제주특별자치도"
        }
        return sido_map.get(sido_code, "")
    
    async def collect_all_regions(
        self,
        db: AsyncSession
    ) -> StateCollectionResponse:
        """
        모든 시도의 지역 데이터 수집 및 저장
        
        Args:
            db: 데이터베이스 세션
        
        Returns:
            수집 결과
        """
        total_fetched = 0
        total_saved = 0
        skipped = 0
        errors = []
        
        logger.info("=" * 60)
        logger.info("🚀 지역 데이터 수집 시작")
        logger.info(f"📋 대상 시도: {len(CITY_NAMES)}개")
        logger.info(f"📋 시도 목록: {', '.join(CITY_NAMES)}")
        logger.info("=" * 60)
        
        for idx, city_name in enumerate(CITY_NAMES, 1):
            logger.info(f"\n{'='*60}")
            logger.info(f"[{idx}/{len(CITY_NAMES)}] {city_name} 처리 시작 (현재까지 전체 수집: {total_fetched}개)")
            logger.info(f"{'='*60}")
            
            try:
                # API 호출
                page_no = 1
                has_more = True
                city_fetched = 0
                city_saved = 0
                city_skipped = 0
                city_total_original = 0  # 해당 시도의 전체 원본 데이터 수 (누적)
                num_of_rows = 700  # 페이지당 요청할 레코드 수
                
                logger.info(f"   🔍 {city_name} 데이터 수집 시작 (페이지당 {num_of_rows}개 요청, 모든 레벨 저장)")
                
                while has_more:
                    # API 데이터 가져오기
                    api_response = await self.fetch_region_data(
                        city_name=city_name,
                        page_no=page_no,
                        num_of_rows=num_of_rows
                    )
                    
                    # 데이터 파싱 (모든 레벨 수집)
                    regions, _, original_count = self.parse_region_data(api_response, city_name)
                    
                    # 원본 데이터가 없으면 종료 (API에서 데이터를 더 이상 반환하지 않음)
                    if original_count == 0:
                        logger.info(f"   ℹ️  페이지 {page_no}: 원본 데이터 없음 (종료)")
                        has_more = False
                        break
                    
                    city_total_original += original_count
                    city_fetched += len(regions)
                    total_fetched += len(regions)
                    
                    logger.info(f"   📄 페이지 {page_no}: 원본 {original_count}개 → 수집 {len(regions)}개 지역 (모든 레벨, 누적: {city_fetched}개)")
                    
                    # 데이터베이스에 저장 (중복만 제외)
                    for region_idx, region_data in enumerate(regions, 1):
                        try:
                            region_code = region_data.get('region_code', 'Unknown')
                            region_name = region_data.get('region_name', 'Unknown')
                            region_city = region_data.get('city_name', city_name)
                            
                            # 상세 로그: 어느 도의 어느 지역을 처리하는지
                            logger.info(f"   💾 [{city_name}] {region_city} {region_name} (코드: {region_code}) 저장 시도... ({region_idx}/{len(regions)}번째)")
                            
                            state_create = StateCreate(**region_data)
                            db_obj, is_created = await state_crud.create_or_skip(
                                db,
                                obj_in=state_create
                            )
                            
                            if is_created:
                                city_saved += 1
                                total_saved += 1
                                logger.info(f"      ✅ 저장 완료: {region_city} {region_name} (전체 저장: {total_saved}개)")
                            else:
                                city_skipped += 1
                                skipped += 1
                                logger.info(f"      ⏭️  건너뜀 (이미 존재): {region_city} {region_name} (전체 건너뜀: {skipped}개)")
                                
                        except Exception as e:
                            error_msg = f"{city_name} - {region_data.get('region_name', 'Unknown')}: {str(e)}"
                            errors.append(error_msg)
                            logger.warning(f"      ⚠️ 저장 실패: {error_msg}")
                    
                    # 다음 페이지 확인
                    if original_count < num_of_rows:
                        logger.info(f"   ✅ 마지막 페이지로 판단 (원본 {original_count}개 < 요청 {num_of_rows}개)")
                        has_more = False
                    else:
                        logger.info(f"   ⏭️  다음 페이지로... (원본 {original_count}개, 다음 페이지: {page_no + 1})")
                        page_no += 1
                    
                    # API 호출 제한 방지를 위한 딜레이
                    await asyncio.sleep(0.2)
                
                logger.info(f"✅ {city_name} 완료: 총 {page_no}페이지 처리, 원본 {city_total_original}개 → 수집 {city_fetched}개, 저장 {city_saved}개, 건너뜀 {city_skipped}개")
                logger.info(f"   📊 현재까지 전체 통계: 수집 {total_fetched}개, 저장 {total_saved}개, 건너뜀 {skipped}개")
                logger.info(f"   ➡️  다음 시도로 진행합니다...")
                
            except Exception as e:
                error_msg = f"{city_name} 처리 실패: {str(e)}"
                errors.append(error_msg)
                logger.error(f"❌ {error_msg}")
                logger.error(f"   ⚠️ {city_name} 처리 중 오류 발생, 다음 시도로 진행합니다...")
                import traceback
                logger.error(traceback.format_exc())
                # 예외가 발생해도 다음 시도로 계속 진행
                continue
        
        logger.info("=" * 60)
        logger.info("🎉 지역 데이터 수집 완료!")
        logger.info(f"📊 최종 통계:")
        logger.info(f"   - 처리한 시도: {len(CITY_NAMES)}개")
        logger.info(f"   - 가져옴: {total_fetched}개")
        logger.info(f"   - 저장: {total_saved}개")
        logger.info(f"   - 건너뜀: {skipped}개")
        if errors:
            logger.warning(f"⚠️ 오류 {len(errors)}개 발생:")
            for error in errors[:10]:  # 최대 10개만 출력
                logger.warning(f"   - {error}")
            if len(errors) > 10:
                logger.warning(f"   ... 외 {len(errors) - 10}개 오류")
        logger.info("=" * 60)
        
        return StateCollectionResponse(
            success=len(errors) == 0,
            total_fetched=total_fetched,
            total_saved=total_saved,
            skipped=skipped,
            errors=errors,
            message=f"수집 완료: {total_saved}개 저장, {skipped}개 건너뜀"
        )


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
        
        logger.info(f"   📡 API 호출: 페이지 {page_no}, {num_of_rows}개 요청")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(MOLIT_APARTMENT_LIST_API_URL, params=params)
            response.raise_for_status()
            data = response.json()
            
            # 첫 페이지일 때만 디버그 로그 출력
            if page_no == 1:
                logger.debug(f"   🔍 API 응답 구조: {data}")
            
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
            
            logger.info(f"✅ 파싱 완료: 원본 {original_count}개 → 수집 {len(apartments)}개 아파트 (전체 {total_count}개 중)")
            
            return apartments, total_count, original_count
            
        except Exception as e:
            logger.error(f"❌ 파싱 오류: {e}")
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
            logger.info("🏢 아파트 목록 수집 시작")
            logger.info("=" * 80)
            
            page_no = 1
            has_more = True
            num_of_rows = 1000  # 페이지당 요청할 레코드 수
            
            logger.info(f"🔍 아파트 데이터 수집 시작 (페이지당 {num_of_rows}개 요청)")
            
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
                    logger.info(f"   ℹ️  페이지 {page_no}: 원본 데이터 없음 (종료)")
                    has_more = False
                    break
                
                total_fetched += len(apartments)
                
                logger.info(f"   📄 페이지 {page_no}: 원본 {original_count}개 → 수집 {len(apartments)}개 아파트 (누적: {total_fetched}개)")
                
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
                            logger.warning(f"      ⚠️ {error_msg}")
                            continue
                        
                        # 상세 로그
                        logger.info(f"   💾 [{region.city_name} {region.region_name}] {apt_name} (단지코드: {kapt_code}) 저장 시도... ({apt_idx}/{len(apartments)}번째)")
                        
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
                            logger.info(f"      ✅ 저장 완료: {apt_name} (전체 저장: {total_saved}개)")
                        else:
                            skipped += 1
                            logger.info(f"      ⏭️  건너뜀 (이미 존재): {apt_name} (전체 건너뜀: {skipped}개)")
                            
                    except Exception as e:
                        error_msg = f"아파트 '{apt_data.get('apt_name', 'Unknown')}': {str(e)}"
                        errors.append(error_msg)
                        logger.warning(f"      ⚠️ 저장 실패: {error_msg}")
                
                # 다음 페이지 확인
                if original_count < num_of_rows:
                    logger.info(f"   ✅ 마지막 페이지로 판단 (원본 {original_count}개 < 요청 {num_of_rows}개)")
                    has_more = False
                else:
                    logger.info(f"   ⏭️  다음 페이지로... (원본 {original_count}개, 다음 페이지: {page_no + 1})")
                    page_no += 1
                
                # API 호출 제한 방지를 위한 딜레이
                await asyncio.sleep(0.2)
            
            logger.info("=" * 80)
            logger.info(f"✅ 아파트 목록 수집 완료")
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
            logger.error(f"❌ 아파트 목록 수집 실패: {e}", exc_info=True)
            return ApartmentCollectionResponse(
                success=False,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors + [str(e)],
                message=f"수집 실패: {str(e)}"
            )

    async def fetch_apartment_basic_info(self, kapt_code: str) -> Dict[str, Any]:
        """
        국토부 API에서 아파트 기본정보 가져오기
        
        Args:
            kapt_code: 국토부 단지코드
        
        Returns:
            API 응답 데이터 (dict)
        
        Raises:
            httpx.HTTPError: API 호출 실패 시
        """
        params = {
            "serviceKey": self.api_key,
            "kaptCode": kapt_code
        }
        
        logger.debug(f"기본정보 API 호출: {kapt_code}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(MOLIT_APARTMENT_BASIC_API_URL, params=params)
            response.raise_for_status()
            data = response.json()
            return data
    
    async def fetch_apartment_detail_info(self, kapt_code: str) -> Dict[str, Any]:
        """
        국토부 API에서 아파트 상세정보 가져오기
        
        Args:
            kapt_code: 국토부 단지코드
        
        Returns:
            API 응답 데이터 (dict)
        
        Raises:
            httpx.HTTPError: API 호출 실패 시
        """
        params = {
            "serviceKey": self.api_key,
            "kaptCode": kapt_code
        }
        
        logger.debug(f"상세정보 API 호출: {kapt_code}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(MOLIT_APARTMENT_DETAIL_API_URL, params=params)
            response.raise_for_status()
            data = response.json()
            return data
    
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
                logger.debug(f"기본정보 API 응답에 item이 없습니다.")
                return None
            
            # 상세정보 파싱
            detail_item = detail_info.get("response", {}).get("body", {}).get("item", {})
            if not detail_item:
                logger.debug(f"상세정보 API 응답에 item이 없습니다.")
                return None
            
            # 필수 필드 검증: 도로명 주소 또는 지번 주소
            doro_juso = basic_item.get("doroJuso", "").strip() if basic_item.get("doroJuso") else ""
            kapt_addr = basic_item.get("kaptAddr", "").strip() if basic_item.get("kaptAddr") else ""
            
            if not doro_juso and not kapt_addr:
                logger.debug("도로명 주소와 지번 주소가 모두 없습니다.")
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
            
            # 지하철 정보: 상세정보 우선
            subway_line = detail_item.get("subwayLine", "").strip() if detail_item.get("subwayLine") else None
            subway_station = detail_item.get("subwayStation", "").strip() if detail_item.get("subwayStation") else None
            subway_time = detail_item.get("kaptdWtimesub", "").strip() if detail_item.get("kaptdWtimesub") else None
            
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
    
    async def collect_apartment_details(
        self,
        db: AsyncSession,
        limit: Optional[int] = None
    ) -> ApartDetailCollectionResponse:
        """
        모든 아파트의 상세 정보 수집
        
        데이터베이스에 있는 모든 아파트에 대해 상세 정보를 수집합니다.
        100개씩 처리 후 커밋하는 방식으로 진행합니다.
        
        Args:
            db: 데이터베이스 세션
            limit: 처리할 아파트 수 제한 (None이면 전체)
        
        Returns:
            ApartDetailCollectionResponse: 수집 결과 통계
        """
        total_processed = 0
        total_saved = 0
        skipped = 0
        errors = []
        CONCURRENT_LIMIT = 20
        semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
        BATCH_SIZE = 50
        
        try:
            logger.info("🚀 [고성능 모드] 아파트 상세 정보 수집 시작")
            loop_limit = limit if limit else 1000000
            
            while total_processed < loop_limit:
                fetch_limit = min(BATCH_SIZE, loop_limit - total_processed)
                if fetch_limit <= 0: break
                
                targets = await apartment_crud.get_multi_missing_details(db, limit=fetch_limit)
                
                if not targets:
                    logger.info("✨ 더 이상 수집할 아파트가 없습니다.")
                    break
                
                tasks = [self._process_single_apartment(db, apt, semaphore) for apt in targets]
                results = await asyncio.gather(*tasks)
                
                valid_data_list = []
                for res in results:
                    if res["success"]: valid_data_list.append(res["data"])
                    else: errors.append(f"{res['apt_name']}: {res['error']}")
                
                if valid_data_list:
                    try:
                        for detail_data in valid_data_list:
                            db_obj = ApartDetail(**detail_data.model_dump())
                            db.add(db_obj)
                        await db.commit()
                        total_saved += len(valid_data_list)
                        
                        failed_count = len(results) - len(valid_data_list)
                        if failed_count > 0:
                            logger.info(f"   💾 배치 저장 완료: {len(valid_data_list)}개 (실패/누락: {failed_count}개)")
                        else:
                            logger.info(f"   💾 배치 저장 완료: {len(valid_data_list)}개 (전체 성공)")
                            
                    except Exception as commit_e:
                        await db.rollback()
                        logger.error(f"❌ 배치 커밋 실패: {commit_e}")
                        errors.append(f"배치 커밋 실패: {str(commit_e)}")
                
                total_processed += len(targets)
                await asyncio.sleep(1)

            logger.info("=" * 60)
            logger.info(f"🎉 수집 완료 (총 {total_saved}개 저장)")
            return ApartDetailCollectionResponse(
                success=True,
                total_processed=total_processed,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors[:100],
                message=f"고속 수집 완료: {total_saved}개 저장됨"
            )

        except Exception as e:
            logger.error(f"❌ 치명적 오류 발생: {e}", exc_info=True)
            return ApartDetailCollectionResponse(success=False, total_processed=total_processed, errors=[str(e)], message=f"오류: {str(e)}")

    # =========================================================================
    # 전월세 실거래가 수집 메서드
    # =========================================================================
    
    async def fetch_rent_data(
        self,
        lawd_cd: str,
        deal_ymd: str
    ) -> str:
        """
        국토교통부 API에서 아파트 전월세 실거래가 데이터 가져오기
        
        Args:
            lawd_cd: 지역코드 (법정동코드 앞 5자리)
            deal_ymd: 계약년월 (YYYYMM)
        
        Returns:
            XML 응답 문자열
        
        Raises:
            httpx.HTTPError: API 호출 실패 시
        
        Note:
            - API 인증키는 서버의 MOLIT_API_KEY 환경변수를 사용합니다.
            - 국토부 전월세 API는 XML 형식으로 응답합니다.
            - JSON 변환은 parse_rent_xml_to_json() 메서드에서 수행합니다.
        """
        
        params = {
            "serviceKey": self.api_key,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": deal_ymd
        }
        
        logger.info(f"📡 전월세 API 호출: 지역코드={lawd_cd}, 계약년월={deal_ymd}")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(MOLIT_RENT_API_URL, params=params)
            response.raise_for_status()
            
            # 응답이 XML이므로 텍스트로 반환
            return response.text
    
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
                logger.warning(f"⚠️ API 응답 오류: {result_code} - {result_msg}")
                return [], result_code, result_msg
            
            # items 추출
            items = body.get("items", {})
            if not items:
                logger.info("   ℹ️ 조회된 데이터가 없습니다.")
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
            
            logger.info(f"✅ XML → JSON 변환 완료: {len(cleaned_items)}개 거래 데이터")
            
            return cleaned_items, result_code, result_msg
            
        except Exception as e:
            logger.error(f"❌ XML 파싱 실패: {e}")
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
                logger.warning(f"   ⚠️ 거래일 정보 누락: {apt_nm}")
                return None
            
            try:
                deal_date_obj = date(
                    int(deal_year),
                    int(deal_month),
                    int(deal_day)
                )
            except (ValueError, TypeError) as e:
                logger.warning(f"   ⚠️ 거래일 변환 실패: {deal_year}-{deal_month}-{deal_day}, 오류: {e}")
                return None
            
            # 전용면적 파싱 (필수)
            exclu_use_ar_elem = item.find("excluUseAr")
            exclu_use_ar = exclu_use_ar_elem.text.strip() if exclu_use_ar_elem is not None and exclu_use_ar_elem.text else None
            
            if not exclu_use_ar:
                apt_nm_elem = item.find("aptNm")
                apt_nm = apt_nm_elem.text if apt_nm_elem is not None and apt_nm_elem.text else "Unknown"
                logger.warning(f"   ⚠️ 전용면적 정보 누락: {apt_nm}")
                return None
            
            try:
                exclusive_area = float(exclu_use_ar)
            except (ValueError, TypeError):
                logger.warning(f"   ⚠️ 전용면적 변환 실패: {exclu_use_ar}")
                return None
            
            # 층 파싱 (필수)
            floor_elem = item.find("floor")
            floor_str = floor_elem.text.strip() if floor_elem is not None and floor_elem.text else None
            
            if not floor_str:
                apt_nm_elem = item.find("aptNm")
                apt_nm = apt_nm_elem.text if apt_nm_elem is not None and apt_nm_elem.text else "Unknown"
                logger.warning(f"   ⚠️ 층 정보 누락: {apt_nm}")
                return None
            
            try:
                floor = int(floor_str)
            except (ValueError, TypeError):
                logger.warning(f"   ⚠️ 층 변환 실패: {floor_str}")
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
            if monthly_rent == 0:
                # 전세
                monthly_rent = None
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
                exclusive_area=exclusive_area,
                floor=floor,
                apt_seq=apt_seq,
                deal_date=deal_date_obj,
                contract_date=None,  # API에서 별도 제공하지 않음
                remarks=apt_name  # 아파트 이름 저장
            )
            
        except Exception as e:
            logger.error(f"   ❌ 거래 데이터 파싱 실패: {e}")
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
                logger.warning(f"   ⚠️ 거래일 정보 누락: {item.get('aptNm', 'Unknown')}")
                return None
            
            try:
                deal_date_obj = date(
                    int(deal_year),
                    int(deal_month),
                    int(deal_day)
                )
            except (ValueError, TypeError) as e:
                logger.warning(f"   ⚠️ 거래일 변환 실패: {deal_year}-{deal_month}-{deal_day}, 오류: {e}")
                return None
            
            # 전용면적 파싱 (필수)
            exclu_use_ar = item.get("excluUseAr")
            if not exclu_use_ar:
                logger.warning(f"   ⚠️ 전용면적 정보 누락: {item.get('aptNm', 'Unknown')}")
                return None
            
            try:
                exclusive_area = float(exclu_use_ar)
            except (ValueError, TypeError):
                logger.warning(f"   ⚠️ 전용면적 변환 실패: {exclu_use_ar}")
                return None
            
            # 층 파싱 (필수)
            floor_str = item.get("floor")
            if not floor_str:
                logger.warning(f"   ⚠️ 층 정보 누락: {item.get('aptNm', 'Unknown')}")
                return None
            
            try:
                floor = int(floor_str)
            except (ValueError, TypeError):
                logger.warning(f"   ⚠️ 층 변환 실패: {floor_str}")
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
                exclusive_area=exclusive_area,
                floor=floor,
                apt_seq=apt_seq,
                deal_date=deal_date_obj,
                contract_date=None  # API에서 별도 제공하지 않음
            )
            
        except Exception as e:
            logger.error(f"   ❌ 거래 데이터 파싱 실패: {e}")
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
            logger.error(f"   ❌ 아파트 검색 실패 ({apt_name}): {e}")
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
            logger.info(f"🏠 전월세 실거래가 수집 시작")
            logger.info(f"   📍 지역코드: {lawd_cd}")
            logger.info(f"   📅 계약년월: {deal_ymd}")
            logger.info("=" * 80)
            
            # 1단계: API 호출하여 XML 데이터 가져오기 (MOLIT_API_KEY 사용)
            try:
                xml_data = await self.fetch_rent_data(lawd_cd, deal_ymd)
            except httpx.HTTPError as e:
                error_msg = f"API 호출 실패: {str(e)}"
                logger.error(f"❌ {error_msg}")
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
            
            # 2단계: XML → JSON 변환
            items, result_code, result_msg = self.parse_rent_xml_to_json(xml_data)
            
            if result_code not in ["000", "00"]:
                error_msg = f"API 응답 오류: {result_code} - {result_msg}"
                logger.error(f"❌ {error_msg}")
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
            
            total_fetched = len(items)
            logger.info(f"📊 수집된 거래 데이터: {total_fetched}개")
            
            if total_fetched == 0:
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
                            logger.warning(f"   ⚠️ [{idx}/{total_fetched}] {error_msg}")
                            continue
                        
                        apt_id = apartment.apt_id
                        apt_cache[cache_key] = apt_id
                    
                    # 3-2: 거래 데이터 파싱
                    rent_create = self.parse_rent_item(item, apt_id)
                    
                    if not rent_create:
                        error_msg = f"데이터 파싱 실패: {apt_name}"
                        errors.append(error_msg)
                        logger.warning(f"   ⚠️ [{idx}/{total_fetched}] {error_msg}")
                        continue
                    
                    # 3-3: DB에 저장 (중복 체크)
                    db_obj, is_created = await rent_crud.create_or_skip(
                        db,
                        obj_in=rent_create
                    )
                    
                    if is_created:
                        total_saved += 1
                        if total_saved % 10 == 0 or total_saved == 1:
                            logger.info(f"   💾 [{idx}/{total_fetched}] {apt_name} 저장 완료 (현재까지: {total_saved}개)")
                    else:
                        skipped += 1
                        logger.debug(f"   ⏭️ [{idx}/{total_fetched}] {apt_name} 건너뜀 (중복)")
                    
                except Exception as e:
                    # savepoint 롤백
                    try:
                        await savepoint.rollback()
                    except Exception:
                        pass
                    
                    error_msg = f"처리 실패: {str(e)}"
                    errors.append(f"아파트 '{apt_name}' (ID: {apt_id}, 코드: {kapt_code}): {error_msg}")
                    total_processed += 1
                    logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                    import traceback
                    logger.debug(f"상세 스택: {traceback.format_exc()}")
            
            # 마지막 남은 데이터 커밋 (반드시 실행되어야 함)
            remaining_count = total_saved - last_commit_count
            if remaining_count > 0:
                try:
                    await db.commit()  # 최상위 트랜잭션 커밋 (실제 DB 반영)
                    last_commit_count = total_saved
                    logger.info(f"💾 최종 커밋 완료: 총 {total_saved}개 저장됨")
                except Exception as commit_error:
                    logger.error(f"❌ 최종 커밋 실패: {remaining_count}개 데이터 손실 가능 - {str(commit_error)}")
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                    errors.append(f"최종 커밋 실패 ({remaining_count}개 데이터 손실): {str(commit_error)}")
            
            logger.info(f"✅ 수집 완료: 처리 {total_processed}개 | 저장 {total_saved}개 | 건너뜀 {skipped}개")
            if errors:
                logger.warning(f"⚠️ 오류 {len(errors)}개 발생")
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
            logger.error(f"❌ 아파트 상세 정보 수집 실패: {e}", exc_info=True)
            # 예외 발생 시 남은 데이터 커밋 시도
            try:
                remaining_count = total_saved - last_commit_count
                if remaining_count > 0:
                    logger.warning(f"   ⚠️ 예외 발생 전 남은 {remaining_count}개 데이터 커밋 시도...")
                    try:
                        await db.commit()
                        logger.info(f"   ✅ 예외 발생 전 데이터 커밋 완료")
                    except Exception as commit_error:
                        logger.error(f"   ❌ 예외 발생 전 데이터 커밋 실패: {str(commit_error)}")
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
            if not DataCollectionService._csv_path_checked:
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
                    DataCollectionService._csv_path_checked = True
                    DataCollectionService._csv_path_cache = None
                    return None
                
                DataCollectionService._csv_path_cache = csv_path
                DataCollectionService._csv_path_checked = True
            
            # 캐시된 경로가 없으면 (파일이 없는 경우)
            if DataCollectionService._csv_path_cache is None:
                return None
            
            csv_path = DataCollectionService._csv_path_cache
            
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
    
    def generate_year_months(self, start_year: int, start_month: int) -> List[str]:
        """
        시작 년월부터 현재 년월까지의 모든 년월을 YYYYMM 형식의 문자열 리스트로 생성
        
        Args:
            start_year: 시작 연도 (예: 2020)
            start_month: 시작 월 (1-12, 예: 1)
        
        Returns:
            YYYYMM 형식의 년월 문자열 리스트 (예: ["202001", "202002", ..., "202412"])
        """
        year_months = []
        current_date = datetime.now()
        current_year = current_date.year
        current_month = current_date.month
        
        year = start_year
        month = start_month
        
        while year < current_year or (year == current_year and month <= current_month):
            year_month_str = f"{year}{month:02d}"
            year_months.append(year_month_str)
            
            if month == 12:
                year += 1
                month = 1
            else:
                month += 1
        
        return year_months
    
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
        CONCURRENT_LIMIT = 50  # 동시 처리 수: 50개
        semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
        BATCH_SIZE = 100  # 100개씩 배치로 처리
        api_calls_used = 0
        api_calls_lock = asyncio.Lock()  # API 호출 카운터 동기화용
        
        try:
            # REB_API_KEY 확인 및 여러 키 지원
            reb_api_keys = []
            
            # REB_API_KEYS가 있으면 우선 사용 (콤마로 구분)
            if settings.REB_API_KEYS:
                reb_api_keys = [key.strip() for key in settings.REB_API_KEYS.split(",") if key.strip()]
            
            # REB_API_KEYS가 없으면 REB_API_KEY 사용 (레거시 호환)
            if not reb_api_keys and settings.REB_API_KEY:
                reb_api_keys = [settings.REB_API_KEY]
            
            if not reb_api_keys:
                raise ValueError("REB_API_KEY 또는 REB_API_KEYS가 설정되지 않았습니다. .env 파일을 확인하세요.")
            
            # API 키별 호출 횟수 추적 (균등 분산을 위해)
            api_key_usage = {key: 0 for key in reb_api_keys}
            api_key_lock = asyncio.Lock()  # API 키 선택 동기화용
            
            logger.info("=" * 60)
            logger.info("🚀 [고성능 모드] 부동산 지수 데이터 수집 시작")
            logger.info(f"🔑 사용 가능한 API 키: {len(reb_api_keys)}개")
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
                    message="STATES 테이블에 데이터가 없습니다."
                )
            
            logger.info(f"📍 수집 대상: {len(states)}개 지역")
            logger.info(f"📅 수집 기간: {START_WRTTIME} ~ 현재")
            logger.info(f"📊 총 예상 API 호출: {len(states)}회 (각 지역당 1회)")
            logger.info(f"⚡ 동시 처리 수: {CONCURRENT_LIMIT}개, 배치 크기: {BATCH_SIZE}개")
            logger.info(f"🔑 API 키별 최대 호출: {max_api_calls_per_key}회, 전체 최대: {max_api_calls}회")
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
                            region_code_prefix = str(region_code)[:5] if len(str(region_code)) >= 5 else str(region_code)
                            area_code = self._get_area_code_from_csv(region_code_prefix)
                            
                            if not area_code:
                                return {
                                    "success": False,
                                    "error": f"area_code를 찾을 수 없습니다.",
                                    "region_code": region_code,
                                    "fetched": 0,
                                    "saved": 0,
                                    "skipped": 0
                                }
                            
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
                        logger.error(f"   ❌ 예외 발생: {error_msg}")
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
                                    f"   ⏭️ [{total_processed + idx + 1}/{len(states)}] {result['region_code']}: "
                                    f"사전 체크로 스킵 ({skip_reason})"
                                )
                            elif result.get("fetched", 0) > 0:
                                # 실제 API 호출하여 데이터 수집한 경우
                                logger.info(
                                    f"   ✅ [{total_processed + idx + 1}/{len(states)}] {result['region_code']}: "
                                    f"{result['fetched']}건 수집, {result['saved']}건 저장, {result['skipped']}건 건너뜀"
                                )
                        else:
                            error_msg = f"{result.get('region_code', 'Unknown')}: {result.get('error', '알 수 없는 오류')}"
                            errors.append(error_msg)
                            logger.warning(f"   ⚠️ [{total_processed + idx + 1}/{len(states)}] {error_msg}")
                
                total_processed += len(batch)
                
                # 배치 간 딜레이 (API 호출 제한 방지)
                if total_processed < len(states):
                    await asyncio.sleep(0.5)
            
            # 결과 출력
            logger.info("\n" + "=" * 80)
            logger.info("🎉 부동산 지수 데이터 수집 완료!")
            logger.info(f"   📊 총 수집: {total_fetched}건")
            logger.info(f"   💾 저장: {total_saved}건")
            logger.info(f"   ⏭️ 건너뜀: {skipped}건 (중복 데이터)")
            logger.info(f"   🚫 사전 체크 스킵: {pre_check_skipped}개 지역 (API 호출 없음)")
            logger.info(f"   🔄 API 호출: {api_calls_used}회 (사전 체크로 {pre_check_skipped}개 지역 절약)")
            logger.info(f"   🔑 API 키별 사용량:")
            for key_idx, (key, usage) in enumerate(api_key_usage.items(), 1):
                key_display = f"{key[:8]}..." if len(key) > 12 else key
                logger.info(f"      키 {key_idx}: {usage}회 / {max_api_calls_per_key}회 ({key_display})")
            logger.info(f"   ⚠️ 오류: {len(errors)}건")
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
            logger.error(f"❌ 전체 수집 실패: {e}", exc_info=True)
            return HouseScoreCollectionResponse(
                success=False,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors + [str(e)],
                message=f"전체 수집 실패: {str(e)}"
            )


    def _convert_sgg_code_to_db_format(self, sgg_cd: str) -> Optional[str]:
        """5자리 시군구 코드를 10자리 DB 형식으로 변환"""
        if not sgg_cd or len(sgg_cd) != 5:
            return None
        return f"{sgg_cd}00000"
    
    def _normalize_dong_name(self, dong_name: str) -> str:
        """동 이름 정규화 (숫자, 동, 가 제거)"""
        if not dong_name:
            return ""
        # 숫자 제거 (예: "사직1동" → "사직동")
        normalized = re.sub(r'\d+', '', dong_name)
        # "동", "가" 제거
        normalized = normalized.replace("동", "").replace("가", "").strip()
        return normalized
    
    def _clean_apt_name(self, name: str) -> str:
        """아파트 이름 정제 (괄호 및 내용 제거)"""
        if not name:
            return ""
        # 다양한 괄호 형태 제거: (), [], {}
        cleaned = re.sub(r'[\(\[\{][^\)\]\}]*[\)\]\}]', '', name)
        # 연속된 공백 제거
        cleaned = re.sub(r'\s+', ' ', cleaned)
        return cleaned.strip()
    
    def _normalize_apt_name(self, name: str) -> str:
        """아파트 이름 정규화 (대한민국 아파트 특성 고려)"""
        if not name:
            return ""
        
        # 공백 제거
        normalized = re.sub(r'\s+', '', name)
        
        # 차수/단지 표기 제거 (예: "1차", "2차", "1단지", "2단지", "13차" 등)
        # 숫자+차/단지 패턴 제거
        normalized = re.sub(r'\d+차', '', normalized)  # "1차", "2차", "13차" 등
        normalized = re.sub(r'\d+단지', '', normalized)  # "1단지", "2단지" 등
        
        # "아파트", "아파트명" 접미사 제거 (비교 시 무시)
        normalized = re.sub(r'아파트명?$', '', normalized)
        
        # 특수문자 제거 (한글, 영문, 숫자만 유지)
        normalized = re.sub(r'[^\w가-힣]', '', normalized)
        
        return normalized
    
    def _find_matching_regions(self, umd_nm: str, all_regions: Dict[int, Any]) -> set:
        """동 이름으로 매칭되는 지역 ID 찾기 (널널한 매칭)"""
        matching_region_ids = set()
        normalized_umd = self._normalize_dong_name(umd_nm)
        
        for region_id, region in all_regions.items():
            normalized_region = self._normalize_dong_name(region.region_name)
            
            # 정확한 매칭
            if normalized_region == normalized_umd:
                matching_region_ids.add(region_id)
            # 포함 관계 확인 (양방향)
            elif normalized_umd and normalized_region:
                if normalized_umd in normalized_region or normalized_region in normalized_umd:
                    matching_region_ids.add(region_id)
        
        return matching_region_ids
    
    def _match_apartment(
        self,
        apt_name_api: str,
        candidates: List[Apartment],
        sgg_cd: str,
        umd_nm: Optional[str] = None
    ) -> Optional[Apartment]:
        """
        아파트 매칭 (개선된 버전)
        
        지역과 법정동이 일치한다는 가정 하에 더 널널하게 매칭합니다.
        
        Args:
            apt_name_api: API에서 받은 아파트 이름
            candidates: 후보 아파트 리스트
            sgg_cd: 5자리 시군구 코드
            umd_nm: 동 이름 (선택)
        
        Returns:
            매칭된 Apartment 객체 또는 None
        """
        if not apt_name_api or not candidates:
            return None
        
        cleaned_api = self._clean_apt_name(apt_name_api)
        normalized_api = self._normalize_apt_name(cleaned_api)
        
        if not cleaned_api or not normalized_api:
            return None
        
        # 1단계: 정확한 매칭
        for apt in candidates:
            cleaned_db = self._clean_apt_name(apt.apt_name)
            normalized_db = self._normalize_apt_name(cleaned_db)
            
            if normalized_api == normalized_db:
                return apt
        
        # 2단계: 포함 관계 확인 (양방향, 최소 2자 이상으로 완화)
        for apt in candidates:
            cleaned_db = self._clean_apt_name(apt.apt_name)
            normalized_db = self._normalize_apt_name(cleaned_db)
            
            if len(normalized_api) >= 2 and len(normalized_db) >= 2:
                if normalized_api in normalized_db or normalized_db in normalized_api:
                    return apt
        
        # 3단계: 키워드 기반 매칭 (기준 완화)
        api_keywords = set(re.findall(r'[가-힣]+', normalized_api))
        if len(api_keywords) >= 1:  # 1개 이상으로 완화
            for apt in candidates:
                cleaned_db = self._clean_apt_name(apt.apt_name)
                normalized_db = self._normalize_apt_name(cleaned_db)
                db_keywords = set(re.findall(r'[가-힣]+', normalized_db))
                
                common_keywords = api_keywords & db_keywords
                if len(common_keywords) >= 1:  # 1개 이상으로 완화
                    common_ratio = len(common_keywords) / max(len(api_keywords), len(db_keywords))
                    if common_ratio >= 0.3:  # 30% 이상으로 완화
                        return apt
        
        return None

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
        
        # 3. 병렬 처리 (9개)
        semaphore = asyncio.Semaphore(9)
        
        async def process_sale_region(ym: str, sgg_cd: str):
            """매매 데이터 수집 작업"""
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
                            logger.info(f"⏭️ {sgg_cd}/{ym}: 건너뜀 ({existing_count}건 존재)")
                            return
                        
                        # max_items 제한 확인
                        if max_items and total_saved >= max_items:
                            return
                        
                        # API 호출 (XML)
                        params = {
                            "serviceKey": self.api_key,
                            "LAWD_CD": sgg_cd,
                            "DEAL_YMD": ym,
                            "numOfRows": 4000
                        }
                        
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            response = await client.get(MOLIT_SALE_API_URL, params=params)
                            response.raise_for_status()
                            xml_content = response.text
                        
                        # XML 파싱
                        try:
                            root = ET.fromstring(xml_content)
                        except ET.ParseError as e:
                            errors.append(f"{sgg_cd}/{ym}: XML 파싱 실패 - {str(e)}")
                            logger.error(f"❌ {sgg_cd}/{ym}: XML 파싱 실패 - {str(e)}")
                            return
                        
                        # 결과 코드 확인
                        result_code_elem = root.find(".//resultCode")
                        result_msg_elem = root.find(".//resultMsg")
                        result_code = result_code_elem.text if result_code_elem is not None else ""
                        result_msg = result_msg_elem.text if result_msg_elem is not None else ""
                        
                        if result_code != "000":
                            errors.append(f"{sgg_cd}/{ym}: {result_msg}")
                            logger.error(f"❌ {sgg_cd}/{ym}: {result_msg}")
                            return
                        
                        # items 추출
                        items = root.findall(".//item")
                        
                        if not items:
                            return
                        
                        total_fetched += len(items)
                        
                        # 아파트 로드
                        stmt = select(Apartment).options(joinedload(Apartment.region)).join(State).where(
                            State.region_code.like(f"{sgg_cd}%")
                        )
                        apt_result = await local_db.execute(stmt)
                        local_apts = apt_result.scalars().all()
                        
                        if not local_apts:
                            return
                        
                        # 동 정보 캐시
                        region_stmt = select(State).where(State.region_code.like(f"{sgg_cd}%"))
                        region_result = await local_db.execute(region_stmt)
                        all_regions = {r.region_id: r for r in region_result.scalars().all()}
                        
                        sales_to_save = []
                        success_count = 0
                        skip_count = 0
                        error_count = 0
                        apt_name_log = ""
                        
                        for item in items:
                            # max_items 제한 확인
                            if max_items and total_saved >= max_items:
                                break
                            
                            try:
                                # XML Element에서 필드 추출
                                apt_nm_elem = item.find("aptNm")
                                apt_nm = apt_nm_elem.text.strip() if apt_nm_elem is not None and apt_nm_elem.text else ""
                                
                                umd_nm_elem = item.find("umdNm")
                                umd_nm = umd_nm_elem.text.strip() if umd_nm_elem is not None and umd_nm_elem.text else ""
                                
                                sgg_cd_elem = item.find("sggCd")
                                sgg_cd_item = sgg_cd_elem.text.strip() if sgg_cd_elem is not None and sgg_cd_elem.text else sgg_cd
                                
                                if not apt_nm:
                                    continue
                                
                                if not apt_name_log:
                                    apt_name_log = apt_nm
                                
                                # 동 기반 필터링 (개선된 버전)
                                candidates = local_apts
                                sgg_code_matched = True
                                dong_matched = False
                                
                                # 시군구 코드 기반 필터링 (개선: 5자리 → 10자리 변환)
                                if sgg_cd_item and str(sgg_cd_item).strip():
                                    sgg_cd_item_str = str(sgg_cd_item).strip()
                                    sgg_cd_str = str(sgg_cd).strip()
                                    
                                    # DB 형식으로 변환 (5자리 → 10자리)
                                    sgg_cd_db = self._convert_sgg_code_to_db_format(sgg_cd_item_str)
                                    
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
                                
                                # 동 기반 필터링 (개선: 더 널널한 매칭)
                                if umd_nm and candidates:
                                    matching_region_ids = self._find_matching_regions(umd_nm, all_regions)
                                    
                                    if matching_region_ids:
                                        filtered = [
                                            apt for apt in candidates
                                            if apt.region_id in matching_region_ids
                                        ]
                                        if filtered:
                                            candidates = filtered
                                            dong_matched = True
                                    # 필터링 실패해도 후보 유지 (더 널널하게)
                                
                                # 후보가 없으면 원래 후보로 복원
                                if not candidates:
                                    candidates = local_apts
                                    sgg_code_matched = True
                                    dong_matched = False
                                
                                # 아파트 매칭
                                matched_apt = self._match_apartment(apt_nm, candidates, sgg_cd, umd_nm)
                                
                                # 필터링된 후보에서 실패 시 전체 후보로 재시도
                                if not matched_apt and len(candidates) < len(local_apts):
                                    matched_apt = self._match_apartment(apt_nm, local_apts, sgg_cd, umd_nm)
                                
                                if not matched_apt:
                                    error_count += 1
                                    continue
                                
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
                                
                            except Exception as e:
                                error_count += 1
                                continue
                        
                        if sales_to_save or (allow_duplicate and success_count > 0):
                            await local_db.commit()
                            if sales_to_save:
                                total_saved += len(sales_to_save)
                                success_count += len(sales_to_save)
                        
                        # 간결한 로그 (한 줄)
                        if success_count > 0 or skip_count > 0 or error_count > 0:
                            logger.info(
                                f"{sgg_cd}/{ym}: "
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
        for ym in target_months:
            if max_items and total_saved >= max_items:
                break
            
            tasks = [process_sale_region(ym, sgg_cd) for sgg_cd in target_sgg_codes]
            await asyncio.gather(*tasks, return_exceptions=True)
            
            if max_items and total_saved >= max_items:
                break
        
        logger.info(f"✅ 매매 수집 완료: 저장 {total_saved}건, 건너뜀 {skipped}건, 오류 {len(errors)}건")
        
        return SalesCollectionResponse(
            success=True,
            total_fetched=total_fetched,
            total_saved=total_saved,
            skipped=skipped,
            errors=errors,
            message=f"수집 완료: {total_saved}건 저장"
        )

    async def collect_rent_data(
        self,
        db: AsyncSession,
        start_ym: str,
        end_ym: str,
        max_items: Optional[int] = None,
        allow_duplicate: bool = False
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
        
        logger.info(f"🏠 전월세 수집 시작: {start_ym} ~ {end_ym}")
        
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
        
        # 2. 지역 코드 추출
        try:
            stmt = text("SELECT DISTINCT SUBSTR(region_code, 1, 5) FROM states WHERE length(region_code) >= 5")
            result = await db.execute(stmt)
            target_sgg_codes = [row[0] for row in result.fetchall() if row[0] and len(row[0]) == 5]
            logger.info(f"📍 {len(target_sgg_codes)}개 지역 코드 추출")
        except Exception as e:
            logger.error(f"❌ 지역 코드 추출 실패: {e}")
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
        
        # 3. 병렬 처리 (9개)
        semaphore = asyncio.Semaphore(9)
        
        async def process_rent_region(ym: str, sgg_cd: str):
            """전월세 데이터 수집 작업"""
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
                        
                        if existing_count > 0 and not allow_duplicate:
                            skipped += existing_count
                            logger.info(f"⏭️ {sgg_cd}/{ym}: 건너뜀 ({existing_count}건 존재)")
                            return
                        
                        # API 호출 (XML)
                        params = {
                            "serviceKey": self.api_key,
                            "LAWD_CD": sgg_cd,
                            "DEAL_YMD": ym,
                            "numOfRows": 4000
                        }
                        
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            response = await client.get(MOLIT_RENT_API_URL, params=params)
                            response.raise_for_status()
                            xml_content = response.text
                        
                        # XML 파싱
                        try:
                            root = ET.fromstring(xml_content)
                        except ET.ParseError as e:
                            errors.append(f"{sgg_cd}/{ym}: XML 파싱 실패 - {str(e)}")
                            logger.error(f"❌ {sgg_cd}/{ym}: XML 파싱 실패 - {str(e)}")
                            return
                        
                        # 결과 코드 확인
                        result_code_elem = root.find(".//resultCode")
                        result_msg_elem = root.find(".//resultMsg")
                        result_code = result_code_elem.text if result_code_elem is not None else ""
                        result_msg = result_msg_elem.text if result_msg_elem is not None else ""
                        
                        if result_code != "000":
                            errors.append(f"{sgg_cd}/{ym}: {result_msg}")
                            logger.error(f"❌ {sgg_cd}/{ym}: {result_msg}")
                            return
                        
                        # items 추출
                        items = root.findall(".//item")
                        
                        if not items:
                            return
                        
                        total_fetched += len(items)
                        
                        # 아파트 로드
                        stmt = select(Apartment).options(joinedload(Apartment.region)).join(State).where(
                            State.region_code.like(f"{sgg_cd}%")
                        )
                        apt_result = await local_db.execute(stmt)
                        local_apts = apt_result.scalars().all()
                        
                        if not local_apts:
                            return
                        
                        # 동 정보 캐시
                        region_stmt = select(State).where(State.region_code.like(f"{sgg_cd}%"))
                        region_result = await local_db.execute(region_stmt)
                        all_regions = {r.region_id: r for r in region_result.scalars().all()}
                        
                        rents_to_save = []
                        success_count = 0
                        skip_count = 0
                        error_count = 0
                        jeonse_count = 0
                        wolse_count = 0
                        apt_name_log = ""
                        
                        for item in items:
                            # max_items 제한 확인
                            if max_items and total_saved >= max_items:
                                break
                            
                            try:
                                # XML Element에서 필드 추출
                                apt_nm_elem = item.find("aptNm")
                                apt_nm = apt_nm_elem.text.strip() if apt_nm_elem is not None and apt_nm_elem.text else ""
                                
                                umd_nm_elem = item.find("umdNm")
                                umd_nm = umd_nm_elem.text.strip() if umd_nm_elem is not None and umd_nm_elem.text else ""
                                
                                sgg_cd_elem = item.find("sggCd")
                                sgg_cd_item = sgg_cd_elem.text.strip() if sgg_cd_elem is not None and sgg_cd_elem.text else sgg_cd
                                
                                if not apt_nm:
                                    continue
                                
                                if not apt_name_log:
                                    apt_name_log = apt_nm
                                
                                # 동 기반 필터링 (개선된 버전)
                                candidates = local_apts
                                sgg_code_matched = True
                                dong_matched = False
                                
                                # 시군구 코드 기반 필터링 (개선: 5자리 → 10자리 변환)
                                if sgg_cd_item and str(sgg_cd_item).strip():
                                    sgg_cd_item_str = str(sgg_cd_item).strip()
                                    sgg_cd_str = str(sgg_cd).strip()
                                    
                                    # DB 형식으로 변환 (5자리 → 10자리)
                                    sgg_cd_db = self._convert_sgg_code_to_db_format(sgg_cd_item_str)
                                    
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
                                
                                # 동 기반 필터링 (개선: 더 널널한 매칭)
                                if umd_nm and candidates:
                                    matching_region_ids = self._find_matching_regions(umd_nm, all_regions)
                                    
                                    if matching_region_ids:
                                        filtered = [
                                            apt for apt in candidates
                                            if apt.region_id in matching_region_ids
                                        ]
                                        if filtered:
                                            candidates = filtered
                                            dong_matched = True
                                    # 필터링 실패해도 후보 유지 (더 널널하게)
                                
                                # 후보가 없으면 원래 후보로 복원
                                if not candidates:
                                    candidates = local_apts
                                    sgg_code_matched = True
                                    dong_matched = False
                                
                                # 아파트 매칭
                                matched_apt = self._match_apartment(apt_nm, candidates, sgg_cd, umd_nm)
                                
                                # 필터링된 후보에서 실패 시 전체 후보로 재시도
                                if not matched_apt and len(candidates) < len(local_apts):
                                    matched_apt = self._match_apartment(apt_nm, local_apts, sgg_cd, umd_nm)
                                
                                if not matched_apt:
                                    error_count += 1
                                    continue
                                
                                # 거래 데이터 파싱 (XML Element에서 추출)
                                rent_create = self.parse_rent_item_from_xml(item, matched_apt.apt_id, apt_nm)
                                
                                if not rent_create:
                                    error_count += 1
                                    continue
                                
                                # 전세/월세 구분 카운트 (monthly_rent가 0이면 전세, 0이 아니면 월세)
                                if rent_create.monthly_rent and rent_create.monthly_rent > 0:
                                    wolse_count += 1
                                else:
                                    jeonse_count += 1
                                
                                # 중복 체크 및 저장
                                try:
                                    if allow_duplicate:
                                        _, is_created = await rent_crud.create_or_update(local_db, obj_in=rent_create)
                                    else:
                                        _, is_created = await rent_crud.create_or_skip(local_db, obj_in=rent_create)
                                    
                                    if is_created:
                                        success_count += 1
                                        total_saved += 1
                                        rents_to_save.append(rent_create)
                                    else:
                                        skip_count += 1
                                except Exception as e:
                                    error_count += 1
                                    continue
                                
                                # 아파트 상태 업데이트
                                if matched_apt.is_available != "1":
                                    matched_apt.is_available = "1"
                                    local_db.add(matched_apt)
                                
                            except Exception as e:
                                error_count += 1
                                continue
                        
                        if rents_to_save:
                            await local_db.commit()
                        
                        # 간결한 로그 (한 줄)
                        if success_count > 0 or skip_count > 0 or error_count > 0:
                            logger.info(
                                f"{sgg_cd}/{ym}: "
                                f"✅{success_count} ⏭️{skip_count} ❌{error_count} "
                                f"(전세:{jeonse_count} 월세:{wolse_count}) ({apt_name_log})"
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
        for ym in target_months:
            if max_items and total_saved >= max_items:
                break
            
            tasks = [process_rent_region(ym, sgg_cd) for sgg_cd in target_sgg_codes]
            await asyncio.gather(*tasks, return_exceptions=True)
            
            if max_items and total_saved >= max_items:
                break
        
        logger.info(f"✅ 전월세 수집 완료: 저장 {total_saved}건, 건너뜀 {skipped}건, 오류 {len(errors)}건")
        
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

# 서비스 인스턴스 생성
data_collection_service = DataCollectionService()
