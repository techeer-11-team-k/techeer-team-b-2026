import { useEffect, useCallback, useState } from 'react';
import { useUser, useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
import { setAuthToken, fetchMyProfile, type UserProfile } from '../services/api';

// Clerk가 없을 때를 위한 대체 훅
const useAuthFallback = () => {
  return {
    isLoaded: true,
    isSignedIn: false,
    user: null,
    profile: null,
    signOut: async () => {},
    getToken: async () => null,
    openSignIn: () => {},
    openSignUp: () => {},
  };
};

// Clerk가 설정되어 있는지 확인
const isClerkConfigured = () => {
  return !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
};

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  imageUrl?: string;
}

export interface UseAuthReturn {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  profile: UserProfile | null;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  openSignIn: () => void;
  openSignUp: () => void;
}

export const useAuth = (): UseAuthReturn => {
  // Clerk가 설정되지 않은 경우 대체 훅 반환
  if (!isClerkConfigured()) {
    return useAuthFallback();
  }

  // Clerk 훅 사용
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const { getToken } = useClerkAuth();
  const { signOut: clerkSignOut, openSignIn, openSignUp } = useClerk();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // 사용자 정보 매핑
  const user: AuthUser | null = clerkUser ? {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress || '',
    firstName: clerkUser.firstName || undefined,
    lastName: clerkUser.lastName || undefined,
    fullName: clerkUser.fullName || undefined,
    imageUrl: clerkUser.imageUrl || undefined,
  } : null;

  // 토큰 갱신 및 API 토큰 설정
  const updateToken = useCallback(async () => {
    if (isSignedIn) {
      const token = await getToken();
      setAuthToken(token);
      return token;
    } else {
      setAuthToken(null);
      return null;
    }
  }, [isSignedIn, getToken]);

  // 프로필 로드
  const loadProfile = useCallback(async () => {
    if (isSignedIn) {
      try {
        const response = await fetchMyProfile();
        setProfile(response.data);
      } catch (error) {
        console.error('Failed to load profile:', error);
        setProfile(null);
      }
    } else {
      setProfile(null);
    }
  }, [isSignedIn]);

  // 로그인 상태 변경 시 토큰 업데이트
  useEffect(() => {
    if (isLoaded) {
      updateToken();
    }
  }, [isLoaded, isSignedIn, updateToken]);

  // 로그인 시 프로필 로드
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      loadProfile();
    }
  }, [isLoaded, isSignedIn, loadProfile]);

  // 로그아웃 함수
  const signOut = useCallback(async () => {
    await clerkSignOut();
    setAuthToken(null);
    setProfile(null);
  }, [clerkSignOut]);

  // 토큰 가져오기 함수
  const getTokenWrapper = useCallback(async () => {
    return await updateToken();
  }, [updateToken]);

  return {
    isLoaded,
    isSignedIn: isSignedIn || false,
    user,
    profile,
    signOut,
    getToken: getTokenWrapper,
    openSignIn: () => openSignIn(),
    openSignUp: () => openSignUp(),
  };
};

export default useAuth;
