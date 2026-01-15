import apiClient from './api';

export interface ApartmentSearchResult {
  apt_id: number;
  apt_name: string;
  address: string;
  sigungu_name: string;
  location: {
    lat: number;
    lng: number;
  };
  price: string;
}

export interface SearchResponse {
  success: boolean;
  data: {
    results: ApartmentSearchResult[];
  };
  meta: {
    query: string;
    count: number;
  };
}

export interface LocationSearchResult {
  id: number;
  name: string;
  type: 'sigungu' | 'dong';
  full_name: string;
  center: {
    lat: number;
    lng: number;
  };
}

export interface LocationSearchResponse {
  success: boolean;
  data: {
    results: LocationSearchResult[];
  };
}

/**
 * 아파트 이름으로 검색합니다.
 * @param query 검색어 (2글자 이상)
 * @returns 검색 결과 목록
 */
export const searchApartments = async (query: string): Promise<ApartmentSearchResult[]> => {
  // 2글자 미만은 검색하지 않음
  if (!query || query.length < 2) return [];
  
  try {
    const response = await apiClient.get<SearchResponse>(`/search/apartments`, {
      params: { q: query, limit: 10 }
    });
    
    if (response.data && response.data.success) {
      return response.data.data.results;
    }
    return [];
  } catch (error) {
    console.error('Failed to search apartments:', error);
    // 에러 발생 시 빈 배열 반환하여 UI 중단 방지
    return [];
  }
};

/**
 * 지역명으로 검색합니다.
 * @param query 검색어 (1글자 이상)
 * @returns 검색 결과 목록
 */
export const searchLocations = async (query: string): Promise<LocationSearchResult[]> => {
  if (!query || query.length < 1) return [];
  
  try {
    const response = await apiClient.get<LocationSearchResponse>(`/search/locations`, {
      params: { q: query }
    });
    
    if (response.data && response.data.success) {
      return response.data.data.results;
    }
    return [];
  } catch (error) {
    console.error('Failed to search locations:', error);
    return [];
  }
};
