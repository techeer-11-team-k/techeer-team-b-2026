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
  const baseStyle = "rounded-[24px] transition-all duration-200 relative overflow-hidden";
  
  // Neumorphism style for mobile, clean style for desktop
  const solidStyle = "bg-white border border-slate-100/80 hover:border-slate-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] md:shadow-[0_2px_8px_rgba(0,0,0,0.04)] md:hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]";
  
  // Mobile neumorphism: subtle inset/outset shadows
  const mobileNeumorphism = "md:shadow-none shadow-[0_8px_16px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)]";
  
  const glassStyle = "glass-morphism shadow-glass";
  
  return (
    <div 
      {...divProps}
      className={`${baseStyle} ${glass ? glassStyle : `${solidStyle} ${mobileNeumorphism}`} ${noise ? 'bg-noise' : ''} ${className} ${divProps.onClick ? 'cursor-pointer active:scale-[0.98] transition-transform duration-150' : ''}`}
    >
      {children}
    </div>
  );
};