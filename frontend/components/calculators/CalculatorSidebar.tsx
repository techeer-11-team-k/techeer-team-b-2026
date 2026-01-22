import React, { useState } from 'react';
import { X, ChevronRight, Calculator, ChevronLeft } from 'lucide-react';
import { CapitalGainsTaxCalculator } from './CapitalGainsTaxCalculator';
import { AcquisitionTaxCalculator } from './AcquisitionTaxCalculator';
import { JeonseRatioCalculator } from './JeonseRatioCalculator';

interface CalculatorSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

type CalculatorType = 'capital-gains' | 'acquisition' | 'jeonse' | null;

export const CalculatorSidebar: React.FC<CalculatorSidebarProps> = ({ isOpen, onToggle }) => {
  const [activeCalculator, setActiveCalculator] = useState<CalculatorType>(null);

  const calculators = [
    { id: 'capital-gains' as CalculatorType, label: '양도소득세', icon: Calculator },
    { id: 'acquisition' as CalculatorType, label: '취득세', icon: Calculator },
    { id: 'jeonse' as CalculatorType, label: '전세가율', icon: Calculator },
  ];

  const handleCalculatorClick = (id: CalculatorType) => {
    setActiveCalculator(activeCalculator === id ? null : id);
  };

  const renderCalculator = () => {
    switch (activeCalculator) {
      case 'capital-gains':
        return <CapitalGainsTaxCalculator />;
      case 'acquisition':
        return <AcquisitionTaxCalculator />;
      case 'jeonse':
        return <JeonseRatioCalculator />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Floating Toggle Button - Always visible */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed right-6 bottom-24 md:bottom-8 z-[100] 
                     w-14 h-14 rounded-full 
                     bg-brand-blue text-white 
                     shadow-[0_8px_24px_rgba(49,130,246,0.4)]
                     hover:shadow-[0_12px_32px_rgba(49,130,246,0.5)]
                     hover:scale-110
                     active:scale-95
                     flex items-center justify-center
                     transition-all duration-300
                     group"
          title="부동산 계산기"
        >
          <Calculator className="w-6 h-6 group-hover:rotate-12 transition-transform" />
        </button>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[95] transition-opacity"
          onClick={onToggle}
        />
      )}

      {/* Floating Sidebar */}
      <div className={`
        fixed left-6 bottom-6 md:top-20 md:bottom-auto
        w-[360px] max-w-[calc(100vw-3rem)]
        max-h-[calc(100vh-8rem)] md:max-h-[calc(100vh-6rem)]
        bg-white/95 backdrop-blur-xl
        rounded-3xl
        shadow-[0_20px_60px_rgba(0,0,0,0.3)]
        border border-slate-200
        z-[100]
        flex flex-col
        transition-all duration-300 ease-out
        ${isOpen ? 'translate-x-0 opacity-100 scale-100' : '-translate-x-[120%] opacity-0 scale-95'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white/80 backdrop-blur-sm rounded-t-3xl">
          <h2 className="text-xl font-black text-slate-900">부동산 계산기</h2>
          <button
            onClick={onToggle}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Calculator List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {!activeCalculator ? (
            <>
              {calculators.map((calc) => (
                <button
                  key={calc.id}
                  onClick={() => handleCalculatorClick(calc.id)}
                  className="w-full p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-blue hover:bg-brand-blue/5 transition-all text-left group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-brand-blue/10 text-brand-blue group-hover:bg-brand-blue group-hover:text-white transition-colors">
                        <calc.icon className="w-5 h-5" />
                      </div>
                      <span className="font-black text-slate-900 text-[15px]">{calc.label}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-brand-blue transition-colors" />
                  </div>
                </button>
              ))}
            </>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => setActiveCalculator(null)}
                className="flex items-center gap-2 text-[13px] font-bold text-slate-500 hover:text-slate-900 transition-colors mb-2"
              >
                <ChevronLeft className="w-4 h-4" />
                목록으로 돌아가기
              </button>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                {renderCalculator()}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
