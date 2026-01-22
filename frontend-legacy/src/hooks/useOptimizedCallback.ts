/**
 * 최적화된 콜백 훅
 * 
 * useCallback을 더 편리하게 사용하기 위한 유틸리티
 */
import { useCallback, useRef, useEffect } from 'react';

/**
 * 항상 최신 값을 참조하는 콜백 생성
 * 
 * useCallback의 의존성 배열 관리가 번거로울 때 사용
 * 콜백 함수 자체는 변경되지 않지만, 내부에서 최신 값을 참조
 */
export function useLatestCallback<T extends (...args: any[]) => any>(callback: T): T {
  const ref = useRef<T>(callback);
  
  useEffect(() => {
    ref.current = callback;
  });
  
  return useCallback(((...args) => ref.current(...args)) as T, []);
}

/**
 * 디바운스된 콜백 생성
 * 
 * 연속된 호출을 지연시켜 마지막 호출만 실행
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const callbackRef = useRef<T>(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  });
  
  return useCallback(
    ((...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

/**
 * 쓰로틀된 콜백 생성
 * 
 * 일정 시간 동안 최대 한 번만 실행
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRunRef = useRef<number>(0);
  const callbackRef = useRef<T>(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  });
  
  return useCallback(
    ((...args) => {
      const now = Date.now();
      
      if (now - lastRunRef.current >= delay) {
        lastRunRef.current = now;
        callbackRef.current(...args);
      }
    }) as T,
    [delay]
  );
}
