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
from difflib import SequenceMatcher
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import quote
import httpx
from datetime import datetime, date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, text
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import OperationalError, TimeoutError
from asyncpg.exceptions import TooManyConnectionsError, ConnectionDoesNotExistError
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
    
    # HTTP 클라이언트 풀 (재사용으로 속도 향상)
    _http_client: Optional[httpx.AsyncClient] = None
    
    def __init__(self):
        """서비스 초기화"""
        if not settings.MOLIT_API_KEY:
            raise ValueError("MOLIT_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
        self.api_key = settings.MOLIT_API_KEY
    
    def _get_http_client(self) -> httpx.AsyncClient:
        """HTTP 클라이언트 풀 반환 (재사용으로 속도 향상)"""
        if self._http_client is None:
            # 연결 풀 설정으로 재사용 최적화
            limits = httpx.Limits(max_keepalive_connections=50, max_connections=100)
            try:
                self._http_client = httpx.AsyncClient(
                    timeout=httpx.Timeout(15.0, connect=5.0),  # 타임아웃 최적화 (30초 -> 15초)
                    limits=limits,
                    http2=False  # HTTP/2는 일부 서버에서 문제 발생 가능하므로 비활성화
                )
            except Exception as e:
                # HTTP/2 초기화 실패 시 HTTP/1.1로 폴백
                logger.warning(f"HTTP/2 초기화 실패, HTTP/1.1로 폴백: {e}")
                self._http_client = httpx.AsyncClient(
                    timeout=httpx.Timeout(15.0, connect=5.0),
                    limits=limits
                )
        return self._http_client
    
    async def _close_http_client(self):
        """HTTP 클라이언트 종료"""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
    
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
                    logger.warning(f" [API Error] {e} ({url})")
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
        
        logger.info(f" API 호출: {city_name} (페이지 {page_no}, 요청: {num_of_rows}개)")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(MOLIT_REGION_API_URL, params=params)
            response.raise_for_status()
            data = response.json()
            
            # API 응답 구조 확인용 로깅 (첫 페이지만)
            if page_no == 1:
                logger.debug(f"    API 응답 구조 확인: {list(data.keys()) if isinstance(data, dict) else '리스트'}")
            
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
                logger.warning(" API 응답 구조가 예상과 다릅니다")
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
            
            logger.info(f" 파싱 완료: 원본 {original_count}개 → 수집 {len(regions)}개 지역 (모든 레벨 저장, 전체 {total_count}개 중)")
            return regions, total_count, original_count
            
        except Exception as e:
            logger.error(f" 데이터 파싱 실패: {e}")
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
        logger.info(" 지역 데이터 수집 시작")
        logger.info(f" 대상 시도: {len(CITY_NAMES)}개")
        logger.info(f" 시도 목록: {', '.join(CITY_NAMES)}")
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
                
                logger.info(f"    {city_name} 데이터 수집 시작 (페이지당 {num_of_rows}개 요청, 모든 레벨 저장)")
                
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
                        logger.info(f"   ℹ  페이지 {page_no}: 원본 데이터 없음 (종료)")
                        has_more = False
                        break
                    
                    city_total_original += original_count
                    city_fetched += len(regions)
                    total_fetched += len(regions)
                    
                    logger.info(f"    페이지 {page_no}: 원본 {original_count}개 → 수집 {len(regions)}개 지역 (모든 레벨, 누적: {city_fetched}개)")
                    
                    # 데이터베이스에 저장 (중복만 제외)
                    for region_idx, region_data in enumerate(regions, 1):
                        try:
                            region_code = region_data.get('region_code', 'Unknown')
                            region_name = region_data.get('region_name', 'Unknown')
                            region_city = region_data.get('city_name', city_name)
                            
                            # 상세 로그: 어느 도의 어느 지역을 처리하는지
                            logger.info(f"    [{city_name}] {region_city} {region_name} (코드: {region_code}) 저장 시도... ({region_idx}/{len(regions)}번째)")
                            
                            state_create = StateCreate(**region_data)
                            db_obj, is_created = await state_crud.create_or_skip(
                                db,
                                obj_in=state_create
                            )
                            
                            if is_created:
                                city_saved += 1
                                total_saved += 1
                                logger.info(f"       저장 완료: {region_city} {region_name} (전체 저장: {total_saved}개)")
                            else:
                                city_skipped += 1
                                skipped += 1
                                logger.info(f"      ⏭  건너뜀 (이미 존재): {region_city} {region_name} (전체 건너뜀: {skipped}개)")
                                
                        except Exception as e:
                            error_msg = f"{city_name} - {region_data.get('region_name', 'Unknown')}: {str(e)}"
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
                
                logger.info(f" {city_name} 완료: 총 {page_no}페이지 처리, 원본 {city_total_original}개 → 수집 {city_fetched}개, 저장 {city_saved}개, 건너뜀 {city_skipped}개")
                logger.info(f"    현재까지 전체 통계: 수집 {total_fetched}개, 저장 {total_saved}개, 건너뜀 {skipped}개")
                logger.info(f"     다음 시도로 진행합니다...")
                
            except Exception as e:
                error_msg = f"{city_name} 처리 실패: {str(e)}"
                errors.append(error_msg)
                logger.error(f" {error_msg}")
                logger.error(f"    {city_name} 처리 중 오류 발생, 다음 시도로 진행합니다...")
                import traceback
                logger.error(traceback.format_exc())
                # 예외가 발생해도 다음 시도로 계속 진행
                continue
        
        logger.info("=" * 60)
        logger.info(" 지역 데이터 수집 완료!")
        logger.info(f" 최종 통계:")
        logger.info(f"   - 처리한 시도: {len(CITY_NAMES)}개")
        logger.info(f"   - 가져옴: {total_fetched}개")
        logger.info(f"   - 저장: {total_saved}개")
        logger.info(f"   - 건너뜀: {skipped}개")
        if errors:
            logger.warning(f" 오류 {len(errors)}개 발생:")
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
                    logger.warning(f" Rate Limit (429) 발생, {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                
                response.raise_for_status()
                logger.info(f" 외부 API 호출 성공: 기본정보 API (kapt_code: {kapt_code})")
                data = response.json()
                return data
                
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < retries - 1:
                    wait_time = (attempt + 1) * 2
                    logger.warning(f" Rate Limit (429) 발생, {wait_time}초 대기 후 재시도...")
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
                    logger.warning(f" Rate Limit (429) 발생, {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                
                response.raise_for_status()
                logger.info(f" 외부 API 호출 성공: 상세정보 API (kapt_code: {kapt_code})")
                data = response.json()
                return data
                
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < retries - 1:
                    wait_time = (attempt + 1) * 2
                    logger.warning(f" Rate Limit (429) 발생, {wait_time}초 대기 후 재시도...")
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
                logger.warning(f" 파싱 실패: 기본정보 API 응답에 item이 없습니다. (apt_id: {apt_id})")
                logger.debug(f"기본정보 응답 구조: {basic_info}")
                return None
            
            # 상세정보 파싱
            detail_item = detail_info.get("response", {}).get("body", {}).get("item", {})
            if not detail_item:
                logger.warning(f" 파싱 실패: 상세정보 API 응답에 item이 없습니다. (apt_id: {apt_id})")
                logger.debug(f"상세정보 응답 구조: {detail_info}")
                return None
            
            # 필수 필드 검증: 도로명 주소 또는 지번 주소
            doro_juso = basic_item.get("doroJuso", "").strip() if basic_item.get("doroJuso") else ""
            kapt_addr = basic_item.get("kaptAddr", "").strip() if basic_item.get("kaptAddr") else ""
            
            if not doro_juso and not kapt_addr:
                logger.warning(f" 파싱 실패: 도로명 주소와 지번 주소가 모두 없습니다. (apt_id: {apt_id})")
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
                    logger.info(f" 외부 API 호출 시작: {apt.apt_name} (kapt_code: {apt.kapt_code})")
                    # 429 에러 방지를 위해 순차적으로 호출 (각 호출 사이에 작은 딜레이)
                    basic_info = await self.fetch_apartment_basic_info(apt.kapt_code)
                    await asyncio.sleep(0.1)  # API 호출 간 작은 딜레이
                    detail_info = await self.fetch_apartment_detail_info(apt.kapt_code)
                    
                    # 예외 처리
                    if isinstance(basic_info, Exception):
                        error_msg = f"기본정보 API 오류: {str(basic_info)}"
                        logger.debug(f" {apt.apt_name}: {error_msg}")
                        return {
                            "success": False,
                            "apt_name": apt.apt_name,
                            "saved": False,
                            "skipped": False,
                            "error": error_msg
                        }
                    
                    if isinstance(detail_info, Exception):
                        error_msg = f"상세정보 API 오류: {str(detail_info)}"
                        logger.debug(f" {apt.apt_name}: {error_msg}")
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
                    logger.info(f" 파싱 시작: {apt.apt_name} (apt_id: {apt.apt_id}, kapt_code: {apt.kapt_code})")
                    detail_create = self.parse_apartment_details(basic_info, detail_info, apt.apt_id)
                    
                    if not detail_create:
                        logger.warning(f" 파싱 실패: {apt.apt_name} (kapt_code: {apt.kapt_code}) - 필수 필드 누락")
                        return {
                            "success": False,
                            "apt_name": apt.apt_name,
                            "saved": False,
                            "skipped": False,
                            "error": "파싱 실패: 필수 필드 누락"
                        }
                    
                    logger.info(f" 파싱 성공: {apt.apt_name} (apt_id: {apt.apt_id})")
                    
                    # 4. 저장 (매매/전월세와 동일한 방식)
                    logger.info(f" 저장 시도: {apt.apt_name} (apt_id: {apt.apt_id})")
                    try:
                        # apt_detail_id를 명시적으로 제거하여 자동 생성되도록 함
                        detail_dict = detail_create.model_dump()
                        # apt_detail_id가 있으면 제거 (자동 생성되어야 함)
                        if 'apt_detail_id' in detail_dict:
                            logger.warning(f" apt_detail_id가 스키마에 포함되어 있음: {detail_dict.get('apt_detail_id')} - 제거함")
                            detail_dict.pop('apt_detail_id')
                        
                        # SQLAlchemy가 자동으로 시퀀스를 사용하도록 함
                        db_obj = ApartDetail(**detail_dict)
                        # apt_detail_id를 명시적으로 None으로 설정 (시퀀스 사용 강제)
                        db_obj.apt_detail_id = None
                        local_db.add(db_obj)
                        await local_db.commit()
                        await local_db.refresh(db_obj)  # 생성된 apt_detail_id 가져오기
                        logger.info(f" 저장 성공: {apt.apt_name} (apt_id: {apt.apt_id}, apt_detail_id: {db_obj.apt_detail_id}, kapt_code: {apt.kapt_code})")
                        
                        return {
                            "success": True,
                            "apt_name": apt.apt_name,
                            "saved": True,
                            "skipped": False,
                            "error": None
                        }
                    except Exception as save_error:
                        await local_db.rollback()
                        logger.error(f" 저장 중 예외 발생: {apt.apt_name} (apt_id: {apt.apt_id}) - {save_error}")
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
                                logger.info(f"⏭ 중복으로 건너뜀: {apt.apt_name} (apt_id: {apt.apt_id}, apt_detail_id: {existing.apt_detail_id}) - 이미 존재함")
                            else:
                                # apt_detail_id 중복 에러인 경우 시퀀스 문제로 판단
                                if 'apt_detail_id' in str(e) or 'apart_details_pkey' in str(e):
                                    logger.error(
                                        f" 시퀀스 동기화 문제 감지: {apt.apt_name} (apt_id: {apt.apt_id}). "
                                        f"apart_details 테이블의 apt_detail_id 시퀀스가 실제 데이터와 동기화되지 않았습니다. "
                                        f"다음 SQL을 실행하세요: "
                                        f"SELECT setval('apart_details_apt_detail_id_seq', COALESCE((SELECT MAX(apt_detail_id) FROM apart_details), 0) + 1, false);"
                                    )
                                else:
                                    logger.warning(
                                        f" 중복 에러 발생했지만 실제로는 존재하지 않음: {apt.apt_name} (apt_id: {apt.apt_id}). "
                                        f"에러: {str(e)}"
                                    )
                            
                            return {
                                "success": True,
                                "apt_name": apt.apt_name,
                                "saved": False,
                                "skipped": True,
                                "error": None
                            }
                    
                    logger.error(f" 아파트 상세 정보 수집 실패 ({apt.apt_name}): {e}", exc_info=True)
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
            logger.info(" [초고속 모드] 아파트 상세 정보 수집 시작")
            logger.info(f"   설정: 병렬 {CONCURRENT_LIMIT}개, 배치 {BATCH_SIZE}개")
            logger.info("   최적화: 사전 중복 체크 + HTTP 풀 재사용 + Rate Limit 처리")
            loop_limit = limit if limit else 1000000
            
            while total_processed < loop_limit:
                fetch_limit = min(BATCH_SIZE, loop_limit - total_processed)
                if fetch_limit <= 0: break
                
                # 아파트 목록 조회 (메인 세션 사용)
                targets = await apartment_crud.get_multi_missing_details(db, limit=fetch_limit)
                
                if not targets:
                    logger.info(" 더 이상 수집할 아파트가 없습니다.")
                    break
                
                logger.info(f"    1차 필터링: get_multi_missing_details 반환 {len(targets)}개")
                
                #  최적화 1: 사전 중복 체크로 불필요한 API 호출 제거
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
                
                #  중요: 1차 필터링 결과와 2차 체크 결과가 다르면 경고
                if pre_skipped > 0:
                    logger.warning(
                        f"     중복 발견: 1차 필터링에서 {len(targets)}개 반환했지만, "
                        f"2차 체크에서 {pre_skipped}개가 이미 존재함. "
                        f"get_multi_missing_details 쿼리에 문제가 있을 수 있습니다!"
                    )
                
                if not targets_to_process:
                    logger.info(f"   ⏭  배치 전체 건너뜀 ({pre_skipped}개 이미 존재) - API 호출 없음 ")
                    total_processed += len(targets)
                    continue
                
                logger.info(
                    f"    배치: 전체 {len(targets)}개 중 {pre_skipped}개 건너뜀, "
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
                        logger.info(f"   ⏸  배치 간 {delay_time}초 대기 중... (Rate Limit 방지)")
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
                    logger.warning(f"    에러 샘플 (총 {batch_errors}개 중): {error_samples[:3]}")
                
                total_processed += len(targets)
                
                # 로그 출력
                if batch_saved > 0 or batch_skipped > 0 or batch_errors > 0:
                    logger.info(
                        f"    배치 처리 완료: 저장 {batch_saved}개, "
                        f"건너뜀 {batch_skipped}개, 실패 {batch_errors}개 "
                        f"(사전 건너뜀 {pre_skipped}개 포함, 누적: 저장 {total_saved}개, 건너뜀 {skipped}개)"
                    )

            # HTTP 클라이언트 종료
            await self._close_http_client()
            
            logger.info("=" * 60)
            logger.info(f" 수집 완료 (총 {total_saved}개 저장, {skipped}개 건너뜀, {len(errors)}개 오류)")
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
            logger.error(f" 치명적 오류 발생: {e}", exc_info=True)
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
        
        logger.info(f" 전월세 API 호출: 지역코드={lawd_cd}, 계약년월={deal_ymd}")
        
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
            
            # 1단계: API 호출하여 XML 데이터 가져오기 (MOLIT_API_KEY 사용)
            try:
                xml_data = await self.fetch_rent_data(lawd_cd, deal_ymd)
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
            
            # 2단계: XML → JSON 변환
            items, result_code, result_msg = self.parse_rent_xml_to_json(xml_data)
            
            if result_code not in ["000", "00"]:
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
            
            total_fetched = len(items)
            logger.info(f" 수집된 거래 데이터: {total_fetched}개")
            
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
                    logger.error(f" CSV 파일을 찾을 수 없습니다: {csv_path}")
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
            logger.error(f" CSV 파일 읽기 오류: {e}")
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
            
            # STATES 테이블에서 모든 region_code 조회
            from app.models.state import State
            result = await db.execute(
                select(State.region_id, State.region_code)
                .where(State.is_deleted == False)
            )
            states = result.fetchall()
            
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
    
    # 한국 대표 아파트 브랜드명 사전 (정규화된 형태로 저장, 긴 것 우선)
    APARTMENT_BRANDS = [
        # 복합 브랜드명 (먼저 매칭)
        '롯데캐슬파크타운', '롯데캐슬골드타운', '롯데캐슬', 
        '현대힐스테이트', '힐스테이트',
        '이편한세상', 'e편한세상', '편한세상',
        '한라비발디', '비발디',
        '호반써밋', '써밋',
        '우미린',
        '래미안', '라미안',
        '푸르지오',
        '더샵', 'the샵',
        '아이파크',
        '자이', 'xi',
        '위브',
        'sk뷰', '에스케이뷰',
        '꿈에그린', '포레나',
        '베스트빌', '어울림',
        '로얄듀크',
        '스윗닷홈', '예가',
        '센트레빌',
        '아크로',
        '사랑으로',
        's클래스', '중흥',
        '수자인', '나빌래', '스타클래스', '노빌리티', '스카이뷰',
        # 건설사 브랜드
        '현대', '삼성', '대림', '대우', '동아', '극동', '벽산', '금호', '동부',
        '신동아', '신성', '주공', '한신', '태영', '진흥', '동일', '건영',
        '우방', '한양', '성원', '경남', '동문', '풍림', '신안', '선경',
        '효성', '코오롱', '대방', '동성', '일신', '청구', '삼익', '진로',
        '부영', '쌍용', '캐슬', '린',
    ]
    
    # 마을/단지 접미사 패턴
    VILLAGE_SUFFIXES = ['마을', '단지', '타운', '빌리지', '파크', '시티', '힐스', '뷰']
    
    # 영문 브랜드명 → 한글 변환 사전
    BRAND_ENG_TO_KOR = {
        'hillstate': '힐스테이트',
        'raemian': '래미안',
        'xi': '자이',
        'the#': '더샵',
        'thesharp': '더샵',
        'ipark': '아이파크',
        'prugio': '푸르지오',
        'skview': 'sk뷰',
        'acro': '아크로',
        'centreville': '센트레빌',
        'lottecatle': '롯데캐슬',
        'lottecastle': '롯데캐슬',
        'vivaldi': '비발디',
        'weave': '위브',
        'forena': '포레나',
        'e편한세상': '이편한세상',
        'summit': '써밋',
        'bestville': '베스트빌',
        'royalduke': '로얄듀크',
        'nobless': '노블레스',
        'parkview': '파크뷰',
        'lakeview': '레이크뷰',
        'greenville': '그린빌',
        'skyview': '스카이뷰',
    }
    
    def _extract_danji_number(self, name: str) -> Optional[int]:
        """
        단지 번호 추출 (예: '4단지' → 4, '9단지' → 9, '101동' → 101)
        
        다양한 패턴 지원:
        - "4단지", "9단지" → 4, 9
        - "제4단지", "제9단지" → 4, 9
        - "101동", "102동" → 101, 102 (주의: 층수와 구분 필요)
        - "1차", "2차" → 1, 2
        - "Ⅰ", "Ⅱ" → 1, 2
        """
        if not name:
            return None
        
        # 정규화 (공백, 특수문자 제거)
        normalized = re.sub(r'\s+', '', name)
        
        # 로마숫자를 아라비아 숫자로 변환
        roman_map = {'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5', 
                     'ⅵ': '6', 'ⅶ': '7', 'ⅷ': '8', 'ⅸ': '9', 'ⅹ': '10',
                     'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
                     'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10'}
        for roman, arabic in roman_map.items():
            normalized = normalized.replace(roman, arabic)
        
        # 단지 번호 추출 패턴들 (우선순위순)
        patterns = [
            r'제?(\d+)단지',      # "4단지", "제4단지"
            r'(\d+)차',           # "1차", "2차" (차수)
            r'제(\d+)차',         # "제1차"
            r'(\d{3,})동',        # "101동", "102동" (3자리 이상, 층수 구분)
        ]
        
        for pattern in patterns:
            match = re.search(pattern, normalized)
            if match:
                num = int(match.group(1))
                # 동 번호는 보통 100 이상 (101동, 102동 등)
                if '동' in pattern and num < 100:
                    continue
                return num
        
        return None
    
    def _extract_cha_number(self, name: str) -> Optional[int]:
        """
        차수 추출 (예: '1차' → 1, 'Ⅱ' → 2)
        
        다양한 패턴 지원:
        - "1차", "2차" → 1, 2
        - "제1차", "제2차" → 1, 2
        - "Ⅰ", "Ⅱ" → 1, 2 (로마숫자)
        - 끝에 붙은 숫자 (1~20 사이만 차수로 간주)
        """
        if not name:
            return None
        
        normalized = re.sub(r'\s+', '', name)
        
        # 로마숫자를 아라비아 숫자로 변환
        roman_map = {'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5', 
                     'ⅵ': '6', 'ⅶ': '7', 'ⅷ': '8', 'ⅸ': '9', 'ⅹ': '10',
                     'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
                     'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10',
                     'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
                     'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'}
        # 소문자 로마숫자도 처리
        normalized_lower = normalized.lower()
        for roman, arabic in roman_map.items():
            normalized_lower = normalized_lower.replace(roman, arabic)
        
        # 차수 추출 패턴들
        patterns = [
            (normalized, r'제?(\d+)차'),      # "1차", "제1차"
            (normalized_lower, r'(\d+)차'),   # 소문자 로마숫자 변환 후
        ]
        
        for text, pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return int(match.group(1))
        
        # 끝에 붙은 숫자 (1~20 사이만 차수로 간주, 그 이상은 동 번호일 가능성)
        match = re.search(r'(\d+)$', normalized)
        if match:
            num = int(match.group(1))
            if 1 <= num <= 20:
                return num
        
        return None
    
    def _extract_village_name(self, name: str) -> Optional[str]:
        """마을/단지명 추출 (예: '한빛마을4단지' → '한빛')"""
        if not name:
            return None
        
        normalized = re.sub(r'\s+', '', name).lower()
        
        # 마을명 추출 패턴들
        for suffix in ['마을', '단지']:
            pattern = rf'([가-힣]+){suffix}'
            match = re.search(pattern, normalized)
            if match:
                village = match.group(1)
                # 숫자 제거 (예: "한빛9" → "한빛")
                village = re.sub(r'\d+', '', village)
                if len(village) >= 2:
                    return village
        
        return None
    
    def _extract_all_brands(self, name: str) -> List[str]:
        """아파트 이름에서 모든 브랜드명 추출 (복수 가능)"""
        if not name:
            return []
        
        normalized = re.sub(r'\s+', '', name).lower()
        
        # 로마숫자 변환
        roman_map = {'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5', 
                     'ⅵ': '6', 'ⅶ': '7', 'ⅷ': '8', 'ⅸ': '9', 'ⅹ': '10',
                     'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
                     'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10'}
        for roman, arabic in roman_map.items():
            normalized = normalized.replace(roman, arabic)
        
        # e편한세상 통일
        normalized = normalized.replace('e편한세상', '이편한세상')
        
        found_brands = []
        for brand in self.APARTMENT_BRANDS:
            brand_lower = brand.lower()
            if brand_lower in normalized:
                found_brands.append(brand_lower)
        
        # 중복 제거 및 긴 브랜드 우선 (예: '롯데캐슬파크타운'이 있으면 '롯데캐슬' 제거)
        final_brands = []
        for brand in found_brands:
            is_subset = False
            for other in found_brands:
                if brand != other and brand in other:
                    is_subset = True
                    break
            if not is_subset:
                final_brands.append(brand)
        
        return final_brands
    
    def _clean_apt_name(self, name: str) -> str:
        """
        아파트 이름 정제 (괄호 및 부가 정보 제거, 특수문자 처리)
        
        처리 내용:
        - 입주자대표회의, 관리사무소 등 부가 정보 제거
        - 괄호 및 내용 제거: (), [], {}
        - 특수문자 정리: &, /, ·, ~ 등
        """
        if not name:
            return ""
        
        # 입주자대표회의, 관리사무소 등 부가 정보 제거
        cleaned = re.sub(r'입주자대표회의', '', name, flags=re.IGNORECASE)
        cleaned = re.sub(r'관리사무소', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'제\d+관리사무소', '', cleaned)
        
        # 다양한 괄호 형태 제거: (), [], {}, 〈〉, 《》
        cleaned = re.sub(r'[\(\[\{〈《][^\)\]\}〉》]*[\)\]\}〉》]', '', cleaned)
        
        # & 기호를 공백으로 변환
        cleaned = cleaned.replace('&', ' ')
        
        # / 기호를 공백으로 변환 (예: "힐스테이트/파크" → "힐스테이트 파크")
        cleaned = cleaned.replace('/', ' ')
        
        # 중간점(·) 제거
        cleaned = cleaned.replace('·', ' ')
        
        # 물결표(~) 제거
        cleaned = cleaned.replace('~', '')
        
        # 동 번호 제거 (예: "101동", "102동", "A동", "B동")
        cleaned = re.sub(r'\d{2,3}동\s*$', '', cleaned)
        cleaned = re.sub(r'[A-Za-z]동\s*$', '', cleaned)
        cleaned = re.sub(r'\d{2,3}동(?=\s|$)', '', cleaned)
        
        # 구식 명칭 제거 (끝에 붙은 경우만)
        old_suffixes = ['맨션', '빌라', '아파트', 'APT', 'apt', '주택', '연립', '타운하우스']
        for suffix in old_suffixes:
            if cleaned.lower().endswith(suffix.lower()):
                cleaned = cleaned[:-len(suffix)]
                break
        
        # 연속된 공백 제거
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        return cleaned.strip()
    
    def _normalize_apt_name(self, name: str) -> str:
        """
        아파트 이름 정규화 (대한민국 아파트 특성 고려, 영문↔한글 브랜드명 통일)
        
        정규화 규칙:
        - 공백 제거
        - 영문 소문자 변환
        - 로마숫자 → 아라비아 숫자
        - 영문 브랜드명 → 한글 통일
        - 일반적인 오타 패턴 정규화
        - 특수문자 제거
        """
        if not name:
            return ""
        
        # 공백 제거
        normalized = re.sub(r'\s+', '', name)
        
        # 영문 대소문자 통일 (소문자로 변환)
        normalized = normalized.lower()
        
        # 로마숫자를 아라비아 숫자로 변환
        roman_map = {'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5', 
                     'ⅵ': '6', 'ⅶ': '7', 'ⅷ': '8', 'ⅸ': '9', 'ⅹ': '10',
                     'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
                     'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10'}
        for roman, arabic in roman_map.items():
            normalized = normalized.replace(roman, arabic)
        
        # 영문 브랜드명 → 한글로 통일 (긴 것부터 먼저 치환)
        sorted_brands = sorted(self.BRAND_ENG_TO_KOR.items(), key=lambda x: len(x[0]), reverse=True)
        for eng, kor in sorted_brands:
            normalized = normalized.replace(eng, kor)
        
        # 일반적인 오타 패턴 정규화 (한글)
        typo_map = {
            '힐스테잇': '힐스테이트',
            '테잇': '테이트',
            '케슬': '캐슬',
            '써밋': '서밋',
            '써미트': '서밋',
            '레미안': '래미안',  # 실제로는 래미안이 맞지만, 레미안으로 쓰는 경우가 많음
            '푸르지오': '푸르지오',  # 실제 브랜드명
            '푸르지움': '푸르지오',
            '자이': '자이',  # 실제 브랜드명
            '쟈이': '자이',
            '쉐르빌': '셰르빌',
            '쉐르빌': '쉐르빌',
        }
        for typo, correct in typo_map.items():
            normalized = normalized.replace(typo, correct)
        
        # 하이픈/대시 제거
        normalized = re.sub(r'[-–—]', '', normalized)
        
        # 아포스트로피 제거
        normalized = re.sub(r"[''`]", '', normalized)
        
        # 특수문자 제거 (한글, 영문, 숫자만 유지)
        normalized = re.sub(r'[^\w가-힣]', '', normalized)
        
        return normalized
    
    def _normalize_apt_name_strict(self, name: str) -> str:
        """
        아파트 이름 엄격 정규화 (차수/단지 번호 제거, 다양한 접미사 처리)
        
        처리 내용:
        - 차수/단지 번호 제거
        - 다양한 아파트 접미사 제거: 아파트, APT, 빌라, 빌, 타운, 하우스 등
        """
        if not name:
            return ""
        
        normalized = self._normalize_apt_name(name)
        
        # 차수/단지 표기 제거
        normalized = re.sub(r'제?\d+차', '', normalized)
        normalized = re.sub(r'제?\d+단지', '', normalized)
        normalized = re.sub(r'\d{3,}동', '', normalized)  # 101동, 102동 등
        
        # 끝에 붙은 숫자 제거 (예: "삼성1" → "삼성", 단 1~2자리만)
        normalized = re.sub(r'\d{1,2}$', '', normalized)
        
        # 다양한 아파트 접미사 제거 (대소문자 무관)
        suffixes = [
            'apartment', 'apt', 'apts',
            '아파트', '아파아트',  # 오타 포함
            '빌라', '빌', '빌리지',
            '타운', 'town',
            '하우스', 'house',
            '맨션', 'mansion',
            '캐슬', 'castle',
            '빌딩', 'building',
            '오피스텔', 'officetel',
        ]
        
        for suffix in suffixes:
            # 끝에 있는 경우만 제거
            if normalized.endswith(suffix):
                normalized = normalized[:-len(suffix)]
        
        return normalized
    
    def _extract_brand_and_name(self, name: str) -> Tuple[Optional[str], str]:
        """아파트 이름에서 브랜드명과 나머지 부분 추출"""
        if not name:
            return None, ""
        
        normalized = self._normalize_apt_name(name)
        
        # 브랜드명 찾기 (긴 것부터 매칭)
        sorted_brands = sorted(self.APARTMENT_BRANDS, key=len, reverse=True)
        for brand in sorted_brands:
            brand_lower = brand.lower()
            if brand_lower in normalized:
                # 브랜드명 제거한 나머지 반환
                remaining = normalized.replace(brand_lower, '', 1)
                return brand, remaining
        
        return None, normalized
    
    def _calculate_similarity(self, str1: str, str2: str) -> float:
        """두 문자열 간의 유사도 계산 (0.0 ~ 1.0)"""
        if not str1 or not str2:
            return 0.0
        return SequenceMatcher(None, str1, str2).ratio()
    
    def _extract_core_name(self, name: str) -> str:
        """핵심 이름 추출 (지역명, 마을명 등 제거)"""
        if not name:
            return ""
        
        normalized = self._normalize_apt_name_strict(name)
        
        # 마을/단지 접미사와 그 앞의 지역명 제거 시도
        for suffix in self.VILLAGE_SUFFIXES:
            if suffix in normalized:
                # suffix 이후 부분만 추출 (브랜드명이 보통 뒤에 옴)
                idx = normalized.find(suffix)
                after_suffix = normalized[idx + len(suffix):]
                if len(after_suffix) >= 2:
                    return after_suffix
        
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
        umd_nm: Optional[str] = None,
        jibun: Optional[str] = None,
        build_year: Optional[str] = None,
        apt_details: Optional[Dict[int, ApartDetail]] = None,
        normalized_cache: Optional[Dict[str, Any]] = None
    ) -> Optional[Apartment]:
        """
        아파트 매칭 (한국 아파트 특성에 최적화된 강화 버전)

        지역과 법정동이 일치한다는 가정 하에 다단계 매칭을 수행합니다.

        핵심 매칭 전략:
        1. 정규화된 이름 정확 매칭
        2. 브랜드명 + 단지번호 복합 매칭 (가장 중요!)
        3. 브랜드명 + 마을명 복합 매칭
        4. 지번 기반 매칭 (NEW!)
        5. 건축년도 기반 매칭 (NEW!)
        6. 유사도 기반 매칭 (SequenceMatcher)
        7. 키워드 기반 매칭

        예시:
        - "한빛마을4단지롯데캐슬Ⅱ" ↔ "롯데캐슬 파크타운 Ⅱ" (브랜드+단지번호 무시, 같은 동)
        - "한빛9단지 롯데캐슬파크타운" ↔ "한빛마을9단지롯데캐슬1차" (브랜드+단지번호)

        Args:
            apt_name_api: API에서 받은 아파트 이름
            candidates: 후보 아파트 리스트
            sgg_cd: 5자리 시군구 코드
            umd_nm: 동 이름 (선택)
            jibun: API 지번 (선택)
            build_year: API 건축년도 (선택)
            apt_details: 아파트 상세 정보 딕셔너리 (선택)
            normalized_cache: 정규화 결과 캐시 (성능 최적화)

        Returns:
            매칭된 Apartment 객체 또는 None
        """
        if not apt_name_api or not candidates:
            return None
        
        # 정규화 결과 캐싱 (성능 최적화)
        if normalized_cache is None:
            normalized_cache = {}
        
        # API 이름 분석 (캐싱)
        cache_key_api = f"api:{apt_name_api}"
        if cache_key_api not in normalized_cache:
            cleaned_api = self._clean_apt_name(apt_name_api)
            normalized_api = self._normalize_apt_name(cleaned_api)
            normalized_strict_api = self._normalize_apt_name_strict(cleaned_api)
            brands_api = self._extract_all_brands(apt_name_api)
            danji_api = self._extract_danji_number(apt_name_api)
            cha_api = self._extract_cha_number(apt_name_api)
            village_api = self._extract_village_name(apt_name_api)
            core_api = self._extract_core_name(cleaned_api)
            normalized_cache[cache_key_api] = {
                'cleaned': cleaned_api,
                'normalized': normalized_api,
                'strict': normalized_strict_api,
                'brands': brands_api,
                'danji': danji_api,
                'cha': cha_api,
                'village': village_api,
                'core': core_api
            }
        api_cache = normalized_cache[cache_key_api]
        
        if not api_cache['cleaned'] or not api_cache['normalized']:
            return None
        
        # 후보 아파트 정규화 및 점수 계산
        best_match = None
        best_score = 0.0
        
        for apt in candidates:
            cache_key_db = f"db:{apt.apt_name}"
            if cache_key_db not in normalized_cache:
                cleaned_db = self._clean_apt_name(apt.apt_name)
                normalized_db = self._normalize_apt_name(cleaned_db)
                normalized_strict_db = self._normalize_apt_name_strict(cleaned_db)
                brands_db = self._extract_all_brands(apt.apt_name)
                danji_db = self._extract_danji_number(apt.apt_name)
                cha_db = self._extract_cha_number(apt.apt_name)
                village_db = self._extract_village_name(apt.apt_name)
                core_db = self._extract_core_name(cleaned_db)
                normalized_cache[cache_key_db] = {
                    'cleaned': cleaned_db,
                    'normalized': normalized_db,
                    'strict': normalized_strict_db,
                    'brands': brands_db,
                    'danji': danji_db,
                    'cha': cha_db,
                    'village': village_db,
                    'core': core_db
                }
            db_cache = normalized_cache[cache_key_db]
            
            score = 0.0
            
            # === 1단계: 정규화된 이름 정확 매칭 (최고 점수) ===
            if api_cache['normalized'] == db_cache['normalized']:
                return apt  # 정확 매칭은 바로 반환
            
            # === 2단계: 엄격 정규화 후 정확 매칭 ===
            if api_cache['strict'] == db_cache['strict']:
                return apt  # 차수/단지 제거 후 정확 매칭
            
            # === 3단계: 브랜드명 + 단지번호 복합 매칭 (핵심!) ===
            # 같은 브랜드가 있는지 확인
            common_brands = set(api_cache['brands']) & set(db_cache['brands'])
            has_common_brand = len(common_brands) > 0
            
            # 단지번호 일치 확인
            danji_match = (api_cache['danji'] is not None and 
                          db_cache['danji'] is not None and 
                          api_cache['danji'] == db_cache['danji'])
            
            # 마을명 일치 확인
            village_match = False
            if api_cache['village'] and db_cache['village']:
                v_api = api_cache['village'].lower()
                v_db = db_cache['village'].lower()
                village_match = (v_api == v_db or v_api in v_db or v_db in v_api)
            
            # 브랜드 + 단지번호 일치 → 매우 높은 점수 (거의 확실히 같은 아파트)
            if has_common_brand and danji_match:
                score = max(score, 0.95)
            
            # 브랜드 + 마을명 일치 → 높은 점수
            if has_common_brand and village_match:
                score = max(score, 0.90)
            
            # 단지번호 + 마을명 일치 → 높은 점수 (브랜드 없어도)
            if danji_match and village_match:
                score = max(score, 0.88)
            
            # 브랜드만 일치 (같은 동에 해당 브랜드 아파트가 하나뿐일 가능성)
            if has_common_brand and len(candidates) <= 3:
                score = max(score, 0.75)
            elif has_common_brand:
                score = max(score, 0.60)
            
            # 단지번호만 일치 (같은 동에 해당 단지가 하나뿐일 가능성)
            if danji_match and len(candidates) <= 3:
                score = max(score, 0.70)
            
            # === 3.5단계: 지번 기반 매칭 (NEW!) ===
            jibun_match = False
            if jibun and apt_details and apt.apt_id in apt_details:
                detail = apt_details[apt.apt_id]
                if detail.jibun_address:
                    # 지번 정규화 (공백, 특수문자 제거)
                    norm_jibun_api = re.sub(r'[\s\-]+', '', jibun)
                    norm_jibun_db = re.sub(r'[\s\-]+', '', detail.jibun_address)
                    
                    # 지번 주소에서 번지 부분만 추출 (예: "101-2", "101")
                    jibun_api_parts = norm_jibun_api.split(',')[0] if ',' in norm_jibun_api else norm_jibun_api
                    
                    # 지번 포함 확인
                    if jibun_api_parts in norm_jibun_db or norm_jibun_api in norm_jibun_db:
                        jibun_match = True
                        # 지번 일치 시 점수 대폭 상승 (매우 신뢰도 높음)
                        if score >= 0.5:  # 어느 정도 이름도 유사한 경우
                            score = max(score, 0.98)
                        else:  # 이름은 안 비슷하지만 지번이 같은 경우
                            score = max(score, 0.85)
            
            # === 3.6단계: 건축년도 기반 검증 (NEW!) ===
            build_year_match = False
            if build_year and apt_details and apt.apt_id in apt_details:
                detail = apt_details[apt.apt_id]
                # use_approval_date에서 년도 추출 (YYYY-MM-DD 형식)
                if detail.use_approval_date:
                    try:
                        approval_year = detail.use_approval_date.split('-')[0]
                        # 건축년도 일치 확인 (±1년 허용)
                        if abs(int(build_year) - int(approval_year)) <= 1:
                            build_year_match = True
                            # 건축년도 일치 시 점수 보정 (신뢰도 증가)
                            if score >= 0.5:
                                score = max(score, score * 1.05)  # 5% 보너스
                    except (ValueError, AttributeError):
                        pass
            
            # 지번 + 건축년도 모두 일치 시 최고 점수
            if jibun_match and build_year_match:
                score = max(score, 0.99)
            
            # === 4단계: 포함 관계 확인 (양방향) ===
            norm_api = api_cache['normalized']
            norm_db = db_cache['normalized']
            if len(norm_api) >= 4 and len(norm_db) >= 4:
                if norm_api in norm_db:
                    ratio = len(norm_api) / len(norm_db)
                    score = max(score, 0.70 + ratio * 0.2)
                elif norm_db in norm_api:
                    ratio = len(norm_db) / len(norm_api)
                    score = max(score, 0.70 + ratio * 0.2)
            
            # === 5단계: 유사도 기반 매칭 ===
            similarity = self._calculate_similarity(norm_api, norm_db)
            if similarity >= 0.85:
                score = max(score, similarity)
            elif similarity >= 0.70:
                score = max(score, similarity * 0.95)
            elif similarity >= 0.60:
                score = max(score, similarity * 0.90)
            
            # === 6단계: 엄격 정규화 유사도 ===
            strict_similarity = self._calculate_similarity(
                api_cache['strict'], 
                db_cache['strict']
            )
            if strict_similarity >= 0.75:
                score = max(score, strict_similarity * 0.90)
            elif strict_similarity >= 0.60:
                score = max(score, strict_similarity * 0.85)
            
            # === 7단계: 핵심 이름 매칭 ===
            if api_cache['core'] and db_cache['core']:
                core_similarity = self._calculate_similarity(
                    api_cache['core'], 
                    db_cache['core']
                )
                if core_similarity >= 0.80:
                    score = max(score, core_similarity * 0.85)
            
            # === 8단계: 한글 키워드 기반 매칭 ===
            api_keywords = set(re.findall(r'[가-힣]{2,}', norm_api))
            db_keywords = set(re.findall(r'[가-힣]{2,}', norm_db))
            
            if api_keywords and db_keywords:
                # 정확한 키워드 매칭
                common_keywords = api_keywords & db_keywords
                
                # 부분 키워드 매칭 (포함 관계)
                partial_matches = 0
                for api_kw in api_keywords:
                    for db_kw in db_keywords:
                        if api_kw != db_kw and len(api_kw) >= 2 and len(db_kw) >= 2:
                            if api_kw in db_kw or db_kw in api_kw:
                                partial_matches += 1
                                break
                
                total_matches = len(common_keywords) + partial_matches * 0.7
                total_keywords = max(len(api_keywords), len(db_keywords))
                
                if total_keywords > 0:
                    keyword_ratio = total_matches / total_keywords
                    if keyword_ratio >= 0.6:
                        score = max(score, 0.65 + keyword_ratio * 0.25)
                    elif keyword_ratio >= 0.4:
                        score = max(score, 0.55 + keyword_ratio * 0.20)
            
            # === 9단계: 브랜드 + 유사도 복합 점수 ===
            if has_common_brand and similarity >= 0.50:
                combined_score = 0.60 + similarity * 0.35
                score = max(score, combined_score)
            
            # === 10단계: 후보가 적을 때 더 관대한 매칭 ===
            # 시군구 코드와 동으로 이미 필터링되었으므로 매우 관대하게 매칭
            if len(candidates) == 1:
                # 후보가 하나뿐이면 거의 무조건 매칭 (같은 동에 아파트 1개)
                score = max(score, 0.50)
            elif len(candidates) <= 3:
                # 후보가 3개 이하면 매우 관대하게
                if similarity >= 0.20 or strict_similarity >= 0.20 or has_common_brand:
                    score = max(score, 0.40)
            elif len(candidates) <= 5:
                # 후보가 5개 이하면 관대하게
                if similarity >= 0.25 or strict_similarity >= 0.25 or has_common_brand:
                    score = max(score, 0.35)
            elif len(candidates) <= 10:
                # 후보가 10개 이하면 약간 관대하게
                if similarity >= 0.30 or strict_similarity >= 0.30:
                    score = max(score, 0.32)
            
            # 최고 점수 업데이트
            if score > best_score:
                best_score = score
                best_match = apt
        
        # 시군구 코드와 동으로 이미 필터링되었으므로 임계값 대폭 낮춤
        # 후보 수에 따라 동적 임계값 적용
        threshold = 0.30  # 기본 임계값
        if len(candidates) == 1:
            threshold = 0.05  # 후보 1개면 거의 무조건 매칭
        elif len(candidates) == 2:
            threshold = 0.10  # 후보 2개
        elif len(candidates) <= 3:
            threshold = 0.15  # 후보 3개 이하
        elif len(candidates) <= 5:
            threshold = 0.20  # 후보 5개 이하
        elif len(candidates) <= 10:
            threshold = 0.25  # 후보 10개 이하
        
        # 짧은 이름 (2~3글자)은 임계값 추가 낮춤
        cleaned_name = self._clean_apt_name(apt_name_api)
        if len(cleaned_name) <= 3:
            threshold = min(threshold, 0.10)
        elif len(cleaned_name) <= 4:
            threshold = min(threshold, 0.15)
        
        if best_score >= threshold:
            return best_match
        
        return None
    
    def _match_apartment_with_debug(
        self,
        apt_name_api: str,
        candidates: List[Apartment],
        sgg_cd: str,
        umd_nm: Optional[str] = None,
        jibun: Optional[str] = None,
        build_year: Optional[str] = None,
        apt_details: Optional[Dict[int, ApartDetail]] = None,
        normalized_cache: Optional[Dict[str, Any]] = None
    ) -> Tuple[Optional[Apartment], Dict[str, Any]]:
        """
        _match_apartment의 디버그 버전 (매칭 실패 시 상세 정보 반환)
        
        Returns:
            (매칭된 Apartment 객체 또는 None, 디버그 정보 딕셔너리)
        """
        debug_info = {
            'debug_msg': '',
            'best_score': 0.0,
            'threshold': 0.0,
            'candidate_count': len(candidates),
            'has_apt_details': bool(apt_details and len(apt_details) > 0)
        }
        
        matched_apt = self._match_apartment(
            apt_name_api, candidates, sgg_cd, umd_nm,
            jibun, build_year, apt_details, normalized_cache
        )
        
        if matched_apt:
            debug_info['debug_msg'] = '매칭 성공'
            return matched_apt, debug_info
        
        # 매칭 실패 시 상세 정보 수집
        if not apt_name_api or not candidates:
            debug_info['debug_msg'] = f'입력 부족 (이름:{"있음" if apt_name_api else "없음"}, 후보:{len(candidates) if candidates else 0})'
            return None, debug_info
        
        # 후보들의 점수를 계산하여 최고 점수 확인
        if normalized_cache is None:
            normalized_cache = {}
        
        cache_key_api = f"api:{apt_name_api}"
        if cache_key_api not in normalized_cache:
            cleaned_api = self._clean_apt_name(apt_name_api)
            normalized_api = self._normalize_apt_name(cleaned_api)
            normalized_strict_api = self._normalize_apt_name_strict(cleaned_api)
            brands_api = self._extract_all_brands(apt_name_api)
            danji_api = self._extract_danji_number(apt_name_api)
            cha_api = self._extract_cha_number(apt_name_api)
            village_api = self._extract_village_name(apt_name_api)
            core_api = self._extract_core_name(cleaned_api)
            normalized_cache[cache_key_api] = {
                'cleaned': cleaned_api,
                'normalized': normalized_api,
                'strict': normalized_strict_api,
                'brands': brands_api,
                'danji': danji_api,
                'cha': cha_api,
                'village': village_api,
                'core': core_api
            }
        api_cache = normalized_cache[cache_key_api]
        
        best_score = 0.0
        threshold = 0.30
        if len(candidates) == 1:
            threshold = 0.05
        elif len(candidates) == 2:
            threshold = 0.10
        elif len(candidates) <= 3:
            threshold = 0.15
        elif len(candidates) <= 5:
            threshold = 0.20
        elif len(candidates) <= 10:
            threshold = 0.25
        
        # 짧은 이름 (2~3글자)은 임계값 추가 낮춤
        cleaned_name = self._clean_apt_name(apt_name_api)
        if len(cleaned_name) <= 3:
            threshold = min(threshold, 0.10)
        elif len(cleaned_name) <= 4:
            threshold = min(threshold, 0.15)
        
        # 모든 후보의 점수 계산 후 상위 3개 선택 (점수순 정렬)
        all_scores = []
        for apt in candidates:
            cache_key_db = f"db:{apt.apt_name}"
            if cache_key_db not in normalized_cache:
                cleaned_db = self._clean_apt_name(apt.apt_name)
                normalized_db = self._normalize_apt_name(cleaned_db)
                normalized_cache[cache_key_db] = {
                    'cleaned': cleaned_db,
                    'normalized': normalized_db
                }
            db_cache = normalized_cache[cache_key_db]
            
            similarity = self._calculate_similarity(api_cache['normalized'], db_cache['normalized'])
            all_scores.append((apt.apt_name[:15], similarity))
            best_score = max(best_score, similarity)
        
        # 점수순 정렬 후 상위 3개 선택
        all_scores.sort(key=lambda x: x[1], reverse=True)
        top_scores = all_scores[:3]
        
        debug_info['best_score'] = best_score
        debug_info['threshold'] = threshold
        top_scores_str = ', '.join([f"{name}:{score:.2f}" for name, score in top_scores])
        debug_info['debug_msg'] = f"최고점수:{best_score:.2f}(임계값:{threshold:.2f}) 상위후보:[{top_scores_str}]"
        
        return None, debug_info

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
        failure_samples = []  # 실패 샘플 수집
        
        logger.info(f" 매매 수집 시작: {start_ym} ~ {end_ym}")
        
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
            logger.info(f" {len(target_sgg_codes)}개 지역 코드 추출")
        except Exception as e:
            logger.error(f" 지역 코드 추출 실패: {e}")
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
        
        # 3. 병렬 처리 (연결 풀 크기에 맞춰 10개로 제한, DB 연결 풀 고려)
        # DB 연결 풀: pool_size=20, max_overflow=30 (최대 50개)
        # 세마포어를 10개로 제한하여 연결 풀 여유 확보
        semaphore = asyncio.Semaphore(10)
        
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
            limits=httpx.Limits(max_connections=30, max_keepalive_connections=20)
        )
        
        async def process_sale_region(ym: str, sgg_cd: str, region_idx: int = 0, total_regions: int = 0):
            """매매 데이터 수집 작업"""
            ym_formatted = format_ym(ym)
            region_progress_str = f"[{region_idx}/{total_regions}]" if total_regions > 0 else ""
            
            # 지역 순회 시작 로그
            if total_regions > 0:
                logger.info(f"    {region_progress_str} {sgg_cd}/{ym} ({ym_formatted}) 처리 시작...")
            
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
                            logger.info(f"⏭ {sgg_cd}/{ym} ({ym_formatted}): 건너뜀 ({existing_count}건 존재)")
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
                        
                        sales_to_save = []
                        success_count = 0
                        skip_count = 0
                        error_count = 0
                        apt_name_log = ""
                        first_failure_details = None  # 첫 번째 실패 상세 정보 저장
                        normalized_cache: Dict[str, Any] = {}  # 정규화 결과 캐싱
                        batch_size = 100  # 배치 커밋 크기
                        
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
                                
                                # 지번 추출 (매칭에 활용)
                                jibun_elem = item.find("jibun")
                                jibun = jibun_elem.text.strip() if jibun_elem is not None and jibun_elem.text else ""
                                
                                # 건축년도 추출 (매칭에 활용)
                                build_year_elem = item.find("buildYear")
                                build_year_for_match = build_year_elem.text.strip() if build_year_elem is not None and build_year_elem.text else ""
                                
                                if not apt_nm:
                                    continue
                                
                                if not apt_name_log:
                                    apt_name_log = apt_nm
                                
                                # 동 기반 필터링 (개선된 버전)
                                candidates = local_apts
                                sgg_code_matched = True
                                dong_matched = False
                                initial_candidate_count = len(local_apts)
                                
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
                                
                                filtered_candidate_count = len(candidates)
                                
                                # 아파트 매칭 (정규화 캐시, 지번, 건축년도, 상세정보 전달)
                                matched_apt, match_debug_info = self._match_apartment_with_debug(
                                    apt_nm, candidates, sgg_cd, umd_nm, 
                                    jibun, build_year_for_match, apt_details, normalized_cache
                                )
                                
                                # 필터링된 후보에서 실패 시 전체 후보로 재시도
                                if not matched_apt and len(candidates) < len(local_apts):
                                    logger.debug(f"    [매매] 필터링 후보({filtered_candidate_count}개)에서 실패 → 전체 후보({initial_candidate_count}개)로 재시도: {apt_nm}")
                                    matched_apt, match_debug_info = self._match_apartment_with_debug(
                                        apt_nm, local_apts, sgg_cd, umd_nm, 
                                        jibun, build_year_for_match, apt_details, normalized_cache
                                    )
                                
                                if not matched_apt:
                                    error_count += 1
                                    # 상세 실패 로깅 (WARNING 레벨로 변경하여 항상 출력)
                                    debug_msg = ''
                                    if match_debug_info:
                                        debug_msg = match_debug_info.get('debug_msg', '')
                                    else:
                                        debug_msg = '디버그정보 없음'
                                    
                                    failure_detail = (
                                        f"아파트:{apt_nm} | 지번:{jibun or '없음'} | 건축년도:{build_year_for_match or '없음'} | "
                                        f"동:{umd_nm or '없음'} | 시군구코드:{sgg_cd_item or sgg_cd} | "
                                        f"후보수:{filtered_candidate_count}(전체:{initial_candidate_count}) | "
                                        f"시군구매칭:{sgg_code_matched} 동매칭:{dong_matched} | "
                                        f"상세정보:{len(apt_details) if apt_details else 0}개 | {debug_msg}"
                                    )
                                    
                                    # 첫 번째 실패 상세 정보 저장 (반드시 설정)
                                    if first_failure_details is None:
                                        first_failure_details = failure_detail
                                    
                                    # 상세 로그 출력 (주석 처리 - 지역 순회 확인을 위해 비활성화)
                                    # logger.warning(
                                    #     f"    [매매] 매칭 실패: {failure_detail}"
                                    # )
                                    failure_samples.append({
                                        'type': '매매',
                                        'apt_name': apt_nm,
                                        'jibun': jibun or '',
                                        'build_year': build_year_for_match or '',
                                        'umd_nm': umd_nm or '',
                                        'sgg_cd': sgg_cd,
                                        'ym': ym,
                                        'reason': f'이름매칭 실패 (후보:{filtered_candidate_count}, {debug_msg})'
                                    })
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
                                
                                # 배치 커밋 (성능 최적화)
                                if len(sales_to_save) >= batch_size:
                                    await local_db.commit()
                                    total_saved += len(sales_to_save)
                                    success_count += len(sales_to_save)
                                    sales_to_save = []
                            
                            except Exception as e:
                                error_count += 1
                                # 예외 발생 시에도 첫 번째 실패 상세 정보 저장 시도
                                if first_failure_details is None:
                                    try:
                                        # 예외 발생한 항목의 기본 정보라도 저장
                                        apt_nm_elem = item.find("aptNm") if 'item' in locals() else None
                                        apt_nm = apt_nm_elem.text.strip() if apt_nm_elem is not None and apt_nm_elem.text else "알수없음"
                                        first_failure_details = f"예외발생: {str(e)[:100]} | 아파트:{apt_nm}"
                                    except:
                                        first_failure_details = f"예외발생: {str(e)[:100]}"
                                continue
                        
                        # 남은 데이터 커밋
                        if sales_to_save or (allow_duplicate and success_count > 0):
                            await local_db.commit()
                            if sales_to_save:
                                total_saved += len(sales_to_save)
                                success_count += len(sales_to_save)
                        
                        # 간결한 로그 (한 줄) - 매칭 실패가 있으면 첫 번째 실패 상세 정보 포함
                        if success_count > 0 or skip_count > 0 or error_count > 0:
                            if error_count > 0:
                                # 매칭 실패가 있으면 첫 번째 실패 상세 정보 포함
                                if first_failure_details:
                                    logger.warning(
                                        f"{region_progress_str} {sgg_cd}/{ym} ({ym_formatted}): "
                                        f"{success_count} ⏭{skip_count} {error_count} ({apt_name_log}) | "
                                        f"첫실패: {first_failure_details}"
                                    )
                                else:
                                    # first_failure_details가 없으면 (예외로 인한 실패 등) 기본 정보 출력
                                    logger.warning(
                                        f"{region_progress_str} {sgg_cd}/{ym} ({ym_formatted}): "
                                        f"{success_count} ⏭{skip_count} {error_count} ({apt_name_log}) | "
                                        f" 상세정보 없음 (예외 발생 가능)"
                                    )
                            else:
                                logger.info(
                                    f"{region_progress_str} {sgg_cd}/{ym} ({ym_formatted}): "
                                    f"{success_count} ⏭{skip_count} {error_count} "
                                    f"({apt_name_log})"
                                )
                        
                        skipped += skip_count
                        
                        # max_items 제한 확인
                        if max_items and total_saved >= max_items:
                            return
                        
                    except (OperationalError, TimeoutError, TooManyConnectionsError, ConnectionDoesNotExistError) as e:
                        # DB 연결 관련 에러 처리
                        error_msg = f"{sgg_cd}/{ym} ({ym_formatted}): DB 연결 오류 - {str(e)}"
                        errors.append(error_msg)
                        logger.error(f" {error_msg}")
                        try:
                            await local_db.rollback()
                        except:
                            pass
                        # 연결 풀 부족 시 잠시 대기 후 재시도하지 않고 건너뜀
                        await asyncio.sleep(0.1)
                    except Exception as e:
                        error_msg = f"{sgg_cd}/{ym} ({ym_formatted}): {str(e)}"
                        errors.append(error_msg)
                        logger.error(f" {error_msg}")
                        try:
                            await local_db.rollback()
                        except:
                            pass
        
        # 병렬 실행
        total_regions = len(target_sgg_codes)
        
        # 월별 진행 상황 추적을 위한 카운터
        region_progress = {"completed": 0, "total": total_regions}
        progress_lock = asyncio.Lock()
        
        async def process_sale_region_with_progress(ym: str, sgg_cd: str, region_idx: int):
            """진행 상황 추적 래퍼"""
            await process_sale_region(ym, sgg_cd, region_idx, total_regions)
            async with progress_lock:
                region_progress["completed"] += 1
        
        try:
            total_months = len(target_months)
            for month_idx, ym in enumerate(target_months, 1):
                if max_items and total_saved >= max_items:
                    break
                
                ym_display = format_ym(ym)
                logger.info(f" [{month_idx}/{total_months}] {ym_display} 시작: {total_regions}개 지역 순회")
                
                # 진행 상황 초기화
                region_progress["completed"] = 0
                
                tasks = [
                    process_sale_region_with_progress(ym, sgg_cd, idx) 
                    for idx, sgg_cd in enumerate(target_sgg_codes, 1)
                ]
                await asyncio.gather(*tasks, return_exceptions=True)
                
                logger.info(f" [{month_idx}/{total_months}] {ym_display} 완료: {region_progress['completed']}/{region_progress['total']}개 지역 처리됨")
                
                if max_items and total_saved >= max_items:
                    break
        finally:
            # HTTP 클라이언트 정리
            await http_client.aclose()
        
        # 실패 샘플 CSV 파일로 저장
        if failure_samples:
            try:
                csv_path = Path("db_backup/fail.csv")
                csv_path.parent.mkdir(parents=True, exist_ok=True)
                
                # 파일이 존재하면 append, 없으면 새로 생성
                file_exists = csv_path.exists()
                with open(csv_path, 'a', newline='', encoding='utf-8') as f:
                    writer = csv.DictWriter(f, fieldnames=['type', 'apt_name', 'jibun', 'build_year', 'umd_nm', 'sgg_cd', 'ym', 'reason'])
                    if not file_exists:
                        writer.writeheader()
                    writer.writerows(failure_samples)
                logger.info(f" 실패 샘플 {len(failure_samples)}건 저장: {csv_path}")
            except Exception as e:
                logger.warning(f" 실패 샘플 저장 실패: {e}")

        logger.info(f" 매매 수집 완료: 저장 {total_saved}건, 건너뜀 {skipped}건, 오류 {len(errors)}건")
        
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
        failure_samples = []  # 실패 샘플 수집
        
        logger.info(f" 전월세 수집 시작: {start_ym} ~ {end_ym}")
        
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
        
        # 3. 병렬 처리 (연결 풀 크기에 맞춰 10개로 제한, DB 연결 풀 고려)
        # DB 연결 풀: pool_size=20, max_overflow=30 (최대 50개)
        # 세마포어를 10개로 제한하여 연결 풀 여유 확보
        semaphore = asyncio.Semaphore(10)
        
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
            limits=httpx.Limits(max_connections=30, max_keepalive_connections=20)
        )
        
        async def process_rent_region(ym: str, sgg_cd: str, region_idx: int = 0, total_regions: int = 0):
            """전월세 데이터 수집 작업"""
            ym_formatted = format_ym(ym)
            region_progress_str = f"[{region_idx}/{total_regions}]" if total_regions > 0 else ""
            
            # 지역 순회 시작 로그
            if total_regions > 0:
                logger.info(f"    {region_progress_str} {sgg_cd}/{ym} ({ym_formatted}) 처리 시작...")
            
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
                            logger.warning(f" {sgg_cd}/{ym} ({ym_formatted}): 해당 지역에 아파트가 없음 (시군구코드: {sgg_cd})")
                            return
                        
                        # apt_details가 비어있을 때 경고
                        if not apt_details:
                            logger.debug(f"    {sgg_cd}/{ym}: 아파트 상세정보가 없음 (지번 매칭 불가, {len(local_apts)}개 아파트)")
                        else:
                            logger.debug(f"   ℹ {sgg_cd}/{ym}: 아파트 {len(local_apts)}개, 상세정보 {len(apt_details)}개 로드됨")
                        
                        rents_to_save = []
                        success_count = 0
                        skip_count = 0
                        error_count = 0
                        jeonse_count = 0
                        wolse_count = 0
                        apt_name_log = ""
                        first_failure_details = None  # 첫 번째 실패 상세 정보 저장
                        normalized_cache: Dict[str, Any] = {}  # 정규화 결과 캐싱
                        batch_size = 100  # 배치 커밋 크기
                        
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
                                
                                # 지번 추출 (매칭에 활용)
                                jibun_elem = item.find("jibun")
                                jibun = jibun_elem.text.strip() if jibun_elem is not None and jibun_elem.text else ""
                                
                                # 건축년도 추출 (매칭에 활용)
                                build_year_elem = item.find("buildYear")
                                build_year_for_match = build_year_elem.text.strip() if build_year_elem is not None and build_year_elem.text else ""
                                
                                if not apt_nm:
                                    continue
                                
                                if not apt_name_log:
                                    apt_name_log = apt_nm
                                
                                # 동 기반 필터링 (개선된 버전)
                                candidates = local_apts
                                sgg_code_matched = True
                                dong_matched = False
                                initial_candidate_count = len(local_apts)
                                
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
                                
                                filtered_candidate_count = len(candidates)
                                
                                # 아파트 매칭 (정규화 캐시, 지번, 건축년도, 상세정보 전달)
                                matched_apt, match_debug_info = self._match_apartment_with_debug(
                                    apt_nm, candidates, sgg_cd, umd_nm, 
                                    jibun, build_year_for_match, apt_details, normalized_cache
                                )
                                
                                # 필터링된 후보에서 실패 시 전체 후보로 재시도
                                if not matched_apt and len(candidates) < len(local_apts):
                                    logger.debug(f"    [전월세] 필터링 후보({filtered_candidate_count}개)에서 실패 → 전체 후보({initial_candidate_count}개)로 재시도: {apt_nm}")
                                    matched_apt, match_debug_info = self._match_apartment_with_debug(
                                        apt_nm, local_apts, sgg_cd, umd_nm, 
                                        jibun, build_year_for_match, apt_details, normalized_cache
                                    )
                                
                                if not matched_apt:
                                    error_count += 1
                                    # 상세 실패 로깅 (WARNING 레벨로 변경하여 항상 출력)
                                    debug_msg = ''
                                    if match_debug_info:
                                        debug_msg = match_debug_info.get('debug_msg', '')
                                    else:
                                        debug_msg = '디버그정보 없음'
                                    
                                    failure_detail = (
                                        f"아파트:{apt_nm} | 지번:{jibun or '없음'} | 건축년도:{build_year_for_match or '없음'} | "
                                        f"동:{umd_nm or '없음'} | 시군구코드:{sgg_cd_item or sgg_cd} | "
                                        f"후보수:{filtered_candidate_count}(전체:{initial_candidate_count}) | "
                                        f"시군구매칭:{sgg_code_matched} 동매칭:{dong_matched} | "
                                        f"상세정보:{len(apt_details) if apt_details else 0}개 | {debug_msg}"
                                    )
                                    
                                    # 첫 번째 실패 상세 정보 저장 (반드시 설정)
                                    if first_failure_details is None:
                                        first_failure_details = failure_detail
                                    
                                    # 상세 로그 출력 (주석 처리 - 지역 순회 확인을 위해 비활성화)
                                    # logger.warning(
                                    #     f"    [전월세] 매칭 실패: {failure_detail}"
                                    # )
                                    failure_samples.append({
                                        'type': '전월세',
                                        'apt_name': apt_nm,
                                        'jibun': jibun or '',
                                        'build_year': build_year_for_match or '',
                                        'umd_nm': umd_nm or '',
                                        'sgg_cd': sgg_cd,
                                        'ym': ym,
                                        'reason': f'이름매칭 실패 (후보:{filtered_candidate_count}, {debug_msg})'
                                    })
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
                                    
                                    # 전세/월세 구분 카운트
                                    if monthly_rent and monthly_rent > 0:
                                        wolse_count += 1
                                    else:
                                        jeonse_count += 1
                                    
                                    # 중복 체크 (인라인으로 최적화 - 매매와 동일한 방식)
                                    exists_stmt = select(Rent).where(
                                        and_(
                                            Rent.apt_id == matched_apt.apt_id,
                                            Rent.deal_date == deal_date_obj,
                                            Rent.floor == floor,
                                            Rent.exclusive_area == exclusive_area,
                                            Rent.deposit_price == deposit_price,
                                            Rent.monthly_rent == monthly_rent
                                        )
                                    )
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
                                    
                                    apt_seq_elem = item.find("aptSeq")
                                    apt_seq = apt_seq_elem.text.strip() if apt_seq_elem is not None and apt_seq_elem.text else None
                                    if apt_seq and len(apt_seq) > 10:
                                        apt_seq = apt_seq[:10]
                                    
                                    rent_create = RentCreate(
                                        apt_id=matched_apt.apt_id,
                                        build_year=build_year,
                                        contract_type=contract_type,
                                        deposit_price=deposit_price,
                                        monthly_rent=monthly_rent,
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
                                    success_count += 1
                                    total_saved += 1
                                    
                                    # 배치 커밋 (성능 최적화)
                                    if len(rents_to_save) >= batch_size:
                                        await local_db.commit()
                                        rents_to_save = []
                                        
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
                        
                        # 남은 데이터 커밋
                        if rents_to_save:
                            await local_db.commit()
                        
                        # 간결한 로그 (한 줄) - 매칭 실패가 있으면 첫 번째 실패 상세 정보 포함
                        if success_count > 0 or skip_count > 0 or error_count > 0:
                            if error_count > 0:
                                # 매칭 실패가 있으면 첫 번째 실패 상세 정보 포함
                                if first_failure_details:
                                    logger.warning(
                                        f"{region_progress_str} {sgg_cd}/{ym} ({ym_formatted}): "
                                        f"{success_count} ⏭{skip_count} {error_count} "
                                        f"(전세:{jeonse_count} 월세:{wolse_count}) ({apt_name_log}) | "
                                        f"첫실패: {first_failure_details}"
                                    )
                                else:
                                    # first_failure_details가 없으면 (예외로 인한 실패 등) 기본 정보 출력
                                    logger.warning(
                                        f"{region_progress_str} {sgg_cd}/{ym} ({ym_formatted}): "
                                        f"{success_count} ⏭{skip_count} {error_count} "
                                        f"(전세:{jeonse_count} 월세:{wolse_count}) ({apt_name_log}) | "
                                        f" 상세정보 없음 (예외 발생 가능)"
                                    )
                            else:
                                logger.info(
                                    f"{region_progress_str} {sgg_cd}/{ym} ({ym_formatted}): "
                                    f"{success_count} ⏭{skip_count} {error_count} "
                                    f"(전세:{jeonse_count} 월세:{wolse_count}) ({apt_name_log})"
                                )
                        
                        skipped += skip_count
                        
                        # max_items 제한 확인
                        if max_items and total_saved >= max_items:
                            return
                        
                    except (OperationalError, TimeoutError, TooManyConnectionsError, ConnectionDoesNotExistError) as e:
                        # DB 연결 관련 에러 처리
                        error_msg = f"{sgg_cd}/{ym} ({ym_formatted}): DB 연결 오류 - {str(e)}"
                        errors.append(error_msg)
                        logger.error(f" {error_msg}")
                        try:
                            await local_db.rollback()
                        except:
                            pass
                        # 연결 풀 부족 시 잠시 대기 후 재시도하지 않고 건너뜀
                        await asyncio.sleep(0.1)
                    except Exception as e:
                        error_msg = f"{sgg_cd}/{ym} ({ym_formatted}): {str(e)}"
                        errors.append(error_msg)
                        logger.error(f" {error_msg}")
                        try:
                            await local_db.rollback()
                        except:
                            pass
        
        # 병렬 실행
        total_regions = len(target_sgg_codes)
        
        # 월별 진행 상황 추적을 위한 카운터
        region_progress = {"completed": 0, "total": total_regions}
        progress_lock = asyncio.Lock()
        
        async def process_rent_region_with_progress(ym: str, sgg_cd: str, region_idx: int):
            """진행 상황 추적 래퍼"""
            await process_rent_region(ym, sgg_cd, region_idx, total_regions)
            async with progress_lock:
                region_progress["completed"] += 1
        
        try:
            total_months = len(target_months)
            for month_idx, ym in enumerate(target_months, 1):
                if max_items and total_saved >= max_items:
                    break
                
                ym_display = format_ym(ym)
                logger.info(f" [{month_idx}/{total_months}] {ym_display} 시작: {total_regions}개 지역 순회")
                
                # 진행 상황 초기화
                region_progress["completed"] = 0
                
                tasks = [
                    process_rent_region_with_progress(ym, sgg_cd, idx) 
                    for idx, sgg_cd in enumerate(target_sgg_codes, 1)
                ]
                await asyncio.gather(*tasks, return_exceptions=True)
                
                logger.info(f" [{month_idx}/{total_months}] {ym_display} 완료: {region_progress['completed']}/{region_progress['total']}개 지역 처리됨")
                
                if max_items and total_saved >= max_items:
                    break
        finally:
            # HTTP 클라이언트 정리
            await http_client.aclose()
        
        # 실패 샘플 CSV 파일로 저장
        if failure_samples:
            try:
                csv_path = Path("db_backup/fail.csv")
                csv_path.parent.mkdir(parents=True, exist_ok=True)
                
                # 파일이 존재하면 append, 없으면 새로 생성
                file_exists = csv_path.exists()
                with open(csv_path, 'a', newline='', encoding='utf-8') as f:
                    writer = csv.DictWriter(f, fieldnames=['type', 'apt_name', 'jibun', 'build_year', 'umd_nm', 'sgg_cd', 'ym', 'reason'])
                    if not file_exists:
                        writer.writeheader()
                    writer.writerows(failure_samples)
                logger.info(f" 실패 샘플 {len(failure_samples)}건 저장: {csv_path}")
            except Exception as e:
                logger.warning(f" 실패 샘플 저장 실패: {e}")

        logger.info(f" 전월세 수집 완료: 저장 {total_saved}건, 건너뜀 {skipped}건, 오류 {len(errors)}건")
        
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
