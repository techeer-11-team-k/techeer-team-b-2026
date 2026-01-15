"""
아파트 관련 API 엔드포인트

담당 기능:
- 아파트 상세 정보 조회 (GET /apartments/{apt_id})
- 유사 아파트 조회 (GET /apartments/{apt_id}/similar)
- 주변 아파트 평균 가격 조회 (GET /apartments/{apt_id}/nearby_price)
- 주소를 좌표로 변환하여 geometry 업데이트 (POST /apartments/geometry)
"""

import logging
import sys
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func
from geoalchemy2 import functions as geo_func

from app.api.v1.deps import get_db
from app.services.apartment import apartment_service
from app.schemas.apartment import ApartDetailBase
from app.utils.cache import (
    get_from_cache,
    set_to_cache,
    get_nearby_price_cache_key
)
from app.utils.kakao_api import address_to_coordinates
from app.models.apart_detail import ApartDetail

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Docker logs에서 볼 수 있도록 StreamHandler 추가
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = True  # 부모 로거로 전파

router = APIRouter()

@router.get(
    "/{apt_id}", 
    response_model=ApartDetailBase,
    summary="아파트 상세정보 조회", 
    description="아파트 ID로 상세정보 조회")
async def get_apart_detail(
    apt_id: int,
    db: AsyncSession = Depends(get_db)
) -> ApartDetailBase:
    """
    아파트 상세정보 조회
    
    ### Path Parameter
    - **apt_id**: 아파트 ID (양수)
    
    ### Response
    - 성공: 아파트 상세 정보 반환
    - 실패: 
      - 404: 아파트 상세 정보를 찾을 수 없음
    """
    try:
        return await apartment_service.get_apart_detail(db, apt_id=apt_id)
    except NotFoundException as e:
        logger.error(f"❌ 아파트 상세 정보를 찾을 수 없음: apt_id={apt_id}, 오류={str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "APARTMENT_DETAIL_NOT_FOUND",
                "message": f"아파트 상세 정보를 찾을 수 없습니다 (apt_id: {apt_id})"
            }
        )
    except ValueError as e:
        logger.error(f"❌ 아파트 상세 정보 변환 오류: apt_id={apt_id}, 오류={str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "DATA_CONVERSION_ERROR",
                "message": f"아파트 상세 정보 변환 중 오류가 발생했습니다: {str(e)}"
            }
        )
    except Exception as e:
        logger.error(f"❌ 아파트 상세 정보 조회 중 오류 발생: apt_id={apt_id}, 오류 타입={type(e).__name__}, 오류={str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_SERVER_ERROR",
                "message": f"아파트 상세 정보 조회 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.get(
    "/{apt_id}/similar",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🏠 Apartment (아파트)"],
    summary="유사 아파트 조회",
    description="""
    특정 아파트와 유사한 조건의 아파트를 조회합니다.
    
    ### 유사도 기준
    - 같은 지역 (시군구)
    - 비슷한 세대수 (±30% 범위)
    - 비슷한 동수 (±2동 범위)
    - 같은 시공사 (우선순위 높음)
    
    ### 요청 정보
    - `apt_id`: 기준 아파트 ID (path parameter)
    - `limit`: 반환할 최대 개수 (query parameter, 기본값: 10)
    
    ### 응답 정보
    - 유사 아파트 목록 (아파트명, 주소, 규모 정보 포함)
    """,
    responses={
        200: {
            "description": "유사 아파트 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "similar_apartments": [
                                {
                                    "apt_id": 2,
                                    "apt_name": "래미안 강남파크",
                                    "road_address": "서울특별시 강남구 테헤란로 123",
                                    "jibun_address": "서울특별시 강남구 역삼동 456",
                                    "total_household_cnt": 500,
                                    "total_building_cnt": 5,
                                    "builder_name": "삼성물산",
                                    "use_approval_date": "2015-08-06"
                                }
                            ],
                            "count": 1
                        }
                    }
                }
            }
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        }
    }
)
async def get_similar_apartments(
    apt_id: int,
    limit: int = Query(10, ge=1, le=50, description="반환할 최대 개수 (1~50)"),
    db: AsyncSession = Depends(get_db)
):
    """
    유사 아파트 조회
    
    같은 지역, 비슷한 규모를 기준으로 유사한 아파트를 찾습니다.
    """
    similar_apartments = await apartment_service.get_similar_apartments(
        db,
        apt_id=apt_id,
        limit=limit
    )
    
    return {
        "success": True,
        "data": {
            "similar_apartments": [
                apt.model_dump() for apt in similar_apartments
            ],
            "count": len(similar_apartments)
        }
    }


@router.get(
    "/{apt_id}/nearby_price",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🏠 Apartment (아파트)"],
    summary="주변 아파트 평균 가격 조회",
    description="""
    특정 아파트와 같은 지역의 주변 아파트들의 평균 거래가격을 조회합니다.
    
    ### 계산 방식
    - 같은 지역(시군구)의 주변 아파트들의 최근 N개월 거래 데이터를 기반으로 계산
    - 평당가 = 전체 거래 가격 합계 / 전체 면적 합계
    - 예상 가격 = 평당가 × 기준 아파트 전용면적
    
    ### 요청 정보
    - `apt_id`: 기준 아파트 ID (path parameter)
    - `months`: 조회 기간 (query parameter, 기본값: 6, 선택: 6 또는 12)
    
    ### 응답 정보
    - 평당가 평균 (만원/㎡)
    - 예상 가격 (만원, 평당가 × 기준 아파트 면적)
    - 거래 개수
    - 평균 가격 (거래 개수 5개 이하면 -1)
    """,
    responses={
        200: {
            "description": "주변 아파트 평균 가격 조회 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "apt_id": 1,
                            "apt_name": "래미안 강남파크",
                            "region_name": "강남구",
                            "period_months": 6,
                            "target_exclusive_area": 84.5,
                            "average_price_per_sqm": 1005.9,
                            "estimated_price": 85000,
                            "transaction_count": 150,
                            "average_price": 85000
                        }
                    }
                }
            }
        },
        404: {
            "description": "아파트를 찾을 수 없음"
        }
    }
)
async def get_nearby_price(
    apt_id: int,
    months: int = Query(6, ge=1, le=24, description="조회 기간 (개월, 기본값: 6)"),
    db: AsyncSession = Depends(get_db)
):
    """
    주변 아파트 평균 가격 조회
    
    같은 지역의 주변 아파트들의 최근 N개월 거래 데이터를 기반으로
    평당가를 계산하고, 기준 아파트의 면적을 곱하여 예상 가격을 산출합니다.
    """
    # 캐시 키 생성
    cache_key = get_nearby_price_cache_key(apt_id, months)
    
    # 1. 캐시에서 조회 시도
    cached_data = await get_from_cache(cache_key)
    if cached_data is not None:
        return {
            "success": True,
            "data": cached_data
        }
    
    # 2. 캐시 미스: 서비스 호출
    nearby_price_data = await apartment_service.get_nearby_price(
        db,
        apt_id=apt_id,
        months=months
    )
    
    # 3. 캐시에 저장 (TTL: 10분 = 600초)
    await set_to_cache(cache_key, nearby_price_data, ttl=600)
    
    return {
        "success": True,
        "data": nearby_price_data
    }


@router.post(
    "/geometry",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["🏠 Apartment (아파트)"],
    summary="전체 아파트 주소를 좌표로 변환하여 geometry 일괄 업데이트",
    description="""
    카카오 로컬 API를 사용하여 apart_details 테이블의 **전체 레코드**에 대해
    주소를 좌표로 변환하고 geometry 컬럼을 일괄 업데이트합니다.
    
    ### 작동 방식
    1. apart_details 테이블의 **모든 레코드**를 조회
    2. **이미 geometry가 있는 레코드는 건너뜁니다** (중복 처리 방지)
    3. geometry가 없는 레코드만 처리:
       - 각 레코드의 road_address 또는 jibun_address를 사용하여 카카오 API 호출
       - 좌표를 받아서 PostGIS Point로 변환하여 geometry 컬럼 업데이트
    4. 배치 단위로 커밋하여 안정적으로 처리합니다
    
    ### 요청 파라미터
    - `batch_size`: 배치 단위로 처리할 레코드 수 (기본값: 10, 최대: 100)
      * 한 번에 커밋하는 레코드 수를 지정합니다
      * 전체 레코드는 모두 처리되며, limit 파라미터는 없습니다
    
    ### 응답 정보
    - total_count: apart_details 테이블의 전체 레코드 수
    - total_processed: 처리한 총 레코드 수 (geometry가 없는 레코드만)
    - skipped_count: 건너뛴 레코드 수 (이미 geometry가 있는 레코드)
    - success_count: 성공한 레코드 수
    - failed_count: 실패한 레코드 수
    - failed_addresses: 실패한 주소 목록 (최대 20개)
    
    ### 주의사항
    - **전체 레코드를 일괄 처리**하므로 시간이 오래 걸릴 수 있습니다
    - 카카오 API 호출 제한에 주의하세요
    - 모든 작업 과정은 Docker 컨테이너 로그에 실시간으로 출력됩니다
    - `docker logs -f <container_name>` 명령어로 진행 상황을 확인할 수 있습니다
    """,
    responses={
        200: {
            "description": "geometry 업데이트 성공",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "data": {
                            "total_count": 1000,
                            "total_processed": 800,
                            "skipped_count": 200,
                            "success_count": 780,
                            "failed_count": 20,
                            "failed_addresses": [
                                "서울특별시 종로구 없는주소 123"
                            ]
                        }
                    }
                }
            }
        },
        400: {
            "description": "잘못된 요청 (API 키 미설정 등)"
        }
    }
)
async def update_geometry(
    batch_size: int = Query(10, ge=1, le=100, description="배치 단위로 처리할 레코드 수"),
    db: AsyncSession = Depends(get_db)
):
    """
    주소를 좌표로 변환하여 geometry 일괄 업데이트
    
    apart_details 테이블의 geometry가 없는 레코드에 대해
    카카오 API를 통해 좌표를 조회하고 geometry 컬럼을 일괄 업데이트합니다.
    (이미 geometry가 있는 레코드는 건너뜁니다)
    """
    try:
        logger.info("=" * 80)
        logger.info("🚀 Geometry 일괄 업데이트 작업 시작")
        logger.info(f"📋 설정: batch_size={batch_size}")
        logger.info("=" * 80)
        
        # 전체 레코드 수 확인
        logger.info("🔍 apart_details 테이블의 전체 레코드 수 확인 중...")
        count_result = await db.execute(
            select(func.count(ApartDetail.apt_detail_id))
            .where(ApartDetail.is_deleted == False)
        )
        total_count = count_result.scalar() or 0
        
        if total_count == 0:
            logger.info("ℹ️  업데이트할 레코드가 없습니다.")
            return {
                "success": True,
                "data": {
                    "total_count": 0,
                    "total_processed": 0,
                    "success_count": 0,
                    "failed_count": 0,
                    "failed_addresses": []
                }
            }
        
        logger.info(f"📊 전체 레코드 수: {total_count}개")
        logger.info("-" * 80)
        
        # 모든 레코드 조회 (geometry가 있는 것도 포함, limit 없이 전체 조회)
        logger.info("🔍 apart_details 테이블의 모든 레코드 조회 중...")
        result = await db.execute(
            select(ApartDetail)
            .where(ApartDetail.is_deleted == False)
            .order_by(ApartDetail.apt_detail_id)
        )
        records = result.scalars().all()
        
        total_processed = len(records)
        success_count = 0
        failed_count = 0
        failed_addresses = []
        
        # 기존 geometry가 있는 레코드 수 확인
        existing_geometry_count = sum(1 for r in records if r.geometry is not None)
        skipped_count = 0
        logger.info(f"📊 총 {total_processed}개 레코드 중")
        logger.info(f"   - geometry 없음 (처리 대상): {total_processed - existing_geometry_count}개")
        logger.info(f"   - geometry 있음 (건너뛰기): {existing_geometry_count}개")
        logger.info(f"   - 배치 크기: {batch_size}개 단위로 커밋")
        logger.info("-" * 80)
        
        for idx, record in enumerate(records, 1):
            try:
                # 이미 geometry가 있는 경우 건너뛰기
                if record.geometry is not None:
                    skipped_count += 1
                    logger.debug(f"[{idx}/{total_processed}] ⏭️  건너뜀: apt_detail_id={record.apt_detail_id} (이미 geometry 있음)")
                    continue
                
                # 도로명 주소 우선, 없으면 지번 주소 사용
                address = record.road_address if record.road_address else record.jibun_address
                address_type = "도로명" if record.road_address else "지번"
                
                logger.info(f"[{idx}/{total_processed}] 🔄 처리 중: apt_detail_id={record.apt_detail_id}, apt_id={record.apt_id}")
                logger.info(f"  📍 주소 [{address_type}]: {address}")
                
                if not address:
                    logger.warning(f"  ⚠️  주소가 없습니다. 건너뜁니다.")
                    failed_count += 1
                    failed_addresses.append(f"apt_detail_id={record.apt_detail_id} (주소 없음)")
                    continue
                
                # 카카오 API로 좌표 변환
                logger.info(f"  🌐 카카오 API 호출 중...")
                coordinates = await address_to_coordinates(address)
                
                if not coordinates:
                    logger.warning(f"  ❌ 주소 변환 실패: '{address}'")
                    failed_count += 1
                    failed_addresses.append(address)
                    continue
                
                longitude, latitude = coordinates
                logger.info(f"  ✅ 좌표 획득: 경도={longitude}, 위도={latitude}")
                
                # PostGIS Point 생성 및 업데이트
                logger.info(f"  💾 데이터베이스 업데이트 중...")
                await db.execute(
                    text("""
                        UPDATE apart_details 
                        SET geometry = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE apt_detail_id = :apt_detail_id
                    """),
                    {
                        "longitude": longitude,
                        "latitude": latitude,
                        "apt_detail_id": record.apt_detail_id
                    }
                )
                
                success_count += 1
                logger.info(f"  ✅ 업데이트 완료! (성공: {success_count}, 실패: {failed_count})")
                
                # 배치 단위로 커밋
                if idx % batch_size == 0:
                    await db.commit()
                    progress_pct = (idx / total_processed) * 100
                    logger.info("-" * 80)
                    logger.info(f"💾 배치 커밋 완료 [{idx}/{total_processed}] ({progress_pct:.1f}%)")
                    logger.info(f"📊 현재 통계: 성공={success_count}, 실패={failed_count}, 진행률={progress_pct:.1f}%")
                    logger.info("-" * 80)
                
            except Exception as e:
                import traceback
                import sys
                error_msg = f"  ❌ 레코드 처리 중 오류 발생!\n     apt_detail_id: {record.apt_detail_id}\n     주소: {address}\n     오류: {str(e)}"
                logger.error(error_msg)
                logger.error(f"     상세 스택:\n{traceback.format_exc()}")
                # stderr로도 출력하여 Docker logs에서 확실히 보이도록
                print(error_msg, file=sys.stderr)
                failed_count += 1
                failed_addresses.append(f"{address} (오류: {str(e)})")
                # 개별 레코드 오류는 계속 진행
                continue
        
        # 남은 변경사항 커밋
        logger.info("-" * 80)
        logger.info("💾 최종 커밋 중...")
        await db.commit()
        logger.info("✅ 커밋 완료")
        
        # 최종 통계
        # 실제 처리한 레코드 수 (건너뛴 것 제외)
        actually_processed = total_processed - skipped_count
        success_rate = (success_count / actually_processed * 100) if actually_processed > 0 else 0
        
        logger.info("=" * 80)
        logger.info("🎉 Geometry 일괄 업데이트 작업 완료!")
        logger.info(f"📊 최종 통계:")
        logger.info(f"   전체 레코드 수: {total_count}개")
        logger.info(f"   건너뛴 레코드 (이미 geometry 있음): {skipped_count}개")
        logger.info(f"   처리 대상 레코드: {actually_processed}개")
        logger.info(f"   성공: {success_count}개 ({success_rate:.1f}%)")
        logger.info(f"   실패: {failed_count}개 ({100-success_rate:.1f}%)")
        if failed_addresses:
            logger.info(f"   실패한 주소 (최대 10개):")
            for failed_addr in failed_addresses[:10]:
                logger.info(f"     - {failed_addr}")
        logger.info("=" * 80)
        
        return {
            "success": True,
            "data": {
                "total_count": total_count,
                "total_processed": actually_processed,
                "skipped_count": skipped_count,
                "success_count": success_count,
                "failed_count": failed_count,
                "failed_addresses": failed_addresses[:20]  # 최대 20개만 반환
            }
        }
        
    except ValueError as e:
        # API 키 미설정 등
        logger.error("=" * 80)
        logger.error("❌ Geometry 업데이트 실패: 설정 오류")
        logger.error(f"   오류 내용: {str(e)}")
        logger.error("=" * 80)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        import traceback
        logger.error("=" * 80)
        logger.error("❌ Geometry 업데이트 중 예상치 못한 오류 발생!")
        logger.error(f"   오류 타입: {type(e).__name__}")
        logger.error(f"   오류 내용: {str(e)}")
        logger.error(f"   상세 스택 트레이스:\n{traceback.format_exc()}")
        logger.error("=" * 80)
        await db.rollback()
        logger.warning("🔄 데이터베이스 롤백 완료")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"geometry 업데이트 중 오류가 발생했습니다: {str(e)}"
        )