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
  getToken: () => Promise<string | null>,
  skip: number = 0,
  limit: number = 50
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
      params: {
        skip,
        limit,
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
  getToken: () => Promise<string | null>,
  skip: number = 0,
  limit: number = 50
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
      params: {
        skip,
        limit,
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
