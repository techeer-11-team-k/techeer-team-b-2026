import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, MapPin, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { searchApartments, searchLocations, ApartmentSearchResult, LocationSearchResult } from '../lib/searchApi';
import { useAuth } from '../lib/clerk';
import UnifiedSearchResults from './ui/UnifiedSearchResults';

interface SearchResultsPageProps {
  query: string;
  onBack: () => void;
  onApartmentSelect: (apartment: any) => void;
  onRegionSelect?: (region: LocationSearchResult) => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
}

export default function SearchResultsPage({
  query,
  onBack,
  onApartmentSelect,
  onRegionSelect,
  isDarkMode,
  isDesktop = false,
}: SearchResultsPageProps) {
  const { isSignedIn, getToken } = useAuth();
  const [apartmentResults, setApartmentResults] = useState<ApartmentSearchResult[]>([]);
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [isSearchingApartments, setIsSearchingApartments] = useState(false);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);

  useEffect(() => {
    const performSearch = async () => {
      if (!query || query.length < 1) {
        setApartmentResults([]);
        setLocationResults([]);
        return;
      }

      // 지역 검색 (1글자 이상)
      if (query.length >= 1) {
        setIsSearchingLocations(true);
        try {
          const token = isSignedIn && getToken ? await getToken() : null;
          const locations = await searchLocations(query, token);
          setLocationResults(locations);
        } catch (error) {
          console.error('Failed to search locations:', error);
          setLocationResults([]);
        } finally {
          setIsSearchingLocations(false);
        }
      }

      // 아파트 검색 (2글자 이상)
      if (query.length >= 2) {
        setIsSearchingApartments(true);
        try {
          const token = isSignedIn && getToken ? await getToken() : null;
          const apartments = await searchApartments(query, token);
          setApartmentResults(apartments);
        } catch (error) {
          console.error('Failed to search apartments:', error);
          setApartmentResults([]);
        } finally {
          setIsSearchingApartments(false);
        }
      } else {
        setApartmentResults([]);
      }
    };

    const timer = setTimeout(performSearch, 300);
    return () => clearTimeout(timer);
  }, [query, isSignedIn, getToken]);

  const handleApartmentSelect = (apt: ApartmentSearchResult) => {
    onApartmentSelect(apt);
    onBack();
  };

  const handleLocationSelect = (location: LocationSearchResult) => {
    if (onRegionSelect) {
      onRegionSelect(location);
    }
    onBack();
  };

  const textPrimary = isDarkMode ? 'text-white' : 'text-zinc-900';
  const textSecondary = isDarkMode ? 'text-zinc-400' : 'text-zinc-600';

  return (
    <div className={`w-full ${isDesktop ? 'max-w-6xl mx-auto' : ''}`}>
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className={`p-2 rounded-xl transition-all ${
            isDarkMode ? 'bg-zinc-900 hover:bg-zinc-800' : 'bg-white hover:bg-zinc-50'
          }`}
        >
          <ArrowLeft className={`w-5 h-5 ${textPrimary}`} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Search className={`w-5 h-5 ${textSecondary}`} />
          <h1 className={`text-2xl font-bold ${textPrimary}`}>검색 결과</h1>
          <span className={`text-sm ${textSecondary}`}>"{query}"</span>
        </div>
      </div>

      {/* 검색 결과 */}
      <div className={`rounded-2xl p-6 ${
        isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200'
      }`}>
        <UnifiedSearchResults
          apartmentResults={apartmentResults}
          locationResults={locationResults}
          onApartmentSelect={handleApartmentSelect}
          onLocationSelect={handleLocationSelect}
          isDarkMode={isDarkMode}
          query={query}
          isSearchingApartments={isSearchingApartments}
          isSearchingLocations={isSearchingLocations}
          showMoreButton={false}
        />
      </div>
    </div>
  );
}
