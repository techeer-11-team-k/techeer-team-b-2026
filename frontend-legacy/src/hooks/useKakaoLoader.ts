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
    
    // 디버깅: 환경 변수 로드 상태 확인
    if (import.meta.env.DEV) {
      console.log('🔍 [KakaoMap] Environment check:', {
        'VITE_KAKAO_JAVASCRIPT_KEY': apiKey ? `${apiKey.substring(0, 8)}...` : 'undefined/empty',
        'All VITE_ vars': Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')),
      });
    }
    
    // API 키 검증: undefined, null, 빈 문자열 모두 체크
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      const errorMsg = `Kakao Map API Key is missing or invalid. 
        Current value: ${apiKey === undefined ? 'undefined' : `"${apiKey}"`}
        Please check VITE_KAKAO_JAVASCRIPT_KEY in .env file.
        Note: If using Docker, ensure the env var is passed at BUILD time, not just runtime.`;
      console.error('❌ [KakaoMap]', errorMsg);
      setError(new Error(errorMsg));
      return;
    }

    // 4. 스크립트 태그 생성 및 삽입
    const script = document.createElement('script');
    script.id = 'kakao-map-script';
    // HTTPS 강제 사용
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&libraries=services,clusterer,drawing&autoload=false`;
    script.async = true;

    script.onload = () => {
      window.kakao.maps.load(() => {
        setIsLoaded(true);
      });
    };

    script.onerror = async (e) => {
      const scriptUrl = script.src;
      
      // 네트워크 요청 상태 확인 시도
      let networkError = null;
      try {
        const response = await fetch(scriptUrl, { method: 'HEAD' });
        if (!response.ok) {
          networkError = `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (fetchError) {
        networkError = `Fetch error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
      }
      
      const errorDetails = {
        scriptUrl,
        apiKey: `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`,
        networkStatus: networkError || 'Unknown',
        currentDomain: window.location.hostname,
        userAgent: navigator.userAgent.substring(0, 50),
      };
      
      const errorMsg = `Failed to load Kakao Map script.
        URL: ${scriptUrl}
        Network Status: ${networkError || 'Check Network tab in DevTools'}
        Current Domain: ${window.location.hostname}
        
        Possible causes:
        1. Invalid API key - Verify the key in Kakao Developer Console
        2. Domain not registered - Add "${window.location.hostname}" to allowed domains
        3. Network/CORS issue - Check browser Network tab for detailed error
        4. API key type mismatch - Ensure you're using JavaScript Key, not REST API Key
        
        Debug Info: ${JSON.stringify(errorDetails, null, 2)}`;
      
      console.error('❌ [KakaoMap]', errorMsg);
      console.error('❌ [KakaoMap] Event details:', e);
      console.error('❌ [KakaoMap] Script element:', script);
      
      setError(new Error(`Failed to load Kakao Map script. Check console for details.`));
    };

    document.head.appendChild(script);

    // Cleanup: 컴포넌트 언마운트 시 스크립트를 제거할지는 선택 사항
    // SPA에서는 보통 제거하지 않고 유지하는 것이 성능상 유리함
  }, []);

  return { isLoaded, error };
};
