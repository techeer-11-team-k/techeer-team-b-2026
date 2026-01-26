-- 마이그레이션: accounts 테이블에 dashboard_bottom_panel_view 컬럼 추가
-- 날짜: 2026-01-26
-- 설명: 대시보드 하단 우측 카드 뷰 개인화 설정을 위한 컬럼 추가

-- 컬럼 추가 (IF NOT EXISTS로 안전하게)
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS dashboard_bottom_panel_view VARCHAR(32) NOT NULL DEFAULT 'regionComparison';

-- 컬럼 코멘트 추가
COMMENT ON COLUMN accounts.dashboard_bottom_panel_view IS '대시보드 하단 우측 카드 뷰 (policyNews|transactionVolume|marketPhase|regionComparison)';
