/**
 * Dashboard 차트 컴포넌트
 * 
 * 차트 관련 로직을 분리하여 성능 최적화
 */
import React, { useMemo } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface PriceTrendData {
  month: string;
  avg_price_per_pyeong: number;
}

interface VolumeTrendData {
  month: string;
  transaction_count: number;
}

interface DashboardChartsProps {
  priceTrend: PriceTrendData[];
  volumeTrend: VolumeTrendData[];
  isDarkMode: boolean;
}

const DashboardCharts = React.memo<DashboardChartsProps>(({
  priceTrend,
  volumeTrend,
  isDarkMode,
}) => {
  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-sky-800/30 shadow-[8px_8px_20px_rgba(0,0,0,0.5),-4px_-4px_12px_rgba(100,100,150,0.05)]'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';

  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';

  // 가격 변화율 계산 (메모이제이션)
  const priceChange = useMemo(() => {
    if (priceTrend.length < 2) return null;
    const latest = priceTrend[priceTrend.length - 1].avg_price_per_pyeong;
    const previous = priceTrend[priceTrend.length - 2].avg_price_per_pyeong;
    const change = ((latest - previous) / previous) * 100;
    return {
      value: change,
      isPositive: change >= 0,
    };
  }, [priceTrend]);

  // 거래량 변화율 계산 (메모이제이션)
  const volumeChange = useMemo(() => {
    if (volumeTrend.length < 2) return null;
    const latest = volumeTrend[volumeTrend.length - 1].transaction_count;
    const previous = volumeTrend[volumeTrend.length - 2].transaction_count;
    const change = ((latest - previous) / previous) * 100;
    return {
      value: change,
      isPositive: change >= 0,
    };
  }, [volumeTrend]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      {/* 평당가 추이 */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={`text-lg font-bold ${textPrimary}`}>전국 평당가 추이</h3>
            <p className={`text-xs ${textSecondary}`}>최근 12개월</p>
          </div>
          {priceChange && (
            <div
              className={`flex items-center gap-1 px-3 py-1 rounded-full ${
                priceChange.isPositive
                  ? 'bg-red-500/10 text-red-500'
                  : 'bg-blue-500/10 text-blue-500'
              }`}
            >
              {priceChange.isPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span className="text-sm font-semibold">
                {priceChange.value > 0 ? '+' : ''}
                {priceChange.value.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={priceTrend}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={isDarkMode ? '#334155' : '#e2e8f0'}
            />
            <XAxis
              dataKey="month"
              stroke={isDarkMode ? '#64748b' : '#94a3b8'}
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke={isDarkMode ? '#64748b' : '#94a3b8'}
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `${(value / 10000).toFixed(0)}억`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
                borderRadius: '8px',
              }}
              labelStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b' }}
              formatter={(value: number) => [
                `${(value / 10000).toFixed(0)}억원`,
                '평당가',
              ]}
            />
            <Area
              type="monotone"
              dataKey="avg_price_per_pyeong"
              stroke="#0ea5e9"
              strokeWidth={2}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 거래량 추이 */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={`text-lg font-bold ${textPrimary}`}>전국 거래량 추이</h3>
            <p className={`text-xs ${textSecondary}`}>최근 12개월</p>
          </div>
          {volumeChange && (
            <div
              className={`flex items-center gap-1 px-3 py-1 rounded-full ${
                volumeChange.isPositive
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-orange-500/10 text-orange-500'
              }`}
            >
              {volumeChange.isPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span className="text-sm font-semibold">
                {volumeChange.value > 0 ? '+' : ''}
                {volumeChange.value.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={volumeTrend}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={isDarkMode ? '#334155' : '#e2e8f0'}
            />
            <XAxis
              dataKey="month"
              stroke={isDarkMode ? '#64748b' : '#94a3b8'}
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke={isDarkMode ? '#64748b' : '#94a3b8'}
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
                borderRadius: '8px',
              }}
              labelStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b' }}
              formatter={(value: number) => [`${value.toLocaleString()}건`, '거래량']}
            />
            <Line
              type="monotone"
              dataKey="transaction_count"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ fill: '#10b981', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 커스텀 비교 함수 - 데이터가 실제로 변경되었을 때만 리렌더링
  return (
    prevProps.isDarkMode === nextProps.isDarkMode &&
    JSON.stringify(prevProps.priceTrend) === JSON.stringify(nextProps.priceTrend) &&
    JSON.stringify(prevProps.volumeTrend) === JSON.stringify(nextProps.volumeTrend)
  );
});

DashboardCharts.displayName = 'DashboardCharts';

export default DashboardCharts;
