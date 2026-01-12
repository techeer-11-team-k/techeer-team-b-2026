"""
아파트 관련 비즈니스 로직

외부 API를 호출하여 아파트 정보를 가져옵니다.
"""
import httpx
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundException, ExternalAPIException
from app.schemas.apartment import AptBasicInfo, AptDetailInfo


#아파트 관련 서비스
class ApartmentService:

    # 공동주택단지 상세정보 서비스 Base URL
    MOLIT_API_BASE_URL = "https://apis.data.go.kr/1613000/"
    
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
        """
        if "response" in api_response and "body" in api_response["response"]:
            body = api_response["response"]["body"]
            items = body.get("items", {})
            
            # item이 리스트인지 단일 객체인지 확인
            item = items.get("item")
            if isinstance(item, list):
                item = item[0] if item else None
            
            if not item:
                raise NotFoundException("아파트")
            
            return item
        else:
            raise NotFoundException("아파트")
    
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
                response = await client.get(url, params=params) #get 요청
                response.raise_for_status()  # HTTP 에러 발생 시 예외 발생
                
                # 응답 형식 확인 및 파싱
                content_type = response.headers.get("content-type", "").lower()
                
                if "application/json" in content_type or "text/json" in content_type:
                    return response.json()
                elif "application/xml" in content_type or "text/xml" in content_type:
                    # XML 응답인 경우 (공공데이터포털은 XML도 지원)
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
        self,   #class의 인스턴스
        db: AsyncSession,
        *,
        kapt_code: str  #함수 호출 시 전달받을 파라미터
    ) -> AptBasicInfo:
        # 입력 검증
        if not kapt_code or not kapt_code.strip():
            raise ExternalAPIException("단지 코드(kapt_code)가 필요합니다.")
        
        # 전체 URL 구성: Base URL + Service + Operation
        url = f"{self.MOLIT_API_BASE_URL}/AptBasisInfoServiceV4/getAphusBassInfoV4"
        
        # 외부 API에서 요구하는 파라미터
        params = {
            "kaptCode": kapt_code.strip(),  # 외부 API 파라미터명
        }
        
        # 외부 API 호출 (기본정보는 serviceKey 소문자 s 사용)
        api_response = await self._call_external_api(url, params, api_key_param_name="serviceKey")
        
        # API 응답 파싱
        item = self._parse_api_response(api_response)
        
        # 외부 API 응답을 스키마로 변환
        try:
            apt_info = AptBasicInfo(**item)  # alias로 자동 변환됨
            return apt_info
        except Exception as e:
            # Pydantic 검증 에러인 경우 더 자세한 정보 제공
            error_msg = str(e)
            if hasattr(e, 'errors'):
                # Pydantic ValidationError
                error_details = [f"{err.get('loc', [])}: {err.get('msg', '')}" for err in getattr(e, 'errors', [])]
                error_msg = f"스키마 검증 실패: {', '.join(error_details)}"
            raise ExternalAPIException(f"API 응답 파싱 실패: {error_msg}")
    


    
    async def get_apartment_detail_info(
        self,
        db: AsyncSession,
        *,
        kapt_code: str
    ) -> AptDetailInfo:
        # 입력 검증
        if not kapt_code or not kapt_code.strip():
            raise ExternalAPIException("단지 코드(kapt_code)가 필요합니다.")
        
        # 전체 URL 구성: Base URL + Service + Operation
        url = f"{self.MOLIT_API_BASE_URL}/AptBasisInfoServiceV4/getAphusDtlInfoV4"
        
        params = {
            "kaptCode": kapt_code.strip(),  # 외부 API 파라미터명 (camelCase)
            #상세정보는 ServiceKey _call_external_api에서 자동 추가됨
        }
        
        # 외부 API 호출
        api_response = await self._call_external_api(url, params)
        
        # API 응답 파싱
        item = self._parse_api_response(api_response)
        
        # 외부 API 응답을 스키마로 변환
        try:
            apt_detail = AptDetailInfo(**item)  # alias로 자동 변환됨
            return apt_detail
        except Exception as e:
            # Pydantic 검증 에러인 경우 더 자세한 정보 제공
            error_msg = str(e)
            if hasattr(e, 'errors'):
                # Pydantic ValidationError
                error_details = [f"{err.get('loc', [])}: {err.get('msg', '')}" for err in getattr(e, 'errors', [])]
                error_msg = f"스키마 검증 실패: {', '.join(error_details)}"
            raise ExternalAPIException(f"API 응답 파싱 실패: {error_msg}")


# 싱글톤 인스턴스
apartment_service = ApartmentService()