"""
데이터 수집 API 엔드포인트

국토교통부 API에서 지역 데이터를 가져와서 데이터베이스에 저장하는 API
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db, get_db_no_auto_commit
from app.services.data_collection import data_collection_service
from app.schemas.state import StateCollectionResponse
from app.schemas.apartment import ApartmentCollectionResponse
from app.schemas.apart_detail import ApartDetailCollectionResponse
from app.schemas.rent import RentTransactionRequest, RentCollectionResponse
from app.schemas.sale import SalesCollectionResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/regions",
    response_model=StateCollectionResponse,
    status_code=status.HTTP_200_OK,
    tags=["📥 Data Collection (데이터 수집)"],
    summary="지역 데이터 수집",
    description="""
    국토교통부 표준지역코드 API에서 모든 시도의 지역 데이터를 가져와서 데이터베이스에 저장합니다.
    
    **작동 방식:**
    1. 17개 시도(서울특별시, 부산광역시 등)를 순회하며 API 호출
    2. 각 시도별로 페이지네이션하여 모든 데이터 수집
    3. 데이터베이스에 이미 존재하는 지역코드는 건너뛰고, 새로운 데이터만 저장
    4. 진행 상황을 로그로 출력
    
    **주의사항:**
    - MOLIT_API_KEY 환경변수가 설정되어 있어야 합니다
    - API 호출 제한이 있을 수 있으므로 주의해서 사용하세요
    - 이미 수집된 데이터는 중복 저장되지 않습니다 (region_code 기준)
    
    **응답:**
    - total_fetched: API에서 가져온 총 레코드 수
    - total_saved: 데이터베이스에 저장된 레코드 수
    - skipped: 중복으로 건너뛴 레코드 수
    - errors: 오류 메시지 목록
    """,
    responses={
        200: {
            "description": "데이터 수집 완료",
            "model": StateCollectionResponse
        },
        500: {
            "description": "서버 오류 또는 API 키 미설정"
        }
    }
)
async def collect_regions(
    db: AsyncSession = Depends(get_db)
) -> StateCollectionResponse:
    """
    지역 데이터 수집 - 국토부 API에서 모든 시도의 지역 데이터를 가져와서 저장
    
    이 API는 국토교통부 표준지역코드 API를 호출하여:
    - 17개 시도의 모든 시군구 데이터를 수집
    - STATES 테이블에 저장
    - 중복 데이터는 자동으로 건너뜀
    
    Returns:
        StateCollectionResponse: 수집 결과 통계
    
    Raises:
        HTTPException: API 키가 없거나 서버 오류 발생 시
    """
    try:
        logger.info("=" * 60)
        logger.info("🌐 지역 데이터 수집 API 호출됨")
        logger.info("=" * 60)
        
        # 데이터 수집 실행
        result = await data_collection_service.collect_all_regions(db)
        
        if result.success:
            logger.info(f"✅ 데이터 수집 성공: {result.message}")
        else:
            logger.warning(f"⚠️ 데이터 수집 완료 (일부 오류): {result.message}")
        
        return result
        
    except ValueError as e:
        # API 키 미설정 등 설정 오류
        logger.error(f"❌ 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CONFIGURATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # 기타 오류
        logger.error(f"❌ 데이터 수집 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COLLECTION_ERROR",
                "message": f"데이터 수집 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.post(
    "/apartments/detail",
    response_model=ApartDetailCollectionResponse,
    status_code=status.HTTP_200_OK,
    tags=["📥 Data Collection (데이터 수집)"],
    summary="아파트 상세 정보 수집",
    description="""
    국토교통부 API에서 모든 아파트의 상세 정보를 가져와서 데이터베이스에 저장합니다.
    
    **작동 방식:**
    1. 데이터베이스에 저장된 모든 아파트를 조회
    2. 각 아파트에 대해 기본정보 API와 상세정보 API를 호출
    3. 두 API 응답을 조합하여 파싱
    4. 100개씩 처리 후 커밋 (트랜잭션 방식)
    5. 이미 존재하는 상세 정보는 건너뛰기 (1대1 관계 보장)
    6. 진행 상황을 로그로 출력
    
    **주의사항:**
    - MOLIT_API_KEY 환경변수가 설정되어 있어야 합니다
    - API 호출 제한이 있을 수 있으므로 주의해서 사용하세요
    - 이미 수집된 데이터는 중복 저장되지 않습니다 (apt_id 기준, 1대1 관계)
    - 각 아파트마다 독립적인 트랜잭션으로 처리되어 한 아파트에서 오류가 발생해도 다른 아파트에 영향을 주지 않습니다
    
    **응답:**
    - total_processed: 처리한 총 아파트 수
    - total_saved: 데이터베이스에 저장된 레코드 수
    - skipped: 중복으로 건너뛴 레코드 수
    - errors: 오류 메시지 목록
    """,
    responses={
        200: {
            "description": "데이터 수집 완료",
            "model": ApartDetailCollectionResponse
        },
        500: {
            "description": "서버 오류 또는 API 키 미설정"
        }
    }
)
async def collect_apartment_details(
    db: AsyncSession = Depends(get_db_no_auto_commit),  # 자동 커밋 비활성화 (서비스에서 직접 커밋)
    limit: Optional[int] = Query(None, description="처리할 아파트 수 제한 (None이면 전체)")
) -> ApartDetailCollectionResponse:
    """
    아파트 상세 정보 수집 - 국토부 API에서 모든 아파트의 상세 정보를 가져와서 저장
    
    이 API는 국토교통부 아파트 기본정보 API와 상세정보 API를 호출하여:
    - 모든 아파트 단지의 상세 정보를 수집
    - APART_DETAILS 테이블에 저장
    - 중복 데이터는 자동으로 건너뜀 (apt_id 기준, 1대1 관계)
    - 100개씩 처리 후 커밋하는 방식으로 진행
    
    Args:
        db: 데이터베이스 세션
        limit: 처리할 아파트 수 제한 (선택사항)
    
    Returns:
        ApartDetailCollectionResponse: 수집 결과 통계
    
    Raises:
        HTTPException: API 키가 없거나 서버 오류 발생 시
    """
    try:
        # 데이터 수집 실행
        result = await data_collection_service.collect_apartment_details(db, limit=limit)
        return result
        
    except ValueError as e:
        # API 키 미설정 등 설정 오류
        logger.error(f"❌ 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CONFIGURATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # 기타 오류
        logger.error(f"❌ 데이터 수집 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COLLECTION_ERROR",
                "message": f"데이터 수집 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.post(
    "/apartments/list",
    response_model=ApartmentCollectionResponse,
    status_code=status.HTTP_200_OK,
    tags=["📥 Data Collection (데이터 수집)"],
    summary="아파트 목록 수집",
    description="""
    국토교통부 아파트 목록 API에서 모든 아파트 데이터를 가져와서 데이터베이스에 저장합니다.
    
    **작동 방식:**
    1. 페이지네이션하여 모든 아파트 데이터 수집
    2. 법정동 코드(bjdCode)를 region_code로 매칭하여 region_id 찾기
    3. 데이터베이스에 이미 존재하는 단지코드(kapt_code)는 건너뛰고, 새로운 데이터만 저장
    4. 진행 상황을 로그로 출력
    
    **주의사항:**
    - MOLIT_API_KEY 환경변수가 설정되어 있어야 합니다
    - API 호출 제한이 있을 수 있으므로 주의해서 사용하세요
    - 이미 수집된 데이터는 중복 저장되지 않습니다 (kapt_code 기준)
    - 법정동 코드에 해당하는 지역이 없으면 해당 아파트는 저장되지 않습니다
    
    **응답:**
    - total_fetched: API에서 가져온 총 레코드 수
    - total_saved: 데이터베이스에 저장된 레코드 수
    - skipped: 중복으로 건너뛴 레코드 수
    - errors: 오류 메시지 목록
    """,
    responses={
        200: {
            "description": "데이터 수집 완료",
            "model": ApartmentCollectionResponse
        },
        500: {
            "description": "서버 오류 또는 API 키 미설정"
        }
    }
)
async def collect_apartments(
    db: AsyncSession = Depends(get_db)
) -> ApartmentCollectionResponse:
    """
    아파트 목록 수집 - 국토부 API에서 모든 아파트 데이터를 가져와서 저장
    
    이 API는 국토교통부 아파트 목록 API를 호출하여:
    - 모든 아파트 단지 정보를 수집
    - APARTMENTS 테이블에 저장
    - 중복 데이터는 자동으로 건너뜀 (kapt_code 기준)
    - 법정동 코드를 region_code로 매칭하여 region_id 설정
    
    Returns:
        ApartmentCollectionResponse: 수집 결과 통계
    
    Raises:
        HTTPException: API 키가 없거나 서버 오류 발생 시
    """
    try:
        logger.info("=" * 60)
        logger.info("🏢 아파트 목록 수집 API 호출됨")
        logger.info("=" * 60)
        
        # 데이터 수집 실행
        result = await data_collection_service.collect_all_apartments(db)
        
        if result.success:
            logger.info(f"✅ 데이터 수집 성공: {result.message}")
        else:
            logger.warning(f"⚠️ 데이터 수집 완료 (일부 오류): {result.message}")
        
        return result
        
    except ValueError as e:
        # API 키 미설정 등 설정 오류
        logger.error(f"❌ 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CONFIGURATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # 기타 오류
        logger.error(f"❌ 데이터 수집 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COLLECTION_ERROR",
                "message": f"데이터 수집 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.post(
    "/transactions/rent",
    response_model=RentCollectionResponse,
    status_code=status.HTTP_200_OK,
    tags=["📥 Data Collection (데이터 수집)"],
    summary="전월세 실거래가 전체 수집",
    description="""
    DB에 저장된 모든 지역에 대해 전월세 실거래가 데이터를 자동으로 수집합니다.
    
    **API 정보:**
    - 엔드포인트: https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent
    - 제공: 국토교통부 (공공데이터포털)
    
    **입력 파라미터 (선택사항):**
    - start_year: 수집 시작 연도 (기본값: 2023)
    - start_month: 수집 시작 월 (기본값: 1)
    - start_region_index: 시작할 지역코드 인덱스 (기본값: 0, 이어서 수집할 때 사용)
    - max_api_calls: 최대 API 호출 횟수 (기본값: 9500, 일일 제한 10000건 고려)
    
    **작동 방식:**
    1. DB의 states 테이블에서 모든 고유 지역코드(법정동코드 앞 5자리) 추출
    2. 시작 년월부터 현재까지의 모든 년월 생성
    3. start_region_index부터 시작하여 각 지역코드 × 년월 조합에 대해 API 호출
    4. max_api_calls에 도달하면 중단하고 next_region_index 반환
    5. XML 응답을 JSON으로 변환하여 rents 테이블에 저장
    
    **일일 제한 대응 방법:**
    1. 첫째 날: `{}` 또는 `{"start_region_index": 0}` 으로 호출
    2. 응답의 `next_region_index` 값 확인 (예: 27)
    3. 둘째 날: `{"start_region_index": 27}` 으로 호출
    4. `next_region_index`가 null이 될 때까지 반복
    
    **주의사항:**
    - ⚠️ 공공데이터포털 API 일일 호출 제한: 10,000건
    - 지역 데이터와 아파트 목록이 먼저 수집되어 있어야 합니다
    - 이미 존재하는 거래 데이터는 중복 저장되지 않습니다
    
    **응답:**
    - total_fetched: API에서 가져온 총 레코드 수
    - total_saved: 데이터베이스에 저장된 레코드 수
    - skipped: 중복으로 건너뛴 레코드 수
    - api_calls_used: 사용한 API 호출 횟수
    - next_region_index: 다음에 시작할 지역 인덱스 (null이면 완료)
    - errors: 오류 메시지 목록
    """,
    responses={
        200: {
            "description": "데이터 수집 완료",
            "model": RentCollectionResponse,
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "total_fetched": 50000,
                        "total_saved": 48000,
                        "skipped": 2000,
                        "errors": [],
                        "message": "일일 제한으로 중단 (다음 시작: 지역 인덱스 27): 48000건 저장",
                        "api_calls_used": 9500,
                        "next_region_index": 27,
                        "lawd_cd": "11680",
                        "deal_ymd": "202312"
                    }
                }
            }
        },
        500: {
            "description": "서버 오류 또는 API 키 미설정"
        }
    }
)
async def collect_rent_transactions(
    request: RentTransactionRequest = None,
    db: AsyncSession = Depends(get_db)
) -> RentCollectionResponse:
    """
    전월세 실거래가 전체 수집 - DB의 모든 지역에 대해 전월세 거래 데이터를 자동 수집
    
    이 API는 국토교통부 아파트 전월세 실거래가 API를 호출하여:
    - DB에 저장된 모든 지역코드에 대해 자동으로 수집
    - 지정된 시작 년월부터 현재까지의 모든 데이터 수집
    - XML 응답을 JSON으로 변환
    - RENTS 테이블에 저장
    - 중복 데이터는 자동으로 건너뜀
    
    Args:
        request: 수집 요청 파라미터 (start_year, start_month) - 선택사항
        db: 데이터베이스 세션
    
    Returns:
        RentCollectionResponse: 수집 결과 통계
    
    Raises:
        HTTPException: API 키가 없거나 서버 오류 발생 시
    """
    try:
        # 기본값 설정
        start_year = 2023
        start_month = 1
        start_region_index = 0
        max_api_calls = 9500
        
        if request:
            start_year = request.start_year
            start_month = request.start_month
            start_region_index = request.start_region_index
            max_api_calls = request.max_api_calls
        
        logger.info("=" * 60)
        logger.info("🏠 전월세 실거래가 전체 수집 API 호출됨")
        logger.info(f"   📅 수집 시작: {start_year}년 {start_month}월부터")
        logger.info(f"   📍 시작 지역 인덱스: {start_region_index}")
        logger.info(f"   ⚠️ 최대 API 호출: {max_api_calls}회")
        logger.info("=" * 60)
        
        # 전체 데이터 수집 실행
        result = await data_collection_service.collect_all_rent_transactions(
            db,
            start_year=start_year,
            start_month=start_month,
            start_region_index=start_region_index,
            max_api_calls=max_api_calls
        )
        
        if result.success:
            logger.info(f"✅ 데이터 수집 성공: {result.message}")
        else:
            logger.warning(f"⚠️ 데이터 수집 완료 (일부 오류): {result.message}")
        
        return result
        
    except ValueError as e:
        # API 키 미설정 등 설정 오류
        logger.error(f"❌ 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CONFIGURATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # 기타 오류
        logger.error(f"❌ 데이터 수집 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COLLECTION_ERROR",
                "message": f"데이터 수집 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.post(
    "/transactions/sales",
    response_model=SalesCollectionResponse,
    status_code=status.HTTP_200_OK,
    tags=["📥 Data Collection (데이터 수집)"],
    summary="아파트 매매 실거래가 수집",
    description="""
    국토교통부 아파트 매매 실거래가 API에서 데이터를 수집하여 저장합니다.
    
    **작동 방식:**
    1. 입력받은 기간(시작~종료)의 모든 월을 순회합니다.
    2. DB에 저장된 모든 시군구(5자리 지역코드)를 순회합니다.
    3. 각 지역/월별로 실거래가 API를 호출합니다.
    4. 가져온 데이터의 아파트명을 분석하여 DB의 아파트와 매칭합니다.
    5. 매칭된 거래 내역을 저장하고, 해당 아파트를 '거래 가능' 상태로 변경합니다.
    
    **주의사항:**
    - API 호출량이 많을 수 있으므로 기간을 짧게 설정하는 것이 좋습니다.
    - 이미 수집된 데이터는 중복 저장되지 않습니다 (상세 조건 비교).
    """,
    responses={
        200: {
            "description": "데이터 수집 완료",
            "model": SalesCollectionResponse
        },
        500: {
            "description": "서버 오류"
        }
    }
)
async def collect_sales_transactions(
    start_ym: str = Query(..., description="시작 연월 (YYYYMM)", min_length=6, max_length=6, examples=["202401"]),
    end_ym: str = Query(..., description="종료 연월 (YYYYMM)", min_length=6, max_length=6, examples=["202402"]),
    db: AsyncSession = Depends(get_db)
) -> SalesCollectionResponse:
    """
    아파트 매매 실거래가 수집
    
    Args:
        start_ym: 시작 연월 (YYYYMM)
        end_ym: 종료 연월 (YYYYMM)
        db: 데이터베이스 세션
        
    Returns:
        SalesCollectionResponse: 수집 결과
    """
    try:
        logger.info("=" * 60)
        logger.info(f"💰 매매 실거래가 수집 요청: {start_ym} ~ {end_ym}")
        logger.info("=" * 60)
        
        result = await data_collection_service.collect_sales_data(db, start_ym, end_ym)
        
        return result
        
    except ValueError as e:
        logger.error(f"❌ 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_PARAMETER",
                "message": str(e)
            }
        )
    except Exception as e:
        logger.error(f"❌ 수집 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COLLECTION_ERROR",
                "message": f"데이터 수집 중 오류가 발생했습니다: {str(e)}"
            }
        )