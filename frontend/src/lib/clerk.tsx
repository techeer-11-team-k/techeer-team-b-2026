/**
 * Clerk 인증 설정 및 Provider
 * 
 * Clerk를 사용하여 인증 기능을 제공합니다.
 */
import React from 'react';
import { 
  ClerkProvider, 
  useUser as useClerkUser, 
  useAuth as useClerkAuth, 
  SignInButton, 
  SignOutButton, 
  SignUpButton 
} from '@clerk/clerk-react';

// Clerk Publishable Key
// 환경 변수에서 가져오거나, 직접 설정할 수 있습니다.
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

// 디버깅: 환경 변수 로드 확인
if (typeof window !== 'undefined') {
  console.log('🔑 Clerk Key 로드 상태:', {
    hasKey: !!CLERK_PUBLISHABLE_KEY,
    keyLength: CLERK_PUBLISHABLE_KEY?.length || 0,
    keyPrefix: CLERK_PUBLISHABLE_KEY?.substring(0, 10) || '없음',
    envVars: Object.keys(import.meta.env).filter(k => k.includes('CLERK'))
  });
}

/**
 * Clerk 인증 Provider 컴포넌트
 * 
 * 앱 전체를 감싸서 Clerk 인증 기능을 사용할 수 있게 합니다.
 */
export function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  // Clerk Key가 없으면 Provider 없이 렌더링
  if (!CLERK_PUBLISHABLE_KEY || CLERK_PUBLISHABLE_KEY.trim() === '') {
    console.warn(
      '⚠️ Clerk Publishable Key가 설정되지 않았습니다. ' +
      '환경 변수 VITE_CLERK_PUBLISHABLE_KEY를 설정해주세요. ' +
      '인증 기능은 작동하지 않지만 앱은 정상적으로 실행됩니다.'
    );
    // Provider 없이 렌더링 (훅은 안전하게 처리됨)
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}

// 안전한 useAuth 래퍼 (Provider가 없을 때를 대비)
// React 훅 규칙을 준수하기 위해 항상 같은 순서로 훅 호출
export function useAuth() {
  const hasKey = CLERK_PUBLISHABLE_KEY && CLERK_PUBLISHABLE_KEY.trim() !== '';
  
  // 항상 훅을 호출하되, Provider가 없으면 오류가 발생할 수 있으므로 try-catch로 감싸지 않음
  // 대신 Provider가 없을 때는 기본값을 반환하는 별도 훅 사용
  if (!hasKey) {
    // Provider가 없을 때 기본값 반환
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return React.useMemo(() => ({
      isSignedIn: false,
      userId: null,
      getToken: async () => null,
      signOut: async () => {},
    }), []) as ReturnType<typeof useClerkAuth>;
  }
  
  // Provider가 있으면 정상적으로 훅 호출
  return useClerkAuth();
}

// 안전한 useUser 래퍼 (Provider가 없을 때를 대비)
export function useUser() {
  const hasKey = CLERK_PUBLISHABLE_KEY && CLERK_PUBLISHABLE_KEY.trim() !== '';
  
  if (!hasKey) {
    // Provider가 없을 때 기본값 반환
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return React.useMemo(() => ({
      isSignedIn: false,
      user: null,
      isLoaded: false,
    }), []) as ReturnType<typeof useClerkUser>;
  }
  
  // Provider가 있으면 정상적으로 훅 호출
  return useClerkUser();
}

// 안전한 Clerk 컴포넌트 래퍼들 (Provider가 없을 때를 대비)
const CLERK_HAS_KEY = CLERK_PUBLISHABLE_KEY && CLERK_PUBLISHABLE_KEY.trim() !== '';

// 안전한 SignInButton 래퍼
export function SafeSignInButton({ children, ...props }: React.ComponentProps<typeof SignInButton>) {
  if (!CLERK_HAS_KEY) {
    // 키가 없을 때도 버튼을 클릭 가능하게 만들되, 클릭 시 안내 메시지 표시
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      alert('인증 기능을 사용하려면 Clerk Publishable Key를 설정해주세요.\n\nfrontend/.env 파일에 다음을 추가하세요:\nVITE_CLERK_PUBLISHABLE_KEY=your_key_here');
    };
    
    // children을 클론하여 onClick 핸들러 추가
    return (
      <div onClick={handleClick} style={{ display: 'inline-block' }}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              onClick: handleClick,
              style: { ...(child.props.style || {}), cursor: 'pointer' },
            });
          }
          return child;
        })}
      </div>
    );
  }
  return <SignInButton {...props}>{children}</SignInButton>;
}

// 안전한 SignOutButton 래퍼
export function SafeSignOutButton({ children, ...props }: React.ComponentProps<typeof SignOutButton>) {
  if (!CLERK_HAS_KEY) {
    // 키가 없을 때는 버튼을 비활성화
    return (
      <div style={{ display: 'inline-block', opacity: 0.5, cursor: 'not-allowed' }}>
        {children}
      </div>
    );
  }
  return <SignOutButton {...props}>{children}</SignOutButton>;
}

// 안전한 SignUpButton 래퍼
export function SafeSignUpButton({ children, ...props }: React.ComponentProps<typeof SignUpButton>) {
  if (!CLERK_HAS_KEY) {
    // 키가 없을 때도 버튼을 클릭 가능하게 만들되, 클릭 시 안내 메시지 표시
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      alert('인증 기능을 사용하려면 Clerk Publishable Key를 설정해주세요.\n\nfrontend/.env 파일에 다음을 추가하세요:\nVITE_CLERK_PUBLISHABLE_KEY=your_key_here');
    };
    
    // children을 클론하여 onClick 핸들러 추가
    return (
      <div onClick={handleClick} style={{ display: 'inline-block' }}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              onClick: handleClick,
              style: { ...(child.props.style || {}), cursor: 'pointer' },
            });
          }
          return child;
        })}
      </div>
    );
  }
  return <SignUpButton {...props}>{children}</SignUpButton>;
}

// 원본 컴포넌트들도 export (키가 있을 때만 사용)
export { SignInButton, SignOutButton, SignUpButton };
