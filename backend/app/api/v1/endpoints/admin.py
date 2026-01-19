"""
관리자 API 엔드포인트

DB 조회 및 관리 기능을 제공합니다.
개발/테스트 환경에서만 사용하세요.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import List, Optional

from app.api.v1.deps import get_db
from app.models.account import Account
from app.models.rent import Rent

logger = logging.getLogger(__name__)
router = APIRouter()


def _convert_value(value):
    """값을 JSON 직렬화 가능한 형태로 변환"""
    if value is None:
        return None
    # datetime 객체를 문자열로 변환
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    # UUID 객체를 문자열로 변환
    if hasattr(value, '__str__'):
        type_str = str(type(value))
        if 'uuid' in type_str.lower() or 'UUID' in type_str:
            return str(value)
    # Decimal 객체를 float로 변환
    if hasattr(value, '__float__') and hasattr(value, '__class__'):
        if 'Decimal' in str(type(value)):
            try:
                return float(value)
            except (ValueError, TypeError):
                return str(value)
    # bytes 객체를 문자열로 변환
    if isinstance(value, bytes):
        try:
            return value.decode('utf-8')
        except:
            return str(value)
    # 기본적으로 그대로 반환
    return value


@router.get(
    "/accounts",
    status_code=status.HTTP_200_OK,
    summary="모든 계정 조회",
    description="DB에 저장된 모든 계정을 조회합니다. (개발용)"
)
async def get_all_accounts(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """
    모든 계정 조회 API
    
    - skip: 건너뛸 레코드 수
    - limit: 가져올 레코드 수 (최대 100)
    """
    result = await db.execute(
        select(Account)
        .where(Account.is_deleted == False)
        .offset(skip)
        .limit(min(limit, 100))
        .order_by(Account.created_at.desc())
    )
    accounts = result.scalars().all()
    
    # 총 개수 조회
    count_result = await db.execute(
        select(text("COUNT(*)")).select_from(Account).where(Account.is_deleted == False)
    )
    total = count_result.scalar()
    
    return {
        "success": True,
        "data": {
            "accounts": [
                {
                    "account_id": acc.account_id,
                    "clerk_user_id": acc.clerk_user_id,
                    "email": acc.email,
                    "created_at": acc.created_at.isoformat() if acc.created_at else None,
                    "updated_at": acc.updated_at.isoformat() if acc.updated_at else None,
                    "is_deleted": acc.is_deleted
                }
                for acc in accounts
            ],
            "total": total,
            "skip": skip,
            "limit": limit
        }
    }


@router.get(
    "/accounts/{account_id}",
    status_code=status.HTTP_200_OK,
    summary="특정 계정 조회",
    description="특정 계정 ID로 계정을 조회합니다."
)
async def get_account_by_id(
    account_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    특정 계정 조회 API
    """
    result = await db.execute(
        select(Account).where(Account.account_id == account_id)
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "계정을 찾을 수 없습니다."}
        )
    
    return {
        "success": True,
        "data": {
            "account_id": account.account_id,
            "clerk_user_id": account.clerk_user_id,
            "email": account.email,
            "created_at": account.created_at.isoformat() if account.created_at else None,
            "updated_at": account.updated_at.isoformat() if account.updated_at else None,
            "is_deleted": account.is_deleted
        }
    }


@router.delete(
    "/accounts/{account_id}",
    status_code=status.HTTP_200_OK,
    summary="계정 삭제",
    description="특정 계정을 삭제합니다. (소프트 삭제)"
)
async def delete_account(
    account_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    계정 삭제 API (소프트 삭제)
    """
    result = await db.execute(
        select(Account).where(Account.account_id == account_id)
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "계정을 찾을 수 없습니다."}
        )
    
    account.is_deleted = True
    await db.commit()
    
    return {
        "success": True,
        "data": {
            "message": "계정이 삭제되었습니다.",
            "account_id": account_id
        }
    }


@router.delete(
    "/accounts/{account_id}/hard",
    status_code=status.HTTP_200_OK,
    summary="계정 하드 삭제 (개발용)",
    description="""
    계정을 DB에서 완전히 삭제합니다. (하드 삭제)
    
    ⚠️ **주의**: 이 작업은 되돌릴 수 없습니다!
    - 소프트 삭제와 달리 DB에서 레코드가 완전히 제거됩니다.
    - 삭제 후 시퀀스를 자동으로 리셋합니다 (account_id가 1부터 시작하도록).
    - 개발/테스트 환경에서만 사용하세요.
    - 프로덕션 환경에서는 사용하지 마세요.
    """
)
async def hard_delete_account(
    account_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    계정 하드 삭제 API (개발용)
    
    DB에서 레코드를 완전히 삭제하고 시퀀스를 리셋합니다.
    """
    result = await db.execute(
        select(Account).where(Account.account_id == account_id)
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "계정을 찾을 수 없습니다."}
        )
    
    # 삭제 전 정보 저장 (응답용)
    deleted_info = {
        "account_id": account.account_id,
        "clerk_user_id": account.clerk_user_id,
        "email": account.email
    }
    
    # 하드 삭제 (DB에서 완전히 제거)
    await db.delete(account)
    await db.commit()
    
    # 시퀀스 리셋: account_id 시퀀스를 현재 최대값으로 설정
    # 만약 모든 계정이 삭제되었다면 1로 리셋
    try:
        # 현재 최대 account_id 조회
        max_result = await db.execute(
            text("SELECT COALESCE(MAX(account_id), 0) FROM accounts")
        )
        max_id = max_result.scalar() or 0
        
        # 시퀀스 이름 동적 조회 (PostgreSQL)
        # accounts 테이블의 account_id 컬럼에 연결된 시퀀스 찾기
        seq_result = await db.execute(
            text("""
                SELECT pg_get_serial_sequence('accounts', 'account_id')
            """)
        )
        seq_name = seq_result.scalar()
        
        if seq_name:
            # 시퀀스 이름에서 스키마 제거 (예: 'public.accounts_account_id_seq' -> 'accounts_account_id_seq')
            seq_name = seq_name.split('.')[-1] if '.' in seq_name else seq_name
            
            # 시퀀스를 최대값으로 설정 (다음 값이 max_id + 1이 되도록)
            if max_id == 0:
                # 모든 계정이 삭제된 경우 1로 리셋
                await db.execute(
                    text(f"SELECT setval('{seq_name}', 1, false)")
                )
                next_id = 1
            else:
                # 최대값으로 설정 (다음 값이 max_id + 1이 되도록)
                await db.execute(
                    text(f"SELECT setval('{seq_name}', {max_id}, false)")
                )
                next_id = max_id + 1
            await db.commit()
            sequence_reset = True
        else:
            # 시퀀스를 찾을 수 없는 경우
            sequence_reset = False
            next_id = None
    except Exception as e:
        # 시퀀스 리셋 실패해도 삭제는 성공했으므로 계속 진행
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"시퀀스 리셋 실패: {e}")
        sequence_reset = False
        next_id = None
    
    return {
        "success": True,
        "data": {
            "message": "계정이 완전히 삭제되었습니다. (하드 삭제)",
            "deleted_account": deleted_info,
            "sequence_reset": sequence_reset,
            "next_account_id": next_id,
            "warning": "이 작업은 되돌릴 수 없습니다."
        }
    }


@router.get(
    "/db/tables",
    status_code=status.HTTP_200_OK,
    summary="테이블 목록 조회",
    description="DB에 있는 모든 테이블 목록을 조회합니다."
)
async def get_tables(
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 목록 조회 API
    """
    try:
        logger.info("Fetching table list from database")
        
        # PostgreSQL의 경우 현재 데이터베이스의 public 스키마 테이블 조회
        result = await db.execute(
            text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """)
        )
        rows = result.fetchall()
        tables = [row[0] for row in rows]
        
        logger.info(f"Successfully fetched {len(tables)} tables")
        
        return {
            "success": True,
            "data": {
                "tables": tables,
                "count": len(tables)
            }
        }
    except Exception as e:
        logger.error(f"Error fetching table list: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "TABLES_FETCH_ERROR",
                "message": f"테이블 목록 조회 중 오류가 발생했습니다: {str(e)}"
            }
        )


@router.get(
    "/db/query",
    status_code=status.HTTP_200_OK,
    summary="테이블 데이터 조회",
    description="특정 테이블의 데이터를 조회합니다."
)
async def query_table(
    table_name: str = Query(..., description="조회할 테이블명"),
    limit: int = Query(1000, ge=1, le=10000, description="조회할 레코드 수 (1-10000)"),
    offset: int = Query(0, ge=0, description="건너뛸 레코드 수"),
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 데이터 조회 API
    
    주의: SQL Injection 방지를 위해 테이블명 화이트리스트 적용
    """
    # 허용된 테이블 목록 (SQL Injection 방지)
    allowed_tables = [
        "accounts", "states", "apartments", "apart_details", 
        "sales", "rents", "house_scores", "house_volumes",
        "favorite_locations", "favorite_apartments", "my_properties",
        "population_movements", "recent_searches", "recent_views"
    ]
    
    if table_name not in allowed_tables:
        logger.warning(f"Invalid table name requested: {table_name}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TABLE", "message": f"허용되지 않은 테이블입니다. 허용: {allowed_tables}"}
        )
    
    try:
        logger.info(f"Querying table: {table_name}, limit: {limit}, offset: {offset}")
        
        # 최대 limit 제한 (메모리 보호를 위해)
        max_limit = 10000
        actual_limit = min(limit, max_limit)
        
        # 테이블 데이터 조회 (페이지네이션 지원)
        # SQL Injection 방지: 테이블명은 화이트리스트로 검증되었으므로 안전
        
        # 먼저 컬럼 정보를 가져옴 (빈 결과를 대비)
        table_info_query = text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = :table_name
              AND table_schema = 'public'
            ORDER BY ordinal_position
        """)
        table_info_result = await db.execute(table_info_query, {"table_name": table_name})
        columns = [row[0] for row in table_info_result.fetchall()]
        
        if not columns:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TABLE_NOT_FOUND", "message": f"테이블 '{table_name}'을 찾을 수 없습니다."}
            )
        
        # 데이터 조회
        query = text(f"SELECT * FROM {table_name} LIMIT :limit OFFSET :offset")
        result = await db.execute(query, {"limit": actual_limit, "offset": offset})
        rows = result.fetchall()
        
        # 데이터를 딕셔너리 리스트로 변환
        data = []
        for row in rows:
            row_dict = {}
            # SQLAlchemy 2.0+ Row 객체 처리
            if hasattr(row, '_mapping'):
                # Row 객체인 경우
                for col in columns:
                    try:
                        value = row._mapping.get(col)
                        row_dict[col] = _convert_value(value)
                    except Exception as col_error:
                        logger.warning(f"Error processing column {col} in row: {str(col_error)}")
                        row_dict[col] = None
            else:
                # 튜플인 경우
                for i, col in enumerate(columns):
                    try:
                        value = row[i] if i < len(row) else None
                        row_dict[col] = _convert_value(value)
                    except Exception as col_error:
                        logger.warning(f"Error processing column {col} in row: {str(col_error)}")
                        row_dict[col] = None
            data.append(row_dict)
        
        # 총 개수 조회
        count_query = text(f"SELECT COUNT(*) FROM {table_name}")
        count_result = await db.execute(count_query)
        total = count_result.scalar()
        
        logger.info(f"Successfully queried {table_name}: {len(data)} rows returned, total: {total}")
        
        return {
            "success": True,
            "data": {
                "table_name": table_name,
                "columns": list(columns),
                "rows": data,
                "total": total,
                "limit": actual_limit,
                "offset": offset
            }
        }
    except HTTPException:
        # HTTPException은 그대로 전파
        raise
    except Exception as e:
        logger.error(f"Error querying table {table_name}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "QUERY_ERROR", 
                "message": f"테이블 조회 중 오류가 발생했습니다: {str(e)}",
                "table_name": table_name
            }
        )


@router.post(
    "/migrate/rent-type",
    status_code=status.HTTP_200_OK,
    summary="전월세 구분 데이터 마이그레이션",
    description="rents 테이블의 rent_type 컬럼을 채우는 작업을 수행합니다. (배치 처리)"
)
async def migrate_rent_type(
    batch_size: int = Query(1000, ge=100, le=10000, description="배치 크기"),
    limit: Optional[int] = Query(None, description="처리할 최대 레코드 수 (None이면 전체)"),
    db: AsyncSession = Depends(get_db)
):
    """
    전월세 구분 데이터 마이그레이션 API
    
    monthly_rent 값에 따라 rent_type을 'JEONSE' 또는 'MONTHLY_RENT'로 업데이트합니다.
    - monthly_rent가 0이거나 NULL이면 'JEONSE'
    - monthly_rent가 0보다 크면 'MONTHLY_RENT'
    """
    import time
    
    try:
        logger.info("🚀 Starting rent_type migration...")
        
        # 전체 대상 개수 조회 (rent_type이 NULL인 것만)
        count_stmt = select(text("COUNT(*)")).select_from(Rent).where(Rent.rent_type.is_(None))
        count_result = await db.execute(count_stmt)
        total_target = count_result.scalar()
        
        if total_target == 0:
            return {
                "success": True,
                "message": "마이그레이션 대상이 없습니다. 모든 데이터가 이미 처리되었습니다.",
                "total_processed": 0
            }
            
        logger.info(f"📊 Total records to process: {total_target}")
        
        processed_count = 0
        updated_count = 0
        start_time = time.time()
        
        # 실제 처리할 제한 설정
        target_limit = total_target
        if limit:
            target_limit = min(total_target, limit)
            
        # 배치 처리
        while processed_count < target_limit:
            current_batch = min(batch_size, target_limit - processed_count)
            
            # 전세 업데이트 (monthly_rent IS NULL OR monthly_rent = 0)
            jeonse_update_stmt = text(f"""
                UPDATE rents
                SET rent_type = 'JEONSE'
                WHERE trans_id IN (
                    SELECT trans_id FROM rents
                    WHERE rent_type IS NULL
                    AND (monthly_rent IS NULL OR monthly_rent = 0)
                    LIMIT {current_batch}
                )
            """)
            
            # 월세 업데이트 (monthly_rent > 0)
            monthly_update_stmt = text(f"""
                UPDATE rents
                SET rent_type = 'MONTHLY_RENT'
                WHERE trans_id IN (
                    SELECT trans_id FROM rents
                    WHERE rent_type IS NULL
                    AND monthly_rent > 0
                    LIMIT {current_batch}
                )
            """)
            
            # 실행
            result_jeonse = await db.execute(jeonse_update_stmt)
            result_monthly = await db.execute(monthly_update_stmt)
            
            await db.commit()
            
            batch_updated = result_jeonse.rowcount + result_monthly.rowcount
            updated_count += batch_updated
            processed_count += current_batch # 대략적인 진행도
            
            # 실제 업데이트된 수가 0이면 더 이상 대상이 없는 것임
            if batch_updated == 0:
                break
                
            elapsed = time.time() - start_time
            logger.info(f"🔄 Progress: {updated_count}/{target_limit} records updated ({elapsed:.1f}s)")
            
        total_time = time.time() - start_time
        logger.info(f"✅ Migration completed! Updated {updated_count} records in {total_time:.1f}s")
        
        return {
            "success": True,
            "message": "마이그레이션이 완료되었습니다.",
            "total_updated": updated_count,
            "time_elapsed": f"{total_time:.1f}s"
        }
        
    except Exception as e:
        logger.error(f"❌ Migration failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "MIGRATION_ERROR", "message": str(e)}
        )
