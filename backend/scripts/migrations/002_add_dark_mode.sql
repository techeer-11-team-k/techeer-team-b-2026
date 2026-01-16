-- 다크모드 설정 컬럼 추가
-- accounts 테이블에 is_dark_mode 컬럼 추가 (PostgreSQL 9.6+ IF NOT EXISTS 지원)

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_dark_mode BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN accounts.is_dark_mode IS '다크모드 활성화 여부';
