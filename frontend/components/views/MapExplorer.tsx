import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Sparkles, SlidersHorizontal, Map, X, Clock, TrendingUp, Building2, MapPin, Loader2, Navigation, ChevronDown, Car, Timer, Route, Circle, TrainFront } from 'lucide-react';
import { ViewProps } from '../../types';
import { MapSideDetail } from '../MapSideDetail';
import { useKakaoLoader } from '../../hooks/useKakaoLoader';
import { 
  fetchCompareApartments, 
  fetchTrendingApartments, 
  searchApartments, 
  ApartmentSearchItem, 
  TrendingApartmentItem, 
  aiSearchApartments, 
  AISearchApartment,
  fetchMapBoundsData,
  MapBoundsRequest,
  RegionPriceItem,
  ApartmentPriceItem,
  fetchDirections,
  fetchPlacesByCategory,
  fetchPlacesByKeyword
} from '../../services/api';

// 쿠키 관련 상수
const COOKIE_KEY_RECENT_SEARCHES = 'map_recent_searches';
const MAX_COOKIE_SEARCHES = 5;

// 지하철 노선 색상 매핑
const getSubwayColor = (lineName: string): string => {
  if (lineName.includes('1호선')) return '#0052A4';
  if (lineName.includes('2호선')) return '#00A84D';
  if (lineName.includes('3호선')) return '#EF7C1C';
  if (lineName.includes('4호선')) return '#00A5DE';
  if (lineName.includes('5호선')) return '#996CAC';
  if (lineName.includes('6호선')) return '#CD7C2F';
  if (lineName.includes('7호선')) return '#747F00';
  if (lineName.includes('8호선')) return '#E6186C';
  if (lineName.includes('9호선')) return '#BB8336';
  if (lineName.includes('신분당')) return '#D4003B';
  if (lineName.includes('수인분당')) return '#F5A200';
  if (lineName.includes('경의중앙')) return '#77C4A3';
  if (lineName.includes('경춘')) return '#0C8E72';
  if (lineName.includes('공항')) return '#0090D2';
  if (lineName.includes('의정부')) return '#FD8100';
  if (lineName.includes('에버')) return '#77C4A3';
  if (lineName.includes('경강')) return '#0C8E72';
  if (lineName.includes('서해')) return '#81A914';
  if (lineName.includes('GTX-A')) return '#9A6292';
  return '#F59E0B'; // 기본값 (주황)
};

// 쿠키에서 최근 검색어 읽기
const getRecentSearchesFromCookie = (): string[] => {
  if (typeof document === 'undefined') return [];
  
  const cookies = document.cookie.split(';');
  const cookie = cookies.find(c => c.trim().startsWith(`${COOKIE_KEY_RECENT_SEARCHES}=`));
  
  if (!cookie) return [];
  
  try {
    const value = cookie.split('=')[1];
    const decoded = decodeURIComponent(value);
    return JSON.parse(decoded);
  } catch {
    return [];
  }
};

// 쿠키에 최근 검색어 저장
const saveRecentSearchToCookie = (searchTerm: string): void => {
  if (typeof document === 'undefined' || !searchTerm || searchTerm.trim().length === 0) return;
  
  const trimmedTerm = searchTerm.trim();
  const currentSearches = getRecentSearchesFromCookie();
  
  const filtered = currentSearches.filter(term => term !== trimmedTerm);
  const updated = [trimmedTerm, ...filtered].slice(0, MAX_COOKIE_SEARCHES);
  
  const expires = new Date();
  expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
  const cookieValue = encodeURIComponent(JSON.stringify(updated));
  document.cookie = `${COOKIE_KEY_RECENT_SEARCHES}=${cookieValue};expires=${expires.toUTCString()};path=/`;
};

// 쿠키에서 최근 검색어 삭제
const deleteRecentSearchFromCookie = (searchTerm: string): void => {
  if (typeof document === 'undefined') return;
  
  const currentSearches = getRecentSearchesFromCookie();
  const updated = currentSearches.filter(term => term !== searchTerm);
  
  if (updated.length === 0) {
    document.cookie = `${COOKIE_KEY_RECENT_SEARCHES}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  } else {
    const expires = new Date();
    expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
    const cookieValue = encodeURIComponent(JSON.stringify(updated));
    document.cookie = `${COOKIE_KEY_RECENT_SEARCHES}=${cookieValue};expires=${expires.toUTCString()};path=/`;
  }
};

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

// 가격에 따른 색상 반환
const getPriceColor = (price: number, isRegion = false): string => {
  if (isRegion) {
    // 지역 오버레이는 파란색 계열
    if (price >= 15) return 'rgba(30, 64, 175, 0.95)';  // 15억 이상
    if (price >= 10) return 'rgba(37, 99, 235, 0.95)';  // 10억 이상
    if (price >= 5) return 'rgba(59, 130, 246, 0.95)';  // 5억 이상
    return 'rgba(96, 165, 250, 0.95)';  // 5억 미만
  } else {
    // 아파트 오버레이는 더 다양한 색상
    if (price >= 20) return 'rgba(127, 29, 29, 0.95)';  // 20억 이상 - 진한 빨강
    if (price >= 15) return 'rgba(185, 28, 28, 0.95)';  // 15억 이상 - 빨강
    if (price >= 10) return 'rgba(234, 88, 12, 0.95)';  // 10억 이상 - 주황
    if (price >= 5) return 'rgba(59, 130, 246, 0.95)';  // 5억 이상 - 파랑
    return 'rgba(34, 197, 94, 0.95)';  // 5억 미만 - 초록
  }
};

// 확대 레벨에 따른 데이터 타입 결정
// 카카오맵: 레벨이 낮을수록 확대, 높을수록 축소
// - 레벨 10 이상 (축소): 시/도
// - 레벨 7~9: 시군구
// - 레벨 5~6: 동
// - 레벨 1~4 (확대): 아파트
const getDataTypeByZoom = (zoomLevel: number): 'sido' | 'sigungu' | 'dong' | 'apartment' => {
  if (zoomLevel >= 10) return 'sido';
  if (zoomLevel >= 7) return 'sigungu';
  if (zoomLevel >= 5) return 'dong';
  return 'apartment';
};

export const MapExplorer: React.FC<ViewProps> = ({ onPropertyClick, onToggleDock }) => {
  const [isAiActive, setIsAiActive] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [mapApartments, setMapApartments] = useState<MapApartment[]>([]);
  const [transactionType, setTransactionType] = useState<'sale' | 'jeonse'>('sale');
  const [currentZoomLevel, setCurrentZoomLevel] = useState(7);
  const [isLoadingMapData, setIsLoadingMapData] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  
  // 검색 패널 상태
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchResults, setSearchResults] = useState<ApartmentSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingList, setTrendingList] = useState<TrendingApartmentItem[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'trending'>('recent');
  const [aiResults, setAiResults] = useState<AISearchApartment[]>([]);
  const [isAiSearching, setIsAiSearching] = useState(false);
  
  // 검색 필터 상태
  const [filterMinPrice, setFilterMinPrice] = useState<string>('');
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>('');
  const [filterMinArea, setFilterMinArea] = useState<string>('');
  const [filterMaxArea, setFilterMaxArea] = useState<string>('');
  const [isFilterActive, setIsFilterActive] = useState(false);
  
  const topBarRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const overlaysRef = useRef<any[]>([]);
  const regionOverlaysRef = useRef<any[]>([]);
  const clustererRef = useRef<any>(null);
  const clusterOverlaysRef = useRef<any[]>([]);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const mapDataDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const userMarkerRef = useRef<any>(null);
  const { isLoaded: kakaoLoaded } = useKakaoLoader();

  // 쿠키에서 최근 검색어 로드
  useEffect(() => {
    const searches = getRecentSearchesFromCookie();
    setRecentSearches(searches);
  }, []);
  
  // 검색창 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // 급상승 아파트 로드
  const loadTrendingList = useCallback(async () => {
    if (trendingList.length > 0) return;
    setIsLoadingTrending(true);
    try {
      const response = await fetchTrendingApartments(10);
      setTrendingList(response.data.apartments);
    } catch (error) {
      console.error('Failed to load trending:', error);
    } finally {
      setIsLoadingTrending(false);
    }
  }, [trendingList.length]);
  
  // 탭이 급상승으로 변경될 때 로드
  useEffect(() => {
    if (activeTab === 'trending' && isSearchExpanded) {
      loadTrendingList();
    }
  }, [activeTab, isSearchExpanded, loadTrendingList]);
  
  // 실시간 검색
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setAiResults([]);
      return;
    }
    
    searchDebounceRef.current = setTimeout(async () => {
      if (isAiActive) {
        // AI 검색
        if (searchQuery.length >= 5) {
          setIsAiSearching(true);
          try {
            const response = await aiSearchApartments(searchQuery);
            setAiResults(response.data.apartments);
          } catch (error) {
            console.error('AI search failed:', error);
            setAiResults([]);
          } finally {
            setIsAiSearching(false);
          }
        }
      } else {
        // 일반 검색 (아파트 + 장소)
        setIsSearching(true);
        try {
          const [aptResponse, placeResponse] = await Promise.all([
            searchApartments(searchQuery, 5),
            fetchPlacesByKeyword(searchQuery, { size: 5 })
          ]);
          
          const places = placeResponse.documents ? placeResponse.documents.map((p: any) => ({
            apt_id: p.id,
            apt_name: p.place_name,
            address: p.road_address_name || p.address_name,
            location: { lat: Number(p.y), lng: Number(p.x) },
            type: 'place',
            category: p.category_group_name
          })) : [];
          
          setSearchResults([...places, ...aptResponse.data.results]);
        } catch (error) {
          console.error('Search failed:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }
    }, 300);
    
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, isAiActive]);

  // 길찾기 관련 상태 및 Refs
  const [isDirectionsMode, setIsDirectionsMode] = useState(false);
  const [isDirectionsMinimized, setIsDirectionsMinimized] = useState(false);
  const [directionsData, setDirectionsData] = useState<any>(null);
  const [isLoadingDirections, setIsLoadingDirections] = useState(false);
  const polylineRef = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const endMarkerRef = useRef<any>(null);
  const routeOverlaysRef = useRef<any[]>([]);
  
  // 카테고리 마커 Refs (지하철)
  const stationOverlaysRef = useRef<any[]>([]);

  // 길찾기 오버레이 제거
  const clearRouteOverlays = useCallback(() => {
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    if (startMarkerRef.current) {
      startMarkerRef.current.setMap(null);
      startMarkerRef.current = null;
    }
    if (endMarkerRef.current) {
      endMarkerRef.current.setMap(null);
      endMarkerRef.current = null;
    }
    routeOverlaysRef.current.forEach((overlay: any) => {
      overlay.setMap(null);
    });
    routeOverlaysRef.current = [];
    
    setDirectionsData(null);
    setIsDirectionsMode(false);
  }, []);

  // 맵 데이터 오버레이(아파트, 지역 등) 제거
  const clearMapDataOverlays = useCallback(() => {
    // 지역 오버레이 제거
    regionOverlaysRef.current.forEach((overlay: any) => {
      overlay.setMap(null);
    });
    regionOverlaysRef.current = [];
    
    // 아파트 오버레이 제거
    overlaysRef.current.forEach((overlay: any) => {
      overlay.setMap(null);
    });
    overlaysRef.current = [];
    
    // 클러스터 오버레이 제거
    clusterOverlaysRef.current.forEach((overlay: any) => {
      overlay.setMap(null);
    });
    clusterOverlaysRef.current = [];
    
    // 마커 제거
    markersRef.current.forEach((marker: any) => {
      marker.setMap(null);
    });
    markersRef.current = [];
    
    // 클러스터러 초기화
    if (clustererRef.current) {
      clustererRef.current.clear();
    }
  }, []);
  
  // 카테고리 마커(지하철) 제거
  const clearCategoryOverlays = useCallback(() => {
    stationOverlaysRef.current.forEach((overlay: any) => {
      overlay.setMap(null);
    });
    stationOverlaysRef.current = [];
  }, []);

  // 모든 오버레이 제거 (초기화용)
  const clearAllOverlays = useCallback(() => {
    clearRouteOverlays();
    clearMapDataOverlays();
    clearCategoryOverlays();
  }, [clearRouteOverlays, clearMapDataOverlays, clearCategoryOverlays]);

  // 카테고리 장소 마커 업데이트 함수
  const updatePlacesMarkers = useCallback(async (
    categoryCode: string, 
    map: any, 
    overlaysRef: React.MutableRefObject<any[]>,
    style: { bgColor?: string, colorCallback?: (name: string) => string, icon: string, label: string }
  ) => {
    if (!map) return;
    
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const rect = `${sw.getLng()},${sw.getLat()},${ne.getLng()},${ne.getLat()}`;
    
    try {
      const response = await fetchPlacesByCategory(categoryCode, { rect });
      
      // 데이터가 있을 때만 기존 마커 제거 및 업데이트
      if (response.documents) {
        // 기존 마커 제거
        overlaysRef.current.forEach((overlay: any) => {
          overlay.setMap(null);
        });
        overlaysRef.current = [];
        
        const kakaoMaps = window.kakao.maps as any;
        
        response.documents.forEach((place: any) => {
          const position = new kakaoMaps.LatLng(place.y, place.x);
          
          let bgColor = style.bgColor || '#F59E0B';
          
          if (style.colorCallback) {
             // 카테고리 이름에서 노선명 추출 (예: "교통,수송 > 지하철 > 수도권 4호선")
             const categoryParts = place.category_name.split('>');
             const lineName = categoryParts[categoryParts.length - 1].trim();
             bgColor = style.colorCallback(lineName);
          }
          
          // 이름 단순화 (호선 정보 제거)
          const simpleName = place.place_name.replace(/\s+\d+호선.*$/, '').replace(/\s+\S+선.*$/, '');

          const content = document.createElement('div');
          content.className = 'place-overlay';
          content.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px 8px;
            background: ${bgColor};
            border-radius: 12px;
            color: white;
            font-size: 11px;
            font-weight: 600;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            border: 1.5px solid white;
            white-space: nowrap;
            gap: 4px;
            cursor: pointer;
          `;
          
          content.innerHTML = `
            ${style.icon}
            <span>${simpleName}</span>
          `;
          
          content.onclick = (e) => {
            e.stopPropagation();
            map.setCenter(position);
          };
          
          const overlay = new kakaoMaps.CustomOverlay({
            position: position,
            content: content,
            map: map,
            yAnchor: 1.2,
            zIndex: 5
          });
          
          overlaysRef.current.push(overlay);
        });
      }
    } catch (error) {
      console.error(`Failed to fetch places for ${categoryCode}:`, error);
    }
  }, []);

  // 길찾기 실행 함수
  const handleDirectionsClick = async () => {
    // 이미 길찾기 모드라면 종료
    if (isDirectionsMode) {
      clearRouteOverlays();
      return;
    }

    const selectedApt = mapApartments.find(apt => apt.id === selectedMarkerId);
    if (!selectedApt) {
      setLoadError('도착지가 선택되지 않았습니다.');
      return;
    }

    if (!userLocation && !isLocating) {
      getCurrentLocation();
      // 위치를 가져올 때까지 잠시 대기하거나 사용자에게 알림
      // 여기서는 getCurrentLocation이 비동기 결과를 바로 반환하지 않으므로
      // userLocation 상태가 업데이트될 때까지 기다려야 함.
      // 일단 간단히 에러 메시지 표시
      if (!userLocation) {
        setLoadError('현재 위치를 먼저 확인해주세요.');
        return;
      }
    }

    if (!userLocation) {
       setLoadError('현재 위치를 알 수 없습니다.');
       return;
    }

    setIsLoadingDirections(true);
    try {
      const origin = `${userLocation.lng},${userLocation.lat},name=내 위치`;
      const destination = `${selectedApt.lng},${selectedApt.lat},name=${selectedApt.name}`;
      
      const response = await fetchDirections(origin, destination);
      
      if (response.routes && response.routes.length > 0) {
        const route = response.routes[0];
        setDirectionsData(route);
        setIsDirectionsMode(true);
        
        const kakaoMaps = window.kakao.maps as any;
        
        // 경로 그리기
        const linePath: any[] = [];
        route.sections.forEach((section: any) => {
          section.roads.forEach((road: any) => {
            for (let i = 0; i < road.vertexes.length; i += 2) {
              const x = road.vertexes[i];
              const y = road.vertexes[i + 1];
              linePath.push(new kakaoMaps.LatLng(y, x));
            }
          });
        });
        
        // 기존 폴리라인 제거
        if (polylineRef.current) {
          polylineRef.current.setMap(null);
        }
        
        // 폴리라인 생성
        polylineRef.current = new kakaoMaps.Polyline({
          path: linePath,
          strokeWeight: 6,
          strokeColor: '#3B82F6', // Blue-500
          strokeOpacity: 0.8,
          strokeStyle: 'solid'
        });
        
        polylineRef.current.setMap(mapRef.current);
        
        // 출발/도착 마커
        const startPos = new kakaoMaps.LatLng(userLocation.lat, userLocation.lng);
        const endPos = new kakaoMaps.LatLng(selectedApt.lat, selectedApt.lng);
        
        // 출발 마커 (커스텀)
        const startContent = document.createElement('div');
        startContent.innerHTML = `<div style="padding:5px 10px; background:#3B82F6; color:white; border-radius:15px; font-weight:bold; font-size:12px; box-shadow:0 2px 5px rgba(0,0,0,0.3);">출발</div>`;
        startMarkerRef.current = new kakaoMaps.CustomOverlay({
          position: startPos,
          content: startContent,
          map: mapRef.current,
          yAnchor: 1.5
        });
        
        // 도착 마커 (커스텀)
        const endContent = document.createElement('div');
        endContent.innerHTML = `<div style="padding:5px 10px; background:#EF4444; color:white; border-radius:15px; font-weight:bold; font-size:12px; box-shadow:0 2px 5px rgba(0,0,0,0.3);">도착</div>`;
        endMarkerRef.current = new kakaoMaps.CustomOverlay({
          position: endPos,
          content: endContent,
          map: mapRef.current,
          yAnchor: 1.5
        });
        
        // 지도 범위 재설정
        const bounds = new kakaoMaps.LatLngBounds();
        linePath.forEach(point => bounds.extend(point));
        mapRef.current.setBounds(bounds);
        
      } else {
        setLoadError('경로를 찾을 수 없습니다.');
      }
      
    } catch (error) {
      console.error('Directions error:', error);
      setLoadError('길찾기 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingDirections(false);
    }
  };


  // 지역 오버레이 생성 함수
  const createRegionOverlay = useCallback((
    region: RegionPriceItem,
    kakaoMaps: any,
    map: any
  ) => {
    if (!region.lat || !region.lng) return null;
    
    const position = new kakaoMaps.LatLng(region.lat, region.lng);
    const bgColor = getPriceColor(region.avg_price, true);
    
    // 오버레이 컨텐츠 생성
    const content = document.createElement('div');
    content.className = 'region-overlay';
    content.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 60px;
      padding: 6px 10px;
      background: ${bgColor};
      border-radius: 12px;
      color: white;
      font-weight: 700;
      box-shadow: 0 3px 8px rgba(0,0,0,0.25);
      border: 1.5px solid rgba(255,255,255,0.3);
      cursor: pointer;
      transition: all 0.2s ease;
      backdrop-filter: blur(4px);
    `;
    
    content.innerHTML = `
      <div style="font-size: 12px; opacity: 0.95; margin-bottom: 1px; white-space: nowrap; font-weight: 600;">${region.region_name}</div>
      <div style="font-size: 16px; font-weight: 800; letter-spacing: -0.5px;">${formatPriceLabel(region.avg_price)}</div>
    `;
    
    content.onmouseenter = () => {
      content.style.transform = 'scale(1.08)';
      content.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
    };
    content.onmouseleave = () => {
      content.style.transform = 'scale(1)';
      content.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    };
    
    content.addEventListener('click', (e) => {
        e.stopPropagation();
      // 클릭 시 해당 지역으로 확대
      const level = Math.max(map.getLevel() - 2, 3);
      map.setLevel(level, { anchor: position });
    });
    
    const overlay = new kakaoMaps.CustomOverlay({
      position: position,
      content: content,
      map: map,
      yAnchor: 0.5,
      zIndex: 10
    });
    
    return overlay;
  }, []);

  // 아파트 오버레이 생성 함수
  const createApartmentOverlay = useCallback((
    apt: ApartmentPriceItem,
    kakaoMaps: any,
    map: any,
    onClick: (aptId: number) => void
  ) => {
    const position = new kakaoMaps.LatLng(apt.lat, apt.lng);
    const bgColor = getPriceColor(apt.avg_price, false);
    
    // 오버레이 컨텐츠 생성
    const content = document.createElement('div');
    content.className = 'apartment-overlay';
    content.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 60px;
      padding: 6px 10px;
      background: ${bgColor};
      border-radius: 12px;
      color: white;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 2px solid white;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    `;
    
    // 포인터 (삼각형) 추가
    const pointer = document.createElement('div');
    pointer.style.cssText = `
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 8px solid ${bgColor}; 
      filter: drop-shadow(0 2px 1px rgba(0,0,0,0.1));
    `;
    content.appendChild(pointer);
    
    const minPriceLabel = apt.min_price ? `${apt.min_price.toFixed(1)}억~` : '';
    const maxPriceLabel = apt.max_price ? `${apt.max_price.toFixed(1)}억` : formatPriceLabel(apt.avg_price);

    content.innerHTML += `
      <div style="font-size: 11px; opacity: 0.9; margin-bottom: 2px; white-space: nowrap; font-weight: 500;">${minPriceLabel}</div>
      <div style="font-size: 14px; font-weight: 800; letter-spacing: -0.5px; line-height: 1;">${maxPriceLabel}</div>
    `;
    
    content.onmouseenter = () => {
      content.style.transform = 'scale(1.1) translateY(-2px)';
      content.style.zIndex = '20';
    };
    content.onmouseleave = () => {
      content.style.transform = 'scale(1)';
      content.style.zIndex = '';
    };
    
    content.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(apt.apt_id);
    });
    
    const overlay = new kakaoMaps.CustomOverlay({
      position: position,
      content: content,
      map: map,
      yAnchor: 1.15, // 포인터가 정확히 위치를 가리키도록 조정 (1.0 + margin/height)
      zIndex: 15
    });
    
    return overlay;
  }, []);

  // 로딩 상태를 ref로 관리하여 의존성 문제 해결
  const isLoadingRef = useRef(false);

  // 지도 데이터 로드 함수 (4분할 요청으로 더 많은 아파트 표시)
  const loadMapData = useCallback(async (map: any) => {
    if (!map) {
      console.log('[Map] loadMapData - map is null');
      return;
    }
    
    if (isLoadingRef.current) {
      console.log('[Map] loadMapData - already loading, skip');
      return;
    }
    
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const level = map.getLevel();
    
    console.log('[Map] loadMapData - level:', level, 'bounds:', {
      sw: { lat: sw.getLat(), lng: sw.getLng() },
      ne: { lat: ne.getLat(), lng: ne.getLng() }
    });
    
    setCurrentZoomLevel(level);
    
    // 디바운스
    if (mapDataDebounceRef.current) {
      clearTimeout(mapDataDebounceRef.current);
    }
    
    mapDataDebounceRef.current = setTimeout(async () => {
      isLoadingRef.current = true;
      setIsLoadingMapData(true);
      
      try {
        // 1. 카테고리 데이터 로드 (지하철) - 제거됨
        /*
        // 지하철 (Level 7 이하)
        if (level <= 7) {
          updatePlacesMarkers('SW8', mapRef.current, stationOverlaysRef, { 
            colorCallback: getSubwayColor,
            icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="12" x="4" y="3" rx="2"/><path d="M6 15v5"/><path d="M18 15v5"/><path d="m8 3-.8 2"/><path d="m16 3 .8 2"/></svg>', 
            label: '지하철' 
          });
        } else {
          stationOverlaysRef.current.forEach((overlay: any) => overlay.setMap(null));
          stationOverlaysRef.current = [];
        }
        */

        // 길찾기 모드일 때는 아파트 데이터 로드 중단
        if (isDirectionsMode) {
          console.log('[Map] loadMapData - skipped apartments due to directions mode');
          return;
        }

        const swLat = sw.getLat();
        const swLng = sw.getLng();
        const neLat = ne.getLat();
        const neLng = ne.getLng();
        
        // 아파트 레벨 (줌 레벨 1~3)일 때만 4분할 요청
        const dataType = getDataTypeByZoom(level);
        const shouldSplitRequest = dataType === 'apartment';
        
        let allRegions: RegionPriceItem[] = [];
        let allApartments: ApartmentPriceItem[] = [];
        let responseDataType = 'regions';
        
        if (shouldSplitRequest) {
          // 4분할 요청: 지도를 4개 quadrant로 나누어 병렬 요청
          const midLat = (swLat + neLat) / 2;
          const midLng = (swLng + neLng) / 2;
          
          const quadrants: MapBoundsRequest[] = [
            // 좌하단 (SW)
            { sw_lat: swLat, sw_lng: swLng, ne_lat: midLat, ne_lng: midLng, zoom_level: level },
            // 우하단 (SE)
            { sw_lat: swLat, sw_lng: midLng, ne_lat: midLat, ne_lng: neLng, zoom_level: level },
            // 좌상단 (NW)
            { sw_lat: midLat, sw_lng: swLng, ne_lat: neLat, ne_lng: midLng, zoom_level: level },
            // 우상단 (NE)
            { sw_lat: midLat, sw_lng: midLng, ne_lat: neLat, ne_lng: neLng, zoom_level: level }
          ];
          
          console.log('[Map] Splitting into 4 quadrants for apartment level');
          
          // 4개의 요청을 병렬로 실행
          const responses = await Promise.all(
            quadrants.map(q => fetchMapBoundsData(q, transactionType).catch(err => {
              console.error('[Map] Quadrant request failed:', err);
              return null;
            }))
          );
          
          // 결과 합치기 (중복 제거)
          const seenAptIds = new Set<number>();
          
          responses.forEach((response, idx) => {
            if (!response) return;
            
            console.log(`[Map] Quadrant ${idx + 1} response:`, {
              data_type: response.data_type,
              apartments_count: response.apartments?.length || 0
            });
            
            if (response.data_type === 'apartments' && response.apartments) {
              response.apartments.forEach(apt => {
                if (!seenAptIds.has(apt.apt_id)) {
                  seenAptIds.add(apt.apt_id);
                  allApartments.push(apt);
                }
              });
            }
          });
          
          responseDataType = 'apartments';
          console.log('[Map] Total unique apartments from 4 quadrants:', allApartments.length);
          
        } else {
          // 일반 요청 (지역 레벨)
          const boundsRequest: MapBoundsRequest = {
            sw_lat: swLat,
            sw_lng: swLng,
            ne_lat: neLat,
            ne_lng: neLng,
            zoom_level: level
          };
          
          console.log('[Map] Single API request:', boundsRequest, 'transactionType:', transactionType);
          
          const response = await fetchMapBoundsData(boundsRequest, transactionType);
          
          console.log('[Map] API response:', {
            data_type: response.data_type,
            total_count: response.total_count,
            regions_count: response.regions?.length || 0,
            apartments_count: response.apartments?.length || 0
          });
          
          responseDataType = response.data_type;
          if (response.regions) allRegions = response.regions;
          if (response.apartments) allApartments = response.apartments;
        }
        
        // 기존 오버레이 제거 (맵 데이터만 제거하고, 경로 오버레이는 유지)
        clearMapDataOverlays();
        
        const kakaoMaps = window.kakao.maps as any;
        
        if (responseDataType === 'regions' && allRegions.length > 0) {
          console.log('[Map] Creating region overlays:', allRegions.length);
          // 지역 오버레이 표시
          allRegions.forEach((region, index) => {
            const overlay = createRegionOverlay(region, kakaoMaps, map);
            if (overlay) {
              regionOverlaysRef.current.push(overlay);
            } else {
              console.log('[Map] Region overlay creation failed for:', region.region_name, 'lat:', region.lat, 'lng:', region.lng);
            }
          });
          console.log('[Map] Region overlays created:', regionOverlaysRef.current.length);
        } else if (responseDataType === 'apartments' && allApartments.length > 0) {
          console.log('[Map] Creating apartment overlays:', allApartments.length);
          // 아파트 오버레이 표시
          allApartments.forEach((apt, index) => {
            const overlay = createApartmentOverlay(apt, kakaoMaps, map, (aptId) => {
              handleMarkerClick(String(aptId));
              // mapApartments에 추가 (사이드 패널 표시용)
              const newApt: MapApartment = {
                id: String(aptId),
                aptId: aptId,
                name: apt.apt_name,
                priceLabel: formatPriceLabel(apt.avg_price),
                priceValue: apt.avg_price,
                location: apt.address || '',
                lat: apt.lat,
                lng: apt.lng
              };
              setMapApartments(prev => {
                const exists = prev.find(a => a.aptId === aptId);
                if (exists) return prev;
                return [...prev, newApt];
              });
            });
      overlaysRef.current.push(overlay);
    });
          console.log('[Map] Apartment overlays created:', overlaysRef.current.length);
        } else {
          console.log('[Map] No data to display - data_type:', responseDataType);
        }
        
      } catch (error) {
        console.error('[Map] Failed to load map data:', error);
      } finally {
        isLoadingRef.current = false;
        setIsLoadingMapData(false);
      }
    }, 10);
  }, [transactionType, clearMapDataOverlays, createRegionOverlay, createApartmentOverlay, isDirectionsMode, updatePlacesMarkers]);

  // 현재 위치 가져오기
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLoadError('이 브라우저에서는 위치 서비스를 사용할 수 없습니다.');
      return;
    }
    
    setIsLocating(true);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        
        if (mapRef.current) {
          const kakaoMaps = window.kakao.maps as any;
          const center = new kakaoMaps.LatLng(latitude, longitude);
          mapRef.current.setCenter(center);
          mapRef.current.setLevel(5);
          
          // 사용자 위치 마커 표시
          if (userMarkerRef.current) {
            userMarkerRef.current.setMap(null);
          }
          
          // 커스텀 마커 생성 (파란 점)
          const markerContent = document.createElement('div');
          markerContent.style.cssText = `
            width: 20px;
            height: 20px;
            background: #3B82F6;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5);
            animation: pulse 2s infinite;
          `;
          
          // CSS 애니메이션 추가
          const style = document.createElement('style');
          style.textContent = `
            @keyframes pulse {
              0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
              70% { box-shadow: 0 0 0 15px rgba(59, 130, 246, 0); }
              100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
            }
          `;
          document.head.appendChild(style);
          
          userMarkerRef.current = new kakaoMaps.CustomOverlay({
            position: center,
            content: markerContent,
            map: mapRef.current,
            yAnchor: 0.5,
            zIndex: 100
          });
        }
        
        setIsLocating(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        let errorMsg = '위치를 가져올 수 없습니다.';
        if (error.code === 1) errorMsg = '위치 권한이 거부되었습니다.';
        if (error.code === 2) errorMsg = '위치 정보를 사용할 수 없습니다.';
        if (error.code === 3) errorMsg = '위치 요청 시간이 초과되었습니다.';
        setLoadError(errorMsg);
        setIsLocating(false);
        
        // 5초 후 에러 메시지 제거
        setTimeout(() => setLoadError(null), 5000);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }, []);

  // 지도 초기화
  useEffect(() => {
    if (!kakaoLoaded) {
      console.log('[Map] Kakao SDK not loaded yet');
      return;
    }
    if (!mapContainerRef.current) {
      console.log('[Map] Map container not ready');
      return;
    }
    if (mapRef.current) {
      console.log('[Map] Map already initialized');
      return;
    }
    
    console.log('[Map] Initializing map...');
    
    // 기본 중심: 서울
    const defaultCenter = new window.kakao.maps.LatLng(37.5665, 126.9780);
    mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
      center: defaultCenter,
      level: 7
    });
    
    console.log('[Map] Map created with level 7');
    
    const kakaoMaps = window.kakao.maps as any;
    
    // 지도 이벤트 등록
    kakaoMaps.event.addListener(mapRef.current, 'idle', () => {
      console.log('[Map] idle event triggered');
      loadMapData(mapRef.current);
    });
    
    kakaoMaps.event.addListener(mapRef.current, 'zoom_changed', () => {
      const level = mapRef.current.getLevel();
      console.log('[Map] zoom_changed event - new level:', level);
      setCurrentZoomLevel(level);
    });
    
    // 초기 데이터 로드 (idle 이벤트가 바로 발생하지 않을 수 있으므로)
    console.log('[Map] Initial data load');
    loadMapData(mapRef.current);
    
    // 현재 위치로 이동 시도 (약간의 지연 후)
    setTimeout(() => {
      console.log('[Map] Attempting to get current location');
      getCurrentLocation();
    }, 500);
    
  }, [kakaoLoaded, loadMapData, getCurrentLocation]);

  // 거래 유형 변경 시 데이터 다시 로드
  useEffect(() => {
    if (mapRef.current) {
      loadMapData(mapRef.current);
    }
  }, [transactionType, loadMapData]);

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
    
    // 5개씩 나누어서 처리 (API 제한 때문)
    for (let i = 0; i < aptIds.length; i += 5) {
      const chunk = aptIds.slice(i, i + 5);
      try {
      const compare = await fetchCompareApartments(chunk);
      compare.apartments.forEach((apt) => {
        priceMap.set(apt.id, apt.price ?? null);
      });
      } catch (error) {
        // 에러 발생 시 해당 ID들은 null로 설정
        chunk.forEach((id) => {
          if (!priceMap.has(id)) {
            priceMap.set(id, null);
          }
        });
      }
    }
    return priceMap;
  };

  // 검색 결과 선택 핸들러
  const handleSelectSearchResult = async (apt: ApartmentSearchItem | AISearchApartment) => {
    if (!apt.location) return;
    
    // 검색어 저장
    if (searchQuery.trim().length >= 2) {
      saveRecentSearchToCookie(searchQuery.trim());
      setRecentSearches(getRecentSearchesFromCookie());
    }
    
    // 장소(지하철, 학교 등)인 경우 지도 이동만 수행
    if ('type' in apt && apt.type === 'place') {
      if (mapRef.current) {
        const center = new window.kakao.maps.LatLng(apt.location.lat, apt.location.lng);
        mapRef.current.setCenter(center);
        mapRef.current.setLevel(4);
      }
      setIsSearchExpanded(false);
      setSearchQuery('');
      setSearchResults([]);
      setAiResults([]);
      return;
    }
    
    // 가격 정보 가져오기
    const aptId = typeof apt.apt_id === 'number' ? apt.apt_id : Number(apt.apt_id);
    const priceMap = await fetchCompareMap([aptId]);
    const priceValue = priceMap.get(aptId) ?? null;
    
    const newApt: MapApartment = {
      id: String(apt.apt_id),
      aptId: aptId,
      name: apt.apt_name,
      priceLabel: formatPriceLabel(priceValue),
      priceValue,
      location: apt.address || '',
      lat: apt.location.lat,
      lng: apt.location.lng,
      isSpeculationArea: false
    };
    
    setMapApartments([newApt]);
    
    // 지도 이동
    if (mapRef.current) {
      const center = new window.kakao.maps.LatLng(apt.location.lat, apt.location.lng);
      mapRef.current.setCenter(center);
      mapRef.current.setLevel(4);
    }
    
    setIsSearchExpanded(false);
    setSearchQuery('');
    setSearchResults([]);
    setAiResults([]);
    
    // 선택된 아파트 상세 패널 열기
    handleMarkerClick(String(apt.apt_id));
  };
  
  // 급상승 아파트 선택 핸들러
  const handleSelectTrending = async (apt: TrendingApartmentItem) => {
    if (!apt.location) return;
    
    const priceMap = await fetchCompareMap([apt.apt_id]);
    const priceValue = priceMap.get(apt.apt_id) ?? null;
    
    const newApt: MapApartment = {
      id: String(apt.apt_id),
      aptId: apt.apt_id,
      name: apt.apt_name,
      priceLabel: formatPriceLabel(priceValue),
      priceValue,
      location: apt.address || '',
      lat: apt.location.lat,
      lng: apt.location.lng,
      isSpeculationArea: false
    };
    
    setMapApartments([newApt]);
    
    if (mapRef.current) {
      const center = new window.kakao.maps.LatLng(apt.location.lat, apt.location.lng);
      mapRef.current.setCenter(center);
      mapRef.current.setLevel(4);
    }
    
    setIsSearchExpanded(false);
    handleMarkerClick(String(apt.apt_id));
  };
  
  // 최근 검색어 클릭 핸들러
  const handleRecentSearchClick = (term: string) => {
    setSearchQuery(term);
    inputRef.current?.focus();
  };
  
  const handleSearchSubmit = async () => {
    if (!searchQuery.trim()) return;
    
    // 검색어 저장
    saveRecentSearchToCookie(searchQuery.trim());
    setRecentSearches(getRecentSearchesFromCookie());
    
    try {
      setLoadError(null);
      
      if (isAiActive) {
        // AI 검색
        setIsAiSearching(true);
        const response = await aiSearchApartments(searchQuery.trim());
        const results = response.data.apartments;
        
        if (!results.length) {
          setMapApartments([]);
          setIsAiSearching(false);
          return;
        }
        
        const ids = results.map((item) => item.apt_id);
      const priceMap = await fetchCompareMap(ids);
      
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
        setIsAiSearching(false);
        
        const first = mapped[0];
        if (first && mapRef.current) {
          const center = new window.kakao.maps.LatLng(first.lat, first.lng);
          mapRef.current.setCenter(center);
          mapRef.current.setLevel(5);
        }
      } else {
        // 일반 검색 (아파트 + 장소)
        const [aptResponse, placeResponse] = await Promise.all([
            searchApartments(searchQuery.trim(), 10),
            fetchPlacesByKeyword(searchQuery.trim(), { size: 5 })
        ]);
        
        const places = placeResponse.documents ? placeResponse.documents.map((p: any) => ({
            apt_id: p.id,
            apt_name: p.place_name,
            address: p.road_address_name || p.address_name,
            location: { lat: Number(p.y), lng: Number(p.x) },
            type: 'place'
        })) : [];
        
        const apartmentResults = aptResponse.data.results;
        const allResults = [...places, ...apartmentResults];
        
        if (!allResults.length) {
          setMapApartments([]);
          return;
        }
        
        // 아파트만 가격 조회 및 표시
        if (apartmentResults.length > 0) {
            const ids = apartmentResults
                .map((item) => item.apt_id)
                .filter((id): id is number => typeof id === 'number');
                
            const priceMap = await fetchCompareMap(ids);
            
            const mapped = apartmentResults
              .filter((item) => item.location && typeof item.apt_id === 'number')
              .map((item) => {
                const aptId = item.apt_id as number;
                const priceValue = priceMap.get(aptId) ?? null;
                return {
                  id: String(aptId),
                  aptId: aptId,
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
        } else {
            setMapApartments([]);
        }
        
        // 첫 번째 결과로 이동 (장소 포함)
        const first = allResults[0];
        if (first && first.location && mapRef.current) {
          const center = new window.kakao.maps.LatLng(first.location.lat, first.location.lng);
          mapRef.current.setCenter(center);
          mapRef.current.setLevel(5);
        }
      }
      
      setIsSearchExpanded(false);
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
        ? error 
        : '검색 중 오류가 발생했습니다.';
      setLoadError(errorMessage);
      
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

  // 현재 데이터 유형 표시 텍스트
  const getDataTypeText = () => {
    const type = getDataTypeByZoom(currentZoomLevel);
    switch (type) {
      case 'sido': return '시/도별 평균가';
      case 'sigungu': return '시군구별 평균가';
      case 'dong': return '동별 평균가';
      case 'apartment': return '아파트별 가격';
    }
  };

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
        <div className="flex gap-2 w-full" ref={searchContainerRef}>
            <div className="relative flex-1">
              <div className={`h-[60px] rounded-xl shadow-deep md:shadow-sharp transition-all duration-300 transform bg-white ${isSearchExpanded ? 'rounded-b-none' : ''}`}>
                <div className={`absolute inset-0 bg-white flex items-center overflow-hidden z-10 px-4 border border-slate-200/50 ${isSearchExpanded ? 'rounded-t-xl rounded-b-none border-b-0' : 'rounded-xl'}`}>
                    <div className="w-10 h-full flex items-center justify-center flex-shrink-0">
                         <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    
                    <input 
                        ref={inputRef}
                        type="text" 
                        className="flex-1 py-4 px-3 border-none bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-0 text-[16px] font-medium min-w-0" 
                        placeholder={isAiActive ? "AI에게 물어보세요... (예: 강남구 30평대 아파트)" : "지역, 아파트 검색"} 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setIsSearchExpanded(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSearchSubmit();
                          }
                          if (e.key === 'Escape') {
                            setIsSearchExpanded(false);
                          }
                        }}
                    />
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                         {searchQuery && (
                         <button 
                              onClick={() => {
                                setSearchQuery('');
                                setSearchResults([]);
                                setAiResults([]);
                                inputRef.current?.focus();
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
                           >
                               <X className="w-4 h-4 text-slate-400" />
                           </button>
                         )}
                         <button 
                            onClick={() => {
                              setIsAiActive(!isAiActive);
                              setSearchResults([]);
                              setAiResults([]);
                            }}
                            className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-all ${isAiActive ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                         >
                             <Sparkles className={`w-5 h-5 ${isAiActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                         </button>

                         <div className="w-px h-5 bg-slate-200"></div>

                         <button 
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            className={`relative p-2 rounded-lg transition-all duration-200 ${isSettingsOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                             <SlidersHorizontal className="w-5 h-5" />
                             {/* 필터 활성 표시 뱃지 */}
                             {(filterMinPrice || filterMaxPrice || filterMinArea || filterMaxArea) && (
                               <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white"></span>
                             )}
                        </button>
                    </div>
                </div>
            </div>

              {/* 검색 드롭다운 패널 */}
              {isSearchExpanded && (
                <div className="absolute left-0 right-0 top-[60px] bg-white rounded-b-xl shadow-deep border border-t-0 border-slate-200/50 z-20 max-h-[400px] overflow-y-auto custom-scrollbar">
                  {/* 검색 결과 표시 */}
                  {searchQuery.length >= 2 ? (
                    <div className="p-3">
                      {isSearching || isAiSearching ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                          <span className="ml-2 text-sm text-slate-500">검색 중...</span>
                        </div>
                      ) : isAiActive ? (
                        // AI 검색 결과
                        aiResults.length > 0 ? (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-indigo-500 mb-2 flex items-center gap-1 px-1">
                              <Sparkles className="w-3 h-3" /> AI 검색 결과 ({aiResults.length}건)
                            </p>
                            {aiResults.slice(0, 8).map((apt) => (
                              <button
                                key={apt.apt_id}
                                onClick={() => handleSelectSearchResult(apt)}
                                className="w-full text-left p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                              >
                                <div className="flex items-center gap-3">
                                  <Building2 className="w-5 h-5 text-indigo-500 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-900 truncate group-hover:text-indigo-600">{apt.apt_name}</p>
                                    {apt.address && (
                                      <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                        <MapPin className="w-3 h-3" />
                                        {apt.address}
                                      </p>
                                    )}
                                    {apt.average_price && (
                                      <p className="text-xs font-medium text-indigo-500 mt-0.5">
                                        평균 {(apt.average_price / 10000).toFixed(1)}억원
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : searchQuery.length >= 5 ? (
                          <div className="text-center py-8 text-slate-500 text-sm">
                            검색 결과가 없습니다
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-400 text-sm">
                            AI 검색은 5글자 이상 입력해주세요
                          </div>
                        )
                      ) : (
                        // 일반 검색 결과
                        searchResults.length > 0 ? (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-500 mb-2 px-1">검색 결과 ({searchResults.length}건)</p>
                            {searchResults.map((apt) => (
                              <button
                                key={apt.apt_id}
                                onClick={() => handleSelectSearchResult(apt)}
                                className="w-full text-left p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                              >
                                <div className="flex items-center gap-3">
                                  <Building2 className="w-5 h-5 text-blue-500 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-900 truncate group-hover:text-blue-600">{apt.apt_name}</p>
                                    {apt.address && (
                                      <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                        <MapPin className="w-3 h-3" />
                                        {apt.address}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-500 text-sm">
                            검색 결과가 없습니다
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    // 검색어 없을 때: 탭 표시
                    <div>
                      {/* 탭 버튼 */}
                      <div className="flex border-b border-slate-100">
                        <button
                          onClick={() => setActiveTab('recent')}
                          className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                            activeTab === 'recent'
                              ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <Clock className="w-4 h-4" />
                          최근 검색
                        </button>
                        <button
                          onClick={() => setActiveTab('trending')}
                          className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                            activeTab === 'trending'
                              ? 'text-orange-600 border-b-2 border-orange-600 -mb-px'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <TrendingUp className="w-4 h-4" />
                          급상승
            </button>
        </div>

                      <div className="p-3">
                        {activeTab === 'recent' ? (
                          // 최근 검색어
                          recentSearches.length > 0 ? (
                            <div className="space-y-1">
                              {recentSearches.map((term, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                                >
                                  <button
                                    onClick={() => handleRecentSearchClick(term)}
                                    className="flex-1 flex items-center gap-3 text-left"
                                  >
                                    <Clock className="w-4 h-4 text-slate-400" />
                                    <span className="text-sm text-slate-700 group-hover:text-blue-600">{term}</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteRecentSearchFromCookie(term);
                                      setRecentSearches(getRecentSearchesFromCookie());
                                    }}
                                    className="p-1 rounded hover:bg-slate-200 transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <X className="w-4 h-4 text-slate-400" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-400 text-sm">
                              최근 검색 기록이 없습니다
                            </div>
                          )
                        ) : (
                          // 급상승 아파트
                          isLoadingTrending ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                            </div>
                          ) : trendingList.length > 0 ? (
                            <div className="space-y-1">
                              {trendingList.slice(0, 8).map((apt, index) => (
                                <button
                                  key={apt.apt_id}
                                  onClick={() => handleSelectTrending(apt)}
                                  className="w-full text-left p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                                      <span className="text-xs font-bold text-orange-600">{index + 1}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-slate-900 truncate group-hover:text-orange-600">{apt.apt_name}</p>
                                      {apt.address && (
                                        <p className="text-xs text-slate-500 truncate">{apt.address}</p>
                                      )}
                                    </div>
                                    {apt.transaction_count && (
                                      <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-600 font-medium shrink-0">
                                        {apt.transaction_count}건
                                      </span>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-400 text-sm">
                              급상승 데이터가 없습니다
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button 
              onClick={getCurrentLocation}
              disabled={isLocating}
              className="hidden md:flex w-[60px] h-[60px] rounded-xl bg-white border border-slate-200 shadow-sharp items-center justify-center text-slate-600 hover:text-blue-600 transition-colors active:scale-95 disabled:opacity-50"
            >
                {isLocating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Navigation className="w-6 h-6" />
                )}
            </button>

            <button 
              onClick={handleDirectionsClick}
              disabled={!selectedMarkerId || isLoadingDirections}
              className={`hidden md:flex w-[60px] h-[60px] rounded-xl border shadow-sharp items-center justify-center transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                isDirectionsMode 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200' 
                  : 'bg-white border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200'
              }`}
            >
                {isLoadingDirections ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Car className="w-6 h-6" />
                )}
            </button>
        </div>

        {/* AI 추천 질문 & 설정 패널 */}
        {isSettingsOpen && !isSearchExpanded && (
            <div className="bg-white/95 backdrop-blur-xl rounded-xl p-4 shadow-deep border border-slate-100 animate-slide-up origin-top">
                {isAiActive ? (
                    <div className="space-y-3">
                         <p className="text-[13px] font-bold text-indigo-500 mb-2 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> AI 추천 질문
                         </p>
                         <div className="flex flex-wrap gap-2">
                             {['강남구 30평대 아파트', '5억 이하 신축', '학군 좋은 아파트', '지하철역 5분 이내'].map(q => (
                                 <button 
                                   key={q} 
                                   onClick={() => {
                                     setSearchQuery(q);
                                     setIsSearchExpanded(true);
                                     inputRef.current?.focus();
                                   }}
                                   className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[13px] font-bold hover:bg-indigo-100 transition-colors"
                                 >
                                     {q}
                                 </button>
                             ))}
                         </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                         {/* 거래 유형 */}
                         <div className="flex justify-between items-center">
                             <span className="text-[15px] font-bold text-slate-700">거래 유형</span>
                             <div className="flex bg-slate-100 rounded-lg p-0.5">
                                 <button 
                                   onClick={() => setTransactionType('sale')}
                                   className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-all ${
                                     transactionType === 'sale' 
                                       ? 'bg-white shadow-sm text-slate-900' 
                                       : 'text-slate-400 hover:text-slate-600'
                                   }`}
                                 >
                                   매매
                                 </button>
                                 <button 
                                   onClick={() => setTransactionType('jeonse')}
                                   className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-all ${
                                     transactionType === 'jeonse' 
                                       ? 'bg-white shadow-sm text-slate-900' 
                                       : 'text-slate-400 hover:text-slate-600'
                                   }`}
                                 >
                                   전세
                                 </button>
                             </div>
                         </div>
                         
                         {/* 구분선 */}
                         <div className="border-t border-slate-200/60"></div>
                         
                         {/* 가격 필터 */}
                         <div className="space-y-2">
                             <div className="flex items-center justify-between">
                               <span className="text-[14px] font-bold text-slate-700">가격 범위</span>
                               <span className="text-[11px] text-slate-400">단위: 만원</span>
                             </div>
                             <div className="flex items-center gap-2">
                                 <div className="relative flex-1">
                                   <input 
                                     type="number"
                                     placeholder="최소"
                                     value={filterMinPrice}
                                     onChange={(e) => {
                                       setFilterMinPrice(e.target.value);
                                       setIsFilterActive(true);
                                     }}
                                     className="w-full px-3 py-2 text-[13px] font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                   />
                                 </div>
                                 <span className="text-slate-400 text-sm">~</span>
                                 <div className="relative flex-1">
                                   <input 
                                     type="number"
                                     placeholder="최대"
                                     value={filterMaxPrice}
                                     onChange={(e) => {
                                       setFilterMaxPrice(e.target.value);
                                       setIsFilterActive(true);
                                     }}
                                     className="w-full px-3 py-2 text-[13px] font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                   />
                                 </div>
                             </div>
                             {/* 가격 퀵버튼 */}
                             <div className="flex flex-wrap gap-1.5">
                               {[
                                 { label: '3억 이하', min: '', max: '30000' },
                                 { label: '3~5억', min: '30000', max: '50000' },
                                 { label: '5~10억', min: '50000', max: '100000' },
                                 { label: '10억 이상', min: '100000', max: '' }
                               ].map((preset) => (
                                 <button
                                   key={preset.label}
                                   onClick={() => {
                                     setFilterMinPrice(preset.min);
                                     setFilterMaxPrice(preset.max);
                                     setIsFilterActive(true);
                                   }}
                                   className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                                     filterMinPrice === preset.min && filterMaxPrice === preset.max
                                       ? 'bg-blue-500 text-white'
                                       : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                   }`}
                                 >
                                   {preset.label}
                                 </button>
                               ))}
                             </div>
                         </div>
                         
                         {/* 평수 필터 */}
                         <div className="space-y-2">
                             <div className="flex items-center justify-between">
                               <span className="text-[14px] font-bold text-slate-700">평수 범위</span>
                               <span className="text-[11px] text-slate-400">전용면적 기준</span>
                             </div>
                             <div className="flex items-center gap-2">
                                 <div className="relative flex-1">
                                   <input 
                                     type="number"
                                     placeholder="최소"
                                     value={filterMinArea}
                                     onChange={(e) => {
                                       setFilterMinArea(e.target.value);
                                       setIsFilterActive(true);
                                     }}
                                     className="w-full px-3 py-2 text-[13px] font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                   />
                                   <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">평</span>
                                 </div>
                                 <span className="text-slate-400 text-sm">~</span>
                                 <div className="relative flex-1">
                                   <input 
                                     type="number"
                                     placeholder="최대"
                                     value={filterMaxArea}
                                     onChange={(e) => {
                                       setFilterMaxArea(e.target.value);
                                       setIsFilterActive(true);
                                     }}
                                     className="w-full px-3 py-2 text-[13px] font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                   />
                                   <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">평</span>
                                 </div>
                             </div>
                             {/* 평수 퀵버튼 */}
                             <div className="flex flex-wrap gap-1.5">
                               {[
                                 { label: '20평 이하', min: '', max: '20' },
                                 { label: '20~30평', min: '20', max: '30' },
                                 { label: '30~40평', min: '30', max: '40' },
                                 { label: '40평 이상', min: '40', max: '' }
                               ].map((preset) => (
                                 <button
                                   key={preset.label}
                                   onClick={() => {
                                     setFilterMinArea(preset.min);
                                     setFilterMaxArea(preset.max);
                                     setIsFilterActive(true);
                                   }}
                                   className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                                     filterMinArea === preset.min && filterMaxArea === preset.max
                                       ? 'bg-blue-500 text-white'
                                       : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                   }`}
                                 >
                                   {preset.label}
                                 </button>
                               ))}
                             </div>
                         </div>
                         
                         {/* 필터 초기화 버튼 */}
                         {isFilterActive && (filterMinPrice || filterMaxPrice || filterMinArea || filterMaxArea) && (
                           <button
                             onClick={() => {
                               setFilterMinPrice('');
                               setFilterMaxPrice('');
                               setFilterMinArea('');
                               setFilterMaxArea('');
                               setIsFilterActive(false);
                             }}
                             className="w-full py-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all flex items-center justify-center gap-1"
                           >
                             <X className="w-4 h-4" />
                             필터 초기화
                           </button>
                         )}
                    </div>
                )}
            </div>
        )}
      </div>

      {/* 길찾기 결과 카드 */}
      {isDirectionsMode && directionsData && (
        <div className={`absolute bottom-0 left-0 right-0 md:bottom-28 md:left-16 md:right-auto md:w-[360px] z-[110] bg-white/95 backdrop-blur-xl rounded-t-2xl md:rounded-2xl shadow-[0_-5px_20px_rgba(0,0,0,0.15)] md:shadow-2xl border-t md:border border-white/50 animate-slide-up flex flex-col transition-all duration-300 ${isDirectionsMinimized ? 'h-[180px] md:h-[180px]' : 'max-h-[60vh]'}`}>
          <div className="p-5 pb-0 flex-shrink-0">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Car className="w-5 h-5 text-blue-600" />
                    자동차 경로
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">추천 경로 기준</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsDirectionsMinimized(!isDirectionsMinimized)}
                    className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors -mt-1"
                  >
                    <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isDirectionsMinimized ? 'rotate-180' : ''}`} />
                  </button>
                  <button 
                    onClick={clearRouteOverlays}
                    className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors -mr-1 -mt-1"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
              </div>

              <div className="flex items-baseline gap-2 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-3xl font-black text-blue-600 tabular-nums">
                  {Math.round(directionsData.summary.duration / 60)}
                </span>
                <span className="text-sm font-bold text-slate-500">분</span>
                <span className="text-sm text-slate-300 mx-1">|</span>
                <span className="text-sm font-bold text-slate-700">
                  {(directionsData.summary.distance / 1000).toFixed(1)}km
                </span>
                <span className="text-sm text-slate-300 mx-1">|</span>
                <span className="text-sm font-bold text-slate-700">
                  {directionsData.summary.fare?.taxi?.toLocaleString()}원
                </span>
              </div>
          </div>

          <div className={`overflow-y-auto custom-scrollbar px-5 pb-5 flex-1 ${isDirectionsMinimized ? 'hidden' : ''}`}>
              {/* 타임라인 시각화 */}
              <div className="relative pl-4 border-l-2 border-slate-200 space-y-6 py-2 ml-1">
                <div className="relative">
                  <div className="absolute -left-[21px] top-1.5 w-3.5 h-3.5 bg-blue-500 rounded-full ring-4 ring-white shadow-sm z-10"></div>
                  <p className="text-xs font-bold text-slate-400 mb-0.5">출발</p>
                  <p className="text-sm font-bold text-slate-900 truncate">내 위치</p>
                </div>
                
                {/* 상세 경로 가이드 */}
                {directionsData.sections && directionsData.sections[0] && directionsData.sections[0].guides && (
                    <div className="space-y-4 py-1">
                        {directionsData.sections[0].guides.map((guide: any, idx: number) => (
                            <div key={idx} className="relative group">
                                <div className="absolute -left-[20px] top-2 w-2.5 h-2.5 bg-slate-300 rounded-full ring-4 ring-white group-hover:bg-blue-400 transition-colors"></div>
                                <p className="text-[13px] font-medium text-slate-700 leading-snug">
                                    {guide.guidance}
                                </p>
                                {guide.distance > 0 && (
                                    <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                                        {guide.distance >= 1000 
                                            ? `${(guide.distance / 1000).toFixed(1)}km` 
                                            : `${guide.distance}m`} 이동
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="relative">
                  <div className="absolute -left-[21px] top-1.5 w-3.5 h-3.5 bg-red-500 rounded-full ring-4 ring-white shadow-sm z-10"></div>
                  <p className="text-xs font-bold text-slate-400 mb-0.5">도착</p>
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {directionsData.summary.destination?.name || '목적지'}
                  </p>
                </div>
              </div>
          </div>
        </div>
      )}

      {/* 지도 레벨 & 데이터 타입 표시 */}
      <div className="absolute bottom-24 left-4 md:bottom-8 md:left-16 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border border-slate-200/50">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">레벨 {currentZoomLevel}</span>
          <span className="text-slate-300">|</span>
          <span className="font-medium text-slate-700">{getDataTypeText()}</span>
          {isLoadingMapData && (
            <>
              <span className="text-slate-300">|</span>
              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
            </>
          )}
        </div>
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
                       <div className="flex gap-2 items-center w-full">
                           <button 
                               onClick={() => onPropertyClick(String(selectedProperty.aptId))}
                               className="flex-1 bg-slate-100 text-slate-700 font-bold py-3.5 rounded-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2 text-[15px]"
                           >
                               <Building2 className="w-4 h-4" />
                               상세 정보
                           </button>
                           <button 
                               onClick={(e) => {
                                   e.stopPropagation();
                                   handleDirectionsClick();
                                   setSelectedMarkerId(null);
                               }}
                               className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 text-[15px]"
                           >
                               <Car className="w-4 h-4" />
                               길 안내
                           </button>
                       </div>
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