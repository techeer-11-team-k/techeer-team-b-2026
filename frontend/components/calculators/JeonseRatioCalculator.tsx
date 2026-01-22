import React, { useState } from 'react';
import { Calculator } from 'lucide-react';

export const JeonseRatioCalculator: React.FC = () => {
  const [jeonsePrice, setJeonsePrice] = useState<string>('');
  const [salePrice, setSalePrice] = useState<string>('');
  const [result, setResult] = useState<number | null>(null);

  const calculateRatio = () => {
    const jeonse = parseFloat(jeonsePrice.replace(/,/g, '')) || 0;
    const sale = parseFloat(salePrice.replace(/,/g, '')) || 0;

    if (jeonse === 0 || sale === 0) {
      setResult(null);
      return;
    }

    const ratio = (jeonse / sale) * 100;
    setResult(parseFloat(ratio.toFixed(2)));
  };

  const formatNumber = (value: string) => {
    return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const getRatioStatus = (ratio: number) => {
    if (ratio >= 80) return { text: '매우 높음', color: 'text-red-500' };
    if (ratio >= 70) return { text: '높음', color: 'text-orange-500' };
    if (ratio >= 60) return { text: '보통', color: 'text-yellow-500' };
    if (ratio >= 50) return { text: '낮음', color: 'text-blue-500' };
    return { text: '매우 낮음', color: 'text-green-500' };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-brand-blue" />
        <h3 className="font-black text-slate-900 text-[16px]">전세가율 계산기</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
            전세금 (원)
          </label>
          <input
            type="text"
            value={jeonsePrice}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9]/g, '');
              setJeonsePrice(formatNumber(value));
            }}
            placeholder="예: 300,000,000"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 text-[15px] font-bold text-slate-900 placeholder:text-slate-400 transition-all"
          />
        </div>

        <div>
          <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
            매매가 (원)
          </label>
          <input
            type="text"
            value={salePrice}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9]/g, '');
              setSalePrice(formatNumber(value));
            }}
            placeholder="예: 500,000,000"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 text-[15px] font-bold text-slate-900 placeholder:text-slate-400 transition-all"
          />
        </div>

        <button
          onClick={calculateRatio}
          className="w-full py-3 bg-brand-blue text-white rounded-xl font-black text-[15px] hover:bg-brand-blue/90 active:scale-95 transition-all shadow-soft"
        >
          계산하기
        </button>

        {result !== null && (
          <div className="mt-4 space-y-3">
            <div className="p-4 bg-gradient-to-br from-brand-blue/10 to-indigo-50 rounded-xl border border-brand-blue/20">
              <div className="text-[12px] font-bold text-slate-500 mb-1">전세가율</div>
              <div className="text-2xl font-black text-brand-blue">
                {result.toFixed(2)}%
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-[12px] font-bold text-slate-500 mb-1">평가</div>
              <div className={`text-[15px] font-black ${getRatioStatus(result).color}`}>
                {getRatioStatus(result).text}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {result >= 70 ? '전세금이 높아 매매가 대비 부담이 큽니다' : 
                 result >= 60 ? '적정 수준의 전세가율입니다' : 
                 '전세금이 낮아 매매가 대비 유리합니다'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
