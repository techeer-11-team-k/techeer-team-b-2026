# 🏠 HOMU - 부동산 실거래가 분석 서비스

부동산 실거래가 기반 시세 분석 및 전세사기 위험도 판단 서비스

## ✨ 주요 기능

- 📊 **부동산 시장 흐름 시각화**: 실시간 거래 동향과 가격 변화 추이
- 🗺️ **지역별 실거래가 히트맵**: 한국 지도 기반 시각화 및 확대/축소 기능
- ⚠️ **전세가율 위험도 분석**: 전세사기 예방을 위한 전세가율 계산
- 🏘️ **아파트 검색**: 상세한 매물 정보 및 가격 비교
- ⭐ **즐겨찾기**: 관심 매물 저장 및 관리
- 📈 **통계 및 랭킹**: 지역별 거래량 및 상승률 순위

## 🎨 디자인 특징

- **플로팅 독 바**: 모바일 최적화 네비게이션
- **뉴모피즘 스타일**: 세련되고 모던한 UI
- **Sky Blue 그라디언트**: (#0ea5e9 베이스)
- **Pretendard 폰트**: 토스 스타일의 깔끔한 타이포그래피
- **반응형 디자인**: 다양한 화면 크기 지원

## 🚀 빠른 시작

### 로컬 개발 환경 설정

```bash
# 1. 의존성 설치
npm install

# 2. 개발 서버 실행
npm run dev

# 3. 브라우저에서 http://localhost:5173 접속
```

### 프로덕션 빌드

```bash
npm run build
npm run preview
```

## 📦 기술 스택

- **React 18** - UI 라이브러리
- **TypeScript** - 타입 안정성
- **Vite** - 빌드 도구
- **Tailwind CSS** - 스타일링
- **Recharts** - 차트 및 그래프
- **Lucide React** - 아이콘

## 📱 모바일 앱 변환

React Native로 변환하거나 PWA로 배포하는 방법은 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)를 참고하세요.

## 🗂️ 프로젝트 구조

```
homu-app/
├── src/
│   ├── App.tsx                 # 메인 앱
│   ├── components/
│   │   ├── Dashboard.tsx       # 홈 대시보드
│   │   ├── MapView.tsx         # 지도 뷰 (레거시)
│   │   ├── ImprovedMapView.tsx # 개선된 지도 뷰
│   │   ├── Statistics.tsx      # 통계 페이지
│   │   ├── Favorites.tsx       # 즐겨찾기
│   │   ├── MyHome.tsx          # 내 집 관리
│   │   ├── FloatingDock.tsx    # 하단 네비게이션
│   │   └── ...
│   └── styles/
│       └── globals.css         # 글로벌 스타일
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## 🎯 주요 컴포넌트

### 1. Dashboard (홈)
- 빠른 검색
- 최근 거래 현황
- 주요 뉴스 및 알림
- 지역별 인기 매물

### 2. ImprovedMapView (지도)
- 한국 지도 시각화
- 줌 컨트롤 (60%~300%)
- 지역별 가격 히트맵
- 실거래가 마커

### 3. Statistics (통계)
- 거래량 추이 차트
- 가격 변동 그래프
- 지역별 랭킹
- 전세가율 분석

### 4. Favorites (즐겨찾기)
- 관심 매물 리스트
- 가격 알림 설정
- 비교 기능

### 5. MyHome (내 집)
- 내 집 시세 조회
- 주변 실거래가 비교
- 전세사기 위험도 진단

## 🎨 컬러 시스템

```css
Primary: #0ea5e9 (Sky Blue)
Secondary: #06b6d4 (Cyan)
Success: #10b981 (Green)
Warning: #f59e0b (Amber)
Danger: #ef4444 (Red)
```

## 📄 라이선스

MIT License

## 👥 타겟 사용자

- 일반 실수요자
- 전세 계약 예정자
- 부동산 초보 투자자
- 집 구매 검토 중인 가족

## 💡 특징

- 일반인 친화적인 용어 사용
- 복잡한 투자 지표 대신 실용적인 정보 제공
- 전세사기 예방에 특화
- 모바일 우선 설계

---

Made with ❤️ for safe and smart home buying
