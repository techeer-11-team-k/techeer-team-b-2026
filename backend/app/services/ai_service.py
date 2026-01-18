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
        model: str = "gemini-2.5-flash",
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
        
        # 속도 최적화: timeout 줄이기 (10초면 충분, 연결은 3초)
        api_start_time = time.time()
        logger.info(f"[AI_SERVICE] Gemini API 호출 시작 - 모델: {model}, 시간: {datetime.now().isoformat()}")
        
        # HTTP 클라이언트 최적화: 연결 풀 재사용 및 타임아웃 최적화
        timeout_config = httpx.Timeout(10.0, connect=3.0)  # 전체 10초, 연결 3초
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
                    if finish_reason == "MAX_TOKENS":
                        # 토큰 제한에 도달하여 응답이 잘렸을 가능성
                        # max_tokens를 늘려야 할 수 있음
                        pass  # 경고는 로그로 남기고 계속 진행
                    
                    if "content" in candidate and "parts" in candidate["content"]:
                        parts = candidate["content"]["parts"]
                        if len(parts) > 0 and "text" in parts[0]:
                            text = parts[0]["text"].strip()
                            
                            # finishReason이 MAX_TOKENS인 경우 경고 메시지 추가 (디버깅용)
                            if finish_reason == "MAX_TOKENS":
                                # 로그는 나중에 추가 가능, 일단 텍스트 반환
                                pass
                            
                            api_end_time = time.time()
                            api_duration = api_end_time - api_start_time
                            logger.info(f"[AI_SERVICE] Gemini API 전체 완료 - 총 소요시간: {api_duration:.3f}초 (요청: {request_duration:.3f}초, 파싱: {parse_duration:.3f}초), 시간: {datetime.now().isoformat()}")
                            logger.info(f"[AI_SERVICE] 생성된 텍스트 길이: {len(text)}자")
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
        # 속도 최적화: max_tokens 줄이기 (200자 이내이므로 500 토큰이면 충분)
        compliment = await self.generate_text(
            prompt=prompt,
            model="gemini-2.5-flash",  # 빠른 응답을 위해 flash 모델 사용
            temperature=0.7,  # 창의적인 칭찬글을 위해 중간 온도 설정 (속도 향상)
            max_tokens=500  # 200자 이내이므로 500 토큰이면 충분 (속도 향상)
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
        exclusive_area = property_data.get("exclusive_area")
        current_market_price = property_data.get("current_market_price")
        memo = property_data.get("memo", "")
        education_facility = property_data.get("education_facility")
        subway_line = property_data.get("subway_line")
        subway_station = property_data.get("subway_station")
        subway_time = property_data.get("subway_time")
        
        # 위치 정보 구성
        location_info = ""
        if city_name and region_name:
            location_info = f"{city_name} {region_name}"
        elif city_name:
            location_info = city_name
        elif region_name:
            location_info = region_name
        
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
            f"- 전용면적: {exclusive_area}㎡" if exclusive_area else "",
            f"- 현재 시세: {current_market_price:,}만원" if current_market_price else "",
            f"- 교육 시설: {education_facility}" if education_facility else "",
            f"- 지하철 접근성: {subway_info}" if subway_info else "",
            f"- 메모: {memo}" if memo else "",
            "",
            "위 정보를 바탕으로 이 집에 대한 따뜻하고 긍정적인 칭찬글을 작성해주세요.",
            "",
            "작성 규칙:",
            "- 집의 전용 면적이 50m^2 이하일 경우 면적을 언급하지 말 것."
            "- 사무적인 말투로 작성할것. ~합니다. ~입니다. 같은 느낌으로 끝나야함.",
            "- 미사여구 대신 아파트의 장점을 최대한 전달해줘, 편안하고 아늑한 같은 말은 쓰지마."
            "- 지하철까지 걸리는시간이 10분 이상일 경우 지하철까지 걸리는 시간을 언급하지 말 것",
            "- 공백 포함 200자 이내로 작성해줘줘",
            "- 부동산 투자 조언이나 추천은 포함하지 않음",
            "- 문서에 대한 순서는 위치,시세, 면적, 지하철역 정보,교육시설 순으로 작성해줘. ",
            "- 집의 장점과 특징을 자연스럽게 강조 (위치, 면적, 교육 시설, 교통 접근성 등)",
            "- 교육 시설이나 지하철 접근성 정보가 있으면 이를 칭찬에 포함하세요",
            "- 따뜻하고 긍정적인 톤 유지",
            "- 한국어로 작성",
            "- 제목, 라벨, 헤더 없이 바로 본문 내용만 작성",
            "",
            "예시 형식 (이 형식 그대로 따르세요):",
            "이 집은 정말 멋진 곳이네요! [집의 특징과 장점을 자연스럽게 설명]..."
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
        자연어 검색 쿼리 파싱을 위한 프롬프트 구성 (최적화된 간소 버전)
        
        Args:
            query: 자연어 검색 쿼리
        
        Returns:
            프롬프트 문자열
        """
        # 프롬프트 간소화 (속도 향상 - 불필요한 설명 제거)
        prompt_parts = [
            f"검색어: {query}",
            "",
            "JSON 형식으로 검색 조건 추출:",
            "",
            "위치(location): 지역명 추출 (예: '강남구', '서울시 강남구'). 없으면 null",
            "",
            "가격 파싱 규칙 (중요):",
            "  * 기본값은 매매가(min_price, max_price)입니다",
            "  * '4억', '5억 넘는', '3억~5억' 등 가격만 언급하면 → 매매가로 파싱",
            "  * '전세 3억', '전세 보증금 2억' 등 '전세'를 명시하면 → min_deposit, max_deposit 사용",
            "  * '월세 100만원', '월세 50~100만원' 등 '월세'를 명시하면 → min_monthly_rent, max_monthly_rent 사용",
            "",
            "매매 가격 (기본값):",
            "- '5억' → min_price: 50000만원",
            "- '3억~5억' → min_price: 30000, max_price: 50000",
            "- '4억 넘는' → min_price: 40000",
            "- '5억 이하' → max_price: 50000",
            "",
            "전세 가격 (명시적 언급 시에만):",
            "- '전세 9억 이하' → max_deposit: 90000 (만원)",
            "- '전세 5억 이상' → min_deposit: 50000",
            "- '전세 2억~3억' → min_deposit: 20000, max_deposit: 30000",
            "- 전세 언급 시 매매가격(min_price, max_price)은 null",
            "",
            "월세 가격 (명시적 언급 시에만):",
            "- '월세 100만원' → min_monthly_rent: 100, max_monthly_rent: 100",
            "- '월세 50~100만원' → min_monthly_rent: 50, max_monthly_rent: 100",
            "",
            "평수(min_area, max_area): ㎡ 단위 (1평=3.3058㎡)",
            "- '30평대' → min_area: 84.0, max_area: 114.0",
            "",
            "지하철: subway_max_distance_minutes (분), subway_line, subway_station",
            "",
            "교육시설: has_education_facility (true/false/null)",
            "",
            "응답 형식 (JSON만 반환, 설명 없음):",
            '{',
            '  "location": "지역명 또는 null",',
            '  "region_id": null,',
            '  "min_deposit": 숫자 또는 null,',
            '  "max_deposit": 숫자 또는 null,',
            '  "min_monthly_rent": 숫자 또는 null,',
            '  "max_monthly_rent": 숫자 또는 null,',
            '  "min_price": 숫자 또는 null,',
            '  "max_price": 숫자 또는 null,',
            '  "min_area": 숫자 또는 null,',
            '  "max_area": 숫자 또는 null,',
            '  "subway_max_distance_minutes": 숫자 또는 null,',
            '  "subway_line": "노선 또는 null",',
            '  "subway_station": "역명 또는 null",',
            '  "has_education_facility": true/false/null,',
            '  "parsed_confidence": 0.9',
            '}',
            "",
            "4. **지하철 관련 (subway_max_distance_minutes, subway_line, subway_station)**:",
            "   - 지하철역까지 도보 시간: '10분 이내', '10분 이하' → subway_max_distance_minutes: 10",
            "   - '5분~10분' → subway_max_distance_minutes: 10",
            "   - '지하철 근처', '지하철역 가까운' → subway_max_distance_minutes: 10 (기본값)",
            "   - 지하철 노선: '2호선', '3호선', '분당선' → subway_line",
            "   - 지하철 역명: '강남역', '홍대입구역', '잠실역' → subway_station",
            "   - 없으면 null",
            "",
            "5. **교육시설 (has_education_facility)**:",
            "   - '초등학교 근처', '학교 근처', '교육시설 있음' → true",
            "   - '교육시설 없음' → false",
            "   - 없으면 null",
            "",
            "6. **건축년도 (min_build_year, max_build_year, build_year_range)**:",
            "   - '신축', '신규', '최근 건축' → build_year_range: '신축' (2020년 이후)",
            "   - '10년 이하', '10년 미만' → build_year_range: '10년이하' (2014년 이후)",
            "   - '20년 이하', '20년 미만' → build_year_range: '20년이하' (2004년 이후)",
            "   - '2000년 이후', '2000년대' → min_build_year: 2000",
            "   - '2010년~2020년' → min_build_year: 2010, max_build_year: 2020",
            "   - 없으면 null",
            "",
            "7. **층수 (min_floor, max_floor, floor_type)**:",
            "   - '저층', '낮은 층' → floor_type: '저층' (1~5층)",
            "   - '중층', '중간 층' → floor_type: '중층' (6~15층)",
            "   - '고층', '높은 층' → floor_type: '고층' (16층 이상)",
            "   - '5층 이상', '10층 이상' → min_floor: 5 또는 10",
            "   - '20층 이하', '15층 이하' → max_floor: 20 또는 15",
            "   - 없으면 null",
            "",
            "8. **주차 (min_parking_cnt, has_parking)**:",
            "   - '주차 가능', '주차 있음' → has_parking: true",
            "   - '주차 불가', '주차 없음' → has_parking: false",
            "   - '주차대수 100대 이상' → min_parking_cnt: 100",
            "   - 없으면 null",
            "",
            "9. **건설사/시공사 (builder_name, developer_name)**:",
            "   - '롯데건설', '삼성물산', '현대건설' → builder_name",
            "   - '시공사 롯데', '시공사 삼성' → developer_name",
            "   - 없으면 null",
            "",
            "10. **난방방식 (heating_type)**:",
            "   - '지역난방', '중앙난방' → heating_type: '지역난방'",
            "   - '개별난방', '개별 난방' → heating_type: '개별난방'",
            "   - 없으면 null",
            "",
            "11. **관리방식 (manage_type)**:",
            "   - '자치관리', '자치 관리' → manage_type: '자치관리'",
            "   - '위탁관리', '위탁 관리' → manage_type: '위탁관리'",
            "   - 없으면 null",
            "",
            "12. **복도유형 (hallway_type)**:",
            "   - '계단식', '계단형' → hallway_type: '계단식'",
            "   - '복도식', '복도형' → hallway_type: '복도식'",
            "   - '혼합식' → hallway_type: '혼합식'",
            "   - 없으면 null",
            "",
            "13. **최근 거래일 (recent_transaction_months)**:",
            "   - '최근 3개월 거래', '3개월 이내 거래' → recent_transaction_months: 3",
            "   - '최근 6개월', '6개월 이내' → recent_transaction_months: 6",
            "   - '최근 1년', '12개월 이내' → recent_transaction_months: 12",
            "   - 없으면 null",
            "",
            "## 응답 형식",
            "",
            "다음 JSON 형식으로 응답해주세요:",
            "{",
            '  "location": "지역명 또는 null",',
            '  "region_id": null,  // 지역 ID는 null로 설정 (백엔드에서 조회)',
            '  "apartment_name": "아파트 이름 또는 null",',
            '  "min_area": 숫자 또는 null,  // 최소 전용면적 (㎡)',
            '  "max_area": 숫자 또는 null,  // 최대 전용면적 (㎡)',
            '  "min_price": 숫자 또는 null,  // 최소 매매가격 (만원)',
            '  "max_price": 숫자 또는 null,  // 최대 매매가격 (만원)',
            '  "min_deposit": 숫자 또는 null,  // 최소 보증금 (만원, 전세/월세)',
            '  "max_deposit": 숫자 또는 null,  // 최대 보증금 (만원, 전세/월세)',
            '  "min_monthly_rent": 숫자 또는 null,  // 최소 월세 (만원)',
            '  "max_monthly_rent": 숫자 또는 null,  // 최대 월세 (만원)',
            '  "subway_max_distance_minutes": 숫자 또는 null,  // 지하철역까지 최대 도보 시간 (분)',
            '  "subway_line": "지하철 노선 또는 null",  // 예: "2호선", "3호선"',
            '  "subway_station": "지하철 역명 또는 null",  // 예: "강남역", "홍대입구역"',
            '  "has_education_facility": true/false/null,  // 교육시설 유무',
            '  "min_build_year": 숫자 또는 null,  // 최소 건축년도',
            '  "max_build_year": 숫자 또는 null,  // 최대 건축년도',
            '  "build_year_range": "건축년도 범위 또는 null",  // 예: "신축", "10년이하", "20년이하"',
            '  "min_floor": 숫자 또는 null,  // 최소 층수',
            '  "max_floor": 숫자 또는 null,  // 최대 층수',
            '  "floor_type": "층수 유형 또는 null",  // 예: "저층", "중층", "고층"',
            '  "min_parking_cnt": 숫자 또는 null,  // 최소 주차대수',
            '  "has_parking": true/false/null,  // 주차 가능 여부',
            '  "builder_name": "건설사명 또는 null",  // 예: "롯데건설", "삼성물산"',
            '  "developer_name": "시공사명 또는 null",',
            '  "heating_type": "난방방식 또는 null",  // 예: "지역난방", "개별난방"',
            '  "manage_type": "관리방식 또는 null",  // 예: "자치관리", "위탁관리"',
            '  "hallway_type": "복도유형 또는 null",  // 예: "계단식", "복도식", "혼합식"',
            '  "recent_transaction_months": 숫자 또는 null,  // 최근 거래 기간 (개월)',
            '  "parsed_confidence": 0.0~1.0  // 파싱 신뢰도 (0.0~1.0)',
            "}",
            "",
            "## 주의사항",
            "- 명확하지 않은 정보는 null로 설정",
            "- 숫자는 정확하게 변환 (평수 → ㎡, 억 → 만원)",
            "- JSON 형식만 반환하고 추가 설명은 하지 않음",
            "- 한국어로 된 지역명은 그대로 사용",
            "- 모든 필드는 선택사항이며, 언급되지 않은 조건은 null로 설정",
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
