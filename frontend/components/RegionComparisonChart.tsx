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
  { region: '수원시 영통구', myProperty: 14.2, regionAverage: 8.5 },
  { region: '시흥시 배곧동', myProperty: 9.7, regionAverage: 6.2 },
  { region: '김포시 장기동', myProperty: -7.1, regionAverage: -3.5 },
];

export const RegionComparisonChart: React.FC<RegionComparisonChartProps> = ({ data, isLoading = false }) => {
  const [selectedRegion, setSelectedRegion] = useState<ComparisonData | null>(null);
  
  // 전달받은 데이터가 있으면 사용, 없으면 빈 배열 (로그인 안됨 등)
  const chartData = data && data.length > 0 ? data : [];
  const hasData = chartData.length > 0;

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
          ) : !hasData ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-[15px] font-bold text-slate-500 mb-1">등록된 자산이 없습니다</p>
                <p className="text-[13px] text-slate-400">내 자산에서 아파트를 추가하면<br/>지역별 수익률을 비교할 수 있습니다</p>
              </div>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="region" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }}
                height={60}
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
                  padding: '12px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                }}
                formatter={(value: number) => [`${value > 0 ? '+' : ''}${value.toFixed(1)}%`, '']}
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
                    {value === 'myProperty' ? '내 단지 변동률' : '행정구역 평균'}
                  </span>
                )}
              />
                            <Bar 
                                dataKey="myProperty" 
                                name="myProperty"
                                radius={[8, 8, 0, 0]}
                                onClick={(_data, index) => handleBarClick(chartData[index])}
                                style={{ cursor: 'pointer' }}
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

      {/* 우측 검정색 패널 */}
      {selectedRegion && (
        <div className="fixed right-0 top-0 h-full w-96 bg-black text-white z-[100] shadow-2xl animate-slide-in-right">
          <div className="p-8 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black">{selectedRegion.region}</h3>
              <button 
                onClick={() => setSelectedRegion(null)}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <p className="text-[13px] text-gray-400 mb-2">내 단지 상승률</p>
                <p className={`text-3xl font-black ${selectedRegion.myProperty >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedRegion.myProperty > 0 ? '+' : ''}{selectedRegion.myProperty.toFixed(1)}%
                </p>
              </div>
              
              <div>
                <p className="text-[13px] text-gray-400 mb-2">행정구역 평균 상승률</p>
                <p className={`text-3xl font-black ${selectedRegion.regionAverage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedRegion.regionAverage > 0 ? '+' : ''}{selectedRegion.regionAverage.toFixed(1)}%
                </p>
              </div>

              <div className="pt-6 border-t border-gray-700">
                <p className="text-[13px] text-gray-400 mb-3">상세 정보</p>
                <div className="space-y-2 text-[14px] text-gray-300">
                  <p>• 지역: {selectedRegion.region}</p>
                  <p>• 내 단지와 행정구역 평균 차이: {(selectedRegion.myProperty - selectedRegion.regionAverage).toFixed(1)}%p</p>
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
