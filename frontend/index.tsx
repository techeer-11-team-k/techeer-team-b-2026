import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';

// Clerk Publishable Key (환경 변수에서 가져오기)
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

// Clerk 키 확인 및 경고
if (!CLERK_PUBLISHABLE_KEY) {
  console.warn(
    '%c[Clerk Warning] Clerk publishable key not found!',
    'color: orange; font-weight: bold;',
    '\n\nAuthentication features will be disabled.',
    '\n\nTo enable authentication:',
    '\n1. Create a .env file in the frontend-test directory',
    '\n2. Add: VITE_CLERK_PUBLISHABLE_KEY=your-key-here',
    '\n3. Get your key from: https://dashboard.clerk.com',
    '\n\nThe app will continue to work without authentication.'
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ClerkProvider 
      publishableKey={CLERK_PUBLISHABLE_KEY}
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
  </React.StrictMode>
);