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
  const [mapApartments, setMapApartments] = useState<MapApartment[]>([]);
  
  const topBarRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const { isLoaded: kakaoLoaded } = useKakaoLoader();

  useEffect(() => {
    if (!kakaoLoaded || !mapContainerRef.current || mapRef.current) return;
    
    const defaultCenter = new window.kakao.maps.LatLng(37.5665, 126.9780);
    mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
      center: defaultCenter,
      level: 6
    });
  }, [kakaoLoaded]);

  useEffect(() => {
    if (!mapRef.current) return;
    
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    
    mapApartments.forEach((apt) => {
      const position = new window.kakao.maps.LatLng(apt.lat, apt.lng);
      const container = document.createElement('div');
      container.className = `relative group cursor-pointer transition-all duration-300 ${
        selectedMarkerId === apt.id ? 'z-30 scale-110' : 'z-10 hover:z-20 hover:scale-105'
      }`;
      
      const badge = document.createElement('div');
      badge.className = `px-4 py-2 rounded-full flex items-center justify-center border transition-all ${
        selectedMarkerId === apt.id
          ? 'bg-deep-900 text-white border-white ring-4 ring-indigo-500/20 shadow-pop'
          : 'bg-white text-slate-900 border-white/80 hover:bg-deep-900 hover:text-white shadow-pop'
      }`;
      
      const label = document.createElement('span');
      label.className = 'text-[13px] font-black tabular-nums';
      label.textContent = apt.priceLabel;
      
      badge.appendChild(label);
      container.appendChild(badge);
      
      if (selectedMarkerId === apt.id) {
        const ping = document.createElement('div');
        ping.className = 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-indigo-500/30 rounded-full animate-ping pointer-events-none';
        container.appendChild(ping);
      }
      
      container.addEventListener('click', (e) => {
        e.stopPropagation();
        handleMarkerClick(apt.id);
      });
      
      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content: container,
        yAnchor: 1
      });
      
      overlay.setMap(mapRef.current);
      overlaysRef.current.push(overlay);
    });
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
      setLoadError(error instanceof Error ? error.message : '지도 데이터를 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    loadTrendingApartments();
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
      setLoadError(error instanceof Error ? error.message : '검색 중 오류가 발생했습니다.');
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
        {loadError && (
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