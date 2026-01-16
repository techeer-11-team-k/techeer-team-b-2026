/**
 * API 클라이언트 설정
 * 
 * 백엔드 API와 통신하기 위한 axios 인스턴스를 제공합니다.
 */
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

// API 기본 URL
// 환경 변수에서 가져오거나, 현재 호스트 기반으로 동적 생성
// Android 에뮬레이터(10.0.2.2)나 실제 기기에서도 작동하도록 현재 호스트 사용
const getApiBaseUrl = (): string => {
  // 환경 변수가 명시적으로 설정되어 있으면 사용
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // 브라우저 환경에서 실행 중인 경우
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    
    // 현재 호스트가 localhost나 10.0.2.2인 경우, 같은 호스트의 8000 포트 사용
    // 포트가 3000이면 백엔드는 8000 포트
    if (currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost === '10.0.2.2') {
      return `http://${currentHost}:8000/api/v1`;
    }
    
    // 다른 호스트인 경우 (예: 실제 기기에서 로컬 IP 사용)
    // 같은 호스트의 8000 포트 사용
    return `http://${currentHost}:8000/api/v1`;
  }
  
  // 기본값 (SSR 환경 등)
  return 'http://localhost:8000/api/v1';
};

const API_BASE_URL = getApiBaseUrl();

/**
 * API 응답 타입
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
  status?: string;
}

/**
 * Axios 인스턴스 생성
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60초 타임아웃 (복잡한 쿼리 대응)
  validateStatus: (status) => status < 500, // 500 미만은 모두 정상으로 처리
});

/**
 * 요청 인터셉터: Clerk 토큰을 헤더에 추가
 */
apiClient.interceptors.request.use(
  async (config) => {
    // Clerk 토큰을 동적으로 가져오기 위해
    // useAuth 훅을 사용하는 컴포넌트에서 직접 헤더를 설정하거나,
    // 여기서 동적으로 가져올 수 있습니다.
    // 현재는 요청 시점에 토큰을 가져오는 것이 어려우므로,
    // 각 API 호출에서 직접 헤더를 설정하는 방식을 사용합니다.
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * 응답 인터셉터: 에러 처리
 */
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // 네트워크 오류 처리
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        console.error('요청 타임아웃:', error.config?.url);
      } else if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        console.error('네트워크 연결 실패:', {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          message: error.message,
          code: error.code
        });
      } else {
        console.error('네트워크 오류:', {
          message: error.message,
          code: error.code,
          url: error.config?.url
        });
      }
    } else {
      // HTTP 응답이 있는 경우
      console.error('API 오류:', {
        status: error.response.status,
        statusText: error.response.statusText,
        url: error.config?.url,
        data: error.response.data
      });
    }
    
    // 인증 오류 처리 (401)
    if (error.response?.status === 401) {
      console.warn('인증이 필요합니다.');
      // 필요시 로그인 페이지로 리다이렉트
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
