import React, { useState } from 'react';
import { Calculator } from 'lucide-react';

export const AcquisitionTaxCalculator: React.FC = () => {
  const [propertyPrice, setPropertyPrice] = useState<string>('');
  const [isFirstHome, setIsFirstHome] = useState<boolean>(false);
  const [propertyType, setPropertyType] = useState<'apartment' | 'house' | 'land'>('apartment');
  const [result, setResult] = useState<number | null>(null);

  const calculateTax = () => {
    const price = parseFloat(propertyPrice.replace(/,/g, '')) || 0;

    if (price === 0) {
      setResult(null);
      return;
    }

    let taxRate = 0;
    let baseRate = 0;

    // 부동산 유형별 기본 세율
    if (propertyType === 'apartment') {
      baseRate = 0.01; // 1%
    } else if (propertyType === 'house') {
      baseRate = 0.01; // 1%
    } else {
      baseRate = 0.02; // 2% (토지)
    }

    // 1세대 1주택 공제
    if (isFirstHome) {
      // 6억원 이하: 0.1%, 6억~9억: 0.2%, 9억~12억: 0.3%, 12억 이상: 기본세율
      if (price <= 600000000) {
        taxRate = 0.001; // 0.1%
      } else if (price <= 900000000) {
        taxRate = 0.002; // 0.2%
      } else if (price <= 1200000000) {
        taxRate = 0.003; // 0.3%
      } else {
        taxRate = baseRate;
      }
    } else {
      // 다주택자: 기본세율의 2배
      taxRate = baseRate * 2;
    }

    const tax = price * taxRate;
    setResult(Math.round(tax));
  };

  const formatNumber = (value: string) => {
    return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-brand-blue" />
        <h3 className="font-black text-slate-900 text-[16px]">취득세 계산기</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
            부동산 가액 (원)
          </label>
          <input
            type="text"
            value={propertyPrice}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9]/g, '');
              setPropertyPrice(formatNumber(value));
            }}
            placeholder="예: 500,000,000"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 text-[15px] font-bold text-slate-900 placeholder:text-slate-400 transition-all"
          />
        </div>

        <div>
          <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
            부동산 유형
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setPropertyType('apartment')}
              className={`py-2 px-3 rounded-lg text-[13px] font-bold transition-all ${
                propertyType === 'apartment'
                  ? 'bg-brand-blue text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              아파트
            </button>
            <button
              onClick={() => setPropertyType('house')}
              className={`py-2 px-3 rounded-lg text-[13px] font-bold transition-all ${
                propertyType === 'house'
                  ? 'bg-brand-blue text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              주택
            </button>
            <button
              onClick={() => setPropertyType('land')}
              className={`py-2 px-3 rounded-lg text-[13px] font-bold transition-all ${
                propertyType === 'land'
                  ? 'bg-brand-blue text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              토지
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="firstHomeAcq"
            checked={isFirstHome}
            onChange={(e) => setIsFirstHome(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
          />
          <label htmlFor="firstHomeAcq" className="text-[13px] font-bold text-slate-700 cursor-pointer">
            1세대 1주택 공제 적용
          </label>
        </div>

        <button
          onClick={calculateTax}
          className="w-full py-3 bg-brand-blue text-white rounded-xl font-black text-[15px] hover:bg-brand-blue/90 active:scale-95 transition-all shadow-soft"
        >
          계산하기
        </button>

        {result !== null && (
          <div className="mt-4 p-4 bg-gradient-to-br from-brand-blue/10 to-indigo-50 rounded-xl border border-brand-blue/20">
            <div className="text-[12px] font-bold text-slate-500 mb-1">예상 취득세</div>
            <div className="text-2xl font-black text-brand-blue">
              {result.toLocaleString()}원
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
