"""
데이터 수집 서비스

국토교통부 API에서 지역 데이터를 가져와서 데이터베이스에 저장하는 비즈니스 로직
"""
import logging
import asyncio
import sys
from datetime import date
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
        
        try:
            # 데이터베이스에서 모든 아파트 조회
            from sqlalchemy import select
            from app.models.apartment import Apartment
            query = select(Apartment).where(Apartment.is_deleted == False)
            if limit:
                query = query.limit(limit)
            
            result = await db.execute(query)
            apartments = list(result.scalars().all())
            
            if not apartments:
                logger.warning("⚠️ 데이터베이스에 아파트가 없습니다.")
                return ApartDetailCollectionResponse(
                    success=True,
                    total_processed=0,
                    total_saved=0,
                    skipped=0,
                    errors=[],
                    message="수집할 아파트가 없습니다."
                )
            
            # 시작 메시지 출력 (아파트 개수 확인 후)
            total_count_msg = f"{len(apartments)}개" if not limit else f"{limit}개 (제한)"
            logger.info(f"🏢 아파트 상세 정보 수집 시작: {total_count_msg}")
            
            # 주기적 커밋을 위한 카운터
            commit_interval = 10
            last_commit_count = 0
            
            for idx, apartment in enumerate(apartments, 1):
                # 각 아파트마다 savepoint를 사용하여 독립적인 트랜잭션으로 처리
                savepoint = await db.begin_nested()
                try:
                    # 1단계: 아파트 기본 정보 추출
                    kapt_code = apartment.kapt_code
                    apt_name = apartment.apt_name
                    apt_id = apartment.apt_id
                    
                    # 2단계: 중복 확인 (1대1 관계 보장)
                    try:
                        existing_detail = await apart_detail_crud.get_by_apt_id(db, apt_id=apt_id)
                        if existing_detail:
                            skipped += 1
                            total_processed += 1
                            await savepoint.commit()
                            continue
                    except Exception as check_error:
                        error_msg = f"중복 확인 실패: {str(check_error)}"
                        errors.append(f"아파트 '{apt_name}' (ID: {apt_id}): {error_msg}")
                        total_processed += 1
                        logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                        import traceback
                        logger.debug(f"상세 스택: {traceback.format_exc()}")
                        await savepoint.rollback()
                        continue
                    
                    # 3단계: 기본정보 API 호출
                    try:
                        basic_info = await self.fetch_apartment_basic_info(kapt_code)
                        await asyncio.sleep(0.2)  # API 호출 제한 방지
                        
                        # API 응답 구조 확인
                        if not isinstance(basic_info, dict):
                            error_msg = f"기본정보 API 응답 형식 오류"
                            errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                            total_processed += 1
                            logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                            await savepoint.rollback()
                            continue
                        
                        response = basic_info.get("response", {})
                        if not response:
                            error_msg = f"기본정보 API 응답 구조 오류"
                            errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                            total_processed += 1
                            logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                            await savepoint.rollback()
                            continue
                        
                        header = response.get("header", {})
                        body = response.get("body", {})
                        basic_result_code = header.get("resultCode", "")
                        basic_result_msg = header.get("resultMsg", "")
                        
                        if basic_result_code != "00":
                            error_msg = f"기본정보 API 오류: {basic_result_msg}"
                            errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                            total_processed += 1
                            logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                            await savepoint.rollback()
                            continue
                        
                        basic_item = body.get("item", {})
                        if not basic_item:
                            error_msg = f"기본정보 API 응답에 데이터 없음"
                            errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                            total_processed += 1
                            logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                            await savepoint.rollback()
                            continue
                        
                    except httpx.HTTPError as http_error:
                        error_msg = f"기본정보 API HTTP 오류: {str(http_error)}"
                        errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                        total_processed += 1
                        logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                        import traceback
                        logger.debug(f"상세 스택: {traceback.format_exc()}")
                        await savepoint.rollback()
                        continue
                    except Exception as e:
                        error_msg = f"기본정보 API 호출 실패: {str(e)}"
                        errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                        total_processed += 1
                        logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                        import traceback
                        logger.debug(f"상세 스택: {traceback.format_exc()}")
                        await savepoint.rollback()
                        continue
                    
                    # 4단계: 상세정보 API 호출
                    try:
                        detail_info = await self.fetch_apartment_detail_info(kapt_code)
                        await asyncio.sleep(0.2)  # API 호출 제한 방지
                        
                        # API 응답 구조 확인
                        if not isinstance(detail_info, dict):
                            error_msg = f"상세정보 API 응답 형식 오류"
                            errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                            total_processed += 1
                            logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                            await savepoint.rollback()
                            continue
                        
                        response = detail_info.get("response", {})
                        if not response:
                            error_msg = f"상세정보 API 응답 구조 오류"
                            errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                            total_processed += 1
                            logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                            await savepoint.rollback()
                            continue
                        
                        header = response.get("header", {})
                        body = response.get("body", {})
                        detail_result_code = header.get("resultCode", "")
                        detail_result_msg = header.get("resultMsg", "")
                        
                        if detail_result_code != "00":
                            error_msg = f"상세정보 API 오류: {detail_result_msg}"
                            errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                            total_processed += 1
                            logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                            await savepoint.rollback()
                            continue
                        
                        detail_item = body.get("item", {})
                        if not detail_item:
                            error_msg = f"상세정보 API 응답에 데이터 없음"
                            errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                            total_processed += 1
                            logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                            await savepoint.rollback()
                            continue
                        
                    except httpx.HTTPError as http_error:
                        error_msg = f"상세정보 API HTTP 오류: {str(http_error)}"
                        errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                        total_processed += 1
                        logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                        import traceback
                        logger.debug(f"상세 스택: {traceback.format_exc()}")
                        await savepoint.rollback()
                        continue
                    except Exception as e:
                        error_msg = f"상세정보 API 호출 실패: {str(e)}"
                        errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                        total_processed += 1
                        logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                        import traceback
                        logger.debug(f"상세 스택: {traceback.format_exc()}")
                        await savepoint.rollback()
                        continue
                    
                    # 5단계: 데이터 파싱 및 조합
                    try:
                        detail_create = self.parse_apartment_details(
                            basic_info,
                            detail_info,
                            apt_id
                        )
                        
                        if not detail_create:
                            error_msg = f"데이터 파싱 실패"
                            errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                            total_processed += 1
                            logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                            await savepoint.rollback()
                            continue
                        
                    except Exception as parse_error:
                        error_msg = f"파싱 중 예외 발생: {str(parse_error)}"
                        errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                        total_processed += 1
                        logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                        import traceback
                        logger.debug(f"상세 스택: {traceback.format_exc()}")
                        await savepoint.rollback()
                        continue
                    
                    # 6단계: 데이터베이스에 저장 (1대1 관계 보장)
                    try:
                        db_obj, is_created = await apart_detail_crud.create_or_skip(
                            db,
                            obj_in=detail_create
                        )
                        
                        if is_created:
                            total_saved += 1
                            await savepoint.commit()  # savepoint 커밋 (중첩 트랜잭션)
                            
                            # 각 아파트 저장 시 로그 출력
                            logger.info(f"[{idx}/{len(apartments)}] {apt_name} | ✅ 저장 완료 | 현재까지 저장: {total_saved}개")
                            
                            # 주기적 커밋: 10개마다 최상위 트랜잭션 커밋
                            pending_commit_count = total_saved - last_commit_count
                            if pending_commit_count >= commit_interval:
                                try:
                                    await db.commit()  # 최상위 트랜잭션 커밋 (실제 DB 반영)
                                    last_commit_count = total_saved
                                    logger.info(f"💾 커밋 완료: {total_saved}개 저장됨")
                                except Exception as commit_error:
                                    error_msg = f"커밋 실패: {str(commit_error)}"
                                    errors.append(f"주기적 커밋 실패 (저장된 {last_commit_count}개는 유지됨): {str(commit_error)}")
                                    try:
                                        await db.rollback()
                                    except Exception:
                                        pass
                                    logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 커밋 실패: {error_msg}")
                        else:
                            skipped += 1
                            await savepoint.commit()  # savepoint 커밋 (중첩 트랜잭션)
                        
                        total_processed += 1
                        
                    except Exception as save_error:
                        error_msg = f"저장 실패: {str(save_error)}"
                        errors.append(f"아파트 '{apt_name}' (코드: {kapt_code}): {error_msg}")
                        total_processed += 1
                        logger.error(f"[{idx}/{len(apartments)}] {apt_name} | ❌ 실패: {error_msg}")
                        import traceback
                        logger.debug(f"상세 스택: {traceback.format_exc()}")
                        await savepoint.rollback()
                    
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


# 서비스 인스턴스 생성
data_collection_service = DataCollectionService()
