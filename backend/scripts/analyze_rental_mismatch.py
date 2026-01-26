"""
임대 아파트 미스매칭 분석 스크립트

같은 지번에 임대 아파트와 분양 아파트가 있어서 발생하는 매칭 오류를 분석합니다.
"""
import re
from pathlib import Path
from typing import List, Dict, Set
from collections import defaultdict


# 임대 아파트 키워드
RENTAL_KEYWORDS = [
    '임대', 'LH', '주공', '도시공사', '영구임대', '휴먼시아',
    '도개공', '부산도시공사', '가양도시개발공사',
    '공공임대', '사원임대', '사회주택',
]

# 제외할 키워드 (임대가 아님)
EXCLUDE_KEYWORDS = [
    '래미안', '자이', '푸르지오', '힐스테이트', '더샵',  # 브랜드명에 "임대"가 있으면 안됨
]


class RentalMismatchAnalyzer:
    """임대 아파트 미스매칭 분석"""
    
    def __init__(self, log_file: str):
        self.log_file = Path(log_file)
        self.mismatches = []
        self.rental_counts = defaultdict(int)
        self.brands_with_rental = set()
    
    def is_rental_name(self, name: str) -> bool:
        """아파트 이름에 임대 키워드가 있는지 확인"""
        if not name:
            return False
        
        name_lower = name.lower()
        
        # 제외 키워드 확인
        for exclude in EXCLUDE_KEYWORDS:
            if exclude.lower() in name_lower:
                return False
        
        # 임대 키워드 확인
        for keyword in RENTAL_KEYWORDS:
            if keyword.lower() in name_lower:
                return True
        
        return False
    
    def parse_log_line(self, line: str) -> Dict:
        """로그 라인 파싱
        
        형식: "API아파트명 - DB아파트명1, DB아파트명2 [매칭방법: method1, method2]"
        """
        # "아파트명 - 매칭아파트들 [매칭방법: ...]" 패턴
        match = re.match(r'^(.+?)\s*-\s*(.+?)\s*\[매칭방법:\s*(.+?)\]', line)
        if not match:
            return None
        
        api_name = match.group(1).strip()
        matched_names_str = match.group(2).strip()
        methods = match.group(3).strip()
        
        # 매칭된 아파트명들 분리 (쉼표로 구분)
        matched_names = [n.strip() for n in matched_names_str.split(',')]
        
        return {
            'api_name': api_name,
            'matched_names': matched_names,
            'methods': methods,
            'line': line.strip()
        }
    
    def analyze(self):
        """로그 파일 분석"""
        if not self.log_file.exists():
            print(f"  로그 파일을 찾을 수 없습니다: {self.log_file}")
            return
        
        print(f"\n 임대 아파트 미스매칭 분석: {self.log_file.name}")
        print("="*80)
        
        total_lines = 0
        rental_mismatches = 0
        
        with open(self.log_file, 'r', encoding='utf-8') as f:
            for line in f:
                total_lines += 1
                
                parsed = self.parse_log_line(line)
                if not parsed:
                    continue
                
                api_name = parsed['api_name']
                matched_names = parsed['matched_names']
                methods = parsed['methods']
                
                # API 이름에 임대가 있는지 확인
                api_is_rental = self.is_rental_name(api_name)
                
                # 매칭된 이름 중에 임대가 있는지 확인
                rental_in_matched = []
                non_rental_in_matched = []
                
                for matched_name in matched_names:
                    if self.is_rental_name(matched_name):
                        rental_in_matched.append(matched_name)
                        self.rental_counts[matched_name] += 1
                    else:
                        non_rental_in_matched.append(matched_name)
                
                # 미스매칭 패턴 감지
                if not api_is_rental and rental_in_matched:
                    # 1. 분양 아파트(API)가 임대 아파트(DB)와 매칭됨
                    rental_mismatches += 1
                    self.mismatches.append({
                        'type': 'rental_to_normal',
                        'api_name': api_name,
                        'rental_matched': rental_in_matched,
                        'non_rental_matched': non_rental_in_matched,
                        'methods': methods,
                        'line': parsed['line']
                    })
                elif api_is_rental and non_rental_in_matched:
                    # 2. 임대 아파트(API)가 분양 아파트(DB)와 매칭됨
                    rental_mismatches += 1
                    self.mismatches.append({
                        'type': 'normal_to_rental',
                        'api_name': api_name,
                        'rental_matched': rental_in_matched,
                        'non_rental_matched': non_rental_in_matched,
                        'methods': methods,
                        'line': parsed['line']
                    })
                elif rental_in_matched and non_rental_in_matched:
                    # 3. 임대와 분양이 섞여 있음 (심각!)
                    rental_mismatches += 1
                    self.mismatches.append({
                        'type': 'mixed',
                        'api_name': api_name,
                        'rental_matched': rental_in_matched,
                        'non_rental_matched': non_rental_in_matched,
                        'methods': methods,
                        'line': parsed['line']
                    })
                
                # 임대 키워드와 브랜드가 함께 있는 경우 (드물지만 존재)
                if api_is_rental:
                    # 브랜드 추출 시도
                    for brand in ['자이', '래미안', '푸르지오', '힐스테이트', '더샵', '아이파크', '위브', '센트레빌']:
                        if brand in api_name:
                            self.brands_with_rental.add(f"{brand} (예: {api_name})")
        
        print(f"\n 분석 결과:")
        print(f"  전체 매칭 라인: {total_lines:,}개")
        print(f"  임대 미스매칭: {rental_mismatches:,}개 ({rental_mismatches/total_lines*100:.2f}%)")
        
        return rental_mismatches
    
    def print_mismatches(self, limit: int = 50):
        """미스매칭 상세 출력"""
        if not self.mismatches:
            print("\n 임대 미스매칭이 발견되지 않았습니다.")
            return
        
        print(f"\n{'='*80}")
        print(f"{'임대 미스매칭 상세 (상위 {min(limit, len(self.mismatches))}개)':^80}")
        print(f"{'='*80}\n")
        
        # 타입별로 그룹화
        by_type = defaultdict(list)
        for mismatch in self.mismatches:
            by_type[mismatch['type']].append(mismatch)
        
        # 1. 분양 → 임대 매칭 (가장 심각)
        if 'rental_to_normal' in by_type:
            print(f" 패턴 1: 분양 아파트(API)가 임대 아파트(DB)와 매칭 ({len(by_type['rental_to_normal'])}건)")
            print("-" * 80)
            for i, mismatch in enumerate(by_type['rental_to_normal'][:limit], 1):
                print(f"{i}. {mismatch['api_name']}")
                print(f"   → 임대 매칭: {', '.join(mismatch['rental_matched'])}")
                if mismatch['non_rental_matched']:
                    print(f"   → 분양 매칭: {', '.join(mismatch['non_rental_matched'])}")
                print(f"   [매칭방법: {mismatch['methods']}]")
                print()
        
        # 2. 임대 → 분양 매칭
        if 'normal_to_rental' in by_type:
            print(f"\n  패턴 2: 임대 아파트(API)가 분양 아파트(DB)와 매칭 ({len(by_type['normal_to_rental'])}건)")
            print("-" * 80)
            for i, mismatch in enumerate(by_type['normal_to_rental'][:limit], 1):
                print(f"{i}. {mismatch['api_name']}")
                print(f"   → 분양 매칭: {', '.join(mismatch['non_rental_matched'])}")
                if mismatch['rental_matched']:
                    print(f"   → 임대 매칭: {', '.join(mismatch['rental_matched'])}")
                print(f"   [매칭방법: {mismatch['methods']}]")
                print()
        
        # 3. 혼합 매칭 (가장 심각)
        if 'mixed' in by_type:
            print(f"\n 패턴 3: 임대와 분양이 섞여 매칭 ({len(by_type['mixed'])}건) ← 가장 심각!")
            print("-" * 80)
            for i, mismatch in enumerate(by_type['mixed'][:limit], 1):
                print(f"{i}. {mismatch['api_name']}")
                print(f"   → 임대: {', '.join(mismatch['rental_matched'])}")
                print(f"   → 분양: {', '.join(mismatch['non_rental_matched'])}")
                print(f"   [매칭방법: {mismatch['methods']}]")
                print()
    
    def print_top_rental_keywords(self, top_n: int = 20):
        """가장 많이 등장하는 임대 아파트"""
        if not self.rental_counts:
            return
        
        print(f"\n{'='*80}")
        print(f"{'임대 아파트 등장 빈도 (상위 {top_n}개)':^80}")
        print(f"{'='*80}")
        print(f"{'순위':^6} | {'임대 아파트명':50} | {'등장 횟수':^12}")
        print(f"{'-'*6}-+-{'-'*50}-+-{'-'*12}")
        
        sorted_rentals = sorted(self.rental_counts.items(), key=lambda x: x[1], reverse=True)
        for i, (name, count) in enumerate(sorted_rentals[:top_n], 1):
            print(f"{i:^6} | {name:50} | {count:^12,}")
    
    def print_recommendations(self):
        """개선 제안"""
        print(f"\n{'='*80}")
        print(f"{' 개선 제안':^80}")
        print(f"{'='*80}\n")
        
        if not self.mismatches:
            print(" 임대 미스매칭이 없습니다. 현재 매칭 로직이 잘 작동하고 있습니다.")
            return
        
        print("1. **임대 키워드 Veto 추가** (가장 효과적!)")
        print("   → 매칭 로직에 임대 키워드 필터링 추가")
        print("   → API와 DB 아파트 이름 모두 확인")
        print("   → 임대 키워드:")
        for keyword in RENTAL_KEYWORDS:
            print(f"      - {keyword}")
        
        print("\n2. **가격 범위 검증**")
        print("   → 같은 아파트의 기존 거래 중앙값 계산")
        print("   → 신규 거래가 중앙값 ±50% 이상 차이나면 경고")
        print("   → 예: 5억 → 4000만원 (91% 차이) → 거부")
        
        print("\n3. **아파트 타입 분류 (DB 스키마 변경)**")
        print("   → apartments 테이블에 is_rental BOOLEAN 추가")
        print("   → 임대 키워드로 자동 분류")
        print("   → 매칭 시 타입 일치 검증")
        
        print("\n4. **지번 매칭 우선순위 조정**")
        print("   → 같은 지번이라도 이름 차이가 크면 매칭 거부")
        print("   → 임대 vs 분양은 같은 지번이어도 다른 아파트로 간주")
        
        print("\n5. **혼합 단지 특별 처리**")
        print("   → 단지명은 같지만 동 번호로 구분")
        print("   → 예: 북한산힐스테이트3차 3207동(임대동) vs 일반동")


def main():
    """메인 함수"""
    import sys
    
    log_file = sys.argv[1] if len(sys.argv) > 1 else "/home/rivermoon/Documents/reference/apart_202012.log"
    
    analyzer = RentalMismatchAnalyzer(log_file)
    rental_mismatches = analyzer.analyze()
    
    if rental_mismatches > 0:
        analyzer.print_mismatches(limit=50)
        analyzer.print_top_rental_keywords(top_n=20)
    
    analyzer.print_recommendations()


if __name__ == "__main__":
    main()
