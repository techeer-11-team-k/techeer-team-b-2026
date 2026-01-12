import { Platform, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useState, useCallback } from 'react'

// 플랫폼별 Clerk 훅 가져오기
let useSignUp: any

if (Platform.OS === 'web') {
  // 웹에서는 SignUp 컴포넌트 사용
} else {
  const clerkExpo = require('@clerk/clerk-expo')
  useSignUp = clerkExpo.useSignUp
}

// 웹용 SignUp 컴포넌트
let SignUpComponent: any = null
if (Platform.OS === 'web') {
  const { SignUp } = require('@clerk/clerk-react')
  SignUpComponent = SignUp
}

export default function SignUpScreen() {
  // 웹에서는 @clerk/clerk-react의 SignUp 컴포넌트 사용
  if (Platform.OS === 'web' && SignUpComponent) {
    return (
      <View style={styles.container}>
        <View style={styles.signUpWrapper}>
          <SignUpComponent 
            routing="hash"
            appearance={{
              elements: {
                rootBox: {
                  width: '100%',
                  maxWidth: '400px',
                },
                card: {
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                },
              },
            }}
          />
        </View>
      </View>
    )
  }

  // 네이티브용 회원가입 화면
  return <NativeSignUp />
}

// 네이티브 전용 회원가입 컴포넌트
function NativeSignUp() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pendingVerification, setPendingVerification] = useState(false)
  const [code, setCode] = useState('')

  // 회원가입 훅
  const signUpHook = useSignUp ? useSignUp() : null
  const { signUp, setActive, isLoaded } = signUpHook || {}

  // 이메일/비밀번호 회원가입
  const handleEmailSignUp = useCallback(async () => {
    if (!isLoaded || !signUp) {
      setError('회원가입 기능을 로드할 수 없습니다.')
      return
    }

    if (!email) {
      setError('이메일을 입력해주세요.')
      return
    }

    if (!password) {
      setError('비밀번호를 입력해주세요.')
      return
    }

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await signUp.create({
        emailAddress: email,
        password,
      })

      // 이메일 인증 요청
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setPendingVerification(true)
    } catch (err: any) {
      console.error('회원가입 오류:', err)
      if (err.errors) {
        const errorMessage = err.errors.map((e: any) => e.message).join('\n')
        setError(errorMessage)
      } else {
        setError(err.message || '회원가입 중 오류가 발생했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [email, password, confirmPassword, signUp, isLoaded])

  // 이메일 인증 코드 확인
  const handleVerifyCode = useCallback(async () => {
    if (!signUp || !code) {
      setError('인증 코드를 입력해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code,
      })

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.replace('/')
      } else {
        console.log('회원가입 결과:', result)
        setError('추가 단계가 필요합니다.')
      }
    } catch (err: any) {
      console.error('인증 코드 확인 오류:', err)
      if (err.errors) {
        const errorMessage = err.errors.map((e: any) => e.message).join('\n')
        setError(errorMessage)
      } else {
        setError(err.message || '인증 코드 확인 중 오류가 발생했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [code, signUp, setActive, router])

  // 인증 코드 재전송
  const handleResendCode = useCallback(async () => {
    if (!signUp) return

    setLoading(true)
    setError(null)

    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setError(null)
    } catch (err: any) {
      console.error('코드 재전송 오류:', err)
      setError('코드 재전송에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [signUp])

  // 인증 코드 입력 화면
  if (pendingVerification) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>📧 이메일 인증</Text>
          <Text style={styles.subtitle}>{email}로 전송된 코드를 입력하세요</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="인증 코드 (6자리)"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoCapitalize="none"
            maxLength={6}
          />

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={handleVerifyCode}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>확인</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleResendCode}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>코드 재전송</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setPendingVerification(false)
              setCode('')
            }}
          >
            <Text style={styles.backButtonText}>← 다시 입력</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>🏠 부동산 분석 플랫폼</Text>
          <Text style={styles.subtitle}>회원가입</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="이메일"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            
            <TextInput
              style={styles.input}
              placeholder="비밀번호 (8자 이상)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />

            <TextInput
              style={styles.input}
              placeholder="비밀번호 확인"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              onPress={handleEmailSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>회원가입</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>또는</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.push('/sign-in')}
            >
              <Text style={styles.linkButtonText}>이미 계정이 있으신가요? 로그인</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← 뒤로가기</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  signUpWrapper: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  form: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f3f4f6',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginTop: 8,
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#d1d5db',
  },
  dividerText: {
    color: '#6b7280',
    paddingHorizontal: 12,
    fontSize: 14,
  },
  linkButton: {
    alignItems: 'center',
    padding: 8,
  },
  linkButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '500',
  },
  backButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#3b82f6',
    fontSize: 14,
  },
})
