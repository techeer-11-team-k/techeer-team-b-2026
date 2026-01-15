from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Body
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func, desc, and_, or_, case, Integer, cast
from sqlalchemy.orm import joinedload
from typing import List, Optional, Any, Dict
import pathlib
import os
import csv
import io
from datetime import datetime, timedelta
from collections import Counter
import re

from app.api.v1.deps import get_db
from app.models.apartment import Apartment
from app.models.state import State
from app.models.apart_detail import ApartDetail
from app.models.sale import Sale
from app.models.rent import Rent
from app.models.house_score import HouseScore
from app.models.account import Account

router = APIRouter()

# --- 헬퍼 함수: 거래 유형별 필터링 ---
def get_transaction_filter(transaction_type: str):
    """
    거래 유형에 따른 필터 조건 반환
    
    Args:
        transaction_type: "sale"(매매), "jeonse"(전세), "wolse"(월세)
    
    Returns:
        (table, join_condition, where_condition)
        - table: Sale 또는 Rent 모델
        - join_condition: 조인 조건 (None이면 이미 조인됨)
        - where_condition: 추가 WHERE 조건
    """
    if transaction_type == "sale":
        return Sale, None, and_(
            Sale.is_canceled == False,
            (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
        )
    elif transaction_type == "jeonse":
        return Rent, None, and_(
            (Rent.monthly_rent == 0) | (Rent.monthly_rent.is_(None)),
            (Rent.is_deleted == False) | (Rent.is_deleted.is_(None))
        )
    elif transaction_type == "wolse":
        return Rent, None, and_(
            Rent.monthly_rent > 0,
            (Rent.is_deleted == False) | (Rent.is_deleted.is_(None))
        )
    else:
        # 기본값: 매매
        return Sale, None, and_(
            Sale.is_canceled == False,
            (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
        )

def get_price_field(transaction_type: str, table):
    """거래 유형에 따른 가격 필드 반환"""
    if transaction_type == "sale":
        return table.trans_price
    elif transaction_type in ["jeonse", "wolse"]:
        return table.deposit_price
    else:
        return table.trans_price

def get_date_field(transaction_type: str, table):
    """거래 유형에 따른 날짜 필드 반환"""
    if transaction_type == "sale":
        return table.contract_date
    elif transaction_type in ["jeonse", "wolse"]:
        return table.deal_date
    else:
        return table.contract_date

# --- 1. HTML 서빙 ---
@router.get("/database-web", response_class=HTMLResponse)
async def admin_dashboard_ui():
    """관리자 웹 패널 UI를 반환합니다."""
    current_dir = pathlib.Path(__file__).parent.resolve()
    root_dir = current_dir.parent.parent.parent
    template_path = root_dir / "templates" / "admin_panel.html"
    
    if not template_path.exists():
        return HTMLResponse(content=f"<h1>Error: Template not found at {template_path}</h1>", status_code=500)
        
    return HTMLResponse(content=template_path.read_text(encoding="utf-8"))

@router.get("/templates/{template_name}.html", response_class=HTMLResponse)
async def get_template(template_name: str):
    """탭별 템플릿 파일을 반환합니다."""
    current_dir = pathlib.Path(__file__).parent.resolve()
    root_dir = current_dir.parent.parent.parent
    template_path = root_dir / "templates" / f"{template_name}.html"
    
    if not template_path.exists():
        return HTMLResponse(content=f"<div class='alert alert-danger'>템플릿을 찾을 수 없습니다: {template_name}</div>", status_code=404)
        
    return HTMLResponse(content=template_path.read_text(encoding="utf-8"))

# --- 2. 핵심 차트 데이터 API ---
@router.get("/stats/charts")
async def get_chart_data(
    type: str, 
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세), wolse(월세)"),
    db: AsyncSession = Depends(get_db)
):
    """
    핵심 차트 데이터 제공 (Line, Bar, Ranking)
    transaction_type: sale(매매), jeonse(전세), wolse(월세)
    """
    try:
        data = {}
        
        # 1. 월별 거래 추이 (Line + Bar) - 실제 DB 집계 (매매/전세/월세 구분)
        if type == "monthly_trend":
            # 최근 12개월 기준 설정
            today = datetime.now().date()
            start_date = today - timedelta(days=365)
            
            # 거래 유형에 따른 테이블 및 필터 선택
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            date_field = get_date_field(transaction_type, trans_table)
            price_field = get_price_field(transaction_type, trans_table)
            
            # ID 필드 선택
            if transaction_type == "sale":
                id_field = trans_table.trans_id
            else:
                id_field = trans_table.trans_id
            
            month_expr = func.to_char(date_field, 'YYYY-MM')
            
            # 월별 그룹화 쿼리
            stmt = (
                select(
                    month_expr.label("month"),
                    func.count(id_field).label("count"),
                    func.avg(price_field).label("avg_price")
                )
                .join(Apartment, trans_table.apt_id == Apartment.apt_id)
                .join(State, Apartment.region_id == State.region_id)
                .where(
                    and_(
                        date_field >= start_date,
                        date_field.isnot(None),
                        base_filter
                    )
                )
                .group_by(month_expr)
                .order_by(month_expr)
            )
            
            result = await db.execute(stmt)
            rows = result.all()
            
            # DB 결과를 딕셔너리로 변환
            db_data = {row.month: {"count": row.count, "price": int(row.avg_price or 0)} for row in rows}
            
            # 최근 12개월 라벨 생성 및 데이터 채우기 (데이터 없는 달은 0)
            months = []
            volumes = []
            prices = []
            
            # 시작일을 해당 월의 1일로 설정
            curr = start_date.replace(day=1)
            end_date = today.replace(day=1)
            
            while curr <= end_date:
                ym = curr.strftime("%Y-%m")
                months.append(ym)
                
                if ym in db_data:
                    volumes.append(db_data[ym]["count"])
                    avg_price = db_data[ym]["price"] or 0
                    # avg_price는 만원 단위이므로 그대로 사용 (억원으로 표시하려면 /10000)
                    prices.append(int(avg_price / 10000))  # 억원 단위로 변환
                else:
                    volumes.append(0)
                    prices.append(0)
                
                # 다음 달로 이동
                if curr.month == 12:
                    curr = curr.replace(year=curr.year + 1, month=1, day=1)
                else:
                    curr = curr.replace(month=curr.month + 1, day=1)
            
            # 최근 12개월만 보여주기
            if len(months) > 12:
                months = months[-12:]
                volumes = volumes[-12:]
                prices = prices[-12:]
            
            data = {
                "categories": months,
                "volume": volumes,
                "price": prices
            }
            
        # 2. 지역별 거래량 비교 (Bar) - 실제 DB 데이터 (매매/전세/월세 구분)
        elif type == "region_volume":
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            
            if transaction_type == "sale":
                id_field = trans_table.trans_id
            else:
                id_field = trans_table.trans_id
            
            stmt = (
                select(
                    State.city_name,
                    func.count(id_field).label("count")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .outerjoin(trans_table, and_(
                    trans_table.apt_id == Apartment.apt_id,
                    base_filter
                ))
                .where((Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)))
                .group_by(State.city_name)
                .order_by(desc("count"))
                .limit(10)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = {
                    "categories": [row.city_name or "미상" for row in rows if row.count and row.count > 0],
                    "values": [row.count or 0 for row in rows if row.count and row.count > 0]
                }
            else:
                data = {
                    "categories": [],
                    "values": []
                }
            
        # 3. 가격대별 분포 (Pie) - 실제 DB 데이터
        elif type == "price_range":
            stmt = (
                select(
                    case(
                        (Sale.trans_price < 30000, "3억 미만"),
                        (and_(Sale.trans_price >= 30000, Sale.trans_price < 60000), "3억~6억"),
                        (and_(Sale.trans_price >= 60000, Sale.trans_price < 90000), "6억~9억"),
                        (and_(Sale.trans_price >= 90000, Sale.trans_price < 150000), "9억~15억"),
                        else_="15억 초과"
                    ).label("price_range"),
                    func.count(Sale.trans_id).label("count")
                )
                .where(
                    and_(
                        Sale.trans_price.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by("price_range")
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            if rows:
                data = [{"name": row.price_range, "value": row.count} for row in rows]
            else:
                # 데이터가 없을 경우 기본값
                data = [
                    {"name": "3억 미만", "value": 0},
                    {"name": "3억~6억", "value": 0},
                    {"name": "6억~9억", "value": 0},
                    {"name": "9억~15억", "value": 0},
                    {"name": "15억 초과", "value": 0}
                ]

        return {"success": True, "data": data}
        
    except Exception as e:
        return {"success": False, "message": str(e)}

# --- 3. 부동산 데이터 관리 (검색 & 상세) ---
@router.get("/realestate/search")
async def search_realestate(q: str, db: AsyncSession = Depends(get_db)):
    """부동산 관리자용 검색 API"""
    if not q: return {"data": []}
    stmt = (
        select(Apartment, State, func.count(Sale.trans_id).label("sale_count"))
        .join(State)
        .outerjoin(Sale, Sale.apt_id == Apartment.apt_id)
        .where((Apartment.apt_name.ilike(f"%{q}%")) | (State.region_name.ilike(f"%{q}%")))
        .group_by(Apartment.apt_id, State.region_id)
        .limit(50)
    )
    result = await db.execute(stmt)
    rows = result.all()
    data = []
    for row in rows:
        apt, state, sale_cnt = row
        has_detail_res = await db.execute(select(1).where(ApartDetail.apt_id == apt.apt_id).limit(1))
        data.append({
            "apt_id": apt.apt_id, "apt_name": apt.apt_name, "kapt_code": apt.kapt_code,
            "region_name": state.region_name, "city_name": state.city_name,
            "sale_count": sale_cnt, "has_detail": has_detail_res.scalar() is not None
        })
    return {"data": data}

@router.get("/realestate/apt/{apt_id}")
async def get_realestate_detail(apt_id: int, db: AsyncSession = Depends(get_db)):
    """부동산 관리자용 상세 조회 API"""
    stmt = select(Apartment, State).join(State).where(Apartment.apt_id == apt_id)
    res = await db.execute(stmt)
    row = res.first()
    if not row: raise HTTPException(404, "Apartment not found")
    apt, state = row
    
    detail_res = await db.execute(select(ApartDetail).where(ApartDetail.apt_id == apt_id))
    detail = detail_res.scalar_one_or_none()
    
    sales_res = await db.execute(select(Sale).where(Sale.apt_id == apt_id).order_by(Sale.contract_date.desc()).limit(100))
    sales_list = []
    for s in sales_res.scalars().all():
        sales_list.append({
            "trans_id": s.trans_id,
            "contract_date": str(s.contract_date),
            "trans_price": s.trans_price,
            "exclusive_area": float(s.exclusive_area),
            "floor": s.floor,
            "remarks": s.remarks
        })
        
    rents_res = await db.execute(select(Rent).where(Rent.apt_id == apt_id).order_by(Rent.deal_date.desc()).limit(100))
    rents_list = []
    for r in rents_res.scalars().all():
        rents_list.append({
            "trans_id": r.trans_id,
            "deal_date": str(r.deal_date) if r.deal_date else None,
            "contract_date": str(r.contract_date) if r.contract_date else None,
            "deposit_price": r.deposit_price,
            "monthly_rent": r.monthly_rent,
            "exclusive_area": float(r.exclusive_area) if r.exclusive_area else None,
            "floor": r.floor,
            "contract_type": "신규" if r.contract_type else "갱신" if r.contract_type is not None else None
        })
    
    return {
        "success": True,
        "data": {
            "basic": {"apt_id": apt.apt_id, "apt_name": apt.apt_name, "kapt_code": apt.kapt_code},
            "region": {"region_name": state.region_name, "city_name": state.city_name},
            "detail": {
                "road_address": detail.road_address if detail else None,
                "jibun_address": detail.jibun_address if detail else None,
                "total_household_cnt": detail.total_household_cnt if detail else None,
                "total_building_cnt": detail.total_building_cnt if detail else None,
                "use_approval_date": str(detail.use_approval_date) if detail and detail.use_approval_date else None,
                "builder_name": detail.builder_name if detail else None,
                "developer_name": detail.developer_name if detail else None,
                "highest_floor": detail.highest_floor if detail else None,
                "total_parking_cnt": detail.total_parking_cnt if detail else None,
                "code_heat_nm": detail.code_heat_nm if detail else None,
                "code_sale_nm": detail.code_sale_nm if detail else None
            } if detail else None,
            "sales": sales_list,
            "rents": rents_list
        }
    }

# --- 4. 랭킹 API ---
@router.get("/stats/ranking")
async def get_rankings(
    type: str = "price",
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세), wolse(월세)"),
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
):
    try:
        data = []
        trans_table, _, base_filter = get_transaction_filter(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        date_field = get_date_field(transaction_type, trans_table)
        
        if transaction_type == "sale":
            id_field = trans_table.trans_id
            area_field = trans_table.exclusive_area
        else:
            id_field = trans_table.trans_id
            area_field = trans_table.exclusive_area
        
        if type == "price":
            stmt = (
                select(trans_table, Apartment, State)
                .join(Apartment, trans_table.apt_id == Apartment.apt_id)
                .join(State, Apartment.region_id == State.region_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        base_filter,
                        (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
                    )
                )
                .order_by(desc(price_field))
                .limit(limit)
            )
            result = await db.execute(stmt)
            for trans, apt, state in result:
                # 가격 필드 접근
                if transaction_type == "sale":
                    price = trans.trans_price or 0
                    trans_date = trans.contract_date
                    trans_area = trans.exclusive_area
                else:
                    price = trans.deposit_price or 0
                    trans_date = trans.deal_date
                    trans_area = trans.exclusive_area
                
                # price는 만원 단위
                if price > 0:
                    if price >= 10000:
                        price_str = f"{price / 10000:.1f}억원"
                    else:
                        price_str = f"{int(price):,}만원"
                else:
                    price_str = "-"
                
                data.append({
                    "rank_val": price_str,
                    "apt_name": apt.apt_name or "-",
                    "region": state.region_name or "-",
                    "date": str(trans_date) if trans_date else "-",
                    "area": f"{trans_area}㎡" if trans_area else "-"
                })
        elif type == "volume":
            stmt = (
                select(Apartment.apt_name, State.region_name, func.count(id_field).label("count"))
                .join(State, Apartment.region_id == State.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        base_filter,
                        (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
                    )
                )
                .group_by(Apartment.apt_id, State.region_id, Apartment.apt_name, State.region_name)
                .order_by(desc("count"))
                .limit(limit)
            )
            result = await db.execute(stmt)
            for row in result:
                data.append({
                    "rank_val": f"{row.count}건",
                    "apt_name": row.apt_name or "-",
                    "region": row.region_name or "-",
                    "date": "-",
                    "area": "-"
                })
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "message": str(e)}

# --- 5. 시스템 로그 ---
@router.get("/logs")
async def get_system_logs(lines: int = 100):
    log_file_path = pathlib.Path("backend.log")
    if not log_file_path.exists():
        log_file_path = pathlib.Path("../backend.log")
    
    if not log_file_path.exists():
        return {"success": False, "message": f"Log file not found."}
    
    try:
        with open(log_file_path, "r", encoding="utf-8") as f:
            content = f.readlines()
            return {"success": True, "logs": content[-lines:]}
    except Exception as e:
        return {"success": False, "message": str(e)}

# --- 6. DB CRUD ---
@router.post("/db/row")
async def create_table_row(table_name: str = Body(...), data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db)):
    """테이블에 새 행 추가"""
    allowed_tables = [
        "accounts", "states", "apartments", "apart_details", 
        "sales", "rents", "house_scores", 
        "favorite_locations", "favorite_apartments", "my_properties"
    ]
    if table_name not in allowed_tables:
        return {"success": False, "message": "Invalid table name"}
    
    try:
        columns = list(data.keys())
        values = list(data.values())
        placeholders = ', '.join([f':{i}' for i in range(len(columns))])
        columns_str = ', '.join(columns)
        
        stmt = text(f"INSERT INTO {table_name} ({columns_str}) VALUES ({placeholders})")
        params = {str(i): val for i, val in enumerate(values)}
        await db.execute(stmt, params)
        await db.commit()
        return {"success": True, "message": "Row created successfully"}
    except Exception as e:
        await db.rollback()
        return {"success": False, "message": str(e)}

@router.put("/db/row")
async def update_table_row(table_name: str = Body(...), pk_field: str = Body(...), pk_value: Any = Body(...), field: str = Body(...), value: Any = Body(...), db: AsyncSession = Depends(get_db)):
    try:
        stmt = text(f"UPDATE {table_name} SET {field} = :value WHERE {pk_field} = :pk_value")
        await db.execute(stmt, {"value": value, "pk_value": pk_value})
        await db.commit()
        return {"success": True, "message": "Updated successfully"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.delete("/db/row")
async def delete_table_row(table_name: str, pk_field: str, pk_value: Any, db: AsyncSession = Depends(get_db)):
    try:
        stmt = text(f"DELETE FROM {table_name} WHERE {pk_field} = :pk_value")
        await db.execute(stmt, {"pk_value": pk_value})
        await db.commit()
        return {"success": True, "message": "Deleted successfully"}
    except Exception as e:
        return {"success": False, "message": str(e)}

# --- 7. CSV 백업/복원 ---
@router.get("/db/export-csv")
async def export_table_csv(table_name: str, db: AsyncSession = Depends(get_db)):
    """테이블 데이터를 CSV로 내보내기"""
    allowed_tables = [
        "accounts", "states", "apartments", "apart_details", 
        "sales", "rents", "house_scores", 
        "favorite_locations", "favorite_apartments", "my_properties"
    ]
    if table_name not in allowed_tables:
        raise HTTPException(400, "Invalid table name")
    
    try:
        result = await db.execute(text(f"SELECT * FROM {table_name}"))
        rows = result.fetchall()
        columns = result.keys()
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(columns)
        for row in rows:
            writer.writerow([str(v) if v is not None else '' for v in row])
        
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={table_name}_{datetime.now().strftime('%Y%m%d')}.csv"}
        )
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/db/import-csv")
async def import_table_csv(table_name: str = Body(...), data: List[Dict[str, Any]] = Body(...), db: AsyncSession = Depends(get_db)):
    """CSV 데이터를 테이블로 가져오기"""
    allowed_tables = [
        "accounts", "states", "apartments", "apart_details", 
        "sales", "rents", "house_scores", 
        "favorite_locations", "favorite_apartments", "my_properties"
    ]
    if table_name not in allowed_tables:
        return {"success": False, "message": "Invalid table name"}
    
    if not data:
        return {"success": False, "message": "No data provided"}
    
    try:
        columns = list(data[0].keys())
        values_list = []
        for row in data:
            values = [row.get(col) for col in columns]
            values_list.append(values)
        
        placeholders = ', '.join([f':{i}' for i in range(len(columns))])
        columns_str = ', '.join(columns)
        
        for values in values_list:
            stmt = text(f"INSERT INTO {table_name} ({columns_str}) VALUES ({placeholders})")
            params = {str(i): val for i, val in enumerate(values)}
            await db.execute(stmt, params)
        
        await db.commit()
        return {"success": True, "message": f"Imported {len(data)} rows"}
    except Exception as e:
        await db.rollback()
        return {"success": False, "message": str(e)}

# --- 8. 고급 검색/필터링 ---
@router.get("/db/query-advanced")
async def query_table_advanced(
    table_name: str,
    search: Optional[str] = None,
    filters: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """고급 검색 및 필터링"""
    allowed_tables = [
        "accounts", "states", "apartments", "apart_details", 
        "sales", "rents", "house_scores", 
        "favorite_locations", "favorite_apartments", "my_properties"
    ]
    if table_name not in allowed_tables:
        raise HTTPException(400, "Invalid table name")
    
    try:
        # 기본 쿼리
        base_query = f"SELECT * FROM {table_name} WHERE 1=1"
        params = {}
        
        # 검색 조건 추가
        if search:
            # 모든 컬럼에서 검색 (간단한 구현)
            base_query += f" AND (CAST(* AS TEXT) ILIKE :search)"
            params['search'] = f"%{search}%"
        
        # 정렬
        if sort_by:
            order = "DESC" if sort_order.lower() == "desc" else "ASC"
            base_query += f" ORDER BY {sort_by} {order}"
        
        # 페이징
        base_query += " LIMIT :limit OFFSET :offset"
        params['limit'] = limit
        params['offset'] = offset
        
        result = await db.execute(text(base_query), params)
        rows = result.fetchall()
        columns = result.keys()
        
        # 총 개수 조회
        count_query = f"SELECT COUNT(*) FROM {table_name}"
        if search:
            count_query += f" WHERE CAST(* AS TEXT) ILIKE :search"
        count_result = await db.execute(text(count_query), {"search": f"%{search}%"} if search else {})
        total = count_result.scalar()
        
        data = []
        for row in rows:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                if hasattr(value, 'isoformat'):
                    value = value.isoformat()
                row_dict[col] = value
            data.append(row_dict)
        
        return {
            "success": True,
            "data": {
                "rows": data,
                "columns": list(columns),
                "total": total,
                "limit": limit,
                "offset": offset
            }
        }
    except Exception as e:
        return {"success": False, "message": str(e)}

# --- 9. 시각화 데이터 API ---
@router.get("/visualization/data")
async def get_visualization_data(
    type: str,
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세), wolse(월세)"),
    db: AsyncSession = Depends(get_db)
):
    """시각화용 데이터 제공 (매매/전세/월세 구분)"""
    try:
        if type == "region_transaction_volume":
            # 지역별 거래량 (매매/전세/월세 구분)
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            
            if transaction_type == "sale":
                id_field = trans_table.trans_id
            else:
                id_field = trans_table.trans_id
            
            stmt = (
                select(State.region_name, func.count(id_field).label("count"))
                .join(Apartment, State.region_id == Apartment.region_id)
                .outerjoin(trans_table, and_(
                    trans_table.apt_id == Apartment.apt_id,
                    base_filter
                ))
                .where(
                    (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
                )
                .group_by(State.region_name)
                .order_by(desc("count"))
                .limit(10)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = [{"name": row.region_name or "미상", "value": row.count or 0} for row in rows if row.count and row.count > 0]
            else:
                data = []
            
        elif type == "price_distribution":
            # 가격대별 분포 (trans_price는 만원 단위이므로 30000 = 3억)
            stmt = (
                select(
                    case(
                        (Sale.trans_price < 30000, "3억 미만"),
                        (and_(Sale.trans_price >= 30000, Sale.trans_price < 60000), "3억~6억"),
                        (and_(Sale.trans_price >= 60000, Sale.trans_price < 90000), "6억~9억"),
                        (and_(Sale.trans_price >= 90000, Sale.trans_price < 150000), "9억~15억"),
                        else_="15억 초과"
                    ).label("price_range"),
                    func.count(Sale.trans_id).label("count")
                )
                .where(
                    and_(
                        Sale.trans_price.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by("price_range")
            )
            result = await db.execute(stmt)
            rows = result.all()
            data = [{"name": row.price_range or "미상", "value": row.count or 0} for row in rows]
            
        elif type == "floor_preference":
            # 층수 선호도
            stmt = (
                select(
                    case(
                        (Sale.floor <= 5, "1-5층"),
                        (and_(Sale.floor > 5, Sale.floor <= 10), "6-10층"),
                        (and_(Sale.floor > 10, Sale.floor <= 20), "11-20층"),
                        (and_(Sale.floor > 20, Sale.floor <= 30), "21-30층"),
                        else_="31층 이상"
                    ).label("floor_range"),
                    func.count(Sale.trans_id).label("count")
                )
                .where(
                    and_(
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by("floor_range")
            )
            result = await db.execute(stmt)
            rows = result.all()
            data = [{"name": row.floor_range or "미상", "value": row.count or 0} for row in rows]
            
        elif type == "area_distribution":
            # 면적별 분포
            stmt = (
                select(
                    case(
                        (Sale.exclusive_area < 60, "60㎡ 미만"),
                        (and_(Sale.exclusive_area >= 60, Sale.exclusive_area < 85), "60-85㎡"),
                        (and_(Sale.exclusive_area >= 85, Sale.exclusive_area < 100), "85-100㎡"),
                        (and_(Sale.exclusive_area >= 100, Sale.exclusive_area < 130), "100-130㎡"),
                        else_="130㎡ 이상"
                    ).label("area_range"),
                    func.count(Sale.trans_id).label("count")
                )
                .where(
                    and_(
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by("area_range")
            )
            result = await db.execute(stmt)
            rows = result.all()
            data = [{"name": row.area_range or "미상", "value": row.count or 0} for row in rows]
            
        elif type == "yearly_trend":
            # 연도별 거래 추이
            stmt = (
                select(
                    func.extract('year', Sale.contract_date).label("year"),
                    func.count(Sale.trans_id).label("count"),
                    func.avg(Sale.trans_price).label("avg_price")
                )
                .where(
                    and_(
                        Sale.contract_date.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by("year")
                .order_by("year")
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = {
                    "years": [str(int(row.year)) for row in rows if row.year],
                    "counts": [row.count or 0 for row in rows if row.year],
                    "prices": [int(row.avg_price or 0) for row in rows if row.year]
                }
            else:
                data = {
                    "years": [],
                    "counts": [],
                    "prices": []
                }
            
        elif type == "top_builders":
            # 건설사별 아파트 수
            stmt = (
                select(
                    ApartDetail.builder_name,
                    func.count(Apartment.apt_id).label("count")
                )
                .join(Apartment, ApartDetail.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        ApartDetail.builder_name.isnot(None),
                        ApartDetail.builder_name != "",
                        (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
                    )
                )
                .group_by(ApartDetail.builder_name)
                .order_by(desc("count"))
                .limit(10)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = [{"name": row.builder_name or "미상", "value": row.count or 0} for row in rows if row.count and row.count > 0]
            else:
                data = []
            
        elif type == "price_volume_trend":
            # 평당가 및 거래량 시간별 변화 추이 (매매/전세/월세 구분)
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            date_field = get_date_field(transaction_type, trans_table)
            price_field = get_price_field(transaction_type, trans_table)
            
            if transaction_type == "sale":
                id_field = trans_table.trans_id
                area_field = trans_table.exclusive_area
            else:
                id_field = trans_table.trans_id
                area_field = trans_table.exclusive_area
            
            month_expr = func.to_char(date_field, 'YYYY-MM')
            stmt = (
                select(
                    month_expr.label("month"),
                    func.count(id_field).label("count"),
                    func.avg(cast(price_field, Integer) / cast(area_field, Integer)).label("avg_price_per_area")
                )
                .join(Apartment, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        date_field.isnot(None),
                        area_field > 0,
                        price_field.isnot(None),
                        base_filter
                    )
                )
                .group_by(month_expr)
                .order_by(month_expr)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = {
                    "categories": [row.month for row in rows if row.month],
                    "volumes": [row.count or 0 for row in rows if row.month],
                    "prices_per_area": [int((row.avg_price_per_area or 0) / 10000) for row in rows if row.month]  # 억원/㎡ 단위
                }
            else:
                data = {
                    "categories": [],
                    "volumes": [],
                    "prices_per_area": []
                }
            
        elif type == "apt_name_words":
            # 아파트명에 가장 많이 들어가는 단어
            stmt = select(Apartment.apt_name).where((Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)))
            result = await db.execute(stmt)
            rows = result.all()
            
            words = []
            for row in rows:
                if row.apt_name:
                    # 한글 단어 추출 (2글자 이상)
                    korean_words = re.findall(r'[가-힣]{2,}', row.apt_name)
                    words.extend(korean_words)
            
            if words:
                word_counts = Counter(words).most_common(10)
                data = [{"name": word, "value": count} for word, count in word_counts]
            else:
                data = []
            
        elif type == "region_name_length":
            # 지역명 길이 분포
            stmt = select(State.region_name).where((State.is_deleted == False) | (State.is_deleted.is_(None)))
            result = await db.execute(stmt)
            rows = result.all()
            
            length_counts = {}
            for row in rows:
                if row.region_name:
                    length = len(row.region_name)
                    length_key = f"{length}자"
                    length_counts[length_key] = length_counts.get(length_key, 0) + 1
            
            if length_counts:
                data = [{"name": k, "value": v} for k, v in sorted(length_counts.items())]
            else:
                data = []
            
        elif type == "price_digits":
            # 거래가의 자릿수 분포
            stmt = (
                select(Sale.trans_price)
                .where(
                    and_(
                        Sale.trans_price.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            digit_counts = {}
            for row in rows:
                if row.trans_price:
                    digits = len(str(int(row.trans_price)))
                    digit_key = f"{digits}자리"
                    digit_counts[digit_key] = digit_counts.get(digit_key, 0) + 1
            
            if digit_counts:
                data = [{"name": k, "value": v} for k, v in sorted(digit_counts.items())]
            else:
                data = []
            
        elif type == "floor_price_correlation":
            # 층수와 거래가의 관계
            stmt = (
                select(Sale.floor, Sale.trans_price)
                .where(
                    and_(
                        Sale.trans_price.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .limit(1000)
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            # 층수별 평균 가격 계산
            floor_groups = {}
            for row in rows:
                if row.floor is not None and row.trans_price:
                    floor_range = f"{(row.floor // 5) * 5}-{(row.floor // 5) * 5 + 4}층"
                    if floor_range not in floor_groups:
                        floor_groups[floor_range] = []
                    floor_groups[floor_range].append((row.trans_price or 0) / 10000)  # 억원 단위
            
            if floor_groups:
                data = {
                    "x": list(range(len(floor_groups))),
                    "y": [sum(prices) / len(prices) if prices else 0 for prices in floor_groups.values()],
                    "labels": list(floor_groups.keys())
                }
            else:
                data = {
                    "x": [],
                    "y": [],
                    "labels": []
                }
            
        elif type == "longest_apt_names":
            # 가장 긴 아파트명 Top 10
            stmt = (
                select(Apartment.apt_name, func.length(Apartment.apt_name).label("name_length"))
                .where((Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)))
                .order_by(desc("name_length"))
                .limit(10)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = [{"name": row.apt_name or "미상", "value": row.name_length or 0} for row in rows if row.apt_name]
            else:
                data = []
            
        elif type == "price_rounding_pattern":
            # 거래가 반올림 패턴
            stmt = (
                select(Sale.trans_price)
                .where(
                    and_(
                        Sale.trans_price.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .limit(5000)
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            ends_with_zero = 0
            ends_with_five = 0
            others = 0
            
            for row in rows:
                if row.trans_price:
                    last_digit = int(row.trans_price) % 10
                    if last_digit == 0:
                        ends_with_zero += 1
                    elif last_digit == 5:
                        ends_with_five += 1
                    else:
                        others += 1
            
            if ends_with_zero > 0 or ends_with_five > 0 or others > 0:
                data = [
                    {"name": "0으로 끝남", "value": ends_with_zero},
                    {"name": "5로 끝남", "value": ends_with_five},
                    {"name": "기타", "value": others}
                ]
            else:
                data = []
            
        elif type == "region_volume_heatmap":
            # 지역별 거래량 히트맵 (시각화 탭용)
            stmt = (
                select(
                    State.city_name,
                    State.region_name,
                    func.count(Sale.trans_id).label("count")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .outerjoin(Sale, and_(
                    Sale.apt_id == Apartment.apt_id,
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                ))
                .where((Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)))
                .group_by(State.city_name, State.region_name)
                .having(func.count(Sale.trans_id) > 0)  # 거래량이 0보다 큰 것만
                .order_by(desc("count"))
                .limit(50)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                cities = sorted(set([row.city_name for row in rows if row.city_name]))
                regions = [f"{row.city_name} {row.region_name}" for row in rows]
                heatmap_data = []
                max_count = max([row.count or 0 for row in rows]) if rows else 1
                
                for i, row in enumerate(rows):
                    if row.city_name and row.count and row.count > 0:
                        city_idx = cities.index(row.city_name) if row.city_name in cities else 0
                        heatmap_data.append([city_idx, i, row.count or 0])
                
                data = {
                    "categories": cities,
                    "regions": regions,
                    "data": heatmap_data,
                    "min": 0,
                    "max": max_count
                }
            else:
                data = {
                    "categories": [],
                    "regions": [],
                    "data": [],
                    "min": 0,
                    "max": 0
                }
            
        elif type == "day_of_week_transactions":
            # 요일별 거래량 (0=일요일, 1=월요일, ..., 6=토요일)
            stmt = (
                select(
                    func.extract('dow', Sale.contract_date).label("day_of_week"),
                    func.count(Sale.trans_id).label("count")
                )
                .where(
                    and_(
                        Sale.contract_date.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by("day_of_week")
                .order_by("day_of_week")
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            # 요일 이름 매핑 (PostgreSQL: 0=일요일, 6=토요일)
            day_names = ['일', '월', '화', '수', '목', '금', '토']
            day_counts = {int(row.day_of_week): row.count or 0 for row in rows if row.day_of_week is not None}
            
            categories = []
            values = []
            for i in range(7):
                # PostgreSQL은 일요일이 0이지만, 월요일부터 시작하도록 순서 변경
                day_idx = (i + 1) % 7  # 월(1), 화(2), ..., 일(0)
                categories.append(day_names[day_idx])
                values.append(day_counts.get(day_idx, 0))
            
            if sum(values) > 0:
                data = {
                    "categories": categories,
                    "values": values
                }
            else:
                data = {
                    "categories": categories,
                    "values": [0] * 7
                }
            
        elif type == "monthly_pattern":
            # 월별 거래 패턴 (1월~12월의 계절적 패턴)
            stmt = (
                select(
                    func.extract('month', Sale.contract_date).label("month"),
                    func.count(Sale.trans_id).label("count")
                )
                .where(
                    and_(
                        Sale.contract_date.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by("month")
                .order_by("month")
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            month_counts = {int(row.month): row.count or 0 for row in rows if row.month is not None}
            categories = [f"{i}월" for i in range(1, 13)]
            values = [month_counts.get(i, 0) for i in range(1, 13)]
            
            if sum(values) > 0:
                data = {
                    "categories": categories,
                    "values": values
                }
            else:
                data = {
                    "categories": categories,
                    "values": [0] * 12
                }
            
        elif type == "top_regions_by_price":
            # 평균 거래가 상위 지역
            stmt = (
                select(
                    State.region_name,
                    State.city_name,
                    func.avg(Sale.trans_price).label("avg_price")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(Sale, Sale.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        Sale.trans_price.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by(State.region_name, State.city_name)
                .having(func.count(Sale.trans_id) >= 5)  # 최소 5건 이상
                .order_by(desc("avg_price"))
                .limit(10)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = [{"name": f"{row.city_name} {row.region_name}", "value": int((row.avg_price or 0) / 10000)} for row in rows if row.avg_price]  # 억원 단위
            else:
                data = []
            
        elif type == "apt_name_length_distribution":
            # 아파트명 길이 분포
            stmt = (
                select(
                    func.length(Apartment.apt_name).label("name_length"),
                    func.count(Apartment.apt_id).label("count")
                )
                .where((Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)))
                .group_by("name_length")
                .order_by("name_length")
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            if rows:
                length_counts = {int(row.name_length): row.count or 0 for row in rows if row.name_length is not None}
                
                # 길이 구간별로 그룹화
                ranges = {
                    "5자 이하": [i for i in range(1, 6)],
                    "6-10자": [i for i in range(6, 11)],
                    "11-15자": [i for i in range(11, 16)],
                    "16-20자": [i for i in range(16, 21)],
                    "21자 이상": [i for i in range(21, 100)]
                }
                
                categories = []
                values = []
                for range_name, lengths in ranges.items():
                    count = sum(length_counts.get(l, 0) for l in lengths)
                    if count > 0:
                        categories.append(range_name)
                        values.append(count)
                
                if categories:
                    data = {
                        "categories": categories,
                        "values": values
                    }
                else:
                    data = {
                        "categories": [],
                        "values": []
                    }
            else:
                data = {
                    "categories": [],
                    "values": []
                }
            
        elif type == "build_year_distribution":
            # 건축연도 분포
            stmt = (
                select(
                    func.extract('year', ApartDetail.use_approval_date).label("year"),
                    func.count(Apartment.apt_id).label("count")
                )
                .join(Apartment, ApartDetail.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        ApartDetail.use_approval_date.isnot(None),
                        (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
                    )
                )
                .group_by("year")
                .order_by("year")
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            if rows:
                year_counts = {int(row.year): row.count or 0 for row in rows if row.year is not None}
                
                # 연도 구간별로 그룹화
                ranges = {
                    "2000년 이전": [y for y in range(1900, 2000)],
                    "2000-2010": [y for y in range(2000, 2011)],
                    "2010-2020": [y for y in range(2010, 2021)],
                    "2020년 이후": [y for y in range(2020, 2100)]
                }
                
                categories = []
                values = []
                for range_name, years in ranges.items():
                    count = sum(year_counts.get(y, 0) for y in years)
                    if count > 0:
                        categories.append(range_name)
                        values.append(count)
                
                if categories:
                    data = {
                        "categories": categories,
                        "values": values
                    }
                else:
                    data = {
                        "categories": [],
                        "values": []
                    }
            else:
                data = {
                    "categories": [],
                    "values": []
                }
            
        elif type == "area_price_scatter":
            # 면적별 가격 산점도
            stmt = (
                select(
                    Sale.exclusive_area,
                    Sale.trans_price
                )
                .where(
                    and_(
                        Sale.exclusive_area.isnot(None),
                        Sale.exclusive_area > 0,
                        Sale.trans_price.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .limit(1000)
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            if rows:
                x = [float(row.exclusive_area) for row in rows if row.exclusive_area]
                y = [int((row.trans_price or 0) / 10000) for row in rows if row.trans_price]  # 억원 단위
                
                if len(x) > 0 and len(y) > 0:
                    data = {
                        "x": x,
                        "y": y
                    }
                else:
                    data = {
                        "x": [],
                        "y": []
                    }
            else:
                data = {
                    "x": [],
                    "y": []
                }
            
        elif type == "region_price_heatmap":
            # 지역별 평당가 히트맵 (시각화 탭용)
            stmt = (
                select(
                    State.city_name,
                    State.region_name,
                    func.avg(cast(Sale.trans_price, Integer) / cast(Sale.exclusive_area, Integer)).label("avg_price_per_area")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(Sale, Sale.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        Sale.trans_price.isnot(None),
                        Sale.exclusive_area > 0,
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by(State.city_name, State.region_name)
                .order_by(desc("avg_price_per_area"))
                .limit(50)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                cities = sorted(set([row.city_name for row in rows if row.city_name]))
                regions = [f"{row.city_name} {row.region_name}" for row in rows]
                heatmap_data = []
                prices = [int((row.avg_price_per_area or 0) / 10000) for row in rows if row.avg_price_per_area]
                max_price = max(prices) if prices else 1
                
                for i, row in enumerate(rows):
                    if row.city_name and row.avg_price_per_area:
                        city_idx = cities.index(row.city_name) if row.city_name in cities else 0
                        price = int((row.avg_price_per_area or 0) / 10000)
                        heatmap_data.append([city_idx, i, price])
                
                data = {
                    "categories": cities,
                    "regions": regions,
                    "data": heatmap_data,
                    "min": 0,
                    "max": max_price
                }
            else:
                data = {
                    "categories": [],
                    "regions": [],
                    "data": [],
                    "min": 0,
                    "max": 0
                }
            
        elif type == "price_3d_distribution":
            # 3D 가격 분포 (지역 x 연도)
            stmt = (
                select(
                    State.city_name,
                    func.extract('year', Sale.contract_date).label("year"),
                    func.avg(Sale.trans_price).label("avg_price")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(Sale, Sale.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        Sale.contract_date.isnot(None),
                        Sale.trans_price.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by(State.city_name, "year")
                .order_by(State.city_name, "year")
                .limit(200)
            )
            result = await db.execute(stmt)
            rows = result.all()
            cities = sorted(set([row.city_name for row in rows]))
            years = sorted(set([int(row.year) for row in rows if row.year]))
            
            data = {
                "cities": cities,
                "years": [str(y) for y in years],
                "values": [[cities.index(row.city_name) if row.city_name in cities else 0, 
                           years.index(int(row.year)) if row.year and int(row.year) in years else 0,
                           int((row.avg_price or 0) / 10000)] for row in rows]
            }
            
        elif type == "volume_3d_distribution":
            # 3D 거래량 분포
            stmt = (
                select(
                    State.city_name,
                    func.extract('year', Sale.contract_date).label("year"),
                    func.count(Sale.trans_id).label("count")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(Sale, Sale.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        Sale.contract_date.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by(State.city_name, "year")
                .order_by(State.city_name, "year")
                .limit(200)
            )
            result = await db.execute(stmt)
            rows = result.all()
            cities = sorted(set([row.city_name for row in rows]))
            years = sorted(set([int(row.year) for row in rows if row.year]))
            
            data = {
                "cities": cities,
                "years": [str(y) for y in years],
                "values": [[cities.index(row.city_name) if row.city_name in cities else 0,
                           years.index(int(row.year)) if row.year and int(row.year) in years else 0,
                           row.count or 0] for row in rows]
            }
            
        elif type == "region_treemap":
            # 트리맵 - 지역별 거래량
            stmt = (
                select(
                    State.city_name,
                    State.region_name,
                    func.count(Sale.trans_id).label("count")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .outerjoin(Sale, and_(
                    Sale.apt_id == Apartment.apt_id,
                    Sale.is_canceled == False,
                    (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                ))
                .where((Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)))
                .group_by(State.city_name, State.region_name)
                .order_by(desc("count"))
                .limit(100)
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            # 트리맵 데이터 구조 생성
            city_data = {}
            for row in rows:
                city = row.city_name or "기타"
                region = row.region_name or "기타"
                count = row.count or 0
                
                if city not in city_data:
                    city_data[city] = {"name": city, "value": 0, "children": []}
                city_data[city]["value"] += count
                city_data[city]["children"].append({"name": region, "value": count})
            
            data = list(city_data.values())
            
        elif type == "price_sunburst":
            # 사운버스트 - 가격대별 계층 구조 (시도 > 지역 > 가격대)
            stmt = (
                select(
                    State.city_name,
                    State.region_name,
                    case(
                        (Sale.trans_price < 30000, "3억 미만"),
                        (and_(Sale.trans_price >= 30000, Sale.trans_price < 60000), "3억~6억"),
                        (and_(Sale.trans_price >= 60000, Sale.trans_price < 90000), "6억~9억"),
                        (and_(Sale.trans_price >= 90000, Sale.trans_price < 150000), "9억~15억"),
                        else_="15억 초과"
                    ).label("price_range"),
                    func.count(Sale.trans_id).label("count")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(Sale, Sale.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        Sale.trans_price.isnot(None),
                        Sale.is_canceled == False,
                        (Sale.is_deleted == False) | (Sale.is_deleted.is_(None))
                    )
                )
                .group_by(State.city_name, State.region_name, "price_range")
                .limit(500)
            )
            result = await db.execute(stmt)
            rows = result.all()
            
            # 사운버스트 데이터 구조 생성
            city_data = {}
            for row in rows:
                city = row.city_name or "기타"
                region = row.region_name or "기타"
                price_range = row.price_range or "기타"
                count = row.count or 0
                
                if city not in city_data:
                    city_data[city] = {"name": city, "value": 0, "children": {}}
                
                if region not in city_data[city]["children"]:
                    city_data[city]["children"][region] = {"name": region, "value": 0, "children": []}
                
                city_data[city]["value"] += count
                city_data[city]["children"][region]["value"] += count
                city_data[city]["children"][region]["children"].append({"name": price_range, "value": count})
            
            # children을 배열로 변환
            for city in city_data.values():
                city["children"] = list(city["children"].values())
            
            data = list(city_data.values())
            
        else:
            return {"success": False, "message": f"Unknown visualization type: {type}"}
        
        # 데이터 검증
        if data is None:
            return {"success": False, "message": "Data is None"}
        
        # 빈 배열이나 빈 객체인 경우도 성공으로 반환 (프론트엔드에서 처리)
        return {"success": True, "data": data}
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"Visualization API error for type {type}: {error_detail}")
        return {"success": False, "message": str(e), "error_detail": error_detail}

# --- 10. 지역 통계 API ---
@router.get("/region-stats/data")
async def get_region_stats_data(
    type: str,
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세), wolse(월세)"),
    db: AsyncSession = Depends(get_db)
):
    """지역 통계 데이터 제공"""
    try:
        if type == "city_avg_price":
            # 시도별 집값 평균 (매매/전세/월세 구분)
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            price_field = get_price_field(transaction_type, trans_table)
            
            stmt = (
                select(
                    State.city_name,
                    func.avg(price_field).label("avg_price")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        base_filter
                    )
                )
                .group_by(State.city_name)
                .order_by(desc("avg_price"))
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = [{"name": row.city_name or "미상", "value": int((row.avg_price or 0) / 10000)} for row in rows if row.avg_price]  # 억원 단위
            else:
                data = []
            
        elif type == "city_price_per_area":
            # 시도별 평당가 평균 (공급면적 기준, m² 단위) (매매/전세/월세 구분)
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            price_field = get_price_field(transaction_type, trans_table)
            
            if transaction_type == "sale":
                area_field = trans_table.exclusive_area
            else:
                area_field = trans_table.exclusive_area
            
            stmt = (
                select(
                    State.city_name,
                    func.avg(cast(price_field, Integer) / cast(area_field, Integer)).label("avg_price_per_area")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        area_field > 0,
                        base_filter
                    )
                )
                .group_by(State.city_name)
                .order_by(desc("avg_price_per_area"))
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = [{"name": row.city_name or "미상", "value": int((row.avg_price_per_area or 0) / 10000)} for row in rows if row.avg_price_per_area]  # 만원/㎡ 단위를 억원/㎡로 변환
            else:
                data = []
            
        elif type == "region_build_year":
            # 시군구별 건축연도 평균
            stmt = (
                select(
                    State.region_name,
                    State.city_name,
                    func.avg(func.extract('year', ApartDetail.use_approval_date)).label("avg_year")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(ApartDetail, ApartDetail.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        ApartDetail.use_approval_date.isnot(None),
                        (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
                    )
                )
                .group_by(State.region_name, State.city_name)
                .order_by(desc("avg_year"))
                .limit(50)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = [{"name": f"{row.city_name} {row.region_name}", "value": int(row.avg_year or 0)} for row in rows if row.avg_year]
            else:
                data = []
            
        elif type == "region_avg_price":
            # 시군구별 집값 평균 (매매/전세/월세 구분)
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            price_field = get_price_field(transaction_type, trans_table)
            
            stmt = (
                select(
                    State.region_name,
                    State.city_name,
                    func.avg(price_field).label("avg_price")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        base_filter
                    )
                )
                .group_by(State.region_name, State.city_name)
                .order_by(desc("avg_price"))
                .limit(50)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = [{"name": f"{row.city_name} {row.region_name}", "value": int((row.avg_price or 0) / 10000)} for row in rows if row.avg_price]  # 억원 단위
            else:
                data = []
            
        elif type == "region_volume_heatmap":
            # 지역별 거래량 히트맵 데이터 (매매/전세/월세 구분)
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            
            if transaction_type == "sale":
                id_field = trans_table.trans_id
            else:
                id_field = trans_table.trans_id
            
            stmt = (
                select(
                    State.city_name,
                    State.region_name,
                    func.count(id_field).label("count")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .outerjoin(trans_table, and_(
                    trans_table.apt_id == Apartment.apt_id,
                    base_filter
                ))
                .where((Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None)))
                .group_by(State.city_name, State.region_name)
                .having(func.count(id_field) > 0)  # 거래량이 0보다 큰 것만
                .order_by(desc("count"))
                .limit(100)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                cities = sorted(set([row.city_name for row in rows if row.city_name]))
                regions = [f"{row.city_name} {row.region_name}" for row in rows[:30] if row.city_name and row.count and row.count > 0]
                heatmap_data = []
                max_count = max([row.count or 0 for row in rows]) if rows else 1
                
                for i, row in enumerate(rows[:30]):
                    if row.city_name and row.count and row.count > 0:
                        city_idx = cities.index(row.city_name) if row.city_name in cities else 0
                        heatmap_data.append([city_idx, i, row.count or 0])
                
                data = {
                    "categories": cities[:10],
                    "regions": regions,
                    "data": heatmap_data,
                    "min": 0,
                    "max": max_count
                }
            else:
                data = {
                    "categories": [],
                    "regions": [],
                    "data": [],
                    "min": 0,
                    "max": 0
                }
            
        elif type == "region_price_heatmap":
            # 지역별 평당가 히트맵 데이터 (매매/전세/월세 구분)
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            price_field = get_price_field(transaction_type, trans_table)
            
            if transaction_type == "sale":
                area_field = trans_table.exclusive_area
            else:
                area_field = trans_table.exclusive_area
            
            stmt = (
                select(
                    State.city_name,
                    State.region_name,
                    func.avg(cast(price_field, Integer) / cast(area_field, Integer)).label("avg_price_per_area")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        area_field > 0,
                        base_filter
                    )
                )
                .group_by(State.city_name, State.region_name)
                .order_by(desc("avg_price_per_area"))
                .limit(100)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                cities = sorted(set([row.city_name for row in rows if row.city_name]))
                regions = [f"{row.city_name} {row.region_name}" for row in rows[:30] if row.city_name]
                heatmap_data = []
                prices = [int((row.avg_price_per_area or 0) / 10000) for row in rows[:30] if row.avg_price_per_area]
                max_price = max(prices) if prices else 1
                
                for i, row in enumerate(rows[:30]):
                    if row.avg_price_per_area and row.city_name:
                        city_idx = cities.index(row.city_name) if row.city_name in cities else 0
                        price = int((row.avg_price_per_area or 0) / 10000)
                        heatmap_data.append([city_idx, i, price])
                
                data = {
                    "categories": cities[:10],
                    "regions": regions,
                    "data": heatmap_data,
                    "min": 0,
                    "max": max_price
                }
            else:
                data = {
                    "categories": [],
                    "regions": [],
                    "data": [],
                    "min": 0,
                    "max": 0
                }
            
        elif type == "region_price_range":
            # 지역별 최고가 vs 최저가 (매매/전세/월세 구분)
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            price_field = get_price_field(transaction_type, trans_table)
            
            if transaction_type == "sale":
                id_field = trans_table.trans_id
            else:
                id_field = trans_table.trans_id
            
            stmt = (
                select(
                    State.region_name,
                    State.city_name,
                    func.max(price_field).label("max_price"),
                    func.min(price_field).label("min_price"),
                    func.avg(price_field).label("avg_price")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        base_filter
                    )
                )
                .group_by(State.region_name, State.city_name)
                .having(func.count(id_field) >= 5)  # 최소 5건 이상
                .order_by(desc("avg_price"))
                .limit(20)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = {
                    "categories": [f"{row.city_name} {row.region_name}" for row in rows if row.city_name],
                    "max": [int((row.max_price or 0) / 10000) for row in rows if row.max_price],
                    "min": [int((row.min_price or 0) / 10000) for row in rows if row.min_price],
                    "avg": [int((row.avg_price or 0) / 10000) for row in rows if row.avg_price]
                }
            else:
                data = {
                    "categories": [],
                    "max": [],
                    "min": [],
                    "avg": []
                }
            
        elif type == "region_volume_price":
            # 지역별 거래량 vs 평균가 (매매/전세/월세 구분)
            trans_table, _, base_filter = get_transaction_filter(transaction_type)
            price_field = get_price_field(transaction_type, trans_table)
            
            if transaction_type == "sale":
                id_field = trans_table.trans_id
            else:
                id_field = trans_table.trans_id
            
            stmt = (
                select(
                    State.region_name,
                    State.city_name,
                    func.count(id_field).label("volume"),
                    func.avg(price_field).label("avg_price")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        base_filter
                    )
                )
                .group_by(State.region_name, State.city_name)
                .order_by(desc("volume"))
                .limit(50)
            )
            result = await db.execute(stmt)
            rows = result.all()
            if rows:
                data = {
                    "points": [[row.volume or 0, int((row.avg_price or 0) / 10000), row.volume or 0] for row in rows if row.volume and row.avg_price],
                    "regions": [f"{row.city_name} {row.region_name}" for row in rows if row.city_name]
                }
            else:
                data = {
                    "points": [],
                    "regions": []
                }
            
        else:
            return {"success": False, "message": f"Unknown region stats type: {type}"}
        
        return {"success": True, "data": data}
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"Region stats API error for type {type}: {error_detail}")
        return {"success": False, "message": str(e), "error_detail": error_detail}

@router.get("/region-stats/ranking")
async def get_region_rankings(
    type: str,
    transaction_type: str = Query("sale", description="거래 유형: sale(매매), jeonse(전세), wolse(월세)"),
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """지역 랭킹 데이터 (매매/전세/월세 구분)"""
    try:
        data = []
        trans_table, _, base_filter = get_transaction_filter(transaction_type)
        price_field = get_price_field(transaction_type, trans_table)
        
        if transaction_type == "sale":
            area_field = trans_table.exclusive_area
        else:
            area_field = trans_table.exclusive_area
        
        if type == "city_price":
            stmt = (
                select(
                    State.city_name,
                    func.avg(price_field).label("avg_price")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        base_filter
                    )
                )
                .group_by(State.city_name)
                .order_by(desc("avg_price"))
                .limit(limit)
            )
            result = await db.execute(stmt)
            for row in result:
                avg_price = (row.avg_price or 0) / 10000  # 억원 단위
                data.append({
                    "name": row.city_name or "미상",
                    "region": "",
                    "value": f"{avg_price:.1f}억원"
                })
                
        elif type == "city_price_per_area":
            stmt = (
                select(
                    State.city_name,
                    func.avg(cast(price_field, Integer) / cast(area_field, Integer)).label("avg_price_per_area")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        area_field > 0,
                        base_filter
                    )
                )
                .group_by(State.city_name)
                .order_by(desc("avg_price_per_area"))
                .limit(limit)
            )
            result = await db.execute(stmt)
            for row in result:
                price_per_area = (row.avg_price_per_area or 0) / 10000  # 억원/㎡ 단위
                data.append({
                    "name": row.city_name or "미상",
                    "region": "",
                    "value": f"{price_per_area:.2f}억원/㎡"
                })
                
        elif type == "region_build_year":
            stmt = (
                select(
                    State.region_name,
                    State.city_name,
                    func.avg(func.extract('year', ApartDetail.use_approval_date)).label("avg_year")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(ApartDetail, ApartDetail.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        ApartDetail.use_approval_date.isnot(None),
                        (Apartment.is_deleted == False) | (Apartment.is_deleted.is_(None))
                    )
                )
                .group_by(State.region_name, State.city_name)
                .order_by(desc("avg_year"))
                .limit(limit)
            )
            result = await db.execute(stmt)
            for row in result:
                avg_year = int(row.avg_year or 0)
                data.append({
                    "name": row.region_name or "미상",
                    "region": row.city_name or "",
                    "value": f"{avg_year}년"
                })
                
        elif type == "region_expensive":
            if transaction_type == "sale":
                id_field = trans_table.trans_id
            else:
                id_field = trans_table.trans_id
            
            stmt = (
                select(
                    State.region_name,
                    State.city_name,
                    func.avg(price_field).label("avg_price")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        base_filter
                    )
                )
                .group_by(State.region_name, State.city_name)
                .having(func.count(id_field) >= 5)
                .order_by(desc("avg_price"))
                .limit(limit)
            )
            result = await db.execute(stmt)
            for row in result:
                avg_price = (row.avg_price or 0) / 10000  # 억원 단위
                data.append({
                    "name": row.region_name or "미상",
                    "region": row.city_name or "",
                    "value": f"{avg_price:.1f}억원"
                })
                
        elif type == "region_cheap":
            if transaction_type == "sale":
                id_field = trans_table.trans_id
            else:
                id_field = trans_table.trans_id
            
            stmt = (
                select(
                    State.region_name,
                    State.city_name,
                    func.avg(price_field).label("avg_price")
                )
                .join(Apartment, State.region_id == Apartment.region_id)
                .join(trans_table, trans_table.apt_id == Apartment.apt_id)
                .where(
                    and_(
                        price_field.isnot(None),
                        base_filter
                    )
                )
                .group_by(State.region_name, State.city_name)
                .having(func.count(id_field) >= 5)
                .order_by("avg_price")
                .limit(limit)
            )
            result = await db.execute(stmt)
            for row in result:
                avg_price = (row.avg_price or 0) / 10000  # 억원 단위
                data.append({
                    "name": row.region_name or "미상",
                    "region": row.city_name or "",
                    "value": f"{avg_price:.1f}억원"
                })
        
        return {"success": True, "data": data}
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"Region ranking API error for type {type}: {error_detail}")
        return {"success": False, "message": str(e), "error_detail": error_detail}


@router.get("/csv-viewer", response_class=HTMLResponse)
async def csv_viewer_page():
    """CSV 파일을 표 형태로 보는 웹 페이지"""
    html_content = """
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CSV 뷰어 - Sales 데이터</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: #f5f5f5;
                padding: 20px;
            }
            .container {
                max-width: 1400px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                padding: 30px;
            }
            h1 {
                color: #333;
                margin-bottom: 20px;
                border-bottom: 3px solid #4CAF50;
                padding-bottom: 10px;
            }
            .controls {
                display: flex;
                gap: 15px;
                margin-bottom: 20px;
                flex-wrap: wrap;
                align-items: center;
            }
            .control-group {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            label {
                font-weight: 600;
                color: #555;
                font-size: 14px;
            }
            input, select {
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
            }
            button {
                padding: 10px 20px;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: background 0.3s;
            }
            button:hover {
                background: #45a049;
            }
            button:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            .info {
                background: #e3f2fd;
                padding: 15px;
                border-radius: 4px;
                margin-bottom: 20px;
                border-left: 4px solid #2196F3;
            }
            .info strong {
                color: #1976D2;
            }
            .table-container {
                overflow-x: auto;
                max-height: 70vh;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
            }
            thead {
                position: sticky;
                top: 0;
                background: #4CAF50;
                color: white;
                z-index: 10;
            }
            th {
                padding: 12px 8px;
                text-align: left;
                font-weight: 600;
                border-right: 1px solid rgba(255,255,255,0.2);
            }
            th:last-child {
                border-right: none;
            }
            td {
                padding: 10px 8px;
                border-bottom: 1px solid #eee;
                border-right: 1px solid #eee;
            }
            td:last-child {
                border-right: none;
            }
            tbody tr:hover {
                background: #f5f5f5;
            }
            tbody tr:nth-child(even) {
                background: #fafafa;
            }
            .loading {
                text-align: center;
                padding: 40px;
                color: #666;
            }
            .error {
                background: #ffebee;
                color: #c62828;
                padding: 15px;
                border-radius: 4px;
                margin-bottom: 20px;
                border-left: 4px solid #c62828;
            }
            .pagination {
                display: flex;
                gap: 10px;
                margin-top: 20px;
                align-items: center;
                justify-content: center;
            }
            .pagination button {
                padding: 8px 15px;
                background: #2196F3;
            }
            .pagination button:hover {
                background: #1976D2;
            }
            .pagination .page-info {
                padding: 8px 15px;
                background: #f5f5f5;
                border-radius: 4px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📊 CSV 뷰어 - Sales 데이터</h1>
            
            <div class="controls">
                <div class="control-group">
                    <label>아파트 ID (apt_id)</label>
                    <input type="number" id="aptId" placeholder="예: 20014" />
                </div>
                <div class="control-group">
                    <label>거래 유형</label>
                    <select id="transType">
                        <option value="">전체</option>
                        <option value="매매">매매</option>
                        <option value="전세">전세</option>
                        <option value="월세">월세</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>최소 가격 (만원)</label>
                    <input type="number" id="minPrice" placeholder="예: 10000" />
                </div>
                <div class="control-group">
                    <label>최대 가격 (만원)</label>
                    <input type="number" id="maxPrice" placeholder="예: 50000" />
                </div>
                <div class="control-group" style="justify-content: flex-end;">
                    <label style="visibility: hidden;">검색</label>
                    <button onclick="loadData()">🔍 검색</button>
                </div>
                <div class="control-group" style="justify-content: flex-end;">
                    <label style="visibility: hidden;">초기화</label>
                    <button onclick="resetFilters()" style="background: #f44336;">🔄 초기화</button>
                </div>
            </div>
            
            <div id="info" class="info" style="display: none;">
                <strong>📋 정보:</strong> <span id="infoText"></span>
            </div>
            
            <div id="error" class="error" style="display: none;"></div>
            
            <div class="table-container">
                <div id="loading" class="loading">데이터를 불러오는 중...</div>
                <table id="dataTable" style="display: none;">
                    <thead id="tableHead"></thead>
                    <tbody id="tableBody"></tbody>
                </table>
            </div>
            
            <div class="pagination" id="pagination" style="display: none;">
                <button onclick="changePage(-1)" id="prevBtn">◀ 이전</button>
                <div class="page-info">
                    <span id="pageInfo">페이지 1 / 1</span>
                </div>
                <button onclick="changePage(1)" id="nextBtn">다음 ▶</button>
            </div>
        </div>
        
        <script>
            let currentPage = 1;
            let pageSize = 50;
            let totalRows = 0;
            let allData = [];
            
            async function loadData() {
                const aptId = document.getElementById('aptId').value;
                const transType = document.getElementById('transType').value;
                const minPrice = document.getElementById('minPrice').value;
                const maxPrice = document.getElementById('maxPrice').value;
                
                document.getElementById('loading').style.display = 'block';
                document.getElementById('dataTable').style.display = 'none';
                document.getElementById('error').style.display = 'none';
                document.getElementById('info').style.display = 'none';
                document.getElementById('pagination').style.display = 'none';
                
                try {
                    const params = new URLSearchParams();
                    if (aptId) params.append('apt_id', aptId);
                    if (transType) params.append('trans_type', transType);
                    if (minPrice) params.append('min_price', minPrice);
                    if (maxPrice) params.append('max_price', maxPrice);
                    
                    const response = await fetch(`/api/v1/admin/csv-viewer/data?${params.toString()}`);
                    const result = await response.json();
                    
                    if (result.success) {
                        allData = result.data;
                        totalRows = allData.length;
                        currentPage = 1;
                        displayData();
                        
                        document.getElementById('infoText').textContent = 
                            `총 ${totalRows.toLocaleString()}건의 데이터를 찾았습니다.`;
                        document.getElementById('info').style.display = 'block';
                    } else {
                        throw new Error(result.message || '데이터를 불러오는데 실패했습니다.');
                    }
                } catch (error) {
                    document.getElementById('error').textContent = '❌ 오류: ' + error.message;
                    document.getElementById('error').style.display = 'block';
                } finally {
                    document.getElementById('loading').style.display = 'none';
                }
            }
            
            function displayData() {
                const start = (currentPage - 1) * pageSize;
                const end = start + pageSize;
                const pageData = allData.slice(start, end);
                
                if (pageData.length === 0) {
                    document.getElementById('tableBody').innerHTML = 
                        '<tr><td colspan="100%" style="text-align: center; padding: 40px;">데이터가 없습니다.</td></tr>';
                    document.getElementById('dataTable').style.display = 'table';
                    return;
                }
                
                // 헤더 생성
                const headers = Object.keys(pageData[0]);
                const thead = document.getElementById('tableHead');
                thead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
                
                // 바디 생성
                const tbody = document.getElementById('tableBody');
                tbody.innerHTML = pageData.map(row => 
                    '<tr>' + headers.map(h => `<td>${row[h] ?? ''}</td>`).join('') + '</tr>'
                ).join('');
                
                document.getElementById('dataTable').style.display = 'table';
                
                // 페이지네이션 업데이트
                const totalPages = Math.ceil(totalRows / pageSize);
                document.getElementById('pageInfo').textContent = 
                    `페이지 ${currentPage} / ${totalPages} (총 ${totalRows.toLocaleString()}건)`;
                document.getElementById('prevBtn').disabled = currentPage === 1;
                document.getElementById('nextBtn').disabled = currentPage === totalPages;
                document.getElementById('pagination').style.display = totalPages > 1 ? 'flex' : 'none';
            }
            
            function changePage(delta) {
                const totalPages = Math.ceil(totalRows / pageSize);
                const newPage = currentPage + delta;
                if (newPage >= 1 && newPage <= totalPages) {
                    currentPage = newPage;
                    displayData();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
            
            function resetFilters() {
                document.getElementById('aptId').value = '';
                document.getElementById('transType').value = '';
                document.getElementById('minPrice').value = '';
                document.getElementById('maxPrice').value = '';
                allData = [];
                totalRows = 0;
                document.getElementById('dataTable').style.display = 'none';
                document.getElementById('info').style.display = 'none';
                document.getElementById('pagination').style.display = 'none';
            }
            
            // 엔터키로 검색
            ['aptId', 'minPrice', 'maxPrice'].forEach(id => {
                document.getElementById(id).addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') loadData();
                });
            });
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


@router.get("/csv-viewer/data")
async def csv_viewer_data(
    apt_id: Optional[int] = Query(None, description="아파트 ID"),
    trans_type: Optional[str] = Query(None, description="거래 유형"),
    min_price: Optional[int] = Query(None, description="최소 가격 (만원)"),
    max_price: Optional[int] = Query(None, description="최대 가격 (만원)"),
):
    """CSV 데이터를 필터링하여 반환"""
    try:
        import pandas as pd
        
        # CSV 파일 경로
        csv_path = "/app/backups/sales.csv"
        if not os.path.exists(csv_path):
            csv_path = os.path.join(os.path.dirname(__file__), "../../../../db_backup/sales.csv")
        
        if not os.path.exists(csv_path):
            return {"success": False, "message": f"CSV 파일을 찾을 수 없습니다: {csv_path}"}
        
        # CSV 읽기
        df = pd.read_csv(csv_path, low_memory=False)
        
        # 필터링
        filtered = df.copy()
        
        if apt_id is not None:
            filtered = filtered[filtered['apt_id'] == apt_id]
        
        if trans_type:
            filtered = filtered[filtered['trans_type'] == trans_type]
        
        if min_price is not None:
            filtered = filtered[filtered['trans_price'] >= min_price]
        
        if max_price is not None:
            filtered = filtered[filtered['trans_price'] <= max_price]
        
        # 결과를 딕셔너리 리스트로 변환
        result = filtered.fillna('').to_dict('records')
        
        # 숫자 타입을 문자열로 변환 (JSON 직렬화를 위해)
        for row in result:
            for key, value in row.items():
                if pd.isna(value):
                    row[key] = ''
                elif isinstance(value, (int, float)):
                    if pd.isna(value):
                        row[key] = ''
                    else:
                        row[key] = str(value)
        
        return {"success": True, "data": result}
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        return {"success": False, "message": str(e), "error_detail": error_detail}