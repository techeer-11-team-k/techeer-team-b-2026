/**
 * AI 채팅 메시지 컴포넌트
 * 
 * AI 검색 결과를 채팅 형식으로 표시합니다.
 */
import React, { useState } from 'react';
import { Building2, MapPin, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { AISearchHistoryItem } from '../../lib/aiApi';
import { ApartmentSearchResult } from '../../lib/searchApi';

interface AIChatMessagesProps {
  history: AISearchHistoryItem[];
  isDarkMode: boolean;
  onApartmentSelect: (apt: ApartmentSearchResult) => void;
}

export default function AIChatMessages({ 
  history, 
  isDarkMode,
  onApartmentSelect 
}: AIChatMessagesProps) {
  // 각 히스토리 아이템별 확장 상태 관리
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

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

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      {history.map((item) => (
        <div key={item.id} className="flex flex-col gap-3">
          {/* 사용자 메시지 (중앙 정렬) */}
          <div className="flex justify-center" style={{ position: 'relative', zIndex: 10 }}>
            <div className="flex flex-col items-center gap-1 w-full max-w-full">
              <div className={`px-4 py-2.5 rounded-2xl w-full overflow-x-auto relative border ${
                isDarkMode 
                  ? 'border-purple-400/50 text-white' 
                  : 'border-purple-500/50 text-white'
              }`} style={{ zIndex: 10, backgroundColor: '#5B66C9' }}>
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
                <p className="text-sm text-center whitespace-nowrap">
                  해당 검색어에 해당하는 아파트 목록입니다.
                </p>
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
