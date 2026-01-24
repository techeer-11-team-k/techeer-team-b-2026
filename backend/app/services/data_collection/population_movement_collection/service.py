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
        start_prd_de: str = "202401",
        end_prd_de: str = "202511"
    ) -> Dict[str, Any]:
        """
        KOSIS 통계청 API에서 인구 이동 데이터를 가져와서 저장
        
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
                "itmId": "T10+T20+T25+T30+T31+T32+T40+T50+",
                "objL1": "00+11+26+27+28+29+30+31+36+41+51+43+44+52+46+47+48+50+",
                "objL2": "",
                "objL3": "",
                "objL4": "",
                "objL5": "",
                "objL6": "",
                "objL7": "",
                "objL8": "",
                "format": "json",
                "jsonVD": "Y",
                "prdSe": "M",
                "startPrdDe": start_prd_de,
                "endPrdDe": end_prd_de,
                "orgId": "101",
                "tblId": "DT_1B26001_A01"
            }
            
            # API URL과 파라미터 로그 출력 (민감 정보 제외)
            safe_params = {k: (v if k != "apiKey" else "***") for k, v in params.items()}
            logger.info(f"📡 KOSIS API 호출 시작: {start_prd_de} ~ {end_prd_de}")
            logger.info(f"   🌐 API URL: {kosis_url}")
            logger.info(f"   📋 API 파라미터: {safe_params}")
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                # 실제 호출될 URL 생성 (디버깅용)
                from urllib.parse import urlencode
                actual_url = f"{kosis_url}?{urlencode(params)}"
                logger.info(f"   🔗 실제 API 호출 URL: {actual_url[:200]}...")  # URL이 길 수 있으므로 처음 200자만
                
                response = await client.get(kosis_url, params=params)
                
                # HTTP 상태 코드 확인
                logger.info(f"   📊 HTTP 응답 상태: {response.status_code}")
                
                response.raise_for_status()
                raw_data = response.json()
                
                # 응답 내용 확인
                logger.info(f"   📦 응답 데이터 타입: {type(raw_data)}")
            
            # KOSIS API 응답 구조 처리
            # 응답이 dict인 경우 내부에서 리스트 찾기
            if isinstance(raw_data, dict):
                logger.info(f"   📋 API 응답 타입: dict, 키 목록: {list(raw_data.keys())}")
                
                # 오류 응답 확인
                if "err" in raw_data or "errMsg" in raw_data:
                    err_code = raw_data.get("err", "N/A")
                    err_msg = raw_data.get("errMsg", "N/A")
                    logger.error(f"   ❌ KOSIS API 오류 응답: err={err_code}, errMsg={err_msg}")
                    raise ValueError(f"KOSIS API 오류: {err_code} - {err_msg}")
                
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
                        # 디버깅: raw_data의 일부 출력
                        logger.debug(f"   🔍 raw_data 내용 샘플: {str(raw_data)[:500]}")
                        data = []
            elif isinstance(raw_data, list):
                data = raw_data
            else:
                logger.warning(f"   ⚠️ 예상치 못한 응답 타입: {type(raw_data)}")
                data = []
            
            data_count = len(data) if isinstance(data, list) else 0
            logger.info(f"✅ KOSIS API 호출 성공: {data_count}건의 데이터 수신")
            
            # 데이터 타입 및 샘플 확인
            if isinstance(data, list) and len(data) > 0:
                sample_item = data[0]
                logger.info(f"   📊 데이터 샘플: C1={sample_item.get('C1')}, C1_NM={sample_item.get('C1_NM')}, ITM_ID={sample_item.get('ITM_ID')}, PRD_DE={sample_item.get('PRD_DE')}")
            else:
                logger.warning(f"   ⚠️ 데이터가 리스트가 아니거나 비어있음: type={type(data)}, len={len(data) if isinstance(data, list) else 'N/A'}")
            
            # 데이터 파싱 및 저장
            saved_count = 0
            updated_count = 0
            
            # C1 코드와 지역명 매핑 (KOSIS 지역 코드)
            # 00=전국, 11=서울, 26=부산, 27=대구, 28=인천, 29=광주, 30=대전, 31=울산
            # 36=세종, 41=경기, 51=강원, 43=충북, 44=충남, 52=전북, 46=전남, 47=경북, 48=경남, 50=제주
            
            # 시도 레벨 데이터만 저장: 각 시도별로 대표 region_id 하나만 선택
            city_map = {
                "서울특별시": "11", "부산광역시": "26", "대구광역시": "27", "인천광역시": "28",
                "광주광역시": "29", "대전광역시": "30", "울산광역시": "31", "세종특별자치시": "36",
                "경기도": "41", "강원특별자치도": "51", "충청북도": "43", "충청남도": "44",
                "전북특별자치도": "52", "전라남도": "46", "경상북도": "47", "경상남도": "48", "제주특별자치도": "50"
            }
            
            # 각 시도별로 첫 번째 region_id만 선택 (시도 레벨 집계용)
            states_result = await db.execute(select(State).where(State.is_deleted == False))
            states_list = states_result.scalars().all()
            
            logger.info(f"   📍 DB에서 조회된 지역 수: {len(states_list)}개")
            
            # 각 시도별로 가장 작은 region_id 하나만 선택
            region_code_map: Dict[str, List[int]] = {}
            for state in states_list:
                if state.city_name in city_map:
                    code = city_map[state.city_name]
                    if code not in region_code_map:
                        # 각 시도별로 첫 번째 region_id만 저장 (시도 레벨 집계)
                        region_code_map[code] = [state.region_id]
            
            logger.info(f"   🔗 시도 레벨 매핑 생성: {len(region_code_map)}개 시도 (각 시도당 1개 region_id)")
            for code, region_ids in sorted(region_code_map.items()):
                logger.info(f"      C1={code}: region_id={region_ids[0]} (시도 레벨 집계)")
            
            # 데이터를 PRD_DE(기간)와 C1(지역)별로 그룹화
            grouped_data: Dict[str, Dict[str, Dict[str, int]]] = {}  # {PRD_DE: {C1: {ITM_ID: DT}}}
            c1_codes_in_data = set()
            prd_des_in_data = set()
            
            if isinstance(data, list):
                processed_count = 0
                for item in data:
                    prd_de = item.get("PRD_DE", "")
                    c1 = item.get("C1", "")
                    itm_id = item.get("ITM_ID", "")
                    dt_str = item.get("DT", "0")
                    
                    if c1:
                        c1_codes_in_data.add(c1)
                    if prd_de:
                        prd_des_in_data.add(prd_de)
                    
                    try:
                        dt_value = int(dt_str) if dt_str else 0
                    except (ValueError, TypeError):
                        dt_value = 0
                    
                    if prd_de and c1 and itm_id:
                        if prd_de not in grouped_data:
                            grouped_data[prd_de] = {}
                        if c1 not in grouped_data[prd_de]:
                            grouped_data[prd_de][c1] = {}
                        grouped_data[prd_de][c1][itm_id] = dt_value
                        processed_count += 1
                
                logger.info(f"   📦 데이터 그룹화 완료: {processed_count}건 처리, {len(prd_des_in_data)}개 기간, {len(c1_codes_in_data)}개 지역 코드")
                logger.info(f"      지역 코드 목록: {sorted(c1_codes_in_data)}")
            else:
                logger.warning(f"   ⚠️ 데이터가 리스트가 아님: type={type(data)}")
            
            # 기존 데이터를 한 번에 조회 (성능 최적화)
            logger.info(f"   🔍 기존 데이터 조회 중...")
            existing_result = await db.execute(
                select(PopulationMovement).where(
                    PopulationMovement.is_deleted == False
                )
            )
            existing_movements = existing_result.scalars().all()
            
            # 기존 데이터를 (region_id, base_ym) 튜플을 키로 하는 딕셔너리로 변환
            existing_map: Dict[tuple, PopulationMovement] = {}
            for movement in existing_movements:
                key = (movement.region_id, movement.base_ym)
                existing_map[key] = movement
            
            logger.info(f"   📋 기존 데이터 {len(existing_map)}건 조회 완료")
            
            # 각 지역별로 데이터 저장 (C1="00" 전국 데이터는 제외)
            matched_regions_count = 0
            skipped_no_match_count = 0
            total_operations = 0
            
            # 진행 상황 추적
            total_prd_de_count = len([prd_de for prd_de, regions in grouped_data.items() if any(c1 != "00" for c1 in regions.keys())])
            processed_prd_de_count = 0
            
            for prd_de, regions in grouped_data.items():
                processed_prd_de_count += 1
                if processed_prd_de_count % 10 == 0 or processed_prd_de_count == total_prd_de_count:
                    logger.info(f"   ⏳ 진행 중: {processed_prd_de_count}/{total_prd_de_count} 기간 처리 중... (현재: {prd_de})")
                
                for c1_code, items in regions.items():
                    # C1="00" (전국) 데이터는 스킵
                    if c1_code == "00":
                        continue
                    
                    # 순이동 계산: T25(순이동)를 우선 사용, 없으면 T10(총전입) - T20(총전출)
                    # T25=순이동, T10=총전입, T20=총전출
                    if "T25" in items:
                        # T25가 있으면 직접 사용
                        net_migration = items.get("T25", 0)
                        # 전입/전출은 T10, T20 사용 (없으면 0)
                        in_migration = items.get("T10", 0)
                        out_migration = items.get("T20", 0)
                    else:
                        # T25가 없으면 계산
                        in_migration = items.get("T10", 0)
                        out_migration = items.get("T20", 0)
                        net_migration = in_migration - out_migration
                    
                    # 해당 지역 코드에 매핑된 region_id들 찾기
                    if c1_code in region_code_map:
                        matched_regions_count += len(region_code_map[c1_code])
                        for region_id in region_code_map[c1_code]:
                            total_operations += 1
                            key = (region_id, prd_de)
                            
                            if key in existing_map:
                                # 업데이트
                                existing_data = existing_map[key]
                                existing_data.in_migration = in_migration
                                existing_data.out_migration = out_migration
                                existing_data.net_migration = net_migration
                                existing_data.updated_at = datetime.utcnow()
                                updated_count += 1
                            else:
                                # 새로 생성
                                new_movement = PopulationMovement(
                                    region_id=region_id,
                                    base_ym=prd_de,
                                    in_migration=in_migration,
                                    out_migration=out_migration,
                                    net_migration=net_migration,
                                    movement_type="TOTAL",
                                    data_source="KOSIS"
                                )
                                db.add(new_movement)
                                saved_count += 1
                    else:
                        skipped_no_match_count += 1
            
            logger.info(f"   💾 저장 준비 완료: 총 {total_operations}개 작업 (신규 {saved_count}건, 업데이트 {updated_count}건 예정)")
            logger.info(f"   📊 매칭 통계: 매칭된 지역 {matched_regions_count}개, 매핑 실패 {skipped_no_match_count}개")
            
            await db.commit()
            
            logger.info(f"✅ 인구 이동 데이터 저장 완료: 신규 {saved_count}건, 업데이트 {updated_count}건")
            
            return {
                "success": True,
                "message": f"인구 이동 데이터 저장 완료: 신규 {saved_count}건, 업데이트 {updated_count}건",
                "saved_count": saved_count,
                "updated_count": updated_count,
                "period": f"{start_prd_de} ~ {end_prd_de}"
            }
            
        except Exception as e:
            await db.rollback()
            logger.error(f"❌ 인구 이동 데이터 저장 실패: {str(e)}", exc_info=True)
            raise

    async def collect_population_movement_matrix(
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
        
        from app.models.population_movement_matrix import PopulationMovementMatrix
        
        try:
            # KOSIS API 호출
            kosis_url = "https://kosis.kr/openapi/Param/statisticsParameterData.do"
            params = {
                "method": "getList",
                "apiKey": settings.KOSIS_API_KEY,
                "itmId": "T70+",  # 이동자수
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
                "prdSe": "M",     # 월별
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
            
            # 데이터 파싱
            data = []
            if isinstance(raw_data, list):
                data = raw_data
            elif isinstance(raw_data, dict):
                # 구조에 따라 데이터 추출 (이전 메서드와 유사한 로직)
                if "StatisticSearch" in raw_data and "row" in raw_data["StatisticSearch"]:
                    data = raw_data["StatisticSearch"]["row"]
                elif "data" in raw_data:
                    data = raw_data["data"]
            
            if not isinstance(data, list):
                logger.warning(f"   ⚠️ 데이터가 리스트가 아님: type={type(data)}")
                data = []
                
            logger.info(f"✅ KOSIS Matrix API 호출 성공: {len(data)}건의 데이터 수신")
            
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
                
                # 전국(00) 데이터는 제외 (순수 지역간 이동만)
                if c1 == "00" or c2 == "00":
                    continue
                
                # 동일 지역 이동 제외 (옵션, 일단 포함할 수도 있으나 Sankey에서는 보통 제외하거나 Loop로 표시)
                # 사용자가 "지역별 구별되는 색"을 원하므로 타 지역 이동이 중요
                
                if c1 in code_to_region_id and c2 in code_to_region_id:
                    from_id = code_to_region_id[c1]
                    to_id = code_to_region_id[c2]
                    try:
                        count = int(dt)
                    except:
                        count = 0
                    
                    processed_data.append({
                        "base_ym": prd_de,
                        "from_region_id": from_id,
                        "to_region_id": to_id,
                        "movement_count": count
                    })
                else:
                    skipped_count += 1

            logger.info(f"   📦 데이터 처리 완료: {len(processed_data)}건 유효, {skipped_count}건 스킵")

            # Upsert Logic (Delete existing for the period then Insert, or Check and Update)
            # Considering volume, deleting for the specific months and re-inserting might be cleaner 
            # but let's try to update individually or bulk insert if empty.
            
            # For simplicity and robustness, let's use merge (upsert) logic
            for row in processed_data:
                # Check exist
                stmt = select(PopulationMovementMatrix).where(
                    and_(
                        PopulationMovementMatrix.base_ym == row["base_ym"],
                        PopulationMovementMatrix.from_region_id == row["from_region_id"],
                        PopulationMovementMatrix.to_region_id == row["to_region_id"]
                    )
                )
                result = await db.execute(stmt)
                existing = result.scalar_one_or_none()
                
                if existing:
                    existing.movement_count = row["movement_count"]
                    existing.updated_at = datetime.utcnow()
                    updated_count += 1
                else:
                    new_matrix = PopulationMovementMatrix(
                        base_ym=row["base_ym"],
                        from_region_id=row["from_region_id"],
                        to_region_id=row["to_region_id"],
                        movement_count=row["movement_count"]
                    )
                    db.add(new_matrix)
                    saved_count += 1
            
            await db.commit()
            
            logger.info(f"✅ 인구 이동 매트릭스 저장 완료: 신규 {saved_count}건, 업데이트 {updated_count}건")
            
            return {
                "success": True,
                "saved_count": saved_count,
                "updated_count": updated_count
            }
            
        except Exception as e:
            await db.rollback()
            logger.error(f"❌ 인구 이동 매트릭스 저장 실패: {str(e)}", exc_info=True)
            raise
