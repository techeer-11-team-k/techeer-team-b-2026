import React, { memo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ChartDataItem {
  month: string;
  매매평단가: number | null;
  전세평단가: number | null;
}

interface MarketTrendChartProps {
  data: ChartDataItem[];
  isDarkMode: boolean;
  selectedMarketPeriod: number;
  saleMonths: number;
  jeonseMonths: number;
}

const MarketTrendChart = memo(function MarketTrendChart({
  data,
  isDarkMode,
  selectedMarketPeriod,
  saleMonths,
  jeonseMonths,
}: MarketTrendChartProps) {
  const actualMonths = data.length;
  const hasLessData = actualMonths < selectedMarketPeriod;

  return (
    <div>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#3f3f46' : '#e4e4e7'} />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 10, fill: isDarkMode ? '#a1a1aa' : '#71717a' }}
            tickFormatter={(value) => value.split('-')[1]}
          />
          <YAxis 
            tick={{ fontSize: 10, fill: isDarkMode ? '#a1a1aa' : '#71717a' }}
            tickFormatter={(value) => `${value}만원`}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
              border: isDarkMode ? '1px solid #3f3f46' : '1px solid #e4e4e7',
              borderRadius: '8px',
              color: isDarkMode ? '#ffffff' : '#18181b'
            }}
            formatter={(value: number | null, name: string) => {
              if (value === null) return ['데이터 없음', name];
              return [`${value}만원`, name === '매매평단가' ? '매매' : '전세'];
            }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
            iconType="line"
            formatter={(value) => value === '매매평단가' ? '매매' : '전세'}
          />
          <Line 
            type="monotone" 
            dataKey="매매평단가" 
            stroke="#0ea5e9" 
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            name="매매평단가"
            connectNulls={false}
          />
          <Line 
            type="monotone" 
            dataKey="전세평단가" 
            stroke="#a78bfa" 
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            name="전세평단가"
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {hasLessData && (
        <div className={`mt-2 text-xs text-center ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
          ⓘ 요청: {selectedMarketPeriod}개월 / 실제 데이터: {actualMonths}개월 
          (매매: {saleMonths}개월, 전세: {jeonseMonths}개월)
        </div>
      )}
    </div>
  );
});

export default MarketTrendChart;
