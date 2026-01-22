import React from 'react';
import { Home, Compass, ArrowRightLeft, PieChart } from 'lucide-react';
import { SemiCircleGauge } from './ui/SemiCircleGauge';
import { ViewType } from '../types';

interface SidebarProps {
  currentView: ViewType;
  onChangeView: (view: ViewType) => void;
}

const tabs = [
  { id: 'dashboard' as ViewType, label: '홈', icon: Home },
  { id: 'map' as ViewType, label: '지도', icon: Compass },
  { id: 'compare' as ViewType, label: '비교', icon: ArrowRightLeft },
  { id: 'stats' as ViewType, label: '통계', icon: PieChart },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
  // 목표 달성률 계산 (예시 데이터)
  const currentReturnRate = 8.5; // 현재 수익률
  const targetReturnRate = 12.0; // 목표 수익률
  const achievementRate = (currentReturnRate / targetReturnRate) * 100;

  return (
    <div className="hidden md:flex fixed left-0 top-0 bottom-0 w-[280px] bg-white border-r border-slate-100/80 flex-col z-40 shadow-[2px_0_8px_rgba(0,0,0,0.04)]">
      {/* Profile Section */}
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
            <img 
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" 
              alt="User" 
              className="w-full h-full" 
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-black text-slate-900 truncate">김부자님</p>
            <p className="text-[12px] text-slate-500 font-medium">투자자</p>
          </div>
        </div>
      </div>

      {/* Gauge Chart Section */}
      <div className="p-6 border-b border-slate-100">
        <div className="mb-4">
          <h3 className="text-[13px] font-black text-slate-900 mb-1">부동산 투자 목표치 달성률</h3>
          <p className="text-[11px] text-slate-500 font-medium">연간 수익률 목표 대비</p>
        </div>
        <div className="flex justify-center py-4">
          <SemiCircleGauge 
            value={currentReturnRate}
            target={targetReturnRate}
            currentValue={currentReturnRate}
            size={180}
          />
        </div>
        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-bold text-slate-600">현재 수익률</span>
            <span className="text-[15px] font-black text-slate-900 tabular-nums">{currentReturnRate.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-slate-600">목표 수익률</span>
            <span className="text-[15px] font-black text-slate-500 tabular-nums">{targetReturnRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <nav className="p-4 space-y-1">
          {tabs.map((tab) => {
            const isActive = currentView === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onChangeView(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-brand-blue text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[15px] font-bold">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
