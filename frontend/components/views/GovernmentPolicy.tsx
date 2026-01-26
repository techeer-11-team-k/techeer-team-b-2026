import React, { useState, useRef, useEffect } from 'react';
import { Building2, Calendar, MapPin, BarChart3, ExternalLink, Info, ChevronDown } from 'lucide-react';

type TabType = 'regulated' | 'history' | 'newtown';

const GovernmentPolicy: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('regulated');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const years = [2025, 2024, 2023, 2022];

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="space-y-4 md:space-y-8 pb-32 animate-fade-in px-2 md:px-0 pt-2 md:pt-10 min-h-screen">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mb-6">정부정책</h1>
        
        {/* 탭 네비게이션 */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('regulated')}
            className={`px-4 py-3 text-[15px] font-bold transition-all relative ${
              activeTab === 'regulated'
                ? 'text-brand-blue border-b-2 border-brand-blue'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
            }`}
          >
            규제지역
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-[15px] font-bold transition-all relative ${
              activeTab === 'history'
                ? 'text-brand-blue border-b-2 border-brand-blue'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
            }`}
          >
            정책연혁
          </button>
          <button
            onClick={() => setActiveTab('newtown')}
            className={`px-4 py-3 text-[15px] font-bold transition-all relative ${
              activeTab === 'newtown'
                ? 'text-brand-blue border-b-2 border-brand-blue'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
            }`}
          >
            3기 신도시
          </button>
        </div>
      </div>

      {/* 규제지역 탭 */}
      {activeTab === 'regulated' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
          <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mb-8">규제지역</h3>
          <div className="space-y-6">
            {/* 투기지역 */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="px-4 py-2 bg-red-500 text-white rounded-full text-[14px] font-bold flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  투기지역
                </span>
              </div>
              <p className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed">
                강남 3구(강남·서초·송파) 및 용산구
              </p>
            </div>

            {/* 투기과열지구 */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="px-4 py-2 bg-orange-500 text-white rounded-full text-[14px] font-bold flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  투기과열지구
                </span>
              </div>
              <div className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed space-y-2">
                <p><strong>(서울)</strong> 25개구 전역</p>
                <p>
                  <strong>(경기)</strong> 과천시, 광명시, 성남시 분당구·수정구·중원구, 수원시 영통구·장안구·팔달구, 
                  안양시 동안구, 용인시 수지구, 의왕시, 하남시
                </p>
              </div>
            </div>

            {/* 조정대상지역 */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="px-4 py-2 bg-yellow-500 text-white rounded-full text-[14px] font-bold flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  조정대상지역
                </span>
              </div>
              <div className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed space-y-2">
                <p><strong>(서울)</strong> 25개구 전역</p>
                <p>
                  <strong>(경기)</strong> 과천시, 광명시, 성남시 분당구·수정구·중원구, 수원시 영통구·장안구·팔달구, 
                  안양시 동안구, 용인시 수지구, 의왕시, 하남시
                </p>
              </div>
            </div>

            {/* 토지거래허가구역 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-4 py-2 bg-amber-600 text-white rounded-full text-[14px] font-bold flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  토지거래허가구역
                </span>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">2025.10.15. 업데이트</p>
              </div>
              
              {/* 지역 버튼 그리드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '경남', '경북', '충남', '충북', '전남', '전북', '강원', '제주'].map((region) => {
                  // 모든 지역 버튼이 동일한 토지거래허가구역 메인 페이지로 이동
                  const landPermitUrl = 'https://www.eum.go.kr/web/am/amMain.jsp';
                  
                  return (
                    <button
                      key={region}
                      onClick={() => window.open(landPermitUrl, '_blank', 'noopener,noreferrer')}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-[12px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {region}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 정보 섹션 */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
            <div className="space-y-2 text-[14px] text-slate-600 dark:text-slate-400">
              <p>• 투기지역은 투기과열지구와 조정대상지역에 포함됩니다.</p>
              <p>• 투기과열지구는 조정대상지역에 포함됩니다.</p>
              <p>• 규제지역 조건 적용의 우선순위는 1순위 투기지역, 2순위 투기과열지구, 3순위 조정대상지역</p>
              <p>• 지도 위 경계 지역은 색상 표기가 불일치할 수 있으니, 규제지역을 확인해 주세요.</p>
            </div>
          </div>
        </div>
      )}

      {/* 정책연혁 탭 */}
      {activeTab === 'history' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
          <div className="flex justify-between items-start mb-8">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">정책연혁</h2>
            
            {/* 우측 드롭다운 필터 */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-[14px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                <span>{selectedYear === null ? '전체' : selectedYear}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10 max-h-48 overflow-y-auto">
                  <button
                    onClick={() => {
                      setSelectedYear(null);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-[14px] font-bold transition-colors ${
                      selectedYear === null
                        ? 'bg-brand-blue text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    전체
                  </button>
                  {years.map((year) => (
                    <button
                      key={year}
                      onClick={() => {
                        setSelectedYear(year);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-[14px] font-bold transition-colors ${
                        selectedYear === year
                          ? 'bg-brand-blue text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="max-w-4xl">
            {/* 2025년 */}
            {(selectedYear === null || selectedYear === 2025) && (
            <div className="relative">
              <div className="flex items-start gap-4 mb-8">
                <div className="w-20 h-12 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-black text-white">2025</span>
                </div>
                <div className="flex-1 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">10.15</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">주택시장 안정화 대책 발표, 규제지역 및 대출제한 강화</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">10.01</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">위반건축물 한시적 양성화 등 관리방안 발표</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">09.26</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">1기 신도시 정비사업 후속사업 본격 추진</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">09.07</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">새정부 주택공급 확대 방안, 2030년까지 수도권에 135만호 공급</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">08.28</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">지방 준공 후 미분양 주택, LH 매입물량 확대</div>
                  </div>
                </div>
                </div>
              </div>
            </div>
            )}

            {/* 2024년 */}
            {(selectedYear === null || selectedYear === 2024) && (
            <div className="relative mt-12">
              <div className="flex items-start gap-4 mb-8">
                <div className="w-20 h-12 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-black text-white">2024</span>
                </div>
                <div className="flex-1 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">12.30</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">수도권 서남권 광명, 시흥에 6.7만호 공급 추진</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">12.18</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">서울권3곳 도심 공공주택 복합지구 지정</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">11.26</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">노후공공임대을 고령화 친화주택으로 탈바꿈</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">11.19</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">25년 공시가격, 부동산 시세 변동만 반영</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">11.14</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">부동산PF제도 개선방안 수립</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">11.06</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">디딤돌대출 맞춤형 관리방안 시행</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">11.05</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">서울 2만호 포함, 수도권 신규택지 5만호 발표</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">10.24</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">1기 신도시 등 전국 노후계획도시 111곳 기틀 마련</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">10.16</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">생활숙박시설 기존 생숙 합법사용 지원</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">09.25</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">청약통장 금리인상, 월납입 인정금액 상향 등</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">09.12</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">부동산 공시가격 산정체계 합리화 방안</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">09.03</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">재건축·재개발 촉진 특례법 제정안 및 도시정비법 개정안 발의</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">08.30</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">주택공급, 주거복지, 사회변화 제3차 장기주거종합계획</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">08.14</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">노후계획도시정비 중동·산본 정비사업 밑그림 제시</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">08.13</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">과천에 신축 아파트 1만호 조기 공급</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">08.11</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">수도권 부동산 시장을 왜곡하는 가격 띄우기 등 불법행위 집중 조사</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">08.08</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">주택청약저축 보유 혜택 대폭 강화</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">08.08</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">서울·수도권 42.7만호 공급</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.31</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">수유 12지구 도심 공공주택 복합지구 지정</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.24</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">3기 신도시 남양주 왕숙 첫 공급 시작</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.23</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">규제 풀어 민간사업자 진입 촉진, 시니어 레지던스 대폭 확대</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">06.28</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">검단연장선 개통, '검단~서울역 38분'</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">06.27</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">가계부채 관리 강화 조치 발표, 수도권 중심</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">05.28</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">비아파트 6년 단기등기임대제 6월 4일 시행</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">05.26</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전세 계약 전 집주인 정보 사전 확인 가능</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">05.22</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">1기 신도시 올해 시범지구 2.6만호 이상 선정 계획 발표</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">05.16</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">인천 동암역 등 부천·경기 3곳 도심 공공주택 복합지구 지정</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">04.29</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">2024년 공동주택 공시가격 결정 및 발표</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">04.28</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">주택임대차계약 체결 시 30일 이내 신고 의무화</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">04.18</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">주택임대 신고제 유예기간 1년 연장</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">03.28</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">3기 신도시 인천계양 주택 첫 착공</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">03.19</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">강남 3구 및 용산구 확대 토지거래허가구역 지정</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">02.26</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">17개 접경도서 외국인 토지거래허가구역 지정</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">02.23</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">주택금융 매입 및 전세대출 금리 조정</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">02.21</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">청년 주거꿈 청약통장 2월 21일 출시</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">02.11</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">미신청 청약주택 무주택자 공급</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">01.22</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">민간 사전청약 취소 당첨자 전원 구제</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">01.20</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">주택법 시행령 개정, 도시형생활주택 면적 제한 완화</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">01.10</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">주택공급 확대 및 건설시장 보완 방안, 1기 신도시 재개발 및 단기등기임대 도입</div>
                  </div>
                </div>
                </div>
              </div>
            </div>
            )}

            {/* 2023년 */}
            {(selectedYear === null || selectedYear === 2023) && (
            <div className="relative mt-12">
              <div className="flex items-start gap-4 mb-8">
                <div className="w-20 h-12 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-black text-white">2023</span>
                </div>
                <div className="flex-1 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">12.07</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">서울 3곳 도심 공공주택 복합지구 신규 지정, 녹번역·사가정역·용마터널</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">11.30</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">저출산 극복 청약제도 개선, 신생아 특별공급 신설, 맞벌이 부부 소득·자녀 기준 완화, 결혼 불이익 방지</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">11.15</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전국 8만호 신규 주택 후보지 발표 ('23.9.26 주택공급 활성화 방안 후속조치)</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">11.08</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전세사기 예방 부동산중개업자 설명의무 강화 ('23.2.2 전세사기 예방 대책 후속조치)</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">10.16</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">주택공급 활성화 방안 입법예고, 무주택자 청약요건 완화 포함 ('23.9.26 주택공급 활성화 방안 후속조치)</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">10.05</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">신혼부부 주택구입 및 전세대출 소득요건 완화</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">09.27</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">가계부채 증가에 따른 주택담보대출 관리 강화 및 특별 보금자리론 공급 요건</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">09.26</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">주택공급 활성화 방안 발표</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.27</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">기획재정부 「2023년 세법개정안」 발표</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.26</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전세사기 예방 및 피해 지원방안 역전세 반환목적 대출 규제완화 시행</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.25</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전세사기 예방 및 피해 지원방안 청년 전세보증금반환보증 보증료 지원 사업 시행</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.24</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">공동주택(아파트) 실거래가 공개 시 등기정보 공개 적용</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.20</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">토지거래허가제도 정비 및 거래가격 거짓신고 과태료 상향추진</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.12</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전세사기 예방 및 피해 지원방안 민간임대주택에 관한 특별법 개정안 입법 예고 (임대보증금 미반환 임대사업자 명단 온라인 공개 등)</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.10</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">경기·인천 5곳 도심 공공주택 복합사업 예정지구 지정 ('21.2.4 대책 후속 사업)</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">07.04</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전세사기 예방 및 피해 지원방안 임대보증금반환보증 가입여부 임차인 안내 강화</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">06.20</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">수원시 서부권 5천호 규모 공공주택지구계획 승인</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">05.29</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전세사기 예방 및 피해 지원방안 전세사기 피해자 서울보증(SGI) 대환대출 출시</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">04.27</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전세사기 예방 및 피해 지원방안 관계부처 합동 전세사기 특별법 발표</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">04.07</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">은행업감독업무시행세칙 등 5개 시행세칙 개정 예고 - 오피스텔 담보대출 DSR 산정방식 개선</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">04.06</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전세사기 예방 및 피해 지원방안 전세사기 피해자가 주택을 낙찰받은 경우 청약관련 무주택 인정</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">03.02</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">은행업 감독규정 등 5개 규정 개정안 금융위원회 의결 - 다주택자 규제지역 내 주택담보대출 허용, 임차보증금 반환목적 주택담보대출 규제완화 등</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">02.02</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">전세사기 예방 및 피해 지원방안 발표</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">01.04</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">재건축 안전진단 기준 개정</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">01.03</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">부동산 시장 정상화 방안 「23년도 국토부 업무계획」 발표 - 강남 3구(강남·서초·송파) 및 용산구 외 투기지역 전면 해제</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">12.21</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">정부 「2023년 경제정책방향」 발표(세제, 청약, 대출 규제 완화 등)</div>
                  </div>
                </div>
                </div>
              </div>
            </div>
            )}

            {/* 2022년 */}
            {(selectedYear === null || selectedYear === 2022) && (
            <div className="relative mt-12">
              <div className="flex items-start gap-4 mb-8">
                <div className="w-20 h-12 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-black text-white">2022</span>
                </div>
                <div className="flex-1 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">11.14</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">서울 및 연집 4곳 외 규제지역 전면 해제</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">10.26</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">청년·서민 내집마련 기회 확대, 공공분양 50만호 공급 발표</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">09.26</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">지방 광역시·도 조정대상지역 전면 해제</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">08.16</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">국민 주거안정 실현방안 발표</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                    <div className="w-0.5 h-full bg-slate-300 dark:bg-slate-600 min-h-[60px]"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">06.21</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">분양가 상한제 등 합리화로 주택공급 촉진</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-brand-blue"></div>
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-1">12.27</div>
                    <div className="text-[14px] text-slate-700 dark:text-slate-300">22년도 부동산 시장 안정방안 발표</div>
                  </div>
                </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* 3기 신도시 탭 */}
      {activeTab === 'newtown' && (
        <div className="space-y-8">
          {/* 배경 섹션 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-full text-[14px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                배경
              </span>
            </div>
            <div className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed space-y-3">
              <p>
                정부는 2017년부터 주택시장 안정화를 위한 부동산 대책을 발표하기 시작했습니다.
              </p>
              <p>
                주택 수요를 충족하기 위해 3기 신도시 개발을 포함한 다양한 공급 대책을 발표했으며, 
                해당 지역 선정은 2단계로 나누어 완료되었습니다.
              </p>
            </div>
            <div className="mt-4">
              <a
                href="https://www.lh.or.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-[14px] font-bold hover:bg-blue-600 transition-colors"
              >
                3기 신도시 공식 홈페이지
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* 일정 섹션 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-full text-[14px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                일정
              </span>
            </div>
            <div className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed space-y-3">
              <p>
                지구지정→지구계획수립, 토지보상→사전청약→사업승인과착공→본청약→입주 순으로 진행됩니다.
              </p>
              <p>
                현재 지구지정은 완료되었으며, 지구계획수립 및 토지보상 절차가 진행 중입니다.
              </p>
            </div>
          </div>

          {/* 지역현황 섹션 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <span className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-full text-[14px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                지역현황
              </span>
            </div>

            <div className="max-h-[600px] overflow-y-auto space-y-4 pr-2">
              {/* 남양주 왕숙 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">남양주 왕숙</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 남양주왕숙 공공주택지구</p>
                  <p><strong>면적:</strong> 9,376,908㎡ | <strong>사업시행기간:</strong> 2019년~2028년 | <strong>주택계획:</strong> 5.4만 호</p>
                  <p><strong>위치:</strong> 경기도 남양주시 진접읍 연평리, 내곡리, 내각리, 진건읍 신월리, 진관리, 사능리, 퇴계원읍 퇴계원리 일원</p>
                  <p><strong>사업시행자:</strong> 경기도, 한국토지주택공사, 경기도주택도시공사</p>
                </div>
              </div>

              {/* 남양주 왕숙2 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">남양주 왕숙2</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 남양주왕숙2 공공주택지구</p>
                  <p><strong>면적:</strong> 2,393,384.58㎡ | <strong>사업시행기간:</strong> 2019년~2028년 | <strong>주택계획:</strong> 1.4만 호</p>
                  <p><strong>위치:</strong> 경기도 남양주시 일패동, 이패동 일원</p>
                  <p><strong>사업시행자:</strong> 경기도, 한국토지주택공사, 경기도주택도시공사, 남양주도시공사</p>
                </div>
              </div>

              {/* 하남 교산 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">하남 교산</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 하남교산 공공주택지구</p>
                  <p><strong>면적:</strong> 6,862,463㎡ | <strong>사업시행기간:</strong> 2019년~2028년 | <strong>주택계획:</strong> 3.3만 호</p>
                  <p><strong>위치:</strong> 경기도 하남시 천현동, 항동, 하사창동 교산동, 상사창동, 춘궁동, 덕풍동, 창우동, 신장동 일원</p>
                  <p><strong>사업시행자:</strong> 경기도, 한국토지주택공사, 경기도주택도시공사, 하남도시공사</p>
                </div>
              </div>

              {/* 인천 계양 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">인천 계양</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 인천계양 공공주택지구</p>
                  <p><strong>면적:</strong> 3,331,714㎡ | <strong>사업시행기간:</strong> 2019년~2026년 | <strong>주택계획:</strong> 1.7만 호</p>
                  <p><strong>위치:</strong> 인천광역시 계양구 귤현동, 동양동, 박촌동, 병방동, 상야동 일원</p>
                  <p><strong>사업시행자:</strong> 인천광역시, 한국토지주택공사, 인천도시공사</p>
                </div>
              </div>

              {/* 고양 창릉 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">고양 창릉</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 고양창릉 공공주택지구</p>
                  <p><strong>면적:</strong> 7,890,019㎡ | <strong>사업시행기간:</strong> 2020년~2029년 | <strong>주택계획:</strong> 3.6만 호</p>
                  <p><strong>위치:</strong> 경기도 고양시 덕양구 원흥동, 동산동, 용두동, 향동동, 화전동, 도내동, 행신동, 화정동, 성사동 일원</p>
                  <p><strong>사업시행자:</strong> 경기도, 한국토지주택공사, 경기주택도시공사, 고양도시관리공사</p>
                </div>
              </div>

              {/* 부천 대장 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">부천 대장</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 부천대장 공공주택지구</p>
                  <p><strong>면적:</strong> 3,419,544㎡ | <strong>사업시행기간:</strong> 2020년~2029년 | <strong>주택계획:</strong> 1.9만 호</p>
                  <p><strong>위치:</strong> 경기도 부천시 대장동, 오정동, 원종동, 삼정동 일원</p>
                  <p><strong>사업시행자:</strong> 경기도, 한국토지주택공사, 부천도시공사</p>
                </div>
              </div>

              {/* 광명 시흥 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">광명 시흥</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 광명시흥 공공주택지구</p>
                  <p><strong>면적:</strong> 1,271만㎡ | <strong>사업시행기간:</strong> 2022년~2031년 | <strong>주택계획:</strong> 7만 호</p>
                  <p><strong>위치:</strong> 경기도 광명시 광명동, 옥길동, 노온사동, 가학동 및 시흥시 과림동, 무지내동, 금이동 일원</p>
                  <p><strong>사업시행자:</strong> 한국토지주택공사</p>
                </div>
              </div>

              {/* 의왕·군포·안산 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">의왕·군포·안산</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 의왕·군포·안산 공공주택지구</p>
                  <p><strong>면적:</strong> 586만㎡ | <strong>사업시행기간:</strong> 미정 | <strong>주택계획:</strong> 4.1만 호</p>
                  <p><strong>위치:</strong> 경기도 의왕시 초평동, 월암동, 삼동, 군포시 도마교동, 부곡동, 대야미동, 안산시 건건동, 사사동 일원</p>
                  <p><strong>사업시행자:</strong> 한국토지주택공사</p>
                </div>
              </div>

              {/* 화성 진안 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">화성 진안</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 화성진안 공공주택지구</p>
                  <p><strong>면적:</strong> 452만㎡ | <strong>사업시행기간:</strong> 미정 | <strong>주택계획:</strong> 2.9만 호</p>
                  <p><strong>위치:</strong> 경기도 화성시 진안동, 반정동, 반월동, 기산동 일원</p>
                  <p><strong>사업시행자:</strong> 한국토지주택공사</p>
                </div>
              </div>

              {/* 안산 장상 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">안산 장상</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 안산장상 공공주택지구</p>
                  <p><strong>면적:</strong> 2,213,319㎡ | <strong>사업시행기간:</strong> 2020년~2027년 | <strong>주택계획:</strong> 1.5만 호</p>
                  <p><strong>위치:</strong> 경기도 안산시 상록구 장상동, 장하동, 수암동, 부곡동, 양상동 일원</p>
                  <p><strong>사업시행자:</strong> 경기도, 한국토지주택공사, 경기주택도시공사, 안산도시공사</p>
                </div>
              </div>

              {/* 과천 과천 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">과천 과천</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 과천과천 공공주택지구</p>
                  <p><strong>면적:</strong> 1,555,496㎡ | <strong>사업시행기간:</strong> 2019년~2025년 | <strong>주택계획:</strong> 7천 호</p>
                  <p><strong>위치:</strong> 경기도 과천시 과천동, 주암동, 맥계동 일원</p>
                  <p><strong>사업시행자:</strong> 경기도, 한국토지주택공사, 경기주택도시공사, 과천도시공사</p>
                </div>
              </div>

              {/* 인천 구월2 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">인천 구월2</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 인천구월2 공공주택지구</p>
                  <p><strong>면적:</strong> 220만㎡ | <strong>사업시행기간:</strong> 미정 | <strong>주택계획:</strong> 1.8만 호</p>
                  <p><strong>위치:</strong> 인천광역시 남동구 구월동, 남촌동, 수산동 및 연수구 선학동, 미추홀구 관교동, 문학동 일원</p>
                  <p><strong>사업시행자:</strong> 인천도시공사</p>
                </div>
              </div>

              {/* 화성 봉담3 */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">화성 봉담3</h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p><strong>지구명:</strong> 화성봉담3 공공주택지구</p>
                  <p><strong>면적:</strong> 229만㎡ | <strong>사업시행기간:</strong> 미정 | <strong>주택계획:</strong> 1.7만 호</p>
                  <p><strong>위치:</strong> 경기도 화성시 봉담읍 상리, 수영리 일원</p>
                  <p><strong>사업시행자:</strong> 한국토지주택공사</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GovernmentPolicy;
