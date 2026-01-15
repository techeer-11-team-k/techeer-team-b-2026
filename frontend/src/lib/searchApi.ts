import apiClient from './api';
import { getFromCache, setToCache } from './cache';

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
  
  const cacheKey = `/search/apartments`;
  const params = { q: query, limit: 10 };
  
  // 캐시에서 조회 시도
  const cached = getFromCache<ApartmentSearchResult[]>(cacheKey, params);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await apiClient.get<SearchResponse>(cacheKey, { params });
    
    if (response.data && response.data.success) {
      const results = response.data.data.results;
      
      // 캐시에 저장 (TTL: 10분)
      setToCache(cacheKey, results, params, 10 * 60 * 1000);
      
      return results;
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
  
  const cacheKey = `/search/locations`;
  const params = { q: query };
  
  // 캐시에서 조회 시도
  const cached = getFromCache<LocationSearchResult[]>(cacheKey, params);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await apiClient.get<LocationSearchResponse>(cacheKey, { params });
    
    if (response.data && response.data.success) {
      const results = response.data.data.results;
      
      // 캐시에 저장 (TTL: 30분)
      setToCache(cacheKey, results, params, 30 * 60 * 1000);
      
      return results;
    }
    return [];
  } catch (error) {
    console.error('Failed to search locations:', error);
    return [];
  }
};
