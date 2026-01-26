import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Search, Download, ChevronDown, Calendar } from 'lucide-react';

interface HousingSupplyItem {
  moveInDate: string; // YYYYMM 형식
  region: string;
  businessType: '분양' | '임대';
  address: string;
  propertyName: string;
  units: number;
}

// 더미 데이터 생성
const generateDummyData = (): HousingSupplyItem[] => {
  const regions = ['강원', '경기', '서울', '인천', '부산', '대구', '광주', '대전', '울산', '세종'];
  const businessTypes: ('분양' | '임대')[] = ['분양', '임대'];
  const addresses = [
    '강원특별자치도 강릉시 견소동 219-0',
    '강원특별자치도 강릉시 견소동 244-2',
    '강원특별자치도 강릉시 교동 61-2',
    '강원특별자치도 강릉시 송정동 산 77-3',
    '강원특별자치도 강릉시 주문진읍 주문리 762-5',
    '강원특별자치도 강릉시 포남동 1153-0',
    '강원특별자치도 강릉시 포남동 852-0',
    '강원특별자치도 강릉시 회산동 536-0',
    '강원특별자치도 고성군 토성면 아야진리 산 21-0',
    '강원특별자치도 동해시 천곡동 0-0',
    '강원특별자치도 속초시 금호동 622-40',
    '강원특별자치도 양양군 양양읍 구교리 57-0',
    '강원특별자치도 영월군 영월읍 덕포리 815',
    '강원특별자치도 원주시 관설동 1298-0',
    '강원특별자치도 원주시 단구동 922-0',
  ];
  
  const propertyNames = [
    '강릉 모아미래도 오션리버',
    '강릉 오션시티 아이파크',
    '경남아너스빌 더센트로',
    '강릉자이르네 디오션',
    '강릉시 주문진 라일플로리스 벨벳 도시형생활주택',
    '강릉 유블레스 리센트',
    '강릉KTX역 경남아너스빌',
    '강릉 아테라',
    '아야진 라메르 데시앙',
    '동해천곡1(고령자) 행복주택',
    '동해천곡1(고령자) 영구임대',
    '힐스테이트 속초',
    '양양 금호어울림 더퍼스트',
    '영월덕포행복(청년)주택',
    '원주 동문 디 이스트',
    '원주자이 센트로',
    '원주 모아엘가 그랑데',
    '원주 롯데캐슬 시그니처',
    '유승한내들 더스카이',
    '두산위브더제니스 센트럴 원주',
    'e편한세상 원주 프리모원(2회차)',
    'e편한세상 원주 프리모원(1회차)',
  ];
  
  const data: HousingSupplyItem[] = [];
  const moveInDates = ['202508', '202509', '202510', '202511', '202512', '202601', '202602', '202603', '202604', '202605', '202606', '202607', '202608', '202609', '202610', '202611', '202612', '202701', '202702', '202703', '202704', '202705', '202706'];
  
  for (let i = 0; i < 50; i++) {
    const moveInDate = moveInDates[Math.floor(Math.random() * moveInDates.length)];
    const region = regions[Math.floor(Math.random() * regions.length)];
    const businessType = businessTypes[Math.floor(Math.random() * businessTypes.length)];
    const address = addresses[Math.floor(Math.random() * addresses.length)];
    const propertyName = propertyNames[Math.floor(Math.random() * propertyNames.length)];
    const units = Math.floor(Math.random() * 1000) + 100;
    
    data.push({
      moveInDate,
      region,
      businessType,
      address,
      propertyName,
      units,
    });
  }
  
  return data.sort((a, b) => a.moveInDate.localeCompare(b.moveInDate));
};

export const HousingSupply: React.FC = () => {
  const [data] = useState<HousingSupplyItem[]>(generateDummyData());
  const [filteredData, setFilteredData] = useState<HousingSupplyItem[]>(data);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('전체');
  const [selectedCity, setSelectedCity] = useState('전체');
  const [selectedBusinessType, setSelectedBusinessType] = useState<'전체' | '분양' | '임대'>('전체');
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const regionDropdownRef = useRef<HTMLDivElement>(null);
  const cityDropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (regionDropdownRef.current && !regionDropdownRef.current.contains(event.target as Node)) {
        setIsRegionDropdownOpen(false);
      }
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(event.target as Node)) {
        setIsCityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  useEffect(() => {
    let filtered = [...data];
    
    // 지역 필터
    if (selectedRegion !== '전체') {
      filtered = filtered.filter(item => item.region === selectedRegion);
    }
    
    // 사업유형 필터
    if (selectedBusinessType !== '전체') {
      filtered = filtered.filter(item => item.businessType === selectedBusinessType);
    }
    
    // 검색어 필터
    if (searchTerm) {
      filtered = filtered.filter(item => 
        item.propertyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.address.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setFilteredData(filtered);
  }, [data, selectedRegion, selectedBusinessType, searchTerm]);
  
  const formatDate = (dateStr: string): string => {
    if (dateStr.length === 6) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      return `${year}.${month}`;
    }
    return dateStr;
  };
  
  const regions = ['전체', '강원', '경기', '서울', '인천', '부산', '대구', '광주', '대전', '울산', '세종'];
  
  // 지역별 시/군구 목록 (예시)
  const getCitiesByRegion = (region: string): string[] => {
    if (region === '전체') return ['전체'];
    const cityMap: { [key: string]: string[] } = {
      '강원': ['전체', '강릉시', '속초시', '원주시', '동해시', '고성군', '양양군', '영월군'],
      '경기': ['전체', '수원시', '성남시', '고양시', '용인시', '부천시', '안산시', '안양시'],
      '서울': ['전체', '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구'],
      '인천': ['전체', '중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구'],
      '부산': ['전체', '중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구'],
      '대구': ['전체', '중구', '동구', '서구', '남구', '북구', '수성구', '달서구'],
      '광주': ['전체', '동구', '서구', '남구', '북구', '광산구'],
      '대전': ['전체', '동구', '중구', '서구', '유성구', '대덕구'],
      '울산': ['전체', '중구', '남구', '동구', '북구', '울주군'],
      '세종': ['전체', '조치원읍', '연기면', '연동면', '부강면', '금남면'],
    };
    return cityMap[region] || ['전체'];
  };
  
  return (
    <div className="space-y-4 md:space-y-8 pb-32 animate-fade-in px-2 md:px-0 pt-2 md:pt-10">
      {/* Mobile Header */}
      <div className="md:hidden mb-3 pb-2">
        <h1 className="text-xl font-black text-slate-900">주택 공급</h1>
      </div>

      {/* 제목 섹션 */}
      <div className="mb-6 md:mb-10 md:mt-8">
        <div>
          <h2 className="text-xl md:text-3xl font-black text-slate-900 mb-1 md:mb-2">
            주택 공급
          </h2>
          <p className="hidden md:block text-slate-500 text-[15px] font-medium">
            현재 매물 기준 지역·유형별 주택 공급 현황을 한눈에 확인하세요.
          </p>
        </div>
      </div>

      {/* 검색 및 필터 섹션 */}
      <div className="flex flex-row justify-between items-end gap-4">
        {/* 검색 입력 필드 */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="주택명 또는 주소로 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 h-[59px] border border-slate-200 rounded-2xl text-[14px] font-bold text-slate-700"
          />
        </div>

        {/* 필터 섹션 */}
        <div className="inline-block rounded-[24px] transition-all duration-200 relative bg-white border border-slate-200 md:shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] p-4 md:p-6 overflow-visible">
        <div className="flex flex-row gap-6 items-center">
          {/* 1번: 지역 (시, 군구) */}
          <div className="flex flex-col gap-1.5 md:gap-2">
            <label className="text-[12px] md:text-[14px] font-bold text-slate-700">지역</label>
            <div className="flex items-center gap-1.5 md:gap-2">
              <div className="relative flex-1 md:flex-none" ref={regionDropdownRef}>
                <button
                  onClick={() => setIsRegionDropdownOpen(!isRegionDropdownOpen)}
                  className="w-full md:w-auto bg-white border border-slate-200 text-slate-700 text-[12px] md:text-[14px] rounded-lg px-2.5 md:px-4 py-1.5 md:py-2 shadow-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 flex items-center gap-1.5 md:gap-2 md:min-w-[120px] justify-between"
                >
                  <span className="truncate">{selectedRegion}</span>
                  <ChevronDown 
                    className={`w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${
                      isRegionDropdownOpen ? 'rotate-180' : ''
                    }`} 
                  />
                </button>
                
                {isRegionDropdownOpen && (
                  <div className="absolute left-0 top-full mt-2 w-full bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-[100] animate-enter origin-top-left max-h-60 overflow-y-auto">
                    {regions.map((region) => (
                      <button
                        key={region}
                        onClick={() => {
                          setSelectedRegion(region);
                          setSelectedCity('전체');
                          setIsRegionDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 md:px-4 py-2.5 md:py-3 text-[14px] font-bold transition-colors duration-200 ${
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
              
              <div className="relative flex-1 md:flex-none" ref={cityDropdownRef}>
                <button
                  onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
                  disabled={selectedRegion === '전체'}
                  className="w-full md:w-auto bg-white border border-slate-200 text-slate-700 text-[12px] md:text-[14px] rounded-lg px-2.5 md:px-4 py-1.5 md:py-2 shadow-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 flex items-center gap-1.5 md:gap-2 md:min-w-[120px] justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="truncate">{selectedCity}</span>
                  <ChevronDown 
                    className={`w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${
                      isCityDropdownOpen ? 'rotate-180' : ''
                    }`} 
                  />
                </button>
                
                {isCityDropdownOpen && selectedRegion !== '전체' && (
                  <div className="absolute left-0 top-full mt-2 w-full bg-white rounded-xl shadow-deep border border-slate-200 overflow-hidden z-[100] animate-enter origin-top-left max-h-60 overflow-y-auto">
                    {getCitiesByRegion(selectedRegion).map((city) => (
                      <button
                        key={city}
                        onClick={() => {
                          setSelectedCity(city);
                          setIsCityDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 md:px-4 py-2.5 md:py-3 text-[14px] font-bold transition-colors duration-200 ${
                          selectedCity === city
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* 구분선 */}
          <div className="hidden md:block h-16 w-px bg-slate-200"></div>
          
          {/* 2번: 사업유형 */}
          <div className="flex flex-col gap-1.5 md:gap-2">
            <label className="text-[12px] md:text-[14px] font-bold text-slate-700">사업유형</label>
            <div className="flex gap-2 md:gap-3">
              <label className="flex items-center gap-1.5 md:gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="businessType"
                  value="전체"
                  checked={selectedBusinessType === '전체'}
                  onChange={(e) => setSelectedBusinessType(e.target.value as '전체' | '분양' | '임대')}
                  className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-blue"
                />
                <span className="text-[12px] md:text-[14px] font-bold text-slate-700 whitespace-nowrap">전체</span>
              </label>
              <label className="flex items-center gap-1.5 md:gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="businessType"
                  value="분양"
                  checked={selectedBusinessType === '분양'}
                  onChange={(e) => setSelectedBusinessType(e.target.value as '전체' | '분양' | '임대')}
                  className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-blue"
                />
                <span className="text-[12px] md:text-[14px] font-bold text-slate-700 whitespace-nowrap">분양</span>
              </label>
              <label className="flex items-center gap-1.5 md:gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="businessType"
                  value="임대"
                  checked={selectedBusinessType === '임대'}
                  onChange={(e) => setSelectedBusinessType(e.target.value as '전체' | '분양' | '임대')}
                  className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-blue"
                />
                <span className="text-[12px] md:text-[14px] font-bold text-slate-700 whitespace-nowrap">임대</span>
              </label>
            </div>
          </div>
          
          {/* 구분선 */}
          <div className="hidden md:block h-16 w-px bg-slate-200"></div>
          
          {/* 3번: 입주예정월 조회 */}
          <div className="flex flex-col gap-1.5 md:gap-2">
            <label className="text-[12px] md:text-[14px] font-bold text-slate-700">입주예정월</label>
            <div className="flex items-center gap-1.5 md:gap-2">
              <input
                type="text"
                placeholder="2025.05"
                className="px-2 md:px-3 py-1.5 md:py-2 border border-slate-200 rounded-lg text-[12px] md:text-[14px] font-bold text-slate-700 w-24 md:w-32 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              />
              <span className="text-slate-400 text-[12px] md:text-[14px]">-</span>
              <input
                type="text"
                placeholder="2025.10"
                className="px-2 md:px-3 py-1.5 md:py-2 border border-slate-200 rounded-lg text-[12px] md:text-[14px] font-bold text-slate-700 w-24 md:w-32 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              />
            </div>
          </div>
          
          {/* 조회 버튼 */}
          <div className="flex items-center md:ml-auto">
            <button className="px-3 md:px-6 py-1.5 md:py-2.5 bg-brand-blue text-white rounded-lg text-[12px] md:text-[14px] font-bold hover:bg-blue-600 transition-colors whitespace-nowrap">
              조회하기
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="md:rounded-[24px] md:border md:border-slate-200 md:shadow-soft md:bg-white bg-transparent border-0 rounded-none shadow-none">
        <div className="p-3 md:p-6 border-b border-slate-200 md:border-slate-100 flex justify-between items-start gap-2">
          <div className="min-w-0">
            <h3 className="font-black text-slate-900 text-[15px] md:text-[17px]">상세내역</h3>
            <p className="text-[12px] md:text-[13px] text-slate-500 mt-0.5 md:mt-1 font-medium">총 {filteredData.length}건</p>
          </div>
          <button className="px-2.5 md:px-4 py-1.5 md:py-2.5 border border-slate-200 rounded-lg text-[11px] md:text-[14px] font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1 md:gap-2 flex-shrink-0">
            <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden md:inline">엑셀 다운로드</span>
            <span className="md:hidden">다운로드</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[11px] md:text-[13px] font-bold text-slate-700 whitespace-nowrap">
                  입주예정월
                </th>
                <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[11px] md:text-[13px] font-bold text-slate-700 whitespace-nowrap">
                  지역
                </th>
                <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[11px] md:text-[13px] font-bold text-slate-700 whitespace-nowrap">
                  사업유형
                </th>
                <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[11px] md:text-[13px] font-bold text-slate-700 whitespace-nowrap">
                  주소
                </th>
                <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[11px] md:text-[13px] font-bold text-slate-700 whitespace-nowrap">
                  주택명
                </th>
                <th className="px-2 md:px-4 py-2 md:py-3 text-right text-[11px] md:text-[13px] font-bold text-slate-700 whitespace-nowrap">
                  세대수
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, index) => (
                <tr
                  key={index}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-2 md:px-4 py-2 md:py-3 text-[12px] md:text-[14px] font-bold text-slate-900 whitespace-nowrap">
                    {formatDate(item.moveInDate)}
                  </td>
                  <td className="px-2 md:px-4 py-2 md:py-3 text-[12px] md:text-[14px] font-bold text-slate-700 whitespace-nowrap">
                    {item.region}
                  </td>
                  <td className="px-2 md:px-4 py-2 md:py-3 text-[12px] md:text-[14px] font-bold whitespace-nowrap">
                    <span className={`px-2 md:px-2.5 py-0.5 md:py-1 rounded-full text-[10px] md:text-[12px] ${
                      item.businessType === '분양' 
                        ? 'bg-blue-50 text-blue-600' 
                        : 'bg-purple-50 text-purple-600'
                    }`}>
                      {item.businessType}
                    </span>
                  </td>
                  <td className="px-2 md:px-4 py-2 md:py-3 text-[12px] md:text-[14px] font-medium text-slate-600 truncate max-w-[120px] md:max-w-none">
                    {item.address}
                  </td>
                  <td className="px-2 md:px-4 py-2 md:py-3 text-[12px] md:text-[14px] font-bold text-slate-900 truncate max-w-[150px] md:max-w-none">
                    {item.propertyName}
                  </td>
                  <td className="px-2 md:px-4 py-2 md:py-3 text-right text-[12px] md:text-[14px] font-bold text-slate-900 tabular-nums whitespace-nowrap">
                    {item.units.toLocaleString()}세대
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredData.length === 0 && (
          <div className="p-8 md:p-12 text-center">
            <p className="text-slate-400 font-bold text-[13px] md:text-[14px]">검색 결과가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
};
