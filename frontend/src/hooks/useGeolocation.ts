import { useState, useCallback } from 'react';

interface Position {
  lat: number;
  lng: number;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export function useGeolocation(enableAutoFetch: boolean = true) {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getCurrentPosition = useCallback(
    (options?: UseGeolocationOptions): Promise<Position> => {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          const error = new Error('Geolocation is not supported by this browser.') as any;
          error.code = 0;
          setError(error);
          reject(error);
          return;
        }

        setIsLoading(true);
        setError(null);

        const defaultOptions: UseGeolocationOptions = {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000, // 1분
        };

        navigator.geolocation.getCurrentPosition(
          (geoPosition) => {
            const pos: Position = {
              lat: geoPosition.coords.latitude,
              lng: geoPosition.coords.longitude,
            };
            setPosition(pos);
            setIsLoading(false);
            resolve(pos);
          },
          (err) => {
            setError(err);
            setIsLoading(false);
            reject(err);
          },
          { ...defaultOptions, ...options }
        );
      });
    },
    []
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!navigator.geolocation) {
      return false;
    }

    // 권한 확인 (Permission API가 지원되는 경우)
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (result.state === 'granted') {
          return true;
        }
        if (result.state === 'denied') {
          return false;
        }
        // 'prompt' 상태인 경우 실제 위치 요청을 시도
      } catch (e) {
        // Permission API가 지원되지 않거나 오류 발생 시 계속 진행
        console.warn('Permission API not supported:', e);
      }
    }

    // 실제 위치 요청을 통해 권한 확인
    try {
      await getCurrentPosition();
      return true;
    } catch (err: any) {
      if (err.code === 1) {
        // PERMISSION_DENIED
        return false;
      }
      // 다른 오류는 권한 문제가 아닐 수 있으므로 true 반환
      return true;
    }
  }, [getCurrentPosition]);

  return {
    position,
    error,
    isLoading,
    getCurrentPosition,
    requestPermission,
  };
}
