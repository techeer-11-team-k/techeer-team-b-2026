import { useState } from 'react'
import { useAuth, SignIn, SignUp, UserButton } from '@clerk/clerk-react'
import axios from 'axios'
import './App.css'

// ⚠️ 보안: API URL은 환경변수에서만 가져옵니다.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

if (!API_BASE_URL) {
  throw new Error(
    'VITE_API_BASE_URL이 설정되지 않았습니다.\n' +
    '프로젝트 루트의 .env 파일에 VITE_API_BASE_URL을 추가하세요.\n' +
    '예: VITE_API_BASE_URL=http://localhost:8000'
  )
}

function App() {
  const { isSignedIn, getToken, userId } = useAuth()
  const [apiResponse, setApiResponse] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callApi = async (endpoint: string) => {
    setLoading(true)
    setError(null)
    setApiResponse(null)

    try {
      // Clerk에서 JWT 토큰 가져오기
      // 템플릿을 지정하지 않으면 Clerk가 기본 JWT를 반환합니다
      const token = await getToken()
      
      if (!token) {
        setError('토큰을 가져올 수 없습니다. 다시 로그인해주세요.')
        return
      }
      
      console.log('Token received:', token.substring(0, 50) + '...') // 디버깅용
      
      const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      setApiResponse(response.data)
    } catch (err: any) {
      console.error('API Error:', err) // 디버깅용
      const errorDetail = err.response?.data?.detail || err.message || 'API 호출 실패'
      setError(typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail, null, 2))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-container">
      <div className="card">
        <h1>🏠 부동산 분석 플랫폼</h1>
        <p className="subtitle">Clerk 인증 테스트</p>

        {!isSignedIn ? (
          <div className="auth-section">
            <div className="auth-tabs">
              <SignIn
                routing="hash"
                appearance={{
                  elements: {
                    rootBox: 'sign-in-root',
                    card: 'sign-in-card',
                  },
                }}
              />
            </div>
          </div>
        ) : (
          <div className="content-section">
            <div className="user-info">
              <UserButton afterSignOutUrl="/" />
              <p className="user-id">User ID: {userId}</p>
            </div>

            <div className="api-test-section">
              <h2>API 테스트</h2>
              <div className="button-group">
                <button
                  onClick={() => callApi('/api/v1/auth/me')}
                  disabled={loading}
                  className="test-button"
                >
                  {loading ? '로딩 중...' : '내 프로필 조회'}
                </button>
                <button
                  onClick={() => callApi('/health')}
                  disabled={loading}
                  className="test-button secondary"
                >
                  {loading ? '로딩 중...' : 'Health Check'}
                </button>
                <a href="#db" className="test-button db-link">
                  🗄️ DB 조회
                </a>
              </div>

              {error && (
                <div className="error-box">
                  <strong>❌ 에러:</strong>
                  <pre>{JSON.stringify(error, null, 2)}</pre>
                </div>
              )}

              {apiResponse && (
                <div className="response-box">
                  <strong>✅ 응답:</strong>
                  <pre>{JSON.stringify(apiResponse, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
