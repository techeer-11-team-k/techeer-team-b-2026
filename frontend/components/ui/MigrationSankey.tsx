import React, { useRef, useEffect, useState } from 'react';
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
  netMigration?: number; // 순이동량 (유입 - 유출)
  nodeWidth?: number; // 노드 너비 (순이동량에 비례)
}

export interface SankeyLink {
  from: string;
  to: string;
  weight: number;
}

interface MigrationSankeyProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  height?: number; // 차트 높이 (옵션)
  onNodeClick?: (nodeId: string) => void; // 노드 클릭 핸들러 추가
}

export const MigrationSankey: React.FC<MigrationSankeyProps> = ({ nodes, links, height, onNodeClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(height || 400);

  // 컨테이너 높이를 동적으로 측정
  useEffect(() => {
    if (!height && containerRef.current) {
      const updateHeight = () => {
        if (containerRef.current) {
          const containerHeight = containerRef.current.clientHeight;
          // 여백을 고려하여 높이 설정 (약 20px 여백)
          setChartHeight(Math.max(containerHeight - 20, 300));
        }
      };

      updateHeight();
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }
  }, [height]);

  // 데이터가 없으면 렌더링하지 않음
  if (!links || links.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm font-bold">데이터가 없습니다.</div>;
  }

  // 같은 지역으로의 유입/유출 제외 (예: 서울 -> 서울)
  const filteredLinks = links.filter(link => link.from !== link.to);
  
  if (filteredLinks.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm font-bold">데이터가 없습니다.</div>;
  }

  // 노드별 유출/유입 분석
  const nodeStats = new Map<string, { isFrom: boolean; isTo: boolean }>();
  
  // 모든 노드 초기화
  nodes.forEach(node => {
    nodeStats.set(node.id, { isFrom: false, isTo: false });
  });
  
  // 필터링된 links 분석하여 각 노드가 from인지 to인지 확인
  filteredLinks.forEach(link => {
    const fromStats = nodeStats.get(link.from);
    const toStats = nodeStats.get(link.to);
    if (fromStats) fromStats.isFrom = true;
    if (toStats) toStats.isTo = true;
  });

  // 노드에 column 할당: 왼쪽(0) = 유출 지역, 오른쪽(1) = 유입 지역
  // 각 노드는 유출과 유입을 모두 할 수 있으므로, 중복 노드를 생성
  const processedNodes: Array<{ id: string; name: string; color?: string; column: number }> = [];
  // processedLinks는 이제 Object 배열로 변경하여 actualWeight를 전달
  const processedLinks: Array<{ from: string; to: string; weight: number; actualWeight: number }> = [];
  const nodeIdMap = new Map<string, { fromId: string; toId: string }>();

  // 각 노드에 대해 유출 노드와 유입 노드를 분리
  nodes.forEach(node => {
    const stats = nodeStats.get(node.id);
    if (!stats) return;

    const fromId = `${node.id}_from`; // 유출 노드 ID
    const toId = `${node.id}_to`;     // 유입 노드 ID
    
    nodeIdMap.set(node.id, { fromId, toId });

    // 유출 노드 (왼쪽, column: 0)
    if (stats.isFrom) {
      processedNodes.push({
        id: fromId,
        name: node.name,
        color: node.color,
        column: 0, // 왼쪽
        netMigration: (node as any).netMigration,
        nodeWidth: (node as any).nodeWidth || 30,
      } as any);
    }

    // 유입 노드 (오른쪽, column: 1)
    if (stats.isTo) {
      processedNodes.push({
        id: toId,
        name: node.name,
        color: node.color,
        column: 1, // 오른쪽
        netMigration: (node as any).netMigration,
        nodeWidth: (node as any).nodeWidth || 30,
      } as any);
    }
  });

  // 링크 가중치의 최소값과 최대값 계산 (두께 보정용)
  const weights = filteredLinks.map(link => link.weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  
  // 링크 두께 보정 (사용자 요청: 인구 이동 차이가 많아도 서로 비슷한 두께를 가지게, 노드 높이 대폭 확대)
  const normalizeWeight = (weight: number): number => {
    if (maxWeight === minWeight) return 50;
    
    // 로그 스케일 적용하여 격차 완화
    const logWeight = Math.log(weight + 1);
    const logMin = Math.log(minWeight + 1);
    const logMax = Math.log(maxWeight + 1);
    
    // 정규화 (0~1)
    const normalized = (logWeight - logMin) / (logMax - logMin);
    
    // 최소 두께 15px, 최대 두께 200px로 대폭 확대 (노드 높이 확보)
    const minDisplayWeight = 15;
    const maxDisplayWeight = 200;
    
    return minDisplayWeight + (normalized * (maxDisplayWeight - minDisplayWeight));
  };

  // 필터링된 links를 새로운 노드 ID로 변환하고 가중치 보정
  filteredLinks.forEach(link => {
    const fromMapping = nodeIdMap.get(link.from);
    const toMapping = nodeIdMap.get(link.to);
    
    if (fromMapping && toMapping) {
      const normalizedWeight = normalizeWeight(link.weight);
      processedLinks.push({
        from: fromMapping.fromId, // 유출 노드
        to: toMapping.toId,     // 유입 노드
        weight: normalizedWeight, // 시각적 두께
        actualWeight: link.weight // 실제 이동 인구 수
      });
    }
  });

  const options: Highcharts.Options = {
    chart: {
      type: 'sankey',
      height: chartHeight,
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
            // _from, _to 접미사 제거
            const displayName = point.name || point.id?.replace(/_from|_to/g, '') || '';
            const netMigration = (point as any).options?.netMigration;
            if (netMigration !== undefined) {
              const netValue = Math.floor(netMigration);
              const sign = netValue >= 0 ? '+' : '';
              const color = netValue >= 0 ? '#10b981' : '#ef4444';
              return `
                <div style="padding: 5px;">
                  <b style="font-size: 15px;">${displayName}</b><br/>
                  <span style="font-size: 13px;">총 이동량: ${Math.floor(point.sum).toLocaleString()}명</span><br/>
                  <span style="color: ${color}; font-weight: bold; font-size: 14px;">순이동: ${sign}${netValue.toLocaleString()}명</span>
                </div>
              `;
            }
            return `<b>${displayName}</b>`;
        }
        // 링크(이동)에 마우스를 올렸을 때
        const fromName = point.fromNode?.name?.replace(/_from|_to/g, '') || '';
        const toName = point.toNode?.name?.replace(/_from|_to/g, '') || '';
        
        // 실제 인구 수 사용 (actualWeight)
        const actualValue = point.actualWeight !== undefined ? point.actualWeight : (point.weight || 0);
        const weightValue = Math.floor(actualValue);
        
        return `
          <div style="padding: 5px;">
            <b style="font-size: 14px;">${fromName} → ${toName}</b><br/>
            이동 인구: <b style="font-size: 15px; color: #3182F6;">${weightValue.toLocaleString()}명</b>
          </div>
        `;
      },
      useHTML: true,
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e2e8f0',
      shadow: true
    },
    plotOptions: {
      sankey: {
        nodeWidth: 50,
        nodePadding: 20,
        minLinkWidth: 5,
        curveFactor: 0.5,
        dataLabels: {
          enabled: true,
          formatter: function() {
            const point = (this as any).point;
            const rawName = point.name || point.id || '';
            
            if (typeof rawName === 'string' && rawName.startsWith('highcharts-')) {
              return '';
            }
            
            const displayName = rawName.replace(/(_from|_to)$/, '');
            // HTML로 검은색 텍스트 강제 적용
            return `<span style="color: #000000; font-weight: bold; text-shadow: 0 0 2px white, 0 0 2px white;">${displayName}</span>`;
          },
          align: 'center',
          verticalAlign: 'middle',
          style: {
            fontSize: '15px',
            fontWeight: 'bold',
            textOutline: '2px white',
            color: '#000000',
            textShadow: 'none',
          },
          allowOverlap: true,
          useHTML: true, // HTML 사용하여 색상 강제
          // Highcharts의 자동 색상 조정 비활성화
          inside: false,
        },
        linkOpacity: 0.5,
        // 인터랙션 설정 추가
        point: {
          events: {
            click: function () {
              const point = this as any;
              if (point.isNode && onNodeClick) {
                // _from, _to 접미사 제거하고 원래 이름 추출
                const rawName = point.name || point.id || '';
                const nodeName = rawName.replace(/(_from|_to)$/, '');
                onNodeClick(nodeName);
              }
            }
          }
        },
        states: {
          hover: {
            linkOpacity: 0.8,
            brightness: 0.1
          },
          inactive: {
            linkOpacity: 0.1,
            opacity: 0.3
          }
        }
      }
    },
    series: [
      {
        type: 'sankey',
        name: '인구 이동',
        keys: ['from', 'to', 'weight', 'actualWeight'], // actualWeight 키 추가
        data: processedLinks.map(link => [link.from, link.to, link.weight, link.actualWeight]), // 배열 형태로 변환
        nodes: processedNodes.map(node => {
          // 노드별 너비 설정 (순이동량에 비례)
          const customWidth = (node as any).nodeWidth;
          return {
            ...node,
            ...(customWidth && { nodeWidth: customWidth }),
          };
        }),
        colors: [
          '#3182F6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'
        ],
      } as any,
    ],
  };

  return (
    <div ref={containerRef} className="w-full h-full">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
};