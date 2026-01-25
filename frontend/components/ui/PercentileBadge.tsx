import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { fetchApartmentPercentile } from '../../services/api';

// 퍼센타일로 티어 정보 가져오기
export const getTierInfo = (percentile: number) => {
  let rankLabel = '';
  let bgColor = '';
  let hoverColor = '';
  let textColor = 'text-white';
  
  if (percentile >= 85) {
    // 브론즈 (85~100%)
    rankLabel = '브론즈';
    bgColor = 'bg-[#CD7F32]';
    hoverColor = 'hover:bg-[#B87324]';
  } else if (percentile >= 55) {
    // 실버 (55~85%)
    rankLabel = '실버';
    bgColor = 'bg-[#C0C0C0]';
    hoverColor = 'hover:bg-[#A8A8A8]';
    textColor = 'text-slate-900';
  } else if (percentile >= 20) {
    // 골드 (20~54%)
    rankLabel = '골드';
    bgColor = 'bg-[#FFD700]';
    hoverColor = 'hover:bg-[#E6C200]';
    textColor = 'text-slate-900';
  } else if (percentile >= 5) {
    // 플래티넘 (5~19%)
    rankLabel = '플래티넘';
    bgColor = 'bg-[#E5E4E2]';
    hoverColor = 'hover:bg-[#D3D1CE]';
    textColor = 'text-slate-900';
  } else if (percentile >= 2) {
    // 다이아 (2~4%)
    rankLabel = '다이아';
    bgColor = 'bg-[#B9F2FF]';
    hoverColor = 'hover:bg-[#9FE0F0]';
    textColor = 'text-slate-900';
  } else if (percentile > 0) {
    // 챌린저 (0.1~1%)
    rankLabel = '챌린저';
    bgColor = 'bg-[#FF6B6B]';
    hoverColor = 'hover:bg-[#FF5252]';
  } else {
    // 0%인 경우도 챌린저로 처리
    rankLabel = '챌린저';
    bgColor = 'bg-[#FF6B6B]';
    hoverColor = 'hover:bg-[#FF5252]';
  }
  
  return { rankLabel, bgColor, hoverColor, textColor };
};

interface PercentileBadgeProps {
  aptId: string;
  showModal?: boolean;
  showLabel?: boolean; // "상위" 텍스트 표시 여부
  className?: string;
}

export const PercentileBadge: React.FC<PercentileBadgeProps> = ({
  aptId,
  showModal = true,
  showLabel = true,
  className = ''
}) => {
  const [percentileData, setPercentileData] = useState<{
    display_text: string;
    percentile: number;
    rank: number;
    total_count: number;
    region_name: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [modalPosition, setModalPosition] = useState<{ top: number; left: number } | null>(null);

  // 퍼센타일 데이터 로드
  useEffect(() => {
    const loadPercentile = async () => {
      if (!aptId) return;
      
      setIsLoading(true);
      try {
        const data = await fetchApartmentPercentile(aptId);
        setPercentileData({
          display_text: data.display_text,
          percentile: data.percentile,
          rank: data.rank,
          total_count: data.total_count,
          region_name: data.region_name
        });
      } catch (error) {
        console.error('Percentile 조회 실패:', error);
        // 에러가 발생해도 기본값으로 표시 (100%로 설정하여 브론즈 표시)
        setPercentileData({
          display_text: '데이터 없음',
          percentile: 100,
          rank: 0,
          total_count: 0,
          region_name: ''
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadPercentile();
  }, [aptId]);

  // 모달 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsModalOpen(false);
        setModalPosition(null);
      }
    };

    if (isModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isModalOpen]);

  // percentileData가 없으면 기본값 사용 (100% = 브론즈)
  let displayPercentile = percentileData?.percentile ?? 100;
  // 0%인 경우 0.1%로 표시
  if (displayPercentile === 0) {
    displayPercentile = 0.1;
  }
  const { bgColor, hoverColor, textColor } = getTierInfo(displayPercentile);

  if (isLoading) {
    return (
      <div className={`px-3 py-1.5 rounded-full bg-blue-100 text-blue-600 text-[12px] font-bold ${className}`}>
        로딩 중...
      </div>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    if (!showModal) return;
    
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const modalWidth = 320;
    const modalHeight = 200;
    const padding = 16;
    
    let left = rect.left;
    let top = rect.bottom + 8;
    
    if (left + modalWidth > window.innerWidth - padding) {
      left = window.innerWidth - modalWidth - padding;
    }
    
    if (left < padding) {
      left = padding;
    }
    
    if (top + modalHeight > window.innerHeight - padding) {
      top = rect.top - modalHeight - 8;
    }
    
    setModalPosition({
      top: Math.max(padding, top),
      left: left
    });
    setIsModalOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`px-3 py-1.5 rounded-full ${bgColor} ${textColor} text-[12px] font-bold shadow-sm ${hoverColor} transition-colors ${showModal && percentileData ? 'cursor-pointer' : 'cursor-default'} ${className}`}
      >
        {showLabel 
          ? `상위 ${displayPercentile < 1 ? displayPercentile.toFixed(1) : Math.round(displayPercentile)}%` 
          : `${displayPercentile < 1 ? displayPercentile.toFixed(1) : Math.round(displayPercentile)}%`}
      </button>

      {/* Percentile 상세 정보 모달 */}
      {isModalOpen && percentileData && showModal && percentileData.total_count > 0 && (
        <>
          {/* 모바일: 하단 중앙 */}
          <div className="fixed inset-0 z-[100] flex items-end justify-center animate-fade-in p-4 md:hidden">
            <div 
              className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
              onClick={() => {
                setIsModalOpen(false);
                setModalPosition(null);
              }}
            />
            <div 
              className="relative w-full max-w-sm bg-white rounded-t-3xl rounded-b-3xl shadow-2xl overflow-hidden animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black text-slate-900">전체 순위</h3>
                  <button 
                    onClick={() => {
                      setIsModalOpen(false);
                      setModalPosition(null);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="text-center py-4">
                    {(() => {
                      const displayPercentile = percentileData.percentile === 0 ? 0.1 : percentileData.percentile;
                      const { rankLabel, bgColor, textColor } = getTierInfo(displayPercentile);
                      return (
                        <div className={`inline-block px-4 py-2 rounded-full ${bgColor} ${textColor} text-[14px] font-bold mb-3`}>
                          {rankLabel}
                        </div>
                      );
                    })()}
                    <div className="text-3xl font-black text-blue-600 mb-2">
                      {(percentileData.percentile === 0 ? 0.1 : percentileData.percentile).toFixed(1)}%
                    </div>
                    {percentileData.total_count > 0 ? (
                      <>
                        <div className="text-slate-600 text-[14px] mb-4">
                          전체 {percentileData.total_count}개의 아파트 중
                        </div>
                        <div className="text-2xl font-bold text-slate-900">
                          {percentileData.rank}등
                        </div>
                      </>
                    ) : (
                      <div className="text-slate-500 text-[14px] mb-4">
                        순위 데이터가 없습니다
                      </div>
                    )}
                  </div>
                  <div className="pt-4 border-t border-slate-100">
                      <div className="text-[13px] text-slate-500 text-center">
                        전체 아파트 기준 최근 3개월 매매 거래 평당가 순위입니다
                      </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 데스크톱: 버튼 바로 아래 */}
          {modalPosition && (
            <div className="hidden md:block fixed inset-0 z-[100] animate-fade-in">
              <div 
                className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
                onClick={() => {
                  setIsModalOpen(false);
                  setModalPosition(null);
                }}
              />
              <div 
                className="absolute bg-white rounded-xl shadow-2xl overflow-hidden animate-slide-down w-[320px]"
                style={{
                  top: `${modalPosition.top}px`,
                  left: `${modalPosition.left}px`,
                  transform: 'translateX(0)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-black text-slate-900">전체 순위</h3>
                    <button 
                      onClick={() => {
                        setIsModalOpen(false);
                        setModalPosition(null);
                      }}
                      className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="text-center py-3">
                      {(() => {
                        const displayPercentile = percentileData.percentile === 0 ? 0.1 : percentileData.percentile;
                        const { rankLabel, bgColor, textColor } = getTierInfo(displayPercentile);
                        return (
                          <div className={`inline-block px-3 py-1.5 rounded-full ${bgColor} ${textColor} text-[13px] font-bold mb-2`}>
                            {rankLabel}
                          </div>
                        );
                      })()}
                      <div className="text-2xl font-black text-blue-600 mb-1.5">
                        {(percentileData.percentile === 0 ? 0.1 : percentileData.percentile).toFixed(1)}%
                      </div>
                      {percentileData.total_count > 0 ? (
                        <>
                          <div className="text-slate-600 text-[13px] mb-3">
                            전체 {percentileData.total_count}개의 아파트 중
                          </div>
                          <div className="text-xl font-bold text-slate-900">
                            {percentileData.rank}등
                          </div>
                        </>
                      ) : (
                        <div className="text-slate-500 text-[13px] mb-3">
                          순위 데이터가 없습니다
                        </div>
                      )}
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      <div className="text-[12px] text-slate-500 text-center">
                        최근 3개월 매매 거래 기준 평당가 순위입니다
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};
