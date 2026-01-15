"""
카카오 API 유틸리티

카카오 로컬 API를 사용하여 주소를 좌표로 변환하는 기능을 제공합니다.
"""
import logging
import httpx
from typing import Optional, Tuple
from app.core.config import settings

logger = logging.getLogger(__name__)

# 카카오 로컬 API 엔드포인트
KAKAO_LOCAL_API_BASE_URL = "https://dapi.kakao.com/v2/local/search/address.json"


async def address_to_coordinates(
    address: str,
    timeout: float = 5.0
) -> Optional[Tuple[float, float]]:
    """
    주소를 좌표로 변환 (카카오 로컬 API 사용)
    
    Args:
        address: 변환할 주소 (도로명 주소 또는 지번 주소)
        timeout: 요청 타임아웃 (초, 기본값: 5.0)
    
    Returns:
        (경도, 위도) 튜플 또는 None (실패 시)
    
    Raises:
        ValueError: API 키가 설정되지 않은 경우
        httpx.HTTPError: HTTP 요청 오류
        httpx.TimeoutException: 타임아웃 오류
    """
    # API 키 확인
    api_key = settings.KAKAO_REST_API_KEY
    if not api_key:
        logger.error("❌ 카카오 API 키가 설정되지 않았습니다. KAKAO_REST_API_KEY 환경변수를 확인하세요.")
        raise ValueError("카카오 API 키가 설정되지 않았습니다.")
    
    # 주소가 비어있는 경우
    if not address or not address.strip():
        logger.warning(f"⚠️  빈 주소가 전달되었습니다.")
        return None
    
    logger.debug(f"🔍 카카오 API 호출 시작: 주소='{address}'")
    
    # HTTP 헤더 설정
    headers = {
        "Authorization": f"KakaoAK {api_key}",
        "Content-Type": "application/json"
    }
    
    # 요청 파라미터
    params = {
        "query": address.strip()
    }
    
    try:
        # HTTP 요청 (비동기)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                KAKAO_LOCAL_API_BASE_URL,
                headers=headers,
                params=params
            )
            
            # HTTP 상태 코드 확인
            response.raise_for_status()
            
            # 응답 파싱
            data = response.json()
            
            # 메타 정보 확인
            meta = data.get("meta", {})
            total_count = meta.get("total_count", 0)
            is_end = meta.get("is_end", True)
            
            logger.debug(f"📊 카카오 API 응답: total_count={total_count}, is_end={is_end}")
            
            # 결과가 없는 경우
            if total_count == 0:
                logger.warning(f"⚠️  주소를 찾을 수 없습니다: '{address}'")
                return None
            
            # 첫 번째 결과 사용
            documents = data.get("documents", [])
            if not documents:
                logger.warning(f"⚠️  주소 검색 결과가 비어있습니다: '{address}'")
                return None
            
            first_result = documents[0]
            
            # 좌표 추출
            x = first_result.get("x")  # 경도 (longitude)
            y = first_result.get("y")  # 위도 (latitude)
            
            if not x or not y:
                logger.warning(f"⚠️  좌표 정보가 없습니다: '{address}'")
                return None
            
            try:
                longitude = float(x)
                latitude = float(y)
                
                logger.debug(f"✅ 좌표 변환 성공: '{address}' → ({longitude}, {latitude})")
                
                return (longitude, latitude)
                
            except (ValueError, TypeError) as e:
                logger.error(f"❌ 좌표 변환 실패: '{address}', x={x}, y={y}, 오류={str(e)}")
                return None
                
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code
        error_text = e.response.text[:200] if e.response.text else ""
        logger.error(f"❌ 카카오 API HTTP 오류 [{status_code}]: 주소='{address}', 응답={error_text}")
        return None
        
    except httpx.TimeoutException as e:
        logger.error(f"⏱️  카카오 API 타임아웃: 주소='{address}', 오류={str(e)}")
        return None
        
    except httpx.RequestError as e:
        logger.error(f"❌ 카카오 API 요청 오류: 주소='{address}', 오류={str(e)}")
        return None
        
    except Exception as e:
        logger.error(f"❌ 카카오 API 예상치 못한 오류: 주소='{address}', 오류={str(e)}", exc_info=True)
        return None
