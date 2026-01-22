import React from 'react';

interface SemiCircleGaugeProps {
  value: number; // 0-100
  target: number; // 목표치
  currentValue: number; // 현재 수익률
  size?: number;
}

export const SemiCircleGauge: React.FC<SemiCircleGaugeProps> = ({ 
  value, 
  target, 
  currentValue,
  size = 200 
}) => {
  const percentage = Math.min(100, Math.max(0, (value / target) * 100));
  const radius = size * 0.4;
  const centerX = size / 2;
  const centerY = size / 2;
  const startAngle = 180;
  const endAngle = 0;
  
  // Convert angles to radians
  const startAngleRad = (startAngle * Math.PI) / 180;
  const endAngleRad = (endAngle * Math.PI) / 180;
  
  // Calculate start and end points
  const startX = centerX + radius * Math.cos(startAngleRad);
  const startY = centerY + radius * Math.sin(startAngleRad);
  const endX = centerX + radius * Math.cos(endAngleRad);
  const endY = centerY + radius * Math.sin(endAngleRad);
  
  // Calculate progress end point
  const progressAngle = startAngle + (endAngle - startAngle) * (percentage / 100);
  const progressAngleRad = (progressAngle * Math.PI) / 180;
  const progressX = centerX + radius * Math.cos(progressAngleRad);
  const progressY = centerY + radius * Math.sin(progressAngleRad);
  
  const color = percentage >= 100 ? '#10b981' : percentage >= 70 ? '#3b82f6' : percentage >= 40 ? '#f59e0b' : '#ef4444';
  const largeArcFlag = percentage > 50 ? 1 : 0;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size / 2 + 40 }}>
        <svg 
          width={size} 
          height={size / 2 + 40} 
          viewBox={`0 0 ${size} ${size / 2 + 40}`}
          className="overflow-visible"
        >
          {/* Background arc */}
          <path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={size * 0.06}
            strokeLinecap="round"
          />
          {/* Progress arc */}
          <path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${progressX} ${progressY}`}
            fill="none"
            stroke={color}
            strokeWidth={size * 0.06}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Center text */}
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2">
          <div className="text-center">
            <div className="text-[32px] font-black tabular-nums leading-none" style={{ color }}>
              {currentValue.toFixed(1)}%
            </div>
            <div className="text-[12px] font-bold text-slate-500 mt-1">
              목표: {target}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
