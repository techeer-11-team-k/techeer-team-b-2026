import axios from 'axios'
import { Platform } from 'react-native'

// API Base URL (환경변수에서 가져오기)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000'

// Axios 인스턴스 생성
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // 10초 타임아웃
  headers: {
    'Content-Type': 'application/json',
  },
})

// 요청 인터셉터: 토큰 자동 추가
apiClient.interceptors.request.use(
  async (config) => {
    // 웹에서는 @clerk/clerk-react, 네이티브에서는 @clerk/clerk-expo 사용
    let getToken: (() => Promise<string | null>) | null = null
    
    if (Platform.OS === 'web') {
      try {
        const { useAuth } = require('@clerk/clerk-react')
        // React Hook이므로 여기서는 직접 호출할 수 없음
        // 대신 config에 토큰을 추가하는 함수를 전달
      } catch (e) {
        // 클라이언트 사이드에서만 작동
      }
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 응답 인터셉터: 에러 처리
apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    // Network Error 처리
    if (error.message === 'Network Error' || !error.response) {
      console.error('Network Error:', error)
      throw new Error('서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인하세요.')
    }
    return Promise.reject(error)
  }
)

export default apiClient
