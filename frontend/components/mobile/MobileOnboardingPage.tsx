import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { MobileAuth } from './MobileAuth';
import { MobileOnboardingFlow } from './MobileOnboardingFlow';

export const MobileOnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, user } = useUser();
  const [phase, setPhase] = useState<'auth' | 'flow'>('auth');

  const isOnboardingCompleted = Boolean((user as any)?.unsafeMetadata?.onboardingCompleted);

  // 온보딩 완료 유저는 메인으로 보내기
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;
    if (!isOnboardingCompleted) return;
    navigate('/', { replace: true });
  }, [isLoaded, isSignedIn, isOnboardingCompleted, navigate]);

  const handlePrimaryStart = () => {
    navigate('/', { replace: true });
  };

  const handleSecondarySkip = () => {
    navigate('/', { replace: true });
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center bg-slate-950 text-white md:hidden">
        <div className="text-sm text-slate-300">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden md:hidden">
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

      {/* 인증 단계 → 온보딩 풀스크린 오버레이 순서 */}
      {phase === 'auth' && (
        <MobileAuth
          onAuthenticated={() => {
            setPhase('flow');
          }}
        />
      )}

      {phase === 'flow' && (
        <MobileOnboardingFlow
          onPrimaryAction={handlePrimaryStart}
          onSecondaryAction={handleSecondarySkip}
        />
      )}
    </div>
  );
};