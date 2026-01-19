import React, { useState } from 'react';
import { X, Bell, Eye, MessageSquare, Settings, BarChart3, HelpCircle, ChevronRight, ChevronDown, Moon, Sun, User, LogOut } from 'lucide-react';
import { useUser, useClerk, SafeSignOutButton, SafeSignInButton } from '@/lib/clerk';
import profileImage from 'figma:asset/f50330cf8eedd4191cc6fb784733e002b991b7cb.png';

// SafeSignOutButton은 lib/clerk에서 import하므로 여기서 정의 제거

interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export default function ProfileMenu({ isOpen, onClose, isDarkMode, onToggleDarkMode }: ProfileMenuProps) {
  // Clerk가 설정되지 않은 경우를 대비한 안전장치
  let isSignedIn = false;
  let user = null;
  let clerk: ReturnType<typeof useClerk> | null = null;
  
  try {
    const userData = useUser();
    clerk = useClerk();
    isSignedIn = userData.isSignedIn || false;
    user = userData.user || null;
  } catch (error) {
    // Clerk Provider가 없거나 설정되지 않은 경우
    console.warn('Clerk가 설정되지 않았습니다:', error);
  }
  
  // 개인정보 수정 모달 열기
  const handleOpenUserProfile = () => {
    if (clerk?.openUserProfile) {
      clerk.openUserProfile();
    }
  };
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  if (!isOpen) return null;

  const menuItems = [
    { icon: Bell, label: '공식 메뉴', count: null, color: 'text-sky-500' },
    { icon: Eye, label: '최근 본 매물', count: null, color: 'text-purple-500' },
    { icon: MessageSquare, label: '판매자 후기', count: null, color: 'text-pink-500' },
    { icon: Settings, label: '알림 설정', count: null, color: 'text-orange-500' },
    { icon: BarChart3, label: '부동산 통계사진', count: null, color: 'text-green-500' },
    { icon: HelpCircle, label: '고객센터', count: null, color: 'text-blue-500' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Profile Menu */}
      <div className="fixed inset-x-0 top-0 z-50 mx-auto" style={{ maxWidth: '500px' }}>
        <div className="bg-white dark:bg-zinc-950 shadow-2xl animate-slideDown" style={{ maxHeight: '100vh', overflowY: 'auto' }}>
          {/* Header */}
          <div className="sticky top-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-black/5 dark:border-white/10 z-10">
            <div className="pt-safe">
              <div className="px-5 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">마이페이지</h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-6 space-y-4">
            {/* User Profile Section */}
            {isSignedIn && user ? (
              <div 
                className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-3xl p-6 text-white cursor-pointer hover:opacity-95 transition-opacity"
                onClick={handleOpenUserProfile}
              >
                <div className="flex flex-col items-center justify-center gap-3">
                  {user.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.firstName || 'User'}
                      className="w-20 h-20 rounded-full border-2 border-white/30 shadow-lg object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center shadow-lg">
                      <span className="text-2xl font-bold">
                        {user.firstName?.[0] || user.emailAddresses[0]?.emailAddress[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-center">
                    {user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.emailAddresses[0]?.emailAddress?.split('@')[0] || '사용자'}
                  </h3>
                </div>
              </div>
            ) : (
              <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-3xl p-6 border border-black/5 dark:border-white/5 text-center">
                <div className="flex flex-col items-center justify-center h-full py-8">
                  <div className="w-20 h-20 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center mb-4">
                    <span className="text-3xl text-zinc-400">?</span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 mb-6">로그인이 필요합니다</p>
                  <SafeSignInButton mode="modal">
                    <button className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-medium transition-colors">
                      로그인
                    </button>
                  </SafeSignInButton>
                </div>
              </div>
            )}

            {/* 계정 정보 카드 */}
            {isSignedIn && (
              <button
                onClick={handleOpenUserProfile}
                className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-2xl transition-colors group border border-black/5 dark:border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-xl">
                    <User className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <span className="font-medium text-zinc-900 dark:text-white">
                    계정 정보
                  </span>
                </div>
                <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors" />
              </button>
            )}

            {/* 설정 */}
            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-black/5 dark:border-white/5 overflow-hidden">
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-200 dark:bg-zinc-800 rounded-xl">
                    <Settings className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                  </div>
                  <span className="font-medium text-zinc-900 dark:text-white">
                    설정
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronDown 
                    className="w-5 h-5 text-zinc-400 dark:text-zinc-600 transition-transform duration-200"
                    style={{ transform: isSettingsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </div>
              </button>
              
              {/* 설정 펼침 영역 */}
              {isSettingsOpen && (
                <div className="border-t border-black/5 dark:border-white/5">
                  {/* 다크모드 토글 */}
                  <button
                    onClick={onToggleDarkMode}
                    className="w-full flex items-center justify-between p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-zinc-200 dark:bg-zinc-800 rounded-xl">
                        <Moon className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <span className="font-medium text-zinc-900 dark:text-white">
                        다크 모드
                      </span>
                    </div>
                    <span className={`text-sm font-semibold ${isDarkMode ? 'text-sky-500' : 'text-zinc-400'}`}>
                      {isDarkMode ? 'OFF' : 'ON'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* 로그아웃 카드 */}
            {isSignedIn && (
              <SafeSignOutButton>
                <button 
                  className="w-full flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-2xl transition-colors group border border-red-200 dark:border-red-800/30"
                  onClick={() => {
                    console.log('로그아웃 시도');
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                      <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      로그아웃
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-red-400 dark:text-red-600 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" />
                </button>
              </SafeSignOutButton>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </>
  );
}