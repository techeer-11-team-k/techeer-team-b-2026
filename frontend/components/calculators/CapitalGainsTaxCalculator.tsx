import React, { useState } from 'react';
import { Calculator } from 'lucide-react';

export const CapitalGainsTaxCalculator: React.FC = () => {
  const [acquisitionPrice, setAcquisitionPrice] = useState<string>('');
  const [transferPrice, setTransferPrice] = useState<string>('');
  const [holdingPeriod, setHoldingPeriod] = useState<string>('');
  const [isFirstHome, setIsFirstHome] = useState<boolean>(false);
  const [result, setResult] = useState<number | null>(null);

  const calculateTax = () => {
    const acquisition = parseFloat(acquisitionPrice.replace(/,/g, '')) || 0;
    const transfer = parseFloat(transferPrice.replace(/,/g, '')) || 0;
    const period = parseFloat(holdingPeriod) || 0;

    if (acquisition === 0 || transfer === 0) {
      setResult(null);
      return;
    }

    const gain = transfer - acquisition;
    if (gain <= 0) {
      setResult(0);
      return;
    }

    let taxRate = 0;
    
    // 보유기간에 따른 세율
    if (period >= 2) {
      // 2년 이상 보유: 6~45% (소득구간별)
      // 간단화: 1억원 이하 6%, 1억~12억 15%, 12억 이상 25%
      if (gain <= 100000000) {
        taxRate = 0.06;
      } else if (gain <= 1200000000) {
        taxRate = 0.15;
      } else {
        taxRate = 0.25;
      }
    } else {
      // 2년 미만: 70%
      taxRate = 0.70;
    }

    // 1세대 1주택 공제 (최대 1.2억원)
    let deduction = 0;
    if (isFirstHome && period >= 2) {
      deduction = Math.min(120000000, gain);
    }

    const taxableGain = Math.max(0, gain - deduction);
    const tax = taxableGain * taxRate;

    setResult(Math.round(tax));
  };

  const formatNumber = (value: string) => {
    return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-brand-blue" />
        <h3 className="font-black text-slate-900 text-[16px]">양도소득세 계산기</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
            취득가액 (원)
          </label>
          <input
            type="text"
            value={acquisitionPrice}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9]/g, '');
              setAcquisitionPrice(formatNumber(value));
            }}
            placeholder="예: 500,000,000"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 text-[15px] font-bold text-slate-900 placeholder:text-slate-400 transition-all"
          />
        </div>

        <div>
          <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
            양도가액 (원)
          </label>
          <input
            type="text"
            value={transferPrice}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9]/g, '');
              setTransferPrice(formatNumber(value));
            }}
            placeholder="예: 700,000,000"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 text-[15px] font-bold text-slate-900 placeholder:text-slate-400 transition-all"
          />
        </div>

        <div>
          <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
            보유기간 (년)
          </label>
          <input
            type="number"
            value={holdingPeriod}
            onChange={(e) => setHoldingPeriod(e.target.value)}
            placeholder="예: 3"
            min="0"
            step="0.1"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 text-[15px] font-bold text-slate-900 placeholder:text-slate-400 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="firstHome"
            checked={isFirstHome}
            onChange={(e) => setIsFirstHome(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
          />
          <label htmlFor="firstHome" className="text-[13px] font-bold text-slate-700 cursor-pointer">
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
            <div className="text-[12px] font-bold text-slate-500 mb-1">예상 양도소득세</div>
            <div className="text-2xl font-black text-brand-blue">
              {result.toLocaleString()}원
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
