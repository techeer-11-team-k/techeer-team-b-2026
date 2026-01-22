import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Star, Plus, ArrowRightLeft, Building2, MapPin, Calendar, Car, ChevronDown, X, Check, Home, Trash2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { ProfessionalChart } from '../ui/ProfessionalChart';
import { ToggleButtonGroup } from '../ui/ToggleButtonGroup';
import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { 
  fetchApartmentDetail, 
  fetchApartmentTransactions,
  fetchMyProperties,
  fetchFavoriteApartments,
  addFavoriteApartment,
  removeFavoriteApartment,
  createMyProperty,
  deleteMyProperty,
  setAuthToken
} from '../../services/api';

interface PropertyDetailProps {
  propertyId?: string;
  onBack: () => void;
  isCompact?: boolean;
  isSidebar?: boolean;
}

type TabType = 'chart' | 'info';
type ChartType = '매매' | '전세' | '월세';
type TransactionType = '전체' | '매매' | '전세';

const generateChartData = (type: ChartType) => {
    const data = [];
    const startDate = new Date('2023-01-01');
    let basePrice = type === '매매' ? 32000 : (type === '전세' ? 24000 : 100); 
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

const propertyDataMap: Record<string, typeof detailData1> = {
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

const detailData1 = {
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

const NeighborItem: React.FC<{ item: typeof detailData1.neighbors[0], currentPrice: number }> = ({ item, currentPrice }) => {
    const diffRatio = ((item.price - currentPrice) / currentPrice) * 100;
    const isHigher = diffRatio > 0;
    
    return (
        <div className="flex justify-between p-4 text-[15px]">
            <span className="font-medium text-slate-500">
                {item.name} <span className={`text-[15px] font-bold px-1.5 py-0.5 rounded ${isHigher ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                    {Math.abs(diffRatio).toFixed(1)}% {isHigher ? '비쌈' : '저렴'}
                </span>
            </span>
            <span className="font-bold text-slate-900 text-right tabular-nums">
                <FormatPrice val={item.price} sizeClass="text-[15px]" />
            </span>
        </div>
    );
};

const TransactionRow: React.FC<{ tx: typeof detailData1.transactions[0] }> = ({ tx }) => {
    const typeColor = tx.type === '매매' ? 'text-slate-900' : (tx.type === '전세' ? 'text-indigo-600' : 'text-emerald-600');
    
    return (
        <div className="grid grid-cols-4 py-4 px-5 text-[15px] border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors items-center h-[52px]">
            <div className="text-slate-500 text-[15px] font-medium tabular-nums text-center">{tx.date}</div>
            <div className={`font-bold ${typeColor} text-center text-[15px]`}>{tx.type}</div>
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
                className="text-[13px] font-bold bg-slate-100 border border-slate-200 rounded-lg py-2 px-3 h-10 focus:ring-0 focus:border-slate-300 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
            >
                <span>{selectedOption?.label || value}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            
            <div 
                className={`absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 transition-all duration-200 ease-out origin-top min-w-full ${
                    isOpen 
                        ? 'opacity-100 scale-y-100 translate-y-0 pointer-events-auto max-h-96' 
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
  const [chartType, setChartType] = useState<ChartType>('매매');
  const [chartData, setChartData] = useState(generateChartData('매매'));
  const [priceTrendData, setPriceTrendData] = useState<{ sale?: { time: string; value: number }[]; jeonse?: { time: string; value: number }[]; monthly?: { time: string; value: number }[] }>({});
  const [chartPeriod, setChartPeriod] = useState('1년');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isMyProperty, setIsMyProperty] = useState(false);
  const [myPropertyId, setMyPropertyId] = useState<number | null>(null);
  const [isInCompare, setIsInCompare] = useState(false);
  const [txFilter, setTxFilter] = useState<TransactionType>('전체');
  const [selectedArea, setSelectedArea] = useState('84');
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [detailData, setDetailData] = useState(getDetailData(resolvedPropertyId));
  const [loadError, setLoadError] = useState<string | null>(null);
  
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
  
  // 내 자산 추가 제출
  const handleMyPropertySubmit = async () => {
    if (!isSignedIn) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (token) setAuthToken(token);
      
      const data = {
        apt_id: aptId,
        nickname: myPropertyForm.nickname || detailData.name,
        exclusive_area: myPropertyForm.exclusive_area,
        purchase_price: myPropertyForm.purchase_price ? parseInt(myPropertyForm.purchase_price) : undefined,
        loan_amount: myPropertyForm.loan_amount ? parseInt(myPropertyForm.loan_amount) : undefined,
        purchase_date: myPropertyForm.purchase_date || undefined,
        memo: myPropertyForm.memo || undefined
      };
      
      const response = await createMyProperty(data);
      if (response.success) {
        setIsMyProperty(true);
        setMyPropertyId(response.data.property_id);
        setIsMyPropertyModalOpen(false);
        alert('내 자산에 추가되었습니다.');
      }
    } catch (error) {
      console.error('내 자산 추가 실패:', error);
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
    } catch (error) {
      console.error('내 자산 삭제 실패:', error);
      alert('처리 중 오류가 발생했습니다.');
    }
  };
  
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
              setLoadError(null);
              const fallback = getDetailData(resolvedPropertyId);
              setDetailData(fallback);
              
              const [detailRes, saleRes, jeonseRes] = await Promise.all([
                  fetchApartmentDetail(Number(resolvedPropertyId)),
                  fetchApartmentTransactions(Number(resolvedPropertyId), 'sale', 20),
                  fetchApartmentTransactions(Number(resolvedPropertyId), 'jeonse', 20)
              ]);
              
              if (!isActive) return;
              
              const saleTransactions = saleRes.data.recent_transactions || [];
              const jeonseTransactions = jeonseRes.data.recent_transactions || [];
              
              const latestSale = saleTransactions[0];
              const latestJeonse = jeonseTransactions[0];
              
              const currentPrice = latestSale?.price || fallback.currentPrice;
              const jeonsePrice = latestJeonse?.price || fallback.jeonsePrice || 0;
              const previousAvg = saleRes.data.change_summary.previous_avg ?? 0;
              const recentAvg = saleRes.data.change_summary.recent_avg ?? 0;
              const diff = recentAvg ? Math.round(recentAvg - previousAvg) : 0;
              const diffRate = saleRes.data.change_summary.change_rate ?? fallback.diffRate ?? 0;
              
              const mergedTransactions = [
                  ...saleTransactions.map((tx) => ({
                      date: tx.date ? tx.date.replace(/-/g, '.').slice(2) : '-',
                      floor: `${tx.floor}층`,
                      price: tx.price,
                      type: '매매'
                  })),
                  ...jeonseTransactions.map((tx) => ({
                      date: tx.date ? tx.date.replace(/-/g, '.').slice(2) : '-',
                      floor: `${tx.floor}층`,
                      price: tx.price,
                      type: '전세'
                  }))
              ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
              
              const locationParts = [
                  detailRes.data.city_name,
                  detailRes.data.region_name
              ].filter(Boolean);
              
              const info = [
                  { label: '전용면적', value: `${selectedArea}㎡` },
                  { label: '세대수', value: detailRes.data.total_household_cnt ? `${detailRes.data.total_household_cnt.toLocaleString()}세대` : '-' },
                  { label: '총 주차대수', value: detailRes.data.total_parking_cnt ? `${detailRes.data.total_parking_cnt.toLocaleString()}대` : '-' },
                  { label: '사용승인일', value: detailRes.data.use_approval_date ? detailRes.data.use_approval_date.replace(/-/g, '.') : '-' },
                  { label: '건설사', value: detailRes.data.builder_name || '-' },
                  { label: '난방', value: detailRes.data.code_heat_nm || '-' },
                  { label: '현관구조', value: detailRes.data.hallway_type || '-' }
              ];
              
              const mapped = {
                  ...fallback,
                  id: String(detailRes.data.apt_id),
                  name: detailRes.data.apt_name || fallback.name,
                  location: locationParts.join(' ') || detailRes.data.road_address || fallback.location,
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
              
              const saleTrend = saleRes.data.price_trend?.map((item) => ({
                  time: `${item.year_month}-01`,
                  value: item.avg_price
              }));
              const jeonseTrend = jeonseRes.data.price_trend?.map((item) => ({
                  time: `${item.year_month}-01`,
                  value: item.avg_price
              }));
              
              setDetailData(mapped);
              setPriceTrendData({ sale: saleTrend, jeonse: jeonseTrend });
          } catch (error) {
              if (!isActive) return;
              setLoadError(error instanceof Error ? error.message : '상세 정보를 불러오지 못했습니다.');
          }
      };
      
      loadDetail();
      return () => {
          isActive = false;
      };
  }, [resolvedPropertyId]);
  
  // 면적별 데이터 계산
  const areaBasedPrice = getAreaBasedData(detailData.currentPrice, selectedArea);
  const areaBasedDiff = getAreaBasedData(detailData.diff, selectedArea);
  const areaBasedDiffRate = detailData.diffRate; // 비율은 동일
  const areaBasedTransactions = generateAreaTransactions(detailData.transactions, selectedArea);

  useEffect(() => {
      if (chartType === '매매' && priceTrendData.sale?.length) {
          setChartData(priceTrendData.sale);
          return;
      }
      if (chartType === '전세' && priceTrendData.jeonse?.length) {
          setChartData(priceTrendData.jeonse);
          return;
      }
      setChartData(generateChartData(chartType));
  }, [chartType, priceTrendData]);

  const filteredTransactions = areaBasedTransactions.filter(tx => {
      if (txFilter === '전체') return true;
      if (txFilter === '전세') return tx.type !== '매매';
      return tx.type === txFilter;
  });

  return (
    <div className={`${isSidebar ? 'bg-transparent' : 'bg-transparent'} min-h-full font-sans text-slate-900 ${isCompact ? 'p-0' : ''} ${isSidebar ? 'p-0' : ''}`}>
      
      {loadError && (
        <div className="mb-4 mx-6 md:mx-0 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold border border-red-100">
          {loadError}
        </div>
      )}
      
      {!isCompact && (
          <>
            {!isSidebar && (
              <>
              </>
            )}

            <div className={`${isSidebar ? 'p-5 space-y-5' : 'max-w-[1400px] mx-auto'}`}>
                
                {/* 1. Header Card: Refined Layout (Stock App Style) */}
                <Card className={`${isSidebar ? 'bg-transparent shadow-none border-0 p-5' : 'bg-white p-8'}`}>
                    {/* Apartment Name */}
                    {!isSidebar && (
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <button onClick={onBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <h1 className="text-2xl font-bold text-slate-900 leading-none">{detailData.name}</h1>
                            </div>
                            <button 
                                onClick={handleToggleFavorite}
                                className={`p-2.5 rounded-xl transition-all duration-200 flex-shrink-0 ${isFavorite ? 'bg-yellow-50 text-yellow-500 scale-110' : 'text-slate-400 hover:bg-slate-100 hover:scale-105'}`}
                                title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                            >
                                <Star className={`w-5 h-5 transition-transform ${isFavorite ? 'fill-yellow-500' : ''}`} />
                            </button>
                        </div>
                    )}
                    
                    {/* Middle Row: Big Price & Change */}
                    <div className={`${isSidebar ? 'mt-0' : 'mt-0'} flex items-center justify-between gap-4 flex-wrap`}>
                        <div className="flex items-center gap-4 flex-wrap">
                            <FormatPrice val={isSidebar ? areaBasedPrice : detailData.currentPrice} sizeClass={isSidebar ? "text-[32px]" : "text-[42px]"} />
                            
                            <div className="flex flex-col items-center leading-none">
                                <span className={`${isSidebar ? 'text-[16px]' : 'text-[15px]'} font-medium text-slate-400 mb-0.5`}>지난 실거래가 대비</span>
                                <div className={`${isSidebar ? 'text-[16px]' : 'text-[15px]'} font-bold flex items-center gap-1 tabular-nums ${areaBasedDiffRate >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                    {areaBasedDiffRate >= 0 ? '▲' : '▼'} {Math.abs(isSidebar ? areaBasedDiff : detailData.diff).toLocaleString()} ({Math.abs(areaBasedDiffRate)}%)
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
                                    <div className="flex gap-1">
                                        <button 
                                            onClick={() => setIsMyPropertyModalOpen(true)}
                                            className="bg-emerald-600 text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:bg-emerald-700 transition-all duration-200 shadow-sm flex items-center gap-1.5"
                                        >
                                            <Home className="w-3.5 h-3.5" />
                                            내 자산 수정
                                        </button>
                                        <button 
                                            onClick={handleDeleteMyProperty}
                                            className="bg-red-50 text-red-600 text-[13px] font-bold p-2.5 rounded-xl hover:bg-red-100 transition-all duration-200 shadow-sm"
                                            title="내 자산에서 삭제"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
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
                                위치
                                <MapPin className={`${isSidebar ? 'w-3.5 h-3.5' : 'w-3 h-3'} text-slate-300`} />
                            </span>
                            <span className={`${isSidebar ? 'text-[17px]' : 'text-[15px]'} font-bold text-slate-700 truncate`}>
                                {detailData.location}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className={`${isSidebar ? 'text-[15px]' : 'text-[13px]'} font-bold text-slate-400 flex items-center gap-1.5`}>
                                건축연도
                                <Calendar className={`${isSidebar ? 'w-3.5 h-3.5' : 'w-3 h-3'} text-slate-300`} />
                            </span>
                            <span className={`${isSidebar ? 'text-[17px]' : 'text-[15px]'} font-bold text-slate-700`}>
                                1997년 (27년차)
                            </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className={`${isSidebar ? 'text-[15px]' : 'text-[13px]'} font-bold text-slate-400 flex items-center gap-1.5`}>
                                세대수
                                <Building2 className={`${isSidebar ? 'w-3.5 h-3.5' : 'w-3 h-3'} text-slate-300`} />
                            </span>
                            <span className={`${isSidebar ? 'text-[17px]' : 'text-[15px]'} font-bold text-slate-700`}>
                                3,129세대
                            </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className={`${isSidebar ? 'text-[15px]' : 'text-[13px]'} font-bold text-slate-400 flex items-center gap-1.5`}>
                                주차
                                <Car className={`${isSidebar ? 'w-3.5 h-3.5' : 'w-3 h-3'} text-slate-300`} />
                            </span>
                            <span className={`${isSidebar ? 'text-[17px]' : 'text-[15px]'} font-bold text-slate-700`}>
                                세대당 0.8대
                            </span>
                        </div>
                    </div>

                    {/* ChevronDown icon at bottom center - Expandable */}
                    <div className="flex justify-center mt-6">
                        <button
                            onClick={() => setIsInfoExpanded(!isInfoExpanded)}
                            className="p-2 hover:bg-slate-50 rounded-full transition-colors"
                        >
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isInfoExpanded ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {/* Expanded Info Section */}
                    <div 
                        className={`overflow-hidden transition-all duration-500 ease-in-out ${
                            isInfoExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
                        }`}
                    >
                        <div className={`mt-4 pt-4 border-t border-slate-100 transition-all duration-500 ${
                            isInfoExpanded ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
                        }`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {detailData.info
                                    .filter(info => {
                                        // 기존에 표시된 정보 제외
                                        const excludedLabels = ['세대수'];
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
                        <div className="bg-white rounded-2xl border border-slate-200/50 shadow-lg overflow-hidden">
                            {/* Area Tabs */}
                            <div className="flex bg-white rounded-t-xl p-1.5 gap-2 overflow-x-auto border-b border-slate-200/50">
                                {['84', '90', '102', '114'].map(area => (
                                    <button
                                        key={area}
                                        onClick={() => setSelectedArea(area)}
                                        className={`${isSidebar ? 'px-4 py-2 text-[15px]' : 'px-4 py-2 text-[13px]'} font-bold rounded-lg transition-all whitespace-nowrap ${
                                            selectedArea === area
                                            ? 'bg-slate-900 text-white border border-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'
                                        }`}
                                    >
                                        {area}m²
                                    </button>
                                ))}
                            </div>

                            {/* Content wrapped by area tabs */}
                            <div className="p-5 space-y-4">
                        {/* Chart - List Style */}
                        <div className="bg-transparent flex flex-col">
                            <div className={`flex items-center gap-3 ${isSidebar ? 'mb-5' : 'mb-6'} flex-wrap`}>
                                <ToggleButtonGroup
                                    options={['매매', '전세', '월세']}
                                    value={chartType}
                                    onChange={(value) => setChartType(value as ChartType)}
                                    className="bg-slate-100/80"
                                />
                                
                                {/* Area Dropdown Filter */}
                                <GenericDropdown
                                    value={selectedArea}
                                    onChange={(value) => setSelectedArea(value)}
                                    options={[
                                        { value: '84', label: '84㎡' },
                                        { value: '90', label: '90㎡' },
                                        { value: '102', label: '102㎡' },
                                        { value: '114', label: '114㎡' }
                                    ]}
                                />
                                
                                {/* Segmented Control for Period - Moved to right */}
                                <div className="ml-auto">
                                    <ToggleButtonGroup
                                        options={['1년', '3년', '전체']}
                                        value={chartPeriod}
                                        onChange={(value) => setChartPeriod(value)}
                                        className="bg-slate-100/80"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 w-full relative">
                                <ProfessionalChart 
                                    data={chartData} 
                                    height={isSidebar ? 240 : 320} 
                                    lineColor={chartType === '매매' ? '#3182F6' : (chartType === '전세' ? '#10b981' : '#f59e0b')}
                                    areaTopColor={chartType === '매매' ? 'rgba(49, 130, 246, 0.15)' : (chartType === '전세' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)')}
                                />
                            </div>
                        </div>

                        {/* Transaction Table - List Style */}
                        <div className="bg-transparent overflow-hidden flex flex-col" style={{ maxHeight: isSidebar ? '360px' : '500px' }}>
                            <div className={`${isSidebar ? 'pb-3' : 'pb-3'} border-b border-slate-200/50 flex justify-between items-center bg-transparent sticky top-0 z-10`}>
                                <h3 className={`${isSidebar ? 'text-[19px]' : 'text-[16px]'} font-black text-slate-900`}>실거래 내역</h3>
                                <select 
                                    value={txFilter}
                                    onChange={(e) => setTxFilter(e.target.value as TransactionType)}
                                    className={`${isSidebar ? 'text-[14px]' : 'text-[11px]'} font-bold bg-white border border-slate-200 rounded-lg py-1.5 px-3 focus:ring-0 focus:border-slate-300`}
                                >
                                    <option value="전체">전체</option>
                                    <option value="매매">매매</option>
                                    <option value="전세">전세</option>
                                </select>
                            </div>
                            
                            <div className={`grid grid-cols-4 ${isSidebar ? 'py-3 px-0 text-[14px]' : 'py-3 px-0 text-[12px]'} font-bold text-slate-500 border-b border-slate-200/50 mt-3`}>
                                <div className={isSidebar ? '' : ''}>일자</div>
                                <div className="text-center">구분</div>
                                <div className="text-center">층</div>
                                <div className={`text-right ${isSidebar ? '' : ''}`}>거래액</div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {filteredTransactions.map((tx, i) => (
                                    <div key={i} className={`grid grid-cols-4 ${isSidebar ? 'py-3' : 'py-4'} text-[15px] border-b border-slate-100/50 last:border-0 hover:bg-slate-50/50 transition-colors items-center ${isSidebar ? 'h-[48px]' : 'h-[52px]'}`}>
                                        <div className={`text-slate-500 ${isSidebar ? 'text-[14px]' : 'text-[12px]'} font-medium tabular-nums`}>{tx.date}</div>
                                        <div className={`font-bold ${tx.type === '매매' ? 'text-slate-900' : (tx.type === '전세' ? 'text-indigo-600' : 'text-emerald-600')} text-center ${isSidebar ? 'text-[14px]' : 'text-[13px]'}`}>{tx.type}</div>
                                        <div className={`text-slate-500 text-center ${isSidebar ? 'text-[14px]' : 'text-[12px]'} tabular-nums`}>{tx.floor}</div>
                                        <div className={`text-right tabular-nums ${isSidebar ? '' : ''}`}>
                                            <FormatPrice val={tx.price} sizeClass={isSidebar ? "text-[15px]" : "text-[15px]"} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Neighbors List - List Style (No Card) */}
                        <div className="bg-transparent overflow-hidden">
                            <div className={`${isSidebar ? 'pb-3' : 'pb-3'} border-b border-slate-200/50`}>
                                <h3 className={`${isSidebar ? 'text-[19px]' : 'text-[17px]'} font-black text-slate-900`}>주변 시세 비교</h3>
                            </div>
                            <div className="overflow-hidden flex flex-col divide-y divide-slate-100/50 mt-3">
                                {detailData.neighbors.map((item, i) => (
                                    <NeighborItem key={i} item={item} currentPrice={areaBasedPrice} />
                                ))}
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
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                        
                        {/* 2. Chart Card */}
                        <div className="lg:col-span-2 space-y-8">
                            <Card className="p-6 bg-white h-[500px] flex flex-col">
                                <div className="flex items-center gap-3 mb-6">
                                    <ToggleButtonGroup
                                        options={['매매', '전세', '월세']}
                                        value={chartType}
                                        onChange={(value) => setChartType(value as ChartType)}
                                    />
                                    
                                    {/* Area Dropdown Filter */}
                                    <GenericDropdown
                                        value={selectedArea}
                                        onChange={(value) => setSelectedArea(value)}
                                        options={[
                                            { value: '84', label: '84㎡' },
                                            { value: '90', label: '90㎡' },
                                            { value: '102', label: '102㎡' },
                                            { value: '114', label: '114㎡' }
                                        ]}
                                    />
                                    
                                    {/* Segmented Control for Period - Moved to right */}
                                    <div className="ml-auto">
                                        <ToggleButtonGroup
                                            options={['1년', '3년', '전체']}
                                            value={chartPeriod}
                                            onChange={(value) => setChartPeriod(value)}
                                        />
                                    </div>
                                </div>

                                <div className="flex-1 w-full relative">
                                    <ProfessionalChart 
                                        data={chartData} 
                                        height={320} 
                                        lineColor={chartType === '매매' ? '#3182F6' : (chartType === '전세' ? '#10b981' : '#f59e0b')}
                                        areaTopColor={chartType === '매매' ? 'rgba(49, 130, 246, 0.15)' : (chartType === '전세' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)')}
                                    />
                                </div>
                            </Card>

                            {/* Neighbors List */}
                            <Card className="bg-white overflow-hidden flex flex-col h-[400px]">
                                <div className="p-5 border-b border-slate-100 flex-shrink-0">
                                    <h3 className="text-[16px] font-black text-slate-900">주변 시세 비교</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50" style={{ scrollbarGutter: 'stable' }}>
                                    {detailData.neighbors.map((item, i) => (
                                        <NeighborItem key={i} item={item} currentPrice={detailData.currentPrice} />
                                    ))}
                                </div>
                            </Card>
                        </div>

                        {/* 3. Transaction Table & Info */}
                        <div className="lg:col-span-1 space-y-8">
                            <Card className="bg-white overflow-hidden flex flex-col h-[500px]">
                                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                                    <h3 className="text-[16px] font-black text-slate-900">실거래 내역</h3>
                                    <CustomDropdown
                                        value={txFilter}
                                        onChange={setTxFilter}
                                        options={[
                                            { value: '전체', label: '전체' },
                                            { value: '매매', label: '매매' },
                                            { value: '전세', label: '전세' }
                                        ]}
                                    />
                                </div>
                                
                                <div className="grid grid-cols-4 py-3 px-4 bg-slate-50/50 text-[12px] font-bold text-slate-500 border-b border-slate-100">
                                    <div className="pl-4">일자</div>
                                    <div className="text-center">구분</div>
                                    <div className="text-center">층</div>
                                    <div className="text-right pr-4">거래액</div>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
                                    {filteredTransactions.map((tx, i) => (
                                        <TransactionRow key={i} tx={tx} />
                                    ))}
                                </div>
                            </Card>

                            <Card className="bg-white overflow-hidden flex flex-col h-[400px]">
                                <div className="p-5 border-b border-slate-100 flex-shrink-0">
                                    <h3 className="text-[16px] font-black text-slate-900">단지 정보</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50" style={{ scrollbarGutter: 'stable' }}>
                                    {detailData.info.map((info, i) => (
                                        <div key={i} className="flex justify-between p-4 text-[14px]">
                                            <span className="font-medium text-slate-500">{info.label}</span>
                                            <span className="font-bold text-slate-900 text-right">{info.value}</span>
                                        </div>
                                    ))}
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
                       <ProfessionalChart data={chartData} height={200} />
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
                <select
                  value={myPropertyForm.exclusive_area}
                  onChange={(e) => setMyPropertyForm(prev => ({ ...prev, exclusive_area: Number(e.target.value) }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all bg-white"
                >
                  <option value={59}>59㎡ (약 18평)</option>
                  <option value={84}>84㎡ (약 25평)</option>
                  <option value={102}>102㎡ (약 31평)</option>
                  <option value={114}>114㎡ (약 34평)</option>
                </select>
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
