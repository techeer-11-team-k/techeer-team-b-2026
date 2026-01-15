import React from 'react';
import { MapPin } from 'lucide-react';
import { useCurrentAddress } from '../hooks/useCurrentAddress';

interface LocationBadgeProps {
  isDarkMode: boolean;
  className?: string;
}

export default function LocationBadge({ isDarkMode, className = '' }: LocationBadgeProps) {
  const { address, loading, error, fetchCurrentAddress } = useCurrentAddress();

  // 컴포넌트 마운트 시 자동으로 위치 가져오기
  React.useEffect(() => {
    fetchCurrentAddress();
  }, [fetchCurrentAddress]);

  const displayAddress = address || '위치 정보 없음';
  const isLoading = loading;

  return (
    <div 
      className={`flex items-center justify-between p-4 rounded-2xl ${
        isDarkMode ? 'bg-zinc-900' : 'bg-sky-50/50 border border-sky-100'
      } ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <MapPin className={`w-4 h-4 ${isLoading ? 'animate-pulse' : ''} text-sky-500`} />
        <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
          {isLoading ? '위치 확인 중...' : displayAddress}
        </span>
      </div>
      {error && (
        <button
          onClick={fetchCurrentAddress}
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            isDarkMode ? 'bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-white text-sky-700 hover:bg-sky-100'
          } transition-colors`}
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
