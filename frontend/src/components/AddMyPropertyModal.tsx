import React, { useState, useEffect } from 'react';
import { Search, MapPin, X, Loader2, XIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { searchApartments, ApartmentSearchResult } from '../lib/searchApi';
import { createMyProperty, MyPropertyCreate } from '../lib/myPropertyApi';
import { useAuth } from '../lib/clerk';
import { useToast } from '../hooks/useToast';

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
  const toast = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ApartmentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedApartment, setSelectedApartment] = useState<ApartmentSearchResult | null>(null);
  
  // 내 집 등록 상태
  const [nickname, setNickname] = useState('우리집');
  const [exclusiveArea, setExclusiveArea] = useState('');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const bgClass = isDarkMode ? 'bg-slate-800' : 'bg-white';
  const borderClass = isDarkMode ? 'border-slate-700' : 'border-slate-200';

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
        const results = await searchApartments(searchQuery, token);
        setSearchResults(results);
      } catch (error) {
        console.error('Failed to search apartments:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, isSignedIn, getToken]);

  // 모달 닫을 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedApartment(null);
      setNickname('우리집');
      setExclusiveArea('');
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
      toast.error('필수 정보를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error('로그인이 필요합니다.');
        return;
      }

      const propertyData: MyPropertyCreate = {
        apt_id: selectedApartment.apt_id,
        nickname: nickname || '우리집',
        exclusive_area: parseFloat(exclusiveArea) || 0,
        current_market_price: undefined,
        memo: memo || undefined,
      };

      await createMyProperty(propertyData, token);
      
      toast.success('내 집이 등록되었습니다.');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Failed to create my property:', error);
      toast.error(error.message || '내 집 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && isOpen) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className={`${bgClass} ${borderClass} max-w-md max-h-[90vh] overflow-hidden`}
        onEscapeKeyDown={(e) => {
          onClose();
        }}
        style={{ 
          backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', 
          borderColor: isDarkMode ? '#334155' : '#e2e8f0',
        }}
      >
        <div className="p-6 flex flex-col flex-1 overflow-hidden">
          <DialogHeader className="mb-4">
            <DialogTitle className={textPrimary}>
              {selectedApartment ? '내 집 정보 입력' : '아파트 검색'}
            </DialogTitle>
            <DialogDescription className={textSecondary}>
              {selectedApartment
                ? '내 집 정보를 입력해주세요'
                : '등록할 아파트를 검색해주세요'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
          {!selectedApartment ? (
            // 검색 화면
            <div className="space-y-4">
              {/* 검색 입력창 */}
              <div className="flex items-center gap-2">
                <Search className={`w-5 h-5 ${textSecondary} flex-shrink-0`} />
                <Input
                  type="text"
                  placeholder="아파트명 또는 주소를 입력해주세요 (2글자 이상)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`flex-1 ${isDarkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}
                  autoFocus
                />
              </div>

              {/* 검색 결과 */}
              {isSearching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className={`w-6 h-6 animate-spin ${textSecondary}`} />
                </div>
              )}

              {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className={`text-center py-8 ${textSecondary}`}>
                  검색 결과가 없습니다.
                </div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {searchResults.map((apt) => (
                    <motion.button
                      key={apt.apt_id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleApartmentSelect(apt)}
                      className={`w-full text-left p-4 rounded-xl transition-all ${
                        isDarkMode
                          ? 'bg-slate-700 hover:bg-slate-600 border border-slate-600'
                          : 'bg-slate-50 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${
                          isDarkMode ? 'bg-sky-500/20 text-sky-400' : 'bg-sky-100 text-sky-600'
                        }`}>
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-bold ${textPrimary} mb-1`}>{apt.apt_name}</h3>
                          <p className={`text-sm ${textSecondary} line-clamp-1`}>{apt.address}</p>
                          {apt.price && (
                            <p className={`text-xs mt-1 ${textSecondary}`}>{apt.price}</p>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // 내 집 등록 화면
            <div className="space-y-4">
              {/* 선택한 아파트 정보 */}
              <div className={`p-4 rounded-xl ${
                isDarkMode ? 'bg-slate-700 border border-slate-600' : 'bg-slate-50 border border-slate-200'
              }`}>
                <div className="flex items-start gap-3">
                  <button
                    onClick={handleBackToSearch}
                    className={`p-1 rounded-lg hover:bg-slate-600 transition-colors ${
                      isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="flex-1">
                    <h3 className={`font-bold ${textPrimary} mb-1`}>{selectedApartment.apt_name}</h3>
                    <p className={`text-sm ${textSecondary}`}>{selectedApartment.address}</p>
                  </div>
                </div>
              </div>

              {/* 별칭 */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${textPrimary}`}>
                  별칭 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="예: 우리집, 투자용"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className={isDarkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}
                />
              </div>

              {/* 전용면적 */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${textPrimary}`}>
                  전용면적 (㎡) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  placeholder="예: 84.5"
                  value={exclusiveArea}
                  onChange={(e) => setExclusiveArea(e.target.value)}
                  className={isDarkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}
                />
              </div>

              {/* 메모 */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${textSecondary}`}>
                  메모 <span className="text-xs text-slate-500">선택</span>
                </label>
                <textarea
                  placeholder="메모를 입력해주세요"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  className={`w-full rounded-md border px-3 py-2 text-sm resize-none ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500'
                      : 'bg-white border-slate-200 placeholder:text-slate-400'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500`}
                />
              </div>
            </div>
          )}
          </div>

          {/* 버튼 영역 */}
          {selectedApartment && (
            <div className="flex gap-2 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="outline"
              onClick={handleBackToSearch}
              className="flex-1"
              disabled={isSubmitting}
            >
              뒤로가기
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1"
              disabled={isSubmitting || !exclusiveArea || parseFloat(exclusiveArea) <= 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  등록 중...
                </>
              ) : (
                '등록하기'
              )}
            </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
