"""
데이터 전처리 파이프라인

아파트명 정규화, 클렌징, 구조적 속성 추출 등
"""
import re
from typing import Optional, List, Tuple, Dict, Any
from difflib import SequenceMatcher

from .constants import (
    BRAND_DICT,
    BRAND_KEYWORD_TO_STANDARD,
    BRAND_KEYWORDS_SORTED,
    BRAND_ENG_TO_KOR,
    ROMAN_TO_INT,
    BUILDING_SUFFIXES,
)


class ApartmentNameProcessor:
    """
    아파트명 전처리 클래스
    
    전처리 파이프라인:
    1. 기본 클렌징 (특수문자, 공백 제거)
    2. 숫자 정규화 (한글/영문/전각 → 아라비아 숫자)
    3. 구조적 속성 추출 (단지, 차수, 브랜드, 동)
    4. 접미사 제거 (비교용)
    """
    
    def __init__(self):
        # 전처리된 이름 캐시 (성능 최적화)
        self._cache: Dict[str, Dict[str, Any]] = {}
    
    def process(self, name: str) -> Dict[str, Any]:
        """
        아파트명 전처리 및 속성 추출
        
        Args:
            name: 원본 아파트명
            
        Returns:
            전처리된 결과 딕셔너리:
            - original: 원본 이름
            - cleaned: 클렌징된 이름
            - normalized: 정규화된 이름 (비교용)
            - normalized_strict: 엄격 정규화 (단지/차수 제거)
            - block: 단지 번호 (1단지 → 1)
            - series: 차수 (1차 → 1)
            - brand: 표준 브랜드명
            - brand_in_parens: 괄호 안 브랜드명
            - block_in_parens: 괄호 안 단지번호
            - core: 핵심 이름 (브랜드/단지/차수 제거)
            - village: 마을 이름 (있는 경우)
        """
        if not name:
            return self._empty_result()
        
        # 캐시 확인
        cache_key = name.strip()
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        # 1단계: 기본 클렌징
        cleaned = self.clean_name(name)
        
        # 2단계: 구조적 속성 추출
        block = self.extract_block_number(name)
        series = self.extract_series_number(name)
        brand = self.extract_brand(name)
        brand_in_parens = self.extract_brand_from_parentheses(name)
        block_in_parens = self.extract_block_from_parentheses(name)
        village = self.extract_village_name(name)
        
        # 3단계: 정규화
        normalized = self.normalize_name(cleaned)
        normalized_strict = self.normalize_name_strict(cleaned)
        
        # 4단계: 핵심 이름 추출
        core = self.extract_core_name(cleaned)
        
        result = {
            'original': name,
            'cleaned': cleaned,
            'normalized': normalized,
            'normalized_strict': normalized_strict,
            'block': block,
            'series': series,
            'brand': brand,
            'brand_in_parens': brand_in_parens,
            'block_in_parens': block_in_parens,
            'core': core,
            'village': village,
        }
        
        # 캐시 저장
        self._cache[cache_key] = result
        return result
    
    def _empty_result(self) -> Dict[str, Any]:
        """빈 결과 반환"""
        return {
            'original': '',
            'cleaned': '',
            'normalized': '',
            'normalized_strict': '',
            'block': None,
            'series': None,
            'brand': None,
            'brand_in_parens': None,
            'block_in_parens': None,
            'core': '',
            'village': None,
        }
    
    # ========================================================
    # 1단계: 기본 클렌징
    # ========================================================
    
    def clean_name(self, name: str) -> str:
        """
        기본 클렌징
        
        - 괄호 안 내용 추출 후 괄호 제거
        - 특수문자 제거 (-, _, ., , 등)
        - "입주자대표회의", "관리사무소" 등 불필요한 접미사 제거
        """
        if not name:
            return ""
        
        result = name.strip()
        
        # 불필요한 접미사 제거
        remove_patterns = [
            r'입주자대표회의$',
            r'관리사무소$',
            r'관리사무실$',
            r'자치회$',
        ]
        for pattern in remove_patterns:
            result = re.sub(pattern, '', result)
        
        # 괄호 안 내용 추출 (메타데이터로 보존)
        # 괄호 제거는 normalize에서 수행
        
        # 특수문자 정리 (연속 공백 하나로)
        result = re.sub(r'[-_.,·]', ' ', result)
        result = re.sub(r'\s+', ' ', result)
        
        return result.strip()
    
    def normalize_numbers(self, text: str) -> str:
        """
        숫자 정규화
        
        - 한글 숫자 → 아라비아 숫자 (일, 이, 삼 → 1, 2, 3)
        - 로마 숫자 → 아라비아 숫자 (Ⅰ, Ⅱ, Ⅲ → 1, 2, 3)
        - 전각 숫자 → 반각 숫자 (１ → 1)
        """
        if not text:
            return ""
        
        result = text
        
        # 전각 숫자 → 반각
        fullwidth_to_half = str.maketrans(
            '０１２３４５６７８９',
            '0123456789'
        )
        result = result.translate(fullwidth_to_half)
        
        # 로마 숫자 → 아라비아 숫자
        for roman, num in ROMAN_TO_INT.items():
            result = result.replace(roman, str(num))
        
        # 한글 숫자 변환 (단지, 차 앞에서만)
        kor_numbers = {
            '일': '1', '이': '2', '삼': '3', '사': '4', '오': '5',
            '육': '6', '칠': '7', '팔': '8', '구': '9', '십': '10'
        }
        for kor, num in kor_numbers.items():
            result = re.sub(f'{kor}(단지|차|동)', f'{num}\\1', result)
        
        return result
    
    # ========================================================
    # 2단계: 구조적 속성 추출
    # ========================================================
    
    def extract_block_number(self, name: str) -> Optional[int]:
        """
        단지 번호 추출
        
        예시:
        - "1단지" → 1
        - "(1단지)" → 1
        - "1BL", "A블럭" → 1, A (숫자만 반환)
        """
        if not name:
            return None
        
        normalized = self.normalize_numbers(name)
        
        # 숫자+단지 패턴
        match = re.search(r'(\d+)\s*단지', normalized)
        if match:
            return int(match.group(1))
        
        # BL, 블럭 패턴
        match = re.search(r'(\d+)\s*(?:BL|블럭|블록)', normalized, re.IGNORECASE)
        if match:
            return int(match.group(1))
        
        return None
    
    def extract_series_number(self, name: str) -> Optional[int]:
        """
        차수 추출
        
        예시:
        - "1차" → 1
        - "2차아파트" → 2
        - "III차" → 3
        """
        if not name:
            return None
        
        normalized = self.normalize_numbers(name)
        
        # 숫자+차 패턴
        match = re.search(r'(\d+)\s*차(?:아파트)?', normalized)
        if match:
            return int(match.group(1))
        
        return None
    
    def extract_brand(self, name: str) -> Optional[str]:
        """
        브랜드명 추출 (표준 브랜드명 반환)
        
        - 긴 키워드부터 매칭 (e편한세상 > 편한세상)
        - 영문 → 한글 변환 후 매칭
        """
        if not name:
            return None
        
        # 소문자 변환 후 영문 브랜드 한글화
        lower_name = name.lower()
        for eng, kor in sorted(BRAND_ENG_TO_KOR.items(), key=lambda x: len(x[0]), reverse=True):
            lower_name = lower_name.replace(eng, kor)
        
        # 긴 키워드부터 매칭
        for keyword in BRAND_KEYWORDS_SORTED:
            if keyword in lower_name:
                return BRAND_KEYWORD_TO_STANDARD[keyword]
        
        return None
    
    def extract_brand_from_parentheses(self, name: str) -> Optional[str]:
        """
        괄호 안의 브랜드명 추출
        
        예시:
        - "효자촌(현대)" → "현대"
        - "후곡마을(건영15)" → "건영"
        """
        if not name:
            return None
        
        # 괄호 안 내용 추출
        match = re.search(r'\(([^)]+)\)', name)
        if not match:
            return None
        
        content = match.group(1)
        
        # 숫자 제거 후 브랜드 추출
        content_no_num = re.sub(r'\d+', '', content).strip()
        
        if content_no_num:
            # 브랜드 사전에서 찾기
            lower_content = content_no_num.lower()
            for keyword in BRAND_KEYWORDS_SORTED:
                if keyword in lower_content or lower_content in keyword:
                    return BRAND_KEYWORD_TO_STANDARD[keyword]
            # 사전에 없으면 그대로 반환
            return content_no_num
        
        return None
    
    def extract_block_from_parentheses(self, name: str) -> Optional[int]:
        """
        괄호 안의 단지 번호 추출
        
        예시:
        - "후곡마을(건영15)" → 15
        - "효자촌(1단지)" → 1
        """
        if not name:
            return None
        
        # 괄호 안 내용 추출
        match = re.search(r'\(([^)]+)\)', name)
        if not match:
            return None
        
        content = match.group(1)
        normalized = self.normalize_numbers(content)
        
        # 숫자+단지 패턴
        match = re.search(r'(\d+)\s*단지', normalized)
        if match:
            return int(match.group(1))
        
        # 브랜드명+숫자 패턴 (건영15 → 15)
        match = re.search(r'[가-힣]+(\d+)$', normalized)
        if match:
            return int(match.group(1))
        
        return None
    
    def extract_village_name(self, name: str) -> Optional[str]:
        """
        마을 이름 추출
        
        예시:
        - "한빛마을7단지" → "한빛마을"
        - "후곡마을" → "후곡마을"
        """
        if not name:
            return None
        
        # 마을 패턴
        match = re.search(r'([가-힣]+마을)', name)
        if match:
            return match.group(1)
        
        # 단지 앞의 이름
        match = re.search(r'([가-힣]+)\d*단지', name)
        if match:
            return match.group(1)
        
        return None
    
    # ========================================================
    # 3단계: 정규화
    # ========================================================
    
    def normalize_name(self, name: str) -> str:
        """
        아파트명 정규화 (비교용)
        
        - 소문자 변환
        - 영문 브랜드 한글화
        - 공백/특수문자 제거
        - 접미사 제거
        """
        if not name:
            return ""
        
        result = name.lower()
        
        # 영문 브랜드 한글화
        for eng, kor in sorted(BRAND_ENG_TO_KOR.items(), key=lambda x: len(x[0]), reverse=True):
            result = result.replace(eng, kor)
        
        # 숫자 정규화
        result = self.normalize_numbers(result)
        
        # 괄호 제거 (괄호 안 내용 포함)
        result = re.sub(r'\([^)]*\)', '', result)
        result = re.sub(r'\[[^\]]*\]', '', result)
        
        # 특수문자/공백 제거
        result = re.sub(r'[\s\-_.,·\'"!@#$%^&*]', '', result)
        
        # 접미사 제거
        for suffix in BUILDING_SUFFIXES:
            if result.endswith(suffix.lower()):
                result = result[:-len(suffix)]
                break
        
        return result
    
    def normalize_name_strict(self, name: str) -> str:
        """
        엄격 정규화 (단지/차수까지 제거)
        
        유사도 비교용 - 단지/차수 정보 없이 순수 이름만 비교
        """
        if not name:
            return ""
        
        result = self.normalize_name(name)
        
        # 단지 번호 제거
        result = re.sub(r'\d+단지', '', result)
        result = re.sub(r'\d+bl', '', result, flags=re.IGNORECASE)
        result = re.sub(r'\d+블[럭록]', '', result)
        
        # 차수 제거
        result = re.sub(r'\d+차', '', result)
        
        # 연속 숫자 (동 번호 등) 정리
        # 단, 브랜드명에 포함된 숫자는 유지 (SK뷰 등)
        
        return result
    
    # ========================================================
    # 4단계: 핵심 이름 추출
    # ========================================================
    
    def extract_core_name(self, name: str) -> str:
        """
        핵심 이름 추출 (브랜드/단지/차수 제거)
        
        예시:
        - "한빛마을7단지롯데캐슬1차" → "한빛마을"
        - "푸르지오더샵" → ""  (브랜드만 있는 경우)
        """
        if not name:
            return ""
        
        result = name.lower()
        
        # 브랜드 제거
        for keyword in BRAND_KEYWORDS_SORTED:
            result = result.replace(keyword, '')
        
        # 단지/차수 제거
        result = re.sub(r'\d+\s*단지', '', result)
        result = re.sub(r'\d+\s*차', '', result)
        
        # 특수문자/공백 제거
        result = re.sub(r'[\s\-_.,·\(\)\[\]]', '', result)
        
        # 접미사 제거
        for suffix in BUILDING_SUFFIXES:
            if result.endswith(suffix.lower()):
                result = result[:-len(suffix)]
                break
        
        return result


class DongNameProcessor:
    """
    동(읍면리) 이름 전처리 클래스
    """
    
    def __init__(self):
        self._cache: Dict[str, List[str]] = {}
    
    def normalize(self, dong_name: str) -> str:
        """
        동 이름 정규화
        
        예시:
        - "봉화읍 내성리" → "내성"
        - "춘양면 의양리" → "의양"
        """
        if not dong_name:
            return ""
        
        parts = dong_name.strip().split()
        if not parts:
            return ""
        
        # 마지막 부분 사용 (읍/면 뒤의 동/리)
        last_part = parts[-1]
        
        # 숫자 제거
        normalized = re.sub(r'\d+', '', last_part)
        
        # 접미사 제거
        normalized = normalized.replace("읍", "").replace("면", "").replace("리", "")
        normalized = normalized.replace("동", "").replace("가", "")
        
        return normalized.strip()
    
    def extract_candidates(self, dong_name: str) -> List[str]:
        """
        동 이름에서 매칭 후보 추출
        
        예시:
        - "봉화읍 내성리" → ["봉화읍 내성리", "내성리", "봉화읍", "내성", "봉화"]
        """
        if not dong_name:
            return []
        
        cache_key = dong_name.strip()
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        candidates = [dong_name.strip()]
        parts = dong_name.strip().split()
        
        if len(parts) > 1:
            candidates.append(parts[-1])  # 마지막 부분
            candidates.append(parts[0])   # 첫 부분
        
        # 정규화된 버전 추가
        for candidate in candidates[:]:
            no_digit = re.sub(r'\d+', '', candidate)
            if no_digit != candidate:
                candidates.append(no_digit)
            
            # 접미사 제거 버전
            cleaned = no_digit.replace("읍", "").replace("면", "").replace("리", "")
            cleaned = cleaned.replace("동", "").replace("가", "").strip()
            if cleaned and cleaned != candidate:
                candidates.append(cleaned)
        
        # 중복 제거 및 빈 문자열 제거
        result = list(dict.fromkeys([c for c in candidates if c]))
        
        self._cache[cache_key] = result
        return result


class BunjiProcessor:
    """
    지번 전처리 클래스
    """
    
    @staticmethod
    def normalize(jibun: str) -> Tuple[Optional[str], Optional[str]]:
        """
        지번 정규화 및 본번/부번 분리
        
        예시:
        - "123-45" → ("123", "45")
        - "123" → ("123", None)
        - "산37-6" → ("37", "6")  # 산지번 처리
        - "지구BL 34-7" → ("34", "7")  # 지구 번호 처리
        - "2745-2-1" → ("2745", "2")  # 본번-부번-부부번 처리 (부부번은 부번에 포함)
        """
        if not jibun:
            return (None, None)
        
        # 공백 정리
        normalized = re.sub(r'\s+', '', jibun)
        
        #  산지번 처리: "산37-6" → "37-6"
        if normalized.startswith('산'):
            normalized = normalized[1:]  # "산" 제거
        
        #  지구 번호 처리: "지구BL34-7" → "34-7", "가정2지구34-7" → "34-7"
        # 지구, BL, 블록 등 키워드 제거 후 숫자 패턴 추출
        if '지구' in normalized or 'BL' in normalized.upper() or '블록' in normalized:
            # 숫자 패턴만 추출 (예: "지구BL34-7" → "34-7")
            num_match = re.search(r'(\d+)(?:-(\d+))?(?:-(\d+))?', normalized)
            if num_match:
                main = num_match.group(1).lstrip('0')
                sub = num_match.group(2).lstrip('0') if num_match.group(2) else None
                # 부부번이 있으면 부번으로 통합 (예: "2745-2-1" → 본번="2745", 부번="2")
                # 또는 부부번을 무시하고 부번만 사용
                return (main, sub)
        
        #  본번-부번-부부번 처리: "2745-2-1" → 본번="2745", 부번="2"
        # 부부번은 일반적으로 부번의 일부이므로 부번으로 통합
        if normalized.count('-') >= 2:
            # 첫 번째 하이픈까지만 분리 (본번-부번)
            parts = normalized.split('-', 2)
            main = parts[0].lstrip('0')
            # 부번과 부부번을 합치지 않고 부번만 사용 (부부번은 무시)
            sub = parts[1].lstrip('0') if len(parts) > 1 and parts[1] else None
            return (main, sub)
        
        # 일반 본번-부번 분리
        if '-' in normalized:
            parts = normalized.split('-', 1)
            main = parts[0].lstrip('0')
            sub = parts[1].lstrip('0') if len(parts) > 1 and parts[1] else None
            return (main, sub)
        
        # 본번만 있는 경우
        main = normalized.lstrip('0')
        return (main, None)
    
    @staticmethod
    def match_score(jibun1: str, jibun2: str) -> float:
        """
        지번 매칭 점수 계산 (0~40)
        
        - 본번+부번 완전 일치: 40점
        - 본번만 일치: 20점
        - 불일치: 0점
        """
        main1, sub1 = BunjiProcessor.normalize(jibun1)
        main2, sub2 = BunjiProcessor.normalize(jibun2)
        
        if not main1 or not main2:
            return 0.0
        
        # 본번 비교
        if main1 != main2:
            return 0.0
        
        # 본번 일치 + 부번 비교
        if sub1 and sub2 and sub1 == sub2:
            return 40.0  # 완전 일치
        
        return 20.0  # 본번만 일치


def calculate_similarity(str1: str, str2: str) -> float:
    """
    문자열 유사도 계산 (0.0 ~ 1.0)
    
    Token Set Ratio 방식 사용 (단어 순서 무관)
    """
    if not str1 or not str2:
        return 0.0
    
    # 기본 SequenceMatcher 사용
    return SequenceMatcher(None, str1, str2).ratio()


def token_set_similarity(str1: str, str2: str) -> float:
    """
    토큰 기반 유사도 계산 (단어 순서 무관)
    
    예시:
    - "살구마을동아서광" vs "살구골마을서광성지동아" → 높은 점수
    """
    if not str1 or not str2:
        return 0.0
    
    # 문자 단위 집합 비교 (한글 특성상)
    set1 = set(str1)
    set2 = set(str2)
    
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    
    if union == 0:
        return 0.0
    
    # Jaccard 유사도 + SequenceMatcher 결합
    jaccard = intersection / union
    seq_ratio = calculate_similarity(str1, str2)
    
    return (jaccard + seq_ratio) / 2


# 싱글톤 인스턴스
_apt_processor: Optional[ApartmentNameProcessor] = None
_dong_processor: Optional[DongNameProcessor] = None


def get_apt_processor() -> ApartmentNameProcessor:
    """ApartmentNameProcessor 싱글톤 인스턴스 반환"""
    global _apt_processor
    if _apt_processor is None:
        _apt_processor = ApartmentNameProcessor()
    return _apt_processor


def get_dong_processor() -> DongNameProcessor:
    """DongNameProcessor 싱글톤 인스턴스 반환"""
    global _dong_processor
    if _dong_processor is None:
        _dong_processor = DongNameProcessor()
    return _dong_processor
