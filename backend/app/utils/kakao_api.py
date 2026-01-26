"""
카카오 API 유틸리티

카카오 로컬 API를 사용하여 주소를 좌표로 변환하는 기능을 제공합니다.
"""
import json
import logging
import re
import traceback
import httpx
from typing import Optional, Tuple, List
from app.core.config import settings

logger = logging.getLogger(__name__)

# 카카오 로컬 API 엔드포인트
KAKAO_LOCAL_API_BASE_URL = "https://dapi.kakao.com/v2/local/search/address.json"


# 주의: 이 함수는 현재 사용하지 않습니다.
# 아파트 주소는 정확한 주소를 사용해야 하므로 주소를 정제하지 않습니다.
# def clean_address(address: str) -> List[str]:
#     """
#     주소를 정제하고 여러 변형을 생성합니다.
#     
#     주의: 아파트 주소는 정확한 주소를 사용해야 하므로 이 함수는 사용하지 않습니다.
#     """
#     pass


async def _call_kakao_api(
    address: str,
    analyze_type: str = "similar",
    page: int = 1,
    timeout: float = 5.0
) -> Optional[Tuple[float, float]]:
    """
    카카오 API를 호출하여 좌표를 가져옵니다.
    
    Args:
        address: 검색할 주소
        analyze_type: "similar" (확장 검색) 또는 "exact" (정확한 매칭)
        page: 결과 페이지 번호 (기본값: 1)
        timeout: 요청 타임아웃
    
    Returns:
        (경도, 위도) 튜플 또는 None
    """
    api_key = settings.KAKAO_REST_API_KEY
    if not api_key:
        return None
    
    headers = {
        "Authorization": f"KakaoAK {api_key}",
        "Content-Type": "application/json"
    }
    
    params = {
        "query": address.strip(),
        "analyze_type": analyze_type,
        "page": page,
        "size": 1  # 첫 번째 결과만 필요
    }
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                KAKAO_LOCAL_API_BASE_URL,
                headers=headers,
                params=params
            )
            
            response.raise_for_status()
            data = response.json()
            
            meta = data.get("meta", {})
            total_count = meta.get("total_count", 0)
            pageable_count = meta.get("pageable_count", 0)
            is_end = meta.get("is_end", True)
            raw_payload = {"meta": meta, "documents_count": 0, "first_doc": None}

            # 상세 로깅 (실패한 경우) — raw 응답 WARNING으로 출력
            if total_count == 0:
                raw_payload["documents_count"] = len(data.get("documents", []))
                raw_str = json.dumps(raw_payload, ensure_ascii=False, default=str)
                logger.warning(
                    f"[Kakao RAW] 주소 검색 결과 없음: address='{address}', "
                    f"analyze_type={analyze_type}, page={page} | raw={raw_str}"
                )
                return None

            documents = data.get("documents", [])
            if not documents:
                raw_payload["documents_count"] = 0
                raw_str = json.dumps(raw_payload, ensure_ascii=False, default=str)
                logger.warning(
                    f"[Kakao RAW] 문서 배열 비어있음: address='{address}', "
                    f"total_count={total_count}, pageable_count={pageable_count}, is_end={is_end} | raw={raw_str}"
                )
                return None

            raw_payload["documents_count"] = len(documents)
            raw_payload["first_doc"] = documents[0]

            first_result = documents[0]
            x = first_result.get("x")
            y = first_result.get("y")
            address_name = first_result.get("address_name", "")
            address_type = first_result.get("address_type", "")

            if not x or not y:
                raw_str = json.dumps(raw_payload, ensure_ascii=False, default=str)
                logger.warning(
                    f"[Kakao RAW] 좌표 없음: address='{address}', "
                    f"result_address='{address_name}', type={address_type} | raw={raw_str}"
                )
                return None
            
            return (float(x), float(y))
            
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code
        error_text = (e.response.text or "")[:500]
        logger.warning(
            f"[Kakao RAW] HTTP 오류 [{status_code}]: address='{address}', "
            f"analyze_type={analyze_type}, page={page} | response_body={error_text}"
        )
        return None

    except httpx.TimeoutException:
        logger.warning(
            f"[Kakao RAW] 타임아웃: address='{address}', analyze_type={analyze_type}, page={page}"
        )
        return None

    except Exception as e:
        tb = traceback.format_exc()
        logger.warning(
            f"[Kakao RAW] 호출 예외: address='{address}', "
            f"analyze_type={analyze_type}, page={page} | "
            f"error={type(e).__name__}: {str(e)} | traceback:\n{tb}"
        )
        return None


async def _call_kakao_api_with_page(
    address: str,
    analyze_type: str = "similar",
    page: int = 1,
    timeout: float = 5.0
) -> Optional[Tuple[float, float]]:
    """페이지 번호를 지정하여 카카오 API 호출"""
    return await _call_kakao_api(address, analyze_type, page, timeout)


async def address_to_coordinates(
    address: str,
    timeout: float = 5.0
) -> Optional[Tuple[float, float]]:
    """
    주소를 좌표로 변환 (카카오 로컬 API 사용)
    
    정확한 주소를 사용하여 좌표를 변환합니다.
    여러 전략을 시도합니다:
    1. 원본 주소 (similar 모드) - 기본
    2. 원본 주소 (exact 모드) - 정확한 매칭
    3. 여러 페이지 확인 (page=1, 2, 3)
    
    Args:
        address: 변환할 주소 (도로명 주소 또는 지번 주소) - 정확한 주소 사용
        timeout: 요청 타임아웃 (초, 기본값: 5.0)
    
    Returns:
        (경도, 위도) 튜플 또는 None (실패 시)
    """
    # API 키 확인
    api_key = settings.KAKAO_REST_API_KEY
    if not api_key:
        logger.error(" 카카오 API 키가 설정되지 않았습니다. KAKAO_REST_API_KEY 환경변수를 확인하세요.")
        raise ValueError("카카오 API 키가 설정되지 않았습니다.")
    
    # 주소가 비어있는 경우
    if not address or not address.strip():
        logger.warning(f"  빈 주소가 전달되었습니다.")
        return None
    
    address = address.strip()
    logger.debug(f" 주소 변환 시도: '{address}'")
    
    # 전략 1: 원본 주소로 similar 모드 시도 (기본)
    result = await _call_kakao_api(address, analyze_type="similar", timeout=timeout)
    if result:
        logger.debug(f" 좌표 변환 성공 (similar): '{address}' → {result}")
        return result
    
    # 전략 2: 원본 주소로 exact 모드 시도
    result = await _call_kakao_api(address, analyze_type="exact", timeout=timeout)
    if result:
        logger.debug(f" 좌표 변환 성공 (exact): '{address}' → {result}")
        return result
    
    # 전략 3: 여러 페이지 확인 (similar 모드)
    for page in range(2, 4):  # page 2, 3 확인
        result = await _call_kakao_api_with_page(address, analyze_type="similar", page=page, timeout=timeout)
        if result:
            logger.debug(f" 좌표 변환 성공 (page {page}): '{address}' → {result}")
            return result
    
    # 모든 전략 실패 (각 시도별 raw 로그는 [Kakao RAW] 위에 출력됨)
    logger.warning(
        f"  주소를 찾을 수 없습니다: '{address}' "
        f"(similar → exact → page 2,3 모두 시도, 상세는 [Kakao RAW] 로그 참조)"
    )
    return None
