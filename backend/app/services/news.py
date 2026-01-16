"""
뉴스 서비스

뉴스 크롤링 및 비즈니스 로직을 담당합니다.
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
                is_mbnmoney = "mbnmoney.mbn.co.kr" in url or "mbn.co.kr" in url
                is_naver = "naver.com" in url or "land.naver.com" in url
                is_chosun = "chosun.com" in url
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
                    title_elem = soup.select_one(".newsview_title h1")
                    if title_elem:
                        title = title_elem.get_text(strip=True)
                
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
                
                # 본문 추출
                content = None
                
                if is_mbnmoney:
                    content_elem = soup.select_one(".news_contents .con_sub")
                    if content_elem:
                        for elem in content_elem.find_all(["script", "style", "iframe", "aside", "nav", "div.comment-wrap", "div.list_type_01b", "div.list_type_05a"]):
                            elem.decompose()
                        content = content_elem.get_text(separator="\n", strip=True)
                        content = re.sub(r'\n{3,}', '\n\n', content)
                
                if (not content or len(content) < 50) and is_chosun:
                    content_selectors_chosun = [
                        ".article-body",
                        ".article-content",
                        ".article_body",
                        "#articleBody",
                        ".story-body"
                    ]
                    for selector in content_selectors_chosun:
                        content_elem = soup.select_one(selector)
                        if content_elem:
                            for elem in content_elem.find_all(["script", "style", "iframe", "aside", "nav", "div.ad", "div.related"]):
                                elem.decompose()
                            content = content_elem.get_text(separator="\n", strip=True)
                            if content and len(content) > 50:
                                break
                
                if (not content or len(content) < 50) and is_herald:
                    content_selectors_herald = [
                        ".article-body",
                        ".view-contents",
                        ".article-content",
                        "#articleBody",
                        ".article_view"
                    ]
                    for selector in content_selectors_herald:
                        content_elem = soup.select_one(selector)
                        if content_elem:
                            for elem in content_elem.find_all(["script", "style", "iframe", "aside", "nav", "div.ad"]):
                                elem.decompose()
                            content = content_elem.get_text(separator="\n", strip=True)
                            if content and len(content) > 50:
                                break
                
                if (not content or len(content) < 50) and is_hankyung:
                    content_selectors_hankyung = [
                        ".article-body",
                        ".article-content",
                        ".article_body",
                        "#articleBody",
                        ".article_view"
                    ]
                    for selector in content_selectors_hankyung:
                        content_elem = soup.select_one(selector)
                        if content_elem:
                            for elem in content_elem.find_all(["script", "style", "iframe", "aside", "nav", "div.ad"]):
                                elem.decompose()
                            content = content_elem.get_text(separator="\n", strip=True)
                            if content and len(content) > 50:
                                break
                
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
                            for elem in content_elem.find_all(["script", "style", "iframe", "aside", "nav"]):
                                elem.decompose()
                            content = content_elem.get_text(separator="\n", strip=True)
                            if content and len(content) > 50:
                                break
                
                if not content or len(content) < 50:
                    article = soup.find("article")
                    if article:
                        for elem in article.find_all(["script", "style", "iframe"]):
                            elem.decompose()
                        content = article.get_text(separator="\n", strip=True)
                
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
                
                # 본문 내 모든 이미지 추출
                images = []
                seen_image_urls = set()
                
                content_area_selectors = []
                
                if is_mbnmoney:
                    content_area_selectors.extend([
                        ".news_contents .con_sub",
                        ".news_contents",
                        ".newsImg"
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
                                    images.append(img_url)
                
                if thumbnail_url and thumbnail_url not in seen_image_urls:
                    images.insert(0, thumbnail_url)
                
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
                
                if not content or len(content.strip()) < 50:
                    logger.warning(f"본문이 너무 짧거나 없음: {url}")
                    content = None
                
                return {
                    "title": title,
                    "content": content,
                    "source": source,
                    "url": url,
                    "thumbnail_url": thumbnail_url,
                    "images": images,
                    "category": category,
                    "published_at": published_at,
                }
                    
        except Exception as e:
            logger.error(f"뉴스 상세 크롤링 실패 ({url}): {e}")
            import traceback
            logger.debug(traceback.format_exc())
            
        return None
    
    async def crawl_all_sources(self, limit_per_source: int = 20) -> List[Dict]:
        """
        모든 뉴스 소스에서 뉴스 수집 (소스별로 적절히 섞여서 반환)
        """
        results = await asyncio.gather(
            self.crawl_mbnmoney_realestate_rss(limit=limit_per_source),
            self.crawl_naver_realestate(limit=limit_per_source),
            self.crawl_chosun_realestate_rss(limit=limit_per_source),
            self.crawl_herald_realestate_rss(limit=limit_per_source),
            self.crawl_hankyung_realestate_rss(limit=limit_per_source),
            return_exceptions=True
        )
        
        source_news_lists = []
        source_names = ["매일경제", "네이버", "조선일보", "해럴드경제", "한국경제"]
        
        for idx, result in enumerate(results):
            if isinstance(result, list):
                seen_urls = set()
                unique_news = []
                for news in result:
                    if news["url"] not in seen_urls:
                        seen_urls.add(news["url"])
                        unique_news.append(news)
                source_news_lists.append(unique_news)
            elif isinstance(result, Exception):
                logger.error(f"크롤링 중 오류 ({source_names[idx]}): {result}")
                source_news_lists.append([])
        
        # 라운드 로빈 방식으로 섞기
        mixed_news = []
        indices = [0] * len(source_news_lists)
        
        while True:
            added_any = False
            for i, news_list in enumerate(source_news_lists):
                if indices[i] < len(news_list):
                    news = news_list[indices[i]]
                    if not any(existing["url"] == news["url"] for existing in mixed_news):
                        mixed_news.append(news)
                        added_any = True
                    indices[i] += 1
            
            if not added_any:
                break
        
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
