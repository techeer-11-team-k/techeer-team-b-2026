"""
REB API 테스트 엔드포인트

한국부동산원 API를 직접 테스트할 수 있는 엔드포인트
"""
import logging
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel, Field

from app.services.data_collection import data_collection_service
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


class REBApiTestResponse(BaseModel):
    """REB API 테스트 응답 스키마"""
    success: bool = Field(..., description="API 호출 성공 여부")
    area_code: str = Field(..., description="사용한 area_code (CLS_ID)")
    total_count: int = Field(..., description="전체 데이터 개수")
    months_found: List[str] = Field(..., description="발견된 월 목록 (YYYYMM 형식)")
    month_analysis: Dict[str, Any] = Field(..., description="월별 분석 결과")
    raw_response: Dict[str, Any] = Field(..., description="원본 API 응답")
    message: str = Field(..., description="결과 메시지")


@router.get(
    "/test",
    response_model=REBApiTestResponse,
    status_code=status.HTTP_200_OK,
    tags=["🔍 REB API 테스트"],
    summary="REB API 테스트 (부동산 지수 데이터)",
    description="""
    한국부동산원 API를 직접 호출하여 테스트합니다.
    
    **사용 목적:**
    - API 응답 구조 확인
    - 어떤 월 데이터가 있는지 확인
    - 홀수 달만 있는지, 모든 달이 있는지 확인
    
    **파라미터:**
    - `area_code`: CLS_ID (예: 500001, 500017)
    - `page`: 페이지 번호 (기본값: 1)
    - `page_size`: 페이지 크기 (기본값: 1000, 최대: 1000)
    
    **응답:**
    - `months_found`: 발견된 모든 월 목록 (YYYYMM 형식)
    - `month_analysis`: 월별 통계 (홀수 달/짝수 달 개수 등)
    - `raw_response`: 원본 API 응답 데이터
    """,
    responses={
        200: {
            "description": "API 테스트 성공",
            "model": REBApiTestResponse
        },
        500: {
            "description": "서버 오류 또는 API 키 미설정"
        }
    }
)
async def test_reb_api(
    area_code: str = Query(..., description="area_code (CLS_ID), 예: 500001", example="500001"),
    page: int = Query(1, description="페이지 번호", ge=1),
    page_size: int = Query(1000, description="페이지 크기", ge=1, le=1000)
) -> REBApiTestResponse:
    """
    REB API 테스트 - 한국부동산원 API를 직접 호출하여 응답 확인
    
    이 엔드포인트는 부동산 지수 데이터 수집 시 사용하는 REB API를 테스트합니다.
    API 응답에서 어떤 월 데이터가 있는지 분석하여 반환합니다.
    
    Args:
        area_code: CLS_ID (지역 코드)
        page: 페이지 번호
        page_size: 페이지 크기
    
    Returns:
        REBApiTestResponse: API 응답 및 분석 결과
    
    Raises:
        HTTPException: API 키가 없거나 서버 오류 발생 시
    """
    try:
        # REB_API_KEY 확인
        if not settings.REB_API_KEY:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "code": "CONFIGURATION_ERROR",
                    "message": "REB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요."
                }
            )
        
        logger.info(f"🔍 REB API 테스트 시작: area_code={area_code}, page={page}, page_size={page_size}")
        
        # API 파라미터
        STATBL_ID = "A_2024_00045"
        DTACYCLE_CD = "MM"
        
        params = {
            "KEY": settings.REB_API_KEY,
            "Type": "json",
            "pIndex": page,
            "pSize": page_size,
            "STATBL_ID": STATBL_ID,
            "DTACYCLE_CD": DTACYCLE_CD,
            "CLS_ID": str(area_code)
        }
        
        # API 호출
        response = await data_collection_service.fetch_with_retry(
            "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do",
            params
        )
        
        if not response or not isinstance(response, dict):
            return REBApiTestResponse(
                success=False,
                area_code=area_code,
                total_count=0,
                months_found=[],
                month_analysis={
                    "error": "API 응답이 유효하지 않습니다",
                    "response_type": str(type(response))
                },
                raw_response={},
                message="API 응답이 유효하지 않습니다"
            )
        
        # 응답 구조 파싱
        stts_data = response.get("SttsApiTblData", [])
        if not isinstance(stts_data, list) or len(stts_data) < 2:
            return REBApiTestResponse(
                success=False,
                area_code=area_code,
                total_count=0,
                months_found=[],
                month_analysis={
                    "error": "API 응답 구조가 올바르지 않습니다",
                    "stts_data_length": len(stts_data) if isinstance(stts_data, list) else 0
                },
                raw_response=response,
                message="API 응답 구조가 올바르지 않습니다"
            )
        
        # RESULT 정보 및 전체 개수 추출
        head_data = stts_data[0].get("head", [])
        result_data = {}
        total_count = 0
        
        for item in head_data:
            if isinstance(item, dict):
                if "RESULT" in item:
                    result_data = item["RESULT"]
                if "list_total_count" in item:
                    total_count = int(item["list_total_count"])
                elif "totalCount" in item:
                    total_count = int(item["totalCount"])
        
        response_code = result_data.get("CODE", "UNKNOWN")
        response_message = result_data.get("MESSAGE", "")
        
        if response_code != "INFO-000":
            return REBApiTestResponse(
                success=False,
                area_code=area_code,
                total_count=0,
                months_found=[],
                month_analysis={
                    "error": f"API 응답 오류: {response_code}",
                    "message": response_message
                },
                raw_response=response,
                message=f"API 응답 오류: {response_code} - {response_message}"
            )
        
        # ROW 데이터 추출
        row_data = stts_data[1].get("row", [])
        if not isinstance(row_data, list):
            row_data = [row_data] if row_data else []
        
        # 월 데이터 분석
        months_set = set()
        months_list = []
        
        for item in row_data:
            wrttime_idtfr_id = item.get("WRTTIME_IDTFR_ID", "").strip()
            if len(wrttime_idtfr_id) >= 6:
                base_ym = wrttime_idtfr_id[:6]
                if base_ym not in months_set:
                    months_set.add(base_ym)
                    months_list.append(base_ym)
        
        # 월 목록 정렬
        months_list.sort()
        
        # 월별 분석
        odd_months = []  # 홀수 달 (01, 03, 05, 07, 09, 11)
        even_months = []  # 짝수 달 (02, 04, 06, 08, 10, 12)
        
        for month_str in months_list:
            if len(month_str) == 6:
                month_num = int(month_str[4:6])
                if month_num % 2 == 1:  # 홀수 달
                    odd_months.append(month_str)
                else:  # 짝수 달
                    even_months.append(month_str)
        
        month_analysis = {
            "total_months": len(months_list),
            "odd_months_count": len(odd_months),
            "even_months_count": len(even_months),
            "odd_months": odd_months[:10],  # 처음 10개만 표시
            "even_months": even_months[:10],  # 처음 10개만 표시
            "has_all_months": len(odd_months) > 0 and len(even_months) > 0,
            "only_odd_months": len(odd_months) > 0 and len(even_months) == 0,
            "only_even_months": len(odd_months) == 0 and len(even_months) > 0,
            "sample_months": months_list[:20]  # 처음 20개만 표시
        }
        
        logger.info(f"✅ REB API 테스트 완료: area_code={area_code}, 총 {total_count}개, 월 {len(months_list)}개 발견")
        
        return REBApiTestResponse(
            success=True,
            area_code=area_code,
            total_count=total_count,
            months_found=months_list,
            month_analysis=month_analysis,
            raw_response=response,
            message=f"API 호출 성공: 총 {total_count}개 데이터, {len(months_list)}개 월 발견"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ REB API 테스트 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "TEST_ERROR",
                "message": f"API 테스트 중 오류가 발생했습니다: {str(e)}"
            }
        )
