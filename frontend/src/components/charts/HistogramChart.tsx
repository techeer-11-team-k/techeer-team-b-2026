import React, { useEffect, useRef } from 'react';
import Highcharts from 'highcharts';
import { PriceDistributionItem } from '../../lib/dashboardApi';

interface HistogramChartProps {
  data: PriceDistributionItem[];
  isDarkMode: boolean;
}

export default function HistogramChart({ data, isDarkMode }: HistogramChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data || data.length === 0 || !chartRef.current) return;

    const chart = Highcharts.chart(chartRef.current, {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        height: 400
      },
      title: {
        text: ''
      },
      xAxis: {
        categories: data.map(d => d.price_range),
        labels: {
          style: {
            color: isDarkMode ? '#a1a1aa' : '#71717a'
          }
        },
        lineColor: isDarkMode ? '#3f3f46' : '#e4e4e7'
      },
      yAxis: {
        title: {
          text: '거래 건수',
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
            <b>${point.category}</b><br/>
            거래 건수: ${point.y.toLocaleString()}건<br/>
            평균 가격: ${point.avg_price}억원
          `;
        }
      },
      legend: {
        enabled: false
      },
      plotOptions: {
        column: {
          borderRadius: 4,
          colorByPoint: true,
          colors: [
            '#FFB6C1', '#87CEEB', '#98D8C8', '#F7DC6F', '#BB8FCE',
            '#85C1E2', '#F8B88B', '#AED6F1', '#D5A6BD', '#A9DFBF'
          ],
          dataLabels: {
            enabled: true,
            style: {
              color: isDarkMode ? '#ffffff' : '#18181b',
              fontWeight: 'bold'
            }
          }
        }
      },
      series: [{
        name: '거래 건수',
        data: data.map(d => ({
          y: d.count,
          avg_price: d.avg_price
        }))
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
