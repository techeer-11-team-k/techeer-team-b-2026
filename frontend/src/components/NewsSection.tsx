import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { getNewsList, formatTimeAgo, NewsResponse } from '../lib/newsApi';
import { useAuth } from '../lib/clerk';

interface NewsSectionProps {
  isDarkMode: boolean;
}

export default function NewsSection({ isDarkMode }: NewsSectionProps) {
  const { isSignedIn, getToken } = useAuth();
  const [newsItems, setNewsItems] = useState<NewsResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 컴포넌트 마운트 시 뉴스 데이터 로드
    // API는 5분 캐시가 적용되어 있으므로 불필요한 중복 호출을 방지함
    let isMounted = true; // 컴포넌트 언마운트 시 상태 업데이트 방지
    
    const fetchNews = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const token = isSignedIn && getToken ? await getToken() : null;
        const response = await getNewsList(20, token); // 소스당 최대 20개
        
        // 응답 데이터 검증
        if (!response || !response.data || !Array.isArray(response.data)) {
          throw new Error('잘못된 응답 형식입니다.');
        }
        
        // 컴포넌트가 마운트된 상태에서만 상태 업데이트
        if (isMounted) {
          // 최대 3개만 표시 (UI 제한)
          setNewsItems(response.data.slice(0, 3));
        }
      } catch (err) {
        console.error('뉴스 로딩 실패:', err);
        if (isMounted) {
          const errorMessage = err instanceof Error 
            ? err.message 
            : '뉴스를 불러오는데 실패했습니다.';
          setError(errorMessage);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchNews();
    
    // 클린업 함수: 컴포넌트 언마운트 시 플래그 설정
    return () => {
      isMounted = false;
    };
  }, [isSignedIn, getToken]);

  const handleNewsClick = (url: string) => {
    // 뉴스 클릭 시 새 탭에서 열기
    // URL 유효성 검사
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      console.error('유효하지 않은 URL:', url);
      setError('유효하지 않은 뉴스 링크입니다.');
      return;
    }
    
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('링크 열기 실패:', err);
      setError('링크를 열 수 없습니다.');
    }
  };

  return (
    <div className={`rounded-3xl overflow-hidden border ${
      isDarkMode 
        ? 'bg-gradient-to-br from-zinc-900 to-zinc-900/50 border-white/10' 
        : 'bg-white border-black/5 shadow-lg shadow-black/5'
    }`}>
      <div className="p-5 pb-3">
        <h2 className={`font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
          주요 뉴스
        </h2>
        <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
          부동산 시장 소식
        </p>
      </div>
      
      <div>
        {isLoading ? (
          // 로딩 상태
          <div className="flex items-center justify-center py-8">
            <Loader2 className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-zinc-400' : 'text-zinc-400'}`} />
            <span className={`ml-2 text-sm ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              뉴스를 불러오는 중...
            </span>
          </div>
        ) : error ? (
          // 에러 상태
          <div className={`p-4 text-center ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
            <p className="text-sm">{error}</p>
          </div>
        ) : newsItems.length === 0 ? (
          // 뉴스가 없는 경우
          <div className={`p-4 text-center ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
            <p className="text-sm">표시할 뉴스가 없습니다.</p>
          </div>
        ) : (
          // 뉴스 목록 표시
          newsItems.map((news, index) => (
            <React.Fragment key={news.id}>
              <button
                onClick={() => handleNewsClick(news.url)}
                className={`w-full p-4 text-left transition-all active:scale-[0.98] active:brightness-90 border-t ${
                  isDarkMode
                    ? 'hover:bg-zinc-800/50 active:bg-zinc-800/70 border-white/5'
                    : 'hover:bg-sky-50/50 active:bg-sky-50 border-black/5'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold leading-snug mb-2 ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                      {news.title}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {news.category && (
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          isDarkMode 
                            ? 'bg-zinc-800 text-zinc-400' 
                            : 'bg-sky-50 text-sky-700'
                        }`}>
                          {news.category}
                        </span>
                      )}
                      <span className={`text-xs ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                        {news.source}
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-zinc-700' : 'text-zinc-400'}`}>
                        ·
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
                        {formatTimeAgo(news.published_at)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className={`w-5 h-5 flex-shrink-0 ${isDarkMode ? 'text-zinc-700' : 'text-zinc-300'}`} />
                </div>
              </button>
              {index < newsItems.length - 1 && (
                <div className={`h-px ${isDarkMode ? 'bg-white/5' : 'bg-black/5'}`} />
              )}
            </React.Fragment>
          ))
        )}
      </div>

      <button
        className={`w-full px-5 py-4 text-sm font-semibold transition-all active:scale-[0.98] active:brightness-90 border-t ${
          isDarkMode
            ? 'text-sky-400 hover:bg-zinc-800/50 active:bg-zinc-800/70 border-white/5'
            : 'text-sky-600 hover:bg-sky-50/50 active:bg-sky-50 border-black/5'
        }`}
        onClick={() => {
          // 더보기 버튼 클릭 시 처리 (추후 구현)
          console.log('더보기 클릭');
        }}
      >
        더보기
      </button>
    </div>
  );
}
