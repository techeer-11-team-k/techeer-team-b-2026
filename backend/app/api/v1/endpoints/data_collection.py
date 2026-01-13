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
