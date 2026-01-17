import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface DynamicIslandToastProps {
  message: string;
  isVisible: boolean;
  duration?: number;
  isDarkMode?: boolean;
  type?: ToastType;
  onHide?: () => void;
}

/**
 * iOS 다이나믹 아일랜드 스타일의 토스트 컴포넌트
 * 위에서 스르륵 내려왔다가 자동으로 사라집니다.
 */
export function DynamicIslandToast({
  message,
  isVisible,
  duration = 3000,
  isDarkMode = false,
  type = 'info',
  onHide,
}: DynamicIslandToastProps) {
  // 타입별 스타일 설정
  const getToastStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: isDarkMode ? 'bg-green-600' : 'bg-green-500',
          border: isDarkMode ? 'border-green-500/50' : 'border-green-400/50',
          text: 'text-white',
          icon: <CheckCircle2 className="w-5 h-5" />,
        };
      case 'warning':
        return {
          bg: 'bg-orange-500',
          border: 'border-orange-400/50',
          text: 'text-white',
          icon: <AlertTriangle className="w-5 h-5" />,
        };
      case 'error':
        return {
          bg: 'bg-red-600',
          border: 'border-red-500/50',
          text: 'text-white',
          icon: <XCircle className="w-5 h-5" />,
        };
      case 'info':
      default:
        return {
          bg: isDarkMode ? 'bg-zinc-900' : 'bg-white',
          border: isDarkMode ? 'border-zinc-700/50' : 'border-zinc-200/50',
          text: isDarkMode ? 'text-white' : 'text-zinc-900',
          icon: <Info className="w-5 h-5" />,
        };
    }
  };

  const styles = getToastStyles();
  const [mounted, setMounted] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    
    // Portal을 위한 컨테이너 생성 또는 찾기
    if (typeof window !== 'undefined' && document.body) {
      let container = document.getElementById('dynamic-island-portal');
      if (!container) {
        container = document.createElement('div');
        container.id = 'dynamic-island-portal';
        container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483647;';
        document.body.appendChild(container);
      }
      setPortalContainer(container);
    }

    return () => {
      const portal = document.getElementById('dynamic-island-portal');
      if (portal && portal.children.length === 0) {
        portal.remove();
      }
    };
  }, []);

  // 디버깅: 상태 확인
  useEffect(() => {
    if (isVisible && message) {
      console.log('🔔 다이나믹 아일랜드 표시:', { message, isVisible, mounted, portalContainer: !!portalContainer });
    }
  }, [isVisible, message, mounted, portalContainer]);

  if (!mounted || typeof window === 'undefined' || !portalContainer) {
    return null;
  }

  return createPortal(
    <AnimatePresence mode="wait">
      {isVisible && message && (
        <motion.div
          key={`toast-${Date.now()}-${message}`}
          initial={{ y: -120, opacity: 0, scale: 0.8, x: '-50%' }}
          animate={{ y: 20, opacity: 1, scale: 1, x: '-50%' }}
          exit={{ y: -120, opacity: 0, scale: 0.8, x: '-50%' }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            mass: 0.8,
          }}
          className={`rounded-full shadow-2xl backdrop-blur-xl ${styles.bg} border ${styles.border} ${styles.text}`}
          style={{
            zIndex: 2147483647,
            position: 'fixed',
            top: '20px',
            left: '50%',
            paddingTop: '17.6px', // py-4 (16px) → 10% 증가 = 17.6px
            paddingBottom: '17.6px',
            paddingLeft: '36.8px', // px-8 (32px) → 15% 증가 = 36.8px
            paddingRight: '36.8px',
            boxShadow: isDarkMode
              ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
              : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            pointerEvents: 'none',
            isolation: 'isolate',
            willChange: 'transform, opacity',
            maxWidth: '90vw',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0">
              {styles.icon}
            </div>
            <p className="text-base font-semibold whitespace-nowrap">
              {message}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    portalContainer
  );
}

interface UseDynamicIslandToastReturn {
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
  ToastComponent: React.ReactNode;
}

/**
 * 다이나믹 아일랜드 토스트를 쉽게 사용할 수 있는 훅
 */
export function useDynamicIslandToast(
  isDarkMode: boolean = false,
  duration: number = 2000
): UseDynamicIslandToastReturn {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [toastType, setToastType] = useState<ToastType>('info');
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (newMessage: string, type: ToastType = 'info') => {
    console.log('🔔 showToast 호출됨:', newMessage);
    if (!newMessage || newMessage.trim() === '') {
      console.warn('⚠️ 빈 메시지로 showToast 호출됨');
      return;
    }
    
    // 이전 타이머들 모두 취소
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    
    // 최소 1.5초 보장 (1500ms)
    const minDuration = Math.max(duration, 1500);
    
    // 이미 표시 중이면 메시지만 교체 (애니메이션 유지)
    if (isVisible) {
      setMessage(newMessage);
      setToastType(type);
      // 타이머 리셋하여 새로 시작
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false);
        console.log('❌ isVisible = false로 설정됨');
        clearTimerRef.current = setTimeout(() => {
          setMessage('');
        }, 500);
      }, minDuration);
      return;
    }
    
    // 새로운 메시지 설정 후 표시
    requestAnimationFrame(() => {
      setMessage(newMessage);
      setToastType(type);
      console.log('📝 메시지 설정됨:', newMessage, '타입:', type);
      requestAnimationFrame(() => {
        setIsVisible(true);
        console.log('✅ isVisible = true로 설정됨');
        
        // duration 후 자동으로 숨김 (최소 1.5초 보장)
        hideTimerRef.current = setTimeout(() => {
          setIsVisible(false);
          console.log('❌ isVisible = false로 설정됨');
          // 애니메이션 완료 후 메시지 초기화
          clearTimerRef.current = setTimeout(() => {
            setMessage('');
          }, 500);
        }, minDuration);
      });
    });
  };

  const showSuccess = (newMessage: string) => showToast(newMessage, 'success');
  const showError = (newMessage: string) => showToast(newMessage, 'error');
  const showWarning = (newMessage: string) => showToast(newMessage, 'warning');
  const showInfo = (newMessage: string) => showToast(newMessage, 'info');

  const handleHide = () => {
    setIsVisible(false);
  };

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  return {
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    ToastComponent: (
      <DynamicIslandToast
        message={message}
        isVisible={isVisible}
        duration={duration}
        isDarkMode={isDarkMode}
        type={toastType}
        onHide={handleHide}
      />
    ),
  };
}
