"""
매칭 정확도 분석 스크립트

아파트-거래 매칭의 정확도를 분석합니다.
로그 파일을 읽어서 매칭 성공률, 방법별 성공률, 실패 원인 등을 분석합니다.
"""
import os
import re
import json
from pathlib import Path
from typing import Dict, List, Tuple
from collections import defaultdict, Counter
from datetime import datetime


class MatchingAccuracyAnalyzer:
    """매칭 정확도 분석 클래스"""
    
    def __init__(self, log_dir: str = "logs"):
        self.log_dir = Path(log_dir)
        self.results = {
            'success': [],
            'fail': [],
            'methods': Counter(),
            'fail_reasons': Counter(),
            'regions': defaultdict(lambda: {'success': 0, 'fail': 0})
        }
    
    def parse_success_log(self, log_file: Path) -> int:
        """매칭 성공 로그 파싱"""
        count = 0
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                for line in f:
                    # 매칭 방법 추출
                    if 'address_jibun' in line or '주소+지번' in line:
                        self.results['methods']['address_jibun'] += 1
                        count += 1
                    elif 'name_matching' in line or '이름 매칭' in line:
                        self.results['methods']['name_matching'] += 1
                        count += 1
                    elif 'sgg_dong_code' in line or '시군구+동' in line:
                        self.results['methods']['sgg_dong_code'] += 1
                        count += 1
                    
                    # 지역 정보 추출 (예: [서울특별시 강남구])
                    region_match = re.search(r'\[(.*?)\s+(.*?)\]', line)
                    if region_match:
                        city = region_match.group(1)
                        self.results['regions'][city]['success'] += 1
        except Exception as e:
            print(f"  {log_file} 읽기 실패: {e}")
        
        return count
    
    def parse_fail_log(self, log_file: Path) -> int:
        """매칭 실패 로그 파싱"""
        count = 0
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                content = f.read()
                
                # 실패 원인 분석
                if '지역을 찾을 수 없습니다' in content:
                    self.results['fail_reasons']['region_not_found'] += content.count('지역을 찾을 수 없습니다')
                
                if '유사도 부족' in content or 'similarity' in content.lower():
                    self.results['fail_reasons']['low_similarity'] += content.count('유사도')
                
                if 'Veto' in content or '거부' in content:
                    self.results['fail_reasons']['veto_condition'] += content.count('Veto')
                
                if '건축년도' in content:
                    self.results['fail_reasons']['build_year_mismatch'] += content.count('건축년도')
                
                if '단지' in content or '차수' in content:
                    self.results['fail_reasons']['danji_mismatch'] += content.count('단지')
                
                if '브랜드' in content:
                    self.results['fail_reasons']['brand_mismatch'] += content.count('브랜드')
                
                # 줄 수로 실패 건수 추정
                lines = content.split('\n')
                count = len([l for l in lines if l.strip() and '' in l or '' in l or 'FAIL' in l.upper()])
        except Exception as e:
            print(f"  {log_file} 읽기 실패: {e}")
        
        return count
    
    def analyze_logs(self, year_month: str = None):
        """로그 파일 분석"""
        print("\n" + "="*80)
        print(" 매칭 정확도 분석 시작")
        print("="*80)
        
        if not self.log_dir.exists():
            print(f"  로그 디렉토리를 찾을 수 없습니다: {self.log_dir}")
            print(f"대체 경로를 확인합니다...")
            
            # 대체 경로들
            alt_paths = [
                Path("db_backup/logs"),
                Path("../logs"),
                Path("../../logs")
            ]
            
            for alt_path in alt_paths:
                if alt_path.exists():
                    self.log_dir = alt_path
                    print(f" 로그 디렉토리 발견: {self.log_dir}")
                    break
            else:
                print(" 로그 디렉토리를 찾을 수 없습니다.")
                return
        
        # 로그 파일 검색
        if year_month:
            pattern = f"*{year_month}*.log"
        else:
            pattern = "*.log"
        
        log_files = list(self.log_dir.glob(pattern))
        
        if not log_files:
            print(f"  로그 파일을 찾을 수 없습니다: {self.log_dir / pattern}")
            return
        
        print(f"\n 분석 대상 로그 파일: {len(log_files)}개")
        for log_file in sorted(log_files):
            print(f"  - {log_file.name}")
        
        # 성공/실패 로그 분리
        success_logs = [f for f in log_files if 'success' in f.name.lower() or 'apart_' in f.name]
        fail_logs = [f for f in log_files if 'fail' in f.name.lower()]
        
        total_success = 0
        total_fail = 0
        
        # 성공 로그 분석
        print("\n 성공 로그 분석 중...")
        for log_file in success_logs:
            count = self.parse_success_log(log_file)
            total_success += count
            if count > 0:
                print(f"   {log_file.name}: {count:,}건")
        
        # 실패 로그 분석
        print("\n 실패 로그 분석 중...")
        for log_file in fail_logs:
            count = self.parse_fail_log(log_file)
            total_fail += count
            if count > 0:
                print(f"   {log_file.name}: {count:,}건")
        
        # 결과 출력
        self.print_results(total_success, total_fail)
    
    def print_results(self, total_success: int, total_fail: int):
        """분석 결과 출력"""
        total = total_success + total_fail
        
        if total == 0:
            print("\n  분석할 데이터가 없습니다.")
            return
        
        success_rate = (total_success / total * 100) if total > 0 else 0
        fail_rate = (total_fail / total * 100) if total > 0 else 0
        
        print("\n" + "="*80)
        print(" 매칭 정확도 분석 결과")
        print("="*80)
        
        # 전체 통계
        print(f"\n{'='*80}")
        print(f"{'전체 매칭 통계':^80}")
        print(f"{'='*80}")
        print(f"{'구분':20} | {'건수':>15} | {'비율':>15}")
        print(f"{'-'*20}-+-{'-'*15}-+-{'-'*15}")
        print(f"{' 매칭 성공':20} | {total_success:>15,} | {success_rate:>14.2f}%")
        print(f"{' 매칭 실패':20} | {total_fail:>15,} | {fail_rate:>14.2f}%")
        print(f"{' 전체':20} | {total:>15,} | {100:>14.2f}%")
        
        # 매칭 방법별 통계
        if self.results['methods']:
            print(f"\n{'='*80}")
            print(f"{'매칭 방법별 성공 분포':^80}")
            print(f"{'='*80}")
            print(f"{'매칭 방법':30} | {'건수':>15} | {'비율':>15}")
            print(f"{'-'*30}-+-{'-'*15}-+-{'-'*15}")
            
            method_names = {
                'address_jibun': ' 주소+지번 매칭',
                'name_matching': ' 이름 유사도 매칭',
                'sgg_dong_code': '  시군구+동코드 매칭'
            }
            
            for method, count in self.results['methods'].most_common():
                method_name = method_names.get(method, method)
                percentage = (count / total_success * 100) if total_success > 0 else 0
                print(f"{method_name:30} | {count:>15,} | {percentage:>14.2f}%")
        
        # 실패 원인별 통계
        if self.results['fail_reasons']:
            print(f"\n{'='*80}")
            print(f"{'매칭 실패 원인 분석':^80}")
            print(f"{'='*80}")
            print(f"{'실패 원인':30} | {'발생 횟수':>15} | {'비율':>15}")
            print(f"{'-'*30}-+-{'-'*15}-+-{'-'*15}")
            
            reason_names = {
                'region_not_found': ' 지역 코드 불일치',
                'low_similarity': ' 이름 유사도 부족',
                'veto_condition': ' Veto 조건 위배',
                'build_year_mismatch': '  건축년도 불일치',
                'danji_mismatch': '  단지/차수 불일치',
                'brand_mismatch': ' 브랜드 불일치'
            }
            
            for reason, count in self.results['fail_reasons'].most_common():
                reason_name = reason_names.get(reason, reason)
                percentage = (count / total_fail * 100) if total_fail > 0 else 0
                print(f"{reason_name:30} | {count:>15,} | {percentage:>14.2f}%")
        
        # 지역별 통계 (상위 10개)
        if self.results['regions']:
            print(f"\n{'='*80}")
            print(f"{'지역별 매칭 성공률 (상위 10개)':^80}")
            print(f"{'='*80}")
            print(f"{'지역':20} | {'성공':>10} | {'실패':>10} | {'성공률':>15}")
            print(f"{'-'*20}-+-{'-'*10}-+-{'-'*10}-+-{'-'*15}")
            
            region_stats = []
            for region, stats in self.results['regions'].items():
                total_region = stats['success'] + stats['fail']
                rate = (stats['success'] / total_region * 100) if total_region > 0 else 0
                region_stats.append((region, stats['success'], stats['fail'], rate, total_region))
            
            region_stats.sort(key=lambda x: x[4], reverse=True)
            
            for region, success, fail, rate, _ in region_stats[:10]:
                print(f"{region:20} | {success:>10,} | {fail:>10,} | {rate:>14.2f}%")
        
        # 개선 제안
        print(f"\n{'='*80}")
        print(f"{' 개선 제안':^80}")
        print(f"{'='*80}")
        
        if success_rate >= 95:
            print(" 우수: 매칭 정확도가 95% 이상입니다!")
        elif success_rate >= 90:
            print(" 양호: 매칭 정확도가 90% 이상입니다.")
            print("   → apartments.apt_seq 점진적 캐싱으로 95% 이상 달성 가능")
        elif success_rate >= 85:
            print("  보통: 매칭 정확도가 85% 이상입니다.")
            print("   → 주요 개선 필요:")
            print("      1. apartments.apt_seq 점진적 캐싱")
            print("      2. 지번 본번/부번 분리 저장")
            print("      3. 브랜드 매핑 테이블 강화")
        else:
            print(" 개선 필요: 매칭 정확도가 85% 미만입니다.")
            print("   → 긴급 개선 필요:")
            print("      1. 로그 분석으로 주요 실패 패턴 파악")
            print("      2. 매칭 로직 재검토")
            print("      3. 데이터 품질 검증")
        
        # 실패 원인별 개선 제안
        if self.results['fail_reasons']:
            top_reason = self.results['fail_reasons'].most_common(1)[0]
            reason_name = top_reason[0]
            
            print(f"\n최다 실패 원인: {reason_name}")
            
            if reason_name == 'region_not_found':
                print("   → 법정동 코드 매핑 테이블 업데이트 필요")
                print("   → states 테이블에 누락된 지역 코드 추가")
            elif reason_name == 'low_similarity':
                print("   → 이름 정규화 로직 강화")
                print("   → 유사도 임계값 조정 검토")
            elif reason_name == 'veto_condition':
                print("   → Veto 조건 완화 검토")
                print("   → 건축년도/단지번호 허용 오차 확대")


def show_menu():
    """메뉴 표시"""
    print("\n" + "="*80)
    print(" 매칭 정확도 분석 도구")
    print("="*80)
    print("1. 전체 로그 분석 (모든 연월)")
    print("2. 특정 연월 분석 (예: 202001)")
    print("3. 최근 로그만 분석")
    print("="*80)
    print("0. 종료")
    print("="*80)


def main():
    """메인 함수"""
    analyzer = MatchingAccuracyAnalyzer()
    
    while True:
        show_menu()
        choice = input("\n선택 (0-3): ").strip()
        
        if choice == '0':
            print("\n 종료합니다.")
            break
        
        elif choice == '1':
            analyzer.analyze_logs()
        
        elif choice == '2':
            year_month = input("분석할 연월 입력 (예: 202001): ").strip()
            if len(year_month) == 6 and year_month.isdigit():
                analyzer.analyze_logs(year_month)
            else:
                print("  올바른 형식이 아닙니다. (YYYYMM)")
        
        elif choice == '3':
            # 가장 최근 로그 파일 찾기
            log_dir = Path("logs")
            if not log_dir.exists():
                log_dir = Path("db_backup/logs")
            
            if log_dir.exists():
                log_files = sorted(log_dir.glob("*.log"), key=lambda x: x.stat().st_mtime, reverse=True)
                if log_files:
                    latest_file = log_files[0]
                    # 파일명에서 연월 추출
                    match = re.search(r'(\d{6})', latest_file.name)
                    if match:
                        year_month = match.group(1)
                        print(f"최근 로그: {year_month}")
                        analyzer.analyze_logs(year_month)
                    else:
                        analyzer.analyze_logs()
                else:
                    print("  로그 파일을 찾을 수 없습니다.")
            else:
                print("  로그 디렉토리를 찾을 수 없습니다.")
        
        else:
            print("  잘못된 선택입니다.")
        
        input("\nEnter를 눌러 계속...")


if __name__ == "__main__":
    main()
