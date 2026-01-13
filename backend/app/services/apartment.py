"""
아파트 관련 비즈니스 로직

외부 API를 호출하여 아파트 정보를 가져옵니다.
"""
import httpx
import logging
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundException, ExternalAPIException
from app.schemas.apartment import AptBasicInfo, AptDetailInfo

# 로깅 설정
logger = logging.getLogger(__name__)


#아파트 관련 서비스
class ApartmentService:

    # 공동주택단지 상세정보 서비스 Base URL
    MOLIT_API_BASE_URL = "https://apis.data.go.kr/1613000"
    
    def _safe_get_keys(self, data: Any, max_keys: int = None) -> str:
        """안전하게 딕셔너리의 키를 추출하여 문자열로 반환"""
        try:
            if isinstance(data, dict):
                keys = list(data.keys())
                if max_keys:
                    keys = keys[:max_keys]
                return str(keys)
        except (AttributeError, TypeError):
            pass
        return f"<{type(data).__name__}>"
    
    def _parse_and_log_response(self, api_response: Dict[str, Any], kapt_code: str, info_type: str) -> Dict[str, Any]:
        """API 응답 파싱 및 로깅 (공통 로직)"""
        try:
            item = self._parse_api_response(api_response)
            item_keys_str = self._safe_get_keys(item, max_keys=15)
            logger.info(f"{info_type} API 응답 파싱 성공 (단지코드: {kapt_code}). 응답 키: {item_keys_str}")
            return item
        except NotFoundException:
            api_keys_str = self._safe_get_keys(api_response)
            logger.warning(f"아파트 {info_type}를 찾을 수 없음 (단지코드: {kapt_code}). API 응답 구조: {api_keys_str}")
            raise NotFoundException(
                f"아파트를 찾을 수 없습니다. (단지코드: {kapt_code}). "
                f"API 응답 구조: {api_keys_str}"
            )
    
    def _convert_to_schema(self, item: Dict[str, Any], schema_class: type, kapt_code: str, info_type: str):
        """스키마로 변환 및 에러 처리 (공통 로직)"""
        try:
            return schema_class(**item)
        except Exception as e:
            error_type = type(e).__name__
            error_message = str(e)
            item_keys = self._safe_get_keys(item)
            
            logger.error(
                f"{info_type} 스키마 변환 실패 (단지코드: {kapt_code}): {error_type}",
                exc_info=True,
                extra={
                    "kapt_code": kapt_code,
                    "error_type": error_type,
                    "error_message": error_message,
                    "item_type": type(item).__name__ if item is not None else "None",
                    "item_keys": item_keys
                }
            )
            
            # Pydantic 검증 에러인 경우 더 자세한 정보 제공
            error_msg = error_message
            if hasattr(e, 'errors'):
                error_details = [f"{err.get('loc', [])}: {err.get('msg', '')}" for err in getattr(e, 'errors', [])]
                error_msg = f"스키마 검증 실패: {', '.join(error_details)}"
            
            raise ExternalAPIException(f"API 응답 파싱 실패: {error_msg}")
    
    def _handle_unexpected_error(self, e: Exception, kapt_code: str, info_type: str):
        """예상치 못한 예외 처리 (공통 로직)"""
        error_type = type(e).__name__
        error_message = str(e)
        
        logger.error(
            f"{info_type} 조회 중 예상치 못한 에러 (단지코드: {kapt_code}): {error_type}",
            exc_info=True,
            extra={
                "kapt_code": kapt_code,
                "error_type": error_type,
                "error_message": error_message
            }
        )
        
        raise ExternalAPIException(f"아파트 {info_type} 조회 중 오류 발생: {error_message}")
    
    def _parse_api_response(self, api_response: Dict[str, Any]) -> Dict[str, Any]:
        """
        공공데이터포털 API 응답 파싱 공통 메서드
        
        Args:
            api_response: 외부 API 응답 딕셔너리
        
        Returns:
            파싱된 item 딕셔너리
        
        Raises:
            NotFoundException: 응답에 데이터가 없는 경우
            ExternalAPIException: 응답 구조가 예상과 다른 경우
        
        Note:
            API 응답의 키가 대문자(RESPONSE, BODY, ITEM) 또는 소문자(response, body, item)일 수 있으므로
            대소문자를 구분하지 않고 처리합니다.
        """
        def _get_case_insensitive_key(data: Dict[str, Any], key: str) -> Optional[str]:
            """대소문자 구분 없이 키 찾기"""
            if not isinstance(data, dict):
                return None
            key_upper = key.upper()
            for k in data.keys():
                if k.upper() == key_upper:
                    return k
            return None
        
        # response 키 찾기 (대소문자 구분 없이)
        response_key = _get_case_insensitive_key(api_response, "response")
        if not response_key:
            api_keys_str = str(list(api_response.keys())) if api_response else "빈 응답"
            raise ExternalAPIException(f"예상하지 못한 API 응답 구조: {api_keys_str}")
        
        response = api_response[response_key]
        
        # response가 딕셔너리인지 확인
        if not isinstance(response, dict):
            raise ExternalAPIException(f"API 응답의 response가 딕셔너리가 아닙니다. 타입: {type(response).__name__}")
        
        # header 키 찾기 (대소문자 구분 없이)
        header_key = _get_case_insensitive_key(response, "header")
        if header_key:
            header = response[header_key]
            # header가 딕셔너리인지 확인
            if isinstance(header, dict):
                # resultCode, resultMsg 찾기 (대소문자 구분 없이)
                result_code_key = _get_case_insensitive_key(header, "resultCode")
                result_msg_key = _get_case_insensitive_key(header, "resultMsg")
                
                result_code = header.get(result_code_key, "") if result_code_key else ""
                result_msg = header.get(result_msg_key, "") if result_msg_key else ""
                
                # 에러 응답인 경우
                if result_code and result_code != "00":  # "00"은 성공 코드
                    error_msg = f"API 오류 (코드: {result_code}): {result_msg or '알 수 없는 오류'}"
                    if result_code in ["03", "05"]:  # 데이터 없음 관련 코드
                        raise NotFoundException("아파트")
                    else:
                        raise ExternalAPIException(error_msg)
        
        # body 키 찾기 (대소문자 구분 없이)
        body_key = _get_case_insensitive_key(response, "body")
        if not body_key:
            raise NotFoundException("아파트")
        
        body = response[body_key]
        
        # body가 딕셔너리인지 확인
        if not isinstance(body, dict):
            raise ExternalAPIException(f"API 응답의 body가 딕셔너리가 아닙니다. 타입: {type(body).__name__}")
        
        # items 또는 item 키 찾기 (대소문자 구분 없이)
        items_key = _get_case_insensitive_key(body, "items")
        item_key = _get_case_insensitive_key(body, "item")
        
        item = None
        
        # items가 있으면 items 안의 item을 확인
        if items_key:
            items = body[items_key]
            if not items:
                raise NotFoundException("아파트")
            
            # items가 딕셔너리면 그 안에서 item 찾기
            if isinstance(items, dict):
                item_in_items_key = _get_case_insensitive_key(items, "item")
                if item_in_items_key:
                    item = items[item_in_items_key]
                else:
                    # items 자체가 item인 경우 (items가 실제로는 item 데이터)
                    item = items
            elif isinstance(items, list):
                # items가 리스트인 경우
                item = items
            else:
                # items가 예상치 못한 타입인 경우
                raise ExternalAPIException(f"API 응답의 items가 예상치 못한 타입입니다. 타입: {type(items).__name__}")
        elif item_key:
            # body에 직접 item이 있는 경우
            item = body[item_key]
        else:
            raise NotFoundException("아파트")
        
        # item이 None이거나 빈 리스트인 경우
        if not item:
            raise NotFoundException("아파트")
        
        # item이 리스트면 첫 번째 요소 반환
        if isinstance(item, list):
            if len(item) == 0:
                raise NotFoundException("아파트")
            item = item[0]
        
        return item
    
    async def _call_external_api(
        self,
        url: str,
        params: Dict[str, Any],
        api_key: Optional[str] = None,
        api_key_param_name: str = "ServiceKey"  # 외부 API가 요구하는 파라미터 이름
    ) -> Dict[str, Any]:

        # API 키가 없으면 설정에서 가져오기
        if not api_key:
            api_key = settings.MOLIT_API_KEY
        if not api_key:
            raise ExternalAPIException("API 키가 설정되지 않았습니다. .env 파일에 MOLIT_API_KEY를 설정하세요.")
        
        # API 키가 이미 params에 있으면 덮어쓰지 않음 (각 API가 다른 이름을 사용할 수 있음)
        if api_key_param_name not in params:
            params[api_key_param_name] = api_key
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params, follow_redirects=True) #get 요청, 리다이렉트 자동 처리
                response.raise_for_status()  # HTTP 에러 발생 시 예외 발생
                
                # 응답 형식 확인 및 파싱
                content_type = response.headers.get("content-type", "").lower()
                
                if "application/json" in content_type or "text/json" in content_type:
                    json_response = response.json()
                    # 디버깅: API 응답 로깅
                    logger.debug(f"API 응답: {json_response}")
                    return json_response
                elif "application/xml" in content_type or "text/xml" in content_type:
                    # XML 응답인 경우 (공공데이터포털은 XML도 지원)
                    # XML을 JSON으로 변환 시도
                    import xml.etree.ElementTree as ET
                    root = ET.fromstring(response.text)
                    # 간단한 XML to dict 변환 (공공데이터포털 형식에 맞춤)
                    raise ExternalAPIException(
                        "API가 XML 형식으로 응답했습니다. JSON 형식을 요청하거나 XML 파싱 로직을 추가하세요."
                    )
                else:
                    raise ExternalAPIException(
                        f"지원하지 않는 응답 형식입니다. Content-Type: {content_type}"
                    )
                    
        #에러처리
        except httpx.HTTPError as e:
            raise ExternalAPIException(f"외부 API 호출 실패: {str(e)}")
        except Exception as e:
            raise ExternalAPIException(f"API 처리 중 오류 발생: {str(e)}")
    
#AptBasisInfoServiceV4

    async def get_apartment_basic_info(
        self,
        db: AsyncSession,
        *,
        kapt_code: str
    ) -> AptBasicInfo:
        try:
            # 입력 검증
            if not kapt_code or not kapt_code.strip():
                raise ExternalAPIException("단지 코드(kapt_code)가 필요합니다.")
            
            # 전체 URL 구성: Base URL + Service + Operation
            url = f"{self.MOLIT_API_BASE_URL}/AptBasisInfoServiceV4//getAphusBassInfoV4"
            params = {"kaptCode": kapt_code.strip()}
            
            # 외부 API 호출 (기본정보는 serviceKey 소문자 s 사용)
            api_response = await self._call_external_api(url, params, api_key_param_name="serviceKey")
            
            # API 응답 파싱 및 로깅
            item = self._parse_and_log_response(api_response, kapt_code, "기본정보")
            
            # 스키마로 변환
            return self._convert_to_schema(item, AptBasicInfo, kapt_code, "기본정보")
                
        except (NotFoundException, ExternalAPIException):
            raise
        except Exception as e:
            self._handle_unexpected_error(e, kapt_code, "기본정보")
    


    
    async def get_apartment_detail_info(
        self,
        db: AsyncSession,
        *,
        kapt_code: str
    ) -> AptDetailInfo:
        try:
            # 입력 검증
            if not kapt_code or not kapt_code.strip():
                raise ExternalAPIException("단지 코드(kapt_code)가 필요합니다.")
            
            # 전체 URL 구성: Base URL + Service + Operation
            url = f"{self.MOLIT_API_BASE_URL}/AptBasisInfoServiceV4/getAphusDtlInfoV4"
            params = {"kaptCode": kapt_code.strip()}
            
            # 외부 API 호출 (상세정보는 기본 ServiceKey 사용)
            api_response = await self._call_external_api(url, params)
            
            # API 응답 파싱 및 로깅
            item = self._parse_and_log_response(api_response, kapt_code, "상세정보")
            
            # 스키마로 변환
            return self._convert_to_schema(item, AptDetailInfo, kapt_code, "상세정보")
                
        except (NotFoundException, ExternalAPIException):
            raise
        except Exception as e:
            self._handle_unexpected_error(e, kapt_code, "상세정보")


# 싱글톤 인스턴스
apartment_service = ApartmentService()