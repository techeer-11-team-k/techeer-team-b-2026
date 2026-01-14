"""
데이터 수집 서비스

국토교통부 API에서 지역 데이터를 가져와서 데이터베이스에 저장하는 비즈니스 로직
"""
import logging
import asyncio
import sys
import re
import xml.etree.ElementTree as ET
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from urllib.parse import quote
import httpx
import xmltodict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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
from app.crud.rent import rent as rent_crud
from app.schemas.state import StateCreate, StateCollectionResponse
from app.schemas.apartment import ApartmentCreate, ApartmentCollectionResponse
from app.schemas.apart_detail import ApartDetailCreate, ApartDetailCollectionResponse
from app.schemas.rent import RentCreate, RentCollectionResponse, RentApiItem

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

# 국토부 아파트 전월세 실거래가 API 엔드포인트
MOLIT_RENT_API_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"

# 국토부 아파트 매매 실거래가 API 엔드포인트
MOLIT_SALE_API_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"

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
        """
        encoded_city_name = quote(city_name)
        params = {
            "serviceKey": self.api_key,
            "pageNo": str(page_no),
            "numOfRows": str(num_of_rows),
            "type": "json",
            "locatadd_nm": city_name
        }
        return await self.fetch_with_retry(MOLIT_REGION_API_URL, params)
    
    def parse_region_data(
        self,
        api_response: Dict[str, Any],
        city_name: str
    ) -> tuple[List[Dict[str, str]], int, int]:
        """
        API 응답 데이터 파싱 (모든 지역 단위 수집)
        """
        regions = []
        total_count = 0
        original_count = 0
        
        try:
            stan_regin_cd = api_response.get("StanReginCd", [])
            if not stan_regin_cd or len(stan_regin_cd) < 2:
                return [], 0, 0
            
            head_data = stan_regin_cd[0].get("head", [])
            for head_item in head_data:
                if isinstance(head_item, dict) and "totalCount" in head_item:
                    total_count = int(head_item["totalCount"])
                    break
            
            row_data = stan_regin_cd[1].get("row", [])
            if not isinstance(row_data, list):
                row_data = [row_data] if row_data else []
            
            original_count = len(row_data)
            
            for item in row_data:
                region_cd = str(item.get("region_cd", "")).strip()
                locatadd_nm = str(item.get("locatadd_nm", "")).strip()
                locallow_nm = str(item.get("locallow_nm", "")).strip()
                
                if not region_cd:
                    continue
                
                parsed_city = self._extract_city_name_from_address(locatadd_nm) or city_name
                
                if not locallow_nm:
                    parts = locatadd_nm.split()
                    if len(parts) >= 2:
                        if parts[0] == parsed_city:
                            locallow_nm = " ".join(parts[1:])
                        else:
                            locallow_nm = " ".join(parts)
                    else:
                        locallow_nm = locatadd_nm
                
                regions.append({
                    "region_code": region_cd,
                    "region_name": locallow_nm,
                    "city_name": parsed_city
                })
            
            return regions, total_count, original_count
            
        except Exception as e:
            logger.error(f"❌ 데이터 파싱 실패: {e}")
            return [], 0, 0
    
    def _extract_city_name_from_address(self, locatadd_nm: str) -> str:
        if not locatadd_nm: return ""
        for city in CITY_NAMES:
            if locatadd_nm.startswith(city): return city
        return ""
    
    def _extract_city_name_from_code(self, region_code: str) -> str:
        if len(region_code) < 2: return ""
        sido_code = region_code[:2]
        sido_map = {
            "11": "서울특별시", "26": "부산광역시", "27": "대구광역시", "28": "인천광역시", 
            "29": "광주광역시", "30": "대전광역시", "31": "울산광역시", "36": "세종특별자치시", 
            "41": "경기도", "42": "강원특별자치도", "43": "충청북도", "44": "충청남도", 
            "45": "전북특별자치도", "46": "전라남도", "47": "경상북도", "48": "경상남도", 
            "50": "제주특별자치도"
        }
        return sido_map.get(sido_code, "")

    async def _process_city_region(
        self,
        city_name: str,
        semaphore: asyncio.Semaphore
    ) -> Dict[str, Any]:
        """단일 시도 지역 데이터 수집 (병렬용)"""
        async with semaphore:
            result = {"city": city_name, "data": [], "errors": []}
            try:
                num_of_rows = 1000
                first_response = await self.fetch_region_data(city_name, 1, num_of_rows)
                first_regions, total_count, _ = self.parse_region_data(first_response, city_name)
                
                result["data"].extend(first_regions)
                
                if total_count > num_of_rows:
                    total_pages = (total_count // num_of_rows) + 1
                    logger.info(f"   🔍 {city_name}: 총 {total_count}개, {total_pages}페이지 병렬 수집")
                    
                    inner_semaphore = asyncio.Semaphore(5)
                    async def fetch_page(p):
                        async with inner_semaphore:
                            res = await self.fetch_region_data(city_name, p, num_of_rows)
                            regions, _, _ = self.parse_region_data(res, city_name)
                            return regions

                    tasks = [fetch_page(p) for p in range(2, total_pages + 1)]
                    pages_results = await asyncio.gather(*tasks)
                    
                    for regions in pages_results:
                        result["data"].extend(regions)
                
                logger.info(f"   📦 {city_name} 수집 완료: {len(result['data'])}개 데이터 확보")
                return result
            except Exception as e:
                logger.error(f"❌ {city_name} 수집 실패: {e}")
                result["errors"].append(str(e))
                return result
    
    async def collect_all_regions(
        self,
        db: AsyncSession
    ) -> StateCollectionResponse:
        """모든 시도의 지역 데이터 수집 (병렬 수집 -> 순차 저장)"""
        total_fetched = 0
        total_saved = 0
        skipped = 0
        errors = []
        
        try:
            logger.info("=" * 60)
            logger.info("🚀 [안정형] 지역 데이터 수집 시작")
            logger.info("=" * 60)
            
            CONCURRENT_LIMIT = 5
            semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
            
            tasks = [self._process_city_region(city, semaphore) for city in CITY_NAMES]
            logger.info("📡 17개 시도 데이터 병렬 수집 중...")
            results = await asyncio.gather(*tasks)
            
            logger.info("💾 수집된 데이터 저장 시작...")
            for res in results:
                city_name = res["city"]
                city_data = res["data"]
                
                total_fetched += len(city_data)
                if res["errors"]: errors.extend(res["errors"])
                if not city_data: continue
                
                logger.info(f"   💾 {city_name}: {len(city_data)}개 저장 중...")
                city_saved = 0
                city_skipped = 0
                
                for region_data in city_data:
                    try:
                        state_create = StateCreate(**region_data)
                        _, is_created = await state_crud.create_or_skip(db, obj_in=state_create)
                        if is_created: city_saved += 1
                        else: city_skipped += 1
                    except Exception: pass
                
                total_saved += city_saved
                skipped += city_skipped
                logger.info(f"      ✅ {city_name} 저장 완료 (저장: {city_saved}, 건너뜀: {city_skipped})")
            
            logger.info("=" * 60)
            logger.info(f"🎉 지역 데이터 수집 완료! (저장: {total_saved})")
            
            return StateCollectionResponse(
                success=True,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors,
                message=f"수집 완료: {total_saved}개 저장"
            )
        except Exception as e:
            logger.error(f"❌ 지역 데이터 수집 실패: {e}", exc_info=True)
            return StateCollectionResponse(success=False, errors=[str(e)], message=f"수집 실패: {str(e)}")

    async def fetch_apartment_data(
        self,
        page_no: int = 1,
        num_of_rows: int = 1000
    ) -> Dict[str, Any]:
        """국토부 API에서 아파트 목록 데이터 가져오기"""
        params = {"serviceKey": self.api_key, "pageNo": str(page_no), "numOfRows": str(num_of_rows)}
        return await self.fetch_with_retry(MOLIT_APARTMENT_LIST_API_URL, params)
    
    def parse_apartment_data(
        self,
        api_response: Dict[str, Any]
    ) -> tuple[List[Dict[str, Any]], int, int]:
        """아파트 목록 API 응답 파싱"""
        try:
            body = api_response.get("response", {}).get("body", {})
            items = body.get("items", [])
            total_count = int(body.get("totalCount", 0))
            
            if not isinstance(items, list): items = [items] if items else []
            
            original_count = len(items)
            apartments = []
            
            for item in items:
                if not item: continue
                kapt_code = item.get("kaptCode", "").strip()
                kapt_name = item.get("kaptName", "").strip()
                bjd_code = item.get("bjdCode", "").strip()
                
                if not kapt_code or not kapt_name or not bjd_code: continue
                
                apartments.append({
                    "kapt_code": kapt_code,
                    "apt_name": kapt_name,
                    "bjd_code": bjd_code,
                    "as1": item.get("as1"),
                    "as2": item.get("as2"),
                    "as3": item.get("as3"),
                    "as4": item.get("as4")
                })
            return apartments, total_count, original_count
        except Exception as e:
            logger.error(f"❌ 파싱 오류: {e}")
            return [], 0, 0
    
    async def _fetch_and_process_apartment_page(
        self,
        page_no: int,
        num_of_rows: int,
        semaphore: asyncio.Semaphore
    ) -> Dict[str, Any]:
        """단일 페이지 아파트 목록 수집 및 처리 (DB 접근 제거)"""
        async with semaphore:
            try:
                api_response = await self.fetch_apartment_data(page_no, num_of_rows)
                apartments, _, _ = self.parse_apartment_data(api_response)
                return {"success": True, "page_no": page_no, "data": apartments, "errors": []}
            except Exception as e:
                return {"success": False, "page_no": page_no, "error": str(e)}

    async def collect_all_apartments(
        self,
        db: AsyncSession
    ) -> ApartmentCollectionResponse:
        """모든 아파트 목록 수집 (초고속 병렬 처리 모드)"""
        total_fetched = 0
        total_saved = 0
        skipped = 0
        errors = []
        
        try:
            logger.info("=" * 80)
            logger.info("🏢 [최고성능] 아파트 목록 수집 시작")
            logger.info("=" * 80)
            
            logger.info("🚀 Region 데이터 메모리 캐싱 중...")
            from sqlalchemy import select
            from app.models.state import State
            region_result = await db.execute(select(State.region_code, State.region_id))
            region_map = {row[0]: row[1] for row in region_result.fetchall()}
            logger.info(f"   ✅ {len(region_map)}개 지역 코드 캐싱 완료")
            
            num_of_rows = 1000
            first_response = await self.fetch_apartment_data(1, num_of_rows)
            _, total_count, _ = self.parse_apartment_data(first_response)
            
            if total_count == 0: return ApartmentCollectionResponse(success=True, message="수집할 데이터가 없습니다.")
            
            total_pages = (total_count // num_of_rows) + 1
            logger.info(f"📊 총 {total_count}개 아파트, {total_pages}페이지 예상")
            
            CONCURRENT_LIMIT = 30
            semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
            pages = list(range(1, total_pages + 1))
            chunk_size = 50
            
            for i in range(0, len(pages), chunk_size):
                chunk_pages = pages[i : i + chunk_size]
                logger.info(f"⚡ 페이지 {chunk_pages[0]} ~ {chunk_pages[-1]} 초고속 수집 중...")
                
                tasks = [self._fetch_and_process_apartment_page(p, num_of_rows, semaphore) for p in chunk_pages]
                results = await asyncio.gather(*tasks)
                
                apartments_to_save = []
                for res in results:
                    if res["success"]:
                        for apt_data in res["data"]:
                            try:
                                kapt_code = apt_data.get('kapt_code')
                                apt_name = apt_data.get('apt_name')
                                bjd_code = apt_data.get('bjd_code')
                                region_id = region_map.get(bjd_code)
                                if not region_id: continue
                                
                                apartments_to_save.append(ApartmentCreate(
                                    region_id=region_id, apt_name=apt_name, kapt_code=kapt_code, is_available=None
                                ))
                            except Exception: pass
                        if res.get("errors"): errors.extend(res["errors"])
                    else: errors.append(f"페이지 {res['page_no']} 실패: {res.get('error')}")
                
                total_fetched += len(apartments_to_save)
                
                if apartments_to_save:
                    try:
                        saved_count = 0
                        skipped_count = 0
                        for apt_create in apartments_to_save:
                            _, created = await apartment_crud.create_or_skip(db, obj_in=apt_create)
                            if created: saved_count += 1
                            else: skipped_count += 1
                        total_saved += saved_count
                        skipped += skipped_count
                        logger.info(f"   💾 배치 처리 완료: {saved_count}개 저장, {skipped_count}개 중복 (누적: {total_saved})")
                    except Exception as e:
                        logger.error(f"❌ 배치 저장 실패: {e}")
                
                await asyncio.sleep(0.2)
            
            logger.info("=" * 80)
            logger.info(f"✅ 아파트 목록 수집 완료 (총 {total_saved}개)")
            return ApartmentCollectionResponse(success=True, total_fetched=total_fetched, total_saved=total_saved, skipped=skipped, errors=errors[:100], message=f"초고속 수집 완료: {total_saved}개 저장")
        except Exception as e:
            logger.error(f"❌ 수집 실패: {e}", exc_info=True)
            return ApartmentCollectionResponse(success=False, errors=[str(e)], message=f"수집 실패: {str(e)}")

    async def fetch_apartment_basic_info(self, kapt_code: str) -> Dict[str, Any]:
        params = {"serviceKey": self.api_key, "kaptCode": kapt_code}
        return await self.fetch_with_retry(MOLIT_APARTMENT_BASIC_API_URL, params)
    
    async def fetch_apartment_detail_info(self, kapt_code: str) -> Dict[str, Any]:
        params = {"serviceKey": self.api_key, "kaptCode": kapt_code}
        return await self.fetch_with_retry(MOLIT_APARTMENT_DETAIL_API_URL, params)
    
    def parse_date(self, date_str: Optional[str]) -> Optional[str]:
        if not date_str or len(date_str) != 8: return None
        try: return f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
        except Exception: return None
    
    def parse_int(self, value: Any) -> Optional[int]:
        if value is None or value == "": return None
        try:
            if isinstance(value, str):
                value = value.strip()
                if not value: return None
            return int(value)
        except (ValueError, TypeError): return None
    
    def parse_apartment_details(
        self,
        basic_info: Dict[str, Any],
        detail_info: Dict[str, Any],
        apt_id: int
    ) -> Optional[ApartDetailCreate]:
        try:
            basic_item = basic_info.get("response", {}).get("body", {}).get("item", {})
            if not basic_item:
                logger.warning(f"   ⚠️ [파싱 실패] apt_id={apt_id}: 기본정보 API 응답에 item이 없습니다.")
                return None
            
            detail_item = detail_info.get("response", {}).get("body", {}).get("item", {})
            if not detail_item:
                logger.warning(f"   ⚠️ [파싱 실패] apt_id={apt_id}: 상세정보 API 응답에 item이 없습니다.")
                return None
            
            doro_juso = basic_item.get("doroJuso", "").strip() if basic_item.get("doroJuso") else ""
            kapt_addr = basic_item.get("kaptAddr", "").strip() if basic_item.get("kaptAddr") else ""
            
            if not doro_juso and not kapt_addr:
                logger.warning(f"   ⚠️ [파싱 실패] apt_id={apt_id}: 도로명 주소와 지번 주소가 모두 없습니다.")
                return None
            if not doro_juso: doro_juso = kapt_addr
            if not kapt_addr: kapt_addr = doro_juso
            
            zipcode = basic_item.get("zipcode", "").strip() if basic_item.get("zipcode") else None
            if zipcode and len(zipcode) > 5: zipcode = zipcode[:5]
            
            use_approval_date_str = self.parse_date(basic_item.get("kaptUsedate"))
            use_approval_date = None
            if use_approval_date_str:
                try: use_approval_date = datetime.strptime(use_approval_date_str, "%Y-%m-%d").date()
                except Exception: pass
            
            total_household_cnt = self.parse_int(basic_item.get("kaptdaCnt"))
            if total_household_cnt is None:
                logger.warning(f"   ⚠️ [파싱 실패] apt_id={apt_id}: 총 세대 수(kaptdaCnt)가 없습니다.")
                return None
            
            manage_type = detail_item.get("codeMgr", "").strip()
            if not manage_type: manage_type = basic_item.get("codeMgrNm", "").strip()
            if not manage_type: manage_type = None
            if manage_type and len(manage_type) > 20: manage_type = manage_type[:20]
            
            subway_line = detail_item.get("subwayLine", "").strip() if detail_item.get("subwayLine") else None
            if subway_line and len(subway_line) > 100: subway_line = subway_line[:100]
            
            subway_station = detail_item.get("subwayStation", "").strip() if detail_item.get("subwayStation") else None
            if subway_station and len(subway_station) > 100: subway_station = subway_station[:100]
            
            subway_time = detail_item.get("kaptdWtimesub", "").strip() if detail_item.get("kaptdWtimesub") else None
            if subway_time and len(subway_time) > 100: subway_time = subway_time[:100]
            
            builder_name = basic_item.get("kaptBcompany", "").strip() if basic_item.get("kaptBcompany") else None
            if builder_name and len(builder_name) > 100: builder_name = builder_name[:100]
            
            developer_name = basic_item.get("kaptAcompany", "").strip() if basic_item.get("kaptAcompany") else None
            if developer_name and len(developer_name) > 100: developer_name = developer_name[:100]

            education_facility = detail_item.get("educationFacility", "").strip() if detail_item.get("educationFacility") else None
            if education_facility and len(education_facility) > 200:
                education_facility = education_facility[:200]
            
            try:
                return ApartDetailCreate(
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
                    builder_name=builder_name,
                    developer_name=developer_name,
                    manage_type=manage_type,
                    hallway_type=basic_item.get("codeHallNm", "").strip() if basic_item.get("codeHallNm") else None,
                    subway_time=subway_time,
                    subway_line=subway_line,
                    subway_station=subway_station,
                    educationFacility=education_facility,
                    geometry=None
                )
            except Exception as e:
                logger.error(f"   ❌ [파싱 오류] apt_id={apt_id}: 객체 생성 중 에러 - {e}")
                return None
        except Exception as e:
            logger.error(f"   ❌ [파싱 오류] apt_id={apt_id}: 알 수 없는 에러 - {e}")
            return None
    
    async def _process_single_apartment(
        self,
        db: AsyncSession,
        apartment: Any,
        semaphore: asyncio.Semaphore
    ) -> Dict[str, Any]:
        """단일 아파트 상세 정보 수집 및 저장 (병렬 처리용)"""
        async with semaphore:
            apt_name = apartment.apt_name
            kapt_code = apartment.kapt_code
            apt_id = apartment.apt_id
            
            start_time = asyncio.get_event_loop().time()
            
            try:
                try:
                    basic_task = self.fetch_apartment_basic_info(kapt_code)
                    detail_task = self.fetch_apartment_detail_info(kapt_code)
                    
                    basic_info, detail_info = await asyncio.wait_for(
                        asyncio.gather(basic_task, detail_task),
                        timeout=15.0
                    )
                except asyncio.TimeoutError:
                    logger.warning(f"🐢 [지연 감지] {apt_name} ({kapt_code}) API 응답 15초 초과 - 건너뜀")
                    return {"success": False, "error": "API Timeout (15s)", "apt_name": apt_name}

                detail_create = self.parse_apartment_details(basic_info, detail_info, apt_id)
                
                if not detail_create:
                    return {"success": False, "error": "데이터 파싱 실패 (필수값 누락)", "apt_name": apt_name}
                
                elapsed = asyncio.get_event_loop().time() - start_time
                if elapsed > 5.0:
                    logger.info(f"⚠️ [Slow] {apt_name} 처리 {elapsed:.2f}초 소요")

                return {"success": True, "data": detail_create, "apt_name": apt_name}

            except Exception as e:
                return {"success": False, "error": str(e), "apt_name": apt_name}

    async def collect_apartment_details(
        self,
        db: AsyncSession,
        limit: Optional[int] = None
    ) -> ApartDetailCollectionResponse:
        """아파트 상세 정보 수집 (고성능 병렬 처리 버전)"""
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
    
    def parse_rent_item(
        self,
        item: Dict[str, Any],
        apt_id: int
    ) -> Optional[RentCreate]:
        """
        전월세 거래 데이터 파싱
        
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
                    error_msg = f"처리 실패 ({apt_name}): {str(e)}"
                    errors.append(error_msg)
                    logger.error(f"   ❌ [{idx}/{total_fetched}] {error_msg}")
                    import traceback
                    logger.debug(f"   상세: {traceback.format_exc()}")
            
            # 결과 출력
            logger.info("=" * 80)
            logger.info(f"✅ 전월세 실거래가 수집 완료")
            logger.info(f"   📊 총 수집: {total_fetched}개")
            logger.info(f"   💾 저장: {total_saved}개")
            logger.info(f"   ⏭️ 건너뜀: {skipped}개")
            if errors:
                logger.warning(f"   ⚠️ 오류: {len(errors)}개")
            logger.info("=" * 80)
            
            return RentCollectionResponse(
                success=len(errors) < total_fetched,  # 일부라도 성공하면 success=True
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors[:100],  # 오류 메시지는 최대 100개까지만
                message=f"수집 완료: {total_saved}개 저장, {skipped}개 건너뜀",
                lawd_cd=lawd_cd,
                deal_ymd=deal_ymd
            )
            
        except Exception as e:
            logger.error(f"❌ 전월세 수집 실패: {e}", exc_info=True)
            return RentCollectionResponse(
                success=False,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors + [str(e)],
                message=f"수집 실패: {str(e)}",
                lawd_cd=lawd_cd,
                deal_ymd=deal_ymd
            )
    
    async def get_all_region_codes(
        self,
        db: AsyncSession
    ) -> List[str]:
        """
        DB에서 모든 고유한 지역코드(법정동코드 앞 5자리) 추출
        
        Args:
            db: 데이터베이스 세션
        
        Returns:
            고유한 지역코드 리스트 (5자리)
        
        Note:
            - states 테이블의 region_code(10자리)에서 앞 5자리만 추출
            - 중복 제거하여 반환
        """
        from app.models.state import State
        from sqlalchemy import func
        
        # region_code의 앞 5자리를 추출하고 중복 제거
        result = await db.execute(
            select(func.distinct(func.substr(State.region_code, 1, 5)))
            .where(State.region_code.isnot(None))
        )
        
        region_codes = [row[0] for row in result.fetchall() if row[0]]
        
        logger.info(f"📍 DB에서 {len(region_codes)}개의 고유 지역코드 추출됨")
        
        return sorted(region_codes)
    
    def generate_year_months(
        self,
        start_year: int,
        start_month: int
    ) -> List[str]:
        """
        시작 년월부터 현재까지의 년월 목록 생성
        
        Args:
            start_year: 시작 연도
            start_month: 시작 월
        
        Returns:
            년월 문자열 리스트 (YYYYMM 형식)
        """
        from datetime import datetime
        
        result = []
        current = datetime.now()
        
        year = start_year
        month = start_month
        
        while (year < current.year) or (year == current.year and month <= current.month):
            result.append(f"{year}{month:02d}")
            
            month += 1
            if month > 12:
                month = 1
                year += 1
        
        return result
    
    async def collect_all_rent_transactions(
        self,
        db: AsyncSession,
        start_year: int = 2023,
        start_month: int = 1,
        start_region_index: int = 0,
        max_api_calls: int = 9500
    ) -> RentCollectionResponse:
        """
        모든 지역의 전월세 실거래가 데이터 일괄 수집
        
        DB에 저장된 모든 지역코드에 대해 지정된 시작 년월부터 현재까지의
        전월세 실거래가 데이터를 자동으로 수집합니다.
        
        Args:
            db: 데이터베이스 세션
            start_year: 수집 시작 연도 (기본값: 2023)
            start_month: 수집 시작 월 (기본값: 1)
            start_region_index: 시작할 지역코드 인덱스 (기본값: 0)
            max_api_calls: 최대 API 호출 횟수 (기본값: 9500, 일일 제한 고려)
        
        Returns:
            RentCollectionResponse: 전체 수집 결과 통계
        
        Note:
            - 공공데이터포털 API 일일 호출 제한(10,000건)을 고려하여 max_api_calls로 제한
            - 응답의 next_region_index를 사용하여 다음 날 이어서 수집 가능
            - 진행 상황을 로그로 출력합니다.
        """
        total_fetched = 0
        total_saved = 0
        total_skipped = 0
        all_errors = []
        api_calls_used = 0
        last_lawd_cd = None
        last_deal_ymd = None
        next_region_index = None
        
        try:
            # 1단계: DB에서 모든 지역코드 추출
            logger.info("=" * 80)
            logger.info("🏠 전월세 실거래가 전체 수집 시작")
            logger.info(f"   ⚠️ 일일 API 호출 제한: {max_api_calls}회")
            logger.info("=" * 80)
            
            region_codes = await self.get_all_region_codes(db)
            
            if not region_codes:
                return RentCollectionResponse(
                    success=False,
                    total_fetched=0,
                    total_saved=0,
                    skipped=0,
                    errors=["DB에 지역코드가 없습니다. 먼저 지역 데이터를 수집하세요."],
                    message="수집 실패: 지역코드 없음",
                    api_calls_used=0
                )
            
            # 시작 인덱스 검증
            if start_region_index >= len(region_codes):
                return RentCollectionResponse(
                    success=True,
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
                                
                                apt_id = apt_cache[cache_key]
                                
                                # 거래 데이터 파싱
                                rent_create = self.parse_rent_item(item, apt_id)
                                if not rent_create:
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


    async def fetch_sales_xml(self, lawd_cd: str, deal_ym: str) -> str:
        """아파트 매매 실거래가 API 호출 (XML 반환)"""
        params = {
            "serviceKey": self.api_key,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": deal_ym
        }
        url = MOLIT_SALE_API_URL
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            return response.text

    def _clean_apt_name(self, name: str) -> str:
        """아파트 이름 정제 (괄호 및 내용 제거)"""
        return re.sub(r'\([^)]*\)', '', name).strip()

    async def collect_sales_data(
        self,
        db: AsyncSession,
        start_ym: str,
        end_ym: str
    ) -> Any:
        """
        아파트 매매 실거래가 데이터 수집
        
        Args:
            start_ym: 시작 연월 (YYYYMM)
            end_ym: 종료 연월 (YYYYMM)
        """
        from app.schemas.sale import SalesCollectionResponse, SaleCreate
        from sqlalchemy import select, func, text, and_
        from sqlalchemy.orm import joinedload
        
        logger.info("=" * 80)
        logger.info(f"💰 [매매 실거래가] 데이터 수집 시작 ({start_ym} ~ {end_ym})")
        logger.info("=" * 80)
        
        total_fetched = 0
        total_saved = 0
        skipped = 0
        errors = []
        
        # 1. 대상 기간 생성
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
        
        # 2. 대상 지역 코드 (5자리) 가져오기
        logger.info("📍 대상 지역 코드 추출 중...")
        try:
            stmt = text("SELECT DISTINCT SUBSTR(region_code, 1, 5) FROM states WHERE length(region_code) >= 5")
            result = await db.execute(stmt)
            target_sgg_codes = [row[0] for row in result.fetchall() if row[0] and len(row[0]) == 5]
            logger.info(f"   -> 총 {len(target_sgg_codes)}개 지역 코드 추출됨")
        except Exception as e:
            logger.error(f"❌ 지역 코드 추출 실패: {e}")
            return SalesCollectionResponse(success=False, message=f"DB 오류: {e}")

        # 3. 수집 루프
        for ym in target_months:
            logger.info(f"📅 [기간: {ym}] 수집 시작")
            
            for sgg_cd in target_sgg_codes:
                try:
                    # 3-0. [트래픽 절약] 이미 수집된 데이터가 있는지 확인 (블록 단위 스킵)
                    # 해당 지역(sgg_cd) + 해당 월(ym)의 데이터가 1개라도 있으면 API 호출 스킵
                    # 주의: 부분 수집된 경우에도 스킵될 수 있으므로, 재수집 시에는 데이터를 삭제하고 진행해야 함
                    
                    # YYYYMM 문자열을 Date 범위로 변환
                    y = int(ym[:4])
                    m = int(ym[4:])
                    start_date = date(y, m, 1)
                    import calendar
                    last_day = calendar.monthrange(y, m)[1]
                    end_date = date(y, m, last_day)
                    
                    # 해당 기간, 해당 지역의 거래 내역 수 조회
                    check_stmt = select(func.count(Sale.trans_id)).join(Apartment).join(State).where(
                        and_(
                            State.region_code.like(f"{sgg_cd}%"),
                            Sale.contract_date >= start_date,
                            Sale.contract_date <= end_date
                        )
                    )
                    
                    count_result = await db.execute(check_stmt)
                    existing_count = count_result.scalar() or 0
                    
                    if existing_count > 0:
                        logger.info(f"      ⏭️ [SKIP] {sgg_cd} / {ym}: 이미 {existing_count}건의 데이터가 존재하여 API 호출을 생략합니다.")
                        skipped += existing_count # 통계에 포함 (선택사항)
                        continue

                    # API 호출
                    xml_content = await self.fetch_sales_xml(sgg_cd, ym)
                    
                    # XML 파싱
                    try:
                        root = ET.fromstring(xml_content)
                    except ET.ParseError:
                        # XML이 아닌 경우 (에러 메시지 등)
                        continue
                        
                    items = root.findall(".//item")
                    
                    if not items:
                        continue
                        
                    # 해당 지역 아파트 메모리 로드 (Region 정보 포함)
                    stmt = select(Apartment).options(joinedload(Apartment.region)).join(State).where(State.region_code.like(f"{sgg_cd}%"))
                    apt_result = await db.execute(stmt)
                    local_apts = apt_result.scalars().all()
                    
                    if not local_apts:
                        continue
                        
                    sales_to_save = []
                    
                    for item in items:
                        try:
                            # XML 필드 추출
                            apt_nm_xml = item.findtext("aptNm")
                            umd_nm = item.findtext("umdNm")
                            
                            if not apt_nm_xml: continue
                            
                            cleaned_name = self._clean_apt_name(apt_nm_xml)
                            if not cleaned_name: continue
                            
                            # 1. 동(Dong) 기반 필터링
                            # API의 법정동(umdNm)이 DB의 지역명에 포함되는 아파트만 후보로 선정
                            candidates = local_apts
                            if umd_nm:
                                filtered = [apt for apt in local_apts if umd_nm in apt.region.region_name]
                                if filtered:
                                    candidates = filtered
                            
                            # 2. 아파트 이름 매칭
                            matched_apt = None
                            for apt in candidates:
                                # DB 아파트 이름도 정제 (괄호 제거 등)
                                db_apt_clean = self._clean_apt_name(apt.apt_name)
                                
                                # 양방향 포함 관계 확인 (API 이름이 DB 이름에 있거나, 그 반대거나)
                                if cleaned_name in db_apt_clean or db_apt_clean in cleaned_name:
                                    matched_apt = apt
                                    break
                            
                            if not matched_apt:
                                continue
                            
                            # 매칭 로그 (디버깅용)
                            logger.info(f"      🔗 매칭: [{umd_nm}] {cleaned_name} -> {matched_apt.apt_name} (ID: {matched_apt.apt_id})")
                                
                            # 필드 매핑
                            deal_amount = item.findtext("dealAmount", "0").replace(",", "").strip()
                            build_year = item.findtext("buildYear")
                            deal_year = item.findtext("dealYear")
                            deal_month = item.findtext("dealMonth")
                            deal_day = item.findtext("dealDay")
                            exclu_use_ar = item.findtext("excluUseAr")
                            floor = item.findtext("floor")
                            
                            contract_date = None
                            if deal_year and deal_month and deal_day:
                                try:
                                    contract_date = date(int(deal_year), int(deal_month), int(deal_day))
                                except: pass
                                
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
                            
                            sales_to_save.append(sale_create)
                            
                            # 아파트 상태 업데이트
                            if matched_apt.is_available != "1":
                                matched_apt.is_available = "1"
                                db.add(matched_apt)
                                
                        except Exception as e:
                            continue
                    
                    if sales_to_save:
                        saved_count = 0
                        for sale_data in sales_to_save:
                            # 중복 정밀 체크
                            exists_stmt = select(Sale).where(
                                and_(
                                    Sale.apt_id == sale_data.apt_id,
                                    Sale.contract_date == sale_data.contract_date,
                                    Sale.trans_price == sale_data.trans_price,
                                    Sale.floor == sale_data.floor,
                                    Sale.exclusive_area == sale_data.exclusive_area
                                )
                            )
                            exists = await db.execute(exists_stmt)
                            if exists.scalars().first():
                                logger.info(f"      ⏭️ 중복 데이터 건너뜀: AptID {sale_data.apt_id}, {sale_data.contract_date}, {sale_data.trans_price}만원")
                                skipped += 1
                                continue
                                
                            db_obj = Sale(**sale_data.model_dump())
                            db.add(db_obj)
                            saved_count += 1
                            
                        await db.commit()
                        total_saved += saved_count
                        total_fetched += len(items)
                        
                        if saved_count > 0:
                            logger.info(f"      ✅ {sgg_cd} / {ym}: {saved_count}건 저장")
                        
                except Exception as e:
                    logger.error(f"❌ {sgg_cd} / {ym} 처리 중 오류: {e}")
                    errors.append(f"{sgg_cd}/{ym}: {str(e)}")
            
        return SalesCollectionResponse(
            success=True,
            total_fetched=total_fetched,
            total_saved=total_saved,
            skipped=skipped,
            errors=errors,
            message=f"수집 완료: {total_saved}건 저장"
        )

# 서비스 인스턴스 생성
data_collection_service = DataCollectionService()