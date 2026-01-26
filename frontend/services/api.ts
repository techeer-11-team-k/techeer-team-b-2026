const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// 디버깅용 로그
console.log('[API] VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL);
console.log('[API] API_BASE_URL:', API_BASE_URL);

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
  
  // 디버깅용 로그
  console.log('[API Request]', {
    url,
    method: requestInit.method || 'GET',
    hasAuth: !!authToken,
    body: fetchOptions.body
  });
  
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
          
          // FastAPI validation error는 detail 필드에 배열 형태로 반환됨
          if (errorBody.detail) {
            if (Array.isArray(errorBody.detail)) {
              // 배열인 경우: 각 에러를 포맷팅
              errorMessage = errorBody.detail
                .map((err: any) => {
                  if (typeof err === 'string') return err;
                  if (err.msg) return `${err.loc?.join('.') || ''}: ${err.msg}`;
                  return JSON.stringify(err);
                })
                .join(', ');
            } else if (typeof errorBody.detail === 'string') {
              errorMessage = errorBody.detail;
            } else if (errorBody.detail.message) {
              errorMessage = errorBody.detail.message;
            } else {
              errorMessage = JSON.stringify(errorBody.detail);
            }
          } else if (errorBody.message) {
            errorMessage = errorBody.message;
          }
          
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
      // 디버깅용 상세 로그
      const errorDetails = {
        url,
        method: requestInit.method || 'GET',
        attempt,
        errorType: error?.constructor?.name,
        errorMessage: error instanceof Error ? error.message : String(error),
        ...(error instanceof ApiError && error.details ? { errorDetails: error.details } : {})
      };
      
      console.error('[API Error]', errorDetails);
      
      // 에러 메시지 원본을 텍스트로 출력
      if (error instanceof Error) {
        console.error('[API Error] 원본 에러 메시지:', error.message);
        console.error('[API Error] 스택 트레이스:', error.stack);
      } else {
        console.error('[API Error] 원본 에러:', String(error));
      }
      
      // ApiError인 경우 상세 정보 출력
      if (error instanceof ApiError) {
        console.error('[API Error] 상세 정보:', {
          message: error.message,
          status: error.status,
          code: error.code,
          details: error.details
        });
      }
      
      // ApiError는 그대로 전파
      if (error instanceof ApiError) {
        throw error;
      }
      
      // 네트워크 오류 처리 (TypeError, Failed to fetch, CORS 등)
      if (error instanceof TypeError || (error instanceof Error && (
        error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('CORS') ||
        error.message.includes('Failed')
      ))) {
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
  apt_id: number | string;
  apt_name: string;
  address?: string | null;
  location?: ApartmentLocation | null;
  type?: 'apartment' | 'place';
  category?: string;
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

export interface ApartmentExclusiveAreasResponse {
  success: boolean;
  data: {
    apt_id: number;
    apt_name: string;
    exclusive_areas: number[];
  };
}

export const fetchApartmentExclusiveAreas = (aptId: number | string) =>
  apiFetch<ApartmentExclusiveAreasResponse>(`/apartments/${aptId}/exclusive-areas`);

export interface PercentileResponse {
  apt_id: number;
  apt_name: string;
  region_name: string;
  city_name: string;
  // 전국 기준
  percentile: number;
  rank: number;
  total_count: number;
  // 동 내 기준 (선택적)
  region_percentile: number | null;
  region_rank: number | null;
  region_total_count: number | null;
  price_per_pyeong: number;
  average_price_per_pyeong: number | null;
  region_average_price_per_pyeong: number | null;
  period_months: number;
  display_text: string;
}

export const fetchApartmentPercentile = (aptId: number | string) =>
  apiFetch<PercentileResponse>(`/apartments/${aptId}/percentile`);

export const fetchApartmentTransactions = (
  aptId: number,
  transactionType: 'sale' | 'jeonse' | 'monthly' = 'sale',
  limit = 10,
  months = 36,
  area?: number
) => {
  const params = new URLSearchParams();
  params.append('transaction_type', transactionType);
  params.append('limit', String(limit));
  params.append('months', String(months));
  if (area !== undefined) {
    params.append('area', String(area));
  }
  return apiFetch<ApartmentTransactionsResponse>(
    `/apartments/${aptId}/transactions?${params.toString()}`
  );
};

// ============================================
// 대시보드 랭킹 API (변동률 6개월용)
export interface DashboardRankingItem {
  apt_id: number;
  apt_name: string;
  region: string;
  transaction_count?: number;
  avg_price_per_pyeong?: number;
  avg_price?: number;  // 실제 거래가 (만원 단위)
  change_rate?: number;
  recent_avg?: number;
  previous_avg?: number;
}

export interface DashboardRankingsResponse {
  success: boolean;
  data: {
    trending: DashboardRankingItem[];
    rising: DashboardRankingItem[];
    falling: DashboardRankingItem[];
    price_highest?: DashboardRankingItem[];
    price_lowest?: DashboardRankingItem[];
    volume_ranking?: DashboardRankingItem[];
  };
}

export const fetchDashboardRankings = (
  transactionType: 'sale' | 'jeonse' = 'sale',
  trendingDays: number = 7,
  trendMonths: number = 6
) => {
  const params = new URLSearchParams();
  params.append('transaction_type', transactionType);
  params.append('trending_days', String(trendingDays));
  params.append('trend_months', String(trendMonths));
  return apiFetch<DashboardRankingsResponse>(`/dashboard/rankings?${params.toString()}`);
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
// UI 개인화 설정 API
// ============================================

export type DashboardBottomPanelView =
  | 'policyNews'
  | 'transactionVolume'
  | 'marketPhase'
  | 'regionComparison';

export interface UiPreferences {
  bottom_panel_view: DashboardBottomPanelView;
}

export interface UiPreferencesResponse {
  success: boolean;
  data: UiPreferences;
}

export const fetchMyUiPreferences = () =>
  apiFetch<UiPreferencesResponse>('/users/me/ui-preferences');

export const updateMyUiPreferences = (data: UiPreferences) =>
  apiFetch<UiPreferencesResponse>('/users/me/ui-preferences', { method: 'PUT', body: data });

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
// 통계 API (주택 수요 페이지용)
// ============================================

export interface HPIRegionTypeDataPoint {
  id?: string | null;
  name: string;
  value: number;
  index_change_rate?: number | null;
}

export interface HPIRegionTypeResponse {
  success: boolean;
  data: HPIRegionTypeDataPoint[];
  region_type: string;
  index_type: string;
  base_ym: string;
}

export const fetchHPIByRegionType = (
  regionType: string,
  indexType: string,
  baseYm?: string
) => {
  const params = new URLSearchParams();
  params.append('region_type', regionType);
  params.append('index_type', indexType);
  if (baseYm) params.append('base_ym', baseYm);
  return apiFetch<HPIRegionTypeResponse>(`/statistics/hpi/by-region-type?${params.toString()}`);
};

// ============================================
// 거래량 API
// ============================================

export interface TransactionVolumeDataPoint {
  year: number;
  month: number;
  volume: number;
  city_name?: string | null;
}

export interface TransactionVolumeResponse {
  success: boolean;
  data: TransactionVolumeDataPoint[];
  region_type: string;
  period: string;
  max_years: number;
}

/**
 * 거래량 조회 (월별 데이터)
 * 
 * @param regionType 지역 유형: "전국", "수도권", "지방5대광역시"
 * @param transactionType 거래 유형: "sale" (매매), "rent" (전월세)
 * @param maxYears 최대 연도 수 (1~7, 기본값: 7)
 */
export const fetchTransactionVolume = (
  regionType: '전국' | '수도권' | '지방5대광역시',
  transactionType: 'sale' | 'rent' = 'sale',
  maxYears: number = 7
) => {
  const params = new URLSearchParams();
  params.append('region_type', regionType);
  params.append('transaction_type', transactionType);
  params.append('max_years', maxYears.toString());
  return apiFetch<TransactionVolumeResponse>(`/statistics/transaction-volume?${params.toString()}`);
};


// ============================================
// 지역별 아파트 목록 API
// ============================================

export interface ApartmentsByRegionResponse {
  success: boolean;
  data: {
    results: ApartmentSearchItem[];
    count: number;
    total_count: number;
    has_more: boolean;
  };
}

export const fetchApartmentsByRegion = (
  regionId: number,
  limit = 50,
  skip = 0
) => {
  const params = new URLSearchParams();
  params.append('region_id', String(regionId));
  params.append('limit', String(limit));
  params.append('skip', String(skip));
  return apiFetch<ApartmentsByRegionResponse>(`/apartments/by-region?${params.toString()}`);
};

// ============================================
// 주변 아파트 비교 API
// ============================================
export interface NearbyComparisonItem {
  apt_id: number;
  apt_name: string;
  road_address: string | null;
  jibun_address: string | null;
  distance_meters: number | null;
  total_household_cnt: number | null;
  total_building_cnt: number | null;
  builder_name: string | null;
  use_approval_date: string | null;
  average_price: number | null;
  average_price_per_sqm: number | null;
  transaction_count: number;
}

export interface NearbyComparisonResponse {
  success: boolean;
  data: {
    target_apartment: {
      apt_id: number;
      apt_name: string;
      road_address: string | null;
      jibun_address: string | null;
    };
    nearby_apartments: NearbyComparisonItem[];
    count: number;
    radius_meters: number;
    period_months: number;
  };
}

export const fetchNearbyComparison = (
  aptId: number,
  radiusMeters: number = 1000,
  months: number = 1,
  area?: number,
  transactionType: 'sale' | 'jeonse' | 'monthly' = 'sale'
) => {
  const params = new URLSearchParams();
  params.append('radius_meters', String(radiusMeters));
  params.append('months', String(months));
  params.append('transaction_type', transactionType);
  if (area !== undefined) {
    params.append('area', String(area));
  }
  return apiFetch<NearbyComparisonResponse>(`/apartments/${aptId}/nearby-comparison?${params.toString()}`);
};

export interface SameRegionComparisonResponse {
  success: boolean;
  data: {
    target_apartment: {
      apt_id: number;
      apt_name: string;
      road_address?: string | null;
      jibun_address?: string | null;
      region_id: number;
    };
    same_region_apartments: NearbyComparisonItem[];
    count: number;
    period_months: number;
  };
}

export const fetchSameRegionComparison = (
  aptId: number,
  months: number = 6,
  limit: number = 20,
  area?: number,
  areaTolerance: number = 5.0,
  transactionType: 'sale' | 'jeonse' | 'monthly' = 'sale'
) => {
  const params = new URLSearchParams();
  params.append('months', String(months));
  params.append('limit', String(limit));
  params.append('area_tolerance', String(areaTolerance));
  params.append('transaction_type', transactionType);
  if (area !== undefined) {
    params.append('area', String(area));
  }
  return apiFetch<SameRegionComparisonResponse>(`/apartments/${aptId}/same-region-comparison?${params.toString()}`);
};

// ============================================
// AI 검색 API
// ============================================

export interface AISearchCriteria {
  location?: string | null;
  region_id?: number | null;
  min_area?: number | null;
  max_area?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  min_deposit?: number | null;
  max_deposit?: number | null;
  min_monthly_rent?: number | null;
  max_monthly_rent?: number | null;
  subway_max_distance_minutes?: number | null;
  subway_line?: string | null;
  subway_station?: string | null;
  has_education_facility?: boolean | null;
  min_build_year?: number | null;
  max_build_year?: number | null;
  build_year_range?: string | null;
  min_floor?: number | null;
  max_floor?: number | null;
  floor_type?: string | null;
  min_parking_cnt?: number | null;
  has_parking?: boolean | null;
  builder_name?: string | null;
  developer_name?: string | null;
  heating_type?: string | null;
  manage_type?: string | null;
  hallway_type?: string | null;
  recent_transaction_months?: number | null;
  apartment_name?: string | null;
  raw_query: string;
  parsed_confidence?: number | null;
}

export interface AISearchApartment {
  apt_id: number;
  apt_name: string;
  address?: string | null;
  location?: ApartmentLocation | null;
  exclusive_area?: number | null;
  average_price?: number | null;
  average_deposit?: number | null;
  average_monthly_rent?: number | null;
  subway_station?: string | null;
  subway_time?: string | null;
  education_facility?: string | null;
  build_year?: number | null;
  total_household_cnt?: number | null;
  total_parking_cnt?: number | null;
  region_name?: string | null;
  city_name?: string | null;
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

// ============================================
// 지도 API
// ============================================

export interface MapBoundsRequest {
  sw_lat: number;
  sw_lng: number;
  ne_lat: number;
  ne_lng: number;
  zoom_level: number;
}

export interface RegionPriceItem {
  region_id: number;
  region_name: string;
  city_name?: string;
  avg_price: number;  // 억원 단위
  transaction_count: number;
  lat?: number;
  lng?: number;
  region_type: 'sigungu' | 'dong';
}

export interface ApartmentPriceItem {
  apt_id: number;
  apt_name: string;
  address?: string;
  avg_price: number;  // 억원 단위
  min_price?: number; // 억원 단위
  max_price?: number; // 억원 단위
  price_per_pyeong?: number;  // 만원 단위
  transaction_count: number;
  lat: number;
  lng: number;
}

export interface MapBoundsResponse {
  success: boolean;
  data_type: 'regions' | 'apartments';
  regions?: RegionPriceItem[];
  apartments?: ApartmentPriceItem[];
  zoom_level: number;
  total_count: number;
}

export interface RegionPricesResponse {
  success: boolean;
  data: RegionPriceItem[];
  total_count: number;
  region_type: string;
  transaction_type: string;
}

export interface NearbyApartmentsResponse {
  success: boolean;
  data: Array<ApartmentPriceItem & { distance_meters: number }>;
  total_count: number;
  center: { lat: number; lng: number };
  radius_meters: number;
}

/**
 * 지도 영역 기반 데이터 조회
 * 
 * @param bounds 지도 영역 (남서쪽 ~ 북동쪽 좌표) 및 확대 레벨
 * @param transactionType 거래 유형 (sale: 매매, jeonse: 전세)
 * @param months 평균가 계산 기간 (개월)
 */
export const fetchMapBoundsData = (
  bounds: MapBoundsRequest,
  transactionType: 'sale' | 'jeonse' = 'sale',
  months = 6
) =>
  apiFetch<MapBoundsResponse>(
    `/map/bounds?transaction_type=${transactionType}&months=${months}`,
    {
      method: 'POST',
      body: bounds
    }
  );

/**
 * 전체 지역 평균 가격 조회
 * 
 * @param regionType 지역 유형 (sigungu: 시군구, dong: 동)
 * @param transactionType 거래 유형
 * @param months 평균가 계산 기간
 * @param cityName 특정 시도로 필터링
 */
export const fetchRegionPrices = (
  regionType: 'sigungu' | 'dong' = 'sigungu',
  transactionType: 'sale' | 'jeonse' = 'sale',
  months = 6,
  cityName?: string
) => {
  const params = new URLSearchParams({
    region_type: regionType,
    transaction_type: transactionType,
    months: months.toString()
  });
  if (cityName) params.append('city_name', cityName);
  return apiFetch<RegionPricesResponse>(`/map/regions/prices?${params.toString()}`);
};

/**
 * 주변 아파트 조회
 * 
 * @param lat 중심 위도
 * @param lng 중심 경도
 * @param radiusMeters 검색 반경 (미터)
 * @param transactionType 거래 유형
 * @param months 평균가 계산 기간
 * @param limit 최대 반환 개수
 */
export const fetchNearbyApartments = (
  lat: number,
  lng: number,
  radiusMeters = 1000,
  transactionType: 'sale' | 'jeonse' = 'sale',
  months = 6,
  limit = 30
) => {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lng: lng.toString(),
    radius_meters: radiusMeters.toString(),
    transaction_type: transactionType,
    months: months.toString(),
    limit: limit.toString()
  });
  return apiFetch<NearbyApartmentsResponse>(`/map/apartments/nearby?${params.toString()}`);
};

/**
 * 자동차 길찾기 조회
 * 
 * @param origin 출발지 (경도,위도)
 * @param destination 목적지 (경도,위도)
 * @param priority 우선순위 (RECOMMEND: 추천, TIME: 최단시간, DISTANCE: 최단거리)
 */
export const fetchDirections = (
  origin: string,
  destination: string,
  priority: 'RECOMMEND' | 'TIME' | 'DISTANCE' = 'RECOMMEND'
) => {
  const params = new URLSearchParams({
    origin,
    destination,
    priority
  });
  return apiFetch<any>(`/map/directions?${params.toString()}`);
};

/**
 * 카테고리 장소 검색
 * 
 * @param categoryCode 카테고리 코드 (SW8, SC4 등)
 * @param x 중심 좌표 경도
 * @param y 중심 좌표 위도
 * @param radius 반경 (미터)
 * @param rect 사각형 범위 (min_x,min_y,max_x,max_y)
 */
export const fetchPlacesByCategory = (
  categoryCode: string,
  options: {
    x?: number;
    y?: number;
    radius?: number;
    rect?: string;
    page?: number;
    size?: number;
    sort?: 'distance' | 'accuracy';
  }
) => {
  const params = new URLSearchParams({
    category_group_code: categoryCode,
  });
  
  if (options.x) params.append('x', options.x.toString());
  if (options.y) params.append('y', options.y.toString());
  if (options.radius) params.append('radius', options.radius.toString());
  if (options.rect) params.append('rect', options.rect);
  if (options.page) params.append('page', options.page.toString());
  if (options.size) params.append('size', options.size.toString());
  if (options.sort) params.append('sort', options.sort);
  
  return apiFetch<any>(`/map/places/category?${params.toString()}`);
};

/**
 * 키워드 장소 검색
 */
export const fetchPlacesByKeyword = (
  query: string,
  options: {
    category_group_code?: string;
    x?: number;
    y?: number;
    radius?: number;
    page?: number;
    size?: number;
    sort?: 'distance' | 'accuracy';
  } = {}
) => {
  const params = new URLSearchParams({ query });
  if (options.category_group_code) params.append('category_group_code', options.category_group_code);
  if (options.x) params.append('x', options.x.toString());
  if (options.y) params.append('y', options.y.toString());
  if (options.radius) params.append('radius', options.radius.toString());
  if (options.page) params.append('page', options.page.toString());
  if (options.size) params.append('size', options.size.toString());
  if (options.sort) params.append('sort', options.sort);
  
  return apiFetch<any>(`/map/places/keyword?${params.toString()}`);
};

// ============================================
// 인구 이동 Sankey API
// ============================================

export interface SankeyNode {
  id: string;
  name: string;
  color?: string;
}

export interface SankeyLink {
  from_region: string;
  to_region: string;
  value: number;
}

export interface PopulationMovementSankeyResponse {
  success: boolean;
  nodes: SankeyNode[];
  links: SankeyLink[];
  base_ym: string;
  region_type: string;
}

/**
 * 인구 이동 Sankey 데이터 조회
 * 
 * @param periodMonths 조회 기간 (개월)
 */
export const fetchPopulationFlow = (periodMonths: number = 3, raw: boolean = false) => {
  return apiFetch<PopulationMovementSankeyResponse>(`/statistics/population-flow?period_months=${periodMonths}&raw=${raw}`);
};

// ============================================
// 통계 요약 및 4분면 API
// ============================================

export interface RVOLDataPoint {
  date: string;
  current_volume: number;
  average_volume: number;
  rvol: number;
}

export interface RVOLResponse {
  success: boolean;
  data: RVOLDataPoint[];
  period: string;
}

export interface QuadrantDataPoint {
  date: string;
  sale_volume_change_rate: number;
  rent_volume_change_rate: number;
  quadrant: number;
  quadrant_label: string;
}

export interface QuadrantResponse {
  success: boolean;
  data: QuadrantDataPoint[];
  summary: {
    total_periods: number;
    quadrant_distribution: Record<number, number>;
    sale_previous_avg: number;
    rent_previous_avg: number;
  };
}

export interface StatisticsSummaryResponse {
  success: boolean;
  rvol: RVOLResponse;
  quadrant: QuadrantResponse;
}

/**
 * 4분면 분류 데이터 조회
 */
export const fetchQuadrant = (periodMonths: number = 2) => {
  return apiFetch<QuadrantResponse>(`/statistics/quadrant?period_months=${periodMonths}`);
};

/**
 * 통계 요약 데이터 조회 (RVOL + 4분면)
 */
export const fetchStatisticsSummary = (
  transactionType: 'sale' | 'rent' = 'sale',
  currentPeriodMonths: number = 6,
  averagePeriodMonths: number = 6,
  quadrantPeriodMonths: number = 2
) => {
  const params = new URLSearchParams();
  params.append('transaction_type', transactionType);
  params.append('current_period_months', String(currentPeriodMonths));
  params.append('average_period_months', String(averagePeriodMonths));
  params.append('quadrant_period_months', String(quadrantPeriodMonths));
  
  return apiFetch<StatisticsSummaryResponse>(`/statistics/summary?${params.toString()}`);
};

// ============================================
// 자산 활동 로그 API
// ============================================

export interface ActivityLog {
  id: number;
  account_id: number;
  apt_id: number | null;
  category: 'MY_ASSET' | 'INTEREST';
  event_type: 'ADD' | 'DELETE' | 'PRICE_UP' | 'PRICE_DOWN';
  price_change: number | null;
  previous_price: number | null;
  current_price: number | null;
  created_at: string;
  metadata: string | null;
  apt_name: string | null;
  kapt_code: string | null;
}

export interface ActivityLogsResponse {
  success: boolean;
  data: {
    logs: ActivityLog[];
    total: number;
    limit: number;
    skip: number;
  };
}

export interface ActivityLogFilters {
  category?: 'MY_ASSET' | 'INTEREST';
  event_type?: 'ADD' | 'DELETE' | 'PRICE_UP' | 'PRICE_DOWN';
  start_date?: string;
  end_date?: string;
  limit?: number;
  skip?: number;
}

/**
 * 자산 활동 로그 조회
 * 
 * @param filters 필터 옵션
 */
export const fetchActivityLogs = (filters: ActivityLogFilters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.category) {
    params.append('category', filters.category);
  }
  if (filters.event_type) {
    params.append('event_type', filters.event_type);
  }
  if (filters.start_date) {
    params.append('start_date', filters.start_date);
  }
  if (filters.end_date) {
    params.append('end_date', filters.end_date);
  }
  if (filters.limit !== undefined) {
    params.append('limit', String(filters.limit));
  }
  if (filters.skip !== undefined) {
    params.append('skip', String(filters.skip));
  }
  
  return apiFetch<ActivityLogsResponse>(`/asset-activity?${params.toString()}`);
};

// ============================================
// 거래 내역 API
// ============================================

/**
 * 거래 내역 응답 타입
 */
export interface TransactionResponse {
  trans_id: number;
  apt_id: number;
  transaction_type: '매매' | '전세' | '월세';
  deal_date: string | null;
  exclusive_area: number;
  floor: number;
  apartment_name: string | null;
  apartment_location: string | null;
  trans_price: number | null;
  deposit_price: number | null;
  monthly_rent: number | null;
  rent_type: string | null;
}

export interface TransactionListResponse {
  transactions: TransactionResponse[];
  total: number;
  limit: number;
}

/**
 * 최근 거래 내역 조회
 * 
 * @param limit 조회할 개수 (기본 10개, 최대 100개)
 */
export const fetchRecentTransactions = (limit = 10) => {
  const params = new URLSearchParams();
  params.append('limit', String(limit));
  
  return apiFetch<TransactionListResponse>(`/transactions/recent?${params.toString()}`);
};
