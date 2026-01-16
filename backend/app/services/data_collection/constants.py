"""
데이터 수집 관련 상수 정의
"""
# 국토부 표준지역코드 API 엔드포인트
MOLIT_REGION_API_URL = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList"

# 국토부 아파트 목록 API 엔드포인트
MOLIT_APARTMENT_LIST_API_URL = "https://apis.data.go.kr/1613000/AptListService3/getTotalAptList3"

# 국토부 아파트 기본정보 API 엔드포인트
MOLIT_APARTMENT_BASIC_API_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4"

# 국토부 아파트 상세정보 API 엔드포인트
MOLIT_APARTMENT_DETAIL_API_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusDtlInfoV4"

# 한국부동산원 API 엔드포인트
REB_DATA_URL = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"

# 국토부 아파트 매매 실거래가 상세 자료 API (Dev 버전 - 더 정확한 정보 제공)
# 기존: RTMSDataSvcAptTrade → 신규: RTMSDataSvcAptTradeDev
# 추가 필드: aptSeq(단지일련번호), bonbun/bubun(본번/부번), umdCd(읍면동코드), 도로명주소 등
MOLIT_SALE_API_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"

# 국토부 아파트 전월세 실거래가 API 엔드포인트 (JSON)
MOLIT_RENT_API_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"

# 시도 목록 (17개)
CITY_NAMES = [
    "강원특별자치도",
    "경기도",
    "경상남도",
    "경상북도",
    "광주광역시",
    "대구광역시",
    "대전광역시",
    "부산광역시",
    "서울특별시",
    "세종특별자치시",
    "울산광역시",
    "인천광역시",
    "전라남도",
    "전북특별자치도",
    "제주특별자치도",
    "충청남도",
    "충청북도"
]
