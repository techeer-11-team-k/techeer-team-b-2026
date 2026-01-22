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

interface MigrationData {
  name: string;
  value: number;
  label: string;
}

interface MigrationSankeyProps {
  data: MigrationData[];
}

// 더미 데이터 생성: 지역 간 인구 이동
const generateSankeyData = (baseData: MigrationData[]) => {
  // 노드 정의 (출발지와 도착지)
  const nodes: any[] = [];
  const links: any[] = [];
  
  // 출발지 노드 (순유출 지역)
  const sourceRegions = baseData.filter(d => d.value < 0);
  // 도착지 노드 (순유입 지역)
  const targetRegions = baseData.filter(d => d.value > 0);
  
  // 모든 지역을 노드로 추가
  baseData.forEach((region) => {
    nodes.push({
      id: region.name,
      name: region.name,
    });
  });
  
  // 순유출 지역에서 순유입 지역으로의 이동 링크 생성
  sourceRegions.forEach((source) => {
    const outflow = Math.abs(source.value);
    
    // 각 순유입 지역으로 분배
    targetRegions.forEach((target) => {
      // 가중치에 따라 분배 (더 큰 순유입 지역이 더 많이 받음)
      const totalInflow = targetRegions.reduce((sum, r) => sum + r.value, 0);
      const weight = target.value / totalInflow;
      const flowValue = Math.round(outflow * weight);
      
      if (flowValue > 0) {
        links.push({
          from: source.name,
          to: target.name,
          weight: flowValue,
        });
      }
    });
  });
  
  return { nodes, links };
};

export const MigrationSankey: React.FC<MigrationSankeyProps> = ({ data }) => {
  const { nodes, links } = generateSankeyData(data);
  
  const options: Highcharts.Options = {
    chart: {
      type: 'sankey',
      height: 400,
      backgroundColor: 'transparent',
    },
    title: {
      text: '',
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
        return `
          <b>${point.fromNode?.name || ''}</b> → <b>${point.toNode?.name || ''}</b><br/>
          이동 인구: <b>${point.weight?.toLocaleString() || 0}명</b>
        `;
      },
      useHTML: true,
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
        nodes: nodes,
        nodeWidth: 25,
        nodePadding: 15,
        minLinkWidth: 3,
        dataLabels: {
          enabled: true,
          format: '{point.name}',
          style: {
            fontSize: '12px',
            fontWeight: 'bold',
            textOutline: '1px contrast',
            color: '#334155',
          },
        },
        linkOpacity: 0.6,
        states: {
          hover: {
            linkOpacity: 0.9,
          },
        },
        colorByPoint: false,
        colors: [
          '#3182F6', // 파란색
          '#10b981', // 초록색
          '#f59e0b', // 주황색
          '#8b5cf6', // 보라색
          '#ec4899', // 핑크색
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
