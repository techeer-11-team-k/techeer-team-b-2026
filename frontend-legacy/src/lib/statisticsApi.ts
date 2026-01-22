/**
 * 통계 API 클라이언트
 * 
 * RVOL 및 4분면 분류 통계 데이터를 조회합니다.
 */
import apiClient from './api';

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

export interface HPIDataPoint {
  date: string;
  index_value: number;
  index_change_rate: number | null;
  region_name: string | null;
  index_type: string;
}

export interface HPIResponse {
  success: boolean;
  data: HPIDataPoint[];
  region_id: number | null;
  index_type: string;
  period: string;
}

export interface HPIHeatmapDataPoint {
  city_name: string;
  index_value: number;
  index_change_rate: number | null;
  base_ym: string;
  region_count: number;
}

export interface HPIHeatmapResponse {
  success: boolean;
  data: HPIHeatmapDataPoint[];
  index_type: string;
  base_ym: string;
}

export interface StatisticsSummaryResponse {
  success: boolean;
  rvol: RVOLResponse;
  quadrant: QuadrantResponse;
}

export interface PopulationMovementDataPoint {
  date: string;
  region_id: number;
  region_name: string;
  in_migration: number;
  out_migration: number;
  net_migration: number;
}

export interface PopulationMovementResponse {
  success: boolean;
  data: PopulationMovementDataPoint[];
  period: string;
}

export interface PopulationMovementSankeyDataPoint {
  from_region: string;
  to_region: string;
  value: number;
}

export interface PopulationMovementSankeyResponse {
  success: boolean;
  data: PopulationMovementSankeyDataPoint[];
  period: string;
}

export interface CorrelationAnalysisResponse {
  success: boolean;
  correlation_coefficient: number;
  r_squared: number;
  regression_equation: string;
  p_value: number;
  data_points: Array<{ price_change_rate: number; net_migration: number }>;
  interpretation: string;
}

/**
 * RVOL 데이터 조회
 */
export async function getRVOL(
  transactionType: 'sale' | 'rent' = 'sale',
  currentPeriodMonths: number = 2,
  averagePeriodMonths: number = 2,
  token?: string | null
): Promise<RVOLResponse> {
  const response = await apiClient.get<RVOLResponse>('/statistics/rvol', {
    params: {
      transaction_type: transactionType,
      current_period_months: currentPeriodMonths,
      average_period_months: averagePeriodMonths,
    },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return response.data;
}

/**
 * 4분면 분류 데이터 조회
 */
export async function getQuadrant(
  periodMonths: number = 2,
  token?: string | null
): Promise<QuadrantResponse> {
  const response = await apiClient.get<QuadrantResponse>('/statistics/quadrant', {
    params: {
      period_months: periodMonths,
    },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return response.data;
}

/**
 * 주택가격지수(HPI) 데이터 조회
 */
export async function getHPI(
  regionId?: number | null,
  indexType: 'APT' | 'HOUSE' | 'ALL' = 'APT',
  months: number = 24,
  token?: string | null
): Promise<HPIResponse> {
  const params: any = {
    index_type: indexType,
    months: months,
  };
  if (regionId !== null && regionId !== undefined) {
    params.region_id = regionId;
  }
  
  const response = await apiClient.get<HPIResponse>('/statistics/hpi', {
    params,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return response.data;
}

/**
 * 주택가격지수(HPI) 히트맵 데이터 조회
 */
export async function getHPIHeatmap(
  indexType: 'APT' | 'HOUSE' | 'ALL' = 'APT',
  token?: string | null
): Promise<HPIHeatmapResponse> {
  const response = await apiClient.get<HPIHeatmapResponse>('/statistics/hpi/heatmap', {
    params: {
      index_type: indexType,
    },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return response.data;
}

/**
 * 통계 요약 데이터 조회
 */
export async function getStatisticsSummary(
  transactionType: 'sale' | 'rent' = 'sale',
  currentPeriodMonths: number = 6,
  averagePeriodMonths: number = 6,
  quadrantPeriodMonths: number = 2,
  token?: string | null
): Promise<StatisticsSummaryResponse> {
  const response = await apiClient.get<StatisticsSummaryResponse>('/statistics/summary', {
    params: {
      transaction_type: transactionType,
      current_period_months: currentPeriodMonths,
      average_period_months: averagePeriodMonths,
      quadrant_period_months: quadrantPeriodMonths,
    },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return response.data;
}


/**
 * 인구 이동 데이터 조회
 */
export async function getPopulationMovements(
  regionId?: number | null,
  startYm?: string | null,
  endYm?: string | null,
  token?: string | null
): Promise<PopulationMovementResponse> {
  const params: any = {};
  if (regionId !== null && regionId !== undefined) {
    params.region_id = regionId;
  }
  if (startYm) {
    params.start_ym = startYm;
  }
  if (endYm) {
    params.end_ym = endYm;
  }
  
  const response = await apiClient.get<PopulationMovementResponse>('/statistics/population-movements', {
    params,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return response.data;
}
