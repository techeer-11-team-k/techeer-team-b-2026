/**
 * AI 채팅 메시지 컴포넌트
 * 
 * AI 검색 결과를 채팅 형식으로 표시합니다.
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Building2, MapPin, Clock, ChevronDown, ChevronUp, Trash2, Info, X } from 'lucide-react';
import { AISearchHistoryItem, clearAISearchHistory, getAISearchHistory } from '../../lib/aiApi';
import { ApartmentSearchResult } from '../../lib/searchApi';
import { motion, AnimatePresence } from 'framer-motion';

interface AIChatMessagesProps {
  history: AISearchHistoryItem[];
  isDarkMode: boolean;
  onApartmentSelect: (apt: ApartmentSearchResult) => void;
  onHistoryCleared?: () => void;
  showTooltip?: boolean;
}

export default function AIChatMessages({ 
  history, 
  isDarkMode,
  onApartmentSelect,
  onHistoryCleared,
  showTooltip = true
}: AIChatMessagesProps) {
  // 각 히스토리 아이템별 확장 상태 관리
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [tooltipMounted, setTooltipMounted] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Portal을 위한 마운트 체크
  useEffect(() => {
    setTooltipMounted(true);
    return () => setTooltipMounted(false);
  }, []);

  // 항목 확장/접기 토글
  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };
  // AI 검색 결과를 ApartmentSearchResult 형식으로 변환
  const convertToApartmentSearchResult = (apt: any): ApartmentSearchResult => ({
    apt_id: apt.apt_id,
    apt_name: apt.apt_name,
    address: apt.address,
    sigungu_name: apt.address?.split(' ').slice(0, 2).join(' ') || '',
    location: apt.location,
    price: apt.average_price ? `${(apt.average_price / 10000).toFixed(1)}억원` : '정보 없음'
  });

  // 시간 포맷팅
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? '오후' : '오전';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
  };

  // 파싱된 조건을 텍스트로 변환
  const formatCriteria = (criteria: any, rawQuery?: string): string => {
    const parts: string[] = [];
    if (criteria.apartment_name) parts.push(`아파트: ${criteria.apartment_name}`);
    if (criteria.location) parts.push(`지역: ${criteria.location}`);
    if (criteria.min_area || criteria.max_area) {
      const min = criteria.min_area ? `${(criteria.min_area / 3.3058).toFixed(1)}평` : '';
      const max = criteria.max_area ? `${(criteria.max_area / 3.3058).toFixed(1)}평` : '';
      if (min && max) parts.push(`평수: ${min}~${max}`);
      else if (min) parts.push(`평수: ${min} 이상`);
      else if (max) parts.push(`평수: ${max} 이하`);
    }
    if (criteria.min_price || criteria.max_price) {
      const min = criteria.min_price ? `${(criteria.min_price / 10000).toFixed(1)}억` : '';
      const max = criteria.max_price ? `${(criteria.max_price / 10000).toFixed(1)}억` : '';
      if (min && max) parts.push(`가격: ${min}~${max}`);
      else if (min) parts.push(`가격: ${min} 이상`);
      else if (max) parts.push(`가격: ${max} 이하`);
    }
    if (criteria.subway_max_distance_minutes) {
      // 역 이름과 호선 정보가 있으면 표시
      const subwayInfo = [];
      if (criteria.subway_station) {
        subwayInfo.push(criteria.subway_station);
      }
      if (criteria.subway_line) {
        subwayInfo.push(criteria.subway_line);
      }
      // criteria에 역 정보가 없으면 rawQuery에서 추출 시도
      if (subwayInfo.length === 0 && rawQuery) {
        // "역"으로 끝나는 단어 찾기 (예: "야당역", "강남역")
        const stationMatch = rawQuery.match(/(\S+역)/);
        if (stationMatch) {
          subwayInfo.push(stationMatch[1]);
        }
      }
      if (subwayInfo.length > 0) {
        parts.push(`지하철: ${subwayInfo.join(' ')} ${criteria.subway_max_distance_minutes}분 이내`);
      } else {
        parts.push(`지하철: ${criteria.subway_max_distance_minutes}분 이내`);
      }
    }
    if (criteria.has_education_facility === true) {
      parts.push('교육시설: 있음');
    } else if (criteria.has_education_facility === false) {
      parts.push('교육시설: 없음');
    }
    return parts.length > 0 ? parts.join(', ') : '조건 없음';
  };

  const handleClearHistory = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    clearAISearchHistory();
    // 히스토리를 즉시 업데이트하기 위해 다시 로드
    const updatedHistory = getAISearchHistory();
    if (onHistoryCleared) {
      onHistoryCleared();
    }
  };

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* 헤더: 툴팁 및 히스토리 지우기 (항상 표시) */}
      <div className="flex items-center justify-between mb-2">
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={(e) => {
              e.stopPropagation();
              if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setTooltipPosition({
                  top: rect.bottom + 8, // 버튼 아래 8px
                  left: rect.left
                });
              }
              setShowInfoTooltip(!showInfoTooltip);
            }}
            className={`p-1.5 rounded-full transition-all duration-200 ${
              isDarkMode 
                ? 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300' 
                : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700'
            }`}
            title="AI 검색 지원 조건 보기"
          >
            <Info className="w-4 h-4" />
          </button>
          {/* Portal을 사용하여 툴팁을 body에 직접 렌더링 */}
          {tooltipMounted && showInfoTooltip && createPortal(
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[999998] bg-black/20"
                style={{ zIndex: 999998 }}
                onClick={() => setShowInfoTooltip(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`fixed p-4 rounded-xl shadow-2xl border z-[999999] w-80 max-w-[calc(100vw-2rem)] ${
                  isDarkMode 
                    ? 'bg-zinc-800 border-zinc-700 text-white' 
                    : 'bg-white border-zinc-200 text-zinc-900'
                }`}
                style={{
                  top: tooltipPosition ? `${tooltipPosition.top}px` : '50%',
                  left: tooltipPosition ? `${tooltipPosition.left}px` : '50%',
                  transform: tooltipPosition ? 'none' : 'translate(-50%, -50%)',
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  zIndex: 999999
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-semibold text-sm">AI 검색 지원 조건</h4>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowInfoTooltip(false);
                    }}
                    className={`p-1 rounded-full transition-colors flex-shrink-0 ${
                      isDarkMode ? 'hover:bg-zinc-700' : 'hover:bg-zinc-100'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ul className="text-xs space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 mt-0.5">•</span>
                    <span>지역: 시도, 시군구, 동 단위</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 mt-0.5">•</span>
                    <span>평수: 전용면적 (예: 30평대)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 mt-0.5">•</span>
                    <span>가격: 매매/전월세 가격대</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 mt-0.5">•</span>
                    <span>아파트 이름: 특정 아파트명</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 mt-0.5">•</span>
                    <span>지하철 거리: 도보 시간</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 mt-0.5">•</span>
                    <span>교육시설: 초등학교 등 유무</span>
                  </li>
                </ul>
              </motion.div>
            </>,
            document.body
          )}
        </div>
        {history.length > 0 && (
          <button
            onClick={(e) => handleClearHistory(e)}
            className={`p-1.5 rounded-full transition-all duration-200 ${
              isDarkMode 
                ? 'hover:bg-zinc-800 text-zinc-400 hover:text-red-400' 
                : 'hover:bg-zinc-100 text-zinc-500 hover:text-red-600'
            }`}
            title="검색 히스토리 지우기"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {history.length === 0 && (
        <div className={`text-center py-4 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
          <p className="text-sm">AI 검색 이력이 없습니다.</p>
          <p className="text-xs mt-1">자연어로 원하는 집의 조건을 입력해보세요.</p>
        </div>
      )}
      {history.map((item) => (
        <div key={item.id} className="flex flex-col gap-3">
          {/* 사용자 메시지 (중앙 정렬) */}
          <div className="flex justify-center" style={{ position: 'relative', zIndex: 50 }}>
            <div className="flex flex-col items-center gap-1 w-full max-w-full">
              <div className={`px-4 py-2.5 rounded-2xl w-full overflow-x-auto relative border ${
                isDarkMode 
                  ? 'border-purple-400/50 text-white' 
                  : 'border-purple-500/50 text-white'
              }`} style={{ zIndex: 50, backgroundColor: '#5B66C9' }}>
                <p className="text-sm font-medium text-center whitespace-nowrap">
                  {item.query}
                </p>
              </div>
              <span className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {formatTime(item.timestamp)}
              </span>
            </div>
          </div>

          {/* AI 답변 (중앙 정렬) */}
          <div className="flex justify-center">
            <div className="flex flex-col items-center gap-2 w-full max-w-full">
              {/* AI 이름 */}
              <span className={`text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                AI
              </span>
              
              {/* AI 메시지 */}
              <div className={`px-4 py-2.5 rounded-2xl w-full overflow-x-auto ${
                isDarkMode 
                  ? 'bg-zinc-800 border border-zinc-700 text-white' 
                  : 'bg-white border border-zinc-200 text-zinc-900'
              }`}>
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-center">
                    다음 조건에 맞는 아파트를 찾았습니다:
                  </p>
                  {item.response?.data?.criteria && (
                    <p className="text-xs text-center opacity-80 break-words">
                      {formatCriteria(item.response.data.criteria)}
                    </p>
                  )}
                </div>
              </div>

              {/* 검색 결과 목록 (리스트 형식) */}
              {item.apartments && item.apartments.length > 0 && (
                <div className={`mt-2 w-full ${
                  isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'
                } rounded-xl p-3 border ${isDarkMode ? 'border-zinc-700' : 'border-zinc-200'}`}>
                  <ul className="space-y-1">
                    {(() => {
                      const isExpanded = expandedItems.has(item.id);
                      const displayCount = isExpanded ? item.apartments.length : Math.min(5, item.apartments.length);
                      const displayedApartments = item.apartments.slice(0, displayCount);
                      
                      return displayedApartments.map((apt) => {
                        const aptResult = convertToApartmentSearchResult(apt);
                        return (
                          <li key={apt.apt_id}>
                            <button
                              onClick={() => onApartmentSelect(aptResult)}
                              className={`w-full text-left py-2 px-2 rounded-md transition-colors ${
                                isDarkMode
                                  ? 'hover:bg-zinc-700/50 text-white'
                                  : 'hover:bg-white text-zinc-900'
                              }`}
                            >
                              <div className="flex flex-col gap-1.5">
                                {/* 첫 번째 줄: 아이콘 + 아파트 이름 */}
                                <div className="flex items-center gap-2">
                                  <Building2 className={`w-4 h-4 flex-shrink-0 ${
                                    isDarkMode ? 'text-sky-400' : 'text-sky-600'
                                  }`} />
                                  <span className={`font-medium text-sm ${
                                    isDarkMode ? 'text-white' : 'text-zinc-900'
                                  }`}>
                                    {apt.apt_name}
                                  </span>
                                </div>
                                {/* 두 번째 줄: 아이콘 + 위치 + 가격 */}
                                <div className="flex items-center gap-2">
                                  <MapPin className={`w-4 h-4 flex-shrink-0 ${
                                    isDarkMode ? 'text-zinc-400' : 'text-zinc-500'
                                  }`} />
                                  <span className={`text-xs flex-1 min-w-0 truncate ${
                                    isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                                  }`}>
                                    {apt.address}
                                  </span>
                                  {apt.average_price && (
                                    <span className={`text-sm font-semibold flex-shrink-0 ${
                                      isDarkMode ? 'text-sky-400' : 'text-sky-600'
                                    }`}>
                                      {apt.average_price >= 10000 
                                        ? `${(apt.average_price / 10000).toFixed(1)}억원`
                                        : `${apt.average_price.toLocaleString()}만원`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      });
                    })()}
                  </ul>
                  {item.apartments.length > 5 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(item.id);
                      }}
                      className={`w-full text-xs text-center mt-2 pt-2 border-t transition-colors flex items-center justify-center gap-1 ${
                        isDarkMode 
                          ? 'text-zinc-400 border-zinc-700 hover:text-zinc-300' 
                          : 'text-zinc-500 border-zinc-200 hover:text-zinc-700'
                      }`}
                    >
                      {expandedItems.has(item.id) ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>접기</span>
                        </>
                      ) : (
                        <>
                          <span>외 {item.apartments.length - 5}개 더 보기</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              <span className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {formatTime(item.timestamp)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
