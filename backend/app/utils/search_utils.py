"""
검색 유틸리티 함수

pg_trgm 기반 유사도 검색을 위한 정규화 함수 및 헬퍼
"""
import re


# 영문 ↔ 한글 브랜드명 변환 규칙 (양방향)
# 영문 -> 한글로 통일하여 매칭 확률 향상
BRAND_ENG_TO_KOR = {
    'lg': '엘지',
    'sk': '에스케이',
    'gs': '지에스',
    'kt': '케이티',
    'kcc': '케이씨씨',
    'lh': '엘에이치',
    'sh': '에스에이치',
    'sr': '에스알',
    'am': '에이엠',
    'w': '더블유',
    'y': '와이',
    'e편한세상': '이편한세상',
    'metapolis': '메타폴리스',
    'wellga': '웰가',
    'view': '뷰',
    'city': '시티',
}

# 한글 -> 영문 변환 (역방향)
BRAND_KOR_TO_ENG = {v: k for k, v in BRAND_ENG_TO_KOR.items()}


def normalize_apt_name_py(name: str) -> str:
    """
    아파트명 정규화 (SQL 함수 normalize_apt_name과 동일 로직)
    
    정규화 규칙:
    1. 소문자 변환
    2. 브랜드명 통일 (e편한세상 -> 이편한세상)
    3. 공백, 특수문자 제거 (-, (), [], ·, 공백)
    4. '아파트' 접미사 제거
    
    Args:
        name: 원본 아파트명
    
    Returns:
        정규화된 아파트명
    
    Examples:
        >>> normalize_apt_name_py("롯데 캐슬 파크타운")
        '롯데캐슬파크타운'
        >>> normalize_apt_name_py("e편한세상 센트럴파크")
        '이편한세상센트럴파크'
        >>> normalize_apt_name_py("현대아파트")
        '현대'
    """
    if not name:
        return ""
    
    result = name.lower()
    
    # 브랜드명 통일
    result = result.replace('e편한세상', '이편한세상')
    
    # 공백 및 특수문자 제거
    result = re.sub(r'[\s\-\(\)\[\]·]', '', result)
    
    # '아파트' 접미사 제거
    result = re.sub(r'아파트$', '', result)
    
    return result


def normalize_apt_name_for_matching(name: str) -> str:
    """
    매칭용 확장 아파트명 정규화 (영문↔한글 브랜드명 변환 포함)
    
    정규화 규칙:
    1. 소문자 변환
    2. 영문 브랜드명 → 한글로 통일 (LG→엘지, SK→에스케이 등)
    3. e편한세상 → 이편한세상
    4. 공백, 특수문자, 괄호, 숫자차수 표기 제거
    5. '아파트', '맨션', '빌라', '타운' 등 접미사 제거
    
    Args:
        name: 원본 아파트명
    
    Returns:
        매칭용 정규화된 아파트명
    
    Examples:
        >>> normalize_apt_name_for_matching("연산LG아파트")
        '연산엘지'
        >>> normalize_apt_name_for_matching("연산엘지")
        '연산엘지'
        >>> normalize_apt_name_for_matching("SK VIEW 아파트")
        '에스케이뷰'
    """
    if not name:
        return ""
    
    result = name.lower()
    
    # 영문 브랜드명 → 한글로 통일 (긴 것부터 먼저 치환)
    sorted_brands = sorted(BRAND_ENG_TO_KOR.items(), key=lambda x: len(x[0]), reverse=True)
    for eng, kor in sorted_brands:
        result = result.replace(eng, kor)
    
    # 공백 및 특수문자 제거 (괄호 내용 포함)
    result = re.sub(r'\([^)]*\)', '', result)  # 괄호 안 내용 제거
    result = re.sub(r'\[[^\]]*\]', '', result)  # 대괄호 안 내용 제거
    result = re.sub(r'[\s\-·.,\'\"]', '', result)  # 특수문자 제거
    
    # 숫자차수 표기 정규화 (1차, 2차 등 제거 - 매칭 시 혼란 방지)
    result = re.sub(r'\d+차$', '', result)
    result = re.sub(r'\d+단지$', '', result)
    
    # 접미사 제거
    suffixes = ['아파트', '맨션', '빌라', '타운', '하이츠', '팰리스', '파크']
    for suffix in suffixes:
        if result.endswith(suffix):
            result = result[:-len(suffix)]
            break
    
    return result


def get_matching_variants(name: str) -> list:
    """
    매칭을 위한 이름 변형 목록 생성
    영문↔한글 양방향 변환을 통해 여러 가지 변형 생성
    
    Args:
        name: 원본 아파트명
    
    Returns:
        매칭 시도할 이름 변형 목록
    
    Examples:
        >>> get_matching_variants("연산LG")
        ['연산lg', '연산엘지']
        >>> get_matching_variants("연산엘지")
        ['연산엘지', '연산lg']
    """
    if not name:
        return []
    
    variants = set()
    base = name.lower()
    
    # 기본 정규화
    normalized = normalize_apt_name_for_matching(name)
    variants.add(normalized)
    variants.add(base)
    
    # 영문 → 한글 변환
    eng_to_kor = base
    for eng, kor in sorted(BRAND_ENG_TO_KOR.items(), key=lambda x: len(x[0]), reverse=True):
        eng_to_kor = eng_to_kor.replace(eng, kor)
    variants.add(eng_to_kor)
    
    # 한글 → 영문 변환
    kor_to_eng = base
    for kor, eng in sorted(BRAND_KOR_TO_ENG.items(), key=lambda x: len(x[0]), reverse=True):
        kor_to_eng = kor_to_eng.replace(kor, eng)
    variants.add(kor_to_eng)
    
    # 공백/특수문자 제거 버전들
    clean_variants = set()
    for v in variants:
        clean = re.sub(r'[\s\-\(\)\[\]·]', '', v)
        clean_variants.add(clean)
    variants.update(clean_variants)
    
    return list(variants)


# 추가 브랜드명 정규화 규칙 (필요시 확장 가능)
BRAND_NORMALIZATIONS = {
    'e편한세상': '이편한세상',
    **BRAND_ENG_TO_KOR,
}


def normalize_apt_name_extended(name: str) -> str:
    """
    확장된 아파트명 정규화 (추가 브랜드명 정규화 포함)
    
    Args:
        name: 원본 아파트명
    
    Returns:
        정규화된 아파트명
    """
    if not name:
        return ""
    
    result = name.lower()
    
    # 브랜드명 통일 (긴 것부터 먼저)
    for original, normalized in sorted(BRAND_NORMALIZATIONS.items(), key=lambda x: len(x[0]), reverse=True):
        result = result.replace(original.lower(), normalized.lower())
    
    # 공백 및 특수문자 제거
    result = re.sub(r'[\s\-\(\)\[\]·]', '', result)
    
    # '아파트' 접미사 제거
    result = re.sub(r'아파트$', '', result)
    
    return result
