import { useState, useEffect } from 'react';
import { searchApartments, searchLocations, ApartmentSearchResult, LocationSearchResult } from '../lib/searchApi';

export type UnifiedSearchResult = 
  | {
      type: 'apartment';
      apartment: ApartmentSearchResult;
    }
  | {
      type: 'location';
      location: LocationSearchResult;
    };

interface UseUnifiedSearchOptions {
  includeLocations?: boolean; // 지역 검색 포함 여부 (기본값: false)
}

export function useUnifiedSearch(query: string, options: UseUnifiedSearchOptions = {}) {
  const { includeLocations = false } = options;
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const minLength = includeLocations ? 1 : 2;
      if (query.length >= minLength) {
        setIsSearching(true);
        try {
          const promises: Promise<any>[] = [];
          
          // 아파트 검색 (2글자 이상)
          if (query.length >= 2) {
            promises.push(searchApartments(query));
          } else {
            promises.push(Promise.resolve([]));
          }
          
          // 지역 검색 (1글자 이상, includeLocations가 true일 때만)
          if (includeLocations && query.length >= 1) {
            promises.push(searchLocations(query));
          } else {
            promises.push(Promise.resolve([]));
          }
          
          const [apartmentResults, locationResults] = await Promise.all(promises);
          
          // 지역 검색 결과를 최대 2개로 제한 (결과가 있을 때만)
          const limitedLocationResults = locationResults && locationResults.length > 0 
            ? locationResults.slice(0, 2) 
            : [];
          
          // 통합 결과 생성 (지역을 먼저, 그 다음 아파트)
          const unifiedResults: UnifiedSearchResult[] = [
            ...limitedLocationResults.map((loc: LocationSearchResult) => ({
              type: 'location' as const,
              location: loc
            })),
            ...apartmentResults.map((apt: ApartmentSearchResult) => ({
              type: 'apartment' as const,
              apartment: apt
            }))
          ];
          
          setResults(unifiedResults);
        } catch (error) {
          console.error('Unified search error:', error);
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, includeLocations]);

  return { results, isSearching };
}
