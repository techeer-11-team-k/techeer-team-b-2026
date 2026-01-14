import os
import httpx
import uvicorn
import pandas as pd
from typing import Optional, Union
from fastapi import FastAPI, HTTPException, Query
from dotenv import load_dotenv

# 1. 환경 변수 로드
load_dotenv()
REB_API_KEY = os.getenv("REB_API_KEY")

# 한국부동산원 데이터 조회 URL
REB_DATA_URL = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"

app = FastAPI()

# --------------------------------------------------------------------------
# [Helper Function] CSV에서 지역 코드 조회 (작성해주신 함수)
# --------------------------------------------------------------------------
def get_area_code_from_csv(user_input, file_path='legion_code.csv'):
    """
    법정동 코드 앞 5자리를 받아 CSV에서 area_code를 찾아 반환합니다.
    성공 시: int 반환
    실패 시: None 또는 에러 메시지(str) 반환
    """
    try:
        # 데이터 로드
        # (실제 운영 시에는 매번 로드하지 않고 전역 변수로 한 번만 로드하는 것이 성능에 좋습니다)
        df = pd.read_csv(file_path, dtype={'region_code': str}) # region_code를 처음부터 문자로 읽기
        
        user_input = str(user_input)

        # 1. 5자리 일치 검색
        match_5 = df[df['region_code'].str.startswith(user_input)]
        
        if not match_5.empty:
            return int(match_5.iloc[0]['area_code'])

        # 2. 앞 2자리 일치 검색 (5자리 실패 시 fallback)
        user_prefix_2 = user_input[:2]
        match_2 = df[df['region_code'].str[:2] == user_prefix_2]
        
        if not match_2.empty:
            return int(match_2.iloc[0]['area_code'])

        return None
    
    except FileNotFoundError:
        return "CSV 파일을 찾을 수 없습니다."
    except Exception as e:
        return f"오류 발생: {e}"

# --------------------------------------------------------------------------
# [API] 법정동 코드로 데이터 조회
# --------------------------------------------------------------------------
@app.get("/api/reb/data/by-legal-code")
async def get_reb_data_by_legal_code(
    # 10자리 법정동 코드 입력 (예: 1111010100)
    legal_dong_code: str = Query(..., description="법정동 코드 10자리 (예: 1111010100)"),
    
    # 기본 파라미터들
    statbl_id: str = Query("A_2024_00045", description="통계표 ID"),
    dtacycle_cd: str = Query("MM", description="주기코드"),
    pIndex: int = Query(1),
    pSize: int = Query(100)
):
    # 1. API 키 확인
    if not REB_API_KEY:
        raise HTTPException(status_code=500, detail="API 키가 설정되지 않았습니다.")

    # 2. 법정동 코드 처리 (앞 5자리 추출)
    if len(legal_dong_code) < 5:
        raise HTTPException(status_code=400, detail="법정동 코드는 최소 5자리 이상이어야 합니다.")
    
    short_code = legal_dong_code[:5] # 앞 5자리 절삭

    # 3. CSV 매핑 함수 호출 -> CLS_ID(area_code) 획득
    area_code_result = get_area_code_from_csv(short_code)

    # 결과 검증 (int가 아니면 실패로 간주)
    if not isinstance(area_code_result, int):
        error_detail = area_code_result if area_code_result else "해당 지역 코드를 찾을 수 없습니다."
        raise HTTPException(status_code=404, detail=f"매핑 실패: {error_detail}")

    # area_code를 문자열로 변환 (API 요청용)
    cls_id = str(area_code_result)
    print(f"📍 입력 코드: {legal_dong_code} -> 5자리: {short_code} -> 매핑된 CLS_ID: {cls_id}")

    # 4. 외부 API 요청 파라미터 구성
    params = {
        "KEY": REB_API_KEY,
        "Type": "json",
        "pIndex": pIndex,
        "pSize": pSize,
        "STATBL_ID": statbl_id,
        "DTACYCLE_CD": dtacycle_cd,
        "CLS_ID": cls_id  # 매핑된 지역 코드를 여기에 넣음
    }

    # 5. API 호출
    async with httpx.AsyncClient(verify=False) as client:
        try:
            response = await client.get(REB_DATA_URL, params=params)
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"외부 API 오류: {response.text}")

            try:
                data = response.json()
                
                # 결과 코드 확인
                if "RESULT" in data and data["RESULT"].get("CODE") != "INFO-000":
                    print(f"⚠️ API 메시지: {data['RESULT']}")
                
                # 결과에 매핑 정보를 포함해서 반환하면 디버깅에 좋습니다.
                return {
                    "mapping_info": {
                        "input_code": legal_dong_code,
                        "used_short_code": short_code,
                        "mapped_cls_id": cls_id
                    },
                    "api_result": data
                }

            except ValueError:
                return {"error": "JSON 파싱 실패", "raw_data": response.text}

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)