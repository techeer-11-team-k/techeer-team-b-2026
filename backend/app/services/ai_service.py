"""
AI 서비스

Gemini API를 사용한 AI 기능 제공
"""
import json
import re
from typing import Optional, Dict, Any
import httpx
from app.core.config import settings
from app.core.exceptions import ExternalAPIException


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
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    url,
                    headers=headers,
                    params=params,
                    json=body
                )
                response.raise_for_status()
                
                data = response.json()
                
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
                            
                            return text
                
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
                raise ExternalAPIException(f"Gemini API 네트워크 오류: {str(e)}")
            except json.JSONDecodeError as e:
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
        # gemini-2.5-flash: 빠르고 효율적
        # 한국어는 토큰 수가 더 필요하므로 충분히 큰 값 설정
        # 500자 한국어 텍스트는 약 300-400 토큰이 필요하지만, 여유있게 설정
        compliment = await self.generate_text(
            prompt=prompt,
            model="gemini-2.5-flash",  # 빠른 응답을 위해 flash 모델 사용
            temperature=0.8,  # 창의적인 칭찬글을 위해 온도 높게 설정
            max_tokens=2000  # 한국어는 토큰 수가 더 필요하므로 충분히 증가 (1000 -> 2000)
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


# 싱글톤 인스턴스
# GEMINI_API_KEY가 설정되어 있으면 인스턴스 생성, 없으면 None
try:
    ai_service = AIService() if settings.GEMINI_API_KEY else None
except ValueError:
    # API 키가 없어도 서비스는 시작할 수 있도록 None으로 설정
    ai_service = None
