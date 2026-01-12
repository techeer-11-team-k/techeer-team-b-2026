# HOMU 앱 로컬 사용 및 React Native 변환 가이드

## 📦 1. 로컬에서 React 웹앱 실행하기

### 1-1. 준비물
- Node.js (v18 이상 권장)
- npm 또는 yarn

### 1-2. 프로젝트 설정

```bash
# 1. 새 폴더 생성 및 이동
mkdir homu-app
cd homu-app

# 2. Vite + React + TypeScript 프로젝트 생성
npm create vite@latest . -- --template react-ts

# 3. 의존성 설치
npm install

# 4. 필요한 패키지 설치
npm install recharts lucide-react clsx tailwind-merge
npm install -D tailwindcss@latest postcss autoprefixer
npm install react-slick @types/react-slick

# 5. Tailwind CSS 초기화
npx tailwindcss init -p
```

### 1-3. 파일 구조
Figma Make에서 다음 파일들을 복사해서 로컬 프로젝트에 붙여넣으세요:

```
homu-app/
├── src/
│   ├── App.tsx                    # 메인 앱 파일
│   ├── main.tsx                   # 진입점
│   ├── components/                # 모든 컴포넌트 폴더
│   │   ├── Dashboard.tsx
│   │   ├── MapView.tsx
│   │   ├── ImprovedMapView.tsx
│   │   ├── Statistics.tsx
│   │   ├── Favorites.tsx
│   │   ├── MyHome.tsx
│   │   ├── FloatingDock.tsx
│   │   ├── FilterPanel.tsx
│   │   ├── ApartmentDetail.tsx
│   │   ├── NewsSection.tsx
│   │   ├── ProfileMenu.tsx
│   │   ├── Ranking.tsx
│   │   ├── RegionalHeatmap.tsx
│   │   ├── RegionalRanking.tsx
│   │   ├── figma/
│   │   │   └── ImageWithFallback.tsx
│   │   └── ui/                    # shadcn/ui 컴포넌트들
│   └── styles/
│       └── globals.css            # 글로벌 스타일
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

### 1-4. tailwind.config.js 설정

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### 1-5. index.html 수정
`<head>` 태그 안에 Pretendard 폰트 추가:

```html
<link rel="stylesheet" as="style" crossorigin 
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
```

### 1-6. 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 접속!

---

## 📱 2. React Native로 변환하기

React Native는 웹과 다른 컴포넌트 구조를 사용하므로, 완전한 변환 작업이 필요합니다.

### 2-1. React Native 프로젝트 생성

```bash
# Expo 사용 (권장 - 더 쉬움)
npx create-expo-app homu-mobile
cd homu-mobile

# 또는 React Native CLI 사용
npx react-native init HomuMobile
cd HomuMobile
```

### 2-2. 필요한 패키지 설치

```bash
# Expo 기준
npx expo install react-native-svg
npx expo install react-native-maps
npm install react-native-chart-kit
npm install @react-navigation/native @react-navigation/bottom-tabs
npx expo install react-native-safe-area-context react-native-screens
```

### 2-3. 주요 변환 작업

#### ❌ 사용 불가능한 웹 전용 요소들:
- `<div>` → `<View>` 로 변경
- `<span>`, `<p>` → `<Text>` 로 변경
- `<button>` → `<TouchableOpacity>` 또는 `<Pressable>` 로 변경
- `<input>` → `<TextInput>` 로 변경
- Tailwind CSS → StyleSheet 또는 styled-components 사용

#### ✅ 변환 예시:

**웹 (React):**
```tsx
<div className="bg-white rounded-lg p-4">
  <h2 className="text-xl font-bold">제목</h2>
  <button onClick={handleClick}>클릭</button>
</div>
```

**모바일 (React Native):**
```tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

<View style={styles.card}>
  <Text style={styles.title}>제목</Text>
  <TouchableOpacity onPress={handleClick}>
    <Text>클릭</Text>
  </TouchableOpacity>
</View>

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});
```

### 2-4. 차트 라이브러리 변경

Recharts는 React Native에서 작동하지 않으므로 대체 필요:
- `recharts` → `react-native-chart-kit` 또는 `victory-native` 사용

### 2-5. 지도 구현

웹의 SVG 지도 → React Native Maps 사용:

```bash
npx expo install react-native-maps
```

```tsx
import MapView, { Marker } from 'react-native-maps';

<MapView
  style={{ flex: 1 }}
  initialRegion={{
    latitude: 37.5665,
    longitude: 126.9780,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  }}
>
  <Marker
    coordinate={{ latitude: 37.5665, longitude: 126.9780 }}
    title="서울"
  />
</MapView>
```

### 2-6. 네비게이션 구현

FloatingDock → React Navigation의 Bottom Tabs:

```tsx
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();

function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="지도" component={MapScreen} />
        <Tab.Screen name="즐겨찾기" component={FavoritesScreen} />
        <Tab.Screen name="홈" component={HomeScreen} />
        <Tab.Screen name="통계" component={StatisticsScreen} />
        <Tab.Screen name="내 집" component={MyHomeScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

---

## 🎯 3. 권장 방법

### 옵션 A: 웹앱 + PWA (가장 빠름)
- 현재 웹앱을 PWA로 만들어서 모바일에서 앱처럼 사용
- 거의 변환 작업 없음
- iOS/Android 앱스토어 등록 불가

### 옵션 B: 웹앱 + Capacitor/Ionic (중간)
- 웹 코드를 거의 그대로 사용하면서 네이티브 앱으로 변환
- 앱스토어 배포 가능
- 일부 네이티브 API 접근 가능

### 옵션 C: React Native로 완전 재개발 (가장 느림)
- 모든 컴포넌트 다시 작성 필요
- 네이티브 성능 최고
- 앱스토어 배포 가능

---

## 📋 4. 단계별 추천 로드맵

1. **먼저 로컬에서 웹앱 실행** (위 1번 가이드)
2. **PWA로 변환해서 모바일 테스트**
3. **만족스럽지 않으면 Capacitor 검토**
4. **완전한 네이티브 앱이 필요하면 React Native 재개발**

---

## 🔧 5. 추가 리소스

- [React Native 공식 문서](https://reactnative.dev/)
- [Expo 공식 문서](https://docs.expo.dev/)
- [Capacitor 공식 문서](https://capacitorjs.com/)
- [PWA 가이드](https://web.dev/progressive-web-apps/)

---

## 💡 팁

- React Native 완전 변환은 **2-4주** 정도 소요 예상
- Capacitor 사용 시 **1주** 정도 소요
- PWA는 **1-2일**이면 가능

화이팅! 🚀
