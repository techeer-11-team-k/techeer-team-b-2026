import apiClient from './api';
import { getFromCache, setToCache, deleteFromCache } from './cache';

export interface PriceTrendData {
  month: string;
  avg_price_per_pyeong: number;
  transaction_count: number;
}

export interface VolumeTrendData {
  month: string;
  count: number;
}

export interface MonthlyTrendData {
  month: string;
  avg_price: number;
}

export interface RegionalTrendData {
  region: string;
  data: MonthlyTrendData[];
}

export interface DashboardSummaryResponse {
  success: boolean;
  data: {
    price_trend: PriceTrendData[];
    volume_trend: VolumeTrendData[];
    monthly_trend: {
      national: MonthlyTrendData[];
      regional: RegionalTrendData[];
    };
  };
}

export interface TrendingApartment {
  apt_id: number;
  apt_name: string;
  region: string;
  transaction_count: number;
  avg_price_per_pyeong: number;
}

export interface RankingApartment {
  apt_id: number;
  apt_name: string;
  region: string;
  change_rate: number;
  recent_avg: number;
  previous_avg: number;
}

export interface DashboardRankingsResponse {
  success: boolean;
  data: {
    trending: TrendingApartment[];
    rising: RankingApartment[];
    falling: RankingApartment[];
  };
}

export interface RegionalHeatmapItem {
  region: string;
  change_rate: number;
  avg_price_per_pyeong: number;
  transaction_count: number;
}

export interface RegionalHeatmapResponse {
  success: boolean;
  data: RegionalHeatmapItem[];
}

export interface RegionalTrendItem {
  region: string;
  data: {
    month: string;
    avg_price_per_pyeong: number;
    transaction_count: number;
  }[];
}

export interface RegionalTrendsResponse {
  success: boolean;
  data: RegionalTrendItem[];
}

/**
 * 대시보드 요약 데이터 조회
 * @param transactionType 거래 유형 (sale: 매매, jeonse: 전세)
 * @param months 조회 기간 (개월, 기본값: 6)
 * @returns 대시보드 요약 데이터
 */
export const getDashboardSummary = async (
  transactionType: 'sale' | 'jeonse' = 'sale',
  months: number = 6
): Promise<DashboardSummaryResponse['data']> => {
  const cacheKey = '/dashboard/summary';
  const params = {
    transaction_type: transactionType,
    months
  };
  
  console.log('🔍 [Dashboard API] getDashboardSummary 호출:', { transactionType, months, params });
  
  // 캐시에서 조회 시도
  const cached = getFromCache<DashboardSummaryResponse['data']>(cacheKey, params);
  if (cached) {
    // 빈 배열인지 확인 - 빈 배열이면 캐시 무효화하고 다시 API 호출
    const hasData = cached.price_trend.length > 0 || 
                    cached.volume_trend.length > 0 || 
                    cached.monthly_trend.national.length > 0 || 
                    cached.monthly_trend.regional.length > 0;
    
    if (hasData) {
      console.log('✅ [Dashboard API] 캐시에서 데이터 조회 성공 (데이터 있음):', cached);
      return cached;
    } else {
      console.warn('⚠️ [Dashboard API] 캐시에 빈 데이터가 저장되어 있음. 캐시 무효화하고 API 재호출');
      // 빈 데이터 캐시 삭제
      deleteFromCache(cacheKey, params);
    }
  }
  
  try {
    console.log('📡 [Dashboard API] API 호출 시작:', { url: cacheKey, params });
    const response = await apiClient.get<DashboardSummaryResponse>(cacheKey, { params });
    
    const hasData = (response.data?.data?.price_trend?.length || 0) > 0 || 
                    (response.data?.data?.volume_trend?.length || 0) > 0 || 
                    (response.data?.data?.monthly_trend?.national?.length || 0) > 0 || 
                    (response.data?.data?.monthly_trend?.regional?.length || 0) > 0;
    
    console.log('📥 [Dashboard API] API 응답 받음:', {
      status: response.status,
      statusText: response.statusText,
      success: response.data?.success,
      hasData,
      priceTrendCount: response.data?.data?.price_trend?.length || 0,
      volumeTrendCount: response.data?.data?.volume_trend?.length || 0,
      nationalTrendCount: response.data?.data?.monthly_trend?.national?.length || 0,
      regionalTrendCount: response.data?.data?.monthly_trend?.regional?.length || 0,
    });
    
    if (response.data && response.data.success) {
      const data = response.data.data;
      
      // 데이터가 없는 경우 빈 배열 반환 (성공으로 표시하지 않음)
      if (!hasData) {
        console.warn('⚠️ [Dashboard API] 데이터가 없음 - 빈 배열 반환');
        return {
          price_trend: [],
          volume_trend: [],
          monthly_trend: { national: [], regional: [] }
        };
      }
      
      console.log('✅ [Dashboard API] 데이터 파싱 성공:', {
        price_trend: data.price_trend,
        volume_trend: data.volume_trend,
        monthly_trend: {
          national: data.monthly_trend.national,
          regional: data.monthly_trend.regional
        }
      });
      
      // 데이터가 있는 경우에만 캐시에 저장
      console.log('💾 [Dashboard API] 데이터가 있으므로 캐시에 저장');
      setToCache(cacheKey, data, params, 30 * 60 * 1000);
      
      return data;
    }
    
    console.error('❌ [Dashboard API] Invalid response format:', response.data);
    throw new Error('Invalid response format');
  } catch (error: any) {
    console.error('❌ [Dashboard API] API 호출 실패:', {
      error,
      message: error?.message,
      response: error?.response?.data,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      url: error?.config?.url,
      params: error?.config?.params,
    });
    // 에러 발생 시 빈 데이터 반환
    return {
      price_trend: [],
      volume_trend: [],
      monthly_trend: {
        national: [],
        regional: []
      }
    };
  }
};

/**
 * 대시보드 랭킹 데이터 조회
 * @param transactionType 거래 유형 (sale: 매매, jeonse: 전세)
 * @param trendingDays 관심 많은 아파트 조회 기간 (일, 기본값: 7)
 * @param trendMonths 상승/하락률 계산 기간 (개월, 기본값: 3)
 * @returns 대시보드 랭킹 데이터
 */
export const getDashboardRankings = async (
  transactionType: 'sale' | 'jeonse' = 'sale',
  trendingDays: number = 7,
  trendMonths: number = 3
): Promise<DashboardRankingsResponse['data']> => {
  const cacheKey = '/dashboard/rankings';
  const params = {
    transaction_type: transactionType,
    trending_days: trendingDays,
    trend_months: trendMonths
  };
  
  console.log('🔍 [Dashboard API] getDashboardRankings 호출:', { transactionType, trendingDays, trendMonths, params });
  
  // 캐시에서 조회 시도
  const cached = getFromCache<DashboardRankingsResponse['data']>(cacheKey, params);
  if (cached) {
    // 빈 배열인지 확인 - 빈 배열이면 캐시 무효화하고 다시 API 호출
    const hasData = cached.trending.length > 0 || 
                    cached.rising.length > 0 || 
                    cached.falling.length > 0;
    
    if (hasData) {
      console.log('✅ [Dashboard API] 캐시에서 랭킹 데이터 조회 성공 (데이터 있음):', cached);
      return cached;
    } else {
      console.warn('⚠️ [Dashboard API] 캐시에 빈 랭킹 데이터가 저장되어 있음. 캐시 무효화하고 API 재호출');
      // 빈 데이터 캐시 삭제
      deleteFromCache(cacheKey, params);
    }
  }
  
  try {
    console.log('📡 [Dashboard API] 랭킹 API 호출 시작:', { url: cacheKey, params });
    const response = await apiClient.get<DashboardRankingsResponse>(cacheKey, { params });
    
    const hasData = (response.data?.data?.trending?.length || 0) > 0 || 
                    (response.data?.data?.rising?.length || 0) > 0 || 
                    (response.data?.data?.falling?.length || 0) > 0;
    
    console.log('📥 [Dashboard API] 랭킹 API 응답 받음:', {
      status: response.status,
      statusText: response.statusText,
      success: response.data?.success,
      hasData,
      trendingCount: response.data?.data?.trending?.length || 0,
      risingCount: response.data?.data?.rising?.length || 0,
      fallingCount: response.data?.data?.falling?.length || 0,
    });
    
    if (response.data && response.data.success) {
      const data = response.data.data;
      
      // 데이터가 없는 경우 빈 배열 반환 (성공으로 표시하지 않음)
      if (!hasData) {
        console.warn('⚠️ [Dashboard API] 랭킹 데이터가 없음 - 빈 배열 반환');
        return {
          trending: [],
          rising: [],
          falling: []
        };
      }
      
      console.log('✅ [Dashboard API] 랭킹 데이터 파싱 성공:', {
        trending: data.trending,
        rising: data.rising,
        falling: data.falling
      });
      
      // 데이터가 있는 경우에만 캐시에 저장
      console.log('💾 [Dashboard API] 랭킹 데이터가 있으므로 캐시에 저장');
      setToCache(cacheKey, data, params, 30 * 60 * 1000);
      
      return data;
    }
    
    console.error('❌ [Dashboard API] Invalid response format:', response.data);
    throw new Error('Invalid response format');
  } catch (error: any) {
    console.error('❌ [Dashboard API] 랭킹 API 호출 실패:', {
      error,
      message: error?.message,
      response: error?.response?.data,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      url: error?.config?.url,
      params: error?.config?.params,
    });
    // 에러 발생 시 빈 데이터 반환
    return {
      trending: [],
      rising: [],
      falling: []
    };
  }
};

/**
 * 지역별 상승률 히트맵 데이터 조회
 * @param transactionType 거래 유형 (sale: 매매, jeonse: 전세)
 * @param months 비교 기간 (개월, 기본값: 3)
 * @returns 지역별 상승률 히트맵 데이터
 */
export const getRegionalHeatmap = async (
  transactionType: 'sale' | 'jeonse' = 'sale',
  months: number = 3
): Promise<RegionalHeatmapItem[]> => {
  const cacheKey = '/dashboard/regional-heatmap';
  const params = {
    transaction_type: transactionType,
    months
  };
  
  console.log('🔍 [Dashboard API] getRegionalHeatmap 호출:', { transactionType, months, params });
  
  try {
    const response = await apiClient.get<RegionalHeatmapResponse>(cacheKey, { params });
    
    if (response.data && response.data.success) {
      const data = response.data.data;
      const hasData = (data?.length || 0) > 0;
      
      if (hasData) {
        console.log('✅ [Dashboard API] 히트맵 데이터 조회 성공:', data);
      } else {
        console.warn('⚠️ [Dashboard API] 히트맵 데이터가 없음 - 빈 배열 반환');
      }
      return hasData ? data : [];
    }
    
    throw new Error('Invalid response format');
  } catch (error: any) {
    console.error('❌ [Dashboard API] 히트맵 API 호출 실패:', error);
    return [];
  }
};

/**
 * 지역별 집값 변화 추이 데이터 조회
 * @param transactionType 거래 유형 (sale: 매매, jeonse: 전세)
 * @param months 조회 기간 (개월, 기본값: 12)
 * @returns 지역별 집값 변화 추이 데이터
 */
export const getRegionalTrends = async (
  transactionType: 'sale' | 'jeonse' = 'sale',
  months: number = 12
): Promise<RegionalTrendItem[]> => {
  const cacheKey = '/dashboard/regional-trends';
  const params = {
    transaction_type: transactionType,
    months
  };
  
  console.log('🔍 [Dashboard API] getRegionalTrends 호출:', { transactionType, months, params });
  
  try {
    const response = await apiClient.get<RegionalTrendsResponse>(cacheKey, { params });
    
    if (response.data && response.data.success) {
      const data = response.data.data;
      const meta = (response.data as any).meta;
      const hasData = (data?.length || 0) > 0;
      
      if (hasData) {
        console.log('✅ [Dashboard API] 지역별 추이 데이터 조회 성공:', data);
        if (meta) {
          console.log('📊 [Dashboard API] 데이터 메타 정보:', {
            요청기간: `${meta.requested_months}개월`,
            실제데이터기간: `${meta.actual_months}개월`,
            데이터시작일: meta.data_start_date,
            데이터종료일: meta.data_end_date,
            DB최소날짜: meta.db_min_date,
            DB최대날짜: meta.db_max_date
          });
          if (meta.actual_months < meta.requested_months) {
            console.warn(`⚠️ [Dashboard API] 요청한 ${meta.requested_months}개월보다 적은 ${meta.actual_months}개월 데이터만 존재합니다. (DB 최소 날짜: ${meta.db_min_date})`);
          }
        }
      } else {
        console.warn('⚠️ [Dashboard API] 지역별 추이 데이터가 없음 - 빈 배열 반환');
      }
      return hasData ? data : [];
    }
    
    throw new Error('Invalid response format');
  } catch (error: any) {
    console.error('❌ [Dashboard API] 지역별 추이 API 호출 실패:', error);
    return [];
  }
};

// 새로운 고급 차트 API 인터페이스
export interface PriceDistributionItem {
  price_range: string;
  count: number;
  avg_price: number;
}

export interface RegionalCorrelationItem {
  region: string;
  avg_price_per_pyeong: number;
  transaction_count: number;
  change_rate: number;
}

/**
 * 가격대별 아파트 분포 조회 (히스토그램용)
 */
export const getPriceDistribution = async (
  transactionType: 'sale' | 'jeonse' = 'sale'
): Promise<PriceDistributionItem[]> => {
  const cacheKey = '/dashboard/advanced-charts/price-distribution';
  const params = { transaction_type: transactionType };
  
  try {
    const response = await apiClient.get<{ success: boolean; data: PriceDistributionItem[] }>(cacheKey, { params });
    
    if (response.data && response.data.success) {
      return response.data.data || [];
    }
    return [];
  } catch (error: any) {
    console.error('❌ [Dashboard API] 가격 분포 API 호출 실패:', error);
    return [];
  }
};

/**
 * 지역별 가격 상관관계 조회 (버블 차트용)
 */
export const getRegionalPriceCorrelation = async (
  transactionType: 'sale' | 'jeonse' = 'sale',
  months: number = 3
): Promise<RegionalCorrelationItem[]> => {
  const cacheKey = '/dashboard/advanced-charts/regional-price-correlation';
  const params = { transaction_type: transactionType, months };
  
  try {
    const response = await apiClient.get<{ success: boolean; data: RegionalCorrelationItem[] }>(cacheKey, { params });
    
    if (response.data && response.data.success) {
      return response.data.data || [];
    }
    return [];
  } catch (error: any) {
    console.error('❌ [Dashboard API] 가격 상관관계 API 호출 실패:', error);
    return [];
  }
};

/**
 * 지역별 대시보드 랭킹 데이터 조회
 * @param transactionType 거래 유형 (sale: 매매, jeonse: 전세)
 * @param trendingDays 관심 많은 아파트 조회 기간 (일, 기본값: 7)
 * @param trendMonths 상승/하락률 계산 기간 (개월, 기본값: 3)
 * @param regionName 지역명 (시도 레벨, 예: "경기도", "서울특별시")
 * @returns 지역별 대시보드 랭킹 데이터
 */
export const getDashboardRankingsRegion = async (
  transactionType: 'sale' | 'jeonse' = 'sale',
  trendingDays: number = 7,
  trendMonths: number = 3,
  regionName?: string
): Promise<DashboardRankingsResponse['data']> => {
  const cacheKey = '/dashboard/rankings_region';
  const params: any = {
    transaction_type: transactionType,
    trending_days: trendingDays,
    trend_months: trendMonths
  };
  
  if (regionName) {
    params.region_name = regionName;
  }
  
  console.log('🔍 [Dashboard API] getDashboardRankingsRegion 호출:', { transactionType, trendingDays, trendMonths, regionName, params });
  
  try {
    const response = await apiClient.get<DashboardRankingsResponse>(cacheKey, { params });
    
    const hasData = (response.data?.data?.trending?.length || 0) > 0 || 
                    (response.data?.data?.rising?.length || 0) > 0 || 
                    (response.data?.data?.falling?.length || 0) > 0;
    
    console.log('📥 [Dashboard API] 지역별 랭킹 API 응답 받음:', {
      status: response.status,
      success: response.data?.success,
      hasData,
      trendingCount: response.data?.data?.trending?.length || 0,
      risingCount: response.data?.data?.rising?.length || 0,
      fallingCount: response.data?.data?.falling?.length || 0,
    });
    
    if (response.data && response.data.success) {
      const data = response.data.data;
      
      if (!hasData) {
        console.warn('⚠️ [Dashboard API] 지역별 랭킹 데이터가 없음 - 빈 배열 반환');
        return {
          trending: [],
          rising: [],
          falling: []
        };
      }
      
      return data;
    }
    
    throw new Error('Invalid response format');
  } catch (error: any) {
    console.error('❌ [Dashboard API] 지역별 랭킹 API 호출 실패:', error);
    return {
      trending: [],
      rising: [],
      falling: []
    };
  }
};
