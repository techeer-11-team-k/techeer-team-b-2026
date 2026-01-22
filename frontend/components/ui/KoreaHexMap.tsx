import React, { useEffect, useRef, useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import HighchartsMore from 'highcharts/highcharts-more';
import HeatmapModule from 'highcharts/modules/heatmap';
import TilemapModule from 'highcharts/modules/tilemap';

// Highcharts 모듈 초기화 (순서 중요: highcharts-more -> heatmap -> tilemap)
if (typeof HighchartsMore === 'function') {
  (HighchartsMore as (H: typeof Highcharts) => void)(Highcharts);
}
if (typeof HeatmapModule === 'function') {
  (HeatmapModule as (H: typeof Highcharts) => void)(Highcharts);
}
if (typeof TilemapModule === 'function') {
  (TilemapModule as (H: typeof Highcharts) => void)(Highcharts);
}

// 좌표 데이터 타입 정의
interface RegionCoordinate {
  id?: string;
  name: string;
  x: number;
  y: number;
}

// API 데이터 타입 정의
interface RegionData {
  id?: string;
  name: string;
  value: number;
}

// 병합된 데이터 타입
interface MergedRegionData extends RegionCoordinate {
  value: number;
}

// 전국 좌표 데이터
const nationalCoordinates: RegionCoordinate[] = [
  { id: "KR-11", name: "서울", x: 2, y: 1 },
  { id: "KR-28", name: "인천", x: 1, y: 1 },
  { id: "KR-41", name: "경기", x: 2, y: 2 },
  { id: "KR-42", name: "강원", x: 3, y: 1 },
  { id: "KR-44", name: "충남", x: 1, y: 2 },
  { id: "KR-30", name: "대전", x: 2, y: 3 },
  { id: "KR-43", name: "세종", x: 1, y: 3 },
  { id: "KR-43", name: "충북", x: 3, y: 2 },
  { id: "KR-47", name: "경북", x: 4, y: 2 },
  { id: "KR-45", name: "전북", x: 1, y: 4 },
  { id: "KR-29", name: "광주", x: 1, y: 5 },
  { id: "KR-46", name: "전남", x: 2, y: 5 },
  { id: "KR-27", name: "대구", x: 3, y: 3 },
  { id: "KR-48", name: "경남", x: 3, y: 4 },
  { id: "KR-31", name: "울산", x: 4, y: 3 },
  { id: "KR-26", name: "부산", x: 4, y: 4 },
  { id: "KR-49", name: "제주", x: 0, y: 6 }
];

// 서울(수도권) 좌표 데이터
const seoulCoordinates: RegionCoordinate[] = [
  { name: "도봉구", x: 3, y: 0 }, { name: "노원구", x: 4, y: 0 }, { name: "강북구", x: 2, y: 0 },
  { name: "은평구", x: 0, y: 0 }, { name: "성북구", x: 2, y: 1 }, { name: "종로구", x: 1, y: 0 },
  { name: "동대문구", x: 3, y: 1 }, { name: "중랑구", x: 4, y: 1 }, { name: "서대문구", x: 0, y: 1 },
  { name: "중구", x: 1, y: 1 }, { name: "성동구", x: 2, y: 2 }, { name: "광진구", x: 3, y: 2 },
  { name: "마포구", x: 0, y: 2 }, { name: "용산구", x: 1, y: 2 }, { name: "강동구", x: 5, y: 2 },
  { name: "강서구", x: -1, y: 3 }, { name: "양천구", x: 0, y: 3 }, { name: "구로구", x: 0, y: 4 },
  { name: "영등포구", x: 1, y: 3 }, { name: "동작구", x: 2, y: 3 }, { name: "관악구", x: 2, y: 4 },
  { name: "금천구", x: 1, y: 4 }, { name: "서초구", x: 3, y: 3 }, { name: "강남구", x: 4, y: 3 },
  { name: "송파구", x: 5, y: 3 }
];

// 5대 광역시 좌표 데이터
const metropolitanCoordinates: RegionCoordinate[] = [
  { name: "인천", x: 0, y: 0 }, { name: "대구", x: 1, y: 0 }, { name: "부산", x: 2, y: 0 },
  { name: "광주", x: 0, y: 1 }, { name: "대전", x: 1, y: 1 }
];

// 랜덤 더미 데이터 생성 함수
const generateDummyData = (coordinates: RegionCoordinate[]): RegionData[] => {
  return coordinates.map(coord => ({
    id: coord.id,
    name: coord.name,
    value: Math.floor(Math.random() * 100)
  }));
};

/**
 * 좌표 데이터와 API 데이터를 병합하는 함수
 * 나중에 API 연결 시 이 함수를 사용하여 실제 데이터와 좌표를 결합
 */
export const mergeCoordinatesWithData = (
  coordinates: RegionCoordinate[],
  apiData: RegionData[]
): MergedRegionData[] => {
  return coordinates.map(coord => {
    const matchedData = apiData.find(
      data => data.name === coord.name || data.id === coord.id
    );
    return {
      ...coord,
      value: matchedData?.value ?? 0
    };
  });
};

// 지역 타입
export type RegionType = '전국' | '수도권' | '지방 5대광역시';

interface KoreaHexMapProps {
  region: RegionType;
  className?: string;
}

export const KoreaHexMap: React.FC<KoreaHexMapProps> = ({ region, className }) => {
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  // 지역에 따른 좌표 데이터 선택
  const getCoordinatesByRegion = (regionType: RegionType): RegionCoordinate[] => {
    switch (regionType) {
      case '전국':
        return nationalCoordinates;
      case '수도권':
        return seoulCoordinates;
      case '지방 5대광역시':
        return metropolitanCoordinates;
      default:
        return nationalCoordinates;
    }
  };

  // 현재 지역의 좌표 데이터
  const coordinates = getCoordinatesByRegion(region);
  
  // 더미 데이터 생성 및 병합 (region 변경 시에만 재생성)
  const mergedData = useMemo(() => {
    const dummyData = generateDummyData(coordinates);
    return mergeCoordinatesWithData(coordinates, dummyData);
  }, [region]);

  // 차트 옵션 (region 변경 시 재생성)
  const chartOptions: Highcharts.Options = useMemo(() => ({
    chart: {
      type: 'tilemap',
      height: '100%', // 컨테이너 높이에 맞춤
      backgroundColor: 'transparent',
      style: {
        fontFamily: 'inherit'
      }
    },
    title: {
      text: undefined
    },
    credits: {
      enabled: false
    },
    xAxis: {
      visible: false
    },
    yAxis: {
      visible: false
    },
    colorAxis: {
      min: 0,
      max: 100,
      minColor: '#E0F2FE',
      maxColor: '#0369A1',
      labels: {
        format: '{value}'
      }
    },
    tooltip: {
      headerFormat: '',
      pointFormat: '<b>{point.name}</b><br/>값: {point.value}',
      style: {
        fontSize: '13px',
        fontWeight: '600'
      }
    },
    legend: {
      enabled: true,
      align: 'right',
      verticalAlign: 'top',
      layout: 'horizontal',
      symbolWidth: 200,
      symbolHeight: 16,
      itemStyle: {
        fontSize: '11px',
        fontWeight: '600',
        color: '#64748b'
      }
    },
    plotOptions: {
      tilemap: {
        tileShape: 'hexagon',
        dataLabels: {
          enabled: true,
          format: '{point.name}',
          style: {
            fontSize: region === '지방 5대광역시' ? '24px' : '16px',
            fontWeight: '700',
            color: '#1e293b',
            textOutline: '2px white'
          }
        },
        pointPadding: 2,
        states: {
          hover: {
            brightness: 0.1,
            borderColor: '#0369A1',
            borderWidth: 2
          }
        }
      }
    },
    series: [{
      type: 'tilemap',
      name: '지역 데이터',
      data: mergedData.map(item => ({
        x: item.x,
        y: -item.y, // y축 반전 (위에서 아래로)
        value: item.value,
        name: item.name
      })),
      colsize: 1,
      rowsize: 1
    }],
    responsive: {
      rules: [{
        condition: {
          maxWidth: 500
        },
        chartOptions: {
          legend: {
            symbolWidth: 100
          },
          plotOptions: {
            tilemap: {
              dataLabels: {
                style: {
                  fontSize: region === '지방 5대광역시' ? '16px' : '8px'
                }
              }
            }
          }
        }
      }]
    }
  }), [region, mergedData]);

  // 리사이즈 핸들러
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current?.chart) {
        chartRef.current.chart.reflow();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 지역 변경 시 차트 리플로우
  useEffect(() => {
    if (chartRef.current?.chart) {
      chartRef.current.chart.reflow();
    }
  }, [region]);

  return (
    <div className={className} style={{ aspectRatio: '1 / 1' }}>
      <HighchartsReact
        highcharts={Highcharts}
        options={chartOptions}
        ref={chartRef}
        containerProps={{ style: { width: '100%', height: '100%' } }}
      />
    </div>
  );
};

export default KoreaHexMap;
