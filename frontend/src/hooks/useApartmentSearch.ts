import { useState, useEffect } from 'react';
import { searchApartments, ApartmentSearchResult } from '../lib/searchApi';

export function useApartmentSearch(query: string) {
  const [results, setResults] = useState<ApartmentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        setIsSearching(true);
        try {
          const data = await searchApartments(query);
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
  }, [query]);

  return { results, isSearching };
}
