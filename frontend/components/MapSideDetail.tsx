import React, { useState } from 'react';
import { X, MapPin, ExternalLink, AlertCircle } from 'lucide-react';
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
}

export const MapSideDetail: React.FC<MapSideDetailProps> = ({ propertyId, propertyData, onClose, onOpenDetail }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Revised Header for Side Panel */}
      <div className="sticky top-0 z-[100] px-7 py-5 border-b border-slate-200/50 bg-white/80 backdrop-blur-md" style={{ paddingTop: '1.75rem' }}>
         <div className="flex items-start justify-between mb-1">
             <div className="flex-1 min-w-0">
                 <h2 className="text-[22px] font-black text-slate-900 leading-tight">{propertyData.name}</h2>
                 <div className="flex items-center gap-1.5 mt-1.5 text-slate-500">
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      <span className="text-[17px] font-medium">{propertyData.location}</span>
                      {propertyData.isSpeculationArea && (
                        <div className="relative inline-flex items-center">
                          <div 
                            className="w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center cursor-help ml-1.5 flex-shrink-0"
                            onMouseEnter={() => setShowTooltip(true)}
                            onMouseLeave={() => setShowTooltip(false)}
                          >
                            <AlertCircle className="w-4 h-4 text-yellow-900" />
                          </div>
                          {showTooltip && (
                            <div className="fixed px-3 py-2 bg-slate-900 text-white text-[12px] font-medium rounded-lg shadow-lg whitespace-nowrap" style={{ top: '7rem', left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }}>
                              2025년 10월 기준, 정부 정책에 의해 투기 규제지역으로 선정된 시군구입니다
                            </div>
                          )}
                        </div>
                      )}
                 </div>
             </div>
             <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                 <button 
                    onClick={() => onOpenDetail && onOpenDetail(propertyId)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/80 hover:bg-white text-slate-700 text-[15px] font-bold rounded-lg transition-colors whitespace-nowrap shadow-sm border border-slate-200/50"
                 >
                     <ExternalLink className="w-4 h-4" />
                     더 자세히 보기
                 </button>
                 <button 
                    onClick={onClose} 
                    className="p-2.5 hover:bg-white/80 rounded-full transition-colors text-slate-400 hover:text-slate-600 flex-shrink-0"
                 >
                     <X className="w-6 h-6" />
                 </button>
             </div>
         </div>
      </div>
      
      {/* Content Area - Pass isCompact={false} to show full content, but adjust for sidebar width */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative" style={{
        background: `
          radial-gradient(1200px circle at 50% 40%, rgba(248, 250, 252, 0.8) 0%, transparent 60%),
          radial-gradient(900px circle at 70% 10%, rgba(147, 197, 253, 0.15) 0%, transparent 55%), 
          radial-gradient(800px circle at 30% 80%, rgba(196, 181, 253, 0.12) 0%, transparent 50%),
          linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)
        `
      }}>
          <PropertyDetail propertyId={propertyId} onBack={() => {}} isCompact={false} isSidebar={true} />
      </div>
    </div>
  );
};