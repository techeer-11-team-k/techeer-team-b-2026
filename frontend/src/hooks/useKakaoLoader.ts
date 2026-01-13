import { useEffect, useState } from 'react';

export const useKakaoLoader = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // 1. 이미 로드되어 있는 경우 (window.kakao 객체 확인)
    if (window.kakao && window.kakao.maps) {
      setIsLoaded(true);
      return;
    }

    // 2. 이미 스크립트 태그가 삽입되어 있는지 확인 (중복 로딩 방지)
    const existingScript = document.getElementById('kakao-map-script');
    if (existingScript) {
      // 스크립트가 로드될 때까지 대기
      existingScript.addEventListener('load', () => {
        window.kakao.maps.load(() => setIsLoaded(true));
      });
      existingScript.addEventListener('error', (e) => setError(new Error('Failed to load Kakao Map script')));
      return;
    }

    // 3. 환경 변수에서 API 키 가져오기
    const apiKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY;
    
    if (!apiKey) {
      console.error('⚠️ [KakaoMap] API Key is missing. Please set VITE_KAKAO_JAVASCRIPT_KEY in .env');
      setError(new Error('Kakao Map API Key is missing'));
      return;
    }

    console.log('🔑 [KakaoMap] Loading script...');

    // 4. 스크립트 태그 생성 및 삽입
    const script = document.createElement('script');
    script.id = 'kakao-map-script';
    // HTTPS 강제 사용
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&libraries=services,clusterer,drawing&autoload=false`;
    script.async = true;

    script.onload = () => {
      console.log('✅ [KakaoMap] Script loaded successfully');
      window.kakao.maps.load(() => {
        console.log('✅ [KakaoMap] API initialized');
        setIsLoaded(true);
      });
    };

    script.onerror = (e) => {
      console.error('❌ [KakaoMap] Failed to load script:', e);
      setError(new Error('Failed to load Kakao Map script'));
    };

    document.head.appendChild(script);

    // Cleanup: 컴포넌트 언마운트 시 스크립트를 제거할지는 선택 사항
    // SPA에서는 보통 제거하지 않고 유지하는 것이 성능상 유리함
  }, []);

  return { isLoaded, error };
};
