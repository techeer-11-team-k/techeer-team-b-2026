import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Search, X, ChevronDown } from 'lucide-react';
import { SignIn, useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  addFavoriteApartment,
  createMyProperty,
  fetchFavoriteApartments,
  fetchMyProperties,
  searchApartments,
  setAuthToken,
  fetchApartmentExclusiveAreas,
} from '../../services/api';
import { Select } from '../../components/ui/Select';
import { MobileOnboardingFlow } from '../mobile/MobileOnboardingFlow';
import { MobileSuccessStep } from '../mobile/MobileSuccessStep';


/**
 * 온보딩 페이지
 * - 좌측: 레퍼런스 느낌의 이미지 패널
 * - 우측: Clerk 로그인(SignIn)
 */

export const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3>(1);
  const [hasHome, setHasHome] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  // step2 검색창 포커스/확대 상태 (기존: 오버레이, 현재: 인라인 강조/확대)
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ apt_id: number | string; apt_name: string; address?: string | null }>>([]);
  const [isSubmittingSelection, setIsSubmittingSelection] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [hasRegisteredFavorite, setHasRegisteredFavorite] = useState(false);
  const [hasExistingFavorite, setHasExistingFavorite] = useState(false);
  const [isCheckingFavorite, setIsCheckingFavorite] = useState(false);
  const [hasRegisteredMyProperty, setHasRegisteredMyProperty] = useState(false);
  const [hasExistingMyProperty, setHasExistingMyProperty] = useState(false);
  const [isCheckingMyProperty, setIsCheckingMyProperty] = useState(false);
  // "네, 있어요" 선택 시: 검색 결과 클릭 후 구매가/구매일 입력 모달
  const [isPurchaseInfoOpen, setIsPurchaseInfoOpen] = useState(false);
  const [purchaseTargetApt, setPurchaseTargetApt] = useState<{
    apt_id: number | string;
    apt_name: string;
    address?: string | null;
  } | null>(null);
  const [purchasePrice, setPurchasePrice] = useState(''); // 만원 단위 입력
  const [purchaseDate, setPurchaseDate] = useState(''); // YYYY-MM-DD
  const [exclusiveArea, setExclusiveArea] = useState<number>(84);
  const [areaOptions, setAreaOptions] = useState<number[]>([]);
  const [isLoadingAreas, setIsLoadingAreas] = useState(false);
  const [purchaseInfoError, setPurchaseInfoError] = useState<string | null>(null);
  const [isSubmittingPurchaseInfo, setIsSubmittingPurchaseInfo] = useState(false);
  const { getToken } = useAuth();
  const { isLoaded, isSignedIn, user } = useUser();
  const isOnboardingCompleted = Boolean((user as any)?.unsafeMetadata?.onboardingCompleted);
  // 신규 유저: 온보딩 1페이지(질문) -> 2페이지(검색)
  const step = isSignedIn ? onboardingStep : 1;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchCloseTimeoutRef = useRef<number | null>(null);
  const searchRunIdRef = useRef(0);
  const shouldReduceMotion = useReducedMotion();

  // 모바일 온보딩(풀스크린 인트로) 노출 여부
  const [isMobileIntroDismissed, setIsMobileIntroDismissed] = useState(false);
  // 모바일용 step2 에러 토스트
  const [toastStep2Error, setToastStep2Error] = useState<string | null>(null);

  // step2 에러를 모바일 토스트로 2초간 표시
  useEffect(() => {
    if (!step2Error) {
      setToastStep2Error(null);
      return;
    }
    setToastStep2Error(step2Error);
    const t = window.setTimeout(() => {
      setToastStep2Error(null);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [step2Error]);

  // 브라우저 단위로 "나중에 둘러볼게요"를 선택한 경우, 온보딩 페이지 자체를 건너뛴다.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('onboarding.skipAll');
      if (v === '1') {
        navigate('/', { replace: true });
        return;
      }

      // 예전 키와의 호환성: skipMobile이 있으면 intro만 건너뛰기
      const legacy = window.localStorage.getItem('onboarding.skipMobile');
      if (legacy === '1') setIsMobileIntroDismissed(true);
    } catch {
      // ignore
    }
  }, [navigate]);

  useEffect(() => {
    if (!isSignInOpen && !isSearchOverlayOpen && !isPurchaseInfoOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSignInOpen(false);
        setIsSearchOverlayOpen(false);
        setIsPurchaseInfoOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPurchaseInfoOpen, isSignInOpen, isSearchOverlayOpen]);

  // 로그인 성공 시: 모달 닫고 2단계로 전환(= isSignedIn)
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) setIsSignInOpen(false);
  }, [isLoaded, isSignedIn]);

  // 신규 유저는 온보딩 진입 시 항상 1페이지부터
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;
    if (isOnboardingCompleted) return;
    setOnboardingStep(1);
    setHasHome(null);
    setHasRegisteredFavorite(false);
    setHasExistingFavorite(false);
    setHasRegisteredMyProperty(false);
    setHasExistingMyProperty(false);
    setIsPurchaseInfoOpen(false);
    setPurchaseTargetApt(null);
    setPurchasePrice('');
    setPurchaseDate('');
    setExclusiveArea(84);
    setAreaOptions([]);
    setPurchaseInfoError(null);
  }, [isLoaded, isOnboardingCompleted, isSignedIn]);

  // 이미 온보딩 완료한 유저는 온보딩 페이지에 머무르지 않도록 메인으로
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;
    if (!isOnboardingCompleted) return;
    // 모바일 성공 단계(3)에 있다면 리다이렉트 방지
    if (onboardingStep === 3) return;

    navigate('/', { replace: true });
  }, [isLoaded, isOnboardingCompleted, isSignedIn, navigate, onboardingStep]);

  // step2 검색: 입력값 디바운스 후 자동완성 리스트 표시
  useEffect(() => {
    if (step !== 2) return;
    if (!isSearchOverlayOpen) return;

    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    // 1글자 검색은 서버 요청하지 않음
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const runId = ++searchRunIdRef.current;
    setIsSearching(true);

    const t = window.setTimeout(async () => {
      try {
        const res: any = await searchApartments(q, 8);
        // 최신 요청만 반영
        if (runId !== searchRunIdRef.current) return;

        const results = res?.data?.results ?? res?.data?.data?.results ?? res?.results ?? [];
        setSearchResults(
          (Array.isArray(results) ? results : []).map((r: any) => ({
            apt_id: r.apt_id,
            apt_name: r.apt_name,
            address: r.address ?? null,
          }))
        );
      } catch {
        if (runId !== searchRunIdRef.current) return;
        setSearchResults([]);
      } finally {
        if (runId === searchRunIdRef.current) setIsSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [query, isSearchOverlayOpen, step]);

  // Apt 선택 시 전용면적 목록 가져오기
  useEffect(() => {
    if (!purchaseTargetApt) return;

    // 상태 초기화
    setExclusiveArea(84);
    setAreaOptions([]);
    setIsLoadingAreas(true);

    const aptId = typeof purchaseTargetApt.apt_id === 'number'
      ? purchaseTargetApt.apt_id
      : Number(purchaseTargetApt.apt_id);

    if (!Number.isFinite(aptId)) {
      setIsLoadingAreas(false);
      return;
    }

    (async () => {
      try {
        const res = await fetchApartmentExclusiveAreas(aptId);
        if (res.success && res.data && res.data.exclusive_areas && res.data.exclusive_areas.length > 0) {
          // 면적 오름차순 정렬
          const sorted = res.data.exclusive_areas.sort((a: number, b: number) => a - b);
          setAreaOptions(sorted);
          // 가장 대중적인 84에 가까운 값 또는 중간값 선택
          const has84 = sorted.find((a: number) => Math.abs(a - 84) < 1);
          setExclusiveArea(has84 || sorted[Math.floor(sorted.length / 2)]);
        } else {
          setAreaOptions([]); // 값이 없으면 84, 59 등 기본값 사용하도록 UI 처리
        }
      } catch (error) {
        console.error('면적 데이터 로드 실패:', error);
        setAreaOptions([]);
      } finally {
        setIsLoadingAreas(false);
      }
    })();
  }, [purchaseTargetApt]);

  // step2 진입 시: (네, 있어요)면 내 자산이 있는지 / (아직 없어요)면 관심단지가 있는지 서버로 확인
  useEffect(() => {
    if (!isLoaded) return;
    if (step !== 2) return;
    if (!user) return;

    let cancelled = false;
    (async () => {
      try {
        // hasHome 값이 아직 없으면(이상 케이스) 아무 것도 확인하지 않음
        if (hasHome == null) return;

        const token = await getToken();
        if (!token) return;
        setAuthToken(token);

        if (hasHome === true) {
          setIsCheckingMyProperty(true);
          const res: any = await fetchMyProperties(0, 1);
          if (cancelled) return;
          const list = res?.data?.properties ?? res?.data?.data?.properties ?? [];
          setHasExistingMyProperty(Array.isArray(list) && list.length > 0);
        } else {
          setIsCheckingFavorite(true);
          const res: any = await fetchFavoriteApartments(0, 1);
          if (cancelled) return;
          const list = res?.data?.favorites ?? res?.data?.data?.favorites ?? [];
          setHasExistingFavorite(Array.isArray(list) && list.length > 0);
        }
      } catch {
        if (cancelled) return;
        setHasExistingFavorite(false);
        setHasExistingMyProperty(false);
      } finally {
        if (!cancelled) {
          setIsCheckingFavorite(false);
          setIsCheckingMyProperty(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, hasHome, isLoaded, step, user]);

  return (
    <div className="min-h-screen w-full relative">
      <style>{`
        @keyframes gradientFlow {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .animated-bg {
          background: linear-gradient(-45deg, #ffffff, #f0f9ff, #e0e7ff, #f3e8ff);
          background-size: 400% 400%;
          animation: gradientFlow 15s ease infinite;
        }
      `}</style>

      {/* 배경 */}
      <div className="fixed inset-0 -z-10 animated-bg" />

      {/* 모바일 전용 step2 에러 토스트 */}
      <AnimatePresence>
        {toastStep2Error && (
          <motion.div
            key={toastStep2Error}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed top-5 left-0 right-0 z-[160] flex justify-center md:hidden"
          >
            <div className="inline-flex max-w-[90%] items-center rounded-full bg-slate-900/95 px-4 py-2 text-[13px] font-bold text-slate-50 shadow-lg shadow-slate-900/40">
              {toastStep2Error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 모바일 레이아웃 (md:hidden) --- */}
      <div className="flex flex-col min-h-[100dvh] px-6 py-8 md:hidden relative">
        {/* 상단 네비게이션 */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (isPurchaseInfoOpen) {
                setIsPurchaseInfoOpen(false);
                return;
              }
              if (step === 2) {
                setOnboardingStep(1);
                return;
              }
              if (step === 1) {
                setIsMobileIntroDismissed(false);
                return;
              }
              navigate('/', { replace: true });
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/50 backdrop-blur-sm text-slate-700 shadow-sm"
            aria-label="뒤로"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* 인디케이터 */}
          <div className="flex gap-2" aria-label="온보딩 진행 단계">
            {!isPurchaseInfoOpen ? (
              <>
                <span className={`h-2 w-2 rounded-full ${step === 1 ? 'bg-slate-900' : 'bg-slate-300'}`} />
                <span className={`h-2 w-2 rounded-full ${step === 2 ? 'bg-slate-900' : 'bg-slate-300'}`} />
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                <span className="h-2 w-2 rounded-full bg-slate-900" />
              </>
            )}
          </div>
          <div className="w-10" /> {/* Spacer */}
        </div>

        <AnimatePresence mode="wait">
          {!isMobileIntroDismissed ? (
            <MobileOnboardingFlow
              key="intro"
              onPrimaryAction={() => setIsMobileIntroDismissed(true)}
              onSecondaryAction={() => {
                try { window.localStorage.setItem('onboarding.skipAll', '1'); } catch { }
                navigate('/', { replace: true });
              }}
            />
          ) : step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, filter: 'blur(5px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(5px)' }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="mt-4">
                <div className="text-[32px] font-black text-slate-900 leading-tight tracking-tight">
                  집을<br />가지고 계신가요?
                </div>
              </div>

              <div className="mt-auto pb-12 flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setHasHome(true);
                    setOnboardingStep(2);
                  }}
                  className="w-full h-[70px] rounded-2xl bg-slate-900 text-[20px] font-bold text-white shadow-xl shadow-slate-900/30 active:scale-[0.98] transition-transform"
                >
                  네, 있어요
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHasHome(false);
                    setOnboardingStep(2);
                  }}
                  className="w-full h-[70px] rounded-2xl bg-white/60 backdrop-blur-md border border-white/40 text-[20px] font-bold text-slate-800 shadow-lg active:scale-[0.98] transition-transform"
                >
                  아직 없어요
                </button>
              </div>
            </motion.div>
          ) : isPurchaseInfoOpen && purchaseTargetApt ? (
            // Mobile Inline Purchase Info Step (Transparent & Styled)
            <motion.div
              key="step3-purchase"
              initial={{ opacity: 0, filter: 'blur(5px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(5px)' }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="mt-4 mb-8">
                <div className="text-[28px] font-black text-slate-900 leading-tight tracking-tight">
                  구매 정보를<br />입력해주세요
                </div>
                <div className="mt-2 text-slate-600 font-bold text-[16px]">
                  {purchaseTargetApt.apt_name}
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-8">
                {/* [Mobile] 전용면적 선택 */}
                <div className="space-y-3">
                  <label className="text-[18px] font-bold text-slate-800">평형 (전용면적)</label>
                  <div className="relative">
                    {isLoadingAreas ? (
                      <div className="w-full bg-transparent border-b-2 border-slate-300 py-2 text-[18px] text-slate-400">
                        로딩 중...
                      </div>
                    ) : (
                      <Select
                        value={String(exclusiveArea)}
                        onChange={(val) => setExclusiveArea(Number(val))}
                        options={areaOptions.length > 0 ? areaOptions.map(area => ({
                          value: String(area),
                          label: `${Math.round(area / 3.3058)}평 (${area}㎡)`
                        })) : [
                          { value: "59", label: "18평 (59㎡)" },
                          { value: "84", label: "25평 (84㎡)" },
                          { value: "102", label: "31평 (102㎡)" },
                          { value: "114", label: "34평 (114㎡)" }
                        ]}
                        className="w-full bg-transparent border-b-2 border-slate-300 rounded-none px-0 pr-8 py-2 text-[20px] font-bold text-slate-900 focus:border-slate-900 border-t-0 border-x-0"
                        containerClassName="w-full"
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[18px] font-bold text-slate-800">구매 금액</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={purchasePrice}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d,]/g, '');
                        setPurchasePrice(next);
                      }}
                      placeholder="예: 85000"
                      className="w-full bg-transparent border-b-2 border-slate-300 py-2 text-[24px] font-black text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-slate-900 transition-colors rounded-none"
                    />
                    <span className="absolute right-0 bottom-3 text-[16px] font-bold text-slate-500">만원</span>
                  </div>
                  <div className="text-[13px] text-slate-400">숫자만 입력 (예: 8.5억 → 85000)</div>
                </div>

                <div className="space-y-3">
                  <label className="text-[18px] font-bold text-slate-800">구매 날짜</label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full bg-transparent border-b-2 border-slate-300 py-2 text-[20px] font-bold text-slate-900 focus:outline-none focus:border-slate-900 transition-colors rounded-none"
                  />
                </div>

                {purchaseInfoError && (
                  <div className="text-[14px] text-red-600 font-bold bg-red-50 p-3 rounded-lg">
                    {purchaseInfoError}
                  </div>
                )}
              </div>

              <div className="mt-auto pb-8">
                <button
                  type="button"
                  disabled={isSubmittingPurchaseInfo}
                  onClick={() => {
                    (async () => {
                      if (!user) return;
                      if (!purchaseTargetApt) return;

                      const aptIdNumber = typeof purchaseTargetApt.apt_id === 'number' ? purchaseTargetApt.apt_id : Number(purchaseTargetApt.apt_id);
                      if (!Number.isFinite(aptIdNumber)) {
                        setPurchaseInfoError('아파트 ID가 올바르지 않습니다.');
                        return;
                      }

                      const parsedPrice = Number(String(purchasePrice).replace(/,/g, ''));
                      if (!purchasePrice.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
                        setPurchaseInfoError('구매가를 올바르게 입력해 주세요.');
                        return;
                      }
                      if (!purchaseDate) {
                        setPurchaseInfoError('구매일을 선택해 주세요.');
                        return;
                      }

                      try {
                        setIsSubmittingPurchaseInfo(true);
                        setPurchaseInfoError(null);

                        const token = await getToken();
                        if (!token) throw new Error('NO_TOKEN');
                        setAuthToken(token);

                        await createMyProperty({
                          apt_id: aptIdNumber,
                          nickname: purchaseTargetApt.apt_name,
                          exclusive_area: exclusiveArea,
                          purchase_price: parsedPrice,
                          purchase_date: purchaseDate,
                        });

                        setHasRegisteredMyProperty(true);
                        setIsPurchaseInfoOpen(false);
                        // 성공 단계로 이동 (Mobile)
                        setOnboardingStep(3);
                        // PC는 기존 동작 유지 (또는 PC도 성공 화면을 원하면 수정 가능, 일단 모바일만)
                        if (window.innerWidth >= 768) {
                          navigate('/', { replace: true });
                        }
                      } catch (err: any) {
                        // 409 Conflict: 이미 등록된 자산 -> 성공으로 처리
                        if (err instanceof ApiError && err.status === 409) {
                          setHasRegisteredMyProperty(true);
                          setIsPurchaseInfoOpen(false);
                          setOnboardingStep(3);
                          return;
                        }
                        console.error('Failed to create property:', err);
                        setPurchaseInfoError(err.message || '아파트 등록에 실패했습니다.');
                      } finally {
                        setIsSubmittingPurchaseInfo(false);
                      }
                    })();
                  }}
                  className="w-full h-16 rounded-2xl bg-slate-900 text-[18px] font-bold text-white shadow-xl shadow-slate-900/30 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmittingPurchaseInfo && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  입력 완료
                </button>
              </div>
            </motion.div>
          ) : step === 3 && purchaseTargetApt ? (
            <MobileSuccessStep
              key="step3-success"
              aptId={typeof purchaseTargetApt.apt_id === 'number' ? purchaseTargetApt.apt_id : Number(purchaseTargetApt.apt_id)}
              aptName={purchaseTargetApt.apt_name}
              onNext={async () => {
                // 모바일: "이제 시작하기" 버튼 클릭 시 최종 온보딩 완료 처리 및 이동
                if (user) {
                  const prev = (user as any)?.unsafeMetadata ?? {};
                  await user.update({
                    unsafeMetadata: {
                      ...prev,
                      onboardingCompleted: true,
                    },
                  } as any);
                  await (user as any).reload?.();
                }

                // 모바일은 대시보드 오버레이(모달) 띄우지 않음 (성공 화면이 대체)
                try {
                  window.localStorage.setItem('onboarding.defaultTab', 'my');
                  // completedJustNow, dashboardOverlay 설정 X
                } catch { }

                navigate('/', { replace: true });
              }}
            />
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, filter: 'blur(5px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(5px)' }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="mt-4 mb-8 flex-1">
                <div
                  className="text-[28px] font-black text-slate-900 leading-tight tracking-tight"
                >
                  {hasHome === true ? '당신의 집을\n검색해주세요' : '관심있는 아파트를\n검색해주세요'}
                </div>
                <div
                  className="mt-2 text-slate-500 text-[15px]"
                >
                  예: 래미안, 자이, 힐스테이트
                </div>
              </div>

              <div className="relative z-10 pb-8">
                {/* 모바일 검색 결과 */}
                <AnimatePresence>
                  {query.trim().length >= 2 && (searchResults.length > 0 || !isSearching) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="absolute bottom-full left-0 right-0 mb-4 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden max-h-[50vh] overflow-y-auto ring-1 ring-black/5"
                    >
                      {searchResults.length > 0 ? (
                        searchResults.map((apt) => (
                          <button
                            key={String(apt.apt_id)}
                            className="w-full text-left px-5 py-4 border-b border-slate-100/50 last:border-none active:bg-slate-50/80 transition-colors"
                            onClick={() => {
                              // 모바일 검색 결과 클릭 핸들러
                              (async () => {
                                if (!user) return;
                                const aptIdNumber = typeof apt.apt_id === 'number' ? apt.apt_id : Number(apt.apt_id);
                                if (!Number.isFinite(aptIdNumber)) return;

                                try {
                                  if (hasHome === true) {
                                    setPurchaseTargetApt(apt);
                                    setPurchasePrice('');
                                    setPurchaseDate('');
                                    setExclusiveArea(84); // Reset to default or handle in useEffect
                                    setIsPurchaseInfoOpen(true);
                                    setQuery('');
                                    setSearchResults([]);
                                  } else {
                                    setIsSubmittingSelection(true);
                                    const token = await getToken();
                                    if (token) setAuthToken(token);
                                    await addFavoriteApartment({ apt_id: aptIdNumber });

                                    const prev = (user as any)?.unsafeMetadata ?? {};
                                    await user.update({ unsafeMetadata: { ...prev, onboardingCompleted: true } } as any);
                                    await (user as any).reload?.();
                                    navigate('/', { replace: true });
                                  }
                                } catch (e) {
                                  if (e instanceof ApiError && e.status === 409) {
                                    navigate('/', { replace: true });
                                  }
                                } finally {
                                  setIsSubmittingSelection(false);
                                }
                              })();
                            }}
                          >
                            <div className="text-[16px] font-bold text-slate-900">{apt.apt_name}</div>
                            {apt.address && <div className="text-[13px] text-slate-500 mt-1">{apt.address}</div>}
                          </button>
                        ))
                      ) : !isSearching && (
                        <div className="p-4 text-center text-slate-400 text-sm">검색 결과가 없습니다.</div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                      setSelectionError(null);
                      setStep2Error(null);
                      setIsSearchOverlayOpen(true);
                    }}
                    placeholder="예: 반포자이"
                    className="w-full h-16 pl-14 pr-4 rounded-full bg-slate-100 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05),inset_-2px_-2px_5px_rgba(255,255,255,1)] border border-slate-200 text-[18px] font-bold text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-400 transition-all"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence >
      </div >

      {/* --- PC 레이아웃 (hidden md:flex) --- */}
      < div
        className={`hidden md:flex min-h-screen items-center justify-center px-14 py-16`}
      >
        <div
          className={`relative w-full ${step === 2 ? 'max-w-[820px]' : 'max-w-[520px]'
            } rounded-3xl bg-white/85 backdrop-blur-md shadow-xl border border-white/60 px-10 py-10 flex flex-col`}
        >
          {/* 온보딩 단계 진행 표시 */}
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className={`h-2 w-2 rounded-full ${step === 1 ? 'bg-slate-900' : 'bg-slate-300'}`} />
            <span className={`h-2 w-2 rounded-full ${step === 2 ? 'bg-slate-900' : 'bg-slate-300'}`} />
          </div>

          {step === 1 ? (
            <div className="flex-1 flex flex-col justify-between text-center gap-10">
              <div className="space-y-3">
                <motion.div
                  initial={{ opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[32px] font-black text-slate-900 tracking-tight"
                >
                  집을 가지고 계신가요?
                </motion.div>
              </div>

              <div className="flex flex-row items-stretch justify-center gap-4 w-full max-w-[640px] mx-auto">
                <button
                  type="button"
                  onClick={() => { setHasHome(true); setOnboardingStep(2); }}
                  className="flex-1 h-14 rounded-2xl bg-slate-900 text-[18px] font-bold text-white shadow-md hover:bg-slate-800 transition-colors"
                >
                  네, 있어요
                </button>
                <button
                  type="button"
                  onClick={() => { setHasHome(false); setOnboardingStep(2); }}
                  className="flex-1 h-14 rounded-2xl border border-slate-200 bg-white text-[17px] font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  아직 없어요
                </button>
              </div>
            </div>
          ) : (
            // PC Step 2
            <motion.div className="flex-1 flex flex-col justify-between text-center gap-8">
              <div className="space-y-2">
                <div className="text-[32px] font-black text-slate-900 tracking-tight">
                  {hasHome === true ? '당신의 집을 검색해주세요' : '당신이 관심있는 아파트를 검색해 주세요'}
                </div>
                <div className="text-[16px] text-slate-500">예: 래미안, 자이, 힐스테이트</div>
              </div>

              <div className="w-full max-w-[640px] mx-auto space-y-3">
                <div className="flex items-start gap-3 w-full">
                  <div className="flex-1 z-10 relative">
                    {/* PC 검색 결과 (Upward Dropdown) */}
                    <AnimatePresence>
                      {query.trim().length >= 2 && (searchResults.length > 0 || !isSearching) && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute bottom-full left-0 right-0 mb-3 text-left w-full"
                        >
                          <div className="w-full max-h-[300px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                            {searchResults.length > 0 ? (
                              searchResults.map((apt) => (
                                <button
                                  key={String(apt.apt_id)}
                                  className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors"
                                  onClick={() => {
                                    // PC Click Logic (Reused)
                                    (async () => {
                                      if (!user) return;
                                      const aptIdNumber = typeof apt.apt_id === 'number' ? apt.apt_id : Number(apt.apt_id);

                                      try {
                                        if (hasHome === true) {
                                          setPurchaseTargetApt(apt);
                                          setPurchasePrice('');
                                          setPurchaseDate('');
                                          setExclusiveArea(84);
                                          setIsPurchaseInfoOpen(true);
                                          setQuery(apt.apt_name);
                                          setSearchResults([]);
                                        } else {
                                          setIsSubmittingSelection(true);
                                          const token = await getToken();
                                          if (token) setAuthToken(token);
                                          await addFavoriteApartment({ apt_id: aptIdNumber });

                                          const prev = (user as any)?.unsafeMetadata ?? {};
                                          await user.update({ unsafeMetadata: { ...prev, onboardingCompleted: true } } as any);
                                          await (user as any).reload?.();
                                          navigate('/', { replace: true });
                                        }
                                      } catch (e) {
                                        if (e instanceof ApiError && e.status === 409) navigate('/', { replace: true });
                                      } finally {
                                        setIsSubmittingSelection(false);
                                      }
                                    })();
                                  }}
                                >
                                  <div className="text-[15px] font-bold text-slate-900">{apt.apt_name}</div>
                                  {apt.address && <div className="text-[12px] text-slate-500 mt-1">{apt.address}</div>}
                                </button>
                              ))
                            ) : !isSearching && (
                              <div className="px-5 py-4 text-[13px] text-slate-400 font-medium">검색 결과가 없습니다.</div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="relative">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => {
                          setSelectionError(null);
                          setStep2Error(null);
                          setIsSearchOverlayOpen(true);
                        }}
                        placeholder="아파트 이름을 검색하세요"
                        className="w-full h-14 pl-14 pr-12 py-0 rounded-2xl border border-slate-200 bg-slate-50 text-[18px] font-bold text-slate-900 focus:outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                      />
                      {isSearching && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                          <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate('/', { replace: true })}
                    className="w-14 h-14 rounded-2xl border flex items-center justify-center bg-white border-slate-200 text-slate-300"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <div className="mt-7 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setOnboardingStep(1)}
                className="h-11 px-5 rounded-2xl border font-black text-[14px] bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
              >
                이전
              </button>
            </div>
          )}
        </div>
      </div >

      {/* SignIn Modal */}
      {
        isSignInOpen && !isSignedIn && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsSignInOpen(false)}
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
                  onClick={() => setIsSignInOpen(false)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">
                <SignIn
                  routing="path"
                  path="/onboarding"
                  // 기존 유저(로그인)는 바로 메인으로
                  redirectUrl="/"
                  afterSignInUrl="/"
                  // 신규 유저(회원가입)는 온보딩 2단계로
                  afterSignUpUrl="/onboarding"
                />
              </div>
            </div>
          </div>
        )
      }

      {/* Purchase Info Modal (only for "네, 있어요" flow) */}
      {
        isPurchaseInfoOpen && !!purchaseTargetApt && (
          <div className="hidden md:flex fixed inset-0 z-[210] items-center justify-center p-4 animate-fade-in">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                if (isSubmittingPurchaseInfo) return;
                setIsPurchaseInfoOpen(false);
              }}
            />
            <div
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="구매 정보 입력"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="space-y-0.5">
                  <div className="text-[15px] font-black text-slate-900">구매 정보 입력</div>
                  <div className="text-[12px] text-slate-500 font-medium">{purchaseTargetApt.apt_name}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isSubmittingPurchaseInfo) return;
                    setIsPurchaseInfoOpen(false);
                  }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label="닫기"
                  disabled={isSubmittingPurchaseInfo}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="space-y-2 text-left">
                  <label className="block text-[13px] font-black text-slate-800">평형 (전용면적)</label>
                  {isLoadingAreas ? (
                    <div className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center text-[14px] text-slate-400">
                      면적 정보 로딩 중...
                    </div>
                  ) : (
                    <div className="relative">
                      <Select
                        value={String(exclusiveArea)}
                        onChange={(val) => setExclusiveArea(Number(val))}
                        options={areaOptions.length > 0 ? areaOptions.map(area => ({
                          value: String(area),
                          label: `${Math.round(area / 3.3058)}평 (${area}㎡)`
                        })) : [
                          { value: "59", label: "18평 (59㎡)" },
                          { value: "84", label: "25평 (84㎡)" },
                          { value: "102", label: "31평 (102㎡)" },
                          { value: "114", label: "34평 (114㎡)" }
                        ]}
                        className="w-full h-12 px-4 pr-10 rounded-2xl border border-slate-200 text-[15px] font-bold focus:border-slate-300 focus:ring-2 focus:ring-slate-200 bg-white"
                        containerClassName="w-full"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-left">
                  <label className="block text-[13px] font-black text-slate-800">구매가 (만원)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={purchasePrice}
                    onChange={(e) => {
                      // 숫자/콤마만 허용
                      const next = e.target.value.replace(/[^\d,]/g, '');
                      setPurchasePrice(next);
                    }}
                    placeholder="예: 85000"
                    className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-[15px] font-bold focus:outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    disabled={isSubmittingPurchaseInfo}
                  />
                  <div className="text-[12px] text-slate-500">숫자만 입력해 주세요. (예: 8.5억 → 85000)</div>
                </div>

                <div className="space-y-2 text-left">
                  <label className="block text-[13px] font-black text-slate-800">구매일</label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-[15px] font-bold focus:outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    disabled={isSubmittingPurchaseInfo}
                  />
                </div>

                {purchaseInfoError && (
                  <div className="text-[13px] text-red-600 font-bold">{purchaseInfoError}</div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isSubmittingPurchaseInfo) return;
                      setIsPurchaseInfoOpen(false);
                    }}
                    className="flex-1 h-11 rounded-2xl border border-slate-200 bg-white text-slate-800 font-black text-[14px] hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={isSubmittingPurchaseInfo}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      (async () => {
                        if (!user) return;
                        if (!purchaseTargetApt) return;

                        const aptIdNumber =
                          typeof purchaseTargetApt.apt_id === 'number'
                            ? purchaseTargetApt.apt_id
                            : Number(purchaseTargetApt.apt_id);
                        if (!Number.isFinite(aptIdNumber)) {
                          setPurchaseInfoError('아파트 ID가 올바르지 않습니다.');
                          return;
                        }

                        const parsedPrice = Number(String(purchasePrice).replace(/,/g, ''));
                        if (!purchasePrice.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
                          setPurchaseInfoError('구매가를 올바르게 입력해 주세요.');
                          return;
                        }
                        if (!purchaseDate) {
                          setPurchaseInfoError('구매일을 선택해 주세요.');
                          return;
                        }

                        try {
                          setIsSubmittingPurchaseInfo(true);
                          setPurchaseInfoError(null);

                          const token = await getToken();
                          if (!token) throw new Error('NO_TOKEN');
                          setAuthToken(token);

                          await createMyProperty({
                            apt_id: aptIdNumber,
                            nickname: purchaseTargetApt.apt_name,
                            // 사용자 선택값 사용
                            exclusive_area: exclusiveArea,
                            purchase_price: parsedPrice,
                            purchase_date: purchaseDate,
                          });

                          setHasRegisteredMyProperty(true);
                          setIsPurchaseInfoOpen(false);

                          // --- PC / Mobile 분기 처리 ---
                          const isMobile = window.innerWidth < 768;

                          if (isMobile) {
                            // [Mobile]
                            // 1. 성공 화면(Step 3)으로 전환
                            // 2. User Update나 Navigation은 아직 하지 않음 (성공 화면에서 '시작하기' 누를 때 수행)
                            setOnboardingStep(3);
                          } else {
                            // [PC]
                            // 1. 온보딩 완료 처리 (User Metadata)
                            const prev = (user as any)?.unsafeMetadata ?? {};
                            await user.update({
                              unsafeMetadata: {
                                ...prev,
                                onboardingCompleted: true,
                              },
                            } as any);
                            await (user as any).reload?.();

                            // 2. 대시보드 오버레이 설정 (PC는 모달 필요)
                            try {
                              window.localStorage.setItem('onboarding.defaultTab', 'my');
                              window.localStorage.setItem('onboarding.completedJustNow', '1');
                              window.localStorage.setItem(
                                'onboarding.dashboardOverlay',
                                JSON.stringify({
                                  mode: 'my',
                                  aptId: aptIdNumber,
                                  aptName: purchaseTargetApt.apt_name,
                                })
                              );
                            } catch { }

                            // 3. 이동
                            navigate('/', { replace: true });
                          }

                        } catch (e) {
                          // 이미 존재하는 내 자산(409)은 성공으로 간주하고 온보딩을 계속 진행
                          if (e instanceof ApiError && e.status === 409) {

                            setHasRegisteredMyProperty(true);
                            setIsPurchaseInfoOpen(false);

                            const isMobile = window.innerWidth < 768;
                            if (isMobile) {
                              setOnboardingStep(3);
                              return;
                            }

                            // PC 409 Logic
                            try {
                              window.localStorage.setItem('onboarding.defaultTab', 'my');
                              window.localStorage.setItem('onboarding.completedJustNow', '1');
                              window.localStorage.setItem(
                                'onboarding.dashboardOverlay',
                                JSON.stringify({
                                  mode: 'my',
                                  aptId: aptIdNumber,
                                  aptName: purchaseTargetApt.apt_name,
                                })
                              );
                            } catch { }

                            navigate('/', { replace: true });
                            return;
                          }

                          setPurchaseInfoError(
                            e instanceof Error && e.message === 'NO_TOKEN'
                              ? '인증 토큰을 가져오지 못했습니다. 새로고침 후 다시 시도해 주세요.'
                              : '등록에 실패했습니다. 잠시 후 다시 시도해 주세요.'
                          );
                        } finally {
                          setIsSubmittingPurchaseInfo(false);
                        }
                      })();
                    }}
                    className="flex-1 h-11 rounded-2xl bg-slate-900 text-white font-black text-[14px] hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                    disabled={isSubmittingPurchaseInfo}
                  >
                    {isSubmittingPurchaseInfo && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    등록하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};