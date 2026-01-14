import React, { useEffect, useRef, useState } from 'react';
import { useKakaoLoader } from '../../hooks/useKakaoLoader';

interface KakaoMapProps {
  onMapLoad?: (map: any) => void;
  className?: string;
  center?: { lat: number; lng: number };
  level?: number;
  apartments?: any[];
  onMarkerClick?: (apt: any) => void;
}

export default function KakaoMap({ 
  onMapLoad, 
  className = "w-full h-full", 
  center = { lat: 37.5665, lng: 126.9780 }, // Seoul City Hall
  level = 3,
  apartments = [],
  onMarkerClick
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isLoaded, error } = useKakaoLoader();
  const [mapInstance, setMapInstance] = useState<any>(null);
  const markersRef = useRef<any[]>([]);

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

  // Render Markers
  useEffect(() => {
    if (mapInstance && apartments.length > 0) {
      // Clear existing markers
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];

      apartments.forEach(apt => {
        if (!apt.lat || !apt.lng) return;

        const markerPosition = new window.kakao.maps.LatLng(apt.lat, apt.lng);
        const marker = new window.kakao.maps.Marker({
          position: markerPosition,
          clickable: true
        });

        marker.setMap(mapInstance);
        markersRef.current.push(marker);

        if (onMarkerClick) {
          window.kakao.maps.event.addListener(marker, 'click', () => {
            onMarkerClick(apt);
          });
        }
        
        // Optional: Add Custom Overlay for price
        const content = `
          <div style="
            padding: 5px 10px;
            background-color: white;
            border: 1px solid #ccc;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            color: #333;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            transform: translateY(-40px);
          ">
            ${apt.price}
          </div>
        `;

        const customOverlay = new window.kakao.maps.CustomOverlay({
          position: markerPosition,
          content: content,
          yAnchor: 1 
        });
        
        customOverlay.setMap(mapInstance);
      });
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
