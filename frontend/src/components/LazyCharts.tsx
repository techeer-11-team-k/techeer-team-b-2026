import { lazy } from 'react';

// Recharts 컴포넌트들을 lazy loading으로 import
export const LineChart = lazy(() => 
  import('recharts').then(module => ({ default: module.LineChart }))
);

export const Line = lazy(() => 
  import('recharts').then(module => ({ default: module.Line }))
);

export const AreaChart = lazy(() => 
  import('recharts').then(module => ({ default: module.AreaChart }))
);

export const Area = lazy(() => 
  import('recharts').then(module => ({ default: module.Area }))
);

export const BarChart = lazy(() => 
  import('recharts').then(module => ({ default: module.BarChart }))
);

export const Bar = lazy(() => 
  import('recharts').then(module => ({ default: module.Bar }))
);

export const XAxis = lazy(() => 
  import('recharts').then(module => ({ default: module.XAxis }))
);

export const YAxis = lazy(() => 
  import('recharts').then(module => ({ default: module.YAxis }))
);

export const CartesianGrid = lazy(() => 
  import('recharts').then(module => ({ default: module.CartesianGrid }))
);

export const Tooltip = lazy(() => 
  import('recharts').then(module => ({ default: module.Tooltip }))
);

export const ResponsiveContainer = lazy(() => 
  import('recharts').then(module => ({ default: module.ResponsiveContainer }))
);

export const Legend = lazy(() => 
  import('recharts').then(module => ({ default: module.Legend }))
);
