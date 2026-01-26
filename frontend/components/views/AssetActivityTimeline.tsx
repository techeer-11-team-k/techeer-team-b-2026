import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, TrendingUp, TrendingDown, Loader2, Home, Activity, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { fetchActivityLogs, ActivityLog, ActivityLogFilters, setAuthToken, ApiError, getAuthToken } from '../../services/api';
import { Card } from '../ui/Card';

type FilterCategory = 'ALL' | 'MY_ASSET' | 'INTEREST';

// 월별로 그룹핑하는 함수 - 로컬 시간대 사용
const groupByMonth = (logs: ActivityLog[]): Record<string, ActivityLog[]> => {
  const grouped: Record<string, ActivityLog[]> = {};
  
  logs.forEach((log) => {
    const date = toLocalTime(log.created_at);
    const monthKey = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
    
    if (!grouped[monthKey]) {
      grouped[monthKey] = [];
    }
    grouped[monthKey].push(log);
  });
  
  // 월별로 정렬 (최신순) 및 각 월 내에서 시간순 정렬
  const sorted: Record<string, ActivityLog[]> = {};
  Object.keys(grouped)
    .sort((a, b) => {
      const [yearA, monthA] = a.split('년 ').map(s => parseInt(s));
      const [yearB, monthB] = b.split('년 ').map(s => parseInt(s));
      if (yearA !== yearB) return yearB - yearA;
      return monthB - monthA;
    })
    .forEach(key => {
      // 각 월 내에서 시간순으로 정렬 (최신순) - 로컬 시간대 사용
      sorted[key] = grouped[key].sort((a, b) => {
        const dateA = toLocalTime(a.created_at).getTime();
        const dateB = toLocalTime(b.created_at).getTime();
        return dateB - dateA; // 최신순
      });
    });
  
  return sorted;
};

// UTC 시간을 사용자 로컬 시간대로 변환
const toLocalTime = (utcDateString: string): Date => {
  // UTC 시간 문자열을 Date 객체로 변환 (이미 UTC로 파싱됨)
  const utcDate = new Date(utcDateString);
  // 브라우저의 로컬 시간대로 자동 변환됨
  return utcDate;
};

// 시간 포맷팅 (년도 + 날짜 + AM/PM 형식) - 로컬 시간대 사용
const formatTime = (dateString: string): string => {
  const date = toLocalTime(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${year}/${month}/${day} ${displayHours}:${displayMinutes} ${ampm}`;
};

// 날짜만 포맷팅 (년도 + 날짜) - 로컬 시간대 사용
const formatDate = (dateString: string): string => {
  const date = toLocalTime(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}/${month}/${day}`;
};

// 타임라인 점 컴포넌트
interface TimelineDotsProps {
  monthKey: string;
  interestLogs: ActivityLog[];
  myAssetLogs: ActivityLog[];
}

const TimelineDots: React.FC<TimelineDotsProps> = ({ monthKey, interestLogs, myAssetLogs }) => {
  const [dotPositions, setDotPositions] = useState<Map<string, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updatePositions = () => {
      if (!containerRef.current) return;

      const positions = new Map<string, number>();
      const containerRect = containerRef.current.getBoundingClientRect();

      // 모든 로그를 날짜별로 그룹핑
      const allLogs = [...interestLogs, ...myAssetLogs];
      const logsByDate = new Map<string, ActivityLog[]>();
      
      allLogs.forEach((log) => {
        const date = new Date(log.created_at);
        const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        if (!logsByDate.has(dateKey)) {
          logsByDate.set(dateKey, []);
        }
        logsByDate.get(dateKey)!.push(log);
      });

      // 각 날짜의 첫 번째 아이템 위치를 기준으로 점 배치
      logsByDate.forEach((logs, dateKey) => {
        // 날짜 역순으로 정렬된 첫 번째 로그 찾기
        const sortedLogs = logs.sort((a, b) => {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          return dateB - dateA; // 최신순
        });
        const firstLog = sortedLogs[0];
        
        const itemElement = document.querySelector(`[data-log-id="${firstLog.id}"]`) as HTMLElement;
        if (itemElement) {
          const itemRect = itemElement.getBoundingClientRect();
          // 아이템의 상단에서 컨테이너의 상단까지의 거리 + 아이템 내부의 top-3 (12px) 위치
          const topPosition = itemRect.top - containerRect.top + 12; // top-3 = 12px
          positions.set(dateKey, topPosition);
        }
      });

      setDotPositions(positions);
    };

    // 초기 위치 계산 (약간의 지연을 두어 DOM이 완전히 렌더링된 후 계산)
    const timeoutId = setTimeout(updatePositions, 100);
    updatePositions();

    // 리사이즈 및 스크롤 이벤트 리스너
    window.addEventListener('resize', updatePositions);
    window.addEventListener('scroll', updatePositions, true);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updatePositions);
      window.removeEventListener('scroll', updatePositions, true);
    };
  }, [interestLogs, myAssetLogs, monthKey]);

  // 날짜별로 그룹핑하고 날짜 역순으로 정렬
  const allLogs = [...interestLogs, ...myAssetLogs];
  const logsByDate = new Map<string, ActivityLog[]>();
  
  allLogs.forEach((log) => {
    const date = new Date(log.created_at);
    const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    if (!logsByDate.has(dateKey)) {
      logsByDate.set(dateKey, []);
    }
    logsByDate.get(dateKey)!.push(log);
  });

  // 날짜별로 정렬 (날짜 역순)
  const sortedDates = Array.from(logsByDate.keys()).sort((a, b) => {
    const dateA = new Date(a).getTime();
    const dateB = new Date(b).getTime();
    return dateB - dateA; // 최신순 (역순)
  });

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      {sortedDates.map((dateKey) => {
        const topPosition = dotPositions.get(dateKey);
        if (topPosition === undefined) return null;

        // 해당 날짜의 로그들 중 관심 목록과 내 자산 모두 확인
        const dateLogs = logsByDate.get(dateKey) || [];
        const hasInterest = dateLogs.some(log => log.category === 'INTEREST');
        const hasMyAsset = dateLogs.some(log => log.category === 'MY_ASSET');
        
        // 둘 다 있으면 보라색, 내 자산만 있으면 노란색, 관심 목록만 있으면 보라색
        const dotColor = hasMyAsset ? 'border-yellow-300' : 'border-purple-300';

        return (
          <div
            key={dateKey}
            className="absolute left-1/2 w-3 h-3 rounded-full border-2 bg-white dark:bg-gray-800 z-10 -translate-x-1/2 pointer-events-auto"
            style={{ top: `${topPosition}px` }}
          >
            <div className={`w-full h-full rounded-full border-2 ${dotColor} bg-white dark:bg-gray-800`} />
          </div>
        );
      })}
    </div>
  );
};

// 이벤트 설명 텍스트 생성 (제목용)
const getEventTitle = (log: ActivityLog): string => {
  const aptName = log.apt_name || '알 수 없음';
  
  switch (log.event_type) {
    case 'ADD':
      return log.category === 'MY_ASSET' 
        ? `${aptName}을(를) 내 자산에 추가했습니다.`
        : `${aptName}을(를) 관심 목록에 추가했습니다.`;
    case 'DELETE':
      return log.category === 'MY_ASSET'
        ? `${aptName}을(를) 내 자산에서 삭제했습니다.`
        : `${aptName}을(를) 관심 목록에서 삭제했습니다.`;
    default:
      return `${aptName} 활동이 기록되었습니다.`;
  }
};

// 가격 변동 설명 텍스트 생성 (가격 변동 전용)
const getPriceChangeDescription = (log: ActivityLog): { title: string; firstLine: string; secondLine: string } | null => {
  if (log.event_type !== 'PRICE_UP' && log.event_type !== 'PRICE_DOWN') {
    return null;
  }

  const aptName = log.apt_name || '알 수 없음';
  const previousPrice = log.previous_price || 0;
  const currentPrice = log.current_price || 0;
  const change = Math.abs(log.price_change || 0);
  const rate = previousPrice > 0 
    ? ((change / previousPrice) * 100).toFixed(2)
    : '0.00';
  
  const isUp = log.event_type === 'PRICE_UP';
  const sign = isUp ? '+' : '-';
  
  return {
    title: aptName,
    firstLine: `${previousPrice.toLocaleString()}만원 -> ${currentPrice.toLocaleString()}만원`,
    secondLine: `${sign}${change.toLocaleString()}만원 (+${rate}%)`
  };
};

// 왼쪽 타임라인 아이템 (관심 목록)
interface LeftTimelineItemProps {
  log: ActivityLog;
  isSelected: boolean;
  onSelect: (logId: number) => void;
}

const LeftTimelineItem: React.FC<LeftTimelineItemProps> = ({ log, isSelected, onSelect }) => {
  const getIcon = () => {
    const iconClass = "w-4 h-4";
    switch (log.event_type) {
      case 'ADD':
        return <Home className={`${iconClass} text-white`} />;
      case 'DELETE':
        return <X className={`${iconClass} text-white`} />;
      case 'PRICE_UP':
        return <TrendingUp className={`${iconClass} text-white`} />;
      case 'PRICE_DOWN':
        return <TrendingDown className={`${iconClass} text-white`} />;
    }
  };

  const getIconBg = () => {
    switch (log.event_type) {
      case 'ADD':
        return 'bg-green-400'; // 연록색
      case 'PRICE_UP':
        return 'bg-red-500'; // 빨간색
      case 'PRICE_DOWN':
        return 'bg-blue-500'; // 파란색
      case 'DELETE':
        return 'bg-gray-400'; // 회색
      default:
        return 'bg-gray-400';
    }
  };

  const isDeleted = log.event_type === 'DELETE';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative mb-6 w-full flex justify-center"
      data-log-id={log.id}
      data-timeline-item="left"
    >
      {/* 카드 */}
      <div
        className={`rounded-2xl p-4 transition-all hover:shadow-xl max-w-[280px] ${
          isDeleted 
            ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]' 
            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)]'
        }`}
      >
        <div className="flex items-start gap-3 flex-row-reverse">
          {/* 내용 */}
          <div className="flex-1 min-w-0">
            {(log.event_type === 'PRICE_UP' || log.event_type === 'PRICE_DOWN') ? (
              // 가격 변동인 경우
              <>
                {(() => {
                  const priceDesc = getPriceChangeDescription(log);
                  if (!priceDesc) return null;
                  return (
                    <>
                      <h4 className={`text-sm font-semibold mb-1 ${
                        isDeleted 
                          ? 'text-gray-500 dark:text-gray-400' 
                          : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {priceDesc.title}
                      </h4>
                      <p className={`text-sm mb-1 ${
                        isDeleted 
                          ? 'text-gray-400 dark:text-gray-500' 
                          : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {priceDesc.firstLine}
                      </p>
                      <p className={`text-sm font-semibold mb-2 ${
                        log.event_type === 'PRICE_UP' 
                          ? 'text-red-600 dark:text-red-400' 
                          : 'text-blue-600 dark:text-blue-400'
                      }`}>
                        {priceDesc.secondLine}
                      </p>
                    </>
                  );
                })()}
                {/* 가격 변동인 경우 날짜만 표시 */}
                <p className={`text-xs text-right ${
                  isDeleted 
                    ? 'text-gray-400 dark:text-gray-500' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {formatDate(log.created_at)}
                </p>
              </>
            ) : (
              // 추가/삭제인 경우
              <h4 className={`text-sm font-semibold mb-2 ${
                isDeleted 
                  ? 'text-gray-500 dark:text-gray-400' 
                  : 'text-gray-900 dark:text-gray-100'
              }`}>
                {getEventTitle(log)}
              </h4>
            )}
            {/* 가격 변동이 아닌 경우에만 시간 표시 */}
            {!(log.event_type === 'PRICE_UP' || log.event_type === 'PRICE_DOWN') && (
              <p className={`text-xs text-right ${
                isDeleted 
                  ? 'text-gray-400 dark:text-gray-500' 
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {formatTime(log.created_at)}
              </p>
            )}
          </div>
          
          {/* 아이콘 - 중심선에 가깝도록 오른쪽에 배치 */}
          <div className={`${getIconBg()} rounded-full p-2 flex-shrink-0`}>
            {getIcon()}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// 오른쪽 타임라인 아이템 (내 자산)
interface RightTimelineItemProps {
  log: ActivityLog;
  isSelected: boolean;
  onSelect: (logId: number) => void;
}

const RightTimelineItem: React.FC<RightTimelineItemProps> = ({ log, isSelected, onSelect }) => {
  const getIcon = () => {
    const iconClass = "w-4 h-4";
    switch (log.event_type) {
      case 'ADD':
        return <Home className={`${iconClass} text-white`} />;
      case 'DELETE':
        return <X className={`${iconClass} text-white`} />;
      case 'PRICE_UP':
        return <TrendingUp className={`${iconClass} text-white`} />;
      case 'PRICE_DOWN':
        return <TrendingDown className={`${iconClass} text-white`} />;
    }
  };

  const getIconBg = () => {
    switch (log.event_type) {
      case 'ADD':
        return 'bg-green-400'; // 연록색
      case 'PRICE_UP':
        return 'bg-red-500'; // 빨간색
      case 'PRICE_DOWN':
        return 'bg-blue-500'; // 파란색
      case 'DELETE':
        return 'bg-gray-400'; // 회색
      default:
        return 'bg-gray-400';
    }
  };

  const isDeleted = log.event_type === 'DELETE';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative mb-6 w-full flex justify-center"
      data-log-id={log.id}
      data-timeline-item="right"
    >
      {/* 카드 */}
      <div
        className={`rounded-2xl p-4 transition-all hover:shadow-xl max-w-[280px] ${
          isDeleted 
            ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]' 
            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)]'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* 아이콘 - 중심선에 가깝도록 왼쪽에 배치 */}
          <div className={`${getIconBg()} rounded-full p-2 flex-shrink-0`}>
            {getIcon()}
          </div>
          
          {/* 내용 */}
          <div className="flex-1 min-w-0">
            {(log.event_type === 'PRICE_UP' || log.event_type === 'PRICE_DOWN') ? (
              // 가격 변동인 경우
              <>
                {(() => {
                  const priceDesc = getPriceChangeDescription(log);
                  if (!priceDesc) return null;
                  return (
                    <>
                      <h4 className={`text-sm font-semibold mb-1 ${
                        isDeleted 
                          ? 'text-gray-500 dark:text-gray-400' 
                          : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {priceDesc.title}
                      </h4>
                      <p className={`text-sm mb-1 ${
                        isDeleted 
                          ? 'text-gray-400 dark:text-gray-500' 
                          : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {priceDesc.firstLine}
                      </p>
                      <p className={`text-sm font-semibold mb-2 ${
                        log.event_type === 'PRICE_UP' 
                          ? 'text-red-600 dark:text-red-400' 
                          : 'text-blue-600 dark:text-blue-400'
                      }`}>
                        {priceDesc.secondLine}
                      </p>
                    </>
                  );
                })()}
                {/* 가격 변동인 경우 날짜만 표시 */}
                <p className={`text-xs text-left ${
                  isDeleted 
                    ? 'text-gray-400 dark:text-gray-500' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {formatDate(log.created_at)}
                </p>
              </>
            ) : (
              // 추가/삭제인 경우
              <h4 className={`text-sm font-semibold mb-2 ${
                isDeleted 
                  ? 'text-gray-500 dark:text-gray-400' 
                  : 'text-gray-900 dark:text-gray-100'
              }`}>
                {getEventTitle(log)}
              </h4>
            )}
            {/* 가격 변동이 아닌 경우에만 시간 표시 */}
            {!(log.event_type === 'PRICE_UP' || log.event_type === 'PRICE_DOWN') && (
              <p className={`text-xs text-left ${
                isDeleted 
                  ? 'text-gray-400 dark:text-gray-500' 
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {formatTime(log.created_at)}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// 상세 카드 컴포넌트
interface DetailCardProps {
  log: ActivityLog | null;
  onClose: () => void;
}

const DetailCard: React.FC<DetailCardProps> = ({ log, onClose }) => {
  if (!log) return null;

  const getPriceChangeDisplay = () => {
    if (log.event_type === 'PRICE_UP' || log.event_type === 'PRICE_DOWN') {
      const isUp = log.event_type === 'PRICE_UP';
      const change = Math.abs(log.price_change || 0);
      const previousPrice = log.previous_price || 0;
      const changeRate = previousPrice > 0 ? ((change / previousPrice) * 100).toFixed(2) : '0.00';
      
      return (
        <div className="space-y-2">
          <div className={`text-2xl font-bold ${isUp ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
            {isUp ? '+' : '-'}{change.toLocaleString()}만원
          </div>
          <div className={`text-lg ${isUp ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
            {isUp ? '↑' : '↓'} {changeRate}%
          </div>
        </div>
      );
    }
    return null;
  };

  const getEventTitle = () => {
    switch (log.event_type) {
      case 'ADD':
        return log.category === 'MY_ASSET' ? '내 자산 추가' : '관심 목록 추가';
      case 'DELETE':
        return log.category === 'MY_ASSET' ? '내 자산 삭제' : '관심 목록 삭제';
      case 'PRICE_UP':
        return '가격 상승';
      case 'PRICE_DOWN':
        return '가격 하락';
      default:
        return '활동 기록';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-lg mt-4"
    >
      <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {log.apt_name || '알 수 없음'}
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {getEventTitle()}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      {(log.event_type === 'PRICE_UP' || log.event_type === 'PRICE_DOWN') && (
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">가격 변동</p>
          {getPriceChangeDisplay()}
        </div>
      )}
      
      {(log.previous_price !== null || log.current_price !== null) && (
        <div className="space-y-3 mb-4">
          {log.previous_price !== null && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">이전가</p>
              <p className="text-base font-medium text-gray-900 dark:text-gray-100">
                {log.previous_price.toLocaleString()}만원
              </p>
            </div>
          )}
          {log.current_price !== null && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">현재가</p>
              <p className="text-base font-medium text-gray-900 dark:text-gray-100">
                {log.current_price.toLocaleString()}만원
              </p>
            </div>
          )}
        </div>
      )}
      
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          발생일: {new Date(log.created_at).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
      </div>
    </motion.div>
  );
};

// 통합 타임라인 아이템 컴포넌트 (Github 스타일)
interface UnifiedTimelineItemProps {
  log: ActivityLog;
  isSelected: boolean;
  onSelect: (logId: number) => void;
  onPropertyClick?: (aptId: number) => void;
}

const UnifiedTimelineItem: React.FC<UnifiedTimelineItemProps> = ({ log, isSelected, onSelect, onPropertyClick }) => {
  const getIcon = () => {
    const iconClass = "w-4 h-4";
    switch (log.event_type) {
      case 'ADD':
        return <Home className={`${iconClass} text-white`} />;
      case 'DELETE':
        return <X className={`${iconClass} text-white`} />;
      case 'PRICE_UP':
        return <TrendingUp className={`${iconClass} text-white`} />;
      case 'PRICE_DOWN':
        return <TrendingDown className={`${iconClass} text-white`} />;
    }
  };

  const getIconBg = () => {
    switch (log.event_type) {
      case 'ADD':
        return 'bg-green-400';
      case 'PRICE_UP':
        return 'bg-red-500';
      case 'PRICE_DOWN':
        return 'bg-blue-500';
      case 'DELETE':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const isDeleted = log.event_type === 'DELETE';
  const isMyAsset = log.category === 'MY_ASSET';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex items-start gap-4 mb-4"
      data-log-id={log.id}
    >
      {/* 타임라인 선 */}
      <div className="flex flex-col items-center">
        <div className={`${getIconBg()} rounded-full p-2 flex-shrink-0 z-10`}>
          {getIcon()}
        </div>
        <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700 mt-2" />
      </div>

      {/* 내용 카드 */}
      <div
        onClick={() => {
          if (onPropertyClick && log.apt_id && log.event_type !== 'DELETE') {
            onPropertyClick(log.apt_id);
          }
        }}
        className={`flex-1 rounded-lg p-4 transition-all ${
          onPropertyClick && log.apt_id && log.event_type !== 'DELETE'
            ? 'cursor-pointer hover:shadow-md hover:bg-gray-50 dark:hover:bg-gray-700/50'
            : ''
        } ${
          isDeleted 
            ? 'bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700' 
            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {(log.event_type === 'PRICE_UP' || log.event_type === 'PRICE_DOWN') ? (
              <>
                {(() => {
                  const priceDesc = getPriceChangeDescription(log);
                  if (!priceDesc) return null;
                  return (
                    <>
                      <h4 className={`text-sm font-semibold mb-1 ${
                        isDeleted 
                          ? 'text-gray-500 dark:text-gray-400' 
                          : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {priceDesc.title}
                      </h4>
                      <p className={`text-sm mb-1 ${
                        isDeleted 
                          ? 'text-gray-400 dark:text-gray-500' 
                          : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {priceDesc.firstLine}
                      </p>
                      <p className={`text-sm font-semibold mb-2 ${
                        log.event_type === 'PRICE_UP' 
                          ? 'text-red-600 dark:text-red-400' 
                          : 'text-blue-600 dark:text-blue-400'
                      }`}>
                        {priceDesc.secondLine}
                      </p>
                    </>
                  );
                })()}
                <p className={`text-xs ${
                  isDeleted 
                    ? 'text-gray-400 dark:text-gray-500' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {formatDate(log.created_at)}
                </p>
              </>
            ) : (
              <>
                <h4 className={`text-sm font-semibold mb-2 ${
                  isDeleted 
                    ? 'text-gray-500 dark:text-gray-400' 
                    : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {getEventTitle(log)}
                </h4>
                <p className={`text-xs ${
                  isDeleted 
                    ? 'text-gray-400 dark:text-gray-500' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {formatTime(log.created_at)}
                </p>
              </>
            )}
          </div>
          {/* 카테고리 배지 */}
          <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
            isMyAsset
              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
              : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
          }`}>
            {isMyAsset ? '내 자산' : '관심 단지'}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

// 메인 컴포넌트
interface AssetActivityTimelineProps {
  onPropertyClick?: (aptId: number | string) => void;
}

export const AssetActivityTimeline: React.FC<AssetActivityTimelineProps> = ({ onPropertyClick }) => {
  const { isLoaded, isSignedIn, profile, getToken } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [selectedAptId, setSelectedAptId] = useState<number | null>(null);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({
    'MY_ASSET': false, // false = 열림
    'INTEREST': false // false = 열림
  });
  const [displayMonths, setDisplayMonths] = useState(3); // 표시할 기간 (개월)
  const limit = 50;

  // 아파트별 필터링
  const filteredLogs = useMemo(() => {
    if (selectedAptId === null) return logs;
    return logs.filter(log => log.apt_id === selectedAptId);
  }, [logs, selectedAptId]);

  // 카테고리별로 분리
  const interestLogs = useMemo(() => filteredLogs.filter(log => log.category === 'INTEREST'), [filteredLogs]);
  const myAssetLogs = useMemo(() => filteredLogs.filter(log => log.category === 'MY_ASSET'), [filteredLogs]);

  // 내 자산 아파트 목록 추출 (중복 제거)
  const myAssetApartmentList = useMemo(() => {
    const aptMap = new Map<number, { apt_id: number; apt_name: string }>();
    logs
      .filter(log => log.category === 'MY_ASSET')
      .forEach(log => {
        if (log.apt_id && log.apt_name && !aptMap.has(log.apt_id)) {
          aptMap.set(log.apt_id, {
            apt_id: log.apt_id,
            apt_name: log.apt_name
          });
        }
      });
    return Array.from(aptMap.values()).sort((a, b) => 
      a.apt_name.localeCompare(b.apt_name, 'ko')
    );
  }, [logs]);

  // 관심 목록 아파트 목록 추출 (중복 제거)
  const interestApartmentList = useMemo(() => {
    const aptMap = new Map<number, { apt_id: number; apt_name: string }>();
    logs
      .filter(log => log.category === 'INTEREST')
      .forEach(log => {
        if (log.apt_id && log.apt_name && !aptMap.has(log.apt_id)) {
          aptMap.set(log.apt_id, {
            apt_id: log.apt_id,
            apt_name: log.apt_name
          });
        }
      });
    return Array.from(aptMap.values()).sort((a, b) => 
      a.apt_name.localeCompare(b.apt_name, 'ko')
    );
  }, [logs]);

  // 월별 그룹핑 - 통합
  const groupedAllLogs = useMemo(() => groupByMonth(filteredLogs), [filteredLogs]);

  // 모든 월 키 가져오기 (정렬된)
  const allMonths = useMemo(() => {
    return Object.keys(groupedAllLogs).sort((a, b) => {
      const [yearA, monthA] = a.split('년 ').map(s => parseInt(s));
      const [yearB, monthB] = b.split('년 ').map(s => parseInt(s));
      if (yearA !== yearB) return yearB - yearA;
      return monthB - monthA;
    });
  }, [groupedAllLogs]);

  // 표시할 월 필터링 (최근 N개월만)
  const displayedMonths = useMemo(() => {
    const now = new Date();
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - displayMonths + 1, 1); // +1은 현재 월 포함
    
    return allMonths.filter(month => {
      // "2024년 1월" 형식 파싱
      const parts = month.split('년 ');
      if (parts.length !== 2) return false;
      const year = parseInt(parts[0]);
      const monthNum = parseInt(parts[1].replace('월', ''));
      if (isNaN(year) || isNaN(monthNum)) return false;
      
      const monthDate = new Date(year, monthNum - 1, 1);
      return monthDate >= cutoffDate;
    });
  }, [allMonths, displayMonths]);

  // 카테고리별로 그룹핑된 로그 (월별)
  const logsByCategoryAndMonth = useMemo(() => {
    const result: Record<string, { MY_ASSET: ActivityLog[]; INTEREST: ActivityLog[] }> = {};
    allMonths.forEach(month => {
      const monthLogs = groupedAllLogs[month] || [];
      result[month] = {
        MY_ASSET: monthLogs.filter(log => log.category === 'MY_ASSET'),
        INTEREST: monthLogs.filter(log => log.category === 'INTEREST')
      };
    });
    return result;
  }, [groupedAllLogs, allMonths]);

  const toggleCategory = (category: 'MY_ASSET' | 'INTEREST') => {
    setCollapsedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // 로그 요약 정보 생성 함수
  const getLogSummary = (logs: ActivityLog[]): string => {
    const counts = {
      ADD: 0,
      DELETE: 0,
      PRICE_UP: 0,
      PRICE_DOWN: 0
    };

    logs.forEach(log => {
      if (log.event_type in counts) {
        counts[log.event_type as keyof typeof counts]++;
      }
    });

    const summaryParts: string[] = [];
    if (counts.ADD > 0) {
      summaryParts.push(`${counts.ADD}개의 아파트 추가`);
    }
    if (counts.DELETE > 0) {
      summaryParts.push(`${counts.DELETE}개의 아파트 삭제`);
    }
    if (counts.PRICE_UP > 0) {
      summaryParts.push(`${counts.PRICE_UP}개의 아파트 가격 상승`);
    }
    if (counts.PRICE_DOWN > 0) {
      summaryParts.push(`${counts.PRICE_DOWN}개의 아파트 가격 하락`);
    }

    return summaryParts.length > 0 ? summaryParts.join(', ') : '활동 내역 없음';
  };

  // 로그 로드 함수
  const loadLogs = async (reset = false) => {
    // profile은 선택적이므로 isLoaded && isSignedIn만 확인
    if (!isLoaded || !isSignedIn) {
      setError('로그인이 필요합니다.');
      return;
    }

    try {
      // 토큰 가져오기 및 설정
      const token = await getToken();
      if (!token) {
        setError('인증 토큰을 가져올 수 없습니다. 다시 로그인해주세요.');
        return;
      }
      
      // apiFetch가 사용할 전역 토큰 설정
      setAuthToken(token);
      
      // 토큰이 제대로 설정되었는지 확인 (최대 1초 대기)
      let retries = 0;
      while (!getAuthToken() && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      if (!getAuthToken()) {
        console.warn('[AssetActivityTimeline] 토큰 설정 확인 실패, 계속 진행...');
      }
    } catch (err) {
      console.error('토큰 가져오기 실패:', err);
      setError('인증 토큰을 가져올 수 없습니다. 다시 로그인해주세요.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const currentSkip = reset ? 0 : skip;
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 1);
      
      const filters: ActivityLogFilters = {
        limit,
        skip: currentSkip,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      };

      const response = await fetchActivityLogs(filters);
      
      console.log('[AssetActivityTimeline] API 응답:', {
        success: response.success,
        hasData: !!response.data,
        logsCount: response.data?.logs?.length || 0,
        response
      });
      
      if (response.success && response.data) {
        const newLogs = response.data.logs;
        console.log('[AssetActivityTimeline] 로드된 로그 개수:', newLogs.length);
        
        if (reset) {
          setLogs(newLogs);
        } else {
          setLogs(prev => [...prev, ...newLogs]);
        }
        
        setSkip(currentSkip + newLogs.length);
        setHasMore(newLogs.length === limit);
        
        if (newLogs.length === 0 && reset) {
          setError(null);
          console.log('[AssetActivityTimeline] 로그가 없습니다.');
        }
      } else {
        console.error('[AssetActivityTimeline] 응답 구조 오류:', response);
        setError('활동 로그를 불러오는데 실패했습니다.');
      }
    } catch (err) {
      console.error('활동 로그 조회 실패:', err);
      
      // 401 에러인 경우 재시도 (토큰이 설정될 시간을 주고)
      if (err instanceof ApiError && err.isAuthError) {
        console.log('[AssetActivityTimeline] 401 에러 감지, 토큰 설정 후 재시도...');
        
        try {
          // 토큰 다시 가져와서 설정
          const token = await getToken();
          if (token) {
            setAuthToken(token);
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // 재시도
            const retryResponse = await fetchActivityLogs(filters);
            if (retryResponse.success && retryResponse.data) {
              const newLogs = retryResponse.data.logs;
              if (reset) {
                setLogs(newLogs);
              } else {
                setLogs(prev => [...prev, ...newLogs]);
              }
              setSkip(currentSkip + newLogs.length);
              setHasMore(newLogs.length === limit);
              setError(null);
              return;
            }
          }
        } catch (retryError) {
          console.error('[AssetActivityTimeline] 재시도 실패:', retryError);
        }
      }
      
      const errorMessage = err instanceof Error ? err.message : '활동 로그를 불러오는데 실패했습니다.';
      
      if (err instanceof ApiError && err.isAuthError) {
        setError('로그인이 필요합니다. 다시 로그인해주세요.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[AssetActivityTimeline] useEffect 실행:', {
      isLoaded,
      isSignedIn,
      hasProfile: !!profile,
      loading,
      logsCount: logs.length,
      error
    });
    
    // isLoaded && isSignedIn이면 profile 없이도 API 호출 가능
    // profile은 선택적이며, 토큰만 있으면 활동 로그를 조회할 수 있음
    if (isLoaded && isSignedIn) {
      // useAuth의 updateToken이 완료될 시간을 확보하기 위한 짧은 지연
      const loadWithDelay = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('[AssetActivityTimeline] loadLogs 호출 시작');
        setSkip(0);
        setHasMore(true);
        loadLogs(true);
      };
      loadWithDelay();
    } else if (isLoaded && !isSignedIn) {
      console.log('[AssetActivityTimeline] 로그인 필요');
      setError('로그인이 필요합니다.');
    }
  }, [isLoaded, isSignedIn]);

  const handleLoadMore = () => {
    if (!loading && hasMore && isLoaded && isSignedIn) {
      loadLogs(false);
    } else if (!isLoaded || !isSignedIn) {
      setError('로그인이 필요합니다.');
    }
  };

  const handleSelectLog = useCallback((logId: number) => {
    setSelectedLogId(prev => prev === logId ? null : logId);
  }, []);

  const selectedLog = useMemo(() => {
    return logs.find(log => log.id === selectedLogId) || null;
  }, [logs, selectedLogId]);

  if (!isLoaded) {
    return (
      <div className="bg-white/95 rounded-[24px] p-6 shadow-[0_1px_3px_0_rgba(0,0,0),0_1px_2px_0_rgba(0,0,0,0.06)] border border-[#E2E8F0]">
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="bg-white/95 rounded-[24px] p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)] border border-[#E2E8F0]">
        <Card className="p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            로그인이 필요합니다.
          </p>
        </Card>
      </div>
    );
  }

  // profile은 선택적이므로 제거 (활동 로그는 profile 없이도 조회 가능)

  return (
    <div className="bg-white/95 rounded-[24px] p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)] border border-[#E2E8F0]">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
        자산 활동 타임라인
      </h1>

      {/* 아파트 필터 - 드롭다운 */}
      {(myAssetApartmentList.length > 0 || interestApartmentList.length > 0) && (
        <div className="mb-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* 왼쪽 영역 - 내 자산 */}
            <div className="flex-1 flex justify-center">
              {myAssetApartmentList.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    내 자산:
                  </label>
                  <select
                    value={selectedAptId && myAssetApartmentList.some(apt => apt.apt_id === selectedAptId) ? selectedAptId : ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedAptId(value === '' ? null : parseInt(value));
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">전체</option>
                    {myAssetApartmentList.map((apt) => (
                      <option key={apt.apt_id} value={apt.apt_id}>
                        {apt.apt_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* 오른쪽 영역 - 관심 목록 */}
            <div className="flex-1 flex justify-center">
              {interestApartmentList.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    관심 목록:
                  </label>
                  <select
                    value={selectedAptId && interestApartmentList.some(apt => apt.apt_id === selectedAptId) ? selectedAptId : ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedAptId(value === '' ? null : parseInt(value));
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">전체</option>
                    {interestApartmentList.map((apt) => (
                      <option key={apt.apt_id} value={apt.apt_id}>
                        {apt.apt_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* 통합 타임라인 레이아웃 */}
      <div className="relative">
        {/* 월별 섹션 */}
        {displayedMonths.map((month) => {
          const monthData = logsByCategoryAndMonth[month];
          const myAssetLogs = monthData?.MY_ASSET || [];
          const interestLogs = monthData?.INTEREST || [];
          const hasLogs = myAssetLogs.length > 0 || interestLogs.length > 0;

          if (!hasLogs) return null;

          // 모든 로그를 시간순으로 정렬 (최신순)
          const allMonthLogs = [...myAssetLogs, ...interestLogs].sort((a, b) => {
            const dateA = toLocalTime(a.created_at).getTime();
            const dateB = toLocalTime(b.created_at).getTime();
            return dateB - dateA;
          });

          return (
            <div key={month} className="mb-12">
              {/* 월별 헤더 */}
              <div className="sticky top-0 z-20 pb-4 mb-6">
                <div className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm px-6 py-2 rounded-full border border-gray-200 dark:border-gray-700 shadow-sm w-full">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center">
                    {month}
                  </h3>
                </div>
              </div>

              {/* 통합 타임라인 */}
              <div className="relative pl-8">
                {/* 수직선 */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

                {/* 카테고리별 섹션 */}
                <div className="space-y-6">
                  {/* 내 자산 섹션 */}
                  {myAssetLogs.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => toggleCategory('MY_ASSET')}
                        className="w-full flex items-center justify-between gap-2 mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {collapsedCategories['MY_ASSET'] ? (
                            <ChevronRight className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                          <span>내 자산</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({myAssetLogs.length})
                          </span>
                        </div>
                      </button>
                      {/* 접혔을 때 요약 정보 표시 */}
                      {collapsedCategories['MY_ASSET'] && (
                        <div className="ml-6 mb-4 text-xs text-gray-500 dark:text-gray-400">
                          {getLogSummary(myAssetLogs)}
                        </div>
                      )}
                      <AnimatePresence>
                        {!collapsedCategories['MY_ASSET'] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-0"
                          >
                            {myAssetLogs
                              .sort((a, b) => {
                                const dateA = toLocalTime(a.created_at).getTime();
                                const dateB = toLocalTime(b.created_at).getTime();
                                return dateB - dateA;
                              })
                              .map((log) => (
                                <UnifiedTimelineItem
                                  key={log.id}
                                  log={log}
                                  isSelected={selectedLogId === log.id}
                                  onSelect={handleSelectLog}
                                  onPropertyClick={onPropertyClick ? (aptId) => onPropertyClick(aptId) : undefined}
                                />
                              ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* 관심 단지 섹션 */}
                  {interestLogs.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => toggleCategory('INTEREST')}
                        className="w-full flex items-center justify-between gap-2 mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {collapsedCategories['INTEREST'] ? (
                            <ChevronRight className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                          <span>관심 단지</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({interestLogs.length})
                          </span>
                        </div>
                      </button>
                      {/* 접혔을 때 요약 정보 표시 */}
                      {collapsedCategories['INTEREST'] && (
                        <div className="ml-6 mb-4 text-xs text-gray-500 dark:text-gray-400">
                          {getLogSummary(interestLogs)}
                        </div>
                      )}
                      <AnimatePresence>
                        {!collapsedCategories['INTEREST'] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-0"
                          >
                            {interestLogs
                              .sort((a, b) => {
                                const dateA = toLocalTime(a.created_at).getTime();
                                const dateB = toLocalTime(b.created_at).getTime();
                                return dateB - dateA;
                              })
                              .map((log) => (
                                <UnifiedTimelineItem
                                  key={log.id}
                                  log={log}
                                  isSelected={selectedLogId === log.id}
                                  onSelect={handleSelectLog}
                                  onPropertyClick={onPropertyClick ? (aptId) => onPropertyClick(aptId) : undefined}
                                />
                              ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {displayedMonths.length === 0 && !loading && (
          <Card className="p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              활동 내역이 없습니다.
            </p>
          </Card>
        )}
      </div>

      {/* 더 보기 버튼 (기간 확장) */}
      {allMonths.length > displayedMonths.length && (
        <div className="mt-6 pt-4 border-t border-[#E2E8F0]">
          <button
            onClick={() => {
              setDisplayMonths(prev => prev + 3);
            }}
            className="w-full py-3 text-sm font-bold text-[#2563EB] hover:text-[#1d4ed8] transition-colors"
          >
            더 보기 (최근 {displayMonths + 3}개월 조회)
          </button>
          {allMonths.length === 0 && !loading && (
            <Card className="p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                활동 내역이 없습니다.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                (로그 개수: {logs.length}, 필터된 로그: {filteredLogs.length})
              </p>
            </Card>
          )}
        </div>
      )}

      {/* 더보기 버튼 (API 페이징) */}
      {hasMore && (
        <div className="mt-8 text-center">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 mx-auto"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                로딩 중...
              </>
            ) : (
              '더보기'
            )}
          </button>
        </div>
      )}

      {/* 로딩 인디케이터 */}
      {loading && filteredLogs.length === 0 && (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}
    </div>
  );
};
