"""
뉴스 관련 Pydantic 스키마

요청/응답 데이터 검증 및 직렬화를 담당합니다.

 스키마 구조 설명:

1. NewsBase (기본 스키마)
   - 모든 뉴스가 공통으로 가지는 필드들
   - title, content, source, url, thumbnail_url, category, published_at
   - 다른 스키마들이 이걸 상속받아 사용

2. NewsCreate (크롤링 결과 검증용)
   - NewsBase를 상속받음 (동일한 필드)
   - 크롤러에서 수집한 데이터를 검증할 때 사용
   - 실제로는 DB에 저장하지 않지만, 데이터 형식 검증 용도

3. NewsResponse (API 응답용)
   - NewsBase를 상속받음 (동일한 필드)
   - API 응답으로 반환할 때 사용
   - DB 저장이 없으므로 news_id, created_at, updated_at 같은 DB 관련 필드는 없음

4. NewsUpdate (제거됨)
   - DB 저장이 없으므로 업데이트 기능도 없음
   - 만약 업데이트가 필요하다면:
     * source(출처): 변경하면 안 됨 (크롤링한 원본 출처이므로)
     * category(카테고리): 변경 가능할 수도 있지만, DB 저장이 없으니 의미 없음
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class NewsBase(BaseModel):
    """
    뉴스 기본 스키마
    
    모든 뉴스 스키마가 공통으로 사용하는 필드들을 정의합니다.
    크롤링 결과와 API 응답 모두 이 구조를 따릅니다.
    """
    title: str = Field(..., description="뉴스 제목", max_length=500)
    content: Optional[str] = Field(None, description="뉴스 본문")
    source: str = Field(..., description="출처 (예: 네이버 부동산, 매일경제)", max_length=100)
    url: str = Field(..., description="원본 뉴스 링크", max_length=1000)
    thumbnail_url: Optional[str] = Field(None, description="썸네일 이미지 URL", max_length=1000)
    images: Optional[List[str]] = Field(default_factory=list, description="본문 내 모든 이미지 URL 리스트")
    category: Optional[str] = Field(None, description="카테고리 (예: 정책, 시세, 투자)", max_length=50)
    published_at: datetime = Field(..., description="뉴스 발행일")


class NewsCreate(NewsBase):
    """
    뉴스 생성 스키마 (크롤링 결과 검증용)
    
    크롤러에서 수집한 뉴스 데이터를 검증할 때 사용합니다.
    NewsBase를 상속받아 동일한 필드를 가지지만,
    명확성을 위해 별도 클래스로 정의했습니다.
    
    실제로는 DB에 저장하지 않지만, 크롤링 결과의 형식을 검증하는 용도로 사용합니다.
    """
    pass


class NewsResponse(NewsBase):
    """
    뉴스 응답 스키마
    
    API 응답으로 반환할 때 사용합니다.
    DB 저장이 없으므로 news_id, created_at, updated_at 같은 DB 관련 필드는 없습니다.
    
    크롤링 결과를 그대로 반환하므로 NewsBase와 동일한 구조입니다.
    """
    id: str = Field(..., description="뉴스 고유 ID (URL 기반 해시값, 프론트엔드 리스트 키용)")


class NewsListResponse(BaseModel):
    """
    뉴스 목록 응답 스키마
    
    여러 뉴스를 한 번에 반환할 때 사용합니다.
    """
    success: bool = True
    data: list[NewsResponse] = Field(..., description="뉴스 목록")
    meta: dict = Field(
        default_factory=lambda: {
            "total": 0,
            "limit": 20,
            "offset": 0
        },
        description="페이지네이션 메타 정보"
    )


class NewsDetailResponse(BaseModel):
    """
    뉴스 상세 응답 스키마
    
    단일 뉴스의 상세 정보를 반환할 때 사용합니다.
    """
    success: bool = True
    data: NewsResponse = Field(..., description="뉴스 상세 정보")
