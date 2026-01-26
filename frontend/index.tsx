import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { saveInstallPrompt, isWebView, isPWAInstalled } from './utils/pwa';

// Clerk Publishable Key (환경 변수에서 가져오기)
// Vite는 VITE_ 접두사가 붙은 환경 변수만 클라이언트에서 사용 가능
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

// Clerk 키 확인 및 경고
if (!CLERK_PUBLISHABLE_KEY) {
  console.warn(
    '%c[Clerk Warning] Clerk publishable key not found!',
    'color: orange; font-weight: bold;',
    '\n\nAuthentication features will be disabled.',
    '\n\nTo enable authentication:',
    '\n1. Create/update .env file in the frontend directory',
    '\n2. Add: VITE_CLERK_PUBLISHABLE_KEY=your-key-here',
    '\n3. Get your key from: https://dashboard.clerk.com',
    '\n4. Restart the dev server',
    '\n\nThe app will continue to work without authentication.'
  );
}

// PWA 설치 프롬프트 처리
const setupPWAInstallPrompt = () => {
  // WebView나 이미 설치된 경우 건너뛰기
  if (isWebView() || isPWAInstalled()) {
    return;
  }

  // beforeinstallprompt 이벤트 리스너 등록
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // 기본 브라우저 프롬프트 방지
    e.preventDefault();
    // 이벤트 저장 (나중에 사용)
    saveInstallPrompt(e as any);
    console.log('📱 PWA 설치 프롬프트 준비됨');
  });

  // 설치 완료 감지
  window.addEventListener('appinstalled', () => {
    console.log('✅ PWA 설치 완료');
    // 설치 완료 후 필요한 작업 수행
  });
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// PWA 설치 프롬프트 설정
setupPWAInstallPrompt();

const root = ReactDOM.createRoot(rootElement);

// Clerk 키가 없어도 앱이 작동하도록 조건부 렌더링
// Layout 컴포넌트가 Clerk 훅을 사용하므로, 항상 ClerkProvider로 감싸야 함
// Clerk 키가 없을 때는 ErrorBoundary로 감싸서 에러가 발생해도 앱이 계속 작동하도록 함
const AppWithProviders = () => {
  // Clerk 키가 없으면 유효하지 않은 키를 사용하되, ErrorBoundary로 감싸서 에러 처리
  // Layout 컴포넌트에서 Clerk 훅을 사용하므로 ClerkProvider는 항상 필요
  const clerkKey = CLERK_PUBLISHABLE_KEY || 'pk_test_no_key_provided';
  
  return (
    <ErrorBoundary>
      <ClerkProvider 
        publishableKey={clerkKey}
        appearance={{
          variables: {
            colorPrimary: '#3182F6',
            colorBackground: '#ffffff',
            colorInputBackground: '#f8fafc',
            colorInputText: '#0f172a',
            borderRadius: '12px',
          }
        }}
      >
        <App />
      </ClerkProvider>
    </ErrorBoundary>
  );
};

root.render(
  <React.StrictMode>
    <AppWithProviders />
  </React.StrictMode>
);