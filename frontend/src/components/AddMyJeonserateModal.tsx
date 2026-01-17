import React, { useState, useEffect } from 'react';
import { X, Loader2, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { createMyProperty, MyPropertyCreate } from '../lib/myPropertyApi';
import { useAuth } from '../lib/clerk';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './ui/Toast';

interface AddMyJeonserateModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  apartment: any; // 현재 아파트 정보
  onSuccess?: () => void;
}

export default function AddMyJeonserateModal({
  isOpen,
  onClose,
  isDarkMode,
  apartment,
  onSuccess,
}: AddMyJeonserateModalProps) {
  const { isSignedIn, getToken } = useAuth();
  const toast = useToast();
  
  // 전세 등록 상태
  const [nickname, setNickname] = useState('전세매물');
  const [deposit, setDeposit] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const cardClass = isDarkMode 
    ? 'bg-slate-800/50 border-slate-700' 
    : 'bg-white border-slate-200';

  // 모달 닫을 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setNickname('전세매물');
      setDeposit('');
      setMonthlyRent('');
      setMemo('');
    }
  }, [isOpen]);

  // 숫자만 입력 허용 핸들러
  const handleNumberChange = (value: string, setter: (value: string) => void) => {
    // 숫자만 허용 (콤마 제거 후 숫자만)
    const numericValue = value.replace(/[^0-9]/g, '');
    setter(numericValue);
  };

  const handleSubmit = async () => {
    if (!apartment || !apartment.apt_id || !isSignedIn || !getToken) {
      toast.error('아파트 정보를 확인할 수 없습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error('로그인이 필요합니다.');
        return;
      }

      // memo에 deposit과 monthlyRent 정보 포함
      const memoParts: string[] = [];
      if (deposit) {
        memoParts.push(`전세 보증금: ${parseInt(deposit).toLocaleString()}만원`);
      }
      if (monthlyRent) {
        memoParts.push(`월세: ${parseInt(monthlyRent).toLocaleString()}만원`);
      }
      if (memo) {
        memoParts.push(memo);
      }
      const finalMemo = memoParts.length > 0 ? memoParts.join(', ') : undefined;

      const propertyData: MyPropertyCreate = {
        apt_id: apartment.apt_id,
        nickname: nickname || '전세매물',
        exclusive_area: 1, // 기본값 1㎡
        current_market_price: undefined,
        memo: finalMemo,
      };

      await createMyProperty(propertyData, token);
      
      toast.success('전세매물이 등록되었습니다.');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Failed to create jeonserate:', error);
      toast.error(error.message || '전세매물 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 배경 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`fixed inset-0 z-[9999] backdrop-blur-sm ${isDarkMode ? 'bg-zinc-900/80' : 'bg-black/50'}`}
            onClick={onClose}
          />
          
          {/* 바텀 시트 모달 */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed z-[10000] flex flex-col ${
              isDarkMode ? 'bg-zinc-900' : 'bg-white'
            } rounded-2xl
            bottom-0 left-1/2 -translate-x-1/2
            max-h-[calc(100vh-2rem)]
            mb-4`}
            style={{ 
              marginBottom: '1rem',
              width: '520px',
            }}
          >
            {/* 드래그 핸들 (모바일) */}
            <div className="flex justify-center pt-3 pb-2 sm:hidden">
              <div className={`w-10 h-1 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-300'}`} />
            </div>

            {/* 헤더 */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
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
              
              <h1 className={`text-base font-bold ${textPrimary}`}>
                전세매물 정보 입력
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
            {/* 모달 컨텐츠 영역 높이: 520px 고정값으로 설정 */}
            <div className="px-4 py-6 overflow-y-auto flex-1 h-[520px]">
              <div className="space-y-4">
                {/* 현재 아파트 정보 */}
                {apartment && (
                  <div className={`p-3 rounded-xl border ${cardClass}`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600'
                      }`}>
                        <Home className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${textSecondary} mb-0.5`}>아파트</p>
                        <h3 className={`font-medium text-sm ${textPrimary}`}>{apartment.apt_name || apartment.name || '아파트'}</h3>
                        {apartment.address && (
                          <p className={`text-xs ${textSecondary} line-clamp-1`}>{apartment.address}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                    {/* 별칭 */}
                    <div className={`p-3 rounded-xl border ${cardClass}`}>
                      <label className={`block text-xs font-medium mb-2 ${textPrimary}`}>
                        별칭 <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="text"
                        placeholder="예: 전세매물, 투자용"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className={`h-9 text-sm ${isDarkMode ? 'bg-slate-700/50 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                      />
                    </div>

                    {/* 전세 보증금 */}
                    <div className={`p-3 rounded-xl border ${cardClass}`}>
                      <label className={`block text-xs font-medium mb-2 ${textSecondary}`}>
                        전세 보증금 <span className={`text-xs ${textSecondary}`}>(만원, 선택)</span>
                      </label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="예: 50000"
                        value={deposit}
                        onChange={(e) => handleNumberChange(e.target.value, setDeposit)}
                        className={`h-9 text-sm ${isDarkMode ? 'bg-slate-700/50 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                      />
                      {deposit && (
                        <p className={`text-xs mt-1 ${textSecondary}`}>
                          {parseInt(deposit || '0').toLocaleString()}만원
                        </p>
                      )}
                    </div>

                    {/* 월세 */}
                    <div className={`p-3 rounded-xl border ${cardClass}`}>
                      <label className={`block text-xs font-medium mb-2 ${textSecondary}`}>
                        월세 <span className={`text-xs ${textSecondary}`}>(만원, 선택)</span>
                      </label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="예: 50"
                        value={monthlyRent}
                        onChange={(e) => handleNumberChange(e.target.value, setMonthlyRent)}
                        className={`h-9 text-sm ${isDarkMode ? 'bg-slate-700/50 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                      />
                      {monthlyRent && (
                        <p className={`text-xs mt-1 ${textSecondary}`}>
                          {parseInt(monthlyRent || '0').toLocaleString()}만원
                        </p>
                      )}
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
                    onClick={onClose}
                    className="flex-1 h-10"
                    disabled={isSubmitting}
                  >
                    취소
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    className="flex-1 h-10 bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 text-white"
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
              </div>
            </div>
          </motion.div>
          
          {/* Toast Container */}
          <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} isDarkMode={isDarkMode} />
        </>
      )}
    </AnimatePresence>
  );
}
