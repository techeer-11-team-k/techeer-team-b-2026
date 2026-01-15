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

export interface RecentSearch {
  id: number;
  query: string;
  type: 'apartment' | 'location';
  searched_at: string;
}

export interface RecentSearchResponse {
  success: boolean;
  data: {
    recent_searches: RecentSearch[];
  };
}

export interface LocationSearchResult {
  region_id: number;
  region_name: string;
  region_code: string;
  city_name: string;
  full_name: string;
  location_type: 'city' | 'sigungu' | 'dong';
}

export interface LocationSearchResponse {
  success: boolean;
  data: {
    results: LocationSearchResult[];
  };
  meta: {
    query: string;
    count: number;
    location_type?: string | null;
  };
}

export interface GroupedLocationResults {
  sigungu: LocationSearchResult[];
  dong: LocationSearchResult[];
}

/**
 * 아파트 이름으로 검색합니다.
 * @param query 검색어 (2글자 이상)
 * @param token 인증 토큰 (선택적, 로그인한 사용자만 자동 저장)
 * @returns 검색 결과 목록
 */
export const searchApartments = async (query: string, token?: string | null): Promise<ApartmentSearchResult[]> => {
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
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await apiClient.get<SearchResponse>(`/search/apartments`, {
      params: { q: query, limit: 10 },
      headers
    });
    
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
 * 지역(시/군/구/동)으로 검색합니다.
 * @param query 검색어 (1글자 이상)
 * @param token 인증 토큰 (선택적, 로그인한 사용자만 자동 저장)
 * @param locationType 지역 유형 필터 (sigungu: 시군구만, dong: 동만, null: 전체)
 * @returns 검색 결과 목록
 */
export const searchLocations = async (
  query: string, 
  token?: string | null,
  locationType?: 'sigungu' | 'dong' | null
): Promise<LocationSearchResult[]> => {
  if (!query || query.length < 1) return [];
  
  const cacheKey = `/search/locations`;
  const params = { q: query };
  
  // 캐시에서 조회 시도
  const cached = getFromCache<LocationSearchResult[]>(cacheKey, params);
  if (cached) {
    return cached;
  }
  
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const params: Record<string, any> = { q: query, limit: 50 };
    if (locationType) {
      params.location_type = locationType;
    }
    
    const response = await apiClient.get<LocationSearchResponse>(`/search/locations`, {
      params,
      headers
    });
    
    if (response.data && response.data.success) {
      const results = response.data.data.results || [];
      
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

/**
 * 지역 검색 결과를 시군구별로 그룹화합니다.
 * @param results 지역 검색 결과 목록
 * @returns 시군구별로 그룹화된 결과
 */
export const groupLocationsBySigungu = (results: LocationSearchResult[]): Map<string, LocationSearchResult[]> => {
  const grouped = new Map<string, LocationSearchResult[]>();
  
  // 각 결과를 개별 항목으로 추가 (동도 시군구처럼 개별 표시)
  results.forEach((result) => {
    let key: string;
    
    if (result.location_type === 'city') {
      // 시도 레벨
      key = result.full_name || result.region_name;
    } else if (result.location_type === 'sigungu') {
      // 시군구 레벨
      key = result.full_name || `${result.city_name} ${result.region_name}`;
    } else if (result.location_type === 'dong') {
      // 동 레벨 - 개별 항목으로 표시
      key = result.full_name || `${result.city_name} ${result.sigungu_name || ''} ${result.region_name}`.trim();
    } else {
      key = result.full_name || result.region_name;
    }
    
    // 고유 키 생성 (같은 이름의 다른 지역 구분)
    const uniqueKey = `${key}_${result.region_id}`;
    
    if (!grouped.has(uniqueKey)) {
      grouped.set(uniqueKey, []);
    }
    grouped.get(uniqueKey)!.push(result);
  });
  
  return grouped;
};

/**
 * 지역별 아파트 목록을 조회합니다.
 * @param regionId 지역 ID
 * @param limit 반환할 최대 개수
 * @param skip 건너뛸 레코드 수
 * @returns 아파트 목록
 */
export const getApartmentsByRegion = async (
  regionId: number,
  limit: number = 50,
  skip: number = 0
): Promise<ApartmentSearchResult[]> => {
  try {
    const response = await apiClient.get<SearchResponse>(`/apartments`, {
      params: { region_id: regionId, limit, skip }
    });
    
    if (response.data && response.data.success) {
      return response.data.data.results || [];
    }
    return [];
  } catch (error) {
    console.error('Failed to get apartments by region:', error);
    return [];
  }
};

/**
 * 최근 검색어 목록을 가져옵니다.
 * @param token 인증 토큰 (선택적, 로그인한 사용자만)
 * @param limit 가져올 최대 개수 (기본 10개, 최대 50개)
 * @returns 최근 검색어 목록
 */
export const getRecentSearches = async (token?: string | null, limit: number = 10): Promise<RecentSearch[]> => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await apiClient.get<RecentSearchResponse>(`/search/recent`, {
      params: { limit: Math.min(limit, 50) }, // 최대 50개까지
      headers
    });
    
    if (response.data && response.data.success) {
      return response.data.data.recent_searches || [];
    }
    return [];
  } catch (error: any) {
    // 401 에러는 로그인하지 않은 경우이므로 빈 배열 반환
    if (error.response?.status === 401) {
      return [];
    }
    console.error('Failed to get recent searches:', error);
    // 에러 발생 시 빈 배열 반환하여 UI 중단 방지
    return [];
  }
};

/**
 * 최근 검색어를 삭제합니다.
 * @param searchId 삭제할 검색어 ID
 * @param token 인증 토큰 (필수)
 * @returns 삭제 성공 여부
 */
export const deleteRecentSearch = async (searchId: number, token: string): Promise<boolean> => {
  try {
    const response = await apiClient.delete(`/search/recent/${searchId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data && response.data.success === true;
  } catch (error) {
    console.error('Failed to delete recent search:', error);
    return false;
  }
};

/**
 * 모든 최근 검색어를 삭제합니다.
 * @param token 인증 토큰 (필수)
 * @returns 삭제 성공 여부
 */
export const deleteAllRecentSearches = async (token: string): Promise<boolean> => {
  try {
    // 최대 50개까지 가져와서 모두 삭제
    // 백엔드 API가 limit만 지원하므로, 반복적으로 가져와서 삭제
    let allSearches: RecentSearch[] = [];
    let previousCount = 0;
    const batchSize = 50;
    
    // 모든 검색어를 가져올 때까지 반복 (최대 10번 반복으로 제한)
    for (let i = 0; i < 10; i++) {
      const searches = await getRecentSearches(token, batchSize);
      
      if (searches.length === 0) {
        break; // 더 이상 검색어가 없음
      }
      
      // 이전에 가져온 검색어와 중복되지 않는 것만 추가
      const newSearches = searches.filter(s => !allSearches.some(existing => existing.id === s.id));
      allSearches = [...allSearches, ...newSearches];
      
      // 가져온 검색어 수가 이전과 같거나 적으면 더 이상 없음
      if (searches.length < batchSize || newSearches.length === 0) {
        break;
      }
      
      previousCount = searches.length;
    }
    
    // 모든 검색어 삭제 (배치로 처리하여 성능 향상)
    if (allSearches.length > 0) {
      // 10개씩 나누어서 삭제 (너무 많은 동시 요청 방지)
      const batchSize = 10;
      for (let i = 0; i < allSearches.length; i += batchSize) {
        const batch = allSearches.slice(i, i + batchSize);
        await Promise.all(batch.map(search => deleteRecentSearch(search.id, token)));
      }
    }
    
    return true;
  } catch (error) {
    console.error('Failed to delete all recent searches:', error);
    return false;
  }
};
