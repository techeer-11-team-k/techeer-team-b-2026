// Expo 환경 변수 설정
// .env 파일에서 EXPO_PUBLIC_ 접두사가 붙은 변수를 자동으로 로드합니다
// .env 파일 로드 (frontend 폴더 내)
require('dotenv').config();

module.exports = {
  expo: {
    name: "부동산 분석 플랫폼",
    slug: "realestate-frontend",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    splash: {
      resizeMode: "contain",
      backgroundColor: "#3b82f6"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.realestate.app"
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#3b82f6"
      },
      package: "com.realestate.app"
    },
    web: {
      bundler: "metro"
    },
    plugins: [
      "expo-router"
    ],
    scheme: "realestate",
    extra: {
      router: {
        origin: false
      },
      eas: {
        projectId: ""
      },
      // 환경 변수를 extra에 추가하여 런타임에 접근 가능하도록 함
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:8000"
    }
  }
};
