"""
뉴스 관련 유틸리티 함수
"""
import hashlib


def generate_news_id(url: str) -> str:
    """
    URL을 기반으로 간단한 뉴스 ID 생성 (해시 기반)
    
    Args:
        url: 뉴스 URL
        
    Returns:
        URL의 MD5 해시값 앞 12자리 (짧고 깔끔한 ID)
    """
    return hashlib.md5(url.encode('utf-8')).hexdigest()[:12]
