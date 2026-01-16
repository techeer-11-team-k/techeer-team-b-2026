"""
뉴스 크롤러 테스트 스크립트

크롤링이 제대로 동작하는지 확인하는 스크립트입니다.

사용 방법:
    python -m scripts.test_news_crawler
    또는
    cd backend && python -m scripts.test_news_crawler
"""
import asyncio
import sys
import os
from pathlib import Path

# Windows에서 UTF-8 인코딩 설정
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 프로젝트 루트를 Python 경로에 추가
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.news import news_crawler
import json
from datetime import datetime


def format_datetime(dt):
    """datetime 객체를 문자열로 변환"""
    if isinstance(dt, datetime):
        return dt.isoformat()
    return dt


async def test_crawl_naver_realestate_rss():
    """매일경제 RSS 크롤링 테스트"""
    print("\n" + "="*60)
    print("[RSS] 매일경제 RSS 크롤링 테스트")
    print("="*60)
    
    try:
        news_list = await news_crawler.crawl_naver_realestate_rss(limit=5)
        print(f"\n[OK] 크롤링 성공: {len(news_list)}개 뉴스 수집\n")
        
        for i, news in enumerate(news_list, 1):
            print(f"[{i}] {news.get('title', '제목 없음')}")
            print(f"    출처: {news.get('source', 'N/A')}")
            print(f"    URL: {news.get('url', 'N/A')}")
            print(f"    발행일: {format_datetime(news.get('published_at', 'N/A'))}")
            print(f"    카테고리: {news.get('category', 'N/A')}")
            if news.get('thumbnail_url'):
                print(f"    썸네일: {news.get('thumbnail_url')[:80]}...")
            print()
        
        return True
    except Exception as e:
        print(f"\n[FAIL] 크롤링 실패: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_crawl_naver_realestate():
    """네이버 부동산 섹션 크롤링 테스트"""
    print("\n" + "="*60)
    print("[Naver] 네이버 부동산 섹션 크롤링 테스트")
    print("="*60)
    
    try:
        news_list = await news_crawler.crawl_naver_realestate(limit=5)
        print(f"\n[OK] 크롤링 성공: {len(news_list)}개 뉴스 수집\n")
        
        if len(news_list) == 0:
            print("[WARN] 뉴스가 수집되지 않았습니다.")
            print("   - HTML 구조가 변경되었을 수 있습니다.")
            print("   - 네트워크 문제일 수 있습니다.")
            return False
        
        for i, news in enumerate(news_list, 1):
            print(f"[{i}] {news.get('title', '제목 없음')}")
            print(f"    출처: {news.get('source', 'N/A')}")
            print(f"    URL: {news.get('url', 'N/A')}")
            print(f"    발행일: {format_datetime(news.get('published_at', 'N/A'))}")
            if news.get('content'):
                content_preview = news.get('content', '')[:100]
                print(f"    본문 미리보기: {content_preview}...")
            if news.get('thumbnail_url'):
                print(f"    썸네일: {news.get('thumbnail_url')[:80]}...")
            print()
        
        return True
    except Exception as e:
        print(f"\n[FAIL] 크롤링 실패: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_crawl_all_sources():
    """모든 소스 크롤링 테스트"""
    print("\n" + "="*60)
    print("[All] 모든 소스 크롤링 테스트")
    print("="*60)
    
    try:
        news_list = await news_crawler.crawl_all_sources(limit_per_source=3)
        print(f"\n✅ 크롤링 성공: 총 {len(news_list)}개 뉴스 수집\n")
        
        # 출처별로 그룹화
        sources = {}
        for news in news_list:
            source = news.get('source', '알 수 없음')
            if source not in sources:
                sources[source] = []
            sources[source].append(news)
        
        print("[통계] 출처별 통계:")
        for source, items in sources.items():
            print(f"   - {source}: {len(items)}개")
        print()
        
        # 샘플 출력
        print("[샘플] 뉴스 (최대 5개):")
        for i, news in enumerate(news_list[:5], 1):
            print(f"\n[{i}] {news.get('title', '제목 없음')}")
            print(f"    출처: {news.get('source', 'N/A')}")
            print(f"    URL: {news.get('url', 'N/A')}")
        
        return True
    except Exception as e:
        print(f"\n[FAIL] 크롤링 실패: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_crawl_news_detail():
    """뉴스 상세 크롤링 테스트"""
    print("\n" + "="*60)
    print("[Detail] 뉴스 상세 크롤링 테스트")
    print("="*60)
    
    # 테스트용 URL (매일경제 RSS에서 가져온 실제 URL)
    test_url = "https://mbnmoney.mbn.co.kr/news/view?news_no=MM1005739763"
    
    print(f"\n테스트 URL: {test_url}\n")
    
    try:
        detail = await news_crawler.crawl_news_detail(test_url)
        
        if not detail:
            print("[FAIL] 크롤링 실패: 뉴스를 찾을 수 없습니다.")
            return False
        
        print("[OK] 크롤링 성공!\n")
        print(f"제목: {detail.get('title', 'N/A')}")
        print(f"출처: {detail.get('source', 'N/A')}")
        print(f"URL: {detail.get('url', 'N/A')}")
        if detail.get('content'):
            content_preview = detail.get('content', '')[:200]
            print(f"본문 미리보기: {content_preview}...")
        if detail.get('thumbnail_url'):
            print(f"썸네일: {detail.get('thumbnail_url')}")
        
        return True
    except Exception as e:
        print(f"\n[FAIL] 크롤링 실패: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """메인 테스트 함수"""
    print("\n" + "="*60)
    print("[TEST] 뉴스 크롤러 테스트 시작")
    print("="*60)
    
    results = {}
    
    # 1. 매일경제 RSS 테스트
    results['rss'] = await test_crawl_naver_realestate_rss()
    
    # 2. 네이버 부동산 섹션 테스트
    results['naver'] = await test_crawl_naver_realestate()
    
    # 3. 모든 소스 테스트
    results['all'] = await test_crawl_all_sources()
    
    # 4. 상세 크롤링 테스트 (선택적)
    # results['detail'] = await test_crawl_news_detail()
    
    # 결과 요약
    print("\n" + "="*60)
    print("[결과] 테스트 결과 요약")
    print("="*60)
    for test_name, success in results.items():
        status = "[OK] 성공" if success else "[FAIL] 실패"
        print(f"   {test_name}: {status}")
    
    print("\n" + "="*60)
    print("테스트 완료!")
    print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
