import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Star, Plus, ArrowRightLeft, Building2, MapPin, Calendar, Car, ChevronDown, X, Check, Home, Trash2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { ProfessionalChart } from '../ui/ProfessionalChart';
import { ToggleButtonGroup } from '../ui/ToggleButtonGroup';
import { Skeleton } from '../ui/Skeleton';
import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { 
  fetchApartmentDetail, 
  fetchApartmentTransactions,
  fetchMyProperties,
  fetchFavoriteApartments,
  addFavoriteApartment,
  removeFavoriteApartment,
  createMyProperty,
  updateMyProperty,
  deleteMyProperty,
  fetchApartmentExclusiveAreas,
  fetchMyPropertyDetail,
  fetchNews,
  fetchApartmentsByRegion,
  fetchNearbyComparison,
  fetchApartmentPercentile,
  setAuthToken
} from '../../services/api';

interface PropertyDetailProps {
  propertyId?: string;
  onBack: () => void;
  isCompact?: boolean;
  isSidebar?: boolean;
}

type TabType = 'chart' | 'info';
type ChartType = '전체' | '매매' | '전세' | '월세';
type TransactionType = '전체' | '매매' | '전세';

const generateChartData = (type: ChartType) => {
    const data = [];
    const startDate = new Date('2023-01-01');
    let basePrice = (type === '매매' || type === '전체') ? 32000 : (type === '전세' ? 24000 : 100); 
    const volatility = type === '월세' ? 5 : 500;
    
    for (let i = 0; i < 365; i += 3) { 
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const change = (Math.random() - 0.48) * volatility; 
        basePrice += change;
        data.push({
            time: date.toISOString().split('T')[0],
            value: Math.floor(basePrice)
        });
    }
    return data;
};

const propertyDataMap: Record<string, DetailData> = {
  '1': {
    id: '1',
    name: '래미안 원베일리',
    location: '서울시 서초구 반포동',
    currentPrice: 42500, 
    diff: 4500, 
    diffRate: 11.8,
    jeonsePrice: 32000,
    jeonseRatio: 75.3,
    info: [
      { label: '전용면적', value: '84.00㎡' },
      { label: '공급면적', value: '114.00㎡' },
      { label: '세대수', value: '892세대' },
      { label: '총 주차대수', value: '1,200대 (세대당 1.3대)' },
      { label: '사용승인일', value: '2015.03.20' },
      { label: '건설사', value: '삼성물산(주)' },
      { label: '난방', value: '지역난방' },
      { label: '현관구조', value: '계단식' },
    ],
    transactions: [
        { date: '24.03.20', floor: '25층', price: 42500, type: '매매' },
        { date: '24.03.15', floor: '18층', price: 42000, type: '매매' },
        { date: '24.03.10', floor: '12층', price: 41500, type: '매매' },
        { date: '24.03.05', floor: '20층', price: 32000, type: '전세' },
        { date: '24.02.28', floor: '15층', price: 41000, type: '매매' },
        { date: '24.02.20', floor: '8층', price: 40000, type: '매매' },
        { date: '24.02.15', floor: '22층', price: 31500, type: '전세' },
        { date: '24.02.01', floor: '10층', price: 39500, type: '매매' },
        { date: '24.01.28', floor: '5층', price: 38000, type: '매매' },
        { date: '24.01.10', floor: '16층', price: 31000, type: '전세' },
    ],
    news: [
        { title: "반포 한강뷰 아파트 가격 상승세 지속", source: "부동산경제", time: "2시간 전" },
        { title: "서초구 전세가율 상승, 갭투자 관심 증가", source: "머니투데이", time: "5시간 전" },
        { title: "래미안 원베일리 신고가 갱신", source: "한국경제", time: "1일 전" },
    ],
    neighbors: [
        { name: '래미안 반포리버뷰', price: 45000, diff: 5.9 },
        { name: '반포 힐스테이트', price: 48000, diff: 12.9 },
        { name: '반포 자이', price: 41000, diff: -3.5 },
        { name: '래미안 반포팰리스', price: 52000, diff: 22.4 },
    ],
  },
  '2': {
    id: '2',
    name: '래미안 강남파크',
    location: '서울시 강남구 역삼동',
    currentPrice: 58300, 
    diff: 4800, 
    diffRate: 8.2,
    jeonsePrice: 45000,
    jeonseRatio: 77.2,
    info: [
      { label: '전용면적', value: '114.00㎡' },
      { label: '공급면적', value: '152.00㎡' },
      { label: '세대수', value: '1,234세대' },
      { label: '총 주차대수', value: '1,800대 (세대당 1.5대)' },
      { label: '사용승인일', value: '2018.06.15' },
      { label: '건설사', value: '삼성물산(주)' },
      { label: '난방', value: '지역난방' },
      { label: '현관구조', value: '계단식' },
    ],
    transactions: [
        { date: '24.03.22', floor: '30층', price: 58300, type: '매매' },
        { date: '24.03.18', floor: '25층', price: 57500, type: '매매' },
        { date: '24.03.12', floor: '20층', price: 57000, type: '매매' },
        { date: '24.03.08', floor: '28층', price: 45000, type: '전세' },
        { date: '24.02.28', floor: '15층', price: 56000, type: '매매' },
        { date: '24.02.20', floor: '10층', price: 55000, type: '매매' },
        { date: '24.02.15', floor: '22층', price: 44500, type: '전세' },
        { date: '24.02.01', floor: '18층', price: 54000, type: '매매' },
        { date: '24.01.28', floor: '8층', price: 53000, type: '매매' },
        { date: '24.01.10', floor: '24층', price: 44000, type: '전세' },
    ],
    news: [
        { title: "강남구 투기 규제지역 지정, 시장 영향 주목", source: "부동산경제", time: "1시간 전" },
        { title: "역삼동 아파트 가격 상승세 둔화", source: "머니투데이", time: "4시간 전" },
        { title: "래미안 강남파크 전세가율 상승", source: "한국경제", time: "1일 전" },
    ],
    neighbors: [
        { name: '래미안 역삼', price: 56000, diff: -3.9 },
        { name: '역삼 힐스테이트', price: 61000, diff: 4.6 },
        { name: '역삼 자이', price: 55000, diff: -5.7 },
        { name: '래미안 강남힐스', price: 65000, diff: 11.5 },
    ],
  }
};

const detailData1: DetailData = {
  id: '1',
  name: '수원 영통 황골마을 1단지',
  location: '경기도 수원시 영통구 영통동',
  currentPrice: 32500, 
  diff: 1500, 
  diffRate: 4.8,
  jeonsePrice: 24000,
  jeonseRatio: 73.8,
  info: [
    { label: '전용면적', value: '59.99㎡' },
    { label: '공급면적', value: '81.53㎡' },
    { label: '세대수', value: '3,129세대' },
    { label: '총 주차대수', value: '2,500대 (세대당 0.8대)' },
    { label: '사용승인일', value: '1997.12.15' },
    { label: '건설사', value: '현대건설(주)' },
    { label: '난방', value: '지역난방/열병합' },
    { label: '현관구조', value: '복도식' },
  ],
  transactions: [
      { date: '24.03.20', floor: '15층', price: 32500, type: '매매' },
      { date: '24.03.19', floor: '10층', price: 32000, type: '매매' },
      { date: '24.03.15', floor: '8층', price: 31800, type: '매매' },
      { date: '24.03.12', floor: '12층', price: 24000, type: '전세' },
      { date: '24.02.28', floor: '19층', price: 31500, type: '매매' },
      { date: '24.02.20', floor: '5층', price: 30500, type: '매매' },
      { date: '24.02.15', floor: '7층', price: 23500, type: '전세' },
      { date: '24.02.01', floor: '11층', price: 31000, type: '매매' },
      { date: '24.01.28', floor: '3층', price: 29500, type: '매매' },
      { date: '24.01.10', floor: '9층', price: 23000, type: '전세' },
  ],
  news: [
      { title: "영통 리모델링 기대감 솔솔... 저가 매수세 유입", source: "부동산경제", time: "2시간 전" },
      { title: "수원 영통구 전세가율 상승, 갭투자 다시 고개드나", source: "머니투데이", time: "5시간 전" },
      { title: "GTX-C 착공 호재, 인근 단지 신고가 갱신", source: "한국경제", time: "1일 전" },
  ],
  neighbors: [
      { name: '황골마을 주공 2단지', price: 31000, diff: 0.5 },
      { name: '청명마을 주공 4단지', price: 34500, diff: -0.2 },
      { name: '영통 벽적골 주공', price: 33000, diff: 0.0 },
      { name: '신나무실 건영 2차', price: 38000, diff: 1.2 },
  ],
};

const getDetailData = (propertyId: string) => {
  return propertyDataMap[propertyId] || detailData1;
};

// Updated FormatPrice: Numbers Bold, Units Medium, Same Size
const FormatPrice = ({ val, sizeClass = "text-[28px]" }: { val: number, sizeClass?: string }) => {
  const eok = Math.floor(val / 10000);
  const man = val % 10000;
  
  if (eok === 0) {
    // 1억 미만인 경우
    return (
      <span className={`tabular-nums tracking-tight text-slate-900 ${sizeClass}`}>
        <span className="font-bold">{man.toLocaleString()}</span>
      </span>
    );
  }
  
  return (
      <span className={`tabular-nums tracking-tight text-slate-900 ${sizeClass}`}>
          <span className="font-bold">{eok}</span>
          <span className="font-bold text-slate-900 ml-0.5 mr-1.5">억</span>
          {man > 0 && (
            <>
                <span className="font-bold">{man.toLocaleString()}</span>
            </>
          )}
      </span>
  );
};

// 가격 변동을 억 단위로 포맷 - 화살표 포함 (예: 145333 → ▲ +14억 5,333)
const FormatPriceChange = ({ val, sizeClass = "text-[15px]" }: { val: number, sizeClass?: string }) => {
  const isPositive = val >= 0;
  const absVal = Math.abs(val);
  const eok = Math.floor(absVal / 10000);
  const man = absVal % 10000;
  const sign = isPositive ? '+' : '-';
  const colorClass = isPositive ? 'text-red-500' : 'text-blue-500';
  const arrow = isPositive ? '▲' : '▼';
  
  if (eok === 0) {
    return (
      <span className={`tabular-nums font-bold ${colorClass} ${sizeClass}`}>
        {arrow} {sign}{man.toLocaleString()}
      </span>
    );
  }
  
  return (
    <span className={`tabular-nums font-bold ${colorClass} ${sizeClass}`}>
      {arrow} {sign}{eok}<span className="font-bold">억</span>{man > 0 && ` ${man.toLocaleString()}`}
    </span>
  );
};

// 가격 변동을 억 단위로 포맷 - 화살표 없이 값만 (예: 145333 → +14억 5,333)
const FormatPriceChangeValue = ({ val, sizeClass = "text-[15px]" }: { val: number, sizeClass?: string }) => {
  const isPositive = val >= 0;
  const absVal = Math.abs(val);
  const eok = Math.floor(absVal / 10000);
  const man = absVal % 10000;
  const sign = isPositive ? '+' : '-';
  const colorClass = isPositive ? 'text-red-500' : 'text-blue-500';
  
  if (eok === 0) {
    return (
      <span className={`tabular-nums font-bold ${colorClass} ${sizeClass}`}>
        {sign}{man.toLocaleString()}
      </span>
    );
  }
  
  return (
    <span className={`tabular-nums font-bold ${colorClass} ${sizeClass}`}>
      {sign}{eok}<span className="font-bold">억</span>{man > 0 && ` ${man.toLocaleString()}`}
    </span>
  );
};

const NeighborItem: React.FC<{ item: typeof detailData1.neighbors[0], currentPrice: number }> = ({ item, currentPrice }) => {
    // currentPrice가 0이면 diffRatio를 계산하지 않음
    const diffRatio = currentPrice > 0 
        ? ((item.price - currentPrice) / currentPrice) * 100 
        : 0;
    const isHigher = diffRatio > 0;
    
    // Infinity나 NaN 체크
    const displayDiff = isFinite(diffRatio) ? Math.abs(diffRatio).toFixed(1) : '0.0';
    
    return (
        <div className="flex justify-between p-4 text-[15px]">
            <span className="font-medium text-slate-900 flex items-center gap-2">
                <span className="text-[15px]">{item.name}</span> 
                {currentPrice > 0 && item.price > 0 ? (
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isHigher ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                        {displayDiff}% {isHigher ? '비쌈' : '저렴'}
                    </span>
                ) : null}
            </span>
            <span className="font-bold text-slate-900 text-right tabular-nums">
                <FormatPrice val={item.price} sizeClass="text-[15px]" />
            </span>
        </div>
    );
};

// Transaction 타입 정의
type Transaction = { date: string; floor: string; area?: string; price: number; type: string };

// DetailData 타입 정의
type DetailData = {
  id: string;
  name: string;
  location: string;
  currentPrice: number;
  diff: number;
  diffRate: number;
  jeonsePrice: number;
  jeonseRatio: number;
  info: Array<{ label: string; value: string }>;
  transactions: Transaction[];
  news: Array<{ title: string; source: string; time: string; url?: string }>;
  neighbors: Array<{ name: string; price: number; diff: number }>;
};

// 날짜를 상대 시간으로 변환하는 함수
const formatRelativeTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    
    // 7일 이상이면 날짜 형식으로 반환
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}.${day}`;
  } catch (error) {
    return dateString;
  }
};

const TransactionRow: React.FC<{ tx: Transaction }> = ({ tx }) => {
    const typeColor = tx.type === '매매' ? 'text-slate-900' : (tx.type === '전세' ? 'text-indigo-600' : 'text-emerald-600');
    
    return (
        <div className="grid grid-cols-5 py-4 px-4 text-[15px] border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors items-center h-[52px]" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div className="text-slate-500 text-[15px] font-medium tabular-nums text-center">{tx.date}</div>
            <div className={`font-bold ${typeColor} text-center text-[15px]`}>{tx.type}</div>
            <div className="text-slate-500 text-center text-[15px] tabular-nums">{tx.area || '-'}</div>
            <div className="text-slate-500 text-center text-[15px] tabular-nums">{tx.floor}</div>
            <div className="text-center tabular-nums">
                <FormatPrice val={tx.price} sizeClass="text-[15px]" />
            </div>
        </div>
    );
}

// Generic Dropdown Component
function GenericDropdown<T extends string>({ 
    value,
    onChange,
    options
}: { 
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string }[];
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-[13px] font-bold bg-white/50 backdrop-blur-sm border border-white/30 rounded-lg py-2 px-3 h-10 focus:ring-0 focus:border-white/40 hover:bg-white/60 shadow-sm transition-colors flex items-center gap-1.5"
            >
                <span>{selectedOption?.label || value}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            
            <div 
                className={`absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 transition-all duration-200 ease-out origin-top min-w-full overflow-y-auto custom-scrollbar ${
                    isOpen 
                        ? 'opacity-100 scale-y-100 translate-y-0 pointer-events-auto max-h-[150px]' 
                        : 'opacity-0 scale-y-95 -translate-y-1 pointer-events-none max-h-0 overflow-hidden'
                }`}
            >
                {options.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => {
                            onChange(option.value);
                            setIsOpen(false);
                        }}
                        className={`w-full text-left text-[13px] font-bold py-2 px-3 hover:bg-slate-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                            value === option.value ? 'bg-slate-100 text-slate-900' : 'text-slate-700'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

const CustomDropdown: React.FC<{ 
    value: TransactionType;
    onChange: (value: TransactionType) => void;
    options: { value: TransactionType; label: string }[];
}> = ({ value, onChange, options }) => {
    return <GenericDropdown value={value} onChange={onChange} options={options} />;
};

// 면적별 가격 데이터 생성 함수
const getAreaBasedData = (basePrice: number, area: string) => {
  if (area === 'all') return basePrice; // 전체 면적인 경우 원래 가격 반환
  const areaMultiplier: Record<string, number> = {
    '84': 1.0,
    '90': 1.15,
    '102': 1.35,
    '114': 1.55,
  };
  const multiplier = areaMultiplier[area] || 1.0;
  return Math.floor(basePrice * multiplier);
};

// 면적별 거래 내역 생성 함수
const generateAreaTransactions = (baseTransactions: typeof detailData1.transactions, area: string) => {
  return baseTransactions.map(tx => ({
    ...tx,
    price: getAreaBasedData(tx.price, area),
  }));
};

export const PropertyDetail: React.FC<PropertyDetailProps> = ({ propertyId, onBack, isCompact = false, isSidebar = false }) => {
  const params = useParams<{ id: string }>();
  const resolvedPropertyId = propertyId || params.id || '1';
  const aptId = Number(resolvedPropertyId);
  
  // Clerk 인증
  const { isSignedIn } = useUser();
  const { getToken } = useClerkAuth();
  
  const [activeTab, setActiveTab] = useState<TabType>('chart');
  const [chartType, setChartType] = useState<ChartType>('전체');
  const [chartData, setChartData] = useState(generateChartData('전체'));
  const [priceTrendData, setPriceTrendData] = useState<{ sale?: { time: string; value: number }[]; jeonse?: { time: string; value: number }[]; monthly?: { time: string; value: number }[] }>({});
  const [chartPeriod, setChartPeriod] = useState('전체');
  const [chartStyle] = useState<'line' | 'area' | 'candlestick'>('area');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isMyProperty, setIsMyProperty] = useState(false);
  const [myPropertyId, setMyPropertyId] = useState<number | null>(null);
  const [myPropertyExclusiveArea, setMyPropertyExclusiveArea] = useState<number | null>(null);
  const [isInCompare, setIsInCompare] = useState(false);
  const [regionId, setRegionId] = useState<number | null>(null);
  // txFilter는 chartType과 동기화됨 (그래프 필터가 실거래 내역에도 적용)
  const [selectedArea, setSelectedArea] = useState('all');
  const [transactionFilter, setTransactionFilter] = useState<'전체' | '매매' | '전세' | '월세'>('전체');
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const periodDropdownRef = useRef<HTMLDivElement>(null);
  const [isChartTypeDropdownOpen, setIsChartTypeDropdownOpen] = useState(false);
  const chartTypeDropdownRef = useRef<HTMLDivElement>(null);
  // 초기값을 빈 객체로 설정하여 새로고침 시 잘못된 데이터가 보이지 않도록 함
  const [detailData, setDetailData] = useState({
    id: '',
    name: '',
    location: '',
    currentPrice: 0,
    diff: 0,
    diffRate: 0,
    jeonsePrice: 0,
    jeonseRatio: 0,
    info: [],
    transactions: [],
    news: [],
    neighbors: []
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [neighborsLoadError, setNeighborsLoadError] = useState<boolean>(false);
  // 초기 로딩 상태를 true로 설정하여 첫 렌더링 시 로딩 스켈레톤 표시
  const [isLoadingDetail, setIsLoadingDetail] = useState(true);
  
  // 내 자산 추가 팝업 상태
  const [isMyPropertyModalOpen, setIsMyPropertyModalOpen] = useState(false);
  const [myPropertyForm, setMyPropertyForm] = useState({
    nickname: '',
    exclusive_area: 84,
    purchase_price: '',
    loan_amount: '',
    purchase_date: '',
    memo: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exclusiveAreaOptions, setExclusiveAreaOptions] = useState<number[]>([]);
  const [isLoadingExclusiveAreas, setIsLoadingExclusiveAreas] = useState(false);
  const [percentileData, setPercentileData] = useState<{ display_text: string; percentile: number; rank: number; total_count: number; region_name: string } | null>(null);
  const [isLoadingPercentile, setIsLoadingPercentile] = useState(false);
  const [isPercentileModalOpen, setIsPercentileModalOpen] = useState(false);
  const percentileButtonRef = useRef<HTMLButtonElement>(null);
  const [modalPosition, setModalPosition] = useState<{ top: number; left: number } | null>(null);
  
  // 즐겨찾기/내 자산 상태 체크
  useEffect(() => {
    const checkStatus = async () => {
      if (!isSignedIn) return;
      
      try {
        const token = await getToken();
        if (token) setAuthToken(token);
        
        const [myPropsRes, favoritesRes] = await Promise.all([
          fetchMyProperties().catch(() => ({ success: false, data: { properties: [] } })),
          fetchFavoriteApartments().catch(() => ({ success: false, data: { favorites: [] } }))
        ]);
        
        // 내 자산에 있는지 확인
        if (myPropsRes.success && myPropsRes.data.properties) {
          const myProp = myPropsRes.data.properties.find(p => p.apt_id === aptId);
          if (myProp) {
            setIsMyProperty(true);
            setMyPropertyId(myProp.property_id);
            setMyPropertyExclusiveArea(myProp.exclusive_area || null);
          }
        }
        
        // 즐겨찾기에 있는지 확인
        if (favoritesRes.success && favoritesRes.data.favorites) {
          const fav = favoritesRes.data.favorites.find(f => f.apt_id === aptId);
          if (fav) {
            setIsFavorite(true);
          }
        }
        
        // 비교 리스트 확인 (로컬 스토리지)
        const compareList = JSON.parse(localStorage.getItem('compareList') || '[]');
        setIsInCompare(compareList.includes(aptId));
        
      } catch (error) {
        console.error('상태 체크 실패:', error);
      }
    };
    
    checkStatus();
  }, [isSignedIn, aptId, getToken]);
  
  // 내 자산인 경우 선택한 면적으로 selectedArea 초기화
  useEffect(() => {
    if (isMyProperty && myPropertyExclusiveArea) {
      setSelectedArea(String(Math.round(myPropertyExclusiveArea)));
    }
  }, [isMyProperty, myPropertyExclusiveArea]);

  // 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(event.target as Node)) {
        setIsPeriodDropdownOpen(false);
      }
      if (chartTypeDropdownRef.current && !chartTypeDropdownRef.current.contains(event.target as Node)) {
        setIsChartTypeDropdownOpen(false);
      }
    };

    if (isPeriodDropdownOpen || isChartTypeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPeriodDropdownOpen, isChartTypeDropdownOpen]);

  // chartType 변경 시 transactionFilter도 동기화
  useEffect(() => {
    if (chartType === '매매') {
      setTransactionFilter('매매');
    } else if (chartType === '전세') {
      setTransactionFilter('전세');
    } else if (chartType === '월세') {
      setTransactionFilter('월세');
    } else if (chartType === '전체') {
      setTransactionFilter('전체');
    }
  }, [chartType]);
  
  // 즐겨찾기 토글
  const handleToggleFavorite = async () => {
    if (!isSignedIn) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    try {
      const token = await getToken();
      if (token) setAuthToken(token);
      
      if (isFavorite) {
        await removeFavoriteApartment(aptId);
        setIsFavorite(false);
      } else {
        await addFavoriteApartment({ apt_id: aptId });
        setIsFavorite(true);
      }
    } catch (error) {
      console.error('즐겨찾기 변경 실패:', error);
      alert('처리 중 오류가 발생했습니다.');
    }
  };
  
  // 전용면적 목록 로드
  useEffect(() => {
    const loadExclusiveAreas = async () => {
      if (!aptId) return;
      
      setIsLoadingExclusiveAreas(true);
      try {
        const response = await fetchApartmentExclusiveAreas(aptId);
        if (response.success && response.data.exclusive_areas.length > 0) {
          setExclusiveAreaOptions(response.data.exclusive_areas);
          // 첫 번째 전용면적을 기본값으로 설정
          setMyPropertyForm(prev => ({
            ...prev,
            exclusive_area: response.data.exclusive_areas[0]
          }));
        } else {
          // 데이터가 없으면 기본값 사용
          setExclusiveAreaOptions([59, 84, 102, 114]);
        }
      } catch (error) {
        console.error('전용면적 목록 로드 실패:', error);
        // 에러 시 기본값 사용
        setExclusiveAreaOptions([59, 84, 102, 114]);
      } finally {
        setIsLoadingExclusiveAreas(false);
      }
    };
    
    loadExclusiveAreas();
  }, [aptId]);
  
  // 뉴스 데이터 로드
  useEffect(() => {
    const loadNews = async () => {
      if (!aptId || isNaN(aptId)) return;
      
      try {
        const newsRes = await fetchNews(5, aptId);
        if (newsRes.success && newsRes.data && newsRes.data.length > 0) {
          const newsItems = newsRes.data.map(item => ({
            title: item.title,
            source: item.source,
            time: formatRelativeTime(item.date),
            url: item.url
          }));
          
          setDetailData(prev => ({
            ...prev,
            news: newsItems
          }));
        } else {
          // 뉴스가 없으면 빈 배열로 설정
          setDetailData(prev => ({
            ...prev,
            news: []
          }));
        }
      } catch (error) {
        console.error('뉴스 로드 실패:', error);
        // 에러 시 빈 배열로 설정
        setDetailData(prev => ({
          ...prev,
          news: []
        }));
      }
    };
    
    loadNews();
  }, [aptId]);
  
  // 주변 아파트 목록 로드 (nearby-comparison API 사용)
  useEffect(() => {
    const loadNeighbors = async () => {
      if (!aptId) return;
      
      setNeighborsLoadError(false);
      
      try {
        // nearby-comparison API 호출 (radius_meters: 1000m, months: 1)
        // selectedArea가 'all'이 아니면 해당 면적을 전달
        const areaParam = selectedArea !== 'all' ? Number(selectedArea) : undefined;
        
        // chartType을 transaction_type으로 변환
        const transactionTypeMap = {
          '매매': 'sale' as const,
          '전세': 'jeonse' as const,
          '월세': 'monthly' as const
        };
        const transactionType = transactionTypeMap[chartType] || 'sale';
        
        const neighborsRes = await fetchNearbyComparison(aptId, 1000, 1, areaParam, transactionType);
        
        if (neighborsRes.success && neighborsRes.data.nearby_apartments.length > 0) {
          // 현재 가격과 비교하기 위한 기준 가격
          const currentPriceForComparison = chartType === '매매' || chartType === '전체'
            ? detailData.currentPrice 
            : chartType === '전세' 
            ? detailData.jeonsePrice 
            : 0;  // 월세는 보증금 기준이므로 일단 0으로 설정 (필요시 수정)
          
          // API 응답 데이터를 NeighborItem 형식으로 변환
          const neighbors = neighborsRes.data.nearby_apartments
            .filter(item => {
              // average_price가 있는 것만 (null이 아닌 것)
              if (item.average_price === null || item.average_price <= 0) return false;
              return true;
            })
            .map(item => {
              const diff = currentPriceForComparison > 0 
                ? ((item.average_price - currentPriceForComparison) / currentPriceForComparison) * 100 
                : 0;
              return {
                name: item.apt_name,
                price: item.average_price,
                diff: diff
              };
            });
          
          setDetailData(prev => ({
            ...prev,
            neighbors: neighbors.length > 0 ? neighbors : []
          }));
        } else {
          // API 응답은 성공했지만 결과가 없는 경우
          setDetailData(prev => ({
            ...prev,
            neighbors: []
          }));
        }
      } catch (error) {
        console.error('주변 아파트 목록 로드 실패:', error);
        setNeighborsLoadError(true);
        setDetailData(prev => ({
          ...prev,
          neighbors: []
        }));
      }
    };
    
    loadNeighbors();
  }, [aptId, chartType, detailData.currentPrice, detailData.jeonsePrice, selectedArea]);
  
  // 모달이 열릴 때 전용면적 목록 다시 로드 (추가 모드에서만 첫 번째 면적을 기본값으로 설정)
  useEffect(() => {
    if (isMyPropertyModalOpen && aptId) {
      const loadExclusiveAreas = async () => {
        setIsLoadingExclusiveAreas(true);
        try {
          const response = await fetchApartmentExclusiveAreas(aptId);
          if (response.success && response.data.exclusive_areas.length > 0) {
            setExclusiveAreaOptions(response.data.exclusive_areas);
            if (!isMyProperty || !myPropertyId) {
              setMyPropertyForm(prev => ({
                ...prev,
                exclusive_area: response.data.exclusive_areas[0]
              }));
            }
          } else {
            setExclusiveAreaOptions([59, 84, 102, 114]);
          }
        } catch (error) {
          console.error('전용면적 목록 로드 실패:', error);
          setExclusiveAreaOptions([59, 84, 102, 114]);
        } finally {
          setIsLoadingExclusiveAreas(false);
        }
      };
      
      loadExclusiveAreas();
    }
  }, [isMyPropertyModalOpen, aptId, isMyProperty, myPropertyId]);
  
  // 수정 모드: 모달이 열릴 때 기존 자산 데이터 로드 후 폼에 반영
  useEffect(() => {
    if (isMyPropertyModalOpen && isMyProperty && myPropertyId) {
      const loadExistingProperty = async () => {
        try {
          const response = await fetchMyPropertyDetail(myPropertyId);
          if (response.success && response.data) {
            const p = response.data;
            setMyPropertyForm({
              nickname: p.nickname || '',
              exclusive_area: p.exclusive_area ?? 84,
              purchase_price: p.purchase_price != null ? String(p.purchase_price) : '',
              loan_amount: p.loan_amount != null ? String(p.loan_amount) : '',
              purchase_date: p.purchase_date || '',
              memo: p.memo || ''
            });
          }
        } catch (error) {
          console.error('내 자산 상세 로드 실패:', error);
        }
      };
      loadExistingProperty();
    }
  }, [isMyPropertyModalOpen, isMyProperty, myPropertyId]);
  
  // 전용면적별 가격 계산 (거래 내역 기반)
  const getPriceForArea = useMemo(() => {
    return (area: number): number | null => {
      // 해당 면적과 유사한 거래 내역 찾기 (±5㎡ 허용)
      const similarTransactions = detailData.transactions.filter(tx => {
        if (!tx.area || tx.area === '-') return false;
        const txArea = parseFloat(tx.area.replace(/[^0-9.]/g, ''));
        if (isNaN(txArea)) return false;
        return Math.abs(txArea - area) <= 5;
      });
      
      if (similarTransactions.length === 0) return null;
      
      // 최신 거래 가격 사용
      const latestTx = similarTransactions[0];
      return latestTx.price;
    };
  }, [detailData.transactions]);
  
  // 전용면적 변경 시 가격 자동 업데이트
  useEffect(() => {
    if (isMyPropertyModalOpen && myPropertyForm.exclusive_area) {
      const priceForArea = getPriceForArea(myPropertyForm.exclusive_area);
      if (priceForArea !== null && !myPropertyForm.purchase_price) {
        // 구매가가 비어있을 때만 자동으로 설정
        setMyPropertyForm(prev => ({
          ...prev,
          purchase_price: String(Math.round(priceForArea / 10000)) // 만원 단위로 변환
        }));
      }
    }
  }, [myPropertyForm.exclusive_area, isMyPropertyModalOpen, getPriceForArea]);
  
  // 내 자산 추가/수정 제출
  const handleMyPropertySubmit = async () => {
    if (!isSignedIn) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (token) setAuthToken(token);
      
      const priceForArea = getPriceForArea(myPropertyForm.exclusive_area);
      const currentMarketPrice = priceForArea ? Math.round(priceForArea / 10000) : undefined;
      
      if (isMyProperty && myPropertyId) {
        // 수정 모드: updateMyProperty 호출
        const updateData = {
          nickname: myPropertyForm.nickname || detailData.name,
          exclusive_area: myPropertyForm.exclusive_area,
          current_market_price: currentMarketPrice,
          purchase_price: myPropertyForm.purchase_price ? parseInt(myPropertyForm.purchase_price, 10) : undefined,
          loan_amount: myPropertyForm.loan_amount ? parseInt(myPropertyForm.loan_amount, 10) : undefined,
          purchase_date: myPropertyForm.purchase_date || undefined,
          memo: myPropertyForm.memo || undefined
        };
        const response = await updateMyProperty(myPropertyId, updateData);
        if (response.success) {
          setMyPropertyExclusiveArea(myPropertyForm.exclusive_area);
          setIsMyPropertyModalOpen(false);
          alert('내 자산 정보가 수정되었습니다.');
        }
      } else {
        // 추가 모드: createMyProperty 호출
        const data = {
          apt_id: aptId,
          nickname: myPropertyForm.nickname || detailData.name,
          exclusive_area: myPropertyForm.exclusive_area,
          current_market_price: currentMarketPrice,
          purchase_price: myPropertyForm.purchase_price ? parseInt(myPropertyForm.purchase_price, 10) : undefined,
          loan_amount: myPropertyForm.loan_amount ? parseInt(myPropertyForm.loan_amount, 10) : undefined,
          purchase_date: myPropertyForm.purchase_date || undefined,
          memo: myPropertyForm.memo || undefined
        };
        const response = await createMyProperty(data);
        if (response.success) {
          setIsMyProperty(true);
          setMyPropertyId(response.data.property_id);
          setMyPropertyExclusiveArea(myPropertyForm.exclusive_area);
          setIsMyPropertyModalOpen(false);
          alert('내 자산에 추가되었습니다.');
          setMyPropertyForm({
            nickname: '',
            exclusive_area: exclusiveAreaOptions[0] || 84,
            purchase_price: '',
            loan_amount: '',
            purchase_date: '',
            memo: ''
          });
        }
      }
    } catch (error) {
      console.error(isMyProperty && myPropertyId ? '내 자산 수정 실패:' : '내 자산 추가 실패:', error);
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 내 자산 삭제
  const handleDeleteMyProperty = async () => {
    if (!myPropertyId) return;
    
    if (!confirm('내 자산에서 삭제하시겠습니까?')) return;
    
    try {
      const token = await getToken();
      if (token) setAuthToken(token);
      
      await deleteMyProperty(myPropertyId);
      setIsMyProperty(false);
      setMyPropertyId(null);
      alert('내 자산에서 삭제되었습니다.');
      // 삭제 후 뒤로 가기
      onBack();
    } catch (error) {
      console.error('내 자산 삭제 실패:', error);
      alert('처리 중 오류가 발생했습니다.');
    }
  };
  
  // Percentile 자동 로드 (내 자산인 경우)
  useEffect(() => {
    const loadPercentile = async () => {
      if (!isMyProperty) return;
      
      setIsLoadingPercentile(true);
      try {
        const data = await fetchApartmentPercentile(aptId);
        setPercentileData({
          display_text: data.display_text,
          percentile: data.percentile,
          rank: data.rank,
          total_count: data.total_count,
          region_name: data.region_name
        });
      } catch (error: any) {
        console.error('Percentile 조회 실패:', error);
        // 에러는 조용히 처리 (표시하지 않음)
        setPercentileData(null);
      } finally {
        setIsLoadingPercentile(false);
      }
    };
    
    loadPercentile();
  }, [isMyProperty, aptId]);
  
  // 비교 리스트 토글
  const handleToggleCompare = () => {
    const compareList = JSON.parse(localStorage.getItem('compareList') || '[]');
    
    if (isInCompare) {
      const newList = compareList.filter((id: number) => id !== aptId);
      localStorage.setItem('compareList', JSON.stringify(newList));
      setIsInCompare(false);
    } else {
      if (compareList.length >= 5) {
        alert('비교 리스트는 최대 5개까지 추가할 수 있습니다.');
        return;
      }
      compareList.push(aptId);
      localStorage.setItem('compareList', JSON.stringify(compareList));
      setIsInCompare(true);
    }
  };

  useEffect(() => {
      let isActive = true;
      const loadDetail = async () => {
          try {
              setIsLoadingDetail(true); // 로딩 시작
              setLoadError(null);
              const fallback = getDetailData(resolvedPropertyId);
              setDetailData(fallback);
              
              // months=36으로 3년치 데이터 조회
              // 모든 면적의 데이터를 가져옴 (내 자산이어도 전체 데이터 조회)
              const [detailRes, saleRes, jeonseRes] = await Promise.all([
                  fetchApartmentDetail(Number(resolvedPropertyId)),
                  fetchApartmentTransactions(Number(resolvedPropertyId), 'sale', 50, 36),
                  fetchApartmentTransactions(Number(resolvedPropertyId), 'jeonse', 50, 36)
              ]);
              
              if (!isActive) return;
              
              const saleTransactions = saleRes.data.recent_transactions || [];
              const jeonseTransactions = jeonseRes.data.recent_transactions || [];
              
              // 최신 거래 사용
              const latestSale = saleTransactions[0];
              const latestJeonse = jeonseTransactions[0];
              
              // price_trend의 최신 데이터를 우선 사용 (전체 면적 기준)
              const saleTrend = saleRes.data.price_trend
                  ?.map((item: any) => ({
                      time: `${item.month}-01`,
                      value: item.avg_price
                  }))
                  .filter((item) => item.time && item.time !== 'undefined-01' && item.value && !isNaN(item.value))
                  .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()) || [];
              
              const jeonseTrend = jeonseRes.data.price_trend
                  ?.map((item: any) => ({
                      time: `${item.month}-01`,
                      value: item.avg_price
                  }))
                  .filter((item) => item.time && item.time !== 'undefined-01' && item.value && !isNaN(item.value))
                  .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()) || [];
              
              // 그래프의 최신 데이터와 현재 시세를 동일하게 맞춤 (전체 면적 기준)
              // price_trend의 최신 값이 있으면 그것을 사용, 없으면 최신 거래가 사용
              const latestTrendPrice = saleTrend.length > 0 ? saleTrend[saleTrend.length - 1].value : null;
              // 내 자산일 경우 필터링된 최신 거래가 우선 사용
              const currentPrice = latestSale?.price || latestTrendPrice || fallback.currentPrice;
              
              const latestJeonseTrendPrice = jeonseTrend.length > 0 ? jeonseTrend[jeonseTrend.length - 1].value : null;
              // 내 자산일 경우 필터링된 최신 전세가 우선 사용
              const jeonsePrice = latestJeonse?.price || latestJeonseTrendPrice || fallback.jeonsePrice || 0;
              
              const previousAvg = saleRes.data.change_summary.previous_avg ?? 0;
              const recentAvg = saleRes.data.change_summary.recent_avg ?? 0;
              const diff = recentAvg ? Math.round(recentAvg - previousAvg) : 0;
              const diffRate = saleRes.data.change_summary.change_rate ?? fallback.diffRate ?? 0;
              
              const mergedTransactions = [
                  ...saleTransactions.map((tx) => ({
                      date: tx.date ? tx.date.replace(/-/g, '.').slice(2) : '-',
                      floor: `${tx.floor}층`,
                      area: tx.area ? `${tx.area.toFixed(1)}㎡` : '-',
                      price: tx.price,
                      type: '매매'
                  })),
                  ...jeonseTransactions.map((tx) => ({
                      date: tx.date ? tx.date.replace(/-/g, '.').slice(2) : '-',
                      floor: `${tx.floor}층`,
                      area: tx.area ? `${tx.area.toFixed(1)}㎡` : '-',
                      price: tx.price,
                      type: '전세'
                  }))
              ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
              
              // 건물 연식 계산
              const useApprovalDate = detailRes.data.use_approval_date;
              let buildingAge = '-';
              if (useApprovalDate) {
                  const approvalYear = new Date(useApprovalDate).getFullYear();
                  const currentYear = new Date().getFullYear();
                  const age = currentYear - approvalYear;
                  buildingAge = `${approvalYear}년 (${age}년차)`;
              }
              
              // 주차 확보율 계산
              const parkingRatio = detailRes.data.total_parking_cnt && detailRes.data.total_household_cnt
                  ? (detailRes.data.total_parking_cnt / detailRes.data.total_household_cnt).toFixed(1)
                  : '-';
              
              // 지하철 정보 포맷팅 (호선 제거, 역명만 표시)
              const subwayInfo = detailRes.data.subway_station
                  ? (() => {
                      if (!detailRes.data.subway_time) {
                          return detailRes.data.subway_station;
                      }
                      let timeStr = String(detailRes.data.subway_time).trim();
                      return `${detailRes.data.subway_station} (도보 ${timeStr})`;
                  })()
                  : '-';
              
              // 교육시설 정보 파싱
              let educationInfo = '-';
              if (detailRes.data.educationFacility) {
                  const facilities = [];
                  const elemMatch = detailRes.data.educationFacility.match(/초등학교\(([^)]+)\)/);
                  const middleMatch = detailRes.data.educationFacility.match(/중학교\(([^)]+)\)/);
                  const highMatch = detailRes.data.educationFacility.match(/고등학교\(([^)]+)\)/);
                  
                  if (elemMatch) facilities.push(`초등: ${elemMatch[1]}`);
                  if (middleMatch) facilities.push(`중등: ${middleMatch[1]}`);
                  if (highMatch) facilities.push(`고등: ${highMatch[1]}`);
                  
                  educationInfo = facilities.length > 0 ? facilities.join(', ') : '-';
              }
              
              // 사용자 요청 순서대로 정보 구성
              const info = [
                  // 1행: 근처 지하철역 / 근처 지하철 호선
                  { label: '근처 지하철역', value: subwayInfo },
                  { label: '근처 지하철 호선', value: detailRes.data.subway_line || '-' },
                  
                  // 2행: 시공사 / 시행사
                  { label: '시공사', value: detailRes.data.builder_name || '-' },
                  { label: '시행사', value: detailRes.data.developer_name || '-' },
                  
                  // 3행: 최고층수 / 총 주차 대수
                  { label: '최고층수', value: detailRes.data.highest_floor ? `${detailRes.data.highest_floor}층` : '-' },
                  { label: '총 주차 대수', value: detailRes.data.total_parking_cnt ? `${detailRes.data.total_parking_cnt.toLocaleString()}대` : '-' },
                  
                  // 4행: 교육시설 / 복도유형
                  { label: '교육시설', value: educationInfo },
                  { label: '복도유형', value: detailRes.data.hallway_type || '-' },
                  
                  // 5행: 난방방식 / 관리방식
                  { label: '난방방식', value: detailRes.data.code_heat_nm || '-' },
                  { label: '관리방식', value: detailRes.data.manage_type || '-' },
                  
                  // 기본 정보로 표시되지만 계산에 필요한 항목들 (필터링으로 제외됨)
                  { label: '건물 연식', value: buildingAge },
                  { label: '총 세대수', value: detailRes.data.total_household_cnt ? `${detailRes.data.total_household_cnt.toLocaleString()}세대` : '-' },
                  { label: '주차 확보율', value: parkingRatio !== '-' ? `세대당 ${parkingRatio}대` : '-' }
              ];
              
              // region_id 저장
              if (detailRes.data.region_id) {
                  setRegionId(detailRes.data.region_id);
              }
              
              const mapped = {
                  ...fallback,
                  id: String(detailRes.data.apt_id),
                  name: detailRes.data.apt_name || fallback.name,
                  location: detailRes.data.road_address || fallback.location,
                  currentPrice,
                  diff,
                  diffRate,
                  jeonsePrice,
                  jeonseRatio: currentPrice ? Math.round((jeonsePrice / currentPrice) * 1000) / 10 : fallback.jeonseRatio,
                  info,
                  transactions: mergedTransactions,
                  news: fallback.news,
                  neighbors: fallback.neighbors
              };
              
              // saleTrend와 jeonseTrend는 위에서 이미 생성됨
              
              setDetailData(mapped);
              setPriceTrendData({ sale: saleTrend, jeonse: jeonseTrend });
              setIsLoadingDetail(false); // 로딩 완료
          } catch (error) {
              if (!isActive) return;
              setLoadError(error instanceof Error ? error.message : '상세 정보를 불러오지 못했습니다.');
              setIsLoadingDetail(false); // 에러 시에도 로딩 종료
          }
      };
      
      loadDetail();
      return () => {
          isActive = false;
      };
              }, [resolvedPropertyId, isMyProperty, myPropertyExclusiveArea]);
  
  // 면적 목록 동적 생성 (transaction 데이터 기반)
  const areaOptions = useMemo(() => {
    const areas = new Set<string>();
    areas.add('all'); // 전체 옵션 추가
    
    if (detailData.transactions) {
      detailData.transactions.forEach(tx => {
        if (tx.area && tx.area !== '-') {
          // "84.5㎡" 또는 "84.5" 형식에서 숫자 추출
          const areaStr = tx.area.replace(/[^0-9.]/g, '');
          if (areaStr) {
            const areaNum = parseFloat(areaStr);
            if (!isNaN(areaNum) && areaNum > 0) {
              // 면적을 반올림하여 표준 면적으로 그룹화 (예: 84.5 -> 84, 89.5 -> 90)
              const roundedArea = Math.round(areaNum);
              areas.add(String(roundedArea));
            }
          }
        }
      });
    }
    
    // 숫자 오름차순 정렬 ('all'은 맨 앞으로)
    return Array.from(areas).sort((a, b) => {
      if (a === 'all') return -1;
      if (b === 'all') return 1;
      return Number(a) - Number(b);
    }).map(area => ({
      value: area,
      label: area === 'all' ? '전체 면적' : `${area}㎡`
    }));
  }, [detailData.transactions]);

  // 면적별 데이터 계산
  const areaBasedPrice = useMemo(() => getAreaBasedData(detailData.currentPrice, selectedArea), [detailData.currentPrice, selectedArea]);
  const areaBasedDiff = useMemo(() => getAreaBasedData(detailData.diff, selectedArea), [detailData.diff, selectedArea]);
  const areaBasedDiffRate = detailData.diffRate; // 비율은 동일
  
  // 면적별 거래 내역 필터링 (생성이 아니라 필터링)
  const areaBasedTransactions = useMemo(() => {
    if (selectedArea === 'all') return detailData.transactions;
    return detailData.transactions.filter(tx => {
       if (!tx.area || tx.area === '-') return false;
       // 면적 문자열에서 숫자 추출 및 반올림
       const areaStr = tx.area.replace(/[^0-9.]/g, '');
       if (!areaStr) return false;
       const areaNum = parseFloat(areaStr);
       if (isNaN(areaNum) || areaNum <= 0) return false;
       const roundedArea = Math.round(areaNum);
       return String(roundedArea) === selectedArea;
    });
  }, [detailData.transactions, selectedArea]);

  // 날짜 파싱 헬퍼 함수
  const parseDate = (dateStr: string): Date | null => {
      if (!dateStr || dateStr === '-') return null;
      // YY.MM.DD 형식 처리
      const parts = dateStr.split('.');
      if (parts.length === 3) {
          const year = 2000 + parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          const day = parseInt(parts[2]);
          return new Date(year, month, day);
      }
      // YYYY-MM-DD 형식 처리
      const isoParts = dateStr.split('-');
      if (isoParts.length === 3) {
          return new Date(parseInt(isoParts[0]), parseInt(isoParts[1]) - 1, parseInt(isoParts[2]));
      }
      return null;
  };

  // 실거래 내역 필터 (transactionFilter 기준)
  const filteredTransactions = useMemo(() => {
      let filtered = areaBasedTransactions;
      
      // 거래 유형 필터 (transactionFilter 기준)
      if (transactionFilter === '매매') {
          filtered = filtered.filter(tx => tx.type === '매매');
      } else if (transactionFilter === '전세') {
          filtered = filtered.filter(tx => tx.type === '전세');
      } else if (transactionFilter === '월세') {
          filtered = filtered.filter(tx => tx.type === '월세');
      }
      // '전체'인 경우 필터링하지 않음
      
      // 기간 필터 적용
      if (chartPeriod !== '전체') {
          const now = new Date();
          let startDate: Date;
          
          if (chartPeriod === '6개월') {
              startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          } else if (chartPeriod === '1년') {
              startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          } else if (chartPeriod === '3년') {
              startDate = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
          } else {
              startDate = new Date(0);
          }
          
          filtered = filtered.filter(tx => {
              const txDate = parseDate(tx.date);
              if (txDate) {
                  return txDate >= startDate;
              }
              return true;
          });
      }
      
      return filtered;
  }, [areaBasedTransactions, transactionFilter, chartPeriod]);

  // 차트 데이터 업데이트 (filteredTransactions 정의 후)
  useEffect(() => {
      const now = new Date();
      let startDate: Date;
      
      if (chartPeriod === '6개월') {
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      } else if (chartPeriod === '1년') {
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      } else if (chartPeriod === '3년') {
          startDate = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
      } else {
          startDate = new Date(0); // 전체
      }

      // 캔들 그래프를 위한 OHLC 데이터 생성 함수
      const createCandlestickData = (transactions: typeof filteredTransactions) => {
          // 월별로 그룹화 (날짜와 가격을 함께 저장)
          const monthlyData: Record<string, Array<{ date: Date; price: number }>> = {};
          
          transactions.forEach(tx => {
              const txDate = parseDate(tx.date);
              if (!txDate) return;
              
              const yearMonth = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
              if (!monthlyData[yearMonth]) {
                  monthlyData[yearMonth] = [];
              }
              monthlyData[yearMonth].push({ date: txDate, price: tx.price });
          });
          
          // 각 월별로 OHLC 계산
          return Object.entries(monthlyData)
              .map(([yearMonth, transactions]) => {
                  if (transactions.length === 0) return null;
                  
                  // 날짜 순으로 정렬 (오래된 것부터)
                  transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
                  
                  const prices = transactions.map(t => t.price);
                  const open = transactions[0].price; // 월초 첫 거래가
                  const close = transactions[transactions.length - 1].price; // 월말 마지막 거래가
                  const high = Math.max(...prices); // 월 최고가
                  const low = Math.min(...prices); // 월 최저가
                  
                  return {
                      time: `${yearMonth}-01`,
                      value: close, // 기본값으로 close 사용
                      open,
                      high,
                      low,
                      close
                  };
              })
              .filter(item => item !== null)
              .sort((a, b) => new Date(a!.time).getTime() - new Date(b!.time).getTime()) as Array<{
                  time: string;
                  value: number;
                  open: number;
                  high: number;
                  low: number;
                  close: number;
              }>;
      };

      // 캔들 그래프인 경우 OHLC 데이터 생성
      if (chartStyle === 'candlestick') {
          // 특정 면적이 선택된 경우: chartType 기준으로 필터링
          // 전체 면적인 경우: transactionFilter 기준으로 필터링 (실거래 내역과 동일)
          let candlestickFilteredTransactions = selectedArea !== 'all' 
              ? (() => {
                  let filtered = areaBasedTransactions;
                  if (chartType === '매매') {
                      filtered = filtered.filter(tx => tx.type === '매매');
                  } else if (chartType === '전세') {
                      filtered = filtered.filter(tx => tx.type === '전세');
                  } else if (chartType === '월세') {
                      filtered = filtered.filter(tx => tx.type === '월세');
                  }
                  // '전체'인 경우 필터링하지 않음
                  return filtered;
              })()
              : filteredTransactions;
          
          if (candlestickFilteredTransactions.length > 0) {
              const candlestickData = createCandlestickData(candlestickFilteredTransactions);
              const filteredCandlestick = candlestickData.filter(item => {
                  const itemDate = new Date(item.time);
                  return itemDate >= startDate;
              });
              setChartData(filteredCandlestick);
          } else {
              setChartData([]);
          }
          return;
      }

      // 특정 면적이 선택된 경우: 실제 거래 데이터로 차트 생성 (평균 사용 X)
      if (selectedArea !== 'all') {
          // chartType을 기준으로 필터링 (transactionFilter가 아닌 chartType 사용)
          let chartFilteredTransactions = areaBasedTransactions;
          
          if (chartType === '매매') {
              chartFilteredTransactions = chartFilteredTransactions.filter(tx => tx.type === '매매');
          } else if (chartType === '전세') {
              chartFilteredTransactions = chartFilteredTransactions.filter(tx => tx.type === '전세');
          } else if (chartType === '월세') {
              chartFilteredTransactions = chartFilteredTransactions.filter(tx => tx.type === '월세');
          }
          // '전체'인 경우 필터링하지 않음
          
          // 기간 필터 적용
          if (chartPeriod !== '전체') {
              const now = new Date();
              let startDate: Date;
              
              if (chartPeriod === '6개월') {
                  startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
              } else if (chartPeriod === '1년') {
                  startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
              } else if (chartPeriod === '3년') {
                  startDate = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
              } else {
                  startDate = new Date(0);
              }
              
              chartFilteredTransactions = chartFilteredTransactions.filter(tx => {
                  const txDate = parseDate(tx.date);
                  if (txDate) {
                      return txDate >= startDate;
                  }
                  return true;
              });
          }
          
          if (chartFilteredTransactions.length > 0) {
              const chartDataFromTransactions = chartFilteredTransactions
                  .map(tx => {
                      const txDate = parseDate(tx.date);
                      if (!txDate) return null;
                      
                      // YYYY-MM-DD 형식 변환
                      const yyyy = txDate.getFullYear();
                      const mm = String(txDate.getMonth() + 1).padStart(2, '0');
                      const dd = String(txDate.getDate()).padStart(2, '0');
                      
                      return {
                          time: `${yyyy}-${mm}-${dd}`,
                          value: tx.price
                      };
                  })
                  .filter(item => item !== null)
                  .sort((a, b) => new Date(a!.time).getTime() - new Date(b!.time).getTime()) as { time: string; value: number }[];
              
              setChartData(chartDataFromTransactions);
          } else {
              setChartData([]); // 데이터 없음
          }
          return;
      }
      
      // 전체 면적 선택 시: API에서 가져온 평균 데이터 사용 (기간 필터 적용)
      let sourceData: { time: string; value: number }[] = [];
      
      if (chartType === '매매' && priceTrendData.sale?.length) {
          sourceData = priceTrendData.sale;
      } else if (chartType === '전세' && priceTrendData.jeonse?.length) {
          sourceData = priceTrendData.jeonse;
      } else if (chartType === '월세' && priceTrendData.monthly?.length) {
          sourceData = priceTrendData.monthly;
      } else if (chartType === '전체' && priceTrendData.sale?.length) {
          // '전체'인 경우 매매 데이터를 기본으로 사용
          sourceData = priceTrendData.sale;
      }
      
      if (sourceData.length > 0) {
          const filteredData = sourceData.filter(item => {
              const itemDate = new Date(item.time);
              return itemDate >= startDate;
          });
          setChartData(filteredData);
      } else {
           setChartData([]); // 데이터 없음 또는 로딩 전
      }
  }, [chartType, chartPeriod, priceTrendData, selectedArea, filteredTransactions, chartStyle]);

  return (
    <div 
      className={`min-h-full font-sans text-slate-900 ${isCompact ? 'p-0' : ''} ${isSidebar ? 'p-0' : ''}`}
      style={{
        background: 'transparent'
      }}
    >
      
      {loadError && (
        <div className="mb-4 mx-6 md:mx-0 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold border border-red-100">
          {loadError}
        </div>
      )}
      
      {isLoadingDetail && !isCompact && (
        <div className={`${isSidebar ? 'p-5 space-y-5' : 'max-w-[1400px] mx-auto'}`}>
          {/* 로딩 스켈레톤 */}
          <Card className={`${isSidebar ? 'bg-transparent shadow-none border-0 p-5' : 'bg-white border border-slate-100 shadow-sm p-8'}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <Skeleton className="h-8 w-48 rounded-lg" />
              </div>
              <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
            <div className="mt-6 flex items-center gap-4">
              <Skeleton className="h-12 w-40 rounded-lg" />
              <Skeleton className="h-8 w-32 rounded-lg" />
            </div>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-8 pb-8">
            <div className="lg:col-span-3 space-y-8">
              <Card className="bg-white border border-slate-100 shadow-sm h-[500px] flex flex-col overflow-hidden">
                <Skeleton className="h-12 w-full rounded-t-[24px]" />
                <Skeleton className="h-full w-full" />
              </Card>
            </div>
            <div className="lg:col-span-2 space-y-8">
              <Card className="bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[500px]">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-full w-full" />
              </Card>
            </div>
          </div>
        </div>
      )}
      
      {!isLoadingDetail && !isCompact && (
          <>
            {!isSidebar && (
              <>
              </>
            )}

            <div className={`${isSidebar ? 'p-5 space-y-5' : 'max-w-[1400px] mx-auto py-8'}`}>
                
                {/* 1. Header Card: Refined Layout (Stock App Style) */}
                <Card className={`${isSidebar ? 'bg-transparent shadow-none border-0 p-5' : 'bg-white border border-slate-100 shadow-sm p-8'}`}>
                    {/* Apartment Name */}
                    {!isSidebar && (
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <button onClick={onBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <h1 className="text-2xl font-bold text-slate-900 leading-none">{detailData.name}</h1>
                                {isMyProperty && (
                                    <>
                                        {isLoadingPercentile ? (
                                            <div className="px-3 py-1.5 rounded-full bg-blue-100 text-blue-600 text-[12px] font-bold">
                                                로딩 중...
                                            </div>
                                        ) : percentileData ? (() => {
                                            const percentile = percentileData.percentile;
                                            let bgColor = '';
                                            let hoverColor = '';
                                            let textColor = 'text-white';
                                            
                                            if (percentile <= 10) {
                                                // 딥 퍼플 (0 ~ 10%)
                                                bgColor = 'bg-[#4B0082]';
                                                hoverColor = 'hover:bg-[#3A0066]';
                                            } else if (percentile <= 25) {
                                                // 네이비 (10 ~ 25%)
                                                bgColor = 'bg-[#000080]';
                                                hoverColor = 'hover:bg-[#000060]';
                                            } else if (percentile <= 50) {
                                                // 스카이 블루 (25 ~ 50%)
                                                bgColor = 'bg-[#87CEEB]';
                                                hoverColor = 'hover:bg-[#6BB6D6]';
                                                textColor = 'text-slate-900'; // 스카이 블루는 밝아서 검은 텍스트
                                            } else {
                                                // 라이트 그레이 (50% 이하)
                                                bgColor = 'bg-[#D3D3D3]';
                                                hoverColor = 'hover:bg-[#B8B8B8]';
                                                textColor = 'text-slate-700';
                                            }
                                            
                                            return (
                                                <button
                                                    ref={percentileButtonRef}
                                                    onClick={(e) => {
                                                        const button = e.currentTarget;
                                                        const rect = button.getBoundingClientRect();
                                                        const modalWidth = 320;
                                                        const modalHeight = 200; // 대략적인 높이
                                                        const padding = 16;
                                                        
                                                        // 화면 경계 체크
                                                        let left = rect.left;
                                                        let top = rect.bottom + 8;
                                                        
                                                        // 오른쪽 경계 체크
                                                        if (left + modalWidth > window.innerWidth - padding) {
                                                            left = window.innerWidth - modalWidth - padding;
                                                        }
                                                        
                                                        // 왼쪽 경계 체크
                                                        if (left < padding) {
                                                            left = padding;
                                                        }
                                                        
                                                        // 아래쪽 경계 체크 (화면 밖으로 나가면 위에 표시)
                                                        if (top + modalHeight > window.innerHeight - padding) {
                                                            top = rect.top - modalHeight - 8;
                                                        }
                                                        
                                                        setModalPosition({
                                                            top: Math.max(padding, top),
                                                            left: left
                                                        });
                                                        setIsPercentileModalOpen(true);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-full ${bgColor} ${textColor} text-[12px] font-bold shadow-sm ${hoverColor} transition-colors cursor-pointer`}
                                                >
                                                    상위 {percentileData.percentile.toFixed(1)}%
                                                </button>
                                            );
                                        })() : null}
                                        </>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleToggleFavorite}
                                    className={`p-2.5 rounded-xl transition-all duration-200 flex-shrink-0 ${isFavorite ? 'bg-yellow-50 text-yellow-500 scale-110' : 'text-slate-400 hover:bg-slate-100 hover:scale-105'}`}
                                    title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                                >
                                    <Star className={`w-5 h-5 transition-transform ${isFavorite ? 'fill-yellow-500' : ''}`} />
                                </button>
                                {isMyProperty && (
                                    <button 
                                        onClick={handleDeleteMyProperty}
                                        className="bg-red-50 text-red-600 text-[13px] font-bold p-2.5 rounded-xl hover:bg-red-100 transition-all duration-200 shadow-sm"
                                        title="내 자산에서 삭제"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Middle Row: Big Price & Change */}
                    <div className={`${isSidebar ? 'mt-0' : 'mt-0'} flex items-center justify-between gap-4 flex-wrap`}>
                        <div className="flex items-center gap-4 flex-wrap">
                            <FormatPrice val={isSidebar ? areaBasedPrice : detailData.currentPrice} sizeClass={isSidebar ? "text-[32px]" : "text-[42px]"} />
                            
                            <div className="flex flex-col leading-none">
                                <span className={`${isSidebar ? 'text-[16px]' : 'text-[15px]'} font-medium text-slate-400 mb-1`}>지난 실거래가 대비</span>
                                <div className="flex items-center gap-1">
                                    <span className={`${isSidebar ? 'text-[16px]' : 'text-[15px]'} font-bold ${areaBasedDiffRate >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                        {areaBasedDiffRate >= 0 ? '▲' : '▼'}
                                    </span>
                                    <FormatPriceChangeValue val={areaBasedDiffRate >= 0 ? Math.abs(isSidebar ? areaBasedDiff : detailData.diff) : -Math.abs(isSidebar ? areaBasedDiff : detailData.diff)} sizeClass={isSidebar ? 'text-[16px]' : 'text-[15px]'} />
                                    <span className={`${isSidebar ? 'text-[16px]' : 'text-[15px]'} font-bold tabular-nums ${areaBasedDiffRate >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                        ({Math.abs(areaBasedDiffRate)}%)
                                    </span>
                                </div>
                            </div>
                        </div>
                        {!isSidebar && (
                            <div className="flex flex-row gap-2">
                                {/* 비교함 버튼 */}
                                <button 
                                    onClick={handleToggleCompare}
                                    className={`text-[13px] font-bold px-4 py-2.5 rounded-xl transition-all duration-200 shadow-sm flex items-center gap-1.5 ${
                                        isInCompare
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                    }`}
                                >
                                    {isInCompare ? (
                                        <>
                                            <Check className="w-3.5 h-3.5" />
                                            비교함에 담김
                                        </>
                                    ) : (
                                        <>
                                            <ArrowRightLeft className="w-3.5 h-3.5" />
                                            비교함 담기
                                        </>
                                    )}
                                </button>
                                
                                {/* 내 자산 버튼 */}
                                {isMyProperty ? (
                                    <button 
                                        onClick={() => setIsMyPropertyModalOpen(true)}
                                        className="bg-emerald-600 text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:bg-emerald-700 transition-all duration-200 shadow-sm flex items-center gap-1.5"
                                    >
                                        <Home className="w-3.5 h-3.5" />
                                        내 자산 수정
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => setIsMyPropertyModalOpen(true)}
                                        className="bg-slate-900 text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-all duration-200 shadow-sm flex items-center gap-1.5"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        내 자산 추가
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div className={`h-px w-full bg-slate-100 ${isSidebar ? 'my-4' : 'my-6'}`}></div>

                    {/* Bottom Row: Info Specs */}
                    <div className={`grid ${isSidebar ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'} ${isSidebar ? 'gap-5' : 'gap-4'}`}>
                        <div className="flex flex-col gap-1.5">
                            <span className={`${isSidebar ? 'text-[15px]' : 'text-[13px]'} font-bold text-slate-400 flex items-center gap-1.5`}>
                                주소
                                <MapPin className={`${isSidebar ? 'w-3.5 h-3.5' : 'w-3 h-3'} text-slate-300`} />
                            </span>
                            <span
                                className={`${isSidebar ? 'text-[17px]' : 'text-[15px]'} font-bold text-slate-700 line-clamp-2 break-words`}
                            >
                                {detailData.location}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className={`${isSidebar ? 'text-[15px]' : 'text-[13px]'} font-bold text-slate-400 flex items-center gap-1.5`}>
                                건축연도
                                <Calendar className={`${isSidebar ? 'w-3.5 h-3.5' : 'w-3 h-3'} text-slate-300`} />
                            </span>
                            <span className={`${isSidebar ? 'text-[17px]' : 'text-[15px]'} font-bold text-slate-700`}>
                                {detailData.info.find(i => i.label === '건물 연식')?.value || '-'}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className={`${isSidebar ? 'text-[15px]' : 'text-[13px]'} font-bold text-slate-400 flex items-center gap-1.5`}>
                                세대수
                                <Building2 className={`${isSidebar ? 'w-3.5 h-3.5' : 'w-3 h-3'} text-slate-300`} />
                            </span>
                            <span className={`${isSidebar ? 'text-[17px]' : 'text-[15px]'} font-bold text-slate-700`}>
                                {detailData.info.find(i => i.label === '총 세대수')?.value || '-'}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className={`${isSidebar ? 'text-[15px]' : 'text-[13px]'} font-bold text-slate-400 flex items-center gap-1.5`}>
                                주차
                                <Car className={`${isSidebar ? 'w-3.5 h-3.5' : 'w-3 h-3'} text-slate-300`} />
                            </span>
                            <span className={`${isSidebar ? 'text-[17px]' : 'text-[15px]'} font-bold text-slate-700`}>
                                {detailData.info.find(i => i.label === '주차 확보율')?.value || '-'}
                            </span>
                        </div>
                    </div>

                    {/* ChevronDown icon at bottom center - Expandable */}
                    <div className="flex justify-center mt-6">
                        <button
                            onClick={() => setIsInfoExpanded(!isInfoExpanded)}
                            className="p-3 hover:bg-slate-50 rounded-full transition-colors"
                        >
                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isInfoExpanded ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {/* Expanded Info Section */}
                    <div 
                        className={`overflow-hidden transition-all duration-500 ease-in-out ${
                            isInfoExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
                        }`}
                    >
                        <div className={`mt-4 pt-4 transition-all duration-500 ${
                            isInfoExpanded ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
                        }`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {detailData.info
                                    .filter(info => {
                                        // 기본 정보로 이미 표시된 정보 제외
                                        const excludedLabels = ['건물 연식', '총 세대수', '주차 확보율'];
                                        return !excludedLabels.includes(info.label);
                                    })
                                    .map((info, i) => (
                                        <div 
                                            key={i} 
                                            className="flex justify-between p-3 text-[14px] hover:bg-slate-50 rounded-lg transition-all duration-300"
                                            style={{
                                                transitionDelay: isInfoExpanded ? `${i * 50}ms` : `${(detailData.info.length - i) * 30}ms`,
                                                opacity: isInfoExpanded ? 1 : 0,
                                                transform: isInfoExpanded ? 'translateY(0)' : 'translateY(-10px)'
                                            }}
                                        >
                                            <span className="font-medium text-slate-500">{info.label}</span>
                                            <span className="font-bold text-slate-900 text-right">{info.value}</span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </Card>

                {isSidebar ? (
                    <>
                        {/* Sidebar Layout: Single Column */}
                        <div className="space-y-4">
                        {/* Area Tabs Container - Wraps all content below */}
                        <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-2xl overflow-hidden ring-1 ring-black/5">
                            {/* Area Tabs */}
                            <div className="flex bg-white/50 backdrop-blur-sm rounded-t-xl p-1.5 gap-2 overflow-x-auto border-b border-slate-100">
                                {areaOptions.map((area, index) => (
                                    <React.Fragment key={area.value}>
                                        <button
                                            onClick={() => setSelectedArea(area.value)}
                                            className={`${isSidebar ? 'px-4 py-2 text-[15px]' : 'px-4 py-2 text-[13px]'} font-bold rounded-lg transition-all whitespace-nowrap ${
                                                selectedArea === area.value
                                                    ? 'bg-slate-900 text-white border border-slate-900 shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'
                                            }`}
                                        >
                                            {area.value === 'all' ? '전체' : area.label}
                                        </button>
                                        {index < areaOptions.length - 1 && (
                                            <div className="h-4 w-px bg-slate-300"></div>
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* Content wrapped by area tabs */}
                            <div className="p-5 space-y-4">
                        {/* Chart - List Style */}
                        <div className="bg-transparent flex flex-col">
                            <div className={`flex items-center gap-3 ${isSidebar ? 'mb-5' : 'mb-6'} flex-wrap`}>
                                <div className="relative" ref={chartTypeDropdownRef}>
                                    <button
                                        onClick={() => setIsChartTypeDropdownOpen(!isChartTypeDropdownOpen)}
                                        className="bg-slate-50 border border-slate-200 text-slate-700 text-[13px] rounded-xl px-4 py-2.5 font-bold hover:bg-slate-100 transition-all flex items-center gap-2 h-11"
                                    >
                                        <span>{chartType}</span>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isChartTypeDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isChartTypeDropdownOpen && (
                                        <div className="absolute left-0 top-full mt-2 w-[100px] bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50">
                                            {['전체', '매매', '전세', '월세'].map((type) => (
                                                <button
                                                    key={type}
                                                    onClick={() => {
                                                        setChartType(type as ChartType);
                                                        setIsChartTypeDropdownOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-3 text-[13px] font-bold transition-colors ${
                                                        chartType === type ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Period Toggle - Moved to right */}
                                <div className="ml-auto">
                                    <ToggleButtonGroup
                                        options={['6개월', '1년', '3년', '전체']}
                                        value={chartPeriod}
                                        onChange={(value) => setChartPeriod(value)}
                                        className="bg-slate-100/80"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 w-full relative transition-opacity duration-300">
                                {chartData.length === 0 ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-[15px] font-medium">
                                        거래 내역이 없습니다
                                    </div>
                                ) : (
                                    <ProfessionalChart 
                                        data={chartData} 
                                        height={isSidebar ? 240 : 320} 
                                        lineColor={chartType === '매매' || chartType === '전체' ? '#3182F6' : (chartType === '전세' ? '#10b981' : '#f59e0b')}
                                        areaTopColor={chartType === '매매' || chartType === '전체' ? 'rgba(49, 130, 246, 0.15)' : (chartType === '전세' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)')}
                                        chartStyle={chartStyle}
                                        showHighLow={true}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Transaction Table - List Style */}
                        <div className="bg-transparent overflow-hidden flex flex-col" style={{ maxHeight: isSidebar ? '360px' : '500px' }}>
                            <div className={`${isSidebar ? 'pb-3' : 'pb-3'} border-b border-slate-200/50 flex justify-between items-center bg-transparent sticky top-0 z-10`}>
                                <h3 className={`${isSidebar ? 'text-[19px]' : 'text-[16px]'} font-black text-slate-900`}>실거래 내역</h3>
                                <span className={`${isSidebar ? 'text-[13px]' : 'text-[11px]'} font-medium text-slate-400`}>
                                    {chartType} · {chartPeriod}
                                </span>
                            </div>
                            
                            <div className={`grid grid-cols-4 ${isSidebar ? 'py-3 px-0 text-[14px]' : 'py-3 px-0 text-[12px]'} font-bold text-slate-500 border-b border-slate-200/50 mt-3`}>
                                <div className="text-center">일자</div>
                                <div className="text-center">구분</div>
                                <div className="text-center">층</div>
                                <div className="text-center">거래액</div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {filteredTransactions.length === 0 ? (
                                    <div className="flex items-center justify-center h-full">
                                        <span className="text-[15px] text-slate-500 font-medium">거래 내역이 없습니다</span>
                                    </div>
                                ) : (
                                    filteredTransactions.map((tx, i) => (
                                        <div key={i} className={`grid grid-cols-4 ${isSidebar ? 'py-3' : 'py-4'} text-[15px] border-b border-slate-100/50 last:border-0 hover:bg-slate-50/50 transition-colors items-center ${isSidebar ? 'h-[48px]' : 'h-[52px]'}`}>
                                            <div className={`text-slate-500 text-center ${isSidebar ? 'text-[14px]' : 'text-[12px]'} font-medium tabular-nums`}>{tx.date}</div>
                                            <div className={`font-bold ${tx.type === '매매' ? 'text-slate-900' : (tx.type === '전세' ? 'text-indigo-600' : 'text-emerald-600')} text-center ${isSidebar ? 'text-[14px]' : 'text-[13px]'}`}>{tx.type}</div>
                                            <div className={`text-slate-500 text-center ${isSidebar ? 'text-[14px]' : 'text-[12px]'} tabular-nums`}>{tx.floor}</div>
                                            <div className="text-center tabular-nums">
                                                <FormatPrice val={tx.price} sizeClass={isSidebar ? "text-[15px]" : "text-[15px]"} />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Neighbors List - List Style (No Card) */}
                        <div className="bg-transparent overflow-hidden">
                            <div className={`${isSidebar ? 'pb-3' : 'pb-3'} border-b border-slate-200/50`}>
                                <h3 className={`${isSidebar ? 'text-[19px]' : 'text-[17px]'} font-black text-slate-900`}>주변 시세 비교</h3>
                            </div>
                            <div className="overflow-hidden flex flex-col divide-y divide-slate-100/50 mt-3">
                                {neighborsLoadError ? (
                                    <div className="flex items-center justify-center py-8">
                                        <span className="text-[15px] text-slate-500 font-medium">주변 아파트 목록을 불러오는 데 실패했습니다</span>
                                    </div>
                                ) : detailData.neighbors.length === 0 ? (
                                    <div className="flex items-center justify-center py-8">
                                        <span className="text-[15px] text-slate-500 font-medium">주변 아파트 데이터가 없습니다</span>
                                    </div>
                                ) : (
                                    detailData.neighbors.map((item, i) => {
                                        const currentPriceForComparison = chartType === '매매' || chartType === '전체'
                                            ? detailData.currentPrice 
                                            : chartType === '전세' 
                                            ? detailData.jeonsePrice 
                                            : 0;
                                        return <NeighborItem key={i} item={item} currentPrice={currentPriceForComparison} />;
                                    })
                                )}
                            </div>
                        </div>

                        {/* Info List - List Style (No Card) */}
                        <div className="bg-transparent overflow-hidden">
                            <div className={`${isSidebar ? 'pb-3' : 'pb-3'} border-b border-slate-200/50`}>
                                <h3 className={`${isSidebar ? 'text-[16px]' : 'text-[16px]'} font-black text-slate-900`}>단지 정보</h3>
                            </div>
                            <div className="divide-y divide-slate-100/50 mt-3">
                                {detailData.info.map((info, i) => (
                                    <div key={i} className={`flex justify-between ${isSidebar ? 'py-3 text-[15px]' : 'py-3 text-[14px]'}`}>
                                        <span className="font-medium text-slate-500">{info.label}</span>
                                        <span className="font-bold text-slate-900 text-right">{info.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                            </div>
                        </div>
                    </div>
                    </>
                ) : (
                    <>
                        {/* Full Layout: Multi Column */}
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-8 pb-8">
                        
                        {/* 2. Chart Card */}
                        <div className="lg:col-span-3 space-y-8">
                            <Card className="p-0 bg-white border border-slate-100 shadow-sm h-[500px] flex flex-col overflow-hidden">
                                {/* Area Tabs - 카드 상단 */}
                                <div className="flex rounded-t-[24px] p-1.5 pl-4 gap-2 overflow-x-auto border-b border-slate-100">
                                    {areaOptions.map((area, index) => (
                                        <React.Fragment key={area.value}>
                                            <button
                                                onClick={() => setSelectedArea(area.value)}
                                                className={`px-4 py-2 text-[13px] font-bold rounded-lg transition-all whitespace-nowrap ${
                                                    selectedArea === area.value
                                                        ? 'bg-slate-900 text-white border border-slate-900 shadow-sm'
                                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'
                                                }`}
                                            >
                                                {area.value === 'all' ? '전체' : area.label}
                                            </button>
                                            {index < areaOptions.length - 1 && (
                                                <div className="self-stretch w-px bg-slate-300 my-1"></div>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                                
                                <div className="p-6 flex flex-col flex-1 min-h-0">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="relative" ref={chartTypeDropdownRef}>
                                            <button
                                                onClick={() => setIsChartTypeDropdownOpen(!isChartTypeDropdownOpen)}
                                                className="bg-slate-50 border border-slate-200 text-slate-700 text-[13px] rounded-xl px-4 py-2.5 font-bold hover:bg-slate-100 transition-all flex items-center gap-2 h-11"
                                            >
                                                <span>{chartType}</span>
                                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isChartTypeDropdownOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                            {isChartTypeDropdownOpen && (
                                                <div className="absolute left-0 top-full mt-2 w-[100px] bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50">
                                                    {['전체', '매매', '전세', '월세'].map((type) => (
                                                        <button
                                                            key={type}
                                                            onClick={() => {
                                                                setChartType(type as ChartType);
                                                                setIsChartTypeDropdownOpen(false);
                                                            }}
                                                            className={`w-full text-left px-4 py-3 text-[13px] font-bold transition-colors ${
                                                                chartType === type ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            {type}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Period Toggle - Moved to right */}
                                        <div className="ml-auto">
                                            <ToggleButtonGroup
                                                options={['6개월', '1년', '3년', '전체']}
                                                value={chartPeriod}
                                                onChange={(value) => setChartPeriod(value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex-1 w-full relative transition-opacity duration-300">
                                        {chartData.length === 0 ? (
                                            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-[15px] font-medium">
                                                거래 내역이 없습니다
                                            </div>
                                        ) : (
                                            <ProfessionalChart 
                                                data={chartData} 
                                                height={280} 
                                                lineColor={chartType === '매매' ? '#3182F6' : (chartType === '전세' ? '#10b981' : '#f59e0b')}
                                                areaTopColor={chartType === '매매' ? 'rgba(49, 130, 246, 0.15)' : (chartType === '전세' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)')}
                                                chartStyle={chartStyle}
                                                showHighLow={true}
                                            />
                                        )}
                                    </div>
                                </div>
                            </Card>

                            {/* Neighbors List */}
                            <Card className="bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[400px]">
                                <div className="p-5 border-b border-slate-100 flex-shrink-0">
                                    <h3 className="text-[18px] font-black text-slate-900">주변 시세 비교</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50" style={{ scrollbarGutter: 'stable' }}>
                                    {neighborsLoadError ? (
                                        <div className="flex items-center justify-center h-full">
                                            <span className="text-[15px] text-slate-500 font-medium">주변 아파트 목록을 불러오는 데 실패했습니다</span>
                                        </div>
                                    ) : detailData.neighbors.length === 0 ? (
                                        <div className="flex items-center justify-center h-full">
                                            <span className="text-[15px] text-slate-500 font-medium">주변 아파트 데이터가 없습니다</span>
                                        </div>
                                    ) : (
                                        detailData.neighbors.map((item, i) => {
                                            const currentPriceForComparison = chartType === '매매' 
                                                ? detailData.currentPrice 
                                                : chartType === '전세' 
                                                ? detailData.jeonsePrice 
                                                : 0;
                                            return <NeighborItem key={i} item={item} currentPrice={currentPriceForComparison} />;
                                        })
                                    )}
                                </div>
                            </Card>
                        </div>

                        {/* 3. Transaction Table & Info */}
                        <div className="lg:col-span-2 space-y-8">
                            <Card className="bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[500px]">
                                <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 z-20">
                                    <h3 className="text-[18px] font-black text-slate-900">실거래 내역</h3>
                                </div>
                                
                                {filteredTransactions.length > 0 && (
                                    <div className="grid grid-cols-5 py-3 px-4 bg-white/50 backdrop-blur-sm border-b border-slate-100 text-[12px] font-bold text-slate-500 items-center" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                                        <div className="text-center">일자</div>
                                        <div className="text-center">구분</div>
                                        <div className="text-center">면적</div>
                                        <div className="text-center">층</div>
                                        <div className="text-center">거래액</div>
                                    </div>
                                )}
                                
                                <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
                                    {filteredTransactions.length === 0 ? (
                                        <div className="flex items-center justify-center h-full">
                                            <span className="text-[15px] text-slate-900">거래 내역이 없습니다</span>
                                        </div>
                                    ) : (
                                        filteredTransactions.map((tx, i) => (
                                            <TransactionRow key={i} tx={tx} />
                                        ))
                                    )}
                                </div>
                            </Card>

                            <Card className="bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[400px]">
                                <div className="p-5 border-b border-slate-100 flex-shrink-0">
                                    <h3 className="text-[18px] font-black text-slate-900">아파트 관련 뉴스</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
                                    {detailData.news && detailData.news.length > 0 ? (
                                        detailData.news.map((item, i) => (
                                            <div 
                                                key={i} 
                                                className="p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                                                onClick={() => {
                                                    if (item.url) {
                                                        window.open(item.url, '_blank', 'noopener,noreferrer');
                                                    }
                                                }}
                                            >
                                                <div className="flex flex-col gap-2">
                                                    <h4 className="text-[14px] font-bold text-slate-900 line-clamp-2 leading-snug hover:text-blue-600 transition-colors">
                                                        {item.title}
                                                    </h4>
                                                    <div className="flex items-center gap-2 text-[12px] text-slate-400">
                                                        <span className="font-medium">{item.source}</span>
                                                        <span className="text-slate-300">•</span>
                                                        <span>{item.time}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex items-center justify-center h-full">
                                            <span className="text-[14px] text-slate-400">뉴스가 없습니다</span>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </div>
                    </div>
                    </>
                )}
            </div>
          </>
      )}

      {isCompact && (
          <>
              {/* Compact View for Map Side Panel */}
              <div className="px-5 py-4 bg-white border-b border-slate-100">
               <div className="flex flex-col gap-1">
                    <FormatPrice val={detailData.currentPrice} sizeClass="text-2xl" />
                    <span className={`text-[15px] font-bold flex items-center tabular-nums ${detailData.diffRate >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        {detailData.diffRate >= 0 ? '▲' : '▼'} {Math.abs(detailData.diff)} ({Math.abs(detailData.diffRate)}%)
                    </span>
               </div>
               
               <div className="flex gap-2 mt-4 pt-4 border-t border-slate-50">
                  {[
                      { id: 'chart', label: '차트' },
                      { id: 'info', label: '정보' },
                  ].map(tab => (
                      <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as TabType)}
                          className={`flex-1 py-2 rounded-lg text-[13px] font-bold transition-all ${
                              activeTab === tab.id 
                              ? 'bg-slate-100 text-slate-900' 
                              : 'text-slate-400 hover:bg-slate-50'
                          }`}
                      >
                          {tab.label}
                      </button>
                  ))}
               </div>
               
               {activeTab === 'chart' && (
                   <div className="mt-4">
                       <ProfessionalChart data={chartData} height={200} chartStyle={chartStyle} showHighLow={true} />
                   </div>
               )}
               {activeTab === 'info' && (
                   <div className="mt-4 space-y-2">
                       {detailData.info.slice(0, 4).map((info, i) => (
                           <div key={i} className="flex justify-between text-[13px]">
                               <span className="text-slate-500">{info.label}</span>
                               <span className="font-bold">{info.value}</span>
                           </div>
                       ))}
                   </div>
               )}
              </div>
          </>
      )}
      
      {/* Percentile 상세 정보 모달 */}
      {isPercentileModalOpen && percentileData && (
        <>
          {/* 모바일: 하단 중앙 */}
          <div className="fixed inset-0 z-[100] flex items-end justify-center animate-fade-in p-4 md:hidden">
            <div 
              className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
              onClick={() => {
                setIsPercentileModalOpen(false);
                setModalPosition(null);
              }}
            />
            <div 
              className="relative w-full max-w-sm bg-white rounded-t-3xl rounded-b-3xl shadow-2xl overflow-hidden animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black text-slate-900">동 내 순위</h3>
                  <button 
                    onClick={() => {
                      setIsPercentileModalOpen(false);
                      setModalPosition(null);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="text-center py-4">
                    <div className="text-3xl font-black text-blue-600 mb-2">
                      {percentileData.percentile.toFixed(1)}%
                    </div>
                    <div className="text-slate-600 text-[14px] mb-4">
                      {percentileData.region_name} 내 {percentileData.total_count}개의 아파트 중
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                      {percentileData.rank}등
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-100">
                    <div className="text-[13px] text-slate-500 text-center">
                      최근 3개월 매매 거래 기준 평당가 순위입니다
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 데스크톱: 버튼 바로 아래 */}
          {modalPosition && (
            <div className="hidden md:block fixed inset-0 z-[100] animate-fade-in">
              <div 
                className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
                onClick={() => {
                  setIsPercentileModalOpen(false);
                  setModalPosition(null);
                }}
              />
              <div 
                className="absolute bg-white rounded-xl shadow-2xl overflow-hidden animate-slide-down w-[320px]"
                style={{
                  top: `${modalPosition.top}px`,
                  left: `${modalPosition.left}px`,
                  transform: 'translateX(0)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-black text-slate-900">동 내 순위</h3>
                    <button 
                      onClick={() => {
                        setIsPercentileModalOpen(false);
                        setModalPosition(null);
                      }}
                      className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="text-center py-3">
                      <div className="text-2xl font-black text-blue-600 mb-1.5">
                        {percentileData.percentile.toFixed(1)}%
                      </div>
                      <div className="text-slate-600 text-[13px] mb-3">
                        {percentileData.region_name} 내 {percentileData.total_count}개의 아파트 중
                      </div>
                      <div className="text-xl font-bold text-slate-900">
                        {percentileData.rank}등
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      <div className="text-[12px] text-slate-500 text-center">
                        최근 3개월 매매 거래 기준 평당가 순위입니다
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}
          </>
      )}
      
      {/* 내 자산 추가/수정 팝업 모달 */}
      {isMyPropertyModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMyPropertyModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
            {/* 헤더 */}
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900">
                  {isMyProperty ? '내 자산 정보 수정' : '내 자산에 추가'}
                </h3>
                <button 
                  onClick={() => setIsMyPropertyModalOpen(false)}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-[13px] text-slate-500 mt-1">{detailData.name}</p>
            </div>
            
            {/* 폼 내용 */}
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* 별칭 */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-2">별칭</label>
                <input 
                  type="text"
                  value={myPropertyForm.nickname}
                  onChange={(e) => setMyPropertyForm(prev => ({ ...prev, nickname: e.target.value }))}
                  placeholder={detailData.name}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                />
              </div>
              
              {/* 전용면적 */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-2">전용면적 (㎡)</label>
                {isLoadingExclusiveAreas ? (
                  <div className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium bg-slate-50 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                    <span className="text-slate-500">전용면적 목록 로딩 중...</span>
                  </div>
                ) : (
                  <select
                    value={myPropertyForm.exclusive_area}
                    onChange={(e) => setMyPropertyForm(prev => ({ ...prev, exclusive_area: Number(e.target.value) }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all bg-white"
                  >
                    {exclusiveAreaOptions.length > 0 ? (
                      exclusiveAreaOptions.map(area => {
                        const pyeong = Math.round(area / 3.3058);
                        return (
                          <option key={area} value={area}>
                            {area.toFixed(2)}㎡ (약 {pyeong}평)
                          </option>
                        );
                      })
                    ) : (
                      <>
                        <option value={59}>59㎡ (약 18평)</option>
                        <option value={84}>84㎡ (약 25평)</option>
                        <option value={102}>102㎡ (약 31평)</option>
                        <option value={114}>114㎡ (약 34평)</option>
                      </>
                    )}
                  </select>
                )}
                {exclusiveAreaOptions.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    실제 거래 내역 기반 전용면적 목록
                  </p>
                )}
              </div>
              
              {/* 구매가 */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-2">구매가 (만원)</label>
                <input 
                  type="number"
                  value={myPropertyForm.purchase_price}
                  onChange={(e) => setMyPropertyForm(prev => ({ ...prev, purchase_price: e.target.value }))}
                  placeholder="예: 85000"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {myPropertyForm.purchase_price && `${(Number(myPropertyForm.purchase_price) / 10000).toFixed(1)}억원`}
                </p>
              </div>
              
              {/* 대출 금액 */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-2">대출 금액 (만원)</label>
                <input 
                  type="number"
                  value={myPropertyForm.loan_amount}
                  onChange={(e) => setMyPropertyForm(prev => ({ ...prev, loan_amount: e.target.value }))}
                  placeholder="예: 40000"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {myPropertyForm.loan_amount && `${(Number(myPropertyForm.loan_amount) / 10000).toFixed(1)}억원`}
                </p>
              </div>
              
              {/* 매입일 */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-2">매입일</label>
                <input 
                  type="date"
                  value={myPropertyForm.purchase_date}
                  onChange={(e) => setMyPropertyForm(prev => ({ ...prev, purchase_date: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                />
              </div>
              
              {/* 메모 */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-2">메모</label>
                <textarea 
                  value={myPropertyForm.memo}
                  onChange={(e) => setMyPropertyForm(prev => ({ ...prev, memo: e.target.value }))}
                  placeholder="메모를 입력하세요"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all resize-none"
                />
              </div>
            </div>
            
            {/* 푸터 버튼 */}
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setIsMyPropertyModalOpen(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-[15px] hover:bg-slate-50 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleMyPropertySubmit}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    저장 중...
                  </>
                ) : (
                  isMyProperty ? '수정하기' : '추가하기'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
