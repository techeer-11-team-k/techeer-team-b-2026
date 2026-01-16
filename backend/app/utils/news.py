"""
뉴스 관련 유틸리티 함수
"""
import hashlib
import re
from typing import Dict, List, Optional, Tuple


def generate_news_id(url: str) -> str:
    """
    URL을 기반으로 간단한 뉴스 ID 생성 (해시 기반)
    
    Args:
        url: 뉴스 URL
        
    Returns:
        URL의 MD5 해시값 앞 12자리 (짧고 깔끔한 ID)
    """
    return hashlib.md5(url.encode('utf-8')).hexdigest()[:12]


def calculate_location_relevance(news: Dict, si: Optional[str] = None, dong: Optional[str] = None, apartment: Optional[str] = None) -> Tuple[float, str]:
    """
    뉴스와 지역(시, 동, 아파트)의 관련성 점수를 계산합니다.
    
    검색 단계:
    1. 시 + 부동산
    2. 시 + 동 + 부동산
    3. 시 + 동 + 아파트이름 + 부동산
    
    관련성 점수 계산 기준:
    - 제목에 포함되면 높은 점수
    - 본문에 포함되면 낮은 점수
    - 부동산 키워드가 포함되면 보너스 점수
    - 우선순위: 아파트 > 동 > 시 (더 구체적일수록 높은 점수)
    
    Args:
        news: 뉴스 딕셔너리 (title, content 포함)
        si: 시 이름 (예: "서울시", "부산시")
        dong: 동 이름 (예: "강남동", "서초동")
        apartment: 아파트 이름 (예: "래미안", "힐스테이트")
        
    Returns:
        (관련성 점수, 매칭된 카테고리) 튜플
        카테고리: "apartment", "dong", "si", "none"
    """
    title = news.get("title", "") or ""
    content = news.get("content", "") or ""
    title_lower = title.lower()
    content_lower = content.lower()
    
    # 부동산 키워드 체크
    real_estate_keywords = ["부동산", "아파트", "주택", "매매", "전세", "월세", "분양"]
    has_real_estate = any(keyword in title_lower or keyword in content_lower for keyword in real_estate_keywords)
    real_estate_bonus = 5.0 if has_real_estate else 0.0
    
    score = 0.0
    matched_category = "none"
    
    # 3단계: 시 + 동 + 아파트이름 + 부동산 (가장 높은 우선순위)
    if apartment and apartment.strip() and si and si.strip() and dong and dong.strip():
        apartment_name = apartment.strip()
        si_name = si.strip()
        dong_name = dong.strip()
        apartment_lower = apartment_name.lower()
        si_lower = si_name.lower()
        if si_lower.endswith("시"):
            si_lower = si_lower[:-1]
        dong_lower = dong_name.lower()
        
        # 모든 키워드가 포함되어 있는지 확인
        has_apartment = apartment_lower in title_lower or apartment_lower in content_lower
        has_si = si_lower in title_lower or si_lower in content_lower
        has_dong = dong_lower in title_lower or dong_lower in content_lower
        
        if has_apartment and has_si and has_dong:
            # 제목에 모두 포함된 경우
            if (apartment_lower in title_lower and si_lower in title_lower and dong_lower in title_lower):
                score = 50.0 + real_estate_bonus  # 최고 점수
                matched_category = "apartment"
            # 본문에 포함된 경우
            else:
                score = 35.0 + real_estate_bonus
                matched_category = "apartment"
    
    # 2단계: 시 + 동 + 부동산 (아파트 매칭이 없을 때만)
    if matched_category == "none" and si and si.strip() and dong and dong.strip():
        si_name = si.strip()
        dong_name = dong.strip()
        si_lower = si_name.lower()
        if si_lower.endswith("시"):
            si_lower = si_lower[:-1]
        dong_lower = dong_name.lower()
        
        has_si = si_lower in title_lower or si_lower in content_lower
        has_dong = dong_lower in title_lower or dong_lower in content_lower
        
        if has_si and has_dong:
            # 제목에 모두 포함된 경우
            if si_lower in title_lower and dong_lower in title_lower:
                score = 30.0 + real_estate_bonus
                matched_category = "dong"
            # 본문에 포함된 경우
            else:
                score = 20.0 + real_estate_bonus
                matched_category = "dong"
    
    # 1단계: 시 + 부동산 (아파트, 동 매칭이 없을 때만)
    if matched_category == "none" and si and si.strip():
        si_name = si.strip()
        si_lower = si_name.lower()
        
        # "시" 접미사 제거 (예: "서울시" -> "서울")
        if si_lower.endswith("시"):
            si_lower = si_lower[:-1]
        
        has_si = si_lower in title_lower or si_lower in content_lower
        
        if has_si:
            # 제목에 시 이름이 포함되어 있는지 확인
            if si_lower in title_lower:
                if re.search(rf'\b{re.escape(si_lower)}\b', title_lower):
                    score = 20.0 + real_estate_bonus  # 시 + 제목 + 부동산
                    matched_category = "si"
                else:
                    score = 15.0 + real_estate_bonus
                    matched_category = "si"
            # 본문에 시 이름이 포함되어 있는지 확인
            elif si_lower in content_lower:
                exact_matches = len(re.findall(rf'\b{re.escape(si_lower)}\b', content_lower))
                if exact_matches > 0:
                    score = 10.0 + (exact_matches - 1) * 0.5 + real_estate_bonus  # 본문 + 시 + 부동산
                    matched_category = "si"
                else:
                    score = 5.0 + real_estate_bonus
                    matched_category = "si"
    
    return score, matched_category


def parse_region_name(region_name: str) -> Tuple[Optional[str], Optional[str]]:
    """
    region_name을 파싱하여 시와 동을 추출합니다.
    
    예시:
    - "서울특별시 강남구 역삼동" -> ("서울시", "역삼동")
    - "부산광역시 해운대구 우동" -> ("부산시", "우동")
    - "경기도 성남시 분당구 정자동" -> ("성남시", "정자동")
    
    Args:
        region_name: 지역명 (예: "서울특별시 강남구 역삼동")
        
    Returns:
        (시 이름, 동 이름) 튜플
    """
    if not region_name or not region_name.strip():
        return None, None
    
    parts = region_name.strip().split()
    if len(parts) < 2:
        return None, None
    
    # 마지막 부분이 동
    dong = parts[-1] if parts[-1].endswith("동") else None
    
    # 첫 번째 부분이 시
    si = parts[0]
    # "특별시", "광역시" 등을 "시"로 변환
    if "특별시" in si:
        si = si.replace("특별시", "시")
    elif "광역시" in si:
        si = si.replace("광역시", "시")
    elif not si.endswith("시"):
        # 시가 없으면 추가 (예: "경기도" -> "경기시"는 이상하지만 일단 그대로)
        pass
    
    return si, dong


def filter_news_by_location(
    news_list: List[Dict],
    si: Optional[str] = None,
    dong: Optional[str] = None,
    apartment: Optional[str] = None
) -> List[Dict]:
    """
    뉴스 목록을 시, 동, 아파트별로 필터링하고 관련성 점수로 정렬합니다.
    
    반환 규칙:
    - 시 관련 뉴스: 5개
    - 동 관련 뉴스: 4개
    - 아파트 관련 뉴스: 우선순위 (있으면 포함)
    - 총 5개 (아파트/동 관련이 부족하면 시/동 뉴스로 채움)
    
    Args:
        news_list: 뉴스 딕셔너리 리스트
        si: 시 이름
        dong: 동 이름
        apartment: 아파트 이름
        
    Returns:
        관련성 점수가 높은 순으로 정렬된 뉴스 리스트 (최대 5개)
    """
    if not si and not dong and not apartment:
        return news_list
    
    # 각 뉴스에 관련성 점수 계산 및 카테고리 분류
    scored_news = []
    for news in news_list:
        score, category = calculate_location_relevance(news, si, dong, apartment)
        if score > 0:
            news_with_score = news.copy()
            news_with_score["relevance_score"] = score
            news_with_score["matched_category"] = category
            scored_news.append(news_with_score)
    
    # 관련성 점수 기준으로 내림차순 정렬
    scored_news.sort(key=lambda x: x.get("relevance_score", 0.0), reverse=True)
    
    # 카테고리별로 분류
    apartment_news = [n for n in scored_news if n.get("matched_category") == "apartment"]
    dong_news = [n for n in scored_news if n.get("matched_category") == "dong"]
    si_news = [n for n in scored_news if n.get("matched_category") == "si"]
    
    # 우선순위에 따라 선택
    result = []
    seen_urls = set()  # 중복 제거용
    
    # 1. 아파트 관련 뉴스 (최대 5개, 있으면 우선)
    apartment_selected = []
    for news in apartment_news[:5]:
        if news["url"] not in seen_urls:
            apartment_selected.append(news)
            seen_urls.add(news["url"])
    
    # 2. 동 관련 뉴스 (최대 4개)
    dong_selected = []
    for news in dong_news[:4]:
        if news["url"] not in seen_urls:
            dong_selected.append(news)
            seen_urls.add(news["url"])
    
    # 3. 시 관련 뉴스 (최대 5개)
    si_selected = []
    for news in si_news[:5]:
        if news["url"] not in seen_urls:
            si_selected.append(news)
            seen_urls.add(news["url"])
    
    # 4. 아파트나 동 관련 뉴스가 없을 때 시와 동에서 찾은 뉴스를 섞어서 5개 채우기
    # 우선순위: 아파트 > 동 > 시
    result.extend(apartment_selected)
    
    # 동 관련 뉴스 추가 (아파트 뉴스가 부족하면)
    remaining_slots = 5 - len(result)
    if remaining_slots > 0:
        result.extend(dong_selected[:remaining_slots])
    
    # 시 관련 뉴스 추가 (아파트/동 뉴스가 부족하면)
    remaining_slots = 5 - len(result)
    if remaining_slots > 0:
        result.extend(si_selected[:remaining_slots])
    
    # 최대 5개까지만 반환
    return result[:5]
