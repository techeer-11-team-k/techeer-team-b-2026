import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glass?: boolean;
  noise?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  glass = false,
  noise = false,
  ...divProps
}) => {
  const baseStyle = "rounded-[24px] transition-all duration-300 relative overflow-hidden";
  
  // Updated to match CryptoMind style: bright white with soft shadow
  const solidStyle = "bg-white border border-slate-100/80 hover:border-slate-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] shadow-[0_2px_8px_rgba(0,0,0,0.04)]";
  const glassStyle = "glass-morphism shadow-glass";
  
  return (
    <div 
      {...divProps}
      className={`${baseStyle} ${glass ? glassStyle : solidStyle} ${noise ? 'bg-noise' : ''} ${className} ${divProps.onClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
    >
      {children}
    </div>
  );
};