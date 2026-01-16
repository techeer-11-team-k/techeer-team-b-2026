"""
데이터 수집 서비스 모듈

아파트 매칭 알고리즘 및 데이터 수집 기능 제공
"""
from .constants import (
    # API URLs
    MOLIT_REGION_API_URL,
    MOLIT_APARTMENT_LIST_API_URL,
    MOLIT_APARTMENT_BASIC_API_URL,
    MOLIT_APARTMENT_DETAIL_API_URL,
    REB_DATA_URL,
    MOLIT_SALE_API_URL,
    MOLIT_RENT_API_URL,
    # 지역
    CITY_NAMES,
    # 브랜드 사전
    BRAND_DICT,
    BRAND_DICT_TIER1,
    BRAND_DICT_PUBLIC,
    BRAND_DICT_TIER2,
    BRAND_KEYWORD_TO_STANDARD,
    BRAND_KEYWORDS_SORTED,
    BRAND_ENG_TO_KOR,
    BRAND_KOR_TO_ENG,
    # 상수
    BUILD_YEAR_TOLERANCE,
    MATCHING_SCORE_THRESHOLD,
    AMBIGUOUS_MATCH_DIFF,
)

from .preprocessing import (
    ApartmentNameProcessor,
    DongNameProcessor,
    BunjiProcessor,
    calculate_similarity,
    token_set_similarity,
    get_apt_processor,
    get_dong_processor,
)

from .matching import (
    MatchResult,
    VetoChecker,
    ApartmentMatcher,
    AddressOnlyMatcher,
    get_matcher,
    get_address_matcher,
)

__all__ = [
    # Constants
    'MOLIT_REGION_API_URL',
    'MOLIT_APARTMENT_LIST_API_URL',
    'MOLIT_APARTMENT_BASIC_API_URL',
    'MOLIT_APARTMENT_DETAIL_API_URL',
    'REB_DATA_URL',
    'MOLIT_SALE_API_URL',
    'MOLIT_RENT_API_URL',
    'CITY_NAMES',
    'BRAND_DICT',
    'BRAND_DICT_TIER1',
    'BRAND_DICT_PUBLIC',
    'BRAND_DICT_TIER2',
    'BRAND_KEYWORD_TO_STANDARD',
    'BRAND_KEYWORDS_SORTED',
    'BRAND_ENG_TO_KOR',
    'BRAND_KOR_TO_ENG',
    'BUILD_YEAR_TOLERANCE',
    'MATCHING_SCORE_THRESHOLD',
    'AMBIGUOUS_MATCH_DIFF',
    # Preprocessing
    'ApartmentNameProcessor',
    'DongNameProcessor',
    'BunjiProcessor',
    'calculate_similarity',
    'token_set_similarity',
    'get_apt_processor',
    'get_dong_processor',
    # Matching
    'MatchResult',
    'VetoChecker',
    'ApartmentMatcher',
    'AddressOnlyMatcher',
    'get_matcher',
    'get_address_matcher',
]
