import React, { useState, useRef, useEffect } from 'react';
import { Search, Sparkles, SlidersHorizontal, Map } from 'lucide-react';
import { ViewProps } from '../../types';
import { MapSideDetail } from '../MapSideDetail';
import { useKakaoLoader } from '../../hooks/useKakaoLoader';
import { fetchCompareApartments, fetchTrendingApartments, searchApartments } from '../../services/api';

interface MapApartment {
  id: string;
  aptId: number;
  name: string;
  priceLabel: string;
  priceValue?: number | null;
  change?: number;
  location: string;
  area?: string;
  isSpeculationArea?: boolean;
  lat: number;
  lng: number;
}

const formatPriceLabel = (price?: number | null) => {
  if (!price && price !== 0) return '-';
  return `${price.toFixed(1)}억`;
};

export const MapExplorer: React.FC<ViewProps> = ({ onPropertyClick, onToggleDock }) => {
  const [isAiActive, setIsAiActive] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [mapApartments, setMapApartments] = useState<MapApartment[]>([]);
  
  const topBarRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const overlaysRef = useRef<any[]>([]);
  const clustererRef = useRef<any>(null);
  const { isLoaded: kakaoLoaded } = useKakaoLoader();

  useEffect(() => {
    if (!kakaoLoaded || !mapContainerRef.current || mapRef.current) return;
    
    const defaultCenter = new window.kakao.maps.LatLng(37.5665, 126.9780);
    mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
      center: defaultCenter,
      level: 6
    });
    
    // 마커 클러스터러 생성
    const kakaoMaps = window.kakao.maps as any;
    clustererRef.current = new kakaoMaps.MarkerClusterer({
      map: mapRef.current,
      averageCenter: true, // 클러스터에 포함된 마커들의 평균 위치를 클러스터 마커 위치로 설정
      minLevel: 10, // 클러스터 할 최소 지도 레벨
      disableClickZoom: true // 클러스터 마커를 클릭했을 때 지도가 확대되지 않도록 설정
    });
    
    // 클러스터 클릭 이벤트 등록
    kakaoMaps.event.addListener(clustererRef.current, 'clusterclick', (cluster: any) => {
      // 현재 지도 레벨에서 1레벨 확대한 레벨
      const level = mapRef.current.getLevel() - 1;
      // 지도를 클릭된 클러스터의 마커의 위치를 기준으로 확대
      mapRef.current.setLevel(level, { anchor: cluster.getCenter() });
    });
    
    // 지도 레벨 변경 이벤트 - 가격 라벨 표시/숨김
    kakaoMaps.event.addListener(mapRef.current, 'zoom_changed', () => {
      const currentLevel = mapRef.current.getLevel();
      overlaysRef.current.forEach((overlay) => {
        if (currentLevel < 7) {
          overlay.setMap(mapRef.current);
        } else {
          overlay.setMap(null);
        }
      });
    });
  }, [kakaoLoaded]);

  useEffect(() => {
    if (!mapRef.current || !clustererRef.current) return;
    
    // 기존 마커 제거 (클러스터러에서)
    clustererRef.current.clear();
    markersRef.current = [];
    
    // 기존 오버레이 제거
    overlaysRef.current.forEach((overlay) => {
      overlay.setMap(null);
    });
    overlaysRef.current = [];
    
    const markers: any[] = [];
    
    mapApartments.forEach((apt) => {
      const position = new window.kakao.maps.LatLng(apt.lat, apt.lng);
      
      // 마커 생성 (클러스터러로 관리할 마커는 지도 객체를 설정하지 않음)
      const marker = new window.kakao.maps.Marker({
        position: position
      });
      
      markers.push(marker);
      markersRef.current.push(marker);
      
      // 마커 클릭 이벤트
      window.kakao.maps.event.addListener(marker, 'click', () => {
        handleMarkerClick(apt.id);
      });
      
      // 가격 라벨 오버레이 생성
      const priceContent = document.createElement('div');
      priceContent.innerHTML = `
        <div style="
          background: #3B82F6;
          color: white;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          transform: translateY(-8px);
        ">${apt.priceLabel}</div>
      `;
      
      const overlay = new window.kakao.maps.CustomOverlay({
        position: position,
        content: priceContent,
        yAnchor: 2.5 // 마커 위에 위치하도록 조정
      });
      
      // 현재 지도 레벨이 7 미만일 때만 가격 라벨 표시
      const currentLevel = mapRef.current.getLevel();
      if (currentLevel < 7) {
        overlay.setMap(mapRef.current);
      }
      overlaysRef.current.push(overlay);
    });
    
    // 클러스터러에 마커들을 추가
    clustererRef.current.addMarkers(markers);
  }, [mapApartments, selectedMarkerId]);

  const handleMarkerClick = (id: string) => {
    const isSelecting = selectedMarkerId !== id;
    setSelectedMarkerId(isSelecting ? id : null);
    if (onToggleDock) onToggleDock(!isSelecting);
  };

  const handleCloseDetail = () => {
    setSelectedMarkerId(null);
    if (onToggleDock) onToggleDock(true);
  };

  const fetchCompareMap = async (aptIds: number[]) => {
    const priceMap = new globalThis.Map<number, number | null>();
    for (let i = 0; i < aptIds.length; i += 5) {
      const chunk = aptIds.slice(i, i + 5);
      const compare = await fetchCompareApartments(chunk);
      compare.apartments.forEach((apt) => {
        priceMap.set(apt.id, apt.price ?? null);
      });
    }
    return priceMap;
  };

  const loadTrendingApartments = async () => {
    try {
      setLoadError(null);
      const trending = await fetchTrendingApartments(10);
      const items = trending.data.apartments;
      const ids = items.map((item) => item.apt_id);
      const priceMap = await fetchCompareMap(ids);
      
      const mapped = items
        .filter((item) => item.location)
        .map((item) => {
          const priceValue = priceMap.get(item.apt_id) ?? null;
          return {
            id: String(item.apt_id),
            aptId: item.apt_id,
            name: item.apt_name,
            priceLabel: formatPriceLabel(priceValue),
            priceValue,
            location: item.address || '',
            lat: item.location?.lat || 0,
            lng: item.location?.lng || 0,
            isSpeculationArea: false
          } as MapApartment;
        });
      
      setMapApartments(mapped);
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
        ? error 
        : '지도 데이터를 불러오지 못했습니다.';
      setLoadError(errorMessage);
      
      // 5초 후 에러 메시지 자동 제거
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(() => {
        setLoadError(null);
      }, 5000);
    }
  };

  useEffect(() => {
    // 컴포넌트 마운트 시 에러 상태 초기화
    setLoadError(null);
    loadTrendingApartments();
    
    // cleanup: 컴포넌트 언마운트 시 타이머 정리
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  const handleSearchSubmit = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      setLoadError(null);
      const response = await searchApartments(searchQuery.trim(), 10);
      const results = response.data.results;
      
      if (!results.length) {
        setMapApartments([]);
        return;
      }
      
      const ids = results.map((item) => item.apt_id);
      const priceMap = await fetchCompareMap(ids.slice(0, 5));
      
      const mapped = results
        .filter((item) => item.location)
        .map((item) => {
          const priceValue = priceMap.get(item.apt_id) ?? null;
          return {
            id: String(item.apt_id),
            aptId: item.apt_id,
            name: item.apt_name,
            priceLabel: formatPriceLabel(priceValue),
            priceValue,
            location: item.address || '',
            lat: item.location?.lat || 0,
            lng: item.location?.lng || 0,
            isSpeculationArea: false
          } as MapApartment;
        });
      
      setMapApartments(mapped);
      
      const first = mapped[0];
      if (first && mapRef.current) {
        const center = new window.kakao.maps.LatLng(first.lat, first.lng);
        mapRef.current.setCenter(center);
        mapRef.current.setLevel(5);
      }
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
        ? error 
        : '검색 중 오류가 발생했습니다.';
      setLoadError(errorMessage);
      
      // 5초 후 에러 메시지 자동 제거
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(() => {
        setLoadError(null);
      }, 5000);
    }
  };

  const selectedProperty = selectedMarkerId
    ? mapApartments.find((apt) => apt.id === selectedMarkerId) || null
    : null;

  return (
    <div 
      className="fixed inset-0 w-full h-full overflow-hidden shadow-none bg-slate-100"
      onClick={() => { if (selectedMarkerId) handleCloseDetail(); }}
    >
      <div 
        ref={topBarRef}
        className={`absolute md:top-24 md:left-16 md:translate-x-0 md:w-[600px] top-5 left-4 right-4 z-20 flex flex-col gap-2 transition-all duration-300 opacity-100`}
        onClick={(e) => e.stopPropagation()} 
      >
        <div className="flex gap-2 w-full">
            <div className="relative flex-1 h-[60px] rounded-xl shadow-deep md:shadow-sharp transition-all duration-300 transform bg-white">
                <div className="absolute inset-0 bg-white rounded-xl flex items-center overflow-hidden z-10 px-4 border border-slate-200/50">
                    <div className="w-10 h-full flex items-center justify-center flex-shrink-0">
                         <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    
                    <input 
                        type="text" 
                        className="flex-1 py-4 px-3 border-none bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-0 text-[16px] font-medium min-w-0" 
                        placeholder={isAiActive ? "AI에게 물어보세요..." : "지역, 아파트 검색"} 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSearchSubmit();
                          }
                        }}
                    />
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                         <button 
                            onClick={() => setIsAiActive(!isAiActive)}
                            className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-all ${isAiActive ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                         >
                             <Sparkles className={`w-5 h-5 ${isAiActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                         </button>

                         <div className="w-px h-5 bg-slate-200"></div>

                         <button 
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            className={`p-2 rounded-lg transition-all duration-200 ${isSettingsOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                             <SlidersHorizontal className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            <button className="hidden md:flex w-[60px] h-[60px] rounded-xl bg-white border border-slate-200 shadow-sharp items-center justify-center text-slate-600 hover:text-blue-600 transition-colors active:scale-95">
                <Map className="w-6 h-6" />
            </button>
        </div>

        {(isSettingsOpen || isAiActive) && (
            <div className="bg-white/95 backdrop-blur-xl rounded-xl p-4 shadow-deep border border-slate-100 animate-slide-up origin-top">
                {isAiActive ? (
                    <div className="space-y-3">
                         <p className="text-[13px] font-bold text-indigo-500 mb-2 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> AI 추천 질문
                         </p>
                         <div className="flex flex-wrap gap-2">
                             {['한강뷰 아파트 찾아줘', '5억 이하 갭투자', '학군 좋은 곳'].map(q => (
                                 <button key={q} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[13px] font-bold hover:bg-indigo-100 transition-colors">
                                     {q}
                                 </button>
                             ))}
                         </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                         <div className="flex justify-between items-center">
                             <span className="text-[15px] font-bold text-slate-700">매매/전세</span>
                             <div className="flex bg-slate-100 rounded-lg p-0.5">
                                 <button className="px-3 py-1.5 bg-white rounded-md shadow-sm text-[13px] font-bold text-slate-900">매매</button>
                                 <button className="px-3 py-1.5 text-slate-400 text-[13px] font-bold hover:text-slate-600">전세</button>
                             </div>
                         </div>
                    </div>
                )}
            </div>
        )}
      </div>

      <div className={`absolute inset-0 w-full h-full bg-[#e3e8f0] transition-all duration-500 ${selectedMarkerId ? 'md:pr-[504px]' : ''}`}>
        <div ref={mapContainerRef} className="absolute inset-0" />
        {loadError && typeof loadError === 'string' && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 bg-white/90 border border-slate-200 rounded-lg px-4 py-2 text-[13px] font-bold text-red-500 shadow-soft z-20">
            {loadError}
          </div>
        )}
      </div>

      <div className={`md:hidden fixed inset-x-0 bottom-0 z-[100] transform transition-transform duration-300 cubic-bezier(0.16, 1, 0.3, 1) ${selectedProperty ? 'translate-y-0' : 'translate-y-full'}`} onClick={(e) => e.stopPropagation()}>
           <div className="bg-white/95 backdrop-blur-2xl rounded-t-[24px] p-6 shadow-deep border-t border-slate-100 pb-10">
               <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6"></div>
               {selectedProperty && (
                   <div onClick={() => onPropertyClick(String(selectedProperty.aptId))}>
                       <div className="flex justify-between items-start mb-4">
                           <div>
                               <h3 className="text-xl font-black text-slate-900 leading-tight mb-1">{selectedProperty.name}</h3>
                               <p className="text-slate-500 font-medium text-[15px]">{selectedProperty.location}</p>
                           </div>
                       </div>
                       <div className="flex items-end gap-2 mb-6">
                           <span className="text-2xl font-black text-slate-900 tabular-nums">{selectedProperty.priceLabel}</span>
                       </div>
                       <button className="w-full bg-deep-900 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2 text-[15px]">
                           상세 정보 전체보기
                       </button>
                   </div>
               )}
           </div>
      </div>

      <div 
        className={`hidden md:block fixed right-0 w-[504px] z-50 shadow-deep transform transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${selectedMarkerId ? 'translate-x-0' : 'translate-x-full'} rounded-tl-3xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
        style={{ 
          top: '5.5rem',
          bottom: '0',
          borderLeft: '1px solid #e2e8f0',
          background: `
            radial-gradient(1200px circle at 50% 40%, rgba(248, 250, 252, 0.8) 0%, transparent 60%),
            radial-gradient(900px circle at 70% 10%, rgba(147, 197, 253, 0.15) 0%, transparent 55%), 
            radial-gradient(800px circle at 30% 80%, rgba(196, 181, 253, 0.12) 0%, transparent 50%),
            linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)
          `
        }}
      >
          {selectedMarkerId && selectedProperty && (
              <MapSideDetail 
                  propertyId={selectedMarkerId} 
                  propertyData={{
                    id: selectedProperty.id,
                    name: selectedProperty.name,
                    location: selectedProperty.location,
                    isSpeculationArea: selectedProperty.isSpeculationArea
                  }}
                  onClose={handleCloseDetail}
                  onOpenDetail={onPropertyClick}
              />
          )}
      </div>

    </div>
  );
};