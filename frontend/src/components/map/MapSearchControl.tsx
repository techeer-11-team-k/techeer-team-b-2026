import React, { useState, useRef, useEffect } from 'react';
import { Search, X, TrendingUp, History, Filter, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ApartmentSearchResult } from '../../lib/searchApi';
import { useApartmentSearch } from '../../hooks/useApartmentSearch';
import SearchResultsList from '../../components/ui/SearchResultsList';

interface MapSearchControlProps {
  isDarkMode: boolean;
  isDesktop?: boolean;
  onApartmentSelect?: (apt: any) => void;
}

export default function MapSearchControl({ isDarkMode, isDesktop = false, onApartmentSelect }: MapSearchControlProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'trending' | 'filter'>('recent');
  const [query, setQuery] = useState('');
  
  const { results, isSearching } = useApartmentSearch(query);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [containerRef]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded]);

  const handleSelect = (apt: ApartmentSearchResult) => {
    const aptData = {
        id: apt.apt_id,
        name: apt.apt_name,
        price: apt.price,
        location: apt.address,
        lat: apt.location.lat,
        lng: apt.location.lng,
        ...apt 
    };
    
    if (onApartmentSelect) {
        onApartmentSelect(aptData);
    }
    setIsExpanded(false);
    setQuery(''); 
  };

  const tabs = [
    { id: 'recent', label: '최근 검색', icon: History },
    { id: 'trending', label: '급상승', icon: TrendingUp },
    { id: 'filter', label: '필터', icon: Filter },
  ];

  return (
    <div 
      className={`absolute left-4 z-50 font-sans flex flex-col items-start`} 
      style={{ 
        top: isDesktop ? 'calc(6rem + 4vh)' : 'calc(1rem + 4vh)' 
      }}
      ref={containerRef}
    >
      <motion.div
        initial={false}
        animate={{
          width: isExpanded ? 360 : 48,
          height: isExpanded ? 'auto' : 48,
          borderRadius: 24,
        }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className={`bg-white dark:bg-zinc-900 shadow-2xl shadow-black/20 overflow-hidden flex flex-col items-start border border-zinc-200 dark:border-zinc-800 backdrop-blur-sm ${
            isExpanded ? '' : 'justify-center items-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors'
        }`}
      >
        {/* Header Area */}
        <div className="w-full flex items-center shrink-0 h-12 relative">
            <AnimatePresence mode="popLayout">
                {!isExpanded ? (
                    <motion.button
                        key="search-btn"
                        layoutId="search-trigger"
                        onClick={() => setIsExpanded(true)}
                        className="w-12 h-12 flex items-center justify-center text-blue-600 dark:text-blue-400 absolute top-0 left-0"
                        whileTap={{ scale: 0.9 }}
                    >
                        <Search size={22} />
                    </motion.button>
                ) : (
                    <motion.div 
                        key="search-input"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center w-full px-4 gap-3 h-12"
                    >
                        <Search size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="아파트명 검색 (2글자 이상)"
                            className="flex-1 bg-transparent border-none outline-none text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 min-w-0"
                            style={{ color: isDarkMode ? '#f4f4f5' : '#18181b' }}
                        />
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                if (query) {
                                    setQuery('');
                                    inputRef.current?.focus();
                                } else {
                                    setIsExpanded(false); 
                                }
                            }}
                            className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                        >
                            <X size={18} className="text-zinc-500 dark:text-zinc-400" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Content Area */}
        <AnimatePresence>
            {isExpanded && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="w-full border-t border-zinc-100 dark:border-zinc-800"
                >
                    <div className="p-4 w-full">
                        {query.length >= 2 ? (
                            <SearchResultsList 
                                results={results}
                                onSelect={handleSelect}
                                isDarkMode={isDarkMode}
                                query={query}
                                isSearching={isSearching}
                            />
                        ) : (
                            <>
                                <div className="flex gap-1 mb-6 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-xl w-full">
                                    {tabs.map((tab) => (
                                        <button 
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id as any)}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                                                activeTab === tab.id
                                                    ? 'bg-zinc-800 dark:bg-zinc-600 text-white shadow-md' 
                                                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex flex-col items-center justify-center py-8 text-zinc-400 dark:text-zinc-500 gap-3">
                                    <div className="w-12 h-12 rounded-full bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center">
                                        {activeTab === 'recent' && <History size={24} className="opacity-50" />}
                                        {activeTab === 'trending' && <TrendingUp size={24} className="opacity-50" />}
                                        {activeTab === 'filter' && <Filter size={24} className="opacity-50" />}
                                    </div>
                                    <span className="text-sm font-medium">
                                        {activeTab === 'recent' && '최근 검색 기록이 없습니다'}
                                        {activeTab === 'trending' && '급상승 검색어가 없습니다'}
                                        {activeTab === 'filter' && '필터 기능 준비 중입니다'}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}