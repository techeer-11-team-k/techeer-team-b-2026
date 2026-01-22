<!-- 파일명: .agent/09_design_critique.md -->
# 🔍 Design Critique: 현행 디자인 문제점 분석

> **목적**: 기존 프론트엔드 소스를 냉정하게 분석하여, 개발적/UX적/시각적 문제점을 도출한다. 이 문서는 리디자인의 근거가 된다.

---

## 📊 분석 대상 파일

| 파일 | 라인 수 | 역할 |
|------|--------|------|
| `ApartmentDetail.tsx` | ~1,127줄 | 아파트 상세 정보 |
| `Dashboard.tsx` | ~2,666줄 | 홈 대시보드 |
| `Statistics.tsx` | ~2,368줄 | 통계 페이지 |
| `Favorites.tsx` | ~1,513줄 | 즐겨찾기 관리 |

---

## 🚨 치명적 문제점 (Critical)

### 1. **거대한 단일 컴포넌트 (God Component)**

```
Dashboard.tsx: 2,666줄
Statistics.tsx: 2,368줄
ApartmentDetail.tsx: 1,127줄
```

**문제**:
- 하나의 파일에 모든 로직, 상태, UI가 뒤섞여 있음
- 유지보수 불가능한 수준의 복잡도
- 부분 수정 시 전체 컴포넌트 리렌더링 위험
- 테스트 불가능

**영향**:
- 개발 속도 저하
- 버그 발생 시 원인 파악 어려움
- 새 기능 추가 시 사이드 이펙트 우려

---

### 2. **반복되는 동일한 카드 스타일 (Visual Monotony)**

```typescript
// 모든 곳에서 동일한 패턴 반복
const cardClass = isDarkMode
  ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50'
  : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';
```

**문제**:
- 모든 섹션이 동일한 카드로 감싸져 시각적 지루함
- 정보 위계(Hierarchy) 구분 불가
- "카드 안에 카드 안에 카드" 구조로 깊이 혼란
- 첫 번째 레퍼런스 이미지와 비교하면 우리 디자인은 "답답한 카드 스택" 느낌

**예시 (현재)**:
```
┌────────────────────────────────┐
│  카드                           │
│  ┌───────────────────────────┐ │
│  │  또 카드                   │ │
│  │  ┌──────────────────────┐ │ │
│  │  │  또 카드              │ │ │
│  │  └──────────────────────┘ │ │
│  └───────────────────────────┘ │
└────────────────────────────────┘
```

**개선 방향**: 배경, 구분선, 여백으로 영역 구분. 카드는 핵심 요소에만 사용.

---

### 3. **가격 표시의 가독성 부재 (Typography Hierarchy)**

```typescript
// 현재: 모든 텍스트가 동일한 강조
<p className={`text-4xl font-bold bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent`}>
  {priceDisplay}  // "3억 4,000만원" 전체가 동일 스타일
</p>
```

**문제**:
- "3억"과 "4,000만원"의 시각적 구분 없음
- 핵심 숫자(금액)와 단위의 무게감 동일
- 변동률과 가격의 시각적 우선순위 불명확

**개선 방향** (레퍼런스 이미지 참고):
```
┌─────────────────────────────────┐
│   $24,882                       │  ← 숫자: 크고 굵게 (강조색)
│   ↑ 23.56%  Prev month         │  ← 변동률: 작게, 서브 색상
└─────────────────────────────────┘
```

**코드 예시**:
```tsx
// 개선된 가격 표시
<span className="text-4xl font-bold text-slate-900">3</span>
<span className="text-2xl font-medium text-slate-500">억</span>
<span className="text-4xl font-bold text-slate-900 ml-1">4,000</span>
<span className="text-2xl font-medium text-slate-500">만원</span>
```

---

### 4. **과도한 상태 변수 (State Explosion)**

```typescript
// Dashboard.tsx 내 상태 변수 일부
const [searchQuery, setSearchQuery] = useState('');
const [isAIMode, setIsAIMode] = useState(false);
const [gradientAngle, setGradientAngle] = useState(90);
const [gradientPosition, setGradientPosition] = useState({ x: 50, y: 50 });
const [gradientSize, setGradientSize] = useState(150);
const [rankingTab, setRankingTab] = useState<'sale' | 'jeonse'>('sale');
// ... 40개 이상의 useState
```

**문제**:
- 하나의 컴포넌트에 40개 이상의 상태 변수
- 상태 간 의존성 파악 불가
- 불필요한 리렌더링 유발

---

## ⚠️ 주요 문제점 (Major)

### 5. **차트와 콘텐츠의 분리감**

**문제**:
- 차트가 카드 안에 "박혀있는" 느낌
- 숫자와 차트 간의 시각적 연결 부족
- 레퍼런스 이미지처럼 차트가 자연스럽게 녹아드는 느낌 없음

**현재 (Statistics.tsx)**:
```tsx
<div className={`rounded-2xl p-5 ${cardClass}`}>
  <h2>제목</h2>
  <p>설명</p>
  <HighchartsReact ... />  {/* 차트가 그냥 박혀있음 */}
</div>
```

**개선 방향**:
- 핵심 지표를 차트 위/옆에 오버레이
- 차트 배경을 투명하게 하여 카드와 융합
- 호버 시 차트와 수치의 인터랙티브 연동

---

### 6. **필터 UI의 혼잡함**

```tsx
// ApartmentDetail.tsx - 가격 변화 추이 필터
<div className="flex flex-wrap items-center gap-2 mb-4">
  {/* 거래 유형 필터 */}
  <div className={`flex gap-1 p-1 rounded-lg ...`}>
    {[{ value: 'all', label: '전체' }, ...].map(...)}
  </div>
  
  {/* 기간 필터 */}
  <div className={`flex gap-1 p-1 rounded-lg ...`}>
    {[{ value: 3, label: '3개월' }, ...].map(...)}
  </div>
  
  {/* 면적 필터 */}
  {availableAreas.length > 0 && (
    <div className="relative">...</div>
  )}
</div>
```

**문제**:
- 3개의 필터 그룹이 한 줄에 나열되어 복잡
- 모바일에서 줄바꿈 시 레이아웃 깨짐
- 각 필터의 현재 선택값이 한눈에 파악되지 않음

**개선 방향**:
- 주요 필터만 노출, 나머지는 "필터" 버튼 → 바텀시트/모달
- 현재 적용된 필터를 Pill/Tag로 표시

---

### 7. **정보 밀도 과다 (Information Overload)**

**거래 내역 리스트 (ApartmentDetail.tsx)**:
```tsx
<div className={`p-4 transition-colors ...`}>
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2 mb-1">
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ...`}>매매</span>
      <span className={`text-xs ${textSecondary}`}>{date}</span>
    </div>
    <div className="flex items-baseline gap-2">
      <span className={`text-base font-bold ...`}>{price}</span>
      <span className={`text-sm ...`}>{floor}층</span>
    </div>
    <div className={`text-xs ... mt-0.5`}>
      {area}㎡ ({pyeong}평) · {pricePerPyeong}만원/평
    </div>
  </div>
</div>
```

**문제**:
- 한 거래 항목에 8개 이상의 정보 요소
- 모든 정보가 동일한 시각적 무게로 표시됨
- 핵심 정보(가격)가 묻힘

**개선 방향**:
- 가격을 크게, 나머지는 서브텍스트로
- 호버/탭 시 상세 정보 확장
- 레퍼런스 이미지처럼 깔끔한 리스트

---

### 8. **다크모드 대비 부족**

```typescript
// 현재: 다크모드에서 텍스트 색상 대비 미흡
const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
```

**문제**:
- `slate-400`은 어두운 배경에서 읽기 어려움
- 특히 작은 텍스트 (12px 이하)에서 접근성 위반
- WCAG 2.1 AA 기준 대비율 4.5:1 미충족 우려

**개선**:
- 다크모드에서 `slate-300` 또는 `slate-200` 사용
- 중요 정보는 `slate-100` 이상

---

### 9. **로딩 상태의 단조로움**

```tsx
// 현재: 단순 스피너만 사용
{loading ? (
  <div className="flex items-center justify-center py-12">
    <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
) : (...)}
```

**문제**:
- 콘텐츠 레이아웃 힌트 없음 (CLS 유발)
- 로딩 중 화면이 비어 보임
- 레퍼런스 이미지처럼 세련된 Skeleton UI 부재

**개선**:
- 각 섹션에 맞는 Skeleton UI
- Shimmer 효과로 진행 중임을 명확히

---

## 📋 중간 문제점 (Moderate)

### 10. **모바일/PC 레이아웃 차이 부족**

```tsx
// 현재: 단순 조건부 표시만
<div className={isDesktop ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
```

**문제**:
- PC에서는 사이드바 활용 가능하나 미사용
- 모바일에서 카드가 세로로 쌓여 스크롤 과다
- PC에서 넓은 화면 활용 미흡

---

### 11. **일관성 없는 아이콘 사용**

```tsx
// 같은 의미에 다른 아이콘 사용
<TrendingUp />  // 어디서는 "상승"
<ArrowUpRight />  // 다른 곳에서는 "상승"  
<ChevronUp />  // 또 다른 곳에서는 "펼치기"
```

**문제**:
- 같은 개념에 다른 아이콘 사용 혼란
- 아이콘 크기 (w-4, w-5, w-6) 불일치

---

### 12. **애니메이션 목적 불명확**

```tsx
// Dashboard.tsx - AI 모드 그라데이션 애니메이션
useEffect(() => {
  if (!isAIMode) return;
  const animate = () => {
    const x = 50 + Math.sin(elapsed * 0.5) * 50;
    setGradientPosition({ x, y: 50 });
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}, [isAIMode]);
```

**문제**:
- CPU 지속 사용 (requestAnimationFrame 무한 루프)
- 사용자 경험에 실질적 기여 불명확
- 배터리 소모

---

### 13. **중복 코드 패턴**

```tsx
// 이 패턴이 수십 번 반복됨
<div className={`rounded-2xl p-5 ${cardClass}`}>
  <div className="flex items-start justify-between mb-6">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-zinc-800/50' : 'bg-blue-50'}`}>
        <SomeIcon className="w-5 h-5" />
      </div>
      <div>
        <h2 className={`text-xl font-bold ${textPrimary} mb-1`}>제목</h2>
        <p className={`text-sm ${textSecondary}`}>설명</p>
      </div>
    </div>
  </div>
  {/* 콘텐츠 */}
</div>
```

**해결**: 공통 컴포넌트로 추출

---

## 🎯 UX 문제점

### 14. **사용자 시선 흐름 부재**

**문제**:
- 화면에 진입 시 어디를 먼저 봐야 할지 모름
- 모든 요소가 동일한 시각적 무게
- F-패턴, Z-패턴 등 시선 유도 전략 없음

**개선**:
- 핵심 지표를 크게, 상단에 배치
- 시각적 위계 설정 (H1 > H2 > Body)
- 액션 버튼에 시선 유도

---

### 15. **피드백 부재**

**문제**:
- 즐겨찾기 추가/삭제 시 확인 메시지 미흡
- 데이터 새로고침 완료 시 알림 없음
- 에러 발생 시 사용자 안내 부족

---

### 16. **네비게이션 맥락 상실**

**문제**:
- 현재 어느 페이지에 있는지 표시 약함
- 뒤로가기 시 이전 상태 복원 안됨
- 깊은 depth로 진입 시 현재 위치 파악 어려움

---

## 🔧 기술 부채 (Technical Debt)

### 17. **타입 안전성 부족**

```tsx
onApartmentClick: (apartment: any) => void;
```

**문제**:
- `any` 타입 남용
- 런타임 에러 위험

---

### 18. **접근성 미비**

**문제**:
- `aria-label` 부재
- 키보드 네비게이션 미지원
- 스크린 리더 지원 미흡

---

## ✅ 개선 우선순위

| 우선순위 | 문제 | 예상 효과 |
|---------|------|----------|
| 🔴 P0 | 거대 컴포넌트 분리 | 유지보수성 대폭 향상 |
| 🔴 P0 | 가격 타이포그래피 개선 | 가독성 즉시 개선 |
| 🟠 P1 | 카드 남용 해소 | 시각적 피로 감소 |
| 🟠 P1 | Skeleton UI 적용 | 로딩 UX 개선 |
| 🟡 P2 | 필터 UI 간소화 | 인터랙션 개선 |
| 🟡 P2 | 다크모드 대비 개선 | 접근성 향상 |
| 🟢 P3 | 애니메이션 최적화 | 성능 개선 |

---

## 🎨 레퍼런스 대비 현재 상태

### 레퍼런스 이미지 1 (다크 대시보드) 대비

| 레퍼런스 특징 | 현재 상태 | 개선 필요 |
|--------------|----------|---------|
| 라임/그린 포인트 컬러 | 스카이/블루만 사용 | ✅ 포인트 컬러 추가 |
| 숫자가 크고 명확 | 숫자 작음, 강조 부족 | ✅ 타이포그래피 개선 |
| 여백 충분 | 카드가 빼곡 | ✅ 레이아웃 여유 |
| 차트가 배경처럼 융합 | 차트가 별도 박스 | ✅ 차트 통합 |
| 정보 계층 명확 | 모든 정보 동일 무게 | ✅ 위계 설정 |

### 레퍼런스 이미지 2 (라이트 주식앱) 대비

| 레퍼런스 특징 | 현재 상태 | 개선 필요 |
|--------------|----------|---------|
| 가격이 최상단, 가장 큼 | 여러 정보와 경쟁 | ✅ 가격 강조 |
| 변동률이 가격 바로 아래 | 변동률이 우측으로 밀려남 | ✅ 배치 변경 |
| 차트가 넓고 깔끔 | 차트 영역 작음 | ✅ 차트 영역 확대 |
| 필터가 단순 (1M, 3M, 1Y) | 필터 복잡 | ✅ 필터 간소화 |
| 정보가 그룹핑됨 | 산발적 배치 | ✅ 그룹핑 개선 |

---

## 📝 결론

현재 디자인은 **기능 구현에 치중**하여 **사용자 경험과 시각적 완성도**가 부족하다.

핵심 개선 방향:
1. **"카드 지옥" 탈출** → 여백과 그룹핑으로 영역 구분
2. **가격 = 주인공** → 가격을 크고 명확하게, 나머지는 서브
3. **컴포넌트 분리** → 유지보수 가능한 구조로
4. **레퍼런스 수준의 완성도** → 1px, 0.1초까지 신경 쓴 디테일
