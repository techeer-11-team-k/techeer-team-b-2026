"""
아파트 매칭 알고리즘

 최우선 원칙: Zero False Positive
- "미매칭(No Match)은 허용되지만, 오매칭(Mismatch)은 절대 발생해서는 안 된다."
- 모호한 경우 과감히 매칭을 포기(Drop)하는 보수적인 알고리즘
"""
import logging
import re
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass

from .constants import (
    BRAND_DICT,
    BRAND_KEYWORD_TO_STANDARD,
    BUILD_YEAR_TOLERANCE,
    MATCHING_SCORE_THRESHOLD,
    AMBIGUOUS_MATCH_DIFF,
    SCORE_BUNJI_FULL_MATCH,
    SCORE_BUNJI_PARTIAL_MATCH,
    SCORE_NAME_SIMILARITY_MAX,
    SCORE_METADATA_MATCH,
)
from .preprocessing import (
    get_apt_processor,
    get_dong_processor,
    BunjiProcessor,
    calculate_similarity,
    token_set_similarity,
)

logger = logging.getLogger(__name__)


@dataclass
class MatchResult:
    """매칭 결과"""
    matched: bool
    apartment_id: Optional[int] = None
    apartment_name: Optional[str] = None
    score: float = 0.0
    reason: str = ""
    veto_reason: Optional[str] = None  # Veto된 경우 사유
    candidates_count: int = 0
    filtered_count: int = 0
    candidate_names: List[str] = None
    
    def __post_init__(self):
        if self.candidate_names is None:
            self.candidate_names = []


class VetoChecker:
    """
    Veto (거부) 조건 검사기
    
     Veto Conditions - 오매칭 방지를 위한 철벽 방어
    1. 단지/차수 불일치 (Explicit Mismatch)
    2. 브랜드 그룹 불일치
    3. 건축년도 과다 차이 (3년 초과)
    4. 지번 불일치 (이름 유사도만 높은 경우)
    """
    
    @staticmethod
    def check_block_mismatch(api_block: Optional[int], db_block: Optional[int]) -> Optional[str]:
        """
        단지 번호 불일치 검사
        
        - 둘 다 값이 있는데 다르면 → VETO
        - 한쪽만 있으면 → None (감점 처리)
        """
        if api_block is not None and db_block is not None:
            if api_block != db_block:
                return f"단지번호 불일치: API={api_block}단지, DB={db_block}단지"
        return None
    
    @staticmethod
    def check_series_mismatch(api_series: Optional[int], db_series: Optional[int]) -> Optional[str]:
        """
        차수 불일치 검사
        
        - 둘 다 값이 있는데 다르면 → VETO
        - 한쪽만 있으면 → None (감점 처리)
        """
        if api_series is not None and db_series is not None:
            if api_series != db_series:
                return f"차수 불일치: API={api_series}차, DB={db_series}차"
        return None
    
    @staticmethod
    def check_brand_mismatch(api_brand: Optional[str], db_brand: Optional[str]) -> Optional[str]:
        """
        브랜드 그룹 불일치 검사
        
        - 둘 다 브랜드가 식별되었는데 다른 그룹이면 → VETO
        - 같은 그룹 내 매핑(현대↔힐스테이트)은 통과
        """
        if api_brand and db_brand:
            # 표준 브랜드명 비교
            if api_brand != db_brand:
                return f"브랜드 불일치: API={api_brand}, DB={db_brand}"
        return None
    
    @staticmethod
    def check_brand_in_parens_mismatch(
        api_brand_in_parens: Optional[str], 
        db_brand_in_parens: Optional[str]
    ) -> Optional[str]:
        """
        괄호 안 브랜드 불일치 검사
        
        - API에 괄호 안 브랜드가 있으면, DB에도 같은 브랜드가 있어야 함
        - 예: "효자촌(현대)" ↔ "효자촌(대우)" → VETO
        """
        if api_brand_in_parens:
            if db_brand_in_parens:
                # 둘 다 있으면 같아야 함
                api_std = BRAND_KEYWORD_TO_STANDARD.get(api_brand_in_parens.lower(), api_brand_in_parens)
                db_std = BRAND_KEYWORD_TO_STANDARD.get(db_brand_in_parens.lower(), db_brand_in_parens)
                if api_std != db_std:
                    return f"괄호 내 브랜드 불일치: API=({api_brand_in_parens}), DB=({db_brand_in_parens})"
            else:
                # API에만 있으면 VETO (DB에 괄호 브랜드가 없음)
                return f"괄호 내 브랜드 불일치: API=({api_brand_in_parens}), DB=(없음)"
        return None
    
    @staticmethod
    def check_block_in_parens_mismatch(
        api_block_in_parens: Optional[int], 
        db_block_in_parens: Optional[int]
    ) -> Optional[str]:
        """
        괄호 안 단지번호 불일치 검사
        
        - "후곡마을(건영15)" ↔ "후곡마을(동아10)" → VETO
        """
        if api_block_in_parens is not None:
            if db_block_in_parens is not None:
                if api_block_in_parens != db_block_in_parens:
                    return f"괄호 내 단지번호 불일치: API=({api_block_in_parens}), DB=({db_block_in_parens})"
            # API에만 있는 경우는 일단 통과 (DB에 정보가 없을 수 있음)
        return None
    
    @staticmethod
    def check_build_year_mismatch(
        api_year: Optional[str], 
        db_year: Optional[str],
        tolerance: int = BUILD_YEAR_TOLERANCE
    ) -> Optional[str]:
        """
        건축년도 과다 차이 검사
        
        - 3년 이상 차이나면 → VETO
        """
        if api_year and db_year:
            try:
                api_y = int(api_year[:4] if len(api_year) >= 4 else api_year)
                db_y = int(db_year[:4] if len(db_year) >= 4 else db_year)
                diff = abs(api_y - db_y)
                if diff > tolerance:
                    return f"건축년도 차이 과다: API={api_y}, DB={db_y} (차이={diff}년)"
            except (ValueError, TypeError):
                pass
        return None
    
    @staticmethod
    def check_bunji_mismatch(
        api_bunji: Optional[str], 
        db_bunji: Optional[str],
        name_similarity: float
    ) -> Optional[str]:
        """
        지번 불일치 검사 (이름 유사도만 높은 경우)
        
        - 이름 유사도가 100%가 아닌데 본번조차 다르면 → VETO
        """
        if name_similarity >= 1.0:
            return None  # 이름 완전 일치면 통과
        
        main_api, _ = BunjiProcessor.normalize(api_bunji)
        main_db, _ = BunjiProcessor.normalize(db_bunji)
        
        if main_api and main_db:
            if main_api != main_db:
                return f"지번 본번 불일치: API={api_bunji}, DB={db_bunji}"
        
        return None


class ApartmentMatcher:
    """
    아파트 매칭 클래스
    
    매칭 플로우:
    1. 후보군 선정 (Hierarchical Blocking)
    2. Veto 검사 (절대 거부 조건)
    3. 스코어링 (가중치 점수)
    4. 최종 판정 (임계값 + 애매한 매칭 처리)
    """
    
    def __init__(self):
        self.apt_processor = get_apt_processor()
        self.dong_processor = get_dong_processor()
        self.veto_checker = VetoChecker()
    
    def match(
        self,
        api_name: str,
        candidates: List[Any],  # List[Apartment]
        sgg_cd: str,
        umd_nm: Optional[str] = None,
        jibun: Optional[str] = None,
        build_year: Optional[str] = None,
        apt_details: Optional[Dict[int, Any]] = None,
        all_regions: Optional[Dict[int, Any]] = None,
    ) -> MatchResult:
        """
        아파트 매칭 수행
        
        Args:
            api_name: API에서 받은 아파트명
            candidates: 후보 아파트 리스트
            sgg_cd: 시군구 코드
            umd_nm: 동 이름
            jibun: 지번
            build_year: 건축년도
            apt_details: 아파트 상세정보 딕셔너리
            all_regions: 지역정보 딕셔너리
            
        Returns:
            MatchResult: 매칭 결과
        """
        if not api_name or not candidates:
            return MatchResult(
                matched=False,
                reason="입력값 없음",
                candidates_count=len(candidates) if candidates else 0
            )
        
        # API 아파트명 전처리
        api_data = self.apt_processor.process(api_name)
        
        # 후보 목록
        candidate_names = [getattr(apt, 'apt_name', str(apt)) for apt in candidates]
        
        # 매칭 결과 저장
        scores: List[Tuple[float, Any, Optional[str]]] = []  # (점수, 아파트, veto_reason)
        
        for apt in candidates:
            apt_name_db = getattr(apt, 'apt_name', '')
            apt_id = getattr(apt, 'apt_id', None)
            
            # DB 아파트명 전처리
            db_data = self.apt_processor.process(apt_name_db)
            
            # DB 상세정보 가져오기
            db_detail = apt_details.get(apt_id) if apt_details and apt_id else None
            db_bunji = getattr(db_detail, 'jibun_address', None) if db_detail else None
            db_year = getattr(db_detail, 'use_approval_date', None) if db_detail else None
            
            # ==========================================
            # Veto 검사 (하나라도 해당하면 즉시 탈락)
            # ==========================================
            veto_reason = self._check_veto(api_data, db_data, jibun, db_bunji, build_year, db_year)
            
            if veto_reason:
                scores.append((0.0, apt, veto_reason))
                continue
            
            # ==========================================
            # 스코어링 (Veto 통과한 후보만)
            # ==========================================
            score = self._calculate_score(
                api_data, db_data, jibun, db_bunji, build_year, db_year
            )
            
            scores.append((score, apt, None))
        
        # 점수 순으로 정렬
        scores.sort(key=lambda x: x[0], reverse=True)
        
        # 결과 생성
        return self._determine_result(scores, candidate_names, api_name)
    
    def _check_veto(
        self,
        api_data: Dict[str, Any],
        db_data: Dict[str, Any],
        api_bunji: Optional[str],
        db_bunji: Optional[str],
        api_year: Optional[str],
        db_year: Optional[str],
    ) -> Optional[str]:
        """
        Veto 조건 검사
        
        Returns:
            veto 사유 (None이면 통과)
        """
        # 1. 단지번호 불일치
        veto = self.veto_checker.check_block_mismatch(
            api_data['block'], db_data['block']
        )
        if veto:
            return veto
        
        # 2. 차수 불일치
        veto = self.veto_checker.check_series_mismatch(
            api_data['series'], db_data['series']
        )
        if veto:
            return veto
        
        # 3. 브랜드 불일치
        veto = self.veto_checker.check_brand_mismatch(
            api_data['brand'], db_data['brand']
        )
        if veto:
            return veto
        
        # 4. 괄호 안 브랜드 불일치
        veto = self.veto_checker.check_brand_in_parens_mismatch(
            api_data['brand_in_parens'], db_data['brand_in_parens']
        )
        if veto:
            return veto
        
        # 5. 괄호 안 단지번호 불일치
        veto = self.veto_checker.check_block_in_parens_mismatch(
            api_data['block_in_parens'], db_data['block_in_parens']
        )
        if veto:
            return veto
        
        # 6. 건축년도 과다 차이
        veto = self.veto_checker.check_build_year_mismatch(api_year, db_year)
        if veto:
            return veto
        
        # 7. 지번 불일치 (이름 유사도가 100%가 아닌 경우만)
        name_sim = calculate_similarity(
            api_data['normalized'], db_data['normalized']
        )
        veto = self.veto_checker.check_bunji_mismatch(api_bunji, db_bunji, name_sim)
        if veto:
            return veto
        
        return None
    
    def _calculate_score(
        self,
        api_data: Dict[str, Any],
        db_data: Dict[str, Any],
        api_bunji: Optional[str],
        db_bunji: Optional[str],
        api_year: Optional[str],
        db_year: Optional[str],
    ) -> float:
        """
        매칭 점수 계산 (100점 만점)
        
        - 지번 정확도: 40점
        - 이름 유사도: 40점
        - 메타데이터: 20점
        """
        score = 0.0
        
        # 1. 지번 점수 (40점)
        bunji_score = BunjiProcessor.match_score(api_bunji or '', db_bunji or '')
        score += bunji_score
        
        # 2. 이름 유사도 (40점)
        # 정규화된 이름 비교
        norm_sim = calculate_similarity(
            api_data['normalized'], db_data['normalized']
        )
        
        # 토큰 기반 유사도 (단어 순서 무관)
        token_sim = token_set_similarity(
            api_data['normalized'], db_data['normalized']
        )
        
        # 엄격 정규화 유사도
        strict_sim = calculate_similarity(
            api_data['normalized_strict'], db_data['normalized_strict']
        )
        
        # 최대값 사용
        name_sim = max(norm_sim, token_sim, strict_sim)
        score += name_sim * SCORE_NAME_SIMILARITY_MAX
        
        # 3. 메타데이터 점수 (20점)
        meta_score = 0.0
        
        # 단지/차수 완전 일치: +10점
        if api_data['block'] is not None and api_data['block'] == db_data['block']:
            meta_score += 5.0
        if api_data['series'] is not None and api_data['series'] == db_data['series']:
            meta_score += 5.0
        
        # 브랜드 일치: +5점
        if api_data['brand'] and api_data['brand'] == db_data['brand']:
            meta_score += 5.0
        
        # 건축년도 근사 (±1년): +5점
        if api_year and db_year:
            try:
                api_y = int(api_year[:4] if len(api_year) >= 4 else api_year)
                db_y = int(db_year[:4] if len(db_year) >= 4 else db_year)
                if abs(api_y - db_y) <= 1:
                    meta_score += 5.0
            except (ValueError, TypeError):
                pass
        
        score += meta_score
        
        return score
    
    def _determine_result(
        self,
        scores: List[Tuple[float, Any, Optional[str]]],
        candidate_names: List[str],
        api_name: str,
    ) -> MatchResult:
        """
        최종 매칭 결과 결정
        
        - 임계값(85점) 이상이면 매칭
        - 상위 1, 2위 점수 차이가 10점 미만이면 애매한 매칭 (REVIEW NEEDED)
        """
        # Veto되지 않은 후보만 필터
        valid_scores = [(s, apt, r) for s, apt, r in scores if r is None]
        
        if not valid_scores:
            # 모든 후보가 Veto됨
            veto_reasons = [r for _, _, r in scores if r]
            return MatchResult(
                matched=False,
                reason=f"모든 후보 Veto됨 ({len(veto_reasons)}개)",
                veto_reason=veto_reasons[0] if veto_reasons else None,
                candidates_count=len(scores),
                filtered_count=0,
                candidate_names=candidate_names
            )
        
        # 최고 점수 확인
        best_score, best_apt, _ = valid_scores[0]
        
        # 임계값 미달
        if best_score < MATCHING_SCORE_THRESHOLD:
            return MatchResult(
                matched=False,
                score=best_score,
                reason=f"점수 미달 ({best_score:.1f} < {MATCHING_SCORE_THRESHOLD})",
                candidates_count=len(scores),
                filtered_count=len(valid_scores),
                candidate_names=candidate_names
            )
        
        # 애매한 매칭 검사 (상위 1, 2위 차이)
        if len(valid_scores) >= 2:
            second_score = valid_scores[1][0]
            if best_score - second_score < AMBIGUOUS_MATCH_DIFF:
                return MatchResult(
                    matched=False,
                    score=best_score,
                    reason=f"애매한 매칭 (1위={best_score:.1f}, 2위={second_score:.1f}, 차이={best_score-second_score:.1f})",
                    candidates_count=len(scores),
                    filtered_count=len(valid_scores),
                    candidate_names=candidate_names
                )
        
        # 매칭 성공
        return MatchResult(
            matched=True,
            apartment_id=getattr(best_apt, 'apt_id', None),
            apartment_name=getattr(best_apt, 'apt_name', ''),
            score=best_score,
            reason="매칭 성공",
            candidates_count=len(scores),
            filtered_count=len(valid_scores),
            candidate_names=[getattr(best_apt, 'apt_name', '')]
        )


class AddressOnlyMatcher:
    """
    이름 없는 데이터 매칭 (지번 기반)
    
    예: "[매매] (1101-1)" 같은 케이스
    
    판정 기준:
    - 지번(본번+부번) 완전 일치 필수
    - AND 건축년도 ±1년 이내
    """
    
    def match(
        self,
        jibun: str,
        build_year: Optional[str],
        candidates: List[Any],
        apt_details: Optional[Dict[int, Any]] = None,
    ) -> MatchResult:
        """
        주소 기반 매칭
        """
        if not jibun or not candidates:
            return MatchResult(matched=False, reason="입력값 없음")
        
        api_main, api_sub = BunjiProcessor.normalize(jibun)
        if not api_main:
            return MatchResult(matched=False, reason="지번 파싱 실패")
        
        matched_apts = []
        
        for apt in candidates:
            apt_id = getattr(apt, 'apt_id', None)
            db_detail = apt_details.get(apt_id) if apt_details and apt_id else None
            
            if not db_detail:
                continue
            
            db_bunji = getattr(db_detail, 'jibun_address', None)
            db_year = getattr(db_detail, 'use_approval_date', None)
            
            # 지번 완전 일치 확인
            db_main, db_sub = BunjiProcessor.normalize(db_bunji)
            
            if api_main != db_main:
                continue
            
            # 부번도 확인 (있는 경우)
            if api_sub and db_sub and api_sub != db_sub:
                continue
            
            # 건축년도 확인 (±1년)
            if build_year and db_year:
                try:
                    api_y = int(build_year[:4] if len(build_year) >= 4 else build_year)
                    db_y = int(db_year[:4] if len(db_year) >= 4 else db_year)
                    if abs(api_y - db_y) > 1:
                        continue
                except (ValueError, TypeError):
                    pass
            
            matched_apts.append(apt)
        
        if not matched_apts:
            return MatchResult(
                matched=False,
                reason="지번 기반 매칭 실패",
                candidates_count=len(candidates)
            )
        
        if len(matched_apts) > 1:
            return MatchResult(
                matched=False,
                reason=f"지번 기반 다중 매칭 (애매함): {len(matched_apts)}개",
                candidates_count=len(candidates)
            )
        
        apt = matched_apts[0]
        return MatchResult(
            matched=True,
            apartment_id=getattr(apt, 'apt_id', None),
            apartment_name=getattr(apt, 'apt_name', ''),
            score=100.0,  # 지번 완전 일치
            reason="지번 기반 매칭 (Address Based)",
            candidates_count=len(candidates),
            filtered_count=1
        )


# 싱글톤 인스턴스
_matcher: Optional[ApartmentMatcher] = None
_address_matcher: Optional[AddressOnlyMatcher] = None


def get_matcher() -> ApartmentMatcher:
    """ApartmentMatcher 싱글톤 인스턴스 반환"""
    global _matcher
    if _matcher is None:
        _matcher = ApartmentMatcher()
    return _matcher


def get_address_matcher() -> AddressOnlyMatcher:
    """AddressOnlyMatcher 싱글톤 인스턴스 반환"""
    global _address_matcher
    if _address_matcher is None:
        _address_matcher = AddressOnlyMatcher()
    return _address_matcher
