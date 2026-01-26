import React, { useEffect, useRef, useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import HighchartsMore from 'highcharts/highcharts-more';
import HeatmapModule from 'highcharts/modules/heatmap';
import TilemapModule from 'highcharts/modules/tilemap';

// Highcharts 모듈 초기화
if (typeof HighchartsMore === 'function') {
  (HighchartsMore as (H: typeof Highcharts) => void)(Highcharts);
}
if (typeof HeatmapModule === 'function') {
  (HeatmapModule as (H: typeof Highcharts) => void)(Highcharts);
}
if (typeof TilemapModule === 'function') {
  (TilemapModule as (H: typeof Highcharts) => void)(Highcharts);
}

interface RegionCoordinate {
  id?: string;
  name: string;
  x: number;
  y: number;
}

interface RegionData {
  id?: string;
  name: string;
  value: number;
}

interface MergedRegionData extends RegionCoordinate {
  value: number;
}

const nationalCoordinates: RegionCoordinate[] = [
  { id: "KR-11", name: "서울", x: 2, y: 2 },
  { id: "KR-28", name: "인천", x: 1, y: 1 },
  { id: "KR-41", name: "경기", x: 2, y: 1 },
  { id: "KR-42", name: "강원", x: 3, y: 1 },
  { id: "KR-44", name: "충남", x: 1, y: 2 },
  { id: "KR-30", name: "대전", x: 2, y: 4 },
  { id: "KR-43", name: "세종", x: 2, y: 3 },
  { id: "KR-43", name: "충북", x: 3, y: 2 },
  { id: "KR-47", name: "경북", x: 4, y: 2 },
  { id: "KR-45", name: "전북", x: 1, y: 4 },
  { id: "KR-29", name: "광주", x: 1, y: 3 },
  { id: "KR-46", name: "전남", x: 2, y: 5 },
  { id: "KR-27", name: "대구", x: 3, y: 3 },
  { id: "KR-48", name: "경남", x: 3, y: 4 },
  { id: "KR-31", name: "울산", x: 4, y: 3 },
  { id: "KR-26", name: "부산", x: 4, y: 4 },
  { id: "KR-49", name: "제주", x: 2, y: 7 }
];

// 수도권 (경기/인천 중심 + 서울은 하나로)
const gyeonggiIncheonCoordinates: RegionCoordinate[] = [
  // [북부권] 서울 기준 북쪽
  { "id": "Yeoncheon", "name": "연천", "x": 3, "y": 0 }, 
  { "id": "Pocheon", "name": "포천", "x": 4, "y": 2 },
  { "id": "Paju", "name": "파주", "x": 2, "y": 2 }, 
  { "id": "Dongducheon", "name": "동두천", "x": 3, "y": 1 }, 
  { "id": "Gapyeong", "name": "가평", "x": 5, "y": 2 },
  { "id": "Yangju", "name": "양주", "x": 3, "y": 2 }, 
  { "id": "Namyangju", "name": "남양주", "x": 4, "y": 3 }, // 포천 아래, 구리 위

  // [중부권 - 서울 주변]
  { "id": "Gimpo", "name": "김포", "x": 1, "y": 2 }, 
  { "id": "Goyang", "name": "고양", "x": 2, "y": 3 }, 
  { "id": "Uijeongbu", "name": "의정부", "x": 3, "y": 3 }, // 서울 바로 위
  { "id": "Guri", "name": "구리", "x": 4, "y": 4 },      // 서울 오른쪽 위
  
  // [중심 허리 라인] 인천-부천-서울-하남-양평
  { "id": "Incheon", "name": "인천", "x": 1, "y": 3 }, 
  { "id": "Bucheon", "name": "부천", "x": 1, "y": 4 }, 
  { "id": "Gwangmyeong", "name": "광명", "x": 2, "y": 4 }, // 서울 왼쪽 아래 살짝 겹침
  { "id": "Seoul", "name": "서울", "x": 3, "y": 4 },       // ★ 중심 ★
  { "id": "Hanam", "name": "하남", "x": 4, "y": 5 }, 
  { "id": "Yangpyeong", "name": "양평", "x": 5, "y": 3 },  // 남양주 옆, 넓게 퍼짐

  // [경기 남부 - 서울 바로 아래]
  { "id": "Siheung", "name": "시흥", "x": 1, "y": 5 }, 
  { "id": "Anyang", "name": "안양", "x": 2, "y": 5 }, 
  { "id": "Gwacheon", "name": "과천", "x": 3, "y": 5 }, 
  { "id": "Seongnam", "name": "성남", "x": 4, "y": 6 }, 
  { "id": "Gwangju", "name": "광주", "x": 5, "y": 4 },     // 성남/하남 옆
  { "id": "Yeoju", "name": "여주", "x": 5, "y": 5 },       // 이천/광주 옆

  // [경기 남부 - 수원/용인 라인]
  { "id": "Ansan", "name": "안산", "x": 1, "y": 6 }, 
  { "id": "Gunpo", "name": "군포", "x": 2, "y": 6 }, 
  { "id": "Uiwang", "name": "의왕", "x": 3, "y": 6 }, 
  { "id": "Yongin", "name": "용인", "x": 4, "y": 7 },      // 성남 아래, 넓은 지역
  { "id": "Icheon", "name": "이천", "x": 5, "y": 6 }, 

  // [경기 최남단]
  { "id": "Hwaseong", "name": "화성", "x": 1, "y": 7 },    // 서해안 쪽 넓게
  { "id": "Suwon", "name": "수원", "x": 2, "y": 7 },       // 의왕 아래
  { "id": "Osan", "name": "오산", "x": 2, "y": 8 }, 
  { "id": "Anseong", "name": "안성", "x": 4, "y": 8 },     // 용인/평택 사이
  { "id": "Pyeongtaek", "name": "평택", "x": 3, "y": 7 }   // 가장 남단
];

// 서울특별시 자치구 좌표 데이터
const seoulCoordinates: RegionCoordinate[] = [
  // [도심권] - 서울의 심장부 (남북으로 배치)
  { id: "Jongno", name: "종로구", x: 3, y: 1 },
  { id: "Jung", name: "중구", x: 4, y: 2 },      // 종로 아래
  { id: "Yongsan", name: "용산구", x: 3, y: 2 },   // 중구 아래 (한강 접함)

  // [동북권] - 위쪽으로 뻗어나가는 형태
  { id: "Dobong", name: "도봉구", x: 4, y: 0 },    // 최북단
  { id: "Gangbuk", name: "강북구", x: 3, y: 0 },   // 도봉 왼쪽 아래
  { id: "Nowon", name: "노원구", x: 5, y: 0 },     // 도봉 오른쪽 아래
  { id: "Seongbuk", name: "성북구", x: 4, y: 1 },  // 강북/노원 아래
  { id: "Dongdaemun", name: "동대문구", x: 5, y: 1 }, // 성북 오른쪽
  { id: "Jungnang", name: "중랑구", x: 6, y: 1 },  // 가장 오른쪽 (동대문 옆)
  { id: "Seongdong", name: "성동구", x: 5, y: 2 }, // 동대문 아래, 한강변
  { id: "Gwangjin", name: "광진구", x: 6, y: 2 },  // 성동 오른쪽, 한강변

  // [서북권] - 왼쪽 위
  { id: "Eunpyeong", name: "은평구", x: 1, y: 1 }, // 최서북단
  { id: "Seodaemun", name: "서대문구", x: 2, y: 1 }, // 은평 아래
  { id: "Mapo", name: "마포구", x: 2, y: 2 },      // 서대문 아래, 한강변 (강서와 마주봄)

  // [서남권] - 한강 이남 왼쪽
  { id: "Gangseo", name: "강서구", x: 0, y: 3 },    // 최서단
  { id: "Yangcheon", name: "양천구", x: 0, y: 4 },  // 강서 아래
  { id: "Yeongdeungpo", name: "영등포구", x: 1, y: 3 }, // 양천/마포 사이
  { id: "Guro", name: "구로구", x: 0, y: 5 },       // 양천 아래
  { id: "Dongjak", name: "동작구", x: 2, y: 4 },    // 영등포 오른쪽
  { id: "Geumcheon", name: "금천구", x: 1, y: 4 },  // 구로 오른쪽 아래
  { id: "Gwanak", name: "관악구", x: 2, y: 5 },     // 동작 아래

  // [동남권] - 한강 이남 오른쪽
  { id: "Seocho", name: "서초구", x: 3, y: 4 },     // 용산/동작 옆
  { id: "Gangnam", name: "강남구", x: 4, y: 4 },    // 서초 옆
  { id: "Songpa", name: "송파구", x: 5, y: 4 },     // 강남 옆 (살짝 위로)
  { id: "Gangdong", name: "강동구", x: 6, y: 4 },   // 송파 위/오른쪽 (가장 동쪽 끝)
];

// 5대 광역시 좌표 데이터
const metropolitanCoordinates: RegionCoordinate[] = [
  { name: "울산", x: 2, y: 0 }, 
  { name: "대구", x: 1, y: 0 }, 
  { name: "부산", x: 2, y: 1 },
  { name: "광주", x: 0, y: 1 }, 
  { name: "대전", x: 0, y: 0 }
];

const generateDummyData = (coordinates: RegionCoordinate[]): RegionData[] => {
  return coordinates.map(coord => ({
    id: coord.id,
    name: coord.name,
    value: Math.floor(Math.random() * 100)
  }));
};

const normalizeRegionName = (apiName: string): string => {
  // 서울 자치구 처리 (예: "종로" -> "종로구") - API가 "종로"로 올 수 있으므로
  const guMap: Record<string, string> = {
    "종로": "종로구", "중": "중구", "용산": "용산구", "성동": "성동구", "광진": "광진구",
    "동대문": "동대문구", "중랑": "중랑구", "성북": "성북구", "강북": "강북구", "도봉": "도봉구",
    "노원": "노원구", "은평": "은평구", "서대문": "서대문구", "마포": "마포구", "양천": "양천구",
    "강서": "강서구", "구로": "구로구", "금천": "금천구", "영등포": "영등포구", "동작": "동작구",
    "관악": "관악구", "서초": "서초구", "강남": "강남구", "송파": "송파구", "강동": "강동구"
  };

  if (guMap[apiName]) return guMap[apiName];

  const nameMap: Record<string, string> = {
    '강원특별자치도': '강원',
    '세종특별자치시': '세종',
    '전북특별자치도': '전북',
    '제주특별자치도': '제주',
    '경상남도': '경남',
    '경상북도': '경북',
    '전라남도': '전남',
    '충청남도': '충남',
    '충청북도': '충북',
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

const preprocessMetropolitanData = (apiData: RegionData[]): RegionData[] => {
  const processedData: RegionData[] = [];
  const processedNames = new Set<string>();
  
  const seoulData = apiData.filter(data => data.name === '서울');
  if (seoulData.length > 0) {
    const seoulAvg = seoulData.reduce((sum, d) => sum + d.value, 0) / seoulData.length;
    processedData.push({ id: null, name: '서울', value: seoulAvg });
    processedNames.add('서울');
  }
  
  const incheonData = apiData.filter(data => data.name === '인천');
  if (incheonData.length > 0) {
    const incheonAvg = incheonData.reduce((sum, d) => sum + d.value, 0) / incheonData.length;
    processedData.push({ id: null, name: '인천', value: incheonAvg });
    processedNames.add('인천');
  }
  
  const validCityNames = new Set([
    '가평', '고양', '과천', '광명', '광주', '구리', '하남', '부천', '시흥', 
    '안양', '성남', '이천', '여주', '안산', '군포', '의왕', '용인', '화성', 
    '수원', '안성', '오산', '평택', '양주', '양평', '연천', '포천', '파주', 
    '동두천', '의정부', '남양주', '김포', '경기도'
  ]);
  
  apiData.forEach(data => {
    if (processedNames.has(data.name)) return;
    if (validCityNames.has(data.name)) {
      if (data.name !== '경기도') {
        processedData.push(data);
        processedNames.add(data.name);
      }
    }
  });
  
  return processedData;
};

export const mergeCoordinatesWithData = (
  coordinates: RegionCoordinate[],
  apiData: RegionData[],
  regionType?: '전국' | '수도권' | '지방 5대광역시' | '서울특별시'
): MergedRegionData[] => {
  let processedApiData = apiData;
  if (regionType === '수도권') {
    processedApiData = preprocessMetropolitanData(apiData);
  }
  
  return coordinates.map(coord => {
    const matchedData = processedApiData.find(data => {
      const normalizedApiName = normalizeRegionName(data.name);
      return normalizedApiName === coord.name || data.name === coord.name || data.id === coord.id;
    });
    
    return {
      ...coord,
      value: matchedData?.value ?? 0
    };
  });
};

export type RegionType = '전국' | '수도권' | '지방 5대광역시' | '서울특별시';

interface KoreaHexMapProps {
  region: RegionType;
  className?: string;
  apiData?: RegionData[];
}

export const KoreaHexMap: React.FC<KoreaHexMapProps> = ({ region, className, apiData }) => {
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const getCoordinatesByRegion = (regionType: RegionType): RegionCoordinate[] => {
    switch (regionType) {
      case '전국':
        return nationalCoordinates;
      case '수도권':
        return gyeonggiIncheonCoordinates;
      case '지방 5대광역시':
        return metropolitanCoordinates;
      case '서울특별시':
        return seoulCoordinates;
      default:
        return nationalCoordinates;
    }
  };

  const coordinates = getCoordinatesByRegion(region);
  
  const mergedData = useMemo(() => {
    if (apiData && apiData.length > 0) {
      return mergeCoordinatesWithData(coordinates, apiData, region);
    }
    const dummyData = generateDummyData(coordinates);
    return mergeCoordinatesWithData(coordinates, dummyData, region);
  }, [region, apiData]);

  const chartOptions: Highcharts.Options = useMemo(() => ({
    chart: {
      type: 'tilemap',
      height: '100%',
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
        [0, '#3B82F6'],
        [0.49, '#93C5FD'],
        [0.5, '#F3F4F6'],
        [0.51, '#FCA5A5'],
        [1, '#DC2626']
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
            fontSize: region === '지방 5대광역시' ? '24px' : '14px',
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
        y: -item.y,
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

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current?.chart) {
        chartRef.current.chart.reflow();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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