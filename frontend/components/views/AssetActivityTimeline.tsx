import React, { useState, useEffect, useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Loader2, Home, Activity } from 'lucide-react';
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

// 시간 포맷팅 (AM/PM 형식)
const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
};

// 이벤트 설명 텍스트 생성
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
        return 'bg-green-500';
      case 'PRICE_UP':
        return 'bg-purple-500';
      case 'PRICE_DOWN':
        return 'bg-purple-400';
      default:
        return 'bg-purple-400';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative mb-6"
    >
      {/* 타임라인 노드 */}
      <div className="absolute left-0 top-3 w-3 h-3 rounded-full border-2 border-purple-300 bg-white dark:bg-gray-800 z-10" />
      
      {/* 카드 */}
      <div
        className={`ml-6 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer transition-all hover:shadow-md ${
          isSelected ? 'ring-2 ring-purple-300' : ''
        }`}
        onClick={() => onSelect(log.id)}
      >
        <div className="flex items-start gap-3">
          {/* 아이콘 */}
          <div className={`${getIconBg()} rounded-full p-2 flex-shrink-0`}>
            {getIcon()}
          </div>
          
          {/* 내용 */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {log.apt_name || '알 수 없음'}
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              {getEventDescription(log)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
              {formatTime(log.created_at)}
            </p>
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
        return 'bg-blue-500';
      case 'PRICE_UP':
        return 'bg-red-500';
      case 'PRICE_DOWN':
        return 'bg-blue-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative mb-6"
    >
      {/* 타임라인 노드 */}
      <div className="absolute right-0 top-3 w-3 h-3 rounded-full border-2 border-green-300 bg-white dark:bg-gray-800 z-10" />
      
      {/* 카드 */}
      <div
        className={`mr-6 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer transition-all hover:shadow-md ${
          isSelected ? 'ring-2 ring-green-300' : ''
        }`}
        onClick={() => onSelect(log.id)}
      >
        <div className="flex items-start gap-3">
          {/* 내용 */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {log.apt_name || '알 수 없음'}
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              {getEventDescription(log)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 text-left">
              {formatTime(log.created_at)}
            </p>
          </div>
          
          {/* 아이콘 */}
          <div className={`${getIconBg()} rounded-full p-2 flex-shrink-0`}>
            {getIcon()}
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

  // 카테고리별로 분리
  const interestLogs = useMemo(() => logs.filter(log => log.category === 'INTEREST'), [logs]);
  const myAssetLogs = useMemo(() => logs.filter(log => log.category === 'MY_ASSET'), [logs]);

  // 필터링된 로그
  const filteredLogs = useMemo(() => {
    if (filter === 'ALL') return logs;
    return logs.filter(log => log.category === filter);
  }, [logs, filter]);

  // 월별 그룹핑
  const groupedInterestLogs = useMemo(() => groupByMonth(interestLogs), [interestLogs]);
  const groupedMyAssetLogs = useMemo(() => groupByMonth(myAssetLogs), [myAssetLogs]);
  const groupedAllLogs = useMemo(() => groupByMonth(filteredLogs), [filteredLogs]);

  // 모든 월 키 가져오기 (정렬된)
  const allMonths = useMemo(() => {
    const months = new Set([
      ...Object.keys(groupedInterestLogs),
      ...Object.keys(groupedMyAssetLogs),
      ...Object.keys(groupedAllLogs)
    ]);
    return Array.from(months).sort((a, b) => {
      const [yearA, monthA] = a.split('년 ').map(s => parseInt(s));
      const [yearB, monthB] = b.split('년 ').map(s => parseInt(s));
      if (yearA !== yearB) return yearB - yearA;
      return monthB - monthA;
    });
  }, [groupedInterestLogs, groupedMyAssetLogs, groupedAllLogs]);

  // 로그 로드 함수
  const loadLogs = async (reset = false) => {
    if (!isLoaded || !isSignedIn || !profile) {
      setError('로그인이 필요합니다.');
      return;
    }

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
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 1);
      
      const filters: ActivityLogFilters = {
        limit,
        skip: currentSkip,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      };

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
        
        if (newLogs.length === 0 && reset) {
          setError(null);
        }
      } else {
        setError('활동 로그를 불러오는데 실패했습니다.');
      }
    } catch (err) {
      console.error('활동 로그 조회 실패:', err);
      const errorMessage = err instanceof Error ? err.message : '활동 로그를 불러오는데 실패했습니다.';
      
      if (err instanceof Error && errorMessage.includes('401')) {
        setError('로그인이 필요합니다. 다시 로그인해주세요.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && isSignedIn && profile) {
      setSkip(0);
      setHasMore(true);
      loadLogs(true);
    } else if (isLoaded && isSignedIn && !profile) {
      setError(null);
    } else if (isLoaded && !isSignedIn) {
      setError('로그인이 필요합니다.');
    }
  }, [isLoaded, isSignedIn, profile, filter]);

  const handleLoadMore = () => {
    if (!loading && hasMore && isLoaded && isSignedIn && profile) {
      loadLogs(false);
    } else if (!isLoaded || !isSignedIn || !profile) {
      setError('로그인이 필요합니다.');
    }
  };

  const handleSelectLog = (logId: number) => {
    setSelectedLogId(selectedLogId === logId ? null : logId);
  };

  const selectedLog = useMemo(() => {
    return logs.find(log => log.id === selectedLogId) || null;
  }, [logs, selectedLogId]);

  if (!isLoaded) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <Card className="p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            로그인이 필요합니다.
          </p>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
        자산 활동 타임라인
      </h1>

      {/* 필터 탭 */}
      <div className="flex gap-2 mb-8">
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

      {/* 이중 타임라인 레이아웃 */}
      {filter === 'ALL' ? (
        <div className="relative">
          {/* 월별 섹션 */}
          {allMonths.map((month) => {
            const interestMonthLogs = groupedInterestLogs[month] || [];
            const myAssetMonthLogs = groupedMyAssetLogs[month] || [];
            const hasLogs = interestMonthLogs.length > 0 || myAssetMonthLogs.length > 0;

            if (!hasLogs) return null;

            return (
              <div key={month} className="mb-12">
                {/* 월별 헤더 */}
                <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 pb-4 mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {month}
                  </h3>
                </div>

                {/* 이중 타임라인 */}
                <div className="relative grid grid-cols-12 gap-8">
                  {/* 왼쪽: 관심 목록 */}
                  <div className="col-span-5 relative">
                    {/* 타임라인 축 (점선) */}
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 border-l-2 border-dashed border-purple-300 dark:border-purple-600" />
                    
                    {/* 라벨 */}
                    <div className="absolute left-0 top-0 -translate-x-full pr-4 text-xs font-medium text-purple-600 dark:text-purple-400 writing-vertical-rl">
                      관심 목록
                    </div>
                    
                    {/* 로그 아이템들 */}
                    <div className="pl-8">
                      {interestMonthLogs.map((log) => (
                        <div key={log.id}>
                          <LeftTimelineItem
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
                      {interestMonthLogs.length === 0 && (
                        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
                          활동 내역 없음
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 중앙 연결 영역 */}
                  <div className="col-span-2 flex flex-col items-center justify-start pt-8">
                    {/* 연결 아이콘들 */}
                    <div className="flex flex-col items-center gap-4">
                      <Activity className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                    </div>
                  </div>

                  {/* 오른쪽: 내 자산 */}
                  <div className="col-span-5 relative">
                    {/* 타임라인 축 (점선) */}
                    <div className="absolute right-0 top-0 bottom-0 w-0.5 border-r-2 border-dashed border-green-300 dark:border-green-600" />
                    
                    {/* 라벨 */}
                    <div className="absolute right-0 top-0 translate-x-full pl-4 text-xs font-medium text-green-600 dark:text-green-400 writing-vertical-rl">
                      내 자산
                    </div>
                    
                    {/* 로그 아이템들 */}
                    <div className="pr-8">
                      {myAssetMonthLogs.map((log) => (
                        <div key={log.id}>
                          <RightTimelineItem
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
                      {myAssetMonthLogs.length === 0 && (
                        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
                          활동 내역 없음
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {allMonths.length === 0 && !loading && (
            <Card className="p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                활동 내역이 없습니다.
              </p>
            </Card>
          )}
        </div>
      ) : (
        // 필터가 적용된 경우 단일 타임라인
        <div className="relative">
          {Object.entries(groupedAllLogs).map(([month, monthLogs]) => (
            <div key={month} className="mb-12">
              <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 pb-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {month}
                </h3>
              </div>
              
              <div className="relative pl-12">
                <div className="absolute left-6 top-0 bottom-0 w-0.5 border-l-2 border-dashed border-gray-300 dark:border-gray-600" />
                <div className="space-y-4">
                  {monthLogs.map((log) => (
                    <div key={log.id}>
                      {log.category === 'INTEREST' ? (
                        <LeftTimelineItem
                          log={log}
                          isSelected={selectedLogId === log.id}
                          onSelect={handleSelectLog}
                        />
                      ) : (
                        <RightTimelineItem
                          log={log}
                          isSelected={selectedLogId === log.id}
                          onSelect={handleSelectLog}
                        />
                      )}
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
            </div>
          ))}
        </div>
      )}

      {/* 더보기 버튼 */}
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
