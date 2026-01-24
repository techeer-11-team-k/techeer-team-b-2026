"""
Google Geocoding API 유틸리티

Google Geocoding API를 사용하여 주소를 좌표로 변환하는 기능을 제공합니다.
"""
import json
import logging
import traceback
import httpx
from typing import Optional, Tuple
from app.core.config import settings

logger = logging.getLogger(__name__)

# Google Geocoding API 엔드포인트
GOOGLE_GEOCODING_API_BASE_URL = "https://maps.googleapis.com/maps/api/geocode/json"


async def address_to_coordinates(
    address: str,
    timeout: float = 5.0
) -> Optional[Tuple[float, float]]:
    """
    주소를 좌표로 변환 (Google Geocoding API 사용)
    
    Args:
        address: 변환할 주소 (도로명 주소 또는 지번 주소)
        timeout: 요청 타임아웃 (초, 기본값: 5.0)
    
    Returns:
        (경도, 위도) 튜플 또는 None (실패 시)
    """
    api_key = settings.GOOGLE_MAP_API_KEY
    if not api_key:
        logger.error("❌ Google Maps API 키가 설정되지 않았습니다. GOOGLE_MAP_API_KEY 환경변수를 확인하세요.")
        return None
    
    # 주소가 비어있는 경우
    if not address or not address.strip():
        logger.warning(f"⚠️ [Google Geocoding] 빈 주소가 전달되었습니다.")
        return None
    
    address = address.strip()
    logger.debug(f"🔍 [Google Geocoding] 주소 변환 시도: '{address}'")
    
    params = {
        "address": address,
        "key": api_key,
        "language": "ko"  # 한국어 응답
    }
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                GOOGLE_GEOCODING_API_BASE_URL,
                params=params
            )
            
            response.raise_for_status()
            data = response.json()
            
            status = data.get("status", "UNKNOWN_ERROR")
            results = data.get("results", [])
            
            # 상세 로깅 (실패한 경우) — raw 응답 WARNING으로 출력
            if status != "OK":
                raw_payload = {
                    "status": status,
                    "results_count": len(results),
                    "error_message": data.get("error_message", None)
                }
                raw_str = json.dumps(raw_payload, ensure_ascii=False, default=str)
                logger.warning(
                    f"[Google RAW] 주소 검색 실패: address='{address}', status='{status}' | raw={raw_str}"
                )
                return None
            
            if not results:
                raw_payload = {
                    "status": status,
                    "results_count": 0
                }
                raw_str = json.dumps(raw_payload, ensure_ascii=False, default=str)
                logger.warning(
                    f"[Google RAW] 결과 없음: address='{address}', status='{status}' | raw={raw_str}"
                )
                return None
            
            # 첫 번째 결과의 좌표 추출
            first_result = results[0]
            geometry = first_result.get("geometry", {})
            location = geometry.get("location", {})
            
            lat = location.get("lat")
            lng = location.get("lng")
            
            if lat is None or lng is None:
                raw_payload = {
                    "status": status,
                    "results_count": len(results),
                    "first_result": {
                        "formatted_address": first_result.get("formatted_address", ""),
                        "geometry": geometry
                    }
                }
                raw_str = json.dumps(raw_payload, ensure_ascii=False, default=str)
                logger.warning(
                    f"[Google RAW] 좌표 없음: address='{address}', "
                    f"formatted_address='{first_result.get('formatted_address', '')}' | raw={raw_str}"
                )
                return None
            
            logger.info(f"✅ [Google Geocoding] 좌표 변환 성공: '{address}' → ({lng}, {lat})")
            return (float(lng), float(lat))
            
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code
        error_text = (e.response.text or "")[:500]
        logger.warning(
            f"[Google RAW] HTTP 오류 [{status_code}]: address='{address}' | response_body={error_text}"
        )
        return None

    except httpx.TimeoutException:
        logger.warning(
            f"[Google RAW] 타임아웃: address='{address}'"
        )
        return None

    except Exception as e:
        tb = traceback.format_exc()
        logger.warning(
            f"[Google RAW] 호출 예외: address='{address}' | "
            f"error={type(e).__name__}: {str(e)} | traceback:\n{tb}"
        )
        return None
