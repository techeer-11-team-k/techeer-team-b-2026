/**
 * 차트 컴포넌트 Lazy Loading
 * 
 * 차트 라이브러리는 크기가 크므로 (highcharts, recharts, d3 등)
 * 사용자가 실제로 차트를 볼 때만 로드합니다.
 * 
 * 이를 통해 초기 번들 크기를 크게 줄일 수 있습니다.
 */

import React, { Suspense, lazy } from 'react';

// Lazy load 차트 컴포넌트들
const HistogramChartLazy = lazy(() => import('./charts/HistogramChart'));
const BubbleChartLazy = lazy(() => import('./charts/BubbleChart'));
const TreemapChartLazy = lazy(() => import('./charts/TreemapChart'));

// 로딩 스켈레톤
const ChartSkeleton = ({ height = 300, isDarkMode = false }: { height?: number; isDarkMode?: boolean }) => (
  <div 
    className={`w-full animate-pulse ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-200'} rounded-lg`}
    style={{ height }}
  >
    <div className="flex items-center justify-center h-full">
      <div className={`text-sm ${isDarkMode ? 'text-zinc-600' : 'text-gray-400'}`}>
        차트 로딩 중...
      </div>
    </div>
  </div>
);

// Histogram Chart Wrapper
export const LazyHistogramChart = (props: any) => (
  <Suspense fallback={<ChartSkeleton height={400} isDarkMode={props.isDarkMode} />}>
    <HistogramChartLazy {...props} />
  </Suspense>
);

// Bubble Chart Wrapper
export const LazyBubbleChart = (props: any) => (
  <Suspense fallback={<ChartSkeleton height={500} isDarkMode={props.isDarkMode} />}>
    <BubbleChartLazy {...props} />
  </Suspense>
);

// Treemap Chart Wrapper
export const LazyTreemapChart = (props: any) => (
  <Suspense fallback={<ChartSkeleton height={400} isDarkMode={props.isDarkMode} />}>
    <TreemapChartLazy {...props} />
  </Suspense>
);

// Recharts 컴포넌트들도 Lazy Loading
const RechartsLazy = lazy(() => import('recharts').then(module => ({
  default: module
})));

export const LazyLineChart = (props: any) => (
  <Suspense fallback={<ChartSkeleton height={300} isDarkMode={props.isDarkMode} />}>
    <RechartsLazy {...props} />
  </Suspense>
);
