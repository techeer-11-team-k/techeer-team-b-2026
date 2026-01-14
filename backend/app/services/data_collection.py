"""
데이터 수집 서비스

국토교통부 API에서 지역 데이터를 가져와서 데이터베이스에 저장하는 비즈니스 로직
"""
import logging
import asyncio
import sys
import csv
from pathlib import Path
from typing import List, Dict, Any, Optional
from urllib.parse import quote
import httpx
from datetime import datetime, date
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
from app.crud.house_score import house_score as house_score_crud
from app.schemas.state import StateCreate, StateCollectionResponse
from app.schemas.apartment import ApartmentCreate, ApartmentCollectionResponse
from app.schemas.apart_detail import ApartDetailCreate, ApartDetailCollectionResponse
from app.schemas.house_score import HouseScoreCreate, HouseScoreCollectionResponse
from app.schemas.rent import RentCreate

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

# 국토부 전월세 실거래가 API 엔드포인트
MOLIT_RENT_API_URL = "https://apis.data.go.kr/5880000/HomeRentInfoService/getHomeRentInfo"

# 한국부동산원 API 엔드포인트
REB_DATA_URL = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"

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
        
        # 키 값 로그 (보안을 위해 일부만 표시)
        key_preview = self.api_key[:10] + "..." + self.api_key[-10:] if len(self.api_key) > 20 else "***"
        logger.info(f"🔑 MOLIT_API_KEY 로드 완료: {key_preview} (전체 길이: {len(self.api_key)})")
    
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
        # 공공데이터포털 API는 serviceKey를 디코딩된 상태로 받아야 할 수 있음
        # httpx는 자동으로 URL 인코딩하므로, serviceKey를 그대로 전달
        # locatadd_nm: 주소명으로 필터링 (시도명으로 시작하는 모든 주소)
        params = {
            "serviceKey": self.api_key,  # URL 인코딩하지 않음
            "pageNo": str(page_no),
            "numOfRows": str(num_of_rows),
            "type": "json",
            "locatadd_nm": city_name  # 예: "서울특별시"로 검색하면 "서울특별시"로 시작하는 모든 주소 반환
        }
        
        # 디버깅: 실제 전달되는 파라미터 확인
        logger.debug(f"   🔍 요청 파라미터: serviceKey={self.api_key[:10]}..., pageNo={page_no}, numOfRows={num_of_rows}, locatadd_nm={city_name}")
        
        logger.info(f"📡 API 호출: {city_name} (페이지 {page_no}, 요청: {num_of_rows}개)")
        
        # API 호출 전 로그 (디버깅용)
        key_preview = self.api_key[:10] + "..." + self.api_key[-10:] if len(self.api_key) > 20 else "***"
        logger.info(f"   🔑 사용 중인 API 키: {key_preview}")
        logger.info(f"   🌐 API 엔드포인트: {MOLIT_REGION_API_URL}")
        logger.info(f"   📋 파라미터: pageNo={page_no}, numOfRows={num_of_rows}, locatadd_nm={city_name}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                # 공공데이터포털 API는 serviceKey를 URL 인코딩하지 않고 그대로 전달해야 할 수 있음
                # httpx는 자동으로 URL 인코딩하므로, 수동으로 URL을 구성하는 방법도 시도
                # 먼저 일반적인 방법으로 시도
                response = await client.get(MOLIT_REGION_API_URL, params=params)
                
                # 응답 상태 코드 로그
                logger.info(f"   📊 응답 상태 코드: {response.status_code}")
                
                # 403 오류인 경우 상세 정보 로그 (raise_for_status 전에 확인)
                if response.status_code == 403:
                    logger.error(f"   ❌ 403 Forbidden 오류 발생!")
                    logger.error(f"   🔗 요청 URL: {response.url}")
                    logger.error(f"   📄 응답 본문 전체: {response.text}")  # 전체 응답 본문
                    logger.error(f"   📋 응답 헤더: {dict(response.headers)}")
                    # 응답 본문을 JSON으로 파싱 시도
                    try:
                        error_data = response.json()
                        logger.error(f"   📦 응답 JSON: {error_data}")
                    except:
                        logger.error(f"   ⚠️ JSON 파싱 실패 (텍스트 응답): {response.text[:200]}")
                    # 403 오류는 raise_for_status() 전에 상세 정보를 로깅한 후 예외 발생
                
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPStatusError as e:
                # HTTP 오류 상세 로그
                logger.error(f"   ❌ HTTP 오류 발생: {e.response.status_code}")
                logger.error(f"   🔗 요청 URL: {e.request.url}")
                logger.error(f"   📄 응답 본문 전체: {e.response.text}")
                logger.error(f"   📋 응답 헤더: {dict(e.response.headers)}")
                # 응답 본문을 JSON으로 파싱 시도
                try:
                    error_data = e.response.json()
                    logger.error(f"   📦 응답 JSON: {error_data}")
                except:
                    logger.error(f"   ⚠️ JSON 파싱 실패 (텍스트 응답)")
                raise
            
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
                            # 트랜잭션 오류 발생 시 롤백하여 다음 작업이 계속 진행될 수 있도록 함
                            try:
                                await db.rollback()
                            except:
                                pass  # 롤백 실패는 무시 (이미 롤백된 경우 등)
                            
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
                    
                    # API 호출 제한 방지를 위한 딜레이 (0.2초 -> 0.5초로 증가)
                    await asyncio.sleep(0.5)
                
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
                        # 단계별로 찾기: 전체 코드 → 시군구 코드(5자리) → 시도 코드(2자리)
                        region = None
                        
                        if bjd_code:
                            # 1단계: 전체 법정동 코드로 찾기
                            region = await state_crud.get_by_region_code(db, region_code=bjd_code)
                            
                            # 2단계: 시군구 코드(앞 5자리)로 찾기
                            if not region and len(bjd_code) >= 5:
                                sigungu_code = bjd_code[:5] + '00000'  # 시군구 코드 + '00000'
                                region = await state_crud.get_by_region_code(db, region_code=sigungu_code)
                            
                            # 3단계: 시도 코드(앞 2자리)로 찾기
                            if not region and len(bjd_code) >= 2:
                                sido_code = bjd_code[:2] + '00000000'  # 시도 코드 + '00000000'
                                region = await state_crud.get_by_region_code(db, region_code=sido_code)
                        
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
                        # 트랜잭션 오류 발생 시 롤백하여 다음 작업이 계속 진행될 수 있도록 함
                        try:
                            await db.rollback()
                        except:
                            pass  # 롤백 실패는 무시 (이미 롤백된 경우 등)
                        
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
                
                # API 호출 제한 방지를 위한 딜레이 (0.2초 -> 0.5초로 증가)
                await asyncio.sleep(0.5)
            
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

    async def fetch_apartment_basic_info(self, kapt_code: str, max_retries: int = 3) -> Dict[str, Any]:
        """
        국토부 API에서 아파트 기본정보 가져오기
        
        Args:
            kapt_code: 국토부 단지코드
            max_retries: 최대 재시도 횟수 (기본값: 3)
        
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
        
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(MOLIT_APARTMENT_BASIC_API_URL, params=params)
                    
                    # 429 Too Many Requests 오류 처리
                    if response.status_code == 429:
                        wait_time = (2 ** attempt) * 10  # 10초, 20초, 40초로 증가 (5초 → 10초로 변경)
                        if attempt < max_retries - 1:
                            logger.warning(f"⚠️ 429 오류 발생 (시도 {attempt + 1}/{max_retries}): {wait_time}초 대기 후 재시도...")
                            await asyncio.sleep(wait_time)
                            continue
                        else:
                            response.raise_for_status()
                    
                    response.raise_for_status()
                    data = response.json()
                    return data
                    
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 10  # 10초, 20초, 40초로 증가 (5초 → 10초로 변경)
                    logger.warning(f"⚠️ 429 오류 발생 (시도 {attempt + 1}/{max_retries}): {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                raise
            except Exception as e:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 2
                    logger.warning(f"⚠️ API 호출 실패 (시도 {attempt + 1}/{max_retries}): {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                raise
        
        # 모든 재시도 실패
        raise httpx.HTTPError(f"API 호출 실패: 최대 재시도 횟수({max_retries}) 초과")
    
    async def fetch_apartment_detail_info(self, kapt_code: str, max_retries: int = 3) -> Dict[str, Any]:
        """
        국토부 API에서 아파트 상세정보 가져오기
        
        Args:
            kapt_code: 국토부 단지코드
            max_retries: 최대 재시도 횟수 (기본값: 3)
        
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
        
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(MOLIT_APARTMENT_DETAIL_API_URL, params=params)
                    
                    # 429 Too Many Requests 오류 처리
                    if response.status_code == 429:
                        wait_time = (2 ** attempt) * 10  # 10초, 20초, 40초로 증가 (5초 → 10초로 변경)
                        if attempt < max_retries - 1:
                            logger.warning(f"⚠️ 429 오류 발생 (시도 {attempt + 1}/{max_retries}): {wait_time}초 대기 후 재시도...")
                            await asyncio.sleep(wait_time)
                            continue
                        else:
                            response.raise_for_status()
                    
                    response.raise_for_status()
                    data = response.json()
                    return data
                    
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 10  # 10초, 20초, 40초로 증가 (5초 → 10초로 변경)
                    logger.warning(f"⚠️ 429 오류 발생 (시도 {attempt + 1}/{max_retries}): {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                raise
            except Exception as e:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 2
                    logger.warning(f"⚠️ API 호출 실패 (시도 {attempt + 1}/{max_retries}): {wait_time}초 대기 후 재시도...")
                    await asyncio.sleep(wait_time)
                    continue
                raise
        
        # 모든 재시도 실패
        raise httpx.HTTPError(f"API 호출 실패: 최대 재시도 횟수({max_retries}) 초과")
    
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
        if value is None or value == "":
            return None
        try:
            if isinstance(value, str):
                # 빈 문자열이나 공백 제거
                value = value.strip()
                if not value:
                    return None
            return float(value)
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
                        await asyncio.sleep(2.0)  # API 호출 제한 방지 (0.5초 -> 2.0초로 증가)
                        
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
                        await asyncio.sleep(2.0)  # API 호출 제한 방지 (0.5초 -> 2.0초로 증가)
                        
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
            logger.error(f"❌ 전월세 거래 데이터 파싱 실패: {e}", exc_info=True)
            return None
    
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
        errors = []
        
        # 에러 제한 설정
        MAX_CONSECUTIVE_ERRORS = 10  # 연속 에러 최대 횟수
        MAX_ERROR_RATIO = 0.5  # 전체 에러 비율 최대값 (50%)
        MIN_PROCESSED_FOR_RATIO_CHECK = 10  # 에러 비율 체크를 위한 최소 처리 횟수
        consecutive_errors = 0  # 연속 에러 카운터
        total_processed = 0  # 처리한 지역 수
        
        try:
            # REB_API_KEY 확인
            if not settings.REB_API_KEY:
                raise ValueError("REB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
            
            logger.info("=" * 60)
            logger.info("🏠 부동산 지수 데이터 수집 시작")
            logger.info("=" * 60)
            
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
                    errors=["STATES 테이블에 데이터가 없습니다."],
                    message="STATES 테이블에 데이터가 없습니다."
                )
            
            logger.info(f"📊 총 {len(states)}개의 지역 코드 발견")
            
            # 기본 API 파라미터
            STATBL_ID = "A_2024_00045"
            DTACYCLE_CD = "MM"
            
            # 진행 상황 출력 간격 설정
            PROGRESS_INTERVAL = 50  # 50개 지역마다 진행 상황 출력
            region_count = 0  # 처리한 지역 수 카운터
            
            for state in states:
                region_count += 1
                # 에러 제한 체크 (실제 API 호출 에러만 카운트)
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                    error_msg = f"❌ 연속 API 호출 에러 {consecutive_errors}회 발생. 수집을 중단합니다."
                    logger.error(error_msg)
                    errors.append(error_msg)
                    break
                
                # 전체 에러 비율 체크 (최소 처리 횟수 이상일 때만 체크)
                if total_processed >= MIN_PROCESSED_FOR_RATIO_CHECK and len(errors) > 0:
                    error_ratio = len(errors) / total_processed
                    if error_ratio >= MAX_ERROR_RATIO:
                        error_msg = f"❌ 전체 API 호출 에러 비율 {error_ratio:.1%} ({len(errors)}/{total_processed})가 너무 높습니다. 수집을 중단합니다."
                        logger.error(error_msg)
                        errors.append(error_msg)
                        break
                
                region_id, region_code = state
                region_code_str = str(region_code)
                
                # region_code 길이 확인 (에러가 아닌 건너뛰기)
                if len(region_code_str) < 5:
                    logger.debug(f"   ⏭️ {region_code_str}: region_code 길이가 5자리 미만 - 건너뜀")
                    continue
                
                # region_code 앞 5자리 추출
                region_code_prefix = region_code_str[:5]
                
                # CSV에서 area_code 찾기 (에러가 아닌 건너뛰기)
                area_code = self._get_area_code_from_csv(region_code_prefix)
                if not area_code:
                    logger.debug(f"   ⏭️ {region_code_str}: area_code를 찾을 수 없음 - 건너뜀")
                    continue
                
                # API 호출 시작 - total_processed 카운트는 실제 API 호출 시도 시에만 증가
                total_processed += 1
                
                # API 호출 파라미터 (페이지네이션: 최대 1000개씩)
                p_size = 1000  # API 최대 페이지 크기
                first_params = {
                    "KEY": settings.REB_API_KEY,
                    "Type": "json",
                    "pIndex": 1,
                    "pSize": p_size,
                    "STATBL_ID": STATBL_ID,
                    "DTACYCLE_CD": DTACYCLE_CD,
                    "CLS_ID": str(area_code)
                }
                
                try:
                    first_response = await self.fetch_with_retry(REB_DATA_URL, first_params)
                    
                    # API 응답 구조 확인 (디버깅용)
                    if not first_response or not isinstance(first_response, dict):
                        consecutive_errors += 1
                        error_msg = f"{region_code_str}: API 응답이 유효하지 않습니다 (응답 타입: {type(first_response)}) [area_code: {area_code}]"
                        errors.append(error_msg)
                        logger.warning(f"   ⚠️ {error_msg} (연속 에러: {consecutive_errors}/{MAX_CONSECUTIVE_ERRORS})")
                        continue
                    
                    # API 응답 구조: {"SttsApiTblData": [{"head": [...]}, {"row": [...]}]}
                    stts_data = first_response.get("SttsApiTblData", [])
                    if not isinstance(stts_data, list) or len(stts_data) < 2:
                        consecutive_errors += 1
                        error_msg = f"{region_code_str}: API 응답 구조가 올바르지 않습니다 [area_code: {area_code}]"
                        errors.append(error_msg)
                        logger.warning(f"   ⚠️ {error_msg} (연속 에러: {consecutive_errors}/{MAX_CONSECUTIVE_ERRORS})")
                        continue
                    
                    # RESULT 정보 및 전체 개수 추출 (head 데이터에서)
                    head_data = stts_data[0].get("head", [])
                    result_data = {}
                    total_count = 0
                    
                    for item in head_data:
                        if isinstance(item, dict):
                            # RESULT 정보 추출
                            if "RESULT" in item:
                                result_data = item["RESULT"]
                            # 전체 개수 추출 (list_total_count 또는 totalCount)
                            if "list_total_count" in item:
                                total_count = int(item["list_total_count"])
                            elif "totalCount" in item:
                                total_count = int(item["totalCount"])
                    
                    response_code = result_data.get("CODE", "UNKNOWN")
                    response_message = result_data.get("MESSAGE", "")
                    
                    # 응답이 성공인지 확인
                    if response_code != "INFO-000":
                        consecutive_errors += 1
                        error_msg = f"{region_code_str}: API 응답 오류 [CODE: {response_code}]"
                        if response_message:
                            error_msg += f" - {response_message}"
                        error_msg += f" [area_code: {area_code}]"
                        
                        errors.append(error_msg)
                        logger.warning(f"   ⚠️ {error_msg} (연속 에러: {consecutive_errors}/{MAX_CONSECUTIVE_ERRORS})")
                        continue
                    
                    # 성공 시 연속 에러 카운터 리셋
                    consecutive_errors = 0
                    
                    # 첫 번째 페이지 데이터 수집
                    all_items = []
                    
                    # 첫 번째 페이지 ROW 데이터 추출
                    row_data = stts_data[1].get("row", [])
                    if not isinstance(row_data, list):
                        row_data = [row_data] if row_data else []
                    all_items.extend(row_data)
                    
                    # 전체 개수가 페이지 크기보다 크면 추가 페이지 처리
                    if total_count > p_size:
                        total_pages = (total_count // p_size) + (1 if total_count % p_size > 0 else 0)
                        logger.info(f"   📄 {region_code_str}: 총 {total_count}개 데이터, {total_pages}페이지 수집 시작")
                        
                        # 추가 페이지 수집
                        for page_index in range(2, total_pages + 1):
                            try:
                                page_params = {
                                    "KEY": settings.REB_API_KEY,
                                    "Type": "json",
                                    "pIndex": page_index,
                                    "pSize": p_size,
                                    "STATBL_ID": STATBL_ID,
                                    "DTACYCLE_CD": DTACYCLE_CD,
                                    "CLS_ID": str(area_code)
                                }
                                
                                page_response = await self.fetch_with_retry(REB_DATA_URL, page_params)
                                
                                if not page_response or not isinstance(page_response, dict):
                                    logger.warning(f"   ⚠️ {region_code_str}: 페이지 {page_index} 응답 오류 - 건너뜀")
                                    continue
                                
                                page_stts_data = page_response.get("SttsApiTblData", [])
                                if not isinstance(page_stts_data, list) or len(page_stts_data) < 2:
                                    logger.warning(f"   ⚠️ {region_code_str}: 페이지 {page_index} 구조 오류 - 건너뜀")
                                    continue
                                
                                # 페이지 응답 성공 확인
                                page_head_data = page_stts_data[0].get("head", [])
                                page_result_data = {}
                                for item in page_head_data:
                                    if isinstance(item, dict) and "RESULT" in item:
                                        page_result_data = item["RESULT"]
                                        break
                                
                                page_response_code = page_result_data.get("CODE", "UNKNOWN")
                                if page_response_code != "INFO-000":
                                    logger.warning(f"   ⚠️ {region_code_str}: 페이지 {page_index} API 오류 [CODE: {page_response_code}] - 건너뜀")
                                    continue
                                
                                # 페이지 데이터 추가
                                page_row_data = page_stts_data[1].get("row", [])
                                if not isinstance(page_row_data, list):
                                    page_row_data = [page_row_data] if page_row_data else []
                                all_items.extend(page_row_data)
                                
                                # API 호출 제한 방지
                                await asyncio.sleep(0.1)
                                
                            except Exception as e:
                                logger.warning(f"   ⚠️ {region_code_str}: 페이지 {page_index} 처리 오류 - {str(e)} - 건너뜀")
                                continue
                    
                    logger.info(f"   📊 {region_code_str}: {len(all_items)}개 데이터 수집 완료")
                    
                    # API 응답 데이터 분석: 월별 분포 확인
                    months_found = []
                    for item in all_items:
                        wrttime = item.get("WRTTIME_IDTFR_ID", "")
                        if wrttime and len(wrttime) >= 6:
                            base_ym = wrttime[:6]
                            if base_ym not in months_found:
                                months_found.append(base_ym)
                    
                    months_found_sorted = sorted(months_found)
                    
                    # 홀수/짝수 달 분석
                    odd_months = []
                    even_months = []
                    for month_str in months_found_sorted:
                        if len(month_str) >= 6:
                            month_num = int(month_str[4:6])
                            if month_num % 2 == 1:
                                odd_months.append(month_str)
                            else:
                                even_months.append(month_str)
                    
                    # 월별 분석 로깅
                    logger.info(f"   📅 {region_code_str}: 월별 분석 - 총 {len(months_found_sorted)}개 월 발견")
                    logger.info(f"      홀수 달: {len(odd_months)}개 ({', '.join(odd_months[:10])}{'...' if len(odd_months) > 10 else ''})")
                    logger.info(f"      짝수 달: {len(even_months)}개 ({', '.join(even_months[:10])}{'...' if len(even_months) > 10 else ''})")
                    
                    if len(months_found_sorted) > 0:
                        logger.info(f"      월 범위: {months_found_sorted[0]} ~ {months_found_sorted[-1]}")
                    
                    total_fetched += len(all_items)
                    
                    # 저장 전 카운트 저장
                    saved_before = total_saved
                    skipped_before = skipped
                    
                    # base_ym으로 정렬하여 저장 (전월 데이터 계산을 위해)
                    # WRTTIME_IDTFR_ID의 앞 6자리가 base_ym이므로 이를 기준으로 정렬
                    def get_base_ym_for_sort(item):
                        wrttime = item.get("WRTTIME_IDTFR_ID", "")
                        return wrttime[:6] if len(wrttime) >= 6 else wrttime
                    
                    all_items_sorted = sorted(all_items, key=get_base_ym_for_sort)
                    
                    # 처리 전 월별 통계
                    months_before_processing = set()
                    for item in all_items_sorted:
                        wrttime = item.get("WRTTIME_IDTFR_ID", "")
                        if wrttime and len(wrttime) >= 6:
                            base_ym = wrttime[:6]
                            months_before_processing.add(base_ym)
                    
                    logger.info(f"   🔍 {region_code_str}: 처리 전 월 개수 - {len(months_before_processing)}개, 총 항목 수: {len(all_items_sorted)}개")
                    
                    # 각 항목 처리
                    processed_months = set()
                    skipped_months = set()
                    saved_items_by_month = {}  # 월별 저장된 항목 추적
                    skipped_items_by_month = {}  # 월별 건너뛴 항목 추적
                    index_type_counts = {}  # index_type별 개수 추적
                    total_items_processed = 0  # 실제 처리된 항목 수
                    items_by_month_type = {}  # 월별 index_type별 항목 수
                    for item in all_items_sorted:
                        try:
                            # 필드 매핑
                            itm_nm = item.get("ITM_NM", "").strip()
                            wrttime_idtfr_id = item.get("WRTTIME_IDTFR_ID", "").strip()
                            dta_val = item.get("DTA_VAL")
                            statbl_id = item.get("STATBL_ID", STATBL_ID).strip()
                            
                            # 필수 필드 확인
                            if not itm_nm or not wrttime_idtfr_id or dta_val is None:
                                skipped_months.add(wrttime_idtfr_id[:6] if len(wrttime_idtfr_id) >= 6 else "UNKNOWN")
                                continue
                            
                            # base_ym 형식 변환 (YYYYMM)
                            base_ym = wrttime_idtfr_id[:6] if len(wrttime_idtfr_id) >= 6 else wrttime_idtfr_id
                            
                            # index_value 변환
                            index_value = self.parse_float(dta_val)
                            if index_value is None:
                                skipped_months.add(base_ym)
                                continue
                            
                            processed_months.add(base_ym)
                            total_items_processed += 1
                            
                            # index_type 변환 (ITM_NM -> APT/HOUSE/ALL)
                            index_type = "APT"  # 기본값
                            if "단독" in itm_nm or "주택" in itm_nm:
                                index_type = "HOUSE"
                            elif "전체" in itm_nm or "ALL" in itm_nm.upper():
                                index_type = "ALL"
                            
                            # 월별 index_type별 항목 수 추적
                            month_type_key = f"{base_ym}_{index_type}"
                            if month_type_key not in items_by_month_type:
                                items_by_month_type[month_type_key] = 0
                            items_by_month_type[month_type_key] += 1
                            
                            # index_type별 개수 추적
                            key = f"{base_ym}_{index_type}"
                            if key not in index_type_counts:
                                index_type_counts[key] = 0
                            index_type_counts[key] += 1
                            
                            # 전월 데이터 조회하여 변동률 계산
                            prev_score = await house_score_crud.get_previous_month(
                                db,
                                region_id=region_id,
                                base_ym=base_ym,
                                index_type=index_type
                            )
                            
                            index_change_rate = None
                            if prev_score and prev_score.index_value:
                                # Decimal 타입을 float로 변환
                                prev_value = float(prev_score.index_value)
                                index_change_rate = index_value - prev_value
                            
                            # HouseScoreCreate 생성
                            house_score_create = HouseScoreCreate(
                                region_id=region_id,
                                base_ym=base_ym,
                                index_value=index_value,
                                index_change_rate=index_change_rate,
                                index_type=index_type,
                                data_source=statbl_id
                            )
                            
                            # 저장 또는 건너뛰기
                            _, is_created = await house_score_crud.create_or_skip(
                                db,
                                obj_in=house_score_create
                            )
                            
                            if is_created:
                                total_saved += 1
                                if base_ym not in saved_items_by_month:
                                    saved_items_by_month[base_ym] = []
                                saved_items_by_month[base_ym].append(index_type)
                            else:
                                skipped += 1
                                if base_ym not in skipped_items_by_month:
                                    skipped_items_by_month[base_ym] = []
                                skipped_items_by_month[base_ym].append(index_type)
                        
                        except Exception as e:
                            logger.warning(f"   ⚠️ {region_code_str}: 항목 처리 오류 - {e}")
                            continue
                    
                    # 처리 후 통계 출력
                    logger.info(f"   📊 {region_code_str}: 실제 처리된 항목 수 - {total_items_processed}개")
                    
                    # 월별 index_type별 통계
                    odd_month_items = sum(1 for key in items_by_month_type.keys() if len(key) >= 6 and int(key[4:6]) % 2 == 1)
                    even_month_items = sum(1 for key in items_by_month_type.keys() if len(key) >= 6 and int(key[4:6]) % 2 == 0)
                    logger.info(f"   📈 {region_code_str}: 처리된 항목 (월+타입 조합) - 홀수 달: {odd_month_items}개, 짝수 달: {even_month_items}개")
                    
                    # 저장 결과 출력
                    region_saved = total_saved - saved_before
                    region_skipped = skipped - skipped_before
                    logger.info(f"   💾 {region_code_str}: 저장 완료 (저장: {region_saved}, 건너뜀: {region_skipped})")
                    
                    # 처리 후 월별 통계
                    processed_months_sorted = sorted(processed_months)
                    skipped_months_sorted = sorted(skipped_months)
                    
                    processed_odd = [m for m in processed_months_sorted if len(m) >= 6 and int(m[4:6]) % 2 == 1]
                    processed_even = [m for m in processed_months_sorted if len(m) >= 6 and int(m[4:6]) % 2 == 0]
                    
                    logger.info(f"   ✅ {region_code_str}: 처리된 월 - {len(processed_months_sorted)}개 (홀수: {len(processed_odd)}, 짝수: {len(processed_even)})")
                    if len(processed_months_sorted) > 0:
                        logger.info(f"      처리된 월 목록: {', '.join(processed_months_sorted[:15])}{'...' if len(processed_months_sorted) > 15 else ''}")
                    
                    if len(skipped_months_sorted) > 0:
                        logger.info(f"   ⚠️ {region_code_str}: 필터링된 월 - {len(skipped_months_sorted)}개")
                    
                    # 저장/건너뛴 항목 상세 분석
                    saved_months_odd = [m for m in saved_items_by_month.keys() if len(m) >= 6 and int(m[4:6]) % 2 == 1]
                    saved_months_even = [m for m in saved_items_by_month.keys() if len(m) >= 6 and int(m[4:6]) % 2 == 0]
                    
                    logger.info(f"   💾 {region_code_str}: 저장된 월 - {len(saved_items_by_month)}개 (홀수: {len(saved_months_odd)}, 짝수: {len(saved_months_even)})")
                    
                    # index_type별 통계
                    apt_count = sum(1 for types in saved_items_by_month.values() for t in types if t == "APT")
                    house_count = sum(1 for types in saved_items_by_month.values() for t in types if t == "HOUSE")
                    all_count = sum(1 for types in saved_items_by_month.values() for t in types if t == "ALL")
                    logger.info(f"   📊 {region_code_str}: 저장된 index_type - APT: {apt_count}, HOUSE: {house_count}, ALL: {all_count}")
                    
                    # 건너뛴 항목 분석 (중복 체크로 인한 건너뛰기)
                    if len(skipped_items_by_month) > 0:
                        skipped_months_odd = [m for m in skipped_items_by_month.keys() if len(m) >= 6 and int(m[4:6]) % 2 == 1]
                        skipped_months_even = [m for m in skipped_items_by_month.keys() if len(m) >= 6 and int(m[4:6]) % 2 == 0]
                        logger.info(f"   ⏭️ {region_code_str}: 건너뛴 월 - {len(skipped_items_by_month)}개 (홀수: {len(skipped_months_odd)}, 짝수: {len(skipped_months_even)})")
                        
                        # 건너뛴 항목 샘플 (처음 5개)
                        skipped_samples = list(skipped_items_by_month.items())[:5]
                        for month, types in skipped_samples:
                            logger.info(f"      건너뛴 예시: {month} - {', '.join(types)}")
                    
                    # 진행 상황 출력 (일정 간격마다 또는 마지막 지역)
                    if region_count % PROGRESS_INTERVAL == 0 or region_count == len(states):
                        progress_pct = (region_count / len(states)) * 100
                        logger.info(f"   📈 진행 상황: {region_count}/{len(states)} 지역 처리 ({progress_pct:.1f}%) | 저장: {total_saved}, 건너뜀: {skipped}, 수집: {total_fetched}")
                    
                    # 지역 간 딜레이 (API 호출 제한 방지)
                    await asyncio.sleep(0.1)
                
                except Exception as e:
                    consecutive_errors += 1
                    error_msg = f"{region_code_str}: API 호출 오류 - {str(e)}"
                    errors.append(error_msg)
                    logger.warning(f"   ⚠️ {error_msg} (연속 에러: {consecutive_errors}/{MAX_CONSECUTIVE_ERRORS})")
                    
                    # 에러 제한 체크
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        logger.error(f"❌ 연속 에러 {consecutive_errors}회 발생. 수집을 중단합니다.")
                        break
                    continue
            
            logger.info("=" * 60)
            logger.info(f"🎉 부동산 지수 데이터 수집 완료 (저장: {total_saved}, 건너뜀: {skipped})")
            logger.info("=" * 60)
            
            return HouseScoreCollectionResponse(
                success=True,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=errors[:100],
                message=f"부동산 지수 데이터 수집 완료: {total_saved}개 저장, {skipped}개 건너뜀"
            )
        
        except ValueError as e:
            logger.error(f"❌ 설정 오류: {e}")
            return HouseScoreCollectionResponse(
                success=False,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=[str(e)],
                message=f"설정 오류: {str(e)}"
            )
        except Exception as e:
            logger.error(f"❌ 치명적 오류 발생: {e}", exc_info=True)
            return HouseScoreCollectionResponse(
                success=False,
                total_fetched=total_fetched,
                total_saved=total_saved,
                skipped=skipped,
                errors=[str(e)],
                message=f"오류: {str(e)}"
            )

# 서비스 인스턴스 생성
data_collection_service = DataCollectionService()
