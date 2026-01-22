import React from 'react';
import { ChevronRight, Newspaper } from 'lucide-react';

interface NewsSectionProps {
  isDarkMode: boolean;
}

const newsItems = [
  {
    title: '서울 아파트값 2주 연속 상승세 지속',
    source: '부동산114',
    time: '2시간 전',
    category: '시장동향',
  },
  {
    title: '정부, 주택공급 확대 방안 발표 예정',
    source: '국토교통부',
    time: '5시간 전',
    category: '정책',
  },
  {
    title: '전세사기 피해 예방 체크리스트 공개',
    source: '한국부동산원',
    time: '1일 전',
    category: '전세',
  },
];

export default function NewsSection({ isDarkMode }: NewsSectionProps) {
  return (
    <div className={`mb-4 rounded-2xl border overflow-hidden ${
      isDarkMode
        ? 'bg-zinc-900 border-zinc-800'
        : 'bg-white border-zinc-200'
    }`}>
      {/* 헤더 */}
      <div className={`p-5 pb-3 border-b ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
        <h2 className={`font-bold text-lg flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
          <Newspaper className={`w-5 h-5 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`} />
          주요 뉴스
        </h2>
        <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-500'}`}>
          부동산 시장 소식
        </p>
      </div>
      
      {/* 뉴스 목록 */}
      <div>
        {newsItems.map((news, index) => (
          <button
            key={index}
            className={`w-full p-4 text-left transition-all active:scale-[0.98] active:brightness-90 border-t ${
              isDarkMode
                ? 'hover:bg-zinc-800/50 active:bg-zinc-800/70 border-white/5'
                : 'hover:bg-sky-50/50 active:bg-sky-50 border-black/5'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold leading-snug mb-1 ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  {news.title}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    isDarkMode
                      ? 'bg-zinc-800 text-zinc-400'
                      : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    {news.category}
                  </span>
                  <span className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                    {news.source}
                  </span>
                  <span className={`text-xs ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    ·
                  </span>
                  <span className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                    {news.time}
                  </span>
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`} />
            </div>
          </button>
        ))}
      </div>

      {/* 더보기 버튼 */}
      <button
        className={`w-full px-5 py-4 text-sm font-semibold transition-all active:scale-[0.98] active:brightness-90 border-t ${
          isDarkMode
            ? 'text-sky-400 hover:bg-zinc-800/50 active:bg-zinc-800/70 border-white/5'
            : 'text-sky-600 hover:bg-sky-50/50 active:bg-sky-50 border-black/5'
        }`}
      >
        더보기
      </button>
    </div>
  );
}
