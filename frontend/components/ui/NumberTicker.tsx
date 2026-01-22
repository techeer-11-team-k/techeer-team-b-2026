import React, { useEffect, useState } from 'react';

interface NumberTickerProps {
  value: number;
  duration?: number; // ms
  formatter?: (val: number) => string;
  className?: string;
}

export const NumberTicker: React.FC<NumberTickerProps> = ({ 
  value, 
  duration = 1000, 
  formatter = (v) => v.toLocaleString(),
  className = "" 
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrameId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percentage = Math.min(progress / duration, 1);
      
      // Easing function: EaseOutExpo
      const ease = percentage === 1 ? 1 : 1 - Math.pow(2, -10 * percentage);
      
      const current = Math.floor(value * ease);
      setDisplayValue(current);

      if (progress < duration) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value, duration]);

  return <span className={className}>{formatter(displayValue)}</span>;
};