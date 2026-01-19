import apiClient from './api';
import { getFromCache, setToCache, deleteFromCache, deleteCachePattern } from './cache';

export interface MyPropertyCreate {
  apt_id: number;
  nickname?: string;
  exclusive_area: number;
  current_market_price?: number;
  memo?: string;
}

export interface MyProperty {
  property_id: number;
  account_id: number;
  apt_id: number;
  nickname: string;
  exclusive_area: number;
  current_market_price: number | null;
  risk_checked_at: string | null;
  memo: string | null;
  created_at: string;
  apt_name: string | null;
  kapt_code: string | null;
  region_name: string | null;
  city_name: string | null;
  // 추가 정보 (상세 조회 시)
  road_address?: string | null;
  jibun_address?: string | null;
  use_approval_date?: string | null;
  total_household_cnt?: number | null;
  index_change_rate?: number | null;
  // 가장 흔한 전용면적의 평균 가격 정보
  most_common_exclusive_area?: number | null;
  most_common_area_avg_price?: number | null;
  // 모든 면적 그룹별 평균 가격 정보
  all_area_groups?: Array<{
    pyeong: number;
    exclusive_area_m2: number;
    avg_price: number;
    transaction_count: number;
  }> | null;
}

export interface MyPropertyCreateResponse {
  success: boolean;
  data: MyProperty;
}

/**
 * 내 집을 등록합니다
 * @param property 내 집 정보
 * @param token 인증 토큰
 */
export const createMyProperty = async (
  property: MyPropertyCreate,
  token: string
): Promise<MyProperty> => {
  try {
    const response = await apiClient.post<MyPropertyCreateResponse>(
      '/my-properties',
      property,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (response.data && response.data.success) {
      console.log('✅ [createMyProperty] 등록 성공, 캐시 무효화 시작');
      // 캐시 무효화 (내 집 목록 캐시 삭제)
      deleteFromCache('/my-properties');
      // 내집 제외 검색 캐시도 삭제 (새로 등록된 내집이 검색 결과에서 제외되도록)
      deleteCachePattern('my_property');
      console.log('✅ [createMyProperty] 캐시 무효화 완료');
      return response.data.data;
    }
    
    throw new Error('내 집 등록에 실패했습니다.');
  } catch (error: any) {
    console.error('Failed to create my property:', error);
    if (error.response) {
      const errorData = error.response.data;
      let message = '내 집 등록에 실패했습니다.';
      
      // 에러 메시지 추출 (백엔드 에러 형식에 따라)
      if (errorData?.detail) {
        if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        } else if (errorData.detail?.message) {
          message = errorData.detail.message;
        } else if (errorData.detail?.code) {
          // 중복 에러 코드 처리
          if (errorData.detail.code === 'ALREADY_EXISTS') {
            message = '이미 등록된 내 집입니다.';
          } else {
            message = `${errorData.detail.code}: ${errorData.detail.message || '알 수 없는 오류'}`;
          }
        } else {
          message = JSON.stringify(errorData.detail);
        }
      } else if (errorData?.error) {
        message = errorData.error;
      }
      
      console.error('Error details:', errorData);
      throw new Error(message);
    }
    throw error;
  }
};

/**
 * 내 집을 삭제합니다
 * @param propertyId 삭제할 내 집 ID
 * @param token 인증 토큰
 */
export const deleteMyProperty = async (
  propertyId: number,
  token: string
): Promise<void> => {
  try {
    console.log('🗑️ [deleteMyProperty] 삭제 요청 시작:', { propertyId });
    
    const response = await apiClient.delete<{ success: boolean; data: { message: string; property_id: number } }>(
      `/my-properties/${propertyId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('🗑️ [deleteMyProperty] 응답 받음:', { 
      status: response.status,
      data: response.data,
      success: response.data?.success 
    });
    
    // 응답 데이터 확인
    if (response.data) {
      // FastAPI 응답 형식: { success: true, data: {...} }
      if (response.data.success === true || response.data.success === undefined) {
        // 캐시 무효화 (내 집 목록 캐시 삭제)
        deleteFromCache('/my-properties');
        // 내집 제외 검색 캐시도 삭제 (삭제된 내집이 검색 결과에 다시 나타나도록)
        deleteCachePattern('my_property');
        console.log('✅ [deleteMyProperty] 삭제 성공 및 캐시 무효화 완료');
        return;
      }
    }
    
    // 응답이 있지만 success가 false인 경우
    console.warn('⚠️ [deleteMyProperty] 응답은 받았지만 success가 false:', response.data);
    throw new Error('내 집 삭제에 실패했습니다.');
  } catch (error: any) {
    console.error('❌ [deleteMyProperty] 삭제 실패:', error);
    
    if (error.response) {
      const errorData = error.response.data;
      const status = error.response.status;
      
      console.error('❌ [deleteMyProperty] 에러 상세:', {
        status,
        statusText: error.response.statusText,
        data: errorData,
        url: error.config?.url
      });
      
      let message = '내 집 삭제에 실패했습니다.';
      
      if (errorData?.detail) {
        if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        } else if (errorData.detail?.message) {
          message = errorData.detail.message;
        } else if (errorData.detail?.code) {
          message = `${errorData.detail.code}: ${errorData.detail.message || '알 수 없는 오류'}`;
        } else {
          message = JSON.stringify(errorData.detail);
        }
      } else if (errorData?.error) {
        message = errorData.error;
      } else if (status === 404) {
        message = '삭제할 내 집을 찾을 수 없습니다.';
      } else if (status === 401) {
        message = '로그인이 필요합니다.';
      } else if (status === 403) {
        message = '삭제 권한이 없습니다.';
      }
      
      throw new Error(message);
    } else if (error.request) {
      // 요청은 보냈지만 응답을 받지 못한 경우
      console.error('❌ [deleteMyProperty] 네트워크 오류 - 응답 없음:', error.message);
      throw new Error('서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.');
    } else {
      // 요청 설정 중 오류 발생
      console.error('❌ [deleteMyProperty] 요청 설정 오류:', error.message);
      throw error;
    }
  }
};

/**
 * 내 집 정보를 수정합니다
 * @param propertyId 수정할 내 집 ID
 * @param updateData 수정할 정보
 * @param token 인증 토큰
 */
export const updateMyProperty = async (
  propertyId: number,
  updateData: { memo?: string; nickname?: string; exclusive_area?: number; current_market_price?: number },
  token: string
): Promise<MyProperty> => {
  try {
    const response = await apiClient.patch<{ success: boolean; data: MyProperty }>(
      `/my-properties/${propertyId}`,
      updateData,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (response.data && response.data.success) {
      // 캐시 무효화
      deleteFromCache('/my-properties');
      // 내집 제외 검색 캐시도 삭제
      deleteCachePattern('my_property');
      return response.data.data;
    }
    
    throw new Error('내 집 정보 수정에 실패했습니다.');
  } catch (error: any) {
    console.error('Failed to update my property:', error);
    if (error.response) {
      const errorData = error.response.data;
      let message = '내 집 정보 수정에 실패했습니다.';
      
      if (errorData?.detail) {
        if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        } else if (errorData.detail?.message) {
          message = errorData.detail.message;
        } else if (errorData.detail?.code) {
          message = `${errorData.detail.code}: ${errorData.detail.message || '알 수 없는 오류'}`;
        }
      } else if (errorData?.error) {
        message = errorData.error;
      }
      
      throw new Error(message);
    }
    throw error;
  }
};

/**
 * 내 집 상세 정보를 조회합니다
 * @param propertyId 내 집 ID
 * @param token 인증 토큰
 */
export const getMyProperty = async (
  propertyId: number,
  token: string
): Promise<MyProperty> => {
  try {
    const response = await apiClient.get<{ success: boolean; data: MyProperty }>(
      `/my-properties/${propertyId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (response.data && response.data.success) {
      return response.data.data;
    }
    
    throw new Error('내 집 상세 정보 조회에 실패했습니다.');
  } catch (error: any) {
    console.error('Failed to fetch my property:', error);
    if (error.response) {
      const errorData = error.response.data;
      let message = '내 집 상세 정보 조회에 실패했습니다.';
      
      if (errorData?.detail) {
        if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        } else if (errorData.detail?.message) {
          message = errorData.detail.message;
        } else if (errorData.detail?.code) {
          message = `${errorData.detail.code}: ${errorData.detail.message || '알 수 없는 오류'}`;
        }
      } else if (errorData?.error) {
        message = errorData.error;
      }
      
      throw new Error(message);
    }
    throw error;
  }
};

/**
 * 내 집 칭찬글 생성/조회합니다
 * @param propertyId 내 집 ID
 * @param token 인증 토큰
 */
export const getMyPropertyCompliment = async (
  propertyId: number,
  token: string
): Promise<{ property_id: number; compliment: string; generated_at: string }> => {
  try {
    const response = await apiClient.post<{ 
      success: boolean; 
      data: { 
        property_id: number; 
        compliment: string; 
        generated_at: string 
      } 
    }>(
      `/ai/summary/my-property?property_id=${propertyId}`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (response.data && response.data.success) {
      return response.data.data;
    }
    
    throw new Error('내 집 칭찬글 조회에 실패했습니다.');
  } catch (error: any) {
    console.error('Failed to fetch my property compliment:', error);
    if (error.response) {
      const statusCode = error.response.status;
      const errorData = error.response.data;
      let message = '내 집 칭찬글 조회에 실패했습니다.';
      
      // 503 또는 429 에러인 경우 (Gemini API 할당량 초과)
      if (statusCode === 503 || statusCode === 429) {
        // 에러 메시지에서 할당량 초과 정보 추출
        const errorMessage = typeof errorData?.detail === 'string' 
          ? errorData.detail 
          : typeof errorData?.message === 'string'
          ? errorData.message
          : JSON.stringify(errorData || {});
        
        if (typeof errorMessage === 'string' && (
          errorMessage.includes('quota') || 
          errorMessage.includes('429') || 
          errorMessage.includes('RESOURCE_EXHAUSTED')
        )) {
          message = 'AI 서비스 할당량이 일시적으로 초과되었습니다. 잠시 후 다시 시도해주세요.';
        } else {
          message = 'AI 서비스가 일시적으로 사용 불가능합니다. 잠시 후 다시 시도해주세요.';
        }
      } else if (errorData?.detail) {
        if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        } else if (errorData.detail?.message) {
          message = errorData.detail.message;
        } else if (errorData.detail?.code) {
          message = `${errorData.detail.code}: ${errorData.detail.message || '알 수 없는 오류'}`;
        }
      } else if (errorData?.error) {
        message = errorData.error;
      }
      
      throw new Error(message);
    }
    throw error;
  }
};

/**
 * 내 집 목록을 조회합니다
 * @param token 인증 토큰
 * @param skipCache 캐시를 무시하고 서버에서 직접 가져올지 여부 (기본값: false)
 */
export const getMyProperties = async (token: string, skipCache: boolean = false): Promise<MyProperty[]> => {
  const cacheKey = '/my-properties';
  
  // 캐시를 무시하지 않으면 캐시에서 조회 시도
  if (!skipCache) {
    const cached = getFromCache<MyProperty[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }
  
  try {
    const response = await apiClient.get<{ 
      success: boolean; 
      data: { 
        properties: MyProperty[]; 
        total: number; 
        limit: number 
      } 
    }>(
      cacheKey,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (response.data && response.data.success) {
      const properties = response.data.data.properties || [];
      
      // 캐시에 저장 (TTL: 5분)
      setToCache(cacheKey, properties, undefined, 5 * 60 * 1000);
      
      return properties;
    }
    
    return [];
  } catch (error) {
    console.error('Failed to fetch my properties:', error);
    return [];
  }
};
