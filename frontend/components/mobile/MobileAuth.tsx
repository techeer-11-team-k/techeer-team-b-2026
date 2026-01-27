import React from 'react';
import { motion } from 'framer-motion';
import { SignIn, useUser } from '@clerk/clerk-react';
import { cardSpring } from './animations';

interface MobileAuthProps {
  onAuthenticated: () => void;
}

export const MobileAuth: React.FC<MobileAuthProps> = ({ onAuthenticated }) => {
  const { isLoaded, isSignedIn, user } = useUser();

  React.useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && user) {
      const isOnboardingCompleted = Boolean((user as any)?.unsafeMetadata?.onboardingCompleted);
      if (!isOnboardingCompleted) {
        onAuthenticated();
      }
    }
  }, [isLoaded, isSignedIn, user, onAuthenticated]);

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center bg-gradient-to-b from-white via-sky-50/60 to-white text-slate-900">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <div className="absolute -inset-32 bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.65),transparent_55%),radial-gradient(circle_at_bottom,_rgba(219,234,254,0.8),transparent_55%)] blur-3xl" />
      </motion.div>

      <motion.div
        variants={cardSpring}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex w-full flex-col items-center px-4 py-10"
      >
        <div className="mb-6 w-full max-w-md text-left">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            로그인
          </div>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">
            내 집과 자산을
            <br />
            안전하게 이어붙입니다
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
            하나의 계정으로 내 집, 내 자산, 그리고 부동산 흐름까지 끊김 없이 확인해 보세요.
          </p>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white/95 px-4 py-5 shadow-[0_18px_45px_rgba(148,163,184,0.45)] backdrop-blur-xl">
          {!isLoaded && (
            <div className="space-y-3">
              <div className="h-10 rounded-xl bg-slate-100" />
              <div className="h-10 rounded-xl bg-slate-100/80" />
              <div className="h-10 rounded-xl bg-slate-100/70" />
            </div>
          )}

          {isLoaded && (
            <SignIn
              routing="path"
              path="/m/onboarding"
              redirectUrl="/"
              afterSignInUrl="/"
              afterSignUpUrl="/m/onboarding"
              appearance={{
                variables: {
                  colorBackground: 'rgba(255,255,255,0)',
                  colorInputBackground: '#ffffff',
                  colorPrimary: '#0f172a',
                  colorText: '#0f172a',
                  colorTextSecondary: '#64748b',
                  borderRadius: '16px',
                  fontSize: '14px',
                },
                elements: {
                  card: 'shadow-none border-none bg-transparent p-0',
                  headerTitle: 'text-[17px] font-semibold text-slate-900',
                  headerSubtitle: 'text-[13px] text-slate-500',
                  formButtonPrimary:
                    'h-10 rounded-xl bg-slate-900 text-slate-50 text-[14px] font-semibold shadow-sm hover:bg-slate-800 active:scale-95 transition-all',
                  socialButtonsBlockButton:
                    'h-10 rounded-xl border border-slate-200 bg-slate-50 text-[13px] text-slate-800 hover:bg-slate-100 active:scale-95 transition-all',
                  socialButtonsBlockButtonText: 'text-[13px] font-medium',
                  formFieldInput:
                    'h-10 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-900 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-900',
                  footer: 'hidden',
                },
              }}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
};

