import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Building2, MapPin, Calendar, TrendingUp, TrendingDown, Sparkles, ChevronRight, ChevronDown, Home, Plus, User, X, Newspaper, ExternalLink, FileText, Save, Menu, Trash2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { useUser, useAuth } from '@/lib/clerk';
import AddMyPropertyModal from './AddMyPropertyModal';
import { getMyProperties, getMyProperty, deleteMyProperty, getMyPropertyCompliment, updateMyProperty, MyProperty } from '@/lib/myPropertyApi';
import { getApartmentTransactions, PriceTrendData, ApartmentTransactionsResponse } from '@/lib/apartmentApi';
import { getNewsList, NewsResponse, formatTimeAgo } from '@/lib/newsApi';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './ui/Toast';

interface MyHomeProps {
  isDarkMode: boolean;
  onOpenProfileMenu: () => void;
  isDesktop?: boolean;
  onApartmentClick?: (apartment: any) => void;
}

export default function MyHome({ isDarkMode, onOpenProfileMenu, isDesktop = false, onApartmentClick }: MyHomeProps) {
  const { user, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const toast = useToast();
  
  // 내 집 추가 모달 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // 내 집 목록 상태
  const [myProperties, setMyProperties] = useState<MyProperty[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [selectedPropertyDetail, setSelectedPropertyDetail] = useState<MyProperty | null>(null);
  const [propertyCompliment, setPropertyCompliment] = useState<string | null>(null);
  const [priceTrendData, setPriceTrendData] = useState<PriceTrendData[]>([]);
  const [transactionsData, setTransactionsData] = useState<ApartmentTransactionsResponse['data'] | null>(null);
  const [newsData, setNewsData] = useState<NewsResponse[]>([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [isLoadingPropertyDetail, setIsLoadingPropertyDetail] = useState(false);
  const [isLoadingCompliment, setIsLoadingCompliment] = useState(false);
  const [isLoadingPriceTrend, setIsLoadingPriceTrend] = useState(false);
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [hoveredPropertyId, setHoveredPropertyId] = useState<number | null>(null);
  const [showAllAreaGroups, setShowAllAreaGroups] = useState(false);
  const [showRecentTransactions, setShowRecentTransactions] = useState(false);
  const [memoText, setMemoText] = useState<string>('');
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [showMemoCard, setShowMemoCard] = useState(false);
  
  // selectedPropertyId의 최신 값을 참조하기 위한 ref
  const selectedPropertyIdRef = useRef<number | null>(null);
  
  // 마우스 드래그로 스크롤을 위한 ref 및 state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);
  
  // selectedPropertyId가 변경될 때마다 ref 업데이트
  useEffect(() => {
    selectedPropertyIdRef.current = selectedPropertyId;
    // 선택된 내 집이 변경되면 면적 그룹 목록 닫기
    setShowAllAreaGroups(false);
  }, [selectedPropertyId]);
  
  // 내 집 목록 조회 (0.5초마다 자동으로 갱신)
  useEffect(() => {
    const fetchProperties = async () => {
      if (!isSignedIn || !getToken) {
        setMyProperties([]);
        setSelectedPropertyId(null);
        return;
      }
      
      setIsLoadingProperties(true);
      try {
        const token = await getToken();
        if (!token) {
          setMyProperties([]);
          setSelectedPropertyId(null);
          return;
        }
        
        // 0.5초마다 자동으로 갱신되므로 캐시를 무시하고 최신 데이터를 가져오기
        const properties = await getMyProperties(token, true);
        // 오름차순 정렬 (오래된 순서)
        setMyProperties([...properties].reverse());
        
        // 현재 선택된 내 집 ID (ref를 통해 최신 값 참조)
        const currentSelectedId = selectedPropertyIdRef.current;
        
        // 선택된 내 집 처리
        if (properties.length === 0) {
          // 목록이 비어있으면 선택 해제
          setSelectedPropertyId(null);
        } else if (currentSelectedId === null) {
          // 선택된 내 집이 없으면 첫 번째로 선택
          setSelectedPropertyId(properties[0].property_id);
        } else {
          // 선택된 내 집이 목록에 있는지 확인
          const selectedStillExists = properties.some(p => p.property_id === currentSelectedId);
          if (!selectedStillExists) {
            // 선택된 내 집이 목록에서 사라졌으면 첫 번째로 선택
            setSelectedPropertyId(properties[0].property_id);
          }
          // 선택된 내 집이 목록에 있으면 유지 (변경하지 않음)
        }
      } catch (error) {
        console.error('Failed to fetch my properties:', error);
        setMyProperties([]);
        setSelectedPropertyId(null);
      } finally {
        setIsLoadingProperties(false);
      }
    };
    
    // 초기 로드
    fetchProperties();
    
    // 0.5초마다 자동으로 갱신
    const intervalId = setInterval(() => {
      fetchProperties();
    }, 500);
    
    // cleanup: 컴포넌트 언마운트 시 interval 정리
    return () => {
      clearInterval(intervalId);
    };
  }, [isSignedIn, getToken]);
  
  // 내 집 등록 완료 후 목록 갱신
  const handlePropertyAdded = async () => {
    if (!getToken) return;
    
    try {
      const token = await getToken();
      if (!token) return;
      
      // 등록 직후이므로 캐시를 무시하고 최신 데이터를 가져오기
      const properties = await getMyProperties(token, true);
      // 오름차순 정렬 (오래된 순서)
      const reversedProperties = [...properties].reverse();
      setMyProperties(reversedProperties);
      
      // 방금 추가한 내 집을 선택 (가장 최신 - 뒤집은 배열의 마지막 요소)
      if (reversedProperties.length > 0) {
        setSelectedPropertyId(reversedProperties[reversedProperties.length - 1].property_id);
      }
    } catch (error) {
      console.error('Failed to refresh properties:', error);
    }
  };
  
  // 선택된 내 집 상세 정보 조회
  useEffect(() => {
    const fetchPropertyDetail = async () => {
      if (!selectedPropertyId || !isSignedIn || !getToken) {
        setSelectedPropertyDetail(null);
        return;
      }
      
      setIsLoadingPropertyDetail(true);
      try {
        const token = await getToken();
        if (!token) {
          setSelectedPropertyDetail(null);
          return;
        }
        
        const detail = await getMyProperty(selectedPropertyId, token);
        setSelectedPropertyDetail(detail);
        setMemoText(detail.memo || '');
      } catch (error) {
        console.error('Failed to fetch property detail:', error);
        setSelectedPropertyDetail(null);
      } finally {
        setIsLoadingPropertyDetail(false);
      }
    };
    
    fetchPropertyDetail();
  }, [selectedPropertyId, isSignedIn, getToken]);

  // 선택된 내 집 칭찬글 조회
  useEffect(() => {
    const fetchPropertyCompliment = async () => {
      if (!selectedPropertyId || !isSignedIn || !getToken) {
        setPropertyCompliment(null);
        return;
      }
      
      setIsLoadingCompliment(true);
      try {
        const token = await getToken();
        if (!token) {
          setPropertyCompliment(null);
          return;
        }
        
        const complimentData = await getMyPropertyCompliment(selectedPropertyId, token);
        setPropertyCompliment(complimentData.compliment);
      } catch (error) {
        console.error('Failed to fetch property compliment:', error);
        setPropertyCompliment(null);
      } finally {
        setIsLoadingCompliment(false);
      }
    };
    
    fetchPropertyCompliment();
  }, [selectedPropertyId, isSignedIn, getToken]);

  // 선택된 내 집 가격 추이 및 거래 데이터 조회
  useEffect(() => {
    const fetchPriceTrend = async () => {
      if (!selectedPropertyDetail?.apt_id) {
        setPriceTrendData([]);
        setTransactionsData(null);
        return;
      }
      
      setIsLoadingPriceTrend(true);
      try {
        const transactionsDataResult = await getApartmentTransactions(
          selectedPropertyDetail.apt_id,
          'sale',
          10,
          6
        );
        
        if (transactionsDataResult) {
          setTransactionsData(transactionsDataResult);
          if (transactionsDataResult.price_trend) {
            setPriceTrendData(transactionsDataResult.price_trend);
          } else {
            setPriceTrendData([]);
          }
        } else {
          setPriceTrendData([]);
          setTransactionsData(null);
        }
      } catch (error) {
        console.error('Failed to fetch price trend:', error);
        setPriceTrendData([]);
        setTransactionsData(null);
      } finally {
        setIsLoadingPriceTrend(false);
      }
    };
    
    fetchPriceTrend();
  }, [selectedPropertyDetail?.apt_id]);

  // 선택된 내 집 관련 뉴스 조회
  useEffect(() => {
    const fetchNews = async () => {
      if (!selectedPropertyDetail?.apt_id) {
        setNewsData([]);
        return;
      }
      
      setIsLoadingNews(true);
      try {
        const token = await getToken();
        const newsResponse = await getNewsList(20, token, null, null, null, selectedPropertyDetail.apt_id);
        
        if (newsResponse && newsResponse.data) {
          setNewsData(newsResponse.data.slice(0, 5)); // 최대 5개만 표시
        } else {
          setNewsData([]);
        }
      } catch (error) {
        console.error('Failed to fetch news:', error);
        setNewsData([]);
      } finally {
        setIsLoadingNews(false);
      }
    };
    
    fetchNews();
  }, [selectedPropertyDetail?.apt_id, getToken]);
  
  // 메모 저장 핸들러
  const handleSaveMemo = async () => {
    if (!selectedPropertyId || !getToken) return;
    
    setIsSavingMemo(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error('로그인이 필요합니다.');
        return;
      }
      
      await updateMyProperty(selectedPropertyId, { memo: memoText || null }, token);
      
      // 로컬 상태 업데이트
      if (selectedPropertyDetail) {
        setSelectedPropertyDetail({
          ...selectedPropertyDetail,
          memo: memoText || null
        });
      }
      
      toast.success('메모가 저장되었습니다.');
    } catch (error: any) {
      console.error('Failed to save memo:', error);
      toast.error(error.message || '메모 저장에 실패했습니다.');
    } finally {
      setIsSavingMemo(false);
    }
  };

  // 내 집 삭제 핸들러
  const handleDeleteProperty = async (propertyId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!getToken) return;
    
    // 확인 메시지
    if (!window.confirm('정말로 이 내 집을 삭제하시겠습니까?')) {
      return;
    }
    
    try {
      const token = await getToken();
      if (!token) return;
      
      await deleteMyProperty(propertyId, token);
      
      // 목록에서 제거 (로컬 상태 업데이트)
      const updatedProperties = myProperties.filter(p => p.property_id !== propertyId);
      setMyProperties(updatedProperties);
      
      // 삭제된 내 집이 선택된 내 집이었으면 선택 해제 또는 다음 내 집 선택
      if (selectedPropertyId === propertyId) {
        if (updatedProperties.length > 0) {
          setSelectedPropertyId(updatedProperties[0].property_id);
        } else {
          setSelectedPropertyId(null);
        }
      }
      
      // hover 상태 초기화
      setHoveredPropertyId(null);
      
      // 선택된 내 집 상세 정보 초기화
      if (selectedPropertyId === propertyId) {
        setSelectedPropertyDetail(null);
      }
      
      toast.success('내 집이 삭제되었습니다.');
    } catch (error: any) {
      console.error('Failed to delete property:', error);
      toast.error(error.message || '내 집 삭제에 실패했습니다.');
    }
  };
  
  // 완공년도 추출 (사용하지 않을 수도 있음)
  const getCompletionYear = (useApprovalDate: string | null | undefined): string | null => {
    if (!useApprovalDate) return null;
    try {
      const date = new Date(useApprovalDate);
      return `${date.getFullYear()}년`;
    } catch {
      return null;
    }
  };
  
  // 세대수 포맷팅
  const formatHouseholdCount = (count: number | null | undefined): string | null => {
    if (!count) return null;
    return `${count.toLocaleString()}세대`;
  };
  
  // 변동률 포맷팅 및 색상 설정
  const formatChangeRate = (rate: number | null | undefined): { text: string | null; color: string } => {
    if (rate === null || rate === undefined) {
      return { text: null, color: 'text-white' };
    }
    const sign = rate >= 0 ? '+' : '';
    const text = `${sign}${rate.toFixed(1)}%`;
    const color = rate > 0 ? 'text-green-500' : rate < 0 ? 'text-red-400' : 'text-white';
    return { text, color };
  };

  // 현재 시세 포맷팅 (만원 단위를 억원/천만원 단위로)
  const formatMarketPrice = (price: number | null | undefined): string | null => {
    if (price === null || price === undefined) return null;
    
    // 만원 단위를 원 단위로 변환
    const won = price * 10000;
    
    // 억원 단위
    const eok = Math.floor(won / 100000000);
    // 천만원 단위 (나머지에서 천만원 단위만)
    const cheon = Math.floor((won % 100000000) / 10000000);
    
    let result = '';
    if (eok > 0) {
      result += `${eok}억원`;
    }
    if (cheon > 0) {
      result += ` ${cheon}천만원`;
    } else if (eok === 0) {
      // 억원 단위가 없으면 천만원 단위로 표시
      const cheonFromSmall = Math.floor(won / 10000000);
      if (cheonFromSmall > 0) {
        result = `${cheonFromSmall}천만원`;
      } else {
        // 천만원도 없으면 억원 단위로 표시하지 않고 null 반환
        return null;
      }
    }
    
    return result.trim();
  };

  // 전용면적 포맷팅 (m² 단위)
  const formatExclusiveArea = (area: number | null | undefined): string | null => {
    if (area === null || area === undefined) return null;
    return `${Math.round(area)}m²`;
  };
  
  // 전체 주소 조회 (도로명 주소 또는 지번 주소)
  const getFullAddress = (detail: MyProperty | null): string | null => {
    if (!detail) return null;
    const city = detail.city_name || '';
    const region = detail.region_name || '';
    const address = detail.road_address || detail.jibun_address || '';
    
    // address가 이미 city와 region을 포함하고 있는지 확인
    if (address) {
      // address에 city와 region이 이미 포함되어 있으면 그대로 사용
      if (city && address.includes(city) && region && address.includes(region)) {
        return address;
      }
      // address에 city와 region이 포함되어 있지 않으면 조합
      if (city && region) {
        return `${city} ${region} ${address}`;
      }
      return address;
    }
    
    // address가 없는 경우 city와 region만 사용
    if (city && region) {
      return `${city} ${region}`;
    }
    return null;
  };

  // 마우스 드래그로 스크롤 핸들러 (목록이 4개 이상일 때만 작동)
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollContainerRef.current || myProperties.length < 4) return;
    
    setIsDragging(true);
    setHasMoved(false);
    const rect = scrollContainerRef.current.getBoundingClientRect();
    setStartX(e.pageX - rect.left);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
    
    const target = e.target as HTMLElement;
    const button = target.closest('button');
    if (button) {
      (button as any)._isDragging = false;
      (button as any)._startX = e.pageX;
      (button as any)._startY = e.pageY;
    }
    
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grabbing';
      scrollContainerRef.current.style.userSelect = 'none';
    }
  }, [myProperties.length]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !scrollContainerRef.current || myProperties.length < 4) return;
    
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const x = e.pageX - rect.left;
    const walk = (x - startX) * 2;
    const moveDistance = Math.abs(x - startX);
    
    if (moveDistance > 3) {
      setHasMoved(true);
      e.preventDefault();
      e.stopPropagation();
      scrollContainerRef.current.scrollLeft = scrollLeft - walk;
      
      if (scrollContainerRef.current) {
        const buttons = scrollContainerRef.current.querySelectorAll('button');
        buttons.forEach(btn => {
          (btn as any)._isDragging = true;
        });
      }
    }
  }, [isDragging, startX, scrollLeft, myProperties.length]);

  const handleMouseUp = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grab';
      scrollContainerRef.current.style.userSelect = '';
    }
    
    if (scrollContainerRef.current) {
      const buttons = scrollContainerRef.current.querySelectorAll('button');
      buttons.forEach(btn => {
        (btn as any)._isDragging = false;
      });
    }
    
    setIsDragging(false);
    setHasMoved(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grab';
      scrollContainerRef.current.style.userSelect = '';
      
      const buttons = scrollContainerRef.current.querySelectorAll('button');
      buttons.forEach(btn => {
        (btn as any)._isDragging = false;
      });
    }
    setIsDragging(false);
    setHasMoved(false);
  }, []);

  const cardClass = isDarkMode
    ? 'bg-slate-800/50 shadow-[8px_8px_20px_rgba(0,0,0,0.5),-4px_-4px_12px_rgba(100,100,150,0.05)]'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';
  
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const textMuted = isDarkMode ? 'text-slate-500' : 'text-slate-500';

  return (
    <div className={`w-full flex flex-col ${isDesktop ? 'space-y-8 max-w-4xl mx-auto' : 'space-y-6'}`}>
      {/* User Profile Card */}
      <button
        onClick={onOpenProfileMenu}
        className={`w-full rounded-2xl p-5 transition-all active:scale-[0.98] ${cardClass} hover:shadow-xl`}
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            {isSignedIn && user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={user.firstName || 'User'}
                className="w-16 h-16 rounded-full border-2 border-white dark:border-zinc-950 shadow-lg"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center border-2 border-white dark:border-zinc-950 shadow-lg shadow-sky-500/25">
                <User className="w-8 h-8 text-white" />
              </div>
            )}
            {isSignedIn && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white dark:border-zinc-950 rounded-full"></div>
            )}
          </div>

          <div className="flex-1 text-left">
            {isSignedIn && user ? (
              <>
                <h3 className={`text-lg font-bold ${textPrimary} mb-0.5`}>
                  {user.firstName || user.emailAddresses[0]?.emailAddress || '사용자'}
                </h3>
                <p className={`text-sm ${textSecondary}`}>
                  {user.emailAddresses[0]?.emailAddress || ''}
                </p>
              </>
            ) : (
              <>
                <h3 className={`text-lg font-bold ${textPrimary} mb-0.5`}>로그인이 필요합니다</h3>
                <p className={`text-sm ${textSecondary}`}>프로필을 보려면 로그인하세요</p>
              </>
            )}
          </div>

          <ChevronRight className={`w-6 h-6 ${textSecondary}`} />
        </div>
      </button>

      {/* 내 집 목록 또는 내 집 추가 버튼 */}
      {myProperties.length > 0 ? (
        <div className="mt-5 w-full flex items-center gap-3">
          {/* 스크롤 가능한 내 집 목록 */}
          <div 
            ref={scrollContainerRef}
            className={`flex-1 min-w-0 scrollbar-hide ${
              myProperties.length >= 4 
                ? 'overflow-x-auto cursor-grab' 
                : 'overflow-x-visible'
            } ${isDragging ? 'cursor-grabbing' : ''}`}
            style={{
              ...(myProperties.length >= 4 && { 
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                overflowY: 'hidden',
                position: 'relative'
              })
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={(e) => {
              if (myProperties.length >= 4 && scrollContainerRef.current && !isDragging) {
                if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                  e.preventDefault();
                  scrollContainerRef.current.scrollLeft += e.deltaY || e.deltaX;
                }
              }
            }}
          >
            <div 
              className="flex items-center gap-3 pb-2 flex-nowrap" 
              style={{ 
                minWidth: 'max-content',
                width: 'max-content',
                display: 'inline-flex',
                flexWrap: 'nowrap',
                flexShrink: 0
              }}
            >
              {myProperties.map((property) => {
                const isSelected = selectedPropertyId === property.property_id;
                const isHovered = hoveredPropertyId === property.property_id;
                const displayName = property.apt_name || property.nickname || '내 집';
                
                return (
                  <motion.div
                    key={property.property_id}
                    className="relative flex items-center flex-shrink-0"
                    onMouseEnter={() => setHoveredPropertyId(property.property_id)}
                    onMouseLeave={() => setHoveredPropertyId(null)}
                  >
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={(e) => {
                        if ((e.currentTarget as any)._isDragging || hasMoved) {
                          e.preventDefault();
                          e.stopPropagation();
                          (e.currentTarget as any)._isDragging = false;
                          return;
                        }
                        setSelectedPropertyId(property.property_id);
                      }}
                      className={`flex items-center gap-2 px-4 py-3 rounded-full transition-all whitespace-nowrap flex-shrink-0 ${
                        isSelected
                          ? 'bg-sky-500 text-white shadow-lg'
                          : isDarkMode
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      {isSelected && (
                        <Home className="w-4 h-4" />
                      )}
                      <span className="font-medium text-sm">{displayName}</span>
                    </motion.button>
                    
                    {/* X 버튼 (hover 시 표시) */}
                    {isHovered && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => handleDeleteProperty(property.property_id, e)}
                        className={`absolute -right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-lg bg-transparent ${
                          isSelected
                            ? 'text-white hover:bg-red-500/20'
                            : isDarkMode
                            ? 'text-red-400 hover:bg-red-600/20'
                            : 'text-red-500 hover:bg-red-500/20'
                        }`}
                        title="삭제"
                      >
                        <X className="w-3.5 h-3.5" />
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
          
          {/* 추가 버튼 - 스크롤 컨테이너 밖에 배치 */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (!isSignedIn) {
                onOpenProfileMenu();
                return;
              }
              setIsAddModalOpen(true);
            }}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
              isDarkMode
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            <Plus className="w-5 h-5" />
          </motion.button>
        </div>
      ) : (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`w-full rounded-2xl p-6 transition-all mt-5 ${cardClass} hover:shadow-xl border-2 border-dashed ${
            isDarkMode 
              ? 'border-slate-600 hover:border-sky-500/50' 
              : 'border-sky-200 hover:border-sky-400'
          }`}
          onClick={() => {
            if (!isSignedIn) {
              onOpenProfileMenu();
              return;
            }
            setIsAddModalOpen(true);
          }}
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <div className={`p-4 rounded-full ${
              isDarkMode 
                ? 'bg-sky-500/20 text-sky-400' 
                : 'bg-sky-100 text-sky-600'
            }`}>
              <Plus className="w-8 h-8" />
            </div>
            <h3 className={`text-lg font-bold ${textPrimary}`}>내 집 추가</h3>
            <p className={`text-sm ${textSecondary} text-center`}>
              내 집을 추가하여 관리하세요
            </p>
          </div>
        </motion.button>
      )}

      {/* 선택된 내 집 상세 카드 */}
      {selectedPropertyDetail && selectedPropertyId && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0 }}
            className={`mt-5 w-full rounded-2xl p-6 shadow-xl ${isDarkMode ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50' : 'bg-white border border-sky-100'} ${onApartmentClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
            onClick={() => {
              if (onApartmentClick && selectedPropertyDetail.apt_id) {
                onApartmentClick({
                  apt_id: selectedPropertyDetail.apt_id,
                  id: selectedPropertyDetail.apt_id,
                  apt_name: selectedPropertyDetail.apt_name || selectedPropertyDetail.nickname || '내 집',
                  name: selectedPropertyDetail.apt_name || selectedPropertyDetail.nickname || '내 집',
                  address: getFullAddress(selectedPropertyDetail) || '',
                });
              }
            }}
          >
            {/* 상단: 아파트명 및 주소 */}
            <div className="flex items-start gap-4 mb-6">
              <div className={`p-3 rounded-xl flex-shrink-0 flex items-center justify-center h-[48px] ${isDarkMode ? 'bg-slate-700/50' : 'bg-sky-100'}`}>
                <Home className={`w-6 h-6 ${isDarkMode ? 'text-white' : 'text-sky-600'}`} />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className={`text-xl font-bold mb-2 truncate ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                  {(() => {
                    const aptName = selectedPropertyDetail.apt_name || '내 집';
                    const nickname = selectedPropertyDetail.nickname;
                    if (nickname && nickname !== aptName) {
                      return (
                        <>
                          {aptName} <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>({nickname})</span>
                        </>
                      );
                    }
                    return aptName;
                  })()}
                </h3>
                {getFullAddress(selectedPropertyDetail) && (
                  <div className="flex items-center gap-2 -mt-[3px]">
                    <MapPin className="w-4 h-4 text-sky-400 flex-shrink-0" />
                    <p className={`text-sm leading-none ${textSecondary}`}>{getFullAddress(selectedPropertyDetail)}</p>
                  </div>
                )}
              </div>
              
              {/* 버튼 그룹 - 햄버거 버튼과 쓰레기통 버튼 */}
              <div className="flex items-center gap-2">
                {/* 쓰레기통 버튼 */}
                {selectedPropertyId && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProperty(selectedPropertyId, e);
                    }}
                    className={`p-3 rounded-xl flex-shrink-0 flex items-center justify-center transition-colors h-[48px] w-[48px] ${isDarkMode ? 'bg-slate-700/50 hover:bg-slate-700/70' : 'bg-sky-100 hover:bg-sky-200'}`}
                  >
                    <Trash2 className={`w-6 h-6 ${isDarkMode ? 'text-white' : 'text-sky-600'}`} />
                  </motion.button>
                )}
                
                {/* 햄버거 버튼 */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMemoCard(!showMemoCard);
                  }}
                  className={`p-3 rounded-xl flex-shrink-0 flex items-center justify-center transition-colors h-[48px] w-[48px] ${isDarkMode ? 'bg-slate-700/50 hover:bg-slate-700/70' : 'bg-sky-100 hover:bg-sky-200'}`}
                >
                  <Menu className={`w-6 h-6 ${isDarkMode ? 'text-white' : 'text-sky-600'}`} />
                </motion.button>
              </div>
            </div>
            
            {/* 메모 카드 (햄버거 버튼 클릭 시 표시) */}
            {showMemoCard && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className={`mb-3 w-full rounded-2xl p-6 shadow-xl ${isDarkMode ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50' : 'bg-white border border-sky-100'}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-xl flex-shrink-0 ${isDarkMode ? 'bg-slate-700/50' : 'bg-sky-100'}`}>
                    <FileText className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                  </div>
                  <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>메모</h3>
                </div>

                <div className="space-y-3">
                  <textarea
                    value={memoText}
                    onChange={(e) => setMemoText(e.target.value)}
                    placeholder="메모를 작성하세요..."
                    className={`w-full min-h-[120px] p-4 rounded-xl border resize-none transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/50 ${
                      isDarkMode
                        ? 'bg-slate-800/50 border-slate-700 text-white placeholder-slate-500'
                        : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'
                    }`}
                    rows={5}
                  />
                  
                  <div className="flex justify-end">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSaveMemo}
                      disabled={isSavingMemo}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                        isSavingMemo
                          ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                          : 'bg-sky-500 text-white hover:bg-sky-600'
                      }`}
                    >
                      <Save className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {isSavingMemo ? '저장 중...' : '저장'}
                      </span>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
            
            {/* 하단: 3개 정보 카드 */}
            <div className="grid grid-cols-3 gap-3">
              <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-slate-700/50 border-slate-600/50' : 'bg-sky-50 border-sky-100'}`}>
                <Calendar className={`w-5 h-5 mb-2 ${isDarkMode ? 'text-white' : 'text-sky-600'}`} />
                <p className={`text-xs mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>완공년도</p>
                <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                  {getCompletionYear(selectedPropertyDetail.use_approval_date) || '-'}
                </p>
              </div>
              
              <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-slate-700/50 border-slate-600/50' : 'bg-sky-50 border-sky-100'}`}>
                <Building2 className={`w-5 h-5 mb-2 ${isDarkMode ? 'text-white' : 'text-sky-600'}`} />
                <p className={`text-xs mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>세대수</p>
                <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                  {formatHouseholdCount(selectedPropertyDetail.total_household_cnt) || '-'}
                </p>
              </div>
              
              <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-slate-700/50 border-slate-600/50' : 'bg-sky-50 border-sky-100'}`}>
                <TrendingUp className={`w-5 h-5 mb-2 ${isDarkMode ? 'text-white' : 'text-sky-600'}`} />
                <p className={`text-xs mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>변동률</p>
                {(transactionsData?.change_summary?.change_rate !== undefined || (selectedPropertyDetail.index_change_rate !== null && selectedPropertyDetail.index_change_rate !== undefined)) ? (
                  <p className={`text-sm font-bold ${
                    (() => {
                      const changeRate = transactionsData?.change_summary?.change_rate ?? selectedPropertyDetail.index_change_rate ?? 0;
                      return changeRate > 0
                        ? 'text-green-500'
                        : changeRate < 0
                        ? 'text-red-400'
                        : isDarkMode ? 'text-white' : 'text-slate-800';
                    })()
                  }`}>
                    {(() => {
                      if (transactionsData?.change_summary?.change_rate !== undefined) {
                        const rate = transactionsData.change_summary.change_rate;
                        return `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
                      } else if (selectedPropertyDetail.index_change_rate !== null && selectedPropertyDetail.index_change_rate !== undefined) {
                        return formatChangeRate(selectedPropertyDetail.index_change_rate).text;
                      }
                      return '-';
                    })()}
                  </p>
                ) : (
                  <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>-</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* 현재 시세 카드 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`mt-5 w-full rounded-2xl p-6 relative overflow-hidden cursor-pointer hover:opacity-90 transition-opacity ${isDarkMode ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50' : 'bg-white border border-sky-100 shadow-xl'}`}
            onClick={() => setShowRecentTransactions(!showRecentTransactions)}
          >
            <div className="absolute bottom-6 right-6">
              <ChevronDown 
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                  showRecentTransactions ? 'rotate-180' : ''
                }`}
              />
            </div>

            <p className={`text-sm mb-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {(() => {
                // 아파트 상세정보 화면과 동일하게 최근 거래가 우선 사용
                const recentPrice = transactionsData?.recent_transactions?.[0]?.price;
                if (recentPrice) {
                  return '현재 시세 (최근 거래가)';
                }
                
                const marketPrice = formatMarketPrice(selectedPropertyDetail.most_common_area_avg_price) || formatMarketPrice(selectedPropertyDetail.current_market_price);
                const exclusiveArea = formatExclusiveArea(selectedPropertyDetail.most_common_exclusive_area) || formatExclusiveArea(selectedPropertyDetail.exclusive_area);
                
                if (marketPrice && exclusiveArea) {
                  return `현재 시세 (${exclusiveArea} 기준)`;
                } else {
                  return '현재 시세';
                }
              })()}
            </p>

            <h2 className={`text-3xl font-bold mb-3 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
              {(() => {
                // 아파트 상세정보 화면과 동일하게 최근 거래가 우선 사용
                const recentPrice = transactionsData?.recent_transactions?.[0]?.price;
                if (recentPrice) {
                  return recentPrice >= 10000 
                    ? `${(recentPrice / 10000).toFixed(1)}억원`
                    : `${recentPrice.toLocaleString()}만원`;
                }
                
                // 최근 거래가가 없으면 기존 방식 사용
                return formatMarketPrice(selectedPropertyDetail.most_common_area_avg_price) 
                  || formatMarketPrice(selectedPropertyDetail.current_market_price) 
                  || '정보 없음';
              })()}
            </h2>

            {selectedPropertyDetail.index_change_rate !== null && selectedPropertyDetail.index_change_rate !== undefined && (
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <p className="text-sm text-green-500">
                  이번 달 변동 {formatChangeRate(selectedPropertyDetail.index_change_rate).text}
                </p>
              </div>
            )}
          </motion.div>

          {/* 최근 거래 내역 (클릭 시 표시) */}
          {showRecentTransactions && transactionsData?.recent_transactions && transactionsData.recent_transactions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className={`mt-3 w-full rounded-2xl p-6 relative overflow-hidden ${isDarkMode ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50' : 'bg-white border border-sky-100 shadow-lg'}`}
            >
              <div className="flex items-center gap-2 mb-4">
                <Calendar className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                <div>
                  <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>최근 거래 내역</h3>
                  <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    최근 {Math.min(transactionsData.recent_transactions.length, 5)}건
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {transactionsData.recent_transactions.slice(0, 5).map((transaction, index) => (
                  <div
                    key={transaction.trans_id || index}
                    className={`p-4 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800' : 'bg-sky-50 border-sky-100 hover:bg-sky-100'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-sky-100 text-sky-700'}`}>
                            {transaction.date ? new Date(transaction.date).toLocaleDateString('ko-KR', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            }) : '날짜 미상'}
                          </span>
                          {transaction.floor && (
                            <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {transaction.floor}층
                            </span>
                          )}
                          {transaction.area && (
                            <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {transaction.area.toFixed(2)}㎡ ({Math.round(transaction.area * 0.3025 * 10) / 10}평)
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                            {transaction.price ? `${(transaction.price / 10000).toLocaleString()}억` : '가격 정보 없음'}
                          </span>
                          {transaction.price_per_pyeong && (
                            <span className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              ({transaction.price_per_pyeong.toLocaleString()}만원/평)
                            </span>
                          )}
                        </div>
                        {transaction.trans_type && (
                          <div className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            거래 유형: {transaction.trans_type === '중도금지급' ? '중도금지급' : transaction.trans_type}
                          </div>
                        )}
                      </div>
                      {transaction.is_canceled && (
                        <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">
                          취소
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* 모든 면적 그룹별 평균 가격 목록 (클릭 시 표시) */}
          {showAllAreaGroups && selectedPropertyDetail.all_area_groups && selectedPropertyDetail.all_area_groups.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`mt-3 w-full rounded-2xl p-6 relative overflow-hidden ${isDarkMode ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50' : 'bg-white border border-sky-100 shadow-lg'}`}
            >
              <p className={`text-sm mb-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>면적별 평균 가격</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedPropertyDetail.all_area_groups.map((group, index) => (
                  <div
                    key={index}
                    className={`rounded-xl p-4 border ${isDarkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-sky-50 border-sky-100'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {Math.round(group.pyeong)}평 ({Math.round(group.exclusive_area_m2)}m²)
                      </p>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {group.transaction_count}건
                      </p>
                    </div>
                    <p className={`text-2xl font-bold ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
                      {formatMarketPrice(group.avg_price)}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* AI 칭찬글 카드 */}
          {selectedPropertyDetail && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={`mt-5 w-full rounded-2xl p-6 shadow-xl ${isDarkMode ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50' : 'bg-white border border-sky-100'}`}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className={`p-3 rounded-xl flex-shrink-0 ${isDarkMode ? 'bg-slate-700/50' : 'bg-sky-100'}`}>
                  <Sparkles className={`w-6 h-6 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                </div>
                
                <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>AI 칭찬글</h3>
              </div>

              {isLoadingCompliment ? (
                <div className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>AI 칭찬글을 생성하는 중...</div>
              ) : propertyCompliment ? (
                <div className={`text-sm leading-relaxed whitespace-pre-line ${isDarkMode ? 'text-white' : 'text-slate-700'}`}>
                  {propertyCompliment.split('\n\n').map((paragraph, index) => (
                    <p key={index} className="mb-3 last:mb-0">
                      {paragraph.split(/(교통|접근성|편의성|가격|투자|지역|인프라|GTX|지하철역|공원|학교|상권|환경|안전|주거|생활)/).map((part, i) => {
                        const highlightKeywords = [
                          '교통', '접근성', '편의성', '가격', '투자', '지역', '인프라',
                          'GTX', '지하철역', '공원', '학교', '상권', '환경', '안전', '주거', '생활'
                        ];
                        const shouldHighlight = highlightKeywords.some(keyword => part.includes(keyword));
                        
                        return shouldHighlight ? (
                          <span key={i} className={`font-medium ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>{part}</span>
                        ) : (
                          <span key={i}>{part}</span>
                        );
                      })}
                    </p>
                  ))}
                </div>
              ) : (
                <div className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  <p>AI 칭찬글을 불러올 수 없습니다.</p>
                  <p className={`text-xs mt-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    AI 서비스가 일시적으로 사용 불가능할 수 있습니다.
                  </p>
                </div>
              )}
            </motion.div>
          )}


          {/* 뉴스 카드 */}
          {selectedPropertyDetail && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className={`mt-5 w-full rounded-2xl p-6 shadow-xl ${isDarkMode ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50' : 'bg-white border border-sky-100'}`}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 rounded-xl flex-shrink-0 ${isDarkMode ? 'bg-slate-700/50' : 'bg-sky-100'}`}>
                  <Newspaper className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                </div>
                <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>관련 뉴스</h3>
              </div>

              {isLoadingNews ? (
                <div className={`h-[200px] flex items-center justify-center text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  뉴스를 불러오는 중...
                </div>
              ) : newsData.length > 0 ? (
                <div className="space-y-3">
                  {newsData.map((news) => (
                    <a
                      key={news.id}
                      href={news.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block p-4 rounded-xl border transition-all group ${isDarkMode ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800' : 'bg-sky-50 border-sky-100 hover:bg-sky-100'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs px-2 py-1 rounded ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-sky-100 text-sky-700'}`}>
                              {news.source}
                            </span>
                            <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {formatTimeAgo(news.published_at)}
                            </span>
                          </div>
                          <h4 className={`text-sm font-semibold mb-1 line-clamp-2 transition-colors ${isDarkMode ? 'text-white group-hover:text-sky-400' : 'text-slate-800 group-hover:text-sky-600'}`}>
                            {news.title}
                          </h4>
                          {news.content && (
                            <p className={`text-xs line-clamp-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {news.content.replace(/\s+/g, ' ').trim()}
                            </p>
                          )}
                        </div>
                        <ExternalLink className={`w-4 h-4 flex-shrink-0 mt-1 transition-colors ${isDarkMode ? 'text-slate-400 group-hover:text-sky-400' : 'text-slate-400 group-hover:text-sky-600'}`} />
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className={`h-[200px] flex items-center justify-center text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  관련 뉴스가 없습니다.
                </div>
              )}
            </motion.div>
          )}

        </>
      )}

      {/* 내 집 추가 모달 */}
      <AddMyPropertyModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        isDarkMode={isDarkMode}
        onSuccess={handlePropertyAdded}
      />
      
      {/* Toast Container */}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} isDarkMode={isDarkMode} />
    </div>
  );
}
