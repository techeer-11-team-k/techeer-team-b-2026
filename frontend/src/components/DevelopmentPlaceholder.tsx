/**
 * 개발 중 플레이스홀더 컴포넌트
 * 
 * 더미 데이터 대신 "개발 중입니다" 메시지를 표시합니다.
 * UI는 유지하되 내용만 변경합니다.
 */
import React from 'react';

interface DevelopmentPlaceholderProps {
  title?: string;
  message?: string;
  isDarkMode?: boolean;
  className?: string;
}

export default function DevelopmentPlaceholder({ 
  title = '개발 중입니다',
  message = '이 기능은 현재 개발 중입니다.',
  isDarkMode = false,
  className = ''
}: DevelopmentPlaceholderProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      <div className={`text-center ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
        <div className="text-4xl mb-4">🚧</div>
        <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
          {title}
        </h3>
        <p className="text-sm">
          {message}
        </p>
      </div>
    </div>
  );
}
