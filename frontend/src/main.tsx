import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import AppRouter from './AppRouter'
import './index.css'

// Clerk Publishable Key (환경변수에서 가져오기)
// ⚠️ 보안: API 키는 절대 하드코딩하지 않습니다. 환경변수에서만 가져옵니다.
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error(
    'VITE_CLERK_PUBLISHABLE_KEY가 설정되지 않았습니다.\n' +
    '프로젝트 루트의 .env 파일에 VITE_CLERK_PUBLISHABLE_KEY를 추가하세요.'
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <AppRouter />
    </ClerkProvider>
  </React.StrictMode>,
)
