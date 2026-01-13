"""
관리자 API 엔드포인트

DB 조회 및 관리 기능을 제공합니다.
개발/테스트 환경에서만 사용하세요.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import List, Optional

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
    table_name: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """
    테이블 데이터 조회 API
    
    주의: SQL Injection 방지를 위해 테이블명 화이트리스트 적용
    """
    # 허용된 테이블 목록 (SQL Injection 방지)
    allowed_tables = ["accounts", "states", "cities", "apartments", "transactions", 
                      "favorite_apartments", "favorite_locations", "my_properties", 
                      "house_prices", "recent_searches"]
    
    if table_name not in allowed_tables:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TABLE", "message": f"허용되지 않은 테이블입니다. 허용: {allowed_tables}"}
        )
    
    try:
        # 테이블 데이터 조회
        result = await db.execute(
            text(f"SELECT * FROM {table_name} LIMIT :limit"),
            {"limit": min(limit, 100)}
        )
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
        count_result = await db.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
        total = count_result.scalar()
        
        return {
            "success": True,
            "data": {
                "table_name": table_name,
                "columns": list(columns),
                "rows": data,
                "total": total,
                "limit": limit
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "QUERY_ERROR", "message": str(e)}
        )
