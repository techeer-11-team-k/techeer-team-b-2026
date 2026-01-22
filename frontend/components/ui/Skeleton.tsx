import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = "" }) => {
  return (
    <div className={`animate-shimmer bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-[length:1000px_100%] ${className}`} />
  );
};