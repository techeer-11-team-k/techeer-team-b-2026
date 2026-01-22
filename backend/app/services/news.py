"""
뉴스 서비스

뉴스 크롤링 및 비즈니스 로직을 담당합니다.

성능 최적화 (EC2 환경):
- HTTP 타임아웃 단축 (30초 → 15초)
- 동시 크롤링 수 제한 (asyncio.Semaphore)
- 연결 재사용 (httpx 연결 풀)
- 빠른 실패 전략 (개별 소스 실패 시 전체 차단 방지)
"""
import logging
import asyncio
import re
from datetime import datetime
from typing import List, Dict, Optional
from urllib.parse import urljoin, urlparse, quote

import httpx
from bs4 import BeautifulSoup
import feedparser

logger = logging.getLogger(__name__)

# DB 관련 import는 선택적으로 (뉴스 API는 DB 저장 없이 크롤링만 수행)
try:
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.crud.news import news as news_crud
    from app.schemas.news import NewsCreate
    DB_AVAILABLE = True
except (ImportError, AttributeError):
    # DB 모델이 없거나 CRUD가 없을 경우
    DB_AVAILABLE = False
    AsyncSession = None
    news_crud = None
    NewsCreate = None

# ===== 성능 최적화 상수 =====
HTTP_TIMEOUT = 15.0          # HTTP 타임아웃 (초) - 30초 → 15초
HTTP_CONNECT_TIMEOUT = 5.0   # 연결 타임아웃 (초) - 10초 → 5초
MAX_CONCURRENT_REQUESTS = 3  # 동시 크롤링 수 제한
RSS_PARSE_TIMEOUT = 10.0     # RSS 파싱 타임아웃 (초)


class NewsCrawler:
    """
    부동산 뉴스 크롤링 클래스
    
    여러 뉴스 소스에서 부동산 관련 뉴스를 수집합니다.
    """
    
    def __init__(self):
        """초기화"""
        self.timeout = httpx.Timeout(HTTP_TIMEOUT, connect=HTTP_CONNECT_TIMEOUT)
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
        }
        # 동시 요청 제한을 위한 세마포어
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    
    def _extract_content_with_images(self, element, source_type: str = "", base_url: str = "") -> tuple[str, list[dict]]:
        """
        본문과 이미지를 함께 추출하여 순서를 유지합니다.
        
        Args:
            element: BeautifulSoup 요소
            source_type: 뉴스 소스 타입 (mbnmoney, chosun, herald 등)
            
        Returns:
            (본문 텍스트, 이미지 리스트) 튜플
            이미지 리스트는 [{"url": "...", "caption": "...", "position": 0}] 형태
        """
        if not element:
            return "", []
        
        result_parts = []  # 텍스트와 이미지를 순서대로 저장
        images = []
        image_counter = 0
        
        # 제외할 이미지 패턴 (기자 사진, 프로필 등)
        exclude_image_patterns = [
            "기자", "reporter", "author", "profile", "thumbnail",
            "작성자", "필자", "대표", "사진=", "영상=", "PD",
            "reporterpeople", "reporter_people", "reporter-people",  # 해럴드경제 기자 사진
            "월천대사", "이주현", "이건욱"  # 해럴드경제 기자 이름 패턴
        ]
        
        def should_exclude_image(img_tag):
            """이미지가 제외 대상인지 확인"""
            # alt 텍스트 확인
            alt_text = img_tag.get("alt", "").lower()
            caption_text = ""
            
            # 부모 요소에서 캡션 찾기
            parent = img_tag.parent
            if parent:
                # figcaption, caption 클래스 등 찾기
                caption_elem = parent.find("figcaption") or parent.find(class_=re.compile("caption", re.I))
                if caption_elem:
                    caption_text = caption_elem.get_text(strip=True).lower()
                
                # 부모의 부모도 확인 (해럴드경제 구조)
                grandparent = parent.parent if parent.parent else None
                if grandparent:
                    grandparent_caption = grandparent.find("figcaption") or grandparent.find(class_=re.compile("caption", re.I))
                    if grandparent_caption:
                        caption_text += " " + grandparent_caption.get_text(strip=True).lower()
            
            # 제외 패턴 확인
            combined_text = (alt_text + " " + caption_text).lower()
            for pattern in exclude_image_patterns:
                if pattern in combined_text:
                    return True
            
            # 해럴드경제 특수 케이스: 기자 사진은 보통 작은 이미지이거나 특정 클래스를 가짐
            if source_type == "해럴드경제":
                # 작은 이미지 제외 (기자 사진은 보통 작음)
                width = img_tag.get("width") or img_tag.get("style", "")
                if isinstance(width, str):
                    width_match = re.search(r'width[:\s]+(\d+)', width)
                    if width_match:
                        width = int(width_match.group(1))
                if isinstance(width, (int, str)) and str(width).isdigit():
                    if int(width) < 200:  # 200px 미만은 제외 (해럴드경제는 더 큰 임계값)
                        # 단, alt나 caption에 뉴스 관련 키워드가 있으면 제외하지 않음
                        if not any(keyword in combined_text for keyword in ["경매", "아파트", "부동산", "주택", "단지", "건물"]):
                            return True
                
                # 특정 클래스나 구조를 가진 이미지 제외
                img_classes = " ".join(img_tag.get("class", [])).lower()
                parent_classes = " ".join(parent.get("class", []) if parent and parent.get("class") else []).lower()
                grandparent_classes = ""
                if parent and parent.parent:
                    grandparent_classes = " ".join(parent.parent.get("class", []) if parent.parent.get("class") else []).lower()
                
                all_classes = (img_classes + " " + parent_classes + " " + grandparent_classes).lower()
                if any(excluded in all_classes for excluded in ["author", "writer", "profile", "byline", "reporter"]):
                    return True
                
                # 해럴드경제: .article-photo-wrap 안의 이미지만 포함 (기자 사진은 다른 위치에 있음)
                # .article-photo-wrap 안에 있지 않은 작은 이미지는 제외
                if parent:
                    is_in_photo_wrap = False
                    current = parent
                    for _ in range(3):  # 최대 3단계 상위 요소 확인
                        if current and hasattr(current, 'get'):
                            current_classes = " ".join(current.get("class", []) if current.get("class") else []).lower()
                            if "article-photo" in current_classes or "photo-wrap" in current_classes:
                                is_in_photo_wrap = True
                                break
                            current = current.parent if hasattr(current, 'parent') else None
                    
                    if not is_in_photo_wrap:
                        # photo-wrap 안에 없고 작은 이미지는 제외
                        width = img_tag.get("width") or img_tag.get("style", "")
                        if isinstance(width, str):
                            width_match = re.search(r'width[:\s]+(\d+)', width)
                            if width_match:
                                width = int(width_match.group(1))
                        if isinstance(width, (int, str)) and str(width).isdigit():
                            if int(width) < 300:  # 300px 미만은 제외
                                return True
            
            # 작은 이미지 제외 (아이콘, 프로필 등) - 일반적인 경우
            width = img_tag.get("width") or img_tag.get("style", "")
            if isinstance(width, str):
                width_match = re.search(r'width[:\s]+(\d+)', width)
                if width_match:
                    width = int(width_match.group(1))
            if isinstance(width, (int, str)) and str(width).isdigit():
                if int(width) < 100:  # 100px 미만은 제외
                    return True
            
            return False
        
        def process_element(elem, depth=0):
            """요소를 순회하며 텍스트와 이미지를 순서대로 추출"""
            if not elem or depth > 20:
                return
            
            for child in elem.children:
                if hasattr(child, 'name') and child.name:
                    # 이미지 태그 처리
                    if child.name == 'img':
                        img_url = (
                            child.get("src") or 
                            child.get("data-src") or 
                            child.get("data-lazy-src") or
                            child.get("data-original")
                        )
                        
                        if img_url:
                            img_url = img_url.strip()
                            
                            # 제외할 이미지 확인
                            if should_exclude_image(child):
                                continue
                            
                            # 기본 이미지 제외
                            if any(excluded in img_url.lower() for excluded in [
                                "default_image", "noimage", "placeholder", 
                                "blank", "spacer", "transparent", "1x1",
                                "reporterpeople", "reporter_people", "reporter-people"  # 기자 사진
                            ]):
                                continue
                            
                            # URL 정규화
                            if img_url.startswith("//"):
                                img_url = "https:" + img_url
                            elif img_url.startswith("/"):
                                if base_url:
                                    img_url = urljoin(base_url, img_url)
                            elif not img_url.startswith("http") and base_url:
                                img_url = urljoin(base_url, img_url)
                            
                            if img_url.startswith("http"):
                                # 캡션 추출
                                caption = ""
                                parent = child.parent
                                if parent:
                                    caption_elem = parent.find("figcaption") or parent.find(class_=re.compile("caption", re.I))
                                    if caption_elem:
                                        caption = caption_elem.get_text(strip=True)
                                
                                result_parts.append({
                                    "type": "image",
                                    "url": img_url,
                                    "caption": caption,
                                    "position": image_counter
                                })
                                images.append({
                                    "url": img_url,
                                    "caption": caption,
                                    "position": image_counter
                                })
                                image_counter += 1
                    
                    # 문단 태그 처리
                    elif child.name in ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre']:
                        text = child.get_text(separator=" ", strip=True)
                        # 조선일보: article-body__content-text 클래스를 가진 p 태그는 무조건 포함
                        if source_type == "조선일보" and child.name == 'p':
                            classes = child.get("class", [])
                            if isinstance(classes, list):
                                classes_str = " ".join(classes).lower()
                            else:
                                classes_str = str(classes).lower()
                            if "article-body__content-text" in classes_str or "article-body__content" in classes_str:
                                # 조선일보 본문 p 태그는 최소 길이 제한 없이 포함
                                if text and len(text.strip()) > 0:
                                    result_parts.append({
                                        "type": "text",
                                        "content": text
                                    })
                        elif text and len(text) > 3:
                            result_parts.append({
                                "type": "text",
                                "content": text
                            })
                    
                    # br 태그 처리
                    elif child.name == 'br':
                        result_parts.append({
                            "type": "text",
                            "content": ""
                        })
                    
                    # figure 태그 처리 (이미지가 포함된 경우가 많음)
                    elif child.name == 'figure':
                        # figure 안의 img 태그 찾기
                        img_in_figure = child.find('img')
                        if img_in_figure:
                            img_url = (
                                img_in_figure.get("src") or 
                                img_in_figure.get("data-src") or 
                                img_in_figure.get("data-lazy-src") or
                                img_in_figure.get("data-original")
                            )
                            
                            if img_url:
                                img_url = img_url.strip()
                                
                                # 제외할 이미지 확인
                                if not should_exclude_image(img_in_figure):
                                    # 기본 이미지 제외
                                    if not any(excluded in img_url.lower() for excluded in [
                                        "default_image", "noimage", "placeholder", 
                                        "blank", "spacer", "transparent", "1x1",
                                        "reporterpeople", "reporter_people", "reporter-people"
                                    ]):
                                        # URL 정규화
                                        if img_url.startswith("//"):
                                            img_url = "https:" + img_url
                                        elif img_url.startswith("/"):
                                            if base_url:
                                                img_url = urljoin(base_url, img_url)
                                        elif not img_url.startswith("http") and base_url:
                                            img_url = urljoin(base_url, img_url)
                                        
                                        if img_url.startswith("http"):
                                            # 캡션 추출 (figure 내부의 figcaption)
                                            caption = ""
                                            caption_elem = child.find("figcaption") or child.find(class_=re.compile("caption", re.I))
                                            if caption_elem:
                                                caption = caption_elem.get_text(strip=True)
                                            
                                            result_parts.append({
                                                "type": "image",
                                                "url": img_url,
                                                "caption": caption,
                                                "position": image_counter
                                            })
                                            images.append({
                                                "url": img_url,
                                                "caption": caption,
                                                "position": image_counter
                                            })
                                            image_counter += 1
                        # figure 안의 텍스트도 재귀 처리 (캡션 등)
                        process_element(child, depth + 1)
                    
                    # 컨테이너 요소 재귀 처리
                    elif child.name in ['div', 'section', 'article', 'main', 'aside', 'span', 'strong', 'em', 'b', 'i']:
                        process_element(child, depth + 1)
                
                elif isinstance(child, str):
                    # 텍스트 노드
                    text = child.strip()
                    if text and len(text) > 2:
                        # 마지막이 텍스트면 병합, 아니면 새로 추가
                        if result_parts and result_parts[-1].get("type") == "text":
                            result_parts[-1]["content"] += " " + text
                        else:
                            result_parts.append({
                                "type": "text",
                                "content": text
                            })
        
        process_element(element)
        
        # 텍스트와 이미지를 순서대로 결합하여 본문 생성
        # 이미지 위치는 특수 마커로 표시 (프론트엔드에서 처리 가능)
        content_parts = []
        for part in result_parts:
            if part["type"] == "text":
                if part["content"]:  # 빈 텍스트는 제외
                    content_parts.append(part["content"])
            elif part["type"] == "image":
                # 이미지 위치 마커 삽입 (프론트엔드에서 이미지로 교체 가능)
                # 마커 형식: [IMAGE:0] (이미지 인덱스)
                content_parts.append(f"[IMAGE:{part['position']}]")
        
        content = "\n\n".join(content_parts)
        content = re.sub(r'\n{3,}', '\n\n', content).strip()
        # 연속된 이미지 마커 정리
        content = re.sub(r'\[IMAGE:\d+\]\n+\[IMAGE:\d+\]', lambda m: m.group(0).replace('\n', ' '), content)
        
        return content, images
    
    def _extract_text_with_paragraph_breaks(self, element) -> str:
        """
        요소에서 텍스트를 추출하되, 문단 태그 사이에 명시적인 줄바꿈을 추가합니다.
        개선: 재귀적으로 모든 중첩 구조를 처리하여 전문이 잘리지 않도록 함.
        
        Args:
            element: BeautifulSoup 요소
            
        Returns:
            문단 태그 사이에 줄바꿈이 추가된 텍스트
        """
        if not element:
            return ""
        
        # 문단 태그 목록 (블록 레벨 요소)
        paragraph_tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre']
        # 컨테이너 태그 (내부에 문단이 있을 수 있음)
        container_tags = ['div', 'section', 'article', 'main', 'aside']
        # 제외할 태그 (이미 decompose되었지만 혹시 모를 경우 대비)
        exclude_tags = ['script', 'style', 'iframe', 'noscript', 'svg', 'nav']
        
        paragraphs = []
        
        def extract_recursive(elem, depth=0):
            """재귀적으로 텍스트 추출 (무한 재귀 방지)"""
            if not elem or depth > 15:  # 깊이 제한
                return
            
            # 제외할 태그는 건너뛰기
            if hasattr(elem, 'name') and elem.name in exclude_tags:
                return
            
            # 직접 자식 요소들을 순회
            for child in elem.children:
                if hasattr(child, 'name') and child.name:
                    # 문단 태그인 경우 - 직접 텍스트 추출
                    if child.name in paragraph_tags:
                        text = child.get_text(separator=" ", strip=True)
                        if text and len(text) > 3:  # 너무 짧은 텍스트 제외
                            paragraphs.append(text)
                    # br 태그인 경우 명시적인 줄바꿈 추가
                    elif child.name == 'br':
                        paragraphs.append("")
                    # 컨테이너 요소인 경우 재귀적으로 처리
                    elif child.name in container_tags:
                        extract_recursive(child, depth + 1)
                    # 기타 태그도 재귀적으로 처리 (span, strong, em 등)
                    else:
                        # 텍스트가 있는 경우에만 재귀 처리
                        child_text = child.get_text(strip=True)
                        if child_text and len(child_text) > 5:
                            extract_recursive(child, depth + 1)
                elif isinstance(child, str):
                    # 텍스트 노드인 경우
                    text = child.strip()
                    if text and len(text) > 2:
                        # 마지막 문단이 있으면 공백으로 연결, 없으면 새 문단 생성
                        if paragraphs and paragraphs[-1]:
                            paragraphs[-1] += " " + text
                        else:
                            paragraphs.append(text)
        
        # 재귀적으로 텍스트 추출
        extract_recursive(element)
        
        # 문단들을 두 개의 줄바꿈으로 연결 (명시적인 문단 구분)
        result = "\n\n".join(paragraphs)
        
        # 연속된 빈 줄 정리 (3개 이상 -> 2개로)
        result = re.sub(r'\n{3,}', '\n\n', result)
        
        # 앞뒤 공백 제거
        result = result.strip()
        
        # 결과가 비어있거나 너무 짧으면 fallback으로 기존 방식 사용
        if not result or len(result) < 50:
            fallback_text = element.get_text(separator="\n", strip=True)
            if fallback_text and len(fallback_text) > len(result):
                # fallback 텍스트를 문단 단위로 정리
                fallback_text = re.sub(r'\n{3,}', '\n\n', fallback_text)
                logger.debug(f"[_extract_text_with_paragraph_breaks] Fallback 사용: 원본 길이={len(result)}, fallback 길이={len(fallback_text)}")
                return fallback_text.strip()
        
        # 결과가 여전히 비어있으면 경고 로그
        if not result:
            logger.warning(f"[_extract_text_with_paragraph_breaks] 빈 결과 반환: element={element.name if hasattr(element, 'name') else 'unknown'}")
            # 최후의 수단: 전체 텍스트 추출
            final_fallback = element.get_text(separator="\n", strip=True)
            if final_fallback:
                return re.sub(r'\n{3,}', '\n\n', final_fallback).strip()
        
        return result
    
    async def crawl_mbnmoney_realestate_rss(self, limit: int = 50) -> List[Dict]:
        """
        매일경제 부동산 RSS 피드에서 뉴스 수집
        
        Args:
            limit: 최대 수집 개수
            
        Returns:
            뉴스 딕셔너리 리스트
        """
        rss_url = "https://mbnmoney.mbn.co.kr/rss/news/estate"
        news_list = []
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                response = await client.get(rss_url)
                response.raise_for_status()
                
                # RSS 파싱
                feed = feedparser.parse(response.text)
                
                for entry in feed.entries[:limit]:
                    try:
                        # 발행일 파싱
                        published_at = datetime.utcnow()
                        if hasattr(entry, 'published_parsed') and entry.published_parsed:
                            published_at = datetime(*entry.published_parsed[:6])
                        elif hasattr(entry, 'published') and entry.published:
                            try:
                                if hasattr(entry, 'published_parsed'):
                                    published_at = datetime(*entry.published_parsed[:6])
                            except:
                                pass
                        
                        # 카테고리 추출
                        category = "일반"
                        if hasattr(entry, 'tags') and entry.tags:
                            category = entry.tags[0].term if entry.tags else "일반"
                        elif hasattr(entry, 'category'):
                            category = entry.category
                        
                        # description에서 HTML 제거 및 썸네일 추출
                        description_html = entry.get("summary", "") or entry.get("description", "")
                        thumbnail_url = None
                        content = ""
                        
                        if description_html:
                            desc_soup = BeautifulSoup(description_html, "html.parser")
                            img_tag = desc_soup.find("img")
                            if img_tag and img_tag.get("src"):
                                thumbnail_url = img_tag.get("src")
                            content = desc_soup.get_text(strip=True)
                        
                        news_item = {
                            "title": entry.title,
                            "content": content,
                            "source": "매일경제",
                            "url": entry.link,
                            "thumbnail_url": thumbnail_url,
                            "category": category,
                            "published_at": published_at,
                        }
                        news_list.append(news_item)
                    except Exception as e:
                        logger.warning(f"RSS 항목 파싱 실패: {e}")
                        continue
                        
        except Exception as e:
            logger.error(f"매일경제 부동산 RSS 크롤링 실패: {e}")
            
        return news_list
    
    async def crawl_chosun_realestate_rss(self, limit: int = 50) -> List[Dict]:
        """
        조선일보 RSS 피드에서 뉴스 수집 (부동산 키워드가 있으면 우선, 없으면 후순위)
        
        Args:
            limit: 최대 수집 개수
            
        Returns:
            뉴스 딕셔너리 리스트 (부동산 관련 우선, 그 외 후순위)
        """
        rss_urls = [
            "https://www.chosun.com/arc/outboundfeeds/rss/category/economy/?outputType=xml",
            "https://www.chosun.com/arc/outboundfeeds/rss/category/national/?outputType=xml",
        ]
        news_list_priority = []
        news_list_low_priority = []
        
        for rss_url in rss_urls:
            try:
                async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                    response = await client.get(rss_url)
                    response.raise_for_status()
                    
                    feed = feedparser.parse(response.text)
                    
                    for entry in feed.entries[:limit]:
                        try:
                            title = entry.get("title", "")
                            description = entry.get("summary", "") or entry.get("description", "")
                            
                            real_estate_keywords = ["부동산", "아파트", "주택", "매매", "전세", "월세", "분양", "재개발", "재건축", "토지", "건설"]
                            has_real_estate_keyword = any(keyword in title or keyword in description for keyword in real_estate_keywords)
                            
                            published_at = datetime.utcnow()
                            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                                published_at = datetime(*entry.published_parsed[:6])
                            
                            category = "일반"
                            if hasattr(entry, 'tags') and entry.tags:
                                category = entry.tags[0].term if entry.tags else "일반"
                            elif hasattr(entry, 'category'):
                                category = entry.category
                            
                            description_html = description
                            thumbnail_url = None
                            content = ""
                            
                            if description_html:
                                desc_soup = BeautifulSoup(description_html, "html.parser")
                                img_tag = desc_soup.find("img")
                                if img_tag and img_tag.get("src"):
                                    thumbnail_url = img_tag.get("src")
                                content = desc_soup.get_text(strip=True)
                            
                            news_item = {
                                "title": title,
                                "content": content,
                                "source": "조선일보",
                                "url": entry.link,
                                "thumbnail_url": thumbnail_url,
                                "category": category,
                                "published_at": published_at,
                            }
                            
                            if has_real_estate_keyword:
                                news_list_priority.append(news_item)
                            else:
                                news_list_low_priority.append(news_item)
                                
                        except Exception as e:
                            logger.warning(f"조선일보 RSS 항목 파싱 실패: {e}")
                            continue
                            
            except Exception as e:
                logger.error(f"조선일보 RSS 크롤링 실패 ({rss_url}): {e}")
                continue
        
        result = news_list_priority[:limit]
        remaining_slots = limit - len(result)
        if remaining_slots > 0:
            result.extend(news_list_low_priority[:remaining_slots])
        
        return result
    
    async def crawl_herald_realestate_rss(self, limit: int = 50) -> List[Dict]:
        """
        해럴드경제 부동산 RSS 피드에서 뉴스 수집
        """
        rss_urls = [
            "https://biz.heraldcorp.com/rss/google/realestate",
            "https://biz.heraldcorp.com/rss/google/economy",
        ]
        news_list = []
        
        for rss_url in rss_urls:
            try:
                async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                    response = await client.get(rss_url)
                    response.raise_for_status()
                    
                    feed = feedparser.parse(response.text)
                    
                    for entry in feed.entries[:limit]:
                        try:
                            title = entry.get("title", "")
                            description = entry.get("summary", "") or entry.get("description", "")
                            
                            real_estate_keywords = ["부동산", "아파트", "주택", "매매", "전세", "월세", "분양", "재개발", "재건축", "토지", "건설"]
                            if not any(keyword in title or keyword in description for keyword in real_estate_keywords):
                                continue
                            
                            published_at = datetime.utcnow()
                            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                                published_at = datetime(*entry.published_parsed[:6])
                            
                            category = "일반"
                            if hasattr(entry, 'tags') and entry.tags:
                                category = entry.tags[0].term if entry.tags else "일반"
                            elif hasattr(entry, 'category'):
                                category = entry.category
                            
                            description_html = description
                            thumbnail_url = None
                            content = ""
                            
                            if description_html:
                                desc_soup = BeautifulSoup(description_html, "html.parser")
                                img_tag = desc_soup.find("img")
                                if img_tag and img_tag.get("src"):
                                    thumbnail_url = img_tag.get("src")
                                content = desc_soup.get_text(strip=True)
                            
                            news_item = {
                                "title": title,
                                "content": content,
                                "source": "해럴드경제",
                                "url": entry.link,
                                "thumbnail_url": thumbnail_url,
                                "category": category,
                                "published_at": published_at,
                            }
                            news_list.append(news_item)
                        except Exception as e:
                            logger.warning(f"해럴드경제 RSS 항목 파싱 실패: {e}")
                            continue
                            
            except Exception as e:
                logger.error(f"해럴드경제 부동산 RSS 크롤링 실패 ({rss_url}): {e}")
                continue
        
        return news_list
    
    async def crawl_hankyung_realestate_rss(self, limit: int = 50) -> List[Dict]:
        """
        한국경제 부동산 RSS 피드에서 뉴스 수집
        """
        rss_urls = [
            "https://www.hankyung.com/feed/realestate",
            "https://www.hankyung.com/feed/economy",
        ]
        news_list = []
        
        for rss_url in rss_urls:
            try:
                async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                    response = await client.get(rss_url)
                    response.raise_for_status()
                    
                    feed = feedparser.parse(response.text)
                    
                    for entry in feed.entries[:limit]:
                        try:
                            title = entry.get("title", "")
                            description = entry.get("summary", "") or entry.get("description", "")
                            
                            real_estate_keywords = ["부동산", "아파트", "주택", "매매", "전세", "월세", "분양", "재개발", "재건축", "토지", "건설"]
                            if not any(keyword in title or keyword in description for keyword in real_estate_keywords):
                                continue
                            
                            published_at = datetime.utcnow()
                            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                                published_at = datetime(*entry.published_parsed[:6])
                            
                            category = "일반"
                            if hasattr(entry, 'tags') and entry.tags:
                                category = entry.tags[0].term if entry.tags else "일반"
                            elif hasattr(entry, 'category'):
                                category = entry.category
                            
                            description_html = description
                            thumbnail_url = None
                            content = ""
                            
                            if description_html:
                                desc_soup = BeautifulSoup(description_html, "html.parser")
                                img_tag = desc_soup.find("img")
                                if img_tag and img_tag.get("src"):
                                    thumbnail_url = img_tag.get("src")
                                content = desc_soup.get_text(strip=True)
                            
                            news_item = {
                                "title": title,
                                "content": content,
                                "source": "한국경제",
                                "url": entry.link,
                                "thumbnail_url": thumbnail_url,
                                "category": category,
                                "published_at": published_at,
                            }
                            news_list.append(news_item)
                        except Exception as e:
                            logger.warning(f"한국경제 RSS 항목 파싱 실패: {e}")
                            continue
                            
            except Exception as e:
                logger.error(f"한국경제 부동산 RSS 크롤링 실패 ({rss_url}): {e}")
                continue
        
        return news_list
    
    async def crawl_naver_realestate(self, limit: int = 20) -> List[Dict]:
        """
        네이버 부동산 뉴스 섹션 크롤링
        """
        base_url = "https://land.naver.com/news/headline.naver"
        news_list = []
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                response = await client.get(base_url)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, "html.parser")
                
                news_list_container = soup.find("ul", class_="land_news_list") or soup.find("ul", id="land_news_list")
                
                if not news_list_container:
                    logger.warning("뉴스 리스트 컨테이너를 찾을 수 없습니다.")
                    return news_list
                
                news_items = news_list_container.find_all("li", class_="news_item", limit=limit)
                
                if len(news_items) == 0:
                    logger.warning("뉴스 항목을 찾을 수 없습니다.")
                    return news_list
                
                logger.info(f"네이버 부동산 뉴스 {len(news_items)}개 발견")
                
                for news_item in news_items:
                    try:
                        link_elem = news_item.find("a", class_="link")
                        if not link_elem:
                            continue
                        
                        url = link_elem.get("href", "")
                        if not url:
                            continue
                        
                        if url.startswith("http://") or url.startswith("https://"):
                            pass
                        elif url.startswith("/"):
                            url = urljoin("https://land.naver.com", url)
                        else:
                            url = urljoin(base_url, url)
                        
                        title_elem = link_elem.find("p", class_="title")
                        if not title_elem:
                            continue
                        title = title_elem.get_text(strip=True)
                        if not title:
                            continue
                        
                        content = ""
                        source = "네이버 부동산"
                        
                        description_elems = link_elem.find_all("p", class_="description")
                        for desc_elem in description_elems:
                            classes = desc_elem.get("class", [])
                            if "source" in classes:
                                source_text = desc_elem.get_text(strip=True)
                                if source_text:
                                    source = source_text
                            else:
                                content = desc_elem.get_text(strip=True)
                        
                        thumbnail_url = None
                        thumb_img_div = link_elem.find("div", class_="thumb_img")
                        if thumb_img_div:
                            img_elem = thumb_img_div.find("img")
                            if img_elem:
                                thumbnail_url = img_elem.get("src") or img_elem.get("data-src")
                        
                        published_at = datetime.utcnow()
                        if thumbnail_url:
                            date_match = re.search(r'/(\d{4})/(\d{2})/(\d{2})/', thumbnail_url)
                            if date_match:
                                try:
                                    year, month, day = map(int, date_match.groups())
                                    published_at = datetime(year, month, day)
                                except:
                                    pass
                        
                        category = "일반"
                        
                        news_item_dict = {
                            "title": title,
                            "content": content,
                            "source": source,
                            "url": url,
                            "thumbnail_url": thumbnail_url,
                            "category": category,
                            "published_at": published_at,
                        }
                        news_list.append(news_item_dict)
                        
                    except Exception as e:
                        logger.warning(f"네이버 부동산 뉴스 항목 파싱 실패: {e}")
                        continue
                        
        except Exception as e:
            logger.error(f"네이버 부동산 뉴스 크롤링 실패: {e}")
            
        return news_list
    
    async def crawl_news_detail(self, url: str) -> Optional[Dict]:
        """
        뉴스 상세 페이지에서 전체 내용 크롤링
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                response = await client.get(url)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, "html.parser")
                
                source = "알 수 없음"
                is_mbnmoney = "mbnmoney.mbn.co.kr" in url or "mbn.co.kr" in url or "www.mk.co.kr" in url or "mk.co.kr" in url
                is_naver = "naver.com" in url or "land.naver.com" in url
                is_chosun = "chosun.com" in url or "biz.chosun.com" in url
                is_herald = "heraldcorp.com" in url or "biz.heraldcorp.com" in url
                is_hankyung = "hankyung.com" in url
                
                if is_mbnmoney:
                    source = "매일경제"
                elif is_chosun:
                    source = "조선일보"
                elif is_herald:
                    source = "해럴드경제"
                elif is_hankyung:
                    source = "한국경제"
                elif is_naver:
                    source = "네이버"
                
                # 제목 추출
                title = None
                
                if is_mbnmoney:
                    title_selectors_mbn = [
                        ".newsview_title h1",  # mbnmoney.mbn.co.kr
                        ".news_title h1",  # www.mk.co.kr
                        "h1.news_title",  # www.mk.co.kr
                        ".article_title h1",  # www.mk.co.kr
                        "h1.article_title"  # www.mk.co.kr
                    ]
                    for selector in title_selectors_mbn:
                        title_elem = soup.select_one(selector)
                        if title_elem:
                            title = title_elem.get_text(strip=True)
                            if title and title != "제목 없음":
                                break
                
                if not title and is_chosun:
                    title_selectors_chosun = [
                        ".article_title",
                        ".article-header h1",
                        "h1.article-title",
                        ".headline h1"
                    ]
                    for selector in title_selectors_chosun:
                        title_elem = soup.select_one(selector)
                        if title_elem:
                            title = title_elem.get_text(strip=True)
                            if title and title != "제목 없음":
                                break
                
                if not title and is_herald:
                    title_selectors_herald = [
                        ".article-title",
                        ".view-title",
                        "h1.view-title",
                        ".article-header h1"
                    ]
                    for selector in title_selectors_herald:
                        title_elem = soup.select_one(selector)
                        if title_elem:
                            title = title_elem.get_text(strip=True)
                            if title and title != "제목 없음":
                                break
                
                if not title and is_hankyung:
                    title_selectors_hankyung = [
                        ".article-title",
                        ".article-header h1",
                        "h1.article-title",
                        ".headline h1"
                    ]
                    for selector in title_selectors_hankyung:
                        title_elem = soup.select_one(selector)
                        if title_elem:
                            title = title_elem.get_text(strip=True)
                            if title and title != "제목 없음":
                                break
                
                if not title:
                    title_selectors = [
                        "h1.article_title",
                        ".article_title",
                        "h1.media_end_head_headline",
                        ".media_end_head_headline",
                        "h1",
                        "h2.media_end_head_headline",
                        ".news_title"
                    ]
                    
                    for selector in title_selectors:
                        title_elem = soup.select_one(selector)
                        if title_elem:
                            title = title_elem.get_text(strip=True)
                            if title and title != "제목 없음":
                                break
                
                if not title:
                    og_title = soup.find("meta", property="og:title")
                    if og_title:
                        title = og_title.get("content", "").strip()
                
                if not title:
                    title_elem = soup.find("title")
                    if title_elem:
                        title = title_elem.get_text(strip=True)
                
                if not title:
                    title = "제목 없음"
                
                # 본문 추출 - 여러 셀렉터를 시도하고 가장 긴 본문을 선택
                content = None
                content_candidates = []  # 모든 후보 본문 저장
                images = []  # 본문 내 이미지 (순서 유지)
                
                # 제거할 요소 목록 (광고, 댓글 등)
                unwanted_tags = ["script", "style", "iframe", "aside", "nav", "header", "footer"]
                unwanted_classes = ["ad", "advertisement", "comment", "related", "recommend", "social", "share"]
                
                def clean_element(elem):
                    """불필요한 요소 제거"""
                    if not elem:
                        return
                    # 태그로 제거
                    for tag in unwanted_tags:
                        for unwanted in elem.find_all(tag):
                            unwanted.decompose()
                    # 클래스로 제거
                    for class_name in unwanted_classes:
                        for unwanted in elem.find_all(class_=re.compile(class_name, re.I)):
                            unwanted.decompose()
                    # 특정 클래스 패턴 제거
                    for unwanted in elem.find_all(class_=re.compile(r'(comment|ad|advertisement|related|recommend|social|share)', re.I)):
                        unwanted.decompose()
                
                def try_extract_content_with_images(selector, source_name=""):
                    """셀렉터로 본문과 이미지를 함께 추출 시도"""
                    content_elem = soup.select_one(selector)
                    if content_elem:
                        # 요소 복사 (원본 보존)
                        elem_copy = BeautifulSoup(str(content_elem), 'html.parser')
                        clean_element(elem_copy)
                        
                        # 본문과 이미지 함께 추출
                        extracted_content, extracted_images = self._extract_content_with_images(elem_copy, source_name, url)
                        
                        if extracted_content and len(extracted_content) > 50:
                            content_candidates.append({
                                'content': extracted_content,
                                'images': extracted_images,
                                'length': len(extracted_content),
                                'selector': selector,
                                'source': source_name
                            })
                            logger.debug(f"[본문 추출] {source_name} - {selector}: {len(extracted_content)}자, 이미지 {len(extracted_images)}개")
                
                def try_extract_content(selector, source_name=""):
                    """셀렉터로 본문 추출 시도 (기존 방식)"""
                    content_elem = soup.select_one(selector)
                    if content_elem:
                        # 요소 복사 (원본 보존)
                        elem_copy = BeautifulSoup(str(content_elem), 'html.parser')
                        clean_element(elem_copy)
                        extracted = self._extract_text_with_paragraph_breaks(elem_copy)
                        if extracted and len(extracted) > 50:
                            content_candidates.append({
                                'content': extracted,
                                'images': [],
                                'length': len(extracted),
                                'selector': selector,
                                'source': source_name
                            })
                            logger.debug(f"[본문 추출] {source_name} - {selector}: {len(extracted)}자")
                
                # 소스별 셀렉터 시도 (본문과 이미지 함께 추출)
                if is_mbnmoney:
                    # 매일경제: .news_contents 전체를 추출하여 순서 유지 (mbnmoney.mbn.co.kr)
                    try_extract_content_with_images(".news_contents", "매일경제")
                    try_extract_content_with_images(".news_contents .con_sub", "매일경제")
                    try_extract_content(".con_sub", "매일경제")
                    # 매일경제: www.mk.co.kr 도메인
                    try_extract_content_with_images(".news_view_body", "매일경제")
                    try_extract_content_with_images(".news_view_body .news_txt", "매일경제")
                    try_extract_content_with_images("#article_body", "매일경제")
                    try_extract_content_with_images(".article_body", "매일경제")
                    try_extract_content(".news_view_body", "매일경제")
                    try_extract_content(".news_txt", "매일경제")
                
                if is_chosun:
                    # 조선일보: section.article-body 전체를 추출하여 순서 유지
                    # 조선일보는 section.article-body 안에 p.article-body__content-text와 figure.article-body__content-image가 순서대로 있음
                    # 우선순위: section.article-body (가장 정확한 셀렉터)
                    try_extract_content_with_images("section.article-body", "조선일보")
                    # article.layout__article-main 내부의 section.article-body
                    try_extract_content_with_images("article.layout__article-main section.article-body", "조선일보")
                    # 클래스명에 | 문자가 포함되어 있어도 작동하도록
                    try_extract_content_with_images("article[class*='layout__article-main'] section.article-body", "조선일보")
                    # 전체 article도 시도
                    try_extract_content_with_images("article.layout__article-main", "조선일보")
                    try_extract_content_with_images(".article-body", "조선일보")
                    # biz.chosun.com 도메인 - 개별 요소들도 시도
                    try_extract_content_with_images(".article-body__content", "조선일보")
                    try_extract_content_with_images(".article-body__content-wrapper", "조선일보")
                    try_extract_content_with_images("article.article-body", "조선일보")
                    try_extract_content_with_images(".article-view__body", "조선일보")
                    # 조선일보 특화: p.article-body__content-text와 figure.article-body__content-image를 직접 찾아서 순서대로 추출
                    article_body_section = soup.select_one("section.article-body")
                    if article_body_section:
                        # section.article-body 내부의 모든 자식 요소를 순서대로 처리
                        elem_copy = BeautifulSoup(str(article_body_section), 'html.parser')
                        clean_element(elem_copy)
                        extracted_content, extracted_images = self._extract_content_with_images(elem_copy, "조선일보", url)
                        if extracted_content and len(extracted_content) > 50:
                            content_candidates.append({
                                'content': extracted_content,
                                'images': extracted_images,
                                'length': len(extracted_content),
                                'selector': 'section.article-body (직접 추출)',
                                'source': '조선일보'
                            })
                            logger.debug(f"[조선일보 직접 추출] section.article-body: {len(extracted_content)}자, 이미지 {len(extracted_images)}개")
                    chosun_selectors = [
                        ".article-content",
                        ".article_body",
                        "#articleBody",
                        ".story-body",
                        ".article-text",
                        ".article-body-text",
                        ".article-body__content",  # biz.chosun.com
                        ".article-body__content-text",  # biz.chosun.com - 개별 p 태그
                        ".article-view__body",  # biz.chosun.com
                        "article",  # 일반 article 태그
                        "main article",  # main 안의 article
                        ".content",  # 일반 content 클래스
                        ".article",  # 일반 article 클래스
                        "[class*='article']",  # article이 포함된 클래스
                        "[class*='content']",  # content가 포함된 클래스
                        "[id*='article']",  # article이 포함된 ID
                        "[id*='content']"  # content가 포함된 ID
                    ]
                    for selector in chosun_selectors:
                        try_extract_content(selector, "조선일보")
                        try_extract_content_with_images(selector, "조선일보")
                
                if is_herald:
                    # 해럴드경제: article#articleText 전체를 추출하여 순서 유지
                    # 해럴드경제는 article#articleText 안에 본문과 .article-photo-wrap (이미지)가 순서대로 있음
                    try_extract_content_with_images("article#articleText", "해럴드경제")
                    try_extract_content_with_images("article.article-view", "해럴드경제")
                    try_extract_content_with_images(".article-view", "해럴드경제")
                    herald_selectors = [
                        ".article-body",
                        ".view-contents",
                        ".article-content",
                        "#articleBody",
                        ".article_view",
                        ".article-text"
                    ]
                    for selector in herald_selectors:
                        try_extract_content(selector, "해럴드경제")
                
                if is_hankyung:
                    hankyung_selectors = [
                        ".article-body",
                        ".article-content",
                        ".article_body",
                        "#articleBody",
                        ".article_view",
                        ".article-text"
                    ]
                    for selector in hankyung_selectors:
                        try_extract_content(selector, "한국경제")
                
                # 공통 셀렉터 시도
                common_selectors = [
                    "#articleBodyContents",
                    ".go_trans._article_content",
                    ".article_body",
                    ".article_content",
                    ".article_view",
                    "article",
                    ".news_body",
                    ".content",
                    ".article-main",
                    ".article-main-content"
                ]
                for selector in common_selectors:
                    try_extract_content(selector, "공통")
                
                # article 태그 직접 시도
                article = soup.find("article")
                if article:
                    elem_copy = BeautifulSoup(str(article), 'html.parser')
                    clean_element(elem_copy)
                    extracted = self._extract_text_with_paragraph_breaks(elem_copy)
                    if extracted and len(extracted) > 50:
                        content_candidates.append({
                            'content': extracted,
                            'length': len(extracted),
                            'selector': 'article',
                            'source': '공통'
                        })
                
                # 가장 긴 본문 선택
                if content_candidates:
                    # 길이순으로 정렬하여 가장 긴 본문 선택
                    content_candidates.sort(key=lambda x: x['length'], reverse=True)
                    best_candidate = content_candidates[0]
                    content = best_candidate['content']
                    # 이미지도 함께 가져오기
                    if best_candidate.get('images'):
                        images = best_candidate['images']
                    logger.info(f"[본문 추출 성공] 선택된 셀렉터: {best_candidate['selector']} ({best_candidate['source']}), 길이: {best_candidate['length']}자, 이미지: {len(images)}개")
                    
                    # 만약 가장 긴 본문이 다른 후보보다 2배 이상 길면, 그것을 사용
                    # 그렇지 않으면 여러 후보를 병합 시도
                    if len(content_candidates) > 1:
                        second_longest = content_candidates[1]['length']
                        if best_candidate['length'] < second_longest * 1.5:
                            # 두 번째로 긴 본문과 병합 시도
                            merged_content = content + "\n\n" + content_candidates[1]['content']
                            # 중복 제거 (간단한 방법)
                            merged_content = re.sub(r'\n{3,}', '\n\n', merged_content)
                            if len(merged_content) > len(content) * 1.2:  # 병합이 20% 이상 길면 사용
                                content = merged_content
                                # 이미지도 병합 (중복 제거)
                                if content_candidates[1].get('images'):
                                    seen_urls = {img['url'] for img in images}
                                    for img in content_candidates[1]['images']:
                                        if img['url'] not in seen_urls:
                                            images.append(img)
                                            seen_urls.add(img['url'])
                                logger.info(f"[본문 병합] 두 후보 병합: {len(content)}자, 이미지: {len(images)}개")
                else:
                    logger.warning(f"[본문 추출 실패] 모든 셀렉터 실패: url={url}")
                
                # content가 여전히 없거나 너무 짧으면 최후의 수단으로 전체 본문 추출
                if not content or len(content) < 100:
                    logger.warning(f"[crawl_news_detail] 본문 추출 실패 또는 너무 짧음, fallback 사용: url={url}, 현재 길이={len(content) if content else 0}자")
                    
                    # 방법 1: 모든 p, div 태그에서 텍스트 추출
                    fallback_candidates = []
                    
                    # p 태그 추출
                    all_paragraphs = soup.find_all('p')
                    if all_paragraphs:
                        paragraph_texts = []
                        for p in all_paragraphs:
                            # 광고/댓글 관련 클래스 제외
                            p_classes = p.get('class', [])
                            if any(excluded in str(p_classes).lower() for excluded in ['ad', 'comment', 'related', 'social', 'share']):
                                continue
                            text = p.get_text(strip=True)
                            if text and len(text) > 15:  # 너무 짧은 문단 제외
                                paragraph_texts.append(text)
                        if paragraph_texts:
                            p_content = "\n\n".join(paragraph_texts)
                            if len(p_content) > 100:
                                fallback_candidates.append(('p_tags', p_content, len(p_content)))
                    
                    # div 태그에서 본문 같은 텍스트 추출
                    content_divs = soup.find_all('div', class_=re.compile(r'(content|body|article|text|main)', re.I))
                    for div in content_divs:
                        div_classes = div.get('class', [])
                        if any(excluded in str(div_classes).lower() for excluded in ['ad', 'comment', 'related', 'social', 'header', 'footer', 'sidebar']):
                            continue
                        div_text = div.get_text(separator="\n", strip=True)
                        if div_text and len(div_text) > 200:
                            fallback_candidates.append(('div_content', div_text, len(div_text)))
                    
                    # 가장 긴 fallback 후보 선택
                    if fallback_candidates:
                        fallback_candidates.sort(key=lambda x: x[2], reverse=True)
                        best_fallback = fallback_candidates[0]
                        if best_fallback[2] > len(content) if content else 0:
                            content = best_fallback[1]
                            logger.info(f"[fallback 성공] {best_fallback[0]}: {best_fallback[2]}자")
                    
                    # 여전히 없거나 너무 짧으면 전체 텍스트 추출 (최후의 수단)
                    if not content or len(content) < 100:
                        # body 태그에서 직접 추출
                        body = soup.find('body')
                        if body:
                            # 불필요한 요소 제거
                            for tag in ['script', 'style', 'iframe', 'nav', 'header', 'footer', 'aside']:
                                for elem in body.find_all(tag):
                                    elem.decompose()
                            full_text = body.get_text(separator="\n", strip=True)
                            if full_text and len(full_text) > 100:
                                # 연속된 줄바꿈 정리
                                content = re.sub(r'\n{3,}', '\n\n', full_text)
                                logger.warning(f"[최후의 수단] body 전체 텍스트로 본문 추출: {len(content)}자")
                
                # 최종 검증: content가 없거나 너무 짧으면 경고
                if not content:
                    content = ""
                    logger.error(f"[crawl_news_detail] 본문 추출 완전 실패: url={url}")
                elif len(content) < 100:
                    logger.warning(f"[crawl_news_detail] 본문이 너무 짧음: {len(content)}자, url={url}")
                
                # 썸네일 추출
                thumbnail_url = None
                
                og_image = soup.find("meta", property="og:image")
                if og_image:
                    thumbnail_url = og_image.get("content", "").strip()
                
                if not thumbnail_url and is_mbnmoney:
                    img_elem = soup.select_one(".newsImg img")
                    if img_elem:
                        thumbnail_url = img_elem.get("src") or img_elem.get("data-src") or img_elem.get("data-lazy-src")
                        if thumbnail_url:
                            if "default_image" not in thumbnail_url and "noimage" not in thumbnail_url:
                                if thumbnail_url.startswith("//"):
                                    thumbnail_url = "https:" + thumbnail_url
                                elif thumbnail_url.startswith("/"):
                                    thumbnail_url = urljoin(url, thumbnail_url)
                
                if not thumbnail_url and is_chosun:
                    img_selectors_chosun = [
                        ".article-image img",
                        ".article-photo img",
                        ".article-image-wrapper img",
                        ".article-body img"
                    ]
                    for selector in img_selectors_chosun:
                        img_elem = soup.select_one(selector)
                        if img_elem:
                            thumbnail_url = img_elem.get("src") or img_elem.get("data-src") or img_elem.get("data-lazy-src")
                            if thumbnail_url and "default_image" not in thumbnail_url and "noimage" not in thumbnail_url:
                                if thumbnail_url.startswith("//"):
                                    thumbnail_url = "https:" + thumbnail_url
                                elif thumbnail_url.startswith("/"):
                                    thumbnail_url = urljoin(url, thumbnail_url)
                                break
                
                if not thumbnail_url and is_herald:
                    img_selectors_herald = [
                        ".article-image img",
                        ".view-image img",
                        ".article-photo img",
                        ".article-body img"
                    ]
                    for selector in img_selectors_herald:
                        img_elem = soup.select_one(selector)
                        if img_elem:
                            thumbnail_url = img_elem.get("src") or img_elem.get("data-src") or img_elem.get("data-lazy-src")
                            if thumbnail_url and "default_image" not in thumbnail_url and "noimage" not in thumbnail_url:
                                if thumbnail_url.startswith("//"):
                                    thumbnail_url = "https:" + thumbnail_url
                                elif thumbnail_url.startswith("/"):
                                    thumbnail_url = urljoin(url, thumbnail_url)
                                break
                
                if not thumbnail_url and is_hankyung:
                    img_selectors_hankyung = [
                        ".article-image img",
                        ".article-photo img",
                        ".article-image-wrapper img",
                        ".article-body img"
                    ]
                    for selector in img_selectors_hankyung:
                        img_elem = soup.select_one(selector)
                        if img_elem:
                            thumbnail_url = img_elem.get("src") or img_elem.get("data-src") or img_elem.get("data-lazy-src")
                            if thumbnail_url and "default_image" not in thumbnail_url and "noimage" not in thumbnail_url:
                                if thumbnail_url.startswith("//"):
                                    thumbnail_url = "https:" + thumbnail_url
                                elif thumbnail_url.startswith("/"):
                                    thumbnail_url = urljoin(url, thumbnail_url)
                                break
                
                if not thumbnail_url:
                    img_selectors = [
                        "#articleBodyContents img",
                        ".article_body img",
                        ".article_content img",
                        ".news_contents img",
                        "article img",
                        ".news_body img"
                    ]
                    
                    for selector in img_selectors:
                        img_elem = soup.select_one(selector)
                        if img_elem:
                            thumbnail_url = img_elem.get("src") or img_elem.get("data-src") or img_elem.get("data-lazy-src")
                            if thumbnail_url:
                                if "default_image" not in thumbnail_url and "noimage" not in thumbnail_url:
                                    if thumbnail_url.startswith("//"):
                                        thumbnail_url = "https:" + thumbnail_url
                                    elif thumbnail_url.startswith("/"):
                                        thumbnail_url = urljoin(url, thumbnail_url)
                                    break
                
                if not thumbnail_url:
                    meta_img = soup.find("meta", attrs={"name": "image"})
                    if meta_img:
                        thumbnail_url = meta_img.get("content", "").strip()
                
                # 본문에서 이미지를 추출하지 못한 경우에만 추가 추출 시도
                if not images:
                    seen_image_urls = {img['url'] for img in images}
                    
                    content_area_selectors = []
                    
                    if is_mbnmoney:
                        content_area_selectors.extend([
                            ".news_contents",
                            ".news_contents .con_sub",
                            ".newsImg"
                        ])
                    
                    if is_chosun:
                        content_area_selectors.extend([
                            "section.article-body",
                            ".article-body"
                        ])
                    
                    if is_herald:
                        content_area_selectors.extend([
                            "article#articleText",
                            "article.article-view"
                        ])
                    
                    content_area_selectors.extend([
                        "#articleBodyContents",
                        ".article_body",
                        ".article_content",
                        ".article_view",
                        "article",
                        ".news_body",
                        ".content"
                    ])
                    
                    for selector in content_area_selectors:
                        content_area = soup.select_one(selector)
                        if content_area:
                            img_tags = content_area.find_all("img")
                            for img_tag in img_tags:
                                img_url = (
                                    img_tag.get("src") or 
                                    img_tag.get("data-src") or 
                                    img_tag.get("data-lazy-src") or
                                    img_tag.get("data-original")
                                )
                                
                                if img_url:
                                    img_url = img_url.strip()
                                    
                                    # 제외할 이미지 확인
                                    alt_text = img_tag.get("alt", "").lower()
                                    if any(excluded in alt_text for excluded in ["기자", "reporter", "author", "profile"]):
                                        continue
                                    
                                    if any(excluded in img_url.lower() for excluded in [
                                        "default_image", "noimage", "placeholder", 
                                        "blank", "spacer", "transparent", "1x1"
                                    ]):
                                        continue
                                    
                                    if img_url.startswith("//"):
                                        img_url = "https:" + img_url
                                    elif img_url.startswith("/"):
                                        img_url = urljoin(url, img_url)
                                    elif not img_url.startswith("http"):
                                        img_url = urljoin(url, img_url)
                                    
                                    if img_url not in seen_image_urls and img_url.startswith("http"):
                                        seen_image_urls.add(img_url)
                                        # 캡션 추출
                                        caption = ""
                                        parent = img_tag.parent
                                        if parent:
                                            caption_elem = parent.find("figcaption") or parent.find(class_=re.compile("caption", re.I))
                                            if caption_elem:
                                                caption = caption_elem.get_text(strip=True)
                                        
                                        images.append({
                                            "url": img_url,
                                            "caption": caption,
                                            "position": len(images)
                                        })
                    
                    # 이미지가 추출되었으므로 다음 단계로
                    pass
                
                if thumbnail_url:
                    thumbnail_in_images = any(img['url'] == thumbnail_url if isinstance(img, dict) else img == thumbnail_url for img in images)
                    if not thumbnail_in_images:
                        images.insert(0, {
                            "url": thumbnail_url,
                            "caption": "",
                            "position": 0
                        })
                
                # 발행일 추출
                published_at = datetime.utcnow()
                
                if is_mbnmoney:
                    date_elem = soup.select_one(".newsview_box .date")
                    if date_elem:
                        date_text = date_elem.get_text(strip=True)
                        date_match = re.search(r'(\d{4})[.-](\d{2})[.-](\d{2})\s+(\d{2}):(\d{2})', date_text)
                        if date_match:
                            try:
                                year, month, day, hour, minute = map(int, date_match.groups())
                                published_at = datetime(year, month, day, hour, minute)
                            except:
                                pass
                        else:
                            date_match = re.search(r'(\d{4})[.-](\d{2})[.-](\d{2})', date_text)
                            if date_match:
                                try:
                                    year, month, day = map(int, date_match.groups())
                                    published_at = datetime(year, month, day)
                                except:
                                    pass
                
                if published_at == datetime.utcnow() and is_chosun:
                    date_selectors_chosun = [
                        ".article-date",
                        ".date-published",
                        ".article-info .date",
                        "time.published"
                    ]
                    for selector in date_selectors_chosun:
                        date_elem = soup.select_one(selector)
                        if date_elem:
                            datetime_attr = date_elem.get("datetime") or date_elem.get("content")
                            if datetime_attr:
                                try:
                                    from dateutil import parser as date_parser
                                    published_at = date_parser.parse(datetime_attr)
                                    break
                                except:
                                    pass
                            date_text = date_elem.get_text(strip=True)
                            if date_text:
                                date_match = re.search(r'(\d{4})[.-](\d{2})[.-](\d{2})', date_text)
                                if date_match:
                                    try:
                                        year, month, day = map(int, date_match.groups())
                                        published_at = datetime(year, month, day)
                                        break
                                    except:
                                        pass
                
                if published_at == datetime.utcnow() and is_herald:
                    date_selectors_herald = [
                        ".article-date",
                        ".view-date",
                        ".article-info .date",
                        "time.published"
                    ]
                    for selector in date_selectors_herald:
                        date_elem = soup.select_one(selector)
                        if date_elem:
                            datetime_attr = date_elem.get("datetime") or date_elem.get("content")
                            if datetime_attr:
                                try:
                                    from dateutil import parser as date_parser
                                    published_at = date_parser.parse(datetime_attr)
                                    break
                                except:
                                    pass
                            date_text = date_elem.get_text(strip=True)
                            if date_text:
                                date_match = re.search(r'(\d{4})[.-](\d{2})[.-](\d{2})', date_text)
                                if date_match:
                                    try:
                                        year, month, day = map(int, date_match.groups())
                                        published_at = datetime(year, month, day)
                                        break
                                    except:
                                        pass
                
                if published_at == datetime.utcnow() and is_hankyung:
                    date_selectors_hankyung = [
                        ".article-date",
                        ".date-published",
                        ".article-info .date",
                        "time.published"
                    ]
                    for selector in date_selectors_hankyung:
                        date_elem = soup.select_one(selector)
                        if date_elem:
                            datetime_attr = date_elem.get("datetime") or date_elem.get("content")
                            if datetime_attr:
                                try:
                                    from dateutil import parser as date_parser
                                    published_at = date_parser.parse(datetime_attr)
                                    break
                                except:
                                    pass
                            date_text = date_elem.get_text(strip=True)
                            if date_text:
                                date_match = re.search(r'(\d{4})[.-](\d{2})[.-](\d{2})', date_text)
                                if date_match:
                                    try:
                                        year, month, day = map(int, date_match.groups())
                                        published_at = datetime(year, month, day)
                                        break
                                    except:
                                        pass
                
                if published_at == datetime.utcnow():
                    date_selectors = [
                        "time",
                        ".media_end_head_info_datetime",
                        ".article_date",
                        ".date",
                        ".publish_date",
                        "meta[property='article:published_time']",
                        "meta[name='publishdate']"
                    ]
                    
                    for selector in date_selectors:
                        date_elem = soup.select_one(selector)
                        if date_elem:
                            datetime_attr = date_elem.get("datetime") or date_elem.get("content")
                            if datetime_attr:
                                try:
                                    try:
                                        from dateutil import parser as date_parser
                                        published_at = date_parser.parse(datetime_attr)
                                        break
                                    except ImportError:
                                        pass
                                except:
                                    pass
                            
                            date_text = date_elem.get_text(strip=True)
                            if date_text:
                                date_match = re.search(r'(\d{4})[.-](\d{2})[.-](\d{2})', date_text)
                                if date_match:
                                    try:
                                        year, month, day = map(int, date_match.groups())
                                        published_at = datetime(year, month, day)
                                        break
                                    except:
                                        pass
                
                # 카테고리 추출
                category = None
                category_selectors = [
                    ".article_category",
                    ".category",
                    ".media_end_categorize_item",
                    "meta[property='article:section']"
                ]
                
                for selector in category_selectors:
                    category_elem = soup.select_one(selector)
                    if category_elem:
                        category = category_elem.get_text(strip=True) or category_elem.get("content", "").strip()
                        if category:
                            break
                
                # 최종 본문 길이 검증 (50자 -> 100자로 기준 상향)
                if not content or len(content.strip()) < 500:
                    if not content:
                        logger.error(f"본문 추출 완전 실패: {url}")
                        content = ""
                    else:
                        logger.warning(f"본문이 너무 짧음: {len(content)}자, url={url}")
                        # 너무 짧아도 빈 문자열로 유지 (호환성)
                        content = content.strip()
                
                # 이미지 리스트 정리 (URL만 추출하여 기존 형식 유지)
                image_urls_list = [img['url'] if isinstance(img, dict) else img for img in images]
                
                # 이미지 리스트 정리 (URL만 추출하여 기존 형식 유지)
                image_urls_list = [img['url'] if isinstance(img, dict) else img for img in images] if images else []
                
                return {
                    "title": title,
                    "content": content,
                    "source": source,
                    "url": url,
                    "thumbnail_url": thumbnail_url,
                    "images": image_urls_list,  # 이미지 URL 리스트 (기존 형식 유지)
                    "images_with_metadata": images if images else [],  # 이미지 메타데이터 (캡션, 위치 포함)
                    "category": category,
                    "published_at": published_at,
                }
                    
        except Exception as e:
            logger.error(f"뉴스 상세 크롤링 실패 ({url}): {e}")
            import traceback
            logger.debug(traceback.format_exc())
            
        return None
    
    async def _crawl_with_semaphore(self, coro, source_name: str):
        """세마포어로 동시 요청 제한하며 크롤링"""
        async with self._semaphore:
            try:
                return await asyncio.wait_for(coro, timeout=HTTP_TIMEOUT + 5)
            except asyncio.TimeoutError:
                logger.warning(f"⏱️ 크롤링 타임아웃 ({source_name}): {HTTP_TIMEOUT}초 초과")
                return []
            except Exception as e:
                logger.error(f"❌ 크롤링 실패 ({source_name}): {e}")
                return []
    
    async def crawl_all_sources(self, limit_per_source: int = 20) -> List[Dict]:
        """
        모든 뉴스 소스에서 뉴스 수집 (소스별로 적절히 섞여서 반환)
        
        성능 최적화:
        - 세마포어로 동시 요청 수 제한 (MAX_CONCURRENT_REQUESTS)
        - 개별 소스 타임아웃으로 전체 차단 방지
        - 빠른 소스 우선 반환 (느린 소스 대기 최소화)
        """
        source_names = ["매일경제", "네이버", "조선일보", "해럴드경제", "한국경제"]
        
        # 세마포어와 타임아웃이 적용된 크롤링 태스크 생성
        tasks = [
            self._crawl_with_semaphore(
                self.crawl_mbnmoney_realestate_rss(limit=limit_per_source),
                "매일경제"
            ),
            self._crawl_with_semaphore(
                self.crawl_naver_realestate(limit=limit_per_source),
                "네이버"
            ),
            self._crawl_with_semaphore(
                self.crawl_chosun_realestate_rss(limit=limit_per_source),
                "조선일보"
            ),
            self._crawl_with_semaphore(
                self.crawl_herald_realestate_rss(limit=limit_per_source),
                "해럴드경제"
            ),
            self._crawl_with_semaphore(
                self.crawl_hankyung_realestate_rss(limit=limit_per_source),
                "한국경제"
            ),
        ]
        
        # 전체 타임아웃 적용 (개별 타임아웃 * 2)
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=(HTTP_TIMEOUT + 5) * 2
            )
        except asyncio.TimeoutError:
            logger.error(f"❌ 전체 크롤링 타임아웃: {(HTTP_TIMEOUT + 5) * 2}초 초과")
            results = [[] for _ in source_names]
        
        source_news_lists = []
        
        for idx, result in enumerate(results):
            if isinstance(result, list):
                seen_urls = set()
                unique_news = []
                for news in result:
                    if news.get("url") and news["url"] not in seen_urls:
                        seen_urls.add(news["url"])
                        unique_news.append(news)
                source_news_lists.append(unique_news)
                logger.debug(f"✅ {source_names[idx]}: {len(unique_news)}개 수집")
            elif isinstance(result, Exception):
                logger.error(f"크롤링 중 오류 ({source_names[idx]}): {result}")
                source_news_lists.append([])
            else:
                source_news_lists.append([])
        
        # 라운드 로빈 방식으로 섞기
        mixed_news = []
        indices = [0] * len(source_news_lists)
        seen_urls = set()
        
        while True:
            added_any = False
            for i, news_list in enumerate(source_news_lists):
                if indices[i] < len(news_list):
                    news = news_list[indices[i]]
                    url = news.get("url", "")
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        mixed_news.append(news)
                        added_any = True
                    indices[i] += 1
            
            if not added_any:
                break
        
        logger.info(f"📰 뉴스 크롤링 완료: 총 {len(mixed_news)}개 수집")
        return mixed_news


class NewsService:
    """
    뉴스 서비스 클래스
    
    크롤링과 데이터베이스 작업을 조율합니다.
    """
    
    def __init__(self):
        """초기화"""
        self.crawler = NewsCrawler()
    
    async def crawl_and_save(
        self,
        db: Optional[AsyncSession],
        limit_per_source: int = 20
    ) -> dict:
        """
        뉴스를 크롤링하고 데이터베이스에 저장
        """
        if not DB_AVAILABLE or not db:
            logger.warning("DB가 사용 불가능하므로 크롤링만 수행합니다.")
            crawled_news = await self.crawler.crawl_all_sources(limit_per_source=limit_per_source)
            return {
                "total_crawled": len(crawled_news),
                "saved": 0,
                "updated": 0,
                "errors": 0
            }
        
        logger.info("뉴스 크롤링 시작...")
        crawled_news = await self.crawler.crawl_all_sources(limit_per_source=limit_per_source)
        logger.info(f"크롤링 완료: {len(crawled_news)}개 뉴스 수집")
        
        saved_count = 0
        updated_count = 0
        error_count = 0
        
        for news_data in crawled_news:
            try:
                news_create = NewsCreate(**news_data)
                existing = await news_crud.get_by_url(db, url=news_create.url)
                
                if existing:
                    update_data = news_create.model_dump(exclude_unset=True)
                    await news_crud.update(db, db_obj=existing, obj_in=update_data)
                    updated_count += 1
                else:
                    await news_crud.create(db, obj_in=news_create)
                    saved_count += 1
                    
            except Exception as e:
                logger.error(f"뉴스 저장 실패: {news_data.get('title', 'Unknown')} - {e}")
                error_count += 1
        
        await db.commit()
        
        return {
            "total_crawled": len(crawled_news),
            "saved": saved_count,
            "updated": updated_count,
            "errors": error_count
        }
    
    async def get_news_list(
        self,
        db: Optional[AsyncSession],
        limit: int = 20,
        offset: int = 0,
        category: Optional[str] = None,
        source: Optional[str] = None
    ) -> dict:
        """
        뉴스 목록 조회 (DB 사용)
        """
        if not DB_AVAILABLE or not db or not news_crud:
            raise NotImplementedError("DB가 사용 불가능합니다. crawl_only()를 사용하세요.")
        
        news_list = await news_crud.get_latest(
            db=db,
            limit=limit,
            offset=offset,
            category=category,
            source=source
        )
        
        total = await news_crud.get_count(
            db=db,
            category=category,
            source=source
        )
        
        return {
            "data": news_list,
            "meta": {
                "total": total,
                "limit": limit,
                "offset": offset
            }
        }
    
    async def get_news_detail(
        self,
        db: Optional[AsyncSession],
        news_id: int
    ) -> Optional:
        """
        뉴스 상세 조회 (DB 사용)
        """
        if not DB_AVAILABLE or not db or not news_crud:
            raise NotImplementedError("DB가 사용 불가능합니다. crawl_news_detail()를 사용하세요.")
        
        return await news_crud.get(db, id=news_id)
    
    async def crawl_only(
        self,
        limit_per_source: int = 20
    ) -> List[dict]:
        """
        뉴스 목록을 크롤링만 하고 저장하지 않음 (실시간 조회용)
        """
        logger.info("뉴스 목록 크롤링 시작 (저장 없음)...")
        crawled_news = await self.crawler.crawl_all_sources(limit_per_source=limit_per_source)
        logger.info(f"크롤링 완료: {len(crawled_news)}개 뉴스 수집 (저장하지 않음)")
        
        return crawled_news
    
    async def crawl_news_detail(self, url: str) -> Optional[dict]:
        """
        뉴스 상세 내용을 크롤링 (저장 없음)
        """
        logger.info(f"뉴스 상세 크롤링 시작: {url}")
        detail = await self.crawler.crawl_news_detail(url)
        if detail:
            logger.info(f"뉴스 상세 크롤링 완료: {detail.get('title', 'Unknown')}")
        else:
            logger.warning(f"뉴스 상세 크롤링 실패: {url}")
        return detail


# 싱글톤 인스턴스
news_crawler = NewsCrawler()  # 하위 호환성을 위해 유지
news_service = NewsService()
