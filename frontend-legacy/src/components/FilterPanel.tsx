import React, { useState } from 'react';
import { X } from 'lucide-react';

interface FilterPanelProps {
  onClose: () => void;
  isDarkMode: boolean;
}

export default function FilterPanel({ onClose, isDarkMode }: FilterPanelProps) {
  const [priceRange, setPriceRange] = useState([0, 30]);
  const [area, setArea] = useState('');
  const [floor, setFloor] = useState('');
  const [buildYear, setBuildYear] = useState('');

  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-sky-800/30 shadow-[8px_8px_20px_rgba(0,0,0,0.5),-4px_-4px_12px_rgba(100,100,150,0.05)]'
    : 'bg-white border border-sky-100 shadow-[8px_8px_20px_rgba(163,177,198,0.2),-4px_-4px_12px_rgba(255,255,255,0.8)]';
  
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDarkMode ? 'text-slate-300' : 'text-slate-700';

  return (
    <div className={`rounded-2xl p-5 ${cardClass}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`font-bold ${textPrimary}`}>필터</h3>
        <button
          onClick={onClose}
          className={`p-1 rounded-lg transition-colors ${
            isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
          }`}
        >
          <X className={`w-5 h-5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} />
        </button>
      </div>

      <div className="space-y-4">
        {/* Price Range */}
        <div>
          <label className={`block text-sm font-semibold ${textSecondary} mb-2`}>
            가격 범위 (억원)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={priceRange[0]}
              onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
              className={`flex-1 px-3 py-2 rounded-lg border-2 focus:outline-none transition-colors ${
                isDarkMode
                  ? 'bg-slate-900/50 border-sky-800/50 focus:border-sky-500 text-slate-200'
                  : 'bg-slate-50 border-slate-200 focus:border-sky-500 text-slate-800'
              }`}
              placeholder="최소"
            />
            <span className={textSecondary}>~</span>
            <input
              type="number"
              value={priceRange[1]}
              onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
              className={`flex-1 px-3 py-2 rounded-lg border-2 focus:outline-none transition-colors ${
                isDarkMode
                  ? 'bg-slate-900/50 border-sky-800/50 focus:border-sky-500 text-slate-200'
                  : 'bg-slate-50 border-slate-200 focus:border-sky-500 text-slate-800'
              }`}
              placeholder="최대"
            />
          </div>
        </div>

        {/* Area */}
        <div>
          <label className={`block text-sm font-semibold ${textSecondary} mb-2`}>
            면적 (평)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {['20평대', '30평대', '40평대', '50평 이상'].map((option) => (
              <button
                key={option}
                onClick={() => setArea(option)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  area === option
                    ? 'bg-sky-600 text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
                    : isDarkMode
                    ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Floor */}
        <div>
          <label className={`block text-sm font-semibold ${textSecondary} mb-2`}>
            층수
          </label>
          <div className="grid grid-cols-3 gap-2">
            {['저층', '중층', '고층'].map((option) => (
              <button
                key={option}
                onClick={() => setFloor(option)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  floor === option
                    ? 'bg-sky-600 text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
                    : isDarkMode
                    ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Building Year */}
        <div>
          <label className={`block text-sm font-semibold ${textSecondary} mb-2`}>
            건축연도
          </label>
          <select
            value={buildYear}
            onChange={(e) => setBuildYear(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border-2 focus:outline-none transition-colors ${
              isDarkMode
                ? 'bg-slate-900/50 border-sky-800/50 focus:border-sky-500 text-slate-200'
                : 'bg-slate-50 border-slate-200 focus:border-sky-500 text-slate-800'
            }`}
          >
            <option value="">전체</option>
            <option value="2020">2020년 이후</option>
            <option value="2010">2010년 이후</option>
            <option value="2000">2000년 이후</option>
          </select>
        </div>

        {/* Apply Button */}
        <button className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-98">
          필터 적용
        </button>
      </div>
    </div>
  );
}