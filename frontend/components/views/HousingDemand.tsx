import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../ui/Card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { ChevronDown } from 'lucide-react';
import { MigrationSankey } from '../ui/MigrationSankey';
import { KoreaHexMap, RegionType } from '../ui/KoreaHexMap';
import { ToggleButtonGroup } from '../ui/ToggleButtonGroup';
import {
  fetchTransactionVolume,
  fetchMarketPhase,
  fetchHPIByRegionType,
  fetchPopulationMovementsByRegionType,
  TransactionVolumeDataPoint,
  MarketPhaseDataPoint,
  HPIRegionTypeDataPoint,
  PopulationMovementRegionTypeDataPoint
} from '../../services/api';

// 연도별 거래량 더미 데이터
const yearlyData = [
    { period: '2020', value: 1250 },
    { period: '2021', value: 1380 },
    { period: '2022', value: 1520 },
    { period: '2023', value: 1680 },
    { period: '2024', value: 1750 },
    { period: '2025', value: 1820 },
];

// 여러 년도의 월별 거래량 더미 데이터
const generateMonthlyDataForYear = (year: number, baseValue: number) => {
    const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    const variations: { [key: number]: number[] } = {
        2021: [-5, -8, 5, 10, 12, 18, 15, 8, 3, 0, -3, -6],
        2022: [-3, -6, 6, 11, 14, 19, 17, 9, 4, 1, -2, -5],
        2023: [0, -5, 8, 12, 15, 20, 18, 10, 5, 2, -2, -5],
        2024: [2, -3, 10, 15, 18, 22, 20, 12, 7, 4, 0, -3],
        2025: [5, 0, 12, 18, 20, 25, 22, 15, 10, 8, 5, 0],
    };
    const variation = variations[year] || variations[2023];
    
    return months.map((month, index) => ({
        period: month,
        value: Math.max(100, Math.round(baseValue + variation[index] + (Math.random() * 10 - 5))),
        year: year,
    }));
};

const monthlyData2021 = generateMonthlyDataForYear(2021, 120);
const monthlyData2022 = generateMonthlyDataForYear(2022, 130);
const monthlyData2023 = generateMonthlyDataForYear(2023, 140);
const monthlyData2024 = generateMonthlyDataForYear(2024, 150);
const monthlyData2025 = generateMonthlyDataForYear(2025, 160);

const getYearColor = (year: number, totalYears: number) => {
    const currentYear = 2025;
    const yearIndex = currentYear - year;
    const opacity = 0.3 + ((totalYears - 1 - yearIndex) / (totalYears - 1)) * 0.7;
    return `rgba(49, 130, 246, ${opacity})`;
};

const marketPhases = [
    { region: '서울 강남', phase: '상승기', trend: 'up', change: '+1.5%', color: 'text-brand-red', bg: 'bg-red-50' },
    { region: '서울 마포', phase: '회복기', trend: 'up', change: '+0.8%', color: 'text-orange-500', bg: 'bg-orange-50' },
    { region: '경기 과천', phase: '상승기', trend: 'up', change: '+1.2%', color: 'text-brand-red', bg: 'bg-red-50' },
    { region: '대구 수성', phase: '침체기', trend: 'down', change: '-0.5%', color: 'text-brand-blue', bg: 'bg-blue-50' },
    { region: '부산 해운대', phase: '후퇴기', trend: 'down', change: '-0.2%', color: 'text-slate-500', bg: 'bg-slate-100' },
    { region: '인천 송도', phase: '회복기', trend: 'up', change: '+0.4%', color: 'text-orange-500', bg: 'bg-orange-50' },
];

const migrationData = [
    { name: '경기', value: 4500, label: '순유입' },
    { name: '인천', value: 1200, label: '순유입' },
    { name: '충남', value: 800, label: '순유입' },
    { name: '서울', value: -3500, label: '순유출' },
    { name: '부산', value: -1500, label: '순유출' },
];

export const HousingDemand: React.FC = () => {
  const [viewMode, setViewMode] = useState<'yearly' | 'monthly'>('monthly');
  const [yearRange, setYearRange] = useState<2 | 3 | 5>(3);
  const [selectedRegion, setSelectedRegion] = useState<RegionType>('전국');
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);
  const regionDropdownRef = useRef<HTMLDivElement>(null);
  
  // API 데이터 상태
  const [transactionData, setTransactionData] = useState<TransactionVolumeDataPoint[]>([]);
  const [monthlyYears, setMonthlyYears] = useState<number[]>([]);
  const [marketPhases, setMarketPhases] = useState<MarketPhaseDataPoint[]>([]);
  const [hpiData, setHpiData] = useState<HPIRegionTypeDataPoint[]>([]);
  const [migrationData, setMigrationData] = useState<PopulationMovementRegionTypeDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 주택 가격 지수 기준 년월 상태
  const [hpiSelectedYear, setHpiSelectedYear] = useState<number | null>(null);
  const [hpiSelectedMonth, setHpiSelectedMonth] = useState<number | null>(null);
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
  
  // 사용 가능한 년도 목록 생성 (최대 10년)
  const getAvailableYears = (): number[] => {
    const years: number[] = [];
    const currentYear = new Date().getFullYear();
    
    for (let i = 0; i <= 10; i++) {
      years.push(currentYear - i);
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

  // API 데이터 로딩
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // 지역 타입 변환 (프론트엔드: "지방 5대광역시" -> 백엔드: "지방5대광역시")
        const regionTypeMap: Record<RegionType, string> = {
          '전국': '전국',
          '수도권': '수도권',
          '지방 5대광역시': '지방5대광역시'
        };
        const backendRegionType = regionTypeMap[selectedRegion];

        // 병렬로 모든 API 호출
        const [transactionRes, marketPhaseRes, hpiRes, migrationRes] = await Promise.all([
          fetchTransactionVolume(
            backendRegionType,
            viewMode,
            viewMode === 'monthly' ? yearRange : undefined,
            viewMode === 'yearly' ? new Date().getFullYear() - 5 : undefined,
            viewMode === 'yearly' ? new Date().getFullYear() : undefined
          ),
          fetchMarketPhase(backendRegionType, 2),
          fetchHPIByRegionType(backendRegionType, 'APT', getHpiBaseYm() || undefined),
          fetchPopulationMovementsByRegionType(backendRegionType)
        ]);

        // 거래량 데이터 설정
        if (transactionRes.success) {
          setTransactionData(transactionRes.data);
          if (transactionRes.years) {
            setMonthlyYears(transactionRes.years);
          } else {
            // 년도별인 경우 years 배열 생성
            const years: number[] = [];
            if (transactionRes.start_year && transactionRes.end_year) {
              for (let y = transactionRes.start_year; y <= transactionRes.end_year; y++) {
                years.push(y);
              }
            }
            setMonthlyYears(years);
          }
        }

        // 시장 국면 분석 데이터 설정
        if (marketPhaseRes.success) {
          setMarketPhases(marketPhaseRes.data);
        }

        // HPI 데이터 설정
        if (hpiRes.success) {
          setHpiData(hpiRes.data);
        }

        // 인구 순이동 데이터 설정
        if (migrationRes.success) {
          setMigrationData(migrationRes.data);
        }

      } catch (err) {
        console.error('데이터 로딩 실패:', err);
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [selectedRegion, viewMode, yearRange, hpiSelectedYear, hpiSelectedMonth]);
  
  const getMonthlyDataByRange = () => {
    const currentYear = 2025;
    const years: number[] = [];
    
    if (yearRange === 2) {
      years.push(currentYear - 1, currentYear);
    } else if (yearRange === 3) {
      years.push(currentYear - 2, currentYear - 1, currentYear);
    } else if (yearRange === 5) {
      years.push(currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1, currentYear);
    }
    
    const dataMap: { [key: string]: { [key: string]: number } } = {};
    const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    
    months.forEach(month => {
      dataMap[month] = {};
    });
    
    years.forEach(year => {
      let yearData;
      if (year === 2021) yearData = monthlyData2021;
      else if (year === 2022) yearData = monthlyData2022;
      else if (year === 2023) yearData = monthlyData2023;
      else if (year === 2024) yearData = monthlyData2024;
      else if (year === 2025) yearData = monthlyData2025;
      else {
        const baseValue = 110 + (year - 2020) * 5;
        yearData = generateMonthlyDataForYear(year, baseValue);
      }
      
      yearData.forEach(item => {
        dataMap[item.period][year] = Math.round(item.value);
      });
    });
    
    return months.map(month => {
      const dataPoint: { period: string; [key: number]: number } = { period: month };
      years.forEach(year => {
        dataPoint[year] = dataMap[month][year];
      });
      return dataPoint;
    });
  };
  
  // 실제 API 데이터 사용
  const currentData = transactionData.length > 0 ? transactionData : (viewMode === 'yearly' ? yearlyData : getMonthlyDataByRange());
  const displayMonthlyYears = monthlyYears.length > 0 ? monthlyYears : (viewMode === 'monthly' 
    ? (yearRange === 2 ? [2024, 2025] : yearRange === 3 ? [2023, 2024, 2025] : [2021, 2022, 2023, 2024, 2025])
    : []);

  return (
    <div className="space-y-8 pb-32 animate-fade-in px-4 md:px-0 pt-6">
      <div className="md:hidden pt-2 pb-2">
        <h1 className="text-2xl font-black text-slate-900">통계</h1>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold border border-red-100">
          {error}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">
                주택 수요
            </h2>
          </div>
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

      {/* 거래량 Chart & 시장 국면 분석 - 나란히 배치 (8:2 비율) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
          {/* 거래량 Chart */}
          <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white lg:col-span-8 flex flex-col">
              <div className="p-6 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                      <div>
                          <h3 className="font-black text-slate-900 text-[17px]">거래량</h3>
                          <p className="text-[13px] text-slate-500 font-medium mt-1">
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
              <div className="p-6 bg-gradient-to-b from-white to-slate-50/20 flex-1 flex flex-col min-h-0">
                  <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={currentData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                            dataKey="period" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 'bold' }} 
                            dy={10} 
                        />
                        <YAxis 
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 'bold' }}
                            domain={['auto', 'auto']}
                            tickFormatter={(value) => `${value.toLocaleString()}`}
                        />
                        <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                            itemStyle={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}
                            labelStyle={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}
                            formatter={(value: number, name: string) => {
                              if (viewMode === 'monthly') {
                                return [`${value.toLocaleString()}건`, `${name}년`];
                              }
                              return [`${value.toLocaleString()}건`, '거래량'];
                            }}
                        />
                        {viewMode === 'yearly' ? (
                          <Line 
                              type="monotone" 
                              dataKey="value" 
                              stroke="#3182F6" 
                              strokeWidth={2} 
                              dot={{r: 3, strokeWidth: 2, fill: '#fff', stroke: '#3182F6'}} 
                              activeDot={{r: 5, fill: '#3182F6', stroke: '#fff', strokeWidth: 2}} 
                          />
                        ) : (
                          displayMonthlyYears.map((year) => {
                            const color = getYearColor(year, displayMonthlyYears.length);
                            return (
                              <Line 
                                  key={year}
                                  type="monotone" 
                                  dataKey={year} 
                                  stroke={color}
                                  strokeWidth={2}
                                  dot={{r: 3, strokeWidth: 2, fill: '#fff', stroke: color}} 
                                  activeDot={{r: 5, fill: color, stroke: '#fff', strokeWidth: 2}}
                                  name={`${year}`}
                              />
                            );
                          })
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {viewMode === 'monthly' && displayMonthlyYears.length > 0 && (
                    <div className="flex items-center justify-center gap-4 mt-4">
                      {displayMonthlyYears.map((year) => {
                        const color = getYearColor(year, displayMonthlyYears.length);
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

          {/* 시장 국면 분석 */}
          <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white lg:col-span-2 flex flex-col">
               <div className="p-6 border-b border-slate-100">
                  <h3 className="font-black text-slate-900 text-[17px]">시장 국면 분석</h3>
                  <p className="text-[13px] text-slate-500 font-medium mt-1">가격/거래량 데이터를 기반으로 한 지역별 시장 단계</p>
              </div>
              <div className="p-6 grid grid-cols-1 gap-4 flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-8 text-slate-500 text-[14px]">로딩 중...</div>
              ) : marketPhases.length > 0 ? (
                marketPhases.slice(0, 10).map((item) => {
                  const phaseColors: Record<string, { bg: string; color: string }> = {
                    '상승기': { bg: 'bg-red-50', color: 'text-brand-red' },
                    '회복기': { bg: 'bg-orange-50', color: 'text-orange-600' },
                    '침체기': { bg: 'bg-blue-50', color: 'text-brand-blue' },
                    '후퇴기': { bg: 'bg-slate-100', color: 'text-slate-500' }
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
                          <button
                            onClick={() => {
                              setHpiSelectedYear(null);
                              setIsHpiYearDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-3 text-[14px] font-bold transition-colors ${
                              !hpiSelectedYear
                                ? 'bg-slate-100 text-slate-900'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            년도 선택
                          </button>
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
                          <button
                            onClick={() => {
                              setHpiSelectedMonth(null);
                              setIsHpiMonthDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-3 text-[14px] font-bold transition-colors ${
                              !hpiSelectedMonth
                                ? 'bg-slate-100 text-slate-900'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            월 선택
                          </button>
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

          {/* Migration */}
          <Card className="p-0 overflow-hidden border border-slate-200 shadow-soft bg-white">
               <div className="p-6 border-b border-slate-100">
                  <h3 className="font-black text-slate-900 text-[17px]">인구 순이동</h3>
                  <p className="text-[13px] text-slate-500 mt-1 font-medium">최근 3개월 지역별 인구 전입/전출</p>
              </div>
              <div className="p-6 h-[400px]">
                  {isLoading ? (
                    <div className="text-center py-8 text-slate-500 text-[14px]">로딩 중...</div>
                  ) : migrationData.length > 0 ? (
                    <MigrationSankey data={migrationData.map(item => ({
                      name: item.name,
                      value: item.value,
                      label: item.label
                    }))} />
                  ) : (
                    <div className="text-center py-8 text-slate-500 text-[14px]">데이터가 없습니다.</div>
                  )}
              </div>
          </Card>
      </div>
    </div>
  );
};
