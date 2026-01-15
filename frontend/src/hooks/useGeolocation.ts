import { useState, useEffect, useCallback } from 'react';

interface Position {
  lat: number;
  lng: number;
  accuracy?: number;
}

interface UseGeolocationReturn {
  position: Position | null;
  error: string | null;
  loading: boolean;
  requestPermission: () => Promise<boolean>;
  getCurrentPosition: () => Promise<void>;
}

/**
 * 위치 권한 요청 및 현재 위치 가져오기 훅
 * 웹과 React Native 모두 지원
 */
export const useGeolocation = (autoRequest: boolean = false): UseGeolocationReturn => {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 플랫폼 감지 (웹인지 React Native인지)
  const isWeb = typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.geolocation;

  /**
   * 위치 권한 요청
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    // 웹 환경인지 먼저 확인
    if (isWeb) {
      // 웹 환경 - 권한 API 사용 (지원되는 브라우저)
      if ('permissions' in navigator) {
        try {
          // @ts-ignore - 일부 브라우저에서만 지원
          const result = await navigator.permissions.query({ name: 'geolocation' });
          return result.state === 'granted' || result.state === 'prompt';
        } catch (err) {
          // 권한 API를 지원하지 않는 경우 true 반환 (geolocation.getCurrentPosition에서 처리)
          return true;
        }
      }
      return true;
    }
    
    // React Native 환경 (웹이 아닐 때만 실행)
    // 웹 환경에서는 이 코드 블록이 실행되지 않으므로 Vite가 모듈을 찾지 않음
    try {
      // 동적 import를 사용하여 웹 빌드 시점에 모듈을 찾지 않도록 함
      // 런타임에만 실행되므로 Vite의 정적 분석을 피할 수 있음
      const expoLocationModule = 'expo-location';
      // @ts-ignore - React Native 환경에서만 사용 가능
      const expoLocation = await import(expoLocationModule).catch(() => null);
      if (!expoLocation) {
        setError('위치 서비스를 사용할 수 없습니다.');
        return false;
      }
      const { requestPermissionsAsync } = expoLocation;
      const { status } = await requestPermissionsAsync();
      return status === 'granted';
    } catch (err) {
      console.error('위치 권한 요청 실패:', err);
      setError('위치 권한을 요청할 수 없습니다.');
      return false;
    }
  }, [isWeb]);

  /**
   * 현재 위치 가져오기
   */
  const getCurrentPosition = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // 웹 환경인지 먼저 확인
      if (isWeb) {
        // 웹 환경
        if (!navigator.geolocation) {
          throw new Error('이 브라우저는 위치 서비스를 지원하지 않습니다.');
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setPosition({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy || undefined,
            });
            setLoading(false);
          },
          (err) => {
            let errorMessage = '위치를 가져올 수 없습니다.';
            
            switch (err.code) {
              case err.PERMISSION_DENIED:
                errorMessage = '위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.';
                break;
              case err.POSITION_UNAVAILABLE:
                errorMessage = '위치 정보를 사용할 수 없습니다.';
                break;
              case err.TIMEOUT:
                errorMessage = '위치 요청 시간이 초과되었습니다.';
                break;
              default:
                errorMessage = err.message || '알 수 없는 오류가 발생했습니다.';
            }
            
            setError(errorMessage);
            setLoading(false);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        );
        return; // 웹에서는 비동기 콜백이므로 여기서 return
      }
      
      // React Native 환경 (웹이 아닐 때만 실행)
      // 웹 환경에서는 이 코드 블록이 실행되지 않으므로 Vite가 모듈을 찾지 않음
      try {
        // 동적 import를 사용하여 웹 빌드 시점에 모듈을 찾지 않도록 함
        // 런타임에만 실행되므로 Vite의 정적 분석을 피할 수 있음
        const expoLocationModule = 'expo-location';
        // @ts-ignore - React Native 환경에서만 사용 가능
        const expoLocation = await import(expoLocationModule).catch(() => null);
        if (!expoLocation) {
          throw new Error('위치 서비스를 사용할 수 없습니다.');
        }
        const { getCurrentPositionAsync, Accuracy } = expoLocation;
        const location = await getCurrentPositionAsync({
          accuracy: Accuracy.High,
        });
        
        setPosition({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy: location.coords.accuracy || undefined,
        });
      } catch (err: any) {
        console.error('위치 가져오기 실패:', err);
        setError(err.message || '위치를 가져올 수 없습니다.');
      }
    } catch (err: any) {
      console.error('위치 가져오기 실패:', err);
      setError(err.message || '위치를 가져올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [isWeb]);

  // 자동 요청 옵션이 활성화된 경우
  useEffect(() => {
    if (autoRequest) {
      requestPermission().then((hasPermission) => {
        if (hasPermission) {
          getCurrentPosition();
        }
      });
    }
  }, [autoRequest, requestPermission, getCurrentPosition]);

  return {
    position,
    error,
    loading,
    requestPermission,
    getCurrentPosition,
  };
};
