import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

export interface ComparisonData {
  region: string;
  myProperty: number;
  regionAverage: number;
  aptName?: string;
}

interface RegionComparisonChartProps {
  data?: ComparisonData[];
  isLoading?: boolean;
}

const mockData: ComparisonData[] = [
  { region: '의정부 민락금...', myProperty: 5.3, regionAverage: 3.2, aptName: '의정부 민락금강펜테리움아파트' },
  { region: '바다마을아파트', myProperty: 8.7, regionAverage: 6.5, aptName: '바다마을아파트' },
  { region: '호반베르디움', myProperty: 12.1, regionAverage: 9.3, aptName: '호반베르디움' },
];

export const RegionComparisonChart: React.FC<RegionComparisonChartProps> = ({ data, isLoading = false }) => {
  // 전달받은 데이터 확인 및 더미 데이터 사용 로직
  // 실제 데이터가 있고 모든 값이 0이 아닌 경우만 사용, 그 외에는 더미 데이터 사용
  const hasValidData = data && data.length > 0 && data.some(d => 
    (d.myProperty !== 0 && d.myProperty !== null && d.myProperty !== undefined) || 
    (d.regionAverage !== 0 && d.regionAverage !== null && d.regionAverage !== undefined)
  );
  
  const chartData = hasValidData ? data : mockData;
  const hasData = chartData.length > 0;
  
  // 디버깅: 데이터 확인
  console.log('[RegionComparisonChart] 받은 데이터:', data);
  console.log('[RegionComparisonChart] 유효한 데이터 여부:', hasValidData);
  console.log('[RegionComparisonChart] 사용할 데이터:', chartData);

  return (
    <>
      <div className="bg-white rounded-[28px] p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80 h-full flex flex-col">
        <div className="mb-6">
          <h2 className="text-xl font-black text-slate-900 tracking-tight mb-2">지역 대비 수익률 비교</h2>
          <p className="text-[13px] text-slate-500 font-medium">내 단지 상승률 vs 해당 행정구역 평균 상승률</p>
        </div>
        
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-[13px] text-slate-500 font-medium">데이터 로딩 중...</p>
              </div>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 0, bottom: 70 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="region" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                height={80}
                angle={-25}
                textAnchor="end"
                interval={0}
                width={100}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 'bold' }}
                tickFormatter={(val) => `${val > 0 ? '+' : ''}${val.toFixed(1)}%`}
                domain={['auto', 'auto']}
                width={55}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '14px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                }}
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as ComparisonData;
                    const myProperty = data.myProperty;
                    const regionAverage = data.regionAverage;
                    const diff = myProperty - regionAverage;
                    const fullName = data.aptName || label;
                    
                    return (
                      <div className="bg-white rounded-xl p-4 shadow-lg border border-slate-200">
                        <p className="font-bold text-slate-900 mb-3 text-sm">{fullName}</p>
                        <div className="space-y-2 mb-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-600">내 단지 상승률</span>
                            <span className={`font-bold text-sm ${myProperty >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                              {myProperty > 0 ? '+' : ''}{myProperty.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-600">행정구역 평균 상승률</span>
                            <span className={`font-bold text-sm ${regionAverage >= 0 ? 'text-purple-600' : 'text-orange-500'}`}>
                              {regionAverage > 0 ? '+' : ''}{regionAverage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="pt-3 border-t border-slate-200">
                          <p className="text-[10px] text-slate-500 mb-1.5 font-medium">상세 정보</p>
                          <div className="space-y-1 text-[11px] text-slate-600">
                            <p>• 차이: {diff > 0 ? '+' : ''}{diff.toFixed(1)}%p</p>
                            <p>• {myProperty > regionAverage ? '내 단지가 행정구역 평균보다 높은 수익률을 보이고 있습니다.' : '내 단지가 행정구역 평균보다 낮은 수익률을 보이고 있습니다.'}</p>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                wrapperStyle={{ 
                  paddingTop: '10px',
                  display: 'flex',
                  justifyContent: 'center',
                  width: '100%'
                }}
                iconType="circle"
                align="center"
                verticalAlign="bottom"
                content={({ payload }) => {
                  if (!payload || !payload.length) return null;
                  return (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
                      {payload.map((entry, index) => {
                        let iconColor = '#94a3b8';
                        if (entry.dataKey === 'myProperty') {
                          // myProperty 색상: 양수면 blue, 음수면 red
                          iconColor = '#3b82f6'; // blue-500 (양수 기본값)
                        } else if (entry.dataKey === 'regionAverage') {
                          // regionAverage 색상: 양수면 purple, 음수면 orange
                          iconColor = '#8b5cf6'; // purple-500 (양수 기본값)
                        }
                        return (
                          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                              <circle cx="7" cy="7" r="6" fill={iconColor} />
                            </svg>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
                              {entry.dataKey === 'myProperty' ? '내 단지 상승률' : '행정구역 평균 상승률'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
                            <Bar 
                                dataKey="myProperty" 
                                name="myProperty"
                                radius={[8, 8, 0, 0]}
                                label={{ 
                                  position: 'top', 
                                  formatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`,
                                  fontSize: 11,
                                  fill: '#475569',
                                  fontWeight: 'bold'
                                }}
                              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-my-${index}`} 
                    fill={entry.myProperty >= 0 
                      ? 'url(#myPropertyGradient)' 
                      : 'url(#myPropertyNegativeGradient)'
                    } 
                  />
                ))}
              </Bar>
                            <Bar 
                                dataKey="regionAverage" 
                                name="regionAverage"
                                radius={[8, 8, 0, 0]}
                                label={{ 
                                  position: 'top', 
                                  formatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`,
                                  fontSize: 11,
                                  fill: '#475569',
                                  fontWeight: 'bold'
                                }}
                              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-avg-${index}`} 
                    fill={entry.regionAverage >= 0 
                      ? 'url(#regionAverageGradient)' 
                      : 'url(#regionAverageNegativeGradient)'
                    } 
                  />
                ))}
              </Bar>
              <defs>
                <linearGradient id="myPropertyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="myPropertyNegativeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="regionAverageGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="regionAverageNegativeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.8} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
};
