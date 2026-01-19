import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

interface KoreaMapChartProps {
  data: Array<{ name: string; value: number }>;
  isDarkMode: boolean;
  height?: number;
  onRegionClick?: (regionName: string) => void;
}

const KoreaMapChart: React.FC<KoreaMapChartProps> = ({ data, isDarkMode, height = 300, onRegionClick }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const currentModeRef = useRef<'map' | 'bar'>('map');
  const [currentMode, setCurrentMode] = useState<'map' | 'bar'>('map');
  const onRegionClickRef = useRef(onRegionClick);
  
  // 최신 onRegionClick 콜백을 ref에 저장
  useEffect(() => {
    onRegionClickRef.current = onRegionClick;
  }, [onRegionClick]);

  useEffect(() => {
    console.log('🔄 [KoreaMapChart] useEffect 실행', { 
      hasRef: !!chartRef.current, 
      dataLength: data.length,
      onRegionClick: !!onRegionClick 
    });
    
    if (!chartRef.current || data.length === 0) {
      console.warn('⚠️ [KoreaMapChart] 차트 렌더링 조건 불만족', { 
        hasRef: !!chartRef.current, 
        dataLength: data.length 
      });
      return;
    }

    // 기존 차트 인스턴스가 있으면 제거
    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
    }

    const chartInstance = echarts.init(chartRef.current);
    chartInstanceRef.current = chartInstance;

    setIsLoading(true);

    // korea.json 파일 로드
    fetch('/korea.json')
      .then((response) => response.json())
      .then((koreaJson) => {
        // 지역명 매핑
        koreaJson.features.forEach((feature: any) => {
          feature.properties.name = feature.properties.CTP_KOR_NM;
        });

        echarts.registerMap('KOREA', koreaJson);

        // 데이터 정렬
        const sortedData = [...data].sort((a, b) => a.value - b.value);

        console.log('🗺️ [KoreaMapChart] 데이터 확인:', sortedData);

        // 지도 옵션
        const getMapOption = (selectedName?: string) => ({
          backgroundColor: 'transparent',
          title: {
            text: '전국 아파트 가격 변동률',
            subtext: '최근 6개월 기준',
            left: 'center',
            top: '10px',
            textStyle: {
              color: isDarkMode ? '#ffffff' : '#18181b',
              fontSize: 16,
              fontWeight: 'bold'
            },
            subtextStyle: {
              color: isDarkMode ? '#a1a1aa' : '#71717a',
              fontSize: 12
            }
          },
          tooltip: {
            trigger: 'item',
            formatter: (params: any) => {
              const val = params.value;
              if (isNaN(val)) return params.name;
              const sign = val > 0 ? '+' : '';
              return `${params.name}<br/>변동률: ${sign}${val.toFixed(2)}%`;
            },
            backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
            borderColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
            textStyle: {
              color: isDarkMode ? '#ffffff' : '#18181b'
            }
          },
          series: [
            {
              id: 'apartment_price',
              type: 'map',
              roam: 'move', // 'true'에서 'move'로 변경하여 클릭 이벤트가 더 잘 작동하도록
              map: 'KOREA',
              top: '60px',
              animationDurationUpdate: 1000,
              universalTransition: true,
              data: sortedData.map((item) => {
                // 변동률에 따라 색상 결정
                let areaColor = '#d73027'; // 기본값: 빨간색 (양수)
                if (item.value === 0) {
                  areaColor = '#22c55e'; // 초록색 (0)
                } else if (item.value < 0) {
                  areaColor = '#3b82f6'; // 파란색 (음수)
                }
                
                return {
                  name: item.name,
                  value: item.value,
                  selected: item.name === selectedName,
                  itemStyle: {
                    areaColor: areaColor
                  }
                };
              }),
              selectedMode: 'single',
              select: {
                itemStyle: {
                  areaColor: '#ffeb3b',
                  borderColor: '#000',
                  borderWidth: 2
                },
                label: {
                  show: true,
                  color: '#000',
                  fontWeight: 'bold'
                }
              },
              itemStyle: {
                borderColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
                borderWidth: 1
              },
              label: {
                show: true,
                color: isDarkMode ? '#ffffff' : '#18181b',
                fontSize: 11
              },
              emphasis: {
                itemStyle: {
                  areaColor: '#ffeb3b',
                  borderColor: '#000',
                  borderWidth: 2
                },
                label: {
                  color: '#000',
                  fontWeight: 'bold'
                }
              },
              // 클릭 이벤트를 위한 설정
              silent: false,
              triggerEvent: true
            }
          ]
        });

        // 막대 그래프 옵션
        const barOption = {
          backgroundColor: 'transparent',
          title: {
            text: '지역별 변동률 순위',
            left: 'center',
            top: '10px',
            textStyle: {
              color: isDarkMode ? '#ffffff' : '#18181b',
              fontSize: 16,
              fontWeight: 'bold'
            }
          },
          tooltip: {
            trigger: 'item',
            formatter: (params: any) => {
              const val = params.value;
              const sign = val > 0 ? '+' : '';
              return `${params.name}: ${sign}${val.toFixed(2)}%`;
            },
            backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
            borderColor: isDarkMode ? '#3f3f46' : '#e4e4e7',
            textStyle: {
              color: isDarkMode ? '#ffffff' : '#18181b'
            }
          },
          grid: {
            containLabel: true,
            left: '15%',
            right: '10%',
            bottom: '10%',
            top: '60px'
          },
          xAxis: {
            type: 'value',
            axisLabel: {
              formatter: '{value}%',
              color: isDarkMode ? '#a1a1aa' : '#71717a'
            },
            axisLine: {
              lineStyle: {
                color: isDarkMode ? '#3f3f46' : '#e4e4e7'
              }
            }
          },
          yAxis: {
            type: 'category',
            data: sortedData.map((item) => item.name),
            axisLabel: {
              color: isDarkMode ? '#a1a1aa' : '#71717a'
            },
            axisLine: {
              lineStyle: {
                color: isDarkMode ? '#3f3f46' : '#e4e4e7'
              }
            }
          },
          animationDurationUpdate: 1000,
          series: {
            type: 'bar',
            id: 'apartment_price',
            data: sortedData.map((item) => item.value),
            universalTransition: true,
            itemStyle: {
              color: (params: any) => (params.value >= 0 ? '#d73027' : '#313695')
            },
            label: {
              show: true,
              position: 'right',
              formatter: (params: any) => {
                const sign = params.value > 0 ? '+' : '';
                return `${sign}${params.value.toFixed(2)}%`;
              },
              color: isDarkMode ? '#ffffff' : '#18181b'
            }
          }
        };

        // 초기 옵션 설정
        chartInstance.setOption(getMapOption());
        currentModeRef.current = 'map';
        setCurrentMode('map');
        setIsLoading(false);

        // 클릭된 요소에서 지역명 추출 (ECharts 내부 구조 탐색)
        const findRegionFromTarget = (target: any): string | null => {
          if (!target) return null;
          
          // 1. target에서 직접 찾기
          // ECharts는 요소에 __regions 또는 이와 유사한 속성을 저장할 수 있음
          let current = target;
          const maxDepth = 10;
          
          for (let depth = 0; depth < maxDepth && current; depth++) {
            // anid에서 지역명 찾기 (예: "apartment_price.chart_-경기도-")
            if (current.anid && typeof current.anid === 'string') {
              for (const item of sortedData) {
                if (current.anid.includes(item.name)) {
                  console.log('✅ [KoreaMapChart] anid에서 지역명 발견:', item.name, 'from', current.anid);
                  return item.name;
                }
              }
            }
            
            // __data__에서 지역명 찾기
            if (current.__data__?.name && sortedData.some(d => d.name === current.__data__.name)) {
              console.log('✅ [KoreaMapChart] __data__에서 지역명 발견:', current.__data__.name);
              return current.__data__.name;
            }
            
            // style.text에서 지역명 찾기 (라벨 클릭)
            if (current.style?.text && sortedData.some(d => d.name === current.style.text)) {
              console.log('✅ [KoreaMapChart] style.text에서 지역명 발견:', current.style.text);
              return current.style.text;
            }
            
            current = current.parent;
          }
          
          return null;
        };

        // 좌표 기반 지역 찾기 (지도 coordinateSystem 사용)
        const findRegionByCoordinate = (pixel: number[]): string | null => {
          try {
            const mapSeries = chartInstance.getModel().getSeriesByType('map')[0];
            if (!mapSeries || !mapSeries.coordinateSystem) return null;
            
            const coord = mapSeries.coordinateSystem;
            
            // 픽셀을 지리 좌표로 변환
            const geoCoord = coord.pointToData(pixel);
            if (!geoCoord) return null;
            
            // 모든 지역에 대해 contain 체크
            if (coord.regions) {
              for (const region of coord.regions as any[]) {
                // region 자체에 contain 함수가 있는지 확인
                if (typeof region.contain === 'function' && region.contain(geoCoord)) {
                  console.log('✅ [KoreaMapChart] region.contain으로 지역 발견:', region.name);
                  return region.name;
                }
                
                // geometries에서 contain 확인
                if (region.geometries) {
                  for (const geo of region.geometries) {
                    if (typeof geo.contain === 'function' && geo.contain(geoCoord)) {
                      console.log('✅ [KoreaMapChart] geometry.contain으로 지역 발견:', region.name);
                      return region.name;
                    }
                  }
                }
              }
            }
          } catch (e) {
            // 무시
          }
          return null;
        };

        // getZr 클릭 이벤트 통합 핸들러 (배경 클릭 + 지역 클릭)
        const handleZrClick = (zrEvent: any) => {
          // 빈 배경 클릭인 경우 모드 전환
          if (!zrEvent.target) {
            console.log('🔵 [KoreaMapChart] 빈 배경 클릭 - 모드 전환');
            if (currentModeRef.current === 'map') {
              chartInstance.setOption(barOption, true);
              currentModeRef.current = 'bar';
              setCurrentMode('bar');
            } else {
              chartInstance.setOption(getMapOption(), true);
              currentModeRef.current = 'map';
              setCurrentMode('map');
            }
            return;
          }
          
          // 지도 모드일 때만 지역 클릭 처리
          if (currentModeRef.current === 'map') {
            try {
              const target = zrEvent.target as any;
              const pixel = [zrEvent.offsetX || zrEvent.zrX, zrEvent.offsetY || zrEvent.zrY];
              
              let regionName: string | null = null;
              
              // 방법 1: 클릭된 요소에서 직접 지역명 추출
              regionName = findRegionFromTarget(target);
              
              // 방법 2: 좌표 기반 지역 찾기
              if (!regionName) {
                regionName = findRegionByCoordinate(pixel);
              }
              
              // 방법 3: convertFromPixel + dispatchAction으로 선택된 지역 확인
              if (!regionName) {
                // 클릭 위치에서 가장 가까운 지역 찾기 (바운딩 박스 기준)
                const mapSeries = chartInstance.getModel().getSeriesByType('map')[0];
                if (mapSeries && mapSeries.coordinateSystem && mapSeries.coordinateSystem.regions) {
                  const regions = mapSeries.coordinateSystem.regions as any[];
                  
                  for (const region of regions) {
                    // region._bindPath의 바운딩 박스 확인
                    if (region._bindPath && region._bindPath.getBoundingRect) {
                      const rect = region._bindPath.getBoundingRect();
                      if (rect && rect.contain(pixel[0], pixel[1])) {
                        regionName = region.name;
                        console.log('✅ [KoreaMapChart] _bindPath 바운딩 박스로 지역 발견:', regionName);
                        break;
                      }
                    }
                  }
                }
              }
              
              // 지역을 찾았으면 콜백 호출
              if (regionName && onRegionClickRef.current) {
                console.log('✅ [KoreaMapChart] onRegionClick 호출:', regionName);
                onRegionClickRef.current(regionName);
                return;
              }
              
              console.warn('⚠️ [KoreaMapChart] 지역을 찾을 수 없음 - pixel:', pixel);
            } catch (error) {
              console.error('❌ [KoreaMapChart] 클릭 처리 중 오류:', error);
            }
          }
        };

        // 막대 클릭 시 지도로 전환 및 지역 클릭 처리
        const handleBarClick = (params: any) => {
          if (currentModeRef.current === 'bar' && params.componentType === 'series') {
            // 막대 그래프에서 지역명 가져오기 (yAxis의 data에서 가져옴)
            const regionName = sortedData[params.dataIndex]?.name;
            
            console.log('📊 [KoreaMapChart] 막대 그래프 클릭:', regionName);
            
            // 지역 클릭 이벤트 먼저 처리 (useRef를 통해 최신 콜백 사용)
            if (onRegionClickRef.current && regionName) {
              onRegionClickRef.current(regionName);
            }
            // 그 다음 지도로 전환
            chartInstance.setOption(getMapOption(regionName), true);
            currentModeRef.current = 'map';
            setCurrentMode('map');
          }
        };

        // 지도에서 지역 클릭 시 처리
        const handleMapClick = (params: any) => {
          console.log('🗺️ [KoreaMapChart] chartInstance.on 클릭 이벤트:', params);
          console.log('🗺️ [KoreaMapChart] currentMode:', currentModeRef.current);
          console.log('🗺️ [KoreaMapChart] componentType:', params?.componentType);
          console.log('🗺️ [KoreaMapChart] seriesType:', params?.seriesType);
          console.log('🗺️ [KoreaMapChart] params.name:', params?.name);
          console.log('🗺️ [KoreaMapChart] params.data:', params?.data);
          
          if (currentModeRef.current === 'map' && params) {
            // 지도 클릭이면 (seriesType이 'map'이거나, name이 있고 componentType이 'series')
            const isMapClick = params.componentType === 'series' && 
                              (params.seriesType === 'map' || params.name || params.data);
            
            if (isMapClick) {
              const regionName = params.name || (params.data && params.data.name);
              
              if (regionName) {
                console.log('🗺️ [KoreaMapChart] 지도 지역 클릭:', regionName);
                // 지역 클릭 이벤트 (useRef를 통해 최신 콜백 사용)
                if (onRegionClickRef.current) {
                  console.log('✅ [KoreaMapChart] onRegionClick 호출:', regionName);
                  onRegionClickRef.current(regionName);
                } else {
                  console.warn('⚠️ [KoreaMapChart] onRegionClickRef.current가 없음');
                }
              }
            }
          }
        };

        // 통합 클릭 핸들러 - 모든 클릭을 먼저 로그
        const handleChartClick = (params: any) => {
          console.log('🔴 [KoreaMapChart] chartInstance.on 클릭 이벤트 발생!', params);
          console.log('🔴 [KoreaMapChart] params 전체:', JSON.stringify(params, null, 2));
          
          // 막대 그래프 클릭 처리
          if (currentModeRef.current === 'bar' && params?.componentType === 'series') {
            handleBarClick(params);
            return;
          }
          // 지도 지역 클릭 처리
          if (currentModeRef.current === 'map') {
            handleMapClick(params);
            return;
          }
        };
        
        // map series의 selectchanged 이벤트 핸들러
        const handleSelectChanged = (params: any) => {
          console.log('🟡 [KoreaMapChart] selectchanged 이벤트:', params);
          if (currentModeRef.current === 'map' && params.selected && params.selected['apartment_price']) {
            const selectedData = params.selected['apartment_price'];
            if (selectedData && selectedData.length > 0) {
              const regionName = selectedData[0].name;
              console.log('✅ [KoreaMapChart] selectchanged에서 찾은 지역:', regionName);
              if (regionName && onRegionClickRef.current) {
                console.log('✅ [KoreaMapChart] onRegionClick 호출 (selectchanged):', regionName);
                onRegionClickRef.current(regionName);
              }
            }
          }
        };
        
        // 'click' 이벤트 (series)
        const handleSeriesClick = (params: any) => {
          console.log('🔵 [KoreaMapChart] series click:', params);
          if (params.seriesType === 'map' && params.name) {
            console.log('✅ [KoreaMapChart] 지도 클릭 (series):', params.name);
            if (onRegionClickRef.current) {
              onRegionClickRef.current(params.name);
            }
          }
        };
        
        chartInstance.off('selectchanged');
        chartInstance.on('selectchanged', handleSelectChanged);
        console.log('✅ [KoreaMapChart] chartInstance.on("selectchanged") 등록됨');

        // 이벤트 리스너 등록 (모든 클릭 이벤트를 먼저 등록)
        console.log('🔧 [KoreaMapChart] 이벤트 리스너 등록 시작');
        console.log('🔧 [KoreaMapChart] 차트 인스턴스 존재:', !!chartInstance);
        console.log('🔧 [KoreaMapChart] onRegionClickRef.current 존재:', !!onRegionClickRef.current);
        
        // 차트 인스턴스 클릭 이벤트 (지도/막대 그래프 클릭)
        chartInstance.off('click');
        chartInstance.on('click', handleChartClick);
        chartInstance.on('click', 'series.map', handleSeriesClick);
        console.log('✅ [KoreaMapChart] chartInstance.on("click") 등록됨');
        
        // getZr 클릭 이벤트 등록 (통합 핸들러 사용)
        chartInstance.getZr().off('click');
        chartInstance.getZr().on('click', handleZrClick);
        console.log('✅ [KoreaMapChart] getZr().on("click") 등록됨 (통합 핸들러)');
        
        // DOM 클릭 이벤트 - 클릭된 요소에서 지역명 찾기
        const domClickHandler = (e: MouseEvent) => {
          if (currentModeRef.current !== 'map') return;
          
          const rect = chartRef.current?.getBoundingClientRect();
          if (!rect) return;
          
          const pixel = [e.clientX - rect.left, e.clientY - rect.top];
          
          // containPixel로 지도 영역 확인 후 dispatchAction으로 선택 트리거
          if (chartInstance.containPixel('series', pixel)) {
            // 모든 지역의 바운딩 박스를 확인하여 클릭된 지역 찾기
            const mapSeries = chartInstance.getModel().getSeriesByType('map')[0];
            if (mapSeries) {
              const mapData = mapSeries.getData();
              
              // 각 지역의 그래픽 요소 확인
              for (let i = 0; i < mapData.count(); i++) {
                const name = mapData.getName(i);
                const itemGraphicEl = mapData.getItemGraphicEl(i);
                
                if (itemGraphicEl) {
                  // 그래픽 요소의 바운딩 박스 확인
                  const boundingRect = itemGraphicEl.getBoundingRect();
                  if (boundingRect) {
                    // 전역 좌표로 변환
                    const globalRect = itemGraphicEl.transformCoordToGlobal(
                      boundingRect.x, boundingRect.y
                    );
                    
                    // 단순히 바운딩 박스 체크 (정밀하지 않지만 작동함)
                    const elRect = {
                      x: globalRect[0],
                      y: globalRect[1],
                      width: boundingRect.width,
                      height: boundingRect.height
                    };
                    
                    if (pixel[0] >= elRect.x && pixel[0] <= elRect.x + elRect.width &&
                        pixel[1] >= elRect.y && pixel[1] <= elRect.y + elRect.height) {
                      console.log('✅ [KoreaMapChart] DOM getItemGraphicEl로 지역 찾음:', name);
                      if (onRegionClickRef.current) {
                        onRegionClickRef.current(name);
                      }
                      return;
                    }
                  }
                }
              }
            }
          }
        };
        
        const chartElement = chartRef.current;
        chartElement?.addEventListener('click', domClickHandler);

        // 리사이즈 핸들러
        const handleResize = () => {
          chartInstance.resize();
        };
        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
          chartElement?.removeEventListener('click', domClickHandler);
          chartInstance.getZr().off('click', handleZrClick);
          chartInstance.off('click', handleChartClick);
          chartInstance.off('selectchanged', handleSelectChanged);
        };
      })
      .catch((error) => {
        console.error('지도 데이터 로드 실패:', error);
        setIsLoading(false);
      });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [data, isDarkMode]);

  return (
    <div className="relative w-full" style={{ height: `${height}px` }}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
            지도 로딩 중...
          </div>
        </div>
      )}
      <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
      <div className={`absolute top-2 right-2 text-xs ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
        {currentMode === 'map' ? '🖱️ 빈 배경 클릭: 막대 그래프 보기' : '🖱️ 빈 배경 클릭: 지도 보기'}
      </div>
    </div>
  );
};

export default KoreaMapChart;