import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Sparkles, SlidersHorizontal, Map, X, Clock, TrendingUp, Building2, MapPin, Loader2, Navigation, ChevronDown } from 'lucide-react';
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
  ApartmentPriceItem
} from '../../services/api';

// 쿠키 관련 상수
const COOKIE_KEY_RECENT_SEARCHES = 'map_recent_searches';
const MAX_COOKIE_SEARCHES = 5;

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
// - 레벨 11 이상 (축소): 시/도
// - 레벨 6~10: 시군구
// - 레벨 4~5: 동
// - 레벨 1~3 (확대): 아파트
const getDataTypeByZoom = (zoomLevel: number): 'sido' | 'sigungu' | 'dong' | 'apartment' => {
  if (zoomLevel >= 11) return 'sido';
  if (zoomLevel >= 6) return 'sigungu';
  if (zoomLevel >= 4) return 'dong';
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
        // 일반 검색
        setIsSearching(true);
        try {
          const response = await searchApartments(searchQuery, 10);
          setSearchResults(response.data.results);
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

  // 오버레이 제거 함수
  const clearAllOverlays = useCallback(() => {
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
      <div style="font-size: 11px; opacity: 0.85; margin-top: 1px;">${region.transaction_count}건</div>
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
      min-width: 55px;
      padding: 5px 8px;
      background: ${bgColor};
      border-radius: 10px;
      color: white;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      border: 1.5px solid rgba(255,255,255,0.25);
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    
    // 이름 줄이기
    const shortName = apt.apt_name.length > 7 
      ? apt.apt_name.substring(0, 7) + '..' 
      : apt.apt_name;
    
    content.innerHTML = `
      <div style="font-size: 11px; opacity: 0.95; margin-bottom: 1px; white-space: nowrap; max-width: 70px; overflow: hidden; text-overflow: ellipsis; font-weight: 600;">${shortName}</div>
      <div style="font-size: 15px; font-weight: 800; letter-spacing: -0.3px;">${formatPriceLabel(apt.avg_price)}</div>
    `;
    
    content.onmouseenter = () => {
      content.style.transform = 'scale(1.1)';
      content.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
    };
    content.onmouseleave = () => {
      content.style.transform = 'scale(1)';
      content.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
    };
    
    content.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(apt.apt_id);
    });
    
    const overlay = new kakaoMaps.CustomOverlay({
      position: position,
      content: content,
      map: map,
      yAnchor: 0.5,
      zIndex: 15
    });
    
    return overlay;
  }, []);

  // 로딩 상태를 ref로 관리하여 의존성 문제 해결
  const isLoadingRef = useRef(false);

  // 지도 데이터 로드 함수
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
        const boundsRequest: MapBoundsRequest = {
          sw_lat: sw.getLat(),
          sw_lng: sw.getLng(),
          ne_lat: ne.getLat(),
          ne_lng: ne.getLng(),
          zoom_level: level
        };
        
        console.log('[Map] API request:', boundsRequest, 'transactionType:', transactionType);
        
        const response = await fetchMapBoundsData(boundsRequest, transactionType);
        
        console.log('[Map] API response:', {
          data_type: response.data_type,
          total_count: response.total_count,
          regions_count: response.regions?.length || 0,
          apartments_count: response.apartments?.length || 0
        });
        
        // 기존 오버레이 제거
        clearAllOverlays();
        
        const kakaoMaps = window.kakao.maps as any;
        
        if (response.data_type === 'regions' && response.regions) {
          console.log('[Map] Creating region overlays:', response.regions.length);
          // 지역 오버레이 표시
          response.regions.forEach((region, index) => {
            const overlay = createRegionOverlay(region, kakaoMaps, map);
            if (overlay) {
              regionOverlaysRef.current.push(overlay);
            } else {
              console.log('[Map] Region overlay creation failed for:', region.region_name, 'lat:', region.lat, 'lng:', region.lng);
            }
          });
          console.log('[Map] Region overlays created:', regionOverlaysRef.current.length);
        } else if (response.data_type === 'apartments' && response.apartments) {
          console.log('[Map] Creating apartment overlays:', response.apartments.length);
          // 아파트 오버레이 표시
          response.apartments.forEach((apt, index) => {
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
          console.log('[Map] No data to display - data_type:', response.data_type);
        }
        
      } catch (error) {
        console.error('[Map] Failed to load map data:', error);
      } finally {
        isLoadingRef.current = false;
        setIsLoadingMapData(false);
      }
    }, 300);
  }, [transactionType, clearAllOverlays, createRegionOverlay, createApartmentOverlay]);

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
    
    // 가격 정보 가져오기
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
        // 일반 검색
        const response = await searchApartments(searchQuery.trim(), 10);
        const results = response.data.results;
        
        if (!results.length) {
          setMapApartments([]);
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
        
        const first = mapped[0];
        if (first && mapRef.current) {
          const center = new window.kakao.maps.LatLng(first.lat, first.lng);
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
                            className={`p-2 rounded-lg transition-all duration-200 ${isSettingsOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                             <SlidersHorizontal className="w-5 h-5" />
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
                    <div className="space-y-3">
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
                    </div>
                )}
            </div>
        )}
      </div>

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
