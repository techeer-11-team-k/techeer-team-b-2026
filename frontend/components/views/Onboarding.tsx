import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Search, X } from 'lucide-react';
import { SignIn, useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  addFavoriteApartment,
  createMyProperty,
  fetchFavoriteApartments,
  fetchMyProperties,
  searchApartments,
  setAuthToken,
} from '../../services/api';

/**
 * 온보딩 페이지
 * - 좌측: 레퍼런스 느낌의 이미지 패널
 * - 우측: Clerk 로그인(SignIn)
 */
declare global {
  interface Window {
    UnicornStudio?: {
      init?: () => void;
      isInitialized?: boolean;
      destroy?: () => void;
    };
  }
}

export const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);
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
  const { getToken } = useAuth();
  const { isLoaded, isSignedIn, user } = useUser();
  const isOnboardingCompleted = Boolean((user as any)?.unsafeMetadata?.onboardingCompleted);
  // 신규 유저: 온보딩 1페이지(질문) -> 2페이지(검색)
  const step = isSignedIn ? onboardingStep : 1;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchCloseTimeoutRef = useRef<number | null>(null);
  const searchRunIdRef = useRef(0);
  const shouldReduceMotion = useReducedMotion();
  const unicornHostRef = useRef<HTMLDivElement | null>(null);

  // UnicornStudio가 마우스 트래킹 기반 씬인 경우가 많아서,
  // 실제 마우스는 따라가지 않게 막고(사용자 커서 추적 X),
  // 랜덤 좌표를 계속 흘려 "랜덤으로 움직이는" 느낌을 만든다.
  useEffect(() => {
    let rafId: number | null = null;
    let targetTimerId: number | null = null;

    // 실제 사용자 마우스 이벤트만 차단 (synthetic 이벤트는 isTrusted=false)
    const blockTrustedMouseMove = (e: MouseEvent) => {
      if (e.isTrusted) e.stopImmediatePropagation();
    };
    window.addEventListener('mousemove', blockTrustedMouseMove, true);

    const dispatchMoves = (x: number, y: number) => {
      const mouseEvt = new MouseEvent('mousemove', {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        view: window,
      });

      // UnicornStudio가 어디에 리스너를 달았는지( window / document / host element ) 모를 수 있어 모두에 발사
      window.dispatchEvent(mouseEvt);
      document.dispatchEvent(mouseEvt);
      unicornHostRef.current?.dispatchEvent(mouseEvt);

      // 일부 구현은 pointermove를 사용하기도 함
      try {
        const pointerEvt = new PointerEvent('pointermove', {
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          pointerType: 'mouse',
        });
        window.dispatchEvent(pointerEvt);
        document.dispatchEvent(pointerEvt);
        unicornHostRef.current?.dispatchEvent(pointerEvt);
      } catch {
        // ignore (PointerEvent 미지원 환경)
      }
    };

    // 부드러운 랜덤 워크
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    let tx = cx;
    let ty = cy;

    const pickTarget = () => {
      tx = Math.random() * window.innerWidth;
      ty = Math.random() * window.innerHeight;
    };
    pickTarget();
    targetTimerId = window.setInterval(pickTarget, 1400);

    const tick = () => {
      cx += (tx - cx) * 0.0425;
      cy += (ty - cy) * 0.0425;
      dispatchMoves(cx, cy);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', blockTrustedMouseMove, true);
      if (rafId != null) window.cancelAnimationFrame(rafId);
      if (targetTimerId != null) window.clearInterval(targetTimerId);
    };
  }, []);

  // UnicornStudio 배경 효과 로드 (SPA 라우팅에서도 1회 로드)
  useEffect(() => {
    const init = () => {
      try {
        window.UnicornStudio?.init?.();
      } catch {
        // ignore
      }
    };
    const safeInit = () => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
      } else {
        init();
      }
    };

    if (window.UnicornStudio?.init) {
      safeInit();
      return;
    }

    window.UnicornStudio = window.UnicornStudio ?? { isInitialized: false };

    const existing = document.getElementById('unicornstudio-script') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', safeInit, { once: true });
      return;
    }

    const s = document.createElement('script');
    s.id = 'unicornstudio-script';
    s.type = 'text/javascript';
    s.src =
      'https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.0.3/dist/unicornStudio.umd.js';
    s.onload = safeInit;
    (document.head || document.body).appendChild(s);
  }, []);

  useEffect(() => {
    if (!isSignInOpen && !isSearchOverlayOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSignInOpen(false);
        setIsSearchOverlayOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSignInOpen, isSearchOverlayOpen]);

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
  }, [isLoaded, isOnboardingCompleted, isSignedIn]);

  // 이미 온보딩 완료한 유저는 온보딩 페이지에 머무르지 않도록 메인으로
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;
    if (!isOnboardingCompleted) return;
    navigate('/', { replace: true });
  }, [isLoaded, isOnboardingCompleted, isSignedIn, navigate]);

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

  // NOTE:
  // 온보딩 step2에서는 "→" 버튼으로 사용자가 직접 메인 이동하도록 한다.
  // (기존 유저는 Clerk 로그인 redirectUrl/afterSignInUrl로 바로 '/'로 이동)

  return (
    <div className="min-h-screen w-full">
      {/* UnicornStudio 배경 */}
      <div className="fixed inset-0 -z-10 overflow-hidden bg-slate-50">
        <div
          ref={unicornHostRef}
          data-us-project="1pvEwZV7UqSMbyeQFdgj"
          style={{ width: '2560px', height: '1305px' }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        />
      </div>

      {/* 단일 레이아웃: 좌측 패널 제거 + 가운데 정렬 */}
      <div className="min-h-screen flex items-center justify-center px-6 py-10 md:px-14 md:py-16 bg-transparent">
        <div
          className={`w-full ${
            step === 2 ? 'max-w-[820px]' : 'max-w-[520px]'
          } rounded-3xl bg-white/85 backdrop-blur-md shadow-xl border border-white/60 px-6 py-8 md:px-10 md:py-10`}
        >
            {step === 1 ? (
              <>
                {/* 1페이지: 2페이지처럼 가운데/큰 UI */}
                <div className="space-y-7 text-center">
                  <div className="space-y-2">
                    <motion.div
                      key="onboarding-step1-title"
                      initial={{
                        opacity: 0,
                        y: shouldReduceMotion ? 0 : 32,
                        filter: shouldReduceMotion ? 'blur(0px)' : 'blur(8px)',
                      }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
                      className="text-[22px] md:text-[32px] font-black text-slate-900 tracking-tight"
                    >
                      집을 가지고 계신가요?
                    </motion.div>
                  </div>

                  <div className="flex flex-col md:flex-row items-stretch justify-center gap-3 w-full max-w-[640px] mx-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setHasHome(true);
                        setOnboardingStep(2);
                      }}
                      className="flex-1 h-12 md:h-14 rounded-2xl border border-slate-200 bg-white text-slate-900 font-black text-[15px] md:text-[16px] hover:bg-slate-50 transition-colors"
                    >
                      네, 있어요
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHasHome(false);
                        setOnboardingStep(2);
                      }}
                      className="flex-1 h-12 md:h-14 rounded-2xl border border-slate-200 bg-white text-slate-900 font-black text-[15px] md:text-[16px] hover:bg-slate-50 transition-colors"
                    >
                      아직 없어요
                    </button>
                  </div>

                  {!isSignedIn && (
                    <div className="text-[13px] text-slate-500">
                      계속하려면 먼저 로그인이 필요합니다.
                    </div>
                  )}
                </div>
              </>
            ) : (
              // step2: 메인 검색바 UI(임시) - 신규 유저 전용
              <motion.div
                layout
                transition={{
                  layout: {
                    type: 'spring',
                    stiffness: 260,
                    damping: 26,
                  },
                }}
                className="space-y-7 text-center"
              >
                <div className="space-y-2">
                  <motion.div
                    key={`onboarding-step2-title-${hasHome === true ? 'home' : 'interest'}`}
                    initial={{
                      opacity: 0,
                      y: shouldReduceMotion ? 0 : 32,
                      filter: shouldReduceMotion ? 'blur(0px)' : 'blur(8px)',
                    }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
                    className="text-[22px] md:text-[32px] font-black text-slate-900 tracking-tight"
                  >
                    {hasHome === true ? '당신의 집을 검색해주세요' : '당신이 관심있는 아파트를 검색해 주세요'}
                  </motion.div>
                  <motion.div
                    key="onboarding-step2-subtitle"
                    initial={{
                      opacity: 0,
                      y: shouldReduceMotion ? 0 : 32,
                      filter: shouldReduceMotion ? 'blur(0px)' : 'blur(10px)',
                    }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1], delay: 0.14 }}
                    className="text-[14px] md:text-[16px] text-slate-500"
                  >
                    예: 래미안, 자이, 힐스테이트
                  </motion.div>
                </div>

                <div className="w-full max-w-[640px] mx-auto space-y-3">
                  <div className="flex items-start gap-3 w-full">
                    {/* 검색창 + 검색결과: 같은 폭/같은 효과로 묶음 (→ 버튼 제외) */}
                    <motion.div
                      layout="position"
                      transition={{
                        layout: {
                          type: 'spring',
                          stiffness: 280,
                          damping: 28,
                        },
                      }}
                      // NOTE: 크기(스케일)는 고정해서 "줄었다/늘었다" 현상 방지
                      // (요청: 줄어있는 상태로 고정이 어렵다면 커져있는 상태로 유지)
                      className="flex-1 transition-all duration-200 transform-gpu scale-[1.03] z-10"
                    >
                      <div className="relative">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onFocus={() => {
                            if (searchCloseTimeoutRef.current) window.clearTimeout(searchCloseTimeoutRef.current);
                            setSelectionError(null);
                            setStep2Error(null);
                            setIsSearchOverlayOpen(true);
                          }}
                          onBlur={() => {
                            if (searchCloseTimeoutRef.current) window.clearTimeout(searchCloseTimeoutRef.current);
                            searchCloseTimeoutRef.current = window.setTimeout(() => setIsSearchOverlayOpen(false), 120);
                          }}
                          placeholder="아파트 이름을 검색하세요"
                          className={`w-full h-14 pl-14 pr-12 py-0 border rounded-2xl text-[16px] md:text-[18px] font-bold focus:outline-none transition-all ${
                            isSearchOverlayOpen
                              ? 'border-slate-300 ring-2 ring-slate-200 shadow-xl'
                              : 'border-slate-200 focus:border-slate-300 focus:ring-2 focus:ring-slate-200'
                          }`}
                        />
                        {isSearchOverlayOpen && isSearching && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2" aria-label="검색 중">
                            <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
                          </div>
                        )}
                      </div>

                      {/* 검색 결과: 검색창과 동일 폭 + 파란 테두리 제거 */}
                      <AnimatePresence mode="wait" initial={false}>
                        {isSearchOverlayOpen &&
                          query.trim().length >= 2 &&
                          (searchResults.length > 0 || !isSearching) && (
                          <motion.div
                            key={`results-block-${query.trim()}`}
                            layout
                            initial={{ opacity: 0, y: -12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                            className="mt-3 text-left w-full"
                          >
                            <AnimatePresence mode="wait" initial={false}>
                              {searchResults.length > 0 ? (
                                <motion.div
                                  layout
                                  key={`results-${query.trim()}`}
                                  initial="hidden"
                                  animate="show"
                                  exit="hidden"
                                  variants={{
                                    hidden: { opacity: 0, scale: 0.98 },
                                    show: {
                                      opacity: 1,
                                      scale: 1,
                                      transition: {
                                        when: 'beforeChildren',
                                        staggerChildren: 0.11,
                                        delayChildren: 0.04,
                                      },
                                    },
                                  }}
                                  className={`w-full rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xl ${
                                    isSearching ? 'opacity-70' : 'opacity-100'
                                  }`}
                                >
                                  {searchResults.map((apt) => (
                                    <motion.button
                                      key={String(apt.apt_id)}
                                      layout="position"
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        (async () => {
                                          if (!user) return;
                                          const aptIdNumber =
                                            typeof apt.apt_id === 'number' ? apt.apt_id : Number(apt.apt_id);
                                          if (!Number.isFinite(aptIdNumber)) {
                                            setSelectionError('아파트 ID가 올바르지 않습니다.');
                                            return;
                                          }

                                          try {
                                            setIsSubmittingSelection(true);
                                            setSelectionError(null);

                                            const token = await getToken();
                                            if (!token) throw new Error('NO_TOKEN');
                                            setAuthToken(token);

                                            if (hasHome === true) {
                                              // "네, 있어요" → 내 자산으로 등록
                                              await createMyProperty({
                                                apt_id: aptIdNumber,
                                                nickname: apt.apt_name,
                                                // 온보딩에서는 전용면적을 받지 않으므로 기본값(대시보드에서도 84를 기본값으로 사용)
                                                exclusive_area: 84,
                                              });
                                            } else {
                                              // "아직 없어요" → 관심 단지로 등록
                                              await addFavoriteApartment({ apt_id: aptIdNumber });
                                            }

                                            // 온보딩 완료 처리
                                            const prev = (user as any)?.unsafeMetadata ?? {};
                                            await user.update({
                                              unsafeMetadata: {
                                                ...prev,
                                                onboardingCompleted: true,
                                              },
                                            } as any);
                                            await (user as any).reload?.();

                                            // 신규 유저 첫 진입 시 기본 탭 유도 (1회성)
                                            try {
                                              window.localStorage.setItem(
                                                'onboarding.defaultTab',
                                                hasHome === true ? 'my' : 'favorites'
                                              );
                                              // 가드 레이스 방지용 1회성 플래그
                                              window.localStorage.setItem('onboarding.completedJustNow', '1');
                                            } catch {
                                              // ignore
                                            }

                                            if (hasHome === true) setHasRegisteredMyProperty(true);
                                            else setHasRegisteredFavorite(true);

                                            setQuery(apt.apt_name);
                                            setSearchResults([]);
                                            // 검색 결과를 클릭하면 바로 메인으로 이동 (기본 탭은 위에서 세팅한 onboarding.defaultTab 사용)
                                            navigate('/', { replace: true });
                                            setIsSearchOverlayOpen(false);
                                            searchInputRef.current?.blur();
                                          } catch (e) {
                                            setSelectionError(
                                              e instanceof Error && e.message === 'NO_TOKEN'
                                                ? '인증 토큰을 가져오지 못했습니다. 새로고침 후 다시 시도해 주세요.'
                                                : '등록에 실패했습니다. 잠시 후 다시 시도해 주세요.'
                                            );
                                          } finally {
                                            setIsSubmittingSelection(false);
                                          }
                                        })();
                                      }}
                                      disabled={isSubmittingSelection}
                                      variants={{
                                        hidden: { opacity: 0, x: -44 },
                                        show: {
                                          opacity: 1,
                                          x: 0,
                                          transition: { type: 'spring', stiffness: 620, damping: 36 },
                                        },
                                      }}
                                      className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      <div className="text-[15px] font-bold text-slate-900">{apt.apt_name}</div>
                                      {apt.address && (
                                        <div className="text-[12px] text-slate-500 mt-1">{apt.address}</div>
                                      )}
                                    </motion.button>
                                  ))}
                                </motion.div>
                              ) : !isSearching ? (
                                <motion.div
                                  key={`no-results-${query.trim()}`}
                                  layout
                                  initial={{ opacity: 0, y: -8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -8 }}
                                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                                  className="w-full rounded-2xl border border-slate-200 bg-white shadow-xl px-5 py-4 text-[13px] text-slate-400 font-medium"
                                >
                                  검색 결과가 없습니다.
                                </motion.div>
                              ) : null}
                            </AnimatePresence>

                            {isSubmittingSelection && (
                              <div className="mt-3 text-[13px] text-slate-400 font-medium px-1">등록 중...</div>
                            )}
                            {selectionError && (
                              <div className="mt-3 text-[13px] text-red-600 font-bold px-1">{selectionError}</div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    {/* → 버튼: 등록이 된 경우에만 메인으로 이동 */}
                    <button
                      type="button"
                      onClick={() => {
                        const ok =
                          hasHome === true
                            ? hasRegisteredMyProperty || hasExistingMyProperty || isOnboardingCompleted
                            : hasRegisteredFavorite || hasExistingFavorite || isOnboardingCompleted;
                        if (!ok) {
                          setStep2Error(
                            hasHome === true
                              ? '먼저 내 자산으로 등록할 아파트를 선택해 주세요.'
                              : '먼저 관심있는 아파트를 선택해 등록해 주세요.'
                          );
                          return;
                        }
                        // "아직 없어요" 선택 시 메인 진입 기본 탭은 항상 '관심 단지'로
                        // (혹시 onClick 흐름이 단순 navigate로 떨어져도 기본 탭이 유지되도록 선반영)
                        try {
                          window.localStorage.setItem(
                            'onboarding.defaultTab',
                            hasHome === true ? 'my' : 'favorites'
                          );
                        } catch {
                          // ignore
                        }
                        // 등록 이력은 있는데 메타가 아직 없다면(예: 재시도), 여기서 완료 처리까지 해준다
                        if (user && !isOnboardingCompleted) {
                          (async () => {
                            try {
                              const prev = (user as any)?.unsafeMetadata ?? {};
                              await user.update({
                                unsafeMetadata: {
                                  ...prev,
                                  onboardingCompleted: true,
                                },
                              } as any);
                              await (user as any).reload?.();
                              try {
                                window.localStorage.setItem(
                                  'onboarding.defaultTab',
                                  hasHome === true ? 'my' : 'favorites'
                                );
                                window.localStorage.setItem('onboarding.completedJustNow', '1');
                              } catch {
                                // ignore
                              }
                              navigate('/', { replace: true });
                            } catch {
                              setStep2Error('완료 처리에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
                            }
                          })();
                          return;
                        }
                        navigate('/', { replace: true });
                      }}
                      className={`w-14 h-14 rounded-2xl border flex items-center justify-center transition-all ${
                        hasHome === true
                          ? hasRegisteredMyProperty || hasExistingMyProperty || isOnboardingCompleted
                          : hasRegisteredFavorite || hasExistingFavorite || isOnboardingCompleted
                          ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                          : 'bg-white text-slate-300 border-slate-200'
                      }`}
                      aria-label="메인으로 이동"
                      title="메인으로 이동"
                    >
                      {isCheckingFavorite || isCheckingMyProperty ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <ArrowRight className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                </div>

                {step2Error && <div className="text-[14px] text-red-600 font-bold">{step2Error}</div>}
              </motion.div>
            )}

            {/* step 이동 버튼 (1 <-> 2): 2페이지에서만 노출 */}
            {step === 2 && (
              <div className="mt-7 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setOnboardingStep(1)}
                  disabled={!isSignedIn}
                  className={`h-11 px-5 rounded-2xl border font-black text-[14px] transition-colors ${
                    !isSignedIn
                      ? 'bg-white text-slate-300 border-slate-200 cursor-not-allowed'
                      : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  이전
                </button>
              </div>
            )}

            {/* 페이지 인디케이터 (step에 따라 활성 표시) */}
            <div className="mt-8 flex items-center justify-center gap-2" aria-label="온보딩 진행 단계">
              <span
                className={`h-2 w-2 rounded-full ${
                  step === 1
                    ? 'bg-slate-900 shadow-[0_0_0_4px_rgba(15,23,42,0.08)]'
                    : 'bg-slate-300'
                }`}
                aria-label={step === 1 ? '1단계(현재)' : '1단계'}
              />
              <span
                className={`h-2 w-2 rounded-full ${
                  step === 2
                    ? 'bg-slate-900 shadow-[0_0_0_4px_rgba(15,23,42,0.08)]'
                    : 'bg-slate-300'
                }`}
                aria-label={step === 2 ? '2단계(현재)' : '2단계'}
              />
            </div>
        </div>
      </div>

      {/* SignIn Modal */}
      {isSignInOpen && !isSignedIn && (
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
      )}
    </div>
  );
};

