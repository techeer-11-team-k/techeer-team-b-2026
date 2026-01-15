import apiClient from './api';

/**
 * 최근 본 아파트 관련 API
 */

export interface RecentViewApartment {
  apt_id: number;
  apt_name: string;
  kapt_code: string | null;
  region_name: string | null;
  city_name: string | null;
}

export interface RecentView {
  view_id: number;
  apt_id: number;
  viewed_at: string | null;
  apartment: RecentViewApartment | null;
}

export interface RecentViewsResponse {
  success: boolean;
  data: {
    recent_views: RecentView[];
    total: number;
  };
}

export interface CreateRecentViewRequest {
  apt_id: number;
}

export interface CreateRecentViewResponse {
  success: boolean;
  data: {
    view_id: number;
    apt_id: number;
    viewed_at: string | null;
  };
}

/**
 * 최근 본 아파트 목록 조회
 * 
 * @param limit 최대 개수 (기본 20개, 최대 50개)
 * @param token Clerk 인증 토큰 (선택)
 * @returns 최근 본 아파트 목록
 */
export async function getRecentViews(
  limit: number = 20,
  token: string | null = null
): Promise<RecentViewsResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await apiClient.get<RecentViewsResponse>(
    `/users/me/recent-views`,
    {
      params: { limit },
      headers,
    }
  );

  return response.data;
}

/**
 * 최근 본 아파트 기록 저장
 * 
 * 아파트 상세 페이지를 방문했을 때 호출하여 조회 기록을 저장합니다.
 * 같은 아파트를 이미 본 기록이 있으면 기존 레코드의 조회 시간만 업데이트됩니다.
 * 
 * @param aptId 아파트 ID
 * @param token Clerk 인증 토큰 (필수)
 * @returns 저장된 조회 기록
 */
export async function createRecentView(
  aptId: number,
  token: string
): Promise<CreateRecentViewResponse> {
  const response = await apiClient.post<CreateRecentViewResponse>(
    `/users/me/recent-views`,
    { apt_id: aptId },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.data;
}
