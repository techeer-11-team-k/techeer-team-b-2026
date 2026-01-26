import React from 'react';
import { X, ExternalLink, Eye } from 'lucide-react';
import { PropertyDetail } from './views/PropertyDetail';

interface PropertyData {
  id: string;
  name: string;
  location: string;
  isSpeculationArea?: boolean;
}

interface MapSideDetailProps {
  propertyId: string;
  propertyData: PropertyData;
  onClose: () => void;
  onOpenDetail?: (id: string) => void;
  onOpenRoadview?: () => void;
  onNeighborClick?: (aptId: number, location?: { lat: number; lng: number } | null) => void;
}

export const MapSideDetail: React.FC<MapSideDetailProps> = ({ propertyId, propertyData, onClose, onOpenDetail, onOpenRoadview, onNeighborClick }) => {

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* 헤더 - 아파트 이름과 닫기 버튼만 */}
      <div className="sticky top-0 z-[100] px-7 py-5 border-b border-slate-200/50 bg-white/80 backdrop-blur-md" style={{ paddingTop: '1.75rem' }}>
         <div className="flex items-center justify-between">
             <div className="flex-1 min-w-0">
                 <h2 className="text-[22px] font-black text-slate-900 leading-tight">{propertyData.name}</h2>
             </div>
             <button 
                onClick={onClose} 
                className="p-2.5 hover:bg-white/80 rounded-full transition-colors text-slate-400 hover:text-slate-600 flex-shrink-0 ml-2"
             >
                 <X className="w-6 h-6" />
             </button>
         </div>
      </div>
      
      {/* Content Area */}
      <div 
        className="flex-1 overflow-y-auto custom-scrollbar relative" 
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: `
            radial-gradient(1200px circle at 50% 40%, rgba(248, 250, 252, 0.8) 0%, transparent 60%),
            radial-gradient(900px circle at 70% 10%, rgba(147, 197, 253, 0.15) 0%, transparent 55%), 
            radial-gradient(800px circle at 30% 80%, rgba(196, 181, 253, 0.12) 0%, transparent 50%),
            linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)
          `,
          pointerEvents: 'auto'
        }}
      >
          {/* 액션 버튼들 - 컨텐츠 최상단 */}
          <div className="px-6 py-4 flex gap-3">
              <button 
                onClick={() => onOpenDetail && onOpenDetail(propertyId)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 text-[15px] font-bold rounded-xl transition-colors shadow-sm border border-slate-200"
              >
                  <ExternalLink className="w-4 h-4" />
                  더 자세히 보기
              </button>
              <button 
                onClick={() => onOpenRoadview && onOpenRoadview()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white text-[15px] font-bold rounded-xl transition-colors shadow-md shadow-amber-200"
              >
                  <Eye className="w-4 h-4" />
                  거리뷰로 보기
              </button>
          </div>
          
          {/* 아파트 상세 정보 */}
          <PropertyDetail propertyId={propertyId} onBack={() => {}} isCompact={false} isSidebar={true} onNeighborClick={onNeighborClick} />
      </div>
    </div>
  );
};