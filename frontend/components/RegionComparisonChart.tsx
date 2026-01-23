import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { X, Building2 } from 'lucide-react';

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
  const [selectedRegion, setSelectedRegion] = useState<ComparisonData | null>(null);
  
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

  const handleBarClick = (clickedData: ComparisonData) => {
    setSelectedRegion(clickedData);
  };

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
                formatter={(value: number, name: string, props: any) => {
                  const label = name === 'myProperty' ? '내 단지 상승률' : '행정구역 평균 상승률';
                  return [`${value > 0 ? '+' : ''}${value.toFixed(1)}%`, label];
                }}
                labelFormatter={(label, payload) => {
                  const fullName = payload && payload[0]?.payload?.aptName ? payload[0].payload.aptName : label;
                  return `아파트: ${fullName}`;
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
                formatter={(value) => (
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
                    {value === 'myProperty' ? '내 단지 상승률' : '행정구역 평균 상승률'}
                  </span>
                )}
              />
                            <Bar 
                                dataKey="myProperty" 
                                name="myProperty"
                                radius={[8, 8, 0, 0]}
                                onClick={(_data, index) => handleBarClick(chartData[index])}
                                style={{ cursor: 'pointer' }}
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
                                onClick={(_data, index) => handleBarClick(chartData[index])}
                                style={{ cursor: 'pointer' }}
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

      {/* 우측 검정색 패널 - 작은 크기 */}
      {selectedRegion && (
        <div className="fixed right-0 top-0 h-full w-64 bg-black text-white z-[100] shadow-2xl animate-slide-in-right">
          <div className="p-5 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black">{selectedRegion.aptName || selectedRegion.region}</h3>
              <button 
                onClick={() => setSelectedRegion(null)}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-[11px] text-gray-400 mb-1.5">내 단지 상승률</p>
                <p className={`text-2xl font-black ${selectedRegion.myProperty >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedRegion.myProperty > 0 ? '+' : ''}{selectedRegion.myProperty.toFixed(1)}%
                </p>
              </div>
              
              <div>
                <p className="text-[11px] text-gray-400 mb-1.5">행정구역 평균 상승률</p>
                <p className={`text-2xl font-black ${selectedRegion.regionAverage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedRegion.regionAverage > 0 ? '+' : ''}{selectedRegion.regionAverage.toFixed(1)}%
                </p>
              </div>

              <div className="pt-4 border-t border-gray-700">
                <p className="text-[11px] text-gray-400 mb-2">상세 정보</p>
                <div className="space-y-1.5 text-[12px] text-gray-300">
                  <p>• 차이: {(selectedRegion.myProperty - selectedRegion.regionAverage).toFixed(1)}%p</p>
                  <p>• {selectedRegion.myProperty > selectedRegion.regionAverage ? '내 단지가 행정구역 평균보다 높은 수익률을 보이고 있습니다.' : '내 단지가 행정구역 평균보다 낮은 수익률을 보이고 있습니다.'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
