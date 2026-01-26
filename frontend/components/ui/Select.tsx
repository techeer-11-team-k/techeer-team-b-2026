import React from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  width?: string;
  size?: 'sm' | 'md' | 'lg';
  containerClassName?: string;
}

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  className = '',
  placeholder,
  ariaLabel,
  icon,
  width,
  size = 'md',
  containerClassName = ''
}) => {
  const sizeClasses = {
    sm: 'h-9 text-[13px] pl-8 pr-7',
    md: 'h-10 text-[14px] pl-9 pr-7',
    lg: 'h-10 text-[15px] pl-9 pr-8'
  };

  const baseClasses = `w-full ${sizeClasses[size]} font-bold bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none appearance-none cursor-pointer hover:bg-slate-50 transition-colors ${className}`;

  const containerClasses = `relative ${width || ''} ${containerClassName || (width ? 'flex-shrink-0' : '')}`;

  return (
    <>
      <style>{`
        select.select-custom-dropdown {
          outline: none !important;
        }
        select.select-custom-dropdown:focus,
        select.select-custom-dropdown:active {
          outline: none !important;
          border-color: #e2e8f0 !important;
          box-shadow: none !important;
        }
        select.select-custom-dropdown option {
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 500;
          color: #334155;
          background-color: white;
          border: none;
          line-height: 1.5;
        }
        select.select-custom-dropdown option:hover {
          background-color: #f1f5f9 !important;
          color: #1e293b;
        }
        select.select-custom-dropdown option:checked {
          background-color: #f0f3f6 !important;
          color: #334155 !important;
          font-weight: 500;
        }
        select.select-custom-dropdown option:focus {
          background-color: #f0f3f6 !important;
          color: #334155;
        }
      `}</style>
      <div className={containerClasses.trim()}>
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {icon}
          </div>
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseClasses} select-custom-dropdown`}
          aria-label={ariaLabel}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          <div className="rounded-lg">
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          </div>
        </select>
      </div>
    </>
  );
};
