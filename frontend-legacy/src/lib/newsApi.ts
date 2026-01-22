import apiClient from './api';

/**
 * 뉴스 응답 타입 정의
 * 백엔드 API 스키마와 일치
 */
export interface NewsResponse {
  id: string;
  title: string;
  content: string | null;
  source: string;
  url: string;
  thumbnail_url: string | null;
  images: string[];
  category: string | null;
  published_at: string; // ISO datetime string
}

export interface NewsListResponse {
  success: boolean;
  data: NewsResponse[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface NewsDetailResponse {
  success: boolean;
  data: NewsResponse;
}

/**
 * 뉴스 목록 조회
 * @param limitPerSource 소스당 최대 수집 개수 (기본값: 20, 최대: 100)
 * @param token 인증 토큰 (선택사항)
 * @param keywords 검색 키워드 배열 (예: ["서울시", "강남구"]) - 선택사항
 * @param apartment 아파트 이름 (예: "래미안", "힐스테이트") - 선택사항
 * @param aptId 아파트 ID - 선택사항
 * 
 * 키워드가 제공되면:
 * - 각 키워드가 뉴스 제목이나 본문에 포함되어 있는지 확인
 * - 제목에 포함된 키워드는 높은 점수, 본문에 포함된 키워드는 낮은 점수
 * - 관련성 점수가 높은 순으로 최대 5개 뉴스 반환
 */
export async function getNewsList(
  limitPerSource: number = 20,
  token?: string | null,
  keywords?: string[] | null,
  apartment?: string | null,
  aptId?: number | null
): Promise<NewsListResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const params: Record<string, any> = {
    limit_per_source: limitPerSource,
  };

  // 키워드 파라미터 추가 (배열 형태)
  // axios는 배열을 자동으로 keywords=value1&keywords=value2 형식으로 변환
  if (keywords && keywords.length > 0) {
    params.keywords = keywords;
    console.log('[getNewsList] 전달할 keywords:', keywords);
  }
  if (apartment) {
    params.apartment = apartment;
  }
  // 아파트 ID 파라미터 추가
  if (aptId) {
    params.apt_id = aptId;
  }

  console.log('[getNewsList] 최종 params:', params);
  console.log('[getNewsList] keywords 파라미터:', params.keywords);
  const response = await apiClient.get<NewsListResponse>('/news', {
    params,
    headers,
    paramsSerializer: {
      indexes: null, // 배열을 regions=value1&regions=value2 형식으로 전달
    },
  });
  console.log('[getNewsList] 응답 데이터:', response.data);
  return response.data;
}

/**
 * 뉴스 상세 조회
 * @param url 뉴스 상세 페이지 URL
 * @param token 인증 토큰 (선택사항)
 */
export async function getNewsDetail(
  url: string,
  token?: string | null
): Promise<NewsDetailResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await apiClient.get<NewsDetailResponse>('/news/detail', {
    params: {
      url,
    },
    headers,
  });
  return response.data;
}

/**
 * 시간 경과 표시를 위한 헬퍼 함수
 * published_at을 받아 "N시간 전", "N일 전" 등의 형식으로 변환
 * 미래 날짜나 잘못된 날짜는 "방금 전"으로 표시
 */
export function formatTimeAgo(publishedAt: string): string {
  const published = new Date(publishedAt);
  const now = new Date();
  
  // 유효하지 않은 날짜 처리
  if (isNaN(published.getTime())) {
    return '방금 전';
  }
  
  const diffMs = now.getTime() - published.getTime();
  
  // 미래 날짜나 1분 미만인 경우
  if (diffMs < 0 || diffMs < 60000) {
    return '방금 전';
  }
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  } else if (diffHours < 24) {
    return `${diffHours}시간 전`;
  } else if (diffDays < 7) {
    return `${diffDays}일 전`;
  } else {
    // 7일 이상이면 날짜 형식으로 표시
    return published.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  }
}
