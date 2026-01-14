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

from sqlalchemy.ext.asyncio import AsyncSession

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
from app.schemas.state import StateCreate, StateCollectionResponse
from app.schemas.apartment import ApartmentCreate, ApartmentCollectionResponse
from app.schemas.apart_detail import ApartDetailCreate, ApartDetailCollectionResponse

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