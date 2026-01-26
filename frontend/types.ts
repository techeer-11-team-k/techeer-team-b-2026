import React from 'react';

// ============================================
// 공통 타입
// ============================================

/** Nullable 타입 헬퍼 */
export type Nullable<T> = T | null;

/** Optional 타입 헬퍼 */
export type Optional<T> = T | undefined;

/** 비동기 함수 반환 타입 */
export type AsyncReturnType<T extends (...args: unknown[]) => Promise<unknown>> = 
  T extends (...args: unknown[]) => Promise<infer R> ? R : never;

// ============================================
// 자산/부동산 관련 타입
// ============================================

/**
 * 부동산 자산 정보
 */
export interface Property {
  /** 고유 ID (문자열) */
  id: string;
  /** API에서 반환하는 아파트 ID */
  aptId?: number;
  /** 아파트/자산 이름 */
  name: string;
  /** 위치 (주소) */
  location: string;
  /** 면적 (m²) */
  area: number;
  /** 현재 시세 (만원 단위) */
  currentPrice: number;
  /** 매입가 (만원 단위) */
  purchasePrice: number;
  /** 매입일 (YYYY-MM 형식) */
  purchaseDate: string;
  /** 변동률 (%) */
  changeRate: number;
  // 투자 지표
  /** 전세가 (만원 단위) */
  jeonsePrice?: number;
  /** 갭 (현재가 - 전세가, 만원 단위) */
  gapPrice?: number;
  /** 전세가율 (%) */
  jeonseRatio?: number;
  /** 대출금 (만원 단위) */
  loan?: number;
}

/**
 * 자산 그룹 (포트폴리오 분류)
 */
export interface AssetGroup {
  /** 그룹 ID */
  id: string;
  /** 그룹 이름 */
  name: string;
  /** 그룹에 포함된 자산 목록 */
  assets: Property[];
}

/**
 * 지역 정보
 */
export interface Region {
  /** 지역 ID */
  regionId: number;
  /** 지역명 */
  regionName: string;
  /** 지역 코드 */
  regionCode: string;
  /** 시/도명 */
  cityName: string;
  /** 전체 주소 */
  fullName?: string;
  /** 지역 타입 (city, sigungu, dong) */
  locationType?: 'city' | 'sigungu' | 'dong';
}

// ============================================
// 차트 관련 타입
// ============================================

/**
 * 차트 데이터 포인트
 */
export interface ChartDataPoint {
  /** 날짜 (ISO 8601 형식) */
  date: string;
  /** 주 데이터 값 */
  value: number;
  /** 비교용 보조 데이터 값 */
  value2?: number;
}

/**
 * 시계열 차트 데이터
 */
export interface TimeSeriesData {
  /** 시간 (ISO 8601 형식) */
  time: string;
  /** 값 */
  value: number;
}

// ============================================
// 네비게이션 관련 타입
// ============================================

/** 뷰 타입 */
export type ViewType = 'dashboard' | 'map' | 'compare' | 'stats' | 'portfolio' | 'ranking';

/**
 * 상세 이동(자산 클릭) 옵션
 */
export interface PropertyClickOptions {
  /** 상세 진입 즉시 내 자산 수정/추가 모달 오픈 */
  edit?: boolean;
}

/**
 * Lucide 아이콘 Props (lucide-react 호환)
 */
export interface LucideIconProps {
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
  color?: string;
}

/**
 * 탭 아이템
 */
export interface TabItem {
  /** 탭 ID (뷰 타입) */
  id: ViewType;
  /** 탭 라벨 */
  label: string;
  /** 탭 아이콘 컴포넌트 (lucide-react 호환) */
  icon: React.ComponentType<LucideIconProps>;
}

// ============================================
// 컴포넌트 Props 타입
// ============================================

/**
 * 뷰 컴포넌트 공통 Props
 */
export interface ViewProps {
  /** 자산 클릭 핸들러 */
  onPropertyClick: (id: string, options?: PropertyClickOptions) => void;
  /** 전체 포트폴리오 보기 핸들러 */
  onViewAllPortfolio?: () => void;
  /** 도크 토글 핸들러 */
  onToggleDock?: (visible?: boolean) => void;
  /**
   * (모바일) 설정 패널을 외부(레이아웃 헤더 등)에서 열기 위한 핸들러 등록용
   * Dashboard 내부에서 설정 열기 함수(콜백)를 주입한다.
   */
  onSettingsClickRef?: (handler: () => void) => void;
}

/**
 * 모달 컴포넌트 공통 Props
 */
export interface ModalProps {
  /** 모달 열림 상태 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** 모달 제목 */
  title?: string;
  /** 자식 요소 */
  children: React.ReactNode;
}

// ============================================
// API 응답 타입
// ============================================

/**
 * API 응답 기본 구조
 */
export interface ApiResponse<T> {
  /** 성공 여부 */
  success: boolean;
  /** 응답 데이터 */
  data: T;
  /** 메타 정보 */
  meta?: {
    /** 총 개수 */
    total?: number;
    /** 페이지 크기 */
    limit?: number;
    /** 오프셋 */
    offset?: number;
    [key: string]: unknown;
  };
}

/**
 * 페이지네이션 정보
 */
export interface Pagination {
  /** 현재 페이지 (1부터 시작) */
  page: number;
  /** 페이지 크기 */
  pageSize: number;
  /** 총 개수 */
  total: number;
  /** 총 페이지 수 */
  totalPages: number;
}

// ============================================
// 사용자 관련 타입
// ============================================

/**
 * 사용자 정보
 */
export interface User {
  /** 사용자 ID */
  id: string;
  /** 이메일 */
  email: string;
  /** 닉네임 */
  nickname?: string;
  /** 프로필 이미지 URL */
  profileImageUrl?: string;
  /** 관리자 여부 */
  isAdmin?: boolean;
}