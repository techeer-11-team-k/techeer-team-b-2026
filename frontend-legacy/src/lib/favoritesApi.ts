import apiClient from './api';

export interface FavoriteApartment {
  favorite_id: number;
  apt_id: number;
  account_id: number;
  nickname?: string;
  memo?: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  // 백엔드 응답 구조에 맞춤 (nested object가 아닌 직접 필드)
  apt_name?: string;
  kapt_code?: string;
  region_name?: string;
  city_name?: string;
  // 하위 호환성을 위한 apartment 객체 (옵셔널)
  apartment?: {
    apt_id: number;
    apt_name: string;
    address?: string;
  };
}

export interface FavoriteLocation {
  favorite_id: number;
  region_id: number;
  account_id: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  // 백엔드 응답 구조에 맞춤 (nested object가 아닌 직접 필드)
  region_name?: string;
  city_name?: string;
  // 하위 호환성을 위한 location 객체 (옵셔널)
  location?: {
    region_id: number;
    region_name: string;
    city_name: string;
  };
}

export interface FavoriteApartmentsResponse {
  success: boolean;
  data: {
    favorites: FavoriteApartment[];
    total: number;
  };
}

export interface FavoriteLocationsResponse {
  success: boolean;
  data: {
    favorites: FavoriteLocation[];
    total: number;
  };
}

/**
 * 즐겨찾기 아파트 목록 조회
 */
export const getFavoriteApartments = async (
  getToken: () => Promise<string | null>
): Promise<FavoriteApartmentsResponse['data'] | null> => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('로그인이 필요합니다.');
    }

    const response = await apiClient.get<FavoriteApartmentsResponse>('/favorites/apartments', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.data && response.data.success) {
      return response.data.data;
    }
    return null;
  } catch (error: any) {
    console.error('Failed to fetch favorite apartments:', error);
    throw error;
  }
};

/**
 * 즐겨찾기 아파트 추가
 */
export const addFavoriteApartment = async (
  getToken: () => Promise<string | null>,
  aptId: number,
  nickname?: string,
  memo?: string
): Promise<void> => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('로그인이 필요합니다.');
    }

    await apiClient.post(
      '/favorites/apartments',
      {
        apt_id: aptId,
        nickname,
        memo,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (error: any) {
    console.error('Failed to add favorite apartment:', error);
    if (error.response?.status === 409) {
      throw new Error('이미 추가된 아파트입니다.');
    }
    if (error.response?.status === 400) {
      throw new Error('즐겨찾기 아파트는 최대 100개까지 추가할 수 있습니다.');
    }
    throw error;
  }
};

/**
 * 즐겨찾기 아파트 삭제
 */
export const deleteFavoriteApartment = async (
  getToken: () => Promise<string | null>,
  aptId: number
): Promise<void> => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('로그인이 필요합니다.');
    }

    await apiClient.delete(`/favorites/apartments/${aptId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error: any) {
    console.error('Failed to delete favorite apartment:', error);
    throw error;
  }
};

/**
 * 즐겨찾기 지역 목록 조회
 */
export const getFavoriteLocations = async (
  getToken: () => Promise<string | null>
): Promise<FavoriteLocationsResponse['data'] | null> => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('로그인이 필요합니다.');
    }

    const response = await apiClient.get<FavoriteLocationsResponse>('/favorites/locations', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.data && response.data.success) {
      return response.data.data;
    }
    return null;
  } catch (error: any) {
    console.error('Failed to fetch favorite locations:', error);
    throw error;
  }
};

/**
 * 즐겨찾기 지역 추가
 */
export const addFavoriteLocation = async (
  getToken: () => Promise<string | null>,
  regionId: number
): Promise<void> => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('로그인이 필요합니다.');
    }

    await apiClient.post(
      '/favorites/locations',
      {
        region_id: regionId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (error: any) {
    console.error('Failed to add favorite location:', error);
    if (error.response?.status === 409) {
      throw new Error('이미 추가된 지역입니다.');
    }
    if (error.response?.status === 400) {
      throw new Error('즐겨찾기 지역은 최대 50개까지 추가할 수 있습니다.');
    }
    throw error;
  }
};

/**
 * 지역별 통계 정보를 조회합니다.
 * @param regionId 지역 ID
 * @param transactionType 거래 유형 (sale: 매매, jeonse: 전세)
 * @param months 비교 기간 (개월, 기본값: 3)
 * @returns 지역 통계 정보
 */
export interface RegionStats {
  region_id: number;
  region_name: string;
  city_name: string;
  avg_price_per_pyeong: number; // 만원/평
  change_rate: number; // %
  transaction_count: number; // 건
  apartment_count: number; // 개
  previous_avg_price: number; // 만원/평
  transaction_type: string;
  period_months: number;
}

export interface RegionStatsResponse {
  success: boolean;
  data: RegionStats;
}

export const getRegionStats = async (
  regionId: number,
  transactionType: string = 'sale',
  months: number = 3
): Promise<RegionStats | null> => {
  try {
    console.log(`[getRegionStats] 요청 시작 - regionId: ${regionId}, transactionType: ${transactionType}, months: ${months}`);
    const response = await apiClient.get<RegionStatsResponse>(
      `/favorites/regions/${regionId}/stats`,
      {
        params: {
          transaction_type: transactionType,
          months: months,
        },
      }
    );
    
    console.log(`[getRegionStats] 응답 받음 - success: ${response.data?.success}`, response.data);
    
    if (response.data && response.data.success) {
      console.log(`[getRegionStats] 데이터 반환 -`, response.data.data);
      return response.data.data;
    }
    console.warn(`[getRegionStats] success가 false이거나 data가 없음`);
    return null;
  } catch (error: any) {
    console.error('[getRegionStats] 에러 발생:', error);
    if (error.response) {
      console.error('[getRegionStats] 응답 상태:', error.response.status);
      console.error('[getRegionStats] 응답 데이터:', error.response.data);
    }
    return null;
  }
};

/**
 * 즐겨찾기 지역 삭제
 */
export const deleteFavoriteLocation = async (
  getToken: () => Promise<string | null>,
  regionId: number
): Promise<void> => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('로그인이 필요합니다.');
    }

    await apiClient.delete(`/favorites/locations/${regionId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error: any) {
    console.error('Failed to delete favorite location:', error);
    throw error;
  }
};
