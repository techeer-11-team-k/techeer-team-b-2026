"""
관리자 API 엔드포인트

DB 조회 및 관리 기능을 제공합니다.
개발/테스트 환경에서만 사용하세요.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import List, Optional
from pathlib import Path

from app.api.v1.deps import get_db
from app.models.account import Account

router = APIRouter()


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
    result = await db.execute(
        text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)
    )
    tables = [row[0] for row in result.fetchall()]
    
    return {
        "success": True,
        "data": {
            "tables": tables,
            "count": len(tables)
        }
    }


@router.get(
    "/db/query",
    status_code=status.HTTP_200_OK,
    summary="테이블 데이터 조회",
    description="특정 테이블의 데이터를 조회합니다."
)
async def query_table(
    table_name: str = Query(..., description="테이블명"),
    limit: int = Query(50, ge=1, le=50000, description="가져올 레코드 수 (최대 50,000)"),
    offset: int = Query(0, ge=0, description="건너뛸 레코드 수"),
    order_by: Optional[str] = Query(None, description="정렬 컬럼명 (기본값: PK)"),
    order_direction: str = Query("ASC", regex="^(ASC|DESC)$", description="정렬 방향 (ASC/DESC)"),
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 데이터 조회 API
    
    주의: SQL Injection 방지를 위해 테이블명 화이트리스트 적용
    """
    # 모든 테이블 조회 (동적 테이블 목록 가져오기)
    tables_result = await db.execute(
        text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)
    )
    allowed_tables = [row[0] for row in tables_result.fetchall()]
    
    if table_name not in allowed_tables:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TABLE", "message": f"허용되지 않은 테이블입니다."}
        )
    
    try:
        # PK 컬럼 조회 (정렬용)
        # 테이블명은 이미 화이트리스트로 검증되었으므로 안전하게 포맷팅
        # quote_ident를 사용하여 SQL Injection 방지
        pk_result = await db.execute(text(f"""
            SELECT a.attname AS column_name
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            JOIN pg_class c ON c.oid = i.indrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = :table_name
              AND i.indisprimary = true
            ORDER BY a.attnum
            LIMIT 1
        """), {"table_name": table_name})
        pk_row = pk_result.fetchone()
        default_order_by = pk_row[0] if pk_row else None
        
        # 정렬 컬럼 결정 (PK가 없으면 첫 번째 컬럼 사용)
        sort_column = order_by or default_order_by
        if not sort_column:
            # PK가 없으면 첫 번째 컬럼 조회
            first_col_result = await db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = :table_name
                ORDER BY ordinal_position
                LIMIT 1
            """), {"table_name": table_name})
            first_col_row = first_col_result.fetchone()
            sort_column = first_col_row[0] if first_col_row else None
        
        # 정렬 컬럼 검증 (화이트리스트)
        if sort_column:
            col_check_result = await db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns
                WHERE table_schema = 'public' 
                  AND table_name = :table_name
                  AND column_name = :column_name
            """), {"table_name": table_name, "column_name": sort_column})
            if not col_check_result.fetchone():
                sort_column = default_order_by or None
        
        # ORDER BY 절 생성
        order_clause = ""
        if sort_column:
            order_clause = f'ORDER BY "{sort_column}" {order_direction}'
        
        # 테이블 데이터 조회 (정렬 포함)
        query = f'SELECT * FROM "{table_name}" {order_clause} LIMIT :limit OFFSET :offset'
        result = await db.execute(text(query), {"limit": limit, "offset": offset})
        rows = result.fetchall()
        columns = result.keys()
        
        # 데이터를 딕셔너리 리스트로 변환
        data = []
        for row in rows:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # datetime 객체를 문자열로 변환
                if hasattr(value, 'isoformat'):
                    value = value.isoformat()
                row_dict[col] = value
            data.append(row_dict)
        
        # 총 개수 조회
        count_result = await db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
        total = count_result.scalar()
        
        return {
            "success": True,
            "data": {
                "table_name": table_name,
                "columns": list(columns),
                "rows": data,
                "total": total,
                "limit": limit,
                "offset": offset,
                "order_by": sort_column,
                "order_direction": order_direction,
                "pk_column": default_order_by
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "QUERY_ERROR", "message": str(e)}
        )



@router.get(
    "/database",
    response_class=HTMLResponse,
    status_code=status.HTTP_200_OK,
    summary="DB 관리 센터 웹 인터페이스",
    description="웹 기반 DB 관리 센터 HTML 페이지를 반환합니다."
)
async def database_admin_web():
    """
    DB 관리 센터 웹 인터페이스
    """
    template_path = Path(__file__).parent / "templates" / "database_admin.html"
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        return HTMLResponse(content=html_content)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "TEMPLATE_NOT_FOUND", "message": "HTML 템플릿 파일을 찾을 수 없습니다."}
        )


@router.post(
    "/db/backup",
    status_code=status.HTTP_200_OK,
    summary="테이블 백업",
    description="테이블을 CSV로 백업합니다."
)
async def backup_table(
    table_name: Optional[str] = Query(None, description="테이블명 (None이면 전체 백업)"),
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 백업 API
    """
    from app.db_admin import DatabaseAdmin
    
    admin = DatabaseAdmin()
    try:
        if table_name:
            success = await admin.backup_table(table_name)
            if success:
                return {
                    "success": True,
                    "data": {
                        "message": f"'{table_name}' 테이블 백업이 완료되었습니다."
                    }
                }
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={"code": "BACKUP_FAILED", "message": "백업에 실패했습니다."}
                )
        else:
            await admin.backup_all()
            return {
                "success": True,
                "data": {
                    "message": "전체 데이터베이스 백업이 완료되었습니다."
                }
            }
    finally:
        await admin.close()


@router.post(
    "/db/restore",
    status_code=status.HTTP_200_OK,
    summary="테이블 복원",
    description="CSV 파일에서 테이블을 복원합니다."
)
async def restore_table(
    table_name: Optional[str] = Query(None, description="테이블명 (None이면 전체 복원)"),
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 복원 API
    """
    from app.db_admin import DatabaseAdmin
    
    if not table_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "TABLE_NAME_REQUIRED", "message": "테이블명이 필요합니다."}
        )
    
    admin = DatabaseAdmin()
    try:
        success = await admin.restore_table(table_name, confirm=True)
        if success:
            return {
                "success": True,
                "data": {
                    "message": f"'{table_name}' 테이블 복원이 완료되었습니다."
                }
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "RESTORE_FAILED", "message": "복원에 실패했습니다."}
            )
    finally:
        await admin.close()


@router.get(
    "/db/table/info",
    status_code=status.HTTP_200_OK,
    summary="테이블 정보 조회",
    description="테이블의 상세 정보(컬럼, 타입, 행 수 등)를 조회합니다."
)
async def get_table_info_api(
    table_name: str = Query(..., description="테이블명"),
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 정보 조회 API
    """
    from app.db_admin import DatabaseAdmin
    
    admin = DatabaseAdmin()
    try:
        info = await admin.get_table_info(table_name)
        return {
            "success": True,
            "data": info
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INFO_ERROR", "message": str(e)}
        )
    finally:
        await admin.close()


@router.delete(
    "/db/table/truncate",
    status_code=status.HTTP_200_OK,
    summary="테이블 데이터 삭제",
    description="테이블의 모든 데이터를 삭제합니다. (테이블 구조는 유지)"
)
async def truncate_table_api(
    table_name: str = Query(..., description="테이블명"),
    confirm: bool = Query(False, description="확인 플래그 (true여야 실행)"),
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 데이터 삭제 API
    
    ⚠️ 주의: 모든 데이터가 삭제되며 되돌릴 수 없습니다!
    """
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CONFIRMATION_REQUIRED", "message": "confirm=true를 설정해야 합니다."}
        )
    
    from app.db_admin import DatabaseAdmin
    
    admin = DatabaseAdmin()
    try:
        success = await admin.truncate_table(table_name, confirm=True)
        if success:
            return {
                "success": True,
                "data": {
                    "message": f"'{table_name}' 테이블의 모든 데이터가 삭제되었습니다."
                }
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "TRUNCATE_FAILED", "message": "데이터 삭제에 실패했습니다."}
            )
    finally:
        await admin.close()


@router.delete(
    "/db/table/drop",
    status_code=status.HTTP_200_OK,
    summary="테이블 삭제",
    description="테이블을 완전히 삭제합니다. (테이블 구조와 데이터 모두 삭제)"
)
async def drop_table_api(
    table_name: str = Query(..., description="테이블명"),
    confirm: bool = Query(False, description="확인 플래그 (true여야 실행)"),
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 삭제 API
    
    ⚠️ 주의: 테이블이 완전히 삭제되며 되돌릴 수 없습니다!
    """
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CONFIRMATION_REQUIRED", "message": "confirm=true를 설정해야 합니다."}
        )
    
    from app.db_admin import DatabaseAdmin
    
    admin = DatabaseAdmin()
    try:
        success = await admin.drop_table(table_name, confirm=True)
        if success:
            return {
                "success": True,
                "data": {
                    "message": f"'{table_name}' 테이블이 삭제되었습니다."
                }
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "DROP_FAILED", "message": "테이블 삭제에 실패했습니다."}
            )
    finally:
        await admin.close()


@router.get(
    "/db/stats",
    status_code=status.HTTP_200_OK,
    summary="데이터베이스 통계",
    description="데이터베이스 전체 통계 정보를 조회합니다."
)
async def get_database_stats(
    db: AsyncSession = Depends(get_db)
):
    """
    데이터베이스 통계 정보 조회 API
    """
    try:
        # 테이블 목록 및 행 수 조회
        stats_result = await db.execute(text("""
            SELECT 
                schemaname,
                tablename,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
                pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY size_bytes DESC
        """))
        tables = []
        total_size_bytes = 0
        for row in stats_result.fetchall():
            # 각 테이블의 행 수 조회
            count_result = await db.execute(
                text(f'SELECT COUNT(*) FROM "{row[1]}"')
            )
            row_count = count_result.scalar()
            
            tables.append({
                "table_name": row[1],
                "row_count": row_count,
                "size": row[2],
                "size_bytes": row[3]
            })
            total_size_bytes += row[3] or 0
        
        # 전체 데이터베이스 크기
        db_size_result = await db.execute(text("""
            SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
                   pg_database_size(current_database()) AS size_bytes
        """))
        db_size = db_size_result.fetchone()
        
        return {
            "success": True,
            "data": {
                "database_name": "current_database",
                "total_tables": len(tables),
                "database_size": db_size[0] if db_size else "N/A",
                "database_size_bytes": db_size[1] if db_size else 0,
                "tables": tables
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "STATS_ERROR", "message": str(e)}
        )


@router.get(
    "/db/table/indexes",
    status_code=status.HTTP_200_OK,
    summary="테이블 인덱스 조회",
    description="특정 테이블의 인덱스 정보를 조회합니다."
)
async def get_table_indexes(
    table_name: str = Query(..., description="테이블명"),
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 인덱스 정보 조회 API
    """
    try:
        result = await db.execute(text("""
            SELECT
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = :table_name
            ORDER BY indexname
        """), {"table_name": table_name})
        
        indexes = [{"name": row[0], "definition": row[1]} for row in result.fetchall()]
        
        return {
            "success": True,
            "data": {
                "table_name": table_name,
                "indexes": indexes,
                "count": len(indexes)
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INDEX_ERROR", "message": str(e)}
        )


@router.get(
    "/db/table/constraints",
    status_code=status.HTTP_200_OK,
    summary="테이블 제약조건 조회",
    description="특정 테이블의 외래키, 기본키 등 제약조건 정보를 조회합니다."
)
async def get_table_constraints(
    table_name: str = Query(..., description="테이블명"),
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 제약조건 정보 조회 API
    """
    try:
        result = await db.execute(text("""
            SELECT
                con.conname AS constraint_name,
                con.contype AS constraint_type,
                CASE con.contype
                    WHEN 'p' THEN 'PRIMARY KEY'
                    WHEN 'f' THEN 'FOREIGN KEY'
                    WHEN 'u' THEN 'UNIQUE'
                    WHEN 'c' THEN 'CHECK'
                    ELSE 'OTHER'
                END AS constraint_type_name,
                pg_get_constraintdef(con.oid) AS constraint_definition
            FROM pg_constraint con
            JOIN pg_namespace nsp ON nsp.oid = con.connamespace
            JOIN pg_class rel ON rel.oid = con.conrelid
            WHERE nsp.nspname = 'public'
              AND rel.relname = :table_name
            ORDER BY con.contype, con.conname
        """), {"table_name": table_name})
        
        constraints = []
        for row in result.fetchall():
            constraints.append({
                "name": row[0],
                "type": row[1],
                "type_name": row[2],
                "definition": row[3]
            })
        
        return {
            "success": True,
            "data": {
                "table_name": table_name,
                "constraints": constraints,
                "count": len(constraints)
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "CONSTRAINT_ERROR", "message": str(e)}
        )
