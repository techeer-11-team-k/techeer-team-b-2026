import React, { useState, useRef } from 'react';
import { Navigation } from 'lucide-react';
import KakaoMap from './KakaoMap';
import MapSearchControl from './MapSearchControl';
import { useGeolocation } from '../../hooks/useGeolocation';

interface RealEstateMapProps {
  isDarkMode: boolean;
  onApartmentSelect?: (apt: any) => void;
  selectedApartment?: any; // 홈에서 검색한 아파트 (지도 이동용)
  isDesktop?: boolean;
}

// Reuse mock data
const mockApartments = [
  { id: 1, name: '일산 두산위브더제니스', price: '6억 8천만원', location: '경기 고양시', lat: 37.6951, lng: 126.7736 },
  { id: 2, name: '운정 더샵', price: '5억 2천만원', location: '경기 파주시', lat: 37.7151, lng: 126.7364 },
  { id: 3, name: '강남 래미안', price: '21억 5천만원', location: '서울 강남구', lat: 37.4979, lng: 127.0276 },
  { id: 4, name: '송파 헬리오시티', price: '14억 8천만원', location: '서울 송파구', lat: 37.4933, lng: 127.1357 },
  { id: 5, name: '마곡 힐스테이트', price: '10억 3천만원', location: '서울 강서구', lat: 37.5618, lng: 126.8285 },
];

export default function RealEstateMap({ isDarkMode, onApartmentSelect, selectedApartment, isDesktop = false }: RealEstateMapProps) {
  const [center, setCenter] = useState({ lat: 37.5665, lng: 126.9780 });
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const mapRef = useRef<any>(null);
  
  // 검색 결과 변경 로깅
  React.useEffect(() => {
    console.log(`[RealEstateMap] 검색 결과 업데이트: ${searchResults.length}개 마커 표시`);
  }, [searchResults]);
  const { position: currentPosition, getCurrentPosition, requestPermission, loading: locationLoading } = useGeolocation(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // 지도로만 이동 (상세 페이지는 열지 않음)
  const handleMoveToApartment = (apt: any) => {
    if (apt.lat && apt.lng && mapRef.current && window.kakao && window.kakao.maps) {
      const moveLatLon = new window.kakao.maps.LatLng(apt.lat, apt.lng);
      mapRef.current.panTo(moveLatLon);
      mapRef.current.setLevel(3);
      setCenter({ lat: apt.lat, lng: apt.lng });
    }
  };

  // 마커 클릭 시 상세 페이지 열기
  const handleApartmentClick = (apt: any) => {
    // 지도 이동
    handleMoveToApartment(apt);
    // 상세 페이지 열기
    onApartmentSelect?.(apt);
  };

  const handleMapLoad = (map: any) => {
    mapRef.current = map;
    
    // 초기 로드 시 현재 위치로 이동
    if (isInitialLoad) {
      const fetchInitialLocation = async () => {
        const hasPermission = await requestPermission();
        if (hasPermission) {
          await getCurrentPosition();
          // 위치를 가져온 후 지도 이동은 useEffect에서 처리
        } else {
          // 권한이 없으면 기본 위치(서울) 유지
          setIsInitialLoad(false);
        }
      };
      fetchInitialLocation();
    }
  };

  const handleCurrentLocationClick = async () => {
    const hasPermission = await requestPermission();
    if (hasPermission) {
      await getCurrentPosition();
      if (currentPosition && mapRef.current && window.kakao && window.kakao.maps) {
        const moveLatLon = new window.kakao.maps.LatLng(currentPosition.lat, currentPosition.lng);
        mapRef.current.panTo(moveLatLon);
        mapRef.current.setLevel(3);
        setCenter({ lat: currentPosition.lat, lng: currentPosition.lng });
      }
    }
  };

  // 현재 위치가 변경되면 지도 중심 이동 (초기 로드 시)
  React.useEffect(() => {
    if (currentPosition && mapRef.current && isInitialLoad) {
      // 카카오맵 SDK가 로드되었는지 확인
      if (typeof window !== 'undefined' && window.kakao && window.kakao.maps) {
        try {
          const moveLatLon = new window.kakao.maps.LatLng(currentPosition.lat, currentPosition.lng);
          mapRef.current.panTo(moveLatLon);
          mapRef.current.setLevel(3);
          setCenter({ lat: currentPosition.lat, lng: currentPosition.lng });
          setIsInitialLoad(false);
        } catch (error) {
          console.error('Failed to move map to current location:', error);
          setIsInitialLoad(false);
        }
      }
    }
  }, [currentPosition, isInitialLoad]);

  // 홈에서 검색한 아파트가 있으면 지도로 이동
  React.useEffect(() => {
    if (selectedApartment && mapRef.current && window.kakao && window.kakao.maps) {
      const lat = selectedApartment.lat || selectedApartment.location?.lat;
      const lng = selectedApartment.lng || selectedApartment.location?.lng;
      
      if (lat && lng) {
        console.log('[RealEstateMap] 홈에서 검색한 아파트로 지도 이동:', selectedApartment);
        handleMoveToApartment({ lat, lng });
        
        // 검색 결과에 추가 (마커 표시용)
        const aptData = {
          ...selectedApartment,
          apt_id: selectedApartment.apt_id || selectedApartment.id,
          id: selectedApartment.apt_id || selectedApartment.id,
          name: selectedApartment.name || selectedApartment.apt_name,
          apt_name: selectedApartment.apt_name || selectedApartment.name,
          lat: lat,
          lng: lng,
          address: selectedApartment.address || selectedApartment.location || ''
        };
        
        setSearchResults(prev => {
          const exists = prev.some((item: any) => 
            (item.apt_id && item.apt_id === aptData.apt_id) || 
            (item.id && item.id === aptData.apt_id)
          );
          if (!exists) {
            return [...prev, aptData];
          }
          return prev;
        });
      }
    }
  }, [selectedApartment]);

  // 검색 결과 핸들러 - 지도로만 이동 (상세 페이지는 열지 않음)
  const handleSearchResult = (result: any) => {
    if (result.type === 'apartment' && result.apartment) {
      const apt = result.apartment;
      const aptData = {
        ...apt,
        apt_id: apt.apt_id || apt.id, // apt_id 명시적으로 포함
        id: apt.apt_id || apt.id, // id도 포함 (하위 호환성)
        name: apt.apt_name,
        apt_name: apt.apt_name, // apt_name도 포함
        lat: apt.location?.lat || apt.lat,
        lng: apt.location?.lng || apt.lng,
        address: apt.address || apt.location || ''
      };
      
      // 지도로만 이동 (상세 페이지는 열지 않음)
      handleMoveToApartment(aptData);
      
      // 검색 결과를 지도에 표시할 목록에 추가 (이미 있으면 업데이트)
      // 주의: 전체 검색 결과는 onSearchResultsChange를 통해 유지되므로,
      // 여기서는 클릭한 결과만 확인하여 추가/업데이트
      setSearchResults(prev => {
        const existsIndex = prev.findIndex((item: any) => 
          (item.apt_id && item.apt_id === aptData.apt_id) || 
          (item.id && item.id === aptData.apt_id || item.id === aptData.id)
        );
        if (existsIndex >= 0) {
          // 이미 존재하면 업데이트
          const updated = [...prev];
          updated[existsIndex] = aptData;
          return updated;
        } else {
          // 없으면 추가 (전체 검색 결과는 onSearchResultsChange에서 관리되므로 여기서는 보조적으로만 추가)
          return [...prev, aptData];
        }
      });
    } else if (result.type === 'location' && result.location) {
      const loc = result.location;
      // 지역 검색 시 첫 번째 결과로 지도 이동
      if (mapRef.current && window.kakao && window.kakao.maps) {
        const moveLatLon = new window.kakao.maps.LatLng(loc.center.lat, loc.center.lng);
        mapRef.current.panTo(moveLatLon);
        mapRef.current.setLevel(5); // 지역은 좀 더 넓게
        setCenter({ lat: loc.center.lat, lng: loc.center.lng });
      }
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-100 dark:bg-zinc-900">
      {/* Search Control - Floating on Top Left */}
      <MapSearchControl 
        isDarkMode={isDarkMode} 
        isDesktop={isDesktop} 
        onApartmentSelect={handleSearchResult}
        onSearchResultsChange={setSearchResults}
      />

      {/* Current Location Button */}
      <button
        onClick={handleCurrentLocationClick}
        disabled={locationLoading}
        className={`absolute ${isDesktop ? 'top-24 right-6' : 'top-20 right-4'} z-30 p-3 rounded-full shadow-lg border-2 transition-all active:scale-95 hover:scale-105 ${
          isDarkMode 
            ? 'bg-slate-800/95 border-sky-800/40 hover:bg-slate-700/95 hover:border-sky-700/60' 
            : 'bg-white/95 border-sky-200/60 hover:bg-sky-50/95 hover:border-sky-300'
        } ${locationLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        title="내 위치로 이동"
      >
        <Navigation className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-500'}`} />
      </button>

      {/* Map Area */}
      <div className="w-full h-full">
        <KakaoMap 
          className="w-full h-full"
          center={center}
          level={3}
          apartments={searchResults}
          onMarkerClick={handleApartmentClick}
          onMapLoad={handleMapLoad}
          showCurrentLocation={true}
          currentLocation={currentPosition}
        />
      </div>
    </div>
  );
}