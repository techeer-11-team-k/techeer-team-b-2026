import { useState, useEffect } from 'react';
import { searchApartments, ApartmentSearchResult } from '../lib/searchApi';
import { useAuth } from '../lib/clerk';

export function useApartmentSearch(query: string) {
  const [results, setResults] = useState<ApartmentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        setIsSearching(true);
        try {
          // 로그인한 사용자의 경우 토큰을 전달하여 자동 저장
          const token = isSignedIn && getToken ? await getToken() : null;
          const data = await searchApartments(query, token);
          setResults(data);
        } catch (error) {
          console.error(error);
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, isSignedIn, getToken]);

  return { results, isSearching };
}
