import { useState, useEffect, useCallback } from 'react';
import { useGeolocation } from './useGeolocation';
import { useKakaoLoader } from './useKakaoLoader';

interface AddressInfo {
  fullAddress: string; // 전체 주소
  dong: string; // 동까지 (예: "경기도 파주시 운정동")
  loading: boolean;
  error: string | null;
}

/**
 * 현재 위치를 수집하고 동까지의 주소를 반환하는 훅
 * 웹/앱 환경 모두에서 작동하며, 카카오 geocoder를 사용하여 주소 변환
 */
export function useCurrentAddress() {
  const [addressInfo, setAddressInfo] = useState<AddressInfo>({
    fullAddress: '',
    dong: '',
    loading: false,
    error: null,
  });
  
  const { position, getCurrentPosition, requestPermission, isLoading: geoLoading } = useGeolocation(false);
  const { isLoaded: kakaoLoaded } = useKakaoLoader();

  // 좌표를 주소로 변환하는 함수
  const convertCoordToAddress = useCallback(async (lat: number, lng: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      // 카카오 SDK가 이미 로드되어 있으면 바로 진행
      if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
        const geocoder = new window.kakao.maps.services.Geocoder();
        
        geocoder.coord2Address(lng, lat, (result: any, status: any) => {
          if (status === window.kakao.maps.services.Status.OK) {
            // 도로명 주소 우선, 없으면 지번 주소 사용
            const roadAddress = result[0]?.road_address;
            const jibunAddress = result[0]?.address;
            
            if (roadAddress) {
              // 도로명 주소에서 동까지 추출
              const addressParts = roadAddress.address_name.split(' ');
              let dongAddress = '';
              if (addressParts.length >= 3) {
                dongAddress = `${addressParts[0]} ${addressParts[1]} ${addressParts[2]}`;
              } else if (addressParts.length >= 2) {
                dongAddress = `${addressParts[0]} ${addressParts[1]}`;
              } else {
                dongAddress = roadAddress.address_name;
              }
              
              resolve(dongAddress);
            } else if (jibunAddress) {
              // 지번 주소에서 동까지 추출
              const addressParts = jibunAddress.address_name.split(' ');
              let dongAddress = '';
              if (addressParts.length >= 3) {
                dongAddress = `${addressParts[0]} ${addressParts[1]} ${addressParts[2]}`;
              } else if (addressParts.length >= 2) {
                dongAddress = `${addressParts[0]} ${addressParts[1]}`;
              } else {
                dongAddress = jibunAddress.address_name;
              }
              resolve(dongAddress);
            } else {
              reject(new Error('주소 정보를 찾을 수 없습니다'));
            }
          } else {
            reject(new Error('주소 변환에 실패했습니다'));
          }
        });
        return;
      }
      
      // SDK가 로드되지 않았으면 대기 (최대 15초)
      const maxWaitTime = 15000; // 15초
      const checkInterval = 200; // 200ms마다 확인
      const startTime = Date.now();
      
      const checkKakaoLoaded = () => {
        if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
          // SDK가 로드되었으면 주소 변환 진행
          const geocoder = new window.kakao.maps.services.Geocoder();
          
          geocoder.coord2Address(lng, lat, (result: any, status: any) => {
            if (status === window.kakao.maps.services.Status.OK) {
              // 도로명 주소 우선, 없으면 지번 주소 사용
              const roadAddress = result[0]?.road_address;
              const jibunAddress = result[0]?.address;
              
              if (roadAddress) {
                const addressParts = roadAddress.address_name.split(' ');
                let dongAddress = '';
                if (addressParts.length >= 3) {
                  dongAddress = `${addressParts[0]} ${addressParts[1]} ${addressParts[2]}`;
                } else if (addressParts.length >= 2) {
                  dongAddress = `${addressParts[0]} ${addressParts[1]}`;
                } else {
                  dongAddress = roadAddress.address_name;
                }
                
                resolve(dongAddress);
              } else if (jibunAddress) {
                const addressParts = jibunAddress.address_name.split(' ');
                let dongAddress = '';
                if (addressParts.length >= 3) {
                  dongAddress = `${addressParts[0]} ${addressParts[1]} ${addressParts[2]}`;
                } else if (addressParts.length >= 2) {
                  dongAddress = `${addressParts[0]} ${addressParts[1]}`;
                } else {
                  dongAddress = jibunAddress.address_name;
                }
                resolve(dongAddress);
              } else {
                reject(new Error('주소 정보를 찾을 수 없습니다'));
              }
            } else {
              reject(new Error('주소 변환에 실패했습니다'));
            }
          });
        } else if (Date.now() - startTime < maxWaitTime) {
          // 아직 시간이 남았으면 다시 확인
          setTimeout(checkKakaoLoaded, checkInterval);
        } else {
          // 타임아웃 - 조용히 실패 (에러를 던지지 않음)
          // SDK가 로드되지 않아도 앱은 계속 작동하도록 함
          resolve('');
        }
      };
      
      // 즉시 한 번 확인
      checkKakaoLoaded();
    });
  }, [kakaoLoaded]);

  // 위치 가져오기 및 주소 변환
  const fetchCurrentAddress = useCallback(async () => {
    setAddressInfo(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // 위치 권한 요청
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        throw new Error('위치 권한이 거부되었습니다');
      }

      // 현재 위치 가져오기
      const pos = await getCurrentPosition();
      
      // 카카오 SDK가 로드되지 않았으면 에러 (자동으로 useEffect에서 처리됨)
      if (!kakaoLoaded) {
        setAddressInfo(prev => ({
          ...prev,
          loading: false,
          error: '카카오 SDK가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.',
        }));
        return;
      }

      // 좌표를 주소로 변환
      try {
        const dongAddress = await convertCoordToAddress(pos.lat, pos.lng);
        
        setAddressInfo({
          fullAddress: dongAddress,
          dong: dongAddress,
          loading: false,
          error: null,
        });
      } catch (addrError: any) {
        // 주소 변환 실패는 조용히 처리 (SDK 로딩 문제일 수 있음)
        setAddressInfo({
          fullAddress: '',
          dong: '',
          loading: false,
          error: null, // 에러를 표시하지 않음
        });
      }
    } catch (error: any) {
      // 위치 권한 거부 등 중요한 에러만 표시
      if (error.message && error.message.includes('권한')) {
        setAddressInfo({
          fullAddress: '',
          dong: '',
          loading: false,
          error: error.message,
        });
      } else {
        // 기타 에러는 조용히 처리
        setAddressInfo({
          fullAddress: '',
          dong: '',
          loading: false,
          error: null,
        });
      }
    }
  }, [getCurrentPosition, requestPermission, kakaoLoaded, convertCoordToAddress]);

  // 위치가 변경되면 자동으로 주소 변환
  useEffect(() => {
    if (position && kakaoLoaded) {
      convertCoordToAddress(position.lat, position.lng)
        .then((dongAddress) => {
          setAddressInfo(prev => ({
            ...prev,
            fullAddress: dongAddress,
            dong: dongAddress,
            loading: false,
            error: null,
          }));
        })
        .catch((error) => {
          console.error('주소 변환 실패:', error);
          setAddressInfo(prev => ({
            ...prev,
            loading: false,
            error: error.message || '주소 변환에 실패했습니다',
          }));
        });
    }
  }, [position, kakaoLoaded, convertCoordToAddress]);

  return {
    address: addressInfo.dong,
    fullAddress: addressInfo.fullAddress,
    loading: addressInfo.loading || geoLoading,
    error: addressInfo.error,
    fetchCurrentAddress,
    position,
  };
}
