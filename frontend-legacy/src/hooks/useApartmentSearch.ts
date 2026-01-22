import { useState, useEffect } from 'react';
import { searchApartments, ApartmentSearchResult } from '../lib/searchApi';
import { useAuth } from '../lib/clerk';

export function useApartmentSearch(query: string, saveRecent: boolean = false) {
  const [results, setResults] = useState<ApartmentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        setIsSearching(true);
        try {
          // saveRecent가 false이면 검색 기록을 저장하지 않음 (홈 검색창용)
          const token = (saveRecent && isSignedIn && getToken) ? await getToken() : null;
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
  }, [query, isSignedIn, getToken, saveRecent]);

  return { results, isSearching };
}
