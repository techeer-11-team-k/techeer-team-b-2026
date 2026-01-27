import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

type MobileOnboardingFlowProps = {
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
};

const ROTATING_WORDS = ['내 자산을', '내 집을', '집 비교를', '부동산 흐름을'] as const;

export const MobileOnboardingFlow: React.FC<MobileOnboardingFlowProps> = ({
  onPrimaryAction,
  onSecondaryAction,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isBlurAnimating, setIsBlurAnimating] = useState(false);

  // 2초 간격으로 단어 순환 + 150ms 정도 blur 효과
  useEffect(() => {
    let timeoutId: number | null = null;

    const interval = window.setInterval(() => {
      setIsBlurAnimating(true);

      timeoutId = window.setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
        setIsBlurAnimating(false);
      }, 150);
    }, 2000);

    return () => {
      window.clearInterval(interval);
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const titleWord = ROTATING_WORDS[currentIndex];

  return (
    // 모바일 전용 온보딩 풀스크린 화면 (흰색 + 파란 그라데이션 배경)
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)', transition: { duration: 0.3 } }}
      className="fixed inset-0 z-[140] flex flex-col bg-white md:hidden"
    >
      <style>{`
        @keyframes gradientFlowMobile {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animated-bg-mobile {
          background: linear-gradient(-45deg, #ffffff, #f5f3ff, #e0f2fe, #ffffff);
          background-size: 400% 400%;
          animation: gradientFlowMobile 15s ease infinite;
        }
      `}</style>
      <div className="absolute inset-0 animated-bg-mobile" />
      {/* 컨텐츠 영역: 안전 영역 고려 -> relative로 설정하여 배경 위에 표시 */}
      <div className="relative flex min-h-[100dvh] flex-col justify-between px-6 pt-12 pb-8 sm:px-8 sm:pt-14 sm:pb-10">
        {/* 상단 타이틀/부제목 */}
        <div className="space-y-4">
          <div
            className="leading-tight"
            style={{
              fontFamily:
                'Pretendard, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            <div
              className={[
                'text-[72px] leading-[1.05] font-extrabold text-slate-900 sm:text-[78px]',
                'transition-all duration-150',
                isBlurAnimating ? 'blur-sm opacity-60' : 'blur-0 opacity-100',
              ].join(' ')}
            >
              {titleWord}
            </div>
            <div className="mt-1 text-[72px] leading-[1.05] font-extrabold text-slate-900 sm:text-[78px]">
              한 번에
            </div>
          </div>

          <p className="text-[14px] text-slate-600 sm:text-[15px]">
            내 집과 자산 흐름을 한 번에 정리하고 비교할 수 있게 깔끔하게 묶어드릴게요.
          </p>
        </div>

        {/* 하단 버튼 영역: 한 줄에 버튼 하나씩 세로 배치 (모바일에서 조금 더 큼) */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="h-14 w-full rounded-2xl bg-slate-900 text-[18px] font-bold text-white shadow-md shadow-slate-900/10 transition-colors active:bg-slate-950 sm:h-14"
          >
            바로 시작하기
          </button>
          <button
            type="button"
            onClick={onSecondaryAction}
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white text-[17px] font-bold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 sm:h-14"
          >
            나중에 둘러볼게요
          </button>
        </div>
      </div>
    </motion.div>
  );
};

