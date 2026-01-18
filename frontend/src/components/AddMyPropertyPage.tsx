import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, X, Loader2, ArrowLeft, Home, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { searchApartmentsExcludingMyProperty, ApartmentSearchResult } from '../lib/searchApi';
import { createMyProperty, MyPropertyCreate, getMyProperties } from '../lib/myPropertyApi';
import { useAuth } from '../lib/clerk';
import { useDynamicIslandToast } from './ui/DynamicIslandToast';

interface AddMyPropertyPageProps {
  onBack: () => void;
  isDarkMode: boolean;
  isDesktop?: boolean;
  onSuccess?: () => void;
}

export default function AddMyPropertyPage({
  onBack,
  isDarkMode,
  isDesktop = false,
  onSuccess,
}: AddMyPropertyPageProps) {
  const { isSignedIn, getToken } = useAuth();
  const { showSuccess, showError, ToastComponent } = useDynamicIslandToast(isDarkMode, 3000);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ApartmentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedApartment, setSelectedApartment] = useState<ApartmentSearchResult | null>(null);
  const [myPropertyAptIds, setMyPropertyAptIds] = useState<Set<number>>(new Set());
  
  // 내 집 등록 상태
  const [nickname, setNickname] = useState('우리집');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 색상 설정: 다크 모드에서 카드 배경색 제거
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const cardClass = isDarkMode 
    ? 'border-slate-700/50' 
    : 'bg-white border-slate-100';
  const cardBgClass = isDarkMode 
    ? '' 
    : 'bg-white';
  
  // 검색 결과 스크롤 컨테이너 ref
  const searchResultsRef = useRef<HTMLDivElement>(null);

  // 내 집 목록 조회 (이미 추가된 아파트 확인용)
  useEffect(() => {
    const fetchMyProperties = async () => {
      if (!isSignedIn || !getToken) {
        setMyPropertyAptIds(new Set());
        return;
      }

      try {
        const token = await getToken();
        if (!token) return;

        const response = await getMyProperties(token);
        if (response && response.data && response.data.properties) {
          const aptIds = new Set(response.data.properties.map((prop: any) => prop.apt_id));
          setMyPropertyAptIds(aptIds);
        }
      } catch (error) {
        console.error('Failed to fetch my properties:', error);
        setMyPropertyAptIds(new Set());
      }
    };

    fetchMyProperties();
  }, [isSignedIn, getToken]);

  // 아파트 검색
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const token = isSignedIn && getToken ? await getToken() : null;
        if (token) {
          // 로그인한 경우: 내집 제외 검색 사용
          const results = await searchApartmentsExcludingMyProperty(searchQuery, token);
          setSearchResults(results);
        } else {
          // 로그인하지 않은 경우: 빈 결과
          setSearchResults([]);
        }
      } catch (error) {
        console.error('Failed to search apartments:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isSignedIn, getToken, myPropertyAptIds]);

  // 검색 결과 스크롤 이벤트 핸들링 (부모로 스크롤 전파 방지)
  useEffect(() => {
    const scrollContainer = searchResultsRef.current;
    if (!scrollContainer) return;

    const handleWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isScrollable = scrollHeight > clientHeight;
      
      if (!isScrollable) return;
      
      const isAtTop = scrollTop <= 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
      
      if ((e.deltaY < 0 && !isAtTop) || (e.deltaY > 0 && !isAtBottom)) {
        e.stopPropagation();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isScrollable = scrollHeight > clientHeight;
      
      if (!isScrollable) return;
      
      e.stopPropagation();
    };

    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });
    scrollContainer.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      scrollContainer.removeEventListener('wheel', handleWheel);
      scrollContainer.removeEventListener('touchmove', handleTouchMove);
    };
  }, [searchResults.length]);

  const handleApartmentSelect = (apartment: ApartmentSearchResult) => {
    setSelectedApartment(apartment);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleBackToSearch = () => {
    setSelectedApartment(null);
    setSearchQuery('');
  };

  const handleSubmit = async () => {
    if (!selectedApartment || !isSignedIn || !getToken) {
      showError('필수 정보를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) {
        showError('로그인이 필요합니다.');
        return;
      }

      const propertyData: MyPropertyCreate = {
        apt_id: selectedApartment.apt_id,
        nickname: nickname || '우리집',
        exclusive_area: 1,
        current_market_price: undefined,
        memo: memo || undefined,
      };

      await createMyProperty(propertyData, token);
      
      showSuccess('내 집이 등록되었습니다.');
      
      // 성공 애니메이션 후 콜백 실행
      setTimeout(() => {
        onSuccess?.();
        onBack();
      }, 500);
    } catch (error: any) {
      console.error('Failed to create my property:', error);
      showError(error.message || '내 집 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-zinc-900' : 'bg-slate-50'}`}>
      {/* 헤더 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b backdrop-blur-sm ${
          isDarkMode 
            ? 'bg-zinc-900/80 border-slate-800' 
            : 'bg-white/80 border-slate-200'
        }`}
      >
        <button
          onClick={selectedApartment ? handleBackToSearch : onBack}
          className={`p-2 rounded-full transition-all ${
            isDarkMode 
              ? 'hover:bg-slate-800 text-slate-300 active:scale-95' 
              : 'hover:bg-slate-100 text-slate-700 active:scale-95'
          }`}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        
        <h1 className={`text-lg font-bold ${textPrimary}`}>
          {selectedApartment ? '내 집 정보 입력' : '내 집 추가'}
        </h1>
        
        <div className="w-9" /> {/* 공간 맞추기 */}
      </motion.div>

      {/* 컨텐츠 */}
      <div className={`px-4 py-6 ${isDesktop ? 'max-w-2xl mx-auto' : ''}`}>
        <AnimatePresence mode="wait">
          {!selectedApartment ? (
            <motion.div
              key="search"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="space-y-4"
            >
              {/* 검색 입력창 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={`rounded-xl border p-4 ${cardClass} ${cardBgClass} shadow-sm`}
              >
                <div className="flex items-center gap-3">
                  <Search className={`w-5 h-5 ${textSecondary} flex-shrink-0`} />
                  <Input
                    type="text"
                    placeholder="아파트명 또는 주소 (2글자 이상)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`flex-1 border-0 bg-transparent focus-visible:ring-0 text-base ${textPrimary} h-10`}
                    autoFocus
                  />
                  {searchQuery && (
                    <motion.button
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setSearchQuery('')}
                      className={`p-1.5 rounded-full transition-colors ${
                        isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                      }`}
                    >
                      <X className={`w-4 h-4 ${textSecondary}`} />
                    </motion.button>
                  )}
                </div>
              </motion.div>

              {/* 검색 안내 (검색어 없을 때) */}
              <AnimatePresence>
                {!searchQuery && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="text-center py-20"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                      className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${
                        isDarkMode ? 'bg-sky-500/20' : 'bg-sky-100'
                      }`}
                    >
                      <Home className={`w-10 h-10 ${isDarkMode ? 'text-sky-400' : 'text-sky-700'}`} />
                    </motion.div>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className={`text-base ${textSecondary}`}
                    >
                      아파트명 또는 주소를 검색하세요
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 검색 중 */}
              {isSearching && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center py-12"
                >
                  <Loader2 className={`w-8 h-8 animate-spin ${textSecondary}`} />
                </motion.div>
              )}

              {/* 검색 결과 없음 */}
              {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`text-center py-12 ${textSecondary}`}
                >
                  <p className="text-sm">검색 결과가 없습니다.</p>
                </motion.div>
              )}

              {/* 검색 결과 */}
              {!isSearching && searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-3"
                >
                  <p className={`text-sm font-medium ${textSecondary} px-1`}>
                    검색 결과 {searchResults.length}건
                  </p>
                  <div 
                    ref={searchResultsRef}
                    className="space-y-2 max-h-[60vh] overflow-y-auto overscroll-contain custom-scrollbar"
                  >
                    {searchResults.map((apt, index) => {
                      const isAlreadyAdded = myPropertyAptIds.has(apt.apt_id);
                      return (
                        <motion.button
                          key={apt.apt_id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileTap={{ scale: isAlreadyAdded ? 1 : 0.98 }}
                          onClick={() => !isAlreadyAdded && handleApartmentSelect(apt)}
                          disabled={isAlreadyAdded}
                          className={`w-full text-left p-4 rounded-xl border transition-all ${
                            isAlreadyAdded
                              ? isDarkMode
                                ? 'border-slate-700/30 opacity-50 cursor-not-allowed'
                                : 'bg-slate-50/50 border-slate-200/50 opacity-60 cursor-not-allowed'
                              : `${cardClass} ${cardBgClass} ${
                                  isDarkMode 
                                    ? 'hover:border-slate-600' 
                                    : 'hover:border-slate-200 hover:shadow-md'
                                }`
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <motion.div
                              whileHover={{ scale: 1.1 }}
                              className={`p-2.5 rounded-lg ${
                                isAlreadyAdded
                                  ? isDarkMode
                                    ? 'bg-slate-700/30 text-slate-500'
                                    : 'bg-slate-200 text-slate-400'
                                  : isDarkMode
                                  ? 'bg-sky-500/20 text-sky-400'
                                  : 'bg-sky-100 text-sky-700'
                              }`}
                            >
                              {isAlreadyAdded ? (
                                <CheckCircle2 className="w-5 h-5" />
                              ) : (
                                <MapPin className="w-5 h-5" />
                              )}
                            </motion.div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className={`font-semibold text-base ${
                                  isAlreadyAdded ? 'text-slate-400' : textPrimary
                                }`}>{apt.apt_name}</h3>
                                {isAlreadyAdded && (
                                  <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className={`text-xs px-2 py-0.5 rounded-full ${
                                      isDarkMode
                                        ? 'bg-slate-700/50 text-slate-400'
                                        : 'bg-slate-200 text-slate-500'
                                    }`}
                                  >
                                    추가됨
                                  </motion.span>
                                )}
                              </div>
                              <p className={`text-sm ${
                                isAlreadyAdded ? 'text-slate-500' : textSecondary
                              } line-clamp-1`}>{apt.address}</p>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="space-y-4"
            >
              {/* 선택한 아파트 정보 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={`p-4 rounded-xl border ${cardClass} ${cardBgClass} shadow-sm`}
              >
                <div className="flex items-start gap-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring' }}
                    className={`p-3 rounded-lg ${
                      isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    <Home className="w-5 h-5" />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs ${textSecondary} mb-1`}>선택한 아파트</p>
                    <h3 className={`font-semibold text-base ${textPrimary}`}>{selectedApartment.apt_name}</h3>
                    <p className={`text-sm ${textSecondary} line-clamp-1 mt-0.5`}>{selectedApartment.address}</p>
                  </div>
                </div>
              </motion.div>

              {/* 별칭 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className={`p-4 rounded-xl border ${cardClass} ${cardBgClass} shadow-sm`}
              >
                <label className={`block text-sm font-medium mb-3 ${textPrimary}`}>
                  별칭 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="예: 우리집, 투자용"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className={`h-11 text-base ${isDarkMode ? 'bg-slate-800/50 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                />
              </motion.div>

              {/* 메모 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={`p-4 rounded-xl border ${cardClass} ${cardBgClass} shadow-sm`}
              >
                <label className={`block text-sm font-medium mb-3 ${textSecondary}`}>
                  메모 <span className={`text-xs ${textSecondary}`}>(선택)</span>
                </label>
                <textarea
                  placeholder="메모를 입력해주세요"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm resize-none ${
                    isDarkMode
                      ? 'bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500'
                      : 'bg-slate-50 border-slate-200 placeholder:text-slate-400'
                  } focus-visible:outline-none focus-visible:ring-2 ${isDarkMode ? 'focus-visible:ring-sky-500' : 'focus-visible:ring-sky-600'}`}
                />
              </motion.div>

              {/* 버튼 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="flex gap-3 pt-4"
              >
                <Button
                  variant="outline"
                  onClick={handleBackToSearch}
                  className="flex-1 h-12 text-base"
                  disabled={isSubmitting}
                >
                  뒤로
                </Button>
                <Button
                  onClick={handleSubmit}
                  className={`flex-1 h-12 text-base text-white ${
                    isDarkMode
                      ? 'bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600'
                      : 'bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700'
                  }`}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      등록 중
                    </>
                  ) : (
                    '등록하기'
                  )}
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Toast Container */}
      {ToastComponent}
    </div>
  );
}
