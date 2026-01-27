import React from 'react';

interface ToggleButtonGroupProps {
  options: string[];
  value: string; // 현재 선택된 값 - 제어 컴포넌트 패턴으로 외부에서 선택 상태를 관리하기 위해 필요
  onChange: (value: string) => void;
  className?: string;
}

export const ToggleButtonGroup: React.FC<ToggleButtonGroupProps> = ({
  options,
  value,
  onChange,
  className = ''
}) => {
  return (
    <div className={`flex items-center bg-slate-100 border border-slate-200 rounded-xl p-1 gap-1 flex-shrink-0 shadow-inner ${className}`}>
      {options.map((option, index) => (
        <React.Fragment key={option}>
          <button
            onClick={() => onChange(option)}
            className={`px-3 py-1.5 text-[13px] font-bold rounded-lg transition-all ${
              value === option
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            {option}
          </button>
          {index < options.length - 1 && (
            <div className="h-4 w-px bg-slate-300"></div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
