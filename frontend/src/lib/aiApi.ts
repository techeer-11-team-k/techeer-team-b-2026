/**
 * AI 검색 API 클라이언트
 * 
 * AI 자연어 검색 기능을 제공합니다.
 */
import apiClient from './api';

/**
 * AI 검색 조건 (파싱된 결과)
 */
export interface AISearchCriteria {
  location?: string | null;
  region_id?: number | null;
  min_area?: number | null;
  max_area?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  subway_max_distance_minutes?: number | null;
  has_education_facility?: boolean | null;
  raw_query: string;
  parsed_confidence?: number | null;
}

/**
 * AI 검색 결과 아파트 정보
 */
export interface AISearchApartmentResult {
  apt_id: number;
  apt_name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  exclusive_area?: number | null;
  average_price?: number | null;
  subway_station?: string | null;
  subway_line?: string | null;
  subway_time?: string | null;
  education_facility?: string | null;
}

/**
 * AI 검색 응답
 */
export interface AISearchResponse {
  success: boolean;
  data: {
    criteria: AISearchCriteria;
    apartments: AISearchApartmentResult[];
    count: number;
    total: number;
  };
}

/**
 * AI 검색 히스토리 아이템
 */
export interface AISearchHistoryItem {
  id: string;
  query: string;
  timestamp: number;
  response: AISearchResponse;
  apartments: AISearchApartmentResult[];
}

/**
 * AI 검색 히스토리 저장 (localStorage)
 */
const AI_SEARCH_HISTORY_KEY = 'ai_search_history';
const MAX_HISTORY_ITEMS = 10; // 최대 10개까지 저장

export function saveAISearchHistory(item: AISearchHistoryItem): void {
  try {
    const history = getAISearchHistory();
    // 새로운 항목을 맨 앞에 추가
    const updatedHistory = [item, ...history.filter(h => h.id !== item.id)].slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(AI_SEARCH_HISTORY_KEY, JSON.stringify(updatedHistory));
  } catch (error) {
    console.warn('AI 검색 히스토리 저장 실패:', error);
  }
}

/**
 * AI 검색 히스토리 조회 (localStorage)
 */
export function getAISearchHistory(): AISearchHistoryItem[] {
  try {
    const stored = localStorage.getItem(AI_SEARCH_HISTORY_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as AISearchHistoryItem[];
  } catch (error) {
    console.warn('AI 검색 히스토리 조회 실패:', error);
    return [];
  }
}

/**
 * 특정 ID의 AI 검색 히스토리 조회
 */
export function getAISearchHistoryById(id: string): AISearchHistoryItem | null {
  const history = getAISearchHistory();
  return history.find(item => item.id === id) || null;
}

/**
 * AI 검색 히스토리 삭제
 */
export function clearAISearchHistory(): void {
  try {
    localStorage.removeItem(AI_SEARCH_HISTORY_KEY);
  } catch (error) {
    console.warn('AI 검색 히스토리 삭제 실패:', error);
  }
}

/**
 * AI 자연어 아파트 검색
 * 
 * 자연어로 원하는 집의 조건을 설명하면 AI가 파싱하여 관련 아파트 목록을 반환합니다.
 * 
 * @param query 자연어 검색 쿼리 (5자 이상, 500자 이하)
 * @returns AI 검색 결과
 * 
 * @example
 * ```typescript
 * const result = await aiSearchApartments("강남구에 있는 30평대 아파트, 지하철역에서 10분 이내, 초등학교 근처");
 * ```
 */
export async function aiSearchApartments(query: string): Promise<AISearchResponse> {
  // 최소 길이 검증
  if (!query || query.length < 5) {
    throw new Error('검색어는 최소 5자 이상이어야 합니다.');
  }
  
  // 최대 길이 검증
  if (query.length > 500) {
    throw new Error('검색어는 최대 500자까지 입력 가능합니다.');
  }

  try {
    const response = await apiClient.post<AISearchResponse>('/ai/search', {
      query: query.trim()
    });

    if (response.data && response.data.success) {
      return response.data;
    } else {
      throw new Error('AI 검색에 실패했습니다.');
    }
  } catch (error: any) {
    console.error('Failed to search with AI:', error);
    
    // 에러 메시지 추출
    let errorMessage = 'AI 검색에 실패했습니다.';
    if (error.response?.data?.detail) {
      if (typeof error.response.data.detail === 'string') {
        errorMessage = error.response.data.detail;
      } else if (error.response.data.detail?.message) {
        errorMessage = error.response.data.detail.message;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
}
