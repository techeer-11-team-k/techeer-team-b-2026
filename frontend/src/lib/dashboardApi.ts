import apiClient from './api';
import { getFromCache, setToCache } from './cache';

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
  
  // 캐시에서 조회 시도
  const cached = getFromCache<DashboardSummaryResponse['data']>(cacheKey, params);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await apiClient.get<DashboardSummaryResponse>(cacheKey, { params });
    
    if (response.data && response.data.success) {
      const data = response.data.data;
      
      // 캐시에 저장 (TTL: 30분) - 백엔드 캐시와 동기화
      setToCache(cacheKey, data, params, 30 * 60 * 1000);
      
      return data;
    }
    throw new Error('Invalid response format');
  } catch (error) {
    console.error('Failed to fetch dashboard summary:', error);
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
  
  // 캐시에서 조회 시도
  const cached = getFromCache<DashboardRankingsResponse['data']>(cacheKey, params);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await apiClient.get<DashboardRankingsResponse>(cacheKey, { params });
    
    if (response.data && response.data.success) {
      const data = response.data.data;
      
      // 캐시에 저장 (TTL: 30분) - 백엔드 캐시와 동기화
      setToCache(cacheKey, data, params, 30 * 60 * 1000);
      
      return data;
    }
    throw new Error('Invalid response format');
  } catch (error) {
    console.error('Failed to fetch dashboard rankings:', error);
    // 에러 발생 시 빈 데이터 반환
    return {
      trending: [],
      rising: [],
      falling: []
    };
  }
};
