import React from 'react';
import { X, Bell, Eye, MessageSquare, Settings, BarChart3, HelpCircle, ChevronRight, Moon, Sun } from 'lucide-react';
import { useUser, SafeSignOutButton, SafeSignInButton } from '@/lib/clerk';
import profileImage from 'figma:asset/f50330cf8eedd4191cc6fb784733e002b991b7cb.png';
import DevelopmentPlaceholder from './DevelopmentPlaceholder';

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
  
  try {
    const userData = useUser();
    isSignedIn = userData.isSignedIn || false;
    user = userData.user || null;
  } catch (error) {
    // Clerk Provider가 없거나 설정되지 않은 경우
    console.warn('Clerk가 설정되지 않았습니다:', error);
  }
  
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
      <div className="fixed inset-x-0 top-0 z-50 max-w-md mx-auto">
        <div className="bg-white dark:bg-zinc-950 min-h-screen shadow-2xl animate-slideDown">
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
              <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-3xl p-5 text-white">
                <div className="flex items-center gap-4 mb-4">
                  {user.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.firstName || 'User'}
                      className="w-16 h-16 rounded-full border-2 border-white/20"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                      <span className="text-2xl font-bold">
                        {user.firstName?.[0] || user.emailAddresses[0]?.emailAddress[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold">
                      {user.firstName || user.emailAddresses[0]?.emailAddress || '사용자'}
                    </h3>
                    <p className="text-sm text-white/80">
                      {user.emailAddresses[0]?.emailAddress}
                    </p>
                  </div>
                </div>
                <SafeSignOutButton>
                  <button 
                    className="w-full px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors"
                    onClick={() => {
                      // Clerk가 없을 때를 대비한 폴백
                      console.log('로그아웃 시도 (Clerk가 설정되지 않았을 수 있음)');
                    }}
                  >
                    로그아웃
                  </button>
                </SafeSignOutButton>
              </div>
            ) : (
              <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-3xl p-5 border border-black/5 dark:border-white/5 text-center">
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">로그인이 필요합니다</p>
                <SafeSignInButton mode="modal">
                  <button className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-medium transition-colors">
                    로그인
                  </button>
                </SafeSignInButton>
              </div>
            )}

            {/* 개발 중 - 추가 기능 카드들 */}
            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-3xl p-5 border border-black/5 dark:border-white/5">
              <DevelopmentPlaceholder 
                title="개발 중입니다"
                message="추가 기능을 준비 중입니다."
                isDarkMode={isDarkMode}
                className="py-6"
              />
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={onToggleDarkMode}
              className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 rounded-2xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded-xl">
                  {isDarkMode ? (
                    <Sun className="w-5 h-5 text-amber-500" />
                  ) : (
                    <Moon className="w-5 h-5 text-sky-600" />
                  )}
                </div>
                <span className="font-medium text-zinc-900 dark:text-white">
                  {isDarkMode ? '라이트 모드' : '다크 모드'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors" />
              </div>
            </button>

            {/* 개발 중 - 메뉴 아이템들 */}
            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-3xl p-5 border border-black/5 dark:border-white/5">
              <DevelopmentPlaceholder 
                title="개발 중입니다"
                message="메뉴 기능들을 준비 중입니다."
                isDarkMode={isDarkMode}
                className="py-6"
              />
            </div>
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