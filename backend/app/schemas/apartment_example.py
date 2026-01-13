"""
외부 API 응답 스키마 구성 예시

이 파일은 외부 API 응답을 받았을 때 스키마를 어떻게 구성하는지 보여주는 예시입니다.
실제 사용 시에는 apartment.py에 통합하세요.
"""
from pydantic import BaseModel, Field
from typing import Optional, List


# ============================================================
# 단계 1: 외부 API 응답 구조 분석
# ============================================================
# 
# 외부 API 응답 예시:
# {
#   "response": {
#     "body": {
#       "item": {
#         "kaptCode": "A10027875",
#         "kaptName": "괴정 경성스마트W아파트",
#         ...
#       }
#     },
#     "header": {
#       "resultCode": "00",
#       "resultMsg": "NORMAL SERVICE."
#     }
#   }
# }
#
# 구조: response > body > item (실제 데이터)
# ============================================================


# ============================================================
# 단계 2-1: 실제 데이터 스키마 (가장 안쪽부터)
# ============================================================

class MolitAptItem(BaseModel):
    """
    국토부 API의 아파트 정보 항목
    
    외부 API가 보내는 실제 데이터 필드들을 정의합니다.
    """
    # 필수 필드 (외부 API에서 항상 제공)
    kapt_code: str = Field(..., alias="kaptCode", description="아파트 코드")
    kapt_name: str = Field(..., alias="kaptName", description="아파트명")
    kapt_addr: str = Field(..., alias="kaptAddr", description="아파트 주소")
    
    # 선택 필드 (외부 API에서 없을 수 있음)
    code_sale_nm: Optional[str] = Field(None, alias="codeSaleNm", description="분양 구분")
    code_heat_nm: Optional[str] = Field(None, alias="codeHeatNm", description="난방 방식")
    kapt_tarea: Optional[float] = Field(None, alias="kaptTarea", description="연면적")
    kapt_dong_cnt: Optional[str] = Field(None, alias="kaptDongCnt", description="동 수")
    kaptda_cnt: Optional[int] = Field(None, alias="kaptdaCnt", description="세대 수")
    kapt_bcompany: Optional[str] = Field(None, alias="kaptBcompany", description="시공사")
    kapt_acompany: Optional[str] = Field(None, alias="kaptAcompany", description="시행사")
    kapt_tel: Optional[str] = Field(None, alias="kaptTel", description="관리사무소 전화번호")
    kapt_url: Optional[str] = Field(None, alias="kaptUrl", description="홈페이지 URL")
    code_apt_nm: Optional[str] = Field(None, alias="codeAptNm", description="아파트 유형")
    doro_juso: Optional[str] = Field(None, alias="doroJuso", description="도로명 주소")
    code_mgr_nm: Optional[str] = Field(None, alias="codeMgrNm", description="관리 방식")
    code_hall_nm: Optional[str] = Field(None, alias="codeHallNm", description="현관 구조")
    kapt_usedate: Optional[str] = Field(None, alias="kaptUsedate", description="사용승인일 (YYYYMMDD)")
    kapt_fax: Optional[str] = Field(None, alias="kaptFax", description="팩스 번호")
    ho_cnt: Optional[int] = Field(None, alias="hoCnt", description="호 수")
    kapt_marea: Optional[float] = Field(None, alias="kaptMarea", description="주거면적")
    kapt_mparea_60: Optional[int] = Field(None, alias="kaptMparea60", description="60㎡ 이하 세대수")
    kapt_mparea_85: Optional[int] = Field(None, alias="kaptMparea85", description="85㎡ 이하 세대수")
    kapt_mparea_135: Optional[int] = Field(None, alias="kaptMparea135", description="135㎡ 이하 세대수")
    kapt_mparea_136: Optional[int] = Field(None, alias="kaptMparea136", description="136㎡ 초과 세대수")
    priv_area: Optional[float] = Field(None, alias="privArea", description="전용면적")
    bjd_code: Optional[str] = Field(None, alias="bjdCode", description="법정동 코드")
    kapt_top_floor: Optional[int] = Field(None, alias="kaptTopFloor", description="최고층")
    ktown_flr_no: Optional[int] = Field(None, alias="ktownFlrNo", description="지상층수")
    kapt_base_floor: Optional[int] = Field(None, alias="kaptBaseFloor", description="지하층수")
    kaptd_ecntp: Optional[int] = Field(None, alias="kaptdEcntp", description="엘리베이터 수")
    zipcode: Optional[str] = Field(None, alias="zipcode", description="우편번호")
    
    class Config:
        populate_by_name = True  # alias와 원래 이름 모두 허용
        json_schema_extra = {
            "example": {
                "kaptCode": "A10027875",
                "kaptName": "괴정 경성스마트W아파트",
                "kaptAddr": "부산광역시 사하구 괴정동 258 괴정 경성스마트W아파트",
                "codeSaleNm": "분양",
                "codeHeatNm": "개별난방",
                "kaptTarea": 15040.163,
                "kaptDongCnt": "3",
                "kaptdaCnt": 182,
                "kaptBcompany": "(주)경성리츠",
                "kaptAcompany": "(주)경성리츠",
                "kaptTel": "0512949363",
                "kaptUrl": " ",
                "codeAptNm": "주상복합",
                "doroJuso": "부산광역시 사하구 낙동대로 180",
                "codeMgrNm": "자치관리",
                "codeHallNm": "혼합식",
                "kaptUsedate": "20150806",
                "kaptFax": "0512949364",
                "hoCnt": 182,
                "kaptMarea": 15040.163,
                "kaptMparea60": 182,
                "kaptMparea85": 0,
                "kaptMparea135": 0,
                "kaptMparea136": 0,
                "privArea": "9014.0338",
                "bjdCode": "2638010100",
                "kaptTopFloor": 15,
                "ktownFlrNo": 15,
                "kaptBaseFloor": 2,
                "kaptdEcntp": 5,
                "zipcode": "49338"
            }
        }


# ============================================================
# 단계 2-2: 응답 헤더 스키마
# ============================================================

class MolitResponseHeader(BaseModel):
    """국토부 API 응답 헤더"""
    result_code: str = Field(..., alias="resultCode", description="결과 코드")
    result_msg: str = Field(..., alias="resultMsg", description="결과 메시지")
    
    class Config:
        populate_by_name = True


# ============================================================
# 단계 2-3: 응답 본문 스키마
# ============================================================

class MolitResponseBody(BaseModel):
    """국토부 API 응답 본문"""
    item: Optional[MolitAptItem] = Field(None, description="아파트 정보")
    
    class Config:
        populate_by_name = True


# ============================================================
# 단계 2-4: 최상위 응답 스키마
# ============================================================

class MolitAptBasicInfo(BaseModel):
    """
    국토부 API 전체 응답 구조
    
    외부 API의 전체 응답 형식을 그대로 모델링합니다.
    """
    response: dict = Field(..., description="응답 데이터")
    header: Optional[MolitResponseHeader] = None
    body: Optional[MolitResponseBody] = None
    
    class Config:
        populate_by_name = True
        extra = "allow"  # 외부 API가 추가 필드를 보낼 수 있음
        
    def get_apt_item(self) -> Optional[MolitAptItem]:
        """
        아파트 정보 항목을 추출하는 헬퍼 메서드
        
        외부 API 응답 구조가 복잡하므로, 편리하게 접근할 수 있도록 도와줍니다.
        """
        # 방법 1: body.item 경로로 접근
        if self.body and self.body.item:
            return self.body.item
        
        # 방법 2: response.body.item 경로로 직접 접근 시도
        if isinstance(self.response, dict):
            body = self.response.get("body", {})
            if isinstance(body, dict):
                item = body.get("item")
                if item:
                    return MolitAptItem(**item)
        
        return None


# ============================================================
# 사용 예시
# ============================================================

"""
# 서비스 레이어에서 사용하는 방법:

from app.schemas.apartment import MolitAptBasicInfo, MolitAptItem
import httpx

async def get_apartment_from_api(apt_code: str):
    # 1. 외부 API 호출
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.example.com/apartments/{apt_code}",
            params={"serviceKey": "your_api_key"}
        )
        api_data = response.json()
    
    # 2. 외부 API 응답을 스키마로 파싱
    molit_info = MolitAptBasicInfo(**api_data)
    
    # 3. 아파트 정보 추출
    apt_item = molit_info.get_apt_item()
    
    if apt_item:
        # 4. 내부 스키마로 변환 (다음 단계)
        return {
            "apt_id": apt_item.kapt_code,
            "apt_name": apt_item.kapt_name,
            "address": apt_item.kapt_addr,
            "total_households": apt_item.kaptda_cnt,
            # ... 필요한 필드만 선택
        }
    
    return None
"""
