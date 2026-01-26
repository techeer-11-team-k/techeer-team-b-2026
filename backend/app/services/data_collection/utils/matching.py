"""
아파트 매칭 유틸리티 모듈

아파트 이름 정규화 및 매칭 관련 함수들을 제공합니다.
"""
import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from difflib import SequenceMatcher

from app.models import Apartment, ApartDetail
from app.utils.search_utils import BRAND_ENG_TO_KOR
from app.services.apt_matching import (
    BRAND_KEYWORD_TO_STANDARD,
    BUILD_YEAR_TOLERANCE,
)

logger = logging.getLogger(__name__)

# 한국 대표 아파트 브랜드명 사전 (정규화된 형태로 저장, 긴 것 우선)
APARTMENT_BRANDS = [
    # 복합 브랜드명 (먼저 매칭, 긴 것부터)
    '롯데캐슬파크타운', '롯데캐슬골드타운', '롯데캐슬', 
    '현대힐스테이트', '힐스테이트',
    '이편한세상', 'e편한세상', '편한세상',
    '한라비발디', '비발디',
    '호반써밋', '써밋',
    '우미린',
    '래미안', '라미안',
    '푸르지오',
    '더샵', 'the샵',
    '아이파크',
    '자이', 'xi',
    '위브', '두산위브',
    'sk뷰', 'sk스카이뷰', '에스케이뷰',
    '꿈에그린', '포레나',
    '베스트빌', '어울림',
    '로얄듀크',
    '스윗닷홈', '예가',
    '센트레빌',
    '아크로',
    '사랑으로',
    's클래스', '중흥s클래스', '중흥',
    '수자인', '나빌래', '스타클래스', '노빌리티', '스카이뷰',
    # 추가 브랜드 (누락되어 있던 것들)
    '스위첸', 'kcc스위첸',  # KCC건설
    '트라팰리스', '삼성트라팰리스',  # 삼성물산
    '파크리오', '반포파크리오',  # 삼성물산
    '휴먼시아',  # LH공사
    '마제스티', '신세계빌리브',  # 신세계건설
    '하이츠',  # 일반 접미사
    '아너스빌', '경남아너스빌',  # 경남기업
    '시그니처', '더퍼스트',  # 일반 브랜드
    '트레지움', '두레미담',  # 한화건설
    '프레스티지', '르네상스',  # 일반 브랜드
    '캐슬골드', '드림타운',  # 일반 브랜드
    # 건설사 브랜드
    '현대', '삼성', '대림', '대우', '동아', '극동', '벽산', '금호', '동부',
    '신동아', '신성', '주공', '한신', '태영', '진흥', '동일', '건영',
    '우방', '한양', '성원', '경남', '동문', '풍림', '신안', '선경',
    '효성', '코오롱', '대방', '동성', '일신', '청구', '삼익', '진로',
    '부영', '쌍용', '캐슬', '린', '금강', '럭키', '임광', '동신',
    '화성', '대창', '서안', '영풍', '세영', '동양', '한진',
]

# 마을/단지 접미사 패턴
VILLAGE_SUFFIXES = ['마을', '단지', '타운', '빌리지', '파크', '시티', '힐스', '뷰']

#  임대 아파트 키워드 (같은 지번에 임대+분양 공존 시 구분)
RENTAL_KEYWORDS = [
    '임대', 'lh', 'LH', '주공', '도시공사', '영구임대', '휴먼시아',
    '도개공', '부산도시공사', '가양도시개발공사', '서울도시공사',
    '공공임대', '사원임대', '사회주택', '소셜믹스', '임대동',
    '영구', '매입임대', '전세임대', '행복주택',
]


class ApartmentMatcher:
    """
    아파트 매칭 유틸리티 클래스
    
    아파트 이름 정규화 및 매칭 관련 함수들을 제공합니다.
    """
    
    @staticmethod
    def match_by_apt_seq(
        apt_seq: str,
        candidates: List[Apartment]
    ) -> Optional[Apartment]:
        """
         0단계 (최우선): apt_seq 직접 매칭
        
        매매/전월세 API에서 제공하는 aptSeq를 DB의 apt_seq와 직접 비교합니다.
        이 방법은 가장 빠르고 정확합니다.
        
        Args:
            apt_seq: API에서 받은 aptSeq (예: "41480-40")
            candidates: 후보 아파트 리스트
            
        Returns:
            매칭된 Apartment 객체 또는 None
        """
        if not apt_seq or not candidates:
            return None
        
        # 정규화: 앞뒤 공백 제거
        apt_seq_clean = apt_seq.strip()
        
        for apt in candidates:
            # apt_seq 속성이 있고 일치하면 바로 반환
            if hasattr(apt, 'apt_seq') and apt.apt_seq:
                if apt.apt_seq.strip() == apt_seq_clean:
                    logger.debug(f" apt_seq 직접 매칭 성공: {apt_seq} → {apt.apt_name}")
                    return apt
        
        return None
    
    @staticmethod
    def match_by_jibun_parts(
        jibun_bonbun: str,
        jibun_bubun: Optional[str],
        region_id: int,
        candidates: List[Apartment],
        apt_details: Optional[Dict[int, 'ApartDetail']] = None
    ) -> Optional[Apartment]:
        """
         지번 본번/부번 분리 매칭
        
        apart_details 테이블의 jibun_bonbun, jibun_bubun 컬럼을 활용한 빠른 매칭입니다.
        
        Args:
            jibun_bonbun: 지번 본번 (예: "553")
            jibun_bubun: 지번 부번 (예: "2" 또는 None)
            region_id: 지역 ID (동 필터링용)
            candidates: 후보 아파트 리스트
            apt_details: 아파트 상세 정보 딕셔너리
            
        Returns:
            매칭된 Apartment 객체 또는 None
        """
        if not jibun_bonbun or not candidates or not apt_details:
            return None
        
        bonbun_clean = jibun_bonbun.strip().lstrip('0')
        bubun_clean = jibun_bubun.strip().lstrip('0') if jibun_bubun else None
        
        for apt in candidates:
            # 지역 ID 필터링
            if apt.region_id != region_id:
                continue
            
            if apt.apt_id not in apt_details:
                continue
            
            detail = apt_details[apt.apt_id]
            
            # jibun_bonbun/bubun 속성 확인
            if hasattr(detail, 'jibun_bonbun') and detail.jibun_bonbun:
                db_bonbun = detail.jibun_bonbun.strip().lstrip('0')
                db_bubun = detail.jibun_bubun.strip().lstrip('0') if hasattr(detail, 'jibun_bubun') and detail.jibun_bubun else None
                
                # 본번 일치 확인
                if db_bonbun == bonbun_clean:
                    # 부번 일치 확인
                    if bubun_clean is None and db_bubun is None:
                        logger.debug(f" 지번 본번 매칭 성공: {bonbun_clean} → {apt.apt_name}")
                        return apt
                    elif bubun_clean is not None and db_bubun is not None and bubun_clean == db_bubun:
                        logger.debug(f" 지번 본번+부번 매칭 성공: {bonbun_clean}-{bubun_clean} → {apt.apt_name}")
                        return apt
        
        return None
    
    @staticmethod
    def match_by_address_and_jibun(
        full_region_code: str,
        jibun: str,
        bonbun: Optional[str] = None,
        bubun: Optional[str] = None,
        candidates: List[Apartment] = None,
        apt_details: Optional[Dict[int, ApartDetail]] = None,
        all_regions: Optional[Dict[int, Any]] = None
    ) -> Optional[Apartment]:
        """
         최우선 매칭: 법정동 코드 10자리 + 지번(부번까지) 정확 매칭
        
        법정동 코드 10자리와 지번(본번-부번)이 모두 일치하면 이름과 관계없이 매칭합니다.
        이는 95% 신뢰구간에서 같은 부동산을 가리키는 것으로 간주됩니다.
        
        Args:
            full_region_code: 법정동 코드 10자리 (시도 2 + 시군구 3 + 읍면동 5)
            jibun: 지번 문자열 (예: "1101-1")
            bonbun: 본번 (API에서 직접 제공되는 경우)
            bubun: 부번 (API에서 직접 제공되는 경우)
            candidates: 후보 아파트 리스트
            apt_details: 아파트 상세 정보 딕셔너리
            all_regions: 지역 정보 딕셔너리
            
        Returns:
            매칭된 Apartment 객체 또는 None
        """
        if not full_region_code or not jibun or not candidates:
            return None
        
        # 본번-부번 추출 (bonbun/bubun이 있으면 우선 사용)
        if bonbun:
            api_main = bonbun.lstrip('0') if bonbun else None
            api_sub = bubun.lstrip('0') if bubun and bubun != "0" and bubun != "" else None
        else:
            #  개선: jibun에서 본번-부번 추출 (산지번, 지구번호, 본번-부번-부부번 처리)
            jibun_clean = jibun.strip()
            
            # 산지번 처리: "산37-6" → 본번="37", 부번="6"
            if jibun_clean.startswith('산'):
                jibun_clean = jibun_clean[1:]  # "산" 제거
            
            # 지구 번호 처리: "지구BL 34-7" → 본번="34", 부번="7"
            if '지구' in jibun_clean or 'BL' in jibun_clean.upper() or '블록' in jibun_clean:
                # 숫자 패턴만 추출
                jibun_parts = re.search(r'(\d+)(?:-(\d+))?(?:-(\d+))?', jibun_clean)
                if jibun_parts:
                    api_main = jibun_parts.group(1).lstrip('0')
                    # 부부번이 있으면 부번으로 통합 (또는 무시)
                    api_sub = jibun_parts.group(2).lstrip('0') if jibun_parts.group(2) else None
                else:
                    api_main = None
                    api_sub = None
            else:
                # 일반 지번 처리 (본번-부번-부부번 포함)
                jibun_parts = re.match(r'(\d+)(?:-(\d+))?(?:-(\d+))?', jibun_clean)
                if jibun_parts:
                    api_main = jibun_parts.group(1).lstrip('0')
                    # 부부번이 있으면 부번만 사용 (부부번은 무시)
                    api_sub = jibun_parts.group(2).lstrip('0') if jibun_parts.group(2) else None
                else:
                    api_main = None
                    api_sub = None
        
        if not api_main:
            return None
        
        # 법정동 코드 10자리 일치하는 후보 필터링
        matching_apts = []
        for apt in candidates:
            if apt.region_id not in all_regions:
                continue
            
            region = all_regions[apt.region_id]
            if region.region_code != full_region_code:
                continue
            
            matching_apts.append(apt)
        
        if not matching_apts:
            return None
        
        # 지번 주소에서 본번-부번 추출하여 정확 매칭
        for apt in matching_apts:
            if apt.apt_id not in apt_details:
                continue
            
            detail = apt_details[apt.apt_id]
            if not detail.jibun_address:
                continue
            
            #  개선: DB 지번 주소에서 동 이름과 지번을 더 정확히 추출
            # 패턴: "동이름 지번" 또는 "동이름 지번-부번" 또는 "동이름 지번-부번-부부번"
            # 산지번, 지구번호도 처리
            dong_jibun_pattern = r'([가-힣]+(?:동|가|리|읍|면))\s+(?:산)?(\d+)(?:-(\d+))?(?:-(\d+))?(?:\s|$)'
            db_dong_jibun_match = re.search(dong_jibun_pattern, detail.jibun_address)
            
            if db_dong_jibun_match:
                db_main = db_dong_jibun_match.group(2).lstrip('0')  # 본번
                # 부부번이 있으면 부번만 사용 (부부번은 무시)
                db_sub = db_dong_jibun_match.group(3).lstrip('0') if db_dong_jibun_match.group(3) else None  # 부번
            else:
                #  개선: 산지번, 지구번호, 본번-부번-부부번 처리
                # 산지번 패턴: "산37-6"
                san_match = re.search(r'산\s*(\d+)(?:-(\d+))?(?:-(\d+))?', detail.jibun_address)
                if san_match:
                    db_main = san_match.group(1).lstrip('0')
                    db_sub = san_match.group(2).lstrip('0') if san_match.group(2) else None
                else:
                    # 지구 번호 패턴: "지구BL 34-7" 또는 "가정2지구34-7"
                    jigu_match = re.search(r'지구[^\d]*(\d+)(?:-(\d+))?(?:-(\d+))?', detail.jibun_address)
                    if not jigu_match:
                        jigu_match = re.search(r'BL[^\d]*(\d+)(?:-(\d+))?(?:-(\d+))?', detail.jibun_address, re.IGNORECASE)
                    if jigu_match:
                        db_main = jigu_match.group(1).lstrip('0')
                        db_sub = jigu_match.group(2).lstrip('0') if jigu_match.group(2) else None
                    else:
                        # 일반 지번 패턴 (본번-부번-부부번 포함)
                        db_jibun_match = re.search(r'(\d+)(?:-(\d+))?(?:-(\d+))?(?:\s|$)', detail.jibun_address)
                        if not db_jibun_match:
                            continue
                        db_main = db_jibun_match.group(1).lstrip('0')
                        # 부부번이 있으면 부번만 사용 (부부번은 무시)
                        db_sub = db_jibun_match.group(2).lstrip('0') if db_jibun_match.group(2) else None
            
            # 본번 일치 확인
            if api_main == db_main:
                #  개선: 부번 매칭 로직 강화
                # 1. 둘 다 부번이 없으면 매칭
                # 2. 둘 다 부번이 있고 같으면 매칭
                # 3. API에 부번이 있고 DB에 부번이 없으면 조건부 매칭 (유연한 매칭)
                if api_sub is None and db_sub is None:
                    # 둘 다 부번이 없음 → 정확 매칭
                    logger.debug(f" 주소+지번 정확 매칭 (본번만): 법정동코드={full_region_code}, 지번={jibun}, 아파트={apt.apt_name}")
                    return apt
                elif api_sub is not None and db_sub is not None:
                    # 둘 다 부번이 있음 → 정확히 일치해야 함
                    if api_sub == db_sub:
                        logger.debug(f" 주소+지번 정확 매칭 (본번+부번): 법정동코드={full_region_code}, 지번={jibun}, 아파트={apt.apt_name}")
                        return apt
                elif api_sub is not None and db_sub is None:
                    #  API에 부번이 있고 DB에 부번이 없음 → 조건부 매칭
                    # 본번이 길수록(4자리 이상) 고유성이 높아 매칭 허용
                    # 또는 본번이 짧으면(3자리 이하) 부번이 없으면 다른 아파트일 가능성 높음
                    if len(api_main) >= 4:
                        # 본번이 4자리 이상이면 고유성이 높아 부번 없어도 매칭 허용
                        logger.debug(f" 주소+지번 유연 매칭 (본번 길이 4자리 이상, DB 부번 없음): 법정동코드={full_region_code}, 지번={jibun}, 아파트={apt.apt_name}")
                        return apt
                    # 본번이 3자리 이하는 부번이 없으면 매칭 안 함 (다른 아파트일 가능성)
                elif api_sub is None and db_sub is not None:
                    # API에 부번이 없고 DB에 부번이 있음 → 정확 매칭 (부번 없는 것으로 간주)
                    logger.debug(f" 주소+지번 정확 매칭 (API 부번 없음, DB 부번 있음): 법정동코드={full_region_code}, 지번={jibun}, 아파트={apt.apt_name}")
                    return apt
        
        return None
    
    @staticmethod
    def is_rental_apartment(name: str) -> bool:
        """
        임대 아파트인지 확인
        
        대한민국 특수 상황:
        - 같은 지번에 임대 아파트와 분양 아파트가 공존하는 경우 많음
        - LH, 도시공사 영구임대는 분양 단지와 같은 지번 사용
        - 혼합 단지: 같은 단지 내 분양동+임대동 존재
        
        Args:
            name: 아파트 이름
            
        Returns:
            True if 임대 아파트, False otherwise
        """
        if not name:
            return False
        
        # 정규화
        normalized = name.lower().replace(' ', '')
        
        # 임대 키워드 확인
        for keyword in RENTAL_KEYWORDS:
            keyword_normalized = keyword.lower().replace(' ', '')
            if keyword_normalized in normalized:
                return True
        
        return False
    
    @staticmethod
    def convert_sgg_code_to_db_format(sgg_cd: str) -> Optional[str]:
        """5자리 시군구 코드를 10자리 DB 형식으로 변환"""
        if not sgg_cd or len(sgg_cd) != 5:
            return None
        return f"{sgg_cd}00000"
    
    @staticmethod
    def normalize_dong_name(dong_name: str) -> str:
        """
        동 이름 정규화 (읍/면/리/동/가 처리)
        
        예시:
        - "영광읍 단주리" → "단주리"
        - "사직1동" → "사직"
        - "영등포동1가" → "영등포"
        """
        if not dong_name:
            return ""
        
        # 공백으로 분리하여 마지막 부분(실제 동/리 이름) 추출
        parts = dong_name.strip().split()
        if not parts:
            return ""
        
        # 마지막 부분 사용 (예: "영광읍 단주리" → "단주리")
        last_part = parts[-1]
        
        # 숫자 제거 (예: "사직1동" → "사직동")
        normalized = re.sub(r'\d+', '', last_part)
        
        # 읍/면/리/동/가 제거
        normalized = normalized.replace("읍", "").replace("면", "").replace("리", "").replace("동", "").replace("가", "").strip()
        
        return normalized
    
    @staticmethod
    def extract_dong_parts(dong_name: str) -> List[str]:
        """
        동 이름에서 가능한 모든 매칭 후보 추출
        
        예시:
        - "봉화읍 내성리" → ["내성리", "봉화읍 내성리", "봉화읍", "내성", "봉화"]
        - "사직1동" → ["사직1동", "사직동", "사직"]
        
        우선순위: 마지막 부분(실제 동/리 이름)을 가장 먼저 확인
        """
        if not dong_name:
            return []
        
        candidates = []
        dong_name = dong_name.strip()
        
        # 공백으로 분리된 경우 각 부분 추가
        parts = dong_name.split()
        if len(parts) > 1:
            # 마지막 부분 (실제 동/리 이름)을 가장 먼저 추가 (우선순위 높음)
            candidates.append(parts[-1])
            # 원본 전체
            candidates.append(dong_name)
            # 첫 번째 부분 (읍/면 이름)
            candidates.append(parts[0])
        else:
            # 공백이 없는 경우 원본만 추가
            candidates.append(dong_name)
        
        # 숫자 제거 버전들 추가
        for candidate in candidates[:]:
            # 숫자 제거
            no_digit = re.sub(r'\d+', '', candidate)
            if no_digit != candidate and no_digit not in candidates:
                candidates.append(no_digit)
            
            # 읍/면/리/동/가 제거
            cleaned = no_digit.replace("읍", "").replace("면", "").replace("리", "").replace("동", "").replace("가", "").strip()
            if cleaned and cleaned not in candidates:
                candidates.append(cleaned)
        
        # 중복 제거 및 빈 문자열 제거 (순서 유지)
        result = []
        seen = set()
        for c in candidates:
            if c and c not in seen:
                result.append(c)
                seen.add(c)
        
        return result
    
    @staticmethod
    def extract_danji_number(name: str) -> Optional[int]:
        """
        단지 번호 추출 (예: '4단지' → 4, '9단지' → 9, '101동' → 101)
        
        다양한 패턴 지원:
        - "4단지", "9단지" → 4, 9
        - "제4단지", "제9단지" → 4, 9
        - "101동", "102동" → 101, 102 (주의: 층수와 구분 필요)
        - "1차", "2차" → 1, 2
        - "Ⅰ", "Ⅱ" → 1, 2
        """
        if not name:
            return None
        
        # 정규화 (공백, 특수문자 제거)
        normalized = re.sub(r'\s+', '', name)
        
        # 로마숫자를 아라비아 숫자로 변환
        roman_map = {'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5', 
                     'ⅵ': '6', 'ⅶ': '7', 'ⅷ': '8', 'ⅸ': '9', 'ⅹ': '10',
                     'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
                     'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10'}
        for roman, arabic in roman_map.items():
            normalized = normalized.replace(roman, arabic)
        
        # 단지 번호 추출 패턴들 (우선순위순)
        patterns = [
            r'제?(\d+)단지',      # "4단지", "제4단지"
            r'(\d+)차',           # "1차", "2차" (차수)
            r'제(\d+)차',         # "제1차"
            r'(\d{3,})동',        # "101동", "102동" (3자리 이상, 층수 구분)
        ]
        
        for pattern in patterns:
            match = re.search(pattern, normalized)
            if match:
                num = int(match.group(1))
                # 동 번호는 보통 100 이상 (101동, 102동 등)
                if '동' in pattern and num < 100:
                    continue
                return num
        
        return None
    
    @staticmethod
    def extract_cha_number(name: str) -> Optional[int]:
        """
        차수 추출 (예: '1차' → 1, 'Ⅱ' → 2)
        
        다양한 패턴 지원:
        - "1차", "2차" → 1, 2
        - "제1차", "제2차" → 1, 2
        - "Ⅰ", "Ⅱ" → 1, 2 (로마숫자)
        - 끝에 붙은 숫자 (1~20 사이만 차수로 간주)
        """
        if not name:
            return None
        
        normalized = re.sub(r'\s+', '', name)
        
        # 로마숫자를 아라비아 숫자로 변환
        roman_map = {'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5', 
                     'ⅵ': '6', 'ⅶ': '7', 'ⅷ': '8', 'ⅸ': '9', 'ⅹ': '10',
                     'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
                     'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10',
                     'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
                     'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'}
        # 소문자 로마숫자도 처리
        normalized_lower = normalized.lower()
        for roman, arabic in roman_map.items():
            normalized_lower = normalized_lower.replace(roman, arabic)
        
        # 차수 추출 패턴들
        patterns = [
            (normalized, r'제?(\d+)차'),      # "1차", "제1차"
            (normalized_lower, r'(\d+)차'),   # 소문자 로마숫자 변환 후
        ]
        
        for text, pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return int(match.group(1))
        
        # 끝에 붙은 숫자 (1~20 사이만 차수로 간주, 그 이상은 동 번호일 가능성)
        match = re.search(r'(\d+)$', normalized)
        if match:
            num = int(match.group(1))
            if 1 <= num <= 20:
                return num
        
        return None
    
    @staticmethod
    def extract_parentheses_content(name: str) -> Optional[str]:
        """
        괄호 안의 내용 추출
        
        예시:
        - "효자촌(현대)" → "현대"
        - "후곡마을(건영15)" → "건영15"
        - "후곡마을(동아10)" → "동아10"
        """
        if not name:
            return None
        
        # 다양한 괄호 형태에서 내용 추출: (), [], {}, 〈〉, 《》
        patterns = [
            r'\(([^)]+)\)',      # ()
            r'\[([^\]]+)\]',     # []
            r'\{([^}]+)\}',      # {}
            r'〈([^〉]+)〉',      # 〈〉
            r'《([^》]+)》',      # 《》
        ]
        
        for pattern in patterns:
            match = re.search(pattern, name)
            if match:
                return match.group(1).strip()
        
        return None
    
    @staticmethod
    def extract_brand_from_parentheses(name: str) -> Optional[str]:
        """
        괄호 안의 브랜드명 추출
        
        예시:
        - "효자촌(현대)" → "현대"
        - "후곡마을(건영15)" → "건영"
        - "후곡마을(동아10)" → "동아"
        """
        content = ApartmentMatcher.extract_parentheses_content(name)
        if not content:
            return None
        
        # 숫자 제거 후 브랜드명 추출
        # "건영15" → "건영", "동아10" → "동아"
        normalized = re.sub(r'\d+', '', content).strip()
        
        # 알려진 브랜드명인지 확인
        normalized_lower = normalized.lower()
        for brand in APARTMENT_BRANDS:
            brand_lower = brand.lower()
            if brand_lower in normalized_lower or normalized_lower in brand_lower:
                return brand_lower
        
        # 브랜드명이 아니면 그냥 반환 (예: "현대", "대우" 등)
        return normalized if normalized else None
    
    @staticmethod
    def extract_danji_from_parentheses(name: str) -> Optional[int]:
        """
        괄호 안의 단지 번호 추출
        
        예시:
        - "후곡마을(건영15)" → 15
        - "후곡마을(동아10)" → 10
        - "후곡마을(태영13)" → 13
        """
        content = ApartmentMatcher.extract_parentheses_content(name)
        if not content:
            return None
        
        # 괄호 안에서 숫자 추출
        # "건영15" → 15, "동아10" → 10
        match = re.search(r'(\d+)', content)
        if match:
            num = int(match.group(1))
            # 단지 번호는 보통 1~99 사이
            if 1 <= num <= 99:
                return num
        
        return None
    
    @staticmethod
    def extract_village_name(name: str) -> Optional[str]:
        """마을/단지명 추출 (예: '한빛마을4단지' → '한빛')"""
        if not name:
            return None
        
        normalized = re.sub(r'\s+', '', name).lower()
        
        # 마을명 추출 패턴들
        for suffix in ['마을', '단지']:
            pattern = rf'([가-힣]+){suffix}'
            match = re.search(pattern, normalized)
            if match:
                village = match.group(1)
                # 숫자 제거 (예: "한빛9" → "한빛")
                village = re.sub(r'\d+', '', village)
                if len(village) >= 2:
                    return village
        
        return None
    
    @staticmethod
    def extract_all_brands(name: str) -> List[str]:
        """아파트 이름에서 모든 브랜드명 추출 (복수 가능)"""
        if not name:
            return []
        
        normalized = re.sub(r'\s+', '', name).lower()
        
        # 로마숫자 변환
        roman_map = {'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5', 
                     'ⅵ': '6', 'ⅶ': '7', 'ⅷ': '8', 'ⅸ': '9', 'ⅹ': '10',
                     'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
                     'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10'}
        for roman, arabic in roman_map.items():
            normalized = normalized.replace(roman, arabic)
        
        # e편한세상 통일
        normalized = normalized.replace('e편한세상', '이편한세상')
        
        found_brands = []
        for brand in APARTMENT_BRANDS:
            brand_lower = brand.lower()
            if brand_lower in normalized:
                found_brands.append(brand_lower)
        
        # 중복 제거 및 긴 브랜드 우선 (예: '롯데캐슬파크타운'이 있으면 '롯데캐슬' 제거)
        final_brands = []
        for brand in found_brands:
            is_subset = False
            for other in found_brands:
                if brand != other and brand in other:
                    is_subset = True
                    break
            if not is_subset:
                final_brands.append(brand)
        
        return final_brands
    
    @staticmethod
    def clean_apt_name(name: str) -> str:
        """
        아파트 이름 정제 (괄호 및 부가 정보 제거, 특수문자 처리)
        
        처리 내용:
        - 입주자대표회의, 관리사무소 등 부가 정보 제거
        - 괄호 및 내용 제거: (), [], {}
        - 특수문자 정리: &, /, ·, ~ 등
        """
        if not name:
            return ""
        
        # 입주자대표회의, 관리사무소 등 부가 정보 제거
        cleaned = re.sub(r'입주자대표회의', '', name, flags=re.IGNORECASE)
        cleaned = re.sub(r'관리사무소', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'제\d+관리사무소', '', cleaned)
        
        # 다양한 괄호 형태 제거: (), [], {}, 〈〉, 《》
        cleaned = re.sub(r'[\(\[\{〈《][^\)\]\}〉》]*[\)\]\}〉》]', '', cleaned)
        
        # & 기호를 공백으로 변환
        cleaned = cleaned.replace('&', ' ')
        
        # / 기호를 공백으로 변환 (예: "힐스테이트/파크" → "힐스테이트 파크")
        cleaned = cleaned.replace('/', ' ')
        
        # 중간점(·) 제거
        cleaned = cleaned.replace('·', ' ')
        
        # 물결표(~) 제거
        cleaned = cleaned.replace('~', '')
        
        # 연속된 공백 제거
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        return cleaned.strip()
    
    @staticmethod
    def normalize_apt_name(name: str) -> str:
        """
        아파트 이름 정규화 (대한민국 아파트 특성 고려, 영문↔한글 브랜드명 통일)
        
        정규화 규칙:
        - 공백 제거
        - 영문 소문자 변환
        - 로마숫자 → 아라비아 숫자
        - 영문 브랜드명 → 한글 통일
        - 일반적인 오타 패턴 정규화
        - 특수문자 제거
        """
        if not name:
            return ""
        
        # 공백 제거
        normalized = re.sub(r'\s+', '', name)
        
        # 영문 대소문자 통일 (소문자로 변환)
        normalized = normalized.lower()
        
        # 로마숫자를 아라비아 숫자로 변환
        roman_map = {'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5', 
                     'ⅵ': '6', 'ⅶ': '7', 'ⅷ': '8', 'ⅸ': '9', 'ⅹ': '10',
                     'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
                     'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10'}
        for roman, arabic in roman_map.items():
            normalized = normalized.replace(roman, arabic)
        
        #  하이픈/대시 제거를 브랜드 변환 전에 수행 (e-편한세상 → e편한세상)
        normalized = re.sub(r'[-–—]', '', normalized)
        
        # 영문 브랜드명 → 한글로 통일 (긴 것부터 먼저 치환)
        sorted_brands = sorted(BRAND_ENG_TO_KOR.items(), key=lambda x: len(x[0]), reverse=True)
        for eng, kor in sorted_brands:
            normalized = normalized.replace(eng, kor)
        
        # 일반적인 오타 패턴 정규화 (한글)
        typo_map = {
            '힐스테잇': '힐스테이트',
            '테잇': '테이트',
            '케슬': '캐슬',
            '써밋': '서밋',
            '써미트': '서밋',
            '레미안': '래미안',  # 실제로는 래미안이 맞지만, 레미안으로 쓰는 경우가 많음
            '푸르지오': '푸르지오',  # 실제 브랜드명
            '푸르지움': '푸르지오',
            '자이': '자이',  # 실제 브랜드명
            '쟈이': '자이',
            '쉐르빌': '셰르빌',
            '쉐르빌': '쉐르빌',
        }
        for typo, correct in typo_map.items():
            normalized = normalized.replace(typo, correct)
        
        # 아포스트로피 제거
        normalized = re.sub(r"[''`]", '', normalized)
        
        # 특수문자 제거 (한글, 영문, 숫자만 유지)
        normalized = re.sub(r'[^\w가-힣]', '', normalized)
        
        return normalized
    
    @staticmethod
    def normalize_apt_name_strict(name: str) -> str:
        """
        아파트 이름 엄격 정규화 (차수/단지 번호 제거, 다양한 접미사 처리)
        
        처리 내용:
        - 차수/단지 번호 제거
        - 다양한 아파트 접미사 제거: 아파트, APT, 빌라, 빌, 타운, 하우스 등
        """
        if not name:
            return ""
        
        normalized = ApartmentMatcher.normalize_apt_name(name)
        
        # 차수/단지 표기 제거
        normalized = re.sub(r'제?\d+차', '', normalized)
        normalized = re.sub(r'제?\d+단지', '', normalized)
        normalized = re.sub(r'\d{3,}동', '', normalized)  # 101동, 102동 등
        
        # 끝에 붙은 숫자 제거 (예: "삼성1" → "삼성", 단 1~2자리만)
        normalized = re.sub(r'\d{1,2}$', '', normalized)
        
        # 다양한 아파트 접미사 제거 (대소문자 무관)
        suffixes = [
            'apartment', 'apt', 'apts',
            '아파트', '아파아트',  # 오타 포함
            '빌라', '빌', '빌리지',
            '타운', 'town',
            '하우스', 'house',
            '맨션', 'mansion',
            '캐슬', 'castle',
            '빌딩', 'building',
            '오피스텔', 'officetel',
        ]
        
        for suffix in suffixes:
            # 끝에 있는 경우만 제거
            if normalized.endswith(suffix):
                normalized = normalized[:-len(suffix)]
        
        return normalized
    
    @staticmethod
    def extract_brand_and_name(name: str) -> Tuple[Optional[str], str]:
        """아파트 이름에서 브랜드명과 나머지 부분 추출"""
        if not name:
            return None, ""
        
        normalized = ApartmentMatcher.normalize_apt_name(name)
        
        # 브랜드명 찾기 (긴 것부터 매칭)
        sorted_brands = sorted(APARTMENT_BRANDS, key=len, reverse=True)
        for brand in sorted_brands:
            brand_lower = brand.lower()
            if brand_lower in normalized:
                # 브랜드명 제거한 나머지 반환
                remaining = normalized.replace(brand_lower, '', 1)
                return brand, remaining
        
        return None, normalized
    
    @staticmethod
    def calculate_similarity(str1: str, str2: str) -> float:
        """두 문자열 간의 유사도 계산 (0.0 ~ 1.0)"""
        if not str1 or not str2:
            return 0.0
        return SequenceMatcher(None, str1, str2).ratio()
    
    @staticmethod
    def extract_core_name(name: str) -> str:
        """핵심 이름 추출 (지역명, 마을명 등 제거)"""
        if not name:
            return ""
        
        normalized = ApartmentMatcher.normalize_apt_name_strict(name)
        
        # 마을/단지 접미사와 그 앞의 지역명 제거 시도
        for suffix in VILLAGE_SUFFIXES:
            if suffix in normalized:
                # suffix 이후 부분만 추출 (브랜드명이 보통 뒤에 옴)
                idx = normalized.find(suffix)
                after_suffix = normalized[idx + len(suffix):]
                if len(after_suffix) >= 2:
                    return after_suffix
        
        return normalized
    
    @staticmethod
    def find_matching_regions(umd_nm: str, all_regions: Dict[int, Any]) -> set:
        """
        동 이름으로 매칭되는 지역 ID 찾기 (읍/면/리/동 매칭 강화)
        
        매칭 전략:
        1. 원본 문자열 정확 매칭
        2. 후보 추출 및 정확 매칭 (예: "봉화읍 내성리" → "내성리" 매칭)
        3. 정규화된 이름 정확 매칭
        4. 부분 문자열 포함 관계 확인 (양방향, 더 널널하게)
        5. 정규화된 이름 포함 관계 확인
        """
        if not umd_nm:
            return set()
        
        matching_region_ids = set()
        
        # 매칭 후보 추출 (예: "봉화읍 내성리" → ["봉화읍 내성리", "내성리", "봉화읍", "내성", "봉화"])
        umd_candidates = ApartmentMatcher.extract_dong_parts(umd_nm)
        
        # 정규화된 후보도 추가
        normalized_umd = ApartmentMatcher.normalize_dong_name(umd_nm)
        if normalized_umd and normalized_umd not in umd_candidates:
            umd_candidates.append(normalized_umd)
        
        for region_id, region in all_regions.items():
            region_name = region.region_name
            normalized_region = ApartmentMatcher.normalize_dong_name(region_name)
            
            # 1단계: 원본 문자열 정확 매칭
            if region_name == umd_nm:
                matching_region_ids.add(region_id)
                continue
            
            # 2단계: 후보 추출된 이름 정확 매칭 (가장 중요!)
            # 예: "봉화읍 내성리"의 후보 "내성리"와 DB의 "내성리" 매칭
            for umd_candidate in umd_candidates:
                if region_name == umd_candidate:
                    matching_region_ids.add(region_id)
                    break
            
            if region_id in matching_region_ids:
                continue
            
            # 3단계: 정규화된 이름 정확 매칭
            if normalized_umd and normalized_region:
                if normalized_region == normalized_umd:
                    matching_region_ids.add(region_id)
                    continue
                
                # 후보들의 정규화 버전도 확인
                for umd_candidate in umd_candidates:
                    normalized_candidate = ApartmentMatcher.normalize_dong_name(umd_candidate)
                    if normalized_region == normalized_candidate and normalized_region:
                        matching_region_ids.add(region_id)
                        break
            
            if region_id in matching_region_ids:
                continue
            
            # 4단계: 부분 문자열 포함 관계 확인 (양방향, 더 널널하게)
            # 원본 문자열 포함 관계
            if umd_nm in region_name or region_name in umd_nm:
                matching_region_ids.add(region_id)
                continue
            
            # 후보들로 포함 관계 확인 (더 널널하게)
            for umd_candidate in umd_candidates:
                # 후보가 region_name에 포함되거나, region_name이 후보에 포함되는지 확인
                if umd_candidate in region_name or region_name in umd_candidate:
                    matching_region_ids.add(region_id)
                    break
            
            if region_id in matching_region_ids:
                continue
            
            # 5단계: 정규화된 이름 포함 관계 확인
            if normalized_umd and normalized_region:
                if normalized_umd in normalized_region or normalized_region in normalized_umd:
                    matching_region_ids.add(region_id)
        
        return matching_region_ids
    
    @staticmethod
    def match_apartment(
        apt_name_api: str,
        candidates: List[Apartment],
        sgg_cd: str,
        umd_nm: Optional[str] = None,
        jibun: Optional[str] = None,
        build_year: Optional[str] = None,
        apt_details: Optional[Dict[int, ApartDetail]] = None,
        normalized_cache: Optional[Dict[str, Any]] = None,
        all_regions: Optional[Dict[int, Any]] = None,
        require_dong_match: bool = True  #  기본값을 True로 변경 (동 검증 기본 활성화)
    ) -> Optional[Apartment]:
        """
        아파트 매칭 (한국 아파트 특성에 최적화된 강화 버전)

        지역과 법정동이 일치한다는 가정 하에 다단계 매칭을 수행합니다.

        핵심 매칭 전략:
        1. 정규화된 이름 정확 매칭
        2. 브랜드명 + 단지번호 복합 매칭 (가장 중요!)
        3. 브랜드명 + 마을명 복합 매칭
        4. 지번 기반 매칭 (NEW!)
        5. 건축년도 기반 매칭 (NEW!)
        6. 유사도 기반 매칭 (SequenceMatcher)
        7. 키워드 기반 매칭

        예시:
        - "한빛마을4단지롯데캐슬Ⅱ" ↔ "롯데캐슬 파크타운 Ⅱ" (브랜드+단지번호 무시, 같은 동)
        - "한빛9단지 롯데캐슬파크타운" ↔ "한빛마을9단지롯데캐슬1차" (브랜드+단지번호)

        Args:
            apt_name_api: API에서 받은 아파트 이름
            candidates: 후보 아파트 리스트
            sgg_cd: 5자리 시군구 코드
            umd_nm: 동 이름 (선택)
            jibun: API 지번 (선택)
            build_year: API 건축년도 (선택)
            apt_details: 아파트 상세 정보 딕셔너리 (선택)
            normalized_cache: 정규화 결과 캐시 (성능 최적화)
            all_regions: 지역 정보 딕셔너리 - 동 검증용 (선택)
            require_dong_match: True면 동 일치 검증 필수 (기본값: True, 동 검증 기본 활성화)

        Returns:
            매칭된 Apartment 객체 또는 None
        """
        if not apt_name_api or not candidates:
            return None
        
        # 정규화 결과 캐싱 (성능 최적화)
        if normalized_cache is None:
            normalized_cache = {}
        
        # API 이름 분석 (캐싱)
        cache_key_api = f"api:{apt_name_api}"
        if cache_key_api not in normalized_cache:
            cleaned_api = ApartmentMatcher.clean_apt_name(apt_name_api)
            normalized_api = ApartmentMatcher.normalize_apt_name(cleaned_api)
            normalized_strict_api = ApartmentMatcher.normalize_apt_name_strict(cleaned_api)
            brands_api = ApartmentMatcher.extract_all_brands(apt_name_api)
            danji_api = ApartmentMatcher.extract_danji_number(apt_name_api)
            cha_api = ApartmentMatcher.extract_cha_number(apt_name_api)
            village_api = ApartmentMatcher.extract_village_name(apt_name_api)
            core_api = ApartmentMatcher.extract_core_name(cleaned_api)
            # 괄호 안의 브랜드명과 단지 번호 추출
            brand_in_parens_api = ApartmentMatcher.extract_brand_from_parentheses(apt_name_api)
            danji_in_parens_api = ApartmentMatcher.extract_danji_from_parentheses(apt_name_api)
            normalized_cache[cache_key_api] = {
                'cleaned': cleaned_api,
                'normalized': normalized_api,
                'strict': normalized_strict_api,
                'brands': brands_api,
                'danji': danji_api,
                'cha': cha_api,
                'village': village_api,
                'core': core_api,
                'brand_in_parens': brand_in_parens_api,
                'danji_in_parens': danji_in_parens_api
            }
        api_cache = normalized_cache[cache_key_api]
        
        if not api_cache['cleaned'] or not api_cache['normalized']:
            return None
        
        # API 이름이 지번만 있는지 확인 (예: "(1101-1)", "(627-41)")
        # 한글 없이 숫자와 특수문자만 있으면 지번으로 간주
        api_is_jibun_only = not re.search(r'[가-힣a-zA-Z]', api_cache['cleaned'])
        
        # 후보 아파트 정규화 및 점수 계산
        best_match = None
        best_score = 0.0
        
        for apt in candidates:
            cache_key_db = f"db:{apt.apt_name}"
            if cache_key_db not in normalized_cache:
                cleaned_db = ApartmentMatcher.clean_apt_name(apt.apt_name)
                normalized_db = ApartmentMatcher.normalize_apt_name(cleaned_db)
                normalized_strict_db = ApartmentMatcher.normalize_apt_name_strict(cleaned_db)
                brands_db = ApartmentMatcher.extract_all_brands(apt.apt_name)
                danji_db = ApartmentMatcher.extract_danji_number(apt.apt_name)
                cha_db = ApartmentMatcher.extract_cha_number(apt.apt_name)
                village_db = ApartmentMatcher.extract_village_name(apt.apt_name)
                core_db = ApartmentMatcher.extract_core_name(cleaned_db)
                # 괄호 안의 브랜드명과 단지 번호 추출
                brand_in_parens_db = ApartmentMatcher.extract_brand_from_parentheses(apt.apt_name)
                danji_in_parens_db = ApartmentMatcher.extract_danji_from_parentheses(apt.apt_name)
                normalized_cache[cache_key_db] = {
                    'cleaned': cleaned_db,
                    'normalized': normalized_db,
                    'strict': normalized_strict_db,
                    'brands': brands_db,
                    'danji': danji_db,
                    'cha': cha_db,
                    'village': village_db,
                    'core': core_db,
                    'brand_in_parens': brand_in_parens_db,
                    'danji_in_parens': danji_in_parens_db
                }
            db_cache = normalized_cache[cache_key_db]
            
            score = 0.0
            
            # === 0단계: 단지 번호 필터링 (중요!) ===
            # API 이름에 단지 번호가 있으면, 단지 번호가 일치하지 않는 후보는 제외
            api_danji = api_cache['danji']
            api_cha = api_cache['cha']
            db_danji = db_cache['danji']
            db_cha = db_cache['cha']
            
            #  이름 정확 매칭 우선 검사 (건축년도 Veto 전에!)
            # 이름이 정확히 일치하면 건축년도 차이와 상관없이 바로 반환
            if api_cache['normalized'] == db_cache['normalized']:
                return apt  # 정확 매칭은 바로 반환
            
            #  개선: 이름 최소 유사도 Veto (미스매칭 방지)
            MIN_NAME_SIMILARITY = 0.20  # 최소 이름 유사도 (20%)
            
            # 정규화 이름 유사도 계산
            name_similarity = SequenceMatcher(
                None, 
                api_cache['normalized'], 
                db_cache['normalized']
            ).ratio()
            
            #  VETO: 이름 최소 유사도 미달
            # 예외: 이미 정확 매칭으로 반환되었으므로 여기서는 체크 불필요
            # 하지만 법정동+지번 완전 일치는 허용
            if name_similarity < MIN_NAME_SIMILARITY:
                # 지번 완전 일치 여부는 나중에 계산되므로, 일단 점수 계산 진행
                # 대신 최종 점수에 페널티 부여
                # (이 부분은 아래 지번 매칭 로직 이후에 다시 검증)
                pass
            
            # 건축년도 Veto 검사
            if build_year and apt_details and apt.apt_id in apt_details:
                detail = apt_details[apt.apt_id]
                if detail.use_approval_date:
                    try:
                        approval_year = detail.use_approval_date.split('-')[0]
                        year_diff = abs(int(build_year) - int(approval_year))
                        
                        #  VETO: 건축년도 3년 초과 차이 → 즉시 제외
                        # (단, 이름 정확 매칭은 위에서 이미 처리됨)
                        if year_diff > BUILD_YEAR_TOLERANCE:
                            continue  # 다른 아파트일 가능성 높음
                    except (ValueError, AttributeError):
                        pass
            
            #  임대 아파트 Veto 검사 (NEW!)
            # 대한민국 특수 상황: 같은 지번에 임대+분양 공존
            # 예: 에코시티자이2차(분양 5~6억) vs 산내들임대(4000만원) → 같은 지번이지만 다른 아파트!
            api_is_rental = ApartmentMatcher.is_rental_apartment(apt_name_api)
            db_is_rental = ApartmentMatcher.is_rental_apartment(apt.apt_name)
            
            if api_is_rental != db_is_rental:
                #  VETO: 임대 vs 분양 타입 불일치 → 즉시 제외
                # 같은 지번이라도 임대와 분양은 완전히 다른 아파트
                logger.debug(f" 임대 타입 불일치로 매칭 거부: API={apt_name_api}(임대={api_is_rental}), DB={apt.apt_name}(임대={db_is_rental})")
                continue
            
            # === 0.5단계: 괄호 안의 브랜드명과 단지 번호 필터링 (중요!) ===
            brand_in_parens_api = api_cache.get('brand_in_parens')
            danji_in_parens_api = api_cache.get('danji_in_parens')
            brand_in_parens_db = db_cache.get('brand_in_parens')
            danji_in_parens_db = db_cache.get('danji_in_parens')
            
            # API에 괄호 안의 브랜드명이 있으면, DB에도 같은 브랜드명이 있어야 함
            # 단, 괄호 안 내용이 DB 아파트명에 포함되어 있으면 진행 (실제 아파트명인 경우)
            if brand_in_parens_api:
                if brand_in_parens_db:
                    # 둘 다 괄호 안에 브랜드명이 있으면 일치해야 함
                    if brand_in_parens_api.lower() != brand_in_parens_db.lower():
                        # 괄호 안의 브랜드명이 다르면 제외 (예: "효자촌(현대)" vs "효자촌(대우)")
                        continue
                else:
                    # API에는 괄호 안 브랜드명이 있지만 DB에는 없는 경우
                    # 괄호 안 원본 내용이 DB 아파트명에 포함되어 있는지 확인
                    # (예: "판교원마을6단지(판교대광로제비앙)" vs "판교대광로제비앙아파트")
                    
                    # 원본 괄호 내용 가져오기 (브랜드 추출 전)
                    original_parens = ApartmentMatcher.extract_parentheses_content(apt_name_api) or ""
                    original_parens_lower = original_parens.lower()
                    parens_content_lower = brand_in_parens_api.lower()
                    
                    db_name_lower = db_cache['normalized'].lower()
                    db_cleaned_lower = db_cache['cleaned'].lower() if db_cache.get('cleaned') else ''
                    apt_name_db = apt.apt_name.lower()
                    
                    # 1. 원본 괄호 내용이 DB 아파트명에 포함
                    # (예: "판교대광로제비앙" in "판교대광로제비앙아파트")
                    if original_parens_lower and (
                        original_parens_lower in db_name_lower or 
                        original_parens_lower in db_cleaned_lower or
                        original_parens_lower in apt_name_db
                    ):
                        pass  # 진행 - 괄호 안 내용이 실제 아파트명
                    # 2. 추출된 브랜드명이 DB 아파트명에 포함
                    elif parens_content_lower in db_name_lower or parens_content_lower in db_cleaned_lower:
                        pass  # 진행
                    # 3. DB 아파트명이 괄호 내용에 포함 (역방향)
                    elif db_name_lower in original_parens_lower or db_name_lower in parens_content_lower:
                        pass  # 진행 (역방향 포함)
                    else:
                        # 브랜드 사전에 있는 브랜드인데 DB에 없으면 제외
                        # (예: "효자촌(현대)" vs "효자촌" - 다른 아파트)
                        if brand_in_parens_api.lower() in [b.lower() for b in APARTMENT_BRANDS]:
                            continue
            
            # === 단지 번호 통합 비교 ===
            # API와 DB의 단지 번호를 통합하여 비교 (일반 단지 번호 + 괄호 안 단지 번호)
            api_danji_final = api_danji if api_danji is not None else danji_in_parens_api
            db_danji_final = db_danji if db_danji is not None else danji_in_parens_db
            
            # API에 괄호 안의 단지 번호가 있으면, DB에도 같은 단지 번호가 있어야 함
            if danji_in_parens_api is not None:
                if danji_in_parens_db is not None:
                    if danji_in_parens_api != danji_in_parens_db:
                        # 괄호 안의 단지 번호가 다르면 제외 (예: "후곡마을10단지" vs "후곡마을(건영15)")
                        continue
            
            # API에 단지 번호나 차수가 있으면 비교
            #  핵심 로직 강화: 단지 번호/차수 불일치 시 무조건 제외
            # - DB에 단지 번호가 "다르면" 제외 (7단지 → 4단지 X)
            # - 지번/건축년도 일치해도 단지 번호가 다르면 제외 (매칭 분석 결과 반영)
            # - DB에 단지 번호가 "없으면" 유사도 기반 검증:
            #   - 유사도 0.85+ 이면 단지 번호 필수 (상림마을1단지 vs 상림마을 X)
            #   - 괄호 안 브랜드명이 있으면 제외 (후곡마을10단지 vs 후곡마을(대창) X)
            #   - 유사도 낮으면 허용 (경남아너스빌1단지 vs 경남아너스빌아파트 O)
            if api_danji_final is not None:
                if db_danji_final is not None:
                    # 둘 다 단지 번호가 있으면 반드시 같아야 함
                    if db_danji_final != api_danji_final:
                        #  VETO: 단지 번호 불일치 → 즉시 제외
                        # 지번/건축년도 일치해도 단지 번호가 다르면 다른 아파트
                        continue
                else:
                    #  DB에 단지 번호가 없는 경우 - 유사도 기반 검증 강화
                    # 분석 결과: 같은 지역 내 유사 이름 2,891개 중 단지 번호만 다른 경우 많음
                    # (예: 은평뉴타운상림마을1단지 vs 은평뉴타운상림마을12단지 - 유사도 0.96)
                    
                    # 1. 괄호 안에 브랜드명이 있으면 다른 단지로 간주하여 제외
                    # (예: "후곡마을10단지" vs "후곡마을(대창)" - 대창은 별도 단지)
                    if brand_in_parens_db:
                        continue
                    
                    # 2.  유사도가 높으면 (0.85+) 단지 번호 필수 일치
                    # 이름이 거의 같은데 단지 번호만 없으면 다른 아파트일 가능성 높음
                    name_similarity = ApartmentMatcher.calculate_similarity(
                        api_cache['normalized'], 
                        db_cache['normalized']
                    )
                    if name_similarity >= 0.85:
                        #  VETO: 유사도 높은데 단지 번호 불일치 → 즉시 제외
                        # (예: "상림마을1단지" vs "상림마을" - 유사도 0.90 → 다른 아파트)
                        logger.debug(f" 유사도 높은데 단지 번호 불일치: API={apt_name_api}(단지={api_danji_final}), DB={apt.apt_name}(단지=None), 유사도={name_similarity:.2f}")
                        continue
                    
                    # 3. 유사도 낮으면 (< 0.85) 허용
                    # (예: "경남아너스빌1단지" vs "경남아너스빌아파트" - 유사도 0.75 → 매칭 허용)
            elif api_cha is not None:
                # API에 차수가 있으면 비교
                if db_cha is not None:
                    # 둘 다 차수가 있으면 반드시 같아야 함
                    if db_cha != api_cha:
                        #  VETO: 차수 불일치 → 즉시 제외 (단지 번호와 동일하게 엄격하게)
                        continue
                else:
                    #  DB에 차수가 없는 경우 - 유사도 기반 검증 강화
                    # 단지 번호와 동일한 로직 적용
                    
                    # 1. 괄호 안에 브랜드명이 있으면 다른 단지로 간주하여 제외
                    if brand_in_parens_db:
                        continue
                    
                    # 2.  유사도가 높으면 (0.85+) 차수 필수 일치
                    name_similarity = ApartmentMatcher.calculate_similarity(
                        api_cache['normalized'], 
                        db_cache['normalized']
                    )
                    if name_similarity >= 0.85:
                        #  VETO: 유사도 높은데 차수 불일치 → 즉시 제외
                        # (예: "더샵1차" vs "더샵" - 유사도 0.90 → 다른 아파트)
                        logger.debug(f" 유사도 높은데 차수 불일치: API={apt_name_api}(차수={api_cha}), DB={apt.apt_name}(차수=None), 유사도={name_similarity:.2f}")
                        continue
                    
                    # 3. 유사도 낮으면 (< 0.85) 허용
            
            #  역방향 검증: DB에 단지/차수가 있는데 API에 없는 경우도 유사도 기반 검증
            elif db_danji_final is not None and api_danji_final is None:
                # DB에만 단지 번호가 있는 경우
                name_similarity = ApartmentMatcher.calculate_similarity(
                    api_cache['normalized'], 
                    db_cache['normalized']
                )
                if name_similarity >= 0.85:
                    #  VETO: 유사도 높은데 단지 번호 불일치 (역방향)
                    logger.debug(f" 유사도 높은데 단지 번호 불일치(역): API={apt_name_api}(단지=None), DB={apt.apt_name}(단지={db_danji_final}), 유사도={name_similarity:.2f}")
                    continue
            elif db_cha is not None and api_cha is None:
                # DB에만 차수가 있는 경우
                name_similarity = ApartmentMatcher.calculate_similarity(
                    api_cache['normalized'], 
                    db_cache['normalized']
                )
                if name_similarity >= 0.85:
                    #  VETO: 유사도 높은데 차수 불일치 (역방향)
                    logger.debug(f" 유사도 높은데 차수 불일치(역): API={apt_name_api}(차수=None), DB={apt.apt_name}(차수={db_cha}), 유사도={name_similarity:.2f}")
                    continue
            
            #  추가 검증: 단지 번호와 차수가 모두 있는 경우 둘 다 확인
            # API에 단지 번호가 있고 DB에 차수가 있거나, 그 반대인 경우도 확인
            if api_danji_final is not None and db_cha is not None:
                # 단지 번호와 차수가 다른 개념이므로, 둘 다 있으면 둘 다 일치해야 함
                # 하지만 일반적으로 단지 번호와 차수는 함께 사용되지 않으므로, 
                # 하나만 일치하면 허용 (현재 로직 유지)
                pass
            elif api_cha is not None and db_danji_final is not None:
                # API에 차수가 있고 DB에 단지 번호가 있는 경우도 확인
                # 일반적으로 혼용되지 않으므로 현재 로직 유지
                pass
            
            # === 0.7단계: 브랜드 그룹 불일치 Veto (강화) ===
            # 둘 다 명확한 브랜드가 식별되었는데 다르면 → VETO
            api_brands = set(api_cache['brands'])
            db_brands = set(db_cache['brands'])
            common_brands = api_brands & db_brands
            has_common_brand = len(common_brands) > 0
            
            # 주요 브랜드 목록 (이 브랜드가 API에 있으면 DB에도 있어야 함)
            MAJOR_BRANDS = {
                '자이', '래미안', '푸르지오', '힐스테이트', '이편한세상', 'e편한세상',
                '더샵', '아이파크', '센트레빌', '롯데캐슬', '위브', '호반써밋',
                '아크로', '포레나', '꿈에그린', '스위첸', '트라팰리스', '휴먼시아',
                '비발디', '한라비발디', '우미린', '베스트빌', '어울림', '로얄듀크',
                '스윗닷홈', '예가', '사랑으로', 's클래스', '중흥s클래스', '중흥',
                '수자인', '나빌래', '스타클래스', '노빌리티', '스카이뷰'
            }
            
            #  강화: 둘 다 브랜드가 있는데 공통 브랜드가 없으면 Veto
            # 단, 브랜드가 하나도 없는 경우는 통과 (일반 아파트명)
            if api_brands and db_brands and not has_common_brand:
                # 표준 브랜드명으로 변환하여 다시 비교
                api_std = {BRAND_KEYWORD_TO_STANDARD.get(b.lower(), b) for b in api_brands}
                db_std = {BRAND_KEYWORD_TO_STANDARD.get(b.lower(), b) for b in db_brands}
                if api_std and db_std and not (api_std & db_std):
                    #  VETO: 브랜드 그룹 불일치 (자이 vs 래미안 등)
                    continue
            
            #  강화: API에 주요 브랜드가 있는데 DB에 없으면 Veto
            # (예: "LG신산본자이2차" vs "당정마을엘지" - 자이가 없으므로 Veto)
            api_brands_lower = {b.lower() for b in api_brands}
            db_brands_lower = {b.lower() for b in db_brands}
            api_major_brands = api_brands_lower & {b.lower() for b in MAJOR_BRANDS}
            
            if api_major_brands:
                # API에 주요 브랜드가 있으면, DB에도 해당 브랜드가 있어야 함
                db_has_api_major = bool(api_major_brands & db_brands_lower)
                if not db_has_api_major:
                    #  VETO: API의 주요 브랜드가 DB에 없음
                    # 특히 자이, 래미안, 푸르지오 등 명확한 브랜드는 절대 우회 불가
                    continue
            
            #  강화: DB에 주요 브랜드가 있는데 API에 없으면 Veto (양방향 검증)
            db_major_brands = db_brands_lower & {b.lower() for b in MAJOR_BRANDS}
            if db_major_brands:
                # DB에 주요 브랜드가 있으면, API에도 해당 브랜드가 있어야 함
                api_has_db_major = bool(db_major_brands & api_brands_lower)
                if not api_has_db_major:
                    #  VETO: DB의 주요 브랜드가 API에 없음
                    # (예: "당정마을엘지"에 자이가 없는데 "LG신산본자이2차"와 매칭 시도)
                    continue
            
            #  추가 강화: 일반 브랜드도 불일치 시 Veto (더 엄격하게)
            # API와 DB 모두에 브랜드가 있는데 공통 브랜드가 없으면 제외
            if api_brands and db_brands and not has_common_brand:
                # 표준 브랜드명으로 변환하여 다시 비교
                api_std_all = {BRAND_KEYWORD_TO_STANDARD.get(b.lower(), b.lower()) for b in api_brands}
                db_std_all = {BRAND_KEYWORD_TO_STANDARD.get(b.lower(), b.lower()) for b in db_brands}
                # 표준화 후에도 공통 브랜드가 없으면 제외
                if api_std_all and db_std_all and not (api_std_all & db_std_all):
                    #  VETO: 모든 브랜드 불일치
                    continue
            
            # === 1단계: 정규화된 이름 정확 매칭 (최고 점수) ===
            if api_cache['normalized'] == db_cache['normalized']:
                return apt  # 정확 매칭은 바로 반환
            
            # === 2단계: 엄격 정규화 후 정확 매칭 ===
            # 단, 단지 번호가 있는 경우는 엄격 정규화 매칭을 건너뛰어야 함
            # (단지 번호가 제거되면 다른 단지와 구분이 안 됨)
            if api_danji is None and api_cha is None:
                if api_cache['strict'] == db_cache['strict']:
                    return apt  # 차수/단지 제거 후 정확 매칭 (단지 번호가 없는 경우만)
            
            # === 3단계: 브랜드명 + 단지번호 복합 매칭 (핵심!) ===
            # (common_brands, has_common_brand는 0.7단계에서 이미 계산됨)
            
            # 단지번호 일치 확인 (이미 0단계에서 필터링했으므로 일치함)
            danji_match = (api_danji is not None and 
                          db_danji is not None and 
                          api_danji == db_danji)
            
            # 마을명 일치 확인
            village_match = False
            if api_cache['village'] and db_cache['village']:
                v_api = api_cache['village'].lower()
                v_db = db_cache['village'].lower()
                village_match = (v_api == v_db or v_api in v_db or v_db in v_api)
            
            # 브랜드 + 단지번호 일치 → 매우 높은 점수 (거의 확실히 같은 아파트)
            if has_common_brand and danji_match:
                score = max(score, 0.95)
            
            # 브랜드 + 마을명 일치 → 높은 점수
            if has_common_brand and village_match:
                score = max(score, 0.90)
            
            # 단지번호 + 마을명 일치 → 높은 점수 (브랜드 없어도)
            if danji_match and village_match:
                score = max(score, 0.88)
            
            # 브랜드만 일치 (같은 동에 해당 브랜드 아파트가 하나뿐일 가능성)
            if has_common_brand and len(candidates) <= 3:
                score = max(score, 0.75)
            elif has_common_brand:
                score = max(score, 0.60)
            
            # 단지번호만 일치 (같은 동에 해당 단지가 하나뿐일 가능성)
            if danji_match and len(candidates) <= 3:
                score = max(score, 0.70)
            
            # === 3.5단계: 지번 기반 매칭 (강화 버전) ===
            jibun_match = False
            jibun_full_match = False  # 본번+부번 완전 일치
            jibun_dong_match = False  # 동 이름도 일치하는 경우
            jibun_apt_name_match = False  # 지번 주소에 포함된 아파트명 일치
            
            if jibun and apt_details and apt.apt_id in apt_details:
                detail = apt_details[apt.apt_id]
                if detail.jibun_address:
                    #  개선: API 지번에서 본번-부번 추출 (산지번, 지구번호, 본번-부번-부부번 처리)
                    jibun_clean = jibun.strip()
                    
                    # 산지번 처리: "산37-6" → 본번="37", 부번="6"
                    if jibun_clean.startswith('산'):
                        jibun_clean = jibun_clean[1:]  # "산" 제거
                    
                    # 지구 번호 처리: "지구BL 34-7" → 본번="34", 부번="7"
                    if '지구' in jibun_clean or 'BL' in jibun_clean.upper() or '블록' in jibun_clean:
                        jibun_parts = re.search(r'(\d+)(?:-(\d+))?(?:-(\d+))?', jibun_clean)
                        if jibun_parts:
                            api_main = jibun_parts.group(1).lstrip('0')
                            api_sub = jibun_parts.group(2).lstrip('0') if jibun_parts.group(2) else None
                        else:
                            api_main = None
                            api_sub = None
                    else:
                        # 일반 지번 처리 (본번-부번-부부번 포함)
                        jibun_parts = re.match(r'(\d+)(?:-(\d+))?(?:-(\d+))?', jibun_clean)
                        if jibun_parts:
                            api_main = jibun_parts.group(1).lstrip('0')
                            # 부부번이 있으면 부번만 사용 (부부번은 무시)
                            api_sub = jibun_parts.group(2).lstrip('0') if jibun_parts.group(2) else None
                        else:
                            api_main = None
                            api_sub = None
                    
                    #  개선: DB 지번 주소에서 동 이름과 지번을 더 정확히 추출
                    # 패턴: "동이름 지번" 또는 "동이름 지번-부번" 또는 "동이름 지번-부번-부부번"
                    # 산지번, 지구번호도 처리
                    dong_jibun_pattern = r'([가-힣]+(?:동|가|리|읍|면))\s+(?:산)?(\d+)(?:-(\d+))?(?:-(\d+))?(?:\s|$)'
                    db_dong_jibun_match = re.search(dong_jibun_pattern, detail.jibun_address)
                    
                    if db_dong_jibun_match:
                        db_dong_name = db_dong_jibun_match.group(1)  # 동 이름
                        db_main = db_dong_jibun_match.group(2).lstrip('0')  # 본번
                        # 부부번이 있으면 부번만 사용 (부부번은 무시)
                        db_sub = db_dong_jibun_match.group(3).lstrip('0') if db_dong_jibun_match.group(3) else None  # 부번
                        
                        #  동 이름 검증 강화
                        if umd_nm:
                            # API 동 이름과 DB 지번 주소의 동 이름 비교
                            normalized_umd = ApartmentMatcher.normalize_dong_name(umd_nm)
                            normalized_db_dong = ApartmentMatcher.normalize_dong_name(db_dong_name)
                            if normalized_umd == normalized_db_dong or normalized_umd in normalized_db_dong or normalized_db_dong in normalized_umd:
                                jibun_dong_match = True
                    else:
                        #  개선: 산지번, 지구번호, 본번-부번-부부번 처리
                        # 산지번 패턴: "산37-6"
                        san_match = re.search(r'산\s*(\d+)(?:-(\d+))?(?:-(\d+))?', detail.jibun_address)
                        if san_match:
                            db_dong_name = None
                            db_main = san_match.group(1).lstrip('0')
                            db_sub = san_match.group(2).lstrip('0') if san_match.group(2) else None
                        else:
                            # 지구 번호 패턴: "지구BL 34-7" 또는 "가정2지구34-7"
                            jigu_match = re.search(r'지구[^\d]*(\d+)(?:-(\d+))?(?:-(\d+))?', detail.jibun_address)
                            if not jigu_match:
                                jigu_match = re.search(r'BL[^\d]*(\d+)(?:-(\d+))?(?:-(\d+))?', detail.jibun_address, re.IGNORECASE)
                            if jigu_match:
                                db_dong_name = None
                                db_main = jigu_match.group(1).lstrip('0')
                                db_sub = jigu_match.group(2).lstrip('0') if jigu_match.group(2) else None
                            else:
                                # 일반 지번 패턴 (본번-부번-부부번 포함)
                                db_jibun_match = re.search(r'(\d+)(?:-(\d+))?(?:-(\d+))?(?:\s|$)', detail.jibun_address)
                                db_dong_name = None
                                db_main = db_jibun_match.group(1).lstrip('0') if db_jibun_match else None
                                # 부부번이 있으면 부번만 사용 (부부번은 무시)
                                db_sub = db_jibun_match.group(2).lstrip('0') if db_jibun_match and db_jibun_match.group(2) else None
                    
                    #  지번 주소에 포함된 아파트명 추출 및 활용
                    # 지번 주소 형식: "시도 시군구 동 지번 아파트명"
                    # 아파트명 부분 추출 (지번 뒤의 부분)
                    if db_dong_jibun_match:
                        jibun_end_pos = db_dong_jibun_match.end()
                        apt_name_in_jibun = detail.jibun_address[jibun_end_pos:].strip()
                        if apt_name_in_jibun:
                            # 지번 주소의 아파트명 정규화
                            normalized_apt_in_jibun = ApartmentMatcher.normalize_apt_name(
                                ApartmentMatcher.clean_apt_name(apt_name_in_jibun)
                            )
                            # API 아파트명과 비교
                            if normalized_apt_in_jibun and api_cache['normalized']:
                                apt_name_similarity = SequenceMatcher(
                                    None, normalized_apt_in_jibun, api_cache['normalized']
                                ).ratio()
                                if apt_name_similarity >= 0.70:
                                    jibun_apt_name_match = True
                    
                    # 본번-부번 비교
                    if api_main and db_main:
                        # 본번 비교
                        if api_main == db_main:
                            jibun_match = True
                            # 부번도 비교 (둘 다 있는 경우)
                            if api_sub and db_sub and api_sub == db_sub:
                                jibun_full_match = True
                            elif not api_sub and not db_sub:
                                jibun_full_match = True
                    
                    # 기존 포함 확인도 유지 (fallback)
                    if not jibun_match:
                        norm_jibun_api = re.sub(r'[\s\-]+', '', jibun)
                        norm_jibun_db = re.sub(r'[\s\-]+', '', detail.jibun_address)
                        if norm_jibun_api in norm_jibun_db or jibun in detail.jibun_address:
                            jibun_match = True
                    
                    #  지번 일치 시 점수 상승 (강화 버전)
                    # 이름이 전혀 다른데 지번만 같은 경우 방지
                    name_similarity_for_jibun = SequenceMatcher(None, 
                        api_cache['normalized'], db_cache['normalized']).ratio()
                    
                    #  지번 주소에 포함된 아파트명 일치 시 추가 보너스
                    if jibun_apt_name_match:
                        # 지번 주소의 아파트명이 API와 일치하면 매우 높은 신뢰도
                        name_similarity_for_jibun = max(name_similarity_for_jibun, 0.80)
                    
                    if jibun_full_match:
                        # 본번+부번 완전 일치: 높은 점수
                        if jibun_dong_match and jibun_apt_name_match:
                            # 동 이름 + 지번 + 아파트명 모두 일치 → 매우 높은 점수
                            score = max(score, 0.98)
                        elif jibun_dong_match or jibun_apt_name_match:
                            # 동 이름 또는 아파트명 일치 → 높은 점수
                            if name_similarity_for_jibun >= 0.10 or has_common_brand:
                                score = max(score, 0.96)
                        elif name_similarity_for_jibun >= 0.15 or has_common_brand:
                            score = max(score, 0.95)
                        elif name_similarity_for_jibun >= 0.10:
                            score = max(score, 0.85)
                        # 이름 유사도 0.10 미만이면 지번만으로는 매칭 안 함
                    elif jibun_match:
                        # 본번만 일치: 중간 점수
                        if jibun_dong_match and jibun_apt_name_match:
                            # 동 이름 + 아파트명 일치 → 높은 점수
                            score = max(score, 0.95)
                        elif jibun_dong_match or jibun_apt_name_match:
                            # 동 이름 또는 아파트명 일치 → 중간 점수
                            if name_similarity_for_jibun >= 0.15 or has_common_brand:
                                score = max(score, 0.90)
                            elif name_similarity_for_jibun >= 0.10:
                                score = max(score, 0.80)
                        elif name_similarity_for_jibun >= 0.25 or (score >= 0.5):
                            score = max(score, 0.90)
                        elif name_similarity_for_jibun >= 0.15 or has_common_brand:
                            score = max(score, 0.75)
                        # 이름 유사도 0.15 미만이면 지번만으로는 매칭 안 함
            
            # === 3.6단계: 건축년도 기반 검증 (NEW!) ===
            build_year_match = False
            if build_year and apt_details and apt.apt_id in apt_details:
                detail = apt_details[apt.apt_id]
                # use_approval_date에서 년도 추출 (YYYY-MM-DD 형식)
                if detail.use_approval_date:
                    try:
                        approval_year = detail.use_approval_date.split('-')[0]
                        # 건축년도 일치 확인 (±1년 허용)
                        if abs(int(build_year) - int(approval_year)) <= 1:
                            build_year_match = True
                            # 건축년도 일치 시 점수 보정 (신뢰도 증가, 5% 보너스)
                            if score >= 0.5:
                                score = max(score, score * 1.05)
                    except (ValueError, AttributeError):
                        pass
            
            #  지번 + 건축년도 모두 일치 시 높은 점수 (단, 이름 유사도 최소 기준)
            # 이름이 전혀 다른데 지번+건축년도만 같은 경우 방지
            if jibun_match and build_year_match:
                name_sim = SequenceMatcher(None, api_cache['normalized'], db_cache['normalized']).ratio()
                if name_sim >= 0.20 or has_common_brand:
                    score = max(score, 0.97)
                elif name_sim >= 0.15:
                    score = max(score, 0.90)
                # 이름 유사도 0.15 미만이면 지번+건축년도만으로 높은 점수 부여 안 함
            
            # === 4단계: 포함 관계 확인 (양방향) ===
            norm_api = api_cache['normalized']
            norm_db = db_cache['normalized']
            if len(norm_api) >= 4 and len(norm_db) >= 4:
                if norm_api in norm_db:
                    ratio = len(norm_api) / len(norm_db)
                    score = max(score, 0.70 + ratio * 0.2)
                elif norm_db in norm_api:
                    ratio = len(norm_db) / len(norm_api)
                    score = max(score, 0.70 + ratio * 0.2)
            
            # === 5단계: 유사도 기반 매칭 ===
            similarity = ApartmentMatcher.calculate_similarity(norm_api, norm_db)
            if similarity >= 0.85:
                score = max(score, similarity)
            elif similarity >= 0.70:
                score = max(score, similarity * 0.95)
            elif similarity >= 0.60:
                score = max(score, similarity * 0.90)
            
            # === 6단계: 엄격 정규화 유사도 ===
            # 단지 번호가 있는 경우는 엄격 정규화 유사도를 사용하지 않음
            # (단지 번호가 제거되면 다른 단지와 구분이 안 됨)
            strict_similarity = 0.0
            if api_danji is None and api_cha is None:
                strict_similarity = ApartmentMatcher.calculate_similarity(
                    api_cache['strict'], 
                    db_cache['strict']
                )
                if strict_similarity >= 0.75:
                    score = max(score, strict_similarity * 0.90)
                elif strict_similarity >= 0.60:
                    score = max(score, strict_similarity * 0.85)
            
            # === 7단계: 핵심 이름 매칭 ===
            if api_cache['core'] and db_cache['core']:
                core_similarity = ApartmentMatcher.calculate_similarity(
                    api_cache['core'], 
                    db_cache['core']
                )
                if core_similarity >= 0.80:
                    score = max(score, core_similarity * 0.85)
            
            # === 8단계: 한글 키워드 기반 매칭 ===
            api_keywords = set(re.findall(r'[가-힣]{2,}', norm_api))
            db_keywords = set(re.findall(r'[가-힣]{2,}', norm_db))
            
            if api_keywords and db_keywords:
                # 정확한 키워드 매칭
                common_keywords = api_keywords & db_keywords
                
                # 부분 키워드 매칭 (포함 관계)
                partial_matches = 0
                for api_kw in api_keywords:
                    for db_kw in db_keywords:
                        if api_kw != db_kw and len(api_kw) >= 2 and len(db_kw) >= 2:
                            if api_kw in db_kw or db_kw in api_kw:
                                partial_matches += 1
                                break
                
                total_matches = len(common_keywords) + partial_matches * 0.7
                total_keywords = max(len(api_keywords), len(db_keywords))
                
                if total_keywords > 0:
                    keyword_ratio = total_matches / total_keywords
                    if keyword_ratio >= 0.6:
                        score = max(score, 0.65 + keyword_ratio * 0.25)
                    elif keyword_ratio >= 0.4:
                        score = max(score, 0.55 + keyword_ratio * 0.20)
            
            # === 9단계: 브랜드 + 유사도 복합 점수 ===
            if has_common_brand and similarity >= 0.50:
                combined_score = 0.60 + similarity * 0.35
                score = max(score, combined_score)
            
            # === 10단계: 후보가 적을 때 더 관대한 매칭 ===
            #  후보가 적어도 최소한의 이름 유사도 기준 적용 (미스매칭 방지)
            if len(candidates) == 1:
                # 후보가 하나뿐이어도 이름 유사도 최소 0.15 이상 필요
                if similarity >= 0.25 or strict_similarity >= 0.25 or has_common_brand:
                    score = max(score, 0.50)
                elif similarity >= 0.15 or strict_similarity >= 0.15:
                    score = max(score, 0.42)
                # 유사도 0.15 미만이면 무조건 매칭 안 함 (후보가 1개여도)
            elif len(candidates) <= 3:
                # 후보가 3개 이하: 유사도 0.20 이상 또는 브랜드 일치 필요
                if similarity >= 0.25 or strict_similarity >= 0.25 or has_common_brand:
                    score = max(score, 0.42)
                elif similarity >= 0.20 or strict_similarity >= 0.20:
                    score = max(score, 0.38)
            elif len(candidates) <= 5:
                # 후보가 5개 이하: 유사도 0.25 이상 또는 브랜드 일치 필요
                if similarity >= 0.30 or strict_similarity >= 0.30 or has_common_brand:
                    score = max(score, 0.38)
                elif similarity >= 0.25 or strict_similarity >= 0.25:
                    score = max(score, 0.35)
            elif len(candidates) <= 10:
                # 후보가 10개 이하: 유사도 0.30 이상 필요
                if similarity >= 0.35 or strict_similarity >= 0.35:
                    score = max(score, 0.35)
                elif similarity >= 0.30 or strict_similarity >= 0.30:
                    score = max(score, 0.32)
            
            #  개선: 이름 최소 유사도 재검증 (미스매칭 방지)
            # 지번 완전 일치가 아니면서 이름 유사도가 낮으면 제외
            if name_similarity < MIN_NAME_SIMILARITY:
                # 지번 완전 일치 여부 확인
                # (jibun_full_match는 위에서 계산됨)
                if not jibun_full_match:
                    # 이름 유사도 너무 낮음 → 제외
                    logger.debug(
                        f" 이름 최소 유사도 미달: "
                        f"{name_similarity:.2f} < {MIN_NAME_SIMILARITY}, "
                        f"API={apt_name_api}, "
                        f"DB={apt.apt_name}, "
                        f"점수={score:.2f}"
                    )
                    continue  # 다음 후보로
            
            # 최고 점수 업데이트
            if score > best_score:
                best_score = score
                best_match = apt
        
        # 동 검증이 필요한 경우 (전체 후보로 재시도 시)
        if require_dong_match and best_match and umd_nm and all_regions:
            # 매칭된 아파트의 동이 API의 동과 일치하는지 확인
            if best_match.region_id in all_regions:
                matched_region = all_regions[best_match.region_id]
                matched_dong = matched_region.region_name if matched_region else ""
                
                # 동 이름 정규화 후 비교
                normalized_umd = ApartmentMatcher.normalize_dong_name(umd_nm)
                normalized_matched_dong = ApartmentMatcher.normalize_dong_name(matched_dong)
                
                #  개선: 동 검증 로직 강화 (정확 일치 또는 전체-부분 관계만 허용)
                dong_matches = False
                if normalized_umd == normalized_matched_dong:
                    # 정확 일치
                    dong_matches = True
                elif normalized_umd and normalized_matched_dong:
                    # 전체-부분 관계 확인 (길이 차이 2 이하만 허용)
                    if (normalized_umd in normalized_matched_dong or 
                        normalized_matched_dong in normalized_umd):
                        # 길이 차이 확인
                        len_diff = abs(len(normalized_umd) - len(normalized_matched_dong))
                        if len_diff <= 2:
                            dong_matches = True
                        else:
                            logger.debug(
                                f" 동 길이 차이 초과: "
                                f"{len_diff} > 2, "
                                f"API={umd_nm}, "
                                f"DB={matched_dong}"
                            )
                
                if not dong_matches:
                    logger.debug(f" 동 불일치로 매칭 거부: API동={umd_nm}, 매칭동={matched_dong}, 아파트={best_match.apt_name}")
                    return None
        
        #  개선: 동적 임계값 상향 (미스매칭 방지)
        if require_dong_match:
            # 전체 후보 재시도 시 더 높은 임계값 (미스매칭 방지)
            threshold = 0.75  # 0.70 → 0.75 (기본 상향)
            if best_score >= 0.90:
                threshold = 0.75  # 거의 확실한 경우
            elif best_score >= 0.80:
                threshold = 0.80  # 0.75 → 0.80 (상향)
            else:
                threshold = 0.85  # 0.80 → 0.85 (매우 엄격)
        else:
            # 일반 매칭: 후보 수에 따라 동적 임계값 적용
            threshold = 0.50  # 0.40 → 0.50 (기본 상향)
            if len(candidates) == 1:
                threshold = 0.40  # 0.30 → 0.40 (후보 1개 상향)
            elif len(candidates) <= 3:
                threshold = 0.45  # 0.35 → 0.45 (후보 2~3개 상향)
            elif len(candidates) <= 5:
                threshold = 0.48  # 0.38 → 0.48 (후보 4~5개 상향)
            elif len(candidates) <= 10:
                threshold = 0.50  # 0.40 → 0.50 (후보 6~10개 상향)
        
        if best_score >= threshold:
            return best_match
        
        return None
