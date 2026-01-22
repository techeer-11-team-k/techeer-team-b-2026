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

/**
 * 최근 본 아파트 기록 삭제
 * 
 * @param viewId 삭제할 기록 ID
 * @param token Clerk 인증 토큰 (필수)
 * @returns 삭제 성공 여부
 */
export async function deleteRecentView(
  viewId: number,
  token: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete<{ success: boolean; message: string }>(
    `/users/me/recent-views/${viewId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.data;
}

/**
 * 최근 본 아파트 전체 삭제
 * 
 * @param token Clerk 인증 토큰 (필수)
 * @returns 삭제 성공 여부 및 삭제된 개수
 */
export async function deleteAllRecentViews(
  token: string
): Promise<{ success: boolean; message: string; deleted_count: number }> {
  const response = await apiClient.delete<{ success: boolean; message: string; deleted_count: number }>(
    `/users/me/recent-views`,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.data;
}

/**
 * 다크모드 설정 관련 API
 */

export interface DarkModeResponse {
  success: boolean;
  data: {
    is_dark_mode: boolean;
  };
}

/**
 * 다크모드 설정 조회
 * 
 * @param token Clerk 인증 토큰
 * @returns 다크모드 설정
 */
export async function getDarkModeSetting(
  token: string
): Promise<DarkModeResponse> {
  const response = await apiClient.get<DarkModeResponse>(
    `/users/me/settings/dark-mode`,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.data;
}

/**
 * 다크모드 설정 변경
 * 
 * @param isDarkMode 다크모드 활성화 여부
 * @param token Clerk 인증 토큰
 * @returns 변경된 다크모드 설정
 */
export async function updateDarkModeSetting(
  isDarkMode: boolean,
  token: string
): Promise<DarkModeResponse> {
  const response = await apiClient.patch<DarkModeResponse>(
    `/users/me/settings/dark-mode`,
    { is_dark_mode: isDarkMode },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.data;
}