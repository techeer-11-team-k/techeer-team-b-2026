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
    <div className={`flex items-center bg-slate-100 rounded-lg p-1 gap-1 h-10 flex-shrink-0 ${className}`}>
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`px-4 py-[6px] text-[13px] font-bold rounded-md transition-all ${
            value === option
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
};
