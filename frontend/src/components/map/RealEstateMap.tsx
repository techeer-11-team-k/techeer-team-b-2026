import React, { useState } from 'react';
import KakaoMap from './KakaoMap';
import MapSearchControl from './MapSearchControl';

interface RealEstateMapProps {
  isDarkMode: boolean;
  onApartmentSelect?: (apt: any) => void;
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

export default function RealEstateMap({ isDarkMode, onApartmentSelect, isDesktop = false }: RealEstateMapProps) {
  const [center, setCenter] = useState({ lat: 37.5665, lng: 126.9780 });

  const handleApartmentClick = (apt: any) => {
    if (apt.lat && apt.lng) {
      setCenter({ lat: apt.lat, lng: apt.lng });
    }
    onApartmentSelect?.(apt);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-100 dark:bg-zinc-900">
      {/* Search Control - Floating on Top Left */}
      <MapSearchControl isDarkMode={isDarkMode} isDesktop={isDesktop} />

      {/* Map Area */}
      <div className="w-full h-full">
        <KakaoMap 
          className="w-full h-full"
          center={center}
          level={3}
          apartments={mockApartments}
          onMarkerClick={handleApartmentClick}
        />
      </div>
    </div>
  );
}