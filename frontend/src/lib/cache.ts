/**
 * 프론트엔드 캐싱 유틸리티
 * 
 * localStorage를 사용하여 API 응답을 캐싱합니다.
 */

const CACHE_PREFIX = 'api_cache_';
const DEFAULT_TTL = 5 * 60 * 1000; // 5분 (밀리초)

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * 캐시 키 생성
 */
function getCacheKey(url: string, params?: any): string {
  const paramsStr = params ? JSON.stringify(params) : '';
  return `${CACHE_PREFIX}${url}${paramsStr}`;
}

/**
 * 캐시에서 데이터 조회
 */
export function getFromCache<T>(url: string, params?: any): T | null {
  try {
    const key = getCacheKey(url, params);
    const cached = localStorage.getItem(key);
    
    if (!cached) {
      return null;
    }
    
    const item: CacheItem<T> = JSON.parse(cached);
    const now = Date.now();
    
    // TTL 확인
    if (now - item.timestamp > item.ttl) {
      // 만료된 캐시 삭제
      localStorage.removeItem(key);
      return null;
    }
    
    return item.data;
  } catch (error) {
    console.warn('캐시 조회 실패:', error);
    return null;
  }
}

/**
 * 캐시에 데이터 저장
 */
export function setToCache<T>(url: string, data: T, params?: any, ttl: number = DEFAULT_TTL): void {
  try {
    const key = getCacheKey(url, params);
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl
    };
    
    localStorage.setItem(key, JSON.stringify(item));
  } catch (error) {
    console.warn('캐시 저장 실패:', error);
    // localStorage 용량 초과 시 오래된 캐시 삭제 시도
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      clearOldCache();
    }
  }
}

/**
 * 캐시 삭제
 */
export function deleteFromCache(url: string, params?: any): void {
  try {
    const key = getCacheKey(url, params);
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('캐시 삭제 실패:', error);
  }
}

/**
 * 패턴에 맞는 캐시 삭제
 */
export function deleteCachePattern(pattern: string): void {
  try {
    const keys = Object.keys(localStorage);
    const regex = new RegExp(pattern);
    
    console.log(`🗑️ [deleteCachePattern] 패턴 "${pattern}"으로 캐시 삭제 시작`);
    console.log(`🗑️ [deleteCachePattern] 전체 localStorage 키 수: ${keys.length}`);
    
    let deletedCount = 0;
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX) && regex.test(key)) {
        console.log(`🗑️ [deleteCachePattern] 삭제할 캐시 키: ${key}`);
        localStorage.removeItem(key);
        deletedCount++;
      }
    });
    
    console.log(`🗑️ [deleteCachePattern] 삭제된 캐시 수: ${deletedCount}`);
  } catch (error) {
    console.warn('패턴 캐시 삭제 실패:', error);
  }
}

/**
 * 오래된 캐시 정리 (만료된 캐시만)
 */
function clearOldCache(): void {
  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();
    
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const item: CacheItem<any> = JSON.parse(cached);
            if (now - item.timestamp > item.ttl) {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // 파싱 실패 시 삭제
          localStorage.removeItem(key);
        }
      }
    });
  } catch (error) {
    console.warn('오래된 캐시 정리 실패:', error);
  }
}

/**
 * 모든 캐시 삭제
 */
export function clearAllCache(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('전체 캐시 삭제 실패:', error);
  }
}
