"""
Fix API 엔드포인트

에러 보정용 기능: 특정 아파트의 매매/전월세 기록 초기화 후 재수집
"""
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db_no_auto_commit
from app.services.data_collection import data_collection_service
from app.models.apartment import Apartment
from app.models.state import State
from app.models.sale import Sale
from app.models.rent import Rent
from app.schemas.fix import ApartmentTransactionsFixResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _default_start_ym() -> str:
    """기본 시작 연월 (과거 2년)"""
    from datetime import datetime
    d = datetime.now()
    y = d.year - 2
    m = d.month
    return f"{y:04d}{m:02d}"


def _default_end_ym() -> str:
    """기본 종료 연월 (현재)"""
    from datetime import datetime
    d = datetime.now()
    return d.strftime("%Y%m")


@router.post(
    "/apartment-transactions",
    response_model=ApartmentTransactionsFixResponse,
    status_code=status.HTTP_200_OK,
    tags=["🔧 Fix (에러 보정)"],
    summary="아파트 매매/전월세 초기화 후 재수집",
    description="""
    **에러 fix용 API.** 특정 아파트(apt_id)의 매매·전월세 거래를 모두 삭제한 뒤,
    해당 아파트 소재 지역(시군구)만 대상으로 기간 내 데이터를 다시 수집합니다.

    **동작 순서:**
    1. `apt_id`로 아파트 존재 여부 확인
    2. 해당 아파트의 **매매(sales)** / **전월세(rents)** 전체 삭제
    3. 아파트의 `region` → 시군구 코드(5자리) 추출
    4. **매매** 실거래가 API 호출 (해당 시군구 + 기간만)
    5. **전월세** 실거래가 API 호출 (해당 시군구 + 기간만)
    6. 매칭된 거래 중 **해당 아파트만** DB에 저장

    **파라미터:**
    - **apt_id**: 대상 아파트 ID (필수)
    - **start_ym**: 수집 시작 연월 YYYYMM (선택, 기본: 2년 전)
    - **end_ym**: 수집 종료 연월 YYYYMM (선택, 기본: 현재월)

    **주의:** 국토교통부 API 호출이 발생합니다. 기간이 길수록 호출 수가 늘어납니다.
    """,
    responses={
        200: {"description": "초기화 및 재수집 완료"},
        404: {"description": "아파트 없음"},
        500: {"description": "서버 오류"},
    },
)
async def fix_apartment_transactions(
    apt_id: int = Query(..., description="대상 아파트 ID", ge=1),
    start_ym: Optional[str] = Query(
        None,
        description="수집 시작 연월 (YYYYMM)",
        min_length=6,
        max_length=6,
        examples=["202301"],
    ),
    end_ym: Optional[str] = Query(
        None,
        description="수집 종료 연월 (YYYYMM)",
        min_length=6,
        max_length=6,
        examples=["202412"],
    ),
    db: AsyncSession = Depends(get_db_no_auto_commit),
) -> ApartmentTransactionsFixResponse:
    start_ym = start_ym or _default_start_ym()
    end_ym = end_ym or _default_end_ym()

    errors: List[str] = []
    deleted_sales = 0
    deleted_rents = 0

    # 1. 아파트 존재 확인 및 region_code 추출
    stmt = (
        select(Apartment, State.region_code)
        .join(State, Apartment.region_id == State.region_id)
        .where(Apartment.apt_id == apt_id)
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APARTMENT_NOT_FOUND", "message": f"아파트 ID {apt_id}를 찾을 수 없습니다."},
        )
    apartment, region_code = row[0], row[1]
    if not region_code or len(region_code) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_REGION",
                "message": f"아파트 {apt_id}의 지역 코드(region_code)가 올바르지 않습니다.",
            },
        )
    sgg_codes = [region_code[:5]]

    # 2. 매매/전월세 삭제
    try:
        r_sales = await db.execute(delete(Sale).where(Sale.apt_id == apt_id))
        r_rents = await db.execute(delete(Rent).where(Rent.apt_id == apt_id))
        deleted_sales = r_sales.rowcount or 0
        deleted_rents = r_rents.rowcount or 0
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.exception("아파트 %s 매매/전월세 삭제 실패", apt_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "DELETE_FAILED",
                "message": f"거래 삭제 중 오류: {str(e)}",
            },
        )

    logger.info(
        "fix apartment-transactions: apt_id=%s, deleted sales=%s rents=%s, refetch %s~%s",
        apt_id,
        deleted_sales,
        deleted_rents,
        start_ym,
        end_ym,
    )

    # 3. 매매 재수집 (해당 시군구만, 해당 아파트만 저장)
    sales_resp = None
    try:
        sales_resp = await data_collection_service.collect_sales_data(
            db,
            start_ym,
            end_ym,
            sgg_codes=sgg_codes,
            apt_id_filter=apt_id,
            allow_duplicate=True,
        )
        if not sales_resp.success and sales_resp.errors:
            errors.extend([f"[매매] {e}" for e in sales_resp.errors])
    except Exception as e:
        logger.exception("매매 재수집 실패: apt_id=%s", apt_id)
        errors.append(f"[매매] 재수집 실패: {str(e)}")

    # 4. 전월세 재수집 (해당 시군구만, 해당 아파트만 저장)
    rents_resp = None
    try:
        rents_resp = await data_collection_service.collect_rent_data(
            db,
            start_ym,
            end_ym,
            sgg_codes=sgg_codes,
            apt_id_filter=apt_id,
            allow_duplicate=True,
        )
        if not rents_resp.success and rents_resp.errors:
            errors.extend([f"[전월세] {e}" for e in rents_resp.errors])
    except Exception as e:
        logger.exception("전월세 재수집 실패: apt_id=%s", apt_id)
        errors.append(f"[전월세] 재수집 실패: {str(e)}")

    success = len(errors) == 0
    message = (
        f"초기화: 매매 {deleted_sales}건, 전월세 {deleted_rents}건 삭제. "
        f"재수집: 매매 {sales_resp.total_saved if sales_resp else 0}건, 전월세 {rents_resp.total_saved if rents_resp else 0}건 저장."
    )
    if errors:
        message += " 일부 오류 있음."

    return ApartmentTransactionsFixResponse(
        success=success,
        apt_id=apt_id,
        message=message,
        deleted={"sales": deleted_sales, "rents": deleted_rents},
        sales=sales_resp,
        rents=rents_resp,
        errors=errors,
    )
