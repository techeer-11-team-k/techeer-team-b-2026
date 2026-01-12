// 통합 레이아웃 - 플랫폼별 분기 처리
import { Platform, View, Text, StyleSheet } from 'react-native'
import { Slot, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import Constants from 'expo-constants'
import React from 'react'

// expo-constants를 통해 환경 변수 가져오기 (더 안정적)
const CLERK_PUBLISHABLE_KEY = 
  Constants.expoConfig?.extra?.clerkPublishableKey ||
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY

if (!CLERK_PUBLISHABLE_KEY) {
  console.error('Clerk 키를 찾을 수 없습니다.')
  console.error('Constants.expoConfig?.extra:', Constants.expoConfig?.extra)
  console.error('process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:', process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY)
  throw new Error(
    'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY가 설정되지 않았습니다.\n' +
    'frontend/.env 파일에 EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY를 추가하고,\n' +
    'Metro 서버를 재시작하세요 (npx expo start --clear)'
  )
}

// 플랫폼별 ClerkProvider 가져오기
const getClerkProvider = () => {
  if (Platform.OS === 'web') {
    return require('@clerk/clerk-react').ClerkProvider
  }
  return require('@clerk/clerk-expo').ClerkProvider
}

const ClerkProvider = getClerkProvider()

export default function RootLayout() {
  // 웹에서는 간단한 레이아웃 사용 (React Navigation 없음)
  if (Platform.OS === 'web') {
    return (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
        <View style={webStyles.container}>
          <View style={webStyles.header}>
            <Text style={webStyles.headerTitle}>🏠 부동산 분석 플랫폼</Text>
          </View>
          <View style={webStyles.content}>
            <Slot />
          </View>
        </View>
      </ClerkProvider>
    )
  }

  // 네이티브에서는 Stack Navigation 사용
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#f3f4f6',
          },
          headerTintColor: '#000',
        }}
      >
        <Stack.Screen name="index" options={{ title: '부동산 분석 플랫폼' }} />
        <Stack.Screen name="sign-in" options={{ title: '로그인' }} />
        <Stack.Screen name="sign-up" options={{ title: '회원가입' }} />
        <Stack.Screen name="db" options={{ title: 'DB 뷰어' }} />
        <Stack.Screen name="profile" options={{ title: '계정 설정' }} />
      </Stack>
      <StatusBar style="auto" />
    </ClerkProvider>
  )
}

const webStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    minHeight: '100vh' as any,
  },
  header: {
    backgroundColor: '#3b82f6',
    padding: 16,
    paddingTop: 24,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
})
