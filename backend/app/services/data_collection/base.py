"""
데이터 수집 서비스 기본 클래스

공통 메서드와 로깅 기능을 제공합니다.
"""
import logging
import sys
import os
from pathlib import Path
from typing import Dict, Optional
import httpx
import asyncio

from app.core.config import settings

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


class DataCollectionServiceBase:
    """
    데이터 수집 서비스 기본 클래스
    
    공통 메서드와 로깅 기능을 제공합니다.
    """
    
    # HTTP 클라이언트 풀 (재사용으로 속도 향상)
    _http_client: Optional[httpx.AsyncClient] = None
    
    # 아파트 매칭 로그 (월별로 관리: YYYYMM -> {apt_id -> set of API에서 받은 아파트명})
    _apt_matching_log_by_month: Dict[str, Dict[int, set]] = {}
    _apt_name_map_by_month: Dict[str, Dict[int, str]] = {}  # 월별 apt_id -> DB 아파트명
    
    # 아파트 매칭 실패 로그 (월별로 관리: YYYYMM -> List[Dict])
    _apt_fail_log_by_month: Dict[str, list] = {}
    
    # 아파트 매칭 성공 로그 (월별로 관리: YYYYMM -> List[Dict]) - 주소+지번 매칭 성공 케이스
    _apt_success_log_by_month: Dict[str, list] = {}
    
    # CSV 파일 경로 캐싱 (house_score_collection용)
    _csv_path_checked: bool = False
    _csv_path_cache: Optional[Path] = None
    
    def __init__(self):
        """서비스 초기화"""
        if not settings.MOLIT_API_KEY:
            raise ValueError("MOLIT_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
        self.api_key = settings.MOLIT_API_KEY
        # 매칭 로그 초기화 (월별 관리)
        self._apt_matching_log_by_month = {}
        self._apt_name_map_by_month = {}
        # 매칭 실패 로그 초기화 (월별 관리)
        self._apt_fail_log_by_month = {}
        # 매칭 성공 로그 초기화 (월별 관리) - 주소+지번 매칭 성공 케이스
        self._apt_success_log_by_month = {}
        # CSV 경로 캐시 초기화
        self._csv_path_checked = False
        self._csv_path_cache = None
    
    @staticmethod
    def _get_project_root() -> Path:
        """
        프로젝트 루트 경로 반환
        
        Docker 컨테이너 내에서는 WORKDIR이 /app이므로,
        현재 파일 경로를 기준으로 프로젝트 루트를 찾습니다.
        """
        # 방법 1: 환경변수로 프로젝트 루트 지정 (가장 우선)
        project_root_env = os.environ.get("PROJECT_ROOT")
        if project_root_env:
            project_root = Path(project_root_env).resolve()
            if project_root.exists():
                return project_root
        
        # 현재 파일 경로 가져오기
        current_file = Path(__file__).resolve()
        
        # 방법 2: Docker 환경 - /app으로 시작하는 경로인 경우
        if str(current_file).startswith("/app"):
            if current_file.parts[0] == "/" and current_file.parts[1] == "app":
                project_root = Path("/app")
                if project_root.exists():
                    return project_root
                for parent in current_file.parents:
                    if str(parent) == "/app" and parent.exists():
                        return parent
        
        # 방법 3: backend 폴더 찾기 (로컬 개발 환경)
        for parent in current_file.parents:
            if parent.name == "backend":
                project_root = parent.parent
                if project_root.exists():
                    return project_root
        
        # 방법 4: 상위 디렉토리에서 db_backup 찾기
        for parent in current_file.parents:
            if (parent / "db_backup").exists():
                return parent
        
        # 방법 5: 현재 작업 디렉토리 사용
        cwd = Path.cwd()
        if str(cwd) != "/" and cwd.exists():
            return cwd
        
        # 최종 fallback: /app (Docker 기본값)
        docker_root = Path("/app")
        if docker_root.exists():
            return docker_root
        
        # 모든 방법 실패 시 에러
        raise FileNotFoundError("프로젝트 루트를 찾을 수 없습니다. 모든 탐색 방법 실패.")
    
    def _record_apt_matching(self, apt_id: int, apt_name_db: str, apt_name_api: str, ym: str,
                             matching_method: str = None):
        """
        아파트 매칭 기록 추가 (월별 관리)
        
        Args:
            apt_id: 매칭된 아파트 ID
            apt_name_db: DB의 아파트명
            apt_name_api: API의 아파트명
            ym: 거래 발생 월 (YYYYMM)
            matching_method: 매칭 방법 (예: 'address_jibun', 'name_matching', 'sgg_dong_code')
        """
        if ym not in self._apt_matching_log_by_month:
            self._apt_matching_log_by_month[ym] = {}
            self._apt_name_map_by_month[ym] = {}
        
        if apt_id not in self._apt_matching_log_by_month[ym]:
            self._apt_matching_log_by_month[ym][apt_id] = {
                'api_names': set(),
                'matching_methods': set()
            }
            self._apt_name_map_by_month[ym][apt_id] = apt_name_db
        
        # 기존 형식 호환성 유지 (set인 경우 dict로 변환)
        if isinstance(self._apt_matching_log_by_month[ym][apt_id], set):
            old_set = self._apt_matching_log_by_month[ym][apt_id]
            self._apt_matching_log_by_month[ym][apt_id] = {
                'api_names': old_set.copy(),
                'matching_methods': set()
            }
        
        self._apt_matching_log_by_month[ym][apt_id]['api_names'].add(apt_name_api)
        if matching_method:
            self._apt_matching_log_by_month[ym][apt_id]['matching_methods'].add(matching_method)
    
    def _save_apt_matching_log(self, current_ym: str):
        """
        아파트 매칭 로그를 구조화된 형식으로 저장
        
        LLM과 컴퓨터 시스템이 성공 원인을 쉽게 파악할 수 있도록 구조화된 형식으로 저장합니다.
        """
        matching_log = self._apt_matching_log_by_month.get(current_ym, {})
        name_map = self._apt_name_map_by_month.get(current_ym, {})
        
        if not matching_log:
            return
        
        try:
            project_root = self._get_project_root()
            log_dir = project_root / "db_backup"
            log_path = log_dir / f"apart_{current_ym}.log"
            
            log_dir.mkdir(parents=True, exist_ok=True)
            
            year = current_ym[:4]
            month = current_ym[4:6]
            total_matched = len(matching_log)
            header = f"===== {year}년 {month}월 수집 기준 (총 {total_matched}개 아파트 매칭 성공) ====="
            
            lines = [header, ""]
            
            sorted_items = sorted(
                matching_log.items(),
                key=lambda x: name_map.get(x[0], "")
            )
            
            for apt_id, log_data in sorted_items:
                db_name = name_map.get(apt_id, f"ID:{apt_id}")
                
                # 기존 형식 호환성 유지
                if isinstance(log_data, dict):
                    api_names = log_data.get('api_names', set())
                    matching_methods = log_data.get('matching_methods', set())
                else:
                    # 기존 형식 (set)
                    api_names = log_data
                    matching_methods = set()
                
                api_names_str = ", ".join(sorted(api_names))
                
                # 매칭 방법 정보 추가
                if matching_methods:
                    methods_str = ", ".join(sorted(matching_methods))
                    lines.append(f"{db_name} - {api_names_str} [매칭방법: {methods_str}]")
                else:
                    lines.append(f"{db_name} - {api_names_str}")
            
            with open(log_path, 'w', encoding='utf-8') as f:
                f.write("\n".join(lines))
            
            logger.info(f" 아파트 매칭 로그 저장 완료: {log_path} ({total_matched}개 아파트)")
        except Exception as e:
            logger.error(f" 아파트 매칭 로그 저장 실패: {e}", exc_info=True)
    
    def _record_apt_fail(self, trans_type: str, apt_name: str, jibun: str, build_year: str, 
                         umd_nm: str, sgg_cd: str, ym: str, reason: str,
                         normalized_name: str = None, candidates: list = None, 
                         local_apts: list = None, sgg_code_matched: bool = False,
                         dong_matched: bool = False, region_name: str = None,
                         full_region_code: str = None, matching_steps: list = None,
                         api_response_data: dict = None):
        """
        아파트 매칭 실패 기록 추가 (월별 관리)
        
        Args:
            matching_steps: 매칭 단계별 시도 정보 리스트
                예: [
                    {'step': 'address_jibun', 'attempted': True, 'success': False, 'reason': '법정동코드 불일치'},
                    {'step': 'sgg_dong_code', 'attempted': True, 'success': True, 'candidates': 5},
                    {'step': 'name_matching', 'attempted': True, 'success': False, 'reason': '유사도 부족'}
                ]
            api_response_data: API 응답 원본 데이터 (dict 형태)
                예: {'aptNm': '금호', 'jibun': '553', 'buildYear': '1998', ...}
        """
        if ym not in self._apt_fail_log_by_month:
            self._apt_fail_log_by_month[ym] = []
        
        candidate_names = []
        candidate_details = []
        if candidates:
            candidate_names = [apt.apt_name for apt in candidates[:10]]
            candidate_details = [
                {
                    'apt_id': apt.apt_id,
                    'apt_name': apt.apt_name,
                    'region_id': apt.region_id if hasattr(apt, 'region_id') else None
                }
                for apt in candidates[:10]
            ]
        elif local_apts:
            candidate_names = [apt.apt_name for apt in local_apts[:10]]
            candidate_details = [
                {
                    'apt_id': apt.apt_id,
                    'apt_name': apt.apt_name,
                    'region_id': apt.region_id if hasattr(apt, 'region_id') else None
                }
                for apt in local_apts[:10]
            ]
        
        total_candidates = len(local_apts) if local_apts else 0
        filtered_candidates = len(candidates) if candidates else 0
        
        # 매칭 단계별 정보 정리
        matching_steps_info = matching_steps or []
        
        self._apt_fail_log_by_month[ym].append({
            'type': trans_type,
            'apt_name': apt_name,
            'normalized_name': normalized_name or '',
            'jibun': jibun or '',
            'bonbun': None,  # 추후 추가 가능
            'bubun': None,   # 추후 추가 가능
            'build_year': build_year or '',
            'umd_nm': umd_nm or '',
            'region_name': region_name or '',
            'sgg_cd': sgg_cd,
            'full_region_code': full_region_code or '',
            'sgg_code_matched': sgg_code_matched,
            'dong_matched': dong_matched,
            'total_candidates': total_candidates,
            'filtered_candidates': filtered_candidates,
            'candidate_names': candidate_names,
            'candidate_details': candidate_details,
            'matching_steps': matching_steps_info,
            'api_response_data': api_response_data or {},
            'ym': ym,
            'reason': reason
        })
    
    def _save_apt_fail_log(self, current_ym: str):
        """
        아파트 매칭 실패 로그를 구조화된 형식으로 저장
        
        LLM과 컴퓨터 시스템이 원인을 쉽게 파악할 수 있도록 구조화된 형식으로 저장합니다.
        """
        fail_log = self._apt_fail_log_by_month.get(current_ym, [])
        
        if not fail_log:
            return
        
        try:
            project_root = self._get_project_root()
            log_dir = project_root / "db_backup"
            log_path = log_dir / f"apartfail_{current_ym}.log"
            
            log_dir.mkdir(parents=True, exist_ok=True)
            
            year = current_ym[:4]
            month = current_ym[4:6]
            header = f"===== {year}년 {month}월 수집 기준 (총 {len(fail_log)}건 실패) ====="
            
            lines = [header, ""]
            sorted_fails = sorted(fail_log, key=lambda x: (x['type'], x['reason'], x['apt_name']))
            
            for idx, fail in enumerate(sorted_fails, 1):
                # 기본 정보 섹션
                lines.append(f"--- 실패 케이스 #{idx} ---")
                lines.append(f"거래유형: {fail['type']}")
                lines.append(f"아파트명(API): {fail['apt_name']}")
                if fail.get('normalized_name'):
                    lines.append(f"정규화명: {fail['normalized_name']}")
                
                # 위치 정보 섹션
                lines.append("위치정보:")
                if fail.get('region_name'):
                    lines.append(f"  지역: {fail['region_name']}")
                if fail.get('umd_nm'):
                    lines.append(f"  동: {fail['umd_nm']}")
                if fail.get('sgg_cd'):
                    lines.append(f"  시군구코드: {fail['sgg_cd']}")
                if fail.get('full_region_code'):
                    lines.append(f"  법정동코드(10자리): {fail['full_region_code']}")
                if fail.get('jibun'):
                    lines.append(f"  지번: {fail['jibun']}")
                if fail.get('build_year'):
                    lines.append(f"  건축년도: {fail['build_year']}")
                
                # 매칭 단계별 정보 섹션
                if fail.get('matching_steps'):
                    lines.append("매칭단계:")
                    for step in fail['matching_steps']:
                        step_name = step.get('step', 'unknown')
                        attempted = step.get('attempted', False)
                        success = step.get('success', False)
                        reason = step.get('reason', '')
                        candidates_count = step.get('candidates', 0)
                        
                        status = " 성공" if success else " 실패" if attempted else "⏭ 미시도"
                        step_line = f"  [{status}] {step_name}"
                        if candidates_count > 0:
                            step_line += f" (후보: {candidates_count}개)"
                        if reason:
                            step_line += f" - {reason}"
                        lines.append(step_line)
                else:
                    # 기존 방식 호환성 유지
                    lines.append("매칭단계:")
                    if fail.get('sgg_code_matched'):
                        lines.append("  [ 성공] 시군구코드 매칭")
                    if fail.get('dong_matched'):
                        lines.append("  [ 성공] 동 매칭")
                    lines.append("  [ 실패] 이름 매칭")
                
                # 후보군 정보 섹션
                lines.append("후보군정보:")
                lines.append(f"  전체후보: {fail.get('total_candidates', 0)}개")
                lines.append(f"  필터링후: {fail.get('filtered_candidates', 0)}개")
                
                if fail.get('candidate_names'):
                    lines.append(f"  후보명(상위10개): {', '.join(fail['candidate_names'])}")
                elif fail.get('candidate_details'):
                    candidate_names = [c['apt_name'] for c in fail['candidate_details'][:10]]
                    lines.append(f"  후보명(상위10개): {', '.join(candidate_names)}")
                
                # 실패 원인 섹션
                lines.append(f"실패원인: {fail['reason']}")
                
                # API 응답 원본 데이터 섹션
                if fail.get('api_response_data'):
                    lines.append("API응답원본:")
                    api_data = fail['api_response_data']
                    # 주요 필드만 추출하여 표시
                    important_fields = [
                        'aptNm', 'aptSeq', 'jibun', 'bonbun', 'bubun', 
                        'buildYear', 'umdNm', 'umdCd', 'sggCd',
                        'dealYear', 'dealMonth', 'dealDay',
                        'roadnm', 'roadnmbcd', 'roadnmbonbun', 'roadnmbubun'
                    ]
                    for field in important_fields:
                        if field in api_data and api_data[field]:
                            value = api_data[field]
                            # 값이 너무 길면 잘라서 표시
                            if isinstance(value, str) and len(value) > 100:
                                value = value[:100] + "..."
                            lines.append(f"  {field}: {value}")
                    
                    # 나머지 필드가 있으면 요약
                    other_fields = [k for k in api_data.keys() if k not in important_fields and api_data[k]]
                    if other_fields:
                        lines.append(f"  기타필드: {', '.join(other_fields)}")
                
                # 구분선
                lines.append("")
            
            with open(log_path, 'w', encoding='utf-8') as f:
                f.write("\n".join(lines))
            
            logger.info(f" 아파트 매칭 실패 로그 저장 완료: {log_path} ({len(fail_log)}건)")
        except Exception as e:
            logger.error(f" 아파트 매칭 실패 로그 저장 실패: {e}", exc_info=True)
    
    def _record_apt_success(self, trans_type: str, full_region_code: str, jibun: str, 
                            apt_name: str, ym: str):
        """아파트 매칭 성공 기록 추가 (주소+지번 매칭 성공 케이스, 월별 관리)"""
        if ym not in self._apt_success_log_by_month:
            self._apt_success_log_by_month[ym] = []
        
        self._apt_success_log_by_month[ym].append({
            'type': trans_type,
            'full_region_code': full_region_code,
            'jibun': jibun,
            'apt_name': apt_name,
            'ym': ym
        })
    
    def _save_apt_success_log(self, current_ym: str):
        """아파트 매칭 성공 로그를 파일로 저장 (주소+지번 매칭 성공 케이스)"""
        success_log = self._apt_success_log_by_month.get(current_ym, [])
        
        if not success_log:
            return
        
        try:
            project_root = self._get_project_root()
            log_dir = project_root / "db_backup"
            log_path = log_dir / f"apartsuccess_{current_ym}.log"
            
            log_dir.mkdir(parents=True, exist_ok=True)
            
            year = current_ym[:4]
            month = current_ym[4:6]
            header = f"===== {year}년 {month}월 수집 기준 ====="
            
            lines = [header, ""]
            sorted_success = sorted(success_log, key=lambda x: (x['type'], x['apt_name']))
            
            for success in sorted_success:
                lines.append(
                    f"[{success['type']}] 법정동코드={success['full_region_code']}, "
                    f"지번={success['jibun']}, 아파트={success['apt_name']}"
                )
            
            with open(log_path, 'w', encoding='utf-8') as f:
                f.write("\n".join(lines))
            
            logger.info(f" 아파트 매칭 성공 로그 저장 완료: {log_path}")
        except Exception as e:
            logger.error(f" 아파트 매칭 성공 로그 저장 실패: {e}", exc_info=True)
    
    def _get_http_client(self) -> httpx.AsyncClient:
        """HTTP 클라이언트 풀 반환"""
        if self._http_client is None:
            limits = httpx.Limits(max_keepalive_connections=50, max_connections=100)
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(15.0, connect=5.0),
                limits=limits,
                http2=False
            )
        return self._http_client
    
    async def _close_http_client(self):
        """HTTP 클라이언트 종료"""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
    
    async def fetch_with_retry(self, url: str, params: Dict, retries: int = 3) -> Dict:
        """API 호출 재시도 로직"""
        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(url, params=params)
                    response.raise_for_status()
                    return response.json()
            except httpx.TimeoutException:
                if attempt == retries - 1:
                    raise
                await asyncio.sleep(0.5 * (2 ** attempt))
            except Exception as e:
                if attempt == retries - 1:
                    raise
                await asyncio.sleep(0.5 * (2 ** attempt))
        return {}
