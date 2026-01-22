/**
 * 프로필 조회 및 수정 훅
 * 
 * 백엔드 API를 사용하여 사용자 프로필을 조회하고 수정합니다.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/clerk';
import apiClient, { ApiResponse } from '@/lib/api';

interface Profile {
  account_id: number;
  clerk_user_id: string;
  email: string;
  created_at: string;
}

interface UpdateProfileData {
}

export function useProfile() {
  // useAuth 훅은 항상 호출되어야 함 (React 훅 규칙)
  const auth = useAuth();
  const isSignedIn = auth?.isSignedIn || false;
  const getToken = auth?.getToken || null;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 프로필 조회
   */
  const fetchProfile = async () => {
    if (!isSignedIn || !getToken) {
      setProfile(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Clerk 토큰 가져오기
      const token = await getToken();
      if (!token) {
        setProfile(null);
        return;
      }
      
      const response = await apiClient.get<ApiResponse<Profile>>('/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setProfile(response.data.data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail?.message || '프로필을 불러오는데 실패했습니다.';
      setError(errorMessage);
      console.error('프로필 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 프로필 수정
   */
  const updateProfile = async (data: UpdateProfileData) => {
    if (!isSignedIn || !getToken) {
      throw new Error('로그인이 필요합니다.');
    }

    setLoading(true);
    setError(null);

    try {
      // Clerk 토큰 가져오기
      const token = await getToken();
      if (!token) {
        throw new Error('인증 토큰을 가져올 수 없습니다.');
      }
      
      const response = await apiClient.patch<ApiResponse<Profile>>('/auth/me', data, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setProfile(response.data.data);
      return response.data.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail?.message || '프로필 수정에 실패했습니다.';
      setError(errorMessage);
      console.error('프로필 수정 실패:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 로그인 상태가 변경되면 프로필 조회
  useEffect(() => {
    if (isSignedIn && getToken) {
      fetchProfile();
    } else {
      setProfile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  return {
    profile,
    loading,
    error,
    fetchProfile,
    updateProfile,
  };
}
