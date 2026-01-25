"""
인구 이동 데이터 수집 서비스

KOSIS 통계청 API에서 인구 이동 데이터를 가져와서 데이터베이스에 저장합니다.
"""
import logging
import sys
from typing import Dict, Any, Optional
import httpx
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.state import State
from app.models.population_movement import PopulationMovement
from app.core.config import settings
from app.services.data_collection.base import DataCollectionServiceBase

# 로거 설정
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# 핸들러가 없으면 추가
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = False


class PopulationMovementCollectionService(DataCollectionServiceBase):
    """
    인구 이동 데이터 수집 서비스
    """

    async def collect_population_movements(
        self,
        db: AsyncSession,
        start_prd_de: str = "201701",
        end_prd_de: str = "202511"
    ) -> Dict[str, Any]:
        """
        KOSIS 통계청 API에서 인구 이동 매트릭스(출발지->도착지) 데이터를 가져와서 저장
        
        Args:
            db: 데이터베이스 세션
            start_prd_de: 시작 기간 (YYYYMM)
            end_prd_de: 종료 기간 (YYYYMM)
        
        Returns:
            저장 결과 딕셔너리
        """
        # 인구 이동 매트릭스 데이터 수집 (출발지->도착지)
        return await self._collect_population_movement_matrix_data(db, start_prd_de, end_prd_de)

    async def _collect_population_movement_matrix_data(
        self,
        db: AsyncSession,
        start_prd_de: str = "202401",
        end_prd_de: str = "202511"
    ) -> Dict[str, Any]:
        """
        KOSIS 통계청 API에서 인구 이동 매트릭스(출발지->도착지) 데이터를 가져와서 저장
        
        Args:
            db: 데이터베이스 세션
            start_prd_de: 시작 기간 (YYYYMM)
            end_prd_de: 종료 기간 (YYYYMM)
        
        Returns:
            저장 결과 딕셔너리
        """
        if not settings.KOSIS_API_KEY:
            raise ValueError("KOSIS_API_KEY가 설정되지 않았습니다.")
        
        try:
            # KOSIS API 호출
            kosis_url = "https://kosis.kr/openapi/Param/statisticsParameterData.do"
            params = {
                "method": "getList",
                "apiKey": settings.KOSIS_API_KEY,
                "itmId": "T70+T80+",  # 이동자수 + 순이동자수
                "objL1": "ALL",   # 전출지 (Source)
                "objL2": "ALL",   # 전입지 (Target)
                "objL3": "",
                "objL4": "",
                "objL5": "",
                "objL6": "",
                "objL7": "",
                "objL8": "",
                "format": "json",
                "jsonVD": "Y",
                "prdSe": "Q",     # 분기별 (사용자 요청사항)
                "startPrdDe": start_prd_de,
                "endPrdDe": end_prd_de,
                "orgId": "101",
                "tblId": "DT_1B26003_A01" # 전출지/전입지(시도)별 이동자수
            }
            
            # API URL과 파라미터 로그 출력 (민감 정보 제외)
            safe_params = {k: (v if k != "apiKey" else "***") for k, v in params.items()}
            logger.info(f"📡 KOSIS Matrix API 호출 시작: {start_prd_de} ~ {end_prd_de}")
            logger.info(f"   📋 API 파라미터: {safe_params}")
            
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.get(kosis_url, params=params)
                logger.info(f"   📊 HTTP 응답 상태: {response.status_code}")
                response.raise_for_status()
                raw_data = response.json()
            
            # 데이터 파싱 (이전 메서드와 동일한 로직 사용)
            data = []
            if isinstance(raw_data, dict):
                logger.info(f"   📋 API 응답 타입: dict, 키 목록: {list(raw_data.keys())}")
                
                # 오류 응답 확인
                if "err" in raw_data or "errMsg" in raw_data:
                    err_code = raw_data.get("err", "N/A")
                    err_msg = raw_data.get("errMsg", "N/A")
                    logger.error(f"   ❌ KOSIS Matrix API 오류 응답: err={err_code}, errMsg={err_msg}")
                    raise ValueError(f"KOSIS Matrix API 오류: {err_code} - {err_msg}")
                
                # 다양한 가능한 키 시도
                if "StatisticSearch" in raw_data:
                    stat_search = raw_data["StatisticSearch"]
                    if isinstance(stat_search, dict):
                        data = stat_search.get("row", [])
                    elif isinstance(stat_search, list):
                        data = stat_search
                    else:
                        data = []
                elif "row" in raw_data:
                    data = raw_data["row"] if isinstance(raw_data["row"], list) else []
                elif "data" in raw_data:
                    data = raw_data["data"] if isinstance(raw_data["data"], list) else []
                elif "list" in raw_data:
                    data = raw_data["list"] if isinstance(raw_data["list"], list) else []
                elif len(raw_data) == 1:
                    # 딕셔너리에 값이 하나인 경우 그 값을 시도
                    first_value = list(raw_data.values())[0]
                    if isinstance(first_value, list):
                        data = first_value
                    elif isinstance(first_value, dict) and "row" in first_value:
                        data = first_value["row"] if isinstance(first_value["row"], list) else []
                    else:
                        data = []
                else:
                    # dict의 모든 값이 리스트인지 확인
                    list_values = [v for v in raw_data.values() if isinstance(v, list)]
                    if list_values:
                        # 첫 번째 리스트 값 사용
                        data = list_values[0]
                    else:
                        logger.warning(f"   ⚠️ dict 응답에서 리스트를 찾을 수 없음, 모든 값: {list(raw_data.keys())}")
                        logger.debug(f"   🔍 raw_data 내용 샘플: {str(raw_data)[:500]}")
                        data = []
            elif isinstance(raw_data, list):
                data = raw_data
            else:
                logger.warning(f"   ⚠️ 예상치 못한 응답 타입: {type(raw_data)}")
                data = []
            
            data_count = len(data) if isinstance(data, list) else 0
            logger.info(f"✅ KOSIS Matrix API 호출 성공: {data_count}건의 데이터 수신")
            
            # 데이터 타입 및 샘플 확인
            if isinstance(data, list) and len(data) > 0:
                sample_item = data[0]
                logger.info(f"   📊 데이터 샘플: C1={sample_item.get('C1')}, C2={sample_item.get('C2')}, ITM_ID={sample_item.get('ITM_ID')}, PRD_DE={sample_item.get('PRD_DE')}, PRD_SE={sample_item.get('PRD_SE')}")
            else:
                logger.warning(f"   ⚠️ 데이터가 리스트가 아니거나 비어있음: type={type(data)}, len={len(data) if isinstance(data, list) else 'N/A'}")
            
            # C1(전출지), C2(전입지) 코드 매핑
            # KOSIS 코드 -> Region ID (State 테이블)
            # 00=전국, 11=서울, 26=부산, 27=대구, 28=인천, 29=광주, 30=대전, 31=울산
            # 36=세종, 41=경기, 51=강원, 43=충북, 44=충남, 52=전북, 46=전남, 47=경북, 48=경남, 50=제주
            
            kosis_city_map = {
                "11": "서울특별시", "26": "부산광역시", "27": "대구광역시", "28": "인천광역시",
                "29": "광주광역시", "30": "대전광역시", "31": "울산광역시", "36": "세종특별자치시",
                "41": "경기도", "51": "강원특별자치도", "42": "강원특별자치도", # 42는 구 코드일 수 있음
                "43": "충청북도", "44": "충청남도", "52": "전북특별자치도", "45": "전북특별자치도", # 45는 구 코드
                "46": "전라남도", "47": "경상북도", "48": "경상남도", "50": "제주특별자치도"
            }
            
            # DB에서 State 정보 로드 to get region_id
            states_result = await db.execute(select(State).where(State.is_deleted == False))
            states_list = states_result.scalars().all()
            
            # City Name -> Region ID (Representative)
            city_to_region_id = {}
            for state in states_list:
                if state.city_name not in city_to_region_id:
                    city_to_region_id[state.city_name] = state.region_id
            
            # KOSIS Code -> Region ID
            code_to_region_id = {}
            for code, city_name in kosis_city_map.items():
                if city_name in city_to_region_id:
                    code_to_region_id[code] = city_to_region_id[city_name]
            
            logger.info(f"   🔗 지역 매핑 준비 완료: {len(code_to_region_id)}개 코드 매핑")

            # 데이터 처리 및 저장
            saved_count = 0
            updated_count = 0
            skipped_count = 0
            
            # 기존 데이터 조회를 위한 키 셋 준비 (Batch Update를 위함)
            # 복합키: (base_ym, from_region_id, to_region_id)
            
            processed_data = []
            
            for item in data:
                prd_de = item.get("PRD_DE")
                c1 = item.get("C1") # 전출지
                c2 = item.get("C2") # 전입지
                dt = item.get("DT") # 이동자수
                itm_id = item.get("ITM_ID") # 지표 ID (T70=이동자수, T80=순이동자수)
                prd_se = item.get("PRD_SE", "M") # 기간 구분 (M=월, Q=분기)
                
                # T70 (이동자수)만 처리 (T80은 순이동자수이므로 매트릭스에는 불필요)
                if itm_id != "T70":
                    continue
                
                # 전국(00) 데이터는 제외 (순수 지역간 이동만)
                if c1 == "00" or c2 == "00":
                    continue
                
                # 분기 데이터를 월 데이터로 변환 (예: 2024Q1 -> 202403, 2024Q2 -> 202406, 2024Q3 -> 202409, 2024Q4 -> 202412)
                base_ym = prd_de
                if prd_se == "Q":
                    # 분기 형식 처리 (예: 2024Q1, 20241 등)
                    if len(prd_de) == 6 and prd_de[4] == "Q":  # 예: 2024Q1
                        year = prd_de[:4]
                        quarter = prd_de[5]
                        month_map = {"1": "03", "2": "06", "3": "09", "4": "12"}
                        base_ym = year + month_map.get(quarter, "03")
                    elif len(prd_de) == 5 and prd_de[4].isdigit():  # 예: 20241 (2024년 1분기)
                        year = prd_de[:4]
                        quarter = prd_de[4]
                        month_map = {"1": "03", "2": "06", "3": "09", "4": "12"}
                        base_ym = year + month_map.get(quarter, "03")
                # 이미 월별 데이터인 경우 (YYYYMM 형식) 그대로 사용
                
                # 동일 지역 이동 제외 (Sankey는 타 지역 간 이동만 의미 있음, same-region totals 저장 시 region_id 오류 유발)
                if c1 in code_to_region_id and c2 in code_to_region_id:
                    from_id = code_to_region_id[c1]
                    to_id = code_to_region_id[c2]
                    if from_id == to_id:
                        skipped_count += 1
                        continue
                    try:
                        count = int(dt)
                    except Exception:
                        count = 0
                    processed_data.append({
                        "base_ym": base_ym,
                        "from_region_id": from_id,
                        "to_region_id": to_id,
                        "movement_count": count
                    })
                else:
                    skipped_count += 1

            logger.info(f"   📦 데이터 처리 완료: {len(processed_data)}건 유효, {skipped_count}건 스킵")
            
            if len(processed_data) == 0:
                logger.warning(f"   ⚠️ 처리된 데이터가 없습니다. KOSIS API 응답을 확인하세요.")
                return {
                    "success": True,
                    "saved_count": 0,
                    "updated_count": 0,
                    "message": "처리된 데이터가 없습니다. KOSIS API 응답을 확인하세요."
                }

            # 기존 데이터 조회 (성능 최적화)
            logger.info(f"   🔍 기존 인구 이동 데이터 조회 중...")
            existing_result = await db.execute(
                select(PopulationMovement).where(
                    PopulationMovement.is_deleted == False
                )
            )
            existing_movements = existing_result.scalars().all()
            
            # 기존 데이터를 (base_ym, from_region_id, to_region_id) 튜플을 키로 하는 딕셔너리로 변환
            existing_map: Dict[tuple, PopulationMovement] = {}
            for movement in existing_movements:
                key = (movement.base_ym, movement.from_region_id, movement.to_region_id)
                existing_map[key] = movement
            
            logger.info(f"   📋 기존 인구 이동 데이터 {len(existing_map)}건 조회 완료")

            # 진행 상황 추적
            total_rows = len(processed_data)
            processed_rows = 0
            
            # Upsert Logic (기존 맵 사용하여 성능 최적화)
            for row in processed_data:
                processed_rows += 1
                if processed_rows % 100 == 0 or processed_rows == total_rows:
                    logger.info(f"   ⏳ 진행 중: {processed_rows}/{total_rows} 행 처리 중...")
                
                key = (row["base_ym"], row["from_region_id"], row["to_region_id"])
                
                if key in existing_map:
                    # 업데이트
                    existing = existing_map[key]
                    existing.movement_count = row["movement_count"]
                    existing.updated_at = datetime.utcnow()
                    updated_count += 1
                else:
                    # 새로 생성
                    new_movement = PopulationMovement(
                        base_ym=row["base_ym"],
                        from_region_id=row["from_region_id"],
                        to_region_id=row["to_region_id"],
                        movement_count=row["movement_count"]
                    )
                    db.add(new_movement)
                    saved_count += 1
            
            await db.commit()
            
            logger.info(f"✅ 인구 이동 데이터 저장 완료: 신규 {saved_count}건, 업데이트 {updated_count}건")
            
            return {
                "success": True,
                "saved_count": saved_count,
                "updated_count": updated_count
            }
            
        except Exception as e:
            await db.rollback()
            logger.error(f"❌ 인구 이동 데이터 저장 실패: {str(e)}", exc_info=True)
            raise
