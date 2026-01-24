/**
 * 공통 유틸리티 함수
 * 
 * 애플리케이션 전체에서 재사용되는 유틸리티 함수들을 정의합니다.
 */

// ============================================
// 가격 포맷팅
// ============================================

/**
 * 가격을 한글 단위(억/만원)로 포맷팅
 * @param price 가격 (만원 단위)
 * @returns 포맷팅된 문자열 (예: "1억 2,000만원")
 */
export const formatPrice = (price: number): string => {
  if (price === 0) return '0원';
  
  const absPrice = Math.abs(price);
  const sign = price < 0 ? '-' : '';
  
  if (absPrice < 10000) {
    return `${sign}${absPrice.toLocaleString()}만원`;
  }
  
  const eok = Math.floor(absPrice / 10000);
  const man = absPrice % 10000;
  
  if (man === 0) {
    return `${sign}${eok}억`;
  }
  
  return `${sign}${eok}억 ${man.toLocaleString()}만원`;
};

/**
 * 가격을 통일된 형식으로 포맷팅 (랭킹용)
 * - 3억 2000만원 형식
 * - 0억인 경우: 3000만원 (억 표시 안함)
 * - 0000만원인 경우: 3억 (만원 표시 안함)
 * @param price 가격 (만원 단위)
 * @returns 포맷팅된 JSX 요소 또는 문자열
 */
export const formatPriceUnified = (price: number): { eok: number; man: number } => {
  const absPrice = Math.abs(price);
  const eok = Math.floor(absPrice / 10000);
  const man = absPrice % 10000;
  
  return { eok, man };
};

/**
 * 가격을 한글 단위로 포맷팅 (단위 없이)
 * @param price 가격 (만원 단위)
 * @returns 포맷팅된 문자열 (예: "1억 2,000")
 */
export const formatPriceWithoutWon = (price: number): string => {
  if (price === 0) return '0';
  
  const absPrice = Math.abs(price);
  const sign = price < 0 ? '-' : '';
  
  if (absPrice < 10000) {
    return `${sign}${absPrice.toLocaleString()}만`;
  }
  
  const eok = Math.floor(absPrice / 10000);
  const man = absPrice % 10000;
  
  if (man === 0) {
    return `${sign}${eok}억`;
  }
  
  return `${sign}${eok}억 ${man.toLocaleString()}`;
};

/**
 * 가격을 억원 단위로 포맷팅
 * @param price 가격 (만원 단위)
 * @returns 포맷팅된 문자열 (예: "1.5억")
 */
export const formatPriceInBillion = (price: number): string => {
  if (price === 0) return '0억';
  return `${(price / 10000).toFixed(1)}억`;
};

// ============================================
// 면적 변환
// ============================================

/**
 * 제곱미터를 평으로 변환
 * @param sqm 제곱미터
 * @returns 평 (정수, 반올림)
 */
export const convertToPyeong = (sqm: number): number => {
  return Math.round(sqm / 3.3058);
};

/**
 * 평을 제곱미터로 변환
 * @param pyeong 평
 * @returns 제곱미터 (소수점 2자리)
 */
export const convertToSqm = (pyeong: number): number => {
  return Math.round(pyeong * 3.3058 * 100) / 100;
};

// ============================================
// 날짜 포맷팅
// ============================================

/**
 * ISO 날짜 문자열을 한국어 형식으로 변환
 * @param isoString ISO 날짜 문자열
 * @returns 포맷팅된 문자열 (예: "2024.12.25")
 */
export const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
};

/**
 * ISO 날짜 문자열을 상대적 시간으로 변환
 * @param isoString ISO 날짜 문자열
 * @returns 상대적 시간 문자열 (예: "3시간 전")
 */
export const formatRelativeTime = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  
  return formatDate(isoString);
};

// ============================================
// 문자열 유틸리티
// ============================================

/**
 * 문자열 줄임 (말줄임표 추가)
 * @param str 원본 문자열
 * @param maxLength 최대 길이
 * @returns 줄여진 문자열
 */
export const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
};

/**
 * 숫자에 천 단위 콤마 추가
 * @param num 숫자
 * @returns 콤마가 추가된 문자열
 */
export const formatNumber = (num: number): string => {
  return num.toLocaleString('ko-KR');
};

// ============================================
// 색상 유틸리티
// ============================================

/**
 * HEX 색상을 어둡게 만들기
 * @param hex HEX 색상 코드
 * @param amount 어둡게 할 비율 (0~1)
 * @returns 어두워진 HEX 색상
 */
export const darkenColor = (hex: string, amount: number = 0.3): string => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  
  const newR = Math.floor(r * (1 - amount));
  const newG = Math.floor(g * (1 - amount));
  const newB = Math.floor(b * (1 - amount));
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
};

/**
 * HEX 색상을 밝게 만들기
 * @param hex HEX 색상 코드
 * @param amount 밝게 할 비율 (0~1)
 * @returns 밝아진 HEX 색상
 */
export const lightenColor = (hex: string, amount: number = 0.3): string => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  
  const newR = Math.min(255, Math.floor(r + (255 - r) * amount));
  const newG = Math.min(255, Math.floor(g + (255 - g) * amount));
  const newB = Math.min(255, Math.floor(b + (255 - b) * amount));
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
};

// ============================================
// 디바운스 & 스로틀
// ============================================

/**
 * 디바운스 함수
 * @param func 실행할 함수
 * @param delay 지연 시간 (ms)
 * @returns 디바운스된 함수
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * 스로틀 함수
 * @param func 실행할 함수
 * @param limit 제한 시간 (ms)
 * @returns 스로틀된 함수
 */
export const throttle = <T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// ============================================
// 배열 유틸리티
// ============================================

/**
 * 배열에서 고유한 값만 추출
 * @param arr 배열
 * @param key 객체 배열인 경우 비교할 키
 * @returns 고유한 값들의 배열
 */
export const unique = <T>(arr: T[], key?: keyof T): T[] => {
  if (key) {
    const seen = new Set();
    return arr.filter(item => {
      const value = item[key];
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
  return [...new Set(arr)];
};

/**
 * 배열을 지정된 크기로 분할
 * @param arr 배열
 * @param size 청크 크기
 * @returns 분할된 배열들의 배열
 */
export const chunk = <T>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

// ============================================
// 검증 유틸리티
// ============================================

/**
 * 값이 null 또는 undefined인지 확인
 */
export const isNullish = (value: unknown): value is null | undefined => {
  return value === null || value === undefined;
};

/**
 * 값이 비어있는지 확인 (null, undefined, 빈 문자열, 빈 배열)
 */
export const isEmpty = (value: unknown): boolean => {
  if (isNullish(value)) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

// ============================================
// 도보 시간 변환
// ============================================

/**
 * 도보 시간(분)을 범위 문자열로 변환
 * @param minutes 도보 시간 (분)
 * @returns 범위 문자열 (예: "5분 이내")
 */
export const getWalkingTimeRange = (minutes?: number): string => {
  if (!minutes) return '-';
  if (minutes <= 5) return '5분 이내';
  if (minutes <= 10) return '5~10분';
  if (minutes <= 15) return '10~15분';
  return '15분 이상';
};

/**
 * 도보 시간 텍스트에서 분 추출
 * @param text 도보 시간 텍스트 (예: "도보 10분")
 * @returns 분 (숫자) 또는 undefined
 */
export const parseWalkingTimeMinutes = (text?: string): number | undefined => {
  if (!text) return undefined;
  const matches = text.match(/\d+/g);
  if (!matches) return undefined;
  return Math.max(...matches.map(val => parseInt(val, 10)));
};

// ============================================
// 랜덤 유틸리티
// ============================================

/**
 * 배열에서 랜덤한 아이템 선택
 */
export const randomItem = <T>(arr: readonly T[]): T => {
  return arr[Math.floor(Math.random() * arr.length)];
};

/**
 * ID 기반으로 일관된 인덱스 반환 (해시 기반)
 */
export const getConsistentIndex = (id: string | number, arrayLength: number): number => {
  const str = String(id);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % arrayLength;
};
