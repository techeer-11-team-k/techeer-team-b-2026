/**
 * PWA 유틸 (WebView 감지, 설치 프롬프트 등)
 * - Expo/RN WebView 안에서는 PWA 설치 유도 UI 숨길 때 사용
 * - PWA 설치 프롬프트 처리
 */

declare global {
  interface Window {
    ReactNativeWebView?: unknown;
    deferredPrompt?: BeforeInstallPromptEvent;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Expo/RN WebView 내부에서 실행 중인지 여부 */
export function isWebView(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.ReactNativeWebView);
}

/** PWA 설치 가능 여부 확인 */
export function isPWAInstallable(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window;
}

/** PWA 설치 프롬프트 이벤트 저장 */
export function saveInstallPrompt(event: BeforeInstallPromptEvent): void {
  if (typeof window !== 'undefined') {
    window.deferredPrompt = event;
  }
}

/** PWA 설치 프롬프트 가져오기 */
export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  return window.deferredPrompt || null;
}

/** PWA 설치 프롬프트 제거 */
export function clearInstallPrompt(): void {
  if (typeof window !== 'undefined') {
    window.deferredPrompt = null;
  }
}

/** PWA 설치 프롬프트 표시 */
export async function showInstallPrompt(): Promise<boolean> {
  const prompt = getInstallPrompt();
  if (!prompt) {
    console.warn('PWA 설치 프롬프트를 사용할 수 없습니다');
    return false;
  }

  try {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    clearInstallPrompt();
    return outcome === 'accepted';
  } catch (error) {
    console.error('PWA 설치 프롬프트 오류:', error);
    clearInstallPrompt();
    return false;
  }
}

/** 이미 PWA로 설치되어 있는지 확인 */
export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true ||
         document.referrer.includes('android-app://');
}
