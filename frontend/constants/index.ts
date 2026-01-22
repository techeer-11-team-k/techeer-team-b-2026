/**
 * 공통 상수 정의
 * 
 * 애플리케이션 전체에서 사용되는 상수값들을 중앙 관리합니다.
 */

// ============================================
// 차트 색상
// ============================================
export const CHART_COLORS = [
  '#3182F6', // Blue
  '#00C48C', // Green  
  '#FF6B6B', // Red
  '#FFB800', // Yellow
  '#9B59B6', // Purple
  '#00D4FF', // Cyan
  '#FF9500', // Orange
  '#34C759', // Success Green
] as const;

export const COLOR_PALETTE = ['#1E88E5', '#FFC107', '#43A047', '#E53935', '#8E24AA'] as const;

// ============================================
// 지하철 노선 색상
// ============================================
export const SUBWAY_LINE_COLORS: Record<string, string> = {
  '1호선': '#0052A4',
  '2호선': '#00A84D',
  '3호선': '#EF7C1C',
  '4호선': '#00A5DE',
  '5호선': '#996CAC',
  '6호선': '#CD7C2F',
  '7호선': '#747F00',
  '8호선': '#E6186C',
  '9호선': '#BDB092',
  '신분당선': '#D4003B',
  '경의중앙선': '#77C4A3',
  '경춘선': '#0D8445',
  '수인분당선': '#F5A200',
  '공항철도': '#0090D2',
  'GTX-A': '#9A6292',
} as const;

// ============================================
// 아파트 이미지 (랜덤 할당용)
// ============================================
export const APARTMENT_IMAGES = [
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=100&h=100&fit=crop',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=100&h=100&fit=crop',
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=100&h=100&fit=crop',
  'https://images.unsplash.com/photo-1574362848149-11496d93a7c7?w=100&h=100&fit=crop',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=100&h=100&fit=crop',
  'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=100&h=100&fit=crop',
] as const;

// ============================================
// 기본 뉴스 이미지
// ============================================
export const DEFAULT_NEWS_IMAGES = [
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&h=300&fit=crop',
] as const;

// ============================================
// 비교 관련 상수
// ============================================
export const MAX_COMPARE_ITEMS = 5;

// ============================================
// 페이지네이션 기본값
// ============================================
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
} as const;

// ============================================
// 디바운스 타이밍 (ms)
// ============================================
export const DEBOUNCE = {
  SEARCH: 300,
  SCROLL: 100,
  RESIZE: 150,
} as const;

// ============================================
// 로컬 스토리지 키
// ============================================
export const STORAGE_KEYS = {
  DARK_MODE: 'darkMode',
  RECENT_SEARCHES: 'recentSearches',
  USER_PREFERENCES: 'userPreferences',
} as const;

// ============================================
// 정렬 옵션
// ============================================
export const SORT_OPTIONS = [
  { value: 'currentPrice-desc', label: '시세 높은순' },
  { value: 'currentPrice-asc', label: '시세 낮은순' },
  { value: 'changeRate-desc', label: '상승률 높은순' },
  { value: 'changeRate-asc', label: '상승률 낮은순' },
] as const;

// ============================================
// 기간 옵션
// ============================================
export const PERIOD_OPTIONS = ['1년', '3년', '전체'] as const;

// ============================================
// 뉴스 카테고리 색상
// ============================================
export const NEWS_CATEGORY_COLORS: Record<string, string> = {
  '정책': 'bg-brand-blue text-white',
  '분양': 'bg-purple-500 text-white',
  '시장동향': 'bg-green-500 text-white',
  '인프라': 'bg-orange-500 text-white',
  '부동산': 'bg-slate-500 text-white',
} as const;
