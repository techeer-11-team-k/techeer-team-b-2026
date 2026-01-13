import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StyleSheet, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import axios from 'axios'

// 플랫폼별로 다른 useAuth/useUser 사용
let useAuth: any
let useUser: any
if (Platform.OS === 'web') {
  const clerkReact = require('@clerk/clerk-react')
  useAuth = clerkReact.useAuth
  useUser = clerkReact.useUser
} else {
  const clerkExpo = require('@clerk/clerk-expo')
  useAuth = clerkExpo.useAuth
  useUser = clerkExpo.useUser
}

// API Base URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
})

interface UserProfile {
  account_id: number
  clerk_user_id: string
  email: string
  created_at: string
}

export default function ProfileScreen() {
  const { isSignedIn, getToken } = useAuth()
  const { user } = useUser()
  const router = useRouter()
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 프로필 조회
  const fetchProfile = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const token = await getToken()
      if (!token) {
        setError('토큰을 가져올 수 없습니다.')
        return
      }
      
      const response = await apiClient.get('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      
      const userData = response.data.data || response.data
      setProfile(userData)
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail || err.message || '프로필 조회 실패'
      setError(typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail, null, 2))
    } finally {
      setLoading(false)
    }
  }

  // 프로필 수정
  const updateProfile = async () => {
    setSaving(true)
    setError(null)
    
    try {
      const token = await getToken()
      if (!token) {
        setError('토큰을 가져올 수 없습니다.')
        return
      }
      
      const response = await apiClient.patch('/api/v1/auth/me', {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      
      const userData = response.data.data || response.data
      setProfile(userData)
      Alert.alert('성공', '프로필이 수정되었습니다.')
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail || err.message || '프로필 수정 실패'
      const errorMsg = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail, null, 2)
      setError(errorMsg)
      Alert.alert('에러', errorMsg)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (isSignedIn) {
      fetchProfile()
    }
  }, [isSignedIn])

  if (!isSignedIn) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>⚙️ 계정 설정</Text>
        <Text style={styles.subtitle}>로그인이 필요합니다</Text>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push('/sign-in')}
        >
          <Text style={styles.buttonText}>🔐 로그인하기</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>프로필 불러오는 중...</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.content}>
        <Text style={styles.title}>⚙️ 계정 설정</Text>
        <Text style={styles.subtitle}>프로필 정보를 수정하세요</Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>❌ 에러:</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {profile && (
          <View style={styles.profileCard}>
            <Text style={styles.profileLabel}>Clerk User ID</Text>
            <Text style={styles.profileValue}>{profile.clerk_user_id}</Text>
            
            <Text style={styles.profileLabel}>이메일</Text>
            <Text style={styles.profileValue}>{profile.email}</Text>
            
            <Text style={styles.profileLabel}>가입일</Text>
            <Text style={styles.profileValue}>
              {new Date(profile.created_at).toLocaleDateString('ko-KR')}
            </Text>
          </View>
        )}

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={fetchProfile}
          >
            <Text style={styles.buttonText}>🔄 새로고침</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.outlineButton]}
            onPress={() => router.push('/')}
          >
            <Text style={styles.outlineButtonText}>← 홈으로</Text>
          </TouchableOpacity>
        </View>
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
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  profileCard: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  profileLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  profileValue: {
    fontSize: 16,
    color: '#111827',
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  buttonGroup: {
    gap: 12,
    marginTop: 16,
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
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  outlineButtonText: {
    color: '#374151',
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
})
