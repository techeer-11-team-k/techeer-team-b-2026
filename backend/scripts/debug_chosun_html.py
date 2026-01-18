"""
조선일보 HTML 구조 디버깅 스크립트
"""
import asyncio
import sys
import io
from pathlib import Path

# Windows에서 UTF-8 인코딩 설정
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

import httpx
from bs4 import BeautifulSoup

async def debug_chosun_html():
    """조선일보 URL의 HTML 구조를 분석"""
    url = "https://biz.chosun.com/real_estate/real_estate_general/2026/01/18/LU2LPYUUURCLLE277AUQPBNZOQ/"
    
    print(f"URL: {url}\n")
    
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = await client.get(url, headers=headers)
        html = response.text
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # section.article-body 찾기
    print("="*80)
    print("1. section.article-body 검색")
    print("="*80)
    article_body = soup.select_one("section.article-body")
    if article_body:
        print("[OK] section.article-body 발견!")
        print(f"   클래스: {article_body.get('class')}")
        print(f"   내부 텍스트 길이: {len(article_body.get_text(strip=True))}자")
        
        # 내부 구조 확인
        p_tags = article_body.find_all('p', class_=lambda x: x and 'article-body__content-text' in ' '.join(x))
        print(f"   p.article-body__content-text 개수: {len(p_tags)}")
        
        figure_tags = article_body.find_all('figure', class_=lambda x: x and 'article-body__content-image' in ' '.join(x) if x else False)
        print(f"   figure.article-body__content-image 개수: {len(figure_tags)}")
        
        # 모든 자식 요소 확인
        print("\n   주요 자식 요소:")
        for i, child in enumerate(list(article_body.children)[:10], 1):
            if hasattr(child, 'name') and child.name:
                classes = child.get('class', [])
                print(f"   [{i}] <{child.name}> 클래스: {classes}")
    else:
        print("[FAIL] section.article-body를 찾을 수 없습니다.")
    
    # article.layout__article-main 찾기
    print("\n" + "="*80)
    print("2. article.layout__article-main 검색")
    print("="*80)
    article_main = soup.select_one("article.layout__article-main")
    if article_main:
        print("[OK] article.layout__article-main 발견!")
        print(f"   클래스: {article_main.get('class')}")
        
        # 내부의 section.article-body 찾기
        inner_section = article_main.select_one("section.article-body")
        if inner_section:
            print("[OK] 내부에 section.article-body 발견!")
            print(f"   내부 텍스트 길이: {len(inner_section.get_text(strip=True))}자")
        else:
            print("[FAIL] 내부에 section.article-body를 찾을 수 없습니다.")
    else:
        print("[FAIL] article.layout__article-main을 찾을 수 없습니다.")
    
    # p.article-body__content-text 직접 찾기
    print("\n" + "="*80)
    print("3. p.article-body__content-text 직접 검색")
    print("="*80)
    p_tags = soup.find_all('p', class_=lambda x: x and 'article-body__content-text' in ' '.join(x) if x else False)
    print(f"발견된 p.article-body__content-text 개수: {len(p_tags)}")
    if p_tags:
        for i, p in enumerate(p_tags[:3], 1):
            text = p.get_text(strip=True)
            print(f"\n   [{i}] 텍스트 길이: {len(text)}자")
            print(f"       미리보기: {text[:100]}...")
    
    # figure.article-body__content-image 직접 찾기
    print("\n" + "="*80)
    print("4. figure.article-body__content-image 직접 검색")
    print("="*80)
    figure_tags = soup.find_all('figure', class_=lambda x: x and 'article-body__content-image' in ' '.join(x) if x else False)
    print(f"발견된 figure.article-body__content-image 개수: {len(figure_tags)}")
    if figure_tags:
        for i, fig in enumerate(figure_tags[:3], 1):
            img = fig.find('img')
            if img:
                src = img.get('src') or img.get('data-src', 'N/A')
                print(f"\n   [{i}] 이미지 URL: {src[:80]}...")
    
    # 전체 article 태그 찾기
    print("\n" + "="*80)
    print("5. 모든 article 태그 검색")
    print("="*80)
    all_articles = soup.find_all('article')
    print(f"발견된 article 태그 개수: {len(all_articles)}")
    for i, art in enumerate(all_articles[:5], 1):
        classes = art.get('class', [])
        print(f"   [{i}] 클래스: {classes}")
        text_len = len(art.get_text(strip=True))
        print(f"       텍스트 길이: {text_len}자")
    
    # section 태그 찾기
    print("\n" + "="*80)
    print("6. 모든 section 태그 검색")
    print("="*80)
    all_sections = soup.find_all('section')
    print(f"발견된 section 태그 개수: {len(all_sections)}")
    for i, sec in enumerate(all_sections[:10], 1):
        classes = sec.get('class', [])
        if 'article' in ' '.join(classes).lower():
            text_len = len(sec.get_text(strip=True))
            print(f"   [{i}] 클래스: {classes}, 텍스트 길이: {text_len}자")

if __name__ == "__main__":
    asyncio.run(debug_chosun_html())
