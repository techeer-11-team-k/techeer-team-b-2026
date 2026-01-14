from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Body
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func, desc, and_
from sqlalchemy.orm import joinedload
from typing import List, Optional, Any, Dict
import pathlib
import os
import random
from datetime import datetime, timedelta

from app.api.v1.deps import get_db
from app.models.apartment import Apartment
from app.models.state import State
from app.models.apart_detail import ApartDetail
from app.models.sale import Sale
from app.models.rent import Rent

router = APIRouter()

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

# --- 2. 핵심 차트 데이터 API ---
@router.get("/stats/charts")
async def get_chart_data(type: str, db: AsyncSession = Depends(get_db)):
    """
    핵심 차트 데이터 제공 (Line, Bar, Ranking)
    """
    try:
        data = {}
        
        # 1. 월별 거래 추이 (Line + Bar) - 실제 DB 집계
        if type == "monthly_trend":
            # 최근 12개월 기준 설정
            today = datetime.now().date()
            start_date = today - timedelta(days=365)
            
            # 월별 그룹화 쿼리 (PostgreSQL)
            # TO_CHAR(contract_date, 'YYYY-MM') 사용
            stmt = (
                select(
                    func.to_char(Sale.contract_date, 'YYYY-MM').label("month"),
                    func.count(Sale.trans_id).label("count"),
                    func.avg(Sale.trans_price).label("avg_price")
                )
                .where(Sale.contract_date >= start_date)
                .group_by(func.to_char(Sale.contract_date, 'YYYY-MM'))
                .order_by(func.to_char(Sale.contract_date, 'YYYY-MM'))
            )
            
            result = await db.execute(stmt)
            rows = result.all()
            
            # DB 결과를 딕셔너리로 변환
            db_data = {row.month: {"count": row.count, "price": int(row.avg_price or 0)} for row in rows}
            
            # 최근 12개월 라벨 생성 및 데이터 채우기 (데이터 없는 달은 0)
            months = []
            volumes = []
            prices = []
            
            curr = start_date
            while curr <= today:
                ym = curr.strftime("%Y-%m")
                months.append(ym)
                
                if ym in db_data:
                    volumes.append(db_data[ym]["count"])
                    prices.append(db_data[ym]["price"])
                else:
                    volumes.append(0)
                    prices.append(0)
                
                # 다음 달로 이동 (간단 계산)
                if curr.month == 12:
                    curr = curr.replace(year=curr.year + 1, month=1, day=1)
                else:
                    curr = curr.replace(month=curr.month + 1, day=1)
            
            # 6개월치만 잘라서 보여주거나 전체 보여주기 (여기선 전체)
            data = {
                "categories": months,
                "volume": volumes,
                "price": prices
            }
            
        # 2. 지역별 거래량 비교 (Bar)
        elif type == "region_volume":
            regions = ["서울", "경기", "인천", "부산", "대구"]
            data = {
                "categories": regions,
                "values": [random.randint(100, 500) for _ in range(5)]
            }
            
        # 3. 가격대별 분포 (Pie)
        elif type == "price_range":
            data = [
                {"name": "3억 미만", "value": random.randint(10, 50)},
                {"name": "3억~6억", "value": random.randint(20, 60)},
                {"name": "6억~9억", "value": random.randint(15, 40)},
                {"name": "9억~15억", "value": random.randint(5, 20)},
                {"name": "15억 초과", "value": random.randint(1, 10)}
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
                "developer_name": detail.developer_name if detail else None
            } if detail else None,
            "sales": sales_list,
            "rents": [{"deal_date": str(r.deal_date)} for r in rents_res.scalars().all()]
        }
    }

# --- 4. 랭킹 API ---
@router.get("/stats/ranking")
async def get_rankings(type: str = "price", limit: int = 10, db: AsyncSession = Depends(get_db)):
    try:
        data = []
        if type == "price":
            stmt = select(Sale, Apartment, State).join(Apartment, Sale.apt_id == Apartment.apt_id).join(State, Apartment.region_id == State.region_id).order_by(desc(Sale.trans_price)).limit(limit)
            result = await db.execute(stmt)
            for sale, apt, state in result:
                data.append({"rank_val": f"{int(sale.trans_price or 0):,}만원", "apt_name": apt.apt_name, "region": state.region_name, "date": str(sale.contract_date), "area": f"{sale.exclusive_area}㎡"})
        elif type == "volume":
            stmt = select(Apartment.apt_name, State.region_name, func.count(Sale.trans_id).label("count")).join(State).join(Sale).group_by(Apartment.apt_id, State.region_id).order_by(desc("count")).limit(limit)
            result = await db.execute(stmt)
            for row in result:
                data.append({"rank_val": f"{row.count}건", "apt_name": row.apt_name, "region": row.region_name, "date": "-", "area": "-"})
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
    return {"success": False, "message": "INSERT 기능은 아직 구현되지 않았습니다."}

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