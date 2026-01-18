"""조선일보 HTML 구조 분석 스크립트"""
from bs4 import BeautifulSoup
import sys

# Windows에서 UTF-8 인코딩 설정
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# HTML 파일 읽기
with open('josonnews.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

print("="*80)
print("조선일보 HTML 구조 분석")
print("="*80)

# 1. article 태그 찾기
print("\n[1] article 태그 찾기:")
articles = soup.find_all('article', limit=5)
for i, article in enumerate(articles, 1):
    classes = article.get('class', [])
    print(f"  Article {i}: class={classes}")
    # article 내부의 주요 구조 확인
    sections = article.find_all(['section', 'div'], limit=3)
    for j, section in enumerate(sections, 1):
        sec_classes = section.get('class', [])
        print(f"    Section/Div {j}: {section.name}, class={sec_classes}")

# 2. 본문 관련 클래스 찾기
print("\n[2] 본문 관련 클래스/ID 찾기:")
keywords = ['article', 'content', 'body', 'text', 'main', 'view']
for keyword in keywords:
    elements = soup.find_all(['div', 'section', 'article'], 
                            class_=lambda x: x and keyword in str(x).lower(), 
                            limit=3)
    if elements:
        print(f"\n  '{keyword}' 포함:")
        for elem in elements:
            classes = elem.get('class', [])
            text_preview = elem.get_text(strip=True)[:100] if elem.get_text(strip=True) else ""
            print(f"    {elem.name}.{classes} - 텍스트 미리보기: {text_preview}...")

# 3. layout__article-main 찾기
print("\n[3] layout__article-main 구조 분석:")
main_article = soup.select_one('article.layout__article-main')
if main_article:
    print(f"  찾음! class={main_article.get('class', [])}")
    # 내부 구조 확인
    children = list(main_article.children)[:10]
    for i, child in enumerate(children, 1):
        if hasattr(child, 'name') and child.name:
            classes = child.get('class', [])
            text_preview = child.get_text(strip=True)[:50] if child.get_text(strip=True) else ""
            print(f"    자식 {i}: {child.name}.{classes} - {text_preview}...")
else:
    print("  layout__article-main을 찾을 수 없음")

# 4. section.article-body 찾기
print("\n[4] section.article-body 찾기:")
article_body = soup.select_one('section.article-body')
if article_body:
    print(f"  찾음! class={article_body.get('class', [])}")
    # 내부 구조 확인
    children = list(article_body.children)[:10]
    for i, child in enumerate(children, 1):
        if hasattr(child, 'name') and child.name:
            classes = child.get('class', [])
            text_preview = child.get_text(strip=True)[:50] if child.get_text(strip=True) else ""
            print(f"    자식 {i}: {child.name}.{classes} - {text_preview}...")
else:
    print("  section.article-body를 찾을 수 없음")

# 5. p 태그와 figure 태그 찾기
print("\n[5] 본문 내 p 태그와 figure 태그 찾기:")
# article 내부의 p 태그 찾기
main_article = soup.select_one('article.layout__article-main')
if main_article:
    p_tags = main_article.find_all('p', limit=5)
    print(f"  p 태그 {len(p_tags)}개 발견:")
    for i, p in enumerate(p_tags, 1):
        classes = p.get('class', [])
        text = p.get_text(strip=True)[:100]
        print(f"    p {i}.{classes}: {text}...")
    
    figure_tags = main_article.find_all('figure', limit=5)
    print(f"\n  figure 태그 {len(figure_tags)}개 발견:")
    for i, fig in enumerate(figure_tags, 1):
        classes = fig.get('class', [])
        img = fig.find('img')
        img_src = img.get('src', '') if img else '없음'
        print(f"    figure {i}.{classes}: img={img_src[:80]}...")

print("\n" + "="*80)
print("분석 완료")
print("="*80)
