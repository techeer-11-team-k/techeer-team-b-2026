import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface PortfolioData {
  region: string;
  value: number;
  color: string;
  [key: string]: string | number;
}

const portfolioData: PortfolioData[] = [
  { region: '서울', value: 50, color: '#3b82f6' },
  { region: '경기', value: 30, color: '#8b5cf6' },
  { region: '기타', value: 20, color: '#10b981' },
];

export const PortfolioDonutChart: React.FC = () => {
  const total = portfolioData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white rounded-[28px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80">
      <h3 className="text-[15px] font-black text-slate-900 mb-4">자산 포트폴리오</h3>
      
      <div className="flex flex-col items-center">
        <div className="w-[200px] h-[200px] relative mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={portfolioData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                label={({ value }) => `${value}%`}
                labelLine={false}
              >
                {portfolioData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => `${value}%`}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '8px 12px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="w-full space-y-1.5">
          {portfolioData.map((item, index) => (
            <div key={index} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 transition-colors">
              <div 
                className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                style={{ backgroundColor: item.color }}
              ></div>
              <span className="text-[12px] font-bold text-slate-900">{item.region}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
