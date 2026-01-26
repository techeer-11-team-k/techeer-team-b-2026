/**
 * 위치 기반 데이터 Prefetch 훅
 * 
 * 사이트 로드 시 비동기로 현재 위치를 수집하고,
 * 주변 동과 아파트 시세를 미리 가져와서 캐시합니다.
 * 이렇게 하면 지도 페이지로 이동했을 때 오버레이가 바로 표시됩니다.
 */

import { useEffect, useRef, useCallback } from 'react';
import { 
  fetchMapBoundsData, 
  fetchNearbyApartments,
  MapBoundsRequest,
  ApartmentPriceItem,
  RegionPriceItem
} from '../services/api';

// 캐시 상수
const PREFETCH_CACHE_KEY = 'map_prefetch_cache';
const PREFETCH_LOCATION_KEY = 'map_prefetch_location';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15분

// Prefetch 캐시 타입
export interface PrefetchCache {
  timestamp: number;
  location: { lat: number; lng: number };
  nearbyApartments?: ApartmentPriceItem[];
  regionData?: {
    dong?: RegionPriceItem[];
    sigungu?: RegionPriceItem[];
  };
  mapBoundsData?: {
    zoomLevel: number;
    dataType: 'regions' | 'apartments';
    regions?: RegionPriceItem[];
    apartments?: ApartmentPriceItem[];
  }[];
}

// 캐시 가져오기
export const getPrefetchCache = (): PrefetchCache | null => {
  try {
    const cached = sessionStorage.getItem(PREFETCH_CACHE_KEY);
    if (!cached) return null;
    
    const data = JSON.parse(cached) as PrefetchCache;
    
    // TTL 체크
    if (Date.now() - data.timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(PREFETCH_CACHE_KEY);
      return null;
    }
    
    return data;
  } catch {
    return null;
  }
};

// 캐시 저장
const setPrefetchCache = (data: Partial<PrefetchCache>) => {
  try {
    const existing = getPrefetchCache();
    const newData: PrefetchCache = {
      timestamp: Date.now(),
      location: data.location || existing?.location || { lat: 0, lng: 0 },
      ...existing,
      ...data,
    };
    sessionStorage.setItem(PREFETCH_CACHE_KEY, JSON.stringify(newData));
  } catch (e) {
    console.warn('[Prefetch] Failed to save cache:', e);
  }
};

// 캐시된 위치 가져오기
export const getPrefetchedLocation = (): { lat: number; lng: number } | null => {
  try {
    const cached = sessionStorage.getItem(PREFETCH_LOCATION_KEY);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch {
    return null;
  }
};

// 위치 캐시 저장
const setPrefetchedLocation = (location: { lat: number; lng: number }) => {
  try {
    sessionStorage.setItem(PREFETCH_LOCATION_KEY, JSON.stringify(location));
  } catch (e) {
    console.warn('[Prefetch] Failed to save location:', e);
  }
};

// 특정 줌 레벨에 맞는 bounds 계산
const calculateBoundsForZoom = (
  lat: number, 
  lng: number, 
  zoomLevel: number
): MapBoundsRequest => {
  // 카카오맵 줌 레벨에 따른 대략적인 반경 (미터)
  // 레벨이 낮을수록 확대 (좁은 영역), 높을수록 축소 (넓은 영역)
  const radiusMap: Record<number, number> = {
    1: 50,
    2: 100,
    3: 200,
    4: 500,
    5: 1000,
    6: 2000,
    7: 5000,
    8: 10000,
    9: 20000,
    10: 40000,
    11: 80000,
  };
  
  const radiusMeters = radiusMap[zoomLevel] || 5000;
  
  // 위도 1도 ≈ 111km, 경도 1도 ≈ 88km (한국 기준)
  const latDelta = (radiusMeters / 111000);
  const lngDelta = (radiusMeters / 88000);
  
  return {
    sw_lat: lat - latDelta,
    sw_lng: lng - lngDelta,
    ne_lat: lat + latDelta,
    ne_lng: lng + lngDelta,
    zoom_level: zoomLevel,
  };
};

export interface UseLocationPrefetchOptions {
  /** 자동 실행 여부 (기본값: true) */
  autoRun?: boolean;
  /** 위치 획득 성공 콜백 */
  onLocationSuccess?: (location: { lat: number; lng: number }) => void;
  /** 위치 획득 실패 콜백 */
  onLocationError?: (error: GeolocationPositionError) => void;
  /** prefetch 완료 콜백 */
  onPrefetchComplete?: (cache: PrefetchCache) => void;
}

export const useLocationPrefetch = (options: UseLocationPrefetchOptions = {}) => {
  const { autoRun = true, onLocationSuccess, onLocationError, onPrefetchComplete } = options;
  const isRunningRef = useRef(false);
  const hasRunRef = useRef(false);

  // Prefetch 실행 함수
  const runPrefetch = useCallback(async (lat: number, lng: number) => {
    console.log('[Prefetch] Starting prefetch for location:', { lat, lng });
    
    const prefetchStartTime = Date.now();
    
    try {
      // 1. 주변 아파트 조회 (반경 2km)
      const nearbyPromise = fetchNearbyApartments(
        lat, lng, 
        2000,    // 2km 반경
        'sale',  // 매매
        6,       // 6개월
        50       // 최대 50개
      ).catch(err => {
        console.warn('[Prefetch] Nearby apartments failed:', err);
        return null;
      });
      
      // 2. 동 레벨 bounds 데이터 (줌 레벨 5)
      const dongBounds = calculateBoundsForZoom(lat, lng, 5);
      const dongPromise = fetchMapBoundsData(dongBounds, 'sale', 6).catch(err => {
        console.warn('[Prefetch] Dong level data failed:', err);
        return null;
      });
      
      // 3. 아파트 레벨 bounds 데이터 (줌 레벨 3)
      const aptBounds = calculateBoundsForZoom(lat, lng, 3);
      const aptPromise = fetchMapBoundsData(aptBounds, 'sale', 6).catch(err => {
        console.warn('[Prefetch] Apartment level data failed:', err);
        return null;
      });
      
      // 4. 시군구 레벨 bounds 데이터 (줌 레벨 7)
      const sigunguBounds = calculateBoundsForZoom(lat, lng, 7);
      const sigunguPromise = fetchMapBoundsData(sigunguBounds, 'sale', 6).catch(err => {
        console.warn('[Prefetch] Sigungu level data failed:', err);
        return null;
      });
      
      // 모든 요청을 병렬로 실행
      const [nearbyResult, dongResult, aptResult, sigunguResult] = await Promise.all([
        nearbyPromise,
        dongPromise,
        aptPromise,
        sigunguPromise,
      ]);
      
      // 캐시 구성
      const cacheData: PrefetchCache = {
        timestamp: Date.now(),
        location: { lat, lng },
        nearbyApartments: nearbyResult?.data || [],
        regionData: {
          dong: dongResult?.regions || [],
          sigungu: sigunguResult?.regions || [],
        },
        mapBoundsData: [
          // 아파트 레벨 (줌 3)
          aptResult && {
            zoomLevel: 3,
            dataType: aptResult.data_type,
            regions: aptResult.regions,
            apartments: aptResult.apartments,
          },
          // 동 레벨 (줌 5)
          dongResult && {
            zoomLevel: 5,
            dataType: dongResult.data_type,
            regions: dongResult.regions,
            apartments: dongResult.apartments,
          },
          // 시군구 레벨 (줌 7)
          sigunguResult && {
            zoomLevel: 7,
            dataType: sigunguResult.data_type,
            regions: sigunguResult.regions,
            apartments: sigunguResult.apartments,
          },
        ].filter(Boolean) as PrefetchCache['mapBoundsData'],
      };
      
      // 캐시 저장
      setPrefetchCache(cacheData);
      
      const elapsed = Date.now() - prefetchStartTime;
      console.log(`[Prefetch] Completed in ${elapsed}ms:`, {
        nearbyApartments: cacheData.nearbyApartments?.length || 0,
        dongRegions: cacheData.regionData?.dong?.length || 0,
        sigunguRegions: cacheData.regionData?.sigungu?.length || 0,
        mapBoundsLevels: cacheData.mapBoundsData?.length || 0,
      });
      
      onPrefetchComplete?.(cacheData);
      
    } catch (error) {
      console.error('[Prefetch] Failed:', error);
    }
  }, [onPrefetchComplete]);

  // 위치 획득 및 prefetch 시작
  const startPrefetch = useCallback(() => {
    if (isRunningRef.current || hasRunRef.current) {
      console.log('[Prefetch] Already running or completed');
      return;
    }
    
    // 브라우저 지원 확인
    if (!navigator.geolocation) {
      console.warn('[Prefetch] Geolocation not supported');
      return;
    }
    
    // 이미 캐시된 데이터가 있으면 스킵
    const existingCache = getPrefetchCache();
    if (existingCache) {
      console.log('[Prefetch] Using existing cache from', new Date(existingCache.timestamp).toISOString());
      return;
    }
    
    isRunningRef.current = true;
    console.log('[Prefetch] Requesting location...');
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log('[Prefetch] Location acquired:', { lat: latitude, lng: longitude });
        
        // 위치 저장
        setPrefetchedLocation({ lat: latitude, lng: longitude });
        onLocationSuccess?.({ lat: latitude, lng: longitude });
        
        // Prefetch 실행 (비동기)
        runPrefetch(latitude, longitude).finally(() => {
          isRunningRef.current = false;
          hasRunRef.current = true;
        });
      },
      (error) => {
        console.warn('[Prefetch] Location error:', error.message);
        isRunningRef.current = false;
        hasRunRef.current = true;
        onLocationError?.(error);
      },
      {
        enableHighAccuracy: false, // 빠른 응답을 위해 정확도 낮춤
        timeout: 8000,
        maximumAge: 5 * 60 * 1000, // 5분 내 캐시된 위치 허용
      }
    );
  }, [runPrefetch, onLocationSuccess, onLocationError]);

  // 자동 실행
  useEffect(() => {
    if (autoRun) {
      // 약간의 지연 후 실행 (UI 렌더링 우선)
      const timer = setTimeout(startPrefetch, 100);
      return () => clearTimeout(timer);
    }
  }, [autoRun, startPrefetch]);

  return {
    startPrefetch,
    getPrefetchCache,
    getPrefetchedLocation,
  };
};

export default useLocationPrefetch;
