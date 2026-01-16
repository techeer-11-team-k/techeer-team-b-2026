import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Navigation, MapPin } from 'lucide-react';
import KakaoMap from './KakaoMap';
import MapSearchControl from './MapSearchControl';
import { UnifiedSearchResult } from '../../hooks/useUnifiedSearch';
import { useGeolocation } from '../../hooks/useGeolocation';

interface RealEstateMapProps {
  isDarkMode: boolean;
  onApartmentSelect?: (apt: any) => void;
  onRegionSelect?: (region: any) => void;
  onShowMoreSearch?: (query: string) => void;
  isDesktop?: boolean;
}

// Mock 데이터 제거 - 검색 결과만 사용

export default function RealEstateMap({ isDarkMode, onApartmentSelect, onRegionSelect, onShowMoreSearch, isDesktop = false }: RealEstateMapProps) {
  const [center, setCenter] = useState({ lat: 37.5665, lng: 126.9780 });
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isRoadviewMode, setIsRoadviewMode] = useState(false);
  const prevQueryRef = useRef<string>('');
  const hasInitializedLocation = useRef<boolean>(false);
  
  // 현재 위치 가져오기
  const { position: currentPosition, getCurrentPosition, requestPermission } = useGeolocation(false);
  
  // 지도 탭에 처음 들어갈 때 현재 위치로 이동
  useEffect(() => {
    const initializeLocation = async () => {
      if (!hasInitializedLocation.current) {
        hasInitializedLocation.current = true;
        const hasPermission = await requestPermission();
        if (hasPermission) {
          const pos = await getCurrentPosition();
          if (pos && pos.lat && pos.lng) {
            setCenter({ lat: pos.lat, lng: pos.lng });
          }
        }
      }
    };
    
    initializeLocation();
  }, [requestPermission, getCurrentPosition]);

  const handleApartmentClick = (apt: any) => {
    if (apt.lat && apt.lng) {
      setCenter({ lat: apt.lat, lng: apt.lng });
    }
    
    // 거리뷰 모드가 아닐 때만 상세 페이지로 이동
    if (!isRoadviewMode && apt.markerType !== 'location') {
      onApartmentSelect?.(apt);
    }
  };
  
  const handleMoveToCurrentLocation = async () => {
    const hasPermission = await requestPermission();
    if (hasPermission) {
      const pos = await getCurrentPosition();
      if (pos && pos.lat && pos.lng) {
        setCenter({ lat: pos.lat, lng: pos.lng });
      }
    }
  };

  const handleSearchResultSelect = (result: UnifiedSearchResult) => {
    if (result.type === 'apartment' && result.apartment) {
      const apt = result.apartment;
      
      // 지도 중심 이동
      if (apt.location && apt.location.lat && apt.location.lng) {
        setCenter({ lat: apt.location.lat, lng: apt.location.lng });
      }
      
      // 아파트 상세 페이지로 이동
      if (onApartmentSelect) {
        onApartmentSelect(apt);
      }
    } else if (result.type === 'location' && result.location) {
      const loc = result.location;
      // 지역 선택 시 지도 중심 이동
      if (loc.center && loc.center.lat && loc.center.lng) {
        setCenter({ lat: loc.center.lat, lng: loc.center.lng });
      }
    }
  };

  const handleSearchResultsChange = React.useCallback((results: any[], query?: string) => {
    // 검색어가 변경되었고 결과가 있을 때만 지도 중심 이동
    const queryChanged = query && prevQueryRef.current !== query;
    const hasResults = results.length > 0;
    
    // 검색 결과가 있을 때만 업데이트
    // 빈 배열이 전달되면 마커를 제거 (명시적으로 지울 때만)
    if (hasResults) {
      setSearchResults(results);
    } else if (query !== undefined && query.length === 0) {
      // 검색어가 명시적으로 비어있을 때만 마커 제거
      setSearchResults([]);
    }
    // 그 외의 경우(빈 배열이지만 query가 undefined이거나 이전과 같은 경우)는 마커 유지
    
    // 새로운 검색어로 검색 결과가 나타났을 때만 첫 번째 결과로 지도 중심 이동
    if (queryChanged && hasResults && results[0].lat && results[0].lng) {
      setCenter({ lat: results[0].lat, lng: results[0].lng });
      prevQueryRef.current = query;
    } else if (query && query.length === 0) {
      // 검색어가 비어있으면 리셋
      prevQueryRef.current = '';
    }
  }, []);

  const handleCenterChange = (newCenter: { lat: number; lng: number }) => {
    setCenter(newCenter);
  };

  // 검색 결과만 사용 (메모이제이션)
  const apartmentsToDisplay = useMemo(() => searchResults, [searchResults]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-100 dark:bg-zinc-900">
      {/* Search Control - Floating on Top Left */}
      <MapSearchControl 
        isDarkMode={isDarkMode} 
        isDesktop={isDesktop}
        onApartmentSelect={handleSearchResultSelect}
        onSearchResultsChange={handleSearchResultsChange}
        onMoveToCurrentLocation={handleMoveToCurrentLocation}
        isRoadviewMode={isRoadviewMode}
        onToggleRoadviewMode={() => setIsRoadviewMode(!isRoadviewMode)}
        onShowMoreSearch={onShowMoreSearch}
      />


      {/* Map Area */}
      <div className="w-full h-full">
        <KakaoMap 
          className="w-full h-full"
          center={center}
          level={3}
          apartments={apartmentsToDisplay}
          onMarkerClick={handleApartmentClick}
          onCenterChange={handleCenterChange}
          showCurrentLocation={true}
          currentLocation={currentPosition}
          isRoadviewMode={isRoadviewMode}
          isDarkMode={isDarkMode}
        />
      </div>
    </div>
  );
}