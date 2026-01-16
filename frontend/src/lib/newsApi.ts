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
 * @param si 시 이름 (예: "서울시", "부산시") - 선택사항
 * @param dong 동 이름 (예: "강남동", "서초동") - 선택사항
 * @param apartment 아파트 이름 (예: "래미안", "힐스테이트") - 선택사항
 * 
 * 지역 파라미터가 모두 제공되면:
 * - 시 관련 뉴스 1개
 * - 동 관련 뉴스 2개
 * - 아파트 관련 뉴스 2개
 * 총 5개 뉴스 반환
 */
export async function getNewsList(
  limitPerSource: number = 20,
  token?: string | null,
  si?: string | null,
  dong?: string | null,
  apartment?: string | null
): Promise<NewsListResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const params: Record<string, any> = {
    limit_per_source: limitPerSource,
  };

  // 지역 파라미터 추가
  if (si) {
    params.si = si;
  }
  if (dong) {
    params.dong = dong;
  }
  if (apartment) {
    params.apartment = apartment;
  }

  const response = await apiClient.get<NewsListResponse>('/news', {
    params,
    headers,
  });
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
