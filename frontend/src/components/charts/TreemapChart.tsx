import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { TransactionVolumeItem } from '../../lib/dashboardApi';

interface TreemapChartProps {
  data: TransactionVolumeItem[];
  isDarkMode: boolean;
}

export default function TreemapChart({ data, isDarkMode }: TreemapChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data || data.length === 0 || !svgRef.current || !containerRef.current) return;

    // 기존 SVG 제거
    d3.select(svgRef.current).selectAll('*').remove();

    const width = containerRef.current.clientWidth;
    const height = 400;
    const margin = { top: 10, right: 10, bottom: 10, left: 10 };

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // 색상 스케일 (파스텔톤)
    const colorScale = d3.scaleOrdinal<string>()
      .domain(data.map(d => d.name))
      .range([
        '#FFB6C1', '#87CEEB', '#98D8C8', '#F7DC6F', '#BB8FCE',
        '#85C1E2', '#F8B88B', '#AED6F1', '#D5A6BD', '#A9DFBF',
        '#F9E79F', '#D7BDE2'
      ]);

    // 트리맵 레이아웃
    const treemap = d3.treemap()
      .size([width - margin.left - margin.right, height - margin.top - margin.bottom])
      .padding(2)
      .round(true);

    // 데이터 계층 구조 생성
    const root = d3.hierarchy({ name: 'root', children: data })
      .sum((d: any) => d.value || 0)
      .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

    treemap(root);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const cell = g.selectAll('g')
      .data(root.leaves())
      .enter()
      .append('g')
      .attr('transform', (d: any) => `translate(${d.x0},${d.y0})`);

    cell.append('rect')
      .attr('width', (d: any) => d.x1 - d.x0)
      .attr('height', (d: any) => d.y1 - d.y0)
      .attr('fill', (d: any) => colorScale(d.data.name))
      .attr('stroke', isDarkMode ? '#3f3f46' : '#e4e4e7')
      .attr('stroke-width', 2)
      .attr('rx', 4)
      .on('mouseover', function() {
        d3.select(this).attr('opacity', 0.8);
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 1);
      });

    cell.append('text')
      .attr('x', (d: any) => (d.x1 - d.x0) / 2)
      .attr('y', (d: any) => (d.y1 - d.y0) / 2 - 5)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .attr('fill', isDarkMode ? '#ffffff' : '#18181b')
      .text((d: any) => d.data.name);

    cell.append('text')
      .attr('x', (d: any) => (d.x1 - d.x0) / 2)
      .attr('y', (d: any) => (d.y1 - d.y0) / 2 + 15)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', isDarkMode ? '#a1a1aa' : '#71717a')
      .text((d: any) => `${(d.value || 0).toLocaleString()}건`);

  }, [data, isDarkMode]);

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full"></svg>
    </div>
  );
}
