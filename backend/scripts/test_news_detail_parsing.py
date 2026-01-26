"""
뉴스 상세 페이지 파싱 테스트 스크립트

각 뉴스 사이트별로 본문과 이미지가 올바르게 추출되는지 테스트합니다.

사용 방법:
    python -m scripts.test_news_detail_parsing
    또는
    cd backend && python -m scripts.test_news_detail_parsing
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


async def test_mbnmoney_detail():
    """매일경제 뉴스 상세 파싱 테스트"""
    print("\n" + "="*80)
    print("[매일경제] 뉴스 상세 파싱 테스트")
    print("="*80)
    
    # 실제 매일경제 뉴스 URL
    test_url = "https://www.mk.co.kr/news/realestate/11936091"
    
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
        
        content = detail.get('content', '')
        print(f"\n본문 길이: {len(content)}자")
        if content:
            print(f"본문 미리보기 (처음 300자):\n{content[:300]}...")
            print(f"\n본문 끝부분 (마지막 200자):\n...{content[-200:]}")
        
        images = detail.get('images', [])
        images_metadata = detail.get('images_with_metadata', [])
        
        print(f"\n이미지 개수: {len(images)}개")
        if images:
            print("\n이미지 URL 목록:")
            for i, img_url in enumerate(images[:5], 1):  # 최대 5개만 표시
                print(f"  [{i}] {img_url}")
        
        if images_metadata:
            print(f"\n이미지 메타데이터: {len(images_metadata)}개")
            for i, img_meta in enumerate(images_metadata[:3], 1):  # 최대 3개만 표시
                print(f"  [{i}] 위치: {img_meta.get('position', 'N/A')}, URL: {img_meta.get('url', 'N/A')[:80]}...")
                if img_meta.get('caption'):
                    print(f"      캡션: {img_meta.get('caption', '')[:50]}")
        
        # 본문에 이미지 마커가 있는지 확인
        if '[IMAGE:' in content:
            import re
            image_markers = re.findall(r'\[IMAGE:\d+\]', content)
            print(f"\n본문 내 이미지 마커 개수: {len(image_markers)}개")
            print(f"마커 예시: {image_markers[:3]}")
        
        return True
        
    except Exception as e:
        print(f"\n[FAIL] 크롤링 실패: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_chosun_detail():
    """조선일보 뉴스 상세 파싱 테스트"""
    print("\n" + "="*80)
    print("[조선일보] 뉴스 상세 파싱 테스트")
    print("="*80)
    
    # 실제 조선일보 뉴스 URL
    test_url = "https://biz.chosun.com/real_estate/real_estate_general/2026/01/18/LU2LPYUUURCLLE277AUQPBNZOQ/"
    
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
        
        content = detail.get('content', '')
        print(f"\n본문 길이: {len(content)}자")
        if content:
            print(f"본문 미리보기 (처음 300자):\n{content[:300]}...")
            print(f"\n본문 끝부분 (마지막 200자):\n...{content[-200:]}")
        
        images = detail.get('images', [])
        images_metadata = detail.get('images_with_metadata', [])
        
        print(f"\n이미지 개수: {len(images)}개")
        if images:
            print("\n이미지 URL 목록:")
            for i, img_url in enumerate(images[:5], 1):
                print(f"  [{i}] {img_url}")
        
        if images_metadata:
            print(f"\n이미지 메타데이터: {len(images_metadata)}개")
            for i, img_meta in enumerate(images_metadata[:3], 1):
                print(f"  [{i}] 위치: {img_meta.get('position', 'N/A')}, URL: {img_meta.get('url', 'N/A')[:80]}...")
                if img_meta.get('caption'):
                    print(f"      캡션: {img_meta.get('caption', '')[:50]}")
        
        # 본문에 이미지 마커가 있는지 확인
        if '[IMAGE:' in content:
            import re
            image_markers = re.findall(r'\[IMAGE:\d+\]', content)
            print(f"\n본문 내 이미지 마커 개수: {len(image_markers)}개")
            print(f"마커 예시: {image_markers[:3]}")
        
        return True
        
    except Exception as e:
        print(f"\n[FAIL] 크롤링 실패: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_herald_detail():
    """해럴드경제 뉴스 상세 파싱 테스트"""
    print("\n" + "="*80)
    print("[해럴드경제] 뉴스 상세 파싱 테스트")
    print("="*80)
    
    # 실제 해럴드경제 뉴스 URL
    test_url = "https://biz.heraldcorp.com/article/10657203?sec=011"
    
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
        
        content = detail.get('content', '')
        print(f"\n본문 길이: {len(content)}자")
        if content:
            print(f"본문 미리보기 (처음 300자):\n{content[:300]}...")
            print(f"\n본문 끝부분 (마지막 200자):\n...{content[-200:]}")
        
        images = detail.get('images', [])
        images_metadata = detail.get('images_with_metadata', [])
        
        print(f"\n이미지 개수: {len(images)}개")
        if images:
            print("\n이미지 URL 목록:")
            for i, img_url in enumerate(images[:5], 1):
                print(f"  [{i}] {img_url}")
        
        if images_metadata:
            print(f"\n이미지 메타데이터: {len(images_metadata)}개")
            for i, img_meta in enumerate(images_metadata[:3], 1):
                print(f"  [{i}] 위치: {img_meta.get('position', 'N/A')}, URL: {img_meta.get('url', 'N/A')[:80]}...")
                if img_meta.get('caption'):
                    print(f"      캡션: {img_meta.get('caption', '')[:50]}")
        
        # 본문에 이미지 마커가 있는지 확인
        if '[IMAGE:' in content:
            import re
            image_markers = re.findall(r'\[IMAGE:\d+\]', content)
            print(f"\n본문 내 이미지 마커 개수: {len(image_markers)}개")
            print(f"마커 예시: {image_markers[:3]}")
        
        # 기자 사진이 포함되었는지 확인
        if images_metadata:
            reporter_images = []
            for img_meta in images_metadata:
                url = img_meta.get('url', '').lower()
                caption = img_meta.get('caption', '').lower()
                if any(keyword in (url + ' ' + caption) for keyword in ['기자', 'reporter', 'author', '이건욱', 'PD']):
                    reporter_images.append(img_meta)
            
            if reporter_images:
                print(f"\n  기자 사진으로 의심되는 이미지: {len(reporter_images)}개")
                for img in reporter_images:
                    print(f"  - {img.get('url', 'N/A')[:80]}...")
            else:
                print("\n 기자 사진 필터링 성공: 기자 사진이 포함되지 않았습니다.")
        
        return True
        
    except Exception as e:
        print(f"\n[FAIL] 크롤링 실패: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """메인 테스트 함수"""
    print("\n" + "="*80)
    print("[TEST] 뉴스 상세 페이지 파싱 테스트 시작")
    print("="*80)
    
    results = {}
    
    # 각 사이트별 테스트
    results['매일경제'] = await test_mbnmoney_detail()
    results['조선일보'] = await test_chosun_detail()
    results['해럴드경제'] = await test_herald_detail()
    
    # 결과 요약
    print("\n" + "="*80)
    print("[결과] 테스트 결과 요약")
    print("="*80)
    for site, success in results.items():
        status = " 성공" if success else " 실패"
        print(f"   {site}: {status}")
    
    success_count = sum(1 for s in results.values() if s)
    print(f"\n총 {len(results)}개 사이트 중 {success_count}개 성공")
    
    print("\n" + "="*80)
    print("테스트 완료!")
    print("="*80 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
