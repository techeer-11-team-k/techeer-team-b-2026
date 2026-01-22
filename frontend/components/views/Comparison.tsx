import React, { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, X, Plus, Building2, Car, Calendar, MapPin, ChevronUp, Filter, Check, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend, LabelList } from 'recharts';
import { ToggleButtonGroup } from '../ui/ToggleButtonGroup';
import { ApartmentRow } from '../ui/ApartmentRow';
import { fetchCompareApartments, fetchPyeongPrices, fetchTrendingApartments, searchApartments } from '../../services/api';

const ASSET_COLORS: Record<string, string> = {
  '압구정 현대': '#1E88E5', // Blue
  '반포 아크로': '#FFC107', // Amber
  '성수 트리마제': '#43A047', // Green
  '잠실 엘스': '#E53935',   // Red
  '마포 래미안': '#8E24AA', // Purple
};

const SUBWAY_LINE_COLORS: Record<string, string> = {
  '1호선': '#0052A4',
  '2호선': '#00A84D',
  '3호선': '#EF7C1C',
  '4호선': '#00A5DE',
  '5호선': '#996CAC',
  '6호선': '#CD7C2F',
  '7호선': '#747F00',
  '8호선': '#E6186C',
  '9호선': '#BDB092',
  '신분당선': '#D4003B',
};

interface AssetData {
    id: number;
    aptId?: number;
    name: string;
    region: string;
    price: number; 
    jeonse: number;
    gap: number;
    color: string;
    pricePerPyeong?: number; // 평당가 (억)
    jeonseRate?: number; // 전세가율 (%)
    households?: number; // 세대수
    parkingSpaces?: number; // 주차공간 (세대당)
    nearestSubway?: string; // 지하철역
    walkingTime?: number; // 도보시간 (분)
    buildYear?: number; // 건축연도
    pyeongType?: string; // 평형 (예: "32평형")
    area?: number; // 전용면적 (m²)
    subwayStation?: string;
    walkingTimeText?: string;
    schools?: {
        elementary: { name: string }[];
        middle: { name: string }[];
        high: { name: string }[];
    };
}

interface PyeongOption {
    pyeongType: string;
    area: number;
    price: number;
    jeonse: number;
    pricePerPyeong?: number;
    jeonseRate?: number;
}

const MAX_COMPARE = 5;
const COLOR_PALETTE = ['#1E88E5', '#FFC107', '#43A047', '#E53935', '#8E24AA'];

// 색상을 어둡게 만드는 함수
const darkenColor = (color: string, amount: number = 0.3): string => {
    // HEX 색상을 RGB로 변환
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // 어둡게 만들기
    const newR = Math.floor(r * (1 - amount));
    const newG = Math.floor(g * (1 - amount));
    const newB = Math.floor(b * (1 - amount));
    
    // RGB를 다시 HEX로 변환
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
};

const generateChartData = (assets: AssetData[], filter: string) => {
    return assets.map(asset => {
        let value: number;
        let label: string;
        let jeonseValue: number | undefined;
        
        switch(filter) {
            case '평당가':
                value = asset.pricePerPyeong || 0;
                label = '평당가';
                break;
            case '전세가율':
                value = asset.jeonseRate || 0;
                label = '전세가율';
                break;
            case '세대수':
                value = asset.households || 0;
                label = '세대수';
                break;
            case '주차공간':
                value = asset.parkingSpaces || 0;
                label = '주차공간';
                break;
            case '건축연도':
                value = asset.buildYear || 0;
                label = '건축연도';
                break;
            case '매매가':
            default:
                value = asset.price;
                label = '매매가';
                jeonseValue = asset.jeonse; // 매매가일 때만 전세가 추가
                break;
        }
        
        return {
            name: asset.name,
            value: value,
            jeonse: jeonseValue,
            label: label,
            color: asset.color,
            darkerColor: darkenColor(asset.color, 0.25)
        };
    });
};

const getWalkingTimeRange = (minutes?: number): string => {
    if (!minutes) return '-';
    if (minutes <= 5) return '5분 이내';
    if (minutes <= 10) return '5~10분 이내';
    if (minutes <= 15) return '10~15분 이내';
    return '15분 이상';
};

const parseWalkingTimeMinutes = (text?: string): number | undefined => {
    if (!text) return undefined;
    const matches = text.match(/\d+/g);
    if (!matches) return undefined;
    return Math.max(...matches.map((val) => parseInt(val, 10)));
};


// SearchAndSelectApart 컴포넌트
interface SearchAndSelectApartProps {
    isOpen: boolean;
    onClose: () => void;
    onAddAsset: (asset: AssetData, pyeongOption: PyeongOption) => void;
    existingAssets: AssetData[];
}

const SearchAndSelectApart: React.FC<SearchAndSelectApartProps> = ({ 
    isOpen, 
    onClose, 
    onAddAsset,
    existingAssets 
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAssetForPyeong, setSelectedAssetForPyeong] = useState<AssetData | null>(null);
    const [searchAssets, setSearchAssets] = useState<AssetData[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [pyeongOptions, setPyeongOptions] = useState<PyeongOption[]>([]);
    const [isPyeongLoading, setIsPyeongLoading] = useState(false);
    const [searchLimit, setSearchLimit] = useState(15);
    const [hasMoreResults, setHasMoreResults] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    
    const filteredAvailableAssets = searchAssets.filter(asset => {
        const isNotAdded = !existingAssets.some(a => a.aptId === asset.aptId);
        return isNotAdded;
    });

    const enrichSearchAssets = async (query: string, limit: number = 15): Promise<{ assets: AssetData[], hasMore: boolean }> => {
        const response = await searchApartments(query, limit);
        const results = response.data.results;
        const aptIds = results.map((item) => item.apt_id);
        const compareMap = new Map<number, any>();
        
        // API 호출 시 에러 처리 강화
        for (let i = 0; i < aptIds.length; i += MAX_COMPARE) {
            const chunk = aptIds.slice(i, i + MAX_COMPARE);
            if (!chunk.length) continue;
            try {
                const compare = await fetchCompareApartments(chunk);
                if (compare?.apartments) {
                    compare.apartments.forEach((item) => compareMap.set(item.id, item));
                }
            } catch (err) {
                console.warn(`Compare API failed for chunk ${i}:`, err);
                // 에러가 발생해도 계속 진행
            }
        }
        
        const assets = results.map((item, index) => {
            const compareItem = compareMap.get(item.apt_id);
            const price = compareItem?.price ?? 0;
            const jeonse = compareItem?.jeonse ?? 0;
            const walkingTimeText = compareItem?.subway?.walking_time;
            
            return {
                id: item.apt_id,
                aptId: item.apt_id,
                name: compareItem?.name ?? item.apt_name,
                region: compareItem?.region ?? item.address ?? '',
                price: price,
                jeonse: jeonse,
                gap: price - jeonse,
                color: COLOR_PALETTE[index % COLOR_PALETTE.length],
                pricePerPyeong: compareItem?.price_per_pyeong ?? undefined,
                jeonseRate: compareItem?.jeonse_rate ?? undefined,
                households: compareItem?.households ?? undefined,
                parkingSpaces: compareItem?.parking_per_household ?? undefined,
                nearestSubway: compareItem?.subway?.line ?? undefined,
                subwayStation: compareItem?.subway?.station ?? undefined,
                walkingTimeText,
                walkingTime: parseWalkingTimeMinutes(walkingTimeText),
                buildYear: compareItem?.build_year ?? undefined,
                schools: compareItem?.schools ?? { elementary: [], middle: [], high: [] }
            } as AssetData;
        });
        
        // 결과가 limit보다 적으면 더 이상 없음
        return { assets, hasMore: results.length >= limit };
    };
    
    // 모달 외부 클릭 및 ESC 키 감지
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                handleClose();
            }
        };
        
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                handleClose();
            }
        };
        
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const query = searchQuery.trim();
        if (query.length < 2) {
            setSearchAssets([]);
            setSearchError(null);
            setHasMoreResults(false);
            return;
        }
        let isActive = true;
        // 새 검색어 입력 시 limit 초기화
        setSearchLimit(15);
        const timer = setTimeout(async () => {
            try {
                setIsSearching(true);
                const { assets, hasMore } = await enrichSearchAssets(query, 15);
                if (!isActive) return;
                setSearchAssets(assets);
                setHasMoreResults(hasMore);
                setSearchError(null);
            } catch (error) {
                if (!isActive) return;
                setSearchError(error instanceof Error ? error.message : '검색 중 오류가 발생했습니다.');
                setSearchAssets([]);
                setHasMoreResults(false);
            } finally {
                if (isActive) setIsSearching(false);
            }
        }, 300);
        
        return () => {
            isActive = false;
            clearTimeout(timer);
        };
    }, [searchQuery, isOpen]);
    
    const handleLoadMore = async () => {
        const query = searchQuery.trim();
        if (query.length < 2 || isLoadingMore) return;
        
        setIsLoadingMore(true);
        try {
            const newLimit = searchLimit + 15;
            const { assets, hasMore } = await enrichSearchAssets(query, newLimit);
            setSearchAssets(assets);
            setSearchLimit(newLimit);
            setHasMoreResults(hasMore);
        } catch (error) {
            console.error('더 보기 실패:', error);
        } finally {
            setIsLoadingMore(false);
        }
    };
    
    const handleClose = () => {
        setSearchQuery('');
        setSelectedAssetForPyeong(null);
        setSearchAssets([]);
        setSearchError(null);
        setPyeongOptions([]);
        setIsPyeongLoading(false);
        onClose();
    };
    
    const handleBackToAssetList = () => {
        setSelectedAssetForPyeong(null);
        setPyeongOptions([]);
        setIsPyeongLoading(false);
    };

    const handleSelectForPyeong = async (asset: AssetData) => {
        setSelectedAssetForPyeong(asset);
        setIsPyeongLoading(true);
        setPyeongOptions([]);
        try {
            const aptId = asset.aptId ?? asset.id;
            const response = await fetchPyeongPrices(aptId);
            const options = response.pyeong_options.map((option) => {
                const price = option.recent_sale?.price ?? asset.price ?? 0;
                const jeonse = option.recent_jeonse?.price ?? asset.jeonse ?? 0;
                return {
                    pyeongType: option.pyeong_type,
                    area: option.area_m2,
                    price,
                    jeonse,
                    pricePerPyeong: option.recent_sale?.price_per_pyeong ?? asset.pricePerPyeong,
                    jeonseRate: option.recent_jeonse && price
                        ? Math.round((jeonse / price) * 1000) / 10
                        : asset.jeonseRate
                } as PyeongOption;
            });
            setPyeongOptions(options);
        } catch (error) {
            setPyeongOptions([]);
        } finally {
            setIsPyeongLoading(false);
        }
    };
    
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div 
                ref={modalRef}
                className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col animate-fade-in"
            >
                {/* 모달 헤더 */}
                <div className="p-6 border-b border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-2xl font-black text-slate-900">아파트 추가</h3>
                        <button
                            onClick={handleClose}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                    
                    {/* 검색창 */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="아파트 이름 또는 지역으로 검색..."
                            className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-[15px] font-medium"
                            autoFocus
                        />
                    </div>
                </div>
                
                {/* 아파트 목록 또는 평형 선택 */}
                <div className="flex-1 overflow-y-auto p-4">
                    {selectedAssetForPyeong ? (
                        /* 평형 선택 화면 */
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 mb-6">
                                <button
                                    onClick={handleBackToAssetList}
                                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    <ChevronUp className="w-5 h-5 text-slate-600 rotate-[-90deg]" />
                                </button>
                                <div>
                                    <h4 className="text-lg font-black text-slate-900">{selectedAssetForPyeong.name}</h4>
                                    <p className="text-[13px] text-slate-500 font-medium">{selectedAssetForPyeong.region}</p>
                                </div>
                            </div>
                            
                            <div>
                                <p className="text-[13px] font-bold text-slate-600 uppercase tracking-wide mb-3 px-1">평형 선택</p>
                                {isPyeongLoading ? (
                                    <div className="p-6 text-center text-[13px] text-slate-500 font-medium">
                                        평형 정보를 불러오는 중...
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {pyeongOptions.length === 0 ? (
                                            <div className="p-6 text-center text-[13px] text-slate-500 font-medium">
                                                평형 정보를 찾을 수 없습니다.
                                            </div>
                                        ) : (
                                            pyeongOptions.map((pyeongOption, index) => (
                                                <button
                                                    key={index}
                                                    onClick={() => onAddAsset(selectedAssetForPyeong, pyeongOption)}
                                                    className="w-full p-5 border-2 border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-left group"
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div>
                                                            <h5 className="text-[18px] font-black text-slate-900 mb-1">
                                                                {pyeongOption.pyeongType}
                                                            </h5>
                                                            <p className="text-[13px] text-slate-500 font-medium">
                                                                전용면적 {pyeongOption.area}m²
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[20px] font-black text-slate-900 mb-1">
                                                                {pyeongOption.price}억
                                                            </p>
                                                            <p className="text-[13px] text-slate-500 font-medium">
                                                                평당 {(pyeongOption.pricePerPyeong ?? 0).toFixed(2)}억
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4 pt-3 border-t border-slate-100">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[12px] text-slate-500 font-medium">전세가</span>
                                                            <span className="text-[14px] font-bold text-slate-700">{pyeongOption.jeonse}억</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[12px] text-slate-500 font-medium">전세가율</span>
                                                            <span className="text-[14px] font-bold text-slate-700">
                                                                {(pyeongOption.jeonseRate ?? 0).toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* 아파트 목록 화면 */
                        <>
                            {searchQuery.trim().length < 2 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                    <Search className="w-12 h-12 text-slate-300 mb-3" />
                                    <p className="text-slate-500 font-medium">
                                        아파트 이름 또는 지역을 2글자 이상 입력하세요
                                    </p>
                                </div>
                            ) : isSearching ? (
                                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                    <Sparkles className="w-12 h-12 text-slate-300 mb-3" />
                                    <p className="text-slate-500 font-medium">
                                        검색 중...
                                    </p>
                                </div>
                            ) : searchError ? (
                                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                    <X className="w-12 h-12 text-slate-300 mb-3" />
                                    <p className="text-slate-500 font-medium">
                                        {searchError}
                                    </p>
                                </div>
                            ) : filteredAvailableAssets.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                    <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                                    <p className="text-slate-500 font-medium">
                                        검색 결과가 없습니다
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredAvailableAssets.map((asset) => (
                                        <button
                                            key={asset.id}
                                            onClick={() => handleSelectForPyeong(asset)}
                                            className="w-full p-4 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-left group"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div 
                                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: asset.color }}
                                                    />
                                                    <div>
                                                        <h4 className="text-[16px] font-black text-slate-900 mb-0.5">
                                                            {asset.name}
                                                        </h4>
                                                        <p className="text-[13px] text-slate-500 font-medium">
                                                            {asset.region} · {asset.nearestSubway || '-'} · {asset.walkingTimeText || getWalkingTimeRange(asset.walkingTime)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[17px] font-black text-slate-900 mb-0.5">
                                                        {asset.price}억
                                                    </p>
                                                    <p className="text-[12px] text-slate-500 font-medium">
                                                        평당 {asset.pricePerPyeong?.toFixed(2)}억
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                    
                                    {/* 더 보기 버튼 또는 완료 메시지 */}
                                    {hasMoreResults ? (
                                        <button
                                            onClick={handleLoadMore}
                                            disabled={isLoadingMore}
                                            className="w-full mt-4 py-3 px-4 border-2 border-dashed border-slate-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50/30 transition-all text-center disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isLoadingMore ? (
                                                <span className="flex items-center justify-center gap-2 text-slate-500 font-bold">
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                    불러오는 중...
                                                </span>
                                            ) : (
                                                <span className="flex items-center justify-center gap-2 text-indigo-600 font-bold">
                                                    <Plus className="w-4 h-4" />
                                                    더 보기 ({filteredAvailableAssets.length}개 표시 중)
                                                </span>
                                            )}
                                        </button>
                                    ) : filteredAvailableAssets.length > 0 && (
                                        <div className="w-full mt-4 py-3 px-4 bg-slate-50 rounded-xl text-center">
                                            <span className="flex items-center justify-center gap-2 text-slate-500 font-medium text-[13px]">
                                                <Check className="w-4 h-4 text-green-500" />
                                                검색이 모두 완료되었습니다 ({filteredAvailableAssets.length}개)
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
                
                {/* 모달 푸터 */}
                <div className="p-4 border-t border-slate-200 bg-slate-50/50">
                    <p className="text-[13px] text-slate-500 text-center font-medium">
                        최대 5개까지 추가 가능 ({existingAssets.length}/5)
                    </p>
                </div>
            </div>
        </div>
    );
};

export const Comparison: React.FC = () => {
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [comparisonMode, setComparisonMode] = useState<'1:1' | 'multi'>('multi');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([
    '매매가', '평당가', '전세가율', '세대수', '주차공간', '지하철역', '도보시간', '건축연도'
  ]);
  const [chartDisplayFilter, setChartDisplayFilter] = useState<string>('매매가');
  const [hoveredBarType, setHoveredBarType] = useState<'value' | 'jeonse' | null>(null);
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [showAddAssetModal, setShowAddAssetModal] = useState(false);
  const [schoolTab, setSchoolTab] = useState<'elementary' | 'middle' | 'high'>('elementary');
  
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  
  const chartData = generateChartData(assets, chartDisplayFilter);
  
  const availableFilters = [
    '매매가', '평당가', '전세가율', '세대수', '주차공간', '지하철역', '도보시간', '건축연도'
  ];
  
  const numericFilters = ['매매가', '평당가', '전세가율', '세대수', '주차공간', '건축연도'];
  
  const toggleFilter = (filter: string) => {
    setSelectedFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };
  
  const handleChartFilterChange = (filter: string) => {
    setChartDisplayFilter(filter);
  };

  const mapCompareToAssets = (items: any[]) => {
    return items.map((item, index) => {
      const price = item.price ?? 0;
      const jeonse = item.jeonse ?? 0;
      const walkingTimeText = item.subway?.walking_time;
      
      return {
        id: item.id,
        aptId: item.id,
        name: item.name,
        region: item.region || '',
        price,
        jeonse,
        gap: price - jeonse,
        color: COLOR_PALETTE[index % COLOR_PALETTE.length],
        pricePerPyeong: item.price_per_pyeong ?? undefined,
        jeonseRate: item.jeonse_rate ?? undefined,
        households: item.households ?? undefined,
        parkingSpaces: item.parking_per_household ?? undefined,
        nearestSubway: item.subway?.line ?? undefined,
        subwayStation: item.subway?.station ?? undefined,
        walkingTimeText,
        walkingTime: parseWalkingTimeMinutes(walkingTimeText),
        buildYear: item.build_year ?? undefined,
        schools: item.schools ?? { elementary: [], middle: [], high: [] }
      } as AssetData;
    });
  };

  const loadInitialAssets = async () => {
    try {
      const trending = await fetchTrendingApartments(MAX_COMPARE);
      const aptIds = trending.data.apartments.map((apt) => apt.apt_id);
      if (!aptIds.length) {
        setAssets([]);
        return;
      }
      const compare = await fetchCompareApartments(aptIds.slice(0, MAX_COMPARE));
      const mapped = mapCompareToAssets(compare.apartments);
      setAssets(mapped);
    } catch (error) {
      setAssets([]);
    }
  };

  useEffect(() => {
    loadInitialAssets();
  }, []);
  
  // 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    
    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterDropdown]);

  const handleRemoveAsset = (id: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setAssets(prev => prev.filter(a => a.id !== id));
      if (selectedAssetId === id) setSelectedAssetId(null);
  };

  const handleAssetClick = (id: number) => {
      setSelectedAssetId(prev => prev === id ? null : id);
  };
  
  const handleAddAssetWithPyeong = (asset: AssetData, pyeongOption: PyeongOption) => {
    if (assets.length < MAX_COMPARE) {
      const newAsset: AssetData = {
        ...asset,
        id: Date.now(), // 고유 ID 생성
        aptId: asset.aptId ?? asset.id,
        name: `${asset.name} ${pyeongOption.pyeongType}`,
        price: pyeongOption.price,
        jeonse: pyeongOption.jeonse,
        pricePerPyeong: pyeongOption.pricePerPyeong ?? asset.pricePerPyeong,
        pyeongType: pyeongOption.pyeongType,
        area: pyeongOption.area,
        jeonseRate: pyeongOption.jeonseRate ?? asset.jeonseRate,
      };
      
      setAssets(prev => [...prev, newAsset]);
      setShowAddAssetModal(false);
    }
  };

  const ComparisonCard = ({ title, price, sub, color, onChangeClick }: { title: string, price: string, sub: string, color: string, onChangeClick?: () => void }) => (
      <div className="flex-1 p-8 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-colors relative">
          <div className="flex items-start justify-between mb-6">
              <div className={`p-3 rounded-xl ${color === 'blue' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  <Building2 className="w-6 h-6" />
              </div>
              <button 
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-[13px] font-bold"
                  onClick={onChangeClick}
              >
                  <RefreshCw className="w-4 h-4" />
                  변경
              </button>
          </div>
          <h3 className="text-2xl font-black text-slate-900 mb-1">{title}</h3>
          <p className="text-[15px] font-medium text-slate-500 mb-6">{sub}</p>
          <div className="text-4xl font-black text-slate-900 tracking-tight tabular-nums">{price}</div>
      </div>
  );

  const StatRow = ({ label, left, right, unit }: { label: string, left: string, right: string, unit: string }) => {
      // 숫자로 변환하여 비교 (쉼표 제거)
      const leftNumRaw = parseFloat(left.replace(/,/g, ''));
      const rightNumRaw = parseFloat(right.replace(/,/g, ''));
      const leftNum = Number.isNaN(leftNumRaw) ? 0 : leftNumRaw;
      const rightNum = Number.isNaN(rightNumRaw) ? 0 : rightNumRaw;
      const isLeftHigher = leftNum > rightNum;
      const isRightHigher = rightNum > leftNum;
      
      // 막대 그래프를 위한 비율 계산
      let maxValue = Math.max(leftNum, rightNum);
      let leftValue = leftNum;
      let rightValue = rightNum;
      
      // 입주년도의 경우 2000년대 기준으로 계산 (23년 기준)
      if (label === '입주년도') {
          maxValue = 23; // 2023년 기준
          leftValue = leftNum - 2000;
          rightValue = rightNum - 2000;
      }
      
      const leftPercentage = maxValue > 0 ? (leftValue / maxValue) * 100 : 0;
      const rightPercentage = maxValue > 0 ? (rightValue / maxValue) * 100 : 0;
      
      return (
          <div className="flex flex-col pt-8 pb-5 border-b border-slate-50 last:border-0 hover:bg-slate-50 px-6 transition-colors">
              {/* 값 표시 행 */}
              <div className="flex items-center justify-between mb-3" style={{ marginTop: '10px' }}>
                  <span className={`font-bold tabular-nums flex-1 text-left text-2xl flex items-center justify-start gap-1 ${isLeftHigher ? 'text-red-500' : 'text-slate-900'}`}>
                      {left}
                      <span className={`font-bold text-2xl -ml-1 ${isLeftHigher ? 'text-red-500' : 'text-slate-900'}`}>{unit}</span>
                      {isLeftHigher && <ChevronUp className="w-5 h-5 text-red-500" />}
                  </span>
                  <span className="text-lg font-black text-slate-400 flex-1 text-center uppercase tracking-wide">{label}</span>
                  <span className={`font-bold tabular-nums flex-1 text-right text-2xl flex items-center justify-end gap-1 ${isRightHigher ? 'text-red-500' : 'text-slate-900'}`}>
                      {isRightHigher && <ChevronUp className="w-5 h-5 text-red-500" />}
                      {right}
                      <span className={`font-bold text-2xl -ml-1 ${isRightHigher ? 'text-red-500' : 'text-slate-900'}`}>{unit}</span>
                  </span>
              </div>
              
              {/* 막대 그래프 */}
              <div className="flex items-center justify-center gap-2">
                  {/* 왼쪽 막대 - 오른쪽에서 왼쪽으로 채워짐 (빈 부분이 바깥쪽) */}
                  <div className="w-1/6 h-2 bg-slate-200 rounded-full overflow-hidden flex justify-end">
                      <div 
                          className={`h-full transition-all duration-500 ${isLeftHigher ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${leftPercentage}%` }}
                      />
                  </div>
                  
                  {/* 중앙 점 */}
                  <div className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
                  
                  {/* 오른쪽 막대 - 왼쪽에서 오른쪽으로 채워짐 (빈 부분이 바깥쪽) */}
                  <div className="w-1/6 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                          className={`h-full transition-all duration-500 ${isRightHigher ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${rightPercentage}%` }}
                      />
                  </div>
              </div>
          </div>
      );
  };

  const leftAsset = assets[0];
  const rightAsset = assets[1];
  
  const formatValue = (value?: number | string | null, fallback: string = '-') => {
      if (value === null || value === undefined || value === '') return fallback;
      return String(value);
  };

  const formatNumberValue = (value?: number | null, digits = 1) => {
      if (value === null || value === undefined) return '-';
      return value.toFixed(digits);
  };

  const getSchoolList = (asset: AssetData | undefined, tab: 'elementary' | 'middle' | 'high') => {
      if (!asset?.schools) return [];
      return asset.schools[tab] || [];
  };

  return (
    <div className="pb-32 animate-fade-in px-4 md:px-0 pt-10">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
          <div>
              <h1 className="text-3xl font-black text-slate-900 mb-2">아파트 비교 분석</h1>
              <p className="text-slate-500 text-[15px] font-medium">관심 있는 단지들의 가격 구조와 투자 가치를 입체적으로 비교하세요.</p>
          </div>
          
          <ToggleButtonGroup
              options={['1:1 정밀 비교', '다수 아파트 분석']}
              value={comparisonMode === '1:1' ? '1:1 정밀 비교' : '다수 아파트 분석'}
              onChange={(value) => setComparisonMode(value === '1:1 정밀 비교' ? '1:1' : 'multi')}
          />
      </div>

      {comparisonMode === '1:1' ? (
          <div className="animate-fade-in space-y-10">
              {/* 1:1 Layout */}
              <div className="relative">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                       <ComparisonCard 
                           title={leftAsset?.name || '비교 대상 선택'}
                           sub={leftAsset?.region || '아파트를 선택하세요'}
                           price={leftAsset ? `${formatNumberValue(leftAsset.price, 1)}억` : '-'} 
                           color="blue"
                           onChangeClick={() => setShowAddAssetModal(true)}
                       />
                       <ComparisonCard 
                           title={rightAsset?.name || '비교 대상 선택'}
                           sub={rightAsset?.region || '아파트를 선택하세요'}
                           price={rightAsset ? `${formatNumberValue(rightAsset.price, 1)}억` : '-'} 
                           color="emerald"
                           onChangeClick={() => setShowAddAssetModal(true)}
                       />
                   </div>
                   <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-slate-200 -ml-px"></div>
              </div>

              {/* Analysis Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative">
                   <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-slate-200 -ml-px z-0"></div>
                   
                   <div className="bg-white rounded-2xl border border-slate-200 p-8 z-10 relative hover:border-slate-300 transition-colors">
                       <h3 className="font-black text-slate-900 text-lg mb-6">핵심 강점</h3>
                       <ul className="space-y-5">
                           <li className="flex items-start gap-4">
                               <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-[12px]">✓</div>
                               <span className="text-[15px] font-bold text-slate-700">1,378세대 더 많은 대단지 프리미엄</span>
                           </li>
                           <li className="flex items-start gap-4">
                               <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-[12px]">✓</div>
                               <span className="text-[15px] font-bold text-slate-700">7년 더 신축 아파트 (2023년 준공)</span>
                           </li>
                       </ul>
                   </div>

                   <div className="bg-white rounded-2xl border border-slate-200 p-8 z-10 relative hover:border-slate-300 transition-colors">
                       <h3 className="font-black text-slate-900 text-lg mb-6">핵심 강점</h3>
                       <ul className="space-y-5">
                           <li className="flex items-start gap-4">
                               <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-[12px]">✓</div>
                               <span className="text-[15px] font-bold text-slate-700">매매가가 약 4억원 더 저렴함</span>
                           </li>
                           <li className="flex items-start gap-4">
                               <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-[12px]">✓</div>
                               <span className="text-[15px] font-bold text-slate-700">전통적인 반포 대장주 위상</span>
                           </li>
                       </ul>
                   </div>
              </div>

              {/* Detailed Specs Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                      <h3 className="font-black text-slate-900 text-lg">상세 스펙 비교</h3>
                  </div>
                  <div className="divide-y divide-slate-50">
                      <StatRow label="매매가" left={formatNumberValue(leftAsset?.price, 1)} right={formatNumberValue(rightAsset?.price, 1)} unit="억" />
                      <StatRow label="전세가" left={formatNumberValue(leftAsset?.jeonse, 1)} right={formatNumberValue(rightAsset?.jeonse, 1)} unit="억" />
                      <StatRow label="전세가율" left={formatNumberValue(leftAsset?.jeonseRate, 1)} right={formatNumberValue(rightAsset?.jeonseRate, 1)} unit="%" />
                      <StatRow label="평당가" left={formatNumberValue(leftAsset?.pricePerPyeong, 2)} right={formatNumberValue(rightAsset?.pricePerPyeong, 2)} unit="억" />
                      <StatRow label="세대수" left={formatValue(leftAsset?.households)} right={formatValue(rightAsset?.households)} unit="세대" />
                      <StatRow label="입주년도" left={formatValue(leftAsset?.buildYear)} right={formatValue(rightAsset?.buildYear)} unit="년" />
                      <StatRow label="주차대수" left={formatNumberValue(leftAsset?.parkingSpaces, 2)} right={formatNumberValue(rightAsset?.parkingSpaces, 2)} unit="대" />
                      <StatRow label="역 도보시간" left={leftAsset?.walkingTimeText || getWalkingTimeRange(leftAsset?.walkingTime)} right={rightAsset?.walkingTimeText || getWalkingTimeRange(rightAsset?.walkingTime)} unit="" />
                  </div>
              </div>
              
              {/* School Information Section */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                      <h3 className="font-black text-slate-900 text-lg mb-4">주변 학교 정보</h3>
                      
                      {/* School Tabs */}
                      <div className="flex gap-2">
                          <button
                              onClick={() => setSchoolTab('elementary')}
                              className={`px-4 py-2 rounded-lg text-[14px] font-bold transition-all ${
                                  schoolTab === 'elementary'
                                      ? 'bg-indigo-500 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                          >
                              초등학교
                          </button>
                          <button
                              onClick={() => setSchoolTab('middle')}
                              className={`px-4 py-2 rounded-lg text-[14px] font-bold transition-all ${
                                  schoolTab === 'middle'
                                      ? 'bg-indigo-500 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                          >
                              중학교
                          </button>
                          <button
                              onClick={() => setSchoolTab('high')}
                              className={`px-4 py-2 rounded-lg text-[14px] font-bold transition-all ${
                                  schoolTab === 'high'
                                      ? 'bg-indigo-500 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                          >
                              고등학교
                          </button>
                      </div>
                  </div>
                  
                  {/* School List */}
                  <div className="p-6">
                      <div className="grid grid-cols-2 gap-6">
                          {/* Left Side */}
                          <div>
                              <h4 className="text-[15px] font-black text-slate-900 mb-4">{leftAsset?.name || '왼쪽 아파트'}</h4>
                              <div className="space-y-3">
                                  {getSchoolList(leftAsset, schoolTab).length ? (
                                      getSchoolList(leftAsset, schoolTab).map((school, index) => (
                                          <div key={index} className="p-3 bg-slate-50 rounded-lg">
                                              <span className="text-[14px] font-bold text-slate-700">{school.name}</span>
                                          </div>
                                      ))
                                  ) : (
                                      <div className="p-3 bg-slate-50 rounded-lg text-center">
                                          <span className="text-[14px] font-medium text-slate-400">-</span>
                                      </div>
                                  )}
                              </div>
                          </div>
                          
                          {/* Right Side */}
                          <div>
                              <h4 className="text-[15px] font-black text-slate-900 mb-4">{rightAsset?.name || '오른쪽 아파트'}</h4>
                              <div className="space-y-3">
                                  {getSchoolList(rightAsset, schoolTab).length ? (
                                      getSchoolList(rightAsset, schoolTab).map((school, index) => (
                                          <div key={index} className="p-3 bg-slate-50 rounded-lg">
                                              <span className="text-[14px] font-bold text-slate-700">{school.name}</span>
                                          </div>
                                      ))
                                  ) : (
                                      <div className="p-3 bg-slate-50 rounded-lg text-center">
                                          <span className="text-[14px] font-medium text-slate-400">-</span>
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-fade-in">
              
              {/* LEFT: Chart Section */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                  <div className="bg-white rounded-[24px] border border-slate-200 shadow-soft p-8 h-[560px] flex flex-col relative overflow-hidden">
                      <div className="mb-8 pb-6 border-b border-slate-100">
                          <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                  <h2 className="text-3xl font-black text-slate-900">
                                      {chartDisplayFilter === '매매가' ? '아파트 전세/매매 비교' : `아파트 ${chartDisplayFilter} 비교`}
                                  </h2>
                              </div>
                              <div className="relative" ref={filterDropdownRef}>
                                  <button
                                      onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                                      className="flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-[15px] font-bold"
                                  >
                                      <Filter className="w-5 h-5" />
                                      필터
                                  </button>
                                  
                                  {showFilterDropdown && (
                                      <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg w-[240px] z-50 max-h-[400px] overflow-y-auto">
                                          <div className="p-3">
                                              {/* 차트 표시 섹션 */}
                                              <div className="mb-3 pb-3 border-b border-slate-100">
                                                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-3 mb-2">차트 표시</p>
                                                  <div className="space-y-1">
                                                  {numericFilters.map((filter) => (
                                                      <label
                                                          key={filter}
                                                          className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                                                          onClick={() => handleChartFilterChange(filter)}
                                                      >
                                                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                              chartDisplayFilter === filter
                                                                  ? 'border-indigo-500'
                                                                  : 'border-slate-300'
                                                          }`}>
                                                              {chartDisplayFilter === filter && (
                                                                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                                              )}
                                                          </div>
                                                          <span className="text-[13px] font-bold text-slate-700">{filter}</span>
                                                      </label>
                                                  ))}
                                              </div>
                                          </div>
                                          
                                          {/* 테이블 필터 섹션 */}
                                          <div>
                                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-3 mb-2">테이블 표시</p>
                                              <div className="space-y-1">
                                                  {availableFilters.map((filter) => (
                                                      <label
                                                          key={filter}
                                                          className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                                                      >
                                                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                                              selectedFilters.includes(filter)
                                                                  ? 'bg-indigo-500 border-indigo-500'
                                                                  : 'border-slate-300'
                                                          }`}>
                                                              {selectedFilters.includes(filter) && (
                                                                  <Check className="w-3 h-3 text-white" />
                                                              )}
                                                          </div>
                                                          <input
                                                              type="checkbox"
                                                              checked={selectedFilters.includes(filter)}
                                                              onChange={() => toggleFilter(filter)}
                                                              className="sr-only"
                                                          />
                                                          <span className="text-[13px] font-bold text-slate-700">{filter}</span>
                                                      </label>
                                                  ))}
                                              </div>
                                          </div>
                                          </div>
                                      </div>
                                  )}
                              </div>
                          </div>
                          {/* 범례 - 매매가일 때만 표시 */}
                          {chartDisplayFilter === '매매가' && (
                              <div className="flex items-center gap-6 mt-4">
                                  <div className="flex items-center gap-2.5">
                                      <div className="w-5 h-5 rounded" style={{ 
                                          backgroundColor: '#cbd5e1',
                                          border: '2px solid #94a3b8'
                                      }}></div>
                                      <span className="text-[14px] font-black text-slate-900">매매가</span>
                                  </div>
                                  <div className="flex items-center gap-2.5">
                                      <div className="w-5 h-5 rounded relative overflow-hidden" style={{ 
                                          backgroundColor: '#475569',
                                          border: '2px solid #334155'
                                      }}>
                                          <div className="absolute inset-0" style={{
                                              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.2) 3px, rgba(255,255,255,0.2) 6px)'
                                          }}></div>
                                      </div>
                                      <span className="text-[14px] font-black text-slate-900">전세가</span>
                                  </div>
                              </div>
                          )}
                      </div>

                       <div className="flex-1 w-full min-h-[350px]">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                  data={chartData}
                                  margin={{ 
                                      top: 20, 
                                      right: 30, 
                                      left: chartDisplayFilter === '건축연도' ? 50 : 20, 
                                      bottom: 60 
                                  }}
                                  style={{ outline: 'none' }}
                              >
                                  {/* SVG 패턴 정의 - 전세가 줄무늬용 */}
                                  {chartDisplayFilter === '매매가' && (
                                      <defs>
                                          {chartData.map((entry, index) => (
                                              <pattern
                                                  key={`pattern-${index}`}
                                                  id={`jeonse-pattern-${index}`}
                                                  patternUnits="userSpaceOnUse"
                                                  width="8"
                                                  height="8"
                                                  patternTransform="rotate(45)"
                                              >
                                                  <rect width="4" height="8" fill={entry.darkerColor || '#475569'} opacity="0.9" />
                                                  <rect x="4" width="4" height="8" fill={entry.darkerColor || '#475569'} opacity="0.6" />
                                              </pattern>
                                          ))}
                                      </defs>
                                  )}
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                  {chartDisplayFilter === '매매가' && (
                                      <Legend 
                                          content={({ payload }) => null}
                                          wrapperStyle={{ display: 'none' }}
                                      />
                                  )}
                                  <XAxis 
                                      dataKey="name" 
                                      axisLine={false} 
                                      tickLine={false} 
                                      tick={{ fontSize: 13, fill: '#64748b', fontWeight: 'bold' }}
                                      angle={-45}
                                      textAnchor="end"
                                      height={80}
                                  />
                                  <YAxis 
                                      axisLine={false} 
                                      tickLine={false} 
                                      tick={{ 
                                          fontSize: chartDisplayFilter === '건축연도' ? 11 : 12, 
                                          fill: '#94a3b8', 
                                          fontWeight: 'bold' 
                                      }}
                                      tickFormatter={(val) => {
                                          if (chartDisplayFilter === '전세가율') return `${val}%`;
                                          if (chartDisplayFilter === '세대수') return `${val.toLocaleString()}`;
                                          if (chartDisplayFilter === '주차공간') return `${val}`;
                                          if (chartDisplayFilter === '건축연도') return `${val}`;
                                          if (chartDisplayFilter === '평당가') return `${val}`;
                                          return `${val}`;
                                      }}
                                      domain={[0, 'auto']}
                                      width={chartDisplayFilter === '건축연도' ? 50 : undefined}
                                  />
                                  <Tooltip 
                                      cursor={false}
                                      content={({ active, payload }) => {
                                          if (active && payload && payload.length) {
                                              const data = payload[0].payload;
                                              let displayValue = data.value;
                                              let unit = '';
                                              
                                              if (chartDisplayFilter === '전세가율') {
                                                  unit = '%';
                                              } else if (chartDisplayFilter === '세대수') {
                                                  displayValue = data.value.toLocaleString();
                                                  unit = '세대';
                                              } else if (chartDisplayFilter === '주차공간') {
                                                  unit = '대';
                                              } else if (chartDisplayFilter === '건축연도') {
                                                  unit = '년';
                                              } else if (chartDisplayFilter === '평당가') {
                                                  unit = '억원';
                                              } else {
                                                  unit = '억원';
                                              }
                                              
                                              return (
                                                  <div className="bg-white/95 backdrop-blur-xl border border-slate-200 shadow-deep rounded-xl p-4 min-w-[150px]">
                                                      <p className="font-bold text-slate-900 mb-2 text-[15px]">{data.name}</p>
                                                      <p className="text-slate-600 text-[14px] font-bold tabular-nums mb-1">
                                                          {data.label}: {displayValue}{unit}
                                                      </p>
                                                      {chartDisplayFilter === '매매가' && data.jeonse && (
                                                          <p className="text-slate-600 text-[14px] font-bold tabular-nums">
                                                              전세가: {data.jeonse}억원
                                                          </p>
                                                      )}
                                                  </div>
                                              );
                                          }
                                          return null;
                                      }}
                                  />
                                  <Bar 
                                    dataKey="value" 
                                    radius={[8, 8, 0, 0]}
                                    isAnimationActive={true}
                                    animationDuration={150}
                                    name="매매가"
                                    onMouseEnter={() => setHoveredBarType('value')}
                                    onMouseLeave={() => {
                                      setHoveredBarType(null);
                                      setHoveredBarIndex(null);
                                    }}
                                    fill="#94a3b8"
                                  >
                                    {chartData.map((entry, index) => {
                                      const isHovered = hoveredBarType === 'value' && hoveredBarIndex === index;
                                      return (
                                        <Cell 
                                          key={`cell-${index}`} 
                                          fill={entry.color}
                                          opacity={hoveredBarType === null || hoveredBarType === 'value' ? 1 : 0.3}
                                          onMouseEnter={() => {
                                            setHoveredBarType('value');
                                            setHoveredBarIndex(index);
                                          }}
                                          onMouseLeave={() => {
                                            setHoveredBarType(null);
                                            setHoveredBarIndex(null);
                                          }}
                                          style={{ 
                                              transition: 'all 0.2s ease',
                                              stroke: isHovered ? '#fff' : 'rgba(255,255,255,0.1)',
                                              strokeWidth: isHovered ? 2.5 : 1
                                          }}
                                        />
                                      );
                                    })}
                                    <LabelList
                                      dataKey="value"
                                      position="top"
                                      content={(props: any) => {
                                        const { x, y, width, value, index } = props;
                                        const entry = chartData[index];
                                        const asset = assets.find(a => a.name === entry.name);
                                        
                                        // selectedAssetId와 일치하는 항목만 레이블 표시
                                        if (!asset || asset.id !== selectedAssetId) return null;
                                        
                                        let displayValue = value;
                                        let unit = '';
                                        
                                        if (chartDisplayFilter === '전세가율') {
                                          unit = '%';
                                        } else if (chartDisplayFilter === '세대수') {
                                          displayValue = value.toLocaleString();
                                          unit = '세대';
                                        } else if (chartDisplayFilter === '주차공간') {
                                          unit = '대';
                                        } else if (chartDisplayFilter === '건축연도') {
                                          unit = '년';
                                        } else if (chartDisplayFilter === '평당가') {
                                          unit = '억';
                                        } else {
                                          unit = '억';
                                        }
                                        
                                        return (
                                          <g>
                                            <rect
                                              x={x + width / 2 - 35}
                                              y={y - 32}
                                              width="70"
                                              height="26"
                                              fill="white"
                                              rx="6"
                                              opacity="0.95"
                                            />
                                            <text
                                              x={x + width / 2}
                                              y={y - 14}
                                              fill={entry.color}
                                              fontSize="14"
                                              fontWeight="bold"
                                              textAnchor="middle"
                                            >
                                              {displayValue}{unit}
                                            </text>
                                          </g>
                                        );
                                      }}
                                    />
                                  </Bar>
                                  {chartDisplayFilter === '매매가' && (
                                      <Bar 
                                        dataKey="jeonse" 
                                        radius={[8, 8, 0, 0]}
                                        isAnimationActive={true}
                                        animationDuration={150}
                                        name="전세가"
                                        onMouseEnter={() => setHoveredBarType('jeonse')}
                                        onMouseLeave={() => {
                                          setHoveredBarType(null);
                                          setHoveredBarIndex(null);
                                        }}
                                      >
                                        {chartData.map((entry, index) => {
                                            // 전세 막대는 줄무늬 패턴 적용
                                            const baseColor = entry.darkerColor || '#475569';
                                            const isHovered = hoveredBarType === 'jeonse' && hoveredBarIndex === index;
                                            return (
                                                <Cell 
                                                    key={`cell-jeonse-${index}`} 
                                                    fill={`url(#jeonse-pattern-${index})`}
                                                    opacity={hoveredBarType === null || hoveredBarType === 'jeonse' ? 1 : 0.3}
                                                    onMouseEnter={() => {
                                                      setHoveredBarType('jeonse');
                                                      setHoveredBarIndex(index);
                                                    }}
                                                    onMouseLeave={() => {
                                                      setHoveredBarType(null);
                                                      setHoveredBarIndex(null);
                                                    }}
                                                    style={{ 
                                                        transition: 'all 0.2s ease',
                                                        stroke: isHovered ? '#fff' : 'rgba(255,255,255,0.3)',
                                                        strokeWidth: isHovered ? 2.5 : 1.5
                                                    }}
                                                />
                                            );
                                        })}
                                        <LabelList
                                          dataKey="jeonse"
                                          position="top"
                                          content={(props: any) => {
                                            const { x, y, width, value, index } = props;
                                            const entry = chartData[index];
                                            const asset = assets.find(a => a.name === entry.name);
                                            
                                            // selectedAssetId와 일치하는 항목만 레이블 표시
                                            if (!asset || asset.id !== selectedAssetId || !value) return null;
                                            
                                            return (
                                              <g>
                                                <rect
                                                  x={x + width / 2 - 35}
                                                  y={y - 32}
                                                  width="70"
                                                  height="26"
                                                  fill="white"
                                                  rx="6"
                                                  opacity="0.95"
                                                />
                                                <text
                                                  x={x + width / 2}
                                                  y={y - 14}
                                                  fill={entry.darkerColor}
                                                  fontSize="14"
                                                  fontWeight="bold"
                                                  textAnchor="middle"
                                                >
                                                  {value}억
                                                </text>
                                              </g>
                                            );
                                          }}
                                        />
                                      </Bar>
                                  )}
                              </BarChart>
                          </ResponsiveContainer>
                          
                          {/* 단위 표시 */}
                          <div className="absolute bottom-2 right-8 text-[12px] text-slate-500 font-medium">
                              단위: {chartDisplayFilter === '전세가율' ? '%' : 
                                    chartDisplayFilter === '세대수' ? '세대' :
                                    chartDisplayFilter === '주차공간' ? '대' :
                                    chartDisplayFilter === '건축연도' ? '년' :
                                    '억'}
                          </div>
                      </div>
                  </div>

                  {/* Table Section */}
                  <div className="bg-white rounded-[24px] border border-slate-200 shadow-soft overflow-hidden h-[580px] flex flex-col">
                      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
                          <h3 className="font-black text-slate-900 text-[17px]">상세 정보</h3>
                      </div>
                      <div className="overflow-x-auto overflow-y-auto flex-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                          <table className="w-full">
                              <thead>
                                  <tr className="bg-slate-50/50 border-b border-slate-100">
                                      <th className="text-left px-6 py-4 text-[13px] font-bold text-slate-600 uppercase tracking-wide">항목</th>
                                      {assets.map((asset) => (
                                          <th key={asset.id} className="text-center px-6 py-4 text-[13px] font-black text-slate-900">
                                              {asset.name}
                                          </th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody>
                                  {selectedFilters.includes('매매가') && (() => {
                                      const maxPrice = Math.max(...assets.map(a => a.price));
                                      const minPrice = Math.min(...assets.map(a => a.price));
                                      return (
                                          <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                              <td className="px-6 py-4 text-[14px] font-bold text-slate-600">매매가</td>
                                              {assets.map((asset) => {
                                                  const isMax = asset.price === maxPrice;
                                                  const isMin = asset.price === minPrice;
                                                  return (
                                                      <td key={asset.id} className={`px-6 py-4 text-center text-[15px] tabular-nums ${isMax || isMin ? 'font-bold' : 'font-normal'} ${isMax ? 'text-red-500' : isMin ? 'text-blue-500' : 'text-slate-900'}`}>
                                                          {asset.price}억
                                                      </td>
                                                  );
                                              })}
                                          </tr>
                                      );
                                  })()}
                                  {selectedFilters.includes('평당가') && (() => {
                                      const maxPrice = Math.max(...assets.map(a => a.pricePerPyeong || 0));
                                      const minPrice = Math.min(...assets.map(a => a.pricePerPyeong || 0));
                                      return (
                                          <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                              <td className="px-6 py-4 text-[14px] font-bold text-slate-600">평당가</td>
                                              {assets.map((asset) => {
                                                  const isMax = asset.pricePerPyeong === maxPrice;
                                                  const isMin = asset.pricePerPyeong === minPrice;
                                                  return (
                                                      <td key={asset.id} className={`px-6 py-4 text-center text-[15px] tabular-nums ${isMax || isMin ? 'font-bold' : 'font-normal'} ${isMax ? 'text-red-500' : isMin ? 'text-blue-500' : 'text-slate-900'}`}>
                                                          {asset.pricePerPyeong?.toFixed(2)}억
                                                      </td>
                                                  );
                                              })}
                                          </tr>
                                      );
                                  })()}
                                  {selectedFilters.includes('전세가율') && (() => {
                                      const maxRate = Math.max(...assets.map(a => a.jeonseRate || 0));
                                      const minRate = Math.min(...assets.map(a => a.jeonseRate || 0));
                                      return (
                                          <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                              <td className="px-6 py-4 text-[14px] font-bold text-slate-600">전세가율</td>
                                              {assets.map((asset) => {
                                                  const isMax = asset.jeonseRate === maxRate;
                                                  const isMin = asset.jeonseRate === minRate;
                                                  return (
                                                      <td key={asset.id} className={`px-6 py-4 text-center text-[15px] tabular-nums ${isMax || isMin ? 'font-bold' : 'font-normal'} ${isMax ? 'text-red-500' : isMin ? 'text-blue-500' : 'text-slate-900'}`}>
                                                          {asset.jeonseRate}%
                                                      </td>
                                                  );
                                              })}
                                          </tr>
                                      );
                                  })()}
                                  {selectedFilters.includes('세대수') && (() => {
                                      const maxHouseholds = Math.max(...assets.map(a => a.households || 0));
                                      const minHouseholds = Math.min(...assets.map(a => a.households || 0));
                                      return (
                                          <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                              <td className="px-6 py-4 text-[14px] font-bold text-slate-600">세대수</td>
                                              {assets.map((asset) => {
                                                  const isMax = asset.households === maxHouseholds;
                                                  const isMin = asset.households === minHouseholds;
                                                  return (
                                                      <td key={asset.id} className={`px-6 py-4 text-center text-[15px] tabular-nums ${isMax || isMin ? 'font-bold' : 'font-normal'} ${isMax ? 'text-red-500' : isMin ? 'text-blue-500' : 'text-slate-900'}`}>
                                                          {asset.households?.toLocaleString()}세대
                                                      </td>
                                                  );
                                              })}
                                          </tr>
                                      );
                                  })()}
                                  {selectedFilters.includes('주차공간') && (() => {
                                      const maxParking = Math.max(...assets.map(a => a.parkingSpaces || 0));
                                      const minParking = Math.min(...assets.map(a => a.parkingSpaces || 0));
                                      return (
                                          <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                              <td className="px-6 py-4 text-[14px] font-bold text-slate-600">주차공간</td>
                                              {assets.map((asset) => {
                                                  const isMax = asset.parkingSpaces === maxParking;
                                                  const isMin = asset.parkingSpaces === minParking;
                                                  return (
                                                      <td key={asset.id} className={`px-6 py-4 text-center text-[15px] tabular-nums ${isMax || isMin ? 'font-bold' : 'font-normal'} ${isMax ? 'text-red-500' : isMin ? 'text-blue-500' : 'text-slate-900'}`}>
                                                          {asset.parkingSpaces}대
                                                      </td>
                                                  );
                                              })}
                                          </tr>
                                      );
                                  })()}
                                  {selectedFilters.includes('지하철역') && (
                                      <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                          <td className="px-6 py-4 text-[14px] font-bold text-slate-600">지하철역</td>
                                          {assets.map((asset) => (
                                              <td key={asset.id} className="px-6 py-4 text-center">
                                                  <span 
                                                      className="inline-block px-3 py-1.5 rounded-lg text-[14px] font-bold text-white"
                                                      style={{ backgroundColor: SUBWAY_LINE_COLORS[asset.nearestSubway || ''] || '#64748b' }}
                                                  >
                                                      {asset.nearestSubway}
                                                  </span>
                                              </td>
                                          ))}
                                      </tr>
                                  )}
                                  {selectedFilters.includes('도보시간') && (() => {
                                      const maxTime = Math.max(...assets.map(a => a.walkingTime || 0));
                                      const minTime = Math.min(...assets.map(a => a.walkingTime || 0));
                                      return (
                                          <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                              <td className="px-6 py-4 text-[14px] font-bold text-slate-600">도보시간</td>
                                              {assets.map((asset) => {
                                                  const isFastest = asset.walkingTime === minTime;
                                                  const isSlowest = asset.walkingTime === maxTime;
                                                  return (
                                                      <td key={asset.id} className={`px-6 py-4 text-center text-[15px] tabular-nums ${isFastest || isSlowest ? 'font-black' : 'font-bold'} ${isFastest ? 'text-red-500' : isSlowest ? 'text-blue-500' : 'text-slate-900'}`}>
                                                          {asset.walkingTimeText || getWalkingTimeRange(asset.walkingTime)}
                                                      </td>
                                                  );
                                              })}
                                          </tr>
                                      );
                                  })()}
                                  {selectedFilters.includes('건축연도') && (() => {
                                      const maxYear = Math.max(...assets.map(a => a.buildYear || 0));
                                      const minYear = Math.min(...assets.map(a => a.buildYear || 0));
                                      return (
                                          <tr className="hover:bg-slate-50/50 transition-colors">
                                              <td className="px-6 py-4 text-[14px] font-bold text-slate-600">건축연도</td>
                                              {assets.map((asset) => {
                                                  const isMax = asset.buildYear === maxYear;
                                                  const isMin = asset.buildYear === minYear;
                                                  return (
                                                      <td key={asset.id} className={`px-6 py-4 text-center text-[15px] tabular-nums ${isMax || isMin ? 'font-bold' : 'font-normal'} ${isMax ? 'text-red-500' : isMin ? 'text-blue-500' : 'text-slate-900'}`}>
                                                          {asset.buildYear}년
                                                      </td>
                                                  );
                                              })}
                                          </tr>
                                      );
                                  })()}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>

              {/* RIGHT: Asset List */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                  <div className="bg-white rounded-[24px] border border-slate-200 shadow-soft flex flex-col overflow-hidden h-[560px]">
                      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                          <h3 className="font-black text-slate-900 text-[17px]">자산 구성</h3>
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[11px] font-bold">
                              {assets.length}개
                          </span>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                          {assets.map((asset) => {
                              const isSelected = selectedAssetId === asset.id;
                              const isDimmed = selectedAssetId !== null && !isSelected;

                              return (
                                  <ApartmentRow
                                      key={asset.id}
                                      name={asset.name.replace(/ \d+평형$/, '')}
                                      location={asset.region}
                                      area={asset.area || 84}
                                      price={asset.price * 10000}
                                      color={asset.color}
                                      showColorDot={true}
                                      isSelected={isSelected}
                                      isDimmed={isDimmed}
                                      onClick={() => handleAssetClick(asset.id)}
                                      onRemove={(e) => handleRemoveAsset(asset.id, e)}
                                      variant="selected"
                                      showChevron={false}
                                      className="mb-3"
                                      rightContent={
                                          <div className="flex items-center gap-3">
                                              {asset.pyeongType && (
                                                  <div className="flex items-center gap-2">
                                                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[13px] font-black">
                                                          {asset.pyeongType}
                                                      </span>
                                                      <span className="text-[15px] font-black text-slate-800 tabular-nums">{asset.price}억</span>
                                                  </div>
                                              )}
                                              {!asset.pyeongType && (
                                                  <span className="text-[15px] font-black text-slate-800 tabular-nums">{asset.price}억</span>
                                              )}
                                          </div>
                                      }
                                  />
                              );
                          })}

                          {assets.length < MAX_COMPARE && (
                              <button 
                                  onClick={() => setShowAddAssetModal(true)}
                                  className="w-full py-4 border border-dashed border-slate-300 rounded-xl text-slate-400 font-bold text-[13px] flex items-center justify-center gap-1.5 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all opacity-70 hover:opacity-100"
                              >
                                  <Plus className="w-4 h-4" /> 비교군 추가하기
                              </button>
                          )}
                      </div>
                  </div>

                  {/* Key Comparison Card */}
                  <div className="bg-white rounded-[24px] border border-slate-200 shadow-soft flex flex-col overflow-hidden h-[580px]">
                      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                          <h3 className="font-black text-slate-900 text-[17px]">핵심 비교</h3>
                      </div>

                      <div className="p-4 space-y-3 flex-1 overflow-y-auto">
                          {assets.length === 0 ? (
                              <div className="flex items-center justify-center h-full text-slate-400">
                                  <div className="text-center">
                                      <p className="text-[15px] font-bold mb-2">비교할 아파트가 없습니다</p>
                                      <p className="text-[13px]">위에서 아파트를 추가해주세요</p>
                                  </div>
                              </div>
                          ) : (() => {
                              // 가장 비싼 아파트
                              const mostExpensive = assets.reduce((max, asset) => 
                                  asset.price > max.price ? asset : max
                              );
                              
                              // 평당가가 가장 비싼 아파트
                              const highestPricePerPyeong = assets.reduce((max, asset) => 
                                  (asset.pricePerPyeong || 0) > (max.pricePerPyeong || 0) ? asset : max
                              );
                              
                              // 가장 주차공간이 넓은 아파트
                              const mostParking = assets.reduce((max, asset) => 
                                  (asset.parkingSpaces || 0) > (max.parkingSpaces || 0) ? asset : max
                              );
                              
                              // 가장 최근 건축된 아파트
                              const newest = assets.reduce((max, asset) => 
                                  (asset.buildYear || 0) > (max.buildYear || 0) ? asset : max
                              );
                              
                              // 가장 역이 가까운 아파트
                              const closestToSubway = assets.reduce((min, asset) => 
                                  (asset.walkingTime || 999) < (min.walkingTime || 999) ? asset : min
                              );

                              return (
                                  <>
                                      <div 
                                          className="rounded-xl p-4 border"
                                          style={{ 
                                              backgroundColor: `${mostExpensive.color}15`,
                                              borderColor: `${mostExpensive.color}40`
                                          }}
                                      >
                                          <div className="flex items-center justify-between">
                                              <div className="flex-1">
                                                  <p className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: mostExpensive.color }}>가장 비싼 아파트</p>
                                                  <p className="text-[15px] font-black text-slate-900">{mostExpensive.name}</p>
                                              </div>
                                              <p className="text-[13px] font-black text-slate-900">{mostExpensive.price}억</p>
                                          </div>
                                      </div>

                                      <div 
                                          className="rounded-xl p-4 border"
                                          style={{ 
                                              backgroundColor: `${highestPricePerPyeong.color}15`,
                                              borderColor: `${highestPricePerPyeong.color}40`
                                          }}
                                      >
                                          <div className="flex items-center justify-between">
                                              <div className="flex-1">
                                                  <p className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: highestPricePerPyeong.color }}>평당가 최고</p>
                                                  <p className="text-[15px] font-black text-slate-900">{highestPricePerPyeong.name}</p>
                                              </div>
                                              <p className="text-[13px] font-black text-slate-900">평당 {highestPricePerPyeong.pricePerPyeong?.toFixed(2)}억</p>
                                          </div>
                                      </div>

                                      <div 
                                          className="rounded-xl p-4 border"
                                          style={{ 
                                              backgroundColor: `${mostParking.color}15`,
                                              borderColor: `${mostParking.color}40`
                                          }}
                                      >
                                          <div className="flex items-center justify-between">
                                              <div className="flex-1">
                                                  <p className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: mostParking.color }}>주차공간 최대</p>
                                                  <p className="text-[15px] font-black text-slate-900">{mostParking.name}</p>
                                              </div>
                                              <p className="text-[13px] font-black text-slate-900">세대당 {mostParking.parkingSpaces}대</p>
                                          </div>
                                      </div>

                                      <div 
                                          className="rounded-xl p-4 border"
                                          style={{ 
                                              backgroundColor: `${newest.color}15`,
                                              borderColor: `${newest.color}40`
                                          }}
                                      >
                                          <div className="flex items-center justify-between">
                                              <div className="flex-1">
                                                  <p className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: newest.color }}>최신 건축</p>
                                                  <p className="text-[15px] font-black text-slate-900">{newest.name}</p>
                                              </div>
                                              <p className="text-[13px] font-black text-slate-900">{newest.buildYear}년 준공</p>
                                          </div>
                                      </div>

                                      <div 
                                          className="rounded-xl p-4 border"
                                          style={{ 
                                              backgroundColor: `${closestToSubway.color}15`,
                                              borderColor: `${closestToSubway.color}40`
                                          }}
                                      >
                                          <div className="flex items-center justify-between">
                                              <div className="flex-1">
                                                  <p className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: closestToSubway.color }}>역세권 최고</p>
                                                  <p className="text-[15px] font-black text-slate-900">{closestToSubway.name}</p>
                                              </div>
                                              <div className="text-right">
                                                  <span 
                                                      className="inline-block px-2 py-1 rounded-md text-[12px] font-bold text-white mb-1"
                                                      style={{ backgroundColor: SUBWAY_LINE_COLORS[closestToSubway.nearestSubway || ''] || '#64748b' }}
                                                  >
                                                      {closestToSubway.nearestSubway}
                                                  </span>
                                                  <p className="text-[13px] font-black text-slate-900">{closestToSubway.walkingTimeText || getWalkingTimeRange(closestToSubway.walkingTime)}</p>
                                              </div>
                                          </div>
                                      </div>
                                  </>
                              );
                          })()}
                      </div>
                  </div>
              </div>
          </div>
      )}
      
      {/* 아파트 검색 및 선택 모달 */}
      <SearchAndSelectApart
          isOpen={showAddAssetModal}
          onClose={() => setShowAddAssetModal(false)}
          onAddAsset={handleAddAssetWithPyeong}
          existingAssets={assets}
      />
    </div>
  );
};