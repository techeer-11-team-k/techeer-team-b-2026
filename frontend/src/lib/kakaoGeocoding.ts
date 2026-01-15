/**
 * 카카오맵 JavaScript SDK의 Geocoder를 사용하여 좌표를 주소로 변환
 */

interface AddressResult {
  address: string;
  roadAddress?: string;
  region1: string; // 시도
  region2: string; // 시군구
  region3: string; // 읍면동
}

/**
 * 카카오맵 SDK가 로드되었는지 확인
 */
const waitForKakaoSDK = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.kakao && window.kakao.maps && window.kakao.maps.services) {
      resolve(true);
      return;
    }

    // 최대 5초 대기
    let attempts = 0;
    const maxAttempts = 50;
    const interval = setInterval(() => {
      attempts++;
      if (typeof window !== 'undefined' && window.kakao && window.kakao.maps && window.kakao.maps.services) {
        clearInterval(interval);
        resolve(true);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });
};

/**
 * 좌표를 주소로 변환 (카카오맵 JavaScript SDK 사용)
 * @param lng 경도
 * @param lat 위도
 * @returns 주소 정보
 */
export const coordToAddress = async (lng: number, lat: number): Promise<AddressResult | null> => {
  try {
    // 카카오맵 SDK가 로드될 때까지 대기
    const isLoaded = await waitForKakaoSDK();
    
    if (!isLoaded) {
      console.error('⚠️ [Geocoding] Kakao Map SDK is not loaded');
      return null;
    }

    console.log('📍 [Geocoding] Requesting address for:', { lng, lat });

    return new Promise((resolve) => {
      const geocoder = new window.kakao.maps.services.Geocoder();
      const coord = new window.kakao.maps.LatLng(lat, lng);

      geocoder.coord2Address(coord.getLng(), coord.getLat(), (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK) {
          if (result && result.length > 0) {
            const data = result[0];
            
            // 도로명 주소 우선, 없으면 지번 주소 사용
            const address = data.road_address || data.address;
            
            if (address) {
              const addressResult = {
                address: address.address_name,
                roadAddress: data.road_address?.address_name,
                region1: address.region_1depth_name || '',
                region2: address.region_2depth_name || '',
                region3: address.region_3depth_name || '',
              };
              console.log('✅ [Geocoding] Address converted:', addressResult);
              resolve(addressResult);
              return;
            }
          }
        } else {
          console.error('❌ [Geocoding] Geocoder error:', status);
        }
        
        console.warn('⚠️ [Geocoding] No address found');
        resolve(null);
      });
    });
  } catch (error) {
    console.error('❌ [Geocoding] Failed to convert coordinates to address:', error);
    return null;
  }
};
