import React, { useState } from 'react';

interface HPIData {
  name: string;
  value: number;
  change: number;
  isPositive: boolean;
}

interface HPIHeatmapProps {
  data: HPIData[];
}

// 육각형 경로 생성 함수
const createHexagonPath = (cx: number, cy: number, size: number): string => {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return points.join(' ');
};

// 색상 계산 함수 (상승: 빨간색, 하락: 파란색)
const getColor = (change: number, isPositive: boolean): string => {
  if (isPositive) {
    // 상승: 빨간색 계열 (진한 빨강에서 연한 빨강)
    const intensity = Math.min(Math.abs(change) / 1.0, 1); // 최대 1% 기준
    const r = Math.floor(239 + (255 - 239) * intensity);
    const g = Math.floor(68 - 68 * intensity);
    const b = Math.floor(68 - 68 * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // 하락: 파란색 계열 (진한 파랑에서 연한 파랑)
    const intensity = Math.min(Math.abs(change) / 1.0, 1);
    const r = Math.floor(49 - 49 * intensity);
    const g = Math.floor(130 - 130 * intensity);
    const b = Math.floor(246 - 246 * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  }
};

export const HPIHeatmap: React.FC<HPIHeatmapProps> = ({ data }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  // 육각형 그리드 배치 (3행 2열)
  const cols = 2;
  const hexSize = 50;
  const hexSpacing = 120; // 육각형 간격
  
  return (
    <div className="w-full flex items-center justify-center py-8">
      <svg 
        width="100%" 
        height="400" 
        viewBox="0 0 300 400" 
        className="overflow-visible"
      >
        {data.map((item, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          
          // 육각형 중심 좌표 계산 (오프셋 적용)
          const cx = 100 + col * hexSpacing;
          const cy = 80 + row * (hexSpacing * 0.85);
          
          const color = getColor(item.change, item.isPositive);
          const isHovered = hoveredIndex === index;
          
          return (
            <g key={index}>
              {/* 육각형 */}
              <polygon
                points={createHexagonPath(cx, cy, hexSize)}
                fill={color}
                stroke="#ffffff"
                strokeWidth={isHovered ? 3 : 2}
                className="transition-all duration-200 cursor-pointer"
                style={{
                  filter: isHovered ? 'brightness(1.1) drop-shadow(0 4px 8px rgba(0,0,0,0.15))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                  transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                  transformOrigin: `${cx}px ${cy}px`,
                }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              
              {/* 지역명 */}
              <text
                x={cx}
                y={cy - 15}
                textAnchor="middle"
                className="text-[11px] font-bold fill-white pointer-events-none"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
              >
                {item.name}
              </text>
              
              {/* HPI 값 */}
              <text
                x={cx}
                y={cy + 5}
                textAnchor="middle"
                className="text-[14px] font-black fill-white pointer-events-none"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
              >
                {item.value}
              </text>
              
              {/* 변동률 */}
              <text
                x={cx}
                y={cy + 25}
                textAnchor="middle"
                className="text-[12px] font-bold fill-white pointer-events-none"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
              >
                {item.isPositive ? '+' : ''}{item.change}%
              </text>
              
              {/* 툴팁 (호버 시) */}
              {isHovered && (
                <g>
                  <rect
                    x={cx - 60}
                    y={cy - hexSize - 50}
                    width="120"
                    height="40"
                    rx="8"
                    fill="rgba(0, 0, 0, 0.8)"
                    className="pointer-events-none"
                  />
                  <text
                    x={cx}
                    y={cy - hexSize - 30}
                    textAnchor="middle"
                    className="text-[12px] font-bold fill-white pointer-events-none"
                  >
                    {item.name}
                  </text>
                  <text
                    x={cx}
                    y={cy - hexSize - 15}
                    textAnchor="middle"
                    className="text-[11px] font-medium fill-slate-300 pointer-events-none"
                  >
                    HPI: {item.value} | {item.isPositive ? '+' : ''}{item.change}%
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
