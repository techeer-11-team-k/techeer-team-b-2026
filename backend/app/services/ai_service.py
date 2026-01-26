"""
AI 서비스

Gemini API를 사용한 AI 기능 제공
"""
import json
import re
import logging
import sys
import time
from datetime import datetime
from typing import Optional, Dict, Any
import httpx
from app.core.config import settings
from app.core.exceptions import ExternalAPIException

# 로거 설정 (Docker 로그에 출력되도록)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = True  # 루트 로거로도 전파


class AIService:
    """
    AI 서비스 클래스
    
    Gemini API를 사용하여 AI 기능을 제공합니다.
    """
    
    def __init__(self):
        """AI 서비스 초기화"""
        self.api_key = settings.GEMINI_API_KEY
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다. .env 파일에 GEMINI_API_KEY를 추가하세요.")
    
    async def generate_text(
        self,
        prompt: str,
        model: str = "gemini-3.0-flash-preview",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None
    ) -> str:
        """
        Gemini API를 사용하여 텍스트 생성
        
        Args:
            prompt: AI에게 전달할 프롬프트
            model: 사용할 모델 (기본값: gemini-pro)
            temperature: 생성 온도 (0.0 ~ 1.0, 높을수록 창의적)
            max_tokens: 최대 토큰 수 (None이면 기본값 사용)
        
        Returns:
            생성된 텍스트
        
        Raises:
            ExternalAPIException: API 호출 실패 시
        """
        # Gemini API 엔드포인트 (최신 버전)
        # 모델명: gemini-1.5-flash (빠름), gemini-1.5-pro (고품질)
        url = f"{self.base_url}/models/{model}:generateContent"
        
        headers = {
            "Content-Type": "application/json"
        }
        
        params = {
            "key": self.api_key
        }
        
        # 요청 본문 구성
        body: Dict[str, Any] = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": temperature
            }
        }
        
        if max_tokens:
            body["generationConfig"]["maxOutputTokens"] = max_tokens
        
        # 타임아웃 설정: AI 응답 생성에 충분한 시간 확보
        api_start_time = time.time()
        logger.info(f"[AI_SERVICE] Gemini API 호출 시작 - 모델: {model}, max_tokens: {max_tokens}, 시간: {datetime.now().isoformat()}")
        
        # HTTP 클라이언트 최적화: 연결 풀 재사용 및 타임아웃 설정
        # AI 응답 생성에 충분한 시간을 주기 위해 타임아웃 증가 (30초)
        timeout_config = httpx.Timeout(30.0, connect=5.0)  # 전체 30초, 연결 5초
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            try:
                request_start = time.time()
                logger.info(f"[AI_SERVICE] HTTP 요청 전송 시작 - 시간: {datetime.now().isoformat()}")
                response = await client.post(
                    url,
                    headers=headers,
                    params=params,
                    json=body
                )
                request_end = time.time()
                request_duration = request_end - request_start
                logger.info(f"[AI_SERVICE] HTTP 요청 완료 - 소요시간: {request_duration:.3f}초, 상태코드: {response.status_code}, 시간: {datetime.now().isoformat()}")
                
                response.raise_for_status()
                
                parse_start = time.time()
                logger.info(f"[AI_SERVICE] JSON 파싱 시작 - 시간: {datetime.now().isoformat()}")
                data = response.json()
                parse_end = time.time()
                parse_duration = parse_end - parse_start
                logger.info(f"[AI_SERVICE] JSON 파싱 완료 - 소요시간: {parse_duration:.3f}초, 시간: {datetime.now().isoformat()}")
                
                # 응답에서 텍스트 추출
                if "candidates" in data and len(data["candidates"]) > 0:
                    candidate = data["candidates"][0]
                    
                    # finishReason 확인 (중요: 응답이 완전히 생성되었는지 확인)
                    finish_reason = candidate.get("finishReason", "STOP")
                    logger.info(f"[AI_SERVICE] finishReason: {finish_reason}")
                    
                    if finish_reason == "MAX_TOKENS":
                        # 토큰 제한에 도달하여 응답이 잘렸을 가능성
                        logger.warning(f"[AI_SERVICE]  MAX_TOKENS에 도달하여 응답이 잘렸을 수 있습니다. max_tokens 값을 늘려주세요.")
                    elif finish_reason == "SAFETY":
                        logger.warning(f"[AI_SERVICE]  SAFETY 필터에 의해 응답이 차단되었습니다.")
                    elif finish_reason != "STOP":
                        logger.warning(f"[AI_SERVICE]  예상치 못한 finishReason: {finish_reason}")
                    
                    if "content" in candidate and "parts" in candidate["content"]:
                        parts = candidate["content"]["parts"]
                        if len(parts) > 0 and "text" in parts[0]:
                            text = parts[0]["text"].strip()
                            
                            api_end_time = time.time()
                            api_duration = api_end_time - api_start_time
                            logger.info(f"[AI_SERVICE] Gemini API 전체 완료 - 총 소요시간: {api_duration:.3f}초 (요청: {request_duration:.3f}초, 파싱: {parse_duration:.3f}초), 시간: {datetime.now().isoformat()}")
                            logger.info(f"[AI_SERVICE] 생성된 텍스트 길이: {len(text)}자, finishReason: {finish_reason}")
                            return text
                
                api_end_time = time.time()
                api_duration = api_end_time - api_start_time
                logger.error(f"[AI_SERVICE] Gemini API 응답 파싱 실패 - 총 소요시간: {api_duration:.3f}초, 시간: {datetime.now().isoformat()}")
                raise ExternalAPIException("AI 응답에서 텍스트를 추출할 수 없습니다.")
                
            except httpx.HTTPStatusError as e:
                # HTTP 에러 응답 상세 정보 추출
                error_detail = ""
                try:
                    error_data = e.response.json()
                    error_detail = f" - {error_data}"
                except:
                    error_detail = f" - {e.response.text[:200]}"
                
                if e.response.status_code == 404:
                    raise ExternalAPIException(
                        f"Gemini API 모델을 찾을 수 없습니다. 모델명 '{model}'이(가) 올바른지 확인하세요. "
                        f"사용 가능한 모델: gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash, gemini-2.0-pro"
                    )
                elif e.response.status_code == 400:
                    raise ExternalAPIException(f"Gemini API 요청 형식 오류: {error_detail}")
                elif e.response.status_code == 403:
                    raise ExternalAPIException(
                        f"Gemini API 접근 권한이 없습니다. API 키가 유효한지 확인하세요."
                    )
                else:
                    raise ExternalAPIException(f"Gemini API 호출 실패 ({e.response.status_code}): {error_detail}")
            except httpx.HTTPError as e:
                api_end_time = time.time()
                api_duration = api_end_time - api_start_time
                logger.error(f"[AI_SERVICE] Gemini API 네트워크 오류 - 총 소요시간: {api_duration:.3f}초, 오류: {str(e)}, 시간: {datetime.now().isoformat()}")
                raise ExternalAPIException(f"Gemini API 네트워크 오류: {str(e)}")
            except json.JSONDecodeError as e:
                api_end_time = time.time()
                api_duration = api_end_time - api_start_time
                logger.error(f"[AI_SERVICE] AI 응답 JSON 파싱 실패 - 총 소요시간: {api_duration:.3f}초, 오류: {str(e)}, 시간: {datetime.now().isoformat()}")
                raise ExternalAPIException(f"AI 응답 파싱 실패: {str(e)}")
    
    async def generate_property_compliment(
        self,
        property_data: Dict[str, Any]
    ) -> str:
        """
        내집에 대한 칭찬글 생성
        
        Args:
            property_data: 내집 정보 딕셔너리
                - nickname: 별칭
                - apt_name: 아파트명
                - region_name: 시군구명
                - city_name: 시도명
                - exclusive_area: 전용면적
                - current_market_price: 현재 시세
                - memo: 메모
                - education_facility: 교육 시설 정보
                - subway_line: 지하철 노선
                - subway_station: 지하철 역명
                - subway_time: 지하철 소요 시간
        
        Returns:
            생성된 칭찬글
        """
        # 프롬프트 구성
        prompt = self._build_compliment_prompt(property_data)
        
        # AI에게 요청
        # 칭찬글을 더 길게 생성하기 위해 max_tokens 증가
        # 한글은 토큰당 약 0.5~1자 정도이므로, 400자를 위해 충분한 토큰 확보
        compliment = await self.generate_text(
            prompt=prompt,
            model="gemini-2.5-flash",  # 빠른 응답을 위해 flash 모델 사용
            temperature=0.7,  # 창의적인 칭찬글을 위해 중간 온도 설정 (속도 향상)
            max_tokens=2048  # 한글 300-400자를 위해 충분한 토큰 수 확보
        )
        
        # 응답 후처리: "칭찬글:", "답변:", "응답:" 같은 라벨 제거
        compliment = self._clean_compliment_response(compliment)
        
        return compliment
    
    def _clean_compliment_response(self, text: str) -> str:
        """
        AI 응답에서 불필요한 라벨 제거
        
        Args:
            text: AI가 생성한 원본 텍스트
        
        Returns:
            정제된 텍스트
        """
        if not text:
            return text
        
        cleaned = text.strip()
        
        # 제거할 라벨들 (다양한 패턴 고려)
        labels = [
            "칭찬글:", "칭찬글", "답변:", "답변", "응답:", "응답",
            "Compliment:", "Compliment", "Response:", "Response",
            "칭찬:", "칭찬", "평가:", "평가"
        ]
        
        # 라벨로 시작하는 경우 제거 (대소문자 구분 없이)
        for label in labels:
            # 정확히 일치하는 경우
            if cleaned.startswith(label):
                cleaned = cleaned[len(label):].strip()
                # 콜론 뒤에 공백이나 줄바꿈이 있으면 제거
                while cleaned.startswith("\n") or cleaned.startswith(" "):
                    cleaned = cleaned[1:].strip()
                break
            
            # 대소문자 무시하고 비교
            if cleaned.lower().startswith(label.lower()):
                cleaned = cleaned[len(label):].strip()
                while cleaned.startswith("\n") or cleaned.startswith(" "):
                    cleaned = cleaned[1:].strip()
                break
        
        # "칭찬글:\n\n" 같은 패턴도 제거
        # "칭찬글:" 뒤에 줄바꿈이 여러 개 있는 패턴 제거
        cleaned = re.sub(r'^칭찬글\s*:?\s*\n+\s*', '', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        cleaned = re.sub(r'^답변\s*:?\s*\n+\s*', '', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        cleaned = re.sub(r'^응답\s*:?\s*\n+\s*', '', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        
        return cleaned.strip()
    
    def _build_compliment_prompt(self, property_data: Dict[str, Any]) -> str:
        """
        칭찬글 생성을 위한 프롬프트 구성
        
        Args:
            property_data: 내집 정보 딕셔너리
        
        Returns:
            프롬프트 문자열
        """
        nickname = property_data.get("nickname", "내 집")
        apt_name = property_data.get("apt_name", "")
        region_name = property_data.get("region_name", "")
        city_name = property_data.get("city_name", "")
        road_address = property_data.get("road_address", "")
        jibun_address = property_data.get("jibun_address", "")
        exclusive_area = property_data.get("exclusive_area")
        current_market_price = property_data.get("current_market_price")
        memo = property_data.get("memo", "")
        education_facility = property_data.get("education_facility")
        subway_line = property_data.get("subway_line")
        subway_station = property_data.get("subway_station")
        subway_time = property_data.get("subway_time")
        
        # 주소에서 동 정보 추출
        dong_info = ""
        address = road_address or jibun_address or ""
        if address:
            # 주소에서 동 패턴 찾기 (예: "대치동", "역삼동", "당하동" 등)
            dong_match = re.search(r'(\S+동)', address)
            if dong_match:
                dong_info = dong_match.group(1)
        
        # 동 정보가 없으면 region_name에서 추출 시도
        if not dong_info and region_name:
            dong_match = re.search(r'(\S+동)', region_name)
            if dong_match:
                dong_info = dong_match.group(1)
        
        # 위치 정보 구성
        location_info = ""
        if city_name and region_name:
            location_info = f"{city_name} {region_name}"
        elif city_name:
            location_info = city_name
        elif region_name:
            location_info = region_name
        
        # 호선 정보 추출
        subway_line_only = ""
        if subway_line:
            # 호선 번호 추출 (예: "2호선", "9호선", "수인분당선" 등)
            line_match = re.search(r'(\d+호선|[가-힣]+선)', subway_line)
            if line_match:
                subway_line_only = line_match.group(1)
            else:
                subway_line_only = subway_line.split()[0] if subway_line.split() else ""
        
        # 학교 정보 추출 (education_facility에서 학교명 추출)
        school_info = ""
        if education_facility:
            # 교육시설 정보에서 학교명 추출 (예: "당하초등학교", "대치초등학교" 등)
            school_match = re.search(r'([가-힣]+(?:초등|중|고등|대학)학교)', education_facility)
            if school_match:
                school_info = school_match.group(1)
            else:
                # 매칭 안되면 전체를 사용
                school_info = education_facility
        
        # 교통 정보 구성
        subway_info = ""
        if subway_line and subway_station:
            subway_info = f"{subway_line} {subway_station}"
            if subway_time:
                subway_info += f" ({subway_time})"
        elif subway_station:
            subway_info = subway_station
            if subway_time:
                subway_info += f" ({subway_time})"
        
        # 프롬프트 작성 (라벨을 유도하지 않도록 주의)
        prompt_parts = [
            f"다음은 '{nickname}'이라는 이름의 내 집 정보입니다.",
            "",
            "## 내 집 정보",
            f"- 아파트명: {apt_name}" if apt_name else "",
            f"- 위치: {location_info}" if location_info else "",
            f"- 동: {dong_info}" if dong_info else "",
            f"- 전용면적: {exclusive_area}㎡" if exclusive_area else "",
            f"- 현재 시세: {current_market_price:,}만원" if current_market_price else "",
            f"- 교육 시설: {education_facility}" if education_facility else "",
            f"- 학교명: {school_info}" if school_info else "",
            f"- 지하철 접근성: {subway_info}" if subway_info else "",
            f"- 지하철 호선: {subway_line_only}" if subway_line_only else "",
            f"- 메모: {memo}" if memo else "",
            "",
            "위 정보를 바탕으로 이 집에 대한 따뜻하고 긍정적인 칭찬글을 작성해주세요.",
            "",
            "작성 규칙:",
            "- 반드시 '이 집은 정말 멋진 곳이네요!'로 시작하고, 반드시 이 문장 다음에 줄바꿈(\\n)을 추가해야 합니다.",
            "- 첫 문장 다음 줄바꿈 후에 본문을 시작하세요.",
            "- 본문은 다음 순서로 작성하세요:",
            "  1. [지역 동]에 대한 설명:",
            "     * '[시도명] [동명]에 위치해있고' 또는 '[동명]에 위치해있어' 형식으로 시작",
            "     * 동의 위치적 특성이나 장점을 간단히 언급 (예: '접근성이 좋은', '주변 환경이 우수한')",
            "  2. [지하철.교통시설]에 대한 설명:",
            "     * 지하철 호선 정보가 있으면 반드시 포함: '지하철 [호선번호]호선이 지나가며', '[호선번호]호선을 이용할 수 있어'",
            "     * 지하철 역명이 있으면: '[역명]역이 인근에 있어', '[역명]역까지 도보로 접근 가능하여'",
            "     * 교통 접근성의 장점을 강조: '교통이 매우 편리합니다', '대중교통 이용이 편리합니다', '출퇴근에 유리합니다'",
            "     * 지하철까지 걸리는시간이 10분 미만일 경우 '도보 [시간]분 거리' 형식으로 언급 가능",
            "     * 지하철까지 걸리는시간이 10분 이상일 경우 지하철까지 걸리는 시간을 언급하지 말 것",
            "  3. [학교.주변시설]에 대한 설명:",
            "     * 학교 정보가 있으면: '주변에 [학교명]이 있어', '[학교명]이 인근에 위치해있어'",
            "     * 교육 환경의 장점을 언급: '교육 환경이 우수합니다', '자녀 교육에 좋은 환경입니다'",
            "     * 주변 편의시설 언급: '주변에 편의시설이 잘 갖춰져 있어', '상권이 발달되어 있어', '일상생활에 필요한 모든 것을 쉽게 구할 수 있습니다'",
            "- 동 정보가 없으면 일반적인 위치 정보(시/구)로 작성하되, 가능하면 동 정보를 포함하세요.",
            "- 집의 전용 면적이 50m^2 이하일 경우 면적을 언급하지 말 것.",
            "- 사무적인 말투로 작성할것. ~합니다. ~입니다. 같은 느낌으로 끝나야함.",
            "- 미사여구 대신 아파트의 장점을 최대한 전달해줘, 편안하고 아늑한 같은 말은 쓰지마.",
            "- 칭찬글을 충분히 길게 작성하세요. 위치, 교통(지하철 호선/역), 교육시설, 주변 편의시설 등 다양한 정보를 포함하여 300-400자 정도로 작성",
            "- 공백 포함 300-400자 정도로 작성해주세요",
            "- 여러 문장으로 나누어 작성하되, 자연스럽게 연결되도록 하세요",
            "- 부동산 투자 조언이나 추천은 포함하지 않음",
            "- 따뜻하고 긍정적인 톤 유지",
            "- 한국어로 작성",
            "- 제목, 라벨, 헤더 없이 바로 본문 내용만 작성",
            "",
            "예시 형식 (이 형식 그대로 따르세요):",
            "- 동, 호선, 학교가 모두 있는 경우:",
            "  '이 집은 정말 멋진 곳이네요!\\n서울특별시 반포동에 위치해있고, 접근성이 좋습니다. 지하철 7호선과 9호선이 지나가며 사평역이 인근에 있어 교통이 매우 편리합니다. 주변에 반포초등학교가 있어 교육 환경이 우수하며, 상권이 발달되어 있어 일상생활에 필요한 모든 것을 쉽게 구할 수 있습니다.'",
            "- 동과 호선만 있는 경우:",
            "  '이 집은 정말 멋진 곳이네요!\\n대치동에 위치해있고, 지하철 접근성이 뛰어납니다. 2호선이 지나가며 대치역이 근처에 있어 대중교통 이용이 편리합니다. 주변 상권이 발달되어 있어 생활이 편리하며, 다양한 편의시설이 잘 갖춰져 있습니다.'",
            "- 동만 있는 경우:",
            "  '이 집은 정말 멋진 곳이네요!\\n역삼동에 위치해있고, 접근성이 좋습니다. 주변에 다양한 편의시설과 상업시설이 있어 생활이 편리하며, 교통망도 잘 연결되어 있습니다.'"
        ]
        
        # 빈 줄 제거
        prompt = "\n".join([part for part in prompt_parts if part])
        
        return prompt
    
    async def generate_apartment_summary(
        self,
        apartment_data: Dict[str, Any]
    ) -> str:
        """
        아파트에 대한 AI 요약 생성
        
        Args:
            apartment_data: 아파트 정보 딕셔너리
                - apt_name: 아파트명
                - kapt_code: 국토부 단지코드
                - region_name: 시군구명
                - city_name: 시도명
                - road_address: 도로명 주소
                - jibun_address: 지번 주소
                - total_household_cnt: 총 세대수
                - total_building_cnt: 총 동수
                - highest_floor: 최고 층수
                - use_approval_date: 사용승인일
                - total_parking_cnt: 총 주차대수
                - builder_name: 시공사명
                - code_heat_nm: 난방방식
                - education_facility: 교육 시설 정보
                - subway_line: 지하철 노선
                - subway_station: 지하철 역명
                - subway_time: 지하철 소요 시간
        
        Returns:
            생성된 요약 텍스트
        """
        # 프롬프트 구성
        prompt = self._build_apartment_summary_prompt(apartment_data)
        
        # AI에게 요청
        # 속도 최적화: max_tokens 줄이기 (300자 이내이므로 800 토큰이면 충분)
        summary = await self.generate_text(
            prompt=prompt,
            model="gemini-2.5-flash",
            temperature=0.6,  # 객관적인 요약을 위해 중간 온도 설정 (속도 향상)
            max_tokens=800  # 300자 이내이므로 800 토큰이면 충분 (속도 향상)
        )
        
        # 응답 후처리: 불필요한 라벨 제거
        summary = self._clean_summary_response(summary)
        
        return summary
    
    def _clean_summary_response(self, text: str) -> str:
        """
        AI 응답에서 불필요한 라벨 제거
        
        Args:
            text: AI가 생성한 원본 텍스트
        
        Returns:
            정제된 텍스트
        """
        if not text:
            return text
        
        cleaned = text.strip()
        
        # 제거할 라벨들
        labels = [
            "요약:", "요약", "Summary:", "Summary",
            "아파트 요약:", "아파트 요약",
            "답변:", "답변", "Response:", "Response",
            "응답:", "응답"
        ]
        
        # 라벨로 시작하는 경우 제거
        for label in labels:
            if cleaned.startswith(label):
                cleaned = cleaned[len(label):].strip()
                while cleaned.startswith("\n") or cleaned.startswith(" "):
                    cleaned = cleaned[1:].strip()
                break
            
            if cleaned.lower().startswith(label.lower()):
                cleaned = cleaned[len(label):].strip()
                while cleaned.startswith("\n") or cleaned.startswith(" "):
                    cleaned = cleaned[1:].strip()
                break
        
        # 정규식으로 패턴 제거
        cleaned = re.sub(r'^요약\s*:?\s*\n+\s*', '', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        cleaned = re.sub(r'^Summary\s*:?\s*\n+\s*', '', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        
        return cleaned.strip()
    
    def _build_apartment_summary_prompt(self, apartment_data: Dict[str, Any]) -> str:
        """
        아파트 요약 생성을 위한 프롬프트 구성
        
        Args:
            apartment_data: 아파트 정보 딕셔너리
        
        Returns:
            프롬프트 문자열
        """
        apt_name = apartment_data.get("apt_name", "")
        region_name = apartment_data.get("region_name", "")
        city_name = apartment_data.get("city_name", "")
        road_address = apartment_data.get("road_address", "")
        jibun_address = apartment_data.get("jibun_address", "")
        total_household_cnt = apartment_data.get("total_household_cnt")
        total_building_cnt = apartment_data.get("total_building_cnt")
        highest_floor = apartment_data.get("highest_floor")
        use_approval_date = apartment_data.get("use_approval_date")
        total_parking_cnt = apartment_data.get("total_parking_cnt")
        builder_name = apartment_data.get("builder_name", "")
        code_heat_nm = apartment_data.get("code_heat_nm", "")
        education_facility = apartment_data.get("education_facility")
        subway_line = apartment_data.get("subway_line")
        subway_station = apartment_data.get("subway_station")
        subway_time = apartment_data.get("subway_time")
        
        # 위치 정보 구성
        location_info = ""
        if city_name and region_name:
            location_info = f"{city_name} {region_name}"
        elif city_name:
            location_info = city_name
        elif region_name:
            location_info = region_name
        
        # 주소 정보 구성
        address_info = ""
        if road_address:
            address_info = road_address
        elif jibun_address:
            address_info = jibun_address
        
        # 교통 정보 구성
        subway_info = ""
        if subway_line and subway_station:
            subway_info = f"{subway_line} {subway_station}"
            if subway_time:
                subway_info += f" ({subway_time})"
        elif subway_station:
            subway_info = subway_station
            if subway_time:
                subway_info += f" ({subway_time})"
        
        # 프롬프트 작성
        prompt_parts = [
            f"다음은 '{apt_name}' 아파트의 정보입니다.",
            "",
            "## 아파트 정보",
            f"- 아파트명: {apt_name}" if apt_name else "",
            f"- 위치: {location_info}" if location_info else "",
            f"- 주소: {address_info}" if address_info else "",
            f"- 총 세대수: {total_household_cnt:,}세대" if total_household_cnt else "",
            f"- 총 동수: {total_building_cnt}동" if total_building_cnt else "",
            f"- 최고 층수: {highest_floor}층" if highest_floor else "",
            f"- 사용승인일: {use_approval_date}" if use_approval_date else "",
            f"- 총 주차대수: {total_parking_cnt:,}대" if total_parking_cnt else "",
            f"- 시공사: {builder_name}" if builder_name else "",
            f"- 난방방식: {code_heat_nm}" if code_heat_nm else "",
            f"- 교육 시설: {education_facility}" if education_facility else "",
            f"- 지하철 접근성: {subway_info}" if subway_info else "",
            "",
            "위 정보를 바탕으로 이 아파트에 대한 객관적이고 유용한 요약을 작성해주세요.",
            "",
            "작성 규칙:",
            "- 사무적인 말투로 작성할 것 (~합니다, ~입니다 형식)",
            "- 아파트의 주요 특징과 장점을 중심으로 요약",
            "- 위치, 규모, 교통 접근성, 교육 시설, 주차 시설 등 핵심 정보 포함",
            "",
            "- 공백 포함 300자 이내로 작성",
            "- 부동산 투자 조언이나 추천은 포함하지 않음",
            "- 객관적이고 사실 기반의 정보 제공",
            "- 한국어로 작성",
            "- 제목, 라벨, 헤더 없이 바로 본문 내용만 작성",
            "",
            "예시 형식 (이 형식 그대로 따르세요):",
            "이 아파트는 [위치]에 위치한 [규모] 아파트입니다. [주요 특징과 장점을 자연스럽게 설명]..."
        ]
        
        # 빈 줄 제거
        prompt = "\n".join([part for part in prompt_parts if part])
        
        return prompt
    
    async def parse_search_query(
        self,
        query: str
    ) -> Dict[str, Any]:
        """
        자연어 검색 쿼리를 파싱하여 구조화된 검색 조건으로 변환
        
        Args:
            query: 자연어 검색 쿼리 (예: "강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처")
        
        Returns:
            파싱된 검색 조건 딕셔너리
                - location: 지역명
                - min_area: 최소 전용면적 (㎡)
                - max_area: 최대 전용면적 (㎡)
                - min_price: 최소 가격 (만원)
                - max_price: 최대 가격 (만원)
                - subway_max_distance_minutes: 지하철역까지 최대 도보 시간 (분)
                - has_education_facility: 교육시설 유무 (True/False/None)
                - raw_query: 원본 쿼리
                - parsed_confidence: 파싱 신뢰도 (0.0~1.0)
        """
        parse_start = time.time()
        logger.info(f"[AI_SERVICE] 자연어 파싱 시작 - 쿼리: {query}, 시간: {datetime.now().isoformat()}")
        
        prompt_build_start = time.time()
        logger.info(f"[AI_SERVICE] 프롬프트 생성 시작 - 시간: {datetime.now().isoformat()}")
        prompt = self._build_search_parsing_prompt(query)
        prompt_build_end = time.time()
        prompt_build_duration = prompt_build_end - prompt_build_start
        logger.info(f"[AI_SERVICE] 프롬프트 생성 완료 - 소요시간: {prompt_build_duration:.3f}초, 프롬프트 길이: {len(prompt)}자, 시간: {datetime.now().isoformat()}")
        
        # AI에게 요청 (JSON 형식으로 응답 받기)
        # 속도 최적화: temperature 낮추기, max_tokens는 충분히 설정 (응답이 잘리지 않도록)
        ai_call_start = time.time()
        logger.info(f"[AI_SERVICE] Gemini API 호출 시작 - 시간: {datetime.now().isoformat()}, 프롬프트 토큰 수(추정): {len(prompt) // 4}")
        response_text = await self.generate_text(
            prompt=prompt,
            model="gemini-2.5-flash",
            temperature=0.0,  # 정확한 파싱을 위해 최저 온도 설정 (속도 향상)
            max_tokens=800  # JSON 응답이 잘리지 않도록 충분히 설정
        )
        ai_call_end = time.time()
        ai_call_duration = ai_call_end - ai_call_start
        logger.info(f"[AI_SERVICE] Gemini API 호출 완료 - 소요시간: {ai_call_duration:.3f}초, 응답 길이: {len(response_text)}자, 시간: {datetime.now().isoformat()}")
        
        # JSON 응답 파싱 (재시도 로직 포함)
        json_parse_start = time.time()
        logger.info(f"[AI_SERVICE] JSON 파싱 시작 - 시간: {datetime.now().isoformat()}, 응답 길이: {len(response_text)}자")
        parsed_data = None
        max_retries = 2
        
        try:
            for retry in range(max_retries):
                try:
                    # JSON 코드 블록 제거 (```json ... ```) - 더 효율적으로 처리
                    cleaned_text = response_text.strip()
                    
                    # 시작 부분 제거
                    if cleaned_text.startswith("```json"):
                        cleaned_text = cleaned_text[7:].lstrip()
                    elif cleaned_text.startswith("```"):
                        cleaned_text = cleaned_text[3:].lstrip()
                    
                    # 끝 부분 제거
                    if cleaned_text.endswith("```"):
                        cleaned_text = cleaned_text[:-3].rstrip()
                    
                    # JSON 파싱 시도
                    parsed_data = json.loads(cleaned_text)
                    json_parse_end = time.time()
                    json_parse_duration = json_parse_end - json_parse_start
                    logger.info(f"[AI_SERVICE] JSON 파싱 완료 - 소요시간: {json_parse_duration:.3f}초, 시간: {datetime.now().isoformat()}")
                    break  # 성공하면 루프 종료
                    
                except json.JSONDecodeError as e:
                    json_parse_end = time.time()
                    json_parse_duration = json_parse_end - json_parse_start
                    
                    if retry < max_retries - 1:
                        # 재시도: 응답이 잘렸을 가능성이 있으므로 다시 요청
                        logger.warning(f"[AI_SERVICE] JSON 파싱 실패 (재시도 {retry + 1}/{max_retries}) - 오류: {str(e)}, 응답: {response_text[:200]}")
                        logger.info(f"[AI_SERVICE] 재시도: Gemini API 재호출 시작")
                        response_text = await self.generate_text(
                            prompt=prompt,
                            model="gemini-2.5-flash",
                            temperature=0.0,
                            max_tokens=1000  # 재시도 시 더 많은 토큰 할당
                        )
                        logger.info(f"[AI_SERVICE] 재시도 응답 길이: {len(response_text)}자")
                        continue
                    else:
                        # 마지막 시도 실패: 부분 파싱 시도
                        logger.error(f"[AI_SERVICE] JSON 파싱 최종 실패 - 소요시간: {json_parse_duration:.3f}초, 오류: {str(e)}")
                        logger.error(f"[AI_SERVICE] 원본 응답 (처음 500자): {response_text[:500]}")
                        
                        # 부분 파싱 시도: JSON이 잘렸더라도 일부 필드라도 추출
                        parsed_data = self._try_partial_json_parse(cleaned_text, query)
                        if parsed_data:
                            logger.warning(f"[AI_SERVICE] 부분 파싱 성공 - 일부 필드만 추출됨")
                            break
                        else:
                            raise  # 부분 파싱도 실패하면 예외 발생
            
            # parsed_data가 None이면 예외 발생
            if parsed_data is None:
                raise ValueError("JSON 파싱 실패: parsed_data가 None입니다")
            
            # 기본값 설정 (모든 새로운 필드 포함)
            result = {
                "location": parsed_data.get("location"),
                "region_id": parsed_data.get("region_id"),
                "apartment_name": parsed_data.get("apartment_name"),
                "min_area": parsed_data.get("min_area"),
                "max_area": parsed_data.get("max_area"),
                "min_price": parsed_data.get("min_price"),
                "max_price": parsed_data.get("max_price"),
                "min_deposit": parsed_data.get("min_deposit"),
                "max_deposit": parsed_data.get("max_deposit"),
                "min_monthly_rent": parsed_data.get("min_monthly_rent"),
                "max_monthly_rent": parsed_data.get("max_monthly_rent"),
                "subway_max_distance_minutes": parsed_data.get("subway_max_distance_minutes"),
                "subway_line": parsed_data.get("subway_line"),
                "subway_station": parsed_data.get("subway_station"),
                "has_education_facility": parsed_data.get("has_education_facility"),
                "min_build_year": parsed_data.get("min_build_year"),
                "max_build_year": parsed_data.get("max_build_year"),
                "build_year_range": parsed_data.get("build_year_range"),
                "min_floor": parsed_data.get("min_floor"),
                "max_floor": parsed_data.get("max_floor"),
                "floor_type": parsed_data.get("floor_type"),
                "min_parking_cnt": parsed_data.get("min_parking_cnt"),
                "has_parking": parsed_data.get("has_parking"),
                "builder_name": parsed_data.get("builder_name"),
                "developer_name": parsed_data.get("developer_name"),
                "heating_type": parsed_data.get("heating_type"),
                "manage_type": parsed_data.get("manage_type"),
                "hallway_type": parsed_data.get("hallway_type"),
                "recent_transaction_months": parsed_data.get("recent_transaction_months"),
                "raw_query": query,
                "parsed_confidence": parsed_data.get("parsed_confidence", 0.8)
            }
            
            parse_end = time.time()
            parse_total_duration = parse_end - parse_start
            json_parse_end = time.time()
            json_parse_duration = json_parse_end - json_parse_start
            logger.info(f"[AI_SERVICE] 자연어 파싱 전체 완료 - 총 소요시간: {parse_total_duration:.3f}초 (프롬프트: {prompt_build_duration:.3f}초, API: {ai_call_duration:.3f}초, JSON: {json_parse_duration:.3f}초), 시간: {datetime.now().isoformat()}")
            logger.info(f"[AI_SERVICE] 파싱 결과 - 전세: min_deposit={result.get('min_deposit')}, max_deposit={result.get('max_deposit')}, 월세: min_monthly_rent={result.get('min_monthly_rent')}, max_monthly_rent={result.get('max_monthly_rent')}")
            logger.info(f"[AI_SERVICE] 파싱 결과 상세 - location={result.get('location')}, region_id={result.get('region_id')}, min_area={result.get('min_area')}, max_area={result.get('max_area')}, min_price={result.get('min_price')}, max_price={result.get('max_price')}")
            
            return result
            
        except Exception as e:
            # 예상치 못한 예외 발생 시 기본값 반환
            json_parse_end = time.time()
            json_parse_duration = json_parse_end - json_parse_start
            parse_end = time.time()
            parse_total_duration = parse_end - parse_start
            logger.error(f"[AI_SERVICE] 예외 발생 - 소요시간: {json_parse_duration:.3f}초, 총 소요시간: {parse_total_duration:.3f}초, 오류: {str(e)}, 시간: {datetime.now().isoformat()}", exc_info=True)
            logger.error(f"[AI_SERVICE] 원본 응답 (처음 500자): {response_text[:500] if 'response_text' in locals() else 'N/A'}")
            return {
                "location": None,
                "region_id": None,
                "apartment_name": None,
                "min_area": None,
                "max_area": None,
                "min_price": None,
                "max_price": None,
                "min_deposit": None,
                "max_deposit": None,
                "min_monthly_rent": None,
                "max_monthly_rent": None,
                "subway_max_distance_minutes": None,
                "subway_line": None,
                "subway_station": None,
                "has_education_facility": None,
                "min_build_year": None,
                "max_build_year": None,
                "build_year_range": None,
                "min_floor": None,
                "max_floor": None,
                "floor_type": None,
                "min_parking_cnt": None,
                "has_parking": None,
                "builder_name": None,
                "developer_name": None,
                "heating_type": None,
                "manage_type": None,
                "hallway_type": None,
                "recent_transaction_months": None,
                "raw_query": query,
                "parsed_confidence": 0.0
            }
    
    def _try_partial_json_parse(self, text: str, query: str) -> Optional[Dict[str, Any]]:
        """
        JSON 파싱 실패 시 부분 파싱 시도
        
        Args:
            text: 파싱할 텍스트
            query: 원본 쿼리 (fallback용)
        
        Returns:
            부분적으로 파싱된 딕셔너리 또는 None
        """
        import re
        result = {}
        
        # location 추출
        location_match = re.search(r'"location"\s*:\s*"([^"]+)"', text)
        if location_match:
            result["location"] = location_match.group(1)
        
        # max_deposit 추출
        deposit_match = re.search(r'"max_deposit"\s*:\s*(\d+)', text)
        if deposit_match:
            result["max_deposit"] = int(deposit_match.group(1))
        
        # min_deposit 추출
        min_deposit_match = re.search(r'"min_deposit"\s*:\s*(\d+)', text)
        if min_deposit_match:
            result["min_deposit"] = int(min_deposit_match.group(1))
        
        # max_price 추출
        price_match = re.search(r'"max_price"\s*:\s*(\d+)', text)
        if price_match:
            result["max_price"] = int(price_match.group(1))
        
        # min_price 추출
        min_price_match = re.search(r'"min_price"\s*:\s*(\d+)', text)
        if min_price_match:
            result["min_price"] = int(min_price_match.group(1))
        
        # 쿼리에서 직접 추출 (fallback)
        if not result.get("location"):
            # "강남구", "서울시 강남구" 등 추출
            location_patterns = [
                r"([가-힣]+구)",
                r"([가-힣]+시\s+[가-힣]+구)",
                r"([가-힣]+도\s+[가-힣]+시)",
            ]
            for pattern in location_patterns:
                match = re.search(pattern, query)
                if match:
                    result["location"] = match.group(1).strip()
                    break
        
        if not result.get("max_deposit"):
            # "9억 이하", "10억 이하" 등 추출
            deposit_pattern = r"(\d+)억\s*이하"
            match = re.search(deposit_pattern, query)
            if match:
                result["max_deposit"] = int(match.group(1)) * 10000  # 억 -> 만원
        
        if result:
            logger.info(f"[AI_SERVICE] 부분 파싱 결과: {result}")
            return result
        
        return None
    
    def _build_search_parsing_prompt(self, query: str) -> str:
        """
        자연어 검색 쿼리 파싱을 위한 프롬프트 구성 (최적화된 버전)
        
        Args:
            query: 자연어 검색 쿼리
        
        Returns:
            프롬프트 문자열
        """
        # 프롬프트 (더 스마트한 자연어 파싱)
        prompt_parts = [
            "당신은 한국 부동산 아파트 검색 쿼리를 JSON 형식으로 파싱하는 AI입니다.",
            "",
            f"사용자 검색어: {query}",
            "",
            "## 검색어 해석 불가 판단 기준",
            "다음 경우 is_invalid: true로 설정:",
            "- 아파트 검색과 관련 없는 질문 (예: '오늘 날씨', '맛집 추천', '주식')",
            "- 의미 없는 문자열 (예: 'asdf', '???', '...')",
            "- 아파트가 아닌 다른 부동산 (예: '오피스텔', '빌라', '상가', '토지')",
            "- 해석 불가능한 내용",
            "위 경우 다른 필드는 모두 null로 설정하고 parsed_confidence를 0.0으로 설정",
            "",
            "## 지역(location) 파싱",
            "- 시/도, 구/군, 동 단위까지 추출 (예: '서울시 강남구', '강남구', '역삼동')",
            "- '서울 강남', '강남' → '강남구'로 정규화",
            "- '경기 파주' → '경기도 파주시'",
            "- '인천' → '인천광역시'",
            "- 여러 지역 언급 시 첫 번째 지역만 추출 (예: '강남구랑 서초구' → '강남구')",
            "- **주의**: 지하철역 이름만으로는 지역을 설정하지 마세요. (예: '강남역 근처' → location: null, subway_station: '강남')",
            "",
            "## 아파트 이름(apartment_name) 파싱",
            "- 아파트 브랜드명: '래미안', '자이', '힐스테이트', '롯데캐슬', '푸르지오', 'e편한세상' 등",
            "- 특정 아파트명: '반포 자이', '래미안 블레스티지', '헬리오시티' 등",
            "- 복합 검색어에서 아파트명 추출: '강남구 래미안' → apartment_name: '래미안'",
            "",
            "## 가격 파싱 규칙 (중요)",
            "1. 기본값은 매매가(min_price, max_price)",
            "2. '전세' 명시 시 → min_deposit, max_deposit (만원)",
            "3. '월세' 명시 시 → min_monthly_rent, max_monthly_rent (만원)",
            "",
            "매매 가격 예시:",
            "- '5억' → min_price: 48000, max_price: 52000 (약 5억 전후)",
            "- '딱 5억' → min_price: 50000, max_price: 50000",
            "- '5억 이상', '5억 넘는' → min_price: 50000",
            "- '5억 이하', '5억 미만' → max_price: 50000",
            "- '3억~5억', '3억에서 5억' → min_price: 30000, max_price: 50000",
            "- '10억대' → min_price: 100000, max_price: 109999",
            "",
            "전세 가격 예시:",
            "- '전세 5억' → min_deposit: 48000, max_deposit: 52000",
            "- '전세 9억 이하' → max_deposit: 90000",
            "- '전세 5억 이상' → min_deposit: 50000",
            "",
            "## 평수(min_area, max_area) 파싱 (㎡ 단위, 1평=3.3058㎡)",
            "- '30평' → min_area: 95, max_area: 105 (약 30평 전후)",
            "- '20평대' → min_area: 56, max_area: 89 (20~26평)",
            "- '30평대', '국평' → min_area: 75, max_area: 95 (국민평형 84㎡ 포함)",
            "- '40평대' → min_area: 122, max_area: 165 (37~49평)",
            "- '20~30평' → min_area: 56, max_area: 99",
            "- '소형', '작은' → min_area: 33, max_area: 66 (10~20평)",
            "- '중형' → min_area: 66, max_area: 115 (20~35평)",
            "- '대형', '넓은' → min_area: 115 (35평 이상)",
            "",
            "## 지하철/역 근처 검색",
            "- '역세권' → subway_max_distance_minutes: 10",
            "- 'OO역 근처', 'OO역에서 가까운' → subway_station: 'OO', subway_max_distance_minutes: 10",
            "- '야당역에서 가까운' → subway_station: '야당', subway_max_distance_minutes: 10",
            "- '강남역 도보 10분' → subway_station: '강남', subway_max_distance_minutes: 10",
            "- '지하철 5분 이내' → subway_max_distance_minutes: 5",
            "- '2호선 근처' → subway_line: '2호선', subway_max_distance_minutes: 10",
            "",
            "## 학교 근처 검색",
            "- '초품아' → has_education_facility: true",
            "- 'OO학교 근처', 'OO초등학교에서 가까운' → has_education_facility: true",
            "- '학군 좋은', '학교 가까운' → has_education_facility: true",
            "",
            "## 건축년도 파싱",
            "- '신축', '새 아파트' → build_year_range: '신축' (5년 이내)",
            "- '준신축' → build_year_range: '10년이하'",
            "- '구축' → build_year_range: '15년이상'",
            "- '10년 이내', '10년 미만' → build_year_range: '10년이하'",
            "- '2000년 이후', '2000년대' → min_build_year: 2000",
            "- '2010년~2020년 사이' → min_build_year: 2010, max_build_year: 2020",
            "",
            "## 건설사(builder_name) 파싱",
            "- '삼성', '삼성물산', '래미안' → builder_name: '삼성물산'",
            "- '현대', '현대건설', '힐스테이트' → builder_name: '현대건설'",
            "- '대우', '대우건설', '푸르지오' → builder_name: '대우건설'",
            "- '롯데', '롯데건설', '롯데캐슬' → builder_name: '롯데건설'",
            "- '자이' → builder_name: 'GS건설'",
            "",
            "## 응답 JSON 형식 (Strict JSON):",
            "반드시 아래 포맷을 지켜야 하며, 주석은 포함하지 마세요.",
            '{',
            '  "is_invalid": false,',
            '  "location": "지역명 또는 null",',
            '  "region_id": null,',
            '  "apartment_name": "아파트 이름 또는 null",',
            '  "min_area": 숫자 또는 null,',
            '  "max_area": 숫자 또는 null,',
            '  "min_price": 숫자 또는 null,',
            '  "max_price": 숫자 또는 null,',
            '  "min_deposit": 숫자 또는 null,',
            '  "max_deposit": 숫자 또는 null,',
            '  "min_monthly_rent": 숫자 또는 null,',
            '  "max_monthly_rent": 숫자 또는 null,',
            '  "subway_max_distance_minutes": 숫자 또는 null,',
            '  "subway_line": "노선 또는 null",',
            '  "subway_station": "역명 또는 null",',
            '  "has_education_facility": true/false/null,',
            '  "min_build_year": 숫자 또는 null,',
            '  "max_build_year": 숫자 또는 null,',
            '  "build_year_range": "신축/10년이하/15년이상/20년이하 또는 null",',
            '  "min_floor": 숫자 또는 null,',
            '  "max_floor": 숫자 또는 null,',
            '  "floor_type": "저층/중층/고층 또는 null",',
            '  "min_parking_cnt": 숫자 또는 null,',
            '  "has_parking": true/false/null,',
            '  "builder_name": "건설사명 또는 null",',
            '  "developer_name": null,',
            '  "heating_type": null,',
            '  "manage_type": null,',
            '  "hallway_type": null,',
            '  "recent_transaction_months": null,',
            '  "parsed_confidence": 0.0~1.0',
            '}',
            "",
            "## 주의사항",
            "- JSON 형식만 반환, 추가 설명 없음",
            "- 명확하지 않은 정보는 null",
            "- 숫자는 정확하게 변환 (평수 → ㎡, 억 → 만원)",
            "- parsed_confidence: 검색어 이해도 (0.0=이해못함, 1.0=완벽히 이해)",
        ]
        
        prompt = "\n".join(prompt_parts)
        return prompt


# 싱글톤 인스턴스
# GEMINI_API_KEY가 설정되어 있으면 인스턴스 생성, 없으면 None
try:
    ai_service = AIService() if settings.GEMINI_API_KEY else None
except ValueError:
    # API 키가 없어도 서비스는 시작할 수 있도록 None으로 설정
    ai_service = None
