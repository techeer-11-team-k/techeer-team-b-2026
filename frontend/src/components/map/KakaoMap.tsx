import React, { useEffect, useRef, useState } from 'react';
import { useKakaoLoader } from '../../hooks/useKakaoLoader';
import { useGeolocation } from '../../hooks/useGeolocation';

interface KakaoMapProps {
  onMapLoad?: (map: any) => void;
  className?: string;
  center?: { lat: number; lng: number };
  level?: number;
  apartments?: any[];
  onMarkerClick?: (apt: any) => void;
  showCurrentLocation?: boolean;
  currentLocation?: { lat: number; lng: number } | null;
}

export default function KakaoMap({ 
  onMapLoad, 
  className = "w-full h-full", 
  center = { lat: 37.5665, lng: 126.9780 }, // Seoul City Hall
  level = 3,
  apartments = [],
  onMarkerClick,
  showCurrentLocation = true,
  currentLocation: externalCurrentLocation
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isLoaded, error } = useKakaoLoader();
  const [mapInstance, setMapInstance] = useState<any>(null);
  const markersRef = useRef<Array<{ marker: any; infoWindow: any; labelOverlay: any }>>([]);
  const currentLocationMarkerRef = useRef<any>(null);
  const currentLocationCircleRef = useRef<any>(null);
  const { position: currentPosition, getCurrentPosition, requestPermission } = useGeolocation(false);
  
  // 외부에서 전달된 위치 또는 내부에서 가져온 위치 사용
  const displayLocation = externalCurrentLocation || currentPosition;

  useEffect(() => {
    if (isLoaded && containerRef.current && !mapInstance) {
      console.log('🗺️ [KakaoMap] Initializing map...', containerRef.current);
      const options = {
        center: new window.kakao.maps.LatLng(center.lat, center.lng),
        level: level,
      };
      const map = new window.kakao.maps.Map(containerRef.current, options);
      
      // 레이아웃 강제 재조정 (지도가 깨지는 현상 방지)
      setTimeout(() => {
        map.relayout();
        console.log('🗺️ [KakaoMap] Map layout refreshed');
      }, 100);

      setMapInstance(map);
      
      if (onMapLoad) {
        onMapLoad(map);
      }
    }
  }, [isLoaded, containerRef, mapInstance, onMapLoad, center, level]);

  // Update center
  useEffect(() => {
    if (mapInstance && center) {
      const moveLatLon = new window.kakao.maps.LatLng(center.lat, center.lng);
      mapInstance.panTo(moveLatLon);
    }
  }, [center, mapInstance]);

  // 현재 위치 가져오기 (외부에서 전달되지 않은 경우에만)
  useEffect(() => {
    if (showCurrentLocation && mapInstance && !externalCurrentLocation) {
      const fetchLocation = async () => {
        const hasPermission = await requestPermission();
        if (hasPermission) {
          await getCurrentPosition();
        }
      };
      fetchLocation();
    }
  }, [showCurrentLocation, mapInstance, externalCurrentLocation, requestPermission, getCurrentPosition]);

  // 현재 위치 마커 표시
  useEffect(() => {
    if (mapInstance && displayLocation && showCurrentLocation) {
      // 기존 현재 위치 마커 및 원 제거
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.setMap(null);
        currentLocationMarkerRef.current = null;
      }
      if (currentLocationCircleRef.current) {
        currentLocationCircleRef.current.setMap(null);
        currentLocationCircleRef.current = null;
      }

      const location = new window.kakao.maps.LatLng(displayLocation.lat, displayLocation.lng);
      
      // 현재 위치 원형 영역 표시
      const circleMarker = new window.kakao.maps.Circle({
        center: location,
        radius: 50, // 미터 단위
        strokeWeight: 3,
        strokeColor: '#4285F4',
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
        fillColor: '#4285F4',
        fillOpacity: 0.2
      });
      circleMarker.setMap(mapInstance);
      currentLocationCircleRef.current = circleMarker;

      // 현재 위치 중심 마커 (파란색 원) - 커스텀 오버레이 사용
      const markerContent = document.createElement('div');
      markerContent.style.width = '24px';
      markerContent.style.height = '24px';
      markerContent.style.borderRadius = '50%';
      markerContent.style.backgroundColor = '#4285F4';
      markerContent.style.border = '3px solid #FFFFFF';
      markerContent.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
      markerContent.style.cursor = 'default';
      
      const marker = new window.kakao.maps.CustomOverlay({
        position: location,
        content: markerContent,
        yAnchor: 0.5,
        xAnchor: 0.5
      });
      
      marker.setMap(mapInstance);
      currentLocationMarkerRef.current = marker;
    } else if (mapInstance && !displayLocation && showCurrentLocation) {
      // 위치가 없으면 마커 제거
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.setMap(null);
        currentLocationMarkerRef.current = null;
      }
      if (currentLocationCircleRef.current) {
        currentLocationCircleRef.current.setMap(null);
        currentLocationCircleRef.current = null;
      }
    }
  }, [mapInstance, displayLocation, showCurrentLocation]);

  // Render Markers with InfoWindow
  useEffect(() => {
    if (!mapInstance || !window.kakao || !window.kakao.maps) return;

    // Clear existing markers, info windows, and label overlays (현재 위치 마커 제외)
    markersRef.current.forEach((item: any) => {
      if (item.marker) item.marker.setMap(null);
      if (item.infoWindow) item.infoWindow.close();
      if (item.labelOverlay) item.labelOverlay.setMap(null);
    });
    markersRef.current = [];

    if (apartments.length > 0) {
      console.log('📍 [KakaoMap] Rendering markers:', apartments.length);

      apartments.forEach((apt, index) => {
        if (!apt.lat || !apt.lng) {
          console.warn(`⚠️ [KakaoMap] Marker ${index} has no coordinates:`, apt);
          return;
        }

        try {
          const markerPosition = new window.kakao.maps.LatLng(apt.lat, apt.lng);
          const marker = new window.kakao.maps.Marker({
            position: markerPosition,
            clickable: true
          });

          marker.setMap(mapInstance);
          
          // 아파트명 정보
          const aptName = apt.name || apt.apt_name || '이름 없음';
          const aptAddress = apt.address || apt.location || '';
          const aptPrice = apt.price || '';
          const aptId = apt.apt_id || apt.id;
          
          // onMarkerClick에 전달할 객체에 apt_id 명시적으로 포함
          const aptDataForClick = {
            ...apt,
            apt_id: aptId,
            id: aptId,
            name: aptName,
            apt_name: aptName,
            address: aptAddress,
            location: aptAddress,
            price: aptPrice,
            lat: apt.lat,
            lng: apt.lng
          };
          
          // 마커 위에 아파트명 표시하는 커스텀 오버레이 (라벨)
          const labelContent = document.createElement('div');
          labelContent.style.cssText = `
            padding: 4px 8px;
            background-color: rgba(255, 255, 255, 0.95);
            border: 1px solid #0ea5e9;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            color: #0ea5e9;
            white-space: nowrap;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            cursor: pointer;
            pointer-events: auto;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
          `;
          labelContent.textContent = aptName;
          
          // 라벨 클릭 시에도 상세 페이지로 이동
          labelContent.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onMarkerClick) {
              onMarkerClick(aptDataForClick);
            }
          });
          
          const labelOverlay = new window.kakao.maps.CustomOverlay({
            position: markerPosition,
            content: labelContent,
            yAnchor: 2.2, // 마커 위에 표시
            xAnchor: 0.5,
            zIndex: 10
          });
          
          labelOverlay.setMap(mapInstance);
          
          // 인포윈도우 생성 (상세 페이지 링크 포함)
          // 인포윈도우 내용을 DOM 요소로 생성하여 이벤트 리스너 추가 가능하게 함
          const infoDiv = document.createElement('div');
          infoDiv.style.cssText = 'padding:12px;min-width:200px;';
          
          const nameDiv = document.createElement('div');
          nameDiv.style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:4px;color:#333;';
          nameDiv.textContent = aptName;
          infoDiv.appendChild(nameDiv);
          
          if (aptAddress) {
            const addressDiv = document.createElement('div');
            addressDiv.style.cssText = 'font-size:12px;color:#666;margin-bottom:8px;';
            addressDiv.textContent = aptAddress;
            infoDiv.appendChild(addressDiv);
          }
          
          if (aptPrice) {
            const priceDiv = document.createElement('div');
            priceDiv.style.cssText = 'font-size:13px;color:#0ea5e9;font-weight:bold;margin-bottom:8px;';
            priceDiv.textContent = aptPrice;
            infoDiv.appendChild(priceDiv);
          }
          
          // 상세 정보 보기 버튼
          const detailButton = document.createElement('div');
          detailButton.style.cssText = 'color:#0ea5e9;text-decoration:none;font-size:13px;font-weight:bold;display:block;padding:6px 12px;background:#f0f9ff;border-radius:4px;margin-top:8px;text-align:center;cursor:pointer;';
          detailButton.textContent = '상세 정보 보기';
          detailButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onMarkerClick) {
              onMarkerClick(aptDataForClick);
            }
          });
          infoDiv.appendChild(detailButton);
          
          // 링크 컨테이너
          const linksDiv = document.createElement('div');
          linksDiv.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
          
          const mapLink = document.createElement('a');
          mapLink.href = `https://map.kakao.com/link/map/${encodeURIComponent(aptName)},${apt.lat},${apt.lng}`;
          mapLink.target = '_blank';
          mapLink.style.cssText = 'color:#0ea5e9;text-decoration:none;font-size:12px;';
          mapLink.textContent = '큰지도보기';
          linksDiv.appendChild(mapLink);
          
          const routeLink = document.createElement('a');
          routeLink.href = `https://map.kakao.com/link/to/${encodeURIComponent(aptName)},${apt.lat},${apt.lng}`;
          routeLink.target = '_blank';
          routeLink.style.cssText = 'color:#0ea5e9;text-decoration:none;font-size:12px;';
          routeLink.textContent = '길찾기';
          linksDiv.appendChild(routeLink);
          
          infoDiv.appendChild(linksDiv);
          
          const infoWindow = new window.kakao.maps.InfoWindow({
            content: infoDiv,
            removable: true
          });

          // 마커 클릭 시 인포윈도우 표시 및 상세 페이지로 이동
          window.kakao.maps.event.addListener(marker, 'click', () => {
              // 다른 인포윈도우 닫기
              markersRef.current.forEach((item: any) => {
                  if (item.infoWindow) item.infoWindow.close();
              });
              
              infoWindow.open(mapInstance, marker);
              
              // 상세 페이지로 이동
              if (onMarkerClick) {
                  onMarkerClick(aptDataForClick);
              }
          });

          markersRef.current.push({ marker, infoWindow, labelOverlay });
        } catch (error) {
          console.error(`❌ [KakaoMap] Failed to create marker for ${apt.name || apt.apt_name}:`, error);
        }
      });
      
      console.log(`✅ [KakaoMap] ${markersRef.current.length} markers rendered`);
    }
  }, [mapInstance, apartments, onMarkerClick]);

  if (error) {
    return (
      <div className={`${className} flex flex-col items-center justify-center bg-red-50 text-red-600 border-2 border-red-200 p-4 rounded-lg`} style={{ minHeight: '300px' }}>
        <p className="font-bold text-lg mb-2">❌ 지도를 불러오는데 실패했습니다.</p>
        <p className="text-sm">API 키 설정이나 네트워크 상태를 확인해주세요.</p>
        <p className="text-xs mt-4 text-gray-500 bg-gray-100 p-2 rounded">
           Tip: frontend/.env 파일에 VITE_KAKAO_JAVASCRIPT_KEY가 설정되어 있는지 확인하세요.
        </p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className={className} 
      id="map"
      style={{ width: '100%', height: '100%', minHeight: '500px', backgroundColor: '#f3f4f6' }}
    >
      {!isLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500 font-medium">지도를 불러오는 중...</p>
        </div>
      )}
    </div>
  );
}
