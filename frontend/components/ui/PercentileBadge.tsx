import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { fetchApartmentPercentile } from '../../services/api';

// 퍼센타일로 티어 정보 가져오기
export const getTierInfo = (percentile: number, rank?: number) => {
  let rankLabel = '';
  let bgColor = '';
  let hoverColor = '';
  let textColor = 'text-white';
  let glowEffect = '';
  
  if (percentile >= 70) {
    // 브론즈 (상위 70% 이하, 즉 70% 이상)
    rankLabel = '브론즈';
    bgColor = 'bg-[#CD7F32]';
    hoverColor = 'hover:bg-[#B87324]';
  } else if (percentile >= 30) {
    // 실버 (상위 70% 까지, 즉 30~70%)
    rankLabel = '실버';
    bgColor = 'bg-[#C0C0C0]';
    hoverColor = 'hover:bg-[#A8A8A8]';
    textColor = 'text-slate-900';
  } else if (percentile >= 10) {
    // 골드 (상위 40% 까지, 즉 10~30%) - 살짝의 Glow 효과
    rankLabel = '골드';
    bgColor = 'bg-[#FFD700]';
    hoverColor = 'hover:bg-[#E6C200]';
    textColor = 'text-slate-900';
    glowEffect = 'shadow-[0_0_8px_rgba(255,215,0,0.6)]';
  } else if (percentile >= 5) {
    // 플래티넘 (상위 20% 까지, 즉 5~10%) - 살짝의 하늘빛 영롱한 효과
    rankLabel = '플래티넘';
    bgColor = 'bg-[#E5E4E2]';
    hoverColor = 'hover:bg-[#D3D1CE]';
    textColor = 'text-slate-900';
    glowEffect = 'shadow-[0_0_10px_rgba(135,206,250,0.5)]';
  } else if (percentile >= 2) {
    // 에메랄드 (상위 10% 까지, 즉 2~5%) - 에메랄드 Glow
    rankLabel = '에메랄드';
    bgColor = 'bg-[#50C878]';
    hoverColor = 'hover:bg-[#40B868]';
    textColor = 'text-white';
    glowEffect = 'shadow-[0_0_12px_rgba(80,200,120,0.7)]';
  } else if (percentile >= 0.1 || (rank !== undefined && rank <= 50)) {
    // 다이아 (상위 3% 까지, 즉 0.1~2%) 또는 상위 50위 - 파란 Glow, 다이아몬드 느낌 / 영롱하게
    rankLabel = rank !== undefined && rank <= 50 ? '최상위' : '다이아';
    if (rank !== undefined && rank <= 50) {
      // 최상위 (상위 50위까지) - 영롱하게
      bgColor = 'bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500';
      hoverColor = 'hover:from-purple-600 hover:via-pink-600 hover:to-blue-600';
      glowEffect = 'shadow-[0_0_8px_rgba(147,51,234,0.5),0_0_12px_rgba(236,72,153,0.4)]';
    } else {
      // 다이아 (상위 3% 까지) - 파란 Glow, 다이아몬드 느낌
      bgColor = 'bg-[#B9F2FF]';
      hoverColor = 'hover:bg-[#9FE0F0]';
      textColor = 'text-slate-900';
      glowEffect = 'shadow-[0_0_8px_rgba(57,197,255,0.5),0_0_12px_rgba(185,242,255,0.3)]';
    }
  } else {
    // 0%인 경우도 다이아로 처리
    rankLabel = '다이아';
    bgColor = 'bg-[#B9F2FF]';
    hoverColor = 'hover:bg-[#9FE0F0]';
    textColor = 'text-slate-900';
    glowEffect = 'shadow-[0_0_8px_rgba(57,197,255,0.5),0_0_12px_rgba(185,242,255,0.3)]';
  }
  
  return { rankLabel, bgColor, hoverColor, textColor, glowEffect };
};

interface PercentileBadgeProps {
  aptId: number | string;
  showModal?: boolean;
  showLabel?: boolean; // "동네 상위" 텍스트 표시 여부
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
    region_percentile: number | null;
    region_rank: number | null;
    region_total_count: number | null;
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
        const aptIdNumber = typeof aptId === 'number' ? aptId : Number(aptId);
        if (!Number.isFinite(aptIdNumber)) return;
        const data = await fetchApartmentPercentile(aptIdNumber);
        setPercentileData({
          display_text: data.display_text,
          percentile: data.percentile,
          rank: data.rank,
          total_count: data.total_count,
          region_name: data.region_name,
          region_percentile: data.region_percentile,
          region_rank: data.region_rank,
          region_total_count: data.region_total_count
        });
      } catch (error) {
        console.error('Percentile 조회 실패:', error);
        // 에러가 발생해도 기본값으로 표시 (100%로 설정하여 브론즈 표시)
        setPercentileData({
          display_text: '데이터 없음',
          percentile: 100,
          rank: 0,
          total_count: 0,
          region_name: '',
          region_percentile: null,
          region_rank: null,
          region_total_count: null
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
  const { bgColor, hoverColor, textColor, glowEffect } = getTierInfo(displayPercentile, percentileData?.rank);

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
        className={`px-3 py-1.5 rounded-full ${bgColor} ${textColor} text-[12px] font-bold shadow-sm ${hoverColor} transition-all ${glowEffect} cursor-default ${className}`}
      >
        {percentileData && percentileData.rank <= 50
          ? `상위 ${percentileData.rank}위`
          : showLabel 
            ? `상위 ${displayPercentile < 1 ? displayPercentile.toFixed(1) : Math.round(displayPercentile)}%` 
            : `${displayPercentile < 1 ? displayPercentile.toFixed(1) : Math.round(displayPercentile)}%`}
      </button>

      {/* Percentile 상세 정보 모달 - Portal로 렌더링하여 transform 영향 방지 */}
      {isModalOpen && percentileData && showModal && createPortal(
        <>
          {/* 모바일: 하단 중앙 */}
          <div className="fixed inset-0 z-[9999] flex items-end justify-center animate-fade-in p-4 md:hidden">
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
                  <h3 className="text-lg font-black text-slate-900">전국 순위</h3>
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
                      const { rankLabel, bgColor, textColor, glowEffect } = getTierInfo(displayPercentile, percentileData.rank);
                      return (
                        <div className={`inline-block px-4 py-2 rounded-full ${bgColor} ${textColor} ${glowEffect} text-[14px] font-bold mb-3`}>
                          {rankLabel}
                        </div>
                      );
                    })()}
                    <div className="text-3xl font-black text-blue-600 mb-2">
                      {(percentileData.percentile === 0 ? 0.1 : percentileData.percentile).toFixed(1)}%
                    </div>
                    {percentileData.total_count > 0 ? (
                      <>
                        <div className="text-slate-600 text-[14px] mb-2">
                          전국 {percentileData.total_count}개의 아파트 중
                        </div>
                        <div className="text-2xl font-bold text-slate-900 mb-4">
                          {percentileData.rank}등
                        </div>
                        {percentileData.region_percentile !== null && percentileData.region_rank !== null && percentileData.region_total_count !== null ? (
                          <div className="pt-3 border-t border-slate-200">
                            <div className="text-slate-500 text-[13px] mb-1">동 상위</div>
                            <div className="text-xl font-bold text-blue-600 mb-1">
                              {percentileData.region_name} 상위 {(percentileData.region_percentile === 0 ? 0.1 : percentileData.region_percentile).toFixed(1)}%
                            </div>
                            <div className="text-slate-600 text-[13px]">
                              {percentileData.region_name} {percentileData.region_total_count}개 중 {percentileData.region_rank}등
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-slate-500 text-[14px] mb-4">
                        순위 데이터가 없습니다
                      </div>
                    )}
                  </div>
                  <div className="pt-4 border-t border-slate-100">
                      <div className="text-[13px] text-slate-500 text-center">
                        전국 아파트 기준 최근 6개월 매매 거래 평당가 순위입니다
                      </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 데스크톱: 버튼 바로 아래 */}
          {modalPosition && (
            <div className="hidden md:block fixed inset-0 z-[9999] animate-fade-in">
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
                    <h3 className="text-base font-black text-slate-900">전국 순위</h3>
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
                        const { rankLabel, bgColor, textColor, glowEffect } = getTierInfo(displayPercentile, percentileData.rank);
                        return (
                          <div className={`inline-block px-3 py-1.5 rounded-full ${bgColor} ${textColor} ${glowEffect} text-[13px] font-bold mb-2`}>
                            {rankLabel}
                          </div>
                        );
                      })()}
                      <div className="text-2xl font-black text-blue-600 mb-1.5">
                        {(percentileData.percentile === 0 ? 0.1 : percentileData.percentile).toFixed(1)}%
                      </div>
                      {percentileData.total_count > 0 ? (
                        <>
                          <div className="text-slate-600 text-[13px] mb-2">
                            전국 {percentileData.total_count}개의 아파트 중
                          </div>
                          <div className="text-xl font-bold text-slate-900 mb-3">
                            {percentileData.rank}등
                          </div>
                          {percentileData.region_percentile !== null && percentileData.region_rank !== null && percentileData.region_total_count !== null ? (
                            <div className="pt-2 border-t border-slate-200">
                              <div className="text-slate-500 text-[12px] mb-1">동 상위</div>
                              <div className="text-lg font-bold text-blue-600 mb-1">
                                {percentileData.region_name} 상위 {(percentileData.region_percentile === 0 ? 0.1 : percentileData.region_percentile).toFixed(1)}%
                              </div>
                              <div className="text-slate-600 text-[12px]">
                                {percentileData.region_name} {percentileData.region_total_count}개 중 {percentileData.region_rank}등
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="text-slate-500 text-[13px] mb-3">
                          순위 데이터가 없습니다
                        </div>
                      )}
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      <div className="text-[12px] text-slate-500 text-center">
                        전국 아파트 기준 최근 6개월 매매 거래 평당가 순위입니다
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
};
