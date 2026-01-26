"""
데이터 수집 API 엔드포인트

국토교통부 API에서 지역 데이터를 가져와서 데이터베이스에 저장하는 API
"""
import logging
import traceback
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, and_, or_
from pydantic import BaseModel, Field

from app.api.v1.deps import get_db, get_db_no_auto_commit
from app.services.data_collection import data_collection_service
from app.schemas.state import StateCollectionResponse
from app.schemas.apartment import ApartmentCollectionResponse
from app.schemas.apart_detail import ApartDetailCollectionResponse
from app.schemas.house_score import HouseScoreCollectionResponse
from app.schemas.house_volume import HouseVolumeCollectionResponse
from app.schemas.rent import RentCollectionResponse
from app.schemas.sale import SalesCollectionResponse
from app.core.config import settings
from app.crud.house_score import house_score as house_score_crud
from app.models.state import State
from app.models.apart_detail import ApartDetail
from app.utils.google_geocoding import address_to_coordinates

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/regions",
    response_model=StateCollectionResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Data Collection (데이터 수집)"],
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
        logger.info(" 지역 데이터 수집 API 호출됨")
        logger.info("=" * 60)
        
        # 데이터 수집 실행
        result = await data_collection_service.collect_all_regions(db)
        
        if result.success:
            logger.info(f" 데이터 수집 성공: {result.message}")
        else:
            logger.warning(f" 데이터 수집 완료 (일부 오류): {result.message}")
        
        return result
        
    except ValueError as e:
        # API 키 미설정 등 설정 오류
        logger.error(f" 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CONFIGURATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # 기타 오류
        logger.error(f" 데이터 수집 실패: {e}", exc_info=True)
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
    tags=[" Data Collection (데이터 수집)"],
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
    
    **파라미터:**
    - `limit`: 처리할 아파트 수 제한 (None이면 전체)
    - `skip_existing`: 이미 상세정보가 있는 아파트 처리 방식
      - **True (건너뛰기)**: 이미 apart_details 테이블에 존재하는 아파트는 건너뛰어 API 호출 낭비 방지 ⭐ 권장
      - **False (덮어쓰기)**: 기존 데이터를 모두 덮어씀 (처음부터 새로 수집)
    
    **주의사항:**
    - MOLIT_API_KEY 환경변수가 설정되어 있어야 합니다
    - API 호출 제한이 있을 수 있으므로 주의해서 사용하세요
    - 각 아파트마다 독립적인 트랜잭션으로 처리되어 한 아파트에서 오류가 발생해도 다른 아파트에 영향을 주지 않습니다
    
    **응답:**
    - total_processed: 처리한 총 아파트 수
    - total_saved: 데이터베이스에 저장된 레코드 수
    - skipped: 건너뛴 레코드 수 (skip_existing=True일 때 이미 존재하는 레코드)
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
    limit: Optional[int] = Query(None, description="처리할 아파트 수 제한 (None이면 전체)"),
    skip_existing: bool = Query(True, description="이미 상세정보가 있는 아파트 건너뛰기 (True=건너뛰기, False=덮어쓰기)")
) -> ApartDetailCollectionResponse:
    """
    아파트 상세 정보 수집 - 국토부 API에서 모든 아파트의 상세 정보를 가져와서 저장
    
    이 API는 국토교통부 아파트 기본정보 API와 상세정보 API를 호출하여:
    - 모든 아파트 단지의 상세 정보를 수집
    - APART_DETAILS 테이블에 저장
    - skip_existing=True: 이미 존재하는 데이터는 건너뜀 (API 호출 낭비 방지)
    - skip_existing=False: 기존 데이터를 덮어씀 (처음부터 새로 수집)
    - 100개씩 처리 후 커밋하는 방식으로 진행
    
    Args:
        db: 데이터베이스 세션
        limit: 처리할 아파트 수 제한 (선택사항)
        skip_existing: 이미 상세정보가 있는 아파트 건너뛰기 여부
    
    Returns:
        ApartDetailCollectionResponse: 수집 결과 통계
    
    Raises:
        HTTPException: API 키가 없거나 서버 오류 발생 시
    """
    try:
        logger.info("=" * 60)
        logger.info(f" 아파트 상세 정보 수집 API 호출됨")
        logger.info(f"    처리 개수 제한: {limit if limit else '제한 없음'}")
        logger.info(f"    기존 데이터 처리: {'건너뛰기' if skip_existing else '덮어쓰기'}")
        logger.info("=" * 60)
        
        # 데이터 수집 실행
        result = await data_collection_service.collect_apartment_details(
            db, 
            limit=limit,
            skip_existing=skip_existing
        )
        return result
        
    except ValueError as e:
        # API 키 미설정 등 설정 오류
        logger.error(f" 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CONFIGURATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # 기타 오류
        logger.error(f" 데이터 수집 실패: {e}", exc_info=True)
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
    tags=[" Data Collection (데이터 수집)"],
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
        logger.info(" 아파트 목록 수집 API 호출됨")
        logger.info("=" * 60)
        
        # 데이터 수집 실행
        result = await data_collection_service.collect_all_apartments(db)
        
        if result.success:
            logger.info(f" 데이터 수집 성공: {result.message}")
        else:
            logger.warning(f" 데이터 수집 완료 (일부 오류): {result.message}")
        
        return result
        
    except ValueError as e:
        # API 키 미설정 등 설정 오류
        logger.error(f" 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CONFIGURATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # 기타 오류
        logger.error(f" 데이터 수집 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COLLECTION_ERROR",
                "message": f"데이터 수집 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.post(
    "/transactions/rents",
    response_model=RentCollectionResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Data Collection (데이터 수집)"],
    summary="아파트 전월세 실거래가 수집",
    description="""
    국토교통부 아파트 전월세 실거래가 API에서 데이터를 수집하여 저장합니다.
    
    **API 정보:**
    - 엔드포인트: https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent
    - 제공: 국토교통부 (공공데이터포털)
    
    **작동 방식:**
    1. 입력받은 기간(시작~종료)의 모든 월을 순회합니다.
    2. DB에 저장된 모든 시군구(5자리 지역코드)를 순회합니다.
    3. 각 지역/월별로 실거래가 API를 호출합니다 (병렬 처리, 최대 9개 동시).
    4. 가져온 데이터의 아파트명을 분석하여 DB의 아파트와 매칭합니다.
    5. 매칭된 거래 내역을 저장하고, 해당 아파트를 '거래 가능' 상태로 변경합니다.
    
    **파라미터:**
    - start_ym: 시작 연월 (YYYYMM 형식, 예: "202401")
    - end_ym: 종료 연월 (YYYYMM 형식, 예: "202412")
    - max_items: 최대 수집 개수 제한 (선택사항, 기본값: None, 제한 없음)
    - allow_duplicate: 중복 데이터 처리 방식 (선택사항, 기본값: False)
      - False: 중복 데이터 건너뛰기 (기본값)
      - True: 중복 데이터 업데이트
    
    **주의사항:**
    - API 호출량이 많을 수 있으므로 기간을 짧게 설정하는 것이 좋습니다.
    - 이미 수집된 데이터는 중복 저장되지 않습니다 (상세 조건 비교).
    - 병렬 처리로 인해 빠른 수집이 가능합니다 (최대 9개 동시 처리).
    """,
    responses={
        200: {
            "description": "데이터 수집 완료",
            "model": RentCollectionResponse
        },
        500: {
            "description": "서버 오류"
        }
    }
)
async def collect_rent_transactions(
    start_ym: str = Query(..., description="시작 연월 (YYYYMM)", min_length=6, max_length=6, examples=["202401"]),
    end_ym: str = Query(..., description="종료 연월 (YYYYMM)", min_length=6, max_length=6, examples=["202412"]),
    max_items: Optional[int] = Query(None, description="최대 수집 개수 제한 (None이면 제한 없음)", ge=1),
    allow_duplicate: bool = Query(False, description="중복 데이터 처리 (False=건너뛰기, True=업데이트)"),
    db: AsyncSession = Depends(get_db)
) -> RentCollectionResponse:
    """
    아파트 전월세 실거래가 수집
    
    Args:
        start_ym: 시작 연월 (YYYYMM)
        end_ym: 종료 연월 (YYYYMM)
        max_items: 최대 수집 개수 제한 (선택사항)
        allow_duplicate: 중복 데이터 처리 방식 (False=건너뛰기, True=업데이트)
        db: 데이터베이스 세션
        
    Returns:
        RentCollectionResponse: 수집 결과
    """
    try:
        logger.info("=" * 60)
        logger.info(f" 전월세 실거래가 수집 요청: {start_ym} ~ {end_ym}")
        logger.info(f"    최대 수집 개수: {max_items if max_items else '제한 없음'}")
        logger.info(f"    중복 처리: {'업데이트' if allow_duplicate else '건너뛰기'}")
        logger.info("=" * 60)
        
        result = await data_collection_service.collect_rent_data(
            db, 
            start_ym, 
            end_ym,
            max_items=max_items,
            allow_duplicate=allow_duplicate
        )
        
        return result
        
    except ValueError as e:
        logger.error(f" 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_PARAMETER",
                "message": str(e)
            }
        )
    except Exception as e:
        logger.error(f" 수집 실패: {e}", exc_info=True)
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
    tags=[" Data Collection (데이터 수집)"],
    summary="아파트 매매 실거래가 수집",
    description="""
    국토교통부 아파트 매매 실거래가 API에서 데이터를 수집하여 저장합니다.
    
    **API 정보:**
    - 엔드포인트: https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrad
    - 제공: 국토교통부 (공공데이터포털)
    
    **작동 방식:**
    1. 입력받은 기간(시작~종료)의 모든 월을 순회합니다.
    2. DB에 저장된 모든 시군구(5자리 지역코드)를 순회합니다.
    3. 각 지역/월별로 실거래가 API를 호출합니다 (병렬 처리, 최대 9개 동시).
    4. 가져온 데이터의 아파트명을 분석하여 DB의 아파트와 매칭합니다.
    5. 매칭된 거래 내역을 저장하고, 해당 아파트를 '거래 가능' 상태로 변경합니다.
    
    **파라미터:**
    - start_ym: 시작 연월 (YYYYMM 형식, 예: "202401")
    - end_ym: 종료 연월 (YYYYMM 형식, 예: "202412")
    - max_items: 최대 수집 개수 제한 (선택사항, 기본값: None, 제한 없음)
    - allow_duplicate: 중복 데이터 처리 방식 (선택사항, 기본값: False)
      - False: 중복 데이터 건너뛰기 (기본값)
      - True: 중복 데이터 업데이트
    
    **주의사항:**
    - API 호출량이 많을 수 있으므로 기간을 짧게 설정하는 것이 좋습니다.
    - 이미 수집된 데이터는 중복 저장되지 않습니다 (상세 조건 비교).
    - 병렬 처리로 인해 빠른 수집이 가능합니다 (최대 9개 동시 처리).
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
    end_ym: str = Query(..., description="종료 연월 (YYYYMM)", min_length=6, max_length=6, examples=["202412"]),
    max_items: Optional[int] = Query(None, description="최대 수집 개수 제한 (None이면 제한 없음)", ge=1),
    allow_duplicate: bool = Query(False, description="중복 데이터 처리 (False=건너뛰기, True=업데이트)"),
    db: AsyncSession = Depends(get_db)
) -> SalesCollectionResponse:
    """
    아파트 매매 실거래가 수집
    
    Args:
        start_ym: 시작 연월 (YYYYMM)
        end_ym: 종료 연월 (YYYYMM)
        max_items: 최대 수집 개수 제한 (선택사항)
        allow_duplicate: 중복 데이터 처리 방식 (False=건너뛰기, True=업데이트)
        db: 데이터베이스 세션
        
    Returns:
        SalesCollectionResponse: 수집 결과
    """
    try:
        logger.info("=" * 60)
        logger.info(f" 매매 실거래가 수집 요청: {start_ym} ~ {end_ym}")
        logger.info(f"    최대 수집 개수: {max_items if max_items else '제한 없음'}")
        logger.info(f"    중복 처리: {'업데이트' if allow_duplicate else '건너뛰기'}")
        logger.info("=" * 60)
        
        result = await data_collection_service.collect_sales_data(
            db, 
            start_ym, 
            end_ym,
            max_items=max_items,
            allow_duplicate=allow_duplicate
        )
        
        return result
        
    except ValueError as e:
        logger.error(f" 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_PARAMETER",
                "message": str(e)
            }
        )
    except Exception as e:
        logger.error(f" 수집 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COLLECTION_ERROR",
                "message": f"데이터 수집 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.post(
    "/house-scores",
    response_model=HouseScoreCollectionResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Data Collection (데이터 수집)"],
    summary="부동산 지수 데이터 수집",
    description="""
    한국부동산원(REB) API에서 지역별 부동산 지수 데이터를 수집하여 저장합니다.
    
    **API 정보:**
    - 제공: 한국부동산원 (REB)
    - 데이터: 지역별 부동산 가격 지수
    
    **작동 방식:**
    1. STATES 테이블에서 모든 지역(region_code)을 조회합니다.
    2. 각 지역별로 한국부동산원 API를 호출하여 부동산 지수 데이터를 가져옵니다.
    3. 가져온 데이터를 HOUSE_SCORES 테이블에 저장합니다.
    4. 이미 존재하는 지수 데이터는 건너뜁니다 (중복 방지).
    
    **주의사항:**
    - REB_API_KEY 환경변수가 설정되어 있어야 합니다.
    - API 호출 제한이 있을 수 있으므로 주의해서 사용하세요.
    - 이미 수집된 데이터는 중복 저장되지 않습니다 (지역/년월/지수유형 기준).
    - STATES 테이블에 지역 데이터가 있어야 정상적으로 동작합니다.
    
    **응답:**
    - total_fetched: API에서 가져온 총 레코드 수
    - total_saved: 데이터베이스에 저장된 레코드 수
    - skipped: 중복으로 건너뛴 레코드 수
    - errors: 오류 메시지 목록
    """,
    responses={
        200: {
            "description": "데이터 수집 완료",
            "model": HouseScoreCollectionResponse
        },
        500: {
            "description": "서버 오류 또는 API 키 미설정"
        }
    }
)
async def collect_house_scores(
    db: AsyncSession = Depends(get_db)
) -> HouseScoreCollectionResponse:
    """
    부동산 지수 데이터 수집 - 한국부동산원 API에서 지역별 부동산 지수 데이터를 가져와서 저장
    
    이 API는 한국부동산원(REB) API를 호출하여:
    - 모든 지역의 부동산 가격 지수를 수집
    - HOUSE_SCORES 테이블에 저장
    - 중복 데이터는 자동으로 건너뜀
    
    Returns:
        HouseScoreCollectionResponse: 수집 결과 통계
    
    Raises:
        HTTPException: API 키가 없거나 서버 오류 발생 시
    """
    try:
        logger.info("=" * 60)
        logger.info(" 부동산 지수 데이터 수집 API 호출됨")
        logger.info("=" * 60)
        
        # 데이터 수집 실행
        result = await data_collection_service.collect_house_scores(db)
        
        if result.success:
            logger.info(f" 데이터 수집 성공: {result.message}")
        else:
            logger.warning(f" 데이터 수집 완료 (일부 오류): {result.message}")
        
        return result
        
    except ValueError as e:
        # API 키 미설정 등 설정 오류
        logger.error(f" 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CONFIGURATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # 기타 오류
        logger.error(f" 데이터 수집 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COLLECTION_ERROR",
                "message": f"데이터 수집 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.post(
    "/house-volumes",
    response_model=HouseVolumeCollectionResponse,
    status_code=status.HTTP_200_OK,
    tags=[" Data Collection (데이터 수집)"],
    summary="부동산 거래량 데이터 수집",
    description="""
    한국부동산원(REB) API에서 지역별 부동산 거래량 데이터를 수집하여 저장합니다.
    
    **API 정보:**
    - 제공: 한국부동산원 (REB)
    - 데이터: 지역별 부동산 거래량 (동(호)수, 면적)
    
    **작동 방식:**
    1. STATES 테이블에서 모든 지역(region_code)을 조회합니다.
    2. 각 지역별로 한국부동산원 API를 호출하여 부동산 거래량 데이터를 가져옵니다.
    3. API 응답에서 같은 기준년월(WRTTIME_IDTFR_ID)의 '동(호)수'와 '면적' 데이터를 하나의 레코드로 병합합니다.
    4. 가져온 데이터를 HOUSE_VOLUMES 테이블에 저장합니다.
    5. 이미 존재하는 거래량 데이터는 건너뜁니다 (중복 방지).
    
    **데이터 병합:**
    - ITM_NM이 '동(호)수'인 경우 → volume_value에 저장
    - ITM_NM이 '면적'인 경우 → volume_area에 저장
    - 같은 기준년월에 두 데이터가 모두 있으면 하나의 레코드로 병합
    
    **주의사항:**
    - REB_API_KEY 환경변수가 설정되어 있어야 합니다.
    - API 호출 제한이 있을 수 있으므로 주의해서 사용하세요.
    - 이미 수집된 데이터는 중복 저장되지 않습니다 (지역/년월 기준).
    - STATES 테이블에 지역 데이터가 있어야 정상적으로 동작합니다.
    
    **응답:**
    - total_fetched: API에서 가져온 총 레코드 수 (raw row 개수)
    - total_saved: 데이터베이스에 저장된 레코드 수 (병합 후)
    - skipped: 중복으로 건너뛴 레코드 수
    - errors: 오류 메시지 목록
    """,
    responses={
        200: {
            "description": "데이터 수집 완료",
            "model": HouseVolumeCollectionResponse
        },
        500: {
            "description": "서버 오류 또는 API 키 미설정"
        }
    }
)
async def collect_house_volumes(
    db: AsyncSession = Depends(get_db)
) -> HouseVolumeCollectionResponse:
    """
    부동산 거래량 데이터 수집 - 한국부동산원 API에서 지역별 부동산 거래량 데이터를 가져와서 저장
    
    이 API는 한국부동산원(REB) API를 호출하여:
    - 모든 지역의 부동산 거래량을 수집
    - HOUSE_VOLUMES 테이블에 저장
    - 같은 기준년월의 '동(호)수'와 '면적' 데이터를 하나로 병합
    - 중복 데이터는 자동으로 건너뜀
    
    Returns:
        HouseVolumeCollectionResponse: 수집 결과 통계
    
    Raises:
        HTTPException: API 키가 없거나 서버 오류 발생 시
    """
    try:
        logger.info("=" * 60)
        logger.info(" 부동산 거래량 데이터 수집 API 호출됨")
        logger.info("=" * 60)
        
        # 데이터 수집 실행
        result = await data_collection_service.collect_house_volumes(db)
        
        if result.success:
            logger.info(f" 데이터 수집 성공: {result.message}")
        else:
            logger.warning(f" 데이터 수집 완료 (일부 오류): {result.message}")
        
        return result
        
    except ValueError as e:
        # API 키 미설정 등 설정 오류
        logger.error(f" 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CONFIGURATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # 기타 오류
        logger.error(f" 데이터 수집 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COLLECTION_ERROR",
                "message": f"데이터 수집 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.post(
    "/house-scores/update-change-rates",
    status_code=status.HTTP_200_OK,
    tags=[" Data Collection (데이터 수집)"],
    summary="부동산 지수 변동률 계산 및 업데이트",
    description="""
    house_scores 테이블의 모든 레코드에 대해 index_change_rate를 계산하여 업데이트합니다.
    
    **작동 방식:**
    1. house_scores 테이블의 모든 레코드를 조회합니다 (또는 특정 region_id만).
    2. 각 레코드에 대해 전월(base_ym의 이전 달) 데이터를 조회합니다.
    3. 전월 데이터가 있으면 변동률을 계산합니다.
    4. 계산식: 현재 index_value - 전월 index_value (단순 차이)
    5. 계산된 변동률을 index_change_rate에 업데이트합니다.
    
    **파라미터:**
    - region_id (선택사항): 특정 지역 ID만 업데이트. None이면 전체 레코드를 처리합니다.
    
    **응답:**
    - total_processed: 처리한 총 레코드 수
    - total_updated: 변동률이 계산되어 업데이트된 레코드 수
    - total_skipped: 전월 데이터가 없어 건너뛴 레코드 수
    - errors: 오류 메시지 목록
    """,
    responses={
        200: {
            "description": "변동률 계산 및 업데이트 완료",
            "content": {
                "application/json": {
                    "example": {
                        "total_processed": 1500,
                        "total_updated": 1200,
                        "total_skipped": 300,
                        "errors": []
                    }
                }
            }
        },
        500: {
            "description": "서버 오류"
        }
    }
)
async def update_house_score_change_rates(
    region_id: Optional[int] = Query(None, description="특정 지역 ID만 업데이트 (None이면 전체)"),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    부동산 지수 변동률 계산 및 업데이트
    
    house_scores 테이블의 모든 레코드(또는 특정 region_id)에 대해
    전월 데이터와 비교하여 index_change_rate를 계산하고 업데이트합니다.
    
    Args:
        region_id: 특정 지역 ID만 업데이트 (None이면 전체)
        db: 데이터베이스 세션
    
    Returns:
        Dict[str, Any]: 업데이트 결과 통계
    """
    try:
        logger.info(" API 엔드포인트 호출됨: update_house_score_change_rates")
        logger.info("=" * 60)
        if region_id:
            logger.info(f" 부동산 지수 변동률 계산 시작 (region_id={region_id})")
        else:
            logger.info(" 부동산 지수 변동률 계산 시작 (전체)")
        logger.info("=" * 60)
        
        result = await house_score_crud.update_change_rates(db, region_id=region_id)
        
        logger.info("=" * 60)
        logger.info(f" 변동률 계산 완료")
        logger.info(f"   - 처리: {result['total_processed']}개")
        logger.info(f"   - 업데이트: {result['total_updated']}개")
        logger.info(f"   - 건너뜀: {result['total_skipped']}개")
        logger.info(f"   - 오류: {len(result['errors'])}개")
        logger.info("=" * 60)
        
        return result
        
    except Exception as e:
        logger.error(f" 변동률 계산 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "UPDATE_ERROR",
                "message": f"변동률 계산 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.post(
    "/states/geometry",
    status_code=status.HTTP_200_OK,
    tags=[" Data Collection (데이터 수집)"],
    summary="지역(시군구/동) 주소를 좌표로 변환하여 geometry 일괄 업데이트",
    description="""
    지역(시군구/동)의 주소를 좌표로 변환하고 geometry 컬럼을 일괄 업데이트합니다.
    
    ### 기능
    1. states 테이블에서 **지역명이 있는 레코드만** 조회 (geometry가 없는 것만)
    2.  **시군구 또는 동 이름이 있는 경우만** 처리
    3. 각 레코드의 지역 정보를 사용하여 카카오 API 호출:
       - 시군구: 시군구 이름 그대로 (예: 파주시, 고양시, 용인시 처인구)
       - 동: 시군구 이름 + 동 (예: 고양시 가좌동, 파주시 야당동)
    4. 좌표를 받아서 PostGIS Point로 변환하여 geometry 컬럼 업데이트
    5. **이미 geometry가 있는 레코드는 건너뜁니다** (중복 처리 방지)
    
    ### Query Parameters
    - `limit`: 처리할 최대 레코드 수 (기본값: None, 전체 처리)
    - `batch_size`: 배치 크기 (기본값: 20)
    
    ### 응답
    - `total_processed`: 처리한 총 레코드 수 (geometry가 없는 레코드만)
    - `success_count`: 성공한 레코드 수
    - `failed_count`: 실패한 레코드 수
    - `skipped_count`: 건너뛴 레코드 수 (이미 geometry가 있는 레코드)
    """,
    responses={
        200: {
            "description": "geometry 업데이트 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "message": "Geometry 일괄 업데이트 작업 완료!",
                        "data": {
                            "total_processed": 100,
                            "success_count": 95,
                            "failed_count": 5,
                            "skipped_count": 10
                        }
                    }
                }
            }
        },
        500: {
            "description": "서버 오류"
        }
    }
)
async def update_states_geometry(
    limit: Optional[int] = Query(None, ge=1, description="처리할 최대 레코드 수 (None이면 전체)"),
    batch_size: int = Query(20, ge=1, le=100, description="배치 크기 (1~100)"),
    db: AsyncSession = Depends(get_db)
):
    """
    지역(시군구/동) 주소를 좌표로 변환하여 geometry 일괄 업데이트
    
     중요: 지역 정보가 있는 레코드만 처리합니다.
    - states 테이블의 geometry가 없는 레코드
    - 지역명(region_name)이 있는 레코드만 (빈 문자열 제외)
    - 이미 geometry가 있는 레코드는 건너뜁니다
    
    Args:
        limit: 처리할 최대 레코드 수 (None이면 전체)
        batch_size: 배치 크기 (기본값: 20)
        db: 데이터베이스 세션
    
    Returns:
        업데이트 결과 딕셔너리
    """
    try:
        logger.info(" [지역 geometry] States Geometry 일괄 업데이트 작업 시작")
        logger.info(" [지역 geometry] geometry가 비어있고 지역명이 있는 레코드 조회 중...")
        
        stmt = (
            select(State)
            .where(
                and_(
                    State.geometry.is_(None),
                    State.is_deleted == False,
                    State.region_name.isnot(None),
                    State.region_name != ""
                )
            )
        )
        
        if limit:
            stmt = stmt.limit(limit)
        
        result = await db.execute(stmt)
        records = result.scalars().all()
        
        total_processed = len(records)
        
        if total_processed == 0:
            logger.info("ℹ  [지역 geometry] 업데이트할 레코드 없음 (geometry 이미 있거나 지역명 없음)")
            return {
                "success": True,
                "message": "업데이트할 레코드가 없습니다. (geometry가 이미 설정되어 있거나 지역명이 없는 레코드는 제외됩니다)",
                "data": {
                    "total_processed": 0,
                    "success_count": 0,
                    "failed_count": 0,
                    "skipped_count": 0
                }
            }
        
        logger.info(f" [지역 geometry] 총 {total_processed}개 레코드 처리 예정 (지역명 있는 레코드만)")
        success_count = 0
        failed_count = 0
        for batch_start in range(0, total_processed, batch_size):
            batch_end = min(batch_start + batch_size, total_processed)
            batch_records = records[batch_start:batch_end]
            logger.info(f" [지역 geometry] 배치 처리 중: {batch_start + 1}~{batch_end}/{total_processed}")
            
            for idx, record in enumerate(batch_records, start=batch_start + 1):
                query_address = None
                try:
                    if record.geometry is not None:
                        logger.debug(f"[{idx}/{total_processed}] ⏭  건너뜀: region_id={record.region_id} (이미 geometry 있음)")
                        continue
                    
                    # 지역명 확인
                    if not record.region_name:
                        logger.warning(f"[{idx}/{total_processed}]  [지역 geometry] 지역명 없음: region_id={record.region_id}")
                        failed_count += 1
                        continue
                    
                    # 카카오 API 쿼리 생성
                    # region_code가 _____00000 형태면 시군구, 그렇지 않으면 동
                    is_sigungu = record.region_code.endswith("00000")
                    
                    if is_sigungu:
                        # 시군구: 시군구 이름 그대로 (예: 파주시, 고양시, 용인시 처인구)
                        query_address = record.region_name
                    else:
                        # 동: 시군구 이름 찾아서 조합
                        # region_code의 앞 5자리로 시군구 찾기
                        sigungu_code = record.region_code[:5] + "00000"
                        sigungu_stmt = select(State).where(
                            and_(
                                State.region_code == sigungu_code,
                                State.is_deleted == False
                            )
                        )
                        sigungu_result = await db.execute(sigungu_stmt)
                        sigungu = sigungu_result.scalar_one_or_none()
                        
                        if sigungu:
                            # 시군구 이름 + 동 (예: 파주시 야당동)
                            query_address = f"{sigungu.region_name} {record.region_name}"
                        else:
                            # 시군구를 찾을 수 없으면 동 이름만 사용
                            query_address = record.region_name
                    
                    logger.info(
                        f"[{idx}/{total_processed}]  [지역 geometry] Google Geocoding API 호출: "
                        f"region_id={record.region_id}, region_name='{record.region_name}', query_address='{query_address}'"
                    )
                    coordinates = await address_to_coordinates(query_address)
                    if not coordinates:
                        logger.warning(
                            f"[{idx}/{total_processed}]  [지역 geometry] Google 좌표 변환 실패: "
                            f"region_id={record.region_id}, region_name='{record.region_name}', "
                            f"region_code='{record.region_code}', query_address='{query_address}' | "
                            f"raw 원인: app.utils.google_geocoding [Google RAW] 로그 참조"
                        )
                        failed_count += 1
                        continue
                    
                    longitude, latitude = coordinates
                    
                    # PostGIS Point 생성 및 업데이트
                    update_stmt = text("""
                        UPDATE states
                        SET geometry = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE region_id = :region_id
                    """)
                    
                    await db.execute(
                        update_stmt,
                        {
                            "longitude": longitude,
                            "latitude": latitude,
                            "region_id": record.region_id
                        }
                    )
                    
                    logger.debug(f"[{idx}/{total_processed}]  성공: region_id={record.region_id}, 좌표=({longitude}, {latitude})")
                    success_count += 1
                except Exception as e:
                    tb = traceback.format_exc()
                    logger.error(
                        f"[{idx}/{total_processed}]  [지역 geometry] 레코드 처리 오류: "
                        f"region_id={record.region_id}, region_name='{record.region_name}', "
                        f"region_code='{record.region_code}', query_address='{query_address}' | "
                        f"error={type(e).__name__}: {str(e)} | raw traceback:\n{tb}",
                        exc_info=True
                    )
                    failed_count += 1
            await db.commit()
            logger.info(f" [지역 geometry] 배치 커밋 완료: {batch_start + 1}~{batch_end}/{total_processed}")
        logger.info(" [지역 geometry] States Geometry 일괄 업데이트 작업 완료!")
        logger.info(f"   [지역 geometry] 처리: {total_processed}개, 성공: {success_count}개, 실패: {failed_count}개")
        
        return {
            "success": True,
            "message": "States Geometry 일괄 업데이트 작업 완료!",
            "data": {
                "total_processed": total_processed,
                "success_count": success_count,
                "failed_count": failed_count,
                "skipped_count": 0
            }
        }
        
    except ValueError as e:
        logger.error(f" [지역 geometry] 업데이트 실패: 설정 오류 - {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"설정 오류: {str(e)}"
        )
    except Exception as e:
        tb = traceback.format_exc()
        logger.error(
            f" [지역 geometry] 업데이트 중 예상치 못한 오류: {type(e).__name__}: {str(e)} | "
            f"raw traceback:\n{tb}",
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"geometry 업데이트 중 오류가 발생했습니다: {str(e)}"
        )


@router.post(
    "/population-movements",
    status_code=status.HTTP_200_OK,
    tags=[" Data Collection (데이터 수집)"],
    summary="인구 이동 데이터 수집 (통합)",
    description="""
    KOSIS 통계청 API에서 인구 이동 매트릭스(출발지→도착지) 데이터를 가져와서 데이터베이스에 저장합니다.
    
    **API 정보:**
    - 제공: KOSIS (통계청)
    - 데이터: 지역 간 인구 이동 매트릭스 (출발지 → 도착지)
    - 기간: 분기별 데이터 (Q1, Q2, Q3, Q4)
    
    **작동 방식:**
    1. KOSIS API를 호출하여 지정된 기간의 인구 이동 매트릭스 데이터를 가져옵니다.
    2. 데이터를 파싱하여 지역 간 이동 흐름을 계산합니다.
    3. POPULATION_MOVEMENT_MATRIX 테이블에 저장합니다.
    4. 이미 존재하는 데이터는 업데이트됩니다 (중복 방지).
    5. Sankey Diagram 표시에 필요한 데이터입니다.
    
    **파라미터:**
    - start_prd_de: 시작 기간 (YYYYMM 형식, 예: "201701", 기본값: "201701")
    - end_prd_de: 종료 기간 (YYYYMM 형식, 예: "202511", 기본값: "202511")
    
    **주의사항:**
    - KOSIS_API_KEY 환경변수가 설정되어 있어야 합니다.
    - API 호출 제한이 있을 수 있으므로 주의해서 사용하세요.
    - 이미 수집된 데이터는 업데이트됩니다 (기간/출발지/도착지 기준).
    - STATES 테이블에 지역 데이터가 있어야 정상적으로 동작합니다.
    
    **응답:**
    - success: 성공 여부
    - message: 결과 메시지
    - saved_count: 신규 저장된 레코드 수
    - updated_count: 업데이트된 레코드 수
    - period: 수집 기간
    """,
    responses={
        200: {
            "description": "데이터 수집 완료",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "message": "인구 이동 매트릭스 데이터 저장 완료: 신규 500건, 업데이트 100건",
                        "saved_count": 500,
                        "updated_count": 100,
                        "period": "201701 ~ 202511"
                    }
                }
            }
        },
        500: {
            "description": "서버 오류 또는 API 키 미설정"
        }
    }
)
async def collect_population_movements(
    start_prd_de: str = Query("201701", description="시작 기간 (YYYYMM)", min_length=6, max_length=6, examples=["201701"]),
    end_prd_de: str = Query("202511", description="종료 기간 (YYYYMM)", min_length=6, max_length=6, examples=["202511"]),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    인구 이동 데이터 수집 - KOSIS 통계청 API에서 인구 이동 매트릭스 데이터를 가져와서 저장
    
    이 API는 KOSIS 통계청 API를 호출하여:
    - 지정된 기간의 지역 간 인구 이동 매트릭스 데이터를 수집
    - POPULATION_MOVEMENTS 테이블에 저장 (from_region_id, to_region_id, movement_count)
    - 이미 존재하는 데이터는 업데이트
    - Sankey Diagram 표시에 필요한 데이터입니다.
    
    Args:
        start_prd_de: 시작 기간 (YYYYMM)
        end_prd_de: 종료 기간 (YYYYMM)
        db: 데이터베이스 세션
    
    Returns:
        Dict[str, Any]: 수집 결과
    
    Raises:
        HTTPException: API 키가 없거나 서버 오류 발생 시
    """
    try:
        logger.info("=" * 60)
        logger.info(f" 인구 이동 데이터 수집 API 호출됨: {start_prd_de} ~ {end_prd_de}")
        logger.info("=" * 60)
        
        # 데이터 수집 실행 (매트릭스 데이터를 population_movements 테이블에 저장)
        result = await data_collection_service.collect_population_movements(
            db,
            start_prd_de=start_prd_de,
            end_prd_de=end_prd_de
        )
        
        logger.info("=" * 60)
        logger.info(f" 인구 이동 데이터 수집 완료")
        logger.info(f"   - 신규 저장: {result['saved_count']}건")
        logger.info(f"   - 업데이트: {result['updated_count']}건")
        logger.info(f"   - 기간: {start_prd_de} ~ {end_prd_de}")
        logger.info("=" * 60)
        
        return {
            "success": True,
            "message": f"인구 이동 데이터 저장 완료: 신규 {result['saved_count']}건, 업데이트 {result['updated_count']}건",
            "saved_count": result['saved_count'],
            "updated_count": result['updated_count'],
            "period": f"{start_prd_de} ~ {end_prd_de}"
        }
        
    except ValueError as e:
        # API 키 미설정 등 설정 오류
        logger.error(f" 설정 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CONFIGURATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # 기타 오류
        logger.error(f" 데이터 수집 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COLLECTION_ERROR",
                "message": f"데이터 수집 중 오류가 발생했습니다: {str(e)}"
            }
        )