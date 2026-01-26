import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, ArrowRightLeft, PieChart, Search, LogOut, X, Sparkles, Moon, Sun, QrCode, LogIn, TrendingUp, FileText, Building2, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SignInButton, SignUpButton, SignedIn, SignedOut, useUser, useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
import { ViewType, TabItem } from '../types';
import { setAuthToken, fetchTrendingApartments, searchApartments, aiSearchApartments, type TrendingApartmentItem, type ApartmentSearchItem, type AISearchApartment, type AISearchCriteria } from '../services/api';
import { PercentileBadge } from './ui/PercentileBadge';
import { getInstallPrompt, showInstallPrompt, isWebView, isPWAInstalled } from '../utils/pwa';

interface LayoutProps {
  children: React.ReactNode;
  currentView?: ViewType;
  onChangeView?: (view: ViewType) => void;
  onStatsCategoryChange?: (category: 'demand' | 'supply' | 'ranking') => void;
  isDetailOpen?: boolean;
  isDockVisible?: boolean;
}

const tabs: TabItem[] = [
  { id: 'dashboard', label: '홈', icon: Home },
  { id: 'map', label: '지도', icon: Compass },
  { id: 'compare', label: '비교', icon: ArrowRightLeft },
  { id: 'stats', label: '통계', icon: PieChart },
];

const Logo = ({ className = "" }: { className?: string }) => (
    <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-2xl font-black tracking-tight font-sans bg-gradient-to-r from-purple-700 via-blue-500 to-teal-500 bg-clip-text text-transparent">
            SweetHome
        </span>
    </div>
);

// Search Overlay Component - Centered Popup for PC
const SearchOverlay = ({ isOpen, onClose, isDarkMode }: { isOpen: boolean; onClose: () => void; isDarkMode?: boolean }) => {
    const [isAiMode, setIsAiMode] = useState(false);
    const [trendingApartments, setTrendingApartments] = useState<TrendingApartmentItem[]>([]);
    const [isLoadingTrending, setIsLoadingTrending] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ApartmentSearchItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [aiResponse, setAiResponse] = useState<string>('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const navigate = useNavigate();
    
    // 인기 아파트 로드 함수
    const loadTrendingApartments = async () => {
        setIsLoadingTrending(true);
        try {
            const response = await fetchTrendingApartments(5);
            setTrendingApartments(response.data.apartments);
        } catch (error) {
            console.error('Failed to load trending apartments:', error);
        } finally {
            setIsLoadingTrending(false);
        }
    };
    
    // 최근 검색어 저장
    const saveRecentSearch = (query: string) => {
        if (!query.trim() || query.trim().length < 2) return;
        const trimmedQuery = query.trim();
        setRecentSearches(prev => {
            const updated = [trimmedQuery, ...prev.filter(s => s !== trimmedQuery)].slice(0, 5);
            localStorage.setItem('sweethome-recent-searches', JSON.stringify(updated));
            return updated;
        });
    };
    
    // 최근 검색어 삭제
    const removeRecentSearch = (query: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setRecentSearches(prev => {
            const updated = prev.filter(s => s !== query);
            localStorage.setItem('sweethome-recent-searches', JSON.stringify(updated));
            return updated;
        });
    };
    
    // 최근 검색어 로드
    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem('sweethome-recent-searches');
            if (saved) {
                try {
                    setRecentSearches(JSON.parse(saved));
                } catch (e) {
                    setRecentSearches([]);
                }
            }
        }
    }, [isOpen]);
    
    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            // 인기 아파트 로드
            loadTrendingApartments();
        } else {
            document.body.style.overflow = '';
            // 모달 닫을 때 검색 상태 초기화
            setSearchQuery('');
            setSearchResults([]);
            setHasSearched(false);
            setIsAiMode(false);
            setAiResponse('');
            setIsAiLoading(false);
        }
        return () => {
            document.body.style.overflow = '';
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleSearch = async (query?: string, saveToRecent: boolean = true) => {
        const searchTerm = query ?? searchQuery;
        if (!searchTerm.trim()) {
            // 검색어가 비어있으면 초기 화면으로
            setHasSearched(false);
            setSearchResults([]);
            return;
        }
        
        // 검색어가 2글자 미만이면 검색하지 않음 (백엔드 요구사항)
        if (searchTerm.trim().length < 2) {
            setHasSearched(true);
            setSearchResults([]);
            return;
        }
        
        // 최근 검색어에 저장 (Enter 또는 클릭 시에만)
        if (saveToRecent && searchTerm.trim().length >= 2) {
            saveRecentSearch(searchTerm);
        }
        
        setIsSearching(true);
        setHasSearched(true);
        try {
            const response = await searchApartments(searchTerm.trim(), 20);
            if (response && response.data && response.data.results) {
                setSearchResults(response.data.results);
            } else {
                setSearchResults([]);
            }
        } catch (error) {
            console.error('검색 실패:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    // 검색어 변경 시 실시간 검색 (디바운스 적용 - 입력이 끝난 후 검색)
    useEffect(() => {
        if (!searchQuery.trim()) {
            setHasSearched(false);
            setSearchResults([]);
            return;
        }
        
        // 2글자 미만이면 검색하지 않음
        if (searchQuery.trim().length < 2) {
            setHasSearched(false);
            setSearchResults([]);
            return;
        }
        
        // 입력이 끝난 후 500ms 후에 검색 실행 (최적화)
        const debounceTimer = setTimeout(() => {
            handleSearch(searchQuery, false); // 실시간 검색 시에는 최근 검색어에 저장하지 않음
        }, 500);
        
        return () => clearTimeout(debounceTimer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (isAiMode) {
                handleAiSearch(searchQuery);
            } else {
                handleSearch(searchQuery, true); // Enter 시에만 최근 검색어에 저장
            }
        }
    };

    // AI 검색 결과 상태
    const [aiSearchResults, setAiSearchResults] = useState<AISearchApartment[]>([]);
    const [aiCriteria, setAiCriteria] = useState<AISearchCriteria | null>(null);

    // AI 검색 함수 - 실제 Gemini API 호출
    const handleAiSearch = async (query: string) => {
        if (!query.trim() || query.trim().length < 5) {
            setAiResponse('검색어를 5글자 이상 입력해주세요.\n예: "강남 30평대 10억 이하"');
            setHasSearched(true);
            return;
        }
        
        setIsAiLoading(true);
        setHasSearched(true);
        setAiResponse('');
        setAiSearchResults([]);
        setAiCriteria(null);
        
        try {
            const response = await aiSearchApartments(query);
            
            if (response.success && response.data) {
                const { criteria, apartments, count, total } = response.data;
                setAiCriteria(criteria);
                setAiSearchResults(apartments);
                
                // AI 응답 메시지 생성
                let responseText = `**AI 검색 결과**\n\n`;
                
                // 파싱된 조건 표시
                if (criteria.location) {
                    responseText += `**지역:** ${criteria.location}\n`;
                }
                if (criteria.min_area || criteria.max_area) {
                    const minPyeong = criteria.min_area ? Math.round(criteria.min_area / 3.3) : null;
                    const maxPyeong = criteria.max_area ? Math.round(criteria.max_area / 3.3) : null;
                    if (minPyeong && maxPyeong) {
                        responseText += `**평수:** ${minPyeong}평 ~ ${maxPyeong}평\n`;
                    } else if (minPyeong) {
                        responseText += `**평수:** ${minPyeong}평 이상\n`;
                    } else if (maxPyeong) {
                        responseText += `**평수:** ${maxPyeong}평 이하\n`;
                    }
                }
                if (criteria.min_price || criteria.max_price) {
                    const formatPrice = (price: number) => {
                        if (price >= 10000) return `${(price / 10000).toFixed(1)}억`;
                        return `${price}만원`;
                    };
                    if (criteria.min_price && criteria.max_price) {
                        responseText += `**가격:** ${formatPrice(criteria.min_price)} ~ ${formatPrice(criteria.max_price)}\n`;
                    } else if (criteria.min_price) {
                        responseText += `**가격:** ${formatPrice(criteria.min_price)} 이상\n`;
                    } else if (criteria.max_price) {
                        responseText += `**가격:** ${formatPrice(criteria.max_price)} 이하\n`;
                    }
                }
                if (criteria.subway_max_distance_minutes) {
                    responseText += `**지하철:** ${criteria.subway_max_distance_minutes}분 이내\n`;
                }
                if (criteria.has_education_facility) {
                    responseText += `**학교:** 근처 학교 있음\n`;
                }
                
                responseText += `\n`;
                
                if (apartments.length > 0) {
                    responseText += `**${total}개 아파트** 중 ${count}개를 찾았습니다.\n\n`;
                    responseText += `아래 목록에서 원하는 아파트를 선택하세요.`;
                } else {
                    responseText += `조건에 맞는 아파트를 찾지 못했습니다.\n\n`;
                    responseText += `**Tip:** 조건을 완화하거나 다른 지역을 검색해보세요.`;
                }
                
                setAiResponse(responseText);
            } else {
                setAiResponse('🤖 검색 결과를 가져오는데 실패했습니다. 다시 시도해주세요.');
            }
        } catch (error: unknown) {
            console.error('AI 검색 실패:', error);
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            if (errorMessage.includes('GEMINI_API_KEY') || errorMessage.includes('503')) {
                setAiResponse('⚠️ AI 서비스가 일시적으로 사용 불가능합니다.\n\n일반 검색을 이용해주세요.');
            } else {
                setAiResponse(`❌ AI 검색 중 오류가 발생했습니다.\n\n${errorMessage}`);
            }
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleApartmentClick = (aptId: number | string) => {
        onClose();
        navigate(`/property/${aptId}`);
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center md:items-start md:justify-end md:pt-16 md:pr-8 animate-fade-in">
            {/* Backdrop with Blur */}
            <div 
                className="absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity" 
                onClick={onClose}
            ></div>

            {/* Modal Container - Full screen on Mobile, Popup on PC */}
            <div className={`relative w-full h-full md:h-[520px] md:max-w-sm bg-white dark:bg-slate-800 md:rounded-2xl shadow-2xl overflow-hidden flex flex-col md:mt-2 ${isDarkMode ? 'dark' : ''}`}>
                <div className="p-4 flex flex-col h-full">
                    {/* Search Header */}
                    <div className="flex items-center gap-2 mb-3 flex-shrink-0 pt-safe md:pt-0">
                        <div className={`relative flex-1 flex items-center h-12 md:h-11 px-4 rounded-xl border-2 transition-all duration-700 ${
                            isSearching || isAiLoading 
                                ? 'border-transparent bg-clip-padding ring-[2.5px] ring-indigo-400/40 shadow-[0_0_20px_rgba(129,140,248,0.3),0_0_40px_rgba(167,139,250,0.2)]' 
                                : isAiMode 
                                    ? 'border-indigo-400 dark:border-indigo-500 bg-white dark:bg-slate-800' 
                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700'
                        }`}>
                            {/* AI Search Gradient Border Effect (Apple Intelligence Style - Slow & Fluid) */}
                            {(isSearching || isAiLoading) && (
                                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-400 via-purple-400 via-blue-400 to-indigo-400 opacity-50 -z-10 animate-shimmer-slow" style={{backgroundSize: '200% 100%'}}></div>
                            )}
                            {isAiMode ? (
                                <Sparkles className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                            ) : (
                                <Search className="w-4 h-4 text-slate-400 dark:text-slate-400" />
                            )}
                            <input 
                                type="text" 
                                placeholder={isAiMode ? "AI에게 물어보세요..." : "검색어 입력 (2글자 이상)"} 
                                className="flex-1 ml-2 bg-transparent border-none focus:ring-0 focus:outline-none focus:border-none text-[14px] font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 h-full"
                                autoFocus
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                            <button 
                                onClick={() => {
                                    setIsAiMode(!isAiMode);
                                    if (!isAiMode) {
                                        setHasSearched(false);
                                        setSearchQuery('');
                                    }
                                }}
                                className={`p-1.5 rounded-lg transition-all focus:outline-none ${isAiMode ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                <Sparkles className="w-4 h-4" />
                            </button>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-400 transition-colors flex-shrink-0"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* 최근 검색 - 검색 입력 필드와 검색 결과 사이 */}
                    {!isAiMode && !hasSearched && recentSearches.length > 0 && (
                        <div className="mb-4 flex-shrink-0">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-[14px] font-bold text-slate-500 dark:text-slate-400">최근 검색</h3>
                                <button
                                    onClick={() => {
                                        setRecentSearches([]);
                                        localStorage.removeItem('sweethome-recent-searches');
                                    }}
                                    className="text-[12px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                >
                                    전체삭제
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {recentSearches.map((search, index) => (
                                    <div
                                        key={index}
                                        className="group relative flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-pointer active:scale-95"
                                        onClick={() => {
                                            setSearchQuery(search);
                                            handleSearch(search);
                                        }}
                                    >
                                        <span className="text-[14px] font-medium text-slate-700 dark:text-slate-200">{search}</span>
                                        <button
                                            onClick={(e) => removeRecentSearch(search, e)}
                                            className="ml-1 p-1 -mr-2 hover:bg-slate-300 dark:hover:bg-slate-500 rounded-full transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 검색 결과 - 입력 필드 바로 아래 */}
                    {!isAiMode && hasSearched && (
                        <div className="flex-1 flex flex-col min-h-0 mb-4">
                            <div className="flex justify-between items-end mb-3 flex-shrink-0">
                                <h3 className="text-[15px] font-black text-slate-900 dark:text-white">검색 결과</h3>
                                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                                    {searchResults.length}개 결과
                                </span>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar min-h-0">
                                {isSearching ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                                    </div>
                                ) : searchResults.length > 0 ? (
                                    searchResults.map((apt) => (
                                        <div 
                                            key={apt.apt_id} 
                                            className="flex items-center justify-between group cursor-pointer p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                            onClick={() => handleApartmentClick(apt.apt_id)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 flex items-center justify-center">
                                                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">{apt.apt_name.charAt(0)}</span>
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-900 dark:text-white text-[15px] block">{apt.apt_name}</span>
                                                    {apt.address && (
                                                        <span className="text-[12px] text-slate-500 dark:text-slate-400">{apt.address}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-[14px]">
                                        "{searchQuery}"에 대한 검색 결과가 없습니다.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* AI Mode - 검색 결과 */}
                    {isAiMode && hasSearched && (
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                            {isAiLoading ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                                    <p className="text-[14px] text-slate-500 dark:text-slate-400 font-medium">AI가 분석 중입니다...</p>
                                </div>
                            ) : aiResponse ? (
                                <div className="space-y-4">
                                    {/* 사용자 질문 */}
                                    <div className="flex justify-end">
                                        <div className="bg-indigo-500 text-white px-4 py-2 rounded-2xl rounded-tr-sm max-w-[80%]">
                                            <p className="text-[13px] font-medium">{searchQuery}</p>
                                        </div>
                                    </div>
                                    {/* AI 응답 */}
                                    <div className="flex gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                            <Sparkles className="w-4 h-4 text-white" />
                                        </div>
                                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 px-4 py-3 rounded-2xl rounded-tl-sm">
                                            <div className="text-[13px] text-slate-700 dark:text-slate-200 font-medium whitespace-pre-line leading-relaxed">
                                                {aiResponse.split('\n').map((line, idx) => (
                                                    <span key={idx}>
                                                        {line.split(/(\*\*[^*]+\*\*)/).map((part, partIdx) => {
                                                            if (part.startsWith('**') && part.endsWith('**')) {
                                                                return <strong key={partIdx} className="font-black text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
                                                            }
                                                            return part;
                                                        })}
                                                        {idx < aiResponse.split('\n').length - 1 && <br />}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* AI 검색 결과 아파트 목록 */}
                                    {aiSearchResults.length > 0 && (
                                        <div className="mt-4 space-y-2">
                                            {aiSearchResults.slice(0, 5).map((apt) => (
                                                <div 
                                                    key={apt.apt_id} 
                                                    className="flex items-center justify-between group cursor-pointer p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-sm transition-all"
                                                    onClick={() => handleApartmentClick(apt.apt_id)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full overflow-hidden bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center">
                                                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{apt.apt_name.charAt(0)}</span>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="font-bold text-slate-900 dark:text-white text-[13px] block truncate">{apt.apt_name}</span>
                                                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                                                {apt.address && <span className="truncate">{apt.address}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex-shrink-0 ml-2">
                                                        {apt.average_price && (
                                                            <span className="text-[12px] font-bold text-indigo-600 dark:text-indigo-400">
                                                                {apt.average_price >= 10000 
                                                                    ? `${(apt.average_price / 10000).toFixed(1)}억` 
                                                                    : `${apt.average_price}만`}
                                                            </span>
                                                        )}
                                                        {apt.exclusive_area && (
                                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block">
                                                                {Math.round(apt.exclusive_area / 3.3)}평
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    
                                    {/* 새 질문 버튼 */}
                                    <button
                                        onClick={() => {
                                            setHasSearched(false);
                                            setAiResponse('');
                                            setSearchQuery('');
                                            setAiSearchResults([]);
                                            setAiCriteria(null);
                                        }}
                                        className="w-full mt-4 py-2 text-[13px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                    >
                                        + 새로운 질문하기
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* AI Mode UI - 초기 화면 */}
                    {isAiMode && !hasSearched && (
                        <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                            <div className="text-center py-2">
                                <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">
                                    무엇을 도와드릴까요?
                                </h2>
                                <p className="text-[12px] text-slate-500 dark:text-slate-400 font-medium">
                                    AI가 부동산 데이터를 분석해드립니다
                                </p>
                            </div>
                            
                            {/* 추천 질문 카드들 */}
                            <div className="space-y-2">
                                {[
                                    { 
                                        icon: TrendingUp, 
                                        text: '강남구 30평대 아파트',
                                        query: '강남구 30평대 아파트'
                                    },
                                    { 
                                        icon: FileText, 
                                        text: '5억 이하 신축 아파트',
                                        query: '5억 이하 신축 아파트'
                                    },
                                    { 
                                        icon: Building2, 
                                        text: '근처에 학군이 있는 아파트',
                                        query: '학군 좋은 아파트'
                                    },
                                    { 
                                        icon: Compass, 
                                        text: '지하철역 5분 이내',
                                        query: '지하철역 5분 이내'
                                    },
                                ].map((item, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            setSearchQuery(item.query);
                                            handleAiSearch(item.query);
                                        }}
                                        className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all group"
                                    >
                                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
                                            <item.icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <span className="flex-1 text-[13px] font-bold text-slate-900 dark:text-white">
                                            {item.text}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Content - Scrollable (인기 아파트, 추천 검색 등) */}
                    {!isAiMode && !hasSearched && (
                        <div className="flex-1 space-y-8 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                                {/* Popular/Trending Apartments - 검색 결과가 없을 때만 표시 */}
                                <section>
                                    <div className="flex justify-between items-end mb-3">
                                        <h3 className="text-[15px] font-black text-slate-900 dark:text-white">인기 아파트</h3>
                                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">거래량 기준</span>
                                    </div>
                                    <div className="space-y-2">
                                        {isLoadingTrending ? (
                                            <div className="flex items-center justify-center py-8">
                                                <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                                            </div>
                                        ) : trendingApartments.length > 0 ? (
                                            trendingApartments.map((apt, i) => (
                                                <div 
                                                    key={apt.apt_id} 
                                                    className="flex items-center justify-between group cursor-pointer p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                                    onClick={() => handleApartmentClick(apt.apt_id)}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <span className={`w-4 text-center font-black text-[15px] ${i < 3 ? 'text-brand-blue dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>{i + 1}</span>
                                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-600 border border-slate-100 dark:border-slate-600 flex items-center justify-center">
                                                            <span className="text-[11px] font-bold text-slate-500">{apt.apt_name.charAt(0)}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-slate-900 dark:text-white text-[15px] block">{apt.apt_name}</span>
                                                            {apt.address && (
                                                                <span className="text-[12px] text-slate-500 dark:text-slate-400">{apt.address}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {apt.transaction_count && (
                                                        <span className="text-[13px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                                                            {apt.transaction_count}건
                                                        </span>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-[14px]">
                                                인기 아파트 데이터를 불러올 수 없습니다.
                                            </div>
                                        )}
                                    </div>
                                </section>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const Layout: React.FC<LayoutProps> = ({ children, currentView, onChangeView, onStatsCategoryChange, isDetailOpen = false, isDockVisible = true }) => {
  const [scrolled, setScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isStatsDropdownOpen, setIsStatsDropdownOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // localStorage에서 저장된 설정을 불러옴 (브라우저 설정 무시)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sweethome-dark-mode');
      return saved === 'true';
    }
    return false;
  });
  const [isQROpen, setIsQROpen] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);
  
  // Clerk 인증 훅 사용
  // 주의: 이 컴포넌트는 ClerkProvider 안에서만 사용되어야 합니다
  // index.tsx에서 ClerkProvider가 없을 때는 이 컴포넌트가 렌더링되지 않도록 처리됨
  const { isLoaded: isClerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { getToken } = useClerkAuth();
  const { signOut } = useClerk();
  
  const location = useLocation();
  const navigate = useNavigate();

  // PWA 설치 버튼 표시 여부 확인
  useEffect(() => {
    // WebView나 이미 설치된 경우 버튼 숨김
    if (isWebView() || isPWAInstalled()) {
      setShowInstallButton(false);
      return;
    }

    // 설치 프롬프트가 있는지 확인
    const checkInstallPrompt = () => {
      const prompt = getInstallPrompt();
      setShowInstallButton(!!prompt);
    };

    checkInstallPrompt();
    // 주기적으로 확인 (프롬프트가 나중에 올 수 있음)
    const interval = setInterval(checkInstallPrompt, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // PWA 설치 핸들러
  const handleInstallPWA = async () => {
    const installed = await showInstallPrompt();
    if (installed) {
      setShowInstallButton(false);
    }
  };

  // 라우트 변경 시 스크롤 맨 위로 복원 (SPA는 document가 유지되므로 수동 처리)
  // 라우트 변경 시 스크롤 위치 처리:
  // - hash가 없으면 맨 위로
  // - hash가 있으면 해당 섹션으로 스크롤
  useEffect(() => {
    const hash = location.hash?.replace('#', '');
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    let tries = 0;
    const maxTries = 20; // 약 1초
    const tryScroll = () => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (tries++ < maxTries) {
        window.setTimeout(tryScroll, 50);
      }
    };

    tryScroll();
  }, [location.pathname, location.hash]);
  
  // Clerk 토큰을 API에 설정
  useEffect(() => {
    if (!getToken) return; // ClerkProvider가 없으면 건너뛰기
    
    const updateAuthToken = async () => {
      if (isClerkLoaded && isSignedIn) {
        const token = await getToken();
        setAuthToken(token);
      } else {
        setAuthToken(null);
      }
    };
    updateAuthToken();
  }, [isClerkLoaded, isSignedIn, getToken]);
  
  const derivedView = currentView || (() => {
    if (location.pathname.startsWith('/stats')) return 'stats';
    if (location.pathname.startsWith('/map')) return 'map';
    if (location.pathname.startsWith('/compare')) return 'compare';
    if (location.pathname.startsWith('/property')) return 'dashboard';
    return 'dashboard';
  })();
  
  const isMapMode = derivedView === 'map' && !isDetailOpen;
  const isDashboard = derivedView === 'dashboard';
  const profileRef = useRef<HTMLDivElement>(null);
  const statsDropdownRef = useRef<HTMLDivElement>(null);
  
  // 현재 경로에 따라 active 상태 결정
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (statsDropdownRef.current && !statsDropdownRef.current.contains(event.target as Node)) {
        setIsStatsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    // Apply dark mode to document
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    return () => {
        window.removeEventListener('scroll', handleScroll);
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    // localStorage에 설정 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('sweethome-dark-mode', String(newValue));
    }
  };

  const openQRModal = () => {
    setIsQROpen(true);
  };

  return (
    <>
      {/* Custom Gradient Background */}
      <div 
        className="fixed inset-0 -z-10"
        style={{
          background: `linear-gradient(135deg, #E8F6FC 0%, #D0EBF7 50%, #E0F4FA 100%)`,
          backgroundSize: '100% 100%',
        }}
        aria-hidden="true"
      />
      
      <div className={`min-h-screen text-slate-900 dark:text-slate-100 selection:bg-brand-blue selection:text-white ${
        isMapMode ? 'overflow-hidden' : ''
      } ${isDarkMode ? 'dark bg-slate-900' : ''}`}>
      
      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} isDarkMode={isDarkMode} />

      {/* QR Code Modal */}
      {isQROpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsQROpen(false)}
          ></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">QR 코드</h3>
              <button 
                onClick={() => setIsQROpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-2xl">
                <QRCodeSVG 
                  value={typeof window !== 'undefined' ? window.location.href : ''}
                  size={256}
                  level="H"
                  includeMargin={true}
                  fgColor="#000000"
                  bgColor="transparent"
                />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                이 QR 코드를 스캔하여 현재 페이지를 모바일에서 열 수 있습니다
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          PC HEADER (Original Design - Restored)
      ----------------------------------------------------------------------- */}
      <header className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-16 transition-all duration-300 items-center justify-between px-8 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] border-b border-slate-100/80 dark:border-slate-700/80">
        <div className="flex items-center gap-12">
          <Link to="/" className="cursor-pointer">
              <Logo />
          </Link>
          <nav className="flex gap-1">
            {tabs.map((tab) => {
              if (tab.id === 'stats') {
                const statsActive = isActive('/stats');
                return (
                  <div key={tab.id} className="relative" ref={statsDropdownRef}>
                    <button
                      onClick={() => setIsStatsDropdownOpen(!isStatsDropdownOpen)}
                      className={`px-4 py-2 rounded-lg text-[15px] font-bold transition-all duration-300 flex items-center gap-2 ${
                        statsActive 
                          ? 'text-deep-900 dark:text-white bg-slate-200/50 dark:bg-slate-700/50' 
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <tab.icon size={19} strokeWidth={statsActive ? 2.5 : 2} />
                      {tab.label}
                    </button>
                    
                    {isStatsDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-deep border border-slate-200 dark:border-slate-700 p-2 animate-enter origin-top-left overflow-hidden z-50">
                        <Link
                          to="/stats/demand"
                          onClick={() => {
                            setIsStatsDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 text-[14px] font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors block"
                        >
                          주택 수요
                        </Link>
                        <Link
                          to="/stats/supply"
                          onClick={() => {
                            setIsStatsDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 text-[14px] font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors block"
                        >
                          주택 공급
                        </Link>
                        <Link
                          to="/stats/ranking"
                          onClick={() => {
                            setIsStatsDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 text-[14px] font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors block"
                        >
                          주택 랭킹
                        </Link>
                      </div>
                    )}
                  </div>
                );
              }
              
              // 경로 매핑
              const pathMap: Record<string, string> = {
                'dashboard': '/',
                'map': '/map',
                'compare': '/compare',
                'stats': '/stats'
              };
              
              const tabPath = pathMap[tab.id] || '/';
              const active = isActive(tabPath);
              
              return (
              <Link
                key={tab.id}
                to={tabPath}
                className={`px-4 py-2 rounded-lg text-[15px] font-bold transition-all duration-300 flex items-center gap-2 ${
                  active 
                    ? 'text-deep-900 dark:text-white bg-slate-200/50 dark:bg-slate-700/50' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <tab.icon size={19} strokeWidth={active ? 2.5 : 2} />
                {tab.label}
              </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
            {/* PWA 설치 버튼 */}
            {showInstallButton && (
                <button 
                    onClick={handleInstallPWA}
                    className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-blue to-blue-600 text-white rounded-lg text-[14px] font-bold hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg active:scale-95"
                    title="앱 설치"
                >
                    <Download className="w-4 h-4" />
                    설치
                </button>
            )}
            
            <button 
                onClick={() => setIsSearchOpen(true)}
                className="p-2 rounded-full text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
                <Search className="w-5 h-5" />
            </button>
            
            {/* 로그인 안됨 - 로그인 버튼 표시 */}
            <SignedOut>
              <SignInButton mode="modal">
                <button className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-[14px] font-bold hover:bg-blue-600 transition-colors">
                  <LogIn className="w-4 h-4" />
                  로그인
                </button>
              </SignInButton>
            </SignedOut>
            
            {/* 로그인됨 - 프로필 드롭다운 표시 */}
            <SignedIn>
                {/* Profile Dropdown */}
                <div className="relative" ref={profileRef}>
                    <div 
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-white dark:border-slate-600 shadow-md cursor-pointer hover:ring-2 hover:ring-slate-100 dark:hover:ring-slate-700 transition-all active:scale-95"
                    >
                        {clerkUser?.imageUrl ? (
                            <img src={clerkUser.imageUrl} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" className="w-full h-full" />
                        )}
                    </div>
                    
                    {isProfileOpen && (
                        <div className="absolute right-0 top-12 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-deep border border-slate-200 dark:border-slate-700 p-2 animate-enter origin-top-right overflow-hidden z-50">
                            <div className="p-3 border-b border-slate-50 dark:border-slate-700 mb-1">
                                 <p className="font-bold text-slate-900 dark:text-white text-[15px]">
                                     {clerkUser?.fullName || clerkUser?.firstName || '사용자'}
                                 </p>
                                 <p className="text-[13px] text-slate-400 dark:text-slate-400">
                                     {clerkUser?.primaryEmailAddress?.emailAddress || ''}
                                 </p>
                            </div>
                            <div className="mt-1 pt-1 space-y-1">
                                 <button 
                                    onClick={openQRModal}
                                    className="w-full text-left px-3 py-2 text-[13px] text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2 font-medium transition-colors"
                                 >
                                     <QrCode className="w-4 h-4" /> QR 코드
                                 </button>
                                 <div className="pt-1 border-t border-slate-100 dark:border-slate-700 mt-1">
                                     <button 
                                         onClick={() => {
                                             signOut();
                                             setIsProfileOpen(false);
                                         }}
                                         className="w-full text-left px-3 py-2 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-2 font-medium transition-colors"
                                     >
                                         <LogOut className="w-4 h-4" />
                                         로그아웃
                                     </button>
                                 </div>
                            </div>
                    </div>
                )}
                </div>
            </SignedIn>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`${
        isMapMode 
          ? 'h-screen w-full p-0 md:pt-16 md:px-0' 
          : (isDashboard ? 'pt-0 md:pt-20 px-0 md:px-2' : 'pt-2 md:pt-20 px-2 md:px-8')
      } max-w-[1600px] 2xl:max-w-[1760px] mx-auto min-h-screen relative`}>
        
        {/* Mobile Header - Optimized */}
        {isDashboard && !isDetailOpen && !isMapMode && (
          <div className={`md:hidden sticky top-0 z-30 flex justify-between items-center py-3 px-4 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-slate-100/50 dark:border-slate-800/50 animate-fade-in`}>
              <SignedIn>
                  <div className="flex items-center gap-2.5" onClick={() => setIsProfileOpen(true)}>
                     <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-white/50 shadow-sm">
                        {clerkUser?.imageUrl ? (
                            <img src={clerkUser.imageUrl} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" className="w-full h-full" />
                        )}
                     </div>
                     <div>
                        <p className="text-[11px] font-medium text-slate-500 leading-tight">안녕하세요</p>
                        <p className="text-[15px] font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                            {clerkUser?.fullName || clerkUser?.firstName || '사용자'}
                        </p>
                     </div>
                  </div>
              </SignedIn>
              <SignedOut>
                  <div className="flex items-center gap-3">
                     <Logo className="scale-90 origin-left" />
                  </div>
              </SignedOut>
              <div className="flex items-center gap-2">
                <button 
                    onClick={() => setIsSearchOpen(true)}
                    className="p-2 rounded-full bg-slate-100/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 active:bg-slate-200 dark:active:bg-slate-700 active:scale-95 transition-all"
                >
                    <Search className="w-5 h-5" />
                </button>
                <SignedOut>
                    <SignInButton mode="modal">
                        <button className="p-2 rounded-full bg-brand-blue text-white active:scale-95 transition-all shadow-sm shadow-brand-blue/30">
                            <LogIn className="w-5 h-5" />
                        </button>
                    </SignInButton>
                </SignedOut>
              </div>
          </div>
        )}
        
        <div key={derivedView} className="animate-fade-in">
             {children}
        </div>
      </main>

      {/* Footer */}
      {!isMapMode && (
          <footer className="mt-20 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-12 px-8">
              <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div className="md:col-span-1">
                      <Logo className="mb-4" />
                      <p className="text-[13px] text-slate-400 dark:text-slate-400 leading-relaxed">
                          스위트홈은 데이터 기반의 부동산 의사결정을 지원하는<br/>
                          프리미엄 자산 관리 서비스입니다.
                      </p>
                  </div>
                  <div>
                      <h4 className="font-bold text-slate-900 dark:text-white mb-4 text-[15px]">서비스</h4>
                      <ul className="space-y-2 text-[13px] text-slate-500 dark:text-slate-400">
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">자산 분석</li>
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">시장 동향</li>
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">세금 계산기</li>
                      </ul>
                  </div>
                   <div>
                      <h4 className="font-bold text-slate-900 dark:text-white mb-4 text-[15px]">고객지원</h4>
                      <ul className="space-y-2 text-[13px] text-slate-500 dark:text-slate-400">
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">자주 묻는 질문</li>
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">문의하기</li>
                          <li className="hover:text-slate-900 dark:hover:text-white cursor-pointer">이용약관</li>
                      </ul>
                  </div>
                  <div>
                      <p className="text-[13px] text-slate-400 dark:text-slate-400">
                          (주)스위트홈 | 대표: 홍길동<br/>
                          서울시 강남구 테헤란로 123<br/>
                          사업자등록번호: 123-45-67890<br/>
                          Copyright © SweetHome. All rights reserved.
                      </p>
                  </div>
              </div>
          </footer>
      )}

      {/* Mobile Floating Dock - Optimized */}
      {!isDetailOpen && (
        <nav 
            className={`md:hidden fixed bottom-6 left-1/2 transform -translate-x-1/2 w-[280px] h-[64px]
                        bg-white/90 dark:bg-slate-800/90 backdrop-blur-2xl 
                        rounded-full 
                        shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(255,255,255,0.4)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.1)]
                        flex justify-between items-center px-6 z-[90] 
                        transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)
                        ${isDockVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-[200%] opacity-0 scale-90'}`}
            style={{ marginBottom: 'env(safe-area-inset-bottom, 20px)' }}
        >
          {tabs.map((tab) => {
            const pathMap: Record<string, string> = {
              'dashboard': '/',
              'map': '/map',
              'compare': '/compare',
              'stats': '/stats'
            };
            const tabPath = pathMap[tab.id] || '/';
            const active = isActive(tabPath);
            return (
              <Link
                key={tab.id}
                to={tabPath}
                className="relative z-10 flex flex-col items-center justify-center w-12 h-12 group"
              >
                <div 
                  className={`flex items-center justify-center p-3 rounded-full transition-all duration-300 ${
                    active 
                      ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/40 scale-110' 
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 active:scale-95'
                  }`}
                >
                  <tab.icon size={22} strokeWidth={active ? 2.5 : 2} />
                </div>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
    </>
  );
};