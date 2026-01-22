import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, X, ExternalLink, RefreshCw } from 'lucide-react';
import { fetchNews, fetchNewsDetail, type NewsItem as ApiNewsItem } from '../../services/api';

interface NewsItem {
  id: string;
  title: string;
  description: string;
  date: string;
  category: string;
  source: string;
  image: string;
  fullContent: string;
  url: string;
}

// 기본 이미지 목록
const defaultImages = [
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&h=300&fit=crop',
];

// API 응답을 컴포넌트 NewsItem으로 변환
const mapApiToNewsItem = (item: ApiNewsItem, index: number): NewsItem => ({
  id: item.id,
  title: item.title,
  description: item.summary || item.content?.slice(0, 100) || '',
  date: item.date,
  category: item.category || '부동산',
  source: item.source,
  image: item.thumbnail || defaultImages[index % defaultImages.length],
  fullContent: item.content || item.summary || '',
  url: item.url,
});

export const PolicyNewsList: React.FC = () => {
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 뉴스 로드 함수
  const loadNews = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchNews(5);
      if (response.success && response.data) {
        setNewsList(response.data.map(mapApiToNewsItem));
      }
    } catch (err) {
      console.error('뉴스 로드 실패:', err);
      setError('뉴스를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 컴포넌트 마운트 시 뉴스 로드
  useEffect(() => {
    loadNews();
  }, [loadNews]);

  // 모달이 열릴 때 스크롤 고정
  useEffect(() => {
    if (selectedNews) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedNews]);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      '정책': 'bg-brand-blue text-white',
      '분양': 'bg-purple-500 text-white',
      '시장동향': 'bg-green-500 text-white',
      '인프라': 'bg-orange-500 text-white',
    };
    return colors[category] || 'bg-slate-500 text-white';
  };

  const handleExternalLink = (e: React.MouseEvent, news: NewsItem) => {
    e.stopPropagation();
    if (news.url) {
      window.open(news.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <div className="bg-white rounded-[28px] p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100/80 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">정책 및 뉴스</h2>
          <button 
            onClick={loadNews}
            className="text-[13px] font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 hover:bg-slate-50 p-2 rounded-lg transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 min-h-0">
          {isLoading ? (
            // 로딩 스켈레톤
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-2xl border border-slate-100 animate-pulse">
                <div className="w-20 h-20 rounded-xl bg-slate-200"></div>
                <div className="flex-1">
                  <div className="h-4 w-16 bg-slate-200 rounded mb-2"></div>
                  <div className="h-5 w-3/4 bg-slate-200 rounded mb-2"></div>
                  <div className="h-4 w-full bg-slate-200 rounded"></div>
                </div>
              </div>
            ))
          ) : error ? (
            // 에러 상태
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
              <p className="text-[14px] mb-2">{error}</p>
              <button 
                onClick={loadNews}
                className="text-[13px] text-blue-500 hover:text-blue-600 font-bold"
              >
                다시 시도
              </button>
            </div>
          ) : newsList.length === 0 ? (
            // 뉴스 없음
            <div className="flex items-center justify-center h-full text-slate-400">
              <p className="text-[14px]">뉴스가 없습니다.</p>
            </div>
          ) : (
            // 뉴스 목록
            newsList.map((news) => (
              <div
                key={news.id}
                onClick={() => setSelectedNews(news)}
                className="group relative flex items-start gap-4 p-4 rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all cursor-pointer"
              >
                {/* 외부 링크 아이콘 */}
                <button
                  onClick={(e) => handleExternalLink(e, news)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors opacity-0 group-hover:opacity-100"
                  title="원문 보기"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                
                {/* 썸네일 이미지 */}
                <div className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-slate-100">
                  <img 
                    src={news.image} 
                    alt={news.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = defaultImages[0];
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${getCategoryColor(news.category)}`}>
                      {news.category}
                    </span>
                    <span className="text-[11px] text-slate-400">{news.date}</span>
                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                    <span className="text-[11px] text-slate-400">{news.source}</span>
                  </div>
                  <h3 className="text-[15px] font-black text-slate-900 mb-1 group-hover:text-brand-blue transition-colors line-clamp-1">
                    {news.title}
                  </h3>
                  <p className="text-[13px] text-slate-500 font-medium line-clamp-2">
                    {news.description}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* News Detail Modal */}
      {selectedNews && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedNews(null)}
          ></div>
          <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* 헤더 이미지 */}
            <div className="relative h-48 w-full flex-shrink-0">
              <img 
                src={selectedNews.image} 
                alt={selectedNews.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
              <button 
                onClick={() => setSelectedNews(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/90 hover:bg-white text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="absolute bottom-4 left-6 right-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${getCategoryColor(selectedNews.category)}`}>
                    {selectedNews.category}
                  </span>
                  <span className="text-[12px] text-white/90">{selectedNews.date}</span>
                  <span className="w-1 h-1 bg-white/60 rounded-full"></span>
                  <span className="text-[12px] text-white/90">{selectedNews.source}</span>
                </div>
                <h2 className="text-2xl font-black text-white">{selectedNews.title}</h2>
              </div>
            </div>
            
            {/* 본문 */}
            <div className="p-6 overflow-y-auto">
              <p className="text-[15px] text-slate-700 font-medium leading-relaxed mb-6">
                {selectedNews.description}
              </p>
              
              <div className="border-t border-slate-100 pt-6">
                <h4 className="text-[15px] font-black text-slate-900 mb-4">상세 내용</h4>
                <p className="text-[14px] text-slate-600 leading-[1.8]">
                  {selectedNews.fullContent}
                </p>
              </div>
              
              {/* 원문 보기 버튼 */}
              {selectedNews.url && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <a 
                    href={selectedNews.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg font-bold text-[14px] hover:bg-blue-600 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    원문 보기
                  </a>
                </div>
              )}
              
              {/* 관련 태그 */}
              <div className="mt-6 pt-6 border-t border-slate-100">
                <p className="text-[12px] font-bold text-slate-500 mb-3">관련 키워드</p>
                <div className="flex flex-wrap gap-2">
                  {['부동산', selectedNews.category, selectedNews.source, '투자', '시세'].map((tag, index) => (
                    <span key={index} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-[12px] font-bold rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
