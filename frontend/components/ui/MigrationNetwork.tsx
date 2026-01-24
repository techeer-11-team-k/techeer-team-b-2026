import React, { useEffect, useRef } from 'react';
import Highcharts from 'highcharts';
import HighchartsNetworkgraph from 'highcharts/modules/networkgraph';
import HighchartsReact from 'highcharts-react-official';

// 모듈 초기화 (한 번만 실행되도록)
if (typeof Highcharts === 'object' && typeof HighchartsNetworkgraph === 'function') {
    try {
        // 이미 초기화되었는지 확인
        if (!(Highcharts as any).seriesTypes?.networkgraph) {
            (HighchartsNetworkgraph as (H: typeof Highcharts) => void)(Highcharts);
        }
    } catch (e) {
        console.error('Highcharts Networkgraph module initialization failed:', e);
    }
}

interface MigrationNetworkProps {
    nodes: any[];
    links: any[];
    height?: number;
}

export const MigrationNetwork: React.FC<MigrationNetworkProps> = ({ nodes, links, height = 500 }) => {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const options: Highcharts.Options = {
        chart: {
            type: 'networkgraph',
            height: height,
            backgroundColor: 'transparent',
            style: {
                fontFamily: 'Pretendard, sans-serif'
            }
        },
        title: {
            text: undefined
        },
        credits: { enabled: false },
        plotOptions: {
            networkgraph: {
                layoutAlgorithm: {
                    enableSimulation: true,
                    integration: 'verlet',
                    linkLength: 100, // 노드 간 거리
                    gravitationalConstant: 0.05, // 중력 상수 (뭉치는 힘)
                    friction: -0.9 // 마찰력
                },
                keys: ['from', 'to'],
                marker: {
                    radius: 15, // 기본 반지름
                    lineWidth: 2,
                    lineColor: '#ffffff'
                },
                link: {
                    width: 2,
                    color: 'rgba(100, 116, 139, 0.3)', // slate-500 with opacity
                    dashStyle: 'Solid'
                },
                dataLabels: {
                    enabled: true,
                    linkFormat: '',
                    allowOverlap: false,
                    style: {
                        textOutline: 'none',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#1e293b' // slate-800
                    },
                    y: -25 // 마커 위로 올리기
                }
            }
        },
        tooltip: {
            useHTML: true,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderWidth: 0,
            borderRadius: 8,
            shadow: {
                offsetX: 0,
                offsetY: 4,
                width: 12,
                color: 'rgba(0,0,0,0.1)'
            },
            padding: 12,
            formatter: function (this: any) {
                const point = this.point as any;
                
                // 링크 툴팁 (링크인 경우 fromNode가 존재함)
                if (point.fromNode) {
                    const weight = point.weight ?? 0;
                    return `
                        <div class="flex flex-col gap-1">
                            <div class="text-xs text-slate-500 font-medium">이동 경로</div>
                            <div class="text-sm font-bold text-slate-800">
                                ${point.from} <span class="text-slate-400">→</span> ${point.to}
                            </div>
                            <div class="text-xs font-medium text-slate-600 mt-1">
                                이동 인구: <span class="text-blue-600 font-bold">${weight.toLocaleString()}명</span>
                            </div>
                        </div>
                    `;
                }
                
                // 노드 툴팁
                const netMigration = point.net ?? 0;
                const netColor = netMigration > 0 ? '#ef4444' : netMigration < 0 ? '#3b82f6' : '#64748b';
                const netText = netMigration > 0 ? `+${netMigration.toLocaleString()}` : netMigration.toLocaleString();
                const totalSum = point.sum ?? 0;
                
                return `
                    <div class="flex flex-col gap-1 min-w-[120px]">
                        <div class="text-sm font-bold text-slate-900 border-b border-slate-100 pb-1 mb-1">${point.id}</div>
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-slate-500">순이동</span>
                            <span style="color: ${netColor}" class="font-bold">${netText}명</span>
                        </div>
                        <div class="flex justify-between items-center text-xs mt-0.5">
                            <span class="text-slate-500">총 이동량</span>
                            <span class="text-slate-700 font-medium">${totalSum.toLocaleString()}명</span>
                        </div>
                    </div>
                `;
            }
        },
        series: [{
            type: 'networkgraph',
            name: '인구 이동 네트워크',
            data: links,
            nodes: nodes.map(node => ({
                id: node.id,
                title: node.title || node.id,
                color: node.net > 0 ? '#f87171' : '#60a5fa', // 유입: Red, 유출: Blue
                marker: {
                    // 순이동량(절대값) 또는 총이동량에 비례하여 크기 조절 (최소 10, 최대 40)
                    radius: Math.max(10, Math.min(40, 10 + (Math.abs(node.net || 0) / 1000) * 2))
                },
                ...node
            }))
        }]
    };

    return (
        <div className="w-full h-full relative animate-fade-in">
            <HighchartsReact
                highcharts={Highcharts}
                options={options}
                ref={chartRef}
            />
            <div className="absolute bottom-2 right-2 text-[10px] text-slate-400 bg-white/50 px-2 py-1 rounded backdrop-blur-sm">
                * 원 크기: 순이동 규모 | 색상: 🔴유입 🔵유출
            </div>
        </div>
    );
};
