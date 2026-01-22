// Clerk SignUp의 하위 경로를 처리하는 catch-all 라우트
// 예: /sign-up/verify-email-address 등
import { Platform, View, StyleSheet } from 'react-native'

// 웹용 SignUp 컴포넌트
let SignUpComponent: any = null
if (Platform.OS === 'web') {
  try {
    const clerkReact = require('@clerk/clerk-react')
    SignUpComponent = clerkReact.SignUp
  } catch (error) {
    console.error('Clerk SignUp 컴포넌트 로드 실패:', error)
  }
}

export default function SignUpSubRoute() {
  if (Platform.OS === 'web' && SignUpComponent) {
    return (
      <View style={styles.container}>
        <View style={styles.signUpWrapper}>
          <SignUpComponent 
            routing="path"
            path="/sign-up"
            fallbackRedirectUrl="/"
            signInUrl="/sign-in"
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

  // 네이티브나 컴포넌트 로드 실패 시 메인 sign-up 페이지로 리다이렉트
  return null
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  signUpWrapper: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
})
