import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card } from '../ui/Card';
import { ChevronDown } from 'lucide-react';
import Highcharts from 'highcharts';
// @ts-ignore - highcharts stock 모듈
import HighchartsStock from 'highcharts/modules/stock';
// @ts-ignore - highcharts-react-official 타입 선언이 없지만 패키지는 설치되어 있음
import HighchartsReact from 'highcharts-react-official';
import { KoreaHexMap, RegionType } from '../ui/KoreaHexMap';
import { MigrationSankey } from '../ui/MigrationSankey';
import { ToggleButtonGroup } from '../ui/ToggleButtonGroup';

// Highcharts Stock 모듈 초기화
// @ts-ignore
if (typeof HighchartsStock === 'function') {
  // @ts-ignore
  HighchartsStock(Highcharts);
}
import {
  fetchHPIByRegionType,
  HPIRegionTypeDataPoint,
  fetchTransactionVolume,
  TransactionVolumeDataPoint as ApiTransactionVolumeDataPoint,
  fetchPopulationFlow,
  SankeyNode,
  SankeyLink
} from '../../services/api';


// 거래량 데이터 타입
interface TransactionVolumeDataPoint {
  period: string;
  value: number;
  [key: string]: string | number; // 년도별 데이터를 위한 동적 키
}

// 시장 국면 데이터 타입
interface MarketPhaseDataPoint {
  region_id: string;
  region_name: string;
  phase: string;
  change: string;
  trend: 'up' | 'down';
}

// 인구 순이동 데이터 타입
interface PopulationMovementDataPoint {
  name: string;
  value: number;
  label: string;
}

const getYearColor = (year: number, totalYears: number) => {
  const currentYear = 2025;
  const yearIndex = currentYear - year;
  const opacity = 0.3 + ((totalYears - 1 - yearIndex) / (totalYears - 1)) * 0.7;
  return `rgba(49, 130, 246, ${opacity})`;
};

export const HousingDemand: React.FC = () => {
  const [viewMode, setViewMode] = useState<'yearly' | 'monthly'>('monthly');
  const [yearRange, setYearRange] = useState<2 | 3 | 5>(3);
  const [selectedRegion, setSelectedRegion] = useState<RegionType>('전국');
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);
  const regionDropdownRef = useRef<HTMLDivElement>(null);
  
  // API 데이터 상태
  const [hpiData, setHpiData] = useState<HPIRegionTypeDataPoint[]>([]);
  const [transactionData, setTransactionData] = useState<TransactionVolumeDataPoint[]>([]);
  const [monthlyYears, setMonthlyYears] = useState<number[]>([]);
  const [rawTransactionData, setRawTransactionData] = useState<ApiTransactionVolumeDataPoint[]>([]);
  const [marketPhases, setMarketPhases] = useState<MarketPhaseDataPoint[]>([]);
  const [migrationNodes, setMigrationNodes] = useState<SankeyNode[]>([]);
  const [migrationLinks, setMigrationLinks] = useState<SankeyLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 주택 가격 지수 기준 년월 상태 (기본값: 2025년 12월)
  const [hpiSelectedYear, setHpiSelectedYear] = useState<number | null>(2025);
  const [hpiSelectedMonth, setHpiSelectedMonth] = useState<number | null>(12);
  const [isHpiYearDropdownOpen, setIsHpiYearDropdownOpen] = useState(false);
  const [isHpiMonthDropdownOpen, setIsHpiMonthDropdownOpen] = useState(false);
  const hpiYearDropdownRef = useRef<HTMLDivElement>(null);
  const hpiMonthDropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (regionDropdownRef.current && !regionDropdownRef.current.contains(event.target as Node)) {
        setIsRegionDropdownOpen(false);
      }
      if (hpiYearDropdownRef.current && !hpiYearDropdownRef.current.contains(event.target as Node)) {
        setIsHpiYearDropdownOpen(false);
      }
      if (hpiMonthDropdownRef.current && !hpiMonthDropdownRef.current.contains(event.target as Node)) {
        setIsHpiMonthDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // 사용 가능한 년도 목록 생성 (2020년부터 2025년까지, 최신순)
  const getAvailableYears = (): number[] => {
    const years: number[] = [];
    
    // 최신 년도가 가장 위에 오도록 역순으로 배열
    for (let year = 2025; year >= 2020; year--) {
      years.push(year);
    }
    
    return years;
  };

  // 사용 가능한 월 목록 (3월, 6월, 9월, 12월)
  const getAvailableMonths = (): { value: number; label: string }[] => {
    return [
      { value: 3, label: '3월' },
      { value: 6, label: '6월' },
      { value: 9, label: '9월' },
      { value: 12, label: '12월' }
    ];
  };

  // 선택된 년월을 YYYYMM 형식으로 변환
  const getHpiBaseYm = (): string | null => {
    if (hpiSelectedYear && hpiSelectedMonth) {
      return `${hpiSelectedYear}${hpiSelectedMonth.toString().padStart(2, '0')}`;
    }
    return null;
  };

  // 지역 타입 변환 헬퍼 함수
  const getBackendRegionType = (region: RegionType): '전국' | '수도권' | '지방5대광역시' => {
    const regionTypeMap: Record<RegionType, '전국' | '수도권' | '지방5대광역시'> = {
      '전국': '전국',
      '수도권': '수도권',
      '지방 5대광역시': '지방5대광역시'
    };
    return regionTypeMap[region];
  };

  // 날짜를 timestamp로 변환하는 헬퍼 함수
  const getTimestamp = (period: string, viewMode: 'yearly' | 'monthly'): number => {
    if (viewMode === 'yearly') {
      // "2020년" 형식을 timestamp로 변환
      const year = parseInt(period.replace('년', ''));
      return new Date(year, 0, 1).getTime();
    } else {
      // "1월" 형식은 현재 연도 기준으로 변환 (실제로는 rawTransactionData에서 연도 정보 필요)
      // 임시로 현재 연도 사용
      const currentYear = new Date().getFullYear();
      const month = parseInt(period.replace('월', ''));
      return new Date(currentYear, month - 1, 1).getTime();
    }
  };

  // Stock Chart 사용 여부 확인
  const useStockChart = useMemo(() => {
    if (transactionData.length === 0) return false;
    const backendRegionType = getBackendRegionType(selectedRegion);
    const isLocalRegion = backendRegionType === '지방5대광역시';
    return viewMode === 'yearly' && !isLocalRegion; // 전국/수도권 연도별만 Stock Chart 사용
  }, [transactionData, viewMode, selectedRegion]);

  // Highcharts 옵션 생성
  const getHighchartsOptions = useMemo(() => {
    if (transactionData.length === 0) {
      return null;
    }

    const backendRegionType = getBackendRegionType(selectedRegion);
    const isLocalRegion = backendRegionType === '지방5대광역시';

    if (useStockChart) {
      // Highcharts Stock Chart 옵션 (전국/수도권 연도별)
      // rawTransactionData에서 연도별 데이터를 timestamp 형식으로 변환
      const yearlyMap = new Map<number, number>();
      rawTransactionData.forEach(item => {
        const year = item.year;
        const currentVolume = yearlyMap.get(year) || 0;
        yearlyMap.set(year, currentVolume + item.volume);
      });

      const stockData = Array.from(yearlyMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([year, volume]) => [new Date(year, 0, 1).getTime(), volume] as [number, number]);

      // 디버깅: 데이터 포인트 수 확인
      console.log('Stock Chart 데이터:', {
        데이터포인트수: stockData.length,
        연도범위: stockData.length > 0 ? `${new Date(stockData[0][0]).getFullYear()} ~ ${new Date(stockData[stockData.length - 1][0]).getFullYear()}` : '없음'
      });

      return {
        rangeSelector: {
          selected: 1, // 기본 선택: 전체
          buttons: [
            { type: 'year', count: 2, text: '2년' },
            { type: 'year', count: 3, text: '3년' },
            { type: 'year', count: 5, text: '5년' },
            { type: 'all', text: '전체' }
          ],
          buttonTheme: {
            style: {
              fontSize: '12px',
              fontWeight: 'bold',
              color: '#64748b'
            },
            states: {
              select: {
                fill: '#3182F6',
                style: {
                  color: '#fff'
                }
              }
            }
          }
        },
        navigator: {
          enabled: true,
          height: 50,
          margin: 10,
          adaptToUpdatedData: false,
          outlineWidth: 1,
          outlineColor: '#3182F6',
          handles: {
            backgroundColor: '#3182F6',
            borderColor: '#fff',
            width: 8,
            height: 20
          },
          maskFill: 'rgba(49, 130, 246, 0.2)',
          maskInside: true,
          series: {
            color: '#3182F6',
            lineWidth: 1,
            type: 'line'
          }
        },
        scrollbar: {
          enabled: true,
          barBackgroundColor: '#e2e8f0',
          barBorderRadius: 0,
          barBorderWidth: 0,
          buttonBackgroundColor: '#cbd5e1',
          buttonBorderColor: '#94a3b8',
          buttonBorderRadius: 0,
          buttonBorderWidth: 1,
          rifleColor: '#64748b',
          trackBackgroundColor: '#f1f5f9',
          trackBorderColor: '#e2e8f0',
          trackBorderRadius: 0,
          trackBorderWidth: 1
        },
        title: {
          text: undefined
        },
        credits: {
          enabled: false
        },
        xAxis: {
          type: 'datetime',
          overscroll: 10
        },
        yAxis: {
          title: {
            text: undefined
          },
          labels: {
            style: {
              fontSize: '12px',
              fontWeight: 'bold',
              color: '#94a3b8'
            },
            formatter: function() {
              return this.value.toLocaleString();
            }
          }
        },
        tooltip: {
          backgroundColor: 'white',
          borderColor: '#e2e8f0',
          borderRadius: 12,
          borderWidth: 1,
          shadow: {
            color: 'rgba(0, 0, 0, 0.1)',
            offsetX: 0,
            offsetY: 4,
            opacity: 0.1,
            width: 4
          },
          style: {
            fontSize: '13px',
            fontWeight: 'bold',
            color: '#334155'
          },
          formatter: function() {
            const date = new Date(this.x as number);
            const year = date.getFullYear();
            return `<b>${year}년</b><br/>거래량: <b>${this.y.toLocaleString()}건</b>`;
          }
        },
        series: [{
          name: '거래량',
          type: 'line',
          data: stockData,
          color: '#3182F6',
          tooltip: {
            valueDecimals: 0
          },
          lastPrice: {
            enabled: true,
            color: 'transparent',
            label: {
              enabled: true,
              backgroundColor: '#ffffff',
              borderColor: '#3182F6',
              borderWidth: 1,
              style: {
                color: '#000000',
                fontWeight: 'bold'
              }
            }
          }
        }] as any
      };
    }

    // 기본 옵션 (월별 또는 지방5대광역시)
    const baseOptions: Highcharts.Options = {
      chart: {
        type: 'line',
        height: 400,
        backgroundColor: 'transparent',
        spacing: [20, 20, 20, 20]
      },
      title: {
        text: undefined
      },
      credits: {
        enabled: false
      },
      legend: {
        enabled: viewMode === 'monthly',
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: {
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#64748b'
        },
        itemHoverStyle: {
          color: '#334155'
        }
      },
      xAxis: {
        categories: transactionData.map(item => item.period),
        labels: {
          style: {
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#94a3b8'
          }
        },
        lineWidth: 0,
        tickWidth: 0,
        gridLineWidth: 0
      },
      yAxis: {
        title: {
          text: undefined
        },
        labels: {
          style: {
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#94a3b8'
          },
          formatter: function() {
            return this.value.toLocaleString();
          }
        },
        gridLineColor: '#f1f5f9',
        gridLineDashStyle: 'Dash',
        lineWidth: 0
      },
      tooltip: {
        backgroundColor: 'white',
        borderColor: '#e2e8f0',
        borderRadius: 12,
        borderWidth: 1,
        shadow: {
          color: 'rgba(0, 0, 0, 0.1)',
          offsetX: 0,
          offsetY: 4,
          opacity: 0.1,
          width: 4
        },
        style: {
          fontSize: '13px',
          fontWeight: 'bold',
          color: '#334155'
        },
        formatter: function() {
          if (viewMode === 'monthly') {
            return `<b>${this.x}</b><br/>${this.series.name}: <b>${this.y.toLocaleString()}건</b>`;
          }
          return `<b>${this.x}</b><br/>거래량: <b>${this.y.toLocaleString()}건</b>`;
        }
      },
      plotOptions: {
        line: {
          marker: {
            radius: 3,
            lineWidth: 2,
            lineColor: '#fff',
            fillColor: '#fff'
          },
          lineWidth: 2,
          states: {
            hover: {
              lineWidth: 3
            }
          }
        }
      }
    };

    if (viewMode === 'yearly') {
      // 연도별: Single line series
      return {
        ...baseOptions,
        series: [{
          name: '거래량',
          type: 'line',
          data: transactionData.map(item => item.value),
          color: '#3182F6'
        }] as Highcharts.SeriesOptionsType[]
      };
    } else {
      // 월별
      if (isLocalRegion) {
        // 지방5대광역시: Compare multiple series (도시별)
        const cities = new Set<string>();
        transactionData.forEach(item => {
          Object.keys(item).forEach(key => {
            if (key !== 'period' && key !== 'value' && typeof item[key] === 'number') {
              cities.add(key);
            }
          });
        });

        const cityColors: Record<string, string> = {};
        const cityList = Array.from(cities).sort();
        cityList.forEach((city, index) => {
          const totalCities = cityList.length;
          const opacity = 0.3 + ((totalCities - 1 - index) / (totalCities - 1)) * 0.7;
          cityColors[city] = `rgba(49, 130, 246, ${opacity})`;
        });

        return {
          ...baseOptions,
          series: cityList.map(city => ({
            name: city,
            type: 'line',
            data: transactionData.map(item => (item[city] as number) || 0),
            color: cityColors[city]
          })) as Highcharts.SeriesOptionsType[]
        };
      } else {
        // 전국/수도권: Compare multiple series (연도별)
        const seriesData = monthlyYears.map(year => {
          const color = getYearColor(year, monthlyYears.length);
          return {
            name: `${year}년`,
            type: 'line',
            data: transactionData.map(item => (item[String(year)] as number) || 0),
            color: color
          };
        });

        return {
          ...baseOptions,
          series: seriesData as Highcharts.SeriesOptionsType[]
        };
      }
    }
  }, [transactionData, viewMode, selectedRegion, monthlyYears]);

  // 거래량 데이터 변환 로직
  useEffect(() => {
    if (rawTransactionData.length === 0) {
      setTransactionData([]);
      setMonthlyYears([]);
      return;
    }

    const backendRegionType = getBackendRegionType(selectedRegion);
    const isLocalRegion = backendRegionType === '지방5대광역시';

    if (viewMode === 'yearly') {
      // 연도별: 월별 데이터를 연도별로 집계
      const yearlyMap = new Map<number, number>();
      
      rawTransactionData.forEach(item => {
        const year = item.year;
        const currentVolume = yearlyMap.get(year) || 0;
        yearlyMap.set(year, currentVolume + item.volume);
      });

      const yearlyData: TransactionVolumeDataPoint[] = Array.from(yearlyMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([year, volume]) => ({
          period: `${year}년`,
          value: volume
        }));

      setTransactionData(yearlyData);
      setMonthlyYears([]);
    } else {
      // 월별: 선택된 연도 범위에 맞게 필터링
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - yearRange + 1;
      
      // 필터링된 데이터
      const filteredData = rawTransactionData.filter(item => item.year >= startYear);
      
      if (isLocalRegion) {
        // 지방5대광역시: city_name별로 시리즈 분리
        const cityMap = new Map<string, Map<string, number>>(); // city_name -> "YYYY-MM" -> volume
        
        filteredData.forEach(item => {
          if (!item.city_name) return;
          const monthKey = `${item.year}-${String(item.month).padStart(2, '0')}`;
          
          if (!cityMap.has(item.city_name)) {
            cityMap.set(item.city_name, new Map());
          }
          const cityData = cityMap.get(item.city_name)!;
          cityData.set(monthKey, (cityData.get(monthKey) || 0) + item.volume);
        });

        // 연도별로 그룹화하여 레이블 추가 (같은 월이 여러 연도에 있을 수 있으므로)
        const finalData: TransactionVolumeDataPoint[] = [];
        filteredData.forEach(item => {
          const existingIndex = finalData.findIndex(d => d.period === `${item.month}월`);
          
          if (existingIndex === -1) {
            const dataPoint: TransactionVolumeDataPoint = {
              period: `${item.month}월`,
              value: 0
            };
            if (item.city_name) {
              dataPoint[item.city_name] = item.volume;
            }
            finalData.push(dataPoint);
          } else {
            if (item.city_name) {
              const currentValue = finalData[existingIndex][item.city_name] as number || 0;
              finalData[existingIndex][item.city_name] = currentValue + item.volume;
            }
          }
        });

        setTransactionData(finalData);
        
        // 연도 목록 설정 (필터링된 연도들)
        const years = Array.from(new Set(filteredData.map(item => item.year))).sort((a, b) => b - a);
        setMonthlyYears(years);
      } else {
        // 전국/수도권: 연도별로 시리즈 분리
        const yearMap = new Map<number, Map<number, number>>(); // year -> month -> volume
        
        filteredData.forEach(item => {
          if (!yearMap.has(item.year)) {
            yearMap.set(item.year, new Map());
          }
          const yearData = yearMap.get(item.year)!;
          yearData.set(item.month, (yearData.get(item.month) || 0) + item.volume);
        });

        // 모든 월 생성 (1~12월)
        const monthlyData: TransactionVolumeDataPoint[] = [];
        for (let month = 1; month <= 12; month++) {
          const dataPoint: TransactionVolumeDataPoint = {
            period: `${month}월`,
            value: 0
          };

          // 각 연도별 데이터 추가
          yearMap.forEach((yearData, year) => {
            dataPoint[String(year)] = yearData.get(month) || 0;
          });

          monthlyData.push(dataPoint);
        }

        setTransactionData(monthlyData);
        
        // 연도 목록 설정
        const years = Array.from(yearMap.keys()).sort((a, b) => b - a);
        setMonthlyYears(years);
      }
    }
  }, [rawTransactionData, viewMode, yearRange, selectedRegion]);

  // 거래량 API 호출
  useEffect(() => {
    const loadTransactionData = async () => {
      setIsTransactionLoading(true);
      
      try {
        const backendRegionType = getBackendRegionType(selectedRegion);
        const res = await fetchTransactionVolume(backendRegionType, 'sale', 10);
        
        if (res.success) {
          setRawTransactionData(res.data);
        } else {
          setRawTransactionData([]);
        }
      } catch (err) {
        console.error('거래량 데이터 로딩 실패:', err);
        setRawTransactionData([]);
      } finally {
        setIsTransactionLoading(false);
      }
    };

    loadTransactionData();
  }, [selectedRegion]);

  // API 데이터 로딩 (HPI)
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const backendRegionType = getBackendRegionType(selectedRegion);

        // HPI API 호출
        const hpiRes = await fetchHPIByRegionType(backendRegionType, 'APT', getHpiBaseYm() || undefined);

        // HPI 데이터 설정
        if (hpiRes.success) {
          setHpiData(hpiRes.data);
        }

        // 인구 이동 데이터 (Sankey) 조회
        const flowRes = await fetchPopulationFlow(3);
        if (flowRes.success) {
            setMigrationNodes(flowRes.nodes);
            setMigrationLinks(flowRes.links);
        }

      } catch (err) {
        console.error('데이터 로딩 실패:', err);
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [selectedRegion, hpiSelectedYear, hpiSelectedMonth]);
  

  return (
    <div className="space-y-8 pb-32 animate-fade-in px-4 md:px-0 pt-10">
      <div className="md:hidden pt-2 pb-2">
        <h1 className="text-2xl font-black text-slate-900">통계</h1>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold border border-red-100">
          {error}
        </div>
      )}

      <div className="mb-10">
        <h2 className="text-3xl font-black text-slate-900 mb-2 pl-2">
          주택 수요
        </h2>
      </div>

      <div className="flex flex-col md:flex-row justify-end items-end md:items-center gap-4 mb-6">
          <div className="flex gap-2">
              <div className="relative" ref={regionDropdownRef}>
                <button
                  onClick={() => setIsRegionDropdownOpen(!isRegionDropdownOpen)}
                  className="bg-white border border-slate-200 text-slate-700 text-[15px] rounded-lg focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 block px-4 py-2 shadow-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 flex items-center gap-2 min-w-[140px] justify-between"
                >
                  <span>{selectedRegion}</span>
                  <ChevronDown 
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                      isRegionDropdownOpen ? 'rotate-180' : ''
                    }`} 
                  />
                </button>
                
                {isRegionDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-full bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-50 animate-enter origin-top-right">
                    {(['전국', '수도권', '지방 5대광역시'] as RegionType[]).map((region) => (
                      <button
                        key={region}
                        onClick={() => {
                          setSelectedRegion(region);
                          setIsRegionDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 text-[14px] font-bold transition-colors ${
                          selectedRegion === region
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                )}
              </div>
          </div>
      </div>

      {/* 거래량 차트 & 시장 국면 차트 - 8:2 비율 (lg:col-span-8:2) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
        {/* 거래량 차트 */}
        <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white lg:col-span-8 flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-slate-900 text-[17px]">거래량</h3>
                <p className="text-[13px] text-slate-500 mt-1 font-medium">
                  {viewMode === 'yearly' ? '연도별 거래량 추이' : '월별 거래량 추이'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {viewMode === 'monthly' && (
                  <ToggleButtonGroup
                    options={['2년', '3년', '5년']}
                    value={`${yearRange}년`}
                    onChange={(value) => setYearRange(parseInt(value.replace('년', '')) as 2 | 3 | 5)}
                  />
                )}
                <ToggleButtonGroup
                  options={['연도별', '월별']}
                  value={viewMode === 'yearly' ? '연도별' : '월별'}
                  onChange={(value) => setViewMode(value === '연도별' ? 'yearly' : 'monthly')}
                />
              </div>
            </div>
          </div>
          <div className="p-6 bg-gradient-to-b from-white to-slate-50/20 flex-1 flex flex-col min-h-[400px]">
            <div className="flex-1 w-full min-h-[400px]">
              {isLoading || isTransactionLoading ? (
                <div className="flex items-center justify-center h-full min-h-[400px]">
                  <p className="text-slate-400 text-[14px] font-bold">데이터를 불러오는 중...</p>
                </div>
              ) : transactionData.length === 0 || !getHighchartsOptions ? (
                <div className="flex items-center justify-center h-full min-h-[400px]">
                  <p className="text-slate-400 text-[14px] font-bold">데이터가 없습니다.</p>
                </div>
              ) : (
                <HighchartsReact
                  highcharts={Highcharts}
                  constructorType={useStockChart ? 'stockChart' : 'chart'}
                  options={getHighchartsOptions}
                />
              )}
            </div>
            {viewMode === 'monthly' && monthlyYears.length > 0 && getBackendRegionType(selectedRegion) !== '지방5대광역시' && (
              <div className="flex items-center justify-center gap-4 mt-4">
                {monthlyYears.map((year) => {
                  const color = getYearColor(year, monthlyYears.length);
                  return (
                    <div key={year} className="flex items-center gap-2">
                      <div 
                        className="w-6 h-0.5 rounded"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[12px] font-bold text-slate-600">{year}년</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* 시장 국면 차트 */}
        <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white lg:col-span-2 flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <h3 className="font-black text-slate-900 text-[17px]">시장 국면 지표</h3>
            <p className="text-[13px] text-slate-500 mt-1 font-medium">거래량 추이를 기반으로 한 시장 국면 분석</p>
          </div>
          <div className="p-6 grid grid-cols-1 gap-4 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-8 text-slate-500 text-[14px]">로딩 중...</div>
            ) : marketPhases.length > 0 ? (
              marketPhases.slice(0, 10).map((item) => {
                const phaseColors: Record<string, { bg: string; color: string }> = {
                  '과열': { bg: 'bg-red-50', color: 'text-brand-red' },
                  '안정': { bg: 'bg-orange-50', color: 'text-orange-600' },
                  '하락': { bg: 'bg-blue-50', color: 'text-brand-blue' },
                  '보통': { bg: 'bg-slate-100', color: 'text-slate-500' }
                };
                const phaseStyle = phaseColors[item.phase] || { bg: 'bg-slate-100', color: 'text-slate-500' };
                
                return (
                  <div key={item.region_id} className="flex items-center justify-between p-4 rounded-xl hover:shadow-sm transition-all bg-white">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-[12px] ${phaseStyle.bg} ${phaseStyle.color}`}>
                        {item.phase.slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-[15px]">{item.region_name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`px-2.5 py-1 rounded text-[12px] font-bold ${phaseStyle.bg} ${phaseStyle.color}`}>
                        {item.phase}
                      </div>
                      <p className={`text-[12px] font-bold mt-1 tabular-nums ${item.trend === 'up' ? 'text-brand-red' : 'text-brand-blue'}`}>{item.change}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-slate-500 text-[14px]">데이터가 없습니다.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 지역별 주택 가격 지수 벌집 지도 */}
          <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white">
               <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <h3 className="font-black text-slate-900 text-[17px]">주택 가격 지수</h3>
                    <p className="text-[13px] text-slate-500 mt-1 font-medium">색상이 진할수록 값이 높음 (0~100)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 년도 선택 드롭다운 */}
                    <div className="relative" ref={hpiYearDropdownRef}>
                      <button
                        onClick={() => setIsHpiYearDropdownOpen(!isHpiYearDropdownOpen)}
                        className="bg-white border border-slate-200 text-slate-700 text-[13px] rounded-lg focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 block px-4 py-2 shadow-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 flex items-center gap-2 min-w-[100px] justify-between"
                      >
                        <span>{hpiSelectedYear ? `${hpiSelectedYear}년` : '년도'}</span>
                        <ChevronDown 
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                            isHpiYearDropdownOpen ? 'rotate-180' : ''
                          }`} 
                        />
                      </button>
                      
                      {isHpiYearDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-full bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-50 animate-enter origin-top-right max-h-[300px] overflow-y-auto">
                          {getAvailableYears().map((year) => (
                            <button
                              key={year}
                              onClick={() => {
                                setHpiSelectedYear(year);
                                setIsHpiYearDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-3 text-[14px] font-bold transition-colors ${
                                hpiSelectedYear === year
                                  ? 'bg-slate-100 text-slate-900'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {year}년
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 월 선택 드롭다운 */}
                    <div className="relative" ref={hpiMonthDropdownRef}>
                      <button
                        onClick={() => setIsHpiMonthDropdownOpen(!isHpiMonthDropdownOpen)}
                        className="bg-white border border-slate-200 text-slate-700 text-[13px] rounded-lg focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 block px-4 py-2 shadow-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 flex items-center gap-2 min-w-[80px] justify-between"
                      >
                        <span>{hpiSelectedMonth ? `${hpiSelectedMonth}월` : '월'}</span>
                        <ChevronDown 
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                            isHpiMonthDropdownOpen ? 'rotate-180' : ''
                          }`} 
                        />
                      </button>
                      
                      {isHpiMonthDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-full bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-50 animate-enter origin-top-right">
                          {getAvailableMonths().map((month) => (
                            <button
                              key={month.value}
                              onClick={() => {
                                setHpiSelectedMonth(month.value);
                                setIsHpiMonthDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-3 text-[14px] font-bold transition-colors ${
                                hpiSelectedMonth === month.value
                                  ? 'bg-slate-100 text-slate-900'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {month.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 초기화 버튼 */}
                    {(hpiSelectedYear || hpiSelectedMonth) && (
                      <button
                        onClick={() => {
                          setHpiSelectedYear(null);
                          setHpiSelectedMonth(null);
                        }}
                        className="text-[13px] font-bold text-slate-500 hover:text-slate-700 px-2 py-2"
                        title="초기화"
                      >
                        초기화
                      </button>
                    )}
                  </div>
              </div>
              <div className="p-6">
                  {isLoading ? (
                    <div className="text-center py-8 text-slate-500 text-[14px]">로딩 중...</div>
                  ) : (
                    <KoreaHexMap 
                      region={selectedRegion} 
                      className="w-full"
                      {...(hpiData.length > 0 && {
                        apiData: hpiData.map(item => ({
                          id: item.id,
                          name: item.name,
                          value: item.value
                        }))
                      })}
                    />
                  )}
              </div>
          </Card>

          {/* 인구 순이동 차트 */}
          <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-[17px]">인구 순이동</h3>
              <p className="text-[13px] text-slate-500 mt-1 font-medium">최근 3개월간 지역별 인구 순이동 추이 (0~100)</p>
            </div>
            <div className="p-6 h-[400px]">
              {isLoading ? (
                <div className="text-center py-8 text-slate-500 text-[14px]">로딩 중...</div>
              ) : migrationLinks.length > 0 ? (
                <MigrationSankey 
                  nodes={migrationNodes}
                  links={migrationLinks.map(l => ({
                    from: l.from_region,
                    to: l.to_region,
                    weight: l.value
                  }))} 
                />
              ) : (
                <div className="text-center py-8 text-slate-500 text-[14px]">데이터가 없습니다.</div>
              )}
            </div>
          </Card>
      </div>
    </div>
  );
};
