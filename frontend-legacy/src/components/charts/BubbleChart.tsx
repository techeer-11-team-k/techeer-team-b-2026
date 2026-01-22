import React, { useEffect, useRef } from 'react';
import Highcharts from 'highcharts';
// @ts-ignore - HighchartsMore는 side effect만 있는 모듈
import 'highcharts/highcharts-more';
import { RegionalCorrelationItem } from '../../lib/dashboardApi';

interface BubbleChartProps {
  data: RegionalCorrelationItem[];
  isDarkMode: boolean;
}

export default function BubbleChart({ data, isDarkMode }: BubbleChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data || data.length === 0 || !chartRef.current) return;

    // 상승률 범위 계산 (버블 크기용)
    const changeRates = data.map(d => Math.abs(d.change_rate));
    const maxChangeRate = Math.max(...changeRates, 1);

    const chart = Highcharts.chart(chartRef.current, {
      chart: {
        type: 'bubble',
        backgroundColor: 'transparent',
        height: 400
      },
      title: {
        text: ''
      },
      xAxis: {
        title: {
          text: '평당가 (만원)',
          style: {
            color: isDarkMode ? '#a1a1aa' : '#71717a'
          }
        },
        labels: {
          style: {
            color: isDarkMode ? '#a1a1aa' : '#71717a'
          }
        },
        lineColor: isDarkMode ? '#3f3f46' : '#e4e4e7'
      },
      yAxis: {
        title: {
          text: '거래량 (건)',
          style: {
            color: isDarkMode ? '#a1a1aa' : '#71717a'
          }
        },
        labels: {
          style: {
            color: isDarkMode ? '#a1a1aa' : '#71717a'
          }
        },
        gridLineColor: isDarkMode ? '#3f3f46' : '#e4e4e7'
      },
      tooltip: {
        backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
        borderColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
        style: {
          color: isDarkMode ? '#ffffff' : '#18181b'
        },
        formatter: function() {
          const point = this.point as any;
          return `
            <b>${point.region}</b><br/>
            평당가: ${point.x.toLocaleString()}만원<br/>
            거래량: ${point.y.toLocaleString()}건<br/>
            상승률: ${point.change_rate >= 0 ? '+' : ''}${point.change_rate.toFixed(2)}%
          `;
        }
      },
      legend: {
        enabled: false
      },
      plotOptions: {
        bubble: {
          minSize: 20,
          maxSize: 80,
          dataLabels: {
            enabled: true,
            format: '{point.region}',
            style: {
              color: isDarkMode ? '#ffffff' : '#18181b',
              fontSize: '11px',
              fontWeight: 'bold',
              textOutline: '1px contrast'
            }
          }
        }
      },
      series: [{
        name: '지역',
        data: data.map(d => ({
          x: d.avg_price_per_pyeong,
          y: d.transaction_count,
          z: Math.abs(d.change_rate) / maxChangeRate * 100, // 버블 크기 (0-100)
          region: d.region,
          change_rate: d.change_rate
        })),
        colorByPoint: true,
        colors: [
          '#FFB6C1', '#87CEEB', '#98D8C8', '#F7DC6F', '#BB8FCE',
          '#85C1E2', '#F8B88B', '#AED6F1', '#D5A6BD', '#A9DFBF',
          '#F9E79F', '#D7BDE2'
        ]
      }],
      credits: {
        enabled: false
      }
    });

    return () => {
      chart.destroy();
    };
  }, [data, isDarkMode]);

  return <div ref={chartRef} className="w-full"></div>;
}
