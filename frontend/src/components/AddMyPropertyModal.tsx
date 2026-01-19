import React, { useState, useEffect } from 'react';
import { Search, MapPin, X, Loader2, ArrowLeft, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { searchApartmentsExcludingMyProperty, ApartmentSearchResult } from '../lib/searchApi';
import { createMyProperty, MyPropertyCreate, getMyProperties } from '../lib/myPropertyApi';
import { useAuth } from '../lib/clerk';
import { useDynamicIslandToast } from './ui/DynamicIslandToast';

interface AddMyPropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onSuccess?: () => void;
}

export default function AddMyPropertyModal({
  isOpen,
  onClose,
  isDarkMode,
  onSuccess,
}: AddMyPropertyModalProps) {
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

  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const cardClass = isDarkMode 
    ? 'bg-slate-800/50 border-slate-700' 
    : 'bg-white border-slate-200';

  // 아파트 검색
  useEffect(() => {
    if (!isOpen || !searchQuery || searchQuery.length < 2) {
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
  }, [searchQuery, isOpen, isSignedIn, getToken, myPropertyAptIds]);

  // 내 집 목록 조회 (이미 추가된 아파트 확인용)
  useEffect(() => {
    const fetchMyProperties = async () => {
      if (!isOpen || !isSignedIn || !getToken) {
        setMyPropertyAptIds(new Set());
        return;
      }

      try {
        const token = await getToken();
        if (!token) return;

        // getMyProperties는 MyProperty[] 배열을 직접 반환함
        const properties = await getMyProperties(token, true); // skipCache=true로 최신 데이터 가져오기
        if (properties && Array.isArray(properties)) {
          const aptIds = new Set(properties.map((prop) => prop.apt_id));
          setMyPropertyAptIds(aptIds);
          console.log('📋 [AddMyPropertyModal] 내집 apt_id 목록:', aptIds);
        }
      } catch (error) {
        console.error('Failed to fetch my properties:', error);
        setMyPropertyAptIds(new Set());
      }
    };

    fetchMyProperties();
  }, [isOpen, isSignedIn, getToken]);

  // 모달 닫을 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedApartment(null);
      setNickname('우리집');
      setMemo('');
    }
  }, [isOpen]);

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
        exclusive_area: 1, // 기본값 1㎡
        current_market_price: undefined,
        memo: memo || undefined,
      };

      await createMyProperty(propertyData, token);
      
      showSuccess('내 집이 등록되었습니다.');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Failed to create my property:', error);
      showError(error.message || '내 집 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 배경 오버레이 - 모달과 동일한 색상 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`fixed inset-0 z-[100] ${isDarkMode ? 'bg-zinc-900' : 'bg-white'}`}
            onClick={onClose}
          />
          
          {/* 바텀 시트 모달 */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed z-[101] flex flex-col ${
              isDarkMode ? 'bg-zinc-900' : 'bg-white'
            }
            
            /* 모바일: 헤더 아래부터 네비게이션 바 바로 위까지 */
            top-16 bottom-16 left-0 right-0 rounded-t-3xl
            
            /* PC: 헤더 아래부터 가격 추이 차트 위까지, 중앙 정렬 */
            sm:top-[80px] sm:bottom-[180px] sm:left-4 sm:right-4 sm:rounded-2xl
            `}
          >
            {/* 드래그 핸들 (모바일) */}
            <div className="flex justify-center pt-3 pb-2 sm:hidden">
              <div className={`w-10 h-1 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-300'}`} />
            </div>

            {/* 헤더 */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={selectedApartment ? handleBackToSearch : onClose}
                className={`p-2 rounded-full transition-colors ${
                  isDarkMode 
                    ? 'hover:bg-slate-800 text-slate-300' 
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <h1 className={`text-base font-bold ${textPrimary}`}>
                {selectedApartment ? '내 집 정보 입력' : '내 집 추가'}
              </h1>
              
              <button
                onClick={onClose}
                className={`p-2 rounded-full transition-colors ${
                  isDarkMode 
                    ? 'hover:bg-slate-800 text-slate-300' 
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 컨텐츠 */}
            <div className="px-4 py-6 overflow-y-auto flex-1 min-h-[500px]">
              <AnimatePresence mode="wait">
                {!selectedApartment ? (
                  <motion.div
                    key="search"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    {/* 검색 입력창 */}
                    <div className={`rounded-xl border p-3 ${cardClass}`}>
                      <div className="flex items-center gap-2">
                        <Search className={`w-4 h-4 ${textSecondary} flex-shrink-0`} />
                        <Input
                          type="text"
                          placeholder="아파트명 또는 주소 (2글자 이상)"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className={`flex-1 border-0 bg-transparent focus-visible:ring-0 text-sm ${textPrimary} h-8`}
                          autoFocus
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className={`p-1 rounded-full ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                          >
                            <X className={`w-3 h-3 ${textSecondary}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 검색 안내 (검색어 없을 때) */}
                    {!searchQuery && (
                      <div className={`text-center py-16`}>
                        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                          isDarkMode ? 'bg-sky-500/20' : 'bg-sky-100'
                        }`}>
                          <Home className={`w-8 h-8 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                        </div>
                        <p className={`text-base ${textSecondary}`}>
                          아파트명 또는 주소를 검색하세요
                        </p>
                      </div>
                    )}

                    {/* 검색 중 */}
                    {isSearching && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className={`w-6 h-6 animate-spin ${textSecondary}`} />
                      </div>
                    )}

                    {/* 검색 결과 없음 */}
                    {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
                      <div className={`text-center py-6 ${textSecondary}`}>
                        <p className="text-sm">검색 결과가 없습니다.</p>
                      </div>
                    )}

                    {/* 검색 결과 */}
                    {!isSearching && searchResults.length > 0 && (
                      <div className="space-y-2">
                        <p className={`text-xs ${textSecondary} px-1`}>
                          검색 결과 {searchResults.length}건
                        </p>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                          {searchResults.map((apt) => {
                            const isAlreadyAdded = myPropertyAptIds.has(apt.apt_id);
                            return (
                              <motion.button
                                key={apt.apt_id}
                                whileTap={{ scale: isAlreadyAdded ? 1 : 0.98 }}
                                onClick={() => !isAlreadyAdded && handleApartmentSelect(apt)}
                                disabled={isAlreadyAdded}
                                className={`w-full text-left p-3 rounded-xl border transition-all ${
                                  isAlreadyAdded
                                    ? isDarkMode
                                      ? 'bg-slate-700/30 border-slate-600/50 opacity-60 cursor-not-allowed'
                                      : 'bg-slate-100/50 border-slate-200/50 opacity-60 cursor-not-allowed'
                                    : `${cardClass} hover:shadow-md`
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`p-2 rounded-lg ${
                                    isAlreadyAdded
                                      ? isDarkMode
                                        ? 'bg-slate-600/30 text-slate-400'
                                        : 'bg-slate-200 text-slate-500'
                                      : isDarkMode
                                      ? 'bg-sky-500/20 text-sky-400'
                                      : 'bg-sky-100 text-sky-600'
                                  }`}>
                                    <MapPin className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <h3 className={`font-medium text-sm ${
                                        isAlreadyAdded ? 'text-slate-400' : textPrimary
                                      }`}>{apt.apt_name}</h3>
                                      {isAlreadyAdded && (
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                          isDarkMode
                                            ? 'bg-slate-600/50 text-slate-400'
                                            : 'bg-slate-200 text-slate-500'
                                        }`}>
                                          추가됨
                                        </span>
                                      )}
                                    </div>
                                    <p className={`text-xs ${
                                      isAlreadyAdded ? 'text-slate-500' : textSecondary
                                    } line-clamp-1`}>{apt.address}</p>
                                  </div>
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    {/* 선택한 아파트 정보 */}
                    <div className={`p-3 rounded-xl border ${cardClass}`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${
                          isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600'
                        }`}>
                          <Home className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs ${textSecondary} mb-0.5`}>선택한 아파트</p>
                          <h3 className={`font-medium text-sm ${textPrimary}`}>{selectedApartment.apt_name}</h3>
                          <p className={`text-xs ${textSecondary} line-clamp-1`}>{selectedApartment.address}</p>
                        </div>
                      </div>
                    </div>

                    {/* 별칭 */}
                    <div className={`p-3 rounded-xl border ${cardClass}`}>
                      <label className={`block text-xs font-medium mb-2 ${textPrimary}`}>
                        별칭 <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="text"
                        placeholder="예: 우리집, 투자용"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className={`h-9 text-sm ${isDarkMode ? 'bg-slate-700/50 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                      />
                    </div>

                    {/* 메모 */}
                    <div className={`p-3 rounded-xl border ${cardClass}`}>
                      <label className={`block text-xs font-medium mb-2 ${textSecondary}`}>
                        메모 <span className={`text-xs ${textSecondary}`}>(선택)</span>
                      </label>
                      <textarea
                        placeholder="메모를 입력해주세요"
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        rows={2}
                        className={`w-full rounded-lg border px-3 py-2 text-sm resize-none ${
                          isDarkMode
                            ? 'bg-slate-700/50 border-slate-600 text-slate-100 placeholder:text-slate-500'
                            : 'bg-slate-50 border-slate-200 placeholder:text-slate-400'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500`}
                      />
                    </div>

                    {/* 버튼 */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={handleBackToSearch}
                        className="flex-1 h-10 rounded-xl"
                        disabled={isSubmitting}
                      >
                        뒤로
                      </Button>
                      <Button
                        onClick={handleSubmit}
                        className="flex-1 h-10 rounded-xl bg-sky-500 hover:bg-sky-600 text-white"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            등록 중
                          </>
                        ) : (
                          '등록하기'
                        )}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          
          {/* Toast Container */}
          {ToastComponent}
        </>
      )}
    </AnimatePresence>
  );
}
