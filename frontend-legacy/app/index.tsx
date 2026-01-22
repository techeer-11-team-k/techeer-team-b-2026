// 통합 홈 화면 - 플랫폼별 분기 처리
import { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StyleSheet, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import axios from 'axios'

// 플랫폼별 useAuth 가져오기
const getUseAuth = () => {
  if (Platform.OS === 'web') {
    return require('@clerk/clerk-react').useAuth
  }
  return require('@clerk/clerk-expo').useAuth
}

const useAuth = getUseAuth()

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
})

interface ApiResponse {
  [key: string]: unknown
}

export default function HomeScreen() {
  const { isSignedIn, getToken, userId } = useAuth()
  const router = useRouter()
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callApi = async (endpoint: string) => {
    setLoading(true)
    setError(null)
    setApiResponse(null)

    try {
      const token = await getToken()
      
      if (!token) {
        setError('토큰을 가져올 수 없습니다. 다시 로그인해주세요.')
        return
      }
      
      const response = await apiClient.get(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      setApiResponse(response.data)
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } }; message?: string }
      const errorDetail = axiosError.response?.data?.detail || axiosError.message || 'API 호출 실패'
      setError(typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail, null, 2))
      if (Platform.OS !== 'web') {
        Alert.alert('에러', errorDetail as string)
      }
    } finally {
      setLoading(false)
    }
  }

  if (!isSignedIn) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🏠 부동산 분석 플랫폼</Text>
        <Text style={styles.subtitle}>로그인이 필요합니다</Text>
        <View style={styles.authButtons}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={() => router.push('/sign-in')}
          >
            <Text style={styles.buttonText}>🔐 로그인하기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => router.push('/sign-up')}
          >
            <Text style={styles.buttonText}>📝 회원가입</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>
          계정이 없다면 회원가입 버튼을 눌러주세요
        </Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.content}>
        <Text style={styles.title}>🏠 부동산 분석 플랫폼</Text>
        <Text style={styles.subtitle}>Clerk 인증 테스트</Text>

        <View style={styles.userInfo}>
          <Text style={styles.userIdText}>User ID: {userId}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API 테스트</Text>
          
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={() => callApi('/api/v1/auth/me')}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>내 프로필 조회</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => callApi('/health')}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Health Check</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.successButton]}
              onPress={() => router.push('/db')}
            >
              <Text style={styles.buttonText}>🗄️ DB 조회</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.warningButton]}
              onPress={() => router.push('/profile')}
            >
              <Text style={styles.buttonText}>⚙️ 계정 설정</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>❌ 에러:</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {apiResponse && (
          <View style={styles.responseBox}>
            <Text style={styles.responseTitle}>✅ 응답:</Text>
            <Text style={styles.responseText}>
              {JSON.stringify(apiResponse, null, 2)}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  userInfo: {
    marginBottom: 24,
  },
  userIdText: {
    fontSize: 14,
    color: '#999',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  buttonGroup: {
    gap: 12,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
  },
  secondaryButton: {
    backgroundColor: '#6b7280',
  },
  successButton: {
    backgroundColor: '#10b981',
  },
  warningButton: {
    backgroundColor: '#f59e0b',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#991b1b',
    fontWeight: '600',
    marginBottom: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
  },
  responseBox: {
    backgroundColor: '#f0fdf4',
    padding: 16,
    borderRadius: 8,
  },
  responseTitle: {
    color: '#166534',
    fontWeight: '600',
    marginBottom: 8,
  },
  responseText: {
    color: '#16a34a',
    fontSize: 12,
  },
  authButtons: {
    gap: 12,
    width: '100%',
    maxWidth: 300,
  },
  hintText: {
    marginTop: 16,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
})
