const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// ============================================
// API 설정 상수
// ============================================
const API_CONFIG = {
  /** 기본 타임아웃 (ms) */
  DEFAULT_TIMEOUT: 30000,
  /** 재시도 횟수 */
  MAX_RETRIES: 2,
  /** 재시도 간격 (ms) */
  RETRY_DELAY: 1000,
  /** 재시도 가능한 HTTP 상태 코드 */
  RETRYABLE_STATUS_CODES: [408, 429, 500, 502, 503, 504] as number[],
} as const;

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** 요청 타임아웃 (ms) */
  timeout?: number;
  /** 재시도 여부 (기본: true) */
  retry?: boolean;
};

// ============================================
// API 에러 클래스
// ============================================
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
  
  /** 네트워크 오류 여부 */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
  
  /** 인증 오류 여부 */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
  
  /** 서버 오류 여부 */
  get isServerError(): boolean {
    return this.status >= 500;
  }
}

// Clerk 토큰을 저장할 변수 (setAuthToken으로 설정)
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

/**
 * 지연 함수 (재시도 대기용)
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 타임아웃이 있는 fetch 래퍼
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('요청 시간이 초과되었습니다.', 408, 'TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * API 요청 함수 (타임아웃, 재시도, 에러 처리 포함)
 */
const apiFetch = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const {
    timeout = API_CONFIG.DEFAULT_TIMEOUT,
    retry = true,
    ...fetchOptions
  } = options;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> || {})
  };
  
  // 인증 토큰이 있으면 헤더에 추가
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const url = `${API_BASE_URL}${path}`;
  const requestInit: RequestInit = {
    ...fetchOptions,
    headers,
    body: fetchOptions.body ? JSON.stringify(fetchOptions.body) : undefined
  };
  
  let lastError: Error | null = null;
  const maxAttempts = retry ? API_CONFIG.MAX_RETRIES + 1 : 1;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, requestInit, timeout);
      
      if (!response.ok) {
        // 재시도 가능한 상태 코드인지 확인
        const shouldRetry = retry && 
          attempt < maxAttempts && 
          API_CONFIG.RETRYABLE_STATUS_CODES.includes(response.status);
        
        if (shouldRetry) {
          lastError = new ApiError(
            `API 요청 실패 (${response.status})`,
            response.status
          );
          await delay(API_CONFIG.RETRY_DELAY * attempt);
          continue;
        }
        
        // 에러 응답 파싱
        let errorMessage = `API 요청 실패 (${response.status})`;
        let errorCode: string | undefined;
        let errorDetails: unknown;
        
        try {
          const errorBody = await response.json();
          errorMessage = errorBody.message || errorBody.detail || errorMessage;
          errorCode = errorBody.code;
          errorDetails = errorBody;
        } catch {
          // JSON 파싱 실패 시 텍스트로 시도
          try {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
          } catch {
            // 무시
          }
        }
        
        throw new ApiError(errorMessage, response.status, errorCode, errorDetails);
      }
      
      // 빈 응답 처리
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return {} as T;
      }
      
      return response.json() as Promise<T>;
      
    } catch (error) {
      // ApiError는 그대로 전파
      if (error instanceof ApiError) {
        throw error;
      }
      
      // 네트워크 오류 처리
      if (error instanceof TypeError && error.message.includes('fetch')) {
        lastError = new ApiError(
          '네트워크 연결을 확인해 주세요.',
          0,
          'NETWORK_ERROR'
        );
        
        if (retry && attempt < maxAttempts) {
          await delay(API_CONFIG.RETRY_DELAY * attempt);
          continue;
        }
        
        throw lastError;
      }
      
      // 기타 오류
      throw new ApiError(
        error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        0,
        'UNKNOWN_ERROR'
      );
    }
  }
  
  // 모든 재시도 실패
  throw lastError || new ApiError('요청 처리에 실패했습니다.', 0);
};

export interface ApartmentLocation {
  lat: number;
  lng: number;
}

export interface ApartmentSearchItem {
  apt_id: number;
  apt_name: string;
  address?: string | null;
  location?: ApartmentLocation | null;
}

export interface SearchApartmentsResponse {
  success: boolean;
  data: {
    results: ApartmentSearchItem[];
  };
  meta?: {
    query: string;
    count: number;
  };
}

export interface CompareApartmentItem {
  id: number;
  name: string;
  region: string;
  address?: string | null;
  price?: number | null;
  jeonse?: number | null;
  jeonse_rate?: number | null;
  price_per_pyeong?: number | null;
  households?: number | null;
  parking_total?: number | null;
  parking_per_household?: number | null;
  build_year?: number | null;
  subway?: {
    line?: string | null;
    station?: string | null;
    walking_time?: string | null;
  };
  schools?: {
    elementary: { name: string }[];
    middle: { name: string }[];
    high: { name: string }[];
  };
}

export interface CompareResponse {
  apartments: CompareApartmentItem[];
}

export interface PyeongPriceOption {
  pyeong_type: string;
  area_m2: number;
  recent_sale?: {
    price: number;
    date: string;
    price_per_pyeong: number;
  } | null;
  recent_jeonse?: {
    price: number;
    date: string;
    price_per_pyeong: number;
  } | null;
}

export interface PyeongPricesResponse {
  apartment_id: number;
  apartment_name: string;
  pyeong_options: PyeongPriceOption[];
}

export interface TrendingApartmentItem {
  apt_id: number;
  apt_name: string;
  address?: string | null;
  location?: ApartmentLocation | null;
  transaction_count?: number;
  region_id?: number | null;
}

export interface TrendingApartmentsResponse {
  success: boolean;
  data: {
    apartments: TrendingApartmentItem[];
  };
}

export interface ApartmentDetailResponse {
  success: boolean;
  data: {
    apt_id: number;
    apt_name: string;
    kapt_code?: string | null;
    region_id?: number | null;
    city_name?: string | null;
    region_name?: string | null;
    road_address?: string | null;
    jibun_address?: string | null;
    total_household_cnt?: number | null;
    total_parking_cnt?: number | null;
    use_approval_date?: string | null;
    subway_line?: string | null;
    subway_station?: string | null;
    subway_time?: string | null;
    educationFacility?: string | null;
    builder_name?: string | null;
    developer_name?: string | null;
    code_heat_nm?: string | null;
    hallway_type?: string | null;
    manage_type?: string | null;
    total_building_cnt?: number | null;
    highest_floor?: number | null;
    location?: ApartmentLocation | null;
  };
}

export interface ApartmentTransactionsResponse {
  success: boolean;
  data: {
    apartment: {
      apt_id: number;
      apt_name: string;
    };
    recent_transactions: {
      trans_id: number;
      date: string | null;
      price: number;
      area: number;
      floor: number;
      price_per_sqm: number;
      price_per_pyeong: number;
      trans_type?: string;
      is_canceled?: boolean;
      monthly_rent?: number | null;
    }[];
    price_trend: {
      month: string;
      avg_price: number;
      avg_price_per_pyeong: number;
      transaction_count: number;
    }[];
    change_summary: {
      previous_avg: number | null;
      recent_avg: number | null;
      change_rate: number | null;
      period: string;
    };
    statistics: {
      total_count: number;
      avg_price: number;
      avg_price_per_pyeong: number;
      min_price: number;
      max_price: number;
    };
  };
}

export const searchApartments = (query: string, limit = 10) =>
  apiFetch<SearchApartmentsResponse>(`/search/apartments?q=${encodeURIComponent(query)}&limit=${limit}`);

export const fetchCompareApartments = (apartmentIds: number[]) =>
  apiFetch<CompareResponse>('/apartments/compare', {
    method: 'POST',
    body: { apartment_ids: apartmentIds }
  });

export const fetchPyeongPrices = (aptId: number) =>
  apiFetch<PyeongPricesResponse>(`/apartments/${aptId}/pyeong-prices`);

export const fetchTrendingApartments = (limit = 5) =>
  apiFetch<TrendingApartmentsResponse>(`/apartments/trending?limit=${limit}`);

export const fetchApartmentDetail = (aptId: number) =>
  apiFetch<ApartmentDetailResponse>(`/apartments/${aptId}/detail`);

export const fetchApartmentTransactions = (
  aptId: number,
  transactionType: 'sale' | 'jeonse' | 'monthly' = 'sale',
  limit = 10,
  months = 36,
  area?: number,
  areaTolerance = 5.0
) => {
  const params = new URLSearchParams({
    transaction_type: transactionType,
    limit: limit.toString(),
    months: months.toString()
  });
  if (area !== undefined) {
    params.append('area', area.toString());
    params.append('area_tolerance', areaTolerance.toString());
  }
  return apiFetch<ApartmentTransactionsResponse>(
    `/apartments/${aptId}/transactions?${params.toString()}`
  );
};

export interface ApartmentExclusiveAreasResponse {
  success: boolean;
  data: {
    apt_id: number;
    apt_name: string;
    exclusive_areas: number[];
  };
}

export const fetchApartmentExclusiveAreas = (aptId: number) =>
  apiFetch<ApartmentExclusiveAreasResponse>(`/apartments/${aptId}/exclusive-areas`);

export interface ApartmentsByRegionResponse {
  success: boolean;
  data: {
    results: Array<{
      apt_id: number;
      apt_name: string;
      kapt_code?: string | null;
      region_id: number;
      address?: string | null;
      location?: ApartmentLocation | null;
    }>;
    count: number;
    total_count: number;
    has_more: boolean;
  };
}

export const fetchApartmentsByRegion = (regionId: number, limit = 10, skip = 0) => {
  const params = new URLSearchParams();
  params.append('region_id', String(regionId));
  params.append('limit', String(limit));
  params.append('skip', String(skip));
  return apiFetch<ApartmentsByRegionResponse>(`/apartments?${params.toString()}`);
};

// ============================================
// 인증 관련 API
// ============================================

export interface UserProfile {
  account_id: number;
  clerk_user_id: string;
  email: string;
  nickname?: string;
  profile_image_url?: string;
  is_admin: boolean;
  is_dark_mode: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ProfileResponse {
  success: boolean;
  data: UserProfile;
}

export const fetchMyProfile = () =>
  apiFetch<ProfileResponse>('/auth/me');

export const updateMyProfile = (data: { is_dark_mode?: boolean }) =>
  apiFetch<ProfileResponse>('/auth/me', { method: 'PATCH', body: data });

// ============================================
// 내 자산 (My Properties) API
// ============================================

export interface MyProperty {
  property_id: number;
  account_id: number;
  apt_id: number;
  nickname: string;
  exclusive_area?: number;
  current_market_price?: number;
  purchase_price?: number;
  loan_amount?: number;
  purchase_date?: string;
  risk_checked_at?: string;
  memo?: string;
  apt_name?: string;
  kapt_code?: string;
  region_name?: string;
  city_name?: string;
  builder_name?: string;
  use_approval_date?: string;
  total_household_cnt?: number;
  index_change_rate?: number;
  created_at?: string;
  updated_at?: string;
}

export interface MyPropertiesResponse {
  success: boolean;
  data: {
    properties: MyProperty[];
    total: number;
    limit: number;
  };
}

export interface MyPropertyResponse {
  success: boolean;
  data: MyProperty;
}

export interface CreateMyPropertyInput {
  apt_id: number;
  nickname: string;
  exclusive_area: number;
  current_market_price?: number;
  purchase_price?: number;
  loan_amount?: number;
  purchase_date?: string;
  memo?: string;
}

export const fetchMyProperties = (skip = 0, limit = 100) =>
  apiFetch<MyPropertiesResponse>(`/my-properties?skip=${skip}&limit=${limit}`);

export const fetchMyPropertyDetail = (propertyId: number) =>
  apiFetch<MyPropertyResponse>(`/my-properties/${propertyId}`);

export const createMyProperty = (data: CreateMyPropertyInput) =>
  apiFetch<MyPropertyResponse>('/my-properties', { method: 'POST', body: data });

export const updateMyProperty = (propertyId: number, data: Partial<CreateMyPropertyInput>) =>
  apiFetch<MyPropertyResponse>(`/my-properties/${propertyId}`, { method: 'PATCH', body: data });

export const deleteMyProperty = (propertyId: number) =>
  apiFetch<{ success: boolean; data: { message: string; property_id: number } }>(
    `/my-properties/${propertyId}`,
    { method: 'DELETE' }
  );

// ============================================
// 관심 아파트 (Favorites) API
// ============================================

export interface FavoriteApartment {
  favorite_id: number;
  account_id: number;
  apt_id: number;
  nickname?: string;
  memo?: string;
  apt_name?: string;
  kapt_code?: string;
  region_name?: string;
  city_name?: string;
  current_market_price?: number;
  exclusive_area?: number;  // 최근 거래의 전용면적 (㎡)
  index_change_rate?: number;  // 6개월 기준 변동률
  created_at?: string;
  updated_at?: string;
}

export interface FavoriteApartmentsResponse {
  success: boolean;
  data: {
    favorites: FavoriteApartment[];
    total: number;
    limit: number;
  };
}

export interface FavoriteApartmentResponse {
  success: boolean;
  data: FavoriteApartment;
}

export interface CreateFavoriteApartmentInput {
  apt_id: number;
  nickname?: string;
  memo?: string;
}

export const fetchFavoriteApartments = (skip = 0, limit = 100) =>
  apiFetch<FavoriteApartmentsResponse>(`/favorites/apartments?skip=${skip}&limit=${limit}`);

export const addFavoriteApartment = (data: CreateFavoriteApartmentInput) =>
  apiFetch<FavoriteApartmentResponse>('/favorites/apartments', { method: 'POST', body: data });

export const updateFavoriteApartment = (favoriteId: number, data: { nickname?: string; memo?: string }) =>
  apiFetch<FavoriteApartmentResponse>(`/favorites/apartments/${favoriteId}`, { method: 'PUT', body: data });

export const removeFavoriteApartment = (aptId: number) =>
  apiFetch<{ success: boolean; data: { message: string; apt_id: number } }>(
    `/favorites/apartments/${aptId}`,
    { method: 'DELETE' }
  );

// ============================================
// 뉴스 API
// ============================================

export interface NewsItem {
  id: string;
  title: string;
  content?: string;
  summary?: string;
  url: string;
  source: string;
  date: string;
  thumbnail?: string;
  category?: string;
}

export interface NewsListResponse {
  success: boolean;
  data: NewsItem[];
  meta?: {
    total: number;
    limit: number;
    offset: number;
    apt_id?: number;
    apt_name?: string;
    si?: string;
    dong?: string;
    keywords?: string[];
  };
}

export interface NewsDetailResponse {
  success: boolean;
  data: NewsItem;
}

export const fetchNews = (limitPerSource = 20, aptId?: number, keywords?: string[]) => {
  const params = new URLSearchParams();
  params.append('limit_per_source', String(limitPerSource));
  if (aptId) params.append('apt_id', String(aptId));
  if (keywords && keywords.length > 0) {
    keywords.forEach(kw => params.append('keywords', kw));
  }
  return apiFetch<NewsListResponse>(`/news?${params.toString()}`);
};

export const fetchNewsDetail = (url: string) =>
  apiFetch<NewsDetailResponse>(`/news/detail?url=${encodeURIComponent(url)}`);

// ============================================
// 검색 관련 API (최근 검색어)
// ============================================

export interface RecentSearch {
  search_id: number;
  account_id: number;
  query: string;
  search_type: string;
  created_at: string;
}

export interface RecentSearchesResponse {
  success: boolean;
  data: {
    searches: RecentSearch[];
    total: number;
  };
}

export const fetchRecentSearches = (limit = 10) =>
  apiFetch<RecentSearchesResponse>(`/search/recent?limit=${limit}`);

export const saveRecentSearch = (query: string, searchType = 'apartment') =>
  apiFetch<{ success: boolean; data: RecentSearch }>('/search/recent', {
    method: 'POST',
    body: { query, search_type: searchType }
  });

export const deleteRecentSearch = (searchId: number) =>
  apiFetch<{ success: boolean; data: { message: string } }>(
    `/search/recent/${searchId}`,
    { method: 'DELETE' }
  );

export const clearAllRecentSearches = () =>
  apiFetch<{ success: boolean; data: { message: string } }>(
    '/search/recent/all',
    { method: 'DELETE' }
  );

// ============================================
// 대시보드 API
// ============================================

export interface DashboardSummary {
  total_apartments: number;
  total_transactions: number;
  avg_price_per_pyeong: number;
  price_change_rate: number;
}

export interface DashboardSummaryResponse {
  success: boolean;
  data: DashboardSummary;
}

export const fetchDashboardSummary = () =>
  apiFetch<DashboardSummaryResponse>('/dashboard/summary');

// ============================================
// 지역별 통계 API
// ============================================

export interface RegionStats {
  region_id: number;
  region_name: string;
  city_name: string;
  avg_price_per_pyeong: number;
  change_rate: number;
  transaction_count: number;
  apartment_count: number;
  previous_avg_price: number;
  transaction_type: string;
  period_months: number;
}

export interface RegionStatsResponse {
  success: boolean;
  data: RegionStats;
}

export const fetchRegionStats = (regionId: number, transactionType = 'sale', months = 3) =>
  apiFetch<RegionStatsResponse>(
    `/favorites/regions/${regionId}/stats?transaction_type=${transactionType}&months=${months}`
  );

// ============================================
// 금리 지표 API
// ============================================

export interface InterestRateItem {
  rate_id: number;
  rate_type: string;
  rate_label: string;
  rate_value: number;
  change_value: number;
  trend: 'up' | 'down' | 'stable';
  base_date: string;
  description?: string;
}

export interface InterestRatesResponse {
  success: boolean;
  data: InterestRateItem[];
  meta: { count: number };
}

export const fetchInterestRates = () =>
  apiFetch<InterestRatesResponse>('/interest-rates');

// ============================================
// AI 검색 API
// ============================================

export interface AISearchCriteria {
  location?: string;
  region_id?: number;
  min_area?: number;
  max_area?: number;
  min_price?: number;
  max_price?: number;
  subway_max_distance_minutes?: number;
  has_education_facility?: boolean;
  raw_query: string;
  parsed_confidence?: number;
}

export interface AISearchApartment {
  apt_id: number;
  apt_name: string;
  address?: string;
  location?: ApartmentLocation;
  exclusive_area?: number;
  average_price?: number;
  subway_station?: string;
  subway_line?: string;
  subway_time?: string;
  education_facility?: string;
}

export interface AISearchResponse {
  success: boolean;
  data: {
    criteria: AISearchCriteria;
    apartments: AISearchApartment[];
    count: number;
    total: number;
  };
}

export const aiSearchApartments = (query: string) =>
  apiFetch<AISearchResponse>('/ai/search', {
    method: 'POST',
    body: { query }
  });