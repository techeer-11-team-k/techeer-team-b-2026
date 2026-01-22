import { useEffect, useState, useCallback } from 'react';

interface UseKakaoLoaderReturn {
  /** Kakao Maps SDK 로딩 완료 여부 */
  isLoaded: boolean;
  /** 로딩 중 발생한 에러 */
  error: Error | null;
  /** 로딩 중 여부 */
  isLoading: boolean;
  /** 재시도 함수 */
  retry: () => void;
}

/**
 * Kakao Maps SDK 로딩 훅
 * 
 * @returns {UseKakaoLoaderReturn} 로딩 상태 및 에러 정보
 * 
 * @example
 * const { isLoaded, error, isLoading, retry } = useKakaoLoader();
 * 
 * if (isLoading) return <LoadingSpinner />;
 * if (error) return <ErrorMessage onRetry={retry} />;
 * if (!isLoaded) return null;
 */
export const useKakaoLoader = (): UseKakaoLoaderReturn => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const loadKakaoMaps = useCallback(() => {
    // 이미 로드된 경우
    if (window.kakao && window.kakao.maps) {
      setIsLoaded(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // 기존 스크립트 확인
    const existingScript = document.getElementById('kakao-map-script');
    if (existingScript) {
      // 이미 로딩 중인 스크립트가 있으면 이벤트 리스너만 추가
      const handleLoad = () => {
        if (window.kakao && window.kakao.maps) {
          window.kakao.maps.load(() => {
            setIsLoaded(true);
            setIsLoading(false);
          });
        }
      };
      
      const handleError = () => {
        setError(new Error('Kakao Map 스크립트 로딩에 실패했습니다.'));
        setIsLoading(false);
      };

      existingScript.addEventListener('load', handleLoad);
      existingScript.addEventListener('error', handleError);
      
      return () => {
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
      };
    }

    // API 키 확인
    const apiKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      setError(new Error('Kakao Map API 키가 설정되지 않았습니다. VITE_KAKAO_JAVASCRIPT_KEY 환경 변수를 확인해 주세요.'));
      setIsLoading(false);
      return;
    }

    // 새 스크립트 생성
    const script = document.createElement('script');
    script.id = 'kakao-map-script';
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&libraries=services,clusterer,drawing&autoload=false`;
    script.async = true;

    const handleScriptLoad = () => {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => {
          setIsLoaded(true);
          setIsLoading(false);
        });
      } else {
        setError(new Error('Kakao Maps SDK가 올바르게 로드되지 않았습니다.'));
        setIsLoading(false);
      }
    };

    const handleScriptError = () => {
      setError(new Error('Kakao Map 스크립트 로딩에 실패했습니다. 네트워크 연결을 확인해 주세요.'));
      setIsLoading(false);
      // 실패한 스크립트 제거 (재시도 가능하도록)
      script.remove();
    };

    script.addEventListener('load', handleScriptLoad);
    script.addEventListener('error', handleScriptError);
    
    document.head.appendChild(script);

    return () => {
      script.removeEventListener('load', handleScriptLoad);
      script.removeEventListener('error', handleScriptError);
    };
  }, [retryCount]);

  useEffect(() => {
    const cleanup = loadKakaoMaps();
    return cleanup;
  }, [loadKakaoMaps]);

  const retry = useCallback(() => {
    setRetryCount(prev => prev + 1);
  }, []);

  return { isLoaded, error, isLoading, retry };
};

export default useKakaoLoader;
