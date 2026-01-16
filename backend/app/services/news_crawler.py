"""
부동산 뉴스 크롤링 서비스

네이버 부동산, 매일경제 등에서 부동산 관련 뉴스를 수집합니다.
"""
import logging
import asyncio
import re
from datetime import datetime
from typing import List, Dict, Optional
from urllib.parse import urljoin, urlparse  

import httpx
from bs4 import BeautifulSoup   #html/xml 파싱
import feedparser  # RSS 파싱용

# from app.core.config import settings  # 테스트 시 불필요할 수 있음

logger = logging.getLogger(__name__)


class NewsCrawler:
    """
    부동산 뉴스 크롤링 클래스
    
    여러 뉴스 소스에서 부동산 관련 뉴스를 수집합니다.
    """
    
    def __init__(self):
        """초기화"""
        self.timeout = httpx.Timeout(30.0, connect=10.0)
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    
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
                response.raise_for_status() #http에러 확인
                
                # RSS 파싱
                feed = feedparser.parse(response.text)  #xml 파싱   
                
                for entry in feed.entries[:limit]:
                    try:
                        # 발행일 파싱
                        published_at = datetime.utcnow()  # 기본값
                        if hasattr(entry, 'published_parsed') and entry.published_parsed:
                            published_at = datetime(*entry.published_parsed[:6])
                        elif hasattr(entry, 'published') and entry.published:
                            # published_parsed가 없으면 published 문자열을 파싱 시도
                            try:
                                # feedparser가 자동으로 파싱한 경우
                                if hasattr(entry, 'published_parsed'):
                                    published_at = datetime(*entry.published_parsed[:6])
                            except:
                                pass
                        
                        # 카테고리 추출 (예: "시세/시황", "세제/정책", "부동산")
                        category = "일반"  # 기본값
                        if hasattr(entry, 'tags') and entry.tags:
                            category = entry.tags[0].term if entry.tags else "일반"
                        elif hasattr(entry, 'category'):
                            category = entry.category
                        
                        # description에서 HTML 제거 및 썸네일 추출
                        description_html = entry.get("summary", "") or entry.get("description", "")
                        thumbnail_url = None
                        content = ""
                        
                        if description_html:
                            # BeautifulSoup으로 HTML 파싱
                            desc_soup = BeautifulSoup(description_html, "html.parser")
                            
                            # 썸네일 URL 추출 (img 태그의 src 속성)
                            img_tag = desc_soup.find("img")
                            if img_tag and img_tag.get("src"):
                                thumbnail_url = img_tag.get("src")
                            
                            # 텍스트만 추출 (HTML 태그 제거)
                            content = desc_soup.get_text(strip=True)
                        
                        # 뉴스 항목 생성
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
    
    async def crawl_naver_realestate(self, limit: int = 20) -> List[Dict]:
        """
        네이버 부동산 뉴스 섹션 크롤링
        
        ⚠️ 주의사항:
        1. robots.txt 확인 필수! (https://land.naver.com/robots.txt)
        2. 실제 사이트 구조에 맞게 수정 필요
        3. 요청 간격 조절 필요 (너무 빠르면 IP 차단 가능)
        4. 네이버는 동적 로딩을 사용할 수 있어 정적 HTML만으로는 모든 뉴스를 가져오기 어려울 수 있음
        
        Args:
            limit: 최대 수집 개수
            
        Returns:
            뉴스 딕셔너리 리스트
        """
        base_url = "https://land.naver.com/news/headline.naver"
        news_list = []
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                response = await client.get(base_url)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, "html.parser")
                
                # 네이버 부동산 뉴스 페이지 구조:
                # <ul class="land_news_list" id="land_news_list">
                #   <li class="news_item">
                #     <a href="..." class="link">
                #       <div class="thumb_img"><img src="..."></div>
                #       <div class="text">
                #         <p class="title">제목</p>
                #         <p class="description">설명</p>
                #         <p class="description source">출처</p>
                #       </div>
                #     </a>
                #   </li>
                # </ul>
                
                # 뉴스 리스트 컨테이너 찾기
                news_list_container = soup.find("ul", class_="land_news_list") or soup.find("ul", id="land_news_list")
                
                if not news_list_container:
                    logger.warning("뉴스 리스트 컨테이너를 찾을 수 없습니다.")
                    # 디버깅: 모든 ul 태그 확인
                    all_ul = soup.find_all("ul")
                    logger.debug(f"발견된 <ul> 태그 개수: {len(all_ul)}")
                    if len(all_ul) > 0:
                        for i, ul in enumerate(all_ul[:5], 1):
                            logger.debug(f"  [{i}] class={ul.get('class', [])}, id={ul.get('id', '')}")
                    # 디버깅: land_news_list 문자열 검색
                    if "land_news_list" not in response.text:
                        logger.warning("HTML에 'land_news_list' 문자열이 없습니다. 페이지 구조가 변경되었을 수 있습니다.")
                    return news_list
                
                # 각 뉴스 항목(<li class="news_item">) 찾기
                news_items = news_list_container.find_all("li", class_="news_item", limit=limit)
                
                if len(news_items) == 0:
                    logger.warning(f"뉴스 항목을 찾을 수 없습니다. (컨테이너는 찾았지만 <li class='news_item'> 없음)")
                    # 디버깅: 컨테이너 내 모든 li 태그 확인
                    all_li = news_list_container.find_all("li")
                    logger.debug(f"컨테이너 내 <li> 태그 개수: {len(all_li)}")
                    if len(all_li) > 0:
                        for i, li in enumerate(all_li[:5], 1):
                            logger.debug(f"  [{i}] class={li.get('class', [])}")
                    return news_list
                
                logger.info(f"네이버 부동산 뉴스 {len(news_items)}개 발견")
                
                for news_item in news_items:
                    try:
                        # <a> 태그 찾기 (URL과 전체 구조 포함)
                        link_elem = news_item.find("a", class_="link")
                        if not link_elem:
                            continue
                        
                        # URL 추출
                        url = link_elem.get("href", "")
                        if not url:
                            continue
                        
                        # 절대 URL로 변환 (이미 절대 URL인 경우 그대로 사용)
                        if url.startswith("http://") or url.startswith("https://"):
                            pass  # 이미 절대 URL
                        elif url.startswith("/"):
                            url = urljoin("https://land.naver.com", url)
                        else:
                            url = urljoin(base_url, url)
                        
                        # 제목 추출: <p class="title">
                        title_elem = link_elem.find("p", class_="title")
                        if not title_elem:
                            continue
                        title = title_elem.get_text(strip=True)
                        if not title:
                            continue
                        
                        # 설명/본문과 출처 추출
                        # 실제 구조: <p class="description">본문</p>와 <p class="description source">출처</p>
                        content = ""
                        source = "네이버 부동산"  # 기본값
                        
                        # 모든 description 요소 찾기
                        description_elems = link_elem.find_all("p", class_="description")
                        for desc_elem in description_elems:
                            classes = desc_elem.get("class", [])
                            # source 클래스가 있으면 출처, 없으면 본문
                            if "source" in classes:
                                source_text = desc_elem.get_text(strip=True)
                                if source_text:
                                    source = source_text  # 예: "한국경제", "매일경제" 등
                            else:
                                content = desc_elem.get_text(strip=True)
                        
                        # 썸네일 추출: <div class="thumb_img"> 안의 <img>
                        thumbnail_url = None
                        thumb_img_div = link_elem.find("div", class_="thumb_img")
                        if thumb_img_div:
                            img_elem = thumb_img_div.find("img")
                            if img_elem:
                                thumbnail_url = img_elem.get("src") or img_elem.get("data-src")
                                # 썸네일 URL이 이미 절대 URL이므로 변환 불필요
                        
                        # 발행일 추출 (현재 구조에서는 명시적으로 없음)
                        # 썸네일 이미지 URL에서 날짜 추출 시도 (예: .../2026/01/14/...)
                        published_at = datetime.utcnow()  # 기본값
                        if thumbnail_url:
                            # URL에서 날짜 패턴 찾기 (예: /2026/01/14/)
                            date_match = re.search(r'/(\d{4})/(\d{2})/(\d{2})/', thumbnail_url)
                            if date_match:
                                try:
                                    year, month, day = map(int, date_match.groups())
                                    published_at = datetime(year, month, day)
                                except:
                                    pass
                        
                        # 카테고리 (현재 구조에서는 없음)
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
        
        Args:
            url: 뉴스 상세 페이지 URL
            
        Returns:
            뉴스 상세 정보 딕셔너리 (없으면 None)
            {
                "title": "...",
                "content": "...",
                "source": "...",
                "url": "...",
                "thumbnail_url": "...",
                "category": "...",
                "published_at": datetime
            }
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                response = await client.get(url)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, "html.parser")
                
                # 출처 추론 (URL 기반)
                source = "알 수 없음"
                is_mbnmoney = "mbnmoney.mbn.co.kr" in url or "mbn.co.kr" in url
                is_naver = "naver.com" in url or "land.naver.com" in url
                
                if is_mbnmoney:
                    source = "매일경제"
                elif is_naver:
                    source = "네이버"
                
                # ========== 제목 추출 ==========
                title = None
                
                # 매일경제 특화: .newsview_title > h1
                if is_mbnmoney:
                    title_elem = soup.select_one(".newsview_title h1")
                    if title_elem:
                        title = title_elem.get_text(strip=True)
                
                # 일반적인 선택자들
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
                    # 메타 태그에서 추출 시도
                    og_title = soup.find("meta", property="og:title")
                    if og_title:
                        title = og_title.get("content", "").strip()
                
                if not title:
                    title_elem = soup.find("title")
                    if title_elem:
                        title = title_elem.get_text(strip=True)
                
                if not title:
                    title = "제목 없음"
                
                # ========== 본문 추출 ==========
                content = None
                
                # 매일경제 특화: .news_contents > .con_sub
                if is_mbnmoney:
                    content_elem = soup.select_one(".news_contents .con_sub")
                    if content_elem:
                        # 불필요한 요소 제거
                        for elem in content_elem.find_all(["script", "style", "iframe", "aside", "nav", "div.comment-wrap", "div.list_type_01b", "div.list_type_05a"]):
                            elem.decompose()
                        
                        # 이미지 설명은 유지하되, 이미지 태그는 제거 (이미지 URL은 별도로 추출)
                        # 이미지 설명 텍스트는 유지
                        
                        # 본문 텍스트 추출 (줄바꿈 유지)
                        content = content_elem.get_text(separator="\n", strip=True)
                        # 연속된 빈 줄 정리
                        import re
                        content = re.sub(r'\n{3,}', '\n\n', content)
                
                # 일반적인 선택자들
                if not content or len(content) < 50:
                    content_selectors = [
                        "#articleBodyContents",
                        ".go_trans._article_content",
                        ".article_body",
                        ".article_content",
                        ".article_view",
                        "article",
                        ".news_body",
                        ".content"
                    ]
                    
                    for selector in content_selectors:
                        content_elem = soup.select_one(selector)
                        if content_elem:
                            # 불필요한 요소 제거 (광고, 스크립트 등)
                            for elem in content_elem.find_all(["script", "style", "iframe", "aside", "nav"]):
                                elem.decompose()
                            
                            # 본문 텍스트 추출 (줄바꿈 유지)
                            content = content_elem.get_text(separator="\n", strip=True)
                            if content and len(content) > 50:  # 최소 길이 체크
                                break
                
                if not content or len(content) < 50:
                    # article 태그에서 직접 추출 시도
                    article = soup.find("article")
                    if article:
                        for elem in article.find_all(["script", "style", "iframe"]):
                            elem.decompose()
                        content = article.get_text(separator="\n", strip=True)
                
                # ========== 썸네일/이미지 추출 ==========
                thumbnail_url = None
                
                # 1. Open Graph 이미지 (가장 우선)
                og_image = soup.find("meta", property="og:image")
                if og_image:
                    thumbnail_url = og_image.get("content", "").strip()
                
                # 2. 매일경제 특화: .newsImg img (본문 내 첫 번째 이미지)
                if not thumbnail_url and is_mbnmoney:
                    img_elem = soup.select_one(".newsImg img")
                    if img_elem:
                        thumbnail_url = img_elem.get("src") or img_elem.get("data-src") or img_elem.get("data-lazy-src")
                        if thumbnail_url:
                            # onerror 속성의 기본 이미지는 제외
                            if "default_image" not in thumbnail_url and "noimage" not in thumbnail_url:
                                # 상대 URL을 절대 URL로 변환
                                if thumbnail_url.startswith("//"):
                                    thumbnail_url = "https:" + thumbnail_url
                                elif thumbnail_url.startswith("/"):
                                    thumbnail_url = urljoin(url, thumbnail_url)
                
                # 3. 본문 내 첫 번째 이미지 (일반적인 선택자)
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
                                # 기본 이미지 제외
                                if "default_image" not in thumbnail_url and "noimage" not in thumbnail_url:
                                    # 상대 URL을 절대 URL로 변환
                                    if thumbnail_url.startswith("//"):
                                        thumbnail_url = "https:" + thumbnail_url
                                    elif thumbnail_url.startswith("/"):
                                        thumbnail_url = urljoin(url, thumbnail_url)
                                    break
                
                # 4. 메타 태그에서 추출
                if not thumbnail_url:
                    meta_img = soup.find("meta", attrs={"name": "image"})
                    if meta_img:
                        thumbnail_url = meta_img.get("content", "").strip()
                
                # ========== 본문 내 모든 이미지 추출 ==========
                images = []
                seen_image_urls = set()  # 중복 제거용
                
                # 본문 영역 선택자들 (썸네일과 동일한 영역 사용)
                content_area_selectors = []
                
                if is_mbnmoney:
                    # 매일경제: 본문 영역
                    content_area_selectors.extend([
                        ".news_contents .con_sub",
                        ".news_contents",
                        ".newsImg"
                    ])
                
                # 일반적인 본문 영역 선택자
                content_area_selectors.extend([
                    "#articleBodyContents",
                    ".article_body",
                    ".article_content",
                    ".article_view",
                    "article",
                    ".news_body",
                    ".content"
                ])
                
                # 각 본문 영역에서 이미지 찾기
                for selector in content_area_selectors:
                    content_area = soup.select_one(selector)
                    if content_area:
                        # 해당 영역의 모든 이미지 태그 찾기
                        img_tags = content_area.find_all("img")
                        for img_tag in img_tags:
                            # 이미지 URL 추출 (여러 속성 시도)
                            img_url = (
                                img_tag.get("src") or 
                                img_tag.get("data-src") or 
                                img_tag.get("data-lazy-src") or
                                img_tag.get("data-original")
                            )
                            
                            if img_url:
                                img_url = img_url.strip()
                                
                                # 기본/플레이스홀더 이미지 제외
                                if any(excluded in img_url.lower() for excluded in [
                                    "default_image", "noimage", "placeholder", 
                                    "blank", "spacer", "transparent", "1x1"
                                ]):
                                    continue
                                
                                # 상대 URL을 절대 URL로 변환
                                if img_url.startswith("//"):
                                    img_url = "https:" + img_url
                                elif img_url.startswith("/"):
                                    img_url = urljoin(url, img_url)
                                elif not img_url.startswith("http"):
                                    # 상대 경로인 경우
                                    img_url = urljoin(url, img_url)
                                
                                # 중복 제거 및 유효한 URL인지 확인
                                if img_url not in seen_image_urls and img_url.startswith("http"):
                                    seen_image_urls.add(img_url)
                                    images.append(img_url)
                
                # 썸네일이 본문 이미지에 포함되어 있지 않으면 추가 (중복 제거됨)
                if thumbnail_url and thumbnail_url not in seen_image_urls:
                    images.insert(0, thumbnail_url)  # 썸네일을 맨 앞에
                
                # ========== 발행일 추출 ==========
                published_at = datetime.utcnow()  # 기본값
                
                # 매일경제 특화: .newsview_box .date (예: "기사입력 2026-01-14 16:26")
                if is_mbnmoney:
                    date_elem = soup.select_one(".newsview_box .date")
                    if date_elem:
                        date_text = date_elem.get_text(strip=True)
                        # "기사입력 2026-01-14 16:26" 형식 파싱
                        # 날짜와 시간 패턴 찾기: YYYY-MM-DD HH:MM
                        date_match = re.search(r'(\d{4})[.-](\d{2})[.-](\d{2})\s+(\d{2}):(\d{2})', date_text)
                        if date_match:
                            try:
                                year, month, day, hour, minute = map(int, date_match.groups())
                                published_at = datetime(year, month, day, hour, minute)
                            except:
                                pass
                        else:
                            # 날짜만 있는 경우
                            date_match = re.search(r'(\d{4})[.-](\d{2})[.-](\d{2})', date_text)
                            if date_match:
                                try:
                                    year, month, day = map(int, date_match.groups())
                                    published_at = datetime(year, month, day)
                                except:
                                    pass
                
                # 일반적인 선택자들
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
                            # datetime 속성 확인
                            datetime_attr = date_elem.get("datetime") or date_elem.get("content")
                            if datetime_attr:
                                try:
                                    # ISO 형식 파싱 시도
                                    try:
                                        from dateutil import parser as date_parser
                                        published_at = date_parser.parse(datetime_attr)
                                        break
                                    except ImportError:
                                        # dateutil이 없으면 기본 파싱 시도
                                        pass
                                except:
                                    pass
                            
                            # 텍스트에서 날짜 추출 시도
                            date_text = date_elem.get_text(strip=True)
                            if date_text:
                                # 간단한 날짜 패턴 매칭
                                date_match = re.search(r'(\d{4})[.-](\d{2})[.-](\d{2})', date_text)
                                if date_match:
                                    try:
                                        year, month, day = map(int, date_match.groups())
                                        published_at = datetime(year, month, day)
                                        break
                                    except:
                                        pass
                
                # ========== 카테고리 추출 ==========
                category = None
                # 매일경제: .article_category, .category 등
                # 네이버: .media_end_categorize_item 등
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
                
                # 결과 검증
                if not content or len(content.strip()) < 50:
                    logger.warning(f"본문이 너무 짧거나 없음: {url}")
                    content = None
                
                return {
                    "title": title,
                    "content": content,
                    "source": source,
                    "url": url,
                    "thumbnail_url": thumbnail_url,
                    "images": images,  # 본문 내 모든 이미지 URL 리스트
                    "category": category,
                    "published_at": published_at,
                }
                    
        except Exception as e:
            logger.error(f"뉴스 상세 크롤링 실패 ({url}): {e}")
            import traceback
            logger.debug(traceback.format_exc())
            
        return None
    
    async def _fetch_article_content(self, url: str) -> Optional[str]:
        """
        뉴스 상세 페이지에서 본문만 추출 (내부 사용)
        
        Args:
            url: 뉴스 상세 페이지 URL
            
        Returns:
            본문 텍스트 (없으면 None)
        """
        detail = await self.crawl_news_detail(url)
        return detail.get("content") if detail else None
    
    async def crawl_all_sources(self, limit_per_source: int = 20) -> List[Dict]:
        """
        모든 뉴스 소스에서 뉴스 수집
        
        Args:
            limit_per_source: 소스당 최대 수집 개수
            
        Returns:
            뉴스 딕셔너리 리스트
        """
        # 병렬로 여러 소스 크롤링
        results = await asyncio.gather(
            self.crawl_mbnmoney_realestate_rss(limit=limit_per_source),
            self.crawl_naver_realestate(limit=limit_per_source),  # 네이버 부동산 섹션 크롤링 (필요시 활성화)
            # self.crawl_maeil_realestate(limit=limit_per_source),  # 매일경제 섹션 크롤링 (필요시 활성화)
            return_exceptions=True
        )
        
        # 결과 합치기
        all_news = []
        for result in results:
            if isinstance(result, list):
                all_news.extend(result)
            elif isinstance(result, Exception):
                logger.error(f"크롤링 중 오류: {result}")
        
        # 중복 제거 (URL 기준)
        seen_urls = set()
        unique_news = []
        for news in all_news:
            if news["url"] not in seen_urls:
                seen_urls.add(news["url"])
                unique_news.append(news)
        
        return unique_news


# 싱글톤 인스턴스
news_crawler = NewsCrawler()
