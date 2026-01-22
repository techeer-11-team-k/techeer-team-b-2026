"""
데이터 수집 로깅 서비스

수집 성공/실패 결과를 구조화하여 data_logs 폴더에 저장합니다.
- 성공: 간략히 한 줄 (Docker 로그용)
- 실패: 상세하게 JSON 형식 (디버깅용)
"""
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from enum import Enum


class LogLevel(Enum):
    """로그 레벨"""
    SUCCESS = "SUCCESS"
    FAIL = "FAIL"
    WARNING = "WARNING"
    INFO = "INFO"


class TransactionType(Enum):
    """거래 유형"""
    SALE = "매매"
    RENT = "전월세"
    APARTMENT = "아파트"
    STATE = "지역"


class DataCollectionLogger:
    """
    데이터 수집 로깅 서비스
    
    로그 폴더 구조:
    data_logs/
    ├── collection/
    │   ├── sales/
    │   │   ├── success_YYYYMM.log
    │   │   └── fail_YYYYMM.log
    │   ├── rents/
    │   │   ├── success_YYYYMM.log
    │   │   └── fail_YYYYMM.log
    │   └── apartments/
    │       └── collection_YYYYMM.log
    ├── matching/
    │   ├── matched_YYYYMM.log
    │   └── unmatched_YYYYMM.log
    └── summary/
        └── daily_YYYYMMDD.log
    """
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if DataCollectionLogger._initialized:
            return
        
        self.logger = logging.getLogger("data_collection")
        self.logger.setLevel(logging.INFO)
        
        # 핸들러가 없으면 추가
        if not self.logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setLevel(logging.INFO)
            formatter = logging.Formatter(
                '%(asctime)s | %(levelname)s | %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.propagate = False
        
        # 로그 폴더 초기화
        self.log_base_path = self._get_log_base_path()
        self._ensure_log_directories()
        
        # 월별 로그 버퍼 (메모리에 모아서 한 번에 저장)
        self._success_buffer: Dict[str, List[Dict]] = {}
        self._fail_buffer: Dict[str, List[Dict]] = {}
        self._matched_buffer: Dict[str, List[Dict]] = {}
        self._unmatched_buffer: Dict[str, List[Dict]] = {}
        
        DataCollectionLogger._initialized = True
    
    def _get_log_base_path(self) -> Path:
        """로그 기본 경로 반환"""
        # 환경변수로 프로젝트 루트 지정
        project_root_env = os.environ.get("PROJECT_ROOT")
        if project_root_env:
            project_root = Path(project_root_env).resolve()
            if project_root.exists():
                return project_root / "data_logs"
        
        # Docker 환경
        current_file = Path(__file__).resolve()
        if str(current_file).startswith("/app"):
            return Path("/app/data_logs")
        
        # 로컬 개발 환경
        for parent in current_file.parents:
            if parent.name == "backend":
                return parent.parent / "data_logs"
        
        # fallback
        return Path.cwd() / "data_logs"
    
    def _ensure_log_directories(self):
        """로그 디렉토리 생성"""
        directories = [
            self.log_base_path / "collection" / "sales",
            self.log_base_path / "collection" / "rents",
            self.log_base_path / "collection" / "apartments",
            self.log_base_path / "matching",
            self.log_base_path / "summary",
        ]
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
    
    def _get_current_ym(self) -> str:
        """현재 연월 반환 (YYYYMM)"""
        return datetime.now().strftime("%Y%m")
    
    def _get_current_ymd(self) -> str:
        """현재 연월일 반환 (YYYYMMDD)"""
        return datetime.now().strftime("%Y%m%d")
    
    # =========================================================================
    # Docker 로그 출력 (간결)
    # =========================================================================
    
    def log_success(
        self,
        trans_type: TransactionType,
        sgg_cd: str,
        ym: str,
        saved_count: int,
        skipped_count: int = 0,
        sample_name: str = ""
    ):
        """
        성공 로그 출력 (Docker 로그용 - 간결)
        
        형식: [SUCCESS] {sgg_cd}/{ym} | {trans_type} | ✅저장:{count} | {sample_name}
        """
        ym_formatted = f"{ym[:4]}년 {int(ym[4:])}월" if len(ym) == 6 else ym
        msg = f"[SUCCESS] {sgg_cd}/{ym} ({ym_formatted}) | {trans_type.value} | ✅{saved_count}"
        if skipped_count > 0:
            msg += f" ⏭️{skipped_count}"
        if sample_name:
            msg += f" | {sample_name}"
        self.logger.info(msg)
    
    def log_fail(
        self,
        trans_type: TransactionType,
        sgg_cd: str,
        ym: str,
        error_count: int,
        reason: str = ""
    ):
        """
        실패 로그 출력 (Docker 로그용 - 간결)
        
        형식: [FAIL] {sgg_cd}/{ym} | {trans_type} | ❌{count} | {reason}
        """
        ym_formatted = f"{ym[:4]}년 {int(ym[4:])}월" if len(ym) == 6 else ym
        msg = f"[FAIL] {sgg_cd}/{ym} ({ym_formatted}) | {trans_type.value} | ❌{error_count}"
        if reason:
            msg += f" | {reason}"
        self.logger.warning(msg)
    
    def log_matching_fail_detail(
        self,
        trans_type: TransactionType,
        apt_name: str,
        reason: str,
        api_data: Dict[str, Any],
        matching_steps: List[Dict],
        candidates: List[str]
    ):
        """
        매칭 실패 상세 로그 출력 (Docker 로그용 - 디버그 정보 포함)
        
        형식:
        [MATCHING_FAIL] {trans_type} | {apt_name}
          위치: {sggCd}/{umdNm}/{jibun}
          원인: {reason}
          후보: {candidates[:3]}
          단계: {matching_steps}
        """
        sgg_cd = api_data.get("sggCd", "?")
        umd_nm = api_data.get("umdNm", "?")
        jibun = api_data.get("jibun", "?")
        
        self.logger.error(f"[MATCHING_FAIL] {trans_type.value} | {apt_name}")
        self.logger.error(f"  위치: {sgg_cd}/{umd_nm}/{jibun}")
        self.logger.error(f"  원인: {reason}")
        if candidates:
            self.logger.error(f"  후보: {', '.join(candidates[:5])}")
        
        # 매칭 단계 요약
        steps_summary = []
        for step in matching_steps:
            status = "✅" if step.get("success") else "❌"
            steps_summary.append(f"{status}{step.get('step', '?')}")
        if steps_summary:
            self.logger.error(f"  단계: {' → '.join(steps_summary)}")
    
    # =========================================================================
    # 파일 로그 저장 (구조화된 JSON)
    # =========================================================================
    
    def record_success(
        self,
        trans_type: TransactionType,
        ym: str,
        apt_id: int,
        apt_name_db: str,
        apt_name_api: str,
        matching_method: str,
        api_data: Optional[Dict] = None
    ):
        """성공 기록 추가 (버퍼에 저장)"""
        key = f"{trans_type.value}_{ym}"
        if key not in self._success_buffer:
            self._success_buffer[key] = []
        
        self._success_buffer[key].append({
            "timestamp": datetime.now().isoformat(),
            "apt_id": apt_id,
            "apt_name_db": apt_name_db,
            "apt_name_api": apt_name_api,
            "matching_method": matching_method,
            "api_data": api_data or {}
        })
    
    def record_fail(
        self,
        trans_type: TransactionType,
        ym: str,
        apt_name: str,
        reason: str,
        api_data: Dict[str, Any],
        matching_steps: List[Dict],
        candidates: List[str],
        suggestion: str = ""
    ):
        """실패 기록 추가 (버퍼에 저장)"""
        key = f"{trans_type.value}_{ym}"
        if key not in self._fail_buffer:
            self._fail_buffer[key] = []
        
        self._fail_buffer[key].append({
            "timestamp": datetime.now().isoformat(),
            "type": "MATCHING_FAIL",
            "trans_type": trans_type.value,
            "apt_name": apt_name,
            "reason": reason,
            "api_data": api_data,
            "matching_steps": matching_steps,
            "candidates": candidates[:10],
            "suggestion": suggestion
        })
    
    def save_logs(self, trans_type: TransactionType, ym: str):
        """버퍼에 있는 로그를 파일로 저장"""
        key = f"{trans_type.value}_{ym}"
        
        # 성공 로그 저장
        if key in self._success_buffer and self._success_buffer[key]:
            self._save_success_log(trans_type, ym, self._success_buffer[key])
            self._success_buffer[key] = []
        
        # 실패 로그 저장
        if key in self._fail_buffer and self._fail_buffer[key]:
            self._save_fail_log(trans_type, ym, self._fail_buffer[key])
            self._fail_buffer[key] = []
    
    def _save_success_log(
        self,
        trans_type: TransactionType,
        ym: str,
        records: List[Dict]
    ):
        """성공 로그 파일 저장"""
        try:
            if trans_type == TransactionType.SALE:
                log_path = self.log_base_path / "collection" / "sales" / f"success_{ym}.log"
            elif trans_type == TransactionType.RENT:
                log_path = self.log_base_path / "collection" / "rents" / f"success_{ym}.log"
            else:
                log_path = self.log_base_path / "collection" / "apartments" / f"success_{ym}.log"
            
            year = ym[:4]
            month = ym[4:6]
            header = f"===== {year}년 {month}월 {trans_type.value} 수집 성공 ({len(records)}건) ====="
            
            lines = [header, ""]
            
            # 매칭 방법별 그룹화
            by_method: Dict[str, List[Dict]] = {}
            for record in records:
                method = record.get("matching_method", "unknown")
                if method not in by_method:
                    by_method[method] = []
                by_method[method].append(record)
            
            for method, method_records in by_method.items():
                lines.append(f"--- {method} ({len(method_records)}건) ---")
                for r in method_records[:50]:  # 각 방법당 최대 50건
                    lines.append(f"  {r['apt_name_db']} ← {r['apt_name_api']}")
                if len(method_records) > 50:
                    lines.append(f"  ... 외 {len(method_records) - 50}건")
                lines.append("")
            
            # 기존 내용과 병합 (append 모드)
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write("\n".join(lines) + "\n")
            
            self.logger.info(f"✅ {trans_type.value} 성공 로그 저장: {log_path}")
        except Exception as e:
            self.logger.error(f"❌ 성공 로그 저장 실패: {e}")
    
    def _save_fail_log(
        self,
        trans_type: TransactionType,
        ym: str,
        records: List[Dict]
    ):
        """실패 로그 파일 저장 (JSON 형식)"""
        try:
            if trans_type == TransactionType.SALE:
                log_path = self.log_base_path / "collection" / "sales" / f"fail_{ym}.log"
            elif trans_type == TransactionType.RENT:
                log_path = self.log_base_path / "collection" / "rents" / f"fail_{ym}.log"
            else:
                log_path = self.log_base_path / "collection" / "apartments" / f"fail_{ym}.log"
            
            year = ym[:4]
            month = ym[4:6]
            header = f"===== {year}년 {month}월 {trans_type.value} 수집 실패 ({len(records)}건) ====="
            
            lines = [header, ""]
            
            for idx, record in enumerate(records, 1):
                lines.append(f"--- 실패 케이스 #{idx} ---")
                lines.append(json.dumps(record, ensure_ascii=False, indent=2))
                lines.append("")
            
            # 기존 내용과 병합 (append 모드)
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write("\n".join(lines) + "\n")
            
            self.logger.info(f"❌ {trans_type.value} 실패 로그 저장: {log_path} ({len(records)}건)")
        except Exception as e:
            self.logger.error(f"❌ 실패 로그 저장 실패: {e}")
    
    # =========================================================================
    # 일별 요약 로그
    # =========================================================================
    
    def save_daily_summary(
        self,
        trans_type: TransactionType,
        total_fetched: int,
        total_saved: int,
        total_skipped: int,
        total_errors: int,
        duration_seconds: float
    ):
        """일별 요약 로그 저장"""
        try:
            ymd = self._get_current_ymd()
            log_path = self.log_base_path / "summary" / f"daily_{ymd}.log"
            
            summary = {
                "timestamp": datetime.now().isoformat(),
                "trans_type": trans_type.value,
                "total_fetched": total_fetched,
                "total_saved": total_saved,
                "total_skipped": total_skipped,
                "total_errors": total_errors,
                "success_rate": round(total_saved / total_fetched * 100, 2) if total_fetched > 0 else 0,
                "duration_seconds": round(duration_seconds, 2)
            }
            
            # 기존 내용과 병합 (append 모드)
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(summary, ensure_ascii=False) + "\n")
            
            self.logger.info(f"📊 일별 요약 저장: {log_path}")
        except Exception as e:
            self.logger.error(f"❌ 일별 요약 저장 실패: {e}")


# 싱글톤 인스턴스
collection_logger = DataCollectionLogger()
