import React from 'react';
import { ChevronRight, Eye, EyeOff, X, Pencil } from 'lucide-react';

// 평수 변환 (1평 = 3.3058㎡) - 반올림하여 정수로 표시
const convertToPyeong = (area: number) => {
  return Math.round(area / 3.3058);
};

// 가격 포맷팅
const FormatPrice = ({ value, unit = '억' }: { value: number; unit?: string }) => {
  const eok = Math.floor(value / 10000);
  const man = value % 10000;
  
  return (
    <span className="tabular-nums tracking-tight">
      <span className="font-bold">{eok}</span>
      <span className="font-bold ml-0.5 mr-1 text-[13px] md:text-[15px]">{unit}</span>
      {man > 0 && (
        <span className="font-bold">{man.toLocaleString()}</span>
      )}
    </span>
  );
};

export interface ApartmentRowProps {
  // 기본 정보
  name: string;
  location: string;
  area: number; // ㎡
  price: number; // 만원 단위
  
  // 옵션 정보
  rank?: number;
  changeRate?: number;
  transactionCount?: number;
  imageUrl?: string;
  color?: string;
  
  // 표시 옵션
  showRank?: boolean;
  showChangeRate?: boolean;
  showTransactionCount?: boolean;
  showImage?: boolean;
  showColorDot?: boolean;
  showChevron?: boolean;
  
  // 스타일 옵션
  variant?: 'default' | 'compact' | 'selected';
  isVisible?: boolean;
  isSelected?: boolean;
  isDimmed?: boolean;
  /** 메타(위치/면적)에서 면적 표시 숨김 (대시보드 커스텀 우측 배치용) */
  hideAreaMeta?: boolean;
  
  // 이벤트
  onClick?: () => void;
  onToggleVisibility?: (e: React.MouseEvent) => void;
  onRemove?: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent) => void;
  
  // 커스텀 렌더링
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  className?: string;
}

export const ApartmentRow: React.FC<ApartmentRowProps> = ({
  name,
  location,
  area,
  price,
  rank,
  changeRate,
  transactionCount,
  imageUrl,
  color,
  showRank = false,
  showChangeRate = false,
  showTransactionCount = false,
  showImage = false,
  showColorDot = false,
  showChevron = true,
  variant = 'default',
  isVisible = true,
  isSelected = false,
  isDimmed = false,
  hideAreaMeta = false,
  onClick,
  onToggleVisibility,
  onRemove,
  onEdit,
  leftContent,
  rightContent,
  className = ''
}) => {
  const pyeong = convertToPyeong(area);
  const isTop3 = rank !== undefined && rank <= 3;
  
  // Variant별 클래스
  const variantClasses = {
    default: 'py-4 px-4 md:py-5 md:px-6',
    compact: 'py-3 px-4 md:py-4 md:px-5',
    selected: 'py-3 px-4 md:py-4 md:px-5'
  };
  
  const baseClasses = `group flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 last:border-0 transition-all duration-200 cursor-pointer ${
    variant === 'default' ? 'rounded-2xl md:rounded-xl hover:bg-slate-50 active:scale-[0.98]' : 
    variant === 'compact' ? 'rounded-2xl active:scale-[0.98]' :
    'rounded-xl active:scale-[0.98]'
  } ${className}`;
  
  const backgroundClasses = 
    variant === 'selected' 
      ? isSelected 
        ? 'bg-white border border-indigo-500 ring-1 ring-indigo-500/20 shadow-md' 
        : 'bg-white border border-slate-200 hover:border-indigo-300'
      : isVisible 
        ? 'bg-white hover:bg-slate-50' 
        : 'bg-slate-50/50';
  
  const dimmedClasses = isDimmed ? 'opacity-50 grayscale' : 'opacity-100';
  
  return (
    <div 
      onClick={onClick}
      className={`${baseClasses} ${variantClasses[variant]} ${backgroundClasses} ${dimmedClasses}`}
    >
      <div className="flex items-start md:items-center gap-4 flex-1 min-w-0 w-full">
        {/* 가시성 토글 (Dashboard용) */}
        {onToggleVisibility && (
          <button 
            onClick={onToggleVisibility}
            className="hidden md:block p-1.5 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
          >
            {isVisible ? (
              <Eye className="w-5 h-5" />
            ) : (
              <EyeOff className="w-5 h-5 opacity-50" />
            )}
          </button>
        )}
        
        {/* 순위 (Ranking용) */}
        {showRank && rank !== undefined && (
          <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-black mt-1 md:mt-0 ${
            isTop3 
              ? rank === 1 
                ? 'text-yellow-600 text-lg md:text-xl' 
                : rank === 2
                ? 'text-gray-400 text-[17px] md:text-lg'
                : 'text-orange-600 text-[16px] md:text-[17px]'
              : 'text-black text-[14px] md:text-[15px]'
          }`}>
            {rank}
          </div>
        )}
        
        {/* 이미지 (Dashboard용) */}
        {showImage && imageUrl && (
          <div className="relative flex-shrink-0">
            <div className={`w-12 h-12 md:w-12 md:h-12 rounded-2xl overflow-hidden flex-shrink-0 transition-opacity ${isVisible ? 'opacity-100' : 'opacity-50'}`}>
              <img 
                src={imageUrl} 
                alt={name} 
                className="w-full h-full object-cover"
              />
            </div>
            {isVisible && color && (
              <div 
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white shadow-sm z-10"
                style={{ backgroundColor: color }}
              ></div>
            )}
          </div>
        )}
        
        {/* 색상 점 (Comparison용) */}
        {showColorDot && color && (
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-2 md:mt-0" style={{ backgroundColor: color }}></div>
        )}
        
        {/* 커스텀 왼쪽 콘텐츠 또는 기본 정보 */}
        {leftContent || (
          <div className="min-w-0 flex-1 w-full">
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5 mb-1">
                    <h4 className={`font-bold text-[16px] md:text-[17px] truncate transition-colors ${
                      isVisible !== false 
                        ? isSelected 
                          ? 'text-indigo-900' 
                          : 'text-slate-900 group-hover:text-blue-600' 
                        : 'text-slate-400'
                    }`}>
                        {name}
                    </h4>
                    {onEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(e);
                          }}
                          className="flex-shrink-0 p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                          title="편집"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                
                {/* Mobile Price Display (Top Right) */}
                <div className="md:hidden text-right pl-2">
                     <p className={`font-bold text-[16px] tabular-nums tracking-tight ${
                        isVisible !== false ? 'text-slate-900' : 'text-slate-400'
                      }`}>
                        <FormatPrice value={price} />
                      </p>
                </div>
            </div>
            
            <div className="flex items-center justify-between md:justify-start gap-1.5 md:gap-2 text-[13px] md:text-[13px] text-slate-500 font-medium">
              <div className="flex items-center gap-2 truncate">
                  <span className="truncate">{location}</span>
                  {!hideAreaMeta && (
                    <>
                      <span className="w-px h-2.5 bg-slate-200 flex-shrink-0"></span>
                      <span className="flex-shrink-0 tabular-nums whitespace-nowrap">{area}㎡ ({pyeong}평)</span>
                    </>
                  )}
              </div>
              
              {/* Mobile Change Rate/Transaction Count (Bottom Right) */}
              <div className="md:hidden flex items-center gap-2">
                  {showChangeRate && changeRate !== undefined && (
                    <span className={`font-bold tabular-nums whitespace-nowrap ${
                      changeRate >= 0 ? 'text-red-500' : 'text-blue-500'
                    }`}>
                      {changeRate >= 0 ? '+' : ''}{changeRate.toFixed(1)}%
                    </span>
                  )}
                  {showTransactionCount && transactionCount !== undefined && (
                     <span className="font-bold tabular-nums text-slate-500 whitespace-nowrap">
                       {transactionCount}건
                     </span>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 오른쪽 콘텐츠 (Desktop Only) */}
      <div className="hidden md:flex items-center gap-4 flex-shrink-0 pl-4">
        {rightContent || (
          <>
            <div className="text-right min-w-0">
              <p className={`font-bold text-[15px] md:text-[17px] tabular-nums tracking-tight truncate ${
                isVisible !== false ? 'text-slate-900' : 'text-slate-400'
              }`}>
                <FormatPrice value={price} />
              </p>
              {showChangeRate && changeRate !== undefined && (
                <p className={`text-[12px] md:text-[13px] mt-0.5 font-bold tabular-nums whitespace-nowrap ${
                  changeRate >= 0 ? 'text-red-500' : 'text-blue-500'
                }`}>
                  {changeRate >= 0 ? '+' : ''}{changeRate.toFixed(1)}%
                </p>
              )}
              {showTransactionCount && transactionCount !== undefined && (
                <p className="text-[12px] md:text-[13px] mt-0.5 font-bold tabular-nums text-slate-500 whitespace-nowrap">
                  {transactionCount}건
                </p>
              )}
            </div>
            
            {/* 삭제 버튼 (Comparison용) */}
            {onRemove && (
              <button 
                onClick={onRemove}
                className="p-1.5 text-slate-300 hover:bg-slate-100 hover:text-red-500 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            
            {/* 화살표 */}
            {showChevron && (
              <div className="hidden md:block transform transition-transform duration-200 group-hover:translate-x-1 text-slate-300 group-hover:text-blue-500">
                <ChevronRight className="w-5 h-5" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};