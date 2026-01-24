import React from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import HighchartsSankey from 'highcharts/modules/sankey';

// Sankey 모듈 초기화 (안전한 방식)
if (typeof Highcharts === 'object' && typeof HighchartsSankey === 'function') {
  try {
    // 이미 초기화되었는지 확인
    if (!(Highcharts as any).seriesTypes?.sankey) {
      (HighchartsSankey as (H: typeof Highcharts) => void)(Highcharts);
    }
  } catch (e) {
    console.error('Highcharts Sankey module initialization failed:', e);
  }
}

export interface SankeyNode {
  id: string;
  name: string;
  color?: string;
}

export interface SankeyLink {
  from: string;
  to: string;
  weight: number;
}

interface MigrationSankeyProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export const MigrationSankey: React.FC<MigrationSankeyProps> = ({ nodes, links }) => {
  // 데이터가 없으면 렌더링하지 않음
  if (!links || links.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm font-bold">데이터가 없습니다.</div>;
  }

  const options: Highcharts.Options = {
    chart: {
      type: 'sankey',
      height: 400,
      backgroundColor: 'transparent',
    },
    title: {
      text: undefined,
    },
    credits: {
      enabled: false,
    },
    accessibility: {
      point: {
        valueDescriptionFormat: '{index}. {point.from} to {point.to}, {point.weight}명.',
      },
    },
    tooltip: {
      formatter: function() {
        const point = (this as any).point;
        // 노드(지역)에 마우스를 올렸을 때
        if (point.isNode) {
            return `<b>${point.name}</b>`;
        }
        // 링크(이동)에 마우스를 올렸을 때
        return `
          <b>${point.fromNode?.name || ''}</b> → <b>${point.toNode?.name || ''}</b><br/>
          이동 인구: <b>${point.weight?.toLocaleString() || 0}명</b>
        `;
      },
      useHTML: true,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderRadius: 8,
      borderWidth: 0,
      shadow: true
    },
    series: [
      {
        type: 'sankey',
        name: '인구 이동',
        keys: ['from', 'to', 'weight'],
        data: links.map(link => [
          link.from,
          link.to,
          link.weight,
        ]),
        nodes: nodes.map(node => ({
          id: node.id,
          name: node.name,
          color: node.color,
        })),
        nodeWidth: 30,
        nodePadding: 20,
        minLinkWidth: 1, // 링크 최소 너비 설정
        curveFactor: 0.5,
        dataLabels: {
          enabled: true,
          format: '{point.name}',
          style: {
            fontSize: '13px',
            fontWeight: 'bold',
            textOutline: 'none',
            color: '#1e293b', // slate-800
          },
          allowOverlap: false
        },
        linkOpacity: 0.4,
        states: {
          hover: {
            linkOpacity: 0.8,
            brightness: 0.1
          },
          inactive: {
            linkOpacity: 0.1,
            opacity: 0.3
          }
        },
        // colors 배열은 nodes에서 지정한 color가 우선순위가 높으므로 생략 가능하나 fallback으로 유지
        colors: [
          '#3182F6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'
        ],
      } as any,
    ],
  };

  return (
    <div className="w-full">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
};