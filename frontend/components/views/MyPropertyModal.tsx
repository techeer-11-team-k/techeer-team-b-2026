import React, { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import {
  fetchApartmentExclusiveAreas,
  fetchMyPropertyDetail,
  createMyProperty,
  updateMyProperty,
  setAuthToken
} from '../../services/api';

interface MyPropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
  aptId: number | string;
  apartmentName: string;
  myPropertyId?: number | null;
  transactions: Array<{ area?: string; price: number }>;
  onSuccess: (data: { property_id: number; exclusive_area: number }) => void;
}

interface MyPropertyForm {
  nickname: string;
  exclusive_area: number;
  purchase_price: string;
  purchase_date: string;
  memo: string;
}

export const MyPropertyModal: React.FC<MyPropertyModalProps> = ({
  isOpen,
  onClose,
  isEditMode,
  aptId,
  apartmentName,
  myPropertyId,
  transactions,
  onSuccess
}) => {
  const { getToken } = useClerkAuth();
  const [form, setForm] = useState<MyPropertyForm>({
    nickname: '',
    exclusive_area: 84,
    purchase_price: '',
    purchase_date: '',
    memo: ''
  });
  const [errors, setErrors] = useState<{ purchase_price?: string; purchase_date?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exclusiveAreaOptions, setExclusiveAreaOptions] = useState<number[]>([]);
  const [isLoadingExclusiveAreas, setIsLoadingExclusiveAreas] = useState(false);

  // 전용면적별 가격 계산 (거래 내역 기반)
  const getPriceForArea = useMemo(() => {
    return (area: number): number | null => {
      // 해당 면적과 유사한 거래 내역 찾기 (±5㎡ 허용)
      const similarTransactions = transactions.filter(tx => {
        if (!tx.area || tx.area === '-') return false;
        const txArea = parseFloat(tx.area.replace(/[^0-9.]/g, ''));
        if (isNaN(txArea)) return false;
        return Math.abs(txArea - area) <= 5;
      });

      if (similarTransactions.length === 0) return null;
      
      // 평균 가격 계산
      const totalPrice = similarTransactions.reduce((sum, tx) => sum + tx.price, 0);
      return Math.round(totalPrice / similarTransactions.length);
    };
  }, [transactions]);

  // 모달이 열릴 때 전용면적 목록 로드
  useEffect(() => {
    if (isOpen && aptId) {
      const loadExclusiveAreas = async () => {
        setIsLoadingExclusiveAreas(true);
        try {
          const response = await fetchApartmentExclusiveAreas(aptId);
          if (response.success && response.data.exclusive_areas.length > 0) {
            setExclusiveAreaOptions(response.data.exclusive_areas);
            if (!isEditMode || !myPropertyId) {
              setForm(prev => ({
                ...prev,
                exclusive_area: response.data.exclusive_areas[0]
              }));
            }
          }
        } catch (error) {
          console.error('전용면적 목록 로드 실패:', error);
        } finally {
          setIsLoadingExclusiveAreas(false);
        }
      };
      
      loadExclusiveAreas();
    }
  }, [isOpen, aptId, isEditMode, myPropertyId]);

  // 수정 모드: 모달이 열릴 때 기존 자산 데이터 로드 후 폼에 반영
  useEffect(() => {
    if (isOpen && isEditMode && myPropertyId) {
      const loadExistingProperty = async () => {
        try {
          const response = await fetchMyPropertyDetail(myPropertyId);
          if (response.success && response.data) {
            const p = response.data;
            setForm({
              nickname: p.nickname || '',
              exclusive_area: p.exclusive_area ?? 84,
              purchase_price: p.purchase_price != null ? String(p.purchase_price) : '',
              purchase_date: p.purchase_date || '',
              memo: p.memo || ''
            });
          }
        } catch (error) {
          console.error('내 자산 상세 로드 실패:', error);
        }
      };
      loadExistingProperty();
    }
  }, [isOpen, isEditMode, myPropertyId]);

  // 전용면적 변경 시 가격 자동 업데이트
  useEffect(() => {
    if (isOpen && form.exclusive_area) {
      const priceForArea = getPriceForArea(form.exclusive_area);
      if (priceForArea !== null && !form.purchase_price) {
        // 구매가가 비어있을 때만 자동으로 설정
        setForm(prev => ({
          ...prev,
          purchase_price: String(Math.round(priceForArea / 10000)) // 만원 단위로 변환
        }));
        setErrors(prev => ({ ...prev, purchase_price: undefined }));
      }
    }
  }, [form.exclusive_area, isOpen, getPriceForArea]);

  const purchasePriceNumber = useMemo(() => {
    const n = Number(form.purchase_price);
    return Number.isFinite(n) ? n : NaN;
  }, [form.purchase_price]);

  const isFormValid = useMemo(() => {
    return Number.isFinite(purchasePriceNumber) && purchasePriceNumber > 0 && Boolean(form.purchase_date);
  }, [purchasePriceNumber, form.purchase_date]);

  const validate = () => {
    const nextErrors: { purchase_price?: string; purchase_date?: string } = {};

    if (!Number.isFinite(purchasePriceNumber) || purchasePriceNumber <= 0) {
      nextErrors.purchase_price = '구매가를 입력해주세요. (0보다 큰 숫자)';
    }
    if (!form.purchase_date) {
      nextErrors.purchase_date = '매입일을 선택해주세요.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // 폼 제출
  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (token) setAuthToken(token);

      const priceForArea = getPriceForArea(form.exclusive_area);
      const currentMarketPrice = priceForArea ? Math.round(priceForArea / 10000) : undefined;

      if (isEditMode && myPropertyId) {
        // 수정 모드: updateMyProperty 호출
        const updateData = {
          nickname: form.nickname || apartmentName,
          exclusive_area: form.exclusive_area,
          current_market_price: currentMarketPrice,
          purchase_price: parseInt(form.purchase_price, 10),
          purchase_date: form.purchase_date,
          memo: form.memo || undefined
        };
        const response = await updateMyProperty(myPropertyId, updateData);
        if (response.success) {
          onSuccess({ property_id: myPropertyId, exclusive_area: form.exclusive_area });
          onClose();
          alert('내 자산 정보가 수정되었습니다.');
        }
      } else {
        // 추가 모드: createMyProperty 호출
        const aptIdNumber = typeof aptId === 'number' ? aptId : Number(aptId);
        if (!Number.isFinite(aptIdNumber)) {
          alert('아파트 ID가 올바르지 않습니다.');
          return;
        }
        const data = {
          apt_id: aptIdNumber,
          nickname: form.nickname || apartmentName,
          exclusive_area: form.exclusive_area,
          current_market_price: currentMarketPrice,
          purchase_price: parseInt(form.purchase_price, 10),
          purchase_date: form.purchase_date,
          memo: form.memo || undefined
        };
        const response = await createMyProperty(data);
        if (response.success) {
          onSuccess({ 
            property_id: response.data.property_id, 
            exclusive_area: form.exclusive_area 
          });
          onClose();
          alert('내 자산에 추가되었습니다.');
          // 폼 초기화
          setForm({
            nickname: '',
            exclusive_area: exclusiveAreaOptions[0] || 84,
            purchase_price: '',
            purchase_date: '',
            memo: ''
          });
        }
      }
    } catch (error) {
      console.error(isEditMode && myPropertyId ? '내 자산 수정 실패:' : '내 자산 추가 실패:', error);
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900">
              {isEditMode ? '내 자산 정보 수정' : '내 자산에 추가'}
            </h3>
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[13px] text-slate-500 mt-1">{apartmentName}</p>
        </div>
        
        {/* 폼 내용 */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* 별칭 */}
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">별칭</label>
            <input 
              type="text"
              value={form.nickname}
              onChange={(e) => setForm(prev => ({ ...prev, nickname: e.target.value }))}
              placeholder={apartmentName}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
            />
          </div>
          
          {/* 전용면적 */}
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">전용면적 (㎡)</label>
            {isLoadingExclusiveAreas ? (
              <div className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium bg-slate-50 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                <span className="text-slate-500">전용면적 목록 로딩 중...</span>
              </div>
            ) : (
              <select
                value={form.exclusive_area}
                onChange={(e) => setForm(prev => ({ ...prev, exclusive_area: Number(e.target.value) }))}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all bg-white"
              >
                {exclusiveAreaOptions.length > 0 ? (
                  exclusiveAreaOptions.map(area => {
                    const pyeong = Math.round(area / 3.3058);
                    return (
                      <option key={area} value={area}>
                        {area.toFixed(2)}㎡ (약 {pyeong}평)
                      </option>
                    );
                  })
                ) : (
                  <>
                    <option value={59}>59㎡ (약 18평)</option>
                    <option value={84}>84㎡ (약 25평)</option>
                    <option value={102}>102㎡ (약 31평)</option>
                    <option value={114}>114㎡ (약 34평)</option>
                  </>
                )}
              </select>
            )}
            {exclusiveAreaOptions.length > 0 && (
              <p className="text-[11px] text-slate-400 mt-1">
                실제 거래 내역 기반 전용면적 목록
              </p>
            )}
          </div>
          
          {/* 구매가 */}
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">
              구매가 (만원){' '}
              <span className="text-[12px] font-bold text-red-600">(필수)</span>
            </label>
            <input 
              type="number"
              value={form.purchase_price}
              required
              min={1}
              onChange={(e) => {
                setForm(prev => ({ ...prev, purchase_price: e.target.value }));
                setErrors(prev => ({ ...prev, purchase_price: undefined }));
              }}
              placeholder="예: 85000"
              className={`w-full px-4 py-3 rounded-xl border text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all ${errors.purchase_price ? 'border-red-300 bg-red-50/30' : 'border-slate-200'}`}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              {form.purchase_price && `${(Number(form.purchase_price) / 10000).toFixed(1)}억원`}
            </p>
            {errors.purchase_price && (
              <p className="text-[11px] text-red-600 mt-1">{errors.purchase_price}</p>
            )}
          </div>
          
          {/* 매입일 */}
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">
              매입일{' '}
              <span className="text-[12px] font-bold text-red-600">(필수)</span>
            </label>
            <input 
              type="date"
              value={form.purchase_date}
              required
              onChange={(e) => {
                setForm(prev => ({ ...prev, purchase_date: e.target.value }));
                setErrors(prev => ({ ...prev, purchase_date: undefined }));
              }}
              className={`w-full px-4 py-3 rounded-xl border text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all ${errors.purchase_date ? 'border-red-300 bg-red-50/30' : 'border-slate-200'}`}
            />
            {errors.purchase_date && (
              <p className="text-[11px] text-red-600 mt-1">{errors.purchase_date}</p>
            )}
          </div>
          
          {/* 메모 */}
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">메모</label>
            <textarea 
              value={form.memo}
              onChange={(e) => setForm(prev => ({ ...prev, memo: e.target.value }))}
              placeholder="메모를 입력하세요"
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all resize-none"
            />
          </div>
        </div>
        
        {/* 푸터 버튼 */}
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-[15px] hover:bg-slate-50 transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !isFormValid}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                저장 중...
              </>
            ) : (
              isEditMode ? '수정하기' : '추가하기'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
