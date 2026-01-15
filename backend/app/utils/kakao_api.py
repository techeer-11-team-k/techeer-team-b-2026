"""
카카오 REST API 유틸리티

카카오 로컬 API를 사용하여 주소를 좌표로 변환하는 기능을 제공합니다.
"""
import logging
import sys
import asyncio
import httpx
from typing import Optional, Tuple
from app.core.config import settings

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Docker logs에서 볼 수 있도록 StreamHandler 추가
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = True  # 부모 로거로 전파


async def address_to_coordinates(address: str) -> Optional[Tuple[float, float]]:
    """
    카카오 로컬 API를 사용하여 주소를 좌표(경도, 위도)로 변환합니다.
    
    Args:
        address: 변환할 주소 (도로명 주소 또는 지번 주소)
    
    Returns:
        (경도, 위도) 튜플 또는 None (변환 실패 시)
    
    Raises:
        ValueError: API 키가 설정되지 않은 경우
        httpx.HTTPError: HTTP 요청 실패 시
    """
    # API 키 확인 및 로깅
    logger.info("=" * 80)
    logger.info("🔑 카카오 API 키 확인 중...")
    
    if not settings.KAKAO_REST_API_KEY:
        logger.error("❌ KAKAO_REST_API_KEY가 설정되지 않았습니다.")
        logger.error("   .env 파일에 KAKAO_REST_API_KEY를 설정해주세요.")
        raise ValueError("KAKAO_REST_API_KEY가 설정되지 않았습니다.")
    
    # API 키 앞뒤 공백 제거
    api_key = settings.KAKAO_REST_API_KEY.strip()
    if not api_key:
        logger.error("❌ KAKAO_REST_API_KEY가 비어있습니다.")
        raise ValueError("KAKAO_REST_API_KEY가 비어있습니다.")
    
    # API 키 길이 및 형식 확인
    api_key_length = len(api_key)
    logger.info(f"   API 키 길이: {api_key_length}자")
    logger.info(f"   API 키 앞 10자리: {api_key[:10]}...")
    logger.info(f"   API 키 뒤 10자리: ...{api_key[-10:]}")
    
    # 공백이나 특수문자 확인
    if ' ' in api_key or '\n' in api_key or '\t' in api_key:
        logger.warning("⚠️  API 키에 공백이나 줄바꿈 문자가 포함되어 있습니다!")
        logger.warning(f"   공백 제거 전: '{api_key}'")
        api_key = api_key.replace(' ', '').replace('\n', '').replace('\t', '')
        logger.warning(f"   공백 제거 후: '{api_key}'")
    
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {
        "Authorization": f"KakaoAK {api_key}"
    }
    
    logger.info(f"   Authorization 헤더: KakaoAK {api_key[:10]}...")
    logger.info("=" * 80)
    params = {
        "query": address,
        "analyze_type": "similar"  # 유사 주소도 검색
    }
    
    # 재시도 설정
    max_retries = 3
    retry_delay = 2  # 초
    
    response = None
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"🔍 카카오 API 호출 시작 (시도 {attempt}/{max_retries}): 주소='{address}'")
            logger.info(f"   URL: {url}")
            logger.info(f"   파라미터: query={address}, analyze_type=similar")
            
            # 타임아웃 설정 (연결: 5초, 읽기: 10초)
            timeout = httpx.Timeout(5.0, read=10.0)
            
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url, headers=headers, params=params)
                
                # 응답 상태 코드 로깅
                logger.info(f"📡 카카오 API 응답 상태: {response.status_code}")
                
                # 401 에러인 경우 상세 로깅
                if response.status_code == 401:
                    logger.error("=" * 80)
                    logger.error("❌ 카카오 API 인증 실패 (401 Unauthorized)")
                    logger.error(f"   요청 URL: {url}")
                    logger.error(f"   요청 헤더: Authorization: KakaoAK {api_key[:10]}...")
                    logger.error(f"   응답 본문: {response.text[:500]}")
                    logger.error("=" * 80)
                
                response.raise_for_status()
                break  # 성공하면 루프 종료
                
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as e:
            error_type = type(e).__name__
            logger.warning(f"⚠️  네트워크 연결 오류 (시도 {attempt}/{max_retries}): {error_type}")
            logger.warning(f"   주소: '{address}'")
            logger.warning(f"   오류: {str(e)}")
            
            if attempt < max_retries:
                wait_time = retry_delay * attempt  # 지수 백오프
                logger.info(f"   {wait_time}초 후 재시도...")
                await asyncio.sleep(wait_time)
            else:
                logger.error(f"❌ 네트워크 연결 실패: 최대 재시도 횟수({max_retries}) 초과")
                logger.error(f"   가능한 원인:")
                logger.error(f"   1. Docker 컨테이너에서 외부 네트워크 접근 불가")
                logger.error(f"   2. DNS 서버 문제 (호스트명을 IP로 변환할 수 없음)")
                logger.error(f"   3. 일시적인 네트워크 장애")
                logger.error(f"   4. 방화벽 또는 네트워크 설정 문제")
                raise
        except httpx.HTTPStatusError:
            # HTTP 상태 코드 오류는 재시도하지 않음
            raise
    
    # 응답 처리 (성공한 경우에만 실행)
    try:
        data = response.json()
        
        # 응답 메타 정보 로깅
        meta = data.get("meta", {})
        total_count = meta.get("total_count", 0)
        pageable_count = meta.get("pageable_count", 0)
        is_end = meta.get("is_end", True)
        logger.info(f"📊 카카오 API 응답: total_count={total_count}, pageable_count={pageable_count}, is_end={is_end}")
        
        # 응답 데이터 확인
        documents = data.get("documents", [])
        if not documents or len(documents) == 0:
            logger.warning(f"⚠️  주소를 찾을 수 없습니다: '{address}'")
            logger.warning(f"   응답 데이터: {data}")
            return None
        
        # 첫 번째 결과 사용 (카카오 API 문서에 따름)
        document = documents[0]
        address_type = document.get("address_type", "UNKNOWN")
        address_name = document.get("address_name", "N/A")
        logger.info(f"📍 검색 결과: address_type={address_type}, address_name={address_name}")
        
        # 좌표 추출 우선순위 (카카오 API 응답 구조에 따라)
        # 1. road_address의 x, y (도로명 주소 좌표)
        # 2. address의 x, y (지번 주소 좌표)
        # 3. 최상위 레벨의 x, y
        x = None
        y = None
        source = None
        
        if document.get("road_address"):
            road_addr = document["road_address"]
            x = road_addr.get("x")
            y = road_addr.get("y")
            source = "도로명주소"
            road_addr_name = road_addr.get("address_name", "N/A")
            logger.info(f"🛣️  도로명주소 좌표 사용: {road_addr_name}")
            logger.info(f"   좌표: x={x}, y={y}")
        elif document.get("address"):
            addr = document["address"]
            x = addr.get("x")
            y = addr.get("y")
            source = "지번주소"
            addr_name = addr.get("address_name", "N/A")
            logger.info(f"🏘️  지번주소 좌표 사용: {addr_name}")
            logger.info(f"   좌표: x={x}, y={y}")
        
        # road_address와 address 모두 없으면 최상위 레벨 사용
        if not x or not y:
            x = document.get("x")
            y = document.get("y")
            if x and y:
                source = "최상위좌표"
                logger.info(f"📍 최상위 레벨 좌표 사용")
                logger.info(f"   좌표: x={x}, y={y}")
        
        if not x or not y:
            logger.error(f"❌ 좌표 정보를 찾을 수 없습니다: '{address}'")
            logger.error(f"   document 구조: {document}")
            return None
        
        # 좌표 변환 (문자열 -> float)
        try:
            longitude = float(x)
            latitude = float(y)
        except (ValueError, TypeError) as e:
            logger.error(f"❌ 좌표 변환 실패: x={x}, y={y}, 오류={str(e)}")
            return None
        
        logger.info(f"✅ 주소 변환 성공 [{source}]: '{address}' -> 경도={longitude}, 위도={latitude}")
        return (longitude, latitude)
            
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code
        error_text = e.response.text[:500]  # 처음 500자만
        
        if status_code == 401:
            logger.error("=" * 80)
            logger.error("❌ 카카오 API 인증 실패 (401 Unauthorized)")
            logger.error(f"   주소: '{address}'")
            logger.error(f"   응답: {error_text}")
            logger.error("   가능한 원인:")
            logger.error("   1. KAKAO_REST_API_KEY가 잘못되었거나 만료됨")
            logger.error("   2. API 키에 공백이나 특수문자가 포함됨")
            logger.error("   3. REST API 키가 아닌 다른 키를 사용함")
            logger.error("=" * 80)
        else:
            logger.error(f"❌ 카카오 API HTTP 오류 [{status_code}]: 주소='{address}', 응답={error_text}")
        raise
    except httpx.TimeoutException as e:
        logger.error(f"⏱️  카카오 API 타임아웃: 주소='{address}', 오류={str(e)}")
        raise
    except httpx.RequestError as e:
        logger.error(f"❌ 카카오 API 요청 오류: 주소='{address}', 오류={str(e)}")
        raise
    except Exception as e:
        import traceback
        logger.error(f"❌ 주소 변환 중 예상치 못한 오류: 주소='{address}', 오류={str(e)}")
        logger.debug(f"상세 스택 트레이스:\n{traceback.format_exc()}")
        raise
