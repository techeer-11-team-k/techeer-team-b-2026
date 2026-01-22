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

// 수도권 좌표 데이터
const seoulCoordinates: RegionCoordinate[] = [
    { "id": "Yeoncheon", "name": "연천", "x": 3, "y": 0 }, { "id": "Pocheon", "name": "포천", "x": 4, "y": 0 },
    { "id": "Paju", "name": "파주", "x": 2, "y": 1 }, { "id": "Yangju", "name": "양주", "x": 3, "y": 1 }, { "id": "Dongducheon", "name": "동두천", "x": 4, "y": 1 }, { "id": "Gapyeong", "name": "가평", "x": 5, "y": 1 },
    { "id": "Goyang", "name": "고양", "x": 2, "y": 2 }, { "id": "Uijeongbu", "name": "의정부", "x": 3, "y": 2 }, { "id": "Namyangju", "name": "남양주", "x": 4, "y": 2 }, { "id": "Yangpyeong", "name": "양평", "x": 5, "y": 2 },
    { "id": "Gimpo", "name": "김포", "x": 1, "y": 3 }, { "id": "Seoul", "name": "서울", "x": 2, "y": 3 }, { "id": "Guri", "name": "구리", "x": 3, "y": 3 }, { "id": "Hanam", "name": "하남", "x": 4, "y": 3 },
    { "id": "Incheon", "name": "인천", "x": 0, "y": 4 }, { "id": "Bucheon", "name": "부천", "x": 1, "y": 4 }, { "id": "Gwangmyeong", "name": "광명", "x": 2, "y": 4 }, { "id": "Gwacheon", "name": "과천", "x": 3, "y": 4 }, { "id": "Gwangju", "name": "광주", "x": 4, "y": 4 },
    { "id": "Siheung", "name": "시흥", "x": 0, "y": 5 }, { "id": "Anyang", "name": "안양", "x": 1, "y": 5 }, { "id": "Seongnam", "name": "성남", "x": 2, "y": 5 }, { "id": "Icheon", "name": "이천", "x": 3, "y": 5 }, { "id": "Yeoju", "name": "여주", "x": 4, "y": 5 },
    { "id": "Ansan", "name": "안산", "x": 0, "y": 6 }, { "id": "Gunpo", "name": "군포", "x": 1, "y": 6 }, { "id": "Uiwang", "name": "의왕", "x": 2, "y": 6 }, { "id": "Yongin", "name": "용인", "x": 3, "y": 6 },
    { "id": "Hwaseong", "name": "화성", "x": 1, "y": 7 }, { "id": "Suwon", "name": "수원", "x": 2, "y": 7 }, { "id": "Anseong", "name": "안성", "x": 3, "y": 7 },
    { "id": "Osan", "name": "오산", "x": 2, "y": 8 },
    { "id": "Pyeongtaek", "name": "평택", "x": 2, "y": 9 }
];

// 5대 광역시 좌표 데이터
const metropolitanCoordinates: RegionCoordinate[] = [
  { name: "울산", x: 0, y: 0 }, { name: "대구", x: 1, y: 0 }, { name: "부산", x: 2, y: 0 },
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
 * API 응답의 지역명을 좌표 데이터의 지역명으로 정규화하는 함수
 */
const normalizeRegionName = (apiName: string): string => {
  const nameMap: Record<string, string> = {
    // 특별자치도/특별자치시
    '강원특별자치도': '강원',
    '세종특별자치시': '세종',
    '전북특별자치도': '전북',
    '제주특별자치도': '제주',
    // 도 단위
    '경상남도': '경남',
    '경상북도': '경북',
    '전라남도': '전남',
    '충청남도': '충남',
    '충청북도': '충북',
    // 이미 정규화된 이름은 그대로 사용
    '서울': '서울',
    '인천': '인천',
    '경기': '경기',
    '강원': '강원',
    '충남': '충남',
    '대전': '대전',
    '세종': '세종',
    '충북': '충북',
    '경북': '경북',
    '전북': '전북',
    '광주': '광주',
    '전남': '전남',
    '대구': '대구',
    '경남': '경남',
    '울산': '울산',
    '부산': '부산',
    '제주': '제주'
  };
  
  return nameMap[apiName] || apiName;
};

/**
 * 좌표 데이터와 API 데이터를 병합하는 함수
 * API 응답의 지역명을 정규화하여 좌표 데이터와 매칭
 */
export const mergeCoordinatesWithData = (
  coordinates: RegionCoordinate[],
  apiData: RegionData[]
): MergedRegionData[] => {
  return coordinates.map(coord => {
    // API 데이터에서 매칭: 정규화된 이름 또는 원본 이름으로 찾기
    const matchedData = apiData.find(data => {
      const normalizedApiName = normalizeRegionName(data.name);
      return normalizedApiName === coord.name || data.name === coord.name || data.id === coord.id;
    });
    
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
  apiData?: RegionData[];
}

export const KoreaHexMap: React.FC<KoreaHexMapProps> = ({ region, className, apiData }) => {
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
  
  // API 데이터 또는 더미 데이터 생성 및 병합
  const mergedData = useMemo(() => {
    if (apiData && apiData.length > 0) {
      return mergeCoordinatesWithData(coordinates, apiData);
    }
    const dummyData = generateDummyData(coordinates);
    return mergeCoordinatesWithData(coordinates, dummyData);
  }, [region, apiData]);

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
      max: 200,
      stops: [
        [0, '#3B82F6'],      // 파란색 (0)
        [0.49, '#93C5FD'],   // 연한 파란색 (98)
        [0.5, '#F3F4F6'],   // 회색 (100 - 기준점)
        [0.51, '#FCA5A5'],   // 연한 빨간색 (102)
        [1, '#DC2626']       // 빨간색 (200)
      ],
      labels: {
        format: '{value}',
        style: {
          fontSize: '11px',
          fontWeight: '600',
          color: '#64748b'
        }
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
