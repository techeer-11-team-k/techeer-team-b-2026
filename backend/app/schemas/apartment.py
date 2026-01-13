from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


# ============ 외부 API 응답 스키마 ============

class AptBasicInfo(BaseModel):
    """
    아파트 기본 정보 스키마
    """
    # 필수 필드
    kapt_code: str = Field(..., alias="kaptCode", description="단지 코드(고유 식별자)")
    kapt_name: str = Field(..., alias="kaptName", description="단지명")
    
    # 선택 필드
    zipcode: Optional[str] = Field(None, alias="zipcode", description="우편번호")
    kapt_addr: Optional[str] = Field(None, alias="kaptAddr", description="지번 주소")
    code_sale_nm: Optional[str] = Field(None, alias="codeSaleNm", description="분양 형태(명칭)")
    code_heat_nm: Optional[str] = Field(None, alias="codeHeatNm", description="난방 방식(명칭)")
    kapt_tarea: Optional[int] = Field(None, alias="kaptTarea", description="대지면적/총면적(지표)")
    kapt_dong_cnt: Optional[int] = Field(None, alias="kaptDongCnt", description="동 수")
    kaptda_cnt: Optional[str] = Field(None, alias="kaptdaCnt", description="세대 수(문자열로 제공되는 케이스)")
    kapt_bcompany: Optional[str] = Field(None, alias="kaptBcompany", description="시공사")
    kapt_acompany: Optional[str] = Field(None, alias="kaptAcompany", description="시행사/관리 주체(표기값)")
    kapt_tel: Optional[str] = Field(None, alias="kaptTel", description="대표 전화번호")
    kapt_fax: Optional[str] = Field(None, alias="kaptFax", description="팩스 번호")
    kapt_url: Optional[str] = Field(None, alias="kaptUrl", description="단지/관리사무소 URL")
    code_apt_nm: Optional[str] = Field(None, alias="codeAptNm", description="아파트 유형(명칭)")
    doro_juso: Optional[str] = Field(None, alias="doroJuso", description="도로명 주소")
    ho_cnt: Optional[int] = Field(None, alias="hoCnt", description="호 수")
    code_mgr_nm: Optional[str] = Field(None, alias="codeMgrNm", description="관리 방식(명칭)")
    code_hall_nm: Optional[str] = Field(None, alias="codeHallNm", description="복도/현관 형태(명칭)")
    kapt_usedate: Optional[str] = Field(None, alias="kaptUsedate", description="사용승인일/준공일")
    kapt_marea: Optional[int] = Field(None, alias="kaptMarea", description="관리면적(지표)")
    kapt_mparea_60: Optional[int] = Field(None, alias="kaptMparea60", description="전용면적 60㎡ 이하 비중/면적(지표)")
    kapt_mparea_85: Optional[int] = Field(None, alias="kaptMparea85", description="전용면적 85㎡ 이하 비중/면적(지표)")
    kapt_mparea_135: Optional[int] = Field(None, alias="kaptMparea135", description="전용면적 135㎡ 이하 비중/면적(지표)")
    kapt_mparea_136: Optional[int] = Field(None, alias="kaptMparea136", description="전용면적 136㎡ 이상 비중/면적(지표)")
    priv_area: Optional[int] = Field(None, alias="privArea", description="전용면적(또는 전유면적)")
    bjd_code: Optional[str] = Field(None, alias="bjdCode", description="법정동 코드")
    kapt_top_floor: Optional[int] = Field(None, alias="kaptTopFloor", description="최고층")
    ktown_flr_no: Optional[int] = Field(None, alias="ktownFlrNo", description="지하/지상 층 관련 값(필드명 기준)")
    kapt_base_floor: Optional[int] = Field(None, alias="kaptBaseFloor", description="최저층/기준층")
    kaptd_ecntp: Optional[int] = Field(None, alias="kaptdEcntp", description="승강기 관련 수치(필드명 기준)")
    
    model_config = ConfigDict(
        populate_by_name=True,  # alias와 원래 이름 모두 허용
        json_schema_extra={
            "example": {
                "kaptCode": "A10027875",
                "kaptName": "괴정 경성스마트W아파트",
                "zipcode": "49338",
                "kaptAddr": "부산광역시 사하구 괴정동 258",
                "codeSaleNm": "분양",
                "codeHeatNm": "개별난방",
                "kaptTarea": 15040,
                "kaptDongCnt": 3,
                "kaptdaCnt": "182",
                "kaptBcompany": "(주)경성리츠",
                "kaptAcompany": "(주)경성리츠",
                "kaptTel": "0512949363",
                "kaptFax": "0512949364",
                "kaptUrl": " ",
                "codeAptNm": "주상복합",
                "doroJuso": "부산광역시 사하구 낙동대로 180",
                "hoCnt": 182,
                "codeMgrNm": "자치관리",
                "codeHallNm": "혼합식",
                "kaptUsedate": "20150806",
                "kaptMarea": 15040,
                "kaptMparea60": 182,
                "kaptMparea85": 0,
                "kaptMparea135": 0,
                "kaptMparea136": 0,
                "privArea": 9014,
                "bjdCode": "2638010100",
                "kaptTopFloor": 15,
                "ktownFlrNo": 15,
                "kaptBaseFloor": 2,
                "kaptdEcntp": 5
            }
        }
    )


class AptDetailInfo(BaseModel):
    """
    아파트 상세 정보 스키마
    
    외부 API에서 받은 아파트 상세 정보를 모델링합니다.
    """
    # 필수 필드
    kapt_code: str = Field(..., alias="kaptCode", description="단지 코드")
    kapt_name: str = Field(..., alias="kaptName", description="단지명")
    use_yn: str = Field(..., alias="useYn", description="사용 여부(Y/N)")
    
    # 선택 필드
    underground_el_charger_cnt: Optional[int] = Field(None, alias="undergroundElChargerCnt", description="지하 전기차 충전기 수")
    code_mgr: Optional[str] = Field(None, alias="codeMgr", description="관리 방식 코드")
    kapt_mgr_cnt: Optional[int] = Field(None, alias="kaptMgrCnt", description="관리 인원 수")
    kapt_ccompany: Optional[str] = Field(None, alias="kaptCcompany", description="관리 업체명")
    code_sec: Optional[str] = Field(None, alias="codeSec", description="경비 방식 코드")
    kaptd_scnt: Optional[int] = Field(None, alias="kaptdScnt", description="경비 인원 수")
    kaptd_sec_com: Optional[str] = Field(None, alias="kaptdSecCom", description="경비 업체명")
    code_clean: Optional[str] = Field(None, alias="codeClean", description="청소 방식 코드")
    kaptd_clcnt: Optional[int] = Field(None, alias="kaptdClcnt", description="청소 인원 수")
    code_garbage: Optional[str] = Field(None, alias="codeGarbage", description="쓰레기 처리 방식 코드")
    code_disinf: Optional[str] = Field(None, alias="codeDisinf", description="소독 방식 코드")
    kaptd_dcnt: Optional[int] = Field(None, alias="kaptdDcnt", description="소독 인원 수")
    disposal_type: Optional[str] = Field(None, alias="disposalType", description="폐기물 처리 타입")
    code_str: Optional[str] = Field(None, alias="codeStr", description="구조/형식 코드")
    kaptd_ecapa: Optional[int] = Field(None, alias="kaptdEcapa", description="승강기 용량/규모(지표)")
    code_econ: Optional[str] = Field(None, alias="codeEcon", description="경제/회계 방식 코드")
    code_emgr: Optional[str] = Field(None, alias="codeEmgr", description="비상관리 코드")
    code_falarm: Optional[str] = Field(None, alias="codeFalarm", description="화재경보 코드")
    code_wsupply: Optional[str] = Field(None, alias="codeWsupply", description="급수 방식 코드")
    code_elev: Optional[str] = Field(None, alias="codeElev", description="승강기 관련 코드")
    kaptd_ecnt: Optional[int] = Field(None, alias="kaptdEcnt", description="승강기 수(또는 관련 수치)")
    kaptd_pcnt: Optional[int] = Field(None, alias="kaptdPcnt", description="주차 대수(총)")
    kaptd_pcntu: Optional[int] = Field(None, alias="kaptdPcntu", description="주차 대수(세부)")
    code_net: Optional[str] = Field(None, alias="codeNet", description="통신/네트워크 코드")
    kaptd_cccnt: Optional[int] = Field(None, alias="kaptdCccnt", description="CCTV 수(또는 관련 수치)")
    welfare_facility: Optional[str] = Field(None, alias="welfareFacility", description="복지시설 정보")
    kaptd_wtimebus: Optional[str] = Field(None, alias="kaptdWtimebus", description="버스 도보 시간")
    subway_line: Optional[str] = Field(None, alias="subwayLine", description="인근 지하철 노선")
    subway_station: Optional[str] = Field(None, alias="subwayStation", description="인근 지하철역")
    kaptd_wtimesub: Optional[str] = Field(None, alias="kaptdWtimesub", description="지하철 도보 시간")
    convenient_facility: Optional[str] = Field(None, alias="convenientFacility", description="편의시설 정보")
    education_facility: Optional[str] = Field(None, alias="educationFacility", description="교육시설 정보")
    ground_el_charger_cnt: Optional[int] = Field(None, alias="groundElChargerCnt", description="지상 전기차 충전기 수")
    
    model_config = ConfigDict(
        populate_by_name=True,  # alias와 원래 이름 모두 허용
        json_schema_extra={
            "example": {
                "kaptCode": "A10027875",
                "kaptName": "괴정 경성스마트W아파트",
                "useYn": "Y",
                "undergroundElChargerCnt": 0,
                "codeMgr": "자치관리",
                "kaptMgrCnt": 2,
                "kaptCcompany": None,
                "codeSec": "자치관리(직영)",
                "kaptdScnt": 2,
                "kaptdSecCom": None,
                "codeClean": "자치관리",
                "kaptdClcnt": 1,
                "codeGarbage": "차량수거방식",
                "codeDisinf": "위탁관리",
                "kaptdDcnt": 5,
                "disposalType": "분무식",
                "codeStr": "철근콘크리트구조",
                "kaptdEcapa": 1310,
                "codeEcon": "단일계약",
                "codeEmgr": "위탁선임",
                "codeFalarm": "R형",
                "codeWsupply": "부스타방식",
                "codeElev": "위탁관리",
                "kaptdEcnt": 5,
                "kaptdPcnt": 0,
                "kaptdPcntu": 162,
                "codeNet": "유",
                "kaptdCccnt": 20,
                "welfareFacility": "관리사무소",
                "kaptdWtimebus": "5분이내",
                "subwayLine": "1호선",
                "subwayStation": None,
                "kaptdWtimesub": "5~10분이내",
                "convenientFacility": "관공서(괴정3동치안센타) 대형상가(뉴코아 아울렛) 기타(괴정시장)",
                "educationFacility": "초등학교(괴정초등학교) 대학교(동주대학교)",
                "groundElChargerCnt": 0
                }
        }
    )


