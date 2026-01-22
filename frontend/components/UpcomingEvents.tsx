import React from 'react';
import { Calendar, TrendingUp, FileText, AlertCircle } from 'lucide-react';

interface EventItem {
  id: string;
  title: string;
  date: string;
  daysLeft?: number;
  icon: React.ReactNode;
  type: 'tax' | 'update' | 'deadline' | 'alert';
}

const mockEvents: EventItem[] = [
  {
    id: '1',
    title: '재산세 납부',
    date: '2024.07.15',
    daysLeft: 15,
    icon: <Calendar className="w-4 h-4" />,
    type: 'tax',
  },
  {
    id: '2',
    title: '관심 단지 실거래가 업데이트',
    date: '2024.07.01',
    icon: <TrendingUp className="w-4 h-4" />,
    type: 'update',
  },
  {
    id: '3',
    title: '부동산 등기 신고 마감',
    date: '2024.07.20',
    daysLeft: 20,
    icon: <FileText className="w-4 h-4" />,
    type: 'deadline',
  },
  {
    id: '4',
    title: '임대료 수령일',
    date: '2024.07.05',
    daysLeft: 5,
    icon: <AlertCircle className="w-4 h-4" />,
    type: 'alert',
  },
];

const getEventColor = (type: string) => {
  const colors: Record<string, string> = {
    tax: 'text-blue-600 bg-blue-50',
    update: 'text-purple-600 bg-purple-50',
    deadline: 'text-orange-600 bg-orange-50',
    alert: 'text-green-600 bg-green-50',
  };
  return colors[type] || 'text-slate-600 bg-slate-50';
};

export const UpcomingEvents: React.FC = () => {
  return (
    <div className="bg-white rounded-[28px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80">
      <h3 className="text-[15px] font-black text-slate-900 mb-4">부동산 주요 일정</h3>
      
      <div className="space-y-0">
        {mockEvents.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
          >
            <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${getEventColor(event.type)}`}>
              {event.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[12px] font-bold text-slate-900 truncate">{event.title}</span>
                {event.daysLeft && (
                  <span className="text-[10px] font-black text-red-500 tabular-nums flex-shrink-0 ml-2">
                    D-{event.daysLeft}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">{event.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
