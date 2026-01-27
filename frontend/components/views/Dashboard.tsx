import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, Plus, MoreHorizontal, ArrowUpDown, Eye, EyeOff, X, Check, LogIn, Settings, ChevronDown, Layers, Edit2, CheckCircle2, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser, useAuth as useClerkAuth, useClerk, SignIn, SignedIn, SignedOut } from '@clerk/clerk-react';
import { Navigate, useLocation } from 'react-router-dom';
import { Property, ViewProps } from '../../types';
import { ProfessionalChart, ChartSeriesData } from '../ui/ProfessionalChart';
import { Skeleton } from '../ui/Skeleton';
import { NumberTicker } from '../ui/NumberTicker';
import { Card } from '../ui/Card';
import { DashboardPanelCard, ComparisonData } from '../DashboardPanelCard';
import { ProfileWidgetsCard } from '../ProfileWidgetsCard';
import { ToggleButtonGroup } from '../ui/ToggleButtonGroup';
import { Select } from '../ui/Select';
import { ApartmentRow } from '../ui/ApartmentRow';
import { PercentileBadge } from '../ui/PercentileBadge';
import { MyPropertyModal } from './MyPropertyModal';
import { 
  fetchMyProperties, 
  fetchFavoriteApartments, 
  createMyProperty,
  deleteMyProperty,
  addFavoriteApartment,
  removeFavoriteApartment,
  searchApartments,
  fetchCompareApartments,
  fetchApartmentTransactions,
  fetchApartmentExclusiveAreas,
  fetchApartmentDetail,
  fetchHPIByRegionType,
  fetchRegionPrices,
  fetchRegionStats,
  fetchMyUiPreferences,
  updateMyUiPreferences,
  setAuthToken,
  type MyProperty,
  type FavoriteApartment,
  type ApartmentSearchItem,
  type DashboardBottomPanelView
} from '../../services/api';


// Real apartment price data (approximate historical data in 만원)
const realApartmentData: Record<string, { time: string; value: number }[]> = {
    // 시흥 배곧 호반써밋 (2020년 4억 1천 → 2024년 4억 5천)
    '시흥 배곧 호반써밋': (() => {
        const data = [];
        const startDate = new Date('2021-01-01');
        const baseValues = [41000, 42000, 43500, 46000, 48000, 47000, 45500, 44000, 45000]; // 분기별 대략적 가격
        for (let i = 0; i < 1100; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            const quarterIndex = Math.min(Math.floor(i / 120), baseValues.length - 1);
            const variation = (Math.random() - 0.5) * 500;
            data.push({
                time: date.toISOString().split('T')[0],
                value: Math.floor(baseValues[quarterIndex] + variation),
            });
        }
        return data;
    })(),
    // 김포 한강 센트럴자이 (2021년 4억 2천 → 2024년 3억 9천, 하락세)
    '김포 한강 센트럴자이': (() => {
        const data = [];
        const startDate = new Date('2021-01-01');
        const baseValues = [42000, 44000, 45000, 43000, 41000, 40000, 39500, 39000, 39000];
        for (let i = 0; i < 1100; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            const quarterIndex = Math.min(Math.floor(i / 120), baseValues.length - 1);
            const variation = (Math.random() - 0.5) * 500;
            data.push({
                time: date.toISOString().split('T')[0],
                value: Math.floor(baseValues[quarterIndex] + variation),
            });
        }
        return data;
    })(),
    // 수원 영통 황골마을 (2019년 2억 8천 → 2024년 3억 2천)
    '수원 영통 황골마을': (() => {
        const data = [];
        const startDate = new Date('2021-01-01');
        const baseValues = [28000, 29000, 30000, 31500, 33000, 34000, 33000, 32000, 32000];
        for (let i = 0; i < 1100; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            const quarterIndex = Math.min(Math.floor(i / 120), baseValues.length - 1);
            const variation = (Math.random() - 0.5) * 400;
            data.push({
                time: date.toISOString().split('T')[0],
                value: Math.floor(baseValues[quarterIndex] + variation),
            });
        }
        return data;
    })(),
};

const generateAssetHistory = (startPrice: number, volatility: number, assetName?: string) => {
    // If we have real data for this asset, use it
    if (assetName && realApartmentData[assetName]) {
        return realApartmentData[assetName];
    }
    
    // Otherwise generate random data
    const data = [];
    let basePrice = startPrice; 
    const startDate = new Date('2021-01-01');

    for (let i = 0; i < 1100; i++) { 
        const change = (Math.random() - 0.48) * volatility;
        basePrice = basePrice + change;
        
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        data.push({
            time: date.toISOString().split('T')[0],
            value: Math.floor(basePrice),
        });
    }
    return data;
};

export const myProperties: Property[] = [
  { id: '1', name: '수원 영통 황골마을', location: '수원시 영통구', area: 84, currentPrice: 32000, purchasePrice: 28000, purchaseDate: '2019-05', changeRate: 14.2, jeonsePrice: 24000, gapPrice: 8000, jeonseRatio: 75.0, loan: 10000 },
  { id: '2', name: '시흥 배곧 호반써밋', location: '시흥시 배곧동', area: 84, currentPrice: 45000, purchasePrice: 41000, purchaseDate: '2020-08', changeRate: 9.7, jeonsePrice: 28000, gapPrice: 17000, jeonseRatio: 62.2, loan: 15000 },
  { id: '3', name: '김포 한강 센트럴자이', location: '김포시 장기동', area: 84, currentPrice: 39000, purchasePrice: 42000, purchaseDate: '2021-10', changeRate: -7.1, jeonsePrice: 25000, gapPrice: 14000, jeonseRatio: 64.1, loan: 20000 },
];

const rawFav1Properties: Property[] = [
  { id: 'f1-1', name: '성동구 옥수 파크힐스', location: '서울시 성동구', area: 59, currentPrice: 145000, purchasePrice: 140000, purchaseDate: '-', changeRate: 3.5, jeonsePrice: 80000, gapPrice: 65000, jeonseRatio: 55.1 },
  { id: 'f1-2', name: '마포 래미안 푸르지오', location: '서울시 마포구', area: 84, currentPrice: 182000, purchasePrice: 178000, purchaseDate: '-', changeRate: 2.2, jeonsePrice: 95000, gapPrice: 87000, jeonseRatio: 52.1 },
];

const rawFav2Properties: Property[] = [
  { id: 'f2-1', name: '천안 불당 지웰', location: '천안시 서북구', area: 84, currentPrice: 75000, purchasePrice: 76000, purchaseDate: '-', changeRate: -1.3, jeonsePrice: 45000, gapPrice: 30000, jeonseRatio: 60.0 },
  { id: 'f2-2', name: '청주 지웰시티 1차', location: '청주시 흥덕구', area: 99, currentPrice: 62000, purchasePrice: 60000, purchaseDate: '-', changeRate: 3.3, jeonsePrice: 38000, gapPrice: 24000, jeonseRatio: 61.2 },
];

// Apartment images for random assignment
const apartmentImages = [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=100&h=100&fit=crop',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=100&h=100&fit=crop',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=100&h=100&fit=crop',
    'https://images.unsplash.com/photo-1574362848149-11496d93a7c7?w=100&h=100&fit=crop',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=100&h=100&fit=crop',
    'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=100&h=100&fit=crop',
];

const getApartmentImageUrl = (id: string) => {
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return apartmentImages[hash % apartmentImages.length];
};

// Convert sqm to pyeong
const convertToPyeong = (sqm: number) => Math.round(sqm / 3.306);

// Helper for formatted price: Smart Typography (Numbers Bold, Units Light)
const FormatPriceWithUnit = ({ value, isDiff = false }: { value: number, isDiff?: boolean }) => {
    const absVal = Math.abs(value);
    const eok = Math.floor(absVal / 10000);
    const man = absVal % 10000;
    const priceFontFamily =
        "'Pretendard Variable', Pretendard, system-ui, -apple-system, 'Segoe UI', sans-serif";
    
    // 0원일 경우
    if (absVal === 0) {
        return <span className="tabular-nums font-bold text-slate-400">-</span>;
    }

    if (isDiff) {
        // 변동액 표시 (단위 작게)
        if (eok === 0) {
            return (
                <span
                    className="tabular-nums tracking-tight inline-flex items-baseline justify-end gap-0.5"
                    style={{ fontFamily: priceFontFamily }}
                >
                    <span className="font-bold text-[15px]">{man.toLocaleString()}</span>
                    <span className="font-bold text-[15px]">만</span>
                </span>
            );
        }
        return (
            <span
                className="tabular-nums tracking-tight inline-flex items-baseline justify-end gap-0.5"
                style={{ fontFamily: priceFontFamily }}
            >
                <span className="font-bold text-[15px]">{eok}</span>
                <span className="font-bold text-[15px]">억</span>
                {man > 0 && (
                    <>
                        <span className="font-bold text-[15px] ml-0.5">{man.toLocaleString()}</span>
                        <span className="font-bold text-[15px]">만</span>
                    </>
                )}
            </span>
        );
    }

    // 메인 가격 표시 (큰 숫자, 작은 단위)
    return (
        <span
            className="tabular-nums tracking-tight inline-flex items-baseline justify-end"
            style={{
                // 숫자/한글(억)이 서로 다른 폰트로 렌더링되는 이질감 방지
                fontFamily: priceFontFamily,
            }}
        >
            <span className="font-bold text-[19px] md:text-[20px] text-slate-900 dark:text-white">{eok}</span>
            <span className="font-bold text-[19px] md:text-[20px] text-slate-900 dark:text-white mr-1">억</span>
            {man > 0 && (
                <>
                    <span className="font-bold text-[19px] md:text-[20px] text-slate-900 dark:text-white">{man.toLocaleString()}</span>
                    <span className="font-bold text-[19px] md:text-[20px] text-slate-900 dark:text-white">만</span>
                </>
            )}
        </span>
    );
};

// Simple text formatter for NumberTicker or strings (만원 제거)
const formatPriceString = (v: number) => {
    const eok = Math.floor(v / 10000);
    const man = v % 10000;
    return `${eok}억 ${man > 0 ? man.toLocaleString() : '0,000'}`;
};

// Format price without 원 for comparison text - 1만원 이상이면 억 단위로 표시
const formatPriceWithoutWon = (v: number) => {
    const absVal = Math.abs(v);
    if (absVal >= 10000) {
        const eok = Math.floor(absVal / 10000);
        const man = absVal % 10000;
        return man > 0 ? `${eok}억 ${man.toLocaleString()}` : `${eok}억`;
    }
    return v.toLocaleString();
};

// 만원 입력값을 "x억" 또는 "x만원"으로 표시 (입력 아래 안내용)
const formatManwonToEokOrManwon = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 0) return '';

    // 1억 = 10,000만원 기준
    if (value >= 10000) {
        const eok = value / 10000;
        // 소수점 2자리까지 보여주되, 불필요한 0은 제거 (예: 1.00억 -> 1억, 8.50억 -> 8.5억)
        const compact = eok.toFixed(2).replace(/\.?0+$/, '');
        return `${compact}억`;
    }

    return `${Math.trunc(value).toLocaleString()}만원`;
};

// ----------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------

interface DashboardAsset extends Property {
    isVisible: boolean;
    chartData: { time: string; value: number }[];
    color: string;
}

interface AssetGroup {
    id: string;
    name: string;
    assets: DashboardAsset[];
}

const CHART_COLORS = [
    '#3182F6', 
    '#FF4B4B', 
    '#f59e0b', 
    '#8b5cf6', 
    '#10b981', 
    '#06b6d4', 
];

// ----------------------------------------------------------------------
// SUB-COMPONENTS
// ----------------------------------------------------------------------

// 자산 행 컴포넌트 (Dashboard 페이지 전용)
const AssetRow: React.FC<{ 
    item: DashboardAsset; 
    onClick: () => void;
    onToggleVisibility: (e: React.MouseEvent) => void;
    isEditMode?: boolean;
    onDelete?: (e: React.MouseEvent) => void;
    onEdit?: (e: React.MouseEvent) => void;
    isDeleting?: boolean;
    isMyAsset?: boolean;
}> = ({ item, onClick, onToggleVisibility, isEditMode, onDelete, onEdit, isDeleting, isMyAsset }) => {
    const imageUrl = getApartmentImageUrl(item.id);
    
    // 실거래가 데이터에서 가격 변동 계산 (최근 거래 vs 이전 거래)
    const priceChange = useMemo(() => {
        if (!item.chartData || item.chartData.length < 2) {
            return { diff: 0, rate: 0, hasData: false };
        }
        
        // 시간순 정렬 (최신이 마지막)
        const sortedData = [...item.chartData].sort((a, b) => 
            new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        
        const latestPrice = sortedData[sortedData.length - 1].value;
        const previousPrice = sortedData[sortedData.length - 2].value;
        const diff = latestPrice - previousPrice;
        const rate = previousPrice > 0 ? (diff / previousPrice) * 100 : 0;
        
        return { diff, rate, hasData: true };
    }, [item.chartData]);
    
    const isProfit = priceChange.diff >= 0;
    
    return (
        <div className={`transition-all duration-300 ${isDeleting ? 'opacity-0 scale-95 -translate-x-4' : 'opacity-100 scale-100 translate-x-0'}`}>
            <ApartmentRow
                name={item.name}
                location={item.location}
                area={item.area}
                price={item.currentPrice}
                imageUrl={imageUrl}
                color={item.color}
                showImage={false}
                isVisible={item.isVisible}
                onClick={onClick}
                onToggleVisibility={onToggleVisibility}
                variant="compact"
                className="px-2"
                rightContent={
                    <>
                        {/* 카드(우측 영역) 기준으로 가격/변동 표시 */}
                        <div className="text-right min-w-0">
                            <p className={`font-bold text-[15px] md:text-[17px] tabular-nums tracking-tight truncate ${
                                item.isVisible ? 'text-slate-900' : 'text-slate-400'
                            }`}>
                                <FormatPriceWithUnit value={item.currentPrice} />
                            </p>
                            {priceChange.hasData && (
                                <p className={`text-[12px] md:text-[13px] mt-0.5 font-bold tabular-nums whitespace-nowrap flex items-baseline justify-end gap-1 ${
                                    isProfit ? 'text-red-500' : 'text-blue-500'
                                }`}>
                                    <span className="whitespace-nowrap">
                                        {isProfit ? '+' : '-'}
                                        <FormatPriceWithUnit value={priceChange.diff} isDiff />
                                    </span>
                                    <span className="whitespace-nowrap text-[15px]">({priceChange.rate.toFixed(1)}%)</span>
                                </p>
                            )}
                        </div>

                        {!isEditMode && onEdit && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(e);
                                }}
                                className="hidden md:flex w-9 h-9 rounded-full items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-colors ml-3 flex-shrink-0"
                                title="편집"
                                aria-label="편집"
                            >
                                <Edit2 className="w-4 h-4" />
                            </button>
                        )}
                        {isEditMode && onDelete ? (
                            <button
                                onClick={onDelete}
                                className="w-9 h-9 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md ml-3 flex-shrink-0"
                                title="삭제"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        ) : (
                            <div className="hidden md:block transform transition-transform duration-300 group-hover:translate-x-1 text-slate-300 group-hover:text-blue-500 ml-2">
                                <ChevronRight className="w-5 h-5" />
                            </div>
                        )}
                    </>
                }
            />
        </div>
    );
}

// ----------------------------------------------------------------------
// DASHBOARD
// ----------------------------------------------------------------------
export const Dashboard: React.FC<ViewProps> = ({ onPropertyClick, onViewAllPortfolio, onSettingsClickRef }) => {
  const location = useLocation();
  
  // Clerk 인증 상태
  const { isLoaded: isClerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { getToken } = useClerkAuth();
  const { openSignIn } = useClerk();

  // 홈에서 로그인 모달
  const [isHomeSignInOpen, setIsHomeSignInOpen] = useState(false);

  // 신규 유저(온보딩 미완료) 여부 (렌더링 시점에서 체크하여 Navigate로 리다이렉트)
  const isOnboardingCompleted = Boolean((clerkUser as any)?.unsafeMetadata?.onboardingCompleted);
  
  const [isLoading, setIsLoading] = useState(true);
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([
      { id: 'my', name: '내 자산', assets: [] },
      { id: 'favorites', name: '관심 단지', assets: [] },
  ]);

  const [activeGroupId, setActiveGroupId] = useState<string>(() => {
    // 온보딩 2(신규 유저) 완료 직후 첫 진입: 기본 탭을 '관심 단지'로
    try {
      const v = window.localStorage.getItem('onboarding.defaultTab');
      return v === 'favorites' ? 'favorites' : 'my';
    } catch {
      return 'my';
    }
  });

  // Dashboard가 이미 마운트된 상태에서 '/'로 다시 이동하는 경우에도
  // localStorage로 전달된 기본 탭을 반영한다.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('onboarding.defaultTab');
      if (v === 'favorites' || v === 'my') {
        setActiveGroupId(v);
        window.localStorage.removeItem('onboarding.defaultTab');
      }
    } catch {
      // ignore
    }
  }, [location.key]);

  // 1회성 플래그는 읽은 뒤 제거
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('onboarding.defaultTab');
      if (v) window.localStorage.removeItem('onboarding.defaultTab');
    } catch {
      // ignore
    }
  }, []);
  const [viewMode, setViewMode] = useState<'separate' | 'combined'>('separate');
  const [sortOption, setSortOption] = useState<string>('currentPrice-desc');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('1년');
  const [scrolled, setScrolled] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null); // 개별 아파트 선택 필터
  
  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null); // 삭제 중인 아이템 ID
  
  // Add group modal
  const [isAddGroupModalOpen, setIsAddGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  
  // Add apartment modal
  const [isAddApartmentModalOpen, setIsAddApartmentModalOpen] = useState(false);
  const [apartmentSearchQuery, setApartmentSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ apt_id: number; apt_name: string; address?: string; price?: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // 내 자산 추가 상세 모달 (PropertyDetail과 동일)
  const [isMyPropertyModalOpen, setIsMyPropertyModalOpen] = useState(false);
  const [selectedApartmentForAdd, setSelectedApartmentForAdd] = useState<{ apt_id: number; apt_name: string } | null>(null);
  const [myPropertyForm, setMyPropertyForm] = useState({
    nickname: '',
    exclusive_area: 84,
    purchase_price: '',
    purchase_date: '',
    memo: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exclusiveAreaOptions, setExclusiveAreaOptions] = useState<number[]>([]);
  const [isLoadingExclusiveAreas, setIsLoadingExclusiveAreas] = useState(false);
  const [apartmentDetail, setApartmentDetail] = useState<{ apt_name: string } | null>(null);

  // 내 자산 수정 모달 (대시보드에서 바로 수정)
  const [isEditMyPropertyModalOpen, setIsEditMyPropertyModalOpen] = useState(false);
  const [editMyPropertyTarget, setEditMyPropertyTarget] = useState<{
    aptId: number;
    apartmentName: string;
    myPropertyId: number;
  } | null>(null);
  
  // Mobile settings panel (관심 리스트 설정)
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  
  // 설정 핸들러를 외부로 노출 (초기 렌더링 시 자동 호출 방지)
  useEffect(() => {
    onSettingsClickRef?.(() => {
      // 명시적으로 호출될 때만 설정 열기
      setIsMobileSettingsOpen(true);
    });
  }, [onSettingsClickRef]);
  
  // 지역별 수익률 비교 데이터
  const [regionComparisonData, setRegionComparisonData] = useState<ComparisonData[]>([]);
  const [isRegionComparisonLoading, setIsRegionComparisonLoading] = useState(false);

  // 좌/우 카드 표시 콘텐츠 선택 (서로 독립)
  const UI_PREF_LEFT_KEY = 'ui_pref.dashboard_left_panel_view';
  const UI_PREF_RIGHT_KEY = 'ui_pref.dashboard_right_panel_view';

  const isValidPanelView = (v: string | null): v is DashboardBottomPanelView =>
    v === 'policyNews' || v === 'transactionVolume' || v === 'marketPhase' || v === 'regionComparison';

  const [leftPanelView, setLeftPanelView] = useState<DashboardBottomPanelView>(() => {
    try {
      const v = window.localStorage.getItem(UI_PREF_LEFT_KEY);
      return isValidPanelView(v) ? v : 'policyNews';
    } catch {
      return 'policyNews';
    }
  });

  const [rightPanelView, setRightPanelView] = useState<DashboardBottomPanelView>(() => {
    try {
      const v = window.localStorage.getItem(UI_PREF_RIGHT_KEY);
      return isValidPanelView(v) ? v : 'regionComparison';
    } catch {
      return 'regionComparison';
    }
  });

  const uiPrefSaveTimerRef = useRef<number | null>(null);
  const skipNextUiPrefSaveRef = useRef(false);
  const lastSavedUiPrefRef = useRef<DashboardBottomPanelView | null>(null);

  const setLeftPanelViewPersisted = useCallback((next: DashboardBottomPanelView) => {
    setLeftPanelView(next);
    try {
      window.localStorage.setItem(UI_PREF_LEFT_KEY, next);
    } catch {
      // ignore
    }
    
    // DB에 저장 (로그인 사용자만)
    if (isClerkLoaded && isSignedIn && getToken) {
      (async () => {
        try {
          const token = await getToken();
          setAuthToken(token);
          await updateMyUiPreferences({ 
              left_panel_view: next,
              right_panel_view: rightPanelView 
          });
        } catch {
          // 저장 실패는 조용히 무시
        }
      })();
    }
  }, [isClerkLoaded, isSignedIn, getToken, rightPanelView]);

  const setRightPanelViewPersisted = useCallback((next: DashboardBottomPanelView) => {
    setRightPanelView(next);
    try {
      window.localStorage.setItem(UI_PREF_RIGHT_KEY, next);
    } catch {
      // ignore
    }
    
    // DB에 저장 (로그인 사용자만)
    if (isClerkLoaded && isSignedIn && getToken) {
      (async () => {
        try {
          const token = await getToken();
          setAuthToken(token);
          await updateMyUiPreferences({ 
              left_panel_view: leftPanelView,
              right_panel_view: next 
          });
        } catch {
          // 저장 실패는 조용히 무시
        }
      })();
    }
  }, [isClerkLoaded, isSignedIn, getToken, leftPanelView]);
  
  // 토스트 알림 상태
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // 내 자산 추가 직후, 리스트 동기화를 여러 번 시도(간헐적 반영 지연 대응)
  const postAddRefreshIntervalRef = useRef<number | null>(null);
  const postAddRefreshInFlightRef = useRef(false);
  const regionComparisonInFlightRef = useRef(false);
  const regionComparisonRunIdRef = useRef(0);

  // UI 개인화 설정 로드 (로그인 사용자만)
  useEffect(() => {
      if (!isClerkLoaded || !isSignedIn) return;

      let cancelled = false;
      (async () => {
          try {
              const token = await getToken();
              setAuthToken(token);

              const res = await fetchMyUiPreferences();
              if (cancelled) return;
              if (res?.success && res.data) {
                  // 좌측 카드 설정 로드
                  if (res.data.left_panel_view) {
                      const leftNext = res.data.left_panel_view as DashboardBottomPanelView;
                      if (isValidPanelView(leftNext)) {
                          setLeftPanelView(leftNext);
                          try {
                              window.localStorage.setItem(UI_PREF_LEFT_KEY, leftNext);
                          } catch {
                              // ignore
                          }
                      }
                  }
                  
                  // 우측 카드 설정 로드 (right_panel_view 우선, 없으면 bottom_panel_view 사용)
                  const rightNext = (res.data.right_panel_view || res.data.bottom_panel_view) as DashboardBottomPanelView;
                  if (rightNext && isValidPanelView(rightNext)) {
                      skipNextUiPrefSaveRef.current = true; // 서버 값 적용은 저장 트리거에서 제외
                      lastSavedUiPrefRef.current = rightNext;
                      setRightPanelView(rightNext);
                      try {
                          window.localStorage.setItem(UI_PREF_RIGHT_KEY, rightNext);
                      } catch {
                          // ignore
                      }
                  }
              }
          } catch {
              // 로그인 사용자만 저장 요구사항: 실패는 조용히 무시
          }
      })();

      return () => {
          cancelled = true;
      };
  }, [isClerkLoaded, isSignedIn, getToken]);

  // UI 개인화 설정 저장 (디바운스, 로그인 사용자만)
  useEffect(() => {
      if (!isClerkLoaded || !isSignedIn) return;

      if (skipNextUiPrefSaveRef.current) {
          skipNextUiPrefSaveRef.current = false;
          return;
      }

      if (lastSavedUiPrefRef.current === rightPanelView) return;

      if (uiPrefSaveTimerRef.current) {
          window.clearTimeout(uiPrefSaveTimerRef.current);
      }

      uiPrefSaveTimerRef.current = window.setTimeout(async () => {
          try {
              const token = await getToken();
              setAuthToken(token);

              await updateMyUiPreferences({ 
                  left_panel_view: leftPanelView,
                  right_panel_view: rightPanelView 
              });
              lastSavedUiPrefRef.current = rightPanelView;
          } catch {
              // 저장 실패는 조용히 무시 (다음 변경 때 재시도)
          }
      }, 600);

      return () => {
          if (uiPrefSaveTimerRef.current) {
              window.clearTimeout(uiPrefSaveTimerRef.current);
          }
      };
  }, [rightPanelView, isClerkLoaded, isSignedIn, getToken]);

  // Property를 DashboardAsset으로 변환하는 헬퍼 함수
  const mapToDashboardAsset = useCallback((raw: Property[], startIndex: number): DashboardAsset[] => {
      return raw.map((p, idx) => ({
          ...p,
          isVisible: true,
          chartData: [],  // 초기값은 빈 배열, 나중에 API로 채울 것
          color: CHART_COLORS[(startIndex + idx) % CHART_COLORS.length]
      }));
  }, []);

  // MyProperty를 Property로 변환 (API 데이터만 사용, fallback 없음)
  const mapMyPropertyToProperty = (mp: MyProperty): Property => {
      console.log('🔍 내 자산 데이터:', {
          property_id: mp.property_id,
          apt_id: mp.apt_id,
          apt_name: mp.apt_name,
          current_market_price: mp.current_market_price,
          purchase_price: mp.purchase_price
      });
      
      // 주소 포맷: "경기도 시흥시 배곧동" 형태로 변환
      const formatLocation = (cityName?: string | null, regionName?: string | null): string => {
          if (!regionName) return '위치 정보 없음';
          // city_name에서 표시용 광역/도 단위 이름 추출
          // 예: "서울특별시" → "서울", "인천광역시" → "인천", "경기도" → "경기도", "제주특별자치도" → "제주도"
          let shortCity = '';
          if (cityName) {
              shortCity = cityName
                  .replace('세종특별자치시', '세종')
                  .replace('제주특별자치도', '제주도')
                  .replace('강원특별자치도', '강원도')
                  .replace('특별시', '')
                  .replace('광역시', '')
                  .replace('특별자치시', '');
          }
          return `${shortCity} ${regionName}`.trim();
      };
      
      return {
          id: String(mp.property_id),
          aptId: mp.apt_id,
          name: mp.apt_name || mp.nickname || '이름 없음',
          location: formatLocation(mp.city_name, mp.region_name),
          area: mp.exclusive_area || 84,
          currentPrice: mp.current_market_price || 0,
          purchasePrice: mp.purchase_price || mp.current_market_price || 0,
          purchaseDate: mp.created_at ? mp.created_at.split('T')[0] : '-',
          changeRate: mp.index_change_rate || 0,
          jeonsePrice: 0,
          gapPrice: 0,
          jeonseRatio: 0,
      };
  };

  // FavoriteApartment를 Property로 변환 (API 데이터만 사용, fallback 없음)
  const mapFavoriteToProperty = (fav: FavoriteApartment): Property => {
      console.log('🔍 관심 아파트 데이터:', {
          apt_id: fav.apt_id,
          apt_name: fav.apt_name,
          current_market_price: fav.current_market_price,
          exclusive_area: fav.exclusive_area
      });
      
      // 주소 포맷: "경기도 시흥시 배곧동" 형태로 변환
      const formatLocation = (cityName?: string | null, regionName?: string | null): string => {
          if (!regionName) return '위치 정보 없음';
          let shortCity = '';
          if (cityName) {
              shortCity = cityName
                  .replace('세종특별자치시', '세종')
                  .replace('제주특별자치도', '제주도')
                  .replace('강원특별자치도', '강원도')
                  .replace('특별시', '')
                  .replace('광역시', '')
                  .replace('특별자치시', '');
          }
          return `${shortCity} ${regionName}`.trim();
      };
      
      return {
          id: String(fav.favorite_id),
          aptId: fav.apt_id,
          name: fav.apt_name || fav.nickname || '이름 없음',
          location: formatLocation(fav.city_name, fav.region_name),
          area: fav.exclusive_area || 84,  // API에서 받은 전용면적 사용, 없으면 84 기본값
          currentPrice: fav.current_market_price || 0,
          purchasePrice: fav.current_market_price || 0,
          purchaseDate: '-',
          changeRate: fav.index_change_rate || 0,  // 6개월 기준 변동률 사용
          jeonsePrice: 0,
          gapPrice: 0,
          jeonseRatio: 0,
      };
  };

  // 데이터 로드 함수
  // - silent=true: UI 로딩 상태(isLoading) 토글/무거운 계산(지역 비교) 없이 백그라운드 동기화용
  const loadData = useCallback(async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;

      if (!isClerkLoaded || !isSignedIn) {
          if (!silent) setIsLoading(false);
          return;
      }

      if (!silent) setIsLoading(true);
      try {
          // 토큰을 먼저 가져와서 설정 (401 에러 방지)
          const token = await getToken();
          if (token) {
              setAuthToken(token);
          } else {
              // 토큰이 없으면 빈 데이터로 설정
              setAssetGroups([
                  { id: 'my', name: '내 자산', assets: [] },
                  { id: 'favorites', name: '관심 단지', assets: [] },
              ]);
              if (!silent) setIsLoading(false);
              return;
          }
          
          // 🔍 디버깅: 현재 사용자 정보 확인
          if (clerkUser) {
              console.log('👤 현재 로그인한 사용자:', {
                  id: clerkUser.id,
                  email: clerkUser.primaryEmailAddress?.emailAddress,
                  firstName: clerkUser.firstName,
                  lastName: clerkUser.lastName,
                  // Clerk의 사용자 ID와 account_id는 다를 수 있음
              });
          }
          
          // 🔍 디버깅: API 요청 URL 확인
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
          console.log('🌐 API 요청 URL:', `${API_BASE_URL}/my-properties?skip=0&limit=100`);
          
          // 내 자산과 관심 아파트를 병렬로 로드
          const [myPropertiesRes, favoritesRes] = await Promise.all([
              fetchMyProperties().catch((e) => { console.error('내 자산 조회 실패:', e); return { success: false, data: { properties: [] } }; }),
              fetchFavoriteApartments().catch((e) => { console.error('관심 아파트 조회 실패:', e); return { success: false, data: { favorites: [] } }; })
          ]);

          console.log('📦 내 자산 API 응답:', myPropertiesRes);
          console.log('📦 내 자산 API 응답 (전체):', JSON.stringify(myPropertiesRes, null, 2));
          console.log('📦 관심 아파트 API 응답:', favoritesRes);

          const rawMyProperties = myPropertiesRes.success && myPropertiesRes.data.properties 
              ? myPropertiesRes.data.properties
              : [];
          
          console.log('📊 내 자산 원본 데이터:', rawMyProperties);
          console.log('📊 내 자산 원본 데이터 개수:', rawMyProperties.length);
          
          const myProps = rawMyProperties.map(mapMyPropertyToProperty);
          
          const favProps = favoritesRes.success && favoritesRes.data.favorites
              ? favoritesRes.data.favorites.map(mapFavoriteToProperty)
              : [];
          
          console.log('📊 변환된 내 자산:', myProps);
          console.log('📊 변환된 관심 아파트:', favProps);

          // localStorage에서 백업 데이터 로드 (새로고침 대비)
          let backupFavProps: Property[] = [];
          try {
              const backupStr = localStorage.getItem('favorite_apartments_backup');
              if (backupStr) {
                  const backupData = JSON.parse(backupStr);
                  backupFavProps = backupData.map((item: any) => ({
                      id: item.id,
                      aptId: item.aptId,
                      name: item.name,
                      location: item.location,
                      area: item.area,
                      currentPrice: item.currentPrice,
                      purchasePrice: item.purchasePrice,
                      purchaseDate: item.purchaseDate,
                      changeRate: item.changeRate,
                      jeonsePrice: item.jeonsePrice,
                      gapPrice: item.gapPrice,
                      jeonseRatio: item.jeonseRatio,
                  }));
                  console.log('📦 localStorage 백업 데이터 로드:', backupFavProps.length, '개');
              }
          } catch (error) {
              console.error('localStorage 백업 로드 실패:', error);
          }

          // 관심 아파트 병합: API 응답 + localStorage 백업 + 기존 로컬 상태 병합 (중복 제거)
          const existingFavAssets = assetGroups.find(g => g.id === 'favorites')?.assets || [];
          
          // 모든 소스에서 aptId 수집 (중복 제거용)
          const apiAptIds = new Set(favProps.map(p => p.aptId));
          const backupAptIds = new Set(backupFavProps.map(p => p.aptId));
          const existingAptIds = new Set(existingFavAssets.map(a => a.aptId).filter(id => id !== undefined));
          
          // API 응답에 없는 백업 항목 추가
          const backupOnlyFavProps = backupFavProps.filter(p => p.aptId && !apiAptIds.has(p.aptId));
          
          // API 응답에 없는 기존 로컬 항목 유지 (최근 추가된 항목 보호)
          const localOnlyFavProps = existingFavAssets
              .filter(asset => asset.aptId && !apiAptIds.has(asset.aptId) && !backupAptIds.has(asset.aptId))
              .map(asset => ({
                  id: asset.id,
                  aptId: asset.aptId!,
                  name: asset.name,
                  location: asset.location,
                  area: asset.area,
                  currentPrice: asset.currentPrice,
                  purchasePrice: asset.purchasePrice,
                  purchaseDate: asset.purchaseDate,
                  changeRate: asset.changeRate,
                  jeonsePrice: asset.jeonsePrice,
                  gapPrice: asset.gapPrice,
                  jeonseRatio: asset.jeonseRatio,
              }));
          
          // API 응답 + 백업 + 로컬 전용 항목 병합
          const mergedFavProps = [...favProps, ...backupOnlyFavProps, ...localOnlyFavProps];
          console.log('📊 병합된 관심 아파트:', mergedFavProps.length, '개 (API:', favProps.length, '개, 백업:', backupOnlyFavProps.length, '개, 로컬:', localOnlyFavProps.length, '개)');

          const myAssets = mapToDashboardAsset(myProps, 0);
          const favAssets = mapToDashboardAsset(mergedFavProps, 3);

          // localStorage에서 사용자 추가 그룹 복원
          let restoredUserGroups: AssetGroup[] = [];
          try {
              const userGroupsStr = localStorage.getItem('user_asset_groups');
              if (userGroupsStr) {
                  const userGroupsData = JSON.parse(userGroupsStr);
                  restoredUserGroups = userGroupsData.map((g: any) => ({
                      id: g.id,
                      name: g.name,
                      assets: g.assets.map((a: any) => ({
                          ...a,
                          chartData: [], // 초기값은 빈 배열, 실제 데이터 로드 대기
                          color: CHART_COLORS[0] // 기본 색상
                      }))
                  }));
                  console.log('📦 localStorage에서 사용자 그룹 복원:', restoredUserGroups.length, '개');
              }
          } catch (error) {
              console.error('localStorage 사용자 그룹 복원 실패:', error);
          }
          
          // 초기 상태 설정 (차트 데이터는 빈 배열로 시작, 실제 데이터 로드 대기)
          const initialMyAssets = myAssets.map(asset => ({
              ...asset,
              chartData: [] // 실제 데이터 로드 대기
          }));
          const initialFavAssets = favAssets.map(asset => ({
              ...asset,
              chartData: [] // 실제 데이터 로드 대기
          }));
          
          setAssetGroups(prev => {
              // 기존 상태에서 사용자 그룹 가져오기 (새로고침 직후가 아닌 경우)
              const existingUserGroups = prev.filter(g => g.id !== 'my' && g.id !== 'favorites');
              // localStorage에서 복원한 그룹과 병합 (중복 제거)
              const allUserGroups = [...existingUserGroups];
              restoredUserGroups.forEach(restored => {
                  if (!allUserGroups.find(g => g.id === restored.id)) {
                      allUserGroups.push(restored);
                  }
              });
              
              const newGroups = [
                  { id: 'my', name: '내 자산', assets: initialMyAssets },
                  { id: 'favorites', name: '관심 단지', assets: initialFavAssets },
                  ...allUserGroups
              ];
              console.log('🔧 상태 업데이트 후 - favorites 그룹 assets 개수:', newGroups.find(g => g.id === 'favorites')?.assets.length || 0);
              console.log('🔧 상태 업데이트 후 - 사용자 그룹 개수:', allUserGroups.length);
              return newGroups;
          });

          // 실제 차트 데이터를 로드 (목업 데이터 사용 안 함)
          const allAssets = [...myAssets, ...favAssets];
          const loadChartData = async () => {
              try {
                  const updatedAssets = [...allAssets];
                  const batchSize = 3;
                  
                  for (let i = 0; i < allAssets.length; i += batchSize) {
                      const batch = allAssets.slice(i, i + batchSize);
                      const batchResults = await Promise.all(
                          batch.map(async (asset, batchIdx) => {
                              const globalIdx = i + batchIdx;
                              
                              if (!asset.aptId) {
                                  // aptId가 없으면 빈 배열 반환 (목업 데이터 사용 안 함)
                                  console.log(`⚠️ aptId가 없음: ${asset.name}`);
                                  return { index: globalIdx, chartData: [] };
                              }
                              
                              try {
                                  // 백엔드 API 제한: limit 최대 50, months 최대 120
                                  // selectedPeriod에 따라 months 설정
                                  let months = 3; // 기본값
                                  if (selectedPeriod === '1년') {
                                      months = 13; // 시작월 포함 13개월
                                  } else if (selectedPeriod === '3년') {
                                      months = 36;
                                  } else if (selectedPeriod === '전체') {
                                      months = 120; // 최대값 (10년)
                                  }
                                  
                                  console.log(`🔄 차트 데이터 로드 시작: apt_id=${asset.aptId}, name=${asset.name}, period=${selectedPeriod}, months=${months}`);
                                  // 전용면적(평형)별로 가격이 크게 달라질 수 있어, 가능한 경우 area를 넘겨서 해당 자산 평형 기준으로 조회
                                  const transRes = await fetchApartmentTransactions(
                                      asset.aptId,
                                      'sale',
                                      50,
                                      months,
                                      typeof asset.area === 'number' ? asset.area : undefined
                                  );
                                  console.log(`📊 차트 데이터 조회 완료 (apt_id: ${asset.aptId}):`, {
                                      success: transRes.success,
                                      hasData: !!transRes.data,
                                      hasPriceTrend: !!transRes.data?.price_trend,
                                      trendLength: transRes.data?.price_trend?.length || 0,
                                      fullResponse: transRes
                                  });
                                  
                                  if (transRes.success && transRes.data?.price_trend && transRes.data.price_trend.length > 0) {
                                      const chartData = transRes.data.price_trend
                                          .filter((item: any) => item.month && item.avg_price != null) // 유효한 데이터만 필터링
                                          .map((item: any) => ({
                                              time: `${item.month}-01`, // "YYYY-MM-01" 형식으로 변환
                                              value: Math.round(item.avg_price) // 정수로 반올림
                                          }))
                                          .sort((a: any, b: any) => a.time.localeCompare(b.time)); // 시간순 정렬
                                      
                                      // 디버깅: 데이터 형식 확인
                                      if (chartData.length > 0) {
                                          console.log(`✅ [데이터 로딩 성공] apt_id: ${asset.aptId}, 데이터 개수: ${chartData.length}`);
                                          console.log(`📅 [데이터 로딩] 날짜 범위: ${chartData[0].time} ~ ${chartData[chartData.length - 1].time}`);
                                          console.log(`💰 [데이터 로딩] 샘플 데이터:`, chartData.slice(0, 3));
                                      } else {
                                          console.warn(`⚠️ [데이터 로딩] 유효한 데이터 없음: apt_id: ${asset.aptId}`);
                                      }
                                      
                                      return { index: globalIdx, chartData };
                                  } else {
                                      console.warn(`⚠️ [데이터 로딩] 응답에 데이터 없음: apt_id: ${asset.aptId}`, {
                                          success: transRes.success,
                                          hasData: !!transRes.data,
                                          hasPriceTrend: !!transRes.data?.price_trend
                                      });
                                  }
                              } catch (error) {
                                  console.error(`❌ 가격 추이 조회 실패 (apt_id: ${asset.aptId}):`, error);
                                  if (error instanceof Error) {
                                      console.error(`에러 메시지: ${error.message}`);
                                      console.error(`에러 스택: ${error.stack}`);
                                  }
                              }
                              
                              // 실제 데이터를 가져오지 못한 경우 빈 배열 반환 (목업 데이터 사용 안 함)
                              return { index: globalIdx, chartData: [] };
                          })
                      );
                      
                      // 배치 결과 반영
                      batchResults.forEach(result => {
                          updatedAssets[result.index] = { ...updatedAssets[result.index], chartData: result.chartData };
                      });
                      
                      // 상태 업데이트 (UI 반영) - 사용자 추가 그룹 유지
                      setAssetGroups(prev => {
                          const userGroups = prev.filter(g => g.id !== 'my' && g.id !== 'favorites');
                          return [
                              { id: 'my', name: '내 자산', assets: updatedAssets.slice(0, myAssets.length) },
                              { id: 'favorites', name: '관심 단지', assets: updatedAssets.slice(myAssets.length) },
                              ...userGroups
                          ];
                      });
                  }
              } catch (error) {
                  console.error('차트 데이터 로드 중 전체 오류:', error);
              } finally {
                  // 모든 차트 데이터 로드 완료 후 로딩 상태 해제
                  setIsLoading(false);
              }
          };
          
          // 실제 차트 데이터 로드 시작
          loadChartData();
          
          // 지역 대비 수익률 비교 차트는 "현재 리스트 상위 3개" 기준으로 별도 계산 (useEffect)합니다.
          // 여기서 계산하지 않음.
      } catch (error) {
          console.error('데이터 로드 실패:', error);
      } finally {
          if (!silent) setIsLoading(false);
      }
  }, [isClerkLoaded, isSignedIn, getToken, mapToDashboardAsset, selectedPeriod]);

  const startPostAddRefresh = useCallback((createdPropertyId?: number) => {
      // 기존 인터벌이 있으면 정리
      if (postAddRefreshIntervalRef.current !== null) {
          window.clearInterval(postAddRefreshIntervalRef.current);
          postAddRefreshIntervalRef.current = null;
      }

      // DB/캐시 동기화가 완료되어 "목록" API에 나타나는 순간에만 1회 새로고침
      // (캐시 무효화 타이밍 때문에 즉시 loadData를 호출해도 목록이 안 바뀌는 경우가 있음)
      const MAX_TRIES = 10;       // 최대 10회 시도
      const INTERVAL_MS = 200;    // 0.2초 간격 (총 2초)
      let tries = 0;

      postAddRefreshIntervalRef.current = window.setInterval(async () => {
          tries += 1;

          // 동기화가 겹치면 스킵 (폭주 방지)
          if (postAddRefreshInFlightRef.current) return;
          postAddRefreshInFlightRef.current = true;

          try {
              // createdPropertyId가 있으면, 내 자산 목록에 실제로 반영됐는지 확인
              if (typeof createdPropertyId === 'number') {
                  const res = await fetchMyProperties().catch(() => null as any);
                  const found = !!res?.success && Array.isArray(res?.data?.properties)
                      && res.data.properties.some((p: any) => p?.property_id === createdPropertyId);

                  if (!found) {
                      return;
                  }
              }

              // 반영 확인(또는 ID 미제공) 시점에 1회 새로고침
              await loadData({ silent: true }).catch(() => null);

              // 종료
              if (postAddRefreshIntervalRef.current !== null) {
                  window.clearInterval(postAddRefreshIntervalRef.current);
                  postAddRefreshIntervalRef.current = null;
              }
          } finally {
              postAddRefreshInFlightRef.current = false;
              if (tries >= MAX_TRIES && postAddRefreshIntervalRef.current !== null) {
                  window.clearInterval(postAddRefreshIntervalRef.current);
                  postAddRefreshIntervalRef.current = null;
              }
          }
      }, INTERVAL_MS);
  }, [loadData]);

  // 로그인 상태 변경 시 데이터 로드
  useEffect(() => {
      loadData();
  }, [loadData]);

  useEffect(() => {
    const handleScroll = () => { setScrolled(window.scrollY > 40); };
    window.addEventListener('scroll', handleScroll);
    return () => {
        window.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // 모달이 열릴 때 배경 스크롤 고정
  useEffect(() => {
    if (isAddApartmentModalOpen || isMyPropertyModalOpen || isEditMyPropertyModalOpen || isAddGroupModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isAddApartmentModalOpen, isMyPropertyModalOpen, isEditMyPropertyModalOpen, isAddGroupModalOpen]);

  const handleTabChange = (groupId: string) => setActiveGroupId(groupId);
  const handleViewModeChange = (mode: 'separate' | 'combined') => setViewMode(mode);

  const toggleAssetVisibility = (groupId: string, assetId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setAssetGroups(prev => prev.map(group => {
          if (group.id !== groupId) return group;
          return {
              ...group,
              assets: group.assets.map(asset => 
                  asset.id === assetId ? { ...asset, isVisible: !asset.isVisible } : asset
              )
          };
      }));
  };
  
  // Drag and drop handlers
  const handleDragStart = (groupId: string) => {
      setDraggedGroupId(groupId);
  };
  
  const handleDragOver = (e: React.DragEvent, groupId: string) => {
      e.preventDefault();
      if (draggedGroupId && draggedGroupId !== groupId) {
          const draggedIndex = assetGroups.findIndex(g => g.id === draggedGroupId);
          const targetIndex = assetGroups.findIndex(g => g.id === groupId);
          if (draggedIndex !== -1 && targetIndex !== -1) {
              const newGroups = [...assetGroups];
              const [removed] = newGroups.splice(draggedIndex, 1);
              newGroups.splice(targetIndex, 0, removed);
              setAssetGroups(newGroups);
          }
      }
  };
  
  const handleDragEnd = () => {
      setDraggedGroupId(null);
  };
  
  // Group management
  const handleAddGroup = () => {
      if (newGroupName.trim()) {
          const newGroup: AssetGroup = {
              id: `group-${Date.now()}`,
              name: newGroupName.trim(),
              assets: []
          };
          setAssetGroups(prev => {
              const updated = [...prev, newGroup];
              // localStorage에 사용자 추가 그룹 저장
              try {
                  const userGroups = updated.filter(g => g.id !== 'my' && g.id !== 'favorites');
                  localStorage.setItem('user_asset_groups', JSON.stringify(userGroups.map(g => ({
                      id: g.id,
                      name: g.name,
                      assets: g.assets.map(a => ({
                          id: a.id,
                          aptId: a.aptId,
                          name: a.name,
                          location: a.location,
                          area: a.area,
                          currentPrice: a.currentPrice,
                          purchasePrice: a.purchasePrice,
                          purchaseDate: a.purchaseDate,
                          changeRate: a.changeRate,
                          jeonsePrice: a.jeonsePrice,
                          gapPrice: a.gapPrice,
                          jeonseRatio: a.jeonseRatio,
                          isVisible: a.isVisible,
                      }))
                  }))));
              } catch (error) {
                  console.error('localStorage 사용자 그룹 저장 실패:', error);
              }
              return updated;
          });
          setNewGroupName('');
          setIsAddGroupModalOpen(false);
          setActiveGroupId(newGroup.id);
      }
  };
  
  const handleDeleteGroup = (groupId: string) => {
      // 관심 단지/내 자산 기본 그룹은 삭제 불가
      if (groupId === 'favorites' || groupId === 'my') {
          setToast({ message: '기본 그룹은 삭제할 수 없어요.', type: 'error' });
          setTimeout(() => setToast(null), 3000);
          return;
      }
      if (assetGroups.length > 1) {
          setAssetGroups(prev => {
              const updated = prev.filter(g => g.id !== groupId);
              
              // localStorage에 사용자 추가 그룹 저장
              try {
                  const userGroups = updated.filter(g => g.id !== 'my' && g.id !== 'favorites');
                  localStorage.setItem('user_asset_groups', JSON.stringify(userGroups.map(g => ({
                      id: g.id,
                      name: g.name,
                      assets: g.assets.map(a => ({
                          id: a.id,
                          aptId: a.aptId,
                          name: a.name,
                          location: a.location,
                          area: a.area,
                          currentPrice: a.currentPrice,
                          purchasePrice: a.purchasePrice,
                          purchaseDate: a.purchaseDate,
                          changeRate: a.changeRate,
                          jeonsePrice: a.jeonsePrice,
                          gapPrice: a.gapPrice,
                          jeonseRatio: a.jeonseRatio,
                          isVisible: a.isVisible,
                      }))
                  }))));
              } catch (error) {
                  console.error('localStorage 사용자 그룹 저장 실패:', error);
              }
              
              return updated;
          });
          if (activeGroupId === groupId) {
              setActiveGroupId(assetGroups[0].id === groupId ? assetGroups[1].id : assetGroups[0].id);
          }
      }
  };
  
  const handleRenameGroup = (groupId: string) => {
      if (editingGroupName.trim()) {
          setAssetGroups(prev => {
              const updated = prev.map(g => 
                  g.id === groupId ? { ...g, name: editingGroupName.trim() } : g
              );
              
              // localStorage에 사용자 추가 그룹 저장
              try {
                  const userGroups = updated.filter(g => g.id !== 'my' && g.id !== 'favorites');
                  localStorage.setItem('user_asset_groups', JSON.stringify(userGroups.map(g => ({
                      id: g.id,
                      name: g.name,
                      assets: g.assets.map(a => ({
                          id: a.id,
                          aptId: a.aptId,
                          name: a.name,
                          location: a.location,
                          area: a.area,
                          currentPrice: a.currentPrice,
                          purchasePrice: a.purchasePrice,
                          purchaseDate: a.purchaseDate,
                          changeRate: a.changeRate,
                          jeonsePrice: a.jeonsePrice,
                          gapPrice: a.gapPrice,
                          jeonseRatio: a.jeonseRatio,
                          isVisible: a.isVisible,
                      }))
                  }))));
              } catch (error) {
                  console.error('localStorage 사용자 그룹 저장 실패:', error);
              }
              
              return updated;
          });
      }
      setEditingGroupId(null);
      setEditingGroupName('');
  };

  const activeGroup = assetGroups.find(g => g.id === activeGroupId) || assetGroups[0];
  
  // 디버깅: activeGroup 확인
  useEffect(() => {
      if (activeGroupId === 'favorites') {
          console.log('🔍 favorites 그룹 확인 - activeGroupId:', activeGroupId);
          console.log('🔍 favorites 그룹 assets 개수:', activeGroup.assets.length);
          console.log('🔍 favorites 그룹 assets:', activeGroup.assets);
      }
  }, [activeGroupId, activeGroup.assets]);

  const sortedAssets = useMemo(() => {
      console.log('🔍 sortedAssets 계산 - activeGroupId:', activeGroupId, 'activeGroup.assets 개수:', activeGroup.assets.length);
      const assets = [...activeGroup.assets];
      const [key, dir] = sortOption.split('-');

      return assets.sort((a, b) => {
          let valA: any = a[key as keyof DashboardAsset];
          let valB: any = b[key as keyof DashboardAsset];
          if (valA === undefined) valA = 0;
          if (valB === undefined) valB = 0;
          if (typeof valA === 'string') return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
          return dir === 'asc' ? valA - valB : valB - valA;
      });
  }, [activeGroup.assets, sortOption]);

  // 지역 대비 수익률 비교(우측 하단 차트) 기준:
  // 현재 리스트(정렬/필터 적용 후)의 "상위 3개"를 대상으로,
  // 내 단지 1년 상승률(거래 데이터) vs 행정구역 평균 상승률(통계) 계산
  const refreshRegionComparison = useCallback(() => {
      const top3 = sortedAssets.slice(0, 3).filter(a => !!a.aptId);
      if (top3.length === 0) {
          setRegionComparisonData([]);
          setIsRegionComparisonLoading(false);
          return;
      }

      const runId = ++regionComparisonRunIdRef.current;
      regionComparisonInFlightRef.current = true;
      setIsRegionComparisonLoading(true);

      (async () => {
          const results = await Promise.all(top3.map(async (asset) => {
              const aptId = asset.aptId!;
              const aptDisplayName = (asset.name ?? '').trim() || '이름 없음';
              let myPropertyRate = 0;
              let regionAverageRate = 0;

              try {
                  const transRes = await fetchApartmentTransactions(
                      aptId,
                      'sale',
                      50,
                      12,
                      typeof asset.area === 'number' ? asset.area : undefined
                  );
                  if (transRes.success && transRes.data?.price_trend?.length) {
                      const trend = transRes.data.price_trend;
                      const oneYearAgoPrice = trend[0]?.avg_price;
                      const currentPrice = trend[trend.length - 1]?.avg_price;
                      if (oneYearAgoPrice && currentPrice && oneYearAgoPrice > 0) {
                          myPropertyRate = ((currentPrice - oneYearAgoPrice) / oneYearAgoPrice) * 100;
                      }
                  }
              } catch {
                  // ignore
              }

              let regionName = aptDisplayName.length > 10 ? aptDisplayName.substring(0, 10) + '...' : aptDisplayName;
              try {
                  const aptDetailRes = await fetchApartmentDetail(aptId);
                  const regionId = aptDetailRes?.success ? aptDetailRes.data?.region_id : null;
                  if (regionId) {
                      const regionStatsRes = await fetchRegionStats(regionId, 'sale', 12);
                      if (regionStatsRes?.success && regionStatsRes.data?.change_rate !== undefined) {
                          regionAverageRate = regionStatsRes.data.change_rate;
                      }
                  }
                  // 정확한 시군구(동) 정보 가져오기
                  if (aptDetailRes?.success && aptDetailRes.data) {
                      const cityName = aptDetailRes.data.city_name || '';
                      const regionNamePart = aptDetailRes.data.region_name || '';
                      if (cityName && regionNamePart) {
                          regionName = `${cityName} ${regionNamePart}`;
                      } else if (cityName) {
                          regionName = cityName;
                      } else if (regionNamePart) {
                          regionName = regionNamePart;
                      }
                  }
              } catch {
                  // ignore
              }

              return {
                  region: regionName,
                  myProperty: Math.round(myPropertyRate * 100) / 100,
                  regionAverage: Math.round(regionAverageRate * 100) / 100,
                  aptName: aptDisplayName === '이름 없음' ? regionName : aptDisplayName,
              } as ComparisonData;
          }));

          // 최신 실행만 반영
          if (regionComparisonRunIdRef.current !== runId) return;
          setRegionComparisonData(results);
      })()
          .finally(() => {
              if (regionComparisonRunIdRef.current === runId) {
                  setIsRegionComparisonLoading(false);
                  regionComparisonInFlightRef.current = false;
              }
          });
  }, [sortedAssets]);

  useEffect(() => {
      refreshRegionComparison();
  }, [activeGroupId, refreshRegionComparison]);

  // Filter data by period - 고정 날짜 기준
  const filterDataByPeriod = (data: { time: string; value: number }[]) => {
      if (!data || data.length === 0) return data;
      
      // 현재 날짜를 기준으로 endDate 설정 (미래 날짜 방지)
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      
      let startDate: Date;
      let endDate: Date;
      
      switch (selectedPeriod) {
          case '1년':
              // 현재 날짜에서 1년 전
              startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 0, 0, 0, 0);
              // 현재 날짜의 마지막 시각으로 설정 (오늘까지 포함)
              endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
              break;
          case '3년':
              // 현재 날짜에서 3년 전
              startDate = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate(), 0, 0, 0, 0);
              // 현재 날짜의 마지막 시각으로 설정
              endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
              break;
          case '전체':
              // 현재 날짜에서 10년 전으로 설정 (충분히 과거 데이터 포함)
              startDate = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate(), 0, 0, 0, 0);
              // 현재 날짜의 마지막 시각으로 설정
              endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
              break;
          default:
              return data;
      }
      
      // 날짜 파싱 헬퍼 함수 (다양한 형식 지원)
      const parseDate = (timeStr: string): Date => {
          // "2024-01-01" 형식
          if (timeStr.includes('-') && timeStr.length >= 10) {
              return new Date(timeStr);
          }
          // "2024-01" 형식 (월만 있는 경우) - 해당 월의 마지막 날로 설정하여 해당 월의 모든 데이터 포함
          if (timeStr.includes('-') && timeStr.length === 7) {
              const [year, month] = timeStr.split('-').map(Number);
              // 해당 월의 마지막 날짜 계산
              const lastDay = new Date(year, month, 0).getDate();
              return new Date(year, month - 1, lastDay, 23, 59, 59, 999);
          }
          // 기본 파싱
          return new Date(timeStr);
      };
      
      // 디버깅: 필터링 전 데이터 확인
      if (data.length > 0 && selectedPeriod === '1년') {
          console.log(`[필터링] ${selectedPeriod} - 원본 데이터 개수:`, data.length);
          console.log(`[필터링] 날짜 범위: ${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`);
          console.log(`[필터링] 샘플 데이터:`, data.slice(0, 5).map(d => ({ time: d.time, value: d.value })));
      }
      
      // 시작 날짜와 종료 날짜 사이의 데이터만 필터링하고 시간순 정렬
      const filtered = data.filter(d => {
          try {
              const date = parseDate(d.time);
              // 유효한 날짜인지 확인
              if (isNaN(date.getTime())) {
                  if (selectedPeriod === '1년') {
                      console.warn(`[필터링] 유효하지 않은 날짜:`, d.time);
                  }
                  return false;
              }
              // 날짜 비교 (시간 부분 무시하고 날짜만 비교)
              const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
              const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
              const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
              
              const inRange = dateOnly >= startDateOnly && dateOnly <= endDateOnly;
              if (selectedPeriod === '1년' && !inRange) {
                  console.log(`[필터링] 제외된 데이터:`, d.time, `(${date.toISOString().split('T')[0]})`, `범위: ${startDateOnly.toISOString().split('T')[0]} ~ ${endDateOnly.toISOString().split('T')[0]}`);
              }
              return inRange;
          } catch (e) {
              if (selectedPeriod === '1년') {
                  console.warn(`[필터링] 날짜 파싱 오류:`, d.time, e);
              }
              return false;
          }
      }).sort((a, b) => {
          try {
              return parseDate(a.time).getTime() - parseDate(b.time).getTime();
          } catch {
              return 0;
          }
      });
      
      // 디버깅: 필터링 후 데이터 확인
      if (data.length > 0 && selectedPeriod === '1년') {
          console.log(`[필터링] 필터링 후 데이터 개수:`, filtered.length);
          if (filtered.length > 0) {
              console.log(`[필터링] 필터링된 데이터 샘플:`, filtered.slice(0, 5).map(d => ({ time: d.time, value: d.value })));
          } else {
              console.warn(`[필터링] ⚠️ 필터링 후 데이터가 없습니다!`);
          }
      }
      
      // 데이터가 충분하지 않으면 빈 배열 반환 (차트가 끊기지 않도록)
      if (filtered.length < 2) {
          return [];
      }
      
      return filtered;
  };

  const calculateAverageData = (assets: DashboardAsset[]) => {
      if (assets.length === 0) return [];
      const length = assets[0].chartData.length;
      const avgData = [];
      for (let i = 0; i < length; i++) {
          let sum = 0;
          let count = 0;
          const time = assets[0].chartData[i]?.time;
          if (!time) continue;
          assets.forEach(asset => {
              if (asset.chartData[i]) { sum += asset.chartData[i].value; count++; }
          });
          if (count > 0) { avgData.push({ time, value: Math.floor(sum / count) }); }
      }
      return avgData;
  };

  const { totalValue, totalProfit, totalProfitRate } = useMemo(() => {
      const visibleAssets = activeGroup.assets.filter(a => a.isVisible);
      const currentSum = visibleAssets.reduce((sum, a) => sum + a.currentPrice, 0);
      const purchaseSum = visibleAssets.reduce((sum, a) => sum + a.purchasePrice, 0);
      const profit = currentSum - purchaseSum;
      const profitRate = purchaseSum > 0 ? (profit / purchaseSum) * 100 : 0;
      return { totalValue: currentSum, totalProfit: profit, totalProfitRate: profitRate };
  }, [activeGroup]);

  // Period comparison calculation - 선택된 아파트 또는 전체
  const periodComparison = useMemo(() => {
      let targetAssets = activeGroup.assets.filter(a => a.isVisible);
      
      // 특정 아파트가 선택된 경우 해당 아파트만 계산
      if (selectedAssetId) {
          const selectedAsset = activeGroup.assets.find(a => a.id === selectedAssetId);
          if (selectedAsset) {
              targetAssets = [selectedAsset];
          }
      }
      
      if (targetAssets.length === 0) return { amount: 0, rate: 0 };
      
      const avgData = calculateAverageData(targetAssets);
      const filteredData = filterDataByPeriod(avgData);
      
      if (filteredData.length < 2) return { amount: 0, rate: 0 };
      
      const startValue = filteredData[0].value;
      const endValue = filteredData[filteredData.length - 1].value;
      const diff = endValue - startValue;
      const rate = startValue > 0 ? (diff / startValue) * 100 : 0;
      
      return { amount: diff, rate };
  }, [activeGroup, selectedPeriod, selectedAssetId]);

  // 최근 데이터 날짜 계산
  const latestDataDate = useMemo(() => {
      const visibleAssets = activeGroup.assets.filter(a => a.isVisible);
      if (visibleAssets.length === 0) return null;
      
      let latestDate: Date | null = null;
      visibleAssets.forEach(asset => {
          if (asset.chartData && asset.chartData.length > 0) {
              const sortedData = [...asset.chartData].sort((a, b) => 
                  new Date(b.time).getTime() - new Date(a.time).getTime()
              );
              const assetLatest = new Date(sortedData[0].time);
              if (!latestDate || assetLatest > latestDate) {
                  latestDate = assetLatest;
              }
          }
      });
      
      return '최근 기준';
  }, [activeGroup]);

  const chartSeries: ChartSeriesData[] = useMemo(() => {
      let visibleAssets = activeGroup.assets.filter(asset => asset.isVisible);
      
      // 특정 아파트가 선택된 경우 해당 아파트만 표시
      if (selectedAssetId) {
          const selectedAsset = activeGroup.assets.find(a => a.id === selectedAssetId);
          if (selectedAsset) {
              visibleAssets = [selectedAsset];
          }
      }
      
      if (visibleAssets.length === 0) return [];

      // 차트 데이터가 있는 자산만 필터링
      const assetsWithData = visibleAssets.filter(asset => asset.chartData && asset.chartData.length > 0);
      
      if (assetsWithData.length === 0) {
          // 차트 데이터가 없으면 빈 배열 반환 (로딩 중이거나 데이터 없음)
          return [];
      }

      if (viewMode === 'combined') {
          // 모아보기: 모든 자산의 가격을 합산한 단일 그래프
          const allDates = new Set<string>();
          assetsWithData.forEach(asset => {
              asset.chartData.forEach(d => allDates.add(d.time));
          });
          
          const sortedDates = Array.from(allDates).sort();
          const combinedData = sortedDates.map(date => {
              let totalValue = 0;
              assetsWithData.forEach(asset => {
                  // 해당 날짜의 데이터가 있으면 사용, 없으면 가장 가까운 이전 데이터 사용
                  const dataPoint = asset.chartData.find(d => d.time === date);
                  if (dataPoint) {
                      totalValue += dataPoint.value;
                  } else {
                      // 가장 가까운 이전 데이터 찾기
                      const prevData = asset.chartData
                          .filter(d => d.time <= date)
                          .sort((a, b) => b.time.localeCompare(a.time))[0];
                      if (prevData) {
                          totalValue += prevData.value;
                      }
                  }
              });
              return { time: date, value: totalValue };
          });
          
          return [{
              name: '총 자산',
              data: filterDataByPeriod(combinedData),
              color: '#3182F6',
              visible: true
          }];
      } else {
          // 개별보기: 각 자산별 그래프 (이름 포함) - 데이터가 있는 것만
          return assetsWithData.map(asset => {
              const filteredData = filterDataByPeriod(asset.chartData);
              
              // 디버깅: 각 아파트별 데이터 확인
              if (selectedPeriod === '1년') {
                  console.log(`[차트 시리즈] ${asset.name}:`, {
                      원본데이터개수: asset.chartData.length,
                      필터링후개수: filteredData.length,
                      원본날짜범위: asset.chartData.length > 0 
                          ? `${asset.chartData[0].time} ~ ${asset.chartData[asset.chartData.length - 1].time}`
                          : '없음',
                      필터링후날짜범위: filteredData.length > 0
                          ? `${filteredData[0].time} ~ ${filteredData[filteredData.length - 1].time}`
                          : '없음',
                      필터링후데이터: filteredData.slice(0, 10).map(d => ({ time: d.time, value: d.value }))
                  });
              }
              
              // 데이터가 충분하지 않으면 (2개 미만) 빈 배열 반환하여 차트에서 제외
              if (filteredData.length < 2) {
                  console.warn(`[차트 시리즈] ${asset.name}: 데이터가 부족하여 차트에서 제외됨 (${filteredData.length}개)`);
                  return {
                      name: asset.name,
                      data: [],
                      color: asset.color,
                      visible: false
                  };
              }
              
              return {
                  name: asset.name,
                  data: filteredData,
                  color: asset.color,
                  visible: true
              };
          }).filter(series => series.visible && series.data.length > 0); // 빈 데이터 시리즈 제거
      }
  }, [activeGroup, viewMode, selectedPeriod, selectedAssetId]);

  // 아파트 검색 함수
  const handleApartmentSearch = useCallback(async (query: string) => {
      if (!query.trim()) {
          setSearchResults([]);
          return;
      }
      
      setIsSearching(true);
      try {
          const response = await searchApartments(query.trim(), 10);
          if (response.success && response.data.results) {
              // 가격 정보 가져오기
              const aptIds = response.data.results
                  .map(r => r.apt_id)
                  .filter((id): id is number => typeof id === 'number');
              
              let priceMap = new Map<number, number>();
              
              if (aptIds.length > 0) {
                  try {
                      const compareRes = await fetchCompareApartments(aptIds.slice(0, 5));
                      if (compareRes.apartments) {
                          compareRes.apartments.forEach(apt => {
                              if (apt.price) priceMap.set(apt.id, apt.price);
                          });
                      }
                  } catch {
                      // 가격 정보 없어도 진행
                  }
              }
              
              setSearchResults(response.data.results
                  .filter((r): r is ApartmentSearchItem & { apt_id: number } => {
                      return typeof r.apt_id === 'number';
                  })
                  .map(r => ({
                      apt_id: r.apt_id,
                      apt_name: r.apt_name,
                      address: r.address || undefined,
                      price: priceMap.get(r.apt_id)
                  })));
          }
      } catch (error) {
          console.error('아파트 검색 실패:', error);
          setSearchResults([]);
      } finally {
          setIsSearching(false);
      }
  }, []);

  // 검색어 변경 시 디바운스 검색
  useEffect(() => {
      const timer = setTimeout(() => {
          handleApartmentSearch(apartmentSearchQuery);
      }, 300);
      return () => clearTimeout(timer);
  }, [apartmentSearchQuery, handleApartmentSearch]);

  // 아파트 추가 핸들러 (내 자산, 관심 단지, 또는 사용자 추가 그룹에 추가)
  const handleAddApartment = async (aptId: number, aptName: string, address?: string) => {
      if (!isSignedIn) {
          openSignIn();
          return;
      }
      
      try {
          if (activeGroupId === 'my') {
              // 내 자산에 추가 - 상세 모달 열기
              setSelectedApartmentForAdd({ apt_id: aptId, apt_name: aptName });
              setIsAddApartmentModalOpen(false);
              setIsMyPropertyModalOpen(true);
              
              // 아파트 상세 정보 및 전용면적 목록 로드
              try {
                  const [detailRes, areasRes] = await Promise.all([
                      fetchApartmentDetail(aptId).catch(() => null),
                      fetchApartmentExclusiveAreas(aptId).catch(() => null)
                  ]);
                  
                  if (detailRes?.success) {
                      setApartmentDetail({ apt_name: detailRes.data.apt_name });
                  }
                  
                  if (areasRes?.success && areasRes.data.exclusive_areas.length > 0) {
                      setExclusiveAreaOptions(areasRes.data.exclusive_areas);
                      setMyPropertyForm(prev => ({
                          ...prev,
                          exclusive_area: areasRes.data.exclusive_areas[0],
                          nickname: aptName
                      }));
                  } else {
                      setExclusiveAreaOptions([59, 84, 102, 114]);
                      setMyPropertyForm(prev => ({
                          ...prev,
                          exclusive_area: 84,
                          nickname: aptName
                      }));
                  }
              } catch (error) {
                  console.error('아파트 정보 로드 실패:', error);
                  setExclusiveAreaOptions([59, 84, 102, 114]);
                  setMyPropertyForm(prev => ({
                      ...prev,
                      exclusive_area: 84,
                      nickname: aptName
                  }));
              }
          } else if (activeGroupId === 'favorites') {
              // 관심 단지에 추가 - API 호출
              const token = await getToken();
              if (token) setAuthToken(token);
              
              try {
                  const response = await addFavoriteApartment({
                      apt_id: aptId,
                      nickname: aptName,
                  });
                  
                  if (response.success && response.data) {
                      // API 응답 데이터를 즉시 로컬 상태에 추가
                      const newFavorite: FavoriteApartment = {
                          favorite_id: response.data.favorite_id,
                          account_id: response.data.account_id,
                          apt_id: response.data.apt_id,
                          nickname: response.data.nickname || undefined,
                          memo: response.data.memo || undefined,
                          apt_name: response.data.apt_name || aptName,
                          kapt_code: response.data.kapt_code || undefined,
                          region_name: response.data.region_name || undefined,
                          city_name: response.data.city_name || undefined,
                          current_market_price: undefined, // 나중에 loadData()에서 업데이트
                          exclusive_area: undefined, // 나중에 loadData()에서 업데이트
                          index_change_rate: undefined, // 나중에 loadData()에서 업데이트
                      };
                      
                      // 즉시 로컬 상태에 추가
                      const newProperty = mapFavoriteToProperty(newFavorite);
                      const currentFavAssets = assetGroups.find(g => g.id === 'favorites')?.assets || [];
                      const newAsset = mapToDashboardAsset([newProperty], currentFavAssets.length)[0];
                      
                      // 차트 데이터는 빈 배열로 시작, 실제 데이터 로드 대기
                      const assetWithChart: DashboardAsset = {
                          ...newAsset,
                          chartData: [] // 실제 데이터 로드 대기
                      };
                      
                      // 백그라운드에서 실제 차트 데이터 로드 (selectedPeriod에 따라)
                      if (newAsset.aptId) {
                          let months = 3; // 기본값
                          if (selectedPeriod === '1년') {
                              months = 13; // 시작월 포함 13개월
                          } else if (selectedPeriod === '3년') {
                              months = 36;
                          } else if (selectedPeriod === '전체') {
                              months = 120; // 최대값 (10년)
                          }
                          fetchApartmentTransactions(
                              newAsset.aptId,
                              'sale',
                              50,
                              months,
                              typeof newAsset.area === 'number' ? newAsset.area : undefined
                          )
                              .then(transRes => {
                                  if (transRes.success && transRes.data.price_trend && transRes.data.price_trend.length > 0) {
                                      const chartData = transRes.data.price_trend.map((item: any) => ({
                                          time: `${item.month}-01`,
                                          value: item.avg_price
                                      }));
                                      
                                      // 상태 업데이트
                                      setAssetGroups(prev => prev.map(group => {
                                          if (group.id === 'favorites') {
                                              return {
                                                  ...group,
                                                  assets: group.assets.map(asset => 
                                                      asset.id === newAsset.id 
                                                          ? { ...asset, chartData }
                                                          : asset
                                                  )
                                              };
                                          }
                                          return group;
                                      }));
                                  }
                              })
                              .catch(error => {
                                  console.error('차트 데이터 로드 실패:', error);
                              });
                      }
                      
                      setAssetGroups(prev => {
                          const updated = prev.map(group => {
                              if (group.id === 'favorites') {
                                  return {
                                      ...group,
                                      assets: [...group.assets, assetWithChart]
                                  };
                              }
                              return group;
                          });
                          
                          // localStorage에 백업 저장 (새로고침 대비)
                          try {
                              const favGroup = updated.find(g => g.id === 'favorites');
                              if (favGroup) {
                                  const backupData = favGroup.assets.map(asset => ({
                                      id: asset.id,
                                      aptId: asset.aptId,
                                      name: asset.name,
                                      location: asset.location,
                                      area: asset.area,
                                      currentPrice: asset.currentPrice,
                                      purchasePrice: asset.purchasePrice,
                                      purchaseDate: asset.purchaseDate,
                                      changeRate: asset.changeRate,
                                      jeonsePrice: asset.jeonsePrice,
                                      gapPrice: asset.gapPrice,
                                      jeonseRatio: asset.jeonseRatio,
                                  }));
                                  localStorage.setItem('favorite_apartments_backup', JSON.stringify(backupData));
                              }
                          } catch (error) {
                              console.error('localStorage 백업 저장 실패:', error);
                          }
                          
                          return updated;
                      });
                      
                      // 모달 닫기
                      setIsAddApartmentModalOpen(false);
                      setApartmentSearchQuery('');
                      setSearchResults([]);
                      
                      // 성공 토스트 표시
                      setToast({ message: '관심 단지에 추가되었습니다', type: 'success' });
                      setTimeout(() => setToast(null), 3000);
                      
                      // 백그라운드에서 최신 데이터로 동기화 (에러는 조용히 처리)
                      // 약간의 지연을 두어 상태 업데이트가 완료된 후 호출
                      setTimeout(() => {
                          loadData({ silent: true }).catch(error => {
                              console.error('백그라운드 데이터 동기화 실패:', error);
                          });
                      }, 500);
                  } else {
                      throw new Error('관심 아파트 추가에 실패했습니다.');
                  }
              } catch (error: any) {
                  console.error('관심 아파트 추가 실패:', error);
                  const errorMessage = error?.message || '관심 아파트 추가에 실패했습니다. 다시 시도해 주세요.';
                  setToast({ message: errorMessage, type: 'error' });
                  setTimeout(() => setToast(null), 3000);
              }
          } else {
              // 사용자 추가 그룹에 추가 - 로컬 상태에만 추가
              const newAsset: DashboardAsset = {
                  id: `local-${Date.now()}`,
                  aptId: aptId,
                  name: aptName,
                  location: address || '위치 정보 없음',
                  area: 84,
                  currentPrice: 0,
                  purchasePrice: 0,
                  purchaseDate: '-',
                  changeRate: 0,
                  jeonsePrice: 0,
                  gapPrice: 0,
                  jeonseRatio: 0,
                  isVisible: true,
                  chartData: [], // 실제 데이터 로드 대기
                  color: CHART_COLORS[activeGroup.assets.length % CHART_COLORS.length]
              };
              
              // 가격 정보 가져오기 시도
              try {
                  const compareRes = await fetchCompareApartments([aptId]);
                  if (compareRes.apartments && compareRes.apartments.length > 0) {
                      const aptData = compareRes.apartments[0];
                      if (aptData.price) {
                          // API에서 억 단위로 오므로 만원 단위로 변환 (5.8억 -> 58000만원)
                          const priceInMan = Math.round(aptData.price * 10000);
                          newAsset.currentPrice = priceInMan;
                          newAsset.purchasePrice = priceInMan;
                      }
                      if (aptData.address) {
                          newAsset.location = aptData.address;
                      }
                  }
              } catch {
                  // 가격 정보 없어도 진행
              }
              
              // 백그라운드에서 실제 차트 데이터 로드 (selectedPeriod에 따라)
              if (aptId) {
                  let months = 3; // 기본값
                  if (selectedPeriod === '1년') {
                      months = 13; // 시작월 포함 13개월
                  } else if (selectedPeriod === '3년') {
                      months = 36;
                  } else if (selectedPeriod === '전체') {
                      months = 120; // 최대값 (10년)
                  }
                  fetchApartmentTransactions(
                      aptId,
                      'sale',
                      50,
                      months,
                      typeof newAsset.area === 'number' ? newAsset.area : undefined
                  )
                      .then(transRes => {
                          if (transRes.success && transRes.data.price_trend && transRes.data.price_trend.length > 0) {
                              const chartData = transRes.data.price_trend.map((item: any) => ({
                                  time: `${item.month}-01`,
                                  value: item.avg_price
                              }));
                              
                              // 상태 업데이트
                              setAssetGroups(prev => prev.map(group => {
                                  if (group.id === activeGroupId) {
                                      return {
                                          ...group,
                                          assets: group.assets.map(asset => 
                                              asset.id === newAsset.id 
                                                  ? { ...asset, chartData }
                                                  : asset
                                          )
                                      };
                                  }
                                  return group;
                              }));
                          }
                      })
                      .catch(error => {
                          console.error('차트 데이터 로드 실패:', error);
                      });
              }
              
              // 해당 그룹에 아파트 추가
              setAssetGroups(prev => {
                  const updated = prev.map(group => {
                      if (group.id === activeGroupId) {
                          return {
                              ...group,
                              assets: [...group.assets, newAsset]
                          };
                      }
                      return group;
                  });
                  
                  // localStorage에 사용자 추가 그룹 저장
                  try {
                      const userGroups = updated.filter(g => g.id !== 'my' && g.id !== 'favorites');
                      localStorage.setItem('user_asset_groups', JSON.stringify(userGroups.map(g => ({
                          id: g.id,
                          name: g.name,
                          assets: g.assets.map(a => ({
                              id: a.id,
                              aptId: a.aptId,
                              name: a.name,
                              location: a.location,
                              area: a.area,
                              currentPrice: a.currentPrice,
                              purchasePrice: a.purchasePrice,
                              purchaseDate: a.purchaseDate,
                              changeRate: a.changeRate,
                              jeonsePrice: a.jeonsePrice,
                              gapPrice: a.gapPrice,
                              jeonseRatio: a.jeonseRatio,
                              isVisible: a.isVisible,
                          }))
                      }))));
                  } catch (error) {
                      console.error('localStorage 사용자 그룹 저장 실패:', error);
                  }
                  
                  return updated;
              });
              
              setIsAddApartmentModalOpen(false);
              setApartmentSearchQuery('');
              setSearchResults([]);
          }
      } catch (error) {
          console.error('아파트 추가 실패:', error);
          setToast({ message: '아파트 추가에 실패했습니다. 다시 시도해 주세요.', type: 'error' });
          setTimeout(() => setToast(null), 3000);
      }
  };
  
  // 내 자산 추가 제출 (PropertyDetail과 동일)
  const handleMyPropertySubmit = async () => {
      if (!isSignedIn || !selectedApartmentForAdd) {
          if (!isSignedIn) {
              openSignIn();
          } else {
              setToast({ message: '아파트를 선택해주세요.', type: 'error' });
              setTimeout(() => setToast(null), 3000);
          }
          return;
      }

      // 필수 입력값 검증
      if (!myPropertyForm.purchase_price || String(myPropertyForm.purchase_price).trim() === '') {
          setToast({ message: '구매가격(만원)은 필수 입력입니다.', type: 'error' });
          setTimeout(() => setToast(null), 3000);
          return;
      }
      if (!myPropertyForm.purchase_date || String(myPropertyForm.purchase_date).trim() === '') {
          setToast({ message: '매입일은 필수 입력입니다.', type: 'error' });
          setTimeout(() => setToast(null), 3000);
          return;
      }
      
      setIsSubmitting(true);
      try {
          const token = await getToken();
          if (token) setAuthToken(token);
          
          const data = {
              apt_id: selectedApartmentForAdd.apt_id,
              nickname: myPropertyForm.nickname || selectedApartmentForAdd.apt_name,
              exclusive_area: myPropertyForm.exclusive_area,
              purchase_price: myPropertyForm.purchase_price ? Number(myPropertyForm.purchase_price) : undefined,
              // 현재 시세는 입력받지 않으므로 서버에서 계산/보강되도록 비워둔다
              // (기존 로직은 구매가를 current_market_price로 넣어서 "구매가가 시세로 보이는" 버그가 발생)
              current_market_price: undefined,
              purchase_date: myPropertyForm.purchase_date || undefined,
              memo: myPropertyForm.memo || undefined
          };
          
          console.log('내 자산 추가 요청 데이터:', data);
          console.log('인증 토큰 존재:', !!token);
          
          const response = await createMyProperty(data);
          console.log('내 자산 추가 응답:', response);
          if (response.success) {
              // 즉시 UI에 반영 (loadData는 무거워서 바로 기다리면 리스트 갱신이 늦어짐)
              try {
                  const rawCity = (response as any)?.data?.city_name as string | undefined;
                  const rawRegion = (response as any)?.data?.region_name as string | undefined;
                  const normalizeCity = (city?: string | null) => {
                      if (!city) return '';
                      return city
                          .replace('세종특별자치시', '세종')
                          .replace('제주특별자치도', '제주도')
                          .replace('강원특별자치도', '강원도')
                          .replace('특별시', '')
                          .replace('광역시', '')
                          .replace('특별자치시', '');
                  };

                  const formattedLocation = `${normalizeCity(rawCity)} ${rawRegion || ''}`.trim() || '위치 정보 없음';
                  const purchasePriceNum = myPropertyForm.purchase_price ? Number(myPropertyForm.purchase_price) : 0;
                  // 즉시 UI 반영 시 현재 시세는 compare로 보강 (실패하면 0으로 두고 loadData에서 갱신)
                  let currentPriceNum = 0;
                  try {
                      const compareRes = await fetchCompareApartments([selectedApartmentForAdd.apt_id]);
                      const aptData = compareRes?.apartments?.[0];
                      if (aptData?.price != null) {
                          // compare는 억 단위(float) → Dashboard는 만원 단위(int)
                          currentPriceNum = Math.round(Number(aptData.price) * 10000);
                      }
                  } catch {
                      // ignore
                  }

                  const newAsset: DashboardAsset = {
                      id: String((response as any)?.data?.property_id ?? `local-${Date.now()}`),
                      aptId: selectedApartmentForAdd.apt_id,
                      name: myPropertyForm.nickname || selectedApartmentForAdd.apt_name,
                      location: formattedLocation,
                      area: myPropertyForm.exclusive_area || 84,
                      currentPrice: currentPriceNum,
                      purchasePrice: purchasePriceNum,
                      purchaseDate: myPropertyForm.purchase_date || '-',
                      changeRate: 0,
                      jeonsePrice: 0,
                      gapPrice: 0,
                      jeonseRatio: 0,
                      isVisible: true,
                      chartData: [],
                      color: CHART_COLORS[(assetGroups.find(g => g.id === 'my')?.assets.length || 0) % CHART_COLORS.length],
                  };

                  setAssetGroups(prev => prev.map(g => {
                      if (g.id !== 'my') return g;
                      // 중복 방지 (같은 property_id가 이미 있으면 추가하지 않음)
                      if (g.assets.some(a => a.id === newAsset.id)) return g;
                      return { ...g, assets: [...g.assets, newAsset] };
                  }));

                  // 필터가 걸려 있으면 새 자산이 안 보일 수 있어 초기화
                  // (온보딩 직후 첫 진입에서 기본 탭이 'favorites'로 설정되는 것을 방해하지 않도록 조건부)
                  // 기존 로직은 항상 'my'로 바꿔버려서, 온보딩에서 'favorites' 기본 탭을 설정한 직후에도 덮어쓸 수 있음
                  // 'my' 탭이 이미 선택된 경우에만 유지하고, 그 외에는 현재 선택을 보존
                  setActiveGroupId((prev) => (prev === 'my' ? 'my' : prev));
                  setSelectedAssetId(null);

                  // 상단 차트가 "데이터 없음"으로 남지 않도록, 새 자산의 차트 데이터를 백그라운드에서 바로 로드
                  if (newAsset.aptId) {
                      let months = 3;
                      if (selectedPeriod === '1년') months = 13;
                      else if (selectedPeriod === '3년') months = 36;
                      else if (selectedPeriod === '전체') months = 120;

                      fetchApartmentTransactions(
                          newAsset.aptId,
                          'sale',
                          50,
                          months,
                          typeof newAsset.area === 'number' ? newAsset.area : undefined
                      )
                          .then(transRes => {
                              if (transRes.success && transRes.data?.price_trend?.length) {
                                  const chartData = transRes.data.price_trend
                                      .filter((item: any) => item.month && item.avg_price != null)
                                      .map((item: any) => ({ time: `${item.month}-01`, value: Math.round(item.avg_price) }))
                                      .sort((a: any, b: any) => a.time.localeCompare(b.time));

                                  setAssetGroups(prev => prev.map(g => {
                                      if (g.id !== 'my') return g;
                                      return {
                                          ...g,
                                          assets: g.assets.map(a => a.id === newAsset.id ? { ...a, chartData } : a),
                                      };
                                  }));
                              }
                          })
                          .catch(() => null);
                  }
              } catch (e) {
                  // 즉시 반영 실패해도 저장 자체는 성공했으므로 무시
              }

              setIsMyPropertyModalOpen(false);
              setSelectedApartmentForAdd(null);
              setMyPropertyForm({
                  nickname: '',
                  exclusive_area: 84,
                  purchase_price: '',
                  purchase_date: '',
                  memo: ''
              });
              setToast({ message: '아파트가 추가되었습니다', type: 'success' });
              setTimeout(() => setToast(null), 3000);
              // 백그라운드에서 최신 데이터로 동기화 (UI 로딩 깜빡임 없이)
              // 캐시 무효화/DB 반영 타이밍을 기다렸다가 "목록에 나타나는 순간" 1회 새로고침
              startPostAddRefresh(Number((response as any)?.data?.property_id));
          }
      } catch (error: any) {
          console.error('내 자산 추가 실패:', error);
          console.error('에러 상세:', {
            message: error?.message,
            status: error?.status,
            details: error?.details,
            data: {
              apt_id: selectedApartmentForAdd?.apt_id,
              nickname: myPropertyForm.nickname || selectedApartmentForAdd?.apt_name,
              exclusive_area: myPropertyForm.exclusive_area,
              purchase_price: myPropertyForm.purchase_price,
              purchase_date: myPropertyForm.purchase_date,
              memo: myPropertyForm.memo
            }
          });
          const errorMessage = error?.message || error?.details?.detail || '처리 중 오류가 발생했습니다.';
          alert(errorMessage);
      } finally {
          setIsSubmitting(false);
      }
  };

  // 아파트 삭제 핸들러 - 즉시 UI 갱신 후 백그라운드에서 API 호출
  const handleRemoveAsset = async (groupId: string, assetId: string) => {
      const group = assetGroups.find(g => g.id === groupId);
      const asset = group?.assets.find(a => a.id === assetId);
      const aptIdFromAsset = (asset as any)?.aptId;
      
      // 1. 먼저 UI에서 즉시 제거 (모든 그룹 공통)
      setAssetGroups(prev => {
          const updated = prev.map(g => {
              if (g.id === groupId) {
                  return {
                      ...g,
                      assets: g.assets.filter(a => a.id !== assetId)
                  };
              }
              return g;
          });
          
          // localStorage에 사용자 추가 그룹 저장 (사용자 그룹인 경우)
          if (groupId !== 'my' && groupId !== 'favorites') {
              try {
                  const userGroups = updated.filter(g => g.id !== 'my' && g.id !== 'favorites');
                  localStorage.setItem('user_asset_groups', JSON.stringify(userGroups.map(g => ({
                      id: g.id,
                      name: g.name,
                      assets: g.assets.map(a => ({
                          id: a.id,
                          aptId: a.aptId,
                          name: a.name,
                          location: a.location,
                          area: a.area,
                          currentPrice: a.currentPrice,
                          purchasePrice: a.purchasePrice,
                          purchaseDate: a.purchaseDate,
                          changeRate: a.changeRate,
                          jeonsePrice: a.jeonsePrice,
                          gapPrice: a.gapPrice,
                          jeonseRatio: a.jeonseRatio,
                          isVisible: a.isVisible,
                      }))
                  }))));
              } catch (error) {
                  console.error('localStorage 사용자 그룹 저장 실패:', error);
              }
          }
          
          return updated;
      });

      // 1-1. 관심 단지(favorites)는 localStorage 백업에서도 제거 (안 하면 loadData() 병합 로직이 다시 복원함)
      if (groupId === 'favorites') {
          try {
              const backupStr = localStorage.getItem('favorite_apartments_backup');
              if (backupStr) {
                  const backupData = JSON.parse(backupStr);
                  const filtered = (Array.isArray(backupData) ? backupData : []).filter((x: any) => {
                      // backup 포맷: { id, aptId, ... }
                      if (String(x?.id) === String(assetId)) return false;
                      if (aptIdFromAsset != null && String(x?.aptId) === String(aptIdFromAsset)) return false;
                      return true;
                  });
                  localStorage.setItem('favorite_apartments_backup', JSON.stringify(filtered));
              }
          } catch (error) {
              console.error('localStorage 관심단지 백업 삭제 실패:', error);
          }
      }
      
      // 2. 사용자 추가 그룹은 API 호출 불필요
      if (groupId !== 'my' && groupId !== 'favorites') {
          return;
      }
      
      // 3. 내 자산/관심 단지는 백그라운드에서 API 호출
      if (!isSignedIn) {
          openSignIn();
          return;
      }
      
      try {
          const token = await getToken();
          if (token) setAuthToken(token);
          
          if (groupId === 'my') {
              await deleteMyProperty(parseInt(assetId));
          } else if (groupId === 'favorites') {
              // favorites 삭제 API는 apt_id 기준
              const aptId = aptIdFromAsset;
              if (aptId != null) {
                  await removeFavoriteApartment(Number(aptId));
              } else {
                  // aptId를 못 찾으면 동기화로 복구 (병합/백업 문제 포함)
                  await loadData({ silent: true });
              }
          }
      } catch (error) {
          console.error('아파트 삭제 실패:', error);
          // 실패 시 데이터 다시 로드하여 복구
          await loadData();
      }
  };

  // 내 자산 편집은 Dashboard에서 모달로 처리하지 않고,
  // 상세 페이지(PropertyDetail)에서 동일 모달로 통일할 예정

  const ControlsContent = () => (
      <>
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-3">
            {/* 스크롤 가능한 탭 영역 */}
            <div className={`flex items-center gap-2 flex-1 ${
                assetGroups.length >= 3 
                    ? 'overflow-x-auto overflow-y-visible scrollbar-hide' 
                    : 'overflow-visible'
            }`}>
                {assetGroups.map((group) => (
                    <div
                        key={group.id}
                        draggable={isEditMode}
                        onDragStart={() => handleDragStart(group.id)}
                        onDragOver={(e) => handleDragOver(e, group.id)}
                        onDragEnd={handleDragEnd}
                        className={`relative flex items-center gap-1 flex-shrink-0 ${
                            draggedGroupId === group.id ? 'opacity-50' : ''
                        } ${isEditMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                        {isEditMode && editingGroupId === group.id ? (
                            <input
                                type="text"
                                value={editingGroupName}
                                onChange={(e) => setEditingGroupName(e.target.value)}
                                onBlur={() => handleRenameGroup(group.id)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRenameGroup(group.id)}
                                className="px-3 py-2 rounded-lg text-[15px] font-bold border-2 border-blue-500 focus:outline-none w-28"
                                autoFocus
                            />
                        ) : (
                            <button 
                                onClick={() => isEditMode ? null : handleTabChange(group.id)}
                                onDoubleClick={() => {
                                    if (isEditMode) {
                                        setEditingGroupId(group.id);
                                        setEditingGroupName(group.name);
                                    }
                                }}
                                className={`px-4 py-2 rounded-lg text-[15px] font-bold transition-all whitespace-nowrap border min-w-[80px] text-center ${
                                    activeGroupId === group.id 
                                    ? 'bg-deep-900 text-white border-deep-900 shadow-sm' 
                                    : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'
                                }`}
                            >
                                {group.name}
                            </button>
                        )}
                        {isEditMode && editingGroupId !== group.id && assetGroups.length > 1 && group.id !== 'my' && group.id !== 'favorites' && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteGroup(group.id);
                                }}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-600 transition-colors shadow-md z-50"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                ))}
            </div>
            {/* 추가 버튼 - 스크롤 영역 밖, 카드 안에 고정 */}
            <button 
                onClick={() => setIsAddGroupModalOpen(true)}
                className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors shadow-sm flex-shrink-0"
            >
                <Plus className="w-5 h-5" />
            </button>
        </div>

        {/* View Options */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center mb-6 gap-3">
            <div className="flex-1 group">
                <Select
                    value={sortOption}
                    onChange={setSortOption}
                    options={[
                        { value: 'currentPrice-desc', label: '시세 높은순' },
                        { value: 'currentPrice-asc', label: '시세 낮은순' },
                        { value: 'changeRate-desc', label: '상승률 높은순' },
                        { value: 'changeRate-asc', label: '상승률 낮은순' }
                    ]}
                    icon={<ArrowUpDown className="h-4 w-4 text-slate-400" />}
                    size="lg"
                />
            </div>

            <ToggleButtonGroup
                options={['개별 보기', '모아 보기']}
                value={viewMode === 'separate' ? '개별 보기' : '모아 보기'}
                onChange={(value) => handleViewModeChange(value === '개별 보기' ? 'separate' : 'combined')}
                className="shadow-inner"
            />
        </div>
      </>
  );

  // 비로그인 유저: 홈에서 로그인 필요 안내만 표시
  // (로그인해야만 사용할 수 있는 기능은 모두 차단)
  if (!isClerkLoaded) return null;

  // 로그인된 상태인데 온보딩 미완료(신규 유저)면 온보딩으로 리다이렉트
  if (isSignedIn && !isOnboardingCompleted) {
    // 온보딩 완료 직후 메타 반영 지연(레이스) 대비: 1회성 통과 플래그
    let shouldBypass = false;
    try {
      const justDone = window.localStorage.getItem('onboarding.completedJustNow');
      if (justDone === '1') {
        window.localStorage.removeItem('onboarding.completedJustNow');
        shouldBypass = true;
      }
    } catch {
      // ignore
    }
    if (!shouldBypass) {
      return <Navigate to="/onboarding" replace />;
    }
  }

  if (!isSignedIn) {
    return (
      <div className="relative">
        <div className="relative space-y-10 pb-32 animate-fade-in px-4 md:px-0 pt-10 bg-transparent">
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
            <div className="lg:col-span-10">
              <Card className="p-0 overflow-hidden bg-transparent border-transparent shadow-none hover:shadow-none">
                <div className="relative p-7 md:p-10">
                  <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="max-w-2xl">
                      <div className="text-[26px] md:text-[40px] font-black text-slate-900 tracking-tight leading-tight">
                        모든 부동산 데이터를
                        <br />
                        한눈에 담으세요
                      </div>
                      <div className="mt-3 text-[14px] md:text-[16px] text-slate-600 font-medium leading-relaxed">
                        로그인 후 <span className="font-black text-slate-900">관심 단지</span>를 모아보고,
                        <span className="font-black text-slate-900"> 내 자산</span>을 정리하고,
                        <span className="font-black text-slate-900"> 지역 비교</span>로 인사이트를 확인해보세요.
                      </div>

                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setIsHomeSignInOpen(true)}
                          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 text-white font-black hover:bg-slate-800 transition-colors"
                        >
                          <LogIn className="w-5 h-5" />
                          로그인하기
                        </button>
                        <div className="text-[13px] text-slate-500 font-medium">
                          로그인 후 아래 기능들을 사용할 수 있어요.
                        </div>
                      </div>
                    </div>

                    <div className="hidden md:block flex-shrink-0">
                      <div className="w-[320px] h-[220px] rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_36px_rgba(0,0,0,0.08)] overflow-hidden">
                        <div className="p-5">
                          <div className="flex items-center justify-between">
                            <div className="text-[12px] font-black text-slate-900">미리보기</div>
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-slate-200" />
                              <span className="w-2 h-2 rounded-full bg-slate-200" />
                              <span className="w-2 h-2 rounded-full bg-slate-200" />
                            </div>
                          </div>
                          {/* 실제 서비스 느낌의 미니 UI */}
                          <div className="mt-4">
                            {/* 탭 */}
                            <div className="flex items-center gap-2">
                              <div className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[12px] font-black">
                                내 자산
                              </div>
                              <div className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-[12px] font-black">
                                관심 단지
                              </div>
                              <div className="ml-auto w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                                <Settings className="w-4 h-4" />
                              </div>
                            </div>

                            {/* 미니 차트 */}
                            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                              <div className="flex items-end justify-between">
                                <div className="space-y-1">
                                  <div className="h-2.5 w-24 rounded-full bg-slate-200" />
                                  <div className="h-2.5 w-16 rounded-full bg-slate-200" />
                                </div>
                                <div className="flex items-end gap-1">
                                  <div className="w-2 h-6 rounded-full bg-slate-300" />
                                  <div className="w-2 h-9 rounded-full bg-slate-400" />
                                  <div className="w-2 h-7 rounded-full bg-slate-300" />
                                  <div className="w-2 h-10 rounded-full bg-slate-400" />
                                </div>
                              </div>
                            </div>

                            {/* 미니 리스트 */}
                            <div className="mt-3 space-y-2">
                              {[
                                { name: '래미안', price: '37억', diff: '+1.2%' },
                                { name: '자이', price: '24억', diff: '-0.6%' },
                              ].map((r) => (
                                <div
                                  key={r.name}
                                  className="flex items-center gap-3 px-3 py-2 rounded-2xl border border-slate-100 bg-white"
                                >
                                  <div className="w-9 h-9 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                                    <Home className="w-4 h-4 text-slate-500" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[12px] font-black text-slate-900 truncate">{r.name}</div>
                                    <div className="text-[11px] text-slate-500 font-bold">아파트</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[12px] font-black text-slate-900 tabular-nums">
                                      {r.price}
                                    </div>
                                    <div
                                      className={`text-[11px] font-black tabular-nums ${
                                        r.diff.startsWith('+') ? 'text-red-500' : 'text-blue-500'
                                      }`}
                                    >
                                      {r.diff}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* 기능 카드: 6개(2행) */}
            <div className="lg:col-span-10">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[16px] md:text-[18px] font-black text-slate-900">로그인 후 사용할 수 있는 기능</div>
                  <div className="mt-1 text-[13px] text-slate-600 font-medium">
                    간편하게 모아보고, 비교하고, 정리할 수 있어요.
                  </div>
                </div>
              </div>

              <motion.div
                initial="hidden"
                animate="show"
                variants={{
                  hidden: {},
                  show: {
                    transition: {
                      staggerChildren: 0.10,
                      delayChildren: 0.05,
                    },
                  },
                }}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                {[
                  { title: '관심 단지 모아보기', desc: '관심있는 아파트를 저장하고 한 번에 비교해보세요.' },
                  { title: '내 자산 포트폴리오', desc: '내 집/예정 자산을 등록하고 가격 흐름을 확인해요.' },
                  { title: '지역 비교 & 인사이트', desc: '지도/비교 기능으로 지역별 수익률을 빠르게 살펴봐요.' },
                  { title: '정책 & 뉴스', desc: '최신 정책과 뉴스를 한 곳에서 빠르게 확인해요.' },
                  { title: '지도에서 탐색', desc: '주변 단지와 지역 데이터를 지도로 한눈에 살펴봐요.' },
                  { title: '비교로 분석', desc: '두 지역/단지를 비교해서 차이를 빠르게 파악해요.' },
                ].map((c) => (
                  <motion.div
                    key={c.title}
                    variants={{
                      hidden: { opacity: 0, x: -28 },
                      show: {
                        opacity: 1,
                        x: 0,
                        transition: { type: 'spring', stiffness: 520, damping: 34 },
                      },
                    }}
                  >
                    <Card className="p-6 rounded-[24px] transition-all duration-200 bg-white border border-slate-100/80 hover:border-slate-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                      <div className="space-y-2">
                        <div className="text-[15px] font-black text-slate-900">{c.title}</div>
                        <div className="text-[13px] text-slate-600 font-medium leading-relaxed">{c.desc}</div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </div>

        {/* 홈 로그인 모달: 로그인=홈 유지, 회원가입=온보딩 이동 */}
        {isHomeSignInOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsHomeSignInOpen(false)}
            />
            <div
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="로그인"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="text-[15px] font-black text-slate-900">로그인</div>
                <button
                  type="button"
                  onClick={() => setIsHomeSignInOpen(false)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">
                <SignIn
                  routing="path"
                  path="/"
                  // 기존 유저(로그인)는 바로 홈 유지
                  redirectUrl="/"
                  afterSignInUrl="/"
                  // 신규 유저(회원가입)는 온보딩으로 이동
                  afterSignUpUrl="/onboarding"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
        {/* Add Group Modal */}
        {isAddGroupModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsAddGroupModalOpen(false)}></div>
                <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                    <h3 className="text-lg font-black text-slate-900 mb-4">새 관심 단지 추가</h3>
                    <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                        placeholder="그룹 이름 입력"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                        autoFocus
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsAddGroupModalOpen(false)}
                            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleAddGroup}
                            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
                        >
                            추가
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* 내 자산 수정 모달 (대시보드에서 바로 수정) */}
        {isEditMyPropertyModalOpen && editMyPropertyTarget && (
          <MyPropertyModal
            isOpen={isEditMyPropertyModalOpen}
            onClose={() => {
              setIsEditMyPropertyModalOpen(false);
              setEditMyPropertyTarget(null);
            }}
            isEditMode={true}
            aptId={editMyPropertyTarget.aptId}
            apartmentName={editMyPropertyTarget.apartmentName}
            myPropertyId={editMyPropertyTarget.myPropertyId}
            transactions={[]}
            onSuccess={() => {
              // 수정 후 목록을 백그라운드로 갱신
              loadData({ silent: true }).catch(() => null);
            }}
          />
        )}

        {/* 내 자산 추가/수정 팝업 모달 (PropertyDetail과 동일) */}
        {isMyPropertyModalOpen && selectedApartmentForAdd && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in p-4">
            <div 
              className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
              onClick={() => {
                setIsMyPropertyModalOpen(false);
                setSelectedApartmentForAdd(null);
              }}
            />
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
              {/* 헤더 */}
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900">
                    내 자산에 추가
                  </h3>
                  <button 
                    onClick={() => {
                      setIsMyPropertyModalOpen(false);
                      setSelectedApartmentForAdd(null);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-[13px] text-slate-500 mt-1">{selectedApartmentForAdd.apt_name}</p>
              </div>
              
              {/* 폼 내용 */}
              <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {/* 별칭 */}
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-2">별칭</label>
                  <input 
                    type="text"
                    value={myPropertyForm.nickname}
                    onChange={(e) => setMyPropertyForm(prev => ({ ...prev, nickname: e.target.value }))}
                    placeholder={selectedApartmentForAdd.apt_name}
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
                
                {/* 구매가격 */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-2">
                      구매가격 (만원) <span className="text-red-500 font-bold">(필수)</span>
                    </label>
                    <input 
                      type="number"
                      value={myPropertyForm.purchase_price}
                      onChange={(e) => setMyPropertyForm(prev => ({ ...prev, purchase_price: e.target.value }))}
                      placeholder="예: 85000"
                      required
                      aria-required="true"
                      min={0}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                    />
                    {!!myPropertyForm.purchase_price?.trim() && (
                      <p className="mt-2 text-[12px] text-slate-500">
                        {formatManwonToEokOrManwon(myPropertyForm.purchase_price)}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* 매입일 */}
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-2">
                    매입일 <span className="text-red-500 font-bold">(필수)</span>
                  </label>
                  <input 
                    type="date"
                    value={myPropertyForm.purchase_date}
                    onChange={(e) => setMyPropertyForm(prev => ({ ...prev, purchase_date: e.target.value }))}
                    required
                    aria-required="true"
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
                  onClick={() => {
                    setIsMyPropertyModalOpen(false);
                    setSelectedApartmentForAdd(null);
                  }}
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
                    '추가하기'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 내 자산 편집 모달은 Dashboard에서 제거됨 (PropertyDetail로 통일 예정) */}

        {/* Toast Notification */}
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] animate-slide-down">
            <div className={`px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 min-w-[300px] ${
              toast.type === 'success' 
                ? 'bg-green-500 text-white' 
                : 'bg-red-500 text-white'
            }`}>
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <X className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="font-bold text-[14px] flex-1">{toast.message}</span>
              <button
                onClick={() => setToast(null)}
                className="p-1 rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        
        {/* Add Apartment Modal */}
        {isAddApartmentModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 p-4">
                {/* Backdrop */}
                <div 
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                    onClick={() => {
                        setIsAddApartmentModalOpen(false);
                        setApartmentSearchQuery('');
                        setSearchResults([]);
                    }}
                ></div>
                <div 
                    className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-6 border-b border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black text-slate-900">
                                아파트 추가
                            </h3>
                            <button 
                                onClick={() => {
                                    setIsAddApartmentModalOpen(false);
                                    setApartmentSearchQuery('');
                                    setSearchResults([]);
                                }}
                                className="p-2 rounded-full hover:bg-slate-100 text-slate-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={apartmentSearchQuery}
                            onChange={(e) => setApartmentSearchQuery(e.target.value)}
                            placeholder="아파트 이름을 검색하세요"
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[15px] font-medium focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            autoFocus
                        />
                    </div>
                    <div 
                        className="flex-1 overflow-y-auto p-4 space-y-2 overscroll-contain min-h-[200px] custom-scrollbar"
                        onWheel={(e) => e.stopPropagation()}
                    >
                        {isSearching ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                                <span className="ml-2 text-slate-500 text-[14px]">검색 중...</span>
                            </div>
                        ) : searchResults.length > 0 ? (
                            searchResults.map((apt) => (
                                <div 
                                    key={apt.apt_id}
                                    onClick={() => handleAddApartment(apt.apt_id, apt.apt_name, apt.address)}
                                    className="flex items-center justify-between p-4 rounded-xl hover:bg-blue-50 cursor-pointer transition-colors border border-slate-100 hover:border-blue-200"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center">
                                            <span className="text-[14px] font-bold text-slate-400">
                                                {apt.apt_name.charAt(0)}
                                            </span>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900">{apt.apt_name}</h4>
                                            {apt.address && (
                                                <p className="text-[13px] text-slate-500">{apt.address}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : apartmentSearchQuery.trim() ? (
                            <div className="text-center py-8 text-slate-400">
                                <p className="text-[14px]">검색 결과가 없습니다.</p>
                                <p className="text-[13px] mt-1">다른 키워드로 검색해 보세요.</p>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-400">
                                <p className="text-[14px]">아파트 이름을 입력하세요.</p>
                                <p className="text-[13px] mt-1">예: 래미안, 자이, 힐스테이트</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* PC Layout */}
        <div className="hidden md:flex flex-col gap-8 pb-24">
            {/* 태블릿: Profile Card를 상단에 가로로 배치 */}
            <div className="lg:hidden">
                <ProfileWidgetsCard 
                    activeGroupName={activeGroup.name}
                    assets={activeGroup.assets}
                    isHorizontal={true}
                />
            </div>
            
            {/* Main Content Grid */}
            <div className="grid grid-cols-12 gap-8 items-stretch">
                {/* Left: Profile & Widgets Card - 데스크톱에서만 표시 */}
                <div className="hidden lg:block lg:col-span-2">
                    <ProfileWidgetsCard 
                        activeGroupName={activeGroup.name}
                        assets={activeGroup.assets}
                    />
                </div>
                
                {/* Right: Main Content Area */}
                <div className="col-span-12 lg:col-span-10">
                    <div className="grid grid-cols-12 gap-8">
                        {/* Top Row: Chart and Asset List (SWAPPED) */}
                        <div className="col-span-12 grid grid-cols-12 gap-8 min-h-[600px]">
                            {/* LEFT COLUMN (Chart) */}
                            <div className="col-span-6 h-full flex flex-col gap-6">
                                <div className="bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] bg-noise rounded-[28px] p-10 text-white shadow-deep relative overflow-hidden group flex flex-col flex-1 min-h-0 border border-white/5">
                                    <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] glow-blue blur-[120px] pointer-events-none" aria-hidden="true"></div>
                                    <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] glow-cyan blur-[100px] pointer-events-none" aria-hidden="true"></div>

                                    <div className="flex flex-col items-start mb-8 relative z-10">
                                        <div className="flex items-center justify-between w-full mb-2">
                                            <div className="text-slate-300 text-[17px] font-semibold uppercase tracking-wide">
                                                내 자산
                                            </div>
                                            <button 
                                                onClick={onViewAllPortfolio}
                                                className="flex items-center gap-2 text-[13px] font-bold transition-all bg-[#2a3a4f] hover:bg-[#3d5a80] text-white border border-white/10 px-5 py-2.5 rounded-full"
                                            >
                                                자산 분석 <ChevronRight className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <div className="flex items-start gap-4 w-full">
                                            {isLoading ? (
                                                <Skeleton className="h-14 w-60 rounded-lg bg-white/10" />
                                            ) : (
                                                <div className="flex flex-col items-start w-full">
                                                    <span className="text-[clamp(2.5rem,2.5vw,4rem)] font-black tracking-normal tabular-nums leading-none -ml-[0.09em]">
                                                        <NumberTicker value={totalValue} formatter={formatPriceString} />
                                                    </span>
                                                    <div className="mt-1 flex items-center w-full">
                                                        <span className="text-[16px] font-normal">
                                                            <span className="text-white/70">{selectedPeriod} 전보다</span>
                                                            <span className={`ml-1 ${periodComparison.amount >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                                                {periodComparison.amount >= 0 ? '+' : '-'}{formatPriceWithoutWon(Math.abs(periodComparison.amount))} ({Math.abs(periodComparison.rate).toFixed(1)}%)
                                                            </span>
                                                            <span className="text-slate-400 text-[11px] font-medium ml-2">(단위: 만원)</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="relative z-10 flex-1 flex flex-col chart-container">
                                        <div className="flex justify-between items-start gap-2 mb-4">
                                            {/* 아파트 선택 필터 (왼쪽) */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] text-slate-400 font-medium">아파트 선택</span>
                                                <select
                                                    value={selectedAssetId || ''}
                                                    onChange={(e) => setSelectedAssetId(e.target.value || null)}
                                                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white/10 text-white border border-white/20 backdrop-blur-sm cursor-pointer hover:bg-white/15 transition-all focus:outline-none focus:ring-1 focus:ring-white/30 max-w-[150px]"
                                                >
                                                    <option value="" className="bg-slate-800 text-white">전체 자산</option>
                                                    {activeGroup.assets.filter(a => a.isVisible).map(asset => (
                                                        <option key={asset.id} value={asset.id} className="bg-slate-800 text-white">
                                                            {asset.name.length > 10 ? asset.name.slice(0, 10) + '...' : asset.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            
                                            {/* 기간 선택 (오른쪽) */}
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-[11px] text-slate-400 font-medium">{latestDataDate || '최근 기준'}</span>
                                                <div className="flex gap-2">
                                                    {['1년', '3년', '전체'].map(t => (
                                                        <button 
                                                            key={t} 
                                                            onClick={() => setSelectedPeriod(t)}
                                                            className={`text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm border transition-all ${t === selectedPeriod ? 'bg-white text-deep-900 border-white shadow-neon-mint' : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white'}`}
                                                        >
                                                            {t}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-1 w-full min-h-0">
                                            {isLoading ? (
                                                <Skeleton className="w-full h-full rounded-xl bg-white/5" />
                                            ) : (
                                                <ProfessionalChart 
                                                    series={chartSeries}
                                                    height={420} 
                                                    theme="dark"
                                                    showHighLowInTooltip={true}
                                                    period={selectedPeriod as '1년' | '3년' | '전체'}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT COLUMN (Asset List) */}
                            <div className="col-span-6 h-full flex flex-col">
                                <div className="bg-white rounded-[28px] p-10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80 flex flex-col h-full min-h-0 relative">
                                    <div className="flex items-center justify-between mb-6 px-1">
                                        <h2 className="text-xl font-black text-slate-900 tracking-tight">관심 리스트</h2>
                                        <button 
                                            onClick={() => {
                                                setIsEditMode(!isEditMode);
                                            }}
                                            className={`text-[13px] font-bold flex items-center gap-1.5 p-2 rounded-lg transition-colors ${
                                                isEditMode 
                                                    ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' 
                                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                            }`}
                                        >
                                            {isEditMode ? <Check className="w-4 h-4" /> : <MoreHorizontal className="w-4 h-4" />} {isEditMode ? '완료' : '편집'}
                                        </button>
                                    </div>
                                    
                                    <ControlsContent />

                                    <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent hover:scrollbar-thumb-slate-400 -mr-2 pr-2 mt-2 max-h-[calc(100vh-420px)]">
                                         <AnimatePresence mode="popLayout">
                                         {isLoading ? (
                                            [1,2,3,4].map(i => (
                                                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                    <Skeleton className="h-24 w-full rounded-2xl" />
                                                </motion.div>
                                            ))
                                         ) : (
                                            sortedAssets.length > 0 ? (
                                                sortedAssets.map((prop, index) => (
                                                    <motion.div 
                                                        key={prop.id}
                                                        layout
                                                        initial={{ opacity: 0, x: -20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        exit={{ opacity: 0, x: 20 }}
                                                        transition={{ duration: 0.2, delay: index * 0.03 }}
                                                    >
                                                        <AssetRow 
                                                            item={prop} 
                                                            onClick={() => !isEditMode && onPropertyClick(prop.aptId?.toString() || prop.id)}
                                                            onToggleVisibility={(e) => toggleAssetVisibility(activeGroup.id, prop.id, e)}
                                                            isEditMode={isEditMode}
                                                            isDeleting={deletingAssetId === prop.id}
                                                            isMyAsset={activeGroup.id === 'my'}
                                                            onEdit={activeGroup.id === 'my' ? (e) => {
                                                                e.stopPropagation();
                                                                const aptId = prop.aptId;
                                                                const myPropertyId = Number(prop.id);
                                                                if (!aptId || !Number.isFinite(myPropertyId)) return;
                                                                setEditMyPropertyTarget({
                                                                    aptId,
                                                                    apartmentName: prop.name,
                                                                    myPropertyId
                                                                });
                                                                setIsEditMyPropertyModalOpen(true);
                                                            } : undefined}
                                                            onDelete={(e) => {
                                                                e.stopPropagation();
                                                                handleRemoveAsset(activeGroup.id, prop.id);
                                                            }}
                                                        />
                                                    </motion.div>
                                                ))
                                            ) : (
                                                <motion.div 
                                                    initial={{ opacity: 0 }} 
                                                    animate={{ opacity: 1 }}
                                                    className="h-full flex flex-col items-center justify-center text-slate-400 gap-2"
                                                >
                                                    <Plus className="w-8 h-8 opacity-20" />
                                                    <p className="text-[15px] font-medium">등록된 자산이 없습니다.</p>
                                                </motion.div>
                                            )
                                         )}
                                         </AnimatePresence>
                                    </div>

                                    <button 
                                        onClick={() => setIsAddApartmentModalOpen(true)}
                                        className="w-full mt-6 py-4 rounded-xl border border-dashed border-slate-300 text-slate-500 font-bold hover:bg-slate-50 hover:text-slate-900 hover:border-slate-900 transition-all flex items-center justify-center gap-2 flex-shrink-0 active:scale-95 text-[15px]"
                                    >
                                        <Plus className="w-4 h-4" /> {activeGroup.name}에 추가하기
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row: Policy News & Region Comparison */}
                    <div className="grid grid-cols-12 gap-8 mt-8">
                        <div id="section-policy-news" className="col-span-6 h-[520px]">
                            <DashboardPanelCard
                                cardId="left"
                                activeSection={leftPanelView}
                                onSelectSection={setLeftPanelViewPersisted}
                                regionComparisonData={regionComparisonData}
                                isRegionComparisonLoading={isLoading || isRegionComparisonLoading}
                            />
                        </div>
                        <div id="section-region-comparison" className="col-span-6 h-[520px]">
                            <div className="h-full">
                                <DashboardPanelCard
                                    cardId="right"
                                    activeSection={rightPanelView}
                                    onSelectSection={setRightPanelViewPersisted}
                                    regionComparisonData={regionComparisonData}
                                    isRegionComparisonLoading={isLoading || isRegionComparisonLoading}
                                    onRefresh={refreshRegionComparison}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        {/* Mobile View */}
        <div className="md:hidden min-h-screen bg-transparent pb-24">
            <div className="px-2 pt-2 space-y-3">
                {/* 1. 금리 지표 (상단 가로) */}
                <ProfileWidgetsCard 
                    isMobileRateHorizontal={true}
                    showProfile={false}
                    showInterestRates={true}
                    showPortfolio={false}
                />

                {/* 2. 내 자산 차트 카드 (기존 유지) */}
                <div className="bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] rounded-[20px] p-4 relative overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]">
                    <div className="absolute top-[-20%] right-[-10%] w-[200px] h-[200px] bg-blue-500/20 blur-[60px] pointer-events-none" aria-hidden="true"></div>
                    <div className="absolute bottom-[-20%] left-[-10%] w-[150px] h-[150px] bg-cyan-500/20 blur-[50px] pointer-events-none" aria-hidden="true"></div>
                    
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-slate-400" />
                                <span className="text-[13px] font-bold text-slate-400">{activeGroup.name}</span>
                            </div>
                            <button 
                                onClick={onViewAllPortfolio}
                                className="text-[12px] font-bold text-slate-400 flex items-center gap-1 hover:text-white transition-colors"
                            >
                                자산 분석 <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                        
                        <div className="mb-4">
                            {isLoading ? (
                                <Skeleton className="h-10 w-40 rounded bg-white/10" />
                            ) : (
                                <>
                                    <span className="text-[2rem] font-black text-white tracking-tight tabular-nums">
                                        <NumberTicker value={totalValue} formatter={formatPriceString} />
                                    </span>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[14px] font-bold ${periodComparison.amount >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                            {periodComparison.amount >= 0 ? '+' : ''}{formatPriceWithoutWon(Math.abs(periodComparison.amount))}
                                        </span>
                                        <span className="text-[12px] text-slate-500">
                                            ({selectedPeriod} 대비 {Math.abs(periodComparison.rate).toFixed(1)}%)
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                        
                        {/* 기간 선택 버튼 */}
                        <div className="flex gap-2 mb-4">
                            {['1년', '3년', '전체'].map(t => (
                                <button 
                                    key={t} 
                                    onClick={() => setSelectedPeriod(t)}
                                    className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-all ${
                                        t === selectedPeriod 
                                            ? 'bg-white text-slate-900' 
                                            : 'bg-white/10 text-slate-400 hover:bg-white/20'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                        
                        {/* 차트 */}
                        <div className="h-[180px] -mx-2 chart-container">
                            {isLoading ? (
                                <div className="w-full h-full flex items-center justify-center">
                                    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                </div>
                            ) : (
                                <ProfessionalChart 
                                    series={chartSeries}
                                    height={180}
                                    theme="dark"
                                    showHighLowInTooltip={false}
                                    period={selectedPeriod as '1년' | '3년' | '전체'}
                                />
                            )}
                        </div>
                    </div>
                </div>
                
                {/* 3. 내 자산 목록 카드 (기존 유지) */}
                <div className="bg-white rounded-[20px] p-4 shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)]">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[17px] font-black text-slate-900">내 자산 목록</h2>
                        <span className="text-[13px] text-slate-400 font-medium">{sortedAssets.length}개</span>
                    </div>
                    
                    <div className="space-y-1.5 min-h-[100px]">
                        <AnimatePresence mode="popLayout">
                        {isLoading ? (
                            [1,2,3].map(i => (
                                <motion.div 
                                    key={i} 
                                    initial={{ opacity: 0 }} 
                                    animate={{ opacity: 1 }} 
                                    exit={{ opacity: 0 }}
                                >
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                </motion.div>
                            ))
                        ) : sortedAssets.length > 0 ? (
                            sortedAssets.slice(0, 5).map((prop, index) => (
                                <motion.div 
                                    key={prop.id} 
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.2, delay: index * 0.05 }}
                                    className="transform active:scale-[0.98]"
                                >
                                    <AssetRow 
                                        item={prop} 
                                        onClick={() => !isEditMode && onPropertyClick(prop.aptId?.toString() || prop.id)}
                                        onToggleVisibility={(e) => toggleAssetVisibility(activeGroup.id, prop.id, e)}
                                        isEditMode={isEditMode}
                                        isDeleting={deletingAssetId === prop.id}
                                        isMyAsset={activeGroup.id === 'my'}
                                        onEdit={activeGroup.id === 'my' ? (e) => {
                                            e.stopPropagation();
                                            const aptId = prop.aptId;
                                            const myPropertyId = Number(prop.id);
                                            if (!aptId || !Number.isFinite(myPropertyId)) return;
                                            setEditMyPropertyTarget({
                                                aptId,
                                                apartmentName: prop.name,
                                                myPropertyId
                                            });
                                            setIsEditMyPropertyModalOpen(true);
                                        } : undefined}
                                        onDelete={(e) => {
                                            e.stopPropagation();
                                            handleRemoveAsset(activeGroup.id, prop.id);
                                        }}
                                    />
                                </motion.div>
                            ))
                        ) : (
                            <motion.div 
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }}
                                className="h-32 flex flex-col items-center justify-center text-slate-400 gap-2"
                            >
                                <Plus className="w-8 h-8 opacity-20" />
                                <p className="text-[14px] font-medium">등록된 자산이 없습니다.</p>
                            </motion.div>
                        )}
                        </AnimatePresence>
                    </div>
                    
                    {sortedAssets.length > 5 && (
                        <button 
                            onClick={() => setIsMobileSettingsOpen(true)}
                            className="w-full mt-3 py-2.5 text-[14px] font-bold text-slate-500 hover:text-slate-900 transition-colors"
                        >
                            {sortedAssets.length - 5}개 더 보기
                        </button>
                    )}
                    
                    <button 
                        onClick={() => setIsAddApartmentModalOpen(true)}
                        className="w-full mt-3 py-3 rounded-xl border border-dashed border-slate-300 text-slate-500 font-bold hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400 transition-all flex items-center justify-center gap-2 active:scale-[0.98] text-[14px]"
                    >
                        <Plus className="w-4 h-4" /> 아파트 추가하기
                    </button>
                </div>

                {/* 4. 지역 포트폴리오 (하단 수직) */}
                <ProfileWidgetsCard 
                    activeGroupName={activeGroup.name}
                    assets={activeGroup.assets}
                    showProfile={false}
                    showInterestRates={false}
                    showPortfolio={true}
                />

                {/* 5. 정책 및 뉴스 */}
                <div className="md:bg-white md:rounded-[20px] md:p-4 md:shadow-[0_2px_8px_rgba(0,0,0,0.04)] md:border md:border-slate-100/80 h-[400px]">
                    <DashboardPanelCard
                        cardId="left"
                        activeSection={leftPanelView}
                        onSelectSection={setLeftPanelViewPersisted}
                        regionComparisonData={regionComparisonData}
                        isRegionComparisonLoading={isLoading || isRegionComparisonLoading}
                    />
                </div>

                {/* 6. 지역 대비 수익률 비교 */}
                <div className="md:bg-white md:rounded-[20px] md:p-4 md:shadow-[0_2px_8px_rgba(0,0,0,0.04)] md:border md:border-slate-100/80 h-[400px]">
                    <DashboardPanelCard
                        cardId="right"
                        activeSection={rightPanelView}
                        onSelectSection={setRightPanelViewPersisted}
                        regionComparisonData={regionComparisonData}
                        isRegionComparisonLoading={isLoading || isRegionComparisonLoading}
                        onRefresh={refreshRegionComparison}
                    />
                </div>
            </div>
            
            {/* Mobile Settings Panel (전체 화면) */}
            {isMobileSettingsOpen && (
                <div className="fixed inset-0 z-[100] bg-[#f8f9fa] animate-slide-up">
                    {/* 헤더 */}
                    <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
                        <button 
                            onClick={() => setIsMobileSettingsOpen(false)}
                            className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <h2 className="text-[17px] font-black text-slate-900">그래프 설정</h2>
                        <button 
                            onClick={() => setIsMobileSettingsOpen(false)}
                            className="text-[15px] font-bold text-blue-600"
                        >
                            완료
                        </button>
                    </div>
                    
                    <div className="p-5 space-y-5 pb-32 overflow-y-auto h-[calc(100vh-60px)] custom-scrollbar">
                        {/* 그룹 선택 */}
                        <div className="bg-white rounded-[20px] p-5 shadow-sm border border-slate-100">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[15px] font-black text-slate-900">관심 그룹 선택</h3>
                                <button 
                                    onClick={() => {
                                        setIsMobileSettingsOpen(false);
                                        setIsAddGroupModalOpen(true);
                                    }}
                                    className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="space-y-2">
                                {assetGroups.map((group) => (
                                    <button
                                        key={group.id}
                                        onClick={() => setActiveGroupId(group.id)}
                                        className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
                                            activeGroupId === group.id 
                                                ? 'bg-blue-50 border-2 border-blue-500' 
                                                : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                                activeGroupId === group.id ? 'bg-blue-500' : 'bg-slate-300'
                                            }`}>
                                                <Layers className={`w-5 h-5 ${
                                                    activeGroupId === group.id ? 'text-white' : 'text-slate-600'
                                                }`} />
                                            </div>
                                            <div className="text-left">
                                                <p className={`text-[15px] font-bold ${
                                                    activeGroupId === group.id ? 'text-blue-600' : 'text-slate-900'
                                                }`}>
                                                    {group.name}
                                                </p>
                                                <p className="text-[13px] text-slate-400">
                                                    {group.assets.length}개 자산
                                                </p>
                                            </div>
                                        </div>
                                        {activeGroupId === group.id && (
                                            <Check className="w-5 h-5 text-blue-500" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {/* 보기 모드 설정 */}
                        <div className="bg-white rounded-[20px] p-5 shadow-sm border border-slate-100">
                            <h3 className="text-[15px] font-black text-slate-900 mb-4">그래프 보기 모드</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setViewMode('separate')}
                                    className={`p-4 rounded-xl border-2 transition-all ${
                                        viewMode === 'separate' 
                                            ? 'border-blue-500 bg-blue-50' 
                                            : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <div className={`text-[14px] font-bold ${
                                        viewMode === 'separate' ? 'text-blue-600' : 'text-slate-900'
                                    }`}>
                                        개별 보기
                                    </div>
                                    <p className="text-[12px] text-slate-400 mt-1">각 자산 개별 표시</p>
                                </button>
                                <button
                                    onClick={() => setViewMode('combined')}
                                    className={`p-4 rounded-xl border-2 transition-all ${
                                        viewMode === 'combined' 
                                            ? 'border-blue-500 bg-blue-50' 
                                            : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <div className={`text-[14px] font-bold ${
                                        viewMode === 'combined' ? 'text-blue-600' : 'text-slate-900'
                                    }`}>
                                        모아 보기
                                    </div>
                                    <p className="text-[12px] text-slate-400 mt-1">합산하여 표시</p>
                                </button>
                            </div>
                        </div>
                        
                        {/* 자산 표시/숨김 설정 */}
                        <div className="bg-white rounded-[20px] p-5 shadow-sm border border-slate-100">
                            <h3 className="text-[15px] font-black text-slate-900 mb-4">자산 표시 설정</h3>
                            <p className="text-[13px] text-slate-400 mb-4">그래프에 표시할 자산을 선택하세요</p>
                            <div className="space-y-2">
                                {activeGroup.assets.map(asset => (
                                    <div 
                                        key={asset.id}
                                        className="flex items-center justify-between p-4 rounded-xl bg-slate-50"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div 
                                                className="w-3 h-3 rounded-full" 
                                                style={{ backgroundColor: asset.color }}
                                            />
                                            <div>
                                                <p className="text-[14px] font-bold text-slate-900">{asset.name}</p>
                                                <p className="text-[12px] text-slate-400">{asset.location}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => toggleAssetVisibility(activeGroup.id, asset.id, e)}
                                            className={`p-2 rounded-lg transition-colors ${
                                                asset.isVisible 
                                                    ? 'bg-blue-100 text-blue-600' 
                                                    : 'bg-slate-200 text-slate-400'
                                            }`}
                                        >
                                            {asset.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        </button>
                                    </div>
                                ))}
                                
                                {activeGroup.assets.length === 0 && (
                                    <div className="text-center py-8 text-slate-400">
                                        <p className="text-[14px]">등록된 자산이 없습니다.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* 정렬 설정 */}
                        <div className="bg-white rounded-[20px] p-5 shadow-sm border border-slate-100">
                            <h3 className="text-[15px] font-black text-slate-900 mb-4">정렬 순서</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { value: 'currentPrice-desc', label: '시세 높은순' },
                                    { value: 'currentPrice-asc', label: '시세 낮은순' },
                                    { value: 'changeRate-desc', label: '상승률 높은순' },
                                    { value: 'changeRate-asc', label: '상승률 낮은순' },
                                ].map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => setSortOption(option.value)}
                                        className={`p-3 rounded-xl text-[13px] font-bold transition-all ${
                                            sortOption === option.value 
                                                ? 'bg-blue-500 text-white' 
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {/* 아파트 추가 버튼 */}
                        <button 
                            onClick={() => {
                                setIsMobileSettingsOpen(false);
                                setIsAddApartmentModalOpen(true);
                            }}
                            className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            <Plus className="w-5 h-5" /> {activeGroup.name}에 자산 추가
                        </button>
                    </div>
                </div>
            )}

        </div>
    </div>
  );
};
