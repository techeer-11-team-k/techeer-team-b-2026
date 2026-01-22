import { useState, useEffect } from 'react'
import App from './App'
import DbViewer from './DbViewer'

function AppRouter() {
  const [currentPage, setCurrentPage] = useState<string>('home')

  useEffect(() => {
    // URL hash 변경 감지
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') || 'home'
      // Clerk SignIn 관련 hash는 무시 (sign-in 등)
      if (!hash.startsWith('sign-') && !hash.startsWith('/sign-')) {
        setCurrentPage(hash)
      }
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // 페이지 라우팅
  switch (currentPage) {
    case 'db':
      return <DbViewer />
    case 'home':
    default:
      return <App />
  }
}

export default AppRouter
