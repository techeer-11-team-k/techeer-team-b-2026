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
  score?: number;
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

export interface UnifiedSearchResult {
  type: 'apartment' | 'location';
  apartment?: ApartmentSearchResult;
  location?: LocationSearchResult;
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
      params: { q: query, limit: 10 },
      timeout: 5000 // 5초 타임아웃
    });
    
    if (response.data && response.data.success) {
      return response.data.data.results;
    }
    return [];
  } catch (error: any) {
    // 네트워크 오류는 조용히 처리 (백엔드 서버가 실행되지 않았을 수 있음)
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      console.warn('⚠️ 백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.');
      return [];
    }
    console.error('Failed to search apartments:', error);
    // 에러 발생 시 빈 배열 반환하여 UI 중단 방지
    return [];
  }
};

/**
 * 지역으로 검색합니다.
 * @param query 검색어
 * @returns 검색 결과 목록
 */
export const searchLocations = async (query: string): Promise<LocationSearchResult[]> => {
  if (!query || query.length < 1) return [];
  
  try {
    const response = await apiClient.get<LocationSearchResponse>(`/search/locations`, {
      params: { q: query },
      timeout: 5000 // 5초 타임아웃
    });
    
    if (response.data && response.data.success) {
      return response.data.data.results;
    }
    return [];
  } catch (error: any) {
    // 네트워크 오류는 조용히 처리 (백엔드 서버가 실행되지 않았을 수 있음)
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      console.warn('⚠️ 백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.');
      return [];
    }
    console.error('Failed to search locations:', error);
    return [];
  }
};

/**
 * 통합 검색 (아파트 + 지역)
 * @param query 검색어
 * @returns 통합 검색 결과 목록
 */
export const unifiedSearch = async (query: string): Promise<UnifiedSearchResult[]> => {
  if (!query || query.length < 2) return [];
  
  try {
    // Promise.allSettled를 사용하여 하나가 실패해도 다른 하나는 처리
    const [apartmentsResult, locationsResult] = await Promise.allSettled([
      searchApartments(query),
      searchLocations(query)
    ]);
    
    const apartments = apartmentsResult.status === 'fulfilled' ? apartmentsResult.value : [];
    const locations = locationsResult.status === 'fulfilled' ? locationsResult.value : [];
    
    // 에러가 발생한 경우 로그만 출력하고 계속 진행
    if (apartmentsResult.status === 'rejected') {
      console.warn('아파트 검색 실패:', apartmentsResult.reason);
    }
    if (locationsResult.status === 'rejected') {
      console.warn('지역 검색 실패:', locationsResult.reason);
    }
    
    const results: UnifiedSearchResult[] = [
      ...apartments.map(apt => ({ type: 'apartment' as const, apartment: apt })),
      ...locations.map(loc => ({ type: 'location' as const, location: loc }))
    ];
    
    return results;
  } catch (error) {
    console.error('Failed to unified search:', error);
    return [];
  }
};
