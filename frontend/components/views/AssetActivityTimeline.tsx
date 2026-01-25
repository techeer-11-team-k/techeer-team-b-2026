import React, { useState, useEffect, useMemo } from 'react';
import { Plus, X, TrendingUp, TrendingDown, Loader2, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { fetchActivityLogs, ActivityLog, ActivityLogFilters } from '../../services/api';
import { Card } from '../ui/Card';

type FilterCategory = 'ALL' | 'MY_ASSET' | 'INTEREST';

// 월별로 그룹핑하는 함수
const groupByMonth = (logs: ActivityLog[]): Record<string, ActivityLog[]> => {
  const grouped: Record<string, ActivityLog[]> = {};
  
  logs.forEach((log) => {
    const date = new Date(log.created_at);
    const monthKey = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
    
    if (!grouped[monthKey]) {
      grouped[monthKey] = [];
    }
    grouped[monthKey].push(log);
  });
  
  // 월별로 정렬 (최신순)
  const sorted: Record<string, ActivityLog[]> = {};
  Object.keys(grouped)
    .sort((a, b) => {
      const [yearA, monthA] = a.split('년 ').map(s => parseInt(s));
      const [yearB, monthB] = b.split('년 ').map(s => parseInt(s));
      if (yearA !== yearB) return yearB - yearA;
      return monthB - monthA;
    })
    .forEach(key => {
      sorted[key] = grouped[key];
    });
  
  return sorted;
};

// 이벤트 타입에 따른 설명 텍스트 생성
const getEventDescription = (log: ActivityLog): string => {
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
    case 'PRICE_UP':
      const upChange = log.price_change ? Math.abs(log.price_change).toLocaleString() : '0';
      return `${aptName} 가격이 ${upChange}만원 상승했습니다.`;
    case 'PRICE_DOWN':
      const downChange = log.price_change ? Math.abs(log.price_change).toLocaleString() : '0';
      return `${aptName} 가격이 ${downChange}만원 하락했습니다.`;
    default:
      return `${aptName} 활동이 기록되었습니다.`;
  }
};

// 시간 포맷팅
const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

// 타임라인 아이템 컴포넌트
interface TimelineItemProps {
  log: ActivityLog;
  isSelected: boolean;
  onSelect: (logId: number) => void;
}

const TimelineItem: React.FC<TimelineItemProps> = ({ log, isSelected, onSelect }) => {
  const getIcon = () => {
    const iconClass = "w-5 h-5";
    switch (log.event_type) {
      case 'ADD':
        return <Home className={`${iconClass} text-green-500`} />;
      case 'DELETE':
        return <X className={`${iconClass} text-red-500`} />;
      case 'PRICE_UP':
        return <TrendingUp className={`${iconClass} text-red-500`} />;
      case 'PRICE_DOWN':
        return <TrendingDown className={`${iconClass} text-blue-500`} />;
    }
  };

  const getCategoryColor = () => {
    // Primary (진한 파란색) vs Secondary (연한 보라색)
    return log.category === 'MY_ASSET' 
      ? 'bg-blue-600' // Primary
      : 'bg-purple-400'; // Secondary
  };

  return (
    <div 
      className={`flex items-start gap-4 relative pl-12 py-3 cursor-pointer rounded-lg transition-all ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
      onClick={() => onSelect(log.id)}
    >
      {/* 아이콘 */}
      <div className={`absolute left-6 ${getCategoryColor()} rounded-full p-2 text-white shadow-md z-10`}>
        {getIcon()}
      </div>
      
      {/* 텍스트 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {getEventDescription(log)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {formatTime(log.created_at)}
        </p>
      </div>
    </div>
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
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-lg mt-4"
    >
      {/* GitHub PR 스타일 헤더 */}
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
      
      {/* 가격 변동 정보 (PRICE_UP/DOWN인 경우) */}
      {(log.event_type === 'PRICE_UP' || log.event_type === 'PRICE_DOWN') && (
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">가격 변동</p>
          {getPriceChangeDisplay()}
        </div>
      )}
      
      {/* 가격 정보 */}
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
      
      {/* 발생일 */}
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

// 메인 컴포넌트
export const AssetActivityTimeline: React.FC = () => {
  const { isLoaded, isSignedIn, profile, getToken } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filter, setFilter] = useState<FilterCategory>('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 50;

  // 필터링된 로그
  const filteredLogs = useMemo(() => {
    if (filter === 'ALL') return logs;
    return logs.filter(log => log.category === filter);
  }, [logs, filter]);

  // 월별 그룹핑
  const groupedLogs = useMemo(() => groupByMonth(filteredLogs), [filteredLogs]);

  // 로그 로드 함수
  const loadLogs = async (reset = false) => {
    if (!isLoaded || !isSignedIn || !profile) {
      setError('로그인이 필요합니다.');
      return;
    }

    // 토큰 갱신 (더보기 클릭 시 토큰이 만료되었을 수 있음)
    try {
      const token = await getToken();
      if (!token) {
        setError('인증 토큰을 가져올 수 없습니다. 다시 로그인해주세요.');
        return;
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
      
      // 1년 전 날짜 계산 (가격 변동률 기간: 1년)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 1);
      
      const filters: ActivityLogFilters = {
        limit,
        skip: currentSkip,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      };

      // 필터가 'ALL'이 아닐 때만 category 필터 추가
      if (filter !== 'ALL') {
        filters.category = filter;
      }

      const response = await fetchActivityLogs(filters);
      
      if (response.success && response.data) {
        const newLogs = response.data.logs;
        
        if (reset) {
          setLogs(newLogs);
        } else {
          setLogs(prev => [...prev, ...newLogs]);
        }
        
        setSkip(currentSkip + newLogs.length);
        setHasMore(newLogs.length === limit);
        
        // 로그가 없을 때 에러 메시지 초기화
        if (newLogs.length === 0 && reset) {
          setError(null);
        }
      } else {
        setError('활동 로그를 불러오는데 실패했습니다.');
      }
    } catch (err) {
      console.error('활동 로그 조회 실패:', err);
      const errorMessage = err instanceof Error ? err.message : '활동 로그를 불러오는데 실패했습니다.';
      
      // 401 에러인 경우 로그인 필요 메시지
      if (err instanceof Error && errorMessage.includes('401')) {
        setError('로그인이 필요합니다. 다시 로그인해주세요.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // 초기 로드 및 필터 변경 시
  useEffect(() => {
    if (isLoaded && isSignedIn && profile) {
      setSkip(0);
      setHasMore(true);
      loadLogs(true);
    } else if (isLoaded && isSignedIn && !profile) {
      // 프로필이 아직 로드되지 않았지만 로그인은 되어 있음
      // 프로필 로딩을 기다리기 위해 에러를 표시하지 않음
      setError(null);
    } else if (isLoaded && !isSignedIn) {
      setError('로그인이 필요합니다.');
    }
  }, [isLoaded, isSignedIn, profile, filter]);

  // 더보기 버튼 클릭
  const handleLoadMore = () => {
    if (!loading && hasMore && isLoaded && isSignedIn && profile) {
      loadLogs(false);
    } else if (!isLoaded || !isSignedIn || !profile) {
      setError('로그인이 필요합니다.');
    }
  };

  // 로그 선택
  const handleSelectLog = (logId: number) => {
    setSelectedLogId(selectedLogId === logId ? null : logId);
  };

  // 선택된 로그
  const selectedLog = useMemo(() => {
    return logs.find(log => log.id === selectedLogId) || null;
  }, [logs, selectedLogId]);

  // Clerk가 아직 로드되지 않았거나 로그인하지 않은 경우
  if (!isLoaded) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card className="p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            로그인이 필요합니다.
          </p>
        </Card>
      </div>
    );
  }

  // 프로필이 아직 로드 중인 경우
  if (!profile) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
        자산 활동 타임라인
      </h1>

      {/* 필터 탭 */}
      <div className="flex gap-2 mb-6">
        {(['전체', '내 아파트', '관심 목록'] as const).map((label, idx) => {
          const filterValue = (['ALL', 'MY_ASSET', 'INTEREST'] as const)[idx];
          const isActive = filter === filterValue;
          
          return (
            <button
              key={idx}
              onClick={() => {
                setFilter(filterValue);
                setSelectedLogId(null);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* 타임라인 */}
      <div className="relative">
        {/* 수직선 */}
        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-300 dark:bg-gray-600" />
        
        {/* 이벤트 리스트 */}
        <div className="space-y-8">
          {Object.entries(groupedLogs).length === 0 && !loading ? (
            <Card className="p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                활동 내역이 없습니다.
              </p>
            </Card>
          ) : (
            Object.entries(groupedLogs).map(([date, dateLogs]) => (
              <div key={date} className="relative">
                {/* 월별 헤더 */}
                <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 pb-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    {date}
                  </h3>
                </div>
                
                {/* 해당 날짜의 로그들 */}
                <div className="space-y-2">
                  {dateLogs.map((log) => (
                    <div key={log.id}>
                      <TimelineItem 
                        log={log}
                        isSelected={selectedLogId === log.id}
                        onSelect={handleSelectLog}
                      />
                      <AnimatePresence>
                        {selectedLogId === log.id && (
                          <DetailCard 
                            log={log} 
                            onClose={() => setSelectedLogId(null)}
                          />
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 더보기 버튼 */}
      {hasMore && (
        <div className="mt-6 text-center">
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
