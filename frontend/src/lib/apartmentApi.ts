import apiClient from './api';
import { getFromCache, setToCache } from './cache';

export interface ApartmentDetailData {
  apt_detail_id: number;
  apt_id: number;
  road_address: string;
  jibun_address: string;
  zip_code: string | null;
  code_sale_nm: string | null;
  code_heat_nm: string | null;
  total_household_cnt: number;
  total_building_cnt: number | null;
  highest_floor: number | null;
  use_approval_date: string | null;
  total_parking_cnt: number | null;
  builder_name: string | null;
  developer_name: string | null;
  manage_type: string | null;
  hallway_type: string | null;
  subway_time: string | null;
  subway_line: string | null;
  subway_station: string | null;
  educationFacility: string | null;
}

export interface TransactionData {
  trans_id: number;
  date: string | null;
  price: number;
  area: number;
  floor: number;
  price_per_sqm: number;
  price_per_pyeong: number;
  trans_type?: string;
  is_canceled?: boolean;
  monthly_rent?: number;
}

export interface PriceTrendData {
  month: string;
  avg_price_per_pyeong: number;
  avg_price: number;
  transaction_count: number;
}

export interface ApartmentTransactionsResponse {
  success: boolean;
  data: {
    apartment: {
      apt_id: number;
      apt_name: string;
    };
    recent_transactions: TransactionData[];
    price_trend: PriceTrendData[];
    change_summary: {
      previous_avg: number;
      recent_avg: number;
      change_rate: number;
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

/**
 * 아파트 상세 정보를 조회합니다.
 * @param aptId 아파트 ID
 */
export const getApartmentDetail = async (aptId: number): Promise<ApartmentDetailData | null> => {
  const cacheKey = `/apartments/${aptId}`;
  
  // 캐시에서 조회 시도
  const cached = getFromCache<ApartmentDetailData>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await apiClient.get<ApartmentDetailData>(cacheKey);
    const data = response.data;
    
    // 캐시에 저장 (TTL: 5분)
    setToCache(cacheKey, data, undefined, 5 * 60 * 1000);
    
    return data;
  } catch (error) {
    console.error('Failed to fetch apartment detail:', error);
    return null;
  }
};

/**
 * 아파트 실거래 내역을 조회합니다.
 * @param aptId 아파트 ID
 * @param transactionType 거래 유형 (sale: 매매, jeonse: 전세)
 * @param limit 최근 거래 내역 개수
 * @param months 가격 추이 조회 기간 (개월)
 * @param area 전용면적 필터 (선택)
 * @param areaTolerance 전용면적 허용 오차 (기본값: 5.0)
 */
export const getApartmentTransactions = async (
  aptId: number,
  transactionType: 'sale' | 'jeonse' = 'sale',
  limit: number = 10,
  months: number = 6,
  area?: number,
  areaTolerance: number = 5.0
): Promise<ApartmentTransactionsResponse['data'] | null> => {
  const cacheKey = `/apartments/${aptId}/transactions`;
  const params: any = {
    transaction_type: transactionType,
    limit,
    months,
    area_tolerance: areaTolerance
  };
  
  if (area !== undefined && area !== null) {
    params.area = area;
  }
  
  // 캐시에서 조회 시도
  const cached = getFromCache<ApartmentTransactionsResponse['data']>(cacheKey, params);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await apiClient.get<ApartmentTransactionsResponse>(cacheKey, { params });
    
    console.log('거래 데이터 API 응답:', response.data);
    
    if (response.data && response.data.success) {
      const data = response.data.data;
      console.log('거래 데이터 파싱 결과:', {
        recent_transactions_count: data?.recent_transactions?.length || 0,
        price_trend_count: data?.price_trend?.length || 0,
        has_change_summary: !!data?.change_summary,
        has_statistics: !!data?.statistics
      });
      
      // 캐시에 저장 (TTL: 3분)
      setToCache(cacheKey, data, params, 3 * 60 * 1000);
      
      return data;
    }
    console.warn('API 응답에 success가 false이거나 data가 없습니다:', response.data);
    return null;
  } catch (error: any) {
    console.error('Failed to fetch apartment transactions:', error);
    if (error.response) {
      console.error('API 응답 상태:', error.response.status);
      console.error('API 응답 데이터:', error.response.data);
    }
    return null;
  }
};
