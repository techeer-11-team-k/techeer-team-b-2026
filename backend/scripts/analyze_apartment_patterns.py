"""
아파트 데이터 패턴 분석 스크립트

미스매칭을 줄이기 위한 인사이트를 추출합니다:
1. 임대 아파트 분포
2. 같은 지역 내 유사 이름 아파트 (미스매칭 위험)
3. 단지 번호/차수 패턴
4. 브랜드 분포
5. 이름 길이 및 복잡도
"""
import csv
import re
from pathlib import Path
from typing import List, Dict, Set, Tuple
from collections import defaultdict, Counter
from difflib import SequenceMatcher


# 임대 키워드
RENTAL_KEYWORDS = [
    '임대', 'lh', '주공', '도시공사', '영구임대', '휴먼시아',
    '도개공', '부산도시공사', '가양도시개발공사', '서울도시공사',
    '공공임대', '사원임대', '사회주택', '임대동',
]

# 주요 브랜드
MAJOR_BRANDS = [
    '자이', '래미안', '푸르지오', '힐스테이트', '더샵', 
    '아이파크', '위브', '센트레빌', '롯데캐슬', '호반써밋',
]


def is_rental(name: str) -> bool:
    """임대 아파트 여부"""
    name_lower = name.lower().replace(' ', '')
    return any(kw.lower() in name_lower for kw in RENTAL_KEYWORDS)


def extract_danji_number(name: str) -> int:
    """단지 번호 추출"""
    match = re.search(r'(\d+)단지', name)
    if match:
        return int(match.group(1))
    return None


def extract_cha_number(name: str) -> int:
    """차수 추출"""
    match = re.search(r'(\d+)차', name)
    if match:
        return int(match.group(1))
    return None


def extract_brand(name: str) -> str:
    """브랜드 추출"""
    name_lower = name.lower()
    for brand in MAJOR_BRANDS:
        if brand in name_lower:
            return brand
    return None


def calculate_similarity(str1: str, str2: str) -> float:
    """문자열 유사도"""
    return SequenceMatcher(None, str1, str2).ratio()


def normalize_name(name: str) -> str:
    """이름 정규화"""
    # 공백 제거, 소문자
    return re.sub(r'\s+', '', name).lower()


class ApartmentAnalyzer:
    """아파트 데이터 분석기"""
    
    def __init__(self, csv_path: str):
        self.csv_path = Path(csv_path)
        self.apartments = []
        self.by_region = defaultdict(list)
        self.rental_apts = []
        self.non_rental_apts = []
        
    def load_data(self):
        """CSV 로드"""
        print(f"\n📂 Loading data from {self.csv_path.name}...")
        
        with open(self.csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                apt = {
                    'apt_id': int(row['apt_id']),
                    'region_id': int(row['region_id']),
                    'apt_name': row['apt_name'],
                    'kapt_code': row['kapt_code'],
                    'is_rental': is_rental(row['apt_name']),
                    'normalized_name': normalize_name(row['apt_name']),
                    'danji': extract_danji_number(row['apt_name']),
                    'cha': extract_cha_number(row['apt_name']),
                    'brand': extract_brand(row['apt_name']),
                }
                
                self.apartments.append(apt)
                self.by_region[apt['region_id']].append(apt)
                
                if apt['is_rental']:
                    self.rental_apts.append(apt)
                else:
                    self.non_rental_apts.append(apt)
        
        print(f"✅ Loaded {len(self.apartments):,} apartments")
        print(f"   - 임대: {len(self.rental_apts):,}개")
        print(f"   - 분양: {len(self.non_rental_apts):,}개")
    
    def analyze_rental_distribution(self):
        """임대 아파트 분포 분석"""
        print(f"\n{'='*80}")
        print(f"{'1️⃣  임대 아파트 분포':^80}")
        print(f"{'='*80}")
        
        print(f"\n전체 아파트: {len(self.apartments):,}개")
        print(f"임대 아파트: {len(self.rental_apts):,}개 ({len(self.rental_apts)/len(self.apartments)*100:.2f}%)")
        print(f"분양 아파트: {len(self.non_rental_apts):,}개 ({len(self.non_rental_apts)/len(self.apartments)*100:.2f}%)")
        
        # 임대 키워드별 빈도
        keyword_counts = Counter()
        for apt in self.rental_apts:
            name_lower = apt['apt_name'].lower()
            for keyword in RENTAL_KEYWORDS:
                if keyword.lower() in name_lower:
                    keyword_counts[keyword] += 1
        
        print(f"\n임대 키워드 빈도 (Top 10):")
        print(f"{'키워드':20} | {'빈도':>10}")
        print(f"{'-'*20}-+-{'-'*10}")
        for keyword, count in keyword_counts.most_common(10):
            print(f"{keyword:20} | {count:>10,}")
    
    def analyze_same_region_similar_names(self, similarity_threshold: float = 0.85):
        """같은 지역 내 유사 이름 아파트 (미스매칭 위험)"""
        print(f"\n{'='*80}")
        print(f"{'2️⃣  같은 지역 내 유사 이름 아파트 (미스매칭 위험)':^80}")
        print(f"{'='*80}")
        print(f"유사도 임계값: {similarity_threshold}")
        
        high_risk_pairs = []
        
        for region_id, apts in self.by_region.items():
            if len(apts) < 2:
                continue
            
            # 같은 지역 내 모든 쌍 비교
            for i, apt1 in enumerate(apts):
                for apt2 in apts[i+1:]:
                    # 유사도 계산
                    sim = calculate_similarity(apt1['normalized_name'], apt2['normalized_name'])
                    
                    if sim >= similarity_threshold and apt1['apt_name'] != apt2['apt_name']:
                        # 임대 vs 분양 여부 확인
                        rental_mismatch = apt1['is_rental'] != apt2['is_rental']
                        
                        high_risk_pairs.append({
                            'region_id': region_id,
                            'apt1': apt1['apt_name'],
                            'apt2': apt2['apt_name'],
                            'similarity': sim,
                            'rental_mismatch': rental_mismatch,
                            'apt1_rental': apt1['is_rental'],
                            'apt2_rental': apt2['is_rental'],
                        })
        
        # 유사도 높은 순 정렬
        high_risk_pairs.sort(key=lambda x: x['similarity'], reverse=True)
        
        print(f"\n발견된 고위험 쌍: {len(high_risk_pairs):,}개")
        
        # 임대 vs 분양 미스매칭
        rental_mismatch_pairs = [p for p in high_risk_pairs if p['rental_mismatch']]
        print(f"  - 임대 vs 분양 미스매칭 위험: {len(rental_mismatch_pairs):,}개 🚨")
        
        # 상위 30개 출력
        print(f"\n상위 30개 (유사도 높은 순):")
        print(f"{'유사도':^8} | {'임대?':^6} | {'아파트1':40} | {'아파트2':40}")
        print(f"{'-'*8}-+-{'-'*6}-+-{'-'*40}-+-{'-'*40}")
        
        for pair in high_risk_pairs[:30]:
            marker = "🚨" if pair['rental_mismatch'] else "⚠️"
            rental_status = f"{pair['apt1_rental']}/{pair['apt2_rental']}"
            print(f"{pair['similarity']:.4f}   | {marker} {rental_status:4} | {pair['apt1']:40} | {pair['apt2']:40}")
        
        return high_risk_pairs
    
    def analyze_danji_cha_patterns(self):
        """단지 번호/차수 패턴 분석"""
        print(f"\n{'='*80}")
        print(f"{'3️⃣  단지 번호 / 차수 패턴':^80}")
        print(f"{'='*80}")
        
        # 단지 번호 분포
        danji_apts = [apt for apt in self.apartments if apt['danji'] is not None]
        danji_counts = Counter(apt['danji'] for apt in danji_apts)
        
        print(f"\n단지 번호 있는 아파트: {len(danji_apts):,}개 ({len(danji_apts)/len(self.apartments)*100:.1f}%)")
        print(f"단지 번호 범위: {min(danji_counts.keys())} ~ {max(danji_counts.keys())}")
        
        print(f"\n단지 번호 분포 (Top 10):")
        print(f"{'단지':^6} | {'빈도':>10}")
        print(f"{'-'*6}-+-{'-'*10}")
        for danji, count in danji_counts.most_common(10):
            print(f"{danji:^6} | {count:>10,}")
        
        # 차수 분포
        cha_apts = [apt for apt in self.apartments if apt['cha'] is not None]
        cha_counts = Counter(apt['cha'] for apt in cha_apts)
        
        print(f"\n차수 있는 아파트: {len(cha_apts):,}개 ({len(cha_apts)/len(self.apartments)*100:.1f}%)")
        if cha_counts:
            print(f"차수 범위: {min(cha_counts.keys())} ~ {max(cha_counts.keys())}")
            
            print(f"\n차수 분포 (Top 10):")
            print(f"{'차수':^6} | {'빈도':>10}")
            print(f"{'-'*6}-+-{'-'*10}")
            for cha, count in cha_counts.most_common(10):
                print(f"{cha:^6} | {count:>10,}")
    
    def analyze_brand_distribution(self):
        """브랜드 분포 분석"""
        print(f"\n{'='*80}")
        print(f"{'4️⃣  브랜드 분포':^80}")
        print(f"{'='*80}")
        
        branded_apts = [apt for apt in self.apartments if apt['brand'] is not None]
        brand_counts = Counter(apt['brand'] for apt in branded_apts)
        
        print(f"\n브랜드 있는 아파트: {len(branded_apts):,}개 ({len(branded_apts)/len(self.apartments)*100:.1f}%)")
        
        print(f"\n브랜드별 분포:")
        print(f"{'브랜드':15} | {'분양':>10} | {'임대':>10} | {'합계':>10}")
        print(f"{'-'*15}-+-{'-'*10}-+-{'-'*10}-+-{'-'*10}")
        
        for brand in MAJOR_BRANDS:
            branded = [apt for apt in branded_apts if apt['brand'] == brand]
            rental = sum(1 for apt in branded if apt['is_rental'])
            non_rental = len(branded) - rental
            print(f"{brand:15} | {non_rental:>10,} | {rental:>10,} | {len(branded):>10,}")
    
    def analyze_name_complexity(self):
        """이름 길이 및 복잡도"""
        print(f"\n{'='*80}")
        print(f"{'5️⃣  이름 길이 및 복잡도':^80}")
        print(f"{'='*80}")
        
        # 이름 길이 분포
        name_lengths = [len(apt['apt_name']) for apt in self.apartments]
        avg_length = sum(name_lengths) / len(name_lengths)
        
        length_bins = {
            '매우 짧음 (1-5자)': sum(1 for l in name_lengths if l <= 5),
            '짧음 (6-10자)': sum(1 for l in name_lengths if 6 <= l <= 10),
            '보통 (11-15자)': sum(1 for l in name_lengths if 11 <= l <= 15),
            '김 (16-20자)': sum(1 for l in name_lengths if 16 <= l <= 20),
            '매우 김 (21자+)': sum(1 for l in name_lengths if l >= 21),
        }
        
        print(f"\n평균 이름 길이: {avg_length:.1f}자")
        print(f"\n길이별 분포:")
        print(f"{'길이 범위':20} | {'빈도':>10} | {'비율':>8}")
        print(f"{'-'*20}-+-{'-'*10}-+-{'-'*8}")
        for category, count in length_bins.items():
            ratio = count / len(self.apartments) * 100
            print(f"{category:20} | {count:>10,} | {ratio:>7.2f}%")
        
        # 특수문자 사용
        special_chars_count = sum(1 for apt in self.apartments if re.search(r'[^\w가-힣\s]', apt['apt_name']))
        print(f"\n특수문자 포함: {special_chars_count:,}개 ({special_chars_count/len(self.apartments)*100:.1f}%)")
        
        # 괄호 사용
        parentheses_count = sum(1 for apt in self.apartments if '(' in apt['apt_name'] or '[' in apt['apt_name'])
        print(f"괄호 포함: {parentheses_count:,}개 ({parentheses_count/len(self.apartments)*100:.1f}%)")
    
    def find_potential_duplicates(self):
        """중복 가능성 있는 아파트 찾기 (kapt_code는 다른데 이름이 같거나 매우 유사)"""
        print(f"\n{'='*80}")
        print(f"{'6️⃣  잠재적 중복 아파트 (kapt_code 다른데 이름 유사)':^80}")
        print(f"{'='*80}")
        
        # 정규화된 이름으로 그룹화
        by_normalized_name = defaultdict(list)
        for apt in self.apartments:
            by_normalized_name[apt['normalized_name']].append(apt)
        
        # 2개 이상 있는 경우만
        duplicates = {name: apts for name, apts in by_normalized_name.items() if len(apts) >= 2}
        
        print(f"\n정규화 후 이름이 같은 그룹: {len(duplicates):,}개")
        
        # 상위 20개
        sorted_duplicates = sorted(duplicates.items(), key=lambda x: len(x[1]), reverse=True)
        
        print(f"\n상위 20개 (많은 순):")
        print(f"{'개수':^6} | {'정규화된 이름':30} | {'kapt_code들':50}")
        print(f"{'-'*6}-+-{'-'*30}-+-{'-'*50}")
        
        for norm_name, apts in sorted_duplicates[:20]:
            kapt_codes = ', '.join(apt['kapt_code'] for apt in apts[:5])
            if len(apts) > 5:
                kapt_codes += f", ... ({len(apts)-5}개 더)"
            print(f"{len(apts):^6} | {norm_name:30} | {kapt_codes:50}")
    
    def generate_recommendations(self):
        """개선 제안"""
        print(f"\n{'='*80}")
        print(f"{'💡 매칭 정확도 개선 제안':^80}")
        print(f"{'='*80}\n")
        
        print("1. **임대 키워드 Veto 강화** ✅ (이미 구현됨)")
        print(f"   - 임대 아파트: {len(self.rental_apts):,}개 ({len(self.rental_apts)/len(self.apartments)*100:.1f}%)")
        print(f"   - 효과: 임대 vs 분양 미스매칭 방지")
        
        print("\n2. **단지 번호/차수 검증 강화**")
        danji_apts = sum(1 for apt in self.apartments if apt['danji'] is not None)
        cha_apts = sum(1 for apt in self.apartments if apt['cha'] is not None)
        print(f"   - 단지 번호 있음: {danji_apts:,}개 ({danji_apts/len(self.apartments)*100:.1f}%)")
        print(f"   - 차수 있음: {cha_apts:,}개 ({cha_apts/len(self.apartments)*100:.1f}%)")
        print(f"   - 제안: 단지/차수가 다르면 무조건 매칭 거부 (현재 구현 상태 확인 필요)")
        
        print("\n3. **브랜드 검증 강화**")
        branded = sum(1 for apt in self.apartments if apt['brand'] is not None)
        print(f"   - 주요 브랜드 있음: {branded:,}개 ({branded/len(self.apartments)*100:.1f}%)")
        print(f"   - 제안: 주요 브랜드(자이, 래미안 등)가 API와 DB에서 다르면 Veto")
        
        print("\n4. **같은 지역 내 유사 이름 특별 처리**")
        print(f"   - 제안: 유사도 0.85+ 아파트는 추가 검증 필수")
        print(f"     (지번, 건축년도, 단지 번호 모두 일치해야 매칭)")
        
        print("\n5. **정규화 후 중복 이름 처리**")
        by_normalized = defaultdict(list)
        for apt in self.apartments:
            by_normalized[apt['normalized_name']].append(apt)
        duplicates = sum(1 for apts in by_normalized.values() if len(apts) >= 2)
        print(f"   - 정규화 후 중복: {duplicates:,}개")
        print(f"   - 제안: 중복 이름은 kapt_code로 구분, region_id 추가 검증")


def main():
    """메인 함수"""
    csv_path = "/home/rivermoon/Documents/Github-Techeer/techeer-team-b-2026/db_backup/apartments.csv"
    
    analyzer = ApartmentAnalyzer(csv_path)
    analyzer.load_data()
    
    # 분석 실행
    analyzer.analyze_rental_distribution()
    high_risk = analyzer.analyze_same_region_similar_names(similarity_threshold=0.85)
    analyzer.analyze_danji_cha_patterns()
    analyzer.analyze_brand_distribution()
    analyzer.analyze_name_complexity()
    analyzer.find_potential_duplicates()
    analyzer.generate_recommendations()
    
    print(f"\n{'='*80}")
    print(f"✅ 분석 완료!")
    print(f"{'='*80}\n")


if __name__ == "__main__":
    main()
