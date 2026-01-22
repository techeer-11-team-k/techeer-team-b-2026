import { Platform, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useState, useCallback } from 'react'

// 플랫폼별 Clerk 훅 가져오기
let useAuth: any
let useOAuth: any
let useSignIn: any

if (Platform.OS === 'web') {
  const clerkReact = require('@clerk/clerk-react')
  useAuth = clerkReact.useAuth
  useSignIn = clerkReact.useSignIn
} else {
  const clerkExpo = require('@clerk/clerk-expo')
  useAuth = clerkExpo.useAuth
  useOAuth = clerkExpo.useOAuth
  useSignIn = clerkExpo.useSignIn
}

export default function SignInScreen() {
  // 웹과 네이티브 모두 동일한 커스텀 폼 사용
  return <CustomSignIn />
}

// 커스텀 로그인 컴포넌트 (웹/네이티브 통합)
function CustomSignIn() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pendingVerification, setPendingVerification] = useState(false)
  const [code, setCode] = useState('')

  // OAuth 프로바이더 설정 (네이티브만)
  const googleOAuth = Platform.OS !== 'web' && useOAuth ? useOAuth({ strategy: 'oauth_google' }) : null
  const appleOAuth = Platform.OS !== 'web' && useOAuth ? useOAuth({ strategy: 'oauth_apple' }) : null
  
  // 이메일 로그인용
  const signInHook = useSignIn ? useSignIn() : null
  const { signIn, setActive, isLoaded } = signInHook || {}

  const handleOAuthSignIn = useCallback(async (provider: 'google' | 'apple') => {
    if (Platform.OS === 'web') {
      setError('웹에서는 이메일 로그인을 사용해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const oauth = provider === 'google' ? googleOAuth : appleOAuth
      
      if (!oauth) {
        setError('OAuth가 지원되지 않습니다.')
        return
      }

      const { startOAuthFlow } = oauth

      const { createdSessionId, setActive: oauthSetActive } = await startOAuthFlow()

      if (createdSessionId && oauthSetActive) {
        await oauthSetActive({ session: createdSessionId })
        router.replace('/')
      }
    } catch (err: any) {
      console.error('OAuth 오류:', err)
      setError(err.message || 'OAuth 로그인 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [googleOAuth, appleOAuth, router])

  // 이메일/비밀번호 로그인
  const handleEmailSignIn = useCallback(async () => {
    if (!isLoaded || !signIn) {
      setError('로그인 기능을 로드할 수 없습니다. 페이지를 새로고침해주세요.')
      console.error('signIn not loaded:', { isLoaded, signIn })
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

    setLoading(true)
    setError(null)

    try {
      console.log('로그인 시도:', email)
      
      const result = await signIn.create({
        identifier: email,
        password,
      })

      console.log('로그인 결과:', result.status)

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.replace('/')
      } else if (result.status === 'needs_first_factor') {
        // 추가 인증 필요 (2FA 등)
        setError('추가 인증이 필요합니다.')
      } else if (result.status === 'needs_second_factor') {
        setError('2단계 인증이 필요합니다.')
      } else {
        console.log('예상치 못한 로그인 결과:', result)
        setError(`로그인 상태: ${result.status}`)
      }
    } catch (err: any) {
      console.error('이메일 로그인 오류:', err)
      if (err.errors) {
        const errorMessages = err.errors.map((e: any) => {
          // Clerk 에러 코드 한글화
          if (e.code === 'form_password_incorrect') {
            return '비밀번호가 올바르지 않습니다.'
          }
          if (e.code === 'form_identifier_not_found') {
            return '등록되지 않은 이메일입니다.'
          }
          if (e.code === 'form_param_format_invalid') {
            return '이메일 형식이 올바르지 않습니다.'
          }
          return e.message || e.longMessage
        })
        setError(errorMessages.join('\n'))
      } else {
        setError(err.message || '이메일 로그인 중 오류가 발생했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [email, password, signIn, setActive, isLoaded, router])

  // 이메일 링크(Magic Link) 로그인
  const handleMagicLinkSignIn = useCallback(async () => {
    if (!isLoaded || !signIn) {
      setError('로그인 기능을 로드할 수 없습니다.')
      return
    }

    if (!email) {
      setError('이메일을 입력해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { supportedFirstFactors } = await signIn.create({
        identifier: email,
      })

      console.log('지원되는 인증 방식:', supportedFirstFactors)

      // 이메일 코드 방식 찾기
      const emailCodeFactor = supportedFirstFactors?.find(
        (factor: any) => factor.strategy === 'email_code'
      )

      if (emailCodeFactor) {
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailCodeFactor.emailAddressId,
        })
        setPendingVerification(true)
      } else {
        // 비밀번호 인증만 지원되는 경우
        const passwordFactor = supportedFirstFactors?.find(
          (factor: any) => factor.strategy === 'password'
        )
        if (passwordFactor) {
          setError('이 계정은 비밀번호 로그인만 지원됩니다. 비밀번호를 입력해주세요.')
        } else {
          setError('지원되는 인증 방식이 없습니다.')
        }
      }
    } catch (err: any) {
      console.error('Magic Link 오류:', err)
      if (err.errors) {
        const errorMessage = err.errors.map((e: any) => e.message).join('\n')
        setError(errorMessage)
      } else {
        setError(err.message || '이메일 전송 중 오류가 발생했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [email, signIn, isLoaded])

  // 이메일 코드 확인
  const handleVerifyCode = useCallback(async () => {
    if (!signIn || !code) {
      setError('인증 코드를 입력해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code,
      })

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.replace('/')
      }
    } catch (err: any) {
      console.error('코드 확인 오류:', err)
      if (err.errors) {
        const errorMessage = err.errors.map((e: any) => e.message).join('\n')
        setError(errorMessage)
      } else {
        setError(err.message || '코드 확인 중 오류가 발생했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [code, signIn, setActive, router])

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
            placeholder="인증 코드"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.emailButton, loading && styles.disabledButton]}
            onPress={handleVerifyCode}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.emailButtonText}>확인</Text>
            )}
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
          <Text style={styles.subtitle}>로그인</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* 이메일 로그인 폼 */}
          <View style={styles.emailForm}>
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
              placeholder="비밀번호"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />

            <TouchableOpacity
              style={[styles.emailButton, loading && styles.disabledButton]}
              onPress={handleEmailSignIn}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.emailButtonText}>로그인</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.magicLinkButton}
              onPress={handleMagicLinkSignIn}
              disabled={loading}
            >
              <Text style={styles.magicLinkButtonText}>📧 이메일 코드로 로그인</Text>
            </TouchableOpacity>

            {/* OAuth 버튼 (네이티브만) */}
            {Platform.OS !== 'web' && (
              <View style={styles.oauthSection}>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>또는</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={[styles.oauthButton, styles.googleButton]}
                  onPress={() => handleOAuthSignIn('google')}
                  disabled={loading}
                >
                  <Text style={styles.oauthIcon}>G</Text>
                  <Text style={styles.oauthButtonText}>Google로 계속하기</Text>
                </TouchableOpacity>

                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={[styles.oauthButton, styles.appleButton]}
                    onPress={() => handleOAuthSignIn('apple')}
                    disabled={loading}
                  >
                    <Text style={styles.oauthIcon}>🍎</Text>
                    <Text style={styles.oauthButtonText}>Apple로 계속하기</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity
              style={styles.signUpLink}
              onPress={() => router.push('/sign-up')}
            >
              <Text style={styles.signUpLinkText}>계정이 없으신가요? 회원가입</Text>
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
  emailForm: {
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
  emailButton: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  emailButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  magicLinkButton: {
    backgroundColor: '#f3f4f6',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  magicLinkButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  oauthSection: {
    marginTop: 8,
    gap: 12,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
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
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  googleButton: {
    backgroundColor: '#4285f4',
  },
  appleButton: {
    backgroundColor: '#000',
  },
  oauthIcon: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  oauthButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signUpLink: {
    marginTop: 16,
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  signUpLinkText: {
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
